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
// This module used to key on the driver's plain, un-attributed per-frame
// interval field itself, re-doing a bounded version of the driver's OWN
// open-on-reset guard from a field that cannot carry the guard's
// discriminating signal (series-truth design spec §B′): `MonitorFrame`'s
// six-valued `state` + `rawIntervalCount` make
// a poison tick and an honest post-gap first tick INDISTINGUISHABLE at
// this seam, so any guard built here is either the driver's own guard,
// copy-pasted (a second place to keep in sync, forever), or a strictly
// weaker one. `docs/monitor/sessions/walk-2026-08-24/phone-exit7-ring.json`
// (a 2×250m r60 row) is the capture that proved the weaker copy wrong: the
// driver's own guard correctly refused to open the poisoned key, but this
// module's independent derivation opened it anyway and inflated the work
// clock by the finishing interval's own register — 56.1 real seconds of
// the second interval never reached the stored series.
//
// FIX (spec §B′, "delete, don't supplement"): `MonitorFrame` gained an
// additive `attributedIntervalIndex` field (`domain/monitor/types.ts`) —
// the exact key `src/monitor/driver.ts`'s own register-map fold resolved
// for this tick, AFTER its open-on-reset guard, mirrored onto every
// emitted frame (`driver.ts`'s `attributedIntervalIndex: activeKey ??
// undefined`). This module now keys ENTIRELY on that field. No edge is
// detected, so none can be missed: a register per key, each merged by
// MAXIMUM (never last-write-wins — a `(0,0)` frame arriving late under an
// already-completed key cannot poison it, because `max(existing, 0) ===
// existing`, the identical reasoning `driver.ts:1072` documents for its
// own session register map). The work clock is the current key's own live
// register value plus the sum of every LOWER key's final register — i.e.
// every completed interval's own final reading, folded once each, in
// order.
//
// THE CURRENT KEY directly follows `attributedIntervalIndex` (present ->
// `currentKey = f.attributedIntervalIndex`, no comparison against the
// prior value) — this module inherits the driver's OWN monotonicity
// guarantee rather than re-deriving or re-checking one of its own (one
// deriver in the system, spec §B′'s own framing). ABSENT continues the
// last key rather than resetting (only non-driver test fixtures ever
// produce an absent field on an open run — driver-emitted frames always
// carry it once a run is open); before any key has ever been seen, the
// key is already the synthetic `0`, so an all-absent frame stream (a
// driver with no armed program, a JustRow) still accumulates under one
// register rather than recording nothing.
//
// Trusting the driver's attribution outright means this module can no
// longer assume the key only ever moves forward — C′ (spec §C′) is the
// consequence, and REFINED once already (fix round 1, against Task 3's own
// measurement): the first cut counted every `bucket < lastEmittedBucket`
// tick and fired 1 and 18 times on the two committed CLEAN captures — an
// alarm on normal traffic, not the pathological shape the design's own
// prose motivates. Root cause: the ~450-540ms 0x0033-lags-0x0031 boundary
// skew (documented elsewhere in this codebase as the driver's own
// stale-count rest clamp / open-on-reset guard) routinely produces one or
// more lagging ticks whose PER-TICK work clock reads backward while the
// REGISTER (max-merged) absorbs it and the series stays byte-identical —
// no data was lost, only re-visited.
//
// The corrected signal is narrower: a backward tick counts ONLY when its
// bucket was NEVER emitted before — "a reading for a second the series
// will never have", i.e. actual, unrecoverable data loss (the exit-7
// defect's own shape: a poisoned key jumps the work clock FORWARD past a
// whole span of buckets no frame ever claims, then a later genuine tick
// lands BACKWARD into that same unclaimed span — every one of those is a
// second the series permanently lacks). A routine lagging tick, by
// contrast, always lands on a bucket the healthy climb already passed
// through moments earlier, so the never-emitted test excludes it —
// PROVIDED that bucket is actually inside the series' own span (fix round
// 2 correction: "by construction" overclaimed this — a run whose very
// FIRST emitted bucket is not 0 is the ordinary case, not an edge one:
// the exit-7 ring's own first rowing frame reads elapsed=1.02, bucket 1,
// so bucket 0 is never emitted EITHER, but for a completely different
// reason than the poison shape — it is simply BEFORE the series' own
// first sample, not a span the series skipped mid-run. A stale/reconnect
// tick that happens to read elapsed≈0 after the run has already
// progressed would satisfy "never emitted" on that reasoning alone and
// wrongly count). The third term excludes it: a bucket below the run's
// own first-ever emitted bucket is outside the series' span, never loss.
// `emittedBuckets` (a plain `Set<number>`, naturally bounded by session
// length — the same cap `SERIES_SAMPLE_CAP` already bounds) tracks every
// bucket that has ever won; `firstEmittedBucket` remembers the very first
// one. `backwardBucketCount` — exposed on the recorder's own result,
// never on `SeriesData` (the server route's reconstruction would silently
// drop it) — counts `bucket < lastEmittedBucket && !emittedBuckets.has
// (bucket) && bucket > firstEmittedBucket`; the sample is still dropped
// either way, exactly as ordinary same-bucket decimation (`bucket ===
// lastEmittedBucket`, the hot path — 80-90% of healthy iOS frames,
// measured 2.23 frames/s desktop, 90-180ms iOS) already drops its
// non-winning frames.

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

/** RC-6, narrowed (phase-open gates: the `p: 0` half of the original
 *  finding moved to RC-11's own spec). Two DIFFERENT PM5 artifacts land
 *  in this same 0..N spm range and are neither of them a real stroke
 *  rate: a first-stroke estimator transient (64 spm, committed capture
 *  `docs/monitor/sessions/walk-2026-08-17/step-2-pm5-recording-
 *  1786973078979.jsonl`, seq 829/832/835/838 — 13 s into interval 1, NOT
 *  a boundary; the PM5's own spm estimator running on a single elapsed
 *  stroke) and a workout-end boundary transition (101 spm, committed
 *  capture `docs/monitor/sessions/walk-2026-08-18-metrics/pyramid-pm5-
 *  recording-1787090555458.jsonl.gz`, seq 3274/3277, straddling the
 *  interval-end reset). Both are real, coherent, aligned wire readings —
 *  not parse noise — so this bands `spm` to the EXISTING `0` sentinel at
 *  construction, the same layer and the same "drop the out-of-band
 *  reading, never the whole sample" shape `hr` above already uses (never
 *  an absent field: the chart guards on `!== 0` and the server validator
 *  requires the key). Band edges 10 and 60 are inclusive.
 *
 *  M6 fix (final-review): `SPM_MAX = 60` has the two artifacts above as
 *  its evidence; `SPM_MIN = 10` did not — nothing here argued for a
 *  FLOOR, only a ceiling. Decoding every 0x0032 stroke-rate byte across
 *  all seven committed captures in `docs/monitor/sessions/` gives this
 *  distribution: `{0: 472, 22: 18, 23: 45, 24: 160, 25: 387, 26: 645,
 *  27: 504, 28: 596, 29: 353, 30: 156, 31: 90, 32: 12, 33: 4, 64: 4,
 *  101: 2}` — nothing at all between 1 and 21 in the corpus today, so the
 *  floor zeroes zero samples in every capture this repo has. That is not
 *  proof a sub-10 reading can't happen (a light warm-up stroke plausibly
 *  reads below 10), only that this floor has never yet been observed to
 *  cost anything — recorded here because a corpus-backed "never fired"
 *  is not the same claim as "safe", and the next capture that DOES land
 *  below 10 is the one that would tell. */
const SPM_MIN = 10;
const SPM_MAX = 60;

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
   *  later (a stored log's steps never carry a warm-up row — nothing has
   *  PRODUCED one since Phase WU, and `buildMonitorLogSteps` still skips a
   *  legacy warm-up seed step on the one population that can persist the
   *  string, its own KEEP guard — and no step carries a marker to key a
   *  positional derivation off either, so anything positional derived from
   *  steps lands displaced); the recorder is the only place that ever saw
   *  the wire's own state byte, so it must mark the sample at
   *  construction. */
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
  /** series-truth spec §C′ (REFINED twice — fix round 1, then fix round 2):
   *  the count of samples whose own work-clock bucket read STRICTLY LESS
   *  than the highest bucket already emitted, was never claimed by any
   *  earlier sample, AND lies ABOVE the run's own first-ever emitted
   *  bucket — actual, unrecoverable data loss ("a reading for a second
   *  the series will never have"), never ordinary same-bucket decimation
   *  (`===`, the hot path), never a routine backward tick that merely
   *  re-visits a bucket the healthy climb already passed through (the
   *  ~450-540ms 0x0033-lags-0x0031 boundary skew — measured 1 and 18
   *  times on this repo's two committed clean captures under the FIRST,
   *  over-firing cut of this predicate; ZERO under this one), and never a
   *  stale/pre-session reading landing below the very first sample the
   *  run ever had (the exit-7 ring's own first rowing frame is bucket 1,
   *  not 0 — a below-first bucket is outside the series' span, not a gap
   *  it skipped; fix round 2's own correction). Zero for the whole
   *  lifetime of a healthy run. Deliberately absent from
   *  `SeriesData`/`snapshot()`: the server route's own reconstruction of a
   *  stored series has no field to carry it, so a caller that needs this
   *  reads it here, off the recorder itself, not off a snapshot. */
  backwardBucketCount(): number;
}

export function createSeriesRecorder(): SeriesRecorder {
  const samples: Sample[] = [];
  let truncated = false;
  let stopped = false;

  /** Per-interval registers, MAX-merged. `driver.ts:1072` runs the
   *  identical shape and states the reason: "Maximum, not last-write-wins,
   *  for two independently-found reasons". A `(0,0)` frame arriving late
   *  under a completed interval's key cannot poison its register, because
   *  `max(existing, 0) === existing`. Keyed on
   *  `MonitorFrame.attributedIntervalIndex` — the key `driver.ts`'s own
   *  register-map fold actually used for this tick, never re-derived here
   *  (spec §B′: one deriver in the system). Entries are never deleted, even
   *  if `currentKey` later moves backward (C′) — a later frame that
   *  re-attributes forward past a key still finds that key's own register
   *  exactly where max-merge left it. */
  const registers = new Map<number, { seconds: number; meters: number }>();
  /** Directly follows `attributedIntervalIndex` (spec §B′) — no comparison
   *  against the prior value, no forward-only clamp. The driver's own
   *  register-map fold already resolved the correct key for this tick,
   *  including every guard it has (open-on-reset, the stale-count rest
   *  clamp); re-checking or re-clamping here would be exactly the
   *  supplementing spec §B′ forbids. This means `currentKey` is no longer
   *  guaranteed monotonic — see `backwardBucketCount` below, the
   *  consequence this module now has to observe rather than prevent. */
  let currentKey = 0;
  /** The highest whole work-second bucket already claimed by a sample.
   *  `-1` before the first sample so bucket 0 (the very first frame,
   *  however early) can still win. */
  let lastEmittedBucket = -1;
  /** series-truth spec §C′ — see `SeriesRecorder.backwardBucketCount`'s own
   *  doc comment for the full contract. */
  let backwardBucketCount = 0;
  /** Every bucket that has ever won (been assigned to `lastEmittedBucket`),
   *  REFINED C′'s own "never emitted" test. A plain `Set<number>`,
   *  naturally bounded by session length — it can never hold more entries
   *  than `SERIES_SAMPLE_CAP` already bounds `samples` to. */
  const emittedBuckets = new Set<number>();
  /** The very first bucket this run ever emitted — `null` before the
   *  first sample. Fix round 2: a bucket BELOW this one was never
   *  emitted for a completely different reason than data loss (it is
   *  simply before the series' own first reading, e.g. the exit-7 ring's
   *  own first rowing frame is bucket 1, never bucket 0) — C′'s
   *  never-emitted test alone cannot tell that apart from a genuine
   *  mid-run gap, so `backwardBucketCount` additionally requires the
   *  bucket to lie ABOVE this one. */
  let firstEmittedBucket: number | null = null;

  function onFrame(f: MonitorFrame): void {
    if (stopped || truncated) return;

    // ABSENT continues the last key (spec §B′, same "no opinion this
    // tick" contract `attributedIntervalIndex`'s own doc comment states) —
    // it never starts a register and never resets accumulation. Before
    // any defined key has been seen, `currentKey` is already the
    // synthetic `0`, so an all-absent run (a non-driver test fixture with
    // no opinion on this field) records under one synthetic register
    // rather than recording nothing. A driver-emitted frame with an open
    // run always carries this field — see the field's own doc comment.
    if (f.attributedIntervalIndex !== undefined) {
      currentKey = f.attributedIntervalIndex;
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

    // C′, REFINED TWICE (fix round 1, then fix round 2): count a backward
    // bucket ONLY when it was NEVER emitted before (actual data loss,
    // never a routine tick that merely re-visits a bucket the healthy
    // climb already passed through — the 0x0033-lag artifact this
    // predicate's own doc comment traces) AND it lies ABOVE this run's
    // own first-ever emitted bucket (fix round 2: a below-first bucket is
    // outside the series' span entirely — a stale/pre-session reading,
    // never a mid-run gap — so it is excluded even though it, too, was
    // technically never emitted). A backward bucket is still dropped
    // either way, never appended: the samples array stays a valid
    // non-decreasing `t` sequence regardless.
    if (
      bucket < lastEmittedBucket &&
      !emittedBuckets.has(bucket) &&
      firstEmittedBucket !== null &&
      bucket > firstEmittedBucket
    ) {
      backwardBucketCount++;
    }

    // First-frame-wins: a bucket already claimed (by an earlier frame,
    // possibly a duplicate/held reading at the same underlying value —
    // the dual-rate case) never re-fires. Never duplicates; a reconnect or
    // a stale gap can only ever produce a MISSING bucket, never a repeated
    // one.
    if (bucket <= lastEmittedBucket) return;
    lastEmittedBucket = bucket;
    emittedBuckets.add(bucket);
    if (firstEmittedBucket === null) firstEmittedBucket = bucket;

    if (samples.length >= SERIES_SAMPLE_CAP) {
      truncated = true;
      return;
    }

    const workClockMeters = baseMeters + f.distanceMeters;
    const sample: Sample = {
      t: Math.round(workClockSeconds * 10),
      d: Math.round(workClockMeters * 10),
      p: Math.round((f.currentSplit ?? 0) * 10),
      // RC-6, narrowed: banded to the 10..60 spm range (inclusive) at
      // the SAME sentinel every reader already honours — `null` (no AS1
      // seen yet) and either out-of-band artifact above both collapse to
      // the existing `0`, never an absent field.
      spm: f.spm !== null && f.spm >= SPM_MIN && f.spm <= SPM_MAX ? f.spm : 0,
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

  return {
    onFrame,
    snapshot,
    stop,
    backwardBucketCount: () => backwardBucketCount,
  };
}
