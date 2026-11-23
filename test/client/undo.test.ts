// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createToaster, createUndoStack, UndoProvider, useUndo, type Command } from '@/client/undo';

function cmd(label: string, undo: () => Promise<void> = async () => {}): Command & {
  undo: ReturnType<typeof vi.fn>;
  redo: ReturnType<typeof vi.fn>;
} {
  return { label, undo: vi.fn(undo), redo: vi.fn(async () => {}) };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('createUndoStack', () => {
  it('keeps only the most recent 30 commands', async () => {
    const stack = createUndoStack();
    const cmds = Array.from({ length: 31 }, (_, i) => cmd(`c${i}`));
    cmds.forEach((c) => stack.push(c));

    let undone = 0;
    while (stack.canUndo()) {
      await stack.undo();
      undone++;
    }
    expect(undone).toBe(30);
    expect(cmds[0].undo).not.toHaveBeenCalled();
    expect(cmds[1].undo).toHaveBeenCalledOnce();
    expect(cmds[30].undo).toHaveBeenCalledOnce();
  });

  it('undo calls the top command’s undo; redo calls that same command’s redo', async () => {
    const stack = createUndoStack();
    const a = cmd('a');
    const b = cmd('b');
    stack.push(a);
    stack.push(b);

    await stack.undo();
    expect(b.undo).toHaveBeenCalledOnce();
    expect(a.undo).not.toHaveBeenCalled();
    expect(stack.canRedo()).toBe(true);

    await stack.redo();
    expect(b.redo).toHaveBeenCalledOnce();
    expect(a.redo).not.toHaveBeenCalled();
    expect(stack.canRedo()).toBe(false);
    expect(stack.canUndo()).toBe(true);
  });

  it('a new push clears the redo side', async () => {
    const stack = createUndoStack();
    stack.push(cmd('a'));
    await stack.undo();
    expect(stack.canRedo()).toBe(true);
    stack.push(cmd('b'));
    expect(stack.canRedo()).toBe(false);
  });

  it('notifies subscribers on change', () => {
    const stack = createUndoStack();
    const fn = vi.fn();
    const off = stack.subscribe(fn);
    stack.push(cmd('a'));
    expect(fn).toHaveBeenCalled();
    off();
    fn.mockClear();
    stack.push(cmd('b'));
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('useUndo', () => {
  function setup() {
    const stack = createUndoStack();
    const toaster = createToaster();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(UndoProvider, { stack, toaster }, children);
    const hook = renderHook(() => useUndo(), { wrapper });
    return { stack, toaster, hook };
  }

  it('drops a command whose undo hits 404 and shows 「無法復原：任務已不存在」', async () => {
    const { stack, hook } = setup();
    const older = cmd('older');
    const gone = cmd('gone', async () => {
      throw { status: 404, data: { error: { code: 'NOT_FOUND', message: '找不到這個任務' } } };
    });
    stack.push(older);
    stack.push(gone);

    await act(() => hook.result.current.undo());

    expect(gone.undo).toHaveBeenCalledOnce();
    expect(hook.result.current.toast?.text).toBe('無法復原：任務已不存在');
    expect(hook.result.current.canRedo).toBe(false); // dropped, not moved to redo

    await act(() => hook.result.current.undo());
    expect(older.undo).toHaveBeenCalledOnce();
    expect(hook.result.current.canUndo).toBe(false); // the stack lost exactly one entry
  });

  it('keeps a command whose undo fails with a network error', async () => {
    const { stack, hook } = setup();
    let fail = true;
    const flaky = cmd('flaky', async () => {
      if (fail) throw { status: 'FETCH_ERROR', error: 'offline' };
    });
    stack.push(flaky);

    await act(() => hook.result.current.undo());
    expect(hook.result.current.canUndo).toBe(true);

    fail = false;
    await act(() => hook.result.current.undo());
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(true);
  });

  it('toast auto-hides after 6 seconds; a new toast replaces the old one', () => {
    vi.useFakeTimers();
    const { hook } = setup();

    act(() => hook.result.current.showToast('第一則', true));
    expect(hook.result.current.toast).toEqual({ text: '第一則', undoable: true });

    act(() => vi.advanceTimersByTime(4000));
    act(() => hook.result.current.showToast('第二則'));
    expect(hook.result.current.toast).toEqual({ text: '第二則', undoable: false });

    act(() => vi.advanceTimersByTime(4000)); // 8 s after the first, 4 s after the second
    expect(hook.result.current.toast?.text).toBe('第二則');

    act(() => vi.advanceTimersByTime(2000));
    expect(hook.result.current.toast).toBeNull();
  });
});
