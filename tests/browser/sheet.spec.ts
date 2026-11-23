import { expect, test, type Page } from '@playwright/test';

/** Opens Settings → Keyboard or Settings → Sheet. */
async function paneMenu(page: Page, pane: 'Keyboard' | 'Sheet') {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('region', { name: 'Settings', exact: true }).getByRole('button', { name: new RegExp(`${pane} pane$`) }).click();
}
async function closeSettings(page: Page) {
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  for (let i = 0; i < 5 && await settings.getAttribute('aria-expanded') === 'true'; i++) await page.keyboard.press('Escape');
  await expect(settings).toHaveAttribute('aria-expanded', 'false');
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('sheet and keyboard toggles show the screens side by side', async ({ page }) => {
  const main = page.getByRole('main');
  await expect(main).toHaveAttribute('data-views', 'keyboard');
  await page.getByRole('button', { name: /^Sheet/ }).click();
  await expect(main).toHaveAttribute('data-views', 'keyboard sheet');
  const keyboard = (await page.getByRole('region', { name: 'Keyboard', exact: true }).boundingBox())!;
  const sheet = (await page.getByRole('region', { name: 'Sheet', exact: true }).boundingBox())!;
  expect(sheet.x).toBeGreaterThanOrEqual(keyboard.x + keyboard.width - 1);
  expect(Math.abs(sheet.y - keyboard.y)).toBeLessThan(2);

  await page.keyboard.press('k');
  await expect(main).toHaveAttribute('data-views', 'sheet');
  await page.reload();
  await expect(main).toHaveAttribute('data-views', 'sheet');
  await page.keyboard.press('s');
  await expect(main).toHaveAttribute('data-views', '');
});

test('Für Elise renders as wrapped streams of hex digits with octave lines', async ({ page }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  await page.getByRole('button', { name: /^Keyboard/ }).click();
  await expect(page.getByRole('button', { name: /Song: Für Elise/ })).toBeVisible();
  await expect(page.locator('[data-song="fur-elise"]')).toBeVisible();
  const streams = page.locator('.sheet-stream');
  expect(await streams.count()).toBeGreaterThan(3);
  // The opening E5–D♯5 motif: E is digit 7 in the A-based octave 4, so four thin lines sit above it.
  const first = page.locator('.sheet-measure').first();
  expect(await first.locator('.sheet-note').allTextContents()).toEqual(expect.arrayContaining(['7', '6']));
  await expect(first.locator('.octave-line[data-octave="4"]')).not.toHaveCount(0);
  // Lines take Keyflow's distribute_color by index: origin is 0, the line above octave n is n.
  const strokes = await page.locator('.sheet-stream').first().evaluate((svg) => Object.fromEntries(
    [...svg.querySelectorAll('[data-line]')].map((line) => [line.getAttribute('data-line'), getComputedStyle(line).stroke])));
  expect(new Set(Object.values(strokes)).size).toBe(Object.keys(strokes).length);
  expect(strokes['0']).toBe('rgb(182, 32, 32)'); // hue 0, same as digit 0
  // Digits take their octave's color (the same index as the line above that octave), not their pitch's.
  const digits = await page.locator('.sheet-stream').first().evaluate((svg) => [...svg.querySelectorAll('.sheet-note')]
    .map((note) => [Number(note.getAttribute('data-midi')), getComputedStyle(note).fill] as const));
  for (const [midi, fill] of digits) {
    const octave = String(Math.floor((midi - 21) / 12));
    if (strokes[octave]) expect(fill).toBe(strokes[octave]);
  }
  for (const box of await streams.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().right))) {
    expect(box).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await page.screenshot({ path: 'test-results/nhacode-sheet.png' });
});

test('min-box increases and decreases like Keyflow and drives every font size', async ({ page }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  const sizes = () => page.evaluate(() => {
    const px = (selector: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
    return { box: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--min-box')),
      toggle: px('.view-toggle .content'), note: px('.sheet-note') };
  });
  await expect(page.locator('.sheet-note').first()).toBeVisible();
  const initial = await sizes();
  expect(initial.box).toBe(48);
  expect(initial.toggle).toBeCloseTo(38.4);
  expect(initial.note).toBeCloseTo(38.4);
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: /Decrease/ }).click();
  await expect(page.getByText('Min box: 38px')).toBeVisible();
  const smaller = await sizes();
  expect(smaller.box).toBeCloseTo(38.4);
  expect(smaller.toggle).toBeCloseTo(38.4 * .8);
  expect(smaller.note).toBeCloseTo(38.4 * .8);
  await page.getByRole('button', { name: /Increase/ }).click();
  await expect(page.getByText('Min box: 48px')).toBeVisible();
  await page.getByRole('button', { name: /Decrease/ }).click();
  await page.reload();
  await expect(page.locator('.sheet-note').first()).toBeVisible();
  expect((await sizes()).box).toBeCloseTo(38.4); // Keyflow saves min-box
});

test('song menu sits on the toolbar and keyboard margins are min-box number fields', async ({ page }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  const song = (await page.getByRole('button', { name: /Song: Für Elise/ }).boundingBox())!;
  const settings = (await page.getByRole('button', { name: /Settings/ }).boundingBox())!;
  expect(Math.abs(song.y + song.height / 2 - (settings.y + settings.height / 2))).toBeLessThan(4);

  await paneMenu(page, 'Keyboard');
  await page.getByRole('button', { name: /Margins/ }).click();
  const left = page.getByRole('spinbutton', { name: 'Left' });
  await left.fill('0.5'); // half a min-box: 24px at the default 48px
  await left.press('Enter');
  const panel = (await page.locator('.settings-bar .settings-menu > .subkeyframe-panel').boundingBox())!;
  for (const field of await page.locator('.box-input input').all()) {
    const box = (await field.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width);
  }
  const view = page.getByRole('region', { name: 'Keyboard', exact: true });
  await expect(view).toHaveCSS('padding', '0px 0px 0px 24px');
  await page.reload();
  await expect(view).toHaveCSS('padding', '0px 0px 0px 24px');
  const key = (await page.locator('[data-note="0-0"]').boundingBox())!;
  const box = (await view.boundingBox())!;
  expect(key.x).toBeGreaterThanOrEqual(box.x + 24);
});

test('Settings switches the sheet between native and Keyflow lockstep scrolling', async ({ page }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  await page.getByRole('button', { name: /^Keyboard/ }).click();
  await expect(page.locator('.sheet-note').first()).toBeVisible();
  const world = page.locator('.sheet-scroll .world');
  await expect(world).not.toHaveAttribute('style', /translateY/);
  await paneMenu(page, 'Sheet');
  await page.getByRole('button', { name: /Lockstep scrolling: Off/ }).click();
  await expect(page.getByRole('button', { name: /Lockstep scrolling: On/ })).toBeVisible();
  await closeSettings(page);
  await page.getByRole('button', { name: '↓' }).click();
  await expect(world).toHaveAttribute('style', /translateY\(-[1-9]/);
  // Paging lands on the top of a stream rather than cutting one in half.
  await page.waitForTimeout(500);
  const offsets = await page.evaluate(() => {
    const viewport = document.querySelector('.sheet-scroll .viewport')!.getBoundingClientRect().top;
    return [...document.querySelectorAll('.sheet-stream-box')].map((box) => Math.round(box.getBoundingClientRect().top - viewport));
  });
  expect(offsets).toContain(0);
  await page.reload();
  await expect(world).toHaveAttribute('style', /translateY/); // Keyflow remembers the mode
});

test('sheet line widths are adjustable and every setting survives closing the app', async ({ page, context }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: /Decrease/ }).click();
  await closeSettings(page);
  await paneMenu(page, 'Keyboard');
  await page.getByRole('button', { name: /Transpose display: Off/ }).click();
  await closeSettings(page);
  await paneMenu(page, 'Sheet');
  await page.getByRole('button', { name: /Lockstep scrolling: Off/ }).click();
  await page.getByRole('spinbutton', { name: 'Origin line' }).fill('0.1');
  await page.getByRole('spinbutton', { name: 'Octave lines' }).fill('0.05');
  await page.getByRole('spinbutton', { name: 'Octave lines' }).blur();
  const box = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--min-box')));
  const width = async (p: typeof page, selector: string) => Number(await p.locator(selector).first().getAttribute('stroke-width'));
  expect(await width(page, '.octave-zero')).toBeCloseTo(box * .1);
  expect(await width(page, '.octave-line')).toBeCloseTo(box * .05);

  // A new window has empty sessionStorage, like relaunching the installed PWA.
  await page.close();
  const next = await context.newPage();
  await next.goto('./');
  await expect(next.getByRole('main')).toHaveAttribute('data-views', 'keyboard sheet');
  await expect(next.locator('main')).toHaveClass(/transposed/);
  await expect(next.locator('.octave-zero').first()).toBeAttached();
  expect(await width(next, '.octave-zero')).toBeCloseTo(box * .1);
  expect(await width(next, '.octave-line')).toBeCloseTo(box * .05);
  await expect(next.locator('.sheet-scroll .world')).toHaveAttribute('style', /translateY/);
  expect(await next.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--min-box')))).toBeCloseTo(38.4);
  await expect(next.locator('html')).toHaveAttribute('data-storage', /persistent|best-effort/);
});

test('key text and borders take their octave color and a min-box border width from Settings', async ({ page }) => {
  const border = (note: string) => page.locator(`[data-note="${note}"] .keyflow-key`).evaluate((key) => {
    const style = getComputedStyle(key);
    return { color: style.borderTopColor, width: parseFloat(style.borderTopWidth) };
  });
  // Octave n uses distribute_color index n, like sheet line n.
  expect((await border('0-0')).color).toBe('rgb(182, 32, 32)');
  expect(await page.locator('[data-note="0-5"] .keyflow-key').evaluate((key) => getComputedStyle(key).color)).toBe('rgb(182, 32, 32)');
  expect((await border('0-5')).color).toBe('rgb(182, 32, 32)');
  expect((await border('1-0')).color).not.toBe((await border('0-0')).color);
  await paneMenu(page, 'Keyboard');
  await page.getByRole('spinbutton', { name: 'Key border' }).fill('0.1');
  await page.getByRole('spinbutton', { name: 'Key border' }).blur();
  await closeSettings(page);
  // 0.1 × 48px = 4.8px; browsers snap border widths down to whole device pixels.
  await expect.poll(async () => (await border("0-0")).width).toBeGreaterThanOrEqual(4);
});

test('the song screen searches by name and filters by tags, with Keyflow shortcuts', async ({ page }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  await page.keyboard.press('m');
  // The search box is Keyflow's TextBox: the screen opens with its shortcuts live, / starts typing, Escape stops.
  const search = page.getByRole('textbox', { name: 'Search songs' });
  await expect(search).toBeHidden();
  await expect(page.locator('.song-screen .text-entry')).toContainText('/');
  await page.keyboard.press('/');
  await expect(search).toBeFocused();
  await page.keyboard.type('elise');
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
  await expect(page.locator('.song-screen')).toBeVisible();
  await expect(page.locator('.song-results li')).toHaveCount(1);
  await page.keyboard.press('/');
  await expect(search).toBeFocused();
  await search.fill('');
  const results = page.getByRole('list', { name: 'Songs' }).getByRole('listitem');
  const total = await results.count();
  expect(total).toBeGreaterThan(5);

  await search.fill('jasmine');
  await expect(results).toHaveCount(1);
  await search.fill('');
  await page.keyboard.press('Escape'); // leave typing so the screen's controls respond
  await page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: /eastern/ }).click();
  const eastern = await page.locator('.song-results li').evaluateAll((items) => items.map((item) => item.getAttribute('data-song')));
  expect(eastern).toEqual(expect.arrayContaining(['jasmine-flower', 'sakura', 'arirang']));
  expect(eastern).not.toContain('fur-elise');
  // classical covers both western and eastern classical music.
  await page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: /eastern/ }).click();
  await page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: /classical/ }).click();
  const classical = await page.locator('.song-results li').evaluateAll((items) => items.map((item) => item.getAttribute('data-song')));
  expect(classical).toEqual(expect.arrayContaining(['fur-elise', 'jasmine-flower']));

  await page.keyboard.press('/');
  await search.fill('sakura');
  await search.press('Enter'); // picks the first match and closes the screen
  await expect(page.locator('.song-screen')).toHaveCount(0);
  await expect(page.locator('[data-song="sakura"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Song: Sakura/ })).toBeVisible();
});

test('Settings can show the left and right hands as separate streams', async ({ page }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  await expect(page.locator('.sheet-stream').first()).toHaveAttribute('data-hand', 'both');
  await paneMenu(page, 'Sheet');
  await page.getByRole('button', { name: /Hands: Together/ }).click();
  await closeSettings(page);
  const system = page.locator('.sheet-stream-box').first();
  await expect(system.locator('.sheet-stream')).toHaveCount(2);
  const [left, right] = await system.locator('.sheet-stream').evaluateAll((streams) => streams.map((stream) => ({
    hand: stream.getAttribute('data-hand'), top: stream.getBoundingClientRect().top,
    midis: [...stream.querySelectorAll('.sheet-note')].map((note) => Number(note.getAttribute('data-midi'))),
  })));
  // One mega stream: left hand on top, right hand below, under a thick bar.
  expect([left.hand, right.hand]).toEqual(['left', 'right']);
  expect(left.top).toBeLessThan(right.top);
  expect(await system.locator('.sheet-hands').evaluate((hands) => parseFloat(getComputedStyle(hands).borderTopWidth))).toBeGreaterThan(4);
  // Für Elise opens with the right hand's E5–D♯5; its left-hand A2 arpeggio comes after.
  expect(right.midis).toEqual(expect.arrayContaining([76, 75]));
  expect(right.midis).not.toContain(45);
  expect(left.midis).toContain(45);
  await page.reload();
  await expect(page.locator('.sheet-stream-box').first().locator('.sheet-stream')).toHaveCount(2);
});

test('score markings sit above the first stream, and order inversion flips each stream', async ({ page }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  const system = page.locator('.sheet-stream-box').first();
  // Für Elise opens at 100 bpm, piano; time signatures are left out.
  await expect(system.locator('.sheet-mark').first()).toHaveText('bpm=100 p');
  // Markings that would overlap move to a new row instead.
  const boxes = await page.locator('.sheet-marks').first().locator('.sheet-mark, .hairpin').evaluateAll((items) => items.map((item) => {
    const box = item.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  }));
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) {
    const overlap = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    expect(overlap).toBe(false);
  }
  await expect(page.locator('.hairpin[data-kind="crescendo"]').first()).toBeAttached();
  const marks = (await system.locator('.sheet-marks').boundingBox())!;
  const stream = (await system.locator('.sheet-stream').boundingBox())!;
  expect(marks.y + marks.height).toBeLessThanOrEqual(stream.y + 1);

  const origin = () => system.locator('.octave-zero').evaluate((line) => Number(line.getAttribute('y1')));
  expect(await origin()).toBeLessThan(10);
  await paneMenu(page, 'Sheet');
  await page.getByRole('button', { name: /Order: Normal/ }).click();
  await page.getByRole('button', { name: /Hands: Together/ }).click();
  await closeSettings(page);
  // Inverted: octave 0's thick line is at the bottom, the right hand is on top and the thick bar is below.
  const height = Number(await system.locator('.sheet-stream').first().getAttribute('height'));
  expect(await system.locator('.sheet-stream').first().locator('.octave-zero').evaluate((line) => Number(line.getAttribute('y1')))).toBeGreaterThan(height - 10);
  expect(await system.locator('.sheet-stream').evaluateAll((streams) => streams.map((s) => s.getAttribute('data-hand')))).toEqual(['right', 'left']);
  const bar = await system.locator('.sheet-hands').evaluate((hands) => ({
    top: parseFloat(getComputedStyle(hands).borderTopWidth), bottom: parseFloat(getComputedStyle(hands).borderBottomWidth) }));
  expect(bar.top).toBe(0);
  expect(bar.bottom).toBeGreaterThan(4);
});

test('Settings offers Keyflow themes', async ({ page }) => {
  const background = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim());
  expect(await background()).toBe('#ffffff');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.theme-setting button').click();
  await expect.poll(background).toBe('#000000');
  await page.reload();
  await expect.poll(background).toBe('#000000');
});

test('markings stay inside the line', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('nhacode:song', '"symphony-5"'));
  await page.reload();
  await page.getByRole('button', { name: /^Sheet/ }).click();
  await expect(page.locator('.sheet-mark').first()).toBeVisible();
  for (const marks of await page.locator('.sheet-marks').all()) {
    const line = (await marks.boundingBox())!;
    for (const text of await marks.locator('.sheet-mark').all()) {
      const box = (await text.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(line.x + line.width + 1);
    }
  }
});
