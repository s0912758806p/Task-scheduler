import { betterAuth } from 'better-auth';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildAuthOptions } from '@/server/auth';
import type { DB } from '@/server/db';
import { boards } from '@/server/db/schema';
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
  it('never enables email/password in production, even with E2E_AUTH=1', () => {
    const options = buildAuthOptions({ ...baseEnv, NODE_ENV: 'production', E2E_AUTH: '1' }, db);
    expect(options.emailAndPassword?.enabled).toBe(false);
  });

  it('enables email/password outside production only when E2E_AUTH=1', () => {
    expect(
      buildAuthOptions({ ...baseEnv, NODE_ENV: 'test', E2E_AUTH: '1' }, db).emailAndPassword?.enabled,
    ).toBe(true);
    expect(
      buildAuthOptions({ ...baseEnv, NODE_ENV: 'development' }, db).emailAndPassword?.enabled,
    ).toBe(false);
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
    const auth = betterAuth(buildAuthOptions({ ...baseEnv, NODE_ENV: 'test', E2E_AUTH: '1' }, db));
    const { user } = await auth.api.signUpEmail({
      body: { name: 'E2E', email: 'e2e@example.test', password: 'correct-horse-battery' },
    });

    const rows = await db.select().from(boards).where(eq(boards.userId, user.id));
    expect(rows.map((b) => [b.name, b.position])).toEqual([['我的看板', 1024]]);
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
