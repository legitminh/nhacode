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

test('separate hands split each measure by hand and keep both hands aligned', async () => {
  const { layoutSystems } = await import('../src/lib/sheet/layout.ts');
  const measures = [
    { number: '1', duration: 4, resolution: 1, notes: [{ start: 0, duration: 1, midi: 69 }, { start: 0, duration: 2, midi: 45, hand: 'left' as const }] },
    { number: '2', duration: 2, resolution: 1, notes: [{ start: 1, duration: 1, midi: 33, hand: 'left' as const }] },
  ];
  const together = layoutSystems(measures, 100, false);
  assert.deepEqual(together.map((s) => s.hands.map((h) => h.hand)), [['both']]);
  assert.equal(together[0].hands[0].stream.measures[0].notes.length, 2);
  const apart = layoutSystems(measures, 5, true);
  assert.deepEqual(apart.map((s) => s.hands.map((h) => h.hand)), [['left', 'right'], ['left', 'right']]);
  const [left, right] = apart[0].hands.map((h) => h.stream); // left hand on top
  assert.deepEqual(right.measures[0].notes.map((n) => n.midi), [69]);
  assert.deepEqual(left.measures[0].notes.map((n) => n.midi), [45]);
  assert.equal(right.frames, left.frames);
  assert.deepEqual(apart[1].hands[1].stream.measures[0].notes, []);
});

test('markings group by frame, overlapping ones move to new rows, and hairpins continue across systems', async () => {
  const { layoutMarks, layoutSystems } = await import('../src/lib/sheet/layout.ts');
  const measures = [
    { number: '1', duration: 4, resolution: 1, notes: [], marks: [
      { start: 0, kind: 'tempo' as const, text: 'bpm=90' }, { start: 0, kind: 'dynamic' as const, text: 'p' },
      { start: 2, kind: 'wedge' as const, text: 'crescendo' }] },
    { number: '2', duration: 4, resolution: 1, notes: [], marks: [{ start: 1, kind: 'wedge' as const, text: 'stop' }] },
  ];
  const [first, second] = layoutMarks(layoutSystems(measures, 4, false));
  assert.deepEqual(first.texts, [{ frame: 0, parts: [{ kind: 'tempo', text: 'bpm=90' }, { kind: 'dynamic', text: 'p' }], row: 0 }]);
  // "bpm=90 p" covers frames 0-8, so the hairpin starting at frame 2 drops to row 1.
  assert.deepEqual(first.hairpins, [{ kind: 'crescendo', from: 2, to: 4, continued: false, open: true, row: 1 }]);
  assert.equal(first.rows, 2);
  assert.deepEqual(second.hairpins, [{ kind: 'crescendo', from: 0, to: 2, continued: true, open: false, row: 0 }]);
  assert.equal(second.rows, 1);
});

test('the playback timeline follows tempo changes and merges tied notes', async () => {
  const { Timeline } = await import('../src/lib/sheet/timeline.ts');
  const song = {
    id: 's', title: 'S', composer: '', ticksPerQuarter: 1, source: { dataset: 'x', path: 'x' },
    measures: [
      { number: '1', duration: 4, resolution: 1, tempos: [{ start: 0, qpm: 60 }],
        notes: [{ start: 0, duration: 2, midi: 60 }, { start: 2, duration: 2, midi: 62 }] },
      { number: '2', duration: 4, resolution: 1, tempos: [{ start: 0, qpm: 120 }],
        notes: [{ start: 0, duration: 2, midi: 62, tied: true }] },
    ],
  };
  const timeline = new Timeline(song);
  // 4 quarters at 60 qpm (4 s) then 4 quarters at 120 qpm (2 s).
  assert.equal(timeline.duration, 6000);
  assert.equal(timeline.timeAt({ measure: 1, tick: 0 }), 4000);
  assert.deepEqual(timeline.positionAt(5000), { measure: 1, tick: 2 });
  // The tied D sounds once, from 2 s until 5 s.
  const d = timeline.events.filter((event) => event.midi === 62);
  assert.deepEqual(d.map((event) => [event.on, event.time]), [[true, 2000], [false, 5000]]);
});

test('metronome clicks follow the meter: strong downbeats, weak beats, pickups and in-between clicks', async () => {
  const { Timeline } = await import('../src/lib/sheet/timeline.ts');
  const song = {
    id: 's', title: 'S', composer: '', ticksPerQuarter: 2, source: { dataset: 'x', path: 'x' },
    measures: [
      { number: '0', duration: 2, resolution: 1, time: [3, 4] as [number, number], tempos: [{ start: 0, qpm: 60 }], notes: [] }, // pickup
      { number: '1', duration: 6, resolution: 1, notes: [] },
      { number: '2', duration: 6, resolution: 1, time: [6, 8] as [number, number], notes: [] }, // compound: 2 dotted-quarter beats
    ],
  };
  const timeline = new Timeline(song);
  const clicks = (between = 0) => timeline.clicks(between).map((click) => `${click.position.measure}:${click.position.tick}:${click.kind}`);
  assert.deepEqual(clicks(), ['0:0:weak', '1:0:strong', '1:2:weak', '1:4:weak', '2:0:strong', '2:3:weak']);
  assert.deepEqual(clicks(1).slice(0, 4), ['0:0:weak', '0:1:sub', '1:0:strong', '1:1:sub']);
  // At 60 qpm with two ticks per quarter, the first full measure starts after the 2-tick pickup: 1 s.
  assert.equal(timeline.clicks()[1].time, 1000);
});
