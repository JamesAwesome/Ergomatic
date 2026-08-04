import type { Difficulty, WorkoutType } from "./types.js";
import type { PlanCode } from "./plans.js";

export interface LibraryEntry {
  id: string;
  type: WorkoutType;
  difficulty: Difficulty;
  pain: number;
  estMinutes: number;
  lastDoneDaysAgo: number | null;
}

export interface SuggestPrefs {
  difficulties: Difficulty[];
  // `null` means capless — no cap was set, so the cap clause is skipped
  // entirely rather than compared against a sentinel value.
  timeCapMinutes: number | null;
  // Set when the caller could not compute a real `estMinutes` for any
  // library entry (no baselines yet — the standing convention is every
  // entry gets `estMinutes: 0` in that case, purely so the time-cap filter
  // below never rejects an entry over an unknowable duration). That
  // workaround keeps the FILTER honest but not the REASON text: without
  // this flag, the standard/fellback reasons below claim a cap was
  // actually checked ("within your N min cap", "difficulty/time filters")
  // when every duration was a placeholder. Set true and both reasons drop
  // any mention of time/cap instead of asserting something never verified.
  // `timeCapMinutes: null` takes the same no-cap-claim branch for the same
  // reason: nothing was actually checked either way.
  durationsUnknown?: boolean;
  // A union, not a threshold — mirrors Library's own `Filters.painLevels`
  // (src/library/filters.ts): when non-empty, only entries whose `pain` is
  // IN this set survive. Empty/undefined means "off" — every pain level
  // passes, and (same honesty rule as the rest of this interface) the
  // reason text below never claims a pain filter was checked when it
  // wasn't.
  painLevels?: number[];
}

export interface SuggestInput {
  todayCode: PlanCode;
  library: LibraryEntry[];
  prefs: SuggestPrefs;
  todayPickId?: string;
}

export interface Suggestion {
  recommendationId: string | null;
  reason: string;
  poolIds: string[];
  fellBack: boolean; // difficulty/cap/pain filters matched nothing; pool is the unfiltered type list
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
 *  says something no caller checked" bug would recur. */
function buildReason(
  picked: LibraryEntry,
  pickOverride: LibraryEntry | undefined,
  fellBack: boolean,
  prefs: SuggestPrefs,
): string {
  const capChecked = prefs.timeCapMinutes !== null && !prefs.durationsUnknown;
  if (pickOverride) {
    return `YOUR PICK — last done ${recencyPhrase(picked.lastDoneDaysAgo)}.`;
  }
  if (fellBack) {
    const parts = ["difficulty"];
    if (capChecked) parts.push("time");
    if (prefs.painLevels?.length) parts.push("pain");
    return `Nothing fit your ${parts.join("/")} filters — closest match, last done ${recencyPhrase(picked.lastDoneDaysAgo)}.`;
  }
  if (!capChecked) {
    return `Least recently done (${recencyPhrase(picked.lastDoneDaysAgo)}).`;
  }
  return `Least recently done (${recencyPhrase(picked.lastDoneDaysAgo)}) within your ${prefs.timeCapMinutes} min cap.`;
}

export function suggest(input: SuggestInput): Suggestion {
  const { todayCode, library, prefs, todayPickId } = input;
  const matchType: WorkoutType = todayCode === "TEST" ? "TR" : todayCode;

  const typeMatched = library.filter((e) => e.type === matchType);
  const filtered = typeMatched.filter(
    (e) =>
      prefs.difficulties.includes(e.difficulty) &&
      (prefs.timeCapMinutes === null || e.estMinutes <= prefs.timeCapMinutes) &&
      (!prefs.painLevels?.length || prefs.painLevels.includes(e.pain)),
  );

  const fellBack = typeMatched.length > 0 && filtered.length === 0;
  const pool = fellBack ? typeMatched : filtered;
  const sorted = [...pool].sort(byLeastRecentlyDone);
  const poolIds = sorted.map((e) => e.id);

  if (sorted.length === 0) {
    return {
      recommendationId: null,
      reason: `No ${matchType} sessions in your library.`,
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
      (prefs.timeCapMinutes === null || e.estMinutes <= prefs.timeCapMinutes) &&
      (!prefs.painLevels?.length || prefs.painLevels.includes(e.pain)),
  );

  const fellBack = library.length > 0 && filtered.length === 0;
  const pool = fellBack ? library : filtered;
  const sorted = [...pool].sort(byLeastRecentlyDone);
  const poolIds = sorted.map((e) => e.id);

  if (sorted.length === 0) {
    return {
      recommendationId: null,
      reason: "Your library is empty — add a workout to get suggestions.",
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
