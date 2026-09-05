import { describe, it, expect } from "vitest";
import { suggest, suggestFreestyle } from "./suggest.js";

const w = (id: string, over: object = {}) => ({
  id,
  type: "AT" as const,
  pain: 3,
  estMinutes: 45,
  lastDoneDaysAgo: 10 as number | null,
  isGlobal: true,
  ...over,
});
const prefs = {
  // [0, 60] — the range `rangeForCap(60)` derives (Phase SF PR2): admits
  // anything up to and including 60 minutes.
  durationRange: { min: 0, max: 60 },
};

describe("suggest", () => {
  it("picks the least recently done; never-done outranks all", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        ...prefs,
        durationRange: prefs.durationRange,
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
  it("fell-back reason never names a difficulty filter (Phase DE PR 1)", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: { durationRange: { min: 10, max: 20 } },
      library: [w("long", { estMinutes: 60, lastDoneDaysAgo: null })],
    });
    expect(r.fellBack).toBe(true);
    expect(r.reason).toBe(
      "Nothing fit your time filters. Closest match, last done never done.",
    );
    expect(r.reason).not.toMatch(/difficult/i);
  });
  it("filters by the duration range and the pain union", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: { durationRange: { min: 0, max: 45 }, painLevels: [3] },
      library: [
        w("slow", { estMinutes: 90 }),
        w("hard", { pain: 5 }),
        w("fit", { estMinutes: 30 }),
      ],
    });
    expect(r.poolIds).toStrictEqual(["fit"]);
  });
  // Phase 8A: a plan checkpoint pins its own designated workout. The
  // prescribed entry mirrors the REAL seed row a checkpoint resolves to
  // (server/seed/library/onboarding.ts's 2K Test: type AN, hard, pain 5,
  // global) — not a hand-built minimum — and it is deliberately NOT a
  // library/pool member: both callers exclude onboarding titles from the
  // pool, and SHUFFLE's escape depends on it sitting outside poolIds.
  const k2Entry = w("k2-test", {
    type: "AN" as const,
    pain: 5,
    estMinutes: 8,
    lastDoneDaysAgo: null,
    isGlobal: true,
  });
  const CHECKPOINT_REASON =
    "Plan checkpoint: re-test your 2k and update your baseline.";

  describe("prescribed (plan checkpoints)", () => {
    it("pins the prescribed entry with its authored reason, bypassing every preference filter", () => {
      // Every filter dimension is set to EXCLUDE the prescribed entry
      // (wrong duration bucket, wrong pain, wrong
      // source — chosen against the REAL k2Entry above: hard/pain 5/
      // ~8 min/global) — a checkpoint is not a suggestion from a pool, so
      // none of them may hide it.
      const r = suggest({
        todayCode: "AN",
        prefs: {
          durationRange: { min: 45, max: 60 },
          painLevels: [1],
          lastDone: "under21",
          source: "custom",
        },
        library: [w("an1", { type: "AN" })],
        prescribed: { entry: k2Entry, reason: CHECKPOINT_REASON },
      });
      expect(r.recommendationId).toBe("k2-test");
      expect(r.reason).toBe(CHECKPOINT_REASON);
    });

    it("pins a prescribed entry whose TYPE mismatches todayCode — the type filter is bypassed like every other (8C's id-refs rely on this)", () => {
      // A deliberately mismatched entry: an O2-typed prescription on an AT
      // day (the pre-PR-B 6K seed shape). The pin must hold anyway — a
      // checkpoint is not a pool member, so the day-code type match never
      // applies to it.
      const o2Entry = w("o2-prescribed", {
        type: "O2" as const,
        isGlobal: true,
      });
      const r = suggest({
        todayCode: "AT",
        prefs: {},
        library: [w("at1", { type: "AT" })],
        prescribed: { entry: o2Entry, reason: CHECKPOINT_REASON },
      });
      expect(r.recommendationId).toBe("o2-prescribed");
      expect(r.reason).toBe(CHECKPOINT_REASON);
      expect(r.poolIds).toStrictEqual(["at1"]);
    });

    it("keeps the prescribed entry OUT of poolIds, so SHUFFLE escapes into the day's own type pool", () => {
      const r = suggest({
        todayCode: "AN",
        prefs: {},
        library: [w("an1", { type: "AN" }), w("an2", { type: "AN" })],
        prescribed: { entry: k2Entry, reason: CHECKPOINT_REASON },
      });
      expect(r.recommendationId).toBe("k2-test");
      expect(r.poolIds).not.toContain("k2-test");
      expect(r.poolIds).toStrictEqual(["an1", "an2"]);
    });

    it("still returns the checkpoint when the library holds NONE of the day's type (above the empty-pool return)", () => {
      const r = suggest({
        todayCode: "AN",
        prefs: {},
        library: [w("at-only", { type: "AT" })],
        prescribed: { entry: k2Entry, reason: CHECKPOINT_REASON },
      });
      expect(r.recommendationId).toBe("k2-test");
      expect(r.reason).toBe(CHECKPOINT_REASON);
      expect(r.poolIds).toStrictEqual([]);
      expect(r.fellBack).toBe(false);
    });

    it("a live todayPickId still wins over a prescription (SHUFFLE is the escape)", () => {
      const r = suggest({
        todayCode: "AN",
        prefs: {},
        library: [w("an1", { type: "AN" }), w("an2", { type: "AN" })],
        todayPickId: "an2",
        prescribed: { entry: k2Entry, reason: CHECKPOINT_REASON },
      });
      expect(r.recommendationId).toBe("an2");
      expect(r.reason).toMatch(/your pick/i);
    });

    it("a stale todayPickId that resolves to nothing yields back to the prescription", () => {
      const r = suggest({
        todayCode: "AN",
        prefs: {},
        library: [w("an1", { type: "AN" })],
        todayPickId: "gone-from-pool",
        prescribed: { entry: k2Entry, reason: CHECKPOINT_REASON },
      });
      expect(r.recommendationId).toBe("k2-test");
      expect(r.reason).toBe(CHECKPOINT_REASON);
    });

    it("fellBack keeps its ordinary pool meaning under a prescription — it describes the pool, not the pick", () => {
      // Type-matched entries exist but none survive the filters: the pool
      // falls back to the unfiltered type list (fellBack true) even while
      // the prescription is the recommendation.
      const r = suggest({
        todayCode: "AN",
        prefs: { painLevels: [1] },
        library: [w("an-hard", { type: "AN", pain: 5 })],
        prescribed: { entry: k2Entry, reason: CHECKPOINT_REASON },
      });
      expect(r.recommendationId).toBe("k2-test");
      expect(r.fellBack).toBe(true);
      expect(r.poolIds).toStrictEqual(["an-hard"]);
    });
  });

  it("falls back to the unfiltered type list when filters match nothing", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: { durationRange: { min: 0, max: 30 } },
      library: [w("only", { estMinutes: 55, lastDoneDaysAgo: 33 })],
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
        durationRange: prefs.durationRange,
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
        durationRange: prefs.durationRange,
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
        durationRange: prefs.durationRange,
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
        durationRange: prefs.durationRange,
        durationsUnknown: true,
      },
      library: [w("a", { lastDoneDaysAgo: 33 })],
    });
    expect(r.reason).toBe("Least recently done (33 days ago).");
  });

  it("omits 'time' from the fellback reason when durationsUnknown is set (only pain was actually checked)", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        durationRange: { min: 0, max: 30 },
        durationsUnknown: true,
        painLevels: [1],
      },
      library: [w("only", { estMinutes: 0, lastDoneDaysAgo: 33 })],
    });
    expect(r.fellBack).toBe(true);
    expect(r.reason).toMatch(/closest match/i);
    expect(r.reason).toMatch(/pain filters/i);
    expect(r.reason).not.toMatch(/time/i);
  });

  it("keeps a pain-3 entry and excludes a pain-4 entry when painLevels is [1,2,3]", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: {
        ...prefs,
        durationRange: prefs.durationRange,
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
        durationRange: prefs.durationRange,
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
          durationRange: prefs.durationRange,
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
          durationRange: prefs.durationRange,
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
          durationRange: prefs.durationRange,
          painLevels: [],
        },
        library: [w("any", { pain: 5, lastDoneDaysAgo: 5 })],
      });
      const withUnset = suggest({
        todayCode: "AT",
        prefs: {
          ...prefs,
          durationRange: prefs.durationRange,
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
          durationRange: prefs.durationRange,
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
      prefs: {},
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
        durationRange: undefined,
      },
      library: [w("long", { estMinutes: 200, lastDoneDaysAgo: 7 })],
    });
    expect(r.fellBack).toBe(false);
    expect(r.poolIds).toStrictEqual(["long"]);
    expect(r.recommendationId).toBe("long");
  });

  describe("duration range predicate (min ≤ estMinutes ≤ max, inclusive)", () => {
    it("both ends are inclusive: 45 and 60 are in [45, 60], 44 and 61 are not", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          durationRange: { min: 45, max: 60 },
        },
        library: [
          w("at45", { estMinutes: 45, lastDoneDaysAgo: 5 }),
          w("at44", { estMinutes: 44, lastDoneDaysAgo: 5 }),
          w("at60", { estMinutes: 60, lastDoneDaysAgo: 5 }),
          w("at61", { estMinutes: 61, lastDoneDaysAgo: 5 }),
        ],
      });
      expect(new Set(r.poolIds)).toStrictEqual(new Set(["at45", "at60"]));
    });

    it("a max at the top (120) is no upper bound: a 200-minute entry passes [60, 120]", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          durationRange: { min: 60, max: 120 },
        },
        library: [
          w("short", { estMinutes: 20, lastDoneDaysAgo: 5 }),
          w("mid", { estMinutes: 50, lastDoneDaysAgo: 5 }),
          w("long", { estMinutes: 200, lastDoneDaysAgo: 5 }),
        ],
      });
      expect(r.poolIds).toStrictEqual(["long"]);
    });

    it("an unbounded range [0, 120] is off: everything passes and the reason claims no time check", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { durationRange: { min: 0, max: 120 }, painLevels: [1] },
        library: [w("long", { estMinutes: 200, lastDoneDaysAgo: 7 })],
      });
      expect(r.fellBack).toBe(true);
      expect(r.reason).toMatch(/^Nothing fit your pain filters/);
    });

    it("an entry whose estMinutes is the 0 placeholder only survives an active TIME range via durationsUnknown, not because the range happens to start at 0", () => {
      // 0 is inside any range whose min is 0 — an unknown-duration entry
      // (baselines unset, Today.tsx's own toLibraryEntry) would wrongly
      // survive a range starting at 0 if durationsUnknown weren't ALSO
      // set. This proves the filter is skipped via durationsUnknown, not
      // "surviving because the range happens to include 0" — the range here
      // deliberately starts at 45 to tell the two apart.
      const r = suggest({
        todayCode: "AT",
        prefs: {
          durationRange: { min: 45, max: 60 },
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
          durationRange: { min: 0, max: 60 },
        },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("durations active, durationsUnknown true -> same plain sentence", () => {
      const r = suggest({
        ...base,
        prefs: {
          durationRange: { min: 0, max: 60 },
          durationsUnknown: true,
        },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("durations unset (off), known -> same plain sentence", () => {
      const r = suggest({
        ...base,
        prefs: {},
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("durations empty ([]) and durationsUnknown true -> same plain sentence", () => {
      const r = suggest({
        ...base,
        prefs: {
          durationRange: undefined,
          durationsUnknown: true,
        },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("an active painLevels union does not appear in the standard-reason sentence (only fellback names it)", () => {
      const r = suggest({
        ...base,
        prefs: {
          durationRange: { min: 0, max: 60 },
          painLevels: [1, 2, 3],
        },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("an empty painLevels union ([]) also does not appear (off is off, not merely unset)", () => {
      const r = suggest({
        ...base,
        prefs: {
          durationRange: { min: 0, max: 60 },
          painLevels: [],
        },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });
  });

  describe("fellback-reason wording across durations x durationsUnknown x painLevels", () => {
    const fellbackLib = [
      w("only", {
        estMinutes: 55,
        pain: 5,
        lastDoneDaysAgo: 33,
      }),
    ];

    it("time checked, no pain filter -> time", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { durationRange: { min: 0, max: 30 } },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your time filters. Closest match, last done 33 days ago.",
      );
    });

    it("time not checked and no other filter: nothing can be excluded, so there is no fallback to explain (Phase DE PR 1)", () => {
      for (const prefs of [
        { durationRange: { min: 0, max: 30 }, durationsUnknown: true },
        {},
      ]) {
        const r = suggest({ todayCode: "AT", prefs, library: fellbackLib });
        expect(r.fellBack).toBe(false);
        expect(r.reason).toBe("Least recently done (33 days ago).");
      }
    });

    it("time checked, pain filter set (non-contiguous union) -> time/pain", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          durationRange: { min: 0, max: 30 },
          painLevels: [1, 3],
        },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your time/pain filters. Closest match, last done 33 days ago.",
      );
    });

    it("time not checked, pain filter set -> pain", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          painLevels: [1, 2, 3],
        },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your pain filters. Closest match, last done 33 days ago.",
      );
    });

    it("time checked, pain filter empty ([]) -> time only (empty union names nothing, same as unset)", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          durationRange: { min: 0, max: 30 },
          painLevels: [],
        },
        library: fellbackLib,
      });
      expect(r.reason).toBe(
        "Nothing fit your time filters. Closest match, last done 33 days ago.",
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
        prefs: { lastDone: "under21" },
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
        prefs: { lastDone: "over21" },
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
        prefs: { lastDone: null },
        library: lib,
      });
      const withUnset = suggest({
        todayCode: "AT",
        prefs: {},
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
        prefs: { lastDone: "under21" },
        library: [w("only", { lastDoneDaysAgo: 40 })],
      });
      expect(r.fellBack).toBe(true);
      expect(r.poolIds).toStrictEqual(["only"]);
      expect(r.reason).toBe(
        "Nothing fit your recency filters. Closest match, last done 40 days ago.",
      );
    });
  });

  // Round 2 (2026-08-04): SOURCE — mirrors filters.test.ts's own "keeps only
  // non-global/global workouts" pair, at the suggest()/predicate level.
  describe("SOURCE filter", () => {
    it("custom keeps only non-global entries", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { source: "custom" },
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
        prefs: { source: "global" },
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
        prefs: { source: null },
        library: lib,
      });
      const withUnset = suggest({
        todayCode: "AT",
        prefs: {},
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
        prefs: { source: "custom" },
        library: [w("only", { isGlobal: true, lastDoneDaysAgo: 40 })],
      });
      expect(r.fellBack).toBe(true);
      expect(r.poolIds).toStrictEqual(["only"]);
      expect(r.reason).toBe(
        "Nothing fit your source filters. Closest match, last done 40 days ago.",
      );
    });

    it("both recency and source active and both real: fellback names recency/source in that order", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: {
          lastDone: "under21",
          source: "custom",
        },
        library: [
          w("only", {
            isGlobal: true,
            lastDoneDaysAgo: 40,
          }),
        ],
      });
      expect(r.reason).toBe(
        "Nothing fit your recency/source filters. Closest match, last done 40 days ago.",
      );
    });

    it("AND-combines with an existing dimension (source narrows within the type match, not instead of it)", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { source: "custom", painLevels: [3] },
        library: [
          w("mine-medium", {
            isGlobal: false,
            lastDoneDaysAgo: 5,
          }),
          w("mine-hard", {
            isGlobal: false,
            pain: 5,
            lastDoneDaysAgo: 5,
          }),
          w("seeded-medium", {
            isGlobal: true,
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
        prefs: { source: "custom" },
        library,
      });
      expect(unpicked.recommendationId).toBe("would-otherwise-win");

      const r = suggest({
        todayCode: "AT",
        prefs: { source: "custom" },
        library,
        todayPickId: "shown",
      });
      expect(r.recommendationId).toBe("shown");
      expect(r.reason).toMatch(/your pick/i);
    });

    it("a pick EXCLUDED by the newly applied filter MOVES to the new pool's own sorted[0]", () => {
      const r = suggest({
        todayCode: "AT",
        prefs: { source: "custom" },
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
        durationRange: prefs.durationRange,
      },
    );
    expect(r.recommendationId).toBe("c");
    expect(r.poolIds).toStrictEqual(["c", "b", "a"]);
    expect(r.fellBack).toBe(false);
  });

  it("filters by the duration range and the pain union, independent of type", () => {
    const r = suggestFreestyle(
      [
        w("slow", { estMinutes: 90 }),
        w("hard", { pain: 5 }),
        w("fit", { estMinutes: 30 }),
      ],
      { durationRange: { min: 0, max: 45 }, painLevels: [3] },
    );
    expect(r.poolIds).toStrictEqual(["fit"]);
  });

  it("falls back to the unfiltered library when filters match nothing", () => {
    const r = suggestFreestyle(
      [w("only", { estMinutes: 55, lastDoneDaysAgo: 33 })],
      { durationRange: { min: 0, max: 30 } },
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
        durationRange: prefs.durationRange,
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
        durationRange: prefs.durationRange,
      },
      "not-in-pool",
    );
    expect(r.recommendationId).toBe("a");
    expect(r.reason).not.toMatch(/your pick/i);
  });

  it("the standard reason is the plain recency sentence, with no duration clause at all", () => {
    const r = suggestFreestyle([w("a", { lastDoneDaysAgo: 33 })], {
      ...prefs,
      durationRange: prefs.durationRange,
    });
    expect(r.reason).toBe("Least recently done (33 days ago).");
  });

  it("returns null recommendation with a showable reason for an empty library", () => {
    const r = suggestFreestyle([], {
      ...prefs,
      durationRange: prefs.durationRange,
    });
    expect(r.recommendationId).toBeNull();
    expect(r.poolIds).toStrictEqual([]);
    expect(r.fellBack).toBe(false);
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it("omits any time claim from the standard reason when durationsUnknown is set", () => {
    const r = suggestFreestyle([w("a", { lastDoneDaysAgo: 33 })], {
      ...prefs,
      durationRange: prefs.durationRange,
      durationsUnknown: true,
    });
    expect(r.reason).toBe("Least recently done (33 days ago).");
  });

  it("omits 'time' from the fellback reason when durationsUnknown is set (only pain was actually checked)", () => {
    const r = suggestFreestyle(
      [w("only", { estMinutes: 0, lastDoneDaysAgo: 33 })],
      {
        durationRange: { min: 0, max: 30 },
        durationsUnknown: true,
        painLevels: [1],
      },
    );
    expect(r.fellBack).toBe(true);
    expect(r.reason).toMatch(/closest match/i);
    expect(r.reason).toMatch(/pain filters/i);
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
        durationRange: prefs.durationRange,
        painLevels: [1, 2, 3],
      },
    );
    expect(r.poolIds).toStrictEqual(["ok"]);
    expect(r.recommendationId).toBe("ok");
  });

  it("falls back when painLevels excludes everything; pool is the unfiltered library", () => {
    const r = suggestFreestyle([w("hurts", { pain: 5, lastDoneDaysAgo: 12 })], {
      ...prefs,
      durationRange: prefs.durationRange,
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
        durationRange: prefs.durationRange,
        painLevels: [1, 3, 5],
      },
    );
    expect(new Set(r.poolIds)).toStrictEqual(new Set(["p1", "p3", "p5"]));
  });

  it("keeps a 200-min entry when durations is unset (off)", () => {
    const r = suggestFreestyle(
      [w("long", { estMinutes: 200, lastDoneDaysAgo: 7 })],
      {},
    );
    expect(r.fellBack).toBe(false);
    expect(r.poolIds).toStrictEqual(["long"]);
    expect(r.recommendationId).toBe("long");
  });

  it("keeps a 200-min entry when durations is an empty array (off, same as unset)", () => {
    const r = suggestFreestyle(
      [w("long", { estMinutes: 200, lastDoneDaysAgo: 7 })],
      {
        durationRange: undefined,
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
        durationRange: { min: 0, max: 60 },
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("durations active, durationsUnknown true -> same plain sentence", () => {
      const r = suggestFreestyle(lib, {
        durationRange: { min: 0, max: 60 },
        durationsUnknown: true,
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("durations unset (off), known -> same plain sentence", () => {
      const r = suggestFreestyle(lib, {});
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });

    it("durations empty and durationsUnknown true -> same plain sentence", () => {
      const r = suggestFreestyle(lib, {
        durationRange: undefined,
        durationsUnknown: true,
      });
      expect(r.reason).toBe("Least recently done (33 days ago).");
    });
  });

  describe("fellback-reason wording across durations x durationsUnknown x painLevels (freestyle parity)", () => {
    const fellbackLib = [
      w("only", {
        estMinutes: 55,
        pain: 5,
        lastDoneDaysAgo: 33,
      }),
    ];

    it("time checked, pain filter set (non-contiguous union) -> time/pain", () => {
      const r = suggestFreestyle(fellbackLib, {
        durationRange: { min: 0, max: 30 },
        painLevels: [1, 3],
      });
      expect(r.reason).toBe(
        "Nothing fit your time/pain filters. Closest match, last done 33 days ago.",
      );
    });

    it("time not checked (durations unset/off), pain filter set -> pain", () => {
      const r = suggestFreestyle(fellbackLib, {
        painLevels: [1, 2, 3],
      });
      expect(r.reason).toBe(
        "Nothing fit your pain filters. Closest match, last done 33 days ago.",
      );
    });

    it("time checked, pain filter empty ([]) -> time only", () => {
      const r = suggestFreestyle(fellbackLib, {
        durationRange: { min: 0, max: 30 },
        painLevels: [],
      });
      expect(r.reason).toBe(
        "Nothing fit your time filters. Closest match, last done 33 days ago.",
      );
    });
  });
});

// Phase SF PR1 (spec §2.2): the tie class, and the two pure draw helpers.
// `rng` here is the domain's contract — a function returning a uniform
// integer in [0, 2^32) — fed from a scripted sequence so every branch is
// reachable deterministically.
import { RNG_RANGE, drawOne, nextShuffle } from "./suggest.js";

function scripted(values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error("scripted rng exhausted");
    return values[i++];
  };
}

describe("tieIds", () => {
  it("names every never-done entry when the pool's least-recently-done class is null, in pool order", () => {
    const r = suggestFreestyle(
      [
        w("a", { lastDoneDaysAgo: 3 }),
        w("b", { lastDoneDaysAgo: null }),
        w("c", { lastDoneDaysAgo: null }),
        w("d", { lastDoneDaysAgo: 40 }),
      ],
      {
        ...prefs,
        durationRange: undefined,
      },
    );
    expect(r.tieIds).toStrictEqual(["b", "c"]);
    expect(r.recommendationId).toBe("b");
  });

  it("names the single oldest entry when nothing ties, and the whole class when several share a day count", () => {
    const single = suggest({
      todayCode: "AT",
      prefs: {
        ...prefs,
        durationRange: undefined,
      },
      library: [
        w("a", { lastDoneDaysAgo: 3 }),
        w("b", { lastDoneDaysAgo: 40 }),
      ],
    });
    expect(single.tieIds).toStrictEqual(["b"]);
    const tied = suggest({
      todayCode: "AT",
      prefs: {
        ...prefs,
        durationRange: undefined,
      },
      library: [
        w("a", { lastDoneDaysAgo: 40 }),
        w("b", { lastDoneDaysAgo: 40 }),
        w("c", { lastDoneDaysAgo: 3 }),
      ],
    });
    expect(tied.tieIds).toStrictEqual(["a", "b"]);
  });

  it("is empty for an empty pool, and describes the POOL on a prescribed day (the pin is not a member)", () => {
    const empty = suggest({
      todayCode: "AT",
      prefs: {
        ...prefs,
        durationRange: undefined,
      },
      library: [w("x", { type: "O2" })],
    });
    expect(empty.tieIds).toStrictEqual([]);
    const pinned = suggest({
      todayCode: "AT",
      prefs: {
        ...prefs,
        durationRange: undefined,
      },
      library: [
        w("a", { lastDoneDaysAgo: null }),
        w("b", { lastDoneDaysAgo: 5 }),
      ],
      prescribed: {
        entry: w("test-2k", { lastDoneDaysAgo: null }),
        reason: "2k day",
      },
    });
    expect(pinned.recommendationId).toBe("test-2k");
    expect(pinned.tieIds).toStrictEqual(["a"]);
  });
});

describe("drawnId (the day's drawn first card)", () => {
  const library = [
    w("a", { lastDoneDaysAgo: null }),
    w("b", { lastDoneDaysAgo: null }),
    w("c", { lastDoneDaysAgo: 3 }),
  ];
  const p = {
    ...prefs,
    durationRange: undefined,
  };

  it("is honoured for the card and reported as least recently done, never YOUR PICK, in both modes", () => {
    const r = suggest({ todayCode: "AT", prefs: p, library, drawnId: "b" });
    expect(r.recommendationId).toBe("b");
    expect(r.reason).toBe("Least recently done (never done).");
    const f = suggestFreestyle(library, p, undefined, "b");
    expect(f.recommendationId).toBe("b");
    expect(f.reason).toBe("Least recently done (never done).");
  });

  it("loses to the rower's own todayPickId, which alone says YOUR PICK", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: p,
      library,
      drawnId: "b",
      todayPickId: "c",
    });
    expect(r.recommendationId).toBe("c");
    expect(r.reason).toBe("YOUR PICK: last done 3 days ago.");
    expect(suggestFreestyle(library, p, "c", "b").recommendationId).toBe("c");
  });

  it("is ignored when it is no longer in the pool (a filter or type changed since the draw)", () => {
    const r = suggest({
      todayCode: "AT",
      prefs: p,
      library,
      drawnId: "gone",
    });
    expect(r.recommendationId).toBe("a");
    expect(r.reason).toBe("Least recently done (never done).");
  });

  it("keeps the fell-back reason when the filters matched nothing", () => {
    const hard = [
      w("a", { lastDoneDaysAgo: null }),
      w("b", { lastDoneDaysAgo: null }),
    ];
    const r = suggest({
      todayCode: "AT",
      prefs: { durationRange: undefined, painLevels: [1] },
      library: hard,
      drawnId: "b",
    });
    expect(r.recommendationId).toBe("b");
    expect(r.reason).toMatch(/^Nothing fit your pain filters/);
  });

  it("NEVER beats a checkpoint pin — the draw is not the rower's act; SHUFFLE (todayPickId) is the escape", () => {
    const pin = { entry: w("k2", { lastDoneDaysAgo: null }), reason: "2k day" };
    const r = suggest({
      todayCode: "AT",
      prefs: p,
      library,
      drawnId: "b",
      prescribed: pin,
    });
    expect(r.recommendationId).toBe("k2");
    expect(r.reason).toBe("2k day");
    const escaped = suggest({
      todayCode: "AT",
      prefs: p,
      library,
      drawnId: "b",
      todayPickId: "a",
      prescribed: pin,
    });
    expect(escaped.recommendationId).toBe("a");
  });
});

describe("drawOne", () => {
  it("returns null for an empty list and the only member for a singleton without consulting rng", () => {
    expect(drawOne([], scripted([]))).toBeNull();
    expect(drawOne(["only"], scripted([]))).toBe("only");
  });

  it("maps a 32-bit draw to a member by modulo, covering every member", () => {
    const ids = ["a", "b", "c"];
    expect(drawOne(ids, scripted([0]))).toBe("a");
    expect(drawOne(ids, scripted([1]))).toBe("b");
    expect(drawOne(ids, scripted([2]))).toBe("c");
    expect(drawOne(ids, scripted([3]))).toBe("a");
  });

  it("rejects draws in the biased tail and redraws (rejection sampling), never returning a member out of proportion", () => {
    // For n = 3 the largest accepted draw is the greatest multiple of 3
    // below 2^32, minus one; anything at or above it is rejected. The
    // sequence below hits the tail first, then lands on "c".
    // Independent literals, not derived from RNG_RANGE (RF21): for n = 3
    // the accept limit is 2^32 - (2^32 % 3) = 4294967295, so a draw of
    // 4294967295 is rejected and 4294967294 (≡ 2 mod 3) is the largest
    // accepted one.
    expect(
      drawOne(["a", "b", "c"], scripted([4294967295, 4294967295, 2])),
    ).toBe("c");
    expect(drawOne(["a", "b", "c"], scripted([4294967294]))).toBe("c");
    expect(RNG_RANGE).toBe(4294967296);
  });
});

describe("nextShuffle", () => {
  it("draws only from members not yet shown and not on screen, appending the draw to shownIds", () => {
    const r = nextShuffle(["a", "b", "c", "d"], ["a"], "b", scripted([0]));
    // candidates = [c, d]; draw 0 -> c
    expect(r).toStrictEqual({ id: "c", shownIds: ["a", "c"] });
  });

  it("resets the shown set once every member has been shown, excluding only the card on screen", () => {
    const r = nextShuffle(["a", "b", "c"], ["a", "b", "c"], "c", scripted([1]));
    // candidates after reset = [a, b]; draw 1 -> b; shownIds restarts at [b]
    expect(r).toStrictEqual({ id: "b", shownIds: ["b"] });
  });

  it("treats a stale shown id (not in the pool) as simply not a candidate, and an off-pool current id as no exclusion", () => {
    const r = nextShuffle(["a", "b"], ["zzz"], "pinned-test", scripted([1]));
    expect(r).toStrictEqual({ id: "b", shownIds: ["zzz", "b"] });
  });

  it("returns the current id unchanged when the pool is only that id, and null for an empty pool", () => {
    expect(nextShuffle(["a"], ["a"], "a", scripted([]))).toStrictEqual({
      id: "a",
      shownIds: ["a"],
    });
    expect(nextShuffle([], [], null, scripted([]))).toBeNull();
  });

  it("walks the whole pool before any repeat under a fixed rng, then resets", () => {
    const pool = ["a", "b", "c", "d", "e"];
    let shown: string[] = [];
    let current: string | null = null;
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r: { id: string; shownIds: string[] } = nextShuffle(
        pool,
        shown,
        current,
        scripted([7]),
      )!;
      seen.push(r.id);
      shown = r.shownIds;
      current = r.id;
    }
    expect([...seen].sort()).toStrictEqual(pool);
    const sixth = nextShuffle(pool, shown, current, scripted([0]))!;
    expect(sixth.shownIds).toStrictEqual([sixth.id]);
    expect(sixth.id).not.toBe(current);
  });
});
