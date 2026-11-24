// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/client/api';
import { makeStore } from '@/client/store';
import { useNotifications } from '@/client/useNotifications';
import { addDays, todayISO } from '@/lib/dates';
import type { Task } from '@/lib/types';
import { installFetch, jsonResponse, route } from '../helpers/fetch';

function task(id: string, over: Partial<Task>): Task {
  return {
    id,
    boardId: 'b1',
    title: `任務 ${id}`,
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

const sent: { title: string; options: NotificationOptions | undefined }[] = [];
let permission: NotificationPermission;
const requestPermission = vi.fn();

class FakeNotification {
  static get permission() {
    return permission;
  }
  static requestPermission = requestPermission;
  constructor(title: string, options?: NotificationOptions) {
    sent.push({ title, options });
  }
}

let tasks: Task[];

beforeEach(() => {
  localStorage.clear();
  sent.length = 0;
  permission = 'default';
  requestPermission.mockReset();
  requestPermission.mockImplementation(async () => {
    permission = 'granted';
    return 'granted';
  });
  vi.stubGlobal('Notification', FakeNotification);
  const today = todayISO();
  tasks = [
    task('late', { dueDate: addDays(today, -2) }),
    task('soon', { dueDate: addDays(today, 1) }),
    task('today', { dueDate: today }),
    task('later', { dueDate: addDays(today, 2) }),
    task('done', { dueDate: addDays(today, -3), status: 'done', completedAt: '2026-11-02T00:00:00.000Z' }),
    task('none', {}),
  ];
  installFetch((req) => (route(req) === 'GET /api/tasks' ? jsonResponse(tasks) : jsonResponse([])));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function setup() {
  const store = makeStore({ toast: vi.fn() });
  await store.dispatch(api.endpoints.getTasks.initiate());
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(() => useNotifications(), { wrapper });
}

describe('useNotifications', () => {
  it('never requests permission on mount; enable() requests it once and checks right away', async () => {
    const { result } = await setup();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(result.current.permission).toBe('default');
    expect(sent).toEqual([]);

    await act(async () => {
      await result.current.enable();
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(result.current.permission).toBe('granted');
    expect(sent.map((n) => n.title).sort()).toEqual(['任務即將到期', '任務即將到期', '任務已逾期']);
  });

  it('notifies overdue and due-soon tasks with tag = id, no icon, and never twice', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    permission = 'granted';
    await setup();

    const late = sent.find((n) => n.title === '任務已逾期')!;
    expect(late.options).toEqual({ body: '「任務 late」已超過截止日', tag: 'late' });
    expect(sent.find((n) => n.options?.tag === 'soon')!.options?.body).toBe('「任務 soon」將在 24 小時內到期');
    expect(sent.find((n) => n.options?.tag === 'today')!.title).toBe('任務即將到期');
    expect(sent).toHaveLength(3); // not 'later', 'done', 'none'
    expect(JSON.parse(localStorage.getItem('taskSchedulerNotifiedIds')!).sort()).toEqual(['late', 'soon', 'today']);

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(sent).toHaveLength(3);
  });

  it('checks again every 10 minutes and notifies tasks that became due since', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    permission = 'granted';
    const store = makeStore({ toast: vi.fn() });
    await store.dispatch(api.endpoints.getTasks.initiate());
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
    renderHook(() => useNotifications(), { wrapper });
    expect(sent).toHaveLength(3);

    act(() => {
      store.dispatch(
        api.util.updateQueryData('getTasks', undefined, (list) => {
          list.push(task('new', { dueDate: addDays(todayISO(), -1) }));
        }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });
    expect(sent).toHaveLength(4);
    expect(sent[3].options?.tag).toBe('new');
  });

  it('does nothing when permission is denied, and reports unsupported browsers', async () => {
    permission = 'denied';
    await setup();
    expect(sent).toEqual([]);
    cleanup();

    vi.unstubAllGlobals();
    installFetch(() => jsonResponse([]));
    const { result } = await setup();
    expect(result.current.permission).toBe('unsupported');
    await act(async () => {
      await result.current.enable();
    });
    expect(sent).toEqual([]);
  });

  it('survives corrupt notified-ids storage', async () => {
    localStorage.setItem('taskSchedulerNotifiedIds', '{oops');
    permission = 'granted';
    await setup();
    expect(sent).toHaveLength(3);
  });

  it('stops for the session and reports unsupported when the constructor throws', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    permission = 'granted';
    let attempts = 0;
    class Throwing {
      static get permission() {
        return permission;
      }
      static requestPermission = requestPermission;
      constructor() {
        attempts++;
        throw new TypeError('Illegal constructor');
      }
    }
    vi.stubGlobal('Notification', Throwing);
    const { result } = await setup();
    expect(attempts).toBe(1);
    await act(async () => {
      await Promise.resolve(); // the failure state is set in a microtask
    });
    expect(result.current.permission).toBe('unsupported');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });
    expect(attempts).toBe(1);
  });
});
