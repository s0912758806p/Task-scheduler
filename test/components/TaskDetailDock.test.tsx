// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/client/store';
import { createToaster, UndoProvider } from '@/client/undo';
import { MOBILE_QUERY, useMediaQuery } from '@/client/useMediaQuery';
import { boardIdFromPath, TaskDetailDock } from '@/components/TaskDetailPanel/TaskDetailDock';
import { todayISO } from '@/lib/dates';
import type { Board } from '@/lib/types';
import { stubBrowserApis } from '../helpers/dom';
import { installFetch, jsonResponse, route } from '../helpers/fetch';
import { BOARD_ID, sampleTasksAsTasks } from '../fixtures/tasks';

const replace = vi.fn();
let search = '';
let pathname = `/b/${BOARD_ID}`;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => pathname,
}));

const boards: Board[] = [
  { id: 'first-board', name: '第一個', position: 1024, createdAt: '2026-11-01T00:00:00.000Z', openCount: 0 },
  { id: BOARD_ID, name: '我的看板', position: 2048, createdAt: '2026-11-01T00:00:00.000Z', openCount: 0 },
];
let posted: unknown[];

/** matchMedia stub whose `matches` is `mobile` for MOBILE_QUERY; returns the change listeners. */
function stubMatchMedia(mobile: boolean) {
  const listeners: (() => void)[] = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === MOBILE_QUERY && mobile,
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
  return listeners;
}

beforeEach(() => {
  stubBrowserApis();
  replace.mockReset();
  search = '';
  pathname = `/b/${BOARD_ID}`;
  posted = [];
  const tasks = sampleTasksAsTasks(todayISO());
  installFetch(async (req) => {
    const r = route(req);
    if (r === 'GET /api/boards') return jsonResponse(boards);
    if (r === 'GET /api/tasks') return jsonResponse(tasks);
    const body = await req.json();
    posted.push(body);
    return jsonResponse({ ...tasks[0], ...body }, 201);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDock() {
  const toaster = createToaster();
  const store = makeStore({ toast: toaster.show });
  return render(
    <Provider store={store}>
      <UndoProvider toaster={toaster}>
        <TaskDetailDock />
      </UndoProvider>
    </Provider>,
  );
}

describe('TaskDetailDock', () => {
  it('renders nothing without ?task=', () => {
    const { container } = renderDock();
    expect(container.innerHTML).toBe('');
  });

  it('shows the task in the right column; 關閉 removes ?task= and keeps the path', async () => {
    search = 'task=sample-2&x=1';
    renderDock();

    expect(await screen.findByRole('region', { name: '任務詳情' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    expect(replace).toHaveBeenCalledWith(`/b/${BOARD_ID}?x=1`, { scroll: false });
  });

  it('on /focus a new task goes to the first board', async () => {
    pathname = '/focus';
    search = 'task=new';
    renderDock();

    fireEvent.change(await screen.findByRole('textbox', { name: '任務名稱' }), { target: { value: '新任務' } });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '建立' }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ boardId: 'first-board', title: '新任務' });
  });

  it('on a phone the panel is a bottom drawer', async () => {
    stubMatchMedia(true);
    search = 'task=sample-2';
    renderDock();

    expect(await screen.findByRole('region', { name: '任務詳情' })).toBeTruthy();
    expect(document.querySelector('.ant-drawer-bottom')).toBeTruthy();
  });

  it('boardIdFromPath reads /b/[boardId] only', () => {
    expect(boardIdFromPath('/b/abc')).toBe('abc');
    expect(boardIdFromPath('/b/abc/x')).toBe('abc');
    expect(boardIdFromPath('/focus')).toBeNull();
  });
});

describe('useMediaQuery', () => {
  it('follows matchMedia and its change events', () => {
    let mobile = false;
    const listeners: (() => void)[] = [];
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        get matches() {
          return mobile;
        },
        media: query,
        addEventListener: (_: string, fn: () => void) => listeners.push(fn),
        removeEventListener: vi.fn(),
      })),
    );
    const { result } = renderHook(() => useMediaQuery(MOBILE_QUERY));
    expect(result.current).toBe(false);

    mobile = true;
    act(() => listeners.forEach((fn) => fn()));
    expect(result.current).toBe(true);
  });
});
