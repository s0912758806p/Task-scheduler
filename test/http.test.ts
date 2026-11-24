import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError } from '@/server/errors';
import { json, readJson, route } from '@/server/http';

function postRequest(body: string): Request {
  return new Request('http://localhost/api/x', { method: 'POST', body });
}

describe('json', () => {
  it('serialises data with the given status and a JSON content type', async () => {
    const res = json({ ok: true }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('defaults to 200', () => {
    expect(json([]).status).toBe(200);
  });
});

describe('route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes successful responses and arguments through', async () => {
    const handler = route(async (a: number, b: number) => json({ sum: a + b }));
    const res = await handler(2, 3);
    expect(await res.json()).toEqual({ sum: 5 });
  });

  it('maps ApiError to its status and error body', async () => {
    const res = await route(async () => {
      throw new ApiError(404, 'NOT_FOUND', '找不到');
    })();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message: '找不到' } });
  });

  it('includes ApiError details when present', async () => {
    const res = await route(async () => {
      throw new ApiError(409, 'TASK_BLOCKED', '被擋住', { blockedBy: ['a'] });
    })();
    expect(await res.json()).toEqual({
      error: { code: 'TASK_BLOCKED', message: '被擋住', details: { blockedBy: ['a'] } },
    });
  });

  it('maps ZodError to 400 VALIDATION_ERROR with the issues as details', async () => {
    const res = await route(async () => {
      z.object({ name: z.string() }).parse({ name: 1 });
      return json(null);
    })();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual([expect.objectContaining({ path: ['name'] })]);
  });

  it('maps unknown errors to 500 without leaking the message, and logs them', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await route(async () => {
      throw new Error('db password is hunter2');
    })();
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe('INTERNAL_ERROR');
    expect(text).not.toContain('hunter2');
    expect(log).toHaveBeenCalledOnce();
  });
});

describe('readJson', () => {
  it('parses a JSON body', async () => {
    expect(await readJson(postRequest('{"a":[1,2]}'))).toEqual({ a: [1, 2] });
  });

  it('rejects bodies larger than maxBytes with 413 PAYLOAD_TOO_LARGE', async () => {
    const err = await readJson(postRequest(JSON.stringify({ s: 'x'.repeat(100) })), 50).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('counts bytes, not characters', async () => {
    // 20 CJK characters = 60 UTF-8 bytes (+ 2 quotes).
    const err = await readJson(postRequest(JSON.stringify('任'.repeat(20))), 40).catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ status: 413 });
  });

  it.each([['not json'], ['']])('rejects %j with 400 INVALID_JSON', async (body) => {
    const err = await readJson(postRequest(body)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'INVALID_JSON' });
  });
});
