'use client';
// Undo/redo stack and the bottom toast (spec §6.4). Deliberately not in Redux: commands hold
// functions. Lives only in this tab's memory; a reload clears it.
// - createUndoStack(limit = 30): the most recent `limit` commands. push() clears the redo side.
//   undo()/redo() pop the command first, then await its function: success moves it to the other
//   side; a failure with an HTTP 4xx status (404 = the task is gone, 409/400 = it can no longer
//   apply) drops it for good; any other failure (network, 5xx, …) puts it back so it can be
//   retried. In every failure case the error is rethrown.
// - createToaster(): one toast at a time ({ text, undoable }); show() replaces the current toast
//   and restarts its 6-second auto-hide timer. Framework-free so the RTK Query layer can post
//   error toasts through the same channel (store extra argument, see src/client/store.ts).
// - UndoProvider / useUndo(): React binding. useUndo().undo() / redo() run the stack and report
//   failures in the toast: 404 → 「無法復原：任務已不存在」 (redo: 「無法重做：任務已不存在」);
//   other HTTP errors were already toasted by the API layer; non-HTTP errors → 「無法復原」.
//   On success the toast says 「已復原：<label>」 / 「已重做：<label>」; an empty side does nothing.
import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

export interface Command {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export interface UndoStack {
  push(c: Command): void;
  /** Resolves to the command that ran (undefined when that side was empty). */
  undo(): Promise<Command | undefined>;
  redo(): Promise<Command | undefined>;
  canUndo(): boolean;
  canRedo(): boolean;
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
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());

  async function run(from: 'undo' | 'redo') {
    const source = from === 'undo' ? done : undone;
    const target = from === 'undo' ? undone : done;
    const c = source.pop();
    if (!c) return undefined;
    emit();
    try {
      await c[from]();
      target.push(c);
      return c;
    } catch (err) {
      if (!isPermanent(err)) source.push(c);
      throw err;
    } finally {
      emit();
    }
  }

  return {
    push(c) {
      done = [...done, c].slice(-limit);
      undone = [];
      emit();
    },
    undo: () => run('undo'),
    redo: () => run('redo'),
    canUndo: () => done.length > 0,
    canRedo: () => undone.length > 0,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export interface Toast {
  text: string;
  undoable: boolean;
}

export interface Toaster {
  show(text: string, undoable?: boolean): void;
  hide(): void;
  get(): Toast | null;
  subscribe(fn: () => void): () => void;
}

export const TOAST_MS = 6000;

export function createToaster(): Toaster {
  let current: Toast | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const set = (t: Toast | null) => {
    current = t;
    listeners.forEach((fn) => fn());
  };
  return {
    show(text, undoable = false) {
      clearTimeout(timer);
      set({ text, undoable });
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
  const toast = useSyncExternalStore(toaster.subscribe, toaster.get, toaster.get);

  return useMemo(() => {
    async function run(kind: 'undo' | 'redo') {
      const verb = kind === 'undo' ? '復原' : '重做';
      try {
        const ran = await stack[kind]();
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
      canUndo,
      canRedo,
      toast,
      showToast: toaster.show,
      hideToast: toaster.hide,
    };
  }, [stack, toaster, canUndo, canRedo, toast]);
}
