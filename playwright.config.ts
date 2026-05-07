import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for E2E tests.
 *
 * Only Chromium is configured — add Firefox/WebKit when needed.
 * All backend API calls are intercepted via page.route() so no real
 * Lambda/Bedrock/S3 services are needed; only the Vite frontend must run.
 *
 * Run with:  npx playwright test
 * UI mode:   npx playwright test --ui
 * Debug:     npx playwright test --debug
 */
export default defineConfig({
  testDir:   './tests/e2e',
  fullyParallel: false,    // keep sequential — tests share state via localStorage injection
  retries:   process.env.CI ? 2 : 0,
  timeout:   30_000,

  use: {
    baseURL:            'http://localhost:5173',
    screenshot:         'only-on-failure',
    video:              'retain-on-failure',
    trace:              'retain-on-failure',
    actionTimeout:      10_000,
    navigationTimeout:  15_000,
  },

  projects: [
    {
      name: 'chromium',
      use:  { ...devices['Desktop Chrome'] },
    },
  ],

  // Start the Vite dev server automatically.
  // Set reuseExistingServer=true locally so a manually started `npm run dev` is reused.
  webServer: {
    command:             'npm run dev --workspace=frontend',
    port:                5173,
    reuseExistingServer: !process.env.CI,
    timeout:             60_000,
  },
});
