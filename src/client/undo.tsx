'use client';
// Undo/redo stack and the bottom toast (spec §6.4). Deliberately not in Redux: commands hold
// functions. Lives only in this tab's memory; a reload clears it.
// - createUndoStack(limit = 30): the most recent `limit` commands. push() clears the redo side.
//   undo()/redo() are serialized: each waits for the previous one, then pops the command and
//   awaits its function. Success moves it to the other side; a failure with an HTTP 4xx status
//   (404 = the task is gone, 409/400 = it can no longer apply) drops it for good; any other
//   failure (network, 5xx, …) puts it back so it can be retried. If a push() happened while the
//   function ran, the command is dropped instead (the history it belonged to is gone). Failures
//   are rethrown. undo(expected) only runs when `expected` is still the top command.
// - createToaster(): one toast at a time ({ text, command }); show() replaces the current toast
//   and restarts its 6-second auto-hide timer. Framework-free so the RTK Query layer can post
//   error toasts through the same channel (store extra argument, see src/client/store.ts).
// - UndoProvider / useUndo(): React binding. useUndo().undo() / redo() run the stack and report
//   failures in the toast: 404 → 「無法復原：任務已不存在」 (redo: 「無法重做：任務已不存在」);
//   other HTTP errors were already toasted by the API layer; non-HTTP errors → 「無法復原」.
//   On success the toast says 「已復原：<label>」 / 「已重做：<label>」; an empty side does nothing.
//   showToast(text, true) binds the toast's 復原 to the command now on top of the stack; toast.
//   undoable stays true only while that command is still on top (a later silent push, e.g. a
//   quick-add, withdraws the offer), and undoToast() undoes exactly that command or nothing.
//   ⌘Z (undo()) always undoes the current top.
import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

export interface Command {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export interface UndoStack {
  push(c: Command): void;
  /**
   * Resolves to the command that ran (undefined when that side was empty). With `expected`, undo
   * runs only if that exact command is still on top when its turn comes.
   */
  undo(expected?: Command): Promise<Command | undefined>;
  redo(): Promise<Command | undefined>;
  canUndo(): boolean;
  canRedo(): boolean;
  /** The command the next undo() would run. */
  peek(): Command | undefined;
  subscribe(fn: () => void): () => void;
}

/** HTTP status of an RTK Query error (`{ status: number }`), else null. */
export function httpStatus(err: unknown): number | null {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}

const isPermanent = (err: unknown) => {
  const s = httpStatus(err);
  return s !== null && s >= 400 && s < 500;
};

export function createUndoStack(limit = 30): UndoStack {
  let done: Command[] = [];
  let undone: Command[] = [];
  let pushes = 0; // bumps on every push(): a finished undo/redo must not resurrect a stale history
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());

  async function step(from: 'undo' | 'redo', expected?: Command) {
    const source = () => (from === 'undo' ? done : undone);
    const target = () => (from === 'undo' ? undone : done);
    const c = source().at(-1);
    if (!c || (expected !== undefined && c !== expected)) return undefined;
    source().pop();
    emit();
    const seen = pushes;
    try {
      await c[from]();
      if (pushes === seen) target().push(c);
      return c;
    } catch (err) {
      if (!isPermanent(err) && pushes === seen) source().push(c);
      throw err;
    } finally {
      emit();
    }
  }

  // One undo/redo at a time, in call order: a second ⌘Z waits for the first request to finish.
  function run(from: 'undo' | 'redo', expected?: Command) {
    const result = queue.then(() => step(from, expected));
    queue = result.catch(() => {});
    return result;
  }

  return {
    push(c) {
      pushes++;
      done = [...done, c].slice(-limit);
      undone = [];
      emit();
    },
    undo: (expected) => run('undo', expected),
    redo: () => run('redo'),
    canUndo: () => done.length > 0,
    canRedo: () => undone.length > 0,
    peek: () => done.at(-1),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** What the toast shows: `undoable` = 復原 is offered (its command is still the undo-stack top). */
export interface Toast {
  text: string;
  undoable: boolean;
}

/** Toaster state: the text and the command its 復原 button undoes (null = no 復原). */
export interface ToastState {
  text: string;
  command: Command | null;
}

export interface Toaster {
  show(text: string, command?: Command | null): void;
  hide(): void;
  get(): ToastState | null;
  subscribe(fn: () => void): () => void;
}

export const TOAST_MS = 6000;

export function createToaster(): Toaster {
  let current: ToastState | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const set = (t: ToastState | null) => {
    current = t;
    listeners.forEach((fn) => fn());
  };
  return {
    show(text, command = null) {
      clearTimeout(timer);
      set({ text, command });
      timer = setTimeout(() => set(null), TOAST_MS);
    },
    hide() {
      clearTimeout(timer);
      set(null);
    },
    get: () => current,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

interface UndoContextValue {
  stack: UndoStack;
  toaster: Toaster;
}

const UndoContext = createContext<UndoContextValue | null>(null);

export function UndoProvider(props: { children?: ReactNode; stack?: UndoStack; toaster?: Toaster }) {
  const [stack] = useState(() => props.stack ?? createUndoStack());
  const [toaster] = useState(() => props.toaster ?? createToaster());
  const value = useMemo(() => ({ stack, toaster }), [stack, toaster]);
  return <UndoContext.Provider value={value}>{props.children}</UndoContext.Provider>;
}

export function useUndo() {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error('useUndo must be used inside <UndoProvider>');
  const { stack, toaster } = ctx;
  const canUndo = useSyncExternalStore(stack.subscribe, stack.canUndo, stack.canUndo);
  const canRedo = useSyncExternalStore(stack.subscribe, stack.canRedo, stack.canRedo);
  const top = useSyncExternalStore(stack.subscribe, stack.peek, stack.peek);
  const current = useSyncExternalStore(toaster.subscribe, toaster.get, toaster.get);

  // Functions depend only on the stack and toaster, so they keep their identity across toasts.
  const actions = useMemo(() => {
    async function run(kind: 'undo' | 'redo', expected?: Command) {
      const verb = kind === 'undo' ? '復原' : '重做';
      try {
        const ran = kind === 'undo' ? await stack.undo(expected) : await stack.redo();
        if (ran) toaster.show(`已${verb}：${ran.label}`);
      } catch (err) {
        const status = httpStatus(err);
        if (status === 404) toaster.show(`無法${verb}：任務已不存在`);
        else if (status === null) toaster.show(`無法${verb}`);
        // Other HTTP errors: the API layer already showed the server's message.
      }
    }
    return {
      push: stack.push,
      undo: () => run('undo'),
      redo: () => run('redo'),
      /** undoable → 復原 is bound to the command now on top of the stack (pushed just before). */
      showToast: (text: string, undoable = false) =>
        toaster.show(text, undoable ? (stack.peek() ?? null) : null),
      hideToast: toaster.hide,
      /** The toast's 復原: undoes the toast's own command, and only while it is still on top. */
      undoToast: () => {
        const command = toaster.get()?.command;
        toaster.hide();
        return command ? run('undo', command) : Promise.resolve();
      },
    };
  }, [stack, toaster]);

  return useMemo(() => {
    const toast: Toast | null = current && {
      text: current.text,
      undoable: current.command !== null && current.command === top,
    };
    return { ...actions, canUndo, canRedo, toast };
  }, [actions, canUndo, canRedo, top, current]);
}
