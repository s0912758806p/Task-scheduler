// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/client/store';
import { ThemeProvider } from '@/client/theme';
import { setPaletteOpen } from '@/client/uiSlice';
import { createToaster, UndoProvider } from '@/client/undo';
import { CommandPalette } from '@/components/CommandPalette/CommandPalette';
import type { Board, Task } from '@/lib/types';
import { stubBrowserApis } from '../helpers/dom';
import { installFetch, jsonResponse, route } from '../helpers/fetch';

const MAIN = '3c7e1a52-0f4b-4d8e-9a61-7b2c5d8e4f10';
const SIDE = '9d2f6b81-5c3a-4e7f-8b10-2a4c6e8d0f21';

const push = vi.fn();
let pathname = `/b/${MAIN}`;
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

const boards: Board[] = [
  { id: MAIN, name: '我的看板', position: 1024, createdAt: '2026-11-01T00:00:00.000Z', openCount: 0 },
  { id: SIDE, name: '個人專案', position: 2048, createdAt: '2026-11-01T00:00:00.000Z', openCount: 0 },
];

function task(id: string, boardId: string, title: string, over: Partial<Task> = {}): Task {
  return {
    id,
    boardId,
    title,
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

const tasks: Task[] = [
  task('t1', MAIN, '撰寫 API 規格文件', { updatedAt: '2026-11-10T00:00:00.000Z' }),
  task('t2', SIDE, '串接天氣 API', { status: 'in-progress', updatedAt: '2026-11-09T00:00:00.000Z' }),
  task('t3', MAIN, '整理桌面', { tags: ['家務'], updatedAt: '2026-11-08T00:00:00.000Z' }),
  task('t4', MAIN, '舊任務', { updatedAt: '2026-11-01T00:00:00.000Z' }),
];

let created: Record<string, unknown>[] = [];
const onExportImport = vi.fn();
const onReminders = vi.fn();

beforeEach(() => {
  stubBrowserApis();
  push.mockReset();
  created = [];
  pathname = `/b/${MAIN}`;
  installFetch(async (req) => {
    switch (route(req)) {
      case 'GET /api/boards':
        return jsonResponse(boards);
      case 'GET /api/tasks':
        return jsonResponse(tasks);
      case 'POST /api/tasks': {
        const body = (await req.json()) as Record<string, unknown>;
        created.push(body);
        return jsonResponse(task(body.id as string, body.boardId as string, body.title as string), 201);
      }
      default:
        return jsonResponse({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
    }
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPalette() {
  const toaster = createToaster();
  const store = makeStore({ toast: toaster.show });
  store.dispatch(setPaletteOpen(true));
  render(
    <ThemeProvider initial="light">
      <Provider store={store}>
        <UndoProvider toaster={toaster}>
          <CommandPalette onExportImport={onExportImport} onReminders={onReminders} />
        </UndoProvider>
      </Provider>
    </ThemeProvider>,
  );
  return store;
}

const input = () => screen.getByPlaceholderText('搜尋任務、看板，或輸入指令…');

describe('CommandPalette', () => {
  it('empty query shows the 3 most recently updated tasks and the actions', async () => {
    renderPalette();
    await screen.findByText('撰寫 API 規格文件');
    const group = screen.getByRole('group', { name: '任務' });
    expect(within(group).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '撰寫 API 規格文件我的看板 · 待處理',
      '串接天氣 API個人專案 · 進行中',
      '整理桌面我的看板 · 待處理',
    ]);
    const actions = within(screen.getByRole('group', { name: '動作' }));
    for (const name of [/新增任務/, /前往今日焦點/, /切換主題/, /匯出／匯入目前看板/, /開啟到期提醒/, /復原/, /切換到「個人專案」看板/]) {
      expect(actions.getByRole('option', { name })).toBeTruthy();
    }
  });

  it('matches title and tags across boards, case-insensitively; Enter opens the highlighted task', async () => {
    renderPalette();
    await screen.findByText('撰寫 API 規格文件');
    fireEvent.change(input(), { target: { value: 'api' } });
    const group = screen.getByRole('group', { name: '任務' });
    expect(within(group).getAllByRole('option')).toHaveLength(2);
    expect(within(group).getByText('串接天氣 API')).toBeTruthy();

    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(input().getAttribute('aria-activedescendant')).toBe('palette-task-t2');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(push).toHaveBeenCalledWith(`/b/${SIDE}?task=t2`);

    fireEvent.change(input(), { target: { value: '家務' } });
    expect(screen.getByText('整理桌面')).toBeTruthy();
  });

  it('arrow keys move one highlight across both groups and hover moves it', async () => {
    renderPalette();
    await screen.findByText('撰寫 API 規格文件');
    expect(input().getAttribute('aria-activedescendant')).toBe('palette-task-t1');
    fireEvent.keyDown(input(), { key: 'ArrowUp' }); // wraps to the last action
    expect(input().getAttribute('aria-activedescendant')).toBe(`palette-a-board-${SIDE}`);
    fireEvent.mouseMove(screen.getByRole('option', { name: /前往今日焦點/ }));
    expect(input().getAttribute('aria-activedescendant')).toBe('palette-a-focus');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/focus');
  });

  it('with no match, Enter creates the parsed task on the current board and opens it', async () => {
    renderPalette();
    await screen.findByText('撰寫 API 規格文件');
    fireEvent.change(input(), { target: { value: 'zzz !高 #x' } });
    await screen.findByText('找不到「zzz !高 #x」— 按 ↵ 直接建立成新任務');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(created[0]).toMatchObject({ boardId: MAIN, title: 'zzz', priority: 1, tags: ['x'] });
    expect(push).toHaveBeenCalledWith(`/b/${MAIN}?task=${created[0].id as string}`);
  });

  it('on /focus the new task goes to the first board; export/import is disabled', async () => {
    pathname = '/focus';
    renderPalette();
    await screen.findByText('撰寫 API 規格文件');
    expect(screen.getByRole('option', { name: /匯出／匯入目前看板/ }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('option', { name: /匯出／匯入目前看板/ }));
    expect(onExportImport).not.toHaveBeenCalled();
    // reminders are not tied to a board
    expect(screen.getByRole('option', { name: /開啟到期提醒/ }).getAttribute('aria-disabled')).toBeNull();
    fireEvent.change(input(), { target: { value: 'zzz' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ boardId: MAIN, title: 'zzz' });
  });

  it('runs the export/import and reminder handlers', async () => {
    renderPalette();
    await screen.findByText('撰寫 API 規格文件');
    fireEvent.click(screen.getByRole('option', { name: /匯出／匯入目前看板/ }));
    expect(onExportImport).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('option', { name: /開啟到期提醒/ }));
    expect(onReminders).toHaveBeenCalledTimes(1);
  });
});
