'use client';
// Login card (spec 2026-11-24-email-password-login-design §5.3). Two tabs, 「登入」 (default) and
// 「註冊」, share one email/password form; 註冊 adds 名稱 and 確認密碼. Switching tabs clears the
// error and 確認密碼 (the other fields are kept).
// - Before sending, the browser checks: email not blank and the password 8–128 characters; on 註冊
//   also the trimmed name is 1–60 characters (JS string length, the same measure as the server) and
//   both passwords are equal. The server (Better Auth) still has the final say.
// - The email is trimmed, the password is sent exactly as typed. signIn.email / signUp.email go
//   through the Better Auth client (so the server's rate limits apply) without a callbackURL; on
//   success the page does a full load of `callbackURL` (hardNavigate) so the server layout sees the
//   new session cookie. Failures are mapped to Chinese by authErrorMessage (a 429 reads the
//   X-Retry-After header) and shown under the form with role="alert".
// - While a request is pending every button is disabled and further submits are ignored, so a
//   double click sends once. After an error (or if the request throws) they are re-enabled; after a
//   success they stay disabled until the browser leaves the page (a page restored from the
//   back/forward cache re-enables them). The Enter that confirms an IME composition does not
//   submit (isImeEnter).
// - Below a 「或」 divider, one 「使用 … 登入」 button per configured OAuth provider (`providers`,
//   from getEnabledSocialProviders); with none configured the divider is not rendered either.
//   OAuth failures come back as /login?error=…: `authError` is 'account_not_linked' (Better Auth
//   refused to merge with an unverified account) or 'generic'.
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { signIn, signUp } from '@/client/authClient';
import { hardNavigate } from '@/client/navigate';
import { isImeEnter } from '@/lib/ime';
import type { SocialProvider } from '@/server/auth';
import { authErrorMessage, GENERIC_ERROR, NOT_LINKED_ERROR } from './authErrors';
import styles from './login.module.scss';

export type AuthError = 'account_not_linked' | 'generic' | null;
type Mode = 'signIn' | 'signUp';
type AuthResult = { error: { code?: string; status?: number } | null };

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'signIn', label: '登入' },
  { mode: 'signUp', label: '註冊' },
];
const PROVIDER_LABEL: Record<SocialProvider, string> = { github: 'GitHub', google: 'Google' };
const MAX_NAME_LENGTH = 60;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export default function LoginForm({
  callbackURL,
  providers,
  authError = null,
}: {
  callbackURL: string;
  providers: SocialProvider[];
  authError?: AuthError;
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false); // blocks a second submit before React re-renders the disabled button
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({ signIn: null, signUp: null });
  const [error, setError] = useState<string | null>(
    authError === 'account_not_linked' ? NOT_LINKED_ERROR : authError ? GENERIC_ERROR : null,
  );

  const retryAfter = useRef<string | null>(null); // X-Retry-After of the last failed request
  const fetchOptions = {
    onError: (ctx: { response: Response }) => {
      retryAfter.current = ctx.response.headers.get('X-Retry-After');
    },
  };

  async function run(action: () => Promise<AuthResult>, onSuccess?: () => void) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    retryAfter.current = null;
    setPending(true);
    setError(null);
    let failed = true;
    try {
      const { error } = await action();
      if (error) setError(authErrorMessage(error, retryAfter.current));
      else {
        failed = false;
        onSuccess?.();
      }
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      // On success the browser is about to leave the page: stay disabled until it does.
      if (failed) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }

  // Back/forward cache: a page restored after a successful submit comes back still disabled.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      pendingRef.current = false;
      setPending(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setConfirm('');
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next: Mode = e.key === 'Home' ? 'signIn' : e.key === 'End' ? 'signUp' : mode === 'signIn' ? 'signUp' : 'signIn';
    switchMode(next);
    tabRefs.current[next]?.focus();
  }

  /** The first problem with the form, or null when it can be sent. */
  function check(): string | null {
    const trimmedName = name.trim();
    if (mode === 'signUp' && (trimmedName.length === 0 || trimmedName.length > MAX_NAME_LENGTH)) {
      return `請輸入名稱（最多 ${MAX_NAME_LENGTH} 字）`;
    }
    if (email.trim().length === 0) return '請輸入 email';
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      return '密碼需為 8 到 128 個字元';
    }
    if (mode === 'signUp' && password !== confirm) return '兩次輸入的密碼不一致';
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    const problem = check();
    if (problem) {
      setError(problem);
      return;
    }
    const trimmedEmail = email.trim();
    void run(
      () =>
        mode === 'signIn'
          ? signIn.email({ email: trimmedEmail, password }, fetchOptions)
          : signUp.email({ name: name.trim(), email: trimmedEmail, password }, fetchOptions),
      () => hardNavigate(callbackURL),
    );
  }

  const social = (provider: SocialProvider) =>
    run(() => signIn.social({ provider, callbackURL, errorCallbackURL: '/login?error=1' }));

  const tabId = (m: Mode) => `${id}-tab-${m}`;
  const panelId = `${id}-panel`;
  const isSignUp = mode === 'signUp';

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>任務排程器</h1>
        <p className={styles.lead}>登入後，你的看板會在每台裝置同步。</p>
        <div className={styles.tabs} role="tablist" aria-label="登入或註冊">
          {MODES.map(({ mode: m, label }) => (
            <button
              key={m}
              ref={(el) => {
                tabRefs.current[m] = el;
              }}
              type="button"
              role="tab"
              id={tabId(m)}
              aria-selected={mode === m}
              aria-controls={panelId}
              tabIndex={mode === m ? 0 : -1}
              className={styles.tab}
              disabled={pending}
              onClick={() => switchMode(m)}
              onKeyDown={onTabKeyDown}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={panelId} aria-labelledby={tabId(mode)}>
          <form
            className={styles.emailForm}
            noValidate
            onSubmit={onSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isImeEnter(e)) e.preventDefault();
            }}
          >
            {isSignUp && (
              <label className={styles.label}>
                名稱
                <input
                  className={styles.input}
                  name="name"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            <label className={styles.label}>
              Email
              <input
                className={styles.input}
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className={styles.label}>
              密碼
              <input
                className={styles.input}
                name="password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {isSignUp && (
              <label className={styles.label}>
                確認密碼
                <input
                  className={styles.input}
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            )}
            <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={pending}>
              {isSignUp ? '註冊' : '登入'}
            </button>
          </form>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {providers.length > 0 && (
          <>
            <div className={styles.divider}>或</div>
            <div className={styles.oauth}>
              {providers.map((provider) => (
                <button
                  key={provider}
                  type="button"
                  className={styles.button}
                  disabled={pending}
                  onClick={() => void social(provider)}
                >
                  {`使用 ${PROVIDER_LABEL[provider]} 登入`}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
