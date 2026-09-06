import { afterEach, describe, expect, it } from "vitest";
import {
  CONNECTION_ATTEMPT_TRACE_CAPACITY,
  CONNECTION_ATTEMPT_TRACE_KINDS,
  createConnectionAttemptTrace,
  latestConnectionAttemptTrace,
  resetConnectionAttemptTraceForTests,
  type ConnectionAttemptTraceKind,
} from "./connectionAttemptTrace";

/** The spec's own list ("Instrumentation and replay"), written out here
 *  as an INDEPENDENT literal so the union and the runtime set cannot drift
 *  from it in one place only. */
const SPEC_KINDS = [
  "supported",
  "unsupported",
  "capability-failed",
  "capability-timed-out",
  "listener-registration-failed",
  "session-requested",
  "start-failed",
  "tag-event",
  "invalid-native-event",
  "stale-id-dropped",
  "parser-accepted",
  "parser-rejected",
  "haptic-failed",
  "reader-settled",
  "foreground-abort",
  "held-device-conflict",
  "ble-scan-started",
  "ble-scan-matched",
  "ble-scan-timed-out",
  "invalid-scan-result",
  "abort-requested",
  "scan-drain-settled",
  "ble-scan-cleanup-failed",
  "handoff-accepted",
] as const;

afterEach(() => {
  resetConnectionAttemptTraceForTests();
});

describe("createConnectionAttemptTrace", () => {
  it("accepts exactly the spec's kinds and rejects any other", () => {
    expect([...CONNECTION_ATTEMPT_TRACE_KINDS]).toStrictEqual([...SPEC_KINDS]);
    const trace = createConnectionAttemptTrace(() => 7);
    for (const kind of SPEC_KINDS) trace.record(kind);
    expect(trace.entries().map((e) => e.kind)).toStrictEqual([...SPEC_KINDS]);
    expect(() =>
      trace.record("attempt-id" as ConnectionAttemptTraceKind),
    ).toThrow("unknown kind");
  });

  it("stamps seq and the injected clock, carries detail only when given", () => {
    let t = 100;
    const trace = createConnectionAttemptTrace(() => (t += 1));
    trace.record("supported");
    trace.record("reader-settled", "code 200, 4200ms");
    expect(trace.entries()).toStrictEqual([
      { seq: 0, atMs: 101, kind: "supported" },
      { seq: 1, atMs: 102, kind: "reader-settled", detail: "code 200, 4200ms" },
    ]);
  });

  it("refuses a detail that carries a PM5-shaped name", () => {
    const trace = createConnectionAttemptTrace(() => 0);
    expect(() => trace.record("ble-scan-matched", "PM5 432331249 Row")).toThrow(
      "must not carry a name",
    );
    expect(trace.entries()).toStrictEqual([]);
  });

  it("is bounded: the oldest entries drop once capacity is exceeded", () => {
    const trace = createConnectionAttemptTrace(() => 0);
    for (let i = 0; i < CONNECTION_ATTEMPT_TRACE_CAPACITY + 5; i += 1) {
      trace.record("stale-id-dropped");
    }
    const entries = trace.entries();
    expect(entries).toHaveLength(CONNECTION_ATTEMPT_TRACE_CAPACITY);
    expect(entries[0]!.seq).toBe(5);
  });

  it("entries() is a copy the caller cannot mutate into the trace", () => {
    const trace = createConnectionAttemptTrace(() => 0);
    trace.record("supported");
    const copy = trace.entries() as unknown as { kind: string }[];
    copy.push({ kind: "forged" });
    expect(trace.entries()).toHaveLength(1);
  });

  it("complete() publishes the latest snapshot; a later completion replaces it", () => {
    expect(latestConnectionAttemptTrace()).toBeNull();
    const first = createConnectionAttemptTrace(() => 1);
    first.record("supported");
    first.complete();
    expect(latestConnectionAttemptTrace()?.map((e) => e.kind)).toStrictEqual([
      "supported",
    ]);
    const second = createConnectionAttemptTrace(() => 2);
    second.record("unsupported");
    second.record("capability-failed");
    second.complete();
    expect(latestConnectionAttemptTrace()?.map((e) => e.kind)).toStrictEqual([
      "unsupported",
      "capability-failed",
    ]);
    // A trace that never completed does not replace the snapshot.
    createConnectionAttemptTrace(() => 3).record("supported");
    expect(latestConnectionAttemptTrace()).toHaveLength(2);
  });
});
