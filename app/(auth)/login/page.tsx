// /login (spec §8). Server wrapper: reads ?next= (kept only if it is a same-origin relative path,
// else /focus) and whether E2E email/password login is enabled, then renders the client-side
// LoginForm with the GitHub / Google buttons. A failed OAuth round trip returns here as
// /login?error=1&error=<code> (Better Auth appends its code to our errorCallbackURL), so `error`
// may be a string or an array: 'account_not_linked' gets its own message, anything else the generic one.
import { isE2EAuthEnabled } from '@/server/auth';
import { safeNextPath } from '@/lib/nextPath';
import LoginForm from './LoginForm';

export const metadata = { title: '登入 · 任務排程器' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const { next, error } = await searchParams;
  const codes = error === undefined ? [] : [error].flat();
  const authError = codes.includes('account_not_linked') ? 'account_not_linked' : codes.length ? 'generic' : null;
  return (
    <LoginForm
      callbackURL={safeNextPath(typeof next === 'string' ? next : null)}
      showEmailForm={isE2EAuthEnabled(process.env)}
      authError={authError}
    />
  );
}
