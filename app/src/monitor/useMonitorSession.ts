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
  type CloseReason,
  type MonitorRun,
} from "./monitorRun";
import {
  commit as commitHandoff,
  currentUnretired as currentUnretiredHandoff,
  retire as retireHandoff,
  cachedVerdict as cachedHandoffVerdict,
  retryDurable as retryDurableHandoff,
  setReceiptChannel,
  takeStagedRetire as takeStagedRetireHandoff,
  discardStagedRetire as discardStagedRetireHandoff,
  type HandoffReceipt,
} from "./handoffStore";
import { check as checkContinuity } from "./continuity";
import { createSeriesRecorder, type SeriesRecorder } from "./seriesRecorder";
import { defaultTransport } from "../adapters/monitorTransport";
import { registerAppLifecycleListener } from "../adapters/appLifecycle";
import {
  SILENCE_THRESHOLD_MS,
  type CancelFn,
  type LivenessDeps,
  type LivenessSnapshot,
} from "./transports/liveness";
import { GENERAL_STATUS_UUID } from "../../domain/monitor/pm5/uuids.js";

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

/** What a run would be filed under if one could open before either arm ran.
 *
 *  **RECONCILED, Phase JR PR 2.** This used to read: "None can — `live` is
 *  downstream of `ready`, which is downstream of the `armed` event, which
 *  only `program()` produces." The last clause is no longer true.
 *  `beginFreeRow()` is a SECOND producer of `ready`, reaching it with no
 *  wire traffic at all, so `ready` now has two doors rather than one.
 *
 *  The conclusion survives the correction: this value is still never read,
 *  because both doors seed `identityRef` before flipping the phase. It
 *  exists so the ref has no null state to branch on. */
const NO_IDENTITY: FreeRowIdentity = {
  program: { intervals: [] },
  ...ANONYMOUS_RUN,
};

/** The identity ref's own shape: a `RunIdentity` plus the program it was
 *  armed with, plus Phase JR PR 2's `mode`. `mode` lives HERE rather than on
 *  `RunIdentity` because `RunIdentity` is what a CALLER of `program()`
 *  supplies, and a caller of `program()` is by definition not a free row. */
type FreeRowIdentity = {
  program: WorkoutProgram;
  mode?: "justrow";
} & RunIdentity;

/**
 * Plan Task 3 review (M7): ownership tracking for `handoffStore`'s ONE
 * receipt-channel slot — module-level because the slot itself is
 * (`handoffStore.ts`'s own header: "one process, one store"). Each hook
 * instance's own mount effect increments this and captures its own
 * token; its unmount cleanup only calls `setReceiptChannel(null)` when
 * this counter STILL equals its own token — i.e. no LATER mount has
 * claimed the slot since. Without this, an unmount racing a second
 * mount (StrictMode's double-invoke, or two hook instances genuinely
 * overlapping) could null out a SUCCESSOR instance's own channel: the
 * cleanup fires unconditionally, `setReceiptChannel`'s own contract is
 * "last call wins" with no per-caller identity, so instance A's
 * teardown silently steals instance B's receipts with no error and no
 * test able to tell the difference without this guard.
 */
let receiptChannelOwner = 0;

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

/** What `decideResumeLatch` concluded, and the number it concluded it
 *  from. `gapMs` is `null` when nothing could be measured (no liveness
 *  decorator on this transport, or no 0x0031 has ever arrived) — an
 *  absence, deliberately distinguished from a measured zero. */
export interface ResumeLatchDecision {
  latch: boolean;
  gapMs: number | null;
}

/**
 * PHASE LM PR 1, FIX ROUND 2 (design spec `2026-08-26-lost-monitor-trigger-
 * design.md`, Task 1) — **the fix**. Decides whether a lifecycle resume
 * should raise the lost-link alarm, by MEASURING the stream instead of
 * assuming.
 *
 * **What was wrong.** The resume handler latched `frameSilence: true`
 * unconditionally and then, three lines later, read the frame count that
 * refuted it. On 2026-08-26 that produced nine red `LOST THE MONITOR /
 * Nothing kept.` banners in 288 s over a link that never dropped, with 233
 * frames arriving across the nine supposed gaps and `liveness-recovery`
 * following every latch within 3-72 ms
 * (`docs/monitor/sessions/walk-2026-08-26/`). Correcting which plugin event
 * we bind (`src/native/appLifecycle.ts`, `pause`/`resume` rather than
 * `appStateChange`) reduces the FREQUENCY; it does not make the logic
 * right, because a genuine 800 ms backgrounding is still a real resume over
 * a stream that never stopped. This predicate is what makes it right.
 *
 * **The rule.** Latch only when the evidence says a gap actually happened:
 *   - `snapshot.silent` — the watchdog already declared silence and has not
 *     seen a recovery. Its verdict stands regardless of the gap, and it
 *     cannot be re-derived from the gap: a DRAINED BACKLOG rearms the
 *     watchdog's timer (`liveness.ts`'s `noteStatusArrival` -> `rearmTimer`),
 *     so stale arrivals can leave `lastArrivalMs` recent while `silent` is
 *     the honest reading.
 *   - otherwise, the measured gap between the snapshot's own clock reading
 *     and the last 0x0031 arrival, `>= thresholdMs`.
 *
 * `Date.now()` — the clock both readings come from
 * (`livenessDepsRef.current.now`) — is WALL CLOCK and advances THROUGH an
 * iOS suspension, which is exactly the direction this predicate needs: a
 * real background shows up as a real gap the instant we resume, with
 * nothing to wait for.
 *
 * **A NEGATIVE gap is not evidence.** A wall clock stepped backwards (an
 * NTP correction) says nothing about the stream, and reading it as "no gap"
 * would be as wrong as reading it as a huge one. We do not latch; the
 * watchdog's own timer, which is still pending, owns that case. There is
 * deliberately NO separate `gapMs < 0` branch: a negative number can never
 * be `>= thresholdMs` (2500, positive by construction — see
 * `SILENCE_THRESHOLD_MS`), so the one comparison below already delivers
 * this, and an extra guard would be a branch no test could ever kill. The
 * BEHAVIOUR is pinned by its own test either way.
 *
 * **An UNMEASURABLE gap is not evidence either** (no decorator, or no
 * 0x0031 ever seen). The pre-stream window belongs to the connect/program
 * timeouts — `liveness.ts`'s header states that boundary for the watchdog's
 * own arming rule, and this predicate keeps to the same line.
 *
 * Pure and directly testable, the same discipline `handleFrameSilence`/
 * `handleFrameRecovery`/`programHasDistanceGoal` above already follow.
 */
export function decideResumeLatch(
  snapshot: LivenessSnapshot | null,
  thresholdMs: number,
): ResumeLatchDecision {
  if (snapshot === null) return { latch: false, gapMs: null };
  const lastArrivalMs =
    snapshot.characteristics[GENERAL_STATUS_UUID]?.lastArrivalMs ?? null;
  const gapMs = lastArrivalMs === null ? null : snapshot.atMs - lastArrivalMs;
  if (snapshot.silent) return { latch: true, gapMs };
  if (gapMs === null) return { latch: false, gapMs };
  return { latch: gapMs >= thresholdMs, gapMs };
}

/** Phase LL Task 4 (design spec §4's continuity rule): true whenever `p`
 *  contains ANY distance-kind interval — `continuity.ts`'s own header
 *  comment has the full wire citation: on a distance-goal interval,
 *  0x0031's Total Work Distance LAGS the interval in progress (it is an
 *  odometer of metres genuinely rowed, work plus rest coast, not a goal —
 *  RC-9c, design spec 2026-08-25-free-oracles §2, correcting an earlier
 *  claim here that it reports the goal) and jumps at each boundary exactly
 *  like a reset would, so a continuity check keyed on that field must not
 *  run inside one. `driver.ts`'s per-run TWD verdict used to compute this
 *  identical predicate for an unrelated reason (comparing the field
 *  against our own accumulator); RC-9c retired that verdict, but this
 *  predicate is unaffected — it protects a reset-detector, not a stored
 *  number. Factored out, plain-value, directly testable — same discipline
 *  as `handleFrameSilence`/`handleFrameRecovery` above. */
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
 * Phase LT spec 2, Task 2 (design spec §4, S6). By default, requests
 * persistent storage once per successful connect — free either way, and
 * this hook is deliberately NOT what decides whether it is granted:
 * `persist()` itself is (S6's own PRIMARY citation, WebKit's policy blog —
 * heuristics decide, and a Capacitor WKWebView is "probably DENIED" by them).
 * Fire-and-forget (`bestEffort`) and never gates anything downstream: denial
 * is TOLERATED, stated in the spec's own words as "NOT as mitigation" —
 * nothing about `connect()`'s own success or failure reads this outcome.
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
 * BURST-ELIGIBLE teardown whose record has not yet heard the machine's
 * summary burst (0x0039 + 0x003F), `teardown`'s reconcile/unsubscribe/
 * disconnect steps defer to the EARLIER of the burst arriving or this many
 * milliseconds — exported so tests can name it rather than hard-coding
 * 2000 twice.
 *
 * "Burst-eligible" was "natural-finish" until the summary-record design
 * spec's §1 gate 1 widened it to rower-ended closes as well. The corpus
 * behind the duration was re-measured at the Wave F phase-open anchor
 * (2026-08-28, corrected at PR #225's review): TEN committed captures now
 * carry a complete burst — eight unique recordings (web, counting
 * duplicate `.jsonl`/`.gz` representations once) plus two production
 * native rings (`walk-2026-08-24/phone-exit7-ring.json` at +358 ms and
 * `walk-2026-08-28/summary-never-stored-ring.json` at +452 ms). Positive
 * post-terminal lags run 271–542 ms, worst case 542 ms
 * (`walk-2026-08-25/smoke-terminated`); two of the web captures deliver
 * the burst BEFORE our observation of the terminal flip — favourable for
 * this linger (the burst is already in hand and the write-once append has
 * taken it), but any hold design must handle that ordering explicitly
 * rather than assume terminal-first. The earlier "~1 s terminate lag"
 * read off `walk-2026-08-24/lab-terminate-ring.json` (n = 1) is
 * contradicted by every later positive measurement and is retired.
 *
 * AND THE REAL BUDGET IS SMALLER STILL, because this clock starts at
 * TEARDOWN, not at the terminal frame: the lags above are measured from
 * the machine's own terminal, while these 2000 ms only begin once the
 * hook has flipped to `ended`, the caller has navigated, and the
 * component has unmounted. Whatever that navigate-and-unmount takes comes
 * straight off the top. Stated, not smoothed over: a slower terminate
 * burst — or a slower navigation — is capped here and lost, and the next
 * terminate capture is what would move this number.
 *
 * Holds at ~3.7× the measured worst case (542 ms over n = 10, two
 * transports). The old "n = 1, the only 0x0039/0x003F ever captured"
 * caveat is dead — five walks superseded it — and the unmeasured case
 * that remains is a NATIVE burst arriving across a background/resume:
 * every recording is web/foreground and both native ring points are
 * foreground too.
 */
export const BURST_LINGER_MS = 2000;

/**
 * Storage-spine design spec §2 (2026-08-29-machine-summary-hold-design.md,
 * "the burst condition"), Wave F PR 1 Task 3: at a burst-eligible `ended`
 * transition — a machine finish, a Menu terminate, or a user End with the
 * link up (`run.completedAt !== null && (run.endedBy === "finished" ||
 * run.endedBy === "rower")`) — whose run has not yet heard the machine's
 * own summary burst (`run.summaryTotals === undefined`, kept as documented
 * defence-in-depth below), the hand-off hold owes a SECOND condition
 * alongside the split's: this many milliseconds, or the burst's own write
 * ATTEMPT, whichever comes first.
 *
 * DERIVATION, the corpus rule (`BURST_LINGER_MS`'s own comment above
 * carries the authoritative transcription; re-stated here for this
 * constant's own anchor, which is NOT the same clock). Ten committed
 * captures now carry a complete burst — eight unique web recordings plus
 * two production native rings (`walk-2026-08-24/phone-exit7-ring.json`
 * +358 ms, `walk-2026-08-28/summary-never-stored-ring.json` +452 ms).
 * Positive post-terminal lags run 271-542 ms, worst case 542 ms
 * (`walk-2026-08-25/smoke-terminated`, a MENU-terminated close). On the
 * two `endByMachine` arms (machine finish, Menu terminate) the `ended`
 * flip happens SYNCHRONOUSLY inside the driver's terminal emit, so the
 * whole measured window sits inside this backstop with nothing coming off
 * the top — a ~3.7× margin on the 542 ms worst case.
 *
 * THE END-ARM ANCHOR IS DIFFERENT AND DOES NOT INHERIT THAT MARGIN (the
 * antagonist pass's own correction — a claim this spec once made and
 * retracted): on the user-End arm the clock starts at the BUTTON, not at
 * any wire event — the `ended` flip precedes `await driver.terminate()`
 * (`endSession`, below) — so the terminate round-trip comes off the top of
 * this budget instead of being free. Measured once
 * (`walk-2026-08-28/end-on-interval-1-recording.jsonl.gz`, the corpus's
 * only app-End capture): terminate tx at t=15155.4, machine terminal
 * +286.3 ms, 0x003F +558.6 ms from the flip — a 3.58× margin under this
 * backstop, n = 1, web; the native terminate round-trip is unmeasured. The
 * §5 receipts (`handoff-released: "burst-timeout"`) are the instrument if
 * that budget is ever exceeded in the field.
 *
 * DEFENCE IN DEPTH, NOT THE LOAD-BEARING MECHANISM: on the two
 * burst-first captures in the corpus the burst arrives BEFORE the
 * terminal transition is even observed, because both driver arms fold a
 * buffered burst-first summary onto the record AFTER their terminal emit,
 * deliberately (`driver.ts:2702-2711`, `:2751-2760` — an observations
 * event arriving while `completedAt` is still `null` would be declined
 * permanently, `monitorRun.ts:1095`). So `run.summaryTotals` is ALWAYS
 * `undefined` at every one of the three sites this condition opens from,
 * and on the burst-first shape the condition resolves microseconds later
 * in the SAME synchronous block React batches into one render — the hold
 * is invisible and costs nothing. The `summaryTotals` clause stays in the
 * owing predicate as documented defence-in-depth, not as the load-bearing
 * explanation: if the driver's post-emit fold ever became async, the
 * burst-first case would pay real hold time and the receipts would show
 * it.
 *
 * NOT SHARED WITH `BURST_LINGER_MS`, even though both read 2000 today:
 * different anchor (this waits from the `ended` flip; that waits from
 * TEARDOWN, already downstream of navigate-and-unmount) and a different
 * consumer (this hold; that linger) — coupling them would let a linger
 * retune silently retime the rower-visible hold, or vice versa.
 */
export const BURST_HANDOFF_HOLD_MS = 2000;

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
  /** `true` while the ended hand-off is being HELD for one or both of two
   *  independent conditions (storage-spine design spec §2, Task 3): the
   *  final interval's own SPLIT (`FINISH_HANDOFF_HOLD_MS`, walk day 2 —
   *  machine finish only, when that run is missing its last interval's
   *  actual) and the machine's own summary BURST
   *  (`BURST_HANDOFF_HOLD_MS`) — owed on all THREE burst-eligible `ended`
   *  arms: a machine finish, a Menu terminate at the erg, and an app End
   *  with the link up. The phase is already `"ended"` — the rower sees
   *  that frame immediately — but whoever navigates away on the ending
   *  (`ConnectedSurface`'s `onEnded`) must WAIT while this is true:
   *  navigating unmounts the interstitial, and unmounting tears down the
   *  very subscription either the split or the burst still has to arrive
   *  on. `false` only once NEITHER condition remains owed — a link-lost
   *  or program-failed close, or any close whose owed condition(s) have
   *  already resolved (arrival, write attempt, or backstop). */
  handoffHeld: boolean;
  /** Hand-off store design spec §7, plan Task 3: `"storage-failed"` while
   *  the ended hand-off's own release-verify found the CACHED durable
   *  verdict (`handoffStore.cachedVerdict`, the last accepted commit's —
   *  §7: "the release funnel reads the CACHED verdict ... not the close
   *  commit's") to be `"failed"` — and the hold has NO TIMER: the only ways
   *  out are `retryHandoffSave()`, `proceedHandoff()`, or leaving. `null`
   *  at every other time, including a `handoffHeld: true` frame that is
   *  still waiting on the split/burst conditions rather than on a failed
   *  write. **No auto-heal** (spec §7, ruled): a LATER commit succeeding
   *  while this is non-null records its own receipt but does not clear
   *  this field on its own — only the two explicit exits (or leaving) do.
   *  This hook SHIPS the state; rendering it is Task 5's restore of the
   *  held-error frame (`ConnectedSurface` on this base has no branch for
   *  it yet — that shipped under the closed #230, never merged here). */
  holdError: "storage-failed" | null;
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
   *  `connectedAxes.ts`'s `deriveLink` — routed through the EXISTING lost
   *  link, never a new state (spec §2a's own correction: no new axis, no
   *  new word, no parallel path). Phase LM moved where "lost" is CARRIED —
   *  `SurfaceModelInput.linkLost`, independent of `SurfaceStatus`, so an
   *  armed surface can report the loss without ceasing to be armed — but
   *  not what produces it, which is still this field and this axis. */
  frameSilence: boolean;
  /** RC-37 ([R5], design spec 2026-08-27-link-authority-design.md §1):
   *  `true` for the one render between the driver's `programDropped` event
   *  and this hook's own `onExit`-triggering effect unmounting the caller.
   *  The PM5 silently dropped the program it was holding (confirmed
   *  trigger: Menu at READY) — `phase` is reset to `"idle"` in the SAME
   *  `update()` that sets this, so a caller watching it fires exactly once,
   *  never sticks, and never needs clearing back to `false` itself (the
   *  component it's read from unmounts right after). */
  programDropped: boolean;
  /** Wave F PR 1 Task 2 (design spec 2026-08-31-lifecycle-design.md §1): a
   *  record-derived mirror set only by the live-drop close, in the SAME
   *  patch that flips the phase — spec §1 Mechanism; null everywhere
   *  else. */
  closeReason: CloseReason | null;
  /** Opens the platform's monitor chooser (`"picking"`), then connects (`"pairing"`) and
   *  builds the driver around the picked device's REAL advertised name.
   *  Assumes the Connect guard has already cleared (see this file's
   *  header). */
  connect(): Promise<void>;
  program(p: WorkoutProgram, identity: RunIdentity): Promise<void>;
  /** Phase JR PR 2: arms for the machine's OWN free row — reaches `ready`
   *  with no wire traffic and files the record under a Just Row identity
   *  (`workoutId: null`, `mode: "justrow"`). `program()`'s counterpart, and
   *  synchronous because nothing is sent. A no-op while a programmed
   *  session is `programming`/`ready`/`live`. */
  beginFreeRow(): void;
  /** The rower's End. Idempotent, and idempotent specifically against a
   *  terminal event racing it (spec §2). */
  endSession(): Promise<void>;
  /** Cancel's machine semantics per state (spec §2's M3 ruling). */
  cancel(): Promise<void>;
  /** Hand-off store design spec §7, plan Task 3: re-attempts the durable
   *  write behind `holdError` (`handoffStore.retryDurable`, which NEVER
   *  bumps revision — spec §1: modelling Retry as `commit` would stale
   *  this hook's own `lastAcceptedRevisionRef` and refuse the next
   *  producer commit, the design's own headline case). A no-op when
   *  `holdError` is already `null` (idempotent, same posture as
   *  `releaseHandoff`/`resolveHandoffCondition`). A verdict other than
   *  `"failed"` releases and clears `holdError`; a failure that repeats
   *  stays held — each attempt gets its own `hold-error-retry` receipt via
   *  the diagnostic ring regardless of outcome. */
  retryHandoffSave(): Promise<void>;
  /** Hand-off store design spec §7, plan Task 3's non-retry exit: releases
   *  from `holdError` WITHOUT a confirmed durable write. Unlike #230's own
   *  version of this method, there is no stash to perform — the memory
   *  tier is already current by construction (every accepted commit writes
   *  it), so the reader (Task 4/5's own scope) already has the full record
   *  to serve. A no-op when `holdError` is already `null`. */
  proceedHandoff(): Promise<void>;
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
 * All dependencies are optional and default to production behaviour, so
 * `useMonitorSession()` — the zero-argument call Tasks 5-7 make — is the
 * shipped path.
 */
export interface MonitorSessionDeps {
  /** Requests durable browser storage after a successful connection unless
   *  explicitly disabled. Defaults to `true`. */
  requestStoragePersistence?: boolean;
  /** Writes the teardown diagnostic snapshot to browser storage unless
   *  explicitly disabled. Defaults to `true`. */
  requestDiagnosticStash?: boolean;
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
  /** The ended hand-off's backstop timers — BOTH owed conditions'
   *  (`FINISH_HANDOFF_HOLD_MS` for the split condition,
   *  `BURST_HANDOFF_HOLD_MS` for the burst condition, storage-spine design
   *  spec §2, Task 3), as a schedule-and-cancel pair: returns the
   *  canceller. One seam for both — a natural finish can owe both
   *  conditions at once, and each gets its own call against this same
   *  injection point. Injected so a test FIRES a backstop instead of
   *  waiting real milliseconds for it (and so an unmounted test leaves no
   *  live timer). Defaults to `setTimeout`/`clearTimeout`. */
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
 * (`distanceMeters > 0`) AND THIS INTERVAL HAS BEEN PULLED IN
 * (`PULL_EVIDENCE_FRAMES`, added 2026-08-26 — read its comment before
 * changing anything here; the hold below is necessary and has not been
 * sufficient since). Exit on ANY change to any of the three.
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
 * MOST frames of that no-rest changeover carry `d 0` — 4 of the 5 recorded
 * no-rest changeovers do (MEDIUM-1, Task 5's review, 2026-08-26). The fifth
 * does NOT: `walk-2026-08-23/keystone-pm5-recording-1787491974452.jsonl.gz`
 * index 96 goes `rowing/248.5 -> rowing/1.9` with no intervening `d<=0` and
 * no non-rowing frame, so the freeze run never resets there and `pulled`
 * carries across. **Pre-existing — the old guard leaked identically — and
 * REST boundaries are safe because a `resting` frame always resets**, so the
 * defect Task 5 fixed is genuinely closed. Recorded because the converse the
 * per-interval story leans on ("every boundary resets a freeze run") is the
 * half that is not guaranteed. A genuine
 * mid-interval stop has distance already banked, so freeze frames simply do
 * not COUNT until the interval has distance: the no-rest boundary case
 * resets on the guard, not on a one-frame margin. (The rower who stops at
 * the exact instant of a changeover, having moved zero meters in the new
 * interval, reads as the interval's own waiting state rather than PAUSED —
 * the display cost is nothing.) The 4-frame hold itself is retained as
 * recorded-margin against single-frame repeats.
 *
 * **THAT GUARD DOES NOT COVER A REST BOUNDARY, and this comment used to
 * claim it covered every boundary** (2026-08-26). Measured, by decoding
 * 0x0031 across every committed recording: the first work frame after a
 * REST is ABOVE ZERO in 5 of the 8 rest->work transitions across all nine
 * recordings, reading 1.1, 0.9, 0, 0, 0.2, 1.5, 0.1, 0 — coast metres from a
 * flywheel that never stopped. (This used to cite the single `0.1` reading
 * and generalise from it; the corpus makes the point STRONGER than the
 * original sentence claimed, and up to 1.5 m rather than 0.1 m.) The guard is therefore already clear on that frame, which is
 * how the false pause `PULL_EVIDENCE_FRAMES` exists to stop got through.
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

/**
 * HOW MUCH PROGRESS COUNTS AS "THIS INTERVAL HAS BEEN PULLED IN" (Phase LM
 * fix round 2, task 5 — the second half of the predicate).
 *
 * Reported at the erg on 2026-08-26: `PULL TO RESUME` about two seconds into
 * a work interval, before the rower had taken a stroke in it, with the
 * flywheel still coasting. The conditions were a pull or two DURING the rest
 * and then stopping as the work interval began (walk card
 * `phase-lm-pr1.md`, leg 2b). A coast that has decayed below the wire's own
 * 0.1 m resolution reports the SAME distance frame after frame, with split
 * and rate at 0, above a distance that is nevertheless greater than zero —
 * so `nextFreezeRun`'s `distanceMeters <= 0` guard is already clear on the
 * interval's first frame, four identical frames follow, and the app tells
 * the rower to resume something they never started. The same class as the
 * `READY`/`WORK` defect this phase fixed one predicate over: a state
 * machine asserting a transition the rower never made.
 *
 * So the hold is necessary and no longer sufficient. A pause is a claim
 * about a rower who WAS rowing, and this counter is the evidence for the
 * "was": FIVE consecutive frames of strictly increasing distance inside
 * this interval, evaluated by the very same `nextRowingStreak` the ready
 * gate's own fallback uses, whose doc comment carries the derivation —
 * "the shape a coast cannot hold and a rower cannot fail."
 *
 * IT IS A SEPARATE CONSTANT FROM `ROWING_ACTIVE_FALLBACK_FRAMES` ON
 * PURPOSE, though today they hold the same number for the same recorded
 * reason. The two gates want opposite asymmetries and must be free to move
 * apart: the ready gate is deliberately GENEROUS about a coast because
 * failing it silently loses a whole session, while this gate is the
 * cautious one — the cost of holding it too long is a couple of seconds of
 * missing instruction, and the cost of opening it too early is the defect
 * above. Tie them together and a future change made for the ready gate's
 * asymmetry silently changes this one's.
 *
 * WHAT THIS DELIBERATELY DOES NOT KEY ON, and why:
 * - **Stroke rate.** The record says rate reads 0 for the first ~4 s of a
 *   work interval while the metres are visibly climbing (three separate
 *   changeovers in `walk-2026-08-25/rests-finished-recording.jsonl.gz`), and
 *   the interval's own first frame carries the PREVIOUS interval's rate
 *   over a zeroed clock — so a rate-based gate is both late for a rower who
 *   is rowing and already satisfied for one who is not. It is also the
 *   field that stays PINNED through a real stop (`PAUSED_FRAME_HOLD`'s own
 *   comment), so it can neither open nor close this gate honestly.
 * - **`rowingActive`.** Same standing reason `PAUSED_FRAME_HOLD` gives, now
 *   with the byte FALSIFIED as a hard gate (Phase LM task 2: it read
 *   `false` through an entire real row). Keying a pause on it would trade
 *   this defect for a silent one — a genuine stop that never says anything.
 *
 * THE RESIDUAL FALSE POSITIVE, and how narrow it measures. A coast strong
 * enough to bank five strictly-increasing frames and THEN die inside the
 * hold would still earn the gate and declare a pause the rower did not make.
 * Written here rather than left in a git-excluded task report (recurring
 * failure #14). Measured at Task 5's review rather than left as a worry: at
 * both recorded mid-interval stops the flywheel falls from ~1.2 m/frame to
 * below the wire's 0.1 m resolution in ONE to TWO frames (1.2, 1.3, 1.1,
 * dead; and 1.2, 0.4, dead). A coast holding strictly-increasing distance
 * for ~2.5 s is not a shape any committed recording contains.
 *
 * ITS ONE KNOWN DEPENDENCE: frames arrive at ~2 Hz in EIGHT of the nine
 * committed recordings (median 539.8 ms) — but at ~1 Hz in the ninth
 * (`walk-2026-08-23/keystone-…`, median 990 ms, min 810, max 1260), measured
 * at Task 5's review. **So the cost below is ~5 s on that cadence, not
 * ~2.5 s.** The earlier "every committed recording" was false, and "strictly increasing" is evaluated per frame, so a much
 * faster stream would need less real motion to satisfy it and a much slower
 * rower more. That is the same dependence `ROWING_ACTIVE_FALLBACK_FRAMES`
 * already carries and the same cadence every capture in
 * `docs/monitor/sessions/` shows; it is written down here rather than
 * assumed away.
 */
export const PULL_EVIDENCE_FRAMES = 5;

/** How many consecutive frames have now carried IDENTICAL values for the
 *  three rowing metrics `freezeKey` keys on — distance, split and rate;
 *  elapsed and heart rate are both deliberately out of it (see
 *  `freezeKey`). `frames` counts the frames themselves (a fresh
 *  value is 1, not 0), so `frames >= PAUSED_FRAME_HOLD` reads exactly as
 *  the spec's sentence does.
 *
 *  `pull`/`pulled` carry the OTHER half (`PULL_EVIDENCE_FRAMES`): the run of
 *  strictly-progressing frames seen so far in this interval, and whether it
 *  has ever reached the threshold. Both live here rather than in their own
 *  ref because they share this one's lifetime exactly — every reset of the
 *  freeze run IS an interval boundary (a rest, or a distance back at zero),
 *  which is precisely when pull evidence must be forgotten. */
export interface FreezeRun {
  key: string;
  frames: number;
  pull: RowingStreak | null;
  pulled: boolean;
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
  // comment rests on 0x0031's per-interval RESET: every frame of a no-rest
  // changeover reads `d 0`, which is what `nextFreezeRun`'s `> 0` guard
  // clears the false positive with. The accumulated field never returns to 0
  // mid-session, so swapping it in here would silently re-open that defect.
  // (A REST boundary is a different story and this guard does not cover it —
  // `PULL_EVIDENCE_FRAMES` does. The reset is still what makes the pull
  // evidence per-interval, so the same "never the accumulated field" rule
  // applies to `nextRowingStreak`'s reading of it.)
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
    return { key: "", frames: 0, pull: null, pulled: false };
  }
  // Pull evidence, forgotten by the reset above at every interval boundary
  // and re-earned inside each interval — see `PULL_EVIDENCE_FRAMES`. The
  // streak's own "a frame that fails to beat the previous distance starts a
  // NEW streak of one" rule is what a dying coast lands on.
  const pull = nextRowingStreak(previous?.pull ?? null, frame);
  const pulled =
    (previous?.pulled ?? false) ||
    (pull !== null && pull.frames >= PULL_EVIDENCE_FRAMES);
  const key = freezeKey(frame);
  return previous !== null && previous.key === key
    ? { key, frames: previous.frames + 1, pull, pulled }
    : { key, frames: 1, pull, pulled };
}

/** BOTH halves, and the order of the sentence is the product claim: the
 *  rower has pulled in this interval (`pulled`) AND nothing has moved since
 *  (`frames`). Without the first half the app tells a rower to resume a
 *  piece they never started; without the second it never tells a rower who
 *  genuinely stopped anything at all. */
export function isPausedRun(run: FreezeRun): boolean {
  return run.pulled && run.frames >= PAUSED_FRAME_HOLD;
}

const NO_FREEZE: FreezeRun = {
  key: "",
  frames: 0,
  pull: null,
  pulled: false,
};

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
 * Pure, exported for the ready-gate fallback's AND the pause gate's tests
 * (two callers since Task 5, not one). `null` means "no streak" —
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
  /** `MonitorSession.holdError`'s own doc comment carries the full
   *  reasoning — mirrored here as internal state for the same "the ref is
   *  truth, `state` is what React reads" split every other field in this
   *  interface already follows. */
  holdError: "storage-failed" | null;
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
   *  `SILENCE_THRESHOLD_MS` with no further arrival) or a lifecycle resume
   *  whose MEASURED gap reached that same threshold (mechanism 2, as
   *  corrected by Phase LM: `decideResumeLatch` — a resume alone is not a
   *  reason, only the measurement is). Latches on `handleFrameSilence`,
   *  retracts only after `BANNER_RETRACT_HYSTERESIS_MS` of continuous
   *  healthy frames (`handleFrameRecovery`) — never on a single frame.
   *  Published for `connectedAxes.ts`'s `frameSilence` axis input, the
   *  same publish-a-boolean shape `frozen`/`runOpen` already establish. */
  frameSilence: boolean;
  /** `MonitorSession.programDropped`'s own doc comment carries the full
   *  reasoning — mirrored here as internal state for the same "the ref is
   *  truth, `state` is what React reads" split every other field in this
   *  interface already follows. */
  programDropped: boolean;
  /** `MonitorSession.closeReason`'s own doc comment carries the full
   *  reasoning — mirrored here as internal state for the same "the ref is
   *  truth, `state` is what React reads" split every other field in this
   *  interface already follows. */
  closeReason: CloseReason | null;
}

const INITIAL_STATE: SessionState = {
  phase: "idle",
  error: null,
  deviceName: null,
  frame: null,
  actuals: [],
  endedBy: null,
  handoffHeld: false,
  holdError: null,
  frozen: false,
  runOpen: false,
  frameSilence: false,
  programDropped: false,
  closeReason: null,
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
  /** Hand-off store design spec §1, plan Task 3: "the hook holds
   *  `lastAcceptedRevisionRef` (a ref — it must survive across driver
   *  callbacks) and applies the discipline: commit accepted -> assign
   *  `runRef` and update the ref; refused -> `runRef` UNCHANGED, receipt
   *  only." `null` before this run's own create-commit has ever landed
   *  (mirrors `commit`'s own `expectedRevision: null` = "expect absent"),
   *  reset alongside `runRef` at every per-run teardown
   *  (`cancel()`/`programDropped`) — a stale revision from a PRIOR run
   *  must never seed a CAS check against this run's own key. Written ONLY
   *  by `applyProducerCommit` below and by the create-commit at this run's
   *  own opening (`handleFrame`'s "ready" branch) — nowhere else in this
   *  file calls `handoffStore.commit`. */
  const lastAcceptedRevisionRef = useRef<number | null>(null);
  /** What the next `live` transition will file the record under — captured
   *  at `program()` (the only moment the caller tells us what workout this
   *  is), not at `live`. */
  const identityRef = useRef(NO_IDENTITY);
  const freezeRef = useRef<FreezeRun>(NO_FREEZE);
  /** The `ready`-only streak behind `ROWING_ACTIVE_FALLBACK_FRAMES`. Only
   *  ever written while the phase is `ready`; once the session is live it is
   *  dead weight until the next `cancel()` clears it. */
  const rowingStreakRef = useRef<RowingStreak | null>(null);
  /** Task 1 (lost-monitor design spec): counts frames `handleFrame` sees
   *  while the app-lifecycle listener believes the app is backgrounded —
   *  `null` when not currently tracking a hidden window (never
   *  backgrounded yet this connection, or the last one has already been
   *  reported at resume). Set to `0` on every "background" transition,
   *  read and reset back to `null` on the matching "foreground" one. */
  const framesWhileHiddenRef = useRef<number | null>(null);
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
  /** WHICH connect attempt owns the flow. Bumped at the top of every
   *  `connect()` and again by `cancel()`, so an attempt can ask whether it
   *  is still the current one after each of its awaits.
   *
   *  This exists because `cancel()` used to be unable to stop an attempt
   *  that had not yet built a driver: it claims `driverRef` synchronously
   *  and finds nothing there during `scan()`/`connect()`, resets the UI to
   *  `INITIAL_STATE`, and the abandoned attempt then runs to completion —
   *  installing a driver and its ten subscriptions behind a screen that
   *  says it is not connected, after which the visible Connect silently
   *  no-ops on this function's own `driverRef.current !== null` guard.
   *  `connect()`'s guard comment predicted exactly this and named the
   *  precondition holding it off: "Unreachable today only because onExit()
   *  unmounts the interstitial synchronously." `JustRowObserver` is the
   *  caller that broke that precondition — it stays mounted through a
   *  cancel and offers Connect again — so the guard got the `cancellingRef`
   *  its own comment asked for, as an attempt counter rather than a flag
   *  (a flag cannot tell a stale attempt from a fresh one).
   *
   *  A superseded attempt disposes of the transport IT created and returns
   *  without touching shared state — ownership follows creation, and the
   *  newer attempt's `connectingRef` claim is never cleared by an older
   *  one's `finally`. */
  const attemptRef = useRef(0);
  /** Phase LT spec 2, Task 2. This session's own in-memory `SeriesRecorder`
   *  (Task 1) — created at the exact moment `runRef` opens (the ready ->
   *  live promotion in `handleFrame` below), fed every live frame, stopped
   *  and dropped at close. Never a second source of truth for what got
   *  persisted: the recorder owns its own buffer, and this hook only ever
   *  flushes SNAPSHOTS of it onto `runRef`'s record via `withSeries` below. */
  const seriesRecorderRef = useRef<SeriesRecorder | null>(null);
  /** The 30-second flush timer's own canceller (`SERIES_FLUSH_INTERVAL_MS`),
   *  or `null` when none is running — no run open, or the run has already
   *  closed. Mirrors `splitHoldRef`'s own "canceller or null" shape. */
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

  /**
   * Hand-off store design spec §1, plan Task 3: the ONE place this hook
   * ever calls `handoffStore.commit` for an ALREADY-OPEN run — the sole
   * committer's own discipline. `next` must be a NEW object (a pure writer
   * gate's accepted output, e.g. `recordActual`'s return when it differs
   * from what was passed in) — every call site below already compares
   * `next !== base` (the gate's own "same reference on decline" contract)
   * before reaching here, so this function is never asked to commit a
   * no-op.
   *
   * Returns `true` iff the commit was ACCEPTED, in which case `runRef` and
   * `lastAcceptedRevisionRef` are updated TOGETHER, in the same call — the
   * two must never drift apart, or the next commit's own `expectedRevision`
   * would be checked against the wrong number. Returns `false` on ANY
   * refusal (`"stale"`, `"retired"`, `"second-key"`): `runRef` is then LEFT
   * UNCHANGED, exactly as spec §1 requires ("a refusal can therefore never
   * diverge producer from store") — the store's own `commit-refused`/
   * `store-second-key-refused` receipt (piped to `logRef` via
   * `setReceiptChannel`, below) is the only record of it; this function
   * adds no second, competing log entry.
   *
   * `createMonitorRun`'s own create-commit (`handleFrame`'s "ready"
   * branch) does NOT go through this function — a create is
   * `expectedRevision: null` unconditionally, never
   * `lastAcceptedRevisionRef.current`, and it seeds `lastAcceptedRevisionRef`
   * itself rather than reading it.
   */
  const applyProducerCommit = useCallback((next: MonitorRun): boolean => {
    const result = commitHandoff(
      next.startedAt,
      lastAcceptedRevisionRef.current,
      next,
    );
    if (!result.accepted) return false;
    runRef.current = next;
    lastAcceptedRevisionRef.current = result.revision;
    return true;
  }, []);

  /**
   * Hand-off store design spec §7, plan Task 3: THE VERIFY, collapsed into
   * the cached verdict — "the release funnel reads the CACHED verdict —
   * the last accepted commit's, not the close commit's ... The verify's
   * second serialize is deleted for this reason." Where #230's own
   * `verifyHandoffWritable` re-serialized `runRef.current` through
   * `saveMonitorRun` a SECOND time purely to observe its own verdict, this
   * reads whatever `handoffStore.cachedVerdict` already recorded at the
   * most recent ACCEPTED commit for this run's key — every closing write
   * in this file (`closeRecord`, the continuity-reset branch, the boundary
   * write, the summary-observations write, the series flush) already goes
   * through `applyProducerCommit` above, which is what keeps this cache
   * current by the time any of the four call sites below reads it.
   *
   * `runRef.current === null` (an End at READY: nothing was ever opened)
   * is a no-op success, matching #230's own "skip on `runRef.current ===
   * null`". Returns `true` when the caller may release normally (`"saved"`
   * and `"saved-without-series"` both count — a degraded-but-landed write
   * is still a landed write; `durableComplete`'s own staleness bookkeeping
   * is a DIFFERENT concern, not this gate's) and `false` on `"failed"`, in
   * which case this function has already logged `hold-error-entered`.
   *
   * **No stash on `"saved-without-series"`** (spec §2: "the memory tier is
   * current by construction — no stash calls exist anymore"): the
   * in-memory entry `handoffStore.read` will serve is `next` itself,
   * unconditionally the FULL record — a durable copy that dropped its
   * series is a fact about the DURABLE tier alone, and the reader (Task
   * 4/5's own scope) never has to fall back to a slot for it.
   */
  const verifyHandoffWritable = useCallback((): boolean => {
    const run = runRef.current;
    if (run === null) return true;
    // Plan Task 3 review (⚠️ observation): `verdict` reads `undefined`
    // in TWO distinct cases, and both correctly fall through to
    // "release" below — never conflate this with a genuine
    // `"failed"`. (1) this key has never been committed at all (not
    // reachable here in practice, since `runRef.current !== null`
    // implies `createMonitorRun`'s own create-commit already ran); (2)
    // the key was ALREADY RETIRED — `handoffStore.retire()` deletes the
    // cached-verdict entry for a key it retires (`handoffStore.ts`'s own
    // `retire`: `cachedVerdicts.delete(sessionKey)`), so a commit this
    // hook believes is still open but that some door has since retired
    // reads back as `undefined` here too. Releasing on `undefined` is
    // correct either way — there is nothing left to hold a write open
    // FOR — but it is `undefined` for that reason, not because nothing
    // ever happened.
    const verdict = cachedHandoffVerdict(run.startedAt);
    if (verdict === "failed") {
      logRef.current?.record(
        "hold-error-entered",
        `run=${run.startedAt} the cached durable verdict is "failed" — holding the ended hand-off instead of releasing it silently`,
      );
      return false;
    }
    return true;
  }, []);

  /**
   * Plan Task 3 review (I4): the THREE "no-hold close" sites
   * (`endByMachine`'s own no-conditions-owed branch, `endSession`'s
   * link-lost branch, and the continuity-reset branch) used to each
   * inline their own copy of "if nothing opened a hold, run the verify
   * and compute `handoffHeld`/`holdError`" — two of the three shared an
   * identical `let`+`if` shape, but the continuity-reset branch's own
   * copy was a bare ternary with no `alreadyOpen` guard at all (it never
   * opens a hold to begin with), which made it a DIFFERENT STRUCTURE, not
   * merely a differently-named copy of the same one — "architecturally
   * identical" was a claim about intent, not about what a test exercising
   * one copy could prove about the others. Collapsed into this one
   * function so mutating the verify's own consultation in ONE place is
   * what every one of the three call sites depends on, and each existing
   * denied-write test (via `endSession`'s call, or the release funnel)
   * bites here.
   *
   * `alreadyOpen`: `true` when the caller's own opener(s) already armed a
   * hold (`splitOpened || burstOpened`, or `endSession`'s own `held`) —
   * short-circuits to "held, no verify" without touching
   * `verifyHandoffWritable` at all, since that hold's own eventual
   * release runs the verify itself, once, at `resolveHandoffCondition`'s
   * shared funnel (never here — running it twice would be the RF24 shape
   * this review round's own I4 finding warns about). `false` for a close
   * that never had anything to open (the continuity-reset branch's own
   * permanent case, or the other two whenever their own openers found
   * nothing owed) — runs the verify synchronously.
   */
  const noHoldCloseVerdict = useCallback(
    (
      alreadyOpen: boolean,
    ): { handoffHeld: boolean; holdError: "storage-failed" | null } => {
      if (alreadyOpen) return { handoffHeld: true, holdError: null };
      if (verifyHandoffWritable())
        return { handoffHeld: false, holdError: null };
      return { handoffHeld: true, holdError: "storage-failed" };
    },
    [verifyHandoffWritable],
  );

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
      applyProducerCommit(next);
    }, SERIES_FLUSH_INTERVAL_MS);
  }, [withSeries, stopSeriesFlush, applyProducerCommit]);

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
  /** series-truth spec §C′ / Task 4: the recorder never sees the ring (it
   *  is a pure accumulator, the driver's own doc comment applies here too);
   *  the HOOK is the recorder's actual owner, so this is the one place that
   *  reads its `backwardBucketCount()` and, when nonzero, says so — once,
   *  here, upstream of the teardown stash, never at every refused sample
   *  (the count itself already IS the once-per-close summary). Silent at
   *  zero: a healthy run's ring stays exactly as it was before this task. */
  const closeRecord = useCallback(
    (terminated: boolean, endedBy: CloseReason): void => {
      const run = runRef.current;
      // Task 1 (lost-monitor design spec): today this returns silently —
      // the exact silence that cost a tester a workout and two days to
      // find. Records only that nothing was open to close and the two
      // values the caller offered; never why no run had opened (the
      // caller's own three producers are undistinguished here on
      // purpose — see the design spec's own hard constraint).
      if (run === null) {
        logRef.current?.record(
          "close-no-record",
          `endedBy=${endedBy} terminated=${terminated}`,
        );
        return;
      }
      if (run.completedAt !== null) return;
      const withFinalSeries = withSeries(run);
      const next = completeMonitorRun(
        withFinalSeries,
        { terminated, endedBy },
        nowDate(),
      );
      // `completeMonitorRun` never declines a live run (the `completedAt
      // !== null` guard just above already proved it), so `next` is always
      // a fresh object here — `applyProducerCommit` is called
      // unconditionally rather than gated on an identity check that could
      // never be false in practice.
      applyProducerCommit(next);
      stopSeriesFlush();
      const backwardBucketCount =
        seriesRecorderRef.current?.backwardBucketCount() ?? 0;
      if (backwardBucketCount > 0) {
        logRef.current?.record(
          "series-backward-buckets",
          `${backwardBucketCount} sample(s) refused because the work clock went backwards - attribution defect upstream, series is missing data (series-truth spec C')`,
        );
      }
      seriesRecorderRef.current?.stop();
      seriesRecorderRef.current = null;
    },
    [nowDate, withSeries, stopSeriesFlush, applyProducerCommit],
  );

  /** Storage-spine design spec §2, Task 3: the hand-off hold's SPLIT
   *  condition — its backstop's canceller (`FINISH_HANDOFF_HOLD_MS`), or
   *  `null` when this condition is not owed. One at a time — a run ends
   *  once. Split into its own ref (was the single `handoffHoldRef`) so the
   *  hold can owe this and the burst condition below independently; the
   *  hold itself releases only once BOTH read `null`. */
  const splitHoldRef = useRef<(() => void) | null>(null);

  /** Storage-spine design spec §2, Task 3: the hand-off hold's BURST
   *  condition — its backstop's canceller (`BURST_HANDOFF_HOLD_MS`), or
   *  `null` when this condition is not owed. Mirrors `splitHoldRef`'s own
   *  shape exactly; the two are independent and either, both, or neither
   *  may be owed at a given `ended` transition (spec §2's three arms). */
  const burstHoldRef = useRef<(() => void) | null>(null);

  /** Storage-spine design spec §2's late side (PR 1, Task 3): while a
   *  BURST-ELIGIBLE teardown (a natural finish or a rower-ended close —
   *  the linger's own predicate, summary-record spec §1 gate 1) is in its
   *  burst linger, this holds the
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
   *  variable inside `teardown`, matching `splitHoldRef`/`burstHoldRef`'s
   *  own idiom immediately above: `finish` (the linger's completion,
   *  defined inside `teardown`) needs to cancel this timer from whichever
   *  trigger reaches it first, and assigning across that boundary through
   *  a plain closure variable trips `react-hooks/immutability` — the
   *  reassignment lands in the outer scope after the closure that reads it
   *  has already been handed off (to `lingerFinishRef.current` above). */
  const burstLingerCancelRef = useRef<(() => void) | null>(null);

  /** Storage-spine design spec §2, Task 3: releases EVERY owed condition
   *  unconditionally — the teardown catch-all, not a per-condition
   *  resolution (`resolveHandoffCondition` below is that). Cancels both
   *  `splitHoldRef` and `burstHoldRef` regardless of which (if either) is
   *  actually owed, and performs the single `handoffHeld: false`
   *  update/`handoff-released` ring entry only when at least one of them
   *  was — so calling this with nothing held (every close that never
   *  opened a hold, or a second call after the hold already released) is a
   *  true no-op, and calling it with only one condition owed still
   *  releases correctly. `"teardown"` is its only caller-facing reason: a
   *  teardown is the hand-off completing, or the rower leaving — either
   *  way nothing is left to wait for, and neither condition's own more
   *  specific reason applies once the surface is on its way out. */
  const releaseHandoff = useCallback(
    (reason: "teardown"): void => {
      const splitCancel = splitHoldRef.current;
      const burstCancel = burstHoldRef.current;
      if (splitCancel === null && burstCancel === null) return;
      splitHoldRef.current = null;
      burstHoldRef.current = null;
      splitCancel?.();
      burstCancel?.();
      logRef.current?.record(
        "handoff-released",
        `${reason} — the ended hand-off is free to navigate (${stateRef.current.actuals.length} actual(s) measured)`,
      );
      update({ handoffHeld: false });
    },
    [update],
  );

  /** Storage-spine design spec §2, Task 3: resolves ONE owed condition —
   *  cancels its own backstop and clears its own ref — and releases the
   *  hold (the single `handoffHeld: false` update, the single
   *  `handoff-released` ring entry naming REASON) only when the OTHER
   *  condition is not also still owed. A no-op when the named condition is
   *  not currently owed, so every resolution site can call this
   *  unconditionally (mirrors `releaseHandoff`'s own idempotence). This is
   *  the shared helper both `openHandoffHold`'s backstop and
   *  `openBurstHold`'s backstop schedule against, and both `final-boundary`
   *  (below) and the `summary-observations` handler call directly. */
  const resolveHandoffCondition = useCallback(
    (
      which: "split" | "burst",
      reason: "final-boundary" | "burst-heard" | "burst-timeout" | "backstop",
    ): void => {
      const ref = which === "split" ? splitHoldRef : burstHoldRef;
      const cancel = ref.current;
      // Defensive, same no-op contract as `releaseHandoff`'s own —
      // currently unreachable from any test in this file (each condition's
      // own single resolution site fires at most once per run: the driver
      // vouches for the final boundary once, and `summary-observations`
      // fires at most once per run by its own doc comment), but the
      // resolution sites do not themselves enforce that, so this guard is
      // what makes a hypothetical duplicate a no-op rather than a
      // double-cancel.
      if (cancel === null) return;
      ref.current = null;
      cancel();
      if (splitHoldRef.current !== null || burstHoldRef.current !== null) {
        return;
      }
      // Hand-off store design spec §7, plan Task 3: THIS is the shared
      // release funnel for all three burst-holding arms (machine finish,
      // Menu terminate, rower End with the link up) — the ONE place their
      // own hold's last owed condition resolving turns into an actual
      // release, so it is also the one place their verify can run without
      // ever running twice (the guard above already proved neither
      // condition is still owed). A `"failed"` cached verdict holds
      // instead of releasing — no timer, only `retryHandoffSave()`/
      // `proceedHandoff()`/leaving get out.
      if (!verifyHandoffWritable()) {
        update({ handoffHeld: true, holdError: "storage-failed" });
        return;
      }
      logRef.current?.record(
        "handoff-released",
        `${reason} — the ended hand-off is free to navigate (${stateRef.current.actuals.length} actual(s) measured)`,
      );
      update({ handoffHeld: false, holdError: null });
    },
    [update, verifyHandoffWritable],
  );

  /** Opens the hold's SPLIT condition if — and only if — this run is still
   *  missing the actual the machine's own finish is about to deliver (walk
   *  day 2, `FINISH_HANDOFF_HOLD_MS`). Returns whether it opened, so the
   *  caller can fold `handoffHeld` from BOTH openers into the SAME state
   *  patch that flips the phase (one render, not two: a
   *  `handoffHeld: false` frame between them would let the surface hand
   *  off before the hold ever existed).
   *
   *  "Missing" is the record's own question, asked the record's own way: is
   *  there an actual for the program's LAST interval? That is the only
   *  boundary the driver's finish grace can still deliver
   *  (`monitorRun.ts`'s `acceptableFinalBoundary`), so a run that already has
   *  it — the desktop order, where the split arrives BEFORE the finished tick
   *  — waits for nothing on THIS condition and pays nothing here. (Storage-
   *  spine design spec §2, Task 3: it may still owe the BURST condition
   *  below — "pays nothing" was true of the whole hold before this task and
   *  is now a claim about this condition alone.) */
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
    splitHoldRef.current = schedule(
      () => resolveHandoffCondition("split", "backstop"),
      FINISH_HANDOFF_HOLD_MS,
    );
    logRef.current?.record(
      "handoff-hold",
      `machine finish with interval ${lastIndex} unmeasured — holding the ended hand-off up to ${FINISH_HANDOFF_HOLD_MS}ms for its split (walk day 2: navigating tears down the subscription the split arrives on)`,
    );
    return true;
  }, [resolveHandoffCondition]);

  /** Storage-spine design spec §2, Task 3: opens the hold's BURST condition
   *  if — and only if — this run is burst-eligible and has not yet heard
   *  the machine's own summary burst: `run.completedAt !== null &&
   *  (run.endedBy === "finished" || run.endedBy === "rower") &&
   *  run.summaryTotals === undefined` — the SAME predicate teardown's own
   *  linger and `appendSummaryObservations`'s own writer gate already
   *  enforce (one predicate, now three enforcement points, deliberately).
   *  Returns whether it opened, for the identical one-render reason
   *  `openHandoffHold` above returns it. Called from all three burst-
   *  eligible `ended` transitions (`endByMachine`'s two branches,
   *  `endSession`) — `run === null`/a non-burst-eligible `endedBy` (a
   *  never-rowed close, or any non-finished/rower close: `link-lost`,
   *  `program-failed`, `program-dropped`) all return `false` via this one
   *  predicate rather than each caller special-casing it. */
  const openBurstHold = useCallback((): boolean => {
    const run = runRef.current;
    if (run === null) return false;
    // Both guards below are DEFENSIVE and currently unreachable from this
    // function's only two call sites (`endByMachine`, `endSession`), both
    // of which call `closeRecord` before this — so `completedAt` is never
    // actually `null` here today. And `summaryTotals` is documented (this
    // constant's own comment) to be ALWAYS `undefined` at this point given
    // how the driver folds a burst-first summary — a defence-in-depth
    // clause against that ordering changing, not a path any test exercises
    // today (same "unreachable code wearing a guard's clothes" trade
    // `openHandoffHold`'s own `lastIndex < 0` comment names above).
    if (run.completedAt === null) return false;
    if (run.endedBy !== "finished" && run.endedBy !== "rower") return false;
    if (run.summaryTotals !== undefined) return false;
    const schedule =
      depsRef.current.schedule ??
      ((cb: () => void, ms: number): (() => void) => {
        const id = setTimeout(cb, ms);
        return () => clearTimeout(id);
      });
    burstHoldRef.current = schedule(
      () => resolveHandoffCondition("burst", "burst-timeout"),
      BURST_HANDOFF_HOLD_MS,
    );
    logRef.current?.record(
      "handoff-hold",
      `burst-eligible close (endedBy=${run.endedBy}) with no summary yet — holding the ended hand-off up to ${BURST_HANDOFF_HOLD_MS}ms for the machine's own summary burst`,
    );
    return true;
  }, [resolveHandoffCondition]);

  const handleFrame = useCallback(
    (frame: MonitorFrame, driver: MonitorDriver): void => {
      // Task 1 (lost-monitor design spec): counted for EVERY frame, in
      // whatever phase, while a hidden window is open — the resume
      // handler below reports this at the next "foreground" regardless
      // of what else this frame does.
      if (framesWhileHiddenRef.current !== null) {
        framesWhileHiddenRef.current += 1;
      }
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
          const run = createMonitorRun(
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
              // Phase JR PR 2: set by `beginFreeRow` and absent otherwise,
              // so a programmed run's record is byte-identical to what it
              // was before this phase.
              mode: identity.mode,
            },
            nowDate(),
          );
          // Hand-off store design spec §1/§5, plan Task 3: `createMonitorRun`
          // is now a PURE BUILDER (see its own doc comment in
          // `monitorRun.ts` for why the commit lives HERE rather than
          // there — a circular import with `handoffStore.ts`). This is the
          // create-commit, `expectedRevision: null` unconditionally (spec
          // §1's own "the create case"), preceded by the "createMonitorRun
          // defense" retire spec §5 names: whatever remains unretired.
          //
          // **FOLDED with the armed-acceptance retire (Task 5 review fix
          // round, 2026-08-30): this IS now genuinely redundant in the
          // ordinary case, not merely "structurally should be."**
          // `useMonitorSession.ts`'s own `event.kind === "armed"` handler,
          // above in this same file, already retired the Connect guard's
          // staged set the moment the machine confirmed holding this
          // program — strictly before this frame could ever arrive. This
          // block stays anyway, unchanged, as the narrower backstop for
          // the one window that retire cannot see: something UNSTAGED
          // appearing between "armed" and this, the first real rowing
          // frame — without it, that narrow case would refuse the
          // create-commit below as `store-second-key-refused` instead of
          // the rower simply starting to row (the design's own "no
          // rendered change" exit criterion). `retire`'s own per-entry
          // receipt still makes it visible if it ever finds anything.
          // Plan Task 3 review (M6): if the leftover entry's OWN key
          // already equals the run we are about to create (a genuine
          // clock-resolution collision — the exact shape this task's own
          // test fixtures hit before `resetForTests()` existed, per that
          // function's own doc comment), retiring it here would be
          // self-defeating: `retire()` tombstones unconditionally, so the
          // create-commit two lines below would find its OWN key freshly
          // retired and be refused `"retired"` instead of succeeding. In
          // that one case, skip the retire and ADOPT the entry's own
          // revision — an UPDATE-shaped commit (`expectedRevision:
          // stale.revision`), not a create — so the run this hook is
          // about to open lands as the next revision of what is already
          // there rather than tombstoning its own key out from under
          // itself.
          const stale = currentUnretiredHandoff();
          const sameKeyStale =
            stale !== null && stale.sessionKey === run.startedAt;
          if (stale !== null && !sameKeyStale) {
            retireHandoff(
              [{ sessionKey: stale.sessionKey, revision: stale.revision }],
              "createMonitorRun-defense",
            );
          }
          const created = commitHandoff(
            run.startedAt,
            sameKeyStale ? stale.revision : null,
            run,
          );
          // Unconditional either way (spec's own exit criteria: "no
          // rendered change" — a structurally-impossible refusal here must
          // never block the rower from actually starting to row; the
          // store's own `store-second-key-refused`/`commit-refused`
          // receipt, piped to `logRef` above, is what makes a genuine
          // invariant violation visible without holding up this frame).
          runRef.current = run;
          lastAcceptedRevisionRef.current = created.accepted
            ? created.revision
            : null;
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
        // watchdog silence, and an app-lifecycle resume whose MEASURED gap
        // exceeded the threshold — 2026-08-26: a resume alone no longer
        // latches anything, see `decideResumeLatch`) both latch
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
          // Hand-off store design spec §1, plan Task 3: `withFinalSeries`
          // is always a NEW object relative to the run this hook held
          // before the reset (`closed !== runRef.current` already proved
          // that; `withSeries` either returns `closed` itself or a further
          // spread of it), so this always reaches the store — never a
          // no-op commit. `completeContinuityReset` is one of the writer
          // gates this task makes PURE; this call site is its own
          // committer, same discipline as `closeRecord`'s.
          applyProducerCommit(withFinalSeries);
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
          // renders "Your numbers are kept," never a false "The monitor
          // finished it."
          //
          // "THE NEUTRAL OPTION" IS WHAT THAT LINE USED TO SAY, and it was
          // only ever neutral where a record existed (fix round,
          // whole-branch review HIGH). `endSession` reaches the same
          // `phase: "ended"` frame with NO record at all — `closeRecord`
          // logs `close-no-record` and returns — and "your numbers are
          // kept" over nothing was the flagship lie. That frame now asks
          // `summaryModel.ts`'s measured-anything rule FIRST and says "No
          // numbers to keep." at zero, so the `endedBy` choice recorded
          // here only ever picks between the two honest promises. A
          // continuity reset closes a record that has actuals, so it lands
          // on the neutral one exactly as before.
          // No handoff hold, either condition: a reset is not a natural
          // finish (no boundary is coming), the same reasoning
          // `endByMachine`'s own `terminated` branch uses to skip
          // `openHandoffHold()` — and `completeContinuityReset` stamps
          // `endedBy: "interrupted" | "link-lost"` (`monitorRun.ts`),
          // neither of which is burst-eligible, so `openBurstHold()`'s own
          // predicate excludes this arm too without a special case here.
          //
          // Hand-off store design spec §7, plan Task 3: one of the "no-hold
          // closes" — a close that opens NO hold at all still owes the
          // verify, synchronously, in this SAME `ended` patch, before
          // `handoffHeld` reaches `false`. This branch never opens a hold
          // of its own (the comment above explains why), so it is always
          // `noHoldCloseVerdict(false)` — never `true`.
          const { handoffHeld, holdError } = noHoldCloseVerdict(false);
          update({
            phase: "ended",
            endedBy: "user",
            runOpen: false,
            handoffHeld,
            holdError,
          });
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
        const wasPaused = isPausedRun(freezeRef.current);
        const freeze = nextFreezeRun(freezeRef.current, frame);
        freezeRef.current = freeze;
        const nowPaused = isPausedRun(freeze);
        // RC-25 (James, 2026-08-26: "Add the instrument now"). The pause is
        // DERIVED and was never logged, which is why his sighting of a false
        // `PULL TO RESUME` at a rest boundary left no trace and had to be
        // provoked at the erg to be seen at all. Task 5's fix is pinned hard
        // in one direction (a genuine pause still fires — corpus regression
        // over all nine committed recordings) and has NO oracle in the other:
        // no committed capture contains the coast shape, and a device build
        // cannot produce a recording.
        //
        // So log the EDGE, with the frame that closed the run and the evidence
        // the predicate weighed. The next natural occurrence then proves or
        // refutes the model with a `COPY` tap, and no walk is needed for it.
        // Edge only, never per frame: a pause holds for many frames and a
        // per-frame entry would bury the ring it is written into.
        //
        // Records what was MEASURED and asserts no cause — the same rule the
        // resume line follows since the trigger fix.
        if (nowPaused && !wasPaused) {
          logRef.current?.record(
            "pause-declared",
            `frames=${freeze.frames} hold=${PAUSED_FRAME_HOLD} pulled=${freeze.pulled} ` +
              `d=${frame.distanceMeters} split=${frame.currentSplit} spm=${frame.spm}`,
          );
        }
        update({ frame, frozen: nowPaused });
        return;
      }
      // Every other phase still SEES the frame (the machine's current
      // reading is true whether or not we are driving it — the panes read
      // it, and `armed`/`finished` ticks keep arriving for the life of the
      // transport) but no phase moves on it.
      update({ frame });
    },
    [
      nowDate,
      update,
      startSeriesFlush,
      withSeries,
      stopSeriesFlush,
      applyProducerCommit,
      noHoldCloseVerdict,
    ],
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
      // THE HAND-OFF HOLD (walk day 2; widened by storage-spine design
      // spec §2, Task 3). Only a natural FINISH opens the SPLIT condition:
      // a `terminated` close opens no finish grace in the driver either
      // (CSAFE-DEF footnote 12 — the Split/Interval Number is unstable when
      // a workout is terminated mid-interval), so there is no boundary of
      // that kind to wait for. BOTH branches may still owe the BURST
      // condition, though — a Menu terminate is exactly the arm the
      // corpus's worst case (542 ms, `smoke-terminated`) lives on (spec
      // §2's second arm) — so `openBurstHold()` runs UNCONDITIONALLY,
      // never short-circuited by `terminated`, and `handoffHeld` is the OR
      // of both openers. The phase flips either way, in one patch with the
      // hold flag — both openers must run before this single `update` so
      // neither condition is missed by a `handoffHeld: false` frame
      // between them.
      const splitOpened = terminated ? false : openHandoffHold();
      const burstOpened = openBurstHold();
      // Hand-off store design spec §7, plan Task 3: "the no-conditions-
      // owed finish" — a close whose run is `null` (a Menu terminate/
      // WORKOUTEND before any rowing frame ever arrived; both openers
      // return `false` via their own `run === null` guard) still owes the
      // verify in this same `ended` patch — a no-op for THIS reason
      // specifically, since `verifyHandoffWritable`'s own `run === null`
      // short-circuit always returns `true` there, but kept for the
      // identical "every ended hand-off with a completed run runs the
      // verdict branch" uniformity `endSession`/the continuity-reset
      // branch also follow.
      // **CORRECTED, found while building this task's own tests
      // (`useMonitorSession.test.ts`'s "hand-off store" describe block):
      // for a NON-null run, `burstOpened` is unreachable-false here.** An
      // earlier version of this comment claimed a burst-first race could
      // leave `summaryTotals` already set by this point — that requires
      // `appendSummaryObservations` to have accepted a write against a
      // STILL-LIVE run, which its own `completedAt === null` gate refuses
      // outright; the driver's own ordering also emits `terminated` BEFORE
      // `summary-observations` for exactly this reason (see
      // `useMonitorSession.test.ts`'s own test (h) and its comment: the
      // pickup "must run AFTER the `terminated` event or the record is
      // still open and declines the write forever"). So for a real run,
      // `openBurstHold()` always opens here, and this branch's own
      // `!handoffHeld` half is provably true only in the `run === null`
      // case — a no-op, not a genuine denied-write path; that path is
      // instead caught by `resolveHandoffCondition`'s own release funnel,
      // once the hold this function DID open resolves.
      const { handoffHeld, holdError } = noHoldCloseVerdict(
        splitOpened || burstOpened,
      );
      update({
        phase: "ended",
        endedBy: "machine",
        handoffHeld,
        holdError,
        runOpen: false,
      });
    },
    [closeRecord, openBurstHold, openHandoffHold, update, noHoldCloseVerdict],
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
        // Hand-off store design spec §5's "armed acceptance" row, plan
        // Task 5 review fix round: THE ACCEPTANCE POINT. `ConnectAction.tsx`
        // stages the guard's own authorization in the store at PRESS time
        // (`stageRetire`) but does not retire anything itself — a retire
        // there destroyed the record even when the connect attempt then
        // failed or was cancelled (the reviewer's own probe: seed, Connect,
        // Connect anyway, a real transport-missing failure, Cancel — the
        // record was already gone). This event is the first point a
        // failed or cancelled attempt CANNOT reach (census: "Connect ->
        // program -> armed | failure-card" — armed sits strictly after a
        // successful `program()`), which is what makes retiring HERE safe:
        // by the time this fires, the rower has genuinely connected and
        // programmed a new workout, and every earlier exit (Cancel from
        // any prior state, the failure-card's "Row on the phone timer
        // instead") has destroyed nothing.
        //
        // `takeStagedRetireHandoff()` consumes (returns AND clears) the
        // set unconditionally — a no-op array when `ConnectAction.tsx`
        // never had anything to stage. Key-bound to whatever was staged:
        // `retire()`'s own key lookup finds and removes the CURRENT entry
        // for that key regardless of the authorized revision, reporting a
        // mismatch as `superseded` rather than refusing (§1: a superseded
        // revision never rejects) — a late burst from an unrelated, torn-
        // down hook racing the rower's own hesitation on the confirm panel
        // is exactly the case this protects.
        const staged = takeStagedRetireHandoff();
        if (staged.length > 0) {
          retireHandoff(staged, "connect-guard-armed");
        }
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
        //
        // **RECONCILED, Phase JR PR 2 — the rule below is unchanged and the
        // guard that enforced it has MOVED.** This used to read: "Gated on
        // our record being open: a boundary the machine reports outside any
        // run of ours (a rower's JustRow auto-split, post-terminate
        // housekeeping — the driver emits those with `index: null`) belongs
        // to no program and must never be filed against one."
        //
        // The rule is right and still binding. What changed is that "outside
        // any run of ours" stopped being the same thing as "a JustRow
        // auto-split": a free row now HAS a run of ours, so its auto-splits
        // arrive here with the record wide open, and `recordActual` gates on
        // whether the record is closed, never on the index. The
        // `run === null` check below therefore no longer covers the case its
        // own comment named, and the free-row refusal underneath it does.
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
        // THE FREE-ROW REFUSAL (Phase JR PR 2). A free row has no intervals
        // — the machine's 5-minute auto-splits are its own bookkeeping, not
        // structure anyone asked for — so NONE of them is filed, rather than
        // only the `index: null` ones. Keying on the mode rather than the
        // index says the actual thing: `MonitorRun.actuals` on a free row
        // means "the intervals of this row", and there are none.
        //
        // This is also what keeps the surface honest. `measuredIntervalCount`
        // reads `actuals` without ever looking at `index`, so a single
        // phantom here is what makes the ended frame and the lost banner
        // report intervals on a screen that shows none.
        if (run.mode === "justrow") {
          logRef.current?.record(
            "record-actual",
            `index=${event.actual.index} REFUSED (free row: the machine's own auto-split, not an interval of ours)`,
          );
          return;
        }
        // Phase LT spec 2, Task 2: THE BOUNDARY FLUSH (§2's flush policy —
        // "the hook layer flushes after each boundary write lands"). Rather
        // than a second write chasing `recordActual`'s own, the freshest
        // series snapshot is attached to the CANDIDATE record passed in, so
        // this hook's own `applyProducerCommit` call below already commits
        // both the accepted actual and the trace in one write —
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
        // commit, nothing to re-render, exactly as `recordActual`'s own
        // immutability guard always meant before `candidate` existed.
        //
        // Hand-off store design spec §1, plan Task 3: the GATE accepting
        // (`accepted`, above) is no longer the same fact as the STORE
        // accepting — a stale/retired/second-key refusal is now possible
        // here too, and `runOpen`/`actuals` must only ever reflect what the
        // store actually committed, per the sole-committer discipline
        // (`applyProducerCommit`'s own doc comment: "a refusal can
        // therefore never diverge producer from store").
        if (accepted && applyProducerCommit(next)) {
          update({ actuals: next.actuals });
        }
        // Whatever the record decided, the boundary the SPLIT condition was
        // waiting for has now been and gone — the wait is for the SPLIT,
        // not for a successful write (whose outcome the entry above
        // records). Resolved AFTER the write above so the release's own
        // log entry (if this also clears the last owed condition) reports
        // the count the rower is about to be handed, not the one from a
        // moment earlier. Storage-spine design spec §2, Task 3: this is
        // "resolve the split condition", not an unconditional release —
        // the hold stays up if the burst condition is still owed.
        if (event.finalBoundary === true) {
          resolveHandoffCondition("split", "final-boundary");
        }
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
      if (event.kind === "programDropped") {
        // RC-37 ([R5], design spec 2026-08-27-link-authority-design.md §1):
        // the detector fired — the PM5 already left the program it was
        // holding. `driver.ts`'s own armedWatch is independent of this
        // hook's `phase` (it runs off raw wire ticks alone), so the SAME
        // event can arrive at READY (Menu press, the walk's own confirmed
        // trigger — handled below, unchanged) or mid-row (the live arm
        // immediately below). Wave F PR 1 Task 2 (design spec
        // 2026-08-31-lifecycle-design.md §1, §0.2): the live case is no
        // longer left alone — §0.2 falsifies the premise an earlier
        // revision of this comment scoped it out on.
        const phase = stateRef.current.phase;
        if (phase === "live") {
          // Spec §1 (lifecycle design, rev 4): the erg dropped its own
          // program mid-row. A third endByMachine-shaped close: keep what
          // was rowed, no terminate (RC-37 ruling — the machine already
          // left), no holds (there will never be another boundary, and a
          // burst can neither arrive nor be stored for this close reason),
          // synchronous verify.
          const run = runRef.current;
          if (run !== null && run.completedAt !== null) return; // P3b pin
          closeRecord(true, "program-dropped");
          const { handoffHeld, holdError } = noHoldCloseVerdict(false);
          // closeReason rides the SAME patch as the phase flip so no frame
          // can render "ended" without it (review P1-1's transport).
          // programDropped stays false: that flag is the pre-row exit
          // signal and would arm ConnectedInterstitial's onExit effect
          // against this navigation.
          update({
            phase: "ended",
            endedBy: "machine",
            closeReason: "program-dropped",
            handoffHeld,
            holdError,
            runOpen: false,
          });
          return;
        }
        if (phase !== "programming" && phase !== "ready") return;
        // [R5], James's own words: "Loose any new banners. Just take it
        // back here and remember any nudges." Exit exactly like Cancel
        // (`cancel()`'s own body, below), MINUS the terminate — the machine
        // has already left, so there is no program of ours left to
        // terminate, and sending one anyway is the one thing this ruling
        // rules out. No row: a pre-row session opens no record at all
        // (`createMonitorRun`'s single call site is gated on
        // `phase === "ready"` — Phase LM's own finding), so there is
        // nothing here to save or discard. Nudges survive for free: they
        // live on `WorkoutDetailView`, keyed only by a workout SWITCH
        // (`WorkoutDetail.tsx`), and this exit just unmounts the
        // interstitial sitting on top of it — the identical reason
        // Cancel's own exit already preserves them.
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        degradedUnsubRef.current?.();
        degradedUnsubRef.current = null;
        if (lifecycleAttemptRef.current !== null) {
          lifecycleAttemptRef.current.cancelled = true;
        }
        lifecycleUnsubRef.current?.();
        lifecycleUnsubRef.current = null;
        driverRef.current = null;
        bestEffort(driver.disconnect());
        identityRef.current = NO_IDENTITY;
        freezeRef.current = NO_FREEZE;
        rowingStreakRef.current = null;
        lastContinuityRef.current = null;
        runRef.current = null;
        // Hand-off store design spec §1: same per-run reset `cancel()`
        // applies to this ref, for the identical reason — see that
        // function's own comment.
        lastAcceptedRevisionRef.current = null;
        // Task 5 review fix round: this attempt DIED here — the rev-3
        // antagonist's own words, "a set staged for attempt 1 must not
        // authorize attempt 2's retire." Discards whatever the Connect
        // guard staged for THIS hook instance rather than leaving it to
        // be wrongly consumed by some LATER, unrelated Connect press's
        // own "armed" event. `discardStagedRetireHandoff` (F-3/F-4,
        // re-review), not the bare `takeStagedRetireHandoff` the armed
        // handler uses — this path receipts a genuine discard.
        discardStagedRetireHandoff();
        update({ ...INITIAL_STATE, programDropped: true });
        return;
      }
      if (event.kind === "summary-observations") {
        // THE MACHINE'S OWN FINISH, FOLDED ONTO THE RECORD (storage-spine
        // design spec §2, PR 1 Task 3). `driver.ts`'s own doc comment on
        // this event kind: emitted AT MOST ONCE per run, by any of three
        // paths — `reconcileSummary`'s two branches on a natural finish,
        // and (summary-record spec §1) the observations-only door for a
        // ROWER-ended close, which emits this event and nothing else. This
        // handler needs no branch for the third: the write below is the
        // observation write, which is precisely all a terminate's summary
        // is allowed to do, and `appendSummaryObservations` re-checks the
        // eligible-close predicate itself (gate 4). `runRef.current` is
        // the identity AND the base this write builds on now (hand-off
        // store design spec §1/§3, plan Task 3: `appendSummaryObservations`
        // is pure and no longer re-reads storage — see its own doc comment
        // in `monitorRun.ts`), so a `run === null` here just means there is
        // no run to even ATTEMPT the write with — not a reason to skip
        // trying to finish an open linger, which happens unconditionally
        // below.
        // THE RECEIPT INSTRUMENT (storage-spine design spec §5, Task 3):
        // "the driver records that it EMITTED; nothing records whether the
        // record was updated" — the walk README's own lesson. Every branch
        // below records exactly one of `summary-recorded` /
        // `summary-append-rejected` / `summary-no-run`, and the burst
        // condition resolves on the write ATTEMPT (§2's "resolution: ...
        // RETURNING a run" — accepted or refused, both are an attempt),
        // never on `run === null` (no identity, so the condition — keyed on
        // a run — cannot have been owed in the first place; spec §3's
        // fourth path).
        const run = runRef.current;
        if (run === null) {
          logRef.current?.record(
            "summary-no-run",
            "the machine's own summary arrived with no run identity to attempt the write against",
          );
        } else {
          const appended = appendSummaryObservations(run, {
            totals: event.totals,
            detail: event.detail,
            ...(event.verificationBytes !== undefined
              ? { verificationBytes: event.verificationBytes }
              : {}),
          });
          // Hand-off store design spec §1, plan Task 3: the writer gate
          // accepting (`appended !== null`) is no longer the same fact as
          // the store accepting — a stale/retired/second-key refusal is
          // now possible here too (the sole-committer discipline:
          // `runRef` must never diverge from an accepted commit).
          if (appended !== null && applyProducerCommit(appended)) {
            logRef.current?.record(
              "summary-recorded",
              `run=${appended.startedAt} totals=${JSON.stringify(appended.summaryTotals)}`,
            );
          } else {
            // TWO ways this lands here, both defensive rather than
            // expected: (1) Gate 4 (the same eligible-close predicate this
            // event's own opener re-checks) refused the write outright
            // (`appended === null`) — the opener already enforces the
            // identical predicate; (2) the writer gate accepted but the
            // STORE refused the commit (stale/retired/second-key — hand-off
            // store design spec §1) — the store's own `commit-refused`
            // receipt (piped to `logRef` via `setReceiptChannel`) carries
            // which. Waiting longer cannot help either way, so this still
            // resolves the condition (`"burst-heard"` — the burst WAS heard
            // off the wire; the receipts above are what distinguish the
            // rejection).
            logRef.current?.record(
              "summary-append-rejected",
              `run=${run.startedAt} declined — either the writer gate (appendSummaryObservations) or the store's own commit refused this attempt`,
            );
          }
          resolveHandoffCondition("burst", "burst-heard");
        }
        // If a burst-eligible teardown (natural finish OR rower-ended —
        // spec §1 gate 1) is mid-linger waiting for exactly
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
        // Deliberately NOT a hand-off-hold release (walk day 2; widened by
        // storage-spine design spec §2, Task 3 — a hold can now also be
        // open after a Menu terminate or a user End, not only a machine
        // finish). On the two `endByMachine` arms the driver's run is
        // already CLOSED by the time either condition opens — exactly the
        // case `driver.ts`'s `onDisconnect` treats as expected
        // housekeeping and does not announce at all (Appendix E's
        // auto-cycle). On the End arm the driver's run is NOT yet closed
        // (it closes at the terminal general-status frame), so a real drop
        // DOES emit here — and the `phase === "ended"` check immediately
        // below is what discards it (spec §2's "Closes that never hold":
        // "a real drop DOES emit ... and is then discarded"). Either way no
        // `disconnected` event releases a held hand-off; a release here
        // would be unreachable code claiming to be a guard. A link that
        // dies inside an open hold is precisely what its condition's own
        // backstop (`FINISH_HANDOFF_HOLD_MS`/`BURST_HANDOFF_HOLD_MS`) is
        // for, and the split condition's own test proves it.
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
    [
      endByMachine,
      handleFrame,
      resolveHandoffCondition,
      update,
      withSeries,
      applyProducerCommit,
      closeRecord,
      noHoldCloseVerdict,
    ],
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
      // RETIRE ANY IN-FLIGHT ATTEMPT FIRST, for the same reason `cancel()`
      // does (see `attemptRef`). Everything below this line reasons about a
      // driver, and an attempt still inside `createTransport()`/`scan()`/
      // `transport.connect()` HAS no driver yet — so without this bump the
      // cleanup finds `driverRef` null, does nothing, and the pending
      // promise resumes afterwards with `superseded()` false and installs a
      // driver and its subscriptions against a hook that is gone. That is
      // the Cancel defect again, reached through UNMOUNT (navigation, a
      // route change) rather than through the button, and `cancel()`'s own
      // bump does not cover it: this effect's cleanup calls `teardown`
      // directly, never `cancel`.
      //
      // Safe to put here rather than only at the unmount call site:
      // `teardown` has exactly two callers, this hook's unmount effect and
      // `cancel()`, and `connect()` never calls it — so no attempt can ever
      // supersede itself. `cancel()` bumping and then calling `teardown`
      // bumps twice, which a counter does not care about.
      attemptRef.current += 1;
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
      // (both `splitHoldRef.current` and `burstHoldRef.current` reading
      // `null` short-circuits it).
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
        // Phase JR PR 2: same free-row exclusion as `cancel()`'s own armed
        // predicate, same reasoning — an unmount at `ready` on a free row
        // must not terminate the machine's own row.
        if (
          !alreadyTerminated &&
          (phase === "programming" || phase === "ready") &&
          identityRef.current.mode !== "justrow"
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
      // sessionStorage, not localStorage, for the two keys above:
      // diagnostics for the tab's own lifetime, not a record. Read them
      // back from the console:
      //   copy(sessionStorage.getItem("ergomatic:last-monitor-log"))
      //
      // Task 1 (lost-monitor design spec): a THIRD key, `ergomatic:
      // last-session-log`, is written UNCONDITIONALLY below — never gated
      // on `runRef.current !== null` the way the rowed-only key above is.
      // The flagship case this phase exists for (armed, never pulled,
      // phone locked before the first stroke) is exactly the case where
      // `runRef.current` is `null` by definition, so the rowed-only key
      // and its console-only sibling are both unreachable on the one
      // device that matters — no console on iOS, and `MonitorLogRow`
      // (`LogSession.tsx`) used to render only when the rowed key
      // existed. `localStorage`, deliberately, not `sessionStorage`: a
      // WebContent process kill is one of the probe's own three possible
      // outcomes (design spec's §D1e) and would destroy session-scoped
      // evidence — the instrument would erase exactly the result it
      // exists to catch.
      const stash = (): void => {
        if (depsRef.current.requestDiagnosticStash === false) return;
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
          localStorage.setItem("ergomatic:last-session-log", exported);
        } catch {
          // Quota or privacy mode: diagnostics never break a teardown.
        }
      };

      // THE LATE SIDE (storage-spine design spec §2, Task 3): a
      // BURST-ELIGIBLE record whose burst has not yet been recorded gets
      // STEP 1 (with its glued hand-off release), STEP 3, and STEP 4
      // deferred to the earlier of the burst arriving or
      // `BURST_LINGER_MS`. `run.summaryTotals !== undefined` means the
      // burst already landed and was written BEFORE this teardown ever
      // ran (the early side, §2's own "3 of 5": the burst beat OUR
      // terminal transition, and by the time the hand-off hold found
      // nothing missing and let this screen unmount, `reconcile()` had
      // nothing left to wait for) — that case takes the immediate path
      // below with NO added latency, same as every close that never
      // expected a burst at all.
      //
      // **BURST-ELIGIBLE, not natural-finish (summary-record design spec
      // §1, GATE 1 of four).** This predicate read `endedBy === "finished"`
      // until the terminate capture, and that single word is the whole
      // production defect: walk-2026-08-23's
      // `ring-phone-3-menu-terminate.json` is a production phone ring of a
      // Menu terminate and it ends at `terminal terminated` with NO
      // 0x0039/0x003A/0x003F — not because the machine sends none, but
      // because this teardown hung up at t=0 while the burst was still
      // ~1s out (notes §25's lab measurement, `lab-terminate-ring.json`).
      // The honest predicate is "the link was still up when this record
      // closed" — every non-finished/rower close (`link-lost`,
      // `program-failed`, `program-dropped`, `interrupted`) declines; the
      // burst-eligible set is exactly `{"finished", "rower"}`. `"rower"`
      // covers BOTH venues (a Menu press at the erg and the app's own End
      // button — `MonitorRun.endedBy`'s own table) and stays correct if
      // walk question W8's PM5 inactivity auto-terminate lands in
      // `"rower"` later. `monitorRun.ts`'s `appendSummaryObservations`
      // admits the identical pair (spec §1's GATE 4) — one predicate, two
      // enforcement points, deliberately: this one decides whether the
      // bytes can still ARRIVE, that one decides whether they may be
      // WRITTEN.
      //
      // Everything else about the linger is unchanged — same
      // `BURST_LINGER_MS` cap, same one-shot `finish`, same second stash.
      const burstEligible =
        run !== null &&
        run.completedAt !== null &&
        (run.endedBy === "finished" || run.endedBy === "rower");
      const burstAlreadyHeard = run !== null && run.summaryTotals !== undefined;

      if (burstEligible && !burstAlreadyHeard) {
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
    // MEDIUM-9 deadlock fix), this guard alone does not cover an in-flight
    // cancel: driverRef is already null while cancel's terminate is still
    // on the wire. This comment used to end "Unreachable today only because
    // onExit() unmounts the interstitial synchronously … if cancel ever
    // stops unmounting, this guard needs a cancellingRef." `JustRowObserver`
    // is that caller, and this is that ref: `attemptRef` (its own doc
    // comment carries the full account). The guard below is now the
    // FIRST of two — it stops a second press, and the `superseded()`
    // checks after each await stop an abandoned attempt.
    if (connectingRef.current || driverRef.current !== null) return;
    connectingRef.current = true;
    const attempt = (attemptRef.current += 1);
    /** True once `cancel()` (or a later `connect()`) has moved on. A
     *  superseded attempt must not write shared state, must not clear a
     *  `connectingRef` it no longer owns, and disposes only of the
     *  transport it built itself. */
    const superseded = (): boolean => attemptRef.current !== attempt;
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
    if (superseded()) {
      // Cancelled while the transport was still resolving (the native and
      // DEV arms both `await` a dynamic import here). Nothing was built
      // beyond the transport itself, so hand it back and leave every shared
      // ref to whoever owns them now.
      if (transport !== null) bestEffort(transport.disconnect());
      return;
    }
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
      if (superseded()) {
        bestEffort(transport.disconnect());
        return;
      }
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
      // THE ONE THAT MATTERS. Everything below builds and registers: the
      // log, the driver, its ten subscriptions, the lifecycle listener.
      // A cancel that landed during the GATT connect must stop here, or
      // all of it comes up behind a screen that already says otherwise.
      if (superseded()) {
        bestEffort(transport.disconnect());
        return;
      }
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
      // Task 1 (lost-monitor design spec): a fresh connection tracks no
      // hidden window yet — clears whatever a PREVIOUS connection's own
      // background/foreground pair (or an interrupted one that never saw
      // its matching foreground) left behind.
      framesWhileHiddenRef.current = null;
      // S6: once per ordinary product connect, straight into this session's
      // own ring — see `requestStoragePersistence`'s own doc comment for the
      // full reasoning.
      if (depsRef.current.requestStoragePersistence !== false) {
        requestStoragePersistence(log);
      }
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
      // conditional lives there, never here.
      //
      // PHASE LM PR 1, FIX ROUND 2 (design spec `2026-08-26-lost-monitor-
      // trigger-design.md`, Task 1). This handler used to latch
      // `frameSilence: true` on EVERY foreground, unconditionally — and
      // then read `framesWhileHidden`, the evidence that refutes it, three
      // lines further down. It raised nine red banners in 288 s over a
      // link that never dropped
      // (`docs/monitor/sessions/walk-2026-08-26/`). It now MEASURES:
      // `decideResumeLatch` (this file, above) reads the liveness snapshot
      // we already hold and latches only when the gap since the last
      // 0x0031 genuinely reached `SILENCE_THRESHOLD_MS`, or the watchdog
      // has already declared silence. Alarm on the LEVEL (stream health),
      // never on the EDGE (a lifecycle event) — the edge is only a prompt
      // to re-measure.
      //
      // WHEN WE DO NOT LATCH, WE TOUCH NOTHING. Specifically: no
      // `markSuspect()` (it does `stopTimer(); silent = true`, so with no
      // latch and no further arrival to rearm, `onSilence` could never
      // fire and a resume followed by genuine total silence would show
      // NOTHING AT ALL), and no `hysteresisCancelRef` cancel (a retract
      // window already counting down belongs to a silence this resume
      // knows nothing about; cancelling it without re-latching would strand
      // `frameSilence` at `true` with no timer left to clear it). Leaving
      // the decorator's own pending timer alone is the fail-safe — the
      // wall clock advances through suspension, so it matures on resume.
      //
      // When we DO latch, the clearing path is the same real one it has
      // always been: `transport.markSuspect()` (guarded by
      // `hasMarkSuspect`) sets the liveness decorator's OWN internal
      // `silent` flag, so the very next healthy 0x0031 arrival takes the
      // decorator's EXISTING recovery branch and calls `deps.onRecovery()`
      // — the SAME `handleFrameRecovery`/`BANNER_RETRACT_HYSTERESIS_MS`
      // path a real watchdog silence goes through. (That routing was
      // itself an earlier review fix: calling `update({ frameSilence:
      // true })` here while leaving the decorator's `silent` at `false`
      // meant `noteStatusArrival`'s `if (silent)` branch never matched, so
      // `frameSilence` never cleared again for the rest of the session.
      // See `markSuspect`'s own doc comment in `liveness.ts`.)
      //
      // Minor 1: a fresh token for THIS attempt, checked (not read back off
      // the ref) by the `.then()` below — see `lifecycleAttemptRef`'s own
      // doc comment for the race this closes.
      const lifecycleAttempt = { cancelled: false };
      lifecycleAttemptRef.current = lifecycleAttempt;
      const lifecycleResult = registerAppLifecycleListener((event) => {
        if (event === "background") {
          // Task 1 (lost-monitor design spec): opens a hidden window for
          // `handleFrame`'s own counter to fill in — read back and
          // cleared at the matching "foreground" below.
          framesWhileHiddenRef.current = 0;
          return;
        }
        // Task 1: with "background" handled above, `AppLifecycleEvent`'s
        // only other member is "foreground" — this check is now
        // belt-and-braces against a badly-typed native bridge, not a
        // reachable branch under the type as declared (same posture as
        // this file's other known-redundant guards).
        if (event !== "foreground") return;
        // Snapshotted BEFORE anything below can move the decorator's own
        // state — `markSuspect()` at the bottom of this handler sets
        // `silent`, so reading after it would be reading our own write.
        const snapshot = livenessRef.current?.snapshot() ?? null;
        const { latch, gapMs } = decideResumeLatch(
          snapshot,
          SILENCE_THRESHOLD_MS,
        );
        if (latch) {
          hysteresisCancelRef.current?.();
          hysteresisCancelRef.current = null;
          update({ frameSilence: true });
        }
        // EXIT CRITERION 4 (design spec): every resume is recorded either
        // way, with the number the decision was made from — and the
        // wording ASSERTS NO CAUSE. The line this replaced read "resumed
        // from background — stream treated as suspect", which claimed a
        // cause nobody had checked and, on the walk that produced this
        // fix, was untrue nine times out of nine. Three producers of a
        // silence remain undistinguished; this entry reports what was
        // MEASURED and what was DECIDED, nothing about why.
        log.record(
          "app-lifecycle",
          `resume gap=${gapMs === null ? "unmeasured" : `${gapMs}ms`} ` +
            `threshold=${SILENCE_THRESHOLD_MS}ms ` +
            `silent=${snapshot === null ? "unmeasured" : snapshot.silent} ` +
            `latched=${latch}`,
        );
        // Task 1 (lost-monitor design spec): what arrived while hidden
        // and what the ready gate saw, read off state this hook already
        // tracks — the frame count, the machine's own Active declaration
        // on the last frame seen, and the ready-gate streak's own
        // banked-distance evidence (`nextRowingStreak`, only ever
        // written while `phase === "ready"`, so a resume during `"live"`
        // reports the last window that phase was in `"ready"` for, if
        // any). Records what was observed, never why the gate did or
        // didn't open — three producers of the identical symptom are
        // undistinguished here on purpose.
        const framesWhileHidden = framesWhileHiddenRef.current ?? 0;
        framesWhileHiddenRef.current = null;
        const lastFrame = stateRef.current.frame;
        const streak = rowingStreakRef.current;
        const distanceIncreased = streak !== null && streak.frames > 1;
        log.record(
          "resume-frames",
          `phase=${stateRef.current.phase} framesWhileHidden=${framesWhileHidden} ` +
            `rowingActive=${lastFrame?.rowingActive ?? "unseen"} ` +
            `distanceIncreased=${distanceIncreased}`,
        );
        // Only when we latched — see this handler's own header for why
        // calling this on a non-latching resume would disarm the watchdog
        // and leave a genuinely silent stream showing nothing at all.
        if (latch && hasMarkSuspect(transport)) transport.markSuspect();
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
      if (superseded()) {
        // A throw from a radio nobody is waiting on any more is not this
        // session's failure to report — the UI moved on at `cancel()`.
        bestEffort(transport.disconnect());
        return;
      }
      fail(mapRadioFailure(err));
      bestEffort(transport.disconnect());
    } finally {
      // Ownership, not a reset: a superseded attempt must never release a
      // claim a NEWER attempt is holding, or two connects run at once.
      if (!superseded()) connectingRef.current = false;
    }
  }, [fail, handleEvent, update]);

  /**
   * PHASE JR PR 2 — the free row's arm, and `program()`'s counterpart.
   *
   * Reaches `ready` with no wire traffic, because the row is already the
   * machine's own: the rower is in the PM5's Just Row and there is nothing
   * to send, arm or verify. Everything downstream is inherited unchanged —
   * `handleFrame`'s own `"ready"` branch opens the record on the first
   * rowing frame with distance, which IS the spec's "user intent plus
   * motion" rule (the tap on Just Row was the intent).
   *
   * SYNCHRONOUS, unlike `program()`: there is no promise to await when
   * nothing is sent. That also makes the phase flip and the identity seed
   * one indivisible step, so no frame can arrive between them.
   *
   * **The guard is not defensive tidiness.** Without it, calling this
   * during a programmed session silently rewrites `identityRef` to the Just
   * Row identity, and the rower's actual workout is then filed as a free
   * row with `workoutId: null` — a lost record, not a cosmetic slip.
   */
  const beginFreeRow = useCallback((): void => {
    const phase = stateRef.current.phase;
    if (phase === "programming" || phase === "ready" || phase === "live") {
      return;
    }
    const driver = driverRef.current;
    if (driver === null) {
      fail({
        reason: "transport-missing",
        detail: "No monitor is connected.",
      });
      return;
    }
    // A fresh arm is a fresh streak, the same reason `program()` clears it.
    rowingStreakRef.current = null;
    identityRef.current = {
      program: { intervals: [] },
      workoutId: null,
      // The record's display name, and the one the Today recovery row and
      // the log door both read. Gate 0 copy.
      title: "Just Row",
      // Explicitly the EMPTY PAIR, never omitted: `buildMonitorLogSteps`
      // reads `logSeed` first and throws `MonitorLogSeedError` on
      // `undefined` before it ever compares lengths, and that throw is
      // swallowed by the log door's condition-4 catch — which would
      // silently disqualify every free row's record.
      logSeed: EMPTY_LOG_SEED,
      mode: "justrow",
    };
    driver.beginFreeRow();
    update({ phase: "ready", error: null });
  }, [fail, update]);

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
          //
          // Hand-off store design spec §7, plan Task 3 review (⚠️
          // observation): this close deliberately runs NO verify at
          // all — `closeRecord` commits through `applyProducerCommit`
          // like every other close, but nothing here checks
          // `verifyHandoffWritable()` or sets `holdError`/`handoffHeld`
          // afterward. This is BY DESIGN, not an oversight: `fail()`
          // below moves `phase` to `"failed"`, never `"ended"` — this
          // closing path never reaches the ended hand-off surface at
          // all (`ConnectedSurface`'s own held-error frame renders only
          // on `phase === "ended"`), so there is no screen a held-error
          // state could ever appear on for it. The record's own
          // durability still goes through the SAME store commit as
          // every other close (a genuine write failure here is still
          // receipted, via the piped `store-receipt:commit-accepted`
          // with `verdict:"failed"`), just with no rower-facing recovery
          // surface built for it — matching the ROADMAP's own AUD-016
          // note ("`fail()`-path closes... stay out of scope, per the
          // spec's own §2 reachability reasoning").
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
    // the watchdog and a resume that MEASURED a real gap both latch
    // `frameSilence` with `phase` still `"live"` (a suppressed stream is not a torn-down
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
    // Storage-spine design spec §2, Task 3: THE THIRD BURST-ELIGIBLE ARM.
    // `openBurstHold()`'s own predicate declines every non-finished/rower
    // close (`link-lost`, `program-failed`, `program-dropped`,
    // `interrupted`), so a `linkGone` close (`endedBy: "link-lost"`)
    // already opens nothing — no special case needed here,
    // the predicate does it. A link-up End (`endedBy: "rower"`) owes the
    // burst exactly like a Menu terminate does: the machine still emits
    // its summary over a link that is, by definition, still up (the
    // `terminate()` below is about to be sent over it).
    const held = openBurstHold();
    // Hand-off store design spec §7, plan Task 3: a link-lost End opens no
    // hold at all (`held` is always `false` for it, `openBurstHold`'s own
    // predicate) — the verify runs synchronously, right here, in this same
    // `ended` patch, exactly like `endByMachine`'s own no-conditions-owed
    // branch and the continuity-reset close. A link-up End that DID open
    // the burst hold skips the verify here — it runs later, once, at
    // `resolveHandoffCondition`'s own release funnel.
    const { handoffHeld, holdError } = noHoldCloseVerdict(held);
    update({
      phase: "ended",
      endedBy: "user",
      handoffHeld,
      holdError,
      runOpen: false,
    });
    const driver = driverRef.current;
    // RC-29 (design spec 2026-08-27-link-authority-design.md §2): `linkGone`
    // dropped from this guard on PURPOSE — it used to skip the terminate
    // whenever `frameSilence` was latched, but a FALSE latch means the
    // rower is standing at a machine that is still running while the app
    // has already closed the record out from under them. Attended human
    // intent (the rower is pressing a button, right now) is not the same
    // claim as a verdict about the link, and only the button gets to skip
    // this. If the link genuinely IS gone, `terminate()` throws straight
    // into the catch below, which was already best-effort by design.
    if (driver === null) return;
    try {
      // With its settle (spec §2): the ack means QUEUED, not done.
      await driver.terminate();
    } catch {
      // Best-effort. The record is already closed and the session is
      // already over as far as the rower is concerned; a machine that
      // refuses the terminate does not un-end it.
    }
  }, [closeRecord, openBurstHold, update, noHoldCloseVerdict]);

  /** `MonitorSession.retryHandoffSave`'s own doc comment carries the
   *  contract. `retryDurable` (§1) NEVER bumps `revision` — modelling Retry
   *  as `commit` would stale this hook's own `lastAcceptedRevisionRef` and
   *  refuse the very next producer commit (the design's own headline-loss
   *  case: a late burst arriving right after a heal). So this never touches
   *  `runRef`/`lastAcceptedRevisionRef` at all — only the durable tier
   *  changes, and the in-memory entry `handoffStore.read` serves was
   *  already current. */
  const retryHandoffSave = useCallback(async (): Promise<void> => {
    if (stateRef.current.holdError === null) return;
    const run = runRef.current;
    if (run === null) {
      // Defensive: `verifyHandoffWritable` only enters `holdError` when
      // `runRef.current !== null` (its own null-guard returns `true`
      // otherwise), so `holdError !== null` with a null run is
      // unreachable via this hook's own public API. Release rather than
      // leave the frame stuck on a run this hook no longer has.
      update({ handoffHeld: false, holdError: null });
      return;
    }
    logRef.current?.record(
      "hold-error-retry",
      `run=${run.startedAt} retrying the durable write`,
    );
    const verdict = retryDurableHandoff(run.startedAt);
    if (verdict !== null && verdict !== "failed") {
      update({ handoffHeld: false, holdError: null });
    }
    // else: stays held. `retryDurable`'s own `retry-durable` receipt
    // (piped to `logRef`) already records the verdict either way.
  }, [update]);

  /** `MonitorSession.proceedHandoff`'s own doc comment carries the
   *  contract — no stash: the memory tier is already current by
   *  construction. */
  const proceedHandoff = useCallback(async (): Promise<void> => {
    if (stateRef.current.holdError === null) return;
    logRef.current?.record(
      "hold-error-proceed",
      `run=${runRef.current?.startedAt ?? "none"} proceeding without a confirmed durable write — the memory tier already carries the full record`,
    );
    update({ handoffHeld: false, holdError: null });
  }, [update]);

  const cancel = useCallback(async (): Promise<void> => {
    const phase = stateRef.current.phase;
    // Cancel belongs to the INTERSTITIAL. Once the session is live (or
    // over) the control is End, which closes the record; there is nothing
    // for Cancel to do that End does not do better, and silently discarding
    // a live run would be the destruction path the spec forbids.
    // `"paused"` dropped from this guard with the phase member (task 5): a
    // frozen session is still `"live"`, so this already covered it.
    if (phase === "live" || phase === "ended") return;
    // Retire any attempt still in flight, BEFORE the awaits below — the
    // same synchronous-claim discipline `driverRef` uses one line down.
    // An attempt inside `scan()`/`connect()` has no driver to tear down,
    // so this counter is the only thing that can stop it building one
    // after we have already returned the UI to idle. Releasing
    // `connectingRef` here (rather than leaving it to that attempt's own
    // `finally`, which now declines to touch it) is what lets the caller
    // press Connect again immediately.
    attemptRef.current += 1;
    connectingRef.current = false;
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
    // Phase JR PR 2: a free row is EXCLUDED from the terminate — the line
    // above says why it exists ("it terminates what we armed") and a free
    // row armed nothing, so the terminate would reach the machine's OWN
    // row. Worst case is a rower who began pulling before the motion gate
    // fired (~5 frames at the walk's measured 1 Hz): their row dies on the
    // erg because they tapped Cancel in an app that was only watching.
    const armed =
      driver !== null &&
      (phase === "programming" || phase === "ready") &&
      identityRef.current.mode !== "justrow";
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
    // Hand-off store design spec §1: a stale revision from a run that
    // never advanced past `programming`/`ready` (the only phases `cancel`
    // reaches from) must never seed the NEXT run's own create-commit CAS —
    // though in practice `runRef.current` was already `null` here (a run
    // only opens at the `ready` -> `live` transition), so this ref was
    // already `null` too; reset for symmetry with `runRef` itself.
    lastAcceptedRevisionRef.current = null;
    // Task 5 review fix round: same discard `event.kind === "mismatch"`'s
    // own handler performs above, for the identical reason — this
    // attempt (whatever phase it reached: `picking`/`pairing`/
    // `programming`/`ready`/`failed`/`disconnected`) is over, so whatever
    // the Connect guard staged for it must not survive to authorize a
    // LATER, unrelated attempt's own "armed" event. `discardStagedRetireHandoff`
    // (F-3/F-4, re-review) — a silent no-op when nothing was ever staged
    // (the common case: Cancel with nothing at risk), receipted when it
    // discards something real. Reaches here even from "ready" (post-armed,
    // the F-1 "accepted loss" case): `takeStagedRetireHandoff` already ran
    // at "armed" itself, so this is a no-op then too — the accepted loss
    // already happened, receipted with `"connect-guard-armed"`, before
    // this function ever runs.
    discardStagedRetireHandoff();
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

  // Hand-off store design spec §1, plan Task 3: wires `handoffStore`'s ONE
  // observability sink to THIS hook's own diagnostic ring — "the hook
  // wires logRef in Task 3" (`handoffStore.ts`'s own `setReceiptChannel`
  // doc comment). A stable closure reading `logRef.current` AT CALL TIME
  // (never captured), the same idiom `livenessDepsRef`'s own
  // `onSilence`/`onRecovery` already use for the identical reason: the log
  // does not exist yet at mount (only `connect()` creates one), and the
  // channel must keep working across every `connect()` this hook instance
  // ever makes, not just the first. Mount/unmount only (`[]`): the store
  // is a MODULE-LEVEL singleton (one process, `handoffStore.ts`'s own
  // header), so only one hook instance may hold the channel at a time —
  // true in production (exactly one connected session), and every test
  // that mounts a SECOND hook instance concurrently must expect the
  // second `setReceiptChannel` call to supersede the first, matching the
  // module's own single-channel contract.
  //
  // `"store-receipt:<kind>"`, DELIBERATELY NOT `"handoff-*"` — every other
  // entry this file's `logRef.record` calls have ever written for the
  // ended hand-off (`handoff-hold`/`handoff-released`) starts with
  // `"handoff"`, and `useMonitorSession.test.ts` already has several exact
  // `entries.filter((e) => e.kind.startsWith("handoff"))` assertions
  // pinning that narrower ring to precisely those two kinds — a store
  // receipt naming itself `handoff-*` would silently join their exact
  // sequence and break every one of them (found by running the full suite,
  // not by inspection).
  useEffect(() => {
    // M7: claim ownership of the slot for this mount.
    receiptChannelOwner += 1;
    const myOwnerToken = receiptChannelOwner;
    const onReceipt = (receipt: HandoffReceipt): void => {
      logRef.current?.record(
        `store-receipt:${receipt.kind}`,
        JSON.stringify(receipt),
      );
    };
    setReceiptChannel(onReceipt);
    return () => {
      // Only release the slot if nobody has claimed it since — a LATER
      // mount's own effect already bumped `receiptChannelOwner` past our
      // token, in which case it also already overwrote the channel with
      // its own, and nulling it here would clobber that successor's
      // receipts instead of our own.
      if (receiptChannelOwner === myOwnerToken) {
        setReceiptChannel(null);
      }
    };
  }, []);

  return {
    phase: state.phase,
    error: state.error,
    deviceName: state.deviceName,
    frame: state.frame,
    actuals: state.actuals,
    endedBy: state.endedBy,
    handoffHeld: state.handoffHeld,
    holdError: state.holdError,
    frozen: state.frozen,
    runOpen: state.runOpen,
    frameSilence: state.frameSilence,
    programDropped: state.programDropped,
    closeReason: state.closeReason,
    connect,
    program,
    beginFreeRow,
    endSession,
    cancel,
    retryHandoffSave,
    proceedHandoff,
    exportLog,
  };
}
