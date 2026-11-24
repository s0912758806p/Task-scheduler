'use client';
// Stats strip under the board's top bar (spec §9): completion ring (role img 「完成率 N%」) +
// 「N% 完成」 + done/total, then the four chips 逾期 / 今天到期 / 緊急 / 等待前置 with their counts
// (taskQueries.boardStats over the board's unfiltered tasks). A chip is a filter toggle
// (aria-pressed): clicking it dispatches setChip(key), clicking the pressed one setChip(null).
// While any filter is active (chip, search, priority, due range, tags) 「清除篩選」 appears and
// dispatches clearFilters. Right side: the hint 「拖曳卡片換欄 · 點卡片看詳情」.
import { useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/client/store';
import { clearFilters, setChip } from '@/client/uiSlice';
import { boardStats, indexById, type ChipKey } from '@/lib/taskQueries';
import type { Task } from '@/lib/types';
import { hasActiveFilters } from '@/components/BoardView/filters';
import styles from './StatsStrip.module.scss';

const CHIPS: { key: ChipKey; label: string }[] = [
  { key: 'overdue', label: '逾期' },
  { key: 'today', label: '今天到期' },
  { key: 'urgent', label: '緊急' },
  { key: 'blocked', label: '等待前置' },
];

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function StatsStrip({ tasks, today }: { tasks: Task[]; today: string }) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.ui.filters);
  const stats = useMemo(() => boardStats(tasks, indexById(tasks), today), [tasks, today]);
  const dash = `${(stats.pct / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;

  return (
    <div className={styles.strip}>
      <div className={styles.progress}>
        <svg width="26" height="26" viewBox="0 0 24 24" role="img" aria-label={`完成率 ${stats.pct}%`}>
          <circle className={styles.track} cx="12" cy="12" r={RADIUS} />
          <circle
            className={styles.ring}
            cx="12"
            cy="12"
            r={RADIUS}
            strokeDasharray={dash}
            transform="rotate(-90 12 12)"
          />
        </svg>
        <span className={styles.pct}>{`${stats.pct}% 完成`}</span>
        <span className={styles.ratio}>{`${stats.done}/${stats.total}`}</span>
      </div>
      <span className={styles.divider} aria-hidden="true" />
      {CHIPS.map(({ key, label }) => {
        const on = filters.chip === key;
        return (
          <button
            key={key}
            type="button"
            className={styles.chip}
            aria-pressed={on}
            onClick={() => dispatch(setChip(on ? null : key))}
          >
            <span className={`${styles.tone} ${styles[key]}`} aria-hidden="true" />
            {label}{' '}
            <span className={styles.count}>{stats.chips[key]}</span>
          </button>
        );
      })}
      {hasActiveFilters(filters) && (
        <button type="button" className={styles.clear} onClick={() => dispatch(clearFilters())}>
          清除篩選
        </button>
      )}
      <span className={styles.spacer} />
      <span className={styles.hint}>拖曳卡片換欄 · 點卡片看詳情</span>
    </div>
  );
}
