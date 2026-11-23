// POST /api/tasks/batch {ids, op: "move" | "delete" | "restore", status?}: one transaction.
// 200 { updated: string[], skipped: [{id, reason: "TASK_BLOCKED" | "NOT_FOUND"}] } — blocked moves
// and foreign / unknown / (for move) soft-deleted ids are skipped, never a whole-batch failure.
// Invalid body (e.g. move without status) → 400. See services/tasks.ts for the exact semantics.
import { batchRequest } from '@/lib/validation';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { json, readJson, route } from '@/server/http';
import { batchTasks } from '@/server/services/tasks';

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = batchRequest.parse(await readJson(req));
  return json(await batchTasks(getDb(), user.id, input));
});
