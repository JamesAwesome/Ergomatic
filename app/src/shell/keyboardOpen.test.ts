import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

// The adapter is mocked at the seam the store subscribes through; each test
// re-imports the hook module so its module-level store starts closed.
let listener: ((open: boolean) => void) | null = null;
const unsubscribe = vi.fn();
const subscribeKeyboardOpen = vi.fn((l: (open: boolean) => void) => {
  listener = l;
  return unsubscribe;
});

beforeEach(() => {
  vi.resetModules();
  listener = null;
  unsubscribe.mockClear();
  subscribeKeyboardOpen.mockClear();
  vi.doMock("../adapters/keyboard", () => ({ subscribeKeyboardOpen }));
});

afterEach(() => {
  vi.doUnmock("../adapters/keyboard");
});

describe("useKeyboardOpen", () => {
  it("starts closed, follows the adapter's open/closed reports, and unsubscribes with its last consumer", async () => {
    const { useKeyboardOpen } = await import("./keyboardOpen");
    const { result, unmount } = renderHook(() => useKeyboardOpen());
    expect(result.current).toBe(false);
    expect(subscribeKeyboardOpen).toHaveBeenCalledTimes(1);
    act(() => listener?.(true));
    expect(result.current).toBe(true);
    act(() => listener?.(false));
    expect(result.current).toBe(false);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("shares one adapter subscription across consumers", async () => {
    const { useKeyboardOpen } = await import("./keyboardOpen");
    const a = renderHook(() => useKeyboardOpen());
    const b = renderHook(() => useKeyboardOpen());
    expect(subscribeKeyboardOpen).toHaveBeenCalledTimes(1);
    act(() => listener?.(true));
    expect(a.result.current).toBe(true);
    expect(b.result.current).toBe(true);
    a.unmount();
    expect(unsubscribe).not.toHaveBeenCalled();
    b.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("forgets an open keyboard once nobody is listening: the next consumer starts closed", async () => {
    // A stale `true` would hide the main navigation until the next
    // show/hide pair; the keyboard can move while no consumer is mounted.
    const { useKeyboardOpen } = await import("./keyboardOpen");
    const first = renderHook(() => useKeyboardOpen());
    act(() => listener?.(true));
    expect(first.result.current).toBe(true);
    first.unmount();
    const second = renderHook(() => useKeyboardOpen());
    expect(second.result.current).toBe(false);
  });
});
