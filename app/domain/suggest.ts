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

export interface SuggestInput {
  todayCode: PlanCode;
  library: LibraryEntry[];
  prefs: { difficulties: Difficulty[]; timeCapMinutes: number };
  todayPickId?: string;
}

export interface Suggestion {
  recommendationId: string | null;
  reason: string;
  poolIds: string[];
  fellBack: boolean; // prefs/cap filters matched nothing; pool is the unfiltered type list
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

export function suggest(input: SuggestInput): Suggestion {
  const { todayCode, library, prefs, todayPickId } = input;
  const matchType: WorkoutType = todayCode === "TEST" ? "TR" : todayCode;

  const typeMatched = library.filter((e) => e.type === matchType);
  const filtered = typeMatched.filter(
    (e) =>
      prefs.difficulties.includes(e.difficulty) &&
      e.estMinutes <= prefs.timeCapMinutes,
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

  let reason: string;
  if (pickOverride) {
    reason = `YOUR PICK — last done ${recencyPhrase(picked.lastDoneDaysAgo)}.`;
  } else if (fellBack) {
    reason = `Nothing fit your difficulty/time filters — closest match, last done ${recencyPhrase(picked.lastDoneDaysAgo)}.`;
  } else {
    reason = `Least recently done (${recencyPhrase(picked.lastDoneDaysAgo)}) within your ${prefs.timeCapMinutes} min cap.`;
  }

  return { recommendationId: picked.id, reason, poolIds, fellBack };
}
