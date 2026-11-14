export const NOTE_NAMES = ['A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯'] as const;
export const SHORTCUTS = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j'] as const;

export type PianoNote = {
  id: string;
  midi: number;
  name: string;
  octave: number;
  row: number;
  hex: string;
  sharp: boolean;
  shortcut: string;
};

// The displayed octaves start at A, as requested. MIDI pitch stays continuous:
// A0 = MIDI 21, C0 (our label) = MIDI 24, and G♯7 = MIDI 116.
export function noteAt(octave: number, row: number): PianoNote {
  if (!Number.isInteger(octave) || octave < 0 || octave > 7 || !Number.isInteger(row) || row < 0 || row > 11) {
    throw new RangeError('The piano has eight columns and twelve rows.');
  }
  const name = NOTE_NAMES[row];
  return {
    id: `${octave}-${row}`,
    midi: 21 + octave * 12 + row,
    name,
    octave,
    row,
    hex: row.toString(16),
    sharp: name.includes('♯'),
    shortcut: SHORTCUTS[row],
  };
}

export const NOTE_ROWS = NOTE_NAMES.map((_, row) => Array.from({ length: 8 }, (_, octave) => noteAt(octave, row)));
export const NOTES = NOTE_ROWS.flat();
export const NOTES_BY_ID = new Map(NOTES.map((note) => [note.id, note]));
