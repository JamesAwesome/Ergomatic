import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TimerRuler, {
  MAX_NOTCH_BOUNDARIES,
  notchPercents,
  rulerLabels,
  totalProgressPct,
} from "./TimerRuler";
import type { IntervalBoundaries } from "./intervalBoundaries";

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

// --- The notched bar (design spec §5) --------------------------------------
//
// The arithmetic that produces `boundaries` lives in `intervalBoundaries.ts`
// and is tested there against real workouts; these are about what the bar
// DRAWS with it.

/** 5 intervals of 5:00 (4:00 work + 1:00 rest), 25:00 total — the spec's own
 *  `2 OF 5` session, whose interior boundaries land on exact quarters. */
const FIVE_OF_FIVE: IntervalBoundaries = {
  seconds: [300, 600, 900, 1200],
  predictedFrom: 0,
};
const TOTAL = 1500;

function notches(): HTMLElement[] {
  return Array.from(document.querySelectorAll(".timer-total-notch"));
}

function lefts(): string[] {
  return notches().map((n) => n.style.left);
}

describe("notchPercents — what the bar will actually draw", () => {
  it("scales each boundary against the session's own length", () => {
    expect(notchPercents(FIVE_OF_FIVE, TOTAL)).toStrictEqual([20, 40, 60, 80]);
  });

  it("draws nothing without the prop — today's quarter ruler, untouched", () => {
    expect(notchPercents(undefined, TOTAL)).toStrictEqual([]);
  });

  it("draws nothing for a single-interval session (no interior boundary)", () => {
    expect(
      notchPercents({ seconds: [], predictedFrom: null }, TOTAL),
    ).toStrictEqual([]);
  });

  it("draws nothing above the density threshold, and everything at it", () => {
    const at = Array.from({ length: MAX_NOTCH_BOUNDARIES }, (_, i) => i + 1);
    const over = Array.from(
      { length: MAX_NOTCH_BOUNDARIES + 1 },
      (_, i) => i + 1,
    );
    expect(MAX_NOTCH_BOUNDARIES).toBe(16);
    expect(
      notchPercents({ seconds: at, predictedFrom: null }, 100),
    ).toHaveLength(16);
    expect(
      notchPercents({ seconds: over, predictedFrom: null }, 100),
    ).toStrictEqual([]);
  });

  it("clamps a re-anchored boundary that overran the estimated session", () => {
    // A session whose measured past has already outrun its own estimate:
    // the bar is exhausted, and the notch says so at the right edge rather
    // than disappearing (which would make the count disagree with `N OF M`).
    expect(
      notchPercents({ seconds: [900, 1800], predictedFrom: null }, TOTAL),
    ).toStrictEqual([60, 100]);
  });

  it("draws nothing when there is no session length to scale against", () => {
    expect(notchPercents(FIVE_OF_FIVE, 0)).toStrictEqual([]);
  });
});

describe("TimerRuler — the notched bar", () => {
  it("draws 4 notches for a 5-interval session, at cumulative positions", () => {
    render(
      <TimerRuler
        totalLeftSeconds={TOTAL}
        totalSeconds={TOTAL}
        boundaries={FIVE_OF_FIVE}
      />,
    );
    expect(notches()).toHaveLength(4);
    expect(lefts()).toStrictEqual(["20%", "40%", "60%", "80%"]);
  });

  it("the notch count never disagrees with the interval caption", () => {
    // `2 OF 5` means five intervals means four interior boundaries. The
    // count is the caption's own arithmetic and nothing else: nine phases
    // produced these four numbers, and nine dots is the bar this replaced.
    const caption = 5;
    render(
      <TimerRuler
        totalLeftSeconds={TOTAL}
        totalSeconds={TOTAL}
        boundaries={FIVE_OF_FIVE}
      />,
    );
    expect(notches()).toHaveLength(caption - 1);
  });

  it("moves a completed interval's notch to where it actually ended", () => {
    // Interval 1 ran 20% long (288s of work instead of 240): its boundary
    // moves from 300s to 348s — 23.2% of the bar, not 20% — and the three
    // upcoming notches re-flow behind it by the same 48s.
    const { unmount } = render(
      <TimerRuler
        totalLeftSeconds={TOTAL}
        totalSeconds={TOTAL}
        boundaries={FIVE_OF_FIVE}
      />,
    );
    expect(lefts()[0]).toBe("20%");
    unmount();
    render(
      <TimerRuler
        totalLeftSeconds={TOTAL}
        totalSeconds={TOTAL}
        boundaries={{ seconds: [348, 648, 948, 1248], predictedFrom: 1 }}
      />,
    );
    // Percentages carry the same float tail the fill's own width does
    // (`width: 25.74626865671642%` in the committed fixtures), so these are
    // compared as numbers rather than as formatted strings.
    const moved = lefts().map((left) => Number.parseFloat(left));
    expect(moved[0]).toBeCloseTo(23.2, 10);
    expect(moved[1]).toBeCloseTo(43.2, 10);
    expect(moved[2]).toBeCloseTo(63.2, 10);
    expect(moved[3]).toBeCloseTo(83.2, 10);
    // Every upcoming notch moved by the SAME 48s (3.2% of 25:00), not by
    // its own — the spans ahead keep their estimated lengths.
    expect(moved[1]! - 40).toBeCloseTo(moved[0]! - 20, 10);
  });

  it("marks the estimated notches, and only them, as predicted", () => {
    render(
      <TimerRuler
        totalLeftSeconds={TOTAL}
        totalSeconds={TOTAL}
        boundaries={{ seconds: [348, 648, 948, 1248], predictedFrom: 1 }}
      />,
    );
    expect(notches().map((n) => n.dataset.predicted)).toStrictEqual([
      undefined,
      "true",
      "true",
      "true",
    ]);
  });

  it("marks every notch predicted before anything has been measured, and none once everything has", () => {
    const { unmount } = render(
      <TimerRuler
        totalLeftSeconds={TOTAL}
        totalSeconds={TOTAL}
        boundaries={FIVE_OF_FIVE}
      />,
    );
    expect(notches().every((n) => n.dataset.predicted === "true")).toBe(true);
    unmount();
    render(
      <TimerRuler
        totalLeftSeconds={TOTAL}
        totalSeconds={TOTAL}
        boundaries={{ seconds: [300, 600, 900, 1200], predictedFrom: null }}
      />,
    );
    expect(notches().every((n) => n.dataset.predicted === undefined)).toBe(
      true,
    );
  });

  it("cuts the notches the fill has passed out of it, and inks the ones ahead", () => {
    // 40% elapsed of a 25:00 session: the 20% and 40% notches are behind the
    // fill (which is `--ink` on the connected pane — an ink hairline there
    // would be invisible), the 60% and 80% ones are on the open track.
    render(
      <TimerRuler
        totalLeftSeconds={900}
        totalSeconds={TOTAL}
        boundaries={FIVE_OF_FIVE}
      />,
    );
    expect(
      notches().map((n) => n.classList.contains("timer-total-notch-passed")),
    ).toStrictEqual([true, true, false, false]);
  });

  it("stops notching at an unpriceable interval, and draws no ruler ticks either way", () => {
    // The honest stop: two boundaries survive, and because the bar IS
    // notched the quarter ruler stays gone — the fallback is all-or-nothing.
    render(
      <TimerRuler
        totalLeftSeconds={TOTAL}
        totalSeconds={TOTAL}
        boundaries={{ seconds: [300, 600], predictedFrom: 0 }}
      />,
    );
    expect(notches()).toHaveLength(2);
    expect(document.querySelector(".timer-ruler")).toBeNull();
  });

  it("the notched bar REPLACES the quarter ruler", () => {
    render(
      <TimerRuler
        totalLeftSeconds={TOTAL}
        totalSeconds={TOTAL}
        boundaries={FIVE_OF_FIVE}
      />,
    );
    expect(document.querySelector(".timer-ruler")).toBeNull();
    expect(screen.queryByText("¼")).toBeNull();
    // TOTAL LEFT itself is untouched.
    expect(screen.getByText("TOTAL LEFT")).toBeInTheDocument();
    expect(screen.getByText("25:00")).toBeInTheDocument();
  });

  it("a single-interval session keeps the ¼/½/¾ ruler and draws no notches", () => {
    render(
      <TimerRuler
        totalLeftSeconds={1200}
        totalSeconds={1200}
        boundaries={{ seconds: [], predictedFrom: null }}
      />,
    );
    expect(notches()).toHaveLength(0);
    expect(screen.getByText("¼")).toBeInTheDocument();
    expect(screen.getByText("20′")).toBeInTheDocument();
  });

  it("more than 16 boundaries falls back to the quarter ruler with no notches", () => {
    const seconds = Array.from(
      { length: MAX_NOTCH_BOUNDARIES + 1 },
      (_, i) => (i + 1) * 100,
    );
    render(
      <TimerRuler
        totalLeftSeconds={1800}
        totalSeconds={1800}
        boundaries={{ seconds, predictedFrom: null }}
      />,
    );
    expect(notches()).toHaveLength(0);
    expect(screen.getByText("¾")).toBeInTheDocument();
  });

  it("draws the last count that still clears the density floor", () => {
    const seconds = Array.from(
      { length: MAX_NOTCH_BOUNDARIES },
      (_, i) => (i + 1) * 100,
    );
    render(
      <TimerRuler
        totalLeftSeconds={1800}
        totalSeconds={1800}
        boundaries={{ seconds, predictedFrom: null }}
      />,
    );
    expect(notches()).toHaveLength(16);
    expect(document.querySelector(".timer-ruler")).toBeNull();
  });

  it("without the prop the bar is exactly what it was: fill plus quarter ruler", () => {
    render(<TimerRuler totalLeftSeconds={185} totalSeconds={3436} />);
    expect(notches()).toHaveLength(0);
    expect(document.querySelectorAll(".timer-ruler-tick")).toHaveLength(4);
  });
});
