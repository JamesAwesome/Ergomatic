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
  /** Phase SF PR1 (spec §2.2): the day's DRAWN first card — drawn by the
   *  client from `tieIds` once at mount and passed back on every render.
   *  Honoured for the recommendation when it is in the pool, reported
   *  with the standard "Least recently done" reason (it is a tie member,
   *  honestly least recently done — "YOUR PICK" is reserved for the
   *  rower's own SHUFFLE, `todayPickId`), and it NEVER beats a checkpoint
   *  pin: the draw is not the rower's act, so on a prescribed day the pin
   *  shows and SHUFFLE remains the escape. Ignored when not in the pool
   *  (the rower changed a filter or the type since). */
  drawnId?: string;
  /** Phase 8A: a plan checkpoint's own designated workout, resolved by the
   *  caller (domain/prescription.ts) and pinned here with its authored
   *  reason. Every preference filter is bypassed for it — a checkpoint is
   *  not a suggestion from a pool, and the rower must still meet it. The
   *  entry is deliberately NOT a pool member (both callers exclude the
   *  onboarding titles from `library`), so SHUFFLE escapes into the day's
   *  own type pool. */
  prescribed?: { entry: LibraryEntry; reason: string } | null;
}

export interface Suggestion {
  recommendationId: string | null;
  reason: string;
  poolIds: string[];
  fellBack: boolean; // difficulty/time/pain filters matched nothing; pool is the unfiltered type list
  /** Phase SF PR1 (spec §2.2): the least-recently-done TIE CLASS of the
   *  pool — every id sharing `poolIds[0]`'s `lastDoneDaysAgo` (null ties
   *  with null), in pool order. The client draws the day's first card
   *  from this ONCE at mount and passes it back as `drawnId`; this
   *  function itself stays deterministic (no rng in here — it runs on
   *  every render and again against the sheet draft). Describes the POOL,
   *  so on a prescribed day it names the escape pool's class, not the pin.
   *  Empty when the pool is. */
  tieIds: string[];
}

/** The domain's rng contract (spec §2.2): a function returning a uniform
 *  INTEGER in [0, RNG_RANGE). The client feeds `crypto.getRandomValues` on
 *  a `Uint32Array(1)`; tests feed a scripted sequence. `drawOne` does
 *  rejection sampling over it so no member is ever favoured by the modulo
 *  tail — with n at most a few hundred the tail is below one draw in ten
 *  million, but the loop is three lines and the claim never needs
 *  defending. Never `Math.random` (MDN: "a non-cryptographic source"),
 *  and never inside `suggest`/`suggestFreestyle`. */
export type Rng = () => number;
export const RNG_RANGE = 2 ** 32;

/** Uniform draw of one id. Null for an empty list; a singleton returns
 *  its member without consulting `rng` (so a scripted test rng is not
 *  consumed by a draw that has no choice to make). */
export function drawOne<T extends string>(
  ids: readonly T[],
  rng: Rng,
): T | null {
  const n = ids.length;
  if (n === 0) return null;
  if (n === 1) return ids[0];
  // Largest multiple of n that fits in the range; any draw at or above it
  // would wrap unevenly, so it is redrawn.
  const limit = RNG_RANGE - (RNG_RANGE % n);
  let x = rng();
  while (x >= limit) x = rng();
  return ids[x % n];
}

/** SHUFFLE's next card (spec I-3): a uniform draw from the pool minus
 *  everything already shown today minus the card on screen; when that set
 *  is empty the shown set resets and the draw is from the pool minus the
 *  card on screen. Returns the new id and the new shown list (appended,
 *  or restarted at `[id]` after a reset). Pure over the arrays it is
 *  handed (spec §2.4 — a paged pool is just a smaller pool; a shown id
 *  outside the pool is simply not a candidate; a `currentId` outside the
 *  pool — a prescribed pin — excludes nothing). Null only for an empty
 *  pool; a pool of exactly the current card returns it unchanged. */
export function nextShuffle(
  poolIds: readonly string[],
  shownIds: readonly string[],
  currentId: string | null,
  rng: Rng,
): { id: string; shownIds: string[] } | null {
  if (poolIds.length === 0) return null;
  const shown = new Set(shownIds);
  const fresh = poolIds.filter((id) => !shown.has(id) && id !== currentId);
  if (fresh.length > 0) {
    const id = drawOne(fresh, rng)!;
    return { id, shownIds: [...shownIds, id] };
  }
  const rest = poolIds.filter((id) => id !== currentId);
  if (rest.length === 0) {
    // The pool is exactly the card on screen: nothing to move to.
    return { id: currentId!, shownIds: [...shownIds] };
  }
  const id = drawOne(rest, rng)!;
  return { id, shownIds: [id] };
}

/** The tie class of a least-recently-done-sorted pool: the leading run of
 *  entries sharing `sorted[0].lastDoneDaysAgo` (null with null). */
function tieClass(sorted: readonly LibraryEntry[]): string[] {
  if (sorted.length === 0) return [];
  const head = sorted[0].lastDoneDaysAgo;
  const ids: string[] = [];
  for (const e of sorted) {
    if (e.lastDoneDaysAgo !== head) break;
    ids.push(e.id);
  }
  return ids;
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
  const { todayCode, library, prefs, todayPickId, drawnId, prescribed } = input;

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

  const pickOverride = todayPickId
    ? sorted.find((e) => e.id === todayPickId)
    : undefined;

  // The prescribed branch sits ABOVE the empty-pool early return, ON
  // PURPOSE (spec §3.3, binding): that return fires from the type-matched
  // pool alone, and an account whose library holds none of the day's own
  // type must still get its checkpoint — the one day it matters most.
  // Only a LIVE pick (one that resolves in today's pool) beats it: SHUFFLE
  // is the escape, and a stale id yields back to the checkpoint.
  // `fellBack` and `poolIds` keep their ordinary pool meaning — they
  // describe the pool, which the escape hatch still uses.
  const tieIds = tieClass(sorted);

  if (prescribed && !pickOverride) {
    return {
      recommendationId: prescribed.entry.id,
      reason: prescribed.reason,
      poolIds,
      fellBack,
      tieIds,
    };
  }

  if (sorted.length === 0) {
    return {
      recommendationId: null,
      reason: `No ${todayCode} sessions in your library.`,
      poolIds: [],
      fellBack: false,
      tieIds: [],
    };
  }

  const drawn = drawnId ? sorted.find((e) => e.id === drawnId) : undefined;
  const picked = pickOverride ?? drawn ?? sorted[0];
  const reason = buildReason(picked, pickOverride, fellBack, prefs);

  return { recommendationId: picked.id, reason, poolIds, fellBack, tieIds };
}

/** Freestyle mode: no plan is active, so the pool is the whole library
 *  (no type filter) rather than a single plan-code type. Ordering and
 *  fellBack semantics otherwise mirror `suggest` exactly (see
 *  `byLeastRecentlyDone`). */
export function suggestFreestyle(
  library: LibraryEntry[],
  prefs: SuggestPrefs,
  todayPickId?: string,
  drawnId?: string,
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
      tieIds: [],
    };
  }

  const pickOverride = todayPickId
    ? sorted.find((e) => e.id === todayPickId)
    : undefined;
  const drawn = drawnId ? sorted.find((e) => e.id === drawnId) : undefined;
  const picked = pickOverride ?? drawn ?? sorted[0];
  const tieIds = tieClass(sorted);
  const reason = buildReason(picked, pickOverride, fellBack, prefs);

  return { recommendationId: picked.id, reason, poolIds, fellBack, tieIds };
}
