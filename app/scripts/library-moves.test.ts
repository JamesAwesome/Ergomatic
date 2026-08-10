import { describe, it, expect } from "vitest";
import type { Step } from "../domain/types.js";
import { LIBRARY_WORKOUTS } from "../server/seed/library/index.js";
import { BANDS, BASELINES, type Band } from "./library-balance.js";
import {
  ANCHOR_TITLES,
  assignToGrid,
  bookCell,
  buildSketch,
  candidateGrids,
  DRAFT_GRID,
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
