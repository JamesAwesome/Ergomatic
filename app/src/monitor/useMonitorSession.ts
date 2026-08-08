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
// NO WALL CLOCK ANYWHERE (the plan's own constraint, inherited from the
// driver): the paused hold below counts FRAMES, not seconds; `now` is a
// dependency, used only to stamp the record's ISO timestamps. There is no
// `setTimeout`/`setInterval`/`Date.now()` in this file.

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
import {
  completeMonitorRun,
  createMonitorRun,
  recordActual,
  type MonitorRun,
} from "./monitorRun";
import { resolveDefaultTransport } from "./transports/index";

/** The session state machine (design spec §2, verbatim). Every value here
 *  is reached by a REAL event or frame field — never by a timer and never
 *  by an optimistic guess — with ONE deliberate exception, `"programming"`,
 *  which flips SYNCHRONOUSLY at the top of `program()` before anything is
 *  awaited (the double-fire pin; see `program` below).
 *
 *  There is no `"choosing"`: the OS picker IS the scan UI on both platforms
 *  (spec's C2 ruling — `requestDevice` is a modal, single-result chooser
 *  the app never sees a device list from), so interstitial states 1-3 are
 *  descoped and `"picking"` is simply "their chooser is open, we are
 *  showing nothing of ours". */
export type ConnectedPhase =
  | "idle"
  | "picking"
  | "pairing"
  | "programming"
  | "ready"
  | "failed"
  | "live"
  | "paused"
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
 * - `"scan-dismissed"` — the rower closed the OS picker (or it returned
 *   nothing). Not an error in any moral sense; it renders on state 6's
 *   skeleton with a retry, per the C2 ruling.
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
    | "scan-dismissed";
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
 *  compile error is the cheaper reminder. */
export interface RunIdentity {
  workoutId: string | null;
  title: string;
}

/** A run with no library workout behind it (a hand-built or ad-hoc
 *  program). `workoutId: null` is a real, supported state — `MonitorRun`
 *  and `SessionRun` both type it that way — and a caller says so
 *  EXPLICITLY; this is not a default the hook falls back to. */
const ANONYMOUS_RUN: RunIdentity = { workoutId: null, title: "" };

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

export interface MonitorSession {
  phase: ConnectedPhase;
  error: ConnectedError | null;
  deviceName: string | null;
  frame: MonitorFrame | null;
  actuals: IntervalActual[];
  endedBy: "machine" | "user" | null;
  /** Opens the OS picker (`"picking"`), then connects (`"pairing"`) and
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
   *  dynamic `import()` (`transports/index.ts`'s `resolveDefaultTransport`,
   *  the default when this is omitted) are indistinguishable to it. See
   *  that function for what the default one can and cannot do today. */
  createTransport?: () => Transport | null | Promise<Transport | null>;
  /** The driver's event log. Injectable so Task 7's diagnostics sheet can
   *  own the log it renders (`exportLog()` — the sheet reads on open; the
   *  log has no subscribe and doesn't get one, spec §5). */
  createLog?: () => MonitorEventLog;
  /** The only clock in this file, and only for the record's ISO stamps. */
  now?: () => Date;
  /** Passed to `createPm5Driver`. `deviceName` is NOT accepted here — it
   *  comes from the picker result, never from a caller's guess (spec's I5
   *  ruling: no screen ever renders the `"PM5"` placeholder). */
  driverOptions?: Omit<DriverOptions, "deviceName">;
}

/**
 * THE PAUSED DERIVATION (design spec §2's C1 block, redefined from the
 * record — the ORIGINAL predicate was backwards and is superseded).
 *
 * All four rowing metrics — `elapsedSeconds`, `distanceMeters`,
 * `currentSplit`, `spm` — unchanged TOGETHER across `PAUSED_FRAME_HOLD`
 * consecutive frames while the machine reads `rowing`. Exit on ANY change
 * to any of them.
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
 * **The false positive this threshold exists to clear** (the regression
 * fixture, `pm5-session3-final.log:2835`+`2837-2841`): at a no-rest boundary the
 * machine emits one frame carrying the previous interval's split/spm over
 * a zeroed clock (`el 0 / d 0 / split 338.97 / spm 66`), then THREE
 * identical `el 0 / d 0 / split 0 / spm 0` frames, then resumes counting
 * (`el 0.34`). Three — so a 4-frame hold clears it by exactly one frame,
 * and a 2-frame or 3-frame hold would render PAUSED at every changeover.
 * The margin is one frame wide; it is the record's margin, not a chosen
 * one.
 *
 * Exit is on ANY CHANGE, never on "advance": elapsed ticks BACKWARDS in
 * the record, by up to −0.57 s (`pm5-session3-final.log:4632-4633`,
 * `0.75 → 0.18`, the largest of the capture's five), so a monotonic-advance test would hold PAUSED through a
 * genuinely live stream. Equality is the whole predicate.
 *
 * CAVEATS, carried in code because they are not resolved (spec §2):
 * - **Empty-arm-only evidence.** The 216-frame frozen stretch above was
 *   recorded during session 3's structurally EMPTY arm (§19.13) — a
 *   machine holding a workout with no intervals. `domain/monitor/types.ts`
 *   says plainly that mid-workout "the clock runs whether or not the rower
 *   pulls (C4/H1)", so whether these four freeze on a PROPERLY ARMED
 *   workout is genuinely unknown. This derivation ships behind that
 *   uncertainty rather than pretending it away.
 * - **§17 runsheet row pending.** The reading that answers it is Task 8's
 *   James-operated row: stop rowing mid-interval on a real program, read
 *   whether the four freeze. If they do not, PAUSED simply never renders
 *   on a healthy session and this predicate costs nothing; if they do, it
 *   is confirmed on the shape that matters.
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
 *  four rowing metrics. `frames` counts the frames themselves (a fresh
 *  value is 1, not 0), so `frames >= PAUSED_FRAME_HOLD` reads exactly as
 *  the spec's sentence does. */
export interface FreezeRun {
  key: string;
  frames: number;
}

/** The four metrics, and only those four — see `PAUSED_FRAME_HOLD` for why
 *  heart rate is excluded (it is the field that keeps MOVING when the rower
 *  stops, and the one that proves the stream is alive). A string key rather
 *  than a tuple compare because `currentSplit`/`spm` are `number | null`
 *  and `null` is a value here like any other. */
function freezeKey(frame: MonitorFrame): string {
  return `${frame.elapsedSeconds}|${frame.distanceMeters}|${frame.currentSplit}|${frame.spm}`;
}

/** Exported for the recorded-fixture tests, which replay real captured
 *  frames through this one function frame by frame. Pure. */
export function nextFreezeRun(
  previous: FreezeRun | null,
  frame: MonitorFrame,
): FreezeRun {
  // Only a ROWING machine can be paused: `resting` legitimately freezes
  // three of the four (spm 0, split 0, distance still) for its whole
  // duration, and armed/finished/terminated freeze all four indefinitely.
  // A non-rowing frame resets the count outright rather than merely not
  // incrementing it, so a rest cannot lend its frames to the next
  // interval's first stroke.
  if (frame.state !== "rowing") return { key: "", frames: 0 };
  const key = freezeKey(frame);
  return previous !== null && previous.key === key
    ? { key, frames: previous.frames + 1 }
    : { key, frames: 1 };
}

export function isPausedRun(run: FreezeRun): boolean {
  return run.frames >= PAUSED_FRAME_HOLD;
}

const NO_FREEZE: FreezeRun = { key: "", frames: 0 };

interface SessionState {
  phase: ConnectedPhase;
  error: ConnectedError | null;
  deviceName: string | null;
  frame: MonitorFrame | null;
  actuals: IntervalActual[];
  endedBy: "machine" | "user" | null;
}

const INITIAL_STATE: SessionState = {
  phase: "idle",
  error: null,
  deviceName: null,
  frame: null,
  actuals: [],
  endedBy: null,
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

/** A `scan()`/`connect()` failure, sorted into the three things it can
 *  actually be. A dismissed picker is the ORDINARY outcome (the rower
 *  changed their mind), and both adapters surface it as a
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
  /** One `connect()` at a time — a second press while the OS picker is open
   *  must not open a second one. */
  const connectingRef = useRef(false);

  const update = useCallback((patch: Partial<SessionState>): void => {
    stateRef.current = { ...stateRef.current, ...patch };
    setState(stateRef.current);
  }, []);

  const nowDate = useCallback(
    (): Date => depsRef.current.now?.() ?? new Date(),
    [],
  );

  /** Stamps `completedAt` on our own run, if one is open. The record's own
   *  `completeMonitorRun` is idempotent too; this guard is here so the
   *  CALLER's decisions ("has this already ended?") read off one place. */
  const closeRecord = useCallback(
    (terminated: boolean): void => {
      const run = runRef.current;
      if (run === null || run.completedAt !== null) return;
      runRef.current = completeMonitorRun(run, { terminated }, nowDate());
    },
    [nowDate],
  );

  const handleFrame = useCallback(
    (frame: MonitorFrame, driver: MonitorDriver): void => {
      const phase = stateRef.current.phase;
      // FIRST ROWING FRAME -> live (spec §2: every transition maps to a
      // real event or frame field). This is also where the run opens: the
      // record exists once the rower is actually rowing, never at `armed`
      // — a programmed-then-abandoned workout leaves no record behind, and
      // `createMonitorRun`'s `clearRun()` (which destroys a phone session)
      // fires only once this session is genuinely underway.
      if (phase === "ready" && frame.state === "rowing") {
        const identity = identityRef.current;
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
          },
          nowDate(),
        );
        freezeRef.current = nextFreezeRun(null, frame);
        update({ frame, phase: "live", actuals: [] });
        return;
      }
      if (phase === "live" || phase === "paused") {
        const freeze = nextFreezeRun(freezeRef.current, frame);
        freezeRef.current = freeze;
        update({ frame, phase: isPausedRun(freeze) ? "paused" : "live" });
        return;
      }
      // Every other phase still SEES the frame (the machine's current
      // reading is true whether or not we are driving it — the panes read
      // it, and `armed`/`finished` ticks keep arriving for the life of the
      // transport) but no phase moves on it.
      update({ frame });
    },
    [nowDate, update],
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
      closeRecord(terminated);
      update({ phase: "ended", endedBy: "machine" });
    },
    [closeRecord, update],
  );

  /** `driver` is the one that emitted the event — passed rather than read
   *  back out of the ref, so the frame path can reach `capabilities`
   *  without a null question nobody can answer differently. */
  const handleEvent = useCallback(
    (event: MonitorEvent, driver: MonitorDriver): void => {
      if (event.kind === "frame") {
        handleFrame(event.frame, driver);
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
        const run = runRef.current;
        if (run === null) return;
        const next = recordActual(run, event.actual);
        // `recordActual` returns the SAME object when the record is closed
        // (its own immutability guard) — nothing to persist, nothing to
        // re-render.
        if (next === run) return;
        runRef.current = next;
        update({ actuals: next.actuals });
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
      if (event.kind === "disconnected") {
        // Lose-and-degrade (spec's C5 ruling): no retry machinery, no
        // reconnect promise, and the record stays OPEN — the erg is still
        // counting, End still works, and the run is still loggable. A
        // session that already ENDED is not dragged back out of `ended` by
        // the drop that follows it.
        if (stateRef.current.phase === "ended") return;
        update({ phase: "disconnected" });
      }
      // `reconnected` is deliberately unhandled: auto-reconnect is descoped
      // to the named follow-on (spec's C5 ruling — no transport can do it
      // today, and the driver only OBSERVES resumption). If a link comes
      // back by itself, the phase stays `disconnected` and the rower's
      // recovery is End -> log, or leave and re-Connect fresh.
    },
    [endByMachine, handleFrame, update],
  );

  /** Drops the driver and the radio. Listener FIRST, so a disconnect
   *  callback fired by our own `disconnect()` can never reach a component
   *  that is on its way out.
   *
   *  **Task 5 review fix round — terminates first when the erg is armed and
   *  nobody has terminated it yet.** `cancel()` below already does this
   *  explicitly before calling `teardown()` (and passes `alreadyTerminated:
   *  true` so this function does not repeat it) — but `teardown` is ALSO
   *  the unmount cleanup (`useEffect(() => teardown, [teardown])` below),
   *  reached by every OTHER way off the interstitial: a tab-bar tap, the
   *  back gesture, an iOS process kill. Before this fix those exits left
   *  the PM5 armed holding a workout nobody was going to row — DEVIATIONS
   *  row 57's own documented harm ("the rower find[s] someone else's
   *  intervals waiting on the monitor"), reachable from everywhere except
   *  the one button that happened to call `cancel()`. Fire-and-forget
   *  either way: nothing above this can act on a failed hang-up, and a
   *  rejected promise escaping an unmount cleanup is an unhandled
   *  rejection. `terminate()` runs to completion (or failure) BEFORE
   *  `disconnect()` fires — sending a terminate over a link that is
   *  already hung up would never reach the erg at all. */
  const teardown = useCallback((alreadyTerminated = false): void => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    const driver = driverRef.current;
    driverRef.current = null;
    if (driver === null) return;
    const phase = stateRef.current.phase;
    if (!alreadyTerminated && (phase === "programming" || phase === "ready")) {
      bestEffort(
        driver.terminate().finally(() => bestEffort(driver.disconnect())),
      );
      return;
    }
    bestEffort(driver.disconnect());
  }, []);

  const fail = useCallback(
    (error: ConnectedError): void => update({ phase: "failed", error }),
    [update],
  );

  const connect = useCallback(async (): Promise<void> => {
    if (connectingRef.current || driverRef.current !== null) return;
    connectingRef.current = true;
    update({ phase: "picking", error: null });
    // Awaited unconditionally — the DEV fake-injection seam's
    // `resolveDefaultTransport` (`transports/index.ts`) returns a `Promise`
    // only when it is about to dynamic-`import()` `fake.ts`; every other
    // path (a real `createWebBluetoothTransport()`, and every test's own
    // synchronous `createTransport` override) resolves on the same tick,
    // so `await` costs nothing observable there.
    const transport = await (
      depsRef.current.createTransport ?? resolveDefaultTransport
    )();
    if (transport === null) {
      connectingRef.current = false;
      fail({
        reason: "transport-missing",
        detail: "This device has no Bluetooth transport.",
      });
      return;
    }
    try {
      // The OS picker. One result or none — the app never sees a list
      // (spec's C2 ruling).
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
      const log = (depsRef.current.createLog ?? createEventLog)();
      logRef.current = log;
      const driver = createPm5Driver(transport, log, {
        ...depsRef.current.driverOptions,
        deviceName: device.name,
      });
      driverRef.current = driver;
      unsubscribeRef.current = driver.events((event) =>
        handleEvent(event, driver),
      );
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
        if (run !== null && run.completedAt === null) {
          closeRecord(true);
          // ...and leave the erg terminated rather than holding an orphan —
          // best-effort, ignored on failure. EXCEPT on `disconnected`,
          // where the link is gone and there is nothing to send a terminate
          // over (spec: "no terminate is attempted; the record still
          // closes").
          if (error.reason !== "disconnected") {
            bestEffort(driver.terminate());
          }
        }
        fail(error);
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
    const linkGone = phase === "disconnected";
    // Close BEFORE awaiting anything: `terminate()` makes the machine
    // report `terminated`, which comes straight back as an event, and this
    // is what makes that event a no-op instead of a second ending.
    closeRecord(true);
    update({ phase: "ended", endedBy: "user" });
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
    if (phase === "live" || phase === "paused" || phase === "ended") return;
    const driver = driverRef.current;
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
    // not what "best-effort" is supposed to mean here.
    teardown(armed);
    identityRef.current = NO_IDENTITY;
    freezeRef.current = NO_FREEZE;
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
    connect,
    program,
    endSession,
    cancel,
    exportLog,
  };
}
