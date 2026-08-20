import { describe, it, expect } from "vitest";
import { chooseTicks, formatTick } from "./axis.js";
import { fmtSplit } from "../../domain/format.js";

describe("chooseTicks", () => {
  it("returns round values that fall inside the domain", () => {
    const ticks = chooseTicks([85, 115], 4);
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(85);
      expect(t).toBeLessThanOrEqual(115);
    }
    // Ticks land on a clean step (a "round" number), not an arbitrary
    // division of the domain.
    expect(ticks.length).toBeGreaterThan(1);
    const step = ticks[1] - ticks[0];
    const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100];
    expect(niceSteps).toContain(step);
  });

  it("returns an empty array for a degenerate or backwards domain", () => {
    expect(chooseTicks([10, 10], 4)).toStrictEqual([]);
    expect(chooseTicks([10, 5], 4)).toStrictEqual([]);
  });

  it("returns an empty array for a non-positive tick count", () => {
    expect(chooseTicks([0, 100], 0)).toStrictEqual([]);
  });

  it("produces ticks that increase monotonically with no duplicates", () => {
    const ticks = chooseTicks([0, 254], 5); // hr domain, 20..254 bpm band
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });

  // The four cases below walk the "nice number" step selector's full
  // fraction range (< 1.5, < 3, < 7, else) so every rounding branch is
  // exercised, not just whichever one the earlier domains happened to hit.
  it("rounds a raw step with fraction < 1.5 to a step of 1x", () => {
    const ticks = chooseTicks([0, 20], 3); // raw step 10, fraction 1 -> step 10
    expect(ticks).toStrictEqual([0, 10, 20]);
  });

  it("rounds a raw step with fraction in [1.5, 3) up to a step of 2x", () => {
    const ticks = chooseTicks([0, 50], 3); // raw step 25, fraction 2.5 -> step 20
    expect(ticks).toStrictEqual([0, 20, 40]);
  });

  it("rounds a raw step with fraction in [3, 7) up to a step of 5x", () => {
    const ticks = chooseTicks([0, 254], 5); // raw step 63.5, fraction 6.35 -> step 50
    expect(ticks).toStrictEqual([0, 50, 100, 150, 200, 250]);
  });

  it("rounds a raw step with fraction >= 7 up to a step of 10x", () => {
    const ticks = chooseTicks([0, 900], 2); // raw step 900, fraction 9 -> step 1000
    expect(ticks).toStrictEqual([0]); // only one multiple of 1000 lands in [0, 900]
  });
});

describe("formatTick", () => {
  it("formats a pace tick with the house fmtSplit formatter, never a bespoke one", () => {
    expect(formatTick(130, "pace")).toBe("2:10.0");
    expect(formatTick(130, "pace")).toBe(fmtSplit(130));
  });

  it("formats a rate tick as a rounded stroke-rate number", () => {
    expect(formatTick(28.4, "rate")).toBe("28");
    expect(formatTick(28.6, "rate")).toBe("29");
  });

  it("formats an hr tick as a rounded bpm number", () => {
    expect(formatTick(150.5, "hr")).toBe("151");
  });
});
