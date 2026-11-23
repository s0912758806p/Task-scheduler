// Quick-add box at the top of a column (spec §9 「智慧快速新增」). The input is parsed live with
// parseQuickAdd(value, today); while it yields chips they are shown with 「↵ 新增」.
// Enter → onCreate({ title, priority (default 2), tags, dueDate, status }) and the box clears; an
// empty title does nothing. The Enter that confirms an IME composition is ignored. Esc clears.
import { useState } from 'react';
import { IconPlus } from '@/components/icons';
import { parseQuickAdd } from '@/lib/quickAddParser';
import type { Priority, TaskStatus } from '@/lib/types';
import styles from './QuickAdd.module.scss';

export interface QuickAddInput {
  title: string;
  priority: Priority;
  tags: string[];
  dueDate: string | null;
  status: TaskStatus;
}

export interface QuickAddProps {
  status: TaskStatus;
  /** Column name, for the input's accessible label 「快速新增到<欄名>」. */
  label: string;
  today: string;
  onCreate: (input: QuickAddInput) => void;
}

export function QuickAdd({ status, label, today, onCreate }: QuickAddProps) {
  const [value, setValue] = useState('');
  const parsed = value ? parseQuickAdd(value, today) : null;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setValue('');
      return;
    }
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || !parsed?.title) return;
    e.preventDefault();
    onCreate({
      title: parsed.title,
      priority: parsed.priority ?? 2,
      tags: parsed.tags,
      dueDate: parsed.dueDate,
      status,
    });
    setValue('');
  }

  return (
    <div className={styles.box}>
      <label className={styles.row}>
        <IconPlus size={14} />
        <input
          className={styles.input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={`快速新增到${label}`}
          placeholder="快速新增…試試「!高 #前端 明天」"
          enterKeyHint="done"
        />
      </label>
      {parsed && parsed.chips.length > 0 && (
        <div className={styles.chips}>
          {parsed.chips.map((chip) => (
            <span key={chip} className={styles.chip}>
              {chip}
            </span>
          ))}
          <span className={styles.hint}>↵ 新增</span>
        </div>
      )}
    </div>
  );
}
