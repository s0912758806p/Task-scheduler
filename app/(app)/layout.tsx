// Signed-in area guard (spec §8). Server component: no session → redirect to
// /login?next=<requested path> (path comes from the header proxy.ts sets; without it, plain
// /login). Signed in → the AppShell (sidebar, main, toast) around the page.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell/AppShell';
import { REQUEST_PATH_HEADER } from '@/lib/nextPath';
import { getSessionUser } from '@/server/auth';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    const path = (await headers()).get(REQUEST_PATH_HEADER);
    redirect(path ? `/login?next=${encodeURIComponent(path)}` : '/login');
  }
  return (
    <AppShell user={{ name: user.name, email: user.email, image: user.image }}>{children}</AppShell>
  );
}
