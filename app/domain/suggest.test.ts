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
});
