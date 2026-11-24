// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToday } from "@/client/useToday";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 23, 23, 59, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useToday", () => {
  it("returns the local day and rolls over at midnight, repeatedly", () => {
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-11-23");
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current).toBe("2026-11-24");
    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    });
    expect(result.current).toBe("2026-11-25");
  });

  it("re-checks when the tab becomes visible again", () => {
    const { result } = renderHook(() => useToday());
    // The clock jumps (laptop slept) without the timer firing on time.
    vi.setSystemTime(new Date(2026, 10, 26, 8, 0, 0));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe("2026-11-26");
  });

  it("stops its timer and listener on unmount", () => {
    const { unmount } = renderHook(() => useToday());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
