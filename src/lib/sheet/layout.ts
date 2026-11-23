import type { SongMeasure } from './types';

/** A0 is the lowest key; octaves start at A, matching the piano grid. */
const A0 = 21;

export type SheetNote = {
  octave: number;
  /** Pitch class from A, written in lowercase hex: 0 is A, b is G♯. */
  digit: string;
  /** Row inside the octave block, counted from the top. */
  lane: number;
  /** First time frame of the note inside the measure. */
  frame: number;
  /** Number of time frames the note covers (at least 1). */
  frames: number;
  /** A continuation from the previous measure: draw only the hold line. */
  tied: boolean;
  midi: number;
};

export type MeasureLayout = {
  number: string;
  frames: number;
  /** Lane count for each octave from 0 to the highest octave used. */
  lanes: number[];
  notes: SheetNote[];
  /**
   * reach[f] is the highest octave sounding (started or held) in time frame f,
   * or -1 when nothing sounds. Octave line o is drawn over frame f when reach[f] >= o.
   */
  reach: number[];
};

export type StreamLayout = {
  measures: MeasureLayout[];
  /** Lane count for each octave, shared by every measure in the stream. */
  lanes: number[];
  frames: number;
};

export function octaveOf(midi: number): number {
  return Math.max(0, Math.floor((midi - A0) / 12));
}

export function digitOf(midi: number): string {
  return ((((midi - A0) % 12) + 12) % 12).toString(16);
}

/**
 * Lays out one measure. Notes are split into octave blocks; inside a block,
 * any two notes that share a time frame are stacked by ascending pitch
 * (lower pitch on a higher row). Notes that do not overlap may share a row.
 */
export function layoutMeasure(measure: SongMeasure): MeasureLayout {
  const resolution = measure.resolution;
  const frames = Math.max(1, Math.round(measure.duration / resolution));
  const reach = Array.from({ length: frames }, () => -1);
  const placed: SheetNote[] = [];
  const sorted = [...measure.notes]
    .filter((note) => note.midi >= A0 && note.duration > 0 && note.start < measure.duration)
    .sort((a, b) => a.midi - b.midi || a.start - b.start);

  for (const note of sorted) {
    const frame = Math.floor(note.start / resolution);
    const end = Math.min(frames, Math.max(frame + 1, Math.round((note.start + note.duration) / resolution)));
    const octave = octaveOf(note.midi);
    // A row below every overlapping lower (or equal, earlier) note of the same octave.
    let lane = 0;
    for (const other of placed) {
      if (other.octave === octave && other.frame < end && frame < other.frame + other.frames) {
        lane = Math.max(lane, other.lane + 1);
      }
    }
    placed.push({ octave, digit: digitOf(note.midi), lane, frame, frames: end - frame, tied: !!note.tied, midi: note.midi });
    for (let f = frame; f < end; f++) reach[f] = Math.max(reach[f], octave);
  }

  const top = placed.reduce((max, note) => Math.max(max, note.octave), 0);
  const lanes = Array.from({ length: top + 1 }, () => 0);
  for (const note of placed) lanes[note.octave] = Math.max(lanes[note.octave], note.lane + 1);
  return { number: measure.number, frames, lanes, notes: placed, reach };
}

/** Shares lane counts across the measures of one stream. */
function stream(measures: MeasureLayout[]): StreamLayout {
  const lanes: number[] = [];
  let frames = 0;
  for (const measure of measures) {
    frames += measure.frames;
    measure.lanes.forEach((count, octave) => { lanes[octave] = Math.max(lanes[octave] ?? 0, count); });
  }
  return { measures, lanes: Array.from({ length: Math.max(1, lanes.length) }, (_, o) => lanes[o] ?? 0), frames };
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
/** One line of the sheet: a single stream, or the right-hand stream above the left-hand one. */
export type SystemLayout = { hands: { hand: Hand; stream: StreamLayout }[] };

/**
 * Lays out a song as systems. With `separate`, each measure is laid out once per hand
 * (same frames, so the hands stay aligned) and both hands wrap at the same measures.
 */
export function layoutSystems(measures: SongMeasure[], width: number, separate: boolean): SystemLayout[] {
  if (!separate) {
    return layoutStreams(measures.map(layoutMeasure), width).map((s) => ({ hands: [{ hand: 'both', stream: s }] }));
  }
  const onlyHand = (measure: SongMeasure, left: boolean) =>
    layoutMeasure({ ...measure, notes: measure.notes.filter((note) => (note.hand === 'left') === left) });
  const right = measures.map((measure) => onlyHand(measure, false));
  const left = measures.map((measure) => onlyHand(measure, true));
  let index = 0;
  return layoutStreams(right, width).map((rightStream) => {
    const count = rightStream.measures.length;
    const leftStream = stream(left.slice(index, index + count));
    index += count;
    return { hands: [{ hand: 'right', stream: rightStream }, { hand: 'left', stream: leftStream }] };
  });
}
