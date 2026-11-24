// Helpers for App Router API handlers.
// - json(): JSON Response with a status (default 200).
// - route(): wraps a handler so thrown errors become the spec §7 error body:
//   ApiError → its status/code/message/details; ZodError → 400 VALIDATION_ERROR with the zod
//   issues as details; anything else → 500 INTERNAL_ERROR (logged with console.error, the
//   original message is never sent to the client).
// - readJson(): reads a request body as JSON, streaming so an oversized body is rejected with
//   413 PAYLOAD_TOO_LARGE once it passes maxBytes (UTF-8 bytes); empty or invalid JSON → 400
//   INVALID_JSON.
import { ZodError } from 'zod';
import { ApiError, type ApiErrorBody } from './errors';

/** Default request body limit; the import endpoints pass their own 2 MB limit. */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

export function json<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

function errorResponse(status: number, error: ApiErrorBody['error']): Response {
  return json<ApiErrorBody>({ error }, status);
}

export function route<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return errorResponse(err.status, {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined && { details: err.details }),
        });
      }
      if (err instanceof ZodError) {
        return errorResponse(400, {
          code: 'VALIDATION_ERROR',
          message: '輸入資料格式不正確',
          details: err.issues,
        });
      }
      console.error(err);
      return errorResponse(500, { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' });
    }
  };
}

function tooLarge(): ApiError {
  return new ApiError(413, 'PAYLOAD_TOO_LARGE', '請求內容太大');
}

async function readText(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get('content-length'));
  if (declared > maxBytes) throw tooLarge();
  if (!req.body) return '';

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJson(
  req: Request,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown> {
  const text = await readText(req, maxBytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', '請求內容不是有效的 JSON');
  }
}
