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
  difficulties: ["easy", "hard"],
  durations: ["<30", "45-60"],
  painLevels: [1, 3, 5],
  lastDone: "under21",
  source: "custom",
};

const DEFAULTS: FilterSet = {
  difficulties: ["easy", "medium", "hard"],
  durations: ["<30", "30-45", "45-60"],
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

  it("round-trips a store with two keys written and rollSuppressed set, UNDATED (no date, plan or doneN to match)", () => {
    const store: TodayFilters = {
      v: 1,
      rollSuppressed: true,
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
    expect(after.rollSuppressed).toBe(false);
  });

  it("drops ONE corrupt key and keeps the others (permanent memory is never discarded whole)", () => {
    localStorage.setItem(
      TODAY_FILTERS_KEY,
      JSON.stringify({
        v: 1,
        rollSuppressed: false,
        byKey: {
          AT: AT_SET,
          TR: { ...AT_SET, durations: ["90+"] },
          XX: AT_SET,
        },
      }),
    );
    expect(loadTodayFilters().byKey).toStrictEqual({ AT: AT_SET });
  });

  it("de-dupes and canonically orders durations and pain levels inside a set", () => {
    localStorage.setItem(
      TODAY_FILTERS_KEY,
      JSON.stringify({
        v: 1,
        rollSuppressed: false,
        byKey: {
          O2: {
            ...AT_SET,
            durations: ["60+", "<30", "<30"],
            painLevels: [5, 1, 5],
          },
        },
      }),
    );
    expect(loadTodayFilters().byKey.O2).toStrictEqual({
      ...AT_SET,
      durations: ["<30", "60+"],
      painLevels: [1, 5],
    });
  });

  it("reads rollSuppressed as false unless it is literally true", () => {
    localStorage.setItem(
      TODAY_FILTERS_KEY,
      JSON.stringify({ v: 1, rollSuppressed: "yes", byKey: {} }),
    );
    expect(loadTodayFilters().rollSuppressed).toBe(false);
  });

  describe("reads the EMPTY store for a store-level problem", () => {
    it.each([
      ["garbage JSON", "not json {"],
      ["a JSON string", JSON.stringify("AT")],
      ["a JSON array", JSON.stringify([])],
      ["null", "null"],
      [
        "a future version",
        JSON.stringify({ v: 2, rollSuppressed: false, byKey: {} }),
      ],
      ["no version at all", JSON.stringify({ byKey: { AT: AT_SET } })],
    ])("%s", (_name, raw) => {
      localStorage.setItem(TODAY_FILTERS_KEY, raw);
      expect(loadTodayFilters()).toStrictEqual(EMPTY_TODAY_FILTERS);
    });
  });

  describe("rejects a malformed set (that key only)", () => {
    it.each([
      ["difficulties not an array", { ...AT_SET, difficulties: "easy" }],
      ["unknown difficulty", { ...AT_SET, difficulties: ["extreme"] }],
      ["durations not an array", { ...AT_SET, durations: "<30" }],
      ["unknown bucket", { ...AT_SET, durations: ["90+"] }],
      ["a number where a bucket goes", { ...AT_SET, durations: [45] }],
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
        JSON.stringify({ v: 1, rollSuppressed: false, byKey: { AT: set } }),
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
