import { describe, expect, it } from "vitest";
import { createConnectionAttemptTrace } from "./connectionAttemptTrace";
import { loadPm5NfcFixture } from "./fixtures";
import { createScriptedNfcReader, type NfcScript } from "./scriptedNfcReader";

const ATTEMPT = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const fixture = loadPm5NfcFixture().records;

function read(script: NfcScript, signal = new AbortController().signal) {
  const reader = createScriptedNfcReader(script);
  const trace = createConnectionAttemptTrace(() => 0);
  const result = reader.readOne({
    attemptId: ATTEMPT,
    alertMessage: "Hold your iPhone near the PM5.",
    signal,
    trace,
  });
  return { reader, trace, result };
}

describe("createScriptedNfcReader", () => {
  it("reports the scripted capability", async () => {
    await expect(
      createScriptedNfcReader({
        capability: "supported",
        outcome: { kind: "cancelled" },
      }).capability(),
    ).resolves.toBe("supported");
    await expect(
      createScriptedNfcReader({
        capability: "unsupported",
        outcome: { kind: "cancelled" },
      }).capability(),
    ).resolves.toBe("unsupported");
  });

  it("delivers records through the production bridge and stops the attempt once", async () => {
    const { reader, trace, result } = read({
      capability: "supported",
      outcome: { kind: "records", records: fixture },
    });
    const records = await result;
    expect(records).toHaveLength(3);
    expect(Object.keys(records[0]!)).toStrictEqual(["tnf", "type", "payload"]);
    expect(reader.starts()).toBe(1);
    expect(reader.stops()).toStrictEqual([ATTEMPT]);
    expect(trace.entries().map((e) => e.kind)).toStrictEqual([
      "session-requested",
      "tag-event",
      "reader-settled",
    ]);
  });

  it("maps each scripted ending to its named error", async () => {
    const cases: [NfcScript["outcome"], string, string | undefined][] = [
      [{ kind: "cancelled" }, "NfcCancelledError", undefined],
      [{ kind: "timeout" }, "NfcTimeoutError", undefined],
      [{ kind: "invalidated" }, "NfcInvalidatedError", undefined],
      [
        { kind: "invalidated", cause: "multipleTags" },
        "NfcInvalidatedError",
        "multipleTags",
      ],
      [
        { kind: "invalidated", cause: "tagFailure" },
        "NfcInvalidatedError",
        "tagFailure",
      ],
    ];
    for (const [outcome, name, cause] of cases) {
      const { result } = read({ capability: "supported", outcome });
      const err = (await result.catch((e: unknown) => e)) as Error & {
        cause?: unknown;
      };
      expect(err.name).toBe(name);
      expect(err.cause).toBe(cause);
    }
  });

  it("start-failed never starts a session and traces start-failed", async () => {
    const { reader, trace, result } = read({
      capability: "supported",
      outcome: { kind: "start-failed" },
    });
    await expect(result).rejects.toMatchObject({ name: "NfcStartError" });
    expect(reader.starts()).toBe(0);
    expect(trace.entries().map((e) => e.kind)).toStrictEqual([
      "session-requested",
      "start-failed",
    ]);
  });

  it("a pre-aborted signal rejects before any start", async () => {
    const ac = new AbortController();
    ac.abort();
    const { reader, result } = read(
      {
        capability: "supported",
        outcome: { kind: "records", records: fixture },
      },
      ac.signal,
    );
    await expect(result).rejects.toMatchObject({ name: "NfcAbortError" });
    expect(reader.starts()).toBe(0);
  });

  it("an abort while the gate is pending wins over the scripted records and still stops", async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    const ac = new AbortController();
    const { reader, trace, result } = read(
      {
        capability: "supported",
        outcome: { kind: "records", records: fixture },
        gate,
      },
      ac.signal,
    );
    ac.abort();
    open();
    await expect(result).rejects.toMatchObject({ name: "NfcAbortError" });
    expect(reader.stops()).toStrictEqual([ATTEMPT]);
    expect(trace.entries().map((e) => e.kind)).toContain("abort-requested");
  });
});
