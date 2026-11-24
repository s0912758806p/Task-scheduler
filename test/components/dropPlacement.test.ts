import { describe, expect, it } from 'vitest';
import { dropPlacement, resolveDrop, type DropInput } from '@/components/BoardView/dropPlacement';
import { columnTasks, indexById } from '@/lib/taskQueries';
import type { Task, TaskStatus } from '@/lib/types';
import { sampleTasksAsTasks } from '../fixtures/tasks';

const [a, b, c] = sampleTasksAsTasks().slice(0, 3); // positions 1024, 2048, 3072
const at = (t: Task, position: number): Task => ({ ...t, position });

describe('dropPlacement', () => {
  it('drops between the neighbours at the destination index, after removing the dragged card', () => {
    // column [a, b, c]; drag a down to index 1 → between b and c
    expect(dropPlacement(a, [a, b, c], 1)).toEqual({ position: (2048 + 3072) / 2, insertAfterId: b.id });
  });

  it('drops at the top and at the bottom of a column', () => {
    expect(dropPlacement(c, [a, b], 0)).toEqual({ position: 0, insertAfterId: null });
    expect(dropPlacement(a, [b, c], 2)).toEqual({ position: 3072 + 1024, insertAfterId: c.id });
  });

  it('drops into an empty column at position 0', () => {
    expect(dropPlacement(a, [], 0)).toEqual({ position: 0, insertAfterId: null });
  });

  it('asks the server to renumber (position null) when the gap is exhausted', () => {
    const tight = [at(a, 1), at(b, 1 + 1e-7)];
    expect(dropPlacement(c, tight, 1)).toEqual({ position: null, insertAfterId: a.id });
  });
});

describe('resolveDrop', () => {
  const board = sampleTasksAsTasks();
  const byId = indexById(board);
  const visible = Object.fromEntries(
    (['todo', 'in-progress', 'done'] as TaskStatus[]).map((s) => [s, columnTasks(board, s)]),
  ) as Record<TaskStatus, Task[]>;
  const find = (title: string) => board.find((t) => t.title === title)!;
  const input = (task: Task, over: Partial<DropInput>): DropInput => ({
    task,
    sourceIndex: visible[task.status].indexOf(task),
    to: task.status,
    index: 0,
    sort: 'manual',
    visible,
    boardTasks: board,
    byId,
    ...over,
  });
  const ci = find('建立 CI/CD 流程'); // todo, blocked by 撰寫 API 規格文件
  const api = find('撰寫 API 規格文件');
  const db = find('設計資料庫結構'); // first card of in-progress (position 6 * 1024)

  it('a drop on its own spot does nothing', () => {
    expect(resolveDrop(input(api, { index: visible.todo.indexOf(api) }))).toEqual({ kind: 'none' });
  });

  it('a blocked todo dropped on another column is refused without a placement', () => {
    expect(resolveDrop(input(ci, { to: 'in-progress', index: 0 }))).toEqual({ kind: 'blocked' });
    expect(resolveDrop(input(ci, { to: 'done', index: 0 }))).toEqual({ kind: 'blocked' });
  });

  it('a blocked todo can still be reordered inside 待處理', () => {
    expect(resolveDrop(input(ci, { index: 0 }))).toEqual({
      kind: 'move',
      status: 'todo',
      position: visible.todo[0].position - 1024,
      insertAfterId: null,
    });
  });

  it('a cross-column drop lands between the displayed neighbours', () => {
    const [first, second] = visible['in-progress'];
    expect(resolveDrop(input(api, { to: 'in-progress', index: 1 }))).toEqual({
      kind: 'move',
      status: 'in-progress',
      position: (first.position + second.position) / 2,
      insertAfterId: first.id,
    });
  });

  it('with sort ≠ 手動: same-column drops do nothing, cross-column drops go to the top', () => {
    expect(resolveDrop(input(api, { index: 3, sort: 'priority' }))).toEqual({ kind: 'none' });
    expect(resolveDrop(input(api, { to: 'in-progress', index: 2, sort: 'dueDate' }))).toEqual({
      kind: 'move',
      status: 'in-progress',
      position: db.position - 1024,
      insertAfterId: null,
    });
  });
});
