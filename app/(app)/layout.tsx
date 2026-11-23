// Signed-in area guard (spec §8). Server component: no session → redirect to
// /login?next=<requested path> (path comes from the header proxy.ts sets; without it, plain
// /login). The app shell is added in a later task; for now it only renders children.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { REQUEST_PATH_HEADER } from '@/lib/nextPath';
import { getSessionUser } from '@/server/auth';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    const path = (await headers()).get(REQUEST_PATH_HEADER);
    redirect(path ? `/login?next=${encodeURIComponent(path)}` : '/login');
  }
  return children;
}
