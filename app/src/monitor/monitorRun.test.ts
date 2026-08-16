import { describe, it, expect, beforeEach, vi } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import type { IntervalActual } from "../../domain/monitor/types.js";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import type { LogSeed } from "../session/logDraft";
import { saveRun, loadRun, RUN_KEY, type SessionRun } from "../session/run";
import {
  saveMonitorRun,
  loadMonitorRun,
  clearMonitorRun,
  createMonitorRun,
  recordActual,
  completeMonitorRun,
  completeInterruptedRun,
  interruptedTotalSeconds,
  anyLiveSession,
  connectGuardStage,
  MONITOR_RUN_KEY,
  type MonitorRun,
} from "./monitorRun";

// Realistic fixture, per repo convention (session/run.test.ts's own
// comment): Filling Low (AT) — 3x2000m @ 6k+4 with 3' rest,
// compiled through the REAL assembly a session would use
// (buildDraft -> buildRun -> compileProgram(run.phases), the same path
// program.sweep.test.ts sweeps all 300 workouts through) rather than a
// hand-built minimum WorkoutProgram.
const baselines: Baselines = { k2Seconds: 100, k6Seconds: 120 };
const t0 = new Date("2026-08-05T12:00:00.000Z");

// 7C Task 1: `createMonitorRun`'s `logSeed` arg is REQUIRED (this file's own
// `createMonitorRun` describe block explains why, mirroring `RunIdentity`'s
// identical requirement in `useMonitorSession.ts`). This suite's own tests
// are about the RECORD's mechanics (cross-clear, versioning, actual
// accumulation), not about seed CONTENT, so one placeholder constant fills
// every call site rather than a bespoke seed per test.
const TEST_SEED: LogSeed = {
  steps: [{ label: "8:00 warm-up", kind: "warmup" }],
  paces: {},
};

function fillingLowProgram(): WorkoutProgram {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: `fl-${Math.random()}`,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const run = buildRun(draft, baselines, t0);
  const result = compileProgram(run.phases);
  if ("code" in result) {
    throw new Error(`fixture failed to compile: ${result.code}`);
  }
  return result;
}

function freshMonitorRun(): MonitorRun {
  return {
    v: 1,
    workoutId: "fl-workout-id",
    title: "Filling Low",
    program: fillingLowProgram(),
    actuals: [],
    deviceName: "PM5 12345",
    startedAt: t0.toISOString(),
    completedAt: null,
    terminated: false,
  };
}

const actual1: IntervalActual = {
  index: 0,
  elapsedSeconds: 452,
  distanceMeters: 2000,
  avgSplit: 113,
  avgSpm: 24,
  avgHeartRateBpm: 150,
};

function viaJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// A minimal, distinctly-shaped SessionRun for the cross-clear/truth-table
// tests below — these only care about presence and `completedAt`, not the
// engine's real phase content, so a hand-built shape (matching run.test.ts's
// own field set) is legitimate here rather than a full buildRun call.
function fakeSessionRun(completedAt: string | null): SessionRun {
  return {
    v: 1,
    workoutId: "sr-workout-id",
    title: "Some Session",
    phases: [],
    index: 0,
    phaseStartedAt: t0.toISOString(),
    pausedAt: null,
    pausedTotalMs: 0,
    actuals: {},
    startedAt: t0.toISOString(),
    completedAt,
  };
}

describe("saveMonitorRun / loadMonitorRun / clearMonitorRun", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a fresh monitor run byte-identical", () => {
    const run = freshMonitorRun();
    saveMonitorRun(run);
    expect(loadMonitorRun()).toStrictEqual(viaJson(run));
  });

  it("round-trips a run with recorded interval actuals and a terminated finish", () => {
    const run: MonitorRun = {
      ...freshMonitorRun(),
      actuals: [actual1],
      completedAt: new Date("2026-08-05T12:20:00.000Z").toISOString(),
      terminated: true,
    };
    saveMonitorRun(run);
    const loaded = loadMonitorRun();
    expect(loaded).toStrictEqual(viaJson(run));
    expect(loaded!.terminated).toBe(true);
    expect(loaded!.actuals).toStrictEqual([actual1]);
  });

  it("returns null when nothing is stored", () => {
    expect(loadMonitorRun()).toBeNull();
  });

  it("returns null and clears the key for garbage JSON", () => {
    localStorage.setItem(MONITOR_RUN_KEY, "{not json");
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  // 7C Task 1: this test used `v: 2` as its "unknown version" fixture before
  // this task made `v: 2` a real, loadable version (the `logSeed` bump) —
  // `v: 3` now plays that role instead, so the test still proves what its
  // name says rather than accidentally asserting the opposite of the new
  // behavior.
  it("returns null and clears the key for an unknown version, leaving a SessionRun (a separate key) untouched", () => {
    const run = freshMonitorRun();
    const sessionRun = fakeSessionRun(null);
    saveRun(sessionRun);
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify({ ...run, v: 3 }));

    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
    expect(loadRun()).toStrictEqual(sessionRun);
  });

  it("returns null and clears the key for a bare {v:1} with none of the load-bearing fields", () => {
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify({ v: 1 }));
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null and clears the key for valid JSON that isn't a plain record (a bare number)", () => {
    localStorage.setItem(MONITOR_RUN_KEY, "42");
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null and clears the key for valid JSON that's null", () => {
    localStorage.setItem(MONITOR_RUN_KEY, "null");
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null and clears the key for valid JSON that's an array, not an object", () => {
    localStorage.setItem(MONITOR_RUN_KEY, "[]");
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with workoutId as the wrong shape (a number — neither null nor a string)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, workoutId: 5 }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  // 7C Task 1 (spec §2: "a v1 record loads as today"). A hand-built v1 JSON
  // string, not `freshMonitorRun()` run through `JSON.stringify` — the
  // point is proving a record written by CODE THAT PREDATES `logSeed`
  // (never having `v: 2` in scope, never having the key at all, not just
  // "the field happens to be absent from an object built by today's code")
  // still loads clean.
  //
  // CLOSE-OUT C: the connected revamp added `type: "work"` to this
  // interval, and taking it back out is the whole point of the edit. The
  // fixture's ONE job is to be a record the code of its own era could
  // actually have written, and code predating `logSeed` predates
  // `ProgramInterval.type` by two more phases — a v1 record carrying it is
  // not a v1 record. That single "helpful" field is why the legacy program
  // shape had no coverage at all (CLAUDE.md recurring failure #3): the only
  // fixture in the repo that claims to be a pre-change record had been
  // quietly taught the post-change shape, so nothing could disprove the
  // premise that old records still read correctly. Nothing forced the
  // addition either — this is an untyped JSON literal, so the compiler
  // never asked for it.
  it("loads a v1 record with no logSeed field at all — no throw, no migration, simply no seed", () => {
    const v1Json = JSON.stringify({
      v: 1,
      workoutId: "fl-workout-id",
      title: "Filling Low",
      program: {
        intervals: [
          {
            kind: "time",
            value: 480,
            targetSplit: null,
            displaySpm: null,
            restSeconds: 0,
          },
        ],
      },
      actuals: [],
      deviceName: "PM5 12345",
      startedAt: t0.toISOString(),
      completedAt: null,
      terminated: false,
    });
    localStorage.setItem(MONITOR_RUN_KEY, v1Json);

    const loaded = loadMonitorRun();

    expect(loaded).not.toBeNull();
    expect(loaded!.v).toBe(1);
    expect(loaded!.logSeed).toBeUndefined();
    // The interval really is missing `type`, and the record loaded anyway:
    // `isMonitorRun`'s shallow program check is deliberate, and this is the
    // consequence stated out loud rather than left implicit in the fixture.
    // What SAVES a rower from that gap is not the validator — it is that no
    // reader of a loaded program consults `type`; `logDraft.test.ts`'s own
    // legacy-record test pins that side.
    expect(loaded!.program.intervals[0]).not.toHaveProperty("type");
    expect(loaded).toStrictEqual(JSON.parse(v1Json));
  });

  it("round-trips a v2 record carrying a logSeed byte-identical", () => {
    const run: MonitorRun = { ...freshMonitorRun(), v: 2, logSeed: TEST_SEED };
    saveMonitorRun(run);
    const loaded = loadMonitorRun();
    expect(loaded).toStrictEqual(viaJson(run));
    expect(loaded!.logSeed).toStrictEqual(TEST_SEED);
  });

  it("returns null for v:2 with logSeed as the wrong shape (a string, not an object)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, v: 2, logSeed: "nope" }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:2 with logSeed.steps as the wrong shape (an object, not an array)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, v: 2, logSeed: { steps: {}, paces: {} } }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for an unrecognized v (3) — same discard as any other unknown version", () => {
    const run = freshMonitorRun();
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify({ ...run, v: 3 }));
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("round-trips workoutId: null (a hand-built program, not a library workout) same as a real id", () => {
    const run = { ...freshMonitorRun(), workoutId: null };
    saveMonitorRun(run);
    expect(loadMonitorRun()).toStrictEqual(viaJson(run));
  });

  it("returns null for v:1 with title as the wrong shape (missing/non-string)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify({ ...run, title: 5 }));
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with program as the wrong shape (an array, not a record)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, program: [] }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with program.intervals as the wrong shape (an object, not an array)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, program: { intervals: {} } }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with actuals as the wrong shape (an object, not an array)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, actuals: {} }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with deviceName as the wrong shape (missing/non-string)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, deviceName: 5 }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with startedAt as the wrong shape (missing/non-string)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, startedAt: 1 }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with completedAt as the wrong shape (a number — neither null nor a string)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, completedAt: 5 }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with terminated as the wrong shape (a string, not a boolean)", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, terminated: "true" }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("clearMonitorRun removes the stored run", () => {
    saveMonitorRun(freshMonitorRun());
    clearMonitorRun();
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("never throws when localStorage.setItem fails (quota) — saveMonitorRun is void, best-effort", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    const run = freshMonitorRun();
    expect(() => saveMonitorRun(run)).not.toThrow();
    spy.mockRestore();
  });

  it("exposes the storage key used", () => {
    expect(MONITOR_RUN_KEY).toBe("ergomatic.monitorRun");
  });

  it("MONITOR_RUN_KEY / RUN_KEY are distinct storage keys — the two records never collide", () => {
    expect(MONITOR_RUN_KEY).not.toBe(RUN_KEY);
  });
});

describe("createMonitorRun", () => {
  beforeEach(() => localStorage.clear());

  it("builds a fresh, persisted MonitorRun stamped from its arguments and `now`, and always v: 2 (7C spec §2)", () => {
    const program = fillingLowProgram();
    const created = createMonitorRun(
      {
        workoutId: "fl-workout-id",
        title: "Filling Low",
        program,
        deviceName: "PM5 98765",
        logSeed: TEST_SEED,
      },
      t0,
    );
    expect(created).toStrictEqual({
      v: 2,
      workoutId: "fl-workout-id",
      title: "Filling Low",
      program,
      logSeed: TEST_SEED,
      actuals: [],
      deviceName: "PM5 98765",
      startedAt: t0.toISOString(),
      completedAt: null,
      terminated: false,
    });
    expect(loadMonitorRun()).toStrictEqual(viaJson(created));
  });

  it("cross-clear: creating a MonitorRun clears an existing SessionRun outright", () => {
    saveRun(fakeSessionRun(null));
    expect(loadRun()).not.toBeNull();

    createMonitorRun(
      {
        workoutId: null,
        title: "Filling Low",
        program: fillingLowProgram(),
        deviceName: "PM5",
        logSeed: TEST_SEED,
      },
      t0,
    );

    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("cross-clear: also clears a completed-but-unlogged SessionRun, not just a live one", () => {
    saveRun(fakeSessionRun(new Date("2026-08-05T13:00:00.000Z").toISOString()));

    createMonitorRun(
      {
        workoutId: null,
        title: "Filling Low",
        program: fillingLowProgram(),
        deviceName: "PM5",
        logSeed: TEST_SEED,
      },
      t0,
    );

    expect(loadRun()).toBeNull();
  });

  it("is a no-op on the SessionRun side when none exists — clearRun on an absent key never throws", () => {
    expect(loadRun()).toBeNull();
    expect(() =>
      createMonitorRun(
        {
          workoutId: null,
          title: "Filling Low",
          program: fillingLowProgram(),
          deviceName: "PM5",
          logSeed: TEST_SEED,
        },
        t0,
      ),
    ).not.toThrow();
    expect(loadRun()).toBeNull();
  });
});

describe("recordActual: actuals accumulate only while the run is open (Phase 7A-fix-2 Task 4, spec §4)", () => {
  beforeEach(() => localStorage.clear());

  const actual2: IntervalActual = {
    index: 1,
    elapsedSeconds: 448,
    distanceMeters: 2000,
    avgSplit: 112,
    avgSpm: 25,
    avgHeartRateBpm: 158,
  };

  it("appends to a LIVE run, in arrival order, and persists the result", () => {
    const run = freshMonitorRun();
    saveMonitorRun(run);

    const afterFirst = recordActual(run, actual1);
    const afterSecond = recordActual(afterFirst, actual2);

    expect(afterSecond.actuals).toStrictEqual([actual1, actual2]);
    expect(loadMonitorRun()).toStrictEqual(viaJson(afterSecond));
    // A new record each time — the caller's own copy is never reached back
    // into (`session/engine.ts`'s idiom).
    expect(run.actuals).toStrictEqual([]);
    expect(afterFirst.actuals).toStrictEqual([actual1]);
  });

  it("a CLOSED run is immutable: the same actual arriving after completedAt changes nothing, in memory or in storage", () => {
    // The record-side half of the run scoping. The driver already refuses
    // to normalize a post-run boundary into a finished workout (it emits
    // `index: null` + `boundary-out-of-run`), but a `MonitorRun` outlives
    // the driver instance that produced it, so the record refuses on its
    // own terms too. Against a `recordActual` without the guard, both
    // assertions below fail — the actual lands in a finished workout's
    // record and gets persisted there.
    const closed: MonitorRun = {
      ...freshMonitorRun(),
      actuals: [actual1],
      completedAt: new Date("2026-08-05T12:20:00.000Z").toISOString(),
    };
    saveMonitorRun(closed);

    const after = recordActual(closed, actual2);

    expect(after).toBe(closed);
    expect(after.actuals).toStrictEqual([actual1]);
    expect(loadMonitorRun()).toStrictEqual(viaJson(closed));
  });

  it("refuses a closed run that was TERMINATED just the same — 'closed' is completedAt, not how it ended", () => {
    const terminated: MonitorRun = {
      ...freshMonitorRun(),
      completedAt: new Date("2026-08-05T12:20:00.000Z").toISOString(),
      terminated: true,
    };
    expect(recordActual(terminated, actual1).actuals).toStrictEqual([]);
  });

  // -------------------------------------------------------------------
  // THE FINISH GRACE (hardware walk 5, 2026-08-10, phone BLE at the erg —
  // `docs/monitor/pm5-interface-notes.md` §21 item 4).
  // A PM5 sends the final interval's 0x0037/0x0038 pair one notification
  // AFTER the general-status frame that ends the workout, so the actual
  // that completes a rowed-out piece reaches this function a beat after
  // `completeMonitorRun` closed the record: a 1-interval workout rowed to
  // the finish prefilled the log screen "0 OF 1 INTERVALS MEASURED" with
  // the split bytes sitting in the wire trace. `opts.finalBoundary` is the
  // driver vouching for that one boundary; everything above still applies
  // to everything else.
  // -------------------------------------------------------------------

  /** Filling Low's LAST interval — the only index a finish grace can ever
   *  name, since the grace exists for the data of the interval a naturally
   *  finished workout just completed. Derived from the fixture's own
   *  program so it cannot drift from it. */
  const lastIndex = freshMonitorRun().program.intervals.length - 1;
  const finalActual: IntervalActual = { ...actual1, index: lastIndex };

  it("a CLOSED run accepts the FINISH GRACE actual the driver vouched for — the walk's own 0 OF 1", () => {
    expect(lastIndex).toBe(3); // Filling Low: warmup + 3 x 2000m
    const closed: MonitorRun = {
      ...freshMonitorRun(),
      completedAt: new Date("2026-08-05T12:20:00.000Z").toISOString(),
    };
    saveMonitorRun(closed);

    const after = recordActual(closed, finalActual, { finalBoundary: true });

    expect(after).not.toBe(closed);
    expect(after.actuals).toStrictEqual([finalActual]);
    // Persisted, not merely returned: 7C's log screen reads the RECORD.
    expect(loadMonitorRun()).toStrictEqual(viaJson(after));
    // And nothing else about the closed record moved.
    expect(after.completedAt).toBe(closed.completedAt);
    expect(after.terminated).toBe(false);
  });

  it("...but ONE of them: a second flagged actual naming a DIFFERENT interval is refused, not filed", () => {
    // CONSUMED-ONCE, re-derived at the record layer (review M-3). The driver
    // clears its own grace after the first boundary, so two flagged actuals
    // is a driver bug — and a record that filed the second would turn that
    // bug into a wrong saved log. The record answers from its own program:
    // only the LAST interval can be a finish boundary, so the first one to
    // arrive is the only one that can ever land.
    const closed: MonitorRun = {
      ...freshMonitorRun(),
      actuals: [finalActual],
      completedAt: new Date("2026-08-05T12:20:00.000Z").toISOString(),
    };
    saveMonitorRun(closed);

    // An interval this record does NOT hold, so the not-already-filed check
    // alone would let it through — it is refused for naming interval 1 of a
    // 4-interval program at the finish.
    const second: IntervalActual = { ...actual2, index: 1 };
    const after = recordActual(closed, second, { finalBoundary: true });

    expect(after).toBe(closed);
    expect(after.actuals).toStrictEqual([finalActual]);
    expect(loadMonitorRun()).toStrictEqual(viaJson(closed));
  });

  it("...and only for an interval it does not already hold — the flag is not a skeleton key", () => {
    // Post-run housekeeping re-reporting the very boundary already filed
    // must not double it, even flagged (the record outlives the driver
    // instance that set the flag).
    const closed: MonitorRun = {
      ...freshMonitorRun(),
      actuals: [finalActual],
      completedAt: new Date("2026-08-05T12:20:00.000Z").toISOString(),
    };
    saveMonitorRun(closed);

    const repeat: IntervalActual = { ...actual2, index: lastIndex };
    const after = recordActual(closed, repeat, { finalBoundary: true });

    expect(after).toBe(closed);
    expect(after.actuals).toStrictEqual([finalActual]);
  });

  it("...and never an actual with no interval identity at all — index null stays refused, flagged or not", () => {
    const closed: MonitorRun = {
      ...freshMonitorRun(),
      completedAt: new Date("2026-08-05T12:20:00.000Z").toISOString(),
    };

    const anonymous: IntervalActual = { ...finalActual, index: null };

    expect(recordActual(closed, anonymous, { finalBoundary: true })).toBe(
      closed,
    );
  });

  it("a LIVE run is unaffected by the flag either way — the grace is a rule about CLOSED records", () => {
    const run = freshMonitorRun();
    saveMonitorRun(run);

    const after = recordActual(run, actual1, { finalBoundary: true });

    expect(after.actuals).toStrictEqual([actual1]);
    // Even a repeat index lands while the run is open: a live run's actuals
    // are the driver's to decide, and nothing here dedupes them.
    expect(recordActual(after, actual1).actuals).toStrictEqual([
      actual1,
      actual1,
    ]);
  });
});

describe("completeMonitorRun: the completion writer (7B Task 4's own first caller)", () => {
  beforeEach(() => localStorage.clear());

  const finishedAt = new Date("2026-08-05T12:41:00.000Z");

  it("stamps completedAt and how it ended, and persists the result", () => {
    const run = { ...freshMonitorRun(), actuals: [actual1] };
    saveMonitorRun(run);

    const done = completeMonitorRun(run, { terminated: false }, finishedAt);

    expect(done.completedAt).toBe(finishedAt.toISOString());
    // An honest WORKOUTEND: 7C reads this to say "logged 4 of 4" rather
    // than "abandoned at 1".
    expect(done.terminated).toBe(false);
    expect(done.actuals).toStrictEqual([actual1]);
    expect(loadMonitorRun()).toStrictEqual(viaJson(done));
    // A new record, the caller's own copy untouched (`recordActual`'s
    // idiom).
    expect(run.completedAt).toBeNull();
  });

  it("records a TERMINATE as terminated — the same close, a different story", () => {
    const run = freshMonitorRun();

    const done = completeMonitorRun(run, { terminated: true }, finishedAt);

    expect(done).toMatchObject({
      completedAt: finishedAt.toISOString(),
      terminated: true,
    });
  });

  it("an already-closed run is returned UNCHANGED — a second terminal event never re-stamps it", () => {
    // The race this guard exists for: End closes the record, its own
    // terminate() makes the erg report `terminated`, and that event comes
    // straight back. Without the guard the record would carry the LATER
    // time and flip `terminated` after the fact.
    const closed: MonitorRun = {
      ...freshMonitorRun(),
      completedAt: finishedAt.toISOString(),
      terminated: true,
    };
    saveMonitorRun(closed);
    const later = new Date("2026-08-05T12:45:00.000Z");

    const after = completeMonitorRun(closed, { terminated: false }, later);

    expect(after).toBe(closed);
    expect(after.completedAt).toBe(finishedAt.toISOString());
    expect(after.terminated).toBe(true);
    expect(loadMonitorRun()).toStrictEqual(viaJson(closed));
  });

  it("a closed record refuses later actuals — completeMonitorRun is what turns the guard on", () => {
    const run = freshMonitorRun();
    saveMonitorRun(run);

    const done = completeMonitorRun(run, { terminated: false }, finishedAt);

    expect(recordActual(done, actual1)).toBe(done);
    expect(loadMonitorRun()?.actuals).toStrictEqual([]);
  });
});

describe("anyLiveSession: the coexistence truth table", () => {
  beforeEach(() => localStorage.clear());

  function setSessionRun(state: "absent" | "live" | "unlogged"): void {
    if (state === "absent") return;
    saveRun(
      fakeSessionRun(
        state === "live"
          ? null
          : new Date("2026-08-05T13:00:00.000Z").toISOString(),
      ),
    );
  }

  function setMonitorRun(state: "absent" | "live" | "unlogged"): void {
    if (state === "absent") return;
    saveMonitorRun({
      ...freshMonitorRun(),
      completedAt:
        state === "live"
          ? null
          : new Date("2026-08-05T13:00:00.000Z").toISOString(),
    });
  }

  const cases: Array<{
    sessionRun: "absent" | "live" | "unlogged";
    monitorRun: "absent" | "live" | "unlogged";
    expected: "none" | "phone" | "monitor";
  }> = [
    { sessionRun: "absent", monitorRun: "absent", expected: "none" },
    { sessionRun: "absent", monitorRun: "live", expected: "monitor" },
    { sessionRun: "absent", monitorRun: "unlogged", expected: "none" },
    { sessionRun: "live", monitorRun: "absent", expected: "phone" },
    { sessionRun: "live", monitorRun: "live", expected: "monitor" },
    { sessionRun: "live", monitorRun: "unlogged", expected: "phone" },
    { sessionRun: "unlogged", monitorRun: "absent", expected: "none" },
    { sessionRun: "unlogged", monitorRun: "live", expected: "monitor" },
    { sessionRun: "unlogged", monitorRun: "unlogged", expected: "none" },
  ];

  it.each(cases)(
    "sessionRun=$sessionRun monitorRun=$monitorRun -> $expected",
    ({ sessionRun, monitorRun, expected }) => {
      setSessionRun(sessionRun);
      setMonitorRun(monitorRun);
      expect(anyLiveSession()).toBe(expected);
    },
  );

  it("all nine cells are covered exactly once (guards the table itself from drifting)", () => {
    expect(cases).toHaveLength(9);
    const keys = new Set(cases.map((c) => `${c.sessionRun}/${c.monitorRun}`));
    expect(keys.size).toBe(9);
  });
});

// Phase 7B Task 2, spec §3. The predicate half of the Connect guard; the
// staged confirm it feeds is ConnectAction.test.tsx's.
describe("connectGuardStage: the Connect door's lock", () => {
  beforeEach(() => localStorage.clear());

  const finishedAt = new Date("2026-08-05T13:00:00.000Z").toISOString();

  it("nothing on record: null — Connect proceeds with no ceremony", () => {
    expect(connectGuardStage()).toBeNull();
  });

  it("a finished-but-unlogged SessionRun: 'unlogged' — the F5 record", () => {
    saveRun(fakeSessionRun(finishedAt));
    expect(connectGuardStage()).toBe("unlogged");
  });

  it("a live SessionRun: 'in-progress' — destroyed just as completely, lesser loss", () => {
    saveRun(fakeSessionRun(null));
    expect(connectGuardStage()).toBe("in-progress");
  });

  // Task 5 review, HIGH-1: `createMonitorRun`'s own `saveMonitorRun` call
  // OVERWRITES `MONITOR_RUN_KEY` unconditionally (this file's own doc
  // comment on `createMonitorRun`: "deliberately NOT idempotent-checked
  // against an existing live `MonitorRun`") — a finished-but-unlogged
  // `MonitorRun` (7C's prefill input) is exactly as real a record as the
  // `SessionRun` case above, and `WorkoutDetail.handleRowInstead` (Task 5)
  // ALSO clears it unconditionally. The guard reads it now.
  it("a finished-but-unlogged MonitorRun (no SessionRun on record): 'unlogged' — 7C's prefill input", () => {
    saveMonitorRun({ ...freshMonitorRun(), completedAt: finishedAt });
    expect(connectGuardStage()).toBe("unlogged");
  });

  it("a live MonitorRun (no SessionRun on record): 'unlogged' — dead-run truth: any MonitorRun visible at Connect's door is dead (the connected session lives on WorkoutDetail's surface, and reload/navigation tears it down), so completedAt === null here means interrupted, not running (F6 spec 2b, exit criterion 5)", () => {
    saveMonitorRun(freshMonitorRun());
    expect(connectGuardStage()).toBe("unlogged");
  });

  // Pin, not a red-first case (antagonist correction #3): completedAt !==
  // null already mapped to "unlogged" before this task. Recorded anyway
  // because `completeInterruptedRun`'s stamp is the shape Today's own
  // "end this interrupted session" door will actually produce, and this
  // guard must agree with it.
  it("a MonitorRun stamped via completeInterruptedRun: 'unlogged' too", () => {
    const stamped = completeInterruptedRun(
      freshMonitorRun(),
      new Date(finishedAt),
    );
    saveMonitorRun(stamped);
    expect(connectGuardStage()).toBe("unlogged");
  });

  it("a SessionRun on record wins over a MonitorRun — same descending-severity order handleStart already uses", () => {
    saveRun(fakeSessionRun(finishedAt));
    saveMonitorRun(freshMonitorRun());
    expect(connectGuardStage()).toBe("unlogged");
  });

  it("both records finished-but-unlogged: staged ONCE, not twice — a single ConnectGuardStage value, the SessionRun's own sentence", () => {
    saveRun(fakeSessionRun(finishedAt));
    saveMonitorRun({ ...freshMonitorRun(), completedAt: finishedAt });
    expect(connectGuardStage()).toBe("unlogged");
  });

  it("garbage in RUN_KEY falls through to the MonitorRun check (loadRun's own Resilience #5)", () => {
    localStorage.setItem(RUN_KEY, "{{ not json");
    saveMonitorRun({ ...freshMonitorRun(), completedAt: finishedAt });
    expect(connectGuardStage()).toBe("unlogged");
  });

  it("garbage in both keys: null — nothing at risk", () => {
    localStorage.setItem(RUN_KEY, "{{ not json");
    expect(connectGuardStage()).toBeNull();
  });

  // THE MUTATION TARGET, stated as an assertion rather than left to a
  // comment: for the exact record this guard exists to protect,
  // `anyLiveSession()` answers "none". Re-routing `connectGuardStage`
  // through it — the tempting "unify the guards" refactor ROADMAP M-1
  // forbids — would make the two agree here, and this test would die
  // alongside the protection.
  it("DISAGREES with anyLiveSession() on the unlogged SessionRun — that disagreement IS the guard", () => {
    saveRun(fakeSessionRun(finishedAt));

    expect(anyLiveSession()).toBe("none");
    expect(connectGuardStage()).toBe("unlogged");
  });

  it("still disagrees when BOTH records are stale — anyLiveSession()'s 'both-stale' row is still a discard for Connect", () => {
    saveRun(fakeSessionRun(finishedAt));
    saveMonitorRun({ ...freshMonitorRun(), completedAt: finishedAt });

    expect(anyLiveSession()).toBe("none");
    expect(connectGuardStage()).toBe("unlogged");
  });
});

// F6 spec 2b, Task 1. `endedBy` is the additive marker a rower's own
// "end this interrupted session" door (Today's row, a later task) stamps
// on a `MonitorRun` that never got a `workoutComplete`/`terminated` event
// from the machine at all — the phone was disconnected, backgrounded past
// recovery, or the rower simply walked away. Absent means "normal
// completion" (or "still live"); it is never inferred from `terminated`
// or `completedAt` alone, because both of those already mean something
// else (`MonitorRun`'s own doc comments on each field).
describe("endedBy: the additive interrupted marker (F6)", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips endedBy through save/load", () => {
    const run: MonitorRun = {
      ...freshMonitorRun(),
      v: 2,
      logSeed: TEST_SEED,
      completedAt: new Date("2026-08-16T10:00:00.000Z").toISOString(),
      endedBy: "interrupted",
    };
    saveMonitorRun(run);
    const loaded = loadMonitorRun();
    expect(loaded).toStrictEqual(viaJson(run));
    expect(loaded!.endedBy).toBe("interrupted");
  });

  it("a record without endedBy loads unchanged (never-migrate: reads as normal completion)", () => {
    const run: MonitorRun = {
      ...freshMonitorRun(),
      completedAt: new Date("2026-08-16T10:00:00.000Z").toISOString(),
    };
    saveMonitorRun(run);
    const loaded = loadMonitorRun();
    expect(loaded!.endedBy).toBeUndefined();
    expect(loaded).toStrictEqual(viaJson(run));
  });

  it("rejects a record whose endedBy is any other value", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, endedBy: "garbage" }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });
});

describe("completeInterruptedRun: the rower's door (F6)", () => {
  beforeEach(() => localStorage.clear());

  it("stamps completedAt from now and endedBy interrupted, persists, leaves terminated untouched", () => {
    const run = { ...freshMonitorRun(), terminated: false };
    saveMonitorRun(run);

    const out = completeInterruptedRun(
      run,
      new Date("2026-08-16T10:00:00.000Z"),
    );

    expect(out.completedAt).toBe("2026-08-16T10:00:00.000Z");
    expect(out.endedBy).toBe("interrupted");
    expect(out.terminated).toBe(false);
    // Persisted, not merely returned: the record outlives this call.
    expect(loadMonitorRun()?.endedBy).toBe("interrupted");
    // A new record, the caller's own copy untouched (`recordActual`'s
    // and `completeMonitorRun`'s shared idiom).
    expect(run.completedAt).toBeNull();
  });

  it("is idempotent: an already-completed record is returned unchanged and not re-stamped", () => {
    const closed: MonitorRun = {
      ...freshMonitorRun(),
      completedAt: new Date("2026-08-16T09:00:00.000Z").toISOString(),
    };
    saveMonitorRun(closed);

    const out = completeInterruptedRun(
      closed,
      new Date("2026-08-16T10:00:00.000Z"),
    );

    expect(out).toBe(closed);
    expect(out.completedAt).toBe(closed.completedAt);
    expect(out.endedBy).toBeUndefined();
    expect(loadMonitorRun()).toStrictEqual(viaJson(closed));
  });
});

// `interruptedTotalSeconds` answers "how much of this workout actually
// happened" for a session the rower ended early through the interrupted
// door, from the record's OWN actuals and program — never wall-clock time
// past the last measured boundary (the spec's "nothing invented past the
// last measured boundary" constraint). James's verbatim ruling is the
// allowance, stated here so a later review does not relitigate it: EVERY
// completed interval's programmed rest counts, including the last one's —
// the rower was still resting inside the plan, whether or not another
// working interval ever started.
describe("interruptedTotalSeconds: work + programmed rest for completed intervals", () => {
  // Hand-built program, not a compiled library fixture: these tests are
  // about the ARITHMETIC over `restSeconds`/`index`, not about a real
  // workout's shape, matching this file's own precedent for the v1
  // legacy-record fixture just above.
  function programWithRest(restSeconds: number[]): WorkoutProgram {
    return {
      intervals: restSeconds.map((seconds) => ({
        type: "work" as const,
        kind: "time" as const,
        value: 500,
        targetSplit: null,
        displaySpm: null,
        restSeconds: seconds,
      })),
    };
  }

  it("sums elapsed work plus each completed interval's restSeconds", () => {
    const run: MonitorRun = {
      ...freshMonitorRun(),
      program: programWithRest([30, 45, 0]),
      actuals: [
        { ...actual1, index: 0, elapsedSeconds: 60.5 },
        { ...actual1, index: 1, elapsedSeconds: 120.2 },
        // interval 2 never completed: no actual names it, and its
        // restSeconds (0) must not be summed for an interval that never
        // finished.
      ],
    };
    expect(interruptedTotalSeconds(run)).toBeCloseTo(255.7);
  });

  it("an unattributable actual (index null) contributes its work seconds and no rest", () => {
    const run: MonitorRun = {
      ...freshMonitorRun(),
      program: programWithRest([30, 45]),
      actuals: [
        { ...actual1, index: 0, elapsedSeconds: 60 },
        { ...actual1, index: null, elapsedSeconds: 20 },
      ],
    };
    // 60 (interval 0's work) + 30 (interval 0's rest) + 20 (the
    // unattributable actual's own work, no rest lookup at all).
    expect(interruptedTotalSeconds(run)).toBe(110);
  });

  it("an out-of-range index contributes work only (defensive; array position is not program position)", () => {
    const run: MonitorRun = {
      ...freshMonitorRun(),
      program: programWithRest([30, 45]),
      actuals: [{ ...actual1, index: 7, elapsedSeconds: 40 }],
    };
    expect(() => interruptedTotalSeconds(run)).not.toThrow();
    expect(interruptedTotalSeconds(run)).toBe(40);
  });

  it("no actuals means zero", () => {
    expect(interruptedTotalSeconds(freshMonitorRun())).toBe(0);
  });
});
