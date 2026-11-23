// Post-login redirect target. Only same-origin relative paths ("/…", not "//…" or "/\…", which
// browsers treat as protocol-relative) are accepted; anything else falls back to /focus so a
// crafted ?next= cannot send the user to another site. REQUEST_PATH_HEADER carries the requested
// path from proxy.ts to the (app) layout guard.

export const DEFAULT_NEXT_PATH = '/focus';

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return DEFAULT_NEXT_PATH;
  }
  return raw;
}

/** Request header proxy.ts sets to the requested path + query, so (app)/layout can build ?next=. */
export const REQUEST_PATH_HEADER = 'x-request-path';
