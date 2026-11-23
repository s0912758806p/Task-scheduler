'use client';
// useEscapeToClose(onClose, rootRef): Esc closes the detail panel when it is pressed inside the
// panel (`rootRef`, its own inputs included) or anywhere on the page outside an editable element.
// Esc in an input elsewhere (QuickAdd, a board rename, …) belongs to that input and is left alone.
// It also does not close while it is closing one of the panel's own popups (AntD Select /
// DatePicker dropdowns, reported through the returned setPopupOpen(key, open)): whether a popup was
// open is read in the capture phase, before AntD reacts to the key and closes it. The close itself
// happens in the bubble phase, so a handler that stops the event or prevents its default keeps it.
import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** input / textarea / select / contenteditable. */
function isEditable(el: Element): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

export function useEscapeToClose(onClose: () => void, rootRef: RefObject<HTMLElement | null>) {
  const openPopups = useRef(new Set<string>());
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    let popupWasOpen = false;
    const capture = (e: KeyboardEvent) => {
      if (e.key === 'Escape') popupWasOpen = openPopups.current.size > 0;
    };
    const bubble = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented || popupWasOpen) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target && isEditable(target) && !rootRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    window.addEventListener('keydown', capture, true);
    window.addEventListener('keydown', bubble);
    return () => {
      window.removeEventListener('keydown', capture, true);
      window.removeEventListener('keydown', bubble);
    };
  }, [rootRef]);

  return useCallback((key: string, open: boolean) => {
    if (open) openPopups.current.add(key);
    else openPopups.current.delete(key);
  }, []);
}
