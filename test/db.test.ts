import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { boards, tasks, user } from '@/server/db/schema';
import type { DB } from '@/server/db';
import { createTestDb, seedUser } from './helpers/db';

describe('test database', () => {
  let db: DB;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('applies column defaults to a freshly inserted task', async () => {
    const u = await seedUser(db);
    const [board] = await db
      .insert(boards)
      .values({ userId: u.id, name: 'Inbox', position: 1 })
      .returning();
    const [task] = await db
      .insert(tasks)
      .values({ userId: u.id, boardId: board.id, title: 'Write tests', position: 1 })
      .returning();

    expect(task.tags).toEqual([]);
    expect(task.subtasks).toEqual([]);
    expect(task.dependsOn).toEqual([]);
    expect(task.status).toBe('todo');
    expect(task.priority).toBe(2);
    expect(task.deletedAt).toBeNull();
  });

  it('cascades user deletion to boards and tasks', async () => {
    const u = await seedUser(db);
    const [board] = await db
      .insert(boards)
      .values({ userId: u.id, name: 'Inbox', position: 1 })
      .returning();
    await db
      .insert(tasks)
      .values({ userId: u.id, boardId: board.id, title: 'Doomed', position: 1 });

    await db.delete(user).where(eq(user.id, u.id));

    expect(await db.select().from(boards)).toHaveLength(0);
    expect(await db.select().from(tasks)).toHaveLength(0);
  });
});
