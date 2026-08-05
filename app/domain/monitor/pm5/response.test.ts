import { describe, expect, it } from "vitest";
import { parseFrame } from "../csafe.js";
import { buildAckFrame, parseCsafeResponse } from "./response.js";

// The four conformance vectors, interface-notes.md §6 (R1-R3 pre-existing,
// R4 added this round — the doc's own response to its 4-interval Variable
// Interval command, the best available full-length programming-ack shape).
// Checksums independently recomputed via the XOR rule, not copied.

describe("parseCsafeResponse: conformance vectors (interface-notes.md §6, §16)", () => {
  it("R1 (status=01): Fixed Distance response — single bare opcode, no wrapper", () => {
    const frame = Uint8Array.from([0xf1, 0x01, 0x1a, 0x00, 0x1b, 0xf2]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      status: "ok",
      commandIds: [0x1a],
    });
  });

  it("R1 (status=81): the same shape with the reject status byte", () => {
    const frame = Uint8Array.from([0xf1, 0x81, 0x1a, 0x00, 0x9b, 0xf2]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      status: "reject",
      commandIds: [0x1a],
    });
  });

  it("R2 (status=01): JustRow response — 0x76 wrapper, two echoed opcodes", () => {
    const frame = Uint8Array.from([
      0xf1, 0x01, 0x76, 0x02, 0x01, 0x13, 0x67, 0xf2,
    ]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      status: "ok",
      commandIds: [0x01, 0x13],
    });
  });

  it("R2 (status=81): the same shape with the reject status byte", () => {
    const frame = Uint8Array.from([
      0xf1, 0x81, 0x76, 0x02, 0x01, 0x13, 0xe7, 0xf2,
    ]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      status: "reject",
      commandIds: [0x01, 0x13],
    });
  });

  it("R3: Get Force Curve response — unexpected status byte (0x09) is not crashed on, buckets to reject", () => {
    const frame = Uint8Array.from([
      0xf1, 0x09, 0x1a, 0x03, 0xbf, 0x01, 0x04, 0xaa, 0xf2,
    ]);
    // 0x09 is neither the success byte (0x01) nor the documented reject
    // byte (0x81) — this is a live-data response, not a program-command
    // ack (interface-notes.md §6's own R3 note). The binary status type
    // buckets anything non-0x01 to "reject"; commandIds is the single
    // bare top opcode (0x1A is not the 0x76 wrapper), and the trailing
    // "03 BF 01 04" is correctly NOT decoded as a further opcode list.
    expect(parseCsafeResponse(frame)).toStrictEqual({
      status: "reject",
      commandIds: [0x1a],
    });
  });

  it("R4 (status=01): the Variable Interval example's own full-length programming ack", () => {
    const frame = Uint8Array.from([
      0xf1, 0x01, 0x76, 0x1a, 0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18,
      0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18,
      0x17, 0x03, 0x04, 0x06, 0x14, 0x13, 0x7f, 0xf2,
    ]);
    const result = parseCsafeResponse(frame);
    expect(result.status).toBe("ok");
    expect(result.commandIds).toHaveLength(26);
    expect(result.commandIds).toStrictEqual([
      0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06,
      0x14, 0x18, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06,
      0x14, 0x13,
    ]);
  });

  it("R4 (status=81): the same 26-opcode ack with the reject status byte", () => {
    const frame = Uint8Array.from([
      0xf1, 0x81, 0x76, 0x1a, 0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18,
      0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18,
      0x17, 0x03, 0x04, 0x06, 0x14, 0x13, 0xff, 0xf2,
    ]);
    const result = parseCsafeResponse(frame);
    expect(result.status).toBe("reject");
    expect(result.commandIds).toHaveLength(26);
  });
});

describe("parseCsafeResponse: total parsing — malformed input never throws", () => {
  it("a checksum-corrupt frame (fails csafe.parseFrame) buckets to reject with no commandIds", () => {
    // R1's frame with the checksum byte flipped.
    const frame = Uint8Array.from([0xf1, 0x01, 0x1a, 0x00, 0xff, 0xf2]);
    // Confirm this really is a parseFrame failure, not an accident.
    expect("error" in parseFrame(frame)).toBe(true);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      status: "reject",
      commandIds: [],
    });
  });

  it("an empty frame buckets to reject with no commandIds", () => {
    expect(parseCsafeResponse(Uint8Array.from([]))).toStrictEqual({
      status: "reject",
      commandIds: [],
    });
  });

  it("a well-FORMED frame whose payload is zero bytes (no status byte at all) buckets to reject, not a crash on payload[0]", () => {
    // F1 <checksum> F2 with the single content byte being the checksum
    // itself (of an empty payload, XOR-of-nothing = 0) — this passes
    // csafe.parseFrame's checksum/flag checks (a genuinely different path
    // from the "parseFrame itself failed" case above) but leaves nothing
    // for payload[0] to read.
    expect("payload" in parseFrame(Uint8Array.from([0xf1, 0x00, 0xf2]))).toBe(
      true,
    );
    expect(
      parseCsafeResponse(Uint8Array.from([0xf1, 0x00, 0xf2])),
    ).toStrictEqual({
      status: "reject",
      commandIds: [],
    });
  });

  it("a frame with only a status byte (no top opcode) buckets by status with no commandIds", () => {
    // F1 01 <checksum-of-just-01> F2
    const frame = Uint8Array.from([0xf1, 0x01, 0x01, 0xf2]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      status: "ok",
      commandIds: [],
    });
  });

  it("a 0x76-wrapped response with a top opcode but no count byte at all defaults to zero echoed opcodes", () => {
    // F1 01 76 <checksum-of-01-76> F2 -- the wrapper opcode is present but
    // truncated before its own count byte.
    const content = [0x01, 0x76];
    const checksum = content.reduce((a, b) => a ^ b, 0);
    const frame = Uint8Array.from([0xf1, ...content, checksum, 0xf2]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      status: "ok",
      commandIds: [],
    });
  });

  it("a 0x76-wrapped response whose declared count exceeds the remaining bytes truncates gracefully, never throws or fabricates extra ids", () => {
    // 76, count=10 (declares 10 opcodes), but only 2 actually follow.
    const content = [0x01, 0x76, 0x0a, 0x01, 0x13];
    const checksum = content.reduce((a, b) => a ^ b, 0);
    const frame = Uint8Array.from([0xf1, ...content, checksum, 0xf2]);
    const result = parseCsafeResponse(frame);
    expect(result.status).toBe("ok");
    expect(result.commandIds).toStrictEqual([0x01, 0x13]); // whatever is actually present, no undefined padding
  });
});

describe("buildAckFrame: the inverse of parseCsafeResponse's wrapper branch", () => {
  it("round-trips an ok ack through parseCsafeResponse", () => {
    const frame = buildAckFrame("ok", [0x18, 0x17, 0x03, 0x04, 0x06, 0x14]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      status: "ok",
      commandIds: [0x18, 0x17, 0x03, 0x04, 0x06, 0x14],
    });
  });

  it("round-trips a reject ack through parseCsafeResponse", () => {
    const frame = buildAckFrame("reject", [0x13]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      status: "reject",
      commandIds: [0x13],
    });
  });

  it("matches R2's exact bytes when building the same ack it represents", () => {
    const frame = buildAckFrame("ok", [0x01, 0x13]);
    expect(Array.from(frame)).toStrictEqual([
      0xf1, 0x01, 0x76, 0x02, 0x01, 0x13, 0x67, 0xf2,
    ]);
  });

  it("matches R4's exact bytes when building the full 26-opcode programming ack", () => {
    const frame = buildAckFrame(
      "ok",
      [
        0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06,
        0x14, 0x18, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06,
        0x14, 0x13,
      ],
    );
    expect(Array.from(frame)).toStrictEqual([
      0xf1, 0x01, 0x76, 0x1a, 0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18,
      0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18,
      0x17, 0x03, 0x04, 0x06, 0x14, 0x13, 0x7f, 0xf2,
    ]);
  });
});
