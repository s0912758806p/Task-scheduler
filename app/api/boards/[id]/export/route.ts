// GET /api/boards/:id/export — 200 v2 JSON file download (Content-Disposition attachment with an
// ASCII fallback `board-YYYY-MM-DD.json` and an RFC 5987 `filename*` carrying the board name; the
// date is the server's UTC date). Someone else's or unknown board → 404.
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { route } from '@/server/http';
import { exportBoard } from '@/server/services/importExport';

type Ctx = { params: Promise<{ id: string }> };

const rfc5987 = (s: string) =>
  encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const file = await exportBoard(getDb(), user.id, id);
  const date = file.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(file, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="board-${date}.json"; filename*=UTF-8''${rfc5987(`${file.board.name}-${date}.json`)}`,
    },
  });
});
