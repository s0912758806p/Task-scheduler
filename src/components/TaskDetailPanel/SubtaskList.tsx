'use client';
// 子任務 section of the detail panel (spec §9 「詳情欄」): progress 「done / total」, one row per
// subtask (checkbox labelled with its title, 「刪除子任務：<標題>」 button) and an input
// 「新增子任務」 that adds on Enter (title cleaned like a task title; empty ignored; the Enter that
// confirms an IME composition ignored). New ids come from crypto.randomUUID(). Every change hands
// the whole new list to onChange — the panel sends it as one update. At SUBTASKS_MAX the input is
// disabled. Drag-to-reorder is deferred (spec allows it).
import { useState } from 'react';
import { IconClose, IconPlus } from '@/components/icons';
import type { Subtask } from '@/lib/types';
import { cleanTitle, SUBTASKS_MAX, TITLE_MAX } from '@/lib/validation';
import styles from './TaskDetailPanel.module.scss';

export function SubtaskList({ subtasks, onChange }: { subtasks: Subtask[]; onChange: (next: Subtask[]) => void }) {
  const [text, setText] = useState('');
  const done = subtasks.filter((s) => s.done).length;
  const full = subtasks.length >= SUBTASKS_MAX;

  function add(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    const title = cleanTitle(text);
    if (!title || full) return;
    onChange([...subtasks, { id: crypto.randomUUID(), title, done: false }]);
    setText('');
  }

  return (
    <section className={styles.subtasks} aria-label="子任務">
      <div className={styles.subtaskHead}>
        <span className={styles.label}>子任務</span>
        {subtasks.length > 0 && <span className={styles.count}>{`${done} / ${subtasks.length}`}</span>}
      </div>
      {subtasks.length > 0 && (
        <ul className={styles.subtaskList}>
          {subtasks.map((s) => (
            <li key={s.id} className={styles.subtask}>
              <label className={styles.subtaskLabel}>
                <input
                  type="checkbox"
                  className={styles.check}
                  checked={s.done}
                  onChange={() => onChange(subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                />
                <span className={s.done ? styles.subtaskDone : undefined}>{s.title}</span>
              </label>
              <button
                type="button"
                className={styles.subtaskDelete}
                aria-label={`刪除子任務：${s.title}`}
                onClick={() => onChange(subtasks.filter((x) => x.id !== s.id))}
              >
                <IconClose size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className={styles.subtaskAdd}>
        <IconPlus size={14} />
        <input
          className={styles.subtaskInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={add}
          aria-label="新增子任務"
          placeholder={full ? `子任務最多 ${SUBTASKS_MAX} 筆` : '新增子任務，按 Enter 加入'}
          maxLength={TITLE_MAX}
          disabled={full}
          enterKeyHint="done"
        />
      </label>
    </section>
  );
}
