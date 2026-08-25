// The PM5 status characteristics (0x0031/0x0032/0x0033/0x0037/0x0038) ->
// RawPm5Status -> MonitorFrame / IntervalActual.
//
// Every offset and scale here cites docs/monitor/pm5-interface-notes.md §10
// (BLE Interface Definition rev 1.30, pp.13-20) unless noted per field; the
// WORKOUTSTATE mapping cites interface-notes.md §14. Multi-byte status
// fields are little-endian (Lo/Mid/High or Lo/Hi in ascending byte order) —
// the OPPOSITE byte order from `pm5/commands.ts`'s CSAFE command writes,
// which are MSB-first; see interface-notes.md §10's note on this.
//
// domain/monitor/** imports nothing from src/.

import type { IntervalActual, MonitorFrame } from "../types.js";

/** BLE doc p.14: "Heartrate (bpm, 255=invalid)". Applied by this module to
 *  every single-byte heart-rate field, including 0x0038's Work/Rest
 *  Heartrate bytes, which have no explicit sentinel of their own
 *  (interface-notes.md §15 #2 — an analogy, not an independently confirmed
 *  fact for that characteristic). */
const HEARTRATE_INVALID = 255;

/**
 * D5 (interface-notes.md §18, PM5 432331249, 2026-08-05): the machine sent
 * `0`, NOT the documented `255`, on 0x0038's Work Heartrate byte with no
 * belt paired — an `avgHeartRateBpm: 0` reached `IntervalActual` and would
 * have been logged by 7C as a real reading of zero beats per minute.
 *
 * §15 #2 is DOUBLE-EDGED here, and both edges belong in the citation. It
 * records that 0x0039's Recovery Heart Rate (BLE doc p.21) is explicitly
 * documented "(zero = not valid data)" — a zero sentinel really does exist
 * in this characteristic family, which is what made the observation above
 * predictable. But the SAME note records why that is only suggestive: the
 * document's "invalid" convention is PER-FIELD, so 0x0039's rule is no more
 * evidence about 0x0032's or 0x0038's than 0x0032's documented `255` was
 * evidence about 0x0038's.
 *
 * Neither edge decides it. The deciding argument is FIELD-INDEPENDENT: no
 * heart-rate field on this machine can carry a true `0` — a rower producing
 * zero beats per minute is not a rower — and `255` is equally unreachable.
 * `heartRate()` therefore maps BOTH bytes to `null`, and can never discard
 * a genuine measurement doing so, whereas passing either through fabricates
 * a plausible-looking number for someone who simply wasn't wearing a belt.
 * That argument holds for every heart-rate field this module decodes —
 * exactly three: 0x0032's live Heartrate, and 0x0038's Work and Rest
 * averages — so all three get it, not by generalizing the one observation
 * but because the same reasoning covers each of them on its own.
 *
 * `src/monitor/transports/fake.ts` emits this same byte for a beltless
 * session, so the end-to-end path is exercised in CI.
 */
export const HEARTRATE_NO_BELT = 0;

function readU8(bytes: Uint8Array, offset: number): number {
  return bytes[offset]!;
}

/** Little-endian 16-bit read (status characteristics list these fields
 *  "Lo, Hi" in ascending byte order — interface-notes.md §10). */
function readU16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

/** Little-endian 24-bit read (status characteristics list these fields
 *  "Lo, Mid, High" in ascending byte order — interface-notes.md §10). */
function readU24LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
  );
}

function heartRate(byte: number): number | null {
  // BOTH sentinels — see `HEARTRATE_NO_BELT`'s own doc comment (D5).
  return byte === HEARTRATE_INVALID || byte === HEARTRATE_NO_BELT ? null : byte;
}

/**
 * M3 (fix round after Task 3's first review): without a length check, a
 * too-short `bytes` array (e.g. a 3-byte notification where a 19-byte one
 * was expected) silently decoded as "valid" data — every out-of-range
 * index reads `undefined`, and `undefined` for an enum field like
 * `workoutState` fell through `toMonitorFrame`'s `?? "idle"` fallback,
 * indistinguishable from a genuine idle frame. Every one of the five parse
 * functions below checks its characteristic's documented byte count FIRST
 * and returns this typed error instead of decoding garbage —
 * `src/monitor/driver.ts` logs it, giving the signal a silent `undefined`
 * never could.
 */
export interface Pm5ParseError {
  characteristic: "0x0031" | "0x0032" | "0x0033" | "0x0037" | "0x0038";
  expected: number;
  actual: number;
}

function checkLength(
  bytes: Uint8Array,
  expected: number,
  characteristic: Pm5ParseError["characteristic"],
): { error: Pm5ParseError } | null {
  return bytes.length < expected
    ? { error: { characteristic, expected, actual: bytes.length } }
    : null;
}

/** 0x0031 — C2 rowing general status, 19 bytes (interface-notes.md §10). */
export interface GeneralStatus {
  elapsedSeconds: number;
  distanceMeters: number;
  workoutType: number;
  intervalType: number;
  workoutState: number;
  rowingState: number;
  strokeState: number;
  totalWorkDistanceMeters: number;
  /** Raw, unscaled: 0.01 sec/lsb only if `workoutDurationType` is Time —
   *  undocumented for the other three duration types, so this module
   *  reports it unscaled rather than guessing (interface-notes.md §10). */
  workoutDurationRaw: number;
  workoutDurationType: number;
  dragFactor: number;
}

export function parseGeneralStatus(
  bytes: Uint8Array,
): GeneralStatus | { error: Pm5ParseError } {
  const lengthError = checkLength(bytes, 19, "0x0031");
  if (lengthError) return lengthError;
  return {
    elapsedSeconds: readU24LE(bytes, 0) / 100,
    distanceMeters: readU24LE(bytes, 3) / 10,
    workoutType: readU8(bytes, 6),
    intervalType: readU8(bytes, 7),
    workoutState: readU8(bytes, 8),
    rowingState: readU8(bytes, 9),
    strokeState: readU8(bytes, 10),
    totalWorkDistanceMeters: readU24LE(bytes, 11),
    workoutDurationRaw: readU24LE(bytes, 14),
    workoutDurationType: readU8(bytes, 17),
    dragFactor: readU8(bytes, 18),
  };
}

/** 0x0032 — C2 rowing additional status 1, 17 bytes (interface-notes.md
 *  §10). */
export interface AdditionalStatus1 {
  elapsedSeconds: number;
  speedMetersPerSecond: number;
  spm: number;
  heartRateBpm: number | null;
  currentSplit: number;
  averageSplit: number;
  restDistanceMeters: number;
  restSeconds: number;
  ergMachineType: number;
}

export function parseAdditionalStatus1(
  bytes: Uint8Array,
): AdditionalStatus1 | { error: Pm5ParseError } {
  const lengthError = checkLength(bytes, 17, "0x0032");
  if (lengthError) return lengthError;
  return {
    elapsedSeconds: readU24LE(bytes, 0) / 100,
    speedMetersPerSecond: readU16LE(bytes, 3) / 1000,
    spm: readU8(bytes, 5),
    heartRateBpm: heartRate(readU8(bytes, 6)),
    currentSplit: readU16LE(bytes, 7) / 100,
    averageSplit: readU16LE(bytes, 9) / 100,
    restDistanceMeters: readU16LE(bytes, 11),
    restSeconds: readU24LE(bytes, 13) / 100,
    ergMachineType: readU8(bytes, 16),
  };
}

/** 0x0033 — C2 rowing additional status 2, 20 bytes (interface-notes.md
 *  §10). */
export interface AdditionalStatus2 {
  elapsedSeconds: number;
  /** Raw `CSAFE_PM_GET_WORKOUTINTERVALCOUNT` read-back value — base
   *  (0- vs 1-based) unconfirmed, interface-notes.md §15 #1. */
  intervalCount: number;
  averagePowerWatts: number;
  totalCalories: number;
  splitAvgPace: number;
  splitAvgPowerWatts: number;
  splitAvgCalories: number;
  lastSplitTimeSeconds: number;
  lastSplitDistanceMeters: number;
}

export function parseAdditionalStatus2(
  bytes: Uint8Array,
): AdditionalStatus2 | { error: Pm5ParseError } {
  const lengthError = checkLength(bytes, 20, "0x0033");
  if (lengthError) return lengthError;
  return {
    elapsedSeconds: readU24LE(bytes, 0) / 100,
    intervalCount: readU8(bytes, 3),
    averagePowerWatts: readU16LE(bytes, 4),
    totalCalories: readU16LE(bytes, 6),
    splitAvgPace: readU16LE(bytes, 8) / 100,
    splitAvgPowerWatts: readU16LE(bytes, 10),
    splitAvgCalories: readU16LE(bytes, 12),
    lastSplitTimeSeconds: readU24LE(bytes, 14) / 100,
    lastSplitDistanceMeters: readU24LE(bytes, 17),
  };
}

/** 0x0037 — C2 rowing split/interval data, 18 bytes (interface-notes.md
 *  §10). */
export interface SplitIntervalData {
  elapsedSeconds: number;
  distanceMeters: number;
  splitIntervalTimeSeconds: number;
  /** Whole meters (1 m/lsb) — NOT the 0.1 m/lsb scale of `distanceMeters`
   *  three fields up, in this SAME characteristic (interface-notes.md
   *  §10's explicit trap). */
  splitIntervalDistanceMeters: number;
  intervalRestTimeSeconds: number;
  intervalRestDistanceMeters: number;
  splitIntervalType: number;
  /** Raw Split/Interval Number — same base ambiguity as
   *  `AdditionalStatus2.intervalCount`, interface-notes.md §15 #1. */
  splitIntervalNumber: number;
}

export function parseSplitIntervalData(
  bytes: Uint8Array,
): SplitIntervalData | { error: Pm5ParseError } {
  const lengthError = checkLength(bytes, 18, "0x0037");
  if (lengthError) return lengthError;
  return {
    elapsedSeconds: readU24LE(bytes, 0) / 100,
    distanceMeters: readU24LE(bytes, 3) / 10,
    splitIntervalTimeSeconds: readU24LE(bytes, 6) / 10,
    splitIntervalDistanceMeters: readU24LE(bytes, 9),
    intervalRestTimeSeconds: readU16LE(bytes, 12),
    intervalRestDistanceMeters: readU16LE(bytes, 14),
    splitIntervalType: readU8(bytes, 16),
    splitIntervalNumber: readU8(bytes, 17),
  };
}

/** 0x0038 — C2 rowing additional split/interval data, 19 bytes
 *  (interface-notes.md §10). */
export interface AdditionalSplitIntervalData {
  elapsedSeconds: number;
  splitIntervalAvgStrokeRate: number;
  splitIntervalWorkHeartRateBpm: number | null;
  splitIntervalRestHeartRateBpm: number | null;
  /** 0.1 sec/lsb — genuinely DIFFERENT from 0x0032/0x0033's pace fields
   *  (0.01 sec/lsb), printed identically in both copies of this
   *  characteristic's table (interface-notes.md §10). The trap this task
   *  was explicitly briefed to watch for. */
  splitIntervalAvgPace: number;
  splitIntervalTotalCalories: number;
  splitIntervalAvgCalories: number;
  splitIntervalSpeedMetersPerSecond: number;
  splitIntervalPowerWatts: number;
  splitAvgDragFactor: number;
  splitIntervalNumber: number;
  ergMachineType: number;
}

export function parseAdditionalSplitIntervalData(
  bytes: Uint8Array,
): AdditionalSplitIntervalData | { error: Pm5ParseError } {
  const lengthError = checkLength(bytes, 19, "0x0038");
  if (lengthError) return lengthError;
  return {
    elapsedSeconds: readU24LE(bytes, 0) / 100,
    splitIntervalAvgStrokeRate: readU8(bytes, 3),
    splitIntervalWorkHeartRateBpm: heartRate(readU8(bytes, 4)),
    splitIntervalRestHeartRateBpm: heartRate(readU8(bytes, 5)),
    splitIntervalAvgPace: readU16LE(bytes, 6) / 10,
    splitIntervalTotalCalories: readU16LE(bytes, 8),
    splitIntervalAvgCalories: readU16LE(bytes, 10),
    splitIntervalSpeedMetersPerSecond: readU16LE(bytes, 12) / 1000,
    splitIntervalPowerWatts: readU16LE(bytes, 14),
    splitAvgDragFactor: readU8(bytes, 16),
    splitIntervalNumber: readU8(bytes, 17),
    ergMachineType: readU8(bytes, 18),
  };
}

/**
 * 0x0039 — C2 rowing end of workout summary data, 20 bytes
 * (interface-notes.md §23). Decodes 0x0039 ONLY — the fast-follow design
 * spec's I5 ruling: "all needed fields ride 0x0039; pair-gating on 0x003A
 * would recreate the drop fragility" the split path already suffers.
 * 0x003A carries fields 0x0039 had no room left for (§23's own 20-byte
 * ceiling note) and has no dedicated parser here; a later task adds one
 * only if the reconciliation gate ever needs one of its fields.
 *
 * Log Entry Date/Time (0x0039 offsets 0-3) are NOT decoded: the doc states
 * no bit-packing format for them on this page (§23), and this module's own
 * practice for an unscaled/unstated field is to omit or report it raw
 * rather than guess (`workoutDurationRaw` above is the precedent) — no
 * caller needs either field yet.
 *
 * Every heart-rate field reuses `heartRate()` (255-and-0-both-null, D5's
 * field-independent reasoning above) including Recovery Heart Rate, even
 * though the document states only the `0` sentinel for that one field
 * (§23): D5's argument is that no heart-rate field on this real machine
 * ever carries a genuine `0` or `255`, so the convention is deliberately
 * uniform across every field this parser touches, documented sentinel or
 * analogy alike.
 */
export interface WorkoutSummary {
  /** Deliberately named WITHOUT a "total"/"session" prefix — this
   *  codebase reserves those words for a CONFIRMED accumulated reading
   *  (`GeneralStatus.elapsedSeconds`/`distanceMeters` above are neutral
   *  for the identical reason: hardware walk 4 proved 0x0031's own
   *  identically-scaled, identically-named fields PER-INTERVAL, not
   *  cumulative, and `driver.ts`'s `sessionElapsedSeconds`/
   *  `sessionDistanceMeters` only earns the "session" word once its own
   *  accumulator has done the summing). Whether THIS field is genuinely a
   *  whole-workout total is UNCONFIRMED on the wire (§23 walk item 2) —
   *  a "total"-prefixed name would assert what the walk hasn't. */
  elapsedSeconds: number;
  /** Same unconfirmed-cumulative flag as `elapsedSeconds`, same reason for
   *  the neutral name (§23 walk item 2). */
  meters: number;
  avgStrokeRate: number;
  /** By-analogy sentinel (§23 walk item 3), not document-stated for this
   *  field. */
  endingHeartRateBpm: number | null;
  /** By-analogy sentinel (§23 walk item 3). */
  avgHeartRateBpm: number | null;
  /** By-analogy sentinel (§23 walk item 3). */
  minHeartRateBpm: number | null;
  /** By-analogy sentinel (§23 walk item 3). */
  maxHeartRateBpm: number | null;
  dragFactorAverage: number;
  /** BLE doc p.21: "zero = not valid data" — the one heart-rate field on
   *  this characteristic with a DOCUMENT-STATED sentinel (§23). Can re-fire
   *  a real value roughly a minute after the workout ends (the ecosystem
   *  review's "re-fire wrinkle", §23) — a later task's reconciliation gate
   *  owns consuming that re-fire once, not this parser. */
  recoveryHeartRateBpm: number | null;
  workoutType: number;
  /** 0.1 sec/lsb — the SAME scale as 0x0038's Split/Interval Avg Pace,
   *  genuinely different from 0x0032/0x0033's 0.01 sec/lsb pace fields
   *  (§10/§23's documented trap). */
  avgPaceSecondsPer500m: number;
}

export function parseEndOfWorkoutSummary(
  bytes: Uint8Array,
): WorkoutSummary | null {
  if (bytes.length < 20) return null;
  return {
    elapsedSeconds: readU24LE(bytes, 4) / 100,
    meters: readU24LE(bytes, 7) / 10,
    avgStrokeRate: readU8(bytes, 10),
    endingHeartRateBpm: heartRate(readU8(bytes, 11)),
    avgHeartRateBpm: heartRate(readU8(bytes, 12)),
    minHeartRateBpm: heartRate(readU8(bytes, 13)),
    maxHeartRateBpm: heartRate(readU8(bytes, 14)),
    dragFactorAverage: readU8(bytes, 15),
    recoveryHeartRateBpm: heartRate(readU8(bytes, 16)),
    workoutType: readU8(bytes, 17),
    avgPaceSecondsPer500m: readU16LE(bytes, 18) / 10,
  };
}

export interface SummaryLogStamp {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
}

/**
 * Decode the 0x0039 log date/time stamp (RC-2, diagnostic-only).
 * Bytes PRIMARY (committed hardware captures walk-2026-08-24).
 * Formula INFERENCE over one date/hour from two captures (no vendor doc).
 * Wire facts: date u16 LE = month (0-3 bits) | day<<4 (4-8 bits) | (year-2000)<<9 (9-15 bits);
 * time u16 LE = minutes (0-7 bits) | hours<<8 (8-15 bits).
 */
export function parseSummaryLogStamp(
  bytes: Uint8Array,
): SummaryLogStamp | null {
  if (bytes.length < 4) return null;
  const date = readU16LE(bytes, 0);
  const time = readU16LE(bytes, 2);
  return {
    year: 2000 + (date >> 9),
    month: date & 0x0f,
    day: (date >> 4) & 0x1f,
    hours: time >> 8,
    minutes: time & 0xff,
  };
}

/**
 * The merged view of all five status characteristics. A driver (a later
 * task) builds one of these per "tick" by spreading each characteristic's
 * latest decoded value (`{ ...prev, ...parseGeneralStatus(bytes) }`, etc.)
 * as notifications arrive — this module only defines the shape and the two
 * pure functions that read from it, never the accumulation itself (that is
 * runtime/driver behaviour, out of `domain/monitor/**`'s pure-codec scope).
 * Fields that both source characteristics report (e.g. `elapsedSeconds`,
 * `splitIntervalNumber`) intersect cleanly since every decoder gives them
 * the same name and meaning.
 */
export type RawPm5Status = GeneralStatus &
  AdditionalStatus1 &
  AdditionalStatus2 &
  SplitIntervalData &
  AdditionalSplitIntervalData;

/** `OBJ_WORKOUTSTATE_T` ordinals (BLE doc Appendix A p.37), named for
 *  `src/monitor/transports/fake.ts` and its own test suite, which need to
 *  pick a specific wire state without re-deriving these numbers from the
 *  table below — interface-notes.md §14. Only the ordinals
 *  actually needed outside this module are named; `WORKOUTSTATE_TO_STATE`
 *  below keeps its own inline bare-number comments (predates this need) so
 *  this addition is purely additive, not a refactor of already-shipped,
 *  cited code. Exporting these (rather than letting the fake re-declare its
 *  own copies) is what keeps `pm5/` the ONLY place these ordinals are named
 *  (design spec §Layering: "pm5/ is the only home of Concept2 bytes"). */
export const WORKOUTSTATE_WAITTOBEGIN = 0;
export const WORKOUTSTATE_INTERVALREST = 3;
export const WORKOUTSTATE_INTERVALWORKTIME = 4;
export const WORKOUTSTATE_INTERVALWORKDISTANCE = 5;
/** The ephemeral work->rest transition state (root `IntervalWorkTime`,
 *  `WORKOUTSTATE_TO_STATE`'s own `8: "rowing"` row below) — added for the
 *  walk-falsification fix (CR2 spec 1 Task 11, `docs/monitor/sessions/
 *  walk-2026-08-15/`): `session-a-multitest.json` seq 26 is a captured
 *  0x0031 sample in this exact state, one entry before the `resting` flip,
 *  still carrying the COMPLETED interval's own pair — the tick
 *  `driver.ts`'s open-on-reset guard exists to keep from opening the next
 *  interval's register. Named here, rather than left a bare `8` in
 *  `src/monitor/sessionTotals.test.ts`'s fixture, for the same reason the
 *  other seven ordinals are exported (see this block's own doc comment). */
export const WORKOUTSTATE_INTERVALWORKTIMETOREST = 8;
/** The ephemeral work->rest transition state for distance-kind intervals
 *  (root `IntervalWorkDistance`, `WORKOUTSTATE_TO_STATE`'s own `9: "rowing"`
 *  row below) — the symmetric counterpart to state 8, found in production
 *  (walk-2026-08-24 exit-7 data, ring seq 27). Added for the series-truth
 *  fix (storage-spine design spec §A). Same guard semantics as state 8: the
 *  driver's open-on-reset gate fires on this boundary exactly as it does on
 *  8, and the emitted frame's interval index must be mirrored onto the new
 *  `MonitorFrame.attributedIntervalIndex` field for the recorder to key on.
 *  Named for the same reason the other ordinals are exported (see this
 *  block's own doc comment). */
export const WORKOUTSTATE_INTERVALWORKDISTANCETOREST = 9;
export const WORKOUTSTATE_WORKOUTEND = 10;
export const WORKOUTSTATE_TERMINATE = 11;
/** WORKOUTLOGGED — `WORKOUTSTATE_TO_STATE`'s own `12: "finished"` row below
 *  says "reached only via WorkoutEnd" (Appendix E), but the walk-2026-08-23
 *  keystone (storage-spine design spec §1) shows the real machine going
 *  straight there: state 5→12 directly, state 10 never appears in that
 *  capture. Named for `src/monitor/transports/fake.ts`'s natural-finish
 *  burst, which scripts the wire's own terminal transition as the capture
 *  actually shows it, not the Appendix E path nothing observed. */
export const WORKOUTSTATE_WORKOUTLOGGED = 12;
export const WORKOUTSTATE_REARM = 13;

/**
 * `OBJ_WORKOUTSTATE_T` (BLE doc Appendix A p.37) -> `MonitorFrame.state`,
 * cited row-by-row in interface-notes.md §14 (which also cites CSAFE doc
 * Appendix E's "PM State Transitions", p.162, for the states not directly
 * named by the design spec). Every one of the 14 documented ordinals maps
 * to exactly one of the 6 `MonitorFrame.state` values.
 */
const WORKOUTSTATE_TO_STATE: Record<number, MonitorFrame["state"]> = {
  0: "armed", // WAITTOBEGIN — design spec §2 verbatim
  1: "rowing", // WORKOUTROW — Appendix E: active rowing, no interval structure
  2: "armed", // COUNTDOWNPAUSE — pre-row countdown, not Appendix E's mid-workout pause
  3: "resting", // INTERVALREST — Appendix E's named rest state
  4: "rowing", // INTERVALWORKTIME
  5: "rowing", // INTERVALWORKDISTANCE
  6: "resting", // INTERVALRESTENDTOWORKTIME — root IntervalRest, ephemeral
  7: "resting", // INTERVALRESTENDTOWORKDISTANCE — root IntervalRest, ephemeral
  8: "rowing", // INTERVALWORKTIMETOREST — root IntervalWorkTime, ephemeral
  9: "rowing", // INTERVALWORKDISTANCETOREST — root IntervalWorkDistance, ephemeral
  10: "finished", // WORKOUTEND — design spec §2 verbatim
  11: "terminated", // TERMINATE — design spec §2 verbatim
  12: "finished", // WORKOUTLOGGED — Appendix E: reached only via WorkoutEnd
  13: "idle", // REARM — Appendix E: the reset tick before WaitToBegin
};

/** Defensive fallback for a `workoutState` byte outside the documented
 *  0-13 range (garbled/corrupted radio data) — `idle` is the most
 *  conservative reading (no program considered active), not a wire fact. */
const UNKNOWN_WORKOUT_STATE_FALLBACK: MonitorFrame["state"] = "idle";

/** The `OBJ_WORKOUTSTATE_T` ordinal -> `MonitorFrame["state"]` lookup on its
 *  own, exported for `src/monitor/transports/fake.ts`: the fake has to know
 *  whether the wire state it is about to send counts as a REST (0x0033's
 *  Interval Count is attributed forward during one — `intervalIndex.ts`'s
 *  `toMachineIndex`), and deriving that from a bare ordinal in `src/` would
 *  put the Appendix-A table outside `pm5/` (design spec §Layering). Same
 *  reasoning that exports the `WORKOUTSTATE_*` ordinals above.
 *  `toMonitorFrame` is this function's only other caller. */
export function toMonitorState(workoutState: number): MonitorFrame["state"] {
  return WORKOUTSTATE_TO_STATE[workoutState] ?? UNKNOWN_WORKOUT_STATE_FALLBACK;
}

/**
 * `RawPm5Status` -> `MonitorFrame`. `intervalRemaining`/`intervalAccrued`
 * are always `null` here — both computed downstream by the driver from the
 * program plus quantized progress (design spec §2 for the former;
 * `intervalAccrued` is its ROADMAP CL item 7 companion, its own complement).
 * No characteristic reports either. `intervalIndex`
 * is `null` outside `rowing`/`resting` (a business rule: no interval is
 * "current" while armed/idle/finished/terminated), never from a wire
 * sentinel — the raw value's numbering base itself is unconfirmed
 * (interface-notes.md §15 #1). `spm` is always the raw Stroke Rate byte —
 * never actually `null` from this function (no documented invalid-rate
 * sentinel exists); the type allows `null` for a caller with no data yet.
 * `currentSplit` is passed through unconditionally too, with no null path
 * of its own (M-4, final-review) — unlike Heartrate's documented `255`
 * sentinel, neither source document states what an armed/resting erg's
 * Current Pace byte reads (interface-notes.md §15 #5); a screen rendering
 * this as a pace string decides what "0:00" or an erratic idle value means,
 * not this function. Flagged for the laptop session (§17 item 9).
 *
 * Phase 7A-fix Task 3 (D3): `intervalIndex` below is still the RAW machine
 * value (0x0033's Interval Count) — this module never learned about program
 * indices and never will (it has no access to a `WorkoutProgram`, and
 * `domain/monitor/**` importing one here would be the wrong layer for it
 * anyway). `src/monitor/driver.ts`'s `maybeEmitFrame` OVERWRITES this field
 * with `domain/monitor/pm5/intervalIndex.ts`'s `toProgramIndex` output
 * before a `MonitorFrame` ever reaches a consumer. That means a
 * `MonitorFrame` returned DIRECTLY by this function (as every test in this
 * file's own suite exercises) still carries the machine's numbering in a
 * field whose type (`domain/monitor/types.ts`) documents it as OUR
 * numbering everywhere else — a trap for any future direct caller of this
 * function that isn't `driver.ts`.
 *
 * `sessionElapsedSeconds`/`sessionDistanceMeters` carry the identical trap,
 * for the identical reason: this function sets both equal to 0x0031's own
 * (PER-INTERVAL, walk 4) `elapsedSeconds`/`distanceMeters`, because a single
 * decoded status has no history to accumulate across. `driver.ts`'s own
 * accumulator overwrites them with real session totals before a frame ever
 * reaches a consumer.
 */
export function toMonitorFrame(raw: RawPm5Status): MonitorFrame {
  const state = toMonitorState(raw.workoutState);
  const intervalActive = state === "rowing" || state === "resting";

  return {
    elapsedSeconds: raw.elapsedSeconds,
    distanceMeters: raw.distanceMeters,
    // A parse-level frame has no HISTORY, so it has nothing to accumulate
    // from: the session pair equals the raw pair here, and only a frame
    // that has passed through `src/monitor/driver.ts` carries real
    // accumulation across 0x0031's per-interval resets (walk 4,
    // interface-notes.md §18). Same shape of caveat as `intervalIndex`
    // below — see this function's own doc comment.
    sessionElapsedSeconds: raw.elapsedSeconds,
    sessionDistanceMeters: raw.distanceMeters,
    currentSplit: raw.currentSplit,
    spm: raw.spm,
    heartRateBpm: raw.heartRateBpm,
    rowingActive: raw.rowingState === 1,
    // Unconditional pass-through, same choice as `currentSplit` above —
    // see `MonitorFrame.splitAvgPace`'s own doc comment for the driver-side
    // clearing this function does NOT do (it has no frame history to
    // compare against).
    splitAvgPace: raw.splitAvgPace,
    // EST LEFT (Phase LL): unconditional pass-through, same choice as
    // `currentSplit`/`splitAvgPace` above — see `MonitorFrame.restSeconds`'s
    // own doc comment (`domain/monitor/types.ts`).
    restSeconds: raw.restSeconds,
    // RAW machine value — see this function's own doc comment above.
    intervalIndex: intervalActive ? raw.intervalCount : null,
    intervalRemaining: null,
    intervalAccrued: null,
    state,
    // Phase LL Task 4: unconditional pass-through, same choice as
    // `currentSplit`/`splitAvgPace`/`restSeconds` above — see
    // `MonitorFrame.totalWorkDistanceMeters`'s own doc comment
    // (`domain/monitor/types.ts`) for what reads this and why.
    totalWorkDistanceMeters: raw.totalWorkDistanceMeters,
  };
}

/**
 * `RawPm5Status` -> `IntervalActual`, sourced from the 0x0037/0x0038 pair's
 * own `Split/Interval Time`/`Split/Interval Distance` fields, never from
 * 0x0031's `Elapsed Time`/`Distance` (the pair that becomes
 * `MonitorFrame.elapsedSeconds`/`distanceMeters`). The two are DIFFERENT
 * characteristics reporting the same interval, and this function reads the
 * completed-split pair on purpose — 0x0031 is a live running reading and
 * carries no per-split average at all.
 *
 * Note on 0x0031, since this is the comment a reader auditing
 * `useMonitorSession`'s `distanceMeters > 0` boundary guard tends to land
 * on: 0x0031's Distance is NOT session-cumulative across intervals. An
 * earlier draft of this comment said it was; the record disproves it. At
 * the no-rest boundary in `docs/monitor/sessions/pm5-session3-final.log`
 * lines 2835-2837, `distanceMeters` goes `74.4 -> 0` and counts up again,
 * exactly as the guard assumes. `avgHeartRateBpm`
 * reads the WORK heartrate, not the rest heartrate — `ProgramInterval`
 * bundles an interval's trailing rest into itself the same way this
 * characteristic pairs a work value with a sibling rest value, and
 * `IntervalActual` (like `ProgramInterval`) represents the work bout;
 * `splitIntervalRestHeartRateBpm` is decoded but has no slot here.
 */
export function toIntervalActual(raw: RawPm5Status): IntervalActual {
  return {
    index: raw.splitIntervalNumber,
    elapsedSeconds: raw.splitIntervalTimeSeconds,
    distanceMeters: raw.splitIntervalDistanceMeters,
    avgSplit: raw.splitIntervalAvgPace,
    avgSpm: raw.splitIntervalAvgStrokeRate,
    avgHeartRateBpm: raw.splitIntervalWorkHeartRateBpm,
    // R-B: 0x0037's own Interval Rest Distance, already decoded by
    // `parseSplitIntervalData` above — see `IntervalActual.restDistanceMeters`'s
    // own doc comment (`domain/monitor/types.ts`).
    restDistanceMeters: raw.intervalRestDistanceMeters,
    // RC-1 (storage-spine design spec §3): 0x0037's own Interval Rest Time
    // and Split/Interval Type, already decoded by `parseSplitIntervalData`
    // above (offsets 12/16) — no new wire work, the same fold
    // `restDistanceMeters` just above uses. See `IntervalActual.
    // restSeconds`/`.type`'s own doc comments (`domain/monitor/types.ts`)
    // for the readback caveat and the raw-byte caveat respectively, and
    // for why `restSeconds` here is NOT `MonitorFrame.restSeconds`
    // (0x0032's own, different field).
    restSeconds: raw.intervalRestTimeSeconds,
    type: raw.splitIntervalType,
  };
}
