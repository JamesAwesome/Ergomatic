import { describe, expect, it, vi } from "vitest";
import { createConnectionAttemptTrace } from "./connectionAttemptTrace";
import { FIXTURE_PM5_NAME, loadPm5NfcFixture } from "./fixtures";
import { runNfcAttempt, type RunNfcAttemptDeps } from "./runNfcAttempt";
import { createScriptedNfcReader, type NfcScript } from "./scriptedNfcReader";

const ATTEMPT = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const fixture = loadPm5NfcFixture().records;

function run(
  outcome: NfcScript["outcome"],
  overrides: Partial<RunNfcAttemptDeps> = {},
) {
  const reader = createScriptedNfcReader({ capability: "supported", outcome });
  const trace = createConnectionAttemptTrace(() => 0);
  const order: string[] = [];
  const deps: RunNfcAttemptDeps = {
    attemptId: ATTEMPT,
    reader,
    trace,
    signal: new AbortController().signal,
    haptic: vi.fn(async () => {
      order.push("haptic");
    }),
    paint: vi.fn(async () => {
      order.push("paint");
    }),
    onAccepted: vi.fn(() => {
      order.push("accepted");
    }),
    ...overrides,
  };
  return { reader, trace, order, deps, result: runNfcAttempt(deps) };
}

describe("runNfcAttempt", () => {
  it("fixture records → target with the literal name; haptic, accepted, then paint; reader stopped once", async () => {
    const { reader, trace, order, result, deps } = run({
      kind: "records",
      records: fixture,
    });
    await expect(result).resolves.toStrictEqual({
      kind: "target",
      target: { advertisingName: FIXTURE_PM5_NAME },
    });
    expect(order).toStrictEqual(["haptic", "accepted", "paint"]);
    expect(deps.onAccepted).toHaveBeenCalledTimes(1);
    expect(reader.stops()).toStrictEqual([ATTEMPT]);
    expect(trace.entries().map((e) => e.kind)).toStrictEqual([
      "session-requested",
      "tag-event",
      "reader-settled",
      "parser-accepted",
      "handoff-accepted",
    ]);
  });

  it("a rejected haptic is traced and the target still hands off", async () => {
    const { result, trace } = run(
      { kind: "records", records: fixture },
      {
        haptic: vi.fn(async () => {
          throw new Error("no taptic");
        }),
      },
    );
    await expect(result).resolves.toMatchObject({ kind: "target" });
    expect(trace.entries().map((e) => e.kind)).toContain("haptic-failed");
  });

  it("non-PM5 records → Unsupported NFC tag, no haptic, no accepted state", async () => {
    const { result, deps, trace } = run({
      kind: "records",
      records: [fixture[1]!, fixture[2]!],
    });
    await expect(result).resolves.toStrictEqual({
      kind: "inline-error",
      copy: "Unsupported NFC tag",
    });
    expect(deps.haptic).not.toHaveBeenCalled();
    expect(deps.onAccepted).not.toHaveBeenCalled();
    expect(trace.entries().map((e) => e.kind)).toContain("parser-rejected");
  });

  it.each([
    [{ kind: "cancelled" }, { kind: "quiet" }],
    [
      { kind: "timeout" },
      { kind: "inline-error", copy: "No NFC tag detected. Try again." },
    ],
    [
      { kind: "invalidated", cause: "multipleTags" },
      { kind: "inline-error", copy: "Unsupported NFC tag" },
    ],
    [
      { kind: "invalidated", cause: "tagFailure" },
      { kind: "inline-error", copy: "NFC scan stopped. Try again." },
    ],
    [
      { kind: "invalidated" },
      { kind: "inline-error", copy: "NFC scan stopped. Try again." },
    ],
    [
      { kind: "start-failed" },
      { kind: "inline-error", copy: "NFC scan stopped. Try again." },
    ],
  ] as const)("%o → %o", async (outcome, expected) => {
    const { result, deps } = run(outcome as NfcScript["outcome"]);
    await expect(result).resolves.toStrictEqual(expected);
    expect(deps.onAccepted).not.toHaveBeenCalled();
  });

  it("an abort during the read is quiet and the reader was stopped", async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    const reader = createScriptedNfcReader({
      capability: "supported",
      outcome: { kind: "records", records: fixture },
      gate,
    });
    const ac = new AbortController();
    const { result } = run(
      { kind: "cancelled" },
      { reader, signal: ac.signal },
    );
    ac.abort();
    open();
    await expect(result).resolves.toStrictEqual({ kind: "quiet" });
    expect(reader.stops()).toStrictEqual([ATTEMPT]);
  });

  it("an abort at the paint barrier is quiet: accepted was committed, nothing hands off", async () => {
    const ac = new AbortController();
    const { result, deps } = run(
      { kind: "records", records: fixture },
      {
        signal: ac.signal,
        paint: vi.fn(async (signal: AbortSignal) => {
          ac.abort();
          if (signal.aborted) throw new Error("aborted");
        }),
      },
    );
    await expect(result).resolves.toStrictEqual({ kind: "quiet" });
    expect(deps.onAccepted).toHaveBeenCalledTimes(1);
  });
});
