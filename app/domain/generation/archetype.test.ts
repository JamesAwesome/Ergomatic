import { describe, it, expect } from "vitest";
import {
  classifyArchetype,
  nearDuplicates,
  smallestPeriod,
  structureSignature,
} from "./archetype.js";
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
// | Fine Weather        | O2 | o2.ts:626  | [40]                          | continuous, rc=false  | one live work step |
// | Glass Sea           | O2 | o2.ts:712  | [60]                          | continuous, rc=false  | one live work step |
// | Fair Wind           | O2 | o2.ts:754  | [70]                          | continuous, rc=false  | one live work step |
// | Sleet               | O2 | o2.ts:2123 | [65]                          | continuous, rc=false  | one live work step |
// | Morning Mist        | O2 | o2.ts:1481 | [15000] (distance)            | continuous, rc=false  | one live work step, kind irrelevant at n=1 |
// | Occluded Front      | AT | at.ts:16   | [10]                          | continuous, rc=false  | one live work step |
// | Beam Sea            | TR | tr.ts:22   | [2000] (distance)             | continuous, rc=false  | one live work step |
// | Sea Fret            | O2 | o2.ts:21   | [4,4] (reps 2)                | nxtime, rc=false      | equal time durations, spm 22 both |
// | Petrichor           | O2 | o2.ts:38   | [3,3,3]                       | nxtime, rc=TRUE       | equal durations, spm 20/22/24 |
// | Thermal Low         | AT | at.ts:939  | [5,5,5,5]                     | nxtime, rc=false      | equal durations, spm 24 throughout |
// | Scud Cloud          | AN | an.ts:22   | [.5]x5 (reps 5)               | nxtime, rc=false      | equal durations, spm 28 throughout |
// | Laminar             | O2 | o2.ts:67   | [1000,1000,1000] (distance)   | nxdistance, rc=TRUE   | equal distances, spm 20/22/24 |
// | Hail Shaft          | AN | an.ts:1214 | [300]x10 (reps 10, distance)  | nxdistance, rc=false  | equal distances, spm 32 throughout |
// | Tule Fog            | O2 | o2.ts:459  | [6,9,12]                      | ladder, rc=TRUE       | strictly increasing, spm 20/22/24 |
// | Ice Fog             | O2 | o2.ts:488  | [12,9,6,3]                    | ladder, rc=TRUE       | strictly decreasing, spm 18/20/22/24 |
// | Barometric Low      | AT | at.ts:120  | [4,3,2]                       | ladder, rc=TRUE       | strictly decreasing, spm 22/24/26 |
// | Line Squall         | TR | tr.ts:564  | [500,750,1000,1250] (distance)| ladder, rc=TRUE       | strictly increasing, spm 28/26/26/24 |
// | Millpond            | O2 | o2.ts:128  | [2,3,4,3,2]                   | pyramid, rc=false     | strict up then strict down, spm 22 constant |
// | Pressure Ridge      | AT | at.ts:60   | [1,2,3,2,1]                   | pyramid, rc=TRUE      | strict up-down, spm 26/24/24/24/26 |
// | Benguela Current    | TR | tr.ts:182  | [250,500,750,500,250] (dist)  | pyramid, rc=TRUE      | strict up-down, spm 26/24/24/24/26 |
// | Beaver Tail         | AN | an.ts:90   | [.5,.75,1,.75,.5]             | pyramid, rc=TRUE      | strict up-down, spm 30/28/26/28/30 |
// | Baroclinic Zone     | AT | at.ts:457  | [3,2,3,2,3,2] (reps 3 x [3,2])| ladder, rc=TRUE (RE-ADJUDICATED, block review) | the expansion is up-down-up-down, but it is exactly 3 repetitions of a 2-rung descending block |
// | Giant Hail          | AN | an.ts:1190 | [1.5,.5]x4 (reps 4, effort)   | ladder, rc=false (RE-ADJUDICATED) | 4 repetitions of a 2-rung descending block — the comment's own "rounds of a ladder" (2026-08-10 library-rebalance Task 4 retune: durations were [1.25,.5]) |
// | Flash Flood         | AN | an.ts:1231 | [.5,.75,1.25,1.75]x2 (reps 2) | ladder, rc=TRUE (RE-ADJUDICATED)  | 2 repetitions of a 4-rung ASCENDING block (2026-08-10 library-rebalance Task 4 retune, grid-corrected: durations were [.5,.75,1,1.5]) |
// | Bomb Cyclone        | AN | an.ts:1601 | [1.5,1.25,1,.75]x2 (reps 2)   | ladder, rc=false (RE-ADJUDICATED) | 2 repetitions of a 4-rung DESCENDING block (2026-08-10 library-rebalance Task 4 retune, grid-corrected: durations were [1.25,1,.75,.5]) |
// | Sundowner           | TR | tr.ts:1425 | [1150,550,300,550,1150] (dist)| MIXED (disagreement — see below), rc=TRUE | a VALLEY (down-then-up), not a peak — §5b's pyramid is "strictly up then strictly down" only (2026-08-10 library-rebalance Task 4 retune: distances were [1000,500,250,500,1000]) |
// | Debris Flow         | AN | an.ts:1273 | [1.75,1.5,1.25,1,.5], last=effort | ladder, rc=TRUE | strictly decreasing durations; ref kind (4 split + 1 effort) does not affect archetype (2026-08-10 library-rebalance Task 4 retune, grid-corrected: durations were [1.5,1.25,1,.75,.5]) |
//
// RE-ADJUDICATED under the §5b BLOCK REVIEW AMENDMENT (2026-08-10). The
// four rows above marked RE-ADJUDICATED were originally labelled `mixed`
// and the classifier agreed, because the first reading of §5b judged only
// the fully expanded sequence and a sequence that restarts is never
// globally monotonic. The block review found that collapse doing real
// damage: it is what manufactured `AN|20-30`'s three "near-duplicates"
// (Giant Hail / Flash Flood / Bomb Cyclone), three sessions no content
// reviewer would call the same. The amended definition reads the expansion
// FIRST and, only where that says `mixed`, reads the block the sequence
// repeats — so these four now classify as what their own seed comments
// always called them. The hand labels here are the AMENDED spec, and the
// classifier earns them; the human reading and the computable one now
// agree, which is the whole point of the amendment.
//
// One disagreement SURVIVES the amendment, unchanged:
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
    it("Fine Weather (o2.ts:626): 40' single time step", () => {
      const steps = [w(t(40), { base: "6k", off: 12 }, 20)];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "continuous",
        rateChange: false,
      });
    });

    it("Morning Mist (o2.ts:1481): 15000m single distance step — kind doesn't matter at n=1", () => {
      const steps = [w(d(15000), { base: "6k", off: 12 }, 20)];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "continuous",
        rateChange: false,
      });
    });

    it("Occluded Front (at.ts:16): single AT threshold step", () => {
      const steps = [w(t(10), { base: "6k", off: 4 }, 22)];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "continuous",
        rateChange: false,
      });
    });

    it("Beam Sea (tr.ts:22): single TR distance step", () => {
      const steps = [w(d(2000), { base: "2k", off: 6 }, 24)];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "continuous",
        rateChange: false,
      });
    });
  });

  describe("nxtime — reps/identical time-based work steps", () => {
    it("Sea Fret (o2.ts:21): 2x4' identical, no rate change", () => {
      const steps = [reps(2), w(t(4), { base: "6k", off: 12 }, 22, 1)];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "nxtime",
        rateChange: false,
      });
    });

    it("Petrichor (o2.ts:38): 3x3' equal duration, spm climbs 20->22->24", () => {
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

    it("Thermal Low (at.ts:939): 4x5' identical, spm 24 throughout", () => {
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

    it("Scud Cloud (an.ts:22): reps 5 x 30s, expands to 5 equal live steps", () => {
      const steps = [reps(5), w(t(0.5), { base: "2k", off: -3 }, 28, 1.5)];
      const { archetype } = classifyArchetype(steps);
      expect(archetype).toBe("nxtime");
    });
  });

  describe("nxdistance — reps/identical distance-based work steps", () => {
    it("Laminar (o2.ts:67): 3x1000m equal distance, rate climbs", () => {
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

    it("Hail Shaft (an.ts:1214): reps 10 x 300m all-out, constant spm", () => {
      const steps = [reps(10), w(d(300), { effort: "max" }, 32, 2)];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "nxdistance",
        rateChange: false,
      });
    });
  });

  describe("ladder — strictly monotonic durations, same kind", () => {
    it("Tule Fog (o2.ts:459): 6'/9'/12' ascending", () => {
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

    it("Ice Fog (o2.ts:488): 12'/9'/6'/3' descending", () => {
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

    it("Line Squall (tr.ts:564): 500/750/1000/1250m ascending distance ladder", () => {
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

    it("Debris Flow (an.ts:1273): strictly decreasing durations, mixed ref kinds — the split/effort split does not change the archetype", () => {
      const steps = [
        w(t(1.75), { base: "2k", off: -3 }, 28, 4.25),
        w(t(1.5), { base: "2k", off: -4 }, 30, 3.75),
        w(t(1.25), { base: "2k", off: -4 }, 30, 3.25),
        w(t(1), { base: "2k", off: -4 }, 32, 2.75),
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

    it("a plateau the lead reduction cannot rescue (synthetic) is NOT a ladder — the strictness guard on the decreasing side", () => {
      // [6,4,4,3]: the head stands apart, so the amendment does read the
      // body — and the body [4,4,3] has a tie, so it is still not a ladder.
      const steps = [
        w(t(6), { base: "6k", off: 10 }, 20),
        w(t(4), { base: "6k", off: 10 }, 20),
        w(t(4), { base: "6k", off: 10 }, 20),
        w(t(3), { base: "6k", off: 10 }, 20),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "mixed",
        rateChange: false,
      });
    });

    it("RE-ADJUDICATED: [6,4,4] is a lead piece in front of a flat pair, not a plateau -> nxtime", () => {
      // Originally labelled `mixed` on the whole-expansion reading. Under
      // the amendment the 6' head stands outside the body's range, so the
      // body [4,4] is read on its own: two equal pieces after a longer
      // opener — Katabatic Wind's shape in miniature.
      const steps = [
        w(t(6), { base: "6k", off: 10 }, 20),
        w(t(4), { base: "6k", off: 10 }, 20),
        w(t(4), { base: "6k", off: 10 }, 20),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "nxtime",
        rateChange: false,
      });
    });

    it("a head INSIDE the body's range is a plateau, not a lead: [2,2,3] stays mixed", () => {
      const steps = [
        w(t(2), { base: "6k", off: 10 }, 20),
        w(t(2), { base: "6k", off: 10 }, 20),
        w(t(3), { base: "6k", off: 10 }, 20),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "mixed",
        rateChange: false,
      });
    });
  });

  describe("pyramid — strict up then strict down, peak strictly interior", () => {
    it("Millpond (o2.ts:128): 2-3-4-3-2, constant spm", () => {
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

    it("Pressure Ridge (at.ts:60): 1-2-3-2-1, spm mirrors the shape", () => {
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

    it("Benguela Current (tr.ts:182): 250-500-750-500-250m distance pyramid", () => {
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

    it("Beaver Tail (an.ts:90): 30/45/60/45/30s all-out pyramid", () => {
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
    it("Baroclinic Zone (at.ts:457): reps 3 x [3',2'] is a 2-rung descending block played three times -> ladder", () => {
      const steps = [
        reps(3),
        w(t(3), { base: "6k", off: 4 }, 22, 1),
        w(t(2), { base: "6k", off: -1 }, 26, 1),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "ladder",
        rateChange: true,
      });
    });

    it("…and the SAME six pieces typed out flat classify identically — the period is read off the sequence, not off the marker", () => {
      const flat = [
        w(t(3), { base: "6k", off: 4 }, 22, 1),
        w(t(2), { base: "6k", off: -1 }, 26, 1),
        w(t(3), { base: "6k", off: 4 }, 22, 1),
        w(t(2), { base: "6k", off: -1 }, 26, 1),
        w(t(3), { base: "6k", off: 4 }, 22, 1),
        w(t(2), { base: "6k", off: -1 }, 26, 1),
      ];
      expect(classifyArchetype(flat)).toStrictEqual({
        archetype: "ladder",
        rateChange: true,
      });
    });

    // (2026-08-10 library-rebalance Task 4 retune, grid-corrected: durations
    // were [1.25,.5]; the shape and both bracketed axes this test guards —
    // 4 repetitions, a descending 2-rung block, rc=false — are unchanged,
    // per `shapeIssues`'s own archetype/rate-change gate at retune time.)
    it("AMENDED: Giant Hail (an.ts:1190) is 4 rounds of a 2-rung descending block — its comment's own 'ladder', now computable", () => {
      const steps = [
        reps(4),
        w(t(1.5), { effort: "max" }, 32, 2.5),
        w(t(0.5), { effort: "max" }, 32, 3),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "ladder",
        rateChange: false,
      });
    });

    // (2026-08-10 library-rebalance Task 4 retune, grid-corrected: durations
    // were [.5,.75,1,1.5]; the shape this test guards — 2 repetitions of an
    // ascending 4-rung block, rc=true — is unchanged.)
    it("AMENDED: Flash Flood (an.ts:1231) is an ASCENDING 4-rung block played twice -> ladder", () => {
      const steps = [
        reps(2),
        w(t(0.5), { effort: "max" }, 32, 1.5),
        w(t(0.75), { effort: "max" }, 32, 2),
        w(t(1.25), { effort: "max" }, 30, 2.75),
        w(t(1.75), { effort: "max" }, 30, 4.5),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "ladder",
        rateChange: true,
      });
    });

    // (2026-08-10 library-rebalance Task 4 retune, grid-corrected: durations
    // were [1.25,1,.75,.5]; the shape this test guards — 2 repetitions of a
    // descending 4-rung block, rc=false — is unchanged.)
    it("AMENDED: Bomb Cyclone (an.ts:1601) is a DESCENDING 4-rung block played twice -> ladder", () => {
      const steps = [
        reps(2),
        w(t(1.5), { effort: "max" }, 32, 3.75),
        w(t(1.25), { effort: "max" }, 32, 3),
        w(t(1), { effort: "max" }, 32, 2.25),
        w(t(0.75), { effort: "max" }, 32, 1.5),
      ];
      expect(classifyArchetype(steps)).toStrictEqual({
        archetype: "ladder",
        rateChange: false,
      });
    });

    // (2026-08-10 library-rebalance Task 4 retune: distances were
    // [1000,500,250,500,1000]; the VALLEY shape this disagreement test
    // guards — mixed, rc=true — is unchanged.)
    it("DISAGREEMENT: Sundowner (tr.ts:1425) is a VALLEY (down-then-up), the mirror of a pyramid, not an instance of one", () => {
      const steps = [
        w(d(1150), { base: "2k", off: 2 }, 26, 4),
        w(d(550), { base: "2k", off: 1 }, 28, 4),
        w(d(300), { base: "2k", off: 0 }, 28, 4),
        w(d(550), { base: "2k", off: 1 }, 28, 4),
        w(d(1150), { base: "2k", off: 2 }, 26),
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

  it("the EffortRef arm (effort share + archetype + duration) pairs two all-out sets with no offset to band (M3's original gap)", () => {
    const giantHail = workout(
      "Giant Hail",
      [
        reps(4),
        w(t(1.25), { effort: "max" }, 32, 2),
        w(t(0.5), { effort: "max" }, 32, 2.5),
      ],
      "AN",
    );
    // Same build, same shape, nothing to band an offset on — the arm has to
    // catch this pair or it catches nothing.
    const twin = workout(
      "Giant Hail's Twin",
      [
        reps(4),
        w(t(1.5), { effort: "max" }, 32, 2),
        w(t(0.5), { effort: "max" }, 32, 2.25),
      ],
      "AN",
    );
    const pairs = nearDuplicates([giantHail, twin], BASELINES);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.archetype).toBe("ladder");
    expect(pairs[0]!.pieceCount).toBe(8);
    expect(pairs[0]!.build).toBe("-+-+-+-");
  });

  it("BLOCK REVIEW: Giant Hail and Bomb Cyclone are NOT near-duplicates — same archetype and piece count, opposite builds", () => {
    // The manufactured debt the amendment removes. Both are 8-piece all-out
    // ladders at 25', and under the pre-amendment key (which had no build
    // component and called both `mixed`) they were counted as a pair in
    // AN|20-30. A 2-rung block played four times is not a 4-rung block
    // played twice, and neither is a descending block an ascending one.
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
    const flashFlood = workout(
      "Flash Flood",
      [
        reps(2),
        w(t(0.5), { effort: "max" }, 32, 1.5),
        w(t(0.75), { effort: "max" }, 32, 2),
        w(t(1), { effort: "max" }, 30, 2.5),
        w(t(1.5), { effort: "max" }, 30, 3.75),
      ],
      "AN",
    );
    expect(
      nearDuplicates([giantHail, bombCyclone, flashFlood], BASELINES),
    ).toStrictEqual([]);
    // …and the three builds are what separate them.
    expect(structureSignature(giantHail.steps)).toBe("-+-+-+-");
    expect(structureSignature(bombCyclone.steps)).toBe("---+---");
    expect(structureSignature(flashFlood.steps)).toBe("+++-+++");
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

describe("smallestPeriod (the §5b block review amendment's own instrument)", () => {
  it("finds the shortest block a sequence repeats, and nothing else", () => {
    expect(smallestPeriod([3, 2, 3, 2, 3, 2])).toBe(2);
    expect(smallestPeriod([1, 2, 3, 4, 1, 2, 3, 4])).toBe(4);
    expect(smallestPeriod([5, 5, 5, 5])).toBe(1);
    // A period must divide the length AND actually repeat: three cycles of
    // [3,2] plus a stray 3 is not periodic at all.
    expect(smallestPeriod([3, 2, 3, 2, 3, 2, 3])).toBeNull();
    expect(smallestPeriod([1, 2, 3])).toBeNull();
    // The whole sequence is never its own period — that would make every
    // sequence "repeating" and the reduction a no-op that always fires.
    expect(smallestPeriod([4])).toBeNull();
    expect(smallestPeriod([4, 7])).toBeNull();
  });
});

describe("structureSignature", () => {
  it("signs the expansion's rung-to-rung directions, so authoring form drops out", () => {
    const block = [
      reps(3),
      w(t(3), { base: "6k", off: 4 }, 22, 1),
      w(t(2), { base: "6k", off: -1 }, 26, 1),
    ];
    const flat = [
      w(t(3), { base: "6k", off: 4 }, 22, 1),
      w(t(2), { base: "6k", off: -1 }, 26, 1),
      w(t(3), { base: "6k", off: 4 }, 22, 1),
      w(t(2), { base: "6k", off: -1 }, 26, 1),
      w(t(3), { base: "6k", off: 4 }, 22, 1),
      w(t(2), { base: "6k", off: -1 }, 26, 1),
    ];
    expect(structureSignature(block)).toBe("-+-+-");
    expect(structureSignature(flat)).toBe(structureSignature(block));
    // A single piece has no rung-to-rung anything.
    expect(structureSignature([w(t(60), { base: "6k", off: 12 }, 20)])).toBe(
      "",
    );
    // Equal rungs sign as "=", which is how a flat block stays flat.
    expect(
      structureSignature([
        w(t(4), { base: "6k", off: 12 }, 20),
        w(t(4), { base: "6k", off: 12 }, 20),
      ]),
    ).toBe("=");
  });
});
