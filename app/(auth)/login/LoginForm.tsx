'use client';
// Login card: 「使用 GitHub 登入」/「使用 Google 登入」 start Better Auth's OAuth redirect and come
// back to `callbackURL`. In E2E mode (showEmailForm) an email/password form is shown too, for
// Playwright. Failures are shown under the buttons; buttons are disabled while a request is pending.
import { useState, type FormEvent } from 'react';
import { signIn } from '@/client/authClient';
import styles from './login.module.scss';

type Provider = 'github' | 'google';

export default function LoginForm({
  callbackURL,
  showEmailForm,
}: {
  callbackURL: string;
  showEmailForm: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ error: unknown }>) {
    setPending(true);
    setError(null);
    const { error } = await action();
    // On success the browser navigates away, so only failures need to reset the form.
    if (error) {
      setError('登入失敗，請再試一次。');
      setPending(false);
    }
  }

  const social = (provider: Provider) => run(() => signIn.social({ provider, callbackURL }));

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
