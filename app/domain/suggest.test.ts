import { describe, it, expect } from "vitest";
import { suggest, suggestFreestyle } from "./suggest.js";

const w = (id: string, over: object = {}) => ({
  id,
  type: "AT" as const,
  difficulty: "medium" as const,
  pain: 3,
  estMinutes: 45,
  lastDoneDaysAgo: 10 as number | null,
  ...over,
});
const prefs = {
  difficulties: ["easy", "medium", "hard"] as const,
  timeCapMinutes: 60,
};

describe("suggest", () => {
  it("picks the least recently done; never-done outranks all", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: { ...prefs, difficulties: [...prefs.difficulties] },
      library: [
        w("a", { lastDoneDaysAgo: 3 }),
        w("b", { lastDoneDaysAgo: 40 }),
        w("c", { lastDoneDaysAgo: null }),
      ],
    });
    expect(r.recommendationId).toBe("c");
    expect(r.poolIds).toStrictEqual(["c", "b", "a"]);
    expect(r.fellBack).toBe(false);
  });
  it("filters by difficulty prefs and time cap", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: { difficulties: ["easy"], timeCapMinutes: 40 },
      library: [
        w("slow", { estMinutes: 90, difficulty: "easy" }),
        w("hard", { difficulty: "hard" }),
        w("fit", { difficulty: "easy", estMinutes: 30 }),
      ],
    });
    expect(r.poolIds).toStrictEqual(["fit"]);
  });
  it("treats TEST as TR", () => {
    const r = suggest({
      todayCode: "TEST",
      prefs: { ...prefs, difficulties: [...prefs.difficulties] },
      library: [w("tr1", { type: "TR" }), w("at1")],
    });
    expect(r.recommendationId).toBe("tr1");
  });
  it("falls back to the unfiltered type list when filters match nothing", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: { difficulties: ["easy"], timeCapMinutes: 20 },
      library: [
        w("only", { difficulty: "hard", estMinutes: 55, lastDoneDaysAgo: 33 }),
      ],
    });
    expect(r.fellBack).toBe(true);
    expect(r.recommendationId).toBe("only");
    expect(r.reason).toMatch(/closest match/i);
  });
  it("honors todayPick when it is in the pool, with YOUR PICK reason", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: { ...prefs, difficulties: [...prefs.difficulties] },
      library: [w("a", { lastDoneDaysAgo: null }), w("b")],
      todayPickId: "b",
    });
    expect(r.recommendationId).toBe("b");
    expect(r.reason).toMatch(/your pick/i);
  });
  it("includes recency and cap in the standard reason", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: { ...prefs, difficulties: [...prefs.difficulties] },
      library: [w("a", { lastDoneDaysAgo: 33 })],
    });
    expect(r.reason).toMatch(/33 days ago/);
    expect(r.reason).toMatch(/60/);
  });
  it("returns null recommendation for an empty type", () => {
    const r = suggest({
      todayCode: "AN",
      prefs: { ...prefs, difficulties: [...prefs.difficulties] },
      library: [w("at")],
    });
    expect(r.recommendationId).toBeNull();
  });

  it("omits any cap claim from the standard reason when durationsUnknown is set", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        ...prefs,
        difficulties: [...prefs.difficulties],
        durationsUnknown: true,
      },
      library: [w("a", { lastDoneDaysAgo: 33 })],
    });
    expect(r.reason).toMatch(/33 days ago/);
    expect(r.reason).not.toMatch(/cap/i);
    expect(r.reason).not.toMatch(/60/);
  });

  it("omits 'time' from the fellback reason when durationsUnknown is set (only difficulty was actually checked)", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        difficulties: ["easy"],
        timeCapMinutes: 20,
        durationsUnknown: true,
      },
      library: [
        w("only", { difficulty: "hard", estMinutes: 0, lastDoneDaysAgo: 33 }),
      ],
    });
    expect(r.fellBack).toBe(true);
    expect(r.reason).toMatch(/closest match/i);
    expect(r.reason).toMatch(/difficulty filters/i);
    expect(r.reason).not.toMatch(/time/i);
  });

  it("keeps a pain-3 entry and excludes a pain-4 entry when painLevels is [1,2,3]", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        ...prefs,
        difficulties: [...prefs.difficulties],
        painLevels: [1, 2, 3],
      },
      library: [
        w("ok", { pain: 3, lastDoneDaysAgo: 5 }),
        w("hurts", { pain: 4, lastDoneDaysAgo: 50 }),
      ],
    });
    expect(r.poolIds).toStrictEqual(["ok"]);
    expect(r.recommendationId).toBe("ok");
  });

  it("falls back when painLevels excludes everything in a non-empty type pool; pool is the unfiltered type list", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        ...prefs,
        difficulties: [...prefs.difficulties],
        painLevels: [1, 2, 3],
      },
      library: [w("hurts", { pain: 5, lastDoneDaysAgo: 12 })],
    });
    expect(r.fellBack).toBe(true);
    expect(r.poolIds).toStrictEqual(["hurts"]);
    expect(r.recommendationId).toBe("hurts");
    expect(r.reason).toMatch(/closest match/i);
    expect(r.reason).toMatch(/pain/i);
  });

  describe("painLevels union semantics", () => {
    it("a single-level union ([3]) keeps only that exact level, excluding both a lower and a higher entry", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          ...prefs,
          difficulties: [...prefs.difficulties],
          painLevels: [3],
        },
        library: [
          w("low", { pain: 2, lastDoneDaysAgo: 5 }),
          w("mid", { pain: 3, lastDoneDaysAgo: 40 }),
          w("high", { pain: 4, lastDoneDaysAgo: 60 }),
        ],
      });
      expect(r.poolIds).toStrictEqual(["mid"]);
      expect(r.recommendationId).toBe("mid");
    });

    it("a non-contiguous union ([1,3,5]) keeps 1/3/5 and excludes 2/4", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          ...prefs,
          difficulties: [...prefs.difficulties],
          painLevels: [1, 3, 5],
        },
        library: [
          w("p1", { pain: 1, lastDoneDaysAgo: 10 }),
          w("p2", { pain: 2, lastDoneDaysAgo: 10 }),
          w("p3", { pain: 3, lastDoneDaysAgo: 10 }),
          w("p4", { pain: 4, lastDoneDaysAgo: 10 }),
          w("p5", { pain: 5, lastDoneDaysAgo: 10 }),
        ],
      });
      expect(new Set(r.poolIds)).toStrictEqual(new Set(["p1", "p3", "p5"]));
      expect(r.poolIds).not.toContain("p2");
      expect(r.poolIds).not.toContain("p4");
    });

    it("an empty union ([]) is off — identical to the field being unset entirely", () => {
      const withEmpty = suggest({
        todayCode: "AT",
        prefs: {
          ...prefs,
          difficulties: [...prefs.difficulties],
          painLevels: [],
        },
        library: [w("any", { pain: 5, lastDoneDaysAgo: 5 })],
      });
      const withUnset = suggest({
        todayCode: "AT",
        prefs: { ...prefs, difficulties: [...prefs.difficulties] },
        library: [w("any", { pain: 5, lastDoneDaysAgo: 5 })],
      });
      expect(withEmpty.poolIds).toStrictEqual(["any"]);
      expect(withEmpty).toStrictEqual(withUnset);
    });

    it("every level covered ([1,2,3,4,5]) filters nothing out, same as off", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          ...prefs,
          difficulties: [...prefs.difficulties],
          painLevels: [1, 2, 3, 4, 5],
        },
        library: [
          w("a", { pain: 1, lastDoneDaysAgo: 5 }),
          w("b", { pain: 5, lastDoneDaysAgo: 6 }),
        ],
      });
      expect(new Set(r.poolIds)).toStrictEqual(new Set(["a", "b"]));
      expect(r.fellBack).toBe(false);
    });
  });

  it("keeps a 200-min entry when timeCapMinutes is null (capless)", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        difficulties: [...prefs.difficulties],
        timeCapMinutes: null,
      },
      library: [w("long", { estMinutes: 200, lastDoneDaysAgo: 7 })],
    });
    expect(r.fellBack).toBe(false);
    expect(r.poolIds).toStrictEqual(["long"]);
    expect(r.recommendationId).toBe("long");
  });

  describe("standard-reason wording across cap x durationsUnknown x painLevels", () => {
    const base = {
      todayCode: "AT" as const,
      library: [w("a", { lastDoneDaysAgo: 33 })],
    };

    it("cap set, durations known, no pain filter -> cap clause present", () => {
      const r = suggest({
        ...base,
        prefs: { difficulties: [...prefs.difficulties], timeCapMinutes: 60 },
      });
      expect(r.reason).toBe(
        "Least recently done (33 days ago) within your 60 min cap.",
      );
    });

    it("cap set, durationsUnknown true -> cap clause dropped", () => {
      const r = suggest({
        ...base,
        prefs: {
          difficulties: [...prefs.difficulties],
          timeCapMinutes: 60,
          durationsUnknown: true,
        },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("cap null (capless), durations known -> cap clause dropped", () => {
      const r = suggest({
        ...base,
        prefs: { difficulties: [...prefs.difficulties], timeCapMinutes: null },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("cap null and durationsUnknown true -> cap clause still dropped", () => {
      const r = suggest({
        ...base,
        prefs: {
          difficulties: [...prefs.difficulties],
          timeCapMinutes: null,
          durationsUnknown: true,
        },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("an active painLevels union does not appear in the standard-reason sentence (only fellback names it)", () => {
      const r = suggest({
        ...base,
        prefs: {
          difficulties: [...prefs.difficulties],
          timeCapMinutes: 60,
          painLevels: [1, 2, 3],
        },
      });
      expect(r.reason).toBe(
        "Least recently done (33 days ago) within your 60 min cap.",
      );
    });

    it("an empty painLevels union ([]) also does not appear (off is off, not merely unset)", () => {
      const r = suggest({
        ...base,
        prefs: {
          difficulties: [...prefs.difficulties],
          timeCapMinutes: 60,
          painLevels: [],
        },
      });
      expect(r.reason).toBe(
        "Least recently done (33 days ago) within your 60 min cap.",
      );
    });
  });

  describe("fellback-reason wording across cap x durationsUnknown x painLevels", () => {
    const fellbackLib = [
      w("only", {
        difficulty: "hard",
        estMinutes: 55,
        pain: 5,
        lastDoneDaysAgo: 33,
      }),
    ];

    it("cap checked, no pain filter -> difficulty/time", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["easy"], timeCapMinutes: 20 },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/time filters — closest match, last done 33 days ago.",
      );
    });

    it("cap not checked (durationsUnknown), no pain filter -> difficulty only", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          difficulties: ["easy"],
          timeCapMinutes: 20,
          durationsUnknown: true,
        },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty filters — closest match, last done 33 days ago.",
      );
    });

    it("cap not checked (capless), no pain filter -> difficulty only", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["easy"], timeCapMinutes: null },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty filters — closest match, last done 33 days ago.",
      );
    });

    it("cap checked, pain filter set (non-contiguous union) -> difficulty/time/pain", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          difficulties: ["easy"],
          timeCapMinutes: 20,
          painLevels: [1, 3],
        },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/time/pain filters — closest match, last done 33 days ago.",
      );
    });

    it("cap not checked, pain filter set -> difficulty/pain", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          difficulties: ["easy"],
          timeCapMinutes: null,
          painLevels: [1, 2, 3],
        },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/pain filters — closest match, last done 33 days ago.",
      );
    });

    it("cap checked, pain filter empty ([]) -> difficulty/time only (empty union names nothing, same as unset)", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          difficulties: ["easy"],
          timeCapMinutes: 20,
          painLevels: [],
        },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/time filters — closest match, last done 33 days ago.",
      );
    });
  });
});

describe("suggestFreestyle", () => {
  it("picks the least recently done across the whole library, types mixed; never-done outranks all", () => {
    const r = suggestFreestyle(
      [
        w("a", { type: "AT", lastDoneDaysAgo: 3 }),
        w("b", { type: "O2", lastDoneDaysAgo: 40 }),
        w("c", { type: "TR", lastDoneDaysAgo: null }),
      ],
      { ...prefs, difficulties: [...prefs.difficulties] },
    );
    expect(r.recommendationId).toBe("c");
    expect(r.poolIds).toStrictEqual(["c", "b", "a"]);
    expect(r.fellBack).toBe(false);
  });

  it("filters by difficulty prefs and time cap, independent of type", () => {
    const r = suggestFreestyle(
      [
        w("slow", { estMinutes: 90, difficulty: "easy" }),
        w("hard", { difficulty: "hard" }),
        w("fit", { difficulty: "easy", estMinutes: 30 }),
      ],
      { difficulties: ["easy"], timeCapMinutes: 40 },
    );
    expect(r.poolIds).toStrictEqual(["fit"]);
  });

  it("falls back to the unfiltered library when filters match nothing", () => {
    const r = suggestFreestyle(
      [w("only", { difficulty: "hard", estMinutes: 55, lastDoneDaysAgo: 33 })],
      { difficulties: ["easy"], timeCapMinutes: 20 },
    );
    expect(r.fellBack).toBe(true);
    expect(r.recommendationId).toBe("only");
    expect(r.reason).toMatch(/closest match/i);
  });

  it("honors todayPick when present in the pool, with YOUR PICK reason", () => {
    const r = suggestFreestyle(
      [w("a", { lastDoneDaysAgo: null }), w("b")],
      { ...prefs, difficulties: [...prefs.difficulties] },
      "b",
    );
    expect(r.recommendationId).toBe("b");
    expect(r.reason).toMatch(/your pick/i);
  });

  it("ignores todayPick when absent from the pool", () => {
    const r = suggestFreestyle(
      [w("a", { lastDoneDaysAgo: null }), w("b", { lastDoneDaysAgo: 5 })],
      { ...prefs, difficulties: [...prefs.difficulties] },
      "not-in-pool",
    );
    expect(r.recommendationId).toBe("a");
    expect(r.reason).not.toMatch(/your pick/i);
  });

  it("includes recency and cap in the standard reason", () => {
    const r = suggestFreestyle([w("a", { lastDoneDaysAgo: 33 })], {
      ...prefs,
      difficulties: [...prefs.difficulties],
    });
    expect(r.reason).toMatch(/33 days ago/);
    expect(r.reason).toMatch(/60/);
  });

  it("returns null recommendation with a showable reason for an empty library", () => {
    const r = suggestFreestyle([], {
      ...prefs,
      difficulties: [...prefs.difficulties],
    });
    expect(r.recommendationId).toBeNull();
    expect(r.poolIds).toStrictEqual([]);
    expect(r.fellBack).toBe(false);
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it("omits any cap claim from the standard reason when durationsUnknown is set", () => {
    const r = suggestFreestyle([w("a", { lastDoneDaysAgo: 33 })], {
      ...prefs,
      difficulties: [...prefs.difficulties],
      durationsUnknown: true,
    });
    expect(r.reason).toMatch(/33 days ago/);
    expect(r.reason).not.toMatch(/cap/i);
    expect(r.reason).not.toMatch(/60/);
  });

  it("omits 'time' from the fellback reason when durationsUnknown is set (only difficulty was actually checked)", () => {
    const r = suggestFreestyle(
      [w("only", { difficulty: "hard", estMinutes: 0, lastDoneDaysAgo: 33 })],
      { difficulties: ["easy"], timeCapMinutes: 20, durationsUnknown: true },
    );
    expect(r.fellBack).toBe(true);
    expect(r.reason).toMatch(/closest match/i);
    expect(r.reason).toMatch(/difficulty filters/i);
    expect(r.reason).not.toMatch(/time/i);
  });

  it("keeps a pain-3 entry and excludes a pain-4 entry when painLevels is [1,2,3]", () => {
    const r = suggestFreestyle(
      [
        w("ok", { pain: 3, lastDoneDaysAgo: 5 }),
        w("hurts", { pain: 4, lastDoneDaysAgo: 50 }),
      ],
      {
        ...prefs,
        difficulties: [...prefs.difficulties],
        painLevels: [1, 2, 3],
      },
    );
    expect(r.poolIds).toStrictEqual(["ok"]);
    expect(r.recommendationId).toBe("ok");
  });

  it("falls back when painLevels excludes everything; pool is the unfiltered library", () => {
    const r = suggestFreestyle([w("hurts", { pain: 5, lastDoneDaysAgo: 12 })], {
      ...prefs,
      difficulties: [...prefs.difficulties],
      painLevels: [1, 2, 3],
    });
    expect(r.fellBack).toBe(true);
    expect(r.poolIds).toStrictEqual(["hurts"]);
    expect(r.recommendationId).toBe("hurts");
    expect(r.reason).toMatch(/closest match/i);
    expect(r.reason).toMatch(/pain/i);
  });

  it("a non-contiguous union ([1,3,5]) keeps 1/3/5 and excludes 2/4, type-independent", () => {
    const r = suggestFreestyle(
      [
        w("p1", { type: "AT", pain: 1, lastDoneDaysAgo: 10 }),
        w("p2", { type: "O2", pain: 2, lastDoneDaysAgo: 10 }),
        w("p3", { type: "AN", pain: 3, lastDoneDaysAgo: 10 }),
        w("p4", { type: "TR", pain: 4, lastDoneDaysAgo: 10 }),
        w("p5", { type: "AT", pain: 5, lastDoneDaysAgo: 10 }),
      ],
      {
        ...prefs,
        difficulties: [...prefs.difficulties],
        painLevels: [1, 3, 5],
      },
    );
    expect(new Set(r.poolIds)).toStrictEqual(new Set(["p1", "p3", "p5"]));
  });

  it("keeps a 200-min entry when timeCapMinutes is null (capless)", () => {
    const r = suggestFreestyle(
      [w("long", { estMinutes: 200, lastDoneDaysAgo: 7 })],
      {
        difficulties: [...prefs.difficulties],
        timeCapMinutes: null,
      },
    );
    expect(r.fellBack).toBe(false);
    expect(r.poolIds).toStrictEqual(["long"]);
    expect(r.recommendationId).toBe("long");
  });

  describe("standard-reason wording across cap x durationsUnknown x painLevels (freestyle parity)", () => {
    const lib = [w("a", { lastDoneDaysAgo: 33 })];

    it("cap set, durations known, no pain filter -> cap clause present", () => {
      const r = suggestFreestyle(lib, {
        difficulties: [...prefs.difficulties],
        timeCapMinutes: 60,
      });
      expect(r.reason).toBe(
        "Least recently done (33 days ago) within your 60 min cap.",
      );
    });

    it("cap set, durationsUnknown true -> cap clause dropped", () => {
      const r = suggestFreestyle(lib, {
        difficulties: [...prefs.difficulties],
        timeCapMinutes: 60,
        durationsUnknown: true,
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("cap null (capless), durations known -> cap clause dropped", () => {
      const r = suggestFreestyle(lib, {
        difficulties: [...prefs.difficulties],
        timeCapMinutes: null,
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("cap null and durationsUnknown true -> cap clause still dropped", () => {
      const r = suggestFreestyle(lib, {
        difficulties: [...prefs.difficulties],
        timeCapMinutes: null,
        durationsUnknown: true,
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });
  });

  describe("fellback-reason wording across cap x durationsUnknown x painLevels (freestyle parity)", () => {
    const fellbackLib = [
      w("only", {
        difficulty: "hard",
        estMinutes: 55,
        pain: 5,
        lastDoneDaysAgo: 33,
      }),
    ];

    it("cap checked, pain filter set (non-contiguous union) -> difficulty/time/pain", () => {
      const r = suggestFreestyle(fellbackLib, {
        difficulties: ["easy"],
        timeCapMinutes: 20,
        painLevels: [1, 3],
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/time/pain filters — closest match, last done 33 days ago.",
      );
    });

    it("cap not checked (capless), pain filter set -> difficulty/pain", () => {
      const r = suggestFreestyle(fellbackLib, {
        difficulties: ["easy"],
        timeCapMinutes: null,
        painLevels: [1, 2, 3],
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/pain filters — closest match, last done 33 days ago.",
      );
    });

    it("cap checked, pain filter empty ([]) -> difficulty/time only", () => {
      const r = suggestFreestyle(fellbackLib, {
        difficulties: ["easy"],
        timeCapMinutes: 20,
        painLevels: [],
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/time filters — closest match, last done 33 days ago.",
      );
    });
  });
});
