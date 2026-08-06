import { describe, expect, it } from "vitest";
import { parseFrame } from "../csafe.js";
import {
  buildAckFrame,
  parseCsafeResponse,
  type CsafeFrameStatus,
  type CsafeResponse,
  type CsafeSlaveState,
} from "./response.js";

// The four conformance vectors, interface-notes.md §6 (R1-R3 pre-existing,
// R4 added a prior round — the doc's own response to its 4-interval
// Variable Interval command, the best available full-length programming-ack
// shape). Checksums independently recomputed via the XOR rule, not copied.
// Every vector's status byte is decoded under the interface-notes.md §19.1
// bitfield rule, NOT the old whole-byte compare — R1/R2/R4's "status=81"
// rows are accepts here (toggle-high, prev-OK, Ready), not rejects.

describe("parseCsafeResponse: conformance vectors (interface-notes.md §6, §16, §19.1)", () => {
  it("R1 (status=01): Fixed Distance response — single bare opcode, no wrapper", () => {
    const frame = Uint8Array.from([0xf1, 0x01, 0x1a, 0x00, 0x1b, 0xf2]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: false,
      commandIds: [0x1a],
    });
  });

  it("R1 (status=81): the toggle-high twin of the same response — an ACCEPT, not the reject the old whole-byte compare reported", () => {
    const frame = Uint8Array.from([0xf1, 0x81, 0x1a, 0x00, 0x9b, 0xf2]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: true,
      commandIds: [0x1a],
    });
  });

  it("R2 (status=01): JustRow response — 0x76 wrapper, two echoed opcodes", () => {
    const frame = Uint8Array.from([
      0xf1, 0x01, 0x76, 0x02, 0x01, 0x13, 0x67, 0xf2,
    ]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: false,
      commandIds: [0x01, 0x13],
    });
  });

  it("R2 (status=81): the toggle-high twin — still an accept", () => {
    const frame = Uint8Array.from([
      0xf1, 0x81, 0x76, 0x02, 0x01, 0x13, 0xe7, 0xf2,
    ]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: true,
      commandIds: [0x01, 0x13],
    });
  });

  it("R3: Get Force Curve response — status byte 0x09 (Off line slave state, NOT a rejection) is not crashed on", () => {
    const frame = Uint8Array.from([
      0xf1, 0x09, 0x1a, 0x03, 0xbf, 0x01, 0x04, 0xaa, 0xf2,
    ]);
    // 0x09 is toggle-low / prev-OK / Off line (interface-notes.md §19.1) —
    // a live-data response with the master's control taken away, not a
    // program-command rejection. commandIds is the single bare top opcode
    // (0x1A is not the 0x76 wrapper); the trailing "03 BF 01 04" is
    // correctly NOT decoded as a further opcode list.
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "offline",
      frameToggle: false,
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
    expect(result.kind).toBe("parsed");
    expect(result).toMatchObject({ frameStatus: "ok", frameToggle: false });
    expect((result as { commandIds: number[] }).commandIds).toStrictEqual([
      0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06,
      0x14, 0x18, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06,
      0x14, 0x13,
    ]);
  });

  it("R4 (status=81): the same 26-opcode ack, toggle-high — still an accept, not a reject", () => {
    const frame = Uint8Array.from([
      0xf1, 0x81, 0x76, 0x1a, 0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18,
      0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18,
      0x17, 0x03, 0x04, 0x06, 0x14, 0x13, 0xff, 0xf2,
    ]);
    const result = parseCsafeResponse(frame);
    expect(result).toMatchObject({
      kind: "parsed",
      frameStatus: "ok",
      frameToggle: true,
    });
    expect((result as { commandIds: number[] }).commandIds).toHaveLength(26);
  });
});

// interface-notes.md's own corrected record (near §17 item 1: "the PM's OWN
// ack checksums satisfy the XOR rule ... e.g. ack `f1 01 76 08 ... 77 f2`,
// hand-verified"). The doc elides the middle with "..."; the opcode fill
// used below is this task's own reconstruction of a real 8-opcode echo
// shape (between R2's 2-opcode and R4's 26-opcode vectors) and is
// independently self-verifying — the frame's checksum byte (`0x77`/`0xf7`
// below) was computed from these exact bytes via the same XOR rule `R1-R4`
// use, not copied from the doc.
describe("parseCsafeResponse: the doc's own hand-verified checksum shape, both toggle states", () => {
  const opcodes = [0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x13];

  it("status=01: an 8-opcode echo under the 0x76 wrapper", () => {
    const frame = Uint8Array.from([
      0xf1, 0x01, 0x76, 0x08, 0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x13,
      0x77, 0xf2,
    ]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: false,
      commandIds: opcodes,
    });
  });

  it("status=81: the toggle-high twin, same opcodes, different checksum", () => {
    const frame = Uint8Array.from([
      0xf1, 0x81, 0x76, 0x08, 0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x13,
      0xf7, 0xf2,
    ]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: true,
      commandIds: opcodes,
    });
  });
});

describe("parseCsafeResponse: the fix's own defect vectors — each one is a documented failure of the whole-byte compare this commit replaces", () => {
  it('0x81 decodes to an ACCEPT with the toggle bit set — today\'s whole-byte compare against 0x01 reports {status: "reject"} for this exact byte', () => {
    const frame = Uint8Array.from([0xf1, 0x81, 0x1a, 0x00, 0x9b, 0xf2]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: true,
      commandIds: [0x1a],
    });
  });

  it('0x09 decodes to an ACCEPT with slave state Off line — today\'s whole-byte compare reports {status: "reject"} for this exact byte', () => {
    const frame = Uint8Array.from([
      0xf1, 0x09, 0x1a, 0x03, 0xbf, 0x01, 0x04, 0xaa, 0xf2,
    ]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "offline",
      frameToggle: false,
      commandIds: [0x1a],
    });
  });

  it("0x11 genuinely rejects while 0x81 (today's mislabelled 'reject' constant) accepts — the discriminator that proves this is bits, not a single magic byte", () => {
    // f1 11 1a 00 <checksum> f2 — checksum recomputed via the XOR rule
    // (0x11 ^ 0x1a ^ 0x00 = 0x0b), not copied from anywhere.
    const rejectFrame = Uint8Array.from([0xf1, 0x11, 0x1a, 0x00, 0x0b, 0xf2]);
    const acceptFrame = Uint8Array.from([0xf1, 0x81, 0x1a, 0x00, 0x9b, 0xf2]);

    const rejectResult = parseCsafeResponse(rejectFrame);
    const acceptResult = parseCsafeResponse(acceptFrame);

    expect(rejectResult).toStrictEqual({
      kind: "parsed",
      frameStatus: "reject",
      slaveState: "ready",
      frameToggle: false,
      commandIds: [0x1a],
    });
    expect(acceptResult).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: true,
      commandIds: [0x1a],
    });
  });

  it("a checksum-corrupted frame is unparseable — and that is NOT the same value as any parsed reject", () => {
    // R1's frame with the checksum byte flipped.
    const frame = Uint8Array.from([0xf1, 0x01, 0x1a, 0x00, 0xff, 0xf2]);
    // Confirm this really is a parseFrame failure, not an accident.
    expect("error" in parseFrame(frame)).toBe(true);

    const result = parseCsafeResponse(frame);
    expect(result).toStrictEqual({ kind: "unparseable" });
    // The discriminator this defect fix depends on: today's code collapsed
    // "cannot be parsed at all" and "parsed as a genuine reject" into the
    // identical `{status: "reject", commandIds: []}` value. The new type
    // makes them structurally distinct — this is not equal to ANY parsed
    // response, reject included.
    const parsedReject: CsafeResponse = {
      kind: "parsed",
      frameStatus: "reject",
      slaveState: "ready",
      frameToggle: false,
      commandIds: [],
    };
    expect(result).not.toStrictEqual(parsedReject);
  });

  it("bit 6 (0x40, reserved/unassigned) is ignored on parse even when set — frameStatus and slaveState decode as if it were 0", () => {
    // f1 41 1a 00 <checksum> f2 (0x41 = bit6 | ready); checksum recomputed
    // via the XOR rule (0x41 ^ 0x1a ^ 0x00 = 0x5b).
    const frame = Uint8Array.from([0xf1, 0x41, 0x1a, 0x00, 0x5b, 0xf2]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: false,
      commandIds: [0x1a],
    });
  });
});

describe("parseCsafeResponse: slave-state decoding across the full nibble, including unassigned values", () => {
  // status byte = slaveState bits only (frameStatus "ok", toggle false) —
  // a bare-status frame (`f1 <status> <checksum-of-status> f2`, checksum of
  // a single byte is itself under XOR).
  const cases: Array<[number, CsafeSlaveState]> = [
    [0x00, "error"],
    [0x01, "ready"],
    [0x02, "idle"],
    [0x03, "have-id"],
    [0x05, "in-use"],
    [0x06, "paused"],
    [0x07, "finished"],
    [0x08, "manual"],
    [0x09, "offline"],
    [0x04, "unknown"], // csafe.h: "0x04 deliberately absent"
    [0x0a, "unknown"], // unassigned nibble, never observed on hardware
    [0x0f, "unknown"], // unassigned nibble, never observed on hardware
  ];

  for (const [byte, expected] of cases) {
    it(`0x${byte.toString(16).padStart(2, "0")} -> slaveState "${expected}"`, () => {
      const frame = Uint8Array.from([0xf1, byte, byte, 0xf2]);
      expect(parseCsafeResponse(frame)).toStrictEqual({
        kind: "parsed",
        frameStatus: "ok",
        slaveState: expected,
        frameToggle: false,
        commandIds: [],
      });
    });
  }
});

describe("parseCsafeResponse: total parsing — malformed input never throws, and is never mistaken for a parsed reject", () => {
  it("an empty frame is unparseable", () => {
    expect(parseCsafeResponse(Uint8Array.from([]))).toStrictEqual({
      kind: "unparseable",
    });
  });

  it("a well-FORMED frame whose payload is zero bytes (no status byte at all) is unparseable, not a crash on payload[0]", () => {
    // F1 <checksum> F2 with the single content byte being the checksum
    // itself (of an empty payload, XOR-of-nothing = 0) — this passes
    // csafe.parseFrame's checksum/flag checks (a genuinely different path
    // from the "parseFrame itself failed" case above) but leaves nothing
    // for payload[0] to read, so there is no bitfield to report.
    expect("payload" in parseFrame(Uint8Array.from([0xf1, 0x00, 0xf2]))).toBe(
      true,
    );
    expect(
      parseCsafeResponse(Uint8Array.from([0xf1, 0x00, 0xf2])),
    ).toStrictEqual({ kind: "unparseable" });
  });

  it("a frame with only a status byte (no top opcode) parses the bitfield with no commandIds", () => {
    // F1 01 <checksum-of-just-01> F2
    const frame = Uint8Array.from([0xf1, 0x01, 0x01, 0xf2]);
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: false,
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
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: false,
      commandIds: [],
    });
  });

  it("a 0x76-wrapped response whose declared count exceeds the remaining bytes truncates gracefully, never throws or fabricates extra ids", () => {
    // 76, count=10 (declares 10 opcodes), but only 2 actually follow.
    const content = [0x01, 0x76, 0x0a, 0x01, 0x13];
    const checksum = content.reduce((a, b) => a ^ b, 0);
    const frame = Uint8Array.from([0xf1, ...content, checksum, 0xf2]);
    const result = parseCsafeResponse(frame);
    expect(result).toMatchObject({ kind: "parsed", frameStatus: "ok" });
    expect((result as { commandIds: number[] }).commandIds).toStrictEqual([
      0x01, 0x13,
    ]); // whatever is actually present, no undefined padding
  });
});

describe("buildAckFrame: the inverse of parseCsafeResponse's wrapper branch", () => {
  it("defaults to ok/ready/toggle-false/no echo when called with no options", () => {
    const frame = buildAckFrame();
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: false,
      commandIds: [],
    });
  });

  it("round-trips an ok ack with an opcode echo through parseCsafeResponse", () => {
    const frame = buildAckFrame({
      frameStatus: "ok",
      commandIds: [0x18, 0x17, 0x03, 0x04, 0x06, 0x14],
    });
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: false,
      commandIds: [0x18, 0x17, 0x03, 0x04, 0x06, 0x14],
    });
  });

  it("round-trips a genuine reject ack through parseCsafeResponse", () => {
    const frame = buildAckFrame({ frameStatus: "reject", commandIds: [0x13] });
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "reject",
      slaveState: "ready",
      frameToggle: false,
      commandIds: [0x13],
    });
  });

  it("matches R2's exact bytes when building the same ack it represents", () => {
    const frame = buildAckFrame({
      frameStatus: "ok",
      commandIds: [0x01, 0x13],
    });
    expect(Array.from(frame)).toStrictEqual([
      0xf1, 0x01, 0x76, 0x02, 0x01, 0x13, 0x67, 0xf2,
    ]);
  });

  it("matches R4's exact bytes when building the full 26-opcode programming ack", () => {
    const frame = buildAckFrame({
      frameStatus: "ok",
      commandIds: [
        0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06,
        0x14, 0x18, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06,
        0x14, 0x13,
      ],
    });
    expect(Array.from(frame)).toStrictEqual([
      0xf1, 0x01, 0x76, 0x1a, 0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18,
      0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18,
      0x17, 0x03, 0x04, 0x06, 0x14, 0x13, 0x7f, 0xf2,
    ]);
  });

  it("matches the doc's own hand-verified 8-opcode checksum shape at status=81/toggle-high", () => {
    const frame = buildAckFrame({
      frameStatus: "ok",
      frameToggle: true,
      commandIds: [0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x13],
    });
    expect(Array.from(frame)).toStrictEqual([
      0xf1, 0x81, 0x76, 0x08, 0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x13,
      0xf7, 0xf2,
    ]);
  });

  it("emits 0x04 for slaveState \"unknown\" (csafe.h: '0x04 deliberately absent')", () => {
    const frame = buildAckFrame({ slaveState: "unknown" });
    expect(parseCsafeResponse(frame)).toStrictEqual({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "unknown",
      frameToggle: false,
      commandIds: [],
    });
  });

  it("never sets bit 6 (0x40) — a default-options frame's status byte is exactly 0x01", () => {
    const frame = buildAckFrame();
    // frame layout: f1 <status> 76 00 <checksum> f2
    expect(frame[1]).toBe(0x01);
  });
});

// Vector matrix (task brief): every frame status × both toggle states ×
// (empty echo, the doc's own hand-verified 8-opcode echo shape) — built via
// `buildAckFrame` and round-tripped through `parseCsafeResponse`, proving
// the two functions agree on all 16 combinations, independent of the
// hand-computed literal-byte vectors above.
describe("parseCsafeResponse/buildAckFrame: full vector matrix — 4 frame statuses x 2 toggles x 2 echo shapes", () => {
  const frameStatuses: CsafeFrameStatus[] = [
    "ok",
    "reject",
    "bad",
    "not-ready",
  ];
  const toggles = [false, true];
  const echoes: Array<{ label: string; commandIds: number[] }> = [
    { label: "empty echo", commandIds: [] },
    {
      label: "8-opcode echo (the doc's hand-verified shape)",
      commandIds: [0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x13],
    },
  ];

  for (const frameStatus of frameStatuses) {
    for (const frameToggle of toggles) {
      for (const echo of echoes) {
        it(`frameStatus=${frameStatus} frameToggle=${frameToggle} ${echo.label}`, () => {
          const frame = buildAckFrame({
            frameStatus,
            frameToggle,
            commandIds: echo.commandIds,
          });
          expect(parseCsafeResponse(frame)).toStrictEqual({
            kind: "parsed",
            frameStatus,
            slaveState: "ready",
            frameToggle,
            commandIds: echo.commandIds,
          });
        });
      }
    }
  }
});
