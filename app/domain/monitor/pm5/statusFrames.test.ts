import { describe, expect, it } from "vitest";
import {
  parseAdditionalSplitIntervalData,
  parseAdditionalStatus1,
  parseAdditionalStatus2,
  parseGeneralStatus,
  parseSplitIntervalData,
} from "./parse.js";
import {
  buildAdditionalSplitIntervalDataBytes,
  buildAdditionalStatus1Bytes,
  buildAdditionalStatus2Bytes,
  buildGeneralStatusBytes,
  buildSplitIntervalDataBytes,
} from "./statusFrames.js";

// Each build function is the declared byte-for-byte inverse of its parse.ts
// sibling — the round trip (build -> parse) recovering the exact input is
// the whole point of this module, and is a stronger check than asserting
// literal byte arrays (which would just duplicate parse.ts's own offset
// knowledge a second time here).

describe("buildGeneralStatusBytes: round-trips through parseGeneralStatus", () => {
  it("a mid-workout rowing frame", () => {
    const status = {
      elapsedSeconds: 123.45,
      distanceMeters: 456.7,
      workoutType: 8,
      intervalType: 0,
      workoutState: 4,
      rowingState: 1,
      strokeState: 2,
      totalWorkDistanceMeters: 1234,
      workoutDurationRaw: 18000,
      workoutDurationType: 0,
      dragFactor: 130,
    };
    const bytes = buildGeneralStatusBytes(status);
    expect(bytes).toHaveLength(19);
    expect(parseGeneralStatus(bytes)).toStrictEqual(status);
  });

  it("the zeroed idle/WAITTOBEGIN frame", () => {
    const status = {
      elapsedSeconds: 0,
      distanceMeters: 0,
      workoutType: 0,
      intervalType: 0,
      workoutState: 0,
      rowingState: 0,
      strokeState: 0,
      totalWorkDistanceMeters: 0,
      workoutDurationRaw: 0,
      workoutDurationType: 0,
      dragFactor: 0,
    };
    expect(parseGeneralStatus(buildGeneralStatusBytes(status))).toStrictEqual(
      status,
    );
  });
});

describe("buildAdditionalStatus1Bytes: round-trips through parseAdditionalStatus1", () => {
  it("a frame with a valid heart-rate reading", () => {
    const status = {
      elapsedSeconds: 60.5,
      speedMetersPerSecond: 4.321,
      spm: 22,
      heartRateBpm: 145,
      currentSplit: 105.5,
      averageSplit: 110,
      restDistanceMeters: 0,
      restSeconds: 0,
      ergMachineType: 1,
    };
    expect(
      parseAdditionalStatus1(buildAdditionalStatus1Bytes(status)),
    ).toStrictEqual(status);
  });

  it("a frame with no belt data (255 sentinel round-trips to null)", () => {
    const status = {
      elapsedSeconds: 10,
      speedMetersPerSecond: 0,
      spm: 0,
      heartRateBpm: null,
      currentSplit: 0,
      averageSplit: 0,
      restDistanceMeters: 500,
      restSeconds: 30,
      ergMachineType: 1,
    };
    expect(
      parseAdditionalStatus1(buildAdditionalStatus1Bytes(status)),
    ).toStrictEqual(status);
  });
});

describe("buildAdditionalStatus2Bytes: round-trips through parseAdditionalStatus2", () => {
  it("an interval-in-progress frame", () => {
    const status = {
      elapsedSeconds: 240,
      intervalCount: 1,
      averagePowerWatts: 180,
      totalCalories: 90,
      splitAvgPace: 108,
      splitAvgPowerWatts: 175,
      splitAvgCalories: 45,
      lastSplitTimeSeconds: 120,
      lastSplitDistanceMeters: 500,
    };
    expect(
      parseAdditionalStatus2(buildAdditionalStatus2Bytes(status)),
    ).toStrictEqual(status);
  });
});

describe("buildSplitIntervalDataBytes: round-trips through parseSplitIntervalData", () => {
  it("an interval-boundary frame", () => {
    const status = {
      elapsedSeconds: 300,
      distanceMeters: 1200,
      splitIntervalTimeSeconds: 240,
      splitIntervalDistanceMeters: 1000,
      intervalRestTimeSeconds: 60,
      intervalRestDistanceMeters: 0,
      splitIntervalType: 0,
      splitIntervalNumber: 1,
    };
    expect(
      parseSplitIntervalData(buildSplitIntervalDataBytes(status)),
    ).toStrictEqual(status);
  });
});

describe("buildAdditionalSplitIntervalDataBytes: round-trips through parseAdditionalSplitIntervalData", () => {
  it("an interval-boundary frame with both heart-rate fields present", () => {
    const status = {
      elapsedSeconds: 300,
      splitIntervalAvgStrokeRate: 22,
      splitIntervalWorkHeartRateBpm: 150,
      splitIntervalRestHeartRateBpm: 110,
      splitIntervalAvgPace: 108.3,
      splitIntervalTotalCalories: 90,
      splitIntervalAvgCalories: 45,
      splitIntervalSpeedMetersPerSecond: 4.5,
      splitIntervalPowerWatts: 175,
      splitAvgDragFactor: 130,
      splitIntervalNumber: 1,
      ergMachineType: 1,
    };
    expect(
      parseAdditionalSplitIntervalData(
        buildAdditionalSplitIntervalDataBytes(status),
      ),
    ).toStrictEqual(status);
  });

  it("no belt data on either heart-rate field (255 sentinel, both null)", () => {
    const status = {
      elapsedSeconds: 0,
      splitIntervalAvgStrokeRate: 0,
      splitIntervalWorkHeartRateBpm: null,
      splitIntervalRestHeartRateBpm: null,
      splitIntervalAvgPace: 0,
      splitIntervalTotalCalories: 0,
      splitIntervalAvgCalories: 0,
      splitIntervalSpeedMetersPerSecond: 0,
      splitIntervalPowerWatts: 0,
      splitAvgDragFactor: 0,
      splitIntervalNumber: 0,
      ergMachineType: 0,
    };
    expect(
      parseAdditionalSplitIntervalData(
        buildAdditionalSplitIntervalDataBytes(status),
      ),
    ).toStrictEqual(status);
  });
});
