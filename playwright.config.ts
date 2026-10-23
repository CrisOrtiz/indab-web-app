import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: the real app (`ng serve`, development config) against the Auth and
// Firestore emulators with the real `firestore.rules`. Run with `npm run test:e2e`, which
// starts the emulators; Playwright starts the dev server.
const port = 4200;

export default defineConfig({
  testDir: 'e2e',
  // Every test resets the shared emulators, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'es-CL',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional: use an already installed Chromium instead of `npx playwright install`.
        launchOptions: { executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'] || undefined },
      },
    },
  ],
  webServer: {
    command: `npx ng serve --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
