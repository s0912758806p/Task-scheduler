'use client';
// Field rows of the detail panel (spec §9 「詳情欄」): 優先級 (Select, dot + 緊急/高/中/低),
// 截止日 (DatePicker; the value is a YYYY-MM-DD string both ways, read and written as a local
// calendar day by dayjs), 標籤 (Select mode="tags", suggestions = the board's tags; trimmed and
// de-duplicated with cleanTags), 前置任務 (Select mode="multiple": the board's other non-deleted
// tasks, done ones prefixed 「✓ 」; ids the list cannot show — e.g. soft-deleted prerequisites — are
// kept when the selection changes) and, for an existing task, 建立時間. Each change goes to
// onChange as a partial patch; whether that is a server update or a draft is the panel's business.
// Popup open/close is reported through onPopupChange so Esc closes the dropdown, not the panel.
import { DatePicker, Select } from 'antd';
import dayjs from 'dayjs';
import { useId } from 'react';
import type { Priority, Task } from '@/lib/types';
import { cleanTags } from '@/lib/validation';
import styles from './TaskDetailPanel.module.scss';

export type FieldPatch = Partial<Pick<Task, 'priority' | 'dueDate' | 'tags' | 'dependsOn'>>;

export interface TaskFieldsProps {
  /** The task being edited (excluded from 前置任務); null while creating. */
  selfId: string | null;
  priority: Priority;
  dueDate: string | null;
  tags: string[];
  dependsOn: string[];
  /** Non-deleted tasks of the same board. */
  boardTasks: Task[];
  createdAt: string | null;
  onChange: (patch: FieldPatch) => void;
  onPopupChange: (key: string, open: boolean) => void;
}

const PRIORITIES: { value: Priority; name: string }[] = [
  { value: 0, name: '緊急' },
  { value: 1, name: '高' },
  { value: 2, name: '中' },
  { value: 3, name: '低' },
];

export function TaskFields(props: TaskFieldsProps) {
  const { selfId, boardTasks, onChange, onPopupChange } = props;
  const id = useId();

  const depOptions = boardTasks
    .filter((t) => t.id !== selfId)
    .map((t) => ({ value: t.id, label: `${t.status === 'done' ? '✓ ' : ''}${t.title}` }));
  const listed = new Set(depOptions.map((o) => o.value));
  const shownDeps = props.dependsOn.filter((d) => listed.has(d));
  const hiddenDeps = props.dependsOn.filter((d) => !listed.has(d));
  const tagOptions = [...new Set(boardTasks.flatMap((t) => t.tags))]
    .sort((a, b) => a.localeCompare(b))
    .map((t) => ({ value: t, label: t }));

  return (
    <div className={styles.fields}>
      <div className={styles.row}>
        <span className={styles.label} id={`${id}-priority`}>
          優先級
        </span>
        <Select
          className={styles.control}
          aria-labelledby={`${id}-priority`}
          value={props.priority}
          onChange={(priority: Priority) => onChange({ priority })}
          onOpenChange={(open) => onPopupChange('priority', open)}
          options={PRIORITIES.map((p) => ({
            value: p.value,
            label: (
              <span className={styles.priorityOption}>
                <span className={`${styles.dot} ${styles[`p${p.value}`]}`} aria-hidden="true" />
                {p.name}
              </span>
            ),
          }))}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label} id={`${id}-due`}>
          截止日
        </span>
        <DatePicker
          className={styles.control}
          aria-labelledby={`${id}-due`}
          placeholder="選擇日期"
          value={props.dueDate ? dayjs(props.dueDate) : null}
          onChange={(d) => onChange({ dueDate: d ? d.format('YYYY-MM-DD') : null })}
          onOpenChange={(open) => onPopupChange('due', open)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label} id={`${id}-tags`}>
          標籤
        </span>
        <Select
          className={styles.control}
          aria-labelledby={`${id}-tags`}
          mode="tags"
          placeholder="新增標籤"
          value={props.tags}
          options={tagOptions}
          tokenSeparators={[',', '，']}
          onChange={(tags: string[]) => onChange({ tags: cleanTags(tags) })}
          onOpenChange={(open) => onPopupChange('tags', open)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label} id={`${id}-deps`}>
          前置任務
        </span>
        <Select
          className={styles.control}
          aria-labelledby={`${id}-deps`}
          mode="multiple"
          placeholder={depOptions.length === 0 ? '這個看板沒有其他任務' : '選擇前置任務'}
          value={shownDeps}
          options={depOptions}
          optionFilterProp="label"
          virtual={false}
          onChange={(ids: string[]) => onChange({ dependsOn: [...ids, ...hiddenDeps] })}
          onOpenChange={(open) => onPopupChange('deps', open)}
        />
      </div>

      {props.createdAt && (
        <div className={styles.row}>
          <span className={styles.label}>建立時間</span>
          <span className={styles.value}>{dayjs(props.createdAt).format('YYYY年M月D日 HH:mm')}</span>
        </div>
      )}
    </div>
  );
}
