// Board business logic. ensureDefaultBoard gives a user with no boards an empty 「我的看板」
// (position POSITION_STEP); users who already have any board are left untouched. Called from the
// Better Auth user-create hook so the first sign-in lands on a usable board (spec §8).
import { eq } from 'drizzle-orm';
import { POSITION_STEP } from '@/lib/position';
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
