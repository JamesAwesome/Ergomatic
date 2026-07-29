import { describe, it, expect } from "vitest";
import { parseBulk } from "./bulk.js";

describe("parseBulk", () => {
  it("parses one valid multi-block paste", () => {
    const text = `
12 | Ladder Day | AT | medium | 3
wu 10
x4
w 1' 6k-2 @22 r5
r 5

13 | Long Repeats | O2 | easy | 2
wu 10
x5
w 2500m 2k-4 @24 r5
test 2k
`;
    const result = parseBulk(text);
    expect(result.errors).toStrictEqual([]);
    expect(result.workouts).toHaveLength(2);

    expect(result.workouts[0]).toStrictEqual({
      num: 12,
      title: "Ladder Day",
      type: "AT",
      difficulty: "medium",
      pain: 3,
      steps: [
        { k: "wu", minutes: 10 },
        { k: "reps", count: 4 },
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { base: "6k", off: -2 },
          spm: 22,
          restMinutes: 5,
        },
        { k: "r", minutes: 5 },
      ],
    });

    expect(result.workouts[1]).toStrictEqual({
      num: 13,
      title: "Long Repeats",
      type: "O2",
      difficulty: "easy",
      pain: 2,
      steps: [
        { k: "wu", minutes: 10 },
        { k: "reps", count: 5 },
        {
          k: "w",
          duration: { kind: "distance", meters: 2500 },
          ref: { base: "2k", off: -4 },
          spm: 24,
          restMinutes: 5,
        },
        { k: "test", label: "2k" },
      ],
    });
  });

  it("is tolerant of extra/leading/trailing blank lines between blocks", () => {
    const text = `


12 | Ladder Day | AT | medium | 3
wu 10
w 1' 6k @20



13 | Repeat | O2 | easy | 1
wu 5
w 1' 2k @20


`;
    const result = parseBulk(text);
    expect(result.errors).toStrictEqual([]);
    expect(result.workouts.map((w) => w.num)).toStrictEqual([12, 13]);
  });

  it("reports a bad header field (invalid type) and skips the block", () => {
    const text = `12 | Ladder Day | ZZ | medium | 3
wu 10
w 1' 6k @20`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      { block: 0, line: 1, message: expect.stringContaining("type") },
    ]);
  });

  it("reports a bad header field (wrong field count) and skips the block", () => {
    const text = `12 | Ladder Day | AT | medium
wu 10`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      { block: 0, line: 1, message: expect.stringContaining("5 fields") },
    ]);
  });

  it("reports an unknown step word", () => {
    const text = `12 | Ladder Day | AT | medium | 3
wu 10
zzz 5`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      {
        block: 0,
        line: 3,
        message: expect.stringContaining("unknown step word"),
      },
    ]);
  });

  it("reports a bad duration unit on a work step", () => {
    const text = `12 | Ladder Day | AT | medium | 3
wu 10
w 10x 6k @20`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      { block: 0, line: 3, message: expect.stringContaining("duration") },
    ]);
  });

  it("reports a bad pace ref on a work step", () => {
    const text = `12 | Ladder Day | AT | medium | 3
wu 10
w 1' 9k-2 @20`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      { block: 0, line: 3, message: expect.stringContaining("pace ref") },
    ]);
  });

  it("reports a non-integer num in the header", () => {
    const text = `abc | Ladder Day | AT | medium | 3
wu 10`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      { block: 0, line: 1, message: expect.stringContaining("invalid num") },
    ]);
  });

  it("reports an empty title in the header", () => {
    const text = `12 |  | AT | medium | 3
wu 10`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      { block: 0, line: 1, message: "title is required" },
    ]);
  });

  it("reports a bad difficulty value in the header", () => {
    const text = `12 | Ladder Day | AT | zzz | 3
wu 10`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      {
        block: 0,
        line: 1,
        message: expect.stringContaining("invalid difficulty"),
      },
    ]);
  });

  it("reports a non-integer pain value in the header", () => {
    const text = `12 | Ladder Day | AT | medium | 3.5
wu 10`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      { block: 0, line: 1, message: expect.stringContaining("invalid pain") },
    ]);
  });

  it("reports a work step missing its duration/pace-ref tokens", () => {
    const text = `12 | Ladder Day | AT | medium | 3
wu 10
w 1'`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      {
        block: 0,
        line: 3,
        message: expect.stringContaining("needs a duration and a pace ref"),
      },
    ]);
  });

  it("reports a bad spm token on a work step", () => {
    const text = `12 | Ladder Day | AT | medium | 3
wu 10
w 1' 6k @zz`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      { block: 0, line: 3, message: expect.stringContaining("bad spm") },
    ]);
  });

  it("reports an unexpected token on a work step", () => {
    const text = `12 | Ladder Day | AT | medium | 3
wu 10
w 1' 6k huh`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      {
        block: 0,
        line: 3,
        message: expect.stringContaining("unexpected token"),
      },
    ]);
  });

  it("handles a work step with no optional spm/rest", () => {
    const text = `12 | Ladder Day | AT | medium | 3
w 2000m 2k`;
    const result = parseBulk(text);
    expect(result.errors).toStrictEqual([]);
    expect(result.workouts[0].steps[0]).toStrictEqual({
      k: "w",
      duration: { kind: "distance", meters: 2000 },
      ref: { base: "2k", off: 0 },
    });
  });

  it("accumulates multiple errors across blocks with correct block indices", () => {
    const text = `1 | Bad Type | ZZ | medium | 3
wu 10

2 | Bad Step | AT | medium | 3
zzz 5`;
    const result = parseBulk(text);
    expect(result.errors.map((e) => e.block)).toStrictEqual([0, 1]);
  });

  it("errors when a block has no step lines at all", () => {
    const text = `1 | Header Only | AT | medium | 3`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      {
        block: 0,
        line: 1,
        message: expect.stringContaining("at least one step"),
      },
    ]);
  });

  it("reports a wu step missing its minutes", () => {
    const text = `1 | Ladder | AT | medium | 3\nwu\nw 1' 6k @20`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      {
        block: 0,
        line: 2,
        message: expect.stringContaining("wu needs minutes"),
      },
    ]);
  });

  it("reports a wu step with trailing garbage after the minutes", () => {
    // "wu 10 extra" must be rejected outright, not silently parsed as
    // minutes: 10 with the extra token ignored.
    const text = `1 | Ladder | AT | medium | 3\nwu 10 extra\nw 1' 6k @20`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      {
        block: 0,
        line: 2,
        message: expect.stringContaining("wu needs minutes"),
      },
    ]);
  });

  it("reports an r step with non-numeric minutes", () => {
    const text = `1 | Ladder | AT | medium | 3\nwu 10\nr abc`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      {
        block: 0,
        line: 3,
        message: expect.stringContaining("r needs minutes"),
      },
    ]);
  });

  it("reports a test step with no label", () => {
    const text = `1 | Ladder | AT | medium | 3\nwu 10\ntest`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      {
        block: 0,
        line: 3,
        message: expect.stringContaining("test needs a label"),
      },
    ]);
  });

  it("returns empty result for blank input", () => {
    expect(parseBulk("")).toStrictEqual({ workouts: [], errors: [] });
    expect(parseBulk("   \n\n  ")).toStrictEqual({ workouts: [], errors: [] });
  });
});
