// CSAFE control-characteristic response parsing + ack-frame building.
//
// `pm5/parse.ts` decodes the BLE STATUS characteristics
// (0x0031/0x0032/0x0033/0x0037/0x0038); THIS module decodes RESPONSES to
// commands written to the control characteristic (0x0021/0x0022) — a
// different data path, but still Concept2-byte-level knowledge, so it
// lives in pm5/ alongside the codec that builds the commands being acked
// (interface-notes.md §16, M5). Both `src/monitor/driver.ts` (reading
// acks) and `src/monitor/transports/fake.ts` (building synthetic acks)
// need this — pm5/ is the only home of Concept2 bytes (design spec
// §Layering).
//
// domain/monitor/** imports nothing from src/.
//
// The status byte is a BITFIELD, not an enum (interface-notes.md §19.1,
// citing [SDK] csafe.h:747-766 and PM3CsafeCP.h:131-156, and [CSAFE-DEF]
// p.11 Table 9): three independent fields packed into one byte —
//
//   bit 7    (0x80) frame-count TOGGLE — alternates on alternate frames,
//                    NEVER a failure signal
//   bit 6    (0x40) unassigned/reserved — ignored on parse, never set by
//                    the builder
//   bits 4-5 (0x30) previous-frame status: 0x00 Ok / 0x10 Reject /
//                    0x20 Bad / 0x30 Not ready
//   bits 0-3 (0x0F) slave state: 0x00 Error / 0x01 Ready / 0x02 Idle /
//                    0x03 Have ID / 0x05 In Use / 0x06 Pause / 0x07 Finish /
//                    0x08 Manual / 0x09 Off line (0x04 and 0x0A-0x0F are
//                    unassigned)
//
// A prior version of this module compared the whole byte against a single
// "success" constant — that bug, the hardware evidence that exposed it (two
// laptop sessions in which every recorded "rejection" was actually an
// accept with the toggle bit set or a non-Ready slave state), and its fix
// are recorded in interface-notes.md §19.1-§19.2. Read that section before
// changing this file's bit logic again.

import { buildFrame, parseFrame } from "../csafe.js";

/** Bits 4-5 (0x30) — interface-notes.md §19.1 via [SDK] csafe.h:747-766
 *  (`CSAFE_PREVOK_FLG`/`CSAFE_PREVREJECT_FLG`/`CSAFE_PREVBAD_FLG`/
 *  `CSAFE_PREVNOTRDY_FLG`). */
export type CsafeFrameStatus = "ok" | "reject" | "bad" | "not-ready";

/** Bits 0-3 (0x0F) — interface-notes.md §19.1 via [SDK] csafe.h:747-766.
 *  Any byte whose low nibble has no assigned meaning (`0x04`, `0x0A`-`0x0F`)
 *  decodes to `"unknown"` rather than throwing or guessing; `buildAckFrame`
 *  emits `0x04` for `"unknown"` (csafe.h's own comment: "0x04 deliberately
 *  absent"). */
export type CsafeSlaveState =
  | "error"
  | "ready"
  | "idle"
  | "have-id"
  | "in-use"
  | "paused"
  | "finished"
  | "manual"
  | "offline"
  | "unknown";

/**
 * A decoded CSAFE response (interface-notes.md §19.1's bitfield rule).
 * `frameToggle` is bit 7 — it alternates on alternate frames and must NEVER
 * be tested for failure (§19.1's own "killer evidence": Concept2's worked
 * examples document one identical successful response as "81 or 01",
 * differing in nothing but this bit).
 *
 * `{kind: "unparseable"}` is a frame this module cannot decode AT ALL — a
 * bad checksum, missing frame flags, or too few bytes to even carry a
 * status byte. That is a strictly different situation from the PM
 * explicitly answering "reject"/"bad"/"not ready" to a well-formed frame:
 * an unparseable frame carries no bitfield to report, so it cannot be
 * folded into any `CsafeFrameStatus` value without inventing one.
 */
export type CsafeResponse =
  | {
      kind: "parsed";
      frameStatus: CsafeFrameStatus;
      slaveState: CsafeSlaveState;
      frameToggle: boolean;
      commandIds: number[];
    }
  | { kind: "unparseable" };

/** C2 proprietary wrapper (interface-notes.md §7/§16) — the one opcode the
 *  primary doc's own master ID table labels "Command Wrapper" (alongside
 *  0x77/0x7E/0x7F, none of which `pm5/commands.ts` ever emits) that this
 *  codec actually uses. */
const PROPRIETARY_WRAPPER = 0x76;

const FRAME_STATUS_MASK = 0x30;
const SLAVE_STATE_MASK = 0x0f;
const FRAME_TOGGLE_BIT = 0x80;

/** interface-notes.md §19.1 via [SDK] csafe.h:747-766. */
const FRAME_STATUS_BITS: Record<CsafeFrameStatus, number> = {
  ok: 0x00,
  reject: 0x10,
  bad: 0x20,
  "not-ready": 0x30,
};
const FRAME_STATUS_BY_BITS = new Map<number, CsafeFrameStatus>(
  Object.entries(FRAME_STATUS_BITS).map(([name, bits]) => [
    bits,
    name as CsafeFrameStatus,
  ]),
);

/** interface-notes.md §19.1 via [SDK] csafe.h:747-766. `unknown`'s `0x04`
 *  is the builder's own choice of an unassigned value (csafe.h's comment:
 *  "0x04 deliberately absent") — parsing never depends on this entry,
 *  since `decodeSlaveState` falls back to `"unknown"` for ANY unmapped
 *  nibble, not just this one. */
const SLAVE_STATE_BITS: Record<CsafeSlaveState, number> = {
  error: 0x00,
  ready: 0x01,
  idle: 0x02,
  "have-id": 0x03,
  "in-use": 0x05,
  paused: 0x06,
  finished: 0x07,
  manual: 0x08,
  offline: 0x09,
  unknown: 0x04,
};
const SLAVE_STATE_BY_BITS = new Map<number, CsafeSlaveState>(
  Object.entries(SLAVE_STATE_BITS)
    .filter(([name]) => name !== "unknown")
    .map(([name, bits]) => [bits, name as CsafeSlaveState]),
);

/** Total over its 2-bit input: masking a byte with `FRAME_STATUS_MASK`
 *  always yields one of exactly the four values `FRAME_STATUS_BY_BITS` was
 *  built from (`0x00`/`0x10`/`0x20`/`0x30`), so the lookup can never miss. */
function decodeFrameStatus(statusByte: number): CsafeFrameStatus {
  return FRAME_STATUS_BY_BITS.get(statusByte & FRAME_STATUS_MASK)!;
}

/** Unlike frame status, the slave-state nibble has UNASSIGNED values
 *  (`0x04`, `0x0A`-`0x0F`) — real wire bytes, not merely a type-system
 *  edge case (interface-notes.md §19.1 records `0x09` Off line arriving on
 *  real hardware; nothing rules out an unassigned nibble arriving too), so
 *  this falls back to `"unknown"` rather than asserting past a `Map.get`. */
function decodeSlaveState(statusByte: number): CsafeSlaveState {
  return SLAVE_STATE_BY_BITS.get(statusByte & SLAVE_STATE_MASK) ?? "unknown";
}

/**
 * Parses one complete CSAFE response frame (raw wire bytes, start flag
 * through stop flag) into a `CsafeResponse` (interface-notes.md §16, §19.1).
 * Total: a frame that fails `csafe.parseFrame` (bad checksum, missing
 * flags, garbled bytes) or is too short to carry even a status byte is
 * reported as `{kind: "unparseable"}` rather than thrown — a response the
 * driver cannot even validate is, from its perspective, no better than an
 * explicit rejection; it should log and treat the write as unacked, never
 * crash the read loop.
 *
 * The ack-echo format, reverse-derived from the four conformance vectors
 * (interface-notes.md §6 R1-R4): `<status> <topOpcode> <count> <...>`.
 * Only `PROPRIETARY_WRAPPER` (0x76 — the wrapper `pm5/commands.ts` always
 * uses) gets the multi-opcode treatment, where `count` is the number of
 * ECHOED OPCODE BYTES that follow (R2's `76 02 01 13`, R4's
 * `76 1A <26 opcodes>`). Any OTHER `topOpcode` (R1/R3's `0x1A`,
 * `CSAFE_SETUSERCFG1_CMD` — not one of the doc's labeled "Command Wrapper"
 * opcodes, even though it wraps sub-commands in OTHER, unrelated command
 * contexts) is treated as a single bare acked command
 * (`commandIds = [topOpcode]`); whatever follows it is NOT decoded as a
 * further opcode list, since `pm5/commands.ts` never emits a
 * 0x1A-wrapped command and this codec has no confirmed rule for that
 * shape's `count` field.
 */
export function parseCsafeResponse(frame: Uint8Array): CsafeResponse {
  const parsed = parseFrame(frame);
  if (!("payload" in parsed)) {
    return { kind: "unparseable" };
  }

  const payload = parsed.payload;
  const statusByte = payload[0];
  if (statusByte === undefined) {
    return { kind: "unparseable" };
  }

  const frameStatus = decodeFrameStatus(statusByte);
  const slaveState = decodeSlaveState(statusByte);
  const frameToggle = (statusByte & FRAME_TOGGLE_BIT) !== 0;

  const topOpcode = payload[1];
  if (topOpcode === undefined) {
    return {
      kind: "parsed",
      frameStatus,
      slaveState,
      frameToggle,
      commandIds: [],
    };
  }

  if (topOpcode === PROPRIETARY_WRAPPER) {
    const count = payload[2] ?? 0;
    const commandIds = Array.from(payload.slice(3, 3 + count));
    return { kind: "parsed", frameStatus, slaveState, frameToggle, commandIds };
  }

  return {
    kind: "parsed",
    frameStatus,
    slaveState,
    frameToggle,
    commandIds: [topOpcode],
  };
}

export interface AckFrameOptions {
  /** Default `"ok"`. */
  frameStatus?: CsafeFrameStatus;
  /** Default `"ready"`. */
  slaveState?: CsafeSlaveState;
  /** Default `false`. */
  frameToggle?: boolean;
  /** The opcode echo under the 0x76 wrapper. Default `[]`. */
  commandIds?: number[];
}

/**
 * Builds a synthetic ack/reject response FRAME (raw wire bytes, not yet
 * chunked to the BLE notify budget — callers use `pm5/framer.ts`'s
 * `chunkFrames` for that, the same composable step `pm5/commands.ts` uses)
 * under the 0x76 wrapper — the inverse of `parseCsafeResponse`'s wrapper
 * branch, mirroring R2/R4 exactly (interface-notes.md §16). For
 * `src/monitor/transports/fake.ts` to answer `pm5/commands.ts`'s writes
 * without needing its own copy of the wrapper format or the bitfield
 * layout (interface-notes.md §19.1).
 *
 * Every field is independently choosable and independently defaulted (the
 * status byte's three fields are independent on the wire, per §19.1), so
 * callers can synthesise any combination — including ones no laptop
 * session ever actually captured, e.g. a genuine reject (`frameStatus:
 * "reject"`) or a non-Ready slave state on a successful frame.
 */
export function buildAckFrame(options: AckFrameOptions = {}): Uint8Array {
  const {
    frameStatus = "ok",
    slaveState = "ready",
    frameToggle = false,
    commandIds = [],
  } = options;
  const statusByte =
    FRAME_STATUS_BITS[frameStatus] |
    SLAVE_STATE_BITS[slaveState] |
    (frameToggle ? FRAME_TOGGLE_BIT : 0);
  const payload = Uint8Array.from([
    statusByte,
    PROPRIETARY_WRAPPER,
    commandIds.length,
    ...commandIds,
  ]);
  return buildFrame(payload);
}
