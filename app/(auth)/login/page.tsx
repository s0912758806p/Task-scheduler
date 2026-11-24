// /login (spec §8; 2026-11-24-email-password-login-design §5.3). Server wrapper: reads ?next= (kept
// only if it is a same-origin relative path, else /focus) and which OAuth providers are configured
// (getEnabledSocialProviders: client id and secret both set), then renders the client-side
// LoginForm: the 登入／註冊 email/password tabs, always shown, plus one button per configured
// provider (none, and no 「或」 divider, when neither is set). A failed OAuth round trip returns here as
// /login?error=1&error=<code> (Better Auth appends its code to our errorCallbackURL), so `error`
// may be a string or an array: 'account_not_linked' gets its own message, anything else the generic one.
// A visitor who is already signed in is redirected server-side to that safe `next` (/focus when it
// is missing, unsafe, or /login itself) instead of seeing the form.
import { redirect } from 'next/navigation';
import { DEFAULT_NEXT_PATH, safeNextPath } from '@/lib/nextPath';
import { getEnabledSocialProviders, getSessionUser } from '@/server/auth';
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
      providers={getEnabledSocialProviders(process.env)}
      authError={authError}
    />
  );
}
