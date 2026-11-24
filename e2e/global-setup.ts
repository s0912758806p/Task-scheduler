// Signs up a fresh email/password test account through the sign-up API (the server always accepts
// email/password) and saves the session cookie to e2e/.auth/state.json for every test. A new user gets an empty 「我的看板」.
// Does nothing without DATABASE_URL (the whole suite skips then).
import { mkdirSync, writeFileSync } from 'node:fs';
import { request, type FullConfig } from '@playwright/test';

export const STATE_PATH = 'e2e/.auth/state.json';

export default async function globalSetup(config: FullConfig) {
  mkdirSync('e2e/.auth', { recursive: true });
  if (!process.env.DATABASE_URL) {
    // The projects reference this file as storageState; keep it valid even though tests skip.
    writeFileSync(STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }
  const baseURL = config.projects[0].use.baseURL ?? 'http://localhost:3000';
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const response = await api.post('/api/auth/sign-up/email', {
    data: {
      name: 'E2E 測試',
      email: `e2e-${Date.now()}@example.test`,
      password: 'e2e-password-123',
    },
  });
  if (!response.ok()) {
    throw new Error(`E2E sign-up failed: ${response.status()} ${await response.text()}`);
  }
  await api.storageState({ path: STATE_PATH });
  await api.dispose();
}
