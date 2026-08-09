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
import { GLOBAL_LIBRARY_SEED } from "../server/seed/library/index.js";

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
// 2026-08-03-workout-generation-design.md §4 ("Quota grid"). The doc's own
// row directly under the table: "Duration = total time including warm-up
// and rests." — so removing the warm-up minutes moves the boundary, it
// does not redefine it; band() below applies the SAME edges the design
// used when the grid was authored.
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
  const driftRow = afterRow.map((a, i) => a - targetRow[i]!);

  console.log(`\n${type}`);
  console.log(
    ["".padStart(colWidth), ...BANDS.map(pad), pad("TOTAL")].join(""),
  );
  if (beforeCounts) {
    const beforeRow = BANDS.map((b) => beforeCounts[`${type}|${b}`] ?? 0);
    const beforeTotal = beforeRow.reduce((a, b) => a + b, 0);
    console.log(
      [
        "BEFORE".padStart(colWidth),
        ...beforeRow.map((n) => pad(String(n))),
        pad(String(beforeTotal)),
      ].join(""),
    );
  }
  console.log(
    [
      "AFTER".padStart(colWidth),
      ...afterRow.map((n) => pad(String(n))),
      pad(String(afterTotal)),
    ].join(""),
  );
  console.log(
    [
      "TARGET".padStart(colWidth),
      ...targetRow.map((n) => pad(String(n))),
      pad(String(targetTotal)),
    ].join(""),
  );
  console.log(
    [
      "DRIFT".padStart(colWidth),
      ...driftRow.map((n) => pad((n > 0 ? "+" : "") + String(n))),
      pad(
        (afterTotal - targetTotal > 0 ? "+" : "") +
          String(afterTotal - targetTotal),
      ),
    ].join(""),
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
    "(design TARGET grid sums to 300 — the 2 onboarding rows, Phase 6I,",
  );
  console.log(" postdate the grid and land on top of it wherever they band)");

  let beforeCounts: Record<string, number> | null = null;
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
  }

  for (const t of TYPES) printTypeTable(t, afterCounts, beforeCounts);

  const totalAfter = totalOf(afterCounts);
  const totalTarget = 300;
  console.log(
    `\nGRAND TOTAL: AFTER ${totalAfter} vs TARGET ${totalTarget}${
      beforeCounts ? ` vs BEFORE ${totalOf(beforeCounts)}` : ""
    } (drift ${totalAfter - totalTarget > 0 ? "+" : ""}${
      totalAfter - totalTarget
    })`,
  );
}

const isMain =
  processArgv[1] !== undefined &&
  import.meta.url === pathToFileURL(processArgv[1]).href;
if (isMain) main();
