// Better Auth setup (spec §8; email/password per 2026-11-24-email-password-login-design §5.1).
// - buildAuthOptions(env, db): pure option builder. Three ways to sign in:
//   * Email/password, enabled in every environment: passwords 8–128 characters, no email
//     verification (users are created with emailVerified = false), signed in right after sign-up.
//     Emails are stored lower-cased, so sign-in matches them case-insensitively.
//   * GitHub and Google OAuth, each only when both its client id and secret are set
//     (getEnabledSocialProviders).
//   Implicit account linking is on but no provider is "trusted": a new GitHub/Google identity
//   joins an existing user only when the provider reports the email as verified AND the existing
//   user's email is verified (Better Auth's requireLocalEmailVerified default). Password users are
//   unverified, so they are never merged; Better Auth refuses the sign-in (account_not_linked;
//   user.email is unique, so no second user is created).
//   Rate limiting (off when NODE_ENV === 'test') keeps its counters in the rate_limit table,
//   keyed by client IP (x-forwarded-for) + path: 100 requests / 60 s by default, 5 for
//   /sign-in/email and 3 for /sign-up/email; over the limit Better Auth answers 429 with
//   X-Retry-After (seconds). Rate limiting only applies to requests through auth.handler, not
//   to direct auth.api calls.
//   The user.create.before hook trims the name: email sign-ups with a blank or over-60-character
//   name are rejected (400), OAuth users are repaired instead (normalizeUserName). Email sign-ups
//   also have their image forced to null (the client's value is ignored) and are rejected with
//   400 INVALID_EMAIL 「email 格式不正確」 when the email is over 254 characters.
//   The user.update.before hook (checkUserUpdate) applies the same rules to later writes: on
//   /update-user (the signed-in user's own profile endpoint) a name that is blank or over 60
//   characters after trimming, or an image that is not null / an https:// URL of at most 2048
//   characters, is rejected with 400; on any other path (Better Auth's own writes, e.g. an OAuth
//   sign-in) nothing is rejected — the name is trimmed and cut to 60, a blank name or a bad image
//   is left out so the stored value stays. Every newly created user gets an empty 「我的看板」 via
//   the user.create.after hook; the nextCookies() plugin (must stay last) lets server
//   actions/components set session cookies.
// - getEnabledSocialProviders(env): the configured OAuth providers, github first; the login page
//   uses it to decide which buttons to show.
// - normalizeUserName(name, email, isEmailSignUp): the create-time name rule above.
// - isAllowedImage(image): the image rule above.
// - getAuth(): the Better Auth instance, built on first call from process.env + getDb() and cached.
//   Nothing is constructed at import time, so `next build` works without any env.
// - getSessionUser(): current user from the request cookies (next/headers), or null.
// - requireUser(): same, but throws ApiError(401, 'UNAUTHENTICATED') when signed out; every API
//   handler calls it first.
import {
  betterAuth,
  type BetterAuthOptions,
  type GenericEndpointContext,
  type User,
} from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { headers } from 'next/headers';
import { getDb, type DB } from '@/server/db';
import * as schema from '@/server/db/schema';
import { ApiError } from '@/server/errors';
import { ensureDefaultBoard } from '@/server/services/boards';

export type SessionUser = { id: string; email: string; name: string; image: string | null };

export type SocialProvider = 'github' | 'google';

const SOCIAL_PROVIDER_ENV = {
  github: { clientId: 'GITHUB_CLIENT_ID', clientSecret: 'GITHUB_CLIENT_SECRET' },
  google: { clientId: 'GOOGLE_CLIENT_ID', clientSecret: 'GOOGLE_CLIENT_SECRET' },
} as const satisfies Record<SocialProvider, { clientId: string; clientSecret: string }>;

/** OAuth providers whose client id and secret are both non-empty, github first. */
export function getEnabledSocialProviders(env: NodeJS.ProcessEnv): SocialProvider[] {
  return (['github', 'google'] as const).filter((provider) => {
    const keys = SOCIAL_PROVIDER_ENV[provider];
    return Boolean(env[keys.clientId]) && Boolean(env[keys.clientSecret]);
  });
}

const MAX_NAME_LENGTH = 60;
const MAX_EMAIL_LENGTH = 254;
const MAX_IMAGE_LENGTH = 2048;
const NAME_ERROR = '名稱需為 1 到 60 個字';
const IMAGE_ERROR = '頭像網址需為 https:// 開頭，最多 2048 個字元';

/**
 * Trims a new user's name. Email sign-up: blank or over 60 characters → null (the caller
 * rejects it). OAuth: never rejected — cut to 60 characters, or the email's part before `@` if
 * blank.
 */
export function normalizeUserName(
  name: string,
  email: string,
  isEmailSignUp: boolean,
): string | null {
  const trimmed = name.trim();
  if (isEmailSignUp) {
    return trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH ? null : trimmed;
  }
  if (trimmed.length === 0) return email.split('@')[0] ?? email;
  return trimmed.slice(0, MAX_NAME_LENGTH);
}

/** A profile image the user may set: null (no image) or an https URL of at most 2048 characters. */
export function isAllowedImage(image: unknown): boolean {
  return (
    image === null ||
    (typeof image === 'string' && image.startsWith('https://') && image.length <= MAX_IMAGE_LENGTH)
  );
}

/**
 * user.update.before: checks `name` / `image` when present (other fields pass through).
 * On /update-user a bad value is rejected with 400; on any other path (Better Auth's own writes,
 * e.g. during an OAuth sign-in) it is repaired instead — name trimmed and cut to 60, a blank name
 * or a bad image dropped so the stored value stays.
 */
async function checkUserUpdate(
  user: Partial<User> & Record<string, unknown>,
  ctx: GenericEndpointContext | null,
) {
  const strict = ctx?.path === '/update-user';
  const data: Partial<User> & Record<string, unknown> = { ...user };
  if (user.name !== undefined) {
    const trimmed = typeof user.name === 'string' ? user.name.trim() : '';
    if (trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH) data.name = trimmed;
    else if (strict) throw new APIError('BAD_REQUEST', { message: NAME_ERROR });
    else data.name = trimmed.length > 0 ? trimmed.slice(0, MAX_NAME_LENGTH) : undefined;
  }
  if (user.image !== undefined && !isAllowedImage(user.image)) {
    if (strict) throw new APIError('BAD_REQUEST', { message: IMAGE_ERROR });
    data.image = undefined;
  }
  return { data };
}

export function buildAuthOptions(env: NodeJS.ProcessEnv, db: DB): BetterAuthOptions {
  const socialProviders: NonNullable<BetterAuthOptions['socialProviders']> = {};
  for (const provider of getEnabledSocialProviders(env)) {
    const keys = SOCIAL_PROVIDER_ENV[provider];
    socialProviders[provider] = {
      clientId: env[keys.clientId] as string,
      clientSecret: env[keys.clientSecret] as string,
    };
  }

  return {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    socialProviders,
    account: {
      // No trustedProviders: trusting a provider skips its email_verified check when linking.
      accountLinking: { enabled: true },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: false,
    },
    rateLimit: {
      // Off in tests so they cannot lock each other out; the handler tests use NODE_ENV=production.
      enabled: env.NODE_ENV !== 'test',
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            const isEmailSignUp = ctx?.path === '/sign-up/email';
            const name = normalizeUserName(user.name, user.email, isEmailSignUp);
            if (name === null) throw new APIError('BAD_REQUEST', { message: NAME_ERROR });
            if (!isEmailSignUp) return { data: { ...user, name } };
            // Same code and text as Better Auth's own bad-email error (the login page maps it).
            if (user.email.length > MAX_EMAIL_LENGTH) {
              throw new APIError('BAD_REQUEST', { code: 'INVALID_EMAIL', message: 'email 格式不正確' });
            }
            // The sign-up form never sends an image; never store one a client made up.
            return { data: { ...user, name, image: null } };
          },
          after: async (user) => {
            await ensureDefaultBoard(db, user.id);
          },
        },
        update: { before: checkUserUpdate },
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
