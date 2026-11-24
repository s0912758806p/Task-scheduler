// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error: { code?: string; status?: number } | null };
type OnError = (ctx: { response: { headers: Headers } }) => void;
type Send = (body: unknown, opts?: { onError?: OnError }) => Promise<Result>;

let socialImpl: (a: unknown) => Promise<unknown> = async () => ({ error: null });
const social = vi.fn((a: unknown) => socialImpl(a));
const signInEmail = vi.fn<Send>(async () => ({ error: null }));
const signUpEmail = vi.fn<Send>(async () => ({ error: null }));
vi.mock('@/client/authClient', () => ({
  signIn: {
    social: (a: unknown) => social(a),
    email: (b: unknown, o?: { onError?: OnError }) => signInEmail(b, o),
  },
  signUp: { email: (b: unknown, o?: { onError?: OnError }) => signUpEmail(b, o) },
}));
const hardNavigate = vi.fn();
vi.mock('@/client/navigate', () => ({ hardNavigate: (url: string) => hardNavigate(url) }));
let providers: ('github' | 'google')[] = ['github', 'google'];
let sessionUser: { id: string; email: string; name: string; image: null } | null = null;
vi.mock('@/server/auth', () => ({
  getEnabledSocialProviders: () => providers,
  getSessionUser: async () => sessionUser,
}));

import LoginPage from '../../app/(auth)/login/page';

const PASSWORD = 'correct horse'; // test-only value

beforeEach(() => {
  sessionUser = null;
  providers = ['github', 'google'];
  social.mockClear();
  socialImpl = async () => ({ error: null });
  signInEmail.mockReset();
  signInEmail.mockImplementation(async () => ({ error: null }));
  signUpEmail.mockReset();
  signUpEmail.mockImplementation(async () => ({ error: null }));
  hardNavigate.mockClear();
});
afterEach(cleanup);

async function renderPage(error?: string | string[]) {
  render(await LoginPage({ searchParams: Promise.resolve({ error }) }));
}

/** Where Next's real redirect() (it throws NEXT_REDIRECT) sends a signed-in visitor, or null. */
async function redirectTarget(next?: string): Promise<string | null> {
  try {
    await LoginPage({ searchParams: Promise.resolve({ next }) });
    return null;
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? '';
    if (!digest.startsWith('NEXT_REDIRECT')) throw e;
    return digest.split(';')[2];
  }
}

const tab = (name: '登入' | '註冊') => screen.getByRole('tab', { name });
const submit = (name: '登入' | '註冊') => screen.getByRole('button', { name }) as HTMLButtonElement;

type SignUpFields = { name?: string; email?: string; password?: string; confirm?: string };

async function fillSignUp(
  user: ReturnType<typeof userEvent.setup>,
  { name = '小明', email = 'a@example.test', password = PASSWORD, confirm = password }: SignUpFields = {},
) {
  await user.click(tab('註冊'));
  if (name) await user.type(screen.getByLabelText('名稱'), name);
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('密碼'), password);
  if (confirm) await user.type(screen.getByLabelText('確認密碼'), confirm);
}

describe('/login', () => {
  it('a signed-in visitor is redirected to the safe ?next= (else /focus) instead of seeing the form', async () => {
    expect(await redirectTarget('/b/1?task=2')).toBeNull(); // signed out: the form renders
    sessionUser = { id: 'u1', email: 'u@example.test', name: 'U', image: null };
    expect(await redirectTarget('/b/1?task=2')).toBe('/b/1?task=2');
    expect(await redirectTarget()).toBe('/focus');
    expect(await redirectTarget('//evil.example')).toBe('/focus');
    expect(await redirectTarget('/login?next=/login')).toBe('/focus'); // no redirect loop
  });

  it('shows no error by default', async () => {
    await renderPage();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the generic message for ?error=1', async () => {
    await renderPage('1');
    expect(screen.getByRole('alert').textContent).toBe('登入失敗，請再試一次。');
  });

  it('shows the account-not-linked message when Better Auth appends its code', async () => {
    await renderPage(['1', 'account_not_linked']);
    expect(screen.getByRole('alert').textContent).toBe(
      '這個 email 已經用另一種方式註冊過，且尚未驗證，因此無法自動合併。請改用當初的方式登入。如果你沒有用這個 email 註冊過，請聯絡管理者。',
    );
  });

  it('passes errorCallbackURL to signIn.social', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '使用 GitHub 登入' }));
    expect(social).toHaveBeenCalledWith({
      provider: 'github',
      callbackURL: '/focus',
      errorCallbackURL: '/login?error=1',
    });
  });

  it('re-enables the buttons and shows the generic error when the request throws', async () => {
    socialImpl = async () => {
      throw new Error('network');
    };
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '使用 Google 登入' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('登入失敗，請再試一次。'));
    expect((screen.getByRole('button', { name: '使用 Google 登入' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('starts on the 登入 tab with Email and 密碼 only', async () => {
    await renderPage();
    expect(tab('登入').getAttribute('aria-selected')).toBe('true');
    expect(tab('註冊').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe('email');
    expect(screen.getByLabelText('密碼').getAttribute('autocomplete')).toBe('current-password');
    expect(screen.queryByLabelText('名稱')).toBeNull();
    expect(screen.queryByLabelText('確認密碼')).toBeNull();
  });

  it('signs in with a trimmed email and the exact password, then navigates', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByLabelText('Email'), '  a@example.test  ');
    await user.type(screen.getByLabelText('密碼'), '  pass word  ');
    await user.click(submit('登入'));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/focus'));
    expect(signInEmail).toHaveBeenCalledTimes(1);
    expect(signInEmail.mock.calls[0][0]).toEqual({ email: 'a@example.test', password: '  pass word  ' });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('registers with name, email and matching passwords', async () => {
    const user = userEvent.setup();
    await renderPage();
    await fillSignUp(user);
    expect(tab('註冊').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('名稱').getAttribute('autocomplete')).toBe('name');
    expect(screen.getByLabelText('密碼').getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByLabelText('確認密碼').getAttribute('autocomplete')).toBe('new-password');
    await user.click(submit('註冊'));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/focus'));
    expect(signUpEmail).toHaveBeenCalledTimes(1);
    expect(signUpEmail.mock.calls[0][0]).toEqual({ name: '小明', email: 'a@example.test', password: PASSWORD });
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it('checks the form before sending', async () => {
    const user = userEvent.setup();
    const cases: [SignUpFields, string][] = [
      [{ name: '' }, '請輸入名稱（最多 60 字）'],
      [{ name: '   ' }, '請輸入名稱（最多 60 字）'],
      [{ name: '名'.repeat(61) }, '請輸入名稱（最多 60 字）'],
      [{ password: '1234567' }, '密碼需為 8 到 128 個字元'],
      [{ confirm: `${PASSWORD}!` }, '兩次輸入的密碼不一致'],
      [{ email: '' }, '請輸入 email'],
    ];
    for (const [fields, message] of cases) {
      await renderPage();
      await fillSignUp(user, fields);
      await user.click(submit('註冊'));
      expect(screen.getByRole('alert').textContent).toBe(message);
      cleanup();
    }
    expect(signUpEmail).not.toHaveBeenCalled();
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it('accepts a 60-character name, measured like the server (UTF-16 length after trim)', async () => {
    const user = userEvent.setup();
    await renderPage();
    await fillSignUp(user, { name: ` ${'名'.repeat(60)} ` });
    await user.click(submit('註冊'));
    await waitFor(() => expect(signUpEmail).toHaveBeenCalledTimes(1));
    expect((signUpEmail.mock.calls[0][0] as { name: string }).name).toBe('名'.repeat(60));
  });

  it('disables the submit button while a request is pending and sends once', async () => {
    const user = userEvent.setup();
    let resolve!: (r: Result) => void;
    signUpEmail.mockImplementation(() => new Promise<Result>((r) => (resolve = r)));
    await renderPage();
    await fillSignUp(user);
    await user.click(submit('註冊'));
    await user.click(submit('註冊'));
    fireEvent.submit(submit('註冊').form!);
    expect(signUpEmail).toHaveBeenCalledTimes(1);
    expect(submit('註冊').disabled).toBe(true);
    resolve({ error: { code: 'USER_ALREADY_EXISTS' } });
    await waitFor(() => expect(submit('註冊').disabled).toBe(false));
    expect(screen.getByRole('alert').textContent).toBe(
      '這個 email 已經註冊過，請直接登入（如果當初是用 GitHub 或 Google，請按下方按鈕）',
    );
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it('keeps the form disabled after a successful submit so a second click sends nothing', async () => {
    const user = userEvent.setup();
    await renderPage();
    await fillSignUp(user);
    await user.click(submit('註冊'));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/focus'));
    // The full page load has not happened yet: the button must stay disabled.
    expect(submit('註冊').disabled).toBe(true);
    expect(screen.getByRole('button', { name: '使用 GitHub 登入' })).toHaveProperty('disabled', true);
    await user.click(submit('註冊'));
    fireEvent.submit(submit('註冊').form!);
    expect(signUpEmail).toHaveBeenCalledTimes(1);
    expect(hardNavigate).toHaveBeenCalledTimes(1);
  });

  it('re-enables the form when the page comes back from the back/forward cache', async () => {
    const user = userEvent.setup();
    await renderPage();
    await fillSignUp(user);
    await user.click(submit('註冊'));
    await waitFor(() => expect(submit('註冊').disabled).toBe(true));
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    expect(submit('註冊').disabled).toBe(false);
  });

  it('shows the mapped message and Retry-After for a 429', async () => {
    const user = userEvent.setup();
    signInEmail.mockImplementation(async (_body, opts) => {
      opts?.onError?.({ response: { headers: new Headers({ 'X-Retry-After': '30' }) } });
      return { error: { status: 429 } };
    });
    await renderPage();
    await user.type(screen.getByLabelText('Email'), 'a@example.test');
    await user.type(screen.getByLabelText('密碼'), PASSWORD);
    await user.click(submit('登入'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('嘗試太多次，請 30 秒後再試'));
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it('clears the error when switching tabs', async () => {
    const user = userEvent.setup();
    signInEmail.mockImplementation(async () => ({ error: { code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 } }));
    await renderPage();
    await user.type(screen.getByLabelText('Email'), 'a@example.test');
    await user.type(screen.getByLabelText('密碼'), PASSWORD);
    await user.click(submit('登入'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('email 或密碼錯誤'));
    await user.click(tab('註冊'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears 確認密碼 when switching tabs and back', async () => {
    const user = userEvent.setup();
    await renderPage();
    await fillSignUp(user);
    await user.click(tab('登入'));
    await user.click(tab('註冊'));
    expect((screen.getByLabelText('確認密碼') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('a@example.test');
  });

  it('ignores the Enter that confirms an IME composition', async () => {
    await renderPage();
    const email = screen.getByLabelText('Email');
    expect(fireEvent.keyDown(email, { key: 'Enter', isComposing: true })).toBe(false); // default prevented
    expect(fireEvent.keyDown(email, { key: 'Enter', keyCode: 229 })).toBe(false);
    expect(fireEvent.keyDown(email, { key: 'Enter' })).toBe(true);
  });

  it('hides the OAuth section when no provider is configured', async () => {
    providers = [];
    await renderPage();
    expect(screen.queryByText('或')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /^使用 .+ 登入$/ })).toHaveLength(0);
    cleanup();

    providers = ['google'];
    await renderPage();
    expect(screen.getByText('或')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^使用 .+ 登入$/ }).map((b) => b.textContent)).toEqual([
      '使用 Google 登入',
    ]);
  });
});
