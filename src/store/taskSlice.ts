import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { TaskData, TaskStatus } from "../types/task";

// 載入本地儲存的任務資料
const loadTasksFromLocalStorage = (): TaskData[] => {
  try {
    const savedTasks = localStorage.getItem("taskSchedulerTasks");
    if (savedTasks) {
      return JSON.parse(savedTasks);
    }
  } catch (error) {
    console.error("Error loading tasks from localStorage:", error);
  }

  // 沒有本地儲存資料時，使用預設任務資料
  return mockTasks;
};

// Mock data
const mockTasks: TaskData[] = [
  {
    id: "1",
    title: "完成專案需求分析",
    description: "分析並整理客戶需求文件",
    status: "todo",
    priority: 0,
    createdAt: Date.now() - 86400000 * 2,
    dueDate: Date.now() + 86400000 * 3,
  },
  {
    id: "2",
    title: "設計資料庫結構",
    description: "設計專案所需的資料庫架構",
    status: "in-progress",
    priority: 1,
    createdAt: Date.now() - 86400000,
    dueDate: Date.now() + 86400000 * 5,
  },
  {
    id: "3",
    title: "建立前端框架",
    description: "使用 React 和 Ant Design 建立基本 UI 框架",
    status: "done",
    priority: 2,
    createdAt: Date.now() - 86400000 * 3,
    dueDate: Date.now() - 86400000,
  },
  {
    id: "4",
    title: "撰寫測試案例",
    description: "為核心功能撰寫單元測試",
    status: "todo",
    priority: 2,
    createdAt: Date.now() - 86400000 * 1,
    dueDate: Date.now() + 86400000 * 7,
  },
  {
    id: "5",
    title: "建立 CI/CD 流程",
    description: "設定自動化部署和測試流程",
    status: "todo",
    priority: 3,
    createdAt: Date.now(),
    dueDate: Date.now() + 86400000 * 10,
  },
];

interface TaskState {
  tasks: TaskData[];
  loading: boolean;
  error: string | null;
}

const initialState: TaskState = {
  tasks: loadTasksFromLocalStorage(),
  loading: false,
  error: null,
};

export const taskSlice = createSlice({
  name: "tasks",
  initialState,
  reducers: {
    addTask: (
      state,
      action: PayloadAction<Omit<TaskData, "id" | "createdAt">>
    ) => {
      const newTask: TaskData = {
        ...action.payload,
        id: Date.now().toString(),
        createdAt: Date.now(),
      };
      state.tasks.push(newTask);

      // 儲存更新的任務到本地儲存
      localStorage.setItem("taskSchedulerTasks", JSON.stringify(state.tasks));
    },
    updateTask: (state, action: PayloadAction<TaskData>) => {
      const index = state.tasks.findIndex(
        (task) => task.id === action.payload.id
      );
      if (index !== -1) {
        state.tasks[index] = action.payload;

        // 儲存更新的任務到本地儲存
        localStorage.setItem("taskSchedulerTasks", JSON.stringify(state.tasks));
      }
    },
    deleteTask: (state, action: PayloadAction<string>) => {
      state.tasks = state.tasks.filter((task) => task.id !== action.payload);

      // 儲存更新的任務到本地儲存
      localStorage.setItem("taskSchedulerTasks", JSON.stringify(state.tasks));
    },
    updateTaskStatus: (
      state,
      action: PayloadAction<{ id: string; status: TaskStatus }>
    ) => {
      const task = state.tasks.find((task) => task.id === action.payload.id);
      if (task) {
        task.status = action.payload.status;

        // 儲存更新的任務到本地儲存
        localStorage.setItem("taskSchedulerTasks", JSON.stringify(state.tasks));
      }
    },
    importTasks: (state, action: PayloadAction<TaskData[]>) => {
      state.tasks = action.payload;

      // 儲存更新的任務到本地儲存
      localStorage.setItem("taskSchedulerTasks", JSON.stringify(state.tasks));
    },
  },
});

export const {
  addTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  importTasks,
} = taskSlice.actions;

export default taskSlice.reducer;
