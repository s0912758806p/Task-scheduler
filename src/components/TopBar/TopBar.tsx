'use client';
// Board top bar (spec §9 「頂列」). Left: board name (h1) and 「N 項任務 · M 項進行中」.
// Right, normal mode: 篩選 (AntD Popover with FilterPanel; open state = uiSlice.filterOpen, so the
// `/` shortcut can open it with setFilterOpen(true) — the popover is destroyed on hide and its
// search input [data-search-input] autofocuses on every open; the button shows how many popover
// filters are set), 排序：手動／優先級／截止日 (uiSlice.sort), 選取 (toggleBatch), 復原 / 重做
// (useUndo; disabled when that side is empty) and 新增任務 (onNewTask).
// Phones (< 768px, useMediaQuery): the heading becomes 「☰ 看板名稱▾ 🔍」 — ☰ and the board name open the
// sidebar drawer (setSidebarOpen), 🔍 opens the ⌘K palette; 新增任務 is left to BoardView's FAB.
// Batch mode: 「已選 N 筆」 + 移至待處理 / 移至進行中 / 移至已完成 / 刪除 (disabled with nothing
// selected; onBatchMove / onBatchDelete) + 取消 (toggleBatch, which clears the selection).
import { Dropdown, Popover } from 'antd';
import { STATUS_LABEL } from '@/client/commands';
import { useAppDispatch, useAppSelector } from '@/client/store';
import { setFilterOpen, setPaletteOpen, setSidebarOpen, setSort, toggleBatch } from '@/client/uiSlice';
import { MOBILE_QUERY, useMediaQuery } from '@/client/useMediaQuery';
import { useUndo } from '@/client/undo';
import { IconFilter, IconMenu, IconPlus, IconSearch, IconRedo, IconSelect, IconSort, IconUndo } from '@/components/icons';
import { popoverFilterCount } from '@/components/BoardView/filters';
import type { SortKey } from '@/lib/taskQueries';
import type { TaskStatus } from '@/lib/types';
import { FilterPanel } from './FilterPanel';
import styles from './TopBar.module.scss';

export interface TopBarProps {
  boardName: string;
  total: number;
  inProgress: number;
  /** Tags used on this board (filter options). */
  tags: string[];
  onNewTask: () => void;
  onBatchMove: (status: TaskStatus) => void;
  onBatchDelete: () => void;
}

const SORT_LABEL: Record<SortKey, string> = { manual: '手動', priority: '優先級', dueDate: '截止日' };
const STATUSES: TaskStatus[] = ['todo', 'in-progress', 'done'];

export function TopBar({ boardName, total, inProgress, tags, onNewTask, onBatchMove, onBatchDelete }: TopBarProps) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.ui.filters);
  const sort = useAppSelector((s) => s.ui.sort);
  const filterOpen = useAppSelector((s) => s.ui.filterOpen);
  const batchMode = useAppSelector((s) => s.ui.batchMode);
  const selectedCount = useAppSelector((s) => s.ui.selectedIds.length);
  const { undo, redo, canUndo, canRedo } = useUndo();
  const activeFilters = popoverFilterCount(filters);
  const mobile = useMediaQuery(MOBILE_QUERY);

  return (
    <header className={styles.bar}>
      {mobile ? (
        <div className={styles.mobileBar}>
          <button
            type="button"
            className={styles.barIcon}
            aria-label="開啟側欄"
            onClick={() => dispatch(setSidebarOpen(true))}
          >
            <IconMenu size={20} />
          </button>
          <h1 className={styles.mobileTitle}>
            <button
              type="button"
              className={styles.boardButton}
              aria-label={`${boardName}，切換看板`}
              onClick={() => dispatch(setSidebarOpen(true))}
            >
              <span className={styles.boardName}>{boardName}</span>
              <span aria-hidden="true">▾</span>
            </button>
          </h1>
          <button
            type="button"
            className={styles.barIcon}
            aria-label="搜尋與指令"
            onClick={() => dispatch(setPaletteOpen(true))}
          >
            <IconSearch size={20} />
          </button>
        </div>
      ) : (
        <div className={styles.heading}>
          <h1 className={styles.title}>{boardName}</h1>
          <p className={styles.sub}>{`${total} 項任務 · ${inProgress} 項進行中`}</p>
        </div>
      )}

      {batchMode ? (
        <div className={styles.tools} role="toolbar" aria-label="批次操作">
          <span className={styles.selected}>{`已選 ${selectedCount} 筆`}</span>
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={styles.button}
              disabled={selectedCount === 0}
              onClick={() => onBatchMove(status)}
            >
              {`移至${STATUS_LABEL[status]}`}
            </button>
          ))}
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            disabled={selectedCount === 0}
            onClick={onBatchDelete}
          >
            刪除
          </button>
          <button type="button" className={styles.button} onClick={() => dispatch(toggleBatch())}>
            取消
          </button>
        </div>
      ) : (
        <div className={styles.tools}>
          <Popover
            trigger="click"
            placement="bottomRight"
            open={filterOpen}
            onOpenChange={(open) => dispatch(setFilterOpen(open))}
            destroyOnHidden
            content={<FilterPanel tags={tags} />}
          >
            <button type="button" className={styles.button} aria-expanded={filterOpen}>
              <IconFilter size={15} />
              篩選
              {activeFilters > 0 && <span className={styles.badge}>{activeFilters}</span>}
            </button>
          </Popover>
          <Dropdown
            trigger={['click']}
            menu={{
              items: (Object.keys(SORT_LABEL) as SortKey[]).map((key) => ({ key, label: SORT_LABEL[key] })),
              selectable: true,
              selectedKeys: [sort],
              onClick: ({ key }) => dispatch(setSort(key as SortKey)),
            }}
          >
            <button type="button" className={styles.button}>
              <IconSort size={15} />
              {`排序：${SORT_LABEL[sort]}`}
            </button>
          </Dropdown>
          <button type="button" className={styles.button} onClick={() => dispatch(toggleBatch())}>
            <IconSelect size={15} />
            選取
          </button>
          <span className={styles.divider} aria-hidden="true" />
          <button
            type="button"
            className={styles.iconButton}
            aria-label="復原（⌘Z）"
            disabled={!canUndo}
            onClick={() => void undo()}
          >
            <IconUndo size={15} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="重做（⌘⇧Z）"
            disabled={!canRedo}
            onClick={() => void redo()}
          >
            <IconRedo size={15} />
          </button>
          {!mobile && (
            <button type="button" className={styles.primary} onClick={onNewTask}>
              <IconPlus size={15} />
              新增任務
              <kbd className={styles.kbd}>N</kbd>
            </button>
          )}
        </div>
      )}
    </header>
  );
}
