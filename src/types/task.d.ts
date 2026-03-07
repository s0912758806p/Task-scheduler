export type TaskStatus = "todo" | "in-progress" | "done";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskData {
  id: string;
  boardId: string;
  dependsOn?: string[]; // 前置任務 id 清單
  title: string;
  description?: string;
  status: TaskStatus;
  priority: number; // 0 = highest, 1 = high, 2 = medium, 3 = low
  createdAt: number;
  dueDate?: number;
  completedAt?: number;
  tags?: string[];
  subtasks?: Subtask[];
}

export interface Board {
  id: string;
  name: string;
  createdAt: number;
}
