import { AudioEngine } from '../audio/engine';
import type { InstrumentDefinition } from '../audio/types';
import { Timeline, type Position } from './timeline';
import type { Song } from './types';

/** MuseScore-style playback of the loaded song with one instrument from the app's pack. */
export class Player {
  playing = $state(false);
  /** Playback speed multiplier (1 = the score's tempo). */
  speed = $state(1);
  position = $state<Position>({ measure: 0, tick: 0 });
  private engine: AudioEngine;
  timeline = $state.raw<Timeline | undefined>();
  private timer?: ReturnType<typeof setInterval>;
  private origin = 0;   // performance.now() at song time `from`
  private from = 0;     // song time (ms) playback started at
  private next = 0;     // index of the next event to dispatch

  constructor(instrument: InstrumentDefinition) {
    this.engine = new AudioEngine(instrument);
  }

  load(song: Song | undefined) {
    this.pause();
    this.timeline = song ? new Timeline(song) : undefined;
    this.position = { measure: 0, tick: 0 };
  }

  setInstrument(instrument: InstrumentDefinition) {
    const resume = this.playing;
    this.pause();
    void this.engine.selectInstrument(instrument).catch(() => {});
    if (resume) void this.play();
  }

  /** Call from a user gesture so mobile browsers allow audio. */
  async play() {
    const timeline = this.timeline;
    if (!timeline || this.playing) return;
    if (timeline.timeAt(this.position) >= timeline.duration) this.position = { measure: 0, tick: 0 };
    this.playing = true;
    try {
      await this.engine.unlock();
    } catch {
      this.playing = false;
      return;
    }
    if (!this.playing || this.timeline !== timeline) return;
    this.from = timeline.timeAt(this.position);
    this.origin = performance.now();
    this.next = timeline.events.findIndex((event) => event.time >= this.from);
    if (this.next < 0) this.next = timeline.events.length;
    this.timer = setInterval(() => this.tick(), 10);
    this.tick();
  }

  pause() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.playing = false;
    this.engine.setSustain(false);
    this.engine.stopAll();
  }

  toggle() {
    if (this.playing) this.pause();
    else void this.play();
  }

  /** Move the playhead to the start of a measure; playback continues from there. */
  seek(measure: number) {
    const resume = this.playing;
    this.pause();
    this.position = { measure, tick: 0 };
    if (resume) void this.play();
  }

  private tick() {
    const timeline = this.timeline;
    if (!timeline) return;
    const now = this.from + (performance.now() - this.origin) * this.speed;
    const events = timeline.events;
    while (this.next < events.length && events[this.next].time <= now) {
      const event = events[this.next++];
      if (event.id === 'pedal') this.engine.setSustain(event.on);
      else if (event.on) this.engine.noteOn(event.id, event.midi, event.velocity);
      else this.engine.noteOff(event.id);
    }
    if (now >= timeline.duration) {
      this.pause();
      this.position = { measure: 0, tick: 0 };
      return;
    }
    const position = timeline.positionAt(now);
    if (position.measure !== this.position.measure || Math.floor(position.tick) !== Math.floor(this.position.tick)) {
      this.position = { measure: position.measure, tick: Math.floor(position.tick) };
    }
  }

  /** Change speed without a jump: playback continues from where it is. */
  setSpeed(speed: number) {
    if (this.playing && this.timer) {
      this.from = this.songTime();
      this.origin = performance.now();
    }
    this.speed = speed;
  }

  /** The song time (ms) at the playhead, or where playback is right now. */
  songTime() {
    if (!this.timeline) return 0;
    return this.playing && this.timer ? this.from + (performance.now() - this.origin) * this.speed : this.timeline.timeAt(this.position);
  }

  dispose() {
    this.pause();
    this.engine.dispose();
  }
}
