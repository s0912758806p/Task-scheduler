import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUser } from '@/server/auth';
import type { DB } from '@/server/db';
import { boards, tasks, user } from '@/server/db/schema';
import { ApiError } from '@/server/errors';
import { ensureDefaultBoard } from '@/server/services/boards';
import { closeTestDb, createTestDb, seedUser } from '../helpers/db';
import { call } from '../helpers/route';
import { POST } from '../../app/api/tasks/batch/route';

const h = vi.hoisted(() => ({ db: undefined as unknown as DB }));
vi.mock('@/server/auth', () => ({ requireUser: vi.fn() }));
vi.mock('@/server/db', () => ({ getDb: () => h.db }));

type U = { id: string; email: string };
function loginAs(u: U) {
  vi.mocked(requireUser).mockResolvedValue({ id: u.id, email: u.email, name: 'x', image: null });
}

let a: U;
let b: U;
let aBoardId: string;
let aBoard2Id: string;
let bBoardId: string;

beforeAll(async () => {
  h.db = await createTestDb();
});
afterAll(async () => {
  await closeTestDb(h.db);
});
beforeEach(async () => {
  await h.db.delete(user);
  a = await seedUser(h.db);
  b = await seedUser(h.db);
  await ensureDefaultBoard(h.db, a.id);
  await ensureDefaultBoard(h.db, b.id);
  aBoardId = (await h.db.select().from(boards).where(eq(boards.userId, a.id)))[0].id;
  bBoardId = (await h.db.select().from(boards).where(eq(boards.userId, b.id)))[0].id;
  [{ id: aBoard2Id }] = await h.db
    .insert(boards)
    .values({ userId: a.id, name: '第二個', position: 2048 })
    .returning({ id: boards.id });
  loginAs(a);
});
afterEach(() => {
  vi.mocked(requireUser).mockReset();
});

const batch = (body: unknown) => call(POST, { method: 'POST', url: '/api/tasks/batch', body });
const dbRow = async (id: string) => (await h.db.select().from(tasks).where(eq(tasks.id, id)))[0];

async function mk(
  title: string,
  o: Partial<typeof tasks.$inferInsert> = {},
  owner: { u: U; boardId: string } = { u: a, boardId: aBoardId },
): Promise<string> {
  const [row] = await h.db
    .insert(tasks)
    .values({ userId: owner.u.id, boardId: owner.boardId, title, position: 0, ...o })
    .returning({ id: tasks.id });
  return row.id;
}

describe('POST /api/tasks/batch — move', () => {
  it('moves free tasks, skips the blocked one, and appends to the end of the target column', async () => {
    const existing = await mk('existing', { status: 'in_progress', position: 5000 });
    const prereq = await mk('prereq');
    const free1 = await mk('free1');
    const blocked = await mk('blocked', { dependsOn: [prereq] });
    const free2 = await mk('free2');
    const r = await batch({ ids: [free2, blocked, free1], op: 'move', status: 'in-progress' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ updated: [free2, free1], skipped: [{ id: blocked, reason: 'TASK_BLOCKED' }] });
    expect((await dbRow(blocked)).status).toBe('todo');
    const p = async (id: string) => (await dbRow(id)).position;
    expect(await p(free2)).toBeGreaterThan(await p(existing));
    expect(await p(free1)).toBeGreaterThan(await p(free2));
    expect((await dbRow(free1)).status).toBe('in_progress');
  });

  it('does not unblock a dependent when its prerequisite moves to done in the same batch', async () => {
    const prereq = await mk('prereq');
    const dep = await mk('dep', { dependsOn: [prereq] });
    const r = await batch({ ids: [dep, prereq], op: 'move', status: 'done' });
    expect(r.body.updated).toEqual([prereq]);
    expect(r.body.skipped).toEqual([{ id: dep, reason: 'TASK_BLOCKED' }]);
  });

  it('moves a task out of a non-todo column even if its prerequisite is open', async () => {
    const prereq = await mk('prereq');
    const t = await mk('t', { status: 'in_progress', dependsOn: [prereq] });
    const r = await batch({ ids: [t], op: 'move', status: 'done' });
    expect(r.body.updated).toEqual([t]);
  });

  it('sets and clears completedAt; tasks already in the target status count as updated and keep position', async () => {
    const t = await mk('t', { position: 77 });
    const doneAlready = await mk('d', { status: 'done', position: 42, completedAt: new Date('2026-01-01') });
    const r = await batch({ ids: [t, doneAlready], op: 'move', status: 'done' });
    expect(r.body.updated).toEqual([t, doneAlready]);
    expect((await dbRow(t)).completedAt).not.toBeNull();
    const same = await dbRow(doneAlready);
    expect(same.position).toBe(42);
    expect(same.completedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    await batch({ ids: [t], op: 'move', status: 'todo' });
    expect((await dbRow(t)).completedAt).toBeNull();
  });

  it('handles several boards, de-duplicates ids, and reports foreign, unknown and deleted ids as NOT_FOUND', async () => {
    const t1 = await mk('t1');
    const t2 = await mk('t2', {}, { u: a, boardId: aBoard2Id });
    const deleted = await mk('gone', { deletedAt: new Date() });
    const foreign = await mk('theirs', {}, { u: b, boardId: bBoardId });
    const unknown = crypto.randomUUID();
    const r = await batch({ ids: [t1, t2, t1, deleted, foreign, unknown], op: 'move', status: 'in-progress' });
    expect(r.status).toBe(200);
    expect(r.body.updated).toEqual([t1, t2]);
    expect(r.body.skipped).toEqual([
      { id: deleted, reason: 'NOT_FOUND' },
      { id: foreign, reason: 'NOT_FOUND' },
      { id: unknown, reason: 'NOT_FOUND' },
    ]);
    expect((await dbRow(foreign)).status).toBe('todo');
    expect((await dbRow(deleted)).status).toBe('todo');
  });
});

describe('POST /api/tasks/batch — delete / restore', () => {
  it('soft-deletes, then restores everything; both are idempotent', async () => {
    const t1 = await mk('t1');
    const t2 = await mk('t2', {}, { u: a, boardId: aBoard2Id });
    const del = await batch({ ids: [t1, t2], op: 'delete' });
    expect(del.body).toEqual({ updated: [t1, t2], skipped: [] });
    expect((await dbRow(t1)).deletedAt).not.toBeNull();
    expect((await batch({ ids: [t1], op: 'delete' })).body.updated).toEqual([t1]);
    const res = await batch({ ids: [t1, t2], op: 'restore' });
    expect(res.body).toEqual({ updated: [t1, t2], skipped: [] });
    expect((await dbRow(t1)).deletedAt).toBeNull();
    expect((await dbRow(t2)).deletedAt).toBeNull();
    expect((await batch({ ids: [t1], op: 'restore' })).body.updated).toEqual([t1]);
  });

  it('never touches or reveals another user’s tasks', async () => {
    const foreign = await mk('theirs', { deletedAt: new Date() }, { u: b, boardId: bBoardId });
    for (const op of ['delete', 'restore'] as const) {
      const r = await batch({ ids: [foreign], op });
      expect(r.body).toEqual({ updated: [], skipped: [{ id: foreign, reason: 'NOT_FOUND' }] });
    }
    expect((await dbRow(foreign)).deletedAt).not.toBeNull();
  });
});

describe('POST /api/tasks/batch — validation and auth', () => {
  it('400 on invalid bodies (move without status, empty ids, non-uuid)', async () => {
    expect((await batch({ ids: [crypto.randomUUID()], op: 'move' })).status).toBe(400);
    expect((await batch({ ids: [], op: 'delete' })).status).toBe(400);
    expect((await batch({ ids: ['nope'], op: 'delete' })).status).toBe(400);
  });

  it('401 when not logged in', async () => {
    vi.mocked(requireUser).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', '請先登入'));
    expect((await batch({ ids: [crypto.randomUUID()], op: 'delete' })).status).toBe(401);
  });
});
