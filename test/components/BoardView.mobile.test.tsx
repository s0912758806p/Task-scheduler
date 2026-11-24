// @vitest-environment jsdom
// Phone layout (spec §9 「手機」, < 768px): one column at a time behind a segmented control, no drag and
// drop, ☰ 看板名稱▾ 🔍 header, floating 新增任務 button. jsdom has no layout, so the 375px "no horizontal
// scroll" check is manual (see the Task 16 report); here: structure and behaviour.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/client/store';
import { MOBILE_QUERY } from '@/client/useMediaQuery';
import { createToaster, UndoProvider } from '@/client/undo';
import { BoardView } from '@/components/BoardView/BoardView';
import { todayISO } from '@/lib/dates';
import type { Board, Task } from '@/lib/types';
import { stubBrowserApis } from '../helpers/dom';
import { installFetch, jsonResponse, route } from '../helpers/fetch';
import { BOARD_ID, sampleTasksAsTasks } from '../fixtures/tasks';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => `/b/${BOARD_ID}`,
}));

const boards: Board[] = [
  { id: BOARD_ID, name: '我的看板', position: 1024, createdAt: '2026-11-01T00:00:00.000Z', openCount: 8 },
  { id: 'b2', name: '另一個', position: 2048, createdAt: '2026-11-01T00:00:00.000Z', openCount: 0 },
];
let tasks: Task[];

/** matchMedia stub: `matches` is true for MOBILE_QUERY when `mobile`. */
function stubMatchMedia(mobile: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === MOBILE_QUERY && mobile,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  stubBrowserApis();
  push.mockReset();
  tasks = sampleTasksAsTasks(todayISO());
  installFetch(async (req) => {
    const r = route(req);
    if (r === 'GET /api/boards') return jsonResponse(boards);
    if (r === 'GET /api/tasks') return jsonResponse(tasks);
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBoard(boardId = BOARD_ID) {
  const toaster = createToaster();
  const store = makeStore({ toast: toaster.show });
  const ui = (id: string) => (
    <Provider store={store}>
      <UndoProvider toaster={toaster}>
        <BoardView boardId={id} />
      </UndoProvider>
    </Provider>
  );
  const view = render(ui(boardId));
  return { store, rerenderBoard: (id: string) => view.rerender(ui(id)) };
}

const count = (status: Task['status']) => tasks.filter((t) => t.status === status).length;

describe('BoardView on a phone', () => {
  beforeEach(() => stubMatchMedia(true));

  it('shows a segmented control with counts and only the selected column (待處理 first)', async () => {
    renderBoard();

    const tablist = await screen.findByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      `待處理 ${count('todo')}`,
      `進行中 ${count('in-progress')}`,
      `已完成 ${count('done')}`,
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(screen.getByText('完成專案需求分析')).toBeTruthy();
    expect(screen.queryByText('設計資料庫結構')).toBeNull();
  });

  it('tapping 進行中 swaps the visible column', async () => {
    renderBoard();

    fireEvent.click(await screen.findByRole('tab', { name: /^進行中/ }));

    expect(screen.getByRole('tab', { name: /^進行中/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('設計資料庫結構')).toBeTruthy();
    expect(screen.queryByText('完成專案需求分析')).toBeNull();
    expect(screen.getByRole('region', { name: '進行中' })).toBeTruthy();
  });

  it('tab counts follow the filters', async () => {
    renderBoard();

    fireEvent.click(await screen.findByRole('button', { name: /^逾期/ }));

    const label = (n: RegExp) => screen.getByRole('tab', { name: n }).textContent;
    expect(label(/^待處理/)).not.toBe(`待處理 ${count('todo')}`);
    expect(label(/^已完成/)).toBe('已完成 0');
  });

  it('resets to 待處理 when the board changes', async () => {
    const { rerenderBoard } = renderBoard();
    fireEvent.click(await screen.findByRole('tab', { name: /^已完成/ }));
    expect(screen.getByRole('tab', { name: /^已完成/ }).getAttribute('aria-selected')).toBe('true');

    rerenderBoard('b2');
    await screen.findByRole('tab', { name: /^待處理/ });

    expect(screen.getByRole('tab', { name: /^待處理/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('renders no drag handles (drag and drop is off)', async () => {
    renderBoard();
    await screen.findByRole('tablist');

    expect(document.querySelector('[data-rfd-drag-handle-draggable-id]')).toBeNull();
    expect(document.querySelector('[data-rfd-droppable-id]')).toBeNull();
  });

  it('has a floating 新增任務 button that opens ?task=new', async () => {
    renderBoard();

    fireEvent.click(await screen.findByRole('button', { name: '新增任務' }));

    expect(push).toHaveBeenCalledWith('?task=new', { scroll: false });
  });

  it('header is ☰ 看板名稱▾ 🔍: ☰ and the name open the sidebar, search opens the palette', async () => {
    const { store } = renderBoard();

    expect(await screen.findByRole('heading', { level: 1, name: /我的看板/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '開啟側欄' }));
    expect(store.getState().ui.sidebarOpen).toBe(true);
    store.dispatch({ type: 'ui/setSidebarOpen', payload: false });
    fireEvent.click(screen.getByRole('button', { name: /我的看板/ }));
    expect(store.getState().ui.sidebarOpen).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '搜尋與指令' }));
    expect(store.getState().ui.paletteOpen).toBe(true);
  });

  it('the card 「→」 moves a task on (no drag needed)', async () => {
    const sent: unknown[] = [];
    installFetch(async (req) => {
      const r = route(req);
      if (r === 'GET /api/boards') return jsonResponse(boards);
      if (r === 'GET /api/tasks') return jsonResponse(tasks);
      sent.push(await req.json());
      return jsonResponse({ ...tasks[0], status: 'in-progress' });
    });
    renderBoard();

    fireEvent.click(await screen.findByRole('button', { name: '開始處理：完成專案需求分析' }));

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ status: 'in-progress' });
  });
});

describe('BoardView on desktop', () => {
  beforeEach(() => stubMatchMedia(false));

  it('keeps three columns, no tabs and no floating button', async () => {
    renderBoard();

    expect(await screen.findAllByRole('region')).toHaveLength(3);
    expect(screen.queryByRole('tablist')).toBeNull();
    // The only 「新增任務」 is the top-bar button (with the N hint), not a FAB.
    expect(screen.getAllByRole('button', { name: /新增任務/ })).toHaveLength(1);
  });
});
