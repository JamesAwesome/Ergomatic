import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTERS,
  RECENCY_BOUNDARY_DAYS,
  applyFilters,
  hasActiveFilters,
  isTypeSelected,
  clearFilters,
  isRecent,
  setLastDone,
  setSource,
  toggleDifficulty,
  setDurationRange,
  togglePainLevel,
  toggleType,
  type Filters,
} from "./filters";
import type { LibraryWorkout } from "../api/useWorkouts";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Step, WorkoutType } from "../../domain/types.js";

const baselines = { k2Seconds: 112, k6Seconds: 122 };

/** A work step of exactly `minutes` at the 6k baseline (off 0), so
 *  `estimateMinutes` prices the workout to that many minutes on the nose —
 *  the only thing a duration-bucket fixture needs to say. */
function timeWork(minutes: number): Step {
  return {
    k: "w",
    duration: { kind: "time", minutes },
    ref: { base: "6k", off: 0 },
  };
}

function w(over: Partial<LibraryWorkout> & { id: string }): LibraryWorkout {
  return {
    title: "T",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    // A plain 10' work step at the 6k baseline: `estimateMinutes` prices
    // it to 10 minutes, which is all any duration-bucket fixture here
    // needs. (Every fixture in this file was a `wu` row until 2026-08-09's
    // warmup setting removed that step kind — a `wu` step contributes NO
    // minutes to `estimateMinutes` any more, so a warm-up-only workout
    // would now bucket as 0 minutes, not as its authored duration.)
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 0 },
      },
    ],
    isGlobal: true,
    lastDoneDaysAgo: null,
    ...over,
  } as LibraryWorkout;
}

// Realistic fixture (recurring-failure #3): the real 300-workout global
// library, not a hand-built minimum — the "composes" test below needs
// real co-occurring type/difficulty/pain combinations to prove the
// predicates actually intersect rather than each independently matching
// everything.
const WORKOUTS: LibraryWorkout[] = LIBRARY_WORKOUTS.map((seed, i) => ({
  id: `lib-${i}`,
  title: seed.title,
  type: seed.type,
  difficulty: seed.difficulty,
  pain: seed.pain,
  steps: seed.steps,
  isGlobal: true,
  lastDoneDaysAgo: null,
}));

describe("chip/cell state transitions", () => {
  it("accumulates types (multi-select union) and removes on repeat", () => {
    const f = toggleType(toggleType(EMPTY_FILTERS, "AT"), "O2");
    expect(f.types).toStrictEqual(["AT", "O2"]);
    expect(toggleType(f, "AT").types).toStrictEqual(["O2"]);
  });

  it("accumulates difficulties (multi-select union) and removes on repeat", () => {
    const f = toggleDifficulty(toggleDifficulty(EMPTY_FILTERS, "easy"), "hard");
    expect(f.difficulties).toStrictEqual(["easy", "hard"]);
    expect(toggleDifficulty(f, "easy").difficulties).toStrictEqual(["hard"]);
  });

  it("sets the TIME range as a whole (a two-thumb control has no toggle)", () => {
    const f = setDurationRange(EMPTY_FILTERS, { min: 25, max: 35 });
    expect(f.durationRange).toStrictEqual({ min: 25, max: 35 });
    expect(
      setDurationRange(f, { min: 0, max: 120 }).durationRange,
    ).toStrictEqual({ min: 0, max: 120 });
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
      types: ["AN"],
      difficulties: ["hard"],
      durationRange: { min: 0, max: 30 },
      painLevels: [4, 5],
      lastDone: "under21",
      source: "custom",
    };
    expect(clearFilters()).toStrictEqual(EMPTY_FILTERS);
    expect(busy).not.toStrictEqual(EMPTY_FILTERS);
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

  it("difficulties: empty means no filter; a selection excludes the rest", () => {
    // Compared against WORKOUTS.length directly, not against a second
    // EMPTY_FILTERS-shaped call — EMPTY_FILTERS already has
    // `difficulties: []`, so comparing two calls that are the same input
    // would pass even if the guard this test exists to pin were dropped
    // (whole-branch review I-3).
    expect(
      applyFilters(WORKOUTS, { ...EMPTY_FILTERS, difficulties: [] }, baselines),
    ).toHaveLength(WORKOUTS.length);
    const easy = applyFilters(
      WORKOUTS,
      { ...EMPTY_FILTERS, difficulties: ["easy"] },
      baselines,
    );
    expect(easy.length).toBeGreaterThan(0);
    expect(easy.every((r) => r.difficulty === "easy")).toBe(true);
    const easyMed = applyFilters(
      WORKOUTS,
      { ...EMPTY_FILTERS, difficulties: ["easy", "medium"] },
      baselines,
    );
    expect(easyMed.length).toBeGreaterThan(easy.length);
    expect(easyMed.every((r) => r.difficulty !== "hard")).toBe(true);
  });

  it("types: empty means all; a two-type selection is their union", () => {
    expect(
      applyFilters(WORKOUTS, { ...EMPTY_FILTERS, types: [] }, baselines),
    ).toHaveLength(WORKOUTS.length);
    const o2 = applyFilters(
      WORKOUTS,
      { ...EMPTY_FILTERS, types: ["O2"] },
      baselines,
    );
    const at = applyFilters(
      WORKOUTS,
      { ...EMPTY_FILTERS, types: ["AT"] },
      baselines,
    );
    const both = applyFilters(
      WORKOUTS,
      { ...EMPTY_FILTERS, types: ["O2", "AT"] },
      baselines,
    );
    expect(both).toHaveLength(o2.length + at.length);
    expect(both.every((r) => r.type === "O2" || r.type === "AT")).toBe(true);
  });

  it("composes: difficulty AND type AND pain narrow together against the real library", () => {
    // Verified against the real 300-workout seed (not guessed): types
    // {O2,AT} ∩ difficulties {easy,medium} ∩ pain {1,2,3} = 126 rows, a
    // proper subset of both types+difficulties alone (140) and of either
    // predicate alone — see the inspection this test's assertions encode.
    const filters: Filters = {
      ...EMPTY_FILTERS,
      types: ["O2", "AT"],
      difficulties: ["easy", "medium"],
      painLevels: [1, 2, 3],
    };
    const expected = WORKOUTS.filter(
      (r) =>
        (r.type === "O2" || r.type === "AT") &&
        (r.difficulty === "easy" || r.difficulty === "medium") &&
        (r.pain === 1 || r.pain === 2 || r.pain === 3),
    );
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(WORKOUTS.length);

    const result = applyFilters(WORKOUTS, filters, baselines);
    expect(result.map((r) => r.id)).toStrictEqual(expected.map((r) => r.id));
  });

  it("keeps only rows whose printed minutes fall inside the TIME range, both ends inclusive, 120 meaning no upper bound", () => {
    const short = w({ id: "short", steps: [timeWork(10)] });
    const mid = w({ id: "mid", steps: [timeWork(35)] });
    const long = w({ id: "long", steps: [timeWork(70)] });
    const rows = [short, mid, long];
    const upTo30 = setDurationRange(EMPTY_FILTERS, { min: 0, max: 30 });
    expect(
      applyFilters(rows, upTo30, baselines).map((r) => r.id),
    ).toStrictEqual(["short"]);
    const twentyFiveTo35 = setDurationRange(EMPTY_FILTERS, {
      min: 25,
      max: 35,
    });
    expect(
      applyFilters(rows, twentyFiveTo35, baselines).map((r) => r.id),
    ).toStrictEqual(["mid"]);
    const sixtyPlus = setDurationRange(EMPTY_FILTERS, { min: 60, max: 120 });
    expect(
      applyFilters(rows, sixtyPlus, baselines).map((r) => r.id),
    ).toStrictEqual(["long"]);
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
    const f = setDurationRange(EMPTY_FILTERS, { min: 0, max: 30 });
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
      { ...EMPTY_FILTERS, source: "custom", types: ["AN"] },
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

describe("hasActiveFilters", () => {
  // The reason this exists: `filterTokens(f).length > 0` used to be the
  // equivalent test, and it stopped being one when TYPE lost its token
  // (2026-08-12). A type-only filter narrows the list while producing no
  // tokens, so the old test made Library claim the unfiltered count over a
  // filtered list and hid CLEAR ALL.
  it("is false only for EMPTY_FILTERS", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("is true for a TYPE-ONLY filter — the case the token-derived test got wrong", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, types: ["O2"] })).toBe(true);
  });

  it("is true for every other group on its own", () => {
    const cases: Partial<Filters>[] = [
      { difficulties: ["easy"] },
      { durationRange: { min: 0, max: 30 } },
      { painLevels: [3] },
      { lastDone: "under21" },
      { source: "custom" },
    ];
    for (const patch of cases) {
      const active = hasActiveFilters({ ...EMPTY_FILTERS, ...patch });
      // Named in the failure via the value itself, since vitest's `expect`
      // takes no message argument.
      expect({ patch, active }).toStrictEqual({ patch, active: true });
    }
  });
});

// James, 2026-08-12: "I'd like them all on by default. When they're all on,
// if you tap a single type, the others become deselected. If you deselect the
// last selected type -> they turn back on."
describe("the TYPE chip state machine", () => {
  const ALL = ["O2", "AT", "TR", "AN"] as const;
  const withTypes = (types: readonly WorkoutType[]): Filters => ({
    ...EMPTY_FILTERS,
    types: [...types],
  });

  it("all on by default: an empty selection renders every chip selected", () => {
    for (const t of ALL) {
      expect(isTypeSelected(EMPTY_FILTERS, t)).toBe(true);
    }
  });

  it("a subset selects exactly its own members", () => {
    const f = withTypes(["O2", "TR"]);
    expect(ALL.filter((t) => isTypeSelected(f, t))).toStrictEqual(["O2", "TR"]);
  });

  it("all on + tap X leaves ONLY X selected", () => {
    const next = toggleType(EMPTY_FILTERS, "AT");
    expect(next.types).toStrictEqual(["AT"]);
    expect(ALL.filter((t) => isTypeSelected(next, t))).toStrictEqual(["AT"]);
  });

  it("tapping the LAST selected type turns them all back on", () => {
    const single = withTypes(["AT"]);
    const next = toggleType(single, "AT");
    expect(next.types).toStrictEqual([]);
    for (const t of ALL) {
      expect(isTypeSelected(next, t)).toBe(true);
    }
  });

  it("tapping an unselected type adds it; tapping a selected one of several removes just it", () => {
    const added = toggleType(withTypes(["O2"]), "TR");
    expect(added.types).toStrictEqual(["O2", "TR"]);
    const removed = toggleType(added, "O2");
    expect(removed.types).toStrictEqual(["TR"]);
  });

  it("selecting all four one at a time normalizes back to all-on, so the next tap deselects the others", () => {
    let f: Filters = EMPTY_FILTERS;
    for (const t of ALL) f = toggleType(f, t);
    expect(f.types).toStrictEqual([]);
    expect(toggleType(f, "TR").types).toStrictEqual(["TR"]);
  });

  it("a full round trip returns to the same state it started in", () => {
    const there = toggleType(EMPTY_FILTERS, "O2");
    expect(toggleType(there, "O2")).toStrictEqual(EMPTY_FILTERS);
  });

  it("all-on narrows nothing, and is not an active filter; a subset is both", () => {
    expect(applyFilters(WORKOUTS, EMPTY_FILTERS, baselines)).toHaveLength(
      WORKOUTS.length,
    );
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    const subset = withTypes(["O2"]);
    expect(
      applyFilters(WORKOUTS, subset, baselines).every((w) => w.type === "O2"),
    ).toBe(true);
    expect(hasActiveFilters(subset)).toBe(true);
  });

  it("never leaves a state that matches nothing: no reachable selection is empty-but-narrowing", () => {
    // Exhaustive over every start state and every tap.
    const starts: Filters[] = [
      EMPTY_FILTERS,
      ...ALL.map((t) => withTypes([t])),
      withTypes(["O2", "AT"]),
      withTypes(["O2", "AT", "TR"]),
    ];
    for (const start of starts) {
      for (const tap of ALL) {
        const next = toggleType(start, tap);
        expect({
          start: start.types,
          tap,
          len: next.types.length,
        }).not.toMatchObject({ len: 4 });
        const selected = ALL.filter((t) => isTypeSelected(next, t));
        expect({ start: start.types, tap, selected }).not.toMatchObject({
          selected: [],
        });
      }
    }
  });
});
