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

const legacyBoards = [
  { id: 'default', name: '我的看板' },
  { id: 'b2', name: '個人' },
];
const legacyTasks = [{ id: '1', title: 'a' }, { id: '2', title: 'b' }, { id: '3', title: 'c' }];

describe('LegacyImportBanner', () => {
  it('shows the board and task counts of the old localStorage data', async () => {
    localStorage.setItem('taskSchedulerBoards', JSON.stringify(legacyBoards));
    localStorage.setItem('taskSchedulerTasks_v3', JSON.stringify(legacyTasks));
    renderBanner();
    expect(await screen.findByText('發現這台裝置上的舊資料（2 個看板、3 筆任務）')).toBeTruthy();
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
