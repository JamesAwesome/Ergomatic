// The rebalance report — docs/superpowers/specs/2026-08-09-warmup-setting-
// design.md §7 ("The rebalance report (decision input, not a decision)"):
// "buckets all 302 seeded workouts by `estimateMinutes` into the generation
// phase's own ranges ... prints the distribution BEFORE the wu-drop
// (computed from git history's seed state or a flag replaying with warmups
// included) and AFTER, beside the targets, with per-type breakdowns [and]
// states drift per bucket in points."
//
// Run: `pnpm exec tsx scripts/library-balance.ts [--with-warmups]`
//
// Without the flag, prints AFTER vs TARGET only. `--with-warmups` also
// prints BEFORE, replayed from `library-warmups-before.json` — a frozen
// literal (workout title -> historical warmup minutes) captured from the
// pre-strip seed content in the SAME commit that deleted the 302
// `{ k: "wu", ... }` lines (Task 3 of the warmup-setting plan,
// 2026-08-09). Replaying is exact: stripping `wu` changed nothing else
// about any workout (spec §6: "Nothing else about any workout changes"),
// so BEFORE_minutes(w) = AFTER_minutes(w) + frozen[w.title].
//
// patterns.json's 20 `warmupMinutes` stat entries (one per generation
// cell) are ORPHANED by this change, not deleted or corrected — per spec
// §6: "patterns.json's 20 `warmupMinutes` stat entries are ORPHANED, not
// deleted: the balance script (§7) and any future regen read the file,
// and rewriting it is the regen follow-on's business, not this phase's."
// This script does not read those entries at all.
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { estimateMinutes } from "../domain/expand.js";
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

// Bucket edges and the TARGET grid, verbatim from docs/superpowers/specs/
// 2026-08-03-workout-generation-design.md §4 ("Quota grid"). The falsifying
// line for everything this script prints is that spec's LINE 94, the row
// directly under the quota table, quoted verbatim:
//
//     "Duration = total time including warm-up and rests."
//
// THE TARGET GRID IS THEREFORE DEFINED OVER WARM-UP-INCLUSIVE DURATIONS,
// and AFTER (post-strip) is warm-up-free. AFTER-vs-TARGET is not a
// like-for-like comparison and must never be read as a rebalance signal —
// arc review F9. BEFORE-vs-TARGET is the like-for-like one, and it is what
// this script uses as its FAITHFULNESS CHECK (see `gridMismatches` below).
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

// The design's quota grid (§4 table), the ORIGINAL target the 300-workout
// library was authored against — every workout's duration then included
// its warm-up. This is deliberately NOT the same object as library.test.ts's
// QUOTA constant: that file now pins the MEASURED post-strip reality (a
// content-regression guard), while this is the unchanged design intent
// the strip drifted away from.
export const TARGET: Record<WorkoutType, Record<Band, number>> = {
  O2: { "<20": 2, "20-30": 14, "30-45": 36, "45-60": 18, "60+": 20 },
  AT: { "<20": 5, "20-30": 19, "30-45": 34, "45-60": 13, "60+": 4 },
  TR: { "<20": 9, "20-30": 22, "30-45": 32, "45-60": 9, "60+": 3 },
  AN: { "<20": 14, "20-30": 20, "30-45": 18, "45-60": 5, "60+": 3 },
};

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
 *  where `counts` disagrees with the design grid, as `cell: delta` pairs.
 *  Empty means all 20 cells match.
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
  target: Record<WorkoutType, Record<Band, number>> = TARGET,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [cell, delta] of Object.entries(drift(counts, target))) {
    if (delta !== 0) out[cell] = delta;
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
      beforeRow.map((b, i) => b - targetRow[i]!),
      beforeTotal - targetTotal,
    );
    // What the STRIP actually did to this type: the real signal.
    signedRow(
      "MOVED",
      afterRow.map((a, i) => a - beforeRow![i]!),
      afterTotal - beforeTotal,
    );
  }
  // NOT a rebalance signal (arc review F9) — warm-up-free counts against a
  // warm-up-inclusive grid. Renamed from DRIFT so nobody reads it as one.
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
  const withWarmups = processArgv.includes("--with-warmups");

  const after: WorkoutStat[] = GLOBAL_LIBRARY_SEED.map((w) => ({
    type: w.type,
    minutes: estimateMinutes(w.steps, BASELINES)!.minutes,
  }));
  const afterCounts = bucket(after);

  console.log(`GLOBAL_LIBRARY_SEED: ${GLOBAL_LIBRARY_SEED.length} workouts`);
  console.log(
    "(design TARGET grid sums to 300; the 2 onboarding rows, Phase 6I,",
  );
  console.log(" postdate the grid and land on top of it wherever they band)");
  console.log("");
  console.log("READ THIS BEFORE THE NUMBERS");
  console.log(
    "  The TARGET grid is defined over warm-up-INCLUSIVE durations. The",
  );
  console.log(
    "  generation spec's own line under the quota table (2026-08-03-workout-",
  );
  console.log(
    '  generation-design.md line 94): "Duration = total time including',
  );
  console.log('  warm-up and rests."');
  console.log(
    "  AFTER is warm-up-FREE, so the AFT-TGT row compares two different",
  );
  console.log(
    "  things. It measures the STRIP, not the library, and it is NOT a",
  );
  console.log("  rebalance signal. Do not rule on a regen from it.");
  console.log(
    "  * CHECK (BEFORE minus TARGET) is the like-for-like comparison and the",
  );
  console.log(
    "    FAITHFULNESS check: 0 in all 20 grid cells means the replay and the",
  );
  console.log("    band edges are right. See the verdict line at the end.");
  console.log(
    "  * MOVED (AFTER minus BEFORE) is what removing the warm-ups actually",
  );
  console.log("    did. That is the real signal.");
  console.log(
    "  * AFTER is the new reality and it is AWAITING A NEW TARGET GRID; no",
  );
  console.log(
    "    grid has been authored over warm-up-free durations yet. A rower",
  );
  console.log(
    "    with a 10 minute warm-up preference recovers roughly the original",
  );
  console.log("    spread at run time.");

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
    }, not a rebalance signal)`,
  );

  if (gridBeforeCounts) {
    const mismatches = gridMismatches(gridBeforeCounts);
    const cells = Object.keys(mismatches).length;
    console.log(
      cells === 0
        ? "\nFAITHFULNESS CHECK: BEFORE reproduces the design grid in 20/20" +
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
