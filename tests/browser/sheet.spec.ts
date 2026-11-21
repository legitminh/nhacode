import { expect, test } from '@playwright/test';

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
  expect(await sizes()).toEqual({ box: 48, toggle: 38.4, note: 38.4 });
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

test('song menu sits on the toolbar and keyboard margins step in Settings', async ({ page }) => {
  await page.getByRole('button', { name: /^Sheet/ }).click();
  const song = (await page.getByRole('button', { name: /Song: Für Elise/ }).boundingBox())!;
  const settings = (await page.getByRole('button', { name: /Settings/ }).boundingBox())!;
  expect(Math.abs(song.y + song.height / 2 - (settings.y + settings.height / 2))).toBeLessThan(4);

  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: /Keyboard margins/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+ left margin' }).click();
  await page.getByRole('button', { name: '+ top margin' }).click();
  await page.getByRole('button', { name: '− top margin' }).click();
  const view = page.getByRole('region', { name: 'Keyboard', exact: true });
  await expect(view).toHaveCSS('padding', '0px 0px 0px 24px');
  await page.reload();
  await expect(view).toHaveCSS('padding', '0px 0px 0px 24px');
  const key = (await page.locator('[data-note="0-0"]').boundingBox())!;
  const box = (await view.boundingBox())!;
  expect(key.x).toBeGreaterThanOrEqual(box.x + 24);
});
