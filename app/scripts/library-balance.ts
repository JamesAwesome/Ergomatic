// The rebalance report — docs/superpowers/specs/2026-08-09-warmup-setting-
// design.md §7 ("The rebalance report (decision input, not a decision)"),
// as re-purposed by the 2026-08-10 library-rebalance spec (§2, ruling B)
// once that phase actually authored a warm-up-free target grid and retuned
// the library onto it (300/300, 0 debt, all 20 cells): buckets all 302
// seeded workouts by `estimateMinutes` into the generation phase's own
// ranges and prints AFTER beside `patterns.targets`, per type, with drift
// in points.
//
// Run: `pnpm exec tsx scripts/library-balance.ts [--history]`
//
// The DEFAULT output is now the ACCEPTANCE statement the rebalance phase
// closed against: AFTER vs `patterns.targets`, cell by cell, over the 300
// grid rows (onboarding excluded — see `gridMismatches`'s own doc comment).
// It reads 0 in all 20 cells today; a future content change that regresses
// a cell will make it non-zero again, and that is the signal to read.
//
// `--history` additionally replays BEFORE (from the frozen `library-
// warmups-before.json` literal, captured in the SAME commit that deleted
// the 302 `{ k: "wu", ... }` lines — Task 3 of the warmup-setting plan,
// 2026-08-09) and prints it against `DESIGN_GRID_2026_08_03`, the ORIGINAL
// warm-up-inclusive grid the 300-workout library was first authored
// against. This is HISTORY, not a live gate: it proved, on 2026-08-09,
// that the frozen replay exactly reproduced the pre-strip library and that
// this script's band edges matched the 2026-08-03 design's own convention
// — evidence the warmup strip changed nothing else about any workout
// (spec §6: "Nothing else about any workout changes"). The 2026-08-10
// rebalance then retuned 93 of those same workouts' real durations, so
// BEFORE (AFTER + a now-stale frozen delta) no longer reproduces any real
// historical state and the replay-vs-design-grid comparison is expected to
// show mismatches from here on — that is not a regression, it is the
// replay's job (a snapshot of 2026-08-09) meeting content that moved after
// it was taken. `--history` prints one sentence saying so rather than an
// alarming PASS/FAIL banner.
//
// patterns.json's 20 `warmupMinutes` stat entries (one per generation
// cell) are RETAINED, not orphaned — the regen follow-on (the 2026-08-10
// library-rebalance spec, §2's adversarial B4 correction) found that they
// are the record of the book cells' warm-up-inclusiveness and that §6's
// translation rule depends on them. This script still does not read them;
// it reads that file's `targets` block instead (below).
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
// grid — that was the FAITHFULNESS CHECK, `gridMismatches` below, a
// 2026-08-09 HISTORICAL result now folded behind `--history` — and AFTER
// (warm-up-free) is compared against TARGET, the live ACCEPTANCE gate. The
// AFT-TGT row that used to carry the "not a rebalance signal" warning is
// THE rebalance signal now that TARGET is the grid content was retuned
// against. band() applies the SAME edges the design used when the grid
// was authored; only the durations fed into it changed.
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

/** Generic grid comparison: every `${type}|${band}` cell where `counts`
 *  disagrees with `target`, as `cell: delta` pairs. Empty means all 20
 *  cells match. Two call sites, two different rods:
 *
 *  1. **The live ACCEPTANCE gate** (`main`'s default path): `target` passed
 *     explicitly as `TARGET` (`patterns.json`'s rebalance grid), `counts`
 *     the real AFTER content over the 300 grid rows. Empty means the
 *     rebalance holds — content matches what it was retuned to hit.
 *  2. **The historical FAITHFULNESS CHECK** (arc review F9, `main`'s
 *     `--history` path): `target` left at its default, `DESIGN_GRID_2026_08_03`
 *     — the check's job was to prove the warm-up-inclusive BEFORE replay
 *     reproduced the library the warm-up-inclusive grid was authored
 *     against, and that this script's band edges matched the convention
 *     the generation phase actually used (the spec states the edges'
 *     VALUES but never their inclusivity, so reproducing all 20 cells was
 *     better evidence than the doc). It read empty once, on 2026-08-09;
 *     it is not expected to any more (see the file header) and no code
 *     path other than `--history` calls it against the design grid.
 *
 *  Both call sites compute over `LIBRARY_WORKOUTS` (300), not
 *  `GLOBAL_LIBRARY_SEED` (302): the two onboarding rows postdate both
 *  grids and are not part of what either was authored against. */
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
    // HISTORY only (`--history`): the like-for-like comparison, warm-up-
    // INCLUSIVE BEFORE against the warm-up-INCLUSIVE design grid. Read 0
    // across the 300 grid rows once, on 2026-08-09 (the two onboarding
    // rows Phase 6I added land on top and are excluded here); the
    // 2026-08-10 rebalance then retuned 93 workouts' real durations, so
    // BEFORE (AFTER + a now-stale frozen delta) is not expected to
    // reproduce it any more — see the file header.
    signedRow(
      "CHECK",
      beforeRow.map((b, i) => b - designRow[i]!),
      beforeTotal - designTotal,
    );
    // HISTORY only: what the 2026-08-09 warm-up STRIP did to this type,
    // frozen at that moment — not the current state of the library.
    signedRow(
      "MOVED",
      afterRow.map((a, i) => a - beforeRow![i]!),
      afterTotal - beforeTotal,
    );
  }
  // THE LIVE SIGNAL, printed in every mode: AFTER vs the 2026-08-10
  // rebalance's warm-up-free TARGET, the grid the library was actually
  // retuned to hit. Reads 0 everywhere the rebalance holds; a future
  // content change that regresses a cell makes this row non-zero again.
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
  const withHistory = processArgv.includes("--history");

  const after: WorkoutStat[] = GLOBAL_LIBRARY_SEED.map((w) => ({
    type: w.type,
    minutes: estimateMinutes(w.steps, BASELINES)!.minutes,
  }));
  const afterCounts = bucket(after);
  // The same AFTER content restricted to the 300 GRID rows — the
  // acceptance gate's own input; see `gridMismatches`. Onboarding rows
  // postdate the grid and are excluded so they can't manufacture a false
  // mismatch or mask a real one.
  const gridAfterCounts = bucket(
    LIBRARY_WORKOUTS.map((w) => ({
      type: w.type,
      minutes: estimateMinutes(w.steps, BASELINES)!.minutes,
    })),
  );

  console.log(`GLOBAL_LIBRARY_SEED: ${GLOBAL_LIBRARY_SEED.length} workouts`);
  console.log(
    "(the grid sums to 300; the 2 onboarding rows, Phase 6I, postdate it and",
  );
  console.log(" land on top of whichever cell they band into)");
  console.log("");
  console.log("READ THIS BEFORE THE NUMBERS");
  console.log(
    "  AFT-TGT is the live signal: AFTER (warm-up-free durations) minus",
  );
  console.log(
    "  TARGET, the 2026-08-10 rebalance grid (patterns.json's `targets`).",
  );
  console.log(
    "  It reads 0 in every cell when the library matches what it was",
  );
  console.log("  retuned to hit; the ACCEPTANCE line below states this.");
  if (withHistory) {
    console.log(
      "  --history additionally replays BEFORE (warm-up-inclusive, frozen",
    );
    console.log(
      "  2026-08-09) against the ORIGINAL 2026-08-03 DESIGN grid (also warm-",
    );
    console.log(
      "  up-inclusive). CHECK/MOVED and the closing note below are that",
    );
    console.log(
      "  2026-08-09 snapshot, not a live gate — see the file header.",
    );
  } else {
    console.log(
      "  (pass --history to also see the frozen pre-rebalance BEFORE/CHECK/",
    );
    console.log("  MOVED replay, kept for the record, not as a live gate.)");
  }

  let beforeCounts: Record<string, number> | null = null;
  // The same BEFORE replay restricted to the 300 GRID rows — the
  // historical faithfulness check's own input; see `gridMismatches`.
  let gridBeforeCounts: Record<string, number> | null = null;
  if (withHistory) {
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

  // THE ACCEPTANCE STATEMENT — the default output's real verdict, AFTER
  // vs `patterns.targets` over the 300 grid rows (onboarding excluded).
  // This is what the 2026-08-10 rebalance phase closed against; it reads
  // 0/0 today.
  const acceptanceMismatches = gridMismatches(gridAfterCounts, TARGET);
  const acceptanceCells = Object.keys(acceptanceMismatches).length;
  console.log(
    acceptanceCells === 0
      ? "\nACCEPTANCE: AFTER matches patterns.targets exactly in all 20" +
          " cells (300 grid rows, onboarding excluded). The library holds" +
          " the shape the 2026-08-10 rebalance retuned it to."
      : `\nACCEPTANCE FAILED: ${acceptanceCells} of 20 cells differ from` +
          ` patterns.targets (${JSON.stringify(acceptanceMismatches)}).`,
  );

  if (gridBeforeCounts) {
    // HISTORY only. Do not print PASS/FAIL: post-rebalance, BEFORE (a
    // 2026-08-09 snapshot plus a now-stale frozen delta) is not expected
    // to reproduce the 2026-08-03 design grid any more, so a mismatch
    // count here is not a regression — see the file header.
    const mismatches = gridMismatches(gridBeforeCounts);
    const cells = Object.keys(mismatches).length;
    console.log(
      "\nHISTORICAL NOTE (--history): this replay proved, on 2026-08-09" +
        " (Task 3 of the warmup-setting plan, before the 2026-08-10" +
        " rebalance retuned 93 workouts), that the frozen BEFORE replay" +
        " exactly reproduced the pre-strip library and that this script's" +
        " band edges matched the 2026-08-03 design grid's own convention." +
        " It is not a live gate any more.",
    );
    console.log(
      cells === 0
        ? "(all 20 cells still match the design grid.)"
        : `(${cells} of 20 cells now differ — expected, since the` +
            ` rebalance retuned real durations after this snapshot was` +
            ` taken: ${JSON.stringify(mismatches)})`,
    );
  }
}

const isMain =
  processArgv[1] !== undefined &&
  import.meta.url === pathToFileURL(processArgv[1]).href;
if (isMain) main();
