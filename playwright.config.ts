import { defineConfig } from '@playwright/test';

const browserName = process.env.PLAYWRIGHT_BROWSER === 'webkit' ? 'webkit' : 'chromium';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  use: {
    browserName,
    hasTouch: browserName === 'webkit',
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173/',
    channel: browserName === 'chromium' && !process.env.CI && !process.env.CHROME_PATH ? 'chrome' : undefined,
    launchOptions: browserName === 'chromium' && process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
