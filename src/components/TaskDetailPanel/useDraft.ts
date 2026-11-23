'use client';
// useDraft(saved, commit): local text draft for a field that is saved with a debounced commit
// (spec §6.4: one undo command per committed edit, not per keystroke). commit(value) runs
// DRAFT_DELAY_MS after the last change or on blur, whichever comes first, and on unmount if a change
// is still pending (closing the panel or switching tasks keeps the edit). While the field is not
// focused the draft follows `saved`, so undo/redo and refetches show up; while focused it is left
// alone. The caller validates in commit (e.g. never sends an empty title) and may reset the draft
// with setValue (e.g. back to the saved title on blur).
import { useCallback, useEffect, useRef, useState } from 'react';

export const DRAFT_DELAY_MS = 600;

export function useDraft(saved: string, commit: (value: string) => void) {
  const [draft, setDraft] = useState(saved);
  const [focused, setFocused] = useState(false);
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    if (!focused) setDraft(saved);
  }

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const value = pending.current;
    pending.current = null;
    if (value !== null) commitRef.current(value);
  }, []);
  useEffect(() => flush, [flush]);

  const onChange = useCallback(
    (value: string) => {
      setDraft(value);
      pending.current = value;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, DRAFT_DELAY_MS);
    },
    [flush],
  );
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => {
    setFocused(false);
    flush();
  }, [flush]);

  return { value: draft, onChange, onFocus, onBlur, setValue: setDraft };
}
