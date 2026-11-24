// /api/tasks — GET [?boardId=]: own non-deleted tasks (bare array; boardId not owned or malformed →
// 404); POST {id?, boardId, title, …}: 201 + task (no position → top of its column).
import { taskCreate } from '@/lib/validation';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { json, readJson, route } from '@/server/http';
import { createTask, listTasks } from '@/server/services/tasks';

export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const boardId = new URL(req.url).searchParams.get('boardId') ?? undefined;
  return json(await listTasks(getDb(), user.id, { boardId }));
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = taskCreate.parse(await readJson(req));
  return json(await createTask(getDb(), user.id, input), 201);
});
