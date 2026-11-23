#!/usr/bin/env python3
"""Fetch scores from PDMX into a local SQLite cache and simplify them for the sheet screen.

PDMX (https://github.com/pnlong/PDMX, data on Zenodo record 15571083) ships its
MusicXML as one large mxl.tar.gz. This script streams that archive and stops as
soon as the requested score is found, so a song costs a partial download, not 1.9 GB.

  python3 scripts/pdmx.py search "fur elise"           # list candidates from PDMX.csv
  python3 scripts/pdmx.py fetch fur-elise "fur elise"  # cache the best match's MXL in data/pdmx/pdmx.sqlite
  python3 scripts/pdmx.py simplify fur-elise "Für Elise" # write src/songs/fur-elise.json
  python3 scripts/pdmx.py sync                         # fetch + simplify everything in scripts/songs.json

The raw MusicXML stays in data/ (gitignored). Only the simplified JSON, which is
just which key is pressed when, is committed.
"""
import csv
import io
import json
import math
import re
import sqlite3
import sys
import tarfile
import time
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'pdmx'
DB = DATA / 'pdmx.sqlite'
CSV = DATA / 'PDMX.csv'
SONGS = ROOT / 'src' / 'songs'
RECORD = 'https://zenodo.org/api/records/15571083/files'

csv.field_size_limit(sys.maxsize)


def db():
    DATA.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.execute('''create table if not exists scores (
      id text primary key, path text not null, title text, composer text, license text,
      metadata text, mxl blob not null, fetched_at real not null)''')
    columns = {row[1] for row in conn.execute('pragma table_info(scores)')}
    if 'tags' not in columns:
        conn.execute("alter table scores add column tags text not null default '[]'")
    return conn


def normalize(text):
    text = unicodedata.normalize('NFKD', text or '')
    return re.sub(r'[^a-z0-9 ]+', ' ', ''.join(c for c in text if not unicodedata.combining(c)).lower()).strip()


def ensure_csv():
    if not CSV.exists():
        DATA.mkdir(parents=True, exist_ok=True)
        print('Downloading PDMX.csv (225 MB)...', file=sys.stderr)
        urllib.request.urlretrieve(f'{RECORD}/PDMX.csv/content', CSV)


def candidates(query):
    ensure_csv()
    words = normalize(query).split()
    rows = []
    with open(CSV, newline='', encoding='utf-8') as handle:
        for row in csv.DictReader(handle):
            name = normalize(' '.join([row['title'], row['song_name']]))
            if all(word in name for word in words) and row['mxl'] != 'NA':
                rows.append(row)

    def score(row):
        number = lambda key: float(row[key]) if row[key] not in ('', 'NA') else 0.0
        clean = row['license_conflict'] == 'False'
        single = row['n_tracks'] == '1'
        return (clean, single, row['is_best_unique_arrangement'] == 'True',
                number('n_ratings') * number('rating') + number('n_favorites'), number('n_views'))

    return sorted(rows, key=score, reverse=True)


EASTERN_WORDS = ('chinese', 'china', 'japanese', 'japan', 'korean', 'korea', 'indian', 'india', 'arabic', 'arab',
                 'persian', 'vietnamese', 'asia', 'asian', 'oriental', 'middleeast', 'koto', 'guzheng', 'erhu',
                 'raga', 'anime', 'thai', 'arirang', 'indonesian', 'gamelan', 'pipa', 'shamisen')
ORCHESTRAL_WORDS = ('orchestra', 'orchestral', 'symphony', 'symphonic', 'philharmonic')


def tags_for(row):
    """The app's tags: classical, western or eastern (origin), electronic, orchestral."""
    genres = set(row['genres'].split('-')) if row['genres'] not in ('', 'NA') else set()
    words = row['tags'].lower().split('-') if row['tags'] not in ('', 'NA') else []
    text = normalize(' '.join([row['title'], row['song_name'], row['composer_name']]))
    eastern = any(word.startswith(EASTERN_WORDS) and not word.startswith(('easterneurope', 'arabesque', 'arabesco'))
                  for word in words + text.split())
    programs = [int(p) for p in row['tracks'].split('-') if p.isdigit()] if row['tracks'] not in ('', 'NA') else []
    families = {p // 8 for p in programs}
    # General MIDI families: 5-6 strings/ensemble, 7 brass, 8-9 reeds and pipes.
    orchestral = (any(word.startswith(ORCHESTRAL_WORDS) for word in words + text.split())
                  or (len(programs) >= 6 and families & {5, 6} and families & {7, 8, 9}))
    tags = []
    # Classical covers western art music and eastern classical/traditional music.
    if 'classical' in genres or (eastern and genres & {'folk', 'worldmusic'}):
        tags.append('classical')
    tags.append('eastern' if eastern else 'western')
    if 'electronic' in genres:
        tags.append('electronic')
    if orchestral:
        tags.append('orchestral')
    return tags


def search(query, limit=15):
    for row in candidates(query)[:limit]:
        print(f"{row['mxl']}\t{row['title']!r}\tby {row['composer_name']}\ttracks={row['n_tracks']}"
              f"\tbars={row['song_length.bars']}\tfav={row['n_favorites']}\trating={row['rating']}x{row['n_ratings']}"
              f"\tconflict={row['license_conflict']}\ttags={','.join(tags_for(row))}")


def stream_mxl(paths):
    """Yield (path, bytes) for each wanted archive member, stopping once all are found."""
    wanted = {p.lstrip('./') for p in paths}
    local = DATA / 'mxl.tar.gz'
    source = open(local, 'rb') if local.exists() else urllib.request.urlopen(f'{RECORD}/mxl.tar.gz/content')
    with source as response:
        with tarfile.open(fileobj=response, mode='r|gz') as archive:
            seen = 0
            for member in archive:
                seen += 1
                if seen % 20000 == 0:
                    print(f'  scanned {seen} files...', file=sys.stderr)
                name = member.name.lstrip('./')
                if name in wanted and member.isfile():
                    yield name, archive.extractfile(member).read()
                    wanted.discard(name)
                    if not wanted:
                        return
    if wanted:
        raise SystemExit(f'Not found in mxl.tar.gz: {sorted(wanted)}')


def fetch(song_id, query, path=None):
    rows = candidates(query)
    row = next((r for r in rows if r['mxl'] == path), None) if path else (rows[0] if rows else None)
    if not row:
        raise SystemExit(f'No PDMX score matches {query!r}.')
    conn = db()
    if conn.execute('select 1 from scores where id = ? and path = ?', (song_id, row['mxl'])).fetchone():
        print(f'{song_id} is already cached from {row["mxl"]}.')
        return
    print(f"Fetching {row['title']!r} ({row['mxl']}) from mxl.tar.gz...", file=sys.stderr)
    for _, data in stream_mxl([row['mxl']]):
        conn.execute('insert or replace into scores values (?, ?, ?, ?, ?, ?, ?, ?)', (
            song_id, row['mxl'], row['title'], row['composer_name'], row['license_url'],
            json.dumps(row), data, time.time()))
        conn.commit()
    print(f'Cached {song_id} in {DB.relative_to(ROOT)}.')


def fetch_requested(manifest=ROOT / 'scripts' / 'songs.json'):
    """Fetch and simplify every song in the requested-songs list that is not cached yet.

    Each entry is {id, title, path, composer?, tags?}; tags override the derived ones.
    One pass over mxl.tar.gz (a local copy in data/pdmx when present) fetches them all.
    """
    entries = json.loads(Path(manifest).read_text())
    conn = db()
    missing = [e for e in entries if not conn.execute('select 1 from scores where id = ? and path = ?', (e['id'], e['path'])).fetchone()]
    if missing:
        ensure_csv()
        paths = {e['path'] for e in missing}
        rows = {}
        with open(CSV, newline='', encoding='utf-8') as handle:
            for row in csv.DictReader(handle):
                if row['mxl'] in paths:
                    rows[row['mxl']] = row
        by_path = {e['path'].lstrip('./'): e for e in missing}
        print(f'Fetching {len(missing)} scores from mxl.tar.gz...', file=sys.stderr)
        for name, data in stream_mxl(list(paths)):
            entry = by_path[name]
            row = rows[entry['path']]
            conn.execute('insert or replace into scores (id, path, title, composer, license, metadata, mxl, fetched_at, tags) '
                         'values (?, ?, ?, ?, ?, ?, ?, ?, ?)', (
                entry['id'], entry['path'], row['title'], entry.get('composer', row['composer_name']), row['license_url'],
                json.dumps(row), data, time.time(), json.dumps(entry.get('tags') or tags_for(row))))
            conn.commit()
    for entry in entries:
        if 'tags' in entry:
            conn.execute('update scores set tags = ? where id = ?', (json.dumps(entry['tags']), entry['id']))
        if 'composer' in entry:
            conn.execute('update scores set composer = ? where id = ?', (entry['composer'], entry['id']))
        conn.commit()
        simplify(entry['id'], entry['title'])


# --- MusicXML to "which key is pressed when" -------------------------------------------

STEPS = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def musicxml_from_mxl(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        name = None
        if 'META-INF/container.xml' in archive.namelist():
            container = ET.fromstring(archive.read('META-INF/container.xml'))
            rootfile = next((e for e in container.iter() if e.tag.endswith('rootfile')), None)
            name = rootfile.get('full-path') if rootfile is not None else None
        name = name or next(n for n in archive.namelist() if n.endswith(('.xml', '.musicxml')) and not n.startswith('META-INF'))
        return archive.read(name)


def strip_namespaces(root):
    for element in root.iter():
        if '}' in element.tag:
            element.tag = element.tag.split('}', 1)[1]
    return root


BEAT_QUARTERS = {'whole': 4, 'half': 2, 'quarter': 1, 'eighth': 0.5, '16th': 0.25, '32nd': 0.125}
DYNAMICS = {'p', 'pp', 'ppp', 'pppp', 'mp', 'mf', 'f', 'ff', 'fff', 'ffff', 'sf', 'sfz', 'sffz', 'sfp', 'fp', 'fz', 'rf', 'rfz', 'pf'}


# Performance directions worth keeping; instrument names, fingerings and the like are dropped.
DIRECTION_WORDS = re.compile(
    r'\b(cresc|decresc|dim|rit|rall|accel|a tempo|tempo|dolce|legato|stacc|espress|cantabile|sempre|poco|pi[uù]|meno|molto|'
    r'simile|adagio|andante|allegr|presto|largo|lento|moderato|vivace|grave|maestoso|moto|sostenuto|rubato|smorz|morendo|'
    r'calando|marcato|agitato|animato|leggier|pesante|tranquill|fine|d\.c\.|d\.s\.|coda|c[ée]dez|retenu|lent|vif|mod[ée]r[ée]|'
    r'tr[èe]s|anim[ée]|cantando|perdendo|ritenuto|stringendo|subito|sotto voce|mezza voce|con pedale)', re.IGNORECASE)


def add_mark(measure, start, kind, text):
    """Score markings, deduplicated across parts and staves."""
    mark = {'start': start, 'kind': kind, 'text': text}
    if mark not in measure['marks']:
        measure['marks'].append(mark)


def direction_marks(direction):
    """Concise (kind, text) markings from one <direction>: tempo, dynamics, hairpins and short words."""
    marks = []
    has_metronome = False
    for kind in direction.findall('direction-type'):
        for item in kind:
            if item.tag == 'metronome' and item.findtext('per-minute'):
                marks.append(('tempo', f"bpm={item.findtext('per-minute').strip()}"))
                # Quarter notes per minute, for playback: scale by the beat unit (dotted = ×1.5).
                try:
                    unit = BEAT_QUARTERS.get(item.findtext('beat-unit', 'quarter'), 1) * (1.5 if item.find('beat-unit-dot') is not None else 1)
                    marks.append(('qpm', str(round(float(item.findtext('per-minute')) * unit, 2))))
                except ValueError:
                    pass
                has_metronome = True
            elif item.tag == 'dynamics':
                for level in item:
                    name = level.text.strip() if level.tag == 'other-dynamics' and level.text else level.tag
                    if name in DYNAMICS:
                        marks.append(('dynamic', name))
            elif item.tag == 'wedge' and item.get('type') in ('crescendo', 'diminuendo', 'stop'):
                marks.append(('wedge', item.get('type')))
            elif item.tag == 'words' and item.text and len(item.text.strip()) <= 24 and DIRECTION_WORDS.search(item.text):
                marks.append(('words', ' '.join(item.text.split())))
    sound = direction.find('sound')
    if not has_metronome and sound is not None and sound.get('tempo'):
        marks.append(('sound-tempo', f"bpm={round(float(sound.get('tempo')))}"))  # playback-only tempo
    if sound is not None and sound.get('tempo'):
        marks.append(('qpm', str(round(float(sound.get('tempo')), 2))))  # <sound tempo> is always in quarters
    return marks


def parse_score(xml):
    """Return (divisions_lcm, measures) with every part merged by measure index."""
    root = strip_namespaces(ET.fromstring(xml))
    if root.tag != 'score-partwise':
        raise SystemExit(f'Unsupported MusicXML root <{root.tag}>.')
    parts = root.findall('part')
    all_divisions = {int(float(d.text)) for d in root.iter('divisions') if d.text}
    tpq = math.lcm(*all_divisions) if all_divisions else 1
    measures = []  # per index: dict(number, duration, notes[], spans[])

    for part in parts:
        divisions = 1
        staves = 1
        clefs = {}  # staff number -> clef sign, to tell hands apart
        open_ties = {}  # (staff, voice, midi) -> note dict, awaiting a tie stop
        for index, measure in enumerate(part.findall('measure')):
            if index == len(measures):
                measures.append({'number': measure.get('number', str(index + 1)), 'duration': 0, 'notes': [], 'spans': [], 'marks': []})
            out = measures[index]
            pos = last_start = end = 0
            for element in measure:
                if element.tag == 'attributes':
                    if element.find('divisions') is not None:
                        divisions = int(float(element.find('divisions').text))
                    if element.find('staves') is not None:
                        staves = int(element.findtext('staves'))
                    for clef in element.findall('clef'):
                        clefs[clef.get('number', '1')] = clef.findtext('sign', 'G')
                    meter = element.find('time')
                    if meter is not None and meter.findtext('beats', '').isdigit() and meter.findtext('beat-type', '').isdigit():
                        out['time'] = [int(meter.findtext('beats')), int(meter.findtext('beat-type'))]  # for the metronome
                if element.tag == 'direction':
                    offset = int(float(element.findtext('offset', '0'))) * (tpq // divisions)
                    for mark in direction_marks(element):
                        add_mark(out, max(0, pos + offset), *mark)
                    continue
                scale = tpq // divisions
                if element.tag in ('backup', 'forward'):
                    amount = int(float(element.findtext('duration', '0'))) * scale
                    pos += -amount if element.tag == 'backup' else amount
                    end = max(end, pos)
                    continue
                if element.tag != 'note' or element.find('grace') is not None or element.find('cue') is not None:
                    continue
                duration = int(float(element.findtext('duration', '0'))) * scale
                start = last_start if element.find('chord') is not None else pos
                if element.find('chord') is None:
                    last_start = start
                    pos += duration
                end = max(end, start + duration)
                if duration <= 0:
                    continue
                out['spans'].append((start, duration))
                pitch = element.find('pitch')
                if pitch is None:
                    continue  # rest or unpitched
                midi = (int(pitch.findtext('octave')) + 1) * 12 + STEPS[pitch.findtext('step')] + round(float(pitch.findtext('alter', '0')))
                ties = {tie.get('type') for tie in element.findall('tie')}
                key = (element.findtext('staff', '1'), element.findtext('voice', '1'), midi)
                previous = open_ties.pop(key, None) if 'stop' in ties else None
                if previous is not None and previous['measure'] == index and previous['start'] + previous['duration'] == start:
                    previous['duration'] += duration  # tied inside the measure: one held note
                    note = previous
                else:
                    staff = element.findtext('staff', '1')
                    # A piano grand staff's lower staff is the left hand; other staves go by their clef.
                    left = staff == '2' if staves == 2 else clefs.get(staff) == 'F'
                    note = {'measure': index, 'start': start, 'duration': duration, 'midi': midi, 'hand': 'left' if left else 'right'}
                    if previous is not None:
                        note['tied'] = True
                    out['notes'].append(note)
                if 'start' in ties:
                    open_ties[key] = note
            out['duration'] = max(out['duration'], end)
    return tpq, measures


def simplify(song_id, title):
    conn = db()
    row = conn.execute('select path, title, composer, license, mxl, metadata, tags from scores where id = ?', (song_id,)).fetchone()
    if not row:
        raise SystemExit(f'{song_id} is not cached yet; run fetch first.')
    path, source_title, composer, license_url, data, metadata, saved_tags = row
    tags = json.loads(saved_tags) if saved_tags and saved_tags != '[]' else tags_for(json.loads(metadata))
    tpq, measures = parse_score(musicxml_from_mxl(data))
    out_measures = []
    last = {'tempo': None}  # only show a tempo when it changes
    for measure in measures:
        values = [measure['duration']]
        for start, duration in measure['spans']:
            values += [start, min(duration, measure['duration'] - start)]
        resolution = math.gcd(*[v for v in values if v > 0]) or measure['duration'] or tpq
        notes = []
        for note in sorted(measure['notes'], key=lambda n: (n['start'], n['midi'])):
            item = {'start': note['start'], 'duration': min(note['duration'], measure['duration'] - note['start']), 'midi': note['midi']}
            if note.get('tied'):
                item['tied'] = True
            if note['hand'] == 'left':
                item['hand'] = 'left'
            notes.append(item)
        item = {'number': measure['number'], 'duration': measure['duration'], 'resolution': resolution, 'notes': notes}
        marks = []
        # Playback tempo changes (quarter notes per minute), separate from the displayed markings.
        tempos = []
        for mark in sorted((m for m in measure['marks'] if m['kind'] == 'qpm'), key=lambda m: m['start']):
            tempo = {'start': min(mark['start'], max(0, measure['duration'] - 1)), 'qpm': float(mark['text'])}
            if not tempos or tempos[-1] != tempo:
                tempos.append(tempo)
        for mark in sorted((m for m in measure['marks'] if m['kind'] != 'qpm'),
                           key=lambda m: (m['start'], ['time', 'tempo', 'sound-tempo', 'words', 'dynamic', 'wedge'].index(m['kind']))):
            if mark['kind'] == 'sound-tempo':
                # Playback tempos (often per-measure ramps) only stand in when the score has no tempo mark yet.
                if last['tempo'] is not None:
                    continue
                mark = {**mark, 'kind': 'tempo'}
            if mark['kind'] in last:
                if mark['text'] == last[mark['kind']]:
                    continue
                last[mark['kind']] = mark['text']
            marks.append({**mark, 'start': min(mark['start'], max(0, measure['duration'] - 1))})
        if marks:
            item['marks'] = marks
        if tempos:
            item['tempos'] = tempos
        if measure.get('time'):
            item['time'] = measure['time']
        out_measures.append(item)

    song = {
        'id': song_id, 'title': title or source_title, 'composer': composer if composer and composer != 'NA' else '',
        'tags': tags, 'ticksPerQuarter': tpq,
        'source': {'dataset': 'PDMX', 'path': path, 'url': 'https://zenodo.org/records/15571083', 'license': license_url},
        'measures': out_measures,
    }
    SONGS.mkdir(parents=True, exist_ok=True)
    (SONGS / f'{song_id}.json').write_text(json.dumps(song, ensure_ascii=False, separators=(',', ':')) + '\n')
    index_path = SONGS / 'index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else []
    index = [entry for entry in index if entry['id'] != song_id] + [{'id': song_id, 'title': song['title'], 'composer': song['composer'], 'tags': tags}]
    index_path.write_text(json.dumps(sorted(index, key=lambda e: e['title']), ensure_ascii=False, indent=2) + '\n')
    print(f'Wrote src/songs/{song_id}.json: {len(out_measures)} measures, {sum(len(m["notes"]) for m in out_measures)} notes.')


if __name__ == '__main__':
    command, *args = sys.argv[1:] or ['help']
    if command == 'search':
        search(' '.join(args))
    elif command == 'fetch':
        fetch(args[0], args[1], args[2] if len(args) > 2 else None)
    elif command == 'sync':
        fetch_requested(*args[:1])
    elif command == 'simplify':
        simplify(args[0], args[1] if len(args) > 1 else None)
    else:
        print(__doc__)
