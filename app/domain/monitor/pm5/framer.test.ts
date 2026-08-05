import { describe, expect, it } from "vitest";
import { parseFrame } from "../csafe.js";
import { chunkFrames, packPayload, reassemble } from "./framer.js";

// Reference: docs/monitor/pm5-interface-notes.md §3 (120-byte CSAFE frame
// cap, post-stuffing) and §4 (20-byte BLE write budget, CSAFE doc p.9 /
// BLE doc p.12).

function unwrapPayload(frame: Uint8Array): number[] {
  const result = parseFrame(frame);
  if (!("payload" in result)) {
    throw new Error(`frame failed to parse: ${JSON.stringify(result.error)}`);
  }
  return Array.from(result.payload);
}

describe("packPayload", () => {
  it("packs a small payload (well under budget) into a single frame", () => {
    const payload = Uint8Array.from([0x76, 0x07, 0x01, 0x01, 0x01, 0x13]);
    const frames = packPayload(payload);
    expect(frames.length).toBe(1);
    expect(unwrapPayload(frames[0])).toStrictEqual(Array.from(payload));
  });

  it("packs an empty payload into zero frames (an empty CSAFE frame is meaningless — nothing to program, nothing to ack)", () => {
    const frames = packPayload(Uint8Array.from([]));
    expect(frames).toStrictEqual([]);
  });

  it("never exceeds the 120-byte post-stuffing frame budget for a plain (unstuffed) 657-byte payload (Sea Smoke-sized)", () => {
    const payload = Uint8Array.from(
      { length: 657 },
      (_, i) => (i * 7 + 3) % 256,
    );
    const frames = packPayload(payload);
    expect(frames.length).toBeGreaterThan(1);
    for (const frame of frames) {
      expect(frame.length).toBeLessThanOrEqual(120);
    }
  });

  it("reassembling every frame's payload in order recovers the original payload (roundtrip identity)", () => {
    const payload = Uint8Array.from(
      { length: 657 },
      (_, i) => (i * 7 + 3) % 256,
    );
    const frames = packPayload(payload);
    const recovered = frames.flatMap((f) => unwrapPayload(f));
    expect(recovered).toStrictEqual(Array.from(payload));
  });

  it("adversarial max-stuffing payload (every byte a flag value) never exceeds 120 bytes per frame, and roundtrips", () => {
    const payload = Uint8Array.from(
      { length: 400 },
      (_, i) => [0xf0, 0xf1, 0xf2, 0xf3][i % 4],
    );
    const frames = packPayload(payload);
    for (const frame of frames) {
      expect(frame.length).toBeLessThanOrEqual(120);
    }
    const recovered = frames.flatMap((f) => unwrapPayload(f));
    expect(recovered).toStrictEqual(Array.from(payload));
  });

  it("adversarial: a payload of all 0xF3 bytes (worst-case stuffing, doubles every byte) still never exceeds budget", () => {
    const payload = Uint8Array.from(new Array(300).fill(0xf3));
    const frames = packPayload(payload);
    for (const frame of frames) {
      expect(frame.length).toBeLessThanOrEqual(120);
    }
    const recovered = frames.flatMap((f) => unwrapPayload(f));
    expect(recovered).toStrictEqual(Array.from(payload));
  });

  it("packs the document's 657-byte-scale case into frames sized close to the budget (not pathologically small)", () => {
    // Regression guard against an off-by-one that packs 1 byte per frame:
    // a 657-byte unstuffed payload must fit in well under 657 frames.
    const payload = Uint8Array.from(
      { length: 657 },
      (_, i) => (i * 3 + 1) % 200, // avoid flag-byte range so stuffing is a non-factor here
    );
    const frames = packPayload(payload);
    expect(frames.length).toBeLessThanOrEqual(10);
  });

  it("packs a payload that lands EXACTLY on the 120-byte budget into a single frame (boundary: total===120 must fit, not only total<120)", () => {
    // 117 unstuffed bytes of 0x01: content stuffed length 117, checksum
    // (XOR of 117 ones = 0x01, not a flag byte) stuffed length 1, plus the
    // 2 wrapper bytes = exactly 120. A `>=` off-by-one in the budget
    // comparison would split this into two frames instead of one.
    const payload = Uint8Array.from(new Array(117).fill(0x01));
    const frames = packPayload(payload);
    expect(frames.length).toBe(1);
    expect(frames[0].length).toBe(120);
    expect(unwrapPayload(frames[0])).toStrictEqual(Array.from(payload));
  });

  it("rejects a byte whose running checksum only becomes a flag value AFTER that byte, when accepting it would push the (correctly re-stuffed) checksum over budget", () => {
    // 115 zero bytes + 0x10 => running checksum 0x10 (not a flag, 1
    // stuffed byte) at content length 116. The 117th byte, 0xE0, is
    // itself non-flag (1 stuffed byte) but XORs the running checksum to
    // 0xF0 — a flag value needing 2 stuffed bytes. Neither byte 116 nor
    // byte 117 is individually a flag value; only the CHECKSUM, after
    // byte 117, is. A packer that reuses the checksum's stuffed length
    // from before this byte (or hardcodes it to 1) would accept byte 117
    // and emit a 121-byte frame — one over budget. The correct packer
    // must re-derive the checksum's stuffed length from the CANDIDATE
    // checksum (post this byte), not the checksum as it stood before.
    const payload = Uint8Array.from([...new Array(115).fill(0x00), 0x10, 0xe0]);
    expect(payload.length).toBe(117);
    const frames = packPayload(payload);
    for (const frame of frames) {
      expect(frame.length).toBeLessThanOrEqual(120);
    }
    expect(frames.flatMap((f) => unwrapPayload(f))).toStrictEqual(
      Array.from(payload),
    );
  });

  it("a single frame's payload never straddles: concatenating frame payloads reproduces payload byte order exactly", () => {
    const payload = Uint8Array.from({ length: 50 }, (_, i) => i);
    const frames = packPayload(payload);
    let offset = 0;
    for (const frame of frames) {
      const chunkPayload = unwrapPayload(frame);
      expect(chunkPayload).toStrictEqual(
        Array.from(payload.slice(offset, offset + chunkPayload.length)),
      );
      offset += chunkPayload.length;
    }
    expect(offset).toBe(payload.length);
  });
});

describe("chunkFrames", () => {
  it("splits a single frame into <=20-byte pieces", () => {
    const frame = Uint8Array.from({ length: 45 }, (_, i) => i);
    const chunks = chunkFrames([frame]);
    expect(chunks.length).toBe(3); // 20 + 20 + 5
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(20);
    }
    expect(chunks.flatMap((c) => Array.from(c))).toStrictEqual(
      Array.from(frame),
    );
  });

  it("does not merge the tail of one frame with the head of the next (ack-gating needs a clean frame boundary)", () => {
    const frameA = Uint8Array.from({ length: 25 }, () => 0xaa); // 2 chunks: 20 + 5
    const frameB = Uint8Array.from({ length: 5 }, () => 0xbb); // 1 chunk: 5
    const chunks = chunkFrames([frameA, frameB]);
    expect(chunks.length).toBe(3);
    expect(Array.from(chunks[0])).toStrictEqual(new Array(20).fill(0xaa));
    expect(Array.from(chunks[1])).toStrictEqual(new Array(5).fill(0xaa));
    expect(Array.from(chunks[2])).toStrictEqual(new Array(5).fill(0xbb));
  });

  it("handles a frame exactly 20 bytes as a single chunk", () => {
    const frame = Uint8Array.from({ length: 20 }, (_, i) => i);
    const chunks = chunkFrames([frame]);
    expect(chunks.length).toBe(1);
    expect(Array.from(chunks[0])).toStrictEqual(Array.from(frame));
  });

  it("handles an empty frame list", () => {
    expect(chunkFrames([])).toStrictEqual([]);
  });
});

describe("reassemble", () => {
  it("returns null until the stop flag chunk arrives, then the complete frame", () => {
    const frame = Uint8Array.from({ length: 45 }, (_, i) => i % 250);
    // Force it to look like a real frame (start/stop flags) so this test
    // also exercises a realistic shape.
    const framed = Uint8Array.from([0xf1, ...frame.slice(1, -1), 0xf2]);
    const chunks = chunkFrames([framed]);
    const r = reassemble();
    const results = chunks.map((c) => r.push(c));
    expect(results.slice(0, -1).every((x) => x === null)).toBe(true);
    expect(results[results.length - 1]).not.toBeNull();
    expect(Array.from(results[results.length - 1] as Uint8Array)).toStrictEqual(
      Array.from(framed),
    );
  });

  it("chunk/reassemble identity: reassemble(chunkFrames([f])) recovers f exactly, for every frame packPayload produces from an adversarial payload", () => {
    const payload = Uint8Array.from(
      { length: 300 },
      (_, i) => [0xf0, 0xf1, 0xf2, 0xf3, 0x42][i % 5],
    );
    const frames = packPayload(payload);
    const chunks = chunkFrames(frames);
    const r = reassemble();
    const recoveredFrames: Uint8Array[] = [];
    for (const chunk of chunks) {
      const result = r.push(chunk);
      if (result !== null) {
        recoveredFrames.push(result);
      }
    }
    expect(recoveredFrames.length).toBe(frames.length);
    for (let i = 0; i < frames.length; i += 1) {
      expect(Array.from(recoveredFrames[i])).toStrictEqual(
        Array.from(frames[i]),
      );
    }
  });

  it("treats the byte immediately after a stuff flag as an opaque code, even when that byte's raw value equals the stop flag", () => {
    // A corrupted/garbled stream: 0xF3 followed by a byte that happens to
    // equal STOP_FLAG (0xF2) — not a real stop flag, just whatever landed
    // in the "code" position. reassemble must consume it as part of the
    // stuff pair (skip 2) and keep scanning for the REAL stop flag,
    // rather than terminating the frame right there. This is the
    // distinguishing case for the stuff-pair-skip logic: a byte-by-byte
    // scan that does not treat the code byte as opaque would stop one
    // byte early and hand parseFrame a truncated, wrong frame instead of
    // the frame that lets parseFrame itself report "unknown-stuff-code".
    const buffer = Uint8Array.from([0xf1, 0x00, 0xf3, 0xf2, 0x00, 0xf2]);
    const r = reassemble();
    const result = r.push(buffer);
    expect(result).not.toBeNull();
    expect(Array.from(result as Uint8Array)).toStrictEqual(Array.from(buffer));
  });

  it("does not mistake a stuffed stop-flag byte pair (0xF3 0x02) inside the payload for the real stop flag", () => {
    // A payload containing 0xF2 gets stuffed to 0xF3,0x02 by buildFrame.
    // reassemble must skip that pair, not terminate the frame there.
    const payload = Uint8Array.from([0xf2, 0x42, 0xf2]);
    const frames = packPayload(payload);
    expect(frames.length).toBe(1);
    const chunks = chunkFrames(frames);
    const r = reassemble();
    let result: Uint8Array | null = null;
    for (const chunk of chunks) {
      result = r.push(chunk);
    }
    expect(result).not.toBeNull();
    expect(Array.from(result as Uint8Array)).toStrictEqual(
      Array.from(frames[0]),
    );
  });

  it("discards leading noise before the first start flag", () => {
    // The second noise byte is deliberately 0xF3 (the stuff flag): if the
    // leading-noise trim were ever removed (a mutant that starts scanning
    // from index 0 of the raw buffer instead of trimming to the first
    // start flag), the scan would treat this 0xF3 as a stuff flag and
    // skip the NEXT byte (buffer[2], the real 0xF1) as an opaque stuff
    // code — silently skipping past the real start flag instead of
    // finding it. Noise of two arbitrary non-flag bytes (e.g. 0x99, 0x88)
    // can't distinguish "trim happened" from "trim was removed", because
    // a byte-by-byte scan without any trim at all still eventually walks
    // past two ordinary bytes and finds the same start flag by accident.
    const frame = Uint8Array.from([0xf1, 0x00, 0x42, 0x42, 0xf2]);
    const noisy = Uint8Array.from([0x99, 0xf3, ...frame]);
    const r = reassemble();
    const result = r.push(noisy);
    expect(result).not.toBeNull();
    expect(Array.from(result as Uint8Array)).toStrictEqual(Array.from(frame));
  });

  it("resyncs on an unexpected new start flag before the previous frame closed (discards the incomplete frame)", () => {
    const incomplete = Uint8Array.from([0xf1, 0x00, 0x00]); // no stop flag yet
    const real = Uint8Array.from([0xf1, 0x01, 0x02, 0xf2]);
    const r = reassemble();
    expect(r.push(incomplete)).toBeNull();
    const result = r.push(real);
    expect(result).not.toBeNull();
    expect(Array.from(result as Uint8Array)).toStrictEqual(Array.from(real));
  });

  it("handles two complete frames arriving in a single push", () => {
    const frameA = Uint8Array.from([0xf1, 0x01, 0xf2]);
    const frameB = Uint8Array.from([0xf1, 0x02, 0x03, 0xf2]);
    const both = Uint8Array.from([...frameA, ...frameB]);
    const r = reassemble();
    const first = r.push(both);
    expect(first).not.toBeNull();
    expect(Array.from(first as Uint8Array)).toStrictEqual(Array.from(frameA));
    // The second frame is buffered internally; the next push (even an
    // empty one) should surface it.
    const second = r.push(Uint8Array.from([]));
    expect(second).not.toBeNull();
    expect(Array.from(second as Uint8Array)).toStrictEqual(Array.from(frameB));
  });

  it("returns null while waiting for a start flag that never comes", () => {
    const r = reassemble();
    expect(r.push(Uint8Array.from([0x00, 0x01, 0x02]))).toBeNull();
  });

  it("caps an open (unclosed) frame at 120 bytes and resyncs, rather than growing the buffer without bound (the reviewer's missing-stop-flag probe shape)", () => {
    // A garbled/corrupted stream: a start flag followed by thousands of
    // non-flag bytes with no stop flag anywhere near — and then, far
    // beyond the 120-byte frame cap, a byte that happens to have the
    // stop-flag value purely by coincidence. Before the cap existed,
    // reassemble() would keep scanning (and the internal buffer would
    // keep growing) until it hit that stray byte, then return a
    // thousands-of-bytes "frame" — which parseFrame would go on to
    // reject, but only after the buffer had already grown unbounded.
    // With the cap, the open frame is dropped at the 120-byte boundary,
    // long before the stray byte is ever reached, and this push must
    // return null (nothing salvageable yet), not a giant frame.
    const garbage = new Array(5000).fill(0x00);
    garbage[5003] = 0xf2; // a stray, coincidental "stop flag" value byte
    const probe = Uint8Array.from([0xf1, ...garbage]);
    const r = reassemble();
    const result = r.push(probe);
    expect(result).toBeNull();
  });

  it("a real frame following a dropped over-budget open frame is still found on a later push", () => {
    const tooLong = Uint8Array.from([0xf1, ...new Array(150).fill(0x00)]); // no stop flag, 151 bytes
    const real = Uint8Array.from([0xf1, 0x01, 0x02, 0xf2]);
    const r = reassemble();
    expect(r.push(tooLong)).toBeNull();
    const result = r.push(real);
    expect(result).not.toBeNull();
    expect(Array.from(result as Uint8Array)).toStrictEqual(Array.from(real));
  });

  it("a frame that closes at exactly 120 bytes total is NOT dropped — the cap is 'over 120', not 'at 120'", () => {
    // 119 bytes buffered so far (start flag + 118 more), no stop flag yet
    // — still within budget, since the very next byte closing the frame
    // (making a 120-byte total frame) is exactly at the cap, not over it.
    // Dropping one byte too early (an off-by-one in the OTHER direction
    // from the reviewer's probe) would discard a legitimate in-flight
    // frame whose stop flag is the very next byte.
    const openPrefix = Uint8Array.from([0xf1, ...new Array(118).fill(0x00)]);
    expect(openPrefix.length).toBe(119);
    const r = reassemble();
    expect(r.push(openPrefix)).toBeNull();
    // Completing it with the next byte as the stop flag makes a 120-byte
    // total frame — must still work, proving the frame was retained, not
    // dropped, right up to and including the cap.
    const completed = r.push(Uint8Array.from([0xf2]));
    expect(completed).not.toBeNull();
    const expectedFrame = Uint8Array.from([
      0xf1,
      ...new Array(118).fill(0x00),
      0xf2,
    ]);
    expect(expectedFrame.length).toBe(120);
    expect(Array.from(completed as Uint8Array)).toStrictEqual(
      Array.from(expectedFrame),
    );
  });

  it("when an over-budget open frame is dropped, a fresh start flag already present LATER in the same buffer is found immediately (no extra push needed)", () => {
    // The over-long garbage run contains a second start flag partway
    // through, followed by a real, well-formed frame — all delivered in
    // one push. Dropping the first (over-budget) open frame must resync
    // to that embedded start flag and find the real frame right away,
    // not only on some later push.
    const garbage = new Array(150).fill(0x00); // 150 > MAX_FRAME_BYTES, no stop flag in it
    const real = [0xf1, 0x01, 0x02, 0xf2];
    const probe = Uint8Array.from([0xf1, ...garbage, ...real]);
    const r = reassemble();
    const result = r.push(probe);
    expect(result).not.toBeNull();
    expect(Array.from(result as Uint8Array)).toStrictEqual(real);
  });

  it("a stop flag landing exactly at the 121st byte does NOT close the frame — the cap must be checked before that byte, not after", () => {
    // Unlike the all-garbage probes above, this stop flag is real and
    // sits exactly at the disputed boundary: 119 filler bytes + a stop
    // flag as byte 121 (start flag + 119 + stop = 121 total). A frame
    // this long is already one byte over the 120-byte cap. A `>` instead
    // of `>=` in the cap comparator would let the scan reach this byte
    // and accept it as a valid (but over-budget) 121-byte frame; the
    // correct comparator must drop the open frame the moment scanning
    // reaches position 120, before ever looking at this byte.
    const oneByteOver = Uint8Array.from([
      0xf1,
      ...new Array(119).fill(0x00),
      0xf2,
    ]);
    expect(oneByteOver.length).toBe(121);
    const r = reassemble();
    expect(r.push(oneByteOver)).toBeNull();
    // Nothing should be left open either: a fresh, well-formed frame
    // arriving next must be found on its own, not appended to a
    // wrongly-retained 121-byte frame.
    const real = Uint8Array.from([0xf1, 0x01, 0x02, 0xf2]);
    const result = r.push(real);
    expect(result).not.toBeNull();
    expect(Array.from(result as Uint8Array)).toStrictEqual(Array.from(real));
  });

  it("each call to reassemble() starts with independent state", () => {
    const frame = Uint8Array.from([0xf1, 0x01, 0xf2]);
    const r1 = reassemble();
    r1.push(frame);
    const r2 = reassemble();
    // r2 has seen nothing yet — pushing only the first byte must not
    // return a frame.
    expect(r2.push(Uint8Array.from([0xf1]))).toBeNull();
  });
});
