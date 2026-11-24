// POST /api/import/local — body { timeZone, boards, tasks } (the parsed old localStorage values
// `taskSchedulerBoards` and `taskSchedulerTasks_v3`; ≤ 2 MB, > 2,000 tasks → 413 TOO_MANY_TASKS).
// 200 { boards: Board[], taskCount, warnings }.
import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { json, readJson, route } from '@/server/http';
import { importLocal } from '@/server/services/importExport';

const body = z.object({ timeZone: z.string().min(1), boards: z.unknown(), tasks: z.unknown() });

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = body.parse(await readJson(req, 2_000_000));
  return json(await importLocal(getDb(), user.id, input, input.timeZone));
});
