// /api/boards/:id — PATCH {name?, position?}: 200 + board; DELETE: 204 (hard delete incl. tasks;
// 409 LAST_BOARD for the last board). Someone else's or unknown id (incl. non-UUID) → 404.
import { boardUpdate } from '@/lib/validation';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { json, readJson, route } from '@/server/http';
import { deleteBoard, updateBoard } from '@/server/services/boards';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const input = boardUpdate.parse(await readJson(req));
  return json(await updateBoard(getDb(), user.id, id, input));
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await deleteBoard(getDb(), user.id, id);
  return new Response(null, { status: 204 });
});
