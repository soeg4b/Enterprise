import { defineConfig, devices } from '@playwright/test';

// Playwright scaffold for DeliverIQ web E2E.
// To execute end-to-end against a live stack: `npm run dev:backend` + `npm run dev:frontend`,
// then `npm run test:e2e` from this directory.
// API calls in these specs are mocked via `page.route()` so they DO NOT require a running backend.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3601',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
