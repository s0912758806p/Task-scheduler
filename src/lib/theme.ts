// Theme preference (spec §6.3): cookie `theme` = light | dark | system. Pure helpers shared by the
// server root layout (reads the cookie) and the client (writes it). Unknown or missing → system.
export type ThemePref = 'light' | 'dark' | 'system';

export const THEME_COOKIE = 'theme';

export const THEME_LABEL: Record<ThemePref, string> = {
  light: '淺色',
  dark: '深色',
  system: '跟隨系統',
};

export function parseTheme(value: string | undefined): ThemePref {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

/** The Sidebar control cycles 淺色 → 深色 → 跟隨系統 → 淺色. */
export function nextTheme(pref: ThemePref): ThemePref {
  return pref === 'light' ? 'dark' : pref === 'dark' ? 'system' : 'light';
}
