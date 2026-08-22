import type { Difficulty, WorkoutType } from "./types.js";
import { bucketFor, type DurationBucket } from "./duration.js";
import { isRecent } from "./recency.js";

export interface LibraryEntry {
  id: string;
  type: WorkoutType;
  difficulty: Difficulty;
  pain: number;
  estMinutes: number;
  lastDoneDaysAgo: number | null;
  // Round 2 (2026-08-04): mirrors the Library's own `LibraryWorkout.isGlobal`
  // — Today's `toLibraryEntry` (src/today/Today.tsx) passes `w.isGlobal`
  // straight through, and the server's `/api/today` route
  // (server/routes/data.ts) builds its own `LibraryEntry[]` the same way, so
  // this is a required field on every caller, not optional.
  isGlobal: boolean;
}

export interface SuggestPrefs {
  difficulties: Difficulty[];
  // A union, not a threshold — mirrors the Library's own duration-bucket
  // filter (`src/library/filters.ts`'s `Filters.durations`, same
  // `DurationBucket`/`bucketFor` from `domain/duration.ts`): when non-empty
  // (and known — see `durationsUnknown` below), only entries whose
  // `estMinutes` bucket is IN this set survive. Empty/undefined means
  // "off" — every duration passes, identical to Library's own semantics.
  // Amendment (2026-08-04 PR #50 round): replaces the old
  // `timeCapMinutes: number | null` single-value cap — Today's TIME group
  // is now the Library's own four buckets, multi-select, not a cap.
  durations?: DurationBucket[];
  // Set when the caller could not compute a real `estMinutes` for any
  // library entry (no baselines yet — the standing convention is every
  // entry gets `estMinutes: 0` in that case). This flag GATES THE FILTER
  // ITSELF, not merely the reason text: `passesDurationFilter` (below)
  // skips the bucket-membership check entirely whenever this is true,
  // regardless of which bucket the 0 placeholder would resolve to.
  // `bucketFor(0)` is always `"<30"` — without this flag, a `durations`
  // union that happens to include `"<30"` would wrongly let every
  // unknown-duration entry through (a coincidence, not a real match), and
  // a union that EXCLUDES `"<30"` (e.g. `["45-60"]`) would wrongly reject
  // every one of them (treating "unknowable" as "known short"). Under the
  // old single-value cap this replaced, the 0 placeholder alone was
  // sufficient to keep the filter harmless (`0 <= any positive cap`
  // unconditionally); a bucket UNION has no such universal member, so this
  // flag — not the placeholder value — is what actually keeps the filter
  // harmless now. It also still keeps the REASON text honest: without it,
  // the standard/fellback reasons below would claim a duration was
  // actually checked ("difficulty/time filters") when every duration fed
  // in was a placeholder. Set true and both reasons drop any mention of
  // time instead of asserting something never verified. An empty/unset
  // `durations` takes the same no-claim branch for the REASON text, but —
  // unlike this flag — doesn't need to gate the FILTER specially: an empty
  // union already means "off" on its own, independent of what any single
  // entry's estMinutes happens to be.
  durationsUnknown?: boolean;
  // A union, not a threshold — mirrors Library's own `Filters.painLevels`
  // (src/library/filters.ts): when non-empty, only entries whose `pain` is
  // IN this set survive. Empty/undefined means "off" — every pain level
  // passes, and (same honesty rule as the rest of this interface) the
  // reason text below never claims a pain filter was checked when it
  // wasn't.
  painLevels?: number[];
  // A mutually-exclusive pair, not a threshold — mirrors Library's own
  // `Filters.lastDone` (src/library/filters.ts): `"under21"` keeps only
  // entries `isRecent` (domain/recency.ts) calls recent, `"over21"` keeps
  // only the rest (never-done, `lastDoneDaysAgo === null`, counts as
  // `"over21"` — the Library's pinned rule, shared boundary constant).
  // null/undefined means "off" — every entry passes, same honesty rule as
  // every other field here (the reason text below never claims this was
  // checked when it wasn't). Optional (unlike `difficulties`) because the
  // server's own `/api/today` route (server/routes/data.ts) builds
  // `SuggestPrefs` with no LAST DONE/SOURCE dimension at all — server
  // suggestions have no client-side overrides to derive one from — and this
  // keeps that call site compiling unchanged rather than forcing it to
  // thread a `null` it has no opinion on through every prefs literal.
  lastDone?: "under21" | "over21" | null;
  // A mutually-exclusive pair, not a threshold — mirrors Library's own
  // `Filters.source` (src/library/filters.ts): `"custom"` keeps only
  // non-global (`isGlobal: false`) entries, `"global"` keeps only global
  // ones. null/undefined means "off". Optional for the identical reason
  // `lastDone` above is: the server's `/api/today` route never sets it.
  source?: "global" | "custom" | null;
}

export interface SuggestInput {
  todayCode: WorkoutType;
  library: LibraryEntry[];
  prefs: SuggestPrefs;
  todayPickId?: string;
}

export interface Suggestion {
  recommendationId: string | null;
  reason: string;
  poolIds: string[];
  fellBack: boolean; // difficulty/time/pain filters matched nothing; pool is the unfiltered type list
}

/** Never-done (null) sorts first; otherwise most days-ago (least recently
 *  done) first. */
function byLeastRecentlyDone(a: LibraryEntry, b: LibraryEntry): number {
  if (a.lastDoneDaysAgo === null || b.lastDoneDaysAgo === null) {
    return (
      (a.lastDoneDaysAgo === null ? 0 : 1) -
      (b.lastDoneDaysAgo === null ? 0 : 1)
    );
  }
  return b.lastDoneDaysAgo - a.lastDoneDaysAgo;
}

function recencyPhrase(days: number | null): string {
  return days === null ? "never done" : `${days} days ago`;
}

/** Shared by `suggest`/`suggestFreestyle` — the two were textually
 *  identical here before `durationsUnknown` existed, and duplicating the
 *  new branch a second time was the exact way this class of "the reason
 *  says something no caller checked" bug would recur.
 *
 *  Amendment (2026-08-04 PR #50 round): the standard (non-fellback) reason
 *  no longer has a cap clause to append at all — "within your N min cap"
 *  named a single threshold value that a bucket UNION has no equivalent
 *  for (which bucket would it even name?). The plain "Least recently done
 *  (…)." is now the standard reason unconditionally; only the FELLBACK
 *  reason still names which dimensions were checked, `time` among them
 *  when the duration union was actually active. */
function buildReason(
  picked: LibraryEntry,
  pickOverride: LibraryEntry | undefined,
  fellBack: boolean,
  prefs: SuggestPrefs,
): string {
  const timeChecked = !!prefs.durations?.length && !prefs.durationsUnknown;
  if (pickOverride) {
    return `YOUR PICK: last done ${recencyPhrase(picked.lastDoneDaysAgo)}.`;
  }
  if (fellBack) {
    const parts = ["difficulty"];
    if (timeChecked) parts.push("time");
    if (prefs.painLevels?.length) parts.push("pain");
    // Round 2 (2026-08-04): recency/source append last, mirroring the
    // sheet's own group order (DIFFICULTY, TIME, PAIN, LAST DONE, SOURCE) —
    // truthy checks (not `!== undefined`) since both fields are
    // null-when-off, same honesty rule as painLevels above.
    if (prefs.lastDone) parts.push("recency");
    if (prefs.source) parts.push("source");
    return `Nothing fit your ${parts.join("/")} filters. Closest match, last done ${recencyPhrase(picked.lastDoneDaysAgo)}.`;
  }
  return `Least recently done (${recencyPhrase(picked.lastDoneDaysAgo)}).`;
}

/** The duration-union clause shared by `suggest`/`suggestFreestyle`'s own
 *  filter predicates: skipped (never excludes) whenever `durations` is
 *  empty/unset or `durationsUnknown` is set, otherwise an entry survives
 *  only when its own `bucketFor(estMinutes)` is IN the union — mirrors the
 *  Library's own `applyFilters` (`src/library/filters.ts`) exactly. */
function passesDurationFilter(e: LibraryEntry, prefs: SuggestPrefs): boolean {
  if (!prefs.durations?.length || prefs.durationsUnknown) return true;
  return prefs.durations.includes(bucketFor(e.estMinutes));
}

/** The LAST DONE clause shared by `suggest`/`suggestFreestyle`'s own filter
 *  predicates — mirrors the Library's own `applyFilters` exactly
 *  (`src/library/filters.ts`): `"under21"` requires `isRecent`,
 *  `"over21"` requires the opposite (never-done included), null/undefined
 *  never excludes. */
function passesLastDoneFilter(e: LibraryEntry, prefs: SuggestPrefs): boolean {
  if (prefs.lastDone === "under21") return isRecent(e.lastDoneDaysAgo);
  if (prefs.lastDone === "over21") return !isRecent(e.lastDoneDaysAgo);
  return true;
}

/** The SOURCE clause shared by `suggest`/`suggestFreestyle`'s own filter
 *  predicates — mirrors the Library's own `applyFilters` exactly
 *  (`src/library/filters.ts`): `"custom"` requires `!isGlobal`, `"global"`
 *  requires `isGlobal`, null/undefined never excludes. */
function passesSourceFilter(e: LibraryEntry, prefs: SuggestPrefs): boolean {
  if (prefs.source === "custom") return !e.isGlobal;
  if (prefs.source === "global") return e.isGlobal;
  return true;
}

export function suggest(input: SuggestInput): Suggestion {
  const { todayCode, library, prefs, todayPickId } = input;

  const typeMatched = library.filter((e) => e.type === todayCode);
  const filtered = typeMatched.filter(
    (e) =>
      prefs.difficulties.includes(e.difficulty) &&
      passesDurationFilter(e, prefs) &&
      (!prefs.painLevels?.length || prefs.painLevels.includes(e.pain)) &&
      passesLastDoneFilter(e, prefs) &&
      passesSourceFilter(e, prefs),
  );

  const fellBack = typeMatched.length > 0 && filtered.length === 0;
  const pool = fellBack ? typeMatched : filtered;
  const sorted = [...pool].sort(byLeastRecentlyDone);
  const poolIds = sorted.map((e) => e.id);

  if (sorted.length === 0) {
    return {
      recommendationId: null,
      reason: `No ${todayCode} sessions in your library.`,
      poolIds: [],
      fellBack: false,
    };
  }

  const pickOverride = todayPickId
    ? sorted.find((e) => e.id === todayPickId)
    : undefined;
  const picked = pickOverride ?? sorted[0];
  const reason = buildReason(picked, pickOverride, fellBack, prefs);

  return { recommendationId: picked.id, reason, poolIds, fellBack };
}

/** Freestyle mode: no plan is active, so the pool is the whole library
 *  (no type filter) rather than a single plan-code type. Ordering and
 *  fellBack semantics otherwise mirror `suggest` exactly (see
 *  `byLeastRecentlyDone`). */
export function suggestFreestyle(
  library: LibraryEntry[],
  prefs: SuggestPrefs,
  todayPickId?: string,
): Suggestion {
  const filtered = library.filter(
    (e) =>
      prefs.difficulties.includes(e.difficulty) &&
      passesDurationFilter(e, prefs) &&
      (!prefs.painLevels?.length || prefs.painLevels.includes(e.pain)) &&
      passesLastDoneFilter(e, prefs) &&
      passesSourceFilter(e, prefs),
  );

  const fellBack = library.length > 0 && filtered.length === 0;
  const pool = fellBack ? library : filtered;
  const sorted = [...pool].sort(byLeastRecentlyDone);
  const poolIds = sorted.map((e) => e.id);

  if (sorted.length === 0) {
    return {
      recommendationId: null,
      reason: "Your library is empty. Add a workout to get suggestions.",
      poolIds: [],
      fellBack: false,
    };
  }

  const pickOverride = todayPickId
    ? sorted.find((e) => e.id === todayPickId)
    : undefined;
  const picked = pickOverride ?? sorted[0];
  const reason = buildReason(picked, pickOverride, fellBack, prefs);

  return { recommendationId: picked.id, reason, poolIds, fellBack };
}
