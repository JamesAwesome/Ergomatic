import { describe, it, expect } from "vitest";
import {
  formatRangeLabel,
  formatThumbValue,
  thumbValueText,
} from "./durationRangeLabel";

describe("formatRangeLabel (spec I-13, the four cells)", () => {
  it("names a bounded range, an open lower end, an open upper end, a point, and the unbounded sentinel", () => {
    expect(formatRangeLabel({ min: 25, max: 35 })).toBe("25–35′");
    expect(formatRangeLabel({ min: 0, max: 45 })).toBe("≤45′");
    expect(formatRangeLabel({ min: 60, max: 120 })).toBe("60′+");
    expect(formatRangeLabel({ min: 35, max: 35 })).toBe("35′");
    expect(formatRangeLabel({ min: 0, max: 120 })).toBe("ANY LENGTH");
  });
});

describe("thumb copy", () => {
  it("reads ANY at the bottom of the lower thumb, 120′+ at the top of the upper, minutes otherwise", () => {
    expect(formatThumbValue(0, "min")).toBe("ANY");
    expect(formatThumbValue(0, "max")).toBe("0′");
    expect(formatThumbValue(120, "max")).toBe("120′+");
    expect(formatThumbValue(120, "min")).toBe("120′");
    expect(formatThumbValue(25, "min")).toBe("25′");
  });

  it("gives the sentinels words for aria-valuetext", () => {
    expect(thumbValueText(0, "min")).toBe("any");
    expect(thumbValueText(120, "max")).toBe("no limit");
    expect(thumbValueText(25, "max")).toBe("25 minutes");
    expect(thumbValueText(0, "max")).toBe("0 minutes");
  });
});
