import { describe, expect, it } from "vitest";
import {
  addDays,
  fmtDate,
  parseDate,
  compareDates,
  customRange,
  dayOfWeek,
  firstOfMonth,
  fromDayNumber,
  lastOfMonth,
  mondayOf,
  monthStarts,
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

  it("custom: from ≤ to is a range (equal is one day); from > to is null; a TO after today is clamped to today, the ONE owner of that clamp", () => {
    const d = { y: 2026, m: 9, d: 12 };
    expect(customRange(d, d, d)).toStrictEqual({ from: d, to: d });
    expect(customRange({ y: 2026, m: 9, d: 13 }, d, d)).toBeNull();
    // A typed 2026-12-31 admits no row (none is dated after today) and
    // would re-anchor nothing: the range ends today.
    expect(
      customRange({ y: 2026, m: 8, d: 14 }, { y: 2026, m: 12, d: 31 }, d),
    ).toStrictEqual({ from: { y: 2026, m: 8, d: 14 }, to: d });
    // Both ends in the future: FROM follows the clamped TO — the order
    // problem, not an empty future range.
    expect(
      customRange({ y: 2026, m: 12, d: 1 }, { y: 2026, m: 12, d: 31 }, d),
    ).toBeNull();
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

describe("weeks and months (spec §3.3: a week starts Monday)", () => {
  it("mondayOf: Sunday 2026-09-13 → 09-07; Monday 2026-09-14 → itself; Friday 2026-08-14 → 08-10", () => {
    expect(mondayOf({ y: 2026, m: 9, d: 13 })).toStrictEqual({
      y: 2026,
      m: 9,
      d: 7,
    });
    expect(mondayOf({ y: 2026, m: 9, d: 14 })).toStrictEqual({
      y: 2026,
      m: 9,
      d: 14,
    });
    expect(mondayOf({ y: 2026, m: 8, d: 14 })).toStrictEqual({
      y: 2026,
      m: 8,
      d: 10,
    });
    expect(dayOfWeek({ y: 1970, m: 1, d: 1 })).toBe(4); // a Thursday
    expect(dayOfWeek({ y: 1969, m: 12, d: 28 })).toBe(0); // a Sunday, before day 0
  });

  it("lastOfMonth handles February, a leap year and December; monthStarts spans inclusive months", () => {
    expect(lastOfMonth({ y: 2026, m: 2, d: 3 })).toStrictEqual({
      y: 2026,
      m: 2,
      d: 28,
    });
    expect(lastOfMonth({ y: 2028, m: 2, d: 3 })).toStrictEqual({
      y: 2028,
      m: 2,
      d: 29,
    });
    expect(lastOfMonth({ y: 2026, m: 12, d: 3 })).toStrictEqual({
      y: 2026,
      m: 12,
      d: 31,
    });
    expect(
      monthStarts({ y: 2025, m: 11, d: 22 }, { y: 2026, m: 1, d: 17 }),
    ).toStrictEqual([
      { y: 2025, m: 11, d: 1 },
      { y: 2025, m: 12, d: 1 },
      { y: 2026, m: 1, d: 1 },
    ]);
    expect(
      monthStarts({ y: 2026, m: 9, d: 2 }, { y: 2026, m: 9, d: 11 }),
    ).toStrictEqual([{ y: 2026, m: 9, d: 1 }]);
    expect(firstOfMonth({ y: 2026, m: 9, d: 11 })).toStrictEqual({
      y: 2026,
      m: 9,
      d: 1,
    });
  });
});
