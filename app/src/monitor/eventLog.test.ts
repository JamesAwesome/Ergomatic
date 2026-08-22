import { describe, expect, it } from "vitest";
import { createEventLog } from "./eventLog";

/** A hand-driven stand-in for `Date.now` — every recorded entry's `atMs`
 *  becomes predictable so `toStrictEqual` can pin it exactly, the same
 *  reason `driver.test.ts`'s own `manualClock()` exists. Increments by a
 *  fixed step per call rather than returning a constant so a test can also
 *  assert `atMs` is MONOTONIC across entries (this file's own header: "an
 *  ADDITIONAL, diagnostic-only field"). */
function manualClock(startMs = 1000, stepMs = 10) {
  let t = startMs - stepMs;
  return () => {
    t += stepMs;
    return t;
  };
}

describe("createEventLog: recording and reading back", () => {
  it("records entries in order with a monotonic seq, starting from 0", () => {
    const log = createEventLog(undefined, manualClock());
    log.record("connect", "scan started");
    log.record("ack", "f1 01 76 00 76 f2");
    log.record("frame", "state=rowing");
    expect(log.entries()).toStrictEqual([
      { seq: 0, atMs: 1000, kind: "connect", detail: "scan started" },
      { seq: 1, atMs: 1010, kind: "ack", detail: "f1 01 76 00 76 f2" },
      { seq: 2, atMs: 1020, kind: "frame", detail: "state=rowing" },
    ]);
  });

  it("entries() returns a defensive copy — mutating it never touches the log", () => {
    const log = createEventLog(undefined, manualClock());
    log.record("connect", "a");
    const snapshot = log.entries();
    snapshot.push({
      seq: 999,
      atMs: 999,
      kind: "injected",
      detail: "should not stick",
    });
    expect(log.entries()).toStrictEqual([
      { seq: 0, atMs: 1000, kind: "connect", detail: "a" },
    ]);
  });

  it("defaults to a 500-entry capacity", () => {
    const log = createEventLog(undefined, manualClock());
    for (let i = 0; i < 500; i += 1) log.record("tick", String(i));
    expect(log.entries()).toHaveLength(500);
    expect(log.entries()[0]).toStrictEqual({
      seq: 0,
      atMs: 1000,
      kind: "tick",
      detail: "0",
    });

    // The 501st entry evicts the oldest (seq 0), matching the design
    // spec's "ring buffer" description — this is the ring's defining
    // behaviour, not merely a length cap.
    log.record("tick", "500");
    const after = log.entries();
    expect(after).toHaveLength(500);
    expect(after[0]).toStrictEqual({
      seq: 1,
      atMs: 1010,
      kind: "tick",
      detail: "1",
    });
    expect(after[after.length - 1]).toStrictEqual({
      seq: 500,
      atMs: 6000,
      kind: "tick",
      detail: "500",
    });
  });

  it("honors a custom capacity smaller than the default", () => {
    const log = createEventLog(2, manualClock());
    log.record("a", "1");
    log.record("b", "2");
    log.record("c", "3");
    expect(log.entries()).toStrictEqual([
      { seq: 1, atMs: 1010, kind: "b", detail: "2" },
      { seq: 2, atMs: 1020, kind: "c", detail: "3" },
    ]);
  });

  it("atMs defaults to Date.now() when no clock is injected — the production path", () => {
    const before = Date.now();
    const log = createEventLog();
    log.record("connect", "a");
    const after = Date.now();
    const [entry] = log.entries();
    expect(entry!.atMs).toBeGreaterThanOrEqual(before);
    expect(entry!.atMs).toBeLessThanOrEqual(after);
  });

  it("atMs is monotonic non-decreasing across entries from the same injected clock", () => {
    const log = createEventLog(undefined, manualClock(5000, 25));
    log.record("a", "1");
    log.record("b", "2");
    log.record("c", "3");
    const atMsValues = log.entries().map((e) => e.atMs);
    expect(atMsValues).toStrictEqual([5000, 5025, 5050]);
    for (let i = 1; i < atMsValues.length; i += 1) {
      expect(atMsValues[i]!).toBeGreaterThan(atMsValues[i - 1]!);
    }
  });
});

describe("createEventLog: exportLog", () => {
  it("exports the exact entries as JSON — the trace a bug report pastes verbatim", () => {
    const log = createEventLog(undefined, manualClock());
    log.record("connect", "scan started");
    log.record("disconnected", "link lost");
    const exported = log.exportLog();
    expect(JSON.parse(exported)).toStrictEqual([
      { seq: 0, atMs: 1000, kind: "connect", detail: "scan started" },
      { seq: 1, atMs: 1010, kind: "disconnected", detail: "link lost" },
    ]);
  });

  it("exports an empty array for a log with nothing recorded yet", () => {
    expect(createEventLog().exportLog()).toBe("[]");
  });
});
