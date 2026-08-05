// CSAFE control-characteristic response parsing + ack-frame building.
//
// `pm5/parse.ts` decodes the BLE STATUS characteristics
// (0x0031/0x0032/0x0033/0x0037/0x0038); THIS module decodes RESPONSES to
// commands written to the control characteristic (0x0021/0x0022) — a
// different data path, but still Concept2-byte-level knowledge, so it
// lives in pm5/ alongside the codec that builds the commands being acked
// (interface-notes.md §16, M5). Both the driver (reading acks) and the
// fake transport (building synthetic acks, both a later task) need this —
// pm5/ is the only home of Concept2 bytes (design spec §Layering).
//
// domain/monitor/** imports nothing from src/.

import { buildFrame, parseFrame } from "../csafe.js";

export type CsafeResponseStatus = "ok" | "reject";

export interface CsafeResponse {
  status: CsafeResponseStatus;
  commandIds: number[];
}

/** C2 proprietary wrapper (interface-notes.md §7/§16) — the one opcode the
 *  primary doc's own master ID table labels "Command Wrapper" (alongside
 *  0x77/0x7E/0x7F, none of which `pm5/commands.ts` ever emits) that this
 *  codec actually uses. */
const PROPRIETARY_WRAPPER = 0x76;

/** Status byte for success (interface-notes.md §6: "01 or 81" — 01 is the
 *  success value in every response example). */
const SUCCESS_STATUS_BYTE = 0x01;
/** Status byte for explicit failure/CommStatus (interface-notes.md §6). */
const REJECT_STATUS_BYTE = 0x81;

/**
 * Parses one complete CSAFE response frame (raw wire bytes, start flag
 * through stop flag) into a status/commandIds pair (interface-notes.md
 * §16). Total: a frame that fails `csafe.parseFrame` (bad checksum,
 * missing flags, garbled bytes) or is too short to carry even a status
 * byte is reported as `{status: "reject", commandIds: []}` rather than
 * thrown — a response the driver cannot even validate is, from its
 * perspective, no better than an explicit rejection; it should log and
 * treat the write as unacked, never crash the read loop.
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
    return { status: "reject", commandIds: [] };
  }

  const payload = parsed.payload;
  const statusByte = payload[0];
  if (statusByte === undefined) {
    return { status: "reject", commandIds: [] };
  }
  const status: CsafeResponseStatus =
    statusByte === SUCCESS_STATUS_BYTE ? "ok" : "reject";

  const topOpcode = payload[1];
  if (topOpcode === undefined) {
    return { status, commandIds: [] };
  }

  if (topOpcode === PROPRIETARY_WRAPPER) {
    const count = payload[2] ?? 0;
    const commandIds = Array.from(payload.slice(3, 3 + count));
    return { status, commandIds };
  }

  return { status, commandIds: [topOpcode] };
}

/**
 * Builds a synthetic ack/reject response FRAME (raw wire bytes, not yet
 * chunked to the BLE notify budget — callers use `pm5/framer.ts`'s
 * `chunkFrames` for that, the same composable step `pm5/commands.ts` uses)
 * for `commandIds` under the 0x76 wrapper — the inverse of
 * `parseCsafeResponse`'s wrapper branch, mirroring R2/R4 exactly
 * (interface-notes.md §16). For the fake transport (a later task) to
 * answer `pm5/commands.ts`'s writes without needing its own copy of the
 * wrapper format.
 */
export function buildAckFrame(
  status: CsafeResponseStatus,
  commandIds: number[],
): Uint8Array {
  const statusByte = status === "ok" ? SUCCESS_STATUS_BYTE : REJECT_STATUS_BYTE;
  const payload = Uint8Array.from([
    statusByte,
    PROPRIETARY_WRAPPER,
    commandIds.length,
    ...commandIds,
  ]);
  return buildFrame(payload);
}
