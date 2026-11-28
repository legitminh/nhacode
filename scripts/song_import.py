#!/usr/bin/env python3
"""Import songs from MusicXML or MIDI files into the song library.

  python3 scripts/song_import.py add FILE [--id ID] [--title T] [--composer C] [--tags a,b]
                                          [--grid auto|N] [--split MIDI] [--hands auto|tracks|split]
                                          [--tempo-scale X] [--pickup QUARTERS]
  python3 scripts/song_import.py info FILE [options]   # dry run: what add would do, nothing written
  python3 scripts/song_import.py set ID key=value ...  # change an imported song's options and rebuild it
  python3 scripts/song_import.py rebuild [ID ...]      # re-convert every imported song (or the ones named)
  python3 scripts/song_import.py list                  # imported songs and their options

The format comes from the file's content, not its name: MIDI (MThd), compressed MusicXML
(.mxl, a zip) or plain MusicXML. MusicXML goes through the same parser as PDMX scores.
MIDI is quantized to a grid and split into hands, then simplified the same way.

`add` copies the file to scripts/imports/<id>.<ext> and records it, with its options, in
scripts/imports.json, so `rebuild` can redo every import after the conversion changes.

Options (all saved per song):
  grid         ticks per quarter note to snap MIDI to; auto picks the coarsest grid that
               fits the notes (from 1 up to 48, triplets included). Default auto.
  hands        tracks: one hand per track (a track named left/LH/bass, or else the lower
               of two tracks, is the left hand); split: by pitch; auto: tracks when the
               file has two or more note tracks, else split. Default auto.
  split        lowest right-hand MIDI note when splitting by pitch. Default 60 (middle C).
  tempo_scale  multiply every tempo (0.8 = 20% slower). Default 1.
  pickup       length of a pickup (anacrusis) in quarter notes, for MIDI, whose files don't
               mark one: the first measure is that long. Default 0.
"""
import bisect
import hashlib
import json
import re
import struct
import sys
import unicodedata
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pdmx  # noqa: E402

ROOT = pdmx.ROOT
IMPORTS = ROOT / 'scripts' / 'imports'
MANIFEST = ROOT / 'scripts' / 'imports.json'
DEFAULTS = {'grid': 'auto', 'hands': 'auto', 'split': 60, 'tempo_scale': 1, 'pickup': 0}
GRIDS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 48]


# --- Files ------------------------------------------------------------------------------

def kind_of(data):
    if data[:4] == b'MThd':
        return 'midi'
    if data[:2] == b'PK':
        return 'mxl'
    if data.lstrip()[:1] == b'<':
        return 'musicxml'
    raise SystemExit('Not a MIDI or MusicXML file.')


EXTENSIONS = {'midi': '.mid', 'mxl': '.mxl', 'musicxml': '.musicxml'}


def slug(text):
    text = unicodedata.normalize('NFKD', text)
    text = re.sub(r'[^a-z0-9]+', '-', ''.join(c for c in text if not unicodedata.combining(c)).lower()).strip('-')
    return text[:48].strip('-')


def load_manifest():
    return json.loads(MANIFEST.read_text()) if MANIFEST.exists() else []


def save_manifest(entries):
    MANIFEST.write_text(json.dumps(sorted(entries, key=lambda e: e['id']), ensure_ascii=False, indent=2) + '\n')


# --- MIDI -------------------------------------------------------------------------------

def read_varlen(data, i):
    value = 0
    while True:
        byte = data[i]
        i += 1
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            return value, i


def parse_midi(data):
    """Return (ticks per quarter, tracks): each track has a name and its events as (tick, kind, payload)."""
    if data[:4] != b'MThd':
        raise SystemExit('Not a MIDI file.')
    length = struct.unpack('>I', data[4:8])[0]
    _, count, division = struct.unpack('>HHH', data[8:14])
    if division & 0x8000:
        raise SystemExit('SMPTE-timed MIDI files are not supported.')
    i = 8 + length
    tracks = []
    for _ in range(count):
        if data[i:i + 4] != b'MTrk':
            break
        size = struct.unpack('>I', data[i + 4:i + 8])[0]
        chunk, i = data[i + 8:i + 8 + size], i + 8 + size
        tick, j, status, name, events = 0, 0, 0, '', []
        while j < len(chunk):
            delta, j = read_varlen(chunk, j)
            tick += delta
            if chunk[j] & 0x80:
                status = chunk[j]
                j += 1
            if status == 0xFF:
                meta = chunk[j]
                size_, j = read_varlen(chunk, j + 1)
                body = chunk[j:j + size_]
                j += size_
                if meta == 0x2F:
                    break
                if meta == 0x03 and not name:
                    name = body.decode('utf-8', 'replace').strip()
                elif meta == 0x51 and len(body) == 3:
                    events.append((tick, 'tempo', 60_000_000 / int.from_bytes(body, 'big')))
                elif meta == 0x58 and len(body) >= 2:
                    events.append((tick, 'time', (body[0], 2 ** body[1])))
                status = 0  # meta events cancel running status
            elif status in (0xF0, 0xF7):
                size_, j = read_varlen(chunk, j)
                j += size_
                status = 0
            else:
                kind, channel = status & 0xF0, status & 0x0F
                width = 1 if kind in (0xC0, 0xD0) else 2
                args = chunk[j:j + width]
                j += width
                if kind == 0x90 and args[1] > 0:
                    events.append((tick, 'on', (channel, args[0])))
                elif kind == 0x80 or (kind == 0x90 and args[1] == 0):
                    events.append((tick, 'off', (channel, args[0])))
                elif kind == 0xB0 and args[0] == 64:
                    events.append((tick, 'pedal', (channel, args[1] >= 64)))
        tracks.append({'name': name, 'events': events})
    return division, tracks


def midi_notes(tracks):
    """Notes as dicts (start, end, midi, voice) in source ticks; a voice is a (track, channel) pair."""
    notes = []
    for t, track in enumerate(tracks):
        held = {}
        for tick, kind, payload in sorted(track['events'], key=lambda e: (e[0], e[1] != 'off')):
            if kind == 'on' and payload[0] != 9:  # channel 10 is drums
                held.setdefault(payload, []).append(tick)
            elif kind == 'off' and held.get(payload):
                start = held[payload].pop(0)
                if tick > start:
                    notes.append({'start': start, 'end': tick, 'midi': payload[1], 'voice': (t, payload[0])})
    return notes


def choose_grid(notes, division):
    """The coarsest grid (ticks per quarter) that fits the notes, or None when none does.

    A grid fits when snapping moves under 2% of the onsets by more than a 64th note (1/16
    of a quarter) and leaves no note with zero length. Releases don't count: players and
    MIDI exports let go early or late, and a note's end snaps to the grid either way.
    """
    times = [n['start'] for n in notes]
    for grid in GRIDS:
        step = division / grid
        off = sum(1 for x in times if abs(x - round(x / step) * step) > division / 16) / len(times)
        collapsed = any(round(n['end'] / step) <= round(n['start'] / step) for n in notes)
        if off < 0.02 and not collapsed:
            return grid
    return None


LEFT_NAMES = re.compile(r'left|\blh\b|bass|lower|左|links|gauche|sinistra|izquierda', re.IGNORECASE)
RIGHT_NAMES = re.compile(r'right|\brh\b|treble|upper|melody|右|rechts|droite|destra|derecha', re.IGNORECASE)


def assign_hands(notes, tracks, mode, split):
    """Set note['left'] for each note. Returns a short description of what was done."""
    voices = {}
    for note in notes:
        voices.setdefault(note['voice'], []).append(note['midi'])
    if mode == 'auto':
        mode = 'tracks' if len(voices) >= 2 else 'split'
    if mode == 'split':
        for note in notes:
            note['left'] = note['midi'] < split
        return f'split by pitch at {split}'
    if mode != 'tracks':
        raise SystemExit(f'Unknown hands mode {mode!r}: use auto, tracks or split.')
    mean = {voice: sum(p) / len(p) for voice, p in voices.items()}
    named = {}
    for voice in voices:
        name = tracks[voice[0]]['name']
        if LEFT_NAMES.search(name):
            named[voice] = True
        elif RIGHT_NAMES.search(name):
            named[voice] = False
    lowest = min(mean, key=mean.get)
    middle = sorted(mean.values())[len(mean) // 2] if len(mean) > 2 else None
    left = {}
    for voice in voices:
        if voice in named:
            left[voice] = named[voice]
        elif middle is None:
            left[voice] = voice == lowest
        else:
            left[voice] = mean[voice] < middle
    for note in notes:
        note['left'] = left[note['voice']]
    return 'by track: ' + ', '.join(
        f"{tracks[v[0]]['name'] or f'track {v[0]}'}{f' ch{v[1] + 1}' if sum(1 for w in voices if w[0] == v[0]) > 1 else ''}"
        f" → {'left' if left[v] else 'right'}" for v in sorted(voices))


def midi_to_measures(data, options):
    """Quantize a MIDI file into parse_score's measure shape: (ticks per quarter, measures, report)."""
    division, tracks = parse_midi(data)
    notes = midi_notes(tracks)
    if not notes:
        raise SystemExit('The MIDI file has no notes.')
    grid = choose_grid(notes, division) if options['grid'] == 'auto' else int(options['grid'])
    loose = grid is None
    grid = grid or 4  # loosely played (a recording): 16th notes, unless the grid is set
    step = division / grid
    q = lambda tick: round(tick / step)  # source ticks -> grid ticks
    hands = assign_hands(notes, tracks, options['hands'], int(options['split']))
    controls = sorted((e for track in tracks for e in track['events'] if e[1] in ('tempo', 'time', 'pedal')),
                      key=lambda e: e[0])

    # Snap, drop notes that collapse or duplicate another (same key, start and hand).
    seen, snapped = set(), []
    for note in sorted(notes, key=lambda n: (n['start'], n['midi'])):
        start, end = q(note['start']), q(note['end'])
        end = max(end, start + 1)
        key = (start, note['midi'], note['left'])
        if key in seen:
            continue
        seen.add(key)
        snapped.append({'start': start, 'end': end, 'midi': note['midi'], 'left': note['left']})
    # A note held into the next onset of the same key ends there (overlaps are MIDI legato noise).
    by_key = {}
    for note in snapped:
        by_key.setdefault((note['midi'], note['left']), []).append(note)
    for same in by_key.values():
        for a, b in zip(same, same[1:]):
            a['end'] = min(a['end'], b['start']) if b['start'] > a['start'] else a['end']
    last_tick = max(n['end'] for n in snapped)

    # Measure boundaries from time signatures (default 4/4), with an optional pickup first.
    meters = [(q(t), payload) for t, kind, payload in controls if kind == 'time'] or [(0, (4, 4))]
    if meters[0][0] > 0:
        meters.insert(0, (0, (4, 4)))
    pickup = round(float(options['pickup']) * grid)
    meter_at = lambda tick: next(m for t, m in reversed(meters) if t <= tick)
    bounds, tick, previous = [], 0, None  # (start tick, length, time signature where it changes)
    while not bounds or tick < last_tick:
        meter = meter_at(tick)
        length = pickup if not bounds and pickup else meter[0] * grid * 4 // meter[1]
        bounds.append((tick, length, meter if meter != previous else None))
        previous, tick = meter, tick + length

    measures = []
    for index, (start, length, time) in enumerate(bounds):
        measure = {'number': str(index + (0 if pickup else 1)), 'duration': length, 'notes': [], 'spans': [], 'marks': []}
        if time:
            measure['time'] = list(time)
        measures.append(measure)
    starts = [b[0] for b in bounds]

    def locate(tick):
        index = max(0, bisect.bisect_right(starts, tick) - 1)
        return index, tick - starts[index]

    for note in snapped:
        tick, tied = note['start'], False
        while tick < note['end']:
            index, offset = locate(tick)
            measure = measures[index]
            piece = min(note['end'], starts[index] + measure['duration']) - tick
            if piece <= 0:
                break
            item = {'measure': index, 'start': offset, 'duration': piece, 'midi': note['midi'],
                    'hand': 'left' if note['left'] else 'right', 'art': []}
            if tied:
                item['tied'] = True
            measure['notes'].append(item)
            measure['spans'].append((offset, piece))
            tick, tied = tick + piece, True

    for tick, kind, payload in controls:
        index, offset = locate(q(tick))
        measure = measures[index]
        if kind == 'tempo':
            qpm = round(payload, 2)
            pdmx.add_mark(measure, offset, 'qpm', str(qpm))
            # Shown once (simplify shows a playback tempo only until a tempo is on the sheet).
            pdmx.add_mark(measure, offset, 'sound-tempo', f'bpm={round(qpm)}')
        elif kind == 'pedal':
            pdmx.add_mark(measure, offset, 'pedal', 'start' if payload[1] else 'stop')
    # Repeated pedal-down (or up) messages are one mark; an up and down on one tick is a change.
    state = None
    for measure in measures:
        cleaned = []
        for mark in measure['marks']:
            if mark['kind'] != 'pedal':
                cleaned.append(mark)
                continue
            down = mark['text'] == 'start'
            if down == state:
                continue
            state = down
            last = next((m for m in reversed(cleaned) if m['kind'] == 'pedal'), None)
            if down and last and last['text'] == 'stop' and last['start'] == mark['start']:
                last['text'] = 'change'  # up and straight back down
                continue
            cleaned.append(mark)
        measure['marks'] = cleaned
    report = (f"MIDI: {len(tracks)} tracks, {len(snapped)} notes, grid {grid}/quarter "
              f"({'set' if options['grid'] != 'auto' else 'auto; timing is loose, so set grid if this is off' if loose else 'auto'}), hands {hands}, {len(measures)} measures")
    return grid, measures, report


# --- MusicXML ---------------------------------------------------------------------------

def musicxml_to_measures(data, kind):
    xml = pdmx.musicxml_from_mxl(data) if kind == 'mxl' else data
    tpq, measures = pdmx.parse_score(xml)
    notes = sum(len(m['notes']) for m in measures)
    return tpq, measures, f'MusicXML: {notes} notes, {len(measures)} measures'


def musicxml_title(data, kind):
    import xml.etree.ElementTree as ET
    try:
        root = pdmx.strip_namespaces(ET.fromstring(pdmx.musicxml_from_mxl(data) if kind == 'mxl' else data))
    except (ET.ParseError, zipfile.BadZipFile, StopIteration):
        return '', ''
    title = root.findtext('work/work-title') or root.findtext('movement-title') or ''
    composer = next((c.text for c in root.iter('creator') if c.get('type') == 'composer' and c.text), '')
    return title.strip(), composer.strip()


# --- Commands ---------------------------------------------------------------------------

def convert(entry, write=True):
    path = ROOT / entry['file']
    data = path.read_bytes()
    kind = kind_of(data)
    options = {**DEFAULTS, **entry.get('options', {})}
    if kind == 'midi':
        tpq, measures, report = midi_to_measures(data, options)
    else:
        tpq, measures, report = musicxml_to_measures(data, kind)
    print(f"{entry['id']}: {report}")
    if write:
        source = {'dataset': 'import', 'path': entry['file']}
        if entry.get('license'):
            source['license'] = entry['license']
        if entry.get('url'):
            source['url'] = entry['url']
        pdmx.write_song(entry['id'], entry['title'], entry.get('composer', ''), entry.get('tags') or ['western'],
                        tpq, measures, source, float(options['tempo_scale']))


def parse_flags(args):
    flags, rest = {}, []
    i = 0
    while i < len(args):
        if args[i].startswith('--'):
            key = args[i][2:].replace('-', '_')
            flags[key] = args[i + 1]
            i += 2
        else:
            rest.append(args[i])
            i += 1
    return flags, rest


def typed(key, value):
    if key in ('split',):
        return int(value)
    if key in ('tempo_scale', 'pickup'):
        return float(value)
    if key == 'grid':
        return value if value == 'auto' else int(value)
    if key == 'tags':
        return [t.strip() for t in value.split(',') if t.strip()] if isinstance(value, str) else value
    return value


def entry_from(file, flags):
    source = Path(file).expanduser()
    data = source.read_bytes()
    kind = kind_of(data)
    title, composer = musicxml_title(data, kind) if kind != 'midi' else ('', '')
    title = flags.get('title') or title or re.sub(r'[_]+', ' ', source.stem).strip()
    song_id = flags.get('id') or slug(title) or 'song-' + hashlib.sha1(data).hexdigest()[:8]
    entry = {'id': song_id, 'title': title, 'composer': flags.get('composer', composer),
             'tags': typed('tags', flags['tags']) if 'tags' in flags else ['western'],
             'file': f'scripts/imports/{song_id}{EXTENSIONS[kind]}'}
    for key in ('license', 'url'):
        if key in flags:
            entry[key] = flags[key]
    options = {key: typed(key, flags[key]) for key in DEFAULTS if key in flags}
    if options:
        entry['options'] = options
    return entry, data


def add(file, flags, write=True):
    entry, data = entry_from(file, flags)
    if not write:
        tmp = IMPORTS / '.info'
        IMPORTS.mkdir(parents=True, exist_ok=True)
        tmp.write_bytes(data)
        try:
            convert({**entry, 'file': str(tmp.relative_to(ROOT))}, write=False)
        finally:
            tmp.unlink()
        print(json.dumps(entry, ensure_ascii=False))
        return
    existing = {e['id'] for e in pdmx_ids()}
    if entry['id'] in existing:
        raise SystemExit(f"{entry['id']} is a PDMX song; pass a different --id.")
    entries = [e for e in load_manifest() if e['id'] != entry['id']]
    IMPORTS.mkdir(parents=True, exist_ok=True)
    for old in IMPORTS.glob(f"{entry['id']}.*"):
        old.unlink()
    (ROOT / entry['file']).write_bytes(data)
    entries.append(entry)
    save_manifest(entries)
    convert(entry)


def pdmx_ids():
    path = ROOT / 'scripts' / 'songs.json'
    return json.loads(path.read_text()) if path.exists() else []


def set_options(song_id, pairs):
    entries = load_manifest()
    entry = next((e for e in entries if e['id'] == song_id), None)
    if not entry:
        raise SystemExit(f'{song_id} is not an imported song.')
    for pair in pairs:
        key, _, value = pair.partition('=')
        key = key.replace('-', '_')
        if key in DEFAULTS:
            entry.setdefault('options', {})[key] = typed(key, value)
        elif key in ('title', 'composer', 'tags', 'license', 'url'):
            entry[key] = typed(key, value)
        else:
            raise SystemExit(f'Unknown setting {key!r}.')
    save_manifest(entries)
    convert(entry)


def rebuild(ids):
    entries = load_manifest()
    for entry in entries:
        if not ids or entry['id'] in ids:
            convert(entry)


def remove(song_id):
    entries = load_manifest()
    entry = next((e for e in entries if e['id'] == song_id), None)
    if not entry:
        raise SystemExit(f'{song_id} is not an imported song.')
    save_manifest([e for e in entries if e['id'] != song_id])
    (ROOT / entry['file']).unlink(missing_ok=True)
    (pdmx.SONGS / f'{song_id}.json').unlink(missing_ok=True)
    index_path = pdmx.SONGS / 'index.json'
    index = [e for e in json.loads(index_path.read_text()) if e['id'] != song_id]
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
    print(f'Removed {song_id}.')


if __name__ == '__main__':
    command, *args = sys.argv[1:] or ['help']
    flags, rest = parse_flags(args)
    if command == 'add':
        add(rest[0], flags)
    elif command == 'info':
        add(rest[0], flags, write=False)
    elif command == 'set':
        set_options(rest[0], rest[1:])
    elif command == 'rebuild':
        rebuild(rest)
    elif command == 'remove':
        remove(rest[0])
    elif command == 'list':
        for entry in load_manifest():
            print(f"{entry['id']}\t{entry['title']}\t{entry['file']}\t{json.dumps(entry.get('options', {}))}")
    else:
        print(__doc__)
