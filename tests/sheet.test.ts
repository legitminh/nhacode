import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digitOf, layoutMeasure, layoutStreams, octaveOf } from '../src/lib/sheet/layout.ts';

test('notes become A-based hex digits and octaves', () => {
  assert.equal(digitOf(21), '0'); // A0
  assert.equal(digitOf(32), 'b'); // G♯0
  assert.equal(octaveOf(32), 0);
  assert.equal(octaveOf(33), 1);  // A1
  assert.equal(digitOf(76), '7'); // E5 is E in the A-based octave 4
  assert.equal(octaveOf(76), 4);
});

test('a measure is split into frames of its resolution, with holds and octave reach', () => {
  const layout = layoutMeasure({ number: '1', duration: 8, resolution: 2, notes: [
    { start: 0, duration: 4, midi: 21 },  // A0 held for two frames
    { start: 4, duration: 2, midi: 33 },  // A1
  ] });
  assert.equal(layout.frames, 4);
  assert.deepEqual(layout.reach, [0, 0, 1, -1]);
  assert.deepEqual(layout.notes.map((n) => [n.digit, n.octave, n.frame, n.frames, n.lane]), [['0', 0, 0, 2, 0], ['0', 1, 2, 1, 0]]);
  assert.deepEqual(layout.lanes, [1, 1]);
});

test('overlapping notes stack by ascending pitch; back-to-back notes share a row', () => {
  const layout = layoutMeasure({ number: '1', duration: 4, resolution: 1, notes: [
    { start: 0, duration: 2, midi: 23 }, // B0, frames 0-1
    { start: 0, duration: 1, midi: 21 }, // A0, frame 0
    { start: 2, duration: 2, midi: 22 }, // A♯0 starts right after B ends
    { start: 1, duration: 1, midi: 25 }, // C♯ overlaps B
  ] });
  const lane = (midi: number) => layout.notes.find((n) => n.midi === midi)!.lane;
  assert.ok(lane(21) < lane(23));
  assert.ok(lane(23) < lane(25));
  assert.equal(lane(22), 0);
  assert.equal(layout.lanes[0], 3);
});

test('measures wrap into streams by width and share lane counts', () => {
  const a = layoutMeasure({ number: '1', duration: 4, resolution: 1, notes: [{ start: 0, duration: 1, midi: 21 }] });
  const b = layoutMeasure({ number: '2', duration: 4, resolution: 1, notes: [{ start: 0, duration: 1, midi: 60 }] });
  const streams = layoutStreams([a, b, a], 8);
  assert.deepEqual(streams.map((s) => s.measures.map((m) => m.number)), [['1', '2'], ['1']]);
  assert.deepEqual(streams[0].lanes, [1, 0, 0, 1]);
});

test('song search matches title or composer words, accents ignored, and requires every tag', async () => {
  const { findSongs } = await import('../src/lib/sheet/search.ts');
  const list = [
    { id: 'a', title: 'Für Elise', composer: 'Ludwig van Beethoven', tags: ['classical', 'western'] as const },
    { id: 'b', title: 'Jasmine Flower', composer: 'Chinese traditional', tags: ['classical', 'eastern'] as const },
    { id: 'c', title: 'Synth Study', composer: 'Someone', tags: ['western', 'electronic'] as const },
  ].map((song) => ({ ...song, tags: [...song.tags] }));
  const ids = (query: string, tags: string[] = []) => findSongs(list, query, new Set(tags as never[])).map((song) => song.id);
  assert.deepEqual(ids('fur'), ['a']);
  assert.deepEqual(ids('beethoven elise'), ['a']);
  assert.deepEqual(ids('', ['classical']), ['a', 'b']);
  assert.deepEqual(ids('', ['classical', 'eastern']), ['b']);
  assert.deepEqual(ids('', ['electronic']), ['c']);
  assert.deepEqual(ids('nothing'), []);
});
