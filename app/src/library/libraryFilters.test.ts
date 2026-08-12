import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTERS, type Filters } from "./filters";
import {
  LIBRARY_FILTERS_KEY,
  clearLibraryFilters,
  loadLibraryFilters,
  saveLibraryFilters,
} from "./libraryFilters";
import { LIBRARY_SCROLL_KEY, saveLibraryScroll } from "./libraryScroll";

const FULL: Filters = {
  types: ["AT", "O2"],
  difficulties: ["easy", "hard"],
  durations: ["30-45", "60+"],
  painLevels: [4, 5],
  lastDone: "over21",
  source: "custom",
};

// The pre-Task-4 (v1) shape, kept verbatim as a fixture rather than reused
// from filters.ts (which has never exported these field names) — this is
// exactly the record a rower's browser could still be holding in
// sessionStorage from before that round shipped.
const V1_RECORD = {
  type: "AT",
  durations: ["30-45", "60+"],
  painMax3: true,
  recency: "not-recent",
  customOnly: true,
};

// The v2 shape (Task 4 through the library-filter-unification round's own
// predecessor): a single `type` rather than a `types` array, and no
// `difficulties` field at all — exactly what every currently-stored
// record looks like the moment this round's validator ships. The strict,
// whole-record rejection (not a partial merge) is the point: a rower's
// in-flight `type: "O2"` selection resets rather than silently becoming a
// `types: []` (= "no filter", i.e. showing MORE than they had selected).
const V2_RECORD = {
  type: "O2",
  durations: [],
  painLevels: [],
  lastDone: null,
  source: null,
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

  it("rejects an old-shape (v2, single `type`, no `difficulties`) record wholesale, falling back to EMPTY_FILTERS rather than a hybrid", () => {
    sessionStorage.setItem(LIBRARY_FILTERS_KEY, JSON.stringify(V2_RECORD));
    expect(loadLibraryFilters()).toStrictEqual(EMPTY_FILTERS);
  });

  describe("rejects malformed stored values (falls back to EMPTY_FILTERS)", () => {
    const store = (value: string) =>
      sessionStorage.setItem(LIBRARY_FILTERS_KEY, value);

    it.each([
      ["garbage JSON", "not json {"],
      ["a JSON string", JSON.stringify("AT")],
      ["a JSON array", JSON.stringify(["AT"])],
      ["null", "null"],
      ["types missing entirely", JSON.stringify(V2_RECORD)],
      ["types not an array", JSON.stringify({ ...FULL, types: "AT" })],
      [
        "types contains an unknown code",
        JSON.stringify({ ...FULL, types: ["XX"] }),
      ],
      [
        "types contains a wrong-shaped member",
        JSON.stringify({ ...FULL, types: [2] }),
      ],
      [
        "difficulties not an array",
        JSON.stringify({ ...FULL, difficulties: "easy" }),
      ],
      [
        "difficulties contains an unknown value",
        JSON.stringify({ ...FULL, difficulties: ["extreme"] }),
      ],
      [
        "difficulties contains a wrong-shaped member",
        JSON.stringify({ ...FULL, difficulties: [1] }),
      ],
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
        JSON.stringify({ types: [], difficulties: [], durations: [] }),
      ],
      // The pre-Task-4 (v1) shape: none of its fields overlap the current
      // validator's own field names, so it's rejected wholesale — the
      // point of the strict, per-field check rather than a partial merge.
      ["a v1-shaped record", JSON.stringify(V1_RECORD)],
    ])("%s", (_name, raw) => {
      store(raw);
      expect(loadLibraryFilters()).toStrictEqual(EMPTY_FILTERS);
    });
  });

  it("de-dupes duplicated types from a tampered value", () => {
    sessionStorage.setItem(
      LIBRARY_FILTERS_KEY,
      JSON.stringify({ ...FULL, types: ["AT", "AT", "O2"] }),
    );
    expect(loadLibraryFilters().types).toStrictEqual(["AT", "O2"]);
  });

  it("de-dupes duplicated difficulties from a tampered value", () => {
    sessionStorage.setItem(
      LIBRARY_FILTERS_KEY,
      JSON.stringify({ ...FULL, difficulties: ["easy", "easy", "hard"] }),
    );
    expect(loadLibraryFilters().difficulties).toStrictEqual(["easy", "hard"]);
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

  // L5 (whole-branch review): libraryScroll's own saved position was
  // measured against whatever list the REJECTED filters record was
  // showing, not the wider EMPTY_FILTERS list this fallback produces —
  // restoring it against the wrong list is exactly the failure the two
  // files being a matched pair (see LIBRARY_FILTERS_KEY's own comment
  // above) exists to prevent.
  it("clears a stale libraryScroll when the stored filters record is rejected (v1 shape, malformed, etc.)", () => {
    saveLibraryScroll(1200);
    sessionStorage.setItem(LIBRARY_FILTERS_KEY, JSON.stringify(V1_RECORD));

    expect(loadLibraryFilters()).toStrictEqual(EMPTY_FILTERS);
    expect(sessionStorage.getItem(LIBRARY_SCROLL_KEY)).toBeNull();
  });

  it("leaves libraryScroll untouched when nothing is stored at all — a fresh visit, not a rejection", () => {
    saveLibraryScroll(1200);

    expect(loadLibraryFilters()).toStrictEqual(EMPTY_FILTERS);
    expect(sessionStorage.getItem(LIBRARY_SCROLL_KEY)).toBe("1200");
  });

  it("leaves libraryScroll untouched when a valid filters record loads successfully", () => {
    saveLibraryScroll(1200);
    saveLibraryFilters(FULL);

    expect(loadLibraryFilters()).toStrictEqual(FULL);
    expect(sessionStorage.getItem(LIBRARY_SCROLL_KEY)).toBe("1200");
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
