import { describe, expect, it } from "vitest";
import { polylinePoints } from "./line.js";
import { linearScale } from "./scale.js";

describe("polylinePoints", () => {
  it("maps each point through both scales, one decimal, space-separated", () => {
    const x = linearScale({ domain: [0, 10], range: [0, 100] });
    const y = linearScale({ domain: [0, 1], range: [50, 0], invert: false });
    expect(
      polylinePoints(
        [
          { x: 0, y: 0 },
          { x: 5, y: 0.5 },
          { x: 10, y: 1 },
        ],
        x,
        y,
      ),
    ).toBe("0.0,50.0 50.0,25.0 100.0,0.0");
    expect(polylinePoints([], x, y)).toBe("");
  });
});
