import { describe, expect, it } from "vitest";
import { presetRange } from "./calendar.js";
import { GATE0_ROWS, GATE0_TODAY } from "./gate0Seed.js";
import { metresPerWeek } from "./weekly.js";

// Every expected series is `compute.mjs`'s printout or hand arithmetic over
// the seed's dates, typed as independent literals (RF21).
describe("metresPerWeek — eight Monday-start weeks ending at the range's last day (spec §3.2, §5 item 3)", () => {
  it("ALL for the seed: 0 · 0 · 10,000 · 0 · 0 · 13,000 · 3,000 · 2,000 for the weeks of 2026-07-20 … 09-07, only the last current, none out of range", () => {
    const bars = metresPerWeek(
      GATE0_ROWS,
      presetRange("all", GATE0_TODAY),
      GATE0_TODAY,
    );
    expect(bars.map((b) => b.meters)).toStrictEqual([
      0, 0, 10000, 0, 0, 13000, 3000, 2000,
    ]);
    expect(bars[0]!.weekStart).toStrictEqual({ y: 2026, m: 7, d: 20 });
    expect(bars[7]!.weekStart).toStrictEqual({ y: 2026, m: 9, d: 7 });
    expect(bars.map((b) => b.current)).toStrictEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(bars.every((b) => !b.outOfRange)).toBe(true);
  });

  it("30 DAYS (from 08-14): the three weeks before the week of Aug 10 are out of range with 0 m; the week containing FROM is in range though FROM is a Friday", () => {
    const bars = metresPerWeek(
      GATE0_ROWS,
      presetRange("30d", GATE0_TODAY),
      GATE0_TODAY,
    );
    expect(bars.map((b) => b.outOfRange)).toStrictEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    // R9 (Aug 3, 10,000 m) is outside the range: its week reads 0.
    expect(bars.map((b) => b.meters)).toStrictEqual([
      0, 0, 0, 0, 0, 13000, 3000, 2000,
    ]);
  });

  it("a CUSTOM range ending before this week anchors on TO: June 1-30 draws the weeks of May 11 … Jun 29, no bar current, the May weeks out of range", () => {
    const bars = metresPerWeek(
      GATE0_ROWS,
      { from: { y: 2026, m: 6, d: 1 }, to: { y: 2026, m: 6, d: 30 } },
      GATE0_TODAY,
    );
    expect(bars[0]!.weekStart).toStrictEqual({ y: 2026, m: 5, d: 11 });
    expect(bars[7]!.weekStart).toStrictEqual({ y: 2026, m: 6, d: 29 });
    expect(bars.every((b) => !b.current)).toBe(true);
    expect(bars.map((b) => b.outOfRange)).toStrictEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    // R6 (Jun 2, 2,000) in the week of Jun 1; R7 (Jun 21, 3,012) in Jun 15.
    expect(bars.map((b) => b.meters)).toStrictEqual([
      0, 0, 0, 2000, 0, 3012, 0, 0,
    ]);
  });

  it("a CUSTOM TO after today anchors on today: Sep 1 … Oct 12 draws the weeks ending Sep 7, the last bar current, no future bar", () => {
    const bars = metresPerWeek(
      GATE0_ROWS,
      { from: { y: 2026, m: 9, d: 1 }, to: { y: 2026, m: 10, d: 12 } },
      GATE0_TODAY,
    );
    expect(bars[7]!.weekStart).toStrictEqual({ y: 2026, m: 9, d: 7 });
    expect(bars[7]!.current).toBe(true);
    expect(bars.map((b) => b.meters)).toStrictEqual([
      0, 0, 0, 0, 0, 0, 3000, 2000,
    ]);
  });

  it("a row dated today lands in the current bar: 2,000 m on 2026-09-12 makes the last bar 4,000", () => {
    const rows = [
      ...GATE0_ROWS,
      { ...GATE0_ROWS[12]!, id: "today", date: { y: 2026, m: 9, d: 12 } },
    ];
    const bars = metresPerWeek(
      rows,
      presetRange("all", GATE0_TODAY),
      GATE0_TODAY,
    );
    expect(bars[7]!.meters).toBe(4000);
  });

  it("a null-metres row adds 0 and no week is dropped for it", () => {
    const rows = [{ ...GATE0_ROWS[12]!, workMeters: null }];
    const bars = metresPerWeek(rows, { from: null, to: null }, GATE0_TODAY);
    expect(bars).toHaveLength(8);
    expect(bars[7]!.meters).toBe(0);
  });
});
