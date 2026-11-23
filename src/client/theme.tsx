'use client';
// Client side of the theme preference. ThemeProvider carries the cookie value the server read
// (app/layout.tsx) so components render the same label on server and client.
// - useThemePreference(): { pref, setPref }. setPref writes the cookie (path=/, 1 year,
//   SameSite=Lax), sets/removes data-theme on <html> right away (system → no attribute, the
//   tokens' prefers-color-scheme block applies) and calls router.refresh() so the server layout
//   renders the same attribute from then on.
// - useEffectiveTheme(pref): 'light' | 'dark' actually shown — for `system` it follows
//   matchMedia('(prefers-color-scheme: dark)') live (server snapshot: light). Used for AntD's
//   algorithm.
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import { THEME_COOKIE, type ThemePref } from '@/lib/theme';

const ThemeContext = createContext<{ pref: ThemePref; setPref: (p: ThemePref) => void } | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeSystem(onChange: () => void): () => void {
  const mql = window.matchMedia(DARK_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

export function useEffectiveTheme(pref: ThemePref): 'light' | 'dark' {
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
  if (pref !== 'system') return pref;
  return systemDark ? 'dark' : 'light';
}

export function ThemeProvider({ initial, children }: { initial: ThemePref; children: ReactNode }) {
  const router = useRouter();
  const [pref, setState] = useState(initial);
  const setPref = useCallback(
    (next: ThemePref) => {
      document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
      if (next === 'system') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', next);
      setState(next);
      router.refresh();
    },
    [router],
  );
  return <ThemeContext.Provider value={{ pref, setPref }}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference must be used inside <ThemeProvider>');
  return ctx;
}
