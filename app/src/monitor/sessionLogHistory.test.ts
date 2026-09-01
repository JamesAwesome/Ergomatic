import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listSessionLogs,
  pushSessionLog,
  updateNewestSessionLog,
} from "./sessionLogHistory";

const HISTORY_KEY = "ergomatic:session-log-history";

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

  it("three pushes: newest first", () => {
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

  it("a corrupt ARRAY ELEMENT is skipped, not fatal — surviving entries still list", () => {
    pushSessionLog("EXPORT-1", t0);
    pushSessionLog("EXPORT-2", t1);
    pushSessionLog("EXPORT-3", t2);
    // The array is [EXPORT-3, EXPORT-2, EXPORT-1] at this point (see the
    // rotation-order test above); corrupt the middle element directly by
    // overwriting the whole stored array with one bad entry mixed in.
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        { savedAt: t2.toISOString(), exported: "EXPORT-3" },
        { unrelated: true },
        { savedAt: t0.toISOString(), exported: "EXPORT-1" },
      ]),
    );
    expect(listSessionLogs()).toStrictEqual([
      { slot: 1, savedAt: t2.toISOString(), exported: "EXPORT-3" },
      { slot: 2, savedAt: t0.toISOString(), exported: "EXPORT-1" },
    ]);
  });

  it("malformed JSON under the history key reads as an empty list, never throws", () => {
    localStorage.setItem(HISTORY_KEY, "not json{{{");
    expect(() => listSessionLogs()).not.toThrow();
    expect(listSessionLogs()).toStrictEqual([]);
  });

  it("well-formed JSON that isn't an array reads as an empty list", () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ not: "an array" }));
    expect(listSessionLogs()).toStrictEqual([]);
  });
});

describe("sessionLogHistory: M-7 — savedAt validation", () => {
  it("an entry whose savedAt does not parse to a valid date is skipped, never rendered", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        { savedAt: "not-a-date", exported: "EXPORT-BAD" },
        { savedAt: t0.toISOString(), exported: "EXPORT-GOOD" },
      ]),
    );
    const entries = listSessionLogs();
    expect(entries).toStrictEqual([
      { slot: 1, savedAt: t0.toISOString(), exported: "EXPORT-GOOD" },
    ]);
    // Never surfaces "Invalid Date" text anywhere a reader could render it.
    expect(JSON.stringify(entries)).not.toContain("EXPORT-BAD");
  });

  it("an empty-string savedAt is also invalid (Date.parse('') is NaN)", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([{ savedAt: "", exported: "EXPORT-BAD" }]),
    );
    expect(listSessionLogs()).toStrictEqual([]);
  });
});

describe("sessionLogHistory: M-6 — atomic history storage", () => {
  it("pushSessionLog issues exactly ONE setItem call — the whole array, atomically", () => {
    pushSessionLog("EXPORT-1", t0);
    const spy = vi.spyOn(Storage.prototype, "setItem");
    pushSessionLog("EXPORT-2", t1);
    const historyWrites = spy.mock.calls.filter(([key]) => key === HISTORY_KEY);
    expect(historyWrites).toHaveLength(1);
  });

  it("a FAILED write loses only the newest push — the prior list survives intact", () => {
    pushSessionLog("EXPORT-1", t0);
    pushSessionLog("EXPORT-2", t1);
    const before = listSessionLogs();

    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("storage is denied", "SecurityError");
      });
    try {
      expect(() => pushSessionLog("EXPORT-3", t2)).not.toThrow();
    } finally {
      spy.mockRestore();
    }

    // The old three-key rotation could duplicate or lose an entry on a
    // mid-sequence write failure because it took multiple `setItem` calls to
    // land one push; the single-key shape either writes the whole new array
    // or leaves the old one exactly as it was — never a partial result.
    expect(listSessionLogs()).toStrictEqual(before);
  });

  it("updateNewestSessionLog replaces the newest entry in place — no rotation, list length unchanged", () => {
    pushSessionLog("EXPORT-1", t0);
    pushSessionLog("EXPORT-2", t1);
    updateNewestSessionLog("EXPORT-2-FRESHER", t2);
    expect(listSessionLogs()).toStrictEqual([
      { slot: 1, savedAt: t2.toISOString(), exported: "EXPORT-2-FRESHER" },
      { slot: 2, savedAt: t0.toISOString(), exported: "EXPORT-1" },
    ]);
  });

  it("updateNewestSessionLog issues exactly ONE setItem call too", () => {
    pushSessionLog("EXPORT-1", t0);
    const spy = vi.spyOn(Storage.prototype, "setItem");
    updateNewestSessionLog("EXPORT-1-FRESHER", t1);
    const historyWrites = spy.mock.calls.filter(([key]) => key === HISTORY_KEY);
    expect(historyWrites).toHaveLength(1);
  });

  it("updateNewestSessionLog against an empty history falls back to inserting one entry", () => {
    updateNewestSessionLog("EXPORT-1", t0);
    expect(listSessionLogs()).toStrictEqual([
      { slot: 1, savedAt: t0.toISOString(), exported: "EXPORT-1" },
    ]);
  });
});

describe("sessionLogHistory: denied storage", () => {
  it("a denied GETTER reads as an empty list, never throws", () => {
    localStorage.setItem(HISTORY_KEY, "whatever");
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
