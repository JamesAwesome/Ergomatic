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
 *  the handoff's mockup draws on its completed rows — `"faster"`, painted
 *  blue here since the 2026-08-13 repaint, ochre in the mockup itself. */
function actualFor(index: number, program: WorkoutProgram): IntervalActual {
  const interval = program.intervals[index]!;
  const split = interval.targetSplit ?? 132;
  const avgSplit = split - 6;
  // THE ROW MUST BE PHYSICALLY POSSIBLE (tail review M-6). An interval fixes
  // ONE of its two dimensions — a time piece its seconds, a distance piece
  // its metres — and the other follows from it AT THE PACE THIS ROW SAYS IT
  // WAS ROWED, which is `avgSplit`, not the target. Both used to be free:
  // the warm-up's metres were the literal 2384 (8:00 at 1:40.7, faster than
  // the workout's own 2:06 work target and impossible beside its own
  // reported split), and a distance row's seconds were priced at the TARGET
  // while its split claimed six seconds better. `c8c209c` then promoted the
  // warm-up figure into `TOTAL M` on the live pane, so a number that could
  // not be true became a number the rower reads.
  const meters =
    interval.kind === "distance"
      ? interval.value
      : Math.round((interval.value / avgSplit) * 500);
  const elapsedSeconds =
    interval.kind === "time" ? interval.value : (meters / 500) * avgSplit;
  return {
    index,
    elapsedSeconds,
    distanceMeters: meters,
    avgSplit,
    avgSpm: (interval.displaySpm ?? 20) - 4,
    avgHeartRateBpm: 158 + index,
  };
}

/** The warm-up's own rowed distance, from the SAME derivation the grid rows
 *  use rather than a second literal beside it — the two disagreeing is what
 *  M-6 was. Filling Low's 8:00 warm-up carries no target, so `actualFor`
 *  prices it at 132 - 6 = 126 s/500m: 1905 m. */
const WARMUP_ACTUAL_METERS = actualFor(0, FIXTURE.program).distanceMeters;

/** Mid-way through the first 2000 m rep, going a little too hard: the
 *  handoff's own mockup shows `1:57.8` against a `2:00.0` target, so the
 *  `"faster"` state is what the picture actually shows — BLUE in the
 *  committed capture (`connected-pane-live.png`), the mockup's ochre having
 *  been repainted 2026-08-13. */
function liveFrame(overrides: Partial<MonitorFrame> = {}): MonitorFrame {
  // The session pair mirrors the raw pair unless a case overrides it — see
  // `connected/surfaceModel.test.ts`'s own copy of this factory for the
  // full walk-4 reasoning.
  //
  // EXCEPT `sessionDistanceMeters`, which is set apart from the raw value on
  // purpose (James, 2026-08-13, reading the landscape capture: "it renders
  // 'meters left' but it's a time workout"). It used to mirror at 800 — the
  // SAME number as the interval's own distance — so `TOTAL M 800` sat beside
  // `METERS LEFT 1200` looking like two readings of one interval, when the
  // first is the whole session. A rower one interval into Filling Low has
  // the 8:00 warm-up behind them: `actualFor`'s own metres for that time
  // interval, plus this interval's 800. The picture now shows two visibly
  // different scopes instead of a coincidence, which is what made the screen
  // scan wrong. `sessionElapsedSeconds` was always a genuine session value
  // (828 s = the 480 s warm-up plus 348 s of this interval), so only the
  // distance half was lying.
  const f: MonitorFrame = {
    elapsedSeconds: 828,
    distanceMeters: 800,
    sessionElapsedSeconds: 828,
    sessionDistanceMeters: WARMUP_ACTUAL_METERS + 800,
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
  // ONE re-mirror, deliberately, and the asymmetry is the point.
  // `sessionElapsedSeconds` follows `elapsedSeconds` whenever a case
  // overrides only the raw half, because the two genuinely coincide for a
  // frame that never crosses an interval reset. `sessionDistanceMeters` does
  // NOT: mirroring it unconditionally is exactly what discarded the default
  // above and made every capture's session total equal to its interval
  // distance. There is no line for it here — the spread already carries
  // either the default or the case's own override, which is what "does not
  // mirror" means (tail review M-2: this used to be spelled out as
  // `sessionDistanceMeters: f.sessionDistanceMeters`, a no-op after the
  // spread that read like working code). A case that wants the mirror says
  // so itself, and the warm-up fixture below does, where nothing precedes
  // the warm-up so the two really are equal.
  return {
    ...f,
    sessionElapsedSeconds: overrides.sessionElapsedSeconds ?? f.elapsedSeconds,
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
  /** The freeze predicate's own published fact (Task 1) — this is how a
   *  frozen capture is built now that `"paused"` is gone from
   *  `ConnectedPhase` (connected-axes 2a, task 5): `phase` stays `"live"`,
   *  `frozen: true` is what the caller's own status ternary
   *  (`ConnectedSurface.tsx`) reads to produce `SurfaceStatus`'s `"paused"`. */
  frozen?: boolean;
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
    frozen: options.frozen ?? false,
    runOpen: true,
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

// A CAPTURE CAN ONLY BE AS HONEST AS THE FIXTURE BEHIND IT (tail review
// M-6). The snapshots below would happily record an impossible row — they
// pin what the component renders, not whether the numbers could have
// happened — so the arithmetic gets its own assertion. A future editor who
// hardcodes a metre count again fails HERE, with a reason, rather than
// producing a snapshot diff that looks like a deliberate re-shoot.
describe("the fixtures are physically possible", () => {
  it("every actual's distance, time and split agree with each other", () => {
    for (const { program } of [FIXTURE, LONG_FIXTURE]) {
      for (let i = 0; i < program.intervals.length; i += 1) {
        const a = actualFor(i, program);
        // `avgSplit` is nullable on `IntervalActual` (a machine that never
        // reported one), but this factory always sets it — and a `null`
        // here would make the arithmetic below vacuous rather than false.
        expect(a.avgSplit).not.toBeNull();
        // distance / time IS the split, by definition of s/500m. Half a
        // metre of slack for `Math.round` on the derived metre count, and
        // nothing like enough to admit the old 2384 (which implied 1:40.7
        // beside a reported 2:06.0).
        expect((a.elapsedSeconds / a.avgSplit!) * 500).toBeCloseTo(
          a.distanceMeters,
          0,
        );
      }
    }
  });

  it("the live frame's session total is the warm-up plus this interval, both real", () => {
    // The two scopes `c8c209c` separated: `TOTAL M` is the session, `METERS
    // LEFT` the interval. Asserted against `actualFor`'s own output so the
    // pane's session figure cannot drift away from the grid row above it.
    expect(liveFrame().sessionDistanceMeters).toBe(
      actualFor(0, FIXTURE.program).distanceMeters + 800,
    );
    expect(liveFrame().distanceMeters).toBe(800);
  });
});

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
   *  both target slots naming the phase instead of a number — `Easy` and
   *  `Free`, greyed — with both heroes unjudged (a warm-up is
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
          // Equal to the raw value here, and stated rather than inherited:
          // a warm-up is the FIRST interval, so the session total genuinely
          // is this interval's own distance. Everywhere else the two differ
          // (see `liveFrame`).
          sessionDistanceMeters: 942,
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

  it("pane B, erg frozen (the freeze predicate fired — no more `paused` phase)", async () => {
    await expect(
      capture("live", {
        frozen: true,
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
   *  active row eight deep. Header and caption pinned, EIGHT rows visible
   *  at 844×390's landscape height and fifteen at portrait's, the rest
   *  below the fold. Three JAMES RULINGS 2026-08-12 got to those two
   *  numbers: the packet's unmeasured 12 portrait was replaced by whatever
   *  the budget really holds (nothing may exist whose only job is to hide
   *  capacity); landscape's row height came down to 32px, since 8 at the
   *  packet's 36 has never fitted this frame; and the task-6 fix round
   *  reclaimed a footer slot that reserved 56px it never used, which is
   *  what put landscape back at the packet's own 8. `e2e/screenshots.spec
   *  .ts` measures both counts AND the scroller budget each is derived
   *  from, in a real browser. */
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
