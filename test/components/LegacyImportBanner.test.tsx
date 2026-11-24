// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/client/store';
import { createToaster, UndoProvider } from '@/client/undo';
import { LegacyImportBanner } from '@/components/LegacyImportBanner/LegacyImportBanner';
import { installFetch, jsonResponse, route } from '../helpers/fetch';

let posted: { route: string; body: unknown }[];

beforeEach(() => {
  localStorage.clear();
  posted = [];
  installFetch(async (req) => {
    const r = route(req);
    if (req.method === 'POST') posted.push({ route: r, body: await req.json() });
    if (r === 'POST /api/import/local') return jsonResponse({ boards: [], taskCount: 7, warnings: [] });
    return jsonResponse([]);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderBanner() {
  const toaster = createToaster();
  const store = makeStore({ toast: toaster.show });
  render(
    <Provider store={store}>
      <UndoProvider toaster={toaster}>
        <LegacyImportBanner />
      </UndoProvider>
    </Provider>,
  );
  return toaster;
}

// The old Vite app's real shapes: boardSlice persisted `{ boards, activeBoardId }` under
// taskSchedulerBoards (git show a4cd36b:src/store/boardSlice.ts) and the task array under
// taskSchedulerTasks_v3.
const legacyBoards = {
  boards: [
    { id: 'default', name: '我的看板', createdAt: 0 },
    { id: 'b2', name: '個人', createdAt: 1732300000000 },
    { id: 'b3', name: '副業', createdAt: 1732300500000 },
  ],
  activeBoardId: 'b2',
};
const legacyTasks = Array.from({ length: 10 }, (_, i) => ({
  id: String(i + 1),
  title: `任務 ${i + 1}`,
  status: 'todo',
  priority: 2,
  boardId: ['default', 'b2', 'b3'][i % 3],
  createdAt: 1732300000000 + i,
}));

describe('LegacyImportBanner', () => {
  it('shows the board and task counts of the old localStorage data', async () => {
    localStorage.setItem('taskSchedulerBoards', JSON.stringify(legacyBoards));
    localStorage.setItem('taskSchedulerTasks_v3', JSON.stringify(legacyTasks));
    renderBanner();
    expect(await screen.findByText('發現這台裝置上的舊資料（3 個看板、10 筆任務）')).toBeTruthy();
  });

  it('still counts a bare board array, and tasks without a boards key as one default board', async () => {
    localStorage.setItem('taskSchedulerBoards', JSON.stringify(legacyBoards.boards.slice(0, 2)));
    localStorage.setItem('taskSchedulerTasks_v3', JSON.stringify(legacyTasks));
    renderBanner();
    expect(await screen.findByText('發現這台裝置上的舊資料（2 個看板、10 筆任務）')).toBeTruthy();
    cleanup();

    localStorage.removeItem('taskSchedulerBoards');
    renderBanner();
    expect(await screen.findByText('發現這台裝置上的舊資料（1 個看板、10 筆任務）')).toBeTruthy();
  });

  it('shows nothing without old data, with corrupt JSON, or once migrated', async () => {
    renderBanner();
    expect(screen.queryByText(/發現這台裝置上的舊資料/)).toBeNull();
    cleanup();

    localStorage.setItem('taskSchedulerTasks_v3', '{oops');
    renderBanner();
    expect(screen.queryByText(/發現這台裝置上的舊資料/)).toBeNull();
    cleanup();

    localStorage.setItem('taskSchedulerTasks_v3', JSON.stringify(legacyTasks));
    localStorage.setItem('taskSchedulerMigrated', '1');
    renderBanner();
    expect(screen.queryByText(/發現這台裝置上的舊資料/)).toBeNull();
  });

  it('「略過」hides the banner, writes taskSchedulerMigrated=1 and keeps the old keys', async () => {
    localStorage.setItem('taskSchedulerTasks_v3', JSON.stringify(legacyTasks));
    renderBanner();
    fireEvent.click(await screen.findByRole('button', { name: '略過' }));
    expect(screen.queryByText(/發現這台裝置上的舊資料/)).toBeNull();
    expect(localStorage.getItem('taskSchedulerMigrated')).toBe('1');
    expect(localStorage.getItem('taskSchedulerTasks_v3')).not.toBeNull();
  });

  it('「匯入」posts the old data with the browser time zone, then marks it migrated and toasts', async () => {
    localStorage.setItem('taskSchedulerBoards', JSON.stringify(legacyBoards));
    localStorage.setItem('taskSchedulerTasks_v3', JSON.stringify(legacyTasks));
    const toaster = renderBanner();
    fireEvent.click(await screen.findByRole('button', { name: '匯入' }));
    await waitFor(() => expect(localStorage.getItem('taskSchedulerMigrated')).toBe('1'));
    expect(posted).toEqual([
      {
        route: 'POST /api/import/local',
        body: {
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          boards: legacyBoards,
          tasks: legacyTasks,
        },
      },
    ]);
    expect(toaster.get()?.text).toBe('已匯入 7 筆舊任務');
    expect(screen.queryByText(/發現這台裝置上的舊資料/)).toBeNull();
    expect(localStorage.getItem('taskSchedulerBoards')).not.toBeNull();
  });

  it('keeps the banner (and does not mark migrated) when the import fails', async () => {
    localStorage.setItem('taskSchedulerTasks_v3', JSON.stringify(legacyTasks));
    installFetch(() => jsonResponse({ error: { code: 'TOO_MANY_TASKS', message: '最多 2,000 筆' } }, 413));
    const toaster = renderBanner();
    fireEvent.click(await screen.findByRole('button', { name: '匯入' }));
    await waitFor(() => expect(toaster.get()?.text).toBe('最多 2,000 筆'));
    expect(localStorage.getItem('taskSchedulerMigrated')).toBeNull();
    expect(screen.getByText(/發現這台裝置上的舊資料/)).toBeTruthy();
  });
});
