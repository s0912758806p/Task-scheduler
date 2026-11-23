// /login (spec §8). Server wrapper: reads ?next= (kept only if it is a same-origin relative path,
// else /focus) and whether E2E email/password login is enabled, then renders the client-side
// LoginForm with the GitHub / Google buttons.
import { isE2EAuthEnabled } from '@/server/auth';
import { safeNextPath } from '@/lib/nextPath';
import LoginForm from './LoginForm';

export const metadata = { title: '登入 · 任務排程器' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return (
    <LoginForm
      callbackURL={safeNextPath(typeof next === 'string' ? next : null)}
      showEmailForm={isE2EAuthEnabled(process.env)}
    />
  );
}
