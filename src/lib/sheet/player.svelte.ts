import { AudioEngine } from '../audio/engine';
import type { InstrumentDefinition } from '../audio/types';
import { LOOKAHEAD, type Metronome, type MetronomeSettings } from './metronome.svelte';
import { Timeline, type Position } from './timeline';
import type { Song } from './types';

/**
 * MuseScore-style playback of the loaded song with one instrument from the app's pack.
 * One transport moves a single pointer through the score; it runs while the music
 * (`notes`) or the metronome (`clicks`) is on, and each sounds only while it is on.
 */
export class Player {
  /** The transport is running: the pointer moves. */
  playing = $state(false);
  /** The music player is on: notes sound. */
  notes = $state(false);
  /** The metronome is on: clicks sound. */
  clicks = $state(false);
  /** Playback speed multiplier (1 = the score's tempo). */
  speed = $state(1);
  /** The shared pointer: where the music and the metronome are. */
  position = $state<Position>({ measure: 0, tick: 0 });
  timeline = $state.raw<Timeline | undefined>();
  readonly metronome: Metronome;
  private engine: AudioEngine;
  private timer?: ReturnType<typeof setInterval>;
  private origin = 0;   // performance.now() at song time `from`
  private from = 0;     // song time (ms) the transport was last anchored at
  private next = 0;     // index of the next note event to dispatch
  // Outputs whose audio is unlocked and lined up with the transport.
  private notesLive = false;
  private clicksLive = false;

  constructor(instrument: InstrumentDefinition, metronome: Metronome) {
    this.engine = new AudioEngine(instrument);
    this.metronome = metronome;
  }

  load(song: Song | undefined) {
    this.stop();
    this.timeline = song ? new Timeline(song) : undefined;
    this.metronome.load(this.timeline);
    this.position = { measure: 0, tick: 0 };
  }

  setInstrument(instrument: InstrumentDefinition) {
    const resume = this.notes;
    if (resume) void this.setOutputs(false, this.clicks);
    void this.engine.selectInstrument(instrument).catch(() => {});
    if (resume) void this.setOutputs(true, this.clicks);
  }

  /** The music player's start/pause; call from a user gesture so mobile browsers allow audio. */
  toggle() { void this.setOutputs(!this.notes, this.clicks); }
  /** The metronome's start/stop; call from a user gesture. */
  toggleMetronome() { void this.setOutputs(this.notes, !this.clicks); }
  play() { return this.setOutputs(true, this.clicks); }
  /** Turns the music off; the pointer keeps moving if the metronome is on. */
  pause() { void this.setOutputs(false, this.clicks); }
  /** Turns everything off; the pointer stays where it is. */
  stop() {
    this.notes = false;
    this.clicks = false;
    this.halt();
  }

  /** Turns the music and the metronome on or off; the transport runs while either is on. */
  async setOutputs(notes: boolean, clicks: boolean) {
    const timeline = this.timeline;
    if (!timeline) return;
    const addNotes = notes && !this.notes;
    const addClicks = clicks && !this.clicks;
    // Start unlocking audio right away, inside the user gesture.
    const unlock = Promise.all([addNotes ? this.engine.unlock() : undefined, addClicks ? this.metronome.unlock() : undefined]);
    const now = this.songTime();
    if (this.notes && !notes) this.quietNotes();
    if (this.clicks && !clicks) { this.clicksLive = false; this.metronome.silence(); }
    this.notes = notes;
    this.clicks = clicks;
    if (!notes && !clicks) { this.halt(); return; }
    // The transport's speed follows whichever output is on, so continue from where it is.
    if (this.timer) this.anchor(now);
    try {
      await unlock;
    } catch {
      if (addNotes) this.notes = false;
      if (addClicks) this.clicks = false;
      if (!this.notes && !this.clicks) this.halt();
      return;
    }
    if (this.timeline !== timeline) return;
    if (!this.timer) {
      if (!this.notes && !this.clicks) return;
      let from = timeline.timeAt(this.position);
      if (from >= timeline.duration) { this.position = { measure: 0, tick: 0 }; from = 0; }
      this.anchor(from);
    }
    const at = this.songTime();
    if (addNotes && this.notes) { this.seekNotes(at); this.notesLive = true; }
    if (addClicks && this.clicks) { this.metronome.seek(at); this.clicksLive = true; }
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), 10);
      this.playing = true;
      this.tick();
    }
  }

  /** Move the pointer to the start of a measure; whatever is on continues from there. */
  seek(measure: number) {
    this.position = { measure, tick: 0 };
    if (!this.timer || !this.timeline) return;
    const at = this.timeline.timeAt(this.position);
    this.anchor(at);
    if (this.notesLive) { this.quietNotes(); this.seekNotes(at); this.notesLive = true; }
    if (this.clicksLive) { this.metronome.silence(); this.metronome.seek(at); }
  }

  /** Change the music's speed without a jump: playback continues from where it is. */
  setSpeed(speed: number) {
    const now = this.songTime();
    this.speed = speed;
    this.retime(now);
  }

  /** Change the metronome's settings; a speed change continues from the current beat. */
  configureMetronome(settings: MetronomeSettings) {
    const now = this.songTime();
    this.metronome.configure(settings, this.timer ? now : undefined);
    this.retime(now);
  }

  /** The transport's speed: the music's while it is on, otherwise the metronome's. */
  private get rate() {
    return this.notes ? this.speed : this.metronome.settings.speed ?? 1;
  }

  private retime(now: number) {
    if (!this.timer) return;
    this.anchor(now);
    if (this.clicksLive) { this.metronome.silence(); this.metronome.seek(now); }
  }

  private anchor(time: number) {
    this.from = time;
    this.origin = performance.now();
  }

  private seekNotes(time: number) {
    const events = this.timeline?.events ?? [];
    this.next = events.findIndex((event) => event.time >= time);
    if (this.next < 0) this.next = events.length;
  }

  private quietNotes() {
    this.notesLive = false;
    this.engine.setSustain(false);
    this.engine.stopAll();
  }

  private halt() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.playing = false;
    this.quietNotes();
    this.clicksLive = false;
    this.metronome.silence();
  }

  private tick() {
    const timeline = this.timeline;
    if (!timeline) return;
    const now = this.songTime();
    if (this.notesLive) {
      const events = timeline.events;
      while (this.next < events.length && events[this.next].time <= now) {
        const event = events[this.next++];
        if (event.id === 'pedal') this.engine.setSustain(event.on);
        else if (event.on) this.engine.noteOn(event.id, event.midi, event.velocity);
        else this.engine.noteOff(event.id);
      }
    }
    if (this.clicksLive) {
      const rate = this.rate;
      this.metronome.schedule(now + LOOKAHEAD * rate, (time) => this.origin + (time - this.from) / rate);
    }
    if (now >= timeline.duration) {
      this.stop();
      this.position = { measure: 0, tick: 0 };
      return;
    }
    const position = timeline.positionAt(Math.max(0, now));
    if (position.measure !== this.position.measure || Math.floor(position.tick) !== Math.floor(this.position.tick)) {
      this.position = { measure: position.measure, tick: Math.floor(position.tick) };
    }
  }

  /** The song time (ms) at the pointer, or where the transport is right now. */
  songTime() {
    if (!this.timeline) return 0;
    return this.timer ? this.from + (performance.now() - this.origin) * this.rate : this.timeline.timeAt(this.position);
  }

  dispose() {
    this.stop();
    this.engine.dispose();
    this.metronome.dispose();
  }
}
