import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests for the marketing site. The waitlist tests need the Nivra API
 * (NEXT_PUBLIC_SAJHA_API_URL, default http://localhost:3000) running.
 *
 *   pnpm --filter @sajha/web build && pnpm --filter @sajha/web test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:3002', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:3002',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
