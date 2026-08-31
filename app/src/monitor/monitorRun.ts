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
import type { SeriesData } from "./seriesRecorder";
import { clearRun, loadRun } from "../session/run";

export const MONITOR_RUN_KEY = "ergomatic.monitorRun";

/**
 * Phase LL Task 4 (design spec §4's writer table, the anchor pass's own
 * verification "writer by writer"): the four close reasons a WIRE EVENT
 * (or the P3b program-failure path) can honestly produce, excluding
 * `"interrupted"` — that value has exactly one writer,
 * `completeInterruptedRun` below, and is never passed through this type
 * (F6's door has no wire event to report; "closed later with no evidence"
 * is a different shape of honesty than these four). `completeMonitorRun`'s
 * `args.endedBy` takes exactly this type, which is what makes "every
 * writer sets its value" a compiler-checked fact rather than a convention:
 * there is no way to close a run through that function without naming one
 * of these four.
 *
 * `"link-lost"` gains a SECOND producer at Task 4's own review (F1/I1):
 * `completeContinuityReset` below writes it too, for a continuity reset —
 * not through `completeMonitorRun` (a reset has no wire event to report
 * either), but the VALUE is the same member of this same type: both
 * producers are "the link is why this record stops here," learned two
 * different ways. `MonitorRun.endedBy`'s own doc comment has the full
 * writer table, all six.
 */
export type CloseReason = "finished" | "rower" | "link-lost" | "program-failed";

/**
 * RC-3 (storage-spine design spec §2, PR 1 Task 2): the nine 0x0039 fields
 * beyond the work-only totals `MonitorRun.summaryTotals` already carries —
 * verbatim `WorkoutSummary` values (`domain/monitor/pm5/parse.ts`) minus
 * that pair, field-for-field, so `summaryObservationsEvent` (`driver.ts`)
 * can build one without spreading `elapsedSeconds`/`meters` back in by
 * accident. `avgPaceSecondsPer500m` is already descaled to SECONDS —
 * `parseEndOfWorkoutSummary` divides the wire's 0.1s/lsb integer before
 * this type ever sees it, so nothing downstream re-derives the scale.
 */
export type MachineSummaryDetail = {
  avgStrokeRate: number;
  endingHeartRateBpm: number | null;
  avgHeartRateBpm: number | null;
  minHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  dragFactorAverage: number;
  workoutType: number;
  recoveryHeartRateBpm: number | null;
  avgPaceSecondsPer500m: number;
};

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
   * Phase LL Task 4 (design spec §4): WIDENS the field that already
   * existed here (`"interrupted"`, F6) — never a third overlapping flag
   * beside `terminated`. **CORRECTED at Task 4's own review (I2):** this
   * comment used to claim `terminated` "already losslessly distinguishes"
   * an honest WORKOUTEND from a PM5 TERMINATE. FALSE, and was false
   * before this phase — `endSession` has always written `terminated:
   * true` on the End-button path too, so End-at-the-phone and
   * Menu-at-the-erg store the identical `terminated: true`. `endedBy` is
   * what actually carries that distinction now (`"rower"` either way —
   * see below), an honest loss the spec accepts: no consumer needs the
   * venue. Every `endedBy` value is one its one writer HONESTLY KNOWS at
   * close time (`CloseReason`'s own doc comment names each writer):
   *   - `"finished"` — machine WORKOUTEND (`endByMachine(false)`).
   *   - `"rower"` — the rower ended it: the End button with
   *     `linkGone === false`, OR the machine's own TERMINATE arriving at
   *     all (`endByMachine(true)`) — a TERMINATE event is BY
   *     CONSTRUCTION link-up (it arrived), and a human at the PM5 menu is
   *     the rower, same as a human at the End button (RULED at Task 4's
   *     review, I2 — the first implementation reasoned this out as a
   *     finding; the spec now states it directly, with the "open
   *     assertion" that an inactivity auto-TERMINATE, if the PM5 ever
   *     emits one, would make this label an assertion of agency rather
   *     than an observation — unverified either way, walk question W8).
   *   - `"link-lost"` — the End button with `linkGone === true`, OR a
   *     continuity reset (`useMonitorSession.ts`'s `applyContinuityCheck`,
   *     `completeContinuityReset` below) — RULED at Task 4's review
   *     (F1/I1, correcting the first implementation's `"interrupted"`):
   *     a reset is the close with the STRONGEST evidence of the two —
   *     the stream was marked suspect by a link episode and then
   *     MEASURABLY violated continuity — so it gets the same value the
   *     other link-caused close already uses, never the "no evidence"
   *     value.
   *   - `"program-failed"` — a failed `program()` closing a run still open
   *     (P3b).
   *   - `"interrupted"` — closed later through Today's row (F6), with NO
   *     evidence of a cause. Never conflate this with the others: this is
   *     the ABSENCE of a story, not a sixth story.
   * A run's own `completedAt`/`terminated` pair can be set with NO
   * `endedBy` at all only if some future writer forgets to pass one —
   * `completeMonitorRun`'s own `args.endedBy` is REQUIRED, not optional,
   * precisely so that can't happen silently.
   * Additive and optional on the STORED record: a v1/v2 record written
   * before this task, or any record whose writer predates a given close
   * reason, reads back exactly as it always has — this file's
   * never-migrate contract, unchanged.
   */
  endedBy?: CloseReason | "interrupted";
  /**
   * Phase LT spec 2 (`docs/superpowers/specs/2026-08-19-series-capture-design.md`
   * §2's storage-home row): the 1 Hz pace/rate/HR trace `useMonitorSession.ts`'s
   * `SeriesRecorder` accumulates for the life of this run, flushed onto the
   * record after each boundary write, on its own 30-second timer, and at
   * close (never per-frame — §2's own rejected-before-design arithmetic:
   * "by minute 70, re-serialize ~190 KB every second"). Additive-optional,
   * the SAME never-migrate contract `endedBy?` above already established
   * (the precedent §2's storage-home row cites by name): a record from
   * before this task simply has none, and never gains one after the fact —
   * there is no wire trace to build it FROM once a run is over. Absent
   * whenever the recorder produced no sample at all — `SeriesData` is never
   * an empty-array placeholder (`seriesRecorder.ts`'s own `snapshot()` doc
   * comment: undefined until the first sample).
   */
  series?: SeriesData;
  /**
   * Set the one time a localStorage write WITH a series present threw and
   * the retry-without-series inside `saveMonitorRun`'s own catch succeeded
   * (§3's sacrifice ordering) — the audit trail of a trace that was
   * sacrificed to save the run itself. Never written any other way, and
   * (stated, not hidden, the plan's own self-review names this explicitly)
   * not read by anything yet this task — a future screen's "trace lost"
   * notice is the eventual consumer. Additive-optional, same never-migrate
   * contract as `series` above.
   */
  seriesDropped?: true;
  /**
   * PR 1's own field (`docs/superpowers/specs/2026-08-23-storage-spine-design.md`
   * §2, "the post-close observation writer"): 0x0039's work-only totals —
   * `workElapsedSeconds`/`workDistanceMeters` — folded onto a
   * BURST-ELIGIBLE record (a natural finish or a rower-ended close, this
   * writer's own gate below — widened from naturally-finished by the
   * summary-record design spec's §1) after the fact by
   * `appendSummaryObservations` below, the record's ONLY writer for this
   * field. Additive-optional, the
   * same never-migrate contract `series`/`endedBy` above already
   * established: a record from before this task simply has none, and this
   * field is never written any other way — in particular NOT by
   * `completeMonitorRun`, which closes on the wire event alone and has no
   * summary in hand yet. `isMonitorRun` below deliberately gains no check
   * for this field (its own comment: "this positive conjunction tolerates
   * the new fields on records this task's own code never wrote") —
   * write-once and identity are the writer's job, not the validator's.
   */
  summaryTotals?: { workElapsedSeconds: number; workDistanceMeters: number };
  /**
   * 0x003F's raw verification-hash bytes, written the same way and at the
   * same time as `summaryTotals` above (one call, one writer,
   * `appendSummaryObservations`) — but independently optional within that
   * call: a burst that never produced 0x003F (absent-on-firmware, LL's
   * degrade semantics) still folds its totals alone. Additive-optional,
   * same never-migrate contract as `summaryTotals`.
   */
  verificationBytes?: readonly number[];
  /**
   * RC-3 (storage-spine design spec §2, PR 1 Task 2): 0x0039's other nine
   * fields — everything the characteristic carries beyond the work-only
   * totals `summaryTotals` above already holds — folded on in the SAME
   * call, by the SAME writer, `appendSummaryObservations` below.
   * Verbatim parser values (`MachineSummaryDetail`'s own doc comment names
   * the one descale: `avgPaceSecondsPer500m` is already in SECONDS here,
   * not the wire's 0.1s/lsb integer — `domain/monitor/pm5/parse.ts`'s
   * `parseEndOfWorkoutSummary` has already divided by 10 before this field
   * is ever built). Additive-optional, the same never-migrate contract
   * `summaryTotals`/`series`/`endedBy` above already established: a
   * record from before this task simply has none, and this field is
   * never written any other way. `isMonitorRun` below deliberately gains
   * no check for this field either, same reasoning as `summaryTotals`'s
   * own comment: write-once and identity are the writer's job, not the
   * validator's.
   */
  summaryDetail?: MachineSummaryDetail;
  /**
   * RC-1 (storage-spine design spec §3, TRIAD — a stored shape): work and
   * rest, summed SEPARATELY from `actuals` — never from `summaryTotals`
   * above, a different PR's different quantity (0x0039's work-only totals,
   * folded independently by the burst listener; these four fields never
   * read that one, and vice versa). See `computeWorkRestSums`'s own doc
   * comment for exactly what each sums and why the rest pair is
   * all-or-nothing.
   *
   * Written by exactly two call sites, both below: `completeMonitorRun`'s
   * own `endedBy === "finished"` branch (the ordinary case — a natural
   * WORKOUTEND close), and `recordActual`'s late-acceptance branch (the
   * finish-grace boundary, which the doc comment on `actuals` above notes
   * can still arrive AFTER `completeMonitorRun` already ran — re-summing
   * there is what keeps these four correct for that ordering rather than
   * permanently missing the final interval). Never written for any other
   * `endedBy` (`"rower"`/`"link-lost"`/`"program-failed"`): a terminate or
   * link-lost close's actuals are exactly the ones RC-1's own ROADMAP row
   * calls incomplete by construction (the trailing-rest 0x0037 an END
   * during a rest never gets to send), and the spec's bar is "never
   * estimated" — no attempt beats no number. **Also absent on a
   * `"finished"` close with EMPTY `actuals`** (final whole-branch review,
   * MEDIUM-1) — see `computeWorkRestSums`'s own doc comment for the
   * hardware shape that reaches this (a finish grace that never delivered
   * a boundary at all).
   *
   * **NO BACKFILL** (design spec §3, stated above the fold): a record
   * closed before this PR simply has none of these four fields, forever —
   * the same never-migrate contract every other additive field on this
   * interface already carries, `summaryTotals`'s own comment above
   * included. **The fused DISPLAY sum is UNCHANGED and does not read these
   * fields this PR** (`session/summaryModel.ts`'s `monitorDistanceMeters`/
   * `monitorTimeSeconds` keep summing straight off `actuals`, exactly as
   * before) — pinned by construction: every screen renders the identical
   * number whether or not a record carries this split. `isMonitorRun`
   * below deliberately gains no check for any of the four, same reasoning
   * as `summaryTotals`'s own comment: write-once-per-close-reason
   * discipline is the writer's job, not the validator's.
   */
  workSeconds?: number;
  workMeters?: number;
  restSeconds?: number;
  restMeters?: number;
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
// Task 2 (hand-off store, design spec §8): EXPORTED — no behavior change,
// only visibility — so `handoffStore.ts`'s own hydration path can validate
// raw durable bytes with the IDENTICAL rule this file's own `loadMonitorRun`
// uses, without routing through `loadMonitorRun` itself. That function
// self-clears on a malformed shape (`clearMonitorRun()` below, unconditional
// on read) — exactly the anti-pattern §8 forbids for a store read ("Malformed
// durable bytes are never cleared during a read"). Reusing this validator
// instead of a second, hand-maintained copy is the DRY call: two shape
// checks for the same stored type drifting apart is its own defect class
// (CLAUDE.md RF23's shape, one mechanism disagreeing with another).
export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when `value.series` is either absent or shaped enough to trust — a
 *  plain record carrying a `samples` array, never a per-sample domain
 *  validation (that is Task 3's server-side job, not this best-effort
 *  client mirror's). Pulled out of `isMonitorRun` below (LOW-3, task-2
 *  review) so `loadMonitorRun`'s own pre-pass (`stripMalformedSeries`) and
 *  the validator share the identical rule rather than two copies
 *  drifting. */
function hasValidSeries(value: Record<string, unknown>): boolean {
  const series = value.series;
  return (
    series === undefined ||
    (isPlainRecord(series) && Array.isArray(series.samples))
  );
}

/**
 * LOW-3 (task-2 review): a malformed `series` used to discard the WHOLE
 * record through `isMonitorRun`'s all-or-nothing conjunction — the
 * inverse of §3's own sacrifice principle ("only the trace is ever
 * sacrificed, never the run"), just applied at LOAD time instead of SAVE
 * time. `loadMonitorRun` runs this FIRST: a `series` that fails
 * `hasValidSeries` is dropped from the value before `isMonitorRun` ever
 * sees it, so every other field — each validated entirely on its own —
 * still loads. Returns the SAME reference when `series` is already valid
 * or absent (the common case, and what lets `isMonitorRun`'s own
 * `hasValidSeries` check stay in place downstream too, as a redundant
 * safety net for any caller that reaches it without going through this
 * pre-pass first — there is exactly one, `loadMonitorRun`, today, but the
 * function is not exported and nothing pins that as permanent).
 *
 * Honest limit (Task 3 review, the re-review's own comment nit): this
 * strips the RETURNED candidate only — the STORED copy under
 * `MONITOR_RUN_KEY` still carries the malformed `series` untouched, and
 * stays dirty until the next `saveMonitorRun` call overwrites it (a
 * successful save, or the sacrifice retry, both replace the whole key).
 * A reload before that next save re-reads the same malformed bytes and
 * strips them again, identically — cheap, not a leak, but worth naming
 * so a future reader doesn't assume this function repairs storage.
 */
// Task 2: EXPORTED for `handoffStore.ts` — see the note above `isPlainRecord`.
export function stripMalformedSeries(
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (hasValidSeries(value)) return value;
  // `_series` is discarded on purpose, same `^_` ignore-pattern idiom
  // `saveMonitorRun`'s own sacrifice retry already uses.
  const { series: _series, ...withoutSeries } = value;
  return withoutSeries;
}

// Task 2: EXPORTED for `handoffStore.ts` — see the note above `isPlainRecord`.
export function isMonitorRun(value: unknown): value is MonitorRun {
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
    // Phase LL Task 4: widened alongside the type — a record written by
    // ANY era's writer (a legacy `"interrupted"` row, or one of the four
    // new `CloseReason` values) still loads. Shallow membership check
    // only, same discipline as every other field this validator covers:
    // "shaped enough not to crash a reader that unconditionally
    // destructures `endedBy`," never a claim about which specific writer
    // produced it.
    (value.endedBy === undefined ||
      value.endedBy === "finished" ||
      value.endedBy === "rower" ||
      value.endedBy === "link-lost" ||
      value.endedBy === "program-failed" ||
      value.endedBy === "interrupted") &&
    // Phase LT spec 2, Task 2: same shallow "shaped enough not to crash an
    // unconditional destructure" treatment as `logSeed` above. No
    // unknown-key check anywhere in this validator (the `endedBy?`
    // precedent this comment's own header cites) — this positive
    // conjunction tolerates the new fields on records this task's own
    // code never wrote, same as any other additive field ever has.
    hasValidSeries(value) &&
    (value.seriesDropped === undefined || value.seriesDropped === true) &&
    (logSeed === undefined ||
      (isPlainRecord(logSeed) &&
        Array.isArray(logSeed.steps) &&
        isPlainRecord(logSeed.paces)))
  );
}

/** Persists the run. Best-effort, same rationale as `saveRun`: localStorage
 *  can throw (quota, private-mode Safari, disabled storage), and this never
 *  lets that escape uncaught. Unlike `saveRun`, this reports nothing back —
 *  the brief's own interface fixes `saveMonitorRun`'s return type at `void`.
 *
 *  **Hand-off store design spec §1, plan Task 3 — no longer the writer
 *  behind `createMonitorRun`/`recordActual`/`completeMonitorRun`/
 *  `appendSummaryObservations`.** Those four are pure now; the sole
 *  production committer is `useMonitorSession.ts`'s hook, through
 *  `handoffStore.ts`'s own `commit`/`retryDurable` (which duplicate this
 *  function's sacrifice ordering, ported verbatim — see
 *  `handoffStore.ts`'s `performDurableWrite`). This function stays exported
 *  and still backs every OTHER `MONITOR_RUN_KEY` writer this task's scope
 *  does not touch (`Today.tsx`/`LogSession.tsx`/`useStartWorkout.ts` — Tasks
 *  4/5's own store rewrites) — it has no different action to take on a
 *  failed write than a successful one regardless of caller: the in-memory
 *  session keeps running either way, only the localStorage mirror would be
 *  stale.
 *
 *  **THE SACRIFICE (Phase LT spec 2 §3, ruling 3's own caution section):**
 *  a ~720 KB worst-case series (ruling 2's cap) changes the odds of the
 *  ORIGINAL risk this comment already named — `monitorRun.ts:186-189` at
 *  brainstorm time was O(KB) and negligible; it is not anymore. On a thrown
 *  write WITH a `series` present, this catch retries ONCE, WITHOUT the
 *  series, stamping `seriesDropped: true` on the smaller record — the trace
 *  is what gets sacrificed, never the run. Honest claim, carried from the
 *  spec verbatim rather than oversold: the retried, smaller write can ALSO
 *  throw (a genuinely full origin, not merely a large record) — the run's
 *  odds on that second failure return to TODAY's odds (this function's own
 *  pre-existing best-effort swallow, unchanged below), they do not become a
 *  guarantee. A record with no `series` at all skips the retry outright —
 *  there is nothing smaller to try, and retrying an identical write would
 *  only throw the identical way. `void` unchanged either way; nothing here
 *  is a second source of truth for what got persisted — the CALLER's
 *  in-memory copy is what every downstream read this session sees, exactly
 *  as before this task. */
export function saveMonitorRun(r: MonitorRun): void {
  try {
    localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(r));
  } catch {
    if (r.series === undefined) return;
    try {
      // `_series` is discarded on purpose — the whole point of this
      // destructure is to drop it; the `^_` ignore pattern in this repo's
      // eslint config (`no-unused-vars`) is what allows the name.
      const { series: _series, ...withoutSeries } = r;
      const dropped: MonitorRun = { ...withoutSeries, seriesDropped: true };
      localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(dropped));
    } catch {
      // The retry ALSO failed: today's odds, nothing worse — a run this
      // size was never guaranteed to save even before this task existed.
    }
  }
}

/** Loads the run. Garbage JSON or an unrecognized version/shape reads back
 *  as `null` rather than crashing the caller — the same "Resilience #5"
 *  discipline `loadRun` documents on its own key.
 *
 *  **THIS READ DESTROYS NOTHING (changed at the hand-off store's final fix
 *  round, 2026-08-30; adversarial pass F-2).** Until then this function
 *  fell through to `clearMonitorRun()` on the malformed path — a READ that
 *  performed a `removeItem`. Hand-off store design spec §8 rules the
 *  opposite for the durable tier it now shares: "malformed durable bytes
 *  are never cleared during a read ... the store records the malformed
 *  state, treats the key as absent, receipts it, and clears at the next
 *  retire or accepted commit for the key." The store honoured that; this
 *  legacy loader did not, and `Today.tsx`'s mount effect calls it — so
 *  merely OPENING Today wiped bytes the store was deliberately preserving,
 *  falsifying §8 in the composed app (and falsifying Today's own
 *  "destroys nothing" comment). The self-heal bought nothing that the
 *  store's own deferred clear does not already provide, and no caller ever
 *  depended on it: `monitorRunState` (legacy, zero production callers) and
 *  `Today.tsx`'s guard both only ever read the RETURN VALUE, which is
 *  unchanged at `null`.
 *
 *  `clearMonitorRun` stays exported and unchanged — deliberate,
 *  authorized clears still route through it. */
export function loadMonitorRun(): MonitorRun | null {
  const raw = localStorage.getItem(MONITOR_RUN_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // LOW-3: strip a malformed `series` BEFORE validating, so its own
    // defect never costs the rest of an otherwise-good record
    // (`stripMalformedSeries`'s own doc comment carries the full
    // reasoning). A no-op (same reference back) whenever `series` is
    // already valid or absent, or `parsed` is not even a plain record —
    // `isMonitorRun` below still rejects those the same way it always has.
    const candidate = isPlainRecord(parsed)
      ? stripMalformedSeries(parsed)
      : parsed;
    if (isMonitorRun(candidate)) return candidate;
  } catch {
    // fall through: garbage JSON is handled the same as an unknown shape
  }
  // NO CLEAR HERE — see this function's own doc comment. The key is
  // reported ABSENT to the caller and left on disk for the store's §8
  // deferred clear (its next retire or accepted commit for the key).
  return null;
}

export function clearMonitorRun(): void {
  localStorage.removeItem(MONITOR_RUN_KEY);
}

/** Builds a fresh `MonitorRun` — the ONE place a
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
 *  run this function builds is stamped `v: 2` unconditionally.
 *
 *  **Hand-off store design spec §1/§2, plan Task 3 — PURE BUILDER, no
 *  longer a persister.** This function used to call `saveMonitorRun(run)`
 *  directly, making it the one writer this file's own header comment
 *  called "deliberately NOT idempotent-checked." That write is GONE: the
 *  create-commit (`handoffStore.commit(run.startedAt, null, run)`, spec §1)
 *  and its own defensive retire of whatever remains for the staged key
 *  (spec §5's "createMonitorRun defense" row) now happen at this
 *  function's one production caller, `useMonitorSession.ts`'s `handleFrame`
 *  "ready" branch — NOT here. The reason is architectural, not stylistic:
 *  `handoffStore.ts` imports `MONITOR_RUN_KEY`/`isMonitorRun` FROM this
 *  file (Task 2's own hydration path), so this file calling back INTO
 *  `handoffStore.ts` would be a circular import; the hook already imports
 *  both files, so it is the natural place for the commit to live. Nothing
 *  else changes: this still returns the SAME shape, and `clearRun()` still
 *  fires unconditionally — that half of the cross-clear rule is the OTHER
 *  coexistence mechanism (the phone-timer `SessionRun`), untouched by the
 *  hand-off store rewrite. */
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
  // Hand-off store design spec section 5, plan Task 5: this destroys the
  // phone-timer SessionRun unconditionally, same as before -- census note,
  // stated here so this destroyer has a bound authorization too, not new
  // machinery. Its authorization is the SAME guard stage as the monitor
  // side's own retire: connectGuardStage's first branch stages the
  // SessionRun ("in-progress"/"unlogged" on loadRun()), so the Connect
  // guard's Replace confirmation ("You have an unlogged session.
  // Connecting discards it." / "A session is in progress. Replace it?")
  // already covers what this line is about to remove -- the rower was
  // warned about THIS record before ever reaching the first real rowing
  // frame that runs this function.
  clearRun();
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
 * Appends one interval boundary's actual to a live run — the record-side
 * half of Task 4's run scoping (spec §4: "within an open run: actuals
 * accumulate ... the record is immutable afterwards"), and the function
 * 7B's event wiring appends through when it sees a `MonitorEvent` of kind
 * `intervalComplete`. PURE (hand-off store design spec §1, plan Task 3):
 * returns the new record; the hook is what commits it.
 *
 * **A CLOSED run is immutable — with ONE exception, the FINISH GRACE:
 * otherwise this returns it UNCHANGED.**
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
/**
 * RC-1 (storage-spine design spec §3): the pure sum both of `completeMonitorRun`'s
 * `endedBy === "finished"` branch and `recordActual`'s late-acceptance
 * branch (below) call, so a "finished" record's four fields are always the
 * SAME function of whatever `actuals` it has at write time, however many
 * times that happens to be recomputed.
 *
 * **EMPTY `actuals` returns nothing at all (final whole-branch review,
 * MEDIUM-1)** — this used to fall through to `[].reduce(..., 0) === 0` for
 * `workSeconds`/`workMeters`, and `[].every(...)` is vacuously `true`, so
 * the rest pair wrote real zeroes too: a naturally-finished run whose
 * finish grace never delivered a single boundary (`useMonitorSession.ts`'s
 * own comment names this exact hardware shape, "0 OF 1 INTERVALS
 * MEASURED") stored four honest-looking `0`s — indistinguishable from "we
 * measured a session that covered zero metres" — while
 * `summaryModel.monitorDistanceMeters`'s `> 0` rule renders the same
 * record as a dash. A record with nothing measured gets nothing stored,
 * the same "never estimated" bar the rest pair's own all-or-nothing rule
 * already applies to a PARTIAL measurement.
 *
 * `workSeconds`/`workMeters` are otherwise unconditional: `IntervalActual.
 * elapsedSeconds`/`distanceMeters` are REQUIRED fields
 * (`domain/monitor/types.ts`), present on every actual this driver has
 * ever produced (the synthesized-final fallback included —
 * `deriveFinalIntervalFromSummary`'s own doc comment: both are always
 * supplied, never omitted), so the work sum is always complete over
 * whatever non-empty `actuals` holds.
 *
 * **The fused DISPLAY total equals `workMeters + restMeters` for METRES
 * ONLY — corrected at the final whole-branch review, MEDIUM-2, which found
 * the ORIGINAL version of this paragraph asserting the same equality for
 * seconds too.** `summaryModel.ts`'s `monitorDistanceMeters` sums
 * `Σ(actual.distanceMeters + (actual.restDistanceMeters ?? 0))` — the
 * identical decomposition this function's `workMeters`/`restMeters` pair
 * computes, so the two really do agree whenever the rest pair exists.
 * `monitorTimeSeconds` does NOT mirror `workSeconds + restSeconds` the
 * same way: it calls `measuredSessionSeconds` (this file's own
 * `interruptedTotalSeconds`), which sums `Σ elapsedSeconds` plus, for
 * every actual with a real `index`, that interval's OWN `restSeconds` read
 * out of `program.intervals` — the PROGRAMMED rest, a fact about what the
 * rower was ASKED to do, never a wire reading. This function's own
 * `restSeconds` is the WIRE's 0x0037 rest reading, summed over every
 * actual unconditionally, with no `index` gate at all. The two are
 * different populations under the same English name (ROADMAP's RC-5 is
 * this exact contradiction's own row: DISTANCE and TIME already disagree
 * by design, and this pair inherits the same shape rather than closing
 * it) — concretely, they diverge whenever the FINAL interval's own 0x0037
 * rest reads a value other than its PROGRAMMED rest (RC-5's antagonist
 * pass CLOSED the earlier claim that this always means "reads 0" — the
 * exit-7 capture's own last boundary, seq 53, decodes 60s/95m of rest on
 * the FINAL interval, `docs/monitor/pm5-interface-notes.md` §26 — a
 * natural finish can leave a real trailing rest reading on the wire even
 * though no rest was actually taken after it), and whenever an actual's
 * `index` is `null` (contributes to the wire sum here, contributes
 * nothing to the programmed sum there). No
 * displayed number reads this function's fields this PR either way — see
 * the "screens do not change" pin — so this is a documentation
 * correction, not a behavior change.
 *
 * `restSeconds`/`restMeters` are NOT unconditional: `IntervalActual.
 * restSeconds`/`restDistanceMeters` are additive-optional (absent on the
 * synthesized-final fallback specifically — that path has no wire reading
 * for either, both fields' own doc comments), so a rest-bearing session
 * whose final interval fell back to synthesis would have one actual with
 * work data but no rest data. A PARTIAL sum over only the actuals that
 * have it would silently drop that one interval's real rest — indistinguishable
 * from "this interval genuinely had no rest," exactly the silent
 * under-count CLAUDE.md's recurring-failure list warns against, and the
 * opposite of the spec's own "never estimated" bar. So the rest PAIR is
 * all-or-nothing: every actual in the array carries both rest fields, or
 * neither `restSeconds` nor `restMeters` is written on the record at all
 * — never a number that looks complete but silently isn't.
 */
function computeWorkRestSums(actuals: readonly IntervalActual[]): {
  workSeconds?: number;
  workMeters?: number;
  restSeconds?: number;
  restMeters?: number;
} {
  if (actuals.length === 0) return {};
  const workSeconds = actuals.reduce((sum, a) => sum + a.elapsedSeconds, 0);
  const workMeters = actuals.reduce((sum, a) => sum + a.distanceMeters, 0);
  const restComplete = actuals.every(
    (a) => a.restSeconds !== undefined && a.restDistanceMeters !== undefined,
  );
  if (!restComplete) return { workSeconds, workMeters };
  // `?? 0` is defense-in-depth, not a reachable branch: `restComplete`
  // above already proved every actual's `restSeconds`/`restDistanceMeters`
  // is defined, so the fallback can never fire here — kept anyway so this
  // reduce doesn't silently start trusting a guarantee a future edit to
  // `restComplete` could quietly weaken.
  return {
    workSeconds,
    workMeters,
    restSeconds: actuals.reduce((sum, a) => sum + (a.restSeconds ?? 0), 0),
    restMeters: actuals.reduce(
      (sum, a) => sum + (a.restDistanceMeters ?? 0),
      0,
    ),
  };
}

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
  const wasClosed = run.completedAt !== null;
  if (wasClosed && !acceptableFinalBoundary(run, actual, opts)) return run;
  // Hand-off store design spec §3, plan Task 3 — THE PROVEN-ON-`main`
  // DEFECT'S OWN FIX, stated where it used to live. This function is now
  // PURE: it never persists, and its base is ALWAYS the CALLER's own `run`
  // argument — never a storage re-read. The late/closed finish-grace path
  // above used to rebuild its base from `stillLive(run.startedAt)`, a
  // fresh `loadMonitorRun()` call — which is exactly the defect: when the
  // live→closed write that PRECEDED this one had been denied (swallowed
  // by `saveMonitorRun`'s own best-effort catch), storage still held the
  // last successful write — a stale LIVE copy — and that stale copy became
  // this function's base, silently re-opening the record and truncating
  // its actuals (`completedAt` reset to `null`, `endedBy` gone, sums gone).
  // `stillLive` is DELETED (no callers remain — `appendSummaryObservations`
  // below is pure now too); the hook (`useMonitorSession.ts`'s sole-
  // committer discipline, spec §1) is what decides whether `run` itself is
  // safe to build on — a mid-run denial there simply means the hook's own
  // `runRef`/`lastAcceptedRevisionRef` never advanced past the last
  // ACCEPTED commit, so the caller's `run` argument here is, by
  // construction, the newest record this process has ever agreed to. No
  // second source of truth to disagree with it.
  const actuals = [...run.actuals, actual];
  const next: MonitorRun = {
    ...run,
    actuals,
    // RC-1 (storage-spine design spec §3): the finish-grace boundary
    // accepted above is the ONLY way `actuals` can still grow after a
    // "finished" close — re-running `computeWorkRestSums` here is what
    // keeps `workSeconds`/`workMeters`/`restSeconds`/`restMeters` correct
    // for that ordering (the common one — `useMonitorSession.ts`'s own
    // `openHandoffHold` comment calls the split-already-in-hand order "the
    // desktop order," the rarer exception) rather than permanently
    // reflecting whatever `actuals` held at `completeMonitorRun`'s own,
    // earlier call. A closed run whose `endedBy` is not `"finished"` never
    // had sums computed to begin with (that function's own gate below) and
    // none are added here either — only `"finished"` records ever carry
    // these four fields.
    ...(wasClosed && run.endedBy === "finished"
      ? computeWorkRestSums(actuals)
      : {}),
  };
  return next;
}

/**
 * Closes a live run — the COMPLETION WRITER `recordActual`'s own A2 note
 * has been promising since Phase 7A ("whatever turns a `workoutComplete`/
 * `terminated` event into a finished record"), landing here in the task
 * that finally has a caller for it (7B Task 4, `useMonitorSession`).
 *
 * THREE fields move, together and only here (Phase LL Task 4 widens this
 * from two): `completedAt` (the "live" vs "finished but not yet logged"
 * boundary `MonitorRun.completedAt`'s own comment draws — after this the
 * record is immutable, and `recordActual` above refuses every later
 * boundary), `terminated` (HOW THE MACHINE reported it, `MonitorRun.
 * terminated`'s own comment: 7C has to tell "logged 12 of 12" from
 * "abandoned at 8"), and now `endedBy` (HOW THE RECORD reports it —
 * `CloseReason`'s own doc comment names the four values and their one
 * writer each). `args.endedBy` is REQUIRED, not optional: a close reason
 * that could be silently omitted would reintroduce exactly the
 * conflation §4 exists to fix (the two axes are independent — `finished`
 * is the only `CloseReason` that pairs with `terminated: false`; every
 * other close reason pairs with `terminated: true`, and this function
 * trusts its caller for that pairing rather than re-deriving it, the
 * same posture `terminated` itself has always had here). One call rather
 * than three setters precisely because a record that says "finished"
 * without saying how, or why, is the shape 7C (and now the server row)
 * cannot read.
 *
 * **Idempotent by the same rule `recordActual` uses**: an already-closed
 * run is returned UNCHANGED and nothing is persisted — a second terminal
 * event, an End press racing the machine's own `workoutComplete`, or a
 * P3b close followed by the terminal event that was already in flight
 * must never re-stamp a later `completedAt` over the real one, nor flip
 * `terminated`/`endedBy` after the fact. The hook has its own guard in
 * front of this (it ignores terminal events for a run it already closed,
 * the spec's P3b pin); this one is independent, for the same reason
 * `recordActual`'s is: the record outlives the driver and the hook that
 * wrote it.
 *
 * Returns a NEW record rather than mutating, matching `recordActual`.
 *
 * **Hand-off store design spec §1, plan Task 3 — PURE.** No longer calls
 * `saveMonitorRun` itself: this is one of the three named writer gates
 * (`recordActual`, this function, `appendSummaryObservations`) that
 * return `next` (or the same reference on decline) and never persist —
 * `useMonitorSession.ts`'s hook is the sole committer, applying the result
 * through `handoffStore.commit` with its own `lastAcceptedRevisionRef`
 * discipline (spec §1: "a refusal can therefore never diverge producer
 * from store").
 */
export function completeMonitorRun(
  run: MonitorRun,
  args: { terminated: boolean; endedBy: CloseReason },
  now: Date,
): MonitorRun {
  if (run.completedAt !== null) return run;
  const next: MonitorRun = {
    ...run,
    completedAt: now.toISOString(),
    terminated: args.terminated,
    endedBy: args.endedBy,
    // RC-1 (storage-spine design spec §3): computed ONCE here, at natural
    // close, from whatever `actuals` this run holds RIGHT NOW — which is
    // already complete when the finish-grace boundary arrived before the
    // machine's own finished tick (`openHandoffHold`'s own "the desktop
    // order" case), and is re-summed a second time by `recordActual`'s own
    // late-acceptance branch above when it doesn't. Never computed for any
    // other `endedBy` — a terminate/link-lost/program-failed close's
    // actuals are the ones ROADMAP's RC-1 row calls incomplete by
    // construction, and this spec's bar is "never estimated."
    ...(args.endedBy === "finished" ? computeWorkRestSums(run.actuals) : {}),
  };
  return next;
}

/**
 * The shared writer behind `completeInterruptedRun` and
 * `completeContinuityReset` below: closes a LIVE run through a door that
 * has NO `workoutComplete`/`terminated` event of its own to report
 * (`completeMonitorRun` above is the wire-event path; every caller here
 * is the other kind — nothing on the wire is ever going to say "finished"
 * for this run again). Stamps `completedAt` from `now` and the caller's
 * own `endedBy` together, the same "two fields move, together and only
 * here" discipline `completeMonitorRun`'s own doc comment states for its
 * pair.
 *
 * **`terminated` is deliberately left untouched**, for both callers alike.
 * It answers a DIFFERENT question — HOW THE MACHINE itself reported the
 * end (`WORKOUTEND` vs `TERMINATE`, `MonitorRun.terminated`'s own
 * comment) — and neither caller has such a report to make. Leaving it at
 * whatever it already was (always `false` for a still-live run, since
 * `completeMonitorRun` is the only writer that ever sets it `true`, and
 * that only fires on an event this path by definition never received)
 * keeps `terminated` meaning "what the machine said," full stop, with
 * `endedBy` free to carry each door's own orthogonal story.
 *
 * Idempotent by the same rule `completeMonitorRun` uses: an already-closed
 * record is returned UNCHANGED and nothing is persisted.
 *
 * **Hand-off store design spec §1, plan Task 3 — PURE, widened alongside
 * `completeMonitorRun`/`recordActual`/`appendSummaryObservations`.** No
 * longer calls `saveMonitorRun` — persisting is its callers' job now.
 * `completeContinuityReset`'s one caller (`useMonitorSession.ts`'s own
 * continuity-reset branch) commits through the hook's own
 * `applyProducerCommit` discipline; `completeInterruptedRun`'s one caller
 * (`Today.tsx`'s `UnloggedMonitorRow`) commits through the store as well —
 * it is spec §1's named SECOND committer (`handleLogIt`, an interrupted
 * session's close for a key no hook can hold). The STOPGAP sentence that
 * used to sit here — "still calls `saveMonitorRun` directly ... Task 4
 * owns Today.tsx's full store rewrite" — described the tree between Tasks
 * 3 and 4 and was stale from the moment Task 4 landed (whole-branch
 * review, LOW-1).
 */
function completeWithoutWireEvidence(
  run: MonitorRun,
  now: Date,
  endedBy: "interrupted" | "link-lost",
): MonitorRun {
  if (run.completedAt !== null) return run;
  const next: MonitorRun = {
    ...run,
    completedAt: now.toISOString(),
    endedBy,
  };
  return next;
}

/**
 * F6's own door: closes a LIVE run the rower is ending through Today's row
 * — the phone lost the machine, or the rower simply walked away.
 * `endedBy: "interrupted"` — ABSENCE of a story, not a cause (see
 * `MonitorRun.endedBy`'s own doc comment on the distinction from every
 * other `CloseReason`).
 *
 * The check reads the caller's in-memory argument, not storage, so the
 * idempotence guarantee (`completeWithoutWireEvidence`'s own doc comment)
 * is single-tab: Today has no live monitor hook, so within a tab the
 * record it captured at mount cannot have gained a machine completion
 * since. A second tab driving a live session is the pre-existing
 * shared-storage hazard family, same premise the Connect door's dead-run
 * rule rests on.
 */
export function completeInterruptedRun(run: MonitorRun, now: Date): MonitorRun {
  return completeWithoutWireEvidence(run, now, "interrupted");
}

/**
 * Phase LL Task 4's continuity door (design spec §4; RULED at the task's
 * own review, F1/I1 — corrects the first implementation, which reused
 * `completeInterruptedRun` and stamped `"interrupted"` here). A continuity
 * reset is the OPPOSITE of an absent story: `useMonitorSession.ts`'s
 * `applyContinuityCheck` only reaches this function once a stream the
 * link already marked suspect has gone on to MEASURABLY violate
 * continuity (`continuity.ts`'s own `check`) — two independent pieces of
 * positive evidence that the link is what broke this run, not silence
 * about a cause. `endedBy: "link-lost"` says exactly that, the same value
 * the End-button-with-link-gone path already writes: both are "the link
 * is why this record stops here," learned two different ways.
 */
export function completeContinuityReset(
  run: MonitorRun,
  now: Date,
): MonitorRun {
  return completeWithoutWireEvidence(run, now, "link-lost");
}

/**
 * PR 1's post-close observation writer (design spec §2, widened RC-3 Task
 * 2): appends the burst's observations — 0x0039's work-only totals, its
 * other nine fields (`MachineSummaryDetail`), and 0x003F's raw
 * verification-hash bytes when the burst produced one — write-once and
 * identity-checked against its OWN `run` argument, and mute on every
 * mismatch rather than throwing.
 *
 * **Hand-off store design spec §1/§3, plan Task 3 — PURE, base is the
 * CALLER's own current record.** This function used to re-read storage
 * fresh on every call (`stillLive`, since DELETED — no callers remain),
 * because a late burst can arrive up to `BURST_LINGER_MS` after
 * `LogSession`/`Today` have already unmounted and the caller's own copy
 * could no longer be trusted. That re-read is exactly the shape of the §3
 * defect `recordActual` no longer has: it traded "trust the caller" for
 * "trust whatever storage says right now," which is wrong precisely when
 * storage is stale (a denied write). Under this design the caller —
 * `useMonitorSession.ts`'s hook, the sole committer — always holds the
 * newest record this process has ever agreed to (`runRef.current`, kept
 * in lockstep with `lastAcceptedRevisionRef`), so THAT is what this
 * function builds on. The three FORMER decline reasons that depended on a
 * storage re-read are gone with it:
 *
 *   - "`MONITOR_RUN_KEY` is empty" (the rower already logged/discarded) —
 *     now the HOOK's own `commit` call for this write is refused with
 *     `reason: "retired"` (the store's tombstone, spec §1) if that
 *     happened; this function has no notion of storage at all anymore.
 *   - "the stored run's `startedAt` doesn't match" (a second `program()`
 *     re-arm) — the CALLER passes `run` directly now; a caller holding the
 *     wrong run's identity is the caller's own bug, not something this
 *     function can detect by re-reading a key it no longer touches.
 *
 * The remaining two declines are genuine PROPERTIES of `run` itself, not
 * storage facts, and stay exactly as before:
 *
 *   1. `run.completedAt === null` — still live; no completion writer has
 *      run yet.
 *   2. `run.endedBy` is neither `"finished"` nor `"rower"` (the complement
 *      of link-lost/program-failed, RC-3 Task 2, spec §1 gate 1: `"rower"`
 *      covers BOTH venues — Menu-at-the-erg and the app's End button,
 *      `CloseReason`'s own doc comment — and the machine speaks the
 *      identical burst for a Menu terminate, notes §25 — and this stays
 *      correct if W8's inactivity auto-terminate lands in `"rower"`
 *      later). A link-lost or program-failed close's burst status is
 *      still UNKNOWN (§1) and still declines.
 *   3. `run.summaryTotals` already exists — write-once: a second burst
 *      arriving for a record already carrying observations (the two
 *      independent triggers in `driver.ts`'s `reconcileSummary`, or a
 *      retried delivery) must never overwrite the first. This guard now
 *      reads whatever `run` the CALLER passed — the hook is expected to
 *      pass its own latest `runRef.current`, which already reflects an
 *      earlier accepted write of this same field; a caller that instead
 *      passed a stale pre-write copy would see this guard miss, which is
 *      why the hook's own committer discipline (never diverging `runRef`
 *      from an accepted commit) is what keeps this safe in practice, not
 *      a defensive re-check inside this function.
 *
 * On the one valid case, writes `summaryTotals` and `summaryDetail`
 * (always, in the SAME write) and `verificationBytes` (only when the
 * caller has one — a burst that never produced 0x003F still folds its
 * totals and detail alone) — every other field on the record, byte for
 * byte, is exactly what was already there. `isMonitorRun`'s own
 * positive-conjunction, no-unknown-key design (this file's comment above
 * `isMonitorRun`) is what makes that safe without a validator change or a
 * `v` bump: a record carrying any of these three fields still round-trips
 * through `loadMonitorRun` on any build, new or old.
 *
 * Returns what it computed (the new record), or `null` when it declined —
 * matching `recordActual`/`completeMonitorRun`'s own "new record back,
 * caller's copy untouched" idiom, except here there is no caller copy to
 * return unchanged: a decline has nothing worth handing back at all.
 */
export function appendSummaryObservations(
  run: MonitorRun,
  observations: {
    totals: { workElapsedSeconds: number; workDistanceMeters: number };
    detail: MachineSummaryDetail;
    verificationBytes?: readonly number[];
  },
): MonitorRun | null {
  if (run.completedAt === null) return null;
  // Burst-eligible closes only: the complement of link-lost/program-failed.
  // "rower" covers BOTH venues (Menu-at-the-erg and the app's End button,
  // CloseReason's own doc) and stays correct if W8's inactivity
  // auto-terminate lands in "rower" later (spec §1 gate 1).
  if (run.endedBy !== "finished" && run.endedBy !== "rower") return null;
  if (run.summaryTotals !== undefined) return null;
  const next: MonitorRun = {
    ...run,
    summaryTotals: observations.totals,
    summaryDetail: observations.detail,
    ...(observations.verificationBytes !== undefined
      ? { verificationBytes: observations.verificationBytes }
      : {}),
  };
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

/**
 * Neutral alias for the formula above (Phase PW Task 4 review, finding 3):
 * R-D's own text generalizes this exact "work + programmed rest for
 * completed intervals" rule from "the interrupted branch" to "every
 * monitor session's TIME" — `summaryModel.ts`'s `buildMonitorModel` needed
 * the identical formula for a run that finished normally, not just one
 * closed through the interrupted door, and a second hand-copy would have
 * meant this formula's own OPEN hardware finding (F-1, the walk sheet's
 * unreproduced "6 MIN where the wire computes 5" reading —
 * `docs/monitor/sessions/walk-2026-08-17/README.md`) landing its eventual
 * fix in only one of the two places that need it. `interruptedTotalSeconds`
 * stays the primary export (every existing caller/test keeps its name);
 * this is the same function object under the name a caller with no
 * "interrupted" run in hand should reach for instead. */
export const measuredSessionSeconds = interruptedTotalSeconds;

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

// Task 6 close-out ruling (2026-08-30, hand-off store plan): `monitorRunState`
// and `anyLiveSession` below are LEGACY, WITH ZERO PRODUCTION CALLERS as of
// this branch (Task 3's review, finding M-2, confirmed again at Task 5 and
// re-confirmed here via `grep -rn "anyLiveSession(" app/src` — the only
// non-comment call sites are `anyLiveSession`'s own internal call to
// `monitorRunState` and `monitorRun.test.ts`'s own truth-table suite).
// NOT deleted: `anyLiveSession()`'s own doc comment, `connectGuardStage`'s
// doc comment directly below, `ConnectAction.tsx`, `useMonitorSession.ts`,
// `Today.tsx`, `useStartWorkout.ts`, `WorkoutDetail.test.tsx` and
// `todayGuard.pin.test.ts` all cite this function BY NAME as the documented
// anti-pattern a real, previously-shipped bug (ROADMAP M-1, the F5 data-loss
// class) warns every future guard away from — deleting the function orphans
// that whole cross-file contrast and is exactly the "unrelated churn" the
// close-out brief's own item 4 says to avoid dragging in. Left in place,
// unchanged, reading the durable tier only (§8's hydration model does not
// apply to it — nothing here is a store consumer).
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
 * (`WorkoutDetail.tsx` and `you/RetestShortcut`-style detail entries, via
 * `useStartWorkout.ts`; the old no-baseline BaselineCard was one until
 * Phase BL PR C replaced it with the pure-navigation doors card).
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
 *  Start's door used to branch its `MonitorRun` case on `completedAt` too,
 *  staging `"in-progress"` for a live-looking record — the close-out's
 *  queue item 3 shed that, on the identical reasoning this function's own
 *  comment already gives for the Connect door. NOT the same way its
 *  `SessionRun` case still does, though: at the Start door, the
 *  `SessionRun` branch only ever distinguishes completed ("unlogged") from
 *  everything else, never `"in-progress"` — that door's own
 *  `"in-progress"` for a genuinely live phone-timer session is produced by
 *  a DIFFERENT branch entirely, the started-but-unfinished `SessionDraft`
 *  check (`session/useStartWorkout.ts`'s `handleStart`, `startedAt !==
 *  null`). Only THIS function's own `SessionRun` check (below) branches on
 *  live-vs-finished to produce `"in-progress"` directly. */
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
 * so `"in-progress"` stays true there.
 *
 * **Hand-off store design spec section 5, plan Task 5 -- the `MonitorRun`
 * check now takes its answer as a PARAMETER, never `loadMonitorRun()`
 * directly.** The P1-1 hole this closes: `loadMonitorRun()` reads the
 * DURABLE tier only, so a record whose durable write failed (memory-only
 * -- exactly what `Today.tsx`, Task 4, now renders a row for) was
 * invisible here, while Today's own store-backed read could already see
 * it. The caller (`ConnectAction.tsx`) reads `currentUnretired()` and
 * passes whether it found an entry -- this function cannot call the store
 * itself: `handoffStore.ts` imports `MONITOR_RUN_KEY`/`isMonitorRun` FROM
 * this file (Task 2's own hydration path), so the reverse import would be
 * circular, the identical constraint `createMonitorRun`'s own doc comment
 * states for the create-commit. `hasUnretiredMonitorRun` stands for "does
 * the store currently hold an unretired `MonitorRun`" -- a boolean, not
 * the entry itself, because this function only ever needs to know WHETHER
 * to stage, never WHICH revision; the caller keeps the entry for its own
 * later retire (spec section 5's "armed acceptance" row). */
export function connectGuardStage(
  hasUnretiredMonitorRun: boolean,
): ConnectGuardStage {
  const run = loadRun();
  if (run !== null) {
    return run.completedAt === null ? "in-progress" : "unlogged";
  }
  if (hasUnretiredMonitorRun) {
    // A MonitorRun visible at a Connect door is dead: the connected
    // session lives on WorkoutDetail's surface and reload/navigation
    // tears it down. "In progress" would assert machine state we do
    // not have (spec 2b, exit criterion 5).
    return "unlogged";
  }
  return null;
}
