/**
 * PDF export of the sheet as drawn on screen: same text size, same line width (the lines
 * wrap where they wrap on screen), same theme colours. Each stream line is copied into one
 * standalone SVG, with every computed style written onto its elements, and drawn as vectors
 * with jsPDF + svg2pdf.js (loaded only when exporting).
 */
import { A4, layoutPdf, type LineSize, type PdfLayout, type PdfSettings } from './pdf-layout';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Screen-only layers: hit areas, playback and metronome cursors, measure pickers. */
const SKIP = '.measure-hit, .playhead, .metronome-head, .pick-layer';
const STYLES = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'opacity', 'font-size', 'font-style', 'font-weight', 'text-anchor', 'dominant-baseline', 'visibility',
] as const;

export interface SheetLine extends LineSize { svg: SVGSVGElement }

/** The PDF's built-in fonts: monospace text in Courier, serif (the trill's *tr*) in Times. */
function pdfFont(family: string) {
  const first = family.split(',')[0].trim().replace(/["']/g, '').toLowerCase();
  return /serif/.test(first) && !/sans/.test(first) ? 'times' : /sans/.test(first) ? 'helvetica' : 'courier';
}

/** Copies the computed style of each element onto its clone, as presentation attributes. */
function inlineStyles(source: Element, clone: Element) {
  const style = getComputedStyle(source);
  for (const name of STYLES) {
    const value = style.getPropertyValue(name);
    if (value) clone.setAttribute(name, value);
  }
  if (source instanceof SVGTextElement || source instanceof SVGTSpanElement) clone.setAttribute('font-family', pdfFont(style.fontFamily));
  clone.removeAttribute('style');
  clone.removeAttribute('class');
  for (let i = 0; i < source.children.length; i++) inlineStyles(source.children[i], clone.children[i]);
}

/**
 * The sheet centres its glyphs on their row (`dominant-baseline: central`); PDF fonts are placed
 * by their baseline, so each centred text moves down by half a digit's height in Courier
 * (cap height 0.562 em), which puts the digit's middle on the row's centre as on screen.
 */
function baselineToAlphabetic(svg: SVGSVGElement) {
  for (const text of svg.querySelectorAll('text, tspan')) {
    const baseline = text.getAttribute('dominant-baseline');
    if (baseline !== 'central' && baseline !== 'middle') continue;
    text.setAttribute('dominant-baseline', 'alphabetic');
    const y = text.getAttribute('y');
    if (text.tagName === 'text' && y !== null) text.setAttribute('y', String(parseFloat(y) + 0.281 * parseFloat(text.getAttribute('font-size') ?? '0')));
  }
}

/** Percent lengths (the deleted-frame crosses span 2%–98% of the stream) become pixels. */
function resolvePercents(svg: SVGSVGElement, width: number, height: number) {
  for (const element of svg.querySelectorAll('*')) {
    for (const [name, size] of [['x1', width], ['x2', width], ['x', width], ['width', width], ['y1', height], ['y2', height], ['y', height], ['height', height]] as const) {
      const value = element.getAttribute(name);
      if (value?.endsWith('%')) element.setAttribute(name, String((parseFloat(value) / 100) * size));
    }
  }
}

function rect(x: number, y: number, width: number, height: number, fill: string) {
  const r = document.createElementNS(SVG_NS, 'rect');
  for (const [name, value] of Object.entries({ x, y, width, height, fill })) r.setAttribute(name, String(value));
  return r;
}

/** One stream line (a `.sheet-stream-box`) as a standalone SVG in CSS pixels. */
function lineSvg(box: HTMLElement): SheetLine {
  const origin = box.getBoundingClientRect();
  const out = document.createElementNS(SVG_NS, 'svg');
  let width = 0;
  const parts = [...box.querySelectorAll('svg')].filter((svg) => !svg.parentElement?.closest('svg'));
  for (const part of parts) {
    const r = part.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const clone = part.cloneNode(true) as SVGSVGElement;
    inlineStyles(part, clone);
    clone.querySelectorAll(SKIP).forEach((element) => element.remove());
    clone.setAttribute('x', String(r.left - origin.left));
    clone.setAttribute('y', String(r.top - origin.top));
    clone.setAttribute('width', String(r.width));
    clone.setAttribute('height', String(r.height));
    clone.setAttribute('overflow', 'visible');
    resolvePercents(clone, r.width, r.height);
    baselineToAlphabetic(clone);
    out.append(clone);
    width = Math.max(width, r.right - origin.left);
  }
  // The thick bar between the left and right streams is a CSS border on the hands box.
  for (const hands of box.querySelectorAll<HTMLElement>('.sheet-hands')) {
    const r = hands.getBoundingClientRect();
    const style = getComputedStyle(hands);
    const top = parseFloat(style.borderTopWidth);
    const bottom = parseFloat(style.borderBottomWidth);
    if (top) out.append(rect(r.left - origin.left, r.top - origin.top, r.width, top, style.borderTopColor));
    if (bottom) out.append(rect(r.left - origin.left, r.bottom - origin.top - bottom, r.width, bottom, style.borderBottomColor));
    width = Math.max(width, r.right - origin.left);
  }
  // § measures stack § over the section id in HTML; each glyph becomes centred SVG text.
  for (const span of box.querySelectorAll<HTMLElement>('.section-stack > span')) {
    const r = span.getBoundingClientRect();
    const style = getComputedStyle(span);
    const text = document.createElementNS(SVG_NS, 'text');
    for (const [name, value] of Object.entries({
      x: r.left - origin.left + r.width / 2, y: r.top - origin.top + r.height / 2, fill: style.color,
      'font-size': style.fontSize, 'font-family': pdfFont(style.fontFamily), 'text-anchor': 'middle', 'dominant-baseline': 'central',
    })) text.setAttribute(name, String(value));
    text.textContent = span.textContent;
    out.append(text);
  }
  baselineToAlphabetic(out);
  const height = origin.height;
  out.setAttribute('xmlns', SVG_NS);
  out.setAttribute('width', String(width));
  out.setAttribute('height', String(height));
  out.setAttribute('viewBox', `0 0 ${width} ${height}`);
  return { svg: out, width, height };
}

/** Reads the rendered sheet: its stream lines, the gap between them, and the page colour. */
export function readSheet(root: ParentNode = document) {
  const streams = root.querySelector<HTMLElement>('.sheet-streams');
  if (!streams) return undefined;
  const lines = [...streams.querySelectorAll<HTMLElement>(':scope > .sheet-stream-box')].map(lineSvg);
  const gap = parseFloat(getComputedStyle(streams).rowGap) || 0;
  const screen = streams.closest('.sheet-screen') ?? streams;
  const background = getComputedStyle(screen).backgroundColor;
  return { lines, gap, background, title: streams.dataset.song ?? 'sheet' };
}

/** Measures the rendered sheet and lays it out on pages, without drawing anything. */
export function previewPdf(settings: PdfSettings): PdfLayout | undefined {
  const sheet = readSheet();
  return sheet && layoutPdf(sheet.lines, sheet.gap, settings);
}

/** Builds the PDF of the rendered sheet and starts its download. */
export async function exportPdf(settings: PdfSettings) {
  const sheet = readSheet();
  if (!sheet?.lines.length) throw new Error('There is no sheet to export.');
  const layout = layoutPdf(sheet.lines, sheet.gap, settings);
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  for (const [index, page] of layout.pages.entries()) {
    if (index) doc.addPage('a4', 'portrait');
    // The page takes the sheet's theme background, so colours read as they do on screen.
    const [r, g, b, a = 1] = (sheet.background.match(/[\d.]+/g) ?? []).map(Number);
    if (a > 0 && Number.isFinite(b)) {
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, A4.width, A4.height, 'F');
    }
    for (const placed of page) {
      await doc.svg(sheet.lines[placed.line].svg, { x: placed.x, y: placed.y, width: placed.width, height: placed.height });
    }
  }
  doc.save(`${sheet.title}.pdf`);
  return layout;
}
