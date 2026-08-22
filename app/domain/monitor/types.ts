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
  // ^ 0x0031's OWN Elapsed Time / Distance, exactly as the machine reports
  //   them — and they are PER-INTERVAL, not session-cumulative. Hardware
  //   walk 4 (2026-08-08, `docs/monitor/pm5-interface-notes.md` §18) settled
  //   it on a 2x100m: `state=resting elapsed=37.81 distance=101.8` was
  //   followed immediately by `state=rowing elapsed=0 distance=0.7` — a
  //   rest->work boundary resets BOTH fields together, and each interval's
  //   count spans its own work plus its trailing rest. That does NOT
  //   generalize to every drop in `elapsedSeconds`, though it was once
  //   taken to (CR2 spec 1, `docs/superpowers/specs/
  //   2026-08-15-connected-numbers-design.md`, "The fold's failure shape"):
  //   replaying `docs/monitor/sessions/pm5-session4b-final.log.gz` found 6
  //   of 25 threshold-crossing elapsed-drops carrying real distance while
  //   `distanceMeters` stood EXACTLY STILL — every one of them a
  //   TERMINATE, which re-bases elapsed backward to a smaller non-zero
  //   value without clearing distance at all (CSAFE-DEF footnote 12).
  //   Anything that wants "how far into THIS interval" reads these;
  //   anything that wants a whole-session total reads the pair below
  //   instead.
  sessionElapsedSeconds: number;
  sessionDistanceMeters: number;
  // ^ The whole-session running totals the pair above only LOOKED like
  //   before walk 4. Held by `src/monitor/driver.ts`'s SESSION REGISTER MAP
  //   (CR2 spec 1, `session.seen` — see that variable's own doc comment for
  //   the exact rule and its honest limits): each interval's reading is
  //   kept under its own key and merged by MAXIMUM, never folded into a
  //   running offset on an elapsed-drop edge-trigger — that fold is what
  //   this map replaced, precisely because the edge it watched for
  //   (elapsed dropping) fires on a Terminate too, and the old fold banked
  //   a distance the machine never cleared. A DISPLAY ESTIMATE, never a
  //   record: an interval that produces ZERO frames is lost entirely,
  //   because nothing ever writes its key — bounded (it cannot compound)
  //   and reported whenever the machine delivers an end-of-workout summary
  //   (0x0039) — `logSummaryTotals`'s own interval-count divergence check,
  //   which fires only off that notification (review I2: its one call site
  //   is the 0x0039 handler). A run that ends without one (link death,
  //   terminate) gets no check — the loss is silent for that run. The
  //   RECORD's per-interval actuals come from 0x0037/0x0038
  //   (`IntervalActual`) and are not derived from these at all.
  //
  //   Same caveat as `intervalIndex` below: a `MonitorFrame` built directly
  //   by `pm5/parse.ts`'s `toMonitorFrame` has no history to accumulate
  //   from, so these simply equal `elapsedSeconds`/`distanceMeters` there.
  //   Only a frame that has passed through `src/monitor/driver.ts` carries
  //   real accumulation.
  currentSplit: number | null;
  spm: number | null;
  heartRateBpm: number | null; // null = no belt data THIS frame
  rowingActive: boolean;
  // ^ 0x0031's own Rowing State byte (offset 9: 0=Inactive, 1=Active) —
  //   the machine's OWN declaration of "is this person rowing", distinct
  //   from the workout state's broad rowing-mapped ordinals. The
  //   2026-08-08 hardware walks proved every proxy for it lies somewhere:
  //   the workout state reads rowing-mapped at "row to begin", the clock
  //   runs while a stopped rower sits still, and a coasting flywheel
  //   banks meters on a piece the PM5 itself does not consider started.
  //   This byte is what the PM5 knew each time.
  splitAvgPace: number | null;
  // ^ 0x0033's (Additional Status 2) own Split Average Pace — seconds/500m
  //   for the CURRENT interval's own average while rowing, and the
  //   FINISHED interval's settled average through its trailing rest (the
  //   connected-metrics design spec's ruling: judged only at rest, when it
  //   is final — "The judgement" section). Passed through unconditionally
  //   at the parse level (`pm5/parse.ts`'s `toMonitorFrame`, same
  //   unconditional-pass-through choice as `currentSplit` above). A caller
  //   with no 0x0033 sample yet would see `undefined` through
  //   `toMonitorFrame` — a path the driver's own emission gate makes
  //   unreachable (frames emit only once general/AS1/AS2 have all been
  //   seen), so the absent-value story in practice is: `src/monitor/driver.ts`
  //   additionally NULLS this field whenever its own PROVENANCE interval
  //   (which interval the last 0x0033 sample was actually captured for —
  //   `splitAvgPaceProvenanceIndex`'s own doc comment has the full
  //   mechanism) is behind the referent this frame names
  //   (interval-referent-monotone spec, 2026-08-18 Task 2; LEVEL-triggered
  //   as of fix round 1 — re-evaluated fresh every frame, not just the
  //   first after a boundary, so a dropped 0x0033 notify cannot extend a
  //   lie past one tick): 0x0033 updates on its own cadence, independent of
  //   0x0031's state byte, so a frame can otherwise still carry the
  //   JUST-FINISHED interval's own average after the referent has already
  //   moved on to the next one — a value genuinely correct for the OLD
  //   interval, wrongly paired with the NEW one's identity. Clearing it
  //   (rather than pairing it with an interval field of its own) keeps the
  //   same "one field, no lie" contract `intervalIndex` gets from the clamp
  //   below, and costs nothing perceptible: the surface already renders a
  //   zero average as nothing (design spec exit criterion 4), so a `null`
  //   frame here reads identically to the genuinely-fresh 0 that arrives
  //   once the provenance catches up.
  restSeconds: number;
  // ^ 0x0032's own Rest Time (Additional Status 1, offsets 13-15, 0.01
  //   s/lsb) — parsed since Phase 7A (`pm5/parse.ts`'s
  //   `AdditionalStatus1.restSeconds`) but never carried onto this type
  //   until the EST LEFT fix (Phase LL): it is the field that makes a
  //   countdown through a rest possible without the wall clock. Unlike
  //   `MonitorFrame.elapsedSeconds` (the per-interval clock, which FREEZES
  //   whenever `rowingActive` goes false — a rower sitting still through a
  //   rest stops it dead), Rest Time counts down in real time regardless
  //   of the flywheel (EST LEFT design spec §1/§5, measured against
  //   `docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl`:
  //   the interval clock froze at 133.08 for 26s while this field ran
  //   26.91 -> 1.85, one second per second). Unconditional pass-through at
  //   the parse level, same choice as `currentSplit`/`splitAvgPace` above
  //   — no documented invalid sentinel exists for this field, and no
  //   consumer needs one: `surfaceModel.ts`'s estimate only reads it while
  //   `state === "resting"`, and what it reads outside a rest is
  //   unspecified by the wire and simply unused.
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
  intervalAccrued: { kind: "time" | "distance"; value: number } | null;
  // ^ COMPUTED by the driver, the COMPLEMENT of `intervalRemaining` above:
  //   how far into the interval the dimension it does NOT count down has
  //   gone (ROADMAP CL item 7; `docs/design/DEVIATIONS.md`'s pane-C
  //   active-row row). `kind` is always the OTHER of the two — a
  //   time-programmed interval accrues distance here, a distance-programmed
  //   one accrues time. Same absence rule as `intervalRemaining`: `null`
  //   under the identical conditions (no program armed, or no interval
  //   current) — the two fields are always both-null or both-set together,
  //   since `src/monitor/driver.ts` computes them from the same guard.
  //   `elapsedSeconds`/`distanceMeters` on this frame ARE the inputs (CR2
  //   spec 2a Task 6): 0x0031's pair is per-interval on the wire, and the
  //   old 0x0033 Last Split checkpoint subtraction was DELETED after the
  //   checkpoint was measured to read 0 through interval index 1 and to
  //   lag one boundary after (interface-notes.md §20 items 17/24).
  state: "idle" | "armed" | "rowing" | "resting" | "finished" | "terminated";
  // ^ maps the PM's WORKOUTSTATE honestly: "armed" = WAITTOBEGIN (the
  //   PM starts on the first stroke — there is NO start command;
  //   SET_STARTTYPE is <Not implemented> in rev 0.27). There is NO
  //   paused state on the wire — mid-workout the clock runs whether or
  //   not the rower pulls (C4/H1). "finished" = WORKOUTEND;
  //   "terminated" = TERMINATE — distinct, because 7C must tell
  //   "logged 12 of 12" from "abandoned at 8" (H2).
  /** Phase LL Task 4 (design spec §4's continuity rule): 0x0031's own Total
   *  Work Distance (`pm5/parse.ts`'s `GeneralStatus.totalWorkDistanceMeters`,
   *  offset 11, whole metres, unscaled) — an absolute, session-wide reading
   *  `src/monitor/continuity.ts`'s `check` keys a resumed stream's honesty
   *  on, UNLIKE `distanceMeters` above (which is per-interval and legally
   *  resets at every boundary, walk 4). Additive-optional, same convention
   *  as `MonitorRun.endedBy?`/`series?` elsewhere in this task's own diff:
   *  every real constructor of this type (`toMonitorFrame` below,
   *  `src/monitor/driver.ts`'s own spread-through of it) always sets it;
   *  `undefined` only for the many pre-existing test fixtures across this
   *  codebase that build a bare `MonitorFrame` literal without it — kept
   *  optional specifically so this task's addition does not force every one
   *  of those literals to grow a field their own test has no opinion on. */
  totalWorkDistanceMeters?: number;
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
  // ADDITIVE (post-workout-summary design spec R-B): 0x0037's own Interval
  // Rest Distance (`pm5/parse.ts`'s `SplitIntervalData.intervalRestDistanceMeters`,
  // whole meters), the trailing rest that follows this interval's work bout
  // — DISTANCE means the machine's own number (work + rest), and this field
  // is what makes that sum reachable (walk-2026-08-16 session 2: work 1535m
  // + rest 64m = the machine's own TWD 1599m exactly, interface-notes.md's
  // own decode). `number`, never optional, the same "the type can be newer
  // than the record" choice this file already makes for `ProgramInterval`'s
  // required fields (see the `isMonitorRun`/`v` comment block above) — a
  // `MonitorRun.actuals` entry `saveMonitorRun` persisted BEFORE this field
  // existed loads back at runtime with it `undefined` despite the type
  // saying `number`. This is deliberately NOT a migration (nothing to
  // derive it from after the fact — the wire bytes are long gone); every
  // reader of a possibly-old `IntervalActual` reads it `?? 0`, never
  // trusts the type alone.
  restDistanceMeters: number;
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
 *   `workoutComplete`/`terminated` — with ONE bounded exception, the FINISH
 *   GRACE.** A completed run's actuals are otherwise the whole set.
 *   Hardware walk 5 (2026-08-10, phone BLE, PM5 432331249 —
 *   `docs/monitor/pm5-interface-notes.md` §21 item 4) caught the exception
 *   on the wire: at a natural finish the PM5 sends the final
 *   interval's 0x0037/0x0038 pair AFTER the general-status frame that says
 *   the workout ended (1 ms after, in the capture). That boundary is the
 *   run's own final interval, so the driver still emits it with a real
 *   `index` and marks it `finalBoundary: true`; the run's record accepts
 *   exactly that one late actual and nothing else
 *   (`src/monitor/monitorRun.ts`'s `recordActual`). The grace lasts only
 *   until the machine's next status sample, never covers a `terminated`
 *   close, and never re-files an interval the run already recorded — so
 *   every case in the bullet below is unaffected.
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
  // `finalBoundary` is present (and `true`) on exactly one event per run at
  // most: the FINISH GRACE boundary described in the run contract above —
  // the final interval's own data, delivered by the machine one
  // notification AFTER the run's `workoutComplete`. Absent everywhere else,
  // including every ordinary in-run boundary. A consumer that ignores it
  // behaves exactly as it did before the field existed; the run's record
  // reads it to decide whether a CLOSED record may still accept the actual
  // (`src/monitor/monitorRun.ts`). DEVIATION from design spec §2's verbatim
  // event union, alongside `IntervalActual.index`'s own — recorded in
  // `docs/design/DEVIATIONS.md`.
  | { kind: "intervalComplete"; actual: IntervalActual; finalBoundary?: true }
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
   * accepted and REPLACES it (§19.1's Verdict (b), corrected: a rest-0
   * program landed over a loaded rest-30 one and produced a rest-free
   * work→work row — but the observed row followed a RECONNECT and a SECOND
   * rest-0 send, not an unbroken single-connection chain, so the conclusion
   * rests on a weaker argument than "without reconnecting" would give. The
   * clean single-connection observation is still pending: §17's merge-gate
   * row, session 3, Step 3).
   *
   * LEADING CANDIDATE EXPLANATION, not answered (interface-notes.md §18
   * "Live bisect" session 3 AND §19.13, Phase 7A-fix-3 — §19.13 states this
   * in bold: "Verdict (a) stays OPEN; this is now its leading candidate
   * explanation, not its answer"). §18 session 3 reproduced, twice,
   * programming over a machine that is still `rowing`/`resting` arming
   * structurally EMPTY while `verifyArmed`'s `state === "armed"` check
   * passes regardless — a genuine, hardware-confirmed hazard in its own
   * right. But James's original empty `:00`/`:00` read (§19.1's Verdict
   * (a), session 1) was over a machine that was `idle`/`armed` WITH A
   * WORKOUT ALREADY LOADED, not `rowing`/`resting` — a state this
   * mechanism's own gate does not cover ("never merely loaded" is the
   * accurate boundary, not a loophole) — so §19.13's own read is the
   * correct one: this is the closest match on record, not independent
   * confirmation of the same root cause. Verdict (a) remains STANDING OPEN
   * (interface-notes.md:2583).
   *
   * `src/monitor/driver.ts`'s `program()` now runs a PREPARE-SETTLE wait
   * (`waitForPrepareSettle`, design spec §1b, fix-3 Task 2) that holds the
   * real send until the machine reports `armed` (plus one further tick)
   * whenever it caught a RUNNING piece, closing the §18-session-3 hazard in
   * CI. `verifyArmed` additionally performs the STRUCTURAL READBACK that
   * catches an empty arm even when the settle's own bound expires (fix-3
   * Task 4, built on session 4a's hardware readings — interface-notes.md
   * §17 item 12, now ANSWERED): a call that arms with anything whose
   * INTERVAL 0 differs from the program just sent rejects
   * `"structure-mismatch"` rather than resolving. That is narrower than
   * "anything other than the program just sent" — see `verifyArmed`'s own
   * "What this does NOT cover (review L-2)" note for what a MATCHING
   * interval 0 still hides (0x0031 carries only one duration pair, so a
   * stale readback from a previous program sharing interval 0, e.g. two
   * library workouts sharing a 300s warmup, can still verify falsely).
   * Still OPEN on top of Verdict (a) itself: session 4b's own
   * hardware validation of the pair has not run — 7B's "prove the monitor
   * idle before programming" still stands until it does.
   */
  program(p: WorkoutProgram): Promise<void>;
  terminate(): Promise<void>; // the documented terminate command — no start() exists
  events: (cb: (e: MonitorEvent) => void) => () => void;
  /**
   * Drains a still-pending summary-gate deadline SYNCHRONOUSLY, answering
   * with whatever evidence this run has already earned rather than
   * leaving it to a timer that may never get the chance to fire (CR2
   * spec 2a, Task 7 — "one terminal path"). A no-op when nothing is
   * pending, which is every call but a teardown that lands mid-grace.
   *
   * The caller (`useMonitorSession.ts`'s `teardown`) MUST call this
   * before it unsubscribes its own listener: a verdict this drains emits
   * `intervalComplete` synchronously, and a listener that is already gone
   * never hears it — the exact defect this method exists to close.
   * `disconnect()` applies the same rule as a second line of defence, but
   * by the time it runs the caller's listener is typically already
   * unsubscribed, so it cannot substitute for calling this first.
   */
  reconcile(): void;
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
   *  the phone's Bluetooth stack resetting, a reported Bluetooth-disabled
   *  event) — never fired by a caller-initiated `disconnect()`. Returns
   *  an unsubscribe function.
   *
   *  **CORRECTED (Phase LL Task 2, link-truth design spec §2 mechanism
   *  2):** this comment used to name "iOS backgrounding" among the
   *  causes of an unexpected `onDisconnect` — false. `Info.plist`
   *  declares no `UIBackgroundModes`, so the app's whole JS runtime
   *  simply SUSPENDS while backgrounded; nothing in this codebase
   *  observes CoreBluetooth actually tearing the link down for that
   *  reason specifically, and whether `didDisconnectPeripheral` even
   *  fires for a backgrounded app is INFERENCE, not measured (Apple
   *  documents only the connect/cancel cases — walk item W5). Backgrounding
   *  is instead detected at the ADAPTER layer (`src/adapters/
   *  appLifecycle.ts`) and handled by treating the frame stream as
   *  suspect on resume (`useMonitorSession.ts`'s own `frameSilence`) —
   *  a SEPARATE mechanism from this callback, never a producer of it. */
  onDisconnect(cb: (reason: string) => void): () => void;
}
