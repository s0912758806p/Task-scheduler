// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/client/store';
import { createToaster, UndoProvider } from '@/client/undo';
import { TaskDetailPanel } from '@/components/TaskDetailPanel/TaskDetailPanel';
import { todayISO } from '@/lib/dates';
import type { Task } from '@/lib/types';
import { stubBrowserApis } from '../helpers/dom';
import { errorResponse, installFetch, jsonResponse, route } from '../helpers/fetch';
import { BOARD_ID, sampleTasksAsTasks } from '../fixtures/tasks';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => `/b/${BOARD_ID}`,
}));

const OTHER_BOARD = 'board-other';

let tasks: Task[];
let sent: { route: string; body: unknown }[];
/** PATCH bodies with this dependsOn id are refused with 409 DEPENDENCY_CYCLE. */
const CYCLE_ID = 'sample-6';

beforeEach(() => {
  stubBrowserApis();
  replace.mockReset();
  tasks = sampleTasksAsTasks(todayISO());
  // 撰寫 API 規格文件 (sample-2): 2 of its 3 subtasks done.
  tasks[1].subtasks[1].done = true;
  tasks.push({ ...tasks[0], id: 'other-1', boardId: OTHER_BOARD, title: '別的看板的任務' });
  sent = [];
  installFetch(async (req) => {
    const r = route(req);
    if (r === 'GET /api/tasks') return jsonResponse(tasks);
    if (r === 'GET /api/boards') return jsonResponse([]);
    const body = req.method === 'DELETE' ? null : await req.json();
    sent.push({ route: r, body });
    const id = r.split('/').at(-1)!;
    if (req.method === 'PATCH') {
      const patch = body as Partial<Task>;
      if (patch.dependsOn?.includes(CYCLE_ID)) {
        return errorResponse(409, 'DEPENDENCY_CYCLE', '前置任務不能形成循環');
      }
      return jsonResponse({ ...tasks.find((t) => t.id === id)!, ...patch });
    }
    if (r === 'DELETE /api/tasks/' + id) return jsonResponse(null, 204);
    if (r === 'POST /api/tasks') {
      const input = body as Partial<Task>;
      return jsonResponse(
        {
          description: null,
          dueDate: null,
          position: 0,
          tags: [],
          subtasks: [],
          dependsOn: [],
          completedAt: null,
          createdAt: '2026-11-23T00:00:00.000Z',
          updatedAt: '2026-11-23T00:00:00.000Z',
          ...input,
        },
        201,
      );
    }
    return errorResponse(404, 'NOT_FOUND', 'x');
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderPanel(taskId: string, boardId: string | null = BOARD_ID) {
  const toaster = createToaster();
  const store = makeStore({ toast: toaster.show });
  const onClose = vi.fn();
  const view = render(
    <Provider store={store}>
      <UndoProvider toaster={toaster}>
        <TaskDetailPanel taskId={taskId} boardId={boardId} onClose={onClose} />
      </UndoProvider>
    </Provider>,
  );
  return { store, toaster, onClose, ...view };
}

const titleBox = () => screen.findByRole('textbox', { name: '任務名稱' });

describe('TaskDetailPanel — edit', () => {
  it('shows the task with its subtask progress; ticking the last subtask sends all subtasks done', async () => {
    renderPanel('sample-2');

    expect(((await titleBox()) as HTMLTextAreaElement).value).toBe('撰寫 API 規格文件');
    expect(screen.getByText('2 / 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: '補充錯誤碼說明' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].route).toBe('PATCH /api/tasks/sample-2');
    const { subtasks } = sent[0].body as Task;
    expect(subtasks).toHaveLength(3);
    expect(subtasks.every((s) => s.done)).toBe(true);
    expect(await screen.findByText('3 / 3')).toBeTruthy();
  });

  it('adds a subtask with Enter and deletes one, each as one PATCH', async () => {
    renderPanel('sample-2');
    const input = await screen.findByRole('textbox', { name: '新增子任務' });

    fireEvent.change(input, { target: { value: '  寫範例  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(sent).toHaveLength(1));
    const added = (sent[0].body as Task).subtasks;
    expect(added.map((s) => [s.title, s.done])).toEqual([
      ['列出所有 API 端點', true],
      ['撰寫 Request/Response schema', true],
      ['補充錯誤碼說明', false],
      ['寫範例', false],
    ]);
    expect(added[3].id).toMatch(/^[0-9a-f-]{36}$/);
    expect((input as HTMLInputElement).value).toBe('');

    fireEvent.click(await screen.findByRole('button', { name: '刪除子任務：列出所有 API 端點' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect((sent[1].body as Task).subtasks.map((s) => s.title)).toEqual([
      '撰寫 Request/Response schema',
      '補充錯誤碼說明',
      '寫範例',
    ]);
  });

  it('a blocked task cannot move to 進行中 or 已完成 and says what it waits for', async () => {
    renderPanel('sample-3'); // 建立 CI/CD 流程 waits for 撰寫 API 規格文件 (todo)

    const group = await screen.findByRole('group', { name: '狀態' });
    expect((within(group).getByRole('button', { name: '進行中' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(group).getByRole('button', { name: '已完成' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(group).getByRole('button', { name: '待處理' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.mouseEnter(within(group).getByRole('button', { name: '進行中' }).parentElement!);
    expect(await screen.findByText('等待前置任務：撰寫 API 規格文件')).toBeTruthy();
  });

  it('a status button sends the status change', async () => {
    renderPanel('sample-2');

    fireEvent.click(await screen.findByRole('button', { name: '進行中' }));

    await waitFor(() => expect(sent).toEqual([{ route: 'PATCH /api/tasks/sample-2', body: { status: 'in-progress' } }]));
  });

  it('title edits are sent once, 600 ms after typing stops', async () => {
    renderPanel('sample-2');
    const box = await titleBox();
    vi.useFakeTimers();

    fireEvent.change(box, { target: { value: '撰寫 API' } });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.change(box, { target: { value: '撰寫 API 文件' } });
    act(() => vi.advanceTimersByTime(599));
    expect(sent).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    vi.useRealTimers();

    await waitFor(() => expect(sent).toEqual([{ route: 'PATCH /api/tasks/sample-2', body: { title: '撰寫 API 文件' } }]));
  });

  it('description is sent on blur without waiting', async () => {
    renderPanel('sample-2');
    const desc = await screen.findByRole('textbox', { name: '描述' });

    fireEvent.focus(desc);
    fireEvent.change(desc, { target: { value: '新的描述' } });
    fireEvent.blur(desc);

    await waitFor(() =>
      expect(sent).toEqual([{ route: 'PATCH /api/tasks/sample-2', body: { description: '新的描述' } }]),
    );
  });

  it('an empty title is never sent: it shows 「請輸入任務名稱」 and blur restores the saved title', async () => {
    renderPanel('sample-2');
    const box = (await titleBox()) as HTMLTextAreaElement;

    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '   ' } });
    expect(screen.getByText('請輸入任務名稱')).toBeTruthy();
    fireEvent.blur(box);

    expect(box.value).toBe('撰寫 API 規格文件');
    await new Promise((r) => setTimeout(r, 700));
    expect(sent).toEqual([]);
  });

  it('a pending title edit is sent when the panel goes away', async () => {
    const { unmount } = renderPanel('sample-2');
    fireEvent.change(await titleBox(), { target: { value: '改過的標題' } });

    unmount();

    await waitFor(() => expect(sent).toEqual([{ route: 'PATCH /api/tasks/sample-2', body: { title: '改過的標題' } }]));
  });

  it('Esc closes the panel, also from inside an input', async () => {
    const { onClose } = renderPanel('sample-2');

    fireEvent.keyDown(await titleBox(), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('刪除 deletes the task and closes the panel', async () => {
    const { onClose } = renderPanel('sample-2');

    fireEvent.click(await screen.findByRole('button', { name: '刪除' }));

    await waitFor(() => expect(sent).toEqual([{ route: 'DELETE /api/tasks/sample-2', body: null }]));
    expect(onClose).toHaveBeenCalled();
  });

  it('前置任務 lists only other tasks of the same board, done ones marked 「✓ 」', async () => {
    renderPanel('sample-2');

    fireEvent.mouseDown(await screen.findByRole('combobox', { name: '前置任務' }));

    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toContain('完成專案需求分析');
    expect(options).toContain('✓ 建立前端框架');
    expect(options).not.toContain('撰寫 API 規格文件');
    expect(options).not.toContain('別的看板的任務');
  });

  it('a dependency the server refuses (409) is toasted and the selection reverts', async () => {
    const { toaster } = renderPanel('sample-2');
    const combo = await screen.findByRole('combobox', { name: '前置任務' });
    const cycleTitle = tasks.find((t) => t.id === CYCLE_ID)!.title;

    fireEvent.mouseDown(combo);
    fireEvent.click(await screen.findByRole('option', { name: cycleTitle }));

    await waitFor(() => expect(toaster.get()?.text).toBe('前置任務不能形成循環'));
    expect(sent).toEqual([{ route: 'PATCH /api/tasks/sample-2', body: { dependsOn: [CYCLE_ID] } }]);
    const selector = combo.closest('.ant-select')!;
    await waitFor(() => expect(within(selector as HTMLElement).queryByTitle(cycleTitle)).toBeNull());
  });

  it('an unknown or deleted task says 「找不到這筆任務」 with a close button', async () => {
    const { onClose } = renderPanel('no-such-task');

    expect(await screen.findByText('找不到這筆任務')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('TaskDetailPanel — create (?task=new)', () => {
  it('focuses the title; an empty title shows 「請輸入任務名稱」 and nothing is created', async () => {
    renderPanel('new');
    const box = await titleBox();
    expect(document.activeElement).toBe(box);

    fireEvent.click(screen.getByRole('button', { name: '建立' }));

    expect(screen.getByText('請輸入任務名稱')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toEqual([]);
  });

  it('⌘Enter creates the task (todo, priority 2) on the board and switches the URL to its id', async () => {
    renderPanel('new');
    const box = await titleBox();

    fireEvent.change(box, { target: { value: '  修 bug  ' } });
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true });

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(sent).toHaveLength(1);
    expect(sent[0].route).toBe('POST /api/tasks');
    const body = sent[0].body as Task;
    expect(body).toMatchObject({ boardId: BOARD_ID, title: '修 bug', status: 'todo', priority: 2 });
    expect(replace).toHaveBeenCalledWith(`?task=${body.id}`, { scroll: false });
  });

  it('with an open prerequisite selected only 待處理 is allowed', async () => {
    renderPanel('new');
    await titleBox();

    fireEvent.click(screen.getByRole('button', { name: '進行中' }));
    expect(screen.getByRole('button', { name: '進行中' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '前置任務' }));
    fireEvent.click(await screen.findByRole('option', { name: '完成專案需求分析' }));

    expect(screen.getByRole('button', { name: '待處理' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('button', { name: '進行中' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
