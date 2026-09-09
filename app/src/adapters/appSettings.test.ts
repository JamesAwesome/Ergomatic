import { afterEach, describe, expect, it, vi } from "vitest";

// Same `vi.doMock("../platform")` + `vi.resetModules()` idiom as
// `monitorTransport.test.ts` (copied verbatim, this task's own brief names
// it) — each test re-imports the module fresh so the platform branch is
// picked at IMPORT time, not baked into a shared instance.

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete window.__appSettingsDoor__;
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

// --- The DEV-ONLY DOOR OVERRIDE (Phase MT close-out; ROADMAP register,
// "Nothing can gate the five-button failure frame") ---
//
// `canOpenAppSettings()` was `isNative()` alone, so the web build renders
// `permission-denied` with FOUR buttons and no browser gate could ever stand
// on the FIVE-button shape the iOS stack actually renders. The override is
// the seam `e2e/design.spec.ts` drives to reach it. Its gate is the same
// `DEV || VITE_ENABLE_FAKE_MONITOR` build-time fold every other dev seam in
// this repo lives behind (`transports/index.ts`, `adapters/nfcReader.ts`,
// `adapters/bluetoothCapability.ts`), which is what
// `scripts/dist-grep.sh`'s `app-settings door (dev override)` needle proves
// absent from a production bundle.
//
// THE TOKEN IS RETYPED HERE ON PURPOSE, never imported from the module it
// gates. CLAUDE.md RF21's first smell: "a test that imports the constant it
// exists to gate proves nothing about it". This literal is also
// `scripts/dist-grep.sh`'s needle and `e2e/helpers.ts`'s init-script value,
// so all three must be changed together or this test goes red first.
const DEV_DOOR_TOKEN = "app-settings door (dev override)";

describe("adapters/appSettings dev-only door override", () => {
  it.each([
    { dev: true, fakeFlag: "", token: DEV_DOOR_TOKEN, expected: true },
    { dev: false, fakeFlag: "1", token: DEV_DOOR_TOKEN, expected: true },
    { dev: true, fakeFlag: "1", token: undefined, expected: false },
    { dev: false, fakeFlag: "", token: DEV_DOOR_TOKEN, expected: false },
    { dev: true, fakeFlag: "1", token: "something else", expected: false },
  ])(
    "web, dev=$dev, fake flag=$fakeFlag, token=$token opens the settings door=$expected",
    async ({ dev, fakeFlag, token, expected }) => {
      vi.doMock("../platform", () => ({ isNative: () => false }));
      vi.stubEnv("DEV", dev);
      vi.stubEnv("VITE_ENABLE_FAKE_MONITOR", fakeFlag);
      if (token !== undefined) window.__appSettingsDoor__ = token;

      const { canOpenAppSettings } = await import("./appSettings");

      expect(canOpenAppSettings()).toBe(expected);
    },
  );

  it("openAppSettings() is STILL a no-op on web with the door forced open — the override gates the BUTTON's presence, never the plugin call", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    vi.stubEnv("DEV", true);
    window.__appSettingsDoor__ = DEV_DOOR_TOKEN;
    const nativeOpenAppSettings = vi.fn();
    vi.doMock("../native/appSettings", () => ({ nativeOpenAppSettings }));

    const { canOpenAppSettings, openAppSettings } =
      await import("./appSettings");

    expect(canOpenAppSettings()).toBe(true);
    await expect(openAppSettings()).resolves.toBeUndefined();
    expect(nativeOpenAppSettings).not.toHaveBeenCalled();
  });
});
