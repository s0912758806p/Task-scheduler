import type { ReactNode } from 'react';

export const metadata = { title: 'Task Scheduler' };

// Minimal placeholder layout; replaced by the real shell in a later task.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
