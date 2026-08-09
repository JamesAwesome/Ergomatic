import type { EnginePhase } from "./engine";

/** localStorage key for the session run record — 6B's timer state. A
 *  SEPARATE key from `DRAFT_KEY` (spec: "Run state" decision): the draft
 *  stays the confirm contract, the run is the engine's, and Today's
 *  stale-draft discard must be able to tell "never started" from "finished
 *  but unlogged" by checking this key independently. */
export const RUN_KEY = "ergomatic.sessionRun";

/** A distance phase's recorded actual (Architecture: "Distance phases").
 *  `actualSource` is a literal today — 6B's only source is the on-screen
 *  stopwatch — but it's a discriminant from day one so a future PM5-fed
 *  actual (Phase 7) is an additive union member, not a breaking shape
 *  change. */
export interface PhaseActual {
  elapsedSeconds: number;
  splitSeconds: number;
  actualSource: "stopwatch";
}

/** The session run: a SEPARATE versioned record from `SessionDraft`
 *  (spec's "Run state" decision), expand-only from day one like the draft.
 *  `phases` is frozen at `buildRun` time (engine.ts); every other field
 *  mutates as the engine's pure transition functions (`tick`/`pause`/
 *  `resume`/`advance`/`rewind`/`nextDistance`) run. `actuals` is keyed by
 *  POSITION in `phases` (see `nextDistance`'s own comment for why that's
 *  not `originalIndex`).
 *
 *  `workoutId`/`title` (whole-branch review, F3a): stamped by `buildRun`
 *  straight from the draft it was built from, so a screen that only has the
 *  RUN record (Today's resume card, F2 — a cold start has no reason to also
 *  read the draft once the run itself names the workout) never needs to
 *  reach into `SessionDraft` just to say whose session this is. Additive to
 *  the `v:1` shape, same "expand-only allows adding fields" rule the
 *  module's own header already establishes for the draft side. */
export interface SessionRun {
  v: 1;
  workoutId: string | null;
  title: string;
  phases: EnginePhase[];
  index: number;
  phaseStartedAt: string;
  pausedAt: string | null;
  pausedTotalMs: number;
  actuals: Record<number, PhaseActual>;
  startedAt: string;
  completedAt: string | null;
}

// Loose on purpose, same rationale as draft.ts's isPlainRecord: "shaped
// enough not to crash the screens that read it immediately," not full
// per-phase domain validation.
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Checks `v` plus every field a screen/engine function reads unconditionally
// on load — mirrors draft.ts's isSessionDraft exactly (same discipline, same
// reasoning: a shape that satisfies only `v === 1` used to pass and then
// throw the moment something touched `.phases`/`.actuals`).
//
// `title`/`workoutId` (F3a): `title` is REQUIRED (a non-empty check isn't
// needed — an empty string still renders fine on Today's resume card, same
// tolerance draft.ts's own `typeof value.title === "string"` check already
// gives the draft side) — this is the "match how run.ts validates title on
// the draft side" the review asked for, applied here rather than loosened to
// match draft.ts's OWN gap: draft.ts never validates `workoutId` at all (a
// pre-existing hole in that module, not a pattern worth replicating). This
// module already validates every nullable field as "null or the real type"
// (`pausedAt`/`completedAt` above) — `workoutId` gets the identical
// treatment for the identical reason: a shape with the wrong type there
// would otherwise pass and then hand Today's resume card (F2) a value it
// can't safely render or key off.
function isSessionRun(value: unknown): value is SessionRun {
  if (!isPlainRecord(value)) return false;
  return (
    value.v === 1 &&
    (value.workoutId === null || typeof value.workoutId === "string") &&
    typeof value.title === "string" &&
    Array.isArray(value.phases) &&
    typeof value.index === "number" &&
    typeof value.phaseStartedAt === "string" &&
    (value.pausedAt === null || typeof value.pausedAt === "string") &&
    typeof value.pausedTotalMs === "number" &&
    isPlainRecord(value.actuals) &&
    typeof value.startedAt === "string" &&
    (value.completedAt === null || typeof value.completedAt === "string")
  );
}

/** Persists the run. localStorage can throw (quota, private-mode Safari,
 *  disabled storage) — this never lets that escape uncaught; callers get a
 *  boolean instead, same contract as `saveDraft`.
 *
 *  **The 7B reverse cross-clear is deliberately NOT here** — read this
 *  before "fixing" that. Phase 7B's own spec §3 names "`buildRun`/`saveRun`
 *  (`session/run.ts`) clears an existing live `MonitorRun`" as the mirror of
 *  `monitor/monitorRun.ts`'s `createMonitorRun` clearing a `SessionRun`, and
 *  neither of those two functions is a safe home for it:
 *
 *  - `saveRun` is called on EVERY engine transition (`Timer.tsx`:
 *    `if (next !== prev) saveRun(next)`) — hundreds of times per session,
 *    with no rower decision anywhere near it. A cross-clear here would be
 *    the silent destruction the spec forbids, not a guarded one.
 *  - `buildRun` (`engine.ts`) runs from `Countdown.tsx`'s build effect,
 *    which a deep link to `/session/countdown` reaches without ever passing
 *    the confirm.
 *  - Either placement would also make this module import
 *    `monitor/monitorRun.ts`, which already imports `clearRun`/`loadRun`
 *    from here — a cycle, and one that would drag the monitor tree into
 *    every phone-timer screen.
 *
 *  The clear therefore lives at the one point a rower actually commits to a
 *  phone-timer session — `session/useStartWorkout.ts`'s `confirmReplace`
 *  (Phase 6I Task 4: extracted from WorkoutDetail's own former
 *  `startSession`, its one caller), on the line after its own `clearRun()`
 *  call and downstream of the staged confirm `handleStart` puts in front of
 *  it. Same shape, same reason, same place as the 6B F5 fix that put
 *  `clearRun()` there. */
export function saveRun(r: SessionRun): boolean {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(r));
    return true;
  } catch {
    return false;
  }
}

/** Loads the run. Garbage JSON or an unrecognized version/shape is
 *  discarded (the key is cleared) rather than crashing the caller — same
 *  discipline as `loadDraft` (spec's Resilience #5: unknown `v` or
 *  malformed shape -> null + clear, and the DRAFT survives since it's a
 *  separate key this function never touches). */
export function loadRun(): SessionRun | null {
  const raw = localStorage.getItem(RUN_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSessionRun(parsed)) return parsed;
  } catch {
    // fall through: garbage JSON is handled the same as an unknown shape
  }
  clearRun();
  return null;
}

export function clearRun(): void {
  localStorage.removeItem(RUN_KEY);
}
