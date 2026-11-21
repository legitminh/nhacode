#!/usr/bin/env python3
"""Fetch scores from PDMX into a local SQLite cache and simplify them for the sheet screen.

PDMX (https://github.com/pnlong/PDMX, data on Zenodo record 15571083) ships its
MusicXML as one large mxl.tar.gz. This script streams that archive and stops as
soon as the requested score is found, so a song costs a partial download, not 1.9 GB.

  python3 scripts/pdmx.py search "fur elise"           # list candidates from PDMX.csv
  python3 scripts/pdmx.py fetch fur-elise "fur elise"  # cache the best match's MXL in data/pdmx/pdmx.sqlite
  python3 scripts/pdmx.py simplify fur-elise "Für Elise" # write src/songs/fur-elise.json

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


def search(query, limit=15):
    for row in candidates(query)[:limit]:
        print(f"{row['mxl']}\t{row['title']!r}\tby {row['composer_name']}\ttracks={row['n_tracks']}"
              f"\tbars={row['song_length.bars']}\tfav={row['n_favorites']}\trating={row['rating']}x{row['n_ratings']}"
              f"\tconflict={row['license_conflict']}")


def stream_mxl(paths):
    """Yield (path, bytes) for each wanted archive member, stopping once all are found."""
    wanted = {p.lstrip('./') for p in paths}
    request = urllib.request.Request(f'{RECORD}/mxl.tar.gz/content')
    with urllib.request.urlopen(request) as response:
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
        open_ties = {}  # (staff, voice, midi) -> note dict, awaiting a tie stop
        for index, measure in enumerate(part.findall('measure')):
            if index == len(measures):
                measures.append({'number': measure.get('number', str(index + 1)), 'duration': 0, 'notes': [], 'spans': []})
            out = measures[index]
            pos = last_start = end = 0
            for element in measure:
                if element.tag == 'attributes' and element.find('divisions') is not None:
                    divisions = int(float(element.find('divisions').text))
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
                    note = {'measure': index, 'start': start, 'duration': duration, 'midi': midi}
                    if previous is not None:
                        note['tied'] = True
                    out['notes'].append(note)
                if 'start' in ties:
                    open_ties[key] = note
            out['duration'] = max(out['duration'], end)
    return tpq, measures


def simplify(song_id, title):
    conn = db()
    row = conn.execute('select path, title, composer, license, mxl from scores where id = ?', (song_id,)).fetchone()
    if not row:
        raise SystemExit(f'{song_id} is not cached yet; run fetch first.')
    path, source_title, composer, license_url, data = row
    tpq, measures = parse_score(musicxml_from_mxl(data))
    out_measures = []
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
            notes.append(item)
        out_measures.append({'number': measure['number'], 'duration': measure['duration'], 'resolution': resolution, 'notes': notes})

    song = {
        'id': song_id, 'title': title or source_title, 'composer': composer or '', 'ticksPerQuarter': tpq,
        'source': {'dataset': 'PDMX', 'path': path, 'url': 'https://zenodo.org/records/15571083', 'license': license_url},
        'measures': out_measures,
    }
    SONGS.mkdir(parents=True, exist_ok=True)
    (SONGS / f'{song_id}.json').write_text(json.dumps(song, ensure_ascii=False, separators=(',', ':')) + '\n')
    index_path = SONGS / 'index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else []
    index = [entry for entry in index if entry['id'] != song_id] + [{'id': song_id, 'title': song['title'], 'composer': song['composer']}]
    index_path.write_text(json.dumps(sorted(index, key=lambda e: e['title']), ensure_ascii=False, indent=2) + '\n')
    print(f'Wrote src/songs/{song_id}.json: {len(out_measures)} measures, {sum(len(m["notes"]) for m in out_measures)} notes.')


if __name__ == '__main__':
    command, *args = sys.argv[1:] or ['help']
    if command == 'search':
        search(' '.join(args))
    elif command == 'fetch':
        fetch(args[0], args[1], args[2] if len(args) > 2 else None)
    elif command == 'simplify':
        simplify(args[0], args[1] if len(args) > 1 else None)
    else:
        print(__doc__)
