import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test('mobile audio requests its own playback session before creating an output context', async ({ page }) => {
  await page.addInitScript(() => {
    const session = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: session });
    const NativeContext = window.AudioContext;
    const contexts: AudioContext[] = [];
    const sessions: string[] = [];
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        sessions.push(session.type);
        super(options);
        contexts.push(this);
      }
    };
    Object.assign(window, { __mobileAudio: { contexts, sessions } });
  });
  await page.goto('./');
  await expect(page.getByRole('main')).toHaveAttribute('data-audio-state', 'ready');
  expect(await page.evaluate(() => (window as any).__mobileAudio.sessions)).toEqual(['playback']);
  await page.locator('[data-note="3-0"] button').tap();
  await expect.poll(() => page.evaluate(() => (window as any).__mobileAudio.contexts[0].state)).toBe('running');
  await expect(page.locator('.sounding')).toHaveCount(0);
});

test('mobile audio retries unlocking on touch release when touch-down activation is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    let phase = 'load';
    window.addEventListener('pointerdown', () => { phase = 'down'; }, true);
    window.addEventListener('pointerup', () => { phase = 'up'; }, true);
    window.addEventListener('click', () => { phase = 'click'; }, true);
    const NativeContext = window.AudioContext;
    const nativeResume = NativeContext.prototype.resume;
    const contexts: AudioContext[] = [];
    const attempts: string[] = [];
    const pending: (() => void)[] = [];
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        contexts.push(this);
        void this.suspend();
      }
      resume() {
        attempts.push(phase);
        if (phase === 'down') return new Promise<void>((resolve) => pending.push(resolve));
        return nativeResume.call(this).then(() => pending.splice(0).forEach((resolve) => resolve()));
      }
    };
    Object.assign(window, { __mobileAudio: { contexts, attempts } });
  });
  await page.goto('./');
  await expect(page.getByRole('main')).toHaveAttribute('data-audio-state', 'ready');
  await page.locator('[data-note="3-0"] button').tap();
  await expect.poll(() => page.evaluate(() => (window as any).__mobileAudio.contexts[0].state)).toBe('running');
  const attempts = await page.evaluate(() => (window as any).__mobileAudio.attempts as string[]);
  expect(attempts).toContain('down');
  expect(attempts.some((phase) => phase === 'up' || phase === 'click')).toBe(true);
  await expect(page.locator('.sounding')).toHaveCount(0);
});
