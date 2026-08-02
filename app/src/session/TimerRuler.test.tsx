import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TimerRuler, { rulerLabels, totalProgressPct } from "./TimerRuler";

describe("totalProgressPct", () => {
  it("is 0 at the very start (nothing elapsed)", () => {
    expect(totalProgressPct(3436, 3436)).toBe(0);
  });

  it("is 100 once everything is spent", () => {
    expect(totalProgressPct(0, 3436)).toBe(100);
  });

  it("computes the fraction ELAPSED, not remaining, for a partial run", () => {
    // 2936 left of 3436 total -> 500 elapsed -> 500/3436 * 100.
    expect(totalProgressPct(2936, 3436)).toBeCloseTo((500 / 3436) * 100, 6);
  });

  it("clamps at 0/100 rather than going negative or past 100", () => {
    expect(totalProgressPct(4000, 3436)).toBe(0); // more "left" than total
    expect(totalProgressPct(-100, 3436)).toBe(100);
  });

  it("returns 0 for a zero (or negative) total rather than dividing by zero", () => {
    expect(totalProgressPct(0, 0)).toBe(0);
    expect(totalProgressPct(5, -10)).toBe(0);
  });
});

describe("rulerLabels", () => {
  it("is always the three fixed fractions plus the rounded total minutes", () => {
    expect(rulerLabels(3436)).toStrictEqual(["¼", "½", "¾", "57′"]); // 3436/60=57.27 -> 57
  });

  it("rounds up when the fraction is at least .5", () => {
    expect(rulerLabels(3450)).toStrictEqual(["¼", "½", "¾", "58′"]); // 3450/60=57.5
  });
});

describe("TimerRuler (component)", () => {
  it("renders TOTAL LEFT in house duration format and every ruler tick", () => {
    render(<TimerRuler totalLeftSeconds={185} totalSeconds={3436} />);
    expect(screen.getByText("TOTAL LEFT")).toBeInTheDocument();
    expect(screen.getByText("3:05")).toBeInTheDocument(); // fmtDuration(185/60)
    expect(screen.getByText("¼")).toBeInTheDocument();
    expect(screen.getByText("½")).toBeInTheDocument();
    expect(screen.getByText("¾")).toBeInTheDocument();
    expect(screen.getByText("57′")).toBeInTheDocument();
  });
});
