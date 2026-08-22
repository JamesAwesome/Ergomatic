// CR2 spec 3 task 3 (design spec §2A). This component is not mounted
// anywhere yet — task 4 wires it into `PaneLive` in place of `TimerRuler`
// — so every fixture here builds its own `IntervalBoundaries` rather than
// reading one off a rendered pane.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { compileProgram } from "../../../domain/monitor/program.js";
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index";
import { buildDraft } from "../../session/draft";
import { buildRun } from "../../session/engine";
import { totalSessionSecondsOf } from "../../session/Timer";
import { intervalBoundaries } from "../../session/intervalBoundaries";
import type { WorkoutType } from "../../../domain/types.js";
import ConnectedProgressBar, {
  MAX_NOTCH_BOUNDARIES,
  buildSegments,
  fallbackFillPercent,
  quarterTickLabels,
  segmentState,
} from "./ConnectedProgressBar";

const baselines = { k2Seconds: 112, k6Seconds: 122 };
const t0 = new Date("2026-08-07T09:00:00.000Z");

/** THE REALISTIC FIXTURE (repo rule): a real seeded library workout run
 *  through the real assembly, the same `libraryFixture` shape
 *  `surfaceModel.test.ts` uses. "Filling Low" with the warm-up preference
 *  OFF is 4 × 2000m with 3:00 rest, no warm-up phase — exactly the shape
 *  `intervalBoundaries` produces three interior boundaries for (four
 *  intervals, `boundaries.seconds.length === 3`). */
function libraryFixture(title: string) {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  const draft = buildDraft({
    id: title.toLowerCase().replace(/\s+/g, "-"),
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const phases = buildRun(draft, baselines, t0).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return phases;
}

const FILLING_LOW_PHASES = libraryFixture("Filling Low");
const FILLING_LOW_BOUNDARIES = intervalBoundaries(FILLING_LOW_PHASES);
const FILLING_LOW_TOTAL = totalSessionSecondsOf(FILLING_LOW_PHASES);

/** Three intervals, 600/120/60 — the brief's own example. Two interior
 *  boundaries: the first interval ends at 600, the second at 720; the
 *  third runs to the 780s total. */
const THREE: import("../../session/intervalBoundaries").IntervalBoundaries = {
  seconds: [600, 720],
  predictedFrom: null,
};
const THREE_TOTAL = 780;

function segEls(): HTMLElement[] {
  return Array.from(document.querySelectorAll(".connected-progress-seg"));
}

function segStates(): string[] {
  return segEls().map((el) => {
    const cls = Array.from(el.classList).find((c) =>
      c.startsWith("connected-progress-seg-"),
    );
    return cls?.replace("connected-progress-seg-", "") ?? "";
  });
}

function segFlexGrows(): string[] {
  return segEls().map((el) => el.style.flexGrow);
}

describe("the fixture is the shape this file claims", () => {
  it("Filling Low (no warm-up) is four intervals with three interior boundaries", () => {
    expect(FILLING_LOW_BOUNDARIES.seconds).toHaveLength(3);
    expect(FILLING_LOW_TOTAL).toBeGreaterThan(0);
  });
});

describe("MAX_NOTCH_BOUNDARIES", () => {
  it("is 16 (design spec §2A: 16 gapped segments stay >=18px even at 342px)", () => {
    expect(MAX_NOTCH_BOUNDARIES).toBe(16);
  });
});

describe("segmentState — the per-segment rule (design spec §2A/§2D)", () => {
  it("is upcoming for every segment at 0 elapsed, even the one starting at 0 (the armed frame)", () => {
    expect(segmentState(0, 600, 0)).toBe("upcoming");
  });

  it("is done once the segment's own end has passed", () => {
    expect(segmentState(0, 600, 600)).toBe("done"); // exactly at its own end
    expect(segmentState(0, 600, 700)).toBe("done");
  });

  it("is active for the segment elapsed currently sits inside, start inclusive", () => {
    expect(segmentState(600, 720, 600)).toBe("active"); // exactly at its start
    expect(segmentState(600, 720, 650)).toBe("active");
  });

  it("is upcoming for a segment elapsed has not reached yet", () => {
    expect(segmentState(720, 780, 650)).toBe("upcoming");
  });
});

describe("buildSegments — duration and edges from a boundaries array", () => {
  it("turns interior boundaries + the total into edge-to-edge segments", () => {
    const segs = buildSegments(THREE, THREE_TOTAL, 0);
    expect(segs.map((s) => [s.start, s.end, s.duration])).toStrictEqual([
      [0, 600, 600],
      [600, 720, 120],
      [720, 780, 60],
    ]);
  });

  it("a single-interval session (no interior boundary) is one segment", () => {
    const segs = buildSegments({ seconds: [], predictedFrom: null }, 1200, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ start: 0, end: 1200, duration: 1200 });
  });
});

describe("fallbackFillPercent", () => {
  it("is elapsed/total as a percentage", () => {
    expect(fallbackFillPercent(450, 1800)).toBe(25);
  });

  it("clamps at 0/100 and guards a zero total", () => {
    expect(fallbackFillPercent(-10, 1800)).toBe(0);
    expect(fallbackFillPercent(5000, 1800)).toBe(100);
    expect(fallbackFillPercent(10, 0)).toBe(0);
  });
});

describe("quarterTickLabels", () => {
  it("is the three fixed fractions plus the rounded total minutes", () => {
    expect(quarterTickLabels(1800)).toStrictEqual(["¼", "½", "¾", "30′"]);
  });
});

describe("ConnectedProgressBar — segment mode", () => {
  it("draws duration-proportional widths as flex ratios, not equal-width segments", () => {
    render(
      <ConnectedProgressBar
        boundaries={THREE}
        totalSeconds={THREE_TOTAL}
        elapsedSeconds={0}
      />,
    );
    expect(segFlexGrows()).toStrictEqual(["600", "120", "60"]);
  });

  it("state: elapsed inside interval 2 -> seg1 done, seg2 active, seg3 upcoming", () => {
    render(
      <ConnectedProgressBar
        boundaries={THREE}
        totalSeconds={THREE_TOTAL}
        elapsedSeconds={650}
      />,
    );
    expect(segStates()).toStrictEqual(["done", "active", "upcoming"]);
  });

  it("0 elapsed: the armed frame, every segment upcoming, none active", () => {
    render(
      <ConnectedProgressBar
        boundaries={THREE}
        totalSeconds={THREE_TOTAL}
        elapsedSeconds={0}
      />,
    );
    expect(segStates()).toStrictEqual(["upcoming", "upcoming", "upcoming"]);
  });

  it("elapsed >= total: every segment done", () => {
    render(
      <ConnectedProgressBar
        boundaries={THREE}
        totalSeconds={THREE_TOTAL}
        elapsedSeconds={THREE_TOTAL}
      />,
    );
    expect(segStates()).toStrictEqual(["done", "done", "done"]);
  });

  it("elapsed past the total (an overrun) still reads every segment done", () => {
    render(
      <ConnectedProgressBar
        boundaries={THREE}
        totalSeconds={THREE_TOTAL}
        elapsedSeconds={THREE_TOTAL + 500}
      />,
    );
    expect(segStates()).toStrictEqual(["done", "done", "done"]);
  });

  it("draws no fallback fill or tick row while under the density threshold", () => {
    render(
      <ConnectedProgressBar
        boundaries={THREE}
        totalSeconds={THREE_TOTAL}
        elapsedSeconds={0}
      />,
    );
    expect(document.querySelector(".connected-progress-fill")).toBeNull();
    expect(document.querySelector(".connected-progress-ticks")).toBeNull();
  });

  it("a real library workout's boundaries draw one segment per interval, matching states", () => {
    // 1000s elapsed lands inside interval 1 ([684, 1368)) of Filling Low's
    // four equal-length intervals (684s each, 2736s total, no warm-up).
    render(
      <ConnectedProgressBar
        boundaries={FILLING_LOW_BOUNDARIES}
        totalSeconds={FILLING_LOW_TOTAL}
        elapsedSeconds={1000}
      />,
    );
    expect(segEls()).toHaveLength(4);
    expect(segStates()).toStrictEqual([
      "done",
      "active",
      "upcoming",
      "upcoming",
    ]);
    // The four flex ratios sum to the session's own total.
    const sum = segFlexGrows().reduce((a, g) => a + Number.parseFloat(g), 0);
    expect(sum).toBeCloseTo(FILLING_LOW_TOTAL, 6);
  });
});

describe("ConnectedProgressBar — fallback mode (>16 boundaries, design spec §2A)", () => {
  const seconds = Array.from(
    { length: MAX_NOTCH_BOUNDARIES + 1 },
    (_, i) => (i + 1) * 100,
  );
  const boundaries = { seconds, predictedFrom: null };
  const total = (MAX_NOTCH_BOUNDARIES + 2) * 100; // 18 segments' worth

  it("draws no segments at all", () => {
    render(
      <ConnectedProgressBar
        boundaries={boundaries}
        totalSeconds={total}
        elapsedSeconds={450}
      />,
    );
    expect(segEls()).toHaveLength(0);
  });

  it("draws ONE proportional fill sized elapsed/total", () => {
    render(
      <ConnectedProgressBar
        boundaries={boundaries}
        totalSeconds={total}
        elapsedSeconds={450}
      />,
    );
    const fill = document.querySelector<HTMLElement>(
      ".connected-progress-fill",
    );
    expect(fill).not.toBeNull();
    // 450 / 1800 = 25%.
    expect(fill!.style.width).toBe("25%");
    expect(document.querySelectorAll(".connected-progress-fill")).toHaveLength(
      1,
    );
  });

  it("draws the quarter-tick row's labels", () => {
    render(
      <ConnectedProgressBar
        boundaries={boundaries}
        totalSeconds={total}
        elapsedSeconds={450}
      />,
    );
    expect(screen.getByText("¼")).toBeInTheDocument();
    expect(screen.getByText("½")).toBeInTheDocument();
    expect(screen.getByText("¾")).toBeInTheDocument();
    expect(screen.getByText("30′")).toBeInTheDocument(); // 1800/60
  });

  it("exactly at the threshold (16 boundaries) still draws segments, not the fallback", () => {
    const at = Array.from({ length: MAX_NOTCH_BOUNDARIES }, (_, i) => i + 1);
    render(
      <ConnectedProgressBar
        boundaries={{ seconds: at, predictedFrom: null }}
        totalSeconds={17}
        elapsedSeconds={0}
      />,
    );
    expect(segEls()).toHaveLength(17);
    expect(document.querySelector(".connected-progress-fill")).toBeNull();
  });
});
