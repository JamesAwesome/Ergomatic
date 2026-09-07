import { describe, expect, it } from "vitest";
import { LIBRARY_WORKOUTS } from "../server/seed/library/index.js";
import { intensityWord, isPaceWordRef } from "./pace.js";
import type { IntensityWord } from "./pace.js";
import { phases } from "./expand.js";
import type { PaceRef, Step } from "./types.js";

/** Phase RW spec §1.1's accepted cost, pinned so a seed edit that moves a
 *  word is seen, and the counts James decided on stay the counts. */
const RANK: Record<IntensityWord, number> = {
  STEADY: 0,
  MODERATE: 1,
  HARD: 2,
  "ALL OUT": 3,
};

function eq(ref: PaceRef): number | null {
  if (isPaceWordRef(ref)) return null;
  return ref.base === "2k" ? ref.off : ref.off + 7;
}

function wordRefs(steps: Step[]): PaceRef[] {
  return phases(steps, null)
    .filter((p) => p.type === "work" && p.ref !== undefined)
    .map((p) => p.ref!);
}

describe("the ladder over the seeded library", () => {
  it("never inverts a build: a strictly faster ref never reads an easier word", () => {
    const inversions: string[] = [];
    for (const w of LIBRARY_WORKOUTS) {
      const refs = wordRefs(w.steps).filter((r) => eq(r) !== null);
      for (let i = 1; i < refs.length; i++) {
        const a = refs[i - 1]!;
        const b = refs[i]!;
        const faster = eq(b)! < eq(a)!;
        if (faster && RANK[intensityWord(b)] < RANK[intensityWord(a)]) {
          inversions.push(w.title);
        }
      }
    }
    expect(inversions).toStrictEqual([]);
  });

  // The anchor pass counted 76 with a script that is not committed; this
  // definition (two or more distinct SPLIT refs among the work steps, and
  // every word-phase, max/min included, reading one word) counts 79. The
  // number pinned is this definition's, so a seed edit that moves it is
  // seen; the spec records both figures.
  it("reads one word on every rung of exactly the 79 multi-ref workouts this census defines", () => {
    const collapsed = LIBRARY_WORKOUTS.filter((w) => {
      const distinct = new Set(
        w.steps.flatMap((s) =>
          s.k === "w" && !isPaceWordRef(s.ref) ? [JSON.stringify(s.ref)] : [],
        ),
      );
      const words = new Set(wordRefs(w.steps).map(intensityWord));
      return distinct.size >= 2 && words.size === 1;
    });
    expect(collapsed).toHaveLength(79);
  });

  // Spec §7: the STEP-level overlap counts James ruled the thresholds on
  // (spec §1.1's accepted-cost table). Independent of the workout-level
  // counts above: these are steps whose word sits one rung off the type
  // badge's own band.
  it("pins the step-level overlaps: 23 TR steps read MODERATE, 3 AT read HARD, 11 AT read STEADY, 4 O2 read MODERATE", () => {
    // AUTHORED steps, not expanded phases: the spec's figures count what a
    // reader sees in the seed source, so a step inside a 5x reps block
    // counts once.
    const count = (type: string, word: IntensityWord, lo: number, hi: number) =>
      LIBRARY_WORKOUTS.filter((w) => w.type === type).reduce(
        (n, w) =>
          n +
          w.steps.filter((step) => {
            if (step.k !== "w" || isPaceWordRef(step.ref)) return false;
            const e = eq(step.ref);
            return (
              e !== null &&
              e >= lo &&
              e <= hi &&
              intensityWord(step.ref) === word
            );
          }).length,
        0,
      );
    // TR at 2k+5..+8 (2k-equivalent +5..+8).
    expect(count("TR", "MODERATE", 5, 12)).toBe(23);
    // AT at 6k-4/-3 (2k-equivalent +3/+4).
    expect(count("AT", "HARD", -2, 4)).toBe(3);
    // AT at 6k+6..+8 (2k-equivalent +13..+15).
    expect(count("AT", "STEADY", 13, 100)).toBe(11);
    // O2 at 6k+4 (2k-equivalent +11).
    expect(count("O2", "MODERATE", 5, 12)).toBe(4);
  });

  it("contradicts its own type badge on every step in exactly the nine named workouts", () => {
    const BADGE: Record<string, IntensityWord> = {
      AN: "ALL OUT",
      TR: "HARD",
      AT: "MODERATE",
      O2: "STEADY",
    };
    const contradict = LIBRARY_WORKOUTS.filter((w) => {
      const ws = wordRefs(w.steps).map(intensityWord);
      return ws.length > 0 && ws.every((x) => x !== BADGE[w.type]);
    })
      .map((w) => w.title)
      .sort();
    expect(contradict).toStrictEqual(
      [
        "Beam Sea",
        "Bora",
        "Canary Current",
        "Crepuscular Rays",
        "Grec",
        "Moderate Breeze",
        "Polar Blast",
        "Roaring Forties",
        "Warm Sector",
      ].sort(),
    );
  });
});
