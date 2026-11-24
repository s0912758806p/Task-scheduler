'use client';
// Board page body for /b/[boardId] (spec §9 「看板頁」). Orchestrates; the children are
// presentational (TopBar and StatsStrip read/write uiSlice themselves).
// - Data: getBoards + getTasks (whole cache). Loading → skeleton (column background + three
//   surface-2 blocks per column). First load failed → 「無法載入資料，請重新整理頁面再試一次。」. A board
//   that is not in getBoards (unknown or someone else's) → 「找不到這個看板」 + link 「回到今日焦點」.
// - `today` = useToday() (browser local day, rolls over at midnight), passed down as a prop.
// - Cards: the board's tasks through filterTasks(uiSlice.filters) and sortTasks(uiSlice.sort), split
//   by status. Clicking a card → router.push('?task=<id>', { scroll: false }); the card for
//   ?task=<id> is drawn selected. 「→」 → update(task, { status: next }) (todo → in-progress → done →
//   todo). Quick add → create({ boardId, ...input }). 新增任務 → router.push('?task=new').
// - Empty board (no tasks at all) → a panel 「這個看板還沒有任務」 with 「載入範例任務」
//   (loadSamples(boardId)) above the (empty) columns.
// - Drag and drop: onDragEnd → resolveDrop (dropPlacement.ts) → move(task, status, position,
//   insertAfterId); neighbours are computed after removing the dragged card; position null → the
//   server renumbers after insertAfterId. A blocked todo dropped on another column is not sent: it
//   snaps back and the toast says 「「<標題>」還在等待前置任務完成」. When sort ≠ 手動 the source
//   column refuses drops while dragging (no same-column reorder) and a cross-column drop lands at
//   the top of the target column's manual order. Screen-reader announcements and the drag-handle
//   instructions are in Chinese (已拿起 / 移到<欄>第 N 個位置 / 已放下 / 已取消移動).
// - Phones (useMediaQuery(MOBILE_QUERY), < 768px): a segmented control (role tablist, 「待處理 N」「進行中 N」
//   「已完成 N」, N = visible count after filters) shows one static column at a time (no drag and drop;
//   status changes via 「→」 and the detail panel); the selected status is component state, reset to
//   待處理 when the board changes. A 56×56 floating button (aria-label 「新增任務」) opens ?task=new.
// - Batch mode: cards get checkboxes (uiSlice.selectedIds); 移至… → batchMove, 刪除 → batchRemove
//   (no confirm, undo via the toast); the selection clears after a successful action and whenever
//   the board changes (leaving batch mode clears it too, in uiSlice).
import {
  DragDropContext,
  type DragStart,
  type DragUpdate,
  type DropResult,
  type ResponderProvided,
} from '@hello-pangea/dnd';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useGetBoardsQuery, useGetTasksQuery } from '@/client/api';
import { STATUS_LABEL, useTaskCommands } from '@/client/commands';
import { useAppDispatch, useAppSelector } from '@/client/store';
import { setSelected, toggleSelected } from '@/client/uiSlice';
import { MOBILE_QUERY, useMediaQuery } from '@/client/useMediaQuery';
import { useToday } from '@/client/useToday';
import { useUndo } from '@/client/undo';
import { IconPlus } from '@/components/icons';
import type { QuickAddInput } from '@/components/QuickAdd/QuickAdd';
import { StatsStrip } from '@/components/StatsStrip/StatsStrip';
import { TaskColumn } from '@/components/TaskColumn/TaskColumn';
import { TopBar } from '@/components/TopBar/TopBar';
import { filterTasks, indexById, sortTasks } from '@/lib/taskQueries';
import type { Task, TaskStatus } from '@/lib/types';
import { resolveDrop } from './dropPlacement';
import { hasActiveFilters } from './filters';
import styles from './BoardView.module.scss';

const STATUSES: TaskStatus[] = ['todo', 'in-progress', 'done'];
const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { todo: 'in-progress', 'in-progress': 'done', done: 'todo' };

export function BoardView({ boardId }: { boardId: string }) {
  const router = useRouter();
  const openTaskId = useSearchParams().get('task');
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.ui.filters);
  const sort = useAppSelector((s) => s.ui.sort);
  const batchMode = useAppSelector((s) => s.ui.batchMode);
  const selectedIds = useAppSelector((s) => s.ui.selectedIds);
  const boardsQuery = useGetBoardsQuery();
  const tasksQuery = useGetTasksQuery();
  const cmds = useTaskCommands();
  const { showToast } = useUndo();
  const today = useToday();
  const [dragSource, setDragSource] = useState<TaskStatus | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [mobileStatus, setMobileStatus] = useState<TaskStatus>('todo');
  const [mobileBoardId, setMobileBoardId] = useState(boardId);
  if (mobileBoardId !== boardId) {
    // Board changed: back to 待處理 (state adjusted during render, no extra effect pass).
    setMobileBoardId(boardId);
    setMobileStatus('todo');
  }

  useEffect(() => {
    dispatch(setSelected([]));
  }, [boardId, dispatch]);

  const allTasks = tasksQuery.data;
  const board = boardsQuery.data?.find((b) => b.id === boardId);

  const view = useMemo(() => {
    const list = allTasks ?? [];
    const byId = indexById(list);
    const boardTasks = list.filter((t) => t.boardId === boardId);
    const visible = sortTasks(filterTasks(boardTasks, filters, byId, today), sort);
    const columns = Object.fromEntries(STATUSES.map((s) => [s, visible.filter((t) => t.status === s)])) as Record<
      TaskStatus,
      Task[]
    >;
    const tags = [...new Set(boardTasks.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b));
    return { byId, boardTasks, columns, tags };
  }, [allTasks, boardId, filters, sort, today]);

  const checkedIds = useMemo(() => new Set(selectedIds), [selectedIds]);

  if (!boardsQuery.data || !allTasks) {
    // A failed background refetch keeps showing the cached board; only a first load can fail here.
    if (boardsQuery.isError || tasksQuery.isError) {
      return <p className={styles.message}>無法載入資料，請重新整理頁面再試一次。</p>;
    }
    return <BoardSkeleton />;
  }
  if (!board) {
    return (
      <div className={styles.notFound}>
        <h1 className={styles.notFoundTitle}>找不到這個看板</h1>
        <Link href="/focus" className={styles.link}>
          回到今日焦點
        </Link>
      </div>
    );
  }

  const { byId, boardTasks, columns, tags } = view;

  const openTask = (task: Task) => router.push(`?task=${task.id}`, { scroll: false });
  const advance = (task: Task) => void cmds.update(task, { status: NEXT_STATUS[task.status] });
  const toggleCheck = (task: Task) => dispatch(toggleSelected(task.id));
  const create = (input: QuickAddInput) => void cmds.create({ boardId, ...input });

  async function loadSamples() {
    setLoadingSamples(true);
    try {
      await cmds.loadSamples(boardId);
    } finally {
      setLoadingSamples(false);
    }
  }

  async function batchMove(status: TaskStatus) {
    if (await cmds.batchMove(selectedIds, status)) dispatch(setSelected([]));
  }

  async function batchDelete() {
    if (await cmds.batchRemove(selectedIds)) dispatch(setSelected([]));
  }

  // Screen-reader announcements in Chinese (the library's defaults are English).
  const titleOf = (id: string) => byId.get(id)?.title ?? '';

  function onDragStart(start: DragStart, provided: ResponderProvided) {
    setDragSource(start.source.droppableId as TaskStatus);
    provided.announce(`已拿起「${titleOf(start.draggableId)}」`);
  }

  function onDragUpdate(update: DragUpdate, provided: ResponderProvided) {
    const d = update.destination;
    provided.announce(
      d ? `移到${STATUS_LABEL[d.droppableId as TaskStatus]}第 ${d.index + 1} 個位置` : '目前不在可放下的欄位上',
    );
  }

  function onDragEnd({ source, destination, draggableId }: DropResult, provided: ResponderProvided) {
    setDragSource(null);
    const task = byId.get(draggableId);
    if (!destination || !task) {
      provided.announce(`已取消移動「${titleOf(draggableId)}」`);
      return;
    }
    const action = resolveDrop({
      task,
      sourceIndex: source.index,
      to: destination.droppableId as TaskStatus,
      index: destination.index,
      sort,
      visible: columns,
      boardTasks,
      byId,
    });
    if (action.kind === 'blocked') {
      const text = `「${task.title}」還在等待前置任務完成`;
      showToast(text);
      provided.announce(text);
      return;
    }
    provided.announce(`已放下「${task.title}」`);
    if (action.kind === 'move') void cmds.move(task, action.status, action.position, action.insertAfterId);
  }

  const renderColumn = (status: TaskStatus, isStatic: boolean) => (
    <TaskColumn
      key={status}
      status={status}
      tasks={columns[status]}
      byId={byId}
      today={today}
      openTaskId={openTaskId}
      batchMode={batchMode}
      checkedIds={checkedIds}
      filtered={hasActiveFilters(filters)}
      dropDisabled={sort !== 'manual' && dragSource === status}
      dragDisabled={batchMode}
      static={isStatic}
      onCreate={create}
      onOpen={openTask}
      onAdvance={advance}
      onToggleCheck={toggleCheck}
    />
  );

  return (
    <div className={styles.board}>
      <TopBar
        boardName={board.name}
        total={boardTasks.length}
        inProgress={boardTasks.filter((t) => t.status === 'in-progress').length}
        tags={tags}
        onNewTask={() => router.push('?task=new', { scroll: false })}
        onBatchMove={(status) => void batchMove(status)}
        onBatchDelete={() => void batchDelete()}
      />
      <StatsStrip tasks={boardTasks} today={today} />

      {boardTasks.length === 0 && (
        <div className={styles.emptyBoard}>
          <p className={styles.emptyTitle}>這個看板還沒有任務</p>
          <p className={styles.emptyText}>在任一欄的快速新增輸入標題後按 Enter，或先載入範例任務看看。</p>
          <button
            type="button"
            className={styles.sampleButton}
            disabled={loadingSamples}
            onClick={() => void loadSamples()}
          >
            載入範例任務
          </button>
        </div>
      )}

      {mobile ? (
        <>
          <div role="tablist" aria-label="任務狀態" className={styles.tabs}>
            {STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                role="tab"
                id={`tab-${status}`}
                aria-selected={status === mobileStatus}
                aria-controls="mobile-column"
                className={styles.tab}
                onClick={() => setMobileStatus(status)}
              >
                <span className={styles.tabInner}>{`${STATUS_LABEL[status]} ${columns[status].length}`}</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" id="mobile-column" aria-labelledby={`tab-${mobileStatus}`}>
            {renderColumn(mobileStatus, true)}
          </div>
          <button
            type="button"
            className={styles.fab}
            aria-label="新增任務"
            onClick={() => router.push('?task=new', { scroll: false })}
          >
            <IconPlus size={24} />
          </button>
        </>
      ) : (
        <DragDropContext
          onDragStart={onDragStart}
          onDragUpdate={onDragUpdate}
          onDragEnd={onDragEnd}
          dragHandleUsageInstructions="按空白鍵拿起卡片，用方向鍵移動，再按空白鍵放下；按 Esc 取消。"
        >
          <div className={styles.columns}>{STATUSES.map((status) => renderColumn(status, false))}</div>
        </DragDropContext>
      )}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className={styles.board} aria-busy="true" aria-label="載入中">
      <div className={styles.skeletonTitle} />
      <div className={styles.skeletonStrip} />
      <div className={styles.columns}>
        {STATUSES.map((s) => (
          <div key={s} className={styles.skeletonColumn}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.skeletonCard} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
