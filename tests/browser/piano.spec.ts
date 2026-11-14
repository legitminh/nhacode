import { expect, test } from '@playwright/test';

// Observe the real Web Audio graph rather than substituting a mock instrument.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const probe = { starts: [] as { rate: number }[], stops: 0, analysers: [] as AnalyserNode[] };
    Object.assign(window, { __audioProbe: probe });
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function(this: AudioNode, destination: AudioNode | AudioParam, ...args: number[]) {
      if (destination instanceof AudioDestinationNode) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 2048;
        probe.analysers.push(analyser);
        Reflect.apply(connect, this, [analyser]);
        return Reflect.apply(connect, analyser, [destination]);
      }
      return Reflect.apply(connect, this, [destination, ...args]);
    } as typeof connect;
    const start = AudioBufferSourceNode.prototype.start;
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function(...args) {
      probe.starts.push({ rate: this.playbackRate.value });
      return Reflect.apply(start, this, args);
    };
    AudioBufferSourceNode.prototype.stop = function(...args) {
      probe.stops++;
      return Reflect.apply(stop, this, args);
    };
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Ready to play');
});

test('all 96 Keyflow keys fit desktop and mobile viewports without scrolling', async ({ page }) => {
  await expect(page.locator('.piano-matrix .keyflow-key')).toHaveCount(96);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    const sizes = await page.locator('.piano-cell').evaluateAll((cells) => cells.map((cell) => {
      const rect = cell.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, height: rect.height, width: rect.width };
    }));
    for (const cell of sizes) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.right).toBeLessThanOrEqual(viewport.width);
      expect(cell.bottom).toBeLessThanOrEqual(viewport.height);
      expect(cell.height).toBeGreaterThan(10);
      expect(cell.width).toBeGreaterThan(20);
    }
    expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))).toEqual(viewport);
    const matrix = (await page.locator('.piano-matrix').boundingBox())!;
    expect(Math.abs(sizes.at(-1)!.bottom - (matrix.y + matrix.height))).toBeLessThan(2);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'test-results/nhacode-desktop.png' });
});

test('pointer down starts actual piano audio, release outside stops, click does not double-trigger', async ({ page }) => {
  const button = page.locator('[data-note="3-0"] button');
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator('[data-note="3-0"]')).toHaveClass(/sounding/);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const analyser = (window as any).__audioProbe.analysers[0] as AnalyserNode;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    return Math.max(...data.map(Math.abs));
  })).toBeGreaterThan(0.001);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await expect(page.locator('.sounding')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__audioProbe.stops)).toBe(1);
  expect(await page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(1);
});

test('hardware chords, repeat filtering, octave changes and sustain release correctly', async ({ page }) => {
  await page.keyboard.down('a');
  await page.keyboard.down('a');
  await page.keyboard.down('d');
  await expect(page.locator('.sounding')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(2);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.up('a');
  await page.keyboard.up('d');
  await expect(page.locator('.sounding')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__audioProbe.stops)).toBe(2);
  await page.keyboard.down('Space');
  await page.keyboard.press('a');
  await expect(page.getByRole('button', { name: /Sustain/ })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(3);
  expect(await page.evaluate(() => (window as any).__audioProbe.stops)).toBe(2);
  await page.keyboard.up('Space');
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.stops)).toBe(3);
  await expect(page.getByRole('button', { name: /octave 4 with/ })).toHaveAttribute('aria-pressed', 'true');
});

test('upper extension is pitched correctly and focus loss clears held notes', async ({ page }) => {
  await page.locator('[data-note="7-11"] button').click({ delay: 100 });
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).__audioProbe.starts[0].rate)).toBeCloseTo(2 ** (8 / 12));
  await page.keyboard.down('a');
  await expect(page.locator('.sounding')).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('.sounding')).toHaveCount(0);
});

test('two real touch contacts play a chord and cancel cleanly', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  const boxes = await Promise.all(['3-0', '3-4'].map((id) => page.locator(`[data-note="${id}"] button`).boundingBox()));
  const touchPoints = boxes.map((box, index) => ({ x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, id: index + 1 }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
  await expect(page.locator('.sounding')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('.sounding')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__audioProbe.stops)).toBe(2);
});
