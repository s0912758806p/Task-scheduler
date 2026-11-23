// Board business logic (spec §7). Every function takes (db, userId, …); a board that does not exist
// or belongs to someone else (or a non-UUID id) is ApiError 404 NOT_FOUND, never 403.
// listBoards calls ensureDefaultBoard first (fallback if the sign-up hook failed), then returns the
// user's boards by position with openCount = non-deleted, non-done tasks. createBoard appends at
// last position + POSITION_STEP. deleteBoard hard-deletes (tasks cascade) inside a transaction that
// locks the user's boards, and refuses the last board with 409 LAST_BOARD.
// ensureDefaultBoard gives a user with no boards an empty 「我的看板」
// (position POSITION_STEP); users who already have any board are left untouched. Called from the
// Better Auth user-create hook so the first sign-in lands on a usable board (spec §8).
import { and, asc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { POSITION_STEP } from '@/lib/position';
import type { Board } from '@/lib/types';
import type { boardCreate, boardUpdate } from '@/lib/validation';
import { ApiError } from '@/server/errors';
import type { DB } from '@/server/db';
import { boards } from '@/server/db/schema';

export const DEFAULT_BOARD_NAME = '我的看板';

export async function ensureDefaultBoard(db: DB, userId: string): Promise<void> {
  const existing = await db
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.userId, userId))
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(boards).values({ userId, name: DEFAULT_BOARD_NAME, position: POSITION_STEP });
}

export type BoardCreateInput = z.infer<typeof boardCreate>;
export type BoardUpdateInput = z.infer<typeof boardUpdate>;

const notFound = () => new ApiError(404, 'NOT_FOUND', '找不到這個看板');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

// Raw qualified names: drizzle drops the table qualifier of interpolated columns inside a select.
const openCount = sql<number>`(
  select count(*)::int from "tasks"
  where "tasks"."board_id" = "boards"."id" and "tasks"."deleted_at" is null and "tasks"."status" <> 'done'
)`;

function selectBoards(db: DB) {
  return db
    .select({
      id: boards.id,
      name: boards.name,
      position: boards.position,
      createdAt: boards.createdAt,
      openCount,
    })
    .from(boards);
}

type Row = Awaited<ReturnType<ReturnType<typeof selectBoards>['limit']>>[number];
const toBoard = (r: Row): Board => ({ ...r, createdAt: r.createdAt.toISOString() });

async function getOwned(db: DB, userId: string, id: string): Promise<Board> {
  if (!isUuid(id)) throw notFound();
  const [row] = await selectBoards(db)
    .where(and(eq(boards.id, id), eq(boards.userId, userId)))
    .limit(1);
  if (!row) throw notFound();
  return toBoard(row);
}

export async function assertBoardOwned(db: DB, userId: string, boardId: string): Promise<void> {
  if (!isUuid(boardId)) throw notFound();
  const [row] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.userId, userId)))
    .limit(1);
  if (!row) throw notFound();
}

export async function listBoards(db: DB, userId: string): Promise<Board[]> {
  await ensureDefaultBoard(db, userId);
  const rows = await selectBoards(db)
    .where(eq(boards.userId, userId))
    .orderBy(asc(boards.position), asc(boards.createdAt));
  return rows.map(toBoard);
}

export async function createBoard(db: DB, userId: string, input: BoardCreateInput): Promise<Board> {
  const [last] = await db
    .select({ position: boards.position })
    .from(boards)
    .where(eq(boards.userId, userId))
    .orderBy(sql`${boards.position} desc`)
    .limit(1);
  const [row] = await db
    .insert(boards)
    .values({ userId, name: input.name, position: (last?.position ?? 0) + POSITION_STEP })
    .returning({ id: boards.id });
  return getOwned(db, userId, row.id);
}

export async function updateBoard(
  db: DB,
  userId: string,
  id: string,
  input: BoardUpdateInput,
): Promise<Board> {
  await assertBoardOwned(db, userId, id);
  const patch: { name?: string; position?: number } = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.position !== undefined) patch.position = input.position;
  await db
    .update(boards)
    .set(patch)
    .where(and(eq(boards.id, id), eq(boards.userId, userId)));
  return getOwned(db, userId, id);
}

export async function deleteBoard(db: DB, userId: string, id: string): Promise<void> {
  if (!isUuid(id)) throw notFound();
  await db.transaction(async (tx) => {
    // Lock the user's boards so two concurrent deletes cannot both pass the "not last" check.
    const owned = await tx
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.userId, userId))
      .for('update');
    if (!owned.some((b) => b.id === id)) throw notFound();
    if (owned.length <= 1) throw new ApiError(409, 'LAST_BOARD', '至少要保留一個看板');
    await tx.delete(boards).where(and(eq(boards.id, id), eq(boards.userId, userId)));
  });
}
