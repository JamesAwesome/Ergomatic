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
// recorder keeps its own cumulative "work clock" — a REGISTER MAP fold
// (see below) of every COMPLETED interval's own final pre-reset reading,
// plus the CURRENT interval's own wire `elapsedSeconds` — never the wall
// clock, never a raw field alone, never `sessionElapsedSeconds` (a
// different, driver-owned derived sum with its own defects, B2).
//
// FALSE PREMISE, KILLED (trace-truth Task 2 exists because of this):
// the freeze above is NOT universal. It held for the 66 consecutive
// frames `step-3` shows crossing its OWN mid-workout rest (a rest with a
// FOLLOWING interval to reset into) — but the wire keeps advancing
// elapsed/distance during a rest whenever the rower keeps the flywheel
// moving, and this module used to assume "rest -> zero samples, by
// construction" as a physical guarantee rather than a fact about that
// one window. Measured: 21 rest-state samples on
// `session-2-wu-4unequal.jsonl` (a rest that genuinely advances), and
// even `step-3` ITSELF — the very capture cited above as the freeze's
// authority — carries 3 rest-state samples of its own at its own tail
// (t=240.2/241.3/242.2, its last three samples: a TRAILING rest with no
// following interval to reset into, so nothing ever froze it). This
// module now marks every sample's own `r` field from the winning
// frame's `state` directly (below) rather than relying on any
// assumption that a rest can never produce one.
//
// THE REGISTER MAP (trace-truth spec §1/§2, replacing the fix-round's
// edge-triggered genuine-boundary gate — see git history for that
// mechanism and why it was replaced). The old approach detected a reset
// FRAME-STREAM-LOCALLY (a decrease in `elapsedSeconds`) and then had to
// GUESS, from thresholds tuned against one capture's own observed gap
// sizes, whether the decrease was a genuine interval boundary, a
// Terminate re-base (CSAFE-DEF footnote 12: elapsed re-bases backward
// while distance holds exactly, never clearing), or sub-second jitter.
// That guess was permanently wrong whenever a genuine boundary's first
// observed post-reset frame already read past the distance threshold — a
// dropped notification, a reconnect gap, or a slow poll spanning the
// boundary — and a missed fold is not bounded or self-correcting: every
// sample from that point on is short by the whole skipped interval,
// forever (task-1-brief's own defect description; `src/monitor/driver.ts`
// names the identical class of cost for the fold ITS OWN session register
// map replaced, "an exact 2.00x, six times in the record").
//
// This module now keys on `MonitorFrame.intervalIndex` instead — the
// EMITTED value (post stale-count-clamp, `driver.ts`'s own SESSION
// REGISTER MAP comment), never `toProgramIndex`'s raw output (the clamp
// can RAISE it). No edge is detected, so none can be missed: a register
// per key, each merged by MAXIMUM (never last-write-wins — a `(0,0)` frame
// arriving late under an already-completed key cannot poison it, because
// `max(existing, 0) === existing`, the identical reasoning `driver.ts:1072`
// documents for its own session register map). The work clock is the
// current key's own live register value plus the sum of every LOWER key's
// final register — i.e. every completed interval's own final reading,
// folded once each, in order.
//
// THE CURRENT KEY is monotonic non-decreasing (spec §2): `max(seenKeys)`,
// the same floor `driver.ts`'s own `activeKey` uses. A NULL index
// CONTINUES the last key rather than resetting or falling back to
// edge-detection (spec §2, explicitly FORBIDDEN) — before any non-null
// index has ever been seen, the key is already the synthetic `0`, so an
// all-null frame stream (a driver with no armed program, a JustRow) still
// accumulates under one register rather than recording nothing.

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
  /** trace-truth Task 2 (spec §3, James's ruling: rests are DRAWN, but
   *  MARKED). Present and `true` ONLY for a sample recorded while the
   *  winning frame's own `state` was `"resting"` — ABSENT means work, the
   *  same absent-not-false idiom `hr` above already uses, so a work
   *  sample costs zero extra bytes. The renderer cannot recover this
   *  later (a stored log's steps never carry a warm-up row, so anything
   *  positional derived from steps lands displaced); the recorder is the
   *  only place that ever saw the wire's own state byte, so it must mark
   *  the sample at construction. */
  readonly r?: true;
}

export interface SeriesData {
  samples: Sample[];
  truncated?: true;
}

/** Guards the whole-second `Math.floor` bucket against a value that is
 *  mathematically exactly on an integer boundary landing a hair under it
 *  from float accumulation (the work clock is a running sum of prior
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

  /** Per-interval registers, MAX-merged. `driver.ts:1072` runs the
   *  identical shape and states the reason: "Maximum, not last-write-wins,
   *  for two independently-found reasons". A `(0,0)` frame arriving late
   *  under a completed interval's key cannot poison its register, because
   *  `max(existing, 0) === existing`. Keyed on `MonitorFrame.intervalIndex`
   *  — the EMITTED value, never `toProgramIndex`'s raw output (the driver's
   *  stale-count rest clamp can RAISE it). */
  const registers = new Map<number, { seconds: number; meters: number }>();
  /** Monotonic non-decreasing (spec §2): `max(seenKeys)`, the same floor
   *  `driver.ts`'s `activeKey` uses. A backward key would otherwise shrink
   *  the prefix sum below and walk the cumulative clock backwards. */
  let currentKey = 0;
  /** The highest whole work-second bucket already claimed by a sample.
   *  `-1` before the first sample so bucket 0 (the very first frame,
   *  however early) can still win. */
  let lastEmittedBucket = -1;

  function onFrame(f: MonitorFrame): void {
    if (stopped || truncated) return;

    // A null index CONTINUES the last key (spec §2) — it never starts a
    // register and never resets accumulation. Before any non-null key has
    // been seen, `currentKey` is already 0, so an all-null run records
    // under one synthetic register rather than recording nothing. Falling
    // back to edge-detection on a null key is explicitly FORBIDDEN.
    if (f.intervalIndex !== null && f.intervalIndex > currentKey) {
      currentKey = f.intervalIndex;
    }

    const reg = registers.get(currentKey) ?? { seconds: 0, meters: 0 };
    reg.seconds = Math.max(reg.seconds, f.elapsedSeconds);
    reg.meters = Math.max(reg.meters, f.distanceMeters);
    registers.set(currentKey, reg);

    // The work clock: every LOWER (completed) key's own final register,
    // folded once each, plus this frame's own live reading under the
    // CURRENT key. No edge is detected, so none can be missed — a gap
    // spanning a boundary just means fewer frames update the current
    // register before the key advances; the completed interval's own
    // final reading is still folded in whole once a later frame's key
    // proves it complete.
    let baseSeconds = 0;
    let baseMeters = 0;
    for (const [k, v] of registers) {
      if (k < currentKey) {
        baseSeconds += v.seconds;
        baseMeters += v.meters;
      }
    }

    const workClockSeconds = baseSeconds + f.elapsedSeconds;
    const bucket = Math.floor(workClockSeconds + BUCKET_EPSILON_SECONDS);

    // First-frame-wins: a bucket already claimed (by an earlier frame,
    // possibly a duplicate/held reading at the same underlying value —
    // the dual-rate case) never re-fires. Never duplicates; a reconnect or
    // a stale gap can only ever produce a MISSING bucket, never a repeated
    // one.
    if (bucket <= lastEmittedBucket) return;
    lastEmittedBucket = bucket;

    if (samples.length >= SERIES_SAMPLE_CAP) {
      truncated = true;
      return;
    }

    const workClockMeters = baseMeters + f.distanceMeters;
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
      // trace-truth Task 2 (spec §3): the WINNING frame's own state marks
      // the sample. Same conditional-spread idiom as `hr` above — absent
      // means work, costing zero extra bytes on a work sample.
      ...(f.state === "resting" ? { r: true as const } : {}),
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
