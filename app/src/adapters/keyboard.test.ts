import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same `vi.doMock("../platform")` idiom as keepAwake.test.ts: each test
// re-imports the adapter fresh so the platform pick is per-test.
const nativeSetAccessoryBarVisible = vi.fn(async () => {});

beforeEach(() => {
  vi.resetModules();
  nativeSetAccessoryBarVisible.mockClear();
  vi.doMock("../native/keyboard", () => ({ nativeSetAccessoryBarVisible }));
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
