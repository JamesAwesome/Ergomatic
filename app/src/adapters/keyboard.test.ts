import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same `vi.doMock("../platform")` idiom as keepAwake.test.ts: each test
// re-imports the adapter fresh so the platform pick is per-test.
const nativeSetAccessoryBarVisible = vi.fn(async () => {});
const nativeUnsubscribe = vi.fn();
const nativeSubscribeKeyboard = vi.fn(
  (_onShow: () => void, _onHide: () => void) => nativeUnsubscribe,
);

beforeEach(() => {
  vi.resetModules();
  nativeSetAccessoryBarVisible.mockClear();
  nativeSubscribeKeyboard.mockClear();
  nativeUnsubscribe.mockClear();
  vi.doMock("../native/keyboard", () => ({
    nativeSetAccessoryBarVisible,
    nativeSubscribeKeyboard,
  }));
});

afterEach(() => {
  vi.doUnmock("../native/keyboard");
  vi.doUnmock("../platform");
});

describe("restoreKeyboardAccessoryBar", () => {
  it("on native, puts the ‹ › ✓ tray back that the plugin removes at load", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const { restoreKeyboardAccessoryBar } = await import("./keyboard");
    await restoreKeyboardAccessoryBar();
    expect(nativeSetAccessoryBarVisible).toHaveBeenCalledTimes(1);
    expect(nativeSetAccessoryBarVisible).toHaveBeenCalledWith(true);
  });

  it("on the web, touches no plugin at all", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const { restoreKeyboardAccessoryBar } = await import("./keyboard");
    await restoreKeyboardAccessoryBar();
    expect(nativeSetAccessoryBarVisible).not.toHaveBeenCalled();
  });
});

describe("subscribeKeyboardOpen", () => {
  it("on native, reports the plugin's willShow as open and willHide as closed, and unsubscribes", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const { subscribeKeyboardOpen } = await import("./keyboard");
    const seen: boolean[] = [];
    const unsubscribe = subscribeKeyboardOpen((open) => seen.push(open));
    // The adapter reaches the native module through a dynamic import, which
    // settles a few microtasks later even when mocked.
    await vi.waitFor(() =>
      expect(nativeSubscribeKeyboard).toHaveBeenCalledTimes(1),
    );
    const [onShow, onHide] = nativeSubscribeKeyboard.mock.calls[0]!;
    onShow();
    onHide();
    onShow();
    expect(seen).toStrictEqual([true, false, true]);
    unsubscribe();
    expect(nativeUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("on the web, never fires and touches no plugin", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const { subscribeKeyboardOpen } = await import("./keyboard");
    const listener = vi.fn();
    const unsubscribe = subscribeKeyboardOpen(listener);
    await new Promise((r) => setTimeout(r, 0));
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
    expect(nativeSubscribeKeyboard).not.toHaveBeenCalled();
  });
});
