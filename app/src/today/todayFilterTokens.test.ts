import { describe, expect, it, vi } from "vitest";
import type { Difficulty } from "../../domain/types.js";
import type { DurationBucket } from "../../domain/duration.js";
import {
  todayFilterTokens,
  type TodayFilterDefaults,
} from "./todayFilterTokens";

const ALL_THREE: Difficulty[] = ["easy", "medium", "hard"];
// The bucket set `bucketsForCap(60)` derives — todayOverrides.ts's own
// default for the server's 60-min preference, and this file's default
// fixture (mirrors the pre-Amendment CAPPED_DEFAULTS' `capMinutes: 60`).
const FIRST_THREE: DurationBucket[] = ["<30", "30-45", "45-60"];
const ALL_FOUR: DurationBucket[] = ["<30", "30-45", "45-60", "60+"];

const DEFAULTS: TodayFilterDefaults = {
  difficulties: ALL_THREE,
  durations: FIRST_THREE,
};

describe("todayFilterTokens", () => {
  it("returns no tokens when overrides match defaults exactly", () => {
    const onReset = vi.fn();
    const tokens = todayFilterTokens(
      { difficulties: ALL_THREE, durations: FIRST_THREE, painLevels: [] },
      DEFAULTS,
      onReset,
    );
    expect(tokens).toStrictEqual([]);
  });

  it("treats a reordered-but-identical difficulty set as no deviation (set, not array, equality)", () => {
    const tokens = todayFilterTokens(
      {
        difficulties: ["hard", "easy", "medium"],
        durations: FIRST_THREE,
        painLevels: [],
      },
      DEFAULTS,
      vi.fn(),
    );
    expect(tokens).toStrictEqual([]);
  });

  it("treats a reordered-but-identical duration set as no deviation (set, not array, equality)", () => {
    const tokens = todayFilterTokens(
      {
        difficulties: ALL_THREE,
        durations: ["45-60", "<30", "30-45"],
        painLevels: [],
      },
      DEFAULTS,
      vi.fn(),
    );
    expect(tokens).toStrictEqual([]);
  });

  it("emits tokens in DIFFICULTY/TIME/PAIN order regardless of which fields deviate", () => {
    const tokens = todayFilterTokens(
      { difficulties: ["easy"], durations: ["<30"], painLevels: [2] },
      DEFAULTS,
      vi.fn(),
    );
    expect(tokens.map((t) => t.key)).toStrictEqual([
      "difficulties",
      "durations",
      "pain",
    ]);
  });

  describe("difficulty deviation", () => {
    it("emits only a difficulties token when durations/pain still match defaults", () => {
      const tokens = todayFilterTokens(
        { difficulties: ["easy"], durations: FIRST_THREE, painLevels: [] },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens).toHaveLength(1);
      expect(tokens[0].key).toBe("difficulties");
    });

    it("a single selected difficulty reads its own bare label", () => {
      const tokens = todayFilterTokens(
        { difficulties: ["easy"], durations: FIRST_THREE, painLevels: [] },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("EASY");
    });

    it("a contiguous run collapses to its endpoints, order-independent", () => {
      const tokens = todayFilterTokens(
        {
          difficulties: ["medium", "easy"],
          durations: FIRST_THREE,
          painLevels: [],
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("EASY–MEDIUM");
    });

    it("a non-contiguous selection lists every member", () => {
      const tokens = todayFilterTokens(
        {
          difficulties: ["hard", "easy"],
          durations: FIRST_THREE,
          painLevels: [],
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("EASY, HARD");
    });

    it("every difficulty deselected reads NONE, not an empty label", () => {
      const tokens = todayFilterTokens(
        { difficulties: [], durations: FIRST_THREE, painLevels: [] },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("NONE");
    });

    it("a different-length subset of defaults deviates (the length-mismatch branch)", () => {
      const tokens = todayFilterTokens(
        {
          difficulties: ["easy", "medium"],
          durations: FIRST_THREE,
          painLevels: [],
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).toContain("difficulties");
    });

    it("a same-length but different difficulty set deviates (the membership-mismatch branch)", () => {
      const tokens = todayFilterTokens(
        {
          difficulties: ["easy", "hard"],
          durations: FIRST_THREE,
          painLevels: [],
        },
        { difficulties: ["easy", "medium"], durations: FIRST_THREE },
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).toContain("difficulties");
      expect(tokens[0].label).toBe("EASY, HARD");
    });

    it("onClear fires onReset('difficulties')", () => {
      const onReset = vi.fn();
      const tokens = todayFilterTokens(
        { difficulties: ["easy"], durations: FIRST_THREE, painLevels: [] },
        DEFAULTS,
        onReset,
      );
      tokens[0].onClear();
      expect(onReset).toHaveBeenCalledExactlyOnceWith("difficulties");
    });
  });

  describe("duration (TIME) deviation", () => {
    it("a single narrower bucket than the default reads its own range label", () => {
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, durations: ["<30"], painLevels: [] },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens).toStrictEqual([
        { key: "durations", label: "<30′", onClear: expect.any(Function) },
      ]);
    });

    it("a non-contiguous duration union lists every bucket comma-separated", () => {
      const tokens = todayFilterTokens(
        {
          difficulties: ALL_THREE,
          durations: ["<30", "60+"],
          painLevels: [],
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("<30′, 60′+");
    });

    // Amendment's own pinned edge: all-four selected is the >60-cap
    // DEFAULT — matching it is no deviation even though this fixture's
    // own default (FIRST_THREE) is narrower, because this test compares
    // against an uncapped (all-four) default explicitly.
    it("all four buckets selected, matching an uncapped default, shows no duration token", () => {
      const uncapped: TodayFilterDefaults = {
        difficulties: ALL_THREE,
        durations: ALL_FOUR,
      };
      const tokens = todayFilterTokens(
        { difficulties: ["easy"], durations: ALL_FOUR, painLevels: [] },
        uncapped,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).not.toContain("durations");
    });

    // All four buckets vs. a NARROWER default (FIRST_THREE) IS a real
    // deviation — a widening, not the default-for-high-caps case above —
    // and its own label reads as the full contiguous range, not "ANY TIME".
    it("all four buckets selected, widening past a narrower default, deviates and reads the full range", () => {
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, durations: ALL_FOUR, painLevels: [] },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens).toHaveLength(1);
      expect(tokens[0].key).toBe("durations");
      expect(tokens[0].label).toBe("<30′–60′+");
    });

    // Amendment's other pinned edge: an EMPTY selection (TIME off
    // entirely) behaves identically to all-four in suggest() (both = no
    // filtering) but must read as a DIFFERENT, distinguishable token —
    // there is no bucket to name, so it can't reuse the range-collapse
    // label at all.
    it("an empty selection deviating from a non-empty default reads ANY TIME, not a range label", () => {
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, durations: [], painLevels: [] },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens).toStrictEqual([
        { key: "durations", label: "ANY TIME", onClear: expect.any(Function) },
      ]);
    });

    it("an empty selection matching an already-empty default shows no duration token", () => {
      const empty: TodayFilterDefaults = {
        difficulties: ALL_THREE,
        durations: [],
      };
      const tokens = todayFilterTokens(
        { difficulties: ["easy"], durations: [], painLevels: [] },
        empty,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).not.toContain("durations");
    });

    it("durations-at-default (both FIRST_THREE) shows no duration token", () => {
      const tokens = todayFilterTokens(
        { difficulties: ["easy"], durations: FIRST_THREE, painLevels: [] },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).not.toContain("durations");
    });

    it("onClear fires onReset('durations')", () => {
      const onReset = vi.fn();
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, durations: ["<30"], painLevels: [] },
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
        { difficulties: ALL_THREE, durations: FIRST_THREE, painLevels: [] },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).not.toContain("pain");
    });

    it("a single level reads PAIN n", () => {
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, durations: FIRST_THREE, painLevels: [3] },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("PAIN 3");
    });

    it("a contiguous run collapses to a range, order-independent", () => {
      const tokens = todayFilterTokens(
        {
          difficulties: ALL_THREE,
          durations: FIRST_THREE,
          painLevels: [5, 4],
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("PAIN 4–5");
    });

    it("a longer contiguous run collapses the same way", () => {
      const tokens = todayFilterTokens(
        {
          difficulties: ALL_THREE,
          durations: FIRST_THREE,
          painLevels: [1, 2, 3],
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("PAIN 1–3");
    });

    it("a non-contiguous selection lists the levels", () => {
      const tokens = todayFilterTokens(
        {
          difficulties: ALL_THREE,
          durations: FIRST_THREE,
          painLevels: [1, 4],
        },
        DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("PAIN 1, 4");
    });

    it("onClear fires onReset('pain')", () => {
      const onReset = vi.fn();
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, durations: FIRST_THREE, painLevels: [2] },
        DEFAULTS,
        onReset,
      );
      tokens[0].onClear();
      expect(onReset).toHaveBeenCalledExactlyOnceWith("pain");
    });
  });

  it("each token's clear resets exactly its own group when all three deviate", () => {
    const onReset = vi.fn();
    const tokens = todayFilterTokens(
      { difficulties: ["hard"], durations: ["<30"], painLevels: [1, 2] },
      DEFAULTS,
      onReset,
    );
    expect(tokens).toHaveLength(3);
    tokens.find((t) => t.key === "difficulties")!.onClear();
    tokens.find((t) => t.key === "durations")!.onClear();
    tokens.find((t) => t.key === "pain")!.onClear();
    expect(onReset).toHaveBeenNthCalledWith(1, "difficulties");
    expect(onReset).toHaveBeenNthCalledWith(2, "durations");
    expect(onReset).toHaveBeenNthCalledWith(3, "pain");
  });
});
