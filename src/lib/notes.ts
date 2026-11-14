export const NOTE_NAMES = ['A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯'] as const;

export type PianoNote = {
  id: string;
  midi: number;
  name: string;
  octave: number;
  row: number;
  hex: string;
};

// The displayed octaves start at A, as requested. MIDI pitch stays continuous:
// A0 = MIDI 21, C0 (our label) = MIDI 24, and G♯7 = MIDI 116.
export function noteAt(octave: number, row: number): PianoNote {
  if (!Number.isInteger(octave) || octave < 0 || octave > 8 || !Number.isInteger(row) || row < 0 || row > 11) {
    throw new RangeError('Choose an octave from 0 through 8 and a note from 0 through b.');
  }
  const name = NOTE_NAMES[row];
  return {
    id: `${octave}-${row}`,
    midi: 21 + octave * 12 + row,
    name,
    octave,
    row,
    hex: row.toString(16),
  };
}

export const NOTE_ROWS = NOTE_NAMES.map((_, row) => Array.from({ length: 8 }, (_, octave) => noteAt(octave, row)));
export const NOTES = NOTE_ROWS.flat();

/** Octaves are integers; brackets include an endpoint, parentheses exclude it. */
export function parseOctaveRange(value: string): number[] {
  const match = /^([\[(])\s*(\d+)\s*,\s*(\d+)\s*([\])])$/.exec(value.trim());
  if (!match) throw new Error('Use interval notation, for example [0,8), [2,4], or (0,8].');
  const lower = Number(match[2]);
  const upper = Number(match[3]);
  const first = lower + (match[1] === '(' ? 1 : 0);
  const last = upper - (match[4] === ')' ? 1 : 0);
  if (lower > 8 || upper > 8 || lower > upper || first > last) {
    throw new Error('Choose endpoints from 0 through 8 and include at least one octave.');
  }
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
