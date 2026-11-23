'use client';
// useEscapeToClose(onClose): Esc anywhere on the page closes the detail panel — also from inside
// its inputs — except when it is closing one of the panel's own popups (AntD Select / DatePicker
// dropdowns, reported through the returned setPopupOpen(key, open)). Whether a popup was open is
// read in the capture phase, before AntD reacts to the key and closes it; the close itself happens
// in the bubble phase so a dialog on top that stops the event or prevents its default keeps it.
import { useCallback, useEffect, useRef } from 'react';

export function useEscapeToClose(onClose: () => void) {
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
      onCloseRef.current();
    };
    window.addEventListener('keydown', capture, true);
    window.addEventListener('keydown', bubble);
    return () => {
      window.removeEventListener('keydown', capture, true);
      window.removeEventListener('keydown', bubble);
    };
  }, []);

  return useCallback((key: string, open: boolean) => {
    if (open) openPopups.current.add(key);
    else openPopups.current.delete(key);
  }, []);
}
