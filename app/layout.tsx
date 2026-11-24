// Root layout: fonts (Inter + Noto Sans TC via next/font, exposed as --font-inter / --font-noto),
// global styles + design tokens, and the theme from the `theme` cookie (light | dark | system):
// light/dark → <html data-theme>, system → no attribute (tokens.scss follows prefers-color-scheme),
// so the first paint already has the right colours. AntdRegistry collects AntD's CSS-in-JS for SSR;
// Providers adds the AntD theme, Redux store and undo stack.
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { Inter, Noto_Sans_TC } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';
import '@/styles/globals.scss';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const notoSansTC = Noto_Sans_TC({
  subsets: ['latin'],
  variable: '--font-noto',
  display: 'swap',
  preload: false, // CJK font: loaded per unicode-range on demand
});

export const metadata = { title: 'Task Scheduler' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="zh-Hant"
      data-theme={theme === 'system' ? undefined : theme}
      className={`${inter.variable} ${notoSansTC.variable}`}
    >
      <body>
        <AntdRegistry>
          <Providers theme={theme}>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
