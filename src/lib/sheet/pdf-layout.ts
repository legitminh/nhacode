/**
 * Page layout for PDF export, kept free of the DOM so it can be tested on its own.
 *
 * Lengths on the page are in millimetres; lengths on screen are CSS pixels (96 per inch).
 * A scale of 1 prints the sheet at its on-screen size. Each stream line (one system,
 * both hands with its markings and pedal) is placed whole: it never splits across pages.
 */

export const A4 = { width: 210, height: 297 } as const;
/** One CSS pixel in millimetres. */
export const PX_MM = 25.4 / 96;
/** Standard A4 margins: one inch (25.4 mm) on every side. */
export const DEFAULT_PDF_MARGIN = 25.4;
export const PDF_MARGIN_MIN = 0;
export const PDF_MARGIN_MAX = 80;
/** Scaling bounds, in percent of on-screen size. */
export const PDF_SCALE_MIN = 10;
export const PDF_SCALE_MAX = 400;

export type PdfSide = 'top' | 'right' | 'bottom' | 'left';
export type PdfMargins = Record<PdfSide, number>;
export const PDF_SIDES: readonly PdfSide[] = ['top', 'right', 'bottom', 'left'];

export interface PdfSettings {
  /** Requested scaling in percent of on-screen size; `null` means automatic. */
  scale: number | null;
  margins: PdfMargins;
}

export const DEFAULT_PDF_SETTINGS: PdfSettings = {
  scale: null,
  margins: { top: DEFAULT_PDF_MARGIN, right: DEFAULT_PDF_MARGIN, bottom: DEFAULT_PDF_MARGIN, left: DEFAULT_PDF_MARGIN },
};

/** A stream line's size on screen, in CSS pixels. */
export interface LineSize { width: number; height: number }

export interface PlacedLine { line: number; x: number; y: number; width: number; height: number }

export interface PdfLayout {
  /** The scale used, as a fraction of on-screen size. */
  scale: number;
  /** The largest scale at which every line fits inside the margins. */
  fit: number;
  /** True when the requested scale was lowered to `fit` so that every line fits. */
  reduced: boolean;
  pages: PlacedLine[][];
}

export const clampPdfMargin = (value: number) =>
  Math.min(PDF_MARGIN_MAX, Math.max(PDF_MARGIN_MIN, Number.isFinite(value) ? value : DEFAULT_PDF_MARGIN));

export function isPdfSettings(value: unknown): value is PdfSettings {
  if (typeof value !== 'object' || value === null) return false;
  const { scale, margins } = value as PdfSettings;
  const scaleOk = scale === null || (typeof scale === 'number' && scale >= PDF_SCALE_MIN && scale <= PDF_SCALE_MAX);
  return scaleOk && typeof margins === 'object' && margins !== null
    && PDF_SIDES.every((side) => typeof margins[side] === 'number' && margins[side] >= PDF_MARGIN_MIN && margins[side] <= PDF_MARGIN_MAX);
}

/** The area inside the margins, in millimetres. */
export function printable(margins: PdfMargins) {
  return {
    width: Math.max(0, A4.width - margins.left - margins.right),
    height: Math.max(0, A4.height - margins.top - margins.bottom),
  };
}

/** The largest scale at which the widest and the tallest line each fit inside the margins. */
export function fitScale(lines: LineSize[], margins: PdfMargins): number {
  const area = printable(margins);
  const width = Math.max(0, ...lines.map((line) => line.width)) * PX_MM;
  const height = Math.max(0, ...lines.map((line) => line.height)) * PX_MM;
  return Math.min(width ? area.width / width : Infinity, height ? area.height / height : Infinity);
}

/**
 * Places the lines on A4 pages, top to bottom, `gap` CSS pixels apart (scaled with them).
 * Automatic scaling prints at on-screen size, or smaller when a line would not fit.
 * A requested scale is used as given unless a line would not fit; then it drops to the fit.
 * A line starts a new page whenever it would cross the bottom margin.
 */
export function layoutPdf(lines: LineSize[], gap: number, settings: PdfSettings): PdfLayout {
  const fit = fitScale(lines, settings.margins);
  const wanted = settings.scale === null ? 1 : settings.scale / 100;
  const scale = Math.min(wanted, fit);
  const reduced = settings.scale !== null && wanted > fit;
  const k = scale * PX_MM;
  const bottom = A4.height - settings.margins.bottom;
  // Rounding slack, so a line that exactly fills the area is not pushed off it.
  const EPS = 1e-6;
  const pages: PlacedLine[][] = [];
  let page: PlacedLine[] = [];
  let y = settings.margins.top;
  lines.forEach((line, index) => {
    const height = line.height * k;
    if (page.length && y + height > bottom + EPS) {
      pages.push(page);
      page = [];
      y = settings.margins.top;
    }
    page.push({ line: index, x: settings.margins.left, y, width: line.width * k, height });
    y += height + gap * k;
  });
  if (page.length) pages.push(page);
  return { scale, fit, reduced, pages };
}
