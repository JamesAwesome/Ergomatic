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
// | cell       | n  | share (archetype) | pairs | was |
// |---|---|---|---|---|
// | O2 <20     | 12 | 0.58 (nxtime)      | 0     | 0 |
// | O2 20-30   | 15 | 0.47 (nxtime)      | 2     | 2 |
// | O2 30-45   | 35 | 0.46 (nxtime)      | 5     | 6 |
// | O2 45-60   | 13 | 0.23 (continuous)  | 2     | 2 |
// | O2 60+     | 15 | 0.33 (continuous)  | 4     | 4 |
// | AT <20     | 16 | 0.44 (nxtime)      | 0     | 0 |
// | AT 20-30   | 27 | 0.44 (nxtime)      | 3     | 6 |
// | AT 30-45   | 26 | 0.31 (nxtime)      | 2     | 3 |
// | AT 45-60   | 3  | n<4, share rule skipped | 0 | 0 |
// | AT 60+     | 3  | n<4, share rule skipped | 0 | 0 |
// | TR <20     | 21 | 0.24 (nxdistance)  | 1     | 1 |
// | TR 20-30   | 26 | 0.31 (nxdistance)  | 1     | 2 |
// | TR 30-45   | 19 | 0.42 (nxdistance)  | 1     | 1 |
// | TR 45-60   | 7  | 0.57 (mixed)       | 0     | 1 |
// | TR 60+     | 2  | n<4, share rule skipped | 0 | 0 |
// | AN <20     | 32 | 0.41 (nxtime)      | 3     | 3 |
// | AN 20-30   | 15 | 0.40 (ladder)      | 0     | 3 |
// | AN 30-45   | 10 | 0.50 (nxtime)      | 1     | 1 |
// | AN 45-60   | 1  | n<4, share rule skipped | 0 | 0 |
// | AN 60+     | 2  | n<4, share rule skipped (pairs rule still applies) | 1 | 1 |
//
// The `was` column is the FIRST measurement of this baseline, taken before
// the block review's §5b amendment fixed the classifier's expanded-signature
// collapse (`archetype.ts`, "BLOCK REVIEW AMENDMENT"). Ten of the 36 pairs
// it counted were manufactured by the collapse rather than present in the
// content: a sequence that restarts is never globally monotonic, so every
// repeated block read as `mixed` and repeated blocks of quite different
// shapes piled into one bucket. AN|20-30's three — Giant Hail / Flash Flood
// / Bomb Cyclone, a 2-rung block played four times against an ascending
// 4-rung block and a descending one — were the review's worked example and
// are now correctly zero. The O2|60+ cluster, the debt this audit was built
// to surface, is untouched at 4.
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
// KEYED ON TODAY'S CELLS (block review m5). The rebalance moves 94 workouts
// between bands, so after Tasks 3/4 land, every cell's membership is
// different and this whole table must be RE-MEASURED, not patched: a cell
// whose debt looks unchanged may be carrying an entirely different pair.
// Re-measure by running the audit and reading the failures.
// RE-MEASURED after Task 3 (2026-08-10 library-rebalance) landed O2's and
// AT's retunes: O2|30-45, O2|60+ and AT|30-45 moved (comments below say how
// and why); every other cell's count held. Per this table's own rule, this
// is a re-measurement, not a bid — the numbers are what `nearDuplicates`
// actually reports over the retuned content, read from the failures this
// task's own run produced, not adjusted by hand.
// RE-MEASURED AGAIN after Task 4 (2026-08-10 library-rebalance) landed TR's
// and AN's retunes plus all 11 replacements: TR|<20, TR|30-45, AN|<20 and
// AN|20-30 moved (comments below say how and why); every other TR/AN cell's
// count held, INCLUDING both cells that gained replacements outright
// (TR|60+, AN|45-60, AN|60+ — every one of Task 4's 11 fresh workouts was
// checked as a GENERATION GATE, not just measured after the fact, and none
// of them appears in any pair below). O2/AT are untouched by this task and
// their rows above stand exactly as Task 3 left them.
const KNOWN_DEBT: Partial<Record<string, number>> = {
  "O2|20-30": 2,
  // O2|30-45: 5 -> 6. Retuning stretched several workouts into this now-
  // largest O2 cell, and two of them landed close enough to an existing
  // occupant to pair: Advection Fog <> Mirage, Following Sea <> Freezing
  // Fog, Following Sea <> Diamond Dust, Freezing Fog <> Diamond Dust,
  // Ground Fog <> Meltemi (all pre-existing, untouched by this task) plus
  // ONE new pair from the retune itself, Silver Thaw <> Halo Ring — both
  // retuned into 30-45 this task, both mixed cutdowns of comparable total
  // and piece count.
  "O2|30-45": 6,
  "O2|45-60": 2,
  // O2|60+: the sharpest cluster in the library and the adversarial
  // review's own headline example (M2/M6) — was four near-identical 6k+12
  // continuous singles (Fair Wind 70', Morning Mist 67' [15000m], Sleet
  // 65', Glass Sea 60'), pairwise within 10% except the two extremes (60'
  // vs 70', a 14.3% gap); 4 -> 6 this task, because Altostratus's retune
  // (50' -> 60', reaching its own new 60+ target) lands it as a FIFTH
  // 6k+11 continuous single at exactly Glass Sea's 60', adding two more
  // within-10% pairs (Glass Sea <> Altostratus, Altostratus <> Sleet)
  // without displacing any of the original four. Still THE named pre-
  // existing variety debt this whole task was built to surface —
  // fix-now-or-accept goes to James's gate-2 review table, not decided
  // here.
  "O2|60+": 6,
  // AT|20-30: 3 -> 1. Every AT workout that used to sit in this cell and
  // carried a debt pair retuned UP and out of it this task (into 30-45 and
  // beyond); the 8 formerly-<20 AT workouts retuned INTO 20-30 to fill
  // the seats they left brought no new pair with them. What remains is
  // the one pair neither side of, untouched by this task: Frontal Wave <>
  // Trough Axis (both 5-piece pyramids of the same total).
  "AT|20-30": 1,
  // AT|30-45: 2 -> 5. Retuning moved several AT workouts into this now-
  // largest AT cell, landing five pairs against occupants close enough in
  // shape/total: Anticyclone <> Jet Streak (both ~30' continuous singles
  // at a 6k+ pace), Inversion Layer <> Gap Wind (both a long lead into a
  // short repeated block, comparable total), Deepening Low <> Thermal
  // Wind (both three/four-piece sets of comparable total), Thermal Low <>
  // Heat Low (both flat reps sets landing at the same total this task's
  // retune gave Heat Low), Occlusion Point <> Zonda (both five-piece
  // pyramids of comparable total, pre-existing and now sharing this cell
  // with the retunes above).
  "AT|30-45": 5,
  // TR|<20: 1 -> 0. The one pair this cell carried retuned OUT of <20 this
  // task (one of its two members moved bands), leaving the cell clean — no
  // entry needed (the "clean cell" test below fails on a stale 0/nonzero
  // entry, so this row is REMOVED, not set to 0).
  "TR|20-30": 1,
  // TR|30-45: 1 -> 3. The one pre-existing pair (Mistral <> Equatorial
  // Countercurrent, both untouched by this task) still stands; two NEW
  // pairs appeared because retunes landed existing TR workouts close to
  // each other in this now-larger cell: Gulf Stream <> Piteraq (both
  // retuned this task, both nxdistance 8-piece sets of the same total) and
  // Southerly Buster <> Cold Snap (Southerly Buster retuned this task,
  // Cold Snap untouched, both 5-rung ladders of the same total). Neither
  // new pair involves a REPLACEMENT — this is retune-vs-retune and
  // retune-vs-untouched debt, the kind this table exists to re-measure,
  // not the kind the generation gate forbids.
  "TR|30-45": 3,
  // TR|60+: gained two fresh replacements (Following Seas, Tidal Race)
  // alongside the two pre-existing residents (Alaska Current, Roaring
  // Forties) — checked as a generation gate before landing, zero pairs,
  // no entry needed.
  // AN|<20: 3 -> 1. Several AN workouts that carried the original three
  // pairs retuned OUT of <20 this task (Wall Cloud, Mammatus, Bow Echo,
  // Wind Gust, Heat Lightning, Ground Strike, Downburst, Wet Microburst,
  // Landspout, Ball Lightning all left); one pair (Dust Whirl <> Snow
  // Devil, both untouched by this task) survives.
  "AN|<20": 1,
  // AN|20-30: 0 -> 1. Downburst's retune (16' -> 20', still a pyramid,
  // same piece count) landed it close enough to the untouched Rope
  // Tornado (also a pyramid of a comparable total) to pair — retune debt,
  // not a replacement creating it.
  "AN|20-30": 1,
  "AN|30-45": 1,
  // AN|45-60: gained six fresh replacements (Meso Low, Rear Flank, Scud
  // Run, Cloud to Ground, Bolt from the Blue, Ground Flash) alongside the
  // one pre-existing resident (Explosive Cyclogenesis) — checked as a
  // generation gate before landing, zero pairs, no entry needed.
  // AN|60+: gained two fresh replacements (Positive Strike, Downburst
  // Line) alongside the two pre-existing residents. The one pair below is
  // the SAME pre-existing pair Task 1's baseline named (Typhoon <>
  // Violent Tornado, both untouched by this task) — neither replacement
  // appears in it, confirmed by re-measuring, not assumed.
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
