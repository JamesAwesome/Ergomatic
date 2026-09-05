import { describe, expect, it, vi } from "vitest";
import type { DurationRange } from "../../domain/duration.js";
import {
  todayFilterTokens,
  type TodayFilterDefaults,
} from "./todayFilterTokens";

// Phase SF PR2: the TIME default is a range — a 60-minute cap reads
// `[0, 60]`; `[0, 120]` is the unbounded sentinel (spec I-13's four cells).
const CAP_60: DurationRange = { min: 0, max: 60 };
const UNBOUNDED: DurationRange = { min: 0, max: 120 };

const DEFAULTS: TodayFilterDefaults = {
  durationRange: CAP_60,
};

describe("todayFilterTokens", () => {
  it("returns no tokens when overrides match defaults exactly", () => {
    const onReset = vi.fn();
    const tokens = todayFilterTokens(
      {
        durationRange: CAP_60,
        painLevels: [],
        lastDone: null,
        source: null,
      },
      DEFAULTS,
      onReset,
    );
    expect(tokens).toStrictEqual([]);
  });

  it("treats a reordered-but-identical duration set as no deviation (set, not array, equality)", () => {
    const tokens = todayFilterTokens(
      {
        durationRange: { min: 0, max: 60 },
        painLevels: [],
        lastDone: null,
        source: null,
      },
      DEFAULTS,
      vi.fn(),
    );
    expect(tokens).toStrictEqual([]);
  });

  it("emits tokens in TIME/PAIN order regardless of which fields deviate", () => {
    const tokens = todayFilterTokens(
      {
        durationRange: { min: 0, max: 30 },
        painLevels: [2],
        lastDone: null,
        source: null,
      },
      DEFAULTS,
      vi.fn(),
    );
    expect(tokens.map((t) => t.key)).toStrictEqual(["durations", "pain"]);
  });

  describe("duration (TIME) deviation — spec I-13's four cells", () => {
    it("narrower than the default reads its own label (≤30′)", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: { min: 0, max: 30 },
          painLevels: [],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens).toStrictEqual([
        { key: "durations", label: "≤30′", onClear: expect.any(Function) },
      ]);
    });

    it("a bounded window and an open upper end read min–max′ and min′+", () => {
      const window = todayFilterTokens(
        {
          durationRange: { min: 25, max: 35 },
          painLevels: [],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(window[0].label).toBe("25–35′");
      const open = todayFilterTokens(
        {
          durationRange: { min: 60, max: 120 },
          painLevels: [],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(open[0].label).toBe("60′+");
    });

    it("the unbounded sentinel matching an unbounded default (cap ≥ 120) shows no duration token", () => {
      const uncapped: TodayFilterDefaults = {
        durationRange: UNBOUNDED,
      };
      const tokens = todayFilterTokens(
        {
          durationRange: UNBOUNDED,
          painLevels: [],
          lastDone: null,
          source: null,
        },
        uncapped,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).not.toContain("durations");
    });

    it("the unbounded sentinel widening past a narrower default DEVIATES and reads ANY LENGTH (a real filter state with its own ✕)", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: UNBOUNDED,
          painLevels: [],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens).toStrictEqual([
        {
          key: "durations",
          label: "ANY LENGTH",
          onClear: expect.any(Function),
        },
      ]);
    });

    it("at the default (both [0, 60]) shows no duration token", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: { min: 0, max: 60 },
          painLevels: [],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).not.toContain("durations");
    });

    it("onClear fires onReset('durations')", () => {
      const onReset = vi.fn();
      const tokens = todayFilterTokens(
        {
          durationRange: { min: 0, max: 30 },
          painLevels: [],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        onReset,
      );
      tokens[0].onClear();
      expect(onReset).toHaveBeenCalledExactlyOnceWith("durations");
    });
  });

  describe("pain deviation", () => {
    it("emits no pain token when painLevels is empty", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).not.toContain("pain");
    });

    it("a single level reads PAIN n", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [3],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("PAIN 3");
    });

    it("a contiguous run collapses to a range, order-independent", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [5, 4],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("PAIN 4–5");
    });

    it("a longer contiguous run collapses the same way", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [1, 2, 3],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("PAIN 1–3");
    });

    it("a non-contiguous selection lists the levels", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [1, 4],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("PAIN 1, 4");
    });

    it("onClear fires onReset('pain')", () => {
      const onReset = vi.fn();
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [2],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        onReset,
      );
      tokens[0].onClear();
      expect(onReset).toHaveBeenCalledExactlyOnceWith("pain");
    });
  });

  // Round 2 (2026-08-04): LAST DONE/SOURCE both default to null
  // unconditionally (no `defaults` comparison the way DIFFICULTY/TIME get)
  // — "deviates" is simply "is not null", the same shape PAIN's own
  // `length > 0` check already uses.
  describe("lastDone (LAST DONE) deviation", () => {
    it("emits no lastDone token when null (off)", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).not.toContain("lastDone");
    });

    it("under21 reads <21D", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [],
          lastDone: "under21",
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens).toStrictEqual([
        { key: "lastDone", label: "<21D", onClear: expect.any(Function) },
      ]);
    });

    it("over21 reads 21D+", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [],
          lastDone: "over21",
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("21D+");
    });

    it("onClear fires onReset('lastDone')", () => {
      const onReset = vi.fn();
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [],
          lastDone: "under21",
          source: null,
        },
        DEFAULTS,
        onReset,
      );
      tokens[0].onClear();
      expect(onReset).toHaveBeenCalledExactlyOnceWith("lastDone");
    });
  });

  describe("source (SOURCE) deviation", () => {
    it("emits no source token when null (off)", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [],
          lastDone: null,
          source: null,
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).not.toContain("source");
    });

    it("custom reads CUSTOM", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [],
          lastDone: null,
          source: "custom",
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens).toStrictEqual([
        { key: "source", label: "MY WORKOUTS", onClear: expect.any(Function) },
      ]);
    });

    it("global reads GLOBAL", () => {
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [],
          lastDone: null,
          source: "global",
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("ERGOMATIC LIBRARY");
    });

    it("onClear fires onReset('source')", () => {
      const onReset = vi.fn();
      const tokens = todayFilterTokens(
        {
          durationRange: CAP_60,
          painLevels: [],
          lastDone: null,
          source: "custom",
        },
        DEFAULTS,
        onReset,
      );
      tokens[0].onClear();
      expect(onReset).toHaveBeenCalledExactlyOnceWith("source");
    });
  });

  it("emits tokens in TIME/PAIN/LAST DONE/SOURCE order when all four deviate", () => {
    const tokens = todayFilterTokens(
      {
        durationRange: { min: 0, max: 30 },
        painLevels: [2],
        lastDone: "under21",
        source: "custom",
      },
      DEFAULTS,
      vi.fn(),
    );
    expect(tokens.map((t) => t.key)).toStrictEqual([
      "durations",
      "pain",
      "lastDone",
      "source",
    ]);
  });

  it("each token's clear resets exactly its own group when all four deviate", () => {
    const onReset = vi.fn();
    const tokens = todayFilterTokens(
      {
        durationRange: { min: 0, max: 30 },
        painLevels: [1, 2],
        lastDone: "under21",
        source: "custom",
      },
      DEFAULTS,
      onReset,
    );
    expect(tokens).toHaveLength(4);
    tokens.find((t) => t.key === "durations")!.onClear();
    tokens.find((t) => t.key === "pain")!.onClear();
    tokens.find((t) => t.key === "lastDone")!.onClear();
    tokens.find((t) => t.key === "source")!.onClear();
    expect(onReset).toHaveBeenNthCalledWith(1, "durations");
    expect(onReset).toHaveBeenNthCalledWith(2, "pain");
    expect(onReset).toHaveBeenNthCalledWith(3, "lastDone");
    expect(onReset).toHaveBeenNthCalledWith(4, "source");
  });
});
