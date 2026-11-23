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
};

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
  /** Time signature [beats, beat type] where it is set; later measures keep it. */
  time?: [number, number];
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
