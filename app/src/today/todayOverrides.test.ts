import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TODAY_OVERRIDES_KEY,
  loadTodayOverrides,
  saveTodayOverrides,
  bucketsForCap,
  type TodayOverrides,
} from "./todayOverrides";

const FULL: TodayOverrides = {
  date: "2026-08-01",
  planKey: "sprint",
  doneN: 11,
  swapType: "AT",
  difficulties: ["easy", "hard"],
  durations: ["<30", "45-60"],
  painLevels: [1, 3, 5],
};

// The pre-Task-5 (ui-fix round) shape: every other field kept its name
// across the change, only the pain field's shape/name differ (`painMax3`
// boolean here vs. `painLevels: number[]` now) — this is exactly the
// record a rower's browser could still be holding in localStorage from
// before that round shipped. Kept verbatim as a fixture rather than
// derived from FULL (TodayOverrides no longer has a `painMax3` field to
// spread it from).
const V1_RECORD = {
  date: "2026-08-01",
  planKey: "sprint",
  doneN: 11,
  swapType: "AT",
  difficulties: ["easy", "hard"],
  capMinutes: 45,
  painMax3: true,
};

// The v2 shape (Task 5 through the pre-Amendment 2026-08-04 round): every
// field but TIME kept its name — `capMinutes: number | null` is where
// `durations: DurationBucket[]` now lives. This is exactly the record a
// rower's browser could still be holding in localStorage from before the
// Amendment shipped (a single-value cap, not a bucket array).
const V2_RECORD = {
  date: "2026-08-01",
  planKey: "sprint",
  doneN: 11,
  swapType: "AT",
  difficulties: ["easy", "hard"],
  capMinutes: 45,
  painLevels: [1, 3, 5],
};

beforeEach(() => localStorage.clear());

describe("saveTodayOverrides / loadTodayOverrides", () => {
  it("round-trips and returns the record when date, planKey, and doneN all match", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-01", "sprint", 11)).toStrictEqual(FULL);
  });

  it("round-trips a freestyle record (planKey and doneN both null)", () => {
    const freestyle: TodayOverrides = {
      ...FULL,
      planKey: null,
      doneN: null,
      swapType: null,
    };
    saveTodayOverrides(freestyle);
    expect(loadTodayOverrides("2026-08-01", null, null)).toStrictEqual(
      freestyle,
    );
  });

  it("round-trips durations: [] (TIME off), not treating it as unset", () => {
    const noTimeFilter: TodayOverrides = { ...FULL, durations: [] };
    saveTodayOverrides(noTimeFilter);
    expect(loadTodayOverrides("2026-08-01", "sprint", 11)).toStrictEqual(
      noTimeFilter,
    );
  });

  it("round-trips every bucket selected (durations: all four)", () => {
    const allBuckets: TodayOverrides = {
      ...FULL,
      durations: ["<30", "30-45", "45-60", "60+"],
    };
    saveTodayOverrides(allBuckets);
    expect(loadTodayOverrides("2026-08-01", "sprint", 11)).toStrictEqual(
      allBuckets,
    );
  });

  it("round-trips swapType: null (no swap) and an empty difficulties array", () => {
    const noSwap: TodayOverrides = {
      ...FULL,
      swapType: null,
      difficulties: [],
    };
    saveTodayOverrides(noSwap);
    expect(loadTodayOverrides("2026-08-01", "sprint", 11)).toStrictEqual(
      noSwap,
    );
  });

  it("returns null when nothing is stored", () => {
    expect(loadTodayOverrides("2026-08-01", "sprint", 11)).toBeNull();
  });

  it("discards the stored record on a date change", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-02", "sprint", 11)).toBeNull();
  });

  it("discards the stored record when the plan switched", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-01", "head", 11)).toBeNull();
  });

  it("discards the stored record when doneN advanced (a session logged since)", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-01", "sprint", 12)).toBeNull();
  });

  it("discards a plan-mode record when read back in freestyle context", () => {
    saveTodayOverrides(FULL);
    expect(loadTodayOverrides("2026-08-01", null, null)).toBeNull();
  });

  it("de-dupes duplicated difficulties from a tampered value", () => {
    localStorage.setItem(
      TODAY_OVERRIDES_KEY,
      JSON.stringify({ ...FULL, difficulties: ["easy", "easy", "hard"] }),
    );
    expect(
      loadTodayOverrides("2026-08-01", "sprint", 11)?.difficulties,
    ).toStrictEqual(["easy", "hard"]);
  });

  it("de-dupes duplicated durations from a tampered value", () => {
    localStorage.setItem(
      TODAY_OVERRIDES_KEY,
      JSON.stringify({ ...FULL, durations: ["<30", "<30", "45-60"] }),
    );
    expect(
      loadTodayOverrides("2026-08-01", "sprint", 11)?.durations,
    ).toStrictEqual(["<30", "45-60"]);
  });

  it("canonically orders an out-of-order stored durations value (DURATION_BUCKETS' own order)", () => {
    localStorage.setItem(
      TODAY_OVERRIDES_KEY,
      JSON.stringify({ ...FULL, durations: ["60+", "<30", "30-45"] }),
    );
    expect(
      loadTodayOverrides("2026-08-01", "sprint", 11)?.durations,
    ).toStrictEqual(["<30", "30-45", "60+"]);
  });

  it("de-dupes duplicated pain levels from a tampered value", () => {
    localStorage.setItem(
      TODAY_OVERRIDES_KEY,
      JSON.stringify({ ...FULL, painLevels: [5, 5, 1] }),
    );
    expect(
      loadTodayOverrides("2026-08-01", "sprint", 11)?.painLevels,
    ).toStrictEqual([1, 5]);
  });

  it("sorts an out-of-order stored painLevels value (cells always render 1-5)", () => {
    localStorage.setItem(
      TODAY_OVERRIDES_KEY,
      JSON.stringify({ ...FULL, painLevels: [5, 1, 3] }),
    );
    expect(
      loadTodayOverrides("2026-08-01", "sprint", 11)?.painLevels,
    ).toStrictEqual([1, 3, 5]);
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
        "difficulties not an array",
        JSON.stringify({ ...FULL, difficulties: "easy" }),
      ],
      [
        "unknown difficulty value",
        JSON.stringify({ ...FULL, difficulties: ["extreme"] }),
      ],
      ["durations not an array", JSON.stringify({ ...FULL, durations: "<30" })],
      [
        "durations contains an unknown bucket value",
        JSON.stringify({ ...FULL, durations: ["<30", "90+"] }),
      ],
      [
        // The pre-Amendment single-cap value (a number, not a bucket
        // string) — proves a v2-shaped `capMinutes: 45` sitting where
        // `durations` now lives is rejected as a malformed `durations`,
        // not silently coerced.
        "durations contains a number (the old capMinutes shape)",
        JSON.stringify({ ...FULL, durations: [45] }),
      ],
      ["painLevels not an array", JSON.stringify({ ...FULL, painLevels: 3 })],
      [
        "painLevels contains an out-of-range level",
        JSON.stringify({ ...FULL, painLevels: [0] }),
      ],
      [
        "painLevels contains a non-integer",
        JSON.stringify({ ...FULL, painLevels: [4.5] }),
      ],
      [
        "missing field",
        JSON.stringify({ date: "2026-08-01", planKey: "sprint", doneN: 11 }),
      ],
      // The pre-Task-5 (ui-fix round) v1 shape: every field but the pain one
      // has the same name/type as v2, but `painMax3` isn't `painLevels` —
      // Array.isArray(undefined) is false, so this fails the array check
      // above and is rejected whole, never half-applied under the new
      // field name. Same contract as libraryFilters.test.ts's own
      // v1-shaped-record case.
      [
        "a v1-shaped record (painMax3, not painLevels)",
        JSON.stringify(V1_RECORD),
      ],
      // The pre-Amendment (2026-08-04 PR #50 round) v2 shape: every field
      // but TIME has the same name/type as v3, but `capMinutes` isn't
      // `durations` — Array.isArray(undefined) is false for a record that
      // never had a `durations` field at all, so a v2 record ALSO fails
      // the array check above and is rejected whole, never half-applied
      // under the new field name (same contract the v1 row above already
      // proves for the pain field's own earlier rename).
      [
        "a v2-shaped record (capMinutes, not durations)",
        JSON.stringify(V2_RECORD),
      ],
    ])("%s", (_name, raw) => {
      store(raw);
      expect(loadTodayOverrides("2026-08-01", "sprint", 11)).toBeNull();
    });
  });

  it("save and load never throw when storage itself throws", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    try {
      expect(() => saveTodayOverrides(FULL)).not.toThrow();
      expect(loadTodayOverrides("2026-08-01", "sprint", 11)).toBeNull();
    } finally {
      setItem.mockRestore();
      getItem.mockRestore();
    }
  });

  it("exposes the storage key used", () => {
    expect(TODAY_OVERRIDES_KEY).toBe("ergomatic.todayOverrides");
  });
});

describe("bucketsForCap", () => {
  it("a 60-min cap keeps the first three buckets, excluding 60+", () => {
    expect(bucketsForCap(60)).toStrictEqual(["<30", "30-45", "45-60"]);
  });

  it("a cap over 60 keeps all four buckets (effectively unfiltered)", () => {
    expect(bucketsForCap(90)).toStrictEqual(["<30", "30-45", "45-60", "60+"]);
    expect(bucketsForCap(61)).toStrictEqual(["<30", "30-45", "45-60", "60+"]);
  });

  it("a cap at or under 30 keeps only <30", () => {
    expect(bucketsForCap(30)).toStrictEqual(["<30"]);
    expect(bucketsForCap(1)).toStrictEqual(["<30"]);
  });

  it("a cap of 45 keeps the first two buckets (lower bound strictly below the cap)", () => {
    expect(bucketsForCap(45)).toStrictEqual(["<30", "30-45"]);
  });
});
