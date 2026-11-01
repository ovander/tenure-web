import { defineConfig, devices } from '@playwright/test'

// The smoke runs the built bundle under tenure's CSP (e2e/server.mjs).
// PLAYWRIGHT_CHROMIUM_PATH points at a preinstalled Chromium when the
// Playwright-managed one is not installed.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    testIdAttribute: 'data-test',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
      },
    },
  ],
  webServer: { command: 'node e2e/server.mjs', url: 'http://127.0.0.1:4173/bff/session', reuseExistingServer: false },
})
