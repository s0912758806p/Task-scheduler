// RTK Query API slice (spec §6.3). Tags: Board, Task. getTasks (no arg) loads every non-deleted task
// of the user once; every screen derives its view from that one cache entry.
// - baseQueryWithAuth: fetchBaseQuery on /api; any 401 sends the browser to
//   /login?next=<current path + query> (and no error toast is shown for it).
// - createTask / updateTask / deleteTask / batchTasks are optimistic: the getTasks cache is patched
//   first (mirroring the server's placement rules: a status change without position goes to the top
//   of the target column, position: null renumbers the column and inserts after insertAfterId,
//   batch moves append in request order and skip blocked todo tasks), then the request is sent.
//   On success the server's task replaces the cached one; after a position: null PATCH or a batch
//   move/restore the Task tag is invalidated (the server renumbered or appended siblings).
//   On failure the patch is rolled back; updateTask/deleteTask answering 404 also drop the task from
//   the cache and toast 「這筆任務已不存在」; any other error toasts the server's message.
// - updateTask accepts an optional `snapshot`: a restore (patch.deletedAt === null) of a task that is
//   no longer cached re-inserts it optimistically from the snapshot.
// - Board mutations invalidate Board (createBoard also inserts the new board into getBoards at once,
//   so navigating to it never finds it missing; deleteBoard also drops that board's tasks from the cache);
//   importBoard / importLocal invalidate Board and Task. Their errors are toasted too.
// - batchTasks splits ids into requests of ≤ 500 (sent in order) and merges updated/skipped. On any
//   error it rolls back and also invalidates Task, since earlier slices may already be applied.
// Toasts go through the store's thunk extra argument (ApiExtra), see store.ts.
import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { POSITION_STEP, positionBetween, renumber } from '@/lib/position';
import { indexById, isBlocked } from '@/lib/taskQueries';
import type { ApiErrorBody, Board, Task, TaskStatus } from '@/lib/types';
import type { ExportV2, TaskCreateInput, TaskUpdateInput } from '@/lib/validation';

export interface ApiExtra {
  toast: (text: string) => void;
}

export type CreateTaskArg = TaskCreateInput & { id: string };
export type TaskPatch = TaskUpdateInput;
export interface UpdateTaskArg {
  id: string;
  patch: TaskPatch;
  snapshot?: Task;
}
/** Matches the server's per-request limit on /api/tasks/batch (src/lib/validation.ts). */
export const BATCH_MAX_IDS = 500;
export interface BatchArg {
  ids: string[];
  op: 'move' | 'delete' | 'restore';
  status?: TaskStatus;
}
export interface BatchResult {
  updated: string[];
  skipped: { id: string; reason: 'TASK_BLOCKED' | 'NOT_FOUND' }[];
}
export interface ImportResult {
  imported: string[];
  replaced: string[];
  warnings: string[];
}
export interface LocalImportResult {
  boards: Board[];
  taskCount: number;
  warnings: string[];
}

const rawBaseQuery = fetchBaseQuery({ baseUrl: '/api' });

export const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  baseApi,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, baseApi, extraOptions);
  if (result.error?.status === 401) {
    const { pathname, search } = window.location;
    // A full page load on purpose: the login page must not inherit this session's cached data.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login?next=' + encodeURIComponent(pathname + search));
  }
  return result;
};

/** User-facing text for an RTK Query error: the server's message when there is one. */
export function errorMessage(error: unknown): string {
  const e = error as FetchBaseQueryError | undefined;
  if (e && typeof e.status === 'number') {
    return (e.data as ApiErrorBody | undefined)?.error?.message ?? `發生錯誤（${e.status}）`;
  }
  if (e?.status === 'FETCH_ERROR') return '無法連線到伺服器，請檢查網路後再試';
  return '發生錯誤，請稍後再試';
}

const GONE = '這筆任務已不存在';

/** The FetchBaseQueryError inside a rejected queryFulfilled. */
const rejection = (err: unknown) => (err as { error?: FetchBaseQueryError }).error;

function toast(extra: unknown, text: string) {
  (extra as ApiExtra | undefined)?.toast(text);
}

// ---- cache helpers (mutate an Immer draft of the getTasks list) ----

function columnOf(list: Task[], boardId: string, status: TaskStatus, exceptId?: string): Task[] {
  return list
    .filter((t) => t.boardId === boardId && t.status === status && t.id !== exceptId)
    .sort((a, b) => a.position - b.position);
}

function topPosition(list: Task[], boardId: string, status: TaskStatus, exceptId?: string): number {
  return positionBetween(null, columnOf(list, boardId, status, exceptId)[0]?.position ?? null) ?? 0;
}

function endPosition(list: Task[], boardId: string, status: TaskStatus, exceptId?: string): number {
  const col = columnOf(list, boardId, status, exceptId);
  return col.length === 0 ? 0 : col[col.length - 1].position + POSITION_STEP;
}

/** Same as the server: renumber the column and put `task` right after `afterId` (null → top). */
function placeAfter(list: Task[], task: Task, afterId: string | null) {
  const col = columnOf(list, task.boardId, task.status, task.id);
  const at = afterId === null ? -1 : col.findIndex((t) => t.id === afterId);
  if (afterId !== null && at === -1) return; // the server answers 400; the rollback handles it
  const ids = [...col.slice(0, at + 1).map((t) => t.id), task.id, ...col.slice(at + 1).map((t) => t.id)];
  const byId = indexById(list);
  for (const { id, position } of renumber(ids)) byId.get(id)!.position = position;
}

function setStatus(task: Task, status: TaskStatus) {
  task.status = status;
  task.completedAt = status === 'done' ? new Date().toISOString() : null;
}

function applyPatch(list: Task[], { id, patch, snapshot }: UpdateTaskArg) {
  let task = list.find((t) => t.id === id);
  if (!task && patch.deletedAt === null && snapshot) {
    list.push({ ...snapshot });
    task = list[list.length - 1];
  }
  if (!task) return;
  const { status, position, insertAfterId, deletedAt: _deletedAt, ...fields } = patch;
  void _deletedAt;
  Object.assign(task, fields);
  if (status !== undefined && status !== task.status) {
    setStatus(task, status);
    if (position === undefined) task.position = topPosition(list, task.boardId, status, task.id);
  }
  if (typeof position === 'number') task.position = position;
  else if (position === null) placeAfter(list, task, insertAfterId ?? null);
}

function upsert(list: Task[], saved: Task) {
  const i = list.findIndex((t) => t.id === saved.id);
  if (i === -1) list.push(saved);
  else list[i] = saved;
}

function removeIds(list: Task[], ids: string[]) {
  const drop = new Set(ids);
  for (let i = list.length - 1; i >= 0; i--) if (drop.has(list[i].id)) list.splice(i, 1);
}

function applyBatchMove(list: Task[], ids: string[], status: TaskStatus) {
  const byId = indexById(list);
  const movable = ids
    .map((id) => byId.get(id))
    .filter((t): t is Task => t !== undefined && t.status !== status && !isBlocked(t, byId));
  for (const t of movable) {
    t.position = endPosition(list, t.boardId, status);
    setStatus(t, status);
  }
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Board', 'Task'],
  endpoints: (build) => {
    /** Shared failure handling for mutations: no toast for 401 (redirecting), toast otherwise. */
    const report = (extra: unknown, err: unknown) => {
      const error = rejection(err);
      if (error?.status === 401) return;
      toast(extra, errorMessage(error));
    };

    return {
      getBoards: build.query<Board[], void>({
        query: () => '/boards',
        providesTags: ['Board'],
      }),
      createBoard: build.mutation<Board, { name: string }>({
        query: (body) => ({ url: '/boards', method: 'POST', body }),
        invalidatesTags: ['Board'],
        async onQueryStarted(_arg, { dispatch, extra, queryFulfilled }) {
          try {
            const { data } = await queryFulfilled;
            // In the cache before the caller navigates to /b/<id>, so BoardView never shows
            // 「找不到這個看板」 while the Board refetch is in flight.
            dispatch(
              api.util.updateQueryData('getBoards', undefined, (list) => {
                if (!list.some((b) => b.id === data.id)) list.push(data);
              }),
            );
          } catch (err) {
            report(extra, err);
          }
        },
      }),
      updateBoard: build.mutation<Board, { id: string; name?: string; position?: number }>({
        query: ({ id, ...body }) => ({ url: `/boards/${id}`, method: 'PATCH', body }),
        invalidatesTags: ['Board'],
        async onQueryStarted(_arg, { extra, queryFulfilled }) {
          await queryFulfilled.catch((err) => report(extra, err));
        },
      }),
      deleteBoard: build.mutation<null, string>({
        query: (id) => ({ url: `/boards/${id}`, method: 'DELETE' }),
        invalidatesTags: ['Board'],
        async onQueryStarted(id, { dispatch, extra, queryFulfilled }) {
          try {
            await queryFulfilled;
            dispatch(
              api.util.updateQueryData('getTasks', undefined, (list) => {
                removeIds(
                  list,
                  list.filter((t) => t.boardId === id).map((t) => t.id),
                );
              }),
            );
          } catch (err) {
            report(extra, err);
          }
        },
      }),

      getTasks: build.query<Task[], void>({
        query: () => '/tasks',
        providesTags: ['Task'],
      }),
      createTask: build.mutation<Task, CreateTaskArg>({
        query: (body) => ({ url: '/tasks', method: 'POST', body }),
        async onQueryStarted(arg, { dispatch, extra, queryFulfilled }) {
          const now = new Date().toISOString();
          const patch = dispatch(
            api.util.updateQueryData('getTasks', undefined, (list) => {
              const status = arg.status ?? 'todo';
              list.push({
                id: arg.id,
                boardId: arg.boardId,
                title: arg.title,
                description: arg.description ?? null,
                status,
                priority: arg.priority ?? 2,
                dueDate: arg.dueDate ?? null,
                position: arg.position ?? topPosition(list, arg.boardId, status),
                tags: arg.tags ?? [],
                subtasks: arg.subtasks ?? [],
                dependsOn: arg.dependsOn ?? [],
                completedAt: status === 'done' ? now : null,
                createdAt: now,
                updatedAt: now,
              });
            }),
          );
          try {
            const { data } = await queryFulfilled;
            dispatch(api.util.updateQueryData('getTasks', undefined, (list) => upsert(list, data)));
          } catch (err) {
            patch.undo();
            report(extra, err);
          }
        },
      }),
      updateTask: build.mutation<Task, UpdateTaskArg>({
        query: ({ id, patch }) => ({ url: `/tasks/${id}`, method: 'PATCH', body: patch }),
        async onQueryStarted(arg, { dispatch, extra, queryFulfilled }) {
          const patch = dispatch(api.util.updateQueryData('getTasks', undefined, (list) => applyPatch(list, arg)));
          try {
            const { data } = await queryFulfilled;
            dispatch(api.util.updateQueryData('getTasks', undefined, (list) => upsert(list, data)));
            if (arg.patch.position === null) dispatch(api.util.invalidateTags(['Task']));
          } catch (err) {
            patch.undo();
            if (rejection(err)?.status === 404) {
              dispatch(api.util.updateQueryData('getTasks', undefined, (list) => removeIds(list, [arg.id])));
              toast(extra, GONE);
            } else {
              report(extra, err);
            }
          }
        },
      }),
      deleteTask: build.mutation<null, string>({
        query: (id) => ({ url: `/tasks/${id}`, method: 'DELETE' }),
        async onQueryStarted(id, { dispatch, extra, queryFulfilled }) {
          const patch = dispatch(api.util.updateQueryData('getTasks', undefined, (list) => removeIds(list, [id])));
          try {
            await queryFulfilled;
          } catch (err) {
            if (rejection(err)?.status === 404) {
              toast(extra, GONE); // already gone on the server: keep it out of the cache
            } else {
              patch.undo();
              report(extra, err);
            }
          }
        },
      }),
      batchTasks: build.mutation<BatchResult, BatchArg>({
        // The server takes at most BATCH_MAX_IDS ids per request: send slices one after another and
        // merge the answers (an import may replace/create up to 2,000 tasks). A failing slice fails
        // the whole call; the optimistic patch below is rolled back and the task list refetched.
        async queryFn(body, _api, _extra, baseQuery) {
          const merged: BatchResult = { updated: [], skipped: [] };
          for (let i = 0; i < Math.max(body.ids.length, 1); i += BATCH_MAX_IDS) {
            const res = await baseQuery({
              url: '/tasks/batch',
              method: 'POST',
              body: { ...body, ids: body.ids.slice(i, i + BATCH_MAX_IDS) },
            });
            if (res.error) return { error: res.error };
            const part = res.data as BatchResult;
            merged.updated.push(...part.updated);
            merged.skipped.push(...part.skipped);
          }
          return { data: merged };
        },
        async onQueryStarted(arg, { dispatch, extra, queryFulfilled }) {
          const patch = dispatch(
            api.util.updateQueryData('getTasks', undefined, (list) => {
              if (arg.op === 'move' && arg.status) applyBatchMove(list, arg.ids, arg.status);
              if (arg.op === 'delete') removeIds(list, arg.ids);
              // restore: nothing to show until the refetch below brings the tasks back
            }),
          );
          try {
            await queryFulfilled;
            if (arg.op !== 'delete') dispatch(api.util.invalidateTags(['Task']));
          } catch (err) {
            patch.undo();
            // Earlier slices may already be applied on the server: refetch so the cache shows them.
            dispatch(api.util.invalidateTags(['Task']));
            report(extra, err);
          }
        },
      }),

      exportBoard: build.mutation<ExportV2, string>({
        query: (id) => ({ url: `/boards/${id}/export` }),
        async onQueryStarted(_arg, { extra, queryFulfilled }) {
          await queryFulfilled.catch((err) => report(extra, err));
        },
      }),
      importBoard: build.mutation<ImportResult, { boardId: string; file: unknown; timeZone: string }>({
        query: ({ boardId, ...body }) => ({ url: `/boards/${boardId}/import`, method: 'POST', body }),
        invalidatesTags: ['Board', 'Task'],
        async onQueryStarted(_arg, { extra, queryFulfilled }) {
          await queryFulfilled.catch((err) => report(extra, err));
        },
      }),
      importLocal: build.mutation<LocalImportResult, { boards: unknown; tasks: unknown; timeZone: string }>({
        query: (body) => ({ url: '/import/local', method: 'POST', body }),
        invalidatesTags: ['Board', 'Task'],
        async onQueryStarted(_arg, { extra, queryFulfilled }) {
          await queryFulfilled.catch((err) => report(extra, err));
        },
      }),
    };
  },
});

export const {
  useGetBoardsQuery,
  useCreateBoardMutation,
  useUpdateBoardMutation,
  useDeleteBoardMutation,
  useGetTasksQuery,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useBatchTasksMutation,
  useExportBoardMutation,
  useImportBoardMutation,
  useImportLocalMutation,
} = api;
