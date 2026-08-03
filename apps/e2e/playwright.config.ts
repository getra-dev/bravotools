import { defineConfig, devices } from '@playwright/test';

// LOCAL-FIRST (ADR-014): testai eina prieš tą patį lokalų stack'ą, kurį
// naudoja kūrimas — web :3100 ir Supabase :55321. Jokių prod raktų.
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'lt-LT',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/supply.json' },
      // anonimo testai turi savo projektą — čia jie būtų prisijungę
      testIgnore: /anonymous\.spec\.ts/,
      dependencies: ['setup'],
    },
    // Neprisijungęs vartotojas — atskiras projektas be storageState.
    {
      name: 'anonymous',
      testMatch: /anonymous\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm --dir ../.. dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
