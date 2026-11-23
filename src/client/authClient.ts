// Better Auth browser client (same origin, /api/auth). signIn.social starts the GitHub/Google
// OAuth redirect; signIn.email is only accepted by the server in E2E mode; signOut ends the
// session (sidebar user menu).
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();
export const { signIn, signOut } = authClient;
