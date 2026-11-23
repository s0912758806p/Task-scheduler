// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/client/store';
import { ThemeProvider } from '@/client/theme';
import { createToaster, UndoProvider } from '@/client/undo';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { addDays, todayISO } from '@/lib/dates';
import type { Board, Task } from '@/lib/types';
import { stubBrowserApis } from '../helpers/dom';
import { installFetch, jsonResponse, route } from '../helpers/fetch';

const MAIN = '3c7e1a52-0f4b-4d8e-9a61-7b2c5d8e4f10';
const PERSONAL = '9d2f6b81-5c3a-4e7f-8b10-2a4c6e8d0f21';

vi.mock('next/navigation', () => ({
  usePathname: () => `/b/${MAIN}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
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

beforeEach(() => {
  stubBrowserApis();
  installFetch((req) => {
    switch (route(req)) {
      case 'GET /api/boards':
        return jsonResponse(boards);
      case 'GET /api/tasks':
        return jsonResponse(tasks);
      default:
        return jsonResponse({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
    }
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSidebar() {
  const toaster = createToaster();
  const store = makeStore({ toast: toaster.show });
  return render(
    <ThemeProvider initial="light">
      <Provider store={store}>
        <UndoProvider toaster={toaster}>
          <Sidebar user={{ name: '王小明', email: 'ming@example.com', image: null }} />
        </UndoProvider>
      </Provider>
    </ThemeProvider>,
  );
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

  it('shows the email in the user menu as readable text, not a disabled item', async () => {
    renderSidebar();
    fireEvent.click(await screen.findByRole('button', { name: /王小明/ }));

    const email = await screen.findByText('ming@example.com');
    expect(email.closest('[aria-disabled="true"], .ant-dropdown-menu-item-disabled')).toBeNull();
    expect(screen.getByRole('menuitem', { name: /登出/ })).toBeTruthy();
  });
});
