import { isNumber, readPref, writePref } from '../preferences';

/** Stroke widths, in pixels, for the sheet's horizontal lines. */
export type LineWidths = { origin: number; octave: number };
export const LINE_STEP = 0.5;
export const LINE_MIN = 0.5;
export const LINE_MAX = 8;
export const DEFAULT_LINE_WIDTHS: LineWidths = { origin: 3, octave: 1.5 };

export const clampLine = (value: number) => Math.min(LINE_MAX, Math.max(LINE_MIN, Math.round(value / LINE_STEP) * LINE_STEP));

export function loadLineWidths(): LineWidths {
  return {
    origin: clampLine(readPref('sheet-line:origin', DEFAULT_LINE_WIDTHS.origin, isNumber)),
    octave: clampLine(readPref('sheet-line:octave', DEFAULT_LINE_WIDTHS.octave, isNumber)),
  };
}

export function saveLineWidths(widths: LineWidths) {
  writePref('sheet-line:origin', widths.origin);
  writePref('sheet-line:octave', widths.octave);
}
