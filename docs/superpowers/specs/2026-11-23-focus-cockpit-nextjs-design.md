> ⚠ 已被 2026-11-24-email-password-login-design.md 推翻：§8「只提供 GitHub 與 Google 登入」不再成立（2026-11-24）

# Task Scheduler v2 — Focus Cockpit × Next.js 設計文件

- 日期：2026-11-23
- 狀態：草稿，待確認
- 分支：`feat/focus-cockpit-redesign`
- 視覺設計：Claude Design 畫布「Task Scheduler — Focus Cockpit」<https://claude.ai/artifact/WQvyyFfZGsnpXMBKsJ6GTy>（私人連結）

> 本文件標「**我的決定**」的地方是實作者（Claude）代為決定，使用者可推翻；其餘是與使用者確認過的。

---

## 1. 為什麼要做

現在的 Task Scheduler 是一個純前端的 Vite SPA（React 19 + AntD 5 + Redux Toolkit），資料全存在瀏覽器 localStorage。兩個問題：

1. **畫面在跟內容搶空間。** 第一屏上半部是標題列、看板分頁、7 顆工具列按鈕、4 張統計卡、進度條、搜尋篩選列，任務卡片被擠到下面。卡片本身也很吵：狀態標籤和所在欄位重複、三顆按鈕常駐、沒有層次。沒有任何畫面回答「我現在該做什麼」。
2. **資料只活在一個瀏覽器裡。** 換電腦、清快取就沒了；也沒辦法讓其他程式透過 API 讀寫。

使用者的決定：
- UI 方向走「**Focus Cockpit**」：保留看板，但重排資訊架構，新增「今日焦點」、⌘K 指令面板、右側詳情欄、精簡卡片。
- 框架**換成 Next.js**，**API 放在同一個 repo**。
- **要登入，每個人資料分開。**
- 資料庫用 **Postgres（Neon）+ Drizzle**。
- 遷移方式走 **A：直接用新設計蓋 Next.js 版**，不先搬舊 UI。

## 2. 目標、非目標、反目標

**目標**
- 打開就知道今天要處理什麼（今日焦點）；看板第一屏就看得到任務。
- 所有操作（新增、編輯、拖曳、刪除）感覺是即時的——API 延遲不能讓拖曳卡頓。
- 每個使用者登入後只看得到自己的看板與任務。
- 有一組乾淨、驗證過輸入的 REST API，未來別的呼叫端（手機 App、腳本）能用。
- 舊使用者瀏覽器裡的 localStorage 資料可以一鍵帶進新版。

**非目標（這次不做）**
- 看板多人共用、成員與權限、即時協作同步。
- 伺服器端推播通知（到期提醒仍是分頁開著時由瀏覽器檢查）。
- 原生手機 App；離線模式。
- 每位使用者超過約 2,000 筆任務的效能（見 §6.3 的「全量載入」決定）。
- 國際化：介面維持繁體中文。

**反目標（做到了也算失敗）**
- 拖曳或勾選子任務要等伺服器回應才動。
- 任何 API 能讀寫到別人的資料（包含用猜的 id）。
- 匯入檔案會清掉「其他」看板（目前的 bug）。
- 一打開頁面就跳通知權限詢問（目前的 bug）。
- 復原（⌘Z）在 API 版本變成「把整包舊資料送回伺服器」。

## 3. 限制

- 部署在 **Vercel**（目前 `vercel.json` 寫死 Vite / `dist`，要改）。
- `.github/workflows/` 只做自動開 PR，不跑 build，不受影響。
- OAuth App（GitHub、Google）與 Neon 資料庫要由**使用者本人建立**，實作者只能提供 `.env.example` 與步驟說明。
- 使用者的全域規則：改行為就同步改活文件（README、`.env.example`、檔頭註解）；`git commit` 只在使用者要求時做。

## 4. 考慮過的做法

| | 做法 | 取捨 | 結果 |
|---|---|---|---|
| **A** | 新開 Next.js App Router 專案，UI 直接照畫布做；API 用 Route Handlers；前端 RTK Query | 一次改動大；但舊 UI 本來就要全部重做，不浪費 | **選用** |
| B | 先把舊 UI 原樣搬到 Next.js，再改版 | 每步好驗證；但舊元件搬完就丟，多約 1/3 工 | 不選 |
| C | 不用 Route Handlers，改用 Server Actions | 程式最少；但沒有可被外部呼叫的 API 網址，違背「API 放同一個 repo」的用意 | 不選 |

## 5. 技術選型

版本號是 2026-11-23 `npm view` 查到的 `latest`，動工時再以當下為準。

| 項目 | 選擇 | 備註 |
|---|---|---|
| 框架 | Next.js 16（App Router）、React 19 | |
| 語言 | TypeScript strict | |
| DB | Neon Postgres，驅動 `@neondatabase/serverless` | |
| ORM / migration | `drizzle-orm` 0.45 + `drizzle-kit` 0.31 | 1.0 還在 RC，不用 |
| 登入 | **Better Auth 1.7**（GitHub + Google OAuth，Drizzle adapter） | **我的決定**：先前口頭說 Auth.js，但 Auth.js v5（`next-auth@5`）至今仍是 beta.32；Better Auth 是穩定版、原生支援 Drizzle 與 Next 16。 |
| 輸入驗證 | `zod` 4 | API 與前端表單共用 schema |
| 前端資料 | Redux Toolkit 2 + **RTK Query** | 沿用現有 Redux 知識 |
| UI 元件 | **Ant Design 6** + `@ant-design/nextjs-registry` | **我的決定**：重寫的專案直接上 v6，不留 v5 的遷移債。只用 Drawer、DatePicker、Select、message、Modal；其餘照畫布自刻。 |
| 拖曳 | `@hello-pangea/dnd` 18 | 已支援 React 19 |
| 樣式 | SCSS modules + CSS custom properties（tokens） | 取代現在 SCSS 變數雙份維護 |
| 字體 | `next/font`：Inter + Noto Sans TC | |
| 測試 | Vitest 5（單元與 API，DB 用 PGlite）、Playwright（E2E 冒煙） | |

## 6. 架構

### 6.1 目錄

```
app/
  (auth)/login/page.tsx          登入頁（GitHub / Google 按鈕）
  (app)/layout.tsx               伺服器端檢查登入；無 session → /login。渲染 AppShell
  (app)/focus/page.tsx           今日焦點
  (app)/b/[boardId]/page.tsx     看板
  (app)/page.tsx                 redirect → /focus
  api/auth/[...all]/route.ts     Better Auth handler
  api/boards/…, api/tasks/…      REST（見 §7）
  layout.tsx                     字體、主題 cookie、AntD registry、Redux Provider
src/
  server/db/schema.ts            Drizzle schema
  server/db/index.ts             連線
  server/auth.ts                 Better Auth 設定、requireUser()
  server/services/*.ts           商業邏輯（boards、tasks、import），route handler 只做 parse/回應
  lib/validation.ts              zod schemas（前後端共用）
  lib/taskQueries.ts             純函式：篩選、排序、到期分組、isBlocked、isOverdue
  lib/quickAddParser.ts          純函式：智慧快速新增
  client/store/                  Redux store、uiSlice、undoSlice
  client/api.ts                  RTK Query api slice
  components/…                   AppShell、Sidebar、TopBar、StatsStrip、TaskCard、TaskColumn、
                                 TaskDetailPanel、CommandPalette、FocusList、UndoToast …
  styles/tokens.scss
drizzle/                         migration 檔
```

刪除：`index.html`、`vite.config.ts`、`tsconfig.app.json`、`tsconfig.node.json`、舊 `src/`（App.tsx、pages、components、store、hooks、styles）。`vercel.json` 改成 Next.js（或刪掉讓 Vercel 自動偵測）。

### 6.2 資料模型（Drizzle / Postgres）

Better Auth 自己管理 `user`、`session`、`account`、`verification` 四張表（用它的 CLI 產生 schema 併入 `schema.ts`）。應用資料：

**boards**
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid PK default random | |
| user_id | text FK → user.id, on delete cascade | 擁有者 |
| name | text not null | 1–60 字 |
| position | double precision | 側欄排序 |
| created_at / updated_at | timestamptz | |

**tasks**
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid PK | 前端可自帶（樂觀新增用），伺服器驗證格式與唯一性 |
| user_id | text FK → user.id cascade | 冗餘存一份，所有查詢都能直接 `where user_id = ?` |
| board_id | uuid FK → boards.id cascade | |
| title | text not null | 1–200 字 |
| description | text | ≤ 5,000 字 |
| status | enum `todo` / `in_progress` / `done` | API 對外用 `in-progress`，與舊資料一致 |
| priority | smallint 0–3 | 0 緊急、1 高、2 中、3 低 |
| due_date | date null | **我的決定**：只存日期，不存時刻。舊資料的毫秒時間戳轉成使用者時區的日期。 |
| position | double precision | 欄內排序；插入兩張卡中間取中點；間距過小時整欄重排 |
| tags | text[] default '{}' | |
| subtasks | jsonb default '[]' | `[{id, title, done}]`，最多 50 筆；不單獨查詢，所以不拆表 |
| depends_on | uuid[] default '{}' | 前置任務；寫入時驗證同看板、同擁有者、無循環 |
| completed_at | timestamptz null | 狀態變 done 時伺服器寫入，離開 done 時清空 |
| deleted_at | timestamptz null | **軟刪除**，讓「刪除 → 復原」只是一個 PATCH |
| created_at / updated_at | timestamptz | |

索引：`(user_id, deleted_at)`、`(board_id, status, position)`。

被軟刪除或不存在的前置任務視為「不阻擋」。軟刪除資料保留 30 天，清理排程不在這次範圍（非目標）。

### 6.3 資料流

- **全量載入**（**我的決定**）：進入 App 時 `GET /api/tasks` 一次拿回使用者所有看板的未刪除任務，加上 `GET /api/boards`。看板、今日焦點、⌘K 搜尋都從同一份快取用 `lib/taskQueries.ts` 算出來，切換看板和搜尋都不用再打 API。代價是使用者任務量大時會變慢，上限約 2,000 筆（非目標），之後再分頁。
- **RTK Query**：`Board`、`Task` 兩種 tag。所有寫入都用 `onQueryStarted` 做**樂觀更新**：先改快取 → 送請求 → 失敗就 `patchResult.undo()` 並顯示錯誤提示。
- **伺服器端渲染**：`(app)/layout.tsx` 只做登入檢查和主題；任務資料由客戶端抓，首次載入顯示骨架畫面。（之後若要 SSR 預取，可在 layout 先查好塞進 store，這次不做。）
- **URL 即狀態**：目前看板 = `/b/[boardId]`，今日焦點 = `/focus`，詳情欄 = `?task=<id>`（可分享、重新整理不會掉）。篩選、排序、指令面板開關、批次選取放 `uiSlice`，不進 URL。
- **主題**：存 cookie `theme=light|dark|system`，伺服器端直接在 `<html data-theme>` 輸出，避免閃爍。

### 6.4 復原／重做

不再存整包快照。`undoSlice` 保存最近 30 個「指令」：

```ts
type Command = { label: string; undo: () => Promise<void>; redo: () => Promise<void> }
```

| 動作 | undo | redo |
|---|---|---|
| 新增任務 | 軟刪除 | 還原 |
| 刪除任務 / 批次刪除 | `PATCH deleted_at=null` | 再軟刪除 |
| 改狀態 / 移動 / 重排 | PATCH 回舊的 status + position | PATCH 新值 |
| 編輯欄位（標題、優先級…） | PATCH 回舊值 | PATCH 新值 |
| 匯入看板 | 還原被替換的舊任務、軟刪除匯入的任務 | 反之 |

- 標題、描述這種連續輸入：停止輸入 600ms 或離開欄位才送出並記一筆指令，不是每個字一筆。
- undo 本身也走樂觀更新；伺服器回 404（例如已在別的裝置刪掉）就提示「無法復原」並丟掉這筆。
- 堆疊只存在當前分頁記憶體中，重新整理就清空。
- 底部提示列（toast）的「復原」按鈕呼叫的就是堆疊最上面那筆。

## 7. API

全部是 JSON。每個 handler 第一行 `const user = await requireUser()`；沒登入回 `401`。所有查詢都帶 `user_id = user.id`，**不屬於你的資源一律回 `404`**（不回 403，避免洩漏存在與否）。輸入用 zod 驗證，失敗回 `400`。錯誤格式：`{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details"?: … } }`。

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/boards` | 自己的看板列表（含各看板未完成數） |
| POST | `/api/boards` | `{name}` |
| PATCH | `/api/boards/:id` | `{name?, position?}` |
| DELETE | `/api/boards/:id` | 硬刪除看板與其任務；不可刪最後一個看板（`409`） |
| GET | `/api/tasks` | 所有看板的未刪除任務；可選 `?boardId=` |
| POST | `/api/tasks` | `{id?, boardId, title, …}`；`position` 不給就放欄位最上方 |
| PATCH | `/api/tasks/:id` | 任意欄位子集，含 `status`、`position`、`subtasks`、`deletedAt: null`（還原） |
| DELETE | `/api/tasks/:id` | 軟刪除 |
| POST | `/api/tasks/batch` | `{ids, op: "move" \| "delete" \| "restore", status?}`，單一交易 |
| GET | `/api/boards/:id/export` | 下載該看板 JSON（`Content-Disposition`） |
| POST | `/api/boards/:id/import` | 以檔案內容**只取代這個看板**的任務：舊任務軟刪除，新任務一律改寫 `board_id`／`user_id`、重新產生 id；回傳被替換的 id 供復原 |
| POST | `/api/import/local` | 舊版 localStorage 搬家：`{boards, tasks}` → 建立看板與任務，id 全部重新產生，`dependsOn` 依新 id 對應 |

業務規則全在 `src/server/services/`：狀態轉 `done` 寫 `completed_at`；`depends_on` 驗證；`position` 計算。

**被擋住的任務**（**我的決定**）：「被擋住」＝ 狀態是 `todo` 且至少一個前置任務未完成。被擋住的任務**不能離開 `todo`**——不論改成 `in-progress` 或 `done`，不論經由單筆 PATCH、拖曳、詳情欄狀態按鈕或批次移動。
- 單筆 PATCH：回 `409 { code: "TASK_BLOCKED", details: { blockedBy: [id…] } }`。
- 批次移動：**不整批失敗**；略過被擋住的任務，其餘照做，回 `200 { updated: [id…], skipped: [{ id, reason: "TASK_BLOCKED" }] }`。UI 提示「已移動 N 筆，M 筆因等待前置任務而略過」。
- 前端：拖曳到其他欄會彈回並提示原因；詳情欄的「進行中／已完成」按鈕停用並以 tooltip 說明；卡片不顯示「→」按鈕。
- 已經在 `in-progress` 的任務事後被加上未完成的前置任務：不強制退回，只顯示「等待前置任務」標記。

**匯出／匯入格式**（**我的決定**）：
- 匯出（v2）：`{ "format": "task-scheduler", "version": 2, "exportedAt": ISO, "board": { "name" }, "tasks": [ { id, title, description, status, priority, dueDate: "YYYY-MM-DD" | null, tags, subtasks, dependsOn, createdAt: ISO, completedAt: ISO | null, position } ] }`。
- 匯入同時接受 **v2** 與**舊版**（目前 Vite 版匯出的純陣列：毫秒時間戳、字串 id、可能含多個 `boardId`）。舊版的所有任務都放進目標看板，忽略原 `boardId`；毫秒時間戳依使用者時區轉日期。
- 兩種格式都會：重新產生 id；檔案內的 `dependsOn` 依新 id 對應，對不到的丟掉；`priority` 超出 0–3、`status` 不合法的筆數在回應 `warnings` 中列出並套預設值（2 / `todo`）；超過 2,000 筆或檔案 > 2 MB 回 `413`。
- 驗證邏輯與 `/api/import/local` 共用同一個舊版轉換函式。

## 8. 登入

- Better Auth，GitHub 與 Google 兩個 OAuth provider；session 用 HttpOnly cookie。
- **同一個人用 GitHub 和 Google 登入**（**我的決定，請確認**）：若兩邊回報的 email 相同且都已驗證，視為**同一個使用者**（Better Auth account linking，`trustedProviders: ["github", "google"]`）。理由：分成兩個帳號時，第二次登入會看到空帳號，像是資料不見；GitHub 與 Google 都只回傳已驗證的 email，自動連結的風險低。email 未驗證時不連結、建立新使用者。
- 路由保護：`(app)/layout.tsx` 在伺服器端查 session，沒有就 `redirect('/login')`；API 由 `requireUser()` 保護。
- **第一次登入**：自動建立一個空的「我的看板」。若瀏覽器 localStorage 有 `taskSchedulerTasks_v3` 或 `taskSchedulerBoards`，在看板頂端顯示提示「發現這台裝置上的舊資料（N 個看板、M 筆任務）— 匯入 / 略過」。匯入成功或略過後，在 localStorage 寫 `taskSchedulerMigrated=1` 不再詢問（舊資料本身不刪）。
- 空看板的 empty state 提供「載入範例任務」按鈕（用現在 `mockTasks` 的內容），方便第一次體驗。
- 登出放在側欄底部使用者頭像選單。
- E2E 測試登入：只在 `NODE_ENV !== 'production'` 且 `E2E_AUTH=1` 時啟用 Better Auth 的 email/password provider 供 Playwright 使用；正式環境絕不啟用。

需要的環境變數（寫進 `.env.example`）：`DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`。

## 9. UI 規格

畫布是視覺參考；**本節是規格**，兩者衝突時以本節為準。本節已寫入建置所需的全部數值，看不到畫布也能照做。

**版面**：左側欄 232px（Logo、⌘K 搜尋鈕、今日焦點＋待辦數徽章、看板清單＋未完成數、新增看板、底部：主題切換、匯入／匯出、到期提醒、快捷鍵說明、使用者選單）＋ 主內容 ＋ 可開關的右側詳情欄（約 360px，非遮罩式，看板保持可見）。

**看板頁**
- 頂列：看板名稱、`N 項任務 · M 項進行中`；右側 篩選／排序／選取（批次）／復原／重做／新增任務（N）。
- 統計列：完成率圓環＋晶片「逾期 / 今天到期 / 緊急 / 等待前置」；晶片即篩選器，可清除。
- 三欄：每欄頂部快速新增輸入框（解析器即時預覽晶片，Enter 新增）、卡片清單、空狀態。
- 卡片：優先級圓點（緊急／高另有文字標籤）、「→ 下一狀態」按鈕（被擋住的 todo 不顯示）、標題、一行 meta（相對到期日、子任務迷你進度、等待前置、完成日、標籤）。點標題開詳情欄。被選中的卡片有強調外框。
- 拖曳：欄內重排、跨欄換狀態；被擋住的 todo 拖到「進行中」會彈回並提示原因。
- 批次模式：卡片左側出現勾選框，頂列換成「已選 N 筆：移至… / 刪除 / 取消」。

**今日焦點**：日期、「今天有 N 件事需要你」、跨看板分組（已逾期 / 今天到期 / 接下來 7 天 / 等待前置任務），每列：完成圈、標題、優先級、進行中標記、看板名、相對到期日；右欄「建議先處理」（逾期中優先級最高者，否則今天到期中優先級最高者）、各看板進度、過去 7 天完成數。

**詳情欄**：狀態分段按鈕、刪除、關閉；可直接編輯的標題與描述；優先級、截止日（DatePicker）、標籤、前置任務（多選，只列同看板）、子任務（勾選、新增、刪除、拖曳排序可延後）、建立時間。新增任務也用同一個面板。

**⌘K 指令面板**：搜尋所有看板的任務（標題＋標籤）與動作：新增任務、前往今日焦點、切換看板、切換主題、匯出／匯入目前看板、開啟到期提醒、復原。↑↓ 選擇、Enter 執行、Esc 關閉；沒有結果時 Enter 直接以輸入文字建立新任務。

**刪除**：不跳確認框，刪除後底部提示「已刪除「…」· 復原」約 6 秒。刪除**看板**仍要確認。

**智慧快速新增**（`lib/quickAddParser.ts`）：
- `!緊急 !高 !中 !低` 或 `!0`–`!3`（全形 `！` 也可）→ 優先級
- `#標籤`（全形 `＃` 也可），可多個 → 標籤
- `今天 明天 後天`、`下週一`…`下週日`（下週＝下一個週一開始的那週）、`M/D`（今年；若已過去則明年）→ 截止日
- 其餘文字去頭尾空白、合併空白後為標題；標題為空則不建立。
- 「今天」以使用者瀏覽器時區計算。

**鍵盤**：`⌘K`/`Ctrl+K` 指令面板、`N` 新增、`/` 聚焦搜尋、`Esc` 關閉詳情／面板、`1`–`9` 切換看板、`G` 然後 `F` 前往今日焦點、`⌘Z` 復原、`⌘⇧Z`/`Ctrl+Y` 重做、`?` 快捷鍵說明。輸入框中不觸發單鍵快捷鍵。

**手機（< 768px）**：側欄變抽屜；看板三欄改成頂部狀態分段控制一次看一欄；詳情欄改底部 sheet；右下角浮動新增按鈕；觸控目標 ≥ 44px。

**視覺 tokens**（完整值，畫布打不開也能照做；定義在 `styles/tokens.scss` 的 `:root` 與 `[data-theme=dark]`，並同步給 AntD `ConfigProvider`）：

| token | 淺色 | 深色 | 用途 |
|---|---|---|---|
| bg | `#f7f7f5` | `#141413` | 頁面底 |
| side | `#f1f0ec` | `#1a1a18` | 側欄 |
| surface | `#ffffff` | `#21211f` | 卡片、面板 |
| surface-2 | `#f3f2ee` | `#2a2a27` | 輸入框底、分段控制底、標籤底 |
| column | `#eeede8` | `#1a1a18` | 看板欄底 |
| border | `#e3e1db` | `#363531` | 一般邊框 |
| border-soft | `#eeece7` | `#2c2b28` | 列表分隔線 |
| border-strong | `#cfccc4` | `#4a4944` | 虛線框（快速新增、空狀態） |
| text | `#1c1b18` | `#ecebe6` | 主要文字 |
| text-2 | `#4f4d47` | `#c3c1b9` | 次要文字 |
| text-3 | `#6b6963` | `#9d9b93` | meta、標籤說明 |
| accent | `#4f46e5` | `#818cf8` | 主按鈕、選取、進度 |
| accent-soft | `#eef0ff` | `rgba(129,140,248,.16)` | 選取底色 |
| accent-text | `#4338ca` | `#a5b4fc` | accent-soft 上的文字 |
| on-accent | `#ffffff` | `#141413` | accent 上的文字 |
| danger / danger-soft | `#b91c1c` / `#fdecec` | `#fca5a5` / `rgba(239,68,68,.16)` | 逾期、緊急標籤 |
| warn / warn-soft | `#c2410c` / `#fff1e7` | `#fdba74` / `rgba(249,115,22,.16)` | 今天到期、高優先、等待前置 |
| ok | `#15803d` | `#86efac` | 完成、完成率 |
| toast bg / fg / action | `#1c1b18` / `#f7f7f5` / `#a5b4fc` | `#ecebe6` / `#141413` / `#4338ca` | 底部提示列 |
| overlay | `rgba(20,20,19,.38)` | `rgba(0,0,0,.55)` | 指令面板、手機 sheet 背景 |

- 優先級圓點（兩種主題相同）：緊急 `#dc2626`、高 `#ea580c`、中 `#0d9488`、低 `#a8a29e`。文字標籤只給緊急（danger / danger-soft）與高（warn / warn-soft）；中、低只有圓點。
- 欄位色點：待處理 text-3、進行中 accent、已完成 ok。
- 字級：26/650（焦點標題）、22/650（頁面標題）、16（面板內大字）、14.5/550（卡片標題）、14（內文）、13（按鈕、次要）、12（meta）。字體 Inter + Noto Sans TC。
- 圓角：卡片 12、欄 14、按鈕 9、晶片 999、面板內輸入 10。間距以 4 為基數（卡片內距 11×12、欄內距 12、欄間距 14、主內容內距 24×28）。
- 按鈕高度：桌面 34（工具列）／28（晶片、分段）／26（卡片「→」）；手機 ≥ 44。
- 卡片狀態：一般（border + 極淡陰影）；**已開啟詳情**（border＝accent，外圈 3px accent-soft）；**逾期**（到期文字 danger、粗體）；**今天到期**（到期文字 warn、粗體）；**等待前置**（鎖頭＋「等待 N 個前置任務」warn 色，無「→」按鈕）；**批次選取中**（左側勾選框，選中時 border＝accent）；**拖曳中**（旋轉 2°、陰影 `0 16px 32px rgba(28,27,24,.18)`）；**已完成**（標題 text-3 加刪除線，meta 只顯示「完成於 M月D日」）。
- 空狀態：欄位虛線框置中文字「這一欄目前是空的」／有篩選時「沒有符合篩選的任務」；焦點分組各有一句（見畫布）：「沒有逾期的任務，做得好。」「今天沒有到期的任務。」「這週很清爽。」「沒有被卡住的任務。」
- 骨架畫面：欄位底色＋三張 surface-2 色塊卡片，無動畫或極輕微脈動（細節留給實作者）。
- 所有文字對比 ≥ 4.5:1（上表組合已符合）。不使用卡片左側色條、不用漸層、不用 emoji 當圖示（用線條 SVG 圖示）。

**通知**：預設關閉。使用者在側欄或指令面板按「開啟到期提醒」才請求權限；之後分頁開著時每 10 分鐘檢查一次（逾期、24 小時內到期），同一任務只通知一次。

## 10. 測試與驗收

- **單元（Vitest）**：`quickAddParser`（每種語法、混合、全形、空標題、跨年 M/D）、`taskQueries`（篩選、分組、isBlocked、排序）、position 中點計算與重排。
- **API（Vitest + PGlite）**：每個端點的正常路徑、`401`、存取別人資源得 `404`、zod 驗證失敗 `400`、前置任務循環 `409`、被擋住的任務不能改成 `in-progress` 也不能改成 `done`、批次移動略過被擋住的任務並回報 `skipped`、**匯入只影響目標看板**、匯入舊版陣列格式與 v2 格式、匯入時 `dependsOn` 重新對應、軟刪除與還原、`/api/import/local` 的 id 對應。
- **E2E（Playwright，E2E_AUTH 登入）**：登入 → 快速新增 `修 bug !高 #前端 明天` → 拖到進行中 → 詳情欄改優先級 → 刪除再復原 → ⌘K 跳到另一個看板的任務 → 今日焦點分組正確 → 重新整理後資料仍在。
- `npm run build`、`npm run lint`、`tsc --noEmit` 全過。
- 手動：深色模式、375px 手機寬度、頁面載入時不跳通知權限。

## 11. 文件同步（同一個 PR）

- `README.md` 改寫：新功能清單、本機開發步驟（建 Neon 資料庫、建 OAuth App、`.env.local`、`npm run db:migrate`、`npm run dev`）、快捷鍵與快速新增語法、技術棧、部署到 Vercel 的環境變數。
- 新增 `.env.example`。
- 換掉 `src/assets/Screenshot-task-scheduler.png` 為新版截圖。
- `package.json` scripts：`dev`、`build`、`start`、`lint`、`test`、`test:e2e`、`db:generate`、`db:migrate`、`db:studio`。
- 新檔案的檔頭註解描述行為。

## 12. 部署與上線

- Vercel 專案框架改為 Next.js；環境變數照 §8。
- Migration：`drizzle-kit migrate` 在 Vercel build 前執行（`build` script 先跑 migrate），或手動執行——**留給實作者**依 Neon 連線方式決定，但必須寫進 README。
- 上線後舊 demo 網址的訪客必須登入；他們瀏覽器裡的舊資料會在登入後被偵測並提示匯入（§8）。

## 13. 留給實作者決定

- 元件內部拆分、檔名、SCSS 組織方式。
- RTK Query endpoint 命名與快取細節。
- position 重排的閾值。
- 骨架畫面的樣子。
- Playwright 是否在 CI 跑（目前 CI 不跑 build，可先只在本機跑）。
- 子任務拖曳排序可延後。
