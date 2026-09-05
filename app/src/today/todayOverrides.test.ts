import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TODAY_OVERRIDES_KEY,
  loadTodayOverrides,
  saveTodayOverrides,
  type TodayOverrides,
} from "./todayOverrides";

const FULL: TodayOverrides = {
  date: "2026-08-01",
  planKey: "sprint",
  doneN: 11,
  swapType: "AT",
  session: 0,
};

// The pre-PR1 (Phase SF) v4 shape: the five filter groups rode this
// record. They now live in todayFilters.ts; this fixture is exactly the
// record a rower's browser holds from earlier the SAME day PR1 deploys.
const V4_RECORD = {
  date: "2026-08-01",
  planKey: "sprint",
  doneN: 11,
  swapType: "AT",
  session: 0,
  durations: ["<30", "45-60"],
  painLevels: [1, 3, 5],
  lastDone: "under21",
  source: "custom",
};

beforeEach(() => localStorage.clear());

describe("saveTodayOverrides / loadTodayOverrides", () => {
  it("round-trips and returns the record when date, planKey, and doneN all match", () => {
    expect(saveTodayOverrides(FULL)).toBe(true);
    expect(loadTodayOverrides("2026-08-01", "sprint", 11, 0)).toStrictEqual(
      FULL,
    );
  });

  it("round-trips a freestyle record (planKey and doneN both null) with a lit chip", () => {
    const freestyle: TodayOverrides = {
      ...FULL,
      planKey: null,
      doneN: null,
      swapType: "TR",
    };
    saveTodayOverrides(freestyle);
    expect(loadTodayOverrides("2026-08-01", null, null, 0)).toStrictEqual(
      freestyle,
    );
  });

  it("round-trips swapType: null (no swap)", () => {
    const noSwap: TodayOverrides = { ...FULL, swapType: null };
    saveTodayOverrides(noSwap);
    expect(loadTodayOverrides("2026-08-01", "sprint", 11, 0)).toStrictEqual(
      noSwap,
    );
  });

  // Phase SF PR1: a same-day pre-PR1 record PARSES — the parser reads
  // named fields and ignores the five filter fields it no longer owns —
  // and its swap survives the deploy. (The anchor pass caught revision 0
  // of the spec claiming the opposite: removal does not fail a
  // named-field parser, only a rename does.)
  it("loads a same-day v4 record, keeping the swap and dropping the retired filter fields", () => {
    localStorage.setItem(TODAY_OVERRIDES_KEY, JSON.stringify(V4_RECORD));
    expect(loadTodayOverrides("2026-08-01", "sprint", 11, 0)).toStrictEqual(
      FULL,
    );
  });

  it("discards the record when a session has been logged since (freestyle re-roll key), and rejects a malformed session", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-01", "sprint", 11, 1)).toBeNull();
    localStorage.setItem(
      TODAY_OVERRIDES_KEY,
      JSON.stringify({ ...FULL, session: 1.5 }),
    );
    expect(loadTodayOverrides("2026-08-01", "sprint", 11, 1.5)).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(loadTodayOverrides("2026-08-01", "sprint", 11, 0)).toBeNull();
  });

  it("discards the stored record on a date change", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-02", "sprint", 11, 0)).toBeNull();
  });

  it("discards the stored record when the plan switched", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-01", "head", 11, 0)).toBeNull();
  });

  it("discards the stored record when doneN advanced (a session logged since)", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-01", "sprint", 12, 0)).toBeNull();
  });

  it("discards a plan-mode record when read back in freestyle context", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-01", null, null, 0)).toBeNull();
  });

  describe("rejects malformed stored values (falls back to null)", () => {
    const store = (value: string) =>
      localStorage.setItem(TODAY_OVERRIDES_KEY, value);

    it.each([
      ["garbage JSON", "not json {"],
      ["a JSON string", JSON.stringify("AT")],
      ["a JSON array", JSON.stringify(["AT"])],
      ["null", "null"],
      ["date not a string", JSON.stringify({ ...FULL, date: 20260801 })],
      ["planKey wrong shape", JSON.stringify({ ...FULL, planKey: 5 })],
      ["doneN wrong shape", JSON.stringify({ ...FULL, doneN: "11" })],
      ["unknown swapType code", JSON.stringify({ ...FULL, swapType: "XX" })],
      ["swapType wrong shape", JSON.stringify({ ...FULL, swapType: 2 })],
      [
        "swapType missing (undefined is not null)",
        JSON.stringify({
          date: "2026-08-01",
          planKey: "sprint",
          doneN: 11,
          session: 0,
        }),
      ],
      [
        "session missing (a pre-'logged only' same-day record)",
        JSON.stringify({
          date: "2026-08-01",
          planKey: "sprint",
          doneN: 11,
          swapType: "AT",
        }),
      ],
    ])("%s", (_name, raw) => {
      store(raw);
      expect(loadTodayOverrides("2026-08-01", "sprint", 11, 0)).toBeNull();
    });
  });

  it("returns null when the storage GETTER itself throws (storage-denial research §1 I-1/I-2), and false when the setter does", () => {
    saveTodayOverrides(FULL);
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("storage is denied", "SecurityError");
      });
    try {
      expect(loadTodayOverrides("2026-08-01", "sprint", 11, 0)).toBeNull();
    } finally {
      getItem.mockRestore();
    }
    expect(loadTodayOverrides("2026-08-01", "sprint", 11, 0)).toStrictEqual(
      FULL,
    );
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    try {
      expect(() => saveTodayOverrides(FULL)).not.toThrow();
      expect(saveTodayOverrides(FULL)).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });

  it("exposes the storage key used", () => {
    expect(TODAY_OVERRIDES_KEY).toBe("ergomatic.todayOverrides");
  });
});
