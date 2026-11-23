// Better Auth HTTP endpoints (/api/auth/*: OAuth redirects and callbacks, session, sign-out).
// The auth instance is resolved per request via getAuth(), so building the app needs no env.
import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/server/auth';

export const { GET, POST } = toNextJsHandler((request: Request) => getAuth().handler(request));
