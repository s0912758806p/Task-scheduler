// /api/tasks/:id — PATCH (any field subset, incl. status, position / position: null + insertAfterId,
// deletedAt: null to restore): 200 + task; 409 TASK_BLOCKED / DEPENDENCY_CYCLE, 400
// INVALID_DEPENDENCY / INVALID_POSITION. DELETE: soft delete, 204. Someone else's, unknown,
// soft-deleted (except restore) or non-UUID id → 404.
import { taskUpdate } from '@/lib/validation';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { json, readJson, route } from '@/server/http';
import { softDeleteTask, updateTask } from '@/server/services/tasks';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const input = taskUpdate.parse(await readJson(req));
  return json(await updateTask(getDb(), user.id, id, input));
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await softDeleteTask(getDb(), user.id, id);
  return new Response(null, { status: 204 });
});
