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
  /** Phase SF PR1 (spec I-3): every id SHUFFLE has shown today, in order,
   *  so the next draw can avoid repeats until the pool is exhausted. The
   *  day's first card is the first entry. Bounded by the pool size (300
   *  UUIDs serialise to 11,810 bytes, measured 2026-09-04). A pre-PR1
   *  same-day record has no such field and fails whole — it is a daily
   *  convenience, and losing one day's pick on deploy day is the stated
   *  cost. */
  shownIds: string[];
  /** false for the day's drawn first card (reported "Least recently
   *  done", never beats a checkpoint pin), true once the rower has tapped
   *  SHUFFLE ("YOUR PICK", beats the pin). `nextShuffle`'s reset restarts
   *  `shownIds` at one id, so length alone cannot tell the two apart. */
  shuffled: boolean;
  /** James (2026-09-04, "logged only"): the number of sessions LOGGED today
   *  when this record was written, in freestyle; always 0 with a plan (a
   *  plan-mode log bumps `doneN`, which already re-keys). A logged session
   *  makes the next mount's context mismatch, so the day re-rolls its type
   *  and re-draws its card as if it were a new day. Counted from the
   *  recent-logs fetch Today already makes (last 10), never a new write. */
  session: number;
}

/** What `loadTodayPick` hands back: the id on screen, the shown list, and
 *  whether the rower shuffled to it. */
export type StoredPick = Pick<TodayPick, "workoutId" | "shownIds" | "shuffled">;

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
    typeof v.workoutId === "string" &&
    Array.isArray(v.shownIds) &&
    v.shownIds.every((id) => typeof id === "string") &&
    typeof v.shuffled === "boolean" &&
    Number.isInteger(v.session) &&
    (v.session as number) >= 0
  );
}

/** Returns the stored pick (id + shown list) only when every field of it
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
  session: number,
): StoredPick | null {
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
    parsed.doneN !== doneN ||
    parsed.session !== session
  ) {
    return null;
  }
  return {
    workoutId: parsed.workoutId,
    shownIds: parsed.shownIds,
    shuffled: parsed.shuffled,
  };
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
