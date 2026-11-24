# Email／密碼登入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留 GitHub／Google 登入的同時，讓任何人都能在正式環境用 email + 密碼註冊與登入，並以資料庫儲存的嘗試次數限制擋暴力破解。

**Architecture:** 開啟 Better Auth 內建的 `emailAndPassword`（所有環境），`rateLimit` 改存 Neon 的新表 `rate_limit`；OAuth provider 只在 id 與 secret 都有設定時啟用，登入頁依同一個判斷決定顯示哪些按鈕。登入頁改成「登入／註冊」分頁表單，錯誤代碼對應成中文訊息。移除測試專用的 `E2E_AUTH` 開關，E2E 改走一般註冊。

**Tech Stack:** Next.js 16.4（App Router）、React 19.3、Better Auth 1.7.27、Drizzle ORM 0.45 / drizzle-kit 0.31、Vitest 5 + PGlite + Testing Library、Playwright 1.65。

**Spec:** `docs/superpowers/specs/2026-11-24-email-password-login-design.md`

## Global Constraints

- 不新增任何 npm 套件；只用 Better Auth 1.7.27 內建功能。
- 密碼長度：`minPasswordLength: 8`、`maxPasswordLength: 128`；`autoSignIn: true`；`requireEmailVerification: false`。
- 嘗試次數限制：`enabled` 在 `NODE_ENV !== 'test'` 時為 true、`storage: 'database'`、全域 `window: 60, max: 100`；`/sign-in/email` 為 `{ window: 60, max: 5 }`、`/sign-up/email` 為 `{ window: 60, max: 3 }`。超過回 429 並帶 `X-Retry-After`（秒）。
- 帳號合併維持 `accountLinking: { enabled: true }`，不設 `trustedProviders`，不覆寫 `requireLocalEmailVerified`。
- 名稱：去頭尾空白後 1–60 字。
- 介面文字為繁體中文；錯誤訊息用 spec §5.3 表格的原文（下方各任務會再列出）。
- 不得把密碼、連線字串或密鑰寫進 log、錯誤訊息、測試輸出或文件。
- `npm test` 不能連網、不能依賴真實資料庫（用 `test/helpers/db.ts` 的 PGlite）。
- 改行為就同步改文件：README、`.env.example`、被改動檔案的檔頭註解，與程式在同一個 commit。前一份設計文件只在頂端加推翻說明，內文不改。
- Commit 訊息結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **讀不到用戶端 IP 時所有人共用一個計數**：兩個不同 IP 的登入嘗試必須分開計數，一個 IP 被鎖不影響另一個（Task 1 測試）；部署後 log 不能出現 `Rate limiting could not determine a client IP`（Task 3 驗證）。
2. **email 大小寫與空白**：用 `Mixed@Example.test` 註冊後，用 `mixed@example.test` 登入要成功；登入頁送出前去掉 email 頭尾空白（Task 1、Task 2 測試）。
3. **密碼不能被修剪**：前後含空白的密碼原樣送出，註冊與登入一致（Task 2 測試）。
4. **連點兩下註冊**：送出中按鈕停用，只送出一次請求（Task 2 測試）。
5. **繞過登入頁直接打 API 塞超長名稱**：伺服器端也要擋下空白或超過 60 字的名稱（Task 1 測試）。

---

### Task 1: 伺服器端 — email／密碼、嘗試次數限制、OAuth 只在有設定時啟用

**Files:**
- Modify: `src/server/db/schema.ts`（新增 `rateLimit` 表；檔頭註解列入它）
- Create: `drizzle/0003_*.sql` 與 `drizzle/meta/0003_snapshot.json`、`drizzle/meta/_journal.json`（由 `npm run db:generate` 產生）
- Modify: `src/server/auth.ts`
- Test: `test/auth.test.ts`

**Interfaces:**
- Produces:
  - `export type SocialProvider = 'github' | 'google'`（`src/server/auth.ts`）
  - `export function getEnabledSocialProviders(env: NodeJS.ProcessEnv): SocialProvider[]` — 順序固定 `github` 在前；id 與 secret 都是非空字串才算啟用。
  - `buildAuthOptions(env, db)` 的 `socialProviders` 只含啟用的 provider。
  - `export function normalizeUserName(name: string, email: string, isEmailSignUp: boolean): string | null`（`src/server/auth.ts`）
  - `export const rateLimit`（`src/server/db/schema.ts`），Postgres 表名 `rate_limit`。匯出名必須是 `rateLimit`：`drizzleAdapter` 以 Better Auth 的 model 名稱在 schema 物件裡找表。
  - 本任務**保留** `isE2EAuthEnabled` 的匯出（登入頁還在用），但它不再影響 `emailAndPassword`；Task 2 會移除它。

- [ ] **Step 1: 改寫 `test/auth.test.ts` 的 `buildAuthOptions` 測試（先紅）**

刪掉兩個 `E2E_AUTH` 測試，`creates the default board…` 那個改用 `NODE_ENV: 'test'`、不帶 `E2E_AUTH`。新增：

```ts
it('enables email/password in every environment with the spec limits', () => {
  for (const NODE_ENV of ['production', 'development', 'test'] as const) {
    expect(buildAuthOptions({ ...baseEnv, NODE_ENV }, db).emailAndPassword).toMatchObject({
      enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true, requireEmailVerification: false,
    });
  }
});

it('rate limits in the database outside tests, with stricter sign-in / sign-up rules', () => {
  const rl = buildAuthOptions({ ...baseEnv, NODE_ENV: 'production' }, db).rateLimit;
  expect(rl).toMatchObject({ enabled: true, storage: 'database', window: 60, max: 100 });
  expect(rl?.customRules?.['/sign-in/email']).toEqual({ window: 60, max: 5 });
  expect(rl?.customRules?.['/sign-up/email']).toEqual({ window: 60, max: 3 });
  expect(buildAuthOptions({ ...baseEnv, NODE_ENV: 'test' }, db).rateLimit?.enabled).toBe(false);
});

describe('getEnabledSocialProviders', () => {
  it.each([
    [{ GITHUB_CLIENT_ID: 'a', GITHUB_CLIENT_SECRET: 'b', GOOGLE_CLIENT_ID: 'c', GOOGLE_CLIENT_SECRET: 'd' }, ['github', 'google']],
    [{ GOOGLE_CLIENT_ID: 'c', GOOGLE_CLIENT_SECRET: 'd' }, ['google']],
    [{}, []],
    [{ GITHUB_CLIENT_ID: 'a', GITHUB_CLIENT_SECRET: '' }, []],
    [{ GITHUB_CLIENT_ID: 'a' }, []],
  ])('%j → %j', (env, expected) => {
    expect(getEnabledSocialProviders(env as NodeJS.ProcessEnv)).toEqual(expected);
    expect(Object.keys(buildAuthOptions({ ...env, NODE_ENV: 'test' } as NodeJS.ProcessEnv, db).socialProviders ?? {})).toEqual(expected);
  });
});
```

再新增一個 `describe('email/password (Better Auth on PGlite)')`，每個測試用 `betterAuth(buildAuthOptions({ ...baseEnv, NODE_ENV: 'test' }, db))` 與各自唯一的 email：

- `signs up an unverified user who gets 我的看板`：`auth.api.signUpEmail(...)` 後 `user.emailVerified === false`，且該使用者的 boards 為 `[['我的看板', 1024]]`。（這同時釘住 spec「密碼帳號不會和 OAuth 自動合併」：Better Auth 在 `requireLocalEmailVerified` 預設為 true 時不合併未驗證的本地帳號，搭配既有的 linking 選項測試。）
- `rejects a second sign-up with the same email`：第二次 `signUpEmail` 丟出 `APIError`，`body.code` 以 `USER_ALREADY_EXISTS` 開頭。
- `gives the same error for a wrong password and an unknown email`：兩者都丟出 `body.code === 'INVALID_EMAIL_OR_PASSWORD'`。
- `rejects passwords of 7 and 129 characters`：分別得到 `PASSWORD_TOO_SHORT`、`PASSWORD_TOO_LONG`。
- `matches email case-insensitively`（Review Focus 2）：以 `Mixed-<uuid>@Example.test` 註冊，以全小寫 `signInEmail` 成功。
- `rejects blank or over-60-character names on the server`（Review Focus 5）：`name: '   '` 與 `name: 'x'.repeat(61)` 都丟出 `APIError`（status 400）且沒有建立使用者；`name: '  小明  '` 存成 `'小明'`。
- `normalizeUserName`（純函式）：`('  小明 ', e, true) → '小明'`；`('', e, true) → null`；`('x'.repeat(61), e, true) → null`；`('x'.repeat(61), e, false) → 'x'.repeat(60)`；`('  ', 'amy@example.test', false) → 'amy'`。

最後一個 `describe('rate limiting (HTTP handler)')`，用 `NODE_ENV: 'production'` 建立 auth，透過 `auth.handler(new Request(...))` 打 `http://localhost:3000/api/auth/sign-in/email`（POST、`content-type: application/json`、`origin: http://localhost:3000`、`x-forwarded-for: <ip>`，body 為不存在的 email 與任意密碼）：

- `locks one IP after 5 sign-in attempts in 60 s`：`203.0.113.7` 前 5 次 status 為 401，第 6 次為 429，`X-Retry-After` 是正整數字串；`rate_limit` 表至少有一列 `key` 含 `203.0.113.7`。
- `counts each IP separately`（Review Focus 1）：接著用 `203.0.113.8` 打一次，status 為 401（不是 429）。
- `allows 3 sign-ups per IP per 60 s`：同一個新 IP 打 `/api/auth/sign-up/email` 4 次（email 各不相同），前 3 次 200，第 4 次 429。

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run test/auth.test.ts`
Expected: FAIL（`getEnabledSocialProviders` 不存在、`emailAndPassword.enabled` 為 false、沒有 `rate_limit` 表）

- [ ] **Step 3: 新增 `rateLimit` 表並產生 migration**

在 `src/server/db/schema.ts` 加：

```ts
export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
```

（對照 `node_modules/@better-auth/core/dist/db/get-tables.mjs` 的 rateLimit 定義：key 唯一必填、count 必填、lastRequest bigint 必填。）然後執行 `npm run db:generate`，確認只產生一個新增 `rate_limit` 表的 `0003_*.sql`，沒有改到其他表。

- [ ] **Step 4: 實作 `src/server/auth.ts`**

- `getEnabledSocialProviders(env)` 與 `socialProviders` 依上方 Interfaces。
- `emailAndPassword`、`rateLimit` 用 Global Constraints 的值；`rateLimit` 的 `customRules` key 為 `'/sign-in/email'`、`'/sign-up/email'`。
- `export function normalizeUserName(name: string, email: string, isEmailSignUp: boolean): string | null`：去頭尾空白。email 註冊時，空字串或超過 60 字回傳 `null`（由呼叫端拒絕）。OAuth 建立的使用者**不能因名稱被拒絕登入**：超過 60 字截成前 60 字，空字串改用 email `@` 之前的部分。
- `databaseHooks.user.create.before(user, ctx)`：以 `ctx?.path === '/sign-up/email'` 判斷是否為 email 註冊，呼叫 `normalizeUserName`；得到 `null` 時丟出 `APIError('BAD_REQUEST', { message: '名稱需為 1 到 60 個字' })`（`import { APIError } from 'better-auth/api'`），否則回傳 `{ data: { ...user, name } }`。保留既有的 `after` hook。
- 檔頭註解改寫：三種登入方式、未驗證 email 不合併、嘗試次數存資料庫、OAuth 只在有設定時啟用、`isE2EAuthEnabled` 暫時保留供登入頁使用（Task 2 移除）。

- [ ] **Step 5: 執行測試確認通過**

Run: `npx vitest run test/auth.test.ts && npx tsc --noEmit`
Expected: PASS，tsc 無錯誤

- [ ] **Step 6: 全部測試**

Run: `npm test`
Expected: 全部通過（既有登入頁測試此時仍 mock `isE2EAuthEnabled`，不受影響）

- [ ] **Step 7: Commit**

```bash
git add src/server/db/schema.ts drizzle src/server/auth.ts test/auth.test.ts
git commit -m "feat(auth): email/password sign-up in all environments, DB-backed rate limits, OAuth only when configured"
```

---

### Task 2: 登入頁 — 登入／註冊分頁、中文錯誤訊息、只顯示有設定的 OAuth

**Files:**
- Modify: `app/(auth)/login/page.tsx`
- Modify: `app/(auth)/login/LoginForm.tsx`
- Modify: `app/(auth)/login/login.module.scss`
- Create: `app/(auth)/login/authErrors.ts`
- Create: `src/client/navigate.ts`
- Modify: `src/client/authClient.ts`（也匯出 `signUp`，改寫檔頭註解）
- Modify: `src/server/auth.ts`（移除 `isE2EAuthEnabled` 與相關註解）
- Test: `test/app/login.test.tsx`、`test/authErrors.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `getEnabledSocialProviders(env): SocialProvider[]` 與 `SocialProvider`。
- Produces:
  - `authErrorMessage(e: { code?: string; status?: number } | null | undefined, retryAfter?: string | null): string`（`authErrors.ts`）
  - `hardNavigate(url: string): void`（`src/client/navigate.ts`，內容為 `window.location.assign(url)`；讓測試可以 mock，並讓伺服器 layout 以新的 session cookie 重新渲染）
  - `LoginForm` props：`{ callbackURL: string; providers: SocialProvider[]; authError?: AuthError }`（取代 `showEmailForm`）

- [ ] **Step 1: 寫 `test/authErrors.test.ts`（先紅）**

```ts
it.each([
  [{ code: 'INVALID_EMAIL_OR_PASSWORD' }, null, 'email 或密碼錯誤'],
  [{ code: 'USER_ALREADY_EXISTS' }, null, '這個 email 已經註冊過，請直接登入（如果當初是用 GitHub 或 Google，請按下方按鈕）'],
  [{ code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' }, null, '這個 email 已經註冊過，請直接登入（如果當初是用 GitHub 或 Google，請按下方按鈕）'],
  [{ code: 'PASSWORD_TOO_SHORT' }, null, '密碼需為 8 到 128 個字元'],
  [{ code: 'PASSWORD_TOO_LONG' }, null, '密碼需為 8 到 128 個字元'],
  [{ code: 'INVALID_EMAIL' }, null, 'email 格式不正確'],
  [{ status: 429 }, '42', '嘗試太多次，請 42 秒後再試'],
  [{ status: 429 }, null, '嘗試太多次，請稍後再試'],
  [{ status: 429 }, 'abc', '嘗試太多次，請稍後再試'],
  [{ code: 'SOMETHING_ELSE', status: 500 }, null, '登入失敗，請再試一次。'],
  [null, null, '登入失敗，請再試一次。'],
])('%j / %s → %s', (e, retry, msg) => expect(authErrorMessage(e, retry)).toBe(msg));
```

- [ ] **Step 2: 改寫 `test/app/login.test.tsx`（先紅）**

mock 改為 `signIn: { social, email }`、`signUp: { email }`、`@/client/navigate` 的 `hardNavigate`、`@/server/auth` 的 `getEnabledSocialProviders`（預設回傳 `['github', 'google']`）與 `getSessionUser`。既有的 redirect、`?error=` 測試保留；`account_not_linked` 的期望文字改為：

`這個 email 已經用另一種方式註冊過，且尚未驗證，因此無法自動合併。請改用當初的方式登入。`

新增測試（欄位用 `getByLabelText`，分頁用 `getByRole('tab', { name })`，送出鈕用 `getByRole('button', { name: '登入' | '註冊' })`）：

- `starts on the 登入 tab with Email and 密碼 only`：`tab 登入` 的 `aria-selected="true"`；沒有「名稱」「確認密碼」欄位。
- `signs in with a trimmed email and the exact password, then navigates`（Review Focus 2、3）：輸入 `'  a@example.test  '` 與 `'  pass word  '`，按「登入」→ `signIn.email` 收到 `{ email: 'a@example.test', password: '  pass word  ' }`，接著 `hardNavigate('/focus')`。
- `registers with name, email and matching passwords`：切到「註冊」，填名稱 `小明`、email、兩次相同密碼 → `signUp.email` 收到 `{ name: '小明', email, password }`，成功後 `hardNavigate('/focus')`。
- `checks the form before sending`：註冊時名稱空白 → `請輸入名稱（最多 60 字）`；密碼 7 字 → `密碼需為 8 到 128 個字元`；兩次密碼不同 → `兩次輸入的密碼不一致`；email 空白 → `請輸入 email`；以上皆不呼叫 `signUp.email`。
- `disables the submit button while a request is pending and sends once`（Review Focus 4）：`signUp.email` 回傳一個尚未 resolve 的 promise，連點兩次「註冊」→ 只被呼叫一次且按鈕 `disabled`；resolve 後恢復。
- `shows the mapped message and Retry-After for a 429`：`signIn.email` 透過 `fetchOptions.onError` 收到 `ctx.response.headers.get('X-Retry-After') === '30'` 並回傳 `{ error: { status: 429 } }` → alert 為 `嘗試太多次，請 30 秒後再試`。
- `clears the error when switching tabs`：登入失敗出現 alert 後切到「註冊」，alert 消失。
- `hides the OAuth section when no provider is configured`：`getEnabledSocialProviders` 回傳 `[]` → 沒有「或」分隔線、沒有任何「使用 … 登入」按鈕；回傳 `['google']` → 只有 Google 按鈕。

- [ ] **Step 3: 執行測試確認失敗**

Run: `npx vitest run test/authErrors.test.ts test/app/login.test.tsx`
Expected: FAIL

- [ ] **Step 4: 實作**

- `authErrors.ts`：依 Step 1 的對應；`retryAfter` 只接受正整數字串。
- `LoginForm.tsx`：版面照 spec §5.3 的草圖；分頁為 `role="tablist"` 內兩個 `role="tab"` 按鈕（`aria-selected`），切換時清掉錯誤與確認密碼。欄位 `autocomplete`：email `email`、名稱 `name`、密碼在登入為 `current-password`、註冊為 `new-password`。email 去頭尾空白，密碼不修剪。用 `fetchOptions: { onError: (ctx) => { retryAfter = ctx.response.headers.get('X-Retry-After'); } }` 取得秒數。成功（`error` 為空）呼叫 `hardNavigate(callbackURL)`，不把 `callbackURL` 傳給 `signIn.email`／`signUp.email`（避免和用戶端自動跳轉重複）。表單 `onKeyDown` 遇到 `isImeEnter(e)` 時 `preventDefault()`。OAuth 按鈕與 `account_not_linked`、`?error=1` 的處理保留，只渲染 `providers` 中的 provider，`providers` 為空時連「或」分隔線都不渲染。
- `page.tsx`：傳 `providers={getEnabledSocialProviders(process.env)}`，移除 `isE2EAuthEnabled`。
- `src/server/auth.ts`：刪除 `isE2EAuthEnabled` 與它的註解。
- 各檔檔頭註解改寫成新行為。

- [ ] **Step 5: 執行測試確認通過**

Run: `npx vitest run test/authErrors.test.ts test/app/login.test.tsx && npx tsc --noEmit && npm run lint`
Expected: PASS

- [ ] **Step 6: 全部測試**

Run: `npm test`
Expected: 全部通過

- [ ] **Step 7: Commit**

```bash
git add app/\(auth\)/login src/client/navigate.ts src/client/authClient.ts src/server/auth.ts test/app/login.test.tsx test/authErrors.test.ts
git commit -m "feat(login): sign-in / sign-up tabs with Chinese errors; show only configured OAuth buttons"
```

---

### Task 3: E2E、文件、部署驗證

**Files:**
- Modify: `e2e/global-setup.ts`（改走一般註冊，檔頭註解不再提 `E2E_AUTH`）
- Modify: `playwright.config.ts`（`webServer.env` 拿掉 `E2E_AUTH`，改寫檔頭註解）
- Create: `e2e/signup.spec.ts`
- Modify: `README.md`、`.env.example`
- Modify: `docs/superpowers/specs/2026-11-23-focus-cockpit-nextjs-design.md`（只在第一行之前加推翻說明）

**Interfaces:**
- Consumes: Task 2 的登入頁（分頁 `role="tab"`、欄位 label「名稱」「Email」「密碼」「確認密碼」、送出鈕「註冊」）。

- [ ] **Step 1: 寫 `e2e/signup.spec.ts`**

（spec §5.4 寫的是在 `main-flow.spec.ts` 開頭加一段；但那個檔案用 global-setup 已登入的 storageState，在同一個測試裡再註冊會互相干擾，所以改成獨立檔案、不帶登入狀態。）

沿用 `main-flow.spec.ts` 的 `test.skip(!process.env.DATABASE_URL, …)`，並 `test.use({ storageState: { cookies: [], origins: [] } })`：前往 `/login` → 點「註冊」分頁 → 填名稱 `E2E 註冊`、唯一 email、兩次密碼 `e2e-password-123` → 按「註冊」→ 期望網址為 `/focus`，側欄看得到 `E2E 註冊`。

- [ ] **Step 2: 更新 `global-setup.ts` 與 `playwright.config.ts`**

`global-setup.ts` 的註冊請求不變（`/api/auth/sign-up/email`），只拿掉 `E2E_AUTH` 相關說明；`playwright.config.ts` 的 `webServer.env` 移除 `E2E_AUTH: '1'`。

Run: `npx tsc --noEmit && npm run test:e2e`
Expected: tsc 通過；沒有 `DATABASE_URL` 時 E2E 全部略過並以 0 結束

- [ ] **Step 3: 更新文件**

- `README.md`：
  - 開頭的網站入口說明改為「用 email 註冊，或用 GitHub、Google 帳號登入」。
  - 功能列表加一條「登入」：三種方式、沒有忘記密碼（忘記時請聯絡管理者）、嘗試次數限制。
  - 「資安」段落：把「測試用的密碼登入在正式環境永遠關閉」改為密碼以 scrypt 雜湊儲存、登入每個 IP 每分鐘 5 次與註冊 3 次的限制存在資料庫、錯誤訊息不透露 email 是否存在。
  - 「環境變數」表：GitHub／Google 四個變數標為「選填，沒設定就不顯示該按鈕」；刪除 `E2E_AUTH` 一列。
  - 「本機開發」：OAuth App 的步驟標為選填。
  - 「端對端測試」：刪除 `E2E_AUTH=1` 的說明，加上 `e2e/signup.spec.ts`。
  - 「部署到 Vercel」：OAuth 為選填；部署後確認 log 沒有 `Rate limiting could not determine a client IP`。
  - 「登入與帳號連結」：改寫為三種方式，密碼註冊的 email 未驗證，因此不會和同 email 的 GitHub／Google 自動合併，並附登入頁顯示的訊息原文。
- `.env.example`：OAuth 四個變數的註解標為選填；刪除 `E2E_AUTH`。
- `docs/superpowers/specs/2026-11-23-focus-cockpit-nextjs-design.md` 第一行之前加：

  `> ⚠ 已被 2026-11-24-email-password-login-design.md 推翻：§8「只提供 GitHub 與 Google 登入」不再成立（2026-11-24）`

- [ ] **Step 4: 全部檢查**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: 全部通過（build 不需要 `.env`）

- [ ] **Step 5: Commit**

```bash
git add e2e playwright.config.ts README.md .env.example docs/superpowers/specs/2026-11-23-focus-cockpit-nextjs-design.md
git commit -m "docs+e2e: email/password login; OAuth optional; drop E2E_AUTH"
```

- [ ] **Step 6: 部署驗證（由主控者執行，不由子代理執行）**

推送後等 PR #7 的 Preview 部署 Ready（Preview 接的是非正式資料庫 `task-scheduler-preview`）：

- build log 有 `migrations applied successfully!`，且 `0003` 已套用。
- 執行期 log 沒有 `Rate limiting could not determine a client IP`；若有，依 spec §7 在 `advanced.ipAddress.ipAddressHeaders` 指定 Vercel 的標頭，另開一個修正 commit。
- 由使用者在瀏覽器實際註冊、登出、再登入一次（Preview 有 Vercel 部署保護）。
