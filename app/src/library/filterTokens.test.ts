import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, type Filters } from "./filters";
import { filterTokens } from "./filterTokens";

describe("filterTokens", () => {
  it("returns no tokens for EMPTY_FILTERS", () => {
    expect(filterTokens(EMPTY_FILTERS)).toStrictEqual([]);
  });

  it("emits one token per active group, in TYPE/DIFFICULTY/TIME/PAIN/LAST DONE/SOURCE order regardless of set order", () => {
    const f: Filters = {
      types: ["O2"],
      difficulties: ["easy"],
      durations: ["45-60"],
      painLevels: [4, 5],
      lastDone: "under21",
      source: "custom",
    };
    expect(filterTokens(f).map((t) => t.kind)).toStrictEqual([
      "type",
      "difficulty",
      "duration",
      "pain",
      "lastDone",
      "source",
    ]);
  });

  describe("type token", () => {
    it("a single selected type's label is the bare type code, filled with its own colour", () => {
      const f: Filters = { ...EMPTY_FILTERS, types: ["AN"] };
      expect(filterTokens(f)).toStrictEqual([
        {
          kind: "type",
          label: "AN",
          fill: "var(--type-an)",
          clear: expect.any(Function),
        },
      ]);
    });

    it("a two-type selection joins in the canonical O2·AT·TR·AN order, not selection order, and carries no fill", () => {
      const selectedAtFirst: Filters = {
        ...EMPTY_FILTERS,
        types: ["AT", "O2"],
      };
      const selectedO2First: Filters = {
        ...EMPTY_FILTERS,
        types: ["O2", "AT"],
      };
      for (const f of [selectedAtFirst, selectedO2First]) {
        expect(filterTokens(f)).toStrictEqual([
          { kind: "type", label: "O2 · AT", clear: expect.any(Function) },
        ]);
      }
    });

    it("joins three types in canonical order regardless of toggle order", () => {
      const f: Filters = { ...EMPTY_FILTERS, types: ["AN", "TR", "O2"] };
      expect(filterTokens(f)[0].label).toBe("O2 · TR · AN");
    });

    it("clear empties only types, leaving the rest of a busy Filters untouched", () => {
      const busy: Filters = {
        types: ["O2", "AT"],
        difficulties: ["easy"],
        durations: ["<30"],
        painLevels: [4],
        lastDone: "under21",
        source: "custom",
      };
      const [token] = filterTokens(busy);
      expect(token.clear(busy)).toStrictEqual({ ...busy, types: [] });
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
        durations: ["<30"],
        painLevels: [4],
        lastDone: "under21",
        source: "custom",
      };
      const tokens = filterTokens(busy);
      const difficultyToken = tokens.find((t) => t.kind === "difficulty")!;
      expect(difficultyToken.clear(busy)).toStrictEqual({
        ...busy,
        difficulties: [],
      });
    });
  });

  describe("duration collapse", () => {
    it("a single bucket reuses its own label verbatim", () => {
      const f: Filters = { ...EMPTY_FILTERS, durations: ["45-60"] };
      expect(filterTokens(f)[0].label).toBe("45–60′");
    });

    it("collapses a contiguous run spanning the lower boundary to <X′", () => {
      const f: Filters = { ...EMPTY_FILTERS, durations: ["<30", "30-45"] };
      expect(filterTokens(f)[0].label).toBe("<45′");
    });

    it("collapses a contiguous run spanning the upper boundary to X′+", () => {
      const f: Filters = { ...EMPTY_FILTERS, durations: ["45-60", "60+"] };
      expect(filterTokens(f)[0].label).toBe("45′+");
    });

    it("collapses a contiguous MIDDLE run to a plain range", () => {
      const f: Filters = { ...EMPTY_FILTERS, durations: ["30-45", "45-60"] };
      expect(filterTokens(f)[0].label).toBe("30–60′");
    });

    it("collapses ALL FOUR buckets (a real, if functionally inert, active state)", () => {
      const f: Filters = {
        ...EMPTY_FILTERS,
        durations: ["<30", "30-45", "45-60", "60+"],
      };
      expect(filterTokens(f)[0].label).toBe("<30′–60′+");
    });

    it("lists a non-contiguous selection individually, not as a false range", () => {
      const f: Filters = { ...EMPTY_FILTERS, durations: ["<30", "60+"] };
      expect(filterTokens(f)[0].label).toBe("<30′, 60′+");
    });

    it("collapse is independent of insertion order", () => {
      const f: Filters = { ...EMPTY_FILTERS, durations: ["60+", "45-60"] };
      expect(filterTokens(f)[0].label).toBe("45′+");
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

    it("global reads GLOBAL", () => {
      const f: Filters = { ...EMPTY_FILTERS, source: "global" };
      expect(filterTokens(f)[0].label).toBe("GLOBAL");
    });

    it("custom reads CUSTOM", () => {
      const f: Filters = { ...EMPTY_FILTERS, source: "custom" };
      expect(filterTokens(f)[0].label).toBe("CUSTOM");
    });
  });

  describe("clear", () => {
    it("each token's clear resets exactly its own group, leaving the rest of a busy Filters untouched", () => {
      const busy: Filters = {
        types: ["AN"],
        difficulties: ["hard"],
        durations: ["<30"],
        painLevels: [4, 5],
        lastDone: "under21",
        source: "custom",
      };
      const tokens = filterTokens(busy);
      expect(tokens).toHaveLength(6);

      const typeToken = tokens.find((t) => t.kind === "type")!;
      expect(typeToken.clear(busy)).toStrictEqual({ ...busy, types: [] });

      const difficultyToken = tokens.find((t) => t.kind === "difficulty")!;
      expect(difficultyToken.clear(busy)).toStrictEqual({
        ...busy,
        difficulties: [],
      });

      const durationToken = tokens.find((t) => t.kind === "duration")!;
      expect(durationToken.clear(busy)).toStrictEqual({
        ...busy,
        durations: [],
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
      const original: Filters = { ...EMPTY_FILTERS, types: ["AN"] };
      const [token] = filterTokens(original);
      const later: Filters = { ...original, painLevels: [2] };
      expect(token.clear(later)).toStrictEqual({ ...later, types: [] });
    });
  });
});
