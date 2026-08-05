import type { Difficulty, WorkoutType } from "../../domain/types.js";
import {
  DURATION_BUCKETS,
  bucketsForCap,
  type DurationBucket,
} from "../../domain/duration.js";

// Re-exported for every pre-existing importer of this module (Today.tsx,
// todayFilterTokens.ts, todayOverrides.test.ts) — moved into
// domain/duration.ts (see that function's own doc comment) once
// server/routes/data.ts turned out to need the identical derivation.
export { bucketsForCap };

/** localStorage key for Today's client-side filter/swap overrides — visible,
 *  rower-editable narrowing of what the Today suggestion considers, layered
 *  on top of the server's own preferences (Task 1's `SuggestPrefs`) without
 *  writing back to them. Same storage (localStorage, not sessionStorage) and
 *  the same `{date, planKey, doneN}` invalidation contract as todayPick.ts's
 *  `TodayPick` — both are "today's ephemeral choice", not data worth
 *  preserving across a context change. */
export const TODAY_OVERRIDES_KEY = "ergomatic.todayOverrides";

/** The stored overrides: keyed by calendar date and — when a plan is
 *  active — the plan's identity and position, exactly like `TodayPick`
 *  (see that interface's own doc comment for why all three fields have to
 *  match before a stored value is trusted). `swapType: null` means "no
 *  swap" (suggest against the plan's own prescribed type); an empty
 *  `durations` array means no TIME filter (off) — every field here always
 *  holds a real value, there is no separate "nothing chosen yet" state.
 *
 *  v3 (Amendment, 2026-08-04 PR #50 round): `capMinutes: number | null`
 *  (a single-value cap) is REPLACED by `durations: DurationBucket[]` (a
 *  bucket union) — TIME unifies on the Library's own four buckets
 *  (`<30/30-45/45-60/60+`, multi-select) instead of a cap single-select.
 *
 *  v4 (Round 2, 2026-08-04): `+ lastDone`, `+ source` — Today's sheet gains
 *  the Library's own LAST DONE/SOURCE pair (src/library/filters.ts's
 *  `Filters.lastDone`/`Filters.source`), same mutually-exclusive toggle-off
 *  semantics. Both default to `null` ("off", no deviation) rather than ever
 *  needing a separate "nothing chosen yet" state — same convention every
 *  other field here already follows. */
export interface TodayOverrides {
  date: string; // "YYYY-MM-DD" local (todayPick's format)
  planKey: string | null;
  doneN: number | null;
  swapType: WorkoutType | null; // null = no swap
  difficulties: Difficulty[];
  // A union, not a threshold — mirrors Library's own `Filters.durations`
  // (src/library/filters.ts). Empty = off, identical to Library's own
  // semantics (domain/suggest.ts's own predicate skips the check entirely).
  durations: DurationBucket[];
  // A union, not a threshold — Task 5 (ui-fix round) replaces the old
  // `painMax3` boolean with the same 1-5 multi-select shape Library's own
  // `Filters.painLevels` (src/library/filters.ts) settled on. Empty = off.
  painLevels: number[];
  // v4 (Round 2): mirrors Library's own `Filters.lastDone` — null = off.
  lastDone: "under21" | "over21" | null;
  // v4 (Round 2): mirrors Library's own `Filters.source` — null = off.
  source: "global" | "custom" | null;
}

const TYPES: readonly WorkoutType[] = ["AN", "O2", "AT", "TR"];
const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
const PAIN_LEVELS: readonly number[] = [1, 2, 3, 4, 5];

function isWorkoutType(v: unknown): v is WorkoutType {
  return typeof v === "string" && (TYPES as readonly string[]).includes(v);
}

function isDifficulty(v: unknown): v is Difficulty {
  return (
    typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v)
  );
}

function isDurationBucket(v: unknown): v is DurationBucket {
  return (
    typeof v === "string" && (DURATION_BUCKETS as readonly string[]).includes(v)
  );
}

function isPainLevel(v: unknown): v is number {
  return typeof v === "number" && PAIN_LEVELS.includes(v);
}

function isLastDone(v: unknown): v is "under21" | "over21" {
  return v === "under21" || v === "over21";
}

function isSource(v: unknown): v is "global" | "custom" {
  return v === "global" || v === "custom";
}

/** Strict shape check, same discipline as libraryFilters.ts's parseFilters
 *  — a stored value that predates a future TodayOverrides change (or was
 *  hand-edited) must come back `null`, never an object with a hole in it:
 *  every field here is trusted as-is by TodayView/suggest. This is also,
 *  by construction, the fix for both prior shapes: v1's pain field was
 *  `painMax3: boolean`, which this parser never reads —
 *  `Array.isArray(o.painLevels)` is false for a record that never had a
 *  `painLevels` field at all, so a v1 record fails whole. v2 (Task 5
 *  through the pre-Amendment 2026-08-04 round) had `capMinutes: number |
 *  null` where `durations` now lives — `Array.isArray(o.durations)` is
 *  false for that record too (it has no `durations` field at all), so a
 *  v2 record ALSO fails whole and falls back to `null`, never a v3 object
 *  half-populated from v2 data (unlike libraryFilters.ts's v1/v2 pair,
 *  every OTHER field here kept its name across both shape changes, so one
 *  field's rename is what has to catch each).
 *
 *  v4 (Round 2, 2026-08-04): `lastDone`/`source` get a DIFFERENT, more
 *  lenient discipline than every field above — a MISSING key for either is
 *  valid (defaults to `null`, "off") rather than failing the record whole.
 *  This is deliberate, not an inconsistency: every prior shape change
 *  (v1->v2's pain field, v2->v3's TIME field) was a RENAME of a concept the
 *  record already had an opinion about, where a stale value sitting under
 *  the OLD name must never half-apply under the new one — hence "missing
 *  the new key -> reject whole." `lastDone`/`source` are GENUINELY NEW
 *  concepts a v3 record never had any opinion on at all, so their absence
 *  isn't corruption to reject — it's exactly what "the record upgrades in
 *  place" means, preserving a rower's same-day difficulty/duration/pain
 *  filters across the deploy instead of discarding the whole record over
 *  two keys it correctly never had. A PRESENT-but-wrong-shaped value (an
 *  unknown string, a stray number, a boolean) still fails strict, same as
 *  every other field — leniency covers absence only, never garbage. */
function parseOverrides(raw: string): TodayOverrides | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const o = parsed as Record<string, unknown>;
  if (typeof o.date !== "string") return null;
  if (o.planKey !== null && typeof o.planKey !== "string") return null;
  if (o.doneN !== null && typeof o.doneN !== "number") return null;
  if (o.swapType !== null && !isWorkoutType(o.swapType)) return null;
  if (!Array.isArray(o.difficulties) || !o.difficulties.every(isDifficulty)) {
    return null;
  }
  if (!Array.isArray(o.durations) || !o.durations.every(isDurationBucket)) {
    return null;
  }
  if (!Array.isArray(o.painLevels) || !o.painLevels.every(isPainLevel)) {
    return null;
  }
  // v4 (Round 2): absence is valid (upgrade-in-place, defaults to null) —
  // see this function's own doc comment. Only a PRESENT, wrong-shaped value
  // fails.
  if (
    o.lastDone !== undefined &&
    o.lastDone !== null &&
    !isLastDone(o.lastDone)
  ) {
    return null;
  }
  if (o.source !== undefined && o.source !== null && !isSource(o.source)) {
    return null;
  }
  // Bound to a local so the narrowed `DurationBucket[]` type survives into
  // the `.filter` callback below — TS's control-flow narrowing of a
  // PROPERTY access (`o.durations`) does not persist inside a nested
  // function expression the way a local variable's narrowing does.
  const durations = o.durations;
  return {
    date: o.date,
    planKey: o.planKey,
    doneN: o.doneN,
    swapType: o.swapType,
    // De-duped defensively, same rationale as libraryFilters.ts's own
    // durations field: chip toggling can never produce a duplicate, but a
    // tampered/legacy stored value could.
    difficulties: [...new Set(o.difficulties)],
    // De-duped AND canonically ordered (DURATION_BUCKETS' own order) —
    // filtering DURATION_BUCKETS down to whatever's present in the stored
    // array both de-dupes and normalises order in one step, the same
    // reasoning painLevels' own sort gets below.
    durations: DURATION_BUCKETS.filter((b) => durations.includes(b)),
    // De-duped AND sorted (unlike difficulties elsewhere, which only
    // de-dupes): the five pain cells render in a fixed 1-5 order, so
    // normalising the stored order here keeps a round-tripped value's
    // `.includes` checks and any future ordered rendering off this array
    // agreeing with what the cells themselves would produce.
    painLevels: [...new Set(o.painLevels)].sort((a, b) => a - b),
    // v4 (Round 2): a v3 record has no `lastDone` key at all
    // (`undefined`) — upgrades in place to `null` ("off") rather than
    // falling back whole, per this function's own doc comment.
    lastDone:
      o.lastDone === undefined
        ? null
        : (o.lastDone as "under21" | "over21" | null),
    source:
      o.source === undefined ? null : (o.source as "global" | "custom" | null),
  };
}

/** Returns the saved overrides only when the shape is valid AND date/
 *  planKey/doneN all match the current context exactly — mirrors
 *  todayPick.ts's `loadTodayPick` invalidation contract precisely (a new
 *  day, a switched/reset plan, or a session logged since all discard the
 *  stored value silently rather than reapplying it against a different
 *  pool). Garbage JSON or a shape that doesn't match `TodayOverrides` is
 *  treated the same as "nothing stored". */
export function loadTodayOverrides(
  today: string,
  planKey: string | null,
  doneN: number | null,
): TodayOverrides | null {
  try {
    const raw = localStorage.getItem(TODAY_OVERRIDES_KEY);
    if (raw === null) return null;
    const parsed = parseOverrides(raw);
    if (parsed === null) return null;
    if (
      parsed.date !== today ||
      parsed.planKey !== planKey ||
      parsed.doneN !== doneN
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Persists the overrides. Best-effort, same rationale as saveTodayPick /
 *  saveLibraryFilters: a lost override set is not worth surfacing to the
 *  rower — it just falls back to the preference-derived default on the
 *  next mount. */
export function saveTodayOverrides(o: TodayOverrides): void {
  try {
    localStorage.setItem(TODAY_OVERRIDES_KEY, JSON.stringify(o));
  } catch {
    // best-effort
  }
}
