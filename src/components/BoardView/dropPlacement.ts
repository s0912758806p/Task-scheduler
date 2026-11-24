// What a card drop means (spec §9 「拖曳」). Pure, so the rules are testable without a DnD engine.
// - dropPlacement(dragged, column, index): `column` is the destination column as displayed (it may
//   still contain the dragged card in a same-column reorder) and `index` the drop index the DnD
//   library reports. The dragged card is removed first; its neighbours are then column[index - 1]
//   and column[index]; position = positionBetween(prev, next). When the gap is exhausted the server
//   must renumber: position null + insertAfterId = prev (null → top). insertAfterId is always prev.
// - resolveDrop(...): 'none' for a drop on its own spot, or a same-column drop while sort ≠ 手動
//   (reordering is off then); 'blocked' for a blocked todo dropped on another column (nothing is
//   sent; the caller toasts); otherwise 'move' with the placement — in the displayed column, or at
//   the top of the target column's manual order when sort ≠ 手動.
import { positionBetween } from '@/lib/position';
import { columnTasks, isBlocked, type SortKey } from '@/lib/taskQueries';
import type { Task, TaskStatus } from '@/lib/types';

export interface Placement {
  position: number | null;
  insertAfterId: string | null;
}

export function dropPlacement(dragged: Task, column: Task[], index: number): Placement {
  const rest = column.filter((t) => t.id !== dragged.id);
  const prev = rest[index - 1];
  const next = rest[index];
  return {
    position: positionBetween(prev?.position ?? null, next?.position ?? null),
    insertAfterId: prev?.id ?? null,
  };
}

export type DropAction =
  | { kind: 'none' }
  | { kind: 'blocked' }
  | ({ kind: 'move'; status: TaskStatus } & Placement);

export interface DropInput {
  task: Task;
  sourceIndex: number;
  to: TaskStatus;
  index: number;
  sort: SortKey;
  /** The board's columns as displayed (filtered and sorted). */
  visible: Record<TaskStatus, Task[]>;
  /** All of the board's tasks (unfiltered). */
  boardTasks: Task[];
  byId: Map<string, Task>;
}

export function resolveDrop({ task, sourceIndex, to, index, sort, visible, boardTasks, byId }: DropInput): DropAction {
  if (to === task.status) {
    if (sort !== 'manual' || index === sourceIndex) return { kind: 'none' };
    return { kind: 'move', status: to, ...dropPlacement(task, visible[to], index) };
  }
  if (isBlocked(task, byId)) return { kind: 'blocked' };
  const placement =
    sort === 'manual' ? dropPlacement(task, visible[to], index) : dropPlacement(task, columnTasks(boardTasks, to), 0);
  return { kind: 'move', status: to, ...placement };
}
