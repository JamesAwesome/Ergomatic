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
//   - its writes fail while the link is down, the way an invalidated GATT
//     handle does (D6).
//
// Two ack shapes here are SYNTHETIC and say so at their definitions,
// because nothing observed produced them: `FakeScript.failNextProgramFrame`'s
// genuine reject and its checksum-garbled frame (§19.1 — not one of the
// twelve captured bytes was a rejection).
//
// Verifies each programming chunk byte-for-byte against
// `buildProgrammingSequence`'s output (asserts — a wrong byte is a test
// failure, not a tolerated write); acks via `pm5/response.ts`'s
// `buildAckFrame` fed by its `echoedCommandIds`; plays a tick-driven
// session timeline (no wall clock — `tick(ms)` is the only thing that ever
// advances time); six injection hooks (design spec §4, plan Task 4, plus
// fix-round HIGH-2's `injectTimeout`, distinct from `injectDisconnect`: the
// link stays up, only the ack never comes); a leading "clearing" phase
// (plan Task 2) modeling `program()`'s own best-effort prepare step,
// rejected when nothing is loaded and ACCEPTED when something is.
// `sendAck`'s own doc comment covers how each ack's status byte is
// assembled since Phase 7A-fix-2's corrected bitfield parse
// (pm5/response.ts §19.1).
//
// Concept2 byte-level knowledge stays confined to what this file calls INTO
// `pm5/` (`buildProgrammingSequence`, `buildTerminate`, `buildAckFrame`,
// `echoedCommandIds`, `reassemble`, the `buildXBytes` encoders in
// `pm5/statusFrames.ts`,
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
  WORKOUTSTATE_TERMINATE,
  WORKOUTSTATE_WAITTOBEGIN,
  type AdditionalSplitIntervalData,
  type AdditionalStatus1,
  type AdditionalStatus2,
  type GeneralStatus,
  type SplitIntervalData,
} from "../../../domain/monitor/pm5/parse.js";
import {
  buildAckFrame,
  echoedCommandIds,
  type CsafeFrameStatus,
  type CsafeSlaveState,
} from "../../../domain/monitor/pm5/response.js";
import {
  buildAdditionalSplitIntervalDataBytes,
  buildAdditionalStatus1Bytes,
  buildAdditionalStatus2Bytes,
  buildGeneralStatusBytes,
  buildSplitIntervalDataBytes,
} from "../../../domain/monitor/pm5/statusFrames.js";
import {
  ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
  ADDITIONAL_STATUS_1_UUID,
  ADDITIONAL_STATUS_2_UUID,
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
 *  characteristic (interface-notes.md §10). The driver's
 *  `computeRemainingForFrame` roots its next-interval checkpoint in the
 *  cumulative pair at the moment of the boundary — conflating the two
 *  (an earlier version of this file sent the per-interval value for BOTH)
 *  makes every interval after the first compute a wrong `intervalRemaining`
 *  the moment the session isn't just "one interval starting at zero". */
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
  actual: Omit<IntervalActual, "index"> & { index: number };
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
   * - the prepare step (`buildTerminate()`) is ACCEPTED while a workout is
   *   loaded — §19.1's `S2 D2` rows, raw captured bytes — and REJECTED when
   *   nothing is. **That second half is the LAST behaviour in this fake
   *   still resting on the withdrawn parse.** Its only source is §19.1's
   *   `S1 CLEAN RUN 2` row, classed `NARR-NB`: "no byte at all — the old
   *   parse's accept/reject label is all that survives, undecodable". The
   *   surviving "rejected — nothing to terminate" label was produced by the
   *   very whole-byte compare §19.1 withdrew, and every byte in that
   *   document the compare called a rejection turned out to be an accept.
   *   It is kept because it is not in §19.2's withdrawn list, because
   *   `sendPrepare` swallows the outcome either way, and because inventing
   *   the opposite would be no better sourced — NOT because it is
   *   corroborated. One terminate sent to an idle machine settles it;
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
   * `injectNak` has always had (`injectNak`'s own doc comment): the prepare
   * step's ack is decided by the machine's load state, and `program()`
   * swallows anything but a disconnect there anyway, so a failure aimed at
   * it could never reach a driver-visible outcome.
   */
  failNextProgramFrame?: "reject" | "garbled";
  /** The post-"armed" session timeline, ascending by `atMs`. `tick(ms)`
   *  advances a purely virtual clock (no timers, no wall clock anywhere in
   *  this file) and delivers every event whose `atMs` has now been
   *  reached. */
  events?: FakeTimelineEvent[];
}

export interface FakeControls {
  /** Advances the fake's internal virtual clock by `ms` and delivers every
   *  scripted event now due — ALSO flushes a pending WAITTOBEGIN bundle
   *  first, if `program()`'s last frame has acked since the previous call
   *  (fix-round 1, F1). That armed delivery used to happen SYNCHRONOUSLY
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
   *  instead of assuming continuity. */
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
   *  for a reject. (The machine has one other, entirely legitimate reason
   *  to answer `"reject"` — `onClearingFrameComplete`'s nothing-loaded
   *  refusal of the prepare step. That is a load-state answer, not a
   *  scripted failure.) Unlike `failNextProgramFrame` this one is STICKY:
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
   * tick-driven wait. A no-op if no armed delivery is currently pending
   * (nothing was withheld, or it was already flushed). Most tests should
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
   *  slot). */
  loadedIntervals(): number | null;
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

/** Builds the merged General/AdditionalStatus1/AdditionalStatus2 triple for
 *  one `FakeStatusEvent` — the "full bundle" this fake always sends
 *  together for a status tick, in this fixed order, so the driver (which
 *  gates its `frame` event on having seen all three at least once) is
 *  always warmed up by the time a real session begins.
 *
 *  `lastSplit` is 0x0033's "Last Split Time"/"Last Split Distance" pair
 *  (interface-notes.md §10, §15 #8) — the session-cumulative point at
 *  which the CURRENT interval began, i.e. wherever the most recent
 *  boundary (if any) left off. The driver's `computeRemainingForFrame`
 *  (fix-round HIGH-1) subtracts this from the live `elapsedSeconds`/
 *  `distanceMeters` above to recover "progress into this interval" with
 *  no observation history of its own — an earlier version of this fake
 *  hardcoded both fields to 0 forever, which made every interval after
 *  the first compute a wrong (too-generous) `intervalRemaining` the
 *  moment it wasn't the interval that started the whole session. */
function statusBundle(
  program: WorkoutProgram,
  e: FakeStatusEvent,
  lastSplit: { elapsedSeconds: number; distanceMeters: number },
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
      workoutType: 8, // WORKOUTTYPE_VARIABLE_INTERVAL (interface-notes.md §11)
      intervalType: isDistance ? 1 : 0,
      workoutState: e.workoutState,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: e.distanceMeters,
      workoutDurationRaw: 0,
      workoutDurationType: 0,
      dragFactor: 130,
    },
  };
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
      splitIntervalAvgPace: actual.avgSplit ?? 0,
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
      intervalRestDistanceMeters: 0,
      splitIntervalType: 0,
      splitIntervalNumber: wireIndex,
    },
  };
}

/** The fixed WAITTOBEGIN bundle the fake sends the instant programming
 *  finishes (design spec §2: "armed" = WAITTOBEGIN) — zeroed progress, no
 *  interval active yet, and no split has ever completed (`lastSplit` is
 *  always `{0, 0}` here — nothing to root it at before the session's own
 *  first interval even starts). */
function armedBundle(): {
  general: GeneralStatus;
  as1: AdditionalStatus1;
  as2: AdditionalStatus2;
} {
  return statusBundle(
    { intervals: [] },
    {
      atMs: 0,
      kind: "status",
      workoutState: WORKOUTSTATE_WAITTOBEGIN,
      elapsedSeconds: 0,
      distanceMeters: 0,
      spm: 0,
      currentSplit: 0,
      heartRateBpm: null,
      programIntervalIndex: 0,
    },
    { elapsedSeconds: 0, distanceMeters: 0 },
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
  // window. Its ack depends on what the machine is HOLDING: rejected when
  // nothing is loaded — the [S1] clean-run narrative, and the common case
  // for a fresh connection — but ACCEPTED when a workout is loaded, which
  // [S2]'s own raw dumps show directly (§19.1's `S2 D2`/`S2 D3` rows).
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
  // acks (`onProgrammingFrameComplete`), flushed by the NEXT `tick()` call
  // (or `deliverArmedNow()`) rather than delivered synchronously — see
  // `tick()`'s own doc comment for why.
  let armedBundlePending = false;

  // What the machine is holding right now (`FakeScript.loadedWorkout`'s own
  // doc comment). REPLACED by each program that lands, never cleared: D1's
  // destructive wipe is withdrawn (interface-notes.md §19.2), and terminate
  // routes to Rearm rather than to an empty slot (§19.5).
  let loadedIntervalCount: number | null =
    script.loadedWorkout?.intervalCount ?? null;

  let linkDown = false;
  let disconnectCb: ((reason: string) => void) | null = null;
  const notifyCbs = new Map<string, Set<(bytes: Uint8Array) => void>>();

  // Cached "current known state" — used by `completeReconnect()` to flush
  // whatever the script has advanced to (possibly skipped ahead while
  // disconnected) as a single fresh notification, per this file's own
  // `tick`/`completeReconnect` doc comments.
  let latestStatus: FakeStatusEvent | null = null;
  let latestBoundary: FakeBoundaryEvent | null = null;
  // The MACHINE's own last-known "where did the current interval start"
  // checkpoint (0x0033's Last Split Time/Distance, fed to every
  // `statusBundle()` call — see that function's own doc comment). Updated
  // in `deliverOrCache` the moment a boundary is PROCESSED, regardless of
  // `linkDown` — the real PM keeps this bookkeeping up to date whether or
  // not the phone is currently connected to hear about it (design spec §4's
  // iOS note), which is exactly what makes the reconnect path's very first
  // post-reconnect status tick already carry the correct value.
  let lastBoundaryCumulative = { elapsedSeconds: 0, distanceMeters: 0 };
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
      lastBoundaryCumulative,
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

  function deliverArmedBundle(): void {
    const { general, as1, as2 } = armedBundle();
    notify(ADDITIONAL_STATUS_2_UUID, buildAdditionalStatus2Bytes(as2));
    notify(ADDITIONAL_STATUS_1_UUID, buildAdditionalStatus1Bytes(as1));
    notify(GENERAL_STATUS_UUID, buildGeneralStatusBytes(general));
    setLatestStatus({
      atMs: virtualClock,
      kind: "status",
      workoutState: WORKOUTSTATE_WAITTOBEGIN,
      elapsedSeconds: 0,
      distanceMeters: 0,
      spm: 0,
      currentSplit: 0,
      heartRateBpm: null,
      programIntervalIndex: 0,
    });
  }

  /** Fix-round 1, F1: the single place `armedBundlePending` is consumed —
   *  called from `tick()` (the normal path) and `deliverArmedNow()` (the
   *  synchronous escape hatch). A no-op when nothing is pending, so both
   *  callers can invoke it unconditionally. */
  function flushArmedIfPending(): void {
    if (!armedBundlePending) return;
    armedBundlePending = false;
    deliverArmedBundle();
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

  /** Called once the prepare step's chunks have all arrived. The ack
   *  depends on the machine's LOAD STATE: rejected with nothing loaded and
   *  ACCEPTED with a workout loaded (§19.1's `S2 D2`/`S2 D3` rows, raw
   *  `f1 01 76 01 13 65 f2` / `f1 81 76 01 13 e5 f2`). The nothing-loaded
   *  refusal is the ONE behaviour here still sourced from the withdrawn
   *  parse — §19.1's `S1 CLEAN RUN 2` row is `NARR-NB`, no byte at all, and
   *  its "rejected — nothing to terminate" label came from the very
   *  whole-byte compare §19.1 overturned. Kept, with that stated:
   *  `FakeScript.loadedWorkout`'s own doc comment has the full reasoning.
   *  Either way the
   *  loaded workout SURVIVES: terminate's documented destination is *Rearm*
   *  — the SAME workout made ready again (§19.5) — which is the whole
   *  reason `program()` cannot treat this step as a clear. Advances into
   *  `"programming"` regardless: the driver sends the program next no
   *  matter which ack it got. `timeoutInjected` short-circuits this exactly
   *  like the other two frame-complete handlers below: the bytes were
   *  already verified correct, but no ack goes out and `phase` does not
   *  advance.
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
    sendAck(
      loadedIntervalCount === null ? "reject" : "ok",
      echoedCommandIds(frame),
    );
    phase = "programming";
    programChunkCursor = 0;
    programFrameCursor = 0;
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
      loadedIntervalCount = script.program.intervals.length;
      // …and the SESSION bookkeeping that belonged to the previous workout
      // goes with it (Task 6 fix round, review MED-2). 0x0033's Last Split
      // Time/Distance is "where the interval currently running began",
      // session-cumulative — a number that means nothing across a workout
      // boundary. Left standing, run 2's very first status frame told the
      // driver its 300s interval had begun at second 300, and
      // `computeRemainingForFrame` dutifully reported 500s remaining of a
      // 300s interval. The cached boundary goes for the same reason: a
      // reconnect early in run 2 would otherwise flush run 1's LAST
      // boundary into run 2 as if it had just happened.
      lastBoundaryCumulative = { elapsedSeconds: 0, distanceMeters: 0 };
      latestBoundary = null;
      // Fix-round 1, F1: withheld until a subsequent `tick()` (or
      // `deliverArmedNow()`) — see `tick()`'s own doc comment for why
      // this is no longer synchronous with the ack itself.
      armedBundlePending = true;
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
   *  whatever the machine last reported.
   *
   *  `latestStatus` CAN be null here, which an earlier version of this
   *  function asserted away: since fix-round 1's F1 the armed bundle is
   *  withheld until the next `tick()`/`deliverArmedNow()`, so a terminate
   *  can legitimately arrive after `phase` became `"armed"` but before any
   *  status has ever gone out. The fallback below is the state the machine
   *  is in at that moment — armed, nothing rowed — not a defensive guess. */
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
    // workout made ready again (§19.5), so the next prepare step acks "ok"
    // rather than the nothing-loaded refusal a fresh connection gets.
    phase = "programming";
    programChunkCursor = 0;
    programFrameCursor = 0;
    const previous: FakeStatusEvent = latestStatus ?? {
      atMs: virtualClock,
      kind: "status",
      workoutState: WORKOUTSTATE_WAITTOBEGIN,
      elapsedSeconds: 0,
      distanceMeters: 0,
      spm: 0,
      currentSplit: 0,
      heartRateBpm: null,
      programIntervalIndex: 0,
    };
    const terminated: FakeStatusEvent = {
      atMs: virtualClock,
      kind: "status",
      workoutState: WORKOUTSTATE_TERMINATE,
      elapsedSeconds: previous.elapsedSeconds,
      distanceMeters: previous.distanceMeters,
      spm: 0,
      currentSplit: previous.currentSplit,
      heartRateBpm: previous.heartRateBpm,
      programIntervalIndex: previous.programIntervalIndex,
    };
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
      setLatestStatus(event);
      if (!linkDown) deliverStatus(event);
    } else {
      latestBoundary = event;
      // The machine's own bookkeeping updates HERE, unconditionally —
      // never gated on `linkDown` (see `lastBoundaryCumulative`'s own
      // comment). This is what a later status tick (live or, after
      // `completeReconnect()`, the very first post-reconnect one) picks up
      // automatically, with no separate reconnect-specific logic needed.
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
      return Promise.resolve();
    },
    // `async` deliberately, even though nothing inside ever awaits
    // anything: `assertProgrammingChunk`/`assertArmedChunk` THROW
    // synchronously on a byte mismatch (this is the "asserts, not
    // accepts" behaviour design spec §4 requires), and only an `async`
    // function automatically turns a synchronous throw into a REJECTED
    // promise — `Transport.write` is typed `Promise<void>`, and a caller
    // doing `await t.write(...)` must see a rejection, not an uncaught
    // synchronous exception escaping the `await` expression itself.
    async write(characteristicId: string, bytes: Uint8Array): Promise<void> {
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
    },
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
      // Fix-round 1, F1: flush a pending armed delivery BEFORE any due
      // scripted event, so a script's own first timeline entry is never
      // delivered "ahead of" the session actually arming.
      flushArmedIfPending();
      runDueEvents();
    },
    deliverArmedNow(): void {
      flushArmedIfPending();
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
  };
}
