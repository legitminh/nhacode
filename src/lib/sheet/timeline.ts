import type { Song } from './types';

/** A position in the score: measure index and tick offset inside it. */
export type Position = { measure: number; tick: number };
export type NoteEvent = { time: number; on: boolean; id: string; midi: number };

const DEFAULT_QPM = 100;

/**
 * Turns a simplified song into timed note-on/off events (ms) and converts between
 * score positions and time, following the score's tempo changes. Tied segments are
 * merged so a held note sounds once.
 */
export class Timeline {
  readonly events: NoteEvent[] = [];
  readonly duration: number;
  /** Absolute tick where each measure starts. */
  private readonly starts: number[] = [];
  /** Tempo segments: from absolute tick `tick` (at time `time`) each tick lasts `ms`. */
  private readonly segments: { tick: number; time: number; ms: number }[] = [];
  private readonly totalTicks: number;
  private readonly song: Song;

  constructor(song: Song) {
    this.song = song;
    let tick = 0;
    const changes: { tick: number; qpm: number }[] = [];
    for (const measure of song.measures) {
      this.starts.push(tick);
      for (const tempo of measure.tempos ?? []) changes.push({ tick: tick + tempo.start, qpm: tempo.qpm });
      tick += measure.duration;
    }
    this.totalTicks = tick;
    const perTick = (qpm: number) => 60000 / (qpm * song.ticksPerQuarter);
    this.segments.push({ tick: 0, time: 0, ms: perTick(changes[0]?.tick === 0 ? changes[0].qpm : DEFAULT_QPM) });
    for (const change of changes) {
      const last = this.segments.at(-1)!;
      const segment = { tick: change.tick, time: last.time + (change.tick - last.tick) * last.ms, ms: perTick(change.qpm) };
      if (change.tick === last.tick) this.segments[this.segments.length - 1] = { ...segment, time: last.time };
      else this.segments.push(segment);
    }
    this.duration = this.timeOf(this.totalTicks);

    const sounding = new Map<number, { id: string; end: number }[]>();
    const notes: { id: string; midi: number; start: number; end: number }[] = [];
    song.measures.forEach((measure, m) => {
      measure.notes.forEach((note, n) => {
        const start = this.starts[m] + note.start;
        const end = start + note.duration;
        const held = note.tied ? sounding.get(note.midi)?.find((item) => item.end === start) : undefined;
        if (held) {
          held.end = end;
          notes.find((item) => item.id === held.id)!.end = end;
          return;
        }
        const item = { id: `${m}:${n}`, midi: note.midi, start, end };
        notes.push(item);
        sounding.set(note.midi, [...(sounding.get(note.midi) ?? []).filter((other) => other.end >= start), { id: item.id, end }]);
      });
    });
    for (const note of notes) {
      this.events.push({ time: this.timeOf(note.start), on: true, id: note.id, midi: note.midi });
      this.events.push({ time: this.timeOf(note.end), on: false, id: note.id, midi: note.midi });
    }
    // Releases before attacks at the same moment, so a repeated key re-strikes.
    this.events.sort((a, b) => a.time - b.time || Number(a.on) - Number(b.on));
  }

  get measureCount() { return this.song.measures.length; }

  private segmentAtTick(tick: number) {
    let index = 0;
    while (index + 1 < this.segments.length && this.segments[index + 1].tick <= tick) index++;
    return this.segments[index];
  }

  /** Milliseconds from the start of the song to an absolute tick. */
  timeOf(tick: number) {
    const segment = this.segmentAtTick(tick);
    return segment.time + (tick - segment.tick) * segment.ms;
  }

  timeAt(position: Position) {
    return this.timeOf((this.starts[position.measure] ?? this.totalTicks) + position.tick);
  }

  /** The score position sounding at a time. */
  positionAt(time: number): Position {
    let index = 0;
    while (index + 1 < this.segments.length && this.segments[index + 1].time <= time) index++;
    const segment = this.segments[index];
    const tick = Math.min(this.totalTicks, segment.tick + (time - segment.time) / segment.ms);
    let measure = 0;
    while (measure + 1 < this.starts.length && this.starts[measure + 1] <= tick) measure++;
    return { measure, tick: tick - this.starts[measure] };
  }
}
