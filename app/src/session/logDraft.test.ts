import { describe, it, expect } from "vitest";
import { STARTER_WORKOUTS } from "../../server/seed/starter";
import type { Baselines, Step, WorkoutType } from "../../domain/types.js";
import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import { buildDraft, withNudge } from "./draft";
import type { SessionDraft } from "./draft";
import { buildRun } from "./engine";
import type { SessionRun } from "./run";
import { buildLogSteps, buildManualLogSteps, logTotals } from "./logDraft";

// Realistic fixtures throughout (repo convention, CLAUDE.md's own recurring
// failure #3): every table below is a REAL starter from server/seed/starter.ts,
// not a hand-built minimum.
//   - Microburst (AN): the effort-ref fixture (ref: {effort: "max"}), 10 reps
//     of a 0.5-minute piece — the task brief's own `0:30 @ MAX` example is
//     this exact step, and (F1/F1b review) both doors must render it
//     identically.
//   - Jet Stream (O2): a single, non-repeated DISTANCE work step (10000m) —
//     the kept-vs-discarded stopwatch-actual fixture, and (F1b) the
//     mismatched/no-draft fallback fixture.
//   - Cold Front (AT): wu + a reps-marker block of 4x2000m @ 6k+1 with 5'
//     auto-rest — proves wu/rest/reps-marker never leak into the LogStep
//     list even when the workout actually has them.
//   - Doldrums (O2): wu + a reps-marker block of 2x20' @ 6k+16 with 3' rest —
//     a split-ref TIME work step, for the "completed time phase -> assumed"
//     rule (the engine never records an actuals entry for a time phase at
//     all, so this fixture needs no special-casing to hit that branch).
//   - Nor'easter (TR): three SEQUENTIAL distance steps at 2k+2 / 2k+0 / 2k-2
//     — no reps marker, covers all three `refLabel` sign branches for the
//     manual builder, and (F1b) the removed-step draft-lookup fixture.
function starter(title: string) {
  const w = STARTER_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing starter fixture: ${title}`);
  return w;
}

// The real starter's own work step, verbatim — same idiom
// SessionComplete.test.tsx's `completeDraftAndRun` already established
// (find a real step, reuse the object, never retype its fields by hand) —
// used below to assemble a custom multi-kind draft out of genuine starter
// step shapes rather than a hand-invented one.
function workStepFrom(title: string): Extract<Step, { k: "w" }> {
  const step = starter(title).steps.find((s) => s.k === "w");
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
  const w = starter(title);
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
  it("Microburst: 10 effort work phases each omit targetSplit/actualSplit/actualSource entirely (5G rule); label carries the chip word straight from the draft's real ref (F1b's primary, draft-based path)", () => {
    // wu(5') + reps(10) x [w{0.5min, effort:max, spm:32, rest 2.5'}] ->
    // 1 warmup + 10*(work+rest) = 21 phases; work at positions
    // 1,3,5,7,9,11,13,15,17,19. estimationSplit(max) = baselines.k2Seconds
    // = 100 (irrelevant here — never surfaced). draft.steps[originalIndex]
    // for every work phase is the SAME authored step (Microburst's sole "w"
    // step, repeated via the reps marker), ref {effort:"max"} ->
    // refLabel = "MAX". duration = fmtDuration(0.5) = "0:30".
    const { draft, run } = runFor("Microburst", 3, {
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

  it("F1: Microburst's effort step logs the IDENTICAL label through either door", () => {
    const { draft, run } = runFor("Microburst", 3, {
      completedAt: NOW.toISOString(),
    });
    const runDoorLabels = buildLogSteps(run, draft).map((s) => s.label);
    const manualDoorLabels = buildManualLogSteps(
      { steps: starter("Microburst").steps },
      BASELINES,
    ).map((s) => s.label);
    expect(runDoorLabels).toStrictEqual(manualDoorLabels);
    expect(runDoorLabels[0]).toBe("0:30 @ MAX");
  });

  it("F1b: a mixed split+effort+distance workout logs BYTE-IDENTICAL labels through either door, for every step — not just the effort case F1 originally fixed", () => {
    // A custom draft assembled from three real starters' own work steps
    // (SessionComplete.test.tsx's established pattern: reuse the real step
    // object, never hand-retype it) — no single starter mixes all three
    // kinds, so this is the realistic way to exercise all three in one
    // workout: Doldrums' split TIME step (20' @ 6k+16), Microburst's
    // EFFORT step (0.5' @ MAX), Cold Front's split DISTANCE step
    // (2000m @ 6k+1). No reps marker, so each appears exactly once.
    const steps: Step[] = [
      { k: "wu", minutes: 5 },
      workStepFrom("Doldrums"),
      workStepFrom("Microburst"),
      workStepFrom("Cold Front"),
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
      "20:00 @ 6k +16",
      "0:30 @ MAX",
      "2000 m @ 6k +1",
    ]);
  });

  it("F1b: a removed step doesn't shift the surviving phases' draft lookup — indexing is by originalIndex, not position, so it survives a removed sibling", () => {
    // Nor'easter: wu(0) + w1(1, 750m@2k+2) + w2(2, 750m@2k+0) +
    // w3(3, 500m@2k-2), no reps marker. Removing w2 (index 2) must not
    // shift w3's lookup down to index 2 (w2's OWN ref) — it has to stay 3.
    const nor = starter("Nor'easter");
    const draft: SessionDraft = {
      ...buildDraft({
        id: "id-removed",
        title: nor.title,
        type: nor.type as WorkoutType,
        steps: nor.steps,
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
      "750 m @ 2k +2", // w1 (index 1) — untouched by w2's removal
      "500 m @ 2k −2", // w3 (index 3) — NOT w2's "750 m @ 2k" (index 2)
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
    // buildLogSteps' draft-matched path. Re-runs the existing Microburst
    // mixed-kind equality straight from this file's own MIXED_STEPS fixture
    // (see the "F1b: a mixed split+effort+distance workout" test below) to
    // confirm it's untouched by this fix round — asserted again here,
    // colocated with F2's own tests, rather than only trusting the older
    // test not to have silently started disagreeing.
    const doldrums = starter("Doldrums");
    const splitWork = doldrums.steps.find((s) => s.k === "w") as Extract<
      Step,
      { k: "w" }
    >;
    const draft = buildDraft({
      id: "id-f2-manual-equality",
      title: doldrums.title,
      type: doldrums.type as WorkoutType,
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

  it("Jet Stream: a kept stopwatch actual passes through unchanged, keeping meters (not seconds)", () => {
    // wu(5') + w{10000m @ 6k+8, spm 21} -> phases: [warmup, work]. draft's
    // real ref {base:"6k", off:8} -> refLabel "6k +8". Elapsed 2500s on
    // 10000m -> splitSeconds = (2500/10000)*500 = 125.0 exactly.
    const { draft, run } = runFor("Jet Stream", 0, {
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
    const steps = buildLogSteps(run, draft);
    expect(steps).toStrictEqual([
      {
        label: "10000 m @ 6k +8",
        targetSplit: 128,
        actualSplit: 125,
        actualSource: "stopwatch",
        spm: 21,
        meters: 10000,
      },
    ]);
  });

  it("Jet Stream: no recorded actual on a distance phase means the split was DISCARDED — absence, not an assumed/zero value", () => {
    const { draft, run } = runFor("Jet Stream", 0, {
      completedAt: new Date(NOW.getTime() + 2560 * 1000).toISOString(),
      actuals: {},
    });
    const steps = buildLogSteps(run, draft);
    expect(steps).toStrictEqual([
      { label: "10000 m @ 6k +8", targetSplit: 128, spm: 21, meters: 10000 },
    ]);
  });

  it("Cold Front: wu and the auto-inserted rest phases never become LogSteps, even inside a reps-marker block; kept and discarded actuals interleave correctly by position", () => {
    // wu(5') + reps(4) x [w{2000m @ 6k+1, spm 25, rest 5'}] -> 1 + 4*(work+
    // rest) = 9 phases; work at 1,3,5,7. draft's real ref {base:"6k",
    // off:1} -> refLabel "6k +1" for every occurrence (same authored step,
    // repeated by the reps marker — originalIndex is identical for all 4).
    // Reps 1 & 3 (positions 1 & 5) kept: 850/2000*500 = 212.5,
    // 800/2000*500 = 200.0. Reps 2 & 4 (positions 3 & 7) discarded (no
    // actuals entry).
    const { draft, run } = runFor("Cold Front", 0, {
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
    const label = "2000 m @ 6k +1";
    expect(buildLogSteps(run, draft)).toStrictEqual([
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
    // work at 1,3. draft's real ref {base:"6k", off:16} -> refLabel
    // "6k +16"; fmtDuration(20) = "20:00".
    const { draft, run } = runFor("Doldrums", 0, {
      completedAt: new Date(NOW.getTime() + 46 * 60 * 1000).toISOString(),
      actuals: {},
    });
    expect(run.phases).toHaveLength(5);
    const label = "20:00 @ 6k +16";
    expect(buildLogSteps(run, draft)).toStrictEqual([
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
      const { run } = runFor("Microburst", 3, {
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
      const { run } = runFor("Jet Stream", 0, {
        completedAt: new Date(NOW.getTime() + 2560 * 1000).toISOString(),
        actuals: {},
      });
      // toleranceRange(128, tol=0).label = fmtSplit(128) = "2:08.0" — the
      // pre-F1b resolved-split text, not "6k +8".
      expect(buildLogSteps(run, null)).toStrictEqual([
        { label: "10000 m @ 2:08.0", targetSplit: 128, spm: 21, meters: 10000 },
      ]);
    });

    it('a mismatched/stale draft (originalIndex doesn\'t land on a real "w" step) falls back safely instead of crashing or mislabeling', () => {
      const { run } = runFor("Jet Stream", 0, {
        completedAt: new Date(NOW.getTime() + 2560 * 1000).toISOString(),
        actuals: {},
      });
      // A draft that does NOT match this run at all: its steps[1] (the
      // index Jet Stream's work phase's originalIndex points at) is a
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
        { label: "10000 m @ 2:08.0", targetSplit: 128, spm: 21, meters: 10000 },
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
      const jetStream = starter("Jet Stream");
      const distanceWork = jetStream.steps.find((s) => s.k === "w") as Extract<
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
      // same chip-idiom label ("6k +8") this file's other draft-based tests
      // already pin.
      expect(steps[1]!.label).toBe("10000 m @ 6k +8");
      expect(steps[1]!.targetSplit).toBe(128);
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
    // at 6 chars, off bound ±60 per domain/validate.ts's checkRef) tops
    // out on a tolerance RANGE ("m:ss.t–m:ss.t", 13 chars for two 6-char
    // fmtSplit values joined by an en dash) rather than an exact split or
    // an effort word ("ALL OUT" is only 7). 7 + " @ " (3) + 13 = 23,
    // nowhere near 80.
    const longest = `${fmtDuration(180)} @ ${fmtSplit(60)}–${fmtSplit(240)}`;
    expect(longest).toBe("3:00:00 @ 1:00.0–4:00.0");
    expect(longest.length).toBeLessThanOrEqual(80);
    expect(longest.length).toBe(23);
  });
});

describe("buildManualLogSteps", () => {
  it("Microburst: an authored effort step resolves to the ref chip 'MAX' (F1: identical to the session door's label — see the both-doors equality tests above), omitting targetSplit/actualSplit/actualSource", () => {
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
      const jetStream = starter("Jet Stream");
      const distanceWork = jetStream.steps.find((s) => s.k === "w") as Extract<
        Step,
        { k: "w" }
      >;
      const steps: Step[] = [{ k: "test", label: "6k test" }, distanceWork];
      const built = buildManualLogSteps({ steps }, BASELINES);
      expect(built).toHaveLength(2);
      expect(built[0]).toStrictEqual({ label: "6k test" });
      expect(built[1]).toStrictEqual({
        label: "10000 m @ 6k +8",
        targetSplit: 128,
        actualSplit: 128,
        actualSource: "assumed",
        spm: 21,
        meters: 10000,
      });
    });
  });
});

describe("logTotals", () => {
  it("Doldrums: dateLabel is the house 'JUL 25' format read from completedAt, totalMinutes is the REAL wall-clock length rounded to the nearest minute", () => {
    // completedAt = startedAt + 46 real minutes (2760s) -> round(2760/60) =
    // 46 exactly, not the workout's PROGRAMMED length (4 + 2*(20+3) = 50
    // minutes) — a real session can run long or short of its own estimate,
    // and the Log screen is recording what happened, not the plan.
    const { run } = runFor("Doldrums", 0, {
      completedAt: new Date(NOW.getTime() + 46 * 60 * 1000).toISOString(),
    });
    expect(logTotals(run)).toStrictEqual({
      dateLabel: "AUG 2",
      totalMinutes: 46,
    });
  });

  it("rounds a fractional minute to the nearest whole minute", () => {
    const { run } = runFor("Jet Stream", 0, {
      completedAt: new Date(NOW.getTime() + 90 * 1000).toISOString(), // 1.5 min
    });
    expect(logTotals(run).totalMinutes).toBe(2); // round(1.5) -> 2
  });

  it("an incomplete run (completedAt null) reads as 0 minutes and falls back to startedAt for the date, never reading the system clock", () => {
    const { run } = runFor("Jet Stream", 0, { completedAt: null });
    expect(logTotals(run)).toStrictEqual({
      dateLabel: "AUG 2", // NOW itself, run.startedAt === NOW.toISOString()
      totalMinutes: 0,
    });
  });
});
