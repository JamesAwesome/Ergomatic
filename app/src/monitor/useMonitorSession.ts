// The one hook that owns the whole conversation between the connected
// screens and the PM5 driver (7B Task 4, design spec §1: "`useMonitorSession`
// — driver lifecycle, transport selection, `MonitorRun` persistence
// including the FIRST real `recordActual` caller and the `completedAt`
// writer, teardown"). Everything above this file — the interstitial
// (Task 5), the three connected panes (Tasks 6-7) — reads `phase`/`error`/
// `frame`/`actuals` and calls the four methods; **no screen talks to
// `createPm5Driver`, a `Transport`, or `monitorRun.ts` directly** (the
// plan's own layering constraint).
//
// WHAT THIS HOOK DELIBERATELY DOES NOT OWN:
//
// - **The Connect guard.** `connectGuardStage()`/`ConnectAction` (Task 2)
//   run BEFORE `connect()` is ever called, on the workout detail. By the
//   time `connect()` runs, the rower has already been asked about whatever
//   `SessionRun` `createMonitorRun`'s unconditional `clearRun()` is about
//   to destroy. Do not add a second guard here, and do not remove that one:
//   the destruction is real and this hook performs it (at `live`).
// - **`anyLiveSession()`.** Task 2's review recorded M-2 against exactly
//   this file: `anyLiveSession()` has no production consumer, and the first
//   one inherits a live/live tie-break that a DEEP-LINKED `SessionRun` can
//   now reach — `Countdown.tsx` constructs one with no cross-clear (only
//   destruction is guarded, in both directions), so a rower who deep-links
//   to `/session/countdown` mid-connected-session leaves two live records
//   standing. This hook therefore never asks that question. It tracks ITS
//   OWN record in a ref, from `createMonitorRun` to `completeMonitorRun`,
//   and a `SessionRun` appearing beside it changes nothing it does — the
//   two record types own their own sides (spec §3's coexistence contract),
//   and neither clears the other outside the two guarded doors. Pinned by
//   test ("a phone SessionRun appearing mid-session"), and the mutation
//   that kills that pin is exactly the tempting wrong answer: gating the
//   run's own writes on "is a phone session on record?".
//
// NO WALL CLOCK IN ANY DERIVATION HERE (the plan's own constraint): the
// paused hold below counts FRAMES, not seconds; `now` is a dependency, used
// only to stamp the record's ISO timestamps; nothing in this file reads
// `Date.now()`.
//
// ONE bounded timer exists, and it decides nothing — `FINISH_HANDOFF_HOLD_MS`
// (walk day 2, 2026-08-11), the backstop under the ended hand-off's wait for
// the final split. Every other way out of that wait is an EVENT (the boundary
// itself, the machine's next status tick, a disconnect); the timer only
// guarantees the wait ends at all when none of them ever comes. Injected as
// `MonitorSessionDeps.schedule` so tests fire it rather than wait for it.

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type {
  IntervalActual,
  MonitorDriver,
  MonitorEvent,
  MonitorFrame,
  Transport,
} from "../../domain/monitor/types.js";
import {
  createPm5Driver,
  ProgramBusyError,
  ProgramRejectionError,
  type DriverOptions,
  type ProgramRejectionReason,
} from "./driver";
import { createEventLog, type MonitorEventLog } from "./eventLog";
import type { LogSeed } from "../session/logDraft";
import {
  appendSummaryObservations,
  completeContinuityReset,
  completeMonitorRun,
  createMonitorRun,
  recordActual,
  saveMonitorRun,
  type CloseReason,
  type MonitorRun,
} from "./monitorRun";
import { check as checkContinuity } from "./continuity";
import { createSeriesRecorder, type SeriesRecorder } from "./seriesRecorder";
import { defaultTransport } from "../adapters/monitorTransport";
import { registerAppLifecycleListener } from "../adapters/appLifecycle";
import type {
  CancelFn,
  LivenessDeps,
  LivenessSnapshot,
} from "./transports/liveness";

/** The session state machine (design spec §2, verbatim, MINUS `"paused"` —
 *  connected-axes 2a, task 5). Every value here is reached by a REAL event
 *  or frame field — never by a timer and never by an optimistic guess —
 *  with ONE deliberate exception, `"programming"`, which flips
 *  SYNCHRONOUSLY at the top of `program()` before anything is awaited (the
 *  double-fire pin; see `program` below).
 *
 *  There is no `"choosing"`: the platform's chooser owns the interaction
 *  while `picking` — on iOS it is the plugin's in-process list sheet over
 *  our own backdrop (phone-BLE spec §5), on web the browser's chrome
 *  (`requestDevice`'s own modal, single-result chooser the app never sees a
 *  device list from) — so interstitial states 1-3 remain descoped and
 *  `"picking"` is "their chooser is open, we draw only a quiet floor under
 *  it".
 *
 *  NO LONGER `"paused"` (task 5). The freeze predicate below
 *  (`nextFreezeRun`/`isPausedRun`) still runs exactly as before — it is the
 *  MEASUREMENT that decides whether the erg has stopped, and that
 *  measurement was never wrong. What retired is routing its verdict through
 *  a NINTH phase value: the session never actually left `"live"` while
 *  frozen (a stopped erg is still a live session, still talking), so
 *  `"paused"` was a phase in name that carried no state transition of its
 *  own — every consumer that branched on it was really asking "is `frozen`
 *  true?" one layer removed. `frozen` (published on `MonitorSession`,
 *  Task 1) is now the one fact; `phase` stays `"live"` throughout a freeze
 *  and its resume alike. `connectedAxes.ts`'s own `deriveActivity` reads
 *  `frozen` exactly this way already (its own header comment named this
 *  exact seam before the member was gone: "this is the exact seam the
 *  enum's `paused` member retires through later"). */
export type ConnectedPhase =
  | "idle"
  | "picking"
  | "pairing"
  | "programming"
  | "ready"
  | "failed"
  | "live"
  | "disconnected"
  | "ended";

/**
 * Every way this flow can fail, typed (the spec's exit criterion: "every
 * failure path is typed and rendered; no untyped path"). The first arm is
 * the driver's own union — MACHINE STATEMENTS, things the PM5 said or
 * failed to say (`ProgramRejection`'s own doc comment) — and the other five
 * are OURS, about the phone side of the radio:
 *
 * - `"busy"` — `ProgramBusyError`, thrown before a second `program()` ever
 *   reaches the wire. Deliberately NOT a `ProgramRejectionReason` (spec's
 *   I6 ruling): the PM5 never saw the call, so rendering "PM5 rejected"
 *   copy for it would be a lie about the machine.
 * - `"transport-missing"` — no radio at all on this platform/build.
 * - `"scan-dismissed"` — the rower closed the monitor chooser (or it
 *   returned nothing). Not an error in any moral sense; it renders on state 6's
 *   skeleton with a retry, per the C2 ruling. Second producer: the scan
 *   timeout (phone-BLE §3.3) — same retry surface, its own detail line.
 * - `"permission-denied"` — iOS declined the Bluetooth permission; iOS
 *   never re-asks — the remedy is Settings, and the card carries the door.
 * - `"bluetooth-off"` — the ADAPTER itself is unavailable: off, blocked, or
 *   absent from this browser. The one remedy is "turn Bluetooth on", and
 *   that is the only situation this reason is allowed to describe.
 * - `"link-failed"` — **WIDENS THE SPEC'S FIXED UNION** (design spec §2's
 *   error block, DEVIATIONS row; task-4 review MEDIUM-4 adjudicated it).
 *   The radio worked, the pairing may well have succeeded, and then the
 *   link failed anyway: a dead GATT handle mid-program (D6's
 *   `InvalidStateError`), a `connect()` that throws for a reason no adapter
 *   documents. Without this member all of those collapsed onto
 *   `"bluetooth-off"` and rendered "check Bluetooth" at a rower whose
 *   Bluetooth is demonstrably ON — the review found the argument inside
 *   this very file: the two mappers below already wrote DIFFERENT prose for
 *   the same tag, so the code did not itself believe they were one failure.
 *   Task 5's copy keys on `reason`, so the tag is what a rower actually
 *   reads. The remedy differs too: try again / wake the monitor, not
 *   "turn something on".
 *
 * `detail` is copy-ready prose; `raw` is the un-prettified evidence (a
 * `ProgramRejectionError`'s own hex trace, or a thrown error's message) for
 * state 6's DETAIL panel.
 */
export interface ConnectedError {
  reason:
    | ProgramRejectionReason
    | "busy"
    | "bluetooth-off"
    | "link-failed"
    | "transport-missing"
    | "scan-dismissed"
    | "permission-denied";
  detail: string;
  raw?: string;
}

/** Which side of the record a run's `title`/`workoutId` come from. The
 *  program alone cannot supply them — `WorkoutProgram` is the compiled
 *  wire IR and carries no identity at all — and `MonitorRun` needs both
 *  (7C's log prefill reads them).
 *
 *  REQUIRED on `program()`, deliberately (task-4 review): the plan's
 *  interface block writes `program(p: WorkoutProgram)`, and an optional
 *  second parameter would have kept that literal true — but there will
 *  never be a caller that doesn't know its workout, and forgetting to pass
 *  one fails SILENTLY, as a blank-titled record in 7C's log prefill. A
 *  compile error is the cheaper reminder.
 *
 *  `logSeed` (7C Task 1) joins `workoutId`/`title` here as REQUIRED for the
 *  identical reason: `WorkoutProgram` carries no label/warmup-ness either,
 *  the connect path persists no draft to recover them from later
 *  (`session/logDraft.ts`'s `LogSeed` doc comment, adversarial B1), and a
 *  caller that forgot to build one would fail SILENTLY too — a monitor run
 *  that can never qualify for 7C's monitor-mode log, falling through to a
 *  manual form with no signal why. The one production caller,
 *  `WorkoutDetail.tsx`'s `handleConnectProceed`, builds it via
 *  `buildLogSeed(run.phases, baselines)` at the same moment it compiles
 *  `program` from those same phases. */
export interface RunIdentity {
  workoutId: string | null;
  title: string;
  logSeed: LogSeed;
}

/** The empty seed backing `ANONYMOUS_RUN`/`NO_IDENTITY` below — never a
 *  real caller's value (see `NO_IDENTITY`'s own comment: that placeholder
 *  is never read), just enough to satisfy `RunIdentity`'s now-required
 *  `logSeed` field. */
const EMPTY_LOG_SEED: LogSeed = { steps: [], paces: {} };

/** A run with no library workout behind it (a hand-built or ad-hoc
 *  program). `workoutId: null` is a real, supported state — `MonitorRun`
 *  and `SessionRun` both type it that way — and a caller says so
 *  EXPLICITLY; this is not a default the hook falls back to. */
const ANONYMOUS_RUN: RunIdentity = {
  workoutId: null,
  title: "",
  logSeed: EMPTY_LOG_SEED,
};

/** What a run would be filed under if one could open before `program()`
 *  ever ran. None can — `live` is downstream of `ready`, which is
 *  downstream of the `armed` event, which only `program()` produces — so
 *  this initial value is never read. It exists so the identity ref has no
 *  null state to branch on. */
const NO_IDENTITY: { program: WorkoutProgram } & RunIdentity = {
  program: { intervals: [] },
  ...ANONYMOUS_RUN,
};

/** Fire-and-forget, with the rejection deliberately dropped. Three places
 *  hang up on a radio and one leaves an erg terminated; none of them has
 *  anything to do differently if it fails, and an unhandled rejection
 *  escaping a cleanup path is strictly worse than a hang-up that did not
 *  land. One helper rather than four inline `.catch`es so "best effort"
 *  reads as one decision. */
function bestEffort(work: Promise<unknown>): void {
  void work.catch(() => undefined);
}

/** Phase LL Task 1: does `transport` carry a liveness `snapshot()`? Every
 *  REAL production transport does — `defaultTransport` composes
 *  `withLiveness` on both platform arms (`adapters/monitorTransport.ts`) —
 *  but a test's own `MonitorSessionDeps.createTransport` override
 *  typically hands back a bare `Transport`, and `fail()` below must not
 *  assume the method exists. A structural check, not an `instanceof`: the
 *  wrapped object is a plain closure return, not a class instance. */
function hasLivenessSnapshot(
  transport: Transport,
): transport is Transport & { snapshot(): LivenessSnapshot } {
  return typeof (transport as { snapshot?: unknown }).snapshot === "function";
}

/** Phase LL Task 2 (§2 mechanism 3): does `transport` carry the
 *  degraded-characteristic structural extension? Same idiom as
 *  `hasLivenessSnapshot` immediately above — `capacitorBle.ts` and
 *  `fake.ts` both expose it, `webBluetooth.ts` and every bare test
 *  `Transport` do not, and `withLiveness` forwards it through unchanged
 *  (`liveness.ts`'s own `...inner` spread — see that file's header for
 *  why the spread exists). */
function hasCharacteristicDegraded(
  transport: Transport,
): transport is Transport & {
  onCharacteristicDegraded(
    cb: (characteristicId: string, message: string) => void,
  ): () => void;
} {
  return (
    typeof (transport as { onCharacteristicDegraded?: unknown })
      .onCharacteristicDegraded === "function"
  );
}

/** Phase LL Task 2 REVIEW FIX (§2 mechanism 2): does `transport` carry the
 *  liveness decorator's own `markSuspect()`? Same structural idiom as
 *  `hasLivenessSnapshot`/`hasCharacteristicDegraded` above — every REAL
 *  production transport does (`withLiveness`'s own return type), a bare
 *  test `Transport` typically does not, and that is a no-op, never a
 *  throw. See `liveness.ts`'s own doc comment on `markSuspect` for why
 *  going around it (setting `frameSilence` directly, with no way back)
 *  was the bug this check exists to prevent from recurring. */
function hasMarkSuspect(
  transport: Transport,
): transport is Transport & { markSuspect(): void } {
  return (
    typeof (transport as { markSuspect?: unknown }).markSuspect === "function"
  );
}

/** Phase LL Task 3 (§3, F-6): does `transport` carry the already-connected
 *  guard's own outcome-naming extension? Same structural idiom as the
 *  three checks above — `capacitorBle.ts` exposes it (its own
 *  `describeLastScan()` doc comment), `webBluetooth.ts`/`fake.ts`/every
 *  bare test `Transport` do not (the guard is Apple-API-specific — there
 *  is nothing for the web arm or the fake to implement), and
 *  `withLiveness` forwards it through unchanged via its own `...inner`
 *  spread. */
function hasDescribeLastScan(
  transport: Transport,
): transport is Transport & { describeLastScan(): string | null } {
  return (
    typeof (transport as { describeLastScan?: unknown }).describeLastScan ===
    "function"
  );
}

/** Phase LL Task 1: this hook's own production `schedule` for the liveness
 *  decorator — a plain `setTimeout`/`clearTimeout` pair, the same shape
 *  every other `schedule` dep in this file already has. Hoisted to MODULE
 *  scope, not a closure built inside the hook, for one reason: it is a
 *  pure function with nothing to close over, and a top-level function is
 *  directly unit-testable (`useMonitorSession.test.ts` calls it with a
 *  fake `fn`/real timers) without building a whole hook instance — the
 *  ONLY way to reach it otherwise is the full `connect()` -> real
 *  `defaultTransport` -> `withLiveness` -> an actual 0x0031 arrival chain,
 *  which every existing test's own `createTransport` override deliberately
 *  bypasses (this file's own `MonitorSessionDeps.createTransport` doc
 *  comment). */
export function defaultLivenessSchedule(
  fn: () => void,
  ms: number,
): () => void {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

/** Phase LL Task 1: this hook's own production `onSilence` body, factored
 *  out to a PLAIN VALUE (`MonitorEventLog | null`), never a ref — passing
 *  `logRef` itself into a function reachable during render trips
 *  `react-hooks/refs` ("Passing a ref to a function may read its value
 *  during render"), even though this one only closes over it for later.
 *  Taking the already-dereferenced log instead sidesteps that rule
 *  entirely and stays directly testable: `useMonitorSession.test.ts` calls
 *  this with a real `createEventLog()` instance, no ref needed. The hook
 *  itself still reads `logRef.current` AT CALL TIME — `livenessDepsRef`'s
 *  own `onSilence: (ms) => recordLivenessSilence(logRef.current, ms)`
 *  below reads it inside a deferred arrow, not during render, same as
 *  every other ref read in this file. */
export function recordLivenessSilence(
  log: MonitorEventLog | null,
  ms: number,
): void {
  log?.record("liveness-silence", `frame stream silent for ${ms}ms`);
}

/** Phase LL Task 1: this hook's own production `onRecovery` body — same
 *  reasoning as `recordLivenessSilence` above. */
export function recordLivenessRecovery(log: MonitorEventLog | null): void {
  log?.record("liveness-recovery", "frame stream resumed");
}

/** Phase LL Task 2 (design spec §2a): how long the frame stream must run
 *  CONTINUOUSLY healthy before the lost-link banner may retract, once
 *  latched. MEASURED, not guessed — the SAME corpus `liveness.ts`'s own
 *  `SILENCE_THRESHOLD_MS` cites: ~540 ms median (~508 ms mean,
 *  `useMonitorSession.ts:537-539`'s own citation, "delivered on web")
 *  inter-frame gap once a stream is genuinely running, so 10 s is ≈18
 *  frames at the observed cadence, never a round number picked by eye.
 *  "THE BANNER CANNOT BLINK" (spec §2a): `handleFrameRecovery` below does
 *  NOT clear `frameSilence` the instant a single healthy frame arrives —
 *  it starts this timer, and `handleFrameSilence` CANCELS the timer on
 *  every fresh silence, so a silence/recovery/silence flicker inside the
 *  window restarts the clock rather than letting a stale timer retract
 *  the banner underneath a stream that has already gone bad again. */
export const BANNER_RETRACT_HYSTERESIS_MS = 10_000;

/** Phase LL Task 2's production `onSilence` body — wraps
 *  `recordLivenessSilence` (unchanged, still the ring's own record) with
 *  the two things that make the banner honest: it LATCHES `frameSilence`
 *  immediately (the banner shows on the very first silence — the watchdog
 *  itself already waited `SILENCE_THRESHOLD_MS`, nothing here adds a
 *  second debounce on the way UP), and it cancels any pending retract
 *  timer a PRIOR recovery had started. Takes `update`/`hysteresisCancel`
 *  as plain values (never a ref dereferenced here — the same
 *  `react-hooks/refs` reasoning `recordLivenessSilence`'s own doc comment
 *  gives, extended to the cancel slot: the HOOK reads/writes
 *  `hysteresisCancelRef.current` at the call site, this function only
 *  ever sees whatever value that was at the instant it was invoked, and
 *  it is invoked exclusively from a deferred `onSilence` callback, never
 *  during render), so it stays directly testable the same way
 *  `recordLivenessSilence` already is. */
export function handleFrameSilence(
  update: (patch: { frameSilence: boolean }) => void,
  cancelHysteresis: (() => void) | null,
  log: MonitorEventLog | null,
  ms: number,
): void {
  cancelHysteresis?.();
  update({ frameSilence: true });
  recordLivenessSilence(log, ms);
}

/** Phase LL Task 2's production `onRecovery` body — the retract half.
 *  `liveness.ts`'s own contract fires `onRecovery` ONCE, on the very next
 *  0x0031 to arrive after a silence — this does not clear `frameSilence`
 *  on that signal alone (the hysteresis, above). It starts a
 *  `BANNER_RETRACT_HYSTERESIS_MS` timer on `schedule` — the SAME clock
 *  the watchdog itself runs on (`livenessDepsRef.current.schedule`: real
 *  `setTimeout` in production, `ReplayHandle.clock.schedule` under
 *  replay) — and only if that timer runs to completion with no
 *  intervening `handleFrameSilence` call does `frameSilence` clear.
 *  Returns the new canceller so the caller can store it back onto the
 *  ref it owns (this function never touches a ref itself, same reasoning
 *  as `handleFrameSilence`). */
export function handleFrameRecovery(
  update: (patch: { frameSilence: boolean }) => void,
  cancelHysteresis: (() => void) | null,
  schedule: (fn: () => void, ms: number) => CancelFn,
  log: MonitorEventLog | null,
): CancelFn {
  cancelHysteresis?.();
  recordLivenessRecovery(log);
  return schedule(() => {
    update({ frameSilence: false });
  }, BANNER_RETRACT_HYSTERESIS_MS);
}

/** Phase LL Task 4 (design spec §4's continuity rule): true whenever `p`
 *  contains ANY distance-kind interval — the exact predicate
 *  `src/monitor/driver.ts`'s own `recordTwdVerdict` already computes for
 *  the identical reason (`continuity.ts`'s own header comment has the full
 *  wire citation: a distance-goal interval makes 0x0031's Total Work
 *  Distance report the interval's GOAL, not distance rowed, so a
 *  continuity check keyed on that field must not run inside one). Factored
 *  out, plain-value, directly testable — same discipline as
 *  `handleFrameSilence`/`handleFrameRecovery` above. */
export function programHasDistanceGoal(p: WorkoutProgram): boolean {
  return p.intervals.some((i) => i.kind === "distance");
}

/**
 * Phase LL Task 4 (design spec §4's continuity rule): the resumed-stream
 * consumption seam, factored into a plain, directly-testable function —
 * same discipline as `handleFrameSilence`/`handleFrameRecovery` above,
 * extended one step further: this one's OWN side effect (closing the
 * record) is itself a pure transform (`completeContinuityReset`), so the
 * whole decision is expressible without a hook, a ref, or a fake
 * transport's own accurate wire-timing model standing between a test and
 * the behaviour under test.
 *
 * **RETURNS THE RUN ONLY — the caller pairs a `"reset"` result with its
 * own surface update** (RULED at Task 4's own review, F2/I2: the first
 * implementation closed the record silently, leaving the banner to
 * retract on its own hysteresis and the rower rowing into a closed
 * record with the app still showing `live` — in the phase whose subject
 * is "the app says so." Every sibling close in this file pairs the
 * record close with a `phase: "ended"`/`runOpen: false` `update()` in the
 * SAME statement; this function cannot do that itself — it has no
 * `update` to call — so its own caller, `handleFrame`'s live branch
 * below, does it in the same breath it applies this return value).
 *
 * Returns `run` UNCHANGED (the identical reference) whenever nothing
 * closes — a caller tells "did this fire" from reference identity, the
 * same idiom `withSeries` above already uses. Four reasons nothing
 * closes, all short-circuited before `continuity.ts`'s own `check` is
 * even called: the stream isn't currently suspect (`frameSilence` false —
 * this is what makes re-invoking this function every live frame free);
 * there is no run, or it is already closed (nothing left to protect —
 * `recordActual`'s own guard already covers a closed run, this is belt
 * and braces at the SOURCE of the close instead); there is no prior
 * reading to compare against (`last === null`, the very first live
 * frame of a run); or this particular frame carries no
 * `totalWorkDistanceMeters` at all (`frame.totalWorkDistanceMeters ===
 * undefined` — an older `MonitorFrame` construction path,
 * `domain/monitor/types.ts`'s own additive-optional doc comment on that
 * field).
 *
 * F2a (Task 2 of 2, design spec 2026-08-23-continuity-corroboration §2):
 * `last` and `frame` each carry all THREE axes `continuity.ts`'s own
 * `check` now conjoins — `totalWorkDistanceMeters`, `elapsedSeconds`, and
 * `distanceMeters` — read straight off the SAME `MonitorFrame` reading in
 * both cases (the caller's `lastContinuityRef` snapshot for `last`, this
 * frame itself for `frame`), never fabricated from one scalar the way
 * Task 1's bridge did.
 *
 * F2b (storage-spine design spec 2026-08-23 §4, PR 3 Task 2): `last` also
 * carries `intervalCount?`, the caller's `lastContinuityRef` snapshot of
 * the PRIOR frame's own `rawIntervalCount`; `frame.rawIntervalCount`
 * itself is `after`'s count — `continuity.ts`'s own `check` reads both as
 * `ContinuityReading.intervalCount`, falling back to the three-axis
 * signature alone whenever either is `undefined` (a frame before this
 * run's first 0x0033, same "absent" contract `domain/monitor/types.ts`
 * documents for `rawIntervalCount` itself). The `run === null` guard two
 * lines below is why session-2-wu-4unequal.jsonl's own real backward
 * count (seq 24->29, the leftover-register PRE-RUN shape) never reaches a
 * conviction here even though the identical pair, handed straight to
 * `check`, DOES convict on the count axis alone
 * (`useMonitorSession.test.ts`'s own "F2b production-path pin") — no run
 * has opened yet at WAITTOBEGIN, so this function returns before `check`
 * is ever called, whatever the readings say.
 */
export function applyContinuityCheck(
  run: MonitorRun | null,
  last: {
    totalWorkDistanceMeters: number;
    elapsedSeconds: number;
    distanceMeters: number;
    intervalCount?: number;
  } | null,
  frame: MonitorFrame,
  frameSilence: boolean,
  now: Date,
  log: MonitorEventLog | null,
): MonitorRun | null {
  if (!frameSilence) return run;
  if (run === null || run.completedAt !== null) return run;
  if (last === null || frame.totalWorkDistanceMeters === undefined) {
    return run;
  }
  const distanceGoal = programHasDistanceGoal(run.program);
  const verdict = checkContinuity(
    {
      totalWorkDistanceMeters: last.totalWorkDistanceMeters,
      elapsedSeconds: last.elapsedSeconds,
      distanceMeters: last.distanceMeters,
      distanceGoal,
      intervalCount: last.intervalCount,
    },
    {
      totalWorkDistanceMeters: frame.totalWorkDistanceMeters,
      elapsedSeconds: frame.elapsedSeconds,
      distanceMeters: frame.distanceMeters,
      distanceGoal,
      intervalCount: frame.rawIntervalCount,
    },
  );
  if (verdict !== "reset") return run;
  log?.record(
    "continuity-reset",
    `resumed stream failed continuity: twd ${last.totalWorkDistanceMeters} ` +
      `-> ${frame.totalWorkDistanceMeters} elapsed ${last.elapsedSeconds} ` +
      `-> ${frame.elapsedSeconds} distance ${last.distanceMeters} -> ` +
      `${frame.distanceMeters} intervalCount ` +
      `${last.intervalCount ?? "none"} -> ${frame.rawIntervalCount ?? "none"} ` +
      `— closing as link-lost, never merging`,
  );
  // §4: "On reset: preserve the interrupted record, start clean, never
  // merge." No reconnect flow exists this phase (spec §8) to start a
  // genuinely new run from, so "never merge" is discharged the way this
  // codebase already discharges it for every other untrustworthy-record
  // case: CLOSE it. `endedBy: "link-lost"`, not `"interrupted"` — RULED
  // at Task 4's own review (F1/I1): this is the close with the
  // STRONGEST evidence (a link episode already marked the stream
  // suspect, and continuity then measurably broke), not the absence of
  // one. `completeContinuityReset`'s own doc comment has the full
  // reasoning. `recordActual`'s own `completedAt` guard is what then
  // makes every later boundary refuse to fold in.
  return completeContinuityReset(run, now);
}

/**
 * Phase LT spec 2, Task 2 (design spec §4, S6). Requests persistent storage
 * once per successful connect — free either way, and this hook is
 * deliberately NOT what decides whether it is granted: `persist()` itself
 * is (S6's own PRIMARY citation, WebKit's policy blog — heuristics decide,
 * and a Capacitor WKWebView is "probably DENIED" by them). Fire-and-forget
 * (`bestEffort`) and never gates anything downstream: denial is TOLERATED,
 * stated in the spec's own words as "NOT as mitigation" — nothing about
 * `connect()`'s own success or failure reads this outcome.
 *
 * `navigator.storage`/`persist` are both optional-chained rather than
 * feature-detected up front on purpose: some runtimes — this repo's own
 * jsdom test environment among them — omit the Storage Manager API
 * entirely, and that omission collapses cleanly onto the SAME "denied"
 * outcome this function already logs; no separate branch for "does not
 * exist" versus "exists and refused" is needed or wanted; a caller reading
 * the ring only ever needs to know whether the trace ended up protected.
 * Wrapped in its own `try`/`catch` (no runtime is documented to throw
 * synchronously here, but a throw would otherwise escape into `connect()`'s
 * own surrounding catch and get mis-reported as a radio failure — the exact
 * kind of wrong-layer error this file's `mapRadioFailure` exists to sort,
 * not extend to an unrelated API).
 */
function requestStoragePersistence(log: MonitorEventLog): void {
  try {
    bestEffort(
      Promise.resolve(navigator.storage?.persist?.()).then((granted) => {
        log.record(
          "storage-persist",
          granted === true
            ? "granted"
            : "denied (tolerated — design spec §4 S6, not mitigation)",
        );
      }),
    );
  } catch {
    log.record(
      "storage-persist",
      "denied (persist() threw synchronously — tolerated, same as any other denial)",
    );
  }
}

/**
 * How long the ended hand-off waits for the final interval's split before
 * giving up on it — the BACKSTOP, not the expected path (hardware walk day
 * 2, 2026-08-11, `docs/monitor/pm5-interface-notes.md` §22 item 1; the
 * number itself is walk day 3's, §22 item 5).
 *
 * What went wrong without any hold: the machine's `finished` tick flips this
 * hook to `ended`, `ConnectedSurface` fires `onEnded` on that very render,
 * the caller navigates, the interstitial unmounts, and `teardown`
 * unsubscribes the driver listener and hangs up the radio — all inside the
 * microtask flush that follows the tick, while the PM5's split pair is still
 * in flight. There was no race to win: teardown always got there first, so
 * walk 5's driver-side finish grace never saw the boundary it was built for,
 * and the save screen read "0 OF 1 INTERVALS MEASURED" with the split bytes
 * on the wire behind it.
 *
 * 3000 ms, from walk day 3's MEASUREMENT rather than day 1's inference. The
 * first version of this hold was 250 ms with a "next status tick" exit,
 * because the day-1 capture showed the pair 1 ms behind the terminal frame
 * and the app inferred "the same sample instant" from it. Day 3's stash
 * measured the real gap: the PM5 keeps ticking identical `finished` frames,
 * and the split lands LATER than one of them (terminal at seq 19, the pair
 * at seq 21-24, all inside 3 s) — so the tick exit shut the door before the
 * split existed, and every affected session logged `handoff-released:
 * next-tick` with not one `split-half` entry behind it. That exit is gone;
 * this ceiling is what remains, and the real path still does not reach it:
 * the boundary itself releases the hold as soon as it lands, and only a run
 * actually missing its last interval's actual holds at all. A few seconds on
 * the "SESSION ENDED" frame in the pathological case is a frame the rower is
 * reading anyway; a lost measurement is not recoverable.
 *
 * COUPLED CONSTANT: `driver.ts`'s `FINISH_GRACE_MS` is 3000, and the safety
 * is directional — this hold must outlive the grace, so a boundary the
 * driver still vouches always finds the hand-off still held.
 *
 * **THE INEQUALITY IS NOW STRICT: hold > grace** (fast-follow Task 2,
 * design spec §5). It used to be `>=`, and equality sufficed because every
 * vouched boundary arrived on a NOTIFICATION strictly inside the grace —
 * whatever landed at the deadline itself was already too late to be
 * accepted. The summary fallback breaks that: the driver's reconcile fires
 * AT `FINISH_GRACE_MS`, and when the final split was dropped it synthesizes
 * the last interval right there, on the deadline. With both numbers equal,
 * that fill and this backstop would be two timers due at the same
 * millisecond — the fill would be racing the navigation it exists to beat,
 * and the rower would get "0 OF 1 MEASURED" on whichever ordering the event
 * loop happened to pick. 3500 is the grace plus a 500 ms margin for the
 * fill and the record write it triggers; nothing measured that margin
 * because nothing needs to — it is one synchronous emit, and the cost of
 * the extra half-second is half a second on a frame the rower is reading
 * anyway. The full reasoning for the grace itself lives at
 * `FINISH_GRACE_MS`'s own comment; change the two together or not at all.
 */
const FINISH_HANDOFF_HOLD_MS = 3500;

/**
 * Storage-spine design spec §2's late side (PR 1, Task 3): at a
 * NATURAL-FINISH teardown whose record has not yet heard the machine's
 * summary burst (0x0039 + 0x003F), `teardown`'s reconcile/unsubscribe/
 * disconnect steps defer to the EARLIER of the burst arriving or this many
 * milliseconds — exported so tests can name it rather than hard-coding
 * 2000 twice.
 *
 * Holds at ~5.0× the modelled worst case (398 ms: late-side first element
 * +90.2 ms plus the burst span +307.8 ms), structurally bounded at one
 * burst span because our terminal cannot precede the machine's own flip.
 * n = 1 caveat carried: the burst-span offsets come from the only
 * 0x0039/0x003F ever captured, on a 2-interval piece.
 */
export const BURST_LINGER_MS = 2000;

/** Phase LT spec 2 §2's flush policy, verbatim: "a 30-second timer" the
 *  hook owns, independent of the boundary and close flushes. Not tuned —
 *  the spec names the number directly, no derivation to carry. */
const SERIES_FLUSH_INTERVAL_MS = 30_000;

/** The default for `MonitorSessionDeps.seriesFlushSchedule` — a REPEATING
 *  timer (`setInterval`, not `setTimeout`): the flush fires on every tick
 *  until cancelled, for as long as a run stays open. */
function defaultSeriesFlushSchedule(cb: () => void, ms: number): () => void {
  const id = setInterval(cb, ms);
  return () => clearInterval(id);
}

export interface MonitorSession {
  phase: ConnectedPhase;
  error: ConnectedError | null;
  deviceName: string | null;
  frame: MonitorFrame | null;
  actuals: IntervalActual[];
  endedBy: "machine" | "user" | null;
  /** `true` while the ended hand-off is being HELD for the final interval's
   *  split (`FINISH_HANDOFF_HOLD_MS`, walk day 2). The phase is already
   *  `"ended"` — the rower sees that frame immediately — but whoever
   *  navigates away on the ending (`ConnectedSurface`'s `onEnded`) must WAIT
   *  while this is true: navigating unmounts the interstitial, and unmounting
   *  tears down the very subscription the boundary still has to arrive on.
   *  Always `false` unless a machine FINISH left the run missing its last
   *  interval's actual. */
  handoffHeld: boolean;
  /** Mirrors `freezeRef` — `isPausedRun(freezeRef.current)` at the instant
   *  of the last `update()`. Published for `connectedAxes.ts`'s `activity`
   *  axis (design spec §1) — read-only, derived, not a second source of
   *  truth (`freezeRef` still owns the write). Consumed since task 2:
   *  `ConnectedSurface.tsx`'s `deriveAxes` call feeds this straight through. */
  frozen: boolean;
  /** Mirrors `runRef`: `true` iff this hook's own record is open
   *  (`runRef.current !== null && runRef.current.completedAt === null`) at
   *  the instant of the last `update()`. Published for `connectedAxes.ts`'s
   *  `session` axis (design spec §1) — at `disconnected` the record
   *  deliberately stays open, so `phase` alone cannot say. Consumed since
   *  task 2, the same call `frozen` is. */
  runOpen: boolean;
  /** Mirrors `SessionState.frameSilence` (Phase LL Task 2). Published for
   *  `connectedAxes.ts`'s `deriveLink` — routed through the EXISTING
   *  `stale` `SurfaceStatus`, never a new one (spec §2a's own correction:
   *  no new axis, no new word, no parallel path). */
  frameSilence: boolean;
  /** Opens the platform's monitor chooser (`"picking"`), then connects (`"pairing"`) and
   *  builds the driver around the picked device's REAL advertised name.
   *  Assumes the Connect guard has already cleared (see this file's
   *  header). */
  connect(): Promise<void>;
  program(p: WorkoutProgram, identity: RunIdentity): Promise<void>;
  /** The rower's End. Idempotent, and idempotent specifically against a
   *  terminal event racing it (spec §2). */
  endSession(): Promise<void>;
  /** Cancel's machine semantics per state (spec §2's M3 ruling). */
  cancel(): Promise<void>;
  /**
   * THE ONE READ-ONLY WINDOW ONTO THE DRIVER'S EVENT LOG (Task 7's
   * diagnostics sheet, handoff §5 — added here because Task 4 exposed the
   * log only as an INJECTION point, `MonitorSessionDeps.createLog`, and a
   * screen may not reach past this hook for a driver, a transport or a
   * log).
   *
   * A WINDOW, NOT A SOURCE: this returns `MonitorEventLog.exportLog()`'s
   * JSON string at the instant it is called, and there is no subscription
   * to add — the log has no `subscribe` and design spec §5 says it does not
   * get one. The sheet reads once, on open, and what it draws is that
   * snapshot until it is re-opened. It is deliberately the EXPORT string
   * rather than the `entries()` array: `COPY LOG` copies exactly the bytes
   * the sheet was built from, so there is one string and no second
   * serialization to disagree with the first.
   *
   * `"[]"` before a `connect()` has ever built a log — the same shape an
   * empty log exports, so no caller needs a null branch.
   */
  exportLog(): string;
}

/**
 * Everything this hook reaches the outside world through, injectable so a
 * test can drive the whole flow through `transports/fake.ts` (the same fake
 * `driver.test.ts` uses — a model of the machine we MET, empty arm
 * included) with no radio and no wall clock.
 *
 * All four are optional and default to production behaviour, so
 * `useMonitorSession()` — the zero-argument call Tasks 5-7 make — is the
 * shipped path.
 */
export interface MonitorSessionDeps {
  /** Builds the radio. `null` means "this platform/build has none" →
   *  `transport-missing`. May return a `Promise` — `connect()` always
   *  `await`s the result, so a caller building a real, synchronous
   *  transport (every existing test) and the DEV fake-injection seam's
   *  dynamic `import()` (both `transports/index.ts`'s
   *  `resolveDefaultTransport` and `adapters/monitorTransport.ts`'s native
   *  arm) are indistinguishable to it. Omitted (the default when this is
   *  undefined), the platform-conditional `adapters/monitorTransport.ts`'s
   *  `defaultTransport` picks Capacitor BLE on native and delegates to
   *  `transports/index.ts`'s `resolveDefaultTransport` (fake-injection, then
   *  Web Bluetooth) on web — ROADMAP CL item 2, see that adapter's own doc
   *  comment for the full reasoning. */
  createTransport?: () => Transport | null | Promise<Transport | null>;
  /** The driver's event log. Injectable so Task 7's diagnostics sheet can
   *  own the log it renders (`exportLog()` — the sheet reads on open; the
   *  log has no subscribe and doesn't get one, spec §5). */
  createLog?: () => MonitorEventLog;
  /** The only clock in this file, and only for the record's ISO stamps. */
  now?: () => Date;
  /** The ended hand-off's backstop timer (`FINISH_HANDOFF_HOLD_MS`), as a
   *  schedule-and-cancel pair: returns the canceller. Injected so a test
   *  FIRES the backstop instead of waiting 250 real milliseconds (and so an
   *  unmounted test leaves no live timer). Defaults to `setTimeout` /
   *  `clearTimeout`. */
  schedule?: (cb: () => void, ms: number) => () => void;
  /** The series recorder's 30-second flush timer (Phase LT spec 2 §2's
   *  flush policy — `SERIES_FLUSH_INTERVAL_MS`), as a REPEATING
   *  schedule-and-cancel pair: `cb` fires on every tick until the returned
   *  canceller runs, not once. Deliberately a SEPARATE injection point from
   *  `schedule` above rather than reusing it: this hook starts the flush
   *  timer the instant a run opens, and reusing `schedule` would add an
   *  extra call to every `schedule()`-call-count assertion in the ended
   *  hand-off suite the moment any of those tests reaches `live` — a
   *  one-shot backstop and a recurring flush are different enough
   *  contracts to deserve their own seam anyway. Defaults to
   *  `setInterval`/`clearInterval`. Injected so a test fires 30-second
   *  flushes on demand instead of a session actually running that long. */
  seriesFlushSchedule?: (cb: () => void, ms: number) => () => void;
  /** Storage-spine design spec §2's late side (PR 1, Task 3): the burst
   *  linger's own one-shot schedule-and-cancel pair — `BURST_LINGER_MS`,
   *  as a schedule a test FIRES instead of waiting 2 real seconds for. A
   *  SEPARATE seam from `schedule` above rather than a reuse of it, for
   *  the identical reason `seriesFlushSchedule`'s own doc comment gives:
   *  most tests finish a natural-finish workout without caring about the
   *  burst, and reusing `schedule` would add an extra call to every
   *  `schedule()`-call-count assertion the ended hand-off suite already
   *  makes the moment any of those tests reaches a natural close. Defaults
   *  to `setTimeout`/`clearTimeout`. */
  burstLingerSchedule?: (cb: () => void, ms: number) => () => void;
  /** Passed to `createPm5Driver`. `deviceName` is NOT accepted here — it
   *  comes from the picker result, never from a caller's guess (spec's I5
   *  ruling: no screen ever renders the `"PM5"` placeholder). */
  driverOptions?: Omit<DriverOptions, "deviceName">;
}

/**
 * THE PAUSED DERIVATION (design spec §2's C1 block, redefined from the
 * record TWICE — the ORIGINAL predicate was backwards, and the four-metric
 * revision died at the erg; both are superseded).
 *
 * THREE rowing metrics — `distanceMeters`, `currentSplit`, `spm` —
 * unchanged TOGETHER across `PAUSED_FRAME_HOLD` consecutive frames while
 * the machine reads `rowing` AND the interval has banked distance
 * (`distanceMeters > 0`). Exit on ANY change to any of the three.
 *
 * Why `elapsedSeconds` is NOT in the key (§17 item 20, ANSWERED by the
 * 2026-08-08 hardware recording): on a real PROGRAMMED timed interval the
 * PM5's clock runs whether or not the rower pulls — the recording shows
 * LEFT IN INTERVAL counting 4:38 → 3:47 while meters sat pinned at 30,
 * split at 4:16.1, rate at 68, and the heart rate moved the whole hold
 * (85 → 63, the exclusion theory confirmed on hardware). With elapsed in
 * the key the key never repeats and PAUSED can never fire on a real
 * program; session 3's frozen-elapsed stretch was an artifact of the
 * structurally EMPTY arm it was recorded on, exactly the caveat this
 * derivation shipped behind.
 *
 * Why not `spm === 0`, the obvious predicate: the record says the opposite
 * of what that assumes.
 * - A STOPPED rower's spm stays PINNED at its last value. Session 3's
 *   frozen stretch (`pm5-session3-final.log:3548-3763`, 216 consecutive
 *   frames) reads `elapsed 57.78 / distance 108.4 / split 236.75 / spm 16`
 *   unchanged the whole way through — with the heart rate moving the entire
 *   time (82 → 60 → 67 → 59 → 61), which is what proves these are live
 *   frames and not a stalled stream. That is also why HR is NOT one of the
 *   four: it is the one field that keeps moving when the rower stops.
 * - spm ZEROES at a no-rest interval boundary, where the rower has not
 *   stopped at all. The old predicate fired at every changeover and never
 *   for a real stop.
 *
 * **The no-rest-boundary false positive and why `distanceMeters > 0`
 * guards it** (the regression fixture,
 * `pm5-session3-final.log:2835`+`2837-2841`): at a no-rest boundary the
 * machine emits one frame carrying the previous interval's split/spm over
 * a zeroed clock (`el 0 / d 0 / split 338.97 / spm 66`), then THREE
 * identical `el 0 / d 0 / split 0 / spm 0` frames, then resumes counting
 * (`el 0.34`). When elapsed was in the key, the resume frame's fresh
 * elapsed broke the run one frame before the 4-hold fired; without
 * elapsed, the zeros could keep matching for as long as the rower's first
 * strokes take to move split/spm — an unbounded run no fixed hold clears.
 * Every boundary frame carries `d 0`, and a genuine mid-interval stop has
 * distance already banked, so freeze frames simply do not COUNT until the
 * interval has distance: the boundary case resets on the guard, not on a
 * one-frame margin. (The rower who stops at the exact instant of a
 * changeover, having moved zero meters in the new interval, reads as the
 * interval's own waiting state rather than PAUSED — the display cost is
 * nothing.) The 4-frame hold itself is retained as recorded-margin
 * against single-frame repeats.
 *
 * Exit is on ANY CHANGE, never on "advance" — equality is the whole
 * predicate. (The record's backwards elapsed ticks, up to −0.57 s,
 * `pm5-session3-final.log:4632-4633`, no longer matter to the key, but
 * the same discipline holds for the three that remain: split and spm can
 * genuinely wobble DOWN between frames.)
 *
 * PAUSED DELIBERATELY IGNORES `rowingActive` — the asymmetry is load-
 * bearing, do not "unify" it with the ready gate. The ready gate demands
 * the machine's Active byte because it fires ONCE, into a state that
 * opens the record; this counter runs continuously against frames whose
 * Rowing State behavior during a mid-piece stop has NEVER been observed
 * (walk 2 validated the three-metric freeze on hardware; the byte was not
 * in the capture). If rowingState flips Inactive while a stopped rower's
 * frames still read `state: "rowing"`, keying on it here would be a
 * second unobserved-byte gamble on a predicate that already works.
 * Revisit only with a capture that shows the byte through a full
 * stop-and-resume.
 *
 * CAVEATS still carried:
 * - **§17 item 20 is ANSWERED** (the 2026-08-08 recording, above): the
 *   clock runs, the other three freeze, HR moves. What remains unread is
 *   the tick count from a Connection-log capture (the recording samples
 *   at 1 fps) and a distance-interval stop — the three-metric key is
 *   expected to behave identically there (the clock keeps running on
 *   distance intervals too), but it has only been WATCHED on a timed one.
 * - **FRAMES, not seconds.** No wall clock is involved on purpose, and the
 *   hold cannot be restated in seconds honestly: the driver requests 100 ms
 *   sampling (`buildSampleRateConfig`) but the record shows ~500 ms
 *   delivered (M1 — the sample-rate write is fire-and-forget and its
 *   outcome is swallowed). Four frames is ~2 s at the observed cadence and
 *   ~0.4 s at the requested one. The same runsheet row reads the true
 *   cadence.
 */
export const PAUSED_FRAME_HOLD = 4;

/** How many consecutive frames have now carried IDENTICAL values for the
 *  three rowing metrics `freezeKey` keys on — distance, split and rate;
 *  elapsed and heart rate are both deliberately out of it (see
 *  `freezeKey`). `frames` counts the frames themselves (a fresh
 *  value is 1, not 0), so `frames >= PAUSED_FRAME_HOLD` reads exactly as
 *  the spec's sentence does. */
export interface FreezeRun {
  key: string;
  frames: number;
}

/** The three metrics, and only those three — `elapsedSeconds` is excluded
 *  because the PM5's clock runs while a stopped rower sits still (§17 item
 *  20's answer; see `PAUSED_FRAME_HOLD`), and heart rate is excluded
 *  because it is the field that keeps MOVING when the rower stops, the one
 *  that proves the stream is alive. A string key rather than a tuple
 *  compare because `currentSplit`/`spm` are `number | null` and `null` is
 *  a value here like any other. */
function freezeKey(frame: MonitorFrame): string {
  // INTERVAL-SCOPED ON PURPOSE — `distanceMeters`, never
  // `sessionDistanceMeters` (added Phase 7B for TOTAL LEFT and the METERS
  // card). The whole no-rest-boundary defence in `PAUSED_FRAME_HOLD`'s
  // comment rests on 0x0031's per-interval RESET: every boundary frame reads
  // `d 0`, which is what `nextFreezeRun`'s `> 0` guard clears the false
  // positive with. The accumulated field never returns to 0 mid-session, so
  // swapping it in here would silently re-open that defect.
  return `${frame.distanceMeters}|${frame.currentSplit}|${frame.spm}`;
}

/** Exported for the recorded-fixture tests, which replay real captured
 *  frames through this one function frame by frame. Pure. */
export function nextFreezeRun(
  previous: FreezeRun | null,
  frame: MonitorFrame,
): FreezeRun {
  // Only a ROWING machine can be paused: `resting` legitimately freezes
  // spm 0 / split 0 / distance-still for its whole duration, and
  // armed/finished/terminated freeze everything indefinitely. A non-rowing
  // frame resets the count outright rather than merely not incrementing
  // it, so a rest cannot lend its frames to the next interval's first
  // stroke. The `distanceMeters > 0` guard is the no-rest-boundary
  // clearer — see `PAUSED_FRAME_HOLD`'s own comment.
  if (frame.state !== "rowing" || frame.distanceMeters <= 0) {
    return { key: "", frames: 0 };
  }
  const key = freezeKey(frame);
  return previous !== null && previous.key === key
    ? { key, frames: previous.frames + 1 }
    : { key, frames: 1 };
}

export function isPausedRun(run: FreezeRun): boolean {
  return run.frames >= PAUSED_FRAME_HOLD;
}

const NO_FREEZE: FreezeRun = { key: "", frames: 0 };

/**
 * THE `rowingActive` FALLBACK (erg-day review, HIGH-1).
 *
 * The ready gate's third leg is 0x0031's Rowing State byte, and the repo
 * has never captured that byte on a real first-pull frame. Replaying every
 * `armed -> rowing` transition in `docs/monitor/sessions/pm5-session3-
 * final.log.gz` (eight of them) shows the gate's OTHER two legs are already
 * satisfied on the first rowing frame of every single arm — banked distance
 * on all eight. So on real hardware `rowingActive` is not a third
 * confirmation, it IS the gate, and an unexpected byte value (the parse is
 * a strict `raw.rowingState === 1`) silently loses the whole session: the
 * phase never leaves `ready`, `createMonitorRun` never runs, the panes keep
 * painting live numbers off the fall-through `update({ frame })`, and End
 * produces a session with no record and no error anywhere.
 *
 * The asymmetry is what decides this. A stuck-Inactive byte is the worst
 * class of failure there is — silent total data loss, discovered only after
 * the piece. What this fallback re-opens is the walk-3 coast, whose cost is
 * cosmetic: the numbers appear a beat early on a piece the rower is about
 * to start anyway. So the fallback is deliberately generous about the coast
 * and unforgiving about losing a session.
 *
 * Five CONSECUTIVE frames of STRICTLY INCREASING distance in a rowing state
 * is the shape a coast cannot hold and a rower cannot fail. A decelerating
 * flywheel breaks strict increase as soon as the wheel stalls (0.1 m/lsb
 * resolution — `parse.ts` divides the raw field by 10 — ~2.5 s of streak
 * at the observed 2 Hz cadence), while an
 * actually-rowing athlete banks meters on every frame of it. The instant
 * path below is UNCHANGED — a machine that says Active still promotes on
 * the very first frame, and this counter never runs on that path.
 */
export const ROWING_ACTIVE_FALLBACK_FRAMES = 5;

/** The run of consecutive strictly-progressing rowing frames seen while the
 *  session sits at `ready`. `distanceMeters` is the previous frame's reading,
 *  kept so "strictly increasing" can be evaluated without holding the whole
 *  frame. */
export interface RowingStreak {
  frames: number;
  distanceMeters: number;
}

/**
 * Pure, exported for the fallback's own tests. `null` means "no streak" —
 * the frame was not a rowing frame at all, which resets outright rather
 * than merely failing to increment (an `armed`/`resting` frame must not
 * lend its position to the next rowing frame's count).
 *
 * A frame that IS rowing but does not strictly beat the previous distance
 * does not reset to zero: it starts a NEW streak of one, seeded with its
 * own reading. That is what makes a stalled wheel hold at 1 forever (the
 * next frame cannot strictly beat a distance it just matched) while a rower
 * who pauses and resumes simply starts counting again from the resume.
 */
export function nextRowingStreak(
  previous: RowingStreak | null,
  frame: MonitorFrame,
): RowingStreak | null {
  if (frame.state !== "rowing") return null;
  const distanceMeters = frame.distanceMeters;
  if (previous !== null && distanceMeters > previous.distanceMeters) {
    return { frames: previous.frames + 1, distanceMeters };
  }
  return { frames: 1, distanceMeters };
}

interface SessionState {
  phase: ConnectedPhase;
  error: ConnectedError | null;
  deviceName: string | null;
  frame: MonitorFrame | null;
  actuals: IntervalActual[];
  endedBy: "machine" | "user" | null;
  handoffHeld: boolean;
  /** Mirrors `freezeRef` (`isPausedRun(freezeRef.current)`), kept as
   *  published STATE rather than read off the ref at return time — reading
   *  a ref during render is exactly what `react-hooks/refs` exists to
   *  catch. Updated at every site that writes `freezeRef`. */
  frozen: boolean;
  /** Mirrors `runRef` (`runRef.current !== null && runRef.current.completedAt
   *  === null`), same reason. Updated at every site that opens or closes
   *  `runRef`'s record. */
  runOpen: boolean;
  /** Phase LL Task 2 (design spec §2a): `true` whenever the frame stream
   *  is currently being treated as suspect — the watchdog's own
   *  `onSilence` (armed at the first 0x0031 after connect, tripped after
   *  `SILENCE_THRESHOLD_MS` with no further arrival) or an app-lifecycle
   *  resume (mechanism 2: no radio fault, the phone simply stopped
   *  delivering frames while suspended). Latches on `handleFrameSilence`,
   *  retracts only after `BANNER_RETRACT_HYSTERESIS_MS` of continuous
   *  healthy frames (`handleFrameRecovery`) — never on a single frame.
   *  Published for `connectedAxes.ts`'s `frameSilence` axis input, the
   *  same publish-a-boolean shape `frozen`/`runOpen` already establish. */
  frameSilence: boolean;
}

const INITIAL_STATE: SessionState = {
  phase: "idle",
  error: null,
  deviceName: null,
  frame: null,
  actuals: [],
  endedBy: null,
  handoffHeld: false,
  frozen: false,
  runOpen: false,
  frameSilence: false,
};

/** Everything a rejected `program()` can throw, mapped onto the typed
 *  union. A `ProgramRejectionError` passes its OWN reason through
 *  untouched — all eight of them, `structure-mismatch` included, whose
 *  observed-vs-expected triple state 6 renders out of `raw` — because that
 *  union is the machine's own vocabulary and re-deriving it here would only
 *  lose detail. */
function mapProgramFailure(err: unknown): ConnectedError {
  if (err instanceof ProgramBusyError) {
    return {
      reason: "busy",
      // Never "PM5 ..." phrasing: nothing was sent, so the machine has no
      // opinion about this call (the error class's own doc comment).
      detail: "A programming attempt is already in flight.",
      raw: err.message,
    };
  }
  if (err instanceof ProgramRejectionError) {
    return { reason: err.reason, detail: err.message, raw: err.hexTrace };
  }
  // An untyped throw out of `program()` — in practice a write against a
  // dead GATT handle (D6: Chrome's `InvalidStateError: Characteristic ...
  // is no longer valid`), which `sendSequence` does not wrap. The link
  // failed; Bluetooth did not (this program only got dispatched because a
  // pairing had already succeeded), which is the distinction
  // `"link-failed"` exists to keep — see `ConnectedError`.
  return {
    reason: "link-failed",
    detail: "The link to the monitor failed while programming.",
    raw: String(err),
  };
}

/** A `scan()`/`connect()` failure, sorted into the things it can actually
 *  be. The Capacitor transport pre-translates its own failures to NAMES
 *  (`BluetoothPermissionError`, `ScanTimeoutError`) before they ever reach
 *  this function, so only web-transport prose ever reaches the regexes
 *  below — the two name checks are what let a native rejection skip that
 *  prose matching entirely. A dismissed picker is the ORDINARY outcome (the
 *  rower changed their mind), and both adapters surface it as a
 *  `NotFoundError`-shaped rejection — Web Bluetooth's "User cancelled the
 *  requestDevice() chooser", the Capacitor client's own cancellation. The
 *  same `NotFoundError` name is ALSO what Chrome uses when the ADAPTER is
 *  unavailable, so the message is what separates those two.
 *
 *  Everything else is `"link-failed"`, not `"bluetooth-off"` (task-4
 *  review, MEDIUM-4): a `connect()` that throws after the rower already
 *  picked a device is a failure of THAT LINK, and telling them to check a
 *  Bluetooth stack that just produced a working picker is advice for a
 *  problem they do not have. `"bluetooth-off"` is reserved for the branch
 *  the `unavailable` test isolates, where "turn Bluetooth on" is the real
 *  remedy. */
function mapRadioFailure(err: unknown): ConnectedError {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  // ORDERING PIN: these two name checks come BEFORE the message-regex arms
  // below on purpose. A `BluetoothPermissionError`'s message can itself
  // match the `unavailable` regex (a plugin whose denied-permission string
  // happens to mention the adapter) — the name is what the Capacitor
  // transport deliberately set, and it must win over prose sniffing.
  if (name === "BluetoothPermissionError") {
    return {
      reason: "permission-denied",
      detail:
        "Ergomatic can't reach your PM5 without Bluetooth. Allow Bluetooth for Ergomatic in Settings, then come back and try again.",
      raw: message,
    };
  }
  if (name === "ScanTimeoutError") {
    return {
      reason: "scan-dismissed",
      detail: "The search took too long. Try again.",
      raw: message,
    };
  }
  const unavailable =
    /adapter|not enabled|not available|unavailable|disabled|powered off|turned off/i.test(
      message,
    );
  if (unavailable) {
    return {
      reason: "bluetooth-off",
      detail: "Bluetooth isn't available.",
      raw: message,
    };
  }
  if (name === "NotFoundError" || /cancel/i.test(message)) {
    return {
      reason: "scan-dismissed",
      detail: "No monitor was picked.",
      raw: message,
    };
  }
  return {
    reason: "link-failed",
    detail: "The link to the monitor failed.",
    raw: message,
  };
}

export function useMonitorSession(
  deps: MonitorSessionDeps = {},
): MonitorSession {
  const [state, setState] = useState<SessionState>(INITIAL_STATE);

  // `state` mirrored into a ref, updated SYNCHRONOUSLY by `update` below.
  // Every decision in this file reads the ref, never `state`: React batches
  // `setState`, so a second call within the same tick would otherwise still
  // see the phase the first one had already moved off — which is precisely
  // the double-fire the spec's I6 ruling makes a designed protection rather
  // than an assertion (`program`'s own comment).
  const stateRef = useRef(state);
  // Read at call time, never captured: `deps` is a fresh object literal on
  // every render for the default `useMonitorSession()` call, so closing
  // over it would either churn every callback's identity or staleness one.
  const depsRef = useRef(deps);
  // Refreshed in an effect, never during render (the `react-hooks/refs`
  // rule, and the reason behind it): the initial `useRef(deps)` already
  // has the mount-time value, and nothing here can be CALLED before the
  // first effect has run — every method is reached from a rower's press.
  useEffect(() => {
    depsRef.current = deps;
  });

  const driverRef = useRef<MonitorDriver | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  /** The log this session's driver is writing into, kept so `exportLog()`
   *  can read it. Deliberately NOT cleared by `teardown` OR by `cancel()`.
   *
   *  The reason, corrected (task-7 review, L1 — this comment used to name
   *  the `ended` frame too, and `ended` cannot reach the sheet): the
   *  diagnostics sheet is opened by triple-tapping a PAGER TARGET, and
   *  `ConnectedSurface` returns its ended hand-off frame BEFORE the pager
   *  renders at all. `disconnected` is the frame that can, and it is the one
   *  that matters — the link is gone, the rower is looking for why, and the
   *  trace of the session that just lost its monitor is what a bug report
   *  needs. A `cancel()`-ed attempt keeps its trace for the same reason. The
   *  next `connect()` replaces it. */
  const logRef = useRef<MonitorEventLog | null>(null);
  /** THIS SESSION'S OWN RECORD — opened at `live`, closed exactly once.
   *  The single source of truth for "is a run of ours open?"; nothing here
   *  re-derives that from global storage (see the header note on M-2). */
  const runRef = useRef<MonitorRun | null>(null);
  /** What the next `live` transition will file the record under — captured
   *  at `program()` (the only moment the caller tells us what workout this
   *  is), not at `live`. */
  const identityRef = useRef(NO_IDENTITY);
  const freezeRef = useRef<FreezeRun>(NO_FREEZE);
  /** The `ready`-only streak behind `ROWING_ACTIVE_FALLBACK_FRAMES`. Only
   *  ever written while the phase is `ready`; once the session is live it is
   *  dead weight until the next `cancel()` clears it. */
  const rowingStreakRef = useRef<RowingStreak | null>(null);
  /** Phase LL Task 4 (design spec §4's continuity rule), widened to all
   *  three axes by F2a (design spec 2026-08-23-continuity-corroboration
   *  §2): the last live frame's own `totalWorkDistanceMeters`,
   *  `elapsedSeconds`, and `distanceMeters` together — the exact reading
   *  `continuity.ts`'s `ContinuityReading` conjoins — tracked
   *  independently of `state.frame` so a value survives exactly the
   *  instant the stream goes suspect (nothing overwrites this ref while
   *  frames aren't arriving). `null` before this run's first live frame,
   *  or once `cancel()` clears it for the next one — never re-derived
   *  from `state.frame` directly, the same "own it in a ref" discipline
   *  `freezeRef`/`rowingStreakRef` already use for per-run tracking a
   *  render cycle must not lose.
   *
   *  F2b (storage-spine design spec 2026-08-23 §4, PR 3 Task 2): gains
   *  `intervalCount?`, the same frame's own `rawIntervalCount`. The
   *  EXISTING null semantics are unchanged, not widened: a frame without
   *  `totalWorkDistanceMeters` still skips this snapshot WHOLESALE (both
   *  assignment sites below keep their `undefined` guard on that field
   *  alone) — a frame WITH `totalWorkDistanceMeters` but no
   *  `rawIntervalCount` yet carries a real snapshot with `intervalCount`
   *  absent, exactly `ContinuityReading`'s own "missing on either side
   *  falls back to F2a" contract expects. */
  const lastContinuityRef = useRef<{
    totalWorkDistanceMeters: number;
    elapsedSeconds: number;
    distanceMeters: number;
    intervalCount?: number;
  } | null>(null);
  /** One `connect()` at a time — a second press while the monitor chooser is open
   *  must not open a second one. */
  const connectingRef = useRef(false);
  /** Phase LT spec 2, Task 2. This session's own in-memory `SeriesRecorder`
   *  (Task 1) — created at the exact moment `runRef` opens (the ready ->
   *  live promotion in `handleFrame` below), fed every live frame, stopped
   *  and dropped at close. Never a second source of truth for what got
   *  persisted: the recorder owns its own buffer, and this hook only ever
   *  flushes SNAPSHOTS of it onto `runRef`'s record via `withSeries` below. */
  const seriesRecorderRef = useRef<SeriesRecorder | null>(null);
  /** The 30-second flush timer's own canceller (`SERIES_FLUSH_INTERVAL_MS`),
   *  or `null` when none is running — no run open, or the run has already
   *  closed. Mirrors `handoffHoldRef`'s own "canceller or null" shape. */
  const seriesFlushCancelRef = useRef<(() => void) | null>(null);
  /** Phase LL Task 1 (link-truth design spec §1): whatever `connect()`'s
   *  own transport resolved to, IF it carries a liveness `snapshot()` —
   *  every REAL path does (`defaultTransport` composes `withLiveness` on
   *  both platform arms), a test's own `MonitorSessionDeps.createTransport`
   *  override typically does not, and that is fine: `fail()` below reads
   *  this optionally, exactly the way it already treats every other
   *  optional diagnostic. Set the instant `connect()`'s transport resolves
   *  (before `scan()`/`connect()` can fail), so a failure mid-pairing still
   *  gets whatever the decorator had already seen. Never explicitly
   *  cleared — the next `connect()` simply overwrites it, same lifecycle
   *  `logRef` already has (that ref's own comment explains why nothing
   *  here nulls a diagnostic ref on teardown). */
  const livenessRef = useRef<{ snapshot(): LivenessSnapshot } | null>(null);
  /** This hook's OWN numeric clock (Phase LL Task 1) — NOT
   *  `MonitorSessionDeps.now` (that one returns a `Date`, for the record's
   *  ISO stamps only) and NOT `MonitorSessionDeps.schedule` (that one is
   *  reserved for `FINISH_HANDOFF_HOLD_MS`, deliberately kept separate from
   *  the series-flush schedule for the same reason — a call-count-sensitive
   *  test suite already exists against it, `useMonitorSession.test.ts`'s
   *  own `manualSchedule()`). The liveness decorator needs its OWN
   *  monotonic-ms clock, matching `DriverOptions.now`/`ReplayClock`'s own
   *  shape (`liveness.ts`'s header: the injected clock is not optional) —
   *  a THIRD schedule seam, not a reuse of either existing one, so this
   *  file's own tests never have to account for a watchdog timer they
   *  never asked for. `onSilence`/`onRecovery` are thin arrows that read
   *  `logRef.current` AT CALL TIME (never during render — `recordLiveness
   *  Silence`/`recordLivenessRecovery`'s own doc comments explain why they
   *  take the dereferenced log rather than the ref itself) because the
   *  transport — and
   *  this liveness wrapper around it — is built BEFORE `connect()` ever
   *  creates the log (`createTransport` runs first; `createLog` runs only
   *  after `transport.connect()` resolves, below). A plain `useRef`
   *  initialiser, never rebuilt: every test that reaches this file's own
   *  default composition gets ONE real `Date.now`/`setTimeout` pair for
   *  the whole hook's life, same as `defaultTransport`'s own production
   *  default would be built exactly once per real connect. */
  const update = useCallback((patch: Partial<SessionState>): void => {
    stateRef.current = { ...stateRef.current, ...patch };
    setState(stateRef.current);
  }, []);

  /** Phase LL Task 2: the retract timer's own canceller, or `null` when
   *  no hysteresis window is currently running (no silence has ever fired,
   *  or the window already ran to completion and cleared `frameSilence`).
   *  Owned entirely by the `onSilence`/`onRecovery` closures immediately
   *  below — nothing else in this hook reads or writes it. */
  const hysteresisCancelRef = useRef<CancelFn | null>(null);
  /** Phase LL Task 2 mechanism 3: the degraded-characteristic
   *  subscription's own unsubscribe, or `null` when the current transport
   *  never exposed `onCharacteristicDegraded` (a bare test
   *  `Transport` — `capacitorBle.ts`, `fake.ts` AND the web arm all
   *  carry it now; the web arm gained its fan-out at PR #167's C1 fix). Overwritten (never accumulated) on each `connect()`,
   *  same lifecycle `unsubscribeRef` already has. */
  const degradedUnsubRef = useRef<(() => void) | null>(null);
  /** Phase LL Task 2 mechanism 2: the app-lifecycle listener's own
   *  unsubscribe, registered once per `connect()` (adapter layer only —
   *  `registerAppLifecycleListener`'s own header). `null` before a
   *  connect's registration has resolved, or after `teardown()` has run
   *  it. */
  const lifecycleUnsubRef = useRef<(() => void) | null>(null);
  /** Whole-branch review minor 1 (the native lifecycle unsub race): the
   *  NATIVE arm's own `registerAppLifecycleListener` returns a `Promise`
   *  (`registerNativeAppLifecycleListener`'s own async `addListener`), so
   *  its resolution can land AFTER `fail()`/`teardown()` has already run
   *  and nulled `lifecycleUnsubRef` for THIS attempt — without a token,
   *  the `.then()` below would blindly overwrite the ref regardless, and
   *  if a NEW `connect()` had already registered its OWN real listener by
   *  then, that write silently REPLACES the new attempt's unsub with the
   *  stale one: teardown from then on calls the wrong function, and the
   *  new listener is never unregistered — leaked permanently into every
   *  later session on this hook instance. One token object per attempt,
   *  captured by that attempt's own `.then()` closure (never read back off
   *  this ref by a LATER attempt's closure, which closes over its own
   *  token) — `fail()`/`teardown()` flip `.cancelled` on whichever token is
   *  current at the moment they run, which is always this attempt's own:
   *  `connect()` is single-flight (`connectingRef`), so at most one
   *  attempt is ever open. */
  const lifecycleAttemptRef = useRef<{ cancelled: boolean } | null>(null);

  const livenessDepsRef = useRef<LivenessDeps>({
    now: () => Date.now(),
    schedule: defaultLivenessSchedule,
    onSilence: (ms) => {
      handleFrameSilence(
        update,
        hysteresisCancelRef.current,
        logRef.current,
        ms,
      );
      hysteresisCancelRef.current = null;
    },
    onRecovery: () => {
      hysteresisCancelRef.current = handleFrameRecovery(
        update,
        hysteresisCancelRef.current,
        defaultLivenessSchedule,
        logRef.current,
      );
    },
  });

  const nowDate = useCallback(
    (): Date => depsRef.current.now?.() ?? new Date(),
    [],
  );

  /** Attaches the recorder's CURRENT snapshot onto `run`, or returns `run`
   *  UNCHANGED — the exact same reference — when there is nothing new to
   *  attach: no recorder (never opened, or already stopped at close), or
   *  no sample yet (`snapshot()` is `undefined` until the first one,
   *  `seriesRecorder.ts`'s own doc comment). The unchanged-reference case is
   *  load-bearing, not incidental: the boundary handler below tells "this
   *  candidate really is a fresh object" from "there was nothing to add" by
   *  this same identity check, and the 30-second flush uses it to skip a
   *  pointless write when the recorder has produced nothing since the run
   *  opened. */
  const withSeries = useCallback((run: MonitorRun): MonitorRun => {
    const series = seriesRecorderRef.current?.snapshot();
    return series === undefined ? run : { ...run, series };
  }, []);

  /** Cancels the 30-second flush timer, if one is running. A no-op
   *  otherwise, so every stop site (close, teardown) can call it
   *  unconditionally — the same idiom `releaseHandoff` already uses for its
   *  own canceller-or-null ref. */
  const stopSeriesFlush = useCallback((): void => {
    seriesFlushCancelRef.current?.();
    seriesFlushCancelRef.current = null;
  }, []);

  /** Starts the 30-second flush (design spec §2's flush policy) — one per
   *  run, cancelled at close or teardown (`stopSeriesFlush`). Each tick
   *  re-snapshots the recorder and, only if it actually has something new
   *  (the `withSeries` identity check), re-persists the run carrying it —
   *  the ONE of the three flush points that fires on nothing but elapsed
   *  time, independent of any boundary or the close write. Guards
   *  `completedAt` defensively even though every call site also cancels
   *  this timer at close: a tick already in flight when close runs must
   *  never resurrect a record this same render just finished. */
  const startSeriesFlush = useCallback((): void => {
    stopSeriesFlush();
    const schedule =
      depsRef.current.seriesFlushSchedule ?? defaultSeriesFlushSchedule;
    seriesFlushCancelRef.current = schedule(() => {
      const run = runRef.current;
      if (run === null || run.completedAt !== null) return;
      const next = withSeries(run);
      // BELT-AND-BRACES, same class as `mapProgramFailure`'s own `error:
      // null` (task-4 review, LOW-5): `next === run` only when the recorder
      // has produced ZERO samples, and the recorder is always created and
      // fed the very SAME first live frame that opens `run` (`handleFrame`'s
      // "ready" branch) — the first frame always wins bucket 0 regardless
      // of its own `elapsedSeconds` (`seriesRecorder.ts`'s own
      // `lastEmittedBucket` starts at -1), so an OPEN run's recorder always
      // has at least one sample by construction. Currently unreachable
      // (a mutant removing this line is expected to survive); kept because
      // that invariant should not rest on a second function's ordering, and
      // a future change to WHEN the recorder is created should not have to
      // rediscover this guard's absence the hard way.
      if (next === run) return;
      runRef.current = next;
      saveMonitorRun(next);
    }, SERIES_FLUSH_INTERVAL_MS);
  }, [withSeries, stopSeriesFlush]);

  /** Stamps `completedAt` on our own run, if one is open. The record's own
   *  `completeMonitorRun` is idempotent too; this guard is here so the
   *  CALLER's decisions ("has this already ended?") read off one place.
   *
   *  **Phase LT spec 2, Task 2 — the CLOSE flush.** The last of the three
   *  flush points (§2's flush policy): the recorder's final snapshot is
   *  attached BEFORE `completeMonitorRun` runs, so the one write that
   *  closes the record also carries whatever trace accumulated since the
   *  last boundary or timer tick — never a second write chasing the first.
   *  The recorder then STOPS (spec's own words) and this ref is dropped: a
   *  finish-grace actual that reaches `handleEvent` after this runs must
   *  find no recorder to attach anything from, which is what makes "the
   *  series does not grow" after close true by construction rather than by
   *  a second guard duplicating this one.
   *
   *  **Phase LL Task 4 (design spec §4): `endedBy` is now a REQUIRED
   *  second argument.** Every one of this function's three call sites
   *  passes the one `CloseReason` its own writer honestly knows — see
   *  each call site's own comment for which, and `CloseReason`'s own doc
   *  comment (`monitorRun.ts`) for the full table. There is deliberately
   *  no default: a close that could omit the reason would silently
   *  recreate the exact `terminated: true` conflation this task exists to
   *  end. */
  const closeRecord = useCallback(
    (terminated: boolean, endedBy: CloseReason): void => {
      const run = runRef.current;
      if (run === null || run.completedAt !== null) return;
      const withFinalSeries = withSeries(run);
      runRef.current = completeMonitorRun(
        withFinalSeries,
        { terminated, endedBy },
        nowDate(),
      );
      stopSeriesFlush();
      seriesRecorderRef.current?.stop();
      seriesRecorderRef.current = null;
    },
    [nowDate, withSeries, stopSeriesFlush],
  );

  /** The live finish hold: its backstop's canceller, or `null` when no hold
   *  is open. One at a time — a run ends once. */
  const handoffHoldRef = useRef<(() => void) | null>(null);

  /** Storage-spine design spec §2's late side (PR 1, Task 3): while a
   *  natural-finish teardown is in its burst linger, this holds the
   *  function that finishes it early — set by `teardown` right before it
   *  defers, cleared the moment it runs (by whichever of the two triggers
   *  gets there first: the `summary-observations` handler below, or the
   *  linger's own `BURST_LINGER_MS` timeout). `null` at every other time,
   *  including every OTHER teardown cause, so a `summary-observations`
   *  event arriving outside a linger (the ordinary in-grace "split-won"
   *  case, still mounted) finds nothing here to call. */
  const lingerFinishRef = useRef<(() => void) | null>(null);

  /** The burst linger's own timeout canceller (`schedule`'s return value),
   *  or `null` when no linger is currently running. A ref, not a local
   *  variable inside `teardown`, matching `handoffHoldRef`'s own idiom
   *  immediately below: `finish` (the linger's completion, defined inside
   *  `teardown`) needs to cancel this timer from whichever trigger reaches
   *  it first, and assigning across that boundary through a plain closure
   *  variable trips `react-hooks/immutability` — the reassignment lands in
   *  the outer scope after the closure that reads it has already been
   *  handed off (to `lingerFinishRef.current` above). */
  const burstLingerCancelRef = useRef<(() => void) | null>(null);

  /** Ends the hand-off hold, whatever ended it, and says so in the trace.
   *  A no-op when nothing is held, so every release site can call it
   *  unconditionally. */
  const releaseHandoff = useCallback(
    (reason: "final-boundary" | "backstop" | "teardown"): void => {
      const cancel = handoffHoldRef.current;
      if (cancel === null) return;
      handoffHoldRef.current = null;
      cancel();
      logRef.current?.record(
        "handoff-released",
        `${reason} — the ended hand-off is free to navigate (${stateRef.current.actuals.length} actual(s) measured)`,
      );
      update({ handoffHeld: false });
    },
    [update],
  );

  /** Opens the hold if — and only if — this run is still missing the actual
   *  the machine's own finish is about to deliver (walk day 2,
   *  `FINISH_HANDOFF_HOLD_MS`). Returns whether it opened, so the caller can
   *  set `handoffHeld` in the SAME state patch that flips the phase (one
   *  render, not two: a `handoffHeld: false` frame between them would let
   *  the surface hand off before the hold ever existed).
   *
   *  "Missing" is the record's own question, asked the record's own way: is
   *  there an actual for the program's LAST interval? That is the only
   *  boundary the driver's finish grace can still deliver
   *  (`monitorRun.ts`'s `acceptableFinalBoundary`), so a run that already has
   *  it — the desktop order, where the split arrives BEFORE the finished tick
   *  — waits for nothing and pays nothing. */
  const openHandoffHold = useCallback((): boolean => {
    // No record, nothing to wait FOR: a program that armed and finished
    // without the rower ever pulling never reached `live`, so this hook
    // opened no run (`endByMachine` still ends the session — the driver's
    // own run was real — it just has no actuals to be missing).
    const run = runRef.current;
    if (run === null) return false;
    // No separate guard for a program with no intervals at all: `lastIndex`
    // would be `-1`, no actual can carry that index, and the hold would open
    // and close on its own backstop a quarter second later. `compileProgram`
    // cannot produce one (its no-work guard) and `createMonitorRun` is only
    // ever handed a compiled program, so the branch would be unreachable
    // code wearing a guard's clothes — and its worst case, if the premise
    // ever broke, is a bounded 250 ms delay rather than anything wrong.
    const lastIndex = run.program.intervals.length - 1;
    if (run.actuals.some((a) => a.index === lastIndex)) return false;
    const schedule =
      depsRef.current.schedule ??
      ((cb: () => void, ms: number): (() => void) => {
        const id = setTimeout(cb, ms);
        return () => clearTimeout(id);
      });
    handoffHoldRef.current = schedule(
      () => releaseHandoff("backstop"),
      FINISH_HANDOFF_HOLD_MS,
    );
    logRef.current?.record(
      "handoff-hold",
      `machine finish with interval ${lastIndex} unmeasured — holding the ended hand-off up to ${FINISH_HANDOFF_HOLD_MS}ms for its split (walk day 2: navigating tears down the subscription the split arrives on)`,
    );
    return true;
  }, [releaseHandoff]);

  const handleFrame = useCallback(
    (frame: MonitorFrame, driver: MonitorDriver): void => {
      const phase = stateRef.current.phase;
      // FIRST ROWING FRAME WITH FLYWHEEL EVIDENCE -> live (spec §2:
      // every transition maps to a real event or frame field). Two
      // hardware recordings narrowed this, 2026-08-08:
      // - The state ordinal alone is NOT the rower's first pull: a
      //   just-armed PM5 at "row to begin" already reports a
      //   rowing-mapped workout state (recording 1 — READY skipped its
      //   own "Show me the numbers" tap two seconds after arming).
      // - `elapsedSeconds > 0` is not the pull either: the PM5 runs the
      //   WORKOUT CLOCK at row-to-begin (recording 2 — TOTAL LEFT read
      //   1:52 with 0 meters and rate 0, and the elapsed-or-distance
      //   version of this gate skipped READY all over again).
      // What only a real pull produces is FLYWHEEL evidence: banked
      // distance or a registered stroke rate. And walk 3 added the
      // machine's own word: a COASTING flywheel banks meters on a piece
      // the PM5 itself does not consider started ("the pm5 knew i didnt
      // start the interval") — 0x0031's Rowing State byte is where it
      // says so, and `rowingActive` is that byte. All three legs are
      // required: the workout-state ordinal (rowing-mapped), the
      // machine's own Active declaration, and flywheel evidence — which is
      // BANKED DISTANCE, and only that. `spm > 0` used to be a second,
      // disjunctive form of flywheel evidence and was dropped by the
      // erg-day review (MEDIUM-2): the capture shows spm SURVIVING the
      // resets distance honours. At an `idle -> armed` transition
      // (`pm5-session3-final.log:5582`) and at the no-rest boundary the
      // paused fixture is built from (`:2837`) elapsed and distance zero
      // while split and spm carry the PREVIOUS interval's values over. A
      // mid-session reprogram landing a rowing-mapped frame while spm is
      // still pinned would satisfy an spm leg with zero flywheel evidence
      // for THIS piece — the same class of bug walk 3 found through the
      // other leg. Distance has the reset semantics this gate wants, and
      // every real first-rowing frame in the record carries it. That is
      // also why this stays `frame.distanceMeters` and NOT Phase 7B's
      // accumulated `sessionDistanceMeters`: the accumulated field never
      // returns to zero once a session has banked meters, so it would let a
      // frame through on the PREVIOUS piece's distance. INTERVAL-scoped on
      // purpose, exactly like `freezeKey`.
      //
      // This is also where the run opens: the record exists once the rower
      // is actually rowing, never at `armed` — a programmed-then-abandoned
      // workout leaves no record behind, and `createMonitorRun`'s
      // `clearRun()` (which destroys a phone session) fires only once
      // this session is genuinely underway.
      if (phase === "ready") {
        const streak = nextRowingStreak(rowingStreakRef.current, frame);
        rowingStreakRef.current = streak;
        const declared =
          frame.state === "rowing" &&
          frame.rowingActive &&
          frame.distanceMeters > 0;
        // `ROWING_ACTIVE_FALLBACK_FRAMES`' own comment carries the whole
        // rationale: a stuck Inactive byte must not cost the rower a
        // session.
        const fallback =
          !declared &&
          streak !== null &&
          streak.frames >= ROWING_ACTIVE_FALLBACK_FRAMES;
        if (declared || fallback) {
          if (fallback) {
            // The hook reaches the wire log only through the ref it owns.
            // This was the ONE entry it wrote until walk day 2 added three
            // more (`handoff-hold`/`handoff-released` around the ended
            // hand-off, and `record-actual` for every actual the record is
            // offered) — hook-side observability lives at those four
            // `logRef.current?.record` sites and nowhere else. This one
            // answers "did the machine ever say Active?" from a stashed
            // trace after the fact.
            logRef.current?.record(
              "rowing-active-fallback",
              `state=${frame.state} elapsed=${frame.elapsedSeconds} ` +
                `distance=${frame.distanceMeters} ` +
                `rowingActive=${frame.rowingActive} spm=${frame.spm}`,
            );
          }
          const identity = identityRef.current;
          // Phase LT spec 2, Task 2: the recorder opens in the SAME instant
          // the record does — this is the "the record exists once the
          // rower is actually rowing" moment `createMonitorRun`'s own call
          // below is already keyed on, and the recorder's own work clock
          // wants that first frame too (it can win a whole-second bucket
          // immediately, `seriesRecorder.ts`'s own "first-frame-wins" doc
          // comment). Fed BEFORE `createMonitorRun` so a caller who reads
          // `runOpen: true` off this same `update()` could in principle
          // already find a recorder producing samples, though nothing reads
          // it until the first flush.
          seriesRecorderRef.current = createSeriesRecorder();
          seriesRecorderRef.current.onFrame(frame);
          runRef.current = createMonitorRun(
            {
              workoutId: identity.workoutId,
              title: identity.title,
              // The program we actually sent, not one re-derived from the
              // wire (spec §4: "nothing re-derived from bytes").
              program: identity.program,
              // The REAL advertised name the picker returned, threaded
              // through `createPm5Driver` by Task 1 — never the `"PM5"`
              // placeholder (spec's I5 ruling). Read off the driver that
              // delivered this very frame, so there is no "which driver?"
              // question to answer here.
              deviceName: driver.capabilities.deviceName,
              // The frozen log identity `program()`'s caller built alongside
              // `identity.program` (7C Task 1) — threaded straight through,
              // never re-derived here.
              logSeed: identity.logSeed,
            },
            nowDate(),
          );
          startSeriesFlush();
          const freeze = nextFreezeRun(null, frame);
          freezeRef.current = freeze;
          // Phase LL Task 4: seed the continuity baseline from this run's
          // very first live frame — the "live" branch below only ever
          // compares against a PRIOR frame of THIS run, never a stale
          // reading a previous run left behind (`cancel()` clears this ref
          // too, but the very first frame of a fresh run reaches this
          // branch, not that one, so it needs its own seed here). F2a
          // widened the snapshot to all three axes; the `undefined` arm
          // is defensive, not reachable from this file's own test suite:
          // every REAL frame construction (`toMonitorFrame`/`driver.ts`'s
          // own spread-through) always sets `totalWorkDistanceMeters` —
          // only a `MonitorFrame` a future caller built BARE (bypassing
          // both) could ever omit it, the same "additive-optional,
          // coverage-exempt fallback" shape `domain/monitor/types.ts`'s
          // own doc comment on this field already names. F2b: the
          // `undefined` guard stays keyed on `totalWorkDistanceMeters`
          // alone (this ref's own doc comment) — `rawIntervalCount` rides
          // along whether or not it has arrived yet.
          lastContinuityRef.current =
            frame.totalWorkDistanceMeters === undefined
              ? null
              : {
                  totalWorkDistanceMeters: frame.totalWorkDistanceMeters,
                  elapsedSeconds: frame.elapsedSeconds,
                  distanceMeters: frame.distanceMeters,
                  intervalCount: frame.rawIntervalCount,
                };
          update({
            frame,
            phase: "live",
            actuals: [],
            frozen: isPausedRun(freeze),
            runOpen: true,
          });
          return;
        }
      }
      if (phase === "live") {
        // THE PREDICATE IS UNCHANGED (task 5); only how it's PUBLISHED is —
        // via `frozen` (Task 1's fact), never by moving `phase` off `"live"`.
        // A frozen session is still a live one: the driver is still
        // talking, the record is still open, nothing about "which session
        // state is this" actually changed when the erg stopped. `phase`
        // stays `"live"` through the whole freeze-and-resume; only `frozen`
        // flips.
        //
        // Phase LT spec 2, Task 2: every live frame feeds the recorder too
        // — its own decimation is what turns this per-frame stream into a
        // 1 Hz series; nothing about frozen/paused changes that (a stopped
        // erg's frames simply never cross a new whole work-second, so a
        // freeze naturally produces no samples of its own, the same "zero
        // for free" the recorder's rest handling already relies on).
        seriesRecorderRef.current?.onFrame(frame);
        // Phase LL Task 4 (design spec §4's continuity rule; Task 2's own
        // consumption seam, `useMonitorSession.ts`'s app-lifecycle/
        // watchdog comments above: "§4's continuity rule ... is what
        // should ultimately arbitrate a resumed stream"). Runs whenever
        // the banner currently considers the stream suspect
        // (`frameSilence`) — covers BOTH suspect sources (a genuine
        // watchdog silence and an app-lifecycle resume both latch
        // `frameSilence` the identical way, so both resume through this
        // same check). Deliberately NOT gated to "only the very first
        // frame after suspicion": `applyContinuityCheck` re-checking every
        // frame until the hysteresis retracts the banner is strictly
        // safer (a delayed jump inside that window is still caught) and
        // costs nothing once a `"reset"` verdict has closed the run
        // (`run.completedAt !== null` short-circuits every further call).
        // Proven end to end at the hook level via `transports/replay.ts`
        // (Task 4 review F3/I6): a recording whose frames are REAL bytes
        // in ARTIFICIAL order — the tail-then-head pair the pure-level
        // pin already uses — drives the real driver through this exact
        // composition, `applyContinuityCheck`'s own decision logic is
        // mutation-tested exhaustively in isolation, and the NO-OP path
        // is proven separately (the healthy-resume hook test, same
        // file) — see `useMonitorSession.test.ts`'s own describe block
        // for all three.
        const closed = applyContinuityCheck(
          runRef.current,
          lastContinuityRef.current,
          frame,
          stateRef.current.frameSilence,
          nowDate(),
          logRef.current,
        );
        // `closed !== null` narrows for TS (`applyContinuityCheck`'s own
        // general signature returns `MonitorRun | null`, echoing its
        // input) — never actually reachable as null here: the only way
        // this branch's other half (`closed !== runRef.current`) is true
        // is a genuine `completeContinuityReset` result, which is always
        // a full `MonitorRun`.
        if (closed !== null && closed !== runRef.current) {
          // Whole-branch review minor 2: fold the recorder's own trace
          // into the just-closed record — the SAME `withSeries` step
          // `closeRecord` always takes before a completion write, applied
          // here too rather than skipped. Without this, `completeContinuityReset`
          // (a pure transform with no access to the recorder) persists a
          // record with no `series` at all — up to 30s of trace lost on
          // the one close whose whole point is "preserve the interrupted
          // record." `applyContinuityCheck`'s own "same reference" no-op
          // contract is read off the UNFOLDED `closed` above, on purpose:
          // `withSeries` always returns a NEW object when a snapshot
          // exists, so comparing against ITS result here would make every
          // live frame with recorder data look like a fresh reset.
          const withFinalSeries = withSeries(closed);
          runRef.current = withFinalSeries;
          if (withFinalSeries !== closed) saveMonitorRun(withFinalSeries);
          // Same two steps `closeRecord` always takes after its own
          // completion write: the 30s flush timer would otherwise keep
          // firing into a record that can never accept another write, and
          // the recorder itself would keep running with nothing left to
          // read its snapshots.
          stopSeriesFlush();
          seriesRecorderRef.current?.stop();
          seriesRecorderRef.current = null;
          // RULED at Task 4's own review (F2/I2): every sibling close in
          // this file pairs the record close with THIS SAME
          // `phase: "ended"`/`runOpen: false` surface update, in the same
          // statement — a reset that closed the record silently left the
          // banner to retract on its own hysteresis and the rower rowing
          // into a closed record with the app still showing `live`, in
          // the phase whose own subject is "the app says so." `endedBy:
          // "user"` (this hook's own LOCAL session-state field, distinct
          // from the `MonitorRun.endedBy` `completeContinuityReset` just
          // stamped): the binary choice this field has always offered is
          // "did the MACHINE report it" vs. everything else, and a
          // continuity reset is emphatically not a machine report — it
          // is this app's own decision, the same bucket the rower's own
          // End press already occupies, and `ConnectedSurface.tsx`'s own
          // `=== "machine"` ternary reads it that way: anything else
          // renders the neutral "Your numbers are kept," never a false
          // "The monitor finished it." No handoff hold: a reset is not a
          // natural finish (no boundary is coming), the same reasoning
          // `endByMachine`'s own `terminated` branch already uses to
          // skip `openHandoffHold()`.
          update({ phase: "ended", endedBy: "user", runOpen: false });
        }
        // Same defensive, test-suite-unreachable fallback arm as the seed
        // above — every real frame reaching this branch already carries
        // the field. F2b: `rawIntervalCount` rides along, same guard.
        lastContinuityRef.current =
          frame.totalWorkDistanceMeters === undefined
            ? lastContinuityRef.current
            : {
                totalWorkDistanceMeters: frame.totalWorkDistanceMeters,
                elapsedSeconds: frame.elapsedSeconds,
                distanceMeters: frame.distanceMeters,
                intervalCount: frame.rawIntervalCount,
              };
        const freeze = nextFreezeRun(freezeRef.current, frame);
        freezeRef.current = freeze;
        update({ frame, frozen: isPausedRun(freeze) });
        return;
      }
      // Every other phase still SEES the frame (the machine's current
      // reading is true whether or not we are driving it — the panes read
      // it, and `armed`/`finished` ticks keep arriving for the life of the
      // transport) but no phase moves on it.
      update({ frame });
    },
    [nowDate, update, startSeriesFlush, withSeries, stopSeriesFlush],
  );

  /** A terminal event from the machine: `workoutComplete` (an honest
   *  WORKOUTEND) or `terminated` (ended on the PM5's own menu). Both are
   *  ORDINARY paths, not edge cases — spec §2 — and both reach `ended`
   *  with `endedBy: "machine"`. */
  const endByMachine = useCallback(
    (terminated: boolean): void => {
      // THE P3b PIN: a run this hook has already CLOSED does not get
      // re-opened or re-ended by the machine's own later terminal event.
      // The driver's `activeRun` cannot be closed from outside (there is no
      // API for it), so after a P3b close — or after End — the driver will
      // still, correctly, emit `workoutComplete`/`terminated` for the run
      // IT still considers open. Those events are about a record we already
      // finished; ignoring them here is what keeps the two lifetimes from
      // disagreeing (spec's P3b decision, "pinned by test").
      const run = runRef.current;
      if (run !== null && run.completedAt !== null) return;
      // Idempotence against End: `endSession()` sets `ended` before it ever
      // awaits, so a terminal event racing its `terminate()` finds this.
      if (stateRef.current.phase === "ended") return;
      // Phase LL Task 4 (design spec §4's writer table): `terminated` here
      // is ALSO which `CloseReason` applies — `false` is an honest
      // WORKOUTEND (`"finished"`); `true` is a TERMINATE, and a TERMINATE
      // reaching this hook at all is, by construction, link-up (the frame
      // arrived) — the same fact the End button's `linkGone === false`
      // branch records, learned a different way. FINDING (task-4 brief did
      // not name this call site explicitly; the spec's own writer table
      // lists only "machine WORKOUTEND -> finished" — this reading is the
      // honest extension, not a guess: the existing test for this exact
      // path is titled "a MACHINE-TERMINATED ending" and its own comment
      // says "the rower stopped the piece at the erg", the identical fact
      // `"rower"` already means for the End-button path). See
      // `MonitorRun.endedBy`'s own doc comment (`monitorRun.ts`) for the
      // full table.
      closeRecord(terminated, terminated ? "rower" : "finished");
      // THE HAND-OFF HOLD (walk day 2). Only a natural FINISH opens one: a
      // `terminated` close opens no finish grace in the driver either
      // (CSAFE-DEF footnote 12 — the Split/Interval Number is unstable when
      // a workout is terminated mid-interval), so there is no boundary to
      // wait for and nothing to hold. The phase flips either way, in one
      // patch with the hold flag.
      const held = terminated ? false : openHandoffHold();
      update({
        phase: "ended",
        endedBy: "machine",
        handoffHeld: held,
        runOpen: false,
      });
    },
    [closeRecord, openHandoffHold, update],
  );

  /** `driver` is the one that emitted the event — passed rather than read
   *  back out of the ref, so the frame path can reach `capabilities`
   *  without a null question nobody can answer differently. */
  const handleEvent = useCallback(
    (event: MonitorEvent, driver: MonitorDriver): void => {
      if (event.kind === "frame") {
        handleFrame(event.frame, driver);
        // NOTHING about a frame touches the hand-off hold (walk day 3). A
        // status tick after the machine's finish used to release it, on the
        // premise that `driver.ts`'s finish grace expired at that same tick
        // and so nothing could still be coming. Day 3's stash disproved the
        // premise at both layers at once: the PM5 keeps ticking identical
        // `finished` frames and the split pair arrives LATER than one of
        // them, so a tick-keyed release measures the machine's cadence and
        // shuts the door on the data. The hold now ends on the boundary
        // itself, or on its own bounded backstop, and on nothing else.
        return;
      }
      if (event.kind === "armed") {
        // The driver emits this only after `verifyArmed` has confirmed the
        // machine is holding OUR program (structure and all) — so "ready"
        // means ready, not "the ack came back".
        //
        // The `error: null` is belt-and-braces and known to be so (task-4
        // review, LOW-5: a mutant removing it survives). `program()` has
        // already cleared the error on its way in, and under the
        // synchronous flip nothing can set one between there and here.
        // Kept because "we are ready" and "an error is on screen" must
        // never be simultaneously true, and that invariant should not rest
        // on a second function's ordering.
        update({ phase: "ready", error: null });
        return;
      }
      if (event.kind === "intervalComplete") {
        // THE FIRST PRODUCTION CALLER of `recordActual` (its own A2 note).
        // Gated on our record being open: a boundary the machine reports
        // outside any run of ours (a rower's JustRow auto-split,
        // post-terminate housekeeping — the driver emits those with
        // `index: null` and a `boundary-out-of-run` log) belongs to no
        // program and must never be filed against one.
        //
        // THE FINISH GRACE (hardware walk 5, 2026-08-10): the ONE boundary
        // that legitimately arrives after this hook already closed the
        // record. At a natural finish the PM5 sends the final interval's
        // 0x0037/0x0038 pair one notification AFTER the general-status frame
        // that ended the workout — `workoutComplete` (and `closeRecord`
        // under it) has therefore already run by the time the actual gets
        // here, which is why a rowed-out 1-interval piece prefilled the log
        // screen with "0 OF 1 INTERVALS MEASURED". The driver marks exactly
        // that event `finalBoundary` and `recordActual` accepts exactly that
        // one late actual (both functions' own doc comments carry the rule);
        // nothing else about the closed record's immutability moves.
        const run = runRef.current;
        if (run === null) return;
        // Phase LT spec 2, Task 2: THE BOUNDARY FLUSH (§2's flush policy —
        // "the hook layer flushes after each boundary write lands"). Rather
        // than a second write chasing `recordActual`'s own, the freshest
        // series snapshot is attached to the CANDIDATE record passed in, so
        // `recordActual`'s single internal `saveMonitorRun` call already
        // carries both the accepted actual and the trace in one write —
        // §4 S1's write-count check is what this collapsing is FOR.
        // `candidate` is `run` itself, same reference, whenever there is
        // nothing new to attach (`withSeries`'s own doc comment on why that
        // matters): acceptance below is decided against `candidate`, not
        // `run`, so a refusal (which `recordActual` returns as the exact
        // object it was given) is still detected correctly even when
        // `candidate !== run`.
        const candidate = withSeries(run);
        const next = recordActual(candidate, event.actual, {
          finalBoundary: event.finalBoundary === true,
        });
        const accepted = next !== candidate;
        // OBSERVABILITY (walk day 2): the fate of every actual this hook is
        // offered, in one entry — what the machine named, whether the driver
        // vouched for it as the finish boundary, whether the record was
        // already closed, and what the record decided. Yesterday's device
        // stash could not distinguish "the split never arrived" from "it
        // arrived and was refused"; this is the entry that answers it.
        logRef.current?.record(
          "record-actual",
          `index=${event.actual.index} finalBoundary=${event.finalBoundary === true} recordClosed=${run.completedAt !== null} -> ${accepted ? "accepted" : "REFUSED (the record returned unchanged)"} (actuals ${run.actuals.length} -> ${next.actuals.length})`,
        );
        // A refusal returns `candidate` itself unchanged — nothing to
        // persist, nothing to re-render, exactly as `recordActual`'s own
        // immutability guard always meant before `candidate` existed.
        if (accepted) {
          runRef.current = next;
          update({ actuals: next.actuals });
        }
        // Whatever the record decided, the boundary the hold was waiting for
        // has now been and gone — the wait is for the SPLIT, not for a
        // successful write (whose outcome the entry above records). Released
        // AFTER the write above so the release's own log entry reports the
        // count the rower is about to be handed, not the one from a moment
        // earlier.
        if (event.finalBoundary === true) releaseHandoff("final-boundary");
        return;
      }
      if (event.kind === "workoutComplete") {
        endByMachine(false);
        return;
      }
      if (event.kind === "terminated") {
        endByMachine(true);
        return;
      }
      if (event.kind === "summary-observations") {
        // THE MACHINE'S OWN FINISH, FOLDED ONTO THE RECORD (storage-spine
        // design spec §2, PR 1 Task 3). `driver.ts`'s own doc comment on
        // this event kind: emitted AT MOST ONCE per run, only for a
        // NATURAL finish, whichever of `reconcileSummary`'s two branches
        // the run took — the driver never fires it for a terminate/END
        // close. `runRef.current` is the identity this write is keyed on;
        // `appendSummaryObservations` re-reads storage fresh rather than
        // trusting it (the same `clearMonitorRun()` resurrection race its
        // own doc comment names), so a `run === null` here just means
        // there is no identity to even ATTEMPT the write with — not a
        // reason to skip trying to finish an open linger, which happens
        // unconditionally below.
        const run = runRef.current;
        if (run !== null) {
          const appended = appendSummaryObservations(run.startedAt, {
            totals: event.totals,
            ...(event.verificationBytes !== undefined
              ? { verificationBytes: event.verificationBytes }
              : {}),
          });
          if (appended !== null) runRef.current = appended;
        }
        // If a natural-finish teardown is mid-linger waiting for exactly
        // this, it finishes NOW rather than at `BURST_LINGER_MS` — "or
        // earlier, on burst completion" (spec §2). `null` at every other
        // time (this ref's own doc comment), so the ordinary in-grace
        // "split-won" case — still mounted, no teardown in flight — finds
        // nothing here and simply returns. Deliberately does NOT null the
        // ref itself here — `finish`'s own body (`teardown`, below) is
        // what clears it, so the identical function stays callable
        // idempotently from EITHER trigger without this call site needing
        // to know which one fired first.
        lingerFinishRef.current?.();
        return;
      }
      if (event.kind === "disconnected") {
        // Lose-and-degrade (spec's C5 ruling): no retry machinery, no
        // reconnect promise, and the record stays OPEN — the erg is still
        // counting, End still works, and the run is still loggable. A
        // session that already ENDED is not dragged back out of `ended` by
        // the drop that follows it.
        //
        // Deliberately NOT a hand-off-hold release (walk day 2): a hold only
        // ever exists after the machine's own finish, and by then the
        // driver's run is CLOSED — which is exactly the case `driver.ts`'s
        // `onDisconnect` treats as expected housekeeping and does not
        // announce at all (Appendix E's auto-cycle; that handler's own
        // comment). No `disconnected` event can reach a held hand-off, so a
        // release here would be unreachable code claiming to be a guard.
        // A link that dies inside the hold is precisely what the backstop
        // (`FINISH_HANDOFF_HOLD_MS`) is for, and its own test proves it.
        if (stateRef.current.phase === "ended") return;
        // F1 fix-round-1 (cohort-unlock spec §1 review, CRITICAL): a raw
        // phase-level disconnect used to leave `driverRef` populated with
        // the now-dead driver forever — nothing but `teardown()`/`fail()`/
        // `cancel()` ever cleared it, so `connect()`'s own opening guard
        // (`if (connectingRef.current || driverRef.current !== null)
        // return;`) silently no-op'd a retry from this exact state: Try
        // Again looked alive and did nothing. This mirrors `fail()`'s own
        // disposal block (above) — unsubscribe, cancel the in-flight
        // lifecycle attempt if any, drop the lifecycle unsub, null
        // `driverRef`, hang up the transport best-effort — with two
        // deliberate differences: `deviceName` is NOT cleared (the
        // disconnected-WITH-run surface renders its LOST header from
        // `session.deviceName`, "PM5 … · LOST" — blanking it here would
        // break that screen, which this event can also precede), and the
        // phase/error `update()` stays exactly what it already was
        // (`"disconnected"`, no `ConnectedError` — this is not a failure,
        // it's the link falling over on its own). No `pendingTerminate` to
        // chain here unlike `fail()`'s call from `program()`'s catch: this
        // handler is not the caller of any in-flight `driver.terminate()`
        // — the transport's own `onDisconnect` (`driver.ts`) already
        // settled every pending wire promise (ack/verify/settle/prepare-
        // settle) before `emit`ting this event, so there is nothing here
        // to await before hanging up.
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        degradedUnsubRef.current?.();
        degradedUnsubRef.current = null;
        if (lifecycleAttemptRef.current !== null) {
          lifecycleAttemptRef.current.cancelled = true;
        }
        lifecycleUnsubRef.current?.();
        lifecycleUnsubRef.current = null;
        const droppedDriver = driverRef.current;
        driverRef.current = null;
        if (droppedDriver !== null) {
          bestEffort(droppedDriver.disconnect());
        }
        update({ phase: "disconnected" });
      }
      // `reconnected` is deliberately unhandled: auto-reconnect is descoped
      // to the named follow-on (spec's C5 ruling — no transport can do it
      // today, and the driver only OBSERVES resumption). If a link comes
      // back by itself, the phase stays `disconnected` and the rower's
      // recovery is End -> log, or leave and re-Connect fresh.
    },
    [endByMachine, handleFrame, releaseHandoff, update, withSeries],
  );

  /** Drops the driver and the radio. FOUR STEPS, IN THIS ORDER (Task 7,
   *  "one terminal path"): **reconcile, then the hand-off release, then
   *  stash, then unsubscribe, then disconnect** — the function body below
   *  carries each step's own reasoning, but the shape is: reconcile is
   *  first because it is the ONE step that needs the driver's listener
   *  still subscribed (a still-pending summary-gate deadline drained here
   *  emits synchronously, and a listener already gone never hears it —
   *  the twin defect this task fixes, named at `driver.ts`'s
   *  `drainSummaryReconcile`); stash is before unsubscribe because
   *  `exportLog()` serializes a snapshot STRING at that call, and anything
   *  written after it never reaches sessionStorage at all (§22's own
   *  recorded trap); unsubscribe still runs before `disconnect()`, so a
   *  disconnect callback fired by our own hang-up can never reach a
   *  component that is on its way out (the ORIGINAL reason this ran
   *  early, still true).
   *
   *  **Task 5 review fix round — terminates first when the erg is armed and
   *  nobody has terminated it yet.** `cancel()` below already does this
   *  explicitly before calling `teardown()` (and passes `alreadyTerminated:
   *  true` so this function does not repeat it) — but `teardown` is ALSO
   *  the unmount cleanup (`useEffect(() => teardown, [teardown])` below),
   *  reached by every OTHER way off the interstitial: a tab-bar tap, the
   *  back gesture, an iOS process kill. Before this fix those exits left
   *  the PM5 armed holding a workout nobody was going to row — DEVIATIONS
   *  row 63's own documented harm ("the rower find[s] someone else's
   *  intervals waiting on the monitor"), reachable from everywhere except
   *  the one button that happened to call `cancel()`. Fire-and-forget
   *  either way: nothing above this can act on a failed hang-up, and a
   *  rejected promise escaping an unmount cleanup is an unhandled
   *  rejection. `terminate()` runs to completion (or failure) BEFORE
   *  `disconnect()` fires — sending a terminate over a link that is
   *  already hung up would never reach the erg at all.
   *
   *  **`claimed` (fix wave H1, MEDIUM-9's real fix).** `cancel()` nulls
   *  `driverRef` synchronously, before its own first `await`, so an
   *  unmount interleaved with it finds nothing to terminate a second time.
   *  It then hands the driver it claimed back here, so the hang-up still
   *  happens exactly once — without it, `cancel()`'s own `teardown()` call
   *  would find a null ref and skip the `disconnect()`. Whoever gets here
   *  first with a real driver does the work; the other becomes a no-op.
   *  React never passes arguments to an effect cleanup, so the unmount
   *  path always takes the `driverRef.current` branch. */
  const teardown = useCallback(
    (alreadyTerminated = false, claimed: MonitorDriver | null = null): void => {
      // Resolved FIRST — every step below needs the same driver, and
      // clearing `driverRef` here (rather than after stash/unsubscribe, as
      // this used to) is a pure reordering: a re-entrant teardown
      // (unmount racing `cancel()`, this function's own `claimed` note)
      // still finds nothing left to repeat either way.
      const driver = claimed ?? driverRef.current;
      driverRef.current = null;
      const run = runRef.current;

      // STEP 1 + THE HAND-OFF BACKSTOP, AS ONE FUNCTION (Task 7's original
      // pairing, factored by storage-spine design spec §2's late side,
      // Task 3, so the immediate path below and the deferred path further
      // down call the identical body — they may only ever differ in WHEN).
      //
      // `driver.reconcile()` drains whatever the summary gate's own
      // deadline (`armSummaryReconcile`) is still holding and answers it
      // synchronously with whatever evidence this run has already earned
      // (`driver.ts`'s `drainSummaryReconcile`, the F7 rule) — a no-op
      // when nothing is pending, which is every teardown but a mid-grace
      // one. `releaseHandoff("teardown")` stays GLUED to it, immediately
      // after, exactly as review M-1 originally placed it: a teardown IS
      // the hand-off completing, or the rower leaving — either way nothing
      // is left to wait for, and this is the hold's LAST chance to release
      // with the more specific `"final-boundary"` reason instead
      // (`handleEvent`'s own `intervalComplete` case, for a fill landing
      // on the way out) — if this ran at teardown's own t=0 instead
      // (before STEP 1 can defer), it would win that race on every
      // mid-grace unmount and the trace would never say `final-boundary`
      // again. A no-op when nothing is held either way — including every
      // close that was never a natural finish, where the hold was never
      // opened at all — because `releaseHandoff` is itself idempotent
      // (`handoffHoldRef.current === null` short-circuits it).
      const reconcileAndReleaseHandoff = (): void => {
        driver?.reconcile();
        releaseHandoff("teardown");
      };

      // STEPS 3+4, AS ONE FUNCTION, likewise factored for reuse by both
      // paths.
      const unsubscribeAndDisconnect = (): void => {
        // STEP 3: UNSUBSCRIBE. Listener goes now that the reconcile above
        // has had its one chance to reach it — a disconnect callback
        // fired by our own `disconnect()` below can still never reach a
        // component that is on its way out (the original reason this ran
        // early, unchanged).
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        // Phase LL Task 2: the degraded-characteristic and app-lifecycle
        // listeners go with it — same "nothing left to watch for once
        // we're on our way out" reasoning, and the same overwrite-not-
        // accumulate discipline every other per-connect subscription in
        // this file already follows.
        degradedUnsubRef.current?.();
        degradedUnsubRef.current = null;
        // Minor 1: cancel THIS attempt's token before nulling the ref — a
        // still-pending native promise's own `.then()` checks it and
        // unregisters itself instead of overwriting a later attempt's
        // real unsub (see the ref's own doc comment).
        if (lifecycleAttemptRef.current !== null) {
          lifecycleAttemptRef.current.cancelled = true;
        }
        lifecycleUnsubRef.current?.();
        lifecycleUnsubRef.current = null;
        // STEP 4: DISCONNECT (terminate-then-disconnect for the "armed,
        // never pulled" case is unchanged by this task).
        if (driver === null) return;
        const phase = stateRef.current.phase;
        if (
          !alreadyTerminated &&
          (phase === "programming" || phase === "ready")
        ) {
          bestEffort(
            driver.terminate().finally(() => bestEffort(driver.disconnect())),
          );
          return;
        }
        bestEffort(driver.disconnect());
      };

      // Phase LT spec 2, Task 2: a run left OPEN through teardown (a link
      // drop, a tab-bar escape, an unmount before any close event ever
      // arrives — the "record stays open" side of spec's C5 lose-and-
      // degrade) must not leave its 30-second flush timer ticking against a
      // component that no longer exists. `closeRecord` already cancels this
      // on every path that actually closes the record; this call is what
      // covers every path that does not. Idempotent no-op when already
      // stopped (`stopSeriesFlush`'s own doc comment). Unaffected by this
      // task either way (not one of the three deferred steps), so it stays
      // at t=0 on every path.
      stopSeriesFlush();

      // STEP 2: STASH. THE LOG SURVIVES THE SESSION (2026-08-08, hardware
      // walk 2): the ended hand-off frame navigates away on its first
      // render, so the in-memory trace died exactly when the operator
      // wanted to copy it. Teardown runs on EVERY exit path — ended,
      // cancel, disconnect, a tab-bar escape — so one stash here covers
      // them all. On the IMMEDIATE path below, this still runs in TODAY'S
      // exact position — after `reconcileAndReleaseHandoff`, before
      // `unsubscribeAndDisconnect` — because `exportLog()` serializes a
      // snapshot STRING at THIS call, and an entry written to the ring
      // after this line would never reach THIS stash at all (§22's own
      // recorded trap, and the ordering-pin test). On the DEFERRED path
      // further down, THIS call is what "stays at t=0" means: STEPS 1/3/4
      // have not run yet at all, so this is a floor, not the last word —
      // a burst still in flight gets a SECOND stash once they finally do
      // (rewritten from "would never reach sessionStorage" to name it,
      // storage-spine design spec §2, Task 3).
      // sessionStorage, not localStorage: diagnostics for the tab's own
      // lifetime, not a record. Read it back from the console:
      //   copy(sessionStorage.getItem("ergomatic:last-monitor-log"))
      const stash = (): void => {
        const log = logRef.current;
        if (log === null) return;
        try {
          const exported = log.exportLog();
          sessionStorage.setItem("ergomatic:last-monitor-log", exported);
          // A later attempt that never rowed (a failed pairing, a
          // connect-then-cancel) overwrites the key above — which is the
          // capture instrument eating the very capture it exists for
          // (2026-08-08 antagonistic review, finding 4). Sessions that
          // OPENED A RECORD keep their own copy under a key only another
          // rowed session can touch.
          if (runRef.current !== null) {
            sessionStorage.setItem("ergomatic:last-rowed-log", exported);
          }
        } catch {
          // Quota or privacy mode: diagnostics never break a teardown.
        }
      };

      // THE LATE SIDE (storage-spine design spec §2, Task 3): a
      // NATURAL-FINISH record (`closeRecord`'s own "finished" close
      // reason, `endByMachine`'s only door for it — never cancel, fail,
      // an interrupted End, or a terminate) whose burst has not yet been
      // recorded gets STEP 1 (with its glued hand-off release), STEP 3,
      // and STEP 4 deferred to the earlier of the burst arriving or
      // `BURST_LINGER_MS`. `run.summaryTotals !== undefined` means the
      // burst already landed and was written BEFORE this teardown ever
      // ran (the early side, §2's own "3 of 5": the burst beat OUR
      // terminal transition, and by the time the hand-off hold found
      // nothing missing and let this screen unmount, `reconcile()` had
      // nothing left to wait for) — that case takes the immediate path
      // below with NO added latency, same as every close that was never a
      // natural finish at all.
      const naturalFinish =
        run !== null && run.completedAt !== null && run.endedBy === "finished";
      const burstAlreadyHeard = run !== null && run.summaryTotals !== undefined;

      if (naturalFinish && !burstAlreadyHeard) {
        stash();
        const schedule =
          depsRef.current.burstLingerSchedule ??
          ((cb: () => void, ms: number): (() => void) => {
            const id = setTimeout(cb, ms);
            return () => clearTimeout(id);
          });
        const finish = (): void => {
          // Both triggers can reach this — the burst's own event, racing
          // the linger's own timeout — and `lingerFinishRef` is cleared by
          // whichever gets here first (its own doc comment), which is also
          // the belt-and-braces guard against a stray double-call: once
          // `lingerFinishRef.current` is null, a SECOND trigger (the timer
          // firing after the event already ran, or vice versa) finds
          // nothing here at all — `handleEvent`'s own `summary-observations`
          // case and this ref's own doc comment both read on that.
          // STEPS 1/3/4 are not written to tolerate running twice, so this
          // guard is load-bearing, not decorative.
          if (lingerFinishRef.current !== finish) return;
          lingerFinishRef.current = null;
          burstLingerCancelRef.current?.();
          burstLingerCancelRef.current = null;
          reconcileAndReleaseHandoff();
          unsubscribeAndDisconnect();
          // THE SECOND STASH (spec §2's own "a second ring stash runs at
          // linger end"): the first stash above could not see whatever
          // STEPS 1/3/4 just wrote to the ring — the drain's own verdict
          // entry, the disconnect's own entries, and the burst's own
          // `summary-observations`/`record-actual` entries if it arrived
          // during the wait. Same keys, overwrite.
          //
          // NOT A SUPERSET, and said so precisely (review fix round 1,
          // MEDIUM finding — the earlier wording here claimed "strictly
          // contains everything the first one did", which `eventLog.ts`'s
          // own 500-entry ring makes false in general): this is the ring's
          // CURRENT window at drain time, its most recent `capacity`
          // entries. The burst-era entries this second stash exists FOR
          // are guaranteed present — they are, by construction, among the
          // most recent — but if enough OTHER entries were recorded
          // between the first stash and this one to push the ring past its
          // cap, whatever was oldest in the FIRST stash can have already
          // been evicted from the ring before this snapshot was ever
          // taken. On the `BURST_LINGER_MS`-bounded window this task adds,
          // that eviction needs several hundred OTHER entries logged in
          // under two seconds to happen at all — bounded, not impossible —
          // and this is the walk's own readout door regardless (exit
          // criterion 7: "the ring's SECOND stash ... without it the walk
          // sees nothing").
          stash();
        };
        lingerFinishRef.current = finish;
        burstLingerCancelRef.current = schedule(finish, BURST_LINGER_MS);
        return;
      }

      reconcileAndReleaseHandoff();
      stash();
      unsubscribeAndDisconnect();
    },
    [releaseHandoff, stopSeriesFlush],
  );

  const fail = useCallback(
    (error: ConnectedError, pendingTerminate?: Promise<void>): void => {
      // Phase LL Task 1, exit criterion 7: the ring gains the liveness
      // snapshot on FAILURE — the 2026-08-20 walk lost F-1's evidence
      // precisely because the ring's only door was downstream of the
      // failure that locked it (`ConnectedInterstitial.tsx`'s own
      // failure-screen door, this task's other half). `livenessRef` is
      // `null` before any transport has ever resolved (a `defaultTransport`
      // rejection, unreachable today) and its `snapshot()` is undefined
      // whenever a test's own `createTransport` override built a bare
      // `Transport` — either way this is a no-op, never a throw.
      const snapshot = livenessRef.current?.snapshot();
      if (snapshot !== undefined) {
        logRef.current?.record("liveness-snapshot", JSON.stringify(snapshot));
      }
      // Phase LL Task 3 (§3): FAILURE DISPOSES — the walk's actual root
      // cause (2026-08-20, James deleted and reinstalled the app). The
      // anchor pass corrected the walk README's own diagnosis: `connect()`
      // 's catch never cleared `driverRef` (it never did), and
      // `ConnectedInterstitial.tsx:298-313`'s retry branches on
      // `session.deviceName`, which nothing but `cancel()` used to clear —
      // so a version of this that touched only `driverRef`/the transport
      // would REPLACE the LINK-FAILED loop with an INSTANT-FAIL loop
      // (`program()` against a null driver fails `transport-missing`
      // immediately, never reaching a fresh scan). All three go together,
      // in order, BEFORE the `update()` below renders the failure screen:
      // listeners unsubscribe first (nothing left to hear from a driver
      // about to be disconnected — same ordering `teardown()` uses, for
      // the same reason), then the transport itself goes down, then the
      // ref clears. `driver.disconnect()` is the SAME method `teardown()`
      // calls, hanging up the identical transport `connect()` built for
      // this attempt.
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      degradedUnsubRef.current?.();
      degradedUnsubRef.current = null;
      // Minor 1: same cancellation as `teardown()`'s own — see
      // `lifecycleAttemptRef`'s doc comment.
      if (lifecycleAttemptRef.current !== null) {
        lifecycleAttemptRef.current.cancelled = true;
      }
      lifecycleUnsubRef.current?.();
      lifecycleUnsubRef.current = null;
      const driver = driverRef.current;
      driverRef.current = null;
      if (driver !== null) {
        // REVIEW FIX (task-3 review, IMPORTANT): `pendingTerminate` is
        // P3b's own in-flight terminate (`program()`'s catch, below,
        // passes its own `driver.terminate()` call through here rather
        // than firing it fire-and-forget on its own) — when present, the
        // disconnect is CHAINED to run only once that promise settles,
        // resolved OR rejected, never in the same tick. This was WRONG the
        // first time this task shipped: disconnecting unconditionally,
        // synchronously, raced a terminate this same failure may have just
        // dispatched. `teardown()` a few hundred lines below already
        // avoids exactly this shape for its own equivalent case
        // (`bestEffort(driver.terminate().finally(() =>
        // bestEffort(driver.disconnect())))`) — CoreBluetooth's own
        // documented contract is why: `cancelPeripheralConnection(_:)`
        // is nonblocking and "any pending commands ... may not complete"
        // (Apple, `CBCentralManager` reference), so hanging up while the
        // terminate write is still in flight can plausibly abort it —
        // leaving the erg ARMED with the workout that was just rejected,
        // silently (DEVIATIONS row 63's own documented harm). No terminate
        // was fired: `pendingTerminate` is `undefined`, and the immediate
        // disconnect below is correct exactly as before — there is
        // nothing in flight for it to race.
        if (pendingTerminate !== undefined) {
          bestEffort(
            pendingTerminate.finally(() => bestEffort(driver.disconnect())),
          );
        } else {
          bestEffort(driver.disconnect());
        }
      }
      // `deviceName: null` — the field Try Again's retry actually branches
      // on (`ConnectedInterstitial.tsx`) — clears in the SAME `update()`
      // as the phase flip, so the failure screen never paints with a
      // device name a disposed driver can no longer back up.
      update({ phase: "failed", error, deviceName: null });
    },
    [update],
  );

  const connect = useCallback(async (): Promise<void> => {
    // Since cancel() claims driverRef SYNCHRONOUSLY before its awaits (the
    // MEDIUM-9 deadlock fix), this guard no longer covers an in-flight
    // cancel: driverRef is already null while cancel's terminate is still
    // on the wire. Unreachable today only because onExit() unmounts the
    // interstitial synchronously — nothing can press Connect mid-cancel.
    // If cancel ever stops unmounting, this guard needs a cancellingRef.
    if (connectingRef.current || driverRef.current !== null) return;
    connectingRef.current = true;
    // Phase LL Task 2 review fix (task-1-report Minor, `useMonitorSession.
    // ts:1665` at the time it was filed): `livenessRef.current` used to be
    // set only after the `transport === null` check below, and never
    // cleared — so a SECOND `connect()` that fails `transport-missing`
    // (no transport ever resolved this attempt) left the PREVIOUS
    // connection's liveness snapshot sitting in the ref, and `fail()`
    // would attach it to a failure it has nothing to do with. Nulled here,
    // at the very top of every attempt, before anything can fail — the
    // same "a fresh connect() never inherits a stale PRIOR value" rule
    // `capacitorBle.ts`'s own `pendingCallerDisconnects`/M-2 comment
    // documents for its own per-attempt state. `frameSilence` resets the
    // same way: a fresh attempt starts on a stream that has said nothing
    // yet, never latched by whatever the last connection's watchdog saw.
    livenessRef.current = null;
    hysteresisCancelRef.current?.();
    hysteresisCancelRef.current = null;
    degradedUnsubRef.current = null;
    lifecycleUnsubRef.current = null;
    update({ phase: "picking", error: null, frameSilence: false });
    // Awaited unconditionally — the platform-conditional default
    // (`adapters/monitorTransport.ts`'s `defaultTransport`, ROADMAP CL item
    // 2) returns a `Promise` on the native arm (its own dynamic
    // `import("../monitor/transports/capacitorBle")`) and whenever the DEV
    // fake-injection seam (`transports/index.ts`'s `resolveDefaultTransport`)
    // is about to dynamic-`import()` `fake.ts`; every other path (a real
    // `createWebBluetoothTransport()`, and every test's own synchronous
    // `createTransport` override) resolves on the same tick, so `await`
    // costs nothing observable there.
    const transport = await (
      depsRef.current.createTransport ??
      (() => defaultTransport(livenessDepsRef.current))
    )();
    if (transport === null) {
      connectingRef.current = false;
      fail({
        reason: "transport-missing",
        detail: "This device has no Bluetooth transport.",
      });
      return;
    }
    // Phase LL Task 1: captured whether or not scan/connect/program ever
    // succeeds — `fail()` reads this optionally, so a failure at ANY later
    // step (scan dismissed, a radio throw, a program rejection) still has
    // whatever the decorator had already observed by then.
    livenessRef.current = hasLivenessSnapshot(transport) ? transport : null;
    try {
      // The platform's chooser (browser chrome on web, the plugin's
      // in-process sheet on iOS). One result or none either way — the app
      // never sees a list (C2, as revised by phone-BLE §3).
      const found = await transport.scan();
      const device = found[0];
      if (device === undefined) {
        fail({
          reason: "scan-dismissed",
          detail: "No monitor was picked.",
        });
        bestEffort(transport.disconnect());
        return;
      }
      update({ phase: "pairing" });
      await transport.connect(device.id);
      // Phase LL Task 1: the log's own `atMs` clock is the SAME `now` the
      // liveness decorator uses (`livenessDepsRef.current.now`) — one
      // clock, so a `liveness-silence`/`liveness-snapshot` entry's `atMs`
      // and the `LivenessSnapshot.atMs` it carries read off the identical
      // source, never two independent `Date.now()` calls that could drift
      // a millisecond apart for no reason.
      const log = (
        depsRef.current.createLog ??
        (() => createEventLog(undefined, livenessDepsRef.current.now))
      )();
      logRef.current = log;
      // S6: once per connect, straight into this session's own ring —
      // see `requestStoragePersistence`'s own doc comment for the full
      // reasoning.
      requestStoragePersistence(log);
      // Phase LL Task 3 (§3, F-6), "say so in the ring": the
      // already-connected guard has no log to write to at `scan()` time
      // (this session's log did not exist yet — it is created here, only
      // once a device is actually found) — so its outcome is read back
      // NOW, from the transport's own `describeLastScan()`, the instant a
      // log exists. `null` only when the transport carries no such
      // extension (every non-Capacitor transport), never for a real
      // native connect that reached this line.
      if (hasDescribeLastScan(transport)) {
        const outcome = transport.describeLastScan();
        if (outcome !== null) {
          log.record("already-connected-guard", outcome);
        }
      }
      const driver = createPm5Driver(transport, log, {
        ...depsRef.current.driverOptions,
        deviceName: device.name,
      });
      driverRef.current = driver;
      unsubscribeRef.current = driver.events((event) =>
        handleEvent(event, driver),
      );
      // Phase LL Task 2 mechanism 3 (§2): a STATUS-characteristic
      // subscribe rejection degrades rather than ending the session — the
      // CSAFE control characteristic's own rejection stays FATAL exactly
      // as today, unchanged, via the existing `onDisconnect` path
      // (`capacitorBle.ts`'s own `CRITICAL_CHARACTERISTICS`, the hang
      // guard this task must not touch). The ring names the dead
      // characteristic; the session and its driver never hear about it.
      if (hasCharacteristicDegraded(transport)) {
        degradedUnsubRef.current = transport.onCharacteristicDegraded(
          (characteristicId, message) => {
            log.record(
              "characteristic-degraded",
              `${characteristicId}: ${message}`,
            );
          },
        );
      }
      // Phase LL Task 2 mechanism 2 (§2, "iOS backgrounding"): Info.plist
      // declares no `UIBackgroundModes`, so nothing in this hook runs
      // while the app is actually suspended — the risk is entirely on
      // RESUME, where the very next frame this session sees might follow
      // an arbitrary real-world gap. `registerAppLifecycleListener` is the
      // adapter-layer seam (`src/adapters/appLifecycle.ts`); the platform
      // conditional lives there, never here. §4's continuity rule (Task 4,
      // not yet built by this phase) is what should ultimately arbitrate a
      // resumed stream — until it exists, a resume LATCHES `frameSilence`
      // immediately, same as any other silence, but the CLEARING path is
      // real, not a claim: `transport.markSuspect()` (guarded by
      // `hasMarkSuspect`) sets the liveness decorator's OWN internal
      // `silent` flag, so the very next healthy 0x0031 arrival takes the
      // decorator's EXISTING recovery branch and calls `deps.onRecovery()`
      // — the SAME `handleFrameRecovery`/`BANNER_RETRACT_HYSTERESIS_MS`
      // path a real watchdog silence goes through.
      //
      // REVIEW FIX (this was wrong the first time this task shipped):
      // calling `update({ frameSilence: true })` directly here, with
      // nothing touching the decorator's own `silent` flag, left `silent`
      // at `false` for any pre-background stream that had been healthy —
      // so `noteStatusArrival`'s `if (silent)` branch never matched on
      // resume, `onRecovery` never fired, and `frameSilence` never cleared
      // again for the rest of the session on any resume shorter than
      // `SILENCE_THRESHOLD_MS` (a Control Center swipe, a notification
      // peek — routine, not an edge case; reproduced empirically: 30
      // healthy frames over 15s, banner still up). `markSuspect()` is what
      // closes that gap — see its own doc comment in `liveness.ts`.
      // Minor 1: a fresh token for THIS attempt, checked (not read back off
      // the ref) by the `.then()` below — see `lifecycleAttemptRef`'s own
      // doc comment for the race this closes.
      const lifecycleAttempt = { cancelled: false };
      lifecycleAttemptRef.current = lifecycleAttempt;
      const lifecycleResult = registerAppLifecycleListener((event) => {
        if (event !== "foreground") return;
        hysteresisCancelRef.current?.();
        hysteresisCancelRef.current = null;
        update({ frameSilence: true });
        log.record(
          "app-lifecycle",
          "resumed from background — stream treated as suspect",
        );
        if (hasMarkSuspect(transport)) transport.markSuspect();
      });
      if (lifecycleResult instanceof Promise) {
        void lifecycleResult.then((unsub) => {
          if (lifecycleAttempt.cancelled) {
            // `fail()`/`teardown()` already ran for this attempt before the
            // native promise settled — the ref may already belong to a
            // LATER attempt's own real listener. Unregister this one
            // directly rather than writing it anywhere.
            unsub();
            return;
          }
          lifecycleUnsubRef.current = unsub;
        });
      } else {
        lifecycleUnsubRef.current = lifecycleResult;
      }
      // Stays `pairing` on purpose: connected is not programmed. The
      // interstitial's state 4 is exactly this moment, and its next step is
      // the caller's `program()` call, which owns the move to state 5.
      update({ deviceName: device.name });
    } catch (err) {
      fail(mapRadioFailure(err));
      bestEffort(transport.disconnect());
    } finally {
      connectingRef.current = false;
    }
  }, [fail, handleEvent, update]);

  const program = useCallback(
    async (p: WorkoutProgram, identity: RunIdentity): Promise<void> => {
      // THE DOUBLE-FIRE PIN (spec's I6 ruling: "DESIGNED, not asserted").
      // Two presses in one tick — a double-tap on Try again, a component
      // that fires an effect twice — must produce ONE wire conversation.
      // The phase flip below is synchronous (it writes `stateRef` before
      // any await), so the second call arrives here and finds
      // `"programming"` already set. Without the synchronous flip the
      // second call would reach the driver, where it would be refused with
      // `ProgramBusyError` — a correct backstop, but one that renders a
      // FAILURE for a rower who did nothing wrong.
      if (stateRef.current.phase === "programming") return;
      // A fresh program is a fresh arm: a streak built by frames from the
      // PREVIOUS armed state must not carry into this one (re-review
      // NEW-2 — latent today, since no UI path re-programs from ready,
      // but one line closes it for whoever adds that path).
      rowingStreakRef.current = null;
      const driver = driverRef.current;
      if (driver === null) {
        fail({
          reason: "transport-missing",
          detail: "No monitor is connected.",
        });
        return;
      }
      identityRef.current = { program: p, ...identity };
      update({ phase: "programming", error: null });
      try {
        await driver.program(p);
        // Success moves nothing here: the `armed` event does it (spec §2's
        // "every phase transition maps to a real event"), and the driver
        // emits it before this promise resolves.
      } catch (err) {
        const error = mapProgramFailure(err);
        // P3b (spec's own Decisions row): a failed program with a run still
        // open closes the RECORD unconditionally. Not because of
        // structure-mismatch — because of `sendPrepare`: `program()`'s
        // first act is always a Terminate, so by the time ANY typed
        // rejection surfaces, whatever was loaded is already torn down.
        // There is no reason for which keeping the run open is safe.
        const run = runRef.current;
        // REVIEW FIX (task-3 review, IMPORTANT): captured, not fired via
        // `bestEffort` here — `fail()` below is what chains the disposal's
        // `disconnect()` to wait for this promise's own settlement (see
        // its own doc comment). No `await` between this assignment and
        // `fail(error, pendingTerminate)`: the SAME synchronous block
        // attaches the handler before any microtask could observe an
        // unhandled rejection, the identical timing discipline
        // `raceScanTimeout` (`capacitorBle.ts`) already relies on.
        let pendingTerminate: Promise<void> | undefined;
        if (run !== null && run.completedAt === null) {
          // Phase LL Task 4 (design spec §4's writer table): "a failed
          // program() closing an open run -> program-failed".
          closeRecord(true, "program-failed");
          update({ runOpen: false });
          // ...and leave the erg terminated rather than holding an orphan.
          // EXCEPT on `disconnected`, where the link is gone and there is
          // nothing to send a terminate over (spec: "no terminate is
          // attempted; the record still closes").
          if (error.reason !== "disconnected") {
            pendingTerminate = driver.terminate();
          }
        }
        fail(error, pendingTerminate);
      }
    },
    [closeRecord, fail, update],
  );

  const endSession = useCallback(async (): Promise<void> => {
    const phase = stateRef.current.phase;
    // Idempotent (spec §2). Covers both "pressed twice" and "the machine
    // got there first" — in the second case the record is already closed
    // and `endedBy` stays `"machine"`, which is the truth.
    if (phase === "ended") return;
    // The link is gone: no terminate to attempt, but the record still
    // closes and is still loggable (spec's C5 lose-and-degrade).
    //
    // WHOLE-BRANCH REVIEW B1 (RULED): `phase === "disconnected"` ALONE
    // predates Task 2, which widened what "lost" means for the SCREEN —
    // the watchdog and the app-lifecycle resume both latch `frameSilence`
    // with `phase` still `"live"` (a suppressed stream is not a torn-down
    // connection). Without the `frameSilence` half, a rower pressing End
    // under a LOST THE MONITOR banner stored `"rower"` — the exact
    // conflation `endedBy` exists to end, reintroduced by this phase's own
    // left hand. Spec §4's invariant, stated once: whatever fires the
    // banner (§2a's three: disconnect, enabled-off, frame silence past
    // threshold) defines the close.
    const linkGone = phase === "disconnected" || stateRef.current.frameSilence;
    // Close BEFORE awaiting anything: `terminate()` makes the machine
    // report `terminated`, which comes straight back as an event, and this
    // is what makes that event a no-op instead of a second ending.
    // Phase LL Task 4 (design spec §4's writer table): reuses `linkGone`
    // computed one line above — never recomputed — "End with the link up
    // -> rower", "End with the link gone -> link-lost".
    closeRecord(true, linkGone ? "link-lost" : "rower");
    update({ phase: "ended", endedBy: "user", runOpen: false });
    const driver = driverRef.current;
    if (driver === null || linkGone) return;
    try {
      // With its settle (spec §2): the ack means QUEUED, not done.
      await driver.terminate();
    } catch {
      // Best-effort. The record is already closed and the session is
      // already over as far as the rower is concerned; a machine that
      // refuses the terminate does not un-end it.
    }
  }, [closeRecord, update]);

  const cancel = useCallback(async (): Promise<void> => {
    const phase = stateRef.current.phase;
    // Cancel belongs to the INTERSTITIAL. Once the session is live (or
    // over) the control is End, which closes the record; there is nothing
    // for Cancel to do that End does not do better, and silently discarding
    // a live run would be the destruction path the spec forbids.
    // `"paused"` dropped from this guard with the phase member (task 5): a
    // frozen session is still `"live"`, so this already covered it.
    if (phase === "live" || phase === "ended") return;
    const driver = driverRef.current;
    // MEDIUM-9 (task-5 re-review), landed by the fix wave's H1: CLAIM the
    // ref synchronously, before the `await driver.terminate()` below
    // suspends. `ConnectedInterstitial.tsx`'s `handleCancel` is
    // fire-and-forget — `void session.cancel(); onExit();` — so the unmount
    // runs DURING that await, and with the ref still populated (and the
    // phase still `programming`/`ready`, since `update` has not run yet)
    // `teardown` sent a SECOND physical terminate. Worse than the
    // "idempotent duplicate" MEDIUM-9 pictured: `sendSequence()` opens with
    // `discardStaleAcks()`, so the second send purged the `pendingAck` the
    // first was waiting on and this function's own promise never settled.
    // Previously unreachable in tests only because `fake.ts` answers a
    // terminate synchronously, which a real PM5 does not — see this hook's
    // test file, "…even when the monitor answers asynchronously".
    driverRef.current = null;
    // Cancel's machine semantics per state (spec §2's M3 ruling): before
    // `programming` it is FREE — nothing has been sent, so nothing is
    // undone. From `programming`/`ready` it terminates what we armed,
    // best-effort and ignored on failure, and closes nothing (no run is
    // open until `live`). The handoff's "nothing lost" is amended in
    // DEVIATIONS accordingly: nothing OF OURS is lost, and the erg is left
    // terminated rather than armed with an orphan.
    const armed =
      driver !== null && (phase === "programming" || phase === "ready");
    if (armed) {
      try {
        await driver.terminate();
      } catch {
        // Best-effort by design — including the case where a `program()`
        // is still in flight and this terminate interleaves with it.
      }
    }
    // `alreadyTerminated: armed` — `teardown` would otherwise repeat the
    // SAME terminate a second time (the phase hasn't changed yet; `update`
    // below is what moves it), which is harmless on real hardware but is
    // not what "best-effort" is supposed to mean here. `driver` is handed
    // back explicitly because the ref was claimed above; without it the
    // hang-up would be skipped entirely (`teardown`'s own doc comment).
    teardown(armed, driver);
    identityRef.current = NO_IDENTITY;
    freezeRef.current = NO_FREEZE;
    rowingStreakRef.current = null;
    // Phase LL Task 4: same per-run lifecycle as `freezeRef`/
    // `rowingStreakRef` above — a stale reading from THIS run must never
    // seed the next one's continuity baseline.
    lastContinuityRef.current = null;
    runRef.current = null;
    update(INITIAL_STATE);
  }, [teardown, update]);

  /** See `MonitorSession.exportLog`. Reads the ref at call time — stable
   *  identity, so a component can hold it across renders without the sheet
   *  re-reading a log it deliberately snapshots once. */
  const exportLog = useCallback((): string => {
    return logRef.current?.exportLog() ?? "[]";
  }, []);

  // Teardown on unmount: the listener goes, the radio goes, no driver is
  // left holding a subscription to a component that no longer exists. The
  // effect body runs once (no deps) and `teardown` reads only refs.
  useEffect(() => teardown, [teardown]);

  return {
    phase: state.phase,
    error: state.error,
    deviceName: state.deviceName,
    frame: state.frame,
    actuals: state.actuals,
    endedBy: state.endedBy,
    handoffHeld: state.handoffHeld,
    frozen: state.frozen,
    runOpen: state.runOpen,
    frameSilence: state.frameSilence,
    connect,
    program,
    endSession,
    cancel,
    exportLog,
  };
}
