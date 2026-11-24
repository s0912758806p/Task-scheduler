// Better Auth browser client (same origin, /api/auth). signIn.social starts the GitHub/Google
// OAuth redirect (the login page only offers the providers configured on the server);
// signIn.email / signUp.email are the login page's 登入／註冊 tabs (always shown; requests go
// through the HTTP handler, so its rate limits apply); signOut ends the session (sidebar user menu).
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();
export const { signIn, signUp, signOut } = authClient;
