// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/client/store';
import { createToaster, UndoProvider } from '@/client/undo';
import { BoardView } from '@/components/BoardView/BoardView';
import { todayISO } from '@/lib/dates';
import type { Board, Task } from '@/lib/types';
import { stubBrowserApis } from '../helpers/dom';
import { installFetch, jsonResponse, route } from '../helpers/fetch';
import { BOARD_ID, sampleTasksAsTasks } from '../fixtures/tasks';

const push = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => `/b/${BOARD_ID}`,
}));

const EMPTY_ID = 'board-empty';
const boards: Board[] = [
  { id: BOARD_ID, name: '我的看板', position: 1024, createdAt: '2026-11-01T00:00:00.000Z', openCount: 8 },
  { id: EMPTY_ID, name: '空看板', position: 2048, createdAt: '2026-11-01T00:00:00.000Z', openCount: 0 },
];

let tasks: Task[];
let sent: { route: string; body: unknown }[];

beforeEach(() => {
  stubBrowserApis();
  push.mockReset();
  search = '';
  tasks = sampleTasksAsTasks(todayISO());
  sent = [];
  installFetch(async (req) => {
    const r = route(req);
    if (r === 'GET /api/boards') return jsonResponse(boards);
    if (r === 'GET /api/tasks') return jsonResponse(tasks);
    const body = await req.json();
    sent.push({ route: r, body });
    if (r === 'POST /api/tasks/batch') return jsonResponse({ updated: (body as { ids: string[] }).ids, skipped: [] });
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBoard(boardId: string) {
  const toaster = createToaster();
  const store = makeStore({ toast: toaster.show });
  render(
    <Provider store={store}>
      <UndoProvider toaster={toaster}>
        <BoardView boardId={boardId} />
      </UndoProvider>
    </Provider>,
  );
  return { store, toaster };
}

describe('BoardView', () => {
  it('shows the skeleton first, then the board with its counts and three columns', async () => {
    renderBoard(BOARD_ID);
    expect(screen.getByLabelText('載入中')).toBeTruthy();

    expect(await screen.findByRole('heading', { level: 1, name: '我的看板' })).toBeTruthy();
    expect(screen.getByText('11 項任務 · 3 項進行中')).toBeTruthy();
    const todo = screen.getByRole('region', { name: '待處理' });
    expect(within(todo).getByText('完成專案需求分析')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: '已完成' })).getByText('建立前端框架')).toBeTruthy();
  });

  it('opens the detail panel with ?task=<id> when a card is clicked, and marks that card', async () => {
    search = 'task=sample-2';
    renderBoard(BOARD_ID);

    fireEvent.click(await screen.findByRole('button', { name: '完成專案需求分析' }));
    expect(push).toHaveBeenCalledWith('?task=sample-1', { scroll: false });
    expect(screen.getByRole('button', { name: '撰寫 API 規格文件' }).closest('article')!.className).toMatch(/selected/);
  });

  it('an unknown board says 「找不到這個看板」 with a way back to 今日焦點', async () => {
    renderBoard('not-mine');

    expect(await screen.findByText('找不到這個看板')).toBeTruthy();
    expect(screen.getByRole('link', { name: '回到今日焦點' }).getAttribute('href')).toBe('/focus');
  });

  it('an empty board offers 載入範例任務 and shows the empty columns', async () => {
    renderBoard(EMPTY_ID);

    expect(await screen.findByRole('button', { name: '載入範例任務' })).toBeTruthy();
    expect(screen.getAllByText('這一欄目前是空的')).toHaveLength(3);
  });

  it('a chip filter that leaves a column empty says 「沒有符合篩選的任務」', async () => {
    renderBoard(BOARD_ID);

    fireEvent.click(await screen.findByRole('button', { name: /^逾期/ }));

    const done = screen.getByRole('region', { name: '已完成' });
    expect(within(done).getByText('沒有符合篩選的任務')).toBeTruthy();
    expect(screen.queryByText('撰寫 API 規格文件')).toBeNull();
  });

  it('batch mode: select two cards, 刪除 sends one batch delete and clears the selection', async () => {
    renderBoard(BOARD_ID);

    fireEvent.click(await screen.findByRole('button', { name: '選取' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '選取：完成專案需求分析' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '選取：安全性稽核' }));
    expect(screen.getByText('已選 2 筆')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '刪除' }));

    await waitFor(() => expect(screen.getByText('已選 0 筆')).toBeTruthy());
    expect(sent).toEqual([
      { route: 'POST /api/tasks/batch', body: { ids: ['sample-1', 'sample-5'], op: 'delete' } },
    ]);
    expect(screen.queryByText('完成專案需求分析')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByRole('button', { name: '選取' })).toBeTruthy();
  });
});
