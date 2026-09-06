import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("adapters/haptics", () => {
  it("web arm resolves without importing the native module", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const notification = vi.fn(async () => undefined);
    vi.doMock("@capacitor/haptics", () => ({
      Haptics: { notification },
      NotificationType: { Success: "SUCCESS" },
    }));
    const { successHaptic } = await import("./haptics");
    await expect(successHaptic()).resolves.toBeUndefined();
    expect(notification).not.toHaveBeenCalled();
  });

  it("native arm calls the plugin with the Success notification type", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const notification = vi.fn(async () => undefined);
    vi.doMock("@capacitor/haptics", () => ({
      Haptics: { notification },
      NotificationType: { Success: "SUCCESS" },
    }));
    const { successHaptic } = await import("./haptics");
    await successHaptic();
    expect(notification).toHaveBeenCalledWith({ type: "SUCCESS" });
  });

  it("native arm propagates a plugin rejection (the caller swallows it, not this seam)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    vi.doMock("@capacitor/haptics", () => ({
      Haptics: {
        notification: vi.fn(async () => {
          throw new Error("no taptic");
        }),
      },
      NotificationType: { Success: "SUCCESS" },
    }));
    const { successHaptic } = await import("./haptics");
    await expect(successHaptic()).rejects.toThrow("no taptic");
  });
});
