// The connected surface's model, tested against a REAL seeded library
// workout compiled through the real assembly (`buildDraft` -> `buildRun` ->
// `compileProgram`) — the repo's realistic-fixture rule. "Filling Low" is
// the same fixture `ConnectedInterstitial.test.tsx` uses: an 8:00 warm-up
// then 3 × 2000 m with 3:00 rest between, which gives this file everything
// it needs in one shape — a warm-up phase with no target, work phases with
// a real resolved split and a pace ref, folded rest phases (so the
// interval->phase walk has something real to walk), and a DISTANCE
// interval (so `METERS LEFT` is exercised against a genuine program rather
// than a synthetic one).

import { describe, expect, it } from "vitest";
import { compileProgram } from "../../../domain/monitor/program.js";
import { PACE_TOLERANCE_SECONDS } from "../../../domain/judge.js";
import type { MonitorFrame } from "../../../domain/monitor/types.js";
import type { Baselines, WorkoutType } from "../../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index";
import { buildDraft } from "../../session/draft";
import { buildRun, type EnginePhase } from "../../session/engine";
import {
  buildSurfaceModel,
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
  return { phases, program };
}

const FIXTURE = libraryFixture("Filling Low");

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
  it("Filling Low compiles to a warm-up plus three distance intervals", () => {
    expect(FIXTURE.program.intervals).toHaveLength(4);
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
  // `"over"`/`"under"` are OVER/UNDER THE EFFORT ASKED, not the number: a
  // smaller split is a faster boat (`domain/judge.ts`'s direction rule).
  it("tints under/within/over off the real tolerance, not a guess", () => {
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
    expect(slower.judgement).toBe("under");
    expect(faster.judgement).toBe("over");
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

  it("stale beats a value that would otherwise judge over", () => {
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
    expect(m.intervalLabel).toBe("INTERVAL 2 OF 4 · WORK");
    expect(m.intervalLabelShort).toBe("2 OF 4 · WORK");
  });

  it("says ROWING in ink, and RESTING when the machine is resting", () => {
    expect(model().statusWord).toBe("ROWING");
    expect(model({ frame: frame({ state: "resting" }) }).statusWord).toBe(
      "RESTING",
    );
  });

  it("keeps the device's own advertised name, with no promise attached", () => {
    expect(model().deviceCaption).toBe(DEVICE);
    expect(model().linked).toBe(true);
  });

  it("judges the split against the phase's own resolved target", () => {
    const target = firstWorkPhase().targetSplit!;
    // Ten seconds per 500 m FASTER than asked is over the effort, ochre.
    expect(
      model({ frame: frame({ currentSplit: target - 10 }) }).pace.judgement,
    ).toBe("over");
    expect(
      model({ frame: frame({ currentSplit: target + 10 }) }).pace.judgement,
    ).toBe("under");
    expect(
      model({ frame: frame({ currentSplit: target }) }).pace.judgement,
    ).toBe("within");
  });

  it("judges the rate against the phase's own spm (Filling Low authors @22)", () => {
    const spm = firstWorkPhase().spm!;
    expect(spm).toBe(22);
    expect(model({ frame: frame({ spm: spm + 10 }) }).rate.judgement).toBe(
      "over",
    );
    expect(model({ frame: frame({ spm: spm - 10 }) }).rate.judgement).toBe(
      "under",
    );
    expect(model().rateCaption).toBe(`TARGET ${spm}`);
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

  // Pinned directly, not only through the screen fixture (task-6 review, L3):
  // inverting the fill died in the HTML snapshot alone, which is a real kill
  // with an unreadable error message.
  it("fills the interval bar by what is BEHIND the rower, in the interval's own dimension", () => {
    const meters = FIXTURE.phases[1]!.meters!;
    expect(meters).toBe(2000);
    expect(
      model({
        frame: frame({
          intervalRemaining: { kind: "distance", value: meters * 0.75 },
        }),
      }).intervalProgressPct,
    ).toBe(25);
    expect(
      model({
        frame: frame({
          intervalRemaining: { kind: "distance", value: 0 },
        }),
      }).intervalProgressPct,
    ).toBe(100);
    // A time interval counts TIME, against the phase's own seconds.
    const warmupSeconds = FIXTURE.phases[0]!.seconds!;
    expect(
      model({
        frame: frame({
          intervalIndex: 0,
          intervalRemaining: { kind: "time", value: warmupSeconds / 4 },
        }),
      }).intervalProgressPct,
    ).toBe(75);
  });

  it("never reports negative or past-100 progress, whatever the machine says", () => {
    expect(
      model({
        frame: frame({
          intervalRemaining: { kind: "distance", value: 99_999 },
        }),
      }).intervalProgressPct,
    ).toBe(0);
    expect(
      model({
        frame: frame({
          intervalRemaining: { kind: "distance", value: -500 },
        }),
      }).intervalProgressPct,
    ).toBe(100);
  });

  it("prices TOTAL LEFT off the workout's own phases, not the machine's guess", () => {
    const m = model({ frame: frame({ elapsedSeconds: 600 }) });
    expect(m.totalSeconds).toBeGreaterThan(0);
    expect(m.totalLeftSeconds).toBe(m.totalSeconds - 600);
  });

  it("never reports a negative total left when the machine overruns", () => {
    const m = model({ frame: frame({ elapsedSeconds: 999_999 }) });
    expect(m.totalLeftSeconds).toBe(0);
  });

  it("carries the same segments and UP NEXT for whichever pane asks", () => {
    const m = model({ frame: frame({ intervalIndex: 1 }) });
    expect(m.segments.total).toBe(FIXTURE.phases.length);
    expect(m.segments.current).toBe(
      phaseIndexForInterval(FIXTURE.phases, 1, false),
    );
    expect(m.upNext).not.toBe("");
  });
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
    // clock it used to read had just returned to 0.
    expect(lefts).toStrictEqual([total - 37.81, total - 37.81, total - 39.01]);
    expect(lefts[1]).toBeLessThan(total);
  });

  it("the METERS card shows the accumulated total, not the reset interval's 1 m", () => {
    const displays = ACROSS_THE_RESET.map(
      (f) => model({ frame: f }).meters.display,
    );

    // 102.5 is deliberately a half-way value: `Math.round` gives 103 where a
    // floor would give 102, so this pins the rounding as well as the source.
    expect(displays).toStrictEqual(["102", "103", "105"]);
    // What the bug looked like on the erg: the raw field would have rendered
    // `Math.round(0.7)` here and the card fell 109 -> 50 for real.
    expect(displays[1]).not.toBe("1");
    expect(model({ frame: ACROSS_THE_RESET[1]! }).metersCaption).toBe("TOTAL");
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
  it("reads `—` and says so, without ever losing the card", () => {
    const m = model({ frame: frame({ heartRateBpm: null }) });
    expect(m.hr.display).toBe("—");
    expect(m.hrAbsent).toBe(true);
    expect(m.hrCaption).toBe("NO HR MONITOR");
  });

  it("becomes a number with no announcement when a belt appears", () => {
    const m = model({ frame: frame({ heartRateBpm: 151 }) });
    expect(m.hr.display).toBe("151");
    expect(m.hrAbsent).toBe(false);
    expect(m.hrCaption).toBe("BPM");
  });
});

describe("a zero split is not a reading (7B iteration: the pre-pull ochre 0:00.0)", () => {
  it("live with currentSplit 0 renders the dash, unjudged — never 0:00.0 painted against the target", () => {
    // Hardware walk 2: before the first pull the PM reports Current Pace
    // 0, and the hero judged it as FASTER than target (0 < anything) —
    // ochre at a rower who had not taken a stroke.
    const m = model({ phase: "live", frame: frame({ currentSplit: 0 }) });
    expect(m.pace.display).toBe("—");
    expect(m.pace.absent).toBe(true);
    expect(m.pace.judgement).not.toBe("over");
  });

  it("a real split still judges exactly as before", () => {
    const m = model({ phase: "live", frame: frame({ currentSplit: 117 }) });
    expect(m.pace.absent).toBe(false);
    expect(m.pace.display).not.toBe("—");
  });
});

describe("paused", () => {
  it("has no current pace: NOW goes to `—` with NOT ROWING", () => {
    const m = model({ phase: "paused", frame: frame({ currentSplit: 117 }) });
    expect(m.pace.display).toBe("—");
    expect(m.pace.absent).toBe(true);
    expect(m.paceCaption).toBe("NOT ROWING");
    expect(m.statusWord).toBe("PAUSED");
  });

  it("is NOT stale: the erg is still talking, so nothing greys as unvouched", () => {
    const m = model({ phase: "paused" });
    expect(m.stale).toBe(false);
    expect(m.linked).toBe(true);
    expect(m.nowLabel).toBe("NOW · /500M");
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
    expect(m.nowLabel).toBe("LAST · /500M");
    expect(m.linked).toBe(false);
  });

  it("promises nothing: the caption reads LOST, never TRYING", () => {
    const m = model({ phase: "disconnected" });
    expect(m.deviceCaption).toBe(`${DEVICE} · LOST`);
    expect(m.deviceCaption).not.toContain("TRYING");
  });
});

describe("degenerate inputs", () => {
  it("renders before the machine has sent a single frame", () => {
    const m = model({ frame: null });
    expect(m.pace.display).toBe("—");
    expect(m.intervalClockValue).toBe("—");
    expect(m.intervalProgressPct).toBe(0);
    expect(m.intervalLabel).toBe("INTERVAL 1 OF 4 · WARM-UP");
  });

  it("clamps an interval index the machine ran past the program", () => {
    const m = model({ frame: frame({ intervalIndex: 99 }) });
    expect(m.intervalLabel).toBe("INTERVAL 4 OF 4 · WORK");
  });

  it("treats a null interval index as the first, never as a crash", () => {
    const m = model({ frame: frame({ intervalIndex: null }) });
    expect(m.intervalLabel).toBe("INTERVAL 1 OF 4 · WARM-UP");
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
    expect(m.targetSplit.main).toBe("—");
    expect(m.targetSplitCaption).toBe("NO SPLIT TARGET");
    expect(m.intervalLabel).toBe("INTERVAL 2 OF 4 · WORK");
  });

  it("says so when a phase carries no split target of its own", () => {
    const m = model({ frame: frame({ intervalIndex: 0 }) });
    expect(FIXTURE.phases[0]!.type).toBe("warmup");
    expect(m.paceCaption).toBe("NO PACE TARGET");
    expect(m.targetSplitCaption).toBe("NO SPLIT TARGET");
  });
});
