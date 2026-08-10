import { describe, it, expect } from "vitest";
import { estimateMinutes } from "../../../domain/expand.js";
import {
  classifyArchetype,
  nearDuplicates,
  type Archetype,
} from "../../../domain/generation/archetype.js";
import type { WorkoutInput, WorkoutType } from "../../../domain/types.js";
import { LIBRARY_WORKOUTS } from "./index.js";

// The variety audit (design spec §5b, adversarial review M1/M2/M3): now
// that `domain/generation/archetype.ts` exists, this file runs it against
// TODAY's 300-workout library and pins the result as a PERMANENT property
// of the seed suite — variety is measured, not asserted from a bid nobody
// checked (adversarial M2: the spec's original ">60%"/"zero pairs" bid
// already failed 12 of 20 cells against the PRE-unification vocabulary).
//
// Same nominal baselines `library.test.ts` uses — they only band/estimate,
// they never ship.
const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

type Band = "<20" | "20-30" | "30-45" | "45-60" | "60+";
const BANDS: Band[] = ["<20", "20-30", "30-45", "45-60", "60+"];
const TYPES: WorkoutType[] = ["O2", "AT", "TR", "AN"];
const band = (m: number): Band =>
  m < 20
    ? "<20"
    : m < 30
      ? "20-30"
      : m < 45
        ? "30-45"
        : m < 60
          ? "45-60"
          : "60+";

function cellsOf(
  workouts: (WorkoutInput & { sortOrder: number })[],
): Record<string, WorkoutInput[]> {
  const cells: Record<string, WorkoutInput[]> = {};
  for (const w of workouts) {
    const { minutes } = estimateMinutes(w.steps, BASELINES);
    const key = `${w.type}|${band(minutes)}`;
    (cells[key] ??= []).push(w);
  }
  return cells;
}

// ---------------------------------------------------------------------
// MEASURED BASELINE — every cell, run once against today's library
// (2026-08-10, pre-rebalance-content, 300 workouts) with THIS classifier.
// n = cell size. share = the largest single archetype's fraction of the
// cell (rate-change ignored — it is a modifier, not a member of this
// count, adversarial M1). pairs = nearDuplicates() count within the cell.
// Full command: see variety-baseline.md at the plan root for the exact
// per-cell histograms (archetype x rateChange) this table summarizes.
//
// | cell       | n  | share (archetype) | pairs |
// |---|---|---|---|
// | O2 <20     | 12 | 0.58 (nxtime)      | 0     |
// | O2 20-30   | 15 | 0.47 (nxtime)      | 2     |
// | O2 30-45   | 35 | 0.46 (nxtime)      | 6     |
// | O2 45-60   | 13 | 0.23 (continuous)  | 2     |
// | O2 60+     | 15 | 0.33 (continuous)  | 4     |
// | AT <20     | 16 | 0.38 (nxtime)      | 0     |
// | AT 20-30   | 27 | 0.33 (nxtime)      | 6     |
// | AT 30-45   | 26 | 0.27 (mixed)       | 3     |
// | AT 45-60   | 3  | n<4, share rule skipped | 0 |
// | AT 60+     | 3  | n<4, share rule skipped | 0 |
// | TR <20     | 21 | 0.33 (mixed)       | 1     |
// | TR 20-30   | 26 | 0.31 (nxdistance)  | 2     |
// | TR 30-45   | 19 | 0.42 (nxdistance)  | 1     |
// | TR 45-60   | 7  | 0.57 (mixed)       | 1     |
// | TR 60+     | 2  | n<4, share rule skipped | 0 |
// | AN <20     | 32 | 0.41 (nxtime)      | 3     |
// | AN 20-30   | 15 | 0.47 (mixed)       | 3     |
// | AN 30-45   | 10 | 0.50 (nxtime)      | 1     |
// | AN 45-60   | 1  | n<4, share rule skipped | 0 |
// | AN 60+     | 2  | n<4, share rule skipped (pairs rule still applies) | 1 |
//
// CONCLUSION: the spec's ORIGINAL opening bid — no archetype exceeds 60%
// of a cell with >=4 workouts, and no cell is single-archetype — holds
// UNMODIFIED on every applicable cell today (O2|<20's 58% is the closest
// call). The vocabulary unification (M1: splitting nxtime/nxdistance by
// kind, demoting rate-change to a flag) is what makes the original bid
// pass; no threshold loosening was needed for the share rule. The
// near-duplicate "zero pairs" rule is a different story — SEE
// `KNOWN_DEBT` below.
// ---------------------------------------------------------------------

// §5b: "no cell is single-archetype where it holds >=4 workouts and no
// archetype exceeds 60% of a cell" — read as ONE qualifier governing both
// clauses (a 1-2 workout cell can't meaningfully be "varied" either way;
// literally applying "no archetype exceeds 60%" to an n=1 cell would fail
// EVERY singleton cell by construction, which is not a variety finding).
const MIN_N_FOR_SHARE_RULE = 4;
const SHARE_CEILING = 0.6;

// KNOWN_DEBT: near-duplicate pairs MEASURED in today's library, per
// TYPE|BAND cell. §5b's own words: "the pinned thresholds are the
// tightest values today's cells pass" — for a cell already carrying
// duplicate pairs, the tightest value it passes today IS its current
// count; pinning that count (not 0, not "anything") means a future
// regeneration/retune may not add EVEN ONE more near-duplicate to a debt
// cell without this gate catching it, while a clean cell (absent from
// this table, default 0) stays held to the spec's original zero. This is
// the explicit, visible, ratcheted form of "not fixed, not silently
// grandfathered" (this task's brief) — every nonzero cell below is
// content debt, not a policy that says it's fine, and belongs on James's
// gate-2 review table (design spec §5, the spot-check round).
const KNOWN_DEBT: Partial<Record<string, number>> = {
  "O2|20-30": 2,
  "O2|30-45": 6,
  "O2|45-60": 2,
  // O2|60+: the sharpest cluster in the library and the adversarial
  // review's own headline example (M2/M6) — four near-identical 6k+12
  // continuous singles (Fair Wind 70', Morning Mist 67' [15000m], Sleet
  // 65', Glass Sea 60'), pairwise within 10% except the two extremes (60'
  // vs 70', a 14.3% gap). THE named pre-existing variety debt this whole
  // task was built to surface — fix-now-or-accept goes to James's gate-2
  // review table, not decided here.
  "O2|60+": 4,
  "AT|20-30": 6,
  "AT|30-45": 3,
  "TR|<20": 1,
  "TR|20-30": 2,
  "TR|30-45": 1,
  "TR|45-60": 1,
  "AN|<20": 3,
  // AN|20-30: Giant Hail / Flash Flood / Bomb Cyclone — three all-out
  // interval sets that read as distinct by eye (a short 2-piece block vs
  // an ascending 4-piece block vs a descending 4-piece block) but share
  // one computable signature: each expands (via a repeating `reps` block)
  // to a non-monotonic liveSteps sequence, so archetype is "mixed" for
  // all three; pieceCount 8; totals 25-27'; effortShare 1.0 (all-out
  // throughout). This is adversarial M3's own worked example of the
  // EffortRef arm's coarseness (archetype.test.ts's DISAGREEMENT block
  // has the full reasoning) — also destined for the review table.
  "AN|20-30": 3,
  "AN|30-45": 1,
  "AN|60+": 1,
};

describe("variety audit — archetype distribution and near-duplicates", () => {
  const cells = cellsOf(LIBRARY_WORKOUTS);

  for (const type of TYPES) {
    for (const b of BANDS) {
      const key = `${type}|${b}`;
      const workouts = cells[key] ?? [];

      if (workouts.length < MIN_N_FOR_SHARE_RULE) {
        // §5b's own floor — a cell this small can't fail or pass a variety
        // judgment either way (AT|45-60, AT|60+, TR|60+, AN|45-60, AN|60+
        // measure at n=1..3 today). A dedicated test proves this branch
        // was taken deliberately rather than the share rule silently never
        // running for these cells.
        it(`${key}: below the n=${MIN_N_FOR_SHARE_RULE} floor for the share rule (n=${workouts.length})`, () => {
          expect(workouts.length).toBeLessThan(MIN_N_FOR_SHARE_RULE);
        });
      } else {
        it(`${key}: no single archetype exceeds ${SHARE_CEILING * 100}% (n=${workouts.length})`, () => {
          const counts: Partial<Record<Archetype, number>> = {};
          for (const w of workouts) {
            const { archetype } = classifyArchetype(w.steps);
            counts[archetype] = (counts[archetype] ?? 0) + 1;
          }
          const maxCount = Math.max(...Object.values(counts));
          const maxShare = maxCount / workouts.length;
          expect(
            maxShare,
            `${key}: histogram ${JSON.stringify(counts)}`,
          ).toBeLessThanOrEqual(SHARE_CEILING);
        });
      }

      it(`${key}: near-duplicate pairs stay within the measured baseline (KNOWN_DEBT=${KNOWN_DEBT[key] ?? 0})`, () => {
        const pairs = nearDuplicates(workouts, BASELINES);
        const allowed = KNOWN_DEBT[key] ?? 0;
        expect(
          pairs.length,
          `${key}: ${pairs.map((p) => `${p.a} <> ${p.b}`).join("; ")}`,
        ).toBeLessThanOrEqual(allowed);
      });
    }
  }

  it("KNOWN_DEBT carries no entry for a cell that is actually clean (no silent over-allowance)", () => {
    for (const [key, allowed] of Object.entries(KNOWN_DEBT)) {
      const workouts = cells[key] ?? [];
      const pairs = nearDuplicates(workouts, BASELINES);
      expect(pairs.length, `${key}`).toBe(allowed);
    }
  });

  it("every TYPE|BAND key in KNOWN_DEBT is a real cell (catches a typo'd key silently doing nothing)", () => {
    for (const key of Object.keys(KNOWN_DEBT)) {
      const [type, b] = key.split("|");
      expect(TYPES).toContain(type as WorkoutType);
      expect(BANDS).toContain(b as Band);
    }
  });
});
