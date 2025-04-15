export type TaskStatus = "todo" | "in-progress" | "done";

export interface TaskData {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: number; // 0 = highest, 1 = high, 2 = medium, 3 = low
  createdAt: number;
  dueDate?: number;
}