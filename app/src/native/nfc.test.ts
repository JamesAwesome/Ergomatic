// Phase NF: the desk half of `src/native/nfc.ts`. Mocks `@capgo/capacitor-nfc`
// and `@capacitor/app` THEMSELVES (the idiom `src/native/appLifecycle.test.ts`
// established, and for the same reason: `src/native/**` is outside the
// coverage gate, so the one thing a desk test can settle — what we ask the
// plugin, in what order, and how we read what it answers — is pinned here
// rather than at an erg).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConnectionAttemptTrace } from "../monitor/nfc/connectionAttemptTrace";
import { loadPm5NfcFixture } from "../monitor/nfc/fixtures";

const mocks = vi.hoisted(() => ({
  isSupported: vi.fn(),
  addListener: vi.fn(),
  startScanning: vi.fn(),
  stopScanning: vi.fn(),
}));

vi.mock("@capgo/capacitor-nfc", () => ({
  CapacitorNfc: {
    isSupported: mocks.isSupported,
    addListener: mocks.addListener,
    startScanning: mocks.startScanning,
    stopScanning: mocks.stopScanning,
  },
}));

const { createNativeNfcReader } = await import("./nfc");

const ATTEMPT = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const OTHER = "9d1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const fixture = loadPm5NfcFixture().records;

interface Registration {
  eventName: string;
  handler: (value: unknown) => void;
  remove: ReturnType<typeof vi.fn>;
}
let registrations: Registration[] = [];
let calls: string[] = [];

beforeEach(() => {
  registrations = [];
  calls = [];
  vi.clearAllMocks();
  mocks.isSupported.mockResolvedValue({ supported: true });
  mocks.startScanning.mockImplementation(async () => {
    calls.push("startScanning");
  });
  mocks.stopScanning.mockImplementation(async () => {
    calls.push("stopScanning");
  });
  mocks.addListener.mockImplementation(
    async (eventName: string, handler: (value: unknown) => void) => {
      calls.push(`addListener:${eventName}`);
      const remove = vi.fn(async () => {
        calls.push(`remove:${eventName}`);
      });
      registrations.push({ eventName, handler, remove });
      return { remove };
    },
  );
});

function fire(eventName: string, value: unknown): void {
  for (const r of registrations)
    if (r.eventName === eventName) r.handler(value);
}

function nativeRecords(attemptId = ATTEMPT): unknown {
  return {
    attemptId,
    type: "ndef",
    tag: {
      ndefMessage: fixture.map((r) => ({
        tnf: r.tnf,
        type: [...r.type],
        id: [],
        payload: [...r.payload],
      })),
    },
  };
}

function start(signal = new AbortController().signal) {
  const trace = createConnectionAttemptTrace(() => 0);
  const result = createNativeNfcReader().readOne({
    attemptId: ATTEMPT,
    alertMessage: "Hold your iPhone near the PM5.",
    signal,
    trace,
  });
  return { result, trace };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe("createNativeNfcReader", () => {
  it("capability() reads isSupported", async () => {
    await expect(createNativeNfcReader().capability()).resolves.toBe(
      "supported",
    );
    mocks.isSupported.mockResolvedValue({ supported: false });
    await expect(createNativeNfcReader().capability()).resolves.toBe(
      "unsupported",
    );
  });

  it("registers BOTH listeners before startScanning, starts with the exact options, and on a record stops then removes", async () => {
    const { result } = start();
    await settle();
    expect(calls).toStrictEqual([
      "addListener:nfcEvent",
      "addListener:nfcSessionEnd",
      "startScanning",
    ]);
    expect(mocks.startScanning).toHaveBeenCalledWith({
      attemptId: ATTEMPT,
      alertMessage: "Hold your iPhone near the PM5.",
      iosSessionType: "ndef",
      invalidateAfterFirstRead: false,
    });
    fire("nfcEvent", nativeRecords());
    const records = await result;
    expect(records).toHaveLength(3);
    expect(mocks.stopScanning).toHaveBeenCalledWith({ attemptId: ATTEMPT });
    expect(calls.slice(3)).toStrictEqual([
      "stopScanning",
      "remove:nfcEvent",
      "remove:nfcSessionEnd",
    ]);
  });

  it("drops a retained event carrying another attempt's ID and keeps waiting", async () => {
    const { result, trace } = start();
    await settle();
    fire("nfcEvent", nativeRecords(OTHER));
    await settle();
    expect(trace.entries().map((e) => e.kind)).toContain("stale-id-dropped");
    fire("nfcEvent", nativeRecords());
    await expect(result).resolves.toHaveLength(3);
  });

  it("maps each nfcSessionEnd reason and cause to its named error", async () => {
    const cases: [Record<string, unknown>, string, string | undefined][] = [
      [{ reason: "userCancelled" }, "NfcCancelledError", undefined],
      [{ reason: "sessionTimeout" }, "NfcTimeoutError", undefined],
      [{ reason: "invalidated" }, "NfcInvalidatedError", undefined],
      [
        { reason: "invalidated", cause: "multipleTags" },
        "NfcInvalidatedError",
        "multipleTags",
      ],
      [
        { reason: "invalidated", cause: "tagFailure" },
        "NfcInvalidatedError",
        "tagFailure",
      ],
      [
        { reason: "invalidated", cause: "somethingElse" },
        "NfcInvalidatedError",
        undefined,
      ],
    ];
    for (const [payload, name, cause] of cases) {
      registrations = [];
      const { result } = start();
      await settle();
      fire("nfcSessionEnd", { attemptId: ATTEMPT, ...payload });
      const err = (await result.catch((e: unknown) => e)) as Error & {
        cause?: unknown;
      };
      expect(err.name).toBe(name);
      expect(err.cause).toBe(cause);
    }
  });

  it("ignores an nfcSessionEnd for another attempt", async () => {
    const { result } = start();
    await settle();
    fire("nfcSessionEnd", { attemptId: OTHER, reason: "userCancelled" });
    await settle();
    fire("nfcEvent", nativeRecords());
    await expect(result).resolves.toHaveLength(3);
  });

  it("an abort after start awaits stopScanning, then rejects NfcAbortError", async () => {
    const ac = new AbortController();
    const { result, trace } = start(ac.signal);
    await settle();
    ac.abort();
    await expect(result).rejects.toMatchObject({ name: "NfcAbortError" });
    expect(mocks.stopScanning).toHaveBeenCalledWith({ attemptId: ATTEMPT });
    expect(trace.entries().map((e) => e.kind)).toContain("abort-requested");
  });

  it("an abort while addListener is still pending removes the handle and never starts", async () => {
    let releaseFirst!: () => void;
    mocks.addListener.mockImplementationOnce(
      (eventName: string, handler: (value: unknown) => void) =>
        new Promise((resolve) => {
          releaseFirst = () => {
            calls.push(`addListener:${eventName}`);
            const remove = vi.fn(async () => {
              calls.push(`remove:${eventName}`);
            });
            registrations.push({ eventName, handler, remove });
            resolve({ remove });
          };
        }),
    );
    const ac = new AbortController();
    const { result } = start(ac.signal);
    ac.abort();
    releaseFirst();
    await expect(result).rejects.toMatchObject({ name: "NfcAbortError" });
    expect(mocks.startScanning).not.toHaveBeenCalled();
    expect(mocks.stopScanning).not.toHaveBeenCalled();
    expect(calls).toContain("remove:nfcEvent");
  });

  it("a tag event for THIS attempt with no ndefMessage (readNDEF failed on a read-write tag) settles as a tagFailure invalidation rather than waiting forever", async () => {
    const { result, trace } = start();
    await settle();
    fire("nfcEvent", { attemptId: ATTEMPT, type: "ndef", tag: { id: [1] } });
    const err = (await result.catch((e: unknown) => e)) as Error & {
      cause?: unknown;
    };
    expect(err.name).toBe("NfcInvalidatedError");
    expect(err.cause).toBe("tagFailure");
    expect(trace.entries().map((e) => e.kind)).toContain(
      "invalid-native-event",
    );
    expect(mocks.stopScanning).toHaveBeenCalledWith({ attemptId: ATTEMPT });
  });

  it("a startScanning rejection becomes NfcStartError, traced, with the listeners removed", async () => {
    mocks.startScanning.mockRejectedValue(new Error("NO_NFC"));
    const { result, trace } = start();
    await expect(result).rejects.toMatchObject({ name: "NfcStartError" });
    expect(trace.entries().map((e) => e.kind)).toContain("start-failed");
    expect(calls).toContain("remove:nfcEvent");
  });

  it("an unattributable malformed nfcEvent (no attempt ID) is traced and ignored, and the read keeps waiting", async () => {
    const { result, trace } = start();
    await settle();
    fire("nfcEvent", {
      tag: { ndefMessage: [{ tnf: 1.5 }] },
    });
    await settle();
    expect(trace.entries().map((e) => e.kind)).toContain(
      "invalid-native-event",
    );
    fire("nfcSessionEnd", { attemptId: ATTEMPT, reason: "sessionTimeout" });
    await expect(result).rejects.toMatchObject({ name: "NfcTimeoutError" });
  });
});
