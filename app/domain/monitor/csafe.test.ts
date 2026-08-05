import { describe, expect, it } from "vitest";
import {
  buildFrame,
  isFlagByte,
  parseFrame,
  stuffedByteLength,
  type CsafeParseError,
} from "./csafe.js";

// Byte-vector conformance tests. Every payload and checksum below is cited
// in docs/monitor/pm5-interface-notes.md §6, which cites the fetched CSAFE
// Communication Definition rev 0.27 (pp.79-89). The "content" arrays below
// are the frame contents EXCLUDING the start flag, checksum, and stop flag —
// i.e. exactly what `buildFrame` takes as `payload`.

/**
 * Unwraps a parseFrame result to its payload, throwing (never a
 * conditional `expect`) if it was an error — so a parse failure fails the
 * test loudly instead of the assertion silently not running.
 */
function expectPayload(
  result: { payload: Uint8Array } | { error: CsafeParseError },
): number[] {
  if (!("payload" in result)) {
    throw new Error(
      `expected a payload, got error: ${JSON.stringify(result.error)}`,
    );
  }
  return Array.from(result.payload);
}

const GOOD_VECTORS: Array<{
  name: string;
  page: string;
  content: number[];
  checksum: number;
  frame: number[];
}> = [
  {
    name: "Predefined - Standard List Workout #3 (public CSAFE, short frame)",
    page: "CSAFE doc p.79-80",
    content: [0x24, 0x02, 0x03, 0x00],
    checksum: 0x25,
    frame: [0xf1, 0x24, 0x02, 0x03, 0x00, 0x25, 0xf2],
  },
  {
    name: "JustRow",
    page: "CSAFE doc p.80",
    content: [0x76, 0x07, 0x01, 0x01, 0x01, 0x13, 0x02, 0x01, 0x01],
    checksum: 0x61,
    frame: [
      0xf1, 0x76, 0x07, 0x01, 0x01, 0x01, 0x13, 0x02, 0x01, 0x01, 0x61, 0xf2,
    ],
  },
  {
    name: "Fixed Distance 2000m/500m splits (proprietary)",
    page: "CSAFE doc p.81",
    content: [
      0x76, 0x18, 0x01, 0x01, 0x03, 0x03, 0x05, 0x80, 0x00, 0x00, 0x07, 0xd0,
      0x05, 0x05, 0x80, 0x00, 0x00, 0x01, 0x90, 0x14, 0x01, 0x01, 0x13, 0x02,
      0x01, 0x01,
    ],
    checksum: 0x28,
    frame: [
      0xf1, 0x76, 0x18, 0x01, 0x01, 0x03, 0x03, 0x05, 0x80, 0x00, 0x00, 0x07,
      0xd0, 0x05, 0x05, 0x80, 0x00, 0x00, 0x01, 0x90, 0x14, 0x01, 0x01, 0x13,
      0x02, 0x01, 0x01, 0x28, 0xf2,
    ],
  },
  {
    name: "Fixed Time 20:00/4:00 splits (proprietary)",
    page: "CSAFE doc p.81-82",
    content: [
      0x76, 0x18, 0x01, 0x01, 0x05, 0x03, 0x05, 0x00, 0x00, 0x01, 0xd4, 0xc0,
      0x05, 0x05, 0x00, 0x00, 0x00, 0x5d, 0xc0, 0x14, 0x01, 0x01, 0x13, 0x02,
      0x01, 0x01,
    ],
    checksum: 0xe0,
    frame: [
      0xf1, 0x76, 0x18, 0x01, 0x01, 0x05, 0x03, 0x05, 0x00, 0x00, 0x01, 0xd4,
      0xc0, 0x05, 0x05, 0x00, 0x00, 0x00, 0x5d, 0xc0, 0x14, 0x01, 0x01, 0x13,
      0x02, 0x01, 0x01, 0xe0, 0xf2,
    ],
  },
  {
    name: "Fixed Distance Interval 500m/:30 rest",
    page: "CSAFE doc p.83",
    content: [
      0x76, 0x15, 0x01, 0x01, 0x07, 0x03, 0x05, 0x80, 0x00, 0x00, 0x01, 0xf4,
      0x04, 0x02, 0x00, 0x1e, 0x14, 0x01, 0x01, 0x13, 0x02, 0x01, 0x01,
    ],
    checksum: 0x0a,
    frame: [
      0xf1, 0x76, 0x15, 0x01, 0x01, 0x07, 0x03, 0x05, 0x80, 0x00, 0x00, 0x01,
      0xf4, 0x04, 0x02, 0x00, 0x1e, 0x14, 0x01, 0x01, 0x13, 0x02, 0x01, 0x01,
      0x0a, 0xf2,
    ],
  },
  {
    name: "Variable Interval Undefined Rest v100m...2",
    page: "CSAFE doc p.87-88",
    content: [
      0x76, 0x45, 0x18, 0x01, 0x00, 0x01, 0x01, 0x08, 0x17, 0x01, 0x04, 0x03,
      0x05, 0x80, 0x00, 0x00, 0x00, 0x64, 0x04, 0x02, 0x00, 0x00, 0x06, 0x04,
      0x00, 0x00, 0x32, 0xc8, 0x14, 0x01, 0x01, 0x18, 0x01, 0x01, 0x17, 0x01,
      0x03, 0x03, 0x05, 0x00, 0x00, 0x00, 0x2e, 0xe0, 0x04, 0x02, 0x00, 0x00,
      0x06, 0x04, 0x00, 0x00, 0x32, 0xc8, 0x14, 0x01, 0x01, 0x01, 0x01, 0x09,
      0x05, 0x05, 0x80, 0x00, 0x00, 0x00, 0x00, 0x13, 0x02, 0x01, 0x01,
    ],
    checksum: 0x8f,
    frame: [
      0xf1, 0x76, 0x45, 0x18, 0x01, 0x00, 0x01, 0x01, 0x08, 0x17, 0x01, 0x04,
      0x03, 0x05, 0x80, 0x00, 0x00, 0x00, 0x64, 0x04, 0x02, 0x00, 0x00, 0x06,
      0x04, 0x00, 0x00, 0x32, 0xc8, 0x14, 0x01, 0x01, 0x18, 0x01, 0x01, 0x17,
      0x01, 0x03, 0x03, 0x05, 0x00, 0x00, 0x00, 0x2e, 0xe0, 0x04, 0x02, 0x00,
      0x00, 0x06, 0x04, 0x00, 0x00, 0x32, 0xc8, 0x14, 0x01, 0x01, 0x01, 0x01,
      0x09, 0x05, 0x05, 0x80, 0x00, 0x00, 0x00, 0x00, 0x13, 0x02, 0x01, 0x01,
      0x8f, 0xf2,
    ],
  },
];

describe("buildFrame — the six verified-good byte vectors", () => {
  it.each(GOOD_VECTORS)(
    "$name ($page) frames exactly as documented",
    ({ content, frame }) => {
      expect(Array.from(buildFrame(Uint8Array.from(content)))).toStrictEqual(
        frame,
      );
    },
  );

  it.each(GOOD_VECTORS)(
    "$name: our XOR checksum agrees with the document's printed checksum",
    ({ content, checksum }) => {
      const built = buildFrame(Uint8Array.from(content));
      // The checksum is the second-to-last byte (no stuffing needed in any
      // of these six vectors — none of their bytes are 0xF0-0xF3).
      expect(built[built.length - 2]).toBe(checksum);
    },
  );
});

describe("parseFrame — the six verified-good byte vectors round-trip", () => {
  it.each(GOOD_VECTORS)(
    "$name parses back to its content",
    ({ content, frame }) => {
      const result = parseFrame(Uint8Array.from(frame));
      expect(expectPayload(result)).toStrictEqual(content);
    },
  );
});

// §Errata (design doc §3, spec-review.md M1): three of the document's own
// printed example frames fail the document's own XOR checksum rule. The
// discipline here (also stated in the design spec) is: payloads are
// transcribed from the document; checksums are asserted against OUR
// implementation of THE RULE, and the document's wrong printed value is
// recorded only as a comment citing the discrepancy — never asserted as
// the expected output. A test encoding the document's printed value here
// would be a test a CORRECT implementation fails.
describe("buildFrame — the three errata cases (§Errata, M1)", () => {
  it("Fixed Time Interval 2:00/:30 rest (CSAFE doc p.83-84): doc prints 0x0A, the XOR rule computes 0xB0", () => {
    const content = Uint8Array.from([
      0x76, 0x15, 0x01, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, 0x00, 0x2e, 0xe0,
      0x04, 0x02, 0x00, 0x1e, 0x14, 0x01, 0x01, 0x13, 0x02, 0x01, 0x01,
    ]);
    const built = buildFrame(content);
    // OUR checksum, per the rule (XOR of the unstuffed content bytes) —
    // NOT the document's printed 0x0A.
    expect(built[built.length - 2]).toBe(0xb0);
    expect(built[built.length - 2]).not.toBe(0x0a);
  });

  it("Variable Interval v500m/1:00r...4 (CSAFE doc p.85-87, the 116-byte load-bearing example): doc prints 0xC6, the XOR rule computes 0x09", () => {
    const content = Uint8Array.from([
      0x76, 0x6f, 0x18, 0x01, 0x00, 0x01, 0x01, 0x08, 0x17, 0x01, 0x01, 0x03,
      0x05, 0x80, 0x00, 0x00, 0x01, 0xf4, 0x04, 0x02, 0x00, 0x3c, 0x06, 0x04,
      0x00, 0x00, 0x27, 0x10, 0x14, 0x01, 0x01, 0x18, 0x01, 0x01, 0x17, 0x01,
      0x00, 0x03, 0x05, 0x00, 0x00, 0x00, 0x46, 0x50, 0x04, 0x02, 0x00, 0x00,
      0x06, 0x04, 0x00, 0x00, 0x27, 0x10, 0x14, 0x01, 0x01, 0x18, 0x01, 0x02,
      0x17, 0x01, 0x01, 0x03, 0x05, 0x80, 0x00, 0x00, 0x03, 0xe8, 0x04, 0x02,
      0x00, 0x00, 0x06, 0x04, 0x00, 0x00, 0x27, 0x10, 0x14, 0x01, 0x01, 0x18,
      0x01, 0x03, 0x17, 0x01, 0x00, 0x03, 0x05, 0x00, 0x00, 0x00, 0x75, 0x30,
      0x04, 0x02, 0x00, 0x78, 0x06, 0x04, 0x00, 0x00, 0x27, 0x10, 0x14, 0x01,
      0x01, 0x13, 0x02, 0x01, 0x01,
    ]);
    expect(content.length).toBe(113); // 116-byte frame minus F1/checksum/F2
    const built = buildFrame(content);
    expect(built.length).toBe(116);
    // OUR checksum, per the rule — NOT the document's printed 0xC6.
    expect(built[built.length - 2]).toBe(0x09);
    expect(built[built.length - 2]).not.toBe(0xc6);
  });

  it("Terminate Workout (CSAFE doc p.89): doc prints 0x62, the XOR rule computes 0x60", () => {
    const content = Uint8Array.from([0x76, 0x04, 0x13, 0x02, 0x01, 0x02]);
    const built = buildFrame(content);
    // OUR checksum, per the rule — NOT the document's printed 0x62.
    expect(built[built.length - 2]).toBe(0x60);
    expect(built[built.length - 2]).not.toBe(0x62);
  });
});

describe("buildFrame — byte stuffing", () => {
  it("stuffs a payload byte equal to each of the four flag values", () => {
    const built = buildFrame(Uint8Array.from([0xf0, 0xf1, 0xf2, 0xf3]));
    // start flag, then each payload byte stuffed to two bytes, then the
    // checksum (0xf0^0xf1^0xf2^0xf3 = 0x00, not a flag byte, unstuffed),
    // then stop flag.
    expect(Array.from(built)).toStrictEqual([
      0xf1,
      0xf3,
      0x00, // stuffed 0xF0
      0xf3,
      0x01, // stuffed 0xF1
      0xf3,
      0x02, // stuffed 0xF2
      0xf3,
      0x03, // stuffed 0xF3
      0x00, // checksum: 0xF0 ^ 0xF1 ^ 0xF2 ^ 0xF3 = 0x00
      0xf2,
    ]);
  });

  it("stuffs the checksum byte itself when it collides with a flag value", () => {
    // A payload of [0xF2] alone has checksum 0xF2 — the checksum byte
    // itself needs stuffing (interface-notes.md §1, citing the document's
    // own annotation on the Fixed Distance response example, p.80).
    const built = buildFrame(Uint8Array.from([0xf2]));
    expect(Array.from(built)).toStrictEqual([
      0xf1, 0xf3, 0x02, 0xf3, 0x02, 0xf2,
    ]);
  });

  it("handles an empty payload (checksum of nothing is 0x00)", () => {
    const built = buildFrame(Uint8Array.from([]));
    expect(Array.from(built)).toStrictEqual([0xf1, 0x00, 0xf2]);
  });
});

describe("parseFrame — error cases (total parse, never throws)", () => {
  it("rejects a frame missing the start flag", () => {
    const result = parseFrame(Uint8Array.from([0x00, 0x00, 0xf2]));
    expect(result).toStrictEqual({ error: { kind: "missing-start-flag" } });
  });

  it("rejects a frame missing the stop flag", () => {
    const result = parseFrame(Uint8Array.from([0xf1, 0x00, 0x00]));
    expect(result).toStrictEqual({ error: { kind: "missing-stop-flag" } });
  });

  it("rejects an empty frame (start flag directly followed by stop flag)", () => {
    const result = parseFrame(Uint8Array.from([0xf1, 0xf2]));
    expect(result).toStrictEqual({ error: { kind: "empty-frame" } });
  });

  it("rejects a checksum mismatch", () => {
    // A well-formed JustRow frame with the checksum byte corrupted.
    const corrupted = Uint8Array.from([
      0xf1, 0x76, 0x07, 0x01, 0x01, 0x01, 0x13, 0x02, 0x01, 0x01, 0x00, 0xf2,
    ]);
    const result = parseFrame(corrupted);
    expect(result).toStrictEqual({
      error: { kind: "checksum-mismatch", expected: 0x00, computed: 0x61 },
    });
  });

  it("rejects a dangling stuff flag at the end of the frame", () => {
    const result = parseFrame(Uint8Array.from([0xf1, 0x00, 0xf3, 0xf2]));
    expect(result).toStrictEqual({ error: { kind: "dangling-stuff-flag" } });
  });

  it("rejects an unknown stuff code", () => {
    const result = parseFrame(Uint8Array.from([0xf1, 0xf3, 0x99, 0xf2]));
    expect(result).toStrictEqual({
      error: { kind: "unknown-stuff-code", code: 0x99 },
    });
  });

  it("rejects a raw unstuffed flag byte inside the frame contents", () => {
    // 0xF0 appears bare (not preceded by the stuff flag) inside content —
    // a well-formed frame never produces this; a garbled stream might.
    const result = parseFrame(Uint8Array.from([0xf1, 0xf0, 0x00, 0xf2]));
    expect(result).toStrictEqual({
      error: { kind: "unstuffed-flag-byte", byte: 0xf0 },
    });
  });

  it("empty input is rejected as missing-start-flag, not a crash", () => {
    const result = parseFrame(Uint8Array.from([]));
    expect(result).toStrictEqual({ error: { kind: "missing-start-flag" } });
  });
});

describe("isFlagByte / stuffedByteLength", () => {
  it("identifies exactly the four flag values", () => {
    for (let b = 0; b <= 0xff; b += 1) {
      const expected = b === 0xf0 || b === 0xf1 || b === 0xf2 || b === 0xf3;
      expect(isFlagByte(b)).toBe(expected);
      expect(stuffedByteLength(b)).toBe(expected ? 2 : 1);
    }
  });
});

describe("property: roundtrip identity", () => {
  it("parseFrame(buildFrame(payload)) recovers payload, for every byte value 0x00-0xFF as a 1-byte payload", () => {
    for (let b = 0; b <= 0xff; b += 1) {
      const payload = Uint8Array.from([b]);
      const result = parseFrame(buildFrame(payload));
      expect(expectPayload(result)).toStrictEqual([b]);
    }
  });

  it("recovers adversarial max-stuffing payloads (every byte a flag value)", () => {
    const payloads = [
      Uint8Array.from(new Array(50).fill(0xf3)),
      Uint8Array.from(new Array(50).fill(0xf0)),
      Uint8Array.from([0xf0, 0xf1, 0xf2, 0xf3, 0xf0, 0xf1, 0xf2, 0xf3]),
    ];
    for (const payload of payloads) {
      const result = parseFrame(buildFrame(payload));
      expect(expectPayload(result)).toStrictEqual(Array.from(payload));
    }
  });

  it("recovers pseudo-random payloads of varying lengths", () => {
    let seed = 42;
    const rand = () => {
      // xorshift32 — deterministic, no dependency needed.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) % 256;
    };
    for (const length of [0, 1, 5, 26, 74, 113, 200]) {
      const payload = Uint8Array.from({ length }, () => rand() as number);
      const result = parseFrame(buildFrame(payload));
      expect(expectPayload(result)).toStrictEqual(Array.from(payload));
    }
  });
});
