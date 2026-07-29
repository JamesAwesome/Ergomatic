import { estimateMinutes } from "../../domain/expand.js";
import type { Baselines } from "../../domain/types.js";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { WorkoutType } from "../../domain/types.js";

export type DurationBucket = "<30" | "30-45" | "45-60" | "60+";

export interface Filters {
  type: WorkoutType | null;
  durations: DurationBucket[];
  painMax3: boolean;
  recency: "recent" | "not-recent" | null;
}

export const EMPTY_FILTERS: Filters = {
  type: null,
  durations: [],
  painMax3: false,
  recency: null,
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

export function togglePain(f: Filters): Filters {
  return { ...f, painMax3: !f.painMax3 };
}

export function setRecency(f: Filters, r: "recent" | "not-recent"): Filters {
  return { ...f, recency: f.recency === r ? null : r };
}

export function clearFilters(): Filters {
  return { ...EMPTY_FILTERS };
}

// Boundaries per the handoff: <30, 30-45, 45-60, 60+ — the lower bucket owns
// its upper boundary (29 is "<30", exactly 30 is "30-45").
export function bucketFor(minutes: number): DurationBucket {
  if (minutes < 30) return "<30";
  if (minutes < 45) return "30-45";
  if (minutes < 60) return "45-60";
  return "60+";
}

// Never-done (`lastDoneDaysAgo === null`) counts as NOT recent — pinned by
// the filters.test.ts "never-done" case, not an oversight.
function isRecent(lastDoneDaysAgo: number | null): boolean {
  return lastDoneDaysAgo !== null && lastDoneDaysAgo < 21;
}

export function applyFilters(
  workouts: LibraryWorkout[],
  f: Filters,
  baselines: Baselines | null,
): LibraryWorkout[] {
  return workouts.filter((w) => {
    if (f.type !== null && w.type !== f.type) return false;
    if (f.painMax3 && w.pain > 3) return false;
    if (f.recency === "recent" && !isRecent(w.lastDoneDaysAgo)) return false;
    if (f.recency === "not-recent" && isRecent(w.lastDoneDaysAgo)) return false;
    // Baselines are required to estimate duration; when unknown, the
    // duration chips are skipped rather than hiding every workout.
    if (f.durations.length > 0 && baselines !== null) {
      const { minutes } = estimateMinutes(w.steps, baselines);
      if (!f.durations.includes(bucketFor(minutes))) return false;
    }
    return true;
  });
}
