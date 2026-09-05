import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  EMPTY_TODAY_FILTERS,
  TODAY_FILTERS_KEY,
  TODAY_FILTER_KEYS,
  filterKeyFor,
  filterSetFor,
  loadTodayFilters,
  saveTodayFilters,
  withFilterSet,
  type FilterSet,
  type TodayFilters,
} from "./todayFilters";

const AT_SET: FilterSet = {
  durationRange: { min: 25, max: 60 },
  painLevels: [1, 3, 5],
  lastDone: "under21",
  source: "custom",
};

const DEFAULTS: FilterSet = {
  durationRange: { min: 0, max: 60 },
  painLevels: [],
  lastDone: null,
  source: null,
};

beforeEach(() => localStorage.clear());

describe("filterKeyFor", () => {
  it("maps a type to itself and no type to ANY", () => {
    expect(filterKeyFor("AT")).toBe("AT");
    expect(filterKeyFor(null)).toBe("ANY");
  });

  it("names the five keys the chip row can produce", () => {
    expect(TODAY_FILTER_KEYS).toStrictEqual(["O2", "AT", "TR", "AN", "ANY"]);
  });
});

describe("saveTodayFilters / loadTodayFilters", () => {
  it("reads the empty store when nothing is stored", () => {
    expect(loadTodayFilters()).toStrictEqual(EMPTY_TODAY_FILTERS);
  });

  it("round-trips a store with two keys written, UNDATED (no date, plan or doneN to match)", () => {
    const store: TodayFilters = {
      v: 2,
      byKey: { AT: AT_SET, ANY: DEFAULTS },
    };
    expect(saveTodayFilters(store)).toBe(true);
    expect(loadTodayFilters()).toStrictEqual(store);
  });

  it("reads a key never written as the caller's defaults, and a written key as itself", () => {
    const store = withFilterSet(EMPTY_TODAY_FILTERS, "AT", AT_SET);
    expect(filterSetFor(store, "AT", DEFAULTS)).toStrictEqual(AT_SET);
    expect(filterSetFor(store, "TR", DEFAULTS)).toBe(DEFAULTS);
    expect(filterSetFor(store, "ANY", DEFAULTS)).toBe(DEFAULTS);
  });

  it("withFilterSet never mutates its input and replaces only the named key", () => {
    const before = withFilterSet(EMPTY_TODAY_FILTERS, "AT", AT_SET);
    const after = withFilterSet(before, "TR", DEFAULTS);
    expect(before.byKey.TR).toBeUndefined();
    expect(after.byKey.AT).toStrictEqual(AT_SET);
    expect(after.byKey.TR).toStrictEqual(DEFAULTS);
  });

  it("drops ONE corrupt key and keeps the others (permanent memory is never discarded whole)", () => {
    localStorage.setItem(
      TODAY_FILTERS_KEY,
      JSON.stringify({
        v: 2,
        byKey: {
          AT: AT_SET,
          TR: { ...AT_SET, durationRange: "60+" },
          XX: AT_SET,
        },
      }),
    );
    expect(loadTodayFilters().byKey).toStrictEqual({ AT: AT_SET });
  });

  it("clamps a tampered durationRange and de-dupes/sorts pain levels inside a set", () => {
    localStorage.setItem(
      TODAY_FILTERS_KEY,
      JSON.stringify({
        v: 2,
        byKey: {
          O2: {
            ...AT_SET,
            durationRange: { min: 24.6, max: 500 },
            painLevels: [5, 1, 5],
          },
        },
      }),
    );
    expect(loadTodayFilters().byKey.O2).toStrictEqual({
      ...AT_SET,
      durationRange: { min: 25, max: 120 },
      painLevels: [1, 5],
    });
  });

  // Phase SF PR2 (spec §3.3, the PM's finding): a v1 store is permanent
  // memory and is MAPPED, never discarded — each bucket union becomes the
  // range it spans; an empty union (v1's "TIME off") becomes unbounded.
  it("maps a v1 store's bucket unions to ranges, key by key, and reads back as v2", () => {
    localStorage.setItem(
      TODAY_FILTERS_KEY,
      JSON.stringify({
        v: 1,
        byKey: {
          AT: {
            ...AT_SET,
            durationRange: undefined,
            durations: ["<30", "45-60"],
          },
          O2: { ...AT_SET, durationRange: undefined, durations: [] },
          TR: {
            ...AT_SET,
            durationRange: undefined,
            durations: ["45-60", "60+"],
          },
          AN: { ...AT_SET, durationRange: undefined, durations: "<30" },
        },
      }),
    );
    const store = loadTodayFilters();
    expect(store.v).toBe(2);
    expect(store.byKey.AT?.durationRange).toStrictEqual({ min: 0, max: 60 });
    expect(store.byKey.O2?.durationRange).toStrictEqual({ min: 0, max: 120 });
    expect(store.byKey.TR?.durationRange).toStrictEqual({ min: 45, max: 120 });
    expect(store.byKey.AN).toBeUndefined();
  });

  // Phase DE PR 1: every installed rower's record still carries the
  // deleted group's key. It must parse exactly as the keyless record does,
  // whatever it holds — the key is unknown now, not validated.
  it.each([
    ["a legacy difficulties array", ["easy"]],
    ["a malformed difficulties value", "garbage"],
  ])("parses a stored set that still carries %s, dropping the key", (_n, v) => {
    localStorage.setItem(
      TODAY_FILTERS_KEY,
      JSON.stringify({ v: 2, byKey: { AT: { ...AT_SET, difficulties: v } } }),
    );
    expect(loadTodayFilters().byKey).toStrictEqual({ AT: AT_SET });
  });

  it("ignores unknown top-level fields (the revision-1 rollSuppressed flag James struck reads as nothing)", () => {
    localStorage.setItem(
      TODAY_FILTERS_KEY,
      JSON.stringify({ v: 2, rollSuppressed: true, byKey: { AT: AT_SET } }),
    );
    expect(loadTodayFilters()).toStrictEqual({ v: 2, byKey: { AT: AT_SET } });
  });

  describe("reads the EMPTY store for a store-level problem", () => {
    it.each([
      ["garbage JSON", "not json {"],
      ["a JSON string", JSON.stringify("AT")],
      ["a JSON array", JSON.stringify([])],
      ["null", "null"],
      ["a future version", JSON.stringify({ v: 2, byKey: {} })],
      ["no version at all", JSON.stringify({ byKey: { AT: AT_SET } })],
    ])("%s", (_name, raw) => {
      localStorage.setItem(TODAY_FILTERS_KEY, raw);
      expect(loadTodayFilters()).toStrictEqual(EMPTY_TODAY_FILTERS);
    });
  });

  describe("rejects a malformed set (that key only)", () => {
    it.each([
      ["durationRange not an object", { ...AT_SET, durationRange: "<30" }],
      [
        "durationRange with a non-number member",
        { ...AT_SET, durationRange: { min: "0", max: 60 } },
      ],
      ["durationRange missing max", { ...AT_SET, durationRange: { min: 0 } }],
      [
        "a v1 field on a v2 record (durations, no durationRange)",
        { ...AT_SET, durationRange: undefined, durations: ["<30"] },
      ],
      ["painLevels not an array", { ...AT_SET, painLevels: 3 }],
      ["out-of-range pain level", { ...AT_SET, painLevels: [0] }],
      ["non-integer pain level", { ...AT_SET, painLevels: [4.5] }],
      ["lastDone wrong shape", { ...AT_SET, lastDone: 21 }],
      ["unknown lastDone", { ...AT_SET, lastDone: "recent" }],
      [
        "lastDone missing (undefined is not null)",
        { ...AT_SET, lastDone: undefined },
      ],
      ["source wrong shape", { ...AT_SET, source: true }],
      ["unknown source", { ...AT_SET, source: "mine" }],
      ["a set that is an array", ["easy"]],
      ["a set that is null", null],
    ])("%s", (_name, set) => {
      localStorage.setItem(
        TODAY_FILTERS_KEY,
        JSON.stringify({ v: 2, byKey: { AT: set } }),
      );
      expect(loadTodayFilters().byKey.AT).toBeUndefined();
    });
  });

  it("returns the empty store when the storage GETTER throws, and false (not a throw) when the setter does", () => {
    const store = withFilterSet(EMPTY_TODAY_FILTERS, "AT", AT_SET);
    saveTodayFilters(store);
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("storage is denied", "SecurityError");
      });
    try {
      expect(loadTodayFilters()).toStrictEqual(EMPTY_TODAY_FILTERS);
    } finally {
      getItem.mockRestore();
    }
    expect(loadTodayFilters()).toStrictEqual(store);
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    try {
      expect(() => saveTodayFilters(store)).not.toThrow();
      expect(saveTodayFilters(store)).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });

  it("exposes the storage key used", () => {
    expect(TODAY_FILTERS_KEY).toBe("ergomatic.todayFilters");
  });
});
