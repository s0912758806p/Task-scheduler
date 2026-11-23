// Pure task queries shared by the board, Today-focus and command palette. Everything here
// is derived from the cached task list; "today" is always passed in (never computed here).
// Semantics:
//  - blocked = status `todo` with at least one prerequisite that is present in `byId`
//    (i.e. not soft-deleted) and not done.
//  - chips (overdue / today / urgent / blocked) never match done tasks.
//  - dueRange: `week` = today..today+7, `future` = beyond; any range but `all` drops tasks
//    without a dueDate. dueRange does NOT exclude done tasks.
//  - `tags` filter keeps tasks that carry every selected tag.
//  - sortTasks never mutates its input.
import { diffDays } from './dates';
import type { Priority, Task, TaskStatus } from './types';

export type ChipKey = 'overdue' | 'today' | 'urgent' | 'blocked';
export type SortKey = 'manual' | 'priority' | 'dueDate';
export interface TaskFilters {
  search: string;
  priority: Priority | null;
  dueRange: 'all' | 'overdue' | 'today' | 'week' | 'future';
  tags: string[];
  chip: ChipKey | null;
}

export const EMPTY_FILTERS: TaskFilters = {
  search: '',
  priority: null,
  dueRange: 'all',
  tags: [],
  chip: null,
};

export function indexById(tasks: Task[]): Map<string, Task> {
  return new Map(tasks.map((t) => [t.id, t]));
}

export function openBlockers(task: Task, byId: Map<string, Task>): Task[] {
  if (task.status !== 'todo') return [];
  const out: Task[] = [];
  for (const id of task.dependsOn) {
    const dep = byId.get(id);
    if (dep && dep.status !== 'done') out.push(dep);
  }
  return out;
}

export function isBlocked(task: Task, byId: Map<string, Task>): boolean {
  return openBlockers(task, byId).length > 0;
}

export function isOverdue(task: Task, today: string): boolean {
  return task.status !== 'done' && task.dueDate !== null && task.dueDate < today;
}

export function isDueToday(task: Task, today: string): boolean {
  return task.status !== 'done' && task.dueDate === today;
}

export function matchesChip(task: Task, chip: ChipKey, byId: Map<string, Task>, today: string): boolean {
  if (task.status === 'done') return false;
  switch (chip) {
    case 'overdue':
      return isOverdue(task, today);
    case 'today':
      return isDueToday(task, today);
    case 'urgent':
      return task.priority === 0;
    case 'blocked':
      return isBlocked(task, byId);
  }
}

function matchesDueRange(task: Task, range: TaskFilters['dueRange'], today: string): boolean {
  if (range === 'all') return true;
  if (task.dueDate === null) return false;
  const diff = diffDays(task.dueDate, today);
  switch (range) {
    case 'overdue':
      return diff < 0;
    case 'today':
      return diff === 0;
    case 'week':
      return diff >= 0 && diff <= 7;
    case 'future':
      return diff > 7;
  }
}

export function filterTasks(tasks: Task[], f: TaskFilters, byId: Map<string, Task>, today: string): Task[] {
  const q = f.search.trim().toLowerCase();
  return tasks.filter((t) => {
    if (q) {
      const hay = [t.title, t.description ?? '', ...t.tags].join('\n').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.priority !== null && t.priority !== f.priority) return false;
    if (!matchesDueRange(t, f.dueRange, today)) return false;
    if (f.tags.length > 0 && !f.tags.every((tag) => t.tags.includes(tag))) return false;
    if (f.chip && !matchesChip(t, f.chip, byId, today)) return false;
    return true;
  });
}

function compareDue(a: Task, b: Task): number {
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
}

export function sortTasks(tasks: Task[], sort: SortKey): Task[] {
  const copy = [...tasks];
  switch (sort) {
    case 'priority':
      return copy.sort((a, b) => a.priority - b.priority || a.position - b.position);
    case 'dueDate':
      return copy.sort((a, b) => compareDue(a, b) || a.position - b.position);
    case 'manual':
      return copy.sort((a, b) => a.position - b.position);
  }
}

export function columnTasks(tasks: Task[], status: TaskStatus): Task[] {
  return sortTasks(
    tasks.filter((t) => t.status === status),
    'manual',
  );
}

export function boardStats(tasks: Task[], byId: Map<string, Task>, today: string) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const chips: Record<ChipKey, number> = { overdue: 0, today: 0, urgent: 0, blocked: 0 };
  for (const t of tasks) {
    for (const key of Object.keys(chips) as ChipKey[]) {
      if (matchesChip(t, key, byId, today)) chips[key]++;
    }
  }
  return { total, done, pct: total === 0 ? 0 : Math.round((done / total) * 100), chips };
}

export interface FocusGroups {
  overdue: Task[];
  today: Task[];
  week: Task[];
  blocked: Task[];
}

function byDueThenPriority(a: Task, b: Task): number {
  return compareDue(a, b) || a.priority - b.priority || a.position - b.position;
}

export function focusGroups(tasks: Task[], byId: Map<string, Task>, today: string): FocusGroups {
  const open = tasks.filter((t) => t.status !== 'done');
  const pick = (fn: (t: Task) => boolean) => open.filter(fn).sort(byDueThenPriority);
  return {
    overdue: pick((t) => isOverdue(t, today)),
    today: pick((t) => isDueToday(t, today)),
    week: pick((t) => {
      if (t.dueDate === null || isBlocked(t, byId)) return false;
      const diff = diffDays(t.dueDate, today);
      return diff >= 1 && diff <= 7;
    }),
    blocked: pick((t) => isBlocked(t, byId)),
  };
}

function highestPriority(list: Task[]): Task | null {
  let best: Task | null = null;
  for (const t of list) {
    if (best === null || t.priority < best.priority || (t.priority === best.priority && compareDue(t, best) < 0)) {
      best = t;
    }
  }
  return best;
}

export function pickSuggestion(g: FocusGroups): Task | null {
  return highestPriority(g.overdue) ?? highestPriority(g.today);
}

export function completedWithin(tasks: Task[], days: number, now: Date): number {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return tasks.filter(
    (t) => t.status === 'done' && t.completedAt !== null && new Date(t.completedAt).getTime() >= cutoff,
  ).length;
}
