import assert from 'node:assert/strict';
import { test } from 'node:test';
import { A4, DEFAULT_PDF_SETTINGS, PX_MM, fitScale, isPdfSettings, layoutPdf, printable } from '../src/lib/sheet/pdf-layout.ts';

const margins = DEFAULT_PDF_SETTINGS.margins;
const area = printable(margins);

test('A4 with standard one-inch margins', () => {
  assert.deepEqual(A4, { width: 210, height: 297 });
  assert.ok(Math.abs(area.width - (210 - 50.8)) < 1e-9);
  assert.ok(Math.abs(area.height - (297 - 50.8)) < 1e-9);
});

test('auto scaling prints at screen size when every line fits', () => {
  const lines = [{ width: 400, height: 100 }];
  const layout = layoutPdf(lines, 10, DEFAULT_PDF_SETTINGS);
  assert.equal(layout.scale, 1);
  assert.equal(layout.reduced, false);
  assert.ok(Math.abs(layout.pages[0][0].width - 400 * PX_MM) < 1e-9);
});

test('auto scaling shrinks the widest line to the printable width', () => {
  const lines = [{ width: 1400, height: 100 }, { width: 700, height: 100 }];
  const layout = layoutPdf(lines, 10, DEFAULT_PDF_SETTINGS);
  assert.ok(Math.abs(layout.pages[0][0].width - area.width) < 1e-9);
  assert.equal(layout.scale, fitScale(lines, margins));
});

test('a requested scale is lowered when a line would not fit', () => {
  const lines = [{ width: 1400, height: 100 }];
  const fit = fitScale(lines, margins);
  const big = layoutPdf(lines, 0, { ...DEFAULT_PDF_SETTINGS, scale: 100 });
  assert.equal(big.scale, fit);
  assert.equal(big.reduced, true);
  const small = layoutPdf(lines, 0, { ...DEFAULT_PDF_SETTINGS, scale: 20 });
  assert.equal(small.scale, 0.2);
  assert.equal(small.reduced, false);
});

test('a line taller than the page shrinks until it fits', () => {
  const layout = layoutPdf([{ width: 100, height: 2000 }], 0, DEFAULT_PDF_SETTINGS);
  assert.ok(layout.pages[0][0].height <= area.height + 1e-9);
});

test('lines never cross the bottom margin and move whole to the next page', () => {
  const lines = Array.from({ length: 40 }, (_, i) => ({ width: 600, height: 120 + (i % 5) * 37 }));
  for (const scale of [null, 30, 55, 80]) {
    for (const m of [0, 10, 25.4, 60]) {
      const settings = { scale, margins: { top: m, right: m, bottom: m + 5, left: m } };
      const layout = layoutPdf(lines, 24, settings);
      const placed = layout.pages.flat();
      assert.deepEqual(placed.map((p) => p.line), lines.map((_, i) => i), 'every line once, in order');
      for (const page of layout.pages) {
        assert.equal(page[0].y, settings.margins.top);
        for (const p of page) {
          assert.ok(p.y >= settings.margins.top - 1e-9);
          assert.ok(p.y + p.height <= A4.height - settings.margins.bottom + 1e-6);
          assert.ok(p.x + p.width <= A4.width - settings.margins.right + 1e-6);
        }
      }
      // Greedy: the next page's first line would not have fitted on the previous page.
      for (let i = 1; i < layout.pages.length; i++) {
        const last = layout.pages[i - 1].at(-1)!;
        const next = layout.pages[i][0];
        assert.ok(last.y + last.height + 24 * layout.scale * PX_MM + next.height > A4.height - settings.margins.bottom);
      }
    }
  }
});

test('saved settings are validated', () => {
  assert.ok(isPdfSettings(DEFAULT_PDF_SETTINGS));
  assert.ok(isPdfSettings({ scale: 50, margins }));
  assert.ok(!isPdfSettings({ scale: 5, margins }));
  assert.ok(!isPdfSettings({ scale: null, margins: { ...margins, left: 200 } }));
  assert.ok(!isPdfSettings(null));
});
