// The connected surface's screen fixtures — the bridge that lets
// `pnpm screenshots` photograph a surface no browser can reach yet.
//
// WHY THIS FILE EXISTS. The connected panes only render once a monitor is
// programmed and rowing, and there is no way to make that happen in the e2e
// stack today: the plan gives the DEV-gated fake-transport injection seam
// (`src/monitor/transports/index.ts`) to Task 8, the e2e stack serves a
// PRODUCTION bundle where no such seam can fire, and a real
// `requestDevice()` in headless Chromium HANGS rather than rejecting
// (`e2e/screenshots.spec.ts`'s own note on why only the FAILED interstitial
// state is captured for real). Task 5 shipped a screen with 151px of
// landscape overflow precisely because nothing photographed it.
//
// So: this file renders each state through the REAL component tree — the
// real `ConnectedSurface`, the real panes, the real model, on the real
// "Filling Low" library fixture — and writes the resulting markup to
// `e2e/fixtures/`. `e2e/screenshots.spec.ts` loads the real app (so the
// real `index.css` and the real self-hosted fonts are live), swaps that
// markup into the page, and photographs it at 390×844 and 844×390.
//
// The fixtures CANNOT go stale: `toMatchFileSnapshot` writes them when
// absent and FAILS when the component's output no longer matches, so a pane
// change that isn't re-photographed breaks this test first.
//
// What this does and does not prove: it proves LAYOUT — real fonts, real
// cascade, real viewport, which is what catches an off-frame button or an
// overflowing column. It does not prove the wiring from a live monitor to
// these numbers; `ConnectedSurface.test.tsx`'s fake-driven walk does that,
// and Task 8's `connected.spec.ts` does it in a browser once the seam
// exists.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import type {
  IntervalActual,
  MonitorFrame,
} from "../../domain/monitor/types.js";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type {
  ConnectedPhase,
  MonitorSession,
} from "../monitor/useMonitorSession";
import { buildDraft } from "../session/draft";
import { buildRun, type EnginePhase } from "../session/engine";
import ConnectedSurface, { LAST_PANE_KEY } from "./ConnectedSurface";
import type { PaneId } from "./connected/PagerRail";

const baselines: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const t0 = new Date("2026-08-07T09:00:00.000Z");
const DEVICE = "PM5 432331249";

// 2026-08-09's warmup setting: a seeded workout no longer carries a `wu`
// step, so the warm-up interval every fixture below opens with now comes
// from the rower's PREFERENCE — `buildRun`'s fourth argument, its one
// producer (`src/session/engine.ts`'s `warmupPhases`). The minutes passed
// per title are exactly what that workout's own `wu` row used to carry, so
// every interval index, count and duration asserted in this file is
// unchanged. The connected surface still has to render a warm-up interval
// correctly; this is the shape it arrives in now.
function libraryFixture(
  title: string,
  warmupMinutes: number,
): {
  program: WorkoutProgram;
  phases: EnginePhase[];
} {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  const draft = buildDraft({
    id: title.toLowerCase().replace(/ /g, "-"),
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const phases = buildRun(draft, baselines, t0, {
    kind: "time",
    minutes: warmupMinutes,
  }).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return { program, phases };
}

const FIXTURE = libraryFixture("Filling Low", 8);

/** Pane C's own second fixture: 25 intervals (6:00 warm-up then 24 x 500 m),
 *  the handoff's own worked example of the case that forces the scroll —
 *  "25 intervals cannot be compressed into 390px honestly" (DEVIATIONS row
 *  2). Filling Low's four rows would photograph the pane without ever
 *  exercising the thing the row is about. */
const LONG_FIXTURE = libraryFixture("Sea Smoke", 6);

/** What the machine reported for an interval that is already behind the
 *  rower. Built from the PROGRAM's own numbers, not typed-in ones: the
 *  actual is the target's distance rowed a touch fast, which is the state
 *  the handoff's mockup draws (ochre) on its completed rows. */
function actualFor(index: number, program: WorkoutProgram): IntervalActual {
  const interval = program.intervals[index]!;
  const split = interval.targetSplit ?? 132;
  const meters = interval.kind === "distance" ? interval.value : 2384;
  return {
    index,
    elapsedSeconds:
      interval.kind === "time" ? interval.value : (meters / 500) * split,
    distanceMeters: meters,
    avgSplit: split - 6,
    avgSpm: (interval.displaySpm ?? 20) - 4,
    avgHeartRateBpm: 158 + index,
  };
}

/** Mid-way through the first 2000 m rep, going a little too hard: the
 *  handoff's own mockup shows `1:57.8` against a `2:00.0` target so the
 *  ochre "over" state is what the picture actually shows. */
function liveFrame(overrides: Partial<MonitorFrame> = {}): MonitorFrame {
  // The session pair mirrors the raw pair unless a case overrides it — see
  // `connected/surfaceModel.test.ts`'s own copy of this factory for the
  // full walk-4 reasoning.
  const f: MonitorFrame = {
    elapsedSeconds: 828,
    distanceMeters: 800,
    sessionElapsedSeconds: 828,
    sessionDistanceMeters: 800,
    currentSplit: 117.8,
    spm: 21,
    heartRateBpm: 164,
    intervalIndex: 1,
    intervalRemaining: { kind: "distance", value: 1200 },
    intervalAccrued: null,
    state: "rowing",
    rowingActive: true,
    ...overrides,
  };
  return {
    ...f,
    sessionElapsedSeconds: overrides.sessionElapsedSeconds ?? f.elapsedSeconds,
    sessionDistanceMeters: overrides.sessionDistanceMeters ?? f.distanceMeters,
  };
}

/** A trace with one of every entry shape the driver actually records — a
 *  hex write, a state transition, an ack, a rejection — so the sheet's
 *  capture shows the list doing its real job rather than three tidy lines.
 *  Serialized here exactly the way `eventLog.ts` does it. */
const LOG_JSON = JSON.stringify(
  [
    ["notify-first", "0x0031 (19B)"],
    ["write", "f1 76 1a 01 00 f2"],
    ["armed", "programmed 4 interval(s)"],
    ["state", "armed -> rowing"],
    ["interval-complete", "index 0 (480.0s / 2384m)"],
    ["divergence", "0x0033 index 5 outside program length 4"],
    ["transport-error", "sample rate write failed: InvalidStateError"],
  ].map(([kind, detail], seq) => ({ seq, kind, detail })),
);

interface CaptureOptions {
  phase?: ConnectedPhase;
  frame?: Partial<MonitorFrame>;
  endedBy?: MonitorSession["endedBy"];
  actuals?: IntervalActual[];
  fixture?: { program: WorkoutProgram; phases: EnginePhase[] };
  /** Runs against the mounted surface before the markup is read — the
   *  diagnostics sheet has no prop of its own, it is opened by the same
   *  triple-tap a rower uses. */
  before?: () => void;
}

function capture(pane: PaneId, options: CaptureOptions = {}): string {
  const fixture = options.fixture ?? FIXTURE;
  localStorage.clear();
  localStorage.setItem(LAST_PANE_KEY, pane);
  const session: MonitorSession = {
    phase: options.phase ?? "live",
    error: null,
    deviceName: DEVICE,
    frame: liveFrame(options.frame),
    actuals: options.actuals ?? [],
    endedBy: options.endedBy ?? null,
    handoffHeld: false,
    connect: vi.fn().mockResolvedValue(undefined),
    program: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    exportLog: vi.fn().mockReturnValue(LOG_JSON),
  };
  const view = render(
    <ConnectedSurface
      phases={fixture.phases}
      program={fixture.program}
      session={session}
      onEnded={vi.fn()}
    />,
  );
  options.before?.();
  const html = document.querySelector("main.connected-surface")!.outerHTML;
  view.unmount();
  return html;
}

/** The rower's own gesture, not a prop: three deliberate presses on one
 *  pager target (handoff §5). */
function tripleTapGrid(): void {
  const target = screen.getByRole("button", { name: "Grid pane" });
  fireEvent.click(target);
  fireEvent.click(target);
  fireEvent.click(target);
}

describe("screen fixtures for pnpm screenshots", () => {
  it("pane B, rowing", async () => {
    await expect(capture("live")).toMatchFileSnapshot(
      "../../e2e/fixtures/connected-pane-live.html",
    );
  });

  /** THE WARM-UP, mid-way through Filling Low's 8:00 easy start (design spec
   *  §5b). Every other fixture in this file photographs interval 1 — the
   *  first 2000 m rep — so nothing had a picture of the state §5b's table is
   *  actually about: the caption reading `WARM-UP` with no ordinal at all,
   *  both target slots on the dash with both heroes unjudged (a warm-up is
   *  never graded), and TOTAL LEFT's bar part-way through the warm-up's own
   *  span — filling in ITS tone as the rower rows it, with the unrowed rest
   *  of the span still plain track (James, 2026-08-12: the bar moves while
   *  the rower moves, and still reads as visibly not-work). The frame is set
   *  8:00-warm-up-minus-3:32, so the fill sits inside the span rather than
   *  at either end of it. A time warm-up counts DOWN, hence the time-kind
   *  remaining. */
  it("pane B, warming up", async () => {
    await expect(
      capture("live", {
        frame: {
          intervalIndex: 0,
          elapsedSeconds: 268,
          distanceMeters: 942,
          currentSplit: 142.3,
          spm: 18,
          heartRateBpm: 131,
          intervalRemaining: { kind: "time", value: 212 },
        },
      }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-pane-live-warmup.html");
  });

  it("pane B, no HR monitor", async () => {
    await expect(
      capture("live", { frame: { heartRateBpm: null } }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-pane-live-nohr.html");
  });

  it("pane B, erg paused", async () => {
    await expect(
      capture("live", {
        phase: "paused",
        frame: { intervalRemaining: { kind: "time", value: 41 } },
      }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-paused.html");
  });

  it("pane B, connection lost", async () => {
    await expect(
      capture("live", { phase: "disconnected" }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-disconnected.html");
  });

  // --- Task 7 ------------------------------------------------------------

  /** Mid-session on Filling Low: interval 1 (the warm-up) behind, interval
   *  2 (the first 2000 m rep) running, two more to come — one of each of
   *  the handoff's three row states in one frame. */
  it("pane C, the grid mid-session", async () => {
    await expect(
      capture("grid", { actuals: [actualFor(0, FIXTURE.program)] }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-pane-grid.html");
  });

  /** The scroll case, and the only one that can show it: 25 intervals, the
   *  active row eight deep. Header and caption pinned, seven rows visible
   *  at 390×844's landscape height and fourteen at portrait's (connected-
   *  revamp Task 5, two separate JAMES RULINGS 2026-08-12: landscape
   *  supersedes the packet's 8-at-36px figure on a measured budget too
   *  tight to hold it; portrait's fix round reverses this task's own first
   *  attempt, which forced the packet's unmeasured 12 with a deliberate
   *  spacer — portrait now takes every row its budget actually holds, no
   *  code hiding capacity — `e2e/screenshots.spec.ts` measures both counts
   *  in a real browser), the rest below the fold. */
  it("pane C, twenty-five intervals", async () => {
    await expect(
      capture("grid", {
        fixture: LONG_FIXTURE,
        frame: {
          intervalIndex: 8,
          intervalRemaining: { kind: "distance", value: 312 },
        },
        actuals: Array.from({ length: 8 }, (_, i) =>
          actualFor(i, LONG_FIXTURE.program),
        ),
      }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-pane-grid-long.html");
  });

  it("the diagnostics sheet, triple-tapped open", async () => {
    await expect(
      capture("grid", {
        actuals: [actualFor(0, FIXTURE.program)],
        before: tripleTapGrid,
      }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-log-sheet.html");
  });

  it("the hand-off frame at ended", async () => {
    await expect(
      capture("live", { phase: "ended", endedBy: "user" }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-ended.html");
  });
});
