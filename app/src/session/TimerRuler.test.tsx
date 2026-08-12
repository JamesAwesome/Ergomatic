import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TimerRuler, {
  MAX_NOTCH_BOUNDARIES,
  notchPercents,
  rulerLabels,
  totalProgressPct,
  warmupFillPercent,
  warmupPercent,
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
  warmupEndsAt: null,
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
      notchPercents(
        { seconds: [], predictedFrom: null, warmupEndsAt: null },
        TOTAL,
      ),
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
      notchPercents(
        { seconds: at, predictedFrom: null, warmupEndsAt: null },
        100,
      ),
    ).toHaveLength(16);
    expect(
      notchPercents(
        { seconds: over, predictedFrom: null, warmupEndsAt: null },
        100,
      ),
    ).toStrictEqual([]);
  });

  it("clamps a re-anchored boundary that overran the estimated session", () => {
    // A session whose measured past has already outrun its own estimate:
    // the bar is exhausted, and the notch says so at the right edge rather
    // than disappearing (which would make the count disagree with `N OF M`).
    expect(
      notchPercents(
        { seconds: [900, 1800], predictedFrom: null, warmupEndsAt: null },
        TOTAL,
      ),
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
        boundaries={{
          seconds: [348, 648, 948, 1248],
          predictedFrom: 1,
          warmupEndsAt: null,
        }}
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
        boundaries={{
          seconds: [348, 648, 948, 1248],
          predictedFrom: 1,
          warmupEndsAt: null,
        }}
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
        boundaries={{
          seconds: [300, 600, 900, 1200],
          predictedFrom: null,
          warmupEndsAt: null,
        }}
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

  it("pulls a clamped notch back inside its own bar, and only that one", () => {
    // task-4-review.md M-4: `left: 100%` puts a 1px child's LEFT edge on the
    // bar's right edge, so the hairline would paint outside the box.
    render(
      <TimerRuler
        totalLeftSeconds={0}
        totalSeconds={TOTAL}
        boundaries={{
          seconds: [900, 1800],
          predictedFrom: null,
          warmupEndsAt: null,
        }}
      />,
    );
    expect(
      notches().map((n) => n.classList.contains("timer-total-notch-end")),
    ).toStrictEqual([false, true]);
    expect(lefts()).toStrictEqual(["60%", "100%"]);
  });

  it("stops notching at an unpriceable interval, and draws no ruler ticks either way", () => {
    // The honest stop: two boundaries survive, and because the bar IS
    // notched the quarter ruler stays gone — the fallback is all-or-nothing.
    render(
      <TimerRuler
        totalLeftSeconds={TOTAL}
        totalSeconds={TOTAL}
        boundaries={{
          seconds: [300, 600],
          predictedFrom: 0,
          warmupEndsAt: null,
        }}
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
        boundaries={{ seconds: [], predictedFrom: null, warmupEndsAt: null }}
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
        boundaries={{ seconds, predictedFrom: null, warmupEndsAt: null }}
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
        boundaries={{ seconds, predictedFrom: null, warmupEndsAt: null }}
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

// --- The warm-up's own fill (design spec §5b) ------------------------------
//
// §5b: "Its span is proportionally real, but the leading chunk renders in
// the UNFILLED-track tone rather than the working tone, so the structure
// reads 'this part is not the work'. No new colour, no legend."
//
// AMENDED BY JAMES, 2026-08-12, after seeing the first reading rendered: the
// warm-up span FILLS as it is rowed, in its own tone — "the bar should move
// while the rower is moving, and the warm-up should still read as visibly
// not-work". Three tones: unfilled track, warm-up fill, work fill. So the
// element below is the FILL's own colour while the fill is inside the
// warm-up, capped at the warm-up's span — not a block painted over the whole
// span regardless of progress.

/** The same 5-interval, 25:00 session, except interval 0 is an 8:00 warm-up:
 *  480 of 1500 seconds is 32% of the bar. */
const WITH_WARMUP: IntervalBoundaries = {
  seconds: [480, 780, 1080, 1380],
  predictedFrom: 0,
  warmupEndsAt: 480,
};

function warmupFill(): HTMLElement | null {
  return document.querySelector(".timer-total-warmup");
}

function barChildren(): string[] {
  const bar = document.querySelector(".timer-total-bar")!;
  return Array.from(bar.children).map(
    (c) => c.className || c.tagName.toLowerCase(),
  );
}

describe("warmupPercent — how much of the bar is not the work", () => {
  it("scales the warm-up's own span against the session's length", () => {
    expect(warmupPercent(WITH_WARMUP, TOTAL)).toBe(32);
  });

  it("is null when the session has no warm-up", () => {
    expect(warmupPercent(FIVE_OF_FIVE, TOTAL)).toBeNull();
  });

  it("is null without the prop, and without a length to scale against", () => {
    expect(warmupPercent(undefined, TOTAL)).toBeNull();
    expect(warmupPercent(WITH_WARMUP, 0)).toBeNull();
  });

  it("clamps a warm-up that overran the estimated session", () => {
    // The same overrun `notchPercents` clamps, for the same reason: the past
    // is measured and the denominator is not.
    expect(
      warmupPercent({ ...WITH_WARMUP, warmupEndsAt: TOTAL + 600 }, TOTAL),
    ).toBe(100);
  });
});

describe("warmupFillPercent — the warm-up fills as it is rowed", () => {
  it("is the fill edge while the rower is inside the warm-up", () => {
    // 10% of the session elapsed, all of it inside a 32% warm-up: the bar
    // has moved 10%, and every bit of that movement is warm-up tone.
    expect(warmupFillPercent(WITH_WARMUP, TOTAL, 10)).toBe(10);
    expect(warmupFillPercent(WITH_WARMUP, TOTAL, 31.9)).toBe(31.9);
  });

  it("stops at the warm-up's own span once the work has started", () => {
    // Past the warm-up the chunk stops growing and the WORK fill carries on
    // beyond it — the span is a cap, not a width.
    expect(warmupFillPercent(WITH_WARMUP, TOTAL, 60)).toBe(32);
    expect(warmupFillPercent(WITH_WARMUP, TOTAL, 100)).toBe(32);
  });

  it("draws nothing before the first stroke", () => {
    // A bar at 0% is the empty track it has always been.
    expect(warmupFillPercent(WITH_WARMUP, TOTAL, 0)).toBeNull();
    expect(warmupFillPercent(WITH_WARMUP, TOTAL, -5)).toBeNull();
  });

  it("draws nothing when there is no warm-up, however far the fill has run", () => {
    expect(warmupFillPercent(FIVE_OF_FIVE, TOTAL, 60)).toBeNull();
    expect(warmupFillPercent(undefined, TOTAL, 60)).toBeNull();
    expect(warmupFillPercent(WITH_WARMUP, 0, 60)).toBeNull();
  });
});

describe("TimerRuler — the warm-up is not the work", () => {
  it("grows the warm-up's own fill as the rower rows it", () => {
    // 250s of the 1500s session elapsed — 16.67%, still inside the 32%
    // warm-up. The bar has moved, and every pixel of that movement is the
    // warm-up's own tone.
    render(
      <TimerRuler
        totalLeftSeconds={TOTAL - 250}
        totalSeconds={TOTAL}
        boundaries={WITH_WARMUP}
      />,
    );
    const fill = warmupFill();
    expect(fill).not.toBeNull();
    expect(Number.parseFloat(fill!.style.width)).toBeCloseTo(16.667, 3);
    // …and the work fill underneath is the same width, so nothing of the
    // working tone is showing yet.
    const work = document.querySelector<HTMLElement>(".timer-total-bar span")!;
    expect(Number.parseFloat(work.style.width)).toBeCloseTo(16.667, 3);
    // Decoration, not information: the caption says WARM-UP in words.
    expect(fill!.getAttribute("aria-hidden")).toBe("true");
  });

  it("caps the warm-up's fill at its span once the work is running", () => {
    // At 60% elapsed the warm-up tone stops at 32% and the remaining 28% of
    // the fill is the ordinary work tone — three tones on one bar.
    render(
      <TimerRuler
        totalLeftSeconds={600}
        totalSeconds={TOTAL}
        boundaries={WITH_WARMUP}
      />,
    );
    expect(warmupFill()!.style.width).toBe("32%");
    expect(warmupFill()!.className).toBe("timer-total-warmup");
    const work = document.querySelector<HTMLElement>(".timer-total-bar span")!;
    expect(work.style.width).toBe("60%");
  });

  it("draws no warm-up fill at all before the first stroke", () => {
    render(
      <TimerRuler
        totalLeftSeconds={TOTAL}
        totalSeconds={TOTAL}
        boundaries={WITH_WARMUP}
      />,
    );
    expect(warmupFill()).toBeNull();
    expect(
      document.querySelector<HTMLElement>(".timer-total-bar span")!.style.width,
    ).toBe("0%");
  });

  it("paints the warm-up's fill OVER the work fill and UNDER the notches", () => {
    // DOM order is paint order here — every child is in the same
    // relatively-positioned bar — so the fill comes first, the warm-up's own
    // tone over its leading part, and the boundary hairlines last where
    // nothing can bury them.
    render(
      <TimerRuler
        totalLeftSeconds={600}
        totalSeconds={TOTAL}
        boundaries={WITH_WARMUP}
      />,
    );
    const classes = barChildren();
    expect(classes[0]).toBe("span"); // the work fill, the bar's only <span>
    expect(classes[1]).toBe("timer-total-warmup");
    expect(classes).toHaveLength(6); // fill + warm-up fill + 4 notches
    expect(
      classes.slice(2).every((c) => c.startsWith("timer-total-notch")),
    ).toBe(true);
  });

  it("a session with NO warm-up draws no chunk at all", () => {
    // THE REGRESSION PIN. Most sessions have none, and their bar is exactly
    // the one Task 4 shipped: the fill and its notches, nothing between.
    render(
      <TimerRuler
        totalLeftSeconds={600}
        totalSeconds={TOTAL}
        boundaries={FIVE_OF_FIVE}
      />,
    );
    expect(warmupFill()).toBeNull();
    expect(barChildren()).toStrictEqual([
      "span",
      // 60% elapsed: the 20/40/60 notches are behind the fill, the 80 ahead.
      "timer-total-notch timer-total-notch-passed",
      "timer-total-notch timer-total-notch-passed",
      "timer-total-notch timer-total-notch-passed",
      "timer-total-notch",
    ]);
  });

  it("fills the warm-up even where the notches fall back to the quarter ruler", () => {
    // The density fallback is about reading seventeen hairlines apart. It
    // says nothing about whether the warm-up is the work, and a rower on a
    // 17-interval session still deserves to be told.
    const seconds = Array.from(
      { length: MAX_NOTCH_BOUNDARIES + 1 },
      (_, i) => (i + 1) * 80,
    );
    render(
      <TimerRuler
        totalLeftSeconds={TOTAL - 150}
        totalSeconds={TOTAL}
        boundaries={{ seconds, predictedFrom: null, warmupEndsAt: 300 }}
      />,
    );
    expect(notches()).toHaveLength(0);
    // 150s rowed of a 300s warm-up: half of a 20% span.
    expect(warmupFill()!.style.width).toBe("10%");
  });
});
