// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/client/api';
import { useTaskCommands } from '@/client/commands';
import { makeStore } from '@/client/store';
import { createToaster, createUndoStack, UndoProvider, useUndo } from '@/client/undo';
import type { Task } from '@/lib/types';
import { installFetch, jsonResponse, route } from '../helpers/fetch';

const BOARD = 'board-1';

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

let tasks: Task[];
let batchReply: unknown;
let sent: { route: string; body: unknown }[];

beforeEach(() => {
  tasks = [task('a', { position: 1024 }), task('b', { position: 2048 }), task('c', { status: 'in-progress' })];
  batchReply = { updated: [], skipped: [] };
  sent = [];
  installFetch(async (req) => {
    const r = route(req);
    const body = req.method === 'GET' || req.method === 'DELETE' ? undefined : await req.json();
    if (r !== 'GET /api/tasks') sent.push({ route: r, body });
    if (r === 'GET /api/tasks') return jsonResponse(tasks);
    if (r === 'POST /api/tasks/batch') return jsonResponse(batchReply);
    if (req.method === 'DELETE') return jsonResponse(null, 204);
    if (req.method === 'PATCH') {
      const id = r.split('/').pop()!;
      const { insertAfterId: _i, position, deletedAt: _d, ...rest } = body as Record<string, unknown>;
      void _i;
      void _d;
      const base = tasks.find((t) => t.id === id)!;
      return jsonResponse({ ...base, ...rest, position: typeof position === 'number' ? position : 5000 });
    }
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function setup() {
  const toaster = createToaster();
  const stack = createUndoStack();
  const store = makeStore({ toast: toaster.show });
  await store.dispatch(api.endpoints.getTasks.initiate());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <UndoProvider stack={stack} toaster={toaster}>
        {children}
      </UndoProvider>
    </Provider>
  );
  const hook = renderHook(() => ({ cmds: useTaskCommands(), undo: useUndo() }), { wrapper });
  return { hook, toaster };
}

const patches = () => sent.filter((s) => s.route.startsWith('PATCH'));

describe('useTaskCommands', () => {
  it('move: undo puts the task back after its old predecessor with position: null', async () => {
    const { hook, toaster } = await setup();

    await act(() => hook.result.current.cmds.move(tasks[1], 'in-progress', 512, null));
    expect(patches()[0]).toEqual({ route: 'PATCH /api/tasks/b', body: { position: 512, status: 'in-progress' } });
    expect(toaster.get()).toEqual({ text: '已移到進行中：「任務 b」', undoable: true });

    await act(() => hook.result.current.undo.undo());
    expect(patches()[1]).toEqual({
      route: 'PATCH /api/tasks/b',
      body: { status: 'todo', position: null, insertAfterId: 'a' },
    });
  });

  it('move: redo uses the placement it landed on, never a stale number', async () => {
    const { hook } = await setup();

    await act(() => hook.result.current.cmds.move(tasks[0], 'todo', null, 'b')); // a below b
    await act(() => hook.result.current.undo.undo());
    await act(() => hook.result.current.undo.redo());

    expect(patches().map((p) => p.body)).toEqual([
      { position: null, insertAfterId: 'b' },
      { position: null, insertAfterId: null },
      { position: null, insertAfterId: 'b' },
    ]);
  });

  it('refuses to move a blocked todo out of todo, without a request', async () => {
    tasks[1] = task('b', { position: 2048, dependsOn: ['a'] });
    const { hook, toaster } = await setup();

    const result = await act(() => hook.result.current.cmds.move(tasks[1], 'in-progress', 0, null));

    expect(result).toBeNull();
    expect(patches()).toHaveLength(0);
    expect(toaster.get()?.text).toBe('「任務 b」還在等待 1 個前置任務完成');
  });

  it('update to done says 「已完成「…」」; editing a field is undone with the old value', async () => {
    const { hook, toaster } = await setup();

    await act(() => hook.result.current.cmds.update(tasks[2], { status: 'done' }));
    expect(toaster.get()?.text).toBe('已完成「任務 c」');

    await act(() => hook.result.current.cmds.update(tasks[0], { priority: 0 }));
    await act(() => hook.result.current.undo.undo());
    expect(patches().at(-1)).toEqual({ route: 'PATCH /api/tasks/a', body: { priority: 2 } });
  });

  it('remove: toast 「已刪除「…」」, undo restores with deletedAt: null', async () => {
    const { hook, toaster } = await setup();

    await act(() => hook.result.current.cmds.remove(tasks[0]));
    expect(sent[0].route).toBe('DELETE /api/tasks/a');
    expect(toaster.get()).toEqual({ text: '已刪除「任務 a」', undoable: true });

    await act(() => hook.result.current.undo.undo());
    expect(patches()[0]).toEqual({ route: 'PATCH /api/tasks/a', body: { deletedAt: null } });
  });

  it('undo answering 404 ends with 「無法復原：任務已不存在」 and drops the command', async () => {
    const { hook, toaster } = await setup();
    await act(() => hook.result.current.cmds.remove(tasks[0]));

    installFetch((req) =>
      route(req) === 'GET /api/tasks'
        ? jsonResponse(tasks)
        : jsonResponse({ error: { code: 'NOT_FOUND', message: '找不到這個任務' } }, 404),
    );
    await act(() => hook.result.current.undo.undo());

    expect(toaster.get()?.text).toBe('無法復原：任務已不存在');
    expect(hook.result.current.undo.canUndo).toBe(false);
    expect(hook.result.current.undo.canRedo).toBe(false);
  });

  it('batchMove: reports skipped blocked tasks and undoes only the updated ones', async () => {
    batchReply = { updated: ['a'], skipped: [{ id: 'b', reason: 'TASK_BLOCKED' }] };
    const { hook, toaster } = await setup();

    await act(() => hook.result.current.cmds.batchMove(['a', 'b'], 'done'));
    expect(sent[0]).toEqual({ route: 'POST /api/tasks/batch', body: { ids: ['a', 'b'], op: 'move', status: 'done' } });
    expect(toaster.get()?.text).toBe('已移動 1 筆，1 筆因等待前置任務而略過');

    await act(() => hook.result.current.undo.undo());
    expect(patches()).toEqual([
      { route: 'PATCH /api/tasks/a', body: { status: 'todo', position: null, insertAfterId: null } },
    ]);
  });
});
