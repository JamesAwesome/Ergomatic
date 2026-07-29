import { describe, it, expect } from "vitest";
import { suggest } from "./suggest.js";

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
