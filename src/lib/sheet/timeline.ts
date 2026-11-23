import type { Song } from './types';

/** A position in the score: measure index and tick offset inside it. */
export type Position = { measure: number; tick: number };
export type NoteEvent = { time: number; on: boolean; id: string; midi: number; velocity: number };
/** A metronome click: the first beat of a full measure is strong; 'sub' clicks fall between beats. */
export type Click = { time: number; kind: 'strong' | 'weak' | 'sub'; position: Position };

const DEFAULT_QPM = 100;

/** Loudness for each notated dynamic, as a note velocity (0–1). */
export const DYNAMIC_LEVELS: Record<string, number> = {
  pppp: .18, ppp: .25, pp: .33, p: .42, mp: .52, mf: .62, f: .72, ff: .82, fff: .9, ffff: .96,
};
/** Sudden accents (sf, sfz, fz…) and fp: a one-note boost, or loud-then-soft. */
const SUDDEN = new Set(['sf', 'sfz', 'sffz', 'fz', 'rf', 'rfz']);
const DEFAULT_LEVEL = DYNAMIC_LEVELS.mf;
const HAIRPIN_STEP = .12;
const ACCENT_BOOST = .15;
const ARPEGGIO_SPREAD = 35; // ms between the notes of a rolled chord, low to high

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

    const dynamics = this.dynamics();
    const sounding = new Map<number, { id: string; end: number }[]>();
    const notes: { id: string; midi: number; start: number; end: number; velocity: number; art: string[] }[] = [];
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
        const art = note.art ?? [];
        const velocity = Math.min(1, dynamics(start) + (art.includes('accent') ? ACCENT_BOOST : 0));
        const item = { id: `${m}:${n}`, midi: note.midi, start, end, velocity, art };
        notes.push(item);
        sounding.set(note.midi, [...(sounding.get(note.midi) ?? []).filter((other) => other.end >= start), { id: item.id, end }]);
      });
    });
    // Rolled chords: notes marked arpeggio that start together enter one by one, low to high.
    const rolled = new Map<number, typeof notes>();
    for (const note of notes) if (note.art.includes('arpeggio')) rolled.set(note.start, [...(rolled.get(note.start) ?? []), note]);
    const delay = new Map<string, number>();
    for (const chord of rolled.values()) chord.sort((a, b) => a.midi - b.midi).forEach((note, i) => delay.set(note.id, i * ARPEGGIO_SPREAD));
    for (const note of notes) {
      // Staccato sounds for half the written length.
      const end = note.art.includes('staccato') ? note.start + (note.end - note.start) / 2 : note.end;
      const on = this.timeOf(note.start) + (delay.get(note.id) ?? 0);
      this.events.push({ time: on, on: true, id: note.id, midi: note.midi, velocity: note.velocity });
      this.events.push({ time: Math.max(on + 1, this.timeOf(end)), on: false, id: note.id, midi: note.midi, velocity: 0 });
    }
    // Releases before attacks at the same moment, so a repeated key re-strikes.
    this.events.sort((a, b) => a.time - b.time || Number(a.on) - Number(b.on));
  }

  get measureCount() { return this.song.measures.length; }

  /**
   * Loudness at an absolute tick from the notated dynamics: each marking sets the level,
   * sf/sfz/fz boost only the notes they fall on, and a crescendo or diminuendo hairpin
   * ramps to the next marking (or one step louder/softer when none follows it).
   */
  private dynamics(): (tick: number) => number {
    type Mark = { tick: number; kind: string; text: string };
    const marks: Mark[] = [];
    this.song.measures.forEach((measure, m) => {
      for (const mark of measure.marks ?? []) {
        if (mark.kind === 'dynamic' || mark.kind === 'wedge') marks.push({ tick: this.starts[m] + mark.start, kind: mark.kind, text: mark.text });
      }
    });
    marks.sort((a, b) => a.tick - b.tick);
    const steps: { tick: number; level: number }[] = [];
    const sudden: number[] = [];
    const ramps: { from: number; to: number; start: number; end: number }[] = [];
    let level = DEFAULT_LEVEL;
    let wedge: { tick: number; kind: string; level: number } | undefined;
    for (const [i, mark] of marks.entries()) {
      if (mark.kind === 'dynamic') {
        if (SUDDEN.has(mark.text)) { sudden.push(mark.tick); continue; }
        level = mark.text === 'fp' ? DYNAMIC_LEVELS.p : DYNAMIC_LEVELS[mark.text] ?? level;
        steps.push({ tick: mark.tick, level });
      } else if (mark.text === 'crescendo' || mark.text === 'diminuendo') {
        wedge = { tick: mark.tick, kind: mark.text, level };
      } else if (wedge) {
        const next = marks.slice(i + 1).find((other) => other.kind === 'dynamic' && !SUDDEN.has(other.text) && DYNAMIC_LEVELS[other.text]);
        const target = next && next.tick - mark.tick <= 4 * this.song.ticksPerQuarter
          ? DYNAMIC_LEVELS[next.text]
          : Math.min(1, Math.max(.1, wedge.level + (wedge.kind === 'crescendo' ? HAIRPIN_STEP : -HAIRPIN_STEP)));
        ramps.push({ from: wedge.level, to: target, start: wedge.tick, end: Math.max(mark.tick, wedge.tick + 1) });
        level = target;
        steps.push({ tick: mark.tick, level });
        wedge = undefined;
      }
    }
    return (tick: number) => {
      const ramp = ramps.find((r) => r.start <= tick && tick < r.end);
      let value = ramp ? ramp.from + (ramp.to - ramp.from) * (tick - ramp.start) / (ramp.end - ramp.start) : DEFAULT_LEVEL;
      if (!ramp) for (const step of steps) { if (step.tick <= tick) value = step.level; else break; }
      return Math.min(1, value + (sudden.includes(tick) ? .2 : 0));
    };
  }

  /**
   * Metronome clicks from the time signatures: one per beat (compound meters such as
   * 6/8 beat in dotted quarters), plus `between` evenly spaced clicks inside each beat.
   * A pickup measure's beats line up with its end and carry no strong beat.
   */
  clicks(between = 0): Click[] {
    const clicks: Click[] = [];
    const tpq = this.song.ticksPerQuarter;
    let meter: [number, number] = [4, 4];
    this.song.measures.forEach((measure, m) => {
      if (measure.time) meter = measure.time;
      const [beats, type] = meter;
      const compound = type === 8 && beats > 3 && beats % 3 === 0;
      const beat = (tpq * 4 / type) * (compound ? 3 : 1);
      const full = beats * tpq * 4 / type;
      const pickup = measure.duration < full;
      const offset = pickup ? measure.duration % beat : 0;
      for (let tick = offset; tick < measure.duration; tick += beat) {
        const at = (t: number, kind: Click['kind']) =>
          clicks.push({ time: this.timeOf(this.starts[m] + t), kind, position: { measure: m, tick: t } });
        at(tick, tick === 0 && !pickup ? 'strong' : 'weak');
        for (let j = 1; j <= between; j++) {
          const sub = tick + (beat * j) / (between + 1);
          if (sub < measure.duration) at(sub, 'sub');
        }
      }
    });
    return clicks;
  }

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
