// The monitor-driven session record (Phase 7A Task 5, design spec's
// coexistence obligation): the PM5-side counterpart to `session/run.ts`'s
// `SessionRun` — a SEPARATE versioned localStorage record for a workout
// being run by a connected monitor rather than the phone's own timer.
// `session/run.ts`'s own header comment states the reason two records
// exist rather than one shared shape: "the run is the engine's" — a
// `MonitorRun` has no `EnginePhase[]`/`index`/`pausedAt` at all (the PM5
// itself owns pacing; nothing here ticks a phase forward), so folding it
// into `SessionRun` would mean every phone-timer reader learning to ignore
// fields that never apply to it. Mirrors `session/run.ts`'s idiom
// throughout: `v: 1`, a strict-shape `isPlainRecord`-based validator that
// covers every field a reader touches unconditionally, best-effort IO that
// never throws, and a `clear*` that removes the key outright.
//
// `session/run.ts`'s own 6B/6C comments carry over unchanged here: the
// `completedAt: null` vs `completedAt: <iso>` boundary is "live" vs
// "finished but not yet logged/consumed" (7C's eventual monitor-side log
// path, not built this phase); an unrecognized `v` or a malformed shape is
// discarded (the key cleared) rather than crashing whatever screen reads it
// first, same as `loadRun`'s own "Resilience #5".

import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { IntervalActual } from "../../domain/monitor/types.js";
import { clearRun, loadRun } from "../session/run";

export const MONITOR_RUN_KEY = "ergomatic.monitorRun";

/** The monitor run: what a connected PM5 is (or just finished) programming
 *  and reporting against. `program`/`actuals` are the compiled IR and the
 *  interval-boundary actuals `MonitorDriver`'s `intervalComplete` events
 *  produce (`domain/monitor/types.ts`) — the wire-normalized shapes, not a
 *  phone-timer `EnginePhase[]`. `terminated` distinguishes "the rower cut
 *  it short" (PM5 `TERMINATE`) from an honest `WORKOUTEND` finish
 *  (`MonitorFrame.state`'s own "finished"/"terminated" split,
 *  `domain/monitor/types.ts`'s comment on why that pair exists at all) —
 *  independent of `completedAt`, which only says WHEN the session stopped
 *  reporting, not how. A future consumer (7C) needs both: "12 of 12 logged"
 *  reads differently from "abandoned at interval 8", even though both set
 *  `completedAt`. */
export interface MonitorRun {
  v: 1;
  workoutId: string | null;
  title: string;
  program: WorkoutProgram;
  // A future 7C log screen prefilling from this array MUST handle
  // `IntervalActual.index === null` (Phase 7A-fix Task 3, D3) — it means
  // the machine's reported index couldn't be matched to any interval in
  // `program`, NOT "this is interval 0". Never assume position in this
  // array substitutes for `index`, either: a boundary whose two halves
  // never both arrive (see `driver.ts`'s own `boundaryHalves` gating — the
  // D4 defect was exactly this, one interval lost out of two) can leave
  // `actuals`
  // shorter than `program.intervals`, so array position and program
  // interval also do not correspond 1:1.
  actuals: IntervalActual[];
  deviceName: string;
  startedAt: string;
  completedAt: string | null;
  terminated: boolean;
}

// Same discipline as `session/run.ts`'s own `isPlainRecord` — "shaped
// enough not to crash the screens that read it immediately," not a deep
// per-interval domain validation. `program`/`actuals` get exactly this
// same shallow treatment: `isPlainRecord(value.program)` plus
// `Array.isArray(value.program.intervals)` proves the two fields every
// reader unconditionally destructures exist and are the right container
// type, without walking every `ProgramInterval`'s own fields — identical
// to how `isSessionRun` never validates individual `EnginePhase` entries.
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMonitorRun(value: unknown): value is MonitorRun {
  if (!isPlainRecord(value)) return false;
  const program = value.program;
  return (
    value.v === 1 &&
    (value.workoutId === null || typeof value.workoutId === "string") &&
    typeof value.title === "string" &&
    isPlainRecord(program) &&
    Array.isArray(program.intervals) &&
    Array.isArray(value.actuals) &&
    typeof value.deviceName === "string" &&
    typeof value.startedAt === "string" &&
    (value.completedAt === null || typeof value.completedAt === "string") &&
    typeof value.terminated === "boolean"
  );
}

/** Persists the run. Best-effort, same rationale as `saveRun`: localStorage
 *  can throw (quota, private-mode Safari, disabled storage), and this never
 *  lets that escape uncaught. Unlike `saveRun`, this reports nothing back —
 *  the brief's own interface fixes `saveMonitorRun`'s return type at `void`
 *  (the record's would-be callers, `createMonitorRun` below and 7B's
 *  in-progress actuals writes, have no different action to take on a failed
 *  write than a successful one: the in-memory session keeps running either
 *  way, only the localStorage mirror would be stale). */
export function saveMonitorRun(r: MonitorRun): void {
  try {
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(r));
  } catch {
    // best-effort: a failed persist never interrupts the caller
  }
}

/** Loads the run. Garbage JSON or an unrecognized version/shape is
 *  discarded (the key is cleared) rather than crashing the caller — the
 *  same "Resilience #5" discipline `loadRun` documents on its own key. */
export function loadMonitorRun(): MonitorRun | null {
  const raw = localStorage.getItem(MONITOR_RUN_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isMonitorRun(parsed)) return parsed;
  } catch {
    // fall through: garbage JSON is handled the same as an unknown shape
  }
  clearMonitorRun();
  return null;
}

export function clearMonitorRun(): void {
  localStorage.removeItem(MONITOR_RUN_KEY);
}

/** Builds, persists, and registers a fresh `MonitorRun` — the ONE place a
 *  new monitor-driven session begins. Cross-clear rule (design spec's
 *  coexistence obligation): creating a `MonitorRun` clears whatever
 *  `SessionRun` is currently on record, unconditionally — a rower cannot be
 *  mid-phone-timer-session and mid-monitor-session at once, and 7B's
 *  "Connect PM5" flow replaces the phone-timer path for that session
 *  entirely rather than running alongside it. This is only HALF the rule:
 *  the reverse direction (`buildRun`/`saveRun` clearing an existing
 *  `MonitorRun`) is a documented 7B obligation, deliberately NOT made here
 *  — `session/run.ts` is untouched by this phase, since nothing in 7A ever
 *  constructs a `SessionRun` while a `MonitorRun` is live (no screen calls
 *  `createMonitorRun` yet; Today.tsx's one guard extension below is the
 *  only 7A code that even reads this module's output). Deliberately NOT
 *  idempotent-checked against an existing live `MonitorRun` of its own —
 *  same "simplicity over precision" call `session/run.ts`'s own comments
 *  make for the identical single-session-at-a-time assumption. */
export function createMonitorRun(
  args: {
    workoutId: string | null;
    title: string;
    program: WorkoutProgram;
    deviceName: string;
  },
  now: Date,
): MonitorRun {
  const run: MonitorRun = {
    v: 1,
    workoutId: args.workoutId,
    title: args.title,
    program: args.program,
    actuals: [],
    deviceName: args.deviceName,
    startedAt: now.toISOString(),
    completedAt: null,
    terminated: false,
  };
  clearRun();
  saveMonitorRun(run);
  return run;
}

type RecordState = "absent" | "live" | "unlogged";

function sessionRunState(): RecordState {
  // Deliberately re-reads via `loadRun` (not a value threaded in) so this
  // always answers against whatever is CURRENTLY on record — `loadRun`
  // itself already discards a garbage/unrecognized-version entry as
  // "absent" (its own Resilience #5), which is exactly the right answer
  // here too: a record neither side can even parse is not a live session.
  const run = loadRun();
  if (run === null) return "absent";
  return run.completedAt === null ? "live" : "unlogged";
}

function monitorRunState(): RecordState {
  const run = loadMonitorRun();
  if (run === null) return "absent";
  return run.completedAt === null ? "live" : "unlogged";
}

/**
 * The coexistence truth table (design spec's obligation): reads BOTH
 * records and answers "is anything actually happening right now, and on
 * which side" — never "did something happen that's still sitting
 * unlogged." That second question is deliberately out of scope: this
 * function's name is `anyLIVEsession`, and a completed-but-unlogged record
 * on either side is exactly what `SessionRun`'s own 6B comment already
 * calls "finished but not yet logged" — real history, but not a live
 * session by any definition a resume/guard caller needs. Concretely, an
 * `"unlogged"` state on either side is treated identically to `"absent"`
 * UNLESS the other side is genuinely `"live"`, in which case the live side
 * wins outright.
 *
 * All nine `{absent, live, unlogged} x {absent, live, unlogged}` cells,
 * pinned:
 *
 * | sessionRun  | monitorRun  | result    | why |
 * |---|---|---|---|
 * | absent      | absent      | `"none"`    | nothing on record either side |
 * | absent      | live        | `"monitor"` | only the monitor is live |
 * | absent      | unlogged    | `"none"`    | a stale monitor record, nothing live |
 * | live        | absent      | `"phone"`   | only the phone is live |
 * | live        | live        | `"monitor"` | BOTH live — see tie-break below |
 * | live        | unlogged    | `"phone"`   | phone live; monitor record is stale |
 * | unlogged    | absent      | `"none"`    | a stale phone record, nothing live |
 * | unlogged    | live        | `"monitor"` | monitor live; phone record is stale |
 * | unlogged    | unlogged    | `"none"`    | "both-stale" — neither is live |
 *
 * The `live`/`live` tie-break (row 5) picks `"monitor"`. This cell
 * shouldn't be reachable at all given the cross-clear rule
 * (`createMonitorRun` above always clears any `SessionRun` first) — but
 * 7A only implements HALF of that rule (`createMonitorRun` -> clears
 * `SessionRun`; the reverse, `buildRun`/`saveRun` clearing an existing
 * `MonitorRun`, is 7B's obligation), so a `SessionRun` started while an
 * OLD `MonitorRun` is still live and un-cleared is exactly the gap this
 * function must still answer through today. `"monitor"` is chosen because
 * a `MonitorRun` only ever exists once a rower has actually connected real
 * hardware — a strictly narrower, more deliberate action than the
 * always-available phone timer — so if both somehow claim to be live at
 * once, the hardware-backed record is trusted as the more likely genuine
 * one. The `"both-stale"` cell (row 9) resolves to `"none"`, not a
 * tie-break, precisely because NEITHER side is live there — there is
 * nothing to prefer between two finished records, only a shared "no,
 * nothing is running" answer.
 */
export function anyLiveSession(): "none" | "phone" | "monitor" {
  const monitor = monitorRunState();
  if (monitor === "live") return "monitor";
  const phone = sessionRunState();
  if (phone === "live") return "phone";
  return "none";
}
