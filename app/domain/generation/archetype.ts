import { estimateMinutes, liveSteps } from "../expand.js";
import { isEffortRef } from "../pace.js";
import type { Baselines, SplitRef, Step, WorkoutInput } from "../types.js";

// The variety audit's classifier (design spec §5b, adversarial review
// M1/M2/M3): no archetype classifier existed anywhere in the repo before
// this file. The six-member vocabulary below is the UNIFIED one the
// adversarial review's M1 finding demanded — it resolves the collision
// between `patterns.json`'s digest vocabulary (continuous / nxtime /
// nxdistance / mixed / ladder / pyramid / unmapped) and §5b's original
// histogram vocabulary (continuous / evenly-split intervals / pyramid /
// ladder / rate-change / mixed) by: dropping `unmapped` (a book-digest
// artifact, not a step-grammar output — every authored Step[] IS
// expressible, so a classifier over real content never needs it),
// replacing "evenly-split intervals" with the digest's own nxtime/
// nxdistance split (kind-specific, since a workout's pieces are either
// all time-based or all distance-based in current content), and — per
// M1's own resolution — pulling `rate-change` OUT of the archetype
// enumeration entirely: it is a MODIFIER flag (spm varies across a
// workout's live work steps), orthogonal to structure, because a rate
// change can ride on top of any structural archetype (Petrichor is
// nxtime+rateChange, Tule Fog is ladder+rateChange — see archetype.test.ts's
// hand-labels).
export type Archetype =
  "continuous" | "nxtime" | "nxdistance" | "ladder" | "pyramid" | "mixed";

export interface ArchetypeResult {
  archetype: Archetype;
  rateChange: boolean;
}

type WorkStep = Extract<Step, { k: "w" }>;

function workDurationValue(s: WorkStep): number {
  return s.duration.kind === "time" ? s.duration.minutes : s.duration.meters;
}

// Strictly increasing or strictly decreasing, length >= 2. A 2-element
// sequence of distinct values is trivially monotonic — this is the exact
// "2-rung ladder" boundary the brief calls out: two EQUAL durations is
// nxtime/nxdistance (handled by the caller before this is reached), two
// DIFFERENT durations is a ladder, there is no third reading.
function isStrictlyMonotonic(values: number[]): boolean {
  let increasing = true;
  let decreasing = true;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! <= values[i - 1]!) increasing = false;
    if (values[i]! >= values[i - 1]!) decreasing = false;
  }
  return increasing || decreasing;
}

// Strictly up then strictly down, with the peak strictly inside the
// sequence (not at either end — an end-peak IS a ladder, already handled
// earlier). Only ever called with n >= 3: the caller reaches this after
// `isStrictlyMonotonic` has already failed, and any 2-value sequence is
// trivially monotonic in one direction (equal values took the "uniform"
// branch, unequal values took the ladder branch) — so a shorter sequence
// never falls through to here.
function isPyramid(values: number[]): boolean {
  const n = values.length;
  for (let peak = 1; peak <= n - 2; peak++) {
    const upOk = values
      .slice(0, peak + 1)
      .every((v, i, arr) => i === 0 || v > arr[i - 1]!);
    const downOk = values
      .slice(peak)
      .every((v, i, arr) => i === 0 || v < arr[i - 1]!);
    if (upOk && downOk) return true;
  }
  return false;
}

/** One sequence, classified on its own terms. Returns null for an empty
 *  sequence; every other input gets an archetype. */
function classifySequence(workSteps: WorkStep[]): Archetype | null {
  if (workSteps.length === 0) return null;
  if (workSteps.length === 1) return "continuous";
  const allTime = workSteps.every((s) => s.duration.kind === "time");
  const allDistance = workSteps.every((s) => s.duration.kind === "distance");
  if (!allTime && !allDistance) return "mixed";
  const values = workSteps.map(workDurationValue);
  if (new Set(values).size === 1) return allTime ? "nxtime" : "nxdistance";
  if (isStrictlyMonotonic(values)) return "ladder";
  if (isPyramid(values)) return "pyramid";
  return "mixed";
}

/** The length of the shortest block this sequence is a whole number of
 *  repetitions of, or null when it does not repeat. Read off the sequence
 *  itself, NOT off the `reps` marker: `3× [3', 2']` and the same six pieces
 *  typed out flat are the same session and must classify the same way. */
export function smallestPeriod(values: number[]): number | null {
  const n = values.length;
  for (let p = 1; p < n; p++) {
    if (n % p !== 0) continue;
    if (values.every((v, i) => v === values[i % p]!)) return p;
  }
  return null;
}

/**
 * Classifies a workout's structural archetype.
 *
 * FIRST over the liveSteps-expanded signature (reps blocks expanded — the
 * same expansion `phases()`/`estimateMinutes` use everywhere else, so "how
 * many pieces" never disagrees between the timer, the seed gate and this
 * classifier).
 *
 * **§5b BLOCK REVIEW AMENDMENT (2026-08-10).** The expanded reading alone
 * COLLAPSES two structures the library really has, because a sequence that
 * restarts is never globally monotonic:
 *
 *   - `15' then 4× 3'` (AT Katabatic Wind) expands to [15,3,3,3,3] — a lead
 *     piece in front of a flat block — and reads `mixed`.
 *   - `4× [75 s, 30 s]` (AN Giant Hail) expands to [1.25,.5,1.25,.5,…] and
 *     reads `mixed`, as do an ASCENDING 2×[4 rungs] and a DESCENDING one.
 *
 * The block review found the second collapse doing real damage: it is what
 * made `AN|20-30`'s three "near-duplicates" (Giant Hail / Flash Flood /
 * Bomb Cyclone), which a content reviewer would never call the same
 * workout, and that manufactured debt was on its way to James's gate-2
 * table dressed as content debt.
 *
 * So the reading is now: the expansion FIRST, and only where the expansion
 * says `mixed` do two reductions apply, in order — set the lead aside and
 * read the body; then read the repeated block's OWN shape instead of its
 * expansion. A workout that already classified cannot be reclassified by
 * either reduction, which is what keeps the amendment from disturbing the
 * 27 hand-labels that were right the first time.
 *
 * The lead itself is not lost: `structureSignature` records it, and the
 * near-duplicate key reads it (a "flat block with a lead" and a bare flat
 * block are both `nxtime` and are not duplicates of each other).
 *
 * rateChange is a MODIFIER, not a seventh archetype (adversarial M1): true
 * whenever two or more live work steps carry different `spm` values,
 * regardless of which archetype the durations produce.
 */
export function classifyArchetype(steps: Step[]): ArchetypeResult {
  const workSteps = liveSteps(steps).filter((s): s is WorkStep => s.k === "w");

  const spms = workSteps
    .map((s) => s.spm)
    .filter((spm): spm is number => spm !== undefined);
  const rateChange = new Set(spms).size > 1;

  const whole = classifyBody(workSteps);
  if (whole !== null && whole !== "mixed") {
    return { archetype: whole, rateChange };
  }
  // Set a LEAD aside and read what follows. The opening piece only counts
  // as a lead if it stands outside the body's own range — otherwise every
  // [2,2,3] would become "a 2-rung ladder with a lead", which is not a
  // lead, it is a plateau, and the strictness that separates ladder from
  // mixed would be gone.
  if (workSteps.length >= 3) {
    const body = workSteps.slice(1);
    const values = body.map(workDurationValue);
    const head = workDurationValue(workSteps[0]!);
    const standsApart =
      workSteps[0]!.duration.kind === body[0]!.duration.kind &&
      (head > Math.max(...values) || head < Math.min(...values));
    const tail = standsApart ? classifyBody(body) : null;
    if (tail !== null && tail !== "mixed") {
      return { archetype: tail, rateChange };
    }
  }
  return { archetype: "mixed", rateChange };
}

/** A sequence read directly, and — only if that says `mixed` — read again
 *  as the block it repeats. */
function classifyBody(workSteps: WorkStep[]): Archetype | null {
  const direct = classifySequence(workSteps);
  if (direct === null || direct !== "mixed") return direct;
  const period = smallestPeriod(workSteps.map(workDurationValue));
  // period 1 is a uniform sequence, which `classifySequence` already named.
  if (period !== null && period > 1) {
    return classifySequence(workSteps.slice(0, period));
  }
  return "mixed";
}

/** The SHAPE of a workout's session, as a comparable string: the sequence
 *  of rung-to-rung directions over the expanded live work steps ("+" longer,
 *  "-" shorter, "=" the same). A single-piece workout signs as "".
 *
 *  This is the block review's own remedy for the collapse
 *  `classifyArchetype` now avoids ("add the authored block signature to the
 *  near-duplicate key"), taken over the EXPANSION rather than the authored
 *  block so that it stays a property of the session and not of how the
 *  session was typed. Two workouts that share an archetype, a piece count
 *  and a duration but ascend where the other descends — AN Flash Flood
 *  ("+++-+++") against AN Bomb Cyclone ("---+---") — are not near-
 *  duplicates, and before this key they were counted as such. */
export function structureSignature(steps: Step[]): string {
  // workDurationValue yields raw minutes for timed steps and raw meters for
  // distance steps, so for a mixed-kind session the +/-/= comparisons cross
  // units. The signs are only ever compared signature-to-signature, never
  // interpreted as magnitudes — do not reuse this array for anything that
  // needs commensurable values.
  const values = liveSteps(steps)
    .filter((s): s is WorkStep => s.k === "w")
    .map(workDurationValue);
  return values
    .slice(1)
    .map((v, i) => (v > values[i]! ? "+" : v < values[i]! ? "-" : "="))
    .join("");
}

// ---------------------------------------------------------------------
// Near-duplicate detection (§5b, adversarial M3's resolution)
// ---------------------------------------------------------------------

export interface DuplicatePair {
  a: string;
  b: string;
  archetype: Archetype;
  pieceCount: number;
  /** `structureSignature` — the authored build both sides share. */
  build: string;
  totalA: number;
  totalB: number;
}

// "Piece count" = expanded phase count via liveSteps (§5b's own words),
// resolving M3's ambiguity for a `{k:"reps", count:n}` block explicitly in
// favor of the EXPANDED reading: 4 reps over 2 work steps is 8 pieces, not
// 2 — the same count `classifyArchetype` above already computes its
// signature over.
function pieceCount(steps: Step[]): number {
  return liveSteps(steps).filter((s) => s.k === "w").length;
}

// Fraction of a workout's live work steps that are EffortRef rather than
// SplitRef ("effort share", the same term/definition `patterns.json`'s
// book-cell `effortShare` column already uses per §6's legend: "fraction
// prescribed by effort rather than split").
function effortShare(steps: Step[]): number {
  const workSteps = liveSteps(steps).filter((s): s is WorkStep => s.k === "w");
  if (workSteps.length === 0) return 0;
  const effortCount = workSteps.filter((s) => isEffortRef(s.ref)).length;
  return effortCount / workSteps.length;
}

// "Same offset band" applies to SplitRefs only (§5b) — an EffortRef has no
// `.off` (adversarial M3: `types.ts`'s key-presence union carries no field
// to band). Band width 4 s/500m, chosen off the one type header that DOES
// carry a numeric offset calibration (`o2.ts:7-12`: steady 6k+8..+12 is a
// 4-wide window, tightened-to-firm 6k+4 is another 4-wide step, and the
// designated-float ceiling 6k+13..+16 is a third) — the only committed
// evidence in the repo for how wide a "band" of intent reads as the same
// prescription. A ladder/pyramid's offset typically drifts across its
// rungs (Tule Fog: 6k+12 -> +11 -> +10), so the band key is the SORTED
// UNIQUE set of (base, band) pairs across every live SplitRef work step,
// not just the first or last rung — two workouts collide only if their
// whole offset "shape" bands the same way, not merely their opening rung.
const OFFSET_BAND_WIDTH = 4;

function offsetBandKey(steps: Step[]): string | null {
  const workSteps = liveSteps(steps).filter((s): s is WorkStep => s.k === "w");
  const splitRefs = workSteps
    .map((s) => s.ref)
    .filter((ref): ref is SplitRef => !isEffortRef(ref));
  if (splitRefs.length === 0) return null;
  const bands = splitRefs.map((ref) => {
    const band = Math.round(ref.off / OFFSET_BAND_WIDTH) * OFFSET_BAND_WIDTH;
    return `${ref.base}:${band}`;
  });
  return [...new Set(bands)].sort().join(",");
}

// Effort-share bucket width 0.25 — coarse enough that a workout with one
// stray split-paced float among mostly-effort pieces still buckets with an
// all-effort sibling (the AN cells M3 measured mix effort and split
// liberally), fine enough that a majority-split workout never buckets with
// a majority-effort one.
function effortBucket(share: number): number {
  return Math.round(share / 0.25) * 0.25;
}

/**
 * Near-duplicate pairs within the given workout list (callers pass one
 * type x band cell — "near-duplicate" is a within-cell concept, §5b).
 *
 * Key (§5b): same archetype + same piece count + **same authored build**
 * (`structureSignature`, the block review amendment) + total within 10% of
 * each other + a same-ness arm keyed on ref kind — same offset band for a
 * SplitRef-bearing workout (M3's fix: EffortRef workouts have no offset to
 * band, so they never compare on this arm), same effort-share bucket for
 * an EffortRef-bearing workout instead (adversarial M3 / this task's
 * brief: "the EffortRef arm (effort share + archetype + duration)").
 *
 * The ref-kind arm is an OR, not an AND (block review m3 — the previous
 * wording of this paragraph said "AND" and the code has always said `if
 * (!offsetMatch && !effortMatch) continue`): a workout carrying both ref
 * kinds is a near-duplicate of another if it matches on EITHER arm, which
 * is the stricter reading and flags more pairs. A workout with only one
 * kind never collides with a workout that only has the other, even if
 * every other key element matches — comparing an effort-only and a
 * split-only workout would only ever produce a degenerate always-equal
 * key on the arm neither carries.
 */
export function nearDuplicates(
  workouts: WorkoutInput[],
  baselines: Baselines,
): DuplicatePair[] {
  const rows = workouts.map((w) => {
    const { minutes } = estimateMinutes(w.steps, baselines);
    const { archetype } = classifyArchetype(w.steps);
    return {
      title: w.title,
      archetype,
      pieces: pieceCount(w.steps),
      build: structureSignature(w.steps),
      total: minutes,
      offsetKey: offsetBandKey(w.steps),
      effortKey:
        effortShare(w.steps) > 0 ? effortBucket(effortShare(w.steps)) : null,
    };
  });

  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (a.archetype !== b.archetype) continue;
      if (a.pieces !== b.pieces) continue;
      if (a.build !== b.build) continue;
      const bigger = Math.max(a.total, b.total);
      if (bigger === 0) continue;
      if (Math.abs(a.total - b.total) / bigger > 0.1) continue;

      const offsetMatch =
        a.offsetKey !== null && b.offsetKey !== null
          ? a.offsetKey === b.offsetKey
          : false;
      const effortMatch =
        a.effortKey !== null && b.effortKey !== null
          ? a.effortKey === b.effortKey
          : false;
      if (!offsetMatch && !effortMatch) continue;

      pairs.push({
        a: a.title,
        b: b.title,
        archetype: a.archetype,
        pieceCount: a.pieces,
        build: a.build,
        totalA: a.total,
        totalB: b.total,
      });
    }
  }
  return pairs;
}
