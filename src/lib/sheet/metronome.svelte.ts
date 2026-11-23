import type { Click, Position, Timeline } from './timeline';

/** Click strengths out of 8 (0 is silent) and in-between clicks per beat. */
export type MetronomeSettings = { strong: number; weak: number; between: number; sub: number; speed?: number };
export const DEFAULT_METRONOME: MetronomeSettings = { strong: 8, weak: 5, between: 0, sub: 3, speed: 1 };

const PITCH: Record<Click['kind'], number> = { strong: 1568, weak: 1175, sub: 880 };
const LOOKAHEAD = 0.12; // seconds of clicks scheduled ahead on the audio clock

/** A metronome that follows the score's meter and tempo, with its own cursor. */
export class Metronome {
  running = $state(false);
  position = $state<Position | undefined>();
  settings: MetronomeSettings;
  private context?: AudioContext;
  private timeline?: Timeline;
  private clicks: Click[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private next = 0;
  private origin = 0; // audio-clock time of song time `from`
  private from = 0;

  constructor(settings: MetronomeSettings) {
    this.settings = settings;
  }

  load(timeline: Timeline | undefined) {
    this.stop();
    this.timeline = timeline;
    this.clicks = timeline?.clicks(this.settings.between) ?? [];
  }

  private get speed() { return this.settings.speed ?? 1; }

  configure(settings: MetronomeSettings) {
    if (this.running && this.context && (settings.speed ?? 1) !== this.speed) {
      // Re-anchor so a speed change continues from the current beat.
      this.from = this.songTime();
      this.origin = this.context.currentTime;
    }
    const rebuild = settings.between !== this.settings.between;
    this.settings = settings;
    if (rebuild && this.timeline) {
      const now = this.running ? this.songTime() : undefined;
      this.clicks = this.timeline.clicks(settings.between);
      if (now !== undefined) this.next = this.clicks.findIndex((click) => click.time >= now);
    }
  }

  /** Start at a song time (ms); call from a user gesture so audio may start. */
  async start(from: number) {
    if (!this.timeline || this.running) return;
    this.context ??= new AudioContext({ latencyHint: 'interactive' });
    this.running = true;
    try { await this.context.resume(); } catch { this.running = false; return; }
    if (!this.running) return;
    this.from = from >= this.timeline.duration ? 0 : from;
    this.origin = this.context.currentTime + 0.05;
    this.next = this.clicks.findIndex((click) => click.time >= this.from - 1);
    if (this.next < 0) this.next = this.clicks.length;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.running = false;
    this.position = undefined;
  }

  private songTime() {
    return this.from + ((this.context?.currentTime ?? 0) - this.origin) * 1000 * this.speed;
  }

  private schedule() {
    const context = this.context;
    if (!context || !this.timeline) return;
    const horizon = this.from + (context.currentTime + LOOKAHEAD - this.origin) * 1000 * this.speed;
    while (this.next < this.clicks.length && this.clicks[this.next].time <= horizon) {
      const click = this.clicks[this.next++];
      this.sound(click, this.origin + (click.time - this.from) / 1000 / this.speed);
    }
    const now = this.songTime();
    if (now >= this.timeline.duration) { this.stop(); return; }
    const position = this.timeline.positionAt(Math.max(0, now));
    const tick = Math.floor(position.tick);
    if (position.measure !== this.position?.measure || tick !== this.position?.tick) this.position = { measure: position.measure, tick };
  }

  private sound(click: Click, at: number) {
    const context = this.context!;
    const level = { strong: this.settings.strong, weak: this.settings.weak, sub: this.settings.sub }[click.kind] / 8;
    if (level <= 0) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = PITCH[click.kind];
    const start = Math.max(at, context.currentTime);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.6 * level, start + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
    osc.connect(gain).connect(context.destination);
    osc.start(start);
    osc.stop(start + 0.06);
  }

  dispose() {
    this.stop();
    void this.context?.close();
  }
}
