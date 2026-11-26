import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { displayItems, expandSong, playOrder, sectionLabel } from '../src/lib/sheet/repeats.ts';
import { Timeline } from '../src/lib/sheet/timeline.ts';
import type { Song, SongMeasure } from '../src/lib/sheet/types.ts';

const furElise: Song = JSON.parse(readFileSync(new URL('../src/songs/fur-elise.json', import.meta.url), 'utf8'));
const bar = (extra: Partial<SongMeasure> = {}): SongMeasure => ({ number: '', duration: 4, resolution: 1, notes: [], ...extra });
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test('Für Elise plays its repeats: 0–8, 0–7, 9–23, 10–22, 24 on', () => {
  const order = playOrder(furElise.measures);
  const n = furElise.measures.length;
  assert.deepEqual(order, [...range(0, 8), ...range(0, 7), ...range(9, 23), ...range(10, 22), ...range(24, n - 1)]);
});

test('a short first ending and the pickup copied after it make one full measure', () => {
  const { song } = expandSong(furElise);
  assert.equal(song.measures[8].source, 8);
  assert.ok(song.measures[8].joined && song.measures[9].joined && song.measures[9].pickup);
  assert.ok(!song.measures[0].joined);
  // The metronome: measure 8 starts on a strong beat, the copied pickup is the third (weak) beat.
  const clicks = new Timeline(song).clicks();
  assert.deepEqual(clicks.filter((c) => c.position.measure === 8 || c.position.measure === 9).map((c) => c.kind), ['strong', 'weak', 'weak']);
});

test('programmatic replays become § measures; putting the sections back gives the expanded stream', () => {
  const { order } = expandSong(furElise);
  const items = displayItems(furElise, 'programmatic');
  const sections = new Map<number, number[]>();
  for (const item of items) if (item.kind === 'measure') {
    for (const id of item.opens) sections.set(id, [item.source]);
    for (const [id, run] of sections) if (run.length && !item.closes.includes(id) && run.at(-1) !== item.source && !run.includes(-1)) run.push(item.source);
    for (const id of item.closes) { const run = sections.get(id)!; if (run.at(-1) !== item.source) run.push(item.source); run.push(-1); }
  }
  const body = (id: number) => sections.get(id)!.filter((s) => s >= 0);
  assert.deepEqual(body(0), range(0, 7));
  assert.deepEqual(body(1), range(10, 22));
  const linear = items.flatMap((item) => (item.kind === 'measure' ? [item.source] : body(item.id)));
  assert.deepEqual(linear, order);
  // Every item seeks to its first played measure and covers the right ones.
  assert.deepEqual(items.flatMap((item) => item.plays), order.map((_, k) => k));
});

test('section labels are little-endian hex', () => {
  assert.deepEqual([0, 1, 10, 16, 255].map(sectionLabel), ['0', '1', 'a', '01', 'ff']);
});

test('D.C. al Fine, D.S. al Coda and endings convert to a linear order', () => {
  // A |: B :| C(D.C. al Fine) with Fine at B: A B A B C A B
  assert.deepEqual(playOrder([bar(), bar({ repeat: { start: true }, jump: { fine: true } }), bar({ repeat: { end: 2 } }), bar({ jump: { dacapo: true } })]),
    [0, 1, 2, 1, 2, 3, 0, 1]);
  // A segno-B (To Coda) C (D.S. al Coda) coda-D: A B C B D
  assert.deepEqual(playOrder([bar(), bar({ jump: { segno: true, toCoda: true } }), bar({ jump: { dalsegno: true } }), bar({ jump: { coda: true } })]),
    [0, 1, 2, 1, 3]);
  // After D.C. repeats are not taken and only the last ending plays.
  assert.deepEqual(playOrder([bar(), bar({ ending: [1], repeat: { end: 2 } }), bar({ ending: [2] }), bar({ jump: { dacapo: true } }), bar()]),
    [0, 1, 0, 2, 3, 0, 2, 3, 4]);
});
