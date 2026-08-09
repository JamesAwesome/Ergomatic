import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTERS,
  RECENCY_BOUNDARY_DAYS,
  applyFilters,
  bucketFor,
  clearFilters,
  isRecent,
  setLastDone,
  setSource,
  toggleDuration,
  togglePainLevel,
  toggleType,
  type Filters,
} from "./filters";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { Step } from "../../domain/types.js";

const baselines = { k2Seconds: 112, k6Seconds: 122 };

function w(over: Partial<LibraryWorkout> & { id: string }): LibraryWorkout {
  return {
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

describe("chip/cell state transitions", () => {
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

  it("accumulates pain levels (multi-select union) and removes on repeat", () => {
    const f = togglePainLevel(togglePainLevel(EMPTY_FILTERS, 1), 4);
    expect(f.painLevels).toStrictEqual([1, 4]);
    expect(togglePainLevel(f, 1).painLevels).toStrictEqual([4]);
  });

  it("makes under21 and over21 mutually exclusive", () => {
    const f = setLastDone(setLastDone(EMPTY_FILTERS, "under21"), "over21");
    expect(f.lastDone).toBe("over21");
  });

  it("clears a LAST DONE cell when the active one is tapped again", () => {
    const on = setLastDone(EMPTY_FILTERS, "under21");
    expect(setLastDone(on, "under21").lastDone).toBeNull();
  });

  it("clears over21 when tapped again (symmetric toggle-off)", () => {
    const on = setLastDone(EMPTY_FILTERS, "over21");
    expect(setLastDone(on, "over21").lastDone).toBeNull();
  });

  it("makes global and custom mutually exclusive", () => {
    const f = setSource(setSource(EMPTY_FILTERS, "global"), "custom");
    expect(f.source).toBe("custom");
  });

  it("clears a SOURCE cell when the active one is tapped again", () => {
    const on = setSource(EMPTY_FILTERS, "custom");
    expect(setSource(on, "custom").source).toBeNull();
  });

  it("clears every filter at once", () => {
    const busy: Filters = {
      type: "AN",
      durations: ["<30"],
      painLevels: [4, 5],
      lastDone: "under21",
      source: "custom",
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

describe("isRecent", () => {
  it("is true strictly under the recency boundary", () => {
    expect(isRecent(RECENCY_BOUNDARY_DAYS - 1)).toBe(true);
  });

  it("is false AT and beyond the recency boundary", () => {
    expect(isRecent(RECENCY_BOUNDARY_DAYS)).toBe(false);
    expect(isRecent(RECENCY_BOUNDARY_DAYS + 1)).toBe(false);
  });

  it("counts never-done (null) as NOT recent — pinned, not an oversight", () => {
    expect(isRecent(null)).toBe(false);
  });
});

describe("applyFilters", () => {
  it("keeps only the selected type", () => {
    const rows = [w({ id: "a", type: "AT" }), w({ id: "b", type: "O2" })];
    const kept = applyFilters(rows, toggleType(EMPTY_FILTERS, "AT"), baselines);
    expect(kept.map((r) => r.id)).toStrictEqual(["a"]);
  });

  it("unions duration buckets", () => {
    // Task 4/5 shim: "wu" left the Step union but these fixtures haven't.
    const short = w({
      id: "short",
      steps: [{ k: "wu", minutes: 10 } as unknown as Step],
    });
    const long = w({
      id: "long",
      steps: [{ k: "wu", minutes: 70 } as unknown as Step],
    });
    const f = toggleDuration(EMPTY_FILTERS, "<30");
    expect(
      applyFilters([short, long], f, baselines).map((r) => r.id),
    ).toStrictEqual(["short"]);
    const both = toggleDuration(f, "60+");
    expect(
      applyFilters([short, long], both, baselines).map((r) => r.id),
    ).toStrictEqual(["short", "long"]);
  });

  it("unions pain levels — a non-contiguous selection still matches every level named", () => {
    const rows = [
      w({ id: "p1", pain: 1 }),
      w({ id: "p3", pain: 3 }),
      w({ id: "p4", pain: 4 }),
    ];
    const f = togglePainLevel(togglePainLevel(EMPTY_FILTERS, 1), 4);
    expect(applyFilters(rows, f, baselines).map((r) => r.id)).toStrictEqual([
      "p1",
      "p4",
    ]);
  });

  it("splits recency at the boundary via lastDone, counting never-done as over21", () => {
    const rows = [
      w({ id: "fresh", lastDoneDaysAgo: RECENCY_BOUNDARY_DAYS - 1 }),
      w({ id: "stale", lastDoneDaysAgo: RECENCY_BOUNDARY_DAYS }),
      w({ id: "never", lastDoneDaysAgo: null }),
    ];
    expect(
      applyFilters(rows, setLastDone(EMPTY_FILTERS, "under21"), baselines).map(
        (r) => r.id,
      ),
    ).toStrictEqual(["fresh"]);
    expect(
      applyFilters(rows, setLastDone(EMPTY_FILTERS, "over21"), baselines).map(
        (r) => r.id,
      ),
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

  it("intersects different filter kinds", () => {
    const rows = [
      w({ id: "match", type: "AT", pain: 2 }),
      w({ id: "wrongtype", type: "O2", pain: 2 }),
      w({ id: "toopainful", type: "AT", pain: 5 }),
    ];
    const f = togglePainLevel(toggleType(EMPTY_FILTERS, "AT"), 2);
    expect(applyFilters(rows, f, baselines).map((r) => r.id)).toStrictEqual([
      "match",
    ]);
  });
});

describe("source", () => {
  it("keeps only non-global workouts when source is custom", () => {
    const ws = [
      w({ id: "mine", title: "Mine", isGlobal: false }),
      w({ id: "seeded", title: "Seeded", isGlobal: true }),
    ];
    const out = applyFilters(ws, { ...EMPTY_FILTERS, source: "custom" }, null);
    expect(out.map((r) => r.title)).toStrictEqual(["Mine"]);
  });

  it("keeps only global workouts when source is global", () => {
    const ws = [
      w({ id: "mine", title: "Mine", isGlobal: false }),
      w({ id: "seeded", title: "Seeded", isGlobal: true }),
    ];
    const out = applyFilters(ws, { ...EMPTY_FILTERS, source: "global" }, null);
    expect(out.map((r) => r.title)).toStrictEqual(["Seeded"]);
  });

  it("ANDs with the type filter", () => {
    const ws = [
      w({ id: "mine-an", title: "Mine-AN", type: "AN", isGlobal: false }),
      w({ id: "mine-o2", title: "Mine-O2", type: "O2", isGlobal: false }),
      w({ id: "seeded-an", title: "Seeded-AN", type: "AN", isGlobal: true }),
    ];
    const out = applyFilters(
      ws,
      { ...EMPTY_FILTERS, source: "custom", type: "AN" },
      null,
    );
    expect(out.map((r) => r.title)).toStrictEqual(["Mine-AN"]);
  });

  it("setSource flips exclusively and clearFilters resets", () => {
    const custom = setSource(EMPTY_FILTERS, "custom");
    expect(custom.source).toBe("custom");
    expect(setSource(custom, "global").source).toBe("global");
    expect(clearFilters().source).toBeNull();
  });
});
