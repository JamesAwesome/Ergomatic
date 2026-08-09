import { describe, it, expect } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Baselines, Step, WorkoutType } from "../../domain/types.js";
import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import { compileProgram } from "../../domain/monitor/program.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { IntervalActual } from "../../domain/monitor/types.js";
import { buildDraft, withNudge } from "./draft";
import type { SessionDraft } from "./draft";
import { buildRun } from "./engine";
import type { SessionRun } from "./run";
import type { MonitorRun } from "../monitor/monitorRun.js";
import {
  buildLogSeed,
  buildLogSteps,
  buildManualLogSteps,
  buildMonitorLogSteps,
  logTotals,
  MonitorLogSeedError,
  MONITOR_HR_MIN,
  MONITOR_HR_MAX,
  MONITOR_SPLIT_MAX,
  MONITOR_SPM_MIN,
  MONITOR_SPM_MAX,
} from "./logDraft";

// Realistic fixtures throughout (repo convention, CLAUDE.md's own recurring
// failure #3): every table below is a REAL library workout from
// server/seed/library/index.ts, not a hand-built minimum.
//   - Fork Lightning (AN): the effort-ref fixture (ref: {effort: "max"}), 10
//     reps of a 0.5-minute piece — the task brief's own `0:30 @ MAX` example
//     is this exact step, and (F1/F1b review) both doors must render it
//     identically.
//   - Calm Sea (O2): a single, non-repeated DISTANCE work step (10000m) — the
//     kept-vs-discarded stopwatch-actual fixture, and (F1b) the
//     mismatched/no-draft fallback fixture. (Meltemi used to hold this role;
//     the library rewrite turned it into a 5-phase TIME workout with no
//     distance step at all, so this suite re-anchored to Calm Sea — same
//     10,000 m distance, matching draft.test.ts/engine.test.ts.)
//   - Filling Low (AT): wu + a reps-marker block of 3x2000m @ 6k+4 with 3'
//     auto-rest — proves wu/rest/reps-marker never leak into the LogStep
//     list even when the workout actually has them.
//   - Hoarfrost (O2): wu + a reps-marker block of 2x12' @ 6k+12 with 5' rest —
//     a split-ref TIME work step, for the "completed time phase -> assumed"
//     rule (the engine never records an actuals entry for a time phase at
//     all, so this fixture needs no special-casing to hit that branch).
//   - Cross Sea (TR): four SEQUENTIAL distance steps at 2k+4 / 2k+2 / 2k+0 /
//     2k-2 — no reps marker, covers all three `refLabel` sign branches
//     (positive/zero/negative) for the manual builder. (Falkland Current
//     used to hold this role with exactly three steps at 2k+2/2k+0/2k-2; the
//     rewrite turned it into a single step repeated x4 via a reps marker, so
//     this suite re-anchored to Cross Sea, the closest equivalent shape.)
//   - Gyre (TR): three SEQUENTIAL distance steps at 2k+5 / 2k+3 / 2k+1, no
//     reps marker, rest after the first two but none after the third — the
//     (F1b) removed-step draft-lookup fixture. (Also re-anchored off Falkland
//     Current for the same reason as Cross Sea above.)
function library(title: string) {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  return w;
}

// The real library workout's own work step, verbatim — same idiom
// SessionComplete.test.tsx's `completeDraftAndRun` already established
// (find a real step, reuse the object, never retype its fields by hand) —
// used below to assemble a custom multi-kind draft out of genuine library
// step shapes rather than a hand-invented one.
function workStepFrom(title: string): Extract<Step, { k: "w" }> {
  const step = library(title).steps.find((s) => s.k === "w");
  if (!step || step.k !== "w") {
    throw new Error(`no work step in ${title}`);
  }
  return step;
}

const BASELINES: Baselines = { k2Seconds: 100, k6Seconds: 120 };
const NOW = new Date("2026-08-02T12:00:00.000Z");

function runFor(
  title: string,
  overrides: Partial<SessionRun> = {},
): { draft: SessionDraft; run: SessionRun } {
  const w = library(title);
  const draft = buildDraft({
    id: `id-${title}`,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const built = buildRun(draft, BASELINES, NOW);
  return { draft, run: { ...built, index: built.phases.length, ...overrides } };
}

describe("buildLogSteps", () => {
  it("Fork Lightning: 10 effort work phases each omit targetSplit/actualSplit/actualSource entirely (5G rule); label carries the chip word straight from the draft's real ref (F1b's primary, draft-based path)", () => {
    // wu(5') + reps(5) x [w1{0.5min, effort:max, spm:32, rest .75'} +
    // w2{0.5min, effort:max, spm:32, rest 2.25'}] -> 1 warmup + 5*(w1+r1+w2+
    // r2) = 21 phases; work at positions 1,3,5,7,9,11,13,15,17,19. Both
    // authored "w" steps carry the identical effort ref/spm/duration, so
    // every work phase's LogStep is identical even though originalIndex
    // alternates between the two (2 and 3). estimationSplit(max) =
    // baselines.k2Seconds = 100 (irrelevant here — never surfaced). ref
    // {effort:"max"} -> refLabel = "MAX". duration = fmtDuration(0.5) =
    // "0:30".
    const { draft, run } = runFor("Fork Lightning", {
      completedAt: NOW.toISOString(),
    });
    expect(run.phases).toHaveLength(21);
    expect(run.phases[1]).toMatchObject({ originalIndex: 2 });
    const steps = buildLogSteps(run, draft);
    expect(steps).toHaveLength(10);
    for (const step of steps) {
      expect(step).toStrictEqual({
        label: "0:30 @ MAX",
        spm: 32,
        seconds: 30,
      });
    }
  });

  it("F1: Fork Lightning's effort step logs the IDENTICAL label through either door", () => {
    const { draft, run } = runFor("Fork Lightning", {
      completedAt: NOW.toISOString(),
    });
    const runDoorLabels = buildLogSteps(run, draft).map((s) => s.label);
    const manualDoorLabels = buildManualLogSteps(
      { steps: library("Fork Lightning").steps },
      BASELINES,
    ).map((s) => s.label);
    expect(runDoorLabels).toStrictEqual(manualDoorLabels);
    expect(runDoorLabels[0]).toBe("0:30 @ MAX");
  });

  it("F1b: a mixed split+effort+distance workout logs BYTE-IDENTICAL labels through either door, for every step — not just the effort case F1 originally fixed", () => {
    // A custom draft assembled from three real library workouts' own work
    // steps (SessionComplete.test.tsx's established pattern: reuse the real
    // step object, never hand-retype it) — no single library workout mixes
    // all three kinds, so this is the realistic way to exercise all three
    // in one workout: Hoarfrost's split TIME step (12' @ 6k+12), Fork
    // Lightning's EFFORT step (0.5' @ MAX), Filling Low's split DISTANCE
    // step (2000m @ 6k+4). No reps marker, so each appears exactly once.
    const steps: Step[] = [
      { k: "wu", minutes: 5 },
      workStepFrom("Hoarfrost"),
      workStepFrom("Fork Lightning"),
      workStepFrom("Filling Low"),
    ];
    const draft = buildDraft({
      id: "id-mixed",
      title: "Mixed Kinds",
      type: "AT",
      steps,
    });
    const built = buildRun(draft, BASELINES, NOW);
    // 1 warmup + (work+rest)*3 (every source step carries its own
    // restMinutes) = 7 phases; work at 1, 3, 5.
    expect(built.phases).toHaveLength(7);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: NOW.toISOString(),
    };
    const runDoorLabels = buildLogSteps(run, draft).map((s) => s.label);
    const manualDoorLabels = buildManualLogSteps(
      { steps: draft.steps },
      BASELINES,
    ).map((s) => s.label);
    expect(runDoorLabels).toStrictEqual(manualDoorLabels);
    expect(runDoorLabels).toStrictEqual([
      "12:00 @ 6k +12",
      "0:30 @ MAX",
      "2000 m @ 6k +4",
    ]);
  });

  it("F1b: a removed step doesn't shift the surviving phases' draft lookup — indexing is by originalIndex, not position, so it survives a removed sibling", () => {
    // Gyre: wu(0) + w1(1, 750m@2k+5, rest 2') + w2(2, 500m@2k+3, rest 2') +
    // w3(3, 250m@2k+1, no rest), no reps marker. Removing w2 (index 2) must
    // not shift w3's lookup down to index 2 (w2's OWN ref) — it has to
    // stay 3.
    const gyre = library("Gyre");
    const draft: SessionDraft = {
      ...buildDraft({
        id: "id-removed",
        title: gyre.title,
        type: gyre.type as WorkoutType,
        steps: gyre.steps,
      }),
      removed: [2],
    };
    const built = buildRun(draft, BASELINES, NOW);
    expect(built.phases.map((p) => p.type)).toStrictEqual([
      "warmup",
      "work",
      "rest",
      "work",
    ]);
    // The surviving work phases keep their TRUE draft indices (1 and 3),
    // skipping the removed step's index (2) entirely — this is what
    // proves the draft lookup below reads the right step, not just
    // "whichever step happens to still be at that position."
    expect(built.phases.map((p) => p.originalIndex)).toStrictEqual([
      0, 1, 1, 3,
    ]);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: NOW.toISOString(),
    };
    expect(buildLogSteps(run, draft).map((s) => s.label)).toStrictEqual([
      "750 m @ 2k +5", // w1 (index 1) — untouched by w2's removal
      "250 m @ 2k +1", // w3 (index 3) — NOT w2's "500 m @ 2k +3" (index 2)
    ]);
  });

  it("F2: a nudged step's label folds the nudge into its offset, so label + targetSplit + the PACES LOCKED reconstruction all agree — the reviewer's own fractional-baseline fixture", () => {
    // Fractional baseline (112.3) deliberately, not a round number — proves
    // this is real floating-point arithmetic being reconciled, not two
    // integers that happen to agree by coincidence.
    const baselines: Baselines = { k2Seconds: 112.3, k6Seconds: 120 };
    const draft = buildDraft({
      id: "id-nudge-fixture",
      title: "Nudge Fixture",
      type: "AT",
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "2k", off: 5 },
        },
      ],
    });
    const nudged = withNudge(draft, 0, 2); // +2s confirm-time nudge
    const built = buildRun(nudged, baselines, NOW);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: NOW.toISOString(),
    };
    // targetSplit = baselines.k2Seconds + off + nudge = 112.3 + 5 + 2 =
    // 119.3 (engine.ts's own math, via effectiveSteps folding the nudge
    // into ref.off before resolving) — the label's own offset (+7, not the
    // raw authored +5) is what makes 112.3 + 7 = 119.3 reconcile; the
    // pre-fix label ("2k +5") would have implied 112.3 + 5 = 117.3,
    // permanently disagreeing with the stored split once logged.
    const steps = buildLogSteps(run, nudged);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.label).toBe("3:00 @ 2k +7");
    expect(steps[0]!.targetSplit).toBeCloseTo(119.3, 9);
  });

  // Must-fix minor (whole-branch review): the F2 fixture above nudges the
  // ONLY work step in its workout (`originalIndex` 0), which is also
  // `run.phases`' own POSITION 0 for that phase — arithmetically correct
  // (hand-verified by the reviewer), but a fixture where `originalIndex`
  // and position always coincide can't distinguish "keyed by originalIndex"
  // from "keyed by position" — a regression that swapped `phase
  // .originalIndex` for the loop's own `i` in `withEffectiveOff`'s caller
  // would still pass it. This fixture puts a phase BEFORE the nudged one:
  // the first work step's own `restMinutes` auto-inserts a rest phase
  // straight after it (`domain/expand.ts`'s "case w"), so the nudged
  // SECOND step sits at `run.phases` POSITION 2 while its `originalIndex`
  // (a position in `draft.steps`, which has no rest entries at all) is
  // still 1 — a genuine, asserted misalignment, not just a comment's claim.
  it("F2: the nudge lookup keys by originalIndex, not run.phases position — a preceding phase (plus its own auto-inserted rest) shifts them apart", () => {
    const baselines: Baselines = { k2Seconds: 112.3, k6Seconds: 120 };
    const draft = buildDraft({
      id: "id-nudge-fixture-preceded",
      title: "Nudge Fixture (preceded)",
      type: "AT",
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 2 },
          ref: { base: "6k", off: 3 },
          restMinutes: 1,
        },
        {
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "2k", off: 5 },
        },
      ],
    });
    const nudged = withNudge(draft, 1, 2); // +2s confirm-time nudge on originalIndex 1
    const built = buildRun(nudged, baselines, NOW);
    // The misalignment this fixture depends on, asserted directly: the
    // nudged step is `run.phases[2]` (after the first work phase and its
    // auto-inserted rest at positions 0/1) but `draft.steps[1]`.
    expect(built.phases).toHaveLength(3);
    expect(built.phases[2]!.originalIndex).toBe(1);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: NOW.toISOString(),
    };
    const steps = buildLogSteps(run, nudged);
    expect(steps).toHaveLength(2); // the rest phase never becomes a LogStep
    // Same reconciliation as the F2 fixture above: 112.3 + 5 + 2 = 119.3,
    // and the label's own offset (+7) is what makes that number honest.
    expect(steps[1]!.label).toBe("3:00 @ 2k +7");
    expect(steps[1]!.targetSplit).toBeCloseTo(119.3, 9);
  });

  it("F2: the both-doors equality fixture itself stays nudge-free — buildManualLogSteps has no nudges to fold, by construction (no draft, no confirm step, for an off-app row)", () => {
    // Regression guard for the fix round's own scope note: F2 only touches
    // buildLogSteps' draft-matched path. Re-runs the existing Fork
    // Lightning mixed-kind equality straight from this file's own
    // (see the "F1b: a mixed split+effort+distance workout" test above) to
    // confirm it's untouched by this fix round — asserted again here,
    // colocated with F2's own tests, rather than only trusting the older
    // test not to have silently started disagreeing.
    const hoarfrost = library("Hoarfrost");
    const splitWork = hoarfrost.steps.find((s) => s.k === "w") as Extract<
      Step,
      { k: "w" }
    >;
    const draft = buildDraft({
      id: "id-f2-manual-equality",
      title: hoarfrost.title,
      type: hoarfrost.type as WorkoutType,
      steps: [splitWork],
    });
    // No withNudge call at all — draft.nudges stays `{}`.
    const built = buildRun(draft, BASELINES, NOW);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: NOW.toISOString(),
    };
    const runDoorLabel = buildLogSteps(run, draft)[0]!.label;
    const manualDoorLabel = buildManualLogSteps(
      { steps: [splitWork] },
      BASELINES,
    )[0]!.label;
    expect(runDoorLabel).toBe(manualDoorLabel);
  });

  it("Calm Sea: a kept stopwatch actual passes through unchanged, keeping meters (not seconds)", () => {
    // wu(8') + w{10000m @ 6k+12, spm 20} -> phases: [warmup, work]. draft's
    // real ref {base:"6k", off:12} -> refLabel "6k +12". Elapsed 2500s on
    // 10000m -> splitSeconds = (2500/10000)*500 = 125.0 exactly.
    const { draft, run } = runFor("Calm Sea", {
      completedAt: new Date(NOW.getTime() + 2500 * 1000).toISOString(),
      actuals: {
        1: {
          elapsedSeconds: 2500,
          splitSeconds: 125,
          actualSource: "stopwatch",
        },
      },
    });
    expect(run.phases[1]).toMatchObject({ meters: 10000, targetSplit: 132 });
    const steps = buildLogSteps(run, draft);
    expect(steps).toStrictEqual([
      {
        label: "10000 m @ 6k +12",
        targetSplit: 132,
        actualSplit: 125,
        actualSource: "stopwatch",
        spm: 20,
        meters: 10000,
      },
    ]);
  });

  it("Calm Sea: no recorded actual on a distance phase means the split was DISCARDED — absence, not an assumed/zero value", () => {
    const { draft, run } = runFor("Calm Sea", {
      completedAt: new Date(NOW.getTime() + 2560 * 1000).toISOString(),
      actuals: {},
    });
    const steps = buildLogSteps(run, draft);
    expect(steps).toStrictEqual([
      { label: "10000 m @ 6k +12", targetSplit: 132, spm: 20, meters: 10000 },
    ]);
  });

  it("Filling Low: wu and the auto-inserted rest phases never become LogSteps, even inside a reps-marker block; kept and discarded actuals interleave correctly by position", () => {
    // wu(8') + reps(3) x [w{2000m @ 6k+4, spm 22, rest 3'}] -> 1 + 3*(work+
    // rest) = 7 phases; work at 1,3,5. draft's real ref {base:"6k",
    // off:4} -> refLabel "6k +4" for every occurrence (same authored step,
    // repeated by the reps marker — originalIndex is identical for all 3).
    // Reps 1 & 3 (positions 1 & 5) kept: 850/2000*500 = 212.5,
    // 800/2000*500 = 200.0. Rep 2 (position 3) discarded (no actuals
    // entry).
    const { draft, run } = runFor("Filling Low", {
      completedAt: new Date(NOW.getTime() + 35 * 60 * 1000).toISOString(),
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
    expect(run.phases).toHaveLength(7);
    expect(run.phases.map((p) => p.type)).toStrictEqual([
      "warmup",
      "work",
      "rest",
      "work",
      "rest",
      "work",
      "rest",
    ]);
    const label = "2000 m @ 6k +4";
    expect(buildLogSteps(run, draft)).toStrictEqual([
      {
        label,
        targetSplit: 124,
        actualSplit: 212.5,
        actualSource: "stopwatch",
        spm: 22,
        meters: 2000,
      },
      { label, targetSplit: 124, spm: 22, meters: 2000 },
      {
        label,
        targetSplit: 124,
        actualSplit: 200,
        actualSource: "stopwatch",
        spm: 22,
        meters: 2000,
      },
    ]);
  });

  it("Hoarfrost: a completed split-ref TIME phase gets actualSplit = targetSplit, actualSource 'assumed' — the engine never records a real actual for a time phase at all", () => {
    // wu(6') + reps(2) x [w{12min @ 6k+12, spm 22, rest 5'}] -> 5 phases;
    // work at 1,3. draft's real ref {base:"6k", off:12} -> refLabel
    // "6k +12"; fmtDuration(12) = "12:00".
    const { draft, run } = runFor("Hoarfrost", {
      completedAt: new Date(NOW.getTime() + 46 * 60 * 1000).toISOString(),
      actuals: {},
    });
    expect(run.phases).toHaveLength(5);
    const label = "12:00 @ 6k +12";
    expect(buildLogSteps(run, draft)).toStrictEqual([
      {
        label,
        targetSplit: 132,
        actualSplit: 132,
        actualSource: "assumed",
        spm: 22,
        seconds: 720,
      },
      {
        label,
        targetSplit: 132,
        actualSplit: 132,
        actualSource: "assumed",
        spm: 22,
        seconds: 720,
      },
    ]);
  });

  it("a work phase authored with no spm omits the spm key (every real library workout sets spm on every work step, so this needs a hand-built step to reach the branch)", () => {
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
    const run = buildRun(draft, BASELINES, NOW);
    const completed: SessionRun = {
      ...run,
      index: run.phases.length,
      completedAt: new Date(NOW.getTime() + 10 * 60 * 1000).toISOString(),
    };
    expect(buildLogSteps(completed, draft)).toStrictEqual([
      {
        label: "10:00 @ 2k", // off 0 -> refLabel drops the sign entirely
        targetSplit: 100,
        actualSplit: 100,
        actualSource: "assumed",
        seconds: 600,
      },
    ]);
  });

  describe("fallback path (no usable draft — module header's FALLBACK paragraph)", () => {
    it("draft null: an effort phase STILL reaches the chip via effortFromWord's inverse (F1's original fix, still load-bearing when there is truly no draft)", () => {
      const { run } = runFor("Fork Lightning", {
        completedAt: NOW.toISOString(),
      });
      const steps = buildLogSteps(run, null);
      expect(steps).toHaveLength(10);
      for (const step of steps) {
        expect(step).toStrictEqual({
          label: "0:30 @ MAX",
          spm: 32,
          seconds: 30,
        });
      }
    });

    // Ui-fix round Task 2 fix round, F1b: since `EnginePhase` now carries
    // the effective `ref` (`domain/expand.ts`'s own `case "w"`), a
    // split-ref phase built through the normal `buildRun` path reconstructs
    // through `refPaceLabel` in the fallback too — the SAME chip the
    // preferred (draft-based) path would have composed for this exact
    // step, "10000 m @ 6k +12" (Calm Sea: `{base:"6k", off:12}`), not the
    // old "10000 m @ 2:12.0" resolved-split text. That old behavior only
    // survives for a genuinely LEGACY run with no `ref` field at all — see
    // the dedicated describe block below.
    it("draft null: a split-ref phase reconstructs the SAME ref chip the preferred path would have (byte-identical, not the old resolved-split fallback)", () => {
      const { run } = runFor("Calm Sea", {
        completedAt: new Date(NOW.getTime() + 2560 * 1000).toISOString(),
        actuals: {},
      });
      expect(buildLogSteps(run, null)).toStrictEqual([
        { label: "10000 m @ 6k +12", targetSplit: 132, spm: 20, meters: 10000 },
      ]);
    });

    it('a mismatched/stale draft (originalIndex doesn\'t land on a real "w" step) falls back safely to the SAME ref chip instead of crashing or mislabeling', () => {
      const { run } = runFor("Calm Sea", {
        completedAt: new Date(NOW.getTime() + 2560 * 1000).toISOString(),
        actuals: {},
      });
      // A draft that does NOT match this run at all: its steps[1] (the
      // index Calm Sea's work phase's originalIndex points at) is a
      // second warm-up, not a "w" step — draftWorkStep must return
      // undefined here, not throw, not silently mislabel. Falls all the
      // way through to the `phase.ref` branch, same as the draft-null case
      // above (a mismatched draft is just as "no real draftStep" as none).
      const wrongDraft = buildDraft({
        id: "id-wrong",
        title: "Wrong Draft",
        type: "O2",
        steps: [
          { k: "wu", minutes: 5 },
          { k: "wu", minutes: 3 },
        ],
      });
      expect(buildLogSteps(run, wrongDraft)).toStrictEqual([
        { label: "10000 m @ 6k +12", targetSplit: 132, spm: 20, meters: 10000 },
      ]);
    });

    // Q2 (fix round 1): the explicit byte-equality pin the finding asked
    // for — the SAME run's SAME split-ref phase, labeled once through the
    // preferred (real-draft) path and once through the fallback
    // (draft-null) path, must produce the identical string. Hoarfrost (not
    // Calm Sea) here so this also exercises a TIME-kind work step with an
    // embedded rest — a different shape than the distance fixture above,
    // same guarantee.
    it("preferred and fallback paths compose byte-identical labels for the same split-ref phase", () => {
      const { draft, run } = runFor("Hoarfrost", {
        completedAt: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
      });
      const viaDraft = buildLogSteps(run, draft);
      const viaFallback = buildLogSteps(run, null);
      const splitPhaseIndex = run.phases.findIndex(
        (p) => p.type === "work" && p.targetKind === "split",
      );
      expect(splitPhaseIndex).toBeGreaterThanOrEqual(0);
      // Hoarfrost's reps marker (x2) repeats its one work step, so
      // `run.phases` carries TWO work occurrences — but both come from the
      // SAME authored step (same `originalIndex`, same `ref`), so the
      // FIRST LogStep entry on both sides already proves the point; no
      // need to check the second occurrence too.
      expect(viaDraft[0]!.label).toBe(viaFallback[0]!.label);
      expect(viaDraft[0]!.label).toBe("12:00 @ 6k +12");
    });
  });

  // Q3 (fix round 1): a `v:1` SessionRun written before this task shipped
  // the `ref` field has phases with NO `ref` at all — `EnginePhase`'s own
  // type marks it optional precisely so an old stored record (which
  // `isSessionRun`'s loose load-time validation admits — it only checks
  // `v`/`phases` is-an-array/etc., never per-phase shape) still loads
  // without crashing. This is the ONE case that still hits the true
  // "nothing to reconstruct from" fallback branch.
  describe("legacy pre-ref SessionRun (Q3: a v:1 run frozen before Phase.ref existed)", () => {
    it("draft null, phase.ref absent: keeps the phase's own frozen label verbatim, band string and all", () => {
      const { run } = runFor("Calm Sea", {
        completedAt: new Date(NOW.getTime() + 2560 * 1000).toISOString(),
        actuals: {},
      });
      // Simulates a record written by the pre-Task-2 code: `label` is the
      // old tolerance-band string (`toleranceRange(132, 1)` -> "2:11.0–
      // 2:13.0"), and `ref` is simply absent — not undefined-but-present,
      // genuinely missing, the same shape `JSON.parse`ing an old stored
      // record would produce. `run.phases[1]` is Calm Sea's own work
      // phase (`[0]` is the warm-up, which never produces a LogStep).
      const legacyPhase = { ...run.phases[1]! };
      delete (legacyPhase as { ref?: unknown }).ref;
      legacyPhase.label = "2:11.0–2:13.0";
      const legacyRun = { ...run, phases: [legacyPhase] };
      expect(buildLogSteps(legacyRun, null)).toStrictEqual([
        {
          label: "10000 m @ 2:11.0–2:13.0",
          targetSplit: 132,
          spm: 20,
          meters: 10000,
        },
      ]);
    });
  });

  // IMP-1 (whole-branch review): the dead end this fixes — a workout whose
  // ONLY qualifying step is a `{k:"test"}` piece used to produce
  // `buildLogSteps(...) === []`, which the server hard-400s on ("steps must
  // be a non-empty array"), with no recovery on the session door but its
  // destructive Discard. These tests prove the fix directly: a test phase
  // now always contributes a bare-label `LogStep`.
  describe("IMP-1: a test step now becomes a bare-label LogStep instead of being skipped", () => {
    it("a workout whose ONLY qualifying step is a test piece no longer builds steps: [] — it builds exactly one bare-label LogStep", () => {
      const draft = buildDraft({
        id: "id-test-only",
        title: "Test Only",
        type: "O2",
        steps: [{ k: "test", label: "2k test" }],
      });
      const built = buildRun(draft, BASELINES, NOW);
      const run: SessionRun = {
        ...built,
        index: built.phases.length,
        completedAt: NOW.toISOString(),
      };
      // This is the exact shape that used to hard-400 at the server
      // (server/routes/data.ts's "steps must be a non-empty array" rule).
      expect(buildLogSteps(run, draft)).toStrictEqual([{ label: "2k test" }]);
    });

    it("a test step mixed with a real work step keeps the draft's own ORIGINAL label ('6k test'), not the phase's frozen generic 'All out'", () => {
      const calmSea = library("Calm Sea");
      const distanceWork = calmSea.steps.find((s) => s.k === "w") as Extract<
        Step,
        { k: "w" }
      >;
      const draft = buildDraft({
        id: "id-test-mixed",
        title: "Test Mixed",
        type: "O2",
        steps: [{ k: "test", label: "6k test" }, distanceWork],
      });
      const built = buildRun(draft, BASELINES, NOW);
      const run: SessionRun = {
        ...built,
        index: built.phases.length,
        completedAt: NOW.toISOString(),
        actuals: {},
      };
      const steps = buildLogSteps(run, draft);
      expect(steps).toHaveLength(2);
      expect(steps[0]).toStrictEqual({ label: "6k test" });
      // The real work step is unaffected by the test step's presence —
      // same chip-idiom label ("6k +12") this file's other draft-based
      // tests already pin.
      expect(steps[1]!.label).toBe("10000 m @ 6k +12");
      expect(steps[1]!.targetSplit).toBe(132);
    });

    it("with no draft at all, a test phase falls back to its own frozen 'All out' label rather than crashing", () => {
      const draft = buildDraft({
        id: "id-test-only-fallback",
        title: "Test Only",
        type: "O2",
        steps: [{ k: "test", label: "2k test" }],
      });
      const built = buildRun(draft, BASELINES, NOW);
      const run: SessionRun = {
        ...built,
        index: built.phases.length,
        completedAt: NOW.toISOString(),
      };
      expect(buildLogSteps(run, null)).toStrictEqual([{ label: "All out" }]);
    });
  });

  it("longest realistic composed label stays well under the server's 80-char bound", () => {
    // Duration text tops out at 7 chars either way: a distance phase's cap
    // is 42195m ("42195 m", domain/validate.ts's checkDuration int bound)
    // and a time phase's cap is 180 minutes = 3:00:00 (also 7 chars,
    // wholeSecond(v.minutes, SECOND, 180)). The FALLBACK path's split-ref
    // text (the only one left that can run long, now that the primary
    // draft-based path uses the short `refLabel` chip — "6k -60" tops out
    // at 6 chars, off bound ±60 per domain/validate.ts's checkRef) is now
    // an EXACT `fmtSplit` value (ui-fix round, Item 1: domain/expand.ts's
    // own label stopped being a "lo–hi" tolerance-range string), topping
    // out at 6 chars for a split at the app's own MIN/MAX_SPLIT bound
    // (`you/baselineDraft.ts`) — nowhere near the old range string's
    // 13-char worst case. 7 + " @ " (3) + 6 = 16, nowhere near 80.
    const longest = `${fmtDuration(180)} @ ${fmtSplit(240)}`;
    expect(longest).toBe("3:00:00 @ 4:00.0");
    expect(longest.length).toBeLessThanOrEqual(80);
    expect(longest.length).toBe(16);
  });
});

describe("buildLogSeed: the monitor run's frozen log identity (7C spec §2)", () => {
  it("emits one seed step per NON-REST phase, in program-interval order, with the manual builder's own label text", () => {
    // wu(5' = 300s) + w(2' = 120s @ 6k+4, rest 1' = 60s) + w(100m @ 6k+0) —
    // the task brief's own exact phase shape: warmup, work@time, rest,
    // work@distance. Built through the real buildDraft -> buildRun
    // assembly (like this file's own "Nudge Fixture" tests above), not a
    // hand-rolled EnginePhase array.
    const draft = buildDraft({
      id: "id-seed-fixture",
      title: "Seed Fixture",
      type: "AT",
      steps: [
        { k: "wu", minutes: 5 },
        {
          k: "w",
          duration: { kind: "time", minutes: 2 },
          ref: { base: "6k", off: 4 },
          restMinutes: 1,
        },
        {
          k: "w",
          duration: { kind: "distance", meters: 100 },
          ref: { base: "6k", off: 0 },
        },
      ],
    });
    const built = buildRun(draft, BASELINES, NOW);
    expect(built.phases.map((p) => p.type)).toStrictEqual([
      "warmup",
      "work",
      "rest",
      "work",
    ]);
    const seed = buildLogSeed(built.phases, BASELINES);
    expect(seed.steps).toHaveLength(3); // warmup + 2 work; the rest folded
    expect(seed.steps[0]).toStrictEqual({
      label: expect.any(String),
      kind: "warmup",
    });
    expect(seed.steps[1]!.kind).toBe("work");
    expect(seed.steps[2]!.kind).toBe("work");
    // Label parity (the load-bearing requirement): byte-identical to what
    // buildManualLogSteps produces for the SAME authored steps.
    const manualLabels = buildManualLogSteps(
      { steps: draft.steps },
      BASELINES,
    ).map((s) => s.label);
    expect(seed.steps[1]!.label).toBe(manualLabels[0]);
    expect(seed.steps[2]!.label).toBe(manualLabels[1]);
    expect(seed.steps[1]!.label).toBe("2:00 @ 6k +4");
    expect(seed.steps[2]!.label).toBe("100 m @ 6k");
  });

  it("captures only the REFERENCED paces (the manual PACES LOCKED F1 rule: no step references 2k -> no k2)", () => {
    // Filling Low: wu + 3x2000m @ 6k+4 — every work step references "6k",
    // none reference "2k".
    const { run } = runFor("Filling Low");
    const seed = buildLogSeed(run.phases, BASELINES);
    expect(seed.paces).toStrictEqual({ k6: BASELINES.k6Seconds });
  });

  it("the symmetric F1 case: a 2k-only workout captures k2 and OMITS k6 entirely (not just present-but-undefined)", () => {
    // Cross Sea: four sequential distance steps at 2k+4/2k+2/2k+0/2k-2 —
    // every work step references "2k", none reference "6k".
    const { run } = runFor("Cross Sea");
    const seed = buildLogSeed(run.phases, BASELINES);
    expect(seed.paces).toStrictEqual({ k2: BASELINES.k2Seconds });
    expect(Object.keys(seed.paces)).toStrictEqual(["k2"]);
  });

  it("captures BOTH paces when a workout references both bases", () => {
    const draft = buildDraft({
      id: "id-both-bases",
      title: "Both Bases",
      type: "AT",
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 5 },
          ref: { base: "2k", off: 0 },
        },
        {
          k: "w",
          duration: { kind: "time", minutes: 5 },
          ref: { base: "6k", off: 0 },
        },
      ],
    });
    const built = buildRun(draft, BASELINES, NOW);
    expect(buildLogSeed(built.phases, BASELINES).paces).toStrictEqual({
      k2: BASELINES.k2Seconds,
      k6: BASELINES.k6Seconds,
    });
  });

  it("an all-effort workout references no base at all: paces is empty", () => {
    // Fork Lightning: wu + 10 effort ("MAX") work phases — no split ref
    // anywhere, so nothing to lock a base to.
    const { run } = runFor("Fork Lightning");
    const seed = buildLogSeed(run.phases, BASELINES);
    expect(seed.paces).toStrictEqual({});
    // 1 warmup + 10 effort work phases (rests folded), all kind "work"
    // except the warmup.
    expect(seed.steps).toHaveLength(11);
    expect(seed.steps[0]!.kind).toBe("warmup");
    for (const step of seed.steps.slice(1)) {
      expect(step).toStrictEqual({ label: "0:30 @ MAX", kind: "work" });
    }
  });

  it("a mixed split+effort+distance workout: byte-identical labels to buildManualLogSteps for every step, not just one kind", () => {
    // Same "Mixed Kinds" idiom as buildLogSteps' own F1b test above:
    // Hoarfrost's split TIME step, Fork Lightning's EFFORT step, Filling
    // Low's split DISTANCE step — no single library workout mixes all
    // three, so this is the realistic way to exercise all three at once.
    const steps: Step[] = [
      { k: "wu", minutes: 5 },
      workStepFrom("Hoarfrost"),
      workStepFrom("Fork Lightning"),
      workStepFrom("Filling Low"),
    ];
    const draft = buildDraft({
      id: "id-seed-mixed",
      title: "Mixed Kinds",
      type: "AT",
      steps,
    });
    const built = buildRun(draft, BASELINES, NOW);
    const seed = buildLogSeed(built.phases, BASELINES);
    const workLabels = seed.steps
      .filter((s) => s.kind === "work")
      .map((s) => s.label);
    const manualLabels = buildManualLogSteps(
      { steps: draft.steps },
      BASELINES,
    ).map((s) => s.label);
    expect(workLabels).toStrictEqual(manualLabels);
    expect(workLabels).toStrictEqual([
      "12:00 @ 6k +12",
      "0:30 @ MAX",
      "2000 m @ 6k +4",
    ]);
  });

  it("a warmup-only-adjacent workout: the warmup's own seed label carries the real duration, house 'warm-up' idiom", () => {
    const { run } = runFor("Filling Low");
    const seed = buildLogSeed(run.phases, BASELINES);
    expect(seed.steps[0]).toStrictEqual({
      label: "8:00 warm-up",
      kind: "warmup",
    });
  });

  it("a 'test' phase (defensive only — compileProgram never lets one reach production) seeds a bare, un-prefixed label", () => {
    const draft = buildDraft({
      id: "id-seed-test-phase",
      title: "Test Only",
      type: "O2",
      steps: [{ k: "test", label: "2k test" }],
    });
    const built = buildRun(draft, BASELINES, NOW);
    expect(built.phases).toStrictEqual([
      expect.objectContaining({ type: "test", label: "All out" }),
    ]);
    expect(buildLogSeed(built.phases, BASELINES)).toStrictEqual({
      steps: [{ label: "All out", kind: "work" }],
      paces: {},
    });
  });

  // The LEGACY-shaped defensive branch (function's own doc comment: "no ref
  // to reconstruct a chip from at all... shouldn't happen for a phase built
  // through buildRun"). Nothing on the real connect path can produce a
  // split-targetKind EnginePhase with no `ref` — `domain/expand.ts`'s "case
  // w" always sets one — so this simulates the shape by deleting it, the
  // same technique `buildLogSteps`' own "legacy pre-ref SessionRun" test
  // above uses for the identical defensive branch.
  it("a split-targetKind phase with no `ref` at all (shouldn't happen, but must not crash) falls back to the phase's own frozen label verbatim", () => {
    // Calm Sea's work phase's frozen `label` is `fmtSplit(132)` = "2:12.0"
    // (domain/expand.ts's "case w": `label: fmtSplit(split)`) — deleting
    // `ref` leaves that as the only thing left to compose a label from.
    const { run } = runFor("Calm Sea");
    const legacyPhase = { ...run.phases[1]! };
    expect(legacyPhase.type).toBe("work");
    expect(legacyPhase.label).toBe("2:12.0");
    delete (legacyPhase as { ref?: unknown }).ref;
    expect(
      buildLogSeed([run.phases[0]!, legacyPhase], BASELINES),
    ).toStrictEqual({
      steps: [
        { label: expect.any(String), kind: "warmup" },
        { label: "10000 m @ 2:12.0", kind: "work" },
      ],
      paces: {},
    });
  });
});

// ---------------------------------------------------------------------------
// buildMonitorLogSteps (7C spec §3) — the monitor-run twin of buildLogSteps.
// ---------------------------------------------------------------------------

function compileOrThrow(
  phases: Parameters<typeof compileProgram>[0],
): WorkoutProgram {
  const result = compileProgram(phases);
  if ("code" in result) {
    throw new Error(
      `test fixture failed to compile (${result.code}): ${result.message}`,
    );
  }
  return result;
}

// WALK4_ACTUALS: IntervalActual[] — FIX ROUND 1 (post-initial-report): index
// 1 is now a REAL wire decode; index 0 stays synthesized, and both are
// labeled below so neither is mistaken for the other.
//
// The task brief that named this fixture ("freeze the walk-4 fixture from
// the wire itself") instructed decoding walk 4's raw 0x0037/0x0038 pair for
// an interval boundary ("the pasted log's seq 24/25 hex") out of
// `docs/monitor/pm5-interface-notes.md` §18's 2026-08-08 entry through
// `parseSplitIntervalData`/`toIntervalActual`. At the time this fixture was
// first written, THAT HEX DID NOT EXIST IN THE REPO (flagged in the task-2
// report; independently confirmed by the adversarial review's m7 finding),
// so both entries were hand-picked and illustrative. James has since
// committed the missing hex into the record (`b402faf`, "docs: walk 4's
// boundary bytes enter the record, verbatim from the stash") — §18's walk-4
// entry now opens with the raw pair for INTERVAL 2 (the operator's pasted
// wire log, seq 24-25), plus a note that interval 1's pair was never
// captured raw (only its normalized `interval-complete` line survives from
// that session, since `notify` logging didn't exist yet when it fired).
//
// DECODED (index 1 below — "interval 2" in the log's own 1-based/machine
// framing): the raw hex —
//   0x0037  eb 0c 00 49 04 00 23 01 00 64 00 00 1e 00 09 00 01 02
//   0x0038  eb 0c 00 19 6b 67 af 05 05 00 b3 02 6c 0d 72 00 65 02 00
// — run through `parseSplitIntervalData`/`parseAdditionalSplitIntervalData`
// then `toIntervalActual` (a throwaway test, `domain/monitor/pm5/
// __walk4throwaway.test.ts`, written, run, and deleted for this fix round)
// printed `splitIntervalNumber: 2` (the RAW machine value — `toIntervalActual`
// passes it through unnormalized) and `{ elapsedSeconds: 29.1,
// distanceMeters: 100, avgSplit: 145.5, avgSpm: 25, avgHeartRateBpm: 107 }`.
// The walk-4 log's own line reads "interval-complete index=1 (machine
// reported 2)" — reconciled here by running the SAME normalization the
// driver applies at that boundary, `toActualIndex(machineIndex: 2,
// machineState: "resting", programLength: 2)`
// (`domain/monitor/pm5/intervalIndex.ts`): `candidate = 2 - 1 = 1`, in
// range, so `1` — matching the log line exactly. `index: 1` below is that
// normalized value, not the raw `2`.
//
// SYNTHESIZED (index 0 below, unchanged from the original report): §18 says
// interval 1's own pair was never captured raw, so there is nothing to
// decode for it — it remains a hand-picked, illustrative `IntervalActual`,
// `elapsedSeconds`/`distanceMeters` chosen close to walk 4's own
// genuinely-recorded FRAME numbers, `avgSpm` from walk 4's own recorded RATE
// reading ("25, then 24", interface-notes.md:2133-2135), `avgSplit`/
// `avgHeartRateBpm` invented but wire-plausible.
const WALK4_ACTUALS: IntervalActual[] = [
  // SYNTHESIZED — see comment above; interval 1's raw pair was never
  // captured.
  {
    index: 0,
    elapsedSeconds: 37.8,
    distanceMeters: 102,
    avgSplit: 185.3,
    avgSpm: 25,
    avgHeartRateBpm: 132,
  },
  // DECODED — see comment above; verbatim from §18's real 0x0037/0x0038
  // pair (b402faf) through parse.ts's own functions, index normalized via
  // toActualIndex(2, "resting", 2) = 1.
  {
    index: 1,
    elapsedSeconds: 29.1,
    distanceMeters: 100,
    avgSplit: 145.5,
    avgSpm: 25,
    avgHeartRateBpm: 107,
  },
];

// WALK4_RUN's own `program`/`logSeed` are NOT hand-typed — built through the
// real buildDraft -> buildRun -> compileProgram -> buildLogSeed pipeline
// (this file's own "realistic fixtures" convention), so this fixture proves
// the SAME alignment contract `buildMonitorLogSteps` relies on (`LogSeed`'s
// own doc comment: "seed.steps[i] and program.intervals[i] name the SAME
// interval for every i") instead of merely asserting it by hand
// construction. Shape: 2x100 m distance intervals, 30s rest, no warmup —
// walk 4's own shape (§18, 2026-08-08).
const WALK4_DRAFT = buildDraft({
  id: "id-walk4",
  title: "Walk 4",
  type: "AT",
  steps: [
    {
      k: "w",
      duration: { kind: "distance", meters: 100 },
      ref: { base: "6k", off: 0 },
      restMinutes: 0.5,
    },
    {
      k: "w",
      duration: { kind: "distance", meters: 100 },
      ref: { base: "6k", off: 0 },
      restMinutes: 0.5,
    },
  ],
});
const WALK4_BUILT = buildRun(WALK4_DRAFT, BASELINES, NOW);
const WALK4_PROGRAM = compileOrThrow(WALK4_BUILT.phases);
const WALK4_LOG_SEED = buildLogSeed(WALK4_BUILT.phases, BASELINES);

const WALK4_RUN: MonitorRun = {
  v: 2,
  workoutId: WALK4_DRAFT.workoutId,
  title: WALK4_DRAFT.title,
  program: WALK4_PROGRAM,
  logSeed: WALK4_LOG_SEED,
  actuals: [WALK4_ACTUALS[0]!, WALK4_ACTUALS[1]!],
  // The real hardware's own device ID, `pm5-interface-notes.md`'s hardware
  // sessions throughout (e.g. §18's "PM5 432331249").
  deviceName: "PM5 432331249",
  startedAt: NOW.toISOString(),
  completedAt: new Date(NOW.getTime() + 2 * 60 * 1000).toISOString(),
  terminated: false,
};

// A THREE-interval variant (WALK4_RUN only has two) so the "lost boundary"
// and "early End" gap cases below each have an untouched interval on both
// sides, proving the gap doesn't shift or contaminate its neighbours.
const THREE_STEP_ACTUALS: IntervalActual[] = [
  {
    index: 0,
    elapsedSeconds: 32.1,
    distanceMeters: 101,
    avgSplit: 160.5,
    avgSpm: 22,
    avgHeartRateBpm: 118,
  },
  {
    index: 1,
    elapsedSeconds: 33.4,
    distanceMeters: 100,
    avgSplit: 167.0,
    avgSpm: 23,
    avgHeartRateBpm: 121,
  },
  {
    index: 2,
    elapsedSeconds: 31.0,
    distanceMeters: 103,
    avgSplit: 155.0,
    avgSpm: 24,
    avgHeartRateBpm: 125,
  },
];
const THREE_STEP_DRAFT = buildDraft({
  id: "id-three-step",
  title: "Three Step",
  type: "AT",
  steps: [
    {
      k: "w",
      duration: { kind: "distance", meters: 100 },
      ref: { base: "6k", off: 0 },
      restMinutes: 0.5,
    },
    {
      k: "w",
      duration: { kind: "distance", meters: 100 },
      ref: { base: "6k", off: 0 },
      restMinutes: 0.5,
    },
    {
      k: "w",
      duration: { kind: "distance", meters: 100 },
      ref: { base: "6k", off: 0 },
    },
  ],
});
const THREE_STEP_BUILT = buildRun(THREE_STEP_DRAFT, BASELINES, NOW);
const THREE_STEP_PROGRAM = compileOrThrow(THREE_STEP_BUILT.phases);
const THREE_STEP_LOG_SEED = buildLogSeed(THREE_STEP_BUILT.phases, BASELINES);
const THREE_STEP_RUN: MonitorRun = {
  v: 2,
  workoutId: THREE_STEP_DRAFT.workoutId,
  title: THREE_STEP_DRAFT.title,
  program: THREE_STEP_PROGRAM,
  logSeed: THREE_STEP_LOG_SEED,
  actuals: THREE_STEP_ACTUALS,
  deviceName: "PM5 432331249",
  startedAt: NOW.toISOString(),
  completedAt: new Date(NOW.getTime() + 3 * 60 * 1000).toISOString(),
  terminated: false,
};

describe("buildMonitorLogSteps (7C spec §3)", () => {
  it("maps walk 4's interval 0: label from the seed, target from the program, actualSplit/spm/avgHr/actualSeconds/actualMeters verbatim from the actual, source pm5", () => {
    const steps = buildMonitorLogSteps(WALK4_RUN);
    // toStrictEqual, not the brief's own literal toEqual (repo's
    // vitest/prefer-strict-equal lint rule) — safe here since every value
    // below is a real, non-undefined literal, so the stricter matcher's
    // "no undefined-valued keys" distinction never applies.
    expect(steps[0]).toStrictEqual({
      label: WALK4_RUN.logSeed!.steps[0]!.label,
      targetSplit: WALK4_RUN.program.intervals[0]!.targetSplit ?? undefined,
      meters: 100,
      actualSplit: WALK4_ACTUALS[0]!.avgSplit,
      actualSource: "pm5",
      spm: WALK4_ACTUALS[0]!.avgSpm,
      avgHr: WALK4_ACTUALS[0]!.avgHeartRateBpm ?? undefined,
      actualSeconds: WALK4_ACTUALS[0]!.elapsedSeconds,
      actualMeters: WALK4_ACTUALS[0]!.distanceMeters,
    });
  });

  // Task 2's deferred minor (progress.md, task-2-report.md "Fix round 1"):
  // the happy-path test above only ever pinned interval 0, the SYNTHESIZED
  // entry — the phase's one genuinely hardware-DECODED value
  // (`WALK4_ACTUALS[1]`, §18's real 0x0037/0x0038 pair through
  // `parseSplitIntervalData`/`toIntervalActual`, b402faf) never got its own
  // whole-object pin. This closes that gap: the full `LogStep`
  // `buildMonitorLogSteps` builds for interval 1, read dynamically off the
  // decoded fixture (never a hardcoded literal, so a future re-decode can't
  // silently drift this test out of sync with the fixture it's supposed to
  // pin).
  it("maps walk 4's interval 1 (the DECODED §18 entry, WALK4_ACTUALS[1]) to a full LogStep, verbatim", () => {
    const steps = buildMonitorLogSteps(WALK4_RUN);
    expect(steps[1]).toStrictEqual({
      label: WALK4_RUN.logSeed!.steps[1]!.label,
      targetSplit: WALK4_RUN.program.intervals[1]!.targetSplit ?? undefined,
      meters: 100,
      actualSplit: WALK4_ACTUALS[1]!.avgSplit,
      actualSource: "pm5",
      spm: WALK4_ACTUALS[1]!.avgSpm,
      avgHr: WALK4_ACTUALS[1]!.avgHeartRateBpm ?? undefined,
      actualSeconds: WALK4_ACTUALS[1]!.elapsedSeconds,
      actualMeters: WALK4_ACTUALS[1]!.distanceMeters,
    });
  });

  it("a warmup interval produces NO step (manual parity, adversarial B2) and shifts nothing", () => {
    const draft = buildDraft({
      id: "id-walk4-warmup-variant",
      title: "Walk 4 (warmup variant)",
      type: "AT",
      steps: [
        { k: "wu", minutes: 1 },
        {
          k: "w",
          duration: { kind: "distance", meters: 100 },
          ref: { base: "6k", off: 0 },
        },
      ],
    });
    const built = buildRun(draft, BASELINES, NOW);
    const program = compileOrThrow(built.phases);
    const logSeed = buildLogSeed(built.phases, BASELINES);
    expect(logSeed.steps.map((s) => s.kind)).toStrictEqual(["warmup", "work"]);
    const run: MonitorRun = {
      v: 2,
      workoutId: draft.workoutId,
      title: draft.title,
      program,
      logSeed,
      actuals: [
        // A boundary at the warmup's own position — even if the machine
        // reports one, it must never surface as a step of its own.
        {
          index: 0,
          elapsedSeconds: 60,
          distanceMeters: 0,
          avgSplit: null,
          avgSpm: null,
          avgHeartRateBpm: null,
        },
        {
          index: 1,
          elapsedSeconds: 37.8,
          distanceMeters: 102,
          avgSplit: 185.3,
          avgSpm: 25,
          avgHeartRateBpm: 132,
        },
      ],
      deviceName: "PM5 432331249",
      startedAt: NOW.toISOString(),
      completedAt: NOW.toISOString(),
      terminated: false,
    };
    const steps = buildMonitorLogSteps(run);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.label).toBe(logSeed.steps[1]!.label);
    expect(steps[0]!.actualSource).toBe("pm5");
    expect(steps[0]!.actualSeconds).toBe(37.8);
    expect(steps[0]!.actualMeters).toBe(102);
  });

  it("a lost boundary (actuals shorter, that index absent) leaves the step with NO actual and NO source, never 'assumed'", () => {
    const run: MonitorRun = {
      ...THREE_STEP_RUN,
      actuals: THREE_STEP_RUN.actuals.filter((a) => a.index !== 1),
    };
    const steps = buildMonitorLogSteps(run);
    expect(steps).toHaveLength(3);
    expect(steps[0]!.actualSource).toBe("pm5");
    expect(steps[1]!.actualSource).toBeUndefined();
    expect(steps[1]!.actualSplit).toBeUndefined();
    expect(steps[1]!.spm).toBeUndefined();
    expect(steps[1]!.actualSeconds).toBeUndefined();
    expect(steps[1]!.actualMeters).toBeUndefined();
    expect(steps[2]!.actualSource).toBe("pm5");
  });

  it("index:null actuals are dropped entirely", () => {
    const run: MonitorRun = {
      ...WALK4_RUN,
      actuals: [{ ...WALK4_ACTUALS[0]!, index: null }, WALK4_ACTUALS[1]!],
    };
    const steps = buildMonitorLogSteps(run);
    // Interval 0's would-be actual carried index:null — dropped, not read
    // as "this is interval 0" (domain/monitor/types.ts's own
    // IntervalActual.index doc comment).
    expect(steps[0]).toStrictEqual({
      label: WALK4_RUN.logSeed!.steps[0]!.label,
      targetSplit: WALK4_RUN.program.intervals[0]!.targetSplit ?? undefined,
      meters: 100,
    });
    expect(steps[1]!.actualSource).toBe("pm5");
  });

  it("an early End leaves trailing steps bare (partials ruling)", () => {
    const run: MonitorRun = {
      ...THREE_STEP_RUN,
      actuals: THREE_STEP_RUN.actuals.filter((a) => a.index === 0),
    };
    const steps = buildMonitorLogSteps(run);
    expect(steps).toHaveLength(3);
    expect(steps[0]!.actualSource).toBe("pm5");
    expect(steps[1]).toStrictEqual({
      label: THREE_STEP_RUN.logSeed!.steps[1]!.label,
      targetSplit:
        THREE_STEP_RUN.program.intervals[1]!.targetSplit ?? undefined,
      meters: 100,
    });
    expect(steps[2]).toStrictEqual({
      label: THREE_STEP_RUN.logSeed!.steps[2]!.label,
      targetSplit:
        THREE_STEP_RUN.program.intervals[2]!.targetSplit ?? undefined,
      meters: 100,
    });
  });

  it("an effort interval (targetSplit null) still carries its measured actual, no target", () => {
    // Fork Lightning's own real effort step (0:30 @ MAX) — realistic
    // fixture convention, and the same step buildLogSteps'/buildLogSeed's
    // own effort tests above use.
    const effortStep = workStepFrom("Fork Lightning");
    const draft = buildDraft({
      id: "id-effort-actual",
      title: "Effort Actual",
      type: "AN",
      steps: [effortStep],
    });
    const built = buildRun(draft, BASELINES, NOW);
    const program = compileOrThrow(built.phases);
    const logSeed = buildLogSeed(built.phases, BASELINES);
    expect(program.intervals[0]!.targetSplit).toBeNull();
    const run: MonitorRun = {
      v: 2,
      workoutId: draft.workoutId,
      title: draft.title,
      program,
      logSeed,
      actuals: [
        {
          index: 0,
          elapsedSeconds: 30,
          distanceMeters: 120,
          avgSplit: 110,
          avgSpm: 32,
          avgHeartRateBpm: 150,
        },
      ],
      deviceName: "PM5 432331249",
      startedAt: NOW.toISOString(),
      completedAt: NOW.toISOString(),
      terminated: false,
    };
    const steps = buildMonitorLogSteps(run);
    expect(steps).toHaveLength(1);
    // Whole-object toStrictEqual (not toMatchObject +
    // .toBeUndefined()) is deliberate: it proves `targetSplit` is truly
    // ABSENT, not merely present-with-value-undefined — the same
    // distinction `buildManualLogSteps`' own effort test above pins.
    expect(steps[0]).toStrictEqual({
      label: logSeed.steps[0]!.label,
      actualSplit: 110,
      actualSource: "pm5",
      spm: 32,
      avgHr: 150,
      actualSeconds: 30,
      actualMeters: 120,
      seconds: 30,
    });
  });

  it("avgSplit 0 keeps source pm5 and the verbatim fields but omits actualSplit (the pm5 pairing exception)", () => {
    const run: MonitorRun = {
      ...WALK4_RUN,
      actuals: [{ ...WALK4_ACTUALS[0]!, avgSplit: 0 }],
    };
    const steps = buildMonitorLogSteps(run);
    expect(steps[0]!.actualSplit).toBeUndefined();
    expect(steps[0]!.actualSource).toBe("pm5");
    expect(steps[0]!.spm).toBe(WALK4_ACTUALS[0]!.avgSpm);
    expect(steps[0]!.avgHr).toBe(WALK4_ACTUALS[0]!.avgHeartRateBpm);
    expect(steps[0]!.actualSeconds).toBe(WALK4_ACTUALS[0]!.elapsedSeconds);
    expect(steps[0]!.actualMeters).toBe(WALK4_ACTUALS[0]!.distanceMeters);
  });

  it("a null avgSpm omits spm (never a fabricated stroke rate), the rest of the mapping unaffected", () => {
    const run: MonitorRun = {
      ...WALK4_RUN,
      actuals: [{ ...WALK4_ACTUALS[0]!, avgSpm: null }],
    };
    const steps = buildMonitorLogSteps(run);
    // toStrictEqual (not `.spm` toBeUndefined() alone): proves the `spm` key
    // is truly ABSENT, not present-with-value-undefined.
    expect(steps[0]).toStrictEqual({
      label: WALK4_RUN.logSeed!.steps[0]!.label,
      targetSplit: WALK4_RUN.program.intervals[0]!.targetSplit ?? undefined,
      meters: 100,
      actualSplit: WALK4_ACTUALS[0]!.avgSplit,
      actualSource: "pm5",
      avgHr: WALK4_ACTUALS[0]!.avgHeartRateBpm ?? undefined,
      actualSeconds: WALK4_ACTUALS[0]!.elapsedSeconds,
      actualMeters: WALK4_ACTUALS[0]!.distanceMeters,
    });
  });

  it("avgHr outside 20-254 is omitted; the save never rejects for it", () => {
    const tooLow: MonitorRun = {
      ...WALK4_RUN,
      actuals: [{ ...WALK4_ACTUALS[0]!, avgHeartRateBpm: MONITOR_HR_MIN - 1 }],
    };
    const tooHigh: MonitorRun = {
      ...WALK4_RUN,
      actuals: [{ ...WALK4_ACTUALS[0]!, avgHeartRateBpm: MONITOR_HR_MAX + 1 }],
    };
    const inBandLow: MonitorRun = {
      ...WALK4_RUN,
      actuals: [{ ...WALK4_ACTUALS[0]!, avgHeartRateBpm: MONITOR_HR_MIN }],
    };
    const inBandHigh: MonitorRun = {
      ...WALK4_RUN,
      actuals: [{ ...WALK4_ACTUALS[0]!, avgHeartRateBpm: MONITOR_HR_MAX }],
    };
    expect(buildMonitorLogSteps(tooLow)[0]!.avgHr).toBeUndefined();
    expect(buildMonitorLogSteps(tooHigh)[0]!.avgHr).toBeUndefined();
    expect(buildMonitorLogSteps(inBandLow)[0]!.avgHr).toBe(MONITOR_HR_MIN);
    expect(buildMonitorLogSteps(inBandHigh)[0]!.avgHr).toBe(MONITOR_HR_MAX);
    // Never rejects the step for it — every other verbatim field stands.
    const step = buildMonitorLogSteps(tooLow)[0]!;
    expect(step.actualSource).toBe("pm5");
    expect(step.actualSplit).toBe(WALK4_ACTUALS[0]!.avgSplit);
  });

  // Branch review Medium-1: the wire's own top end (avgSplit's readU16LE
  // scale tops out at 0xFFFF / 10 = 6553.5) exceeds the server's pm5 band
  // (`> 0 and <= 6000`, data.ts's PM5_MAX_SPLIT_SECONDS) — a wire-legal
  // reading the server would 400 on. `avgHr`'s own rule ("an out-of-band
  // monitor number drops its own field, it never rejects the rower's log")
  // now applies to actualSplit too: the step still saves, with
  // actualSource intact (the pm5 pairing exception), just no actualSplit.
  it("avgSplit 6553.5 (the wire's own saturation value, past the server's 6000 band) omits actualSplit but keeps source pm5 and every other verbatim field (branch review Medium-1)", () => {
    const run: MonitorRun = {
      ...WALK4_RUN,
      actuals: [{ ...WALK4_ACTUALS[0]!, avgSplit: 6553.5 }],
    };
    const steps = buildMonitorLogSteps(run);
    expect(steps[0]!.actualSplit).toBeUndefined();
    expect(steps[0]!.actualSource).toBe("pm5");
    expect(steps[0]!.spm).toBe(WALK4_ACTUALS[0]!.avgSpm);
    expect(steps[0]!.avgHr).toBe(WALK4_ACTUALS[0]!.avgHeartRateBpm);
    expect(steps[0]!.actualSeconds).toBe(WALK4_ACTUALS[0]!.elapsedSeconds);
    expect(steps[0]!.actualMeters).toBe(WALK4_ACTUALS[0]!.distanceMeters);
    // A reading right at the band's own edge is still admitted — this is a
    // drop-above-the-line rule, not a general distrust of large splits.
    const atMax: MonitorRun = {
      ...WALK4_RUN,
      actuals: [{ ...WALK4_ACTUALS[0]!, avgSplit: MONITOR_SPLIT_MAX }],
    };
    expect(buildMonitorLogSteps(atMax)[0]!.actualSplit).toBe(MONITOR_SPLIT_MAX);
  });

  // Branch review Medium-1: avgSpm's own wire scale (readU8) tops out at
  // 255, past the server's pm5 band (`0..99`, PM5_SPM_MIN/MAX). Same
  // drop-the-field treatment, never a rejected save.
  it("avgSpm 255 (the wire's own byte ceiling, past the server's 0..99 band) omits spm, the rest of the mapping unaffected (branch review Medium-1)", () => {
    const run: MonitorRun = {
      ...WALK4_RUN,
      actuals: [{ ...WALK4_ACTUALS[0]!, avgSpm: 255 }],
    };
    const steps = buildMonitorLogSteps(run);
    // toStrictEqual (not `.spm` toBeUndefined() alone): proves the `spm` key
    // is truly ABSENT, not present-with-value-undefined.
    expect(steps[0]).toStrictEqual({
      label: WALK4_RUN.logSeed!.steps[0]!.label,
      targetSplit: WALK4_RUN.program.intervals[0]!.targetSplit ?? undefined,
      meters: 100,
      actualSplit: WALK4_ACTUALS[0]!.avgSplit,
      actualSource: "pm5",
      avgHr: WALK4_ACTUALS[0]!.avgHeartRateBpm ?? undefined,
      actualSeconds: WALK4_ACTUALS[0]!.elapsedSeconds,
      actualMeters: WALK4_ACTUALS[0]!.distanceMeters,
    });
    // Both band edges (0 and 99) are still admitted.
    const atMin: MonitorRun = {
      ...WALK4_RUN,
      actuals: [{ ...WALK4_ACTUALS[0]!, avgSpm: MONITOR_SPM_MIN }],
    };
    const atMax: MonitorRun = {
      ...WALK4_RUN,
      actuals: [{ ...WALK4_ACTUALS[0]!, avgSpm: MONITOR_SPM_MAX }],
    };
    expect(buildMonitorLogSteps(atMin)[0]!.spm).toBe(MONITOR_SPM_MIN);
    expect(buildMonitorLogSteps(atMax)[0]!.spm).toBe(MONITOR_SPM_MAX);
  });

  // Branch review Medium-2: mutant M2b keyed the warmup skip on `i === 0`
  // instead of `seedStep.kind === "warmup"` and survived the whole suite —
  // every warmup fixture on the branch was LEADING. `domain/validate.ts`'s
  // `validateSteps` imposes no positional constraint on `wu`
  // (`case "wu": case "r":` — only minutes are checked), so a mid-workout
  // warmup is production-authorable via the builder or bulk import. This
  // fixture (work / warmup / work) proves the skip is position-independent.
  it("a MID-WORKOUT warmup interval (work / warmup / work) produces NO step and does not shift the following work step's mapping (branch review Medium-2)", () => {
    const draft = buildDraft({
      id: "id-mid-workout-warmup",
      title: "Mid-Workout Warmup",
      type: "AT",
      steps: [
        {
          k: "w",
          duration: { kind: "distance", meters: 100 },
          ref: { base: "6k", off: 0 },
        },
        { k: "wu", minutes: 1 },
        {
          k: "w",
          duration: { kind: "distance", meters: 200 },
          ref: { base: "6k", off: 2 },
        },
      ],
    });
    const built = buildRun(draft, BASELINES, NOW);
    const program = compileOrThrow(built.phases);
    const logSeed = buildLogSeed(built.phases, BASELINES);
    expect(logSeed.steps.map((s) => s.kind)).toStrictEqual([
      "work",
      "warmup",
      "work",
    ]);
    expect(program.intervals).toHaveLength(3);
    const run: MonitorRun = {
      v: 2,
      workoutId: draft.workoutId,
      title: draft.title,
      program,
      logSeed,
      actuals: [
        {
          index: 0,
          elapsedSeconds: 32.1,
          distanceMeters: 100,
          avgSplit: 160.5,
          avgSpm: 22,
          avgHeartRateBpm: 118,
        },
        // A boundary landing on the mid-workout warmup's own position —
        // even if the machine reports one, it must never surface as a step.
        {
          index: 1,
          elapsedSeconds: 60,
          distanceMeters: 0,
          avgSplit: null,
          avgSpm: null,
          avgHeartRateBpm: null,
        },
        {
          index: 2,
          elapsedSeconds: 65.3,
          distanceMeters: 200,
          avgSplit: 163.3,
          avgSpm: 23,
          avgHeartRateBpm: 130,
        },
      ],
      deviceName: "PM5 432331249",
      startedAt: NOW.toISOString(),
      completedAt: NOW.toISOString(),
      terminated: false,
    };
    const steps = buildMonitorLogSteps(run);
    // Exactly two steps — the warmup at position 1 produced none.
    expect(steps).toHaveLength(2);
    expect(steps[0]!.label).toBe(logSeed.steps[0]!.label);
    expect(steps[0]!.meters).toBe(100);
    // The second WORK step keeps ITS OWN mapping (interval 2, 200 m,
    // interval 2's actual) — not shifted onto the warmup's interval 1.
    expect(steps[1]!.label).toBe(logSeed.steps[2]!.label);
    expect(steps[1]!.meters).toBe(200);
    expect(steps[1]!.targetSplit).toBe(program.intervals[2]!.targetSplit);
    expect(steps[1]!.actualSource).toBe("pm5");
    expect(steps[1]!.actualSeconds).toBe(65.3);
    expect(steps[1]!.actualMeters).toBe(200);
    expect(steps[1]!.spm).toBe(23);
  });

  // Branch review Medium-3: mutant `step.targetSplit =
  // Math.round(interval.targetSplit)` survived 141/141 — every monitor
  // fixture on the branch resolved to an INTEGER target (BASELINES above is
  // {k2Seconds: 100, k6Seconds: 120}, and every fixture's ref is `{base:
  // "6k", off: 0}` -> exactly 120). Fractional targets are the NORM for
  // baseline-derived targets, not an edge case
  // (`domain/monitor/program.ts`'s own M-9 comment: "half-second splits
  // (2:14.5) are the NORM"). This fixture uses the phase's own real
  // end-to-end value (a 144s/2k baseline, +1.5 off -> 145.5) to prove
  // `targetSplit` survives to the LogStep untouched.
  it("a fractional targetSplit (145.5, the phase's own end-to-end value) survives to the LogStep EXACTLY, never rounded (branch review Medium-3)", () => {
    const fractionalBaselines: Baselines = { k2Seconds: 144, k6Seconds: 120 };
    const draft = buildDraft({
      id: "id-fractional-target",
      title: "Fractional Target",
      type: "AT",
      steps: [
        {
          k: "w",
          duration: { kind: "distance", meters: 500 },
          ref: { base: "2k", off: 1.5 },
        },
      ],
    });
    const built = buildRun(draft, fractionalBaselines, NOW);
    const program = compileOrThrow(built.phases);
    expect(program.intervals[0]!.targetSplit).toBe(145.5);
    const logSeed = buildLogSeed(built.phases, fractionalBaselines);
    const run: MonitorRun = {
      v: 2,
      workoutId: draft.workoutId,
      title: draft.title,
      program,
      logSeed,
      actuals: [
        {
          index: 0,
          elapsedSeconds: 145.5,
          distanceMeters: 500,
          avgSplit: 145.5,
          avgSpm: 25,
          avgHeartRateBpm: 141,
        },
      ],
      deviceName: "PM5 432331249",
      startedAt: NOW.toISOString(),
      completedAt: NOW.toISOString(),
      terminated: false,
    };
    const steps = buildMonitorLogSteps(run);
    // toStrictEqual against the literal 145.5 (not read back off the
    // fixture, per the review's own critique of the happy-path tests that
    // "cannot detect a transform applied to that same value") — a
    // Math.round mutant produces 146 here and this assertion fails.
    expect(steps[0]).toStrictEqual({
      label: logSeed.steps[0]!.label,
      targetSplit: 145.5,
      meters: 500,
      actualSplit: 145.5,
      actualSource: "pm5",
      spm: 25,
      avgHr: 141,
      actualSeconds: 145.5,
      actualMeters: 500,
    });
  });

  it("a missing or misaligned logSeed throws MonitorLogSeedError (the screen catches it as mode disqualification)", () => {
    const missingSeed: MonitorRun = { ...WALK4_RUN, logSeed: undefined };
    expect(() => buildMonitorLogSteps(missingSeed)).toThrow(
      MonitorLogSeedError,
    );

    const misaligned: MonitorRun = {
      ...WALK4_RUN,
      logSeed: {
        ...WALK4_RUN.logSeed!,
        steps: WALK4_RUN.logSeed!.steps.slice(0, 1),
      },
    };
    expect(() => buildMonitorLogSteps(misaligned)).toThrow(MonitorLogSeedError);
  });
});

describe("buildManualLogSteps", () => {
  it("Fork Lightning: an authored effort step resolves to the ref chip 'MAX' (F1: identical to the session door's label — see the both-doors equality tests above), omitting targetSplit/actualSplit/actualSource", () => {
    const w = library("Fork Lightning");
    const steps = buildManualLogSteps({ steps: w.steps }, BASELINES);
    expect(steps).toHaveLength(10);
    for (const step of steps) {
      expect(step).toStrictEqual({ label: "0:30 @ MAX", spm: 32, seconds: 30 });
    }
  });

  it("Filling Low: a reps-expanded distance split ref resolves at CURRENT baselines, all actuals 'assumed' at the same value as targetSplit", () => {
    // 3x2000m @ 6k+4: resolveSplit(120, +4) = 124, refLabel({base:"6k",
    // off:4}) = "6k +4" (off > 0 -> "+4").
    const w = library("Filling Low");
    const steps = buildManualLogSteps({ steps: w.steps }, BASELINES);
    expect(steps).toHaveLength(3);
    for (const step of steps) {
      expect(step).toStrictEqual({
        label: "2000 m @ 6k +4",
        targetSplit: 124,
        actualSplit: 124,
        actualSource: "assumed",
        spm: 22,
        meters: 2000,
      });
    }
  });

  it("Hoarfrost: a reps-expanded time split ref keeps `seconds`, not `meters`", () => {
    // 2x12' @ 6k+12: resolveSplit(120, +12) = 132.
    const w = library("Hoarfrost");
    const steps = buildManualLogSteps({ steps: w.steps }, BASELINES);
    expect(steps).toHaveLength(2);
    for (const step of steps) {
      expect(step).toStrictEqual({
        label: "12:00 @ 6k +12",
        targetSplit: 132,
        actualSplit: 132,
        actualSource: "assumed",
        spm: 22,
        seconds: 720,
      });
    }
  });

  it("Cross Sea: no reps marker, four sequential steps cover all three refLabel sign branches (+4, +2, ±0, -2)", () => {
    const w = library("Cross Sea");
    const steps = buildManualLogSteps({ steps: w.steps }, BASELINES);
    expect(steps).toStrictEqual([
      {
        label: "500 m @ 2k +4",
        targetSplit: 104, // 100 + 4
        actualSplit: 104,
        actualSource: "assumed",
        spm: 24,
        meters: 500,
      },
      {
        label: "500 m @ 2k +2",
        targetSplit: 102, // 100 + 2
        actualSplit: 102,
        actualSource: "assumed",
        spm: 26,
        meters: 500,
      },
      {
        label: "500 m @ 2k",
        targetSplit: 100, // off 0 -> refLabel drops the sign entirely
        actualSplit: 100,
        actualSource: "assumed",
        spm: 28,
        meters: 500,
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

  // IMP-1 (whole-branch review): same dead end as `buildLogSteps`' own IMP-1
  // block above, for the manual door — a workout whose only qualifying step
  // is a test piece used to post `steps: []`, hard-400ing at the server.
  describe("IMP-1: a test step now becomes a bare-label LogStep instead of being skipped", () => {
    it("a workout whose ONLY qualifying step is a test piece no longer builds steps: [] — it builds exactly one bare-label LogStep", () => {
      const steps: Step[] = [{ k: "test", label: "2k test" }];
      expect(buildManualLogSteps({ steps }, BASELINES)).toStrictEqual([
        { label: "2k test" },
      ]);
    });

    it("a test step keeps its own ORIGINAL authored label alongside a real work step — simpler than the session door's own version, since this builder always has the real Step object in hand, no phase/draft indirection", () => {
      const calmSea = library("Calm Sea");
      const distanceWork = calmSea.steps.find((s) => s.k === "w") as Extract<
        Step,
        { k: "w" }
      >;
      const steps: Step[] = [{ k: "test", label: "6k test" }, distanceWork];
      const built = buildManualLogSteps({ steps }, BASELINES);
      expect(built).toHaveLength(2);
      expect(built[0]).toStrictEqual({ label: "6k test" });
      expect(built[1]).toStrictEqual({
        label: "10000 m @ 6k +12",
        targetSplit: 132,
        actualSplit: 132,
        actualSource: "assumed",
        spm: 20,
        meters: 10000,
      });
    });
  });
});

describe("logTotals", () => {
  it("Hoarfrost: dateLabel is the house 'JUL 25' format read from completedAt, totalMinutes is the REAL wall-clock length rounded to the nearest minute", () => {
    // completedAt = startedAt + 46 real minutes (2760s) -> round(2760/60) =
    // 46 exactly, not the workout's PROGRAMMED length (6 + 2*(12+5) = 40
    // minutes) — a real session can run long or short of its own estimate,
    // and the Log screen is recording what happened, not the plan.
    const { run } = runFor("Hoarfrost", {
      completedAt: new Date(NOW.getTime() + 46 * 60 * 1000).toISOString(),
    });
    expect(logTotals(run)).toStrictEqual({
      dateLabel: "AUG 2",
      totalMinutes: 46,
    });
  });

  it("rounds a fractional minute to the nearest whole minute", () => {
    const { run } = runFor("Calm Sea", {
      completedAt: new Date(NOW.getTime() + 90 * 1000).toISOString(), // 1.5 min
    });
    expect(logTotals(run).totalMinutes).toBe(2); // round(1.5) -> 2
  });

  it("an incomplete run (completedAt null) reads as 0 minutes and falls back to startedAt for the date, never reading the system clock", () => {
    const { run } = runFor("Calm Sea", { completedAt: null });
    expect(logTotals(run)).toStrictEqual({
      dateLabel: "AUG 2", // NOW itself, run.startedAt === NOW.toISOString()
      totalMinutes: 0,
    });
  });
});
