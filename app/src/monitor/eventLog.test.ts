import { describe, expect, it } from "vitest";
import { createEventLog } from "./eventLog";

describe("createEventLog: recording and reading back", () => {
  it("records entries in order with a monotonic seq, starting from 0", () => {
    const log = createEventLog();
    log.record("connect", "scan started");
    log.record("ack", "f1 01 76 00 76 f2");
    log.record("frame", "state=rowing");
    expect(log.entries()).toStrictEqual([
      { seq: 0, kind: "connect", detail: "scan started" },
      { seq: 1, kind: "ack", detail: "f1 01 76 00 76 f2" },
      { seq: 2, kind: "frame", detail: "state=rowing" },
    ]);
  });

  it("entries() returns a defensive copy — mutating it never touches the log", () => {
    const log = createEventLog();
    log.record("connect", "a");
    const snapshot = log.entries();
    snapshot.push({ seq: 999, kind: "injected", detail: "should not stick" });
    expect(log.entries()).toStrictEqual([
      { seq: 0, kind: "connect", detail: "a" },
    ]);
  });

  it("defaults to a 500-entry capacity", () => {
    const log = createEventLog();
    for (let i = 0; i < 500; i += 1) log.record("tick", String(i));
    expect(log.entries()).toHaveLength(500);
    expect(log.entries()[0]).toStrictEqual({
      seq: 0,
      kind: "tick",
      detail: "0",
    });

    // The 501st entry evicts the oldest (seq 0), matching the design
    // spec's "ring buffer" description — this is the ring's defining
    // behaviour, not merely a length cap.
    log.record("tick", "500");
    const after = log.entries();
    expect(after).toHaveLength(500);
    expect(after[0]).toStrictEqual({ seq: 1, kind: "tick", detail: "1" });
    expect(after[after.length - 1]).toStrictEqual({
      seq: 500,
      kind: "tick",
      detail: "500",
    });
  });

  it("honors a custom capacity smaller than the default", () => {
    const log = createEventLog(2);
    log.record("a", "1");
    log.record("b", "2");
    log.record("c", "3");
    expect(log.entries()).toStrictEqual([
      { seq: 1, kind: "b", detail: "2" },
      { seq: 2, kind: "c", detail: "3" },
    ]);
  });
});

describe("createEventLog: exportLog", () => {
  it("exports the exact entries as JSON — the trace a bug report pastes verbatim", () => {
    const log = createEventLog();
    log.record("connect", "scan started");
    log.record("disconnected", "link lost");
    const exported = log.exportLog();
    expect(JSON.parse(exported)).toStrictEqual([
      { seq: 0, kind: "connect", detail: "scan started" },
      { seq: 1, kind: "disconnected", detail: "link lost" },
    ]);
  });

  it("exports an empty array for a log with nothing recorded yet", () => {
    expect(createEventLog().exportLog()).toBe("[]");
  });
});
