import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, type Filters } from "./filters";
import { filterTokens } from "./filterTokens";

describe("filterTokens", () => {
  it("returns no tokens for EMPTY_FILTERS", () => {
    expect(filterTokens(EMPTY_FILTERS)).toStrictEqual([]);
  });

  it("emits one token per active group, in DIFFICULTY/TIME/PAIN/LAST DONE/SOURCE order regardless of set order — TYPE contributes none", () => {
    const f: Filters = {
      types: ["O2"],
      difficulties: ["easy"],
      durationRange: { min: 45, max: 60 },
      painLevels: [4, 5],
      lastDone: "under21",
      source: "custom",
      query: "",
    };
    expect(filterTokens(f).map((t) => t.kind)).toStrictEqual([
      "difficulty",
      "duration",
      "pain",
      "lastDone",
      "source",
    ]);
  });

  // No type token at all (James, 2026-08-12): "the type shouldn't be added
  // as a tag since it's already visible" — the chip row above the row shows
  // the selection in its own colour with the descriptor beneath it, so a
  // token would restate what is already on screen. This also retires the
  // whole `fill` seam: the type token was its only producer.
  describe("type is NOT tokenized", () => {
    it("a selected type contributes no token, however many are selected", () => {
      for (const types of [["AN"], ["O2", "AT"], ["AN", "TR", "O2"]] as const) {
        expect(
          filterTokens({ ...EMPTY_FILTERS, types: [...types] }),
        ).toStrictEqual([]);
      }
    });

    it("types never suppress another group's token, and no token carries a fill", () => {
      const busy: Filters = {
        types: ["O2", "AT"],
        difficulties: ["easy"],
        durationRange: { min: 0, max: 30 },
        painLevels: [4],
        lastDone: "under21",
        source: "custom",
        query: "",
      };
      const tokens = filterTokens(busy);
      expect(tokens.map((t) => t.kind)).toStrictEqual([
        "difficulty",
        "duration",
        "pain",
        "lastDone",
        "source",
      ]);
      for (const token of tokens) {
        expect(token).not.toHaveProperty("fill");
      }
    });
  });

  describe("difficulty token", () => {
    it("a single difficulty reuses the shared collapseDifficulties label", () => {
      const f: Filters = { ...EMPTY_FILTERS, difficulties: ["medium"] };
      expect(filterTokens(f)[0].label).toBe("MEDIUM");
    });

    it("a contiguous run collapses to a range", () => {
      const f: Filters = { ...EMPTY_FILTERS, difficulties: ["easy", "medium"] };
      expect(filterTokens(f)[0].label).toBe("EASY–MEDIUM");
    });

    it("a non-contiguous selection lists every member", () => {
      const f: Filters = { ...EMPTY_FILTERS, difficulties: ["easy", "hard"] };
      expect(filterTokens(f)[0].label).toBe("EASY, HARD");
    });

    it("empty means no filter, so no token is emitted at all", () => {
      const f: Filters = { ...EMPTY_FILTERS, difficulties: [] };
      expect(filterTokens(f)).toStrictEqual([]);
    });

    it("clear empties only difficulties, leaving the rest of a busy Filters untouched", () => {
      const busy: Filters = {
        types: ["O2"],
        difficulties: ["easy", "hard"],
        durationRange: { min: 0, max: 30 },
        painLevels: [4],
        lastDone: "under21",
        source: "custom",
        query: "",
      };
      const tokens = filterTokens(busy);
      const difficultyToken = tokens.find((t) => t.kind === "difficulty")!;
      expect(difficultyToken.clear(busy)).toStrictEqual({
        ...busy,
        difficulties: [],
      });
    });
  });

  describe("duration label (spec I-13)", () => {
    it("a bounded range reads min–max′", () => {
      const f: Filters = {
        ...EMPTY_FILTERS,
        durationRange: { min: 45, max: 60 },
      };
      expect(filterTokens(f)[0].label).toBe("45–60′");
    });

    it("an open lower end reads ≤max′", () => {
      const f: Filters = {
        ...EMPTY_FILTERS,
        durationRange: { min: 0, max: 45 },
      };
      expect(filterTokens(f)[0].label).toBe("≤45′");
    });

    it("an open upper end (120) reads min′+", () => {
      const f: Filters = {
        ...EMPTY_FILTERS,
        durationRange: { min: 45, max: 120 },
      };
      expect(filterTokens(f)[0].label).toBe("45′+");
    });

    it("a point reads the single figure", () => {
      const f: Filters = {
        ...EMPTY_FILTERS,
        durationRange: { min: 35, max: 35 },
      };
      expect(filterTokens(f)[0].label).toBe("35′");
    });

    it("the unbounded range [0, 120] is Library's no-filter state and renders NO token", () => {
      const f: Filters = {
        ...EMPTY_FILTERS,
        durationRange: { min: 0, max: 120 },
      };
      expect(filterTokens(f)).toStrictEqual([]);
    });
  });

  describe("pain collapse", () => {
    it("a single level reads PAIN n", () => {
      const f: Filters = { ...EMPTY_FILTERS, painLevels: [3] };
      expect(filterTokens(f)[0].label).toBe("PAIN 3");
    });

    it("a contiguous run collapses to a range", () => {
      const f: Filters = { ...EMPTY_FILTERS, painLevels: [4, 5] };
      expect(filterTokens(f)[0].label).toBe("PAIN 4–5");
    });

    it("a longer contiguous run collapses the same way", () => {
      const f: Filters = { ...EMPTY_FILTERS, painLevels: [1, 2, 3] };
      expect(filterTokens(f)[0].label).toBe("PAIN 1–3");
    });

    it("a non-contiguous selection lists the levels", () => {
      const f: Filters = { ...EMPTY_FILTERS, painLevels: [1, 4] };
      expect(filterTokens(f)[0].label).toBe("PAIN 1, 4");
    });

    it("collapse is independent of insertion order", () => {
      const f: Filters = { ...EMPTY_FILTERS, painLevels: [5, 4] };
      expect(filterTokens(f)[0].label).toBe("PAIN 4–5");
    });
  });

  describe("LAST DONE / SOURCE labels", () => {
    it("under21 reads <21D", () => {
      const f: Filters = { ...EMPTY_FILTERS, lastDone: "under21" };
      expect(filterTokens(f)[0].label).toBe("<21D");
    });

    it("over21 reads 21D+", () => {
      const f: Filters = { ...EMPTY_FILTERS, lastDone: "over21" };
      expect(filterTokens(f)[0].label).toBe("21D+");
    });

    it("global reads ERGOMATIC LIBRARY (Phase SF PR2 rename: GLOBAL → ERGOMATIC LIBRARY, CUSTOM → MY WORKOUTS)", () => {
      const f: Filters = { ...EMPTY_FILTERS, source: "global" };
      expect(filterTokens(f)[0].label).toBe("ERGOMATIC LIBRARY");
    });

    it("custom reads MY WORKOUTS", () => {
      const f: Filters = { ...EMPTY_FILTERS, source: "custom" };
      expect(filterTokens(f)[0].label).toBe("MY WORKOUTS");
    });
  });

  describe("clear", () => {
    it("each token's clear resets exactly its own group, leaving the rest of a busy Filters untouched", () => {
      const busy: Filters = {
        types: ["AN"],
        difficulties: ["hard"],
        durationRange: { min: 0, max: 30 },
        painLevels: [4, 5],
        lastDone: "under21",
        source: "custom",
        query: "",
      };
      const tokens = filterTokens(busy);
      // Five, not six: the active TYPE contributes no token (2026-08-12).
      expect(tokens).toHaveLength(5);

      const difficultyToken = tokens.find((t) => t.kind === "difficulty")!;
      expect(difficultyToken.clear(busy)).toStrictEqual({
        ...busy,
        difficulties: [],
      });

      const durationToken = tokens.find((t) => t.kind === "duration")!;
      expect(durationToken.clear(busy)).toStrictEqual({
        ...busy,
        durationRange: { min: 0, max: 120 },
      });

      const painToken = tokens.find((t) => t.kind === "pain")!;
      expect(painToken.clear(busy)).toStrictEqual({
        ...busy,
        painLevels: [],
      });

      const lastDoneToken = tokens.find((t) => t.kind === "lastDone")!;
      expect(lastDoneToken.clear(busy)).toStrictEqual({
        ...busy,
        lastDone: null,
      });

      const sourceToken = tokens.find((t) => t.kind === "source")!;
      expect(sourceToken.clear(busy)).toStrictEqual({
        ...busy,
        source: null,
      });
    });

    it("clear operates on whatever Filters it's given, not a value captured when the token was built", () => {
      // Was built on the TYPE token before it was retired; DIFFICULTY
      // carries the same subject (a token handed a later, changed Filters
      // still clears the right field).
      const original: Filters = { ...EMPTY_FILTERS, difficulties: ["hard"] };
      const [token] = filterTokens(original);
      const later: Filters = { ...original, painLevels: [2] };
      expect(token.clear(later)).toStrictEqual({ ...later, difficulties: [] });
    });
  });
});
