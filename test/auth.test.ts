import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildAuthOptions, getEnabledSocialProviders, normalizeUserName } from '@/server/auth';
import type { DB } from '@/server/db';
import { boards, rateLimit, user as userTable } from '@/server/db/schema';
import { ensureDefaultBoard } from '@/server/services/boards';
import { safeNextPath } from '@/lib/nextPath';
import { closeTestDb, createTestDb, seedUser } from './helpers/db';

const baseEnv = {
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
  BETTER_AUTH_URL: 'http://localhost:3000',
  GITHUB_CLIENT_ID: 'gh-id',
  GITHUB_CLIENT_SECRET: 'gh-secret',
  GOOGLE_CLIENT_ID: 'g-id',
  GOOGLE_CLIENT_SECRET: 'g-secret',
} as const;

// One PGlite database for the file: building it takes ~2 s, and every test below works on its own
// freshly created user, so tests cannot see each other's rows.
let db: DB;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await closeTestDb(db);
});

describe('buildAuthOptions', () => {
  it('enables email/password in every environment with the spec limits', () => {
    for (const NODE_ENV of ['production', 'development', 'test'] as const) {
      expect(buildAuthOptions({ ...baseEnv, NODE_ENV }, db).emailAndPassword).toMatchObject({
        enabled: true,
        minPasswordLength: 8,
        maxPasswordLength: 128,
        autoSignIn: true,
        requireEmailVerification: false,
      });
    }
  });

  it('rate limits in the database outside tests, with stricter sign-in / sign-up rules', () => {
    const rl = buildAuthOptions({ ...baseEnv, NODE_ENV: 'production' }, db).rateLimit;
    expect(rl).toMatchObject({ enabled: true, storage: 'database', window: 60, max: 100 });
    expect(rl?.customRules?.['/sign-in/email']).toEqual({ window: 60, max: 5 });
    expect(rl?.customRules?.['/sign-up/email']).toEqual({ window: 60, max: 3 });
    expect(buildAuthOptions({ ...baseEnv, NODE_ENV: 'test' }, db).rateLimit?.enabled).toBe(false);
  });

  it('links accounts only on verified emails: linking on, no trusted providers', () => {
    const linking = buildAuthOptions({ ...baseEnv, NODE_ENV: 'production' }, db).account
      ?.accountLinking;
    expect(linking?.enabled).toBe(true);
    // A trusted provider bypasses its own email_verified check, so none may be listed.
    expect(linking?.trustedProviders).toBeUndefined();
    // Default (true) also requires the existing user's email to be verified; never override it.
    expect(linking?.requireLocalEmailVerified).toBeUndefined();
  });

  it('reads the OAuth credentials, secret and base URL from the given env', () => {
    const options = buildAuthOptions({ ...baseEnv, NODE_ENV: 'production' }, db);
    expect(options.socialProviders?.github).toMatchObject({
      clientId: 'gh-id',
      clientSecret: 'gh-secret',
    });
    expect(options.socialProviders?.google).toMatchObject({
      clientId: 'g-id',
      clientSecret: 'g-secret',
    });
    expect(options.secret).toBe(baseEnv.BETTER_AUTH_SECRET);
    expect(options.baseURL).toBe(baseEnv.BETTER_AUTH_URL);
  });

  it('creates the default board when Better Auth creates a user', async () => {
    const auth = betterAuth(buildAuthOptions({ ...baseEnv, NODE_ENV: 'test' }, db));
    const { user } = await auth.api.signUpEmail({
      body: { name: 'E2E', email: 'e2e@example.test', password: 'correct-horse-battery' },
    });

    const rows = await db.select().from(boards).where(eq(boards.userId, user.id));
    expect(rows.map((b) => [b.name, b.position])).toEqual([['我的看板', 1024]]);
  });
});

describe('getEnabledSocialProviders', () => {
  it.each([
    [
      {
        GITHUB_CLIENT_ID: 'a',
        GITHUB_CLIENT_SECRET: 'b',
        GOOGLE_CLIENT_ID: 'c',
        GOOGLE_CLIENT_SECRET: 'd',
      },
      ['github', 'google'],
    ],
    [{ GOOGLE_CLIENT_ID: 'c', GOOGLE_CLIENT_SECRET: 'd' }, ['google']],
    [{}, []],
    [{ GITHUB_CLIENT_ID: 'a', GITHUB_CLIENT_SECRET: '' }, []],
    [{ GITHUB_CLIENT_ID: 'a' }, []],
  ])('%j → %j', (env, expected) => {
    expect(getEnabledSocialProviders(env as NodeJS.ProcessEnv)).toEqual(expected);
    expect(
      Object.keys(
        buildAuthOptions({ ...env, NODE_ENV: 'test' } as NodeJS.ProcessEnv, db).socialProviders ??
          {},
      ),
    ).toEqual(expected);
  });
});

/** Awaits a promise that must reject with a Better Auth APIError and returns that error. */
async function apiError(promise: Promise<unknown>): Promise<APIError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(APIError);
  return error as APIError;
}

describe('email/password (Better Auth on PGlite)', () => {
  const password = 'correct-horse-battery';
  const newAuth = () => betterAuth(buildAuthOptions({ ...baseEnv, NODE_ENV: 'test' }, db));
  const uniqueEmail = () => `pw-${randomUUID()}@example.test`;

  it('signs up an unverified user who gets 我的看板', async () => {
    const { user } = await newAuth().api.signUpEmail({
      body: { name: '小明', email: uniqueEmail(), password },
    });

    // Unverified, so a later GitHub/Google sign-in with this email is never merged into it
    // (requireLocalEmailVerified stays at its default; see the linking test above).
    expect(user.emailVerified).toBe(false);
    const rows = await db.select().from(boards).where(eq(boards.userId, user.id));
    expect(rows.map((b) => [b.name, b.position])).toEqual([['我的看板', 1024]]);
  });

  it('rejects a second sign-up with the same email', async () => {
    const auth = newAuth();
    const email = uniqueEmail();
    await auth.api.signUpEmail({ body: { name: 'A', email, password } });

    const error = await apiError(auth.api.signUpEmail({ body: { name: 'B', email, password } }));
    expect(error.body?.code).toMatch(/^USER_ALREADY_EXISTS/);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const auth = newAuth();
    const email = uniqueEmail();
    await auth.api.signUpEmail({ body: { name: 'A', email, password } });

    const wrongPassword = await apiError(
      auth.api.signInEmail({ body: { email, password: 'not-the-password' } }),
    );
    const unknownEmail = await apiError(
      auth.api.signInEmail({ body: { email: uniqueEmail(), password } }),
    );
    expect(wrongPassword.body?.code).toBe('INVALID_EMAIL_OR_PASSWORD');
    expect(unknownEmail.body?.code).toBe('INVALID_EMAIL_OR_PASSWORD');
  });

  it('rejects passwords of 7 and 129 characters', async () => {
    const auth = newAuth();
    const tooShort = await apiError(
      auth.api.signUpEmail({ body: { name: 'A', email: uniqueEmail(), password: 'x'.repeat(7) } }),
    );
    const tooLong = await apiError(
      auth.api.signUpEmail({
        body: { name: 'A', email: uniqueEmail(), password: 'x'.repeat(129) },
      }),
    );
    expect(tooShort.body?.code).toBe('PASSWORD_TOO_SHORT');
    expect(tooLong.body?.code).toBe('PASSWORD_TOO_LONG');
  });

  it('matches email case-insensitively', async () => {
    const auth = newAuth();
    const id = randomUUID();
    await auth.api.signUpEmail({
      body: { name: 'A', email: `Mixed-${id}@Example.test`, password },
    });

    const { user } = await auth.api.signInEmail({
      body: { email: `mixed-${id}@example.test`, password },
    });
    expect(user.email).toBe(`mixed-${id}@example.test`);
  });

  it('rejects blank or over-60-character names on the server', async () => {
    const auth = newAuth();
    for (const name of ['   ', 'x'.repeat(61)]) {
      const email = uniqueEmail();
      const error = await apiError(auth.api.signUpEmail({ body: { name, email, password } }));
      expect(error.statusCode).toBe(400);
      expect(error.body?.message).toBe('名稱需為 1 到 60 個字');
      expect(await db.select().from(userTable).where(eq(userTable.email, email))).toEqual([]);
    }

    const { user } = await auth.api.signUpEmail({
      body: { name: '  小明  ', email: uniqueEmail(), password },
    });
    const [row] = await db.select().from(userTable).where(eq(userTable.id, user.id));
    expect(row?.name).toBe('小明');
  });

  it('normalizeUserName trims, rejects bad email sign-up names, repairs OAuth names', () => {
    const e = 'amy@example.test';
    expect(normalizeUserName('  小明 ', e, true)).toBe('小明');
    expect(normalizeUserName('', e, true)).toBeNull();
    expect(normalizeUserName('x'.repeat(61), e, true)).toBeNull();
    expect(normalizeUserName('x'.repeat(61), e, false)).toBe('x'.repeat(60));
    expect(normalizeUserName('  ', 'amy@example.test', false)).toBe('amy');
  });
});

describe('rate limiting (HTTP handler)', () => {
  const origin = 'http://localhost:3000';
  const auth = () => betterAuth(buildAuthOptions({ ...baseEnv, NODE_ENV: 'production' }, db));
  const post = (path: string, ip: string, body: Record<string, string>) =>
    auth().handler(
      new Request(`${origin}/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': ip },
        body: JSON.stringify(body),
      }),
    );
  // Unknown email: every attempt that gets through is a 401 INVALID_EMAIL_OR_PASSWORD.
  const signIn = (ip: string) =>
    post('/sign-in/email', ip, {
      email: `nobody-${randomUUID()}@example.test`,
      password: 'whatever-pw',
    });

  it('locks one IP after 5 sign-in attempts in 60 s', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await signIn('203.0.113.7')).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401]);

    const locked = await signIn('203.0.113.7');
    expect(locked.status).toBe(429);
    expect(locked.headers.get('X-Retry-After')).toMatch(/^[1-9]\d*$/);

    const rows = await db.select().from(rateLimit);
    expect(rows.some((r) => r.key.includes('203.0.113.7'))).toBe(true);
  });

  it('counts each IP separately', async () => {
    expect((await signIn('203.0.113.8')).status).toBe(401);
  });

  it('allows 3 sign-ups per IP per 60 s', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await post('/sign-up/email', '203.0.113.9', {
        name: '小明',
        email: `rl-${randomUUID()}@example.test`,
        password: 'correct-horse-battery',
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe('ensureDefaultBoard', () => {
  it('creates exactly one 我的看板 even when called twice', async () => {
    const u = await seedUser(db);
    await ensureDefaultBoard(db, u.id);
    await ensureDefaultBoard(db, u.id);

    const rows = await db.select().from(boards).where(eq(boards.userId, u.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: '我的看板', position: 1024 });
  });

  it('leaves a user who already has boards untouched', async () => {
    const u = await seedUser(db);
    await db.insert(boards).values({ userId: u.id, name: '工作', position: 1 });
    await ensureDefaultBoard(db, u.id);

    const rows = await db.select().from(boards).where(eq(boards.userId, u.id));
    expect(rows.map((b) => b.name)).toEqual(['工作']);
  });
});

describe('safeNextPath', () => {
  it('keeps same-origin relative paths including query', () => {
    expect(safeNextPath('/b/123?task=abc')).toBe('/b/123?task=abc');
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['focus'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['https://evil.example/'],
    ['/\t/evil.example'],
    ['/a\\b'],
    ['/%2F%2Fevil.example'],
    ['/%5cevil'],
    ['/\n/evil.example'],
  ])('falls back to /focus for %j', (raw) => {
    expect(safeNextPath(raw)).toBe('/focus');
  });
});
