'use client';
// useShortcuts(): the app's one document-level keydown listener (spec §9 「鍵盤」). Mounted by AppShell.
// - Ignores events already handled (defaultPrevented), IME composition (isComposing / keyCode 229)
//   and modified keys other than the ones below. It never handles Esc: the palette Modal and the
//   detail panel (useEscapeToClose) each own theirs.
// - In an editable target (input / textarea / select / contenteditable) only ⌘K / Ctrl+K works.
//   ⌘Z / ⌘⇧Z / Ctrl+Y are left to the browser's own text undo there; elsewhere they call useUndo().
// - Single keys also stay quiet while the palette or the 快捷鍵 dialog is open.
//   ⌘K → palette; N → `?task=new`; `/` → on a board (not in batch mode) open the filter popover (its
//   search box [data-search-input] takes focus on mount, see FilterPanel), otherwise the palette; 1–9 → the Nth board in sidebar order;
//   G then F within 1 s → /focus; ? → 快捷鍵 dialog.
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useGetBoardsQuery } from './api';
import { useAppStore } from './store';
import { setFilterOpen, setPaletteOpen, setShortcutsOpen } from './uiSlice';
import { useUndo } from './undo';

const G_WINDOW_MS = 1000;

function isEditable(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

export function useShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const store = useAppStore();
  const { undo, redo } = useUndo();
  const { data: boards } = useGetBoardsQuery();

  const latest = useRef({ router, pathname, undo, redo, boards });
  useEffect(() => {
    latest.current = { router, pathname, undo, redo, boards };
  });

  useEffect(() => {
    let lastG = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      const { router, pathname, undo, redo, boards } = latest.current;
      const { dispatch } = store;
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      const editable = isEditable(e.target);

      if (mod && !e.altKey && key === 'k') {
        e.preventDefault();
        dispatch(setPaletteOpen(true));
        return;
      }
      if (mod && !e.altKey && (key === 'z' || (key === 'y' && e.ctrlKey))) {
        if (editable) return; // native text undo
        e.preventDefault();
        void (key === 'y' || e.shiftKey ? redo() : undo());
        return;
      }

      const g = lastG;
      lastG = 0;
      if (editable || mod || e.altKey) return;
      const ui = store.getState().ui;
      if (ui.paletteOpen || ui.shortcutsOpen) return;

      const boardPage = /^\/b\/[^/]+/.test(pathname);
      if (key === 'n') {
        e.preventDefault();
        router.push('?task=new', { scroll: false });
      } else if (key === '/') {
        e.preventDefault();
        if (boardPage && !ui.batchMode) {
          dispatch(setFilterOpen(true)); // the popover's search box autofocuses when it mounts
        } else {
          dispatch(setPaletteOpen(true));
        }
      } else if (/^[1-9]$/.test(key)) {
        const board = boards?.[Number(key) - 1];
        if (board) router.push(`/b/${board.id}`);
      } else if (key === 'g') {
        lastG = Date.now();
      } else if (key === 'f' && g > 0 && Date.now() - g <= G_WINDOW_MS) {
        router.push('/focus');
      } else if (e.key === '?') {
        dispatch(setShortcutsOpen(true));
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [store]);
}
