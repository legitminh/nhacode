export interface Voice {
  release(immediate?: boolean): void;
}

export interface Instrument {
  readonly id: string;
  readonly name: string;
  prepare(context: AudioContext, output: AudioNode): Promise<void>;
  noteOn(midi: number, velocity?: number): Voice;
  dispose(): void;
}

export type InstrumentDefinition = {
  id: string;
  name: string;
  create: () => Instrument;
};
