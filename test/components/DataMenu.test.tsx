// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/client/store';
import { setDataMenuOpen } from '@/client/uiSlice';
import { createToaster, createUndoStack, UndoProvider } from '@/client/undo';
import { DataMenu, downloadName } from '@/components/DataMenu/DataMenu';
import type { Board } from '@/lib/types';
import { stubBrowserApis } from '../helpers/dom';
import { installFetch, jsonResponse, route } from '../helpers/fetch';

const MAIN = '3c7e1a52-0f4b-4d8e-9a61-7b2c5d8e4f10';
let pathname = `/b/${MAIN}`;
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const boards: Board[] = [{ id: MAIN, name: '我的看板', position: 1024, createdAt: '2026-11-01T00:00:00.000Z', openCount: 0 }];

let sent: { route: string; body: unknown }[];
let importReply: { status: number; body: unknown };
let exportHeaders: Record<string, string>;

beforeEach(() => {
  stubBrowserApis();
  pathname = `/b/${MAIN}`;
  sent = [];
  importReply = { status: 200, body: { imported: ['n1', 'n2'], replaced: ['o1'], warnings: [] } };
  exportHeaders = {
    'Content-Disposition': `attachment; filename="board-2026-11-23.json"; filename*=UTF-8''%E6%88%91%E7%9A%84%E7%9C%8B%E6%9D%BF-2026-11-23.json`,
  };
  installFetch(async (req) => {
    const r = route(req);
    if (r === 'GET /api/boards') return jsonResponse(boards);
    if (r === 'GET /api/tasks') return jsonResponse([]);
    if (r === `GET /api/boards/${MAIN}/export`) return new Response('{"format":"task-scheduler"}', { headers: exportHeaders });
    sent.push({ route: r, body: await req.json() });
    if (r === `POST /api/boards/${MAIN}/import`) return jsonResponse(importReply.body, importReply.status);
    return jsonResponse({ updated: [], skipped: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup() {
  const toaster = createToaster();
  const stack = createUndoStack();
  const store = makeStore({ toast: toaster.show });
  store.dispatch(setDataMenuOpen(true));
  render(
    <Provider store={store}>
      <UndoProvider stack={stack} toaster={toaster}>
        <DataMenu />
      </UndoProvider>
    </Provider>,
  );
  return { toaster, stack, store };
}

function chooseFile(content: string) {
  const file = new File([content], 'board.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => content });
  const input = screen.getByLabelText('選擇要匯入的 JSON 檔案') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('downloadName', () => {
  it('prefers filename*, then filename, else null', () => {
    expect(downloadName(`attachment; filename="a.json"; filename*=UTF-8''%E7%9C%8B-1.json`)).toBe('看-1.json');
    expect(downloadName('attachment; filename="a.json"')).toBe('a.json');
    expect(downloadName(null)).toBeNull();
  });
});

describe('DataMenu', () => {
  it('exports the current board through the response and revokes the object URL', async () => {
    const created = vi.fn(() => 'blob:x');
    const revoked = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked }));
    const downloads: string[] = [];
    /** Revocations seen once the task that clicked the link has finished (null until then). */
    let revokedAfterClickTask: number | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
      setTimeout(() => (revokedAfterClickTask = revoked.mock.calls.length), 0);
    });
    setup();
    await screen.findByText('目前看板：「我的看板」');
    fireEvent.click(screen.getByRole('button', { name: '匯出目前看板' }));
    await waitFor(() => expect(revoked).toHaveBeenCalledWith('blob:x'));
    expect(downloads).toEqual(['我的看板-2026-11-23.json']);
    // Revoked in a later task, not right after click(): some browsers start the download asynchronously.
    expect(revokedAfterClickTask).toBe(0);
  });

  it('toasts the server message when the export fails', async () => {
    installFetch((req) =>
      route(req) === 'GET /api/boards'
        ? jsonResponse(boards)
        : jsonResponse({ error: { code: 'NOT_FOUND', message: '找不到看板' } }, 404),
    );
    const { toaster } = setup();
    await screen.findByText('目前看板：「我的看板」');
    fireEvent.click(screen.getByRole('button', { name: '匯出目前看板' }));
    await waitFor(() => expect(toaster.get()?.text).toBe('找不到看板'));
  });

  it('disables both actions on /focus (no current board)', () => {
    pathname = '/focus';
    setup();
    expect((screen.getByRole('button', { name: '匯出目前看板' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '匯入檔案…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('confirms, imports with the time zone, and pushes one undo command (restore replaced, delete imported)', async () => {
    const { toaster, stack } = setup();
    await screen.findByText('目前看板：「我的看板」');
    chooseFile('{"format":"task-scheduler","version":2}');

    expect(await screen.findByText('匯入會取代「我的看板」目前的任務（其他看板不受影響）。可用 ⌘Z 復原。')).toBeTruthy();
    expect(sent).toEqual([]); // nothing sent before the user confirms
    fireEvent.click(screen.getByRole('button', { name: /匯\s*入$/ }));

    await waitFor(() => expect(toaster.get()?.text).toBe('已匯入 2 筆任務'));
    expect(toaster.get()?.command).not.toBeNull();
    expect(sent).toEqual([
      {
        route: `POST /api/boards/${MAIN}/import`,
        body: {
          file: { format: 'task-scheduler', version: 2 },
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      },
    ]);

    sent.length = 0;
    await stack.undo();
    expect(sent).toEqual([
      { route: 'POST /api/tasks/batch', body: { ids: ['o1'], op: 'restore' } },
      { route: 'POST /api/tasks/batch', body: { ids: ['n1', 'n2'], op: 'delete' } },
    ]);
    sent.length = 0;
    await stack.redo();
    expect(sent).toEqual([
      { route: 'POST /api/tasks/batch', body: { ids: ['o1'], op: 'delete' } },
      { route: 'POST /api/tasks/batch', body: { ids: ['n1', 'n2'], op: 'restore' } },
    ]);
  });

  it('lists the server warnings in a dialog', async () => {
    importReply = { status: 200, body: { imported: ['n1'], replaced: [], warnings: ['第 2 筆：優先級超出範圍，已改為 2'] } };
    setup();
    await screen.findByText('目前看板：「我的看板」');
    chooseFile('[]');
    fireEvent.click(await screen.findByRole('button', { name: /匯\s*入$/ }));
    expect(await screen.findByText('第 2 筆：優先級超出範圍，已改為 2')).toBeTruthy();
  });

  it('toasts the server message on 413 and records no undo command', async () => {
    importReply = { status: 413, body: { error: { code: 'TOO_MANY_TASKS', message: '一次最多匯入 2,000 筆任務' } } };
    const { toaster, stack } = setup();
    await screen.findByText('目前看板：「我的看板」');
    chooseFile('[]');
    fireEvent.click(await screen.findByRole('button', { name: /匯\s*入$/ }));
    await waitFor(() => expect(toaster.get()?.text).toBe('一次最多匯入 2,000 筆任務'));
    expect(stack.canUndo()).toBe(false);
  });

  it('rejects a file that is not JSON without calling the API', async () => {
    const { toaster } = setup();
    await screen.findByText('目前看板：「我的看板」');
    chooseFile('not json');
    await waitFor(() => expect(toaster.get()?.text).toBe('這不是有效的 JSON 檔案'));
    expect(sent).toEqual([]);
  });

  it('undo/redo of a large import send batches of at most 500 ids, in order', async () => {
    const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
    const replaced = ids('o', 1200);
    const imported = ids('n', 900);
    importReply = { status: 200, body: { imported, replaced, warnings: [] } };
    const { stack } = setup();
    await screen.findByText('目前看板：「我的看板」');
    chooseFile('[]');
    fireEvent.click(await screen.findByRole('button', { name: /匯\s*入$/ }));
    await waitFor(() => expect(stack.canUndo()).toBe(true));

    const batches = () =>
      sent.filter((r) => r.route === 'POST /api/tasks/batch').map((r) => {
        const b = r.body as { ids: string[]; op: string };
        return [b.op, b.ids.length, b.ids[0]];
      });
    sent.length = 0;
    await stack.undo();
    expect(batches()).toEqual([
      ['restore', 500, 'o0'], ['restore', 500, 'o500'], ['restore', 200, 'o1000'],
      ['delete', 500, 'n0'], ['delete', 400, 'n500'],
    ]);
    expect(stack.canRedo()).toBe(true);
    sent.length = 0;
    await stack.redo();
    expect(batches()).toEqual([
      ['delete', 500, 'o0'], ['delete', 500, 'o500'], ['delete', 200, 'o1000'],
      ['restore', 500, 'n0'], ['restore', 400, 'n500'],
    ]);
  });
});
