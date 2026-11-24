// Main flow (spec §10): board → quick add → drag → detail panel → delete + undo → second board →
// ⌘K jump → 今日焦點 → reload persistence → no notification permission request.
// Skips as a whole when DATABASE_URL is not set (see playwright.config.ts).
import { expect, test, type Page } from '@playwright/test';

test.skip(!process.env.DATABASE_URL, '需要 DATABASE_URL（測試用 Neon branch）；未設定時略過 E2E。');

declare global {
  interface Window {
    __permissionRequests: number;
    __initialPermission: string;
  }
}

const card = (page: Page, title: string) =>
  page.locator('[data-rfd-draggable-id]').filter({ has: page.getByRole('button', { name: title, exact: true }) });

test('main flow', async ({ page }) => {
  // Count permission prompts from the very first script of every page load.
  await page.addInitScript(() => {
    window.__permissionRequests = 0;
    window.__initialPermission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    if (typeof Notification !== 'undefined') {
      const original = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = (...args: Parameters<typeof original>) => {
        window.__permissionRequests += 1;
        return original(...args);
      };
    }
  });

  // 登入（已由 global-setup 完成）→ 預設看板
  await page.goto('/');
  await expect(page).toHaveURL(/\/focus$/);
  await page.getByRole('navigation', { name: '側欄' }).getByRole('link', { name: /我的看板/ }).click();
  await expect(page).toHaveURL(/\/b\/[^/?]+$/);
  const firstBoardUrl = page.url();

  // 快速新增
  await page.getByPlaceholder(/快速新增/).first().fill('修 bug !高 #前端 明天');
  await page.getByPlaceholder(/快速新增/).first().press('Enter');
  const bug = card(page, '修 bug');
  await expect(bug).toBeVisible();
  await expect(bug).toContainText('高');
  await expect(bug).toContainText('明天');

  // 拖到「進行中」（鍵盤拖曳：Space 拿起、→ 換欄、Space 放下）
  await bug.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-rfd-droppable-id="in-progress"]').getByRole('button', { name: '修 bug', exact: true })).toBeVisible();

  // 詳情欄改優先級為「緊急」
  await page.getByRole('button', { name: '修 bug', exact: true }).click();
  const panel = page.getByRole('region').filter({ has: page.getByLabel('任務名稱') });
  await expect(panel.getByLabel('任務名稱')).toHaveValue('修 bug');
  await panel.getByRole('combobox', { name: '優先級' }).click();
  await page.locator('.ant-select-item-option').filter({ hasText: '緊急' }).click();
  await expect(card(page, '修 bug')).toContainText('緊急');

  // 刪除 → 提示列「復原」→ 卡片回來
  await panel.getByRole('button', { name: '刪除' }).click();
  await expect(card(page, '修 bug')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('已刪除');
  await page.getByRole('status').getByRole('button', { name: '復原' }).click();
  await expect(card(page, '修 bug')).toBeVisible();

  // 第二個看板，新增「串接天氣 API」
  await page.getByRole('button', { name: '新增看板' }).click();
  await page.getByRole('dialog').getByLabel('看板名稱').fill('第二個看板');
  await page.getByRole('dialog').getByRole('button', { name: '建立' }).click();
  await expect(page).toHaveURL(/\/b\/[^/?]+$/);
  const secondBoardUrl = page.url();
  expect(secondBoardUrl).not.toBe(firstBoardUrl);
  await page.getByPlaceholder(/快速新增/).first().fill('串接天氣 API');
  await page.getByPlaceholder(/快速新增/).first().press('Enter');
  await expect(card(page, '串接天氣 API')).toBeVisible();

  // 回第一個看板，⌘K 搜尋「天氣」→ 第二個看板、詳情欄開著
  await page.goto(firstBoardUrl);
  await expect(card(page, '修 bug')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox', { name: /搜尋任務/ }).fill('天氣');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${secondBoardUrl}\\?task=`));
  await expect(page.getByLabel('任務名稱')).toHaveValue('串接天氣 API');

  // 今日焦點
  await page.goto('/focus');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('今天有');
  await expect(page.getByRole('region', { name: '接下來 7 天' })).toContainText('修 bug');

  // 重新整理後資料仍在
  await page.goto(firstBoardUrl);
  await page.reload();
  await expect(card(page, '修 bug')).toBeVisible();

  // 整個流程沒有請求通知權限
  expect(await page.evaluate(() => window.__permissionRequests)).toBe(0);
  expect(await page.evaluate(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission))).toBe(
    await page.evaluate(() => window.__initialPermission),
  );
});
