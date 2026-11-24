import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUser } from '@/server/auth';
import type { DB } from '@/server/db';
import { boards, tasks, user } from '@/server/db/schema';
import { exportV2 } from '@/lib/validation';
import { ensureDefaultBoard } from '@/server/services/boards';
import { closeTestDb, createTestDb, seedUser } from '../helpers/db';
import { call } from '../helpers/route';
import { GET as exportRoute } from '../../app/api/boards/[id]/export/route';
import { POST as importRoute } from '../../app/api/boards/[id]/import/route';
import { POST as localRoute } from '../../app/api/import/local/route';

const h = vi.hoisted(() => ({ db: undefined as unknown as DB }));
vi.mock('@/server/auth', () => ({ requireUser: vi.fn() }));
vi.mock('@/server/db', () => ({ getDb: () => h.db }));

type U = { id: string; email: string };
const loginAs = (u: U) =>
  vi.mocked(requireUser).mockResolvedValue({ id: u.id, email: u.email, name: 'x', image: null });

let a: U;
let b: U;
let x: string; // A's board X
let y: string; // A's board Y
let bBoard: string;
const TZ = 'Asia/Taipei';

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
  x = (await h.db.select().from(boards).where(eq(boards.userId, a.id)))[0].id;
  [{ id: y }] = await h.db.insert(boards).values({ userId: a.id, name: 'Y 看板', position: 2048 }).returning({ id: boards.id });
  bBoard = (await h.db.select().from(boards).where(eq(boards.userId, b.id)))[0].id;
  loginAs(a);
});
afterEach(() => {
  vi.mocked(requireUser).mockReset();
});

const exp = (id: string) => call(exportRoute, { method: 'GET', url: `/api/boards/${id}/export`, params: { id } });
const imp = (id: string, body: unknown) =>
  call(importRoute, { method: 'POST', url: `/api/boards/${id}/import`, params: { id }, body });
const local = (body: unknown) => call(localRoute, { method: 'POST', url: '/api/import/local', body });

async function seed(boardId: string, rows: Array<Partial<typeof tasks.$inferInsert> & { title: string }>) {
  const out: string[] = [];
  let i = 0;
  for (const r of rows) {
    const [{ id }] = await h.db
      .insert(tasks)
      .values({ userId: a.id, boardId, position: (++i) * 1024, ...r })
      .returning({ id: tasks.id });
    out.push(id);
  }
  return out;
}
const live = (boardId: string) =>
  h.db.select().from(tasks).where(and(eq(tasks.boardId, boardId), isNull(tasks.deletedAt)));

describe('export', () => {
  it('returns a v2 file ordered by column then position, with a download header', async () => {
    const [t1, t2, t3] = await seed(x, [
      { title: '完成', status: 'done', completedAt: new Date(), position: 1024 },
      { title: '待辦二', position: 2048 },
      { title: '待辦一', position: 1024, dependsOn: [] },
    ]);
    await h.db.update(tasks).set({ dependsOn: [t3] }).where(eq(tasks.id, t2));
    const [{ id: gone }] = await h.db
      .insert(tasks)
      .values({ userId: a.id, boardId: x, title: '已刪', position: 1, deletedAt: new Date() })
      .returning({ id: tasks.id });
    await h.db.update(tasks).set({ dependsOn: [gone] }).where(eq(tasks.id, t3));

    const res = await exportRoute(new Request('http://localhost/x'), { params: Promise.resolve({ id: x }) });
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const cd = res.headers.get('content-disposition')!;
    expect(cd).toMatch(/^attachment; filename="board-\d{4}-\d{2}-\d{2}\.json"; filename\*=UTF-8''/);
    expect(cd).toContain(encodeURIComponent('我的看板'));
    const file = exportV2.parse(JSON.parse(await res.text()));
    expect(file.tasks.map((t) => t.title)).toEqual(['待辦一', '待辦二', '完成']);
    expect(file.tasks[0].dependsOn).toEqual([]); // deleted prerequisite is not exported
    expect(file.tasks[1].dependsOn).toEqual([t3]);
    expect(t1).toBeDefined();
  });

  it("404 for someone else's board", async () => {
    expect((await exp(bBoard)).status).toBe(404);
  });
});

describe('import into a board', () => {
  it("replaces only that board: Y's export into X (anti-goal)", async () => {
    const xOld = await seed(x, [{ title: 'x1' }, { title: 'x2' }]);
    await seed(y, [{ title: 'y1' }, { title: 'y2' }, { title: 'y3' }]);
    const file = (await exp(y)).body;
    const r = await imp(x, { timeZone: TZ, file });
    expect(r.status).toBe(200);
    expect(r.body.replaced.sort()).toEqual(xOld.sort());
    expect(r.body.imported).toHaveLength(3);
    expect((await live(x)).map((t) => t.title).sort()).toEqual(['y1', 'y2', 'y3']);
    expect(await live(y)).toHaveLength(3);
    const deleted = await h.db.select().from(tasks).where(and(eq(tasks.boardId, x), eq(tasks.title, 'x1')));
    expect(deleted[0].deletedAt).not.toBeNull();
  });

  it('round-trips titles, order, subtasks, dependencies, completedAt', async () => {
    const [p, q] = await seed(x, [
      { title: '先做', subtasks: [{ id: 's1', title: '子', done: true }], tags: ['t'] },
      { title: '後做' },
    ]);
    await h.db.update(tasks).set({ dependsOn: [p] }).where(eq(tasks.id, q));
    await seed(x, [{ title: '完工', status: 'done', completedAt: new Date('2026-01-02T03:04:05Z') }]);
    const file = (await exp(x)).body;
    const r = await imp(x, { timeZone: TZ, file });
    expect(r.body.warnings).toEqual([]);
    const after = (await exp(x)).body;
    expect(after.tasks.map((t: { title: string }) => t.title)).toEqual(['先做', '後做', '完工']);
    expect(after.tasks[0].subtasks).toHaveLength(1);
    expect(after.tasks[0].subtasks[0]).toMatchObject({ title: '子', done: true });
    expect(after.tasks[0].tags).toEqual(['t']);
    expect(after.tasks[1].dependsOn).toEqual([after.tasks[0].id]);
    expect(after.tasks[0].id).not.toBe(p);
    expect(after.tasks[2].completedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(after.tasks.map((t: { position: number }) => t.position)).toEqual([1024, 2048, 1024]);
  });

  it('legacy array: dependsOn remapped, unmapped dropped, done without completedAt gets now', async () => {
    const r = await imp(x, {
      timeZone: TZ,
      file: [
        { id: 'a1', title: 'A', status: 'done', priority: 1, dueDate: Date.UTC(2026, 10, 23, 16, 30), dependsOn: [] },
        { id: 'b2', title: 'B', status: 'todo', priority: 2, dependsOn: ['a1', 'ghost'] },
      ],
    });
    expect(r.status).toBe(200);
    const rows = await live(x);
    const A = rows.find((t) => t.title === 'A')!;
    const B = rows.find((t) => t.title === 'B')!;
    expect(B.dependsOn).toEqual([A.id]);
    expect(A.completedAt).not.toBeNull();
    expect(A.dueDate).toBe('2026-11-24');
  });

  it('drops cycle-forming edges with a warning', async () => {
    const r = await imp(x, {
      timeZone: TZ,
      file: [
        { id: '1', title: 'A', status: 'todo', priority: 2, dependsOn: ['2'] },
        { id: '2', title: 'B', status: 'todo', priority: 2, dependsOn: ['1'] },
        { id: '3', title: 'C', status: 'todo', priority: 2, dependsOn: ['3'] },
      ],
    });
    expect(r.body.warnings).toEqual([
      '第 2 筆：前置任務形成循環，已移除',
      '第 3 筆：前置任務形成循環，已移除',
    ]);
    const rows = await live(x);
    expect(rows.find((t) => t.title === 'A')!.dependsOn).toHaveLength(1);
    expect(rows.find((t) => t.title === 'B')!.dependsOn).toEqual([]);
    expect(rows.find((t) => t.title === 'C')!.dependsOn).toEqual([]);
  });

  it('2,001 raw tasks → 413; 2,000 is fine', async () => {
    const row = (i: number) => ({ id: String(i), title: `t${i}`, status: 'todo', priority: 2 });
    const r = await imp(x, { timeZone: TZ, file: Array.from({ length: 2001 }, (_, i) => row(i)) });
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe('TOO_MANY_TASKS');
    expect(r.body.error.message).toBe('一次最多匯入 2,000 筆任務');
    const ok = await imp(x, { timeZone: TZ, file: Array.from({ length: 2000 }, (_, i) => row(i)) });
    expect(ok.status).toBe(200);
    expect(ok.body.imported).toHaveLength(2000);
  });

  it("404 into someone else's board; bad file 400; bad time zone 400", async () => {
    expect((await imp(bBoard, { timeZone: TZ, file: [] })).status).toBe(404);
    expect((await imp(x, { timeZone: TZ, file: 'nope' })).body.error.code).toBe('INVALID_IMPORT_FILE');
    expect((await imp(x, { timeZone: 'Mars/Base', file: [] })).body.error.code).toBe('INVALID_TIME_ZONE');
  });

  it('401 when signed out', async () => {
    const { ApiError } = await import('@/server/errors');
    vi.mocked(requireUser).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', '請先登入'));
    expect((await imp(x, { timeZone: TZ, file: [] })).status).toBe(401);
    expect((await exp(x)).status).toBe(401);
    expect((await local({ timeZone: TZ })).status).toBe(401);
  });
});

describe('import local', () => {
  const legacyBoards = { boards: [{ id: 'default', name: '我的看板' }, { id: 'w', name: '工作' }] };
  const legacyTasks = [
    { id: 1, title: '預設一', status: 'todo', priority: 2, dueDate: Date.UTC(2026, 10, 23, 16, 30) },
    { id: 2, title: '工作一', status: 'todo', priority: 2, boardId: 'w', dependsOn: [3] },
    { id: 3, title: '工作二', status: 'in-progress', priority: 1, boardId: 'w' },
  ];

  it('reuses the single empty default board; others become new boards', async () => {
    await h.db.delete(boards).where(eq(boards.id, y));
    const r = await local({ timeZone: TZ, boards: legacyBoards, tasks: legacyTasks });
    expect(r.status).toBe(200);
    expect(r.body.taskCount).toBe(3);
    expect(r.body.boards.map((bd: { name: string }) => bd.name)).toEqual(['我的看板', '工作']);
    const mine = await h.db.select().from(boards).where(eq(boards.userId, a.id));
    expect(mine).toHaveLength(2);
    expect(r.body.boards[0].id).toBe(x);
    const [first] = await live(x);
    expect(first.title).toBe('預設一');
    expect(first.dueDate).toBe('2026-11-24');
    const work = await live(r.body.boards[1].id);
    expect(work.find((t) => t.title === '工作一')!.dependsOn).toEqual([work.find((t) => t.title === '工作二')!.id]);
  });

  it('creates a new board for default when the existing board is not empty (deleted tasks count)', async () => {
    await h.db.delete(boards).where(eq(boards.id, y));
    await h.db.insert(tasks).values({ userId: a.id, boardId: x, title: '舊', position: 1, deletedAt: new Date() });
    const r = await local({ timeZone: TZ, boards: legacyBoards, tasks: legacyTasks });
    expect(r.body.boards).toHaveLength(2);
    expect(r.body.boards.every((bd: { id: string }) => bd.id !== x)).toBe(true);
    expect(await h.db.select().from(boards).where(eq(boards.userId, a.id))).toHaveLength(3);
    expect(await live(x)).toHaveLength(0);
  });

  it('two legacy boards with two existing boards → everything new', async () => {
    const r = await local({ timeZone: TZ, boards: legacyBoards, tasks: legacyTasks });
    expect(await h.db.select().from(boards).where(eq(boards.userId, a.id))).toHaveLength(4);
    expect(r.body.boards).toHaveLength(2);
  });

  it('413 over 2,000 tasks; 400 bad time zone', async () => {
    const many = Array.from({ length: 2001 }, (_, i) => ({ id: i, title: 't', status: 'todo', priority: 2 }));
    expect((await local({ timeZone: TZ, boards: legacyBoards, tasks: many })).status).toBe(413);
    expect((await local({ timeZone: 'x/y', boards: legacyBoards, tasks: [] })).status).toBe(400);
  });
});
