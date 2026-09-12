import { describe, expect, it } from "vitest";
import { fmtDate, fmtMeters, fmtPercent, fmtSeconds, seamLine } from "./format";

// Spec §14 ruling 15 pins both forms of the seam line; the screen test only
// ever renders the singular (the seed has one stored-tier row, R1), so the
// plural arm lives here with independent literals.
describe("stats formatters", () => {
  it("seamLine is singular at one row and plural above", () => {
    expect(seamLine(1)).toBe(
      "1 ROW PREDATES WORK-ONLY TOTALS · NOT IN AVG WATTS",
    );
    expect(seamLine(2)).toBe(
      "2 ROWS PREDATE WORK-ONLY TOTALS · NOT IN AVG WATTS",
    );
    expect(seamLine(13)).toBe(
      "13 ROWS PREDATE WORK-ONLY TOTALS · NOT IN AVG WATTS",
    );
  });

  it("metres take thousands separators, seconds the house clock, shares a whole percent, dates ISO", () => {
    expect(fmtMeters(56752)).toBe("56,752");
    expect(fmtMeters(718)).toBe("718");
    expect(fmtSeconds(14379.3)).toBe("3:59:39");
    expect(fmtSeconds(822.6)).toBe("13:43");
    expect(fmtPercent(0.0572)).toBe("6%");
    expect(fmtDate({ y: 2026, m: 8, d: 4 })).toBe("2026-08-04");
  });
});
