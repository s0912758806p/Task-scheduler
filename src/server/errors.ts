// API error carried from services/handlers to the route wrapper (`route()` in ./http turns it into
// a `{ error: { code, message, details? } }` response with `status`). Must stay free of
// server-only imports: src/lib (e.g. legacy.ts) throws it and the client reads `ApiErrorBody`.

/** JSON body of every API error response (spec §7). */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
