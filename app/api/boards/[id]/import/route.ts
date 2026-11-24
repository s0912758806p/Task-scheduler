// POST /api/boards/:id/import — body { timeZone, file } (≤ 2 MB; > 2,000 tasks → 413
// TOO_MANY_TASKS). Replaces only this board's tasks (old ones are soft-deleted).
// 200 { imported: id[], replaced: id[], warnings: string[] }.
import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { json, readJson, route } from '@/server/http';
import { importBoard } from '@/server/services/importExport';

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ timeZone: z.string().min(1), file: z.unknown() });

export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const input = body.parse(await readJson(req, 2_000_000));
  return json(await importBoard(getDb(), user.id, id, input.file, input.timeZone));
});
