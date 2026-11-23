import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/server/errors';
import { requireUser } from '@/server/auth';
import type { DB } from '@/server/db';
import { boards, tasks, user } from '@/server/db/schema';
import { POSITION_STEP } from '@/lib/position';
import { ensureDefaultBoard } from '@/server/services/boards';
import { renumberColumn } from '@/server/services/tasks';
import { closeTestDb, createTestDb, seedUser } from '../helpers/db';
import { call } from '../helpers/route';
import { GET, POST } from '../../app/api/tasks/route';
import { DELETE, PATCH } from '../../app/api/tasks/[id]/route';

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
  await h.db.delete(user); // boards and tasks cascade
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

const list = (query = '') => call(GET, { method: 'GET', url: `/api/tasks${query}` });
const create = (body: Record<string, unknown>) =>
  call(POST, { method: 'POST', url: '/api/tasks', body: { boardId: aBoardId, ...body } });
const patch = (id: string, body: unknown) =>
  call(PATCH, { method: 'PATCH', url: `/api/tasks/${id}`, params: { id }, body });
const del = (id: string) => call(DELETE, { method: 'DELETE', url: `/api/tasks/${id}`, params: { id } });

async function mk(title: string, body: Record<string, unknown> = {}): Promise<string> {
  const r = await create({ title, ...body });
  expect(r.status).toBe(201);
  return r.body.id;
}
const dbRow = async (id: string) => (await h.db.select().from(tasks).where(eq(tasks.id, id)))[0];
const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

describe('POST /api/tasks', () => {
  it('creates a task with defaults and API-shaped fields (201)', async () => {
    const r = await create({ title: '  寫\n測試  ' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      boardId: aBoardId,
      title: '寫 測試',
      description: null,
      status: 'todo',
      priority: 2,
      dueDate: null,
      tags: [],
      subtasks: [],
      dependsOn: [],
      completedAt: null,
    });
    expect(r.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof r.body.position).toBe('number');
    expect(new Date(r.body.createdAt).toISOString()).toBe(r.body.createdAt);
    expect(new Date(r.body.updatedAt).toISOString()).toBe(r.body.updatedAt);
    expect((await dbRow(r.body.id)).userId).toBe(a.id);
  });

  it('maps in-progress to the DB enum and back, and keeps dates as YYYY-MM-DD', async () => {
    const r = await create({ title: 'x', status: 'in-progress', dueDate: '2026-12-01', priority: 0 });
    expect(r.body).toMatchObject({ status: 'in-progress', dueDate: '2026-12-01', priority: 0 });
    expect((await dbRow(r.body.id)).status).toBe('in_progress');
  });

  it('puts a task without position at the top of its column', async () => {
    const first = await create({ title: 'first' });
    const second = await create({ title: 'second' });
    const other = await create({ title: 'other column', status: 'done' });
    expect(second.body.position).toBeLessThan(first.body.position);
    expect(other.body.position).toBe(0); // empty column
    const explicit = await create({ title: 'explicit', position: 12345 });
    expect(explicit.body.position).toBe(12345);
  });

  it('sets completedAt when created as done', async () => {
    const r = await create({ title: 'done already', status: 'done' });
    expect(r.body.completedAt).not.toBeNull();
  });

  it('accepts a client id and rejects a duplicate id with 409 DUPLICATE_ID', async () => {
    const id = crypto.randomUUID();
    expect((await create({ id, title: 'x' })).body.id).toBe(id);
    const dup = await create({ id, title: 'y' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_ID');
    loginAs(b);
    const dupB = await call(POST, { method: 'POST', url: '/api/tasks', body: { id, boardId: bBoardId, title: 'z' } });
    expect(dupB.status).toBe(409);
    expect((await dbRow(id)).title).toBe('x');
  });

  it('rejects a whitespace-only title with 400', async () => {
    const r = await create({ title: ' \n  ' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  it("returns 404 for someone else's board or a malformed boardId, and creates nothing", async () => {
    expect((await create({ boardId: bBoardId, title: 'x' })).status).toBe(404);
    expect((await create({ boardId: crypto.randomUUID(), title: 'x' })).status).toBe(404);
    expect(await h.db.select().from(tasks)).toHaveLength(0);
  });

  it('validates dependsOn on create', async () => {
    const other = await mk('other board', { boardId: aBoard2Id });
    const bad = await create({ title: 'x', dependsOn: [other] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_DEPENDENCY');
    const id = crypto.randomUUID();
    const self = await create({ id, title: 'x', dependsOn: [id] });
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe('DEPENDENCY_CYCLE');
    const d = await mk('prereq');
    const ok = await create({ title: 'x', dependsOn: [d] });
    expect(ok.body.dependsOn).toEqual([d]);
  });

  it('refuses to create a blocked task outside todo', async () => {
    const d = await mk('prereq');
    const r = await create({ title: 'x', status: 'in-progress', dependsOn: [d] });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'TASK_BLOCKED', details: { blockedBy: [d] } });
  });
});

describe('GET /api/tasks', () => {
  it("lists only the caller's non-deleted tasks across boards, filterable by ?boardId=", async () => {
    const t1 = await mk('a1');
    const t2 = await mk('a2', { boardId: aBoard2Id });
    const gone = await mk('gone');
    await del(gone);
    await h.db.insert(tasks).values({ userId: b.id, boardId: bBoardId, title: 'b', position: 1 });

    const all = await list();
    expect(all.status).toBe(200);
    expect(ids(all.body).sort()).toEqual([t1, t2].sort());
    expect(ids((await list(`?boardId=${aBoard2Id}`)).body)).toEqual([t2]);

    loginAs(b);
    const bList = await list();
    expect(bList.body.map((t: { title: string }) => t.title)).toEqual(['b']);
  });

  it("returns 404 for ?boardId= of someone else's board or a malformed id", async () => {
    expect((await list(`?boardId=${bBoardId}`)).status).toBe(404);
    expect((await list('?boardId=nope')).status).toBe(404);
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('updates fields and returns the task', async () => {
    const id = await mk('x');
    const sub = { id: crypto.randomUUID(), title: 's', done: true };
    const r = await patch(id, {
      title: '新標題',
      description: '說明',
      priority: 1,
      dueDate: '2026-11-30',
      tags: ['a', 'a', ' b '],
      subtasks: [sub],
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id,
      title: '新標題',
      description: '說明',
      priority: 1,
      dueDate: '2026-11-30',
      tags: ['a', 'b'],
      subtasks: [sub],
    });
  });

  it('sets completedAt on entering done and clears it on leaving', async () => {
    const id = await mk('x');
    const done = await patch(id, { status: 'done' });
    expect(done.body.status).toBe('done');
    expect(done.body.completedAt).not.toBeNull();
    const back = await patch(id, { status: 'todo' });
    expect(back.body.completedAt).toBeNull();
    const ip = await patch(id, { status: 'in-progress' });
    expect(ip.body.status).toBe('in-progress');
    expect((await dbRow(id)).status).toBe('in_progress');
  });

  it('moves a task to the top of the target column when status changes without position', async () => {
    const d1 = await mk('d1', { status: 'done' });
    const d2 = await mk('d2', { status: 'done' });
    const t = await mk('t');
    const r = await patch(t, { status: 'done' });
    const top = Math.min((await dbRow(d1)).position, (await dbRow(d2)).position);
    expect(r.body.position).toBeLessThan(top);
    const explicit = await patch(t, { status: 'todo', position: 777 });
    expect(explicit.body.position).toBe(777);
  });

  it('rejects a whitespace-only title with 400', async () => {
    const id = await mk('x');
    expect((await patch(id, { title: '   ' })).status).toBe(400);
    expect((await dbRow(id)).title).toBe('x');
  });

  it("user B cannot read or patch A's task: 404 and A's row is unchanged", async () => {
    const id = await mk('mine');
    loginAs(b);
    expect(ids((await list()).body)).not.toContain(id);
    const r = await patch(id, { title: 'hacked', status: 'done' });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
    const row = await dbRow(id);
    expect(row).toMatchObject({ title: 'mine', status: 'todo', completedAt: null });
  });

  it('returns 404 for a malformed or unknown id', async () => {
    expect((await patch('nope', { title: 'x' })).status).toBe(404);
    expect((await patch(crypto.randomUUID(), { title: 'x' })).status).toBe(404);
  });

  describe('blocking', () => {
    it('a todo task with an open prerequisite cannot leave todo until it is done', async () => {
      const d = await mk('D');
      const c = await mk('C', { dependsOn: [d] });
      for (const status of ['in-progress', 'done']) {
        const r = await patch(c, { status });
        expect(r.status).toBe(409);
        expect(r.body).toEqual({
          error: {
            code: 'TASK_BLOCKED',
            message: '這個任務還在等待前置任務完成',
            details: { blockedBy: [d] },
          },
        });
      }
      expect((await dbRow(c)).status).toBe('todo');
      // Edits that keep it in todo are fine.
      expect((await patch(c, { title: 'C2' })).status).toBe(200);
      await patch(d, { status: 'done' });
      expect((await patch(c, { status: 'in-progress' })).body.status).toBe('in-progress');
    });

    it('a soft-deleted prerequisite no longer blocks', async () => {
      const d = await mk('D');
      const c = await mk('C', { dependsOn: [d] });
      await del(d);
      const r = await patch(c, { status: 'done' });
      expect(r.status).toBe(200);
      expect(r.body.dependsOn).toEqual([d]);
    });

    it('uses the dependsOn of the same patch', async () => {
      const d = await mk('D');
      const c = await mk('C', { dependsOn: [d] });
      expect((await patch(c, { status: 'in-progress', dependsOn: [] })).status).toBe(200);
      const e = await mk('E');
      const f = await mk('F');
      const r = await patch(f, { status: 'done', dependsOn: [e] });
      expect(r.status).toBe(409);
      expect((await dbRow(f)).dependsOn).toEqual([]);
    });

    it('an in-progress task can still be completed after gaining an open prerequisite', async () => {
      const d = await mk('D');
      const c = await mk('C', { status: 'in-progress' });
      expect((await patch(c, { dependsOn: [d] })).status).toBe(200);
      expect((await patch(c, { status: 'done' })).status).toBe(200);
    });
  });

  describe('dependencies', () => {
    it('rejects self-reference and cycles with 409 DEPENDENCY_CYCLE', async () => {
      const x = await mk('A');
      const y = await mk('B', { dependsOn: [x] });
      const self = await patch(x, { dependsOn: [x] });
      expect(self.status).toBe(409);
      expect(self.body.error.code).toBe('DEPENDENCY_CYCLE');
      const cycle = await patch(x, { dependsOn: [y] });
      expect(cycle.status).toBe(409);
      expect(cycle.body.error.code).toBe('DEPENDENCY_CYCLE');
      const z = await mk('C', { dependsOn: [y] });
      expect((await patch(x, { dependsOn: [z] })).body.error.code).toBe('DEPENDENCY_CYCLE');
      expect((await dbRow(x)).dependsOn).toEqual([]);
    });

    it('rejects prerequisites on another board, deleted, unknown or not owned with 400', async () => {
      const t = await mk('t');
      const otherBoard = await mk('o', { boardId: aBoard2Id });
      const deleted = await mk('d');
      await del(deleted);
      const [{ id: bTask }] = await h.db
        .insert(tasks)
        .values({ userId: b.id, boardId: bBoardId, title: 'b', position: 1 })
        .returning({ id: tasks.id });
      for (const dep of [otherBoard, deleted, crypto.randomUUID(), bTask]) {
        const r = await patch(t, { dependsOn: [dep] });
        expect(r.status).toBe(400);
        expect(r.body.error.code).toBe('INVALID_DEPENDENCY');
      }
      expect((await dbRow(t)).dependsOn).toEqual([]);
    });

    it('editing the prerequisites after one was soft-deleted: re-sending it is refused, omitting it saves', async () => {
      const gone = await mk('gone');
      const live = await mk('live');
      const extra = await mk('extra');
      const t = await mk('t', { dependsOn: [gone, live] });
      await del(gone);

      // The old client kept ids its picker could not show and sent them back: the server refuses.
      const resent = await patch(t, { dependsOn: [live, extra, gone] });
      expect(resent.status).toBe(400);
      expect(resent.body.error).toMatchObject({ code: 'INVALID_DEPENDENCY', details: { invalid: [gone] } });

      // What the picker sends now — only live tasks of the board — is accepted.
      const r = await patch(t, { dependsOn: [live, extra] });
      expect(r.status).toBe(200);
      expect((await dbRow(t)).dependsOn).toEqual([live, extra]);
    });
  });

  describe('position: null (renumber the column)', () => {
    async function column(status: 'todo' | 'in_progress' | 'done' = 'todo') {
      const rows = await h.db.select().from(tasks).where(eq(tasks.status, status));
      return rows.sort((p, q) => p.position - q.position);
    }

    it('inserts between two cards whose gap is exhausted and renumbers the whole column', async () => {
      const first = await mk('first', { position: 0 });
      const second = await mk('second', { position: 1e-7 });
      const moved = await mk('moved', { position: 5 });
      const r = await patch(moved, { position: null, insertAfterId: first });
      expect(r.status).toBe(200);
      const col = await column();
      expect(ids(col)).toEqual([first, moved, second]);
      for (let i = 1; i < col.length; i++) {
        expect(col[i].position - col[i - 1].position).toBeGreaterThanOrEqual(1);
      }
      expect(r.body.position).toBe(col[1].position);
    });

    it('insertAfterId: null puts the task at the top', async () => {
      const first = await mk('first', { position: 0 });
      const second = await mk('second', { position: 1e-7 });
      const moved = await mk('moved', { position: 5 });
      await patch(moved, { position: null, insertAfterId: null });
      expect(ids(await column())).toEqual([moved, first, second]);
    });

    it('works together with a status change into another column', async () => {
      const first = await mk('first', { status: 'done', position: 0 });
      const second = await mk('second', { status: 'done', position: 1e-7 });
      const moved = await mk('moved');
      const r = await patch(moved, { status: 'done', position: null, insertAfterId: first });
      expect(r.body.status).toBe('done');
      expect(ids(await column('done'))).toEqual([first, moved, second]);
    });

    it('renumberColumn re-spaces only the live cards of that column to n × POSITION_STEP, ties by createdAt', async () => {
      const t0 = new Date('2026-11-20T00:00:00.000Z');
      const at = (s: number) => new Date(t0.getTime() + s * 1000);
      const row = (title: string, position: number, created: Date, over: Partial<typeof tasks.$inferInsert> = {}) =>
        h.db
          .insert(tasks)
          .values({ userId: a.id, boardId: aBoardId, title, position, createdAt: created, ...over })
          .returning({ id: tasks.id })
          .then(([r]) => r.id);
      const later = await row('later', 5, at(2));
      const earlier = await row('earlier', 5, at(1)); // same position, created first → goes first
      const top = await row('top', -3, at(3));
      const deleted = await row('deleted', 4, at(0), { deletedAt: at(9) });
      const done = await row('done', 7, at(0), { status: 'done' });
      const otherBoard = await row('other', 1, at(0), { boardId: aBoard2Id });

      await renumberColumn(h.db, aBoardId, 'todo');

      const pos = async (id: string) => (await dbRow(id)).position;
      expect(await Promise.all([top, earlier, later].map(pos))).toEqual([
        POSITION_STEP,
        2 * POSITION_STEP,
        3 * POSITION_STEP,
      ]);
      expect(await Promise.all([deleted, done, otherBoard].map(pos))).toEqual([4, 7, 1]);
    });

    it('rejects an insertAfterId that is not in the target column with 400', async () => {
      const t = await mk('t');
      const elsewhere = await mk('e', { status: 'done' });
      const r = await patch(t, { position: null, insertAfterId: elsewhere });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('INVALID_POSITION');
      expect((await patch(t, { position: null, insertAfterId: t })).status).toBe(400);
    });
  });
});

describe('DELETE /api/tasks/:id and restore', () => {
  it('soft-deletes (204), hides the task, and PATCH {deletedAt:null} restores it unchanged', async () => {
    const d = await mk('D');
    const created = await create({
      title: 'keep me',
      description: 'desc',
      priority: 0,
      dueDate: '2026-12-24',
      tags: ['t'],
      dependsOn: [d],
    });
    const id = created.body.id;
    const r = await del(id);
    expect(r).toEqual({ status: 204, body: null });
    expect(ids((await list()).body)).toEqual([d]);
    expect((await dbRow(id)).deletedAt).not.toBeNull();

    // Any operation other than restore on a deleted task is 404.
    expect((await patch(id, { title: 'x' })).status).toBe(404);
    expect((await del(id)).status).toBe(404);

    const restored = await patch(id, { deletedAt: null });
    expect(restored.status).toBe(200);
    expect({ ...restored.body, updatedAt: null }).toEqual({ ...created.body, updatedAt: null });
    expect(ids((await list()).body).sort()).toEqual([d, id].sort());
  });

  it('applies other fields sent together with the restore', async () => {
    const id = await mk('x');
    await del(id);
    const r = await patch(id, { deletedAt: null, title: 'back' });
    expect(r.body.title).toBe('back');
  });

  it("user B cannot delete or restore A's task", async () => {
    const live = await mk('live');
    const deleted = await mk('deleted');
    await del(deleted);
    loginAs(b);
    expect((await del(live)).status).toBe(404);
    expect((await patch(deleted, { deletedAt: null })).status).toBe(404);
    expect((await dbRow(live)).deletedAt).toBeNull();
    expect((await dbRow(deleted)).deletedAt).not.toBeNull();
  });

  it('returns 404 for a malformed or unknown id', async () => {
    expect((await del('nope')).status).toBe(404);
    expect((await del(crypto.randomUUID())).status).toBe(404);
  });
});

describe('authentication', () => {
  it('maps a 401 from requireUser through route() on every endpoint', async () => {
    const id = await mk('x');
    vi.mocked(requireUser).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', '請先登入'));
    const results = [await list(), await create({ title: 'x' }), await patch(id, { title: 'y' }), await del(id)];
    for (const r of results) {
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('UNAUTHORIZED');
    }
  });
});
