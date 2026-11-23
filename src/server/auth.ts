// Better Auth setup (spec §8).
// - buildAuthOptions(env, db): pure option builder. GitHub + Google OAuth from env; accounts with
//   the same verified email are linked (trustedProviders github/google); email/password is enabled
//   only when NODE_ENV !== 'production' AND E2E_AUTH=1 (Playwright login), never in production;
//   every newly created user gets an empty 「我的看板」 via the user.create.after hook; the
//   nextCookies() plugin (must stay last) lets server actions/components set session cookies.
// - getAuth(): the Better Auth instance, built on first call from process.env + getDb() and cached.
//   Nothing is constructed at import time, so `next build` works without any env.
// - isE2EAuthEnabled(env): the email/password switch above; the login page uses it to show the
//   E2E form.
// - getSessionUser(): current user from the request cookies (next/headers), or null.
// - requireUser(): same, but throws ApiError(401, 'UNAUTHENTICATED') when signed out; every API
//   handler calls it first.
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { headers } from 'next/headers';
import { getDb, type DB } from '@/server/db';
import * as schema from '@/server/db/schema';
import { ApiError } from '@/server/errors';
import { ensureDefaultBoard } from '@/server/services/boards';

export type SessionUser = { id: string; email: string; name: string; image: string | null };

/** Email/password sign-in for Playwright: only outside production and only with E2E_AUTH=1. */
export function isE2EAuthEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV !== 'production' && env.E2E_AUTH === '1';
}

export function buildAuthOptions(env: NodeJS.ProcessEnv, db: DB): BetterAuthOptions {
  return {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID ?? '',
        clientSecret: env.GITHUB_CLIENT_SECRET ?? '',
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
      },
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ['github', 'google'] },
    },
    emailAndPassword: { enabled: isE2EAuthEnabled(env) },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await ensureDefaultBoard(db, user.id);
          },
        },
      },
    },
    plugins: [nextCookies()],
  };
}

function createAuth() {
  return betterAuth(buildAuthOptions(process.env, getDb()));
}

let cached: ReturnType<typeof createAuth> | undefined;

export function getAuth(): ReturnType<typeof createAuth> {
  cached ??= createAuth();
  return cached;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  // Read headers before touching getAuth(): during `next build` this marks the page dynamic
  // instead of building the auth instance (which needs DATABASE_URL).
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { id, email, name, image } = session.user;
  return { id, email, name, image: image ?? null };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', '請先登入');
  return user;
}
