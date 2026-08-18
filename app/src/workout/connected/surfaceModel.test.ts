// The connected surface's model, tested against a REAL seeded library
// workout compiled through the real assembly (`buildDraft` -> `buildRun` ->
// `compileProgram`) — the repo's realistic-fixture rule. "Filling Low" is
// the same fixture `ConnectedInterstitial.test.tsx` uses: an 8:00 warm-up
// then 4 × 2000 m with 3:00 rest between (retuned from 3 reps in Task 3,
// 2026-08-10 library-rebalance, to reach its new 45-60 band), which gives
// this file everything
// it needs in one shape — a warm-up phase with no target, work phases with
// a real resolved split and a pace ref, folded rest phases (so the
// interval->phase walk has something real to walk), and a DISTANCE
// interval (so `METERS LEFT` is exercised against a genuine program rather
// than a synthetic one).

import { describe, expect, it } from "vitest";
import { compileProgram } from "../../../domain/monitor/program.js";
import { fmtDuration } from "../../../domain/duration.js";
import { fmtSplit } from "../../../domain/format.js";
import { PACE_TOLERANCE_SECONDS } from "../../../domain/judge.js";
import type {
  IntervalActual,
  MonitorFrame,
} from "../../../domain/monitor/types.js";
import type { Baselines, Step, WorkoutType } from "../../../domain/types.js";
import { ONBOARDING_TITLES } from "../../../domain/onboarding.js";
import type { WarmupSetting } from "../../api/usePreferences";
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../../server/seed/library/onboarding";
import { buildDraft } from "../../session/draft";
import { buildRun, type EnginePhase } from "../../session/engine";
import { totalSessionSecondsOf } from "../../session/Timer";
import { targetSplitDisplay } from "../../session/TimerTargets";
import {
  buildSurfaceModel,
  connectedNextText,
  intervalNumbering,
  judgedValue,
  phaseIndexForInterval,
  splitHero,
  staleFor,
  type SurfaceModel,
  type SurfaceModelInput,
} from "./surfaceModel";

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
function libraryFixture(title: string, warmup: WarmupSetting | null) {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  const draft = buildDraft({
    id: title.toLowerCase().replace(/\s+/g, "-"),
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const phases = buildRun(draft, baselines, t0, warmup).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return { phases, program };
}

const FIXTURE = libraryFixture("Filling Low", { kind: "time", minutes: 8 });

/** THE SAME WORKOUT WITH THE WARM-UP PREFERENCE OFF — the shape MOST
 *  sessions have (the preference is off by default, `usePreferences`'s own
 *  null column), and therefore the shape design spec §5b must leave
 *  untouched. Four intervals, no warm-up, and every caption the plain
 *  `N OF M` it has always been. */
const NO_WARMUP = libraryFixture("Filling Low", null);

/** THE EFFORT CASE, which Filling Low does not have at all: every one of
 *  its work steps carries a split ref, so no fixture in this file reached
 *  the `targetKind: "effort"` branch of the target slot until now — the
 *  gap the tail review's I-1 found (the 2026-08-13 no-target ruling routed
 *  effort work through `phase.label` with nothing exercising it).
 *
 *  Two real library workouts rather than one, because the two effort words
 *  are two different literals from `domain/pace.ts`'s `effortWord` and a
 *  fixture that only ever saw `max` would not notice a mapping that always
 *  returned it:
 *  - `Fog Bow` (O2) is 30' at 6k+12, 5' at MIN, 25' at 6k+10 — the EASY
 *    word sandwiched between two numeric targets in ONE program, so the
 *    same model can be asked for both kinds of slot without changing
 *    fixture.
 *  - `Rear Flank` (AN) is 5 x (1'/2'/3' at MAX) — every work interval an
 *    ALL OUT, the shape where the caps question is unavoidable. */
const EFFORT_MIN = libraryFixture("Fog Bow", null);
const EFFORT_MAX = libraryFixture("Rear Flank", null);

/** `connectedNextText`'s own fixtures (Item B composition table, task-1
 *  brief). `phasesFrom` skips `compileProgram` entirely — the builder under
 *  test reads `EnginePhase[]` directly and never sees a `ProgramInterval`,
 *  and one of its rows (a bare "test" step) is a shape `compileProgram`
 *  REJECTS outright (`unrepresentable-value`: a test phase has neither
 *  `seconds` nor `meters` to program), so routing it through the compiler
 *  the other fixtures use would fail for a reason this file has nothing to
 *  do with. */
function phasesFrom(
  w: { title: string; type: WorkoutType; steps: Step[] },
  warmup: WarmupSetting | null,
): EnginePhase[] {
  const draft = buildDraft({
    id: w.title.toLowerCase().replace(/\s+/g, "-"),
    title: w.title,
    type: w.type,
    steps: w.steps,
  });
  return buildRun(draft, baselines, t0, warmup).phases;
}

/** A single continuous time work phase, split-target, no rest and no
 *  reps block — the "work+seconds+split target+spm" table row needs a work
 *  phase whose EXTENT comes from `seconds`, and every time-based work step
 *  in the library that also carries `restMinutes` would give the row a
 *  trailing rest phase this test does not want to have to skip past.
 *  "Occluded Front" (AT, 10' at 6k+4, spm 22, no rest) is the one single-step
 *  time workout in the library. */
const OCCLUDED = libraryFixture("Occluded Front", null);

/** The warm-up SETTING at `kind: "distance"` — every other fixture in this
 *  file only ever exercises the `kind: "time"` branch of `warmupPhases`
 *  (`engine.ts:82-97`); the "warmup+meters" table row needs the other one. */
const WARMUP_METERS = libraryFixture("Filling Low", {
  kind: "distance",
  meters: 2000,
});

/** The ONE real production shape with a distance work step at an EFFORT ref
 *  and no `spm` — `library.test.ts`'s own "spm-present-and-even on every
 *  work step" rule (see `onboarding.ts`'s header comment) means no fixture
 *  in `LIBRARY_WORKOUTS` itself can ever reach this branch; the two
 *  designated onboarding workouts are the sole documented exception, kept
 *  OUT of `LIBRARY_WORKOUTS` for exactly that reason. "First 2k" (AN, 2000m
 *  at MAX, no spm) is the "work+meters+effort target" table row. */
const ONBOARD_K2 = ONBOARDING_LIBRARY_WORKOUTS.find(
  (w) => w.title === ONBOARDING_TITLES.k2,
);
if (!ONBOARD_K2) throw new Error("missing onboarding fixture: First 2k");
const EFFORT_METERS_NO_SPM = phasesFrom(ONBOARD_K2, null);

/** A bare "test" step (open-ended all-out — `k2Test`/`k6Test`'s own shape,
 *  `domain/expand.ts`'s `case "test"`) — no real library or onboarding
 *  workout carries one (the domain header comment on `Phase.type` notes a
 *  test phase is unrepresentable to `compileProgram`, so the connected
 *  surface's own program-driven fixtures never reach it either), but
 *  `connectedNextText` reads `EnginePhase[]` directly and a rower CAN author
 *  one (the builder's own "test" step) — real production code
 *  (`buildDraft` -> `buildRun` -> `domain/expand.ts`'s `phases()`), a real
 *  step shape, just not a shape any SEEDED workout happens to use. */
const TEST_PHASES = phasesFrom(
  { title: "Test Piece", type: "AN", steps: [{ k: "test", label: "2k Test" }] },
  null,
);

/** The session pair MIRRORS the raw pair unless a case overrides it
 *  outright. 0x0031's `elapsedSeconds`/`distanceMeters` are PER-INTERVAL
 *  (walk 4, interface-notes.md §18); the driver accumulates the session
 *  totals on top, and for a fixture that never crosses a reset the two are
 *  simply equal. The re-mirror after the spread is what makes that true: a
 *  case overriding only `elapsedSeconds` would otherwise keep the DEFAULT
 *  session clock and quietly assert nothing about the value it set. */
function frame(overrides: Partial<MonitorFrame> = {}): MonitorFrame {
  const f: MonitorFrame = {
    elapsedSeconds: 600,
    distanceMeters: 2400,
    sessionElapsedSeconds: 600,
    sessionDistanceMeters: 2400,
    currentSplit: 120,
    spm: 22,
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

function model(over: Partial<SurfaceModelInput> = {}) {
  return buildSurfaceModel({
    phases: FIXTURE.phases,
    program: FIXTURE.program,
    status: "live",
    frame: frame(),
    deviceName: DEVICE,
    actuals: [],
    ...over,
  });
}

/** The first WORK phase's own resolved split, read out of the fixture
 *  rather than hardcoded — the numbers this file compares against are the
 *  workout's, not invented ones. */
function firstWorkPhase(): EnginePhase {
  const p = FIXTURE.phases.find((x) => x.type === "work");
  if (!p?.targetSplit || p.spm === undefined) {
    throw new Error("fixture has no split-and-rate work phase");
  }
  return p;
}

describe("the fixture is the shape this file claims", () => {
  it("Filling Low compiles to a warm-up plus four distance intervals", () => {
    expect(FIXTURE.program.intervals).toHaveLength(5);
    expect(FIXTURE.program.intervals[0]!.kind).toBe("time");
    expect(FIXTURE.program.intervals[1]!.kind).toBe("distance");
    expect(FIXTURE.phases.some((p) => p.type === "rest")).toBe(true);
    expect(firstWorkPhase().targetKind).toBe("split");
  });
});

describe("phaseIndexForInterval: the inverse of compileProgram's rest folding", () => {
  it("interval 0 is the first non-rest phase", () => {
    expect(phaseIndexForInterval(FIXTURE.phases, 0, false)).toBe(0);
    expect(FIXTURE.phases[0]!.type).toBe("warmup");
  });

  it("interval 1 skips the folded rest phases, not just one phase", () => {
    const index = phaseIndexForInterval(FIXTURE.phases, 1, false);
    expect(FIXTURE.phases[index]!.type).toBe("work");
    // The naive "interval n == phase n" reading would land on a REST phase
    // for at least one interval of this workout; this asserts it does not.
    for (let i = 0; i < FIXTURE.program.intervals.length; i += 1) {
      expect(
        FIXTURE.phases[phaseIndexForInterval(FIXTURE.phases, i, false)]!.type,
      ).not.toBe("rest");
    }
  });

  it("resting lands on the rest phase that folded onto that interval", () => {
    const rowing = phaseIndexForInterval(FIXTURE.phases, 1, false);
    const resting = phaseIndexForInterval(FIXTURE.phases, 1, true);
    expect(resting).toBe(rowing + 1);
    expect(FIXTURE.phases[resting]!.type).toBe("rest");
  });

  it("pins to the last phase when the machine counts past the program", () => {
    // Defence, not an expected path: `buildSurfaceModel` clamps the index
    // before this is called. Tested because a guard nothing exercises is a
    // guard nobody knows works.
    expect(phaseIndexForInterval(FIXTURE.phases, 99, false)).toBe(
      FIXTURE.phases.length - 1,
    );
    expect(phaseIndexForInterval([], 0, false)).toBe(0);
  });

  it("an interval whose phase has no rest after it stays on its own phase", () => {
    const last = FIXTURE.program.intervals.length - 1;
    const rowing = phaseIndexForInterval(FIXTURE.phases, last, false);
    const resting = phaseIndexForInterval(FIXTURE.phases, last, true);
    // Whichever this workout happens to be, the resting index is only ever
    // one further on when a rest phase is actually there.
    const hasRest = FIXTURE.phases[rowing + 1]?.type === "rest";
    expect(resting).toBe(hasRest ? rowing + 1 : rowing);
  });
});

describe("splitHero: the hero's whole/tenths cut", () => {
  it("cuts at the decimal `fmtSplit` always emits", () => {
    expect(splitHero("1:57.8")).toStrictEqual(["1:57", ".8"]);
  });

  it("keeps a decimal-less string whole rather than losing a digit", () => {
    // Unreachable through `fmtSplit` today; the branch exists so a future
    // change to that formatter degrades instead of truncating.
    expect(splitHero("157")).toStrictEqual(["157", ""]);
  });
});

describe("judgedValue: the one judgement path", () => {
  // `"faster"`/`"slower"` are the ROWER's direction, not the numeral's: a
  // smaller split is a faster boat (`domain/judge.ts`'s direction rule).
  it("tints slower/within/faster off the real tolerance, not a guess", () => {
    const target = 120;
    const within = judgedValue({
      kind: "pace",
      actual: target + PACE_TOLERANCE_SECONDS,
      target,
      stale: false,
      format: String,
    });
    const slower = judgedValue({
      kind: "pace",
      actual: target + PACE_TOLERANCE_SECONDS + 0.1,
      target,
      stale: false,
      format: String,
    });
    const faster = judgedValue({
      kind: "pace",
      actual: target - PACE_TOLERANCE_SECONDS - 0.1,
      target,
      stale: false,
      format: String,
    });
    expect(within.judgement).toBe("within");
    expect(slower.judgement).toBe("slower");
    expect(faster.judgement).toBe("faster");
  });

  it("a null actual is `—`, absent, and never a fabricated verdict", () => {
    const v = judgedValue({
      kind: "pace",
      actual: null,
      target: 120,
      stale: false,
      format: String,
    });
    expect(v.display).toBe("—");
    expect(v.absent).toBe(true);
    expect(v.judgement).toBe("within");
  });

  it("stale beats a value that would otherwise judge faster", () => {
    const v = judgedValue({
      kind: "pace",
      actual: 90,
      target: 120,
      stale: true,
      format: String,
    });
    expect(v.judgement).toBe("stale");
  });
});

describe("staleFor: the single place that decides WHEN a reading is stale", () => {
  it("only a lost link makes a reading stale — a paused erg is still talking", () => {
    expect(staleFor("stale")).toBe(true);
    expect(staleFor("paused")).toBe(false);
    expect(staleFor("live")).toBe(false);
    expect(staleFor("armed")).toBe(false);
  });
});

// `surfaceStatusFor` is GONE (task 2, connected-axes design spec §1): it
// used to narrow a `ConnectedPhase` to the four the surface draws and
// return `null` for everything else, which `buildSurfaceModel` laundered
// into `"live"` with its own `?? "live"` — the exact mechanism
// `docs/monitor/state-architecture-review.md` §F3 named as the shape that
// let an unenumerated phase (`"ready"`, once the rower asked for the
// numbers) render as a full live surface instead of the armed one it
// actually was. The caller now computes a real, non-nullable `status` from
// `connectedAxes.ts`'s four axes (`ConnectedSurface.tsx`'s own precedence
// comment) and this module never sees a `ConnectedPhase` at all.
describe('status plumbs through, non-nullable — the `?? "live"` laundering is gone', () => {
  it('an "armed" status renders as armed — the exact rendering (nowLabel, no judged colours) is Task 3\'s', () => {
    const m = model({ status: "armed" });
    expect(m.status).toBe("armed");
  });

  it("rejects a call with no status at all (@ts-expect-error) — there is nothing left to launder it into", () => {
    // @ts-expect-error — `status` is a required field of
    // `SurfaceModelInput`; the old `phase: ConnectedPhase` field (optional
    // in effect, since `surfaceStatusFor` mapped anything it didn't
    // recognise to `null` and this function's own `?? "live"` covered for
    // it) is gone, and so is the fallback.
    const m = buildSurfaceModel({
      phases: FIXTURE.phases,
      program: FIXTURE.program,
      frame: frame(),
      deviceName: DEVICE,
      actuals: [],
    });
    // If this suppression were ever exercised for real — a caller that
    // bypasses the type system, not one that fails to compile — the result
    // is an honestly undefined status, never a silent live surface: proof
    // the `?? "live"` laundering has nowhere left to hide, not just that it
    // no longer appears in this file.
    expect(m.status).toBeUndefined();
  });
});

// THE MIRROR (design spec §2, Item 3; 2a plan Task 3): wherever the
// MACHINE's own display shows 0, this surface must say the same thing —
// never the wire's carried-over ghost, and never a colour derived from
// comparing that ghost to a target.
describe("the mirror: 0 wherever the machine's own display shows 0", () => {
  /** NO_WARMUP, not FIXTURE: interval 0 IS the first work phase here (a
   *  real split + rate target), whereas FIXTURE's interval 0 is the
   *  warm-up (no target at all) — armed is "before the first pull of the
   *  SESSION", interval 0, so this is the realistic fixture for it. */
  function firstNoWarmupWorkPhase(): EnginePhase {
    const p = NO_WARMUP.phases[0];
    if (!p || p.type !== "work" || !p.targetSplit || p.spm === undefined) {
      throw new Error("fixture has no split-and-rate first work phase");
    }
    return p;
  }

  it("armed: rate mirrors to 0 plain (no judgement class); split mirrors to the TARGET as a preview, never the wire's carried-over ghost", () => {
    const target = firstNoWarmupWorkPhase();
    const m = buildSurfaceModel({
      phases: NO_WARMUP.phases,
      program: NO_WARMUP.program,
      status: "armed",
      frame: frame({
        state: "armed",
        intervalIndex: 0,
        rowingActive: false,
        distanceMeters: 0,
        // The fake's own taught ghost (fake.test.ts): a re-armed machine
        // carries the PREVIOUS piece's spm/split, not zero — the lab
        // captures' 13-96 spm range (spec's evidence dowry). Chosen far
        // from both 0 and the target so a leak of either failure mode
        // (still zero, or the raw ghost) is unmistakable.
        spm: 46,
        currentSplit: 251,
      }),
      deviceName: DEVICE,
      actuals: [],
    });

    expect(m.rate.display).toBe("0");
    expect(m.rate.judgement).toBe("within");
    expect(m.rate.absent).toBe(false);

    expect(m.pace.display).toBe(fmtSplit(target.targetSplit!));
    expect(m.pace.judgement).toBe("within");
    expect(m.pace.absent).toBe(false);
    // Not the wire's own ghost, and not a plain zero either.
    expect(m.pace.display).not.toBe(fmtSplit(251));
    expect(m.pace.display).not.toBe("0:00.0");
  });

  it("mid-session boundary: heroes mirror 0/unjudged while the wire still carries the previous interval's ghost (the walk's own observed frame)", () => {
    // session-b seq28 (docs/monitor/sessions/walk-2026-08-15/
    // session-b-poisoned.json): state=rowing, distance=0.8, rowingActive
    // false, spm 28 — status stays `live` (this is mid-session, not
    // pre-session `armed`).
    const m = model({
      status: "live",
      frame: frame({
        state: "rowing",
        intervalIndex: 1,
        rowingActive: false,
        distanceMeters: 0.8,
        spm: 28,
        currentSplit: 133,
      }),
    });
    expect(m.pace.display).toBe("0:00.0");
    expect(m.pace.judgement).toBe("within");
    expect(m.pace.absent).toBe(false);
    expect(m.rate.display).toBe("0");
    expect(m.rate.judgement).toBe("within");
    expect(m.rate.absent).toBe(false);
  });

  it("the guard: once distance advances past the reset window, the mirror ends and judged values return — even with rowingActive still false", () => {
    const target = firstWorkPhase();
    const m = model({
      status: "live",
      frame: frame({
        state: "rowing",
        intervalIndex: 1,
        // Still false — isolating the DISTANCE half of the discriminator:
        // a mutant that dropped only the distance check would still pass
        // if this test also flipped rowingActive true.
        rowingActive: false,
        distanceMeters: 5.4, // the walk's own guard case: 0.8 -> 5.4
        spm: target.spm! + 10,
        currentSplit: target.targetSplit! - 10,
      }),
    });
    expect(m.pace.display).not.toBe("0:00.0");
    expect(m.pace.judgement).toBe("faster"); // 10s quicker than target
    expect(m.rate.display).toBe(String(target.spm! + 10));
    expect(m.rate.judgement).toBe("faster"); // a higher rate reads faster
  });

  it("grid agreement: buildGridModel's active row shares the SAME mirrored JudgedValue objects pane B renders", () => {
    const target = firstNoWarmupWorkPhase();
    const m = buildSurfaceModel({
      phases: NO_WARMUP.phases,
      program: NO_WARMUP.program,
      status: "armed",
      frame: frame({
        state: "armed",
        intervalIndex: 0,
        rowingActive: false,
        distanceMeters: 0,
        spm: 46,
        currentSplit: 251,
      }),
      deviceName: DEVICE,
      actuals: [],
    });
    const activeRow = m.grid.rows[m.grid.activeIndex]!;
    expect(activeRow.index).toBe(0);
    // Referential identity, not just equal values (`buildGridModel`'s own
    // comment: "the SAME objects, so a rower swiping cannot find the split
    // judged one way on one pane and another way on the next") — this is
    // what makes it structurally impossible for the grid to disagree with
    // pane B about the mirror, rather than merely unlikely today.
    expect(activeRow.pace.judged).toBe(m.pace);
    expect(activeRow.spm.judged).toBe(m.rate);
    expect(activeRow.pace.display).toBe(fmtSplit(target.targetSplit!));
    expect(activeRow.spm.display).toBe("0");
  });
});

// I-1, final whole-branch review fix wave: three properties design frame
// 2D names (`docs/design/handoffs/2026-08-15-connected-v2/README.md`, "2D ·
// First frame") that the mirror above never touched, dropped at the task
// seam ConnectedSurface.test.tsx's own comment names ("Task 3 owns the armed
// pane"). All three are asserted at the MODEL layer per this task's brief —
// the consequence a pane renders, not a DOM smoke test standing in for it.
describe("armed's first frame (I-1): the three properties 2D asks for beyond the mirror", () => {
  it('carries no "NOW" over either hero — 2D shows no label at all above the heroes, unlike live/paused', () => {
    const m = model({ status: "armed", frame: frame({ state: "armed" }) });
    expect(m.nowLabel).toBe("");
    // CR2 spec 3 Task 2 (design spec §3 fate table): the `NOW` branch DIES
    // outright, not just at armed — 2A's own property table cuts the label
    // from LIVE entirely ("Cut from LIVE: NO NOW/TARGET/UP NEXT labels"),
    // so live and paused now read the SAME empty string armed always did.
    // `stale` is the only status this field still has a word for.
    expect(model({ status: "stale" }).nowLabel).toBe("LAST");
    expect(model({ status: "live" }).nowLabel).toBe("");
    expect(model({ status: "paused" }).nowLabel).toBe("");
  });

  it("the grid's active row carries no gold counting mark — nothing is counting down before the first stroke", () => {
    const m = buildSurfaceModel({
      phases: NO_WARMUP.phases,
      program: NO_WARMUP.program,
      status: "armed",
      frame: frame({
        state: "armed",
        intervalIndex: 0,
        rowingActive: false,
        distanceMeters: 0,
      }),
      deviceName: DEVICE,
      actuals: [],
    });
    const activeRow = m.grid.rows[m.grid.activeIndex]!;
    expect(activeRow.state).toBe("active");
    expect(activeRow.countdown).toBeNull();
    // A live status on the SAME row shape still marks it — this is an
    // armed-only suppression, not a regression of the mark itself
    // (PaneGrid.test.tsx's own "still MARKS" test covers the live case in
    // the DOM; this pins the model field that mark reads).
    const liveModel = buildSurfaceModel({
      phases: NO_WARMUP.phases,
      program: NO_WARMUP.program,
      status: "live",
      frame: frame({ intervalIndex: 0 }),
      deviceName: DEVICE,
      actuals: [],
    });
    expect(
      liveModel.grid.rows[liveModel.grid.activeIndex]!.countdown,
    ).not.toBeNull();
  });

  it("TOTAL LEFT reads the whole session, un-started — never the wire's carried-over elapsed", () => {
    const totalSeconds = totalSessionSecondsOf(NO_WARMUP.phases);
    const m = buildSurfaceModel({
      phases: NO_WARMUP.phases,
      program: NO_WARMUP.program,
      status: "armed",
      // A non-zero sessionElapsedSeconds on the armed frame — the same
      // shape a stale carried-over reading would have (the design's own
      // §2 Item 3 citation: only spm/currentSplit genuinely carry over on
      // the wire, elapsed/distance genuinely zero — but the surface must
      // say "un-started" REGARDLESS of what the frame happens to hold,
      // the same defensive stance the pace/rate mirror already takes
      // rather than trusting the wire not to glitch).
      frame: frame({
        state: "armed",
        intervalIndex: 0,
        rowingActive: false,
        distanceMeters: 0,
        elapsedSeconds: 900,
        sessionElapsedSeconds: 900,
      }),
      deviceName: DEVICE,
      actuals: [],
    });
    // `totalLeftSeconds` died off `SurfaceModel` (CR2 spec 3 Task 4, spec
    // §3 fate table) — `totalLeftDisplay` is the only surviving carrier of
    // this fact, so that is what this test reads.
    expect(m.totalLeftDisplay).toBe(fmtDuration(totalSeconds / 60));
    // Not armed: the ordinary subtraction still applies, so this is a
    // suppression scoped to armed, not a change to the live formula.
    const liveModel = model({
      status: "live",
      frame: frame({ sessionElapsedSeconds: 900, elapsedSeconds: 900 }),
    });
    expect(liveModel.totalLeftDisplay).not.toBe(
      fmtDuration(totalSessionSecondsOf(FIXTURE.phases) / 60),
    );
  });
});

// CR2 spec 3 Task 2 (design spec §2D — "the READY word ships HERE",
// PROVENANCE item 3): the armed branch of `intervalLabelShort`.
describe("READY (design spec §2D): the armed branch of intervalLabelShort", () => {
  it("armed on a numbered interval reads the ordinal plus READY, never WORK", () => {
    const m = model({
      status: "armed",
      frame: frame({ state: "armed", intervalIndex: 1 }),
    });
    expect(m.intervalLabelShort).toBe("1 OF 4 · READY");
    // Non-armed, the SAME interval: entirely unaffected by this task — the
    // ordinary `N OF M · WORK` formula, still exercised at this exact
    // index by the "live" describe block below, pinned again here so the
    // two branches sit side by side.
    const live = model({ frame: frame({ intervalIndex: 1 }) });
    expect(live.intervalLabelShort).toBe("1 OF 4 · WORK");
  });

  it("armed on the WARM-UP (a realistic warm-up-bearing fixture) reads bare READY — no ordinal prefix", () => {
    // FIXTURE (not NO_WARMUP): a real warm-up-bearing library program,
    // armed at interval 0 — the only realistic armed case, since nothing
    // has happened yet and the machine always starts at interval 0.
    expect(FIXTURE.program.intervals[0]!.type).toBe("warmup");
    const m = buildSurfaceModel({
      phases: FIXTURE.phases,
      program: FIXTURE.program,
      status: "armed",
      frame: frame({
        state: "armed",
        intervalIndex: 0,
        rowingActive: false,
        distanceMeters: 0,
      }),
      deviceName: DEVICE,
      actuals: [],
    });
    expect(m.intervalLabelShort).toBe("READY");
    expect(m.intervalLabelShort).not.toMatch(/OF/);
  });
});

// CR2 spec 3 Task 2 (design spec §3, composition note under §2B): the
// ordinal-only sibling `intervalLabelShort` bakes its phase word out of —
// Task 5's grid header (`ConnectedSurface.tsx`'s `headerTrailing`) joins
// this with `totalLeftDisplay` instead.
describe("intervalOrdinalLabel: the ordinal without the phase word (design spec §3)", () => {
  it("is the ordinal plus the work count when the interval is numbered", () => {
    const m = model({ frame: frame({ intervalIndex: 1 }) });
    expect(m.intervalOrdinalLabel).toBe("1 OF 4");
  });

  it("is null on the warm-up — the same null rule intervalLabelShort applies", () => {
    const m = model({ frame: frame({ intervalIndex: 0 }) });
    expect(FIXTURE.phases[0]!.type).toBe("warmup");
    expect(m.intervalOrdinalLabel).toBeNull();
  });

  it("never disagrees with the caption's own ordinal, on the same call", () => {
    // One `ordinal`, read once (this file's own header rule) — the grid `#`
    // column and the header caption already share it; this pins the new
    // field into the same invariant rather than trusting it by inspection.
    // The boolean is computed OUTSIDE `expect` (vitest/no-conditional-expect
    // bans branching around the assertion itself), so every iteration still
    // makes exactly one unconditional call.
    for (let i = 0; i < FIXTURE.program.intervals.length; i += 1) {
      const m = model({ frame: frame({ intervalIndex: i }) });
      const agrees =
        m.intervalOrdinalLabel === null
          ? !/OF/.test(m.intervalLabelShort)
          : m.intervalLabelShort.startsWith(m.intervalOrdinalLabel);
      expect(agrees).toBe(true);
    }
  });
});

// Phase CS Item B (connected-polish design spec, "The NEXT line says
// more"): `connectedNextText` is the ONE builder for `SurfaceModel.upNext`
// now — exhaustive over `EnginePhase["type"]`, built from `label` (the
// domain's already-resolved display value) plus extent and `@spm`, never
// re-derived from `targetSplit`. `thenNext` is gone from the model
// entirely (the then-clause dies everywhere, James's ruling) — the old
// "armed's up-next" describe block above tested both fields through
// `buildSurfaceModel`; this one tests the builder directly, one `it` per
// composition-table row, plus the armed-shift integration case the old
// block's first test covered.
//
// EVERY EXPECTED STRING BELOW IS HARDCODED, not recomputed with
// `fmtSplit`/`fmtDuration` inside the assertion (the anti-tautology idiom,
// task-1 brief) — `phase.label` for a split-target work phase already IS
// `fmtSplit(targetSplit)` (`domain/expand.ts`'s own `phases()`), so calling
// `fmtSplit` again in the test would only prove the two call sites agree
// with EACH OTHER, not that either is right. The literals were read off
// each fixture's own known inputs (`server/seed/library/at.ts`'s "Filling
// Low"/"Occluded Front", `k6Seconds: 122`/`off: 4` -> 126s -> `2:06.0`) at
// test-writing time.
describe('connectedNextText: exhaustive over Phase["type"] (Item B composition table)', () => {
  it("work, distance, split target, spm set -> WORK {meters}m · {label} @{spm}", () => {
    // FIXTURE (Filling Low, 8' time warm-up): phases[0] warm-up, phases[1]
    // the first work phase (2000m, 6k+4 -> 126s -> `2:06.0`, spm 22).
    // `connectedNextText(phases, 0)` names `phases[1]` — the SAME +1 offset
    // `upNextTextAt` always had (see the armed-shift test below).
    expect(connectedNextText(FIXTURE.phases, 0)).toBe(
      "WORK 2000m · 2:06.0 @22",
    );
  });

  it("work, time, split target, spm set -> WORK {duration} · {label} @{spm}", () => {
    // Occluded Front: one continuous 10' work phase at 6k+4 (same 126s ->
    // `2:06.0`), spm 22, no reps/rest — phases[0] is the only phase, so
    // `connectedNextText(phases, -1)` (index + 1 === 0) names it.
    expect(connectedNextText(OCCLUDED.phases, -1)).toBe(
      "WORK 10:00 · 2:06.0 @22",
    );
  });

  it("work, distance, effort target, no spm -> WORK {meters}m · {label word}, no rate", () => {
    // "First 2k" (onboarding): 2000m at MAX effort, no spm at all — the one
    // real production shape with an effort target AND no spm (see
    // `EFFORT_METERS_NO_SPM`'s own comment). `effortWord("max")` is
    // `"ALL OUT"`.
    expect(connectedNextText(EFFORT_METERS_NO_SPM, -1)).toBe(
      "WORK 2000m · ALL OUT",
    );
  });

  it("warm-up, distance -> WARM-UP {meters}m · Easy", () => {
    // WARMUP_METERS: Filling Low with the warm-up preference at
    // `kind: "distance", meters: 2000` — phases[0] is the warm-up.
    expect(connectedNextText(WARMUP_METERS.phases, -1)).toBe(
      "WARM-UP 2000m · Easy",
    );
  });

  it("warm-up, time -> WARM-UP {duration} · Easy", () => {
    // FIXTURE's own 8' time warm-up — phases[0].
    expect(connectedNextText(FIXTURE.phases, -1)).toBe("WARM-UP 8:00 · Easy");
  });

  it("test -> TEST · All out (no extent fields exist on a test phase)", () => {
    expect(connectedNextText(TEST_PHASES, -1)).toBe("TEST · All out");
  });

  it("rest -> REST {duration}", () => {
    // FIXTURE.phases[2] is the rest folded after the first work phase
    // (Filling Low's own `restMinutes: 3`) — `connectedNextText(phases, 1)`
    // names it.
    expect(connectedNextText(FIXTURE.phases, 1)).toBe("REST 3:00");
  });

  it("past the last phase -> FINISH", () => {
    expect(connectedNextText(FIXTURE.phases, FIXTURE.phases.length - 1)).toBe(
      "FINISH",
    );
  });

  it("work, split target, spm UNSET -> no @ anywhere in the string", () => {
    // Derived from the real Filling Low work phase (which DOES carry spm)
    // by stripping the one field under test — `library.test.ts`'s own
    // "spm-present-and-even on every work step" rule means no REAL fixture
    // in the seeded 300 reaches a split-target work phase with no spm at
    // all (see `EFFORT_METERS_NO_SPM`'s comment for the analogous effort
    // case), so this is real-shape-minus-one-field, not a hand-minimal stub.
    const work = firstWorkPhase();
    const { spm: _spm, ...withoutSpm } = work;
    const text = connectedNextText([withoutSpm], -1);
    expect(text).not.toContain("@");
    expect(text).toBe(`WORK ${work.meters}m · ${work.label}`);
  });

  // CR2 spec 3 Task 2 (design spec §2D, antagonist corrections 2 and 3): at
  // armed, up-next reads the FIRST interval forward — `phases[phaseIndex]`
  // — not `phases[phaseIndex + 1]`, which is what the ordinary (non-armed)
  // formula reads and what the committed `connected-armed-landscape.png`
  // shows as the pre-task defect (the coming REST at armed instead of the
  // coming WORK). This is `SurfaceModel.upNext` end to end (not
  // `connectedNextText` called directly), because the shift itself lives
  // in `buildSurfaceModel`, at the call site, not in the builder.
  it("armed shift: at armedMirror the value names phases[phaseIndex], not phases[phaseIndex + 1]", () => {
    // NO_WARMUP: interval 0 IS the first work phase (phases[0] work,
    // phases[1] its folded rest) — the realistic no-warm-up fixture most
    // sessions actually have, armed at its only possible index, 0.
    const work = NO_WARMUP.phases[0]!;
    if (work.type !== "work" || work.targetSplit === undefined) {
      throw new Error("fixture assumption broke: phase 0 is not split work");
    }

    const armedModel = buildSurfaceModel({
      phases: NO_WARMUP.phases,
      program: NO_WARMUP.program,
      status: "armed",
      frame: frame({
        state: "armed",
        intervalIndex: 0,
        rowingActive: false,
        distanceMeters: 0,
      }),
      deviceName: DEVICE,
      actuals: [],
    });
    // Hardcoded, not `WORK ${fmtSplit(work.targetSplit)}` — same
    // anti-tautology reasoning as the property rows above.
    expect(armedModel.upNext).toBe("WORK 2000m · 2:06.0 @22");

    const liveModel = buildSurfaceModel({
      phases: NO_WARMUP.phases,
      program: NO_WARMUP.program,
      status: "live",
      frame: frame({ intervalIndex: 0 }),
      deviceName: DEVICE,
      actuals: [],
    });
    // The ordinary (non-armed) formula at interval 0 names the REST that
    // follows the first work phase, not the work phase itself — the exact
    // shift the armed case above proves it does NOT take.
    expect(liveModel.upNext).toBe("REST 3:00");
    expect(armedModel.upNext).not.toBe(liveModel.upNext);
  });

  it('`thenNext` is gone from the model — "thenNext" in model === false', () => {
    expect("thenNext" in model()).toBe(false);
  });
});

// CR2 spec 3 Task 2 (antagonist correction 1): the model's own numeric
// elapsed, Task 3's progress bar needs it since `totalLeftSeconds` (the
// subtraction route) dies in Task 4/5.
describe("elapsedSeconds: the model's own numeric elapsed (Task 3's progress bar)", () => {
  it("mirrors sessionElapsedSeconds directly, off armed", () => {
    const m = model({ frame: frame({ elapsedSeconds: 600 }) });
    expect(m.elapsedSeconds).toBe(600);
  });

  it("never exceeds totalSeconds — the same overrun cap totalLeftSeconds already enforces from the other direction", () => {
    const m = model({ frame: frame({ elapsedSeconds: 999_999 }) });
    expect(m.elapsedSeconds).toBe(m.totalSeconds);
    expect(m.elapsedSeconds).not.toBe(999_999);
  });

  it("reads 0 on the armedMirror branch, regardless of what the wire carries over — mirrors totalLeftSeconds's own armed stance", () => {
    const m = buildSurfaceModel({
      phases: NO_WARMUP.phases,
      program: NO_WARMUP.program,
      status: "armed",
      // A non-zero carried-over pair, the same shape `totalLeftSeconds`'s
      // own armed test uses, to prove the suppression does not merely
      // coincide with an honestly-zero wire value.
      frame: frame({
        state: "armed",
        intervalIndex: 0,
        rowingActive: false,
        distanceMeters: 0,
        elapsedSeconds: 900,
        sessionElapsedSeconds: 900,
      }),
      deviceName: DEVICE,
      actuals: [],
    });
    expect(m.elapsedSeconds).toBe(0);
    // Not armed: the ordinary mirror still applies — a suppression scoped
    // to armed, not a change to the live formula.
    const liveModel = model({
      status: "live",
      frame: frame({ sessionElapsedSeconds: 900, elapsedSeconds: 900 }),
    });
    expect(liveModel.elapsedSeconds).toBe(900);
  });
});

describe("live", () => {
  it("names the machine's interval out of the program's own count", () => {
    const m = model({ frame: frame({ intervalIndex: 1 }) });
    // §5b: the warm-up is interval 0 of the PROGRAM and no part of the count
    // the rower keeps — this is the FIRST of Filling Low's four 2000 m reps.
    expect(m.intervalLabel).toBe("INTERVAL 1 OF 4 · WORK");
    expect(m.intervalLabelShort).toBe("1 OF 4 · WORK");
  });

  it("keeps the device's own advertised name, with no promise attached", () => {
    expect(model().deviceCaption).toBe(DEVICE);
    expect(model().linked).toBe(true);
  });

  it("judges the split against the phase's own resolved target", () => {
    const target = firstWorkPhase().targetSplit!;
    // Ten seconds per 500 m quicker than asked reads `"faster"`, blue.
    expect(
      model({ frame: frame({ currentSplit: target - 10 }) }).pace.judgement,
    ).toBe("faster");
    expect(
      model({ frame: frame({ currentSplit: target + 10 }) }).pace.judgement,
    ).toBe("slower");
    expect(
      model({ frame: frame({ currentSplit: target }) }).pace.judgement,
    ).toBe("within");
  });

  it("judges the rate against the phase's own spm (Filling Low authors @22)", () => {
    const spm = firstWorkPhase().spm!;
    expect(spm).toBe(22);
    expect(model({ frame: frame({ spm: spm + 10 }) }).rate.judgement).toBe(
      "faster",
    );
    expect(model({ frame: frame({ spm: spm - 10 }) }).rate.judgement).toBe(
      "slower",
    );
    expect(model().targetRate.main).toBe(String(spm));
  });

  it("cuts the hero split so the tenths can be set smaller", () => {
    const m = model({ frame: frame({ currentSplit: 117.8 }) });
    expect(m.pace.display).toBe("1:57.8");
    expect(m.paceWhole).toBe("1:57");
    expect(m.paceTenths).toBe(".8");
  });

  // `intervalClockLabel` (`METERS LEFT`/`LEFT IN INTERVAL`) died off
  // `SurfaceModel` at CR2 spec 3 Task 4 (spec §3 fate table) — `PaneLive`'s
  // own metric-row cell was its only render site, and the redesign cuts
  // that cell outright. `intervalClockValue` — the sibling this describe
  // block's own two tests used to pin — dies HERE, at Task 5 (antagonist
  // correction 1): the grid headline that read it is deleted outright
  // (`PaneGrid.tsx`'s own header comment), and the grid's active-row
  // countdown cell was never actually fed by this field — it has its own
  // independent computation, `countdownDisplayFor` below, which
  // `buildGridModel`'s own describe blocks pin directly. Both tests are
  // gone with the field; "the four fields die" describe block further down
  // this file (now five) pins the deletion structurally.

  // `intervalProgressPct`'s own two its (the fill-direction pin and the
  // 0-100 clamp) retired with the field itself (connected-revamp Task 3,
  // retirement inventory §10.2: design spec §3's casualty table calls the
  // field DROPPED outright — "the metric row's countdown is the same fact
  // as a number, and revision §3's live layout has no slot" for a second
  // bar — and Task 2's own fix round left it computed with no renderer
  // rather than deleting it out of scope. No replacement pin: the field
  // and its only two consumers are simply gone.

  // THE HERO CANNOT CLIP (design spec §6/revision §3's own "anything
  // slower than 9:59.9 -> —"). A boundary glitch or a stalled erg can
  // report a currentSplit with no realistic ceiling; `PACE_HERO_CAP_SECONDS`
  // is the line this file draws so the hero never has to render more
  // characters than it was sized for.
  it("caps the hero split at 9:59.9 — anything slower renders the dash, unjudged", () => {
    const atCap = model({ frame: frame({ currentSplit: 599.9 }) });
    expect(atCap.pace.display).toBe("9:59.9");
    expect(atCap.pace.absent).toBe(false);

    const overCap = model({ frame: frame({ currentSplit: 600 }) });
    expect(overCap.pace.display).toBe("—");
    expect(overCap.pace.absent).toBe(true);
    // A capped reading is "nothing to show", not a deviation — the same
    // rule 2 an absent actual already takes (`domain/judge.ts`).
    expect(overCap.pace.judgement).toBe("within");

    const wildlyOverCap = model({ frame: frame({ currentSplit: 3661 }) });
    expect(wildlyOverCap.pace.display).toBe("—");
  });

  // THE NO-TARGET STATE (design spec §6, adversarial finding): every REST
  // phase has no target. `phaseIndexForInterval`'s own resting rule lands
  // interval 1's REST phase when `state: "resting"` sits on `intervalIndex:
  // 1` (the fixture's own first work rep — this file's header names the
  // shape: warm-up, then 4 x 2000m with rest folded after each).
  it("during REST both targets NAME the phase (Rest / Free), greyed, and the actual above stays unjudged", () => {
    // Derived the same way `phaseIndexForInterval`'s own describe block
    // does above, rather than a hardcoded index: interval 1, resting.
    const restIndex = phaseIndexForInterval(FIXTURE.phases, 1, true);
    if (FIXTURE.phases[restIndex]?.type !== "rest") {
      throw new Error("fixture assumption broke: interval 1 has no REST");
    }
    const m = model({
      frame: frame({
        intervalIndex: 1,
        state: "resting",
        // A reading that would otherwise scream "faster" against ANY real
        // target, to prove the no-target case is what suppresses the
        // tint, not a coincidentally-within actual.
        currentSplit: 60,
        spm: 40,
      }),
    });
    // The WORD, not a dash (James, 2026-08-12). `absent` is what keeps
    // §6's original concern answered: greyed, so it cannot pass for a
    // programmed number. Both are asserted — the word alone would let a
    // regression render it in the target's own weight and stay green.
    expect(m.targetSplit.main).toBe("Rest");
    expect(m.targetSplit.absent).toBe(true);
    expect(m.pace.judgement).toBe("within");
    expect(m.pace.absent).toBe(false);
    expect(m.targetRate.main).toBe("Free");
    expect(m.targetRate.absent).toBe(true);
    expect(m.rate.judgement).toBe("within");
    expect(m.rate.absent).toBe(false);
  });

  // THE EFFORT WORK PHASE (tail review I-1). An effort target's split is an
  // ESTIMATE `compileProgram` deliberately never programs, so this slot has
  // no number either — and since 2026-08-13 it names the phase like every
  // other no-target case. The word is `domain/pace.ts`'s `effortWord`, which
  // is CAPS, and caps is what ships: `phase.label` for an effort phase is
  // that literal everywhere else in the app too (the timer's UP NEXT strip
  // one row above this slot, `StepRow`'s library rows, and `logDraft.ts`,
  // which reads it back through `effortFromWord` on a cast). Title-casing it
  // here alone would put `All out` in the card and `WORK ALL OUT` in the
  // strip beside it. See the FREE comment in `session/TimerTargets.tsx`.
  it("an EFFORT work phase names its effort in the target slot, in the domain's own caps, greyed and unjudged", () => {
    const easy = buildSurfaceModel({
      phases: EFFORT_MIN.phases,
      program: EFFORT_MIN.program,
      status: "live",
      frame: frame({
        intervalIndex: 1,
        // A split that would read `"faster"` against the 5' paddle's own
        // estimate (6k+20 = 142) if anything judged against it. Nothing
        // may: the estimate is not a programmed target.
        currentSplit: 100,
      }),
      deviceName: DEVICE,
      actuals: [],
    });
    expect(EFFORT_MIN.phases[1]!.targetKind).toBe("effort");
    // EXACT, same reason as `TimerTargets.test.tsx`'s twin (close-out
    // review, Minor 7): the point is that a REAL number is being
    // withheld from the slot, and a presence check passes on `null`.
    expect(EFFORT_MIN.phases[1]!.targetSplit).toBe(142);
    expect(easy.targetSplit.main).toBe("EASY");
    expect(easy.targetSplit.sub).toBeNull();
    expect(easy.targetSplit.absent).toBe(true);
    expect(easy.targetSplitCaption).toBe("");
    expect(easy.pace.judgement).toBe("within");
    // The RATE half is a real programmed target on this phase (Fog Bow's
    // paddle is authored @20), so the two halves of the slot differ — which
    // is what proves `absent` is keyed on the split, not on the phase kind.
    expect(easy.targetRate.main).toBe("20");
    expect(easy.targetRate.absent).toBe(false);

    // The SAME model's neighbouring interval carries a split ref, so the
    // number and the word come out of one program, one call, one fixture.
    const numeric = buildSurfaceModel({
      phases: EFFORT_MIN.phases,
      program: EFFORT_MIN.program,
      status: "live",
      frame: frame({ intervalIndex: 0 }),
      deviceName: DEVICE,
      actuals: [],
    });
    expect(numeric.targetSplit.main).toBe("2:14.0"); // 6k 122 + 12
    expect(numeric.targetSplit.absent).toBe(false);
    expect(numeric.targetSplitCaption).toBe("6K +12");

    const allOut = buildSurfaceModel({
      phases: EFFORT_MAX.phases,
      program: EFFORT_MAX.program,
      status: "live",
      frame: frame({ intervalIndex: 0, currentSplit: 100 }),
      deviceName: DEVICE,
      actuals: [],
    });
    expect(EFFORT_MAX.phases[0]!.targetKind).toBe("effort");
    expect(allOut.targetSplit.main).toBe("ALL OUT");
    expect(allOut.targetSplit.absent).toBe(true);
    expect(allOut.pace.judgement).toBe("within");

    // AND THE PHONE TIMER SAYS THE SAME THING. The two surfaces share
    // `targetSplitDisplay`, so this holds by construction today — pinning it
    // is what stops the connected branch from growing its own effort case
    // (the `main: phase ? phase.label : DASH` fallback above is one edit
    // away from being that). `session/TimerTargets.test.tsx` renders the
    // other half against the same two workouts.
    expect(easy.targetSplit.main).toBe(
      targetSplitDisplay(EFFORT_MIN.phases[1]!).main,
    );
    expect(allOut.targetSplit.main).toBe(
      targetSplitDisplay(EFFORT_MAX.phases[0]!).main,
    );
  });

  it("prices TOTAL LEFT off the workout's own phases, not the machine's guess", () => {
    // THE NUMBER, not a floor, and not `totalSeconds` compared to itself
    // (test-integrity sweep, P14). `totalLeftSeconds === totalSeconds - 600`
    // re-implements the impl's own one-liner and says nothing about where
    // `totalSeconds` came from — which is the whole of this test's title.
    // Proven: `totalSessionSecondsOf(phases) + 600` and `- 600` each left
    // 61/61 green, a ten-minute error in the session total invisible to the
    // entire file.
    //
    // 3216 s, derived from the fixture rather than read back off the model:
    // an 8:00 warm-up (480) + 4 x 2000 m at the resolved 2:06.0 target
    // split, i.e. 4 x 4 x 126 = 2016 s of work, + 4 x 3:00 rest (720).
    // 480 + 2016 + 720 = 3216.
    //
    // `totalLeftSeconds` died off `SurfaceModel` (CR2 spec 3 Task 4) —
    // `totalLeftDisplay` is the field this proof reads now.
    const m = model({ frame: frame({ elapsedSeconds: 600 }) });
    expect(m.totalSeconds).toBe(3216);
    expect(m.totalLeftDisplay).toBe(fmtDuration((3216 - 600) / 60));
  });

  it("never reports a negative total left when the machine overruns", () => {
    const m = model({ frame: frame({ elapsedSeconds: 999_999 }) });
    expect(m.totalLeftDisplay).toBe(fmtDuration(0));
  });

  // `SurfaceModel.segments` retired (connected-revamp Task 3 fix round,
  // task-3-review.md Important-3): its only remaining consumer,
  // `IntervalSegments` on pane B, went with this task's own segment-bar
  // removal (design spec §3's casualty list), and `Timer.tsx:630`'s
  // surviving usage builds its own props from `currentRun`, never from
  // `SurfaceModel`. This test's own premise — proving segments/UP NEXT
  // read the same "for whichever pane asks" — died from both directions
  // once `PaneTimer.tsx` (Task 2) and this pane's own segment bar (Task 3)
  // left exactly one pane standing.
});

// ---------------------------------------------------------------------------
// Walk 4 (2026-08-08, interface-notes.md §18): 0x0031's clock and distance
// RESET at every work interval. Both of these panes read the accumulated
// session pair now; these are the two failures the walk actually recorded.
// ---------------------------------------------------------------------------

describe("the session pair across a work-interval reset (walk 4)", () => {
  /** The recorded shape, frame for frame: the last `resting` frame of
   *  interval 1 (`elapsed=37.81 distance=101.8`), the first `rowing` frame of
   *  interval 2 with 0x0031's own pair back at the floor
   *  (`elapsed=0 distance=0.7`), and one frame further in. The driver's
   *  accumulated pair climbs straight through the reset the raw pair takes. */
  const ACROSS_THE_RESET = [
    frame({
      state: "resting",
      elapsedSeconds: 37.81,
      distanceMeters: 101.8,
      sessionElapsedSeconds: 37.81,
      sessionDistanceMeters: 101.8,
    }),
    frame({
      state: "rowing",
      elapsedSeconds: 0,
      distanceMeters: 0.7,
      sessionElapsedSeconds: 37.81,
      sessionDistanceMeters: 102.5,
    }),
    frame({
      state: "rowing",
      elapsedSeconds: 1.2,
      distanceMeters: 3.1,
      sessionElapsedSeconds: 39.01,
      sessionDistanceMeters: 104.9,
    }),
  ];

  // `totalLeftSeconds` died off `SurfaceModel` (CR2 spec 3 Task 4) — this
  // test now proves the identical session-pair fact from the complementary
  // field, `elapsedSeconds` (Task 2's own field, kept: `totalLeftDisplay`
  // is `fmtDuration((totalSeconds - elapsedSeconds-derived value)/60)`
  // internally, so an `elapsedSeconds` that never FALLS across the reset is
  // exactly what makes TOTAL LEFT never RISE — the same bug, read from the
  // other direction).
  it("elapsedSeconds never falls across the reset (the recorded 1:11 -> 1:38 TOTAL LEFT bug, same session pair)", () => {
    const elapsed = ACROSS_THE_RESET.map(
      (f) => model({ frame: f }).elapsedSeconds,
    );

    // Exact, not merely monotone: the middle frame is the one the recording
    // caught jumping BACKWARDS on the raw clock — `elapsedSeconds` reads
    // `sessionElapsedSeconds` (the driver's accumulated pair), which climbs
    // straight through that reset rather than repeating it.
    expect(elapsed).toStrictEqual([37.81, 37.81, 39.01]);
  });

  // `SurfaceModel.meters` died with it (CR2 spec 3 Task 4, spec §3 fate
  // table) — `PaneLive`'s own `TOTAL M` cell was its only render site, and
  // the redesign cuts it outright. `GridRow.meters` is a DIFFERENT field
  // (per-interval, not session-wide) with its own tests in
  // `PaneGrid.test.tsx`; this walk-4 regression has no remaining surface on
  // `SurfaceModel` to prove it against beyond `elapsedSeconds` (above) and
  // `elapsedDisplay` (below).

  it("the SESSION caption's clock keeps running through the reset too", () => {
    const shown = ACROSS_THE_RESET.map(
      (f) => model({ frame: f }).elapsedDisplay,
    );

    // The log sheet captions this `SESSION m:ss`; a reset frame reading 0:00
    // mid-piece is the same defect wearing a different label.
    expect(shown[1]).toBe(shown[0]);
    expect(shown[1]).not.toBe(
      model({ frame: frame({ elapsedSeconds: 0 }) }).elapsedDisplay,
    );
  });

  // THE DISCRIMINATOR (antagonist phase-exit pass, §2B witness gap): every
  // frame factory in this repo defaults `sessionElapsedSeconds ??
  // f.elapsedSeconds`, so a suite full of mirrored pairs cannot tell WHICH
  // elapsed `totalLeftDisplay` subtracts — mutating the model to read the
  // interval-resetting `frame.elapsedSeconds` left everything green while
  // reintroducing the recorded 1:11 -> 1:38 TOTAL LEFT bug. This test is
  // the one place the pair DIVERGES under a `totalLeftDisplay` assertion:
  // the reset frame's raw clock is 0, its session clock is 37.81, and the
  // remaining time must move with the session clock.
  it("TOTAL LEFT subtracts the SESSION clock, never the interval's own resetting one", () => {
    const [before, atReset] = ACROSS_THE_RESET;
    const shownBefore = model({ frame: before }).totalLeftDisplay;
    const shownAtReset = model({ frame: atReset }).totalLeftDisplay;

    // Same session elapsed (37.81) on both sides of the raw-clock reset,
    // so the remaining clock must not move...
    expect(shownAtReset).toBe(shownBefore);
    // ...and must differ from what a zeroed elapsed would show — which is
    // exactly what the wrong-field mutation renders at the reset frame.
    expect(shownAtReset).not.toBe(
      model({
        frame: frame({ elapsedSeconds: 0, sessionElapsedSeconds: 0 }),
      }).totalLeftDisplay,
    );
  });
});

// `SurfaceModel.hr` died (CR2 spec 3 Task 4, spec §3 fate table):
// `PaneLive`'s own HR cell was its only render site, and the redesign cuts
// it outright — HR survives only as the grid's own COLUMN, off `GridRow`,
// with its own coverage in `PaneGrid.test.tsx`. The describe block that
// used to live here tested `hr.absent`/`hr.display` directly off
// `SurfaceModel`, which no longer exposes either.

describe("a zero split is not a reading (7B iteration: the pre-pull tinted 0:00.0)", () => {
  it("live with currentSplit 0 renders the dash, unjudged — never 0:00.0 painted against the target", () => {
    // Hardware walk 2: before the first pull the PM reports Current Pace
    // 0, and the hero judged it as FASTER than target (0 < anything) — a
    // verdict colour at a rower who had not taken a stroke. (The walk saw
    // it in ochre; that state is blue since the 2026-08-13 repaint. The
    // colour is not what the test is about.)
    const m = model({ status: "live", frame: frame({ currentSplit: 0 }) });
    expect(m.pace.display).toBe("—");
    expect(m.pace.absent).toBe(true);
    expect(m.pace.judgement).not.toBe("faster");
  });

  it("a real split still judges exactly as before", () => {
    const m = model({ status: "live", frame: frame({ currentSplit: 117 }) });
    expect(m.pace.absent).toBe(false);
    expect(m.pace.display).not.toBe("—");
  });
});

describe("paused", () => {
  // `paceCaption`'s own "NOT ROWING" assertion retired with the field
  // (connected-revamp Task 3, retirement inventory §10.2 DECIDE): its only
  // renderer was pane A's `JudgedCard`, gone since Task 2, and the pace
  // hero's own no-target/paused treatment is the dash itself — nothing on
  // pane B has a slot for a fourth caption line explaining it.
  it("has no current pace: NOW goes to `—`", () => {
    const m = model({ status: "paused", frame: frame({ currentSplit: 117 }) });
    expect(m.pace.display).toBe("—");
    expect(m.pace.absent).toBe(true);
  });

  it("is NOT stale: the erg is still talking, so nothing greys as unvouched", () => {
    const m = model({ status: "paused" });
    expect(m.stale).toBe(false);
    expect(m.linked).toBe(true);
    // CR2 spec 3 Task 2: `nowLabel` no longer carries a word for `paused`
    // either — see the "carries no NOW" test above for the full rule.
    expect(m.nowLabel).toBe("");
  });

  // `intervalClockValue`'s own "holds the last value rather than blanking
  // it" pin retired with the field itself (CR2 spec 3 Task 5) — its own
  // describe block, above, has the full account of where its coverage
  // went.

  // connected-axes 2a, task 5: the split hero already suppressed to `—`
  // above (`livePace`'s own doc comment); the rate hero never did — a
  // paused erg's spm is PINNED at its last value (the freeze predicate's
  // own three-metric key holds spm right alongside split and distance),
  // and rendering that pinned number claimed a live rate reading nobody
  // has. `liveRate` mirrors `livePace` exactly, one function below it.
  it("has no current rate either: NOW goes to `—`, not the erg's last pinned spm", () => {
    const m = model({ status: "paused", frame: frame({ spm: 68 }) });
    expect(m.rate.display).toBe("—");
    expect(m.rate.absent).toBe(true);
  });
});

describe("disconnected: lose and degrade (spec C5)", () => {
  // `meters`/`hr` no longer appear on `SurfaceModel` (CR2 spec 3 Task 4) —
  // pace/rate are the only judged actuals left exposed, so "EVERY" now
  // means those two.
  it("greys EVERY actual, whatever it would otherwise have judged", () => {
    const target = firstWorkPhase().targetSplit!;
    const m = model({
      status: "stale",
      frame: frame({ currentSplit: target - 30, spm: 40 }),
    });
    expect(m.stale).toBe(true);
    expect(m.pace.judgement).toBe("stale");
    expect(m.rate.judgement).toBe("stale");
  });

  it("relabels NOW as LAST and hollows the indicator", () => {
    const m = model({ status: "stale" });
    expect(m.nowLabel).toBe("LAST");
    expect(m.linked).toBe(false);
  });

  it("promises nothing: the caption reads LOST, never TRYING", () => {
    // The exact caption forbids "TRYING" on its own; the extra
    // `not.toContain("TRYING")` trailer that used to follow could not fail
    // once this line passed (test-integrity sweep, S0g).
    const m = model({ status: "stale" });
    expect(m.deviceCaption).toBe(`${DEVICE} · LOST`);
  });
});

describe("degenerate inputs", () => {
  it("renders before the machine has sent a single frame", () => {
    const m = model({ frame: null });
    // Task 3, the mirror: `NO_FRAME` honestly reports `rowingActive: false`
    // and `distanceMeters: 0` — the same shape the mid-session boundary
    // mirror keys on — so a `live`-status caller with no frame yet now
    // mirrors `0/unjudged` rather than dashing. (A real caller reaches this
    // shape as `armed`, not `live` — Task 2's own "phase ready -> status
    // armed" — where the mirror instead previews the TARGET; this
    // `status: "live"` combination is the degenerate one this describe
    // block is about, and the mirror's job is to say something honest for
    // it too, not to special-case it away.)
    expect(m.pace.display).toBe("0:00.0");
    expect(m.pace.judgement).toBe("within");
    expect(m.intervalLabel).toBe("WARM-UP");
  });

  it("clamps an interval index the machine ran past the program", () => {
    const m = model({ frame: frame({ intervalIndex: 99 }) });
    // The clamp is against the PROGRAM's own length (5 intervals), and the
    // caption it produces is the last WORK piece's own number.
    expect(m.intervalLabel).toBe("INTERVAL 4 OF 4 · WORK");
  });

  it("treats a null interval index as the first, never as a crash", () => {
    const m = model({ frame: frame({ intervalIndex: null }) });
    expect(m.intervalLabel).toBe("WARM-UP");
  });

  it("never renders the `PM5` placeholder unless the picker gave us nothing", () => {
    // Spec I5: no screen renders the placeholder when a real advertised
    // name exists. `null` only happens if the hook reached a live phase
    // without a picker result, which is a caller bug — but it renders a
    // word, not `undefined`.
    expect(model({ deviceName: null }).deviceCaption).toBe("PM5");
    expect(model({ deviceName: null, status: "stale" }).deviceCaption).toBe(
      "PM5 · LOST",
    );
  });

  it("renders an empty phase list without inventing a phase", () => {
    // Unreachable in production (`compileProgram` rejects a program with no
    // work at all, `"no-work"`), so this is the guard's only exercise.
    const m = buildSurfaceModel({
      phases: [],
      program: FIXTURE.program,
      status: "live",
      frame: frame(),
      deviceName: DEVICE,
      actuals: [],
    });
    // Still the DASH here, and this is the ONLY case that keeps it: with
    // no phase there is no word to show. Everywhere else the slot names the
    // phase (James, 2026-08-12).
    //
    // BOTH SLOTS, not just the split (tail review M-1). `Free` is a claim
    // about a phase — "this piece asks for no particular rate" — and with
    // no phase at all there is nothing to make that claim about; the rate
    // slot went on saying it while the split slot honestly dashed, and only
    // the split half was pinned, so the disagreement was invisible.
    expect(m.targetSplit.main).toBe("—");
    expect(m.targetSplit.absent).toBe(true);
    expect(m.targetSplitCaption).toBe("");
    expect(m.targetRate.main).toBe("—");
    expect(m.targetRate.absent).toBe(true);
    expect(m.intervalLabel).toBe("INTERVAL 1 OF 4 · WORK");
  });

  // `paceCaption`'s own "NO PACE TARGET" assertion retired with the field
  // (§10.2 DECIDE, same disposition as the paused describe above); the
  // no-target state now speaks through `targetSplit.main` itself.
  it("the hero's target NAMES the phase when it carries no split target of its own", () => {
    const m = model({ frame: frame({ intervalIndex: 0 }) });
    expect(FIXTURE.phases[0]!.type).toBe("warmup");
    expect(m.targetSplit.main).toBe("Easy");
    expect(m.targetSplit.absent).toBe(true);
    // The caption is EMPTY, not "NO SPLIT TARGET": the word above it now
    // says the same thing, and the old caption would only repeat it.
    expect(m.targetSplitCaption).toBe("");
  });
});

// --- The warm-up says what it is (design spec §5b, ruling 12) --------------

describe("the warm-up is flagged, never counted", () => {
  it("numbers the WORK and refuses to number the warm-up", () => {
    // The rule Task 5's grid reads for its `WU` row, exposed once here so
    // the caption and the `#` column cannot drift apart.
    const n = intervalNumbering(FIXTURE.program.intervals);
    expect(FIXTURE.program.intervals).toHaveLength(5);
    expect(n.ordinals).toStrictEqual([null, 1, 2, 3, 4]);
    expect(n.workCount).toBe(4);
  });

  it("numbers a warm-up-less session exactly as it always did", () => {
    const n = intervalNumbering(NO_WARMUP.program.intervals);
    expect(n.ordinals).toStrictEqual([1, 2, 3, 4]);
    expect(n.workCount).toBe(4);
  });

  it("counts a TEST piece as work — a warm-up is the only thing that is not", () => {
    const n = intervalNumbering([
      {
        type: "warmup",
        kind: "time",
        value: 480,
        targetSplit: null,
        displaySpm: null,
        restSeconds: 0,
      },
      {
        type: "test",
        kind: "time",
        value: 600,
        targetSplit: null,
        displaySpm: null,
        restSeconds: 0,
      },
      {
        type: "work",
        kind: "time",
        value: 240,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 0,
      },
    ]);
    expect(n.ordinals).toStrictEqual([null, 1, 2]);
    expect(n.workCount).toBe(2);
  });

  it("says WARM-UP with no ordinal while the warm-up is running", () => {
    // The defect this replaced: the rower warming up read `1 OF 5` on a
    // workout they know as four pieces. The two exact strings forbid that
    // outright; the `not.toMatch(/\d/)` and `not.toContain("OF")` trailers
    // that used to follow could not fail once they passed (S0g).
    const m = model({ frame: frame({ intervalIndex: 0 }) });
    expect(m.intervalLabelShort).toBe("WARM-UP");
    expect(m.intervalLabel).toBe("WARM-UP");
  });

  it("starts the count at 1 on the first WORK piece, on a four-piece workout", () => {
    const captions = [1, 2, 3, 4].map(
      (i) => model({ frame: frame({ intervalIndex: i }) }).intervalLabelShort,
    );
    expect(captions).toStrictEqual([
      "1 OF 4 · WORK",
      "2 OF 4 · WORK",
      "3 OF 4 · WORK",
      "4 OF 4 · WORK",
    ]);
    // The denominator counts WORKING intervals only — the number the rower
    // has in their head — and it is one short of the program's own length.
    // The `every(... "OF 4")` / `some(... "OF 5")` trailers that used to
    // follow are gone: both were implied by the exact four strings above
    // (S0g), and `every` over an unpinned array is its own trap.
    expect(FIXTURE.program.intervals).toHaveLength(5);
  });

  it("drops the ordinal for the warm-up's own trailing rest too", () => {
    // The ordinal belongs to the INTERVAL and the word to the PHASE: resting
    // inside the warm-up interval is still no part of the rower's count.
    const withRest = libraryFixture("Filling Low", {
      kind: "time",
      minutes: 8,
      restSeconds: 60,
    });
    expect(withRest.phases[1]!.type).toBe("rest");
    const m = buildSurfaceModel({
      phases: withRest.phases,
      program: withRest.program,
      status: "live",
      frame: frame({ intervalIndex: 0, state: "resting" }),
      deviceName: DEVICE,
      actuals: [],
    });
    expect(m.intervalLabelShort).toBe("REST");
    // …while a rest inside a WORK interval keeps its number.
    const working = model({
      frame: frame({ intervalIndex: 1, state: "resting" }),
    });
    expect(working.intervalLabelShort).toBe("1 OF 4 · REST");
  });

  it("A SESSION WITH NO WARM-UP IS EXACTLY WHAT IT WAS", () => {
    // The regression pin that matters most: most sessions have no warm-up,
    // and this task touched the wire IR they all travel through. Every
    // caption is the plain `N OF M` formula, over the program's own full
    // length, and the bar has no span to tone.
    for (let i = 0; i < NO_WARMUP.program.intervals.length; i += 1) {
      const m = buildSurfaceModel({
        phases: NO_WARMUP.phases,
        program: NO_WARMUP.program,
        status: "live",
        frame: frame({ intervalIndex: i }),
        deviceName: DEVICE,
        actuals: [],
      });
      expect(m.intervalLabelShort).toBe(
        `${i + 1} OF ${NO_WARMUP.program.intervals.length} · WORK`,
      );
      expect(m.intervalLabel).toBe(
        `INTERVAL ${i + 1} OF ${NO_WARMUP.program.intervals.length} · WORK`,
      );
      expect(m.boundaries.warmupEndsAt).toBeNull();
    }
    expect(NO_WARMUP.phases.some((p) => p.type === "warmup")).toBe(false);
    expect(NO_WARMUP.program.intervals).toHaveLength(4);
  });

  it("marks the warm-up's span on the bar, ending where its notch is", () => {
    const m = model({ frame: frame({ intervalIndex: 0 }) });
    expect(m.boundaries.warmupEndsAt).toBe(480); // the 8:00 warm-up
    expect(m.boundaries.warmupEndsAt).toBe(m.boundaries.seconds[0]);
  });

  it("NOTHING NEW on the live pane: a warm-up is never graded", () => {
    // Design spec §5b's fourth row, confirmed by test rather than by change.
    // A warm-up carries no target (`compileProgram` nulls it), so the
    // named-but-greyed target and the judgement standing down are already
    // correct — whatever the rower is actually pulling.
    const m = model({ frame: frame({ intervalIndex: 0, currentSplit: 95 }) });
    expect(FIXTURE.program.intervals[0]!.type).toBe("warmup");
    expect(FIXTURE.program.intervals[0]!.targetSplit).toBeNull();
    expect(m.targetSplit.main).toBe("Easy");
    expect(m.targetSplit.absent).toBe(true);
    expect(m.targetRate.main).toBe("Free");
    expect(m.targetRate.absent).toBe(true);
    expect(m.pace.judgement).toBe("within"); // ungraded, not "faster"
    expect(m.rate.judgement).toBe("within");
    expect(m.pace.display).toBe("1:35.0"); // and the reading itself is shown
  });
});

// --- The notched bar's boundaries (design spec §5) -------------------------

/** A completed interval as the machine files it: `elapsedSeconds` is the
 *  WORK bout only (`toIntervalActual` reads 0x0037/0x0038's Split/Interval
 *  Time), which is exactly what the boundary derivation expects to be
 *  handed. */
function actualFor(index: number, elapsedSeconds: number): IntervalActual {
  return {
    index,
    elapsedSeconds,
    distanceMeters: 2000,
    avgSplit: 126,
    avgSpm: 21,
    avgHeartRateBpm: 158,
    restDistanceMeters: 0,
  };
}

describe("boundaries: where the intervals actually are", () => {
  it("draws one notch per interval BOUNDARY, never one per phase", () => {
    // The defect this replaced: nine phases, nine equal dots, for the five
    // intervals the caption counts. All three counts are pinned EXACTLY —
    // the old version asserted `phases.length > intervals.length`, a
    // property of the fixture that no change to `surfaceModel.ts` could
    // falsify, and `not.toHaveLength(8)`, implied by the length above it
    // (test-integrity sweep, S0g).
    expect(FIXTURE.phases).toHaveLength(9);
    expect(FIXTURE.program.intervals).toHaveLength(5);
    const m = model();
    expect(m.boundaries.seconds).toHaveLength(4);
  });

  it("the notch count never disagrees with the interval caption", () => {
    // `intervalLabelShort` is the caption a rower reads on the live pane's
    // own connection line, and the bar's spans are `notches + 1`. Read out
    // of the string itself rather than hardcoded, so a change to either has
    // to change both.
    //
    // §5b re-derives the relation without weakening it: the caption counts
    // the WORK, and the spans are the work plus the warm-up's own toned
    // chunk. So `spans - warmups === OF N`, which on a session with no
    // warm-up is the identical `notches === OF N - 1` this test used to
    // assert.
    const m = model();
    const ofN = Number(/ OF (\d+) /.exec(m.intervalLabelShort)![1]);
    expect(ofN).toBe(4);
    const spans = m.boundaries.seconds.length + 1;
    const warmups = FIXTURE.program.intervals.filter(
      (i) => i.type === "warmup",
    ).length;
    expect(warmups).toBe(1);
    expect(spans - warmups).toBe(ofN);

    const bare = buildSurfaceModel({
      phases: NO_WARMUP.phases,
      program: NO_WARMUP.program,
      status: "live",
      frame: frame(),
      deviceName: DEVICE,
      actuals: [],
    });
    const bareOfN = Number(/ OF (\d+) /.exec(bare.intervalLabelShort)![1]);
    expect(bare.boundaries.seconds).toHaveLength(bareOfN - 1);
  });

  it("every notch is an estimate until the machine has finished something", () => {
    expect(model().boundaries.predictedFrom).toBe(0);
  });

  it("re-anchors a completed interval to the machine's own elapsed, and re-flows the rest", () => {
    const estimated = model().boundaries.seconds;
    // Interval 1 (the first 2000 m) came in 20% over its estimate.
    const programmed = estimated[1]! - estimated[0]!; // work + its folded rest
    const rest = FIXTURE.program.intervals[1]!.restSeconds;
    const long = Math.round((programmed - rest) * 1.2);
    // The warm-up ran exactly as programmed (the machine counts it down
    // itself), so its own notch does not move; the 2000 m after it does.
    const warmup = actualFor(0, estimated[0]!);
    const m = model({ actuals: [warmup, actualFor(1, long)] });
    expect(m.boundaries.seconds[0]).toBe(estimated[0]); // the warm-up holds
    expect(m.boundaries.seconds[1]).toBe(estimated[0]! + long + rest);
    // (The `> estimated[1]` trailer that used to follow is gone: with the
    // exact value above pinned, `long + rest > programmed` is arithmetic on
    // this test's own constants — test-integrity sweep, S0g.)
    // And the notches after it moved by the SAME correction, not their own.
    const shift = m.boundaries.seconds[1]! - estimated[1]!;
    expect(m.boundaries.seconds[2]! - estimated[2]!).toBe(shift);
    expect(m.boundaries.seconds[3]! - estimated[3]!).toBe(shift);
    // Boundary 1 is now a fact; 2 onward are still guesses.
    expect(m.boundaries.predictedFrom).toBe(2);
  });

  it("re-flows again as each further interval lands", () => {
    const warmup = actualFor(0, 480);
    const one = model({ actuals: [warmup, actualFor(1, 600)] }).boundaries;
    const two = model({
      actuals: [warmup, actualFor(1, 600), actualFor(2, 400)],
    }).boundaries;
    expect(two.seconds[1]).toBe(one.seconds[1]);
    expect(two.seconds[2]).toBeLessThan(one.seconds[2]!);
    expect(two.predictedFrom).toBe(3);
    expect(one.predictedFrom).toBe(2);
  });

  it("an actual with no interval identity re-anchors nothing", () => {
    // `IntervalActual.index`'s own contract: null is "unknown", never
    // interval 0. Moving the first notch to this number would be inventing
    // a fact out of a boundary that belongs to no interval we can name.
    const m = model({ actuals: [{ ...actualFor(0, 9999), index: null }] });
    expect(m.boundaries.seconds).toStrictEqual(model().boundaries.seconds);
    expect(m.boundaries.predictedFrom).toBe(0);
  });

  it("stops notching at an interval nothing can price, and everywhere after it", () => {
    // A distance piece with no resolved split — what an effort-ref workout
    // looks like with no baselines to estimate from (`phaseSeconds` returns
    // null). Interval 2's boundary and interval 3's both disappear; the
    // one before it survives.
    const phases: EnginePhase[] = [
      { type: "work", seconds: 240, label: "2:06.0", originalIndex: 0 },
      { type: "rest", seconds: 60, label: "Rest", originalIndex: 0 },
      { type: "work", seconds: 240, label: "2:06.0", originalIndex: 1 },
      { type: "work", meters: 2000, label: "ALL OUT", originalIndex: 2 },
      { type: "work", seconds: 240, label: "2:06.0", originalIndex: 3 },
    ];
    const m = buildSurfaceModel({
      phases,
      program: FIXTURE.program,
      status: "live",
      frame: frame(),
      deviceName: DEVICE,
      actuals: [],
    });
    expect(m.boundaries.seconds).toStrictEqual([300, 540]);
  });

  it("a single-interval session has no boundaries at all", () => {
    const phases: EnginePhase[] = [
      { type: "work", seconds: 1200, label: "2:06.0", originalIndex: 0 },
    ];
    const m = buildSurfaceModel({
      phases,
      program: FIXTURE.program,
      status: "live",
      frame: frame(),
      deviceName: DEVICE,
      actuals: [],
    });
    expect(m.boundaries).toStrictEqual({
      seconds: [],
      predictedFrom: null,
      warmupEndsAt: null,
    });
  });

  it("the last boundary lands inside the session the bar is drawn against", () => {
    // The bar scales boundaries against `totalSeconds`; a boundary past it
    // would be a notch off the end of its own bar.
    const m = model();
    // The relation alone carries a ±684 s tolerance — the real gap between
    // 2532 and 3216 — so it survived both `totalSeconds ± 600` mutations
    // (test-integrity sweep, P15). Both sides are exactly known, so both
    // are pinned: the warm-up ends at 480, then each work-plus-rest group
    // adds 504 + 180 = 684, and the fourth group's boundary IS the end of
    // the session, so it is not drawn.
    expect(m.boundaries.seconds).toStrictEqual([480, 1164, 1848, 2532]);
    expect(m.totalSeconds).toBe(3216);
    expect(m.boundaries.seconds.at(-1)!).toBeLessThan(m.totalSeconds);
  });
});

describe("Task 6: the active row's accrued cell at interval index 2 (the checkpoint the driver no longer subtracts)", () => {
  it("interval 2 of Filling Low is a real DISTANCE interval — the shape the driver-level walk signature test exercises", () => {
    expect(FIXTURE.program.intervals[2]!.kind).toBe("distance");
  });

  it("renders the driver's post-fix intervalAccrued directly — 45s reads '0:45' in the TIME cell (the complement of a distance interval)", () => {
    // Task 6 (interface-notes.md §20 items 17/24): `computeAccruedForFrame`
    // no longer subtracts 0x0033's Last Split checkpoint, so a frame at
    // interval index 2 carries the driver's raw per-interval Elapsed Time
    // straight through as `intervalAccrued` — this is the on-screen half of
    // the same fix `driver.test.ts`'s "walk signature" test exercises at
    // the driver level (45s accrued on that same distance-kind shape).
    // Pre-fix, the SAME wire tick (with a nonzero lagged checkpoint two
    // boundaries deep) would have clamped this to `intervalAccrued: {
    // kind: "time", value: 0 }` — rendering '0:00', not '0:45'.
    const m = model({
      frame: frame({
        intervalIndex: 2,
        intervalRemaining: { kind: "distance", value: 1602.7 },
        intervalAccrued: { kind: "time", value: 45 },
      }),
    });
    const activeRow = m.grid.rows[m.grid.activeIndex]!;
    expect(activeRow.index).toBe(2);
    // A distance interval's countdown lives in `meters`; its complement
    // (accrual) lives in `time` — `buildGridModel`'s own ternary.
    expect(activeRow.time).toBe("0:45");
    expect(activeRow.meters).toBe("1603"); // countdownDisplayFor rounds
  });

  // MINOR-5, Task 6 fix round: a third test here (feeding `intervalAccrued:
  // { kind: "time", value: 0 }` and asserting the display string "0:00")
  // was deleted rather than kept — it proved only that `fmtDuration(0 / 60)
  // === "0:00"`, since the model layer cannot tell a genuinely-fresh 0
  // apart from a checkpoint-clamped 0 (both are the same literal input to
  // `accruedDisplayFor`, and there is no code path left, post-Task-6, that
  // still produces the clamped kind). The 45 -> "0:45" test above is the
  // real discriminating coverage: it fails if the display math regresses in
  // either direction.
});

// ---------------------------------------------------------------------------
// CR2 spec 3 Tasks 4 and 5: the five dying fields, actually gone (task
// briefs' own "deletion pins" — `PaneLive.tsx`'s TOTAL M/HR/LEFT IN
// INTERVAL cells and `TimerRuler`'s TOTAL LEFT row are cut outright, spec
// §3 fate table). Task 4 shipped this block naming `intervalClockValue` as
// explicitly NOT one of the four, reserved for Task 5's own deletion
// (antagonist correction 1) — Task 5 is that task, so the fifth key joins
// the other four here rather than opening a second, near-identical block.
// ---------------------------------------------------------------------------

/** COMPILE-TIME PIN, checked by `tsc`, not by a runtime assertion: if any of
 *  the five dying keys reappears on `SurfaceModel`, `Extract<keyof
 *  SurfaceModel, DeadKeys>` stops being `never` and this file fails to
 *  typecheck — `const _pin: DeadKeysGone = true` no longer accepts `true`.
 *  A naive `DeadKeys extends keyof SurfaceModel ? never : true` version
 *  (tried first) is UNSOUND for this purpose: TypeScript distributes a
 *  conditional over a union type parameter, so ONE surviving key produces
 *  `never` for that member alone, and `never` vanishes silently inside the
 *  resulting union (`never | true` collapses to `true`) — a regression on
 *  any four of the five keys would still pass. `Extract` has no such
 *  collapse: it is non-empty the instant ANY dead key overlaps
 *  `keyof SurfaceModel`, so the whole pin depends on ALL FIVE being gone. */
type DeadKeys =
  | "meters"
  | "hr"
  | "intervalClockLabel"
  | "totalLeftSeconds"
  | "intervalClockValue";
type DeadKeysGone =
  Extract<keyof SurfaceModel, DeadKeys> extends never ? true : false;

describe("the five fields die (CR2 spec 3 Tasks 4 and 5, spec §3 fate table)", () => {
  it("meters, hr, intervalClockLabel, totalLeftSeconds and intervalClockValue are gone from the TYPE", () => {
    // `deadKeysGone` is `true` at compile time only if `DeadKeysGone`
    // resolved to the literal type `true` — if any of the five keys
    // reappeared on `SurfaceModel`, `DeadKeysGone` would be `false` and this
    // assignment would fail to typecheck (`tsc -b`, this repo's own
    // `pnpm typecheck`), not merely fail at runtime.
    const deadKeysGone: DeadKeysGone = true;
    expect(deadKeysGone).toBe(true);
  });

  it("…and gone from a REAL model, not just from the type", () => {
    // The test above proves the TYPE; this proves the runtime shape
    // actually matches it — a `Partial`/spread anywhere inside
    // `buildSurfaceModel` could satisfy the type while still leaving a
    // stray key on the real returned object, which `Object.keys` catches
    // and the type-level check alone would not.
    const keys = Object.keys(model());
    expect(keys).not.toContain("meters");
    expect(keys).not.toContain("hr");
    expect(keys).not.toContain("intervalClockLabel");
    expect(keys).not.toContain("totalLeftSeconds");
    expect(keys).not.toContain("intervalClockValue");
  });
});
