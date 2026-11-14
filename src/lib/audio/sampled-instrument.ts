import type { Instrument, Voice } from './types';

export type Sample = { midi: number; url: string };

/** Sample banks and synthesis engines share the same small Instrument interface. */
export class SampledInstrument implements Instrument {
  private buffers = new Map<number, AudioBuffer>();
  private context?: AudioContext;
  private output?: AudioNode;
  private voices = new Set<Voice>();
  private abort = new AbortController();

  constructor(
    readonly id: string,
    readonly name: string,
    private samples: readonly Sample[],
    private options: { sustain?: boolean } = {},
  ) {}

  async prepare(context: AudioContext, output: AudioNode) {
    this.context = context;
    this.output = output;
    let next = 0;
    // Bounded decoding/fetching keeps startup responsive on mobile devices.
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (next < this.samples.length) {
        const sample = this.samples[next++];
        const response = await fetch(sample.url, { signal: this.abort.signal });
        if (!response.ok) throw new Error(`Could not load ${this.name} sample ${sample.midi}.`);
        const decoded = await context.decodeAudioData(await response.arrayBuffer());
        if (this.abort.signal.aborted) return;
        const buffer = this.options.sustain ? this.prepareLoop(context, decoded) : decoded;
        this.buffers.set(sample.midi, buffer);
      }
    }));
  }

  private prepareLoop(context: AudioContext, source: AudioBuffer) {
    const buffer = context.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
    const start = Math.floor(source.length * 0.35);
    const end = Math.floor(source.length * 0.75);
    const fade = Math.min(Math.floor(source.sampleRate * 0.05), Math.floor((end - start) / 4));
    for (let channel = 0; channel < source.numberOfChannels; channel++) {
      const input = source.getChannelData(channel);
      const output = buffer.getChannelData(channel);
      output.set(input);
      // Crossfade into the start of the loop to avoid a discontinuity on wrap.
      for (let i = 0; i < fade; i++) {
        const blend = i / fade;
        output[end - fade + i] = input[end - fade + i] * (1 - blend) + input[start - fade + i] * blend;
      }
    }
    return buffer;
  }

  noteOn(midi: number, velocity = 0.8): Voice {
    const context = this.context;
    const output = this.output;
    const pitches = [...this.buffers.keys()];
    const nearest = pitches.reduce((best, pitch) => Math.abs(pitch - midi) < Math.abs(best - midi) ? pitch : best, pitches[0]);
    const buffer = this.buffers.get(nearest);
    if (!context || !output || !buffer) throw new Error('Instrument is still loading.');

    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    if (this.options.sustain) {
      source.loop = true;
      source.loopStart = Math.floor(buffer.length * 0.35) / buffer.sampleRate;
      source.loopEnd = Math.floor(buffer.length * 0.75) / buffer.sampleRate;
    }
    source.playbackRate.value = 2 ** ((midi - nearest) / 12);
    gain.gain.value = Math.max(0, Math.min(1, velocity));
    source.connect(gain).connect(output);
    let released = false;
    const voice: Voice = {
      release: (immediate = false) => {
        if (released) return;
        released = true;
        const now = context.currentTime;
        const duration = immediate ? 0.015 : this.options.sustain ? 0.06 : 0.15;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(0, now, duration / 5);
        source.stop(now + duration);
      },
    };
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      gain.disconnect();
    };
    this.voices.add(voice);
    source.start();
    return voice;
  }

  dispose() {
    this.abort.abort();
    this.voices.forEach((voice) => voice.release(true));
    this.voices.clear();
    this.buffers.clear();
  }
}
