import { readPref, writePref } from './preferences';

export const SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type Side = (typeof SIDES)[number];
/** Keyboard margins, in min-box units. */
export type Margins = Record<Side, number>;

export const MARGIN_STEP = 0.25;
export const MARGIN_MAX = 10;

export function clampMargin(value: number): number {
  return Math.min(MARGIN_MAX, Math.max(0, Math.round(value * 100) / 100));
}

const isMargins = (value: unknown): value is Partial<Margins> => typeof value === 'object' && value !== null;

export function loadMargins(): Margins {
  const saved = readPref('keyboard-margins:box', {}, isMargins);
  const margins: Margins = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const side of SIDES) if (Number.isFinite(saved[side])) margins[side] = clampMargin(saved[side]!);
  return margins;
}

export function saveMargins(margins: Margins) {
  writePref('keyboard-margins:box', margins);
}
