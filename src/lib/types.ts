// Shared domain types for the Next.js app. API uses 'in-progress'; DB enum uses 'in_progress'
// (converted once in the service layer).
export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type Priority = 0 | 1 | 2 | 3; // 0 urgent, 1 high, 2 medium, 3 low

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  boardId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null; // YYYY-MM-DD
  position: number;
  tags: string[];
  subtasks: Subtask[];
  dependsOn: string[];
  completedAt: string | null; // ISO timestamp
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface Board {
  id: string;
  name: string;
  position: number;
  createdAt: string;
  openCount: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
