/** A note segment inside one measure. Times are in the song's ticks. */
export type SongNote = {
  /** Offset from the start of the measure. */
  start: number;
  duration: number;
  midi: number;
  /** True when this segment continues a note tied over from the previous measure. */
  tied?: boolean;
  /** Which hand plays it; omitted means the right hand. */
  hand?: 'left';
  /** A grace note: no written duration, played quickly just before the note it leads into. */
  grace?: boolean;
  /** Articulations from the score. */
  art?: Articulation[];
};

export type Articulation = 'staccato' | 'tenuto' | 'accent' | 'trill' | 'fermata' | 'arpeggio';

/** A score marking: time signature, tempo, dynamic, hairpin (crescendo/diminuendo/stop) or a short direction. */
export type SongMark = { start: number; kind: 'time' | 'tempo' | 'dynamic' | 'wedge' | 'words'; text: string };

export type SongMeasure = {
  number: string;
  /** Length of the measure in ticks. */
  duration: number;
  /** Smallest note or rest unit in the measure, in ticks. */
  resolution: number;
  notes: SongNote[];
  marks?: SongMark[];
  /** Playback tempo changes in quarter notes per minute. */
  tempos?: { start: number; qpm: number }[];
  /** Sustain pedal marks: start (down), stop (up), change (up and straight back down). */
  pedals?: { start: number; type: 'start' | 'stop' | 'change' }[];
  /** Time signature [beats, beat type] where it is set; later measures keep it. */
  time?: [number, number];
  /** Repeat barlines: `start` at the measure's left edge, `end` (play count) at its right edge. */
  repeat?: { start?: boolean; end?: number };
  /** The volta (1st/2nd ending) passes this measure is played on. */
  ending?: number[];
  /** Navigation: segno and coda are jump targets; fine, toCoda, dacapo and dalsegno act at the measure's end. */
  jump?: { segno?: boolean; coda?: boolean; fine?: boolean; toCoda?: boolean; dacapo?: boolean; dalsegno?: boolean };
  /** In a played (expanded) song: the measure's index in the score. */
  source?: number;
  /** In a played song: a copy of the score's pickup, whose beats line up with its end. */
  pickup?: boolean;
  /**
   * In a played song: a short measure followed (or preceded) by a pickup it makes a full
   * measure with, so neither shows deleted time frames.
   */
  joined?: boolean;
};

/** The simplified, staff-free form of a score: which key is pressed when. */
export type Song = {
  id: string;
  title: string;
  composer: string;
  ticksPerQuarter: number;
  source: { dataset: string; path: string; url?: string; license?: string };
  measures: SongMeasure[];
};
