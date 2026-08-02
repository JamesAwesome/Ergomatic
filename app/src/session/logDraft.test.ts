import { describe, it, expect } from "vitest";
import { STARTER_WORKOUTS } from "../../server/seed/starter";
import type { Baselines, Step, WorkoutType } from "../../domain/types.js";
import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import { buildDraft } from "./draft";
import { buildRun } from "./engine";
import type { SessionRun } from "./run";
import { buildLogSteps, buildManualLogSteps, logTotals } from "./logDraft";

// Realistic fixtures throughout (repo convention, CLAUDE.md's own recurring
// failure #3): every table below is a REAL starter from server/seed/starter.ts,
// not a hand-built minimum.
//   - Microburst (AN): the effort-ref fixture (ref: {effort: "max"}), 10 reps
//     of a 0.5-minute piece — the task brief's own `0:30 @ MAX` example is
//     this exact step, and (F1 review) both doors must render it identically.
//   - Jet Stream (O2): a single, non-repeated DISTANCE work step (10000m) —
//     the kept-vs-discarded stopwatch-actual fixture.
//   - Cold Front (AT): wu + a reps-marker block of 4x2000m @ 6k+1 with 5'
//     auto-rest — proves wu/rest/reps-marker never leak into the LogStep
//     list even when the workout actually has them.
//   - Doldrums (O2): wu + a reps-marker block of 2x20' @ 6k+16 with 3' rest —
//     a split-ref TIME work step, for the "completed time phase -> assumed"
//     rule (the engine never records an actuals entry for a time phase at
//     all, so this fixture needs no special-casing to hit that branch).
//   - Nor'easter (TR): three SEQUENTIAL distance steps at 2k+2 / 2k+0 / 2k-2
//     — no reps marker, and covers all three `refLabel` sign branches
//     (positive/zero/negative offset) for the manual builder.
function starter(title: string) {
  const w = STARTER_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing starter fixture: ${title}`);
  return w;
}

const BASELINES: Baselines = { k2Seconds: 100, k6Seconds: 120 };
const NOW = new Date("2026-08-02T12:00:00.000Z");

function runFor(
  title: string,
  tol: number,
  overrides: Partial<SessionRun> = {},
): SessionRun {
  const w = starter(title);
  const draft = buildDraft({
    id: `id-${title}`,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const built = buildRun(draft, BASELINES, tol, NOW);
  return { ...built, index: built.phases.length, ...overrides };
}

describe("buildLogSteps", () => {
  it("Microburst: 10 effort work phases each omit targetSplit/actualSplit/actualSource entirely (5G rule) and label carries the chip word (F1: effortFromWord inverts the frozen 'ALL OUT' back to 'MAX')", () => {
    // wu(5') + reps(10) x [w{0.5min, effort:max, spm:32, rest 2.5'}] ->
    // 1 warmup + 10*(work+rest) = 21 phases; work at positions
    // 1,3,5,7,9,11,13,15,17,19. estimationSplit(max) = baselines.k2Seconds
    // = 100 (irrelevant here — never surfaced). domain/expand.ts freezes
    // this phase's `label` as effortWord("max") = "ALL OUT";
    // effortFromWord("ALL OUT") = "max", refLabel({effort:"max"}) = "MAX".
    // duration = fmtDuration(0.5) = "0:30".
    const run = runFor("Microburst", 3, { completedAt: NOW.toISOString() });
    expect(run.phases).toHaveLength(21);
    expect(run.phases[1]).toMatchObject({ label: "ALL OUT" });
    const steps = buildLogSteps(run);
    expect(steps).toHaveLength(10);
    for (const step of steps) {
      expect(step).toStrictEqual({
        label: "0:30 @ MAX",
        spm: 32,
        seconds: 30,
      });
    }
  });

  it("F1: Microburst's effort step logs the IDENTICAL label through either door — the session door (frozen 'ALL OUT' inverted back to the chip) and the manual door (the real ref's chip directly) must never disagree about the same workout's step text", () => {
    const run = runFor("Microburst", 3, { completedAt: NOW.toISOString() });
    const runDoorLabels = buildLogSteps(run).map((s) => s.label);
    const manualDoorLabels = buildManualLogSteps(
      { steps: starter("Microburst").steps },
      BASELINES,
    ).map((s) => s.label);
    expect(runDoorLabels).toStrictEqual(manualDoorLabels);
    expect(runDoorLabels[0]).toBe("0:30 @ MAX");
  });

  it("Jet Stream: a kept stopwatch actual passes through unchanged, keeping meters (not seconds)", () => {
    // wu(5') + w{10000m @ 6k+8, spm 21} -> phases: [warmup, work]. tol=0 for
    // an exact (non-range) label: targetSplit = 120+8 = 128,
    // toleranceRange(128,0).label = fmtSplit(128) = "2:08.0". Elapsed 2500s
    // on 10000m -> splitSeconds = (2500/10000)*500 = 125.0 exactly.
    const run = runFor("Jet Stream", 0, {
      completedAt: new Date(NOW.getTime() + 2500 * 1000).toISOString(),
      actuals: {
        1: {
          elapsedSeconds: 2500,
          splitSeconds: 125,
          actualSource: "stopwatch",
        },
      },
    });
    expect(run.phases[1]).toMatchObject({ meters: 10000, targetSplit: 128 });
    const steps = buildLogSteps(run);
    expect(steps).toStrictEqual([
      {
        label: "10000 m @ 2:08.0",
        targetSplit: 128,
        actualSplit: 125,
        actualSource: "stopwatch",
        spm: 21,
        meters: 10000,
      },
    ]);
  });

  it("Jet Stream: no recorded actual on a distance phase means the split was DISCARDED — absence, not an assumed/zero value", () => {
    const run = runFor("Jet Stream", 0, {
      completedAt: new Date(NOW.getTime() + 2560 * 1000).toISOString(),
      actuals: {},
    });
    const steps = buildLogSteps(run);
    expect(steps).toStrictEqual([
      { label: "10000 m @ 2:08.0", targetSplit: 128, spm: 21, meters: 10000 },
    ]);
  });

  it("Cold Front: wu and the auto-inserted rest phases never become LogSteps, even inside a reps-marker block; kept and discarded actuals interleave correctly by position", () => {
    // wu(5') + reps(4) x [w{2000m @ 6k+1, spm 25, rest 5'}] -> 1 + 4*(work+
    // rest) = 9 phases; work at 1,3,5,7. tol=0: targetSplit = 120+1 = 121,
    // fmtSplit(121) = "2:01.0". Reps 1 & 3 (positions 1 & 5) kept:
    // 850/2000*500 = 212.5, 800/2000*500 = 200.0. Reps 2 & 4 (positions 3 &
    // 7) discarded (no actuals entry).
    const run = runFor("Cold Front", 0, {
      completedAt: new Date(NOW.getTime() + 40 * 60 * 1000).toISOString(),
      actuals: {
        1: {
          elapsedSeconds: 850,
          splitSeconds: 212.5,
          actualSource: "stopwatch",
        },
        5: {
          elapsedSeconds: 800,
          splitSeconds: 200,
          actualSource: "stopwatch",
        },
      },
    });
    expect(run.phases).toHaveLength(9);
    expect(run.phases.map((p) => p.type)).toStrictEqual([
      "warmup",
      "work",
      "rest",
      "work",
      "rest",
      "work",
      "rest",
      "work",
      "rest",
    ]);
    const label = "2000 m @ 2:01.0";
    expect(buildLogSteps(run)).toStrictEqual([
      {
        label,
        targetSplit: 121,
        actualSplit: 212.5,
        actualSource: "stopwatch",
        spm: 25,
        meters: 2000,
      },
      { label, targetSplit: 121, spm: 25, meters: 2000 },
      {
        label,
        targetSplit: 121,
        actualSplit: 200,
        actualSource: "stopwatch",
        spm: 25,
        meters: 2000,
      },
      { label, targetSplit: 121, spm: 25, meters: 2000 },
    ]);
  });

  it("Doldrums: a completed split-ref TIME phase gets actualSplit = targetSplit, actualSource 'assumed' — the engine never records a real actual for a time phase at all", () => {
    // wu(4') + reps(2) x [w{20min @ 6k+16, spm 18, rest 3'}] -> 5 phases;
    // work at 1,3. tol=0: targetSplit = 120+16 = 136, fmtSplit(136) =
    // "2:16.0", fmtDuration(20) = "20:00".
    const run = runFor("Doldrums", 0, {
      completedAt: new Date(NOW.getTime() + 46 * 60 * 1000).toISOString(),
      actuals: {},
    });
    expect(run.phases).toHaveLength(5);
    const label = "20:00 @ 2:16.0";
    expect(buildLogSteps(run)).toStrictEqual([
      {
        label,
        targetSplit: 136,
        actualSplit: 136,
        actualSource: "assumed",
        spm: 18,
        seconds: 1200,
      },
      {
        label,
        targetSplit: 136,
        actualSplit: 136,
        actualSource: "assumed",
        spm: 18,
        seconds: 1200,
      },
    ]);
  });

  it("a work phase authored with no spm omits the spm key (every real starter sets spm, per starter.ts's own header comment, so this needs a hand-built step to reach the branch)", () => {
    const draft = buildDraft({
      id: "id-no-spm",
      title: "No Spm",
      type: "O2",
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 10 },
          ref: { base: "2k", off: 0 },
        },
      ],
    });
    const run = buildRun(draft, BASELINES, 0, NOW);
    const completed: SessionRun = {
      ...run,
      index: run.phases.length,
      completedAt: new Date(NOW.getTime() + 10 * 60 * 1000).toISOString(),
    };
    expect(buildLogSteps(completed)).toStrictEqual([
      {
        label: "10:00 @ 1:40.0", // fmtSplit(100) — off 0, base 2k -> 100
        targetSplit: 100,
        actualSplit: 100,
        actualSource: "assumed",
        seconds: 600,
      },
    ]);
  });

  it("longest realistic composed label stays well under the server's 80-char bound", () => {
    // Duration text tops out at 7 chars either way: a distance phase's cap
    // is 42195m ("42195 m", domain/validate.ts's checkDuration int bound)
    // and a time phase's cap is 180 minutes = 3:00:00 (also 7 chars,
    // wholeSecond(v.minutes, SECOND, 180)). phase.label tops out on a
    // tolerance RANGE ("m:ss.t–m:ss.t", 13 chars for two 6-char fmtSplit
    // values joined by an en dash) rather than an exact split or an effort
    // word ("ALL OUT" is only 7). 7 + " @ " (3) + 13 = 23, nowhere near 80.
    const longest = `${fmtDuration(180)} @ ${fmtSplit(60)}–${fmtSplit(240)}`;
    expect(longest).toBe("3:00:00 @ 1:00.0–4:00.0");
    expect(longest.length).toBeLessThanOrEqual(80);
    expect(longest.length).toBe(23);
  });
});

describe("buildManualLogSteps", () => {
  it("Microburst: an authored effort step resolves to the ref chip 'MAX' (F1: now identical to the session door's label — see the both-doors equality test above), omitting targetSplit/actualSplit/actualSource", () => {
    const w = starter("Microburst");
    const steps = buildManualLogSteps({ steps: w.steps }, BASELINES);
    expect(steps).toHaveLength(10);
    for (const step of steps) {
      expect(step).toStrictEqual({ label: "0:30 @ MAX", spm: 32, seconds: 30 });
    }
  });

  it("Cold Front: a reps-expanded distance split ref resolves at CURRENT baselines, all actuals 'assumed' at the same value as targetSplit", () => {
    // 4x2000m @ 6k+1: resolveSplit(120, +1) = 121, refLabel({base:"6k",
    // off:1}) = "6k +1" (off > 0 -> "+1").
    const w = starter("Cold Front");
    const steps = buildManualLogSteps({ steps: w.steps }, BASELINES);
    expect(steps).toHaveLength(4);
    for (const step of steps) {
      expect(step).toStrictEqual({
        label: "2000 m @ 6k +1",
        targetSplit: 121,
        actualSplit: 121,
        actualSource: "assumed",
        spm: 25,
        meters: 2000,
      });
    }
  });

  it("Doldrums: a reps-expanded time split ref keeps `seconds`, not `meters`", () => {
    // 2x20' @ 6k+16: resolveSplit(120, +16) = 136.
    const w = starter("Doldrums");
    const steps = buildManualLogSteps({ steps: w.steps }, BASELINES);
    expect(steps).toHaveLength(2);
    for (const step of steps) {
      expect(step).toStrictEqual({
        label: "20:00 @ 6k +16",
        targetSplit: 136,
        actualSplit: 136,
        actualSource: "assumed",
        spm: 18,
        seconds: 1200,
      });
    }
  });

  it("Nor'easter: no reps marker, three sequential steps cover all three refLabel sign branches (+2, ±0, -2)", () => {
    const w = starter("Nor'easter");
    const steps = buildManualLogSteps({ steps: w.steps }, BASELINES);
    expect(steps).toStrictEqual([
      {
        label: "750 m @ 2k +2",
        targetSplit: 102, // 100 + 2
        actualSplit: 102,
        actualSource: "assumed",
        spm: 25,
        meters: 750,
      },
      {
        label: "750 m @ 2k",
        targetSplit: 100, // off 0 -> refLabel drops the sign entirely
        actualSplit: 100,
        actualSource: "assumed",
        spm: 26,
        meters: 750,
      },
      {
        label: "500 m @ 2k −2", // U+2212 MINUS SIGN, matching refLabel/StepRow's convention
        targetSplit: 98, // 100 - 2
        actualSplit: 98,
        actualSource: "assumed",
        spm: 28,
        meters: 500,
      },
    ]);
  });

  it("wu/rest steps in an authored workout (not just a reps-expanded run) never produce a LogStep", () => {
    const steps: Step[] = [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "2k", off: 0 },
      },
      { k: "r", minutes: 2 },
    ];
    expect(buildManualLogSteps({ steps }, BASELINES)).toHaveLength(1);
  });
});

describe("logTotals", () => {
  it("Doldrums: dateLabel is the house 'JUL 25' format read from completedAt, totalMinutes is the REAL wall-clock length rounded to the nearest minute", () => {
    // completedAt = startedAt + 46 real minutes (2760s) -> round(2760/60) =
    // 46 exactly, not the workout's PROGRAMMED length (4 + 2*(20+3) = 50
    // minutes) — a real session can run long or short of its own estimate,
    // and the Log screen is recording what happened, not the plan.
    const run = runFor("Doldrums", 0, {
      completedAt: new Date(NOW.getTime() + 46 * 60 * 1000).toISOString(),
    });
    expect(logTotals(run)).toStrictEqual({
      dateLabel: "AUG 2",
      totalMinutes: 46,
    });
  });

  it("rounds a fractional minute to the nearest whole minute", () => {
    const run = runFor("Jet Stream", 0, {
      completedAt: new Date(NOW.getTime() + 90 * 1000).toISOString(), // 1.5 min
    });
    expect(logTotals(run).totalMinutes).toBe(2); // round(1.5) -> 2
  });

  it("an incomplete run (completedAt null) reads as 0 minutes and falls back to startedAt for the date, never reading the system clock", () => {
    const run = runFor("Jet Stream", 0, { completedAt: null });
    expect(logTotals(run)).toStrictEqual({
      dateLabel: "AUG 2", // NOW itself, run.startedAt === NOW.toISOString()
      totalMinutes: 0,
    });
  });
});
