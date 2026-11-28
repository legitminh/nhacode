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

test('a narrow toolbar wraps whole items onto new rows instead of squeezing them', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 });
  await page.getByRole('button', { name: /^Sheet/ }).click();
  const boxes = await page.locator('.settings-bar > *').evaluateAll((items) => items.map((item) => {
    const box = item.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, natural: item.scrollWidth };
  }));
  expect(new Set(boxes.map((box) => Math.round(box.top / 10))).size).toBeGreaterThan(1);
  for (const [i, box] of boxes.entries()) {
    expect(box.right - box.left).toBeGreaterThanOrEqual(box.natural - 1);
    expect(box.right).toBeLessThanOrEqual(421);
    for (const other of boxes.slice(i + 1)) {
      const overlap = Math.min(box.right, other.right) - Math.max(box.left, other.left) > 1
        && Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 1;
      expect(overlap).toBe(false);
    }
  }
  // A menu opens below the whole toolbar, however many rows it takes.
  await page.keyboard.press('t');
  const bar = (await page.locator('.settings-bar').boundingBox())!;
  const panel = (await page.locator('.metronome-menu > .subkeyframe-panel').boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
});

test('Für Elise renders as wrapped streams of hex digits with octave lines', async ({ page }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  await page.getByRole('button', { name: /^Keyboard/ }).click();
  await expect(page.locator('.song-select > button', { hasText: 'Für Elise' })).toBeVisible();
  await expect(page.locator('[data-song="fur-elise"]')).toBeVisible();
  const streams = page.locator('.sheet-stream');
  expect(await streams.count()).toBeGreaterThan(3);
  // The opening E5–D♯5 motif: E is digit 7 in the A-based octave 4, so four thin lines sit above it.
  const first = page.locator('.sheet-measure').first();
  expect(await first.locator('.sheet-note').allTextContents()).toEqual(expect.arrayContaining(['7', '6']));
  await expect(streams.first().locator('.octave-line[data-octave="4"]')).not.toHaveCount(0);
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
  const song = (await page.locator('.song-select > button', { hasText: 'Für Elise' }).boundingBox())!;
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
  // Keyflow's Camera marks native scrolling with .native-scroll; lockstep paging drops it.
  const viewport = page.locator('.sheet-scroll .viewport');
  await expect(viewport).toHaveClass(/native-scroll/);
  await paneMenu(page, 'Sheet');
  await page.getByRole('button', { name: /Lockstep scrolling: Off/ }).click();
  await expect(page.getByRole('button', { name: /Lockstep scrolling: On/ })).toBeVisible();
  await closeSettings(page);
  await expect(viewport).not.toHaveClass(/native-scroll/);
  const top = () => page.locator('.sheet-stream-box').first().evaluate((box) => box.getBoundingClientRect().top);
  const before = await top();
  await page.getByRole('button', { name: '↓' }).click();
  await expect.poll(top).toBeLessThan(before - 10);
  // Paging lands on the top of a stream rather than cutting one in half.
  await page.waitForTimeout(500);
  const offsets = await page.evaluate(() => {
    const viewport = document.querySelector('.sheet-scroll .viewport')!.getBoundingClientRect().top;
    return [...document.querySelectorAll('.sheet-stream-box')].map((box) => Math.round(box.getBoundingClientRect().top - viewport));
  });
  expect(offsets).toContain(0);
  await page.reload();
  await expect(viewport).not.toHaveClass(/native-scroll/); // Keyflow remembers the mode
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
  await expect(next.locator('.sheet-scroll .viewport')).not.toHaveClass(/native-scroll/);
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
  await expect(page.locator('.song-select > button', { hasText: 'Sakura' })).toBeVisible();
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
  // The source marks ♩=100 in 3/8, far too fast; songs.json scales it to a usual Poco moto (♩=65).
  await expect(system.locator('.sheet-mark').first()).toHaveText('bpm=65 p');
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

test('sheet playback plays, pauses, seeks to a clicked measure, and is configurable', async ({ page }) => {
  await page.addInitScript(() => {
    const probe = { starts: 0 };
    Object.assign(window, { __playProbe: probe });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args) { probe.starts++; return Reflect.apply(start, this, args); };
  });
  await page.reload();
  await page.getByRole('button', { name: /^Sheet/ }).click();
  await page.getByRole('button', { name: /^Keyboard/ }).click();
  // The play button sits before the song title, which is a 16-character Keyflow BoundedText.
  const play = page.locator('.play-toggle');
  const title = page.locator('.song-select .keyflow-bounded-text');
  await expect(title).toHaveText('Für Elise');
  expect((await play.boundingBox())!.x).toBeLessThan((await title.boundingBox())!.x);
  await expect(play).toContainText('▶');

  await page.keyboard.press('p');
  await expect(play).toHaveAttribute('data-playing', 'true');
  await expect(play).toContainText('⏸');
  await expect.poll(() => page.evaluate(() => (window as any).__playProbe.starts), { timeout: 10000 }).toBeGreaterThan(2);
  await expect(page.locator('.playhead')).toHaveCount(1);

  // Clicking a measure moves the playhead there, and playback continues from it.
  await page.locator('.sheet-measure[data-index="5"]').first().click();
  await expect(page.locator('.playhead')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() =>
    Number(document.querySelector('.playhead')?.closest('[data-index]')?.getAttribute('data-index') ?? -1))).toBeGreaterThanOrEqual(5);
  await page.keyboard.press('p');
  await expect(play).toHaveAttribute('data-playing', 'false');
  const paused = await page.locator('.playhead').evaluate((rect) => rect.closest('[data-index]')!.getAttribute('data-index'));
  await page.waitForTimeout(600);
  expect(await page.locator('.playhead').evaluate((rect) => rect.closest('[data-index]')!.getAttribute('data-index'))).toBe(paused);

  // Settings → Sheet pane: pick the playback instrument, or turn the tool off.
  await paneMenu(page, 'Sheet');
  await page.getByRole('button', { name: /Playback instrument: Grand piano/ }).click();
  await page.getByRole('region', { name: /Playback instrument/ }).getByRole('button', { name: /Violin/ }).click();
  await expect(page.getByRole('button', { name: /Playback instrument: Violin/ })).toBeVisible();
  await page.getByRole('button', { name: /Playback: On/ }).click();
  await closeSettings(page);
  await expect(play).toHaveCount(0);
  await expect(page.locator('.playhead')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.play-toggle')).toHaveCount(0);
});

test('playback menu picks a start measure, and the metronome runs with saved settings', async ({ page }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  await page.getByRole('button', { name: /^Keyboard/ }).click();
  // Toolbar order: playback menu, play, song title, metronome menu, metronome toggle.
  const order = await page.locator('.settings-bar').evaluate((bar) =>
    ['.playback-menu', '.play-toggle', '.song-select', '.metronome-menu', '.metronome-toggle']
      .map((selector) => bar.querySelector(selector)!.getBoundingClientRect().x));
  expect([...order].sort((a, b) => a - b)).toEqual(order);

  await page.keyboard.press('o');
  await page.getByRole('button', { name: /Start playback from/ }).click();
  await expect(page.locator('.pick-banner')).toBeVisible();
  const triangles = page.locator('.pick-start');
  expect(await triangles.count()).toBeGreaterThan(5);
  // Scrolling still works while picking.
  const viewport = page.locator('.sheet-scroll .viewport');
  await viewport.evaluate((element) => element.scrollBy(0, 200));
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.locator('.pick-start[data-index="7"] button').click();
  await expect(page.locator('.pick-banner')).toHaveCount(0);
  await expect(page.locator('.playhead')).toHaveCount(1);
  expect(await page.locator('.playhead').evaluate((rect) => rect.closest('[data-index]')!.getAttribute('data-index'))).toBe('7');
  // Escape cancels picking.
  await page.keyboard.press('o');
  await page.getByRole('button', { name: /Start playback from/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pick-banner')).toHaveCount(0);

  // The metronome starts at the playhead and moves its own cursor.
  await page.keyboard.press('n');
  await expect(page.locator('.metronome-toggle')).toHaveAttribute('data-playing', 'true');
  await expect(page.locator('.metronome-head')).toHaveCount(1);
  // Read the cursor fresh each time: it re-renders as it moves between measures.
  const metronomeMeasure = () => page.evaluate(() =>
    Number(document.querySelector('.metronome-head')?.closest('[data-index]')?.getAttribute('data-index') ?? -1));
  await expect.poll(metronomeMeasure, { timeout: 8000 }).toBeGreaterThan(7);
  await page.keyboard.press('n');
  await expect(page.locator('.metronome-toggle')).toHaveAttribute('data-playing', 'false');
  await expect(page.locator('.metronome-head')).toHaveCount(0);

  // Metronome settings are Keyflow NumberBoxes (0–8) and are remembered.
  await page.keyboard.press('t');
  const strong = page.locator('.metronome-row[data-field="strong"]');
  await strong.getByRole('button').click();
  const field = strong.getByRole('textbox', { name: 'Strong beat' });
  await field.fill('3');
  await field.press('Enter');
  await expect(strong).toContainText('3');
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nhacode:sheet:metronome')!).strong)).toBe(3);
});

test('articulations show above notes (arpeggios left of chords) and can be turned off', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('nhacode:song', '"symphony-5"'));
  await page.reload();
  await page.getByRole('button', { name: /^Sheet/ }).click();
  const accent = page.locator('.articulations[data-art~="accent"]').first();
  await expect(accent).toBeAttached();
  // The accent sits directly above its digit.
  const placed = await accent.evaluate((group) => {
    const digit = group.previousElementSibling!.getBoundingClientRect();
    const mark = group.getBoundingClientRect();
    return { above: mark.top < digit.top + digit.height / 3, centered: Math.abs((mark.left + mark.right) / 2 - (digit.left + digit.right) / 2) < digit.width };
  });
  expect(placed).toEqual({ above: true, centered: true });
  await paneMenu(page, 'Sheet');
  await page.getByRole('button', { name: /Articulations: On/ }).click();
  await closeSettings(page);
  await expect(page.locator('.articulations')).toHaveCount(0);
  await page.evaluate(() => { localStorage.setItem('nhacode:song', '"clair-de-lune"'); localStorage.setItem('nhacode:sheet:articulations', 'true'); });
  await page.reload();
  const arpeggio = page.locator('.art-arpeggio').first();
  await expect(arpeggio).toBeAttached();
  expect(await arpeggio.evaluate((path) => path.getBoundingClientRect().right <= path.closest('g')!.previousElementSibling!.getBoundingClientRect().left + 1)).toBe(true);
});

test('the sustain pedal shows as its own stream only when the score has pedal marks', async ({ page }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  const system = page.locator('.sheet-stream-box').first();
  await expect(system.locator('.sheet-pedal')).toHaveCount(1);
  const below = await system.evaluate((box) => [...box.children].map((child) => child.classList.contains('sheet-pedal') ? 'pedal' : child.classList.contains('sheet-hands') ? 'music' : 'other'));
  expect(below.indexOf('pedal')).toBeGreaterThan(below.indexOf('music'));
  expect(await page.locator('.pedal-span').count()).toBeGreaterThan(5);
  await paneMenu(page, 'Sheet');
  await page.getByRole('button', { name: /Pedal: Below/ }).click();
  await closeSettings(page);
  const above = await system.evaluate((box) => [...box.children].map((child) => child.classList.contains('sheet-pedal') ? 'pedal' : child.classList.contains('sheet-hands') ? 'music' : 'other'));
  expect(above.indexOf('pedal')).toBeLessThan(above.indexOf('music'));
  // Clair de Lune's score has no pedal marks: no pedal stream.
  await page.evaluate(() => localStorage.setItem('nhacode:song', '"clair-de-lune"'));
  await page.reload();
  await expect(page.locator('.sheet-stream').first()).toBeVisible();
  await expect(page.locator('.sheet-pedal')).toHaveCount(0);
});

test('playback and metronome menus have Keyflow speed sliders that are remembered', async ({ page }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  await page.keyboard.press('o');
  const playbackSpeed = page.getByRole('slider', { name: 'Playback speed' });
  await expect(playbackSpeed).toHaveAttribute('aria-valuenow', '1');
  // Keyflow's slider buttons step it; each press moves one 0.05 step.
  const playbackPanel = page.locator('.playback-menu .speed-setting');
  await playbackPanel.getByRole('button', { name: /Decrease Playback speed/ }).click();
  await playbackPanel.getByRole('button', { name: /Decrease Playback speed/ }).click();
  await expect(playbackSpeed).toHaveAttribute('aria-valuenow', '0.9');
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  const metronomeSpeed = page.getByRole('slider', { name: 'Metronome speed' });
  await page.getByRole('button', { name: /Increase Metronome speed/ }).click();
  await expect(metronomeSpeed).toHaveAttribute('aria-valuenow', '1.05');
  await page.reload();
  expect(await page.evaluate(() => [localStorage.getItem('nhacode:sheet:playback-speed'),
    JSON.parse(localStorage.getItem('nhacode:sheet:metronome')!).speed])).toEqual(['0.9', 1.05]);
});

test('modifiers get their own room above (or below) the digit, whatever the order', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('nhacode:song', '"nocturne-op9-2"'));
  await page.reload();
  await page.getByRole('button', { name: /^Sheet/ }).click();
  const relation = () => page.locator('.articulations[data-art~="grace"]').first().evaluate((group) => {
    const digit = group.previousElementSibling!.getBoundingClientRect();
    const mark = group.getBoundingClientRect();
    return mark.bottom <= digit.top + 2 ? 'above' : mark.top >= digit.bottom - 2 ? 'below' : 'overlap';
  });
  await expect(page.locator('.art-grace').first()).toBeAttached();
  expect(await relation()).toBe('above');
  await paneMenu(page, 'Sheet');
  await page.getByRole('button', { name: /Order: Normal/ }).click();
  await closeSettings(page);
  expect(await relation()).toBe('above'); // inversion does not move modifiers
  await paneMenu(page, 'Sheet');
  await page.getByRole('button', { name: /Modifiers: Above/ }).click();
  await closeSettings(page);
  expect(await relation()).toBe('below');
  // Grace notes have their own columns: no two digits in a lane share a column.
  const clash = await page.locator('.sheet-stream').first().evaluate((svg) => {
    const seen = new Set<string>();
    for (const text of svg.querySelectorAll('.sheet-note')) {
      const key = `${text.closest('[data-index]')!.getAttribute('data-index')}:${text.getAttribute('x')}:${text.getAttribute('y')}`;
      if (seen.has(key)) return key;
      seen.add(key);
    }
    return '';
  });
  expect(clash).toBe('');
});

test('autoscroll keeps the playback line at the top of the view', async ({ page }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  await page.getByRole('button', { name: /^Keyboard/ }).click();
  // Move the playhead to a measure far down the sheet (clicking it), with the view at the top.
  await expect(page.locator('.sheet-measure[data-index="60"]').first()).toBeAttached();
  await page.locator('.sheet-measure[data-index="60"]').first().dispatchEvent('click');
  await page.locator('.sheet-scroll .viewport').evaluate((viewport) => viewport.scrollTo(0, 0));
  await page.keyboard.press('p');
  const top = () => page.evaluate(() => {
    const viewport = document.querySelector('.sheet-scroll .viewport')!.getBoundingClientRect().top;
    const line = document.querySelector('.playhead')?.closest('.sheet-stream-box');
    return line ? Math.round(line.getBoundingClientRect().top - viewport) : 9999;
  });
  await expect.poll(top, { timeout: 5000 }).toBeLessThan(5);
  await page.keyboard.press('p');
});

test('export panel downloads an A4 PDF with whole stream lines per page', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('nhacode:sheet:separate-hands', 'true'));
  await page.reload();
  await page.getByRole('button', { name: /^Sheet/ }).click();
  await page.getByRole('button', { name: /^Keyboard/ }).click();
  await expect(page.locator('.sheet-stream-box').first()).toBeVisible();
  await page.keyboard.press('e');
  const summary = page.locator('.export-summary');
  await expect(summary).toContainText(/\d+ pages? at [\d.]+%/);
  // Automatic scaling: the widest stream line fills the width inside one-inch margins.
  const auto = Number(await summary.getAttribute('data-scale'));
  const widest = await page.locator('.sheet-stream-box svg.sheet-stream').evaluateAll((svgs) =>
    Math.max(...svgs.map((svg) => svg.getBoundingClientRect().right - svg.closest('.sheet-stream-box')!.getBoundingClientRect().left)));
  expect(Math.abs(widest * 25.4 / 96 * auto / 100 - (210 - 50.8))).toBeLessThan(1);

  // A larger requested scale is lowered so every line still fits; a smaller one is kept.
  const scaling = page.locator('.export-row[data-field="scale"]');
  await scaling.getByRole('button').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('20');
  await page.keyboard.press('Enter');
  await expect(summary).toHaveAttribute('data-scale', '20');
  const pages = Number(await summary.getAttribute('data-pages'));
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('nhacode:sheet:pdf')!)).scale).toBe(20);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF' }).click()]);
  expect(download.suggestedFilename()).toBe('fur-elise.pdf');
  const pdf = (await (await import('node:fs/promises')).readFile(await download.path())).toString('latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf.match(/\/Type \/Page\b/g)?.length).toBe(pages);
  expect(pdf).toMatch(/\/MediaBox \[0 0 595\.2799\d* 841\.889\d*\]/);
});
