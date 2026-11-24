// /api/boards — GET: own boards by position with openCount (bare array); POST {name}: 201 + board.
import { boardCreate } from '@/lib/validation';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { json, readJson, route } from '@/server/http';
import { createBoard, listBoards } from '@/server/services/boards';

export const GET = route(async () => {
  const user = await requireUser();
  return json(await listBoards(getDb(), user.id));
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = boardCreate.parse(await readJson(req));
  return json(await createBoard(getDb(), user.id, input), 201);
});
