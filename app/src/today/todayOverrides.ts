import { isWorkoutType, type WorkoutType } from "../../domain/types.js";

/** localStorage key for Today's per-day type swap — a client-side, daily
 *  choice layered on the plan's own call, never written back to the
 *  server. Same storage (localStorage, not sessionStorage) and the same
 *  `{date, planKey, doneN}` invalidation contract as todayPick.ts's
 *  `TodayPick` — both are "today's ephemeral choice", not data worth
 *  preserving across a context change.
 *
 *  Phase SF PR1 (spec §2.3): the five FILTER groups that used to ride this
 *  record (v3/v4: difficulties/durations/painLevels/lastDone/source) moved
 *  to `todayFilters.ts`, which is UNDATED and keyed per type — filters are
 *  "set and forget" now, and a record that dies at midnight cannot carry
 *  them. Only the swap stays here. A pre-PR1 record from the SAME day
 *  still parses (this parser reads named fields and ignores extras), and
 *  its `swapType` survives, which is the right outcome; the date/plan key
 *  is the safety net, not the parser. */
export const TODAY_OVERRIDES_KEY = "ergomatic.todayOverrides";

/** The stored record: keyed by calendar date and — when a plan is
 *  active — the plan's identity and position, exactly like `TodayPick`
 *  (see that interface's own doc comment for why all three fields have to
 *  match before a stored value is trusted). `swapType: null` means "no
 *  swap" (with a plan: suggest against the plan's own call; in freestyle:
 *  no chip lit — ANY TYPE, or not yet rolled today, which
 *  `todayFilters.rollSuppressed` tells apart). */
export interface TodayOverrides {
  date: string; // "YYYY-MM-DD" local (todayPick's format)
  planKey: string | null;
  doneN: number | null;
  swapType: WorkoutType | null; // null = no swap
}

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
  return {
    date: o.date,
    planKey: o.planKey,
    doneN: o.doneN,
    swapType: o.swapType,
  };
}

/** Returns the saved record only when the shape is valid AND date/
 *  planKey/doneN all match the current context exactly — mirrors
 *  todayPick.ts's `loadTodayPick` invalidation contract precisely (a new
 *  day, a switched/reset plan, or a session logged since all discard the
 *  stored value silently rather than reapplying it against a different
 *  pool). Garbage JSON or a shape that doesn't match `TodayOverrides` is
 *  treated the same as "nothing stored". The storage getter itself can
 *  throw (storage-denial research, 2026-09-03); that reads as nothing
 *  stored too. */
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

/** Persists the record. Returns whether the write landed (RF25): the
 *  daily type roll's initializer in Today.tsx reads this and keeps a
 *  module-scope fallback when it is false, so a denied write never turns
 *  into a re-roll on the next mount. */
export function saveTodayOverrides(o: TodayOverrides): boolean {
  try {
    localStorage.setItem(TODAY_OVERRIDES_KEY, JSON.stringify(o));
    return true;
  } catch {
    return false;
  }
}
