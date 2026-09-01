// The connected surface's model, tested against a REAL seeded library
// workout compiled through the real assembly (`buildDraft` -> `buildRun` ->
// `compileProgram`) — the repo's realistic-fixture rule. "Filling Low" is
// the same fixture `ConnectedInterstitial.test.tsx` uses: 4 × 2000 m with
// 3:00 rest between (retuned from 3 reps in Task 3, 2026-08-10
// library-rebalance, to reach its new 45-60 band), with an 8:00 EASY opener
// prepended, which gives this file everything
// it needs in one shape — a leading phase with no numeric target, work phases with
// a real resolved split and a pace ref, folded rest phases (so the
// interval->phase walk has something real to walk), and a DISTANCE
// interval (so `METERS LEFT` is exercised against a genuine program rather
// than a synthetic one).

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../../domain/monitor/program.js";
import { fmtDuration } from "../../../domain/duration.js";
import { phaseSeconds } from "../../../domain/expand.js";
import { fmtSplit } from "../../../domain/format.js";
import { PACE_TOLERANCE_SECONDS } from "../../../domain/judge.js";
import type {
  IntervalActual,
  MonitorFrame,
} from "../../../domain/monitor/types.js";
import type { Baselines, Step, WorkoutType } from "../../../domain/types.js";
import { ONBOARDING_TITLES } from "../../../domain/onboarding.js";
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../../server/seed/library/onboarding";
import { buildDraft } from "../../session/draft";
import { buildRun, type EnginePhase } from "../../session/engine";
import { totalSessionSecondsOf } from "../../session/Timer";
import { targetSplitDisplay } from "../../session/TimerTargets";
import { createEventLog } from "../../monitor/eventLog";
import { createPm5Driver } from "../../monitor/driver";
import { parseRecording } from "../../monitor/transports/recording";
import { createReplayTransport } from "../../monitor/transports/replay";
import {
  buildSurfaceModel,
  connectedNextText,
  DASH,
  formatRestCountdown,
  intervalNumbering,
  judgedValue,
  ON_TARGET_BAND_SECONDS,
  phaseIndexForInterval,
  splitHero,
  type SurfaceModel,
  type SurfaceModelInput,
} from "./surfaceModel";

const baselines: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const t0 = new Date("2026-08-07T09:00:00.000Z");
const DEVICE = "PM5 432331249";

// WHERE THE LEADING INTERVAL COMES FROM, twice moved. A seeded workout
// stopped carrying a `wu` step on 2026-08-09, after which every fixture's
// opening interval came from the rower's warm-up PREFERENCE (`buildRun`'s
// fourth argument). Phase WU removed that too, so it is an authored EASY
// step now — `leadStep`, prepended to the workout's own steps. The
// durations are exactly what each workout's `wu` row originally carried, so
// every interval index, count and duration asserted in this file is
// unchanged; what DOES change is that the leading interval is ordinary
// work, so the captions number it and the grid gives it a `1`.
function libraryFixture(title: string, leadStep: Step | null) {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  const draft = buildDraft({
    id: title.toLowerCase().replace(/\s+/g, "-"),
    title: w.title,
    type: w.type as WorkoutType,
    steps: leadStep ? [leadStep, ...w.steps] : w.steps,
  });
  const phases = buildRun(draft, baselines, t0).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return { phases, program };
}

/** The 8:00 EASY opener, the authored step that replaced Phase WU's
 *  deleted warm-up setting in this file's fixtures. Effort-ref, so the
 *  compiler programs it with no target (`compileProgram` nulls an effort
 *  phase's `targetSplit`) — the same target-less leading interval every
 *  assertion in this file has always been written against. */
const EASY_OPENER: Step = {
  k: "w",
  duration: { kind: "time", minutes: 8 },
  ref: { effort: "min" },
};

const FIXTURE = libraryFixture("Filling Low", EASY_OPENER);

/** THE SAME WORKOUT WITH NO LEADING INTERVAL — four intervals and nothing
 *  in front of them. Kept (rather than folded into `FIXTURE`, which is now
 *  structurally the same kind of program) because plenty of cases below
 *  need a program whose interval 0 IS one of the 2000 m pieces. */
const NO_WARMUP = libraryFixture("Filling Low", null);

/** A LEADING INTERVAL WITH ITS OWN TRAILING REST (connected-metrics design
 *  spec, States table row "Rest, before any work interval completes") — the
 *  ONE shape in this file where `state: "resting"` lands on
 *  `intervalIndex: 0` *with* a real REST phase behind it. `FIXTURE`'s own
 *  opener has no trailing rest at all, so
 *  `phaseIndexForInterval(FIXTURE.phases, 0, true)` lands back on the
 *  opening phase ITSELF and never on a rest one — which is why this fixture
 *  is required, not a restyled duplicate. */
const WARMUP_WITH_REST = libraryFixture("Filling Low", {
  k: "w",
  duration: { kind: "time", minutes: 8 },
  ref: { effort: "min" },
  restMinutes: 1,
});

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
  leadStep: Step | null,
): EnginePhase[] {
  const draft = buildDraft({
    id: w.title.toLowerCase().replace(/\s+/g, "-"),
    title: w.title,
    type: w.type,
    steps: leadStep ? [leadStep, ...w.steps] : w.steps,
  });
  return buildRun(draft, baselines, t0).phases;
}

/** A single continuous time work phase, split-target, no rest and no
 *  reps block — the "work+seconds+split target+spm" table row needs a work
 *  phase whose EXTENT comes from `seconds`, and every time-based work step
 *  in the library that also carries `restMinutes` would give the row a
 *  trailing rest phase this test does not want to have to skip past.
 *  "Occluded Front" (AT, 10' at 6k+4, spm 22, no rest) is the one single-step
 *  time workout in the library. */
const OCCLUDED = libraryFixture("Occluded Front", null);

/** A DISTANCE-kind leading interval — every other fixture in this file
 *  opens with a TIME-kind one, and the NEXT line's "work+meters" table row
 *  needs a phase whose extent comes from `meters`. */
const WARMUP_METERS = libraryFixture("Filling Low", {
  k: "w",
  duration: { kind: "distance", meters: 2000 },
  ref: { effort: "min" },
});

/** The ONE real production shape with a distance work step at an EFFORT ref
 *  and no `spm` — `library.test.ts`'s own "spm-present-and-even on every
 *  work step" rule (see `onboarding.ts`'s header comment) means no fixture
 *  in `LIBRARY_WORKOUTS` itself can ever reach this branch; the two
 *  designated onboarding workouts are the sole documented exception, kept
 *  OUT of `LIBRARY_WORKOUTS` for exactly that reason. "2K Test" (AN, 2000m
 *  at MAX, no spm) is the "work+meters+effort target" table row. */
const ONBOARD_K2 = ONBOARDING_LIBRARY_WORKOUTS.find(
  (w) => w.title === ONBOARDING_TITLES.k2,
);
if (!ONBOARD_K2) throw new Error("missing onboarding fixture: 2K Test");
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
    splitAvgPace: null,
    restSeconds: 0,
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
    linkLost: false,
    frame: frame(),
    deviceName: DEVICE,
    actuals: [],
    ...over,
    freeRow: false,
  });
}

/** The first SPLIT-REF work phase's own resolved split, read out of the
 *  fixture rather than hardcoded — the numbers this file compares against
 *  are the workout's, not invented ones.
 *
 *  Phase WU: the predicate used to be `type === "work"`, which worked only
 *  because phase 0 was a warm-up. Phase 0 is the EASY opener now — also a
 *  work phase — so this names what it actually wants. */
function firstWorkPhase(): EnginePhase {
  const p = FIXTURE.phases.find((x) => x.targetKind === "split");
  if (!p?.targetSplit || p.spm === undefined) {
    throw new Error("fixture has no split-and-rate work phase");
  }
  return p;
}

describe("the fixture is the shape this file claims", () => {
  it("Filling Low compiles to an easy time opener plus four distance intervals", () => {
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
    expect(FIXTURE.phases[0]!.targetKind).toBe("effort");
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

// `staleFor(status)` used to be tested here as a pure function. Phase LM
// PR 1 Task 2 deleted it: it answered "is this reading stale" by reading
// the STATUS WORD, which is exactly what made a lost link and an armed
// program mutually exclusive. The rule it encoded is unchanged and is
// asserted through the model itself now — the only place it was ever
// observable — one status at a time, against the one input that decides it.
describe("only a lost link makes a reading stale — a paused erg is still talking", () => {
  it("greys every judged actual when the link is down, at whatever the surface was doing", () => {
    for (const status of ["live", "paused", "armed"] as const) {
      expect(model({ status, linkLost: true }).stale).toBe(true);
      expect(model({ status, linkLost: true }).linked).toBe(false);
    }
  });

  it("greys nothing while the link is up — a frozen erg is still talking to us", () => {
    for (const status of ["live", "paused", "armed"] as const) {
      expect(model({ status, linkLost: false }).stale).toBe(false);
      expect(model({ status, linkLost: false }).linked).toBe(true);
    }
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
      freeRow: false,
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
      linkLost: false,
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
      freeRow: false,
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
      linkLost: false,
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
      linkLost: false,
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
      linkLost: false,
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
      freeRow: false,
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
    // A LOST LINK is the only thing this field still has a word for — and
    // since Phase LM PR 1 Task 2 not even then, if the surface is ARMED:
    // the split hero is previewing a TARGET on that branch, and captioning
    // a number nobody rowed `LAST` claims we measured it. See this file's
    // own Phase LM describe below.
    expect(model({ status: "live", linkLost: true }).nowLabel).toBe(
      "LAST SEEN",
    );
    expect(model({ status: "live" }).nowLabel).toBe("");
    expect(model({ status: "paused" }).nowLabel).toBe("");
  });

  it("the grid's active row carries no gold counting mark — nothing is counting down before the first stroke", () => {
    const m = buildSurfaceModel({
      phases: NO_WARMUP.phases,
      program: NO_WARMUP.program,
      status: "armed",
      linkLost: false,
      frame: frame({
        state: "armed",
        intervalIndex: 0,
        rowingActive: false,
        distanceMeters: 0,
      }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
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
      linkLost: false,
      frame: frame({ intervalIndex: 0 }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
    });
    expect(
      liveModel.grid.rows[liveModel.grid.activeIndex]!.countdown,
    ).not.toBeNull();
  });

  it("EST LEFT reads the whole session, un-started — never the wire's carried-over elapsed (design spec: renamed from TOTAL LEFT on the connected surface, 2026-08-20)", () => {
    const totalSeconds = totalSessionSecondsOf(NO_WARMUP.phases);
    const m = buildSurfaceModel({
      phases: NO_WARMUP.phases,
      program: NO_WARMUP.program,
      status: "armed",
      linkLost: false,
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
      freeRow: false,
    });
    // `totalLeftSeconds` died off `SurfaceModel` (CR2 spec 3 Task 4, spec
    // §3 fate table) — `totalLeftDisplay` is the only surviving carrier of
    // this fact, so that is what this test reads.
    expect(m.totalLeftDisplay).toBe(fmtDuration(totalSeconds / 60));
    // Not armed: the ordinary subtraction still applies, so this is a
    // suppression scoped to armed, not a change to the live formula.
    const liveModel = model({
      status: "live",
      linkLost: false,
      frame: frame({ sessionElapsedSeconds: 900, elapsedSeconds: 900 }),
    });
    expect(liveModel.totalLeftDisplay).not.toBe(
      fmtDuration(totalSessionSecondsOf(FIXTURE.phases) / 60),
    );
  });
});

// ---------------------------------------------------------------------------
// RC-24 — the grid says a rest is running. Every fixture value below is
// taken from the design spec's decode of a real capture
// (`docs/monitor/sessions/walk-2026-08-25/rests-finished-recording.jsonl.gz`,
// program `w 1' r1 / w 500m r1 / w 1'`): `restSeconds` ticks at x.91 (60.00,
// 59.91 ... 2.91, 1.91 — never 0.00), `state === "resting"` leads the
// countdown by ~1 s (a flat 60.00 at rest ENTRY), and outside a rest
// `restSeconds` is the CURRENT interval's own programmed rest, not a
// sentinel (60.00 through a work interval with a rest programmed, 0.00
// through one with none). `FIXTURE`'s interval 1 is the first 2000 m rep
// (`kind: "distance"`), so its own countdown (when nothing is resting)
// is the METERS cell.
// ---------------------------------------------------------------------------
describe("RC-24: the /500M cell counts down a running rest", () => {
  function activeRow(m: SurfaceModel) {
    return m.grid.rows[m.grid.activeIndex]!;
  }

  it("mid-rest: floors the wire's own countdown, never rounds it (59.91 -> 0:59, not the 1:00 Math.round would give)", () => {
    const m = model({
      frame: frame({ state: "resting", restSeconds: 59.91, intervalIndex: 1 }),
    });
    const row = activeRow(m);
    expect(row.countdown).toBe("rest");
    expect(row.restCountdown).toBe("0:59");
  });

  it("rest-entry dwell is BOUNDED, not forbidden (wire fact 1): a flat restSeconds: 60 renders 1:00 while resting, and the identical restSeconds: 60 renders no countdown at all while rowing", () => {
    const resting = model({
      frame: frame({ state: "resting", restSeconds: 60, intervalIndex: 1 }),
    });
    expect(activeRow(resting).countdown).toBe("rest");
    expect(activeRow(resting).restCountdown).toBe("1:00");

    const rowing = model({
      frame: frame({ state: "rowing", restSeconds: 60, intervalIndex: 1 }),
    });
    expect(activeRow(rowing).countdown).not.toBe("rest");
    expect(activeRow(rowing).restCountdown).toBeNull();
  });

  it("restSeconds ALONE never says a rest is running (wire fact 2): 60.00 and 0.00 both render no rest countdown while WORKING", () => {
    for (const restSeconds of [60, 0]) {
      const row = activeRow(
        model({
          frame: frame({ state: "rowing", restSeconds, intervalIndex: 1 }),
        }),
      );
      // Interval 1 is the first 2000 m rep: its own dimension is METERS.
      expect(row.countdown).toBe("meters");
      expect(row.restCountdown).toBeNull();
    }
  });

  it("the zero-rest artifact: resting with restSeconds 0 has nothing to count, so the row falls back to its own dimension", () => {
    const row = activeRow(
      model({
        frame: frame({ state: "resting", restSeconds: 0, intervalIndex: 1 }),
      }),
    );
    expect(row.countdown).toBe("meters");
    expect(row.restCountdown).toBeNull();
  });

  it("armed beats resting: nothing counts before the first pull, including a rest that has not begun", () => {
    const row = activeRow(
      model({
        status: "armed",
        frame: frame({
          state: "resting",
          restSeconds: 59.91,
          intervalIndex: 1,
        }),
      }),
    );
    expect(row.countdown).toBeNull();
    expect(row.restCountdown).toBeNull();
  });

  it("countdown and restCountdown always agree: one reads 'rest' exactly when the other is non-null", () => {
    const frames = [
      frame({ state: "resting", restSeconds: 59.91, intervalIndex: 1 }),
      frame({ state: "resting", restSeconds: 60, intervalIndex: 1 }),
      frame({ state: "rowing", restSeconds: 60, intervalIndex: 1 }),
      frame({ state: "rowing", restSeconds: 0, intervalIndex: 1 }),
      frame({ state: "resting", restSeconds: 0, intervalIndex: 1 }),
    ];
    for (const f of frames) {
      const row = activeRow(model({ frame: f }));
      expect(row.countdown === "rest").toBe(row.restCountdown !== null);
    }
    const armedRow = activeRow(
      model({
        status: "armed",
        frame: frame({
          state: "resting",
          restSeconds: 59.91,
          intervalIndex: 1,
        }),
      }),
    );
    expect(armedRow.countdown === "rest").toBe(armedRow.restCountdown !== null);
  });

  it("exactly one row wears the mark while working or resting, and none while armed", () => {
    // "no row has two marks" is the invariant every branch below shares;
    // armed is the one state where the honest count is ZERO, not one — the
    // active row's own countdown is null there (the test above), and this
    // confirms no OTHER row picks the mark up either.
    const countMarked = (m: SurfaceModel): number =>
      m.grid.rows.filter((r) => r.countdown !== null).length;

    expect(
      countMarked(
        model({
          status: "armed",
          frame: frame({ state: "armed", intervalIndex: 1 }),
        }),
      ),
    ).toBe(0);
    expect(
      countMarked(
        model({ frame: frame({ state: "rowing", intervalIndex: 1 }) }),
      ),
    ).toBe(1);
    expect(
      countMarked(
        model({
          frame: frame({
            state: "resting",
            restSeconds: 59.91,
            intervalIndex: 1,
          }),
        }),
      ),
    ).toBe(1);
  });

  // Fix round 2, item A (James: "So /500m in landscape isn't '-' during
  // rest???"). The countdown replaces the coast split in PORTRAIT (one
  // cell, one value); landscape shows the coast split back in `/500M`
  // alongside the countdown in the REST column, and that split is
  // `frame.currentSplit` — a coasting flywheel, judged against a work
  // target it no longer means. The fix is CELL-LOCAL, in this same active
  // branch, not in `livePace` itself (pane B's identical defect is
  // deliberately out of scope, filed separately).
  it("the pace cell dashes during a rest, unjudged — the coast split never reaches either orientation's /500M cell", () => {
    const row = activeRow(
      model({
        frame: frame({
          state: "resting",
          restSeconds: 42,
          intervalIndex: 1,
          // A real, non-zero coasting reading — the exact number James
          // saw in the landscape capture (1:57.8 rendered from something
          // in this neighbourhood). If suppression only caught the
          // already-dashing dead-stop case (currentSplit: 0), this value
          // would prove nothing; a live, plausible split is the point.
          currentSplit: 117.8,
        }),
      }),
    );
    expect(row.pace.display).toBe(DASH);
    expect(row.pace.judged).toBeNull();
  });

  it("the WORK-interval pace is unchanged: still the live split, still judged — the rest suppression cannot leak into work", () => {
    const row = activeRow(
      model({
        frame: frame({
          state: "rowing",
          intervalIndex: 1,
          currentSplit: 117.8,
        }),
      }),
    );
    expect(row.pace.display).toBe(fmtSplit(117.8));
    expect(row.pace.judged).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RC-27 — the LIVE hero counts the rest. Same wire facts as RC-24 (this
// file's own comment above), one surface over: `SurfaceModel.restCountdown`
// is the machine's own rest countdown for pane B's split hero, non-null
// EXACTLY while a rest is genuinely running (`resting && restSeconds > 0 &&
// !armed && !linkLost`).
// ---------------------------------------------------------------------------
describe("RC-27: the LIVE split hero counts a running rest", () => {
  it("mid-rest: floors the wire's own countdown, never rounds it (59.91 -> 0:59, not the 1:00 Math.round would give)", () => {
    const m = model({
      frame: frame({ state: "resting", restSeconds: 59.91, intervalIndex: 1 }),
    });
    expect(m.restCountdown).toBe("0:59");
  });

  it("wire fact 2, the most important negative: restSeconds ALONE never says a rest is running", () => {
    for (const restSeconds of [60, 0]) {
      const m = model({
        frame: frame({ state: "rowing", restSeconds, intervalIndex: 1 }),
      });
      expect(m.restCountdown).toBeNull();
    }
  });

  it("rest-entry dwell is BOUNDED, not forbidden (wire fact 1): a flat restSeconds: 60 renders 1:00 while resting, and the identical restSeconds: 60 renders nothing while rowing", () => {
    const resting = model({
      frame: frame({ state: "resting", restSeconds: 60, intervalIndex: 1 }),
    });
    expect(resting.restCountdown).toBe("1:00");

    const rowing = model({
      frame: frame({ state: "rowing", restSeconds: 60, intervalIndex: 1 }),
    });
    expect(rowing.restCountdown).toBeNull();
  });

  it("the zero-rest artifact: resting with restSeconds 0 has nothing to count", () => {
    const m = model({
      frame: frame({ state: "resting", restSeconds: 0, intervalIndex: 1 }),
    });
    expect(m.restCountdown).toBeNull();
  });

  it("armed beats resting: nothing counts before the first pull, including a rest that has not begun", () => {
    const m = model({
      status: "armed",
      frame: frame({ state: "resting", restSeconds: 59.91, intervalIndex: 1 }),
    });
    expect(m.restCountdown).toBeNull();
  });

  it("a lost link beats a running rest: the countdown goes null and nowLabel still reads LAST SEEN", () => {
    const m = model({
      linkLost: true,
      frame: frame({ state: "resting", restSeconds: 59.91, intervalIndex: 1 }),
    });
    expect(m.restCountdown).toBeNull();
    expect(m.nowLabel).toBe("LAST SEEN");
  });

  it("RC-33: a lost link beats a running rest ON THE GRID TOO — pane C cannot keep a frozen countdown while pane B reverts", () => {
    const m = model({
      linkLost: true,
      frame: frame({ state: "resting", restSeconds: 59.91, intervalIndex: 1 }),
    });
    // The hero already did this (the test above). The grid did NOT: RC-24
    // shipped `restingNow` without a `!stale` term, so a link lost mid-rest
    // left pane C sunken and gold with a FROZEN `R 0:59` while pane B
    // correctly read LAST SEEN — verbatim the "false claim of motion" the
    // hero's own guard comment exists to prevent.
    const active = m.grid.rows[m.grid.activeIndex]!;
    expect(active.restCountdown).toBeNull();
    expect(active.countdown).not.toBe("rest");
  });

  it("RC-33: the two surfaces agree under a LOST LINK, not only under a healthy one", () => {
    const m = model({
      linkLost: true,
      frame: frame({ state: "resting", restSeconds: 59.91, intervalIndex: 1 }),
    });
    // The healthy-case agreement test below proves they match when both
    // RENDER. This proves they match when both SUPPRESS, which is the half
    // RC-24 got wrong and no test covered.
    expect(m.restCountdown).toBe(
      m.grid.rows[m.grid.activeIndex]!.restCountdown,
    );
  });

  it("formatRestCountdown floors, never rounds (59.91 -> 0:59, the value round would give is 1:00)", () => {
    expect(formatRestCountdown(59.91)).toBe("0:59");
    expect(formatRestCountdown(60)).toBe("1:00");
    expect(formatRestCountdown(1.91)).toBe("0:01");
  });

  it("the hero and the grid cell agree: ONE frame, two call sites, byte-identical strings (fix round 1, item 4 — a shared call site alone cannot prove this, only a test comparing the two outputs can)", () => {
    const m = model({
      frame: frame({ state: "resting", restSeconds: 59.91, intervalIndex: 1 }),
    });
    const gridCell = m.grid.rows[m.grid.activeIndex]!.restCountdown;
    // Neither side is trivially null — the point is a real agreement, not
    // two absent values that happen to `toBe` equal.
    expect(m.restCountdown).not.toBeNull();
    expect(gridCell).not.toBeNull();
    expect(m.restCountdown).toBe(gridCell);
  });
});

// ---------------------------------------------------------------------------
// PHASE LM PR 1 TASK 2 — armed AND unheard, the combination the old union
// could not express.
//
// `SurfaceStatus` used to carry `"stale"` as a fourth member, resolved
// AHEAD of `"armed"`, so the moment the link went quiet the surface stopped
// being armed and everything hanging off `armedMirror` collapsed together.
// A tester met exactly that: they locked the phone before their first pull,
// the app never opened a record, and the screen they came back to described
// a piece that had never begun.
//
// THE PER-CONSUMER PINS LIVE HERE; the fail-first proof lives in
// `ConnectedSurface.test.tsx`'s own Phase LM describe (a model-level test
// written against the FIXED input shape cannot fail against the broken one
// — the old signature had no way to say "armed and lost", which is the
// bug). These pin the model's four displays one at a time so a regression
// says WHICH consumer moved, and each is covered by its own mutation in the
// task report.
// ---------------------------------------------------------------------------

/** ARMED AND UNHEARD, on a program whose interval 0 carries a real split
 *  target (`NO_WARMUP` — `FIXTURE`'s opener is effort-ref and has no target
 *  for the armed hero to preview). The frame is the erg counting while the
 *  app is still in `ready`: every counter moved, which is what makes each
 *  assertion below discriminating rather than accidentally right. */
function armedNeverRowed(over: Partial<SurfaceModelInput> = {}): SurfaceModel {
  return buildSurfaceModel({
    phases: NO_WARMUP.phases,
    program: NO_WARMUP.program,
    status: "armed",
    linkLost: true,
    frame: frame({
      state: "rowing",
      rowingActive: true,
      intervalIndex: 0,
      elapsedSeconds: 504,
      distanceMeters: 1400,
      currentSplit: 108,
      spm: 26,
    }),
    deviceName: DEVICE,
    actuals: [],
    ...over,
    freeRow: false,
  });
}

/** `NO_WARMUP`'s interval 0: the split the armed hero previews. */
function noWarmupTargetSplit(): number {
  const p = NO_WARMUP.phases.find((x) => x.targetKind === "split");
  if (!p?.targetSplit) throw new Error("fixture has no split work phase");
  return p.targetSplit;
}

describe("Phase LM: a lost link does not erase the ready state", () => {
  it("keeps the READY caption when the link is lost before the first pull", () => {
    expect(armedNeverRowed().intervalLabelShort).toBe("1 OF 4 · READY");
  });

  it("keeps the split hero previewing the TARGET, never the erg's own live split", () => {
    const m = armedNeverRowed();
    expect(m.pace.display).toBe(fmtSplit(noWarmupTargetSplit()));
    // NOTHING IS JUDGED at armed (frame 2D): the preview is not a reading
    // to compare, and a lost link cannot make it one either.
    expect(m.pace.judgement).toBe("stale");
    expect(m.pace.absent).toBe(false);
  });

  it("keeps the rate hero at 0 — a rower who has taken no stroke has no rate", () => {
    expect(armedNeverRowed().rate.display).toBe("0");
  });

  it("keeps EST LEFT at the whole session and elapsed at zero — nothing has been rowed off it", () => {
    const m = armedNeverRowed();
    expect(m.totalLeftDisplay).toBe(
      fmtDuration(totalSessionSecondsOf(NO_WARMUP.phases) / 60),
    );
    expect(m.elapsedSeconds).toBe(0);
  });

  it("carries no LAST label — captioning a target preview LAST would claim we measured it", () => {
    expect(armedNeverRowed().nowLabel).toBe("");
  });

  it("keeps the grid's active row unmarked — nothing is counting down yet", () => {
    const m = armedNeverRowed();
    expect(m.grid.rows[m.grid.activeIndex]!.countdown).toBeNull();
  });

  // THE OTHER HALF. Restoring READY must not cost the rower the signal that
  // the app has stopped hearing the erg — that would trade one wrong screen
  // for another, which is why the fix is two independent inputs rather than
  // a reordered ternary.
  it("still reports the lost link alongside READY, not instead of it", () => {
    const m = armedNeverRowed();
    expect(m.stale).toBe(true);
    expect(m.linked).toBe(false);
    expect(m.deviceCaption).toBe(`${DEVICE} · LOST`);
  });

  // A HEALTHY armed surface is untouched by any of it: the armed branch
  // reads identically whether or not the link is up, which is the whole
  // claim "armed no longer implies a healthy link" makes.
  it("reads identically to a healthy armed surface, except for the link itself", () => {
    const lost = armedNeverRowed();
    const up = armedNeverRowed({ linkLost: false });
    expect(lost.intervalLabelShort).toBe(up.intervalLabelShort);
    expect(lost.pace.display).toBe(up.pace.display);
    expect(lost.rate.display).toBe(up.rate.display);
    expect(lost.totalLeftDisplay).toBe(up.totalLeftDisplay);
    expect(lost.elapsedSeconds).toBe(up.elapsedSeconds);
    expect(lost.nowLabel).toBe(up.nowLabel);
    expect(lost.deviceCaption).not.toBe(up.deviceCaption);
  });
});

// PHASE LM PR 1 TASK 3. The lost banner names how many intervals survive,
// so the model has to count them — and count them by the SAME rule the
// summary screen will use minutes later (`summaryModel.ts`'s
// `measuredIntervalCount`, imported rather than re-derived here). A count
// this screen invented for itself is a count the summary can contradict.
describe("Phase LM: the model counts what was actually measured", () => {
  /** An actual for `FIXTURE`'s interval `index`, rowed for exactly
   *  `elapsedSeconds` — the one variable these tests turn on. */
  function actualOf(index: number, elapsedSeconds: number): IntervalActual {
    const iv = FIXTURE.program.intervals[index]!;
    return {
      index,
      elapsedSeconds,
      distanceMeters: iv.kind === "distance" ? iv.value : 250,
      avgSplit: iv.targetSplit ?? 132,
      avgSpm: iv.displaySpm ?? 22,
      avgHeartRateBpm: 158,
      restDistanceMeters: 0,
    };
  }

  it("counts nothing when the machine reported nothing — the never-rowed surface", () => {
    expect(armedNeverRowed().measuredIntervals).toBe(0);
  });

  it("counts the intervals the machine actually finished", () => {
    expect(
      model({ actuals: [actualOf(0, 480), actualOf(1, 428.4)] })
        .measuredIntervals,
    ).toBe(2);
  });

  // The disagreement the shared rule exists to prevent, pinned at the
  // model layer too: a sub-second boundary is not a kept interval on
  // either screen.
  it("does not count a sub-second boundary the summary screen would call unmeasured", () => {
    expect(
      model({ actuals: [actualOf(0, 0.4), actualOf(1, 428.4)] })
        .measuredIntervals,
    ).toBe(1);
  });
});

// The precedence `"stale"`-the-member used to carry implicitly, by winning
// the caller's ternary before `"paused"` could: a lost link beats a frozen
// erg. Deleting the member made it explicit in two places
// (`livePace`/`liveRate` here, the paused block in `ConnectedSurface.tsx`),
// and these pin that nothing about a frozen-AND-lost surface moved — a real
// combination, since the freeze predicate fires on unchanged metrics and
// the watchdog fires on silence, and a rower who stops and then loses the
// link produces both.
describe("Phase LM: a lost link still beats a frozen erg", () => {
  it("holds the last readings, greyed, rather than blanking them to the paused dash", () => {
    const m = model({
      status: "paused",
      linkLost: true,
      frame: frame({ currentSplit: 130, spm: 21 }),
    });
    expect(m.pace.display).toBe("2:10.0");
    expect(m.pace.judgement).toBe("stale");
    expect(m.rate.display).toBe("21");
    expect(m.nowLabel).toBe("LAST SEEN");
  });

  it("still blanks them while the link is UP — the paused suppression is not weakened", () => {
    const m = model({
      status: "paused",
      linkLost: false,
      frame: frame({ currentSplit: 130, spm: 21 }),
    });
    expect(m.pace.absent).toBe(true);
    expect(m.rate.absent).toBe(true);
  });
});

// CR2 spec 3 Task 2 (design spec §2D — "the READY word ships HERE",
// PROVENANCE item 3): the armed branch of `intervalLabelShort`.
describe("READY (design spec §2D): the armed branch of intervalLabelShort", () => {
  it("armed on a numbered interval reads the ordinal plus READY, never WORK", () => {
    const m = model({
      status: "armed",
      linkLost: false,
      frame: frame({ state: "armed", intervalIndex: 1 }),
    });
    // Phase WU: `2 OF 5`, not `1 OF 4` — the same interval, renumbered
    // because the program's opener is counted now (see "every interval is
    // numbered").
    expect(m.intervalLabelShort).toBe("2 OF 5 · READY");
    // Non-armed, the SAME interval: entirely unaffected by this task — the
    // ordinary `N OF M · WORK` formula, still exercised at this exact
    // index by the "live" describe block below, pinned again here so the
    // two branches sit side by side.
    const live = model({ frame: frame({ intervalIndex: 1 }) });
    expect(live.intervalLabelShort).toBe("2 OF 5 · WORK");
  });

  it("armed on interval 0 reads its ordinal plus READY, the caption at the moment the rower sits down", () => {
    // PHASE WU CHANGED THIS STRING. Interval 0 was the warm-up, and the
    // armed caption withheld its ordinal for the same reason the live one
    // did — it read the bare word `READY`. Interval 0 is a counted piece
    // now, so the armed caption carries its number like any other.
    // FIXTURE (not NO_WARMUP), armed at interval 0 — the only realistic
    // armed case, since nothing has happened yet and the machine always
    // starts at interval 0.
    const m = buildSurfaceModel({
      phases: FIXTURE.phases,
      program: FIXTURE.program,
      status: "armed",
      linkLost: false,
      frame: frame({
        state: "armed",
        intervalIndex: 0,
        rowingActive: false,
        distanceMeters: 0,
      }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
    });
    expect(m.intervalLabelShort).toBe("1 OF 5 · READY");
  });
});

// CR2 spec 3 Task 2 (design spec §3, composition note under §2B): the
// ordinal-only sibling `intervalLabelShort` bakes its phase word out of —
// Task 5's grid header (`ConnectedSurface.tsx`'s `headerTrailing`) joins
// this with `totalLeftDisplay` instead.
describe("intervalOrdinalLabel: the ordinal without the phase word (design spec §3)", () => {
  it("is the ordinal plus the interval count", () => {
    const m = model({ frame: frame({ intervalIndex: 1 }) });
    expect(m.intervalOrdinalLabel).toBe("2 OF 5"); // Phase WU: was "1 OF 4"
  });

  it("is present on interval 0 too — Phase WU left no unnumbered interval for it to be null on", () => {
    // This case used to pin `null` for the warm-up. The only `null` left is
    // an EMPTY program, which `compileProgram` cannot produce
    // (`no-work`) — so the honest assertion is that a real program's first
    // interval has an ordinal like every other.
    const m = model({ frame: frame({ intervalIndex: 0 }) });
    expect(m.intervalOrdinalLabel).toBe("1 OF 5");
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
    // "2K Test" (onboarding): 2000m at MAX effort, no spm at all — the one
    // real production shape with an effort target AND no spm (see
    // `EFFORT_METERS_NO_SPM`'s own comment). `effortWord("max")` is
    // `"ALL OUT"`.
    expect(connectedNextText(EFFORT_METERS_NO_SPM, -1)).toBe(
      "WORK 2000m · ALL OUT",
    );
  });

  it("work, meters, effort target -> WORK {meters}m · EASY", () => {
    // PHASE WU CHANGED BOTH STRINGS IN THIS PAIR. `connectedNextText` had a
    // `case "warmup"` arm that produced `WARM-UP 2000m · Easy` from a
    // warm-up phase's own `label` ("Easy"). The union has no warm-up
    // member, so the kind word is `WORK`, and the phase these fixtures
    // build is an authored EASY effort step whose `label` is
    // `effortWord`'s own uppercase `EASY`. The COMPOSITION is unchanged —
    // still `${kind} ${extent} · ${label}` read straight off the phase.
    expect(connectedNextText(WARMUP_METERS.phases, -1)).toBe(
      "WORK 2000m · EASY",
    );
  });

  it("work, time, effort target -> WORK {duration} · EASY", () => {
    expect(connectedNextText(FIXTURE.phases, -1)).toBe("WORK 8:00 · EASY");
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
      linkLost: false,
      frame: frame({
        state: "armed",
        intervalIndex: 0,
        rowingActive: false,
        distanceMeters: 0,
      }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
    });
    // Hardcoded, not `WORK ${fmtSplit(work.targetSplit)}` — same
    // anti-tautology reasoning as the property rows above.
    expect(armedModel.upNext).toBe("WORK 2000m · 2:06.0 @22");

    const liveModel = buildSurfaceModel({
      phases: NO_WARMUP.phases,
      program: NO_WARMUP.program,
      status: "live",
      linkLost: false,
      frame: frame({ intervalIndex: 0 }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
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
  // EST LEFT (Phase LL): no longer a straight mirror of
  // `frame.sessionElapsedSeconds` — see `elapsedSeconds`'s own doc comment
  // on `SurfaceModel`. Default `frame()` (`intervalIndex: 1`, `state:
  // "rowing"`) lands on the fixture's FIRST work phase (`FIXTURE.phases[1]`
  // — index 0 is the warm-up, which `phaseIndexForInterval` counts too),
  // so the completed-phase sum is the warm-up alone (480 s, 8:00) and the
  // live term is this override's own raw elapsed.
  it("sums the completed phases' own programmed length plus the current phase's live term", () => {
    const m = model({ frame: frame({ elapsedSeconds: 600 }) });
    expect(m.elapsedSeconds).toBe(480 + 600);
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
      linkLost: false,
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
      freeRow: false,
    });
    expect(m.elapsedSeconds).toBe(0);
    // Not armed: the ordinary (EST LEFT) formula still applies — a
    // suppression scoped to armed, not a change to the live formula. Same
    // 480 (warm-up) + 900 (this override's live term) shape as the
    // describe block's first test.
    const liveModel = model({
      status: "live",
      linkLost: false,
      frame: frame({ sessionElapsedSeconds: 900, elapsedSeconds: 900 }),
    });
    expect(liveModel.elapsedSeconds).toBe(480 + 900);
  });
});

describe("live", () => {
  it("names the machine's interval out of the program's own count", () => {
    const m = model({ frame: frame({ intervalIndex: 1 }) });
    // Phase WU: this is the first of Filling Low's four 2000 m reps, and it
    // is piece TWO of five now — the easy opener ahead of it is counted.
    // The strings used to read `1 OF 4`.
    expect(m.intervalLabel).toBe("INTERVAL 2 OF 5 · WORK");
    expect(m.intervalLabelShort).toBe("2 OF 5 · WORK");
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

  // THE NO-TARGET STATE, RATE HALF ONLY (design spec §6, adversarial
  // finding) — SPLIT HALF OVERTURNED (connected-metrics design spec,
  // States table, "Rest, after a completed work interval": TGT now names
  // the FINISHED interval's own target, not the rest phase's word — see
  // the `avg` describe block below, whose "rest after a completed
  // interval" case is this exact frame). `phaseIndexForInterval`'s own
  // resting rule lands interval 1's REST phase when `state: "resting"`
  // sits on `intervalIndex: 1` (the fixture's own first work rep — this
  // file's header names the shape: warm-up, then 4 x 2000m with rest
  // folded after each).
  it("during REST the split target now NAMES the finished interval, while the rate target still names the phase (Free), and the LIVE actuals above stay unjudged", () => {
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
        // target, to prove the LIVE split/rate stay unjudged through the
        // rest — `pace`/`rate` are the erg's live-actual heroes, never the
        // rest verdict (that is `avg`, tested below).
        currentSplit: 60,
        spm: 40,
      }),
    });
    // THE SPLIT TARGET NOW NAMES THE FINISHED INTERVAL — "2:06.0", the
    // same resolved split `firstWorkPhase()` carries, not the rest
    // phase's own "Rest" word (`targetSplitDisplay`'s `sub` is the ref
    // tag, `6K +4`, the fixture's own authored `{ base: "6k", off: 4 }`).
    expect(m.targetSplit.main).toBe("2:06.0");
    expect(m.targetSplit.sub).toBe("6K +4");
    expect(m.targetSplit.absent).toBe(false);
    expect(m.targetSplitCaption).toBe("6K +4");
    // The LIVE split hero itself is unaffected by the TGT-row override —
    // its own judging target still comes from `phase` (the rest phase,
    // unchanged), and its actual is null through every rest regardless
    // (`livePace`'s own zero-split rule) — this assertion is the proof
    // the override is scoped to the display row alone.
    expect(m.pace.judgement).toBe("within");
    expect(m.pace.absent).toBe(false);
    // The rate half is untouched by this task (design spec's States table
    // never mentions the rate target changing at rest) — still the WORD.
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
      linkLost: false,
      frame: frame({
        intervalIndex: 1,
        // A split that would read `"faster"` against the 5' paddle's own
        // estimate (6k+20 = 142) if anything judged against it. Nothing
        // may: the estimate is not a programmed target.
        currentSplit: 100,
      }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
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
      linkLost: false,
      frame: frame({ intervalIndex: 0 }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
    });
    expect(numeric.targetSplit.main).toBe("2:14.0"); // 6k 122 + 12
    expect(numeric.targetSplit.absent).toBe(false);
    expect(numeric.targetSplitCaption).toBe("6K +12");

    const allOut = buildSurfaceModel({
      phases: EFFORT_MAX.phases,
      program: EFFORT_MAX.program,
      status: "live",
      linkLost: false,
      frame: frame({ intervalIndex: 0, currentSplit: 100 }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
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

  it("prices EST LEFT off the workout's own phases, not the machine's guess", () => {
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
    //
    // EST LEFT (Phase LL): the SUBTRAHEND is no longer the override's own
    // 600 s alone — `elapsedSeconds`'s own test above pins the exact
    // formula (480 warm-up + 600 live term = 1080), reused here rather
    // than re-derived, so this test stays about where `totalSeconds` came
    // from (its own title) without ALSO re-proving the subtraction.
    const m = model({ frame: frame({ elapsedSeconds: 600 }) });
    expect(m.totalSeconds).toBe(3216);
    expect(m.totalLeftDisplay).toBe(fmtDuration((3216 - (480 + 600)) / 60));
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
// connected-metrics design spec (2026-08-18), Task 3 — `avg`: the interval
// average and its rest verdict. One test per row of the design's States
// table, built from real seeded programs (this file's own realistic-
// fixture rule), hardcoded expected strings rather than round-tripping
// through `fmtSplit` (anti-tautology). `firstWorkPhase().targetSplit` is
// 126 ("2:06.0") throughout — every deviation below is arithmetic against
// that one number, named at each call site.
// ---------------------------------------------------------------------------

describe("avg: the interval average and its rest verdict (connected-metrics design spec)", () => {
  it("ON_TARGET_BAND_SECONDS is 0.5 — the constant every boundary assertion below assumes", () => {
    expect(ON_TARGET_BAND_SECONDS).toBe(0.5);
  });

  // States table row 1: "Work, split target, average > 0" — plain ink,
  // unjudged, even against a real numeric target far enough away that a
  // judged cell would scream a verdict.
  it("work with a split target: AVG is plain ink and unjudged, however far from target", () => {
    expect(firstWorkPhase().targetSplit).toBe(126);
    const m = model({
      frame: frame({ intervalIndex: 1, state: "rowing", splitAvgPace: 140 }),
    });
    expect(m.avg.display).toBe("2:20.0");
    expect(m.avg.judgement).toBe("within");
    expect(m.avg.absent).toBe(false);
    // TGT is unaffected — still THIS interval's own target (row 1's own
    // TGT clause), not the rest-only override tested further down.
    expect(m.targetSplit.main).toBe("2:06.0");
    expect(m.targetSplit.absent).toBe(false);
  });

  // States table row 2: "Work, average absent or zero" — the wire's own
  // "no sample yet" value (exit criterion 4: `session-2` carries 34 zero
  // frames, the first twelve consecutive).
  it("zero average renders nothing, while rowing — TGT stays this interval's own target", () => {
    const m = model({
      frame: frame({ intervalIndex: 1, state: "rowing", splitAvgPace: 0 }),
    });
    expect(m.avg.display).toBe("—");
    expect(m.avg.judgement).toBe("within");
    expect(m.avg.absent).toBe(true);
    expect(m.targetSplit.main).toBe("2:06.0");
    expect(m.targetSplit.absent).toBe(false);
  });

  // States table row 3: "Work, effort target (no split)" — Rear Flank (AN,
  // 5 x (1'/2'/3' at MAX)), every work interval an effort target, no
  // numeric split anywhere to judge against even if this state were judged
  // (it never is).
  it("work with an effort target: AVG still shows, plain ink, unjudged", () => {
    expect(EFFORT_MAX.phases[0]!.targetKind).toBe("effort");
    const m = buildSurfaceModel({
      phases: EFFORT_MAX.phases,
      program: EFFORT_MAX.program,
      status: "live",
      linkLost: false,
      frame: frame({ intervalIndex: 0, state: "rowing", splitAvgPace: 95 }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
    });
    expect(m.avg.display).toBe("1:35.0");
    expect(m.avg.judgement).toBe("within");
    expect(m.avg.absent).toBe(false);
    expect(m.targetSplit.main).toBe("ALL OUT");
  });

  // Row 4's own effort-target corner (self-mutation finding, task-3
  // report): an EFFORT phase's `targetSplit` is a real, defined number
  // (`estimationSplit`'s own estimate, `domain/expand.ts`'s effort arm) —
  // it is not `undefined` the way a warm-up's split can be, so a rest-
  // verdict gate that checks only "is `targetSplit` defined" rather than
  // "is `targetKind` `split`" would judge AVG against an estimate the
  // machine was never given as a target. Rear Flank's first work interval
  // carries `restMinutes: 1` (a real rest phase at `phases[1]`), so this is
  // a real production shape, not a constructed one.
  it("rest after a completed EFFORT-target interval: AVG stays unjudged even though the phase carries an estimated split", () => {
    expect(EFFORT_MAX.phases[1]!.type).toBe("rest");
    expect(EFFORT_MAX.phases[0]!.targetKind).toBe("effort");
    expect(EFFORT_MAX.phases[0]!.targetSplit).not.toBeUndefined();
    const m = buildSurfaceModel({
      phases: EFFORT_MAX.phases,
      program: EFFORT_MAX.program,
      status: "live",
      linkLost: false,
      frame: frame({ intervalIndex: 0, state: "resting", splitAvgPace: 90 }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
    });
    expect(m.avg.judgement).toBe("within");
    expect(m.avg.absent).toBe(false);
    expect(m.targetSplit.main).toBe("ALL OUT");
    expect(m.targetSplit.absent).toBe(true);
  });

  // States table row 6: an interval with no numeric target — live average,
  // plain ink, never judged. (This row said "Warm-up" until Phase WU; the
  // property is a target-less interval's, not a warm-up's.)
  it("a target-less interval: AVG shows live, plain ink, never judged", () => {
    expect(FIXTURE.phases[0]!.targetKind).toBe("effort");
    const m = model({
      frame: frame({ intervalIndex: 0, state: "rowing", splitAvgPace: 200 }),
    });
    expect(m.avg.display).toBe("3:20.0");
    expect(m.avg.judgement).toBe("within");
    expect(m.avg.absent).toBe(false);
    expect(m.targetSplit.main).toBe("EASY"); // Phase WU: was the warm-up's "Easy"
    expect(m.targetSplit.absent).toBe(true);
  });

  // States table row 7: "Free piece, no split target" — TGT `nothing`
  // (never a phase word), the one case `phase` is genuinely `undefined`
  // (the same empty-program guard "degenerate inputs" above pins for TGT;
  // unreachable in production today since `compileProgram` rejects a
  // program with no work at all, but the guard needs its own exercise for
  // AVG the same reason it already has one for `targetSplit`).
  it("free piece (no phase at all): AVG still shows, plain ink; TGT is a bare dash, not a phase word", () => {
    const m = buildSurfaceModel({
      phases: [],
      program: FIXTURE.program,
      status: "live",
      linkLost: false,
      frame: frame({ intervalIndex: 0, state: "rowing", splitAvgPace: 150 }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
    });
    expect(m.avg.display).toBe("2:30.0");
    expect(m.avg.judgement).toBe("within");
    expect(m.avg.absent).toBe(false);
    expect(m.targetSplit.main).toBe("—");
    expect(m.targetSplit.absent).toBe(true);
  });

  // States table row 4: "Rest, after a completed work interval" — TGT
  // shows the FINISHED interval's own target, AVG is judged against it
  // using ON_TARGET_BAND_SECONDS, both sides of the boundary asserted so a
  // mutant swapping `<=`/`<` or flipping the sign is caught.
  it("rest after a completed interval: AVG is judged against THAT interval's target, TGT names it too", () => {
    const target = firstWorkPhase().targetSplit!; // 126
    expect(target).toBe(126);
    function avgAt(splitAvgPace: number) {
      return model({
        frame: frame({ intervalIndex: 1, state: "resting", splitAvgPace }),
      }).avg;
    }
    // On the boundary itself (deviation exactly +0.5) — still "within".
    expect(avgAt(126.5).judgement).toBe("within");
    expect(avgAt(126.5).display).toBe("2:06.5");
    // One tenth past it — "slower" ("+ = slower", summaryModel.ts:208-224).
    expect(avgAt(126.6).judgement).toBe("slower");
    // Symmetric on the fast side: -0.5 is still "within", -0.6 is "faster".
    expect(avgAt(125.5).judgement).toBe("within");
    expect(avgAt(125.4).judgement).toBe("faster");
    // Comfortably slower/faster, for the display string too.
    expect(avgAt(130).judgement).toBe("slower");
    expect(avgAt(130).display).toBe("2:10.0");
    expect(avgAt(120).judgement).toBe("faster");
    expect(avgAt(120).display).toBe("2:00.0");
    // TGT: the FINISHED interval's own resolved split, not the rest
    // phase's "Rest" word — same fixture, same fact `firstWorkPhase()`
    // names above.
    const m = model({
      frame: frame({ intervalIndex: 1, state: "resting", splitAvgPace: 130 }),
    });
    expect(m.targetSplit.main).toBe("2:06.0");
    expect(m.targetSplit.sub).toBe("6K +4");
    expect(m.targetSplit.absent).toBe(false);
  });

  // States table row 5: "Rest, before any work interval completes".
  //
  // PHASE WU CHANGED WHAT THIS ROW'S FIXTURE HAS TO BE, and the row itself
  // splits in two. It used to be reached by a WARM-UP's own trailing rest:
  // the phase before the rest was `type: "warmup"`, `finishedWorkPhase`'s
  // `phases[i-1]?.type === "work"` test failed, and AVG was suppressed. A
  // leading easy piece IS work now, so that same session's rest has a
  // completed work interval behind it and AVG shows — which is the correct
  // reading, not a regression: the rower really did just finish a piece.
  // The first case below pins that change; the second keeps the
  // SUPPRESSION pinned, reached by the shape that still produces it (a
  // rest whose predecessor is a "test" phase, so nothing WORK completed).
  it("rest after the leading interval: AVG now SHOWS, because that interval is a completed work piece", () => {
    expect(WARMUP_WITH_REST.phases[1]!.type).toBe("rest");
    const m = buildSurfaceModel({
      phases: WARMUP_WITH_REST.phases,
      program: WARMUP_WITH_REST.program,
      status: "live",
      linkLost: false,
      frame: frame({ intervalIndex: 0, state: "resting", splitAvgPace: 200 }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
    });
    // Shown, and plain ink: the finished opener is an EFFORT piece, so it
    // has no numeric target to judge the average against.
    expect(m.avg.display).toBe("3:20.0");
    expect(m.avg.judgement).toBe("within");
    expect(m.avg.absent).toBe(false);
  });

  it("rest before any WORK interval completes: AVG is absent, TGT stays as today", () => {
    // A "test" phase followed by its rest — the surviving shape where
    // `finishedWorkPhase` is genuinely undefined at a rest. A nonzero,
    // non-null wire value proves the suppression is about the MISSING
    // completed work interval, not a coincidentally-absent reading.
    const phases: EnginePhase[] = [
      { type: "test", label: "All out", originalIndex: 0 },
      { type: "rest", seconds: 60, label: "Rest", originalIndex: 0 },
      {
        type: "work",
        seconds: 240,
        targetKind: "split",
        targetSplit: 126,
        label: "2:06.0",
        originalIndex: 1,
      },
    ];
    const m = buildSurfaceModel({
      phases,
      program: WARMUP_WITH_REST.program,
      status: "live",
      linkLost: false,
      frame: frame({ intervalIndex: 0, state: "resting", splitAvgPace: 200 }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
    });
    expect(m.avg.display).toBe("—");
    expect(m.avg.judgement).toBe("within");
    expect(m.avg.absent).toBe(true);
    expect(m.targetSplit.main).toBe("Rest");
    expect(m.targetSplit.absent).toBe(true);
  });

  // States table row 8: "Rest onset ... while the referent disagrees" —
  // the driver already nulls `frame.splitAvgPace` for a lagged provenance
  // (`domain/monitor/types.ts`'s own field comment); this file does not
  // re-derive that, it only proves TGT still resolves off the (already
  // monotone) referent independently of whatever AVG itself is doing.
  it("referent mismatch: AVG is absent (the driver's own null), TGT still names the referent's target", () => {
    const m = model({
      frame: frame({ intervalIndex: 1, state: "resting", splitAvgPace: null }),
    });
    expect(m.avg.display).toBe("—");
    expect(m.avg.judgement).toBe("within");
    expect(m.avg.absent).toBe(true);
    expect(m.targetSplit.main).toBe("2:06.0");
    expect(m.targetSplit.absent).toBe(false);
  });

  // States table row 9: "Finished / terminated / idle" — `intervalIndex`
  // is `null` here (business rule, `domain/monitor/types.ts`), and the
  // existing `?? 0` laundering (`buildSurfaceModel`'s own `rawIndex`) would
  // otherwise pair AVG with the warm-up's target. A nonzero `splitAvgPace`
  // proves the suppression checks the RAW field, not the laundered one.
  it("finished/idle: AVG is absent even with a real wire value, never laundered through intervalIndex ?? 0", () => {
    const m = model({
      frame: frame({
        state: "finished",
        intervalIndex: null,
        splitAvgPace: 130,
      }),
    });
    // The known laundering trap this test guards against: `intervalLabel`
    // DOES read as interval 0 here (the `?? 0` this task must not reuse
    // for AVG) — pinned so a reader sees the trap is real, not imagined.
    // Phase WU: that caption was the bare `WARM-UP` before; interval 0 is a
    // numbered piece now, which makes the laundering MORE visible, not less.
    expect(m.intervalLabel).toBe("INTERVAL 1 OF 5 · WORK");
    expect(m.avg.display).toBe("—");
    expect(m.avg.judgement).toBe("within");
    expect(m.avg.absent).toBe(true);
  });

  // States table row 10: "Stale / disconnected" — the last value, under
  // the pane's existing staleness treatment: shown (not absent), greyed by
  // the `"stale"` judgement, beating whatever the comparison would
  // otherwise have said (the same precedence `judgedValue`'s own stale
  // test pins for `pace`/`rate`).
  it("stale: the last AVG value is shown, greyed, never a fabricated verdict", () => {
    const m = model({
      status: "live",
      linkLost: true,
      frame: frame({ intervalIndex: 1, state: "rowing", splitAvgPace: 130 }),
    });
    expect(m.avg.display).toBe("2:10.0");
    expect(m.avg.judgement).toBe("stale");
    expect(m.avg.absent).toBe(false);
  });
});

// connected-metrics design spec, "Total meters (whole session)": Task 4
// renders it, but `PaneLive` reads only `SurfaceModel` — never `frame`
// directly (`ConnectedSurface.tsx`'s own `<PaneLive model={model} />`) —
// so this task exposes the plumbing fact the render needs. `null`, not
// `0`, before the machine's first frame: `NO_FRAME.sessionDistanceMeters`
// is honestly `0`, which would otherwise be indistinguishable from a real
// first frame reporting zero.
describe("sessionDistanceMeters: plumbing for Task 4 (PaneLive reads only the model, never the frame)", () => {
  it("carries the frame's own running total once a frame has arrived", () => {
    const m = model({ frame: frame({ sessionDistanceMeters: 3842 }) });
    expect(m.sessionDistanceMeters).toBe(3842);
  });

  it("is null before the first frame — distinct from a real 0m reading", () => {
    const m = model({ frame: null });
    expect(m.sessionDistanceMeters).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Walk 4 (2026-08-08, interface-notes.md §18): 0x0031's clock and distance
// RESET at every work interval. Both of these panes read the accumulated
// session pair now; these are the two failures the walk actually recorded.
// ---------------------------------------------------------------------------

describe("the session pair across a work-interval reset (walk 4)", () => {
  // EST LEFT REWRITE (Phase LL, 2026-08-20) — WHY THIS FIXTURE'S NUMBERS
  // CHANGED SHAPE, NOT JUST VALUE (a finding for the task report, per the
  // brief: this file's own `:1508`-equivalent test is named there as one
  // to read before editing). Before this task, `elapsedSeconds`/
  // `totalLeftDisplay` were a straight subtraction of
  // `frame.sessionElapsedSeconds` — the driver's own accumulated clock —
  // which is exactly why the ORIGINAL two frames below (both defaulting
  // `intervalIndex: 1`, only `state` differing) sufficed: the mechanism
  // being protected never looked at `intervalIndex` at all, only at
  // whether `sessionElapsedSeconds` (not `elapsedSeconds`) was read.
  // `buildSurfaceModel` no longer computes either field that way (design
  // spec §1: a phase-sum plus a live term, clamped monotonic per-frame by
  // the CALLER, §3) — a fixture that never advances `intervalIndex` across
  // a "work-interval reset" no longer exercises a boundary at all under
  // the new mechanism, so it stopped being able to discriminate the bug
  // this describe block is named for.
  //
  // The two tests below are REWRITTEN, not deleted, to protect the SAME
  // property the walk-4 regression cost: EST LEFT must not rise when
  // 0x0031's own per-interval clock resets across a genuine work-interval
  // boundary. What changed is how that boundary is modelled (a REAL
  // `intervalIndex` advance, 1 -> 2 — "interval 1"/"interval 2" in the
  // ORIGINAL walk-4 recording's own 1-based work numbering, `program`
  // index terms: interval 1 = `phases[1]`, the FIRST work phase after the
  // warm-up; interval 2 = `phases[3]`, the second) and how the monotonic
  // guarantee is exercised (`previousElapsedSeconds` threaded between
  // calls the same way `ConnectedSurface.tsx` threads it in production —
  // omitting that thread would let this test pass or fail by accident of
  // the exact numbers chosen, never actually probing the clamp).
  /** The recorded shape, frame for frame: the last `resting` frame of
   *  interval 1's own trailing rest (`elapsed=37.81 distance=101.8` on the
   *  wire — the LIVE term this file computes reads `restSeconds`, not
   *  this raw pair, but the pair is kept to match the original walk-4
   *  capture's own numbers), the first `rowing` frame of interval 2 with
   *  0x0031's own per-interval pair back at the floor (`elapsed=0
   *  distance=0.7`), and one frame further in. */
  const ACROSS_THE_RESET = [
    frame({
      state: "resting",
      intervalIndex: 1,
      // The LAST frame of the rest: `restSeconds` at 0 (the machine's own
      // countdown has reached its floor), so the live term credits the
      // rest's full programmed 3:00 — this frame IS the boundary's edge.
      restSeconds: 0,
      elapsedSeconds: 37.81,
      distanceMeters: 101.8,
      sessionElapsedSeconds: 37.81,
      sessionDistanceMeters: 101.8,
    }),
    frame({
      state: "rowing",
      intervalIndex: 2,
      elapsedSeconds: 0,
      distanceMeters: 0.7,
      sessionElapsedSeconds: 37.81,
      sessionDistanceMeters: 102.5,
    }),
    frame({
      state: "rowing",
      intervalIndex: 2,
      elapsedSeconds: 1.2,
      distanceMeters: 3.1,
      sessionElapsedSeconds: 39.01,
      sessionDistanceMeters: 104.9,
    }),
  ];

  /** Threads `previousElapsedSeconds` between successive builds the way
   *  `ConnectedSurface.tsx` does in production (that field's own doc
   *  comment on `SurfaceModelInput`) — the monotonic clamp this rewrite
   *  protects is a property of a SEQUENCE of frames, not any one frame in
   *  isolation, so a test that built each frame's model independently
   *  (as this file's plain `model()` helper does) would never exercise it. */
  function modelsAcross(frames: MonitorFrame[]): SurfaceModel[] {
    let previousElapsedSeconds: number | undefined;
    return frames.map((f) => {
      const m = model({ frame: f, previousElapsedSeconds });
      previousElapsedSeconds = m.elapsedSeconds;
      return m;
    });
  }

  it("elapsedSeconds never falls across the reset (the recorded 1:11 -> 1:38 TOTAL LEFT bug, same session pair)", () => {
    const elapsed = modelsAcross(ACROSS_THE_RESET).map((m) => m.elapsedSeconds);

    // 1164 s = the warm-up (480) + the first work phase (2000 m @ 2:06.0 =
    // 504) + its own trailing rest, fully credited (180, `restSeconds: 0`
    // on the boundary frame) — phases[0..2], all now COMPLETE. The middle
    // frame holds that exact total rather than collapsing to its own raw
    // per-interval clock (0): the completed-phase sum already banked
    // interval 1's rest, and the live term for the NEW phase (interval 2,
    // just starting) is that raw 0 on top of it, not instead of it. The
    // third frame ticks forward by exactly the raw clock's own advance
    // (1.2 s) — nothing more, nothing collapsed.
    expect(elapsed).toStrictEqual([1164, 1164, 1165.2]);
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

  // THE DISCRIMINATOR, RE-FOUNDED (antagonist phase-exit pass, §2B witness
  // gap, ORIGINAL premise; EST LEFT rewrite, Phase LL — the mechanism this
  // test discriminates changed, the fact it protects did not). The old
  // wording ("subtracts the SESSION clock, never the interval's own
  // resetting one") named the specific WRONG FIELD a mutant could read
  // (`frame.elapsedSeconds` in place of `frame.sessionElapsedSeconds`) —
  // that mutation is no longer even expressible the same way, since
  // neither field is read directly any more (§1's phase-sum reads
  // `frame.elapsedSeconds` ONLY as the current phase's own live term, atop
  // a completed-phase sum `sessionElapsedSeconds` never contributed to).
  // What still must hold, and is asserted below: EST LEFT must not RISE
  // when 0x0031's own per-interval clock resets across a genuine
  // work-interval boundary (the recorded 1:11 -> 1:38 bug, read from this
  // field instead of `elapsedSeconds`), and the number is genuinely a
  // SUBTRACTION, not a value that ignores the completed-phase credit a
  // naive "just re-read the raw per-interval clock" mutant would produce.
  it("EST LEFT does not rise across a work-interval boundary reset, and is not the raw per-interval clock alone", () => {
    const [before, atReset] = modelsAcross(ACROSS_THE_RESET);
    const shownBefore = before!.totalLeftDisplay;
    const shownAtReset = atReset!.totalLeftDisplay;

    // Same estimate (1164 s elapsed, the previous test's own number) on
    // both sides of the raw-clock reset, so the remaining clock must not
    // move...
    expect(shownAtReset).toBe(shownBefore);
    // 3216 - 1164 = 2052 s = 34:12, this file's own `totalSessionSecondsOf`
    // fact from the "prices EST LEFT" test below, minus the exact
    // elapsed this describe block's first test just pinned.
    expect(shownAtReset).toBe(fmtDuration(2052 / 60));
    // ...and must differ from what IGNORING the completed-phase credit and
    // reading only the reset frame's own raw per-interval clock (0) would
    // render — exactly the shape the pre-Phase-LL bug had, reincarnated as
    // a mutation of the NEW mechanism rather than the old one.
    expect(shownAtReset).not.toBe(fmtDuration(3216 / 60));
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
      status: "live",
      linkLost: true,
      frame: frame({ currentSplit: target - 30, spm: 40 }),
    });
    expect(m.stale).toBe(true);
    expect(m.pace.judgement).toBe("stale");
    expect(m.rate.judgement).toBe("stale");
  });

  // `LAST SEEN`, not `LAST` (Phase LM PR 1 Task 3, Gate 0): the bare word
  // reads as an ordinal — the last of several readings — where the fact
  // the rower needs is that this number is the last one we HEARD, and
  // that it stopped being current at some point they were not told about.
  it("relabels NOW as LAST SEEN and hollows the indicator", () => {
    const m = model({ status: "live", linkLost: true });
    expect(m.nowLabel).toBe("LAST SEEN");
    expect(m.linked).toBe(false);
  });

  it("promises nothing: the caption reads LOST, never TRYING", () => {
    // The exact caption forbids "TRYING" on its own; the extra
    // `not.toContain("TRYING")` trailer that used to follow could not fail
    // once this line passed (test-integrity sweep, S0g).
    const m = model({ status: "live", linkLost: true });
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
    expect(m.intervalLabel).toBe("INTERVAL 1 OF 5 · WORK");
  });

  it("clamps an interval index the machine ran past the program", () => {
    const m = model({ frame: frame({ intervalIndex: 99 }) });
    // The clamp is against the PROGRAM's own length (5 intervals), and the
    // caption it produces is the last piece's own number. Phase WU: `5 OF
    // 5`, not `4 OF 4` — the denominator is the program's length now.
    expect(m.intervalLabel).toBe("INTERVAL 5 OF 5 · WORK");
  });

  it("treats a null interval index as the first, never as a crash", () => {
    const m = model({ frame: frame({ intervalIndex: null }) });
    expect(m.intervalLabel).toBe("INTERVAL 1 OF 5 · WORK");
  });

  it("never renders the `PM5` placeholder unless the picker gave us nothing", () => {
    // Spec I5: no screen renders the placeholder when a real advertised
    // name exists. `null` only happens if the hook reached a live phase
    // without a picker result, which is a caller bug — but it renders a
    // word, not `undefined`.
    expect(model({ deviceName: null }).deviceCaption).toBe("PM5");
    expect(
      model({ deviceName: null, status: "live", linkLost: true }).deviceCaption,
    ).toBe("PM5 · LOST");
  });

  it("renders an empty phase list without inventing a phase", () => {
    // Unreachable in production (`compileProgram` rejects a program with no
    // work at all, `"no-work"`), so this is the guard's only exercise.
    const m = buildSurfaceModel({
      phases: [],
      program: FIXTURE.program,
      status: "live",
      linkLost: false,
      frame: frame(),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
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
    // Phase WU: the caption reads off `FIXTURE.program` (passed above), so
    // it renumbers with everything else — `2 OF 5`, not `1 OF 4`.
    expect(m.intervalLabel).toBe("INTERVAL 2 OF 5 · WORK");
  });

  // `paceCaption`'s own "NO PACE TARGET" assertion retired with the field
  // (§10.2 DECIDE, same disposition as the paused describe above); the
  // no-target state now speaks through `targetSplit.main` itself.
  it("the hero's target NAMES the phase when it carries no split target of its own", () => {
    const m = model({ frame: frame({ intervalIndex: 0 }) });
    expect(FIXTURE.phases[0]!.targetKind).toBe("effort");
    // Phase WU: the word is the EFFORT phase's own `EASY`, where it used to
    // be the warm-up phase's `Easy`. Both come from the phase's `label`,
    // read straight through — the rule is unchanged, the phase is not.
    expect(m.targetSplit.main).toBe("EASY");
    expect(m.targetSplit.absent).toBe(true);
    // The caption is EMPTY, not "NO SPLIT TARGET": the word above it now
    // says the same thing, and the old caption would only repeat it.
    expect(m.targetSplitCaption).toBe("");
  });
});

// --- Every interval is counted (design spec §5b, ruling 12, post-Phase-WU) -

describe("every interval is numbered", () => {
  it("numbers EVERY interval, the leading one included", () => {
    // PHASE WU CHANGED THIS NUMBER. `ordinals` used to read
    // `[null, 1, 2, 3, 4]` with `workCount: 4` — the warm-up was
    // deliberately unnumbered and excluded from the denominator, which is
    // what put `WU` in the grid's `#` cell and dropped the caption's
    // ordinal. There is no warm-up, so the five intervals are five pieces.
    const n = intervalNumbering(FIXTURE.program.intervals);
    expect(FIXTURE.program.intervals).toHaveLength(5);
    expect(n.ordinals).toStrictEqual([1, 2, 3, 4, 5]);
    expect(n.workCount).toBe(5);
  });

  it("numbers a four-interval session exactly as it always did", () => {
    const n = intervalNumbering(NO_WARMUP.program.intervals);
    expect(n.ordinals).toStrictEqual([1, 2, 3, 4]);
    expect(n.workCount).toBe(4);
  });

  it("counts a TEST piece too — nothing is excluded from the numbering", () => {
    // Phase WU: this list opened with a `type: "warmup"` interval and the
    // expectation read `[null, 1, 2]` / `workCount: 2`, because the warm-up
    // was the one thing the count skipped. It is gone, so the list is two
    // intervals and both are numbered.
    const n = intervalNumbering([
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
    expect(n.ordinals).toStrictEqual([1, 2]);
    expect(n.workCount).toBe(2);
  });

  it("numbers the FIRST interval 1 OF 5, the caption the rower reads while opening the session", () => {
    // PHASE WU CHANGED THIS STRING, and it is the change the whole phase is
    // about. Interval 0 used to be the warm-up: the caption read the bare
    // word `WARM-UP`, with the ordinal deliberately withheld so a rower
    // warming up would not read `1 OF 5` on a workout they know as four
    // pieces. That workout IS five pieces now — the opener is one of them —
    // so it reads `1 OF 5 · WORK` like any other.
    const m = model({ frame: frame({ intervalIndex: 0 }) });
    expect(m.intervalLabelShort).toBe("1 OF 5 · WORK");
    expect(m.intervalLabel).toBe("INTERVAL 1 OF 5 · WORK");
  });

  it("counts every piece, denominator included, across the whole five-piece program", () => {
    // PHASE WU CHANGED THESE STRINGS. They used to read `1 OF 4` ... `4 OF
    // 4` for intervals 1..4 — the warm-up sat at index 0, uncounted, so the
    // denominator was one short of the program's own length. Both halves
    // move together: the pieces keep their positions and the denominator is
    // the program's real length.
    const captions = [1, 2, 3, 4].map(
      (i) => model({ frame: frame({ intervalIndex: i }) }).intervalLabelShort,
    );
    expect(captions).toStrictEqual([
      "2 OF 5 · WORK",
      "3 OF 5 · WORK",
      "4 OF 5 · WORK",
      "5 OF 5 · WORK",
    ]);
    expect(FIXTURE.program.intervals).toHaveLength(5);
  });

  it("keeps the ordinal through a leading interval's own trailing rest", () => {
    // PHASE WU CHANGED THIS STRING. The ordinal belongs to the INTERVAL and
    // the word to the PHASE: resting inside interval 0 used to be resting
    // inside the WARM-UP, which was no part of the rower's count, so this
    // read the bare `REST`. Interval 0 is a counted piece now, so its rest
    // carries its number.
    const withRest = libraryFixture("Filling Low", {
      k: "w",
      duration: { kind: "time", minutes: 8 },
      ref: { effort: "min" },
      restMinutes: 1,
    });
    expect(withRest.phases[1]!.type).toBe("rest");
    const m = buildSurfaceModel({
      phases: withRest.phases,
      program: withRest.program,
      status: "live",
      linkLost: false,
      frame: frame({ intervalIndex: 0, state: "resting" }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
    });
    expect(m.intervalLabelShort).toBe("1 OF 5 · REST");
    // …and a rest inside a later interval keeps its own number too.
    const working = model({
      frame: frame({ intervalIndex: 1, state: "resting" }),
    });
    expect(working.intervalLabelShort).toBe("2 OF 5 · REST");
  });

  it("A FOUR-INTERVAL SESSION IS EXACTLY WHAT IT WAS", () => {
    // The regression pin that matters most: a program with no leading easy
    // piece is untouched by any of this. Every caption is the plain
    // `N OF M` formula, over the program's own full length.
    for (let i = 0; i < NO_WARMUP.program.intervals.length; i += 1) {
      const m = buildSurfaceModel({
        phases: NO_WARMUP.phases,
        program: NO_WARMUP.program,
        status: "live",
        linkLost: false,
        frame: frame({ intervalIndex: i }),
        deviceName: DEVICE,
        actuals: [],
        freeRow: false,
      });
      expect(m.intervalLabelShort).toBe(
        `${i + 1} OF ${NO_WARMUP.program.intervals.length} · WORK`,
      );
      expect(m.intervalLabel).toBe(
        `INTERVAL ${i + 1} OF ${NO_WARMUP.program.intervals.length} · WORK`,
      );
    }
    expect(NO_WARMUP.program.intervals).toHaveLength(4);
  });

  it("NOTHING NEW on the live pane: a target-less interval is never graded", () => {
    // Design spec §5b's fourth row, confirmed by test rather than by change.
    // An EFFORT interval carries no programmed target (`compileProgram`
    // nulls it), so the named-but-greyed target and the judgement standing
    // down are already correct — whatever the rower is actually pulling.
    const m = model({ frame: frame({ intervalIndex: 0, currentSplit: 95 }) });
    expect(FIXTURE.phases[0]!.targetKind).toBe("effort");
    expect(FIXTURE.program.intervals[0]!.targetSplit).toBeNull();
    expect(m.targetSplit.main).toBe("EASY"); // Phase WU: was "Easy"
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
    // Phase WU SIMPLIFIED this relation back to what it was before §5b.
    // The caption used to count the WORK only while the spans counted the
    // work PLUS the warm-up's own chunk, so the identity had to be written
    // `spans - warmups === OF N`. With nothing excluded from the count, the
    // caption's denominator and the span count are the same number again:
    // `notches === OF N - 1`.
    const m = model();
    const ofN = Number(/ OF (\d+) /.exec(m.intervalLabelShort)![1]);
    expect(ofN).toBe(5);
    const spans = m.boundaries.seconds.length + 1;
    expect(spans).toBe(ofN);

    const bare = buildSurfaceModel({
      phases: NO_WARMUP.phases,
      program: NO_WARMUP.program,
      status: "live",
      linkLost: false,
      frame: frame(),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
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
      linkLost: false,
      frame: frame(),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
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
      linkLost: false,
      frame: frame(),
      deviceName: DEVICE,
      actuals: [],
      freeRow: false,
    });
    expect(m.boundaries).toStrictEqual({
      seconds: [],
      predictedFrom: null,
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

// ============================================================================
// EST LEFT (Phase LL) — replay-based proof, driven through the REAL driver.
// Plan Steps 1-2: the wire premise (design spec §5) and the monotonicity
// guarantee (§3) are both settled by REPLAYING a committed capture, never
// by reasoning alone — the first draft of this fix went backwards five
// times on this exact capture (worst -428.5 s at the `finished` frame) and
// reasoning never caught it; only frame-by-frame replay did. Harness
// re-declared, not imported — this project's own convention for these
// replay harnesses (`registerReplay.test.ts`'s own header: "no test file
// in src/monitor/ imports another test file's harness"; this file lives
// one directory further out still, so the same rule applies a fortiori).
// ============================================================================

/** Identical to `registerReplay.test.ts`/`connectedMetricsReplay.test.ts`'s
 *  own `SESSION_2_PROGRAM` — hand-transcribed from the capture's own
 *  `ce060021` programming tx bytes (those files' own header comments carry
 *  the full provenance). Re-declared per this file's header comment above. */
const SESSION_2_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      // Phase WU: transcribed `type: "warmup"` from the capture; the union
      // has no such member now, so it reads `work`. The recorded tx bytes
      // carry no warm-up concept at all (the PM5 has none), so the
      // transcription is as faithful as it was.
      type: "work",
      kind: "distance",
      value: 100,
      targetSplit: null,
      displaySpm: null,
      restSeconds: 0,
    },
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 30,
    },
    {
      type: "work",
      kind: "time",
      value: 120,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 30,
    },
    {
      type: "work",
      kind: "distance",
      value: 500,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 30,
    },
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

/** `EnginePhase[]` mirroring `SESSION_2_PROGRAM` one-for-one — identical
 *  shape to `connectedMetricsReplay.test.ts`'s own `CM_PHASES` (that
 *  file's own doc comment has the full reasoning for why rest phases are
 *  interleaved only where `restSeconds > 0`), re-declared per this file's
 *  own convention. */
const SESSION_2_PHASES: EnginePhase[] = [
  // Phase WU: was `{ type: "warmup", ..., originalIndex: -1 }`, where -1 was
  // the deleted `WARMUP_ORIGINAL_INDEX` sentinel. An ordinary work phase
  // needs a real index; 0 collides with the piece below, which is inert
  // here (nothing this harness reads consults `originalIndex`) and keeps
  // this array a verbatim mirror of the other files' copies.
  { type: "work", meters: 100, label: "Easy", originalIndex: 0 },
  {
    type: "work",
    seconds: 60,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 0,
  },
  { type: "rest", seconds: 30, label: "Rest", originalIndex: 0 },
  {
    type: "work",
    seconds: 120,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 1,
  },
  { type: "rest", seconds: 30, label: "Rest", originalIndex: 1 },
  {
    type: "work",
    meters: 500,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 2,
  },
  { type: "rest", seconds: 30, label: "Rest", originalIndex: 2 },
  {
    type: "work",
    seconds: 60,
    targetKind: "split",
    targetSplit: 129,
    label: "2:09.0",
    originalIndex: 3,
  },
];

const SESSION_2_DEVICE = "PM5 432331249";

/** Repo-root resolution, `registerReplay.test.ts`'s own idiom (plain
 *  string surgery on `import.meta.url` — this project's jsdom environment
 *  resolves `new URL(...)` against `http://localhost:3000/`, not the given
 *  `file://` base). Three directories up from `src/workout/connected/`
 *  (out of `connected/`, `workout/`, `src/`) then into `app/`, matching
 *  every other replay harness's own path arithmetic one level further. */
const SESSION_2_PATH = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/workout\/connected\/surfaceModel\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl",
  );

interface DriverFrameSample {
  tMs: number;
  frame: MonitorFrame;
}

/** Drives the committed capture through the PRODUCTION parser and driver —
 *  the same harness shape `registerReplay.test.ts`/`connectedMetricsReplay.
 *  test.ts` already established for this exact recording, re-derived here
 *  (this file's own header comment). Collects every emitted `MonitorFrame`
 *  with the virtual-clock timestamp it arrived on, so a test can measure
 *  WALL time between two frames, not just read their own wire fields. */
async function replaySession2(): Promise<DriverFrameSample[]> {
  const text = readFileSync(SESSION_2_PATH, "utf8");
  const parsed = parseRecording(text);

  const replay = createReplayTransport(parsed);
  const [dev] = await replay.transport.scan();
  await replay.transport.connect(dev.id);

  const log = createEventLog();
  const driver = createPm5Driver(replay.transport, log, {
    deviceName: dev.name,
    now: () => replay.clock.now(),
    schedule: (cb, ms) => replay.clock.schedule(cb, ms),
  });

  const samples: DriverFrameSample[] = [];
  driver.events((e) => {
    if (e.kind === "frame") {
      samples.push({ tMs: replay.clock.now(), frame: e.frame });
    }
  });

  const programPending = driver.program(SESSION_2_PROGRAM);
  await replay.run();
  await programPending;

  return samples;
}

/** One maximal run of consecutive `state === "resting"` frames — a single
 *  rest, start to end, exactly as the machine reported it. */
function restingSpans(samples: DriverFrameSample[]): DriverFrameSample[][] {
  const spans: DriverFrameSample[][] = [];
  let current: DriverFrameSample[] = [];
  for (const s of samples) {
    if (s.frame.state === "resting") {
      current.push(s);
    } else if (current.length > 0) {
      spans.push(current);
      current = [];
    }
  }
  if (current.length > 0) spans.push(current);
  return spans;
}

describe("EST LEFT (Phase LL) — a null intervalIndex is never laundered to 0 (design spec §3, exit criterion 3)", () => {
  // ISOLATED from the monotonic clamp on purpose (`previousElapsedSeconds`
  // left unset, i.e. 0): the clamp alone would MASK a laundering defect in
  // a threaded replay (a smaller estimate simply loses to the clamp's own
  // floor), which is exactly why the spec names TWO guards, not one — this
  // test proves the null-guard on its own, the same way
  // `surfaceModel.ts:865-870` (the AVG cell) is provable without a clamp
  // to hide behind.
  it("finished: elapsedSeconds falls back to the driver's session-accumulated total, never a phase-0 collapse", () => {
    const m = model({
      frame: frame({
        state: "finished",
        intervalIndex: null,
        // THE EXACT SHAPE OF THE CAPTURED -428.5 s REGRESSION (design spec
        // §3's own table): a `finished` frame's RAW per-interval clock
        // (`elapsedSeconds`) reads small — it reset at the last interval's
        // own start and the piece was short — while the driver's
        // ACCUMULATED session total (`sessionElapsedSeconds`) correctly
        // carries the whole session's real progress. A test where the two
        // coincide could not tell the honest fallback from the laundered
        // collapse; this one is chosen so they diverge sharply.
        elapsedSeconds: 5,
        sessionElapsedSeconds: 2800,
      }),
    });
    // The honest fallback (this file's own `estElapsedRaw`, the
    // `frame.intervalIndex === null` branch): the driver's own
    // session-accumulated clock, capped at the session length — NOT the
    // tiny raw per-interval reading.
    expect(m.elapsedSeconds).toBe(Math.min(2800, m.totalSeconds));
    // What the laundered version would compute instead: `phaseIndex`
    // collapses to phase 0 (the warm-up itself, nothing yet completed),
    // and the live term there is the RAW `frame.elapsedSeconds` (5) — a
    // near-total collapse, exactly the -428.5 s shape. Asserted as an
    // inequality (not the exact wrong number) so this test does not
    // become a second copy of the implementation.
    expect(m.elapsedSeconds).not.toBe(5);
  });
});

describe("EST LEFT (Phase LL) — the wire premise, verified against a real capture (design spec §5)", () => {
  let samples: DriverFrameSample[];

  beforeAll(async () => {
    samples = await replaySession2();
  }, 30_000);

  it("sanity: the replay produced a real, non-trivial frame count with three rests", () => {
    // Bug-independent first (this project's own convention throughout
    // `registerReplay.test.ts`): if this fails, the harness or fixture is
    // wrong, not the formula under test.
    expect(samples.length).toBeGreaterThan(900);
    expect(restingSpans(samples)).toHaveLength(3);
  });

  // THE PREMISE (§5's own table): for each of the three rests, the WIRE'S
  // OWN accumulated clock (`sessionElapsedSeconds`, what `elapsedSeconds`
  // used to subtract before this task) credits far less than the wall
  // time that actually passed — because 0x0031's per-interval clock
  // freezes whenever `rowingActive` goes false, and a rower sitting
  // through a rest is exactly that. `restSeconds` (0x0032's Rest Time),
  // the field this task's fix reads instead, is measured here to credit
  // close to the FULL wall time — the reason the fix works at all. **If
  // this does not reproduce the pinned numbers, the spec's premise is
  // wrong and the fix built on it needs to stop** (plan Step 1's own
  // instruction).
  it("each rest: wall time vastly exceeds what the OLD session-clock mechanism credited, and restSeconds (the NEW mechanism) tracks the wall clock", () => {
    const spans = restingSpans(samples);
    // Pinned from design spec §5's own table, replayed against the
    // production driver (not re-derived from a throwaway decode script).
    const expected = [
      { wallSeconds: 29.4, oldCredited: 9.45, tolerance: 1.5 },
      { wallSeconds: 29.5, oldCredited: 7.23, tolerance: 1.5 },
      { wallSeconds: 29.5, oldCredited: 3.9, tolerance: 1.5 },
    ];

    spans.forEach((span, i) => {
      const first = span[0]!;
      const last = span[span.length - 1]!;
      const wallSeconds = (last.tMs - first.tMs) / 1000;
      const oldCredited =
        last.frame.sessionElapsedSeconds - first.frame.sessionElapsedSeconds;
      // NEW mechanism: how much of the rest `restSeconds` (the machine's
      // own countdown) says elapsed, first frame to last — this is
      // literally the quantity `buildSurfaceModel`'s live term now reads.
      const newCredited = first.frame.restSeconds - last.frame.restSeconds;

      const {
        wallSeconds: expectedWall,
        oldCredited: expectedOld,
        tolerance,
      } = expected[i]!;
      expect(
        Math.abs(wallSeconds - expectedWall),
        `rest ${i + 1}: wall=${wallSeconds}s vs pinned ${expectedWall}s`,
      ).toBeLessThan(tolerance);
      expect(
        Math.abs(oldCredited - expectedOld),
        `rest ${i + 1}: OLD mechanism credited=${oldCredited}s vs pinned ${expectedOld}s`,
      ).toBeLessThan(tolerance);
      // THE FIX'S OWN JUSTIFICATION: the new mechanism's credit is close to
      // the wall clock, not close to the old (broken) one — Rest Time
      // counts down in real time regardless of the flywheel.
      expect(
        Math.abs(newCredited - wallSeconds),
        `rest ${i + 1}: NEW mechanism credited=${newCredited}s vs wall=${wallSeconds}s`,
      ).toBeLessThan(tolerance);
      expect(newCredited).toBeGreaterThan(oldCredited);
    });
  });

  it("session-wide: 491.1 s wall against 419.76 s the OLD mechanism credited, across the whole capture", () => {
    // The FIRST frame past `armed` (the first stroke), not literally
    // `samples[0]`: the capture's own pre-roll (the machine sitting at
    // WAITTOBEGIN before the rower's first pull) is not part of the
    // SESSION's own wall time by any measure a rower would recognise, and
    // is not what the spec's own 491.1 s measures.
    const startIndex = samples.findIndex((s) => s.frame.state !== "armed");
    expect(startIndex).toBeGreaterThan(-1);
    const first = samples[startIndex]!;
    // The capture's own `finished` frame, not literally the last EMITTED
    // sample: the driver keeps delivering frames through whatever
    // post-terminate/re-arm housekeeping the machine does after a workout
    // genuinely ends (`MonitorRun`'s own doc comment on the run contract).
    const finishedIndex = samples.findIndex(
      (s) => s.frame.state === "finished",
    );
    expect(finishedIndex).toBeGreaterThan(-1);
    const last = samples[finishedIndex]!;
    const wallSeconds = (last.tMs - first.tMs) / 1000;
    const oldCredited =
      last.frame.sessionElapsedSeconds - first.frame.sessionElapsedSeconds;
    expect(Math.abs(wallSeconds - 491.1)).toBeLessThan(2);
    expect(Math.abs(oldCredited - 419.76)).toBeLessThan(2);
  });
});

describe("EST LEFT (Phase LL) — monotonicity across a whole real capture (design spec §3, exit criterion 2)", () => {
  // THE TEST THAT MATTERS (task brief's own words). The first design of
  // this fix went backwards five times over this exact capture — worst
  // -428.5 s at the capture's own `finished` frame, from laundering a
  // `null` `intervalIndex` to `0` — and nobody caught it by reasoning; it
  // took replaying frame by frame. This test is that replay, asserted
  // directly against `SurfaceModel.elapsedSeconds` (never a parsed display
  // string — `T - elapsedSeconds` is `totalLeftSeconds`, so a monotonic
  // `elapsedSeconds` IS a monotonic (never-rising) EST LEFT, the same
  // identity `buildSurfaceModel`'s own comment states).
  it("never lets elapsedSeconds fall across the ENTIRE capture, including the finished frame", async () => {
    const samples = await replaySession2();
    // Bug-independent first: the capture must actually reach `finished` —
    // otherwise this test would pass by never exercising the one frame
    // that broke the first draft.
    expect(samples.some((s) => s.frame.state === "finished")).toBe(true);

    let previousElapsedSeconds: number | undefined;
    let prev = -Infinity;
    for (const s of samples) {
      const m = buildSurfaceModel({
        phases: SESSION_2_PHASES,
        program: SESSION_2_PROGRAM,
        status: "live",
        linkLost: false,
        frame: s.frame,
        deviceName: SESSION_2_DEVICE,
        actuals: [],
        previousElapsedSeconds,
        freeRow: false,
      });
      expect(
        m.elapsedSeconds,
        `elapsedSeconds fell at t=${s.tMs}ms, state=${s.frame.state}: ${m.elapsedSeconds} < ${prev}`,
      ).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = m.elapsedSeconds;
      previousElapsedSeconds = m.elapsedSeconds;
    }
  });

  // THE CRITICAL GAP A REVIEW FOUND (exit criterion 1, spec §6's named
  // hazard): monotonicity alone does not prove the estimate COUNTS DOWN
  // through a rest — it is equally satisfied by a step function that
  // credits the whole rest instantly the moment it starts and then sits
  // FLAT (never falling, technically "monotonic") for the rest of the
  // span. That inverse bug is exactly as wrong as the one this task
  // fixes, just in the other direction: a rower would watch EST LEFT
  // drop 3:00 at the first resting frame, then freeze. No fixture in
  // this repo set `restSeconds` to anything but 0 until this test — every
  // other test either reads `frame.restSeconds` directly off raw samples
  // (the "wire premise" describe block above) or asserts monotonicity
  // ALONE, neither of which can tell a real countdown from a step. This
  // one asserts the RATE: consecutive frames within a single rest must
  // advance `elapsedSeconds` by roughly the same amount as the wall clock
  // between them, real 0x0032 `restSeconds` values from the replayed
  // capture doing the crediting.
  it("estElapsed advances ~1s per 1s of wall time THROUGH each rest — not a step function at rest entry (the inverse bug)", async () => {
    const samples = await replaySession2();
    const spans = restingSpans(samples);
    // Bug-independent first: three real rests, matching design spec §5's
    // own table — if this is wrong, the fixture is wrong, not the formula.
    expect(spans).toHaveLength(3);

    // One continuous walk across the WHOLE capture (not just the resting
    // spans in isolation) — `previousElapsedSeconds` has to be threaded
    // exactly the way `ConnectedSurface.tsx` does in production, and the
    // rate check below only means something measured against a properly
    // clamped sequence, not one seeded fresh at zero per span.
    let previousElapsedSeconds: number | undefined;
    const elapsedAt = new Map<DriverFrameSample, number>();
    for (const s of samples) {
      const m = buildSurfaceModel({
        phases: SESSION_2_PHASES,
        program: SESSION_2_PROGRAM,
        status: "live",
        linkLost: false,
        frame: s.frame,
        deviceName: SESSION_2_DEVICE,
        actuals: [],
        previousElapsedSeconds,
        freeRow: false,
      });
      elapsedAt.set(s, m.elapsedSeconds);
      previousElapsedSeconds = m.elapsedSeconds;
    }

    let spansChecked = 0;
    for (const span of spans) {
      expect(span.length).toBeGreaterThan(3);
      const first = span[0]!;
      const mid = span[Math.floor(span.length / 2)]!;
      const last = span[span.length - 1]!;

      // FIRST-TO-MID and MID-TO-LAST, not just first-to-last: the
      // inverse-bug mutant (crediting the whole rest instantly the
      // moment `state` becomes "resting", then holding flat) makes THIS
      // span's own FIRST frame already carry the full credit — so a
      // first-to-last check alone could still read as "advanced ~30s
      // over the whole rest" by accident of where the span boundary
      // falls. Splitting the span in two and requiring BOTH halves to
      // advance at roughly the wall-clock rate is what actually
      // distinguishes "counts down continuously" from "jumps once,
      // anywhere in the span, then sits flat" — the flat half is what
      // the assertion below catches wherever the jump landed.
      for (const [a, b] of [
        [first, mid],
        [mid, last],
      ] as const) {
        const wallSeconds = (b.tMs - a.tMs) / 1000;
        const elapsedDelta = elapsedAt.get(b)! - elapsedAt.get(a)!;
        // The message must be an INLINE template literal, not a variable
        // reference — `@vitest/eslint-plugin`'s `valid-expect` rule only
        // recognises `expect(x, "...")`/`` expect(x, `...`) `` as its own
        // AST shape; a message stored in a local and passed by reference
        // reads as a disallowed third positional argument instead.
        expect(
          Math.abs(elapsedDelta - wallSeconds),
          `rest span half at t=${a.tMs}..${b.tMs}ms: elapsed advanced ${elapsedDelta.toFixed(2)}s while ${wallSeconds.toFixed(2)}s of wall time passed`,
        ).toBeLessThan(Math.max(1.5, wallSeconds * 0.3));
      }
      spansChecked++;
    }
    expect(spansChecked).toBe(3);
  });
});

// ============================================================================
// EST LEFT (Phase LL) — THE ACCEPTED LIMIT ON DISTANCE WORK, MEASURED.
//
// Found at PR #144's PM gate, and this block is the measurement the gate
// asked for rather than the inference it arrived as. `estElapsed` banks each
// COMPLETED phase's PROGRAMMED length; the progress bar's notches come from
// `intervalBoundaries(phases, measuredWorkSeconds(actuals))` — MEASURED, and
// that module says so outright. On TIME work the two agree, because the PM5
// ends the interval at its programmed length. On DISTANCE work they diverge
// by exactly the rower's deviation from target pace, and the monotonic clamp
// (which must stay — spec §3) turns that divergence into a VISIBLE HOLD: the
// estimate and the bar stand still at the handover until the rest has run
// off the banked deficit.
//
// THE VEHICLE is `walk-2026-08-18-metrics`'s pyramid — the repo's only
// committed distance-interval, rest-bearing capture, and the walk README's
// own owed follow-up ("wire this capture into the replay suite so the state-9
// path is pinned by test, not by photo"). The rower ran it well off target
// (2:11.7 against a 1:58.5 middle interval, both photographed in the same
// frame), which is precisely the condition the limit needs.
//
// WHY THE LIMIT IS ACCEPTED RATHER THAN FIXED HERE. The obvious repair —
// bank the MEASURED work seconds for completed phases, where an actual
// exists — was replayed against this same capture and does NOT remove the
// hold: the PM5 emits an interval's 0x0037/0x0038 boundary record at the END
// of its rest, not at the start (measured on this capture: interval 1's
// actual arrives at t=473.2 s, the first frame of interval 3's work), so the
// actual for the interval that just finished does not yet exist during its
// own rest. The holds come out identical under both banking rules. Anything
// that would remove them changes what the number MEANS and belongs in a spec
// with an antagonist pass, not in a fix round — ROADMAP carries it as a
// triggered follow-on with these numbers attached.
// ============================================================================

/** The pyramid's own program, hand-transcribed from the capture's OWN CSAFE
 *  programming writes — the same provenance rule `SESSION_2_PROGRAM` follows.
 *  The three `06 04 00 00 xx xx` target-pace values in the `ce060021` tx
 *  frames decode (0.01 s/lsb) to 122.50 / 118.50 / 126.50 s per 500 m, the
 *  three `03 05 80 00 00 xx xx` distances to 300 / 700 / 300 m, and the
 *  `04 02 00 3c` rest values to 60 s on the first two intervals and 0 on the
 *  last — which is the README's own `w 300m 6k @22 r1 · w 700m 6k-4 @24 r1 ·
 *  w 300m 6k+4 @22`, and its photographed `1:58.5` middle target. */
const PYRAMID_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "distance",
      value: 300,
      targetSplit: 122.5,
      displaySpm: 22,
      restSeconds: 60,
    },
    {
      type: "work",
      kind: "distance",
      value: 700,
      targetSplit: 118.5,
      displaySpm: 24,
      restSeconds: 60,
    },
    {
      type: "work",
      kind: "distance",
      value: 300,
      targetSplit: 126.5,
      displaySpm: 22,
      restSeconds: 0,
    },
  ],
};

/** `EnginePhase[]` mirroring `PYRAMID_PROGRAM` one-for-one, rest phases
 *  interleaved only where `restSeconds > 0` — same shape and same reasoning
 *  as `SESSION_2_PHASES` above. */
const PYRAMID_PHASES: EnginePhase[] = [
  {
    type: "work",
    meters: 300,
    targetKind: "split",
    targetSplit: 122.5,
    label: "2:02.5",
    originalIndex: 0,
  },
  { type: "rest", seconds: 60, label: "Rest", originalIndex: 0 },
  {
    type: "work",
    meters: 700,
    targetKind: "split",
    targetSplit: 118.5,
    label: "1:58.5",
    originalIndex: 1,
  },
  { type: "rest", seconds: 60, label: "Rest", originalIndex: 1 },
  {
    type: "work",
    meters: 300,
    targetKind: "split",
    targetSplit: 126.5,
    label: "2:06.5",
    originalIndex: 2,
  },
];

const PYRAMID_PATH = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/workout\/connected\/surfaceModel\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-18-metrics/pyramid-pm5-recording-1787090555458.jsonl.gz",
  );

/** Same harness as `replaySession2`, on the gzipped capture (decompressing
 *  at test time rather than committing a second, uncompressed duplicate —
 *  `session/summaryModel.test.ts`'s own precedent for this same file), and
 *  additionally collecting the ACTUALS the driver files at each boundary, so
 *  a test can see WHEN each one became available. */
async function replayPyramid(): Promise<
  { tMs: number; frame: MonitorFrame; actuals: IntervalActual[] }[]
> {
  const text = gunzipSync(readFileSync(PYRAMID_PATH)).toString("utf8");
  const parsed = parseRecording(text);
  const replay = createReplayTransport(parsed);
  const [dev] = await replay.transport.scan();
  await replay.transport.connect(dev.id);
  const log = createEventLog();
  const driver = createPm5Driver(replay.transport, log, {
    deviceName: dev.name,
    now: () => replay.clock.now(),
    schedule: (cb, ms) => replay.clock.schedule(cb, ms),
  });
  const samples: {
    tMs: number;
    frame: MonitorFrame;
    actuals: IntervalActual[];
  }[] = [];
  const actuals: IntervalActual[] = [];
  driver.events((e) => {
    if (e.kind === "intervalComplete" && e.actual.index !== null) {
      actuals.push(e.actual);
    }
    if (e.kind === "frame") {
      samples.push({
        tMs: replay.clock.now(),
        frame: e.frame,
        actuals: [...actuals],
      });
    }
  });
  const programPending = driver.program(PYRAMID_PROGRAM);
  await replay.run();
  await programPending;
  return samples;
}

/** How long the estimate STANDS STILL at each work->rest handover, in wall
 *  seconds: from the last `rowing` frame before the machine goes `resting`,
 *  until `SurfaceModel.elapsedSeconds` next increases. Threads
 *  `previousElapsedSeconds` exactly the way `ConnectedSurface.tsx` does, so
 *  the clamp is live — the hold is the clamp doing its job, not a bug in it.
 */
function handoverHolds(
  samples: { tMs: number; frame: MonitorFrame }[],
  phases: EnginePhase[],
  program: WorkoutProgram,
): number[] {
  let previousElapsedSeconds: number | undefined;
  const walk = samples.map((s) => {
    const m = buildSurfaceModel({
      phases,
      program,
      status: "live",
      linkLost: false,
      frame: s.frame,
      deviceName: DEVICE,
      actuals: [],
      previousElapsedSeconds,
      freeRow: false,
    });
    previousElapsedSeconds = m.elapsedSeconds;
    return { tMs: s.tMs, est: m.elapsedSeconds, state: s.frame.state };
  });
  const holds: number[] = [];
  for (let i = 1; i < walk.length; i += 1) {
    if (walk[i]!.state !== "resting" || walk[i - 1]!.state !== "rowing") {
      continue;
    }
    const from = walk[i - 1]!;
    let j = i;
    while (j < walk.length && walk[j]!.est <= from.est + 1e-9) j += 1;
    holds.push((walk[Math.min(j, walk.length - 1)]!.tMs - from.tMs) / 1000);
  }
  return holds;
}

describe("EST LEFT (Phase LL) — the DISTANCE-work limit, measured on a replay (PR #144 PM gate)", () => {
  let samples: Awaited<ReturnType<typeof replayPyramid>>;

  beforeAll(async () => {
    samples = await replayPyramid();
  }, 30_000);

  it("sanity: the capture is the distance-interval, rest-bearing session this block claims", () => {
    // Bug-independent first, this file's own convention: if these fail the
    // fixture is wrong, not the formula.
    expect(samples.length).toBeGreaterThan(1000);
    expect(samples.some((s) => s.frame.state === "resting")).toBe(true);
    expect(samples.some((s) => s.frame.state === "finished")).toBe(true);
    expect(PYRAMID_PROGRAM.intervals.every((i) => i.kind === "distance")).toBe(
      true,
    );
  });

  it("THE CAUSE: the machine's own measured work exceeds the programmed pricing, because the rower was slower than target", () => {
    const final = samples[samples.length - 1]!.actuals;
    // Two of the three intervals file an actual inside the capture (the
    // third arrives in the finish grace and is the summary's business, not
    // this pane's) — asserted so a harness change that lost them fails here.
    expect(final.length).toBeGreaterThanOrEqual(2);
    const measured = [final[0]!.elapsedSeconds, final[1]!.elapsedSeconds];
    // Decoded independently from the capture's own 0x0037 records (78.2 s
    // for 300 m, 184.4 s for 700 m) — the same numbers
    // `session/summaryModel.test.ts` pins from those bytes.
    expect(measured[0]).toBeCloseTo(78.2, 1);
    expect(measured[1]).toBeCloseTo(184.4, 1);
    // What `estElapsed` banks for those same two phases instead.
    const programmed = [
      phaseSeconds(PYRAMID_PHASES[0]!)!,
      phaseSeconds(PYRAMID_PHASES[2]!)!,
    ];
    expect(programmed[0]).toBeCloseTo(73.5, 1);
    expect(programmed[1]).toBeCloseTo(165.9, 1);
    // The deficit each handover has to run off before the estimate can move
    // again: 4.7 s and 18.5 s.
    expect(measured[0]! - programmed[0]!).toBeCloseTo(4.7, 1);
    expect(measured[1]! - programmed[1]!).toBeCloseTo(18.5, 1);
  });

  it("THE CONSEQUENCE, ACCEPTED: EST LEFT stands still for 6.6 s and 20.8 s at the two handovers", () => {
    const holds = handoverHolds(samples, PYRAMID_PHASES, PYRAMID_PROGRAM);
    expect(holds).toHaveLength(2);
    // Pinned, not bounded, because this IS the accepted limit's own number —
    // `docs/design/DEVIATIONS.md` cites these two figures, and a change to
    // the banking rule must come here and change them deliberately rather
    // than slide under a loose bound.
    expect(Math.abs(holds[0]! - 6.57)).toBeLessThan(1);
    expect(Math.abs(holds[1]! - 20.79)).toBeLessThan(1);
    // AND THE HOLD IS THE DEFICIT, not something else that happens to be
    // slow: each hold is at least the interval's own measured-minus-
    // programmed deviation, and within a few frames of it. This is what ties
    // the visible symptom to the mechanism the DEVIATIONS row names.
    const final = samples[samples.length - 1]!.actuals;
    const deficits = [
      final[0]!.elapsedSeconds - phaseSeconds(PYRAMID_PHASES[0]!)!,
      final[1]!.elapsedSeconds - phaseSeconds(PYRAMID_PHASES[2]!)!,
    ];
    holds.forEach((hold, i) => {
      expect(
        hold,
        `handover ${i + 1}: held ${hold.toFixed(2)}s against a ${deficits[i]!.toFixed(2)}s banked deficit`,
      ).toBeGreaterThanOrEqual(deficits[i]!);
      expect(hold - deficits[i]!).toBeLessThan(3);
    });
  });

  it("TIME work does not do this: the same detector finds no comparable hold on the time-interval capture", async () => {
    // The claim the limit is SCOPED by — "on TIME work they agree, because
    // the PM5 ends the interval itself". Same detector, same threading, the
    // capture the rest of this file already replays.
    const holds = handoverHolds(
      await replaySession2(),
      SESSION_2_PHASES,
      SESSION_2_PROGRAM,
    );
    expect(holds).toHaveLength(3);
    for (const hold of holds) {
      // One frame gap (~0.5 s cadence, worst case a couple of ticks) — an
      // order of magnitude below the distance case's 6.6 s and 20.8 s.
      expect(hold).toBeLessThan(3);
    }
  });

  it("monotonicity holds on a DISTANCE capture too (exit criterion 2, extended)", () => {
    let previousElapsedSeconds: number | undefined;
    let prev = -Infinity;
    for (const s of samples) {
      const m = buildSurfaceModel({
        phases: PYRAMID_PHASES,
        program: PYRAMID_PROGRAM,
        status: "live",
        linkLost: false,
        frame: s.frame,
        deviceName: DEVICE,
        actuals: s.actuals,
        previousElapsedSeconds,
        freeRow: false,
      });
      expect(
        m.elapsedSeconds,
        `elapsedSeconds fell at t=${s.tMs}ms, state=${s.frame.state}: ${m.elapsedSeconds} < ${prev}`,
      ).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = m.elapsedSeconds;
      previousElapsedSeconds = m.elapsedSeconds;
    }
  });
});

/**
 * PHASE JR PR 2, TASK 4 — the free-row model.
 *
 * Gate 0's own change list, and nothing else: `JUST ROW` where a programmed
 * row reads `2 OF 5 · WORK`; `Free` in both target slots; no UP NEXT; ink
 * heroes, never a judged colour. A free row's phases and program are both
 * empty, so the TARGETS null out on their own — the branches under test are
 * the ones that would otherwise render a DASH or a phase word where the
 * board says `Free` and `JUST ROW`.
 */
describe("the free-row model", () => {
  function freeRowModel(over: Partial<SurfaceModelInput> = {}) {
    return buildSurfaceModel({
      phases: [],
      program: { intervals: [] },
      status: "live",
      linkLost: false,
      frame: frame({ intervalIndex: null, splitAvgPace: 141 }),
      deviceName: DEVICE,
      actuals: [],
      freeRow: true,
      ...over,
    });
  }

  it("labels the row JUST ROW, not a phase word", () => {
    const m = freeRowModel();
    expect(m.intervalLabelShort).toBe("JUST ROW");
  });

  it("fills both target slots with Free, present rather than absent", () => {
    const m = freeRowModel();
    // `absent: false` matters as much as the word: the absent flag is what
    // paints a slot in the dimmed no-reading treatment, and `Free` is a
    // statement, not a missing value.
    expect(m.targetSplit).toStrictEqual({
      main: "Free",
      sub: null,
      absent: false,
    });
    expect(m.targetRate).toStrictEqual({ main: "Free", absent: false });
  });

  it("offers no UP NEXT and no remaining estimate — there is no next and no goal", () => {
    const m = freeRowModel();
    expect(m.upNext).toBe("");
    expect(m.hasRemainingEstimate).toBe(false);
  });

  it("judges nothing: both heroes read plain ink", () => {
    const m = freeRowModel();
    // `"within"` IS plain ink in this file's vocabulary (`judgedValue` with
    // a null target always lands there; `timer-card-actual-within` paints
    // no colour) — with no target, nothing can be faster or slower than
    // anything, and `"stale"` is the one member that could still override
    // it, so the link-up case is what this pins.
    expect(m.pace.judgement).toBe("within");
    expect(m.rate.judgement).toBe("within");
  });

  it("carries the flag through, so the panes can branch without re-deriving it", () => {
    expect(freeRowModel().freeRow).toBe(true);
    expect(
      buildSurfaceModel({
        phases: FIXTURE.phases,
        program: FIXTURE.program,
        status: "live",
        linkLost: false,
        frame: frame(),
        deviceName: DEVICE,
        actuals: [],
        freeRow: false,
      }).freeRow,
    ).toBe(false);
  });
});
