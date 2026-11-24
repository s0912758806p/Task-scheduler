// Board export / import (spec §7). Every function takes (db, userId, …); someone else's, unknown or
// non-UUID board → 404 NOT_FOUND.
// - exportBoard: v2 file of the board's non-deleted tasks, ordered by status column (todo,
//   in-progress, done) then position, so a v2 import (which uses file order) reproduces the board.
//   dependsOn only lists ids that are part of the file.
// - importBoard: one transaction with the board row locked. The board's live tasks are soft-deleted
//   (their ids come back as `replaced`, for undo), the file's tasks are inserted with new ids,
//   positions per status column in file order (POSITION_STEP spacing), completedAt from the file
//   (a done task without one gets now). dependsOn is remapped by sourceId, unmapped ids are dropped
//   silently, edges that would close a cycle are dropped with a warning (「第 N 筆」 counts the
//   tasks that survived normalisation). Other boards are untouched.
// - importLocal: old localStorage data in one transaction. If the legacy data has a 'default'
//   board and the user has exactly one board with no tasks at all (deleted ones count), that board
//   receives the 'default' tasks; every other legacy board becomes a new board.
// - More than MAX_IMPORT_TASKS raw rows → 413 TOO_MANY_TASKS (counted before normalisation).
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { normalizeImportFile, normalizeLocalStorage, type ImportTask } from '@/lib/legacy';
import { POSITION_STEP } from '@/lib/position';
import type { Board, TaskStatus } from '@/lib/types';
import type { ExportV2 } from '@/lib/validation';
import type { DB } from '@/server/db';
import { boards, tasks } from '@/server/db/schema';
import { ApiError } from '@/server/errors';
import { assertBoardOwned, createBoard, listBoards } from '@/server/services/boards';
import { checkDependencies, lockBoard, toApiTask, toDbStatus } from '@/server/services/tasks';

export const MAX_IMPORT_TASKS = 2000;
const STATUS_ORDER: TaskStatus[] = ['todo', 'in-progress', 'done'];

type Result = { imported: string[]; replaced: string[]; warnings: string[] };

export async function exportBoard(db: DB, userId: string, boardId: string): Promise<ExportV2> {
  await assertBoardOwned(db, userId, boardId);
  const [board] = await db.select().from(boards).where(eq(boards.id, boardId));
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.boardId, boardId), eq(tasks.userId, userId), isNull(tasks.deletedAt)));
  const list = rows.map(toApiTask);
  const ids = new Set(list.map((t) => t.id));
  list.sort(
    (x, y) =>
      STATUS_ORDER.indexOf(x.status) - STATUS_ORDER.indexOf(y.status) ||
      x.position - y.position ||
      x.createdAt.localeCompare(y.createdAt),
  );
  return {
    format: 'task-scheduler',
    version: 2,
    exportedAt: new Date().toISOString(),
    board: { name: board.name },
    tasks: list.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? '',
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      tags: t.tags,
      subtasks: t.subtasks,
      dependsOn: t.dependsOn.filter((d) => ids.has(d)),
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      position: t.position,
    })),
  };
}

/** Raw row count of an import file (v2 `tasks` or legacy array); unrecognised shapes count 0. */
function rawTaskCount(file: unknown): number {
  if (Array.isArray(file)) return file.length;
  const t = (file as { tasks?: unknown } | null)?.tasks;
  return typeof file === 'object' && file !== null && Array.isArray(t) ? t.length : 0;
}

function assertWithinLimit(count: number): void {
  if (count > MAX_IMPORT_TASKS) {
    throw new ApiError(413, 'TOO_MANY_TASKS', `一次最多匯入 ${MAX_IMPORT_TASKS.toLocaleString('en-US')} 筆任務`);
  }
}

/** Inserts normalised tasks into a locked board; the caller has cleared the board's live tasks. */
async function insertTasks(
  tx: DB,
  userId: string,
  boardId: string,
  list: ImportTask[],
  warnings: string[],
): Promise<string[]> {
  const ids = list.map(() => randomUUID());
  const newId = new Map(list.map((t, i) => [t.sourceId, ids[i]]));
  const graph = new Map<string, { dependsOn: string[] }>(ids.map((id) => [id, { dependsOn: [] }]));
  list.forEach((t, i) => {
    for (const src of t.dependsOnSourceIds) {
      const dep = newId.get(src);
      if (dep === undefined) continue;
      try {
        checkDependencies(ids[i], [dep], graph);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'DEPENDENCY_CYCLE') {
          warnings.push(`第 ${i + 1} 筆：前置任務形成循環，已移除`);
          continue;
        }
        throw err;
      }
      graph.get(ids[i])!.dependsOn.push(dep);
    }
  });

  const next = new Map<TaskStatus, number>();
  const now = new Date();
  const values = list.map((t, i) => {
    const position = (next.get(t.status) ?? 0) + POSITION_STEP;
    next.set(t.status, position);
    return {
      id: ids[i],
      userId,
      boardId,
      title: t.title,
      description: t.description ?? '',
      status: toDbStatus(t.status),
      priority: t.priority,
      dueDate: t.dueDate,
      tags: t.tags,
      subtasks: t.subtasks,
      dependsOn: graph.get(ids[i])!.dependsOn,
      position,
      completedAt: t.status === 'done' ? (t.completedAt ? new Date(t.completedAt) : now) : null,
      createdAt: new Date(t.createdAt),
    };
  });
  if (values.length > 0) await tx.insert(tasks).values(values);
  return ids;
}

export async function importBoard(
  db: DB,
  userId: string,
  boardId: string,
  raw: unknown,
  timeZone: string,
): Promise<Result> {
  await assertBoardOwned(db, userId, boardId);
  assertWithinLimit(rawTaskCount(raw));
  const { tasks: list, warnings } = normalizeImportFile(raw, timeZone);
  return db.transaction(async (tx) => {
    await lockBoard(tx, boardId);
    const replaced = await tx
      .update(tasks)
      .set({ deletedAt: new Date() })
      .where(and(eq(tasks.boardId, boardId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .returning({ id: tasks.id });
    const imported = await insertTasks(tx, userId, boardId, list, warnings);
    return { imported, replaced: replaced.map((r) => r.id), warnings };
  });
}

export async function importLocal(
  db: DB,
  userId: string,
  raw: unknown,
  timeZone: string,
): Promise<{ boards: Board[]; taskCount: number; warnings: string[] }> {
  const { boards: bodyBoards, tasks: bodyTasks } = (raw ?? {}) as { boards?: unknown; tasks?: unknown };
  assertWithinLimit(Array.isArray(bodyTasks) ? bodyTasks.length : 0);
  const legacy = normalizeLocalStorage({ boards: bodyBoards, tasks: bodyTasks }, timeZone);

  const touched = await db.transaction(async (tx) => {
    // Serializes concurrent imports of the same user and the "one empty board" check below.
    const owned = await tx
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.userId, userId))
      .for('update');
    let reusable: string | null = null;
    if (owned.length === 1 && legacy.boards.some((b) => b.sourceId === 'default')) {
      const any = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(inArray(tasks.boardId, [owned[0].id]))
        .limit(1);
      if (any.length === 0) reusable = owned[0].id;
    }

    const ids: string[] = [];
    const warnings: string[] = [];
    let taskCount = 0;
    for (const b of legacy.boards) {
      const boardId =
        b.sourceId === 'default' && reusable !== null
          ? reusable
          : (await createBoard(tx, userId, { name: b.name })).id;
      await lockBoard(tx, boardId);
      const group = legacy.tasksByBoard[b.sourceId];
      warnings.push(...group.warnings);
      taskCount += (await insertTasks(tx, userId, boardId, group.tasks, warnings)).length;
      ids.push(boardId);
    }
    return { ids, taskCount, warnings };
  });

  const all = await listBoards(db, userId);
  return {
    boards: all.filter((b) => touched.ids.includes(b.id)),
    taskCount: touched.taskCount,
    warnings: touched.warnings,
  };
}
