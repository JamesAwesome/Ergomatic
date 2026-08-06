// The monitor seam: the normalized types every consumer above the PM5 codec
// sees, plus the radio abstraction the driver (`src/monitor/driver.ts`) is
// built against. Nothing below this file's Transport/DiscoveredMonitor pair is
// PM5-specific — `pm5/` translates the wire into these shapes; a second
// monitor brand would enter through the same seam.
//
// MonitorCapabilities/MonitorFrame/IntervalActual/MonitorEvent/MonitorDriver
// are the design spec's §2 block, reproduced field-for-field (names, types,
// order, and the reasoning in each comment) —
// docs/superpowers/specs/2026-08-05-phase-7a-monitor-domain-design.md §2 —
// with ONE recorded exception: `IntervalActual.index`'s type. See that
// field's own comment and `docs/design/DEVIATIONS.md`'s "Domain spec
// deviations (non-UI)" table for why.
//
// domain/monitor/** imports nothing from src/.

import type { WorkoutProgram } from "./program.js";

export interface MonitorCapabilities {
  canProgram: boolean;
  hasStrokeRate: boolean;
  reportsIntervals: boolean;
  deviceName: string;
  // NOTE: heart rate is NOT here — belt presence is only knowable from
  // the data stream (frames carry hr: number | null per frame). A
  // static hasHeartRate would lie; the grid's `—` renders from the
  // frame, not from capabilities.
}

export interface MonitorFrame {
  elapsedSeconds: number;
  distanceMeters: number;
  currentSplit: number | null;
  spm: number | null;
  heartRateBpm: number | null; // null = no belt data THIS frame
  intervalIndex: number | null;
  // ^ OUR program index (0-based per work interval), never the raw machine
  //   value straight off the wire — normalized by the driver via
  //   `domain/monitor/pm5/intervalIndex.ts`'s `toProgramIndex` before this
  //   field is ever set (Phase 7A-fix Task 3, D3). `null` while armed/idle/
  //   finished/terminated (business rule, unchanged) OR while a real
  //   interval IS current but the machine's own value can't be explained by
  //   the program's length (the D3 case — logged as `"divergence"` by the
  //   driver, not represented here). A `MonitorFrame` built directly by
  //   `pm5/parse.ts`'s own `toMonitorFrame` — e.g. in that module's unit
  //   tests — still carries the RAW machine value in this field; only a
  //   `MonitorFrame` that has passed through `src/monitor/driver.ts` carries
  //   OUR index.
  intervalRemaining: { kind: "time" | "distance"; value: number } | null;
  // ^ COMPUTED by the driver (program value minus quantized progress) —
  //   rev 1.30 has no "remaining" field on any characteristic (H3).
  //   Display cadence: the sample-rate characteristic (0x0034) is
  //   written to its fastest documented rate at connect; the default
  //   500 ms is too coarse for a countdown.
  state: "idle" | "armed" | "rowing" | "resting" | "finished" | "terminated";
  // ^ maps the PM's WORKOUTSTATE honestly: "armed" = WAITTOBEGIN (the
  //   PM starts on the first stroke — there is NO start command;
  //   SET_STARTTYPE is <Not implemented> in rev 0.27). There is NO
  //   paused state on the wire — mid-workout the clock runs whether or
  //   not the rower pulls (C4/H1). "finished" = WORKOUTEND;
  //   "terminated" = TERMINATE — distinct, because 7C must tell
  //   "logged 12 of 12" from "abandoned at 8" (H2).
}

export interface IntervalActual {
  // DEVIATION from design spec §2's verbatim `index: number` — see
  // `docs/design/DEVIATIONS.md`'s "Domain spec deviations (non-UI)" table.
  // `null` has two distinct sources here, logged under two distinct kinds:
  //   - no run this driver opened is currently open
  //     (`src/monitor/driver.ts`'s own out-of-run gate, Phase 7A-fix-2
  //     Task 4) — logged as `"boundary-out-of-run"`, not `"divergence"`:
  //     the boundary belongs to no program of ours, so there is nothing to
  //     diverge FROM.
  //   - a driver-opened run IS open, but
  //     `domain/monitor/pm5/intervalIndex.ts`'s `toActualIndex` (Phase
  //     7A-fix-2 Task 5 — 0x0037/38's own Split/Interval Number
  //     normalization; NOT `toProgramIndex`, which stays 0x0033's, unchanged
  //     since Task 3/D3) returned `null` — logged as `"divergence"`, forked
  //     on cause: `state` outside `rowing`/`resting` when the boundary
  //     arrived (most reachably `"terminated"`, CSAFE-DEF footnote 12), or
  //     the machine's reported index landing more than one step outside the
  //     program's valid range — the actuals-path analogue of `toProgramIndex`'s
  //     own D3 divergence trigger. Forward attribution itself is NOT a
  //     `null` case: the offset rule absorbs one step of it by clamping.
  // **A CONSUMER MUST NOT TREAT `null` AS INTERVAL 0** — it means "this
  // actual's own interval identity is unknown," not "the first interval."
  // 7C, which prefills a rower's workout log from `MonitorRun.actuals`
  // (`src/monitor/monitorRun.ts`), is the reason this was widened before
  // any UI existed to consume it: a fabricated `0` here would silently
  // produce a plausible-looking but wrong log entry.
  index: number | null;
  elapsedSeconds: number;
  distanceMeters: number;
  avgSplit: number | null;
  avgSpm: number | null;
  avgHeartRateBpm: number | null;
}

/**
 * THE RUN CONTRACT (Phase 7A-fix-2 Task 4, spec §4), stated where every
 * consumer sees it. A "run" is one programmed workout: it is opened by
 * `MonitorDriver.program()` resolving, and by nothing else — no state word
 * on the wire ever opens one, because a PM5 walks Terminate -> Rearm ->
 * WaitToBegin unaided after a terminated workout (CSAFE-DEF Appendix E,
 * via `docs/monitor/pm5-interface-notes.md` §19.4) and would otherwise
 * fabricate runs out of its own housekeeping. It is closed by the first
 * terminal state observed while it is open.
 *
 * What that buys a consumer:
 * - `workoutComplete`/`terminated` fires AT MOST ONCE per run, and the
 *   run's record is immutable afterwards.
 * - **`intervalComplete` for a run never arrives after that run's
 *   `workoutComplete`/`terminated`.** A completed run's actuals are the
 *   whole set; nothing is ever appended later.
 * - A boundary the machine reports OUTSIDE any open run (a rower's own
 *   JustRow auto-splits, post-terminate housekeeping) is still emitted —
 *   the driver never goes deaf — but it is identifiable as such:
 *   `actual.index` is `null` AND the driver logs `boundary-out-of-run`.
 *   Such an actual belongs to no program and must never be filed against
 *   one.
 * - ONE exception to "closed by a terminal state": a run REPLACED by a new
 *   `program()` while it was still open closes with NO
 *   `workoutComplete`/`terminated` at all. A consumer must treat `armed`
 *   as ending whatever run it was tracking rather than waiting for a
 *   terminal event that may never come. (The driver logs `run-replaced`
 *   when it happens. Real hardware rarely gets there: `program()`'s own
 *   leading prepare Terminate makes the PM report "terminated" first,
 *   closing the previous run through the normal path with a real event.)
 * - `frame` events keep flowing through and after all of the above, for
 *   the life of the transport, and `program()` works again with no
 *   reconnect. A terminal state ends the RUN, never the stream (§19.4:
 *   the monitor never stops responding — the silence used to be ours).
 */
export type MonitorEvent =
  | { kind: "frame"; frame: MonitorFrame }
  | { kind: "armed" } // programming done, PM waits for stroke one
  | { kind: "intervalComplete"; actual: IntervalActual }
  | { kind: "workoutComplete" }
  | { kind: "terminated" }
  | { kind: "disconnected"; reason: string }
  | { kind: "reconnected" };

export interface MonitorDriver {
  readonly capabilities: MonitorCapabilities;
  /**
   * Programs `p` onto the monitor: multi-frame, ack-gated (§3), typed
   * `ProgramRejection` on failure. `src/monitor/driver.ts`'s implementation
   * clears, sends, then VERIFIES from the machine's own reported state
   * before resolving — the ack alone is not sufficient evidence of success
   * (hardware observed the identical ack byte for both a real program and
   * a complete no-op).
   *
   * WITHDRAWN (docs/monitor/pm5-interface-notes.md §19.2, on §19.1's
   * per-send re-derivation): this comment used to record a "CONFIRMED
   * destructive fact — a REJECTED program WIPES whatever workout was
   * already loaded", plus the rule that the PM "accepts a program only when
   * nothing is loaded". Both were our own parse bug. Every byte §18
   * recorded as a rejection decodes to an ACCEPT under the CSAFE bitfield
   * (`0x81` is toggle-high / previous-frame-OK / Ready), so the rule had
   * nothing supporting it, and the wipe was only the mechanism invented to
   * explain the toggle's alternation. No genuine rejection has ever been
   * seen from this hardware.
   *
   * What is established instead: a program sent over a loaded workout is
   * accepted and REPLACES it (§19.1's Verdict (b) — a rest-0 program sent
   * over a live rest-30 one, without reconnecting, produced a work→work row
   * with no resting state at all).
   *
   * Still OPEN, and the reason a caller should nonetheless confirm with the
   * rower first: James read an empty `:00`/`:00` session off the monitor
   * immediately after a 2-interval send that the corrected parse says was
   * accepted. Nothing explains what emptied that display (§19.1's Verdict
   * (a)). Programming over a live or loaded workout remains the prime
   * suspect, so 7B's "prove the monitor idle before programming" stands —
   * on this open finding, not on a destruction claim that did not survive.
   */
  program(p: WorkoutProgram): Promise<void>;
  terminate(): Promise<void>; // the documented terminate command — no start() exists
  events: (cb: (e: MonitorEvent) => void) => () => void;
  disconnect(): Promise<void>;
}

// --- Transport (this file's own design — the spec names the method set,
// "scan/connect/write/subscribe/disconnect/onDisconnect" (design spec §4),
// but does not give a code block for it the way §2 does; the review that
// found the C1/M2 gaps cites `Transport.write(charId, bytes)` and
// `Transport.subscribe(charId, cb)` by shorthand, not verbatim either). ---

/** A monitor found by `Transport.scan()`, before connecting. */
export interface DiscoveredMonitor {
  /** Transport-specific identifier passed back into `Transport.connect` —
   *  a Web Bluetooth device id, or a Capacitor BLE peripheral id. Never a
   *  MAC address (iOS never exposes one to web/hybrid apps) — no caller
   *  may assume this string has any particular shape. */
  id: string;
  /** Advertised device name (e.g. "PM5 12345") — display only. */
  name: string;
}

/**
 * The radio abstraction every implementation (`src/monitor/transports/
 * fake.ts`, `webBluetooth.ts`, `capacitorBle.ts`) satisfies. `pm5/commands.ts`
 * already chunks CSAFE frames to the BLE write budget (framer.ts's
 * `chunkFrames`, <=20 bytes) and `pm5/framer.ts`'s `reassemble()` already
 * un-chunks response bytes back into frames — `Transport` itself moves raw
 * bytes only and knows nothing about CSAFE, ack-gating, or the PM5 at all
 * (that knowledge lives in `src/monitor/driver.ts` and in `pm5/`).
 */
export interface Transport {
  scan(): Promise<DiscoveredMonitor[]>;
  connect(id: string): Promise<void>;
  /** One BLE write to `characteristicId`. `bytes` is already sized to the
   *  BLE write budget by the caller (framer.ts's `chunkFrames`) — this
   *  method does not further split or validate length. */
  write(characteristicId: string, bytes: Uint8Array): Promise<void>;
  /** Subscribes to notifications on `characteristicId`; returns an
   *  unsubscribe function. `cb` receives raw notification bytes exactly as
   *  delivered by the radio, one BLE notification per call — reassembling
   *  multi-chunk CSAFE responses is the caller's job (`pm5/framer.ts`'s
   *  `reassemble()`), not this interface's. */
  subscribe(
    characteristicId: string,
    cb: (bytes: Uint8Array) => void,
  ): () => void;
  /** Caller-initiated disconnect — distinct from an unexpected link drop,
   *  which arrives via `onDisconnect` instead. */
  disconnect(): Promise<void>;
  /** Registers a callback for an UNEXPECTED link drop (radio out of range,
   *  the phone's Bluetooth stack resetting, iOS backgrounding — see the
   *  design spec §4's iOS note) — never fired by a caller-initiated
   *  `disconnect()`. Returns an unsubscribe function. */
  onDisconnect(cb: (reason: string) => void): () => void;
}
