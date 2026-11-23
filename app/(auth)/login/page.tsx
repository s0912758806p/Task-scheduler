// /login (spec §8). Server wrapper: reads ?next= (kept only if it is a same-origin relative path,
// else /focus) and whether E2E email/password login is enabled, then renders the client-side
// LoginForm with the GitHub / Google buttons. A failed OAuth round trip returns here as
// /login?error=1&error=<code> (Better Auth appends its code to our errorCallbackURL), so `error`
// may be a string or an array: 'account_not_linked' gets its own message, anything else the generic one.
// A visitor who is already signed in is redirected server-side to that safe `next` (/focus when it
// is missing, unsafe, or /login itself) instead of seeing the form.
import { redirect } from 'next/navigation';
import { DEFAULT_NEXT_PATH, safeNextPath } from '@/lib/nextPath';
import { getSessionUser, isE2EAuthEnabled } from '@/server/auth';
import LoginForm from './LoginForm';

export const metadata = { title: '登入 · 任務排程器' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const { next, error } = await searchParams;
  const callbackURL = safeNextPath(typeof next === 'string' ? next : null);
  if (await getSessionUser()) {
    const isLogin = new URL(callbackURL, 'http://n').pathname === '/login';
    redirect(isLogin ? DEFAULT_NEXT_PATH : callbackURL);
  }
  const codes = error === undefined ? [] : [error].flat();
  const authError = codes.includes('account_not_linked') ? 'account_not_linked' : codes.length ? 'generic' : null;
  return (
    <LoginForm
      callbackURL={callbackURL}
      showEmailForm={isE2EAuthEnabled(process.env)}
      authError={authError}
    />
  );
}
