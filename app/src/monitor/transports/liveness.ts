// THE LIVENESS DECORATOR (Phase LL Task 1, link-truth design spec §1/§2):
// the production-safe half of the diagnosability pair. `adapters/
// monitorTransport.ts:49-56` used to return `createCapacitorBleTransport()`
// raw — byte capture (`recording.ts`) is structurally impossible on the
// platform that produces every real row (it lives behind a build-time
// constant, dev/e2e-only, spec's own §1 ruling), and there was nowhere to
// hang a watchdog. This file is that seam: it wraps ANY `Transport`,
// records frame-arrival times, a bounded window of lifecycle events with
// timestamps, and per-characteristic counters — NUMBERS ONLY, never a
// payload byte — and it is ALWAYS ON, composed on both the native and web
// arms in `adapters/monitorTransport.ts`.
//
// **TWO DECORATORS, DELIBERATELY NOT ONE** (spec §1's own heading). Merging
// this with `recording.ts`'s byte recorder into one `withDiagnostics` wrap
// would ship the recorder's whole module graph into production — recurring
// failure 12, settled by building and grepping `dist/` in both directions,
// never by reading the import graph (this task's own criterion 8 test does
// exactly that). This file imports NOTHING from `recording.ts`, and
// `recording.ts` imports nothing from here.
//
// THE WATCHDOG (spec §2). Status-arrival watchdog at the transport seam,
// keyed on 0x0031 (`GENERAL_STATUS_UUID`) ONLY — 0x0031/0x0032/0x0033
// arrive in lockstep on real hardware (anchor pass, vetted ground), so
// keying on the one characteristic loses nothing. Threshold
// `SILENCE_THRESHOLD_MS` (that constant's own comment carries the
// measurement).
//
// **THE ARMING RULE IS THE LOAD-BEARING DECISION, MEASURED NOT STYLISTIC**
// (anchor pass, `.claude/agents/antagonist-ledger.md`'s own "Phase LL
// anchor pass" entry): the watchdog arms at the FIRST valid 0x0031 AFTER
// CONNECT, never at `subscribe()` time and never at connect time. Every
// committed `pm5-recording/v1` capture under `docs/monitor/sessions/` is
// silent for 3775-4454 ms between the last `subscribe` call and the first
// 0x0031 notification — nothing arrives at all until the CSAFE ack settles
// the connection — so a watchdog armed any earlier declares every healthy
// session dead during setup (6 of 6 committed captures, measured;
// `liveness.test.ts`'s own corpus replay proves it both ways: green as
// written, red under the "arm at subscribe" mutation). The pre-stream
// window is the connect/program timeouts' job, not this one's.
//
// THE INJECTED CLOCK IS NOT OPTIONAL (spec §6, anchor pass H5). The replay
// harness's virtual clock is `ReplayHandle.clock`, bound as
// `DriverOptions.now`/`schedule` everywhere else in this codebase;
// `transports/fake.ts` is tick-driven and contractually wall-clock-free;
// and `replay.ts`'s own barrier timeout is a REAL `setTimeout` — so
// `vi.useFakeTimers()` over a replay hangs the barrier. A watchdog written
// against a bare `Date.now()`/`setTimeout()` would be unprovable by either
// harness. `LivenessDeps.now`/`schedule` are therefore REQUIRED
// constructor arguments, never a default — `liveness.test.ts`'s replay
// suite binds `ReplayHandle.clock.now`/`.schedule` straight through.

import type { Transport } from "../../../domain/monitor/types.js";
import { GENERAL_STATUS_UUID } from "../../../domain/monitor/pm5/uuids.js";

/** A schedule-and-cancel pair's own cancel function — the same shape
 *  `DriverOptions.schedule`/`MonitorSessionDeps.schedule` already use
 *  across this codebase; kept local rather than imported so this file has
 *  no dependency on `driver.ts` at all (this decorator sits BELOW the
 *  driver, wrapping the transport the driver is built against — see this
 *  file's header). */
export type CancelFn = () => void;

export interface LivenessDeps {
  /** The one clock this decorator reads — monotonically non-decreasing
   *  milliseconds, never absolute time. Bind to `ReplayHandle.clock.now`
   *  under replay; defaults to nothing in production — the composition
   *  seam (`adapters/monitorTransport.ts`) supplies `Date.now`. */
  now(): number;
  /** The one timer this decorator sets, a schedule-and-cancel pair
   *  (returns the canceller) — same contract `DriverOptions.schedule`
   *  already has. Bind to `ReplayHandle.clock.schedule` under replay. */
  schedule(fn: () => void, ms: number): CancelFn;
  /** Fires the instant the watchdog trips: no 0x0031 notification for
   *  `SILENCE_THRESHOLD_MS` since the last one (or since arming, for the
   *  very first window). `ms` is always `SILENCE_THRESHOLD_MS` — passed
   *  rather than hardcoded at the call site so a caller never has to
   *  import this file's own constant just to log it. NEVER fakes a
   *  disconnect event (spec §2's own rule) — this is a fact about OUR
   *  inbox, worded as ours; what a caller does with it (§2a's `stale`
   *  routing) is Task 2's job, not this decorator's. */
  onSilence(ms: number): void;
  /** Fires once, on the next 0x0031 notification to arrive after a
   *  silence was declared — never on every frame, and never if the
   *  watchdog never tripped in the first place. */
  onRecovery(): void;
}

export interface LivenessCharacteristicStats {
  /** This decorator's own clock reading at the most recent notification
   *  on this characteristic, or `null` if none has arrived yet. */
  lastArrivalMs: number | null;
  /** Total notifications delivered on this characteristic since this
   *  transport was built — a NUMBER, never the bytes themselves. */
  count: number;
}

export interface LivenessLifecycleEvent {
  atMs: number;
  kind:
    "connect" | "write" | "disconnect" | "link-drop" | "silence" | "recovery";
  /** A characteristic id, a disconnect reason, or a short fixed phrase —
   *  never a payload byte (this file's own header rule). */
  detail: string;
}

/** How many `recentEvents` `snapshot()` keeps — "last-N lifecycle events
 *  with timestamps" (spec §1's own phrase), bounded so a long-lived
 *  session's diagnostics stay a fixed, small size, the same shape
 *  `eventLog.ts`'s own 500-entry ring already established for the same
 *  reason. 20 is generous for a decorator whose lifecycle vocabulary is
 *  five kinds and fires on connect/write/disconnect/drop/silence/recovery
 *  — not the flood 0x0031 notifications themselves would be, which is why
 *  those are counted (`characteristics`), never individually logged here. */
const MAX_RECENT_EVENTS = 20;

/**
 * MEASURED (Phase LL anchor pass, `.claude/agents/antagonist-ledger.md`'s
 * "Phase LL anchor pass" entry, corpus = the 6 committed `pm5-recording/v1`
 * captures under `docs/monitor/sessions/`): the worst IN-STREAM inter-frame
 * gap on 0x0031, once the stream is actually running, is 810.3 ms across
 * 3,442 measured gaps with ZERO over 2500 ms — a 3.09x margin. This is NOT
 * "~25x the native ~100 ms cadence": that cadence is a REQUEST the record
 * already shows is not honoured (`useMonitorSession.ts:537-539` — ~508 ms
 * mean delivered on web once the sample-rate write is sent; the write
 * itself is fire-and-forget and its outcome is swallowed). Native's own
 * inter-frame gap distribution is UNMEASURED — measuring it is this
 * decorator's first job on a real phone (spec exit criterion 9a, a walk
 * deliverable), so this constant is necessary-and-not-sufficient evidence,
 * not proof, for the platform it exists to protect.
 *
 * COUPLED to the ARMING RULE (this file's header): every committed capture
 * is silent 3775-4454 ms between the last `subscribe` and the first 0x0031
 * — arming any earlier than "first valid 0x0031" would make this same
 * threshold trip on every healthy session's own setup window. Change the
 * two together or not at all.
 */
export const SILENCE_THRESHOLD_MS = 2500;

/**
 * Wraps `inner` so `scan`/`connect`/`write`/`subscribe`/`disconnect`/
 * `onDisconnect` all pass through unchanged in EFFECT — every byte, every
 * resolved/rejected promise, is exactly what `inner` would have produced
 * on its own — while this decorator additionally counts, times, and
 * watches. `scan()` is deliberately NOT wrapped with any recording: it
 * runs before a device is even chosen, nothing about it is a liveness
 * signal, and wrapping it would only be surface area with nothing to
 * report.
 *
 * Returns `inner` extended with `snapshot()` (a plain intersection, not a
 * new object shape a caller must unwrap) — `adapters/monitorTransport.ts`
 * composes this on both platform arms, and `useMonitorSession.ts` reaches
 * `snapshot()` off whatever `createTransport()` resolved to, the same way
 * it already reaches every other `Transport` method.
 */
export function withLiveness(
  inner: Transport,
  deps: LivenessDeps,
): Transport & {
  snapshot(): LivenessSnapshot;
  /** See this method's own doc comment on the returned object below. */
  markSuspect(): void;
} {
  const characteristics = new Map<string, LivenessCharacteristicStats>();
  const recentEvents: LivenessLifecycleEvent[] = [];
  let armed = false;
  let silent = false;
  let cancelTimer: CancelFn | null = null;

  function pushEvent(
    kind: LivenessLifecycleEvent["kind"],
    detail: string,
  ): void {
    recentEvents.push({ atMs: deps.now(), kind, detail });
    if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.shift();
  }

  function noteArrival(characteristicId: string): void {
    const entry = characteristics.get(characteristicId) ?? {
      lastArrivalMs: null,
      count: 0,
    };
    entry.lastArrivalMs = deps.now();
    entry.count += 1;
    characteristics.set(characteristicId, entry);
  }

  function stopTimer(): void {
    cancelTimer?.();
    cancelTimer = null;
  }

  /** (Re)arms the silence timer — called on every 0x0031 arrival, and only
   *  on a 0x0031 arrival (the arming rule, this file's header). */
  function rearmTimer(): void {
    stopTimer();
    cancelTimer = deps.schedule(() => {
      cancelTimer = null;
      silent = true;
      pushEvent(
        "silence",
        `no ${GENERAL_STATUS_UUID} arrival for ${SILENCE_THRESHOLD_MS}ms`,
      );
      deps.onSilence(SILENCE_THRESHOLD_MS);
    }, SILENCE_THRESHOLD_MS);
  }

  /** THE ARMING RULE, applied. Called on every 0x0031 notification —
   *  arming happens here, on the FIRST call, never in `subscribe()` at
   *  registration time (the mutation `liveness.test.ts`'s corpus replay
   *  pins red). */
  function noteStatusArrival(): void {
    if (!armed) {
      armed = true;
      rearmTimer();
      return;
    }
    if (silent) {
      silent = false;
      pushEvent("recovery", "frame stream resumed");
      deps.onRecovery();
    }
    rearmTimer();
  }

  return {
    // Phase LL Task 2 addendum: `...inner` FIRST, so a structural
    // extension beyond the six core `Transport` methods this file
    // otherwise names explicitly (`snapshot()` below is this file's OWN
    // such extension) passes through UNCHANGED for whichever platform arm
    // `inner` happens to be — `capacitorBle.ts`'s `onCharacteristicDegraded`
    // (§2 mechanism 3) and `transports/fake.ts`'s own test-control surface
    // are both reached ONLY through whatever `adapters/monitorTransport.ts`
    // composes `withLiveness` around, so without this spread, a structural
    // extension on `inner` would be silently dropped by this wrapper — the
    // exact "every test that injects `MonitorSessionDeps.createTransport`
    // bypasses the seam" gap the plan's own Global Constraints warn about,
    // just one layer lower, inside the seam itself. The six explicit
    // methods below still OVERRIDE the spread (object literal: later keys
    // win), so every one of them keeps exactly the decorated behaviour
    // this file exists to add — this is pure ADDITION, not a behaviour
    // change to anything already documented here.
    ...inner,
    async scan() {
      return inner.scan();
    },
    async connect(id) {
      await inner.connect(id);
      pushEvent("connect", id);
    },
    async write(characteristicId, bytes) {
      await inner.write(characteristicId, bytes);
      pushEvent("write", characteristicId);
    },
    subscribe(characteristicId, cb) {
      return inner.subscribe(characteristicId, (bytes) => {
        noteArrival(characteristicId);
        if (characteristicId === GENERAL_STATUS_UUID) {
          noteStatusArrival();
        }
        cb(bytes);
      });
    },
    async disconnect() {
      // Caller-initiated: nothing left to watch for once we hang up
      // ourselves, and a pending timer firing after would report silence
      // about a link we ourselves closed.
      stopTimer();
      await inner.disconnect();
      pushEvent("disconnect", "caller-initiated");
    },
    onDisconnect(cb) {
      return inner.onDisconnect((reason) => {
        // An unexpected drop is its OWN signal — never fake a second one
        // by letting a stale timer also declare silence over the same
        // dead link (this file's header: "NEVER fakes a disconnect
        // event").
        stopTimer();
        pushEvent("link-drop", reason);
        cb(reason);
      });
    },
    snapshot(): LivenessSnapshot {
      return {
        atMs: deps.now(),
        armed,
        silent,
        characteristics: Object.fromEntries(characteristics),
        recentEvents: recentEvents.slice(),
      };
    },
    /** Phase LL Task 2 REVIEW FIX (§2 mechanism 2). Routes an EXTERNAL
     *  suspicion — an app-lifecycle resume, "we don't know what happened
     *  while backgrounded" — THROUGH this decorator's own `armed`/`silent`
     *  state machine, rather than around it.
     *
     *  Before this method existed, `useMonitorSession.ts`'s resume handler
     *  called `update({ frameSilence: true })` directly, leaving `silent`
     *  here at whatever it already was — `false`, for a stream that was
     *  healthy right up until backgrounding. `noteStatusArrival`'s own
     *  recovery branch only runs `if (silent)`, so the very next arriving
     *  frame — however healthy — would never satisfy it, `deps.onRecovery()`
     *  would never fire, and `frameSilence` would never clear again for the
     *  rest of the session. Proven empirically before this fix: a resume
     *  shorter than `SILENCE_THRESHOLD_MS` (a Control Center swipe, a
     *  notification peek — routine, not an edge case) left the banner up
     *  through 30 healthy frames over 15s.
     *
     *  This method IS the fix: it stops any watchdog timer currently
     *  counting down (so it cannot ALSO mature later and double-report) and
     *  sets `silent = true` directly. It does NOT itself call
     *  `deps.onSilence` — the caller (`useMonitorSession.ts`) already has
     *  its own honest reason to latch `frameSilence` and its own ring entry
     *  to write; duplicating that here with a fabricated `ms` value would
     *  be exactly the dishonest-diagnostic failure mode this file's own
     *  header rules out ("NEVER fakes... a fact about OUR inbox, worded as
     *  ours"). What this method buys is narrower and sufficient: the very
     *  next 0x0031 arrival now takes `noteStatusArrival`'s EXISTING
     *  `if (silent)` branch — the one and only place `deps.onRecovery()` is
     *  ever called — so the hook's own hysteresis-gated retract fires
     *  exactly as it would for a real silence. One source of truth for
     *  "the stream is suspect" (`silent`), one path back out of it. */
    markSuspect(): void {
      stopTimer();
      silent = true;
      pushEvent("silence", "marked suspect externally (app-lifecycle resume)");
    },
  };
}

export interface LivenessSnapshot {
  /** This decorator's own clock reading at the moment `snapshot()` was
   *  called — NOT the moment of the last event. */
  atMs: number;
  /** Whether the watchdog has ever seen its first 0x0031 (the arming
   *  rule). `false` for the whole pre-stream window every healthy
   *  connect passes through — that is expected, not itself a fault. */
  armed: boolean;
  /** Whether the watchdog is CURRENTLY past `SILENCE_THRESHOLD_MS` since
   *  the last 0x0031. */
  silent: boolean;
  characteristics: Record<string, LivenessCharacteristicStats>;
  recentEvents: LivenessLifecycleEvent[];
}
