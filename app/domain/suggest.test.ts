import { describe, it, expect } from "vitest";
import { suggest, suggestFreestyle } from "./suggest.js";

const w = (id: string, over: object = {}) => ({
  id,
  type: "AT" as const,
  difficulty: "medium" as const,
  pain: 3,
  estMinutes: 45,
  lastDoneDaysAgo: 10 as number | null,
  isGlobal: true,
  ...over,
});
const prefs = {
  difficulties: ["easy", "medium", "hard"] as const,
  // <30/30-45/45-60 — the bucket union equivalent of the old "cap 60"
  // fixture value: excludes only the 60+ bucket, same as `bucketsForCap(60)`
  // (todayOverrides.ts) would derive.
  durations: ["<30", "30-45", "45-60"] as const,
};

describe("suggest", () => {
  it("picks the least recently done; never-done outranks all", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        ...prefs,
        difficulties: [...prefs.difficulties],
        durations: [...prefs.durations],
      },
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
  it("filters by difficulty prefs and the duration union", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: { difficulties: ["easy"], durations: ["<30", "30-45"] },
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
      prefs: {
        ...prefs,
        difficulties: [...prefs.difficulties],
        durations: [...prefs.durations],
      },
      library: [w("tr1", { type: "TR" }), w("at1")],
    });
    expect(r.recommendationId).toBe("tr1");
  });
  it("falls back to the unfiltered type list when filters match nothing", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: { difficulties: ["easy"], durations: ["<30"] },
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
      prefs: {
        ...prefs,
        difficulties: [...prefs.difficulties],
        durations: [...prefs.durations],
      },
      library: [w("a", { lastDoneDaysAgo: null }), w("b")],
      todayPickId: "b",
    });
    expect(r.recommendationId).toBe("b");
    expect(r.reason).toMatch(/your pick/i);
  });
  it("the standard reason is the plain recency sentence, with no duration clause at all", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        ...prefs,
        difficulties: [...prefs.difficulties],
        durations: [...prefs.durations],
      },
      library: [w("a", { lastDoneDaysAgo: 33 })],
    });
    expect(r.reason).toBe("Least recently done (33 days ago).");
  });
  it("returns null recommendation for an empty type", () => {
    const r = suggest({
      todayCode: "AN",
      prefs: {
        ...prefs,
        difficulties: [...prefs.difficulties],
        durations: [...prefs.durations],
      },
      library: [w("at")],
    });
    expect(r.recommendationId).toBeNull();
  });

  it("omits any time claim from the standard reason when durationsUnknown is set", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        ...prefs,
        difficulties: [...prefs.difficulties],
        durations: [...prefs.durations],
        durationsUnknown: true,
      },
      library: [w("a", { lastDoneDaysAgo: 33 })],
    });
    expect(r.reason).toBe("Least recently done (33 days ago).");
  });

  it("omits 'time' from the fellback reason when durationsUnknown is set (only difficulty was actually checked)", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        difficulties: ["easy"],
        durations: ["<30"],
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
        durations: [...prefs.durations],
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
        durations: [...prefs.durations],
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
          durations: [...prefs.durations],
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
          durations: [...prefs.durations],
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
          durations: [...prefs.durations],
          painLevels: [],
        },
        library: [w("any", { pain: 5, lastDoneDaysAgo: 5 })],
      });
      const withUnset = suggest({
        todayCode: "AT",
        prefs: {
          ...prefs,
          difficulties: [...prefs.difficulties],
          durations: [...prefs.durations],
        },
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
          durations: [...prefs.durations],
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

  it("keeps a 200-min entry when durations is unset (off)", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        difficulties: [...prefs.difficulties],
      },
      library: [w("long", { estMinutes: 200, lastDoneDaysAgo: 7 })],
    });
    expect(r.fellBack).toBe(false);
    expect(r.poolIds).toStrictEqual(["long"]);
    expect(r.recommendationId).toBe("long");
  });

  it("keeps a 200-min entry when durations is an empty array (off, same as unset)", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        difficulties: [...prefs.difficulties],
        durations: [],
      },
      library: [w("long", { estMinutes: 200, lastDoneDaysAgo: 7 })],
    });
    expect(r.fellBack).toBe(false);
    expect(r.poolIds).toStrictEqual(["long"]);
    expect(r.recommendationId).toBe("long");
  });

  describe("duration bucket predicate (bucketFor(estMinutes) ∈ durations)", () => {
    it("a bucket exactly at a boundary belongs to the UPPER bucket (bucketFor's own <45/<60 rule)", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], durations: ["45-60"] },
        library: [
          w("at45", { estMinutes: 45, lastDoneDaysAgo: 5 }),
          w("at44", { estMinutes: 44, lastDoneDaysAgo: 5 }),
        ],
      });
      // 45 minutes buckets as "45-60" (bucketFor: minutes<45 is false at
      // exactly 45), 44 minutes buckets as "30-45" — only the 45-min entry
      // is in the ["45-60"] union.
      expect(r.poolIds).toStrictEqual(["at45"]);
    });

    it("a non-contiguous duration union (<30 and 60+) keeps both ends, excludes the middle", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], durations: ["<30", "60+"] },
        library: [
          w("short", { estMinutes: 20, lastDoneDaysAgo: 5 }),
          w("mid", { estMinutes: 50, lastDoneDaysAgo: 5 }),
          w("long", { estMinutes: 90, lastDoneDaysAgo: 5 }),
        ],
      });
      expect(new Set(r.poolIds)).toStrictEqual(new Set(["short", "long"]));
      expect(r.poolIds).not.toContain("mid");
    });

    it("an entry whose estMinutes is the 0 placeholder only survives an active union via durationsUnknown, not via the <30 bucket alone", () => {
      // bucketFor(0) is "<30" — an unknown-duration entry (baselines unset,
      // Today.tsx's own toLibraryEntry) would wrongly survive a durations
      // filter that happens to include "<30" if durationsUnknown weren't
      // ALSO set. This proves the filter is skipped via durationsUnknown,
      // not "surviving because <30 happens to include 0" — the union here
      // deliberately excludes "<30" to tell the two apart.
      const r = suggest({
        todayCode: "AT",
        prefs: {
          difficulties: ["medium"],
          durations: ["45-60"],
          durationsUnknown: true,
        },
        library: [w("unknown", { estMinutes: 0, lastDoneDaysAgo: 5 })],
      });
      expect(r.fellBack).toBe(false);
      expect(r.poolIds).toStrictEqual(["unknown"]);
    });
  });

  describe("standard-reason wording across durations x durationsUnknown x painLevels", () => {
    const base = {
      todayCode: "AT" as const,
      library: [w("a", { lastDoneDaysAgo: 33 })],
    };

    it("durations active, known, no pain filter -> plain recency sentence (no time clause)", () => {
      const r = suggest({
        ...base,
        prefs: {
          difficulties: [...prefs.difficulties],
          durations: ["<30", "30-45", "45-60"],
        },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("durations active, durationsUnknown true -> same plain sentence", () => {
      const r = suggest({
        ...base,
        prefs: {
          difficulties: [...prefs.difficulties],
          durations: ["<30", "30-45", "45-60"],
          durationsUnknown: true,
        },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("durations unset (off), known -> same plain sentence", () => {
      const r = suggest({
        ...base,
        prefs: { difficulties: [...prefs.difficulties] },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("durations empty ([]) and durationsUnknown true -> same plain sentence", () => {
      const r = suggest({
        ...base,
        prefs: {
          difficulties: [...prefs.difficulties],
          durations: [],
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
          durations: ["<30", "30-45", "45-60"],
          painLevels: [1, 2, 3],
        },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("an empty painLevels union ([]) also does not appear (off is off, not merely unset)", () => {
      const r = suggest({
        ...base,
        prefs: {
          difficulties: [...prefs.difficulties],
          durations: ["<30", "30-45", "45-60"],
          painLevels: [],
        },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });
  });

  describe("fellback-reason wording across durations x durationsUnknown x painLevels", () => {
    const fellbackLib = [
      w("only", {
        difficulty: "hard",
        estMinutes: 55,
        pain: 5,
        lastDoneDaysAgo: 33,
      }),
    ];

    it("time checked, no pain filter -> difficulty/time", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["easy"], durations: ["<30"] },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/time filters — closest match, last done 33 days ago.",
      );
    });

    it("time not checked (durationsUnknown), no pain filter -> difficulty only", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          difficulties: ["easy"],
          durations: ["<30"],
          durationsUnknown: true,
        },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty filters — closest match, last done 33 days ago.",
      );
    });

    it("time not checked (durations unset/off), no pain filter -> difficulty only", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["easy"] },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty filters — closest match, last done 33 days ago.",
      );
    });

    it("time checked, pain filter set (non-contiguous union) -> difficulty/time/pain", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          difficulties: ["easy"],
          durations: ["<30"],
          painLevels: [1, 3],
        },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/time/pain filters — closest match, last done 33 days ago.",
      );
    });

    it("time not checked, pain filter set -> difficulty/pain", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          difficulties: ["easy"],
          painLevels: [1, 2, 3],
        },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/pain filters — closest match, last done 33 days ago.",
      );
    });

    it("time checked, pain filter empty ([]) -> difficulty/time only (empty union names nothing, same as unset)", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          difficulties: ["easy"],
          durations: ["<30"],
          painLevels: [],
        },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/time filters — closest match, last done 33 days ago.",
      );
    });
  });

  // Round 2 (2026-08-04): LAST DONE — mirrors src/library/filters.test.ts's
  // own "splits recency at the boundary via lastDone, counting never-done as
  // over21" case, at the suggest()/predicate level.
  describe("LAST DONE filter", () => {
    it("under21 keeps only recent entries, excluding a stale one and a never-done one", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], lastDone: "under21" },
        library: [
          w("fresh", { lastDoneDaysAgo: 20 }),
          w("stale", { lastDoneDaysAgo: 21 }),
          w("never", { lastDoneDaysAgo: null }),
        ],
      });
      expect(r.poolIds).toStrictEqual(["fresh"]);
    });

    it("over21 keeps stale AND never-done entries — never-done is pinned as 'not recent'", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], lastDone: "over21" },
        library: [
          w("fresh", { lastDoneDaysAgo: 20 }),
          w("stale", { lastDoneDaysAgo: 21 }),
          w("never", { lastDoneDaysAgo: null }),
        ],
      });
      expect(new Set(r.poolIds)).toStrictEqual(new Set(["stale", "never"]));
    });

    it("null/undefined is off — every entry passes regardless of recency", () => {
      const lib = [
        w("fresh", { lastDoneDaysAgo: 1 }),
        w("never", { lastDoneDaysAgo: null }),
      ];
      const withNull = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], lastDone: null },
        library: lib,
      });
      const withUnset = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"] },
        library: lib,
      });
      expect(new Set(withNull.poolIds)).toStrictEqual(
        new Set(["fresh", "never"]),
      );
      expect(withNull).toStrictEqual(withUnset);
    });

    it("falls back to the unfiltered type pool when lastDone excludes everything, and names 'recency' in the reason", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], lastDone: "under21" },
        library: [w("only", { lastDoneDaysAgo: 40 })],
      });
      expect(r.fellBack).toBe(true);
      expect(r.poolIds).toStrictEqual(["only"]);
      expect(r.reason).toBe(
        "Nothing fit your difficulty/recency filters — closest match, last done 40 days ago.",
      );
    });
  });

  // Round 2 (2026-08-04): SOURCE — mirrors filters.test.ts's own "keeps only
  // non-global/global workouts" pair, at the suggest()/predicate level.
  describe("SOURCE filter", () => {
    it("custom keeps only non-global entries", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], source: "custom" },
        library: [
          w("mine", { isGlobal: false, lastDoneDaysAgo: 5 }),
          w("seeded", { isGlobal: true, lastDoneDaysAgo: 50 }),
        ],
      });
      expect(r.poolIds).toStrictEqual(["mine"]);
    });

    it("global keeps only global entries", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], source: "global" },
        library: [
          w("mine", { isGlobal: false, lastDoneDaysAgo: 5 }),
          w("seeded", { isGlobal: true, lastDoneDaysAgo: 50 }),
        ],
      });
      expect(r.poolIds).toStrictEqual(["seeded"]);
    });

    it("null/undefined is off — every entry passes regardless of source", () => {
      const lib = [
        w("mine", { isGlobal: false, lastDoneDaysAgo: 5 }),
        w("seeded", { isGlobal: true, lastDoneDaysAgo: 50 }),
      ];
      const withNull = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], source: null },
        library: lib,
      });
      const withUnset = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"] },
        library: lib,
      });
      expect(new Set(withNull.poolIds)).toStrictEqual(
        new Set(["mine", "seeded"]),
      );
      expect(withNull).toStrictEqual(withUnset);
    });

    it("falls back to the unfiltered type pool when source excludes everything, and names 'source' in the reason", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], source: "custom" },
        library: [w("only", { isGlobal: true, lastDoneDaysAgo: 40 })],
      });
      expect(r.fellBack).toBe(true);
      expect(r.poolIds).toStrictEqual(["only"]);
      expect(r.reason).toBe(
        "Nothing fit your difficulty/source filters — closest match, last done 40 days ago.",
      );
    });

    it("both recency and source active and both real: fellback names difficulty/recency/source in that order", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          difficulties: ["easy"],
          lastDone: "under21",
          source: "custom",
        },
        library: [
          w("only", {
            difficulty: "hard",
            isGlobal: true,
            lastDoneDaysAgo: 40,
          }),
        ],
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/recency/source filters — closest match, last done 40 days ago.",
      );
    });

    it("AND-combines with an existing dimension (source narrows within the difficulty match, not instead of it)", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], source: "custom" },
        library: [
          w("mine-medium", {
            isGlobal: false,
            difficulty: "medium",
            lastDoneDaysAgo: 5,
          }),
          w("mine-hard", {
            isGlobal: false,
            difficulty: "hard",
            lastDoneDaysAgo: 5,
          }),
          w("seeded-medium", {
            isGlobal: true,
            difficulty: "medium",
            lastDoneDaysAgo: 50,
          }),
        ],
      });
      expect(r.poolIds).toStrictEqual(["mine-medium"]);
    });
  });

  // Revision (mid-round, James): the button's copy dropped the live count,
  // but the underlying "keep-or-move" mechanic it used to promise (Apply
  // narrows the pool; a shown pick that still matches STAYS, one that no
  // longer matches MOVES to the new pool's own top choice) has to keep
  // holding regardless of which dimension changed. `suggest`'s own
  // `pickOverride ?? sorted[0]` (this file, above) is generic across every
  // filter dimension — these two cases exercise it specifically through the
  // two dimensions THIS round adds (SOURCE), proving the mechanic wasn't
  // accidentally narrowed to only the pre-existing dimensions.
  describe("keep-or-move: the shown pick vs. a newly applied filter", () => {
    it("a pick that still matches the newly applied filter is KEPT, not replaced by sorted[0]", () => {
      const library = [
        w("shown", { isGlobal: false, lastDoneDaysAgo: 5 }),
        w("would-otherwise-win", { isGlobal: false, lastDoneDaysAgo: 90 }),
      ];
      // Sanity: without the pick override, the least-recently-done entry
      // would win — proves the KEPT result below isn't just "happens to be
      // sorted[0] anyway."
      const unpicked = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], source: "custom" },
        library,
      });
      expect(unpicked.recommendationId).toBe("would-otherwise-win");

      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], source: "custom" },
        library,
        todayPickId: "shown",
      });
      expect(r.recommendationId).toBe("shown");
      expect(r.reason).toMatch(/your pick/i);
    });

    it("a pick EXCLUDED by the newly applied filter MOVES to the new pool's own sorted[0]", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { difficulties: ["medium"], source: "custom" },
        library: [
          w("shown-but-now-excluded", { isGlobal: true, lastDoneDaysAgo: 1 }),
          w("new-top-choice", { isGlobal: false, lastDoneDaysAgo: 90 }),
        ],
        todayPickId: "shown-but-now-excluded",
      });
      expect(r.recommendationId).toBe("new-top-choice");
      expect(r.reason).not.toMatch(/your pick/i);
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
      {
        ...prefs,
        difficulties: [...prefs.difficulties],
        durations: [...prefs.durations],
      },
    );
    expect(r.recommendationId).toBe("c");
    expect(r.poolIds).toStrictEqual(["c", "b", "a"]);
    expect(r.fellBack).toBe(false);
  });

  it("filters by difficulty prefs and the duration union, independent of type", () => {
    const r = suggestFreestyle(
      [
        w("slow", { estMinutes: 90, difficulty: "easy" }),
        w("hard", { difficulty: "hard" }),
        w("fit", { difficulty: "easy", estMinutes: 30 }),
      ],
      { difficulties: ["easy"], durations: ["<30", "30-45"] },
    );
    expect(r.poolIds).toStrictEqual(["fit"]);
  });

  it("falls back to the unfiltered library when filters match nothing", () => {
    const r = suggestFreestyle(
      [w("only", { difficulty: "hard", estMinutes: 55, lastDoneDaysAgo: 33 })],
      { difficulties: ["easy"], durations: ["<30"] },
    );
    expect(r.fellBack).toBe(true);
    expect(r.recommendationId).toBe("only");
    expect(r.reason).toMatch(/closest match/i);
  });

  it("honors todayPick when present in the pool, with YOUR PICK reason", () => {
    const r = suggestFreestyle(
      [w("a", { lastDoneDaysAgo: null }), w("b")],
      {
        ...prefs,
        difficulties: [...prefs.difficulties],
        durations: [...prefs.durations],
      },
      "b",
    );
    expect(r.recommendationId).toBe("b");
    expect(r.reason).toMatch(/your pick/i);
  });

  it("ignores todayPick when absent from the pool", () => {
    const r = suggestFreestyle(
      [w("a", { lastDoneDaysAgo: null }), w("b", { lastDoneDaysAgo: 5 })],
      {
        ...prefs,
        difficulties: [...prefs.difficulties],
        durations: [...prefs.durations],
      },
      "not-in-pool",
    );
    expect(r.recommendationId).toBe("a");
    expect(r.reason).not.toMatch(/your pick/i);
  });

  it("the standard reason is the plain recency sentence, with no duration clause at all", () => {
    const r = suggestFreestyle([w("a", { lastDoneDaysAgo: 33 })], {
      ...prefs,
      difficulties: [...prefs.difficulties],
      durations: [...prefs.durations],
    });
    expect(r.reason).toBe("Least recently done (33 days ago).");
  });

  it("returns null recommendation with a showable reason for an empty library", () => {
    const r = suggestFreestyle([], {
      ...prefs,
      difficulties: [...prefs.difficulties],
      durations: [...prefs.durations],
    });
    expect(r.recommendationId).toBeNull();
    expect(r.poolIds).toStrictEqual([]);
    expect(r.fellBack).toBe(false);
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it("omits any time claim from the standard reason when durationsUnknown is set", () => {
    const r = suggestFreestyle([w("a", { lastDoneDaysAgo: 33 })], {
      ...prefs,
      difficulties: [...prefs.difficulties],
      durations: [...prefs.durations],
      durationsUnknown: true,
    });
    expect(r.reason).toBe("Least recently done (33 days ago).");
  });

  it("omits 'time' from the fellback reason when durationsUnknown is set (only difficulty was actually checked)", () => {
    const r = suggestFreestyle(
      [w("only", { difficulty: "hard", estMinutes: 0, lastDoneDaysAgo: 33 })],
      {
        difficulties: ["easy"],
        durations: ["<30"],
        durationsUnknown: true,
      },
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
        durations: [...prefs.durations],
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
      durations: [...prefs.durations],
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
        durations: [...prefs.durations],
        painLevels: [1, 3, 5],
      },
    );
    expect(new Set(r.poolIds)).toStrictEqual(new Set(["p1", "p3", "p5"]));
  });

  it("keeps a 200-min entry when durations is unset (off)", () => {
    const r = suggestFreestyle(
      [w("long", { estMinutes: 200, lastDoneDaysAgo: 7 })],
      {
        difficulties: [...prefs.difficulties],
      },
    );
    expect(r.fellBack).toBe(false);
    expect(r.poolIds).toStrictEqual(["long"]);
    expect(r.recommendationId).toBe("long");
  });

  it("keeps a 200-min entry when durations is an empty array (off, same as unset)", () => {
    const r = suggestFreestyle(
      [w("long", { estMinutes: 200, lastDoneDaysAgo: 7 })],
      {
        difficulties: [...prefs.difficulties],
        durations: [],
      },
    );
    expect(r.fellBack).toBe(false);
    expect(r.poolIds).toStrictEqual(["long"]);
    expect(r.recommendationId).toBe("long");
  });

  describe("standard-reason wording across durations x durationsUnknown x painLevels (freestyle parity)", () => {
    const lib = [w("a", { lastDoneDaysAgo: 33 })];

    it("durations active, known, no pain filter -> plain recency sentence", () => {
      const r = suggestFreestyle(lib, {
        difficulties: [...prefs.difficulties],
        durations: ["<30", "30-45", "45-60"],
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("durations active, durationsUnknown true -> same plain sentence", () => {
      const r = suggestFreestyle(lib, {
        difficulties: [...prefs.difficulties],
        durations: ["<30", "30-45", "45-60"],
        durationsUnknown: true,
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("durations unset (off), known -> same plain sentence", () => {
      const r = suggestFreestyle(lib, {
        difficulties: [...prefs.difficulties],
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("durations empty and durationsUnknown true -> same plain sentence", () => {
      const r = suggestFreestyle(lib, {
        difficulties: [...prefs.difficulties],
        durations: [],
        durationsUnknown: true,
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });
  });

  describe("fellback-reason wording across durations x durationsUnknown x painLevels (freestyle parity)", () => {
    const fellbackLib = [
      w("only", {
        difficulty: "hard",
        estMinutes: 55,
        pain: 5,
        lastDoneDaysAgo: 33,
      }),
    ];

    it("time checked, pain filter set (non-contiguous union) -> difficulty/time/pain", () => {
      const r = suggestFreestyle(fellbackLib, {
        difficulties: ["easy"],
        durations: ["<30"],
        painLevels: [1, 3],
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/time/pain filters — closest match, last done 33 days ago.",
      );
    });

    it("time not checked (durations unset/off), pain filter set -> difficulty/pain", () => {
      const r = suggestFreestyle(fellbackLib, {
        difficulties: ["easy"],
        painLevels: [1, 2, 3],
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/pain filters — closest match, last done 33 days ago.",
      );
    });

    it("time checked, pain filter empty ([]) -> difficulty/time only", () => {
      const r = suggestFreestyle(fellbackLib, {
        difficulties: ["easy"],
        durations: ["<30"],
        painLevels: [],
      });
      expect(r.reason).toBe(
        "Nothing fit your difficulty/time filters — closest match, last done 33 days ago.",
      );
    });
  });
});
