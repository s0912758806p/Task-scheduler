// Fake network for client tests (RTK Query's fetchBaseQuery). installFetch(handler) stubs the global
// `fetch` with a vi.fn that passes each Request to `handler`, and stubs `Request` so the app's
// relative URLs ('/api/…') resolve against http://localhost (Node's Request rejects relative URLs;
// browsers resolve them against the page). Call vi.unstubAllGlobals() in afterEach.
import { vi } from 'vitest';

export type FetchHandler = (req: Request) => Response | Promise<Response>;

export function installFetch(handler: FetchHandler) {
  const NodeRequest = globalThis.Request;
  class RelativeRequest extends NodeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      // Drop `signal`: under jsdom the AbortSignal is jsdom's, which Node's Request rejects.
      const { signal: _signal, ...rest } = init ?? {};
      void _signal;
      super(typeof input === 'string' ? new URL(input, 'http://localhost') : input, rest);
    }
  }
  const fetchMock = vi.fn(async (req: Request) => handler(req));
  vi.stubGlobal('Request', RelativeRequest);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function jsonResponse(body: unknown, status = 200): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}

/** Path + method of a request, e.g. "PATCH /api/tasks/t1". */
export function route(req: Request): string {
  return `${req.method} ${new URL(req.url).pathname}`;
}
