// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let socialImpl: (a: unknown) => Promise<unknown> = async () => ({ error: null });
const social = vi.fn((a: unknown) => socialImpl(a));
vi.mock('@/client/authClient', () => ({ signIn: { social: (a: unknown) => social(a), email: vi.fn() } }));
let sessionUser: { id: string; email: string; name: string; image: null } | null = null;
vi.mock('@/server/auth', () => ({ isE2EAuthEnabled: () => false, getSessionUser: async () => sessionUser }));

import LoginPage from '../../app/(auth)/login/page';

beforeEach(() => {
  sessionUser = null;
  social.mockClear();
  socialImpl = async () => ({ error: null });
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
      '這個 email 已經用另一種方式登入過，且尚未驗證，因此無法自動合併。',
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
});
