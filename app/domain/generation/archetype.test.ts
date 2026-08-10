import { describe, it, expect } from "vitest";
import { classifyArchetype, nearDuplicates } from "./archetype.js";
import type { PaceRef, Step, WorkDuration, WorkoutInput } from "../types.js";

// ---------------------------------------------------------------------
// HAND LABELS — written before `archetype.ts` earned them (spec-blind-
// tests discipline: the labels are the spec, not an echo of the code).
// Every fixture below is copied verbatim from a real seed workout (file:
// line cited), read and classified BY HAND from its comment + step shape
// alone. Two entries are deliberate DISAGREEMENTS between what a human
// reader might call the workout and what the spec's computable definition
// (§5b, over the liveSteps-expanded signature) actually produces — both
// resolved in favor of the computable rule, per the brief's own framing
// ("the labels are the spec, the classifier must earn them"): a hand label
// that only a human eye can produce (reading "ladder" off a rep count, or
// "pyramid" off a comment's own word) is not itself computable and was
// re-derived from the expanded duration sequence instead.
//
// | title              | type | source            | expanded durations (min or m) | hand label            | reasoning |
// |---|---|---|---|---|---|
// | Fine Weather        | O2 | o2.ts:623  | [40]                          | continuous, rc=false  | one live work step |
// | Glass Sea           | O2 | o2.ts:709  | [60]                          | continuous, rc=false  | one live work step |
// | Fair Wind           | O2 | o2.ts:751  | [70]                          | continuous, rc=false  | one live work step |
// | Sleet               | O2 | o2.ts:2120 | [65]                          | continuous, rc=false  | one live work step |
// | Morning Mist        | O2 | o2.ts:1478 | [15000] (distance)            | continuous, rc=false  | one live work step, kind irrelevant at n=1 |
// | Occluded Front      | AT | at.ts:13   | [10]                          | continuous, rc=false  | one live work step |
// | Beam Sea            | TR | tr.ts:16   | [2000] (distance)             | continuous, rc=false  | one live work step |
// | Sea Fret            | O2 | o2.ts:18   | [4,4] (reps 2)                | nxtime, rc=false      | equal time durations, spm 22 both |
// | Petrichor           | O2 | o2.ts:35   | [3,3,3]                       | nxtime, rc=TRUE       | equal durations, spm 20/22/24 |
// | Thermal Low         | AT | at.ts:936  | [5,5,5,5]                     | nxtime, rc=false      | equal durations, spm 24 throughout |
// | Scud Cloud          | AN | an.ts:18   | [.5]x5 (reps 5)               | nxtime, rc=false      | equal durations, spm 28 throughout |
// | Laminar             | O2 | o2.ts:64   | [1000,1000,1000] (distance)   | nxdistance, rc=TRUE   | equal distances, spm 20/22/24 |
// | Hail Shaft          | AN | an.ts:1135 | [300]x10 (reps 10, distance)  | nxdistance, rc=false  | equal distances, spm 32 throughout |
// | Tule Fog            | O2 | o2.ts:456  | [6,9,12]                      | ladder, rc=TRUE       | strictly increasing, spm 20/22/24 |
// | Ice Fog             | O2 | o2.ts:485  | [12,9,6,3]                    | ladder, rc=TRUE       | strictly decreasing, spm 18/20/22/24 |
// | Barometric Low      | AT | at.ts:117  | [4,3,2]                       | ladder, rc=TRUE       | strictly decreasing, spm 22/24/26 |
// | Line Squall         | TR | tr.ts:558  | [500,750,1000,1250] (distance)| ladder, rc=TRUE       | strictly increasing, spm 28/26/26/24 |
// | Millpond            | O2 | o2.ts:125  | [2,3,4,3,2]                   | pyramid, rc=false     | strict up then strict down, spm 22 constant |
// | Pressure Ridge      | AT | at.ts:57   | [1,2,3,2,1]                   | pyramid, rc=TRUE      | strict up-down, spm 26/24/24/24/26 |
// | Benguela Current    | TR | tr.ts:176  | [250,500,750,500,250] (dist)  | pyramid, rc=TRUE      | strict up-down, spm 26/24/24/24/26 |
// | Beaver Tail         | AN | an.ts:86   | [.5,.75,1,.75,.5]             | pyramid, rc=TRUE      | strict up-down, spm 30/28/26/28/30 |
// | Baroclinic Zone     | AT | at.ts:454  | [3,2,3,2,3,2] (reps 3 x [3,2])| MIXED, rc=TRUE        | expanded seq is up-down-up-down-up-down, not a single up-then-down arc — not monotonic, not a pyramid shape either |
// | Giant Hail          | AN | an.ts:1111 | [1.25,.5]x4 (reps 4, effort)  | MIXED (disagreement — see below), rc=false | expanded is a repeated 2-cycle, non-monotonic |
// | Flash Flood         | AN | an.ts:1152 | [.5,.75,1,1.5]x2 (reps 2)     | MIXED (disagreement — see below), rc=TRUE | expanded ascending-block-x2 is non-monotonic overall |
// | Bomb Cyclone        | AN | an.ts:1514 | [1.25,1,.75,.5]x2 (reps 2)    | MIXED (disagreement — see below), rc=false | expanded descending-block-x2 is non-monotonic overall |
// | Sundowner           | TR | tr.ts:1388 | [1000,500,250,500,1000] (dist)| MIXED (disagreement — see below), rc=TRUE | a VALLEY (down-then-up), not a peak — §5b's pyramid is "strictly up then strictly down" only |
// | Debris Flow         | AN | an.ts:1190 | [1.5,1.25,1,.75,.5], last=effort | ladder, rc=TRUE    | strictly decreasing durations; ref kind (4 split + 1 effort) does not affect archetype |
//
// DISAGREEMENTS resolved in the classifier's favor (documented, not
// silently absorbed):
//  - Giant Hail/Flash Flood/Bomb Cyclone: their own seed comments call
//    these "rounds of a ladder"/"ascending"/"descending" — a human
//    skimming the comment reaches for "ladder". But the classifier
//    operates over the FULL liveSteps-expanded signature (this task's own
//    interface contract), and repeating a 2-4 step block via a `reps`
//    marker makes the whole sequence non-monotonic the moment the block
//    repeats (up-down-up-down, never a single monotonic run). "mixed" is
//    the computably correct answer; it also happens to be the reading
//    that makes `nearDuplicates` group these three together on
//    (archetype, pieceCount, ~total, effortShare) — see the M3 test below,
//    which asserts that grouping explicitly rather than treating it as an
//    accident.
//  - Sundowner: the seed comment itself calls it "the pyramid upside
//    down" — but a valley is the mirror image of the shape §5b defines
//    ("strictly up then strictly down"), not an instance of it. The
//    computable definition does not special-case an inverted peak, so
//    this hand label follows the definition over the comment's own words.
// ---------------------------------------------------------------------

// Small helper so fixtures below read close to the seed file's own shape.
const w = (
  duration: WorkDuration,
  ref: PaceRef,
  spm: number | undefined,
  restMinutes?: number,
): Step => ({ k: "w", duration, ref, spm, restMinutes });
const t = (minutes: number) => ({ kind: "time" as const, minutes });
const d = (meters: number) => ({ kind: "distance" as const, meters });
const reps = (count: number): Step => ({ k: "reps", count });

describe("classifyArchetype", () => {
  describe("continuous — exactly one live work step", () => {
    it("Fine Weather (o2.ts:623): 40' single time step", () => {
      const steps = [w(t(40), { base: "6k", off: 12 }, 20)];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "continuous",
        rateChange: false,
      });
    });

    it("Morning Mist (o2.ts:1478): 15000m single distance step — kind doesn't matter at n=1", () => {
      const steps = [w(d(15000), { base: "6k", off: 12 }, 20)];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "continuous",
        rateChange: false,
      });
    });

    it("Occluded Front (at.ts:13): single AT threshold step", () => {
      const steps = [w(t(10), { base: "6k", off: 4 }, 22)];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "continuous",
        rateChange: false,
      });
    });

    it("Beam Sea (tr.ts:16): single TR distance step", () => {
      const steps = [w(d(2000), { base: "2k", off: 6 }, 24)];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "continuous",
        rateChange: false,
      });
    });
  });

  describe("nxtime — reps/identical time-based work steps", () => {
    it("Sea Fret (o2.ts:18): 2x4' identical, no rate change", () => {
      const steps = [reps(2), w(t(4), { base: "6k", off: 12 }, 22, 1)];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "nxtime",
        rateChange: false,
      });
    });

    it("Petrichor (o2.ts:35): 3x3' equal duration, spm climbs 20->22->24", () => {
      const steps = [
        w(t(3), { base: "6k", off: 12 }, 20, 0.5),
        w(t(3), { base: "6k", off: 12 }, 22, 0.5),
        w(t(3), { base: "6k", off: 12 }, 24),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "nxtime",
        rateChange: true,
      });
    });

    it("Thermal Low (at.ts:936): 4x5' identical, spm 24 throughout", () => {
      const steps = [
        w(t(5), { base: "6k", off: 1 }, 24, 3),
        w(t(5), { base: "6k", off: 1 }, 24, 2),
        w(t(5), { base: "6k", off: 1 }, 24, 1),
        w(t(5), { base: "6k", off: 1 }, 24),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "nxtime",
        rateChange: false,
      });
    });

    it("Scud Cloud (an.ts:18): reps 5 x 30s, expands to 5 equal live steps", () => {
      const steps = [reps(5), w(t(0.5), { base: "2k", off: -3 }, 28, 1.5)];
      const { archetype } = classifyArchetype(steps);
      expect(archetype).toBe("nxtime");
    });
  });

  describe("nxdistance — reps/identical distance-based work steps", () => {
    it("Laminar (o2.ts:64): 3x1000m equal distance, rate climbs", () => {
      const steps = [
        w(d(1000), { base: "6k", off: 12 }, 20),
        w(d(1000), { base: "6k", off: 12 }, 22),
        w(d(1000), { base: "6k", off: 12 }, 24),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "nxdistance",
        rateChange: true,
      });
    });

    it("Hail Shaft (an.ts:1135): reps 10 x 300m all-out, constant spm", () => {
      const steps = [reps(10), w(d(300), { effort: "max" }, 32, 2)];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "nxdistance",
        rateChange: false,
      });
    });
  });

  describe("ladder — strictly monotonic durations, same kind", () => {
    it("Tule Fog (o2.ts:456): 6'/9'/12' ascending", () => {
      const steps = [
        w(t(6), { base: "6k", off: 12 }, 20, 1.5),
        w(t(9), { base: "6k", off: 11 }, 22, 1.5),
        w(t(12), { base: "6k", off: 10 }, 24),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "ladder",
        rateChange: true,
      });
    });

    it("Ice Fog (o2.ts:485): 12'/9'/6'/3' descending", () => {
      const steps = [
        w(t(12), { base: "6k", off: 12 }, 18, 1.5),
        w(t(9), { base: "6k", off: 11 }, 20, 1),
        w(t(6), { base: "6k", off: 10 }, 22, 0.5),
        w(t(3), { base: "6k", off: 8 }, 24),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "ladder",
        rateChange: true,
      });
    });

    it("Line Squall (tr.ts:558): 500/750/1000/1250m ascending distance ladder", () => {
      const steps = [
        w(d(500), { base: "2k", off: 0 }, 28, 2),
        w(d(750), { base: "2k", off: 1 }, 26, 2.5),
        w(d(1000), { base: "2k", off: 2 }, 26, 3),
        w(d(1250), { base: "2k", off: 3 }, 24),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "ladder",
        rateChange: true,
      });
    });

    it("2-rung boundary (synthetic): two DIFFERENT durations is a ladder, not nxtime", () => {
      const steps = [
        w(t(4), { base: "6k", off: 10 }, 20),
        w(t(6), { base: "6k", off: 10 }, 20),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "ladder",
        rateChange: false,
      });
    });

    it("2-rung boundary (synthetic): two EQUAL durations is nxtime, not ladder", () => {
      const steps = [
        w(t(4), { base: "6k", off: 10 }, 20),
        w(t(4), { base: "6k", off: 10 }, 20),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "nxtime",
        rateChange: false,
      });
    });

    it("Debris Flow (an.ts:1190): strictly decreasing durations, mixed ref kinds — the split/effort split does not change the archetype", () => {
      const steps = [
        w(t(1.5), { base: "2k", off: -3 }, 28, 4),
        w(t(1.25), { base: "2k", off: -4 }, 30, 3.5),
        w(t(1), { base: "2k", off: -4 }, 30, 3),
        w(t(0.75), { base: "2k", off: -4 }, 32, 2.5),
        w(t(0.5), { effort: "max" }, 32),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "ladder",
        rateChange: true,
      });
    });

    it("a tied rung then a rise (synthetic) is NOT a ladder — strictness rejects a plateau, even a partial one", () => {
      // [4,4,6]: not uniform (values differ), not strictly monotonic (the
      // first pair ties), not a pyramid (no down leg) -> mixed. This is
      // the mutation-guard for isStrictlyMonotonic's `<=` check: a mutant
      // reading `<` instead would let a tie slip through as "increasing".
      const steps = [
        w(t(4), { base: "6k", off: 10 }, 20),
        w(t(4), { base: "6k", off: 10 }, 20),
        w(t(6), { base: "6k", off: 10 }, 20),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "mixed",
        rateChange: false,
      });
    });

    it("a tied rung then a fall (synthetic) is NOT a ladder — the same strictness guard on the decreasing side", () => {
      const steps = [
        w(t(6), { base: "6k", off: 10 }, 20),
        w(t(4), { base: "6k", off: 10 }, 20),
        w(t(4), { base: "6k", off: 10 }, 20),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "mixed",
        rateChange: false,
      });
    });
  });

  describe("pyramid — strict up then strict down, peak strictly interior", () => {
    it("Millpond (o2.ts:125): 2-3-4-3-2, constant spm", () => {
      const steps = [
        w(t(2), { base: "6k", off: 12 }, 22, 1),
        w(t(3), { base: "6k", off: 12 }, 22, 1),
        w(t(4), { base: "6k", off: 12 }, 22, 1),
        w(t(3), { base: "6k", off: 12 }, 22, 1),
        w(t(2), { base: "6k", off: 12 }, 22),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "pyramid",
        rateChange: false,
      });
    });

    it("Pressure Ridge (at.ts:57): 1-2-3-2-1, spm mirrors the shape", () => {
      const steps = [
        w(t(1), { base: "6k", off: 2 }, 26, 0.5),
        w(t(2), { base: "6k", off: 2 }, 24, 0.5),
        w(t(3), { base: "6k", off: 2 }, 24, 0.5),
        w(t(2), { base: "6k", off: 2 }, 24, 0.5),
        w(t(1), { base: "6k", off: 2 }, 26),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "pyramid",
        rateChange: true,
      });
    });

    it("Benguela Current (tr.ts:176): 250-500-750-500-250m distance pyramid", () => {
      const steps = [
        w(d(250), { base: "2k", off: 3 }, 26, 1),
        w(d(500), { base: "2k", off: 3 }, 24, 1),
        w(d(750), { base: "2k", off: 3 }, 24, 1),
        w(d(500), { base: "2k", off: 3 }, 24, 1),
        w(d(250), { base: "2k", off: 3 }, 26),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "pyramid",
        rateChange: true,
      });
    });

    it("Beaver Tail (an.ts:86): 30/45/60/45/30s all-out pyramid", () => {
      const steps = [
        w(t(0.5), { base: "2k", off: -4 }, 30, 1),
        w(t(0.75), { base: "2k", off: -4 }, 28, 1.5),
        w(t(1), { base: "2k", off: -3 }, 26, 1.5),
        w(t(0.75), { base: "2k", off: -4 }, 28, 1.5),
        w(t(0.5), { base: "2k", off: -4 }, 30),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "pyramid",
        rateChange: true,
      });
    });

    it("a plateau at the peak (synthetic) is NOT a pyramid — strictness excludes a tied top rung", () => {
      const steps = [
        w(t(2), { base: "6k", off: 10 }, 20),
        w(t(4), { base: "6k", off: 10 }, 20),
        w(t(4), { base: "6k", off: 10 }, 20),
        w(t(2), { base: "6k", off: 10 }, 20),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "mixed",
        rateChange: false,
      });
    });
  });

  describe("mixed — the fallback bucket, including two documented disagreements", () => {
    it("Baroclinic Zone (at.ts:454): reps 3 x [3',2'] expands to a repeating up-down-up-down sequence", () => {
      const steps = [
        reps(3),
        w(t(3), { base: "6k", off: 4 }, 22, 1),
        w(t(2), { base: "6k", off: -1 }, 26, 1),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "mixed",
        rateChange: true,
      });
    });

    it("DISAGREEMENT: Giant Hail (an.ts:1111) reads as 'a ladder' in its own comment but expands to a non-monotonic repeated 2-cycle -> mixed", () => {
      const steps = [
        reps(4),
        w(t(1.25), { effort: "max" }, 32, 2),
        w(t(0.5), { effort: "max" }, 32, 2.5),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "mixed",
        rateChange: false,
      });
    });

    it("DISAGREEMENT: Flash Flood (an.ts:1152) 'ascending' block x2 is non-monotonic across the whole expansion -> mixed", () => {
      const steps = [
        reps(2),
        w(t(0.5), { effort: "max" }, 32, 1.5),
        w(t(0.75), { effort: "max" }, 32, 2),
        w(t(1), { effort: "max" }, 30, 2.5),
        w(t(1.5), { effort: "max" }, 30, 3.75),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "mixed",
        rateChange: true,
      });
    });

    it("DISAGREEMENT: Bomb Cyclone (an.ts:1514) 'descending' block x2 is non-monotonic across the whole expansion -> mixed", () => {
      const steps = [
        reps(2),
        w(t(1.25), { effort: "max" }, 32, 3),
        w(t(1), { effort: "max" }, 32, 2.5),
        w(t(0.75), { effort: "max" }, 32, 2),
        w(t(0.5), { effort: "max" }, 32, 1.5),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "mixed",
        rateChange: false,
      });
    });

    it("DISAGREEMENT: Sundowner (tr.ts:1388) is a VALLEY (down-then-up), the mirror of a pyramid, not an instance of one", () => {
      const steps = [
        w(d(1000), { base: "2k", off: 2 }, 26, 3),
        w(d(500), { base: "2k", off: 1 }, 28, 3),
        w(d(250), { base: "2k", off: 0 }, 28, 3),
        w(d(500), { base: "2k", off: 1 }, 28, 3),
        w(d(1000), { base: "2k", off: 2 }, 26),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "mixed",
        rateChange: true,
      });
    });

    it("mixed work-step kinds (synthetic): a time step followed by a distance step is mixed regardless of duration values", () => {
      const steps = [
        w(t(5), { base: "6k", off: 10 }, 20),
        w(d(2000), { base: "6k", off: 10 }, 20),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "mixed",
        rateChange: false,
      });
    });

    it("no live work steps (synthetic, a test-only piece): falls to mixed rather than throwing", () => {
      const steps: Step[] = [{ k: "test", label: "2k" }];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "mixed",
        rateChange: false,
      });
    });
  });

  describe("rateChange — a modifier orthogonal to archetype", () => {
    it("undefined spm values never count as a rate change (synthetic robustness case; real seed content always sets spm)", () => {
      const steps = [
        w(t(4), { base: "6k", off: 10 }, undefined),
        w(t(4), { base: "6k", off: 10 }, undefined),
      ];
      expect(classifyArchetype(steps).rateChange).toBe(false);
    });

    it("a single defined spm among otherwise-undefined steps is not a change", () => {
      const steps = [
        w(t(4), { base: "6k", off: 10 }, 20),
        w(t(4), { base: "6k", off: 10 }, undefined),
      ];
      expect(classifyArchetype(steps).rateChange).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------
// nearDuplicates
// ---------------------------------------------------------------------

const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

const workout = (
  title: string,
  steps: Step[],
  type: WorkoutInput["type"] = "O2",
): WorkoutInput => ({
  title,
  type,
  difficulty: "easy",
  pain: 1,
  steps,
});

describe("nearDuplicates", () => {
  it("flags the real O2|60+ cluster (adversarial M2/M6): four near-identical 6k+12 continuous singles", () => {
    const fairWind = workout("Fair Wind", [
      w(t(70), { base: "6k", off: 12 }, 20),
    ]);
    const morningMist = workout("Morning Mist", [
      w(d(15000), { base: "6k", off: 12 }, 20),
    ]);
    const sleet = workout("Sleet", [w(t(65), { base: "6k", off: 12 }, 20)]);
    const glassSea = workout("Glass Sea", [
      w(t(60), { base: "6k", off: 12 }, 20),
    ]);
    const pairs = nearDuplicates(
      [fairWind, morningMist, sleet, glassSea],
      BASELINES,
    );
    const names = pairs.map((p) => [p.a, p.b].sort().join(" <> ")).sort();
    // Glass Sea (60') vs Fair Wind (70') is a 14.3% gap — outside the 10%
    // window, so this real cluster produces 4 of the 6 possible pairs, not
    // all 6 (measured, not assumed — see variety-baseline.md).
    expect(names).toStrictEqual(
      [
        "Fair Wind <> Morning Mist",
        "Fair Wind <> Sleet",
        "Glass Sea <> Sleet",
        "Morning Mist <> Sleet",
      ].sort(),
    );
  });

  it("piece count is the EXPANDED liveSteps count, not the authored step count (M3's ambiguity, resolved)", () => {
    // Baroclinic Zone-shaped: reps 3 x [3',2'] = 6 live pieces, not 2.
    const a = workout("A", [
      reps(3),
      w(t(3), { base: "6k", off: 4 }, 22, 1),
      w(t(2), { base: "6k", off: -1 }, 26, 1),
    ]);
    // A hand-built 6-piece mixed workout with the same total and offset
    // band, authored as 6 flat steps rather than a reps block — if piece
    // count were read as the AUTHORED step count (2 for A, 6 for B) these
    // would never collide; under the expanded reading (6 and 6) they do.
    const b = workout("B", [
      w(t(3), { base: "6k", off: 4 }, 22, 1),
      w(t(2), { base: "6k", off: -1 }, 26, 1),
      w(t(3), { base: "6k", off: 4 }, 22, 1),
      w(t(2), { base: "6k", off: -1 }, 26, 1),
      w(t(3), { base: "6k", off: 4 }, 22, 1),
      w(t(2), { base: "6k", off: -1 }, 26),
    ]);
    const pairs = nearDuplicates([a, b], BASELINES);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.pieceCount).toBe(6);
  });

  it("the EffortRef arm (effort share + archetype + duration) groups Giant Hail/Bomb Cyclone despite neither having an offset to band (M3's original gap)", () => {
    const giantHail = workout(
      "Giant Hail",
      [
        reps(4),
        w(t(1.25), { effort: "max" }, 32, 2),
        w(t(0.5), { effort: "max" }, 32, 2.5),
      ],
      "AN",
    );
    const bombCyclone = workout(
      "Bomb Cyclone",
      [
        reps(2),
        w(t(1.25), { effort: "max" }, 32, 3),
        w(t(1), { effort: "max" }, 32, 2.5),
        w(t(0.75), { effort: "max" }, 32, 2),
        w(t(0.5), { effort: "max" }, 32, 1.5),
      ],
      "AN",
    );
    const pairs = nearDuplicates([giantHail, bombCyclone], BASELINES);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.archetype).toBe("mixed");
    expect(pairs[0]!.pieceCount).toBe(8);
  });

  it("an effort-only workout never collides with a split-only workout even when archetype/pieces/total all match", () => {
    const effortOnly = workout(
      "Effort Only",
      [w(t(10), { effort: "max" }, 30)],
      "AN",
    );
    const splitOnly = workout(
      "Split Only",
      [w(t(10.5), { base: "2k", off: -3 }, 30)],
      "AN",
    );
    // Same archetype (continuous), same piece count (1), total within 10%
    // (10 vs 10.5) — the only thing that could match is the arm neither
    // carries, and a null/null comparison must NOT be treated as equal.
    expect(nearDuplicates([effortOnly, splitOnly], BASELINES)).toHaveLength(0);
  });

  it("offset band width 4 (o2.ts:7-12's own calibration) merges nearby rungs but not distant ones", () => {
    const a = workout("A", [w(t(20), { base: "6k", off: 10 }, 20)]);
    // off 12 bands to the same bucket as off 10 (both round to 12... no —
    // band(10)=Math.round(10/4)*4=8, band(12)=Math.round(12/4)*4=12): use
    // off 11 instead, which bands to 12 and collides with off 12.
    const bNear = workout("B", [w(t(21), { base: "6k", off: 11 }, 20)]);
    const bFar = workout("C", [w(t(21), { base: "6k", off: 20 }, 20)]);
    expect(
      nearDuplicates([a, bNear], BASELINES).map((p) => [p.a, p.b]),
    ).toStrictEqual([["A", "B"]]);
    expect(nearDuplicates([a, bFar], BASELINES)).toHaveLength(0);
  });

  it("a workout carrying BOTH ref kinds (Debris Flow) compares on whichever arm the other workout also carries", () => {
    const debrisFlow = workout(
      "Debris Flow",
      [
        w(t(1.5), { base: "2k", off: -3 }, 28, 4),
        w(t(1.25), { base: "2k", off: -4 }, 30, 3.5),
        w(t(1), { base: "2k", off: -4 }, 30, 3),
        w(t(0.75), { base: "2k", off: -4 }, 32, 2.5),
        w(t(0.5), { effort: "max" }, 32),
      ],
      "AN",
    );
    // Same archetype (ladder), same piece count (5), same total-ish and
    // same offset band ("2k:-4") as Debris Flow, but ZERO effort steps —
    // must still collide on the offset arm alone.
    const splitLadder = workout(
      "Split Ladder",
      [
        w(t(1.5), { base: "2k", off: -4 }, 28, 4),
        w(t(1.25), { base: "2k", off: -4 }, 30, 3.5),
        w(t(1), { base: "2k", off: -4 }, 30, 3),
        w(t(0.75), { base: "2k", off: -4 }, 32, 2.5),
        w(t(0.5), { base: "2k", off: -4 }, 32),
      ],
      "AN",
    );
    const pairs = nearDuplicates([debrisFlow, splitLadder], BASELINES);
    expect(pairs).toHaveLength(1);
  });

  it("two zero-duration test-only workouts never divide by zero and are not flagged", () => {
    const a = workout("Empty A", [{ k: "test", label: "2k" }]);
    const b = workout("Empty B", [{ k: "test", label: "2k" }]);
    expect(nearDuplicates([a, b], BASELINES)).toHaveLength(0);
  });

  it("two zero-MINUTE work steps (synthetic) don't divide by zero into a false positive", () => {
    // Same archetype (continuous), same piece count (1), same offset band
    // ("6k:12") — every other key element matches. If the `bigger === 0`
    // guard were removed, `Math.abs(0-0)/0` is NaN, and `NaN > 0.1` is
    // FALSE in JS, so the 10%-gap check would silently let the pair
    // through to the offset-band arm, which WOULD then match — a false
    // positive from a degenerate 0/0. The guard exists precisely to
    // reject this case instead of accidentally accepting it via NaN.
    const a = workout("Zero A", [w(t(0), { base: "6k", off: 12 }, 20)]);
    const b = workout("Zero B", [w(t(0), { base: "6k", off: 12 }, 20)]);
    expect(nearDuplicates([a, b], BASELINES)).toHaveLength(0);
  });

  it("archetype mismatch alone rules out a pair with the SAME piece count, total, and offset band", () => {
    // Both single-piece (pieceCount 1), both ~20', both banded "6k:12" —
    // the ONLY differing key element is archetype (continuous vs ladder,
    // achieved here by giving the ladder workout a single steeply-varying
    // rung so it still resolves to one live work step... no: a ladder
    // needs >=2 steps by definition, so pieceCount necessarily differs
    // from a continuous single. To isolate archetype alone, compare two
    // MULTI-step archetypes instead: nxtime (2 equal pieces) vs a 2-rung
    // ladder (2 unequal pieces) — same piece count (2), same-ish total,
    // same offset band, differing only in archetype.
    const nxtime = workout("NxTime", [
      reps(2),
      w(t(10), { base: "6k", off: 12 }, 20),
    ]);
    const ladder = workout("Ladder", [
      w(t(9), { base: "6k", off: 12 }, 20),
      w(t(11), { base: "6k", off: 12 }, 20),
    ]);
    expect(nearDuplicates([nxtime, ladder], BASELINES)).toHaveLength(0);
  });

  it("a piece-count mismatch alone rules out a pair with the SAME archetype and a close total", () => {
    // Both ladders (archetype matches), both ~20', but one is 3 rungs and
    // the other is 4 — distinct from the archetype-mismatch case above,
    // this exercises the piece-count check on its own.
    const threeRung = workout("Three Rung", [
      w(t(4), { base: "6k", off: 10 }, 20),
      w(t(6), { base: "6k", off: 10 }, 22),
      w(t(10), { base: "6k", off: 10 }, 24),
    ]);
    const fourRung = workout("Four Rung", [
      w(t(3), { base: "6k", off: 10 }, 20),
      w(t(5), { base: "6k", off: 10 }, 22),
      w(t(6), { base: "6k", off: 10 }, 24),
      w(t(7), { base: "6k", off: 10 }, 26),
    ]);
    expect(nearDuplicates([threeRung, fourRung], BASELINES)).toHaveLength(0);
  });

  it("a >10% total gap rules out a pair otherwise identical in every other key", () => {
    const a = workout("A", [w(t(20), { base: "6k", off: 12 }, 20)]);
    const b = workout("B", [w(t(25), { base: "6k", off: 12 }, 20)]);
    expect(nearDuplicates([a, b], BASELINES)).toHaveLength(0);
  });
});
