'use client';
// Bottom toast (spec §6.4/§9): shows the current useUndo() toast — e.g. 「已刪除「…」· 復原」.
// 復原 runs the top command of the undo stack; ✕ closes it. Auto-hide (6 s) and replacement are
// handled by the toaster. The live region stays mounted so screen readers announce each toast.
import { useUndo } from '@/client/undo';
import { IconClose } from '@/components/icons';
import styles from './UndoToast.module.scss';

export function UndoToast() {
  const { toast, undo, hideToast } = useUndo();
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {toast && (
        <div className={styles.toast}>
          <span className={styles.text}>{toast.text}</span>
          {toast.undoable && (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                hideToast();
                void undo();
              }}
            >
              復原
            </button>
          )}
          <button type="button" className={styles.close} aria-label="關閉提示" onClick={hideToast}>
            <IconClose size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
