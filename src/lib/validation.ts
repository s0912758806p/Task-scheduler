// zod schemas shared by API handlers and forms. Strings are trimmed before length checks; titles
// have newlines collapsed to spaces; tags are trimmed, de-duplicated and bounded.
import { z } from 'zod';

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;
export const BOARD_NAME_MAX = 60;
export const TAG_MAX_LEN = 30;
export const TAGS_MAX = 20;
export const SUBTASKS_MAX = 50;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written as YYYY-MM-DD. */
export function isISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Newlines to spaces, trimmed. */
export function cleanTitle(s: string): string {
  return s.replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

/** Trim, drop empties, de-duplicate (order kept). Length limits are checked by the caller. */
export function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const t of tags) {
    const v = t.trim();
    if (v) seen.add(v);
  }
  return [...seen];
}

const title = z
  .string()
  .transform(cleanTitle)
  .pipe(z.string().min(1, '標題不可為空').max(TITLE_MAX, `標題最多 ${TITLE_MAX} 字`));

const description = z.string().trim().max(DESCRIPTION_MAX, `描述最多 ${DESCRIPTION_MAX} 字`);

const status = z.enum(['todo', 'in-progress', 'done']);
const priority = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const dueDate = z
  .string()
  .refine(isISODate, '日期格式需為 YYYY-MM-DD')
  .nullable();

const tags = z
  .array(z.string())
  .transform(cleanTags)
  .pipe(z.array(z.string().max(TAG_MAX_LEN, `標籤最多 ${TAG_MAX_LEN} 字`)).max(TAGS_MAX, `標籤最多 ${TAGS_MAX} 個`));

const subtask = z.object({
  id: z.uuid(),
  title,
  done: z.boolean(),
});
const subtasks = z.array(subtask).max(SUBTASKS_MAX, `子任務最多 ${SUBTASKS_MAX} 筆`);

const name = z.string().trim().min(1, '名稱不可為空').max(BOARD_NAME_MAX, `名稱最多 ${BOARD_NAME_MAX} 字`);

export const boardCreate = z.object({ name });
export const boardUpdate = z.object({ name });

const taskFields = {
  title,
  description,
  status,
  priority,
  dueDate,
  tags,
  subtasks,
  dependsOn: z.array(z.uuid()),
  position: z.number().finite(),
};

export const taskCreate = z.object({
  id: z.uuid().optional(),
  boardId: z.uuid(),
  title: taskFields.title,
  description: taskFields.description.optional(),
  status: taskFields.status.optional(),
  priority: taskFields.priority.optional(),
  dueDate: taskFields.dueDate.optional(),
  tags: taskFields.tags.optional(),
  subtasks: taskFields.subtasks.optional(),
  dependsOn: taskFields.dependsOn.optional(),
  position: taskFields.position.optional(),
});

export const taskUpdate = z
  .object({
    title: taskFields.title.optional(),
    description: taskFields.description.optional(),
    status: taskFields.status.optional(),
    priority: taskFields.priority.optional(),
    dueDate: taskFields.dueDate.optional(),
    tags: taskFields.tags.optional(),
    subtasks: taskFields.subtasks.optional(),
    dependsOn: taskFields.dependsOn.optional(),
    position: taskFields.position.optional(),
    deletedAt: z.null().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), '至少需要一個欄位');

export const batchRequest = z
  .object({
    ids: z.array(z.uuid()).min(1).max(500),
    op: z.enum(['move', 'delete', 'restore']),
    status: status.optional(),
  })
  .refine((v) => v.op !== 'move' || v.status !== undefined, {
    message: '移動需要指定狀態',
    path: ['status'],
  });

const exportTask = z.object({
  id: z.string(),
  title,
  description: z.string(),
  status,
  priority,
  dueDate,
  tags,
  subtasks,
  dependsOn: z.array(z.string()),
  createdAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  position: z.number().finite(),
});

export const exportV2 = z.object({
  format: z.literal('task-scheduler'),
  version: z.literal(2),
  exportedAt: z.iso.datetime({ offset: true }),
  board: z.object({ name }),
  tasks: z.array(exportTask),
});

export type TaskCreateInput = z.infer<typeof taskCreate>;
export type TaskUpdateInput = z.infer<typeof taskUpdate>;
export type BatchRequest = z.infer<typeof batchRequest>;
export type ExportV2 = z.infer<typeof exportV2>;
