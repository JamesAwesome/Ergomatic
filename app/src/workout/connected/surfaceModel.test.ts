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
import { PACE_TOLERANCE_SECONDS } from "../../../domain/judge.js";
import type {
  IntervalActual,
  MonitorFrame,
} from "../../../domain/monitor/types.js";
import type { Baselines, WorkoutType } from "../../../domain/types.js";
import type { WarmupSetting } from "../../api/usePreferences";
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index";
import { buildDraft } from "../../session/draft";
import { buildRun, type EnginePhase } from "../../session/engine";
import {
  buildSurfaceModel,
  intervalNumbering,
  judgedValue,
  phaseIndexForInterval,
  splitHero,
  staleFor,
  surfaceStatusFor,
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
    phase: "live",
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

describe("staleFor / surfaceStatusFor", () => {
  it("only a lost link makes a reading stale — a paused erg is still talking", () => {
    expect(staleFor("disconnected")).toBe(true);
    expect(staleFor("paused")).toBe(false);
    expect(staleFor("live")).toBe(false);
    expect(staleFor("ended")).toBe(false);
  });

  it("narrows only the four phases the surface draws", () => {
    expect(surfaceStatusFor("live")).toBe("live");
    expect(surfaceStatusFor("paused")).toBe("paused");
    expect(surfaceStatusFor("disconnected")).toBe("disconnected");
    expect(surfaceStatusFor("ended")).toBe("ended");
    expect(surfaceStatusFor("ready")).toBeNull();
    expect(surfaceStatusFor("pairing")).toBeNull();
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

  it("labels the second slot METERS LEFT on a distance interval", () => {
    const m = model({
      frame: frame({ intervalRemaining: { kind: "distance", value: 1200 } }),
    });
    expect(m.intervalClockLabel).toBe("METERS LEFT");
    expect(m.intervalClockValue).toBe("1200");
  });

  it("counts time down on a time interval", () => {
    const m = model({
      frame: frame({
        intervalIndex: 0,
        intervalRemaining: { kind: "time", value: 41 },
      }),
    });
    expect(m.intervalClockLabel).toBe("LEFT IN INTERVAL");
    expect(m.intervalClockValue).toBe("0:41");
  });

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
    const m = model({ frame: frame({ elapsedSeconds: 600 }) });
    expect(m.totalSeconds).toBe(3216);
    expect(m.totalLeftSeconds).toBe(3216 - 600);
  });

  it("never reports a negative total left when the machine overruns", () => {
    const m = model({ frame: frame({ elapsedSeconds: 999_999 }) });
    expect(m.totalLeftSeconds).toBe(0);
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

  it("TOTAL LEFT never rises across the reset (the recorded 1:11 -> 1:38 bug)", () => {
    const lefts = ACROSS_THE_RESET.map(
      (f) => model({ frame: f }).totalLeftSeconds,
    );
    const total = model({ frame: ACROSS_THE_RESET[0]! }).totalSeconds;

    // Exact, not merely monotone: the middle frame is the one the recording
    // caught jumping BACKWARDS to a nearly-full countdown, because the raw
    // clock it used to read had just returned to 0. `total` is pinned to
    // its own known value first, so these three are measured against a
    // number rather than against another field of the same call — and the
    // `lefts[1] < total` trailer that used to sit here is gone: it could
    // not fail once the line above passed (test-integrity sweep, S0g).
    expect(total).toBe(3216);
    expect(lefts).toStrictEqual([total - 37.81, total - 37.81, total - 39.01]);
  });

  it("the METERS card shows the accumulated total, not the reset interval's 1 m", () => {
    const displays = ACROSS_THE_RESET.map(
      (f) => model({ frame: f }).meters.display,
    );

    // 102.5 is deliberately a half-way value: `Math.round` gives 103 where a
    // floor would give 102, so this pins the rounding as well as the source.
    // What the bug looked like on the erg: the raw field would have
    // rendered `Math.round(0.7)` as `"1"` in the middle slot and the card
    // fell 109 -> 50 for real. The exact triple below already forbids that;
    // the separate `not.toBe("1")` trailer that used to follow it could not
    // fail once this line passed (test-integrity sweep, S0g).
    expect(displays).toStrictEqual(["102", "103", "105"]);
  });

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
});

describe("no HR monitor", () => {
  // `hrAbsent`/`hrCaption` retired alongside `JudgedCard.tsx`
  // (connected-revamp Task 3): both were convenience fields for a card
  // caption ("NO HR MONITOR"/"BPM") that no longer renders anywhere —
  // revision §3 is explicit that the metric row's HR cell gets "no dashed
  // card, no explanatory copy". `hr.absent` (on the `JudgedValue` itself)
  // is the field that survives and still drives the pane's own
  // `connected-value-absent` grey.
  it("reads `—` when no monitor is connected", () => {
    const m = model({ frame: frame({ heartRateBpm: null }) });
    expect(m.hr.display).toBe("—");
    expect(m.hr.absent).toBe(true);
  });

  it("becomes a number with no announcement when a belt appears", () => {
    const m = model({ frame: frame({ heartRateBpm: 151 }) });
    expect(m.hr.display).toBe("151");
    expect(m.hr.absent).toBe(false);
  });
});

describe("a zero split is not a reading (7B iteration: the pre-pull tinted 0:00.0)", () => {
  it("live with currentSplit 0 renders the dash, unjudged — never 0:00.0 painted against the target", () => {
    // Hardware walk 2: before the first pull the PM reports Current Pace
    // 0, and the hero judged it as FASTER than target (0 < anything) — a
    // verdict colour at a rower who had not taken a stroke. (The walk saw
    // it in ochre; that state is blue since the 2026-08-13 repaint. The
    // colour is not what the test is about.)
    const m = model({ phase: "live", frame: frame({ currentSplit: 0 }) });
    expect(m.pace.display).toBe("—");
    expect(m.pace.absent).toBe(true);
    expect(m.pace.judgement).not.toBe("faster");
  });

  it("a real split still judges exactly as before", () => {
    const m = model({ phase: "live", frame: frame({ currentSplit: 117 }) });
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
    const m = model({ phase: "paused", frame: frame({ currentSplit: 117 }) });
    expect(m.pace.display).toBe("—");
    expect(m.pace.absent).toBe(true);
  });

  it("is NOT stale: the erg is still talking, so nothing greys as unvouched", () => {
    const m = model({ phase: "paused" });
    expect(m.stale).toBe(false);
    expect(m.linked).toBe(true);
    expect(m.nowLabel).toBe("NOW");
  });

  it("holds the interval clock's last value rather than blanking it", () => {
    const m = model({
      phase: "paused",
      frame: frame({ intervalRemaining: { kind: "time", value: 41 } }),
    });
    expect(m.intervalClockValue).toBe("0:41");
  });
});

describe("disconnected: lose and degrade (spec C5)", () => {
  it("greys EVERY actual, whatever it would otherwise have judged", () => {
    const target = firstWorkPhase().targetSplit!;
    const m = model({
      phase: "disconnected",
      frame: frame({ currentSplit: target - 30, spm: 40 }),
    });
    expect(m.stale).toBe(true);
    expect(m.pace.judgement).toBe("stale");
    expect(m.rate.judgement).toBe("stale");
    expect(m.meters.judgement).toBe("stale");
    expect(m.hr.judgement).toBe("stale");
  });

  it("relabels NOW as LAST and hollows the indicator", () => {
    const m = model({ phase: "disconnected" });
    expect(m.nowLabel).toBe("LAST");
    expect(m.linked).toBe(false);
  });

  it("promises nothing: the caption reads LOST, never TRYING", () => {
    // The exact caption forbids "TRYING" on its own; the extra
    // `not.toContain("TRYING")` trailer that used to follow could not fail
    // once this line passed (test-integrity sweep, S0g).
    const m = model({ phase: "disconnected" });
    expect(m.deviceCaption).toBe(`${DEVICE} · LOST`);
  });
});

describe("degenerate inputs", () => {
  it("renders before the machine has sent a single frame", () => {
    const m = model({ frame: null });
    expect(m.pace.display).toBe("—");
    expect(m.intervalClockValue).toBe("—");
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
    expect(
      model({ deviceName: null, phase: "disconnected" }).deviceCaption,
    ).toBe("PM5 · LOST");
  });

  it("renders an empty phase list without inventing a phase", () => {
    // Unreachable in production (`compileProgram` rejects a program with no
    // work at all, `"no-work"`), so this is the guard's only exercise.
    const m = buildSurfaceModel({
      phases: [],
      program: FIXTURE.program,
      phase: "live",
      frame: frame(),
      deviceName: DEVICE,
      actuals: [],
    });
    // Still the DASH here, and this is the ONLY case that keeps it: with
    // no phase there is no word to show. Everywhere else the slot names the
    // phase (James, 2026-08-12).
    expect(m.targetSplit.main).toBe("—");
    expect(m.targetSplit.absent).toBe(true);
    expect(m.targetSplitCaption).toBe("");
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
      phase: "live",
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
        phase: "live",
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
      phase: "live",
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
      phase: "live",
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
      phase: "live",
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
