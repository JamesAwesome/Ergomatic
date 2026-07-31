import { describe, expect, it } from "vitest";
import {
  fmtDuration,
  fmtDurationSpoken,
  parseClock,
  parseDurationToken,
} from "./duration.js";

describe("fmtDuration", () => {
  it.each([
    [0.75, "0:45"],
    [0.5, "0:30"],
    [1 / 60, "0:01"],
    [1, "1:00"],
    [1.5, "1:30"],
    [20, "20:00"],
    [65, "1:05:00"],
    [180, "3:00:00"],
  ])("renders %s minutes as %s", (minutes, expected) => {
    expect(fmtDuration(minutes)).toBe(expected);
  });

  it("keeps two groups at 59:59 and gains the hour group at 1:00:00", () => {
    expect(fmtDuration(59 + 59 / 60)).toBe("59:59");
    expect(fmtDuration(60)).toBe("1:00:00");
  });

  it("never zero-pads the leading group", () => {
    expect(fmtDuration(0.75)).toBe("0:45");
    expect(fmtDuration(65)).toBe("1:05:00");
  });

  it("survives rounding: floor and round disagree on 123 seconds", () => {
    // When minutes * 60 yields a value just below an integer (e.g., 122.99999…),
    // Math.floor and Math.round produce different results. 2.05 * 60 ≈ 122.999…,
    // so floor yields 2:02 (wrong) and round yields 2:03 (correct). This test dies
    // if rounding is replaced with floor.
    expect(fmtDuration(123 / 60)).toBe("2:03");
  });
});

describe("parseClock", () => {
  it.each([
    ["0:45", 0.75],
    ["0:01", 1 / 60],
    ["1:30", 1.5],
    ["20:00", 20],
    ["1:05:00", 65],
    ["3:00:00", 180],
  ])("parses %s as %s minutes", (text, expected) => {
    expect(parseClock(text)!).toBeCloseTo(expected, 9);
  });

  it("normalises overflowing groups by total seconds", () => {
    // The mask can produce 1:70 transiently; parsing it as 130s is what lets
    // the field normalise on blur instead of rejecting a keystroke.
    expect(fmtDuration(parseClock("1:70")!)).toBe("2:10");
    expect(fmtDuration(parseClock("0:90")!)).toBe("1:30");
  });

  it.each(["", "abc", "5", "1:2:3:4", "1:", ":30", "-1:30", "1:30m"])(
    "rejects %s",
    (text) => {
      expect(parseClock(text)).toBeNull();
    },
  );

  it("round-trips every canonical form it can produce", () => {
    for (const text of [
      "0:01",
      "0:20",
      "0:45",
      "1:00",
      "1:30",
      "59:59",
      "1:00:00",
      "1:05:00",
      "3:00:00",
    ]) {
      expect(fmtDuration(parseClock(text)!)).toBe(text);
    }
  });

  it("round-trips values where floor and round disagree, catching rounding bugs", () => {
    // 2:03 parses to 123 seconds. When reconstructing, 123/60 = 2.05, and
    // 2.05 * 60 ≈ 122.999…, so floor would yield 122 (broken), round yields 123
    // (correct). This test catches a regression to floor.
    expect(fmtDuration(parseClock("2:03")!)).toBe("2:03");
    // Similarly: 1:43 → 103 seconds → 103/60 ≈ 1.716666… → 1.716666… * 60
    // ≈ 102.999…, floor → 102 (broken), round → 103 (correct).
    expect(fmtDuration(parseClock("1:43")!)).toBe("1:43");
  });
});

describe("fmtDurationSpoken", () => {
  it.each([
    [0, "0 seconds"],
    [0.75, "45 seconds"],
    [1 / 60, "1 second"],
    [1, "1 minute"],
    [1.5, "1 minute 30 seconds"],
    [20, "20 minutes"],
    [60, "1 hour"],
    [65, "1 hour 5 minutes"],
    [125.5, "2 hours 5 minutes 30 seconds"],
  ])("speaks %s minutes as %s", (minutes, expected) => {
    expect(fmtDurationSpoken(minutes)).toBe(expected);
  });

  it("omits zero groups rather than saying 'zero minutes'", () => {
    expect(fmtDurationSpoken(60)).toBe("1 hour");
  });
});

describe("parseDurationToken", () => {
  it.each([
    ["0:45", { kind: "time", minutes: 0.75 }],
    ["20:00", { kind: "time", minutes: 20 }],
    ["1:05:00", { kind: "time", minutes: 65 }],
    ["5", { kind: "time", minutes: 5 }],
    ["2.5", { kind: "time", minutes: 2.5 }],
    ["10'", { kind: "time", minutes: 10 }],
    ["2500m", { kind: "distance", meters: 2500 }],
  ])("parses %s", (token, expected) => {
    expect(parseDurationToken(token)).toStrictEqual(expected);
  });

  it.each(["", "abc", "2500 m", "m", "1e3", "0x10", "+5"])(
    "rejects %s",
    (token) => {
      expect(parseDurationToken(token)).toBeNull();
    },
  );
});
