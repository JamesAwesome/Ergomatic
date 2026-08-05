import { describe, expect, it } from "vitest";
import {
  parseAdditionalSplitIntervalData,
  parseAdditionalStatus1,
  parseAdditionalStatus2,
  parseGeneralStatus,
  parseSplitIntervalData,
  toIntervalActual,
  toMonitorFrame,
  type RawPm5Status,
} from "./parse.js";

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
    expect(parseAdditionalStatus1(bytes).heartRateBpm).toBeNull();
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
    expect(parseAdditionalStatus1(bytes).heartRateBpm).toBe(254);
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
      ...u24le(1234), // Last Split Time, 0.1 sec/lsb -> 123.4s
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
      lastSplitTimeSeconds: 1234 / 10,
      lastSplitDistanceMeters: 500,
    });
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
    const decoded = parseSplitIntervalData(bytes);
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
    const decoded = parseAdditionalSplitIntervalData(bytes);
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
    const fromStatus1 = parseAdditionalStatus1(
      additionalStatus1Bytes,
    ).currentSplit;
    const fromSplit =
      parseAdditionalSplitIntervalData(
        additionalSplitBytes,
      ).splitIntervalAvgPace;
    expect(fromStatus1).toBe(10); // 1000 * 0.01
    expect(fromSplit).toBe(100); // 1000 * 0.1
    expect(fromStatus1).not.toBe(fromSplit);
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
});
