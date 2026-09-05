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
  durationRange: { min: 30, max: 120 },
  painLevels: [4, 5],
  lastDone: "over21",
  source: "custom",
  query: "fog",
};

// The pre-Task-4 (v1) shape, kept verbatim as a fixture rather than reused
// from filters.ts (which has never exported `painMax3`/`recency`/
// `customOnly` — those three names predate any shape this file's own types
// have ever described) — this is exactly the record a rower's browser
// could still be holding in sessionStorage from before that round shipped.
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

// A record that is otherwise fully v3-shaped (`durations`, `painLevels`,
// `lastDone`, `source` all present and valid) but still carries the
// RENAMED field under its old name (`type`, not `types`), so it is
// rejected by ONE check alone (`!Array.isArray(f.types)`), isolating that
// check from every other field's own validation (whole-branch review
// I-5). Since Phase DE PR 1 removed the `difficulties` check it is
// shaped identically to `V2_RECORD`; it stays a separate name because the
// two tests that use it pin different claims.
const HALF_MIGRATED_RECORD = {
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

  // Phase DE PR 1: a pre-PR-1 record carries `difficulties`; the key is
  // unknown now and ignored, and the record's OTHER fields still parse
  // strictly (the wrong-shape table below is unchanged).
  it("parses a stored record that still carries difficulties, dropping the key", () => {
    sessionStorage.setItem(
      LIBRARY_FILTERS_KEY,
      JSON.stringify({ ...FULL, difficulties: ["easy", "hard"] }),
    );
    expect(loadLibraryFilters()).toStrictEqual(FULL);
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
      [
        "types still under its old name, everything else already migrated",
        JSON.stringify(HALF_MIGRATED_RECORD),
      ],
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
        "durationRange missing (a bucket-era record: `durations` instead)",
        JSON.stringify({
          ...FULL,
          durationRange: undefined,
          durations: ["60+"],
        }),
      ],
      [
        "durationRange not an object",
        JSON.stringify({ ...FULL, durationRange: "60+" }),
      ],
      [
        "durationRange with a non-number member",
        JSON.stringify({ ...FULL, durationRange: { min: "0", max: 60 } }),
      ],
      [
        "durationRange missing max",
        JSON.stringify({ ...FULL, durationRange: { min: 0 } }),
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
      ["missing field", JSON.stringify({ types: [], durations: [] })],
      // The pre-Task-4 (v1) shape: none of its fields overlap the current
      // validator's own field names, so it's rejected wholesale — the
      // point of the strict, per-field check rather than a partial merge.
      ["a v1-shaped record", JSON.stringify(V1_RECORD)],
    ])("%s", (_name, raw) => {
      store(raw);
      expect(loadLibraryFilters()).toStrictEqual(EMPTY_FILTERS);
    });
  });

  // Phase SF PR3: `query` is a NEW concept — a record from before it
  // upgrades in place to "" (the lastDone/source precedent), while a
  // present non-string still fails strict.
  it("upgrades a record with no query field to query: '' rather than rejecting it, and rejects a non-string query", () => {
    const { query: _q, ...noQuery } = FULL;
    void _q;
    sessionStorage.setItem(LIBRARY_FILTERS_KEY, JSON.stringify(noQuery));
    expect(loadLibraryFilters()).toStrictEqual({ ...FULL, query: "" });
    sessionStorage.setItem(
      LIBRARY_FILTERS_KEY,
      JSON.stringify({ ...FULL, query: 7 }),
    );
    expect(loadLibraryFilters()).toStrictEqual(EMPTY_FILTERS);
  });

  it("de-dupes duplicated types from a tampered value", () => {
    sessionStorage.setItem(
      LIBRARY_FILTERS_KEY,
      JSON.stringify({ ...FULL, types: ["AT", "AT", "O2"] }),
    );
    expect(loadLibraryFilters().types).toStrictEqual(["AT", "O2"]);
  });

  it("clamps and orders a tampered durationRange (fractions round, out-of-bounds clamp, a crossed pair collapses)", () => {
    sessionStorage.setItem(
      LIBRARY_FILTERS_KEY,
      JSON.stringify({ ...FULL, durationRange: { min: 500, max: -3.4 } }),
    );
    expect(loadLibraryFilters().durationRange).toStrictEqual({
      min: 0,
      max: 0,
    });
    sessionStorage.setItem(
      LIBRARY_FILTERS_KEY,
      JSON.stringify({ ...FULL, durationRange: { min: 24.6, max: 999 } }),
    );
    expect(loadLibraryFilters().durationRange).toStrictEqual({
      min: 25,
      max: 120,
    });
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
