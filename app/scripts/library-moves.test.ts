import { describe, it, expect } from "vitest";
import type { Step, WorkoutInput } from "../domain/types.js";
import { estimateMinutes } from "../domain/expand.js";
import { LIBRARY_WORKOUTS } from "../server/seed/library/index.js";
import { BANDS, BASELINES, bucket, type Band } from "./library-balance.js";
import patterns from "../domain/generation/patterns.json";
import { classifyArchetype } from "../domain/generation/archetype.js";
import {
  ANCHOR_TITLES,
  assignToGrid,
  bookCell,
  buildSketch,
  candidateGrids,
  describeSteps,
  landsLegally,
  RATIO_FAMILY,
  shapeIssues,
  DRAFT_GRID,
  fmtClock,
  libraryItems,
  pieceFactors,
  rawMinutes,
  solveLibrary,
  type Grid,
  hallDeficit,
  reachable,
  reachableBands,
  type SolveItem,
  solveType,
  targetTotal,
} from "./library-moves.js";

const grid = (a: number, b: number, c: number, d: number, e: number): Grid => ({
  "<20": a,
  "20-30": b,
  "30-45": c,
  "45-60": d,
  "60+": e,
});

const cellCounts = (assigned: ReadonlyMap<string, Band>): Grid => {
  const out = grid(0, 0, 0, 0, 0);
  for (const b of assigned.values()) out[b]++;
  return out;
};

// A work step whose length makes the arithmetic readable: `n` minutes at a
// 6k offset, optionally with a rest beside it.
const work = (minutes: number, restMinutes?: number): Step => ({
  k: "w",
  duration: { kind: "time", minutes },
  ref: { base: "6k", off: 10 },
  spm: 22,
  ...(restMinutes === undefined ? {} : { restMinutes }),
});

describe("reachable / reachableBands", () => {
  it("walks the 0/5 grid inside ±25% and reaches both ways", () => {
    // 40' continuous: the window is [30, 50], and the legal totals inside it
    // are the multiples of five. Shrinking to 30-45's floor and stretching
    // into 45-60 are both on the table (§3: "SHRINKING is equally legal").
    const r = reachable([work(40)], BASELINES);
    expect(r.current).toBe(40);
    expect(r.window).toStrictEqual([30, 50]);
    expect(r.scaleTotals).toStrictEqual([30, 35, 40, 45, 50]);
    expect(reachableBands(r)).toStrictEqual(["30-45", "45-60"]);
  });

  it("does not admit a band the ±25% window only touches from outside", () => {
    // 16': the window is [12, 20] and 20 is the 20-30 floor, so 20-30 is IN.
    // 24' would be a two-band jump and is not.
    const r = reachable([work(16)], BASELINES);
    expect(r.scaleTotals).toStrictEqual([15, 16, 20]);
    expect(reachableBands(r)).toStrictEqual(["<20", "20-30"]);
    // 15' cannot reach 20-30 at all: its window tops out at 18.75.
    expect(reachableBands(reachable([work(15)], BASELINES))).toStrictEqual([
      "<20",
    ]);
  });

  it("offers the one-rep arm in both directions, and only when it is 0/5", () => {
    // 3 × 5' = 15'. Four reps is 20' and two is 10' — both legal totals, and
    // BOTH sit outside the ±25% window [11.25, 18.75]. That is the point of
    // §3's disjunction: "one-rep adds may exceed 25%".
    const three = reachable(
      [{ k: "reps", count: 3 }, work(5)] as Step[],
      BASELINES,
    );
    expect(three.window).toStrictEqual([11.25, 18.75]);
    expect(three.repAdd).toBe(20);
    expect(three.repDrop).toBe(10);
    expect(three.repAdd!).toBeGreaterThan(three.window[1]);
    expect(three.repDrop!).toBeLessThan(three.window[0]);
    expect(reachableBands(three)).toStrictEqual(["<20", "20-30"]);
    // 6 × [2' + 1'] = 18'. Seven reps is 21', which no house rule allows, so
    // the arm is not offered — and 20-30 is only reachable by scaling.
    const six = reachable(
      [{ k: "reps", count: 6 }, work(2, 1)] as Step[],
      BASELINES,
    );
    expect(six.repAdd).toBeNull();
    expect(six.repDrop).toBe(15);
  });

  it("refuses a rep-add that would breach validate.ts's 1..12", () => {
    const r = reachable(
      [{ k: "reps", count: 12 }, work(2, 0.5)] as Step[],
      BASELINES,
    );
    expect(r.repAdd).toBeNull();
    // …and a rep-drop that would leave a "repeated" block of one.
    const two = reachable(
      [{ k: "reps", count: 2 }, work(5, 1)] as Step[],
      BASELINES,
    );
    expect(two.repDrop).toBeNull();
  });

  it("treats a distance-involved workout's window as continuous (an.ts's exemption)", () => {
    const r = reachable(
      [
        {
          k: "w",
          duration: { kind: "distance", meters: 5000 },
          ref: { base: "6k", off: 10 },
          spm: 22,
        },
      ],
      BASELINES,
    );
    expect(r.estimated).toBe(true);
    expect(r.continuous).toBe(true);
    // 22' nominal: the window is [16.5, 27.5], so both bands it straddles
    // are reachable even though neither endpoint is a multiple of five.
    expect(r.current).toBe(22);
    expect(reachableBands(r)).toStrictEqual(["<20", "20-30"]);
  });

  it("does not admit the band a continuous window only touches at its very top", () => {
    // 9836 m at 6k+0 prices at 40'. The window is [30, 50], and 30 is the
    // FLOOR of 30-45 — 20-30 ends there and must not count as reachable.
    const r = reachable(
      [
        {
          k: "w",
          duration: { kind: "distance", meters: 9836 },
          ref: { base: "6k", off: 0 },
          spm: 22,
        },
      ],
      BASELINES,
    );
    expect(r.current).toBe(40);
    expect(r.window).toStrictEqual([30, 50]);
    expect(reachableBands(r)).toStrictEqual(["30-45", "45-60"]);
  });

  it("pins Sea Fret's reachable set from the real seed — the anchor cannot move", () => {
    // The realistic fixture (briefing): `driver.test.ts` leans on Sea Fret's
    // exact shape, and this is why the solve never has to disturb it — 10'
    // with a 2-rep block, so the window is [7.5, 12.5] (only 10 is 0/5) and
    // the one-rep arm lands at 15', still under 20.
    const seaFret = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret")!;
    const r = reachable(seaFret.steps, BASELINES);
    expect(r.current).toBe(10);
    expect(r.repAdd).toBe(15);
    expect(r.repDrop).toBeNull();
    expect(reachableBands(r)).toStrictEqual(["<20"]);
  });
});

describe("candidateGrids (the ±2 rule)", () => {
  it("never moves a cell by more than the clamp and never changes the total", () => {
    const draft = grid(4, 14, 34, 18, 20);
    const cands = candidateGrids(draft);
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) {
      let sum = 0;
      for (const b of BANDS) {
        expect(Math.abs(c.adjustments[b])).toBeLessThanOrEqual(2);
        expect(c.grid[b]).toBe(draft[b] + c.adjustments[b]);
        sum += c.grid[b];
      }
      expect(sum).toBe(90);
      expect(c.deviation).toBe(
        BANDS.reduce((a, b) => a + Math.abs(c.adjustments[b]), 0),
      );
    }
    // The draft itself is always a candidate.
    expect(cands.some((c) => c.deviation === 0)).toBe(true);
  });

  it("honours a wider clamp when one is asked for, and keeps 30-45 the mode", () => {
    const draft = grid(4, 14, 34, 18, 20);
    expect(candidateGrids(draft).some((c) => c.adjustments["<20"] === 3)).toBe(
      false,
    );
    expect(
      candidateGrids(draft, { maxAdjust: 3 }).some(
        (c) => c.adjustments["<20"] === 3,
      ),
    ).toBe(true);
    // Ruling B, §2: "30-45 is the LARGEST cell in every type". Opt-in, and
    // the library solve is the caller that opts in.
    // A tight draft, where ±2 really can overtake 30-45: 60+ 3 -> 5 beats
    // 30-45 4. (§2's real O2 row has too much daylight for the rule to bite.)
    const tight = grid(1, 2, 4, 2, 3);
    const free = candidateGrids(tight, { maxAdjust: 2 });
    const ruled = candidateGrids(tight, { maxAdjust: 2, modeAt: "30-45" });
    expect(ruled.length).toBeLessThan(free.length);
    const others = BANDS.filter((b) => b !== "30-45");
    for (const c of ruled) {
      expect(Math.max(...others.map((b) => c.grid[b]))).toBeLessThan(
        c.grid["30-45"],
      );
    }
  });

  it("drops a candidate that would take a cell negative", () => {
    const draft = grid(1, 2, 6, 2, 1);
    for (const c of candidateGrids(draft)) {
      for (const b of BANDS) expect(c.grid[b]).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------
// The 12-workout fixtures
// ---------------------------------------------------------------------

const item = (
  id: string,
  current: Band,
  reach: Band[],
  anchor = false,
): SolveItem => ({ id, type: "O2", current, reach, anchor });

/** Twelve workouts whose reachability makes exactly one assignment possible
 *  up to a choice inside one group — and whose draft grid is already
 *  feasible, so the solve must spend NO adjustment. */
const FEASIBLE_TWELVE: SolveItem[] = [
  item("short-1", "<20", ["<20"]),
  item("short-2", "<20", ["<20"]),
  item("short-3", "<20", ["<20"]),
  item("mid-1", "20-30", ["20-30", "30-45"]),
  item("mid-2", "20-30", ["20-30", "30-45"]),
  item("mid-3", "20-30", ["20-30", "30-45"]),
  item("long-1", "30-45", ["30-45", "45-60"]),
  item("long-2", "30-45", ["30-45", "45-60"]),
  item("long-3", "30-45", ["30-45", "45-60"]),
  item("epic-1", "60+", ["60+"]),
  item("epic-2", "60+", ["60+"]),
  item("epic-3", "60+", ["60+"]),
];

describe("solveType on the fixed twelve", () => {
  it("spends nothing on a feasible draft and moves exactly the one workout it must", () => {
    // <20 3 · 20-30 2 · 30-45 4 · 45-60 0 · 60+ 3. The three long-* have
    // nowhere but 30-45 (45-60 is closed), which fills three of its four
    // seats; the fourth has to come from mid-*, so exactly one mid moves up
    // and the other two stay.
    const draft = grid(3, 2, 4, 0, 3);
    const s = solveType(FEASIBLE_TWELVE, draft);
    expect(s.replaced).toStrictEqual([]);
    expect(s.deviation).toBe(0);
    expect(s.grid).toStrictEqual(draft);
    expect(cellCounts(s.assigned)).toStrictEqual(draft);
    expect(s.moves).toBe(1);
    for (const w of FEASIBLE_TWELVE) {
      expect(w.reach).toContain(s.assigned.get(w.id));
    }
    const movedMids = ["mid-1", "mid-2", "mid-3"].filter(
      (id) => s.assigned.get(id) === "30-45",
    );
    expect(movedMids).toHaveLength(1);
    expect(s.assigned.get("long-1")).toBe("30-45");
    expect(s.assigned.get("epic-1")).toBe("60+");
  });

  it("adjusts toward feasibility rather than replacing, when ±2 is enough", () => {
    // Same twelve, but the draft only seats one of the three short-*. They
    // reach nothing else, so two would be replaced at the draft; +2 on <20,
    // paid for out of the middle, keeps all three. The three epic-* already
    // fit, so the only adjustment the solve needs is that one and its
    // funding: deviation 4, not more.
    const draft = grid(1, 2, 5, 1, 3);
    const s = solveType(FEASIBLE_TWELVE, draft);
    expect(s.replaced).toStrictEqual([]);
    expect(s.grid["<20"]).toBe(3);
    expect(s.adjustments["<20"]).toBe(2);
    expect(s.grid["60+"]).toBe(3);
    expect(BANDS.reduce((a, b) => a + s.adjustments[b], 0)).toBe(0);
    expect(s.deviation).toBe(4);
    expect(cellCounts(s.assigned)).toStrictEqual(s.grid);
  });
});

/** Seven workouts that can only live in 30-45, against a cell the clamp can
 *  only widen to six. The residual is forced by the ±2 rule itself. */
const OVERSUBSCRIBED_TWELVE: SolveItem[] = [
  ...Array.from({ length: 7 }, (_, i) =>
    item(`packed-${i + 1}`, "30-45", ["30-45"]),
  ),
  ...Array.from({ length: 3 }, (_, i) =>
    item(`mid-${i + 1}`, "20-30", ["20-30"]),
  ),
  ...Array.from({ length: 2 }, (_, i) =>
    item(`long-${i + 1}`, "45-60", ["45-60"]),
  ),
];

describe("staying put", () => {
  it("leaves a workout in the band it is already in when the seats are interchangeable", () => {
    // Two seats, two workouts, either could take either — so both possible
    // assignments are max-flow and the only thing separating them is churn.
    // `already-mid` is FIRST, so a solver with no stay preference would take
    // the <20 seat with it and move both.
    const items: SolveItem[] = [
      item("already-mid", "20-30", ["<20", "20-30"]),
      item("already-short", "<20", ["<20", "20-30"]),
      ...Array.from({ length: 3 }, (_, i) =>
        item(`long-${i + 1}`, "30-45", ["30-45"]),
      ),
    ];
    const s = solveType(items, grid(1, 1, 3, 0, 0));
    expect(s.deviation).toBe(0);
    expect(s.moves).toBe(0);
    expect(s.assigned.get("already-short")).toBe("<20");
    expect(s.assigned.get("already-mid")).toBe("20-30");
  });
});

describe("bookCell (§6's translation rule)", () => {
  it("consults the cell the duration occupied BEFORE the strip", () => {
    // §6, verbatim: "a retuned 27' workout that was 32' with its warm-up
    // obeys the 30-45 cell's ranges, not 20-30's."
    expect(bookCell("O2", 27, 5)).toBe("O2|30-45");
    // Same 27', no warm-up on the record: the lower cell, and the difference
    // is the whole rule.
    expect(bookCell("O2", 27, 0)).toBe("O2|20-30");
    // Band edges stay lower-inclusive, matching library-balance.ts's band().
    expect(bookCell("AN", 10, 10)).toBe("AN|20-30");
  });
});

describe("the ±2 clamp is the thing that forces a replacement", () => {
  const draft = grid(2, 3, 4, 3, 0);

  it("leaves exactly one residual at ±2", () => {
    const s = solveType(OVERSUBSCRIBED_TWELVE, draft);
    expect(s.grid["30-45"]).toBe(6);
    expect(s.adjustments["30-45"]).toBe(2);
    expect(s.replaced).toHaveLength(1);
    expect(s.replaced[0]).toMatch(/^packed-/);
    // A cell is never overfilled, and the seats the assignment leaves empty
    // are exactly the replacements the phase has to generate.
    const counts = cellCounts(s.assigned);
    let empty = 0;
    for (const b of BANDS) {
      expect(counts[b]).toBeLessThanOrEqual(s.grid[b]);
      empty += s.grid[b] - counts[b];
    }
    expect(empty).toBe(s.replaced.length);
    expect(counts["30-45"]).toBe(6);
  });

  it("and that residual disappears the moment the clamp widens to 3", () => {
    const s = solveType(OVERSUBSCRIBED_TWELVE, draft, { maxAdjust: 3 });
    expect(s.grid["30-45"]).toBe(7);
    expect(s.replaced).toStrictEqual([]);
  });

  it("Hall's condition names the same shortfall before the solve runs", () => {
    const h = hallDeficit(OVERSUBSCRIBED_TWELVE, grid(2, 3, 4, 3, 0));
    // Nothing can reach <20, so {<20} alone is short 2; the binding cut is
    // whichever subset maximises demand minus supply.
    expect(h.short).toBeGreaterThan(0);
    expect(h.demand - h.supply).toBe(h.short);
  });
});

describe("the anchor preference", () => {
  const anchoredDraft = grid(1, 1, 3, 0, 0);

  it("keeps the anchor rather than a workout that arrives first", () => {
    // Both reach only <20 and only one seat exists. Without the preference
    // the solve would keep `filler` — it is first in the array and costs the
    // same — and Sea Fret's 16 driver.test.ts assertions would be rewritten.
    const items: SolveItem[] = [
      item("filler", "<20", ["<20"]),
      item("Sea Fret", "<20", ["<20"], true),
      ...Array.from({ length: 3 }, (_, i) =>
        item(`long-${i + 1}`, "30-45", ["30-45"]),
      ),
      item("mid", "20-30", ["20-30"]),
    ];
    const s = solveType(items, anchoredDraft);
    expect(s.assigned.get("Sea Fret")).toBe("<20");
    expect(s.replaced).toStrictEqual(["filler"]);
    expect(s.anchorsDisplaced).toStrictEqual([]);
  });

  it("moves the OTHER one when two equally-placeable workouts share a seat", () => {
    // Both sit in <20 today and both could take either seat, so the two
    // assignments cost the same one move. The anchor's move penalty is the
    // only thing that decides it — and it must decide it Sea Fret's way.
    const items: SolveItem[] = [
      // `rival` deliberately arrives FIRST: nothing but the anchor's move
      // penalty distinguishes the two assignments, so a solver that broke
      // the tie by array order would move Sea Fret and pass everything else.
      item("rival", "<20", ["<20", "20-30"]),
      item("Sea Fret", "<20", ["<20", "20-30"], true),
      ...Array.from({ length: 3 }, (_, i) =>
        item(`long-${i + 1}`, "30-45", ["30-45"]),
      ),
    ];
    const s = solveType(items, grid(1, 1, 3, 0, 0));
    expect(s.deviation).toBe(0);
    expect(s.moves).toBe(1);
    expect(s.assigned.get("Sea Fret")).toBe("<20");
    expect(s.assigned.get("rival")).toBe("20-30");
    expect(s.anchorsDisplaced).toStrictEqual([]);
  });

  it("spends a ±2 adjustment to keep the anchor rather than displace it", () => {
    // At the draft, <20 seats one and `stuck` can be seated nowhere else, so
    // the draft displaces the anchor. Widening <20 by one keeps both. The
    // anchor outranks staying close to the draft — that ordering is the
    // thing under test, and it is James's to veto.
    const items: SolveItem[] = [
      item("Sea Fret", "<20", ["<20", "20-30"], true),
      item("stuck", "20-30", ["<20"]),
      ...Array.from({ length: 3 }, (_, i) =>
        item(`long-${i + 1}`, "30-45", ["30-45"]),
      ),
    ];
    const s = solveType(items, grid(1, 1, 3, 0, 0));
    expect(s.replaced).toStrictEqual([]);
    expect(s.assigned.get("Sea Fret")).toBe("<20");
    expect(s.assigned.get("stuck")).toBe("<20");
    expect(s.grid["<20"]).toBe(2);
    expect(s.deviation).toBe(2);
    expect(s.anchorsDisplaced).toStrictEqual([]);
  });

  it("yields when keeping the anchor in place would cost a replacement", () => {
    // Three workouts can be seated NOWHERE but <20, and the draft's <20 is 1
    // — so even the full +2 only buys three seats. Put the anchor in one of
    // them and a stuck workout is replaced. The preference is a preference:
    // feasibility outranks it, and the solve moves Sea Fret to 20-30.
    const items: SolveItem[] = [
      item("Sea Fret", "<20", ["<20", "20-30"], true),
      ...Array.from({ length: 3 }, (_, i) =>
        item(`stuck-${i + 1}`, "<20", ["<20"]),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        item(`mid-${i + 1}`, "20-30", ["20-30"]),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        item(`long-${i + 1}`, "30-45", ["30-45"]),
      ),
    ];
    const s = solveType(items, grid(1, 4, 6, 0, 0));
    expect(s.replaced).toStrictEqual([]);
    expect(s.grid["<20"]).toBe(3);
    expect(s.assigned.get("stuck-1")).toBe("<20");
    expect(s.assigned.get("stuck-3")).toBe("<20");
    expect(s.assigned.get("Sea Fret")).toBe("20-30");
    expect(s.anchorsDisplaced).toStrictEqual(["Sea Fret"]);
  });

  it("names the two titles the spec's blast-radius note names", () => {
    expect([...ANCHOR_TITLES].sort()).toStrictEqual(["Beam Sea", "Sea Fret"]);
    for (const title of ANCHOR_TITLES) {
      expect(LIBRARY_WORKOUTS.some((w) => w.title === title)).toBe(true);
    }
  });
});

describe("assignToGrid", () => {
  it("never seats a workout in a band it cannot reach, and never overfills a cell", () => {
    const { assigned, replaced } = assignToGrid(
      OVERSUBSCRIBED_TWELVE,
      grid(0, 3, 6, 2, 1),
    );
    const seated = OVERSUBSCRIBED_TWELVE.filter((w) => assigned.has(w.id));
    for (const w of seated) expect(w.reach).toContain(assigned.get(w.id));
    const counts = cellCounts(assigned);
    for (const b of BANDS) {
      expect(counts[b]).toBeLessThanOrEqual(grid(0, 3, 6, 2, 1)[b]);
    }
    expect(assigned.size + replaced.length).toBe(12);
  });
});

describe("targetTotal", () => {
  it("aims at the reachable total closest to today, not at the band's edge", () => {
    const r = reachable([work(40)], BASELINES);
    expect(targetTotal(r, "30-45")).toBe(40);
    expect(targetTotal(r, "45-60")).toBe(45);
    expect(targetTotal(r, "60+")).toBeNull();
  });
});

describe("buildSketch", () => {
  it("builds a legal, re-measured retune for a real seed workout", () => {
    // Realistic fixture: a real library row, stretched into the band the
    // solve would assign it, and checked rather than described.
    const haar = LIBRARY_WORKOUTS.find((w) => w.title === "Haar")!;
    const sketch = buildSketch(haar, "20-30", 6, BASELINES)!;
    expect(sketch).not.toBeNull();
    expect(sketch.issues).toStrictEqual([]);
    expect(sketch.minutes).toBe(20);
    expect(sketch.arm).toBe("scale");
    // spm and pace refs are the workout's identity: untouched.
    const spm = (steps: readonly Step[]): (number | undefined)[] =>
      steps.filter((s) => s.k === "w").map((s) => s.spm);
    expect(spm(sketch.steps)).toStrictEqual(spm(haar.steps));
  });

  it("returns null when the band is out of reach", () => {
    const seaFret = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret")!;
    expect(buildSketch(seaFret, "45-60", 5, BASELINES)).toBeNull();
  });

  it("keeps every sketch the real solve needs inside the hard gates", () => {
    // The gates that cannot be argued with in a review table:
    // `validateWorkoutInput`, the assigned band, and the 0/5 total. §6 book
    // ranges are review-table rows and are reported separately by the CLI.
    const hard = /validate|lands in|not 0\/5|outside the ±25%|archetype/;
    for (const title of ["Millpond", "Haar", "Diamond Dust", "Afterglow"]) {
      const w = LIBRARY_WORKOUTS.find((x) => x.title === title)!;
      const to: Band = reachableBands(reachable(w.steps, BASELINES)).at(-1)!;
      const sketch = buildSketch(w, to, 5, BASELINES)!;
      expect(sketch).not.toBeNull();
      expect([
        title,
        ...sketch.issues.filter((i) => hard.test(i)),
      ]).toStrictEqual([title]);
    }
  });
});

describe("DRAFT_GRID", () => {
  it("is §2's table, and every row sums to its type's fixed total", () => {
    expect(DRAFT_GRID.O2).toStrictEqual(grid(4, 14, 34, 18, 20));
    expect(DRAFT_GRID.AT).toStrictEqual(grid(6, 20, 32, 12, 5));
    expect(DRAFT_GRID.TR).toStrictEqual(grid(10, 22, 30, 9, 4));
    expect(DRAFT_GRID.AN).toStrictEqual(grid(12, 16, 20, 8, 4));
    const sums = { O2: 90, AT: 75, TR: 75, AN: 60 };
    for (const [type, row] of Object.entries(DRAFT_GRID)) {
      expect({
        type,
        sum: BANDS.reduce((a, b) => a + row[b], 0),
      }).toStrictEqual({ type, sum: sums[type as keyof typeof sums] });
    }
  });
});

// ---------------------------------------------------------------------
// PHASE TRIPWIRES (block review M4)
// ---------------------------------------------------------------------
// Both tests below were tied to TODAY's (pre-content) seed content,
// deliberately, to catch the solver and the committed grid drifting apart
// before any retune landed. WHEN TASK 3/4 CONTENT LANDS THESE FIRE — that
// is the signal, not a regression, per this block's own original comment.
//
// Task 3 (2026-08-10 library-rebalance) landed O2 and AT. Re-running the
// solver over O2's now-current content no longer reproduces the grid it
// produced against the PRE-retune library (`<20`/`60+` off by one each) —
// expected: retuning moves workouts INTO their target band, which changes
// their `current`/`reach` inputs to the solve. That identity was only ever
// a PROXY for "the library doesn't yet match its target"; once a type's
// content lands, measuring the library itself against the target IS the
// exit condition (§8), so O2 is replaced below with that direct measure
// (which now holds). AT's solved grid still happens to reproduce the
// committed one even after its retune, so it stays on the original
// solver-parity check.
//
// Task 4 (2026-08-10 library-rebalance) landed TR and AN. AN's solved grid
// still reproduces the committed one (verified, not assumed — the same
// re-run below), so it stays on the solver-parity check too. TR's does
// NOT: re-solving from TR's now-current content (16 retunes + 3
// replacements, including two brand-new workouts — Beam Reach, Following
// Seas, Tidal Race — the solver's original 2026-08-10 run never saw) picks
// a slightly different optimal assignment (20-30:22/30-45:30 vs the
// committed 23/29) even though the ACTUAL library measures exactly onto
// the committed grid (verified directly below) — the solver is a proxy
// for "does this content admit a perfect assignment", not a claim that
// ANY particular workout must sit in ANY particular cell, and TR's fresh
// content (new workouts, a rounding-licensed replacement) simply admits
// more than one optimum. TR moves to O2's direct-measure form for the
// same reason O2 did in Task 3: once a type's content lands, measuring
// the library itself against the target IS the exit condition (§8).
describe("phase tripwires", () => {
  it.each(["O2", "TR"] as const)(
    "%s (content landed) now measures exactly onto its target — the real §8 exit condition, not the solver proxy",
    (type) => {
      const stats = LIBRARY_WORKOUTS.filter((w) => w.type === type).map(
        (w) => ({
          type: w.type,
          minutes: estimateMinutes(w.steps, BASELINES).minutes,
        }),
      );
      const counts = bucket(stats);
      for (const b of BANDS) {
        const key = `${type}|${b}`;
        expect({ key, n: counts[key] ?? 0 }).toStrictEqual({
          key,
          n: patterns.targets[type][b],
        });
      }
    },
  );

  it("AT/AN's committed targets are still the grid this solver produces", () => {
    const solved = solveLibrary(
      libraryItems().map((r) => r.item),
      DRAFT_GRID,
    );
    for (const type of ["AT", "AN"] as const) {
      expect({ type, grid: solved[type].grid }).toStrictEqual({
        type,
        grid: patterns.targets[type],
      });
    }
  });

  // "the adversarial review's published numbers still replay" (crossers
  // 144 / unreachable 40 / deficits {O2:3, AT:4, TR:6, AN:8}) is RETIRED
  // here, not re-pinned to a new number. `reviewReplay()` measures
  // `estimateMinutes` over LIVE `LIBRARY_WORKOUTS` content — a whole-
  // library aggregate, not a per-type one — so it was always going to
  // move the instant ANY workout's content changed, the same way a
  // workout stops being a "crosser" once it actually reaches its assigned
  // band. It served its purpose: a one-time faithfulness check, verified
  // in Task 1 against the then-untouched library, that the solve's
  // arithmetic matched the adversarial review's own instrument (the
  // numbers above are reproduced and cited in the committed move plan,
  // docs/superpowers/specs/2026-08-10-library-rebalance-move-plan.md,
  // "Method, and its reconciliation with the adversarial review"). Content
  // landing is exactly the point past which re-pinning a new frozen number
  // here would just be a second stale tripwire waiting to fire again for
  // Task 4.
});

describe("the real clock (block review M2)", () => {
  it("rawMinutes is the unrounded total estimateMinutes rounds", () => {
    // 3 × 250 m at 2k+0 = 3 × 56 s = 2:48, which estimateMinutes calls 3'.
    const steps: Step[] = [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: 0 },
        spm: 26,
      },
    ];
    expect(rawMinutes(steps, BASELINES)).toBeCloseTo(2.8, 6);
    expect(fmtClock(rawMinutes(steps, BASELINES))).toBe("2:48");
    expect(fmtClock(30)).toBe("30'");
  });

  it("refuses a sketch that only reaches its band after rounding", () => {
    // TR Head Sea: 15:48 on the clock, 16' rounded. The solve may assign it
    // to 20-30 on the rounded clock, but +25% of 15:48 is 19:45 and no
    // sketch can be built — it belongs in the replacement residual. This
    // is the EXACT phenomenon that forced Head Sea out of the library (the
    // 2026-08-10 library-rebalance's James addendum, Gate 1) — Task 4
    // replaced it with "Following Seas", so its steps are frozen here as a
    // literal fixture (no longer reachable via LIBRARY_WORKOUTS) rather
    // than lost along with the row.
    const headSea: WorkoutInput = {
      title: "Head Sea",
      type: "TR",
      difficulty: "medium",
      pain: 3,
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 4 },
          ref: { base: "2k", off: 3 },
          spm: 24,
          restMinutes: 3,
        },
        {
          k: "w",
          duration: { kind: "distance", meters: 1000 },
          ref: { base: "2k", off: 2 },
          spm: 26,
          restMinutes: 3,
        },
        {
          k: "w",
          duration: { kind: "time", minutes: 2 },
          ref: { base: "2k", off: 1 },
          spm: 28,
        },
      ],
    };
    expect(rawMinutes(headSea.steps, BASELINES)).toBeLessThan(16);
    expect(buildSketch(headSea, "20-30", 5, BASELINES)).toBeNull();
  });

  it("every sketch it does build lands on a 0/5 minute of REAL time", () => {
    const cirrus = LIBRARY_WORKOUTS.find((w) => w.title === "Cirrus")!;
    const sketch = buildSketch(cirrus, "45-60", 5, BASELINES)!;
    expect(sketch).not.toBeNull();
    expect(sketch.raw).toBe(45);
    expect(sketch.raw % 5).toBeCloseTo(0, 9);
    // Its one flag is a book-range observation on the destination cell that
    // the sketch inherits without touching (reps 5 vs O2|45-60's 2–3), not a
    // house-rule breach.
    expect(
      sketch.issues.filter((i) => !i.includes("(inherited)")),
    ).toStrictEqual([]);
  });
});

describe("shape preservation (block review C1)", () => {
  it("keeps a pyramid a pyramid, with its peak where it was", () => {
    // AN Downburst: 45/60/90/60/45 s all out. The old builder made it
    // 1 / 1.5 / 1.4167 / 1.5 / 1 — the middle rung stopped being the peak.
    const downburst = LIBRARY_WORKOUTS.find((w) => w.title === "Downburst")!;
    const sketch = buildSketch(downburst, "20-30", 6, BASELINES)!;
    expect(sketch).not.toBeNull();
    expect(classifyArchetype(sketch.steps).archetype).toBe("pyramid");
    const lengths = sketch.steps
      .filter((s) => s.k === "w")
      .map((s) => (s.duration.kind === "time" ? s.duration.minutes : 0));
    const peak = lengths.indexOf(Math.max(...lengths));
    expect(peak).toBe(2);
    expect(lengths[0]).toBe(lengths[4]);
    expect(lengths[1]).toBe(lengths[3]);
  });

  it("keeps a uniform block uniform, and never shrinks a piece inside a stretch", () => {
    // AT Confluence Zone: a flat 6× 2'. The old builder opened it with a
    // 1:40 piece — shorter than before — in a workout being stretched.
    const cz = LIBRARY_WORKOUTS.find((w) => w.title === "Confluence Zone")!;
    const sketch = buildSketch(cz, "20-30", 6, BASELINES)!;
    expect(sketch).not.toBeNull();
    expect(classifyArchetype(sketch.steps).archetype).toBe("nxtime");
    const factors = pieceFactors(cz.steps, sketch.steps);
    expect(new Set(factors).size).toBe(1);
    expect(Math.min(...factors)).toBeGreaterThanOrEqual(1);
  });

  it("keeps a uniform distance set uniform", () => {
    // TR Gulf Stream: 8× 500 m. The old builder made one piece 750 m.
    const gs = LIBRARY_WORKOUTS.find((w) => w.title === "Gulf Stream")!;
    const sketch = buildSketch(gs, "30-45", 5, BASELINES)!;
    expect(sketch).not.toBeNull();
    const metres = sketch.steps
      .filter((s) => s.k === "w")
      .map((s) => (s.duration.kind === "distance" ? s.duration.meters : 0));
    expect(new Set(metres).size).toBe(1);
  });

  it("reports the per-piece factors it actually applied, not one nominal number", () => {
    const cz = LIBRARY_WORKOUTS.find((w) => w.title === "Confluence Zone")!;
    const sketch = buildSketch(cz, "20-30", 6, BASELINES)!;
    const [lo, hi] = sketch.pieceFactorRange;
    expect(lo).toBeLessThanOrEqual(hi);
    expect(
      pieceFactors(cz.steps, sketch.steps).every((f) => f >= lo && f <= hi),
    ).toBe(true);
  });
});

describe("describeSteps (block review M1)", () => {
  it("keeps a lead piece OUT of the repeated block", () => {
    // AT Gap Wind: a 12' lead then 3× 3:30. The old renderer swept the lead
    // into the block and printed a 39' workout in the artifact James signs.
    // (Retuned in Task 3, 2026-08-10 library-rebalance: 10'/3' -> 12'/3:30
    // to reach its new 30-45 band — the lead/block SHAPE this test guards
    // is unchanged, only its numbers moved with it.)
    const gapWind = LIBRARY_WORKOUTS.find((w) => w.title === "Gap Wind")!;
    const rendered = describeSteps(gapWind.steps);
    expect(rendered).toBe(
      "12' @6k+3 spm24 r3:45 + 3× [3:30 @6k-2 spm26 r1:15]",
    );
    expect(rendered.startsWith("3×")).toBe(false);
  });

  it("still wraps a bare repeated block, and renders a flat workout unwrapped", () => {
    const seaFret = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret")!;
    expect(describeSteps(seaFret.steps)).toBe("2× [4' @6k+12 spm22 r1']");
    const haar = LIBRARY_WORKOUTS.find((w) => w.title === "Haar")!;
    expect(describeSteps(haar.steps)).not.toContain("×");
  });

  it("renders seconds, because 29:45 is not 30 minutes", () => {
    expect(describeSteps([work(4.25)])).toContain("4:15");
  });
});

describe("the §6 fallback (block review M5)", () => {
  it("borrows the nearest populated band when this cell saw no observation", () => {
    // O2|20-30's book row carries no `repsCount` observation at all — the
    // exact case §6's dash rule governs ("fall back to the nearest populated
    // band of the same type"), and it was implemented nowhere. A flag that
    // borrows a range has to name where the range came from.
    //
    // Fixture note (Task 3, 2026-08-10 library-rebalance): this used to run
    // on Ground Swell, but Ground Swell's own content was RETUNED this
    // task (and then rest-grid- and created-value-corrected), which moved
    // where its fresh sketch into 20-30 lands (`minutes` 20 -> 25) and so
    // which book cell `bookCell()` computes (O2|20-30, no reps observation
    // -> O2|30-45, which HAS one directly) — the fallback this test exists
    // to prove no longer fires for that fixture. Slack Tide is untouched by
    // this task's retunes and reproduces the same fallback shape.
    const slackTide = LIBRARY_WORKOUTS.find((w) => w.title === "Slack Tide")!;
    const sketch = buildSketch(slackTide, "20-30", 8, BASELINES)!;
    expect(sketch).not.toBeNull();
    const borrowed = sketch.issues.filter((i) => i.includes("§6 fallback"));
    expect(borrowed).toStrictEqual([
      "reps 5 outside the cell's 2–4 [O2|30-45, §6 fallback] (inherited)",
    ]);
  });

  it("says nothing about an axis the book never observed anywhere in the type", () => {
    // The fallback walks outward and stops; it never invents a range.
    const seaFret = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret")!;
    const sketch = buildSketch(seaFret, "<20", 5, BASELINES);
    expect(sketch?.issues.some((i) => i.includes("undefined"))).toBe(false);
  });
});

// ---------------------------------------------------------------------
// The two predicates the sketch search is BUILT on, tested directly.
// The search only ever offers them candidates a uniform scale produced, so
// exercising them through `buildSketch` cannot reach their failing arms —
// and a guard whose failing arm no test reaches is a guard that can be
// deleted without anyone noticing. These are the arms.
// ---------------------------------------------------------------------
describe("shapeIssues", () => {
  const flat = [work(4), work(4), work(4)];

  it("passes a uniform stretch of a uniform block", () => {
    expect(
      shapeIssues(flat, [work(5), work(5), work(5)], true, BASELINES),
    ).toStrictEqual([]);
  });

  it("catches an archetype change", () => {
    const pyramid = [work(2), work(4), work(2)];
    const wrecked = [work(3), work(4), work(5)];
    expect(shapeIssues(pyramid, wrecked, true, BASELINES).join("; ")).toContain(
      "archetype pyramid → ladder",
    );
  });

  it("catches a shape change the archetype label survives", () => {
    // Both are ladders. One climbs, the other falls. Same label, opposite
    // workout — this is the arm that only the shape string can see.
    const up = [work(2), work(4)];
    const down = [work(4), work(2)];
    expect(shapeIssues(up, down, true, BASELINES).join("; ")).toContain(
      "piece-to-piece shape changed",
    );
  });

  it("catches a piece moving against the tide", () => {
    // Both ascending ladders, both signing "+", but the opening piece
    // SHRANK inside a stretch — the exact thing the block review found in
    // AT Confluence Zone.
    const before = [work(2), work(4)];
    const after = [work(1), work(6)];
    expect(shapeIssues(before, after, true, BASELINES).join("; ")).toContain(
      "against the tide",
    );
  });

  it("catches the recovery being scaled out of the same ratio family", () => {
    const before = [work(5, 5), work(5)];
    const after = [work(5, 0.5), work(5)];
    expect(shapeIssues(before, after, true, BASELINES).join("; ")).toContain(
      "work:rest left its family",
    );
    // …and tolerates a drift inside it.
    const nudged = [work(5, 5 * (1 + RATIO_FAMILY / 2)), work(5)];
    expect(shapeIssues(before, nudged, true, BASELINES)).toStrictEqual([]);
  });

  it("catches a recovery appearing where there was none", () => {
    expect(
      shapeIssues(
        [work(5), work(5)],
        [work(5, 2), work(5)],
        true,
        BASELINES,
      ).join("; "),
    ).toContain("recovery appeared or vanished");
  });

  it("lets the one-rep arm add a cycle without calling it a shape change", () => {
    const before: Step[] = [{ k: "reps", count: 2 }, work(5, 1)];
    const after: Step[] = [{ k: "reps", count: 3 }, work(5, 1)];
    expect(
      shapeIssues(before, after, true, BASELINES, "one-rep"),
    ).toStrictEqual([]);
    // The same pair judged as a scaling sketch IS a shape change.
    expect(
      shapeIssues(before, after, true, BASELINES, "scale").join("; "),
    ).toContain("piece-to-piece shape changed");
  });
});

describe("landsLegally", () => {
  // 4 × [4' + 1'] = 20' exactly; window [15, 25].
  const r = reachable(
    [{ k: "reps", count: 4 }, work(4, 1)] as Step[],
    BASELINES,
  );

  it("holds a time-computable total to an EXACT 0/5 minute of real time", () => {
    expect(landsLegally(20, "20-30", r, false)).toBe(true);
    // 20:15. Rounds to 20', which is what the old check saw and accepted.
    expect(landsLegally(20.25, "20-30", r, false)).toBe(false);
    expect(landsLegally(22, "20-30", r, false)).toBe(false);
  });

  it("bands on the real clock, not on the rounded minute", () => {
    // 19:45 rounds to 20' and is NOT in 20-30.
    expect(landsLegally(19.75, "20-30", r, false)).toBe(false);
    expect(landsLegally(19.75, "<20", r, false)).toBe(false); // not 0/5
    expect(landsLegally(19.75, "<20", r, true)).toBe(true); // exempt
    expect(landsLegally(15, "<20", r, false)).toBe(true);
  });

  it("refuses anything outside the ±25% window", () => {
    // The window is [15, 25]: 25 is the last legal total, 30 is past it and
    // 10 is under the floor.
    expect(landsLegally(25, "20-30", r, false)).toBe(true);
    expect(landsLegally(30, "30-45", r, false)).toBe(false);
    expect(landsLegally(10, "<20", r, false)).toBe(false);
  });

  it("exempts a distance-involved workout from the 0/5 rule, not from the band", () => {
    expect(landsLegally(20.25, "20-30", r, true)).toBe(true);
    expect(landsLegally(19.75, "20-30", r, true)).toBe(false);
  });
});
