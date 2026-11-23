'use client';
// Login card: 「使用 GitHub 登入」/「使用 Google 登入」 start Better Auth's OAuth redirect and come
// back to `callbackURL`. In E2E mode (showEmailForm) an email/password form is shown too, for
// Playwright. Failures are shown under the buttons; buttons are disabled while a request is pending
// (and re-enabled afterwards, even if the request throws). `authError` comes from the OAuth return
// trip (/login?error=…): 'account_not_linked' (Better Auth refused to merge, spec §8) or 'generic'.
import { useState, type FormEvent } from 'react';
import { signIn } from '@/client/authClient';
import styles from './login.module.scss';

type Provider = 'github' | 'google';
export type AuthError = 'account_not_linked' | 'generic' | null;

const GENERIC_ERROR = '登入失敗，請再試一次。';
const NOT_LINKED_ERROR = '這個 email 已經用另一種方式登入過，且尚未驗證，因此無法自動合併。';

export default function LoginForm({
  callbackURL,
  showEmailForm,
  authError = null,
}: {
  callbackURL: string;
  showEmailForm: boolean;
  authError?: AuthError;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    authError === 'account_not_linked' ? NOT_LINKED_ERROR : authError ? GENERIC_ERROR : null,
  );

  async function run(action: () => Promise<{ error: unknown }>) {
    setPending(true);
    setError(null);
    try {
      const { error } = await action();
      if (error) setError(GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setPending(false);
    }
  }

  const social = (provider: Provider) => run(() => signIn.social({ provider, callbackURL, errorCallbackURL: '/login?error=1' }));

  function emailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(() =>
      signIn.email({
        email: String(form.get('email')),
        password: String(form.get('password')),
        callbackURL,
      }),
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>任務排程器</h1>
        <p className={styles.lead}>登入後，你的看板會在每台裝置同步。</p>
        <button
          type="button"
          className={styles.button}
          disabled={pending}
          onClick={() => void social('github')}
        >
          使用 GitHub 登入
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={pending}
          onClick={() => void social('google')}
        >
          使用 Google 登入
        </button>
        {showEmailForm && (
          <form className={styles.emailForm} onSubmit={emailSubmit}>
            <label className={styles.label}>
              Email
              <input className={styles.input} name="email" type="email" required />
            </label>
            <label className={styles.label}>
              密碼
              <input className={styles.input} name="password" type="password" required />
            </label>
            <button type="submit" className={styles.button} disabled={pending}>
              以 Email 登入
            </button>
          </form>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
