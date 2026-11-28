import type { Click, Timeline } from './timeline';

/** Click strengths out of 8 (0 is silent) and in-between clicks per beat. */
export type MetronomeSettings = { strong: number; weak: number; between: number; sub: number; speed?: number };
export const DEFAULT_METRONOME: MetronomeSettings = { strong: 8, weak: 5, between: 0, sub: 3, speed: 1 };

const PITCH: Record<Click['kind'], number> = { strong: 1568, weak: 1175, sub: 880 };
/** Milliseconds of clicks scheduled ahead on the audio clock. */
export const LOOKAHEAD = 120;

/**
 * The metronome's sound: clicks that follow the score's meter and tempo. It has no clock
 * or cursor of its own; the player's transport drives it (see Player), so the metronome
 * and the music share one pointer.
 */
export class Metronome {
  settings: MetronomeSettings;
  private context?: AudioContext;
  private clicks: Click[] = [];
  private timeline?: Timeline;
  private next = 0;
  private scheduled: OscillatorNode[] = [];

  constructor(settings: MetronomeSettings) {
    this.settings = settings;
  }

  load(timeline: Timeline | undefined) {
    this.silence();
    this.timeline = timeline;
    this.clicks = timeline?.clicks(this.settings.between) ?? [];
    this.next = 0;
  }

  /** Applies new settings; `now` is the transport's song time, if it is running. */
  configure(settings: MetronomeSettings, now?: number) {
    const rebuild = settings.between !== this.settings.between;
    this.settings = settings;
    if (rebuild && this.timeline) {
      this.clicks = this.timeline.clicks(settings.between);
      if (now !== undefined) this.seek(now);
    }
  }

  /** Call from a user gesture so audio may start. */
  async unlock() {
    this.context ??= new AudioContext({ latencyHint: 'interactive' });
    await this.context.resume();
  }

  /** The next click is the first one at or after song time `time` (ms). */
  seek(time: number) {
    this.next = this.clicks.findIndex((click) => click.time >= time - 1);
    if (this.next < 0) this.next = this.clicks.length;
  }

  /**
   * Schedules every click up to song time `horizon`; `wallAt` gives the performance.now()
   * time at which a song time sounds.
   */
  schedule(horizon: number, wallAt: (time: number) => number) {
    const context = this.context;
    if (!context) return;
    this.scheduled = this.scheduled.filter((osc) => (osc as OscillatorNode & { end: number }).end > context.currentTime);
    const offset = context.currentTime - performance.now() / 1000;
    while (this.next < this.clicks.length && this.clicks[this.next].time <= horizon) {
      const click = this.clicks[this.next++];
      this.sound(click, wallAt(click.time) / 1000 + offset);
    }
  }

  /** Stops clicks already scheduled ahead (on pause, seek or a speed change). */
  silence() {
    for (const osc of this.scheduled) { try { osc.stop(); } catch { /* already stopped */ } }
    this.scheduled = [];
  }

  private sound(click: Click, at: number) {
    const context = this.context!;
    const level = { strong: this.settings.strong, weak: this.settings.weak, sub: this.settings.sub }[click.kind] / 8;
    if (level <= 0) return;
    const osc = context.createOscillator() as OscillatorNode & { end: number };
    const gain = context.createGain();
    osc.frequency.value = PITCH[click.kind];
    const start = Math.max(at, context.currentTime);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.6 * level, start + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
    osc.connect(gain).connect(context.destination);
    osc.start(start);
    osc.stop(start + 0.06);
    osc.end = start + 0.06;
    this.scheduled.push(osc);
  }

  dispose() {
    this.silence();
    void this.context?.close();
  }
}
