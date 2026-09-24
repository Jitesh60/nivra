import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the admin panel. They need a running Sajha API
 * (SAJHA_API_URL, default http://localhost:3000) with its database migrated;
 * global-setup seeds a fresh Super Admin through the API's seed script.
 *
 *   pnpm --filter @sajha/admin build && pnpm --filter @sajha/admin test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use a preinstalled Chromium when the bundled one isn't available.
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:3001/login',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
