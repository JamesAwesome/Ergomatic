import { describe, expect, it } from "vitest";
import {
  type BaselineEstimate,
  CARDIO_LEVELS,
  ESTIMATE_TABLE,
  EXPERIENCE_LEVELS,
  MOST_COMMON_ESTIMATE,
  RECREATIONAL_FAST_END_SECONDS,
  estimateFor,
  mostCommonEstimate,
} from "./estimateBaseline.js";
import { K2_K6_OFFSET_SECONDS } from "./deriveBaseline.js";

// ---------------------------------------------------------------------------
// Phase BL PR C — the 16-cell estimate table's bounded, testable exit
// criteria (baseline-onboarding spec rev 2, "The estimate table's
// grounding"). These are the criteria that replaced "the numbers are
// right": totality over both key unions, the server band, the recreational
// fast end, k2 < k6 everywhere, and gap agreement with the one derive
// constant the app already ships. James is the named checker of the VALUES
// (all 16 printed in PR C's body); these tests pin the SHAPE and the
// invariants so a future edit cannot silently break them.
// ---------------------------------------------------------------------------

const ALL_CELLS = EXPERIENCE_LEVELS.flatMap((experience) =>
  CARDIO_LEVELS.map((cardio) => ({
    experience,
    cardio,
    cell: estimateFor(experience, cardio),
  })),
);

describe("the estimate table (domain/estimateBaseline.ts)", () => {
  it("is total: 4 experience levels x 4 cardio levels = 16 cells, every one present", () => {
    expect(EXPERIENCE_LEVELS).toHaveLength(4);
    expect(CARDIO_LEVELS).toHaveLength(4);
    expect(ALL_CELLS).toHaveLength(16);
    // Structural totality, asserted against the literal table too (not just
    // the accessor): every experience row exists and carries every cardio key.
    for (const experience of EXPERIENCE_LEVELS) {
      const row = ESTIMATE_TABLE[experience];
      expect(Object.keys(row).sort()).toStrictEqual([...CARDIO_LEVELS].sort());
    }
  });

  it("keeps every cell inside the server's own 60..240s split band", () => {
    // 60/240 restated as literals (the API's MIN_SPLIT_SECONDS/
    // MAX_SPLIT_SECONDS in server/routes/data.ts, mirrored by
    // src/you/baselineDraft.ts) — domain tests import neither layer.
    for (const { cell } of ALL_CELLS) {
      expect(cell.k2Seconds).toBeGreaterThanOrEqual(60);
      expect(cell.k2Seconds).toBeLessThanOrEqual(240);
      expect(cell.k6Seconds).toBeGreaterThanOrEqual(60);
      expect(cell.k6Seconds).toBeLessThanOrEqual(240);
    }
  });

  it("estimates k2 strictly faster than k6 in EVERY cell (the inversion that would make ALL OUT slower than EASY)", () => {
    for (const { cell } of ALL_CELLS) {
      expect(cell.k2Seconds).toBeLessThan(cell.k6Seconds);
    }
  });

  it("agrees with K2_K6_OFFSET_SECONDS in every cell's k2/k6 gap — one constant family, no second answer", () => {
    for (const { cell } of ALL_CELLS) {
      expect(cell.k6Seconds - cell.k2Seconds).toBe(K2_K6_OFFSET_SECONDS);
    }
  });

  it("never estimates faster than the recreational fast end (2:15/500m) except for a-lot x training-hard", () => {
    const nonExempt = ALL_CELLS.filter(
      ({ experience, cardio }) =>
        !(experience === "a-lot" && cardio === "training-hard"),
    );
    expect(nonExempt).toHaveLength(15);
    for (const { cell } of nonExempt) {
      expect(cell.k2Seconds).toBeGreaterThanOrEqual(
        RECREATIONAL_FAST_END_SECONDS,
      );
    }
    // The exemption is real, not vacuous: the one exempt cell actually uses it.
    expect(estimateFor("a-lot", "training-hard").k2Seconds).toBeLessThan(
      RECREATIONAL_FAST_END_SECONDS,
    );
  });

  it("is monotone: more experience never estimates slower, better cardio never estimates slower", () => {
    // Down a column (experience increasing) and across a row (cardio
    // improving), the estimate may hold or speed up but never slow down —
    // an inverted pair would mean answering MORE honestly costs the rower
    // a slower recommendation.
    const adjacentPairs: [BaselineEstimate, BaselineEstimate][] = [];
    for (let e = 1; e < EXPERIENCE_LEVELS.length; e++) {
      for (const cardio of CARDIO_LEVELS) {
        adjacentPairs.push([
          estimateFor(EXPERIENCE_LEVELS[e - 1]!, cardio),
          estimateFor(EXPERIENCE_LEVELS[e]!, cardio),
        ]);
      }
    }
    for (const experience of EXPERIENCE_LEVELS) {
      for (let c = 1; c < CARDIO_LEVELS.length; c++) {
        adjacentPairs.push([
          estimateFor(experience, CARDIO_LEVELS[c - 1]!),
          estimateFor(experience, CARDIO_LEVELS[c]!),
        ]);
      }
    }
    expect(adjacentPairs).toHaveLength(24);
    for (const [lower, higher] of adjacentPairs) {
      expect(higher.k2Seconds).toBeLessThanOrEqual(lower.k2Seconds);
    }
  });

  it("pins all 16 cell values — the table James signs off, cell by cell", () => {
    // seconds/500m; k6 = k2 + 7 everywhere (asserted structurally above,
    // restated literally here so a value edit shows up as a value diff).
    expect(ESTIMATE_TABLE).toStrictEqual({
      never: {
        starting: { k2Seconds: 150, k6Seconds: 157 },
        "1-2-week": { k2Seconds: 150, k6Seconds: 157 },
        "most-days": { k2Seconds: 145, k6Seconds: 152 },
        "training-hard": { k2Seconds: 145, k6Seconds: 152 },
      },
      "a-little": {
        starting: { k2Seconds: 150, k6Seconds: 157 },
        "1-2-week": { k2Seconds: 145, k6Seconds: 152 },
        "most-days": { k2Seconds: 145, k6Seconds: 152 },
        "training-hard": { k2Seconds: 140, k6Seconds: 147 },
      },
      regularly: {
        starting: { k2Seconds: 145, k6Seconds: 152 },
        "1-2-week": { k2Seconds: 145, k6Seconds: 152 },
        "most-days": { k2Seconds: 140, k6Seconds: 147 },
        "training-hard": { k2Seconds: 140, k6Seconds: 147 },
      },
      "a-lot": {
        starting: { k2Seconds: 140, k6Seconds: 147 },
        "1-2-week": { k2Seconds: 140, k6Seconds: 147 },
        "most-days": { k2Seconds: 135, k6Seconds: 142 },
        "training-hard": { k2Seconds: 130, k6Seconds: 137 },
      },
    });
  });
});

describe("mostCommonEstimate (the seed family's single source)", () => {
  it("returns the modal cell of the real table: 2:25 / 2:32 (145/152), which appears in 6 of 16 cells", () => {
    expect(MOST_COMMON_ESTIMATE).toStrictEqual({
      k2Seconds: 145,
      k6Seconds: 152,
    });
    expect(mostCommonEstimate(ESTIMATE_TABLE)).toStrictEqual(
      MOST_COMMON_ESTIMATE,
    );
  });

  it("breaks a count tie toward the SLOWER pair (the table's own conservative bias)", () => {
    // A synthetic 2x2-shaped table (padded to full key coverage by
    // repetition) where 120/127 and 140/147 both appear exactly 8 times:
    // the slower pair must win, for the same reason every cell errs slow.
    const fast = { k2Seconds: 120, k6Seconds: 127 };
    const slow = { k2Seconds: 140, k6Seconds: 147 };
    const tied = {
      never: {
        starting: slow,
        "1-2-week": slow,
        "most-days": slow,
        "training-hard": slow,
      },
      "a-little": {
        starting: slow,
        "1-2-week": slow,
        "most-days": slow,
        "training-hard": slow,
      },
      regularly: {
        starting: fast,
        "1-2-week": fast,
        "most-days": fast,
        "training-hard": fast,
      },
      "a-lot": {
        starting: fast,
        "1-2-week": fast,
        "most-days": fast,
        "training-hard": fast,
      },
    };
    expect(mostCommonEstimate(tied)).toStrictEqual(slow);
  });
});
