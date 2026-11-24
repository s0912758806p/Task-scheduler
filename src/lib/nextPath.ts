// Post-login redirect target. Accepts only a same-origin relative path: it must start with a
// single "/", contain no backslash, no control character (browsers strip tabs/newlines, so
// "/\t/evil" would become "//evil"), no encoded "/" or "\" (%2F, %5C), and must resolve to the
// same origin. Anything else falls back to /focus so a crafted ?next= cannot send the user to
// another site. REQUEST_PATH_HEADER carries the requested path from proxy.ts to the (app) layout
// guard.

export const DEFAULT_NEXT_PATH = '/focus';

const UNSAFE = /[\\\x00-\x1F\x7F]|%2F|%5C/i;
const PROBE_ORIGIN = 'http://n';

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || UNSAFE.test(raw)) {
    return DEFAULT_NEXT_PATH;
  }
  try {
    if (new URL(raw, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return DEFAULT_NEXT_PATH;
  } catch {
    return DEFAULT_NEXT_PATH;
  }
  return raw;
}

/** Request header proxy.ts sets to the requested path + query, so (app)/layout can build ?next=. */
export const REQUEST_PATH_HEADER = 'x-request-path';
