# Email／密碼登入 設計文件

> ⚠ 已被最終審查修正（final review fix，commit「fix(auth): cap sign-up and update-user input …」）補充：§5.3 的 `account_not_linked` 訊息末尾加上「如果你沒有用這個 email 註冊過，請聯絡管理者。」；§5.1 另加 email 註冊不收頭像、email 最多 254 字元，以及 `user.update.before` 對 `/update-user` 的名稱／頭像檢查（2026-11-24）

- 日期：2026-11-24
- 狀態：草稿，待確認
- 分支：`feat/focus-cockpit-redesign`（PR #7 合併前一起上線）
- 修改的前一份設計：`2026-11-23-focus-cockpit-nextjs-design.md` §8「登入」（原本只有 GitHub／Google）

## 1. 目的

使用者不一定有、或不想用 GitHub／Google 帳號登入一個任務管理工具。在保留 GitHub 與 Google 登入的同時，加上一般的 **email + 密碼註冊與登入**，正式環境就能使用。

## 2. 目標／非目標／反目標

**目標**
- 正式環境可用 email + 密碼註冊、登入；GitHub、Google 登入照舊。
- 註冊開放給任何人（與 OAuth 一致），每個人的資料照舊各自隔離。
- 登入與註冊有嘗試次數限制，抵擋暴力破解與大量註冊。
- 沒設定的 OAuth 不顯示按鈕。

**非目標（這次不做）**
- 忘記密碼／重設密碼、email 驗證：都需要寄信服務，之後接 Resend 之類再做。忘記密碼時暫由管理者在資料庫處理。
- 已登入的使用者改密碼、替 OAuth 帳號加設密碼。
- 限制只有特定 email 能註冊。

**反目標（做了會比沒做更糟）**
- 讓未驗證的 email 帳號和 OAuth 帳號自動合併（等於讓人先用別人的 email 註冊、再接管對方帳號）。
- 登入失敗的訊息透露「email 不存在」還是「密碼錯誤」。
- 只在記憶體計算嘗試次數：Vercel 有多個執行個體，各自計數等於沒限制。
- 密碼以明碼或可逆方式儲存、出現在 log 或錯誤訊息裡。

## 3. 限制

- 沿用 Better Auth 1.7.27 內建的 `emailAndPassword`（密碼以 scrypt 雜湊存在 `account.password`，資料表已有此欄位）。不引入新的套件。
- 跑在 Vercel serverless；嘗試次數必須存在共用的資料庫（Neon）。
- `npm test` 用 PGlite，仍不能依賴真實資料庫或網路。
- 介面文字為繁體中文。

## 4. 做法（Approaches）

| 做法 | 取捨 | 決定 |
|------|------|------|
| **A. 開啟 Better Auth 內建 email／密碼，嘗試次數存資料庫** | 不加套件；雜湊、session、帳號合併規則都沿用現有設定；需要一個 migration 新增計數表 | ✅ 採用 |
| B. 自己寫註冊／登入 API | 要自己處理雜湊、時序攻擊、session，容易出錯，和 Better Auth 的 session 重疊 | ✗ |
| C. 改用 magic link（寄登入連結） | 不用記密碼，但必須先有寄信服務，與「這次不接寄信」衝突 | ✗ |

嘗試次數的儲存另外比較過：Better Auth 預設存在記憶體，在 Vercel 多執行個體下無效；Upstash Redis 要再多一個服務和密鑰。用 Neon 一張小表最簡單，所以採用資料庫儲存。

## 5. 設計

### 5.1 伺服器（`src/server/auth.ts`）

- `emailAndPassword`：`enabled: true`（所有環境）、`minPasswordLength: 8`、`maxPasswordLength: 128`、`autoSignIn: true`（註冊完直接登入）、`requireEmailVerification: false`。
- `socialProviders`：只放入 client id 與 secret **都有設定**的 provider。匯出 `getEnabledSocialProviders(env): ('github' | 'google')[]` 給登入頁決定要顯示哪些按鈕，伺服器設定與畫面用同一個判斷。
- `account.accountLinking` 維持 `{ enabled: true }`、不設 `trustedProviders`。密碼註冊的使用者 `emailVerified = false`，所以之後用同一個 email 的 GitHub／Google 登入**不會**自動合併，走現有的 `account_not_linked` 訊息。
- `rateLimit`：`enabled: true`、`storage: 'database'`、全域預設 `window: 60, max: 100`，另加：
  - `/sign-in/email`：每個 IP 60 秒 5 次
  - `/sign-up/email`：每個 IP 60 秒 3 次
  
  超過時 Better Auth 回 429，並帶 `X-Retry-After`（秒）。測試環境（`NODE_ENV === 'test'`）關閉，避免測試互相影響；另寫一個測試明確開啟它來驗證 429。
- `user.create.after` 建立「我的看板」的 hook 不變，密碼註冊的使用者一樣會有預設看板。
- 移除 `isE2EAuthEnabled` 與 `E2E_AUTH`：密碼登入已是正式功能，不再需要測試專用開關。

### 5.2 資料庫

- `src/server/db/schema.ts` 新增 Better Auth 的 `rateLimit` 表：`id`（text，主鍵）、`key`（text，唯一）、`count`（integer）、`lastRequest`（bigint，毫秒）。欄位名與型別以 Better Auth 1.7.27 的 `get-tables` 定義為準，並傳給 `drizzleAdapter` 的 `schema`。
- `npm run db:generate` 產生 `drizzle/0003_*.sql`。部署時由 build 指令的 `db:migrate` 套用。

### 5.3 登入頁（`app/(auth)/login/`）

```
             任務排程器
        [ 登入 ]   [ 註冊 ]          ← 分頁，預設「登入」
  名稱      [                    ]   ← 只在「註冊」
  Email     [                    ]
  密碼      [                    ]
  確認密碼  [                    ]   ← 只在「註冊」
           [      登入／註冊      ]
  ───────────── 或 ─────────────      ← 至少一個 OAuth 有設定才顯示
  [ 使用 GitHub 登入 ] [ 使用 Google 登入 ]
```

- `page.tsx` 把 `getEnabledSocialProviders(process.env)` 的結果傳給 `LoginForm`，取代現在的 `showEmailForm`。
- 輸入欄位：email 用 `type="email"`、`autocomplete="email"`；密碼欄位 `autocomplete` 在登入是 `current-password`、註冊是 `new-password`；名稱 `autocomplete="name"`。
- 送出前在瀏覽器先檢查：名稱去頭尾空白後 1–60 字、密碼 8–128 字、兩次密碼相同。伺服器仍以 Better Auth 為準。
- 成功後導向 `callbackURL`（沿用現在 `?next=` 的安全處理）。
- 送出中按鈕停用；中文輸入法組字中的 Enter 不送出（沿用 `isImeEnter`）。
- 錯誤訊息（顯示在表單下方，`role="alert"`）：

| Better Auth 回應 | 顯示 |
|------|------|
| `INVALID_EMAIL_OR_PASSWORD` | email 或密碼錯誤 |
| `USER_ALREADY_EXISTS`、`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` | 這個 email 已經註冊過，請直接登入（如果當初是用 GitHub 或 Google，請按下方按鈕） |
| `PASSWORD_TOO_SHORT`、`PASSWORD_TOO_LONG` | 密碼需為 8 到 128 個字元 |
| `INVALID_EMAIL` | email 格式不正確 |
| HTTP 429 | 嘗試太多次，請 N 秒後再試（N 取自 `X-Retry-After`，沒有就說「稍後再試」） |
| 其他 | 登入失敗，請再試一次。 |

- 原本的 `account_not_linked` 訊息保留，文字改為涵蓋密碼帳號：「這個 email 已經用另一種方式註冊過，且尚未驗證，因此無法自動合併。請改用當初的方式登入。」

### 5.4 E2E

- `e2e/global-setup.ts` 改走一般註冊（`/api/auth/sign-up/email`），不再需要 `E2E_AUTH=1`；`playwright.config.ts` 拿掉這個變數。
- `e2e/main-flow.spec.ts` 的開頭加一段：從登入頁切到「註冊」、填表、註冊後進到今日焦點（驗證畫面流程，不只 API）。

### 5.5 文件

- `README.md`：功能列表與「登入與帳號連結」加入密碼登入、沒有忘記密碼、嘗試次數限制；環境變數表移除 `E2E_AUTH`，GitHub／Google 變數改為「選填，沒設就不顯示按鈕」；資安段落改寫「測試用的密碼登入」那條。
- `.env.example`：OAuth 變數標為選填，移除 `E2E_AUTH`。
- 被改動檔案的檔頭註解（`auth.ts`、`login/page.tsx`、`LoginForm.tsx`、`global-setup.ts`）。
- 前一份設計文件頂端加一行：`> ⚠ 已被 2026-11-24-email-password-login-design.md 推翻：§8「只提供 GitHub 與 Google 登入」不再成立（2026-11-24）`，內文不改。

## 6. 驗收

- 單元／API 測試（Vitest + PGlite）：
  - 註冊成功會建立使用者、預設看板，並回傳 session。
  - 同 email 再註冊得到 `USER_ALREADY_EXISTS*`；錯誤密碼與不存在的 email 得到**相同的** `INVALID_EMAIL_OR_PASSWORD`。
  - 7 字元與 129 字元密碼被拒。
  - 開啟嘗試次數限制時，第 6 次 `/sign-in/email` 得到 429，且計數寫在 `rateLimit` 表。
  - 密碼帳號（未驗證）之後用同 email 的 OAuth 登入不會被合併。
  - `getEnabledSocialProviders`：兩個都設、只設一個、都沒設、只設了 id 沒設 secret。
  - 登入頁元件：分頁切換、欄位驗證、上表每一種錯誤的文字、沒設 OAuth 時不出現「或」與按鈕。
- `npx tsc --noEmit`、`npm run lint`、`npm run build` 通過。
- 部署到 Preview（非正式資料庫）後，用瀏覽器實際註冊、登出、再登入一次。

## 7. 留給實作者決定

- 分頁用 AntD `Segmented` 還是兩個按鈕，樣式跟現有登入卡片一致即可。
- 錯誤代碼對應表放在 `LoginForm` 內或獨立小模組。
- 嘗試次數限制在 Vercel 上取得 IP 的方式：Better Auth 預設讀 `x-forwarded-for`（Vercel 會用真實的用戶端 IP 覆寫這個標頭，外部偽造的值不會被轉送）。**讀不到 IP 時 Better Auth 不會略過限制，而是讓所有人共用同一個計數**，等於任何人都能把登入鎖住，所以部署到 Preview 後要確認 log 沒有出現 `Rate limiting could not determine a client IP`；若出現，在 `advanced.ipAddress.ipAddressHeaders` 指定 `x-vercel-forwarded-for` 等 Vercel 提供的標頭，並在實作報告中說明。
