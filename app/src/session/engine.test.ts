import { describe, it, expect } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { buildDraft, withNudge, type SessionDraft } from "./draft";
import {
  buildRun,
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
// - Filling Low (AT): wu 8' + 3x2000m @ 6k+4 with 3' rest — the
//   reps-expanded, auto-rest, DISTANCE fixture. Its 2000m work step is also
//   the exact shape the brief's own hand-pinned example describes.
// - Calm Sea (O2): wu 8' + 10,000m @ 6k+12 — a single, non-repeated
//   distance work step, for the second hand-pinned nextDistance case.
//   (Meltemi used to hold this role; the library rewrite turned it into a
//   5-phase TIME workout with no distance step at all, so this suite
//   re-anchored to Calm Sea — same 10,000 m distance, matching draft.test.ts.)
// - Diamond Dust (O2): wu 6' + 8'/8'/8' rate-change (spm 22/24/26, all at
//   6k+10) — three SEQUENTIAL time work phases with no reps and no
//   auto-rest, ideal for the catch-up walk (each phase's boundary is
//   unambiguous). (Moderate Breeze used to hold this role; the rewrite
//   turned it into a reps x8 workout — 17 phases instead of 4 — which broke
//   every test here that pinned "index 3/4 is the last phase," so this
//   suite re-anchored to Diamond Dust, the new library's equivalent shape.)
// - Fork Lightning (AN): the effort-ref fixture (ref: {effort: "max"}).
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
const tol = 3;
const t0 = new Date("2026-08-01T12:00:00.000Z");

function addSeconds(d: Date, s: number): Date {
  return new Date(d.getTime() + s * 1000);
}

function fillingLowRun(now = t0): SessionRun {
  const d = buildDraft(draftInputFor("Filling Low", `fl-${Math.random()}`));
  return buildRun(d, baselines, tol, now);
}

function calmSeaRun(now = t0): SessionRun {
  const d = buildDraft(draftInputFor("Calm Sea", `cs-${Math.random()}`));
  return buildRun(d, baselines, tol, now);
}

function diamondDustRun(now = t0): SessionRun {
  const d = buildDraft(draftInputFor("Diamond Dust", `dd-${Math.random()}`));
  return buildRun(d, baselines, tol, now);
}

describe("buildRun", () => {
  it("freezes phases from the draft's effective steps, attributing originalIndex across a reps-expanded distance workout with auto-inserted rest (Filling Low)", () => {
    const run = fillingLowRun();
    // Filling Low: wu(0), reps(1), w(2){2000m @ 6k+4, restMinutes 3} x3 —
    // 1 warmup + 3 * (work + rest) = 7 phases.
    expect(run.phases).toHaveLength(7);
    expect(run.phases[0]).toMatchObject({
      type: "warmup",
      seconds: 480,
      label: "Easy",
      originalIndex: 0,
    });
    expect(run.phases[1]).toMatchObject({
      type: "work",
      meters: 2000,
      targetKind: "split",
      targetSplit: 124, // 120 (k6Seconds) + 4 (off)
      spm: 23,
      set: { index: 1, of: 3 },
      originalIndex: 2, // the ORIGINAL draft index of the "w" step
    });
    expect(run.phases[2]).toMatchObject({
      type: "rest",
      seconds: 180,
      set: { index: 1, of: 3 },
      originalIndex: 2, // shares its work phase's originalIndex
    });
    // Every one of the 3 reps' work/rest pair carries the same originalIndex
    // (they all came from the ONE authored "w" step at index 2).
    for (let i = 1; i < 7; i++) {
      expect(run.phases[i]!.originalIndex).toBe(2);
    }
    expect(run.phases[6]).toMatchObject({
      type: "rest",
      set: { index: 3, of: 3 },
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
    const run = buildRun(d, baselines, tol, t0);
    expect(run.workoutId).toBe("fl-titled");
    expect(run.title).toBe("Filling Low");
  });

  it("is byte-stable across two calls with identical inputs", () => {
    const d = buildDraft(draftInputFor("Filling Low", "fl-stable"));
    const a = buildRun(d, baselines, tol, t0);
    const b = buildRun(d, baselines, tol, new Date(t0.getTime()));
    expect(a).toStrictEqual(b);
  });

  it("folds spmOverrides and nudges into the frozen targets, matching what Confirm displayed (Calm Sea)", () => {
    const d = buildDraft(draftInputFor("Calm Sea", "cs-nudged"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const nudged: SessionDraft = {
      ...withNudge(d, workIndex, -5),
      spmOverrides: { [workIndex]: 99 },
    };
    const run = buildRun(nudged, baselines, tol, t0);
    const work = run.phases.find((p) => p.type === "work")!;
    expect(work.targetSplit).toBe(127); // 132 unnudged -> 127 after -5
    expect(work.spm).toBe(99);
    expect(work.originalIndex).toBe(workIndex);
  });

  it("carries an effort phase's label and targetKind through unchanged (Fork Lightning: ALL OUT)", () => {
    const d = buildDraft(draftInputFor("Fork Lightning", "fk-1"));
    const run = buildRun(d, baselines, tol, t0);
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
      steps: [
        { k: "wu", minutes: 5 },
        { k: "test", label: "2k Test" },
      ],
      nudges: {},
      spmOverrides: {},
      removed: [],
      createdAt: t0.toISOString(),
      startedAt: null,
    };
    const run = buildRun(d, baselines, tol, t0);
    expect(run.phases).toHaveLength(2);
    expect(run.phases[1]).toMatchObject({
      type: "test",
      label: "All out",
      originalIndex: 1,
    });
    expect(run.phases[1]!.seconds).toBeUndefined();
    expect(run.phases[1]!.meters).toBeUndefined();
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
        { k: "wu", minutes: 5 },
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
    const run = buildRun(d, baselines, tol, t0);
    expect(run.phases.map((p) => p.type)).toStrictEqual([
      "warmup",
      "work",
      "rest",
    ]);
    expect(run.phases[1]!.originalIndex).toBe(1); // the work step
    expect(run.phases[2]!.originalIndex).toBe(2); // the authored "r" step — NOT shifted
  });
});

describe("remainingSeconds", () => {
  it("returns the full phase duration at the instant a phase starts", () => {
    expect(remainingSeconds(diamondDustRun(), t0)).toBe(360);
  });

  it("decreases by elapsed time within the phase", () => {
    expect(remainingSeconds(diamondDustRun(), addSeconds(t0, 120))).toBe(
      240, // 360 (wu) - 120
    );
  });

  it("floors at 0 rather than going negative", () => {
    expect(remainingSeconds(diamondDustRun(), addSeconds(t0, 601))).toBe(0);
  });

  it("is 0 on a distance phase — nothing to count down from", () => {
    const run = { ...fillingLowRun(), index: 1 }; // the first 2000m work phase
    expect(remainingSeconds(run, addSeconds(t0, 50))).toBe(0);
  });

  it("is 0 past the last phase", () => {
    const run = { ...diamondDustRun(), index: 4 };
    expect(remainingSeconds(run, t0)).toBe(0);
  });
});

describe("elapsedSeconds", () => {
  it("counts up from phaseStartedAt on a distance phase", () => {
    const run = { ...fillingLowRun(), index: 1 };
    expect(elapsedSeconds(run, addSeconds(t0, 452))).toBe(452);
  });

  it("excludes prior pausedTotalMs", () => {
    const run: SessionRun = {
      ...fillingLowRun(),
      index: 1,
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
    expect(remainingSeconds(result, now)).toBe(240); // 360 (wu) - 120
  });

  it("does not advance while paused, even long past the phase boundary", () => {
    const paused = pause(diamondDustRun(), addSeconds(t0, 50));
    const result = tick(paused, addSeconds(t0, 10_000));
    expect(result).toBe(paused);
  });

  it("walks forward across exactly 3 finished time phases (resilience 3), landing partway into the 4th with phaseStartedAt seeded at the newest boundary, not now", () => {
    const run = diamondDustRun();
    // wu 360s + work 480s + work 480s = 1320s boundary; +100s into phase 4.
    const now = addSeconds(t0, 360 + 480 + 480 + 100);
    const result = tick(run, now);
    expect(result.index).toBe(3);
    expect(result.phaseStartedAt).toBe(addSeconds(t0, 1320).toISOString());
    expect(result.phaseStartedAt).not.toBe(now.toISOString()); // NOT now
    expect(result.pausedTotalMs).toBe(0);
    expect(result.pausedAt).toBeNull();
    expect(result.completedAt).toBeNull();
    expect(remainingSeconds(result, now)).toBe(380); // 480 - 100
  });

  it("completing the last time phase during a walk sets completedAt to the TRUE finish boundary, not the (much later) wake-up time", () => {
    // Phase 6B Task 1 review, F2: workout actually finishes at t0+1800s
    // (12:30-ish); the phone doesn't wake to recompute until an hour
    // later. completedAt must log the finish boundary, not the wake time —
    // a version that stamps `now` here would silently misreport when the
    // session actually ended.
    const run = diamondDustRun();
    const finishBoundary = addSeconds(t0, 360 + 480 + 480 + 480); // 1800s
    const wakesUpMuchLater = addSeconds(finishBoundary, 3600); // +1h suspend
    const result = tick(run, wakesUpMuchLater);
    expect(result.index).toBe(run.phases.length);
    expect(result.completedAt).toBe(finishBoundary.toISOString());
    expect(result.phaseStartedAt).toBe(finishBoundary.toISOString());
    expect(result.completedAt).not.toBe(wakesUpMuchLater.toISOString());
  });

  it("halts at a distance phase reached mid-walk, seeding its stopwatch baseline at the walk's arrival boundary (resilience 3, Filling Low wu -> 2000m)", () => {
    const run = fillingLowRun(); // index 0: wu 480s, then a 2000m work phase
    const now = addSeconds(t0, 480 + 50); // 50s into the distance phase
    const result = tick(run, now);
    expect(result.index).toBe(1);
    expect(result.phases[1]!.meters).toBe(2000);
    expect(result.phaseStartedAt).toBe(addSeconds(t0, 480).toISOString());
    expect(elapsedSeconds(result, now)).toBe(50);
  });

  it("does not walk at all when the current phase is already a distance phase", () => {
    const run = { ...fillingLowRun(), index: 1 };
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
    const run = { ...fillingLowRun(), index: 1 };
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
    expect(before).toBe(240); // 360 (wu) - 120
    expect(after).toBe(240);
  });

  it("resilience 2: reload while paused keeps the same remaining time", () => {
    const paused = pause(diamondDustRun(), addSeconds(t0, 50));
    const now = addSeconds(t0, 99_999);
    expect(remainingSeconds(paused, now)).toBe(310); // 360 (wu) - 50
    expect(remainingSeconds(reload(paused), now)).toBe(310);
    expect(reload(paused).pausedAt).toBe(paused.pausedAt);
  });

  it("pause -> reload -> resume yields remaining identical to never reloading (hand-computed: 360 - 50 = 310)", () => {
    const run = diamondDustRun();
    const paused = pause(run, addSeconds(t0, 50));
    const resumeAt = addSeconds(t0, 9_000); // a long gap while "closed"

    const neverReloaded = resume(paused, resumeAt);
    const reloadedThenResumed = resume(reload(paused), resumeAt);

    const expected = 310; // hand-computed: 360s phase, paused after 50s
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
    const run = { ...diamondDustRun(), index: 3 }; // the last phase (0-indexed, 4 total)
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
    const run = { ...fillingLowRun(), index: 1 }; // the first 2000m work phase
    const now = addSeconds(t0, 452);
    const result = nextDistance(run, now);
    expect(result.actuals[1]).toStrictEqual({
      elapsedSeconds: 452,
      splitSeconds: 113,
      actualSource: "stopwatch",
    });
    expect(result.index).toBe(2); // advanced into the rest phase
    expect(result.phaseStartedAt).toBe(now.toISOString());
    expect(result.pausedTotalMs).toBe(0);
  });

  it("records a non-integer average split — hand-pinned: 4567s / 10000m x 500 = 228.35 (Calm Sea)", () => {
    const run = { ...calmSeaRun(), index: 1 }; // the 10,000m work phase
    const now = addSeconds(t0, 4567);
    const result = nextDistance(run, now);
    expect(result.actuals[1]!.splitSeconds).toBe(228.35);
    expect(result.actuals[1]!.elapsedSeconds).toBe(4567);
  });

  it("is a no-op on a non-distance (time) phase", () => {
    const run = diamondDustRun(); // index 0: wu, a time phase
    const result = nextDistance(run, addSeconds(t0, 50));
    expect(result).toBe(run);
  });

  it("implicitly resumes a paused run — NEXT is a deliberate act (Phase 6B Task 1 review, F4, documented decision)", () => {
    const run = { ...fillingLowRun(), index: 1 }; // the first 2000m work phase
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
    const run = { ...diamondDustRun(), index: 3 };
    const completed = advance(run, addSeconds(t0, 10));
    expect(isComplete(completed)).toBe(true);
  });
});

describe("totalRemainingSeconds", () => {
  it("sums remaining time-phase seconds across the current and all upcoming phases (Diamond Dust)", () => {
    const run = diamondDustRun();
    const now = addSeconds(t0, 50); // 50s into the 360s warmup
    // 310 (wu remaining) + 480 + 480 + 480 = 1750
    expect(totalRemainingSeconds(run, now)).toBe(1750);
  });

  it("prices upcoming distance phases via meters/target-split — the same per-phase arithmetic estimateMinutes uses (Filling Low)", () => {
    const run = fillingLowRun();
    // wu 480 + 3 * ((2000/500 * 124) + 180) = 480 + 3*676 = 2508
    expect(totalRemainingSeconds(run, t0)).toBe(2508);
  });

  it("gives partial credit for the CURRENT distance phase, subtracting its own elapsed (Filling Low)", () => {
    const run = { ...fillingLowRun(), index: 1 };
    const now = addSeconds(t0, 200);
    // current: (2000/500*124) - 200 = 496 - 200 = 296
    // remaining phases 2..6: 3*180 + 2*496 = 540 + 992 = 1532
    expect(totalRemainingSeconds(run, now)).toBe(1828);
  });

  it("an open-ended 'test' phase contributes nothing to the estimate", () => {
    const d: SessionDraft = {
      v: 1,
      workoutId: null,
      title: "2k test day",
      type: "TR",
      steps: [
        { k: "wu", minutes: 1 },
        { k: "test", label: "2k Test" },
      ],
      nudges: {},
      spmOverrides: {},
      removed: [],
      createdAt: t0.toISOString(),
      startedAt: null,
    };
    const run = buildRun(d, baselines, tol, t0);
    // Only the 60s warmup counts; the open-ended test phase adds nothing.
    expect(totalRemainingSeconds(run, t0)).toBe(60);
  });

  it("is 0 past the last phase", () => {
    const run = { ...diamondDustRun(), index: 4 };
    expect(totalRemainingSeconds(run, t0)).toBe(0);
  });
});
