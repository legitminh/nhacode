import type { Instrument, Voice } from './types';

export type Sample = { midi: number; url: string };

/** Sample banks and synthesis engines share the same small Instrument interface. */
export class SampledInstrument implements Instrument {
  private buffers = new Map<number, AudioBuffer>();
  private context?: AudioContext;
  private output?: AudioNode;
  private voices = new Set<Voice>();

  constructor(
    readonly id: string,
    readonly name: string,
    private samples: readonly Sample[],
  ) {}

  async prepare(context: AudioContext, output: AudioNode) {
    this.context = context;
    this.output = output;
    let next = 0;
    // Bounded decoding/fetching keeps startup responsive on mobile devices.
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (next < this.samples.length) {
        const sample = this.samples[next++];
        const response = await fetch(sample.url);
        if (!response.ok) throw new Error(`Could not load piano sample ${sample.midi}.`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(sample.midi, buffer);
      }
    }));
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
    source.playbackRate.value = 2 ** ((midi - nearest) / 12);
    gain.gain.value = Math.max(0, Math.min(1, velocity));
    source.connect(gain).connect(output);
    let released = false;
    const voice: Voice = {
      release: (immediate = false) => {
        if (released) return;
        released = true;
        const now = context.currentTime;
        const duration = immediate ? 0.015 : 0.22;
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
    this.voices.forEach((voice) => voice.release(true));
    this.voices.clear();
    this.buffers.clear();
  }
}
