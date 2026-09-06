import { afterEach, describe, expect, it, vi } from "vitest";

// Same `vi.doMock("../platform")` + `vi.resetModules()` idiom as
// `appSettings.test.ts` and `monitorTransport.test.ts` — each test re-imports
// the module fresh so the platform branch is picked at IMPORT time, not
// baked into a shared instance.

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete window.__pm5FakeScript__;
  delete (navigator as { bluetooth?: unknown }).bluetooth;
});

describe("adapters/bluetoothCapability native arm", () => {
  it("returns 'available' when native (WKWebView has no navigator.bluetooth)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));

    const { probeBluetoothStatus } = await import("./bluetoothCapability");

    const result = await probeBluetoothStatus();
    expect(result).toBe("available");
  });
});

describe("adapters/bluetoothCapability web arm", () => {
  it("returns 'absent' when navigator.bluetooth is undefined", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    Object.defineProperty(navigator, "bluetooth", {
      value: undefined,
      configurable: true,
    });

    const { probeBluetoothStatus } = await import("./bluetoothCapability");

    const result = await probeBluetoothStatus();
    expect(result).toBe("absent");
  });

  it("returns 'available' when getAvailability is not a function (fail-open)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    Object.defineProperty(navigator, "bluetooth", {
      value: {},
      configurable: true,
    });

    const { probeBluetoothStatus } = await import("./bluetoothCapability");

    const result = await probeBluetoothStatus();
    expect(result).toBe("available");
  });

  it("returns 'available' when getAvailability resolves to true", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    Object.defineProperty(navigator, "bluetooth", {
      value: {
        getAvailability: async () => true,
      },
      configurable: true,
    });

    const { probeBluetoothStatus } = await import("./bluetoothCapability");

    const result = await probeBluetoothStatus();
    expect(result).toBe("available");
  });

  it("returns 'off' when getAvailability resolves to false", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    Object.defineProperty(navigator, "bluetooth", {
      value: {
        getAvailability: async () => false,
      },
      configurable: true,
    });

    const { probeBluetoothStatus } = await import("./bluetoothCapability");

    const result = await probeBluetoothStatus();
    expect(result).toBe("off");
  });

  it("returns 'available' when getAvailability rejects (fail-open)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    Object.defineProperty(navigator, "bluetooth", {
      value: {
        getAvailability: async () => {
          throw new Error("Something went wrong");
        },
      },
      configurable: true,
    });

    const { probeBluetoothStatus } = await import("./bluetoothCapability");

    const result = await probeBluetoothStatus();
    expect(result).toBe("available");
  });
});

describe("monitor connection support before a press", () => {
  it.each([
    { native: true, bluetooth: undefined, expected: true },
    { native: false, bluetooth: undefined, expected: false },
    { native: false, bluetooth: {}, expected: true },
  ])(
    "native=$native, Web Bluetooth=$bluetooth allows Connect=$expected",
    async ({ native, bluetooth, expected }) => {
      vi.doMock("../platform", () => ({ isNative: () => native }));
      Object.defineProperty(navigator, "bluetooth", {
        value: bluetooth,
        configurable: true,
      });
      const { canConnectMonitor } = await import("./bluetoothCapability");
      expect(canConnectMonitor()).toBe(expected);
    },
  );

  it.each([
    { dev: true, fakeFlag: "", injected: true, expected: true },
    { dev: false, fakeFlag: "1", injected: true, expected: true },
    { dev: true, fakeFlag: "1", injected: false, expected: false },
    { dev: false, fakeFlag: "", injected: true, expected: false },
  ])(
    "dev=$dev, fake flag=$fakeFlag, injected=$injected allows Connect=$expected",
    async ({ dev, fakeFlag, injected, expected }) => {
      vi.doMock("../platform", () => ({ isNative: () => false }));
      vi.stubEnv("DEV", dev);
      vi.stubEnv("VITE_ENABLE_FAKE_MONITOR", fakeFlag);
      if (injected) window.__pm5FakeScript__ = { program: { intervals: [] } };
      const { canConnectMonitor } = await import("./bluetoothCapability");
      expect(canConnectMonitor()).toBe(expected);
    },
  );
});
