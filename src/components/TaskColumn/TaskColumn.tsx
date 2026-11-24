'use client';
// One board column (spec §9 「三欄」): header (status dot, name, visible count), QuickAdd, then the
// cards as a @hello-pangea/dnd Droppable (droppableId = the status) of Draggables (draggableId =
// task id), and the empty state — dashed box 「這一欄目前是空的」, or 「沒有符合篩選的任務」 while
// filters are active. Presentational: BoardView owns the DragDropContext, the drop logic and the
// commands; `dropDisabled` (same-column reorder off when sort ≠ 手動) and `dragDisabled` (batch
// mode) come from it. The whole card is the drag handle, buttons included
// (disableInteractiveElementBlocking): a mouse drag can start on the title, a click still opens it;
// with the keyboard, Space on a focused card lifts it and Enter activates the focused button.
// `static` (phones, drag disabled): plain list of cards, no Droppable/Draggable and no header (the
// segmented control shows the name and count); QuickAdd stays on top.
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { STATUS_LABEL } from '@/client/commands';
import { QuickAdd, type QuickAddInput } from '@/components/QuickAdd/QuickAdd';
import { TaskCard } from '@/components/TaskCard/TaskCard';
import { openBlockers } from '@/lib/taskQueries';
import type { Task, TaskStatus } from '@/lib/types';
import styles from './TaskColumn.module.scss';

export interface TaskColumnProps {
  status: TaskStatus;
  /** The column's visible cards, in display order. */
  tasks: Task[];
  /** Every cached task by id (prerequisite lookup). */
  byId: Map<string, Task>;
  today: string;
  /** Task open in the detail panel. */
  openTaskId: string | null;
  batchMode: boolean;
  checkedIds: ReadonlySet<string>;
  filtered: boolean;
  dropDisabled: boolean;
  dragDisabled: boolean;
  /** Phone layout: no drag and drop, no column header. */
  static?: boolean;
  onCreate: (input: QuickAddInput) => void;
  onOpen: (task: Task) => void;
  onAdvance: (task: Task) => void;
  onToggleCheck: (task: Task) => void;
}

export function TaskColumn({
  status,
  tasks,
  byId,
  today,
  openTaskId,
  batchMode,
  checkedIds,
  filtered,
  dropDisabled,
  dragDisabled,
  static: isStatic = false,
  onCreate,
  onOpen,
  onAdvance,
  onToggleCheck,
}: TaskColumnProps) {
  const label = STATUS_LABEL[status];
  const card = (task: Task, dragging = false) => {
    const blockers = openBlockers(task, byId);
    return (
      <TaskCard
        task={task}
        blocked={blockers.length > 0}
        blockers={blockers}
        today={today}
        selected={task.id === openTaskId}
        batchMode={batchMode}
        checked={checkedIds.has(task.id)}
        dragging={dragging}
        onOpen={onOpen}
        onAdvance={onAdvance}
        onToggleCheck={onToggleCheck}
      />
    );
  };
  const emptyText = filtered ? '沒有符合篩選的任務' : '這一欄目前是空的';

  if (isStatic) {
    return (
      <section className={styles.column} aria-label={label}>
        <QuickAdd status={status} label={label} today={today} onCreate={onCreate} />
        <div className={styles.list}>
          {tasks.map((task) => (
            <div key={task.id} className={styles.item}>
              {card(task)}
            </div>
          ))}
          {tasks.length === 0 && <p className={styles.empty}>{emptyText}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.column} aria-label={label}>
      <div className={styles.header}>
        <span
          className={`${styles.dot} ${styles[status === 'in-progress' ? 'inProgress' : status]}`}
          aria-hidden="true"
        />
        <h2 className={styles.name}>{label}</h2>
        <span className={styles.count}>{tasks.length}</span>
      </div>

      <QuickAdd status={status} label={label} today={today} onCreate={onCreate} />

      <Droppable droppableId={status} isDropDisabled={dropDisabled}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={snapshot.isDraggingOver ? `${styles.list} ${styles.over}` : styles.list}
          >
            {tasks.map((task, index) => (
              <Draggable
                key={task.id}
                draggableId={task.id}
                index={index}
                isDragDisabled={dragDisabled}
                disableInteractiveElementBlocking
              >
                {(drag, dragSnapshot) => (
                  <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps} className={styles.item}>
                    {card(task, dragSnapshot.isDragging)}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {tasks.length === 0 && !snapshot.isDraggingOver && <p className={styles.empty}>{emptyText}</p>}
          </div>
        )}
      </Droppable>
    </section>
  );
}
