// The simulator (design spec §4): implements `Transport` end-to-end over
// the SAME wire format the driver decodes (CSAFE frames + the five status
// characteristics), so a CI run exercises the exact bytes a real PM5 would
// exchange.
//
// Phase 7A-fix Task 4, CORRECTED by Phase 7A-fix-2 Task 6: this file is a
// MODEL OF THE MACHINE WE MET (interface-notes.md §18/§19, PM5 432331249,
// 2026-08-05), not an idealized PM5 — and, since fix-2, not the machine our
// own misparse invented either. Everything the erg did differently from
// what CI assumed is reproduced here on purpose, so each hardware finding
// has a permanent test:
//   - it numbers rests FORWARD, the way the real one does, and emits the
//     phantom index past the end of a program (D3);
//   - it delivers a boundary's 0x0037 BEFORE its 0x0038, the order the
//     trace showed (D4 — the order that hid an entire interval);
//   - it sends `0`, not the documented `255`, for a beltless heart rate
//     (D5);
//   - it TOGGLES bit 7 of the status byte on every ack it sends, the way
//     [CSAFE-DEF] p.11 Table 9 says a CSAFE slave does and the way both
//     laptop sessions actually behaved (§19.1/§19.2) — the alternation
//     that our whole-byte compare read as "the machine changing its mind";
//   - it ECHOES the opcodes of the frame it is acking, the shape every
//     captured hardware ack has (§19.1);
//   - it ACCEPTS a program while a workout is loaded and REPLACES it —
//     D1 ("accepts only when nothing is loaded; a rejection wipes what was
//     loaded") is WITHDRAWN, our bug, not the machine's (§19.2, and Task
//     1's per-send re-derivation table in §19.1: every recorded
//     "rejection" decodes to an accept, and Verdict (b) proves behaviourally
//     that the second program replaced the first);
//   - it takes a SECOND program with no reconnect, after a terminate, the
//     way the machine does (§19.4/§19.5: terminate is the documented exit
//     back to a programmable state);
//   - `program()`'s PREPARE step gets the machine reaction the wire command
//     actually produces (§18 session 3, Phase 7A-fix-3 Task 3): a terminate
//     sent to a RUNNING machine drives it terminated → idle → armed across
//     subsequent status ticks — CSAFE-DEF Appendix E's own
//     Terminate -> Rearm -> WaitToBegin cycle — rather than acking and
//     changing nothing (`onClearingFrameComplete`);
//   - programming frames that land while the machine is STILL running arm
//     an EMPTY workout — armed, no interval structure, no boundary ever
//     (§19.13, reproduced 2-for-2 with unrelated shapes);
//   - its writes fail while the link is down, the way an invalidated GATT
//     handle does (D6);
//   - fix-3 Task 5: its 0x0031 stream now REPORTS structure — the accepted
//     program's type/interval-0 duration pair when genuinely armed, and
//     SESSION 4a's own captured empty-arm anatomy (`workoutType=1
//     durationRaw=0 durationType=128`) when armed empty (§19.13) — encoded
//     independently of `pm5/commands.ts`'s driver-side prediction
//     (`pm5/statusFrames.ts`'s `armedStructureFields`, review I-5), so a
//     fake-driven `program()` now exercises `driver.ts`'s structural
//     readback (`verifyArmed`) end to end instead of only through
//     `loadedIntervals()`'s introspection.
//

// Three ack shapes here are SYNTHETIC and say so at their definitions,
// because nothing observed produced them: `FakeScript.failNextProgramFrame`'s
// genuine reject and its checksum-garbled frame (§19.1 — not one of the
// twelve captured bytes was a rejection), and
// `FakeScript.refuseNextPrepare`'s refused prepare step (§18 session 3 item
// 15 — the captured byte for the one send this fake used to refuse by
// default decodes to an ACCEPT).
//
// Verifies each programming chunk byte-for-byte against
// `buildProgrammingSequence`'s output (asserts — a wrong byte is a test
// failure, not a tolerated write); acks via `pm5/response.ts`'s
// `buildAckFrame` fed by its `echoedCommandIds`; plays a tick-driven
// session timeline (no wall clock — `tick(ms)` is the only thing that ever
// advances time); six injection hooks (design spec §4, plan Task 4, plus
// fix-round HIGH-2's `injectTimeout`, distinct from `injectDisconnect`: the
// link stays up, only the ack never comes); a leading "clearing" phase
// (plan Task 2) modeling `program()`'s own best-effort prepare step, which
// is ACCEPTED (item 15's captured byte) and drives the machine's own
// terminate auto-cycle when it lands on a running piece.
// `sendAck`'s own doc comment covers how each ack's status byte is
// assembled since Phase 7A-fix-2's corrected bitfield parse
// (pm5/response.ts §19.1).
//
// Concept2 byte-level knowledge stays confined to what this file calls INTO
// `pm5/` (`buildProgrammingSequence`, `buildTerminate`, `buildAckFrame`,
// `echoedCommandIds`, `reassemble`, the `buildXBytes` encoders in
// `pm5/statusFrames.ts`, that same module's `armedStructureFields`/
// `EMPTY_ARM_STRUCTURE`/`PRE_ARM_BASELINE_STRUCTURE` (fix-3 Task 5),
// `intervalIndex.ts`'s `toMachineIndex`, and the `WORKOUTSTATE_*` ordinals
// / `toMonitorState` / `HEARTRATE_NO_BELT` that `pm5/parse.ts` exports for
// exactly this purpose) — this file never computes a checksum, a byte
// offset, a scale factor, a status-byte bit or a numbering offset itself.
// (`sendGarbledAck` below INVALIDATES a checksum `pm5/csafe.ts` already
// computed — the one thing a corrupted-frame hook has to be able to do —
// by pushing one extra byte in after it, never by deriving a checksum of
// its own and never by bit math.)

import {
  buildGetErrorType,
  buildProgrammingSequence,
  buildTerminate,
} from "../../../domain/monitor/pm5/commands.js";
import { reassemble } from "../../../domain/monitor/pm5/framer.js";
import { toMachineIndex } from "../../../domain/monitor/pm5/intervalIndex.js";
import {
  HEARTRATE_NO_BELT,
  toMonitorState,
  WORKOUTSTATE_REARM,
  WORKOUTSTATE_TERMINATE,
  WORKOUTSTATE_WAITTOBEGIN,
  type AdditionalSplitIntervalData,
  type AdditionalStatus1,
  type AdditionalStatus2,
  type GeneralStatus,
  type SplitIntervalData,
  type WorkoutSummary,
} from "../../../domain/monitor/pm5/parse.js";
import {
  buildAckFrame,
  echoedCommandIds,
  type CsafeFrameStatus,
  type CsafeSlaveState,
} from "../../../domain/monitor/pm5/response.js";
import {
  armedStructureFields,
  buildAdditionalSplitIntervalDataBytes,
  buildAdditionalStatus1Bytes,
  buildAdditionalStatus2Bytes,
  buildEndOfWorkoutSummaryBytes,
  buildGeneralStatusBytes,
  buildSplitIntervalDataBytes,
  EMPTY_ARM_STRUCTURE,
  PRE_ARM_BASELINE_STRUCTURE,
  type WireArmedStructure,
} from "../../../domain/monitor/pm5/statusFrames.js";
import {
  ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
  ADDITIONAL_STATUS_1_UUID,
  ADDITIONAL_STATUS_2_UUID,
  END_OF_WORKOUT_SUMMARY_UUID,
  GENERAL_STATUS_UUID,
  RECEIVE_CHARACTERISTIC_UUID,
  SAMPLE_RATE_UUID,
  SPLIT_INTERVAL_DATA_UUID,
  TRANSMIT_CHARACTERISTIC_UUID,
} from "../../../domain/monitor/pm5/uuids.js";
import type {
  DiscoveredMonitor,
  IntervalActual,
  MonitorFrame,
  Transport,
} from "../../../domain/monitor/types.js";
import type { WorkoutProgram } from "../../../domain/monitor/program.js";

/** One "tick" in the script's timeline: a full rowing/resting status
 *  update, delivered once `virtualClock` reaches `atMs`. `workoutState` is
 *  a raw `OBJ_WORKOUTSTATE_T` ordinal — use the `WORKOUTSTATE_*` constants
 *  `pm5/parse.ts` exports rather than a bare number.
 *
 *  `programIntervalIndex` is OUR 0-based-per-work-interval index — the
 *  interval of `script.program` this sample belongs to. It is deliberately
 *  NOT what goes on the wire: D3 (interface-notes.md §18 #3) showed a real
 *  PM5 attributes a REST FORWARD, to the interval it is counting down TO,
 *  so the byte written into 0x0033's "Interval Count"
 *  (`AdditionalStatus2.intervalCount`) is `pm5/intervalIndex.ts`'s
 *  `toMachineIndex(programIntervalIndex, state)` — one HIGHER than this
 *  field during a rest, this field exactly during work. The driver's
 *  `toProgramIndex` has to undo that to get back to the number authored
 *  here, which is what makes every fake-driven driver test an end-to-end
 *  exercise of the normalization rather than a pre-normalized fiction
 *  shared by both sides (this interface's predecessor named the field
 *  `intervalIndex` and put it on the wire verbatim — the shape the
 *  hardware was proven not to produce).
 *
 *  `heartRateBpm: null` means NO BELT PAIRED, and the fake sends the byte
 *  the real machine sent for that: `0` (`HEARTRATE_NO_BELT`, D5), not the
 *  documented `255`. */
export interface FakeStatusEvent {
  atMs: number;
  kind: "status";
  workoutState: number;
  elapsedSeconds: number;
  distanceMeters: number;
  spm: number;
  currentSplit: number;
  heartRateBpm: number | null;
  programIntervalIndex: number;
  /** 0x0031 byte 9, the machine's own Inactive/Active declaration
   *  (2026-08-08 walk 3: the coasting-flywheel finding). Defaults to
   *  ACTIVE whenever `workoutState` maps to "rowing" — the machine a
   *  mid-piece timeline models has a rower pulling — and INACTIVE
   *  otherwise. A timeline modelling the coast (meters accruing on a
   *  piece the PM5 does not consider started) sets 0 explicitly. */
  rowingState?: number;
}

/** One interval-boundary event: the completed interval's actuals, matching
 *  `IntervalActual`'s own shape (design spec §2) — delivered on 0x0037/
 *  0x0038 (`toIntervalActual`'s source pair, `pm5/parse.ts`).
 *
 *  `cumulativeElapsedSeconds`/`cumulativeDistanceMeters` are a SEPARATE
 *  pair from `actual.elapsedSeconds`/`distanceMeters`: 0x0037/0x0038 each
 *  carry BOTH a per-interval field (`splitIntervalTimeSeconds`/
 *  `splitIntervalDistanceMeters` — what `actual` is built from,
 *  `pm5/parse.ts`'s own `toIntervalActual`) AND a top-level, SESSION-
 *  cumulative `elapsedSeconds`/`distanceMeters` field on the very same
 *  characteristic (interface-notes.md §10). The driver no longer roots any
 *  checkpoint in either pair (CR2 spec 2a Task 6 deleted the subtraction);
 *  this fake still models BOTH fields honestly — `wireLastSplit` carries the
 *  measured lag-one-boundary semantics — because a fake that conflates the
 *  two is exactly how the deleted mechanism survived a year (an earlier
 *  version sent the per-interval value for BOTH). */
export interface FakeBoundaryEvent {
  atMs: number;
  kind: "boundary";
  // `IntervalActual.index`'s type is `number | null` (Task 3 review,
  // `docs/design/DEVIATIONS.md`) to carry the DRIVER's post-normalization
  // "unexplainable" case. Narrowed back to `number` here — and, since Task
  // 4, carrying OUR program index rather than a wire value, exactly like
  // `FakeStatusEvent.programIntervalIndex`: the number 0x0037/38's
  // "Split/Interval Number" actually receives is
  // `toMachineIndex(actual.index, <the machine's state right now>)`, so a
  // boundary that lands while the PM has already rolled into its rest gets
  // the forward-attributed value the hardware sent (interface-notes.md §18
  // #3's own trace: the final boundary of a TWO-interval workout carried a
  // Split/Interval Number of `2`). Authoring OUR index here also means a
  // script typo can't silently author `null` and have it misread as "this
  // is what the machine sent."
  //
  // `avgSplit` is OMITTED from what a script authors (PM final-PR gate,
  // condition round, 2026-08-17): a real PM5 computes 0x0037's own Average
  // Pace FROM the same interval's own elapsed/distance
  // (avgPace = 500 * splitIntervalTimeSeconds / splitIntervalDistanceMeters
  // -- spec section 7 vetted ground); it never carries an independent
  // reading a script could set to something else. A prior version let a
  // script author an unrelated `avgSplit` number here, which produced
  // boundaries no real PM5 could send -- caught when `log-monitor.png`'s
  // row (1:52.0, the scripted value) contradicted its own hero (1:15.0,
  // correctly derived by `summaryModel.ts` from the SAME elapsed/distance
  // this boundary carries). `boundaryBundle` now derives the wire byte
  // itself; see its own comment for the identity and the zero-distance
  // guard.
  actual: Omit<IntervalActual, "index" | "avgSplit"> & { index: number };
  cumulativeElapsedSeconds: number;
  cumulativeDistanceMeters: number;
}

export type FakeTimelineEvent = FakeStatusEvent | FakeBoundaryEvent;

export interface FakeScript {
  /** The program the driver is expected to send via `program()` — the fake
   *  precomputes `buildProgrammingSequence(program)` at construction and
   *  asserts every incoming write against it chunk-by-chunk. A test that
   *  calls `driver.program(p)` with a DIFFERENT `p` than the one given here
   *  fails loudly (byte mismatch), by design. */
  program: WorkoutProgram;
  /** Advertised device name — `scan()`'s single result. */
  deviceName?: string;
  /**
   * The machine already has a workout loaded when this session starts.
   * Give it the loaded workout's interval count; `loadedIntervals()`
   * reports what the fake is holding at any moment.
   *
   * **D1 IS WITHDRAWN** (interface-notes.md §19.2, on Task 1's per-send
   * re-derivation table in §19.1). This field used to make the fake reject
   * a program while something was loaded and DESTROY what it held. Neither
   * half survived the corrected parse: every byte §18 recorded as a
   * rejection decodes to an accept (`0x81` is toggle-high / prev-OK /
   * Ready), so "accepts only when nothing is loaded" had nothing left
   * supporting it, and the wipe was only ever the mechanism invented to
   * explain the toggle's alternation. §19.1's Verdict (b) then showed the
   * opposite BEHAVIOURALLY, corrected in the whole-branch fix wave: [S2]
   * sent a 2×TIME/rest-30 program, then a reconnect, then a 2×TIME/rest-0
   * program over whatever the reconnect left loaded — the resulting row ran
   * work→work with no `resting` state anywhere. The second program
   * REPLACED whichever program was still loaded; the clean single-
   * connection observation (no reconnect between the two sends) is still
   * pending §17's merge-gate row, session 3, Step 3.
   *
   * So what this models now, each half cited:
   * - a program sent while a workout is loaded is ACCEPTED, and the loaded
   *   workout is REPLACED by the one just programmed (§19.1 Verdict (b));
   * - the prepare step (`buildTerminate()`) is ACCEPTED, whatever is or is
   *   not loaded — §19.1's `S2 D2` rows for the loaded case, and §18
   *   session 3's **item 15** for the empty one: the standalone terminate
   *   this fake used to refuse by default acked `f1 81 76 01 13 e5 f2`,
   *   which decodes to toggle-high / previous-frame-OK / slave READY, an
   *   ACCEPT. That was the LAST behaviour in this fake resting on the
   *   withdrawn whole-byte parse, and item 15 settled it against the model:
   *   the idle-terminate refusal never existed. It survives only as the
   *   explicitly-synthetic `refuseNextPrepare` hook below;
   * - terminate does NOT unload the workout — its documented destination is
   *   *Rearm*, Concept2's own word for making the SAME workout ready again
   *   (§19.5), so the count below survives a terminate. It does return the
   *   machine to a programmable state, which is what makes a second
   *   `program()` with no reconnect work (§19.4).
   *
   * Still genuinely OPEN, and deliberately NOT modelled: James read an
   * empty `:00`/`:00` session off the monitor right after [S1]'s
   * 2-interval send, which the corrected parse says was an ACCEPT. Nothing
   * in hand explains what emptied that display (§19.1 Verdict (a) lays out
   * what was and was not checked). A fake that guessed at it would teach CI
   * a fiction, which is the exact failure this phase exists to undo.
   */
  loadedWorkout?: { intervalCount: number };
  /**
   * Forces the SLAVE-STATE nibble of every ack this fake sends
   * (`pm5/response.ts`'s bits 0-3), instead of the state the fake would
   * derive from what the machine is currently doing. The case this exists
   * for is `"offline"`: [CSAFE-DEF] Figure 7 p.49 gives `Offline` exactly
   * one entry arrow — "user starts workout before equipment is configured"
   * — and [S2] Dump 1 caught it live, a `0x09` ack from a connected,
   * responsive erg being rowed OUTSIDE master control
   * (interface-notes.md §19.3). That is a different situation from this
   * fake's own default `"in-use"`, which is the erg rowing a workout the
   * master programmed; nothing derivable from the timeline distinguishes
   * them, so it is scripted rather than guessed.
   */
  slaveState?: CsafeSlaveState;
  /**
   * The next PROGRAMMING frame's ack is a genuine reject (`0x11`-class) or
   * a checksum-garbled frame instead of the accept it would otherwise get.
   * One-shot: consumed by the first programming frame that completes, so a
   * retry of that same frame acks normally.
   *
   * **NEVER OBSERVED ON HARDWARE — synthetic.** Not one of the twelve
   * status bytes [S2] captured is a rejection, and no session ever produced
   * an unparseable frame (interface-notes.md §19.1). These exist because
   * the driver has code for both paths — a genuine reject fires the
   * documented `GetErrorType` follow-up (§19.7) and rejects with reason
   * `"nak"`; a frame that cannot be validated at all rejects with
   * `"garbled"`, deliberately NOT folded into `"nak"` — and code with no
   * way to be exercised is code with no test.
   *
   * Scoped to the PROGRAMMING sequence's own frames — which is why the
   * field is named for the frame and not for "the next write". Same scope
   * `injectNak` has always had (`injectNak`'s own doc comment). The prepare
   * step has its own one-shot sibling, `refuseNextPrepare` below, rather
   * than sharing this one: the two answer different frames, and only the
   * prepare's is aimed at `program()`'s swallow rule.
   */
  failNextProgramFrame?: "reject" | "garbled";
  /**
   * One-shot: the NEXT prepare (clearing-phase) frame is answered with a
   * genuine `0x11`-class reject instead of the accept it would otherwise
   * get. Consumed by the first prepare frame that completes, so a
   * subsequent `program()` over the same fake prepares normally.
   *
   * **NEVER OBSERVED ON HARDWARE — synthetic** (interface-notes.md §18
   * session 3, item 15). This fake used to refuse EVERY prepare sent to a
   * machine with nothing loaded, sourced from §19.1's `S1 CLEAN RUN 2` row
   * — classed `NARR-NB`, "no byte at all", the withdrawn whole-byte
   * parse's label and nothing else. Item 15 finally captured that byte
   * (`f1 81 76 01 13 e5 f2`, a standalone terminate from an armed-idle
   * screen): an ACCEPT. The default refusal is gone.
   *
   * The hook stays because the refusal is the ONLY way to exercise
   * `driver.ts`'s prepare SWALLOW rule (`sendPrepare`: any non-disconnect
   * outcome is logged `prepare-rejected` and programming proceeds anyway),
   * and that rule stays — a rule with no way to be exercised is a rule
   * with no test. A refused prepare changes nothing on the machine: no
   * terminate transition, no auto-cycle (`onClearingFrameComplete`), which
   * is the whole point of a refusal.
   */
  refuseNextPrepare?: boolean;
  /**
   * Fix-3 Task 5: the WAITTOBEGIN bundle for the NEXT accept (whichever
   * arms next — a real program or an empty arm) reports the PRIOR
   * structure — whatever this machine's 0x0031 last told the wire, starting
   * from `PRE_ARM_BASELINE_STRUCTURE` if nothing has armed yet — for that
   * one bundle only; every status tick after it reports the true, current
   * structure. One-shot per accept (`onProgrammingFrameComplete` re-arms it
   * on the NEXT accept only if this stays `true`).
   *
   * Models SESSION 4a's own RECORDED observations, not the plan's
   * unsourceable "2 of 5 clean arms lagged" figure (review I-1; that figure
   * has no home in this repo — see `driver.ts`'s `STRUCTURE_MISMATCH_TICKS`
   * for the full provenance split): a several-tick unsettled window before
   * the steady state (`"armed" observed on tick 4`, measured twice at the
   * session-3 repro) and mid-cycle transients carrying stale, non-zero
   * durations between an accept and its steady state. A single stale tick
   * right after an accept is exactly that shape.
   *
   * Off by default — every OTHER fake-driven test in this repo needs the
   * accepted structure to be correct from the very first armed tick, and
   * this knob exists so a test can OPT IN to exercising `driver.ts`'s
   * N-consecutive-stable-mismatch rule (`STRUCTURE_MISMATCH_TICKS`) against
   * this fake's own wire bytes, not only against `stubTransport`'s
   * hand-built payloads (`driver.test.ts`'s existing lag test is the
   * stub-driven sibling this generalizes end-to-end).
   */
  lagStructureOneTick?: boolean;
  /** The post-"armed" session timeline, ascending by `atMs`. `tick(ms)`
   *  advances a purely virtual clock (no timers, no wall clock anywhere in
   *  this file) and delivers every event whose `atMs` has now been
   *  reached. */
  events?: FakeTimelineEvent[];
}

export interface FakeControls {
  /** Advances the fake's internal virtual clock by `ms` and delivers every
   *  scripted event now due — ALSO reports the WAITTOBEGIN bundle first,
   *  for as long as the machine is holding an armed program (fix-round 1,
   *  F1; fix wave F-CRIT made that a LEVEL rather than a one-shot, because
   *  a real PM5 reports `armed` on every one of its ~2 Hz status ticks
   *  while armed — a one-shot could be, and routinely was, consumed by an
   *  unrelated pump before `driver.ts`'s `verifyArmed()` registered. The
   *  level drops the moment the SCRIPT delivers a status of its own, or a
   *  new programming sequence begins). That armed delivery used to happen
   *  SYNCHRONOUSLY
   *  inside the programming write itself; a reviewer found that this made
   *  every fake-driven test take driver.ts's IMMEDIATE-check fast path in
   *  `verifyArmed()`, so the tick-driven WAIT it exists to exercise (the
   *  actual protection against a stale/pre-send "armed" observation) was
   *  only ever reached by hand-rolled `stubTransport` tests. Requiring a
   *  real `tick()` call here — even `tick(0)`, which advances no scripted
   *  time — makes every fake-driven `program()` call genuinely exercise
   *  that wait too. While disconnected (`injectDisconnect()`, before
   *  `completeReconnect()`), the clock still advances and due events are
   *  still consumed from the script (the PM keeps rowing regardless of the
   *  phone's radio — design spec §4's iOS note) but are NOT delivered as
   *  notifications; only their values are cached for `completeReconnect()`
   *  to flush, which is what makes the reconnect path re-derive position
   *  instead of assuming continuity.
   *
   *  ALSO advances the machine's own terminate AUTO-CYCLE by one step, when
   *  a prepare step left one pending (`queueTerminateAutoCycle`, Task 3):
   *  the PM's reaction to a terminate is not instantaneous — it is three
   *  status ticks (terminated → idle → armed), reported on the same 0x0031
   *  pulse as everything else this machine says. */
  tick(ms: number): void;
  /** The programming ack-gated FRAME at `atFrame` (0-based index into
   *  `buildProgrammingSequence`'s outer array — the same index a driver's
   *  ack-gated loop advances one-per-frame, not one-per-20-byte-chunk) gets
   *  a reject status instead of success. Named `atFrame` (not `atChunk`,
   *  fix-round L2): "chunk" in this codebase means one <=20-byte BLE
   *  write, and a NAK is a response to a whole ack-gated FRAME (which may
   *  span several chunks), never a partial one.
   *
   *  This is the POSITIONAL selector for the same one SYNTHETIC reject path
   *  `FakeScript.failNextProgramFrame` reaches: `takeNextAckFailure` is the
   *  single consumer of both hooks, so Task 6 added no second way to ASK
   *  for a reject. (`FakeScript.refuseNextPrepare` is a THIRD way to see a
   *  reject on the wire, but never for one of these frames: it answers the
   *  prepare step, which `takeNextAckFailure` has never been able to reach.
   *  Task 3 — it too is marked never-observed.) Unlike
   *  `failNextProgramFrame` this one is STICKY:
   *  the frame cursor does not advance past a rejected frame, and a retry
   *  restarts the sequence from frame 0, so the same frame index meets the
   *  same answer on every attempt. Where both are set,
   *  `failNextProgramFrame` — the more specific, one-shot instruction — is
   *  consumed first. */
  injectNak(atFrame: number): void;
  /** Simulates an unexpected link drop: fires the driver's `onDisconnect`
   *  callback and stops delivering scheduled notifications until
   *  `completeReconnect()`. If a program/terminate write is awaiting its
   *  ack at the moment this is called, that ack now never arrives — the
   *  same "link is down, no response is coming" signal a real disconnect
   *  mid-write would produce.
   *
   *  D6 (interface-notes.md §18's "also fixed live" list): from here until
   *  `completeReconnect()`, every `write()` REJECTS rather than quietly
   *  succeeding. On the real laptop this was Chrome's
   *  `InvalidStateError: Characteristic ... is no longer valid. Remember to
   *  retrieve the characteristic again after reconnecting.` — the handles a
   *  transport cached before the drop are dead objects afterward. The fake
   *  had no such behaviour, which is precisely why `webBluetooth.ts`'s
   *  cached-characteristic bug passed every CI run while breaking every
   *  post-reconnect write on hardware. `completeReconnect()` is this fake's
   *  stand-in for a transport that re-fetched: writes work again after it,
   *  never before. */
  injectDisconnect(): void;
  /** Simulates a mid-sequence ack timeout DISTINCT from a disconnect
   *  (fix-round HIGH-2, spec §4's own separately-listed injection hook):
   *  the link stays fully up — notifications keep flowing normally, and
   *  `onDisconnect` never fires — but every ack this fake would otherwise
   *  send from now on is silently withheld. Combined with the driver's
   *  optional `ackTimeout` policy and enough `tick()` calls to deliver the
   *  configured number of General Status ticks, the pending write
   *  eventually rejects with `reason: "timeout"`, never `"disconnected"`. */
  injectTimeout(): void;
  /** Delivers one deliberately too-short General Status (0x0031)
   *  notification RIGHT NOW, regardless of the script/clock — exercises
   *  `pm5/parse.ts`'s length-guard `Pm5ParseError` path end-to-end. */
  injectGarbledFrame(): void;
  /** Delivers one END-OF-WORKOUT SUMMARY (0x0039) RIGHT NOW, regardless of
   *  the script/clock — the 20 real bytes a PM5 sends after a natural
   *  finish, built through `buildEndOfWorkoutSummaryBytes` so the driver's
   *  own `parseEndOfWorkoutSummary` does the decoding (fast-follow Task 2,
   *  design spec §5). `elapsedSeconds`/`meters` are required; every average
   *  field defaults to a real non-zero reading and may be overridden — see
   *  the implementation's own comment for why the defaults are NOT the
   *  convenient zeros. */
  deliverSummary(
    totals: { elapsedSeconds: number; meters: number } & Partial<
      Omit<WorkoutSummary, "elapsedSeconds" | "meters">
    >,
  ): void;
  /** Clears the disconnected flag and immediately flushes the fake's
   *  current (possibly time-jumped) state as a fresh status/boundary
   *  notification — "the machine's next status frame" the driver's
   *  reconnect path re-derives position from. */
  completeReconnect(): void;
  /**
   * Fix-round 1, F1: forces the WAITTOBEGIN bundle out RIGHT NOW instead
   * of waiting for the next `tick()` — the escape hatch for a test that
   * genuinely needs the OLD synchronous timing (matching a real PM's own
   * near-instant response) rather than exercising `program()`'s
   * tick-driven wait. A no-op if the machine is not currently holding an
   * armed program. Fix wave F-CRIT: this READS the armed level, it does
   * not consume it — calling it twice reports twice, and a later `tick()`
   * still reports too, exactly as the wire would. Most tests should
   * prefer a real `tick()` call — see `tick()`'s own doc comment for why
   * this fake no longer delivers armed synchronously inside the write.
   */
  deliverArmedNow(): void;
  /** What the machine is currently holding: the `loadedWorkout` the script
   *  started with, then whatever the most recent COMPLETED program left
   *  there (`FakeScript.loadedWorkout`'s own doc comment — a program
   *  REPLACES what was loaded; D1's wipe is withdrawn, §19.2). `null` for a
   *  fake that never had one and has not been programmed yet; never `null`
   *  again once a program has landed, since nothing this codec can send
   *  unloads a workout (§19.5 — terminate routes to Rearm, not to an empty
   *  slot).
   *
   *  **`0` is the EMPTY ARM** (Task 3, §19.13) — a program that landed on a
   *  still-running machine armed with no interval structure at all: the
   *  machine holds a workout (never `null` again) and that workout has zero
   *  intervals. Since fix-3 Task 5 this is no longer introspection-only: the
   *  0x0031 stream now puts SESSION 4a's own captured empty-arm anatomy on
   *  the WIRE too (`EMPTY_ARM_STRUCTURE`, `pm5/statusFrames.ts`), so
   *  `driver.ts`'s structural readback (`verifyArmed`, fix-3 Task 4) can
   *  reject a fake-driven empty arm end to end — this method remains for
   *  tests that want to assert the fake's own internal bookkeeping directly,
   *  without going through the driver at all. */
  loadedIntervals(): number | null;
  /**
   * Task 8 — the timing-realism knob task-5's re-review parked (MEDIUM-9,
   * LOW-8): every `connect()`/`write()` call from now on settles after a
   * real `ms`-millisecond `setTimeout`, instead of same-microtask, the way
   * every other test in this repo (and every OTHER method on this fake)
   * still does. `0` (the default before this is ever called) restores
   * instant settlement.
   *
   * **NOT the session timeline's clock** — this file's own header still
   * holds ("no timers, no wall clock anywhere in this file" — `tick()`'s
   * own doc comment): `delayWrites` never advances `virtualClock`, never
   * delivers a scripted event, and the SYNCHRONOUS side effect of a call
   * (the bytes get validated, an ack gets queued to `notify()`) still
   * happens the instant the call is made — only the PROMISE this fake
   * hands back to its caller is deferred. A real radio's `write()`/
   * `connect()` resolving is a statement about the LOCAL Bluetooth stack
   * ("the OS confirms this went out"), never about when the remote side's
   * notification arrives; delaying only the promise, not the notify, keeps
   * that same honest separation rather than inventing a fake round-trip
   * that then has to be un-invented for every other test that doesn't ask
   * for one.
   *
   * Exists for two named regressions that only reproduce under REAL
   * latency, both parked here rather than fixed with a one-off hand-rolled
   * delayed stub transport (task-7 review's own recurring finding: a
   * bespoke fixture proves the fixture, not the class of bug):
   * - the double-physical-terminate race between `cancel()`'s own
   *   `driver.terminate()` and an interleaved unmount `teardown()` — see
   *   `useMonitorSession.test.ts`'s own pin;
   * - `ConnectedInterstitial.tsx`'s deviceName-gated (not phase-gated)
   *   dispatch of `program()` — see that file's own regression test.
   */
  delayWrites(ms: number): void;
  /**
   * The number of characteristics this fake currently has at least one
   * live `subscribe()` callback on, summed across every characteristic —
   * i.e. `Array.from(notifyCbs.values()).reduce((n, set) => n + set.size, 0)`.
   * Task 8: a house-wide gap this phase's own reviews kept re-finding by
   * hand (task-4's review counted wire fires "under M1" to prove a
   * double-subscribe never happened) — this makes that count a first-class
   * assertion instead of an instrumented one-off. `0` for a fake nothing
   * has ever subscribed to, and again `0` once every `unsubscribe()`
   * this fake handed out has been called — never negative, and never
   * double-counts the SAME callback subscribed to the SAME characteristic
   * twice (`Set`, not an array).
   */
  subscriptionCount(): number;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

/** CR2 spec 1, Task 8 — Step 3. `totalWorkDistanceMeters` (0x0031 byte 11,
 *  `parse.ts`) is NOT the live distance mirrored back: `state-architecture-
 *  review.md`'s own decode of all 16 distinct `structure` entries in
 *  `pm5-session4b-final.log.gz` (the design doc's TWD table) gives two
 *  DIFFERENT rules keyed on the armed interval's goal type, verbatim:
 *
 *    Goal type   durationType   Samples                    TWD reads
 *    Time        0              20.9/23.9/25.8 m rowed     20/23/25 — rowed, truncated
 *    Distance    128            13.4 and 31.5 m rowed,     500/500/500/500 — the GOAL
 *                                goal 500
 *
 *  and one of the distance-goal samples is a LIVE mid-row reading
 *  (workoutState 5/`rowing`, elapsed 76.54s, distance 31.5m, TWD still
 *  500) — not an arming artefact, so the suppression is not "TWD reads 0
 *  until something rowed", it reads the goal from the very first status
 *  tick after arming and never tracks metres at all on a distance piece.
 *  `distanceGoalMeters` is that goal, `null` for a time-goal interval (the
 *  caller derives it from `interval.value`, `ProgramInterval.kind ===
 *  "distance"`'s own field, `domain/monitor/program.ts` — the same armed
 *  interval `statusBundle` already looks up for `isDistance`, so this
 *  function stays pure and does not re-index `program.intervals` itself).
 *  `Math.trunc`, not `Math.round`, for the time-goal case: the table's own
 *  three samples are the FLOOR of the metres rowed (20.9 -> 20, not 21),
 *  never the nearest whole metre.
 *
 *  Genuinely open (design doc's own "Still open" section): whether a
 *  MULTI-interval distance-goal program reports the per-interval goal or
 *  the programmed total — only single-interval 500 m pieces are in the
 *  record. This reads the CURRENTLY ARMED interval's own goal, the
 *  narrower and better-evidenced of the two readings and the one every
 *  captured sample is consistent with. */
function totalWorkDistanceFor(
  distanceGoalMeters: number | null,
  distanceMeters: number,
): number {
  return distanceGoalMeters !== null
    ? distanceGoalMeters
    : Math.trunc(distanceMeters);
}

/** Builds the merged General/AdditionalStatus1/AdditionalStatus2 triple for
 *  one `FakeStatusEvent` — the "full bundle" this fake always sends
 *  together for a status tick, in this fixed order, so the driver (which
 *  gates its `frame` event on having seen all three at least once) is
 *  always warmed up by the time a real session begins.
 *
 *  `lastSplit` is 0x0033's "Last Split Time"/"Last Split Distance" pair
 *  (interface-notes.md §10, §20 items 17/24) — the caller (`wireLastSplit`)
 *  passes the MEASURED semantics, not the naive "current interval's own
 *  start" reading an earlier fiction assumed: ZERO through interval
 *  indices 0 and 1, then LAGGING one boundary behind from interval 2 on
 *  (the cumulative point at which the PREVIOUS interval began). Task 6's
 *  inversion (225+161 frames, zero mismatches) settled interface-notes.md
 *  §20 item 24's open question this way. Nothing downstream subtracts this
 *  pair any more — `driver.ts`'s `computeRemainingForFrame`/
 *  `computeAccruedForFrame` read the per-interval 0x0031 pair directly —
 *  so this field is now sent purely to keep the wire model honest for
 *  whatever else reads 0x0033, not because a consumer still re-derives
 *  progress from it. */
function statusBundle(
  program: WorkoutProgram,
  e: FakeStatusEvent,
  lastSplit: { elapsedSeconds: number; distanceMeters: number },
  structure: WireArmedStructure,
): { general: GeneralStatus; as1: AdditionalStatus1; as2: AdditionalStatus2 } {
  const interval = program.intervals[e.programIntervalIndex];
  const isDistance = interval?.kind === "distance";
  return {
    as2: {
      elapsedSeconds: e.elapsedSeconds,
      // D3: the MACHINE's number, not the script's — forward-attributed
      // during a rest (`FakeStatusEvent.programIntervalIndex`'s own doc
      // comment). This is the byte the driver's `toProgramIndex` has to
      // undo.
      intervalCount: toMachineIndex(
        e.programIntervalIndex,
        toMonitorState(e.workoutState),
      ),
      averagePowerWatts: 0,
      totalCalories: 0,
      splitAvgPace: 0,
      splitAvgPowerWatts: 0,
      splitAvgCalories: 0,
      lastSplitTimeSeconds: lastSplit.elapsedSeconds,
      lastSplitDistanceMeters: lastSplit.distanceMeters,
    },
    as1: {
      elapsedSeconds: e.elapsedSeconds,
      speedMetersPerSecond: 0,
      spm: e.spm,
      // D5: a beltless tick puts `0` on the wire, the byte the real machine
      // sent — NOT the documented 255 (`HEARTRATE_NO_BELT`, cited in
      // `pm5/parse.ts`; interface-notes.md §18's new-defect note).
      // `writeHeartRate`'s own `null` path would encode 255, which is the
      // sentinel CI already believed in and the machine never sent.
      heartRateBpm: e.heartRateBpm ?? HEARTRATE_NO_BELT,
      currentSplit: e.currentSplit,
      averageSplit: e.currentSplit,
      restDistanceMeters: 0,
      restSeconds: 0,
      ergMachineType: 1,
    },
    general: {
      elapsedSeconds: e.elapsedSeconds,
      distanceMeters: e.distanceMeters,
      intervalType: isDistance ? 1 : 0,
      workoutState: e.workoutState,
      rowingState:
        e.rowingState ?? (toMonitorState(e.workoutState) === "rowing" ? 1 : 0),
      strokeState: 0,
      totalWorkDistanceMeters: totalWorkDistanceFor(
        isDistance ? interval!.value : null,
        e.distanceMeters,
      ),
      // 0x0031's STRUCTURE fields — `workoutType` plus the interval-0
      // duration pair (fix-3 Task 5). The CALLER decides which structure
      // this particular tick reports (`structureForTick()`, below) — this
      // function just writes whatever it is given; that separation is what
      // lets the caller model the empty arm and the one-tick lag knob
      // without this shared bundle-builder needing to know about either.
      ...structure,
      dragFactor: 130,
    },
  };
}

/** 0x0037's own Average Pace field (`splitIntervalAvgPace`, seconds per
 *  500 m), derived from the SAME boundary's own `elapsedSeconds`/
 *  `distanceMeters` pair rather than an independently-scripted number (PM
 *  final-PR gate, condition round, 2026-08-17). A real PM5 has no other
 *  source for this field — it is the interval's own average, computed by
 *  the machine from the same two numbers 0x0037/0x0038 report alongside it
 *  — so a fake that let a script set a different value could describe a
 *  boundary no hardware would ever send, and did: `log-monitor.png`'s row
 *  read `1:52.0` (a scripted `avgSplit: 112`) while its own hero read
 *  `1:15.0`, correctly computed by `summaryModel.ts` from the identical
 *  15 s / 100 m pair. `500 * t / d`, `0` when `distanceMeters` is `0`
 *  (nothing rowed, nothing to average — the same "no reading" case the
 *  wire's own zero represents, `MONITOR_SPLIT_MAX`'s own doc comment,
 *  `logDraft.ts`). Not pre-rounded: `buildAdditionalSplitIntervalDataBytes`
 *  already rounds to the wire's 0.1 s resolution
 *  (`Math.round(s.splitIntervalAvgPace * 10)`, `pm5/statusFrames.ts`). */
function derivedAvgSplit(
  elapsedSeconds: number,
  distanceMeters: number,
): number {
  return distanceMeters > 0 ? (500 * elapsedSeconds) / distanceMeters : 0;
}

/** `machineState` is the state the PM is in AT THE MOMENT OF DELIVERY (the
 *  last status tick it sent), which is what decides the forward attribution
 *  of the Split/Interval Number this boundary carries — see
 *  `FakeBoundaryEvent.actual`'s own comment. The observed trace has the
 *  boundary notifications arriving while the state word already reads
 *  `resting` (interface-notes.md §18 #3: "20 resting → 21 notify 0x0037"),
 *  so a script that wants the hardware's own numbering puts a resting tick
 *  before its boundary event, exactly as the machine does.
 *
 *  ENFORCED, not merely documented (Task 4 review, IMPORTANT-4): a script
 *  that completes an interval WITH a trailing rest while the state word
 *  still says anything other than `resting` describes a machine we have
 *  never met — the real one had already rolled into that rest and was
 *  reporting the forward-attributed number by the time either
 *  characteristic went out. Left as a comment, the rule was already broken
 *  once by this file's own test suite, and the cost of a silently
 *  identity-numbered boundary is a fixture that "proves" the D3
 *  normalization against a wire value the hardware would not have sent. */
function boundaryBundle(
  e: FakeBoundaryEvent,
  machineState: MonitorFrame["state"],
  program: WorkoutProgram,
): {
  split: SplitIntervalData;
  asSplit: AdditionalSplitIntervalData;
} {
  const { actual } = e;
  const completed = program.intervals[actual.index];
  if (completed && completed.restSeconds > 0 && machineState !== "resting") {
    throw new Error(
      `fake transport: boundary for interval ${actual.index} delivered while the machine reads "${machineState}", but that interval has a ${completed.restSeconds}s trailing rest — a real PM5 is already RESTING (and numbering forward) when it sends 0x0037/0x0038 for it (interface-notes.md §18 #3). Put a resting status tick before this boundary event.`,
    );
  }
  const wireIndex = toMachineIndex(actual.index, machineState);
  return {
    asSplit: {
      elapsedSeconds: e.cumulativeElapsedSeconds,
      splitIntervalAvgStrokeRate: actual.avgSpm ?? 0,
      // D5, same as the status bundle's own heart-rate byte: `0` for no
      // belt. This is the exact field the machine sent `0` on.
      splitIntervalWorkHeartRateBpm:
        actual.avgHeartRateBpm ?? HEARTRATE_NO_BELT,
      splitIntervalRestHeartRateBpm: HEARTRATE_NO_BELT,
      splitIntervalAvgPace: derivedAvgSplit(
        actual.elapsedSeconds,
        actual.distanceMeters,
      ),
      splitIntervalTotalCalories: 0,
      splitIntervalAvgCalories: 0,
      splitIntervalSpeedMetersPerSecond: 0,
      splitIntervalPowerWatts: 0,
      splitAvgDragFactor: 130,
      splitIntervalNumber: wireIndex,
      ergMachineType: 1,
    },
    split: {
      elapsedSeconds: e.cumulativeElapsedSeconds,
      distanceMeters: e.cumulativeDistanceMeters,
      splitIntervalTimeSeconds: actual.elapsedSeconds,
      splitIntervalDistanceMeters: actual.distanceMeters,
      intervalRestTimeSeconds: 0,
      // R-B: the fake models this honestly off the script's own
      // `actual.restDistanceMeters` — a constant here (0 or otherwise)
      // would make every consuming test agree with itself regardless of
      // whether the driver actually carries the field through
      // (`domain/monitor/pm5/parse.ts`'s `toIntervalActual`).
      intervalRestDistanceMeters: actual.restDistanceMeters,
      splitIntervalType: 0,
      splitIntervalNumber: wireIndex,
    },
  };
}

/** The WAITTOBEGIN bundle the fake sends the instant programming finishes,
 *  and re-sends every tick for as long as the armed level holds
 *  (`deliverArmedBundle`, design spec §2: "armed" = WAITTOBEGIN) — zeroed
 *  progress, no interval active yet, and no split has ever completed
 *  (`lastSplit` is always `{0, 0}` here — nothing to root it at before the
 *  session's own first interval even starts).
 *
 *  `ghost` is spm/currentSplit ONLY — connected-axes design spec §2, Item 3
 *  ("Armed carry-over is real on the wire"): the PM does not reset those
 *  two to zero on re-arm, elapsed/distance are what genuinely zero
 *  (`armedGhost`'s own comment has the full citation). Defaults to zero for
 *  the caller's convenience on a machine that has never rowed anything —
 *  the same "nothing to carry over" case `armedGhost`'s own initial value
 *  models — never a second source of truth for the carry-over rule, which
 *  lives in `armedGhost` alone.
 *
 *  `structure` is the caller's decision (`structureForTick()`), same as
 *  `statusBundle`'s own parameter — this is the bundle SESSION 4a's
 *  `lagStructureOneTick` scenario most often targets, since it is the very
 *  first status delivered after an accept. */
function armedBundle(
  program: WorkoutProgram,
  structure: WireArmedStructure,
  ghost: { spm: number; currentSplit: number } = { spm: 0, currentSplit: 0 },
): {
  general: GeneralStatus;
  as1: AdditionalStatus1;
  as2: AdditionalStatus2;
} {
  return statusBundle(
    program,
    {
      atMs: 0,
      kind: "status",
      workoutState: WORKOUTSTATE_WAITTOBEGIN,
      elapsedSeconds: 0,
      distanceMeters: 0,
      spm: ghost.spm,
      currentSplit: ghost.currentSplit,
      heartRateBpm: null,
      programIntervalIndex: 0,
    },
    { elapsedSeconds: 0, distanceMeters: 0 },
    structure,
  );
}

export function createFakeTransport(
  script: FakeScript,
): Transport & FakeControls {
  const programSequence = buildProgrammingSequence(script.program);
  // Flattened purely for the byte-for-byte chunk assertion below (each
  // individual `write()` call checked against the next expected chunk,
  // regardless of which frame it belongs to) — frame BOUNDARIES (when to
  // ack) are detected separately, by `incoming` (`reassemble()`) actually
  // finding a stop flag, not by counting chunks against a precomputed
  // length table.
  const flatProgramChunks = programSequence.flat();
  const terminateChunks = buildTerminate()[0]!;
  // Phase 7A-fix-2 Task 3: `src/monitor/driver.ts`'s `sendGetErrorType`
  // fires this ONE-OFF write after a genuine reject during the real
  // programming send — orthogonal to the clearing/programming/armed phase
  // state machine below (it can arrive mid-"programming", right after a
  // reject, and must never be mistaken for the next expected programming
  // chunk). Always exactly one 6-byte BLE chunk (`buildGetErrorType`'s own
  // doc comment), so a plain byte comparison is enough — no reassembler
  // needed.
  const getErrorTypeFrame = buildGetErrorType();

  const timeline = [...(script.events ?? [])].sort((a, b) => a.atMs - b.atMs);
  let eventCursor = 0;
  let virtualClock = 0;

  // Plan Task 2: `program()` sends `buildTerminate()` as a best-effort
  // PREPARE step before the real programming sequence — so the very first
  // write(s) this fake ever sees are the SAME bytes as `terminateChunks`
  // (below), not `flatProgramChunks`. `"clearing"` models exactly that
  // window. Its ack is an ACCEPT, whatever the machine is holding — [S2]'s
  // own raw dumps for the loaded case (§19.1's `S2 D2`/`S2 D3` rows) and
  // §18 session 3's item 15 for the empty one, which is the byte that
  // retired this phase's old nothing-loaded refusal (Task 3;
  // `onClearingFrameComplete`). What the ACCEPT does to the machine depends
  // on what the machine was doing: a terminate landing on a running piece
  // starts the Appendix-E auto-cycle (`queueTerminateAutoCycle`).
  // `injectNak` deliberately does NOT reach into this phase — `nakAtFrame`
  // addresses the PROGRAMMING sequence's own frames only (its own doc
  // comment), and neither does `FakeScript.failNextProgramFrame`, for the reason
  // its own doc comment gives. `injectTimeout` DOES still apply here — its
  // own "every ack this fake would otherwise send" wording is phase-agnostic
  // by design.
  //
  // The cycle is a LOOP, not a one-way street (Task 6): a completed
  // terminate while `"armed"` puts the machine back in `"clearing"` with
  // every programming cursor rewound, because that is what the real one
  // does — terminate is the documented exit back to `WaitToBegin`
  // (interface-notes.md §19.4/§19.5), and a driver that has just finished a
  // piece programs the next one over the same connection with no reconnect.
  // This file used to stop at `"armed"` forever, which made a second
  // `program()` throw "unexpected write while armed" and forced every
  // second-workout test in `driver.test.ts` onto a hand-rolled stub.
  let phase: "clearing" | "programming" | "armed" = "clearing";
  let clearChunkCursor = 0;
  let programChunkCursor = 0;
  let programFrameCursor = 0;
  let terminateChunkCursor = 0;
  let nakAtFrame: number | null = null;
  // `FakeScript.failNextProgramFrame`'s live, consumable copy — one-shot, cleared
  // by `takeNextAckFailure` the first time a programming frame completes.
  let failNextProgrammingAck: "reject" | "garbled" | null =
    script.failNextProgramFrame ?? null;
  // `FakeScript.refuseNextPrepare`'s live, consumable copy — one-shot,
  // cleared by the first prepare frame that completes (SYNTHETIC; item 15's
  // captured byte says the real machine accepts).
  let refusePrepare = script.refuseNextPrepare ?? false;
  // The machine's own Terminate -> Rearm -> WaitToBegin auto-cycle
  // (CSAFE-DEF Appendix E), queued by an ACCEPTED prepare that landed on a
  // RUNNING machine and drained one status per `tick()` —
  // `queueTerminateAutoCycle` has the citations. Empty whenever the machine
  // has nothing left to react to.
  let autoCycle: FakeStatusEvent[] = [];
  // §19.13: a programming frame arrived while the machine was STILL
  // `rowing`/`resting`, so whatever arms out of this sequence arms EMPTY.
  // Sticky across the sequence — the hardware repro's own terminated
  // transition landed MID-send, so its later frames arrived at a machine
  // that was no longer running and it armed empty anyway — and rewound by
  // `beginProgrammingSequence()`, wherever a NEW sequence starts, never
  // only at the prepare (review LOW-3/I-7: that left a bare sequence behind
  // an explicit `terminate()` inheriting the previous one's poison).
  let sawRunningDuringProgramming = false;
  // Set by an EMPTY arm and cleared by a real one: while true this machine
  // holds no interval structure, so no boundary can ever be reported for
  // the program it is holding (§19.13 — rowed to 108.4 m past a 100 m
  // interval with no boundary of any kind).
  let armedEmpty = false;
  // Bit 7 of the next ack's status byte ([CSAFE-DEF] p.11 Table 9: "Toggles
  // between 0 and 1 on alternate frames"; interface-notes.md §19.1/§19.2).
  // Starts LOW and flips after every ack this fake emits — including the
  // GetErrorType reply and the synthetic failures, since the toggle belongs
  // to the frame counter, never to the outcome. Starting low reproduces
  // [S2] Dump 3's own captured pair exactly: the prepare step's ack
  // `f1 01 76 01 13 65 f2`, then the SetProgram ack
  // `f1 81 76 0e … eb f2`.
  let ackToggle = false;
  // `injectTimeout()` (fix-round HIGH-2): once set, every ack this fake
  // would otherwise send is withheld — link stays up, `linkDown` stays
  // false, notifications keep flowing, only acks stop. Sticky (not a
  // one-shot), matching "the ack never comes" literally: nothing in this
  // fake's own state machine would ever clear it back to sending acks.
  let timeoutInjected = false;
  // Fix-round 1, F1: set the instant the programming sequence's LAST frame
  // acks (`onProgrammingFrameComplete`), delivered by the NEXT `tick()` call
  // (or `deliverArmedNow()`) rather than synchronously — see `tick()`'s own
  // doc comment for why.
  //
  // Phase 7B fix wave, F-CRIT: this is a **LEVEL, not an edge**. It stays
  // true for as long as the machine is actually holding an armed program,
  // so EVERY tick in that window re-reports the WAITTOBEGIN bundle — which
  // is what a real PM5 does: it notifies 0x0031 at the configured sample
  // rate (`buildSampleRateConfig()`) and reports `armed` on every one of
  // those ~2 Hz ticks while armed, not once. Modelling it as a one-shot
  // made the fake's armed status STEALABLE: any tick that landed between
  // the last frame's synchronous ack and `driver.ts`'s `verifyArmed()`
  // registering its listener consumed the one-and-only notification, and
  // `program()` then ran its whole verify budget out against a silent
  // machine. `transports/index.ts`'s `autoTicking` pump (100 ms) lands in
  // exactly that gap whenever a write is delayed longer than a tick, which
  // made `e2e/connected.spec.ts` (`delayWrites(120)`) fail deterministically
  // rather than occasionally. The driver's verify pulse is already
  // level-triggered (`driver.ts` reads the CURRENT decoded state per tick),
  // so the defect was the fake's model of the wire, not the driver's
  // reading of it — see `clearArmedLevel()` for the two places the level
  // drops.
  let armedLevel = false;
  // Connected-axes design spec §2, Item 3 ("Armed carry-over is real on the
  // wire"): eight armed frames in the lab captures read 13/16/43/46/50/80/
  // 88/96 spm with matching nonzero splits — the PM does NOT reset stroke
  // rate/split to zero the instant it re-arms; it keeps reporting the
  // PREVIOUS piece's numbers until the first pull of the next one resets
  // them. `zeroedStatus` below used to invent the zero itself
  // (`{spm:0, currentSplit:0}` unconditionally), which is why no test could
  // exercise this half of item 3 (2a plan Task 3, R1: "teaching the fake is
  // part of this spec's cost") — the app's own mirror substitution
  // (`surfaceModel.ts`) has nothing real to mirror if the fake never
  // produces the ghost it is mirroring. Refreshed by
  // `queueTerminateAutoCycle()` alone, from whatever `latestStatus` was
  // reporting the instant BEFORE the terminate landed — the only caller,
  // guarded by `onClearingFrameComplete`'s own `machineState === "rowing" ||
  // "resting"` check, so `latestStatus` there is always a genuine reading,
  // never a synthetic one. Stays at the cold-start default until the first
  // such cycle runs, which is the honest state for a machine that has never
  // rowed anything to carry over (`zeroedStatus`'s own pre-existing
  // "nothing to re-base from a machine that had not yet rowed" reasoning,
  // now shared with `synthesizeTerminated`'s elapsed re-base).
  let armedGhost: { spm: number; currentSplit: number } = {
    spm: 0,
    currentSplit: 0,
  };
  // Fix-round 1, F1's ORDERING half, kept separate from the level above:
  // the FIRST armed report after an accept goes out ahead of anything the
  // script has due on that same tick, so a timeline's own opening entry is
  // never delivered "ahead of" the session arming. Every report after that
  // one is a plain repeat and YIELDS to a due scripted event instead, so a
  // REPEAT never doubles up a tick that already carries a reading — a real
  // PM issues exactly one status per pulse, and a script event IS the
  // machine's reading for the pulse it lands on. The first post-accept
  // tick is the one deliberate exception: the ordering rule puts the armed
  // report AND the script's due reading on that tick, armed first (the
  // F1-ordering pin holds exactly that pair).
  let armedFirstReportPending = false;
  // Fix-3 Task 5: `FakeScript.lagStructureOneTick`'s live, consumable copy —
  // armed by `onProgrammingFrameComplete` on the accept that lands next,
  // consumed by `structureForTick()` the very next time ANY status is
  // delivered (which `deliverArmedIfHeld` guarantees is the WAITTOBEGIN
  // bundle this same accept produces, since nothing else can call
  // `deliverStatus`/`deliverArmedBundle` in between — and since the armed
  // level now repeats, the tick AFTER that one already carries the true
  // structure, which is what the lag is a lag against).
  let structureLagPending = false;
  // What this machine's 0x0031 structure fields most recently told the wire
  // — `structureForTick()`'s only reader, and the value `lagStructureOneTick`
  // substitutes in for one tick. Starts at SESSION 4a's own pre-arm baseline
  // (`PRE_ARM_BASELINE_STRUCTURE`) since nothing has armed yet; a fake's
  // FIRST-ever lagged accept therefore lags on the baseline, and a SECOND
  // accept (no reconnect) lags on whatever the first one actually armed.
  let lastArmedStructure: WireArmedStructure = PRE_ARM_BASELINE_STRUCTURE;

  /** The TRUE structure this machine is holding right now, independent of
   *  any lag — `EMPTY_ARM_STRUCTURE` while armed empty (§19.13), otherwise
   *  `script.program`'s own interval-0 encoding (`armedStructureFields`,
   *  `pm5/statusFrames.ts` — independent of `pm5/commands.ts`'s
   *  driver-side prediction; see that function's own doc comment for why).
   *  `script.program` is also what a script that never calls `program()` at
   *  all reports throughout (the pre-loaded fallback) — there is only ever
   *  ONE program value this fake can hold, since `write()` validates every
   *  incoming byte against it (`FakeScript.program`'s own doc comment), so
   *  "the accepted program" and "the pre-loaded one" are never actually
   *  different values here. */
  function currentArmedStructure(): WireArmedStructure {
    return armedEmpty
      ? EMPTY_ARM_STRUCTURE
      : armedStructureFields(script.program.intervals);
  }

  /** The structure fields THIS status tick puts on the wire. The true
   *  reading, unless a lag is pending (`structureLagPending`) — in which
   *  case this call reports the PRIOR structure once and clears the flag,
   *  exactly like a real settling machine's stale first tick (SESSION 4a's
   *  recorded mid-cycle transients). Every call — lagged or not — updates
   *  `lastArmedStructure` to what was ACTUALLY put on the wire this time,
   *  so a later lag (a second accept) lags on the right prior value. */
  function structureForTick(): WireArmedStructure {
    if (structureLagPending) {
      structureLagPending = false;
      return lastArmedStructure;
    }
    lastArmedStructure = currentArmedStructure();
    return lastArmedStructure;
  }

  // What the machine is holding right now (`FakeScript.loadedWorkout`'s own
  // doc comment). REPLACED by each program that lands, never cleared: D1's
  // destructive wipe is withdrawn (interface-notes.md §19.2), and terminate
  // routes to Rearm rather than to an empty slot (§19.5).
  let loadedIntervalCount: number | null =
    script.loadedWorkout?.intervalCount ?? null;

  let linkDown = false;
  let disconnectCb: ((reason: string) => void) | null = null;
  const notifyCbs = new Map<string, Set<(bytes: Uint8Array) => void>>();
  // `FakeControls.delayWrites`'s live value — `0` (instant, same-microtask
  // settlement) until a test opts in. Read by `settleWrite` below, the one
  // place `connect()`/`write()` decide how long their own returned promise
  // takes to resolve; see that method's own doc comment for why the
  // synchronous processing inside `write()` is never itself delayed.
  let writeDelayMs = 0;

  /** Resolves after `writeDelayMs` real milliseconds — `0` (the default)
   *  resolves on the microtask queue, byte-identical to every call site's
   *  behaviour before this knob existed, so no existing test's timing
   *  changes unless it opts in. */
  function settleWrite<T>(value: T): Promise<T> {
    if (writeDelayMs === 0) return Promise.resolve(value);
    return new Promise((resolve) =>
      setTimeout(() => resolve(value), writeDelayMs),
    );
  }

  // Cached "current known state" — used by `completeReconnect()` to flush
  // whatever the script has advanced to (possibly skipped ahead while
  // disconnected) as a single fresh notification, per this file's own
  // `tick`/`completeReconnect` doc comments.
  let latestStatus: FakeStatusEvent | null = null;
  let latestBoundary: FakeBoundaryEvent | null = null;
  // The MOST RECENT boundary's own cumulative totals — internal bookkeeping
  // only, never sent on the wire directly (see `wireLastSplit` below for
  // what actually reaches 0x0033). Updated in `deliverOrCache` the moment a
  // boundary is PROCESSED, regardless of `linkDown` — the real PM keeps
  // this up to date whether or not the phone is currently connected to hear
  // about it (design spec §4's iOS note), which is exactly what makes the
  // reconnect path's very first post-reconnect status tick already carry
  // the correct value.
  let lastBoundaryCumulative = { elapsedSeconds: 0, distanceMeters: 0 };
  // What 0x0033's Last Split Time/Distance actually reports (Task 6, the
  // inversion result: 225+161 frames replayed with zero mismatches,
  // interface-notes.md §20 items 17/24) — ZERO through interval indices 0
  // and 1, then LAGGING one boundary behind `lastBoundaryCumulative` from
  // interval 2 onward: the wire holds the cumulative point at which the
  // PREVIOUS interval began, not the current one. Shifted in
  // `deliverOrCache` the instant BEFORE `lastBoundaryCumulative` itself
  // advances, so it is always exactly one boundary stale. This is the
  // field `statusBundle()` actually sends; `computeRemainingForFrame`/
  // `computeAccruedForFrame` (`driver.ts`) no longer read it at all — the
  // per-interval 0x0031 pair alone is progress, checkpoint or not.
  let wireLastSplit = { elapsedSeconds: 0, distanceMeters: 0 };
  // The machine's CURRENT state word, in `MonitorFrame` terms — updated
  // from every status event this fake processes (delivered or merely
  // cached; the PM keeps rowing whether or not the phone is listening).
  // Read by `deliverBoundary` to decide the forward attribution of the
  // Split/Interval Number it puts on the wire (D3) — see `boundaryBundle`'s
  // own doc comment. Starts at `"idle"`: nothing has been programmed yet,
  // and no boundary can precede the first status tick on a real machine.
  let machineState: MonitorFrame["state"] = "idle";

  const incoming = reassemble();

  function notify(uuid: string, bytes: Uint8Array): void {
    for (const cb of notifyCbs.get(uuid) ?? []) cb(bytes);
  }

  /** The single place `latestStatus` (and with it the machine's own current
   *  state word) is assigned — every path that decides "this is what the
   *  machine now reads" goes through here, so `machineState` can never
   *  drift from the status the fake last committed to. */
  function setLatestStatus(e: FakeStatusEvent): void {
    latestStatus = e;
    machineState = toMonitorState(e.workoutState);
  }

  function deliverStatus(e: FakeStatusEvent): void {
    const { general, as1, as2 } = statusBundle(
      script.program,
      e,
      wireLastSplit,
      structureForTick(),
    );
    notify(ADDITIONAL_STATUS_2_UUID, buildAdditionalStatus2Bytes(as2));
    notify(ADDITIONAL_STATUS_1_UUID, buildAdditionalStatus1Bytes(as1));
    notify(GENERAL_STATUS_UUID, buildGeneralStatusBytes(general));
  }

  /** D4 (Task 1's verdict, interface-notes.md §18 #3): **0x0037 first, then
   *  0x0038** — the order the real machine used at every boundary of the
   *  observed session ("seq 25 notify 0x0037 → seq 26 interval-complete →
   *  seq 27 notify 0x0038"). This file used to send them the other way
   *  round, which is why CI never saw either half of the defect that order
   *  causes: the driver's first boundary was DISCARDED (its emission gate
   *  was satisfied only by 0x0038, which had not arrived yet), and the
   *  emission that did fire read its averages from the PREVIOUS boundary's
   *  0x0038 — one `intervalComplete` for a two-interval workout, carrying
   *  interval 2's identity with interval 1's numbers. */
  function deliverBoundary(e: FakeBoundaryEvent): void {
    const { split, asSplit } = boundaryBundle(e, machineState, script.program);
    notify(SPLIT_INTERVAL_DATA_UUID, buildSplitIntervalDataBytes(split));
    notify(
      ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
      buildAdditionalSplitIntervalDataBytes(asSplit),
    );
  }

  /** A status event with nothing rowed yet, in the given wire state — the
   *  shape every "the machine is not mid-piece" reading this file
   *  synthesizes has: armed after a program lands, and each step of the
   *  post-terminate auto-cycle (`queueTerminateAutoCycle`). Elapsed/distance
   *  ARE genuinely zero (§18's Control row records exactly that for a
   *  re-armed machine: `state=armed, elapsedSeconds=0, distanceMeters=0`) —
   *  but spm/currentSplit are NOT: they carry `armedGhost` (see that
   *  variable's own comment), the previous piece's reading, exactly as the
   *  lab captures show. */
  function zeroedStatus(workoutState: number): FakeStatusEvent {
    return {
      atMs: virtualClock,
      kind: "status",
      workoutState,
      elapsedSeconds: 0,
      distanceMeters: 0,
      spm: armedGhost.spm,
      currentSplit: armedGhost.currentSplit,
      heartRateBpm: null,
      programIntervalIndex: 0,
    };
  }

  function deliverArmedBundle(): void {
    const { general, as1, as2 } = armedBundle(
      script.program,
      structureForTick(),
      armedGhost,
    );
    notify(ADDITIONAL_STATUS_2_UUID, buildAdditionalStatus2Bytes(as2));
    notify(ADDITIONAL_STATUS_1_UUID, buildAdditionalStatus1Bytes(as1));
    notify(GENERAL_STATUS_UUID, buildGeneralStatusBytes(general));
    setLatestStatus(zeroedStatus(WORKOUTSTATE_WAITTOBEGIN));
  }

  /** Fix-round 1, F1 / fix wave F-CRIT: the single place the armed LEVEL is
   *  put on the wire — called from `tick()` (the normal path, at most once
   *  per tick for as long as the level is held) and `deliverArmedNow()` (the
   *  synchronous escape hatch). A no-op while the level is low, so both
   *  callers can invoke it unconditionally. Reading it does NOT consume the
   *  level — only `clearArmedLevel()` drops that, from the two places the
   *  machine genuinely stops holding an armed program. It DOES spend the
   *  F1 edge (`armedFirstReportPending`), which is only about ORDERING: the
   *  first armed report must precede any due scripted event, later ones
   *  must not double up with one. */
  function deliverArmedIfHeld(): void {
    armedFirstReportPending = false;
    if (!armedLevel) return;
    // Same rule `deliverOrCache` applies to a scripted status: the PM goes
    // on holding the arm while the phone's radio is down, but nothing
    // reaches the phone. The cached reading is still updated, so
    // `completeReconnect()` flushes "still armed" as the machine's next
    // status frame — which is exactly what a real reconnect onto an armed,
    // un-pulled machine sees. (Before the level fix this path notified
    // straight through `linkDown`, because the one-shot was almost always
    // already spent by the time any test disconnected.)
    if (linkDown) {
      setLatestStatus(zeroedStatus(WORKOUTSTATE_WAITTOBEGIN));
      return;
    }
    deliverArmedBundle();
  }

  /** The armed level drops when — and only when — the machine stops holding
   *  the program it armed. Two callers, matching the two ways that happens:
   *
   *  - `beginProgrammingSequence()` — a NEW sequence is arriving (behind
   *    `program()`'s prepare, or behind an explicit `terminate()`), so
   *    whatever was armed is on its way out. This keeps `driver.ts`'s F1
   *    pins honest: no armed reading can be emitted between the start of a
   *    send and its accept, so a STALE armed observation still cannot
   *    satisfy `verifyArmed`.
   *  - `deliverOrCache()`'s status branch — the SCRIPT (or the machine's own
   *    terminate auto-cycle) has moved the machine on to some other state.
   *    Cleared even while `linkDown`, because the PM's state machine does
   *    not pause for the phone's radio. */
  function clearArmedLevel(): void {
    armedLevel = false;
    armedFirstReportPending = false;
  }

  /** The slave-state nibble every ack carries (`pm5/response.ts` bits 0-3).
   *  A script override wins outright (`FakeScript.slaveState`'s own doc
   *  comment — `"offline"` is the case that matters, §19.3). Otherwise it
   *  follows what the machine is actually doing: `"in-use"` while a workout
   *  is running under master control, `"ready"` the rest of the time
   *  (idle/armed/finished/terminated), which is exactly what every captured
   *  ack shows — all twelve of [S2]'s bytes were taken with the erg not
   *  rowing a programmed piece, and eleven read Ready (§19.1's table). This
   *  is the low nibble a whole-byte comparison over-reads. */
  function currentSlaveState(): CsafeSlaveState {
    if (script.slaveState !== undefined) return script.slaveState;
    return machineState === "rowing" || machineState === "resting"
      ? "in-use"
      : "ready";
  }

  /** Sends one intact ack (Phase 7A-fix-2 Task 6). `sendGarbledAck` below
   *  notifies too, so this is not the only writer to 0x0022 — but both go
   *  through `nextAckFrame`, which IS the one place an ack frame is built,
   *  and that is the property that matters: no path can skip the toggle.
   *
   *  Three independent fields, assembled by `buildAckFrame` and never by
   *  bit math here (pm5/response.ts §19.1):
   *
   *  - `frameStatus` — `"ok"` builds `0x0X`, `"reject"` a GENUINE `0x1X`.
   *    Task 2 corrected this from the old `0x81`, which §19.1 showed
   *    decodes to an ACCEPT (toggle-high, prev-OK, Ready) — a byte that
   *    never meant "reject" on the wire even though this file's callers
   *    used it to mean one.
   *  - `slaveState` — `currentSlaveState()` above.
   *  - `frameToggle` — bit 7, flipped on EVERY ack regardless of outcome.
   *    This is the alternation [S1] recorded as "accept/reject/accept/
   *    reject" for one unchanging command, and the reason any whole-byte
   *    status comparison anywhere in this repo now fails half the suite
   *    (§19.2's verdict: the toggle, not the machine changing its mind).
   *
   *  `commandIds` is the ECHO — the opcodes of the frame being acked, taken
   *  from the frame itself via `pm5/response.ts`'s `echoedCommandIds`, so
   *  the fake cannot claim an echo the request never earned. */
  function sendAck(status: CsafeFrameStatus, commandIds: number[]): void {
    notify(TRANSMIT_CHARACTERISTIC_UUID, nextAckFrame(status, commandIds));
  }

  /** Builds the next ack frame and advances the toggle — shared by
   *  `sendAck` and `sendGarbledAck` so a corrupted frame consumes a toggle
   *  step exactly like a clean one (the PM's frame counter does not care
   *  whether the bytes survived the air). */
  function nextAckFrame(
    status: CsafeFrameStatus,
    commandIds: number[],
  ): Uint8Array {
    const frame = buildAckFrame({
      frameStatus: status,
      slaveState: currentSlaveState(),
      frameToggle: ackToggle,
      commandIds,
    });
    ackToggle = !ackToggle;
    return frame;
  }

  /** `FakeScript.failNextProgramFrame: "garbled"` — an otherwise well-formed ack
   *  whose checksum no longer covers its contents, so `parseFrame` refuses
   *  it and `parseCsafeResponse` reports `{kind: "unparseable"}`.
   *
   *  The corruption is one extra `0x01` pushed in after the real checksum,
   *  before the stop flag. That byte then BECOMES the frame's checksum as
   *  far as the parser is concerned, over contents that now include the old
   *  one — and the XOR of "everything, then its own XOR" is always exactly
   *  `0x00`, never `0x01`. So this is a checksum mismatch UNCONDITIONALLY,
   *  with no branch and no dependence on what the ack happened to contain.
   *  (Overwriting the checksum byte instead needs a "unless it already is
   *  that value" guard, and no reachable ack has a checksum this fake can
   *  drive to that value, which leaves a permanently untestable branch.)
   *  `0x01` is not a frame flag, so nothing here can accidentally produce
   *  some OTHER well-formed frame. Nothing computes a checksum — this only
   *  invalidates one. SYNTHETIC: no hardware frame ever failed to parse
   *  (interface-notes.md §19.1). */
  function sendGarbledAck(commandIds: number[]): void {
    const clean = nextAckFrame("ok", commandIds);
    const garbled = new Uint8Array(clean.length + 1);
    garbled.set(clean.subarray(0, clean.length - 1), 0);
    garbled[clean.length - 1] = 0x01;
    garbled[clean.length] = clean[clean.length - 1]!; // the stop flag
    notify(TRANSMIT_CHARACTERISTIC_UUID, garbled);
  }

  /** The SINGLE consumer of both failure hooks, so there is exactly one
   *  path from "this frame should fail" to a reject/garbled frame on the
   *  wire. `FakeScript.failNextProgramFrame` is the more specific instruction (a
   *  one-shot, and the only one that can ask for `"garbled"`), so it is
   *  consumed first; `injectNak`'s positional `nakAtFrame` answers for the
   *  frame it names and stays armed, since a rejected frame never advances
   *  the cursor past itself. */
  function takeNextAckFailure(): "reject" | "garbled" | null {
    if (failNextProgrammingAck !== null) {
      const failure = failNextProgrammingAck;
      failNextProgrammingAck = null;
      return failure;
    }
    return nakAtFrame === programFrameCursor ? "reject" : null;
  }

  /**
   * CR2 spec 1, Task 8. CSAFE-DEF footnote 12 (p.25) — quoted twenty lines
   * above the bug it caused, `driver.ts`'s own `session` doc comment — and
   * `state-architecture-review.md` §7.5's replay of
   * `pm5-session4b-final.log.gz`: a genuine Terminate re-bases Elapsed Time
   * BACKWARD to a smaller, NON-ZERO value while Distance stands EXACTLY
   * still. Six instances are in that one capture:
   *
   *   rowing      33.57  23.9  -> terminated  21.51  23.9
   *   rowing      31.55  20.9  -> terminated  15.52  20.9
   *   terminated  24.78  13.4  -> terminated  13.88  13.4
   *   terminated  25.70  23.9  -> terminated  14.29  23.9
   *   rowing      25.98  25.8  -> terminated  13.85  25.8
   *   rowing     110.51  31.5  -> terminated  23.42  31.5
   *
   * No consistent ratio holds across them (21.51/33.57 = 0.64 down to
   * 23.42/110.51 = 0.21) — this file's own knowledge boundary (its header:
   * "Concept2 byte-level knowledge stays confined to what this file calls
   * INTO `pm5/`") stops short of inventing a derived formula for a number
   * nothing in [CSAFE-DEF] specifies. Halving is a REPRESENTATIVE rebase,
   * not a derived one: the only property every one of the six samples
   * shares, and the only one any consumer of this fake needs, is SMALLER
   * and NON-ZERO — which halving guarantees for any positive input, and
   * `0` stays `0` (nothing to re-base from a machine that had not yet
   * rowed; that shape is `WORKOUTSTATE_REARM`'s own `zeroedStatus`, the
   * auto-cycle's NEXT step, not this one).
   *
   * ALWAYS applied, not a script opt-in (unlike the truly synthetic hooks
   * in this file, `failNextProgramFrame`/`refuseNextPrepare`, whose own doc
   * comments say "NEVER OBSERVED ON HARDWARE"): this shape is independently
   * observed six times on real hardware in the ONE capture this repo has
   * (the captures are nested prefixes of each other — see the spec's own
   * "the captures are ONE capture, not three" finding), which is exactly
   * the bar this file's header sets for an honest DEFAULT rather than
   * something a test must ask for.
   *
   * ONE definition, two callers on purpose (Task 3): the app's own explicit
   * `terminate()` (`onArmedFrameComplete`) and `program()`'s leading
   * PREPARE step (`queueTerminateAutoCycle` via `onClearingFrameComplete`)
   * send the SAME wire command — `buildTerminate()`, byte for byte — so
   * they get the SAME machine reaction. That equivalence is the finding,
   * not an implementation convenience: interface-notes.md §18 session 3
   * shows `{"kind":"terminated"}` firing off the prepare step's terminate
   * in every mid-session arm it recorded (Step 5 and the REPRO row, both
   * mid-send), and this file used to ack that frame and change NOTHING —
   * no transition, no status — which is why CI could never see either the
   * empty arm or the settle that prevents it.
   *
   * `latestStatus` CAN be null here (an untouched fake, or a terminate that
   * lands after `phase` became `"armed"` but before fix-round 1's F1
   * withheld armed bundle has reached the wire even once): the fallback below is the
   * state the machine is in at that moment — armed, nothing rowed — not a
   * defensive guess. (Elapsed `0` there stays `0`, exactly like every other
   * fallback case above.)
   */
  function synthesizeTerminated(): FakeStatusEvent {
    const previous: FakeStatusEvent =
      latestStatus ?? zeroedStatus(WORKOUTSTATE_WAITTOBEGIN);
    return {
      atMs: virtualClock,
      kind: "status",
      workoutState: WORKOUTSTATE_TERMINATE,
      elapsedSeconds:
        previous.elapsedSeconds > 0 ? previous.elapsedSeconds / 2 : 0,
      distanceMeters: previous.distanceMeters,
      spm: 0,
      currentSplit: previous.currentSplit,
      heartRateBpm: previous.heartRateBpm,
      programIntervalIndex: previous.programIntervalIndex,
    };
  }

  /**
   * The machine's own reaction to `program()`'s prepare step, queued one
   * status per `tick()` (Task 3, design spec §1c): **terminated → idle →
   * armed**, which is CSAFE-DEF Appendix E's `Terminate -> Rearm ->
   * WaitToBegin` cycle in `MonitorFrame` terms — `WORKOUTSTATE_REARM` is
   * the ordinal `pm5/parse.ts` maps to `"idle"`, and `WORKOUTSTATE_WAITTOBEGIN`
   * the one it maps to `"armed"`. Both hardware traces of the cycle show
   * exactly this ordering (interface-notes.md §18 session 3 "Live bisect":
   * REPRO ran rowing → terminated → idle → armed over ~0.85 s of PM clock;
   * Step 5 the same shape inside 0.06 s).
   *
   * TICK-DRIVEN, not synchronous — unlike `onArmedFrameComplete`'s single
   * terminated status, which this file has always delivered inline as "the
   * fake's own synchronous stand-in for the PM's real, near-instant
   * response." The distinction is the whole point of the settle
   * (`driver.ts`'s `waitForPrepareSettle`): the PM's reaction to a terminate
   * is not instantaneous, it is several 0x0031 ticks long, and a program
   * whose frames go out INSIDE that window lands on a machine that is still
   * running. Delivering all three states synchronously inside the prepare's
   * ack would make the fake's machine settle before any programming frame
   * could possibly arrive — i.e. it would make §19.13's empty arm
   * unreachable, and the settle unfalsifiable.
   *
   * Only queued when the prepare's terminate lands on a machine that is
   * actually RUNNING (`rowing`/`resting`) — the same narrow gate
   * `driver.ts`'s `waitForPrepareSettle` uses for its entry condition, and
   * for the same reason: those two states are what both hardware
   * observations of the cycle show. The other four are NOT one case, and
   * are not all equally unobserved (review IMPORTANT-5):
   *
   * - `armed` / `idle` — a plain ACCEPT that changes nothing on the
   *   monitor, on §18 session 3 item 15's captured byte (taken from an
   *   armed-idle screen: READY, with no state change recorded anywhere in
   *   the trace).
   * - `finished` — a terminate here IS documented to move the machine, but
   *   NOT through this cycle: §19.4 quotes Appendix E's
   *   `WorkoutLogged -> [Terminate] -> WaitToBegin` and flags the asymmetry
   *   explicitly — the WorkoutLogged exit skips Rearm entirely. §18 Step 3
   *   credits the prepare with taking the monitor off the finished screen.
   *   That one-step exit is deliberately NOT modelled: nothing observable
   *   distinguishes it today (the new program's own arm moves the display
   *   either way, which is what Step 3 actually recorded), the settle never
   *   engages from `finished`, and §18 records no intermediate state for
   *   Step 3 the way it does for Step 5 and the REPRO. **Session 4a/4b
   *   watch-item:** programming from a finished screen, does the machine
   *   report a `WaitToBegin` tick BETWEEN the prepare's ack and the first
   *   programming frame? That single reading decides whether this fake
   *   should model the documented one-step exit.
   * - `terminated` — nothing observed in either direction, and it is not a
   *   free choice: widening the EMPTY-ARM key to include it breaks the
   *   documented post-terminate reprogram path (§19.4/§19.5; the repo's own
   *   two-coherent-runs test dies), so the model stays where the evidence
   *   is.
   */
  function queueTerminateAutoCycle(): void {
    // Refresh the ghost from whatever the machine was ACTUALLY reporting
    // the instant before this terminate — `onClearingFrameComplete`'s own
    // `machineState === "rowing" || "resting"` guard is this function's
    // ONLY caller, and `machineState` only ever leaves `"idle"` through
    // `setLatestStatus`, so `latestStatus` here is PROVABLY non-null: a
    // defensive `if (latestStatus)` around this assignment would be a
    // branch no test could ever reach (the repo's own "a guard nothing
    // exercises is a guard nobody knows works" — `surfaceModel.ts`'s
    // `phaseIndexForInterval` names the same tradeoff the other way, where
    // the guard IS reachable). Captured BEFORE `synthesizeTerminated()`/
    // `zeroedStatus()` below, which read `latestStatus`/`armedGhost`
    // themselves but never advance either.
    armedGhost = {
      spm: latestStatus!.spm,
      currentSplit: latestStatus!.currentSplit,
    };
    autoCycle = [
      synthesizeTerminated(),
      zeroedStatus(WORKOUTSTATE_REARM),
      zeroedStatus(WORKOUTSTATE_WAITTOBEGIN),
    ];
  }

  /** One step of the queued auto-cycle per `tick()`, delivered through the
   *  same `deliverOrCache` path a scripted status takes (so a cycle that
   *  elapses while the link is down is cached and flushed by
   *  `completeReconnect()`, exactly like the rest of the machine's
   *  bookkeeping — the PM does not pause its own state machine for the
   *  phone's radio). A no-op once the cycle has drained. */
  function advanceAutoCycle(): void {
    const next = autoCycle.shift();
    if (next) deliverOrCache(next);
  }

  /** Everything that has to be true when a fresh programming sequence is
   *  about to arrive, in ONE place because there are TWO ways in: behind
   *  `program()`'s own prepare step (`onClearingFrameComplete`) and behind
   *  the app's explicit `terminate()`, which reopens the machine with no
   *  prepare in front of the next sequence (`onArmedFrameComplete` —
   *  "terminate is the documented exit back to a programmable state",
   *  §19.4/§19.5).
   *
   *  `sawRunningDuringProgramming` belongs here and not only at the prepare
   *  (review LOW-3/I-7): reset at the prepare alone, a bare sequence behind
   *  a terminate INHERITS the previous sequence's poison and arms empty on
   *  a machine reading `terminated` — a state no hardware reading supports.
   *  Unreachable through `driver.program()`, which always prepares, so this
   *  is model hygiene; but a fake that can be wrong in a way no test would
   *  explain is the thing this file exists not to be. */
  function beginProgrammingSequence(): void {
    phase = "programming";
    programChunkCursor = 0;
    programFrameCursor = 0;
    sawRunningDuringProgramming = false;
    // Fix wave F-CRIT: the armed level belongs here for the same reason
    // `sawRunningDuringProgramming` does — this is the ONE place a fresh
    // sequence starts, by either route, and a machine about to be
    // reprogrammed is no longer holding what it armed before.
    clearArmedLevel();
  }

  /** The clear step's own chunk assertion (plan Task 2) — reuses
   *  `terminateChunks`, the SAME bytes `assertArmedChunk` below checks for
   *  the app's own, later, explicit `terminate()` call. Separate cursor
   *  (`clearChunkCursor`, not `terminateChunkCursor`) so a test that later
   *  exercises a real `terminate()` after arming isn't left with a cursor
   *  already partway advanced by `program()`'s own internal clear. */
  function assertClearingChunk(chunk: Uint8Array): void {
    const expected = terminateChunks[clearChunkCursor];
    if (!expected || !bytesEqual(chunk, expected)) {
      throw new Error(
        `fake transport: unexpected write during the clear step ${toHex(chunk)} — only the documented terminate sequence is accepted here`,
      );
    }
    clearChunkCursor += 1;
  }

  /** Called once the prepare step's chunks have all arrived. **ACCEPTED**
   *  — always, whatever is or is not loaded (§19.1's `S2 D2`/`S2 D3` rows,
   *  raw `f1 01 76 01 13 65 f2` / `f1 81 76 01 13 e5 f2`, for the loaded
   *  case; §18 session 3 **item 15**'s `f1 81 76 01 13 e5 f2` for the empty
   *  one). The nothing-loaded REFUSAL this function used to send by default
   *  is gone: it was the last behaviour in this file sourced from the
   *  withdrawn whole-byte parse (§19.1's `S1 CLEAN RUN 2` row, `NARR-NB` —
   *  no byte at all), and item 15 finally captured the byte, which decodes
   *  to an accept. It survives only as `FakeScript.refuseNextPrepare`,
   *  marked never-observed at its own definition, because the driver's
   *  prepare SWALLOW rule still needs something to swallow.
   *
   *  An ACCEPTED prepare that lands on a RUNNING machine gets the machine
   *  reaction the wire command actually produces —
   *  `queueTerminateAutoCycle()` above, terminated → idle → armed across
   *  the next three ticks. A refused one changes nothing, which is what a
   *  refusal means. Either way the loaded workout SURVIVES: terminate's
   *  documented destination is *Rearm* — the SAME workout made ready again
   *  (§19.5) — which is the whole reason `program()` cannot treat this step
   *  as a clear. Advances into `"programming"` regardless: the driver sends
   *  the program next no matter which ack it got. `timeoutInjected`
   *  short-circuits this exactly like the other two frame-complete handlers
   *  below: the bytes were already verified correct, but no ack goes out
   *  and `phase` does not advance.
   *
   *  THIS IS THE RESET POINT for the programming sequence (Task 6 fix
   *  round, review MED-1). `program()` always leads with this step and then
   *  sends its sequence from frame 0, so whatever a PREVIOUS attempt left
   *  behind — a refused frame partway through, a sequence abandoned by a
   *  disconnect — is discarded here rather than being carried into bytes
   *  that are about to arrive again from the top. An earlier version of
   *  this file rewound only to the START OF THE REFUSED FRAME instead,
   *  which is the wrong point for any sequence longer than one frame: a
   *  4-frame program refused at frame 2 and retried properly threw
   *  `programming chunk 12 mismatch` on the retry's very first chunk. */
  function onClearingFrameComplete(frame: Uint8Array): void {
    if (timeoutInjected) return;
    if (refusePrepare) {
      refusePrepare = false;
      sendAck("reject", echoedCommandIds(frame));
    } else {
      sendAck("ok", echoedCommandIds(frame));
      if (machineState === "rowing" || machineState === "resting") {
        queueTerminateAutoCycle();
      }
    }
    beginProgrammingSequence();
  }

  // Byte-for-byte verification happens on every individual WRITE (BLE
  // chunk granularity, <=20 bytes) — independently of frame reassembly.
  // `incoming` (below) is used ONLY to detect "a complete frame has now
  // arrived" as a trigger for acking; its own reassembled bytes are never
  // compared against anything here, since by the time it signals
  // completion every one of the frame's chunks has already been asserted
  // correct one at a time. (An earlier version of this file compared
  // `incoming.push()`'s reassembled FULL FRAME against a single expected
  // CHUNK and always failed on the second chunk of any multi-chunk frame —
  // fixed by this split.)
  function assertProgrammingChunk(chunk: Uint8Array): void {
    const expected = flatProgramChunks[programChunkCursor];
    if (!expected || !bytesEqual(chunk, expected)) {
      throw new Error(
        `fake transport: programming chunk ${programChunkCursor} mismatch — got ${toHex(chunk)}, which is not chunk ${programChunkCursor} of buildProgrammingSequence's own ${flatProgramChunks.length}-chunk output`,
      );
    }
    programChunkCursor += 1;
  }

  /** Called once per COMPLETE programming frame (not per chunk) — decides
   *  the ack and, on success, whether the whole sequence is now done.
   *  `timeoutInjected` (fix-round HIGH-2) short-circuits ALL of that: the
   *  frame's bytes were already verified correct (by
   *  `assertProgrammingChunk`, before this ever runs), but no ack is sent
   *  and nothing advances — the link simply goes quiet on this one
   *  response, exactly the "mid-sequence timeout" the spec's own §4
   *  injection hook describes, distinct from `injectDisconnect()` (which
   *  also flips `linkDown` and fires `onDisconnect`; this does neither). */
  function onProgrammingFrameComplete(frame: Uint8Array): void {
    if (timeoutInjected) return;
    // §19.13, THE EMPTY ARM, state-keyed: a programming frame that arrives
    // while the machine is STILL mid-piece poisons the whole sequence's
    // arm. Recorded per frame and sticky to the end of the sequence,
    // because that is the shape the hardware repro had — `program-many`
    // went out ~52 s into a running workout and the trace shows
    // `{"kind":"terminated"}` firing MID-send, so its last frames landed on
    // a machine that had already stopped running, and it armed empty
    // anyway. Keyed on the machine's STATE and never on a tick count: a
    // tick-counted trigger would be modelling `driver.ts`'s settle budget
    // (the fix) instead of the machine (the defect), and would go on
    // "passing" if that budget were ever wrong.
    if (machineState === "rowing" || machineState === "resting") {
      sawRunningDuringProgramming = true;
    }
    const echo = echoedCommandIds(frame);
    const failure = takeNextAckFailure();
    if (failure !== null) {
      if (failure === "garbled") {
        sendGarbledAck(echo);
      } else {
        sendAck("reject", echo);
      }
      // Nothing is rewound here. A refused frame simply does not land, and
      // the master's own retry leads with a prepare step — which is where
      // the sequence position is reset (`onClearingFrameComplete`).
      return;
    }
    sendAck("ok", echo);
    programFrameCursor += 1;
    if (programFrameCursor === programSequence.length) {
      phase = "armed";
      // D1 WITHDRAWN (interface-notes.md §19.2): a program sent over a
      // loaded workout is accepted and REPLACES it — §19.1's Verdict (b),
      // corrected: a rest-0 program landed over whatever a rest-30 send and
      // a reconnect had left loaded, and produced a work→work row with no
      // resting state at all. What the machine holds is now what was just
      // programmed, whatever it held before; nothing is ever wiped to
      // `null` here.
      //
      // …EXCEPT that a sequence which landed on a running machine arms
      // EMPTY (§19.13): the machine holds a workout with NO interval
      // structure — `loadedIntervals()` reads `0`, never `null` (something
      // IS loaded; it has nothing in it), and no boundary is ever reported
      // for it (`deliverOrCache`).
      //
      // Fix-3 Task 5: `verifyArmed` now genuinely rejects this row
      // (`"structure-mismatch"`) — `currentArmedStructure()` reads
      // `armedEmpty` below and reports SESSION 4a's captured empty-arm
      // anatomy (`EMPTY_ARM_STRUCTURE`: `workoutType=1 durationRaw=0
      // durationType=128`) on the WIRE, not just through
      // `loadedIntervals()`'s introspection (review I-4's gap, closed).
      armedEmpty = sawRunningDuringProgramming;
      loadedIntervalCount = armedEmpty ? 0 : script.program.intervals.length;
      // Fix-3 Task 5: this accept's own WAITTOBEGIN bundle (the very next
      // status this machine delivers, `armedLevel` below) lags on
      // the PRIOR structure for one tick if the script asked for it —
      // `FakeScript.lagStructureOneTick`'s own doc comment has the
      // hardware citation. One-shot per accept, same as the script fields
      // this mirrors (`failNextProgramFrame`, `refuseNextPrepare`).
      if (script.lagStructureOneTick) structureLagPending = true;
      // Whatever the prepare's terminate left mid-flight is superseded: the
      // machine has just re-armed on a program of its own, and the Rearm
      // cycle it was walking toward `WaitToBegin` has nowhere left to go.
      // (Only ever non-empty on the settle-disabled path — with the settle
      // on, the driver holds its frames until this cycle has finished.)
      autoCycle = [];
      // …and the SESSION bookkeeping that belonged to the previous workout
      // goes with it (Task 6 fix round, review MED-2) — both the internal
      // `lastBoundaryCumulative` and the WIRE-facing `wireLastSplit` it
      // feeds (CR2 spec 2a Task 6), a number that means nothing across a
      // workout boundary either way. The cached boundary goes for the same
      // reason: a reconnect early in run 2 would otherwise flush run 1's
      // LAST boundary into run 2 as if it had just happened.
      lastBoundaryCumulative = { elapsedSeconds: 0, distanceMeters: 0 };
      wireLastSplit = { elapsedSeconds: 0, distanceMeters: 0 };
      latestBoundary = null;
      // Fix-round 1, F1: withheld until a subsequent `tick()` (or
      // `deliverArmedNow()`) — see `tick()`'s own doc comment for why
      // this is no longer synchronous with the ack itself. Fix wave
      // F-CRIT: and re-reported on every otherwise-silent tick from then
      // on, until the level drops (`clearArmedLevel`).
      armedLevel = true;
      armedFirstReportPending = true;
    }
  }

  function assertArmedChunk(chunk: Uint8Array): void {
    const expected = terminateChunks[terminateChunkCursor];
    if (!expected || !bytesEqual(chunk, expected)) {
      throw new Error(
        `fake transport: unexpected write while armed ${toHex(chunk)} — only the documented terminate sequence is accepted here`,
      );
    }
    terminateChunkCursor += 1;
  }

  /** Called once the terminate frame's chunks have all arrived — acks and
   *  immediately reports the TERMINATE status (the fake's own synchronous
   *  stand-in for the PM's real, near-instant response), carried over from
   *  whatever the machine last reported by `synthesizeTerminated()`, which
   *  is the SAME synthesis `program()`'s prepare step now gets (that
   *  function's own doc comment: same wire command, same reaction — the
   *  difference is only that the prepare's arrives spread across ticks,
   *  because that window is what the settle exists to wait out). */
  function onArmedFrameComplete(frame: Uint8Array): void {
    if (timeoutInjected) return; // same short-circuit as onProgrammingFrameComplete
    terminateChunkCursor = 0;
    sendAck("ok", echoedCommandIds(frame));
    // Back to a programmable machine (interface-notes.md §19.4/§19.5):
    // terminate is the documented exit to `WaitToBegin`, so a whole new
    // programming sequence can now arrive over this same connection, with
    // the cursors rewound to its first frame. (A FURTHER terminate is legal
    // too — `write()`'s own terminate recognition below picks that up.) The
    // loaded workout is NOT cleared: terminate routes to Rearm, the SAME
    // workout made ready again (§19.5), so what `loadedIntervals()` reports
    // survives this.
    beginProgrammingSequence();
    const terminated = synthesizeTerminated();
    // Through `setLatestStatus`, never by direct assignment (Task 6 fix
    // round, review MED-3): that function is the only place `machineState`
    // is kept in step with what the machine last reported, and since Task 6
    // `machineState` decides the SLAVE-STATE nibble of every subsequent ack
    // (`currentSlaveState`). Assigning `latestStatus` straight left a
    // terminated machine still acking `in-use` — a wrong low nibble on the
    // exact field this task exists to make honest.
    setLatestStatus(terminated);
    deliverStatus(terminated);
  }

  function deliverOrCache(event: FakeTimelineEvent): void {
    if (event.kind === "status") {
      // Fix wave F-CRIT: the script (or the machine's own terminate
      // auto-cycle) has said what state the machine is in now, so the
      // fake stops re-reporting the armed level of its own accord —
      // whatever this event says supersedes it, including a WAITTOBEGIN
      // event, which a script is free to keep driving itself.
      clearArmedLevel();
      setLatestStatus(event);
      if (!linkDown) deliverStatus(event);
    } else {
      // §19.13: an EMPTY arm has NO interval structure, so this machine
      // reports no boundary for it — ever. The script's boundary events
      // describe a workout the machine is not holding, so they are consumed
      // by the timeline and dropped whole: not delivered, and not booked
      // into `lastBoundaryCumulative` either (that field is "where the
      // interval currently running began", and there are no intervals).
      // Hardware: rowed to 108.4 m past what should have been a 100 m
      // interval with `intervalIndex` pinned at 0, no `resting` transition
      // and no `intervalComplete` of any kind.
      if (armedEmpty) return;
      latestBoundary = event;
      // The machine's own bookkeeping updates HERE, unconditionally —
      // never gated on `linkDown` (see `lastBoundaryCumulative`'s own
      // comment). This is what a later status tick (live or, after
      // `completeReconnect()`, the very first post-reconnect one) picks up
      // automatically, with no separate reconnect-specific logic needed.
      //
      // The WIRE checkpoint (`wireLastSplit`) shifts to the OLD
      // `lastBoundaryCumulative` first, one line before `lastBoundaryCumulative`
      // itself advances to this boundary — that ordering is the whole
      // lag-one-boundary model (Task 6, `wireLastSplit`'s own comment):
      // whatever this boundary just made current stays ONE boundary away
      // from what the wire reports until the NEXT boundary shifts it in
      // turn. At the very first boundary (completing interval 0),
      // `lastBoundaryCumulative` is still its `{0, 0}` initial value, so
      // `wireLastSplit` shifts to `{0, 0}` too — exactly why the wire reads
      // 0 through interval 1 as well as interval 0.
      wireLastSplit = lastBoundaryCumulative;
      lastBoundaryCumulative = {
        elapsedSeconds: event.cumulativeElapsedSeconds,
        distanceMeters: event.cumulativeDistanceMeters,
      };
      if (!linkDown) deliverBoundary(event);
    }
  }

  function runDueEvents(): void {
    while (
      eventCursor < timeline.length &&
      timeline[eventCursor]!.atMs <= virtualClock
    ) {
      deliverOrCache(timeline[eventCursor]!);
      eventCursor += 1;
    }
  }

  return {
    scan(): Promise<DiscoveredMonitor[]> {
      return Promise.resolve([
        { id: "fake-pm5", name: script.deviceName ?? "PM5 (fake)" },
      ]);
    },
    connect(): Promise<void> {
      // Also gated on `delayWrites` (its own doc comment: "every
      // `connect()`/`write()` call") — the deviceName-gated dispatch race
      // this knob exists to reproduce is specifically about `connect()`
      // resolving slower than one microtask, before `useMonitorSession.ts`
      // sets `deviceName`.
      return settleWrite(undefined);
    },
    // `async` deliberately, even though `processWrite` below never awaits
    // anything: `assertProgrammingChunk`/`assertArmedChunk` THROW
    // synchronously on a byte mismatch (this is the "asserts, not
    // accepts" behaviour design spec §4 requires), and only an `async`
    // function automatically turns a synchronous throw into a REJECTED
    // promise — `Transport.write` is typed `Promise<void>`, and a caller
    // doing `await t.write(...)` must see a rejection, not an uncaught
    // synchronous exception escaping the `await` expression itself. A
    // rejection is never delayed by `delayWrites` (`processWrite` throwing
    // is what SKIPS the `settleWrite` call below) — only a SUCCESSFUL write
    // is; see `FakeControls.delayWrites`'s own doc comment for why that
    // asymmetry is fine for the two regressions this knob exists to
    // reproduce (both need a slow ACCEPT, neither a slow reject).
    async write(characteristicId: string, bytes: Uint8Array): Promise<void> {
      processWrite(characteristicId, bytes);
      return settleWrite(undefined);
    },
    // Everything `write()` used to do inline, unchanged — split out only so
    // `delayWrites`'s `settleWrite` wrapper has a single call site to sit
    // around, rather than needing to be threaded onto every one of this
    // function's several early `return`s.
    subscribe(
      characteristicId: string,
      cb: (bytes: Uint8Array) => void,
    ): () => void {
      let set = notifyCbs.get(characteristicId);
      if (!set) {
        set = new Set();
        notifyCbs.set(characteristicId, set);
      }
      set.add(cb);
      return () => set!.delete(cb);
    },
    disconnect(): Promise<void> {
      return Promise.resolve();
    },
    onDisconnect(cb: (reason: string) => void): () => void {
      disconnectCb = cb;
      return () => {
        if (disconnectCb === cb) disconnectCb = null;
      };
    },

    tick(ms: number): void {
      virtualClock += ms;
      // Fix-round 1, F1: the FIRST armed report goes out BEFORE any due
      // scripted event, so a script's own first timeline entry is never
      // delivered "ahead of" the session actually arming.
      const first = armedFirstReportPending;
      if (first) deliverArmedIfHeld();
      // Then one step of the machine's own reaction to a prepare step
      // (Task 3) — ahead of the script's timeline for the same reason: the
      // machine finishes reacting to what it was just sent before the
      // session the script describes carries on.
      advanceAutoCycle();
      runDueEvents();
      // Fix wave F-CRIT: armed is a LEVEL. If neither the auto-cycle nor
      // the script said anything this tick (either would have dropped the
      // level, `clearArmedLevel`), the machine repeats what it is still
      // holding — the ~2 Hz "armed" pulse real hardware emits, and the
      // reason a real PM5 can never lose this reading to a badly-timed
      // pump. Skipped on the tick that already reported it above, so a
      // REPEAT never doubles up a tick that already carries a reading (the
      // first post-accept tick deliberately carries two — see the
      // `armedFirstReportPending` comment).
      if (!first) deliverArmedIfHeld();
    },
    deliverArmedNow(): void {
      deliverArmedIfHeld();
    },
    loadedIntervals(): number | null {
      return loadedIntervalCount;
    },
    injectNak(atFrame: number): void {
      nakAtFrame = atFrame;
    },
    injectTimeout(): void {
      timeoutInjected = true;
    },
    injectDisconnect(): void {
      linkDown = true;
      disconnectCb?.("fake transport: injected disconnect");
    },
    /**
     * The END-OF-WORKOUT SUMMARY (0x0039) the PM5 sends once a workout has
     * finished — fast-follow Task 2's summary-fallback gate is the only
     * consumer, and this is how a test hands it real 20 bytes through the
     * real decoder.
     *
     * On demand rather than on the timeline (`FakeTimelineEvent`), because
     * unlike a status tick or a boundary this is not a reading the machine
     * produces on a cadence: it fires once at the end, and every test that
     * cares about it cares about exactly WHEN, relative to the finish and
     * to the driver's own reconcile deadline. Putting it in the caller's
     * hands is the same choice `injectGarbledFrame`/`deliverArmedNow`
     * already make for their own one-shot events.
     *
     * **The averages default to real, non-zero readings on purpose.** The
     * gate's job is to DROP them (0x0039's averages are the whole
     * workout's, never the final interval's — design spec §5's B3), and a
     * fake that defaulted them to zero or to a null sentinel would make
     * that impossible to disprove: a test asserting "the synthesized actual
     * carries no average" would pass against a driver that copied them
     * straight across. A caller wanting the beltless machine passes `0` for
     * the heart rates explicitly, the way this file's other heart-rate
     * models do (`HEARTRATE_NO_BELT`).
     */
    deliverSummary(
      totals: { elapsedSeconds: number; meters: number } & Partial<
        Omit<WorkoutSummary, "elapsedSeconds" | "meters">
      >,
    ): void {
      if (linkDown) return;
      notify(
        END_OF_WORKOUT_SUMMARY_UUID,
        buildEndOfWorkoutSummaryBytes({
          avgStrokeRate: 24,
          endingHeartRateBpm: 168,
          avgHeartRateBpm: 152,
          minHeartRateBpm: 96,
          maxHeartRateBpm: 175,
          dragFactorAverage: 128,
          recoveryHeartRateBpm: 120,
          workoutType: 8,
          avgPaceSecondsPer500m: 125,
          ...totals,
        }),
      );
    },
    injectGarbledFrame(): void {
      // Two bytes where 0x0031 (General Status) requires 19 — always too
      // short regardless of the session's current state, exercising
      // `pm5/parse.ts`'s length guard (`Pm5ParseError`) rather than any
      // particular field's value.
      notify(GENERAL_STATUS_UUID, Uint8Array.from([0x00, 0x00]));
    },
    completeReconnect(): void {
      linkDown = false;
      // Boundary FIRST, then status: a boundary that elapsed while
      // disconnected chronologically precedes any later status tick this
      // fake also has cached, and delivering it first keeps the driver's
      // own last-seen-`intervalIndex` bookkeeping (fed by status ticks,
      // used for the "divergence" check, fix-round MED-2) from briefly
      // looking skewed against a boundary that is actually still in order.
      if (latestBoundary) deliverBoundary(latestBoundary);
      if (latestStatus) deliverStatus(latestStatus);
    },
    delayWrites(ms: number): void {
      writeDelayMs = ms;
    },
    subscriptionCount(): number {
      let total = 0;
      for (const set of notifyCbs.values()) total += set.size;
      return total;
    },
  };

  /** See `write()`'s own comment for why this is split out. Synchronous;
   *  throws on a byte mismatch or an unexpected write target, exactly as
   *  this logic did inline before `delayWrites` existed. */
  function processWrite(characteristicId: string, bytes: Uint8Array): void {
    // D6 (interface-notes.md §18's "also fixed live" list): while the
    // link is down every handle a transport is holding is dead, and a
    // write on one throws — Chrome's own wording reproduced verbatim
    // below, because that string IS the observation. Checked before the
    // sample-rate early-return: an invalidated handle does not care which
    // characteristic it points at. See `injectDisconnect`'s doc comment
    // for why the fake having none of this hid the session's worst bug.
    if (linkDown) {
      throw new Error(
        `fake transport: InvalidStateError: Characteristic ${characteristicId} is no longer valid. Remember to retrieve the characteristic again after reconnecting.`,
      );
    }
    if (characteristicId === SAMPLE_RATE_UUID) {
      return;
    }
    if (characteristicId !== RECEIVE_CHARACTERISTIC_UUID) {
      throw new Error(
        `fake transport: unexpected write target ${characteristicId}`,
      );
    }
    // Task 3's `sendGetErrorType` one-off write — checked BEFORE the
    // phase-based assertions below, since it can legitimately arrive
    // mid-"programming" (right after a reject) and is not the next
    // expected programming/clearing/armed chunk.
    //
    // ABSORBED AND ACKED, not scripted — Task 6's own choice, stated
    // plainly. The reply is an ordinary `"ok"` ack echoing the single
    // opcode that was asked for (`0xC8`), carrying this fake's normal
    // toggle and slave state. Nothing about its CONTENT is scriptable,
    // because nothing about it is known: no GET command has ever been
    // sent to this hardware, the pull wrapper itself is an unresolved
    // conflict between the two source documents, and the driver logs the
    // reply as raw hex with no claimed meaning (interface-notes.md §17
    // item 14, `buildGetErrorType`'s own doc comment). A scriptable
    // payload here would be inventing the answer to the exact question
    // the merge-gate row exists to ask. It DOES go through `sendAck`, so
    // it consumes a toggle step like every other frame the PM emits —
    // that much is frame-counter mechanics, not error semantics. Does not
    // touch `phase` or any cursor: this write is orthogonal to the
    // clearing/programming/armed state machine.
    if (bytesEqual(bytes, getErrorTypeFrame)) {
      // `0xC8` = `CSAFE_PM_GET_ERRORTYPE`, the one opcode
      // `buildGetErrorType()` sends — the same inline literal Task 3 put
      // here, unchanged. `echoedCommandIds` deliberately does not decode
      // the `0x1A` pull wrapper this frame uses (its own doc comment), so
      // there is nothing to derive it from.
      sendAck("ok", [0xc8]);
      return;
    }
    // A terminate frame arriving where the next PROGRAMMING frame would
    // go is legal and common (Task 6): it is the prepare step of the next
    // `program()` after a previous one was refused or after a terminate
    // re-opened the machine, and it is the app's own `terminate()` called
    // twice. The machine parses whatever frame it is handed — only this
    // fake's expected-byte bookkeeping needs telling which sequence the
    // chunk belongs to. No frame-position guard: `terminateChunks[0]`
    // carries a start flag and bytes no programming chunk ever matches,
    // and `pm5/framer.ts`'s own resynchronization rule says a start flag
    // arriving mid-frame DISCARDS the incomplete frame — so recognising a
    // terminate whenever its first chunk shows up is what the reassembler
    // itself would do. (An earlier version gated this on a
    // frame-boundary check that no test could discriminate — review
    // LOW-3 — and that a mid-frame terminate would have got wrong.)
    if (phase === "programming" && bytesEqual(bytes, terminateChunks[0]!)) {
      phase = "clearing";
      clearChunkCursor = 0;
    }
    if (phase === "clearing") {
      assertClearingChunk(bytes);
    } else if (phase === "programming") {
      assertProgrammingChunk(bytes);
    } else {
      assertArmedChunk(bytes);
    }

    // `incoming` (`pm5/framer.ts`'s `reassemble()`) detects "a complete
    // frame has now arrived" — real start/stop-flag boundary detection,
    // not a second byte comparison; every chunk was already asserted
    // correct one at a time above. Since Task 6 the REASSEMBLED FRAME
    // itself is used as well, but only as the source of the opcode echo
    // each handler puts in its ack (`pm5/response.ts`'s
    // `echoedCommandIds`) — never as a byte check. Per the drain
    // contract, keep pushing empty chunks until it returns null.
    let complete = incoming.push(bytes);
    while (complete) {
      if (phase === "clearing") {
        onClearingFrameComplete(complete);
      } else if (phase === "programming") {
        onProgrammingFrameComplete(complete);
      } else {
        onArmedFrameComplete(complete);
      }
      complete = incoming.push(new Uint8Array(0));
    }
  }
}
