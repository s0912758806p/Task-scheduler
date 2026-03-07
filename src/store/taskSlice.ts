import { createSlice, PayloadAction, current } from "@reduxjs/toolkit";
import { TaskData, TaskStatus } from "../types/task";
import { DEFAULT_BOARD_ID } from "./boardSlice";

const MAX_HISTORY = 30;

const loadTasksFromLocalStorage = (): TaskData[] => {
  try {
    const savedTasks = localStorage.getItem("taskSchedulerTasks_v2");
    if (savedTasks) {
      const tasks = JSON.parse(savedTasks) as TaskData[];
      // 資料遷移：舊任務沒有 boardId，補上預設值
      return tasks.map((t) => ({ ...t, boardId: t.boardId ?? DEFAULT_BOARD_ID }));
    }
  } catch (error) {
    console.error("Error loading tasks from localStorage:", error);
  }
  return mockTasks;
};

const mockTasks: TaskData[] = [
  // ── 待處理 ────────────────────────────────────────────────
  {
    id: "1",
    boardId: DEFAULT_BOARD_ID,
    title: "完成專案需求分析",
    description: "與客戶開會確認功能範圍，整理 PRD 文件並取得所有利益相關人簽核。",
    status: "todo",
    priority: 0,
    createdAt: Date.now() - 86400000 * 2,
    dueDate: Date.now() + 86400000 * 2,
    tags: ["文件", "客戶"],
  },
  {
    id: "4",
    boardId: DEFAULT_BOARD_ID,
    title: "撰寫 API 規格文件",
    description: "定義 RESTful API 端點、請求/回應格式及錯誤碼規範，使用 OpenAPI 3.0。",
    status: "todo",
    priority: 1,
    createdAt: Date.now() - 86400000,
    dueDate: Date.now() + 86400000 * 5,
    tags: ["後端", "文件"],
    subtasks: [
      { id: "s1", title: "列出所有 API 端點", done: true },
      { id: "s2", title: "撰寫 Request/Response schema", done: false },
      { id: "s3", title: "補充錯誤碼說明", done: false },
    ],
  },
  {
    id: "8",
    boardId: DEFAULT_BOARD_ID,
    title: "建立 CI/CD 流程",
    description: "設定 GitHub Actions 自動化測試與部署流程，包含 staging 和 production 環境。",
    status: "todo",
    priority: 2,
    createdAt: Date.now() - 86400000 * 3,
    dueDate: Date.now() + 86400000 * 12,
    tags: ["DevOps"],
  },
  {
    id: "9",
    boardId: DEFAULT_BOARD_ID,
    title: "效能優化 — 首頁載入速度",
    description: "目標將 LCP 壓至 1.5s 以下，計劃進行圖片 lazy-load、code splitting 及 CDN 設定。",
    status: "todo",
    priority: 1,
    createdAt: Date.now() - 86400000 * 1,
    dueDate: Date.now() + 86400000 * 8,
    tags: ["前端", "效能"],
    subtasks: [
      { id: "s4", title: "分析目前 bundle size", done: false },
      { id: "s5", title: "實作 lazy loading", done: false },
      { id: "s6", title: "設定 CDN 快取規則", done: false },
    ],
  },
  {
    id: "10",
    boardId: DEFAULT_BOARD_ID,
    title: "安全性稽核",
    description: "檢查 OWASP Top 10 漏洞，包含 XSS、SQL Injection 及身份驗證機制審查。",
    status: "todo",
    priority: 0,
    createdAt: Date.now(),
    dueDate: Date.now() + 86400000 * 3,
    tags: ["安全"],
  },

  // ── 進行中 ────────────────────────────────────────────────
  {
    id: "2",
    boardId: DEFAULT_BOARD_ID,
    title: "設計資料庫結構",
    description: "設計專案所需的資料庫架構，包含 ERD 圖、索引策略及資料遷移腳本。",
    status: "in-progress",
    priority: 1,
    createdAt: Date.now() - 86400000 * 4,
    dueDate: Date.now() + 86400000 * 4,
    tags: ["後端", "資料庫"],
    subtasks: [
      { id: "s7", title: "繪製 ERD 圖", done: true },
      { id: "s8", title: "建立 Migration 腳本", done: true },
      { id: "s9", title: "壓力測試查詢效能", done: false },
    ],
  },
  {
    id: "6",
    boardId: DEFAULT_BOARD_ID,
    title: "實作使用者認證模組",
    description: "使用 JWT + Refresh Token 機制，支援第三方 OAuth（Google、GitHub）登入。",
    status: "in-progress",
    priority: 0,
    createdAt: Date.now() - 86400000 * 5,
    dueDate: Date.now() + 86400000 * 1,
    tags: ["後端", "安全"],
    subtasks: [
      { id: "s10", title: "實作 JWT 簽發與驗證", done: true },
      { id: "s11", title: "整合 Google OAuth", done: true },
      { id: "s12", title: "整合 GitHub OAuth", done: false },
      { id: "s13", title: "實作 Refresh Token 輪換", done: false },
    ],
  },
  {
    id: "7",
    boardId: DEFAULT_BOARD_ID,
    title: "UI 元件庫建置",
    description: "建立設計系統與共用元件（Button、Form、Modal、Table），並撰寫 Storybook 文件。",
    status: "in-progress",
    priority: 2,
    createdAt: Date.now() - 86400000 * 2,
    dueDate: Date.now() + 86400000 * 6,
    tags: ["前端", "設計系統"],
  },

  // ── 已完成 ────────────────────────────────────────────────
  {
    id: "3",
    boardId: DEFAULT_BOARD_ID,
    title: "建立前端框架",
    description: "使用 React + TypeScript + Vite 建立基本專案結構，整合 Ant Design 與 Redux Toolkit。",
    status: "done",
    priority: 2,
    createdAt: Date.now() - 86400000 * 10,
    dueDate: Date.now() - 86400000 * 3,
    completedAt: Date.now() - 86400000 * 3,
    tags: ["前端"],
  },
  {
    id: "11",
    boardId: DEFAULT_BOARD_ID,
    title: "環境建置與部署設定",
    description: "設定開發、測試、正式三套環境的環境變數、Docker Compose 及 Nginx 設定檔。",
    status: "done",
    priority: 1,
    createdAt: Date.now() - 86400000 * 14,
    dueDate: Date.now() - 86400000 * 7,
    completedAt: Date.now() - 86400000 * 7,
    tags: ["DevOps", "基礎設施"],
    subtasks: [
      { id: "s14", title: "建立 Docker Compose", done: true },
      { id: "s15", title: "設定 Nginx 反向代理", done: true },
      { id: "s16", title: "設定環境變數管理", done: true },
    ],
  },
  {
    id: "12",
    boardId: DEFAULT_BOARD_ID,
    title: "原型設計與 UX 審查",
    description: "完成高保真 Figma 原型，通過內部 UX 審查並取得設計確認。",
    status: "done",
    priority: 2,
    createdAt: Date.now() - 86400000 * 20,
    dueDate: Date.now() - 86400000 * 10,
    completedAt: Date.now() - 86400000 * 10,
    tags: ["設計", "UX"],
  },
];

interface TaskState {
  tasks: TaskData[];
  past: TaskData[][];
  future: TaskData[][];
  loading: boolean;
  error: string | null;
}

const initialState: TaskState = {
  tasks: loadTasksFromLocalStorage(),
  past: [],
  future: [],
  loading: false,
  error: null,
};

const snapshot = (state: TaskState) => {
  state.past.push(current(state.tasks));
  if (state.past.length > MAX_HISTORY) state.past.shift();
  state.future = [];
};

const persist = (state: TaskState) => {
  localStorage.setItem("taskSchedulerTasks_v2", JSON.stringify(state.tasks));
};

export const taskSlice = createSlice({
  name: "tasks",
  initialState,
  reducers: {
    addTask: (
      state,
      action: PayloadAction<Omit<TaskData, "id" | "createdAt">>
    ) => {
      snapshot(state);
      const newTask: TaskData = {
        ...action.payload,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      };
      state.tasks.push(newTask);
      persist(state);
    },
    updateTask: (state, action: PayloadAction<TaskData>) => {
      const index = state.tasks.findIndex((t) => t.id === action.payload.id);
      if (index !== -1) {
        snapshot(state);
        const prevTask = state.tasks[index];
        const newStatus = action.payload.status;

        let completedAt = prevTask.completedAt;
        if (newStatus === "done" && prevTask.status !== "done") {
          completedAt = Date.now();
        } else if (newStatus !== "done") {
          completedAt = undefined;
        }

        state.tasks[index] = { ...action.payload, completedAt };
        persist(state);
      }
    },
    deleteTask: (state, action: PayloadAction<string>) => {
      snapshot(state);
      state.tasks = state.tasks.filter((t) => t.id !== action.payload);
      persist(state);
    },
    updateTaskStatus: (
      state,
      action: PayloadAction<{ id: string; status: TaskStatus }>
    ) => {
      const task = state.tasks.find((t) => t.id === action.payload.id);
      if (task) {
        snapshot(state);
        const prevStatus = task.status;
        task.status = action.payload.status;

        if (action.payload.status === "done" && prevStatus !== "done") {
          task.completedAt = Date.now();
        } else if (action.payload.status !== "done" && prevStatus === "done") {
          task.completedAt = undefined;
        }
        persist(state);
      }
    },
    importTasks: (state, action: PayloadAction<TaskData[]>) => {
      snapshot(state);
      state.tasks = action.payload;
      persist(state);
    },
    reorderTask: (
      state,
      action: PayloadAction<{ status: TaskStatus; orderedIds: string[] }>
    ) => {
      snapshot(state);
      const { status, orderedIds } = action.payload;
      const otherTasks = state.tasks.filter((t) => t.status !== status);
      const statusTasks = state.tasks.filter((t) => t.status === status);

      const orderedIdSet = new Set(orderedIds);
      const hiddenTasks = statusTasks.filter((t) => !orderedIdSet.has(t.id));
      const taskMap = new Map(statusTasks.map((t) => [t.id, t]));
      const reordered = orderedIds
        .map((id) => taskMap.get(id))
        .filter((t): t is TaskData => t !== undefined);

      state.tasks = [...otherTasks, ...reordered, ...hiddenTasks];
      persist(state);
    },
    batchDeleteTasks: (state, action: PayloadAction<string[]>) => {
      snapshot(state);
      const ids = new Set(action.payload);
      state.tasks = state.tasks.filter((t) => !ids.has(t.id));
      persist(state);
    },
    batchUpdateStatus: (
      state,
      action: PayloadAction<{ ids: string[]; status: TaskStatus }>
    ) => {
      snapshot(state);
      const { ids, status } = action.payload;
      const idSet = new Set(ids);
      state.tasks = state.tasks.map((t) => {
        if (!idSet.has(t.id)) return t;
        let completedAt = t.completedAt;
        if (status === "done" && t.status !== "done") completedAt = Date.now();
        else if (status !== "done") completedAt = undefined;
        return { ...t, status, completedAt };
      });
      persist(state);
    },
    deleteTasksByBoard: (state, action: PayloadAction<string>) => {
      snapshot(state);
      state.tasks = state.tasks.filter((t) => t.boardId !== action.payload);
      persist(state);
    },
    undo: (state) => {
      if (state.past.length === 0) return;
      const previous = state.past.pop()!;
      state.future.unshift(current(state.tasks));
      state.tasks = previous;
      persist(state);
    },
    redo: (state) => {
      if (state.future.length === 0) return;
      const next = state.future.shift()!;
      state.past.push(current(state.tasks));
      state.tasks = next;
      persist(state);
    },
  },
});

export const {
  addTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  importTasks,
  reorderTask,
  batchDeleteTasks,
  batchUpdateStatus,
  deleteTasksByBoard,
  undo,
  redo,
} = taskSlice.actions;

export default taskSlice.reducer;
