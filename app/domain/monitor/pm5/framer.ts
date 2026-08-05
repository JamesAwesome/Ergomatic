// payload -> <=120-byte CSAFE frames -> <=20-byte BLE chunks; and the
// inverse reassembly for response frames. Pure — no transport, no timers.
//
// Every constant here cites docs/monitor/pm5-interface-notes.md, which
// cites the fetched primary documents (CSAFE Communication Definition rev
// 0.27, PM Bluetooth Smart Communication Interface Definition rev 1.30).
//
// domain/monitor/** imports nothing from src/.

import { buildFrame, stuffedByteLength } from "../csafe.js";

/** CSAFE frame cap, post-stuffing, including flags and checksum (interface-notes.md §3, CSAFE doc p.9). */
const MAX_FRAME_BYTES = 120;
/** F1 + F2 wrapper bytes added by buildFrame; never stuffed (they ARE the flags). */
const WRAPPER_BYTES = 2;
/** BLE control-characteristic write/notify budget (interface-notes.md §4, BLE doc p.12). */
const MAX_CHUNK_BYTES = 20;

/**
 * How many bytes of `payload`, starting at `start`, fit in one frame
 * without exceeding `MAX_FRAME_BYTES` post-stuffing — accounting for the
 * post-stuffing length of each candidate byte AND of the running checksum
 * (adding a byte changes the checksum, which can change whether the
 * checksum itself needs stuffing; interface-notes.md §1 notes the
 * document's own example where the checksum byte is stuffed).
 */
function maxBytesFitting(payload: Uint8Array, start: number): number {
  let contentStuffedLength = 0;
  let checksum = 0;
  let count = 0;

  while (start + count < payload.length) {
    const byte = payload[start + count];
    const candidateChecksum = checksum ^ byte;
    const candidateContentStuffedLength =
      contentStuffedLength + stuffedByteLength(byte);
    const candidateChecksumStuffedLength = stuffedByteLength(candidateChecksum);
    const total =
      WRAPPER_BYTES +
      candidateContentStuffedLength +
      candidateChecksumStuffedLength;
    if (total > MAX_FRAME_BYTES) {
      break;
    }
    checksum = candidateChecksum;
    contentStuffedLength = candidateContentStuffedLength;
    count += 1;
  }

  return count;
}

/**
 * Split `payload` into as many CSAFE frames as needed so that each one is
 * <=120 bytes post-stuffing (interface-notes.md §3). Command-boundary
 * alignment is NOT this function's job (see interface-notes.md §3) — it is
 * a generic, command-agnostic byte packer; a caller that must not split a
 * single CSAFE command across a frame boundary is responsible for calling
 * this with payloads already sized to end on a command boundary.
 */
export function packPayload(payload: Uint8Array): Uint8Array[] {
  if (payload.length === 0) {
    return [buildFrame(payload)];
  }

  const frames: Uint8Array[] = [];
  let offset = 0;
  while (offset < payload.length) {
    // `count` is always >= 1 here: even a single worst-case (flag) byte
    // plus a worst-case (also-stuffed) checksum plus the F1/F2 wrapper is
    // at most 2 + 2 + 2 = 6 bytes, far under MAX_FRAME_BYTES (120) — so
    // `maxBytesFitting` always admits at least the first byte at `offset`
    // and this loop always makes forward progress.
    const count = maxBytesFitting(payload, offset);
    frames.push(buildFrame(payload.slice(offset, offset + count)));
    offset += count;
  }
  return frames;
}

/**
 * Split each frame in `frames` into <=20-byte pieces for the BLE control
 * characteristic write (interface-notes.md §4). Chunks never span two
 * different frames — the driver awaits an ack after each complete frame
 * (ack-gated sequencing), so a chunk mixing bytes from two frames would be
 * meaningless to write as one packet.
 */
export function chunkFrames(frames: Uint8Array[]): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i += MAX_CHUNK_BYTES) {
      chunks.push(frame.slice(i, i + MAX_CHUNK_BYTES));
    }
  }
  return chunks;
}

const START_FLAG = 0xf1;
const STOP_FLAG = 0xf2;
const STUFF_FLAG = 0xf3;

/**
 * The inverse of chunkFrames for incoming response bytes: accumulate
 * chunks and, once a complete frame (start flag through an unstuffed stop
 * flag) has arrived, emit it. Frame-boundary detection must not be fooled
 * by a stuffed byte pair that happens to look like a stop flag (0xF3,
 * 0x02) — it tracks stuff-pair state while scanning, per
 * interface-notes.md §1.
 *
 * Each call to `reassemble()` returns fresh, independent state.
 */
export function reassemble(): {
  push(chunk: Uint8Array): Uint8Array | null;
} {
  let buffer: number[] = [];

  return {
    push(chunk: Uint8Array): Uint8Array | null {
      buffer.push(...chunk);

      // Discard any leading bytes before the first start flag — noise, or
      // nothing salvageable if no start flag has arrived yet at all.
      const start = buffer.indexOf(START_FLAG);
      if (start === -1) {
        buffer = [];
        return null;
      }
      if (start > 0) {
        buffer = buffer.slice(start);
      }

      let i = 1;
      while (i < buffer.length) {
        const byte = buffer[i];
        if (byte === STUFF_FLAG) {
          // The next byte is a stuff code, not itself a flag — skip the
          // pair so a stuffed 0xF2 (encoded as F3,02) is never mistaken
          // for the real stop flag.
          if (i + 1 >= buffer.length) {
            // Dangling stuff flag at the current buffer edge: wait for
            // more bytes rather than misreading past the end.
            return null;
          }
          i += 2;
          continue;
        }
        if (byte === START_FLAG) {
          // A new start flag before the previous frame closed: the doc's
          // resynchronization rule (interface-notes.md §1) — discard the
          // incomplete frame and restart from here.
          buffer = buffer.slice(i);
          i = 1;
          continue;
        }
        if (byte === STOP_FLAG) {
          const frame = Uint8Array.from(buffer.slice(0, i + 1));
          buffer = buffer.slice(i + 1);
          return frame;
        }
        i += 1;
      }

      return null;
    },
  };
}
