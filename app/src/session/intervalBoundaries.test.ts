// The notched bar's arithmetic (design spec §5). Two kinds of fixture here
// on purpose: hand-built phase lists where the whole point is an EXACT
// cumulative number the reader can check by hand, and a real seeded library
// workout compiled through the real assembly (`buildDraft` -> `buildRun` ->
// `compileProgram`) for the one claim a synthetic list cannot make — that
// this module's fold produces the same interval count `compileProgram` does,
// which is what keeps the notch count and the `N OF M` caption from ever
// disagreeing.

import { describe, expect, it } from "vitest";
import { compileProgram } from "../../domain/monitor/program.js";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { buildDraft } from "./draft";
import { buildRun, type EnginePhase } from "./engine";
import { foldIntervals, intervalBoundaries } from "./intervalBoundaries";

const baselines: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const t0 = new Date("2026-08-07T09:00:00.000Z");

/** A work phase of `seconds`, with `rest` seconds folded after it. */
function work(seconds: number, rest = 0): EnginePhase[] {
  const out: EnginePhase[] = [
    { type: "work", seconds, label: "2:00.0", originalIndex: 0 },
  ];
  if (rest > 0) {
    out.push({ type: "rest", seconds: rest, label: "Rest", originalIndex: 0 });
  }
  return out;
}

/** 5 × (4:00 work + 1:00 rest) — the spec's own `2 OF 5` shape, timed so
 *  every boundary is a whole number a reader can verify: 300, 600, 900,
 *  1200. */
const FIVE_TIMED: EnginePhase[] = [
  ...work(240, 60),
  ...work(240, 60),
  ...work(240, 60),
  ...work(240, 60),
  ...work(240),
];

describe("foldIntervals — one interval per non-rest phase, rests folded onto it", () => {
  it("folds each work piece with its trailing rest, the caption's own unit", () => {
    const { groups } = foldIntervals(FIVE_TIMED);
    expect(groups).toHaveLength(5);
    expect(groups.map((g) => g.workSeconds)).toStrictEqual([
      240, 240, 240, 240, 240,
    ]);
    expect(groups.map((g) => g.restSeconds)).toStrictEqual([60, 60, 60, 60, 0]);
    // NINE phases, five intervals: the exact confusion the bar must not make.
    expect(FIVE_TIMED).toHaveLength(9);
  });

  it("folds CONSECUTIVE rests onto one interval (compileProgram's own rule)", () => {
    const { groups } = foldIntervals([
      ...work(240),
      { type: "rest", seconds: 30, label: "Rest", originalIndex: 0 },
      { type: "rest", seconds: 45, label: "Rest", originalIndex: 0 },
      ...work(240),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.restSeconds).toBe(75);
  });

  it("gives a leading rest no interval, but hands its seconds back as the lead-in", () => {
    // It belongs to no interval the caption counts (`compileProgram` will not
    // even compile it), so it gets no group — but it DOES occupy the front of
    // the bar, and the denominator (`totalSessionSecondsOf`) counts it, so
    // dropping its seconds outright would slide every notch left. Fix round 1
    // (task-4-review.md I-1): an earlier version of this test pinned exactly
    // that defect.
    const { groups, leadInSeconds } = foldIntervals([
      { type: "rest", seconds: 60, label: "Rest", originalIndex: 0 },
      ...work(240),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.restSeconds).toBe(0);
    expect(leadInSeconds).toBe(60);
  });

  it("sums CONSECUTIVE leading rests into the lead-in", () => {
    const { groups, leadInSeconds } = foldIntervals([
      { type: "rest", seconds: 60, label: "Rest", originalIndex: 0 },
      { type: "rest", seconds: 30, label: "Rest", originalIndex: 0 },
      ...work(240),
    ]);
    expect(groups).toHaveLength(1);
    expect(leadInSeconds).toBe(90);
  });

  it("a session that starts on a work piece has no lead-in", () => {
    expect(foldIntervals(FIVE_TIMED).leadInSeconds).toBe(0);
  });

  it("a rest phase with no duration contributes nothing, never NaN", () => {
    // Unreachable from `phases()` (every rest it emits carries `seconds`),
    // so this is the guard's only exercise — and it earns one, because a
    // NaN here would poison the cumulative sum and blank every notch after
    // it rather than failing where the bad phase is.
    const { groups } = foldIntervals([
      ...work(240),
      { type: "rest", label: "Rest", originalIndex: 0 },
      ...work(240),
    ]);
    expect(groups[0]!.restSeconds).toBe(0);
    expect(
      intervalBoundaries([
        ...work(240),
        { type: "rest", label: "Rest", originalIndex: 0 },
        ...work(240),
      ]).seconds,
    ).toStrictEqual([240]);
    // Same guard on the lead-in side: a durationless LEADING rest adds
    // nothing rather than NaN-ing every notch after it.
    const lead = foldIntervals([
      { type: "rest", label: "Rest", originalIndex: 0 },
      ...work(240, 60),
      ...work(240),
    ]);
    expect(lead.leadInSeconds).toBe(0);
    expect(
      intervalBoundaries([
        { type: "rest", label: "Rest", originalIndex: 0 },
        ...work(240, 60),
        ...work(240),
      ]).seconds,
    ).toStrictEqual([300]);
  });

  it("counts a target-less leading interval as an interval, exactly as compileProgram does", () => {
    // Phase WU retyped this fixture's leading `{ type: "warmup", seconds:
    // 480 }` phase to work. The property is unchanged: an interval that
    // carries no target is still an interval, and its own seconds are the
    // group's `workSeconds`.
    const { groups } = foldIntervals([
      { type: "work", seconds: 480, label: "Easy", originalIndex: 0 },
      ...work(240),
    ]);
    expect(groups.map((g) => g.workSeconds)).toStrictEqual([480, 240]);
  });

  it("carries each interval's own phase TYPE, so the bar never has to guess", () => {
    // Phase WU: the leading phase was `"warmup"` and the expected type list
    // read `["warmup", "work", "test"]`. There is no warm-up member left, so
    // the contrast this case draws is now work against test — still two
    // distinct types, still read off the phase rather than guessed.
    const { groups } = foldIntervals([
      { type: "work", seconds: 480, label: "Easy", originalIndex: 0 },
      { type: "rest", seconds: 60, label: "Rest", originalIndex: 0 },
      ...work(240, 60),
      { type: "test", label: "All out", originalIndex: 1 },
    ]);
    expect(groups.map((g) => g.type)).toStrictEqual(["work", "work", "test"]);
    // And the folded rests still belong to the interval before them.
    expect(groups.map((g) => g.restSeconds)).toStrictEqual([60, 60, 0]);
  });
});

// PHASE WU deleted the describe that stood here, `intervalBoundaries — where
// the warm-up ends` (six cases over `IntervalBoundaries.warmupEndsAt`: the
// span's position, its re-anchoring, its two null cases, and the guard
// against mistaking a leading WORK interval for a warm-up). The field is
// gone with the concept, and `TimerRuler`'s lighter warm-up fill that was
// its only consumer went with it — there is no toned span left to place.

describe("intervalBoundaries — the notch positions", () => {
  it("a 5-interval timed session gives 4 boundaries at cumulative seconds", () => {
    const { seconds, predictedFrom } = intervalBoundaries(FIVE_TIMED);
    // 4:00 + 1:00 = 5:00 per interval, so the interior boundaries land at
    // 5:00, 10:00, 15:00, 20:00. Four notches for five intervals.
    expect(seconds).toStrictEqual([300, 600, 900, 1200]);
    expect(predictedFrom).toBe(0); // nothing measured yet: all estimates
  });

  it("re-anchors a completed interval that ran 20% long, and RE-FLOWS the rest", () => {
    // Interval 1's work took 288s instead of 240 (+20%). Its own boundary
    // moves right by 48s and every later boundary moves with it — the
    // upcoming ones keep their estimated spans, they just start later.
    const { seconds, predictedFrom } = intervalBoundaries(FIVE_TIMED, [288]);
    expect(seconds).toStrictEqual([348, 648, 948, 1248]);
    expect(seconds[0]).toBe(300 + 48);
    expect(predictedFrom).toBe(1); // boundary 0 is a fact; 1 onward are not
  });

  it("keeps the notch at the estimate when the same interval ran exactly as programmed", () => {
    expect(intervalBoundaries(FIVE_TIMED, [240]).seconds).toStrictEqual([
      300, 600, 900, 1200,
    ]);
  });

  it("re-flows again after each further completion, and stops predicting later", () => {
    // Interval 2 came in 30s FAST after interval 1's 48s overrun: boundary 1
    // sits 18s right of its estimate, and 3/4 follow it.
    const { seconds, predictedFrom } = intervalBoundaries(
      FIVE_TIMED,
      [288, 210],
    );
    expect(seconds).toStrictEqual([348, 618, 918, 1218]);
    expect(predictedFrom).toBe(2);
    // And once every interval that HAS a boundary is measured, nothing on
    // the bar is a guess any more.
    const all = intervalBoundaries(FIVE_TIMED, [288, 210, 240, 240]);
    expect(all.predictedFrom).toBeNull();
    expect(all.seconds).toStrictEqual([348, 618, 918, 1218]);
  });

  it("measures the WORK and programs the REST (the actual covers the work bout only)", () => {
    // 288s of measured work + the interval's programmed 60s rest = 348.
    // Feeding 288 must not be read as the whole interval.
    expect(intervalBoundaries(FIVE_TIMED, [288]).seconds[0]).toBe(348);
  });

  it("an unpriceable interval stops the notching THERE and everywhere after it", () => {
    // Interval 3 is an open-ended "test" piece: `phaseSeconds` returns null
    // (neither seconds nor a priced distance), so its own boundary and both
    // boundaries after it are omitted rather than collapsed to zero width.
    const phases: EnginePhase[] = [
      ...work(240, 60),
      ...work(240, 60),
      { type: "test", label: "All out", originalIndex: 0 },
      { type: "rest", seconds: 60, label: "Rest", originalIndex: 0 },
      ...work(240, 60),
      ...work(240),
    ];
    expect(foldIntervals(phases).groups).toHaveLength(5);
    const { seconds } = intervalBoundaries(phases);
    expect(seconds).toStrictEqual([300, 600]);
  });

  it("stops at an unpriceable DISTANCE piece too (effort ref, no baselines to price it)", () => {
    const phases: EnginePhase[] = [
      ...work(240, 60),
      // A distance phase with no `targetSplit` — `phaseSeconds` cannot
      // price meters without one (domain/expand.ts).
      { type: "work", meters: 2000, label: "ALL OUT", originalIndex: 0 },
      ...work(240),
    ];
    expect(intervalBoundaries(phases).seconds).toStrictEqual([300]);
  });

  it("prices a distance interval from its resolved split when it HAS one", () => {
    const phases: EnginePhase[] = [
      {
        type: "work",
        meters: 2000,
        targetSplit: 120,
        label: "2:00.0",
        originalIndex: 0,
      },
      { type: "rest", seconds: 180, label: "Rest", originalIndex: 0 },
      {
        type: "work",
        meters: 2000,
        targetSplit: 120,
        label: "2:00.0",
        originalIndex: 0,
      },
    ];
    // (2000 / 500) * 120 = 480, + 180 rest = 660.
    expect(intervalBoundaries(phases).seconds).toStrictEqual([660]);
  });

  it("a session that OPENS with a rest still puts its notches where that rest leaves them", () => {
    // The review's worked case (task-4-review.md I-1), the shape
    // `validate.ts`/`builderState.ts`/`bulk.ts` all accept and
    // `compileProgram` alone rejects: `[5:00 rest, 4 x (4:00 + 1:00)]` with
    // no rest after the last piece. `totalSessionSecondsOf` prices the whole
    // list at 300 + 4x240 + 3x60 = 1440, and the first interval genuinely
    // ends at 300 + 240 + 60 = 600 (41.7% of the bar). Before the fix this
    // read 300 (20.8%) — every notch was short by the lead-in.
    const phases: EnginePhase[] = [
      { type: "rest", seconds: 300, label: "Rest", originalIndex: 0 },
      ...work(240, 60),
      ...work(240, 60),
      ...work(240, 60),
      ...work(240),
    ];
    const total = phases.reduce((sum, p) => sum + (p.seconds ?? 0), 0);
    expect(total).toBe(1440);
    const { seconds } = intervalBoundaries(phases);
    expect(foldIntervals(phases).groups).toHaveLength(4);
    expect(seconds).toStrictEqual([600, 900, 1200]);
    // As percentages of the bar the rower sees, that is 41.7 / 62.5 / 83.3 —
    // said here in a comment, not in three more assertions. The
    // `toBeCloseTo` trio that used to follow divided two literals this test
    // had already pinned (`seconds` on the line above, `total` three lines
    // up), so any regression trips one of those first; and
    // `intervalBoundaries.ts` computes no percentages at all — the real
    // producer is `notchPercents` in `TimerRuler.tsx`, which this file does
    // not import. Proven: with `notchPercents` gutted to `return []`, all 33
    // tests here still passed (test-integrity sweep, S0a). The percentages
    // themselves are covered off real inline `style.left` values, by
    // `Timer.test.tsx`'s own "the notches land where the boundaries are".
  });

  it("re-anchors on top of the lead-in, never instead of it", () => {
    const phases: EnginePhase[] = [
      { type: "rest", seconds: 300, label: "Rest", originalIndex: 0 },
      ...work(240, 60),
      ...work(240),
    ];
    // Interval 0's work actually took 288s: 300 + 288 + 60.
    expect(intervalBoundaries(phases, [288]).seconds).toStrictEqual([648]);
  });

  it("an unpriceable FIRST interval leaves no boundary to draw at all", () => {
    // task-4-review.md M-5: the honest stop firing on interval 0 hands the
    // bar an empty array, and `TimerRuler` falls back to the quarter ruler.
    const phases: EnginePhase[] = [
      { type: "test", label: "All out", originalIndex: 0 },
      ...work(240, 60),
      ...work(240),
    ];
    expect(foldIntervals(phases).groups).toHaveLength(3);
    expect(intervalBoundaries(phases)).toStrictEqual({
      seconds: [],
      predictedFrom: null,
    });
  });

  it("a single-interval session has no interior boundary at all", () => {
    expect(intervalBoundaries(work(1200))).toStrictEqual({
      seconds: [],
      predictedFrom: null,
    });
    expect(intervalBoundaries([])).toStrictEqual({
      seconds: [],
      predictedFrom: null,
    });
  });

  it("an unpriceable LAST interval costs no boundary (there is none after it)", () => {
    const phases: EnginePhase[] = [
      ...work(240, 60),
      ...work(240, 60),
      { type: "test", label: "All out", originalIndex: 0 },
    ];
    expect(intervalBoundaries(phases).seconds).toStrictEqual([300, 600]);
  });

  it("a measurement for a LATER interval still leaves the earlier ones predicted", () => {
    // A gap (the machine filed an actual with no interval identity, so
    // interval 0 has none) must not read as "everything from here is
    // measured": boundary 0 is an estimate, so every boundary after it
    // inherits that estimate's error.
    const measured: (number | undefined)[] = [];
    measured[1] = 300;
    const { seconds, predictedFrom } = intervalBoundaries(FIVE_TIMED, measured);
    expect(seconds).toStrictEqual([300, 660, 960, 1260]);
    expect(predictedFrom).toBe(0);
  });
});

describe("intervalBoundaries — against a real library workout", () => {
  // "Filling Low": an 8:00 easy opener then 4 × 2000 m with 3:00 rest — the
  // same fixture the connected model's own tests use, and the shape the
  // spec's `2 OF 5` example describes. The opener used to come from
  // `buildRun`'s warm-up SETTING argument, which Phase WU deleted; an
  // authored 8' EASY step produces a phase with the same 480 s, so every
  // boundary literal below is unchanged.
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: "filling-low",
    title: w.title,
    type: w.type as WorkoutType,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { effort: "min" },
      },
      ...w.steps,
    ],
  });
  const phases = buildRun(draft, baselines, t0).phases;
  const program = compileProgram(phases);
  if ("code" in program) throw new Error(`fixture failed: ${program.code}`);

  it("folds to exactly the intervals compileProgram emits — the caption's own count", () => {
    expect(foldIntervals(phases).groups).toHaveLength(program.intervals.length);
    expect(program.intervals).toHaveLength(5);
  });

  it("draws one fewer notch than the caption counts, never one per phase", () => {
    const { seconds } = intervalBoundaries(phases);
    expect(seconds).toHaveLength(program.intervals.length - 1);
    expect(seconds).toHaveLength(4);
    // The phase list is longer than the interval list, and the bar must not
    // follow it.
    expect(phases.length).toBeGreaterThan(program.intervals.length);
  });

  it("puts the first boundary at the end of the opening interval plus its rest, and rises from there", () => {
    const { seconds } = intervalBoundaries(phases);
    // The whole array, not `seconds[0]` plus a loop over an unpinned length
    // (test-integrity sweep, P6): the length was never asserted, so a
    // truncated array ran the monotonicity body zero times and the "rises
    // from there" half of this title evaporated. Proven: a `break;` after
    // `seconds.push(cumulative)`, emitting exactly one boundary, passed.
    //
    // 480 is the 8:00 opener with no rest after it; each 2000 m at the
    // 2:06.0 target split is 504 s, and each rest 180, so the groups after
    // it land 684 apart.
    expect(seconds).toStrictEqual([480, 1164, 1848, 2532]);
    for (let i = 1; i < seconds.length; i += 1) {
      expect(seconds[i]!).toBeGreaterThan(seconds[i - 1]!);
    }
  });

  it("re-anchors the real workout's first 2000 m off the machine's own actual", () => {
    const measured: (number | undefined)[] = [];
    measured[1] = 500; // the 2000 m took 8:20 against its estimate
    const estimated = intervalBoundaries(phases).seconds;
    const anchored = intervalBoundaries(phases, measured).seconds;
    expect(anchored[0]).toBe(estimated[0]); // the opener is untouched
    expect(anchored[1]).toBe(480 + 500 + 180);
    expect(anchored[1]).not.toBe(estimated[1]);
    // Every later boundary moves by the SAME correction, not by its own.
    expect(anchored[2]! - estimated[2]!).toBe(anchored[1]! - estimated[1]!);
  });
});
