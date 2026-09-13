import { describe, expect, it } from "vitest";
import type { CalendarDate } from "../../../domain/stats/calendar.js";
import {
  fmtDate,
  fmtDayMonth,
  fmtMeters,
  fmtMonth,
  fmtPercent,
  fmtRangeLine,
  fmtSeconds,
} from "./format";

describe("stats formatters", () => {
  it("metres take thousands separators, seconds the house clock, shares a whole percent, dates ISO", () => {
    expect(fmtMeters(56752)).toBe("56,752");
    expect(fmtMeters(718)).toBe("718");
    // A float sum reaches the formatter (1000.3000000000001 from two
    // rounded-elsewhere rows); it rounds defensively rather than printing
    // the tail.
    expect(fmtMeters(1000.3000000000001)).toBe("1,000");
    expect(fmtMeters(299.9)).toBe("300");
    expect(fmtSeconds(14379.3)).toBe("3:59:39");
    expect(fmtSeconds(822.6)).toBe("13:43");
    expect(fmtPercent(0.0572)).toBe("6%");
    expect(fmtDate({ y: 2026, m: 8, d: 4 })).toBe("2026-08-04");
  });
});

// §14 ruling 21 (variant A, every preset), today = 2026-09-12, Gate 0 seed.
describe("fmtRangeLine — the days the totals cover", () => {
  const today = { y: 2026, m: 9, d: 12 };
  it("ALL: ALL TIME · SINCE 8 NOV 2025 (the earliest row); null with no row", () => {
    expect(
      fmtRangeLine({ from: null, to: null }, { y: 2025, m: 11, d: 8 }),
    ).toBe("ALL TIME · SINCE 8 NOV 2025");
    expect(fmtRangeLine({ from: null, to: null }, null)).toBeNull();
  });
  it("SEASON 1 MAY TO 12 SEP 2026 · YEAR 1 JAN TO 12 SEP 2026 · MONTH 1 TO 12 SEP 2026 · 30 DAYS 14 AUG TO 12 SEP 2026", () => {
    const line = (from: CalendarDate) =>
      fmtRangeLine({ from, to: today }, null);
    expect(line({ y: 2026, m: 5, d: 1 })).toBe("1 MAY TO 12 SEP 2026");
    expect(line({ y: 2026, m: 1, d: 1 })).toBe("1 JAN TO 12 SEP 2026");
    expect(line({ y: 2026, m: 9, d: 1 })).toBe("1 TO 12 SEP 2026");
    expect(line({ y: 2026, m: 8, d: 14 })).toBe("14 AUG TO 12 SEP 2026");
  });
  it("across years both ends print in full: 8 NOV 2025 TO 12 SEP 2026; a one-day range reads 12 TO 12 SEP 2026", () => {
    expect(
      fmtRangeLine({ from: { y: 2025, m: 11, d: 8 }, to: today }, null),
    ).toBe("8 NOV 2025 TO 12 SEP 2026");
    expect(fmtRangeLine({ from: today, to: today }, null)).toBe(
      "12 TO 12 SEP 2026",
    );
    // A one-sided range has no producer (presetRange/customRange set both
    // ends): it reads as ALL rather than inventing a SINCE line.
    expect(
      fmtRangeLine({ from: today, to: null }, { y: 2025, m: 11, d: 8 }),
    ).toBe("ALL TIME · SINCE 8 NOV 2025");
  });
  it("fmtDayMonth and fmtMonth: 8 NOV, MAY", () => {
    expect(fmtDayMonth({ y: 2025, m: 11, d: 8 })).toBe("8 NOV");
    expect(fmtMonth({ y: 2026, m: 5, d: 1 })).toBe("MAY");
  });
});
