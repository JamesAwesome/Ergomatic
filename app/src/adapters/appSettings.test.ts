import { afterEach, describe, expect, it, vi } from "vitest";

// Same `vi.doMock("../platform")` + `vi.resetModules()` idiom as
// `monitorTransport.test.ts` (copied verbatim, this task's own brief names
// it) — each test re-imports the module fresh so the platform branch is
// picked at IMPORT time, not baked into a shared instance.

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("adapters/appSettings web arm", () => {
  it("canOpenAppSettings() is false", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));

    const { canOpenAppSettings } = await import("./appSettings");

    expect(canOpenAppSettings()).toBe(false);
  });

  it("openAppSettings() resolves without importing the native module", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const nativeOpenAppSettings = vi.fn();
    vi.doMock("../native/appSettings", () => ({ nativeOpenAppSettings }));

    const { openAppSettings } = await import("./appSettings");

    await expect(openAppSettings()).resolves.toBeUndefined();
    expect(nativeOpenAppSettings).not.toHaveBeenCalled();
  });
});

describe("adapters/appSettings native arm", () => {
  it("canOpenAppSettings() is true", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));

    const { canOpenAppSettings } = await import("./appSettings");

    expect(canOpenAppSettings()).toBe(true);
  });

  it("openAppSettings() reaches the plugin via the dynamic import", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const nativeOpenAppSettings = vi.fn(() => Promise.resolve());
    vi.doMock("../native/appSettings", () => ({ nativeOpenAppSettings }));

    const { openAppSettings } = await import("./appSettings");
    await openAppSettings();

    expect(nativeOpenAppSettings).toHaveBeenCalledOnce();
  });
});
