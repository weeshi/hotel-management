import { defineConfig, devices } from '@playwright/test';
import { APP_BASE, APP_ENV, DUMMY_BASE, DUMMY_ENV } from './tests/e2e/setup/env';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: APP_BASE,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  globalSetup: './tests/e2e/setup/global.setup.ts',
  globalTeardown: './tests/e2e/setup/global.teardown.ts',
  webServer: [
    {
      command: 'npm run e2e:dummy-gateway',
      url: `${DUMMY_BASE}/__health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: DUMMY_ENV,
    },
    {
      command: 'npm run e2e:prepare-db && npm run build && npm run start',
      url: `${APP_BASE}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: APP_ENV,
    },
  ],
});
