import type { Instrument, InstrumentDefinition, Voice } from './types';

export class AudioEngine {
  private context?: AudioContext;
  private gain?: GainNode;
  private instrument?: Instrument;
  private loading?: Promise<void>;
  private voices = new Map<string, Voice>();
  private sustained = new Set<Voice>();
  private pedal = false;
  private volume = 0.65;
  private compressor?: DynamicsCompressorNode;

  constructor(private definition: InstrumentDefinition) {}

  prepare(): Promise<void> {
    if (this.loading) return this.loading;
    this.context ??= new AudioContext({ latencyHint: 'interactive' });
    this.gain ??= this.context.createGain();
    this.gain.gain.value = this.volume * 0.65;
    // A compressor gives chords headroom without hard clipping.
    if (!this.compressor) {
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 4;
      this.gain.connect(this.compressor).connect(this.context.destination);
    }
    const instrument = this.definition.create();
    this.instrument = instrument;
    this.loading = instrument.prepare(this.context, this.gain).then(() => {
      if (this.instrument !== instrument) instrument.dispose();
    }).catch((error) => {
      instrument.dispose();
      if (this.instrument === instrument) {
        this.instrument = undefined;
        this.loading = undefined;
      }
      throw error;
    });
    return this.loading;
  }

  selectInstrument(definition: InstrumentDefinition) {
    this.stopAll();
    this.instrument?.dispose();
    this.instrument = undefined;
    this.loading = undefined;
    this.definition = definition;
    return this.prepare();
  }

  /** Call directly inside a trusted pointer/key gesture for mobile audio unlock. */
  async unlock() {
    const prepared = this.prepare();
    const resumed = this.context!.resume();
    await Promise.all([prepared, resumed]);
  }

  noteOn(id: string, midi: number) {
    this.voices.get(id)?.release(true);
    this.voices.set(id, this.instrument!.noteOn(midi));
  }

  noteOff(id: string) {
    const voice = this.voices.get(id);
    if (!voice) return;
    this.voices.delete(id);
    if (this.pedal) this.sustained.add(voice);
    else voice.release();
  }

  setSustain(enabled: boolean) {
    this.pedal = enabled;
    if (!enabled) {
      this.sustained.forEach((voice) => voice.release());
      this.sustained.clear();
    }
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.context && this.gain) this.gain.gain.setTargetAtTime(this.volume * 0.65, this.context.currentTime, 0.02);
  }

  stopAll() {
    this.voices.forEach((voice) => voice.release(true));
    this.sustained.forEach((voice) => voice.release(true));
    this.voices.clear();
    this.sustained.clear();
  }

  dispose() {
    this.stopAll();
    this.instrument?.dispose();
    void this.context?.close();
  }
}
