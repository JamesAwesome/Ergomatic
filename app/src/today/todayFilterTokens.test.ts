import { describe, expect, it, vi } from "vitest";
import type { Difficulty } from "../../domain/types.js";
import {
  todayFilterTokens,
  type TodayFilterDefaults,
} from "./todayFilterTokens";

const ALL_THREE: Difficulty[] = ["easy", "medium", "hard"];

const CAPPED_DEFAULTS: TodayFilterDefaults = {
  difficulties: ALL_THREE,
  capMinutes: 60,
};

describe("todayFilterTokens", () => {
  it("returns no tokens when overrides match defaults exactly", () => {
    const onReset = vi.fn();
    const tokens = todayFilterTokens(
      { difficulties: ALL_THREE, capMinutes: 60, painLevels: [] },
      CAPPED_DEFAULTS,
      onReset,
    );
    expect(tokens).toStrictEqual([]);
  });

  it("treats a reordered-but-identical difficulty set as no deviation (set, not array, equality)", () => {
    const tokens = todayFilterTokens(
      {
        difficulties: ["hard", "easy", "medium"],
        capMinutes: 60,
        painLevels: [],
      },
      CAPPED_DEFAULTS,
      vi.fn(),
    );
    expect(tokens).toStrictEqual([]);
  });

  it("emits tokens in DIFFICULTY/TIME/PAIN order regardless of which fields deviate", () => {
    const tokens = todayFilterTokens(
      { difficulties: ["easy"], capMinutes: 30, painLevels: [2] },
      CAPPED_DEFAULTS,
      vi.fn(),
    );
    expect(tokens.map((t) => t.key)).toStrictEqual([
      "difficulties",
      "cap",
      "pain",
    ]);
  });

  describe("difficulty deviation", () => {
    it("emits only a difficulties token when cap/pain still match defaults", () => {
      const tokens = todayFilterTokens(
        { difficulties: ["easy"], capMinutes: 60, painLevels: [] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens).toHaveLength(1);
      expect(tokens[0].key).toBe("difficulties");
    });

    it("a single selected difficulty reads its own bare label", () => {
      const tokens = todayFilterTokens(
        { difficulties: ["easy"], capMinutes: 60, painLevels: [] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("EASY");
    });

    it("a contiguous run collapses to its endpoints, order-independent", () => {
      const tokens = todayFilterTokens(
        { difficulties: ["medium", "easy"], capMinutes: 60, painLevels: [] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("EASY–MEDIUM");
    });

    it("a non-contiguous selection lists every member", () => {
      const tokens = todayFilterTokens(
        { difficulties: ["hard", "easy"], capMinutes: 60, painLevels: [] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("EASY, HARD");
    });

    it("every difficulty deselected reads NONE, not an empty label", () => {
      const tokens = todayFilterTokens(
        { difficulties: [], capMinutes: 60, painLevels: [] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("NONE");
    });

    it("a different-length subset of defaults deviates (the length-mismatch branch)", () => {
      const tokens = todayFilterTokens(
        { difficulties: ["easy", "medium"], capMinutes: 60, painLevels: [] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).toContain("difficulties");
    });

    it("a same-length but different difficulty set deviates (the membership-mismatch branch)", () => {
      const tokens = todayFilterTokens(
        { difficulties: ["easy", "hard"], capMinutes: 60, painLevels: [] },
        { difficulties: ["easy", "medium"], capMinutes: 60 },
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).toContain("difficulties");
      expect(tokens[0].label).toBe("EASY, HARD");
    });

    it("onClear fires onReset('difficulties')", () => {
      const onReset = vi.fn();
      const tokens = todayFilterTokens(
        { difficulties: ["easy"], capMinutes: 60, painLevels: [] },
        CAPPED_DEFAULTS,
        onReset,
      );
      tokens[0].onClear();
      expect(onReset).toHaveBeenCalledExactlyOnceWith("difficulties");
    });
  });

  describe("cap deviation", () => {
    it("a narrower cap than a capped default reads its own ≤NN′ label", () => {
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, capMinutes: 30, painLevels: [] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens).toStrictEqual([
        { key: "cap", label: "≤30′", onClear: expect.any(Function) },
      ]);
    });

    it("NO CAP deviating from a capped default renders a NO CAP token", () => {
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, capMinutes: null, painLevels: [] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("NO CAP");
    });

    it("a cap deviating from an uncapped (NO CAP) default renders its own ≤NN′ token", () => {
      const uncapped: TodayFilterDefaults = {
        difficulties: ALL_THREE,
        capMinutes: null,
      };
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, capMinutes: 45, painLevels: [] },
        uncapped,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("≤45′");
    });

    it("cap-at-default (both capped, equal) shows no cap token", () => {
      const tokens = todayFilterTokens(
        { difficulties: ["easy"], capMinutes: 60, painLevels: [] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).not.toContain("cap");
    });

    it("cap-at-default (both NO CAP, equal) shows no cap token", () => {
      const uncapped: TodayFilterDefaults = {
        difficulties: ALL_THREE,
        capMinutes: null,
      };
      const tokens = todayFilterTokens(
        { difficulties: ["easy"], capMinutes: null, painLevels: [] },
        uncapped,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).not.toContain("cap");
    });

    it("onClear fires onReset('cap')", () => {
      const onReset = vi.fn();
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, capMinutes: 30, painLevels: [] },
        CAPPED_DEFAULTS,
        onReset,
      );
      tokens[0].onClear();
      expect(onReset).toHaveBeenCalledExactlyOnceWith("cap");
    });
  });

  describe("pain deviation", () => {
    it("emits no pain token when painLevels is empty", () => {
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, capMinutes: 60, painLevels: [] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens.map((t) => t.key)).not.toContain("pain");
    });

    it("a single level reads PAIN n", () => {
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, capMinutes: 60, painLevels: [3] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("PAIN 3");
    });

    it("a contiguous run collapses to a range, order-independent", () => {
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, capMinutes: 60, painLevels: [5, 4] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("PAIN 4–5");
    });

    it("a longer contiguous run collapses the same way", () => {
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, capMinutes: 60, painLevels: [1, 2, 3] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("PAIN 1–3");
    });

    it("a non-contiguous selection lists the levels", () => {
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, capMinutes: 60, painLevels: [1, 4] },
        CAPPED_DEFAULTS,
        vi.fn(),
      );
      expect(tokens[0].label).toBe("PAIN 1, 4");
    });

    it("onClear fires onReset('pain')", () => {
      const onReset = vi.fn();
      const tokens = todayFilterTokens(
        { difficulties: ALL_THREE, capMinutes: 60, painLevels: [2] },
        CAPPED_DEFAULTS,
        onReset,
      );
      tokens[0].onClear();
      expect(onReset).toHaveBeenCalledExactlyOnceWith("pain");
    });
  });

  it("each token's clear resets exactly its own group when all three deviate", () => {
    const onReset = vi.fn();
    const tokens = todayFilterTokens(
      { difficulties: ["hard"], capMinutes: 30, painLevels: [1, 2] },
      CAPPED_DEFAULTS,
      onReset,
    );
    expect(tokens).toHaveLength(3);
    tokens.find((t) => t.key === "difficulties")!.onClear();
    tokens.find((t) => t.key === "cap")!.onClear();
    tokens.find((t) => t.key === "pain")!.onClear();
    expect(onReset).toHaveBeenNthCalledWith(1, "difficulties");
    expect(onReset).toHaveBeenNthCalledWith(2, "cap");
    expect(onReset).toHaveBeenNthCalledWith(3, "pain");
  });
});
