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

  it("reads one word on every rung of exactly the 76 multi-ref workouts the spec accepts", () => {
    const collapsed = LIBRARY_WORKOUTS.filter((w) => {
      const distinct = new Set(
        w.steps.flatMap((s) =>
          s.k === "w" && !isPaceWordRef(s.ref) ? [JSON.stringify(s.ref)] : [],
        ),
      );
      const words = new Set(wordRefs(w.steps).map(intensityWord));
      return distinct.size >= 2 && words.size === 1;
    });
    expect(collapsed).toHaveLength(76);
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
