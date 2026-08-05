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

  it("packs an empty payload into a single (checksum-only) frame", () => {
    const frames = packPayload(Uint8Array.from([]));
    expect(frames.length).toBe(1);
    expect(unwrapPayload(frames[0])).toStrictEqual([]);
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
    const frame = Uint8Array.from([0xf1, 0x00, 0x42, 0x42, 0xf2]);
    const noisy = Uint8Array.from([0x99, 0x88, ...frame]);
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
