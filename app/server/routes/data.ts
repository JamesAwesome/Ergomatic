import { Router, type RequestHandler } from "express";
import { parseBulk } from "../../domain/bulk.js";
import { bucketsForCap } from "../../domain/duration.js";
import { estimateMinutes } from "../../domain/expand.js";
import { isOnboardingTitle } from "../../domain/onboarding.js";
import { PLANS } from "../../domain/plans.js";
import { suggest, type LibraryEntry } from "../../domain/suggest.js";
import type {
  Baselines,
  Difficulty,
  Step,
  WorkoutType,
} from "../../domain/types.js";
import { validateWorkoutInput } from "../../domain/validate.js";
import type { ArticleReadsStore } from "../stores/articleReads.js";
import {
  BASELINE_SOURCES,
  type BaselineSource,
  type BaselinesStore,
} from "../stores/baselines.js";
import {
  CursorNotFoundError,
  type ActualSource,
  type EndedBy,
  type HeldResult,
  type LogPatch,
  type LogSeries,
  type LogSeriesSample,
  type LogsStore,
  type LogStep,
  type Thumbs,
} from "../stores/logs.js";
import type { PlanKey, PlanStateStore } from "../stores/planState.js";
import type {
  PreferencesRow,
  PreferencesStore,
} from "../stores/preferences.js";
import type { TestHistoryStore } from "../stores/testHistory.js";
import type { NewWorkoutInput, WorkoutsStore } from "../stores/workouts.js";

export interface Stores {
  baselines: BaselinesStore;
  workouts: WorkoutsStore;
  logs: LogsStore;
  planState: PlanStateStore;
  preferences: PreferencesStore;
  testHistory: TestHistoryStore;
  articleReads: ArticleReadsStore;
}

export interface DataRouterDeps {
  stores: Stores;
  requireUser: RequestHandler;
}

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const ACTUAL_SOURCES: ActualSource[] = ["assumed", "stopwatch", "pm5"];
const HELD_RESULTS: HeldResult[] = ["held", "under", "over"];
const THUMBS_VALUES: Thumbs[] = ["up", "down"];
// Phase LL Task 4 (design spec §4, TRIAD): the known values — the SAME
// five `server/db/schema.ts`'s `endedByEnum` accepts. `endedByError` below
// is the "validateSeriesSample's cousin" the brief names: known value or
// absent, reject anything else.
const ENDED_BY_VALUES: EndedBy[] = [
  "finished",
  "rower",
  "link-lost",
  "program-failed",
  "interrupted",
];
const PLAN_KEYS: PlanKey[] = ["sprint", "head"];
const ACCENT_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// Conservative slug shape, validated here rather than against the bundled
// registry: client and server versions may skew mid-deploy, and an unknown
// slug is harmless — it's ignored at display time.
const SLUG_RE = /^[a-z0-9-]{1,64}$/;
// Postgres uuid columns 500 on a malformed literal (22P02) rather than just
// finding no row; guard the shape here so a bad id is an ordinary 404/400
// instead of leaking a DB error as a 500.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bounds for a real erg split: 60s/500m is world-class-plus fast, 240s/500m
// is a slow walk pace. Anything outside is almost certainly a data-entry
// mistake, not a real baseline.
const MIN_SPLIT_SECONDS = 60;
const MAX_SPLIT_SECONDS = 240;

function badRequest(
  res: Parameters<RequestHandler>[1],
  error: string,
  field?: string,
) {
  res.status(400).json(field ? { error, field } : { error });
}

function notFound(res: Parameters<RequestHandler>[1]) {
  res.status(404).json({ error: "not found" });
}

// Global (starter-library) workouts are visible to every user but never
// mutable by any of them — a 403 before any store write, distinct from the
// 404 a caller gets for an id they can't see at all.
function starterReadonly(res: Parameters<RequestHandler>[1]) {
  res.status(403).json({ error: "starter_readonly" });
}

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// From-the-log spec (2026-08-18), §3: each returns an error MESSAGE (or
// null when the value is acceptable) instead of writing the response
// directly, so `POST /api/logs` and `PATCH /api/logs/:id` share exactly
// ONE copy of each field's validation rule ("value validation reuses
// POST's validators by IMPORT" — both routes below call these, neither
// re-implements them). Each mirrors what used to be POST's own inline
// check verbatim: undefined and null are both acceptable (POST always
// treated an absent/explicit-null reflection field as "not answered");
// anything else must be a genuine member/shape, or it's rejected with the
// exact same message POST has always returned.
function heldError(value: unknown): string | null {
  if (
    value !== undefined &&
    value !== null &&
    !HELD_RESULTS.includes(value as HeldResult)
  ) {
    return "held must be one of held|under|over or null";
  }
  return null;
}

function painError(value: unknown): string | null {
  if (
    value !== undefined &&
    value !== null &&
    (typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 5)
  ) {
    return "pain must be an integer 1..5 or null";
  }
  return null;
}

function thumbsError(value: unknown): string | null {
  if (
    value !== undefined &&
    value !== null &&
    !THUMBS_VALUES.includes(value as Thumbs)
  ) {
    return "thumbs must be one of up|down or null";
  }
  return null;
}

// Phase LL Task 4 (design spec §4, TRIAD; exit criterion 5: "rejects
// unknown values"). Same shape as `heldError`/`thumbsError` above — known
// value or absent/null accepted, anything else rejected with the field
// named. `"interrupted"` is a genuine accepted value here (F6's own,
// riding the widened union), not a special case.
function endedByError(value: unknown): string | null {
  if (
    value !== undefined &&
    value !== null &&
    !ENDED_BY_VALUES.includes(value as EndedBy)
  ) {
    return "endedBy must be one of finished|rower|link-lost|program-failed|interrupted or null";
  }
  return null;
}

// RC-1 (storage-spine design spec §3, TRIAD): work and rest, same
// null-tolerant, bounds-checked-here-not-trusted contract as
// `avgSplitSeconds`/`distanceMeters`/`timeSeconds` below — never a
// positive-only rule, unlike `distanceMeters`'s `> 0`: `0` is a genuine
// reading (a rest-free session's own `restSeconds`/`restMeters`). One
// shared function across all four field names, rather than
// `endedByError`'s one-function-per-field shape — the RULE is nearly
// identical across all four (non-negative, bounded, or absent/null), so a
// shared bound is one thing to keep in sync, not four near-duplicates.
//
// **CORRECTED at the final whole-branch review (BLOCKER-1) — this used to
// claim every source is "a non-negative wire integer" and require
// `Number.isInteger` on all four.** `IntervalActual.elapsedSeconds`
// (0x0037's own Split/Interval Time, `domain/monitor/pm5/parse.ts`'s
// `readU24LE(bytes, 6) / 10`) is TENTHS-of-a-second precision, so
// `workSeconds` — and `restSeconds` beside it, for the same reason
// `schema.ts`'s own corrected comment gives — accept any non-negative
// FINITE number, not just an integer; a real natural finish's
// `workSeconds` is routinely fractional (session-2's own real capture:
// 398.4s), and the old integer-only rule 400'd every one of those saves.
// `workMeters`/`restMeters` genuinely ARE whole-metre wire fields
// (`splitIntervalDistanceMeters`/`intervalRestDistanceMeters`, both
// unscaled `readU24LE`/`readU16LE`) and keep the integer requirement.
const WORK_REST_SECONDS_MAX = 604800;
const WORK_REST_METERS_MAX = 1_000_000;

function workRestQuantityError(
  value: unknown,
  field: string,
  max: number,
  // RC-1's own two populations (BLOCKER-1 fix): `true` for the meters
  // pair (genuinely whole wire fields), `false` for the seconds pair
  // (0x0037's elapsed time is tenths-precision — see this function's own
  // header comment).
  wholeNumber: boolean,
): string | null {
  if (
    value !== undefined &&
    value !== null &&
    (typeof value !== "number" ||
      !Number.isFinite(value) ||
      (wholeNumber && !Number.isInteger(value)) ||
      value < 0 ||
      value > max)
  ) {
    return wholeNumber
      ? `${field} must be a non-negative whole number <= ${max}, or null`
      : `${field} must be a non-negative finite number <= ${max}, or null`;
  }
  return null;
}

function notesError(value: unknown): string | null {
  if (value !== null && value !== undefined && typeof value !== "string") {
    return "notes must be a string or null";
  }
  return null;
}

// Bounds for a logged step: 30-600s/500m spans "sprinting" to "recovery
// paddle"; spm 10..60 covers rest to a max-rate finish sprint; meters
// mirrors validateSteps' distance-step bound; seconds caps at 4 hours.
// Named (2026-08-08, Phase 7C Task 3) alongside the pm5-only bands below so
// the two sets read as siblings, not magic numbers vs. named constants.
const STEP_MIN_SPLIT_SECONDS = 30;
const STEP_MAX_SPLIT_SECONDS = 600;
const STEP_SPM_MIN = 10;
const STEP_SPM_MAX = 60;

// Amendment (2026-08-08, Phase 7C Task 3, spec §6): a pm5-only widening for
// actualSplit/spm. Walk-4 hardware (docs/monitor/pm5-interface-notes.md
// §18, 2026-08-08 entry) produced avgSpm 66 and splits past 600 on light
// rowing — real monitor readings at low load, not data-entry mistakes — and
// the adversarial review's B3 finding is that the manual bands above reject
// both. These bands apply ONLY when actualSource is "pm5"; the manual bands
// are UNCHANGED for assumed/stopwatch (a stopwatch entry claiming 66 spm is
// still a typo). Split's own lower bound is "greater than 0", not a second
// named minimum: `buildMonitorLogSteps` only ever sets actualSplit when the
// wire reading is itself a positive number (its own `avgSplit > 0` gate).
//
// LOW-1 (Phase LT spec 1, Task 1 review, 2026-08-18): `spm`'s OWN meaning
// changed underneath this bound without the bound itself moving — `spm` is
// now the AUTHORED target on every door, not the monitor door's measured
// reading (`ACTUAL_SPM_MIN` below is the new field for that). This
// pm5-widened band still applies to `spm` for two real reasons: a
// pre-split pm5 row (saved before this task; `spm` still holds its OLD
// measured value there — `src/session/logDraft.ts`'s `spmIsMeasured`
// names that shape) needs the exact bound it originally validated under,
// and a NEW pm5-sourced row's authored target is itself a real stroke
// rate a rower could set outside the 10..60 manual range. Both cases are
// the SAME wire quantity at heart (`avgSpm`), just two different moments
// of it — same as `ACTUAL_SPM_MIN`'s own comment already says.
//
// Branch review Medium-1 (2026-08-09): the wire's own top end (`avgSplit`
// up to 6553.5, `avgSpm` up to 255) exceeds both bands above, which used to
// 400 the WHOLE log for a genuinely-measured, wire-legal reading with no
// recoverable retry. `buildMonitorLogSteps` now mirrors these exact numbers
// client-side (`MONITOR_SPLIT_MAX`/`MONITOR_SPM_MIN`/`MAX`,
// `src/session/logDraft.ts`) and drops `actualSplit`/the authored `spm`/
// `actualSpm` (LT spec 1: the client-side floor and the split/measured
// distinction both now live in that module) rather than posting a value
// past them — a well-behaved client can no longer trigger these bands at
// all. They stay exactly as they are here to reject a hand-crafted liar,
// same role `HR_MIN`/`MAX` below already has.
const PM5_MAX_SPLIT_SECONDS = 6000;
const PM5_SPM_MIN = 0;
const PM5_SPM_MAX = 99;

// Phase LT spec 1 (2026-08-18), §2: `spm` above is now the AUTHORED target
// on every door — its own bounds (0..99 pm5, 10..60 manual) are UNCHANGED,
// so a v0.12.0-era client posting the pre-split shape (a monitor step's
// `spm` holding the OLD measured value) still validates and 201s
// byte-identically (additive-only between tags). `actualSpm` is new: the
// monitor door's MEASURED average, own field-named bound. Min 1, not 0
// ("POST already bounds pm5 spm 0..99; the new actualSpm key gets the same
// bounds with min 1" — the u8 wire field's own floor,
// `src/session/logDraft.ts`'s `MONITOR_SPM_MIN` doc comment carries the
// full justification: sub-1 unrepresentable, so an exact 0 can only mean
// "no strokes"). Max reuses `PM5_SPM_MAX` — the same upper bound `spm`
// already enforces for a pm5-sourced reading, since both fields describe
// the SAME wire quantity (`IntervalActual.avgSpm`), just two different
// moments of it.
const ACTUAL_SPM_MIN = 1;

// Heart rate bound (2026-08-08, Phase 7C Task 3, spec §6): mirrors the
// client's own `MONITOR_HR_MIN`/`MONITOR_HR_MAX` (`src/session/
// logDraft.ts`) — the standard ANT+/BLE heart-rate profile's field range.
// avgHr never arrives out-of-band from a well-behaved client (it drops the
// field itself, per that module's own doc comment); this band exists to
// reject a hand-crafted liar, not a real monitor reading, so it is NOT
// source-scoped like the pm5 bands above.
const HR_MIN = 20;
const HR_MAX = 254;

// Amendment (2026-08-02, Phase 6C Task 1.5): Task 1's `logDraft.ts` proved
// this validation predates effort refs — `targetSplit` was required
// unconditionally, but an effort step's frozen split is `estimationSplit`'s
// internal guess, never a real prescription (the 5G rule: never present an
// estimate as a target), so an effort step could never be logged as
// designed. Resolution: `targetSplit` is now OPTIONAL. `actualSplit` and
// `actualSource` are now a PAIRED unit — both present (existing bounds/enum
// apply) or both absent; one without the other is a 400 naming the pairing.
// An effort step in practice omits all three (no target to hold, so no
// actual to attribute to one — see `logDraft.ts`'s "neither key" rule for a
// discarded/effort phase).
//
// This is additive-compatible: loosening required -> optional only ever
// ACCEPTS payloads the old code rejected, so every payload that used to be
// valid (which always sent targetSplit, and always sent actualSplit paired
// with actualSource per the client's own "assumed"/"stopwatch" rules) is
// still valid unchanged — the between-tags API discipline holds. See
// docs/superpowers/specs/2026-08-02-phase-6c-log-session-design.md's
// Amendment section.
function validateLogStepEntry(
  raw: unknown,
  index: number,
): { ok: true; step: LogStep } | { ok: false; message: string } {
  const at = (msg: string) => `steps[${index}]: ${msg}`;
  if (!isRec(raw)) return { ok: false, message: at("must be an object") };

  const {
    label,
    targetSplit,
    actualSplit,
    actualSource,
    spm,
    meters,
    seconds,
    avgHr,
    actualSeconds,
    actualMeters,
    actualSpm,
  } = raw;

  if (typeof label !== "string" || label.length < 1 || label.length > 80) {
    return { ok: false, message: at("label must be a string, 1..80 chars") };
  }
  if (
    targetSplit !== undefined &&
    (typeof targetSplit !== "number" ||
      targetSplit < STEP_MIN_SPLIT_SECONDS ||
      targetSplit > STEP_MAX_SPLIT_SECONDS)
  ) {
    return {
      ok: false,
      message: at(
        `targetSplit must be a number, ${STEP_MIN_SPLIT_SECONDS}..${STEP_MAX_SPLIT_SECONDS}`,
      ),
    };
  }
  if (
    actualSource !== undefined &&
    !ACTUAL_SOURCES.includes(actualSource as ActualSource)
  ) {
    return {
      ok: false,
      message: at("actualSource must be one of assumed|stopwatch|pm5"),
    };
  }
  // PM5 PAIRING EXCEPTION (spec §3/§6, Phase 7C Task 3): actualSource "pm5"
  // is valid without actualSplit (an unusable avgSplit reading, while the
  // other measured fields are still real). assumed/stopwatch keep the
  // ordinary paired-unit rule from the Task 1.5 amendment above.
  const pm5WithoutSplit = actualSource === "pm5" && actualSplit === undefined;
  if (
    !pm5WithoutSplit &&
    (actualSplit === undefined) !== (actualSource === undefined)
  ) {
    return {
      ok: false,
      message: at(
        "actualSplit and actualSource must both be present or both be absent",
      ),
    };
  }
  if (actualSplit !== undefined) {
    const isPm5 = actualSource === "pm5";
    const validSplit =
      typeof actualSplit === "number" &&
      (isPm5
        ? actualSplit > 0 && actualSplit <= PM5_MAX_SPLIT_SECONDS
        : actualSplit >= STEP_MIN_SPLIT_SECONDS &&
          actualSplit <= STEP_MAX_SPLIT_SECONDS);
    if (!validSplit) {
      return {
        ok: false,
        message: at(
          isPm5
            ? `actualSplit must be a number, > 0 and <= ${PM5_MAX_SPLIT_SECONDS}`
            : `actualSplit must be a number, ${STEP_MIN_SPLIT_SECONDS}..${STEP_MAX_SPLIT_SECONDS}`,
        ),
      };
    }
  }
  if (spm !== undefined) {
    const isPm5 = actualSource === "pm5";
    const spmMin = isPm5 ? PM5_SPM_MIN : STEP_SPM_MIN;
    const spmMax = isPm5 ? PM5_SPM_MAX : STEP_SPM_MAX;
    if (
      typeof spm !== "number" ||
      !Number.isInteger(spm) ||
      spm < spmMin ||
      spm > spmMax
    ) {
      return {
        ok: false,
        message: at(`spm must be an integer, ${spmMin}..${spmMax}`),
      };
    }
  }
  if (
    meters !== undefined &&
    (typeof meters !== "number" ||
      !Number.isInteger(meters) ||
      meters < 100 ||
      meters > 42195)
  ) {
    return { ok: false, message: at("meters must be an integer, 100..42195") };
  }
  if (
    seconds !== undefined &&
    (typeof seconds !== "number" || seconds < 1 || seconds > 14400)
  ) {
    return { ok: false, message: at("seconds must be a number, 1..14400") };
  }
  if (
    avgHr !== undefined &&
    (typeof avgHr !== "number" ||
      !Number.isInteger(avgHr) ||
      avgHr < HR_MIN ||
      avgHr > HR_MAX)
  ) {
    return {
      ok: false,
      message: at(`avgHr must be an integer, ${HR_MIN}..${HR_MAX}`),
    };
  }
  if (
    actualSeconds !== undefined &&
    (typeof actualSeconds !== "number" || actualSeconds < 0)
  ) {
    return {
      ok: false,
      message: at("actualSeconds must be a number, >= 0"),
    };
  }
  if (
    actualMeters !== undefined &&
    (typeof actualMeters !== "number" || actualMeters < 0)
  ) {
    return {
      ok: false,
      message: at("actualMeters must be a number, >= 0"),
    };
  }
  if (
    actualSpm !== undefined &&
    (typeof actualSpm !== "number" ||
      !Number.isInteger(actualSpm) ||
      actualSpm < ACTUAL_SPM_MIN ||
      actualSpm > PM5_SPM_MAX)
  ) {
    return {
      ok: false,
      message: at(
        `actualSpm must be an integer, ${ACTUAL_SPM_MIN}..${PM5_SPM_MAX}`,
      ),
    };
  }

  // Built from an explicit field list (never spread/cast the raw input) so
  // any extra keys the client sent are silently dropped, not persisted.
  const step: LogStep = { label };
  if (targetSplit !== undefined) step.targetSplit = targetSplit;
  if (actualSplit !== undefined) step.actualSplit = actualSplit;
  if (actualSource !== undefined)
    step.actualSource = actualSource as ActualSource;
  if (avgHr !== undefined) step.avgHr = avgHr;
  if (actualSeconds !== undefined) step.actualSeconds = actualSeconds;
  if (actualMeters !== undefined) step.actualMeters = actualMeters;
  if (spm !== undefined) step.spm = spm;
  if (actualSpm !== undefined) step.actualSpm = actualSpm;
  if (meters !== undefined) step.meters = meters;
  if (seconds !== undefined) step.seconds = seconds;
  return { ok: true, step };
}

// Series capture spec (2026-08-19), §1/§3: the recorder's own cap
// (`src/monitor/seriesRecorder.ts`'s `SERIES_SAMPLE_CAP`) — a well-behaved
// client can never post more than this many samples; a hand-crafted body
// past it is rejected, never silently truncated server-side.
const SERIES_SAMPLE_CAP = 14_400;
// t/d "sane band" ceilings mirror this route's OWN existing session-scale
// sanity bounds (`timeSeconds`'s 604800s, `distanceMeters`'s 1,000,000m,
// both in the POST handler below) — expressed in THIS field's own units
// (tenths-of-a-second, decimeters) rather than a fresh number invented for
// the series alone. Generous on purpose (§1: gaps/reconnects can inflate
// `t` past the recorder's nominal 4-hour/14,400-sample cap without
// inflating sample COUNT) — this rejects a hand-crafted liar, never a real
// reading; cross-sample consistency (monotonic `t`, the fold/decimation
// invariants) is Task 1's own domain-level contract, not this route's.
const SERIES_T_MAX = 604_800 * 10;
const SERIES_D_MAX = 1_000_000 * 10;
// p (tenths of a second per 500m) mirrors `PM5_MAX_SPLIT_SECONDS` above —
// this route's own established "sane" pm5 split ceiling — in this field's
// tenths unit.
const SERIES_P_MAX = PM5_MAX_SPLIT_SECONDS * 10;
// spm's honest wire ceiling: 0x0032's own stroke-rate byte is a plain u8
// (`domain/monitor/pm5/parse.ts`'s `spm: readU8(bytes, 5)`), and the
// recorder stores it unbanded (`seriesRecorder.ts`'s `spm: f.spm ?? 0` —
// no drop-if-out-of-band the way `logDraft.ts`'s AUTHORED/matched-actual
// fields get). The full representable range, not the narrower 10..60/
// 0..99 bands those separately-purposed fields apply.
const SERIES_SPM_MAX = 255;

function validateSeriesSample(
  raw: unknown,
  index: number,
): { ok: true; sample: LogSeriesSample } | { ok: false; message: string } {
  const at = (msg: string) => `series.samples[${index}]: ${msg}`;
  if (!isRec(raw)) return { ok: false, message: at("must be an object") };
  const { t, d, p, spm, hr, r } = raw;
  if (
    typeof t !== "number" ||
    !Number.isInteger(t) ||
    t < 0 ||
    t > SERIES_T_MAX
  ) {
    return {
      ok: false,
      message: at(`t must be an integer, 0..${SERIES_T_MAX}`),
    };
  }
  if (
    typeof d !== "number" ||
    !Number.isInteger(d) ||
    d < 0 ||
    d > SERIES_D_MAX
  ) {
    return {
      ok: false,
      message: at(`d must be an integer, 0..${SERIES_D_MAX}`),
    };
  }
  if (
    typeof p !== "number" ||
    !Number.isInteger(p) ||
    p < 0 ||
    p > SERIES_P_MAX
  ) {
    return {
      ok: false,
      message: at(`p must be an integer, 0..${SERIES_P_MAX}`),
    };
  }
  if (
    typeof spm !== "number" ||
    !Number.isInteger(spm) ||
    spm < 0 ||
    spm > SERIES_SPM_MAX
  ) {
    return {
      ok: false,
      message: at(`spm must be an integer, 0..${SERIES_SPM_MAX}`),
    };
  }
  if (
    hr !== undefined &&
    (typeof hr !== "number" ||
      !Number.isInteger(hr) ||
      hr < HR_MIN ||
      hr > HR_MAX)
  ) {
    return {
      ok: false,
      message: at(`hr must be an integer, ${HR_MIN}..${HR_MAX}, or omitted`),
    };
  }
  // trace-truth Task 2 (spec §3): `r`'s shape is `true` or absent — never
  // `false` (the absent-not-false idiom `hr` above already uses; a
  // work sample must cost zero bytes, not carry `r: false`).
  if (r !== undefined && r !== true) {
    return { ok: false, message: at("r must be true or absent") };
  }
  // Built from an explicit field list, same "never spread/cast the raw
  // input" discipline `validateLogStepEntry` above already uses — any
  // extra keys the client sent (the POST idiom: unknown sample keys are
  // ignored, never rejected) are silently dropped, not persisted.
  const sample: LogSeriesSample = { t, d, p, spm };
  if (hr !== undefined) sample.hr = hr;
  if (r === true) sample.r = true;
  return { ok: true, sample };
}

// Series capture spec (2026-08-19), §3: absent/null both mean "this run
// had no series" (an older client, a dropped series, a non-monitor door)
// — same "absent or explicit null both store null" convention as
// `deviceName`/`thumbs` elsewhere on this route, since nothing here has a
// use for distinguishing the two. A well-formed body validates every
// sample independently; `truncated`, when present, must be the literal
// `true` the recorder itself only ever sets (never a client-asserted
// count/reason).
function validateSeries(
  raw: unknown,
): { ok: true; series: LogSeries | null } | { ok: false; message: string } {
  if (raw === undefined || raw === null) return { ok: true, series: null };
  if (!isRec(raw)) return { ok: false, message: "series must be an object" };
  if (!Array.isArray(raw.samples)) {
    return { ok: false, message: "series.samples must be an array" };
  }
  if (raw.samples.length > SERIES_SAMPLE_CAP) {
    return {
      ok: false,
      message: `series.samples must have at most ${SERIES_SAMPLE_CAP} entries`,
    };
  }
  if (raw.truncated !== undefined && raw.truncated !== true) {
    return { ok: false, message: "series.truncated must be true or omitted" };
  }
  const samples: LogSeries["samples"] = [];
  for (let i = 0; i < raw.samples.length; i++) {
    const result = validateSeriesSample(raw.samples[i], i);
    if (!result.ok) return { ok: false, message: result.message };
    samples.push(result.sample);
  }
  return {
    ok: true,
    series: raw.truncated === true ? { samples, truncated: true } : { samples },
  };
}

// RC-2/RC-3 wave design spec §1 ("The server tier (same PR)", TRIAD): the
// machine's own end-of-workout summary blob. Unlike `validateSeries`
// above, this does NOT reconstruct a field-by-field typed object — the
// nine `MachineSummaryDetail` fields ride along VERBATIM, whatever their
// shape, as long as the whole blob is a plain object under the size cap
// (spec's own words: "the nine summaryDetail fields verbatim" — migration
// 0011's `series` column is the STORAGE precedent, untyped jsonb, not a
// validation precedent). The one field this function does inspect is
// `verificationBytes`, because it is the one array-shaped key a
// hand-crafted liar could use to smuggle an oversized or out-of-band
// payload past the size cap's own JSON.stringify check in a way that
// still "looks like bytes."
//
// **Correction to the design spec and task-6-brief (ruling carried in this
// task's dispatch, 2026-08-24, recorded in progress.md):** both say
// `verificationBytes` is "length 8". It is not — the client stores the
// FULL 19-byte 0x003F payload verbatim (`src/monitor/monitorRun.ts`'s own
// `verificationBytes?: readonly number[]`, sourced from the raw 0x003F
// frame, not a pre-sliced 8-byte view); display code takes the first 8
// later. The band below is therefore 1..32 integers 0-255 — permissive
// enough to admit the real 19-byte payload and a future wire revision,
// tight enough to still reject nonsense.
const MACHINE_SUMMARY_MAX_BYTES = 2048;
const VERIFICATION_BYTES_MIN = 1;
const VERIFICATION_BYTES_MAX = 32;

function validateMachineSummary(
  raw: unknown,
):
  | { ok: true; summary: Record<string, unknown> | null }
  | { ok: false; message: string } {
  if (raw === undefined || raw === null) return { ok: true, summary: null };
  if (!isRec(raw) || Array.isArray(raw)) {
    return { ok: false, message: "machineSummary must be an object" };
  }
  if (JSON.stringify(raw).length > MACHINE_SUMMARY_MAX_BYTES) {
    return {
      ok: false,
      // Wording matches what's actually measured: `.length` on a JS
      // string counts UTF-16 code units, not bytes (the constant's own
      // name is a holdover — the ceiling itself is unchanged).
      message: `machineSummary must serialize to at most ${MACHINE_SUMMARY_MAX_BYTES} characters`,
    };
  }
  if (raw.verificationBytes !== undefined) {
    const bytes = raw.verificationBytes;
    const validBytes =
      Array.isArray(bytes) &&
      bytes.length >= VERIFICATION_BYTES_MIN &&
      bytes.length <= VERIFICATION_BYTES_MAX &&
      bytes.every(
        (b) =>
          typeof b === "number" && Number.isInteger(b) && b >= 0 && b <= 255,
      );
    if (!validBytes) {
      return {
        ok: false,
        message: `machineSummary.verificationBytes must be an array of ${VERIFICATION_BYTES_MIN}..${VERIFICATION_BYTES_MAX} integers 0-255`,
      };
    }
  }
  return { ok: true, summary: raw };
}

export function createDataRouter({
  stores,
  requireUser,
}: DataRouterDeps): Router {
  const router = Router();
  // Scoped to /api: this router is mounted at the app root (see app.ts), and
  // an unscoped `router.use(requireUser)` would gate every request that
  // reaches it — including "/" and the SPA fallback — not just this
  // router's own /api/* routes. Caught by e2e testing against the real
  // compose stack (unit tests only ever exercise this router in isolation,
  // or via createApp() with stores: null, so it was never mounted alongside
  // the SPA fallback in a way that could expose this).
  router.use("/api", requireUser);

  // -- baselines ------------------------------------------------------

  router.get("/api/baselines", async (req, res) => {
    const row = await stores.baselines.get(req.user!.id);
    res.json(row ?? { k2Seconds: null, k6Seconds: null });
  });

  router.put("/api/baselines", async (req, res) => {
    const body = isRec(req.body) ? req.body : {};
    // Narrower than the store's BaselinesPatch: this route never writes
    // null (a clear is a deliberate future operation, spec rev 2 — today
    // non-numbers 400), and the isTestResult block below relies on the
    // numbers being real.
    const patch: {
      k2Seconds?: number;
      k6Seconds?: number;
      k2Source?: BaselineSource;
      k6Source?: BaselineSource;
    } = {};

    // Phase BL PR A (baseline-onboarding spec 2026-08-22 rev 2, "The
    // stored shape"): each numeric field may arrive with its own
    // provenance source. Validated against the enum vocabulary here (the
    // DB would reject garbage too, but as a 500, not a 400 naming the
    // field), and a value arriving WITHOUT a source is stamped "manual" —
    // an old client's plain write is exactly a manual entry. An absent
    // numeric field gets no source key at all, so its stored source rides
    // the same untouched-key patch semantics as its number.
    for (const field of ["k2Seconds", "k6Seconds"] as const) {
      const sourceField = field === "k2Seconds" ? "k2Source" : "k6Source";
      const value = body[field];
      const source = body[sourceField];
      if (source !== undefined) {
        if (
          typeof source !== "string" ||
          !(BASELINE_SOURCES as readonly string[]).includes(source)
        ) {
          badRequest(
            res,
            `${sourceField} must be one of ${BASELINE_SOURCES.join(", ")}`,
            sourceField,
          );
          return;
        }
        if (value === undefined) {
          badRequest(
            res,
            `${sourceField} requires ${field} in the same request`,
            sourceField,
          );
          return;
        }
      }
      if (value === undefined) continue;
      if (
        typeof value !== "number" ||
        value < MIN_SPLIT_SECONDS ||
        value > MAX_SPLIT_SECONDS
      ) {
        badRequest(
          res,
          `${field} must be between ${MIN_SPLIT_SECONDS} and ${MAX_SPLIT_SECONDS}`,
          field,
        );
        return;
      }
      if (field === "k2Seconds") {
        patch.k2Seconds = value;
        patch.k2Source = (source as BaselineSource | undefined) ?? "manual";
      } else {
        patch.k6Seconds = value;
        patch.k6Source = (source as BaselineSource | undefined) ?? "manual";
      }
    }

    await stores.baselines.put(req.user!.id, patch);

    // NOTE (Phase BL PR A, wording corrected in PR B): isTestResult
    // deliberately does NOT imply a `tested` source — sources are
    // explicit-only on this wire. PR B's post-test prompt ended up never
    // sending this flag at all (rev 2's decouple ruling): its accept is a
    // plain `k2Source`/`k6Source: "tested"` PUT, and recording rides the
    // sibling POST /api/test-history below, fired at save time so a
    // DECLINE records too. This flag therefore still has zero client
    // senders and is kept only as additive wire compatibility; it only
    // appends test history — keyless, so without the sibling route's
    // idempotency.
    if (body.isTestResult === true) {
      if (patch.k2Seconds !== undefined) {
        await stores.testHistory.append(req.user!.id, {
          distance: "2k",
          splitSeconds: patch.k2Seconds,
        });
      }
      if (patch.k6Seconds !== undefined) {
        await stores.testHistory.append(req.user!.id, {
          distance: "6k",
          splitSeconds: patch.k6Seconds,
        });
      }
    }

    const row = await stores.baselines.get(req.user!.id);
    res.json(row ?? { k2Seconds: null, k6Seconds: null });
  });

  // Phase BL PR C — Reset baseline setup (spec rev 2's "Reset onboarding"
  // ruling): a DELIBERATE clear operation with its own verb, additive to
  // the wire (old clients never send it and are unaffected; PUT still
  // rejects null on purpose — a relaxed validator could make null
  // writable by accident, and the isTestResult block above relies on the
  // numbers being real). Deletes the row whole, numbers AND sources
  // together, returning the account to the true no-baseline state — the
  // exact shape GET serves for a never-set account, echoed back here so
  // the client sees what any consumer will now read. Destructive on
  // purpose; the client stages a confirm before calling it.
  router.delete("/api/baselines", async (req, res) => {
    await stores.baselines.clear(req.user!.id);
    res.json({ k2Seconds: null, k6Seconds: null });
  });

  // -- test history -----------------------------------------------------

  // Phase BL PR B (baseline-onboarding spec rev 2, "Recording
  // (decoupled)", James's ruling): every designated-test session with a
  // measurable result records to test_history — accept OR decline; the
  // post-test prompt governs only the baseline write. This sibling
  // endpoint is the decouple: the client fires it once, right after the
  // log save succeeds, and it never touches baselines. `logId` (the log
  // row the split was measured in, owned by the caller) doubles as the
  // idempotency key — the store returns the original row for a keyed
  // repeat instead of appending a delta-0 duplicate. The old coupled path
  // (`isTestResult` above, zero client senders) is untouched: additive
  // wire, old clients unaffected. splitSeconds shares the baselines
  // band deliberately — a split this route can store is exactly one the
  // baseline write it accompanies could store, one definition of a
  // plausible split across the feature.
  router.post("/api/test-history", async (req, res) => {
    const body = isRec(req.body) ? req.body : {};
    const { distance, splitSeconds, logId } = body;
    if (distance !== "2k" && distance !== "6k") {
      badRequest(res, 'distance must be "2k" or "6k"', "distance");
      return;
    }
    if (
      typeof splitSeconds !== "number" ||
      !Number.isFinite(splitSeconds) ||
      splitSeconds < MIN_SPLIT_SECONDS ||
      splitSeconds > MAX_SPLIT_SECONDS
    ) {
      badRequest(
        res,
        `splitSeconds must be between ${MIN_SPLIT_SECONDS} and ${MAX_SPLIT_SECONDS}`,
        "splitSeconds",
      );
      return;
    }
    if (typeof logId !== "string" || !UUID_RE.test(logId)) {
      badRequest(res, "logId must be a valid id", "logId");
      return;
    }
    // Ownership, not just existence — same reasoning as POST /api/logs'
    // workoutId check: a foreign logId would otherwise let one account
    // key (and dedupe) history against another account's log row.
    const owned = await stores.logs.get(req.user!.id, logId);
    if (!owned) {
      badRequest(res, "logId does not exist", "logId");
      return;
    }
    const row = await stores.testHistory.append(req.user!.id, {
      distance,
      splitSeconds,
      sessionLogId: logId,
    });
    // 201 with the row's id on the dedupe path too (same id both times):
    // the caller can't tell a retry from a first fire, which is the point.
    res.status(201).json({ id: row.id });
  });

  // -- workouts ---------------------------------------------------------

  router.get("/api/workouts", async (req, res) => {
    const userId = req.user!.id;
    // Two queries total, never per-row: lastDonePerWorkout is one grouped
    // query (see stores/logs.ts) — the library needs recency for every row.
    const [rows, lastDone] = await Promise.all([
      stores.workouts.list(userId),
      stores.logs.lastDonePerWorkout(userId),
    ]);
    res.json(
      rows.map((w) => ({ ...w, lastDoneDaysAgo: lastDone[w.id] ?? null })),
    );
  });

  router.post("/api/workouts", async (req, res) => {
    const validated = validateWorkoutInput(req.body);
    if (!validated.ok) {
      badRequest(res, validated.errors.join("; "));
      return;
    }
    const row = await stores.workouts.create(req.user!.id, {
      ...validated.workout,
      source: "user",
    });
    res.status(201).json(row);
  });

  router.get("/api/workouts/:id", async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res);
      return;
    }
    const row = await stores.workouts.get(req.user!.id, req.params.id);
    if (!row) {
      notFound(res);
      return;
    }
    res.json(row);
  });

  router.put("/api/workouts/:id", async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res);
      return;
    }
    const existing = await stores.workouts.get(req.user!.id, req.params.id);
    if (!existing) {
      notFound(res);
      return;
    }
    if (existing.isGlobal) {
      starterReadonly(res);
      return;
    }
    const validated = validateWorkoutInput(req.body);
    if (!validated.ok) {
      badRequest(res, validated.errors.join("; "));
      return;
    }
    const row = await stores.workouts.update(
      req.user!.id,
      req.params.id,
      validated.workout,
    );
    // The store no-ops (returns null) on an id it can't find, but we
    // already confirmed existence above, so this can't happen in practice.
    res.json(row ?? existing);
  });

  router.delete("/api/workouts/:id", async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res);
      return;
    }
    const existing = await stores.workouts.get(req.user!.id, req.params.id);
    if (!existing) {
      notFound(res);
      return;
    }
    if (existing.isGlobal) {
      starterReadonly(res);
      return;
    }
    await stores.workouts.remove(req.user!.id, req.params.id);
    res.status(204).end();
  });

  router.post("/api/workouts/bulk", async (req, res) => {
    const text = isRec(req.body) ? req.body.text : undefined;
    if (typeof text !== "string" || text.trim() === "") {
      badRequest(res, "text is required", "text");
      return;
    }

    const parsed = parseBulk(text);
    const errors: Array<{ line: number | null; message: string }> =
      parsed.errors.map((e) => ({
        line: e.line,
        message: e.message,
      }));

    const toCreate: NewWorkoutInput[] = [];
    for (const workout of parsed.workouts) {
      const validated = validateWorkoutInput(workout);
      if (!validated.ok) {
        errors.push({
          line: null,
          message: `workout "${workout.title}": ${validated.errors.join("; ")}`,
        });
        continue;
      }
      toCreate.push({ ...validated.workout, source: "user" });
    }

    // All-or-nothing (Phase 5B merge: a plain per-block loop stranded
    // already-landed blocks on a later failure, and re-importing the same
    // paste duplicated them). Any error anywhere in the paste — parse-level
    // or validation-level, above — means NOTHING in this request gets
    // created; only a fully clean paste reaches `createMany`, which is
    // itself one transaction in the real store (`workouts.ts`) exactly
    // like `logs.ts`'s own `create` wraps its insert + plan_state upsert
    // in one `db.transaction` — reused here rather than re-implemented.
    // A dropped `wu` line is NOT an error and so never trips this gate: a
    // paste whose only oddity is warm-up lines still imports in full.
    const created =
      errors.length === 0 && toCreate.length > 0
        ? await stores.workouts.createMany(req.user!.id, toCreate)
        : [];

    // `droppedWarmups` (2026-08-09 warmup-setting spec §6): well-formed `wu`
    // lines parseBulk silently strips rather than erroring — the import
    // screen's own notice (`domain/bulk.ts`'s `droppedWarmupNotice`) is the
    // only place that count is ever surfaced, so it has to leave the route
    // in the response. Task 5 wired the identical notice for the local-draft
    // strip door; this was the import door's own half, left open until now
    // (task-5-report's Concern #2).
    res.json({ created, errors, droppedWarmups: parsed.droppedWarmups });
  });

  // -- logs ---------------------------------------------------------------

  // From-the-log spec (2026-08-18), §3: the `?plan=` variant is an ADDITION
  // to this existing route, not a new one — Plan's done-row link resolves
  // from `GET /api/logs?plan=<key>` returning `{ links: [...] }`, newest-
  // wins per index (see `stores/logs.ts`'s `listPlanLinks`). It short-
  // circuits before the ordinary cursor-list branch below: the two shapes
  // ({links:[...]} vs. a plain row array) are mutually exclusive per
  // request, distinguished by whether `plan` was sent at all.
  router.get("/api/logs", async (req, res) => {
    if (req.query.plan !== undefined) {
      if (
        typeof req.query.plan !== "string" ||
        !PLAN_KEYS.includes(req.query.plan as PlanKey)
      ) {
        badRequest(res, "plan must be one of sprint|head", "plan");
        return;
      }
      const links = await stores.logs.listPlanLinks(
        req.user!.id,
        req.query.plan,
      );
      res.json({ links });
      return;
    }

    const rawLimit = Number(req.query.limit);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(100, Math.floor(rawLimit))
        : 20;

    // Cursor = the last row's id alone, resolved entirely in SQL (spec
    // §3) — the route never touches a timestamp here, only validates the
    // id's SHAPE. "Unknown/foreign before id" (well-formed but doesn't
    // resolve to one of this caller's own rows) is a 400, not a silent
    // empty page: `stores.logs.list` throws `CursorNotFoundError` for
    // exactly that case.
    let before: string | undefined;
    if (req.query.before !== undefined) {
      if (
        typeof req.query.before !== "string" ||
        !UUID_RE.test(req.query.before)
      ) {
        badRequest(res, "before must be a valid id", "before");
        return;
      }
      before = req.query.before;
    }

    try {
      res.json(await stores.logs.list(req.user!.id, limit, before));
    } catch (err) {
      if (err instanceof CursorNotFoundError) {
        badRequest(res, "before does not reference an existing log", "before");
        return;
      }
      throw err;
    }
  });

  // The from-the-log view's fetch (spec §3): full row, steps included.
  // Owner-checked and 404 on BOTH absence and another user's id — the
  // store's own `WHERE user_id = $userId` predicate makes the two cases
  // structurally indistinguishable, so there's no existence leak to guard
  // separately. Malformed (non-uuid) ids 404 the same way `/api/workouts/
  // :id` does, before ever reaching the store (a real Postgres 22P02
  // dressed up as a 500 otherwise).
  router.get("/api/logs/:id", async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res);
      return;
    }
    const row = await stores.logs.get(req.user!.id, req.params.id);
    if (!row) {
      notFound(res);
      return;
    }
    res.json(row);
  });

  // The API's first UPDATE (spec §3). Every key is independently optional;
  // presence is read with `in` (PUT /api/prefs's own `warmup` field used
  // the identical idiom for the identical reason, before Phase WU removed
  // the setting) so a key that's ABSENT never touches its column, while a
  // key that's PRESENT-and-null clears it. Unknown keys (anything other
  // than thumbs/held/pain/notes) are silently ignored, matching POST and
  // `PUT /api/prefs` — a 400 on an unknown key would give this API two
  // personalities and break additive-only in the new-client/old-server
  // direction (spec §3, antagonist B6). An empty accepted-key set (an
  // empty body, or a body carrying only unknown keys) is therefore a
  // no-op READ, exactly like `PUT /api/prefs`'s own empty-patch guard —
  // `stores.logs.update` is never called with an empty patch object.
  router.patch("/api/logs/:id", async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res);
      return;
    }
    const body = isRec(req.body) ? req.body : {};
    const patch: LogPatch = {};

    if ("held" in body) {
      const err = heldError(body.held);
      if (err) {
        badRequest(res, err, "held");
        return;
      }
      patch.held = (body.held as HeldResult | null) ?? null;
    }
    if ("pain" in body) {
      const err = painError(body.pain);
      if (err) {
        badRequest(res, err, "pain");
        return;
      }
      patch.pain = (body.pain as number | null) ?? null;
    }
    if ("thumbs" in body) {
      const err = thumbsError(body.thumbs);
      if (err) {
        badRequest(res, err, "thumbs");
        return;
      }
      patch.thumbs = (body.thumbs as Thumbs | null) ?? null;
    }
    if ("notes" in body) {
      const err = notesError(body.notes);
      if (err) {
        badRequest(res, err, "notes");
        return;
      }
      patch.notes = (body.notes as string | null) ?? null;
    }

    if (Object.keys(patch).length === 0) {
      const row = await stores.logs.get(req.user!.id, req.params.id);
      if (!row) {
        notFound(res);
        return;
      }
      res.json(row);
      return;
    }

    const row = await stores.logs.update(req.user!.id, req.params.id, patch);
    if (!row) {
      notFound(res);
      return;
    }
    res.json(row);
  });

  // Log-delete spec (2026-08-18), §2: the API's first DELETE. Owner-
  // checked exactly like GET/PATCH above (404 on absence OR another
  // user's row — `stores.logs.delete`'s `deleted: false` is structurally
  // the same "no existence leak" signal `get`/`update` already give via
  // a null return). A second delete of the same id 404s the same way —
  // there's no soft-delete state to distinguish "already gone" from
  // "never existed" (spec's own ruling: hard delete, no trash). Response
  // is `200 {unCounted}` per §2 — the server reporting what it actually
  // did, never a bare 204 (the client's post-delete UI depends on this).
  router.delete("/api/logs/:id", async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res);
      return;
    }
    const result = await stores.logs.delete(req.user!.id, req.params.id);
    if (!result.deleted) {
      notFound(res);
      return;
    }
    res.json({ unCounted: result.unCounted });
  });

  router.post("/api/logs", async (req, res) => {
    const body = isRec(req.body) ? req.body : {};

    if (
      typeof body.workoutTitle !== "string" ||
      body.workoutTitle.length === 0
    ) {
      badRequest(res, "workoutTitle is required", "workoutTitle");
      return;
    }
    if (typeof body.workoutType !== "string" || body.workoutType.length === 0) {
      badRequest(res, "workoutType is required", "workoutType");
      return;
    }
    let workoutId: string | null = null;
    if (body.workoutId !== null && body.workoutId !== undefined) {
      if (typeof body.workoutId !== "string" || !UUID_RE.test(body.workoutId)) {
        badRequest(res, "workoutId must be a valid id or null", "workoutId");
        return;
      }
      // Ownership check up front: an absent/foreign workoutId would otherwise
      // either 500 (FK violation, 23503) or silently attribute the log to a
      // workout the user doesn't own.
      const owned = await stores.workouts.get(req.user!.id, body.workoutId);
      if (!owned) {
        badRequest(res, "workoutId does not exist", "workoutId");
        return;
      }
      workoutId = body.workoutId;
    }
    // Post-workout-summary spec (2026-08-17), §3: every reflection field is
    // now optional — the redesigned card never forces a HELD/PAIN/THUMBS
    // choice (James's ruling). Absent (undefined) OR explicit null both
    // store null; anything else must be a genuine member of the enum, still
    // 400 with the field named on a bad value. This is additive-compatible:
    // the old shape (held+pain always present) still validates identically,
    // so a v0.10.0/v0.10.1 client keeps working unchanged.
    const heldErr = heldError(body.held);
    if (heldErr) {
      badRequest(res, heldErr, "held");
      return;
    }
    const painErr = painError(body.pain);
    if (painErr) {
      badRequest(res, painErr, "pain");
      return;
    }
    const thumbsErr = thumbsError(body.thumbs);
    if (thumbsErr) {
      badRequest(res, thumbsErr, "thumbs");
      return;
    }
    // Phase LL Task 4: known value or absent, reject unknown (exit
    // criterion 5).
    const endedByErr = endedByError(body.endedBy);
    if (endedByErr) {
      badRequest(res, endedByErr, "endedBy");
      return;
    }
    const notesErr = notesError(body.notes);
    if (notesErr) {
      badRequest(res, notesErr, "notes");
      return;
    }
    // Task 3 (outside-plan logging): optional, defaults to true below (the
    // pre-Task-3 behavior every existing caller already gets) — present
    // means the caller is deliberately opting a row OUT of plan progress,
    // so a malformed value here is a genuine client bug, not silently
    // coerced.
    if (
      body.advancesPlan !== undefined &&
      typeof body.advancesPlan !== "boolean"
    ) {
      badRequest(res, "advancesPlan must be a boolean", "advancesPlan");
      return;
    }
    // Phase 7C Task 3 (spec §5/§6): session-scoped provenance, optional.
    // Absent stores null (see stores/logs.ts's create()); present must be a
    // non-empty string within the wire's own device-name length (bounded
    // here, not just relied on client-side).
    if (
      body.deviceName !== undefined &&
      (typeof body.deviceName !== "string" ||
        body.deviceName.length < 1 ||
        body.deviceName.length > 64)
    ) {
      badRequest(res, "deviceName must be a string, 1..64 chars", "deviceName");
      return;
    }
    // From-the-log spec (2026-08-18), §2/§3: the three hero numbers,
    // optional/nullable exactly like held/pain/thumbs above — a v0.11.0
    // client sends none of these and still 201s, storing null for all
    // three (additive-only between tags). Bounds-checked here like every
    // other numeric field on this route: this is sanity, not truth — an
    // authenticated client can still post a wrong number about its own
    // rowing, accepted and recorded as the trust boundary (the server
    // cannot re-derive what only the device saw, spec §2).
    if (
      body.avgSplitSeconds !== undefined &&
      body.avgSplitSeconds !== null &&
      (typeof body.avgSplitSeconds !== "number" ||
        !Number.isFinite(body.avgSplitSeconds) ||
        body.avgSplitSeconds <= 0 ||
        body.avgSplitSeconds > 3600)
    ) {
      badRequest(
        res,
        "avgSplitSeconds must be a finite number > 0 and <= 3600, or null",
        "avgSplitSeconds",
      );
      return;
    }
    if (
      body.distanceMeters !== undefined &&
      body.distanceMeters !== null &&
      (typeof body.distanceMeters !== "number" ||
        !Number.isInteger(body.distanceMeters) ||
        body.distanceMeters <= 0 ||
        body.distanceMeters > 1_000_000)
    ) {
      badRequest(
        res,
        "distanceMeters must be a whole number > 0 and <= 1000000, or null",
        "distanceMeters",
      );
      return;
    }
    if (
      body.timeSeconds !== undefined &&
      body.timeSeconds !== null &&
      (typeof body.timeSeconds !== "number" ||
        !Number.isFinite(body.timeSeconds) ||
        body.timeSeconds <= 0 ||
        body.timeSeconds > 604800)
    ) {
      badRequest(
        res,
        "timeSeconds must be a finite number > 0 and <= 604800, or null",
        "timeSeconds",
      );
      return;
    }
    // RC-1 (storage-spine design spec §3, TRIAD): work and rest, same
    // sanity-not-truth posture as the three hero fields just above — an
    // authenticated client can still post a wrong number about its own
    // rowing, accepted and recorded as the trust boundary the server
    // cannot close.
    const workSecondsErr = workRestQuantityError(
      body.workSeconds,
      "workSeconds",
      WORK_REST_SECONDS_MAX,
      false,
    );
    if (workSecondsErr) {
      badRequest(res, workSecondsErr, "workSeconds");
      return;
    }
    const workMetersErr = workRestQuantityError(
      body.workMeters,
      "workMeters",
      WORK_REST_METERS_MAX,
      true,
    );
    if (workMetersErr) {
      badRequest(res, workMetersErr, "workMeters");
      return;
    }
    const restSecondsErr = workRestQuantityError(
      body.restSeconds,
      "restSeconds",
      WORK_REST_SECONDS_MAX,
      false,
    );
    if (restSecondsErr) {
      badRequest(res, restSecondsErr, "restSeconds");
      return;
    }
    const restMetersErr = workRestQuantityError(
      body.restMeters,
      "restMeters",
      WORK_REST_METERS_MAX,
      true,
    );
    if (restMetersErr) {
      badRequest(res, restMetersErr, "restMeters");
      return;
    }
    // RC-2/RC-3 wave design spec §1 (TRIAD): the machine's own totals,
    // same sanity-not-truth posture and the same bounds as the RC-1 pair
    // just above — a natural-finish 0x0039 elapsed field is the identical
    // tenths-precision source `workSeconds` already proves fractional.
    const machineWorkSecondsErr = workRestQuantityError(
      body.machineWorkSeconds,
      "machineWorkSeconds",
      WORK_REST_SECONDS_MAX,
      false,
    );
    if (machineWorkSecondsErr) {
      badRequest(res, machineWorkSecondsErr, "machineWorkSeconds");
      return;
    }
    const machineWorkMetersErr = workRestQuantityError(
      body.machineWorkMeters,
      "machineWorkMeters",
      WORK_REST_METERS_MAX,
      true,
    );
    if (machineWorkMetersErr) {
      badRequest(res, machineWorkMetersErr, "machineWorkMeters");
      return;
    }
    const machineSummaryResult = validateMachineSummary(body.machineSummary);
    if (!machineSummaryResult.ok) {
      badRequest(res, machineSummaryResult.message, "machineSummary");
      return;
    }
    if (!Array.isArray(body.steps) || body.steps.length === 0) {
      badRequest(res, "steps must be a non-empty array", "steps");
      return;
    }
    // Mirrors validateSteps' 100-step cap on workouts; a logged session can
    // run a bit longer in practice (warm-up + reps + rest entries all count
    // separately here), so the ceiling is doubled rather than reused as-is.
    if (body.steps.length > 200) {
      badRequest(res, "steps must have at most 200 entries", "steps");
      return;
    }
    const steps: LogStep[] = [];
    for (let i = 0; i < body.steps.length; i++) {
      const result = validateLogStepEntry(body.steps[i], i);
      if (!result.ok) {
        badRequest(res, result.message, "steps");
        return;
      }
      steps.push(result.step);
    }

    // Series capture spec (2026-08-19), §3: optional, absent or null both
    // mean "this run had no series" — validated the same field-named-400
    // way as `steps` above; `series` itself is the field name on any
    // sub-check failure (matching `steps`' own precedent of naming the
    // whole array field, not a per-index path).
    const seriesResult = validateSeries(body.series);
    if (!seriesResult.ok) {
      badRequest(res, seriesResult.message, "series");
      return;
    }

    const baselines = await stores.baselines.get(req.user!.id);
    const { id } = await stores.logs.create(req.user!.id, {
      workoutId,
      workoutTitle: body.workoutTitle,
      workoutType: body.workoutType,
      baselineK2: baselines?.k2Seconds ?? null,
      baselineK6: baselines?.k6Seconds ?? null,
      held: (body.held as HeldResult | null | undefined) ?? null,
      pain: (body.pain as number | null | undefined) ?? null,
      notes: (body.notes as string | null | undefined) ?? null,
      steps,
      advancesPlan: (body.advancesPlan as boolean | undefined) ?? true,
      deviceName: (body.deviceName as string | undefined) ?? null,
      thumbs: (body.thumbs as Thumbs | null | undefined) ?? null,
      avgSplitSeconds:
        (body.avgSplitSeconds as number | null | undefined) ?? null,
      timeSeconds: (body.timeSeconds as number | null | undefined) ?? null,
      distanceMeters:
        (body.distanceMeters as number | null | undefined) ?? null,
      series: seriesResult.series,
      endedBy: (body.endedBy as EndedBy | null | undefined) ?? null,
      workSeconds: (body.workSeconds as number | null | undefined) ?? null,
      workMeters: (body.workMeters as number | null | undefined) ?? null,
      restSeconds: (body.restSeconds as number | null | undefined) ?? null,
      restMeters: (body.restMeters as number | null | undefined) ?? null,
      machineWorkSeconds:
        (body.machineWorkSeconds as number | null | undefined) ?? null,
      machineWorkMeters:
        (body.machineWorkMeters as number | null | undefined) ?? null,
      machineSummary: machineSummaryResult.summary,
    });
    res.status(201).json({ id });
  });

  // -- plan -----------------------------------------------------------

  async function planResponse(userId: string) {
    const row = await stores.planState.get(userId);
    const planKey = row?.planKey ?? null;
    const doneN = row?.doneN ?? 0;
    // Wire contract (Phase 8A, antagonist B2): `code` KEEPS its name and
    // stays a bare WorkoutType string — a checkpoint day serialises its
    // real type, and the prescription never crosses the wire (installed
    // builds blank the whole plan line on an unrecognised shape).
    const sequence = planKey
      ? PLANS[planKey].sessions.map((day, index) => ({
          index,
          code: day.type,
          status:
            index < doneN ? "done" : index === doneN ? "today" : "upcoming",
        }))
      : [];
    return { planKey, doneN, sequence };
  }

  router.get("/api/plan", async (req, res) => {
    res.json(await planResponse(req.user!.id));
  });

  router.put("/api/plan", async (req, res) => {
    const body = isRec(req.body) ? req.body : {};
    const userId = req.user!.id;

    if (body.reset === true) {
      await stores.planState.reset(userId);
      res.json(await planResponse(userId));
      return;
    }

    if (body.planKey === undefined) {
      badRequest(res, "planKey or reset is required");
      return;
    }
    if (!PLAN_KEYS.includes(body.planKey as PlanKey)) {
      badRequest(res, "planKey must be one of sprint|head", "planKey");
      return;
    }

    const current = await stores.planState.get(userId);
    // Re-selecting the SAME plan must be a no-op: planState.set() always
    // zeroes done_n, and a same-key PUT (e.g. a client re-syncing its
    // choice) must not silently wipe progress.
    if (current?.planKey !== body.planKey) {
      await stores.planState.set(userId, body.planKey as PlanKey);
    }
    res.json(await planResponse(userId));
  });

  // -- prefs ------------------------------------------------------------

  router.get("/api/prefs", async (req, res) => {
    res.json(await stores.preferences.get(req.user!.id));
  });

  router.put("/api/prefs", async (req, res) => {
    const body = isRec(req.body) ? req.body : {};
    const patch: Partial<PreferencesRow> = {};

    if (body.difficulties !== undefined) {
      if (
        !Array.isArray(body.difficulties) ||
        body.difficulties.length === 0 ||
        !body.difficulties.every((d) => DIFFICULTIES.includes(d as Difficulty))
      ) {
        badRequest(
          res,
          "difficulties must be a non-empty subset of easy|medium|hard",
          "difficulties",
        );
        return;
      }
      patch.difficulties = body.difficulties as Difficulty[];
    }
    if (body.timeCapMinutes !== undefined) {
      if (
        typeof body.timeCapMinutes !== "number" ||
        !Number.isInteger(body.timeCapMinutes) ||
        body.timeCapMinutes < 10 ||
        body.timeCapMinutes > 300
      ) {
        badRequest(
          res,
          "timeCapMinutes must be an integer 10..300",
          "timeCapMinutes",
        );
        return;
      }
      patch.timeCapMinutes = body.timeCapMinutes;
    }
    // Phase WU exit criterion 6 (2026-08-21-warmup-removal-design.md §8):
    // the ONE deliberate exception to this route's general "an unrecognized
    // key is silently ignored" policy (stated below at the empty-patch
    // guard, and matched by `PATCH /api/logs/:id`'s own `held`-idiom
    // comment). The removed `warmup` setting used to be read here with a
    // PRESENCE check (`"warmup" in body`, not `!== undefined`) because an
    // explicit `warmup: null` had to CLEAR the setting while an absent key
    // left it alone — that distinction no longer has anywhere to apply, but
    // the key itself still gets a 400 rather than a silent no-op, so a
    // not-yet-updated client finds out its write did nothing rather than
    // believing it succeeded.
    if ("warmup" in body) {
      badRequest(res, "warmup is no longer a preference", "warmup");
      return;
    }
    if (body.countdownSeconds !== undefined) {
      if (
        typeof body.countdownSeconds !== "number" ||
        !Number.isInteger(body.countdownSeconds) ||
        body.countdownSeconds < 0 ||
        body.countdownSeconds > 60
      ) {
        badRequest(
          res,
          "countdownSeconds must be an integer 0..60",
          "countdownSeconds",
        );
        return;
      }
      patch.countdownSeconds = body.countdownSeconds;
    }
    if (body.paceToleranceSeconds !== undefined) {
      if (
        typeof body.paceToleranceSeconds !== "number" ||
        body.paceToleranceSeconds < 0 ||
        body.paceToleranceSeconds > 10
      ) {
        badRequest(
          res,
          "paceToleranceSeconds must be 0..10",
          "paceToleranceSeconds",
        );
        return;
      }
      patch.paceToleranceSeconds = body.paceToleranceSeconds;
    }
    if (body.accentColor !== undefined) {
      if (
        typeof body.accentColor !== "string" ||
        !ACCENT_COLOR_RE.test(body.accentColor)
      ) {
        badRequest(
          res,
          "accentColor must be a #rrggbb hex string",
          "accentColor",
        );
        return;
      }
      patch.accentColor = body.accentColor;
    }
    if (body.startHereDismissed !== undefined) {
      if (typeof body.startHereDismissed !== "boolean") {
        badRequest(
          res,
          "startHereDismissed must be a boolean",
          "startHereDismissed",
        );
        return;
      }
      patch.startHereDismissed = body.startHereDismissed;
    }

    // An empty patch (body `{}`, or all-unknown keys) must be a no-op read,
    // not a write: the real store's put() builds its upsert's `SET` clause
    // directly from `patch`, and Postgres rejects `ON CONFLICT DO UPDATE
    // SET` with nothing to set — a 500, not a 400, if we let it through.
    if (Object.keys(patch).length === 0) {
      res.json(await stores.preferences.get(req.user!.id));
      return;
    }

    await stores.preferences.put(req.user!.id, patch);
    res.json(await stores.preferences.get(req.user!.id));
  });

  // -- article reads ----------------------------------------------------

  router.get("/api/article-reads", async (req, res) => {
    res.json({ slugs: await stores.articleReads.list(req.user!.id) });
  });

  router.put("/api/article-reads/:slug", async (req, res) => {
    const { slug } = req.params;
    if (!SLUG_RE.test(slug)) {
      badRequest(res, "slug must match ^[a-z0-9-]{1,64}$", "slug");
      return;
    }
    await stores.articleReads.markRead(req.user!.id, slug);
    res.status(204).end();
  });

  // Idempotent: deleting a slug that was never read (or already deleted)
  // still 204s — MARK ALL FOUR UNREAD (You › Learning the app) fires four
  // of these unconditionally, partial-failure-safe by re-run.
  router.delete("/api/article-reads/:slug", async (req, res) => {
    const { slug } = req.params;
    if (!SLUG_RE.test(slug)) {
      badRequest(res, "slug must match ^[a-z0-9-]{1,64}$", "slug");
      return;
    }
    await stores.articleReads.unmarkRead(req.user!.id, slug);
    res.status(204).end();
  });

  // -- test history ---------------------------------------------------

  router.get("/api/test-history", async (req, res) => {
    res.json(await stores.testHistory.list(req.user!.id));
  });

  // -- today ------------------------------------------------------------

  router.get("/api/today", async (req, res) => {
    const userId = req.user!.id;
    const baselinesRow = await stores.baselines.get(userId);
    if (
      !baselinesRow ||
      baselinesRow.k2Seconds === null ||
      baselinesRow.k6Seconds === null
    ) {
      res.status(422).json({ error: "baselines_required" });
      return;
    }
    const baselines: Baselines = {
      k2Seconds: baselinesRow.k2Seconds,
      k6Seconds: baselinesRow.k6Seconds,
    };

    const planRow = await stores.planState.get(userId);
    // No plan chosen yet: default to the sprint preset at day 0 rather than
    // erroring — /today should always have something to say. The response's
    // own `planKey` still reports null in that case (see below) so callers
    // can tell "no plan selected" apart from "sprint is selected".
    const effectivePlanKey: PlanKey = planRow?.planKey ?? "sprint";
    const doneN = planRow?.doneN ?? 0;
    const sequence = PLANS[effectivePlanKey].sessions;
    const todayCode: WorkoutType =
      sequence[Math.min(doneN, sequence.length - 1)].type;

    const [prefs, workouts, lastDone] = await Promise.all([
      stores.preferences.get(userId),
      stores.workouts.list(userId),
      stores.logs.lastDonePerWorkout(userId),
    ]);

    // Controller addendum (Phase 6I Task 7, design spec's "invisible
    // outside onboarding" rule): the two designated GLOBAL onboarding
    // workouts never enter the suggestion pool here, mirroring the
    // client's own exclusion (Today.tsx's `entries`) — a veteran with real
    // baselines set (the only account this route ever runs for; see the
    // 422 guard above) must never be SUGGESTED "6K Test"/"2K Test".
    // Final-review fix (2026-08-09): also require `isGlobal` — a rower's
    // own CUSTOM workout that happens to share one of these titles
    // (`w.isGlobal === false`, `withIsGlobal`'s own `userId !== null`
    // case) is a real, ownable workout; excluding it by title alone
    // orphaned it from this route's suggestion pool with no way back.
    const library: LibraryEntry[] = workouts
      .filter((w) => !(isOnboardingTitle(w.title) && w.isGlobal))
      .map((w) => ({
        id: w.id,
        type: w.type,
        difficulty: w.difficulty,
        pain: w.pain,
        estMinutes: estimateMinutes(w.steps as Step[], baselines).minutes,
        lastDoneDaysAgo: lastDone[w.id] ?? null,
        // Round 2 (2026-08-04): LibraryEntry.isGlobal is required, mirroring
        // `w.isGlobal` from `stores.workouts.list()` (server/stores/workouts.ts's
        // own `withIsGlobal`) exactly.
        isGlobal: w.isGlobal,
      }));

    const suggestion = suggest({
      todayCode,
      library,
      prefs: {
        difficulties: prefs.difficulties,
        // Amendment (2026-08-04 PR #50 round): SuggestPrefs' own TIME field
        // is now a bucket union, not a single cap — bucketsForCap derives
        // the same set the client's own Today screen seeds a fresh day's
        // TIME defaults from (domain/duration.ts's own doc comment on why
        // this lives in domain/, not client-only code).
        durations: bucketsForCap(prefs.timeCapMinutes),
        // Round 2 (2026-08-04): lastDone/source are deliberately OMITTED
        // here, not set to null — server-side suggestions have no
        // client-side overrides to derive a LAST DONE/SOURCE preference
        // from at all (both are optional on SuggestPrefs for exactly this
        // reason; see that interface's own doc comment).
      },
    });

    res.json({
      recommendation: suggestion.recommendationId,
      reason: suggestion.reason,
      pool: suggestion.poolIds,
      todayCode,
      doneN,
      planKey: planRow?.planKey ?? null,
    });
  });

  return router;
}
