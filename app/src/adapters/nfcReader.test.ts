import { afterEach, describe, expect, it, vi } from "vitest";
import { createConnectionAttemptTrace } from "../monitor/nfc/connectionAttemptTrace";
import { loadPm5NfcFixture } from "../monitor/nfc/fixtures";

// Same `vi.doMock("../platform")` + `vi.resetModules()` idiom as
// `adapters/appLifecycle.test.ts` and `adapters/monitorTransport.test.ts`.

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  delete (window as { __nfcScript__?: unknown }).__nfcScript__;
});

const ATTEMPT = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";

describe("resolveNfcReader: web arm", () => {
  it("is unsupported with no script, and readOne rejects by name without touching native", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const nativeFactory = vi.fn();
    vi.doMock("../native/nfc", () => ({
      createNativeNfcReader: nativeFactory,
    }));
    const { resolveNfcReader } = await import("./nfcReader");
    const reader = resolveNfcReader();
    await expect(reader.capability()).resolves.toBe("unsupported");
    await expect(
      reader.readOne({
        attemptId: ATTEMPT,
        alertMessage: "x",
        signal: new AbortController().signal,
        trace: createConnectionAttemptTrace(() => 0),
      }),
    ).rejects.toMatchObject({ name: "NfcUnsupportedError" });
    expect(nativeFactory).not.toHaveBeenCalled();
  });

  it("uses the scripted reader when a script is on window (the fake gate is open under Vitest)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    window.__nfcScript__ = {
      capability: "supported",
      outcome: { kind: "records", records: loadPm5NfcFixture().records },
    };
    const { resolveNfcReader } = await import("./nfcReader");
    const reader = resolveNfcReader();
    await expect(reader.capability()).resolves.toBe("supported");
    const records = await reader.readOne({
      attemptId: ATTEMPT,
      alertMessage: "x",
      signal: new AbortController().signal,
      trace: createConnectionAttemptTrace(() => 0),
    });
    expect(records).toHaveLength(3);
  });
});

describe("resolveNfcReader: native arm", () => {
  it("builds the native reader by dynamic import and forwards both calls", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const nativeReader = {
      capability: vi.fn(async () => "supported" as const),
      readOne: vi.fn(async () => loadPm5NfcFixture().records),
    };
    vi.doMock("../native/nfc", () => ({
      createNativeNfcReader: vi.fn(() => nativeReader),
    }));
    window.__nfcScript__ = {
      capability: "unsupported",
      outcome: { kind: "cancelled" },
    };
    const { resolveNfcReader } = await import("./nfcReader");
    const reader = resolveNfcReader();
    await expect(reader.capability()).resolves.toBe("supported");
    const options = {
      attemptId: ATTEMPT,
      alertMessage: "x",
      signal: new AbortController().signal,
      trace: createConnectionAttemptTrace(() => 0),
    };
    await reader.readOne(options);
    expect(nativeReader.readOne).toHaveBeenCalledWith(options);
  });
});
