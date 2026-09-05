export type WorkoutType = "AN" | "O2" | "AT" | "TR";
export const WORKOUT_TYPES: readonly WorkoutType[] = ["AN", "O2", "AT", "TR"];
/** Narrows an untrusted string to a `WorkoutType`. Needed wherever a type
 *  arrives as a bare string rather than through the enum: a stored
 *  localStorage filter, and `session_logs.workout_type`, which is plain
 *  `text` (deliberately NOT the workouts table's pgEnum) and so can hold
 *  anything an authenticated client posted. Lives here rather than beside
 *  any one caller because there were already two byte-identical private
 *  copies (`todayOverrides.ts`, `libraryFilters.ts`) and the Plan screen's
 *  swapped-row check would have been a third — the shape recurring
 *  failure 5 is about. */
export function isWorkoutType(value: unknown): value is WorkoutType {
  return (
    typeof value === "string" &&
    (WORKOUT_TYPES as readonly string[]).includes(value)
  );
}
/** A FREE ROW: a Just Row, where no workout was chosen and so no intensity
 *  was prescribed (Phase JR, spec rev 4). One predicate, two rules — the
 *  server's plan refusal and its empty-`steps` allowance both call this, so
 *  they cannot drift apart. James's sign-off, 2026-09-01.
 *
 *  **BOTH halves are load-bearing; `workoutId === null` alone is WRONG.**
 *  `LogSession.tsx:780-790` retries a save with `workoutId: null` when the
 *  server 400s specifically on `workoutId` — the workout was deleted
 *  between that door's mount and the Save click. That is a legitimate
 *  plan-advancing session posting a null workout id, and an id-only
 *  predicate would refuse to advance its plan silently: a 201, and
 *  `SESSION n OF 84` does not move. It stays distinguishable because
 *  `resolveWorkoutType` still resolves a type through its `?? "O2"` last
 *  resort (`LogSession.tsx:475`) — which is why spec rev 4 CUT retiring
 *  that fallback from PR 1 (antagonist F3). Retiring it would collapse
 *  these two cases into one and reintroduce the same silent stall.
 *
 *  Lives beside `isWorkoutType` for the reason that one gives: a predicate
 *  with more than one caller belongs in one place, before the copies
 *  drift. */
export function isFreeRow(
  workoutId: string | null,
  workoutType: string | null,
): boolean {
  return workoutId === null && workoutType === null;
}
export type PaceBase = "2k" | "6k";
export type Effort = "max" | "min";
export interface SplitRef {
  base: PaceBase;
  off: number; // off: seconds per 500m, negative = faster
}
// "30 seconds max" / "20 minutes easy" — a real effort prescription, not a
// stand-in offset. Key-presence union: every stored {base, off} ref is
// already a valid SplitRef, so nothing migrates (Phase 5G spec, "Decisions").
export interface EffortRef {
  effort: Effort;
}
export type PaceRef = SplitRef | EffortRef;
export type WorkDuration =
  | { kind: "time"; minutes: number } // 0.5 steps allowed, > 0
  | { kind: "distance"; meters: number }; // integer, 100..42195
// "wu" left this union 2026-08-09 (the warmup-setting spec): warm-ups are a
// per-user SETTING now, prepended at buildRun (engine.ts) as an EnginePhase
// the preference alone produces — never an authored step. That phase union
// keeps its own "warmup" member (expand.ts's Phase/EnginePhase, unrelated to
// this one) untouched; validateSteps below is the permanent runtime guard
// for stored/imported data that can still present the retired shape.
export type Step =
  | { k: "reps"; count: number } // 1..12, at most one per workout
  | {
      k: "w";
      duration: WorkDuration;
      ref: PaceRef;
      spm?: number;
      restMinutes?: number;
    }
  | { k: "r"; minutes: number }
  | { k: "test"; label: string };
export interface Baselines {
  k2Seconds: number;
  k6Seconds: number;
}
export interface WorkoutInput {
  title: string;
  type: WorkoutType;
  pain: number;
  steps: Step[];
}
/** Which DOOR a session log came through — `session_logs.source`, NOT NULL
 *  (Just Row unconnected spec, 2026-09-02, §Mechanism stored shape (c)).
 *  `pm5` = the connected door, the monitor's own numbers; `timer` = the
 *  phone's clock (a `SessionRun` closed on the Timer, or the time-only Just
 *  Row); `manual` = typed in after the fact (`Log it after`); `no-reading`
 *  = a connected arrival the app holds no reading for (door PR A, spec
 *  `docs/superpowers/specs/2026-09-02-door-partial-design.md` §2.1 — reads
 *  `NO MONITOR READING`, the live screen's own word). Stored as a fact at
 *  write time, never inferred by a reader: the old read-side guess
 *  (`deviceName`, else any stopwatch step, else by hand) was already wrong
 *  about a connected session saved through the manual door. Migration 0020
 *  backfills every pre-existing row with that same guess, once, so nothing
 *  a rower already sees changes word; `no-reading` gets NO backfill (door
 *  spec §2.4 — old `manual` rows that were really no-reading arrivals are
 *  indistinguishable and stay `LOGGED BY HAND` permanently).
 *
 *  ELEVEN mirrors of this value set move together (door spec §2.4 names
 *  them; no single grep finds the set). Compile-enforced: `logSource.ts`'s
 *  and `storedSummary.ts`'s `switch`es are total over `LogSource` with no
 *  `default`, so a fifth member errors on its own (no `assertNever`
 *  mechanism needed) — which is what forces `summaryModel.ts`'s live word
 *  into `storedSummary.ts`'s new arm. NOT compile-enforced, and the
 *  dangerous one by name: **`LOG_SOURCES` below is `readonly LogSource[]`,
 *  not a tuple** — a short array compiles clean, and `routes/data.ts`
 *  validates the wire against it, so omitting a member there 400s every
 *  save of it with nothing red (the POST seam test is the only thing that
 *  makes that omission red). The rest — `schema.ts`'s `logSourceEnum`, the
 *  membership 400 message literal (`routes/data.ts`), the migration, and
 *  the two e2e helper `source?` unions (`e2e/screenshots.spec.ts`,
 *  `e2e/log.spec.ts`, the latter failing only where a test SEEDS the new
 *  member, never on omission) — are likewise not compiler-checked. */
export type LogSource = "pm5" | "timer" | "manual" | "no-reading";
export const LOG_SOURCES: readonly LogSource[] = [
  "pm5",
  "timer",
  "manual",
  "no-reading",
];
