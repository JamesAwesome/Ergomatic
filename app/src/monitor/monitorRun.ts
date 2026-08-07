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
  //
  // Grows ONLY through `recordActual` below, and ONLY while the run is
  // live (`completedAt === null`) — spec §4's "the record is immutable
  // afterwards". A boundary the machine reports after this run closed is
  // not this run's (`domain/monitor/types.ts`'s `MonitorEvent` contract:
  // it arrives with `index: null` plus a `boundary-out-of-run` log), and
  // never lands here.
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
 *  entirely rather than running alongside it. Deliberately NOT
 *  idempotent-checked against an existing live `MonitorRun` of its own —
 *  same "simplicity over precision" call `session/run.ts`'s own comments
 *  make for the identical single-session-at-a-time assumption.
 *
 *  **This function destroys data, and nothing in it asks first.** That is
 *  by design and it is why `connectGuardStage()` below exists: the ONLY
 *  caller a rower can reach — 7B's Connect affordance (`ConnectAction.tsx`)
 *  — must stage a confirm before ever getting here. Do not add a second
 *  unguarded caller.
 *
 *  **7B: the reverse half of this rule now ships too** (7A left it as a
 *  documented obligation here, since no 7A code ever constructed a
 *  `SessionRun` while a `MonitorRun` was live). A phone-timer session
 *  committing — `WorkoutDetail`'s `startSession`, downstream of the staged
 *  confirm its `handleStart` puts in front of it — calls `clearMonitorRun`
 *  for the mirrored reason. See `session/run.ts`'s own note on why that
 *  clear is NOT inside `saveRun` despite the spec's prose naming it. */
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

/**
 * Appends one interval boundary's actual to a live run, persisting the
 * result — the record-side half of Task 4's run scoping (spec §4: "within
 * an open run: actuals accumulate ... the record is immutable
 * afterwards"), and the function 7B's event wiring appends through when it
 * sees a `MonitorEvent` of kind `intervalComplete`.
 *
 * **A CLOSED run is immutable: this returns it UNCHANGED and persists
 * nothing.** `completedAt !== null` is what "closed" means on this record
 * (the same "live" vs "finished but not yet logged" boundary
 * `MonitorRun.completedAt`'s own comment draws, and the one
 * `monitorRunState` below already keys off). The driver's own run scoping
 * is the first line of defence — it emits a post-run boundary with
 * `index: null` and a `boundary-out-of-run` log rather than an actual
 * belonging to the finished workout (`domain/monitor/types.ts`'s
 * `MonitorEvent` contract) — but the record refuses independently, because
 * the two are separate lifetimes: a `MonitorRun` outlives the driver
 * instance that produced it (it is in localStorage, and 7C reads it back
 * on a later screen), so "which run is open" cannot be a fact only the
 * driver holds.
 *
 * Returns a NEW record rather than mutating in place, matching
 * `session/engine.ts`'s own idiom for `SessionRun` updates — the caller
 * holds the result; nothing here reaches back into a caller's copy.
 */
export function recordActual(
  run: MonitorRun,
  actual: IntervalActual,
): MonitorRun {
  // OPEN OBLIGATION (fix round, A2): nothing in the codebase sets
  // `completedAt` on a `MonitorRun` yet — `createMonitorRun` stamps it
  // `null` and no writer ever moves it off that. **7B's completion writer
  // (whatever turns a `workoutComplete`/`terminated` event into a
  // finished record) is this guard's first real caller**; until it ships,
  // the closed branch is exercised only by tests. The guard lands now, in
  // the task that scopes runs, rather than being remembered later.
  if (run.completedAt !== null) return run;
  const next: MonitorRun = { ...run, actuals: [...run.actuals, actual] };
  saveMonitorRun(next);
  return next;
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
 * The `live`/`live` tie-break (row 5) picks `"monitor"`. **7B closed the
 * gap that used to make this cell ordinarily reachable** — both halves of
 * the cross-clear rule now ship (`createMonitorRun` above clears any
 * `SessionRun`; `WorkoutDetail`'s `startSession` clears any `MonitorRun`),
 * so neither door leaves the other side's record standing and no walk
 * through the app's own screens should produce two live records. The
 * tie-break stays anyway, and this table keeps pinning it: a half-completed
 * write, a localStorage edited by hand, or records left by an older build
 * can all still present this shape, and "unreachable by design" has never
 * been a reason for a resilience path to answer undefined. `"monitor"` is
 * chosen because
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

/** What a Connect press has to warn about before it is allowed through, or
 *  `null` when nothing is at risk. Mirrors `WorkoutDetail`'s own
 *  `replaceStage` union 1:1 so both doors speak the same two sentences. */
export type ConnectGuardStage = "unlogged" | "in-progress" | null;

/**
 * The Connect guard (7B, spec §3 — "the F5 walk, closed"). Answers "would
 * connecting a monitor right now destroy something the rower still needs?"
 * by reading the `SessionRun` record DIRECTLY, which is the whole point of
 * this function existing separately from `anyLiveSession()` directly above.
 *
 * ROADMAP M-1, verbatim, because routing this through the function above is
 * the exact mistake it was written to prevent:
 *
 * > **Guard wiring is NOT uniform (final-review M-1 — read before touching
 * > any guard that reads `RUN_KEY`/`MONITOR_RUN_KEY`).** ... Routing either
 * > through `anyLiveSession()` silently downgrades "unlogged" to "none" and
 * > reintroduces the F5 data-loss class (a real, previously-shipped bug: a
 * > stale run record silently discarded instead of protected). When adding
 * > a NEW guard, ask "does this care about unlogged specifically, or just
 * > live-vs-not" before picking which of the two patterns to follow.
 *
 * For Connect the answer is **YES, it cares about unlogged specifically**:
 * the action behind it is `createMonitorRun` above, whose `clearRun()` is
 * unconditional, and a finished-but-unlogged `SessionRun` is precisely the
 * record 6B's F5 fix exists to protect — `anyLiveSession()`'s own pinned
 * table returns `"none"` for it (rows 7 and 9), so a Connect guard wired
 * that way would walk straight past the one case it is FOR. This is the
 * same direct-read pattern `Today.tsx`'s cold-start guard already uses, and
 * for the same reason its own comment gives.
 *
 * A LIVE `SessionRun` (`completedAt === null`) is staged too, with the
 * "in progress" sentence rather than the "unlogged" one: `clearRun()`
 * destroys that record just as completely, and the spec's own constraint is
 * that **no silent destruction path exists in either direction**. It is a
 * lesser loss than the unlogged case (an abandoned session was never going
 * to be logged), which is why the two get different copy — the identical
 * severity ordering, and the identical pair of sentences, that
 * `WorkoutDetail`'s `handleStart` already applies at the other door.
 */
export function connectGuardStage(): ConnectGuardStage {
  const run = loadRun();
  if (run === null) return null;
  return run.completedAt === null ? "in-progress" : "unlogged";
}
