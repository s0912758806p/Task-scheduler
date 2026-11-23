# 任務排程器 Task Scheduler

個人用的看板式任務管理：登入後資料存在雲端資料庫，每台裝置同步。以「今日焦點」把所有看板中該做的事排在一起，用快速新增語法與 ⌘K 指令面板，不離開鍵盤就能新增、跳轉、操作任務。

![任務排程器截圖：看板頁，含統計列、三欄看板與右側詳情欄](./docs/screenshot.png)

[線上版](https://task-scheduler-rouge-gr925.vercel.app/)（需用 GitHub 或 Google 登入）

## 功能

- **今日焦點**：跨看板彙整「已逾期 / 今天到期 / 接下來 7 天 / 等待前置任務」，並建議先處理哪一件、各看板進度與過去 7 天完成數。
- **看板**：多個看板；待處理／進行中／已完成三欄，可拖曳排序與換欄；統計列（完成率、逾期、今天到期、緊急、等待前置）的晶片同時是篩選器；另有篩選、排序與全文搜尋。
- **⌘K 指令面板**：搜尋所有看板的任務（標題與標籤）與動作（新增任務、前往今日焦點、切換看板與主題、匯出／匯入、開啟到期提醒、復原）；沒有結果時按 Enter 直接建立新任務。
- **智慧快速新增**：每欄頂端的輸入框即時解析語法並預覽（見下表）。
- **右側詳情欄**：直接編輯標題、描述、優先級、截止日、標籤、前置任務、子任務；不遮住看板。網址帶 `?task=<id>`，可直接分享或重新整理後回到同一筆。
- **刪除即復原**：刪除不跳確認框，底部提示列約 6 秒內可按「復原」；所有變更皆可 `⌘Z` 復原、`⌘⇧Z` 重做。刪除看板仍會先確認。
- **批次操作**：選取多筆任務後一次移動狀態或刪除（被前置任務擋住的任務會被略過並回報）。
- **前置任務**：有未完成前置任務的待處理任務會顯示「等待前置任務」，在前置任務完成前不能開始。
- **匯入／匯出**：匯出目前看板為 JSON；匯入**只會取代目前看板**的任務，其他看板不受影響，且可用 `⌘Z` 復原。也能匯入舊版（Vite 版）匯出的檔案。
- **舊資料搬家**：第一次登入時，若這台瀏覽器還留有舊版存在 localStorage 的資料，頁面頂端會提示「匯入 / 略過」；舊資料本身不會被刪除。
- **到期提醒（需手動開啟）**：預設關閉，也不會一開頁就詢問權限；在側欄或指令面板按「開啟到期提醒」後，分頁開著時每 10 分鐘檢查一次逾期與 24 小時內到期的任務，同一筆只通知一次。
- **深色模式**：淺色／深色／跟隨系統。
- **手機版**（< 768px）：側欄變抽屜、看板一次顯示一欄、詳情欄改為底部面板、右下角浮動新增按鈕。

### 快速新增語法

| 寫法 | 效果 | 範例 |
|------|------|------|
| `!緊急` `!高` `!中` `!低`，或 `!0`–`!3`（全形 `！` 也可） | 優先級（0 緊急、1 高、2 中、3 低；預設中） | `!高` |
| `#標籤`（全形 `＃` 也可），可多個 | 標籤 | `#前端 #bug` |
| `今天` `明天` `後天` | 截止日 | `明天` |
| `下週一` … `下週日` | 下一個週一開始的那週的該天 | `下週五` |
| `M/D` | 截止日（今年；已過去則明年；不存在的日期如 `2/30` 視為標題文字） | `12/25` |
| 其餘文字 | 標題（去除頭尾與重複空白） | |

例如 `修 bug !高 #前端 明天` 會建立標題「修 bug」、優先級「高」、標籤「前端」、明天到期的任務。`!` 與 `#` 必須在字首或空白之後（`C#` 仍是標題）。「今天」以你的瀏覽器時區計算。

### 快捷鍵

單鍵快捷鍵在輸入框中不會觸發。按 `?` 可隨時開啟說明。

| 按鍵 | 功能 |
|------|------|
| `⌘K` / `Ctrl+K` | 開啟指令面板 |
| `N` | 新增任務 |
| `/` | 聚焦搜尋 |
| `Esc` | 關閉詳情欄或面板 |
| `1`–`9` | 切換到第 N 個看板 |
| `G` 然後 `F` | 前往今日焦點 |
| `⌘Z` | 復原 |
| `⌘⇧Z` / `Ctrl+Y` | 重做 |
| `?` | 快捷鍵說明 |

## 本機開發

需要 Node.js 20.9+ 與 npm。

1. 安裝相依套件：`npm install`
2. 建立資料庫：在 [Neon](https://neon.tech) 建一個 Postgres 專案，複製連線字串（`postgresql://…`）。
3. 建立 GitHub OAuth App（GitHub → Settings → Developer settings → OAuth Apps）：
   - Homepage URL：`http://localhost:3000`
   - Authorization callback URL：`http://localhost:3000/api/auth/callback/github`
4. 建立 Google OAuth 用戶端（Google Cloud Console → API 和服務 → 憑證 → OAuth 用戶端 ID，類型「網頁應用程式」）：
   - 已授權的重新導向 URI：`http://localhost:3000/api/auth/callback/google`
5. 複製環境變數範本並填值：`cp .env.example .env.local`
   - `DATABASE_URL`：第 2 步的連線字串
   - `BETTER_AUTH_SECRET`：`openssl rand -base64 32` 產生
   - `BETTER_AUTH_URL`：`http://localhost:3000`
   - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`、`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`：第 3、4 步取得
6. 建立資料表：`npm run db:migrate`。drizzle-kit 只讀 `.env`、不讀 `.env.local`，請先在 shell 設定 `DATABASE_URL`，例如 `export $(grep '^DATABASE_URL=' .env.local)`。
7. 啟動：`npm run dev`，開啟 `http://localhost:3000`。未登入會被導向 `/login`（已登入再開 `/login` 會直接回到 `?next=` 指的頁面，預設今日焦點）；第一次登入會自動建立「我的看板」。
8. 檢查：`npm test`（Vitest，用 PGlite，不需要資料庫）、`npx tsc --noEmit`、`npm run lint`、`npm run build`。

帳號連結規則見下方「登入與帳號連結」。

## 環境變數

複製 `.env.example` 為 `.env.local` 後填值。正式環境在 Vercel 專案設定中設定同名變數。

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | Neon 的 Postgres 連線字串（本機開發也一樣：資料庫驅動 `@neondatabase/serverless` 走 Neon 的 WebSocket，一般本機 Postgres 連不上；`npm test` 用 PGlite，不需要） |
| `BETTER_AUTH_SECRET` | Better Auth 簽署 session 用的密鑰，以 `openssl rand -base64 32` 產生 |
| `BETTER_AUTH_URL` | 網站的公開網址：本機 `http://localhost:3000`，正式環境為你的網域 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth App |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 用戶端 |
| `E2E_AUTH` | 設為 `1` 時（且 `NODE_ENV` 不是 `production`）啟用 email／密碼登入，僅供 Playwright E2E 使用；正式環境永遠不會啟用，也不要設定 |

## npm scripts

| 指令 | 說明 |
|------|------|
| `npm run dev` | 開發伺服器 |
| `npm run build` | 正式建置 |
| `npm start` | 執行建置後的版本 |
| `npm run lint` | ESLint |
| `npm test` | 單元與 API 測試（Vitest + PGlite，不需要資料庫） |
| `npm run test:e2e` | 端對端測試（Playwright），見下節 |
| `npm run db:generate` | 依 schema 變更產生 migration |
| `npm run db:migrate` | 套用 migration（`DATABASE_URL` 需在 shell 設定） |
| `npm run db:studio` | Drizzle Studio |

## 端對端測試

`e2e/main-flow.spec.ts` 走完主要流程：登入 → 快速新增 → 拖到進行中 → 詳情欄改優先級 → 刪除再復原 → 建第二個看板 → ⌘K 跳到另一個看板的任務 → 今日焦點 → 重新整理後資料仍在 → 全程沒有請求通知權限。

- 需要一個**測試專用**的 Postgres（建議在 Neon 開一個 branch），先套用 migration：`export DATABASE_URL=postgresql://…` 後執行 `npm run db:migrate`。
- 還要有 `BETTER_AUTH_SECRET` 與 `BETTER_AUTH_URL=http://localhost:3000`（GitHub／Google 變數可留空）。Playwright 會自行啟動 `npm run dev` 並帶上 `E2E_AUTH=1`，由 `e2e/global-setup.ts` 註冊一個測試帳號、把登入狀態存到 `e2e/.auth/`（已加入 .gitignore）。
- 首次執行先安裝瀏覽器：`npx playwright install chromium`。
- **沒有設定 `DATABASE_URL` 時整組測試會自動略過**，`npm run test:e2e` 仍以 0 結束。每次執行都會在資料庫留下一個測試帳號，請只用在拋棄式的測試資料庫。

## 部署到 Vercel

1. 把專案匯入 Vercel，Framework 選 Next.js（`vercel.json` 已指定）。
2. 在專案設定加入上節的環境變數（不要設 `E2E_AUTH`）。`BETTER_AUTH_URL` 填正式網域（例如 `https://your-app.vercel.app`）。`DATABASE_URL` **依 Vercel 環境分開設定**：Production 用正式的 Neon 資料庫，Preview 用另一個 Neon branch。因為第 4 步的 build 指令每次建置都會先跑 `db:migrate`，Preview 若共用正式的 `DATABASE_URL`，任何分支的預覽部署都會把尚未合併的 migration 套到正式資料庫。
3. 把 OAuth 的 callback 改成正式網域（或另外再建一組給正式環境）：
   - GitHub：`https://<正式網域>/api/auth/callback/github`
   - Google：`https://<正式網域>/api/auth/callback/google`
4. 部署。`vercel.json` 的 build 指令是 `npm run db:migrate && npm run build`，每次部署（Production 與 Preview 都是）會先對該環境的 `DATABASE_URL` 套用尚未執行的 migration，成功才繼續建置；migration 失敗會讓部署失敗而不會上線。

舊網址的訪客上線後必須登入；他們瀏覽器裡的舊資料會在登入後被偵測，並提示匯入。

## 登入與帳號連結

只提供 GitHub 與 Google 登入。兩邊回報**相同的 email、且都標示為已驗證**時，視為同一個帳號（同一份看板）；否則不會自動合併，這次登入會被拒絕，Better Auth 把使用者帶回登入頁，頁面會顯示「這個 email 已經用另一種方式登入過，且尚未驗證，因此無法自動合併。」。email 在使用者表中唯一，所以不會另建第二個帳號。

## 技術棧

- **框架**：Next.js 16.4.6（App Router）、React 19.3.1、TypeScript 5.9.3
- **UI**：Ant Design 6.7.2（`@ant-design/nextjs-registry`）、SCSS（Sass 1.108.2）、Inter 與 Noto Sans TC
- **狀態與資料**：Redux Toolkit 2.15.0（RTK Query：全量載入、樂觀更新、復原／重做堆疊）
- **拖曳**：@hello-pangea/dnd 18.0.1
- **驗證與輸入檢查**：Better Auth 1.7.27（GitHub／Google OAuth）、zod 4.6.7
- **資料庫**：Postgres（Neon，`@neondatabase/serverless` 1.2.1）、Drizzle ORM 0.45.4 與 drizzle-kit
- **測試**：Vitest 5.1.1（PGlite 作測試資料庫）、Testing Library、Playwright 1.65.1
- **部署**：Vercel

## Contributing

歡迎提交 Pull Request。

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Created by Gorman (2025.03)
