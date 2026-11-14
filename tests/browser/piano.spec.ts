import { expect, test } from '@playwright/test';

// Observe the real Web Audio graph rather than substituting a mock instrument.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const probe = { starts: [] as { rate: number; loop: boolean }[], stops: 0, analysers: [] as AnalyserNode[] };
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
      probe.starts.push({ rate: this.playbackRate.value, loop: this.loop });
      return Reflect.apply(start, this, args);
    };
    AudioBufferSourceNode.prototype.stop = function(...args) {
      probe.stops++;
      return Reflect.apply(stop, this, args);
    };
  });
  await page.goto('./');
  await expect(page.getByRole('main')).toHaveAttribute('data-audio-state', 'ready');
});

test('all 96 Keyflow keys fit desktop and mobile viewports without scrolling', async ({ page }) => {
  await expect(page.locator('.piano-matrix .keyflow-key')).toHaveCount(96);
  await expect(page.locator('button')).toHaveCount(97);
  await expect(page.locator('header, footer, select, h1, h2, .shortcut')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toHaveCount(0);
  for (const selector of ['link[rel="icon"]']) {
    const href = await page.locator(selector).getAttribute('href');
    const resource = await page.request.get(new URL(href!, page.url()).href);
    expect(resource.ok()).toBe(true);
  }
  for (const transposed of [false, true]) {
    if (transposed) {
      await page.getByRole('button', { name: /Settings/ }).click();
      await page.getByRole('button', { name: /Transpose display/ }).click();
      await page.keyboard.press('Escape');
    }
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
      expect(Math.abs(sizes.at(-1)!.bottom - (matrix.y + matrix.height - 8))).toBeLessThan(2);
      const labels = await page.locator('.piano-cell button').evaluateAll((buttons) => buttons.map((button) => {
        const key = button.getBoundingClientRect();
        const label = button.querySelector('span')!.getBoundingClientRect();
        return {
          text: button.textContent!.trim(),
          color: getComputedStyle(button).color,
          dx: label.x + label.width / 2 - key.x - key.width / 2,
          dy: label.y + label.height / 2 - key.y - key.height / 2,
          fits: label.width <= key.width && label.height <= key.height,
        };
      }));
      expect(new Set(labels.map((label) => label.color)).size).toBe(1);
      for (const label of labels) {
        expect(label.text).toMatch(/^[0-9ab]$/);
        expect(Math.abs(label.dx)).toBeLessThan(1);
        expect(Math.abs(label.dy)).toBeLessThan(1);
        expect(label.fits).toBe(true);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.locator('.piano-cell button').first().evaluate((button) => getComputedStyle(button).fontSize)).toBe('48px');
  await page.screenshot({ path: 'test-results/nhacode-transposed.png' });
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: /Transpose display/ }).click();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/nhacode-desktop.png' });
});

test('settings transposes display while preserving pitches and releases active notes', async ({ page }) => {
  await page.locator('[data-note="3-0"] button').focus();
  await page.keyboard.down('Enter');
  await expect(page.locator('.sounding')).toHaveCount(1);
  const settings = page.getByRole('button', { name: /Settings/ });
  await settings.click();
  await expect(page.locator('.sounding')).toHaveCount(0);
  await page.keyboard.up('Enter');
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Transpose display/ }).click();
  await expect(page.locator('.piano-row')).toHaveCount(8);
  await expect(page.locator('.piano-row').first().locator('.piano-cell')).toHaveCount(12);
  expect(await page.locator('.piano-cell').evaluateAll((cells) => cells.map((cell) => Number((cell as HTMLElement).dataset.midi))))
    .toEqual(Array.from({ length: 96 }, (_, index) => 21 + index));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toHaveCount(0);
  const first = (await page.locator('[data-note="0-0"]').boundingBox())!;
  const next = (await page.locator('[data-note="0-1"]').boundingBox())!;
  const octave = (await page.locator('[data-note="1-0"]').boundingBox())!;
  expect(next.x).toBeGreaterThan(first.x);
  expect(next.y).toBe(first.y);
  expect(octave.x).toBe(first.x);
  expect(octave.y).toBeGreaterThan(first.y);
  const count = await page.evaluate(() => (window as any).__audioProbe.starts.length);
  await page.locator('[data-note="7-11"] button').click({ delay: 100 });
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(count + 1);
  expect(await page.evaluate(() => (window as any).__audioProbe.starts.at(-1).rate)).toBeCloseTo(2 ** (8 / 12));
  await settings.click();
  await page.getByRole('button', { name: /Transpose display/ }).click();
  await settings.click();
  await expect(page.locator('.piano-row')).toHaveCount(12);
  await expect(page.locator('.piano-row').first().locator('.piano-cell')).toHaveCount(8);
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toHaveCount(0);
});

test('Keyflow settings open with Escape and apply inclusive/exclusive octave ranges', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toBeVisible();
  const editRange = async (value: string) => {
    await page.getByRole('button', { name: 'Octave range', exact: true }).click();
    await page.getByRole('textbox', { name: 'Octave range', exact: true }).fill(value);
    await page.keyboard.press('Escape');
  };
  await editRange('[2,4]');
  await expect(page.getByRole('main')).toHaveAttribute('data-range', '[2,4]');
  await expect(page.locator('.piano-cell')).toHaveCount(36);
  await editRange('(2,4)');
  await expect(page.getByRole('main')).toHaveAttribute('data-range', '(2,4)');
  await expect(page.locator('.piano-cell')).toHaveCount(12);
  await editRange('[4,2]');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.piano-cell')).toHaveCount(12);
  await editRange('[0,8)');
  await expect(page.locator('.piano-cell')).toHaveCount(96);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toHaveCount(0);
});

test('Keyflow instrument choices load violin, cello and flute with sustained playback', async ({ page }) => {
  for (const name of ['Violin', 'Cello', 'Flute', 'Grand piano']) {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Instrument:/ }).click();
    await page.getByRole('region', { name: /Instrument:/ }).getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.getByRole('main')).toHaveAttribute('data-audio-state', 'ready');
    await page.keyboard.press('Escape');
    await page.locator('[data-note="3-0"] button').focus();
    await page.keyboard.down('Space');
    await expect(page.locator('.sounding')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.starts.at(-1)?.loop))
      .toBe(name !== 'Grand piano');
    await expect.poll(() => page.evaluate(() => {
      const analyser = (window as any).__audioProbe.analysers[0] as AnalyserNode;
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      return Math.max(...data.map(Math.abs));
    })).toBeGreaterThan(0.001);
    await page.keyboard.up('Space');
    await expect(page.locator('.sounding')).toHaveCount(0);
  }
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

test('mouse glides through notes while pressed, then releasing or leaving stops them', async ({ page }) => {
  const center = async (id: string) => {
    const box = (await page.locator(`[data-note="${id}"] button`).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const a = await center('3-0');
  const b = await center('3-1');
  const c = await center('4-1');
  await page.mouse.move(a.x, a.y);
  expect(await page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(0);
  await page.mouse.down();
  await expect(page.locator('[data-note="3-0"]')).toHaveClass(/sounding/);
  await page.mouse.move(b.x, b.y);
  await expect(page.locator('.sounding')).toHaveCount(1);
  await expect(page.locator('[data-note="3-1"]')).toHaveClass(/sounding/);
  await page.mouse.move(c.x, c.y);
  await expect(page.locator('.sounding')).toHaveCount(1);
  await expect(page.locator('[data-note="4-1"]')).toHaveClass(/sounding/);
  await page.mouse.move(0, 0);
  await expect(page.locator('.sounding')).toHaveCount(0);
  await page.mouse.move(b.x, b.y);
  await expect(page.locator('[data-note="3-1"]')).toHaveClass(/sounding/);
  await page.mouse.up();
  await expect(page.locator('.sounding')).toHaveCount(0);
  const count = await page.evaluate(() => (window as any).__audioProbe.starts.length);
  await page.mouse.move(a.x, a.y);
  await expect(page.locator('.sounding')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(count);
});

test('touch glides across keys under implicit capture and stops on lift', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  const points = await Promise.all(['2-0', '2-1', '3-1'].map(async (id) => {
    const box = (await page.locator(`[data-note="${id}"] button`).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
  await expect(page.locator('[data-note="2-0"]')).toHaveClass(/sounding/);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [points[1]] });
  await expect(page.locator('.sounding')).toHaveCount(1);
  await expect(page.locator('[data-note="2-1"]')).toHaveClass(/sounding/);
  expect(await page.locator('[data-note="2-0"] button').evaluate((button) => getComputedStyle(button).backgroundColor))
    .not.toBe(await page.locator('[data-note="2-1"] button').evaluate((button) => getComputedStyle(button).backgroundColor));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [points[2]] });
  await expect(page.locator('.sounding')).toHaveCount(1);
  await expect(page.locator('[data-note="3-1"]')).toHaveClass(/sounding/);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.sounding')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(3);
  expect(await page.evaluate(() => (window as any).__audioProbe.stops)).toBe(3);
});

test('settings reveal Escape on hover and nested SubKeyframes return one level at a time', async ({ page }) => {
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  const shortcut = page.locator('.settings-menu > .subkeyframe-trigger .route');
  await expect(shortcut).toBeHidden();
  await settings.hover();
  await expect(shortcut).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: /Instrument:/ }).click();
  await expect(page.getByRole('region', { name: /Instrument:/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/nhacode-settings.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: /Instrument:/ })).toHaveCount(0);
  await expect(settings).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(settings).toHaveAttribute('aria-expanded', 'false');
  await settings.click();
  await page.mouse.click(1000, 10);
  await expect(settings).toHaveAttribute('aria-expanded', 'false');
});

test('overlapping touch contacts on one key keep the note until the last finger lifts', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  const box = (await page.locator('[data-note="3-0"] button').boundingBox())!;
  const first = { x: box.x + box.width / 3, y: box.y + box.height / 2, id: 1 };
  const second = { x: box.x + box.width * 2 / 3, y: box.y + box.height / 2, id: 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
  await expect(page.locator('.sounding')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__audioProbe.stops)).toBe(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.sounding')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__audioProbe.stops)).toBe(1);
});

test('focused keys use Keyflow press/release activation and ignore keyboard repeats', async ({ page }) => {
  await page.locator('[data-note="3-0"] button').focus();
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await expect(page.locator('.sounding')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(1);
  await page.keyboard.up('Enter');
  await expect(page.locator('.sounding')).toHaveCount(0);
  await page.locator('[data-note="4-0"] button').focus();
  await page.keyboard.down('Space');
  await expect(page.locator('[data-note="4-0"]')).toHaveClass(/sounding/);
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(2);
  await page.keyboard.up('Space');
  await expect(page.locator('.sounding')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__audioProbe.stops)).toBe(2);
});

test('upper extension is pitched correctly and focus loss clears held notes', async ({ page }) => {
  await page.locator('[data-note="7-11"] button').click({ delay: 100 });
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.starts.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).__audioProbe.starts[0].rate)).toBeCloseTo(2 ** (8 / 12));
  await page.locator('[data-note="7-0"] button').focus();
  await page.keyboard.down('Space');
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
