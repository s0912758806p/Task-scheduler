import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/server/errors';
import { requireUser } from '@/server/auth';
import type { DB } from '@/server/db';
import { boards, tasks, user } from '@/server/db/schema';
import { ensureDefaultBoard } from '@/server/services/boards';
import { closeTestDb, createTestDb, seedUser } from '../helpers/db';
import { call } from '../helpers/route';
import { GET, POST } from '../../app/api/boards/route';
import { DELETE, PATCH } from '../../app/api/boards/[id]/route';

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
let bBoardId: string;

// One PGlite per file (migrating per test is slow); rows are wiped before each test.
beforeAll(async () => {
  h.db = await createTestDb();
});
afterAll(async () => {
  await closeTestDb(h.db);
});
beforeEach(async () => {
  await h.db.delete(user); // boards and tasks cascade
  a = await seedUser(h.db);
  b = await seedUser(h.db);
  loginAs(a);
  await ensureDefaultBoard(h.db, a.id);
  await ensureDefaultBoard(h.db, b.id);
  aBoardId = (await h.db.select().from(boards).where(eq(boards.userId, a.id)))[0].id;
  bBoardId = (await h.db.select().from(boards).where(eq(boards.userId, b.id)))[0].id;
});
afterEach(() => {
  vi.mocked(requireUser).mockReset();
});

const withId = (id: string) => ({ params: { id } });

describe('GET /api/boards', () => {
  it('creates the default board when the user has none, and is idempotent', async () => {
    const c = await seedUser(h.db);
    loginAs(c);
    const r1 = await call(GET, { method: 'GET', url: '/api/boards' });
    expect(r1.status).toBe(200);
    expect(r1.body).toHaveLength(1);
    expect(r1.body[0]).toMatchObject({ name: '我的看板', openCount: 0 });
    const r2 = await call(GET, { method: 'GET', url: '/api/boards' });
    expect(r2.body).toHaveLength(1);
  });

  it('counts only non-deleted, non-done tasks, ordered by position', async () => {
    const mk = (status: 'todo' | 'in_progress' | 'done', deletedAt?: Date) => ({
      userId: a.id,
      boardId: aBoardId,
      title: 't',
      position: 1,
      status,
      deletedAt,
    });
    await h.db
      .insert(tasks)
      .values([mk('todo'), mk('in_progress'), mk('done'), mk('todo', new Date())]);
    const created = await call(POST, { method: 'POST', url: '/api/boards', body: { name: '個人專案' } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: '個人專案', openCount: 0 });

    const list = await call(GET, { method: 'GET', url: '/api/boards' });
    expect(list.body.map((x: { name: string }) => x.name)).toEqual(['我的看板', '個人專案']);
    expect(list.body.map((x: { openCount: number }) => x.openCount)).toEqual([2, 0]);
    expect(list.body[1].position).toBeGreaterThan(list.body[0].position);
    expect(typeof list.body[0].createdAt).toBe('string');
  });

  it("does not list another user's boards", async () => {
    const list = await call(GET, { method: 'GET', url: '/api/boards' });
    expect(list.body.map((x: { id: string }) => x.id)).toEqual([aBoardId]);
  });
});

describe('POST /api/boards', () => {
  it('rejects a 61-character name with 400', async () => {
    const r = await call(POST, { method: 'POST', url: '/api/boards', body: { name: 'x'.repeat(61) } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });
  it('accepts a 60-character name', async () => {
    const r = await call(POST, { method: 'POST', url: '/api/boards', body: { name: 'x'.repeat(60) } });
    expect(r.status).toBe(201);
  });
});

describe('PATCH /api/boards/:id', () => {
  it('renames and repositions own board', async () => {
    const r = await call(PATCH, {
      method: 'PATCH',
      url: `/api/boards/${aBoardId}`,
      ...withId(aBoardId),
      body: { name: '新名字', position: 5 },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: aBoardId, name: '新名字', position: 5, openCount: 0 });
  });

  it('rejects an empty patch and a too-long name with 400', async () => {
    const url = `/api/boards/${aBoardId}`;
    expect((await call(PATCH, { method: 'PATCH', url, ...withId(aBoardId), body: {} })).status).toBe(400);
    expect(
      (await call(PATCH, { method: 'PATCH', url, ...withId(aBoardId), body: { name: 'x'.repeat(61) } })).status,
    ).toBe(400);
  });

  it("user B cannot patch A's board: 404 and A's row is unchanged", async () => {
    loginAs(b);
    const r = await call(PATCH, {
      method: 'PATCH',
      url: `/api/boards/${aBoardId}`,
      ...withId(aBoardId),
      body: { name: 'hacked' },
    });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
    const [row] = await h.db.select().from(boards).where(eq(boards.id, aBoardId));
    expect(row.name).toBe('我的看板');
  });

  it('returns 404 (not 500) for a malformed id', async () => {
    const r = await call(PATCH, {
      method: 'PATCH',
      url: '/api/boards/nope',
      ...withId('nope'),
      body: { name: 'x' },
    });
    expect(r.status).toBe(404);
  });
});

describe('DELETE /api/boards/:id', () => {
  it("user B cannot delete A's board: 404, and A's board and tasks survive", async () => {
    await h.db.insert(tasks).values({ userId: a.id, boardId: aBoardId, title: 'keep', position: 1 });
    await call(POST, { method: 'POST', url: '/api/boards', body: { name: '第二個' } }); // A now has 2
    loginAs(b);
    const r = await call(DELETE, { method: 'DELETE', url: `/api/boards/${aBoardId}`, ...withId(aBoardId) });
    expect(r.status).toBe(404);
    expect(await h.db.select().from(boards).where(eq(boards.userId, a.id))).toHaveLength(2);
    expect(await h.db.select().from(tasks).where(eq(tasks.boardId, aBoardId))).toHaveLength(1);
    expect(await h.db.select().from(boards).where(eq(boards.id, bBoardId))).toHaveLength(1);
  });

  it("A's own delete is 204, hard-deletes the board and its tasks, and leaves B alone", async () => {
    await h.db.insert(tasks).values([
      { userId: a.id, boardId: aBoardId, title: 'gone', position: 1 },
      { userId: b.id, boardId: bBoardId, title: 'b-task', position: 1 },
    ]);
    const second = await call(POST, { method: 'POST', url: '/api/boards', body: { name: '第二個' } });
    const r = await call(DELETE, { method: 'DELETE', url: `/api/boards/${aBoardId}`, ...withId(aBoardId) });
    expect(r).toEqual({ status: 204, body: null });
    const left = await h.db.select().from(boards).where(eq(boards.userId, a.id));
    expect(left.map((x) => x.id)).toEqual([second.body.id]);
    expect(await h.db.select().from(tasks).where(eq(tasks.boardId, aBoardId))).toHaveLength(0);
    expect(await h.db.select().from(tasks).where(and(eq(tasks.userId, b.id)))).toHaveLength(1);
  });

  it('refuses to delete the last board with 409 LAST_BOARD', async () => {
    const r = await call(DELETE, { method: 'DELETE', url: `/api/boards/${aBoardId}`, ...withId(aBoardId) });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'LAST_BOARD', message: '至少要保留一個看板' });
    expect(await h.db.select().from(boards).where(eq(boards.id, aBoardId))).toHaveLength(1);
  });

  it('returns 404 for a well-formed but unknown id, and for a malformed id', async () => {
    const id = crypto.randomUUID();
    expect((await call(DELETE, { method: 'DELETE', url: `/api/boards/${id}`, ...withId(id) })).status).toBe(404);
    expect((await call(DELETE, { method: 'DELETE', url: '/api/boards/x', ...withId('x') })).status).toBe(404);
  });
});

describe('authentication', () => {
  it('maps a 401 from requireUser through route() on every endpoint', async () => {
    vi.mocked(requireUser).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', '請先登入'));
    const calls = [
      call(GET, { method: 'GET', url: '/api/boards' }),
      call(POST, { method: 'POST', url: '/api/boards', body: { name: 'x' } }),
      call(PATCH, { method: 'PATCH', url: `/api/boards/${aBoardId}`, ...withId(aBoardId), body: { name: 'x' } }),
      call(DELETE, { method: 'DELETE', url: `/api/boards/${aBoardId}`, ...withId(aBoardId) }),
    ];
    for (const r of await Promise.all(calls)) {
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('UNAUTHORIZED');
    }
  });
});
