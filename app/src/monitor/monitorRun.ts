// The monitor-driven session record (Phase 7A Task 5, design spec's
// coexistence obligation): the PM5-side counterpart to `session/run.ts`'s
// `SessionRun` — a SEPARATE versioned localStorage record for a workout
// being run by a connected monitor rather than the phone's own timer.
// `session/run.ts`'s own header comment states the reason two records
// exist rather than one shared shape: "the run is the engine's" — a
// `MonitorRun` has no `EnginePhase[]`/`index`/`pausedAt` at all (the PM5
// itself owns pacing; nothing here ticks a phase forward), so folding it
// into `SessionRun` would mean every phone-timer reader learning to ignore
// fields that never apply to it.
//
// **Phase MD PR 1: this file holds the record type and its PURE builders,
// and no storage call at all.** The persistence half — the key, the
// validators (`isMonitorRun`, `stripMalformedSeries`, `hasValidSeries`),
// the raw read `loadMonitorRun`, and `connectGuardStage` — moved into
// `monitor/handoffStore.ts`, the one module that writes the durable key
// (spec `docs/superpowers/specs/2026-09-12-stored-run-module-design.md`
// §4). The dependency now runs one way: persistence imports this type.
// `app/scripts/handoffStoreBoundary.test.ts` asserts this file holds ZERO
// storage references.
//
// `session/run.ts`'s own 6B/6C comments carry over unchanged here: the
// `completedAt: null` vs `completedAt: <iso>` boundary is "live" vs
// "finished but not yet logged/consumed" (7C's eventual monitor-side log
// path, not built this phase); an unrecognized `v` or a malformed shape
// reads as absent rather than crashing whatever screen reads it first
// (`loadRun`'s own "Resilience #5" — except that the monitor side's reader,
// `handoffStore.ts`'s `loadMonitorRun`, destroys nothing on that path: it
// returns `null` and leaves the bytes alone).

import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { IntervalActual } from "../../domain/monitor/types.js";
import type { LogSeed } from "../session/logDraft";
import type { SeriesData } from "./seriesRecorder";
import { clearRun } from "../session/run";

/**
 * Phase LL Task 4 (design spec §4's writer table, the anchor pass's own
 * verification "writer by writer"): originally the four close reasons a
 * WIRE EVENT (or the P3b program-failure path) could honestly produce
 * (Wave F PR 1 Task 2 added a fifth, `"program-dropped"` — see below),
 * excluding `"interrupted"` — that value has exactly one writer,
 * `completeInterruptedRun` below, and is never passed through this type
 * (F6's door has no wire event to report; "closed later with no evidence"
 * is a different shape of honesty than the rest). `completeMonitorRun`'s
 * `args.endedBy` takes exactly this type, which is what makes "every
 * writer sets its value" a compiler-checked fact rather than a convention:
 * there is no way to close a run through that function without naming one
 * of these five.
 *
 * `"link-lost"` gains a SECOND producer at Task 4's own review (F1/I1):
 * `completeContinuityReset` below writes it too, for a continuity reset —
 * not through `completeMonitorRun` (a reset has no wire event to report
 * either), but the VALUE is the same member of this same type: both
 * producers are "the link is why this record stops here," learned two
 * different ways. `MonitorRun.endedBy`'s own doc comment has the full
 * writer table, all six.
 *
 * Wave F PR 1 (lifecycle design spec §1, "The new close reason", TRIAD):
 * `"program-dropped"` is a fifth member, not a reuse of
 * `"program-failed"` — the two are behaviourally identical to every
 * client consumer today (each is a `"finished"`-only or
 * `"finished"`/`"rower"`-only allowlist, so a fifth value fails closed by
 * design), but `"program-failed"` means *our* `program()` call failed
 * while a live drop is the *machine* discarding a program that already
 * succeeded — and with the ring unrecoverable (§0.3), `endedBy` is the
 * only durable field a future occurrence will leave behind. Conflating
 * the two would make a future count of live drops impossible. This task
 * widened the STORED SHAPE only (client union, server enum/union/
 * validator, migration); the honest wire-event producer that actually
 * writes this value through `completeMonitorRun` landed in Task 2 of this
 * same PR (spec §1's "Mechanism" section — `useMonitorSession.ts`'s live
 * `programDropped` arm calls `closeRecord(true, "program-dropped")`), so
 * the type no longer permits a value nothing emits.
 */
export type CloseReason =
  "finished" | "rower" | "link-lost" | "program-failed" | "program-dropped";

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
  /** Phase LP (spec 2026-09-06-logbook-parity §2.2): 0x003A's four
   *  logbook fields, verbatim — Total Calories, Watts, Avg Calories
   *  (cal/hr) and Total Rest Distance. Additive-optional: absent when the
   *  additional summary did not arrive inside the summary burst (the
   *  driver logs `summary-1-missing` and the screen renders a dash), and
   *  absent on every record persisted before this field existed. `0` is a
   *  value. `avgWatts`/`avgCalPerHour` are the PM5's OWN and are stored as
   *  provenance; the screen shows the logbook's derivation
   *  (`src/session/logbookDerived.ts`). These ride `machine_summary`
   *  jsonb — no column, no migration. */
  totalCalories?: number;
  avgWatts?: number;
  avgCalPerHour?: number;
  totalRestMeters?: number;
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
  // (written before this task) loads as it always has — see
  // `handoffStore.ts`'s `isMonitorRun` and `loadMonitorRun` — it just never
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
  /** What KIND of run this is (Phase JR PR 1, spec rev 4's stored shape).
   *
   *  ADDITIVE and OPTIONAL, on an existing v2 record and with **no `v`
   *  bump**: `handoffStore.ts`'s `isMonitorRun` is a positive conjunction
   *  with no unknown-key check (it says so itself), and that module persists the
   *  whole object with `JSON.stringify` and re-admits through that same
   *  validator — so an older build reading a newer record simply ignores
   *  this, and a newer build reading an older one sees `undefined`, which
   *  is "a programmed run" by construction.
   *
   *  **Be honest about what this buys in PR 1: nothing yet.** There is no
   *  writer and no reader until PR 2 builds `/justrow`. It lands here
   *  because PR 1 is the TRIAD pass on this record's shape, and adding a
   *  stored field is exactly what that pass exists to scrutinise —
   *  splitting it into PR 2 would move a stored-shape change out of the
   *  review that is meant to cover it. */
  mode?: "justrow";
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
   *     than an observation — walk question W8, NARROWED not closed on
   *     2026-08-31: no auto-TERMINATE arrived within 896.8 s on an
   *     unprogrammed Just Row, one device, one run, with the capture
   *     ended by the operator rather than by the monitor
   *     (`docs/monitor/sessions/walk-2026-08-31-justrow/`). Documentation
   *     is silent, not agreeing: CSAFE rev 0.31 Appendix E's JustRow
   *     sentence is CONDITIONAL ("…that IS TERMINATED prior to reaching
   *     its defined end") and documents where a terminated JustRow goes,
   *     so it enumerates no exits and says nothing about the inactivity
   *     power-off concept2.com documents separately. "None within
   *     896.8 s" is not "never", and a PROGRAMMED workout was not tested
   *     at all. The assertion stays open for both cases.
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
   *   - `"program-dropped"` — the erg discarded a program that had
   *     already succeeded, detected mid-row by RC-37's armed-watch (Wave
   *     F PR 1, lifecycle spec §1). Distinct from `"program-failed"`,
   *     which is OUR `program()` call failing (P3b).
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
   * Set the one time a durable write WITH a series present threw and the
   * retry-without-series inside the writer's own catch succeeded —
   * `handoffStore.ts`'s `performDurableWrite` today, the deleted
   * `saveMonitorRun` before Phase MD PR 1
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
   * summary in hand yet. `handoffStore.ts`'s `isMonitorRun` deliberately
   * gains no check
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
   * Door spec (2026-09-02) §5.1 — THE FIRST OF THE TWO STORED SHAPES this
   * change touches (the second is the posted `LogStep`). OUR reading of
   * the interval that was still in flight when this run closed short: the
   * last rowing frame's own 0x0031 `distanceMeters`/`elapsedSeconds`, plus
   * the program index they belong to. Never an `IntervalActual` (§5.2
   * I-B2), so `measuredIntervalCount` does not move and "N intervals kept"
   * is unchanged.
   *
   * Additive-optional with NO `v` bump, the same never-migrate contract
   * `endedBy`/`series`/`summaryTotals` above already established:
   * `handoffStore.ts`'s `isMonitorRun` is a positive conjunction with no
   * unknown-key check
   * (its own comment says so), so an older build reading a newer record
   * ignores this and a newer build reading an older one sees `undefined`.
   *
   * Written ONCE, at close, by `withPartial` below — never by
   * `completeMonitorRun` (which is the wire-event closer and has no frame
   * in hand). `withPartial` itself carries no `completedAt` guard of its
   * own (fix-round review, finding 5) — "never after `completedAt` is set"
   * is an invariant its ONE caller owns: `closeRecord`
   * (`useMonitorSession.ts`, Task 3) reads a partial before it calls the
   * completion writer, and `closeRecord` already returns early on
   * `completedAt !== null` ("A partial cannot be written twice", door spec
   * §5.2) — so no caller this codebase has ever reaches `withPartial` with
   * an already-closed run in the first place.
   */
  partial?: { intervalIndex: number; meters: number; seconds: number };
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
   * never written any other way. `handoffStore.ts`'s `isMonitorRun`
   * deliberately gains
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
   * `endedBy` (`"rower"`/`"link-lost"`/`"program-failed"`/
   * `"program-dropped"`): a terminate or link-lost close's actuals are
   * exactly the ones RC-1's own ROADMAP row calls incomplete by
   * construction (the trailing-rest 0x0037 an END
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
   * number whether or not a record carries this split. `handoffStore.ts`'s
   * `isMonitorRun` gains no check for any of the four, same reasoning
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
// never reads `type` on the loaded PROGRAM at all — it takes warm-up-ness
// from `logSeed.steps[i].kind` instead, behind an explicit cast since door
// PR A (spec §4 rider 2) narrowed that union to the literal `"work"` while
// KEEPING the legacy read. The other production consumer of the same
// field, `session/summaryModel.ts`'s `warmupIndex`, is a SEPARATE
// mechanism that likewise reads `run.logSeed` directly and never touches
// `run.program` or `ProgramInterval.type`.
//
// **So the invariant to keep is "no reader of a LOADED program consults
// `ProgramInterval.type`", not "the stored shape is current."** Adding
// such a reader — retiring `LogSeed.kind` in favour of `type`, say, which
// `logDraft.ts`'s own comment contemplates — reintroduces the miscount
// this wave exists to fix, on the records of the rowers most likely to be
// mid-session. Do that only together with the version bump or the
// migration, and price the loss above first.

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
 *  by design and it is why `handoffStore.ts`'s `connectGuardStage()`
 *  exists: the ONLY
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
 *  retires the `MonitorRun` through the hand-off store for the mirrored
 *  reason (before Phase MD PR 1 it called the deleted `clearMonitorRun`).
 *  See `session/run.ts`'s
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
 *  "ready" branch — NOT here. The reason was architectural, not stylistic:
 *  `handoffStore.ts` used to import `MONITOR_RUN_KEY`/`isMonitorRun` FROM
 *  this file (Task 2's own hydration path), so this file calling back INTO
 *  `handoffStore.ts` would have been a circular import; the hook already
 *  imports both files, so it is the natural place for the commit to live.
 *  **Phase MD PR 1 reversed that import direction** — the validators and
 *  the key now live in `handoffStore.ts`, which imports only the TYPE from
 *  here — so the cycle no longer exists; the commit stays at the hook
 *  because the hook is the sole committer (spec §1), not because of the
 *  cycle. Nothing
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
    /** Phase JR PR 2: `"justrow"` for a row the rower started on the machine
     *  itself. OMITTED, never `undefined` explicitly, for an ordinary
     *  programmed session — `mode` is optional on the record so that every
     *  run written before this phase reads back unchanged, and writing the
     *  key with an undefined value would put it in the JSON as `null` on
     *  some serializers and defeat that. */
    mode?: "justrow";
  },
  now: Date,
): MonitorRun {
  const run: MonitorRun = {
    v: 2,
    workoutId: args.workoutId,
    title: args.title,
    program: args.program,
    logSeed: args.logSeed,
    ...(args.mode === undefined ? {} : { mode: args.mode }),
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
 * `MonitorRun.completedAt`'s own comment draws; the private
 * `monitorRunState` that used to key off it was deleted with
 * `anyLiveSession` in Phase MD PR 1, spec §7). The driver's own run scoping
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
 * same way: it calls this file's own `measuredSessionSeconds`, which sums
 * `Σ elapsedSeconds` plus, for
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
  // fresh `loadMonitorRun()` call (that reader lives in `handoffStore.ts`
  // since Phase MD PR 1) — which is exactly the defect: when the
  // live→closed write that PRECEDED this one had been denied (swallowed
  // by the then-current `saveMonitorRun`'s best-effort catch, since
  // deleted), storage still held the
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
 * `CloseReason`'s own doc comment names the five values and their one
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
 * the since-deleted `saveMonitorRun`: this is one of the three named writer gates
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
    // other `endedBy` — a terminate/link-lost/program-failed/
    // program-dropped close's actuals are the ones ROADMAP's RC-1 row
    // calls incomplete by construction, and this spec's bar is "never
    // estimated."
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
 * longer calls the since-deleted `saveMonitorRun` — persisting is its
 * callers' job now.
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

/** Door spec (2026-09-02) §5.2 I-B1 — the FOUR close reasons that WRITE
 *  a partial, as a value-equality ALLOWLIST. Deliberately NOT
 *  `endedBy !== "finished"`: `withPartial`'s input is
 *  `CloseReason | "interrupted"`, and a negation would admit
 *  `"interrupted"` — §5.3's "Today's unlogged row writes none".
 *
 *  This is `storedSummary.ts`'s `PARTIAL_CLOSE_REASONS` MINUS
 *  `"interrupted"`, by design, and it is a second local declaration
 *  rather than an import ON PURPOSE: importing that const here closes a
 *  runtime cycle (`monitorRun` -> `storedSummary` -> `summaryModel` ->
 *  `monitorRun`, the last hop a VALUE import of
 *  `measuredSessionSeconds`). If a sixth close reason is ever added,
 *  BOTH lists are edited; the render list keeps `"interrupted"` and this
 *  one never gains it. */
const PARTIAL_WRITE_REASONS = [
  "rower",
  "link-lost",
  "program-dropped",
  "program-failed",
] as const;

/**
 * Door spec (2026-09-02) §5.2 — the in-flight reading's gate, as ONE pure
 * function so both close sites (`useMonitorSession.ts`'s `closeRecord` and
 * its continuity-reset commit) apply the identical rule rather than two
 * copies of it.
 *
 * - **I-B1** — banked only on the FOUR wire-close reasons, as an
 *   ALLOWLIST (`PARTIAL_WRITE_REASONS` above), never as
 *   `endedBy !== "finished"`: this function's parameter type also admits
 *   `"interrupted"`, and §5.3 says an interrupted close writes none. Tier
 *   B2 (`storedSummary.ts`'s `isReconstructableClose`) therefore never
 *   sees a partial and its GATED population stays provably historical.
 * - **I-B3** — the caller passes `null` once the in-flight interval's WORK
 *   BOUT has ended; this function does not re-derive that from timing.
 * - **I-B6** — never for an interval that already carries an
 *   `IntervalActual`, checked against the RECORD, never against boundary
 *   timing: `MonitorFrame.intervalIndex` lags the machine's own interval
 *   reset by up to 810 ms
 *   (`walk-2026-08-16/session-1-keystone-2x250r0.jsonl`), so a rowing
 *   frame can carry the index of an interval whose actual is already
 *   banked. Without this check a close in that window writes
 *   `partialMeters: 0` beside `actualMeters: 250`.
 *
 * Returns its input unchanged when any gate refuses, so a caller can hand
 * the result straight on without an identity check of its own.
 *
 * THERE IS NO FLOOR, AND THAT IS A RULING, NOT AN OVERSIGHT (controller,
 * 2026-09-02; recorded here at the site because a ruling that creates an
 * inconsistency with an adjacent shipped policy belongs beside the policy,
 * not in a PR body — PM final gate, 2026-09-03). A `rowing` frame carrying
 * `d=0` is in the committed corpus, so `{ meters: 0, seconds: 0 }` is a
 * REAL reading; it is written here and rendered as `0 m · 0:00`.
 *
 * ITS NEIGHBOUR POLICY IS THE OPPOSITE, DELIBERATELY.
 * `summaryModel.ts`'s `MIN_MEASURABLE_ELAPSED_SECONDS` treats a sub-floor
 * MEASURED reading as though nothing was measured at all, because a
 * mis-tapped stopwatch or an unsettled boundary read is noise that would
 * drag a hero.
 * The two rules disagree because "absence over invention" cuts the other
 * way here: that floor suppresses a number we are not sure was rowed, while
 * this pair is a reading the machine actually sent for an interval the
 * rower actually entered. Suppressing it would be inventing an absence.
 *
 * REVERSIBLE BY ONE CONDITION IN THIS FUNCTION (a `reading.meters === 0 &&
 * reading.seconds === 0` refusal) with no stored-shape change and no
 * migration; the cost of being wrong is a noisy row in a sub-second window.
 */
export function withPartial(
  run: MonitorRun,
  endedBy: CloseReason | "interrupted",
  reading: { intervalIndex: number; meters: number; seconds: number } | null,
): MonitorRun {
  if (!PARTIAL_WRITE_REASONS.some((r) => r === endedBy)) return run;
  if (reading === null) return run;
  if (run.actuals.some((a) => a.index === reading.intervalIndex)) return run;
  // Fix-round review, finding 3: a fresh object, never an alias of the
  // caller's own `reading` — the caller (`closeRecord`, Task 3) builds
  // `reading` from a live `MonitorFrame` it keeps reading after this call
  // returns, and this record must never observe a later mutation of that
  // object through its own `partial` field.
  return { ...run, partial: { ...reading } };
}

/**
 * Door spec §5.3 + harden lens 2, finding 3 — the SAME three gates, as a
 * NAME. Every refusal above is silent, and a rower who reports "it kept
 * nothing" leaves a diagnostics ring with no line saying why; both close
 * sites in `useMonitorSession.ts` record this reason (`partial-refused`)
 * so the answer is in the export rather than re-derived from a timeline.
 *
 * Written as a second reading of the SAME `PARTIAL_WRITE_REASONS` const
 * rather than folded into `withPartial`'s return type, so `withPartial`
 * keeps the plain `MonitorRun` signature both close sites already hand
 * straight on. The two predicates are pinned to agree EXHAUSTIVELY by
 * `monitorRun.test.ts`'s own leg (M1.4) — a duplicated predicate with no
 * agreement gate is the drift class this repo keeps paying for.
 */
export function partialRefusal(
  run: MonitorRun,
  endedBy: CloseReason | "interrupted",
  reading: { intervalIndex: number; meters: number; seconds: number } | null,
): "finished" | "interrupted" | "no-reading" | "actual-banked" | null {
  if (!PARTIAL_WRITE_REASONS.some((r) => r === endedBy)) {
    return endedBy === "finished" ? "finished" : "interrupted";
  }
  if (reading === null) return "no-reading";
  if (run.actuals.some((a) => a.index === reading.intervalIndex)) {
    return "actual-banked";
  }
  return null;
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
 *   2. `run.endedBy` is neither `"finished"` nor `"rower"` (every other
 *      close reason — link-lost, program-failed, program-dropped,
 *      interrupted — RC-3 Task 2, spec §1 gate 1: `"rower"`
 *      covers BOTH venues — Menu-at-the-erg and the app's End button,
 *      `CloseReason`'s own doc comment — and the machine speaks the
 *      identical burst for a Menu terminate, notes §25 — and this stays
 *      correct if W8's inactivity auto-terminate lands in `"rower"`
 *      later). A non-finished/rower close's burst status is
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
 * positive-conjunction, no-unknown-key design (its comment, in
 * `handoffStore.ts`) is what makes that safe without a validator change or
 * a `v` bump: a record carrying any of these three fields still
 * round-trips through `loadMonitorRun` on any build, new or old.
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
  // Burst-eligible closes only: every non-finished/rower close (link-lost,
  // program-failed, program-dropped, interrupted) declines.
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
 * (loaded-program invariant, `handoffStore.ts`'s `isMonitorRun` comment) —
 * `restSeconds` is the one interval field every era of this record's
 * shape has always carried.
 *
 * **Why this NAME and not `interruptedTotalSeconds` (Phase PW Task 4
 * review, finding 3; the rename landed in Phase MD PR 1).** This used to
 * be `interruptedTotalSeconds` with `measuredSessionSeconds` as a neutral
 * alias beside it, and the alias held the only production caller — so the
 * alias's name is the one that survived, not the original's. R-D's own
 * text generalizes this exact "work + programmed rest for completed
 * intervals" rule from "the interrupted branch" to "every monitor
 * session's TIME": `summaryModel.ts`'s `buildMonitorModel` needs the
 * identical formula for a run that finished normally, not just one closed
 * through the interrupted door, and a second hand-copy would have meant
 * this formula's own OPEN hardware finding (F-1, the walk sheet's
 * unreproduced "6 MIN where the wire computes 5" reading —
 * `docs/monitor/sessions/walk-2026-08-17/README.md`) landing its eventual
 * fix in only one of the two places that need it. One function, one name,
 * and the name a caller with no "interrupted" run in hand would reach for.
 */
export function measuredSessionSeconds(run: MonitorRun): number {
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
