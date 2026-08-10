import { afterEach, describe, expect, it, vi } from "vitest";

// Same `vi.doMock("../platform")` + `vi.resetModules()` idiom as
// `appSettings.test.ts` and `monitorTransport.test.ts` — each test re-imports
// the module fresh so the platform branch is picked at IMPORT time, not
// baked into a shared instance.

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
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
