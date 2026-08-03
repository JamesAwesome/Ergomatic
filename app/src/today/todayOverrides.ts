import type { Difficulty, WorkoutType } from "../../domain/types.js";

/** localStorage key for Today's client-side filter/swap overrides — visible,
 *  rower-editable narrowing of what SUGGESTED FOR TODAY considers, layered
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
 *  swap" (suggest against the plan's own prescribed type); `capMinutes:
 *  null` means NO CAP, not "unset" — every field here always holds a real
 *  value, there is no separate "nothing chosen yet" state. */
export interface TodayOverrides {
  date: string; // "YYYY-MM-DD" local (todayPick's format)
  planKey: string | null;
  doneN: number | null;
  swapType: WorkoutType | null; // null = no swap
  difficulties: Difficulty[];
  capMinutes: number | null; // null = NO CAP
  painMax3: boolean;
}

const TYPES: readonly WorkoutType[] = ["AN", "O2", "AT", "TR"];
const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
// The Today filter row's only five cap values (`≤30′ ≤45′ ≤60′ ≤90′ NO
// CAP`) — shared between `parseOverrides`' validation below and `snapCap`
// further down, so the two can never drift apart into "a value a stored
// record is allowed to hold" vs. "a value a chip can actually represent".
const CAP_STEPS = [30, 45, 60, 90] as const;

function isWorkoutType(v: unknown): v is WorkoutType {
  return typeof v === "string" && (TYPES as readonly string[]).includes(v);
}

function isDifficulty(v: unknown): v is Difficulty {
  return (
    typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v)
  );
}

function isCapMinutes(v: unknown): v is number | null {
  return v === null || (CAP_STEPS as readonly number[]).includes(v as number);
}

/** Strict shape check, same discipline as libraryFilters.ts's parseFilters
 *  — a stored value that predates a future TodayOverrides change (or was
 *  hand-edited) must come back `null`, never an object with a hole in it:
 *  every field here is trusted as-is by TodayView/suggest. */
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
  if (!isCapMinutes(o.capMinutes)) return null;
  if (typeof o.painMax3 !== "boolean") return null;
  return {
    date: o.date,
    planKey: o.planKey,
    doneN: o.doneN,
    swapType: o.swapType,
    // De-duped defensively, same rationale as libraryFilters.ts's own
    // durations field: chip toggling can never produce a duplicate, but a
    // tampered/legacy stored value could.
    difficulties: [...new Set(o.difficulties)],
    capMinutes: o.capMinutes,
    painMax3: o.painMax3,
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

/** Maps a raw preference cap to the nearest chip value: the smallest of
 *  30/45/60/90 that is >= pref, else null (NO CAP) once pref exceeds every
 *  chip. There is no chip for every possible preference value, so this is a
 *  deliberate approximation — it always rounds UP to a chip that still
 *  respects (never undercuts) the rower's stated cap. The server default
 *  (60) lands exactly on a chip, so the common case is exact, not
 *  approximated. */
export function snapCap(pref: number): number | null {
  return CAP_STEPS.find((step) => step >= pref) ?? null;
}
