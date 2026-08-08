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

function frame(overrides: Partial<MonitorFrame> = {}): MonitorFrame {
  return {
    elapsedSeconds: 600,
    distanceMeters: 2400,
    currentSplit: 120,
    spm: 22,
    heartRateBpm: 164,
    intervalIndex: 1,
    intervalRemaining: { kind: "distance", value: 1200 },
    state: "rowing",
    ...overrides,
  };
}

function model(over: Partial<SurfaceModelInput> = {}) {
  return buildSurfaceModel({
    phases: FIXTURE.phases,
    program: FIXTURE.program,
    phase: "live",
    frame: frame(),
    deviceName: DEVICE,
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
