import type { Articulation, SongMark, SongMeasure } from './types';

/** A0 is the lowest key; octaves start at A, matching the piano grid. */
const A0 = 21;

export type SheetNote = {
  octave: number;
  /** Pitch class from A, written in lowercase hex: 0 is A, b is G♯. */
  digit: string;
  /** Row inside the octave block, counted from the top. */
  lane: number;
  /** First column of the note inside the measure (see MeasureLayout.frames). */
  frame: number;
  /** Number of columns the note covers (at least 1). */
  frames: number;
  /** A continuation from the previous measure: draw only the hold line. */
  tied: boolean;
  /** A grace note: its own narrow column just before the note it leads into. */
  grace: boolean;
  midi: number;
  art: Articulation[];
};

export type MeasureLayout = {
  number: string;
  /** Index of the measure in the song. */
  index: number;
  /** Ticks per time frame. */
  resolution: number;
  /**
   * Width in columns. Each time frame is one column; grace notes and rolled-chord
   * marks get extra columns just before the frame they lead into.
   */
  frames: number;
  /** columnOf[f] is the column of time frame f (one entry per frame, plus the end). */
  columnOf: number[];
  /** Lane count for each octave from 0 to the highest octave used. */
  lanes: number[];
  /** mods[o][lane] is true when a note in that lane carries a modifier that needs its own space. */
  mods: boolean[][];
  notes: SheetNote[];
  /**
   * reach[c] is the highest octave sounding (started or held) in column c,
   * or -1 when nothing sounds. Octave line o is drawn over column c when reach[c] >= o.
   */
  reach: number[];
  /** Score markings, placed on the column where they start. */
  marks: (SongMark & { frame: number })[];
};

export type StreamLayout = {
  measures: MeasureLayout[];
  /** Lane count for each octave, shared by every measure in the stream. */
  lanes: number[];
  /** mods[o][lane]: that lane gets extra room for modifiers across the stream. */
  mods: boolean[][];
  frames: number;
};

/** Modifiers drawn beside the digit (above or below) and so given their own room. Arpeggios sit to the left. */
export const hasModifier = (note: Pick<SheetNote, 'art' | 'grace' | 'tied'>) =>
  !note.tied && (note.grace || note.art.some((art) => art !== 'arpeggio'));

export function octaveOf(midi: number): number {
  return Math.max(0, Math.floor((midi - A0) / 12));
}

export function digitOf(midi: number): string {
  return ((((midi - A0) % 12) + 12) % 12).toString(16);
}

/** The column a tick falls in. */
export function columnAt(measure: MeasureLayout, tick: number): number {
  const frame = Math.max(0, Math.min(measure.columnOf.length - 2, Math.floor(tick / measure.resolution)));
  return measure.columnOf[frame];
}

/**
 * Lays out one measure. Notes are split into octave blocks; inside a block,
 * any two notes that share a column are stacked by ascending pitch
 * (lower pitch on a higher row). Notes that do not overlap may share a row.
 */
export function layoutMeasure(measure: SongMeasure, index = 0): MeasureLayout {
  const resolution = measure.resolution;
  const timeFrames = Math.max(1, Math.round(measure.duration / resolution));
  const usable = measure.notes.filter((note) => note.midi >= A0 && note.start < measure.duration && (note.grace || note.duration > 0));
  const frameOf = (tick: number) => Math.min(timeFrames - 1, Math.floor(tick / resolution));

  // Extra columns before a frame: one per grace note (per hand, the longest run) and one for a rolled chord.
  const pad = Array.from({ length: timeFrames }, () => 0);
  const graceRuns = new Map<string, number>();
  for (const note of usable) {
    if (!note.grace) continue;
    const key = `${frameOf(note.start)}:${note.hand ?? 'right'}`;
    graceRuns.set(key, (graceRuns.get(key) ?? 0) + 1);
  }
  for (const [key, count] of graceRuns) {
    const frame = Number(key.split(':')[0]);
    pad[frame] = Math.max(pad[frame], count);
  }
  const rolled = new Set(usable.filter((note) => !note.grace && note.art?.includes('arpeggio')).map((note) => frameOf(note.start)));
  for (const frame of rolled) pad[frame] += 1;
  const columnOf: number[] = [];
  let column = 0;
  for (let f = 0; f < timeFrames; f++) {
    column += pad[f];
    columnOf.push(column);
    column += 1;
  }
  columnOf.push(column);
  const frames = column;

  // Grace notes count back from their main note's column (before the arpeggio column, if any).
  const graceColumn = new Map<SongMeasure['notes'][number], number>();
  const seen = new Map<string, number>();
  for (const note of usable) {
    if (!note.grace) continue;
    const frame = frameOf(note.start);
    const key = `${frame}:${note.hand ?? 'right'}`;
    const position = seen.get(key) ?? 0;
    seen.set(key, position + 1);
    graceColumn.set(note, columnOf[frame] - (rolled.has(frame) ? 1 : 0) - graceRuns.get(key)! + position);
  }

  const reach = Array.from({ length: frames }, () => -1);
  const placed: SheetNote[] = [];
  const sorted = [...usable].sort((a, b) => a.midi - b.midi || a.start - b.start);
  for (const note of sorted) {
    let start: number;
    let end: number;
    if (note.grace) {
      start = graceColumn.get(note)!;
      end = start + 1;
    } else {
      const first = frameOf(note.start);
      const last = Math.min(timeFrames, Math.max(first + 1, Math.round((note.start + note.duration) / resolution)));
      start = columnOf[first];
      end = columnOf[last - 1] + 1;
    }
    const octave = octaveOf(note.midi);
    // A row below every overlapping lower (or equal, earlier) note of the same octave.
    let lane = 0;
    for (const other of placed) {
      if (other.octave === octave && other.frame < end && start < other.frame + other.frames) lane = Math.max(lane, other.lane + 1);
    }
    placed.push({ octave, digit: digitOf(note.midi), lane, frame: start, frames: end - start, tied: !!note.tied,
      grace: !!note.grace, midi: note.midi, art: note.art ?? [] });
    for (let c = start; c < end; c++) reach[c] = Math.max(reach[c], octave);
  }

  const top = placed.reduce((max, note) => Math.max(max, note.octave), 0);
  const lanes = Array.from({ length: top + 1 }, () => 0);
  for (const note of placed) lanes[note.octave] = Math.max(lanes[note.octave], note.lane + 1);
  const mods = lanes.map((count) => Array.from({ length: count }, () => false));
  for (const note of placed) if (hasModifier(note)) mods[note.octave][note.lane] = true;
  const marks = (measure.marks ?? []).map((mark) => ({ ...mark, frame: columnOf[frameOf(mark.start)] }));
  return { number: measure.number, index, resolution, frames, columnOf, lanes, mods, notes: placed, reach, marks };
}

/** Shares lane counts across the measures of one stream. */
function stream(measures: MeasureLayout[]): StreamLayout {
  const lanes: number[] = [];
  const mods: boolean[][] = [];
  let frames = 0;
  for (const measure of measures) {
    frames += measure.frames;
    measure.lanes.forEach((count, octave) => { lanes[octave] = Math.max(lanes[octave] ?? 0, count); });
    measure.mods.forEach((row, octave) => row.forEach((mod, lane) => {
      mods[octave] ??= [];
      mods[octave][lane] ||= mod;
    }));
  }
  const octaves = Math.max(1, lanes.length);
  return {
    measures,
    lanes: Array.from({ length: octaves }, (_, o) => lanes[o] ?? 0),
    mods: Array.from({ length: octaves }, (_, o) => Array.from({ length: lanes[o] ?? 0 }, (_, l) => !!mods[o]?.[l])),
    frames,
  };
}

/** Packs measures into streams that fit `width` time frames; each stream wraps below the previous one. */
export function layoutStreams(measures: MeasureLayout[], width: number): StreamLayout[] {
  const groups: MeasureLayout[][] = [];
  let frames = 0;
  for (const measure of measures) {
    const current = groups.at(-1);
    if (!current || (current.length > 0 && frames + measure.frames > width)) {
      groups.push([measure]);
      frames = measure.frames;
    } else {
      current.push(measure);
      frames += measure.frames;
    }
  }
  return groups.map(stream);
}

export type Hand = 'both' | 'right' | 'left';
/** One line of the sheet: a single stream, or a mega stream of the left hand above the right hand. */
export type SystemLayout = { hands: { hand: Hand; stream: StreamLayout }[] };

/**
 * Lays out a song as systems. With `separate`, each measure is laid out once per hand
 * (same frames, so the hands stay aligned) and both hands wrap at the same measures.
 */
export function layoutSystems(measures: SongMeasure[], width: number, separate: boolean): SystemLayout[] {
  if (!separate) {
    return layoutStreams(measures.map((measure, index) => layoutMeasure(measure, index)), width).map((s) => ({ hands: [{ hand: 'both', stream: s }] }));
  }
  const onlyHand = (measure: SongMeasure, index: number, left: boolean) =>
    layoutMeasure({ ...measure, notes: measure.notes.filter((note) => (note.hand === 'left') === left) }, index);
  const right = measures.map((measure, index) => onlyHand(measure, index, false));
  const left = measures.map((measure, index) => onlyHand(measure, index, true));
  let index = 0;
  return layoutStreams(right, width).map((rightStream) => {
    const count = rightStream.measures.length;
    const leftStream = stream(left.slice(index, index + count));
    index += count;
    return { hands: [{ hand: 'left', stream: leftStream }, { hand: 'right', stream: rightStream }] };
  });
}

export type MarkText = { frame: number; parts: { kind: SongMark['kind']; text: string }[]; row: number };
export type Hairpin = { kind: 'crescendo' | 'diminuendo'; from: number; to: number; continued: boolean; open: boolean; row: number };
/** Markings for one system, in stream frames: texts plus hairpins (which may continue across systems). */
export type SystemMarks = { texts: MarkText[]; hairpins: Hairpin[]; rows: number };

/** Frames a marking text covers: one monospace glyph is about one frame (half a min-box) wide. */
export const textFrames = (text: MarkText) => text.parts.map((part) => part.text).join(' ').length;

/** Moves markings that would overlap onto further rows below; returns the row count. */
function stackRows(texts: MarkText[], hairpins: Hairpin[]): number {
  const items = [
    ...texts.map((text) => ({ item: text, from: text.frame, to: text.frame + textFrames(text) + 1 })),
    ...hairpins.map((pin) => ({ item: pin, from: pin.from, to: Math.max(pin.to, pin.from + 2) })),
  ].sort((a, b) => a.from - b.from);
  const ends: number[] = [];
  for (const { item, from, to } of items) {
    let row = ends.findIndex((end) => end <= from);
    if (row < 0) row = ends.push(0) - 1;
    ends[row] = to;
    item.row = row;
  }
  return ends.length;
}

/** Places every system's markings; a hairpin left open at a line end continues on the next line. */
export function layoutMarks(systems: SystemLayout[]): SystemMarks[] {
  let open: { kind: Hairpin['kind']; from: number; continued: boolean } | undefined;
  return systems.map((system) => {
    const stream = system.hands[0].stream;
    const texts: MarkText[] = [];
    const hairpins: Hairpin[] = [];
    if (open) open = { ...open, from: 0, continued: true };
    let offset = 0;
    for (const measure of stream.measures) {
      for (const mark of measure.marks) {
        const frame = offset + mark.frame;
        if (mark.kind !== 'wedge') {
          const previous = texts.at(-1);
          if (previous && previous.frame === frame) previous.parts.push({ kind: mark.kind, text: mark.text });
          else texts.push({ frame, parts: [{ kind: mark.kind, text: mark.text }], row: 0 });
        } else if (mark.text === 'stop') {
          if (open) hairpins.push({ kind: open.kind, from: open.from, to: frame + 1, continued: open.continued, open: false, row: 0 });
          open = undefined;
        } else {
          if (open) hairpins.push({ kind: open.kind, from: open.from, to: frame, continued: open.continued, open: false, row: 0 });
          open = { kind: mark.text as Hairpin['kind'], from: frame, continued: false };
        }
      }
      offset += measure.frames;
    }
    if (open) hairpins.push({ kind: open.kind, from: open.from, to: stream.frames, continued: open.continued, open: true, row: 0 });
    // Keep text inside the line: a marking near the right edge slides left to fit.
    for (const text of texts) text.frame = Math.max(0, Math.min(text.frame, stream.frames - textFrames(text)));
    return { texts, hairpins, rows: stackRows(texts, hairpins) };
  });
}

/** One pedal-down span on a line, in frames; `continued`/`open` when it crosses a line break. */
export type PedalSpan = { from: number; to: number; changes: number[]; continued: boolean; open: boolean };

/** Lays out the sustain pedal for each system; a pedal held across a line break continues on the next. */
export function layoutPedals(systems: SystemLayout[], measures: SongMeasure[]): PedalSpan[][] {
  let down: { from: number; changes: number[]; continued: boolean } | undefined;
  return systems.map((system) => {
    const stream = system.hands[0].stream;
    const spans: PedalSpan[] = [];
    if (down) down = { from: 0, changes: [], continued: true };
    let offset = 0;
    for (const layout of stream.measures) {
      const measure = measures[layout.index];
      for (const pedal of measure.pedals ?? []) {
        const frame = offset + columnAt(layout, pedal.start);
        if (pedal.type === 'start') {
          if (down) spans.push({ ...down, to: frame, open: false });
          down = { from: frame, changes: [], continued: false };
        } else if (pedal.type === 'change') {
          if (down) down.changes.push(frame);
          else down = { from: frame, changes: [], continued: false };
        } else if (down) {
          spans.push({ ...down, to: Math.max(frame, down.from + 1), open: false });
          down = undefined;
        }
      }
      offset += layout.frames;
    }
    if (down) spans.push({ ...down, to: stream.frames, open: true });
    return spans;
  });
}
