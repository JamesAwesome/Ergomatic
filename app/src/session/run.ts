import type { EnginePhase } from "./engine";

/** localStorage key for the session run record — 6B's timer state. A
 *  SEPARATE key from `DRAFT_KEY` (spec: "Run state" decision): the draft
 *  stays the confirm contract, the run is the engine's, and Today's
 *  stale-draft discard must be able to tell "never started" from "finished
 *  but unlogged" by checking this key independently. */
export const RUN_KEY = "ergomatic.sessionRun";

/** A phase's recorded actual, a discriminated union on `actualSource`
 *  (Just Row without the monitor, spec 2026-09-02, stored shape (b)):
 *
 *  - `"stopwatch"` — a DISTANCE phase's actual (Architecture: "Distance
 *    phases"): elapsed seconds plus the average split they imply, written
 *    by `nextDistance` (engine.ts) / `Timer.tsx`'s NEXT.
 *  - `"stopwatch-elapsed"` — a METRE-LESS phase's actual: elapsed seconds
 *    only. Written when a free-row timer run (`mode: "justrow"`, one
 *    open-ended `test` phase) is finished. There is no split to record,
 *    `NaN` is not a legal value (it serialises to `null` and would
 *    round-trip as a typed number ⟨F5⟩), and an OPTIONAL `splitSeconds`
 *    would let any reader `!` past it — so the variant carries no such
 *    field at all, and every reader switches on `actualSource`
 *    exhaustively (`logDraft.ts`'s `buildLogSteps` writes `actualSplit`
 *    only from the first member). `isPhaseActual` below enforces both
 *    shapes at the storage boundary. */
export type PhaseActual =
  | { actualSource: "stopwatch"; elapsedSeconds: number; splitSeconds: number }
  | { actualSource: "stopwatch-elapsed"; elapsedSeconds: number };

/** Which kind of session a `SessionRun` is (stored shape (a)). The same
 *  word `MonitorRun.mode` already uses, so one vocabulary names a free row
 *  on both records. REQUIRED on the type: no reader ever sees `undefined`
 *  (see `loadRun`'s legacy upgrade), and every branch is on one of the two
 *  named values, exhaustively. */
export type SessionRunMode = "workout" | "justrow";

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
  /** `"workout"`: built by `buildRun` from a started draft (every run
   *  before 2026-09-02 was one of these). `"justrow"`: built by
   *  `buildFreeRowRun` — `workoutId` null, a single open-ended `test`
   *  phase, no draft behind it. No `v` bump: a stored record with NO
   *  `mode` is the legacy shape, upgraded to `"workout"` once at load. */
  mode: SessionRunMode;
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
// One member of the `PhaseActual` union, checked EXHAUSTIVELY on its
// discriminant: `"stopwatch"` REQUIRES a numeric `splitSeconds`;
// `"stopwatch-elapsed"` FORBIDS one (a metre-less phase has no split — a
// record carrying one was written by nothing this codebase ships, same
// class of rejection as an unknown `actualSource`). `typeof === "number"`
// deliberately admits NaN no further than JSON does: a NaN split
// serialises as `null` and is refused here as a non-number ⟨F5⟩.
function isPhaseActual(value: unknown): value is PhaseActual {
  if (!isPlainRecord(value)) return false;
  if (typeof value.elapsedSeconds !== "number") return false;
  switch (value.actualSource) {
    case "stopwatch":
      return typeof value.splitSeconds === "number";
    case "stopwatch-elapsed":
      return !("splitSeconds" in value);
    default:
      return false;
  }
}

// `mode` (Just Row without the monitor, stored shape (a)): ABSENT is
// accepted only as the legacy shape — every run written before 2026-09-02
// has no such key, and `loadRun` upgrades it — while any PRESENT value
// must be one of the two named members. The twin record's validator
// (`monitor/monitorRun.ts`, its own `mode` clause) learnt at Phase JR PR 1's
// review that declaring an optional discriminant and never checking it
// lets `mode: "corrupt"` load as a valid record; this clause is that
// lesson applied here from day one.
function isSessionRunMode(value: unknown): value is SessionRunMode {
  return value === "workout" || value === "justrow";
}

// `Object.values` on a plain record: every stored actual must be one of
// the union's members (stored shape (b)) — a record whose `actuals` bag
// holds a shape no reader can switch on is rejected whole, same as any
// other load-bearing field with the wrong type.
function isSessionRun(value: unknown): value is Omit<SessionRun, "mode"> & {
  mode?: SessionRunMode;
} {
  if (!isPlainRecord(value)) return false;
  return (
    value.v === 1 &&
    (value.mode === undefined || isSessionRunMode(value.mode)) &&
    (value.workoutId === null || typeof value.workoutId === "string") &&
    typeof value.title === "string" &&
    Array.isArray(value.phases) &&
    typeof value.index === "number" &&
    typeof value.phaseStartedAt === "string" &&
    (value.pausedAt === null || typeof value.pausedAt === "string") &&
    typeof value.pausedTotalMs === "number" &&
    isPlainRecord(value.actuals) &&
    Object.values(value.actuals).every(isPhaseActual) &&
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
    if (isSessionRun(parsed)) {
      // Legacy upgrade (stored shape (a)): a record with no `mode` was
      // written before the field existed, and every such run was built by
      // `buildRun` from a draft — a "workout". This is the ONLY place
      // absence is read, and it is read as the legacy SHAPE, never as a
      // value: past this line `mode` is one of two named members and no
      // reader ever branches on `undefined`. The next `saveRun` writes the
      // upgraded record back (no `v` bump — additive, same expand-only rule
      // the module header establishes).
      return { ...parsed, mode: parsed.mode ?? "workout" };
    }
  } catch {
    // fall through: garbage JSON is handled the same as an unknown shape
  }
  clearRun();
  return null;
}

export function clearRun(): void {
  localStorage.removeItem(RUN_KEY);
}
