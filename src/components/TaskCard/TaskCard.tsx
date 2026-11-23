// One board card (spec §9 「卡片」 and 「卡片狀態」). Presentational: the column wraps it in a
// Draggable and passes `dragging`.
// - Top row: batch checkbox (batch mode only), priority dot (role img 「優先級 X」; text label only
//   for 緊急 / 高 on open cards), and the 「→」 button that advances the status: aria-label
//   「開始處理：<標題>」 (todo), 「標記完成：<標題>」 (in-progress), 「重新開啟：<標題>」 (done). No 「→」
//   on a blocked card or in batch mode.
// - Title button: opens the detail panel (onOpen); in batch mode it toggles the check instead.
// - Meta line: relative due date (overdue → danger bold, due today → warn bold), subtask mini
//   progress, 「等待 N 個前置任務」 with a lock (warn), tags. A done card shows only
//   「完成於 M月D日」 (local day of completedAt) and its title is text-3 with a line-through.
// - States: selected (detail open) → accent border + 3px accent-soft ring; checked → accent border;
//   dragging → rotate 2° + the spec's drag shadow.
import { IconArrowRight, IconCalendar, IconCheck, IconLock } from '@/components/icons';
import { formatMonthDay, relativeDue, todayISO } from '@/lib/dates';
import type { Task, TaskStatus } from '@/lib/types';
import styles from './TaskCard.module.scss';

export interface TaskCardProps {
  task: Task;
  blocked: boolean;
  /** The open prerequisites keeping the task blocked. */
  blockers: Task[];
  today: string;
  /** The task is open in the detail panel. */
  selected: boolean;
  batchMode: boolean;
  checked: boolean;
  dragging?: boolean;
  onOpen: (task: Task) => void;
  onAdvance: (task: Task) => void;
  onToggleCheck: (task: Task) => void;
}

const PRIORITY_NAME = ['緊急', '高', '中', '低'];
const ADVANCE_LABEL: Record<TaskStatus, string> = {
  todo: '開始處理',
  'in-progress': '標記完成',
  done: '重新開啟',
};

export function TaskCard({
  task,
  blocked,
  blockers,
  today,
  selected,
  batchMode,
  checked,
  dragging = false,
  onOpen,
  onAdvance,
  onToggleCheck,
}: TaskCardProps) {
  const done = task.status === 'done';
  const overdue = !done && task.dueDate !== null && task.dueDate < today;
  const dueToday = !done && task.dueDate === today;
  const subsDone = task.subtasks.filter((s) => s.done).length;
  const showLabel = !done && task.priority <= 1;

  const className = [
    styles.card,
    selected && styles.selected,
    batchMode && checked && styles.checked,
    dragging && styles.dragging,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className}>
      <div className={styles.top}>
        {batchMode && (
          <label className={styles.checkHit}>
            <input
              type="checkbox"
              className={styles.check}
              checked={checked}
              onChange={() => onToggleCheck(task)}
              aria-label={`選取：${task.title}`}
            />
          </label>
        )}
        <span
          role="img"
          aria-label={`優先級 ${PRIORITY_NAME[task.priority]}`}
          className={`${styles.dot} ${styles[`p${task.priority}`]}`}
        />
        {showLabel && (
          <span className={task.priority === 0 ? styles.labelUrgent : styles.labelHigh}>
            {PRIORITY_NAME[task.priority]}
          </span>
        )}
        <span className={styles.spacer} />
        {!blocked && !batchMode && (
          <button
            type="button"
            className={styles.advance}
            aria-label={`${ADVANCE_LABEL[task.status]}：${task.title}`}
            title={ADVANCE_LABEL[task.status]}
            onClick={() => onAdvance(task)}
          >
            <IconArrowRight size={14} />
          </button>
        )}
      </div>

      <button
        type="button"
        className={done ? `${styles.title} ${styles.titleDone}` : styles.title}
        onClick={() => (batchMode ? onToggleCheck(task) : onOpen(task))}
      >
        {task.title}
      </button>

      <div className={styles.meta}>
        {done ? (
          <span className={styles.doneAt}>
            <IconCheck size={13} />
            {task.completedAt ? `完成於 ${formatMonthDay(todayISO(new Date(task.completedAt)))}` : '已完成'}
          </span>
        ) : (
          <>
            {task.dueDate !== null && (
              <span className={overdue ? styles.overdue : dueToday ? styles.dueToday : styles.metaItem}>
                <IconCalendar size={13} />
                {relativeDue(task.dueDate, today)}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className={styles.metaItem}>
                <span className={styles.bar} aria-hidden="true">
                  <span
                    className={subsDone === task.subtasks.length ? styles.barFillDone : styles.barFill}
                    style={{ width: `${Math.round((subsDone / task.subtasks.length) * 100)}%` }}
                  />
                </span>
                {`${subsDone}/${task.subtasks.length}`}
              </span>
            )}
            {blocked && (
              <span className={styles.blocked}>
                <IconLock size={13} />
                {`等待 ${blockers.length} 個前置任務`}
              </span>
            )}
            {task.tags.length > 0 && <span>{task.tags.map((t) => `#${t}`).join('  ')}</span>}
          </>
        )}
      </div>
    </article>
  );
}
