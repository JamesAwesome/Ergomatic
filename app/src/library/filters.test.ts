import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTERS,
  applyFilters,
  bucketFor,
  clearFilters,
  setRecency,
  toggleDuration,
  togglePain,
  toggleType,
  type Filters,
} from "./filters";
import type { LibraryWorkout } from "../api/useWorkouts";

const baselines = { k2Seconds: 112, k6Seconds: 122 };

function w(over: Partial<LibraryWorkout> & { id: string }): LibraryWorkout {
  return {
    num: 1,
    title: "T",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [{ k: "wu", minutes: 10 }],
    isGlobal: true,
    lastDoneDaysAgo: null,
    ...over,
  } as LibraryWorkout;
}

describe("chip state transitions", () => {
  it("selects a type, and selecting the same type again clears it", () => {
    const once = toggleType(EMPTY_FILTERS, "AT");
    expect(once.type).toBe("AT");
    expect(toggleType(once, "AT").type).toBeNull();
  });

  it("replaces the type rather than accumulating (single-select)", () => {
    const f = toggleType(toggleType(EMPTY_FILTERS, "AT"), "O2");
    expect(f.type).toBe("O2");
  });

  it("accumulates duration buckets (multi-select union) and removes on repeat", () => {
    const f = toggleDuration(toggleDuration(EMPTY_FILTERS, "<30"), "60+");
    expect(f.durations).toStrictEqual(["<30", "60+"]);
    expect(toggleDuration(f, "<30").durations).toStrictEqual(["60+"]);
  });

  it("makes RECENT and NOT RECENT mutually exclusive", () => {
    const f = setRecency(setRecency(EMPTY_FILTERS, "recent"), "not-recent");
    expect(f.recency).toBe("not-recent");
  });

  it("clears every chip at once", () => {
    const busy: Filters = {
      type: "AN",
      durations: ["<30"],
      painMax3: true,
      recency: "recent",
    };
    expect(clearFilters()).toStrictEqual(EMPTY_FILTERS);
    expect(busy).not.toStrictEqual(EMPTY_FILTERS);
  });
});

describe("bucketFor", () => {
  it("puts boundary durations in the handoff's buckets", () => {
    expect(bucketFor(29)).toBe("<30");
    expect(bucketFor(30)).toBe("30-45");
    expect(bucketFor(45)).toBe("45-60");
    expect(bucketFor(60)).toBe("60+");
  });
});

describe("applyFilters", () => {
  it("keeps only the selected type", () => {
    const rows = [w({ id: "a", type: "AT" }), w({ id: "b", type: "O2" })];
    const kept = applyFilters(rows, toggleType(EMPTY_FILTERS, "AT"), baselines);
    expect(kept.map((r) => r.id)).toStrictEqual(["a"]);
  });

  it("unions duration buckets", () => {
    const short = w({ id: "short", steps: [{ k: "wu", minutes: 10 }] });
    const long = w({ id: "long", steps: [{ k: "wu", minutes: 70 }] });
    const f = toggleDuration(EMPTY_FILTERS, "<30");
    expect(
      applyFilters([short, long], f, baselines).map((r) => r.id),
    ).toStrictEqual(["short"]);
    const both = toggleDuration(f, "60+");
    expect(
      applyFilters([short, long], both, baselines).map((r) => r.id),
    ).toStrictEqual(["short", "long"]);
  });

  it("keeps only pain 3 or lower when PAIN ≤3 is on", () => {
    const rows = [w({ id: "ok", pain: 3 }), w({ id: "hurts", pain: 4 })];
    expect(
      applyFilters(rows, togglePain(EMPTY_FILTERS), baselines).map((r) => r.id),
    ).toStrictEqual(["ok"]);
  });

  it("splits recency at 21 days, counting never-done as not recent", () => {
    const rows = [
      w({ id: "fresh", lastDoneDaysAgo: 20 }),
      w({ id: "stale", lastDoneDaysAgo: 21 }),
      w({ id: "never", lastDoneDaysAgo: null }),
    ];
    expect(
      applyFilters(rows, setRecency(EMPTY_FILTERS, "recent"), baselines).map(
        (r) => r.id,
      ),
    ).toStrictEqual(["fresh"]);
    expect(
      applyFilters(
        rows,
        setRecency(EMPTY_FILTERS, "not-recent"),
        baselines,
      ).map((r) => r.id),
    ).toStrictEqual(["stale", "never"]);
  });

  it("skips duration filtering when baselines are unknown rather than hiding everything", () => {
    const rows = [w({ id: "a" }), w({ id: "b" })];
    const f = toggleDuration(EMPTY_FILTERS, "<30");
    expect(applyFilters(rows, f, null).map((r) => r.id)).toStrictEqual([
      "a",
      "b",
    ]);
  });

  it("intersects different chip kinds", () => {
    const rows = [
      w({ id: "match", type: "AT", pain: 2 }),
      w({ id: "wrongtype", type: "O2", pain: 2 }),
      w({ id: "toopainful", type: "AT", pain: 5 }),
    ];
    const f = togglePain(toggleType(EMPTY_FILTERS, "AT"));
    expect(applyFilters(rows, f, baselines).map((r) => r.id)).toStrictEqual([
      "match",
    ]);
  });
});
