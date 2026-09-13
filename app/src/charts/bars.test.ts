import { describe, expect, it } from "vitest";
import { layoutBars } from "./bars.js";

describe("layoutBars", () => {
  it("eight slots across 276 units: 34.5 each, bars capped at 24 and centred", () => {
    const slots = layoutBars(8, 276, 24);
    expect(slots).toHaveLength(8);
    expect(slots[0]).toStrictEqual({ x: 5.25, width: 24, centre: 17.25 });
    expect(slots[7]!.centre).toBeCloseTo(258.75, 6);
    expect(slots[7]!.x + slots[7]!.width).toBeCloseTo(270.75, 6);
  });

  it("a narrow slot shrinks the bar to the slot less the gap; zero count or width is empty", () => {
    expect(layoutBars(10, 100, 24)[0]).toStrictEqual({
      x: 3,
      width: 4,
      centre: 5,
    });
    expect(layoutBars(0, 100, 24)).toStrictEqual([]);
    expect(layoutBars(8, 0, 24)).toStrictEqual([]);
  });
});
