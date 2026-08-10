// The rebalance report — docs/superpowers/specs/2026-08-09-warmup-setting-
// design.md §7 ("The rebalance report (decision input, not a decision)"):
// "buckets all 302 seeded workouts by `estimateMinutes` into the generation
// phase's own ranges ... prints the distribution BEFORE the wu-drop
// (computed from git history's seed state or a flag replaying with warmups
// included) and AFTER, beside the targets, with per-type breakdowns [and]
// states drift per bucket in points."
//
// Run: `pnpm exec tsx scripts/library-balance.ts [--after-only]`
//
// Whole-branch review finding D: the default run used to print this very
// preamble — CHECK, MOVED, "see the verdict line at the end" — and then
// tables containing none of them, only AFTER/TARGET/AFT-TGT, the one row
// the preamble itself says is NOT a rebalance signal. ROADMAP's Phase 9
// bullet points a reader at the MOVED row and spec §7 says this output
// "lands in the PR body verbatim"; a bare run handed the PR body the
// misleading row and none of the trustworthy ones. BEFORE/CHECK/MOVED are
// therefore the DEFAULT now. `--after-only` opts back into the old bare
// behavior (AFTER vs TARGET only) for a quick post-regen sanity check,
// once a future regen makes the BEFORE replay (below) no longer meaningful
// to compare against.
//
// The default path prints BEFORE, replayed from `library-warmups-before.
// json` — a frozen literal (workout title -> historical warmup minutes)
// captured from the pre-strip seed content in the SAME commit that
// deleted the 302 `{ k: "wu", ... }` lines (Task 3 of the warmup-setting
// plan, 2026-08-09). Replaying is exact: stripping `wu` changed nothing
// else about any workout (spec §6: "Nothing else about any workout
// changes"), so BEFORE_minutes(w) = AFTER_minutes(w) + frozen[w.title].
//
// patterns.json's 20 `warmupMinutes` stat entries (one per generation
// cell) are RETAINED, not orphaned — the regen follow-on (the 2026-08-10
// library-rebalance spec, §2's adversarial B4 correction) found that they
// are the record of the book cells' warm-up-inclusiveness and that §6's
// translation rule depends on them. This script still does not read them;
// it reads that file's NEW `targets` block instead (below).
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { estimateMinutes } from "../domain/expand.js";
import patterns from "../domain/generation/patterns.json";
import type { WorkoutType } from "../domain/types.js";
import {
  GLOBAL_LIBRARY_SEED,
  LIBRARY_WORKOUTS,
} from "../server/seed/library/index.js";

// See node-shims.d.ts: this tsconfig has no `"node"` in its `types` array,
// so `process` isn't ambiently typed. Cast locally rather than adding a
// global declaration — this is the only place that needs it.
const processArgv = (globalThis as unknown as { process: { argv: string[] } })
  .process.argv;

// Nominal baselines, same values library.test.ts's own quota-grid gate
// uses (server/seed/library/library.test.ts's BASELINES) — these only
// band workouts for THIS report, they never ship as real user baselines.
export const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

export type Band = "<20" | "20-30" | "30-45" | "45-60" | "60+";

// Bucket edges, verbatim from docs/superpowers/specs/2026-08-03-workout-
// generation-design.md §4 ("Quota grid"). TWO grids are in play in this
// script and confusing them is the mistake arc review F9 caught:
//
//   * DESIGN_GRID_2026_08_03 (below) is the ORIGINAL quota grid, and it is
//     defined over WARM-UP-INCLUSIVE durations. The falsifying line is that
//     spec's LINE 94, the row directly under the quota table, verbatim:
//     "Duration = total time including warm-up and rests."
//   * TARGET (below) is the 2026-08-10 rebalance grid, and it is defined
//     over WARM-UP-FREE durations. It lives in patterns.json's `targets`
//     block, which is also what library.test.ts's quota gate reads.
//
// So BEFORE (the warm-up-inclusive replay) is compared against the DESIGN
// grid — that is the FAITHFULNESS CHECK, `gridMismatches` below — and AFTER
// (warm-up-free) is compared against TARGET. Both comparisons are now
// like-for-like; the AFT-TGT row that used to carry the "not a rebalance
// signal" warning is the rebalance signal now that TARGET changed rods.
// band() applies the SAME edges the design used when the grid was
// authored; only the durations fed into it changed.
export const band = (minutes: number): Band =>
  minutes < 20
    ? "<20"
    : minutes < 30
      ? "20-30"
      : minutes < 45
        ? "30-45"
        : minutes < 60
          ? "45-60"
          : "60+";

export const BANDS: readonly Band[] = ["<20", "20-30", "30-45", "45-60", "60+"];
export const TYPES: readonly WorkoutType[] = ["O2", "AT", "TR", "AN"];

// The 2026-08-03 design's quota grid (§4 table), the ORIGINAL target the
// 300-workout library was authored against — every workout's duration then
// included its warm-up. It survives here for ONE job: the faithfulness
// check, which asks whether the pre-strip replay reproduces the library the
// grid was authored against. It is not a target for anything any more.
export const DESIGN_GRID_2026_08_03: Record<
  WorkoutType,
  Record<Band, number>
> = {
  O2: { "<20": 2, "20-30": 14, "30-45": 36, "45-60": 18, "60+": 20 },
  AT: { "<20": 5, "20-30": 19, "30-45": 34, "45-60": 13, "60+": 4 },
  TR: { "<20": 9, "20-30": 22, "30-45": 32, "45-60": 9, "60+": 3 },
  AN: { "<20": 14, "20-30": 20, "30-45": 18, "45-60": 5, "60+": 3 },
};

// The live target: the 2026-08-10 rebalance grid, warm-up-free, READ FROM
// patterns.json rather than duplicated here. `library.test.ts`'s quota gate
// reads the same block, so the file is the single source and neither the
// script nor the test can drift from the other (rebalance spec §2:
// "`library-balance.ts` AND `library.test.ts`'s QUOTA both read from it").
// The grid itself is the feasibility solve's output — `library-moves.ts`.
export const TARGET: Record<
  WorkoutType,
  Record<Band, number>
> = patterns.targets;

export interface WorkoutStat {
  readonly type: WorkoutType;
  readonly minutes: number;
}

// Buckets a list of (type, minutes) pairs into `${type}|${band}` counts —
// the pure bit the unit test exercises directly, with no dependency on the
// seed content or the filesystem.
export function bucket(
  workouts: readonly WorkoutStat[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const w of workouts) {
    const key = `${w.type}|${band(w.minutes)}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

// Drift in points: actual minus target, per cell. Positive = more workouts
// landed in that cell than designed; negative = fewer.
export function drift(
  actual: Record<string, number>,
  target: Record<WorkoutType, Record<Band, number>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const type of TYPES)
    for (const b of BANDS) {
      const key = `${type}|${b}`;
      out[key] = (actual[key] ?? 0) - target[type][b];
    }
  return out;
}

function totalOf(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

/** The FAITHFULNESS CHECK (arc review F9): every `${type}|${band}` cell
 *  where `counts` disagrees with the 2026-08-03 design grid, as `cell: delta`
 *  pairs. Empty means all 20 cells match.
 *
 *  It defaults to `DESIGN_GRID_2026_08_03`, NOT to `TARGET`. The check's
 *  whole job is to prove the warm-up-inclusive replay reproduces the library
 *  the warm-up-inclusive grid was authored against; run against the
 *  rebalance's warm-up-free `TARGET` it would compare two different rods and
 *  report 20 meaningless mismatches.
 *
 *  Run against the BEFORE (warm-up-inclusive) replay over the 300 GRID
 *  rows, an empty result is two things at once: proof the frozen-literal
 *  replay reproduces the pre-strip library exactly, and proof this script's
 *  band edges match the convention the generation phase actually used when
 *  it authored the grid (the spec states the edges' VALUES but never their
 *  inclusivity, so reproducing all 20 cells is better evidence than the
 *  doc). It is deliberately computed over `LIBRARY_WORKOUTS` (300), not
 *  `GLOBAL_LIBRARY_SEED` (302): the two onboarding rows postdate the grid
 *  and are not part of what it was authored against. */
export function gridMismatches(
  counts: Record<string, number>,
  target: Record<WorkoutType, Record<Band, number>> = DESIGN_GRID_2026_08_03,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [cell, delta] of Object.entries(drift(counts, target))) {
    if (delta !== 0) out[cell] = delta;
  }
  return out;
}

/** The rebalance RATCHET (block review §7). `debt` is measured − target per
 *  cell; `baseline` is the debt this branch started from, frozen. A cell
 *  regresses if its distance from the target GREW, or if it overshot past
 *  zero into the opposite sign — content that walked straight through the
 *  cell it was aimed at.
 *
 *  This replaces an equality against a hand-maintained `OUTSTANDING`
 *  constant, which could not tell content landing on target from content
 *  landing in the wrong band with the constant edited to match: the only
 *  invariants that form pinned were the per-type sum and "nets to zero",
 *  and a compensating ∓1 pair survives both. Measuring the debt live and
 *  holding each cell's |debt| non-increasing makes the phase's end state
 *  (all zeros) a property instead of a promise. */
export function debtRegressions(
  counts: Record<string, number>,
  target: Record<WorkoutType, Record<Band, number>>,
  baseline: Record<WorkoutType, Record<Band, number>>,
): string[] {
  const out: string[] = [];
  for (const type of TYPES) {
    for (const b of BANDS) {
      const cell = `${type}|${b}`;
      const debt = (counts[cell] ?? 0) - target[type][b];
      const was = baseline[type][b];
      if (Math.abs(debt) > Math.abs(was)) {
        out.push(`${cell}: debt ${debt}, worse than the baseline ${was}`);
      } else if (debt !== 0 && Math.sign(debt) !== Math.sign(was)) {
        out.push(`${cell}: debt ${debt} overshot the baseline ${was}`);
      }
    }
  }
  return out;
}

// One table per type: rows are BEFORE (optional) / AFTER / TARGET / DRIFT,
// columns are the five bands plus a TOTAL column. Far more legible in a
// PR body than one 20-column row.
function printTypeTable(
  type: WorkoutType,
  afterCounts: Record<string, number>,
  beforeCounts: Record<string, number> | null,
): void {
  const colWidth = 8;
  const pad = (s: string): string => s.padStart(colWidth);
  const targetRow = BANDS.map((b) => TARGET[type][b]);
  const targetTotal = targetRow.reduce((a, b) => a + b, 0);
  // The faithfulness check's own rod — the warm-up-INCLUSIVE grid BEFORE was
  // authored against. Deliberately not `targetRow`: since the rebalance,
  // TARGET is warm-up-free and comparing BEFORE to it would be nonsense.
  const designRow = BANDS.map((b) => DESIGN_GRID_2026_08_03[type][b]);
  const designTotal = designRow.reduce((a, b) => a + b, 0);
  const afterRow = BANDS.map((b) => afterCounts[`${type}|${b}`] ?? 0);
  const afterTotal = afterRow.reduce((a, b) => a + b, 0);

  const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));
  const row = (label: string, cells: number[], total: number): void => {
    console.log(
      [
        label.padStart(colWidth),
        ...cells.map((n) => pad(String(n))),
        pad(String(total)),
      ].join(""),
    );
  };
  const signedRow = (label: string, cells: number[], total: number): void => {
    console.log(
      [
        label.padStart(colWidth),
        ...cells.map((n) => pad(signed(n))),
        pad(signed(total)),
      ].join(""),
    );
  };

  console.log(`\n${type}`);
  console.log(
    ["".padStart(colWidth), ...BANDS.map(pad), pad("TOTAL")].join(""),
  );
  let beforeRow: number[] | null = null;
  let beforeTotal = 0;
  if (beforeCounts) {
    beforeRow = BANDS.map((b) => beforeCounts[`${type}|${b}`] ?? 0);
    beforeTotal = beforeRow.reduce((a, b) => a + b, 0);
    row("BEFORE", beforeRow, beforeTotal);
  }
  row("AFTER", afterRow, afterTotal);
  row("TARGET", targetRow, targetTotal);
  if (beforeRow) {
    // The like-for-like comparison: warm-up-INCLUSIVE BEFORE against a
    // warm-up-INCLUSIVE grid. Expected to read 0 across the 300 grid rows;
    // the only nonzero cells are the two onboarding rows Phase 6I added on
    // top of the grid (O2 30-45 and AN <20). This is the row that says
    // whether the numbers below can be trusted at all.
    signedRow(
      "CHECK",
      beforeRow.map((b, i) => b - designRow[i]!),
      beforeTotal - designTotal,
    );
    // What the STRIP actually did to this type: the real signal.
    signedRow(
      "MOVED",
      afterRow.map((a, i) => a - beforeRow![i]!),
      afterTotal - beforeTotal,
    );
  }
  // Since the 2026-08-10 rebalance authored a warm-up-FREE TARGET, this row
  // finally compares two of the same thing: it is the outstanding rebalance
  // work, cell by cell, and it reads 0 everywhere when the phase is done.
  // (Arc review F9's warning applied to the old warm-up-inclusive TARGET.)
  signedRow(
    "AFT-TGT",
    afterRow.map((a, i) => a - targetRow[i]!),
    afterTotal - targetTotal,
  );
}

// ---------------------------------------------------------------------
// CLI entry point (guarded so importing this module for its pure
// functions — the unit test — never runs the report or touches the
// filesystem/seed import path unnecessarily).
// ---------------------------------------------------------------------
function main(): void {
  const withWarmups = !processArgv.includes("--after-only");

  const after: WorkoutStat[] = GLOBAL_LIBRARY_SEED.map((w) => ({
    type: w.type,
    minutes: estimateMinutes(w.steps, BASELINES)!.minutes,
  }));
  const afterCounts = bucket(after);

  console.log(`GLOBAL_LIBRARY_SEED: ${GLOBAL_LIBRARY_SEED.length} workouts`);
  console.log(
    "(both grids sum to 300; the 2 onboarding rows, Phase 6I, postdate them",
  );
  console.log(" and land on top of whichever cell they band into)");
  console.log("");
  console.log("READ THIS BEFORE THE NUMBERS");
  console.log(
    "  TWO grids, two rods. TARGET is the 2026-08-10 rebalance grid and it is",
  );
  console.log(
    "  defined over warm-up-FREE durations (patterns.json's `targets`). The",
  );
  console.log(
    "  2026-08-03 DESIGN grid is warm-up-INCLUSIVE — the generation spec's own",
  );
  console.log(
    '  line under its quota table (line 94): "Duration = total time including',
  );
  console.log('  warm-up and rests."');
  console.log(
    "  AFTER is warm-up-free, so AFT-TGT is now a like-for-like comparison:",
  );
  console.log(
    "  it is the OUTSTANDING rebalance work, and it reads 0 when it is done.",
  );
  if (withWarmups) {
    console.log(
      "  * CHECK (BEFORE minus the 2026-08-03 DESIGN grid) is the FAITHFULNESS",
    );
    console.log(
      "    check: 0 in all 20 grid cells means the replay and the band edges",
    );
    console.log("    are right. See the verdict line at the end.");
    console.log(
      "  * MOVED (AFTER minus BEFORE) is what removing the warm-ups actually",
    );
    console.log("    did — the damage the rebalance answers.");
  } else {
    console.log(
      "  --after-only: printing AFTER vs TARGET only. Omit the flag to also",
    );
    console.log(
      "  see BEFORE/CHECK/MOVED against the pre-strip replay — the numbers",
    );
    console.log("  ROADMAP's Phase 9 bullet actually points at.");
  }

  let beforeCounts: Record<string, number> | null = null;
  // The same BEFORE replay restricted to the 300 GRID rows — the
  // faithfulness check's own input; see `gridMismatches`.
  let gridBeforeCounts: Record<string, number> | null = null;
  if (withWarmups) {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const frozenPath = join(scriptDir, "library-warmups-before.json");
    const frozen = JSON.parse(readFileSync(frozenPath, "utf-8")) as Record<
      string,
      number
    >;
    const before: WorkoutStat[] = GLOBAL_LIBRARY_SEED.map((w) => ({
      type: w.type,
      minutes:
        estimateMinutes(w.steps, BASELINES)!.minutes + (frozen[w.title] ?? 0),
    }));
    beforeCounts = bucket(before);
    gridBeforeCounts = bucket(
      LIBRARY_WORKOUTS.map((w) => ({
        type: w.type,
        minutes:
          estimateMinutes(w.steps, BASELINES)!.minutes + (frozen[w.title] ?? 0),
      })),
    );
  }

  for (const t of TYPES) printTypeTable(t, afterCounts, beforeCounts);

  const totalAfter = totalOf(afterCounts);
  const totalTarget = 300;
  console.log(
    `\nGRAND TOTAL: AFTER ${totalAfter} vs TARGET ${totalTarget}${
      beforeCounts ? ` vs BEFORE ${totalOf(beforeCounts)}` : ""
    } (AFT-TGT ${totalAfter - totalTarget > 0 ? "+" : ""}${
      totalAfter - totalTarget
    }; the 2 onboarding rows are the whole difference)`,
  );

  if (gridBeforeCounts) {
    const mismatches = gridMismatches(gridBeforeCounts);
    const cells = Object.keys(mismatches).length;
    console.log(
      cells === 0
        ? "\nFAITHFULNESS CHECK: BEFORE reproduces the 2026-08-03 design" +
            " grid in 20/20" +
            " cells (300 grid rows, onboarding excluded). The replay and the" +
            " band edges are confirmed; the MOVED row can be trusted."
        : `\nFAITHFULNESS CHECK FAILED: ${cells} of 20 cells differ ` +
            `(${JSON.stringify(mismatches)}). Nothing below can be trusted` +
            " until this reads 20/20.",
    );
  }
}

const isMain =
  processArgv[1] !== undefined &&
  import.meta.url === pathToFileURL(processArgv[1]).href;
if (isMain) main();
