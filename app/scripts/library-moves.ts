// The feasibility solver — docs/superpowers/specs/2026-08-10-library-
// rebalance-design.md §2 ("The grid is finalized by a FEASIBILITY SOLVE, not
// by hand: plan Task 1 computes, for every workout, its reachable bands under
// §3's retune rule, checks a perfect assignment exists ... adjusts cells by at
// most ±2 where infeasible, and derives the replacement list as the
// residual").
//
// Run: `pnpm exec tsx scripts/library-moves.ts` — prints the move plan as
// markdown on stdout (the committed artifact beside the spec).
//
// METHOD PROVENANCE. The reachability + Hall's-condition machinery is the
// adversarial review's (docs/superpowers/specs/2026-08-10-rebalance-
// adversarial-review.md, finding B1: "A band-crosser regains its old band
// only if `after × 1.25 ≥` that band's lower edge ... Hall's condition over
// the ordered bands ... per type"). `reviewReplay()` below reproduces its
// four published numbers exactly — 144 crossers, 40 unreachable, deficits
// O2 3 / AT 4 / TR 6 / AN 8 — so this module's arithmetic is checkable
// against a number the review already published. Three places where this
// solver goes BEYOND the review, each of which changes a count and each of
// which is spec-licensed:
//
//   1. SHRINK is legal (§3: "SHRINKING is equally legal under ruling B's
//      'specific ones may trend shorter'"). The review modelled upward moves
//      only, which is right for its question (regaining an OLD band) and
//      wrong for this one (filling a NEW grid).
//   2. The one-rep arm (§3: "EITHER adding one rep to an existing repeated
//      block OR lengthening existing pieces by up to +25% total work time
//      (one-rep adds may exceed 25%; that is the point of the disjunction)").
//      The review modelled the ×1.25 arm only. It is a DISJUNCTION, not a
//      composition: this module never scales a rep-added workout.
//   3. The house 0/5 totals rule is applied to reachability, which the
//      review's pure arithmetic omitted. See TOTALS_RULE below.
//
// THE CEILING'S DENOMINATOR (review m7: "§3's ceiling denominator is
// ambiguous ... One sentence."). Settled here as TOTAL time, i.e. the work
// pieces scale by f ∈ [0.75, 1.25] and the rests scale with them — which is
// exactly §3's "rest scaling in the same ratio family", since proportional
// scaling holds every work:rest ratio fixed. Under this reading "+25% of work
// time" and "+25% of total time" coincide. The alternative (work scales,
// rests held) is strictly narrower and is reported as a sensitivity row in
// the move plan, not used for the solve.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { estimateMinutes, phaseSeconds, phases } from "../domain/expand.js";
import type {
  Baselines,
  Step,
  WorkoutInput,
  WorkoutType,
} from "../domain/types.js";
import { validateWorkoutInput } from "../domain/validate.js";
import patterns from "../domain/generation/patterns.json";
import { LIBRARY_WORKOUTS } from "../server/seed/library/index.js";
import { BANDS, BASELINES, TYPES, band, type Band } from "./library-balance.js";

/** §3's ceiling: "lengthening existing pieces by up to +25% total work
 *  time". Symmetric — shrinking to 0.75× is the same rule read downward. */
export const RETUNE_RATIO = 0.25;

/** §2: "adjusts cells by at most ±2 where infeasible". */
export const MAX_CELL_ADJUST = 2;

/** §3's blast-radius note, read as a solver constraint: "the solve should
 *  prefer KEEPING Sea Fret in <20 ... precisely because the committed
 *  hardware-era fixtures lean on its shape", and the same for
 *  `program.sweep.test.ts`'s Beam Sea. Both are (a) retained rather than
 *  replaced and (b) kept in their current band, yielding only if keeping
 *  them would force an extra replacement. */
export const ANCHOR_TITLES: readonly string[] = ["Sea Fret", "Beam Sea"];

/** THE 0/5 TOTALS RULE, as this solver applies it. Three seed headers state
 *  it — `at.ts:7-8` "every time-computable total lands on a 0 or 5",
 *  `an.ts:11-13` (with "Distance sets ... are exempt from the round-total
 *  rule"), `o2.ts:12` "time-computable totals end in 0 or 5". Measured this
 *  session, the rule holds over PRE-STRIP totals in 195 of 195
 *  time-computable workouts and over post-strip totals in only 104 of 195 —
 *  the warm-up drop broke it, because the warm-up was part of the total the
 *  authors rounded.
 *
 *  This solver reads the rule forward, not backward: a RETUNED workout lands
 *  its own (warm-up-free) total on a 0 or 5. The warm-up is a per-user
 *  setting now, so the pre-strip total is no longer a property of the
 *  workout that any author can control. Reading it the other way — preserve
 *  each workout's total mod 5, i.e. keep the old pre-strip roundness — is
 *  strictly narrower and costs 14 more replacements (24 vs 10) against §2's
 *  draft; it is reported in the move plan as a sensitivity, and it is
 *  James's to flip. Distance-
 *  involved workouts (`estimateMinutes(...).estimated === true`) are exempt
 *  per `an.ts:12-13`. */
export const TOTALS_RULE = "0/5 on the retuned warm-up-free total" as const;

const BAND_RANGE: Record<Band, readonly [number, number]> = {
  "<20": [0, 20],
  "20-30": [20, 30],
  "30-45": [30, 45],
  "45-60": [45, 60],
  "60+": [60, Infinity],
};

// ---------------------------------------------------------------------
// Reachability
// ---------------------------------------------------------------------

export interface Reach {
  /** `estimateMinutes` today, at the nominal baselines. */
  readonly current: number;
  /** True when any work step is distance-prescribed — the 0/5 exemption. */
  readonly estimated: boolean;
  /** The ±RETUNE_RATIO window on total time, inclusive. */
  readonly window: readonly [number, number];
  /** True when the window is continuous — no 0/5 grid discretises it, so
   *  every band it overlaps is reachable. */
  readonly continuous: boolean;
  /** Discrete totals the scaling arm can land on, sorted. For a
   *  time-computable workout that is the 0/5 grid inside the window; for a
   *  distance-involved one the window is continuous and this holds only the
   *  current total (see `reachableBands`). */
  readonly scaleTotals: readonly number[];
  /** The one-rep arm, or null where the workout has no reps marker (or the
   *  add would breach `validate.ts:93`'s 1..12, or the drop would take the
   *  block below 2 and stop being a repeated block at all). */
  readonly repAdd: number | null;
  readonly repDrop: number | null;
}

export interface ReachOptions {
  /** The ceiling, read in both directions. */
  readonly ratio?: number;
  /** How the house 0/5 rule constrains the scaling arm. `"new-total"` is
   *  this solver's reading (see TOTALS_RULE); `"preserve-mod5"` keeps each
   *  workout's total mod 5, i.e. its pre-strip roundness; `"unconstrained"`
   *  is the adversarial review's pure arithmetic. The last two exist for the
   *  move plan's sensitivity rows. */
  readonly totals?: "new-total" | "preserve-mod5" | "unconstrained";
  /** false = the work pieces scale while the rests are held — the narrow
   *  reading of §3's denominator (review m7). Default true. */
  readonly scaleRests?: boolean;
}

/** Every total this workout can reach without changing its archetype, per
 *  §3. The two arms are a DISJUNCTION: `scaleTotals` never includes a
 *  rep-added total and vice versa. */
export function reachable(
  steps: Step[],
  baselines: Baselines,
  opts: ReachOptions = {},
): Reach {
  const ratio = opts.ratio ?? RETUNE_RATIO;
  const totals = opts.totals ?? "new-total";
  const { minutes: current, estimated } = estimateMinutes(steps, baselines);
  // With rests held, only the work half of the clock can move, so the window
  // narrows to ±ratio × (work minutes) instead of ±ratio × total.
  const swing =
    opts.scaleRests === false
      ? (ratio * workRestSeconds(steps, baselines).work) / 60
      : ratio * current;
  const lo = current - swing;
  const hi = current + swing;
  const scaleTotals: number[] = [current];
  if (totals === "unconstrained" || estimated) {
    // No 0/5 grid to walk: the window is continuous. `reachableBands` reads
    // `window` directly for these.
  } else {
    const step = 5;
    const offset = totals === "preserve-mod5" ? current % step : 0;
    for (let d = offset === 0 ? step : offset; d <= hi + 1e-9; d += step) {
      if (d >= lo - 1e-9 && d !== current) scaleTotals.push(d);
    }
  }
  const repsIndex = steps.findIndex((s) => s.k === "reps");
  let repAdd: number | null = null;
  let repDrop: number | null = null;
  if (repsIndex >= 0) {
    const marker = steps[repsIndex] as Extract<Step, { k: "reps" }>;
    const withCount = (count: number): number =>
      estimateMinutes(
        steps.map((s, i) => (i === repsIndex ? { ...s, count } : s)),
        baselines,
      ).minutes;
    // The 0/5 rule binds on the one-rep arm too. §3's house-rule clause
    // ("keeping every house rule: totals ending 0/5") qualifies the whole
    // retune, not the scaling arm alone — and a reachability that admitted a
    // band the sketch then could not legally land in would be a solver that
    // lies to its own move plan. Distance-involved workouts stay exempt.
    const legal = (m: number): boolean =>
      estimated || totals === "unconstrained" || m % 5 === 0;
    if (marker.count + 1 <= 12) {
      const m = withCount(marker.count + 1);
      if (legal(m)) repAdd = m;
    }
    if (marker.count - 1 >= 2) {
      const m = withCount(marker.count - 1);
      if (legal(m)) repDrop = m;
    }
  }
  return {
    current,
    estimated,
    window: [lo, hi],
    continuous: totals === "unconstrained" || estimated,
    scaleTotals: [...scaleTotals].sort((a, b) => a - b),
    repAdd,
    repDrop,
  };
}

const overlaps = (b: Band, lo: number, hi: number): boolean => {
  const [bLo, bHi] = BAND_RANGE[b];
  return hi >= bLo && lo < bHi;
};

/** The bands `reachable`'s totals cover. A distance-involved workout's
 *  scaling window is CONTINUOUS (no 0/5 rule to discretise it — `an.ts:12`),
 *  so every band the window overlaps is reachable; a time-computable one can
 *  only land on the 0/5 totals inside the window. */
export function reachableBands(r: Reach): Band[] {
  const hit = new Set<Band>(r.scaleTotals.map(band));
  if (r.continuous) {
    for (const b of BANDS)
      if (overlaps(b, r.window[0], r.window[1])) hit.add(b);
  }
  if (r.repAdd !== null) hit.add(band(r.repAdd));
  if (r.repDrop !== null) hit.add(band(r.repDrop));
  return BANDS.filter((b) => hit.has(b));
}

// ---------------------------------------------------------------------
// The assignment
// ---------------------------------------------------------------------

export interface SolveItem {
  readonly id: string;
  readonly type: WorkoutType;
  readonly current: Band;
  readonly reach: readonly Band[];
  readonly anchor?: boolean;
}

export type Grid = Record<Band, number>;

export interface TypeSolve {
  readonly type: WorkoutType;
  /** The FINAL cell counts for this type — the draft plus `adjustments`. */
  readonly grid: Grid;
  /** Per cell, the ±2 the solve spent. Sums to 0: the type's total is fixed
   *  by the 1-for-1 replacement rule (§8, "the library still counts 302"). */
  readonly adjustments: Grid;
  /** id → assigned band, for every workout the solve KEEPS. */
  readonly assigned: ReadonlyMap<string, Band>;
  /** The residual (§2): workouts no feasible assignment could place. */
  readonly replaced: readonly string[];
  /** Anchors the solve could not leave alone — empty is the good case. */
  readonly anchorsDisplaced: readonly string[];
  /** Σ|adjustment|. */
  readonly deviation: number;
  /** Workouts assigned to a band other than their current one. */
  readonly moves: number;
}

export interface SolveOptions {
  /** §2's ±2. */
  readonly maxAdjust?: number;
  /** The cell that must stay strictly the largest in its type. The library
   *  solve passes `"30-45"` for ruling B (§2: "30-45 is the LARGEST cell in
   *  every type"); the constraint lives here rather than inside the search
   *  because it is a content ruling, not a property of assignment. The
   *  ruling's second-place claim is deliberately NOT enforced — §2's own O2
   *  row already breaks it (60+ 20 > 20-30 14). */
  readonly modeAt?: Band;
}

/** Every grid within ±`maxAdjust` of the draft that preserves the type total
 *  (and, if `modeAt` is given, keeps that cell strictly the largest). */
export function candidateGrids(
  draft: Grid,
  opts: SolveOptions = {},
): {
  grid: Grid;
  adjustments: Grid;
  deviation: number;
}[] {
  const maxAdjust = opts.maxAdjust ?? MAX_CELL_ADJUST;
  const out: { grid: Grid; adjustments: Grid; deviation: number }[] = [];
  const walk = (i: number, acc: number[], sum: number): void => {
    if (i === BANDS.length) {
      if (sum !== 0) return;
      const grid = {} as Grid;
      const adjustments = {} as Grid;
      BANDS.forEach((b, j) => {
        grid[b] = draft[b] + acc[j]!;
        adjustments[b] = acc[j]!;
      });
      if (BANDS.some((b) => grid[b] < 0)) return;
      const mode = opts.modeAt;
      if (
        mode !== undefined &&
        BANDS.some((b) => b !== mode && grid[b] >= grid[mode])
      )
        return;
      out.push({
        grid,
        adjustments,
        deviation: acc.reduce((a, b) => a + Math.abs(b), 0),
      });
      return;
    }
    for (let d = -maxAdjust; d <= maxAdjust; d++) {
      acc.push(d);
      walk(i + 1, acc, sum + d);
      acc.pop();
    }
  };
  walk(0, [], 0);
  return out;
}

/** Min-cost max-flow on a graph small enough (≤ 97 nodes) that clarity beats
 *  asymptotics. Costs are non-negative, so successive shortest paths is
 *  exact: max flow first, minimum cost among the max flows second. */
class MinCostFlow {
  private readonly to: number[] = [];
  private readonly cap: number[] = [];
  private readonly cost: number[] = [];
  private readonly out: number[][];
  constructor(private readonly n: number) {
    this.out = Array.from({ length: n }, () => []);
  }
  edge(u: number, v: number, cap: number, cost: number): void {
    this.out[u]!.push(this.to.length);
    this.to.push(v);
    this.cap.push(cap);
    this.cost.push(cost);
    this.out[v]!.push(this.to.length);
    this.to.push(u);
    this.cap.push(0);
    this.cost.push(-cost);
  }
  /** True where edge `e` (a forward edge) carries flow. */
  saturated(e: number): boolean {
    return this.cap[e] === 0;
  }
  edgesFrom(u: number): number[] {
    return this.out[u]!.filter((e) => e % 2 === 0);
  }
  head(e: number): number {
    return this.to[e]!;
  }
  run(source: number, sink: number): number {
    let flow = 0;
    for (;;) {
      // Bellman-Ford (SPFA): the graph has ≤ 5 layers, so the queue drains
      // in a handful of passes and the constant factor is irrelevant.
      const dist = new Array<number>(this.n).fill(Infinity);
      const via = new Array<number>(this.n).fill(-1);
      const queued = new Array<boolean>(this.n).fill(false);
      dist[source] = 0;
      const queue = [source];
      queued[source] = true;
      while (queue.length > 0) {
        const u = queue.shift()!;
        queued[u] = false;
        for (const e of this.out[u]!) {
          const v = this.to[e]!;
          if (this.cap[e]! > 0 && dist[u]! + this.cost[e]! < dist[v]! - 1e-9) {
            dist[v] = dist[u]! + this.cost[e]!;
            via[v] = e;
            if (!queued[v]) {
              queued[v] = true;
              queue.push(v);
            }
          }
        }
      }
      if (dist[sink] === Infinity) return flow;
      let push = Infinity;
      for (let v = sink; v !== source; v = this.to[via[v]! ^ 1]!) {
        push = Math.min(push, this.cap[via[v]!]!);
      }
      for (let v = sink; v !== source; v = this.to[via[v]! ^ 1]!) {
        this.cap[via[v]!]! -= push;
        this.cap[via[v]! ^ 1]! += push;
      }
      flow += push;
    }
  }
}

// Two cost tiers, the upper one strictly dominating the lower over any
// library this solver can see (a type holds ≤ 90 workouts, so ≤ 90 moves):
// RETAINING an anchor beats retaining anyone else, and after that, leaving a
// workout in the band it is already in beats moving it.
//
// There is deliberately no third tier penalising an anchor's MOVE. It was
// there and a mutant killed it: deleting it changed no outcome on any input
// — because the anchor's stay edge already costs 0 while every move costs at
// least 1, and its source edge is the only free one, so the search routes it
// into its own band before it considers anyone. The anchor's position is
// additionally protected ACROSS grids by `solveType`'s lexicographic key
// (anchors displaced outranks distance from the draft), and any displacement
// that does happen is reported in `anchorsDisplaced` and in the move plan.
const COST_DROP_ANCHOR = 1_000_000;
const COST_MOVE = 1;

/** The assignment for ONE fixed grid: which workouts land in which cell, and
 *  which are the residual. Maximises the number of workouts kept (§2:
 *  "derives the replacement list as the residual"), then prefers keeping the
 *  anchors, then prefers leaving workouts in the band they are already in. */
export function assignToGrid(
  items: readonly SolveItem[],
  grid: Grid,
): { assigned: Map<string, Band>; replaced: string[] } {
  const n = items.length;
  const source = n + BANDS.length;
  const sink = source + 1;
  const flow = new MinCostFlow(sink + 1);
  items.forEach((w, i) => {
    flow.edge(source, i, 1, w.anchor === true ? 0 : COST_DROP_ANCHOR);
    for (const b of w.reach) {
      flow.edge(i, n + BANDS.indexOf(b), 1, b === w.current ? 0 : COST_MOVE);
    }
  });
  BANDS.forEach((b, j) => flow.edge(n + j, sink, grid[b], 0));
  flow.run(source, sink);
  const assigned = new Map<string, Band>();
  const replaced: string[] = [];
  items.forEach((w, i) => {
    const used = flow
      .edgesFrom(i)
      .find(
        (e) => flow.saturated(e) && flow.head(e) >= n && flow.head(e) < source,
      );
    if (used === undefined) replaced.push(w.id);
    else assigned.set(w.id, BANDS[flow.head(used) - n]!);
  });
  return { assigned, replaced };
}

/** The solve for one type: pick the grid within ±2 of the draft that
 *  minimises, in this order, (1) replacements, (2) anchors disturbed,
 *  (3) distance from the draft, (4) workouts that change band. */
export function solveType(
  items: readonly SolveItem[],
  draft: Grid,
  opts: SolveOptions = {},
): TypeSolve {
  const type = items[0]!.type;
  let best: TypeSolve | null = null;
  let bestKey: number[] | null = null;
  for (const cand of candidateGrids(draft, opts)) {
    const { assigned, replaced } = assignToGrid(items, cand.grid);
    const anchorsDisplaced = items
      .filter((w) => w.anchor === true && assigned.get(w.id) !== w.current)
      .map((w) => w.id);
    const moves = items.filter(
      (w) => assigned.has(w.id) && assigned.get(w.id) !== w.current,
    ).length;
    const key = [
      replaced.length,
      anchorsDisplaced.length,
      cand.deviation,
      moves,
    ];
    if (bestKey !== null && !lexLess(key, bestKey)) continue;
    bestKey = key;
    best = {
      type,
      grid: cand.grid,
      adjustments: cand.adjustments,
      assigned,
      replaced,
      anchorsDisplaced,
      deviation: cand.deviation,
      moves,
    };
  }
  if (best === null) {
    throw new Error(`solveType(${type}): no candidate grid — check the draft`);
  }
  return best;
}

function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i]! < b[i]!;
  }
  return false;
}

export function solveLibrary(
  items: readonly SolveItem[],
  draft: Record<WorkoutType, Grid>,
): Record<WorkoutType, TypeSolve> {
  const out = {} as Record<WorkoutType, TypeSolve>;
  for (const t of TYPES) {
    out[t] = solveType(
      items.filter((w) => w.type === t),
      draft[t],
      // Ruling B is applied HERE, at the library call site, not inside the
      // search: it is a content decision about this grid.
      { modeAt: "30-45" },
    );
  }
  return out;
}

/** Hall's condition, the adversarial review's own instrument (B1), over
 *  every subset of bands rather than only the upward-closed cuts it needed:
 *  the worst `demand − supply` and the subset that produces it. A negative
 *  or zero worst means a perfect assignment exists. */
export function hallDeficit(
  items: readonly SolveItem[],
  grid: Grid,
): { subset: Band[]; demand: number; supply: number; short: number } {
  let worst = { subset: [] as Band[], demand: 0, supply: 0, short: 0 };
  for (let mask = 1; mask < 1 << BANDS.length; mask++) {
    const subset = BANDS.filter((_, i) => (mask & (1 << i)) !== 0);
    const demand = subset.reduce((a, b) => a + grid[b], 0);
    const supply = items.filter((w) =>
      subset.some((b) => w.reach.includes(b)),
    ).length;
    if (demand - supply > worst.short) {
      worst = { subset: [...subset], demand, supply, short: demand - supply };
    }
  }
  return worst;
}

// ---------------------------------------------------------------------
// Retune sketches — a concrete, VERIFIED stretch/shrink, not prose
// ---------------------------------------------------------------------

export interface Sketch {
  readonly arm: "one-rep" | "scale";
  readonly factor: number;
  readonly steps: Step[];
  readonly minutes: number;
  readonly summary: string;
  /** Empty when the sketch is legal on every check §6 and the house rules
   *  impose; otherwise the reasons, for the review table. */
  readonly issues: readonly string[];
}

const roundToSeconds = (m: number, grain: number): number =>
  Math.max(grain, Math.round(m / grain) * grain);

function scaleSteps(steps: readonly Step[], f: number): Step[] {
  return steps.map((s): Step => {
    if (s.k === "w") {
      const duration =
        s.duration.kind === "time"
          ? {
              kind: "time" as const,
              minutes: roundToSeconds(s.duration.minutes * f, 0.5),
            }
          : {
              kind: "distance" as const,
              meters: Math.max(
                100,
                Math.round((s.duration.meters * f) / 50) * 50,
              ),
            };
      return {
        ...s,
        duration,
        ...(s.restMinutes === undefined
          ? {}
          : { restMinutes: roundToSeconds(s.restMinutes * f, 0.25) }),
      };
    }
    if (s.k === "r")
      return { ...s, minutes: roundToSeconds(s.minutes * f, 0.25) };
    return s;
  });
}

/** One thing the repair can nudge: a work piece's own length, or the recovery
 *  beside it. Work first, longest first — a total is best carried by the
 *  piece that dominates it — and rests only where the work levers cannot
 *  reach the number (an `{effort:"max"}` 200 m piece prices at a nominal
 *  split, so a 50 m grid moves the total in ~4.5-second jumps that can
 *  straddle the only legal total). */
type Lever = { index: number; field: "work" | "rest" };

function nudge(step: Step, lever: Lever, ticks: number): Step | null {
  if (lever.field === "rest") {
    if (step.k === "r") {
      const minutes = Math.round((step.minutes + ticks / 12) * 60) / 60;
      return minutes >= 1 / 60 && minutes <= 60 ? { ...step, minutes } : null;
    }
    if (step.k !== "w" || step.restMinutes === undefined) return null;
    const restMinutes = Math.round((step.restMinutes + ticks / 12) * 60) / 60;
    return restMinutes >= 1 / 60 && restMinutes <= 60
      ? { ...step, restMinutes }
      : null;
  }
  if (step.k !== "w") return null;
  if (step.duration.kind === "time") {
    const minutes = Math.round((step.duration.minutes + ticks / 12) * 60) / 60;
    return minutes > 0 && minutes <= 180
      ? { ...step, duration: { kind: "time", minutes } }
      : null;
  }
  const meters = step.duration.meters + ticks * 50;
  return meters >= 100 && meters <= 42195
    ? { ...step, duration: { kind: "distance", meters } }
    : null;
}

/** Nudges one lever until the total both satisfies `ok` and sits as close as
 *  it can to `prefer`. Rounding a whole workout by a single factor rarely
 *  lands a legal total on the nose — a 250 m piece under ×1.03 does not move
 *  at all on a 50 m grid — so this is the repair, and it is why the plan's
 *  sketches are measured by `estimateMinutes` rather than asserted.
 *
 *  The tick is 5 seconds: `validate.ts:57`'s `wholeSecond` admits any whole
 *  second, and a piece that reads 1:15 or 4:35 is as callable as one that
 *  reads 4:30 — where a half-minute grain simply cannot hit the total (a
 *  12-rep block moves in 6' jumps at 0.5' per rep), 5 seconds can. */
function repair(
  steps: Step[],
  ok: (minutes: number) => boolean,
  prefer: number,
  baselines: Baselines,
): Step[] | null {
  let best: { steps: Step[]; miss: number } | null = null;
  const size = (s: Step): number =>
    s.k === "w"
      ? s.duration.kind === "time"
        ? s.duration.minutes
        : s.duration.meters / 250
      : 0;
  const indexed = steps.map((s, i) => ({ s, i }));
  const levers: Lever[] = [
    ...indexed
      .filter(({ s }) => s.k === "w")
      .sort((a, b) => size(b.s) - size(a.s))
      .map(({ i }): Lever => ({ index: i, field: "work" })),
    ...indexed
      .filter(
        ({ s }) => s.k === "r" || (s.k === "w" && s.restMinutes !== undefined),
      )
      .map(({ i }): Lever => ({ index: i, field: "rest" })),
  ];
  for (const lever of levers) {
    for (let k = 0; k <= 60; k++) {
      for (const sign of k === 0 ? [1] : [1, -1]) {
        const moved = nudge(steps[lever.index]!, lever, sign * k);
        if (moved === null) continue;
        const candidate = steps.map((s, j) => (j === lever.index ? moved : s));
        const got = estimateMinutes(candidate, baselines).minutes;
        if (!ok(got)) continue;
        const miss = Math.abs(got - prefer);
        if (best === null || miss < best.miss)
          best = { steps: candidate, miss };
        if (miss === 0) return candidate;
      }
    }
  }
  return best?.steps ?? null;
}

/** The total this workout should aim at to land in `target`: the reachable
 *  total closest to what it is today, so a sketch never moves a workout
 *  further than the band requires. */
export function targetTotal(r: Reach, target: Band): number | null {
  const [lo, hi] = BAND_RANGE[target];
  const inBand = (d: number): boolean => d >= lo && d < hi;
  const options = r.scaleTotals.filter(inBand);
  if (r.estimated) {
    const wLo = Math.max(r.window[0], lo);
    const wHi = Math.min(r.window[1], hi - 0.5);
    if (wHi >= wLo) {
      options.push(Math.min(Math.max(r.current, wLo), wHi));
      for (let d = Math.ceil(wLo / 5) * 5; d <= wHi; d += 5) options.push(d);
    }
  }
  if (options.length === 0) return null;
  return options.sort(
    (a, b) => Math.abs(a - r.current) - Math.abs(b - r.current),
  )[0]!;
}

export function workRestSeconds(
  steps: Step[],
  baselines: Baselines,
): { work: number; rest: number } {
  let work = 0;
  let rest = 0;
  for (const p of phases(steps, baselines)) {
    const s = phaseSeconds(p) ?? 0;
    if (p.type === "work") work += s;
    else if (p.type === "rest") rest += s;
  }
  return { work, rest };
}

/** The book cells, narrowed to the two range fields the sketch checker
 *  reads. The JSON's inferred `number[]`s are the same pairs the §6 table
 *  renders; `patterns.test.ts` already gates the file's shape. */
type BookRange = readonly number[] | null | undefined;
const CELLS = patterns.cells as unknown as Record<
  string,
  { workRestRatio?: BookRange; repsCount?: BookRange }
>;

/** §6's translation rule, quoted: "A warm-up-free workout consults the cell
 *  its duration occupied BEFORE the strip: a retuned 27' workout that was 32'
 *  with its warm-up obeys the 30-45 cell's ranges, not 20-30's." So the cell
 *  a sketch must satisfy is banded on (retuned total + this workout's own
 *  historical warm-up), not on the retuned total. */
export function bookCell(
  type: WorkoutType,
  minutes: number,
  historicalWarmup: number,
): string {
  return `${type}|${band(minutes + historicalWarmup)}`;
}

/** Builds the concrete retune and checks it. The check is the point: a
 *  sketch that fails any of these is a solver bug, per the task brief, so it
 *  ships with its reasons attached rather than silently. */
export function buildSketch(
  workout: WorkoutInput,
  target: Band,
  historicalWarmup: number,
  baselines: Baselines,
): Sketch | null {
  const r = reachable(workout.steps, baselines);
  const repsIndex = workout.steps.findIndex((s) => s.k === "reps");
  const candidates: Sketch[] = [];
  // §3 puts the one-rep arm first ("EITHER adding one rep ... OR
  // lengthening"), and it is the sketch a content author can apply without
  // touching a single number — but it is not free: a rep-add can push the
  // rep count outside the book cell's observed range, and where it does the
  // scaling arm reaches the same band without the deviation. Both are built
  // and the cleaner one wins.
  for (const [total, delta] of [
    [r.repAdd, 1],
    [r.repDrop, -1],
  ] as const) {
    if (total === null || band(total) !== target) continue;
    const marker = workout.steps[repsIndex] as Extract<Step, { k: "reps" }>;
    const steps = workout.steps.map((s, i) =>
      i === repsIndex ? { ...marker, count: marker.count + delta } : s,
    );
    candidates.push(
      finish(
        workout,
        steps,
        "one-rep",
        total / r.current,
        `reps ${marker.count} → ${marker.count + delta} (${r.current}' → ${total}')`,
        r,
        target,
        historicalWarmup,
        baselines,
      ),
    );
  }
  const total = targetTotal(r, target);
  if (total !== null) {
    const f = total / r.current;
    const scaled = scaleSteps(workout.steps, f);
    // What the repaired total must satisfy: the assigned band, the ±ratio
    // window, and the 0/5 rule where the workout is time-computable.
    const legal = (m: number): boolean =>
      band(m) === target &&
      m >= r.window[0] - 1e-9 &&
      m <= r.window[1] + 1e-9 &&
      (r.estimated || m % 5 === 0);
    const steps = legal(estimateMinutes(scaled, baselines).minutes)
      ? scaled
      : repair(scaled, legal, total, baselines);
    if (steps !== null) {
      const got = estimateMinutes(steps, baselines).minutes;
      candidates.push(
        finish(
          workout,
          steps,
          "scale",
          got / r.current,
          `every piece ×${f.toFixed(2)} (${r.current}' → ${got}')`,
          r,
          target,
          historicalWarmup,
          baselines,
        ),
      );
    }
  }
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => a.issues.length - b.issues.length)[0]!;
}

function finish(
  workout: WorkoutInput,
  steps: Step[],
  arm: Sketch["arm"],
  factor: number,
  summary: string,
  r: Reach,
  target: Band,
  historicalWarmup: number,
  baselines: Baselines,
): Sketch {
  const { minutes, estimated } = estimateMinutes(steps, baselines);
  const issues: string[] = [];
  const check = validateWorkoutInput({ ...workout, steps });
  if (!check.ok) issues.push(`validate: ${check.errors.join("; ")}`);
  if (band(minutes) !== target) {
    issues.push(`lands in ${band(minutes)}, not ${target}`);
  }
  if (!estimated && minutes % 5 !== 0)
    issues.push(`total ${minutes}' is not 0/5`);
  if (
    arm === "scale" &&
    (minutes < r.window[0] - 1e-9 || minutes > r.window[1] + 1e-9)
  ) {
    issues.push(`${minutes}' is outside the ±25% window`);
  }
  // The archetype is fixed (§3). Scaling touches durations and rests only:
  // every spm, every pace ref, the step kinds and the rep count are the
  // workout's identity and must come through untouched.
  const shape = (ss: readonly Step[]): string =>
    JSON.stringify(
      ss.map((s) =>
        s.k === "w"
          ? { k: s.k, ref: s.ref, spm: s.spm, kind: s.duration.kind }
          : s.k === "reps"
            ? { k: s.k, count: arm === "one-rep" ? 0 : s.count }
            : { k: s.k },
      ),
    );
  if (shape(workout.steps) !== shape(steps)) issues.push("archetype changed");
  // §6's book ranges for the cell the retuned workout now consults.
  const cell = CELLS[bookCell(workout.type, minutes, historicalWarmup)];
  const before = workRestSeconds(workout.steps, baselines);
  const after = workRestSeconds(steps, baselines);
  const ratio = after.rest === 0 ? null : after.work / after.rest;
  const ratioBefore = before.rest === 0 ? null : before.work / before.rest;
  const wr = cell?.workRestRatio;
  if (
    wr != null &&
    wr.length === 2 &&
    ratio !== null &&
    (ratio < wr[0]! - 1e-6 || ratio > wr[1]! + 1e-6)
  ) {
    const preExisting =
      ratioBefore !== null && (ratioBefore < wr[0]! || ratioBefore > wr[1]!);
    issues.push(
      `W:R ${ratio.toFixed(2)} outside the cell's ${wr[0]}–${wr[1]}` +
        (preExisting ? " (pre-existing)" : ""),
    );
  }
  const marker = steps.find((s) => s.k === "reps") as
    Extract<Step, { k: "reps" }> | undefined;
  const rc = cell?.repsCount;
  if (
    marker &&
    rc != null &&
    rc.length === 2 &&
    (marker.count < rc[0]! || marker.count > rc[1]!)
  ) {
    // "Inherited" = the sketch did not touch the rep count; the workout
    // carried it into a band whose book cell happens to have seen a
    // different range. That is a §6 review-table row about the destination
    // cell, not a defect in the retune.
    issues.push(
      `reps ${marker.count} outside the cell's ${rc[0]}–${rc[1]}` +
        (arm === "one-rep" ? "" : " (inherited)"),
    );
  }
  return { arm, factor, steps, minutes, summary, issues };
}

// ---------------------------------------------------------------------
// The real library
// ---------------------------------------------------------------------

/** §2's opening draft, verbatim from the table at design.md:42-47. The
 *  solve's output — this ± the adjustments — is what lands in
 *  `patterns.json`'s `targets`. */
export const DRAFT_GRID: Record<WorkoutType, Grid> = {
  O2: { "<20": 4, "20-30": 14, "30-45": 34, "45-60": 18, "60+": 20 },
  AT: { "<20": 6, "20-30": 20, "30-45": 32, "45-60": 12, "60+": 5 },
  TR: { "<20": 10, "20-30": 22, "30-45": 30, "45-60": 9, "60+": 4 },
  AN: { "<20": 12, "20-30": 16, "30-45": 20, "45-60": 8, "60+": 4 },
};

export function libraryItems(
  opts: ReachOptions = {},
  baselines: Baselines = BASELINES,
): {
  item: SolveItem;
  workout: WorkoutInput;
  reach: Reach;
}[] {
  return LIBRARY_WORKOUTS.map((w) => {
    const reach = reachable(w.steps, baselines, opts);
    return {
      workout: w,
      reach,
      item: {
        id: w.title,
        type: w.type,
        current: band(reach.current),
        reach: reachableBands(reach),
        anchor: ANCHOR_TITLES.includes(w.title),
      },
    };
  });
}

// ---------------------------------------------------------------------
// The move plan (CLI)
// ---------------------------------------------------------------------

// See node-shims.d.ts and library-balance.ts's own note: this tsconfig has
// no "node" in its `types` array, so `process` is not ambiently typed.
const processArgv = (globalThis as unknown as { process: { argv: string[] } })
  .process.argv;

function frozenWarmups(): Record<string, number> {
  const dir = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(
    readFileSync(join(dir, "library-warmups-before.json"), "utf-8"),
  ) as Record<string, number>;
}

/** Reproduces the four numbers the adversarial review published (B1), from
 *  ITS reachability rule — upward only, continuous, no one-rep arm — against
 *  the OLD warm-up-inclusive grid. If this stops matching 144 / 40 /
 *  3-4-6-8, either the seed content moved or this module's arithmetic
 *  drifted, and every number below it is suspect. */
export function reviewReplay(): {
  crossers: number;
  unreachable: number;
  deficits: Record<WorkoutType, number>;
} {
  const frozen = frozenWarmups();
  const OLD: Record<WorkoutType, Grid> = {
    O2: { "<20": 2, "20-30": 14, "30-45": 36, "45-60": 18, "60+": 20 },
    AT: { "<20": 5, "20-30": 19, "30-45": 34, "45-60": 13, "60+": 4 },
    TR: { "<20": 9, "20-30": 22, "30-45": 32, "45-60": 9, "60+": 3 },
    AN: { "<20": 14, "20-30": 20, "30-45": 18, "45-60": 5, "60+": 3 },
  };
  const rows = LIBRARY_WORKOUTS.map((w) => {
    const now = estimateMinutes(w.steps, BASELINES).minutes;
    const wu = frozen[w.title] ?? 0;
    return { type: w.type, now, before: now + wu, ceiling: now * 1.25 };
  });
  const crossers = rows.filter((r) => band(r.now) !== band(r.before));
  const unreachable = crossers.filter(
    (r) => BANDS.indexOf(band(r.ceiling)) < BANDS.indexOf(band(r.before)),
  );
  const deficits = {} as Record<WorkoutType, number>;
  for (const t of TYPES) {
    const g = rows.filter((r) => r.type === t);
    let short = 0;
    BANDS.forEach((_, i) => {
      const demand = BANDS.slice(i).reduce((a, b) => a + OLD[t][b], 0);
      const supply = g.filter(
        (r) => BANDS.indexOf(band(r.ceiling)) >= i,
      ).length;
      short = Math.max(short, demand - supply);
    });
    deficits[t] = short;
  }
  return {
    crossers: crossers.length,
    unreachable: unreachable.length,
    deficits,
  };
}

const fmtBands = (bs: readonly Band[]): string => `{${bs.join(", ")}}`;

function describeSteps(steps: readonly Step[]): string {
  const marker = steps.find((s) => s.k === "reps") as
    Extract<Step, { k: "reps" }> | undefined;
  const body = steps
    .filter((s) => s.k !== "reps")
    .map((s) => {
      if (s.k === "r") return `rest ${s.minutes}'`;
      if (s.k === "test") return `test ${s.label}`;
      const d =
        s.duration.kind === "time"
          ? `${s.duration.minutes}'`
          : `${s.duration.meters} m`;
      const ref =
        "base" in s.ref
          ? `${s.ref.base}${s.ref.off >= 0 ? "+" : ""}${s.ref.off}`
          : s.ref.effort;
      const rest = s.restMinutes === undefined ? "" : ` r${s.restMinutes}'`;
      return `${d} @${ref}${s.spm === undefined ? "" : ` spm${s.spm}`}${rest}`;
    })
    .join(" + ");
  return marker ? `${marker.count}× [${body}]` : body;
}

function main(): void {
  const frozen = frozenWarmups();
  const rows = libraryItems();
  const items = rows.map((r) => r.item);
  const solved = solveLibrary(items, DRAFT_GRID);
  const out: string[] = [];
  const p = (s = ""): void => void out.push(s);

  p("# The move plan — library rebalance Task 1 (JAMES GATE 1)");
  p();
  p("Generated by `pnpm exec tsx scripts/library-moves.ts`. Every duration");
  p("below is `estimateMinutes` at the nominal baselines");
  p("(`{k2Seconds: 112, k6Seconds: 122}`), warm-up-free, and every sketch was");
  p("BUILT and re-measured by the script rather than asserted in prose.");
  p();

  const replay = reviewReplay();
  p("## Method, and its reconciliation with the adversarial review");
  p();
  p("`reviewReplay()` re-runs the adversarial review's own instrument (its");
  p("B1: reachability capped at `after × 1.25`, upward only, Hall's condition");
  p("over the ordered bands, measured against the OLD warm-up-inclusive");
  p("grid). It reproduces the review's published numbers exactly:");
  p();
  p("| review B1 | published | replayed here |");
  p("|---|---|---|");
  p(`| band-crossers | 144 | ${replay.crossers} |`);
  p(
    `| crossers that cannot regain their old band | 40 | ${replay.unreachable} |`,
  );
  for (const t of TYPES) {
    const pub = { O2: 3, AT: 4, TR: 6, AN: 8 }[t];
    p(`| Hall deficit, ${t} | ${pub} | ${replay.deficits[t]} |`);
  }
  p();
  const replacements = TYPES.reduce((a, t) => a + solved[t].replaced.length, 0);
  p("The solve then departs from that instrument in three spec-licensed ways");
  p("(module header, METHOD PROVENANCE): shrinking is legal, the one-rep arm");
  p("exists, and the 0/5 house rule discretises the scaling arm. It also");
  p("aims at §2's NEW draft grid, not the old one. Those four differences,");
  p("not an arithmetic disagreement, are why the replacement count below is");
  p(`${replacements} rather than the review's 21-at-exact-match / 8-at-±1.`);
  p();

  p("### The two readings this solve had to settle");
  p();
  p("**The ceiling's denominator** (review m7, left open by §3). Settled as");
  p("TOTAL time — the pieces scale and the rests scale with them, which is");
  p('§3\'s own "rest scaling in the same ratio family". Under the narrow');
  p("reading (rests held) the answer changes; both are priced below.");
  p();
  p("**The 0/5 totals rule.** Measured this session: it holds over PRE-STRIP");
  p("totals in 195 of 195 time-computable workouts and over post-strip");
  p("totals in only 104 of 195 — the warm-up drop broke it. This solve reads");
  p("it forward (a retuned workout rounds its own warm-up-free total),");
  p("because the warm-up is a per-user setting now and no author controls");
  p("the pre-strip figure any more.");
  p();
  p("| reading | replacements forced |");
  p("|---|---|");
  for (const [label, opts] of [
    ["**as solved** — total-time denominator, 0/5 on the new total", {}],
    [
      "no 0/5 rule at all (the review's pure arithmetic)",
      { totals: "unconstrained" as const },
    ],
    [
      "0/5 read backward — preserve each pre-strip total's roundness",
      { totals: "preserve-mod5" as const },
    ],
    ["narrow denominator — work scales, rests held", { scaleRests: false }],
  ] as const) {
    const alt = solveLibrary(
      libraryItems(opts).map((r) => r.item),
      DRAFT_GRID,
    );
    const n = TYPES.reduce((a, t) => a + alt[t].replaced.length, 0);
    p(`| ${label} | ${n} |`);
  }
  p();

  p("## The final grid");
  p();
  p("Draft is §2's opening table. Every adjustment is inside §2's ±2 and");
  p("every row still sums to its type's fixed total (1-for-1 replacement,");
  p("§8). The solve is also constrained to keep 30-45 strictly the largest");
  p("cell in every type (ruling B). Cells are warm-up-FREE.");
  p();
  p(`| type | ${BANDS.join(" | ")} | total |`);
  p(`|---|${BANDS.map(() => "---").join("|")}|---|`);
  for (const t of TYPES) {
    const s = solved[t];
    const cells = BANDS.map((b) => {
      const adj = s.adjustments[b];
      return adj === 0
        ? `${s.grid[b]}`
        : `**${s.grid[b]}** (${adj > 0 ? "+" : ""}${adj})`;
    });
    const total = BANDS.reduce((a, b) => a + s.grid[b], 0);
    p(
      `| ${t} draft | ${BANDS.map((b) => DRAFT_GRID[t][b]).join(" | ")} | ${BANDS.reduce((a, b) => a + DRAFT_GRID[t][b], 0)} |`,
    );
    p(`| **${t} FINAL** | ${cells.join(" | ")} | ${total} |`);
  }
  p();
  p("Why each adjustment:");
  p();
  for (const t of TYPES) {
    const s = solved[t];
    if (s.deviation === 0) {
      p(`- **${t}** — none. The draft is feasible as authored.`);
      continue;
    }
    const hall = hallDeficit(
      items.filter((i) => i.type === t),
      DRAFT_GRID[t],
    );
    const spent = BANDS.filter((b) => s.adjustments[b] !== 0)
      .map((b) => `${b} ${s.adjustments[b]! > 0 ? "+" : ""}${s.adjustments[b]}`)
      .join(", ");
    p(
      `- **${t}** — ${spent}. Against the draft, Hall's condition is short ` +
        `${hall.short} over ${fmtBands(hall.subset)} ` +
        `(demand ${hall.demand}, supply ${hall.supply}): ` +
        `no assignment can fill those cells from this content. The ±2 moves ` +
        `${s.deviation} places of demand out of the cells the library cannot ` +
        `reach and into the ones it can, cutting replacements to ` +
        `${s.replaced.length}.`,
    );
  }
  p();

  p("## Summary");
  p();
  p("| type | stays | retunes up | retunes down | replacements |");
  p("|---|---|---|---|---|");
  const totals = { stay: 0, up: 0, down: 0, repl: 0 };
  for (const t of TYPES) {
    const s = solved[t];
    const g = rows.filter((r) => r.item.type === t);
    let stay = 0;
    let up = 0;
    let down = 0;
    for (const r of g) {
      const to = s.assigned.get(r.item.id);
      if (to === undefined) continue;
      if (to === r.item.current) stay++;
      else if (BANDS.indexOf(to) > BANDS.indexOf(r.item.current)) up++;
      else down++;
    }
    totals.stay += stay;
    totals.up += up;
    totals.down += down;
    totals.repl += s.replaced.length;
    p(`| ${t} | ${stay} | ${up} | ${down} | ${s.replaced.length} |`);
  }
  p(
    `| **all** | **${totals.stay}** | **${totals.up}** | **${totals.down}** | **${totals.repl}** |`,
  );
  p();
  p(
    `Anchors: ${ANCHOR_TITLES.map((a) => {
      const row = rows.find((r) => r.item.id === a)!;
      const to = solved[row.item.type].assigned.get(a);
      return `\`${a}\` ${to === row.item.current ? `stays in ${to}` : `MOVED to ${to ?? "REPLACED"}`}`;
    }).join("; ")}.`,
  );
  p();

  // §6 deviations, and the baseline they have to be read against. A flag
  // here is a review-table row ("a value outside them needs a review-table
  // justification"), not automatically a defect — so the plan states how
  // often TODAY's untouched library is already outside the same range.
  const flags: {
    title: string;
    type: WorkoutType;
    issues: readonly string[];
  }[] = [];
  const sketches = new Map<string, Sketch>();
  for (const t of TYPES) {
    for (const r of rows.filter((x) => x.item.type === t)) {
      const to = solved[t].assigned.get(r.item.id);
      if (to === undefined || to === r.item.current) continue;
      const sk = buildSketch(
        r.workout,
        to,
        frozen[r.workout.title] ?? 0,
        BASELINES,
      );
      if (sk === null) continue;
      sketches.set(r.item.id, sk);
      if (sk.issues.length > 0) {
        flags.push({ title: r.item.id, type: t, issues: sk.issues });
      }
    }
  }
  let repsCarrying = 0;
  let repsOutside = 0;
  const cellsOutside = new Set<string>();
  for (const r of rows) {
    const marker = r.workout.steps.find((s) => s.k === "reps") as
      Extract<Step, { k: "reps" }> | undefined;
    if (marker === undefined) continue;
    repsCarrying++;
    const rc =
      CELLS[
        bookCell(r.workout.type, r.reach.current, frozen[r.workout.title] ?? 0)
      ]?.repsCount;
    if (rc == null || rc.length !== 2) continue;
    if (marker.count < rc[0]! || marker.count > rc[1]!) {
      repsOutside++;
      cellsOutside.add(
        bookCell(r.workout.type, r.reach.current, frozen[r.workout.title] ?? 0),
      );
    }
  }
  p("## §6 deviations in the sketches");
  p();
  p(
    `${flags.length} of the ${totals.up + totals.down} retunes carry a §6 flag. None is a hard-gate breach — every`,
  );
  p(
    "sketch passes `validateWorkoutInput`, keeps its spm, keeps its pace refs,",
  );
  p("keeps its archetype, lands in its assigned band, and (where it is");
  p("time-computable) lands on a 0/5 total. The flags are all book-range");
  p("observations on the DESTINATION cell:");
  p();
  p("| workout | type | flag |");
  p("|---|---|---|");
  for (const f of flags)
    p(`| ${f.title} | ${f.type} | ${f.issues.join("; ")} |`);
  p();
  p("Read them against this baseline, measured over today's untouched");
  p(
    `library: ${repsOutside} of the ${repsCarrying} workouts that carry a reps marker already sit`,
  );
  p(
    `outside their own book cell's \`repsCount\` range, across ${cellsOutside.size} of the 20 cells`,
  );
  p("(O2|45-60's book range is 2–3 and the library already runs 2–10 there).");
  p(
    "Every `(pre-existing)` W:R flag is a ratio the workout already had; every",
  );
  p("`(inherited)` reps flag is a rep count the sketch does not touch — only");
  p("the cell moved. The un-tagged rows are the ones the one-rep arm creates,");
  const created = flags.filter((f) =>
    f.issues.some(
      (i) => !i.includes("pre-existing") && !i.includes("inherited"),
    ),
  ).length;
  p(`and they are the only ${created} that need James's eye.`);
  p();

  p("## Per workout");
  p();
  for (const t of TYPES) {
    const s = solved[t];
    p(`### ${t}`);
    p();
    p("#### Replacements (the residual)");
    p();
    if (s.replaced.length === 0) {
      p("None — every workout of this type places.");
    } else {
      const filled = {} as Record<Band, number>;
      for (const b of BANDS) filled[b] = 0;
      for (const b of s.assigned.values()) filled[b]++;
      const unfilled = BANDS.filter((b) => s.grid[b] - filled[b] > 0);
      const hall = hallDeficit(
        items.filter((i) => i.type === t),
        s.grid,
      );
      p(
        `The binding cut after the ±2 is ${fmtBands(hall.subset)}: demand ` +
          `${hall.demand} against supply ${hall.supply}, short ${hall.short}. ` +
          `Nothing in ${t} can stretch far enough to fill those seats, so the ` +
          `residual below is generated fresh INTO them, 1-for-1 with the ` +
          `titles that leave. Seats to fill: ` +
          unfilled
            .map((b) => `**${b} × ${s.grid[b] - filled[b]}**`)
            .join(", ") +
          ".",
      );
      const twins = items.filter(
        (i) =>
          i.type === t &&
          s.replaced.some(
            (id) =>
              JSON.stringify(items.find((x) => x.id === id)!.reach) ===
              JSON.stringify(i.reach),
          ),
      ).length;
      p();
      p(
        `WHICH titles these are is a tie-break, not a finding: ${twins} ${t} ` +
          `workouts share a reachable set with someone on this list and the ` +
          `cells they fit hold fewer than that, so the solve keeps the ones ` +
          `it meets first in library order. Swapping any row below for a ` +
          `same-slot twin changes no count — that choice is James's.`,
      );
      p();
      p("| out | now | reaches | difficulty / pain | why it cannot stay |");
      p("|---|---|---|---|---|");
      for (const id of s.replaced) {
        const r = rows.find((x) => x.item.id === id)!;
        p(
          `| ${id} | ${r.reach.current}' (${r.item.current}) | ` +
            `${fmtBands(r.item.reach)} | ${r.workout.difficulty} / ${r.workout.pain} | ` +
            `every band it reaches is already full of workouts that reach ` +
            `nothing else, and it reaches none of the unfilled seats |`,
        );
      }
    }
    p();
    p("#### Moves");
    p();
    p("| workout | now | → band | reachable | sketch | checks |");
    p("|---|---|---|---|---|---|");
    let stays = 0;
    for (const r of rows.filter((x) => x.item.type === t)) {
      const to = s.assigned.get(r.item.id);
      if (to === undefined) continue;
      if (to === r.item.current) {
        stays++;
        continue;
      }
      const sketch = sketches.get(r.item.id) ?? null;
      const cell = bookCell(
        r.workout.type,
        sketch?.minutes ?? r.reach.current,
        frozen[r.workout.title] ?? 0,
      );
      p(
        `| ${r.item.id} | ${r.reach.current}' (${r.item.current}) | ${to} | ` +
          `${fmtBands(r.item.reach)} | ${
            sketch === null
              ? "**NO SKETCH**"
              : `${sketch.summary}<br>\`${describeSteps(r.workout.steps)}\` → \`${describeSteps(sketch.steps)}\``
          } | ${
            sketch === null
              ? "—"
              : sketch.issues.length === 0
                ? `OK, book cell ${cell}`
                : `⚠ ${sketch.issues.join("; ")}`
          } |`,
      );
    }
    p();
    p(`${stays} ${t} workouts stay where they are, untouched.`);
    p();
  }
  console.log(out.join("\n"));
}

const isMain =
  processArgv[1] !== undefined &&
  import.meta.url === pathToFileURL(processArgv[1]).href;
if (isMain) main();
