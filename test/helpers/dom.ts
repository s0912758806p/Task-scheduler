// Browser APIs jsdom lacks but AntD and the theme hook use. Call stubBrowserApis() in beforeEach of
// a `// @vitest-environment jsdom` test and vi.unstubAllGlobals() in afterEach.
// matchMedia always reports no match (light scheme, desktop width).
import { vi } from 'vitest';

export function stubBrowserApis() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}
