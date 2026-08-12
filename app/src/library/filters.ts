import { estimateMinutes } from "../../domain/expand.js";
import { bucketFor, type DurationBucket } from "../../domain/duration.js";
import { RECENCY_BOUNDARY_DAYS, isRecent } from "../../domain/recency.js";
import type { Baselines } from "../../domain/types.js";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { Difficulty, WorkoutType } from "../../domain/types.js";

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
// not an implicit default.
//
// v3 shape (library-filter-unification round, 2026-08-11 — Task 1): TYPE
// moves from a single-select `type: WorkoutType | null` to a multi-select
// union (`types`), matching the shape every other group already used
// (`durations`/`painLevels`) — its control leaves the sheet for a chip row
// above it (Task 2), but that's a rendering concern this file doesn't
// know about; here it's just one more union field. DIFFICULTY is new
// (`difficulties`), same union shape, filtering Library the way Today's own
// DIFFICULTY group already does (empty means no filter, the same
// convention `durations`/`painLevels` use here — Today's own "empty can be
// a deviation" rule doesn't apply to Library). libraryFilters.ts's strict
// validator rejects any prior shape wholesale (field names/types don't
// overlap `types`), which is the point: a stale record — v1, v2, or a
// tampered value — falls back to EMPTY_FILTERS rather than half-applying
// under the new field names.
export interface Filters {
  types: WorkoutType[];
  difficulties: Difficulty[];
  durations: DurationBucket[];
  painLevels: number[];
  lastDone: "under21" | "over21" | null;
  source: "global" | "custom" | null;
}

export const EMPTY_FILTERS: Filters = {
  types: [],
  difficulties: [],
  durations: [],
  painLevels: [],
  lastDone: null,
  source: null,
};

/** The four types, in the repo's canonical order — the "all on" set. */
const ALL_TYPES: readonly WorkoutType[] = ["O2", "AT", "TR", "AN"];

/** `types: []` is the canonical ALL-ON state: no narrowing, and every chip
 *  renders selected (James, 2026-08-12: "I'd like them all on by default").
 *  A non-empty `types` is always a STRICT subset of 1 to 3 types, never all
 *  four — `toggleType` normalizes a complete set back to `[]` so there is
 *  exactly one representation of "all on" and the rules below stay total. */
export function isTypeSelected(f: Filters, t: WorkoutType): boolean {
  return f.types.length === 0 || f.types.includes(t);
}

/** The chip row's whole state machine (James, 2026-08-12):
 *
 *  - all on (`[]`) + tap X  -> only X selected. The others deselect.
 *  - a subset + tap an unselected X -> add it (ordinary multi-select).
 *  - a subset + tap its LAST selected member -> back to all on, never to a
 *    selection that matches nothing. "Deselect the last selected type ->
 *    they turn back on".
 *  - reaching all four one tap at a time normalizes to `[]`, so the next tap
 *    follows the all-on rule instead of dropping to three.
 *
 *  Only the last of those four needs code: an add/remove toggle plus the
 *  all-four normalization produces the other three by itself, since `[]`
 *  never `includes` anything (so a tap while all-on always yields exactly
 *  `[t]`) and removing the last member yields `[]`, which IS all-on. Two
 *  explicit early-return branches for those cases were written first and
 *  deleted after mutation testing showed neither could fail a test: they
 *  were restatements of the general path, not behaviour. */
export function toggleType(f: Filters, t: WorkoutType): Filters {
  const next = f.types.includes(t)
    ? f.types.filter((existing) => existing !== t)
    : [...f.types, t];
  return {
    ...f,
    types: next.length === ALL_TYPES.length ? [] : next,
  };
}

export function toggleDifficulty(f: Filters, d: Difficulty): Filters {
  const difficulties = f.difficulties.includes(d)
    ? f.difficulties.filter((existing) => existing !== d)
    : [...f.difficulties, d];
  return { ...f, difficulties };
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

/** Is ANY filter active? Read this, never `filterTokens(f).length > 0` —
 *  that equivalence broke on 2026-08-12, when TYPE stopped being tokenized
 *  ("already visible": its chip row is the indicator). A type-only filter
 *  produces zero tokens while genuinely narrowing the list, so the old
 *  token-derived test made Library's header claim the full count over a
 *  filtered list, and hid CLEAR ALL. Deriving from the FILTERS keeps the
 *  header honest and survives the next non-tokenized control too. */
export function hasActiveFilters(f: Filters): boolean {
  return (
    f.types.length > 0 ||
    f.difficulties.length > 0 ||
    f.durations.length > 0 ||
    f.painLevels.length > 0 ||
    f.lastDone !== null ||
    f.source !== null
  );
}

/** Resets exactly the FILTER SHEET's own groups — DIFFICULTY, TIME, PAIN,
 *  LAST DONE, SOURCE — to empty, leaving `types` (the chip row's own group,
 *  which the sheet holds no control for at all since Task 2) untouched.
 *
 *  Fix round (whole-branch review, finding B): `FilterSheet.tsx`'s own
 *  CLEAR button used to call the plain `clearFilters()` above, silently
 *  emptying `types` too — a group the sheet cannot even show the rower is
 *  about to lose, since it renders no TYPE cell any more. Controller
 *  ruling: CLEAR (inside the sheet) means "clear what's in here"; CLEAR ALL
 *  (`Library.tsx`'s own token-row control, still wired to `clearFilters()`
 *  above, unchanged) remains the one control that empties everything,
 *  `types` included. */
export function clearSheetFilters(f: Filters): Filters {
  return { ...EMPTY_FILTERS, types: f.types };
}

export function applyFilters(
  workouts: LibraryWorkout[],
  f: Filters,
  baselines: Baselines | null,
): LibraryWorkout[] {
  return workouts.filter((w) => {
    if (f.types.length > 0 && !f.types.includes(w.type)) return false;
    if (f.difficulties.length > 0 && !f.difficulties.includes(w.difficulty)) {
      return false;
    }
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
