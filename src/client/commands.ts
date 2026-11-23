'use client';
// useTaskCommands(): every user-level task write goes through here. Each command calls the
// (optimistic) mutation, and on success pushes the reverse Command onto the undo stack (spec §6.4)
// and shows the toast. Failures were already toasted by the API layer; commands then resolve to
// null / false / 0 instead of throwing.
// - create(input): client-generated id. undo = soft delete; redo = restore.
// - update(task, patch, label?): undo = PATCH the old values back; redo = PATCH again. A change of
//   status or position (a move) is undone with `position: null` + `insertAfterId` = the task that
//   preceded it before the move (null → top), so the server renumbers and the order comes back
//   even if numeric positions went stale. Leaving todo while blocked is refused up front with a
//   toast. Toasts: → done 「已完成「…」」; other status changes 「已移到<欄>：「…」」. Title and
//   description callers debounce 600 ms themselves.
// - move(task, status, position, insertAfterId): update() with the drop target (`position` null →
//   the server renumbers and inserts after `insertAfterId`).
// - remove(task): soft delete; undo = PATCH deletedAt: null; toast 「已刪除「…」」.
// - batchMove(ids, status) / batchRemove(ids): one batch request; undo covers only the `updated`
//   ids (a batch move is undone task by task in old column order with insertAfterId; a batch delete
//   with a batch restore). Toast 「已移動 N 筆」 (+「，M 筆因等待前置任務而略過」) / 「已刪除 N 筆」, where N
//   counts only tasks whose status actually changed (the server also lists tasks that were already
//   in the target status as updated); nothing moved and nothing skipped → 「沒有需要移動的任務」.
// - loadSamples(boardId): creates SAMPLE_TASKS (dates relative to today, dependsOn mapped by title)
//   in column order; undo = batch delete them; redo = batch restore.
import { useMemo } from 'react';
import { addDays, todayISO } from '@/lib/dates';
import { POSITION_STEP } from '@/lib/position';
import { SAMPLE_TASKS } from '@/lib/sampleTasks';
import { columnTasks, indexById, openBlockers } from '@/lib/taskQueries';
import type { Task, TaskStatus } from '@/lib/types';
import {
  api,
  useBatchTasksMutation,
  useCreateTaskMutation,
  useDeleteTaskMutation,
  useUpdateTaskMutation,
  type BatchResult,
  type CreateTaskArg,
  type TaskPatch,
} from './api';
import { useAppStore } from './store';
import { useUndo } from './undo';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '待處理',
  'in-progress': '進行中',
  done: '已完成',
};

export type NewTaskInput = Omit<CreateTaskArg, 'id'> & { id?: string };

const FIELD_KEYS = ['title', 'description', 'priority', 'dueDate', 'tags', 'subtasks', 'dependsOn'] as const;

/** Id of the task right above `task` in its column (null → it is at the top). */
function prevInColumn(task: Task, list: Task[]): string | null {
  const col = columnTasks(
    list.filter((t) => t.boardId === task.boardId),
    task.status,
  );
  const i = col.findIndex((t) => t.id === task.id);
  return i > 0 ? col[i - 1].id : null;
}

export function useTaskCommands() {
  const store = useAppStore();
  const [createTask] = useCreateTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [batchTasks] = useBatchTasksMutation();
  const { push, showToast } = useUndo();

  return useMemo(() => {
    const cached = () => api.endpoints.getTasks.select()(store.getState()).data ?? [];

    const restore = async (task: Task) => {
      await updateTask({ id: task.id, patch: { deletedAt: null }, snapshot: task }).unwrap();
    };
    const softDelete = async (id: string) => {
      await deleteTask(id).unwrap();
    };
    const batch = async (ids: string[], op: 'delete' | 'restore') => {
      await batchTasks({ ids, op }).unwrap();
    };

    async function create(input: NewTaskInput): Promise<Task | null> {
      const id = input.id ?? crypto.randomUUID();
      try {
        const task = await createTask({ ...input, id }).unwrap();
        push({ label: `新增「${task.title}」`, undo: () => softDelete(id), redo: () => restore(task) });
        return task;
      } catch {
        return null;
      }
    }

    async function update(task: Task, patch: TaskPatch, label?: string): Promise<Task | null> {
      const list = cached();
      const statusChange = patch.status !== undefined && patch.status !== task.status;
      const moving = statusChange || patch.position !== undefined;

      if (statusChange && task.status === 'todo') {
        const blockers = openBlockers({ ...task, dependsOn: patch.dependsOn ?? task.dependsOn }, indexById(list));
        if (blockers.length > 0) {
          showToast(`「${task.title}」還在等待 ${blockers.length} 個前置任務完成`);
          return null;
        }
      }

      const inverse: TaskPatch = {};
      const forward: TaskPatch = {};
      for (const key of FIELD_KEYS) {
        if (patch[key] === undefined) continue;
        Object.assign(inverse, { [key]: key === 'description' ? (task.description ?? '') : task[key] });
        Object.assign(forward, { [key]: patch[key] });
      }
      if (moving) {
        Object.assign(inverse, {
          ...(statusChange && { status: task.status }),
          position: null,
          insertAfterId: prevInColumn(task, list),
        });
      }

      let saved: Task;
      try {
        saved = await updateTask({ id: task.id, patch }).unwrap();
      } catch {
        return null;
      }

      if (moving) {
        // Where the task landed: the caller's insertAfterId, the top (status change without
        // position), or its neighbour in the cache (numeric position — no renumber happened).
        const landedAfter =
          patch.position === null
            ? (patch.insertAfterId ?? null)
            : patch.position === undefined
              ? null
              : prevInColumn(saved, cached());
        Object.assign(forward, {
          ...(statusChange && { status: patch.status }),
          position: null,
          insertAfterId: landedAfter,
        });
      }

      push({
        label: label ?? (moving ? `移動「${task.title}」` : `編輯「${task.title}」`),
        undo: async () => {
          await updateTask({ id: task.id, patch: inverse }).unwrap();
        },
        redo: async () => {
          await updateTask({ id: task.id, patch: forward }).unwrap();
        },
      });
      if (statusChange) {
        showToast(
          patch.status === 'done'
            ? `已完成「${saved.title}」`
            : `已移到${STATUS_LABEL[patch.status!]}：「${saved.title}」`,
          true,
        );
      }
      return saved;
    }

    function move(
      task: Task,
      status: TaskStatus,
      position: number | null,
      insertAfterId: string | null,
    ): Promise<Task | null> {
      const patch: TaskPatch =
        position === null ? { position: null, insertAfterId } : { position };
      if (status !== task.status) patch.status = status;
      return update(task, patch);
    }

    async function remove(task: Task): Promise<boolean> {
      try {
        await deleteTask(task.id).unwrap();
      } catch {
        return false;
      }
      push({ label: `刪除「${task.title}」`, undo: () => restore(task), redo: () => softDelete(task.id) });
      showToast(`已刪除「${task.title}」`, true);
      return true;
    }

    async function batchMove(ids: string[], status: TaskStatus): Promise<BatchResult | null> {
      const list = cached();
      const byId = indexById(list);
      const before = new Map(ids.flatMap((id) => (byId.has(id) ? [[id, byId.get(id)!] as const] : [])));
      const prev = new Map([...before.values()].map((t) => [t.id, prevInColumn(t, list)]));
      let result: BatchResult;
      try {
        result = await batchTasks({ ids, op: 'move', status }).unwrap();
      } catch {
        return null;
      }

      // Old column order, so a task's predecessor (if it moved too) is put back before it.
      const moved = result.updated
        .map((id) => before.get(id))
        .filter((t): t is Task => t !== undefined && t.status !== status)
        .sort((a, b) => a.status.localeCompare(b.status) || a.position - b.position);
      if (moved.length > 0) {
        push({
          label: `移動 ${moved.length} 筆任務`,
          undo: async () => {
            for (const t of moved) {
              await updateTask({
                id: t.id,
                patch: { status: t.status, position: null, insertAfterId: prev.get(t.id) ?? null },
              }).unwrap();
            }
          },
          redo: async () => {
            await batchTasks({ ids: moved.map((t) => t.id), op: 'move', status }).unwrap();
          },
        });
      }
      const blocked = result.skipped.filter((s) => s.reason === 'TASK_BLOCKED').length;
      showToast(
        blocked > 0
          ? `已移動 ${moved.length} 筆，${blocked} 筆因等待前置任務而略過`
          : moved.length > 0
            ? `已移動 ${moved.length} 筆`
            : '沒有需要移動的任務',
        moved.length > 0,
      );
      return result;
    }

    async function batchRemove(ids: string[]): Promise<BatchResult | null> {
      let result: BatchResult;
      try {
        result = await batchTasks({ ids, op: 'delete' }).unwrap();
      } catch {
        return null;
      }
      const removed = result.updated;
      if (removed.length > 0) {
        push({
          label: `刪除 ${removed.length} 筆任務`,
          undo: () => batch(removed, 'restore'),
          redo: () => batch(removed, 'delete'),
        });
      }
      showToast(`已刪除 ${removed.length} 筆`, removed.length > 0);
      return result;
    }

    async function loadSamples(boardId: string): Promise<number> {
      const today = todayISO();
      const idByTitle = new Map<string, string>();
      const perColumn: Record<TaskStatus, number> = { todo: 0, 'in-progress': 0, done: 0 };
      const created: string[] = [];
      for (const s of SAMPLE_TASKS) {
        const id = crypto.randomUUID();
        idByTitle.set(s.title, id);
        perColumn[s.status] += 1;
        try {
          await createTask({
            id,
            boardId,
            title: s.title,
            description: s.description,
            status: s.status,
            priority: s.priority,
            dueDate: s.dueInDays === null ? null : addDays(today, s.dueInDays),
            tags: s.tags,
            subtasks: s.subtasks.map((st) => ({ id: crypto.randomUUID(), ...st })),
            dependsOn: (s.dependsOnTitles ?? []).flatMap((t) => idByTitle.get(t) ?? []),
            position: perColumn[s.status] * POSITION_STEP,
          }).unwrap();
        } catch {
          break;
        }
        created.push(id);
      }
      if (created.length > 0) {
        push({
          label: '載入範例任務',
          undo: () => batch(created, 'delete'),
          redo: () => batch(created, 'restore'),
        });
        showToast(`已載入 ${created.length} 筆範例任務`, true);
      }
      return created.length;
    }

    return { create, update, move, remove, batchMove, batchRemove, loadSamples };
  }, [store, createTask, updateTask, deleteTask, batchTasks, push, showToast]);
}
