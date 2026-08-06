// The PM5 programming/terminate/sample-rate command sequences: WorkoutProgram
// (Task 2's IR) -> ordered, pre-chunked CSAFE frames ready for a transport's
// ack-gated writes.
//
// Every command ID, byte layout, and worked-example value here cites
// docs/monitor/pm5-interface-notes.md §11-13 (CSAFE Communication
// Definition rev 0.27, pp.68-89) and §4 (BLE Interface Definition rev 1.30,
// p.16, for the sample-rate characteristic). Multi-byte command fields are
// MSB-first (big-endian) — the OPPOSITE byte order from `pm5/parse.ts`'s
// status reads (little-endian); see interface-notes.md §10's note on this.
//
// domain/monitor/** imports nothing from src/.

import type { ProgramInterval, WorkoutProgram } from "../program.js";
import { chunkFrames, packPayload } from "./framer.js";

/** C2 proprietary command wrapper (interface-notes.md §7/§11, §12). Each
 *  emitted CSAFE frame gets its OWN `0x76` wrapper around just the commands
 *  placed in that frame — confirmed a per-frame element, not a
 *  once-per-program header, by the Terminate Workout example (§13), which
 *  wraps a single unrelated command in its own `76 04`. */
const PROPRIETARY_WRAPPER = 0x76;

/** `CSAFE_PM_SET_WORKOUTTYPE` (interface-notes.md §11). */
const SET_WORKOUTTYPE = 0x01;
/** `WORKOUTTYPE_VARIABLE_INTERVAL` (BLE doc Appendix A `OBJ_WORKOUTTYPE_T`,
 *  ordinal 8 — confirmed against §12's worked example byte `0x08`).
 *  `compileProgram`'s output always has concrete (never "undefined") rest
 *  values, so this is the only workout type `buildProgrammingSequence`
 *  ever emits — never the undefined-rest sibling type. */
const WORKOUTTYPE_VARIABLE_INTERVAL = 0x08;

/** `CSAFE_PM_SET_INTERVALTYPE` (interface-notes.md §11). */
const SET_INTERVALTYPE = 0x17;
const INTERVALTYPE_TIME = 0x00;
const INTERVALTYPE_DIST = 0x01;

/** `CSAFE_PM_SET_WORKOUTDURATION` (interface-notes.md §11). */
const SET_WORKOUTDURATION = 0x03;
const WORKOUT_DURATION_IDENTIFIER_TIME = 0x00;
const WORKOUT_DURATION_IDENTIFIER_DISTANCE = 0x80;
/** 0.01 sec/lsb — confirmed by §12's worked example (`3:00` = 180 s encodes
 *  as raw `18000`). Distance duration has NO scale (whole meters, confirmed
 *  by the same example: `500m` encodes as raw `500`). */
const WORKOUT_DURATION_TIME_SCALE = 100;

/** `CSAFE_PM_SET_RESTDURATION` (interface-notes.md §11). Whole seconds —
 *  NOT the 0.01 sec/lsb scale `pm5/parse.ts`'s READ-side "Rest Time" field
 *  uses (interface-notes.md §10's 0x0032 table) — a second, independent
 *  write/read scale mismatch alongside 0x0038's own read-side pace-scale
 *  trap (§10's 0x0038 table: 0.1 vs 0.01 sec/lsb; final-review M-10 —
 *  corrected from a prior misdirected "§15 #2" citation, which is the
 *  unrelated heartrate-sentinel ambiguity). Confirmed by §12's worked
 *  example (`1:00` = 60 s encodes as raw `60`). */
const SET_RESTDURATION = 0x04;

/** `CSAFE_PM_SET_TARGETPACETIME` (interface-notes.md §11). 0.01 sec/lsb per
 *  500 m — confirmed by §12's worked example (`1:40` = 100 s encodes as raw
 *  `10000`). */
const SET_TARGETPACETIME = 0x06;
const TARGET_PACE_SCALE = 100;
/** No worked example programs a target-less interval (every one has a real
 *  pace). Since every interval block is a fixed shape (interface-notes.md
 *  §12), a `null` `targetSplit` (warmup/effort/test intervals,
 *  `program.ts`'s own doc comment) is sent as pace time zero — an
 *  assumption flagged for the laptop session, interface-notes.md §15 #3,
 *  not a confirmed "no target" sentinel. */
const NO_TARGET_PACE_SECONDS = 0;

/** `CSAFE_PM_CONFIGURE_WORKOUT` (interface-notes.md §11). Sent after EVERY
 *  interval in §12's worked example, not only the last. */
const CONFIGURE_WORKOUT = 0x14;
const PROGRAMMING_MODE_ENABLE = 0x01;

/** `CSAFE_PM_SET_WORKOUTINTERVALCOUNT` (interface-notes.md §11). Confirmed
 *  0-based during programming by §12's worked example (`00` annotated
 *  "Interval #1"). */
const SET_WORKOUTINTERVALCOUNT = 0x18;

/** `CSAFE_PM_SET_SCREENSTATE` (interface-notes.md §11, §13). Screen Type
 *  ordinal 1 = `SCREENTYPE_WORKOUT` (the doc's own inline comment misprints
 *  this as ordinal 0 — interface-notes.md §11 explains why the ordinal,
 *  confirmed by both worked examples' actual wire bytes, is trusted over
 *  the printed comment). */
const SET_SCREENSTATE = 0x13;
const SCREENTYPE_WORKOUT = 0x01;
const SCREENVALUEWORKOUT_PREPARETOROWWORKOUT = 0x01;
const SCREENVALUEWORKOUT_TERMINATEWORKOUT = 0x02;

/** Fastest documented C2 rowing status sample rate (interface-notes.md §4,
 *  BLE doc p.16: `0`=1 s, `1`=500 ms default, `2`=250 ms, `3`=100 ms).
 *  `src/monitor/driver.ts` writes this to `uuids.ts`'s `SAMPLE_RATE_UUID` at
 *  connect — the 500 ms default is too coarse for a live countdown. */
const FASTEST_SAMPLE_RATE = 0x03;

/** Thrown by `be16`/`be32` when a value cannot be safely encoded onto the
 *  wire (final-review M-9). Every value that reaches either encoder today
 *  is already a validated non-negative integer — `program.ts`'s own
 *  representability checks guarantee this for `value`/`restSeconds`/
 *  `targetSplit`, the only three fields `buildIntervalBlock` ever encodes —
 *  but `buildProgrammingSequence` accepts ANY caller-constructed
 *  `WorkoutProgram`, not only one that passed through `compileProgram`:
 *  `monitorRun.ts`'s own header comment names `loadMonitorRun` as only a
 *  SHALLOW shape validator of a persisted program (7B's eventual replay
 *  path), never a field-level one. Without this guard, `>>>`'s own
 *  ToUint32 conversion would silently TRUNCATE a fractional or
 *  out-of-range value rather than reject it — this makes that failure loud
 *  and typed instead of a silently wrong byte on the wire. */
export class Pm5EncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Pm5EncodeError";
  }
}

function assertEncodable(value: number, maxValue: number): void {
  if (!Number.isInteger(value) || value < 0 || value > maxValue) {
    throw new Pm5EncodeError(
      `pm5/commands: ${value} cannot be encoded onto the wire — must be an integer between 0 and ${maxValue}`,
    );
  }
}

function be16(value: number): [number, number] {
  assertEncodable(value, 0xffff);
  return [(value >> 8) & 0xff, value & 0xff];
}

function be32(value: number): [number, number, number, number] {
  assertEncodable(value, 0xffffffff);
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

/**
 * One interval's command block (interface-notes.md §12): `SET_
 * WORKOUTINTERVALCOUNT` (this interval's 0-based index), `SET_WORKOUTTYPE`
 * (interval 0 ONLY — a workout-level property the worked example sets once),
 * `SET_INTERVALTYPE`, `SET_WORKOUTDURATION`, `SET_RESTDURATION`, `SET_
 * TARGETPACETIME`, `CONFIGURE_WORKOUT`. Exactly 26 bytes for `index > 0`,
 * 29 bytes for `index === 0` (the extra `SET_WORKOUTTYPE`) — matching the
 * design spec's "26 bytes/interval" fact and interface-notes.md §12's
 * byte-for-byte transcription. Treated as ONE atomic packing unit by
 * `buildFrameGroups` below — see that function's own comment for why this
 * is stricter than the document's literal per-command rule.
 */
function buildIntervalBlock(
  interval: ProgramInterval,
  index: number,
): Uint8Array {
  const bytes: number[] = [];
  bytes.push(SET_WORKOUTINTERVALCOUNT, 0x01, index);
  if (index === 0) {
    bytes.push(SET_WORKOUTTYPE, 0x01, WORKOUTTYPE_VARIABLE_INTERVAL);
  }
  bytes.push(
    SET_INTERVALTYPE,
    0x01,
    interval.kind === "time" ? INTERVALTYPE_TIME : INTERVALTYPE_DIST,
  );

  const durationIdentifier =
    interval.kind === "time"
      ? WORKOUT_DURATION_IDENTIFIER_TIME
      : WORKOUT_DURATION_IDENTIFIER_DISTANCE;
  const durationValue =
    interval.kind === "time"
      ? interval.value * WORKOUT_DURATION_TIME_SCALE
      : interval.value;
  bytes.push(
    SET_WORKOUTDURATION,
    0x05,
    durationIdentifier,
    ...be32(durationValue),
  );

  bytes.push(SET_RESTDURATION, 0x02, ...be16(interval.restSeconds));

  const paceSeconds = interval.targetSplit ?? NO_TARGET_PACE_SECONDS;
  bytes.push(
    SET_TARGETPACETIME,
    0x04,
    ...be32(paceSeconds * TARGET_PACE_SCALE),
  );

  bytes.push(CONFIGURE_WORKOUT, 0x01, PROGRAMMING_MODE_ENABLE);

  return Uint8Array.from(bytes);
}

/** `SET_SCREENSTATE` command, 4 bytes: `13 02 <type> <value>`
 *  (interface-notes.md §11-13). A separate atomic unit from the interval
 *  blocks — an independent CSAFE command, not part of any interval's own
 *  shape. */
function buildScreenState(value: number): Uint8Array {
  return Uint8Array.from([SET_SCREENSTATE, 0x02, SCREENTYPE_WORKOUT, value]);
}

/** Wraps `units` (already-concatenated atomic command bytes destined for
 *  ONE CSAFE frame) in the `0x76` proprietary wrapper: `76 <byte count>
 *  ...units`. The wrapper byte count fits in one byte for anything this
 *  module builds (max 255) — never the binding constraint, since the
 *  120-byte CSAFE frame cap (enforced by `packPayload`) is always smaller. */
function wrapProprietary(units: Uint8Array[]): Uint8Array {
  const totalLength = units.reduce((sum, u) => sum + u.length, 0);
  const wrapped = new Uint8Array(2 + totalLength);
  wrapped[0] = PROPRIETARY_WRAPPER;
  wrapped[1] = totalLength;
  let offset = 2;
  for (const unit of units) {
    wrapped.set(unit, offset);
    offset += unit.length;
  }
  return wrapped;
}

/** True if wrapping `units` together would still fit in a single CSAFE
 *  frame post-stuffing. Reuses `packPayload` itself as the ground truth for
 *  "fits in one frame" (Task 1's own stuffing-budget arithmetic) rather
 *  than re-deriving it here — whatever `packPayload` considers splittable
 *  into exactly one frame is definitionally correct. */
function fitsInOneFrame(units: Uint8Array[]): boolean {
  return packPayload(wrapProprietary(units)).length <= 1;
}

/**
 * Groups atomic command units into CSAFE frame payloads, never splitting a
 * unit across a frame boundary — the command-boundary-alignment obligation
 * (interface-notes.md §3/§12; Task 1's M4 finding). `packPayload` is
 * deliberately command-agnostic (it only enforces the byte budget); THIS
 * function is what feeds it payloads that already end on a safe boundary,
 * one group (one `0x76`-wrapped payload) per resulting frame. Each unit is
 * an interval's full block (26 or 29 bytes) or the trailing `SET_
 * SCREENSTATE` (4 bytes) — treating the whole interval block as atomic is
 * STRICTER than the document's literal rule (which only forbids splitting
 * a single CSAFE command, not a whole interval's six commands) but
 * guarantees the finer rule for free: never splitting a 26-byte block
 * trivially never splits the smaller commands inside it.
 *
 * Requires `units` to be non-empty — both call sites guarantee this
 * (`buildProgrammingSequence` always appends the trailing `SET_SCREENSTATE`
 * unit regardless of interval count; `buildTerminate` always passes exactly
 * one unit), so `current` always holds at least the final unit by the time
 * the loop ends and is pushed unconditionally, rather than guarding against
 * an empty-`units` case neither caller can produce.
 *
 * M-4 (final-review) — multi-frame retention, interface-notes.md §15 #6:
 * splitting `units` across several ack-gated frames like this ASSUMES the
 * PM accumulates interval configuration across every separately-acked
 * frame it takes to program a workout. Every worked example in both source
 * documents is a SINGLE CSAFE frame; nothing in either describes what the
 * PM does with configuration state across multiple frames. Sea Smoke (the
 * design spec's own 25-interval stress case) needs 7 frames under this
 * packing — an interval count and frame count neither document ever
 * exercises even once. This is the single fact the whole codec is LEAST
 * confident about; it is first on the laptop session's list
 * (interface-notes.md §17 item 5).
 */
function buildFrameGroups(units: Uint8Array[]): Uint8Array[][] {
  const groups: Uint8Array[][] = [];
  let current: Uint8Array[] = [units[0]!];

  for (const unit of units.slice(1)) {
    const candidate = [...current, unit];
    if (!fitsInOneFrame(candidate)) {
      groups.push(current);
      current = [unit];
    } else {
      current = candidate;
    }
  }
  groups.push(current);

  return groups;
}

/** Packs one frame group into its chunked wire form: wrap -> `packPayload`
 *  -> `chunkFrames` for the BLE write budget. `buildFrameGroups` only ever
 *  closes a group once `fitsInOneFrame` (which itself calls `packPayload`)
 *  has confirmed it packs to exactly one frame, so the non-null assertion
 *  below trusts that invariant rather than re-asserting it with a runtime
 *  branch that could never be exercised without breaking that invariant
 *  first. */
function packGroup(units: Uint8Array[]): Uint8Array[] {
  const [frame] = packPayload(wrapProprietary(units));
  return chunkFrames([frame!]);
}

/**
 * The full variable-interval programming sequence for `p`
 * (interface-notes.md §12): one atomic unit per interval (each interval's
 * `SET_WORKOUTINTERVALCOUNT`/[`SET_WORKOUTTYPE`]/`SET_INTERVALTYPE`/`SET_
 * WORKOUTDURATION`/`SET_RESTDURATION`/`SET_TARGETPACETIME`/`CONFIGURE_
 * WORKOUT` block) plus the trailing `SET_SCREENSTATE`(PREPARETOROWWORKOUT)
 * unit, packed into as many CSAFE frames as the 120-byte budget requires
 * (never splitting a unit across a frame — `buildFrameGroups`), each frame
 * pre-chunked to the BLE write budget (`chunkFrames`, <=20 bytes). The
 * outer array is the ordered, ack-gated write sequence a driver (a later
 * task) sends frame by frame; the inner array is that frame's chunks.
 *
 * M-4 (final-review) — no wipe/reset step, interface-notes.md §15 #7: this
 * function sends only the intervals `p` names, with no leading "clear the
 * PM's prior program" command of any kind. That is not an oversight —
 * NO such command exists in the documented proprietary programming flow
 * (CSAFE Communication Definition rev 0.27, §11-13): `CSAFE_RESET_CMD`/
 * `CSAFE_GOIDLE_CMD` are PUBLIC CSAFE only, and the document explicitly
 * says public and proprietary modes "should not be mixed". Consequence:
 * re-programming with FEWER intervals than a previously-loaded program
 * (e.g. 4 after a prior 25) has no documented mechanism to clear the
 * stale tail — intervals 5-25 may remain configured on the PM after this
 * function finishes sending only 4. Flagged for the laptop session
 * (interface-notes.md §17 item 6), alongside the multi-frame-retention
 * assumption `buildFrameGroups` makes just above.
 *
 * UPDATE (plan Task 2, post-hardware): `src/monitor/driver.ts`'s `program()`
 * now sends `buildTerminate()` as a best-effort clear immediately before
 * this sequence — but hardware proved that command is NOT a confirmed
 * clear (interface-notes.md §18, progress.md's D1 update: a terminate was
 * accepted once with a workout loaded and the following program was still
 * rejected, twice). The stale-tail risk described above is therefore only
 * ATTEMPTED against, not resolved; `program()`'s own verification phase is
 * what actually decides whether the resulting workout matches what was
 * sent, from the machine's reported "armed" state, not from this function's
 * own byte-level guarantees.
 *
 * CORRECTION (2026-08-06, interface-notes.md §19.1/§19.5): the "rejected,
 * twice" evidence above was TWO ACCEPTANCES — `response.ts` mis-parses the
 * CSAFE status byte (`0x81` is toggle-high/prev-OK/Ready, an accept), and
 * no genuine rejection was ever seen on this hardware. The CONCLUSION is
 * unchanged and is now DOCUMENTED rather than inferred: no command clears a
 * loaded workout, and terminate is not one, because terminate routes to
 * *Rearm* — Concept2's own word for making the SAME workout ready again
 * (CSAFE-DEF Appendix E; `WORKOUTSTATE_REARM` 13,
 * `SCREENVALUEWORKOUT_REARMWORKOUT` 3). Also corrected: the paragraph above
 * says "NO such command exists in the documented proprietary programming
 * flow" — still true, but two candidates were never tried,
 * `CSAFE_RESET_CMD` (`0x81` as a COMMAND, unrelated to the status byte of
 * the same value) and `SCREENVALUEWORKOUT_GOTOMAINSCREEN` (6);
 * `CSAFE_PM_SET_RESET_ALL` (`0xE0`) is `<Not implemented>` and is NOT one.
 */
export function buildProgrammingSequence(p: WorkoutProgram): Uint8Array[][] {
  const units = p.intervals.map((interval, index) =>
    buildIntervalBlock(interval, index),
  );
  units.push(buildScreenState(SCREENVALUEWORKOUT_PREPARETOROWWORKOUT));

  return buildFrameGroups(units).map(packGroup);
}

/**
 * The documented terminate command (interface-notes.md §13, CSAFE doc
 * p.89): a single `SET_SCREENSTATE`(TERMINATEWORKOUT) command in its own
 * `0x76` wrapper — one frame, pre-chunked. Returns the same `Uint8Array[][]`
 * shape as `buildProgrammingSequence` (always length 1) so a driver can
 * send either with identical ack-gated looping logic.
 *
 * Also reused by `src/monitor/driver.ts`'s `program()` as its best-effort
 * "clear" step (plan Task 2) — NOT because this is confirmed to clear a
 * loaded workout, but because it is the closest documented command to one.
 * Laptop-session hardware proved it is NOT a reliable clear: `terminate()`
 * was ACCEPTED once with a completed workout loaded, and the FOLLOWING
 * program was still rejected — twice (interface-notes.md §18, progress.md's
 * D1 update). The real clear command, if one exists, remains unidentified.
 *
 * CORRECTION (2026-08-06, interface-notes.md §19.1/§19.5/§19.6): the
 * "rejected — twice" evidence was two ACCEPTS (`response.ts` mis-parses the
 * status bitfield). Terminate still does not clear, for a documented
 * reason: it routes to *Rearm*, which re-arms the SAME workout. Two further
 * facts this comment should carry — the ack for a `SET_SCREENSTATE` means
 * "queued", not "done" (CSAFE-DEF p.65; poll
 * `CSAFE_PM_GET_SCREENSTATESTATUS` until `_INACTIVE`), which the driver's
 * terminate and clear steps both currently ignore; and after a workout
 * completes the PM parks in `WorkoutLogged` and keeps answering, leaving
 * only on a Menu press or a terminate command (Appendix E) — the recovery
 * path we were not using.
 */
export function buildTerminate(): Uint8Array[][] {
  const unit = buildScreenState(SCREENVALUEWORKOUT_TERMINATEWORKOUT);
  return buildFrameGroups([unit]).map(packGroup);
}

/** `CSAFE_PM_GET_ERRORTYPE` (`0xC8`, csafe.h:513) — sent once by
 *  `src/monitor/driver.ts` after a genuine reject during a programming
 *  send to learn WHY (interface-notes.md §19.7, CSAFE-DEF p.50: "the
 *  Master must issue a PM-specific GetErrorType command to determine the
 *  specific error information" — a reject is not self-describing).
 *
 *  Wrapped under `0x1A` (`CSAFE_SETUSERCFG1_CMD`), NOT this file's usual
 *  `0x76` push wrapper — matching CSAFE-DEF's own worked "Get Force Curve"
 *  example (`F1 1A 01 BF A4 F2`, interface-notes.md §6 example 13) and our
 *  own R3 conformance vector (`pm5/response.ts`). This is a genuine,
 *  UNRESOLVED conflict between the two source documents, cited here at the
 *  definition because it belongs to the byte choice, not to any one
 *  caller: csafe.h's own four-wrapper partitioning
 *  (interface-notes.md §19.11 — `0x76`/`0x77`/`0x7E`/`0x7F`, one push/pull
 *  pair per command family) implies a GET command's wrapper should be
 *  `0x7F` (`CSAFE_GETPMCFG_CMD`, the read counterpart of `0x76`'s
 *  `CSAFE_SETPMCFG_CMD`), while every documented worked GET example uses
 *  `0x1A` instead. We follow the document's own worked bytes over the
 *  header's inferred partitioning. Settling which is actually right on the
 *  wire needs one hardware GET — interface-notes.md §17's pull-path item,
 *  which this function's own caller deliberately does not need an answer
 *  to yet (`src/monitor/driver.ts` logs the reply as raw hex only, never a
 *  claimed meaning).
 *
 *  Payload `[0x1A, 0x01, 0xC8]` (topOpcode, one echoed-opcode count, the
 *  opcode itself) -> frame `f1 1a 01 c8 d3 f2`
 *  (checksum `0x1A ^ 0x01 ^ 0xC8 = 0xD3`). Six bytes, always a single BLE
 *  chunk — no `buildFrameGroups`/`packGroup` needed, unlike the multi-unit
 *  sequences above.
 */
const GET_WRAPPER = 0x1a;
const GET_ERRORTYPE = 0xc8;

export function buildGetErrorType(): Uint8Array {
  const payload = Uint8Array.from([GET_WRAPPER, 0x01, GET_ERRORTYPE]);
  const [frame] = packPayload(payload);
  return frame!;
}

/**
 * The general/additional-status sample-rate characteristic's write value,
 * set to the fastest documented rate (interface-notes.md §4, BLE doc p.16).
 * This is NOT a CSAFE command — `0x0034` is a plain 1-byte BLE
 * characteristic, written directly (bypassing the CSAFE control
 * characteristic and its frame/chunk machinery entirely), so this returns
 * the raw byte rather than `Uint8Array[][]`.
 */
export function buildSampleRateConfig(): Uint8Array {
  return Uint8Array.from([FASTEST_SAMPLE_RATE]);
}
