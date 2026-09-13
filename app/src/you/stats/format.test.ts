import { describe, expect, it } from "vitest";
import { fmtDate, fmtMeters, fmtPercent, fmtSeconds } from "./format";

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
