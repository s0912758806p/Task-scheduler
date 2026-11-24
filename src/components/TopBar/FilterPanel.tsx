'use client';
// Content of the top bar's 篩選 popover: 優先級, 到期範圍, 標籤 (the board's tags, all must match),
// 搜尋 (title, description and tags). Every field writes uiSlice.filters through setFilters; 清除
// resets them with clearFilters. The search input carries aria-label 「搜尋任務」 and the
// `data-search-input` attribute and takes focus when the panel mounts (the popover is destroyed on
// hide, so every open focuses it — see TopBar / uiSlice.setFilterOpen).
import { Input, Select } from 'antd';
import { useAppDispatch, useAppSelector } from '@/client/store';
import { clearFilters, setFilters } from '@/client/uiSlice';
import type { TaskFilters } from '@/lib/taskQueries';
import type { Priority } from '@/lib/types';
import styles from './TopBar.module.scss';

const PRIORITY_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 0, label: '緊急' },
  { value: 1, label: '高' },
  { value: 2, label: '中' },
  { value: 3, label: '低' },
];

const DUE_OPTIONS: { value: TaskFilters['dueRange']; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'overdue', label: '已逾期' },
  { value: 'today', label: '今天到期' },
  { value: 'week', label: '7 天內' },
  { value: 'future', label: '7 天以後' },
];

export function FilterPanel({ tags }: { tags: string[] }) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.ui.filters);

  return (
    <div className={styles.filterPanel}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>搜尋</span>
        <Input
          aria-label="搜尋任務"
          data-search-input=""
          autoFocus
          allowClear
          placeholder="標題、描述或標籤"
          value={filters.search}
          onChange={(e) => dispatch(setFilters({ search: e.target.value }))}
        />
      </label>
      <div className={styles.field}>
        <span className={styles.fieldLabel} id="filter-priority">
          優先級
        </span>
        <Select
          aria-labelledby="filter-priority"
          options={PRIORITY_OPTIONS}
          value={filters.priority ?? 'all'}
          onChange={(v: Priority | 'all') => dispatch(setFilters({ priority: v === 'all' ? null : v }))}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel} id="filter-due">
          到期範圍
        </span>
        <Select
          aria-labelledby="filter-due"
          options={DUE_OPTIONS}
          value={filters.dueRange}
          onChange={(v) => dispatch(setFilters({ dueRange: v }))}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel} id="filter-tags">
          標籤
        </span>
        <Select
          aria-labelledby="filter-tags"
          mode="multiple"
          allowClear
          placeholder={tags.length === 0 ? '這個看板還沒有標籤' : '選擇標籤'}
          options={tags.map((t) => ({ value: t, label: `#${t}` }))}
          value={filters.tags}
          onChange={(v: string[]) => dispatch(setFilters({ tags: v }))}
        />
      </div>
      <button type="button" className={styles.clearFilters} onClick={() => dispatch(clearFilters())}>
        清除篩選
      </button>
    </div>
  );
}
