// Task business logic (spec §6.2, §7). Every function takes (db, userId, …); a task that does not
// exist, belongs to someone else, is soft-deleted (except for a restore) or has a non-UUID id is
// ApiError 404 NOT_FOUND, never 403.
// - toApiTask: DB row → API Task (`in_progress` ↔ `in-progress`, timestamps as ISO strings).
// - listTasks: the user's non-deleted tasks, optionally one board (`?boardId=` not owned → 404).
// - createTask: no position → top of its column; client id already taken → 409 DUPLICATE_ID;
//   created as done → completedAt = now.
// - updateTask: any field subset. Status entering done sets completedAt, leaving done clears it.
//   Status change without position → top of the target column. `position: null` → renumber the
//   target column and insert right after `insertAfterId` (null → top; not in that column → 400
//   INVALID_POSITION). `deletedAt: null` restores the user's soft-deleted task (other fields in
//   the same patch apply too).
// - Blocking (shared with the UI via taskQueries.openBlockers): a todo task with an open,
//   non-deleted prerequisite cannot leave todo → 409 TASK_BLOCKED with details.blockedBy. The
//   check uses the dependsOn after the patch; createTask applies it to tasks created outside todo.
// - dependsOn (create and update): every id must be a non-deleted task of the same user on the
//   same board (else 400 INVALID_DEPENDENCY); self-reference or a cycle (DFS over the board's
//   non-deleted tasks with the proposed edges) → 409 DEPENDENCY_CYCLE. Duplicate ids are dropped.
// - Writes run in a transaction that locks the board row, so dependency checks and renumbering
//   on one board are serialized.
// - softDeleteTask: sets deletedAt; already deleted → 404.
// - renumberColumn: re-spaces a column's non-deleted tasks by POSITION_STEP, keeping their order.
import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { positionBetween, renumber } from '@/lib/position';
import { indexById, openBlockers } from '@/lib/taskQueries';
import type { Priority, Task, TaskStatus } from '@/lib/types';
import type { TaskCreateInput, TaskUpdateInput } from '@/lib/validation';
import type { DB } from '@/server/db';
import { boards, tasks } from '@/server/db/schema';
import { ApiError } from '@/server/errors';
import { assertBoardOwned, isUuid } from '@/server/services/boards';

type Row = typeof tasks.$inferSelect;
type DbStatus = Row['status'];

const notFound = () => new ApiError(404, 'NOT_FOUND', '找不到這個任務');
const cycle = () => new ApiError(409, 'DEPENDENCY_CYCLE', '前置任務不能包含自己或形成循環');

const toDbStatus = (s: TaskStatus): DbStatus => (s === 'in-progress' ? 'in_progress' : s);
const toApiStatus = (s: DbStatus): TaskStatus => (s === 'in_progress' ? 'in-progress' : s);

export function toApiTask(row: Row): Task {
  return {
    id: row.id,
    boardId: row.boardId,
    title: row.title,
    description: row.description,
    status: toApiStatus(row.status),
    priority: row.priority as Priority,
    dueDate: row.dueDate,
    position: row.position,
    tags: row.tags,
    subtasks: row.subtasks,
    dependsOn: row.dependsOn,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTasks(
  db: DB,
  userId: string,
  opts: { boardId?: string } = {},
): Promise<Task[]> {
  const where = [eq(tasks.userId, userId), isNull(tasks.deletedAt)];
  if (opts.boardId !== undefined) {
    await assertBoardOwned(db, userId, opts.boardId);
    where.push(eq(tasks.boardId, opts.boardId));
  }
  const rows = await db
    .select()
    .from(tasks)
    .where(and(...where))
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
  return rows.map(toApiTask);
}

/** Serializes writes that read the board's task graph or column order. */
async function lockBoard(db: DB, boardId: string): Promise<void> {
  await db.select({ id: boards.id }).from(boards).where(eq(boards.id, boardId)).for('update');
}

const liveInColumn = (boardId: string, status: TaskStatus) =>
  and(eq(tasks.boardId, boardId), eq(tasks.status, toDbStatus(status)), isNull(tasks.deletedAt));

/** The board's non-deleted tasks by id — the graph for blocking and dependency checks. */
async function boardTasks(db: DB, userId: string, boardId: string): Promise<Map<string, Task>> {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.boardId, boardId), eq(tasks.userId, userId), isNull(tasks.deletedAt)));
  return indexById(rows.map(toApiTask));
}

function checkDependencies(taskId: string, dependsOn: string[], byId: Map<string, Task>): void {
  if (dependsOn.includes(taskId)) throw cycle();
  const invalid = dependsOn.filter((id) => !byId.has(id));
  if (invalid.length > 0) {
    throw new ApiError(400, 'INVALID_DEPENDENCY', '前置任務必須是同一個看板上未刪除的任務', {
      invalid,
    });
  }
  // A new cycle must pass through taskId: walk the prerequisites' prerequisites looking for it.
  const seen = new Set<string>();
  const stack = [...dependsOn];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === taskId) throw cycle();
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(byId.get(id)?.dependsOn ?? []));
  }
}

/** Throws TASK_BLOCKED if a todo task with these prerequisites may not leave todo. */
function assertCanLeaveTodo(task: Task, byId: Map<string, Task>): void {
  const blockers = openBlockers({ ...task, status: 'todo' }, byId);
  if (blockers.length > 0) {
    throw new ApiError(409, 'TASK_BLOCKED', '這個任務還在等待前置任務完成', {
      blockedBy: blockers.map((t) => t.id),
    });
  }
}

async function topPosition(db: DB, boardId: string, status: TaskStatus): Promise<number> {
  const [first] = await db
    .select({ position: tasks.position })
    .from(tasks)
    .where(liveInColumn(boardId, status))
    .orderBy(asc(tasks.position))
    .limit(1);
  return positionBetween(null, first?.position ?? null) ?? 0;
}

export async function renumberColumn(db: DB, boardId: string, status: TaskStatus): Promise<void> {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(liveInColumn(boardId, status))
    .orderBy(asc(tasks.position), asc(tasks.createdAt), asc(tasks.id));
  for (const { id, position } of renumber(rows.map((r) => r.id))) {
    await db.update(tasks).set({ position }).where(eq(tasks.id, id));
  }
}

/** Renumbers the target column, then returns the position right after `afterId` (null → top). */
async function insertPosition(
  db: DB,
  task: Row,
  status: TaskStatus,
  afterId: string | null,
): Promise<number> {
  await renumberColumn(db, task.boardId, status);
  const column = await db
    .select({ id: tasks.id, position: tasks.position })
    .from(tasks)
    .where(and(liveInColumn(task.boardId, status), ne(tasks.id, task.id)))
    .orderBy(asc(tasks.position));
  const at = afterId === null ? -1 : column.findIndex((t) => t.id === afterId);
  if (at === -1 && afterId !== null) {
    throw new ApiError(400, 'INVALID_POSITION', '插入位置的任務不在目標欄位中');
  }
  // Gaps are POSITION_STEP after renumbering, so positionBetween never asks for another renumber.
  return positionBetween(column[at]?.position ?? null, column[at + 1]?.position ?? null) ?? 0;
}

export async function createTask(db: DB, userId: string, input: TaskCreateInput): Promise<Task> {
  return db.transaction(async (tx) => {
    await assertBoardOwned(tx, userId, input.boardId);
    await lockBoard(tx, input.boardId);
    const duplicate = () => new ApiError(409, 'DUPLICATE_ID', '這個任務 id 已經存在');
    if (input.id !== undefined) {
      const [taken] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, input.id));
      if (taken) throw duplicate();
    }
    const id = input.id ?? randomUUID();
    const status = input.status ?? 'todo';
    const dependsOn = [...new Set(input.dependsOn ?? [])];
    const byId = await boardTasks(tx, userId, input.boardId);
    checkDependencies(id, dependsOn, byId);
    const [row] = await tx
      .insert(tasks)
      .values({
        id,
        userId,
        boardId: input.boardId,
        title: input.title,
        description: input.description,
        status: toDbStatus(status),
        priority: input.priority,
        dueDate: input.dueDate,
        tags: input.tags,
        subtasks: input.subtasks,
        dependsOn,
        position: input.position ?? (await topPosition(tx, input.boardId, status)),
        completedAt: status === 'done' ? new Date() : null,
      })
      .onConflictDoNothing({ target: tasks.id })
      .returning();
    if (!row) throw duplicate(); // lost a race with a concurrent insert of the same id
    // Checked on the inserted row (it rolls back on throw) so openBlockers sees a real Task.
    if (status !== 'todo') assertCanLeaveTodo(toApiTask(row), byId);
    return toApiTask(row);
  });
}

export async function updateTask(
  db: DB,
  userId: string,
  id: string,
  patch: TaskUpdateInput,
): Promise<Task> {
  if (!isUuid(id)) throw notFound();
  return db.transaction(async (tx) => {
    const owned = and(eq(tasks.id, id), eq(tasks.userId, userId));
    const [found] = await tx.select({ boardId: tasks.boardId }).from(tasks).where(owned);
    if (!found) throw notFound();
    await lockBoard(tx, found.boardId);
    const [row] = await tx.select().from(tasks).where(owned).for('update');
    if (!row || (row.deletedAt !== null && patch.deletedAt !== null)) throw notFound();

    const current = toApiTask(row);
    const byId = await boardTasks(tx, userId, row.boardId);
    const dependsOn = patch.dependsOn ? [...new Set(patch.dependsOn)] : current.dependsOn;
    if (patch.dependsOn) checkDependencies(id, dependsOn, byId);
    const status = patch.status ?? current.status;
    const statusChanged = status !== current.status;
    if (statusChanged && current.status === 'todo') assertCanLeaveTodo({ ...current, dependsOn }, byId);

    const set: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.priority !== undefined) set.priority = patch.priority;
    if (patch.dueDate !== undefined) set.dueDate = patch.dueDate;
    if (patch.tags !== undefined) set.tags = patch.tags;
    if (patch.subtasks !== undefined) set.subtasks = patch.subtasks;
    if (patch.dependsOn !== undefined) set.dependsOn = dependsOn;
    if (patch.deletedAt === null) set.deletedAt = null;
    if (statusChanged) {
      set.status = toDbStatus(status);
      set.completedAt = status === 'done' ? new Date() : null;
    }
    if (patch.position === null) {
      set.position = await insertPosition(tx, row, status, patch.insertAfterId ?? null);
    } else if (patch.position !== undefined) {
      set.position = patch.position;
    } else if (statusChanged) {
      set.position = await topPosition(tx, row.boardId, status);
    }

    const [updated] = await tx.update(tasks).set(set).where(owned).returning();
    return toApiTask(updated);
  });
}

export async function softDeleteTask(db: DB, userId: string, id: string): Promise<void> {
  if (!isUuid(id)) throw notFound();
  const rows = await db
    .update(tasks)
    .set({ deletedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .returning({ id: tasks.id });
  if (rows.length === 0) throw notFound();
}
