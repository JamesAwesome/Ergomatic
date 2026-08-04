import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTERS, type Filters } from "./filters";
import {
  LIBRARY_FILTERS_KEY,
  clearLibraryFilters,
  loadLibraryFilters,
  saveLibraryFilters,
} from "./libraryFilters";

const FULL: Filters = {
  type: "AT",
  durations: ["30-45", "60+"],
  painLevels: [4, 5],
  lastDone: "over21",
  source: "custom",
};

// The pre-Task-4 shape, kept verbatim as a fixture rather than reused from
// filters.ts (which no longer exports these field names at all) — this is
// exactly the record a rower's browser could still be holding in
// sessionStorage from before this round shipped.
const V1_RECORD = {
  type: "AT",
  durations: ["30-45", "60+"],
  painMax3: true,
  recency: "not-recent",
  customOnly: true,
};

describe("libraryFilters", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips a fully-populated Filters", () => {
    saveLibraryFilters(FULL);
    expect(loadLibraryFilters()).toStrictEqual(FULL);
  });

  it("round-trips the empty set (persisted emptiness is still valid)", () => {
    saveLibraryFilters(EMPTY_FILTERS);
    expect(loadLibraryFilters()).toStrictEqual(EMPTY_FILTERS);
  });

  it("returns EMPTY_FILTERS when nothing is stored", () => {
    expect(loadLibraryFilters()).toStrictEqual(EMPTY_FILTERS);
  });

  it("returns a fresh object each time, never a shared reference", () => {
    // Callers hand the result straight to useState — a shared mutable
    // EMPTY_FILTERS reference would let one mount's mutation leak into
    // the next.
    expect(loadLibraryFilters()).not.toBe(loadLibraryFilters());
    expect(loadLibraryFilters()).not.toBe(EMPTY_FILTERS);
  });

  describe("rejects malformed stored values (falls back to EMPTY_FILTERS)", () => {
    const store = (value: string) =>
      sessionStorage.setItem(LIBRARY_FILTERS_KEY, value);

    it.each([
      ["garbage JSON", "not json {"],
      ["a JSON string", JSON.stringify("AT")],
      ["a JSON array", JSON.stringify(["AT"])],
      ["null", "null"],
      ["unknown type code", JSON.stringify({ ...FULL, type: "XX" })],
      ["type wrong shape", JSON.stringify({ ...FULL, type: 2 })],
      ["durations not an array", JSON.stringify({ ...FULL, durations: "60+" })],
      [
        "unknown duration bucket",
        JSON.stringify({ ...FULL, durations: ["25-30"] }),
      ],
      ["painLevels not an array", JSON.stringify({ ...FULL, painLevels: 4 })],
      [
        "painLevels contains an out-of-range level",
        JSON.stringify({ ...FULL, painLevels: [0] }),
      ],
      [
        "painLevels contains a non-integer",
        JSON.stringify({ ...FULL, painLevels: [4.5] }),
      ],
      ["unknown lastDone", JSON.stringify({ ...FULL, lastDone: "today" })],
      ["lastDone wrong shape", JSON.stringify({ ...FULL, lastDone: 21 })],
      ["unknown source", JSON.stringify({ ...FULL, source: "book" })],
      [
        "missing field",
        JSON.stringify({ type: null, durations: [], painLevels: [] }),
      ],
      // The pre-Task-4 (v1) shape: none of its fields overlap the v2
      // validator's own field names, so it's rejected wholesale — the
      // point of the strict, per-field check rather than a partial merge.
      ["a v1-shaped record", JSON.stringify(V1_RECORD)],
    ])("%s", (_name, raw) => {
      store(raw);
      expect(loadLibraryFilters()).toStrictEqual(EMPTY_FILTERS);
    });
  });

  it("de-dupes duplicated duration buckets from a tampered value", () => {
    sessionStorage.setItem(
      LIBRARY_FILTERS_KEY,
      JSON.stringify({ ...FULL, durations: ["60+", "60+", "30-45"] }),
    );
    expect(loadLibraryFilters().durations).toStrictEqual(["60+", "30-45"]);
  });

  it("de-dupes duplicated pain levels from a tampered value", () => {
    sessionStorage.setItem(
      LIBRARY_FILTERS_KEY,
      JSON.stringify({ ...FULL, painLevels: [5, 5, 4] }),
    );
    expect(loadLibraryFilters().painLevels).toStrictEqual([5, 4]);
  });

  it("clearLibraryFilters removes the stored value", () => {
    saveLibraryFilters(FULL);
    clearLibraryFilters();
    expect(sessionStorage.getItem(LIBRARY_FILTERS_KEY)).toBeNull();
    expect(loadLibraryFilters()).toStrictEqual(EMPTY_FILTERS);
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
      expect(() => saveLibraryFilters(FULL)).not.toThrow();
      expect(loadLibraryFilters()).toStrictEqual(EMPTY_FILTERS);
    } finally {
      setItem.mockRestore();
      getItem.mockRestore();
    }
  });
});
