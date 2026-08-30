import { EMPTY_FILTERS, type DurationBucket, type Filters } from "./filters";
import { isWorkoutType, type Difficulty } from "../../domain/types.js";
import { clearLibraryScroll } from "./libraryScroll";

/** sessionStorage key for Library's active filters. Same lifecycle as
 *  LIBRARY_SCROLL_KEY (libraryScroll.ts) and cleared at the same single
 *  point (the tab bar's LIBRARY link): the pair together are "where you
 *  were" for a BACK round trip — restoring the scroll position without the
 *  filters it was measured against lands on the wrong row of a different
 *  list, which is the filter-BACK bug this file exists to fix. */
export const LIBRARY_FILTERS_KEY = "ergomatic.libraryFilters";

const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
const BUCKETS: readonly DurationBucket[] = ["<30", "30-45", "45-60", "60+"];
const PAIN_LEVELS: readonly number[] = [1, 2, 3, 4, 5];

function isDifficulty(v: unknown): v is Difficulty {
  return (
    typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v)
  );
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
 *  construction, the fix for every prior-shaped record: the pre-Task-4 (v1)
 *  shape's fields were `painMax3`/`recency`/`customOnly`, and the v2 shape
 *  (Task 4 through the ui-fix round) used a single `type: WorkoutType |
 *  null` where this checks a `types` array — neither name overlaps this
 *  parser's own field list, so both fail on `types` (v1 has no such field
 *  at all; v2's `type` is a different key) and fall back to EMPTY_FILTERS
 *  whole, never a v3 Filters half-populated from older data. */
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
  if (!Array.isArray(f.types) || !f.types.every(isWorkoutType)) return null;
  if (!Array.isArray(f.difficulties) || !f.difficulties.every(isDifficulty)) {
    return null;
  }
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
    // De-duped defensively: toggleType/toggleDifficulty/toggleDuration/
    // togglePainLevel can never produce a duplicate, but a tampered/legacy
    // stored value could, and .includes-based state plus code/level
    // matching both silently tolerate dupes — better to normalise here
    // than trust storage.
    types: [...new Set(f.types)],
    difficulties: [...new Set(f.difficulties)],
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
    const parsed = parseFilters(raw);
    if (parsed === null) {
      // Whole-branch review L5: a rejected record (malformed, or a
      // pre-Task-4 v1 shape) falls back to EMPTY_FILTERS, a WIDER list than
      // whatever was showing when libraryScroll.ts's own saved position was
      // measured — restoring that position against the wrong list is
      // exactly the failure this pair of files exists to prevent (see this
      // file's own LIBRARY_FILTERS_KEY comment above). Only reachable here,
      // not on the `raw === null` branch above: a genuinely fresh visit
      // (nothing ever stored) has no scroll position to desync in the
      // first place.
      clearLibraryScroll();
      return { ...EMPTY_FILTERS };
    }
    return parsed;
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
