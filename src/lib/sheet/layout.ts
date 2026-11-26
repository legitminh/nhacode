import type { Articulation, SongMark, SongMeasure } from './types';

/** A0 is the lowest key; octaves start at A, matching the piano grid. */
const A0 = 21;

export type SheetNote = {
  octave: number;
  /** Pitch class from A, written in lowercase hex: 0 is A, b is G♯. Empty for a skip. */
  digit: string;
  /** First column of the note inside the measure (see MeasureLayout.frames). */
  frame: number;
  /** Number of columns the note covers (at least 1). */
  frames: number;
  /** A continuation from the previous measure: draw only the hold line. */
  tied: boolean;
  /** A grace note: its own narrow column just before the note it leads into. */
  grace: boolean;
  /**
   * A skip: a column this hand's stream only has because the other hand needs it (a grace
   * note or a rolled chord there). Drawn as an invisible grace note in octave 0: only its cross shows.
   */
  skip: boolean;
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
   * marks get extra columns just before the frame they lead into. The columns come
   * from both hands, so a hand's stream lines up with the other hand's.
   */
  frames: number;
  /** columnOf[f] is the column of time frame f (one entry per frame, plus the end). */
  columnOf: number[];
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
 * Lays out one measure, or one hand of it. The columns always come from every note in
 * the measure (both hands), so the left and right streams share the stream's columns:
 * a column added for one hand's grace note or rolled chord is a skip in the other hand.
 * Vertical placement happens per stream, in `stackStream`.
 */
export function layoutMeasure(measure: SongMeasure, index = 0, hand?: 'left' | 'right'): MeasureLayout {
  const resolution = measure.resolution;
  const timeFrames = Math.max(1, Math.round(measure.duration / resolution));
  const usable = measure.notes.filter((note) => note.midi >= A0 && note.start < measure.duration && (note.grace || note.duration > 0));
  const frameOf = (tick: number) => Math.min(timeFrames - 1, Math.floor(tick / resolution));
  const handOf = (note: SongMeasure['notes'][number]) => note.hand ?? 'right';

  // Extra columns before a frame: one per grace note (per hand, the longest run) and one for a rolled chord.
  const pad = Array.from({ length: timeFrames }, () => 0);
  const graceRuns = new Map<string, number>();
  for (const note of usable) {
    if (!note.grace) continue;
    const key = `${frameOf(note.start)}:${handOf(note)}`;
    graceRuns.set(key, (graceRuns.get(key) ?? 0) + 1);
  }
  for (const [key, count] of graceRuns) {
    const frame = Number(key.split(':')[0]);
    pad[frame] = Math.max(pad[frame], count);
  }
  const isRolled = (note: SongMeasure['notes'][number]) => !note.grace && !!note.art?.includes('arpeggio');
  const rolled = new Set(usable.filter(isRolled).map((note) => frameOf(note.start)));
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

  const mine = hand ? usable.filter((note) => handOf(note) === hand) : usable;
  // Grace notes count back from their main note's column (before the arpeggio column, if any).
  const graceColumn = new Map<SongMeasure['notes'][number], number>();
  const seen = new Map<string, number>();
  for (const note of mine) {
    if (!note.grace) continue;
    const frame = frameOf(note.start);
    const key = `${frame}:${handOf(note)}`;
    const position = seen.get(key) ?? 0;
    seen.set(key, position + 1);
    graceColumn.set(note, columnOf[frame] - (rolled.has(frame) ? 1 : 0) - graceRuns.get(key)! + position);
  }

  const reach = Array.from({ length: frames }, () => -1);
  const placed: SheetNote[] = [];
  for (const note of mine) {
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
    placed.push({ octave, digit: digitOf(note.midi), frame: start, frames: end - start, tied: !!note.tied,
      grace: !!note.grace, skip: false, midi: note.midi, art: note.art ?? [] });
    for (let c = start; c < end; c++) reach[c] = Math.max(reach[c], octave);
  }

  // Skips: extra columns this hand does not use (its own grace notes and rolled chords use theirs).
  const used = new Set(graceColumn.values());
  for (const note of mine) if (isRolled(note)) used.add(columnOf[frameOf(note.start)] - 1);
  for (let f = 0; f < timeFrames; f++) {
    for (let c = columnOf[f] - pad[f]; c < columnOf[f]; c++) {
      if (!used.has(c)) placed.push({ octave: 0, digit: '', frame: c, frames: 1, tied: false, grace: true, skip: true, midi: -1, art: [] });
    }
  }

  const marks = (measure.marks ?? []).map((mark) => ({ ...mark, frame: columnOf[frameOf(mark.start)] }));
  return { number: measure.number, index, resolution, frames, columnOf, notes: placed, reach, marks };
}

/** Sizes (in px) for stacking a stream's columns. */
export type StackSizes = {
  /** Height of a digit. */
  row: number;
  /** Extra room for a note's modifiers (staccato, accent, grace cross…), or 0 when hidden. */
  mod: number;
  /** Room taken by the origin line and by each octave line. */
  gap: number;
};

/** An octave line segment over columns [from, to) of the stream, centred at y (from the origin side). */
export type OctaveLine = { octave: number; from: number; to: number; y: number };

export type StackedStream = {
  /** Distance from the origin side of the stream to the near edge of each note's slot. */
  tops: Map<SheetNote, number>;
  /** Height of each note's slot: the digit, plus room for its modifiers. */
  heights: Map<SheetNote, number>;
  lines: OctaveLine[];
  height: number;
};

/**
 * Stacks every column of a stream outward from the origin line, independently of the
 * other columns: octave lines and notes in pitch order, each note as close to the origin
 * as it can sit. A skip takes only the room of its cross. A note keeps one height over its digit and all its hold dashes, so it
 * clears everything lower in pitch (and the octave lines below it) in every column it
 * covers. Octave lines sit right below the first thing of their octave in a column, so
 * they step between columns. Skips are the lowest thing in their column.
 */
export function stackStream(stream: StreamLayout, sizes: StackSizes): StackedStream {
  const { row, mod, gap } = sizes;
  const top = Array.from({ length: stream.frames }, () => gap);
  const count = Array.from({ length: stream.frames }, () => 0);
  const lineY: number[][] = [];
  const starts: number[] = [];
  const items: { note: SheetNote; from: number }[] = [];
  let offset = 0;
  for (const measure of stream.measures) {
    starts.push(offset);
    for (const note of measure.notes) items.push({ note, from: offset + note.frame });
    offset += measure.frames;
  }
  items.sort((a, b) => a.note.midi - b.note.midi || a.from - b.from);
  const tops = new Map<SheetNote, number>();
  const heights = new Map<SheetNote, number>();
  for (const { note, from } of items) {
    const to = from + note.frames;
    let level = 0;
    for (let c = from; c < to; c++) {
      while (count[c] < note.octave) {
        count[c] += 1;
        (lineY[count[c]] ??= [])[c] = top[c] + gap / 2;
        top[c] += gap;
      }
      level = Math.max(level, top[c]);
    }
    // A skip has no digit: only its cross, right past the origin line.
    const height = note.skip ? mod : row + (hasModifier(note) ? mod : 0);
    tops.set(note, level);
    heights.set(note, height);
    for (let c = from; c < to; c++) top[c] = level + height;
  }
  // Merge each octave's line into runs of equal height, broken at barlines.
  const lines: OctaveLine[] = [];
  const barline = new Set(starts);
  lineY.forEach((ys, octave) => {
    if (!ys) return;
    let run: OctaveLine | undefined;
    for (let c = 0; c <= stream.frames; c++) {
      const y = ys[c];
      if (run && (y === undefined || y !== run.y || barline.has(c))) { lines.push(run); run = undefined; }
      if (y === undefined) continue;
      if (run) run.to = c + 1;
      else run = { octave, from: c, to: c + 1, y };
    }
  });
  return { tops, heights, lines, height: Math.max(gap, ...top) };
}

/** A stream: a line of measures. */
function stream(measures: MeasureLayout[]): StreamLayout {
  return { measures, frames: measures.reduce((sum, measure) => sum + measure.frames, 0) };
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
 * (same columns, so a column is the same moment in both hands) and both hands wrap at the same measures.
 */
export function layoutSystems(measures: SongMeasure[], width: number, separate: boolean): SystemLayout[] {
  if (!separate) {
    return layoutStreams(measures.map((measure, index) => layoutMeasure(measure, index)), width).map((s) => ({ hands: [{ hand: 'both', stream: s }] }));
  }
  const right = measures.map((measure, index) => layoutMeasure(measure, index, 'right'));
  const left = measures.map((measure, index) => layoutMeasure(measure, index, 'left'));
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
