'use client';
// useMediaQuery(query): whether the CSS media query matches, kept live through matchMedia change
// events. SSR-safe: always false on the server and during hydration (so the first client render
// matches the server HTML), then the real value. MOBILE_QUERY is the spec §9 phone breakpoint
// (< 768px).
import { useCallback, useSyncExternalStore } from 'react';

export const MOBILE_QUERY = '(max-width: 767px)';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
