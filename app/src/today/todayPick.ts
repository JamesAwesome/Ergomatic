/** localStorage key for today's shuffled pick — a client-side, daily
 *  ephemeral choice (spec decision table: "todayPick"), never sent to the
 *  server. Exported so callers (and tests) never hardcode it twice. */
export const TODAY_PICK_KEY = "ergomatic.todayPick";

/** The stored pick: keyed by calendar date and — when a plan is active —
 *  the plan's identity and position, so a new day, a switched/reset plan,
 *  or a session logged since (which advances `doneN`) all invalidate a
 *  stale pick rather than silently reapplying it against a different
 *  pool. `planKey`/`doneN` are both `null` in freestyle mode (no active
 *  plan). */
export interface TodayPick {
  date: string; // "YYYY-MM-DD", local calendar day
  planKey: string | null;
  doneN: number | null;
  workoutId: string;
}

/** Today's local calendar date as "YYYY-MM-DD". Deliberately local time,
 *  not `toISOString().slice(0, 10)` (UTC) — a rower near midnight in a
 *  negative-UTC-offset timezone would otherwise see the date roll over
 *  hours early/late relative to their own day. */
export function todayDateString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isTodayPick(value: unknown): value is TodayPick {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.date === "string" &&
    (typeof v.planKey === "string" || v.planKey === null) &&
    (typeof v.doneN === "number" || v.doneN === null) &&
    typeof v.workoutId === "string"
  );
}

/** Returns the picked workout id only when every field of the stored pick
 *  matches today's context exactly — date, plan identity, and plan
 *  position all have to agree; garbage JSON or a shape that doesn't match
 *  `TodayPick` is treated the same as "nothing stored". Any mismatch (a
 *  new day, a switched or reset plan, a session logged since) discards it
 *  silently: this is a daily convenience, not data worth preserving across
 *  a context change. */
export function loadTodayPick(
  today: string,
  planKey: string | null,
  doneN: number | null,
): string | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(TODAY_PICK_KEY);
  } catch {
    // Storage-denial spec (2026-09-03) §1 I-1/I-2 — see `session/run.ts`'s
    // `loadRun` for the full rationale; identical shape, this key. This
    // loader never clears on a mismatch either way, so I-3 needs no
    // separate call-out here.
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isTodayPick(parsed)) return null;
  if (
    parsed.date !== today ||
    parsed.planKey !== planKey ||
    parsed.doneN !== doneN
  ) {
    return null;
  }
  return parsed.workoutId;
}

/** Persists a pick. Mirrors `session/draft.ts`'s `saveDraft`: localStorage
 *  can throw (quota, private-mode Safari, disabled storage) — this never
 *  lets that escape uncaught. */
export function saveTodayPick(pick: TodayPick): boolean {
  try {
    localStorage.setItem(TODAY_PICK_KEY, JSON.stringify(pick));
    return true;
  } catch {
    return false;
  }
}
