// CSAFE frame build/parse: flags, byte stuffing, XOR checksum.
//
// Every constant here cites docs/monitor/pm5-interface-notes.md, which
// cites the fetched Concept2 CSAFE Communication Definition rev 0.27.
// Standard frame only (no extended-frame addressing) — the interface this
// module exposes (buildFrame(payload), parseFrame(bytes)) has no address
// parameter, matching every example in the interface notes.
//
// domain/monitor/** imports nothing from src/.

/** Table 5 - Unique Frame Flags (interface-notes.md §1, CSAFE doc p.8). */
const EXTENDED_START_FLAG = 0xf0;
const STANDARD_START_FLAG = 0xf1;
const STOP_FLAG = 0xf2;
const STUFF_FLAG = 0xf3;

/** Table 6 - Byte Stuffing Values (interface-notes.md §1, CSAFE doc p.8). */
const STUFF_CODE_BY_FLAG_BYTE = new Map<number, number>([
  [EXTENDED_START_FLAG, 0x00],
  [STANDARD_START_FLAG, 0x01],
  [STOP_FLAG, 0x02],
  [STUFF_FLAG, 0x03],
]);
const FLAG_BYTE_BY_STUFF_CODE = new Map<number, number>(
  Array.from(STUFF_CODE_BY_FLAG_BYTE, ([flagByte, code]) => [code, flagByte]),
);

/**
 * True if `byte` is one of the four unique frame-flag values that must be
 * byte-stuffed wherever they appear in frame contents or the checksum
 * (interface-notes.md §1).
 */
export function isFlagByte(byte: number): boolean {
  return STUFF_CODE_BY_FLAG_BYTE.has(byte);
}

/**
 * The number of wire bytes `byte` occupies after stuffing: 2 if it is one
 * of the four flag values, 1 otherwise. Exported for `pm5/framer.ts`'s
 * budget arithmetic (interface-notes.md §3 — the 120-byte cap is
 * post-stuffing, so the packer must know this per candidate byte).
 */
export function stuffedByteLength(byte: number): 1 | 2 {
  return isFlagByte(byte) ? 2 : 1;
}

function xorAll(bytes: Uint8Array): number {
  let checksum = 0;
  for (const byte of bytes) {
    checksum ^= byte;
  }
  return checksum;
}

function stuff(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (const byte of bytes) {
    const code = STUFF_CODE_BY_FLAG_BYTE.get(byte);
    if (code === undefined) {
      out.push(byte);
    } else {
      out.push(STUFF_FLAG, code);
    }
  }
  return Uint8Array.from(out);
}

export type CsafeParseError =
  | { kind: "missing-start-flag" }
  | { kind: "missing-stop-flag" }
  | { kind: "empty-frame" }
  | { kind: "dangling-stuff-flag" }
  | { kind: "unknown-stuff-code"; code: number }
  | { kind: "unstuffed-flag-byte"; byte: number }
  | { kind: "checksum-mismatch"; expected: number; computed: number };

type UnstuffResult = { bytes: Uint8Array } | { error: CsafeParseError };

/**
 * Byte-unstuff `bytes` (the frame contents between the start and stop
 * flags). Total: every input either unstuffs cleanly or produces a typed
 * error, never throws (interface-notes.md §1-2; the design's "total parse"
 * requirement).
 */
function unstuff(bytes: Uint8Array): UnstuffResult {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    if (byte === STUFF_FLAG) {
      const code = bytes[i + 1];
      if (code === undefined) {
        return { error: { kind: "dangling-stuff-flag" } };
      }
      const original = FLAG_BYTE_BY_STUFF_CODE.get(code);
      if (original === undefined) {
        return { error: { kind: "unknown-stuff-code", code } };
      }
      out.push(original);
      i += 1;
    } else if (isFlagByte(byte)) {
      // A raw (unstuffed) flag byte inside frame contents is a protocol
      // violation — every flag byte in well-formed content is stuffed
      // (interface-notes.md §1). A correctly built frame never produces
      // this; a garbled/corrupted stream might.
      return { error: { kind: "unstuffed-flag-byte", byte } };
    } else {
      out.push(byte);
    }
  }
  return { bytes: Uint8Array.from(out) };
}

/**
 * Build a complete standard CSAFE frame from `payload` (the frame contents
 * before the checksum — e.g. the C2 proprietary wrapper byte through the
 * last command byte). Computes the XOR checksum over the unstuffed
 * payload, then byte-stuffs payload+checksum, then wraps with the
 * standard start/stop flags (interface-notes.md §1-2).
 */
export function buildFrame(payload: Uint8Array): Uint8Array {
  const checksum = xorAll(payload);
  const contentWithChecksum = new Uint8Array(payload.length + 1);
  contentWithChecksum.set(payload);
  contentWithChecksum[payload.length] = checksum;

  const stuffed = stuff(contentWithChecksum);

  const frame = new Uint8Array(stuffed.length + 2);
  frame[0] = STANDARD_START_FLAG;
  frame.set(stuffed, 1);
  frame[frame.length - 1] = STOP_FLAG;
  return frame;
}

/**
 * Parse one complete standard CSAFE frame (start flag through stop flag —
 * `reassemble()` in pm5/framer.ts is responsible for finding those
 * boundaries in a byte stream; this function assumes it already has
 * exactly one frame's bytes). Total: always returns a payload or a typed
 * error, never throws.
 */
export function parseFrame(
  bytes: Uint8Array,
): { payload: Uint8Array } | { error: CsafeParseError } {
  if (bytes[0] !== STANDARD_START_FLAG) {
    return { error: { kind: "missing-start-flag" } };
  }
  if (bytes[bytes.length - 1] !== STOP_FLAG) {
    return { error: { kind: "missing-stop-flag" } };
  }

  const middle = bytes.slice(1, bytes.length - 1);
  const unstuffed = unstuff(middle);
  if ("error" in unstuffed) {
    return unstuffed;
  }
  if (unstuffed.bytes.length === 0) {
    return { error: { kind: "empty-frame" } };
  }

  const checksumByte = unstuffed.bytes[unstuffed.bytes.length - 1];
  const payload = unstuffed.bytes.slice(0, unstuffed.bytes.length - 1);
  const computed = xorAll(payload);
  if (computed !== checksumByte) {
    return {
      error: { kind: "checksum-mismatch", expected: checksumByte, computed },
    };
  }
  return { payload };
}
