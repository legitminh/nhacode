import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Song } from '../src/lib/sheet/types.ts';

const dir = new URL('../src/songs/', import.meta.url);
const songs = readdirSync(dir).filter((name) => name.endsWith('.json') && name !== 'index.json')
  .map((name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8')) as Song);

test('imported songs strike each key once per moment and hand', () => {
  for (const song of songs) {
    song.measures.forEach((measure) => {
      const seen = new Set<string>();
      for (const note of measure.notes) {
        if (note.grace) continue;
        const key = `${note.start}:${note.midi}:${note.hand ?? 'right'}`;
        assert.ok(!seen.has(key), `${song.id} bar ${measure.number}: ${note.midi} struck twice at ${note.start}`);
        seen.add(key);
      }
    });
  }
});

test('a tied note continues a note held to the end of the bar before', () => {
  for (const song of songs) {
    song.measures.forEach((measure, m) => {
      for (const note of measure.notes) {
        if (!note.tied) continue;
        const before = song.measures[m - 1];
        assert.ok(note.start === 0 && before?.notes.some((other) => other.midi === note.midi && other.start + other.duration >= before.duration),
          `${song.id} bar ${measure.number}: tied ${note.midi} has nothing held into it`);
      }
    });
  }
});

test('Clair de Lune opens with one held chord in the left stream', () => {
  const song = songs.find((item) => item.id === 'clair-de-lune')!;
  const left = song.measures[0].notes.filter((note) => note.hand === 'left');
  assert.deepEqual(left.map((note) => [note.start, note.duration, note.midi]), [[6, 48, 65], [6, 48, 68]]);
});
