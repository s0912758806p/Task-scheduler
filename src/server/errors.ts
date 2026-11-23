// API error carried from services/handlers to the route wrapper. Must stay free of server-only
// imports: src/lib (e.g. legacy.ts) throws it too.

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
