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
    // An empty CSAFE frame (just a zero checksum byte, no command content)
    // is meaningless on the wire — nothing to program, nothing to ack.
    // There is nothing to pack, so there are no frames.
    return [];
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
 * An "open" frame (start flag received, no stop flag yet) that grows past
 * `MAX_FRAME_BYTES` without closing can never become a valid frame — the
 * document's own discard/resync rule applies (interface-notes.md §1,
 * CSAFE p.9): it is dropped and scanning resumes at the next start flag.
 *
 * **Drain contract:** a single `push()` call returns AT MOST one complete
 * frame, even if the pushed chunk (or the accumulated buffer) contains the
 * tail of more than one. Any additional complete frame is held internally
 * and is NOT returned until a later `push()` call — including a push of an
 * empty `Uint8Array`, which is a valid way to ask "is there a frame
 * already waiting?" without supplying new bytes. A caller that assumes one
 * push yields one frame's worth of everything available will stall: under
 * ack-gated sequencing (a later task), if a single BLE notification ever
 * happens to carry two complete response frames back to back, the second
 * is invisible until the caller drains again. The caller (the driver's
 * read loop) is responsible for calling `push` in a loop — with new bytes
 * when they arrive, and at least once more with an empty chunk after any
 * push that returns non-null — until it returns `null`.
 *
 * Each call to `reassemble()` returns fresh, independent state.
 */
export function reassemble(): {
  push(chunk: Uint8Array): Uint8Array | null;
} {
  let buffer: number[] = [];

  // Scans `buffer` for a complete frame, applying the frame-size cap and
  // resync rule. Separate from `push` so that dropping a too-long open
  // frame and resyncing can re-scan the shortened buffer from scratch —
  // stuffing state is relative to where a frame begins, so bytes after a
  // resync point must be re-walked, not reused from the prior scan.
  function scan(): Uint8Array | null {
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
      // If a stop flag were found at this position, the frame (positions
      // 0..i inclusive) would be i+1 bytes long. Once i reaches
      // MAX_FRAME_BYTES, even the BEST case (a stop flag right here)
      // would make the frame MAX_FRAME_BYTES+1 bytes — already over
      // budget (interface-notes.md §3). This must be checked on every
      // iteration, not only once the buffer is exhausted: a stray
      // flag-valued byte arbitrarily far into a too-long, never-closing
      // open frame (a corrupted/garbled stream) would otherwise still get
      // returned as a giant "frame" the moment it's scanned, however far
      // away — the exact shape of the reviewer's unbounded-buffer repro.
      if (i >= MAX_FRAME_BYTES) {
        return dropAndResync();
      }
      const byte = buffer[i];
      if (byte === STUFF_FLAG) {
        // The next byte is a stuff code, not itself a flag — skip the
        // pair so a stuffed 0xF2 (encoded as F3,02) is never mistaken
        // for the real stop flag.
        if (i + 1 >= buffer.length) {
          // Dangling stuff flag at the current buffer edge, still within
          // budget (the check above would have already returned
          // otherwise): wait for more bytes rather than misreading past
          // the end.
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

    // Reached the end of the buffer with no stop flag found, still within
    // budget (the in-loop check above would have already returned
    // otherwise) — wait for more bytes.
    return null;
  }

  // The open frame has grown past MAX_FRAME_BYTES without closing — it can
  // never become a valid frame (interface-notes.md §3). Drop it and look
  // for the next start flag in what's left, per the resync rule; if there
  // isn't one, there is nothing salvageable yet.
  function dropAndResync(): Uint8Array | null {
    const nextStart = buffer.indexOf(START_FLAG, 1);
    buffer = nextStart === -1 ? [] : buffer.slice(nextStart);
    return scan();
  }

  return {
    push(chunk: Uint8Array): Uint8Array | null {
      buffer.push(...chunk);
      return scan();
    },
  };
}
