import { describe, it, expect } from "vitest";
import { droppedWarmupNotice, parseBulk } from "./bulk.js";
import { parseDurationToken } from "./duration.js";

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
    // Both blocks lead with a wu line — dropped, never turned into a step,
    // and counted (spec §6/M6): "wu" left the Step union 2026-08-09.
    expect(result.droppedWarmups).toBe(2);

    expect(result.workouts[0]).toStrictEqual({
      title: "Ladder Day",
      type: "AT",
      difficulty: "medium",
      pain: 3,
      steps: [
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
      title: "Long Repeats",
      type: "O2",
      difficulty: "easy",
      pain: 2,
      steps: [
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
    expect(result.workouts.map((w) => w.title)).toStrictEqual([
      "Ladder Day",
      "Repeat",
    ]);
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
    const text = `12 | Ladder Day | AT
wu 10`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      {
        block: 0,
        line: 1,
        message: expect.stringContaining("title | TYPE | difficulty | pain"),
      },
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

  // Arc review F7: dropping a well-formed `wu` line must not leave a block
  // that reports OK while carrying `steps: []`. Before this, a warm-up-only
  // block parsed "successfully" into an unusable workout, and the only
  // complaint came from `validateSteps` much further downstream ("steps
  // must be a non-empty array (max 100)") — a message naming neither the
  // warm-up nor how to keep one.
  it("a block whose only lines are warm-ups is a parse ERROR, not an ok workout with no steps", () => {
    const text = `1 | Warmup Only | AT | medium | 3\nwu 10`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      {
        block: 0,
        line: 1,
        message:
          "workout needs at least one step. Add the warm-up as an ordinary first step.",
      },
    ]);
    // Still counted: the import notice should say the line was dropped
    // even though the block it was in could not be built.
    expect(result.droppedWarmups).toBe(1);
  });

  it("two warm-up lines and nothing else: the same error once, both counted", () => {
    const text = `1 | Warmups Only | AT | medium | 3\nwu 10\nwu 5`;
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.droppedWarmups).toBe(2);
  });

  it("a warm-up-only block does not eat a neighbouring GOOD block (still never fatal beyond itself)", () => {
    const text = `1 | Warmup Only | AT | medium | 3
wu 10

2 | Real One | O2 | easy | 2
w 20' 6k`;
    const result = parseBulk(text);
    expect(result.errors.map((e) => e.block)).toStrictEqual([0]);
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0]!.title).toBe("Real One");
    expect(result.droppedWarmups).toBe(1);
  });

  it("reports a wu step missing its minutes (a malformed wu line still errors — only a well-formed one is dropped)", () => {
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
    expect(result.droppedWarmups).toBe(0);
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
    expect(result.droppedWarmups).toBe(0);
  });

  // Spec §6, adversarial M6: case-deletion (making "wu" fall through to
  // "unknown step word") would have made the line fatal and eaten the
  // whole block. The parser instead recognizes it explicitly, parses it,
  // drops it, and counts it — the block survives with its other steps
  // intact.
  it("a wu line is dropped and counted, never fatal, and its block survives", () => {
    const text = `Title | AT | medium | 3
wu 5
x2
w 4' 6k-2
r 1`;
    const r = parseBulk(text);
    expect(r.errors).toStrictEqual([]);
    expect(r.droppedWarmups).toBe(1);
    expect(r.workouts).toHaveLength(1);
    expect(r.workouts[0]!.steps.map((s) => s.k)).toStrictEqual([
      "reps",
      "w",
      "r",
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
    expect(parseBulk("")).toStrictEqual({
      workouts: [],
      errors: [],
      droppedWarmups: 0,
    });
    expect(parseBulk("   \n\n  ")).toStrictEqual({
      workouts: [],
      errors: [],
      droppedWarmups: 0,
    });
  });

  it("accepts a bare number as minutes, matching what the builder now accepts", () => {
    const result = parseBulk(`Bare Minutes | O2 | easy | 2
wu 10
w 5 6k+0 @20`);
    expect(result.errors).toStrictEqual([]);
    expect(result.droppedWarmups).toBe(1);
    // The wu line is dropped, not turned into a step — the w step is now
    // steps[0], not steps[1].
    expect(result.workouts[0].steps[0]).toStrictEqual({
      k: "w",
      duration: { kind: "time", minutes: 5 },
      ref: { base: "6k", off: 0 },
      spm: 20,
    });
  });

  it("accepts a four-field header without a number", () => {
    const result = parseBulk(`No Number | AT | medium | 3
w 1' 6k-2`);
    expect(result.errors).toStrictEqual([]);
    expect(result.workouts[0].title).toBe("No Number");
    expect(result.workouts[0].type).toBe("AT");
  });

  it("still accepts the legacy five-field header and ignores the leading number", () => {
    const result = parseBulk(`12 | Legacy | AT | medium | 3
w 1' 6k-2`);
    expect(result.errors).toStrictEqual([]);
    expect(result.workouts[0].title).toBe("Legacy");
    expect(result.workouts[0]).not.toHaveProperty("num");
  });

  // Final-review fix wave item 6: documents two header ambiguities that
  // parseHeader's four-vs-five-field heuristic produces. Not a bug fix —
  // the parser isn't changed — just recording the current behavior so the
  // next reader learns it from the suite instead of rediscovering it.
  it("documents a 4-field header with a numeric-looking title parsing as that title, not a leading number", () => {
    const result = parseBulk(`12 | AT | medium | 3
w 1' 6k-2`);
    expect(result.errors).toStrictEqual([]);
    expect(result.workouts[0].title).toBe("12");
  });

  it("documents a 5-field header silently discarding a non-numeric leading token as if it were the legacy number", () => {
    const result = parseBulk(`Ladder | Day | AT | medium | 3
w 1' 6k-2`);
    expect(result.errors).toStrictEqual([]);
    expect(result.workouts[0].title).toBe("Day");
  });

  it("names both accepted header shapes when the field count is wrong", () => {
    const result = parseBulk(`One | Two | Three
w 1' 6k-2`);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors[0].message).toMatch(
      /title \| TYPE \| difficulty \| pain/,
    );
  });
});

describe("clock durations in bulk blocks", () => {
  it("parses a 0:45 work line", () => {
    const res = parseBulk("Sprints | AN | easy | 3\nw 0:45 6k+2\n");
    expect(res.errors).toStrictEqual([]);
    const step = res.workouts[0]!.steps.find((s) => s.k === "w");
    expect(step).toMatchObject({ duration: { kind: "time", minutes: 0.75 } });
  });

  it("covers every legal duration form (clock, bare number, apostrophe, distance)", () => {
    // Named for what this actually checks: parseDurationToken's own grammar
    // coverage. It doesn't touch the builder — importing src/builder/
    // from a domain test would be a layering violation (domain must not
    // depend on client code) — so it can't and doesn't prove the builder
    // agrees with this. That comparison lives in
    // src/builder/builderState.test.ts ("builder's REST field agrees with
    // parseDurationToken on every duration form"), which is allowed to
    // import domain code and does the actual cross-path comparison.
    for (const [token, expected] of [
      ["0:45", { kind: "time", minutes: 0.75 }],
      ["5", { kind: "time", minutes: 5 }],
      ["10'", { kind: "time", minutes: 10 }],
      ["2500m", { kind: "distance", meters: 2500 }],
    ] as const) {
      expect(parseDurationToken(token)).toStrictEqual(expected);
    }
  });
});

describe("effort refs in bulk blocks", () => {
  it("parses effort lines", () => {
    const text = "Sprints | AN | hard | 5\nw 0:30 max @32\nw 500m min\n";
    const result = parseBulk(text);
    expect(result.errors).toStrictEqual([]);
    const [a, b] = result.workouts[0]!.steps.filter((s) => s.k === "w");
    expect(a).toStrictEqual({
      k: "w",
      duration: { kind: "time", minutes: 0.5 },
      ref: { effort: "max" },
      spm: 32,
    });
    expect(b).toStrictEqual({
      k: "w",
      duration: { kind: "distance", meters: 500 },
      ref: { effort: "min" },
    });
  });

  it("errors max+2 per line", () => {
    const text = "Sprints | AN | hard | 5\nw 0:30 max+2\n";
    const result = parseBulk(text);
    expect(result.workouts).toStrictEqual([]);
    expect(result.errors).toStrictEqual([
      {
        block: 0,
        line: 2,
        message: expect.stringContaining("effort refs take no offset"),
      },
    ]);
  });
});

describe("droppedWarmupNotice", () => {
  it("pluralizes for N > 1", () => {
    expect(droppedWarmupNotice(2)).toBe(
      "2 warm-up lines dropped. Add a warm-up as an ordinary first step instead.",
    );
  });

  it("stays singular for exactly 1", () => {
    expect(droppedWarmupNotice(1)).toBe(
      "1 warm-up line dropped. Add a warm-up as an ordinary first step instead.",
    );
  });

  it("carries no em-dash (house rule for user-facing copy)", () => {
    expect(droppedWarmupNotice(3)).not.toMatch(/—/);
  });
});
