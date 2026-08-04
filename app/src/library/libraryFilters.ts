import { EMPTY_FILTERS, type DurationBucket, type Filters } from "./filters";
import type { WorkoutType } from "../../domain/types.js";

/** sessionStorage key for Library's active filters. Same lifecycle as
 *  LIBRARY_SCROLL_KEY (libraryScroll.ts) and cleared at the same single
 *  point (the tab bar's LIBRARY link): the pair together are "where you
 *  were" for a BACK round trip — restoring the scroll position without the
 *  filters it was measured against lands on the wrong row of a different
 *  list, which is the filter-BACK bug this file exists to fix. */
export const LIBRARY_FILTERS_KEY = "ergomatic.libraryFilters";

const TYPES: readonly WorkoutType[] = ["AN", "O2", "AT", "TR"];
const BUCKETS: readonly DurationBucket[] = ["<30", "30-45", "45-60", "60+"];
const PAIN_LEVELS: readonly number[] = [1, 2, 3, 4, 5];

function isWorkoutType(v: unknown): v is WorkoutType {
  return typeof v === "string" && (TYPES as readonly string[]).includes(v);
}

function isBucket(v: unknown): v is DurationBucket {
  return typeof v === "string" && (BUCKETS as readonly string[]).includes(v);
}

function isPainLevel(v: unknown): v is number {
  return typeof v === "number" && PAIN_LEVELS.includes(v);
}

/** Strict shape check — a stored value that predates a future Filters
 *  change (or was hand-edited) must come back `null`, never a Filters with
 *  a hole in it: applyFilters trusts every field. This is also, by
 *  construction, the fix for a v1-shaped record left over from before Task 4
 *  (ui-fix round): v1's fields were `painMax3`/`recency`/`customOnly`, none
 *  of which this parser reads, so a v1 record fails the v2 checks below on
 *  every field but `type`/`durations` and falls back to EMPTY_FILTERS whole
 *  — never a v2 Filters half-populated from v1 data. */
function parseFilters(raw: string): Filters | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const f = parsed as Record<string, unknown>;
  if (f.type !== null && !isWorkoutType(f.type)) return null;
  if (!Array.isArray(f.durations) || !f.durations.every(isBucket)) return null;
  if (!Array.isArray(f.painLevels) || !f.painLevels.every(isPainLevel)) {
    return null;
  }
  if (
    f.lastDone !== null &&
    f.lastDone !== "under21" &&
    f.lastDone !== "over21"
  ) {
    return null;
  }
  if (f.source !== null && f.source !== "global" && f.source !== "custom") {
    return null;
  }
  return {
    type: f.type,
    // De-duped defensively: toggleDuration/togglePainLevel can never
    // produce a duplicate, but a tampered/legacy stored value could, and
    // .includes-based state plus bucket/level matching both silently
    // tolerate dupes — better to normalise here than trust storage.
    durations: [...new Set(f.durations)],
    painLevels: [...new Set(f.painLevels)],
    lastDone: f.lastDone,
    source: f.source,
  };
}

/** Persists the active filters. Best-effort like saveLibraryScroll: a lost
 *  filter set is not worth surfacing to the rower. */
export function saveLibraryFilters(filters: Filters): void {
  try {
    sessionStorage.setItem(LIBRARY_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // best-effort
  }
}

/** Returns the saved filters, or EMPTY_FILTERS when nothing valid is
 *  stored. Returning the empty set rather than `null` lets Library's
 *  useState initializer call this directly. */
export function loadLibraryFilters(): Filters {
  try {
    const raw = sessionStorage.getItem(LIBRARY_FILTERS_KEY);
    if (raw === null) return { ...EMPTY_FILTERS };
    return parseFilters(raw) ?? { ...EMPTY_FILTERS };
  } catch {
    return { ...EMPTY_FILTERS };
  }
}

/** Clears the saved filters. Called from the tab bar's LIBRARY link only,
 *  alongside clearLibraryScroll — see that function's comment for why the
 *  tab tap is the one point that can distinguish a fresh visit from a BACK
 *  return. */
export function clearLibraryFilters(): void {
  try {
    sessionStorage.removeItem(LIBRARY_FILTERS_KEY);
  } catch {
    // best-effort, same rationale as saveLibraryFilters
  }
}
