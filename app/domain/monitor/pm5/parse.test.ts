import { describe, expect, it } from "vitest";
import {
  HEARTRATE_NO_BELT,
  parseAdditionalSplitIntervalData,
  parseAdditionalStatus1,
  parseAdditionalStatus2,
  parseEndOfWorkoutSummary,
  parseGeneralStatus,
  parseSplitIntervalData,
  parseSummaryLogStamp,
  toIntervalActual,
  toMonitorFrame,
  toMonitorState,
  type Pm5ParseError,
  type RawPm5Status,
} from "./parse.js";

/** Unwraps a parse function's success branch, throwing (never a
 *  conditional `expect`) if it was a `Pm5ParseError` instead — so a
 *  decode fixture that's accidentally the wrong length fails the test
 *  loudly instead of the field assertion silently comparing against
 *  `undefined`. Mirrors `commands.test.ts`'s `expectPayload`/
 *  `csafe.test.ts`'s `expectPayload` pattern for the same reason. */
function expectDecoded<T extends object>(
  result: T | { error: Pm5ParseError },
): T {
  if ("error" in result) {
    throw new Error(
      `expected a decoded value, got a parse error: ${JSON.stringify(result.error)}`,
    );
  }
  return result;
}

// Little-endian encoders, independent of parse.ts's own (readU16LE/
// readU24LE) — used only to BUILD test byte vectors from a chosen decimal
// value, per the documented Lo/Mid/High (little-endian) byte order
// (interface-notes.md §10).
function u16le(value: number): [number, number] {
  return [value & 0xff, (value >> 8) & 0xff];
}
function u24le(value: number): [number, number, number] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
}

describe("parseGeneralStatus (0x0031, 19 bytes, interface-notes.md §10)", () => {
  it("decodes every offset, hand-built and cited", () => {
    const bytes = Uint8Array.from([
      ...u24le(12345), // Elapsed Time, 0.01 sec/lsb -> 123.45s
      ...u24le(54321), // Distance, 0.1 m/lsb -> 5432.1m
      8, // Workout Type
      1, // Interval Type
      4, // Workout State (INTERVALWORKTIME)
      1, // Rowing State
      2, // Stroke State
      ...u24le(1234), // Total Work Distance, whole meters
      ...u24le(6000), // Workout Duration, raw/unscaled
      0, // Workout Duration Type (Time)
      130, // Drag Factor
    ]);
    expect(bytes).toHaveLength(19);

    expect(parseGeneralStatus(bytes)).toStrictEqual({
      elapsedSeconds: 12345 / 100,
      distanceMeters: 54321 / 10,
      workoutType: 8,
      intervalType: 1,
      workoutState: 4,
      rowingState: 1,
      strokeState: 2,
      totalWorkDistanceMeters: 1234,
      workoutDurationRaw: 6000,
      workoutDurationType: 0,
      dragFactor: 130,
    });
  });
});

describe("parseAdditionalStatus1 (0x0032, 17 bytes, interface-notes.md §10)", () => {
  it("decodes every offset, hand-built and cited", () => {
    const bytes = Uint8Array.from([
      ...u24le(100), // Elapsed Time, 0.01 sec/lsb -> 1.00s
      ...u16le(1500), // Speed, 0.001 m/s/lsb -> 1.5 m/s
      24, // Stroke Rate
      150, // Heartrate (valid)
      ...u16le(9500), // Current Pace, 0.01 sec/lsb -> 95.00s/500m
      ...u16le(9800), // Average Pace, 0.01 sec/lsb -> 98.00s/500m
      ...u16le(250), // Rest Distance, whole meters
      ...u24le(500), // Rest Time, 0.01 sec/lsb -> 5.00s
      1, // Erg Machine Type
    ]);
    expect(bytes).toHaveLength(17);

    expect(parseAdditionalStatus1(bytes)).toStrictEqual({
      elapsedSeconds: 100 / 100,
      speedMetersPerSecond: 1500 / 1000,
      spm: 24,
      heartRateBpm: 150,
      currentSplit: 9500 / 100,
      averageSplit: 9800 / 100,
      restDistanceMeters: 250,
      restSeconds: 500 / 100,
      ergMachineType: 1,
    });
  });

  it("maps the documented 255 sentinel to null (BLE doc p.14, 'Heartrate (bpm, 255=invalid)')", () => {
    const bytes = Uint8Array.from([
      ...u24le(0),
      ...u16le(0),
      0,
      255, // Heartrate: invalid
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u24le(0),
      0,
    ]);
    expect(
      expectDecoded(parseAdditionalStatus1(bytes)).heartRateBpm,
    ).toBeNull();
  });

  it("a real, non-sentinel heart rate byte is never mistaken for invalid", () => {
    const bytes = Uint8Array.from([
      ...u24le(0),
      ...u16le(0),
      0,
      254, // one less than the sentinel — must decode as a real value
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u24le(0),
      0,
    ]);
    expect(expectDecoded(parseAdditionalStatus1(bytes)).heartRateBpm).toBe(254);
  });

  it("maps the OBSERVED zero sentinel to null too (D5, interface-notes.md §18): a beltless PM5 sent 0, not 255", () => {
    const bytes = Uint8Array.from([
      ...u24le(0),
      ...u16le(0),
      0,
      HEARTRATE_NO_BELT, // no belt paired — the byte the real machine sent
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u24le(0),
      0,
    ]);
    // 0 bpm is not a reading a living rower produces; passing it through
    // fabricates a plausible-looking number for someone who simply wasn't
    // wearing a belt (§15 #2's own 0x0039 counter-evidence predicted this
    // before the session ever ran).
    expect(
      expectDecoded(parseAdditionalStatus1(bytes)).heartRateBpm,
    ).toBeNull();
  });

  it("a heart rate of 1 bpm — one past the zero sentinel — is still decoded as a value", () => {
    const bytes = Uint8Array.from([
      ...u24le(0),
      ...u16le(0),
      0,
      1,
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u24le(0),
      0,
    ]);
    expect(expectDecoded(parseAdditionalStatus1(bytes)).heartRateBpm).toBe(1);
  });
});

describe("parseAdditionalStatus2 (0x0033, 20 bytes, interface-notes.md §10)", () => {
  it("decodes every offset, hand-built and cited", () => {
    const bytes = Uint8Array.from([
      ...u24le(200), // Elapsed Time, 0.01 sec/lsb -> 2.00s
      7, // Interval Count
      ...u16le(180), // Average Power, whole watts
      ...u16le(300), // Total Calories, whole cals
      ...u16le(9000), // Split/Int Avg Pace, 0.01 sec/lsb -> 90.00s
      ...u16le(190), // Split/Int Avg Power, whole watts
      ...u16le(50), // Split/Int Avg Calories, whole cals
      ...u24le(1234), // Last Split Time, 0.01 sec/lsb -> 12.34s (RC-4)
      ...u24le(500), // Last Split Distance, whole meters
    ]);
    expect(bytes).toHaveLength(20);

    expect(parseAdditionalStatus2(bytes)).toStrictEqual({
      elapsedSeconds: 200 / 100,
      intervalCount: 7,
      averagePowerWatts: 180,
      totalCalories: 300,
      splitAvgPace: 9000 / 100,
      splitAvgPowerWatts: 190,
      splitAvgCalories: 50,
      lastSplitTimeSeconds: 1234 / 100,
      lastSplitDistanceMeters: 500,
    });
  });

  it("decodes a REAL Last Split Time off a committed corpus frame — walk-2026-08-17 step-2 (2x250m keystone), seq 1195, verbatim raw bytes (docs/monitor/sessions/walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl, char 0x0033): '2f 1d 00 02 69 00 0f 00 64 3a 69 00 0f 00 34 1d 00 00 00 00' — the SAME frame's Elapsed Time and Last Split Time differ by 0.05s (74.71 vs 74.76); RC-4, never assert them equal", () => {
    const bytes = Uint8Array.from([
      0x2f, 0x1d, 0x00, 0x02, 0x69, 0x00, 0x0f, 0x00, 0x64, 0x3a, 0x69, 0x00,
      0x0f, 0x00, 0x34, 0x1d, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(bytes).toHaveLength(20);

    const decoded = expectDecoded(parseAdditionalStatus2(bytes));
    expect(decoded.elapsedSeconds).toBe(74.71);
    expect(decoded.lastSplitTimeSeconds).toBe(74.76);
    expect(decoded.elapsedSeconds).not.toBe(decoded.lastSplitTimeSeconds);
  });
});

describe("parseSplitIntervalData (0x0037, 18 bytes, interface-notes.md §10)", () => {
  it("decodes every offset, hand-built and cited", () => {
    const bytes = Uint8Array.from([
      ...u24le(300), // Elapsed Time, 0.01 sec/lsb -> 3.00s
      ...u24le(5000), // Distance, 0.1 m/lsb -> 500.0m
      ...u24le(600), // Split/Interval Time, 0.1 sec/lsb -> 60.0s
      ...u24le(500), // Split/Interval Distance, WHOLE meters (the trap)
      ...u16le(60), // Interval Rest Time, whole seconds
      ...u16le(0), // Interval Rest Distance, whole meters
      1, // Split/Interval Type
      3, // Split/Interval Number
    ]);
    expect(bytes).toHaveLength(18);

    expect(parseSplitIntervalData(bytes)).toStrictEqual({
      elapsedSeconds: 300 / 100,
      distanceMeters: 5000 / 10,
      splitIntervalTimeSeconds: 600 / 10,
      splitIntervalDistanceMeters: 500,
      intervalRestTimeSeconds: 60,
      intervalRestDistanceMeters: 0,
      splitIntervalType: 1,
      splitIntervalNumber: 3,
    });
  });

  it("decodes a REAL Interval Rest Distance off a committed capture — walk-2026-08-16 session 2 (wu+4unequal), interval 3's boundary, verbatim raw bytes (docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl seq 1666, char 0x0037): '00 00 00 09 00 00 b0 04 00 cd 01 00 1e 00 16 00 00 03' — the spec's R-B ruling table (0/30/22/12/0 across this session's five boundaries) names this one 22m", () => {
    const bytes = Uint8Array.from([
      0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0xb0, 0x04, 0x00, 0xcd, 0x01, 0x00,
      0x1e, 0x00, 0x16, 0x00, 0x00, 0x03,
    ]);
    expect(bytes).toHaveLength(18);
    expect(parseSplitIntervalData(bytes)).toStrictEqual({
      elapsedSeconds: 0,
      distanceMeters: 0.9,
      splitIntervalTimeSeconds: 120,
      splitIntervalDistanceMeters: 461,
      intervalRestTimeSeconds: 30,
      intervalRestDistanceMeters: 22,
      splitIntervalType: 0,
      splitIntervalNumber: 3,
    });
  });

  it("the SAME raw value at the cumulative-distance and split-distance offsets decodes to DIFFERENT meters (0.1m/lsb vs 1m/lsb, interface-notes.md §10's explicit trap)", () => {
    const bytes = Uint8Array.from([
      ...u24le(0), // Elapsed Time
      ...u24le(1000), // Distance: 0.1 m/lsb -> 100.0m
      ...u24le(0), // Split/Interval Time
      ...u24le(1000), // Split/Interval Distance: 1 m/lsb -> 1000m
      ...u16le(0),
      ...u16le(0),
      0,
      0,
    ]);
    const decoded = expectDecoded(parseSplitIntervalData(bytes));
    expect(decoded.distanceMeters).toBe(100);
    expect(decoded.splitIntervalDistanceMeters).toBe(1000);
    expect(decoded.distanceMeters).not.toBe(
      decoded.splitIntervalDistanceMeters,
    );
  });
});

describe("parseAdditionalSplitIntervalData (0x0038, 19 bytes, interface-notes.md §10)", () => {
  it("decodes every offset, hand-built and cited", () => {
    const bytes = Uint8Array.from([
      ...u24le(400), // Elapsed Time, 0.01 sec/lsb -> 4.00s
      26, // Split/Interval Avg Stroke Rate
      160, // Split/Interval Work Heartrate
      110, // Split/Interval Rest Heartrate
      ...u16le(950), // Split/Interval Avg Pace, 0.1 sec/lsb -> 95.0s (the trap)
      ...u16le(40), // Split/Interval Total Calories
      ...u16le(600), // Split/Interval Avg Calories
      ...u16le(1800), // Split/Interval Speed, 0.001 m/s/lsb -> 1.8 m/s
      ...u16le(200), // Split/Interval Power, whole watts
      128, // Split Avg Drag Factor
      3, // Split/Interval Number
      1, // Erg Machine Type
    ]);
    expect(bytes).toHaveLength(19);

    expect(parseAdditionalSplitIntervalData(bytes)).toStrictEqual({
      elapsedSeconds: 400 / 100,
      splitIntervalAvgStrokeRate: 26,
      splitIntervalWorkHeartRateBpm: 160,
      splitIntervalRestHeartRateBpm: 110,
      splitIntervalAvgPace: 950 / 10,
      splitIntervalTotalCalories: 40,
      splitIntervalAvgCalories: 600,
      splitIntervalSpeedMetersPerSecond: 1800 / 1000,
      splitIntervalPowerWatts: 200,
      splitAvgDragFactor: 128,
      splitIntervalNumber: 3,
      ergMachineType: 1,
    });
  });

  it("applies the ZERO sentinel to both heartrate bytes as well — the field the beltless machine actually sent 0 on (D5, interface-notes.md §18)", () => {
    const bytes = Uint8Array.from([
      ...u24le(0),
      0,
      HEARTRATE_NO_BELT, // work heartrate: no belt
      HEARTRATE_NO_BELT, // rest heartrate: no belt
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      0,
      0,
      0,
    ]);
    const decoded = expectDecoded(parseAdditionalSplitIntervalData(bytes));
    // This is the exact value that reached `IntervalActual.avgHeartRateBpm`
    // as a `0` during the laptop session — a 7C log screen would have
    // written down "0 bpm average" for a rower wearing no belt.
    expect(decoded.splitIntervalWorkHeartRateBpm).toBeNull();
    expect(decoded.splitIntervalRestHeartRateBpm).toBeNull();
  });

  it("applies the 255=invalid sentinel to BOTH work and rest heartrate bytes (by analogy, interface-notes.md §15 #2)", () => {
    const bytes = Uint8Array.from([
      ...u24le(0),
      0,
      255, // work heartrate: invalid
      255, // rest heartrate: invalid
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      0,
      0,
      0,
    ]);
    const decoded = expectDecoded(parseAdditionalSplitIntervalData(bytes));
    expect(decoded.splitIntervalWorkHeartRateBpm).toBeNull();
    expect(decoded.splitIntervalRestHeartRateBpm).toBeNull();
  });

  it("the SAME raw pace value at 0x0032/0x0033's offset (0.01 sec/lsb) vs 0x0038's offset (0.1 sec/lsb) decodes to DIFFERENT seconds — the trap this task was briefed to catch", () => {
    const raw = 1000;
    const additionalStatus1Bytes = Uint8Array.from([
      ...u24le(0),
      ...u16le(0),
      0,
      0,
      ...u16le(raw), // Current Pace, 0.01 sec/lsb
      ...u16le(0),
      ...u16le(0),
      ...u24le(0),
      0,
    ]);
    const additionalSplitBytes = Uint8Array.from([
      ...u24le(0),
      0,
      0,
      0,
      ...u16le(raw), // Split/Interval Avg Pace, 0.1 sec/lsb
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      ...u16le(0),
      0,
      0,
      0,
    ]);
    const fromStatus1 = expectDecoded(
      parseAdditionalStatus1(additionalStatus1Bytes),
    ).currentSplit;
    const fromSplit = expectDecoded(
      parseAdditionalSplitIntervalData(additionalSplitBytes),
    ).splitIntervalAvgPace;
    expect(fromStatus1).toBe(10); // 1000 * 0.01
    expect(fromSplit).toBe(100); // 1000 * 0.1
    expect(fromStatus1).not.toBe(fromSplit);
  });
});

describe("parseEndOfWorkoutSummary (0x0039, 20 bytes, interface-notes.md §23)", () => {
  it("decodes every offset, hand-built and cited", () => {
    const bytes = Uint8Array.from([
      ...u16le(0), // Log Entry Date (not decoded)
      ...u16le(0), // Log Entry Time (not decoded)
      ...u24le(720000), // Elapsed Time, 0.01 sec/lsb -> 7200.00s
      ...u24le(20000), // Distance, 0.1 m/lsb -> 2000.0m
      24, // Average Stroke Rate
      140, // Ending Heartrate
      135, // Average Heartrate
      110, // Min Heartrate
      165, // Max Heartrate
      128, // Drag Factor Average
      88, // Recovery Heart Rate
      8, // Workout Type (WORKOUTTYPE_VARIABLE_INTERVAL)
      ...u16le(1200), // Avg Pace, 0.1 sec/lsb -> 120.0s
    ]);
    expect(bytes).toHaveLength(20);

    expect(parseEndOfWorkoutSummary(bytes)).toStrictEqual({
      elapsedSeconds: 720000 / 100,
      meters: 20000 / 10,
      avgStrokeRate: 24,
      endingHeartRateBpm: 140,
      avgHeartRateBpm: 135,
      minHeartRateBpm: 110,
      maxHeartRateBpm: 165,
      dragFactorAverage: 128,
      recoveryHeartRateBpm: 88,
      workoutType: 8,
      avgPaceSecondsPer500m: 1200 / 10,
    });
  });

  it("returns null on a too-short buffer — the split parsers' error idiom, simplified to a bare null since no caller yet needs the typed diagnostic", () => {
    const bytes = Uint8Array.from(new Array(19).fill(0));
    expect(parseEndOfWorkoutSummary(bytes)).toBeNull();
  });

  it("a 20-byte buffer of all zeros is NOT null — the length guard is length-only, never content-sniffing", () => {
    const bytes = Uint8Array.from(new Array(20).fill(0));
    expect(parseEndOfWorkoutSummary(bytes)).not.toBeNull();
  });

  it("applies the 255-and-0-both-null sentinel (D5) to all five heart-rate fields, including the document-stated Recovery Heart Rate zero", () => {
    const bytes = Uint8Array.from([
      ...u16le(0),
      ...u16le(0),
      ...u24le(0),
      ...u24le(0),
      0,
      255, // Ending Heartrate: invalid (255, by-analogy sentinel)
      0, // Average Heartrate: no belt (0, by-analogy sentinel)
      255, // Min Heartrate: invalid
      0, // Max Heartrate: no belt
      0,
      0, // Recovery Heart Rate: "zero = not valid data" (document-stated)
      0,
      ...u16le(0),
    ]);
    const decoded = parseEndOfWorkoutSummary(bytes);
    expect(decoded).not.toBeNull();
    expect(decoded!.endingHeartRateBpm).toBeNull();
    expect(decoded!.avgHeartRateBpm).toBeNull();
    expect(decoded!.minHeartRateBpm).toBeNull();
    expect(decoded!.maxHeartRateBpm).toBeNull();
    expect(decoded!.recoveryHeartRateBpm).toBeNull();
  });

  it("a REAL recovery heart rate (the re-fire, ~1 min post-finish) survives — only 0 and 255 are sentinels", () => {
    const bytes = Uint8Array.from([
      ...u16le(0),
      ...u16le(0),
      ...u24le(0),
      ...u24le(0),
      0,
      0,
      0,
      0,
      0,
      0,
      72, // Recovery Heart Rate: a real reading
      0,
      ...u16le(0),
    ]);
    const decoded = parseEndOfWorkoutSummary(bytes);
    expect(decoded!.recoveryHeartRateBpm).toBe(72);
  });

  it("Avg Pace is 0.1 sec/lsb — the same scale as 0x0038's, DIFFERENT from 0x0032/0x0033's 0.01 sec/lsb (interface-notes.md §23's recurring trap)", () => {
    const raw = 1000;
    const additionalStatus1Bytes = Uint8Array.from([
      ...u24le(0),
      ...u16le(0),
      0,
      0,
      ...u16le(raw), // Current Pace, 0.01 sec/lsb
      ...u16le(0),
      ...u16le(0),
      ...u24le(0),
      0,
    ]);
    const summaryBytes = Uint8Array.from([
      ...u16le(0),
      ...u16le(0),
      ...u24le(0),
      ...u24le(0),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      ...u16le(raw), // Avg Pace, 0.1 sec/lsb
    ]);
    const fromStatus1 = expectDecoded(
      parseAdditionalStatus1(additionalStatus1Bytes),
    ).currentSplit;
    const fromSummary =
      parseEndOfWorkoutSummary(summaryBytes)!.avgPaceSecondsPer500m;
    expect(fromStatus1).toBe(10); // 1000 * 0.01
    expect(fromSummary).toBe(100); // 1000 * 0.1
    expect(fromStatus1).not.toBe(fromSummary);
  });
});

describe("length guards (M3): a too-short input is a typed error, never a silently garbage-filled decode", () => {
  it.each([
    ["parseGeneralStatus", parseGeneralStatus, 19, "0x0031"],
    ["parseAdditionalStatus1", parseAdditionalStatus1, 17, "0x0032"],
    ["parseAdditionalStatus2", parseAdditionalStatus2, 20, "0x0033"],
    ["parseSplitIntervalData", parseSplitIntervalData, 18, "0x0037"],
    [
      "parseAdditionalSplitIntervalData",
      parseAdditionalSplitIntervalData,
      19,
      "0x0038",
    ],
  ] as const)(
    "%s: an empty input returns a Pm5ParseError naming the characteristic and both lengths",
    (_name, parseFn, expected, characteristic) => {
      const result = parseFn(Uint8Array.from([]));
      expect(result).toStrictEqual({
        error: { characteristic, expected, actual: 0 },
      });
    },
  );

  it.each([
    ["parseGeneralStatus", parseGeneralStatus, 19, "0x0031"],
    ["parseAdditionalStatus1", parseAdditionalStatus1, 17, "0x0032"],
    ["parseAdditionalStatus2", parseAdditionalStatus2, 20, "0x0033"],
    ["parseSplitIntervalData", parseSplitIntervalData, 18, "0x0037"],
    [
      "parseAdditionalSplitIntervalData",
      parseAdditionalSplitIntervalData,
      19,
      "0x0038",
    ],
  ] as const)(
    "%s: one byte short of the documented length still errors (off-by-one, not just wildly short)",
    (_name, parseFn, expected, characteristic) => {
      const oneShort = new Uint8Array(expected - 1);
      const result = parseFn(oneShort);
      expect(result).toStrictEqual({
        error: { characteristic, expected, actual: expected - 1 },
      });
    },
  );

  it.each([
    ["parseGeneralStatus", parseGeneralStatus, 19],
    ["parseAdditionalStatus1", parseAdditionalStatus1, 17],
    ["parseAdditionalStatus2", parseAdditionalStatus2, 20],
    ["parseSplitIntervalData", parseSplitIntervalData, 18],
    ["parseAdditionalSplitIntervalData", parseAdditionalSplitIntervalData, 19],
  ] as const)(
    "%s: exactly the documented length decodes successfully (the boundary itself is not an error)",
    (_name, parseFn, expected) => {
      const exact = new Uint8Array(expected);
      const result = parseFn(exact);
      expect("error" in result).toBe(false);
    },
  );

  it('a too-short GeneralStatus never reaches toMonitorFrame\'s ?? "idle" fallback silently — the caller sees the error before touching workoutState at all', () => {
    // The exact failure class M3 named: bytes[8] on a 3-byte array reads
    // `undefined`, which used to sail through as a "decoded" workoutState
    // and land on toMonitorFrame's UNKNOWN_WORKOUT_STATE_FALLBACK,
    // indistinguishable from a genuine idle frame. The length guard now
    // rejects the input before any field is ever read.
    const result = parseGeneralStatus(Uint8Array.from([1, 2, 3]));
    expect(result).toStrictEqual({
      error: { characteristic: "0x0031", expected: 19, actual: 3 },
    });
  });
});

/** A fully-populated RawPm5Status with deliberately distinct, identifiable
 *  values per field, so a test overriding one field can't accidentally
 *  pass by reading a different, coincidentally-equal field. */
function baseRaw(overrides: Partial<RawPm5Status> = {}): RawPm5Status {
  return {
    elapsedSeconds: 61.23,
    distanceMeters: 305.4,
    workoutType: 8,
    intervalType: 1,
    workoutState: 4, // INTERVALWORKTIME -> rowing
    rowingState: 1,
    strokeState: 2,
    totalWorkDistanceMeters: 1234,
    workoutDurationRaw: 6000,
    workoutDurationType: 0,
    dragFactor: 130,
    speedMetersPerSecond: 4.2,
    spm: 24,
    heartRateBpm: 150,
    currentSplit: 95,
    averageSplit: 98,
    restDistanceMeters: 0,
    restSeconds: 0,
    ergMachineType: 1,
    intervalCount: 5,
    averagePowerWatts: 180,
    totalCalories: 300,
    splitAvgPace: 90,
    splitAvgPowerWatts: 190,
    splitAvgCalories: 50,
    lastSplitTimeSeconds: 123.4,
    lastSplitDistanceMeters: 500,
    splitIntervalTimeSeconds: 512.3,
    splitIntervalDistanceMeters: 2000,
    intervalRestTimeSeconds: 60,
    intervalRestDistanceMeters: 0,
    splitIntervalType: 1,
    splitIntervalNumber: 3,
    splitIntervalAvgStrokeRate: 26,
    splitIntervalWorkHeartRateBpm: 160,
    splitIntervalRestHeartRateBpm: 110,
    splitIntervalAvgPace: 96,
    splitIntervalTotalCalories: 40,
    splitIntervalAvgCalories: 600,
    splitIntervalSpeedMetersPerSecond: 4.5,
    splitIntervalPowerWatts: 200,
    splitAvgDragFactor: 128,
    ...overrides,
  };
}

describe("toMonitorFrame: WORKOUTSTATE -> state, cited row-by-row (interface-notes.md §14)", () => {
  it.each([
    [0, "armed", "WAITTOBEGIN"],
    [1, "rowing", "WORKOUTROW"],
    [2, "armed", "COUNTDOWNPAUSE"],
    [3, "resting", "INTERVALREST"],
    [4, "rowing", "INTERVALWORKTIME"],
    [5, "rowing", "INTERVALWORKDISTANCE"],
    [6, "resting", "INTERVALRESTENDTOWORKTIME"],
    [7, "resting", "INTERVALRESTENDTOWORKDISTANCE"],
    [8, "rowing", "INTERVALWORKTIMETOREST"],
    [9, "rowing", "INTERVALWORKDISTANCETOREST"],
    [10, "finished", "WORKOUTEND"],
    [11, "terminated", "TERMINATE"],
    [12, "finished", "WORKOUTLOGGED"],
    [13, "idle", "REARM"],
  ] as const)("WORKOUTSTATE %i (%s) -> %s", (workoutState, expected, _name) => {
    const frame = toMonitorFrame(baseRaw({ workoutState }));
    expect(frame.state).toBe(expected);
  });

  it("an out-of-range workoutState byte falls back to idle (defensive, not a wire fact)", () => {
    const frame = toMonitorFrame(baseRaw({ workoutState: 255 }));
    expect(frame.state).toBe("idle");
  });

  it("toMonitorState is that same table, standalone — the form the fake transport needs (it has an ordinal, not a whole RawPm5Status)", () => {
    // Exported so `src/monitor/transports/fake.ts` can ask "is the state I
    // am about to send a REST?" without re-declaring Appendix A's table
    // outside `pm5/` (design spec §Layering).
    expect(toMonitorState(3)).toBe("resting");
    expect(toMonitorState(4)).toBe("rowing");
    expect(toMonitorState(255)).toBe("idle");
    // Same function `toMonitorFrame` itself reads, not a parallel copy.
    expect(toMonitorState(10)).toBe(
      toMonitorFrame(baseRaw({ workoutState: 10 })).state,
    );
  });
});

describe("toMonitorFrame: field mapping", () => {
  it("passes elapsedSeconds/distanceMeters/currentSplit/spm/heartRateBpm straight from GeneralStatus/AdditionalStatus1", () => {
    const frame = toMonitorFrame(baseRaw());
    expect(frame.elapsedSeconds).toBe(61.23);
    expect(frame.distanceMeters).toBe(305.4);
    expect(frame.currentSplit).toBe(95);
    expect(frame.spm).toBe(24);
    expect(frame.heartRateBpm).toBe(150);
  });

  it("intervalRemaining is always null (computed downstream by the driver)", () => {
    expect(toMonitorFrame(baseRaw()).intervalRemaining).toBeNull();
  });

  // Phase LL Task 4 (design spec §4's continuity rule): unconditional
  // pass-through, same choice as `restSeconds`/`splitAvgPace` above —
  // `src/monitor/continuity.ts`'s own consumption reads this field off a
  // `MonitorFrame` it never re-decodes.
  it("passes totalWorkDistanceMeters straight from GeneralStatus", () => {
    const frame = toMonitorFrame(baseRaw({ totalWorkDistanceMeters: 1599 }));
    expect(frame.totalWorkDistanceMeters).toBe(1599);
  });

  it("intervalIndex is the raw Interval Count while rowing", () => {
    const frame = toMonitorFrame(
      baseRaw({ workoutState: 4, intervalCount: 5 }),
    );
    expect(frame.intervalIndex).toBe(5);
  });

  it("intervalIndex is the raw Interval Count while resting", () => {
    const frame = toMonitorFrame(
      baseRaw({ workoutState: 3, intervalCount: 2 }),
    );
    expect(frame.intervalIndex).toBe(2);
  });

  it("intervalIndex is null while armed (no interval is 'current' yet)", () => {
    const frame = toMonitorFrame(
      baseRaw({ workoutState: 0, intervalCount: 5 }),
    );
    expect(frame.intervalIndex).toBeNull();
  });

  it("intervalIndex is null while finished", () => {
    const frame = toMonitorFrame(
      baseRaw({ workoutState: 10, intervalCount: 12 }),
    );
    expect(frame.intervalIndex).toBeNull();
  });

  it("intervalIndex is null while terminated", () => {
    const frame = toMonitorFrame(
      baseRaw({ workoutState: 11, intervalCount: 8 }),
    );
    expect(frame.intervalIndex).toBeNull();
  });

  it("heartRateBpm carries through a null (invalid-belt) value from AdditionalStatus1", () => {
    const frame = toMonitorFrame(baseRaw({ heartRateBpm: null }));
    expect(frame.heartRateBpm).toBeNull();
  });

  // EST LEFT (Phase LL): restSeconds is a straight pass-through, same as
  // currentSplit/spm/heartRateBpm above — the value distinguishes itself
  // from baseRaw()'s other numeric fields so an override can't accidentally
  // pass by reading a coincidentally-equal one.
  it("passes restSeconds straight from AdditionalStatus1's Rest Time", () => {
    const frame = toMonitorFrame(baseRaw({ restSeconds: 12.34 }));
    expect(frame.restSeconds).toBe(12.34);
  });
});

describe("toIntervalActual: field mapping (interface-notes.md's own reasoning comment)", () => {
  it("uses the INTERVAL's own time/distance (0x0037), not the cumulative session totals", () => {
    const actual = toIntervalActual(
      baseRaw({
        elapsedSeconds: 9999, // cumulative session elapsed — must NOT be used
        distanceMeters: 9999, // cumulative session distance — must NOT be used
        splitIntervalTimeSeconds: 123.4,
        splitIntervalDistanceMeters: 500,
      }),
    );
    expect(actual.elapsedSeconds).toBe(123.4);
    expect(actual.distanceMeters).toBe(500);
  });

  it("uses splitIntervalNumber for index", () => {
    expect(toIntervalActual(baseRaw({ splitIntervalNumber: 7 })).index).toBe(7);
  });

  it("uses splitIntervalAvgPace/splitIntervalAvgStrokeRate for avgSplit/avgSpm", () => {
    const actual = toIntervalActual(
      baseRaw({ splitIntervalAvgPace: 88, splitIntervalAvgStrokeRate: 22 }),
    );
    expect(actual.avgSplit).toBe(88);
    expect(actual.avgSpm).toBe(22);
  });

  it("uses the WORK heartrate, never the rest heartrate, for avgHeartRateBpm", () => {
    const actual = toIntervalActual(
      baseRaw({
        splitIntervalWorkHeartRateBpm: 165,
        splitIntervalRestHeartRateBpm: 95,
      }),
    );
    expect(actual.avgHeartRateBpm).toBe(165);
    expect(actual.avgHeartRateBpm).not.toBe(95);
  });

  it("carries through a null (invalid-belt) work heartrate", () => {
    const actual = toIntervalActual(
      baseRaw({ splitIntervalWorkHeartRateBpm: null }),
    );
    expect(actual.avgHeartRateBpm).toBeNull();
  });

  it("uses intervalRestDistanceMeters (0x0037) for restDistanceMeters (R-B)", () => {
    const actual = toIntervalActual(
      baseRaw({ intervalRestDistanceMeters: 22 }),
    );
    expect(actual.restDistanceMeters).toBe(22);
  });

  it("a rest-free interval's restDistanceMeters is 0, not null/undefined — the wire's own zero, not an absence", () => {
    const actual = toIntervalActual(baseRaw({ intervalRestDistanceMeters: 0 }));
    expect(actual.restDistanceMeters).toBe(0);
  });

  it("uses intervalRestTimeSeconds (0x0037 offset 12) for restSeconds (RC-1) — NOT AdditionalStatus1's differently-sourced Rest Time (`MonitorFrame.restSeconds`, a different field under the same name)", () => {
    const actual = toIntervalActual(baseRaw({ intervalRestTimeSeconds: 45 }));
    expect(actual.restSeconds).toBe(45);
  });

  it("a rest-free interval's restSeconds is 0, not null/undefined — the wire's own zero, not an absence (RC-1)", () => {
    const actual = toIntervalActual(baseRaw({ intervalRestTimeSeconds: 0 }));
    expect(actual.restSeconds).toBe(0);
  });

  it("uses splitIntervalType (0x0037 offset 16) for type, stored raw (RC-1)", () => {
    expect(toIntervalActual(baseRaw({ splitIntervalType: 1 })).type).toBe(1);
    expect(toIntervalActual(baseRaw({ splitIntervalType: 0 })).type).toBe(0);
  });
});

describe("parseSummaryLogStamp", () => {
  // Both committed hardware stamps (walk-2026-08-24): date u16 0x3588,
  // time u16 0x0F03 (phone) and 0x0F0E (lab). INFERENCE formula over one
  // date/hour — these tests pin OUR decoder against the two captures.
  it("decodes the exit-7 phone stamp to Aug 24 2026 15:03", () => {
    const bytes = new Uint8Array([0x88, 0x35, 0x03, 0x0f]);
    expect(parseSummaryLogStamp(bytes)).toStrictEqual({
      year: 2026,
      month: 8,
      day: 24,
      hours: 15,
      minutes: 3,
    });
  });
  it("decodes the lab terminate stamp to Aug 24 2026 15:14", () => {
    const bytes = new Uint8Array([0x88, 0x35, 0x0e, 0x0f]);
    expect(parseSummaryLogStamp(bytes)).toStrictEqual({
      year: 2026,
      month: 8,
      day: 24,
      hours: 15,
      minutes: 14,
    });
  });
  // Boundary stamps pin OUR ENCODING of the formula, not the machine
  // (no capture varies these fields yet — spec §2's honest tag).
  it("round-trips boundary encodings of the inferred formula", () => {
    const enc = (y: number, mo: number, d: number, h: number, mi: number) =>
      new Uint8Array([
        (mo | (d << 4) | ((y - 2000) << 9)) & 0xff,
        (mo | (d << 4) | ((y - 2000) << 9)) >> 8,
        mi,
        h,
      ]);
    expect(parseSummaryLogStamp(enc(2026, 1, 1, 0, 0))).toStrictEqual({
      year: 2026,
      month: 1,
      day: 1,
      hours: 0,
      minutes: 0,
    });
    expect(parseSummaryLogStamp(enc(2031, 12, 31, 23, 59))).toStrictEqual({
      year: 2031,
      month: 12,
      day: 31,
      hours: 23,
      minutes: 59,
    });
  });
  it("returns null on fewer than 4 bytes", () => {
    expect(parseSummaryLogStamp(new Uint8Array([0x88, 0x35, 0x03]))).toBeNull();
  });
});
