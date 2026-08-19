// Phase LT spec 2 (`docs/superpowers/specs/2026-08-19-series-capture-design.md`
// §1), Task 1. The pure decimating recorder: turns a `MonitorFrame` stream
// into a 1 Hz, C2-logbook-shaped `Sample[]`. No storage, no timers — Task 2
// (`useMonitorSession.ts`) owns feeding `onFrame`, flushing `snapshot()`
// onto `MonitorRun.series`, and calling `stop()` at close.
//
// The work clock (§1's "Decimation" row): 0x0031's own `elapsedSeconds`/
// `distanceMeters` are PER-INTERVAL and FREEZE for the whole trailing rest
// (`domain/monitor/types.ts`'s `MonitorFrame.elapsedSeconds` doc comment,
// walk 4; antagonist-ledger.md's 2026-08-19 spec-stage pass: 66 consecutive
// 0x0031 frames frozen at 60.00/213.7 through `step-3`'s 30s rest). This
// recorder keeps its own cumulative "work clock" — `baseSeconds` (every
// COMPLETED interval's own final pre-reset reading, folded in) plus the
// CURRENT interval's own wire `elapsedSeconds` — never the wall clock,
// never a raw field alone, never `sessionElapsedSeconds` (a different,
// driver-owned derived sum with its own defects, B2).
//
// Because the wire freezes elapsed/distance for a rest's whole duration,
// the work clock stops advancing too — no new whole work-second is ever
// crossed during a rest, so rests produce ZERO samples for free, by
// construction, without this module ever inspecting `state` at all (§1's
// "Rest samples: NONE" row).
//
// GENUINE vs FALSE resets (fix round, task-1 review H1). A reset candidate
// is detected FRAME-STREAM-LOCALLY: a new frame's `elapsedSeconds` reads
// LOWER than the immediately preceding frame's own reading. That alone is
// NOT sufficient to fold: `domain/monitor/types.ts`'s own
// `MonitorFrame.elapsedSeconds` doc comment carries the falsifying half of
// the very citation this module's header used to lean on — "That does NOT
// generalize to every drop in `elapsedSeconds`... a Terminate re-bases
// elapsed backward to a smaller non-zero value WITHOUT clearing distance at
// all" — and `src/monitor/driver.ts`'s own SESSION REGISTER MAP comment
// names the exact cost of trusting the raw edge: "the fold banked a
// distance the machine never cleared — an exact 2.00x, six times in the
// record", which is why THAT module abandoned edge-detection entirely for
// a machine-index-keyed max-merge. This recorder's inputs are deliberately
// narrower than `driver.ts`'s (§1's Source fields row: only 0x0031/0x0032,
// never 0x0033's Interval Count — no reliable per-frame interval identity
// exists here to key a max-merge on), so this module keeps edge-detection
// but adds a GENUINE-BOUNDARY GATE before a detected edge is allowed to
// fold, replaying `docs/monitor/sessions/pm5-session4b-final.log.gz`
// (10,408 frames from four real sessions) to derive it:
//
//   - A genuine boundary's POST-reset `distanceMeters` is near zero (the
//     wire clears distance at the SAME instant it resets elapsed, walk 4)
//     — observed max across 19 genuine boundaries in that capture: 1.1 m.
//     A Terminate's POST-reset distance holds the PRE-reset value exactly
//     (never clears) — observed minimum across the 6 Terminate shapes in
//     that capture: 13.4 m. `MAX_BOUNDARY_RESET_METERS` sits at 3.0,
//     roughly the geometric middle, ~2m of headroom either side.
//   - A genuine boundary's PRE-reset `elapsedSeconds` (the reading about to
//     be folded in) is never a sub-second value in that same capture —
//     observed minimum across the 19 genuine boundaries: 14.14 s. Five
//     further false-shaped decreases exist in the SAME capture that the
//     distance rule alone cannot reject (both readings already sit at
//     0 m — indistinguishable from a genuine boundary on distance alone):
//     backward jitter in the readings arriving in the first fraction of a
//     second right after an ALREADY-genuine reset (observed max pre-reset
//     elapsed across the 5 jitter shapes: 0.87 s). No real interval can
//     complete in under one whole second — this recorder's own decimation
//     floor — so `MIN_COMPLETED_INTERVAL_SECONDS` sits at 1.0: a reset
//     candidate whose own pre-reset elapsed is this small can never have
//     produced a sample of its own regardless, so declining to fold it
//     costs nothing observable in the sample stream, only a sub-second,
//     non-compounding delay in when the base catches up.
//
// Both rules independently verified against the full capture
// (`seriesRecorder.test.ts`'s own H1 section): exactly the 6 Terminate +
// 5 jitter shapes are rejected, all 19 genuine boundaries still fold, and
// the two are exhaustive over every decrease that capture contains.
//
// HONEST RESIDUAL RISK, same class `driver.ts`'s own comment names for the
// fold it replaced: this is still an edge-triggered heuristic on two
// thresholds tuned to the widest gap the available captures show — a
// pathological real sequence (a Terminate whose held distance happens to
// read under 3.0 m, or a genuine interval shorter than 1.0 s) would still
// be misclassified. Neither shape has been observed in any of the four
// committed captures this task read. Stated, not hidden — the fix a
// machine-index-keyed max-merge would need (0x0033's Interval Count, an
// input this module deliberately does not take, §1) is out of this task's
// scope; a future task widening this recorder's inputs is where that
// tradeoff gets revisited, not silently inside this fix.
//
// CORRECTED (Task 1 re-review, comment-only handoff to Task 2): the
// non-compounding-delay wording two paragraphs up is accurate ONLY for the
// jitter shape it describes (a rejected candidate right after an
// ALREADY-genuine reset, where `baseSeconds` is already correct and simply
// resumes once real progress climbs back past the prior high-water mark).
// It undersold a DIFFERENT, worse misclassification this same
// `MAX_BOUNDARY_RESET_METERS` gate can produce: a GENUINE boundary whose
// first post-reset frame is not observed until the rower has already
// covered more than 3.0 m into the new interval — a dropped notification,
// a reconnect gap, a slow poll — reads as `postResetDistanceMeters` already
// past the threshold, and `isGenuineBoundary` rejects a fold that should
// have happened. Unlike the jitter case, this is not a delay: the
// completed interval's own final pre-reset reading is never folded into
// `baseSeconds`/`baseMeters` AT ALL, so every sample this recorder emits
// from that point forward is permanently short by the whole missed
// interval's own duration and distance — not bounded, not self-correcting,
// and not observable from inside this module (nothing here ever learns the
// fold was skipped). Same disclosed-not-hidden posture as the paragraph
// above, and the same out-of-scope fix (a machine-index-keyed max-merge):
// stated honestly here because Task 2's flush/storage layer inherits
// whatever this recorder emits and has no way to detect the gap either.

import type { MonitorFrame } from "../../domain/monitor/types.js";

/** Ruling 2: 4 hours of 1 Hz samples. At the cap, appending stops and
 *  `truncated` is set exactly once — no eviction machinery. */
export const SERIES_SAMPLE_CAP = 14_400;

/** Fix round (MED-LOW-2, RULED): the SAME 20..254 bpm band
 *  `logDraft.ts`'s `MONITOR_HR_MIN`/`MONITOR_HR_MAX` already applies to a
 *  matched-actual's `avgHeartRateBpm` — an independent mirror here rather
 *  than an import (this module is a lower-layer primitive `session/
 *  logDraft.ts` itself depends on via `monitorRun.ts`'s `SeriesData`;
 *  importing back from `logDraft.ts` would cycle). Before this fix, a
 *  belt's own transient out-of-band byte (the wire forwards 1..19
 *  unfiltered — `heartRateBpm` is only ever `null` for the true "no
 *  belt" sentinels 0/255, `domain/monitor/pm5/parse.ts`'s `heartRate()`)
 *  reached the server as a REAL `hr` value, and `data.ts`'s own `HR_MIN`
 *  band (its comment: "reject a hand-crafted liar, not a real monitor
 *  reading") 400ed the WHOLE POST on it — discarding the entire trace
 *  for one out-of-band sample, the opposite of every other pm5 field's
 *  drop-the-field-not-the-save treatment. Same fix, same layer it
 *  belongs at: band it here, at the source, same as `logDraft.ts` already
 *  does for the identical wire quantity one step downstream. */
const HR_MIN = 20;
const HR_MAX = 254;

/** C2 logbook stroke-object shape (§1's Shape row, memo Q3, PRIMARY):
 *  cumulative tenths of a second, cumulative decimeters, tenths of a
 *  second per 500m, whole strokes/min. `hr` is ABSENT (never
 *  `undefined`-but-present) when the wire's own heart-rate sentinel
 *  resolved to `null` upstream (`domain/monitor/pm5/parse.ts`'s
 *  `heartRate()` — 255 or 0 -> `null` -> this module omits the key), OR
 *  (fix round, MED-LOW-2) when it's a genuine but out-of-band reading
 *  (the wire forwards 1..19 unfiltered) — this module bands `hr` to
 *  20..254 at construction, same as `logDraft.ts`'s identical
 *  `MONITOR_HR_MIN`/`MAX` treatment one step downstream, so a transient
 *  bad byte never costs the whole trace at the server's own stricter
 *  gate (`data.ts`'s `HR_MIN`/`MAX` 400s the WHOLE POST on an in-range
 *  check, not just this one field).
 *
 *  `readonly` fields, and every `Sample` this module ever hands out is
 *  additionally `Object.freeze`d at creation (fix round, L2): `snapshot()`
 *  returns a FRESH `samples` array on every call, but the `Sample` objects
 *  inside it are the SAME shared instances across calls (and across every
 *  caller that ever received them) — never copied. Callers must treat
 *  every `Sample` as immutable; the freeze makes a mutation attempt throw
 *  in strict mode (every ESM module in this codebase) rather than silently
 *  corrupting this recorder's own internal history. */
export interface Sample {
  readonly t: number;
  readonly d: number;
  readonly p: number;
  readonly spm: number;
  readonly hr?: number;
}

export interface SeriesData {
  samples: Sample[];
  truncated?: true;
}

/** A reset CANDIDATE is a genuine wire drop, never float noise on a held
 *  reading — half a hundredth-of-a-second (the wire's own smallest unit)
 *  is well under any real interval's shortest possible duration. Whether a
 *  candidate is allowed to FOLD is `isGenuineBoundary`'s own question. */
const RESET_EPSILON_SECONDS = 0.005;
/** Guards the whole-second `Math.floor` bucket against a value that is
 *  mathematically exactly on an integer boundary landing a hair under it
 *  from float accumulation (`baseSeconds` is a running sum of prior
 *  finals). */
const BUCKET_EPSILON_SECONDS = 1e-9;

/** See this file's own header comment for the full derivation and the
 *  captured evidence both thresholds are tuned against
 *  (`pm5-session4b-final.log.gz`, 30 total reset candidates: 19 genuine,
 *  6 Terminate, 5 jitter). */
const MIN_COMPLETED_INTERVAL_SECONDS = 1.0;
const MAX_BOUNDARY_RESET_METERS = 3.0;

/**
 * True when a detected elapsed-decrease represents a GENUINE interval
 * boundary (the wire clears distance at the same instant, walk 4) rather
 * than a Terminate (holds distance exactly, `types.ts`'s own doc-cited
 * capture) or sub-second jitter immediately after an already-genuine reset
 * (too short to ever have produced a sample of its own). Exported for
 * direct testing against `pm5-session4b-final.log.gz`'s own real shapes —
 * `seriesRecorder.test.ts`'s H1 section.
 *
 * @param priorElapsedSeconds The immediately preceding frame's own
 *   `elapsedSeconds` reading — what a genuine boundary would fold IN.
 * @param postResetDistanceMeters The new (post-decrease) frame's own
 *   `distanceMeters` reading.
 */
export function isGenuineBoundary(
  priorElapsedSeconds: number,
  postResetDistanceMeters: number,
): boolean {
  return (
    priorElapsedSeconds >= MIN_COMPLETED_INTERVAL_SECONDS &&
    postResetDistanceMeters <= MAX_BOUNDARY_RESET_METERS
  );
}

export interface SeriesRecorder {
  onFrame(f: MonitorFrame): void;
  snapshot(): SeriesData | undefined;
  stop(): void;
}

export function createSeriesRecorder(): SeriesRecorder {
  const samples: Sample[] = [];
  let truncated = false;
  let stopped = false;

  /** Folded total (seconds) of every COMPLETED interval's own final
   *  pre-reset `elapsedSeconds` reading. */
  let baseSeconds = 0;
  /** Folded total (meters) of every COMPLETED interval's own final
   *  pre-reset `distanceMeters` reading — the identical fold as
   *  `baseSeconds`, keyed off the SAME reset (the wire resets both
   *  fields together at once, `types.ts`'s own walk-4 citation). */
  let baseMeters = 0;
  /** The immediately preceding frame's own raw reading — what a genuine
   *  reset folds IN, and what a reset candidate is detected AGAINST.
   *  `null` before the first frame (nothing to compare, nothing to fold).
   *  Elapsed and distance are held as ONE pair, set together on every
   *  frame, so a reset (which only ever fires once `lastReading` is
   *  non-null) can never observe one half of the pair without the other —
   *  no fallback value is ever needed for `distanceMeters` here. */
  let lastReading: { elapsedSeconds: number; distanceMeters: number } | null =
    null;
  /** The highest whole work-second bucket already claimed by a sample.
   *  `-1` before the first sample so bucket 0 (the very first frame,
   *  however early) can still win. */
  let lastEmittedBucket = -1;

  function onFrame(f: MonitorFrame): void {
    if (stopped || truncated) return;

    const elapsed = f.elapsedSeconds;
    const distance = f.distanceMeters;

    if (
      lastReading !== null &&
      elapsed < lastReading.elapsedSeconds - RESET_EPSILON_SECONDS &&
      isGenuineBoundary(lastReading.elapsedSeconds, distance)
    ) {
      // Genuine interval boundary: fold the COMPLETED interval's own final
      // pre-reset readings in, then this frame starts the new interval. A
      // REJECTED candidate (a Terminate, or sub-second jitter) folds
      // NOTHING — `lastReading` still updates below, so the work clock
      // simply reads `baseSeconds` (unchanged) plus this frame's own
      // smaller `elapsed`, which is LOWER than the previous high-water
      // mark and so cannot win a new bucket (the guard below) until real
      // progress climbs back past it.
      baseSeconds += lastReading.elapsedSeconds;
      baseMeters += lastReading.distanceMeters;
    }
    lastReading = { elapsedSeconds: elapsed, distanceMeters: distance };

    const workClockSeconds = baseSeconds + elapsed;
    const bucket = Math.floor(workClockSeconds + BUCKET_EPSILON_SECONDS);

    // First-frame-wins: a bucket already claimed (by an earlier frame,
    // possibly a duplicate/held reading at the same underlying value —
    // the dual-rate case) never re-fires. Never duplicates; a reconnect,
    // a stale gap, or a rejected reset candidate can only ever produce a
    // MISSING bucket, never a repeated one.
    if (bucket <= lastEmittedBucket) return;
    lastEmittedBucket = bucket;

    if (samples.length >= SERIES_SAMPLE_CAP) {
      truncated = true;
      return;
    }

    const workClockMeters = baseMeters + distance;
    const sample: Sample = {
      t: Math.round(workClockSeconds * 10),
      d: Math.round(workClockMeters * 10),
      p: Math.round((f.currentSplit ?? 0) * 10),
      spm: f.spm ?? 0,
      // `hr`'s readonly-optional shape (L2's freeze) means it must be
      // decided at construction, never assigned after — the spread of an
      // empty object contributes no key at all when there is no belt
      // (`heartRateBpm === null`) OR when it's a genuine wire reading
      // OUTSIDE the 20..254 band above (fix round, MED-LOW-2) — same
      // "drop the field, never the save" treatment `logDraft.ts` already
      // gives the identical quantity one step downstream.
      ...(f.heartRateBpm != null &&
      f.heartRateBpm >= HR_MIN &&
      f.heartRateBpm <= HR_MAX
        ? { hr: f.heartRateBpm }
        : {}),
    };
    samples.push(Object.freeze(sample));
  }

  function snapshot(): SeriesData | undefined {
    if (samples.length === 0) return undefined;
    return truncated
      ? { samples: [...samples], truncated: true }
      : { samples: [...samples] };
  }

  function stop(): void {
    stopped = true;
  }

  return { onFrame, snapshot, stop };
}
