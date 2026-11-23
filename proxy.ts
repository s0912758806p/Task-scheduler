// Next.js proxy (formerly middleware). Copies the requested path + query into the
// REQUEST_PATH_HEADER request header so the (app) layout guard can redirect signed-out users to
// /login?next=<that path>. It does no auth checks itself; API routes, Next assets and /login are
// skipped.
import { NextResponse, type NextRequest } from 'next/server';
import { REQUEST_PATH_HEADER } from '@/lib/nextPath';

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!api/|_next/|login|favicon\\.ico).*)'],
};
