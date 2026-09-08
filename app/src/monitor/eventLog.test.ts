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

describe("a flood must not evict its own diagnosis", () => {
  it("collapses a consecutive repeat instead of pushing it, keeping the count and the span", () => {
    const ticks = [10, 20, 30];
    let i = 0;
    const log = createEventLog(500, () => ticks[i++] ?? 99);
    log.record("frame-error", "0x0032: expected 17 bytes, got 16");
    log.record("frame-error", "0x0032: expected 17 bytes, got 16");
    log.record("frame-error", "0x0032: expected 17 bytes, got 16");

    const e = log.entries();
    expect(e).toHaveLength(1);
    expect(e[0]!.repeated).toBe(3);
    expect(e[0]!.atMs).toBe(10); // the FIRST
    expect(e[0]!.lastAtMs).toBe(30); // the LAST
  });

  it("keeps the connect-time entries a flood used to evict — the whole point", () => {
    // Two entries that identify the monitor, then a flood far longer than the
    // ring. Before coalescing these three were entry 1 of 500 and gone.
    const log = createEventLog(10);
    log.record("notify-first", "0x0031 (19B)");
    log.record("notify-first", "0x0032 (16B)");
    log.record("notify-first", "0x0033 (20B)");
    for (let i = 0; i < 5000; i += 1) {
      log.record("frame-error", "0x0032: expected 17 bytes, got 16");
    }

    const kinds = log.entries().map((x) => x.kind);
    expect(kinds).toStrictEqual([
      "notify-first",
      "notify-first",
      "notify-first",
      "frame-error",
    ]);
    expect(log.entries()[3]!.repeated).toBe(5000);
  });

  it("does NOT collapse across a different entry — an interleaved event breaks the run", () => {
    const log = createEventLog();
    log.record("frame-error", "same");
    log.record("frame-error", "same");
    log.record("structure", "something happened");
    log.record("frame-error", "same");

    const e = log.entries();
    expect(e.map((x) => x.kind)).toStrictEqual([
      "frame-error",
      "structure",
      "frame-error",
    ]);
    expect(e[0]!.repeated).toBe(2);
    expect(e[2]!.repeated).toBeUndefined();
  });

  it("does not collapse two entries of the same KIND with different DETAIL", () => {
    const log = createEventLog();
    log.record("frame-error", "0x0032: expected 17 bytes, got 16");
    log.record("frame-error", "0x0038: expected 19 bytes, got 18");
    expect(log.entries()).toHaveLength(2);
  });

  it("does not rewrite an array a caller is already holding", () => {
    const log = createEventLog();
    log.record("frame-error", "same");
    const held = log.entries();
    log.record("frame-error", "same");
    // The earlier snapshot must still read as it did when it was taken.
    expect(held[0]!.repeated).toBeUndefined();
    expect(log.entries()[0]!.repeated).toBe(2);
  });
});
