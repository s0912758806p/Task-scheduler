// Better Auth browser client (same origin, /api/auth). signIn.social starts the GitHub/Google
// OAuth redirect; signIn.email is accepted by the server in every environment (the login page
// only shows its email form when E2E_AUTH=1); signOut ends the session (sidebar user menu).
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();
export const { signIn, signOut } = authClient;
