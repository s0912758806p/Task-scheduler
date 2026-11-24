// Normalises import files (v2 export object or the old Vite app's plain array) and the old
// localStorage data into one tolerant shape. Bad rows are repaired or skipped with a Traditional
// Chinese warning (1-based row numbers); only an unrecognisable top-level shape throws.
import { ApiError } from '@/server/errors';
import { msToLocalISO } from '@/lib/dates';
import { renumber } from '@/lib/position';
import type { Priority, Subtask, TaskStatus } from '@/lib/types';
import {
  DESCRIPTION_MAX,
  SUBTASKS_MAX,
  TAGS_MAX,
  TAG_MAX_LEN,
  TITLE_MAX,
  cleanTags,
  cleanTitle,
  isISODate,
} from '@/lib/validation';

export interface ImportTask {
  sourceId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  tags: string[];
  subtasks: Subtask[];
  dependsOnSourceIds: string[];
  createdAt: string;
  completedAt: string | null;
  position: number;
}

export interface NormalizedImport {
  tasks: ImportTask[];
  warnings: string[];
}

const DEFAULT_BOARD = 'default';
const DEFAULT_BOARD_NAME = '我的看板';
const STATUSES: readonly string[] = ['todo', 'in-progress', 'done'];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function toISO(v: unknown): string | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeSubtasks(v: unknown, label: string, warnings: string[]): Subtask[] {
  if (!Array.isArray(v)) return [];
  const out: Subtask[] = [];
  for (const s of v) {
    if (!isRec(s) || typeof s.title !== 'string') continue;
    const t = cleanTitle(s.title).slice(0, TITLE_MAX);
    if (!t) continue;
    out.push({ id: crypto.randomUUID(), title: t, done: s.done === true });
  }
  if (out.length > SUBTASKS_MAX) {
    warnings.push(`${label}：子任務超過 ${SUBTASKS_MAX} 筆，多出的已略過`);
    out.length = SUBTASKS_MAX;
  }
  return out;
}

function normalizeTags(v: unknown, label: string, warnings: string[]): string[] {
  if (!Array.isArray(v)) return [];
  const tags = cleanTags(v.filter((t): t is string => typeof t === 'string')).map((t) =>
    t.slice(0, TAG_MAX_LEN),
  );
  const unique = [...new Set(tags)];
  if (unique.length > TAGS_MAX) {
    warnings.push(`${label}：標籤超過 ${TAGS_MAX} 個，多出的已略過`);
    return unique.slice(0, TAGS_MAX);
  }
  return unique;
}

interface Row {
  task: Omit<ImportTask, 'position'>;
  boardId: unknown;
}

/** Converts one raw row; returns null (with a warning) when it must be skipped. */
function normalizeRow(
  raw: unknown,
  index: number,
  legacy: boolean,
  timeZone: string,
  warnings: string[],
): Row | null {
  const label = `第 ${index + 1} 筆`;
  if (!isRec(raw)) {
    warnings.push(`${label}：格式無效，已略過`);
    return null;
  }
  const rawTitle = typeof raw.title === 'string' ? cleanTitle(raw.title) : '';
  if (!rawTitle) {
    warnings.push(`${label}：缺少標題，已略過`);
    return null;
  }
  let title = rawTitle;
  if (title.length > TITLE_MAX) {
    title = title.slice(0, TITLE_MAX);
    warnings.push(`${label}：標題超過 ${TITLE_MAX} 字，已截斷`);
  }
  let description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (description.length > DESCRIPTION_MAX) {
    description = description.slice(0, DESCRIPTION_MAX);
    warnings.push(`${label}：描述超過 ${DESCRIPTION_MAX} 字，已截斷`);
  }

  let status: TaskStatus = 'todo';
  if (typeof raw.status === 'string' && STATUSES.includes(raw.status)) {
    status = raw.status as TaskStatus;
  } else {
    warnings.push(`${label}：狀態無效，已設為「待辦」`);
  }
  let priority: Priority = 2;
  if (typeof raw.priority === 'number' && [0, 1, 2, 3].includes(raw.priority)) {
    priority = raw.priority as Priority;
  } else {
    warnings.push(`${label}：優先級無效，已設為「中」`);
  }

  let dueDate: string | null = null;
  if (raw.dueDate !== undefined && raw.dueDate !== null) {
    if (legacy && typeof raw.dueDate === 'number' && !Number.isNaN(new Date(raw.dueDate).getTime())) {
      dueDate = msToLocalISO(raw.dueDate, timeZone);
    } else if (!legacy && isISODate(raw.dueDate)) {
      dueDate = raw.dueDate;
    } else {
      warnings.push(`${label}：到期日無效，已清除`);
    }
  }

  const createdAt = toISO(raw.createdAt) ?? new Date().toISOString();
  const completedAt = status === 'done' ? toISO(raw.completedAt) : null;
  const deps = raw.dependsOn;
  const dependsOnSourceIds = Array.isArray(deps)
    ? [...new Set(deps.filter((d): d is string | number => typeof d === 'string' || typeof d === 'number').map(String))]
    : [];
  const sid = raw.id;
  const sourceId = typeof sid === 'string' || typeof sid === 'number' ? String(sid) : String(index + 1);

  return {
    boardId: raw.boardId,
    task: {
      sourceId,
      title,
      description,
      status,
      priority,
      dueDate,
      tags: normalizeTags(raw.tags, label, warnings),
      subtasks: normalizeSubtasks(raw.subtasks, label, warnings),
      dependsOnSourceIds,
      createdAt,
      completedAt,
    },
  };
}

function normalizeRows(rows: unknown[], legacy: boolean, timeZone: string, warnings: string[]): Row[] {
  const out: Row[] = [];
  rows.forEach((raw, i) => {
    const r = normalizeRow(raw, i, legacy, timeZone, warnings);
    if (r) out.push(r);
  });
  return out;
}

function withPositions(tasks: Array<Omit<ImportTask, 'position'>>): ImportTask[] {
  const pos = renumber(tasks.map((_, i) => String(i)));
  return tasks.map((t, i) => ({ ...t, position: pos[i].position }));
}

function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
  } catch {
    throw new ApiError(400, 'INVALID_TIME_ZONE', '時區無效');
  }
}

/** Accepts a v2 export object or the old app's plain array. */
export function normalizeImportFile(raw: unknown, timeZone: string): NormalizedImport {
  assertTimeZone(timeZone);
  const warnings: string[] = [];
  let rows: unknown[];
  let legacy: boolean;
  if (Array.isArray(raw)) {
    rows = raw;
    legacy = true;
  } else if (isRec(raw) && raw.format === 'task-scheduler' && raw.version === 2 && Array.isArray(raw.tasks)) {
    rows = raw.tasks;
    legacy = false;
  } else {
    throw new ApiError(400, 'INVALID_IMPORT_FILE', '匯入檔案格式無法辨識');
  }
  const kept = normalizeRows(rows, legacy, timeZone, warnings);
  return { tasks: withPositions(kept.map((r) => r.task)), warnings };
}

/** Old localStorage data: `taskSchedulerBoards` and `taskSchedulerTasks_v3` parsed values. */
export function normalizeLocalStorage(
  raw: { boards: unknown; tasks: unknown },
  timeZone: string,
): {
  boards: Array<{ sourceId: string; name: string }>;
  tasksByBoard: Record<string, NormalizedImport>;
} {
  assertTimeZone(timeZone);
  const boards: Array<{ sourceId: string; name: string }> = [];
  const list = isRec(raw.boards) && Array.isArray(raw.boards.boards) ? raw.boards.boards : [];
  for (const b of list) {
    if (!isRec(b) || (typeof b.id !== 'string' && typeof b.id !== 'number')) continue;
    const nm = typeof b.name === 'string' ? b.name.trim().slice(0, 60) : '';
    const sourceId = String(b.id);
    if (!nm || boards.some((x) => x.sourceId === sourceId)) continue;
    boards.push({ sourceId, name: nm });
  }
  if (boards.length === 0) boards.push({ sourceId: DEFAULT_BOARD, name: DEFAULT_BOARD_NAME });

  const warnings: string[] = [];
  const rows = Array.isArray(raw.tasks) ? normalizeRows(raw.tasks, true, timeZone, warnings) : [];
  const known = new Set(boards.map((b) => b.sourceId));
  const groups = new Map<string, Array<Omit<ImportTask, 'position'>>>();
  for (const r of rows) {
    let bid = typeof r.boardId === 'string' || typeof r.boardId === 'number' ? String(r.boardId) : DEFAULT_BOARD;
    if (!known.has(bid)) {
      bid = DEFAULT_BOARD;
      if (!known.has(DEFAULT_BOARD)) {
        known.add(DEFAULT_BOARD);
        boards.push({ sourceId: DEFAULT_BOARD, name: DEFAULT_BOARD_NAME });
      }
    }
    if (!groups.has(bid)) groups.set(bid, []);
    groups.get(bid)!.push(r.task);
  }

  const tasksByBoard: Record<string, NormalizedImport> = {};
  for (const b of boards) {
    tasksByBoard[b.sourceId] = { tasks: withPositions(groups.get(b.sourceId) ?? []), warnings: [] };
  }
  // Row warnings are numbered against the whole old array, so they live on the first board.
  tasksByBoard[boards[0].sourceId].warnings = warnings;
  return { boards, tasksByBoard };
}
