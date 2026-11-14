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
];
