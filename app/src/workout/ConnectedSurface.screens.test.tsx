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
import { phaseSeconds } from "../../domain/expand.js";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type {
  ConnectedPhase,
  MonitorSession,
} from "../monitor/useMonitorSession";
import { buildDraft } from "../session/draft";
import { buildRun, type EnginePhase } from "../session/engine";
import ConnectedSurface, { LAST_PANE_KEY } from "./ConnectedSurface";
import { phaseIndexForInterval } from "./connected/surfaceModel";
import type { PaneId } from "./connected/SegmentedControl";

const baselines: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const t0 = new Date("2026-08-07T09:00:00.000Z");
const DEVICE = "PM5 432331249";

// Phase WU removed both the seeded `wu` step and the warm-up preference
// that used to synthesize one. The interval every fixture below opens
// with is now an ORDINARY authored first interval — see the `steps:`
// array in `buildDraft` below, which builds it as a plain EASY step of
// the same length the workout's own `wu` row used to carry, so every
// interval index, count and duration asserted in this file is unchanged.
// The connected surface still has to render that opening interval
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
    // Phase WU: the leading interval came from `buildRun`'s deleted warm-up
    // argument. An authored EASY step of the same length compiles to the
    // identical target-less interval, so every index and count here holds.
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: warmupMinutes },
        ref: { effort: "min" },
      },
      ...w.steps,
    ],
  });
  const phases = buildRun(draft, baselines, t0).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return { program, phases };
}

const FIXTURE = libraryFixture("Filling Low", 8);

/** No warm-up phase at all (`buildRun`'s fourth argument `null`, the
 *  warm-up preference's own real off-default — `PaneGrid.test.tsx`'s own
 *  `noWarmupFixture`, same construction, kept here rather than imported
 *  since that file's version also carries a `workoutId`/`identity` this
 *  one has no use for). The armed capture below needs this, not `FIXTURE`:
 *  index 0 on `FIXTURE` is the warm-up (`intervalOrdinalLabel` null,
 *  `readyLabel` collapses to bare `READY`), but the committed
 *  `connected-armed.png`/`.html` and `design.spec.ts`'s own 2D pin both
 *  show `1 OF 4 · READY` — a NUMBERED first interval, the state a rower
 *  with the warm-up preference off actually arms into. */
function noWarmupFixture(title: string): {
  program: WorkoutProgram;
  phases: EnginePhase[];
} {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  const draft = buildDraft({
    id: `${title.toLowerCase().replace(/ /g, "-")}-no-warmup`,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const phases = buildRun(draft, baselines, t0).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return { program, phases };
}

const NO_WARMUP_FIXTURE = noWarmupFixture("Filling Low");

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
    restDistanceMeters: 0,
  };
}

/** The warm-up's own rowed distance, from the SAME derivation the grid rows
 *  use rather than a second literal beside it — the two disagreeing is what
 *  M-6 was. Filling Low's 8:00 warm-up carries no target, so `actualFor`
 *  prices it at 132 - 6 = 126 s/500m: 1905 m. */
const WARMUP_ACTUAL_METERS = actualFor(0, FIXTURE.program).distanceMeters;

/** THE PACE EVERY FIXTURE IN THIS FILE IS ROWED AT, and the one number the
 *  frames below derive their clocks from. `2:08.4` per 500 m is already the
 *  file's own published pace: it is `connected-pane-live`'s `splitAvgPace`
 *  override, which is 0x0033's Split Average Pace — "seconds/500m for the
 *  CURRENT interval's own average while rowing" (`domain/monitor/types.ts`'s
 *  own doc comment on the field). So on any frame, that average, the
 *  interval's own metres and the interval's own clock are three readings of
 *  ONE fact and only two of them are free. */
const FIXTURE_AVG_SPLIT = 128.4;

/** Filling Low's warm-up, in seconds — the phase every non-warm-up frame in
 *  this file sits behind, and therefore the offset between a frame's own
 *  interval clock and the session clock. Read off the fixture rather than
 *  typed, so the 8 passed to `libraryFixture` above cannot drift away from
 *  it. */
const FIXTURE_WARMUP_SECONDS = FIXTURE.program.intervals[0]!.value;

/** How long an interval clock reads after `meters` at `FIXTURE_AVG_SPLIT`. */
function secondsFor(meters: number): number {
  return (meters / 500) * FIXTURE_AVG_SPLIT;
}

/** Mid-way through the first 2000 m rep, going a little too hard: the
 *  handoff's own mockup shows `1:57.8` against a `2:00.0` target, so the
 *  `"faster"` state is what the picture actually shows — BLUE in the
 *  committed capture (`connected-pane-live.png`), the mockup's ochre having
 *  been repainted 2026-08-13. */
function liveFrame(overrides: Partial<MonitorFrame> = {}): MonitorFrame {
  // THE TWO CLOCKS ARE NOT THE SAME CLOCK, and this factory used to say they
  // were. `elapsedSeconds` is 0x0031's PER-INTERVAL clock — it resets to zero
  // at every interval boundary — while `sessionElapsedSeconds` is the
  // driver's own session-accumulated total. Both used to read `828` here,
  // and this comment's own next paragraph said what 828 is: "the 480 s
  // warm-up plus 348 s of this interval". A number that INCLUDES the warm-up
  // cannot also be the clock of an interval that starts after it, so the raw
  // half was impossible from the moment it was written. It was inert while
  // nothing read it; Phase LL's EST LEFT made `frame.elapsedSeconds`
  // load-bearing on the headline countdown and the progress bar, and seven
  // committed captures immediately started showing a number 8:00 too small
  // beside a bar painted two intervals ahead of their own `1 OF 4` caption.
  //
  // DERIVED, NOT CHOSEN (the fix round's own rule, and why 348 was not just
  // moved into the raw half): the frame already publishes 800 m and, on
  // `connected-pane-live`, a 2:08.4 interval average. Those two fix the
  // interval clock at 800/500 x 128.4 = 205.44 s — there is no third free
  // number. 348 s against 800 m would have been 3:37.5 per 500 m, beside a
  // 1:57.8 CURRENT split and a 2:08.4 average on the same screen.
  //
  // `sessionElapsedSeconds` is then the warm-up plus that: 480 + 205.44 =
  // 685.44, and it stays a genuine SESSION value the way the old 828 was
  // meant to be. `sessionDistanceMeters` is set apart from the raw value for
  // the matching reason (James, 2026-08-13, reading the landscape capture:
  // "it renders 'meters left' but it's a time workout"). It used to mirror
  // at 800 — the SAME number as the interval's own distance — so `TOTAL M
  // 800` sat beside `METERS LEFT 1200` looking like two readings of one
  // interval, when the first is the whole session. A rower one interval into
  // Filling Low has the 8:00 warm-up behind them: `actualFor`'s own metres
  // for that time interval, plus this interval's 800.
  const f: MonitorFrame = {
    elapsedSeconds: secondsFor(800),
    distanceMeters: 800,
    sessionElapsedSeconds: 0, // replaced below — see the return statement
    sessionDistanceMeters: WARMUP_ACTUAL_METERS + 800,
    currentSplit: 117.8,
    spm: 21,
    heartRateBpm: 164,
    splitAvgPace: null,
    restSeconds: 0,
    intervalIndex: 1,
    intervalRemaining: { kind: "distance", value: 1200 },
    intervalAccrued: null,
    state: "rowing",
    rowingActive: true,
    ...overrides,
  };
  // THE SESSION CLOCK IS DERIVED FROM THE RAW ONE, never mirrored onto it.
  // A case that overrides only the raw half (the warm-up capture below, at
  // `intervalIndex: 0`) still gets a coherent session clock: the warm-up IS
  // the first phase, so nothing precedes it and the two genuinely coincide;
  // anywhere else the 8:00 warm-up sits in front and the session clock is
  // that much larger. The old unconditional mirror is what let both halves
  // read 828 (see above). `sessionDistanceMeters` gets no such line — the
  // spread already carries either the default or the case's own override,
  // which is what "does not mirror" means (tail review M-2: this used to be
  // spelled out as `sessionDistanceMeters: f.sessionDistanceMeters`, a no-op
  // after the spread that read like working code).
  return {
    ...f,
    sessionElapsedSeconds:
      overrides.sessionElapsedSeconds ??
      (f.intervalIndex === 0
        ? f.elapsedSeconds
        : FIXTURE_WARMUP_SECONDS + f.elapsedSeconds),
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
  /** Phase LM PR 1 Task 4: the watchdog's own published fact — frames have
   *  stopped arriving. It is the ONLY way to build a capture that is BOTH
   *  in the pre-row state and link-lost, which is this phase's flagship
   *  frame: `phase: "disconnected"` would take the session axis with it and
   *  lose the READY status, while `frameSilence` leaves the phase alone and
   *  moves only the link axis (`ConnectedSurface.tsx`'s own "two
   *  independent facts, not one ranked list" comment). Defaults false, so
   *  every existing capture is byte-identical. */
  frameSilence?: boolean;
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
    frameSilence: options.frameSilence ?? false,
    connect: vi.fn().mockResolvedValue(undefined),
    program: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    exportLog: vi.fn().mockReturnValue(LOG_JSON),
  };
  // `session.frame` is `liveFrame(...)` a few lines up and never null; the
  // field is nullable on `MonitorSession` for the pre-first-frame case,
  // which no capture in this file builds.
  assertFramePossible(fixture, session.frame!);
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
 *  control half (handoff §5). */
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
/** THE THREE THINGS A FRAME CANNOT LIE ABOUT, asserted on every frame this
 *  file photographs (called from `capture()` below, so no case can opt out).
 *
 *  1. **The per-interval clock fits inside its own phase.** `elapsedSeconds`
 *     is 0x0031's per-interval clock, which resets at every boundary, so it
 *     can never carry a preceding phase's time. Priced against the phase's
 *     own programmed length: a time phase because the machine ends it there,
 *     a distance phase because every fixture in this file is rowed at or
 *     faster than target (`FIXTURE_AVG_SPLIT` is 2:08.4 against Filling
 *     Low's 2:06.0 and Sea Smoke's 2:12.0 — inside the tolerance the file's
 *     own rows already use). A fixture that deliberately rows slower than
 *     target would have to say so here rather than arrive by accident, which
 *     is the point.
 *  2. **The two clocks are not the same clock** anywhere past the first
 *     phase — the exact defect this helper exists for.
 *  3. **Distance and time imply a pace a human produces.** 800 m in 828 s is
 *     3:37.5 per 500 m beside a 1:57.8 split on the same screen; 800 m in
 *     205.44 s is the 2:08.4 the screen actually shows. Applied to the
 *     interval pair and to the session pair, and tied to `splitAvgPace`
 *     whenever the frame publishes one (0x0033's Split Average Pace is the
 *     current interval's own average — `domain/monitor/types.ts`). */
function assertFramePossible(
  fixture: { program: WorkoutProgram; phases: EnginePhase[] },
  frame: MonitorFrame,
): void {
  if (frame.intervalIndex === null) return;
  const phaseIndex = phaseIndexForInterval(
    fixture.phases,
    frame.intervalIndex,
    frame.state === "resting",
  );
  const priced = phaseSeconds(fixture.phases[phaseIndex]!);
  if (priced !== null) {
    expect(
      frame.elapsedSeconds,
      `interval clock ${frame.elapsedSeconds}s exceeds phase ${phaseIndex}'s own ${priced}s`,
    ).toBeLessThanOrEqual(priced);
  }
  if (phaseIndex > 0) {
    expect(
      frame.sessionElapsedSeconds,
      "the session clock must be strictly larger than the interval clock once a phase precedes it",
    ).toBeGreaterThan(frame.elapsedSeconds);
  } else {
    expect(frame.sessionElapsedSeconds).toBe(frame.elapsedSeconds);
  }
  // An armed frame's pair is carry-over ghost data by design (see the armed
  // capture's own comment), and a zero distance prices nothing.
  if (frame.state === "armed") return;
  for (const [meters, seconds, scope] of [
    [frame.distanceMeters, frame.elapsedSeconds, "interval"],
    [frame.sessionDistanceMeters, frame.sessionElapsedSeconds, "session"],
  ] as const) {
    if (meters <= 0 || seconds <= 0) continue;
    const split = (seconds / meters) * 500;
    expect(
      split,
      `${scope} pace ${split.toFixed(1)}s/500m is not a pace a human rows`,
    ).toBeGreaterThan(80);
    expect(
      split,
      `${scope} pace ${split.toFixed(1)}s/500m is not a pace a human rows`,
    ).toBeLessThan(180);
  }
  if (frame.splitAvgPace !== null && frame.distanceMeters > 0) {
    expect(
      (frame.elapsedSeconds / frame.distanceMeters) * 500,
      "the published interval average must be the interval's own metres over its own clock",
    ).toBeCloseTo(frame.splitAvgPace, 1);
  }
}

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

  // --- THE ELAPSED AXIS (fix round, BLOCKING 1) -------------------------
  //
  // The block above checked the ACTUALS' three dimensions and nothing else,
  // which is exactly why an impossible per-interval clock walked through it:
  // `liveFrame()` set `elapsedSeconds` and `sessionElapsedSeconds` to the
  // same 828, with a comment thirty lines up stating that 828 was the
  // SESSION value (480 s of warm-up plus 348 s of this interval). Nothing
  // read the raw half, so nothing failed — until EST LEFT started reading
  // it and seven committed captures grew a wrong number and a bar two
  // intervals ahead of their own caption. `assertFramePossible` below runs
  // on EVERY frame this file photographs (it is called from `capture()`,
  // not from a list a new case could forget to join), so a future editor
  // who invents a clock fails here, with a reason.

  it("every capture's interval clock fits inside its own phase, and its two clocks are not the same clock", () => {
    // Directly, on the two frames the captures below actually build — the
    // same assertions `capture()` runs, stated once where a reader looking
    // for the rule will find it.
    const live = liveFrame();
    expect(live.elapsedSeconds).toBeCloseTo(205.44, 2);
    expect(live.sessionElapsedSeconds).toBeCloseTo(685.44, 2);
    // The warm-up is the one phase where the two DO coincide, and it is
    // also the only connected fixture whose committed capture did not
    // move when EST LEFT changed — the detector for this whole class.
    const warmup = liveFrame({
      intervalIndex: 0,
      elapsedSeconds: 268,
      distanceMeters: 942,
      sessionDistanceMeters: 942,
    });
    expect(warmup.sessionElapsedSeconds).toBe(warmup.elapsedSeconds);
    assertFramePossible(FIXTURE, live);
    assertFramePossible(FIXTURE, warmup);
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
  /** Task 5, connected-metrics (exit criterion 5): the ONLY frame override
   *  on the file's own primary "rowing" fixture — deliberately not a change
   *  to `liveFrame()`'s shared default, which every other capture below
   *  inherits without overriding `splitAvgPace` itself (armed/paused/
   *  disconnected genuinely have no average yet). `128.4` s/500m
   *  ("2:08.4") — plausibly still converging toward the 2:06.0 target
   *  shown beside it (`connected-hero-target-value`, unchanged), a touch
   *  slower than the 1:57.8 CURRENT split already in this fixture: unjudged
   *  plain ink either way (design states table row 1, "Work, split target,
   *  average > 0" — never judged while rowing). Before this, `liveFrame`'s
   *  own default (`splitAvgPace: null`) meant the AVG cell rendered nothing
   *  in EVERY committed connected screenshot (task-4-report.md's own
   *  flagged gap) — this is that gap's first non-zero fixture. */
  it("pane B, rowing", async () => {
    await expect(
      capture("live", { frame: { splitAvgPace: 128.4 } }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-pane-live.html");
  });

  /** THE FIX ROUND'S OWN CLOSED GAP (Task 6 fix round, CRITICAL 1). Every
   *  other committed connected fixture is written by THIS file's own
   *  `toMatchFileSnapshot` calls — this top-of-file comment's own claim,
   *  "the fixtures CANNOT go stale," depends on that. `connected-armed.html`
   *  was the one exception: no case here ever wrote it (an earlier commit's
   *  own log message names finding it stale as a real defect —
   *  `git log`'s "a stale static connected-armed.html fixture" — and it went
   *  stale AGAIN, silently, the moment this task moved the header's status
   *  span, because nothing here would have failed to catch it). Closing it
   *  properly rather than hand-patching the HTML once: `phase: "ready"` maps
   *  to `status: "armed"` (`ConnectedSurface.tsx`'s own status ternary,
   *  `ConnectedSurface.test.tsx`'s "status precedence" describe proves the
   *  mapping); `spm: 46`/`currentSplit: 251` are the fake's own taught
   *  re-arm ghost (`surfaceModel.test.ts`'s "armed: rate mirrors to 0
   *  plain…" test, `fake.test.ts`'s own comment on why a re-armed machine
   *  carries the PREVIOUS piece's numbers rather than zero) — chosen far
   *  from both 0 and the target so a leak of either failure mode is
   *  unmistakable in the capture, same reasoning as that unit test's own
   *  comment. */
  it("pane B, armed (before the first stroke — I-1)", async () => {
    await expect(
      capture("live", {
        phase: "ready",
        fixture: NO_WARMUP_FIXTURE,
        frame: {
          state: "armed",
          intervalIndex: 0,
          rowingActive: false,
          distanceMeters: 0,
          // FOUND WHILE ADDING THE LOST TWIN BELOW (Phase LM PR 1 Task 4),
          // and fixed here rather than left as a known-wrong committed
          // capture: this frame is BEFORE THE FIRST STROKE, and the three
          // session/interval fields were inheriting `liveFrame`'s
          // mid-session defaults — so the picture showed a `2,705m`
          // session counter and a part-run interval clock on a piece
          // nobody had pulled yet (recurring failure #7, a capture whose
          // own numbers contradict each other). Zero is not a placeholder
          // here; it is what an armed machine reports.
          elapsedSeconds: 0,
          sessionDistanceMeters: 0,
          sessionElapsedSeconds: 0,
          spm: 46,
          currentSplit: 251,
        },
      }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-armed.html");
  });

  /** Pane B, interval 0: Filling Low's 8:00 easy start, mid-way through.
   *  Every other fixture in this file photographs interval 1 — the first
   *  2000 m rep — so this is the only picture of interval 0's own quirk:
   *  the session total equals the interval's own distance
   *  (`sessionDistanceMeters` stated rather than inherited below, since
   *  everywhere else the two differ — see `liveFrame`), and the frame is a
   *  target-less time interval, hence the time-kind remaining rather than
   *  a distance one. The frame is set 8:00-minus-3:32, so it lands inside
   *  the interval rather than at either end.
   *
   *  Design spec §5b originally called this THE WARM-UP: the caption read
   *  the bare word `WARM-UP` with no ordinal, and the bar gave the
   *  warm-up's own span a third tone as the rower rowed it. Phase WU
   *  (2026-08-21) removed the concept: the step is now an authored,
   *  ordinary EASY-effort work step (`libraryFixture`'s own comment), so
   *  the caption reads a numbered `1 OF 5 · WORK` and the progress bar has
   *  only its usual two tones (active/upcoming). What did NOT change,
   *  because an effort-ref phase has never carried a numeric target either:
   *  both target slots still name the phase rather than a number (`EASY`,
   *  `Free`), still greyed, and the pace hero is still unjudged — verified
   *  against this fixture's own committed markup, not assumed carried
   *  over. */
  it("pane B, the opening interval", async () => {
    await expect(
      capture("live", {
        frame: {
          intervalIndex: 0,
          elapsedSeconds: 268,
          distanceMeters: 942,
          // Equal to the raw value here, and stated rather than inherited:
          // this is the FIRST interval, so the session total genuinely is
          // this interval's own distance. Everywhere else the two differ
          // (see `liveFrame`).
          sessionDistanceMeters: 942,
          currentSplit: 142.3,
          spm: 18,
          heartRateBpm: 131,
          intervalRemaining: { kind: "time", value: 212 },
        },
      }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-pane-live-opener.html");
  });

  /** THE PHASE'S FLAGSHIP FRAME, and until now the one state in this whole
   *  phase with no committed picture (Phase LM PR 1 Task 4). It is the
   *  armed capture above with ONE fact changed — the frames stopped
   *  arriving — so the two files sit side by side as the before/after of
   *  the defect this phase exists for: same header ordinal, same READY
   *  status, `· LOST` now on the device caption, and the banner reading
   *  `Nothing kept.` because nothing ever was.
   *
   *  ZERO ACTUALS IS THE POINT HERE, not an empty fixture (recurring
   *  failure #3): the mid-row capture below deliberately carries the
   *  interval it has obviously rowed, and this one deliberately carries
   *  none, because "no reading at all" is the state under test. The frame
   *  is the armed capture's own re-arm ghost (spm 46, currentSplit 251 —
   *  the PREVIOUS piece's numbers, which a re-armed machine really does
   *  hold) so the capture proves the ghost stays suppressed here too
   *  rather than being absent by accident.
   *
   *  `frameSilence`, not `phase: "disconnected"`: that phase would move the
   *  session axis as well and the header would stop saying READY, which is
   *  the very combination this phase had to stop treating as impossible. */
  it("pane B, armed and the link lost — nothing was ever measured", async () => {
    await expect(
      capture("live", {
        phase: "ready",
        frameSilence: true,
        fixture: NO_WARMUP_FIXTURE,
        actuals: [],
        frame: {
          state: "armed",
          intervalIndex: 0,
          rowingActive: false,
          distanceMeters: 0,
          elapsedSeconds: 0,
          sessionDistanceMeters: 0,
          sessionElapsedSeconds: 0,
          spm: 46,
          currentSplit: 251,
        },
      }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-ready-lost.html");
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

  /** THE FIXTURE CARRIES THE INTERVAL IT HAS OBVIOUSLY ROWED (Phase LM PR
   *  1 Task 3). It used to pass no `actuals` at all, which was invisible
   *  until the lost banner started naming how many intervals survive: the
   *  capture would have shown a surface two intervals into Filling Low,
   *  2,705 m on its own counter, over a banner reading "Nothing kept." —
   *  the empty-fixture defect (recurring failure #3) rendered as a
   *  contradiction a reviewer can see. Interval 0's actual is the record
   *  a real mid-session drop would have; the frame is unchanged, and so
   *  are the progress-bar boundaries (`actualFor` prices a TIME interval
   *  at its own programmed length, which is what `measuredWorkSeconds`
   *  already assumed). */
  it("pane B, connection lost", async () => {
    await expect(
      capture("live", {
        phase: "disconnected",
        actuals: [actualFor(0, FIXTURE.program)],
      }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-disconnected.html");
  });

  // --- Task 7 ------------------------------------------------------------

  /** Mid-session on Filling Low: interval 1 (the easy opener) behind,
   *  interval 2 (the first 2000 m rep) running, two more to come — one of
   *  each of the handoff's three row states in one frame. */
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
    // EVERY NUMBER ON THIS FRAME IS DERIVED FROM THE ROWS ABOVE IT, and
    // that is this case's own share of the fix round's blocking finding.
    // It used to inherit `liveFrame()`'s raw clock wholesale, which meant a
    // frame sitting eight intervals deep into Sea Smoke claimed an interval
    // clock longer than the 25-interval session's first nine phases put
    // together — and once EST LEFT started reading that clock, the header
    // countdown moved 57:00 -> 33:36 on a screen whose own rows had not
    // changed at all. The active interval is 500 m with 312 m left, so 188 m
    // are rowed; at this file's one pace that is 48.28 s. The session pair
    // is what the eight `actualFor` rows below plus the one programmed rest
    // between interval 4 and interval 5 actually add up to, plus that.
    //
    // AND THIS CAPTURE IS ALSO THE ACCEPTED DISTANCE LIMIT'S OWN PICTURE,
    // said out loud so the next reviewer recomputing the headline from the
    // rows (recurring failure #7) finds an explanation rather than a
    // defect. The rows measured `2:06` against a `2:12` pricing, seven of
    // them, so `estElapsed` — which banks each completed phase's PROGRAMMED
    // length — sits 42 s ahead of what the rows actually add up to, and the
    // header reads `46:36 LEFT` where the rows' own arithmetic gives 47:18.
    // That is `docs/design/DEVIATIONS.md`'s third EST LEFT row, measured on
    // a replay in `connected/surfaceModel.test.ts`, not a fixture error.
    const longActuals = Array.from({ length: 8 }, (_, i) =>
      actualFor(i, LONG_FIXTURE.program),
    );
    const rowedMeters = 188;
    const completedSeconds =
      longActuals.reduce((sum, a) => sum + a.elapsedSeconds, 0) +
      LONG_FIXTURE.program.intervals
        .slice(0, 8)
        .reduce((sum, iv) => sum + iv.restSeconds, 0);
    await expect(
      capture("grid", {
        fixture: LONG_FIXTURE,
        frame: {
          intervalIndex: 8,
          elapsedSeconds: secondsFor(rowedMeters),
          distanceMeters: rowedMeters,
          sessionElapsedSeconds: completedSeconds + secondsFor(rowedMeters),
          sessionDistanceMeters:
            longActuals.reduce((sum, a) => sum + a.distanceMeters, 0) +
            rowedMeters,
          intervalRemaining: { kind: "distance", value: 312 },
        },
        actuals: longActuals,
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
    // The ORDINARY ending, which is what this fixture has always shown:
    // the rower rowed, the machine reported a boundary, and the frame is
    // free to promise the numbers are kept. It carries a real actual as of
    // the fix round (whole-branch review HIGH) because that promise is
    // conditional now — with the empty `actuals` this used to pass, the
    // capture would silently have become the NOTHING-measured frame while
    // keeping the ordinary frame's name (recurring failure #3). The
    // nothing-measured wording is pinned in `ConnectedSurface.test.tsx`'s
    // own "ended" block; this file's job is the layout `e2e` asserts on,
    // which is identical either way (one `<p>`, different words).
    await expect(
      capture("live", {
        phase: "ended",
        endedBy: "user",
        actuals: [actualFor(0, FIXTURE.program)],
      }),
    ).toMatchFileSnapshot("../../e2e/fixtures/connected-ended.html");
  });
});
