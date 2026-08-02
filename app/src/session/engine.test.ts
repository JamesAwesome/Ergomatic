import { describe, it, expect } from "vitest";
import { STARTER_WORKOUTS } from "../../server/seed/starter";
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
// - Cold Front (AT): wu 5' + 4x2000m @ 6k+1 with 5' rest — the reps-expanded,
//   auto-rest, DISTANCE fixture. Its 2000m work step is also the exact shape
//   the brief's own hand-pinned example describes.
// - Jet Stream (O2): wu 5' + 10,000m @ 6k+8 — a single, non-repeated
//   distance work step, for the second hand-pinned nextDistance case.
// - Mackerel Sky (O2): wu 5' + 15'/15'/15' negative-split — three SEQUENTIAL
//   time work phases with no reps and no auto-rest, ideal for the catch-up
//   walk (each phase's boundary is unambiguous).
// - Microburst (AN): the effort-ref fixture (ref: {effort: "max"}).
function starter(title: string) {
  const w = STARTER_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing starter fixture: ${title}`);
  return w;
}

function draftInputFor(title: string, id: string) {
  const w = starter(title);
  return { id, title: w.title, type: w.type as WorkoutType, steps: w.steps };
}

const baselines: Baselines = { k2Seconds: 100, k6Seconds: 120 };
const tol = 3;
const t0 = new Date("2026-08-01T12:00:00.000Z");

function addSeconds(d: Date, s: number): Date {
  return new Date(d.getTime() + s * 1000);
}

function coldFrontRun(now = t0): SessionRun {
  const d = buildDraft(draftInputFor("Cold Front", `cf-${Math.random()}`));
  return buildRun(d, baselines, tol, now);
}

function jetStreamRun(now = t0): SessionRun {
  const d = buildDraft(draftInputFor("Jet Stream", `js-${Math.random()}`));
  return buildRun(d, baselines, tol, now);
}

function mackerelRun(now = t0): SessionRun {
  const d = buildDraft(draftInputFor("Mackerel Sky", `ms-${Math.random()}`));
  return buildRun(d, baselines, tol, now);
}

describe("buildRun", () => {
  it("freezes phases from the draft's effective steps, attributing originalIndex across a reps-expanded distance workout with auto-inserted rest (Cold Front)", () => {
    const run = coldFrontRun();
    // Cold Front: wu(0), reps(1), w(2){2000m @ 6k+1, restMinutes 5} x4 —
    // 1 warmup + 4 * (work + rest) = 9 phases.
    expect(run.phases).toHaveLength(9);
    expect(run.phases[0]).toMatchObject({
      type: "warmup",
      seconds: 300,
      label: "Easy",
      originalIndex: 0,
    });
    expect(run.phases[1]).toMatchObject({
      type: "work",
      meters: 2000,
      targetKind: "split",
      targetSplit: 121, // 120 (k6Seconds) + 1 (off)
      spm: 25,
      set: { index: 1, of: 4 },
      originalIndex: 2, // the ORIGINAL draft index of the "w" step
    });
    expect(run.phases[2]).toMatchObject({
      type: "rest",
      seconds: 300,
      set: { index: 1, of: 4 },
      originalIndex: 2, // shares its work phase's originalIndex
    });
    // Every one of the 4 reps' work/rest pair carries the same originalIndex
    // (they all came from the ONE authored "w" step at index 2).
    for (let i = 1; i < 9; i++) {
      expect(run.phases[i]!.originalIndex).toBe(2);
    }
    expect(run.phases[8]).toMatchObject({
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

  it("is byte-stable across two calls with identical inputs", () => {
    const d = buildDraft(draftInputFor("Cold Front", "cf-stable"));
    const a = buildRun(d, baselines, tol, t0);
    const b = buildRun(d, baselines, tol, new Date(t0.getTime()));
    expect(a).toStrictEqual(b);
  });

  it("folds spmOverrides and nudges into the frozen targets, matching what Confirm displayed (Jet Stream)", () => {
    const d = buildDraft(draftInputFor("Jet Stream", "js-nudged"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const nudged: SessionDraft = {
      ...withNudge(d, workIndex, -5),
      spmOverrides: { [workIndex]: 99 },
    };
    const run = buildRun(nudged, baselines, tol, t0);
    const work = run.phases.find((p) => p.type === "work")!;
    expect(work.targetSplit).toBe(123); // 128 unnudged -> 123 after -5
    expect(work.spm).toBe(99);
    expect(work.originalIndex).toBe(workIndex);
  });

  it("carries an effort phase's label and targetKind through unchanged (Microburst: ALL OUT)", () => {
    const d = buildDraft(draftInputFor("Microburst", "mb-1"));
    const run = buildRun(d, baselines, tol, t0);
    const work = run.phases.find((p) => p.type === "work")!;
    expect(work.label).toBe("ALL OUT");
    expect(work.targetKind).toBe("effort");
    expect(work.spm).toBe(32);
  });

  it("handles an open-ended 'test' step (no seconds, no meters) — hand-built since no starter workout authors one", () => {
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
});

describe("remainingSeconds", () => {
  it("returns the full phase duration at the instant a phase starts", () => {
    expect(remainingSeconds(mackerelRun(), t0)).toBe(300);
  });

  it("decreases by elapsed time within the phase", () => {
    expect(remainingSeconds(mackerelRun(), addSeconds(t0, 120))).toBe(180);
  });

  it("floors at 0 rather than going negative", () => {
    expect(remainingSeconds(mackerelRun(), addSeconds(t0, 301))).toBe(0);
  });

  it("is 0 on a distance phase — nothing to count down from", () => {
    const run = { ...coldFrontRun(), index: 1 }; // the first 2000m work phase
    expect(remainingSeconds(run, addSeconds(t0, 50))).toBe(0);
  });

  it("is 0 past the last phase", () => {
    const run = { ...mackerelRun(), index: 4 };
    expect(remainingSeconds(run, t0)).toBe(0);
  });
});

describe("elapsedSeconds", () => {
  it("counts up from phaseStartedAt on a distance phase", () => {
    const run = { ...coldFrontRun(), index: 1 };
    expect(elapsedSeconds(run, addSeconds(t0, 452))).toBe(452);
  });

  it("excludes prior pausedTotalMs", () => {
    const run: SessionRun = {
      ...coldFrontRun(),
      index: 1,
      pausedTotalMs: 60_000,
    };
    expect(elapsedSeconds(run, addSeconds(t0, 452))).toBe(392);
  });
});

describe("tick — the catch-up walk", () => {
  it("is a no-op mid-phase (resilience 1: reload lands on the same phase, correct remaining)", () => {
    const run = mackerelRun();
    const now = addSeconds(t0, 120);
    const result = tick(run, now);
    expect(result).toBe(run); // same reference: nothing needed to advance
    expect(remainingSeconds(result, now)).toBe(180);
  });

  it("does not advance while paused, even long past the phase boundary", () => {
    const paused = pause(mackerelRun(), addSeconds(t0, 50));
    const result = tick(paused, addSeconds(t0, 10_000));
    expect(result).toBe(paused);
  });

  it("walks forward across exactly 3 finished time phases (resilience 3), landing partway into the 4th with phaseStartedAt seeded at the newest boundary, not now", () => {
    const run = mackerelRun();
    // wu 300s + work 900s + work 900s = 2100s boundary; +100s into phase 4.
    const now = addSeconds(t0, 300 + 900 + 900 + 100);
    const result = tick(run, now);
    expect(result.index).toBe(3);
    expect(result.phaseStartedAt).toBe(addSeconds(t0, 2100).toISOString());
    expect(result.phaseStartedAt).not.toBe(now.toISOString()); // NOT now
    expect(result.pausedTotalMs).toBe(0);
    expect(result.pausedAt).toBeNull();
    expect(result.completedAt).toBeNull();
    expect(remainingSeconds(result, now)).toBe(800); // 900 - 100
  });

  it("completing the last time phase during a walk sets completedAt", () => {
    const run = mackerelRun();
    const now = addSeconds(t0, 300 + 900 + 900 + 900); // exact end boundary
    const result = tick(run, now);
    expect(result.index).toBe(run.phases.length);
    expect(result.completedAt).toBe(now.toISOString());
    expect(result.phaseStartedAt).toBe(now.toISOString());
  });

  it("halts at a distance phase reached mid-walk, seeding its stopwatch baseline at the walk's arrival boundary (resilience 3, Cold Front wu -> 2000m)", () => {
    const run = coldFrontRun(); // index 0: wu 300s, then a 2000m work phase
    const now = addSeconds(t0, 300 + 50); // 50s into the distance phase
    const result = tick(run, now);
    expect(result.index).toBe(1);
    expect(result.phases[1]!.meters).toBe(2000);
    expect(result.phaseStartedAt).toBe(addSeconds(t0, 300).toISOString());
    expect(elapsedSeconds(result, now)).toBe(50);
  });

  it("does not walk at all when the current phase is already a distance phase", () => {
    const run = { ...coldFrontRun(), index: 1 };
    const result = tick(run, addSeconds(t0, 10_000));
    expect(result).toBe(run);
  });

  it("is a no-op once already complete", () => {
    const run: SessionRun = { ...mackerelRun(), completedAt: t0.toISOString() };
    expect(tick(run, addSeconds(t0, 10_000))).toBe(run);
  });
});

describe("pause / resume", () => {
  it("freezes elapsed time regardless of how long the pause lasts", () => {
    const paused = pause(mackerelRun(), addSeconds(t0, 50));
    expect(elapsedSeconds(paused, addSeconds(t0, 50))).toBe(50);
    expect(elapsedSeconds(paused, addSeconds(t0, 99_999))).toBe(50);
  });

  it("also freezes a distance phase's stopwatch", () => {
    const run = { ...coldFrontRun(), index: 1 };
    const paused = pause(run, addSeconds(t0, 50));
    expect(elapsedSeconds(paused, addSeconds(t0, 5_000))).toBe(50);
  });

  it("is idempotent: pausing an already-paused run doesn't move pausedAt", () => {
    const first = pause(mackerelRun(), addSeconds(t0, 50));
    const second = pause(first, addSeconds(t0, 999));
    expect(second).toBe(first);
  });

  it("resume folds the pause duration into pausedTotalMs and unfreezes elapsed", () => {
    const paused = pause(mackerelRun(), addSeconds(t0, 50));
    const resumed = resume(paused, addSeconds(t0, 80));
    expect(resumed.pausedAt).toBeNull();
    expect(resumed.pausedTotalMs).toBe(30_000);
    expect(elapsedSeconds(resumed, addSeconds(t0, 80))).toBe(50);
  });

  it("resume is a no-op on a run that isn't paused", () => {
    const run = mackerelRun();
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
    const run = mackerelRun();
    const now = addSeconds(t0, 120);
    const before = remainingSeconds(run, now);
    const after = remainingSeconds(reload(run), now);
    expect(before).toBe(180);
    expect(after).toBe(180);
  });

  it("resilience 2: reload while paused keeps the same remaining time", () => {
    const paused = pause(mackerelRun(), addSeconds(t0, 50));
    const now = addSeconds(t0, 99_999);
    expect(remainingSeconds(paused, now)).toBe(250);
    expect(remainingSeconds(reload(paused), now)).toBe(250);
    expect(reload(paused).pausedAt).toBe(paused.pausedAt);
  });

  it("pause -> reload -> resume yields remaining identical to never reloading (hand-computed: 300 - 50 = 250)", () => {
    const run = mackerelRun();
    const paused = pause(run, addSeconds(t0, 50));
    const resumeAt = addSeconds(t0, 9_000); // a long gap while "closed"

    const neverReloaded = resume(paused, resumeAt);
    const reloadedThenResumed = resume(reload(paused), resumeAt);

    const expected = 250; // hand-computed: 300s phase, paused after 50s
    expect(remainingSeconds(neverReloaded, resumeAt)).toBe(expected);
    expect(remainingSeconds(reloadedThenResumed, resumeAt)).toBe(expected);
  });
});

describe("advance / rewind", () => {
  it("skips to the next phase, re-seeding its clock at now and clearing pause state", () => {
    const paused = pause(mackerelRun(), addSeconds(t0, 10));
    const now = addSeconds(t0, 500);
    const result = advance(paused, now);
    expect(result.index).toBe(1);
    expect(result.phaseStartedAt).toBe(now.toISOString());
    expect(result.pausedAt).toBeNull();
    expect(result.pausedTotalMs).toBe(0);
  });

  it("past the last phase completes the run", () => {
    const run = { ...mackerelRun(), index: 3 }; // the last phase (0-indexed, 4 total)
    const now = addSeconds(t0, 1000);
    const result = advance(run, now);
    expect(result.index).toBe(run.phases.length);
    expect(result.completedAt).toBe(now.toISOString());
  });

  it("advance is a no-op once already complete", () => {
    const run: SessionRun = { ...mackerelRun(), completedAt: t0.toISOString() };
    expect(advance(run, addSeconds(t0, 10))).toBe(run);
  });

  it("steps back to the previous phase, re-seeding its clock", () => {
    const run = { ...mackerelRun(), index: 2 };
    const now = addSeconds(t0, 500);
    const result = rewind(run, now);
    expect(result.index).toBe(1);
    expect(result.phaseStartedAt).toBe(now.toISOString());
  });

  it("clamps at phase 0 rather than going negative, but still restarts its clock", () => {
    const run = mackerelRun();
    const now = addSeconds(t0, 500);
    const result = rewind(run, now);
    expect(result.index).toBe(0);
    expect(result.phaseStartedAt).toBe(now.toISOString());
  });

  it("rewind is a no-op once already complete", () => {
    const run: SessionRun = { ...mackerelRun(), completedAt: t0.toISOString() };
    expect(rewind(run, addSeconds(t0, 10))).toBe(run);
  });
});

describe("nextDistance", () => {
  it("records the actual average split on NEXT — hand-pinned: 452s / 2000m x 500 = 113.0 exactly (Cold Front)", () => {
    const run = { ...coldFrontRun(), index: 1 }; // the first 2000m work phase
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

  it("records a non-integer average split — hand-pinned: 4567s / 10000m x 500 = 228.35 (Jet Stream)", () => {
    const run = { ...jetStreamRun(), index: 1 }; // the 10,000m work phase
    const now = addSeconds(t0, 4567);
    const result = nextDistance(run, now);
    expect(result.actuals[1]!.splitSeconds).toBe(228.35);
    expect(result.actuals[1]!.elapsedSeconds).toBe(4567);
  });

  it("is a no-op on a non-distance (time) phase", () => {
    const run = mackerelRun(); // index 0: wu, a time phase
    const result = nextDistance(run, addSeconds(t0, 50));
    expect(result).toBe(run);
  });
});

describe("isComplete", () => {
  it("is false before the last phase", () => {
    expect(isComplete(mackerelRun())).toBe(false);
  });

  it("is true once index reaches phases.length", () => {
    const run = { ...mackerelRun(), index: 3 };
    const completed = advance(run, addSeconds(t0, 10));
    expect(isComplete(completed)).toBe(true);
  });
});

describe("totalRemainingSeconds", () => {
  it("sums remaining time-phase seconds across the current and all upcoming phases (Mackerel Sky)", () => {
    const run = mackerelRun();
    const now = addSeconds(t0, 50); // 50s into the 300s warmup
    // 250 (wu remaining) + 900 + 900 + 900 = 2950
    expect(totalRemainingSeconds(run, now)).toBe(2950);
  });

  it("prices upcoming distance phases via meters/target-split — the same per-phase arithmetic estimateMinutes uses (Cold Front)", () => {
    const run = coldFrontRun();
    // wu 300 + 4 * ((2000/500 * 121) + 300) = 300 + 4*784 = 3436
    expect(totalRemainingSeconds(run, t0)).toBe(3436);
  });

  it("gives partial credit for the CURRENT distance phase, subtracting its own elapsed (Cold Front)", () => {
    const run = { ...coldFrontRun(), index: 1 };
    const now = addSeconds(t0, 200);
    // current: (2000/500*121) - 200 = 484 - 200 = 284
    // remaining phases 2..8: 300 + 3*(484 + 300) = 300 + 2352 = 2652
    expect(totalRemainingSeconds(run, now)).toBe(2936);
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
    const run = { ...mackerelRun(), index: 4 };
    expect(totalRemainingSeconds(run, t0)).toBe(0);
  });
});
