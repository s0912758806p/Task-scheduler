import { addDays } from '@/lib/dates';
import { SAMPLE_TASKS } from '@/lib/sampleTasks';
import type { Task } from '@/lib/types';

export const TODAY = '2026-11-23';
export const BOARD_ID = 'board-main';

/** SAMPLE_TASKS as Task[]: ids sample-1…sample-11, position (i+1)*1024, dates relative to `today`. */
export function sampleTasksAsTasks(today: string = TODAY, boardId: string = BOARD_ID): Task[] {
  const idByTitle = new Map(SAMPLE_TASKS.map((s, i) => [s.title, `sample-${i + 1}`]));
  return SAMPLE_TASKS.map((s, i) => {
    const [y, m, d] = (s.completedInDays === null ? today : addDays(today, s.completedInDays))
      .split('-')
      .map(Number);
    return {
      id: `sample-${i + 1}`,
      boardId,
      title: s.title,
      description: s.description,
      status: s.status,
      priority: s.priority,
      dueDate: s.dueInDays === null ? null : addDays(today, s.dueInDays),
      position: (i + 1) * 1024,
      tags: [...s.tags],
      subtasks: s.subtasks.map((st, j) => ({ id: `sample-${i + 1}-sub-${j + 1}`, ...st })),
      dependsOn: (s.dependsOnTitles ?? []).map((t) => idByTitle.get(t)!),
      completedAt: s.completedInDays === null ? null : new Date(y, m - 1, d, 12, 0, 0).toISOString(),
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
  });
}
