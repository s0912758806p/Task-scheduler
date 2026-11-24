# Task Scheduler v2（Focus Cockpit × Next.js）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Vite + localStorage 的看板工具換成 Next.js 16 全端應用：每人登入、資料存 Neon Postgres、同 repo 的 REST API，前端照 Focus Cockpit 設計重做。

**Architecture:** App Router。`app/api/**` 的 Route Handlers 只做 parse／回應，商業邏輯在 `src/server/services/*`（吃一個 `db` 參數，方便用 PGlite 測）。前端一次載入使用者全部任務進 RTK Query 快取，看板／今日焦點／⌘K 都用 `src/lib/taskQueries.ts` 的純函式從同一份快取算；所有寫入樂觀更新，並把反向操作推進復原堆疊。

**Tech Stack:** Next.js 16.4、React 19.3、TypeScript strict、Drizzle ORM 0.45 + drizzle-kit 0.31、`@neondatabase/serverless` 1.2（Pool，需交易）、Better Auth 1.7、zod 4、Redux Toolkit 2.15（RTK Query）、Ant Design 6 + `@ant-design/nextjs-registry` 1.3、`@hello-pangea/dnd` 18、Sass、Vitest 5 + PGlite 0.5 + Testing Library + jsdom、Playwright 1.65。

**Spec:** [`docs/superpowers/specs/2026-11-23-focus-cockpit-nextjs-design.md`](../specs/2026-11-23-focus-cockpit-nextjs-design.md)（以下簡稱「spec」，§ 指其章節）。執行者兩份都要讀。

## Global Constraints

- 介面文字一律繁體中文，照 spec 原文（空狀態、提示列、按鈕文字）。
- API 對外狀態值：`todo` / `in-progress` / `done`；DB enum 為 `todo` / `in_progress` / `done`，轉換只在 service 層做一次。
- 優先級 0 緊急、1 高、2 中、3 低；新任務預設 2。
- 長度上限：看板名稱 1–60、任務標題 1–200、描述 ≤ 5,000、子任務 ≤ 50 筆、匯入 ≤ 2,000 筆且 ≤ 2 MB（超過回 `413`）。
- 每個 API handler 先 `requireUser()`；未登入 `401`；不屬於你的資源一律 `404`（不回 403）；zod 失敗 `400`；錯誤格式 `{ "error": { "code", "message", "details"? } }`。
- 被擋住＝狀態 `todo` 且至少一個未刪除、未完成的前置任務；被擋住的任務不能離開 `todo`（`409 TASK_BLOCKED`，`details.blockedBy`）。
- 「今天」只在瀏覽器以使用者時區計算；伺服器不計算「今天」。需要把毫秒轉日期時，由前端在請求帶 `timeZone`（IANA 名稱）。
- 日期在前後端一律用 `YYYY-MM-DD` 字串；時間戳用 ISO 字串。
- 視覺 tokens 照 spec §9 表格逐字使用；不用卡片左側色條、漸層、emoji 圖示。
- Next 16：動態路由的 `params` 是 `Promise`，要 `await`。
- 路徑別名 `@/*` → `./src/*`。
- 每個任務結束時 `npm test`、`npx tsc --noEmit`、`npm run lint` 都要過。
- 使用者規則：改行為的同一個 commit 要更新 README／`.env.example`／檔頭註解。
- Commit 訊息結尾加：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **兩個分頁／裝置同時操作**：在 A 刪掉的任務，B 還去改 → API 回 404，B 的樂觀更新要回滾、提示「這筆任務已不存在」並從快取移除，不能卡住或丟例外。→ Task 11 測試。
2. **同一欄反覆拖曳到同一個位置**：position 中點一直對半會耗盡精度 → 間距 < 1e-6 時整欄重排，順序不能亂。→ Task 3、Task 8 測試。
3. **接近午夜與時區**：使用者在 23:30（UTC+8）新增「明天」或匯入舊毫秒時間戳，日期不能差一天。→ Task 3、Task 10 測試。
4. **工作途中 session 過期**：任何 API 回 401 → 導向 `/login?next=<目前路徑>`，不要出現一堆錯誤提示。→ Task 11 測試。
5. **奇怪的輸入**：標題含換行／emoji／前後空白、重複或空白標籤、前置任務指向自己或形成循環 → zod 修剪與去重，自我依賴與循環回 `409 DEPENDENCY_CYCLE`。→ Task 5、Task 8 測試。

---

## 檔案地圖

```
app/
  layout.tsx                      字體、主題 cookie → <html data-theme>、AntdRegistry、Providers
  providers.tsx                   'use client'：Redux Provider、AntD ConfigProvider（tokens）、UndoProvider
  (auth)/login/page.tsx           登入頁
  (app)/layout.tsx                伺服器端 getSessionUser()，無 → redirect('/login')；渲染 <AppShell>
  (app)/page.tsx                  redirect('/focus')
  (app)/focus/page.tsx            <FocusView/>
  (app)/b/[boardId]/page.tsx      <BoardView boardId/>
  api/auth/[...all]/route.ts      Better Auth handler
  api/boards/route.ts             GET, POST
  api/boards/[id]/route.ts        PATCH, DELETE
  api/boards/[id]/export/route.ts GET
  api/boards/[id]/import/route.ts POST
  api/tasks/route.ts              GET, POST
  api/tasks/[id]/route.ts         PATCH, DELETE
  api/tasks/batch/route.ts        POST
  api/import/local/route.ts       POST
src/
  lib/types.ts dates.ts quickAddParser.ts taskQueries.ts position.ts validation.ts legacy.ts sampleTasks.ts
  server/db/schema.ts db/index.ts auth.ts http.ts errors.ts
  server/services/boards.ts tasks.ts importExport.ts
  client/store.ts uiSlice.ts api.ts undo.tsx commands.ts useShortcuts.ts useNotifications.ts
  components/AppShell/ Sidebar/ TopBar/ StatsStrip/ TaskColumn/ TaskCard/ QuickAdd/
             TaskDetailPanel/ FocusView/ BoardView/ CommandPalette/ UndoToast/ LegacyImportBanner/ icons.tsx
  styles/tokens.scss globals.scss
test/helpers/db.ts route.ts       PGlite 測試 DB、route handler 呼叫工具
test/**/*.test.ts(x)              Vitest
e2e/*.spec.ts                     Playwright
drizzle/                          migrations
```

---

## Part A — 平台與 API

### Task 1: 換成 Next.js 骨架

**Files:**
- Delete: `index.html`, `vite.config.ts`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `src/App.tsx`, `src/main.tsx`, `src/vite-env.d.ts`, `src/pages/`, `src/components/`, `src/store/`, `src/hooks/`, `src/styles/`, `src/types/`, `src/assets/react.svg`
- Create: `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `app/layout.tsx`（暫時最小版）, `app/page.tsx`（暫時「建置中」）, `src/lib/types.ts`, `src/lib/sampleTasks.ts`, `.env.example`
- Modify: `package.json`, `.gitignore`（加 `.next/`、`.env*.local`、`playwright-report/`、`test-results/`）, `vercel.json`
- Test: `test/sampleTasks.test.ts`

**Interfaces:**
- Produces（`src/lib/types.ts`）：
  ```ts
  export type TaskStatus = 'todo' | 'in-progress' | 'done';
  export type Priority = 0 | 1 | 2 | 3;
  export interface Subtask { id: string; title: string; done: boolean }
  export interface Task {
    id: string; boardId: string; title: string; description: string | null;
    status: TaskStatus; priority: Priority; dueDate: string | null; position: number;
    tags: string[]; subtasks: Subtask[]; dependsOn: string[];
    completedAt: string | null; createdAt: string; updatedAt: string;
  }
  export interface Board { id: string; name: string; position: number; createdAt: string; openCount: number }
  export interface ApiErrorBody { error: { code: string; message: string; details?: unknown } }
  ```
- Produces（`src/lib/sampleTasks.ts`）：`SAMPLE_TASKS: Array<{ title; description; status; priority; dueInDays: number | null; tags; subtasks: {title; done}[] }>`——內容取自舊 `src/store/taskSlice.ts` 的 `mockTasks` 11 筆，日期改成相對今天的天數（舊的 `Date.now() ± 86400000 * n` → `n`）。

- [ ] **Step 1:** 刪檔前先把 `mockTasks` 轉成 `src/lib/sampleTasks.ts`（相對天數：1→-1、10→0（「安全性稽核」改成今天到期，對應畫布範例）、4→5、9→8、8→12、2→4、6→-2、7→6、3→-3、11→-7、12→-10）。另加 `dependsOnTitles?: string[]`，讓「建立 CI/CD 流程」依賴「撰寫 API 規格文件」，範例資料才看得到「等待前置」狀態。
- [ ] **Step 2:** 刪除上列舊檔，安裝相依：
  ```bash
  npm rm vite @vitejs/plugin-react-swc eslint-plugin-react-hooks eslint-plugin-react-refresh globals typescript-eslint @eslint/js @ant-design/icons
  npm i next@16.4.6 react@19.3.1 react-dom@19.3.1 antd@6.7.2 @ant-design/nextjs-registry@1.3.0 @reduxjs/toolkit@2.15.0 react-redux@9 @hello-pangea/dnd@18.0.1 dayjs zod@4.6.7 sass@1.108.2 drizzle-orm@0.45.4 @neondatabase/serverless@1.2.1 better-auth@1.7.27 ws
  npm i -D typescript@5 @types/react @types/react-dom @types/node @types/ws eslint@9 eslint-config-next@16.4.6 vitest@5.1.1 @vitejs/plugin-react jsdom@31.0.1 @testing-library/react@16.3.3 @testing-library/user-event @electric-sql/pglite@0.5.17 drizzle-kit@0.31.11 @playwright/test@1.65.1
  ```
  `package.json` scripts：`dev` `next dev`、`build` `next build`、`start` `next start`、`lint` `eslint .`、`test` `vitest run`、`test:e2e` `playwright test`、`db:generate` `drizzle-kit generate`、`db:migrate` `drizzle-kit migrate`、`db:studio` `drizzle-kit studio`。`version` 改 `2.0.0`。
- [ ] **Step 3:** `vitest.config.ts`：alias `@` → `src`，預設 environment `node`，`*.test.tsx` 用 `jsdom`（`environmentMatchGlobs` 或檔頭 `// @vitest-environment jsdom`），`include: ['test/**/*.test.{ts,tsx}']`。`vercel.json` 改為 `{ "framework": "nextjs", "buildCommand": "npm run db:migrate && npm run build" }`。`.env.example` 列 spec §8 的七個變數並各附一行說明。
- [ ] **Step 4: 寫測試** `test/sampleTasks.test.ts`：`expect(SAMPLE_TASKS).toHaveLength(11)`；每筆 `priority` 在 0–3；`'完成專案需求分析'` 的 `dueInDays === -1`。
- [ ] **Step 5:** `npm test` → PASS；`npm run build` → 成功；`npx tsc --noEmit`、`npm run lint` → 無錯誤。
- [ ] **Step 6: Commit** `chore: replace Vite with Next.js 16 skeleton`

### Task 2: 資料庫 schema、連線、PGlite 測試 DB

**Files:**
- Create: `src/server/db/schema.ts`, `src/server/db/index.ts`, `drizzle.config.ts`, `drizzle/`（產生的 migration）, `test/helpers/db.ts`
- Test: `test/db.test.ts`

**Interfaces:**
- Produces：`schema.ts` 匯出 `taskStatus`（pgEnum `task_status`）、`boards`、`tasks`，欄位照 spec §6.2（含 `deleted_at`、索引 `(user_id, deleted_at)`、`(board_id, status, position)`），以及 Better Auth 的 `user`、`session`、`account`、`verification`（用 `npx @better-auth/cli generate --config src/server/auth.ts` 產生後貼進來；Task 6 才建立 auth 設定，所以本任務先手寫這四張表，欄位照 Better Auth 1.7 文件預設，Task 6 再用 CLI 比對）。
- Produces：`src/server/db/index.ts`
  ```ts
  export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
  export function getDb(): DB   // drizzle-orm/neon-serverless + Pool(DATABASE_URL)，module 內快取單例
  ```
- Produces：`test/helpers/db.ts`
  ```ts
  export async function createTestDb(): Promise<DB>          // PGlite 記憶體 DB + migrate('./drizzle')
  export async function seedUser(db: DB, id?: string): Promise<{ id: string; email: string }>
  ```

- [ ] **Step 1: 寫測試** `test/db.test.ts`：`createTestDb()` 後插入 user → board → task，讀回 task 的 `tags` 是 `[]`、`subtasks` 是 `[]`、`status` 是 `'todo'`；刪除 user 後 boards 與 tasks 都被 cascade 刪除。
- [ ] **Step 2:** `npm test test/db.test.ts` → FAIL（schema 不存在）。
- [ ] **Step 3:** 寫 schema、`drizzle.config.ts`（`schema: './src/server/db/schema.ts'`, `out: './drizzle'`, `dialect: 'postgresql'`），`npm run db:generate` 產生 migration；寫 `index.ts` 與測試 helper。
- [ ] **Step 4:** `npm test` → PASS。
- [ ] **Step 5: Commit** `feat(db): drizzle schema, neon connection, pglite test db`

### Task 3: 日期工具、position、智慧快速新增

**Files:**
- Create: `src/lib/dates.ts`, `src/lib/position.ts`, `src/lib/quickAddParser.ts`
- Test: `test/dates.test.ts`, `test/position.test.ts`, `test/quickAddParser.test.ts`

**Interfaces:**
- Produces（`dates.ts`，全部純函式，日期為 `YYYY-MM-DD`）：
  `todayISO(now?: Date): string`（本地時區）、`addDays(iso: string, n: number): string`、`diffDays(iso: string, fromISO: string): number`、`formatMonthDay(iso): string`（`'11月22日'`）、`weekdayLabel(iso): string`（`'週日'`）、`relativeDue(iso: string, today: string): string`（`'逾期 N 天'`／`'今天'`／`'明天'`／`'N 天後'`）、`msToLocalISO(ms: number, timeZone: string): string`
- Produces（`position.ts`）：`POSITION_STEP = 1024`；`positionBetween(before: number | null, after: number | null): number | null`（兩端都 null → 0；一端 null → 另一端 ∓ STEP；間距 < 1e-6 → `null` 代表要重排）；`renumber(ids: string[]): Array<{ id: string; position: number }>`（`(i + 1) * STEP`）
- Produces（`quickAddParser.ts`）：
  ```ts
  export interface QuickAddResult { title: string; priority: Priority | null; tags: string[]; dueDate: string | null; chips: string[] }
  export function parseQuickAdd(input: string, today: string): QuickAddResult
  ```
  規則照 spec §9「智慧快速新增」。`chips` 依序：`'優先級 高'`、每個 `'#標籤'`、`'明天 · 11月24日'`（`relativeDue` + `formatMonthDay`）。標籤去重。

- [ ] **Step 1: 寫測試**
  - `relativeDue('2026-11-22','2026-11-23') === '逾期 1 天'`；`'2026-11-24'` → `'明天'`；`'2026-11-28'` → `'5 天後'`。
  - `msToLocalISO(Date.UTC(2026,10,23,16,30), 'Asia/Taipei') === '2026-11-24'`（Review Focus 3）。
  - `todayISO(new Date(2026,10,23,23,30)) === '2026-11-23'`（本地 23:30 不跨日）。
  - `positionBetween(null,null)===0`、`positionBetween(1024,null)===2048`、`positionBetween(null,1024)===0`、`positionBetween(0,1024)===512`；從 `(0,1)` 起連續對半插入 60 次，至少有一次回 `null`（Review Focus 2）；`renumber(['a','b'])` → `[{id:'a',position:1024},{id:'b',position:2048}]`。
  - `parseQuickAdd('修 bug !高 #前端 明天', '2026-11-23')` → `{ title:'修 bug', priority:1, tags:['前端'], dueDate:'2026-11-24', chips:['優先級 高','#前端','明天 · 11月24日'] }`。
  - `'！緊急 ＃後端 ＃後端 報告'` → priority 0、tags `['後端']`、title `'報告'`。
  - `'下週一 開會'`（today 2026-11-23 週一）→ dueDate `'2026-11-30'`；`'下週日'` → `'2026-12-06'`。
  - `'11/20 回顧'`（已過）→ `'2027-11-20'`；`'12/1'` → `'2026-12-01'`。
  - `'!高 #x'` → title `''`。
- [ ] **Step 2:** `npm test` → 三個檔 FAIL。
- [ ] **Step 3:** 實作三個檔（日期運算一律用本地 `new Date(y, m-1, d)`，不要用 UTC 解析 `YYYY-MM-DD`）。
- [ ] **Step 4:** `npm test` → PASS。
- [ ] **Step 5: Commit** `feat(lib): dates, position, quick-add parser`

### Task 4: taskQueries（篩選、排序、分組、統計）

**Files:**
- Create: `src/lib/taskQueries.ts`
- Test: `test/taskQueries.test.ts`

**Interfaces:**
- Consumes：`Task`、`dates.ts`
- Produces：
  ```ts
  export type ChipKey = 'overdue' | 'today' | 'urgent' | 'blocked';
  export type SortKey = 'manual' | 'priority' | 'dueDate';
  export interface TaskFilters { search: string; priority: Priority | null; dueRange: 'all'|'overdue'|'today'|'week'|'future'; tags: string[]; chip: ChipKey | null }
  export const EMPTY_FILTERS: TaskFilters
  export function indexById(tasks: Task[]): Map<string, Task>
  export function isBlocked(task: Task, byId: Map<string, Task>): boolean
  export function openBlockers(task: Task, byId: Map<string, Task>): Task[]
  export function isOverdue(task: Task, today: string): boolean
  export function isDueToday(task: Task, today: string): boolean
  export function matchesChip(task: Task, chip: ChipKey, byId, today): boolean   // done 一律 false
  export function filterTasks(tasks: Task[], f: TaskFilters, byId, today): Task[]  // search 比對 title、description、tags，不分大小寫
  export function sortTasks(tasks: Task[], sort: SortKey): Task[]                  // manual = position 升冪
  export function columnTasks(tasks: Task[], status: TaskStatus): Task[]           // 該狀態、依 position
  export function boardStats(tasks: Task[], byId, today): { total; done; pct; chips: Record<ChipKey, number> }
  export interface FocusGroups { overdue: Task[]; today: Task[]; week: Task[]; blocked: Task[] }
  export function focusGroups(tasks: Task[], byId, today): FocusGroups           // 規則照 spec §9；各組依 dueDate 再 priority 排
  export function pickSuggestion(g: FocusGroups): Task | null                    // 逾期中 priority 最高（同分取較早到期），否則今天到期中 priority 最高
  export function completedWithin(tasks: Task[], days: number, now: Date): number
  ```

- [ ] **Step 1: 寫測試**（共用 fixture `test/fixtures/tasks.ts`：把 `SAMPLE_TASKS` 轉成 `Task[]`，today `'2026-11-23'`，`dependsOnTitles` 轉成 id；Task 12、14 也用這份）：
  - `boardStats` → `total 11, done 3, pct 27, chips { overdue 2, today 1, urgent 3, blocked 1 }`。
  - `focusGroups`：overdue `['實作使用者認證模組','完成專案需求分析']`（依日期）；blocked 只有 `建立 CI/CD 流程`；被擋住的任務不出現在 week。
  - `pickSuggestion` → `實作使用者認證模組`。
  - 前置任務已軟刪除（不在 byId 裡）→ `isBlocked === false`。
  - `filterTasks` search `'API'` 命中標題；`chip:'urgent'` 不含已完成。
  - `sortTasks(...,'dueDate')` 無截止日的排最後。
- [ ] **Step 2:** FAIL → **Step 3:** 實作 → **Step 4:** PASS。
- [ ] **Step 5: Commit** `feat(lib): task queries for board, focus and stats`

### Task 5: zod 驗證與舊資料轉換

**Files:**
- Create: `src/lib/validation.ts`, `src/lib/legacy.ts`
- Test: `test/validation.test.ts`, `test/legacy.test.ts`

**Interfaces:**
- Produces（`validation.ts`）：`boardCreate`、`boardUpdate`、`taskCreate`、`taskUpdate`、`batchRequest`、`exportV2`，以及推導型別 `TaskCreateInput`、`TaskUpdateInput`、`BatchRequest`、`ExportV2`。
  - 字串欄位 `.trim()` 後檢查長度；標題內換行換成空白。
  - `tags`：每個 trim、去空字串、去重、單個 ≤ 30 字、最多 20 個。
  - `subtasks`：≤ 50，每個 `{ id: uuid, title: 1–200, done: boolean }`。
  - `taskCreate`：`{ id?: uuid, boardId: uuid, title, description?, status?, priority?, dueDate?: 'YYYY-MM-DD'|null, tags?, subtasks?, dependsOn?: uuid[], position?: number }`。
  - `taskUpdate`：上述欄位皆可選（`boardId` 除外），外加 `deletedAt?: null`；空物件拒絕。
  - `batchRequest`：`{ ids: uuid[] (1–500), op: 'move'|'delete'|'restore', status? }`，`op==='move'` 時 `status` 必填。
- Produces（`legacy.ts`）：
  ```ts
  export interface ImportTask { sourceId: string; title; description; status: TaskStatus; priority: Priority; dueDate: string|null; tags; subtasks: Subtask[]; dependsOnSourceIds: string[]; createdAt: string; completedAt: string|null; position: number }
  export interface NormalizedImport { tasks: ImportTask[]; warnings: string[] }
  export function normalizeImportFile(raw: unknown, timeZone: string): NormalizedImport        // 接受 v2 物件或舊版陣列
  export function normalizeLocalStorage(raw: { boards: unknown; tasks: unknown }, timeZone: string): { boards: Array<{ sourceId: string; name: string }>; tasksByBoard: Record<string, NormalizedImport> }
  ```
  不合法的 `priority` → 2、`status` → `'todo'`，各記一條 warning（如 `'第 3 筆：優先級無效，已設為「中」'`）；`position` 依檔案順序 `renumber`；子任務 id 重新產生。

- [ ] **Step 1: 寫測試**
  - `taskCreate.parse({ boardId, title: '  修\nbug  ', tags: [' 前端 ','前端',''] })` → `title '修 bug'`、`tags ['前端']`。
  - 標題 201 字、空白標題 → 失敗；emoji 標題 `'🚀 上線'` 通過。
  - `batchRequest` `op:'move'` 缺 `status` → 失敗。
  - 舊版陣列（取舊 `taskSlice.ts` 格式：`dueDate` 毫秒、`boardId:'default'`、`dependsOn:['4']`）→ `dueDate` 依 `'Asia/Taipei'` 轉成正確日期，`dependsOnSourceIds ['4']`；`priority: 9` → 2 並有 1 條 warning。
  - v2 物件 round-trip：`normalizeImportFile(exportFixture)` 的 tasks 標題與順序與 fixture 相同。
  - `{ foo: 1 }` → 丟出 `ApiError(400,'INVALID_IMPORT_FILE')`（`ApiError` 在 Task 6 建立前，先在 `src/server/errors.ts` 建好：`class ApiError extends Error { constructor(public status: number, public code: string, message: string, public details?: unknown) }`）。
  - `normalizeLocalStorage`：兩個看板、任務依 `boardId` 分組；沒有 `boardId` 的舊任務歸到 `'default'`。
- [ ] **Step 2:** FAIL → **Step 3:** 實作 → **Step 4:** PASS。
- [ ] **Step 5: Commit** `feat(lib): zod schemas and legacy import normalization`

### Task 6: 登入（Better Auth）與 HTTP 工具

**Files:**
- Create: `src/server/auth.ts`, `src/server/http.ts`, `app/api/auth/[...all]/route.ts`, `app/(auth)/login/page.tsx`, `app/(app)/layout.tsx`（先只做保護＋`children`）, `app/(app)/page.tsx`, `src/server/services/boards.ts`（本任務只放 `ensureDefaultBoard`）
- Modify: `src/server/db/schema.ts`（用 Better Auth CLI 比對 auth 表）, `src/server/errors.ts`
- Test: `test/auth.test.ts`, `test/http.test.ts`

**Interfaces:**
- Produces（`auth.ts`）：
  ```ts
  export function buildAuthOptions(env: NodeJS.ProcessEnv, db: DB): BetterAuthOptions
  export const auth                                           // betterAuth(buildAuthOptions(process.env, getDb()))
  export async function getSessionUser(): Promise<SessionUser | null>   // 讀 next/headers
  export async function requireUser(): Promise<SessionUser>             // 無 → throw ApiError(401,'UNAUTHENTICATED','請先登入')
  export type SessionUser = { id: string; email: string; name: string; image: string | null }
  ```
  選項：`socialProviders.github/google`（從 env）；`account.accountLinking = { enabled: true, trustedProviders: ['github','google'] }`；`emailAndPassword.enabled = env.NODE_ENV !== 'production' && env.E2E_AUTH === '1'`；`databaseHooks.user.create.after` 呼叫 `ensureDefaultBoard(db, user.id)`。
- Produces（`boards.ts`）：`ensureDefaultBoard(db: DB, userId: string): Promise<void>`——沒有任何看板時建立「我的看板」（position 1024），已有則不動。
- Produces（`http.ts`）：
  ```ts
  export function json<T>(data: T, status?: number): Response
  export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>): (...args: A) => Promise<Response>
  // 包住 handler：ApiError → 對應 status 的錯誤 JSON；ZodError → 400 VALIDATION_ERROR（details = issues）；其他 → 500 INTERNAL_ERROR 並 console.error
  export async function readJson(req: Request, maxBytes?: number): Promise<unknown>   // 超過 → ApiError(413,'PAYLOAD_TOO_LARGE')；非 JSON → 400
  ```
- 登入頁：置中卡片，標題「任務排程器」、說明「登入後，你的看板會在每台裝置同步。」、按鈕「使用 GitHub 登入」「使用 Google 登入」（`better-auth/react` 的 `signIn.social`，`callbackURL` 取 `?next=` 或 `/focus`）。E2E 模式額外顯示 email／密碼表單。
- `(app)/layout.tsx`：`getSessionUser()` 為 null → `redirect('/login?next=…')`。

- [ ] **Step 1: 寫測試**
  - `buildAuthOptions({ NODE_ENV:'production', E2E_AUTH:'1' })` → `emailAndPassword.enabled === false`；`{ NODE_ENV:'test', E2E_AUTH:'1' }` → `true`。
  - `accountLinking.trustedProviders` 等於 `['github','google']`。
  - `ensureDefaultBoard`：新使用者呼叫兩次只會有一個「我的看板」。
  - `route()`：丟 `ApiError(404,'NOT_FOUND','找不到')` → status 404、body `{ error: { code:'NOT_FOUND', message:'找不到' } }`；丟 ZodError → 400；丟一般 Error → 500 且 body 不含原始訊息。
  - `readJson` 超過 `maxBytes` → 413。
- [ ] **Step 2:** FAIL → **Step 3:** 實作；`npx @better-auth/cli generate` 比對 auth 表，有差異就更新 schema 並 `npm run db:generate`。
- [ ] **Step 4:** PASS；`npm run build` 成功。手動（有 `.env.local` 時）：`npm run dev` → `/` 導向 `/login`。
- [ ] **Step 5:** README 新增「本機開發」小節：建立 Neon DB、GitHub OAuth App（callback `http://localhost:3000/api/auth/callback/github`）、Google OAuth（`…/callback/google`）、複製 `.env.example` 為 `.env.local`、`npm run db:migrate`、`npm run dev`。
- [ ] **Step 6: Commit** `feat(auth): better-auth with github/google, route guard, http helpers`

### Task 7: 看板 API

**Files:**
- Modify: `src/server/services/boards.ts`
- Create: `app/api/boards/route.ts`, `app/api/boards/[id]/route.ts`, `test/helpers/route.ts`
- Test: `test/api/boards.test.ts`

**Interfaces:**
- Produces（`boards.ts`）：`listBoards(db, userId): Promise<Board[]>`（依 position，含 `openCount`＝未刪除且非 done）、`createBoard(db, userId, input): Promise<Board>`（position＝最後 + STEP）、`updateBoard(db, userId, id, input): Promise<Board>`、`deleteBoard(db, userId, id): Promise<void>`（硬刪；最後一個看板 → `ApiError(409,'LAST_BOARD','至少要保留一個看板')`；不是自己的 → 404）、`assertBoardOwned(db, userId, boardId): Promise<void>`。
- Produces（`test/helpers/route.ts`）：測試模式——`vi.mock('@/server/auth', () => ({ requireUser: vi.fn() }))`、`vi.mock('@/server/db', () => ({ getDb: () => testDb }))`；helper `call(handler, { method, url, body?, params? }): Promise<{ status: number; body: any }>`，`params` 包成 `Promise.resolve(params)`。之後所有 API 測試都用這個模式。

- [ ] **Step 1: 寫測試**：兩個使用者 A、B。
  - A `POST /api/boards {name:'個人專案'}` → 201；`GET` → 兩個看板（含預設），`openCount` 正確。
  - B `PATCH /api/boards/<A 的 id>` → 404；B `DELETE` → 404。
  - A 刪掉只剩一個時 → 409 `LAST_BOARD`。
  - `name` 61 字 → 400。
  - `requireUser` 丟 401 → 401。
- [ ] **Step 2:** FAIL → **Step 3:** 實作 → **Step 4:** PASS。
- [ ] **Step 5: Commit** `feat(api): boards endpoints`

### Task 8: 任務 API（CRUD、軟刪除、被擋住、依賴、position）

**Files:**
- Create: `src/server/services/tasks.ts`, `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`
- Test: `test/api/tasks.test.ts`

**Interfaces:**
- Consumes：`validation.ts`、`position.ts`、`taskQueries.isBlocked`、`assertBoardOwned`
- Produces（`tasks.ts`）：
  ```ts
  export function toApiTask(row): Task                     // in_progress ↔ in-progress、日期與時間戳轉字串
  export async function listTasks(db, userId, opts?: { boardId?: string }): Promise<Task[]>
  export async function createTask(db, userId, input: TaskCreateInput): Promise<Task>
  export async function updateTask(db, userId, id: string, patch: TaskUpdateInput): Promise<Task>
  export async function softDeleteTask(db, userId, id: string): Promise<void>
  export async function renumberColumn(db, boardId: string, status): Promise<void>
  ```
  規則：
  - `createTask` 不給 `position` → 欄位最上方（`positionBetween(null, first)`）；`id` 重複 → 409 `DUPLICATE_ID`。
  - `status` 變 `done` 寫 `completedAt = now()`，離開 `done` 清空。
  - 被擋住（Global Constraints）且要離開 `todo` → 409 `TASK_BLOCKED`、`details.blockedBy`。
  - `dependsOn`：每個 id 必須是同看板、同擁有者、未刪除的任務，否則 400 `INVALID_DEPENDENCY`；包含自己或形成循環 → 409 `DEPENDENCY_CYCLE`（DFS 檢查）。
  - `position` 由前端算好送來；若前端送 `position: null`（代表 `positionBetween` 回 null）→ 伺服器在交易中 `renumberColumn` 後把該任務插到指定位置。為此 `taskUpdate` 多一個可選欄位 `insertAfterId?: string | null`，只在 `position === null` 時使用。
  - `deletedAt: null` → 還原（只能還原自己的軟刪除任務）。
  - 已軟刪除的任務對 GET／PATCH（非還原）回 404。

- [ ] **Step 1: 寫測試**
  - 建立 → 列表只看得到自己的；`?boardId=` 篩選；B 讀不到 A 的任務（列表為空、PATCH 404）。
  - PATCH `status:'done'` → `completedAt` 非 null；再改回 `todo` → null。
  - 依賴：C 依賴 D（D 未完成）→ PATCH C `in-progress` 409 `TASK_BLOCKED`，PATCH C `done` 也 409；D 完成後可以；D 軟刪除後 C 不再被擋。
  - 自己依賴自己、A→B→A → 409 `DEPENDENCY_CYCLE`；依賴別的看板的任務 → 400。
  - DELETE → 列表消失；PATCH `{deletedAt:null}` → 回來且欄位不變。
  - position：在 `0` 與 `1e-7` 之間插入（送 `position:null, insertAfterId`）→ 整欄重新編號、順序為 `[first, moved, second]`（Review Focus 2）。
  - 標題全空白 → 400（Review Focus 5）。
- [ ] **Step 2:** FAIL → **Step 3:** 實作（狀態更新與重排包在 `db.transaction`）→ **Step 4:** PASS。
- [ ] **Step 5: Commit** `feat(api): tasks endpoints with soft delete, blocking and dependency rules`

### Task 9: 批次 API

**Files:**
- Modify: `src/server/services/tasks.ts`
- Create: `app/api/tasks/batch/route.ts`
- Test: `test/api/batch.test.ts`

**Interfaces:**
- Produces：`batchTasks(db, userId, req: BatchRequest): Promise<{ updated: string[]; skipped: Array<{ id: string; reason: 'TASK_BLOCKED' | 'NOT_FOUND' }> }>`——單一交易；`move` 略過被擋住的；不是自己的或不存在的 id 列為 `NOT_FOUND`（不整批失敗）；`delete` 軟刪除；`restore` 還原。移動到新欄的任務接在該欄最後。

- [ ] **Step 1: 寫測試**：3 筆（其中 1 筆被擋住）`move → in-progress` → `updated` 2 筆、`skipped [{id, reason:'TASK_BLOCKED'}]`；混入 B 的 id → `NOT_FOUND`；`delete` 後 `restore` 全部回來。
- [ ] **Step 2–4:** FAIL → 實作 → PASS。
- [ ] **Step 5: Commit** `feat(api): batch move/delete/restore`

### Task 10: 匯出／匯入

**Files:**
- Create: `src/server/services/importExport.ts`, `app/api/boards/[id]/export/route.ts`, `app/api/boards/[id]/import/route.ts`, `app/api/import/local/route.ts`
- Test: `test/api/importExport.test.ts`

**Interfaces:**
- Consumes：`legacy.ts`、`exportV2`
- Produces：
  ```ts
  export async function exportBoard(db, userId, boardId): Promise<ExportV2>
  export async function importBoard(db, userId, boardId, raw: unknown, timeZone: string): Promise<{ imported: string[]; replaced: string[]; warnings: string[] }>
  export async function importLocal(db, userId, raw: unknown, timeZone: string): Promise<{ boards: Board[]; taskCount: number; warnings: string[] }>
  ```
  - export route 回 `Content-Disposition: attachment; filename="<看板名>-YYYY-MM-DD.json"`（檔名 RFC 5987 編碼）。
  - import route body：`{ timeZone: string, file: unknown }`，`readJson(req, 2_000_000)`；任務 > 2,000 → 413。
  - `importBoard`：交易中把目標看板現有未刪除任務軟刪除（回傳 `replaced`），新增匯入任務（新 id、`dependsOn` 依 `sourceId` 對應、對不到丟掉）。**其他看板不動。**
  - `importLocal`：每個舊看板建一個新看板（名稱沿用），任務依看板匯入；舊 `'default'` 看板若使用者目前只有一個空的「我的看板」，就直接匯入那個看板而不另建。

- [ ] **Step 1: 寫測試**
  - A 有看板 X（2 筆）、Y（3 筆）；把 Y 的匯出檔匯入 X → X 變 3 筆、Y 仍 3 筆、`replaced` 是 X 原本 2 筆的 id（spec 反目標）。
  - 舊版陣列匯入（含 `dependsOn`）→ 新任務的 `dependsOn` 指向新 id。
  - 匯出 → 匯入 round-trip 後標題、順序、子任務一致。
  - 2,001 筆 → 413；B 匯入到 A 的看板 → 404。
  - `importLocal`：兩個舊看板 → 使用者共有兩個看板（預設的空看板被沿用）；`timeZone:'Asia/Taipei'` 下毫秒 `Date.UTC(2026,10,23,16,30)` 變成 `'2026-11-24'`（Review Focus 3）。
- [ ] **Step 2–4:** FAIL → 實作 → PASS。
- [ ] **Step 5: Commit** `feat(api): board export/import and legacy localStorage import`

---

## Part B — 前端

### Task 11: App 外殼、tokens、Redux／RTK Query、復原堆疊

**Files:**
- Create: `src/styles/tokens.scss`, `src/styles/globals.scss`, `app/providers.tsx`, `src/client/store.ts`, `src/client/uiSlice.ts`, `src/client/api.ts`, `src/client/undo.tsx`, `src/client/commands.ts`, `src/components/icons.tsx`, `src/components/AppShell/`, `src/components/Sidebar/`, `src/components/UndoToast/`, `app/(app)/focus/page.tsx`（暫時只顯示標題）, `app/(app)/b/[boardId]/page.tsx`（暫時）
- Modify: `app/layout.tsx`, `app/(app)/layout.tsx`
- Test: `test/client/api.test.ts`, `test/client/undo.test.ts`, `test/components/Sidebar.test.tsx`

**Interfaces:**
- `tokens.scss`：spec §9 表格每一列一個 CSS 變數（`--bg`、`--side`、`--surface`、`--surface-2`、`--column`、`--border`、`--border-soft`、`--border-strong`、`--text`、`--text-2`、`--text-3`、`--accent`、`--accent-soft`、`--accent-text`、`--on-accent`、`--danger`、`--danger-soft`、`--warn`、`--warn-soft`、`--ok`、`--toast-bg`、`--toast-fg`、`--toast-action`、`--overlay`、`--p0`…`--p3`），`:root` 淺色、`[data-theme=dark]` 深色。另匯出 TS 常數 `src/client/tokens.ts`：`TOKENS: Record<'light'|'dark', { accent; bg; surface; text; border; radius }>` 給 AntD `ConfigProvider`。
- `app/layout.tsx`：`next/font` 載 Inter 與 Noto Sans TC；讀 cookie `theme`（`light|dark|system`），`system` 時輸出 `data-theme` 不設、由 `@media (prefers-color-scheme: dark)` 在 tokens 裡處理。
- `uiSlice`：`{ filters: TaskFilters; sort: SortKey; batchMode: boolean; selectedIds: string[]; paletteOpen: boolean; sidebarOpen: boolean }`，actions：`setFilters`、`setChip`、`clearFilters`、`setSort`、`toggleBatch`、`toggleSelected`、`setSelected`、`setPaletteOpen`、`setSidebarOpen`。
- `api.ts`：
  ```ts
  export const api = createApi({ baseQuery: baseQueryWithAuth, tagTypes: ['Board','Task'], endpoints })
  // endpoints: getBoards, createBoard, updateBoard, deleteBoard, getTasks (arg void → 全部),
  //   createTask, updateTask ({ id, patch }), deleteTask, batchTasks, exportBoard, importBoard, importLocal
  ```
  - `baseQueryWithAuth`：`fetchBaseQuery({ baseUrl: '/api' })`；401 → `window.location.assign('/login?next=' + encodeURIComponent(location.pathname + location.search))`（Review Focus 4）。
  - `createTask`、`updateTask`、`deleteTask`、`batchTasks` 在 `onQueryStarted` 用 `api.util.updateQueryData('getTasks', undefined, …)` 樂觀更新；失敗 `patch.undo()`；**404 時**把該任務從快取移除並 `toast('這筆任務已不存在')`（Review Focus 1）；其他錯誤 `toast(error.message)`。
  - Board 變更 invalidates `Board`。
- `undo.tsx`（不放 Redux，因為指令含函式）：
  ```ts
  export interface Command { label: string; undo: () => Promise<void>; redo: () => Promise<void> }
  export function createUndoStack(limit = 30): { push(c: Command): void; undo(): Promise<void>; redo(): Promise<void>; canUndo(): boolean; canRedo(): boolean; subscribe(fn: () => void): () => void }
  export function UndoProvider(props): JSX.Element
  export function useUndo(): { push; undo; redo; canUndo; canRedo; toast: { text: string; undoable: boolean } | null; showToast(text: string, undoable?: boolean): void }
  ```
  undo 丟 404 → 捨棄該筆並提示「無法復原：任務已不存在」。提示列 6 秒自動消失。
- `commands.ts`：`useTaskCommands()` 回傳 `{ create(input), update(task, patch, label?), move(task, status, position, insertAfterId), remove(task), batchMove(ids, status), batchRemove(ids), loadSamples(boardId) }`——每個都呼叫 mutation、推一筆反向 `Command`（反向表照 spec §6.4）、顯示提示列（刪除：`已刪除「…」`、完成：`已完成「…」`、移動：`已移到進行中：「…」`、批次：`已移動 N 筆，M 筆因等待前置任務而略過`）。`update` 對標題／描述的呼叫端自行 debounce 600ms。
- `Sidebar`：照 spec §9 版面；看板清單來自 `getBoards`，目前看板由 `usePathname()` 判斷；新增看板（AntD `Modal` + 輸入）、雙擊改名、右鍵／⋯ 選單刪除（確認框「確定要刪除「X」嗎？看板內所有任務將一併刪除，此操作無法復原。」）；底部：主題切換（寫 cookie 後 `router.refresh()`）、匯入／匯出（Task 17 接上）、到期提醒（Task 17）、快捷鍵、使用者頭像選單（登出）。`今日焦點` 徽章＝`focusGroups` 的 overdue + today 數。
- `AppShell`：`<Sidebar/>` + `<main>` + 提示列；手機（< 768px）側欄改 AntD `Drawer`，由頂列漢堡鈕開。

- [ ] **Step 1: 寫測試**
  - `undo.test.ts`：push 31 筆只留 30；undo 後 redo 呼叫對的函式；undo 函式丟 `{status:404}` → 堆疊少一筆且 toast 文字為「無法復原：任務已不存在」。
  - `api.test.ts`（mock `fetch`）：`updateTask` 先改快取、回 500 → 快取還原；回 404 → 任務從快取消失；任何端點回 401 → `window.location.assign` 被呼叫且參數含 `next=`。
  - `Sidebar.test.tsx`：給兩個看板與任務 fixture → 顯示「我的看板」「個人專案」與各自未完成數；今日焦點徽章數字正確。
- [ ] **Step 2:** FAIL → **Step 3:** 實作 → **Step 4:** PASS；`npm run build` 成功；手動登入後看到側欄。
- [ ] **Step 5: Commit** `feat(ui): app shell, design tokens, rtk query with optimistic updates, undo stack`

### Task 12: 看板頁（頂列、統計列、欄、卡片、快速新增、拖曳、批次）

**Files:**
- Create: `src/components/BoardView/`, `TopBar/`, `StatsStrip/`, `TaskColumn/`, `TaskCard/`, `QuickAdd/`
- Modify: `app/(app)/b/[boardId]/page.tsx`
- Test: `test/components/TaskCard.test.tsx`, `test/components/QuickAdd.test.tsx`, `test/components/StatsStrip.test.tsx`

**Interfaces:**
- Consumes：`getTasks`、`getBoards`、`taskQueries`、`useTaskCommands`、`uiSlice`、`parseQuickAdd`、`todayISO`
- `BoardView({ boardId })`：看板不存在或不屬於自己（`getBoards` 裡沒有）→ 顯示「找不到這個看板」並提供回今日焦點連結。載入中顯示骨架（spec §9）。
- `TaskCard({ task, blocked, blockers, today, selected, batchMode, checked, onOpen, onAdvance, onToggleCheck })`：狀態樣式照 spec §9「卡片狀態」；「→」的 `aria-label` 為 `開始處理：<標題>`／`標記完成：<標題>`／`重新開啟：<標題>`。
- `QuickAdd({ status, onCreate })`：placeholder `快速新增…試試「!高 #前端 明天」`；有解析結果時顯示晶片＋「↵ 新增」；Enter 建立（標題空就不動），Esc 清空。
- `StatsStrip`：完成率圓環＋四個晶片（文字：逾期、今天到期、緊急、等待前置），`aria-pressed`；有篩選時顯示「清除篩選」；右側說明「拖曳卡片換欄 · 點卡片看詳情」。
- `TopBar`：看板名稱、`N 項任務 · M 項進行中`；篩選（AntD Popover：優先級、到期範圍、標籤、搜尋）、排序（手動／優先級／截止日）、選取、復原、重做、新增任務。批次模式時換成「已選 N 筆」＋「移至待處理／進行中／已完成」「刪除」「取消」。
- 拖曳：`DragDropContext.onDragEnd` 計算目標欄前後鄰居 → `positionBetween`；回 `null` 就送 `position:null, insertAfterId`；跨欄到非 todo 且 `isBlocked` → 不送出、卡片彈回、提示「「X」還在等待前置任務完成」。排序不是「手動」時停用欄內重排（跨欄仍可）。
- 點卡片 → `router.push('?task=<id>', { scroll: false })`。

- [ ] **Step 1: 寫測試**
  - `TaskCard`：逾期卡片顯示「逾期 1 天」；被擋住的卡片沒有「→」按鈕且顯示「等待 1 個前置任務」；已完成卡片標題有 `line-through` 並顯示「完成於 11月20日」；中優先級只有圓點沒有文字標籤。
  - `QuickAdd`：輸入 `修 bug !高 #前端 明天`（today 固定 2026-11-23）→ 顯示三個晶片；按 Enter → `onCreate` 收到 `{ title:'修 bug', priority:1, tags:['前端'], dueDate:'2026-11-24', status:'todo' }` 且輸入框清空；只輸入 `!高` 按 Enter → 不呼叫。
  - `StatsStrip`：點「逾期」→ dispatch `setChip('overdue')`；再點 → `setChip(null)`。
- [ ] **Step 2:** FAIL → **Step 3:** 實作 → **Step 4:** PASS；手動：新增、拖曳、批次在瀏覽器可用。
- [ ] **Step 5: Commit** `feat(ui): board view with quick add, drag and drop, batch mode`

### Task 13: 任務詳情欄（含新增模式）

**Files:**
- Create: `src/components/TaskDetailPanel/`
- Modify: `src/components/AppShell/`（在主內容右側掛詳情欄，讀 `?task=`）
- Test: `test/components/TaskDetailPanel.test.tsx`

**Interfaces:**
- `TaskDetailPanel({ taskId | 'new', boardId, onClose })`：
  - `?task=new` 是新增模式（標題欄自動聚焦，預設 `status:'todo', priority:2`，按「建立」或 ⌘Enter 送出後換成該任務 id）。
  - 欄位照 spec §9「詳情欄」；標題、描述 debounce 600ms 或 blur 送出；優先級、截止日（AntD `DatePicker`，值轉 `YYYY-MM-DD`）、標籤（AntD `Select mode="tags"`）、前置任務（`Select mode="multiple"`，只列同看板其他任務，已完成的前面加「✓ 」）、子任務（勾選／新增／刪除）。
  - 被擋住時「進行中」「已完成」按鈕 `disabled`，tooltip「等待前置任務：<名稱、名稱>」。
  - 刪除鈕 → `commands.remove` → 關閉面板。
  - 任務不存在（被刪除或網址錯）→ 面板顯示「找不到這筆任務」與關閉鈕。
  - Esc 關閉（輸入框中也生效）；手機寬度時改成 AntD `Drawer placement="bottom" height="85%"`。

- [ ] **Step 1: 寫測試**：渲染一筆有 3 個子任務的任務 → 顯示「2 / 3」；勾第三個 → `update` 收到 `subtasks` 全部 `done:true`；被擋住的任務「進行中」按鈕 disabled；`taskId='new'` 送出空標題 → 顯示「請輸入任務名稱」且不呼叫 `create`；打開不存在 id → 顯示「找不到這筆任務」。
- [ ] **Step 2–4:** FAIL → 實作 → PASS。
- [ ] **Step 5: Commit** `feat(ui): task detail panel for create and edit`

### Task 14: 今日焦點

**Files:**
- Create: `src/components/FocusView/`
- Modify: `app/(app)/focus/page.tsx`
- Test: `test/components/FocusView.test.tsx`

**Interfaces:**
- Consumes：`focusGroups`、`pickSuggestion`、`completedWithin`、`useTaskCommands`
- 版面與文案照 spec §9「今日焦點」與畫布：日期行（`11月23日 星期一`）、標題「今天有 N 件事需要你」（N＝overdue + today）、副標「X 件已逾期、Y 件今天到期 · 橫跨 Z 個看板」、四個分組與各自空狀態文字、右欄「建議先處理」（按鈕「打開任務」）、「看板進度」、「件任務在過去 7 天內完成」。
- 完成圈 `aria-label="標記完成：<標題>"` → `commands.move(task,'done',…)`；點標題 → `?task=<id>`（詳情欄在焦點頁也能開）。

- [ ] **Step 1: 寫測試**（fixture 同 Task 4、today 2026-11-23）：標題「今天有 3 件事需要你」；「已逾期」組有 2 列、依序 `實作使用者認證模組`、`完成專案需求分析`；「等待前置任務」組有 `建立 CI/CD 流程`；把所有逾期任務設為 done 的 fixture → 顯示「沒有逾期的任務，做得好。」；建議卡片顯示 `實作使用者認證模組`。
- [ ] **Step 2–4:** FAIL → 實作 → PASS。
- [ ] **Step 5: Commit** `feat(ui): today focus view`

### Task 15: ⌘K 指令面板與鍵盤快捷鍵

**Files:**
- Create: `src/components/CommandPalette/`, `src/client/useShortcuts.ts`
- Modify: `src/components/AppShell/`
- Test: `test/components/CommandPalette.test.tsx`, `test/client/useShortcuts.test.tsx`

**Interfaces:**
- `CommandPalette`：AntD `Modal`（無 footer、寬 620、`top: 120`）；輸入框 placeholder `搜尋任務、看板，或輸入指令…`；「任務」組（全部看板，比對標題與標籤，空查詢顯示最近更新的 3 筆，有查詢最多 6 筆，顯示 `<看板名> · <狀態>`）、「動作」組（spec §9 列的動作＋「切換到「<看板>」看板」每個看板一條）；↑↓ 移動高亮、Enter 執行、Esc 關閉；沒有任何結果時顯示「找不到「q」— 按 ↵ 直接建立成新任務」，Enter 以 `parseQuickAdd(q)` 在目前看板（焦點頁時用第一個看板）建立。
- `useShortcuts()`：綁 `keydown` 於 `document`；目標是 input／textarea／contentEditable 時只處理 `⌘K`、`Esc`、`⌘Z`、`⌘⇧Z`；其他照 spec §9「鍵盤」；`/` → 在看板頁打開 TopBar 的篩選 Popover 並聚焦其中的搜尋框，在焦點頁則開 ⌘K 面板；`1`–`9` → 側欄第 N 個看板；`G` 後 1 秒內按 `F` → `/focus`；`?` 開快捷鍵說明（AntD `Modal`，內容同畫布元件頁的鍵盤表）。

- [ ] **Step 1: 寫測試**：輸入 `api` → 任務組含「撰寫 API 規格文件」與「串接天氣 API」（跨看板 fixture）；按 Enter → `router.push('/b/<side>?task=<id>')`；輸入 `zzz` 再 Enter → `create` 收到 `title:'zzz'`；`useShortcuts`：在 body 按 `n` → 導向 `?task=new`，在 input 裡按 `n` → 無動作，按 `Meta+k` → `setPaletteOpen(true)`。
- [ ] **Step 2–4:** FAIL → 實作 → PASS。
- [ ] **Step 5: Commit** `feat(ui): command palette and keyboard shortcuts`

### Task 16: 手機版面

**Files:**
- Modify: `src/components/AppShell/`, `BoardView/`, `TaskColumn/`, `TopBar/`, `StatsStrip/`, `TaskDetailPanel/`
- Test: `test/components/BoardView.mobile.test.tsx`

**Interfaces:**
- 斷點 `768px`（`useMediaQuery('(max-width: 767px)')`，放在 `src/client/useMediaQuery.ts`）。
- 手機：頂列「☰ 看板名稱▾ 🔍」（圖示用 `icons.tsx` 線條 SVG）；三欄改成頂部分段控制「待處理 N｜進行中 N｜已完成 N」一次一欄；統計晶片可橫向捲動；右下 56×56 浮動新增鈕（`aria-label="新增任務"`）；卡片「→」鈕 44×44；詳情欄為底部 sheet（Task 13 已處理）。拖曳在手機停用，改用「→」與詳情欄換狀態。

- [ ] **Step 1: 寫測試**：mock `matchMedia` 為手機 → 只渲染一欄、分段控制三個 tab、點「進行中」後顯示進行中卡片；浮動新增鈕存在。
- [ ] **Step 2–4:** FAIL → 實作 → PASS；手動在 375px 寬檢查無水平捲動。
- [ ] **Step 5: Commit** `feat(ui): mobile layout`

### Task 17: 匯入／匯出 UI、舊資料搬家、範例任務、到期提醒

**Files:**
- Create: `src/components/LegacyImportBanner/`, `src/client/useNotifications.ts`, `src/components/DataMenu/`
- Modify: `src/components/Sidebar/`, `BoardView/`, `CommandPalette/`
- Test: `test/components/LegacyImportBanner.test.tsx`, `test/client/useNotifications.test.ts`

**Interfaces:**
- `DataMenu`（側欄「匯入／匯出看板」與指令面板共用）：匯出 → 下載 `GET /api/boards/:id/export`；匯入 → 選 `.json` 檔 → AntD 確認框「匯入會取代「<看板>」目前的任務（其他看板不受影響）。可用 ⌘Z 復原。」→ `importBoard({ boardId, file, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })` → 推入復原指令（undo＝batch restore `replaced` ＋ batch delete `imported`）→ 有 warnings 時用 AntD `Modal.info` 列出。
- `LegacyImportBanner`：localStorage 有 `taskSchedulerTasks_v3` 或 `taskSchedulerBoards`、且沒有 `taskSchedulerMigrated` → 看板與焦點頁頂端顯示「發現這台裝置上的舊資料（N 個看板、M 筆任務）」＋「匯入」「略過」；匯入呼叫 `importLocal`，成功或略過都寫 `taskSchedulerMigrated=1`。localStorage 讀寫包 try/catch。
- 空看板空狀態加「載入範例任務」→ `commands.loadSamples(boardId)`（用 `SAMPLE_TASKS`，`dueInDays` 轉成 `addDays(today, n)`）。
- `useNotifications()`：回傳 `{ permission, enable() }`；`enable()` 才呼叫 `Notification.requestPermission()`；`granted` 時每 10 分鐘檢查（逾期、24 小時內到期），已通知 id 存 localStorage `taskSchedulerNotifiedIds`；**頁面載入時絕不自動請求**。側欄「到期提醒」顯示「開啟」或「已開啟」。

- [ ] **Step 1: 寫測試**：有舊資料 → banner 顯示正確數字；按「略過」→ banner 消失且 `taskSchedulerMigrated === '1'`；`useNotifications` 掛載時 `Notification.requestPermission` 沒被呼叫，呼叫 `enable()` 後被呼叫一次；`granted` 且有逾期任務 → `new Notification('任務已逾期', …)` 一次，第二輪不重複。
- [ ] **Step 2–4:** FAIL → 實作 → PASS。
- [ ] **Step 5: Commit** `feat(ui): import/export, legacy migration banner, sample tasks, opt-in reminders`

### Task 18: E2E、文件、部署設定

**Files:**
- Create: `playwright.config.ts`, `e2e/main-flow.spec.ts`, `e2e/global-setup.ts`
- Modify: `README.md`, `.env.example`, `src/assets/Screenshot-task-scheduler.png`（換新截圖）, `LICENSE`（不動，確認年份即可）
- Delete: `docs` 以外不再引用的舊截圖路徑（README 改指新圖）

**Interfaces:**
- `playwright.config.ts`：`webServer: { command: 'npm run dev', env: { E2E_AUTH: '1' } }`，`baseURL http://localhost:3000`；`global-setup` 用 email/password 註冊測試帳號並存 `storageState`。需要 `DATABASE_URL` 指向測試用 Neon branch（README 說明）。

- [ ] **Step 1: 寫 E2E** `e2e/main-flow.spec.ts`，照 spec §10 的流程逐步斷言：登入 → 預設看板 → 快速新增 `修 bug !高 #前端 明天` → 卡片出現且顯示「高」「明天」→ 拖到「進行中」→ 開詳情欄改優先級為「緊急」→ 刪除 → 提示列按「復原」→ 卡片回來 → 建第二個看板並在其中新增「串接天氣 API」→ 回第一個看板按 ⌘K 輸入「天氣」Enter → URL 是第二個看板且詳情欄開著 → `/focus` 看到「今天有」→ 重新整理後「修 bug」仍在 → 頁面載入期間沒有通知權限請求（`page.on('dialog')`／檢查 `Notification.permission` 仍為 `default`）。
- [ ] **Step 2:** `npm run test:e2e` → PASS（無 DB 環境時跳過並在 README 註明）。
- [ ] **Step 3:** README 改寫（spec §11）：功能清單、截圖、本機開發、環境變數表、`npm` scripts、快捷鍵與快速新增語法表、部署到 Vercel（環境變數、OAuth callback 改正式網域、build 會先跑 migration）、技術棧。截圖用 Playwright 在 1440×900 淺色模式、載入範例任務後拍。
- [ ] **Step 4:** 全部檢查：`npm test`、`npx tsc --noEmit`、`npm run lint`、`npm run build`、`npm run test:e2e`；手動：深色模式、375px 寬、⌘K、拖曳。
- [ ] **Step 5: Commit** `docs: rewrite README for v2; e2e main flow; deployment config`

---

## Spec 對照

| spec | 任務 |
|---|---|
| §5 技術選型 | 1、2、6、11 |
| §6.1 目錄、刪舊檔 | 1 |
| §6.2 資料模型 | 2、8 |
| §6.3 全量載入、樂觀更新、URL 狀態、主題 cookie | 11、12、13 |
| §6.4 復原／重做 | 11（堆疊、指令）、12–17（各操作推指令） |
| §7 API、被擋住、匯入格式 | 7、8、9、10 |
| §8 登入、帳號連結、首次登入、舊資料、範例、E2E 登入 | 6、17、18 |
| §9 UI 規格、tokens、快速新增、鍵盤、手機、通知 | 3、11–17 |
| §10 測試與驗收 | 各任務測試、18 |
| §11 文件同步 | 6（README 開發段）、18 |
| §12 部署 | 1（vercel.json）、18 |
