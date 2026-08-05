import { estimateMinutes } from "../../domain/expand.js";
import { bucketFor, type DurationBucket } from "../../domain/duration.js";
import { RECENCY_BOUNDARY_DAYS, isRecent } from "../../domain/recency.js";
import type { Baselines } from "../../domain/types.js";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { WorkoutType } from "../../domain/types.js";

// Re-exported for every pre-existing importer (filterTokens.ts, FilterSheet.tsx,
// libraryFilters.ts, filters.test.ts) — moved into domain/duration.ts
// (Amendment, 2026-08-04 PR #50 round) so domain/suggest.ts's own duration
// predicate can share the identical bucket definition, but nothing here
// needs to change its own import path.
export type { DurationBucket };
export { bucketFor };

// Re-exported for every pre-existing importer (filterTokens.ts, FilterSheet.tsx,
// filters.test.ts) — moved into domain/recency.ts (Round 2, 2026-08-04) so
// domain/suggest.ts's own LAST DONE predicate can share the identical
// boundary/rule, but nothing here needs to change its own import path.
export { RECENCY_BOUNDARY_DAYS, isRecent };

// v2 shape (Task 4, ui-fix round — DESIGN.md's "Library, second pass"):
// PAIN moves from a single `painMax3` threshold toggle to a 1–5 multi-select
// union (`painLevels`), and RECENT/NOT RECENT's own words retire in favour
// of a plain boundary pair (`lastDone`) with `customOnly` folded into the
// symmetric `source` pair — GLOBAL is now as much a filter as CUSTOM was,
// not an implicit default. libraryFilters.ts's strict validator rejects the
// old v1 shape wholesale (field names/types don't overlap), which is the
// point: a stale v1 record falls back to EMPTY_FILTERS rather than
// half-applying under the new field names.
export interface Filters {
  type: WorkoutType | null;
  durations: DurationBucket[];
  painLevels: number[];
  lastDone: "under21" | "over21" | null;
  source: "global" | "custom" | null;
}

export const EMPTY_FILTERS: Filters = {
  type: null,
  durations: [],
  painLevels: [],
  lastDone: null,
  source: null,
};

export function toggleType(f: Filters, t: WorkoutType): Filters {
  return { ...f, type: f.type === t ? null : t };
}

export function toggleDuration(f: Filters, d: DurationBucket): Filters {
  const durations = f.durations.includes(d)
    ? f.durations.filter((existing) => existing !== d)
    : [...f.durations, d];
  return { ...f, durations };
}

export function togglePainLevel(f: Filters, level: number): Filters {
  const painLevels = f.painLevels.includes(level)
    ? f.painLevels.filter((existing) => existing !== level)
    : [...f.painLevels, level];
  return { ...f, painLevels };
}

export function setLastDone(f: Filters, value: "under21" | "over21"): Filters {
  return { ...f, lastDone: f.lastDone === value ? null : value };
}

export function setSource(f: Filters, value: "global" | "custom"): Filters {
  return { ...f, source: f.source === value ? null : value };
}

export function clearFilters(): Filters {
  return { ...EMPTY_FILTERS };
}

export function applyFilters(
  workouts: LibraryWorkout[],
  f: Filters,
  baselines: Baselines | null,
): LibraryWorkout[] {
  return workouts.filter((w) => {
    if (f.type !== null && w.type !== f.type) return false;
    if (f.painLevels.length > 0 && !f.painLevels.includes(w.pain)) {
      return false;
    }
    if (f.source === "custom" && w.isGlobal) return false;
    if (f.source === "global" && !w.isGlobal) return false;
    if (f.lastDone === "under21" && !isRecent(w.lastDoneDaysAgo)) {
      return false;
    }
    if (f.lastDone === "over21" && isRecent(w.lastDoneDaysAgo)) return false;
    // Baselines are required to estimate duration; when unknown, the
    // duration chips are skipped rather than hiding every workout.
    if (f.durations.length > 0 && baselines !== null) {
      const { minutes } = estimateMinutes(w.steps, baselines);
      if (!f.durations.includes(bucketFor(minutes))) return false;
    }
    return true;
  });
}
