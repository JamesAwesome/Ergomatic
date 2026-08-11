import { phases, estimateMinutes, phaseSeconds } from "../expand.js";
import { fmtDuration } from "../duration.js";
import { fmtSplit } from "../format.js";
import { isEffortRef } from "../pace.js";
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
  // How many consecutive identical pieces this row stands for (2026-08-11
  // spec: pieceList rolls runs before returning). 1 for a lone piece;
  // `rollRuns` below is the only place this ever exceeds 1.
  count: number;
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
    if (
      p.type === "work" &&
      p.targetKind === "split" &&
      p.ref &&
      !isEffortRef(p.ref)
    ) {
      bases.add(p.ref.base);
    }
  }
  const sharedBase = bases.size === 1;
  for (const p of all) {
    if (p.type === "rest") {
      // attach to the preceding piece (spec: rest belongs to the piece
      // it follows); phases() emits rests AFTER their work phase for
      // both authored r steps and restMinutes. A leading rest (nothing in
      // `rows` yet — an authored workout opening on a standalone "r" step)
      // has nothing to attach to and is simply dropped: nothing tracks it,
      // there is no later "carry it forward" case for a rest that precedes
      // every piece.
      if (rows.length > 0) {
        const prev = rows[rows.length - 1];
        const mins = (p.seconds as number) / 60;
        prev.restText =
          prev.restText === null ? fmtRest(mins, "r") : prev.restText;
        // phases() does NOT fold consecutive rests — two rest phases in a
        // row (a "w" step's own restMinutes immediately followed by an
        // authored "r" step) both arrive here as separate phases; this
        // ternary is what drops the second one from display, deliberately
        // (the tested behaviour: the first shown is kept). validateSteps
        // allows the shape; zero library workouts currently author it.
      }
      continue;
    }
    // "warmup" phases only ever come from buildRun (engine.ts) prepending
    // its own preference-driven phase — a Step[]-driven phases() call (this
    // function's only input) can never produce one (expand.ts's switch only
    // emits rest/test/work from "r"/"test"/"w" steps), so there is no
    // `p.type === "warmup"` case to handle here at all.
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
        count: 1,
      });
      continue;
    }
    // work — expand.ts's phases() always sets exactly one of
    // seconds/meters for a work phase (its own `s.duration.kind` branch),
    // so `p.seconds` is guaranteed defined whenever `p.meters` is not.
    const duration =
      p.meters !== undefined
        ? `${p.meters}m`
        : fmtDuration((p.seconds as number) / 60);
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
        count: 1,
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
        // this branch only runs for targetKind "split" (the "effort" case
        // returned above), and expand.ts's resolveSplit path always sets
        // targetSplit for a split-ref work phase given concrete Baselines
        // (this function's own signature) — never undefined here.
        split: fmtSplit(p.targetSplit as number),
        spm: p.spm ?? null,
        off,
        count: 1,
      });
    }
  }
  return rollRuns(rows);
}

/** Rolls consecutive identical rows into one (2026-08-11 spec, James's
 *  consecutive-runs ruling: "any run of 2+ identical consecutive pieces
 *  collapses to one row, anywhere in the set"). Identity: duration, ref
 *  rendering, effort, spm, split, off, AND rest all equal — a rest
 *  boundary breaks a run (rule 1). The workout's FINAL row may join the
 *  run before it when it differs ONLY by carrying no trailing rest
 *  (rule 2) — the rolled row keeps the run's inter-piece rest either way.
 *  Test rows (no split, no effort — `joinsRun`'s `isWork` guard) never
 *  roll (rule 3): they carry no per-piece identity to compare, and two
 *  authored test steps are always distinct events even when their label
 *  happens to match. Only ADJACENT output rows are ever compared — this
 *  is what makes it a run of CONSECUTIVE pieces, not a fold of every
 *  matching row in the set (the pyramid's two off-6 ends, five rows
 *  apart, must never merge). */
function rollRuns(rows: PieceRow[]): PieceRow[] {
  const out: PieceRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prev = out[out.length - 1];
    if (prev !== undefined && joinsRun(prev, row, i === rows.length - 1)) {
      prev.count += 1;
      continue;
    }
    out.push({ ...row });
  }
  return out;
}

function joinsRun(prev: PieceRow, row: PieceRow, isFinal: boolean): boolean {
  const isWork = row.split !== null || row.effortText !== null;
  if (!isWork) return false; // test rows stay single
  const sameCore =
    prev.duration === row.duration &&
    prev.refTextFull === row.refTextFull &&
    prev.effortText === row.effortText &&
    prev.spm === row.spm &&
    prev.split === row.split &&
    prev.off === row.off;
  if (!sameCore) return false;
  if (prev.restText === row.restText) return true;
  // rule 2: the trailing-rest exception. Only the workout's true final row
  // may join by differing SOLELY in carrying no rest of its own — a
  // mid-run row with a different (non-null) rest is a genuine rest-
  // boundary break (rule 1), never this exception.
  return isFinal && row.restText === null && prev.restText !== null;
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
    // switch, not an if-chain: mirrors expand.ts's own phases() dispatch on
    // `s.k`, and — same as that function's liveIndices/phases defense —
    // deliberately has no "reps" case. `idx` above is the FIRST "reps"
    // found, so `lead` (before it) can never contain one and `body` (after
    // it) can only contain a second, validate.ts-rejected marker; a switch
    // with no matching case is a silent no-op for that shape, same as
    // expand.ts's `.filter((e) => e.step.k !== "reps")` drops it there.
    switch (s.k) {
      case "r":
        if (out.length > 0 && out[out.length - 1].restMinutes === null) {
          out[out.length - 1].restMinutes = s.minutes;
        }
        break;
      case "test":
        out.push({ kind: "test", restMinutes: null });
        break;
      case "w":
        out.push({
          kind: s.duration.kind,
          ...(s.duration.kind === "time"
            ? { minutes: s.duration.minutes }
            : { meters: s.duration.meters }),
          ref: s.ref,
          spm: s.spm,
          restMinutes: s.restMinutes ?? null,
        });
        break;
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
    .filter(
      (r): r is Extract<PaceRef, { base: string }> =>
        r !== undefined && !isEffortRef(r),
    );
  const base = splitRefs[0].base.toUpperCase();
  const offs = splitRefs.map((r) => r.off);
  const hi = Math.max(...offs);
  const lo = Math.min(...offs);
  const end = (o: number) => (o === 0 ? base : fmtOff(o));
  if (hi === lo) return hi === 0 ? base : `${base}${fmtOff(hi)}`;
  return `${end(hi)} → ${end(lo)}`;
}

/** The clause appears only when every INTER-PIECE rest is equal (spec's
 *  own rule) — that means every INTERIOR gap (the rest after every piece
 *  but the last) must be PRESENT and equal to the others; a missing
 *  interior gap is not "equal" to a present one, it is a different rest
 *  pattern the clause would misstate (Stratocumulus: 3×(8' no-rest + 8'
 *  rest2) reads as "· 2′ REST" only if a filter drops the nulls before
 *  the equality check — that was the bug). The LAST piece's own
 *  restMinutes is the trailing rest (the DEVIATION §2 already shows on
 *  its own row): it may be absent (the brief's own uniform-repeat
 *  contract strings authored without a trailing rest) or equal to the
 *  interior value without affecting the clause, but if it is PRESENT and
 *  DIFFERENT, the clause is dropped too — it would otherwise claim a
 *  rest after the whole set has stopped.
 */
function restClause(pieces: AuthPiece[]): string {
  const last = pieces.length - 1;
  const interior = pieces.slice(0, last).map((p) => p.restMinutes);
  if (interior.some((r) => r === null)) return "";
  const value = interior.length > 0 ? interior[0] : pieces[last].restMinutes;
  if (value === null) return "";
  if (!interior.every((r) => r === value)) return "";
  const trailing = pieces[last].restMinutes;
  if (interior.length > 0 && trailing !== null && trailing !== value) {
    return "";
  }
  return ` · ${fmtRest(value, "REST")}`;
}

function samePiece(a: AuthPiece, b: AuthPiece): boolean {
  // `ref` is optional only on AuthPiece's type; every real caller here
  // builds `a`/`b` from `real` (test pieces filtered out), and a "w" step
  // always carries a `ref` (Step's own type), so it is never actually
  // undefined at this call site.
  return (
    a.kind === b.kind &&
    a.minutes === b.minutes &&
    a.meters === b.meters &&
    a.spm === b.spm &&
    JSON.stringify(a.ref) === JSON.stringify(b.ref)
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
      .filter(
        (r): r is Extract<PaceRef, { base: string }> =>
          r !== undefined && !isEffortRef(r),
      )
      .map((r) => r.base),
  );
  const anySplit = splitBases.size > 0;
  const singleFrame =
    splitBases.size === 1 &&
    real.every((p) => p.ref !== undefined && !isEffortRef(p.ref));

  const countForm = () => {
    const at =
      anySplit && splitBases.size === 1 ? ` @ ${offsetRange(real)}` : "";
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
