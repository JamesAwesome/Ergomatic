import { describe, it, expect } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { buildDraft, withNudge, type SessionDraft } from "./draft";
import { phases } from "../../domain/expand.js";
import { bigNumberSeconds } from "./Timer";
import {
  buildRun,
  buildFreeRowRun,
  remainingSeconds,
  elapsedSeconds,
  tick,
  pause,
  resume,
  advance,
  rewind,
  nextDistance,
  isComplete,
  totalRemainingSeconds,
} from "./engine";
import type { SessionRun } from "./run";

// Realistic fixtures, per repo convention (draft.test.ts's own pattern):
// - Filling Low (AT): 4x2000m @ 6k+4 with 3' rest — the reps-expanded,
//   auto-rest, DISTANCE fixture. Its 2000m work step is also the exact
//   shape the brief's own hand-pinned example describes. (The
//   2026-08-10 library-rebalance retuned this from 3 reps to 4 to reach
//   its new 45-60 band; every phase count/sum below that depended on the
//   old 3-rep shape moved with it.)
// - Calm Sea (O2): 10,000m @ 6k+12 — a single, non-repeated distance work
//   step, for the second hand-pinned nextDistance case.
//   (Meltemi used to hold this role; the library rewrite turned it into a
//   5-phase TIME workout with no distance step at all, so this suite
//   re-anchored to Calm Sea — same 10,000 m distance, matching draft.test.ts.)
// - Diamond Dust (O2): 10'/10'/10' rate-change (spm 22/24/26, all at 6k+10) —
//   three SEQUENTIAL time work phases with no reps and no
//   auto-rest, ideal for the catch-up walk (each phase's boundary is
//   unambiguous). (Moderate Breeze used to hold this role; the rewrite
//   turned it into a reps x8 workout — 17 phases instead of 4 — which broke
//   every test here that pinned "index 3/4 is the last phase," so this
//   suite re-anchored to Diamond Dust, the new library's equivalent shape.
//   The 2026-08-10 library-rebalance retuned each piece from 8' to 10' to
//   reach its new 30-45 band; the phase COUNT stayed 3, only the seconds.)
// - Fork Lightning (AN): the effort-ref fixture (ref: {effort: "max"}).
//
// 2026-08-09 (the warmup setting) stripped `wu` from the `Step` union and
// from the seeded library; Phase WU then deleted `buildRun`'s own `warmup`
// parameter and the `type: "warmup"` phase it prepended. Every phase count
// and total below is therefore simply what the workout's steps expand to —
// there is no longer any argument that could add a phase in front of them,
// and the suite that used to own that ON case is gone with the parameter.
function library(title: string) {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  return w;
}

function draftInputFor(title: string, id: string) {
  const w = library(title);
  return { id, title: w.title, type: w.type as WorkoutType, steps: w.steps };
}

const baselines: Baselines = { k2Seconds: 100, k6Seconds: 120 };
const t0 = new Date("2026-08-01T12:00:00.000Z");

function addSeconds(d: Date, s: number): Date {
  return new Date(d.getTime() + s * 1000);
}

function fillingLowRun(now = t0): SessionRun {
  const d = buildDraft(draftInputFor("Filling Low", `fl-${Math.random()}`));
  return buildRun(d, baselines, now);
}

function calmSeaRun(now = t0): SessionRun {
  const d = buildDraft(draftInputFor("Calm Sea", `cs-${Math.random()}`));
  return buildRun(d, baselines, now);
}

function diamondDustRun(now = t0): SessionRun {
  const d = buildDraft(draftInputFor("Diamond Dust", `dd-${Math.random()}`));
  return buildRun(d, baselines, now);
}

// Hoarfrost (O2): 2x[12' work @ 6k+12 + 5' rest] -> FOUR sequential time
// phases (720/300/720/300). Diamond Dust held the catch-up walk's
// "three finished phases, landing in the fourth" case while it was a
// four-phase workout (its own 6' warm-up plus three 8' pieces); the
// warm-up left with 2026-08-09's `wu` removal, so the walk re-anchors to a
// real workout that still has four time phases of its own.
function hoarfrostRun(now = t0): SessionRun {
  const d = buildDraft(draftInputFor("Hoarfrost", `hf-${Math.random()}`));
  return buildRun(d, baselines, now);
}

describe("buildRun", () => {
  it("freezes phases from the draft's effective steps, attributing originalIndex across a reps-expanded distance workout with auto-inserted rest (Filling Low)", () => {
    const run = fillingLowRun();
    // Filling Low: reps(0), w(1){2000m @ 6k+4, restMinutes 3} x4 —
    // 4 * (work + rest) = 8 phases. Phase WU removed the `some(p => p.type
    // === "warmup")` assertion that used to sit under this length check:
    // `Phase["type"]` has no "warmup" member left, so the comparison no
    // longer compiles and the compiler now enforces what it asserted.
    expect(run.phases).toHaveLength(8);
    expect(run.phases[0]).toMatchObject({
      type: "work",
      meters: 2000,
      targetKind: "split",
      targetSplit: 124, // 120 (k6Seconds) + 4 (off)
      spm: 22,
      set: { index: 1, of: 4 },
      originalIndex: 1, // the ORIGINAL draft index of the "w" step
    });
    expect(run.phases[1]).toMatchObject({
      type: "rest",
      seconds: 180,
      set: { index: 1, of: 4 },
      originalIndex: 1, // shares its work phase's originalIndex
    });
    // Every one of the 4 reps' work/rest pair carries the same originalIndex
    // (they all came from the ONE authored "w" step at index 1).
    for (let i = 0; i < 8; i++) {
      expect(run.phases[i]!.originalIndex).toBe(1);
    }
    expect(run.phases[7]).toMatchObject({
      type: "rest",
      set: { index: 4, of: 4 },
    });
    expect(run.v).toBe(1);
    expect(run.index).toBe(0);
    expect(run.pausedAt).toBeNull();
    expect(run.pausedTotalMs).toBe(0);
    expect(run.actuals).toStrictEqual({});
    expect(run.completedAt).toBeNull();
    expect(run.startedAt).toBe(t0.toISOString());
    expect(run.phaseStartedAt).toBe(t0.toISOString());
  });

  // F3a (whole-branch review): workoutId/title are stamped straight from
  // the draft — proven against a real id/title pair, not a null/empty one,
  // so a stray `?? null`/`?? ""` fallback couldn't pass this by accident.
  it("stamps workoutId and title straight from the draft (F3a)", () => {
    const d = buildDraft(draftInputFor("Filling Low", "fl-titled"));
    const run = buildRun(d, baselines, t0);
    expect(run.workoutId).toBe("fl-titled");
    expect(run.title).toBe("Filling Low");
  });

  it("is byte-stable across two calls with identical inputs", () => {
    const d = buildDraft(draftInputFor("Filling Low", "fl-stable"));
    const a = buildRun(d, baselines, t0);
    const b = buildRun(d, baselines, new Date(t0.getTime()));
    expect(a).toStrictEqual(b);
  });

  it("folds spmOverrides and nudges into the frozen targets, matching what Confirm displayed (Calm Sea)", () => {
    const d = buildDraft(draftInputFor("Calm Sea", "cs-nudged"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const nudged: SessionDraft = {
      ...withNudge(d, workIndex, -5),
      spmOverrides: { [workIndex]: 99 },
    };
    const run = buildRun(nudged, baselines, t0);
    const work = run.phases.find((p) => p.type === "work")!;
    expect(work.targetSplit).toBe(127); // 132 unnudged -> 127 after -5
    expect(work.spm).toBe(99);
    expect(work.originalIndex).toBe(workIndex);
  });

  it("carries an effort phase's label and targetKind through unchanged (Fork Lightning: ALL OUT)", () => {
    const d = buildDraft(draftInputFor("Fork Lightning", "fk-1"));
    const run = buildRun(d, baselines, t0);
    const work = run.phases.find((p) => p.type === "work")!;
    expect(work.label).toBe("ALL OUT");
    expect(work.targetKind).toBe("effort");
    expect(work.spm).toBe(32);
  });

  it("handles an open-ended 'test' step (no seconds, no meters) — hand-built since no library workout authors one", () => {
    const d: SessionDraft = {
      v: 1,
      workoutId: null,
      title: "2k test day",
      type: "TR",
      steps: [{ k: "test", label: "2k Test" }],
      nudges: {},
      spmOverrides: {},
      removed: [],
      createdAt: t0.toISOString(),
      startedAt: null,
    };
    const run = buildRun(d, baselines, t0);
    expect(run.phases).toHaveLength(1);
    expect(run.phases[0]).toMatchObject({
      type: "test",
      label: "All out",
      originalIndex: 0,
    });
    expect(run.phases[0]!.seconds).toBeUndefined();
    expect(run.phases[0]!.meters).toBeUndefined();
  });

  it("does not shift originalIndex when a hand-edited draft carries restMinutes: 0 (Phase 6B Task 1 review, F1)", () => {
    // restMinutes: 0 is unreachable via validateSteps but SessionDraft's own
    // load-time validation is loose by design (draft.ts's isSessionDraft
    // comment) — a stale/hand-edited draft can still carry it. domain's
    // phases() treats it as falsy (no auto-inserted rest phase), and
    // buildRun's originalIndex lookup must agree — not reserve a slot for a
    // rest phase that was never emitted, which would silently misattribute
    // every phase after it.
    const d: SessionDraft = {
      v: 1,
      workoutId: null,
      title: "hand-edited",
      type: "TR",
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 2 },
          ref: { base: "6k", off: 0 },
          restMinutes: 0,
        },
        { k: "r", minutes: 3 },
      ],
      nudges: {},
      spmOverrides: {},
      removed: [],
      createdAt: t0.toISOString(),
      startedAt: null,
    };
    const run = buildRun(d, baselines, t0);
    expect(run.phases.map((p) => p.type)).toStrictEqual(["work", "rest"]);
    expect(run.phases[0]!.originalIndex).toBe(0); // the work step
    expect(run.phases[1]!.originalIndex).toBe(1); // the authored "r" step — NOT shifted
  });
});

// Phase WU deleted `buildRun`'s `warmup` parameter and the `warmupPhases`
// producer behind it, so the suite that lived here — nine cases pinning the
// prepended phase's shape, order, pricing and `originalIndex: -1` sentinel —
// went with the code it tested. The one thing left after that — a
// TYPE-level assertion about the `WarmupSetting` preference shape itself —
// went with Task 3's removal of the type.

// Just Row without the monitor (spec 2026-09-02, §Mechanism piece 1): a
// free-row timer run is ONE `SessionRun` whose `mode` is `"justrow"`,
// `workoutId` is `null`, and whose single phase is an open-ended `test`.
// Built directly — no synthetic `SessionDraft` (its `type: WorkoutType` is
// required and a free row has none).
describe("buildFreeRowRun", () => {
  const started = new Date("2026-09-02T07:15:00.000Z");

  it("builds a justrow run: mode 'justrow', workoutId null, title 'Just Row', one open-ended test phase labelled 'Just Row', clocks seeded at now", () => {
    const run = buildFreeRowRun(started);
    expect(run).toStrictEqual({
      v: 1,
      mode: "justrow",
      workoutId: null,
      title: "Just Row",
      phases: [
        { type: "test", label: "Just Row", set: undefined, originalIndex: 0 },
      ],
      index: 0,
      phaseStartedAt: "2026-09-02T07:15:00.000Z",
      pausedAt: null,
      pausedTotalMs: 0,
      actuals: {},
      startedAt: "2026-09-02T07:15:00.000Z",
      completedAt: null,
    });
    expect(run.phases[0]!.seconds).toBeUndefined();
    expect(run.phases[0]!.meters).toBeUndefined();
  });

  it("its phase is the domain's own test phase (the mechanical reference: a one-step test workout's), differing only in the label", () => {
    // `phases()` freezes EVERY `test` step's label as "All out" regardless
    // of the authored text (domain/expand.ts, `case "test"`); the free row
    // names itself instead, and everything else is byte-identical.
    const reference = phases([{ k: "test", label: "Just Row" }], null)[0]!;
    const { originalStepIndex, ...rest } = reference;
    expect(originalStepIndex).toBe(0);
    expect(rest.label).toBe("All out");
    expect(buildFreeRowRun(started).phases[0]).toStrictEqual({
      ...rest,
      label: "Just Row",
      originalIndex: 0,
    });
  });

  it("counts UP: the big number 12.34 s after start is the floored elapsed 12, never a countdown", () => {
    const run = buildFreeRowRun(started);
    const later = new Date(started.getTime() + 12_340);
    expect(bigNumberSeconds(run, run.phases[0]!, later)).toBe(12);
    expect(elapsedSeconds(run, later)).toBe(12);
    expect(remainingSeconds(run, later)).toBe(0);
    expect(totalRemainingSeconds(run, later)).toBe(0);
  });

  it("is byte-stable across two calls with the same instant, and tick never auto-advances it (an open-ended phase has no boundary)", () => {
    const a = buildFreeRowRun(started);
    expect(a).toStrictEqual(buildFreeRowRun(started));
    expect(tick(a, new Date(started.getTime() + 3_600_000))).toBe(a);
  });
});

describe("remainingSeconds", () => {
  it("returns the full phase duration at the instant a phase starts", () => {
    expect(remainingSeconds(diamondDustRun(), t0)).toBe(600);
  });

  it("decreases by elapsed time within the phase", () => {
    expect(remainingSeconds(diamondDustRun(), addSeconds(t0, 120))).toBe(
      480, // 600 (the first 10' work phase) - 120
    );
  });

  it("floors at 0 rather than going negative", () => {
    expect(remainingSeconds(diamondDustRun(), addSeconds(t0, 601))).toBe(0);
  });

  it("is 0 on a distance phase — nothing to count down from", () => {
    const run = fillingLowRun(); // index 0: the first 2000m work phase
    expect(remainingSeconds(run, addSeconds(t0, 50))).toBe(0);
  });

  it("is 0 past the last phase", () => {
    const run = { ...diamondDustRun(), index: 3 };
    expect(remainingSeconds(run, t0)).toBe(0);
  });
});

describe("elapsedSeconds", () => {
  it("counts up from phaseStartedAt on a distance phase", () => {
    const run = fillingLowRun(); // index 0: a 2000m work phase
    expect(elapsedSeconds(run, addSeconds(t0, 452))).toBe(452);
  });

  it("excludes prior pausedTotalMs", () => {
    const run: SessionRun = {
      ...fillingLowRun(),
      pausedTotalMs: 60_000,
    };
    expect(elapsedSeconds(run, addSeconds(t0, 452))).toBe(392);
  });
});

describe("tick — the catch-up walk", () => {
  it("is a no-op mid-phase (resilience 1: reload lands on the same phase, correct remaining)", () => {
    const run = diamondDustRun();
    const now = addSeconds(t0, 120);
    const result = tick(run, now);
    expect(result).toBe(run); // same reference: nothing needed to advance
    expect(remainingSeconds(result, now)).toBe(480); // 600 - 120
  });

  it("does not advance while paused, even long past the phase boundary", () => {
    const paused = pause(diamondDustRun(), addSeconds(t0, 50));
    const result = tick(paused, addSeconds(t0, 10_000));
    expect(result).toBe(paused);
  });

  it("walks forward across exactly 3 finished time phases (resilience 3), landing partway into the 4th with phaseStartedAt seeded at the newest boundary, not now", () => {
    const run = hoarfrostRun();
    // work 720s + rest 300s + work 720s = 1740s boundary; +100s into the
    // fourth phase (the closing 5' rest).
    const now = addSeconds(t0, 720 + 300 + 720 + 100);
    const result = tick(run, now);
    expect(result.index).toBe(3);
    expect(result.phaseStartedAt).toBe(addSeconds(t0, 1740).toISOString());
    expect(result.phaseStartedAt).not.toBe(now.toISOString()); // NOT now
    expect(result.pausedTotalMs).toBe(0);
    expect(result.pausedAt).toBeNull();
    expect(result.completedAt).toBeNull();
    expect(remainingSeconds(result, now)).toBe(200); // 300 - 100
  });

  it("completing the last time phase during a walk sets completedAt to the TRUE finish boundary, not the (much later) wake-up time", () => {
    // Phase 6B Task 1 review, F2: workout actually finishes at t0+1800s
    // (12:30-ish); the phone doesn't wake to recompute until an hour
    // later. completedAt must log the finish boundary, not the wake time —
    // a version that stamps `now` here would silently misreport when the
    // session actually ended.
    const run = diamondDustRun();
    const finishBoundary = addSeconds(t0, 600 + 600 + 600); // 1800s
    const wakesUpMuchLater = addSeconds(finishBoundary, 3600); // +1h suspend
    const result = tick(run, wakesUpMuchLater);
    expect(result.index).toBe(run.phases.length);
    expect(result.completedAt).toBe(finishBoundary.toISOString());
    expect(result.phaseStartedAt).toBe(finishBoundary.toISOString());
    expect(result.completedAt).not.toBe(wakesUpMuchLater.toISOString());
  });

  it("halts at a distance phase reached mid-walk, seeding its stopwatch baseline at the walk's arrival boundary (resilience 3, Filling Low rest -> 2000m)", () => {
    // Starts on Filling Low's first 3' REST phase (index 1) — the walk
    // needs a TIME phase to consume before it can arrive at a distance
    // one, and since `wu` left the Step union this workout's own rest rows
    // are the only time phases it has.
    const run = { ...fillingLowRun(), index: 1 };
    const now = addSeconds(t0, 180 + 50); // 50s into the next distance phase
    const result = tick(run, now);
    expect(result.index).toBe(2);
    expect(result.phases[2]!.meters).toBe(2000);
    expect(result.phaseStartedAt).toBe(addSeconds(t0, 180).toISOString());
    expect(elapsedSeconds(result, now)).toBe(50);
  });

  it("does not walk at all when the current phase is already a distance phase", () => {
    const run = fillingLowRun(); // index 0 is already the 2000m work phase
    const result = tick(run, addSeconds(t0, 10_000));
    expect(result).toBe(run);
  });

  it("is a no-op once already complete", () => {
    const run: SessionRun = {
      ...diamondDustRun(),
      completedAt: t0.toISOString(),
    };
    expect(tick(run, addSeconds(t0, 10_000))).toBe(run);
  });
});

describe("pause / resume", () => {
  it("freezes elapsed time regardless of how long the pause lasts", () => {
    const paused = pause(diamondDustRun(), addSeconds(t0, 50));
    expect(elapsedSeconds(paused, addSeconds(t0, 50))).toBe(50);
    expect(elapsedSeconds(paused, addSeconds(t0, 99_999))).toBe(50);
  });

  it("also freezes a distance phase's stopwatch", () => {
    const run = fillingLowRun(); // index 0: a 2000m distance phase
    const paused = pause(run, addSeconds(t0, 50));
    expect(elapsedSeconds(paused, addSeconds(t0, 5_000))).toBe(50);
  });

  it("is idempotent: pausing an already-paused run doesn't move pausedAt", () => {
    const first = pause(diamondDustRun(), addSeconds(t0, 50));
    const second = pause(first, addSeconds(t0, 999));
    expect(second).toBe(first);
  });

  it("resume folds the pause duration into pausedTotalMs and unfreezes elapsed", () => {
    const paused = pause(diamondDustRun(), addSeconds(t0, 50));
    const resumed = resume(paused, addSeconds(t0, 80));
    expect(resumed.pausedAt).toBeNull();
    expect(resumed.pausedTotalMs).toBe(30_000);
    expect(elapsedSeconds(resumed, addSeconds(t0, 80))).toBe(50);
  });

  it("resume is a no-op on a run that isn't paused", () => {
    const run = diamondDustRun();
    expect(resume(run, addSeconds(t0, 10))).toBe(run);
  });
});

describe("resilience — reload and pause accounting across reloads", () => {
  // "Reload" for the pure engine means: serialize the run (JSON, exactly
  // what run.ts persists) and recompute from the deserialized copy at a
  // fresh `now` — there is no accumulated-tick state to lose, which is the
  // whole point of the wall-clock design. This is also resilience case 6
  // (kill + reopen): the app has nothing beyond this same persisted record
  // to reconstruct from either.
  function reload(run: SessionRun): SessionRun {
    return JSON.parse(JSON.stringify(run)) as SessionRun;
  }

  it("resilience 1 / 6: reload mid-phase restores the same phase and correct remaining", () => {
    const run = diamondDustRun();
    const now = addSeconds(t0, 120);
    const before = remainingSeconds(run, now);
    const after = remainingSeconds(reload(run), now);
    expect(before).toBe(480); // 600 - 120
    expect(after).toBe(480);
  });

  it("resilience 2: reload while paused keeps the same remaining time", () => {
    const paused = pause(diamondDustRun(), addSeconds(t0, 50));
    const now = addSeconds(t0, 99_999);
    expect(remainingSeconds(paused, now)).toBe(550); // 600 - 50
    expect(remainingSeconds(reload(paused), now)).toBe(550);
    expect(reload(paused).pausedAt).toBe(paused.pausedAt);
  });

  it("pause -> reload -> resume yields remaining identical to never reloading (hand-computed: 600 - 50 = 550)", () => {
    const run = diamondDustRun();
    const paused = pause(run, addSeconds(t0, 50));
    const resumeAt = addSeconds(t0, 9_000); // a long gap while "closed"

    const neverReloaded = resume(paused, resumeAt);
    const reloadedThenResumed = resume(reload(paused), resumeAt);

    const expected = 550; // hand-computed: 600s phase, paused after 50s
    expect(remainingSeconds(neverReloaded, resumeAt)).toBe(expected);
    expect(remainingSeconds(reloadedThenResumed, resumeAt)).toBe(expected);
  });
});

describe("advance / rewind", () => {
  it("skips to the next phase, re-seeding its clock at now and clearing pause state", () => {
    const paused = pause(diamondDustRun(), addSeconds(t0, 10));
    const now = addSeconds(t0, 500);
    const result = advance(paused, now);
    expect(result.index).toBe(1);
    expect(result.phaseStartedAt).toBe(now.toISOString());
    expect(result.pausedAt).toBeNull();
    expect(result.pausedTotalMs).toBe(0);
  });

  it("past the last phase completes the run", () => {
    const run = { ...diamondDustRun(), index: 2 }; // the last phase (0-indexed, 3 total)
    const now = addSeconds(t0, 1000);
    const result = advance(run, now);
    expect(result.index).toBe(run.phases.length);
    expect(result.completedAt).toBe(now.toISOString());
  });

  it("advance is a no-op once already complete", () => {
    const run: SessionRun = {
      ...diamondDustRun(),
      completedAt: t0.toISOString(),
    };
    expect(advance(run, addSeconds(t0, 10))).toBe(run);
  });

  it("steps back to the previous phase, re-seeding its clock", () => {
    const run = { ...diamondDustRun(), index: 2 };
    const now = addSeconds(t0, 500);
    const result = rewind(run, now);
    expect(result.index).toBe(1);
    expect(result.phaseStartedAt).toBe(now.toISOString());
  });

  it("clamps at phase 0 rather than going negative, but still restarts its clock", () => {
    const run = diamondDustRun();
    const now = addSeconds(t0, 500);
    const result = rewind(run, now);
    expect(result.index).toBe(0);
    expect(result.phaseStartedAt).toBe(now.toISOString());
  });

  it("rewind is a no-op once already complete", () => {
    const run: SessionRun = {
      ...diamondDustRun(),
      completedAt: t0.toISOString(),
    };
    expect(rewind(run, addSeconds(t0, 10))).toBe(run);
  });
});

describe("nextDistance", () => {
  it("records the actual average split on NEXT — hand-pinned: 452s / 2000m x 500 = 113.0 exactly (Filling Low)", () => {
    const run = fillingLowRun(); // index 0: the first 2000m work phase
    const now = addSeconds(t0, 452);
    const result = nextDistance(run, now);
    expect(result.actuals[0]).toStrictEqual({
      elapsedSeconds: 452,
      splitSeconds: 113,
      actualSource: "stopwatch",
    });
    expect(result.index).toBe(1); // advanced into the rest phase
    expect(result.phaseStartedAt).toBe(now.toISOString());
    expect(result.pausedTotalMs).toBe(0);
  });

  it("records a non-integer average split — hand-pinned: 4567s / 10000m x 500 = 228.35 (Calm Sea)", () => {
    const run = calmSeaRun(); // index 0: the 10,000m work phase
    const now = addSeconds(t0, 4567);
    const result = nextDistance(run, now);
    expect(result.actuals[0]).toStrictEqual({
      actualSource: "stopwatch",
      elapsedSeconds: 4567,
      splitSeconds: 228.35,
    });
  });

  it("is a no-op on a non-distance (time) phase", () => {
    const run = diamondDustRun(); // index 0: a 10' work phase, time-based
    const result = nextDistance(run, addSeconds(t0, 50));
    expect(result).toBe(run);
  });

  it("implicitly resumes a paused run — NEXT is a deliberate act (Phase 6B Task 1 review, F4, documented decision)", () => {
    const run = fillingLowRun(); // index 0: the first 2000m work phase
    const paused = pause(run, addSeconds(t0, 100));
    const result = nextDistance(paused, addSeconds(t0, 452));
    expect(result.pausedAt).toBeNull();
    expect(result.pausedTotalMs).toBe(0);
  });
});

describe("isComplete", () => {
  it("is false before the last phase", () => {
    expect(isComplete(diamondDustRun())).toBe(false);
  });

  it("is true once index reaches phases.length", () => {
    const run = { ...diamondDustRun(), index: 2 };
    const completed = advance(run, addSeconds(t0, 10));
    expect(isComplete(completed)).toBe(true);
  });
});

describe("totalRemainingSeconds", () => {
  it("sums remaining time-phase seconds across the current and all upcoming phases (Diamond Dust)", () => {
    const run = diamondDustRun();
    const now = addSeconds(t0, 50); // 50s into the first 600s work phase
    // 550 (remaining in phase 0) + 600 + 600 = 1750
    expect(totalRemainingSeconds(run, now)).toBe(1750);
  });

  it("prices upcoming distance phases via meters/target-split — the same per-phase arithmetic estimateMinutes uses (Filling Low)", () => {
    const run = fillingLowRun();
    // 4 * ((2000/500 * 124) + 180) = 4*676 = 2704
    expect(totalRemainingSeconds(run, t0)).toBe(2704);
  });

  it("gives partial credit for the CURRENT distance phase, subtracting its own elapsed (Filling Low)", () => {
    const run = fillingLowRun(); // index 0: the first 2000m work phase
    const now = addSeconds(t0, 200);
    // current: (2000/500*124) - 200 = 496 - 200 = 296
    // remaining phases 1..7: 4*180 + 3*496 = 720 + 1488 = 2208
    expect(totalRemainingSeconds(run, now)).toBe(2504);
  });

  it("an open-ended 'test' phase contributes nothing to the estimate", () => {
    const d: SessionDraft = {
      v: 1,
      workoutId: null,
      title: "2k test day",
      type: "TR",
      // A 1' work step ahead of the open-ended one, so "contributes
      // nothing" is measured against a real, priced phase rather than
      // against an empty total. (This used to be a `wu 1'` step, back when
      // a workout could carry one.)
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { base: "6k", off: 0 },
        },
        { k: "test", label: "2k Test" },
      ],
      nudges: {},
      spmOverrides: {},
      removed: [],
      createdAt: t0.toISOString(),
      startedAt: null,
    };
    const run = buildRun(d, baselines, t0);
    // Only the 60s work phase counts; the open-ended test phase adds
    // nothing.
    expect(totalRemainingSeconds(run, t0)).toBe(60);
  });

  it("is 0 past the last phase", () => {
    const run = { ...diamondDustRun(), index: 4 };
    expect(totalRemainingSeconds(run, t0)).toBe(0);
  });
});
