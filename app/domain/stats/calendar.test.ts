import { describe, expect, it } from "vitest";
import {
  addDays,
  fmtDate,
  parseDate,
  compareDates,
  customRange,
  fromDayNumber,
  inRange,
  presetRange,
  seasonOf,
  toDayNumber,
} from "./calendar.js";

// Every pin is an INDEPENDENT { y, m, d } literal (RF21): nothing here
// derives an expected value from the function under test.
describe("calendar — pure { y, m, d } arithmetic (spec §3.3, invariant 14)", () => {
  it("day numbers round-trip across a leap day and a century boundary", () => {
    expect(toDayNumber({ y: 1970, m: 1, d: 1 })).toBe(0);
    expect(fromDayNumber(toDayNumber({ y: 2024, m: 2, d: 29 }))).toStrictEqual({
      y: 2024,
      m: 2,
      d: 29,
    });
    expect(addDays({ y: 2024, m: 2, d: 28 }, 1)).toStrictEqual({
      y: 2024,
      m: 2,
      d: 29,
    });
    expect(addDays({ y: 2100, m: 2, d: 28 }, 1)).toStrictEqual({
      y: 2100,
      m: 3,
      d: 1,
    });
    expect(addDays({ y: 2026, m: 9, d: 12 }, -29)).toStrictEqual({
      y: 2026,
      m: 8,
      d: 14,
    });
  });

  it("season: Apr 30 belongs to the season named by that year, May 1 to the next (named by END year)", () => {
    expect(seasonOf({ y: 2026, m: 4, d: 30 })).toStrictEqual({
      start: { y: 2025, m: 5, d: 1 },
      end: { y: 2026, m: 4, d: 30 },
      name: 2026,
    });
    expect(seasonOf({ y: 2026, m: 5, d: 1 }).name).toBe(2027);
    expect(seasonOf({ y: 2026, m: 5, d: 1 }).start).toStrictEqual({
      y: 2026,
      m: 5,
      d: 1,
    });
  });

  it("a range is inclusive at both ends and null is unbounded", () => {
    const r = { from: { y: 2026, m: 8, d: 14 }, to: { y: 2026, m: 9, d: 12 } };
    expect(inRange({ y: 2026, m: 8, d: 14 }, r)).toBe(true);
    expect(inRange({ y: 2026, m: 9, d: 12 }, r)).toBe(true);
    expect(inRange({ y: 2026, m: 8, d: 13 }, r)).toBe(false);
    expect(inRange({ y: 2026, m: 9, d: 13 }, r)).toBe(false);
    expect(inRange({ y: 1999, m: 1, d: 1 }, { from: null, to: null })).toBe(
      true,
    );
    expect(
      compareDates({ y: 2026, m: 1, d: 1 }, { y: 2025, m: 12, d: 31 }),
    ).toBeGreaterThan(0);
  });

  it("presets for today = 2026-09-12: season from May 1, year from Jan 1, month from the 1st, 30 days from Aug 14", () => {
    const today = { y: 2026, m: 9, d: 12 };
    expect(presetRange("all", today)).toStrictEqual({ from: null, to: null });
    expect(presetRange("season", today)).toStrictEqual({
      from: { y: 2026, m: 5, d: 1 },
      to: today,
    });
    expect(presetRange("year", today)).toStrictEqual({
      from: { y: 2026, m: 1, d: 1 },
      to: today,
    });
    expect(presetRange("month", today)).toStrictEqual({
      from: { y: 2026, m: 9, d: 1 },
      to: today,
    });
    expect(presetRange("30d", today)).toStrictEqual({
      from: { y: 2026, m: 8, d: 14 },
      to: today,
    });
  });

  it("custom: from ≤ to is a range (equal is one day); from > to is null", () => {
    const d = { y: 2026, m: 9, d: 12 };
    expect(customRange(d, d)).toStrictEqual({ from: d, to: d });
    expect(customRange({ y: 2026, m: 9, d: 13 }, d)).toBeNull();
  });
});

describe("parseDate / fmtDate — the one YYYY-MM-DD pair (spec §3: the domain never parses a date it did not write)", () => {
  it("round-trips the input format and refuses anything else", () => {
    expect(parseDate("2026-08-14")).toStrictEqual({ y: 2026, m: 8, d: 14 });
    expect(fmtDate({ y: 2026, m: 8, d: 4 })).toBe("2026-08-04");
    expect(parseDate("")).toBeNull(); // a cleared <input type="date">
    expect(parseDate("2026-9-1")).toBeNull(); // not the input's own format
    expect(parseDate("2026-09-01T00:00:00Z")).toBeNull();
  });
});
