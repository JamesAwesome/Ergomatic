# Workout Step Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-piece step rows on Today's suggestion card and a generated structure line on Library rows, per the approved spec.

**Architecture:** One new pure domain module (`app/domain/display/stepDetail.ts`) derives everything both surfaces render; Today's card gains a piece region + summary foot (render-only, data already present); Library rows gain a middle line (render-only). No API/server/schema changes anywhere.

**Tech Stack:** React 19, pure TS domain code, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-10-workout-step-detail-design.md` (James approved 2026-08-10, including the §2 trailing-rest DEVIATION).

## Global Constraints

- Worktree `.claude/worktrees/step-detail`, branch `workout-step-detail`. `git rev-parse --show-toplevel` before every commit.
- `app/domain/**` is pure (no framework imports), 100% coverage pinned, relative imports carry `.js`.
- No em dashes in user-facing strings. The minus in offsets is `−` (U+2212, `refLabel`'s idiom); the prime in `2′ r`/`44′` is `′` (U+2032); the separator is `·` (U+00B7).
- Mock hex → token map (spec §4): `--ink-3` #57544c, `--ink-2` #3f3c35, `--accent` #b5341f; NEW tokens `--step-region` #f8f5ec, `--step-peak` #f1ecdd, `--step-foot` #efece1. Row numerals are `--ink-3`, never the mock's #a29b8a (2.54:1 fails).
- Small mono labels ≥4.5:1 (design sweep); computed values in reports. No new interactive elements inside the card's Link.
- Every behavioral test self-mutates; `pnpm test` never bare vitest.
- Realistic fixtures: client/domain tests draw from real `LIBRARY_WORKOUTS`.

---

### Task 1: the domain module

**Files:**
- Create: `app/domain/display/stepDetail.ts`
- Test: `app/domain/display/stepDetail.test.ts`

**Interfaces (Tasks 2-3 consume exactly these):**

```ts
export interface PieceRow {
  duration: string;          // "18:00" | "500m" | a test step's label
  refTextFull: string | null;    // "at 6k +10" / "at 6k pace"
  refTextCompact: string | null; // "at +10" when the set shares one
                                 // base; "at 6k pace" at offset 0;
                                 // equals refTextFull for mixed bases
  effortText: string | null; // "ALL OUT" / "EASY"; null otherwise
  restText: string | null;   // "3′ r" | "2:30 r" | null (no rest follows)
  split: string | null;      // "2:15.0" | null (effort/test)
  spm: number | null;
  off: number | null;        // signed offset for split pieces, else null
}
export function pieceList(steps: Step[], baselines: Baselines): PieceRow[];
export function peakIndex(rows: PieceRow[], visibleCount: number): number | null;
export function workAndTotal(steps: Step[], baselines: Baselines): { workMinutes: number; totalMinutes: number };
export function structureLine(steps: Step[]): string;
```

- [ ] **Step 1: failing tests.** Write `stepDetail.test.ts` with the suites below (they define the contract; expected strings verbatim):

```typescript
import { describe, expect, it } from "vitest";
import {
  peakIndex,
  pieceList,
  structureLine,
  workAndTotal,
} from "./stepDetail.js";
import type { Baselines, Step } from "../types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index.js";

const B: Baselines = { k2Seconds: 118, k6Seconds: 125 };
const w = (
  min: number,
  off: number,
  spm?: number,
  restMinutes?: number,
): Step => ({
  k: "w",
  duration: { kind: "time", minutes: min },
  ref: { base: "6k", off },
  ...(spm !== undefined ? { spm } : {}),
  ...(restMinutes !== undefined ? { restMinutes } : {}),
});

describe("pieceList", () => {
  it("renders the mock's short card: two pieces, rest on the first only", () => {
    const rows = pieceList([w(18, 10, 22, 3), w(9, 6, 24)], B);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      duration: "18:00",
      refTextFull: "at 6k +10",
      refTextCompact: "at +10",
      restText: "3′ r",
      split: "2:15.0",
      spm: 22,
      off: 10,
    });
    expect(rows[1].restText).toBeNull();
    expect(rows[1].split).toBe("2:11.0");
  });

  it("DEVIATION: a trailing rest on the last piece is SHOWN", () => {
    const rows = pieceList([w(5, 4, undefined, 2), w(5, 4, undefined, 2)], B);
    expect(rows[1].restText).toBe("2′ r");
  });

  it("expands a reps block into per-piece rows (James's ruling)", () => {
    const steps: Step[] = [{ k: "reps", count: 3 }, w(5, 10, 24, 2)];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.duration === "5:00")).toBe(true);
    expect(rows[2].restText).toBe("2′ r"); // authored on the step; deviation shows it
  });

  it("offset 0 reads 'at 6k pace' in both forms; fractional rest uses the clock", () => {
    const rows = pieceList([w(8, 0, 28, 2.5), w(2, 4)], B);
    expect(rows[0].refTextFull).toBe("at 6k pace");
    expect(rows[0].refTextCompact).toBe("at 6k pace");
    expect(rows[0].restText).toBe("2:30 r");
  });

  it("mixed bases keep the base in compact form", () => {
    const steps: Step[] = [
      { k: "w", duration: { kind: "time", minutes: 4 }, ref: { base: "2k", off: 4 } },
      w(10, 8),
    ];
    const rows = pieceList(steps, B);
    expect(rows[0].refTextCompact).toBe("at 2k +4");
    expect(rows[1].refTextCompact).toBe("at 6k +8");
  });

  it("effort pieces: word in effortText, no split, no off", () => {
    const steps: Step[] = [
      { k: "w", duration: { kind: "time", minutes: 0.5 }, ref: { effort: "max" } },
      { k: "w", duration: { kind: "time", minutes: 2 }, ref: { effort: "min" } },
    ];
    const rows = pieceList(steps, B);
    expect(rows[0]).toMatchObject({ effortText: "ALL OUT", split: null, off: null });
    expect(rows[1].effortText).toBe("EASY");
  });

  it("distance pieces put meters in the duration slot and price the split", () => {
    const steps: Step[] = [
      { k: "w", duration: { kind: "distance", meters: 500 }, ref: { base: "6k", off: -4 }, restMinutes: 1 },
    ];
    const rows = pieceList(steps, B);
    expect(rows[0].duration).toBe("500m");
    expect(rows[0].split).toBe("2:01.0");
  });

  it("a standalone r step attaches to the preceding piece", () => {
    const steps: Step[] = [w(18, 10), { k: "r", minutes: 3 }, w(9, 6)];
    const rows = pieceList(steps, B);
    expect(rows[0].restText).toBe("3′ r");
    expect(rows[1].restText).toBeNull();
  });

  it("a test step is a row: label in the duration slot, nothing else", () => {
    const steps: Step[] = [w(10, 8, undefined, 2), { k: "test", label: "All out" }];
    const rows = pieceList(steps, B);
    expect(rows[1]).toMatchObject({
      duration: "All out",
      refTextFull: null,
      effortText: null,
      split: null,
    });
  });
});

describe("peakIndex", () => {
  it("min |off| among the visible window, ties to the LATER row", () => {
    const rows = pieceList(
      [w(2, 6, 22, 2), w(4, 4, 24, 2), w(6, 2, 26, 2), w(8, 0, 28, 2), w(6, 2, 26, 2), w(4, 4, 24, 2), w(2, 6, 22)],
      B,
    );
    expect(peakIndex(rows, 4)).toBe(3); // the mock's 04-of-7
    expect(peakIndex(rows, rows.length)).toBe(3); // 0 beats the +2 tie rule
  });
  it("peak behind the cap means NO tint; all-effort means NO tint", () => {
    const rows = pieceList(
      [w(2, 8, 22, 2), w(4, 6, 24, 2), w(6, 4, 26, 2), w(8, 6, 28, 2), w(6, 0, 26)],
      B,
    );
    expect(peakIndex(rows, 4)).toBeNull(); // true peak (off 0) is row 5
    const effort = pieceList(
      [
        { k: "w", duration: { kind: "time", minutes: 1 }, ref: { effort: "max" }, restMinutes: 1 },
        { k: "w", duration: { kind: "time", minutes: 1 }, ref: { effort: "max" } },
      ],
      B,
    );
    expect(peakIndex(effort, 2)).toBeNull();
  });
});

describe("workAndTotal", () => {
  it("the mock's arithmetic: 18+9 work, +3 rest", () => {
    expect(workAndTotal([w(18, 10, 22, 3), w(9, 6, 24)], B)).toEqual({
      workMinutes: 27,
      totalMinutes: 30,
    });
  });
  it("WORK + displayed rests equals TOTAL under the deviation", () => {
    const steps = [w(5, 4, undefined, 2), w(5, 4, undefined, 2)];
    const { workMinutes, totalMinutes } = workAndTotal(steps, B);
    expect(totalMinutes - workMinutes).toBe(4); // both rests, trailing included
  });
});

describe("structureLine", () => {
  const line = (steps: Step[]) => structureLine(steps);

  it("format 1, single piece", () => {
    expect(line([w(10, 14)])).toBe("10:00 @ 6K+14");
  });
  it("format 2, uniform repeats via reps marker and via identical pieces", () => {
    expect(line([{ k: "reps", count: 3 }, w(5, 10, undefined, 2)])).toBe(
      "3 × 5:00 @ 6K+10 · 2′ REST",
    );
    expect(line([w(4, 12, undefined, 1), w(4, 12)])).toBe(
      "2 × 4:00 @ 6K+12 · 1′ REST",
    );
  });
  it("format 3, two unequal pieces: offsets-only range, zero renders the base", () => {
    expect(line([w(18, 10, undefined, 3), w(9, 6)])).toBe(
      "18:00 + 9:00 @ +10 → +6 · 3′ REST",
    );
    expect(line([w(18, 6, undefined, 3), w(9, 0)])).toBe(
      "18:00 + 9:00 @ +6 → 6K · 3′ REST",
    );
  });
  it("format 4, chain ≤8 with max→min range; fractional minutes as clock", () => {
    expect(
      line([w(2, 6, undefined, 2), w(4, 4, undefined, 2), w(6, 2, undefined, 2), w(8, 0, undefined, 2), w(6, 2, undefined, 2), w(4, 4, undefined, 2), w(2, 6)]),
    ).toBe("2-4-6-8-6-4-2 @ +6 → 6K · 2′ REST");
    expect(line([w(4.5, 4, undefined, 1), w(2, 2)])).toBe(
      "4:30 + 2:00 @ +4 → +2 · 1′ REST",
    );
  });
  it("format 5, count fallback past 8 pieces (range kept when split refs exist)", () => {
    const steps: Step[] = [{ k: "reps", count: 4 }, w(2, 8, undefined, 1), w(1, 2, undefined, 1), w(3, 4, undefined, 1)];
    expect(line(steps)).toBe("12 PIECES @ +8 → +2 · 1′ REST");
  });
  it("format 6, mixed frames name each base; effort prints its word", () => {
    const steps: Step[] = [
      { k: "w", duration: { kind: "time", minutes: 4 }, ref: { base: "2k", off: 4 }, restMinutes: 2 },
      w(10, 8),
    ];
    expect(line(steps)).toBe("4:00 @ 2K+4 + 10:00 @ 6K+8 · 2′ REST");
    expect(
      line([
        { k: "w", duration: { kind: "time", minutes: 5 }, ref: { effort: "max" }, restMinutes: 3 },
        w(10, 8),
      ]),
    ).toBe("5:00 @ MAX + 10:00 @ 6K+8 · 3′ REST");
  });
  it("format 7, distance", () => {
    const steps: Step[] = [
      { k: "reps", count: 8 },
      { k: "w", duration: { kind: "distance", meters: 500 }, ref: { base: "6k", off: -4 }, restMinutes: 1 },
    ];
    expect(line(steps)).toBe("8 × 500m @ 6K−4 · 1′ REST");
  });
  it("unequal rests drop the rest clause; a test step forces the count form", () => {
    expect(line([w(4, 8, undefined, 2), w(4, 8, undefined, 1), w(4, 8)])).toBe(
      "3 × 4:00 @ 6K+8",
    );
    expect(line([w(10, 8, undefined, 2), { k: "test", label: "All out" }])).toBe(
      "2 PIECES @ 6K+8 · 2′ REST",
    );
  });
  it("property: every one of the 300 real workouts produces a sane line", () => {
    for (const wk of LIBRARY_WORKOUTS) {
      const out = structureLine(wk.steps);
      expect(out.length, wk.title).toBeGreaterThan(0);
      expect(out, wk.title).not.toMatch(/undefined|NaN/);
    }
  });
});
```

NOTE on the format-5 example: 4 × (2+1+3) with equal rests keeps the
range and rest; NOTE on the test-step fallback: a 2-piece set with a
test step still states the split piece's frame as the range (a single
split ref collapses the range to `@ 6K+8`). NOTE the unequal-rest
uniform set stays format 2 (identity ignores rest) with the clause
dropped. These are the precedence rules from the spec, exercised at
their boundaries. Import path for `LIBRARY_WORKOUTS` in a domain test:
check an existing domain test for the established relative path to
`server/seed/library/index.js` — if no domain test imports it today
(likely, domain must not import server code), put the property test in
a separate `app/server/stepDetailLibrary.test.ts` (the unit project's
non-src glob precedent: `releaseAssets.test.ts`) instead, and note it
in your report.

- [ ] **Step 2: run, verify failure** — `pnpm test --project unit` from `app/` (module missing).

- [ ] **Step 3: implement** `app/domain/display/stepDetail.ts`:

```typescript
import { phases, estimateMinutes, phaseSeconds } from "../expand.js";
import { fmtDuration } from "../duration.js";
import { fmtSplit } from "../format.js";
import { effortWord, isEffortRef } from "../pace.js";
import type { Baselines, PaceRef, Step } from "../types.js";

/** Per-piece display rows for Today's suggestion card (spec §1/§2).
 *  Requires concrete baselines: the card cannot render without them
 *  (Today.tsx's BaselineCard swap), and phases() would throw anyway. */
export interface PieceRow {
  duration: string;
  refTextFull: string | null;
  refTextCompact: string | null;
  effortText: string | null;
  restText: string | null;
  split: string | null;
  spm: number | null;
  off: number | null;
}

const MINUS = "−";
const PRIME = "′";

function fmtOff(off: number): string {
  return off < 0 ? `${MINUS}${-off}` : `+${off}`;
}

function fmtRest(minutes: number, suffix: string): string {
  return Number.isInteger(minutes)
    ? `${minutes}${PRIME} ${suffix}`
    : `${fmtDuration(minutes)} ${suffix}`;
}

export function pieceList(steps: Step[], baselines: Baselines): PieceRow[] {
  const all = phases(steps, baselines);
  const rows: PieceRow[] = [];
  const bases = new Set<string>();
  for (const p of all) {
    if (p.type === "work" && p.targetKind === "split" && p.ref && !isEffortRef(p.ref)) {
      bases.add(p.ref.base);
    }
  }
  const sharedBase = bases.size === 1;
  let restCarry: number | null = null;
  for (const p of all) {
    if (p.type === "rest") {
      // attach to the preceding piece (spec: rest belongs to the piece
      // it follows); phases() emits rests AFTER their work phase for
      // both authored r steps and restMinutes.
      if (rows.length > 0 && p.seconds !== undefined) {
        const prev = rows[rows.length - 1];
        const mins = p.seconds / 60;
        prev.restText =
          prev.restText === null
            ? fmtRest(mins, "r")
            : prev.restText; // two consecutive rests: keep the first, the
        // second is unreachable in practice (phases() folds); if it ever
        // happens the first shown is still true.
      } else {
        restCarry = p.seconds ?? null; // leading rest: dropped (nothing to attach to)
      }
      continue;
    }
    if (p.type === "warmup") continue; // cannot occur from Step[]; belt-and-braces
    if (p.type === "test") {
      rows.push({
        duration: p.label,
        refTextFull: null,
        refTextCompact: null,
        effortText: null,
        restText: null,
        split: null,
        spm: null,
        off: null,
      });
      continue;
    }
    // work
    const duration =
      p.meters !== undefined
        ? `${p.meters}m`
        : fmtDuration((p.seconds ?? 0) / 60);
    if (p.targetKind === "effort") {
      rows.push({
        duration,
        refTextFull: null,
        refTextCompact: null,
        effortText: p.label.toUpperCase(),
        restText: null,
        split: null,
        spm: p.spm ?? null,
        off: null,
      });
    } else {
      const ref = p.ref as Extract<PaceRef, { base: string }>;
      const off = ref.off;
      const full =
        off === 0 ? `at ${ref.base} pace` : `at ${ref.base} ${fmtOff(off)}`;
      const compact =
        off === 0
          ? `at ${ref.base} pace`
          : sharedBase
            ? `at ${fmtOff(off)}`
            : full;
      rows.push({
        duration,
        refTextFull: full,
        refTextCompact: compact,
        effortText: null,
        restText: null,
        split: p.targetSplit !== undefined ? fmtSplit(p.targetSplit) : null,
        spm: p.spm ?? null,
        off,
      });
    }
  }
  void restCarry;
  return rows;
}

/** The tinted row: min |off| among the VISIBLE split-ref rows, ties to
 *  the later row; null when the true peak of the WHOLE set is not
 *  visible, or no row has an offset (spec §2 — a wrong tint is worse
 *  than none). */
export function peakIndex(
  rows: PieceRow[],
  visibleCount: number,
): number | null {
  let best: number | null = null;
  for (let i = 0; i < rows.length; i++) {
    const off = rows[i].off;
    if (off === null) continue;
    if (best === null || Math.abs(off) <= Math.abs(rows[best].off as number)) {
      best = i;
    }
  }
  if (best === null || best >= visibleCount) return null;
  return best;
}

/** The summary foot's numbers. TOTAL is estimateMinutes' own number
 *  (the duration chip's); WORK is the work phases alone. With the
 *  trailing-rest deviation, WORK plus every displayed rest equals
 *  TOTAL by construction. */
export function workAndTotal(
  steps: Step[],
  baselines: Baselines,
): { workMinutes: number; totalMinutes: number } {
  const totalMinutes = estimateMinutes(steps, baselines).minutes;
  let workSeconds = 0;
  for (const p of phases(steps, baselines)) {
    if (p.type !== "work" && p.type !== "test") continue;
    workSeconds += phaseSeconds(p) ?? 0;
  }
  return { workMinutes: Math.round(workSeconds / 60), totalMinutes };
}

// ---------------------------------------------------------------- //
// structureLine: the Library row's one generated line (spec §1/§3). //
// Authored steps only — no phases(), no baselines: it must be total //
// over every stored workout for users with no baselines set.        //
// ---------------------------------------------------------------- //

interface AuthPiece {
  kind: "time" | "distance" | "test";
  minutes?: number;
  meters?: number;
  ref?: PaceRef;
  spm?: number;
  restMinutes: number | null; // the rest FOLLOWING this piece
}

/** Structural expansion of the one-marker repeat model: lead pieces,
 *  then count × the body after the marker (bulk.ts's positional xN). */
function expandAuthored(steps: Step[]): AuthPiece[] {
  const idx = steps.findIndex((s) => s.k === "reps");
  const count = idx === -1 ? 1 : (steps[idx] as { count: number }).count;
  const lead = idx === -1 ? steps : steps.slice(0, idx);
  const body = idx === -1 ? [] : steps.slice(idx + 1);
  const source = [...lead, ...Array.from({ length: count }, () => body).flat()];
  const out: AuthPiece[] = [];
  for (const s of source) {
    if (s.k === "r") {
      if (out.length > 0 && out[out.length - 1].restMinutes === null) {
        out[out.length - 1].restMinutes = s.minutes;
      }
      continue;
    }
    if (s.k === "test") {
      out.push({ kind: "test", restMinutes: null });
      continue;
    }
    if (s.k === "w") {
      out.push({
        kind: s.duration.kind,
        ...(s.duration.kind === "time"
          ? { minutes: s.duration.minutes }
          : { meters: s.duration.meters }),
        ref: s.ref,
        spm: s.spm,
        restMinutes: s.restMinutes ?? null,
      });
    }
  }
  return out;
}

function pieceToken(p: AuthPiece, bare: boolean): string {
  if (p.kind === "distance") return `${p.meters}m`;
  const m = p.minutes as number;
  if (bare && Number.isInteger(m)) return String(m);
  return fmtDuration(m);
}

/** "6K+10" / "6K−4" / "6K" (zero) / "MAX" / "MIN", uppercase idiom. */
function refToken(ref: PaceRef): string {
  if (isEffortRef(ref)) return ref.effort.toUpperCase();
  const base = ref.base.toUpperCase();
  return ref.off === 0 ? base : `${base}${fmtOff(ref.off)}`;
}

/** Offsets-only range, largest → smallest, zero as the bare base
 *  (uppercase). Collapses when all offsets are equal. Split refs only
 *  and single-base only — callers gate. */
function offsetRange(pieces: AuthPiece[]): string {
  const splitRefs = pieces
    .map((p) => p.ref)
    .filter((r): r is Extract<PaceRef, { base: string }> => r !== undefined && !isEffortRef(r));
  const base = splitRefs[0].base.toUpperCase();
  const offs = splitRefs.map((r) => r.off);
  const hi = Math.max(...offs);
  const lo = Math.min(...offs);
  const end = (o: number) => (o === 0 ? base : fmtOff(o));
  if (hi === lo) return hi === 0 ? base : `${base}${fmtOff(hi)}`;
  return `${end(hi)} → ${end(lo)}`;
}

function restClause(pieces: AuthPiece[]): string {
  const rests = pieces.map((p) => p.restMinutes).filter((r): r is number => r !== null);
  if (rests.length === 0) return "";
  const first = rests[0];
  if (!rests.every((r) => r === first)) return "";
  return ` · ${fmtRest(first, "REST")}`;
}

function samePiece(a: AuthPiece, b: AuthPiece): boolean {
  return (
    a.kind === b.kind &&
    a.minutes === b.minutes &&
    a.meters === b.meters &&
    a.spm === b.spm &&
    JSON.stringify(a.ref ?? null) === JSON.stringify(b.ref ?? null)
  );
}

export function structureLine(steps: Step[]): string {
  const pieces = expandAuthored(steps);
  if (pieces.length === 0) return "";
  const rest = restClause(pieces);
  const hasTest = pieces.some((p) => p.kind === "test");
  const real = pieces.filter((p) => p.kind !== "test");
  const splitBases = new Set(
    real
      .map((p) => p.ref)
      .filter((r): r is Extract<PaceRef, { base: string }> => r !== undefined && !isEffortRef(r))
      .map((r) => r.base),
  );
  const anySplit = splitBases.size > 0;
  const singleFrame = splitBases.size === 1 && real.every((p) => p.ref !== undefined && !isEffortRef(p.ref));

  const countForm = () => {
    const at = anySplit && splitBases.size === 1 ? ` @ ${offsetRange(real)}` : "";
    return `${pieces.length} PIECES${at}${rest}`;
  };

  if (hasTest) return countForm();

  // format 2/7: uniform pieces (rest excluded from identity)
  if (real.length > 1 && real.every((p) => samePiece(p, real[0]))) {
    return `${real.length} × ${pieceToken(real[0], false)} @ ${refToken(real[0].ref as PaceRef)}${rest}`;
  }
  // format 1
  if (real.length === 1) {
    return `${pieceToken(real[0], false)} @ ${refToken(real[0].ref as PaceRef)}${rest}`;
  }
  // format 5: too long to chain
  if (real.length > 8) return countForm();
  // format 6: mixed frames or effort among splits — name every segment
  if (!singleFrame) {
    const segs = real.map(
      (p) => `${pieceToken(p, false)} @ ${refToken(p.ref as PaceRef)}`,
    );
    return `${segs.join(" + ")}${rest}`;
  }
  // format 3: two unequal, offsets-only range
  if (real.length === 2) {
    return `${pieceToken(real[0], false)} + ${pieceToken(real[1], false)} @ ${offsetRange(real)}${rest}`;
  }
  // format 4: minute chain
  const chain = real.map((p) => pieceToken(p, true)).join("-");
  return `${chain} @ ${offsetRange(real)}${rest}`;
}
```

- [ ] **Step 4: run, verify green** — full unit project (`pnpm test --project unit`), and note the domain 100% pin: run the coverage variant and read the per-file rows for `stepDetail.ts` (HTML report authoritative).
- [ ] **Step 5: self-mutations** (minimum): flip the tie rule in `peakIndex` (`<=` → `<`) → the 04-of-7 test fails; drop the `best >= visibleCount` guard → the peak-behind-cap test fails; make `offsetRange` first→last instead of max→min → the non-monotonic chain test fails; break `restClause`'s equality check → the unequal-rest test fails; make `expandAuthored` ignore the reps marker → the reps tests fail. Document each fail→restore→pass.
- [ ] **Step 6: gates and commit** — lint, typecheck, format:check, unit project.

```bash
git rev-parse --show-toplevel
git add app/domain/display/ app/server/stepDetailLibrary.test.ts
git commit -m "feat: stepDetail domain module — piece rows and the structure line"
```

---

### Task 2: Today's piece region

**Files:**
- Modify: `app/src/today/Today.tsx` (card region ~line 1045-1079), `app/src/index.css` (region styles), `app/src/theme/tokens.css` (three new tokens)
- Test: `app/src/today/Today.test.tsx` additions, `app/e2e/today.spec.ts` additions, `app/e2e/screenshots.spec.ts` (recapture `today.png`, new `today-capped.png`)

**Interfaces:** consumes Task 1's four exports verbatim.

**Behavior contract (binding; the mock HTML is the pixel authority):**
1. The piece region renders inside the existing card Link, between `.today-card-meta` and the foot, on `--step-region`, when the recommended workout resolves (baselines are guaranteed by `needsBaselineCard`).
2. ≤4 pieces: two-line rows — numeral (mono 10px `--ink-3`), duration+refTextFull+restText (Archivo 15px; ref/rest in muted inks per the mock), split right (mono 14px `--accent`); `NN SPM` beneath (mono 10px `--ink-3`). Effort rows put `ALL OUT`/`EASY` where the split goes.
3. ≥5 pieces: one-line rows (Archivo 14px), refTextCompact, SPM inline (mono 10px) before the split (mono 13px).
4. Cap at 4 rows; then the `+N more pieces` row (44px min-height, dashed top border, `+` and `›` and title in `--accent`, unseen-durations sub-line mono 10px `--ink-3`, first three then `…`). Non-interactive.
5. `peakIndex(rows, 4)` row (when non-null): background `--step-peak`, row text weight 600. Zero-tint states render nothing special.
6. Summary foot on `--step-foot`, top border `--ink`: `{work}′ WORK` (mono 10px, `#3f3c35` = `--ink-2`) + `{total}′ TOTAL` (mono 10px `--ink-3`), plus `· N PIECES` only when capped. Numbers from `workAndTotal`.
7. The reason foot: `suggestion.reason` (full string, wraps, Archivo 13px as today) with a no-shrink mono `OPEN ›` in `--accent` right-aligned; replaces `.today-card-reason`'s line. No new links.
8. Last piece: shows its rest IF the data carries one (the approved deviation), absence still reads set-over on workouts authored without.

- [ ] **Step 1: failing client tests** for the contract: 2-piece card (rows + full refs + no count in foot + foot arithmetic), 7-piece card (compressed + cap + `+3 more pieces` + `6:00 · 4:00 · 2:00` sub-line + `· 7 PIECES`), peak tint present exactly once on the mock-shaped pyramid and ABSENT when the peak is capped out, effort workout (words, zero tint), distance workout (meters + split), trailing-rest display. Fixtures: real `LIBRARY_WORKOUTS` entries wherever one matches the shape; hand-built only for shapes the library lacks (state which in the test name). Read Today.test.tsx's existing harness first.
- [ ] **Step 2: run, verify the new tests fail.**
- [ ] **Step 3: implement** per the contract. CSS: new classes `today-pieces`, `today-piece-row`, `today-piece-row-compact`, `today-piece-peak`, `today-piece-more`, `today-piece-foot` — tokens only; compute and report the contrast of every new text/background pairing (the spec's precomputed numbers are the expectation: 6.93/6.40/6.39 for `--ink-3`, ≥5.11 for `--accent`).
- [ ] **Step 4: green client suite.**
- [ ] **Step 5: e2e + screenshots.** e2e: seeded-data assertions (a split `2:` string in the region; the `+N more` row on a 7-piece pick). Determinism strategy is yours — narrowing Today's filter sheet until the pool is one custom-imported 7-piece workout is the known-good shape; document what you did. Recapture `today.png`; add `today-capped.png` (the 7-piece state); run the design sweep (`design.spec.ts`) and the full e2e suite. **375-wide check (spec §7.1):** capture the capped card at 375×812; if the card + `LAST THREE` heading overflow the first screenful, apply the cap-of-three media query and say so in your report. Also
  spec §7.2: open the seeded 7-piece workout's detail screen in the e2e
  run and confirm it scrolls normally (one sentence in your report).
- [ ] **Step 6: self-mutations** (minimum): remove the `peakIndex` call (no tint) → tint test fails; drop the `· N PIECES` cap condition (always show) → the 2-piece foot test fails; break the foot arithmetic (WORK = TOTAL) → arithmetic test fails.
- [ ] **Step 7: full gates for app/src product code** — lint, typecheck, format:check, unit+client, `pnpm e2e`, screenshots opened and described.
- [ ] **Step 8: commit.**

```bash
git rev-parse --show-toplevel
git add app/src/today/ app/src/index.css app/src/theme/tokens.css app/e2e/ docs/screenshots/
git commit -m "feat: Today prints the pieces — rows, peak tint, cap, summary foot"
```

---

### Task 3: the Library structure line

**Files:**
- Modify: `app/src/library/WorkoutRow.tsx` (insert line 2), `app/src/index.css`
- Test: `app/src/library/` client test additions (check the existing test file name), `app/e2e/library.spec.ts` additions, `app/e2e/screenshots.spec.ts` (recapture `library.png`)

**Interfaces:** consumes `structureLine(steps)` only.

**Behavior contract:**
1. Line 2 of 3: `structureLine(workout.steps)`, IBM Plex Mono 11px, `--ink-2`, single line, `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`.
2. Renders for EVERY row — baselines or none (the function takes none).
3. Rows keep their existing classes/anatomy otherwise; no height assertion elsewhere in the design suite may break (`design.spec.ts`'s exact-height assertions are on other components — verify they stay green).

- [ ] **Step 1: failing client tests**: a real library workout's row shows its exact structure line (pick one per format from the seeds — at minimum a single, a uniform-repeat, and a chain — assert the verbatim string); a no-baselines render still shows the line.
- [ ] **Step 2: run, verify failure. Step 3: implement. Step 4: green.**
- [ ] **Step 5: e2e + screenshots** — first Library row's middle line non-empty; recapture `library.png`; full e2e + design sweep.
- [ ] **Step 6: self-mutation** — render `""` instead of the line → tests fail; restore.
- [ ] **Step 7: full gates. Step 8: commit.**

```bash
git rev-parse --show-toplevel
git add app/src/library/ app/src/index.css app/e2e/ docs/screenshots/
git commit -m "feat: Library rows state the structure"
```
