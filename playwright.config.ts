// Playwright E2E (spec §10). Needs a real Postgres: DATABASE_URL must point at a throw-away
// database (a Neon branch made for tests — see README 「端對端測試」). Without DATABASE_URL the
// dev server is not started and every test skips itself, so `npm run test:e2e` still exits 0.
// With it: `npm run dev` is started as usual; the server always accepts email/password, which
// global-setup uses to sign up once and save the session as e2e/.auth/state.json (signup.spec.ts
// exercises the real login page without that session).
import { defineConfig, devices } from '@playwright/test';

const hasDb = Boolean(process.env.DATABASE_URL);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/state.json' } }],
  webServer: hasDb
    ? {
        command: 'npm run dev',
        url: 'http://localhost:3000/login',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: process.env as Record<string, string>,
      }
    : undefined,
});
