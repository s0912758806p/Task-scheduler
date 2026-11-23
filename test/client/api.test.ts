import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { api } from '@/client/api';
import { makeStore } from '@/client/store';
import type { Task } from '@/lib/types';
import { errorResponse, installFetch, jsonResponse, route, type FetchHandler } from '../helpers/fetch';

const BOARD = '0b6c6d3e-7f5b-4c51-9d0e-6a1f3c2b9e10';

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    boardId: BOARD,
    title: `任務 ${id}`,
    description: null,
    status: 'todo',
    priority: 2,
    dueDate: null,
    position: 1024,
    tags: [],
    subtasks: [],
    dependsOn: [],
    completedAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

const A = task('a', { position: 1024 });
const B = task('b', { position: 2048 });

/** A promise plus its resolver, to hold a response until the test has inspected the cache. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

let assign: Mock<(url: string) => void>;
let toast: Mock<(text: string) => void>;

beforeEach(() => {
  assign = vi.fn<(url: string) => void>();
  toast = vi.fn<(text: string) => void>();
  vi.stubGlobal('window', { location: { pathname: '/b/x', search: '?task=1', assign } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Store with getTasks loaded as [A, B]; `handler` answers every other request. */
async function setup(handler: FetchHandler) {
  const fetchMock = installFetch((req) =>
    route(req) === 'GET /api/tasks' ? jsonResponse([A, B]) : handler(req),
  );
  const store = makeStore({ toast });
  await store.dispatch(api.endpoints.getTasks.initiate());
  const cached = () => api.endpoints.getTasks.select()(store.getState()).data;
  return { store, cached, fetchMock };
}

describe('updateTask (optimistic)', () => {
  it('changes the cache before the response and restores it on a 500', async () => {
    const res = deferred<Response>();
    const { store, cached } = await setup(() => res.promise);

    const pending = store.dispatch(api.endpoints.updateTask.initiate({ id: 'a', patch: { title: '新標題' } }));
    await vi.waitFor(() => expect(cached()?.find((t) => t.id === 'a')?.title).toBe('新標題'));

    res.resolve(errorResponse(500, 'INTERNAL_ERROR', '伺服器發生錯誤，請稍後再試'));
    await pending;

    expect(cached()?.find((t) => t.id === 'a')?.title).toBe('任務 a');
    expect(toast).toHaveBeenCalledWith('伺服器發生錯誤，請稍後再試');
  });

  it('removes the task from the cache on a 404 and says 「這筆任務已不存在」', async () => {
    const { store, cached } = await setup(() => errorResponse(404, 'NOT_FOUND', '找不到這個任務'));

    await store.dispatch(api.endpoints.updateTask.initiate({ id: 'a', patch: { priority: 0 } }));

    expect(cached()?.map((t) => t.id)).toEqual(['b']);
    expect(toast).toHaveBeenCalledWith('這筆任務已不存在');
  });

  it('stores the server’s version of the task on success', async () => {
    const saved = task('a', { status: 'done', completedAt: '2026-11-23T10:00:00.000Z', position: 0 });
    const { store, cached } = await setup(() => jsonResponse(saved));

    await store.dispatch(api.endpoints.updateTask.initiate({ id: 'a', patch: { status: 'done' } }));

    expect(cached()?.find((t) => t.id === 'a')).toEqual(saved);
    expect(toast).not.toHaveBeenCalled();
  });

  it('refetches the task list after a position:null PATCH (the server renumbered the column)', async () => {
    const { store, fetchMock } = await setup(() => jsonResponse(task('a', { position: 3072 })));
    const listCalls = () =>
      fetchMock.mock.calls.filter(([req]) => route(req as Request) === 'GET /api/tasks').length;
    expect(listCalls()).toBe(1);

    await store.dispatch(
      api.endpoints.updateTask.initiate({ id: 'a', patch: { position: null, insertAfterId: 'b' } }),
    );

    await vi.waitFor(() => expect(listCalls()).toBe(2));
  });
});

describe('createTask / deleteTask (optimistic)', () => {
  it('createTask inserts right away and rolls back on a 409 with the server message', async () => {
    const res = deferred<Response>();
    const { store, cached } = await setup(() => res.promise);
    const id = '5f0c2a8e-1d3b-4c7a-9e6f-2b8d4a1c3e5f';

    const pending = store.dispatch(api.endpoints.createTask.initiate({ id, boardId: BOARD, title: '新任務' }));
    await vi.waitFor(() => expect(cached()?.some((t) => t.id === id)).toBe(true));

    res.resolve(errorResponse(409, 'TASK_BLOCKED', '這個任務還在等待前置任務完成'));
    await pending;

    expect(cached()?.some((t) => t.id === id)).toBe(false);
    expect(toast).toHaveBeenCalledWith('這個任務還在等待前置任務完成');
  });

  it('deleteTask removes right away; a 404 keeps it removed and says 「這筆任務已不存在」', async () => {
    const { store, cached } = await setup(() => errorResponse(404, 'NOT_FOUND', '找不到這個任務'));

    await store.dispatch(api.endpoints.deleteTask.initiate('b'));

    expect(cached()?.map((t) => t.id)).toEqual(['a']);
    expect(toast).toHaveBeenCalledWith('這筆任務已不存在');
  });
});

describe('batchTasks', () => {
  it('when a later chunk fails it rolls back, toasts, and refetches so applied chunks show', async () => {
    // 501 ids → two requests: the first (500 ids, incl. a) is applied by the server, the second (b) fails.
    const ids = ['a', ...Array.from({ length: 499 }, (_, i) => `gone-${i}`), 'b'];
    let serverTasks = [A, B];
    const batches: number[] = [];
    const fetchMock = installFetch(async (req) => {
      const r = route(req);
      if (r === 'GET /api/tasks') return jsonResponse(serverTasks);
      const body = (await req.json()) as { ids: string[] };
      batches.push(body.ids.length);
      if (batches.length === 2) return errorResponse(500, 'INTERNAL', '伺服器錯誤');
      serverTasks = serverTasks.filter((t) => !body.ids.includes(t.id));
      return jsonResponse({ updated: ['a'], skipped: [] });
    });
    const store = makeStore({ toast });
    await store.dispatch(api.endpoints.getTasks.initiate());
    const cached = () => api.endpoints.getTasks.select()(store.getState()).data;
    const listCalls = () =>
      fetchMock.mock.calls.filter(([req]) => route(req as Request) === 'GET /api/tasks').length;

    await store.dispatch(api.endpoints.batchTasks.initiate({ ids, op: 'delete' }));

    expect(batches).toEqual([500, 1]);
    expect(toast).toHaveBeenCalledWith('伺服器錯誤');
    await vi.waitFor(() => expect(listCalls()).toBe(2));
    await vi.waitFor(() => expect(cached()?.map((t) => t.id)).toEqual(['b']));
  });
});

describe('401 handling', () => {
  it('any endpoint answering 401 sends the browser to /login?next=<current path>', async () => {
    installFetch(() => errorResponse(401, 'UNAUTHENTICATED', '請先登入'));
    const store = makeStore({ toast });

    await store.dispatch(api.endpoints.getBoards.initiate());

    expect(assign).toHaveBeenCalledWith(`/login?next=${encodeURIComponent('/b/x?task=1')}`);
    expect(assign.mock.calls[0][0]).toContain('next=');
  });

  it('a mutation answering 401 redirects without an error toast', async () => {
    const { store } = await setup(() => errorResponse(401, 'UNAUTHENTICATED', '請先登入'));

    await store.dispatch(api.endpoints.updateTask.initiate({ id: 'a', patch: { title: 'x' } }));

    expect(assign).toHaveBeenCalledOnce();
    expect(toast).not.toHaveBeenCalled();
  });
});
