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
 *  not `originalIndex`). */
export interface SessionRun {
  v: 1;
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
function isSessionRun(value: unknown): value is SessionRun {
  if (!isPlainRecord(value)) return false;
  return (
    value.v === 1 &&
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
 *  boolean instead, same contract as `saveDraft`. */
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
