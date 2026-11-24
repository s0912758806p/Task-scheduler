import type { Priority, TaskStatus } from './types';

// Sample tasks for the empty-board "load sample tasks" button.
// Dates are relative to today (days): negative = past, 0 = today.
export interface SampleTask {
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueInDays: number | null;
  completedInDays: number | null; // only set for done tasks
  tags: string[];
  subtasks: { title: string; done: boolean }[];
  dependsOnTitles?: string[];
}

export const SAMPLE_TASKS: SampleTask[] = [
  {
    title: '完成專案需求分析',
    description: '與客戶開會確認功能範圍，整理 PRD 文件並取得所有利益相關人簽核。',
    status: 'todo',
    priority: 0,
    dueInDays: -1,
    completedInDays: null,
    tags: ['文件', '客戶'],
    subtasks: [],
  },
  {
    title: '撰寫 API 規格文件',
    description: '定義 RESTful API 端點、請求/回應格式及錯誤碼規範，使用 OpenAPI 3.0。',
    status: 'todo',
    priority: 1,
    dueInDays: 5,
    completedInDays: null,
    tags: ['後端', '文件'],
    subtasks: [
      { title: '列出所有 API 端點', done: true },
      { title: '撰寫 Request/Response schema', done: false },
      { title: '補充錯誤碼說明', done: false },
    ],
  },
  {
    title: '建立 CI/CD 流程',
    description: '設定 GitHub Actions 自動化測試與部署流程，包含 staging 和 production 環境。',
    status: 'todo',
    priority: 2,
    dueInDays: 12,
    completedInDays: null,
    tags: ['DevOps'],
    subtasks: [],
    dependsOnTitles: ['撰寫 API 規格文件'],
  },
  {
    title: '效能優化 — 首頁載入速度',
    description: '目標將 LCP 壓至 1.5s 以下，計劃進行圖片 lazy-load、code splitting 及 CDN 設定。',
    status: 'todo',
    priority: 1,
    dueInDays: 8,
    completedInDays: null,
    tags: ['前端', '效能'],
    subtasks: [
      { title: '分析目前 bundle size', done: false },
      { title: '實作 lazy loading', done: false },
      { title: '設定 CDN 快取規則', done: false },
    ],
  },
  {
    title: '安全性稽核',
    description: '檢查 OWASP Top 10 漏洞，包含 XSS、SQL Injection 及身份驗證機制審查。',
    status: 'todo',
    priority: 0,
    dueInDays: 0,
    completedInDays: null,
    tags: ['安全'],
    subtasks: [],
  },
  {
    title: '設計資料庫結構',
    description: '設計專案所需的資料庫架構，包含 ERD 圖、索引策略及資料遷移腳本。',
    status: 'in-progress',
    priority: 1,
    dueInDays: 4,
    completedInDays: null,
    tags: ['後端', '資料庫'],
    subtasks: [
      { title: '繪製 ERD 圖', done: true },
      { title: '建立 Migration 腳本', done: true },
      { title: '壓力測試查詢效能', done: false },
    ],
  },
  {
    title: '實作使用者認證模組',
    description: '使用 JWT + Refresh Token 機制，支援第三方 OAuth（Google、GitHub）登入。',
    status: 'in-progress',
    priority: 0,
    dueInDays: -2,
    completedInDays: null,
    tags: ['後端', '安全'],
    subtasks: [
      { title: '實作 JWT 簽發與驗證', done: true },
      { title: '整合 Google OAuth', done: true },
      { title: '整合 GitHub OAuth', done: false },
      { title: '實作 Refresh Token 輪換', done: false },
    ],
  },
  {
    title: 'UI 元件庫建置',
    description: '建立設計系統與共用元件（Button、Form、Modal、Table），並撰寫 Storybook 文件。',
    status: 'in-progress',
    priority: 2,
    dueInDays: 6,
    completedInDays: null,
    tags: ['前端', '設計系統'],
    subtasks: [],
  },
  {
    title: '建立前端框架',
    description: '使用 React + TypeScript + Vite 建立基本專案結構，整合 Ant Design 與 Redux Toolkit。',
    status: 'done',
    priority: 2,
    dueInDays: -3,
    completedInDays: -3,
    tags: ['前端'],
    subtasks: [],
  },
  {
    title: '環境建置與部署設定',
    description: '設定開發、測試、正式三套環境的環境變數、Docker Compose 及 Nginx 設定檔。',
    status: 'done',
    priority: 1,
    dueInDays: -7,
    completedInDays: -7,
    tags: ['DevOps', '基礎設施'],
    subtasks: [
      { title: '建立 Docker Compose', done: true },
      { title: '設定 Nginx 反向代理', done: true },
      { title: '設定環境變數管理', done: true },
    ],
  },
  {
    title: '原型設計與 UX 審查',
    description: '完成高保真 Figma 原型，通過內部 UX 審查並取得設計確認。',
    status: 'done',
    priority: 2,
    dueInDays: -10,
    completedInDays: -10,
    tags: ['設計', 'UX'],
    subtasks: [],
  },
];
