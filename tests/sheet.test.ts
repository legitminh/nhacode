import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digitOf, layoutMeasure, layoutStreams, octaveOf, stackStream } from '../src/lib/sheet/layout.ts';
import type { SongNote } from '../src/lib/sheet/types.ts';

/** Stacks one measure as a stream with digit row 10, modifier room 5 and line gap 1. */
function stacked(notes: SongNote[], duration = 4) {
  const measure = layoutMeasure({ number: '1', duration, resolution: 1, notes });
  const result = stackStream({ measures: [measure], frames: measure.frames }, { row: 10, mod: 5, gap: 1 });
  const top = (midi: number) => result.tops.get(measure.notes.find((n) => n.midi === midi)!)!;
  return { measure, result, top };
}

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
  assert.deepEqual(layout.notes.map((n) => [n.digit, n.octave, n.frame, n.frames]), [['0', 0, 0, 2], ['0', 1, 2, 1]]);
});

test('each column stacks on its own: octave lines and notes in pitch order from the origin line', () => {
  // 8 in octave 2, then 0 in octave 3: the 0 sits one octave line higher than the 8.
  const apart = stacked([{ start: 0, duration: 1, midi: 21 + 24 + 8 }, { start: 1, duration: 1, midi: 21 + 36 }]);
  assert.equal(apart.top(21 + 24 + 8), 3); // origin + lines 1, 2
  assert.equal(apart.top(21 + 36), 4);     // origin + lines 1, 2, 3
  assert.deepEqual(apart.result.lines.map((l) => [l.octave, l.from, l.to, l.y]), [[1, 0, 2, 1.5], [2, 0, 2, 2.5], [3, 1, 2, 3.5]]);
  // Held 8: the 0 moves above the 8's dash (and the line of octave 3 with it).
  const held = stacked([{ start: 0, duration: 2, midi: 21 + 24 + 8 }, { start: 1, duration: 1, midi: 21 + 36 }]);
  assert.equal(held.top(21 + 24 + 8), 3);
  assert.equal(held.top(21 + 36), 3 + 10 + 1);
  // Held 8 and a 0 in the same octave: the whole 8 moves up so its dash clears the 0.
  const same = stacked([{ start: 0, duration: 2, midi: 21 + 24 + 8 }, { start: 1, duration: 1, midi: 21 + 24 }]);
  assert.equal(same.top(21 + 24), 3);
  assert.equal(same.top(21 + 24 + 8), 13);
  // A note with modifiers takes extra room.
  const marked = stacked([{ start: 0, duration: 1, midi: 21, art: ['staccato'] }, { start: 0, duration: 1, midi: 23 }]);
  assert.equal(marked.top(23), 1 + 15);
  assert.equal(marked.result.height, 1 + 15 + 10);
});

test('measures wrap into streams by width', () => {
  const a = layoutMeasure({ number: '1', duration: 4, resolution: 1, notes: [{ start: 0, duration: 1, midi: 21 }] });
  const b = layoutMeasure({ number: '2', duration: 4, resolution: 1, notes: [{ start: 0, duration: 1, midi: 60 }] });
  const streams = layoutStreams([a, b, a], 8);
  assert.deepEqual(streams.map((s) => s.measures.map((m) => m.number)), [['1', '2'], ['1']]);
  assert.equal(streams[0].frames, 8);
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

test('separate hands share grace and arpeggio columns; the other hand skips them with a cross', async () => {
  const { layoutSystems } = await import('../src/lib/sheet/layout.ts');
  const measures = [{ number: '1', duration: 4, resolution: 1, notes: [
    { start: 1, duration: 0, midi: 60, grace: true },
    { start: 1, duration: 1, midi: 62 },
    { start: 1, duration: 1, midi: 40, hand: 'left' as const },
    { start: 3, duration: 1, midi: 38, hand: 'left' as const, art: ['arpeggio' as const] },
    { start: 3, duration: 1, midi: 45, hand: 'left' as const, art: ['arpeggio' as const] },
    { start: 3, duration: 1, midi: 64 },
  ] }];
  const [left, right] = layoutSystems(measures, 100, true)[0].hands.map((h) => h.stream.measures[0]);
  // One grace column before frame 1 and one arpeggio column before frame 3, in both hands.
  assert.deepEqual(left.columnOf, [0, 2, 3, 5, 6]);
  assert.deepEqual(right.columnOf, left.columnOf);
  assert.equal(left.notes.find((n) => n.midi === 40)!.frame, right.notes.find((n) => n.midi === 62)!.frame);
  assert.equal(left.notes.find((n) => n.midi === 38)!.frame, right.notes.find((n) => n.midi === 64)!.frame);
  // The left hand skips the grace column, the right hand skips the arpeggio column.
  const skips = (m: typeof left) => m.notes.filter((n) => n.skip).map((n) => [n.frame, n.octave, n.grace]);
  assert.deepEqual(skips(left), [[1, 0, true]]);
  assert.deepEqual(skips(right), [[4, 0, true]]);
  // A skip is the lowest thing in its column, just past the origin line.
  const stack = stackStream({ measures: [left], frames: left.frames }, { row: 10, mod: 5, gap: 1 });
  assert.equal(stack.tops.get(left.notes.find((n) => n.skip)!), 1);
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

test('playback velocity follows dynamics and hairpins; staccato, accents and arpeggios shape notes', async () => {
  const { Timeline, DYNAMIC_LEVELS } = await import('../src/lib/sheet/timeline.ts');
  const note = (start: number, midi: number, art?: ('staccato' | 'accent' | 'fermata' | 'arpeggio')[]) =>
    ({ start, duration: 1, midi, ...(art ? { art } : {}) });
  const song = {
    id: 's', title: 'S', composer: '', ticksPerQuarter: 1, source: { dataset: 'x', path: 'x' },
    measures: [
      { number: '1', duration: 4, resolution: 1, tempos: [{ start: 0, qpm: 60 }],
        marks: [{ start: 0, kind: 'dynamic' as const, text: 'p' }, { start: 2, kind: 'wedge' as const, text: 'crescendo' }],
        notes: [note(0, 60), note(1, 62, ['staccato']), note(2, 64), note(3, 65, ['accent'])] },
      { number: '2', duration: 4, resolution: 1,
        marks: [{ start: 0, kind: 'wedge' as const, text: 'stop' }, { start: 0, kind: 'dynamic' as const, text: 'f' }],
        notes: [note(0, 60, ['arpeggio']), note(0, 64, ['arpeggio']), note(0, 67, ['arpeggio'])] },
    ],
  };
  const timeline = new Timeline(song);
  const on = (id: string) => timeline.events.find((event) => event.on && event.id === id)!;
  const off = (id: string) => timeline.events.find((event) => !event.on && event.id === id)!;
  assert.equal(on('0:0').velocity, DYNAMIC_LEVELS.p);
  // The crescendo from tick 2 ramps from p to the f that follows it.
  assert.ok(on('0:2').velocity === DYNAMIC_LEVELS.p);
  assert.ok(on('0:3').velocity > DYNAMIC_LEVELS.p + .15 - 1e-9); // halfway up the ramp, plus the accent
  assert.equal(on('1:0').velocity, DYNAMIC_LEVELS.f);
  // Staccato sounds half as long.
  assert.equal(off('0:1').time - on('0:1').time, 500);
  // The rolled chord enters low to high.
  assert.ok(on('1:0').time < on('1:1').time && on('1:1').time < on('1:2').time);
});

test('grace notes and rolled chords get their own columns; no skips when the stream is whole', () => {
  const layout = layoutMeasure({ number: '1', duration: 4, resolution: 1, notes: [
    { start: 1, duration: 0, midi: 60, grace: true },
    { start: 1, duration: 0, midi: 62, grace: true },
    { start: 1, duration: 1, midi: 64, art: ['staccato'] },
    { start: 3, duration: 1, midi: 60, art: ['arpeggio'] },
    { start: 3, duration: 1, midi: 64, art: ['arpeggio'] },
  ] });
  // Frames 0..3; two grace columns before frame 1 and one arpeggio column before frame 3.
  assert.deepEqual(layout.columnOf, [0, 3, 4, 6, 7]);
  assert.equal(layout.frames, 7);
  const at = (midi: number, grace = false) => layout.notes.find((n) => n.midi === midi && n.grace === grace && (grace || n.frame !== 6 || midi !== 60))!;
  assert.deepEqual(layout.notes.filter((n) => n.grace).map((n) => [n.midi, n.frame]), [[60, 1], [62, 2]]);
  assert.equal(at(64).frame, 3);
  assert.ok(!layout.notes.some((n) => n.skip));
});

test('playback plays grace notes just before the beat, trills alternate, and fermatas pause', async () => {
  const { Timeline } = await import('../src/lib/sheet/timeline.ts');
  const song = {
    id: 's', title: 'S', composer: '', ticksPerQuarter: 1, source: { dataset: 'x', path: 'x' },
    measures: [{ number: '1', duration: 4, resolution: 1, tempos: [{ start: 0, qpm: 60 }], notes: [
      { start: 1, duration: 0, midi: 59, grace: true },
      { start: 1, duration: 1, midi: 60, art: ['trill' as const] },
      { start: 2, duration: 1, midi: 64, art: ['fermata' as const] },
      { start: 3, duration: 1, midi: 67 },
    ] }],
  };
  const timeline = new Timeline(song);
  const grace = timeline.events.find((e) => e.on && e.midi === 59)!;
  assert.ok(grace.time < 1000 && grace.time > 900);
  const trill = timeline.events.filter((e) => e.on && e.id.startsWith('0:1~'));
  assert.ok(trill.length > 10);
  assert.deepEqual([...new Set(trill.map((e) => e.midi))].sort(), [60, 62]);
  // The fermata on beat 3 pauses the music: the last note starts after 3 s plus 0.6 s.
  const last = timeline.events.find((e) => e.on && e.midi === 67)!;
  assert.equal(last.time, 3600);
  assert.equal(timeline.duration, 4600);
  // During the pause the cursor stays on the fermata note.
  assert.equal(Math.floor(timeline.positionAt(3300).tick), 2);
});
