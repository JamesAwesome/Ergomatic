import { describe, it, expect, beforeEach, vi } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import type { IntervalActual } from "../../domain/monitor/types.js";
import {
  parseAdditionalSplitIntervalData,
  parseSplitIntervalData,
  toIntervalActual,
  type RawPm5Status,
} from "../../domain/monitor/pm5/parse.js";
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
  appendSummaryObservations,
  anyLiveSession,
  connectGuardStage,
  stashHandoffRun,
  takeHandoffRun,
  clearHandoffSlot,
  MONITOR_RUN_KEY,
  type MonitorRun,
  type MachineSummaryDetail,
} from "./monitorRun";
import {
  SERIES_SAMPLE_CAP,
  type Sample,
  type SeriesData,
} from "./seriesRecorder";
import { fromHexString } from "./transports/recording";

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
  // `kind: "warmup"` is deliberate, not stale: Phase WU removed the
  // producer, but `LogSeed` is PERSISTED, so a `MonitorRun` stored
  // before Phase WU still carries this exact value. Keeping it here
  // exercises `buildMonitorLogSteps`' legacy skip (`logDraft.ts`) — do
  // not "modernize" this to a plain step, that changes what the
  // function under test emits and moves assertions below.
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
  restDistanceMeters: 0,
};

function viaJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// RC-1's own oracle-grounding pattern (`session/summaryModel.test.ts`'s
// identical helper, duplicated rather than shared — see that file's own
// header comment on why decoding with the driver's own parser functions,
// not the full record-replay harness, is the right amount of realism for a
// pure-function unit test). Real wire bytes decode to a real
// `IntervalActual`, not a hand-built literal that could silently drift
// from what the parser actually produces.
function decodeActual(
  hex37: string,
  hex38: string,
  normalizedIndex: number,
): IntervalActual {
  const a = parseSplitIntervalData(fromHexString(hex37));
  const b = parseAdditionalSplitIntervalData(fromHexString(hex38));
  if ("error" in a)
    throw new Error(`0x0037 parse error: ${JSON.stringify(a.error)}`);
  if ("error" in b)
    throw new Error(`0x0038 parse error: ${JSON.stringify(b.error)}`);
  const raw = { ...a, ...b } as RawPm5Status;
  return { ...toIntervalActual(raw), index: normalizedIndex };
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
    restDistanceMeters: 0,
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

  it("storage-spine design spec §2's late side (Task 3): a finish-grace actual arriving after MONITOR_RUN_KEY was cleared out from under it — the resurrection race — is refused, not resurrected", () => {
    // `useMonitorSession.ts`'s deferred teardown is the caller old enough
    // for this to matter: a `run` object it decided was acceptable BEFORE
    // the burst linger started can now be handed to `recordActual` up to
    // `BURST_LINGER_MS` later, after the rower discarded or logged the
    // run from a screen that has no idea this stale object still exists.
    const closed: MonitorRun = {
      ...freshMonitorRun(),
      completedAt: new Date("2026-08-05T12:20:00.000Z").toISOString(),
    };
    // Deliberately NOT saved to storage — storage holds nothing for this
    // run at write time, exactly the `clearMonitorRun()` shape.
    expect(loadMonitorRun()).toBeNull();

    const after = recordActual(closed, finalActual, { finalBoundary: true });

    expect(after).toBe(closed);
    expect(after.actuals).toStrictEqual([]);
    // Nothing resurrected: storage is still empty, not a record this
    // caller's stale copy just wrote back into existence.
    expect(loadMonitorRun()).toBeNull();
  });

  it("...and the identical refusal when storage now holds a DIFFERENT run — the finish-grace actual never lands on somebody else's record", () => {
    const closed: MonitorRun = {
      ...freshMonitorRun(),
      completedAt: new Date("2026-08-05T12:20:00.000Z").toISOString(),
    };
    const unrelated: MonitorRun = {
      ...freshMonitorRun(),
      startedAt: "2026-08-05T13:00:00.000Z",
    };
    saveMonitorRun(unrelated);

    const after = recordActual(closed, finalActual, { finalBoundary: true });

    expect(after).toBe(closed);
    expect(after.actuals).toStrictEqual([]);
    expect(loadMonitorRun()).toStrictEqual(viaJson(unrelated));
  });

  it("...but the ORDINARY case is unaffected: storage still holding this exact run accepts the finish-grace actual same as always", () => {
    const closed: MonitorRun = {
      ...freshMonitorRun(),
      completedAt: new Date("2026-08-05T12:20:00.000Z").toISOString(),
    };
    saveMonitorRun(closed);

    const after = recordActual(closed, finalActual, { finalBoundary: true });

    expect(after).not.toBe(closed);
    expect(after.actuals).toStrictEqual([finalActual]);
    expect(loadMonitorRun()).toStrictEqual(viaJson(after));
  });

  // Final whole-branch review, LOW-1: the late-acceptance branch used to
  // rebuild `next` by spreading the CALLER's `run` argument, discarding
  // the record `stillLive` had just re-read from storage. This test makes
  // the two provably different objects — a stale caller copy (an old
  // `title`) versus what storage genuinely holds (a fresher one) — so a
  // regression back to spreading `run` fails loudly instead of silently
  // passing on the every-day case where the two happen to agree.
  it("builds the late-acceptance write on the record `stillLive` just re-read from storage, not a stale copy the caller was holding (LOW-1)", () => {
    const staleCallerCopy: MonitorRun = {
      ...freshMonitorRun(),
      title: "Stale title the caller was holding",
      completedAt: new Date("2026-08-05T12:20:00.000Z").toISOString(),
    };
    // Storage holds a DIFFERENT object — same identity (`startedAt`), a
    // fresher `title` — simulating a write that landed between the
    // caller's own copy and this call (the up-to-2000ms burst-linger gap
    // the guard above's own comment names).
    const freshInStorage: MonitorRun = {
      ...staleCallerCopy,
      title: "Fresh title actually in storage",
    };
    saveMonitorRun(freshInStorage);

    const after = recordActual(staleCallerCopy, finalActual, {
      finalBoundary: true,
    });

    // The result reflects STORAGE's title, not the stale caller copy's.
    expect(after.title).toBe("Fresh title actually in storage");
    expect(after.title).not.toBe(staleCallerCopy.title);
    expect(after.actuals).toStrictEqual([finalActual]);
    expect(loadMonitorRun()).toStrictEqual(viaJson(after));
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

    const done = completeMonitorRun(
      run,
      { terminated: false, endedBy: "finished" },
      finishedAt,
    );

    expect(done.completedAt).toBe(finishedAt.toISOString());
    // An honest WORKOUTEND: 7C reads this to say "logged 4 of 4" rather
    // than "abandoned at 1".
    expect(done.terminated).toBe(false);
    // Phase LL Task 4: the new third field, stamped in the same call.
    expect(done.endedBy).toBe("finished");
    expect(done.actuals).toStrictEqual([actual1]);
    expect(loadMonitorRun()).toStrictEqual(viaJson(done));
    // A new record, the caller's own copy untouched (`recordActual`'s
    // idiom).
    expect(run.completedAt).toBeNull();
  });

  it("records a TERMINATE as terminated — the same close, a different story", () => {
    const run = freshMonitorRun();

    const done = completeMonitorRun(
      run,
      { terminated: true, endedBy: "rower" },
      finishedAt,
    );

    expect(done).toMatchObject({
      completedAt: finishedAt.toISOString(),
      terminated: true,
      endedBy: "rower",
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

    const after = completeMonitorRun(
      closed,
      { terminated: false, endedBy: "finished" },
      later,
    );

    expect(after).toBe(closed);
    expect(after.completedAt).toBe(finishedAt.toISOString());
    expect(after.terminated).toBe(true);
    // Phase LL Task 4: the guard covers the new field too — a second call
    // never stamps `endedBy` over whatever (nothing, here) the first close
    // left in place.
    expect(after.endedBy).toBeUndefined();
    expect(loadMonitorRun()).toStrictEqual(viaJson(closed));
  });

  it("a closed record refuses later actuals — completeMonitorRun is what turns the guard on", () => {
    const run = freshMonitorRun();
    saveMonitorRun(run);

    const done = completeMonitorRun(
      run,
      { terminated: false, endedBy: "finished" },
      finishedAt,
    );

    expect(recordActual(done, actual1)).toBe(done);
    expect(loadMonitorRun()?.actuals).toStrictEqual([]);
  });
});

describe("RC-1 — work and rest, summed separately at natural close (storage-spine design spec §3)", () => {
  beforeEach(() => localStorage.clear());

  const finishedAt = new Date("2026-08-05T12:41:00.000Z");

  // walk-2026-08-16/session-2-wu-4unequal.jsonl, seq 246/779/1666/2607/2981
  // — task 2's own oracle, independently re-decoded here exactly like
  // `session/summaryModel.test.ts`'s own identical fixture: work
  // 100+229+461+500+245 = 1535m (rest 0+30+22+12+0 = 64m), machine TWD
  // (the fused legacy total) 1599m exactly.
  const wu = decodeActual(
    "00 00 00 00 00 00 29 01 00 64 00 00 00 00 00 00 01 01",
    "00 00 00 18 71 00 cd 05 05 00 9b 02 27 0d 6b 00 67 01 00",
    0,
  );
  const w2 = decodeActual(
    "03 00 00 04 00 00 58 02 00 e5 00 00 1e 00 1e 00 00 02",
    "03 00 00 1b 88 84 1e 05 0e 00 43 03 e8 0e 9c 00 68 02 00",
    1,
  );
  const w3 = decodeActual(
    "00 00 00 09 00 00 b0 04 00 cd 01 00 1e 00 16 00 00 03",
    "00 00 00 1a 95 91 15 05 1c 00 4e 03 01 0f 9f 00 67 03 00",
    2,
  );
  const w4 = decodeActual(
    "0c 00 00 00 00 00 07 05 00 f4 01 00 1e 00 0c 00 01 04",
    "0c 00 00 18 96 91 07 05 1f 00 61 03 2d 0f a4 00 68 04 00",
    3,
  );
  const w5 = decodeActual(
    "70 17 00 94 09 00 58 02 00 f5 00 00 00 00 00 00 00 05",
    "70 17 00 1d 98 00 c8 04 10 00 bc 03 f3 0f bf 00 68 05 00",
    4,
  );
  const restBearingActuals = [wu, w2, w3, w4, w5];

  it("(a) the work-only discrimination pin (REAL session-2 capture): workMeters sums the WORK component only (1535m), restMeters sums the rest component only (64m) — an r0 keystone could never discriminate between the two; this rest-bearing capture does", () => {
    expect(restBearingActuals.map((a) => a.distanceMeters)).toStrictEqual([
      100, 229, 461, 500, 245,
    ]);
    expect(restBearingActuals.map((a) => a.restDistanceMeters)).toStrictEqual([
      0, 30, 22, 12, 0,
    ]);

    const run: MonitorRun = {
      ...freshMonitorRun(),
      actuals: restBearingActuals,
    };
    const done = completeMonitorRun(
      run,
      { terminated: false, endedBy: "finished" },
      finishedAt,
    );

    expect(done.workMeters).toBe(1535);
    expect(done.restMeters).toBe(64);
    // The fused legacy total (what `summaryModel.ts`'s own DISTANCE hero
    // still renders, unchanged this PR) is the sum of the two halves —
    // proving the split is a genuine decomposition, not a second,
    // independently-derived number that happens to agree.
    expect(done.workMeters! + done.restMeters!).toBe(1599);

    // workSeconds/restSeconds: summed off the SAME real bytes.
    //
    // **STATED NUMBERS, not just self-agreement (final whole-branch
    // review, recurring-failure #3: "the one place that derives the
    // number from real wire bytes asserts it against an independently-
    // computed reduce, so it agrees with itself whatever the value is and
    // never states a number").** `398.4`/`90` are re-decoded and stated
    // here as literals — matching the review's own independent decode
    // exactly — precisely BECAUSE `workSeconds` is fractional (0x0037's
    // Split/Interval Time is tenths-precision, `parse.ts:232`'s `/10`):
    // per-interval 29.7 + 60.0 + 120.0 + 128.7 + 60.0 = 398.4s work,
    // 0 + 30 + 30 + 30 + 0 = 90s rest. The `reduce` below is kept as a
    // SECOND, cross-checking assertion (not the only one), so a future
    // transcription slip in the literal fails loudly against the
    // independently-computed value too.
    expect(done.workSeconds).toBe(398.4);
    expect(done.restSeconds).toBe(90);
    const expectedWorkSeconds = restBearingActuals.reduce(
      (s, a) => s + a.elapsedSeconds,
      0,
    );
    const expectedRestSeconds = restBearingActuals.reduce(
      (s, a) => s + (a.restSeconds ?? 0),
      0,
    );
    expect(done.workSeconds).toBe(expectedWorkSeconds);
    expect(done.restSeconds).toBe(expectedRestSeconds);
  });

  it("(b) the rounding-law pin, STORED side: the four fields hold the raw, UNROUNDED sums — no `Math.round` inside `completeMonitorRun`'s own computation (only `summaryModel.ts`'s DISPLAY path rounds — see that file's own pin)", () => {
    const fractional: IntervalActual = {
      index: 0,
      elapsedSeconds: 60,
      distanceMeters: 10.4,
      avgSplit: null,
      avgSpm: null,
      avgHeartRateBpm: null,
      restDistanceMeters: 10.4,
      restSeconds: 10.4,
    };
    const run: MonitorRun = { ...freshMonitorRun(), actuals: [fractional] };
    const done = completeMonitorRun(
      run,
      { terminated: false, endedBy: "finished" },
      finishedAt,
    );

    expect(done.workMeters).toBe(10.4);
    expect(done.restMeters).toBe(10.4);
    // The two laws genuinely disagree on this input (the brief's own
    // worked example): fused-then-round is 21, split-then-round is 20 —
    // proving the distinction matters, not just documenting it.
    expect(Math.round(done.workMeters! + done.restMeters!)).toBe(21);
    expect(Math.round(done.workMeters!) + Math.round(done.restMeters!)).toBe(
      20,
    );
  });

  it("the rest pair is ALL-OR-NOTHING: one actual missing rest data omits restSeconds/restMeters from the WHOLE record — never a partial sum that silently drops that interval's real rest", () => {
    const withRest: IntervalActual = {
      ...actual1,
      restSeconds: 30,
      restDistanceMeters: 10,
    };
    // The synthesized-final fallback's own shape (`driver.ts`'s
    // `deriveFinalIntervalFromSummary` caller): work data present, rest
    // fields entirely absent — no wire reading for either.
    const noRestData: IntervalActual = {
      index: 1,
      elapsedSeconds: 100,
      distanceMeters: 400,
      avgSplit: null,
      avgSpm: null,
      avgHeartRateBpm: null,
    };
    const run: MonitorRun = {
      ...freshMonitorRun(),
      actuals: [withRest, noRestData],
    };
    const done = completeMonitorRun(
      run,
      { terminated: false, endedBy: "finished" },
      finishedAt,
    );

    // Work is unaffected — always complete, both actuals' own required
    // fields.
    expect(done.workSeconds).toBe(
      withRest.elapsedSeconds + noRestData.elapsedSeconds,
    );
    expect(done.workMeters).toBe(
      withRest.distanceMeters + noRestData.distanceMeters,
    );
    // Rest is entirely absent, NOT a partial sum of just `withRest`'s
    // 30s/10m — that number would be indistinguishable from "the second
    // interval genuinely had no rest," a silent under-count.
    expect(done.restSeconds).toBeUndefined();
    expect(done.restMeters).toBeUndefined();
  });

  it("computed ONLY for endedBy === 'finished' — a terminate/link-lost/program-failed close never gets these four fields, even with rest-complete actuals in hand", () => {
    const withRest: IntervalActual = {
      ...actual1,
      restSeconds: 30,
      restDistanceMeters: 10,
    };
    for (const endedBy of ["rower", "link-lost", "program-failed"] as const) {
      const run: MonitorRun = { ...freshMonitorRun(), actuals: [withRest] };
      const done = completeMonitorRun(
        run,
        { terminated: true, endedBy },
        finishedAt,
      );
      expect(done.workSeconds).toBeUndefined();
      expect(done.workMeters).toBeUndefined();
      expect(done.restSeconds).toBeUndefined();
      expect(done.restMeters).toBeUndefined();
    }
  });

  // Final whole-branch review, MEDIUM-1: `[].every(...)` is vacuously
  // `true`, so before this guard a `"finished"` close with EMPTY actuals
  // (the finish grace never delivering a single boundary —
  // `useMonitorSession.ts`'s own comment names this exact hardware shape,
  // "0 OF 1 INTERVALS MEASURED") wrote four honest-looking real zeroes —
  // indistinguishable from "we measured a session that covered zero
  // metres," while `summaryModel.monitorDistanceMeters`'s `> 0` rule
  // renders the SAME record as a dash. A record with nothing measured now
  // gets nothing stored.
  it("a 'finished' close with EMPTY actuals stores NONE of the four fields — never four honest-looking zeroes for a session nothing was measured of (MEDIUM-1)", () => {
    const run: MonitorRun = { ...freshMonitorRun(), actuals: [] };
    const done = completeMonitorRun(
      run,
      { terminated: false, endedBy: "finished" },
      finishedAt,
    );
    expect(done.actuals).toStrictEqual([]);
    expect(done.workSeconds).toBeUndefined();
    expect(done.workMeters).toBeUndefined();
    expect(done.restSeconds).toBeUndefined();
    expect(done.restMeters).toBeUndefined();
    expect("workSeconds" in done).toBe(false);
  });

  it("the finish-grace ordering: a run closed BEFORE its final actual arrives gets sums computed TWICE — once (incomplete but honest) at completeMonitorRun, again (complete) when recordActual accepts the late boundary — never permanently missing the interval the grace exists to catch", () => {
    const lastIndex = freshMonitorRun().program.intervals.length - 1;
    const firstActual: IntervalActual = {
      ...actual1,
      restSeconds: 30,
      restDistanceMeters: 10,
    };
    const withoutFinal: MonitorRun = {
      ...freshMonitorRun(),
      actuals: [firstActual],
    };
    const closed = completeMonitorRun(
      withoutFinal,
      { terminated: false, endedBy: "finished" },
      finishedAt,
    );
    // At close, only the one actual in hand — a real number, just an
    // incomplete one (this run's own `actuals` genuinely doesn't have the
    // final interval yet, the "desktop order"'s opposite).
    expect(closed.workMeters).toBe(firstActual.distanceMeters);
    expect(closed.restMeters).toBe(10);

    const finalActual: IntervalActual = {
      index: lastIndex,
      elapsedSeconds: 200,
      distanceMeters: 900,
      avgSplit: null,
      avgSpm: null,
      avgHeartRateBpm: null,
      restSeconds: 0,
      restDistanceMeters: 0,
    };
    const after = recordActual(closed, finalActual, { finalBoundary: true });

    expect(after.actuals).toStrictEqual([firstActual, finalActual]);
    // Re-summed over BOTH actuals now — the finish grace's own late
    // arrival is included, not permanently missing from a record that
    // closed before it landed.
    expect(after.workMeters).toBe(
      firstActual.distanceMeters + finalActual.distanceMeters,
    );
    expect(after.restMeters).toBe(10 + 0);
    expect(loadMonitorRun()).toStrictEqual(viaJson(after));
  });

  it("a late finish-grace actual arriving after a TERMINATE close never gets sums computed either — recordActual's own gate (endedBy === 'finished') mirrors completeMonitorRun's", () => {
    const lastIndex = freshMonitorRun().program.intervals.length - 1;
    const terminated: MonitorRun = {
      ...freshMonitorRun(),
      completedAt: finishedAt.toISOString(),
      terminated: true,
      endedBy: "rower",
    };
    saveMonitorRun(terminated);
    const late: IntervalActual = { ...actual1, index: lastIndex };

    const after = recordActual(terminated, late, { finalBoundary: true });

    expect(after.actuals).toStrictEqual([late]);
    expect(after.workSeconds).toBeUndefined();
    expect(after.workMeters).toBeUndefined();
    expect(after.restSeconds).toBeUndefined();
    expect(after.restMeters).toBeUndefined();
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

// F6 spec 2b, Task 1; WIDENED Phase LL Task 4 (design spec §4). `endedBy`
// started as the additive marker a rower's own "end this interrupted
// session" door (Today's row) stamps on a `MonitorRun` that never got a
// `workoutComplete`/`terminated` event from the machine at all — the phone
// was disconnected, backgrounded past recovery, or the rower simply walked
// away. Task 4 widens the SAME field to the four `CloseReason` values
// every ordinary wire-driven close now also carries (see `CloseReason`'s
// own doc comment for the full table) — `"interrupted"` keeps its
// original, unchanged meaning throughout: absent means "normal completion"
// (or "still live"); it is never inferred from `terminated` or
// `completedAt` alone, because both of those already mean something else
// (`MonitorRun`'s own doc comments on each field).
describe("endedBy: the additive close-reason marker (F6, widened Phase LL Task 4)", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips endedBy: interrupted through save/load — LEGACY value, unchanged meaning", () => {
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

  it.each(["finished", "rower", "link-lost", "program-failed"] as const)(
    "round-trips the NEW value endedBy: %s through save/load",
    (value) => {
      const run: MonitorRun = {
        ...freshMonitorRun(),
        v: 2,
        logSeed: TEST_SEED,
        completedAt: new Date("2026-08-16T10:00:00.000Z").toISOString(),
        terminated: value !== "finished",
        endedBy: value,
      };
      saveMonitorRun(run);
      const loaded = loadMonitorRun();
      expect(loaded).toStrictEqual(viaJson(run));
      expect(loaded!.endedBy).toBe(value);
    },
  );

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

  // Exit criterion 5's own words: "legacy `interrupted` rows read back
  // unchanged." A v1 record, written before EITHER this field existed at
  // all or before it widened — `logSeed` genuinely absent (the v1 shape,
  // not merely omitted from this fixture), `endedBy` its own original
  // sole possible value.
  it("a v1 LEGACY record with endedBy: interrupted (predating both logSeed and the widened union) reads back byte-identical", () => {
    const { logSeed: _drop, ...v1Shaped } = freshMonitorRun();
    const legacy = {
      ...v1Shaped,
      v: 1 as const,
      completedAt: new Date("2026-08-16T10:00:00.000Z").toISOString(),
      endedBy: "interrupted" as const,
    };
    saveMonitorRun(legacy);
    const loaded = loadMonitorRun();
    expect(loaded).toStrictEqual(viaJson(legacy));
    expect(loaded!.endedBy).toBe("interrupted");
    expect(loaded!.logSeed).toBeUndefined();
  });

  it("rejects a record whose endedBy is any other value — proves the widening did not open the gate to arbitrary strings", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, endedBy: "garbage" }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });

  it("rejects a record whose endedBy is a plausible-but-unlisted string (e.g. a future sixth value) — the validator is a closed set, not a type-only contract", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, endedBy: "reconnected" }),
    );
    expect(loadMonitorRun()).toBeNull();
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

  // Queue item 8 (F-1's instrumentation): the walk's exact shape
  // (walk-2026-08-17/README.md's F-1) — rests [0,30,30,30,0], completed
  // actuals for intervals 0/1/2 with work 60/60/120, interval 3
  // UNCOMPLETED but its own restSeconds is 30, not 0. Task 1's own fixture
  // above (`programWithRest([30, 45, 0])`) could not discriminate the
  // all-rests misread from the correct per-completed-actual reading
  // because ITS uncompleted interval carried `restSeconds: 0`, so the two
  // formulas happened to agree (the bisect's own step 2). This one does
  // not agree: the correct reading is 240 (work) + 60 (completed
  // intervals 0/1/2's own rest: 0+30+30) = 300s, matching the wire's own
  // 5-MIN computation from the walk's completed intervals. An all-rests
  // misread (summing EVERY interval's restSeconds, including the
  // uncompleted interval 3's own 30, and interval 4's 0 which never
  // completed either: 240 + 90 = 330) would round to 6 MIN
  // (`Math.round(330 / 60)` = `Math.round(5.5)` = 6) — the exact wrong
  // header the F6 walk showed. Self-mutation proof (report has the
  // before/after): temporarily summing ALL intervals' restSeconds here
  // instead of only completed ones turns this assertion red at 330, not
  // 300 — confirming this fixture actually discriminates the two
  // formulas, which Task 1's fixture could not.
  it("discriminates the walk's 6-MIN misread (F-1) from the correct 5-MIN reading: an UNCOMPLETED interval's own rest must not be summed", () => {
    const run: MonitorRun = {
      ...freshMonitorRun(),
      program: programWithRest([0, 30, 30, 30, 0]),
      actuals: [
        { ...actual1, index: 0, elapsedSeconds: 60 },
        { ...actual1, index: 1, elapsedSeconds: 60 },
        { ...actual1, index: 2, elapsedSeconds: 120 },
        // interval 3 never completed: no actual names it, and its
        // restSeconds (30, deliberately NOT 0) must not be summed.
      ],
    };
    expect(interruptedTotalSeconds(run)).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// Phase LT spec 2, Task 2. `docs/superpowers/specs/
// 2026-08-19-series-capture-design.md` §2's storage-home row (`series?`),
// §3's sacrifice ordering (`saveMonitorRun`'s own catch, `seriesDropped?`),
// §4's S4 perf probe.
// ---------------------------------------------------------------------------

function sampleSeries(count: number): SeriesData {
  const samples: Sample[] = [];
  for (let i = 0; i < count; i += 1) {
    samples.push({
      t: (i + 1) * 10,
      d: (i + 1) * 34,
      p: 500,
      spm: 24,
      hr: 150,
    });
  }
  return { samples };
}

describe("series / seriesDropped: the additive fields (§2 storage-home, never-migrate contract)", () => {
  beforeEach(() => localStorage.clear());

  it("a pre-series record round-trips exactly as before — never-migrate: no reader is forced to handle the field", () => {
    const run = freshMonitorRun();
    saveMonitorRun(run);
    const loaded = loadMonitorRun();
    expect(loaded).toStrictEqual(viaJson(run));
    expect(loaded!.series).toBeUndefined();
    expect(loaded!.seriesDropped).toBeUndefined();
  });

  it("a record WITH series (and truncated) validates and round-trips byte-identical", () => {
    const series: SeriesData = { ...sampleSeries(3), truncated: true };
    const run: MonitorRun = { ...freshMonitorRun(), series };
    saveMonitorRun(run);
    const loaded = loadMonitorRun();
    expect(loaded).toStrictEqual(viaJson(run));
    expect(loaded!.series).toStrictEqual(series);
  });

  it("a record with seriesDropped: true (and no series) validates and round-trips", () => {
    const run: MonitorRun = { ...freshMonitorRun(), seriesDropped: true };
    saveMonitorRun(run);
    const loaded = loadMonitorRun();
    expect(loaded).toStrictEqual(viaJson(run));
    expect(loaded!.seriesDropped).toBe(true);
    expect(loaded!.series).toBeUndefined();
  });

  it("both series and seriesDropped can coexist — the audit trail names a PRIOR drop, not necessarily the current write's own", () => {
    const run: MonitorRun = {
      ...freshMonitorRun(),
      series: sampleSeries(1),
      seriesDropped: true,
    };
    saveMonitorRun(run);
    expect(loadMonitorRun()).toStrictEqual(viaJson(run));
  });

  // LOW-3 (task-2 review): a malformed `series` used to discard the WHOLE
  // record — the inverse of §3's own sacrifice principle ("the run is
  // never what gets sacrificed"), applied at LOAD time instead of SAVE
  // time. It is stripped instead, and the rest of the record — every
  // field that validated fine on its own — still loads.
  it("a series that is present but malformed (not a plain record at all) is STRIPPED, not a reason to discard the run", () => {
    const run: MonitorRun = { ...freshMonitorRun(), actuals: [actual1] };
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, series: "garbage" }),
    );

    const loaded = loadMonitorRun();

    expect(loaded).not.toBeNull();
    expect(loaded!.series).toBeUndefined();
    // Everything else that validated on its own still loaded.
    expect(loaded!.workoutId).toBe(run.workoutId);
    expect(loaded!.title).toBe(run.title);
    expect(loaded!.actuals).toStrictEqual([actual1]);
    // "Kept", not "discarded": the key itself is never cleared by this
    // path — a load-time strip, not `clearMonitorRun()`.
    expect(localStorage.getItem(MONITOR_RUN_KEY)).not.toBeNull();
  });

  it("a malformed series.samples (an object, not an array) is stripped the same way, key intact", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, series: { samples: {} } }),
    );

    const loaded = loadMonitorRun();

    expect(loaded).not.toBeNull();
    expect(loaded!.series).toBeUndefined();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).not.toBeNull();
  });

  it("a record whose series is ALREADY valid (or absent) is untouched by the strip — only a malformed series is ever stripped", () => {
    const withValid: MonitorRun = {
      ...freshMonitorRun(),
      series: sampleSeries(2),
    };
    saveMonitorRun(withValid);
    expect(loadMonitorRun()!.series).toStrictEqual(withValid.series);

    localStorage.clear();
    saveMonitorRun(freshMonitorRun());
    expect(loadMonitorRun()!.series).toBeUndefined();
  });

  it("rejects a record whose seriesDropped is any value other than true", () => {
    const run = freshMonitorRun();
    localStorage.setItem(
      MONITOR_RUN_KEY,
      JSON.stringify({ ...run, seriesDropped: false }),
    );
    expect(loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });
});

describe("saveMonitorRun: the sacrifice (§3, ruling 3's own caution section)", () => {
  beforeEach(() => localStorage.clear());
  // `afterEach`, not a per-test `spy.mockRestore()` call at the tail of
  // each `it`: a `mockRestore()` placed after the assertions never runs
  // when an assertion throws first, and the un-restored spy then leaks
  // into whichever test runs next — found by this task's own self-mutation
  // exercise (removing the sacrifice retry made the FIRST test fail as
  // expected, but its now-unrestored spy silently corrupted the SECOND
  // test's own call count, and it read as a false pass instead of a second
  // failure). `afterEach` always runs, pass or fail.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a thrown write WITH series present retries WITHOUT it, and the run survives series-less with seriesDropped: true", () => {
    const run: MonitorRun = {
      ...freshMonitorRun(),
      actuals: [actual1],
      series: sampleSeries(5),
    };
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });

    // AUD-016 durable hand-off design spec §1 step 1: `:486 ->
    // "saved-without-series"` — the sacrifice retry landing.
    expect(saveMonitorRun(run)).toBe("saved-without-series");
    expect(spy).toHaveBeenCalledTimes(2);

    const survived = loadMonitorRun();
    expect(survived).not.toBeNull();
    expect(survived!.series).toBeUndefined();
    expect(survived!.seriesDropped).toBe(true);
    // Nothing else about the run was sacrificed with it — the actuals, the
    // program, the identity all made it through on the smaller write.
    expect(survived!.actuals).toStrictEqual([actual1]);
    expect(survived!.workoutId).toBe(run.workoutId);
    expect(survived!.title).toBe(run.title);
  });

  it("the retry ALSO throwing: today's odds, nothing worse — the run is unsaved, exactly as it always was before this task", () => {
    const run: MonitorRun = { ...freshMonitorRun(), series: sampleSeries(5) };
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });

    // AUD-016 durable hand-off design spec §1 step 1: `:490 -> "failed"` —
    // the sacrifice retry ALSO threw.
    expect(saveMonitorRun(run)).toBe("failed");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(loadMonitorRun()).toBeNull();
  });

  it("a record with NO series at all skips the retry outright — one throw, one failed write, no pointless second attempt", () => {
    const run = freshMonitorRun();
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });

    // AUD-016 durable hand-off design spec §1 step 1: `:479 -> "failed"` —
    // no series to sacrifice, the first throw stands.
    expect(saveMonitorRun(run)).toBe("failed");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(loadMonitorRun()).toBeNull();
  });

  it("the happy path (no throw at all) is completely unaffected: one write, series intact, seriesDropped absent", () => {
    const run: MonitorRun = { ...freshMonitorRun(), series: sampleSeries(2) };
    const spy = vi.spyOn(Storage.prototype, "setItem");

    // AUD-016 durable hand-off design spec §1 step 1: `:477 -> "saved"`.
    expect(saveMonitorRun(run)).toBe("saved");

    expect(spy).toHaveBeenCalledTimes(1);
    const loaded = loadMonitorRun();
    expect(loaded!.series).toStrictEqual(run.series);
    expect(loaded!.seriesDropped).toBeUndefined();
  });
});

describe("stashHandoffRun / takeHandoffRun / clearHandoffSlot: the AUD-016 durable hand-off slot (design spec §3)", () => {
  // Module-scope state, not localStorage — `localStorage.clear()` in this
  // file's own `beforeEach` blocks does not touch it, so each test clears
  // it explicitly to stay independent of run order.
  beforeEach(() => {
    clearHandoffSlot();
  });

  it("consume-once: takeHandoffRun returns the stashed run once, and nothing on a second call", () => {
    const run = freshMonitorRun();
    expect(stashHandoffRun(run)).toBeNull(); // empty slot, nothing superseded
    expect(takeHandoffRun()).toStrictEqual(run);
    expect(takeHandoffRun()).toBeNull();
  });

  it("supersede: a second stash before any take returns the FIRST run as superseded, and only the second is left to take", () => {
    const first = { ...freshMonitorRun(), workoutId: "id-first" };
    const second = { ...freshMonitorRun(), workoutId: "id-second" };
    expect(stashHandoffRun(first)).toBeNull();
    expect(stashHandoffRun(second)).toStrictEqual(first);
    expect(takeHandoffRun()).toStrictEqual(second);
    expect(takeHandoffRun()).toBeNull();
  });

  it("clear-on-discard: clearHandoffSlot empties the slot independently of ever consuming it", () => {
    const run = freshMonitorRun();
    stashHandoffRun(run);
    clearHandoffSlot();
    expect(takeHandoffRun()).toBeNull();
  });
});

describe("S4: the worst-case series serializes fast enough for a 30s flush cadence (§4)", () => {
  it("JSON.stringify of a 14,400-sample record completes well under 100ms", () => {
    const samples: Sample[] = Array.from(
      { length: SERIES_SAMPLE_CAP },
      (_, i) => ({
        t: (i + 1) * 10,
        d: (i + 1) * 34,
        p: Math.round(120 * 10 + (i % 40)),
        spm: 20 + (i % 10),
        hr: 130 + (i % 60),
      }),
    );
    const run: MonitorRun = {
      ...freshMonitorRun(),
      series: { samples, truncated: true },
    };

    const start = performance.now();
    const json = JSON.stringify(run);
    const elapsedMs = performance.now() - start;

    // S4's own reporting requirement: the measured number is stated in test
    // output. LOW-2 (task-2 review): `console.log` alone is swallowed by
    // vitest's console intercept in a normal run (visible only with
    // `--disableConsoleIntercept`) — the number now ALSO rides the
    // assertion's own message, so a normal failing (or `--reporter=verbose`
    // passing) run shows it without a special flag. Kept as a `console.log`
    // too: `grep`-able test output and the exact idiom S4's own check names.
    console.log(
      `S4 perf probe: JSON.stringify of a ${SERIES_SAMPLE_CAP}-sample MonitorRun took ${elapsedMs.toFixed(2)}ms`,
    );

    expect(samples).toHaveLength(SERIES_SAMPLE_CAP);
    expect(json.length).toBeGreaterThan(0);
    // LOW-2's own message argument must be a literal template directly in
    // this call — eslint-plugin-vitest's `valid-expect` only allows a
    // string/template LITERAL as the second argument, not a variable
    // reference (a pre-built label would trip `tooManyArgs`).
    expect(
      elapsedMs,
      `S4 perf probe: JSON.stringify of a ${SERIES_SAMPLE_CAP}-sample MonitorRun took ${elapsedMs.toFixed(2)}ms`,
    ).toBeLessThan(100);
  });

  // Task 4 handoff (task-2 review's own observation): S4 only measured the
  // WRITE side (`JSON.stringify`, the 30s flush's own cost). Three
  // surfaces `JSON.parse` a record up to the same ~720 KB worst case AT
  // MOUNT — `loadMonitorRun` itself (this file, below), the diagnostics
  // stash a rowed session's log screen reads, and the log detail screen's
  // own `GET /api/logs/:id` response body — and none of them had a
  // measured number. Same idiom as S4's own probe: a worst-case
  // `JSON.stringify`d record, timed on the PARSE side, the number stated
  // in both `console.log` and the assertion's own message (LOW-2's
  // reporting fix, carried over identically), a generous bound rather than
  // a tight one (this is a one-time mount cost, not a per-frame budget the
  // way S4's flush cadence is).
  it("JSON.parse of a 14,400-sample record (the mount-time cost the write-side S4 probe never measured) completes well under 100ms", () => {
    const samples: Sample[] = Array.from(
      { length: SERIES_SAMPLE_CAP },
      (_, i) => ({
        t: (i + 1) * 10,
        d: (i + 1) * 34,
        p: Math.round(120 * 10 + (i % 40)),
        spm: 20 + (i % 10),
        hr: 130 + (i % 60),
      }),
    );
    const run: MonitorRun = {
      ...freshMonitorRun(),
      series: { samples, truncated: true },
    };
    const json = JSON.stringify(run);

    const start = performance.now();
    const parsed = JSON.parse(json) as MonitorRun;
    const elapsedMs = performance.now() - start;

    console.log(
      `Parse-side perf probe: JSON.parse of a ${SERIES_SAMPLE_CAP}-sample MonitorRun took ${elapsedMs.toFixed(2)}ms`,
    );

    // Proves this actually parsed the real worst-case payload, not an
    // empty/truncated string a mistaken slice would still time quickly.
    expect(parsed.series?.samples).toHaveLength(SERIES_SAMPLE_CAP);
    expect(parsed.series?.truncated).toBe(true);
    expect(
      elapsedMs,
      `Parse-side perf probe: JSON.parse of a ${SERIES_SAMPLE_CAP}-sample MonitorRun took ${elapsedMs.toFixed(2)}ms`,
    ).toBeLessThan(100);
  });
});

describe("appendSummaryObservations: the post-close observation writer (PR 1, design spec §2)", () => {
  beforeEach(() => localStorage.clear());

  const finishedAt = new Date("2026-08-05T12:41:00.000Z");
  const totals = { workElapsedSeconds: 452, workDistanceMeters: 2000 };
  const verificationBytes: readonly number[] = [0x27, 0xd8, 0xf3, 0x6e];
  // Task 2's own fixture (RC-3, storage-spine design spec §2): the nine
  // fields 0x0039 carries beyond the work-only totals above. Every average
  // field is a distinctive non-zero/non-sentinel value on purpose — a
  // fixture that left them at a shared default could not tell "wrote the
  // right field" from "wrote a coincidence".
  const detail: MachineSummaryDetail = {
    avgStrokeRate: 26,
    endingHeartRateBpm: null,
    avgHeartRateBpm: null,
    minHeartRateBpm: null,
    maxHeartRateBpm: null,
    dragFactorAverage: 100,
    workoutType: 8,
    recoveryHeartRateBpm: null,
    avgPaceSecondsPer500m: 124,
  };

  // A realistic naturally-finished record — a v2 run (the shape a real
  // burst always lands on, `createMonitorRun`'s own "every run this
  // function builds is stamped v: 2" comment) with a real actual, closed
  // through the actual completion writer rather than a hand-built
  // `completedAt`/`endedBy` pair.
  function naturallyClosedRun(): MonitorRun {
    const run: MonitorRun = {
      ...freshMonitorRun(),
      v: 2,
      logSeed: TEST_SEED,
      actuals: [actual1],
    };
    return completeMonitorRun(
      run,
      { terminated: false, endedBy: "finished" },
      finishedAt,
    );
  }

  it("writes summaryTotals and verificationBytes onto a naturally-closed record, preserving every other field byte-for-byte", () => {
    const closed = naturallyClosedRun();

    const after = appendSummaryObservations(closed.startedAt, {
      totals,
      detail,
      verificationBytes,
    });

    expect(after).toStrictEqual({
      ...closed,
      summaryTotals: totals,
      summaryDetail: detail,
      verificationBytes,
    });
    expect(loadMonitorRun()).toStrictEqual(viaJson(after));
  });

  it("writes summaryDetail in the same single write as summaryTotals", () => {
    const closed = naturallyClosedRun();

    const next = appendSummaryObservations(closed.startedAt, {
      totals,
      detail,
      verificationBytes,
    });

    expect(next?.summaryDetail).toStrictEqual(detail);
    expect(loadMonitorRun()?.summaryDetail).toStrictEqual(detail);
  });

  it("folds totals and detail alone when the burst produced no 0x003F bytes — verificationBytes is independently optional", () => {
    const closed = naturallyClosedRun();

    const after = appendSummaryObservations(closed.startedAt, {
      totals,
      detail,
    });

    expect(after?.summaryTotals).toStrictEqual(totals);
    expect(after?.summaryDetail).toStrictEqual(detail);
    expect(after?.verificationBytes).toBeUndefined();
    expect(loadMonitorRun()?.verificationBytes).toBeUndefined();
  });

  it("returns null, writing nothing, when MONITOR_RUN_KEY is empty — the clearMonitorRun() resurrection race", () => {
    const closed = naturallyClosedRun();
    clearMonitorRun();

    const after = appendSummaryObservations(closed.startedAt, {
      totals,
      detail,
    });

    expect(after).toBeNull();
    expect(loadMonitorRun()).toBeNull();
  });

  it("returns null when the stored run's startedAt does not match — a second program() re-arm overwrote it", () => {
    const closed = naturallyClosedRun();
    const burstStartedAt = closed.startedAt;
    // A second program() call re-armed the hook with an unrelated run
    // under the same key AFTER this burst's own run had already closed —
    // the burst is now late against a record that isn't its own.
    const rearmed: MonitorRun = {
      ...freshMonitorRun(),
      v: 2,
      logSeed: TEST_SEED,
      startedAt: "2026-08-05T13:00:00.000Z",
    };
    const other = completeMonitorRun(
      rearmed,
      { terminated: false, endedBy: "finished" },
      finishedAt,
    );

    const after = appendSummaryObservations(burstStartedAt, {
      totals,
      detail,
    });

    expect(after).toBeNull();
    expect(loadMonitorRun()).toStrictEqual(viaJson(other));
  });

  it("returns null when the stored run is still live — completedAt === null", () => {
    const run: MonitorRun = { ...freshMonitorRun(), v: 2, logSeed: TEST_SEED };
    saveMonitorRun(run);

    const after = appendSummaryObservations(run.startedAt, {
      totals,
      detail,
    });

    expect(after).toBeNull();
    expect(loadMonitorRun()?.summaryTotals).toBeUndefined();
  });

  // Task 2 widens the door from "finished" alone to the complement of
  // link-lost/program-failed (spec §1 gate 1: "rower" covers BOTH venues,
  // Menu-at-the-erg and the app's End button, and the machine speaks the
  // identical burst for a Menu terminate — notes §25).
  it("admits a rower-ended run (Menu terminate / app STOP)", () => {
    const run: MonitorRun = { ...freshMonitorRun(), v: 2, logSeed: TEST_SEED };
    const done = completeMonitorRun(
      run,
      { terminated: true, endedBy: "rower" },
      finishedAt,
    );

    const after = appendSummaryObservations(done.startedAt, {
      totals,
      detail,
    });

    expect(after).not.toBeNull();
    expect(after?.summaryTotals).toStrictEqual(totals);
    expect(after?.summaryDetail).toStrictEqual(detail);
    expect(loadMonitorRun()?.summaryTotals).toStrictEqual(totals);
  });

  it("still refuses link-lost and program-failed closes", () => {
    for (const endedBy of ["link-lost", "program-failed"] as const) {
      localStorage.clear();
      const run: MonitorRun = {
        ...freshMonitorRun(),
        v: 2,
        logSeed: TEST_SEED,
      };
      const done = completeMonitorRun(
        run,
        { terminated: true, endedBy },
        finishedAt,
      );

      const after = appendSummaryObservations(done.startedAt, {
        totals,
        detail,
      });

      expect(after).toBeNull();
      expect(loadMonitorRun()?.summaryTotals).toBeUndefined();
    }
  });

  it("write-once door still keyed on summaryTotals — returns null when summaryTotals already exists, even for a second burst's own numbers", () => {
    const closed = naturallyClosedRun();
    const first = appendSummaryObservations(closed.startedAt, {
      totals,
      detail,
    });
    expect(first?.summaryTotals).toStrictEqual(totals);
    expect(first?.summaryDetail).toStrictEqual(detail);

    const differentTotals = {
      workElapsedSeconds: 999,
      workDistanceMeters: 9999,
    };
    const differentDetail: MachineSummaryDetail = {
      ...detail,
      avgStrokeRate: 30,
    };
    const second = appendSummaryObservations(closed.startedAt, {
      totals: differentTotals,
      detail: differentDetail,
    });

    expect(second).toBeNull();
    expect(loadMonitorRun()?.summaryTotals).toStrictEqual(totals);
    expect(loadMonitorRun()?.summaryDetail).toStrictEqual(detail);
  });

  it("round-trips a record carrying observations through isMonitorRun — v stays 2, no migration", () => {
    const closed = naturallyClosedRun();

    const after = appendSummaryObservations(closed.startedAt, {
      totals,
      detail,
      verificationBytes,
    });
    expect(after).not.toBeNull();

    const loaded = loadMonitorRun();

    expect(loaded).not.toBeNull();
    expect(loaded?.v).toBe(2);
    expect(loaded).toStrictEqual(viaJson(after));
  });
});
