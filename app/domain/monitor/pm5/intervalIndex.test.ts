import { describe, expect, it } from "vitest";
import type { MonitorFrame } from "../types.js";
import { toProgramIndex } from "./intervalIndex.js";

// The full observed table (interface-notes.md §18 #3, PM5 432331249,
// 2026-08-05): a clean 2x(1:00 work / 0:30 rest) session read
// work0 -> idx 0, rest-after-work0 -> idx 1, work1 -> idx 1,
// rest-after-work1 -> idx 2 (the "phantom third index" defect). Every row
// maps to OUR 0-based-per-work-interval numbering for a 2-interval program.
describe("toProgramIndex: the observed 2-interval table (interface-notes.md §18 #3)", () => {
  it.each<[string, number, MonitorFrame["state"], number]>([
    ["work0", 0, "rowing", 0],
    ["rest-after-work0", 1, "resting", 0],
    ["work1", 1, "rowing", 1],
    // The exact defect: the machine's "phantom" index 2 (no interval 2
    // exists in a 2-interval program) resolves to interval 1 — the
    // program's own last interval, whose trailing rest this actually is.
    ["rest-after-work1 (the observed defect: phantom idx 2)", 2, "resting", 1],
  ])(
    "%s: machineIndex %i, state %s -> our %i",
    (_label, machineIndex, state, expected) => {
      expect(toProgramIndex(machineIndex, state, 2)).toBe(expected);
    },
  );
});

describe("toProgramIndex: clamps at the two ends of the program", () => {
  it("a rest reported before any interval has begun (machineIndex 0) clamps to interval 0", () => {
    // candidate = 0 - 1 = -1 -- the offset rule's own lower-boundary shape.
    expect(toProgramIndex(0, "resting", 2)).toBe(0);
  });

  it("a work tick reported one past the program's last interval clamps to the last interval", () => {
    // candidate = machineIndex = programLength -- the offset rule's own
    // upper-boundary shape.
    expect(toProgramIndex(2, "rowing", 2)).toBe(1);
  });

  it("a rest tick reported one past the program's last interval (via the -1 offset) also clamps to the last interval", () => {
    // candidate = 3 - 1 = programLength(2) -- same upper-boundary shape,
    // reached through the resting branch instead of the rowing one.
    expect(toProgramIndex(3, "resting", 2)).toBe(1);
  });
});

describe("toProgramIndex: null when the value is not explained by the program's length", () => {
  it("more than one step past the last interval (rowing) is unexplainable", () => {
    expect(toProgramIndex(5, "rowing", 2)).toBeNull();
  });

  it("more than one step below zero (resting) is unexplainable", () => {
    // candidate = -1 - 1 = -2 -- two steps below the valid range, not the
    // rule's own -1 boundary shape.
    expect(toProgramIndex(-1, "resting", 2)).toBeNull();
  });
});

describe("toProgramIndex: states outside rowing/resting always return null", () => {
  it.each<MonitorFrame["state"]>(["idle", "armed", "finished", "terminated"])(
    "state=%s -> null regardless of machineIndex",
    (state) => {
      expect(toProgramIndex(0, state, 2)).toBeNull();
      expect(toProgramIndex(1, state, 2)).toBeNull();
    },
  );
});

describe("toProgramIndex: no program to explain the index against", () => {
  it("programLength 0 -> null even while rowing", () => {
    expect(toProgramIndex(0, "rowing", 0)).toBeNull();
  });

  it("a negative programLength -> null (defensive; not a shape a real WorkoutProgram produces)", () => {
    expect(toProgramIndex(0, "rowing", -1)).toBeNull();
  });
});

describe("toProgramIndex: a 1-interval program", () => {
  it("work0, rowing, machineIndex 0 -> our 0", () => {
    expect(toProgramIndex(0, "rowing", 1)).toBe(0);
  });

  it("rest-after-work0, resting, machineIndex 1 -> our 0", () => {
    expect(toProgramIndex(1, "resting", 1)).toBe(0);
  });

  it("a rest reported before interval 0 has begun (machineIndex 0) clamps to 0", () => {
    expect(toProgramIndex(0, "resting", 1)).toBe(0);
  });

  it("a work tick one past the only interval clamps to 0", () => {
    expect(toProgramIndex(1, "rowing", 1)).toBe(0);
  });

  it("more than one step past the only interval is unexplainable", () => {
    expect(toProgramIndex(2, "rowing", 1)).toBeNull();
  });
});
