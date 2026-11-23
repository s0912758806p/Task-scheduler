'use client';
// Client providers for every page: theme preference (cookie value from the server), AntD
// ConfigProvider (zh_TW, spec §9 tokens, dark/default algorithm matching the effective theme —
// `system` follows prefers-color-scheme), the Redux store (one per tab) and the undo stack +
// toaster (the store posts API error toasts through the same toaster).
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhTW from 'antd/locale/zh_TW';
import { useState, type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { makeStore } from '@/client/store';
import { ThemeProvider, useEffectiveTheme, useThemePreference } from '@/client/theme';
import { TOKENS } from '@/client/tokens';
import { createToaster, UndoProvider } from '@/client/undo';
import type { ThemePref } from '@/lib/theme';

function ThemedAntd({ children }: { children: ReactNode }) {
  const { pref } = useThemePreference();
  const effective = useEffectiveTheme(pref);
  const t = TOKENS[effective];
  return (
    <ConfigProvider
      locale={zhTW}
      theme={{
        algorithm: effective === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: t.accent,
          colorBgLayout: t.bg,
          colorBgContainer: t.surface,
          colorBgElevated: t.surface,
          colorText: t.text,
          colorBorder: t.border,
          borderRadius: t.radius,
          fontFamily: 'var(--font-inter), var(--font-noto), system-ui, sans-serif',
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}

export default function Providers({ theme, children }: { theme: ThemePref; children: ReactNode }) {
  const [toaster] = useState(createToaster);
  const [store] = useState(() => makeStore({ toast: toaster.show }));
  return (
    <ThemeProvider initial={theme}>
      <ThemedAntd>
        <ReduxProvider store={store}>
          <UndoProvider toaster={toaster}>{children}</UndoProvider>
        </ReduxProvider>
      </ThemedAntd>
    </ThemeProvider>
  );
}
