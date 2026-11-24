// Sign-up through the real login page (spec §5.4): 註冊 tab → fill the form → land on /focus with
// the new account's name in the sidebar. Runs without the shared session from global-setup.
// Skips as a whole when DATABASE_URL is not set (see playwright.config.ts).
import { expect, test } from '@playwright/test';

test.skip(!process.env.DATABASE_URL, '需要 DATABASE_URL（測試用 Neon branch）；未設定時略過 E2E。');
test.use({ storageState: { cookies: [], origins: [] } });

test('sign up from the login page', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('tab', { name: '註冊' }).click();
  await page.getByLabel('名稱').fill('E2E 註冊');
  await page.getByLabel('Email').fill(`e2e-signup-${Date.now()}@example.test`);
  await page.getByLabel('密碼', { exact: true }).fill('e2e-password-123');
  await page.getByLabel('確認密碼').fill('e2e-password-123');
  await page.getByRole('button', { name: '註冊', exact: true }).click();

  await expect(page).toHaveURL(/\/focus$/);
  await expect(page.getByRole('button', { name: 'E2E 註冊 的帳號選單' })).toBeVisible();
});
