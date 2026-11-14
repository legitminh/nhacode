import { SampledInstrument } from './sampled-instrument';
import type { InstrumentDefinition } from './types';

// Add another sampled bank or a synthesis implementation here; the grid and
// engine don't depend on how an instrument produces its sound.
export const instruments: readonly InstrumentDefinition[] = [
  {
    id: 'grand-piano',
    name: 'Grand piano',
    create: () => new SampledInstrument('grand-piano', 'Grand piano',
      Array.from({ length: 88 }, (_, index) => ({
        midi: 21 + index,
        url: `${import.meta.env.BASE_URL}audio/piano/${21 + index}.mp3`,
      })),
    ),
  },
  ...['violin', 'cello', 'flute'].map((id) => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    create: () => new SampledInstrument(id, id,
      // A sample every three semitones; intermediate notes are pitch shifted.
      Array.from({ length: 30 }, (_, index) => ({
        midi: 21 + index * 3,
        url: `${import.meta.env.BASE_URL}audio/${id}/${21 + index * 3}.mp3`,
      })),
      { sustain: true },
    ),
  })),
];
