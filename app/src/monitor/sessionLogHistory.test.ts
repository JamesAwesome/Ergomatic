import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listSessionLogs, pushSessionLog } from "./sessionLogHistory";

const t0 = new Date("2026-08-31T09:00:00.000Z");
const t1 = new Date("2026-08-31T09:10:00.000Z");
const t2 = new Date("2026-08-31T09:20:00.000Z");
const t3 = new Date("2026-08-31T09:30:00.000Z");

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sessionLogHistory: rotation order", () => {
  it("a single push lands in slot 1", () => {
    pushSessionLog("EXPORT-1", t0);
    expect(listSessionLogs()).toStrictEqual([
      { slot: 1, savedAt: t0.toISOString(), exported: "EXPORT-1" },
    ]);
  });

  it("three pushes: h1 newest, in push order, newest first", () => {
    pushSessionLog("EXPORT-1", t0);
    pushSessionLog("EXPORT-2", t1);
    pushSessionLog("EXPORT-3", t2);
    expect(listSessionLogs()).toStrictEqual([
      { slot: 1, savedAt: t2.toISOString(), exported: "EXPORT-3" },
      { slot: 2, savedAt: t1.toISOString(), exported: "EXPORT-2" },
      { slot: 3, savedAt: t0.toISOString(), exported: "EXPORT-1" },
    ]);
  });

  it("a fourth push evicts the oldest (EXPORT-1) — ring stays at 3", () => {
    pushSessionLog("EXPORT-1", t0);
    pushSessionLog("EXPORT-2", t1);
    pushSessionLog("EXPORT-3", t2);
    pushSessionLog("EXPORT-4", t3);
    expect(listSessionLogs()).toStrictEqual([
      { slot: 1, savedAt: t3.toISOString(), exported: "EXPORT-4" },
      { slot: 2, savedAt: t2.toISOString(), exported: "EXPORT-3" },
      { slot: 3, savedAt: t1.toISOString(), exported: "EXPORT-2" },
    ]);
    // EXPORT-1 is gone entirely, not merely unlisted.
    const raw = JSON.stringify(listSessionLogs());
    expect(raw).not.toContain("EXPORT-1");
  });
});

describe("sessionLogHistory: byte-identity and corruption tolerance", () => {
  it("what goes in comes back exact (byte-identity of `exported`)", () => {
    const exported = '{"entries":[{"kind":"frame","detail":"f1 01"}]}';
    pushSessionLog(exported, t0);
    expect(listSessionLogs()[0]!.exported).toBe(exported);
  });

  it("a corrupt slot is skipped, not fatal — surviving slots still list", () => {
    pushSessionLog("EXPORT-1", t0);
    pushSessionLog("EXPORT-2", t1);
    pushSessionLog("EXPORT-3", t2);
    // h2 holds EXPORT-2 at this point (see the rotation-order test above);
    // plant garbage directly over it.
    localStorage.setItem("ergomatic:session-log-h2", "not json{{{");
    expect(listSessionLogs()).toStrictEqual([
      { slot: 1, savedAt: t2.toISOString(), exported: "EXPORT-3" },
      { slot: 3, savedAt: t0.toISOString(), exported: "EXPORT-1" },
    ]);
  });

  it("a slot holding valid JSON of the WRONG shape (not malformed, just not a StoredSlot) is skipped too", () => {
    pushSessionLog("EXPORT-1", t0);
    pushSessionLog("EXPORT-2", t1);
    pushSessionLog("EXPORT-3", t2);
    // h2 holds EXPORT-2 (see the rotation-order test above); overwrite it
    // with well-formed JSON that simply isn't a `{savedAt, exported}` pair.
    localStorage.setItem(
      "ergomatic:session-log-h2",
      JSON.stringify({ unrelated: true }),
    );
    expect(listSessionLogs()).toStrictEqual([
      { slot: 1, savedAt: t2.toISOString(), exported: "EXPORT-3" },
      { slot: 3, savedAt: t0.toISOString(), exported: "EXPORT-1" },
    ]);
  });
});

describe("sessionLogHistory: denied storage", () => {
  it("a denied GETTER reads as an empty list, never throws", () => {
    localStorage.setItem("ergomatic:session-log-h1", "whatever");
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("storage is denied", "SecurityError");
      });
    try {
      expect(() => listSessionLogs()).not.toThrow();
      expect(listSessionLogs()).toStrictEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it("a denied setItem is a silent no-op — pushSessionLog never throws", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("storage is denied", "SecurityError");
      });
    try {
      expect(() => pushSessionLog("EXPORT-1", t0)).not.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(listSessionLogs()).toStrictEqual([]);
  });
});
