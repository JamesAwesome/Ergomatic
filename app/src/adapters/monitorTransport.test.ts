import { afterEach, describe, expect, it, vi } from "vitest";

// Same `vi.doMock("../platform")` + `vi.resetModules()` idiom as
// `keepAwake.test.ts` (the established adapter precedent this task's own
// brief names) — each test re-imports the module fresh so the platform
// branch is picked at IMPORT time, not baked into a shared instance.

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  delete (window as { __pm5FakeScript__?: unknown }).__pm5FakeScript__;
});

describe("adapters/monitorTransport web arm", () => {
  it("delegates to resolveDefaultTransport (the fake-injection seam stays reachable)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const webTransport = { scan: vi.fn() };
    const resolveDefaultTransport = vi.fn(() => webTransport);
    vi.doMock("../monitor/transports/index", () => ({
      resolveDefaultTransport,
    }));
    const capacitorFactory = vi.fn();
    vi.doMock("../monitor/transports/capacitorBle", () => ({
      createCapacitorBleTransport: capacitorFactory,
    }));

    const { defaultTransport } = await import("./monitorTransport");
    const transport = await defaultTransport();

    expect(transport).toBe(webTransport);
    expect(resolveDefaultTransport).toHaveBeenCalledOnce();
    expect(capacitorFactory).not.toHaveBeenCalled();
  });

  it("returns null when resolveDefaultTransport does (no navigator.bluetooth, no fake injected)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    vi.doMock("../monitor/transports/index", () => ({
      resolveDefaultTransport: () => null,
    }));

    const { defaultTransport } = await import("./monitorTransport");

    // `resolveDefaultTransport`'s own return type is `Transport | null |
    // Promise<...>` — the web arm here returns whatever it returns,
    // unwrapped, so a synchronous `null` stays synchronous rather than
    // being forced through an extra microtask.
    expect(await defaultTransport()).toBeNull();
  });
});

describe("adapters/monitorTransport native arm", () => {
  it("builds the Capacitor BLE transport via a dynamic import — never resolveDefaultTransport", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const nativeTransport = { scan: vi.fn() };
    const capacitorFactory = vi.fn(() => nativeTransport);
    vi.doMock("../monitor/transports/capacitorBle", () => ({
      createCapacitorBleTransport: capacitorFactory,
    }));
    const resolveDefaultTransport = vi.fn();
    vi.doMock("../monitor/transports/index", () => ({
      resolveDefaultTransport,
    }));

    const { defaultTransport } = await import("./monitorTransport");
    const transport = await defaultTransport();

    expect(transport).toBe(nativeTransport);
    expect(capacitorFactory).toHaveBeenCalledOnce();
    expect(resolveDefaultTransport).not.toHaveBeenCalled();
  });

  it("never reaches the web arm's fake-injection seam, even with a fake script sitting on window", async () => {
    // The fake-injection seam (`transports/index.ts`) is a WEB-only door
    // (`e2e/connected.spec.ts` drives it in a Chromium page, never a native
    // shell) — a native build must never read `window.__pm5FakeScript__` at
    // all, so this proves the native branch doesn't even call the module
    // that seam lives in.
    vi.doMock("../platform", () => ({ isNative: () => true }));
    (window as { __pm5FakeScript__?: unknown }).__pm5FakeScript__ = {
      program: { intervals: [] },
      deviceName: "fake",
    };
    const nativeTransport = { scan: vi.fn() };
    vi.doMock("../monitor/transports/capacitorBle", () => ({
      createCapacitorBleTransport: vi.fn(() => nativeTransport),
    }));
    const resolveDefaultTransport = vi.fn();
    vi.doMock("../monitor/transports/index", () => ({
      resolveDefaultTransport,
    }));

    const { defaultTransport } = await import("./monitorTransport");
    const transport = await defaultTransport();

    expect(transport).toBe(nativeTransport);
    expect(resolveDefaultTransport).not.toHaveBeenCalled();
  });
});
