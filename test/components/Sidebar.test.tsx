// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/client/api';
import { makeStore } from '@/client/store';
import { ThemeProvider } from '@/client/theme';
import type { Notifications } from '@/client/useNotifications';
import { createToaster, UndoProvider } from '@/client/undo';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { addDays, todayISO } from '@/lib/dates';
import type { Board, Task } from '@/lib/types';
import { stubBrowserApis } from '../helpers/dom';
import { installFetch, jsonResponse, route } from '../helpers/fetch';

const MAIN = '3c7e1a52-0f4b-4d8e-9a61-7b2c5d8e4f10';
const PERSONAL = '9d2f6b81-5c3a-4e7f-8b10-2a4c6e8d0f21';

let pathname = `/b/${MAIN}`;
const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/client/authClient', () => ({ signOut: vi.fn() }));

const boards: Board[] = [
  { id: MAIN, name: '我的看板', position: 1024, createdAt: '2026-11-01T00:00:00.000Z', openCount: 0 },
  { id: PERSONAL, name: '個人專案', position: 2048, createdAt: '2026-11-01T00:00:00.000Z', openCount: 0 },
];

function task(id: string, boardId: string, over: Partial<Task>): Task {
  return {
    id,
    boardId,
    title: id,
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

const today = todayISO();
const tasks: Task[] = [
  // 我的看板: 3 open (one overdue, one due today), 1 done
  task('m1', MAIN, { dueDate: addDays(today, -2) }),
  task('m2', MAIN, { status: 'in-progress', dueDate: today }),
  task('m3', MAIN, { dueDate: addDays(today, 3) }),
  task('m4', MAIN, { status: 'done', dueDate: addDays(today, -5), completedAt: '2026-11-02T00:00:00.000Z' }),
  // 個人專案: 2 open (one due today), 0 done
  task('p1', PERSONAL, { dueDate: today, priority: 0 }),
  task('p2', PERSONAL, {}),
];

const NEW_BOARD: Board = {
  id: '5e8a1c40-7b2d-4f6e-9c31-0d4b6a8e2f53',
  name: '新專案',
  position: 3072,
  createdAt: '2026-11-23T00:00:00.000Z',
  openCount: 0,
};
/** Non-GET requests the fake server received. */
let writes: string[];

beforeEach(() => {
  pathname = `/b/${MAIN}`;
  push.mockReset();
  writes = [];
  stubBrowserApis();
  installFetch((req) => {
    const r = route(req);
    if (req.method !== 'GET') writes.push(r);
    switch (r) {
      case 'GET /api/boards':
        return jsonResponse(boards);
      case 'GET /api/tasks':
        return jsonResponse(tasks);
      case 'POST /api/boards':
        return jsonResponse(NEW_BOARD, 201);
      default:
        return jsonResponse({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
    }
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSidebar(reminders: Notifications = { permission: 'default', enable: vi.fn() }) {
  const toaster = createToaster();
  const store = makeStore({ toast: toaster.show });
  render(
    <ThemeProvider initial="light">
      <Provider store={store}>
        <UndoProvider toaster={toaster}>
          <Sidebar user={{ name: '王小明', email: 'ming@example.com', image: null }} reminders={reminders} />
        </UndoProvider>
      </Provider>
    </ThemeProvider>,
  );
  return store;
}

describe('Sidebar', () => {
  it('lists the boards with their open-task counts and marks the current one', async () => {
    renderSidebar();

    const main = await screen.findByRole('link', { name: /我的看板/ });
    const personal = screen.getByRole('link', { name: /個人專案/ });
    await within(main).findByText('3');
    expect(within(personal).getByText('2')).toBeTruthy();
    expect(main.getAttribute('aria-current')).toBe('page');
    expect(personal.getAttribute('aria-current')).toBeNull();
    expect(main.getAttribute('href')).toBe(`/b/${MAIN}`);
  });

  it('shows overdue + due-today across all boards on the 今日焦點 badge', async () => {
    renderSidebar();

    const focus = await screen.findByRole('link', { name: /今日焦點/ });
    // m1 overdue, m2 today, p1 today; the done m4 does not count
    await within(focus).findByText('3');
    expect(focus.getAttribute('href')).toBe('/focus');
  });

  it('renders the bottom controls as real buttons', async () => {
    renderSidebar();
    await screen.findByRole('link', { name: /我的看板/ });

    for (const name of [/新增看板/, /主題：/, /匯入／匯出/, /到期提醒/, /快捷鍵/, /王小明/]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('Esc in the inline rename cancels it and claims the key (preventDefault)', async () => {
    renderSidebar();
    fireEvent.doubleClick(await screen.findByRole('link', { name: /個人專案/ }));
    const input = screen.getByRole('textbox', { name: '看板名稱' });
    fireEvent.change(input, { target: { value: '改一半' } });

    const notPrevented = fireEvent.keyDown(input, { key: 'Escape' });

    expect(notPrevented).toBe(false);
    expect(screen.queryByRole('textbox', { name: '看板名稱' })).toBeNull();
    expect(screen.getByRole('link', { name: /個人專案/ })).toBeTruthy();
  });

  it("Safari's composition-confirming Enter (isComposing false, keyCode 229) does not commit the rename", async () => {
    renderSidebar();
    fireEvent.doubleClick(await screen.findByRole('link', { name: /個人專案/ }));
    const input = screen.getByRole('textbox', { name: '看板名稱' });
    fireEvent.change(input, { target: { value: '副業' } });

    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: false });

    expect(screen.getByRole('textbox', { name: '看板名稱' })).toBe(input);
    await new Promise((r) => setTimeout(r, 20));
    expect(writes).toEqual([]);

    fireEvent.keyDown(input, { key: 'Enter' }); // the Enter after the composition saves it
    await waitFor(() => expect(writes).toEqual([`PATCH /api/boards/${PERSONAL}`]));
  });

  it('新增看板: Enter creates the board, which is in the boards cache before navigating to it', async () => {
    const store = renderSidebar();
    await screen.findByRole('link', { name: /我的看板/ });
    let cachedAtPush: string[] | undefined;
    push.mockImplementation(() => {
      cachedAtPush = api.endpoints.getBoards.select()(store.getState()).data?.map((b) => b.id);
    });

    fireEvent.click(screen.getByRole('button', { name: /新增看板/ }));
    const input = await screen.findByRole('textbox', { name: '看板名稱' });
    fireEvent.change(input, { target: { value: '新專案' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(writes).toEqual([]); // Safari's composition-confirming Enter creates nothing

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/b/${NEW_BOARD.id}`));
    expect(writes).toEqual(['POST /api/boards']);
    // BoardView looks the board up in this cache: without it, 「找不到這個看板」 flashes until the refetch.
    expect(cachedAtPush).toEqual([MAIN, PERSONAL, NEW_BOARD.id]);
  });

  it('shows the email in the user menu as readable text, not a disabled item', async () => {
    renderSidebar();
    fireEvent.click(await screen.findByRole('button', { name: /王小明/ }));

    const email = await screen.findByText('ming@example.com');
    expect(email.closest('[aria-disabled="true"], .ant-dropdown-menu-item-disabled')).toBeNull();
    expect(screen.getByRole('menuitem', { name: /登出/ })).toBeTruthy();
  });

  it('匯入／匯出 opens the DataMenu on a board and is disabled on /focus', async () => {
    const store = renderSidebar();
    fireEvent.click(await screen.findByRole('button', { name: /匯入／匯出/ }));
    expect(store.getState().ui.dataMenuOpen).toBe(true);
    cleanup();

    pathname = '/focus';
    renderSidebar();
    expect((screen.getByRole('button', { name: /匯入／匯出/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('到期提醒 shows 開啟 until granted, then 已開啟; clicking asks for permission once', async () => {
    const enable = vi.fn();
    renderSidebar({ permission: 'default', enable });
    const button = screen.getByRole('button', { name: /到期提醒/ });
    expect(within(button).getByText('開啟')).toBeTruthy();
    fireEvent.click(button);
    expect(enable).toHaveBeenCalledTimes(1);
    cleanup();

    renderSidebar({ permission: 'granted', enable });
    const on = screen.getByRole('button', { name: /到期提醒/ }) as HTMLButtonElement;
    expect(within(on).getByText('已開啟')).toBeTruthy();
    expect(on.disabled).toBe(true);
  });

  it('shows 此瀏覽器不支援通知 (disabled) when Notification is unavailable', () => {
    renderSidebar({ permission: 'unsupported', enable: vi.fn() });
    expect((screen.getByRole('button', { name: '此瀏覽器不支援通知' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
