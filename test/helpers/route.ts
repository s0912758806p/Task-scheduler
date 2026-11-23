// Helper for testing App Router Route Handlers without a server.
//
// call(handler, { method, url, body?, params? }) builds a Request, invokes the handler (dynamic
// `params` wrapped in Promise.resolve, as Next 16 passes them) and returns
// { status, body } with body = parsed JSON, or null when the response has no body (204).
//
// Standard mocking pattern for API tests (Tasks 7-10). vi.mock is hoisted, so share the
// variables through vi.hoisted; the real route() wrapper stays in place so error mapping is tested:
//
//   const h = vi.hoisted(() => ({ db: undefined as unknown as DB }));
//   vi.mock('@/server/auth', () => ({ requireUser: vi.fn() }));
//   vi.mock('@/server/db', () => ({ getDb: () => h.db }));
//   ...
//   beforeEach(async () => { h.db = await createTestDb(); });
//   afterEach(async () => { await closeTestDb(h.db); });
//   vi.mocked(requireUser).mockResolvedValue({ id, email, name: 'x', image: null });
//   // 401: vi.mocked(requireUser).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', '請先登入'));
//
// Import the route modules (`await import(...)` or a static import) after the vi.mock calls.

type Params = Record<string, string>;
type Handler<P extends Params> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;

export interface CallOptions<P extends Params> {
  method: string;
  url: string;
  body?: unknown;
  params?: P;
}

export async function call<P extends Params = Params>(
  handler: Handler<P>,
  { method, url, body, params }: CallOptions<P>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: bodies are asserted ad hoc
): Promise<{ status: number; body: any }> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  const res = await handler(new Request(new URL(url, 'http://localhost').toString(), init), {
    params: Promise.resolve((params ?? {}) as P),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
