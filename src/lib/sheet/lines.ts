import { isNumber, readPref, writePref } from '../preferences';

/** Stroke widths of the sheet's horizontal lines, in min-box units. */
export type LineWidths = { origin: number; octave: number };
export const LINE_STEP = 0.01;
export const LINE_MIN = 0.01;
export const LINE_MAX = 0.25;
export const DEFAULT_LINE_WIDTHS: LineWidths = { origin: 0.06, octave: 0.03 };

export const clampLine = (value: number) => Math.min(LINE_MAX, Math.max(LINE_MIN, Math.round(value * 1000) / 1000));

export function loadLineWidths(): LineWidths {
  return {
    origin: clampLine(readPref('sheet-line:box:origin', DEFAULT_LINE_WIDTHS.origin, isNumber)),
    octave: clampLine(readPref('sheet-line:box:octave', DEFAULT_LINE_WIDTHS.octave, isNumber)),
  };
}

export function saveLineWidths(widths: LineWidths) {
  writePref('sheet-line:box:origin', widths.origin);
  writePref('sheet-line:box:octave', widths.octave);
}
