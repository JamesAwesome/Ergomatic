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
import type { LogSeed } from "../session/logDraft";
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
  // v bumps 1 -> 2 the day `logSeed` ships (7C spec §2): a v1 record
  // (written before this task) loads as it always has — see `isMonitorRun`
  // and `loadMonitorRun`'s own Resilience #5 discipline — it just never
  // carries a seed, and never migrates to get one (there is nothing to
  // build it FROM after the fact: the `EnginePhase[]` it would need is long
  // gone by the time an old record is loaded back). Every run
  // `createMonitorRun` creates from here on is `v: 2`.
  v: 1 | 2;
  workoutId: string | null;
  title: string;
  program: WorkoutProgram;
  // The run's frozen log identity (7C spec §2, `session/logDraft.ts`'s own
  // `LogSeed` doc comment): captured once, at Connect, from the SAME
  // `EnginePhase[]` `program` was compiled from. OPTIONAL only so a v1
  // record (predating this field) still satisfies the type when loaded —
  // `createMonitorRun` below always supplies one for a record it creates.
  logSeed?: LogSeed;
  // CORRECTED (7C Task 5, adversarial m10): this paragraph used to say a
  // future 7C log screen "MUST handle" `IntervalActual.index === null`,
  // which implied it would surface those entries somehow. It does not.
  // `buildMonitorLogSteps` (`session/logDraft.ts`, spec §3) DROPS every
  // actual whose `index` is `null` — it means the machine's reported index
  // couldn't be matched to any interval in `program` at all, NOT "this is
  // interval 0", so there is no honest program position left to attribute
  // it to. Its diagnostic life is the wire log's (`eventLog.ts`, the
  // MONITOR LOG copy button on the Log screen), never the rower's saved
  // log. Never assume position in this array substitutes for `index`,
  // either: a boundary whose two halves never both arrive (see
  // `driver.ts`'s own `boundaryHalves` gating — the D4 defect was exactly
  // this, one interval lost out of two) can leave `actuals` shorter than
  // `program.intervals`, so array position and program interval also do
  // not correspond 1:1.
  //
  // Grows ONLY through `recordActual` below, and ONLY while the run is
  // live (`completedAt === null`) — spec §4's "the record is immutable
  // afterwards". A boundary the machine reports after this run closed is
  // not this run's (`domain/monitor/types.ts`'s `MonitorEvent` contract:
  // it arrives with `index: null` plus a `boundary-out-of-run` log), and
  // never lands here. ONE bounded exception since hardware walk 5: the
  // FINISH GRACE boundary — the final interval's own data, which the PM5
  // sends one notification AFTER the frame that ends the workout, and which
  // the driver vouches for with `finalBoundary: true`. See `recordActual`.
  actuals: IntervalActual[];
  deviceName: string;
  startedAt: string;
  completedAt: string | null;
  terminated: boolean;
  /**
   * Present only when the rower closed an interrupted session through
   * Today's row (F6). Absent = normal completion. Additive and optional
   * on purpose: a v1/v2 record without it reads exactly as before, per
   * this file's never-migrate contract.
   */
  endedBy?: "interrupted";
}

// Same discipline as `session/run.ts`'s own `isPlainRecord` — "shaped
// enough not to crash the screens that read it immediately," not a deep
// per-interval domain validation. `program`/`actuals` get exactly this
// same shallow treatment: `isPlainRecord(value.program)` plus
// `Array.isArray(value.program.intervals)` proves the two fields every
// reader unconditionally destructures exist and are the right container
// type, without walking every `ProgramInterval`'s own fields — identical
// to how `isSessionRun` never validates individual `EnginePhase` entries.
//
// **THE STORED PROGRAM CAN BE OLDER THAN ITS OWN TYPE, AND THAT IS A
// DELIBERATE CHOICE** (close-out C, antagonist review R1). The connected
// revamp made `ProgramInterval.type` a REQUIRED field
// (`domain/monitor/program.ts`) without bumping `v`, so a record written
// before that deploy loads afterwards with `interval.type === undefined`
// on a field TypeScript believes is a string. Three things were weighed
// and each was rejected for the same reason:
//
//   - bumping to `v: 3` — the version arm above discards on a mismatch and
//     clears the key. A rower who finished a connected piece before the
//     update and had not logged it yet would lose the PM5's numbers
//     outright (`session/LogSession.tsx` falls through to the manual door)
//     AND lose the unlogged warning `connectGuardStage` puts in front of
//     the next Connect. That is the F5 data-loss class this file's own
//     guards exist to prevent, spent to fix a defect that cannot fire.
//   - validating `type` here — identical outcome by a different door, and
//     it would abandon the shallow-validation rule this comment opens with.
//   - migrating on read — the only non-destructive option, but it would
//     have to derive `type` from `logSeed.steps[i].kind`, which a v1
//     record does not have at all, and this file's header pins "no
//     migration" as its contract.
//
// It cannot fire because NOTHING that reads a loaded program reads `type`.
// The connected surface's numbering (`workout/connected/surfaceModel.ts`'s
// `intervalNumbering`, the field's one and only consumer) is fed the
// program `WorkoutDetail.handleConnectProceed` compiles fresh in memory at
// Connect, never this record's; `useMonitorSession` creates runs and never
// loads one. The single production reader of a program that came back out
// of localStorage is `session/logDraft.ts`'s `buildMonitorLogSteps`, and it
// takes warm-up-ness from `logSeed.steps[i].kind` instead.
//
// **So the invariant to keep is "no reader of a LOADED program consults
// `ProgramInterval.type`", not "the stored shape is current."** Adding
// such a reader — retiring `LogSeed.kind` in favour of `type`, say, which
// `logDraft.ts`'s own comment contemplates — reintroduces the miscount
// this wave exists to fix, on the records of the rowers most likely to be
// mid-session. Do that only together with the version bump or the
// migration, and price the loss above first.
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMonitorRun(value: unknown): value is MonitorRun {
  if (!isPlainRecord(value)) return false;
  const program = value.program;
  // `logSeed` (7C, v2): same shallow treatment as `program` above — a v1
  // record simply omits it (undefined is fine, `loadMonitorRun`'s own
  // "no throw, no migration" contract), and when present it only has to be
  // shaped enough not to crash a reader that unconditionally destructures
  // `steps`/`paces` — never a deep per-step validation.
  const logSeed = value.logSeed;
  return (
    (value.v === 1 || value.v === 2) &&
    (value.workoutId === null || typeof value.workoutId === "string") &&
    typeof value.title === "string" &&
    isPlainRecord(program) &&
    Array.isArray(program.intervals) &&
    Array.isArray(value.actuals) &&
    typeof value.deviceName === "string" &&
    typeof value.startedAt === "string" &&
    (value.completedAt === null || typeof value.completedAt === "string") &&
    typeof value.terminated === "boolean" &&
    (value.endedBy === undefined || value.endedBy === "interrupted") &&
    (logSeed === undefined ||
      (isPlainRecord(logSeed) &&
        Array.isArray(logSeed.steps) &&
        isPlainRecord(logSeed.paces)))
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
 *  committing — `session/useStartWorkout.ts`'s `confirmReplace` (Phase 6I
 *  Task 4: extracted from WorkoutDetail's own former `startSession`),
 *  downstream of the staged confirm its `handleStart` puts in front of it —
 *  calls `clearMonitorRun` for the mirrored reason. See `session/run.ts`'s
 *  own note on why that clear is NOT inside `saveRun` despite the spec's
 *  prose naming it.
 *
 *  **7C: `logSeed` is REQUIRED here**, not optional the way `MonitorRun`'s
 *  own field is — the record's field stays optional purely to let a v1
 *  record (predating this task) still load; this function is the ONE place
 *  a v2 record is ever written, and its one production caller
 *  (`useMonitorSession`'s `program` callback) always has a `RunIdentity`
 *  whose own `logSeed` is required for the identical reason. Requiring it
 *  here too closes the last silent-failure gap: a caller that forgot to
 *  compute a seed would otherwise write a v2 record with none, and 7C's log
 *  screen would fall through to the manual door with no signal why. Every
 *  run this function builds is stamped `v: 2` unconditionally. */
export function createMonitorRun(
  args: {
    workoutId: string | null;
    title: string;
    program: WorkoutProgram;
    deviceName: string;
    logSeed: LogSeed;
  },
  now: Date,
): MonitorRun {
  const run: MonitorRun = {
    v: 2,
    workoutId: args.workoutId,
    title: args.title,
    program: args.program,
    logSeed: args.logSeed,
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

/** The record's OWN half of the finish-grace rule (`recordActual`'s doc
 *  comment). The flag says the driver vouched; these three questions are
 *  the record deciding for itself, from its own program and its own
 *  actuals, because it outlives the driver instance that set the flag (it
 *  is in localStorage, and 7C reads it back on a later screen) — the same
 *  reason `recordActual` guards at all:
 *
 *  1. the actual names an interval at all (`index !== null` — a boundary
 *     with no identity has nothing to be the final one OF);
 *  2. it names **the program's LAST interval**, which is what "the finish
 *     grace" MEANS: the data of the interval a naturally-finished workout
 *     just completed. This is also how the record re-derives CONSUMED-ONCE
 *     without storing a "already took one" bit — exactly one index can ever
 *     satisfy it, and (3) refuses that index the second time. A second
 *     flagged actual naming a DIFFERENT interval is a driver bug (the
 *     driver clears `finishGraceUntil` after the first, `driver.ts`), and a
 *     driver bug is something this record surfaces by refusing, never
 *     something it files (fix round 1, review M-3 — the doc comment used to
 *     claim an independence the code did not have);
 *  3. the record does not already hold that interval — the PM's own
 *     post-run housekeeping re-reporting a filed boundary must not double
 *     it.
 *
 *  A refusal here is not silent: the driver logged the boundary whichever
 *  path produced it — `interval-complete` with the FINISH GRACE detail, or
 *  `boundary-out-of-run`, or (since the fast-follow summary fallback)
 *  `summary-reconciled: filled-from-summary` for a boundary synthesized
 *  from 0x0039 rather than received on 0x0037/0x0038. That third entry is
 *  deliberately NOT an `interval-complete` one: no split pair arrived, and
 *  the driver refuses to say one did (`driver.ts`'s `reconcileSummary`).
 *  Either way the wire trace still carries what happened. */
function acceptableFinalBoundary(
  run: MonitorRun,
  actual: IntervalActual,
  opts: { finalBoundary?: boolean },
): boolean {
  if (opts.finalBoundary !== true) return false;
  if (actual.index === null) return false;
  if (actual.index !== run.program.intervals.length - 1) return false;
  return !run.actuals.some((a) => a.index === actual.index);
}

/**
 * Appends one interval boundary's actual to a live run, persisting the
 * result — the record-side half of Task 4's run scoping (spec §4: "within
 * an open run: actuals accumulate ... the record is immutable
 * afterwards"), and the function 7B's event wiring appends through when it
 * sees a `MonitorEvent` of kind `intervalComplete`.
 *
 * **A CLOSED run is immutable — with ONE exception, the FINISH GRACE:
 * otherwise this returns it UNCHANGED and persists nothing.**
 * `completedAt !== null` is what "closed" means on this record
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
 * **THE FINISH GRACE** (hardware walk 5, 2026-08-10, `docs/monitor/pm5-interface-notes.md`
 * §21 item 4 and §22 item 5 — `driver.ts`'s `activeRun.finishGraceUntil` (a wall-clock
 * deadline since walk day 3; post-finish status ticks neither extend nor
 * consume it) and the run
 * contract in `domain/monitor/types.ts` carry the capture too): a PM5 sends the final
 * interval's 0x0037/0x0038 pair one notification AFTER the general-status
 * frame that ends the workout, so the actual that completes a rowed-out
 * piece arrives at this function a beat after `completeMonitorRun` closed
 * the record. A 1-interval workout rowed to the finish therefore logged
 * `0 OF 1 INTERVALS MEASURED` with the split data sitting in the wire trace.
 * `opts.finalBoundary` is the driver VOUCHING that this boundary belongs to
 * the run that just finished. TWO producers set it since the fast-follow
 * summary fallback, and the vouch means the same thing from both: the
 * finish grace's own late 0x0037/0x0038 pair (`driver.ts`'s
 * `emitIntervalComplete`), and a final interval SYNTHESIZED from the
 * end-of-workout summary when that pair was dropped entirely
 * (`reconcileSummary`, at the grace's expiry — design spec §5). Neither
 * sets it on an ordinary in-run boundary, after a `terminated` close, or
 * for an interval the run already has, and there is still at most ONE
 * flagged event per run across both. A closed record accepts that one
 * actual. The immutability rule is
 * otherwise unchanged, and the vouch is not taken on trust: a flagged
 * actual is still refused unless it names this program's LAST interval and
 * that interval is not already held — see `acceptableFinalBoundary` below
 * for what each of those re-derives, and why "the last interval" is also
 * how the record bounds this to ONE late actual without keeping a bit for
 * it.
 *
 * Returns a NEW record rather than mutating in place, matching
 * `session/engine.ts`'s own idiom for `SessionRun` updates — the caller
 * holds the result; nothing here reaches back into a caller's copy.
 */
export function recordActual(
  run: MonitorRun,
  actual: IntervalActual,
  opts: { finalBoundary?: boolean } = {},
): MonitorRun {
  // OBLIGATION DISCHARGED (7B Task 4): the completion writer the fix
  // round's A2 note promised is `completeMonitorRun` below, and its one
  // caller is `useMonitorSession` — so this guard's closed branch is now
  // reachable in production, not only from tests. The hook closes the
  // record on `workoutComplete`/`terminated`, on End, and on P3b (a
  // program failure with a run still open, design spec's own Decisions
  // row); a boundary the machine reports after any of those lands here
  // and is refused.
  if (run.completedAt !== null && !acceptableFinalBoundary(run, actual, opts)) {
    return run;
  }
  const next: MonitorRun = { ...run, actuals: [...run.actuals, actual] };
  saveMonitorRun(next);
  return next;
}

/**
 * Closes a live run — the COMPLETION WRITER `recordActual`'s own A2 note
 * has been promising since Phase 7A ("whatever turns a `workoutComplete`/
 * `terminated` event into a finished record"), landing here in the task
 * that finally has a caller for it (7B Task 4, `useMonitorSession`).
 *
 * Two fields move, together and only here: `completedAt` (the
 * "live" vs "finished but not yet logged" boundary
 * `MonitorRun.completedAt`'s own comment draws — after this the record is
 * immutable, and `recordActual` above refuses every later boundary) and
 * `terminated` (HOW it ended, `MonitorRun.terminated`'s own comment: 7C
 * has to tell "logged 12 of 12" from "abandoned at 8"). They are one
 * call rather than two setters precisely because a record that says
 * "finished" without saying how is the shape 7C cannot read.
 *
 * **Idempotent by the same rule `recordActual` uses**: an already-closed
 * run is returned UNCHANGED and nothing is persisted — a second terminal
 * event, an End press racing the machine's own `workoutComplete`, or a
 * P3b close followed by the terminal event that was already in flight
 * must never re-stamp a later `completedAt` over the real one, nor flip
 * `terminated` after the fact. The hook has its own guard in front of
 * this (it ignores terminal events for a run it already closed, the
 * spec's P3b pin); this one is independent, for the same reason
 * `recordActual`'s is: the record outlives the driver and the hook that
 * wrote it.
 *
 * Returns a NEW record rather than mutating, matching `recordActual`.
 */
export function completeMonitorRun(
  run: MonitorRun,
  args: { terminated: boolean },
  now: Date,
): MonitorRun {
  if (run.completedAt !== null) return run;
  const next: MonitorRun = {
    ...run,
    completedAt: now.toISOString(),
    terminated: args.terminated,
  };
  saveMonitorRun(next);
  return next;
}

/**
 * F6's own door: closes a LIVE run the rower is ending through Today's row
 * rather than through a `workoutComplete`/`terminated` event the machine
 * itself sent (`completeMonitorRun` above is that path; this is the other
 * one — the phone lost the machine, or the rower simply walked away, and
 * nothing on the wire is ever going to say "finished" for this run again).
 *
 * Stamps `completedAt` from `now` and `endedBy: "interrupted"` together,
 * the same "two fields move, together and only here" discipline
 * `completeMonitorRun`'s own doc comment states for its pair — a record
 * that says "finished" without saying it was interrupted is the shape a
 * later screen (F6's own Today card) cannot read.
 *
 * **`terminated` is deliberately left untouched.** It answers a DIFFERENT
 * question — HOW the machine itself reported the end (`WORKOUTEND` vs
 * `TERMINATE`, `MonitorRun.terminated`'s own comment) — and this call site
 * has no such report to make: nothing on the wire ever closed this run.
 * Leaving it at whatever it already was (always `false` for a still-live
 * run, since `completeMonitorRun` is the only writer that ever sets it
 * `true`, and that only fires on an event this path by definition never
 * received) keeps `terminated` meaning "what the machine said," full stop,
 * with `endedBy` free to carry the orthogonal "the rower said" story.
 *
 * Idempotent by the same rule `completeMonitorRun` uses: an already-closed
 * record is returned UNCHANGED and nothing is persisted. The check reads
 * the caller's in-memory argument, not storage, so the guarantee is
 * single-tab: Today has no live monitor hook, so within a tab the record
 * it captured at mount cannot have gained a machine completion since. A
 * second tab driving a live session is the pre-existing shared-storage
 * hazard family, same premise the Connect door's dead-run rule rests on.
 */
export function completeInterruptedRun(run: MonitorRun, now: Date): MonitorRun {
  if (run.completedAt !== null) return run;
  const next: MonitorRun = {
    ...run,
    completedAt: now.toISOString(),
    endedBy: "interrupted",
  };
  saveMonitorRun(next);
  return next;
}

/**
 * "How much of this workout actually happened", for a run the rower ended
 * through the interrupted door above — the number the monitor-mode log
 * header shows (via `monitorLogTotals`) in place of the wall-clock span,
 * which for an interrupted record can be days. The Today row itself shows
 * no number. Built entirely from the record's OWN `actuals` and `program`,
 * never wall-clock time past the last measured boundary: the spec's own
 * constraint is that nothing here is invented past what the machine
 * actually reported.
 *
 * Sums each actual's `elapsedSeconds` (the work itself), plus — for every
 * actual that names a real interval (`index !== null`) — that interval's
 * OWN `restSeconds` from `program.intervals`. James's verbatim ruling,
 * stated here so a later review does not relitigate it: "work + programmed
 * rest for completed intervals" IS the allowance, and it covers EVERY
 * completed interval's rest, including the last one's. A rower who
 * finished interval N and then closed the session was, by the plan, still
 * resting until N+1 would have started — that rest is real time the plan
 * accounted for, whether or not another working interval ever began. The
 * "nothing invented past the last measured boundary" constraint forbids
 * inventing time the plan never promised (guessing at partial progress
 * into a rest, or crediting an interval that never completed at all); it
 * does not forbid the rest a completed interval's own program entry
 * already promises.
 *
 * `actual.index === null` (an unattributable boundary,
 * `IntervalActual.index`'s own doc comment: "must not be treated as
 * interval 0") contributes its work seconds and nothing else — there is no
 * honest program position to look rest up FROM. An out-of-range index
 * (defensive; array position in `actuals` is not program position, this
 * file's header comment on `MonitorRun.actuals`) is handled the identical
 * way: `program.intervals[index]` is simply `undefined`, so the rest term
 * is skipped rather than thrown. Never reads `ProgramInterval.type`
 * (loaded-program invariant, this file's `isMonitorRun` comment above) —
 * `restSeconds` is the one interval field every era of this record's
 * shape has always carried.
 */
export function interruptedTotalSeconds(run: MonitorRun): number {
  let total = 0;
  for (const actual of run.actuals) {
    total += actual.elapsedSeconds;
    if (actual.index !== null) {
      const interval = run.program.intervals[actual.index];
      if (interval !== undefined) total += interval.restSeconds;
    }
  }
  return total;
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
 * `SessionRun`; `session/useStartWorkout.ts`'s `confirmReplace` clears any
 * `MonitorRun`), so neither door leaves the other side's record standing.
 *
 * **One walk through the app's own screens still reaches this cell,
 * though** (Task 2's review, M-2 — an earlier draft of this comment said
 * none did, which was wrong): the cross-clears guard DESTRUCTION, and
 * `Countdown.tsx` CREATES a `SessionRun` with no clear of its own, reachable
 * by deep link (`/session/confirm` — a redirect shim as of fast-follow
 * Task 4, `AppRoutes.tsx`'s `ConfirmRedirect` — or `/session/countdown`
 * directly) or from any of Start's own rewired entry points
 * (`WorkoutDetail.tsx`, `BaselineCard.tsx`, both via `useStartWorkout.ts`).
 * A rower who takes that route mid-connected-session leaves both records
 * live. Nothing is destroyed by it, and no clear was
 * added at Countdown on purpose (that would be a new unguarded destruction
 * path, the exact thing this phase closed) — the two record types own their
 * own sides, and `useMonitorSession` deliberately does not consult this
 * function for that reason, tracking its own record instead. The
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
 *  `null` when nothing is at risk. Shares its shape with `WorkoutDetail`'s
 *  own `replaceStage` union (`session/useStartWorkout.ts`'s
 *  `StartReplaceStage`), and — as of the close-out's queue item 3 — the two
 *  doors now fully AGREE on when `"in-progress"` applies: a `SessionRun`
 *  (a phone timer genuinely running in the background) stages it while
 *  live, on both doors; a `MonitorRun` never does, on either door, because
 *  any `MonitorRun` either door can see is always dead (F6 spec 2b, exit
 *  criterion 5 — see `connectGuardStage`'s own doc comment below). HISTORY:
 *  Start's door used to branch its `MonitorRun` case on `completedAt` the
 *  same way its `SessionRun` case still does — the close-out's queue item 3
 *  shed that, on the identical reasoning this function's own comment
 *  already gave for the Connect door. */
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
 *
 * **Task 5 review, HIGH-1 — widened to read `loadMonitorRun()` too, the
 * moment Connect actually got mounted.** `createMonitorRun` above is not
 * this function's only downstream hazard once a rower can press Connect
 * for real: Task 5's own `WorkoutDetail.handleRowInstead` calls
 * `clearMonitorRun()` unconditionally, and `createMonitorRun` itself
 * OVERWRITES `MONITOR_RUN_KEY` via `saveMonitorRun` without ever checking
 * for a live one already there (this file's own doc comment on
 * `createMonitorRun`: "deliberately NOT idempotent-checked"). A
 * finished-but-unlogged `MonitorRun` is 7C's entire prefill input — exactly
 * the same class of record the `SessionRun` check above exists to protect,
 * on the OTHER side of the coexistence line. `WorkoutDetail.handleStart`
 * has read both records since Task 2 (ROADMAP M-1's own two-record
 * widening); this function reading only one was Task 2's original scope
 * (`ConnectAction` shipped unmounted, so the `MonitorRun` side was
 * unreachable through it) and became a live F5-class hole the instant Task
 * 5 mounted the button. Same descending-severity order `handleStart`
 * already uses: the `SessionRun` check runs first (unchanged), then the
 * `MonitorRun` check — so a rower with BOTH records stale gets staged
 * exactly ONCE, not twice, and the `SessionRun`'s own sentence wins ties
 * the same way `handleStart`'s ordering already resolves them. No new copy:
 * both sentences already exist and are shared with the `SessionRun` case
 * above.
 *
 * **F6 spec 2b, Task 2 — the `MonitorRun` check no longer branches on
 * `completedAt`.** It used to mirror the `SessionRun` check above,
 * staging `"in-progress"` for a `completedAt === null` record on the
 * theory that the erg was mid-piece. That theory was never true at this
 * door: a connected session's own screen is WorkoutDetail, and both a
 * reload and a navigation away tear the `useMonitorSession` hook down
 * without ever touching the record — so any `MonitorRun` still visible
 * here, live-looking or not, is a run nothing is driving anymore. Exit
 * criterion 5 names the defect this produced ("Connect never again asks
 * 'Replace it?' about a dead run"): every `MonitorRun` this function can
 * see now stages `"unlogged"`, matching the finished case it already used
 * to reach. The `SessionRun` branch above is untouched — a phone timer
 * genuinely does keep running in the background across reload/navigation,
 * so `"in-progress"` stays true there. */
export function connectGuardStage(): ConnectGuardStage {
  const run = loadRun();
  if (run !== null) {
    return run.completedAt === null ? "in-progress" : "unlogged";
  }
  const monitorRun = loadMonitorRun();
  if (monitorRun !== null) {
    // A MonitorRun visible at a Connect door is dead: the connected
    // session lives on WorkoutDetail's surface and reload/navigation
    // tears it down. "In progress" would assert machine state we do
    // not have (spec 2b, exit criterion 5).
    return "unlogged";
  }
  return null;
}
