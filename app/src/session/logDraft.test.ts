import { describe, it, expect } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Baselines, Step, WorkoutType } from "../../domain/types.js";
import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import { buildDraft, withNudge } from "./draft";
import type { SessionDraft } from "./draft";
import { buildRun } from "./engine";
import type { SessionRun } from "./run";
import { buildLogSteps, buildManualLogSteps, logTotals } from "./logDraft";

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
  tol: number,
  overrides: Partial<SessionRun> = {},
): { draft: SessionDraft; run: SessionRun } {
  const w = library(title);
  const draft = buildDraft({
    id: `id-${title}`,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const built = buildRun(draft, BASELINES, tol, NOW);
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
    const { draft, run } = runFor("Fork Lightning", 3, {
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
    const { draft, run } = runFor("Fork Lightning", 3, {
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
    const built = buildRun(draft, BASELINES, 3, NOW);
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
    const built = buildRun(draft, BASELINES, 0, NOW);
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
    const built = buildRun(nudged, baselines, 0, NOW);
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
    const built = buildRun(nudged, baselines, 0, NOW);
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
    const built = buildRun(draft, BASELINES, 0, NOW);
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
    const { draft, run } = runFor("Calm Sea", 0, {
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
    const { draft, run } = runFor("Calm Sea", 0, {
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
    const { draft, run } = runFor("Filling Low", 0, {
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
    const { draft, run } = runFor("Hoarfrost", 0, {
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
    const run = buildRun(draft, BASELINES, 0, NOW);
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
      const { run } = runFor("Fork Lightning", 3, {
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

    it("draft null: a split-ref phase falls back to the phase's own resolved split text — the one case where a fallback label can still differ from the manual door's", () => {
      const { run } = runFor("Calm Sea", 0, {
        completedAt: new Date(NOW.getTime() + 2560 * 1000).toISOString(),
        actuals: {},
      });
      // domain/expand.ts's own label = fmtSplit(132) = "2:12.0" — the
      // pre-F1b resolved-split text, not "6k +12". Ui-fix round, Item 1:
      // this was ALREADY exact even before the band was retired from
      // display (tol=0 here), since `toleranceRange`'s own tol=0 branch
      // collapsed to bare `fmtSplit` — the round's change only affects a
      // NON-zero tolerance run's fallback label, which no fixture in this
      // file happens to exercise at a non-zero tol.
      expect(buildLogSteps(run, null)).toStrictEqual([
        { label: "10000 m @ 2:12.0", targetSplit: 132, spm: 20, meters: 10000 },
      ]);
    });

    it('a mismatched/stale draft (originalIndex doesn\'t land on a real "w" step) falls back safely instead of crashing or mislabeling', () => {
      const { run } = runFor("Calm Sea", 0, {
        completedAt: new Date(NOW.getTime() + 2560 * 1000).toISOString(),
        actuals: {},
      });
      // A draft that does NOT match this run at all: its steps[1] (the
      // index Calm Sea's work phase's originalIndex points at) is a
      // second warm-up, not a "w" step — draftWorkStep must return
      // undefined here, not throw, not silently mislabel.
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
        { label: "10000 m @ 2:12.0", targetSplit: 132, spm: 20, meters: 10000 },
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
      const built = buildRun(draft, BASELINES, 1, NOW);
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
      const built = buildRun(draft, BASELINES, 0, NOW);
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
      const built = buildRun(draft, BASELINES, 1, NOW);
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
    const { run } = runFor("Hoarfrost", 0, {
      completedAt: new Date(NOW.getTime() + 46 * 60 * 1000).toISOString(),
    });
    expect(logTotals(run)).toStrictEqual({
      dateLabel: "AUG 2",
      totalMinutes: 46,
    });
  });

  it("rounds a fractional minute to the nearest whole minute", () => {
    const { run } = runFor("Calm Sea", 0, {
      completedAt: new Date(NOW.getTime() + 90 * 1000).toISOString(), // 1.5 min
    });
    expect(logTotals(run).totalMinutes).toBe(2); // round(1.5) -> 2
  });

  it("an incomplete run (completedAt null) reads as 0 minutes and falls back to startedAt for the date, never reading the system clock", () => {
    const { run } = runFor("Calm Sea", 0, { completedAt: null });
    expect(logTotals(run)).toStrictEqual({
      dateLabel: "AUG 2", // NOW itself, run.startedAt === NOW.toISOString()
      totalMinutes: 0,
    });
  });
});
