import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOTE_ROWS, NOTES, noteAt } from '../src/lib/notes.ts';

test('the A-based octave grid contains 96 distinct, consecutive semitones', () => {
  assert.equal(NOTE_ROWS.length, 12);
  NOTE_ROWS.forEach((row) => assert.equal(row.length, 8));
  const columnOrder = [...NOTES].sort((a, b) => a.midi - b.midi);
  assert.deepEqual(columnOrder.map((note) => note.midi), Array.from({ length: 96 }, (_, i) => 21 + i));
  assert.equal(new Set(NOTES.map((note) => note.id)).size, 96);
  assert.equal(noteAt(0, 0).name, 'A');
  assert.equal(noteAt(0, 0).midi, 21);
  assert.equal(noteAt(0, 11).name, 'G♯');
  assert.equal(noteAt(1, 0).midi, noteAt(0, 11).midi + 1);
  assert.equal(noteAt(7, 11).midi, 116);
  assert.deepEqual(NOTE_ROWS.map((row) => row[0].hex), [...'0123456789ab']);
});

test('out-of-grid coordinates are rejected', () => {
  for (const [octave, row] of [[-1, 0], [8, 0], [0, 12], [0.5, 1]]) {
    assert.throws(() => noteAt(octave, row), RangeError);
  }
});
