import { defineConfig, devices } from '@playwright/test';

if (!process.env.PLAYWRIGHT_BASE_URL) {
  throw new Error('Use npm run test:e2e to start the isolated test environment');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  timeout: 30000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    timezoneId: 'America/Los_Angeles',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
