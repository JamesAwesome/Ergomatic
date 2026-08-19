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
// driver-owned derived sum with its own defects, B2). A reset is detected
// FRAME-STREAM-LOCALLY: whenever a new frame's `elapsedSeconds` reads
// LOWER than the immediately preceding frame's own reading — this fires at
// every interval boundary, including a `restSeconds: 0` boundary where the
// wire's `workoutState` never leaves its work-mapped ordinal (no REST state
// exists to key on instead; proven on `walk-2026-08-17/step-3`'s first
// boundary, `seriesRecorder.test.ts`'s own oracle section).
//
// Because the wire freezes elapsed/distance for a rest's whole duration,
// the work clock stops advancing too — no new whole work-second is ever
// crossed during a rest, so rests produce ZERO samples for free, by
// construction, without this module ever inspecting `state` at all (§1's
// "Rest samples: NONE" row).

import type { MonitorFrame } from "../../domain/monitor/types.js";

/** Ruling 2: 4 hours of 1 Hz samples. At the cap, appending stops and
 *  `truncated` is set exactly once — no eviction machinery. */
export const SERIES_SAMPLE_CAP = 14_400;

/** C2 logbook stroke-object shape (§1's Shape row, memo Q3, PRIMARY):
 *  cumulative tenths of a second, cumulative decimeters, tenths of a
 *  second per 500m, whole strokes/min. `hr` is ABSENT (never
 *  `undefined`-but-present) when the wire's own heart-rate sentinel
 *  resolved to `null` upstream (`domain/monitor/pm5/parse.ts`'s
 *  `heartRate()` — 255 or 0 -> `null` -> this module omits the key). */
export interface Sample {
  t: number;
  d: number;
  p: number;
  spm: number;
  hr?: number;
}

export interface SeriesData {
  samples: Sample[];
  truncated?: true;
}

/** A reset is a genuine wire drop, never float noise on a held reading —
 *  half a hundredth-of-a-second (the wire's own smallest unit) is well
 *  under any real interval's shortest possible duration. */
const RESET_EPSILON_SECONDS = 0.005;
/** Guards the whole-second `Math.floor` bucket against a value that is
 *  mathematically exactly on an integer boundary landing a hair under it
 *  from float accumulation (`baseSeconds` is a running sum of prior
 *  finals). */
const BUCKET_EPSILON_SECONDS = 1e-9;

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
  /** The immediately preceding frame's own raw reading — what a reset
   *  folds IN, and what a reset is detected AGAINST. `null` before the
   *  first frame (nothing to compare, nothing to fold). Elapsed and
   *  distance are held as ONE pair, set together on every frame, so a
   *  reset (which only ever fires once `lastReading` is non-null) can
   *  never observe one half of the pair without the other — no fallback
   *  value is ever needed for `distanceMeters` here. */
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
      elapsed < lastReading.elapsedSeconds - RESET_EPSILON_SECONDS
    ) {
      // Interval boundary: fold the COMPLETED interval's own final
      // pre-reset readings in, then this frame starts the new interval.
      baseSeconds += lastReading.elapsedSeconds;
      baseMeters += lastReading.distanceMeters;
    }
    lastReading = { elapsedSeconds: elapsed, distanceMeters: distance };

    const workClockSeconds = baseSeconds + elapsed;
    const bucket = Math.floor(workClockSeconds + BUCKET_EPSILON_SECONDS);

    // First-frame-wins: a bucket already claimed (by an earlier frame,
    // possibly a duplicate/held reading at the same underlying value —
    // the dual-rate case) never re-fires. Never duplicates; a reconnect
    // or stale gap can only ever produce a MISSING bucket, never a
    // repeated one.
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
    };
    if (f.heartRateBpm != null) {
      sample.hr = f.heartRateBpm;
    }
    samples.push(sample);
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
