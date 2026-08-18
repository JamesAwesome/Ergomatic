// buildSummaryModel — Phase PW Task 4: the pure model behind the post-workout
// summary screen (design spec docs/superpowers/specs/2026-08-17-post-
// workout-summary-design.md §2A/2B/2E, rulings R-B/R-C/R-D/R-E). Task 5
// consumes `SummaryModel` to render the screen; nothing here touches the
// DOM, a clock, or storage.
//
// CAN THROW (review finding 4, stated where a caller will actually see it —
// also on `buildSummaryModel`'s own doc comment below): the monitor door
// calls `buildMonitorLogSteps` (`logDraft.ts`) internally, which throws
// `MonitorLogSeedError` for a legacy `MonitorRun` with no `logSeed` at all
// (a v1 record, predating the field — `MonitorRun.logSeed`'s own doc
// comment) or one whose `logSeed.steps.length` doesn't match
// `program.intervals.length`. This module does not catch it — Task 5's
// screen must, the same way `LogSession.tsx`'s own monitor-mode gate
// already does (catches the error, falls through to the manual door
// rather than crashing the Log screen on a record this shape was never
// supposed to reach).
//
// INPUT SHAPE — why a discriminated union, not the task brief's suggested
// `{ steps, run?, sessionRun?, workout? }` bag:
//
//   - A bag admits invalid combinations (both `run` and `sessionRun` set,
//     neither set) the compiler cannot rule out. This repo's own domain
//     types (`MonitorEvent`, `ProgramInterval.type`) already prefer a
//     discriminated union for exactly this reason; `SummaryInput` follows
//     the same idiom.
//   - The MONITOR variant carries only `run: MonitorRun` — no caller-built
//     `LogStep[]` needed. Every work row is derived internally via
//     `buildMonitorLogSteps` (the exact function the Log screen already
//     uses, so a summary row's label/measured fields can never drift from
//     what a rower's saved log would show), and the warm-up row plus all
//     three heroes are computed straight from `run.actuals`/`run.program`,
//     which is where the wire's rest-distance (R-B) and programmed rest
//     seconds (R-D) actually live — `LogStep` never carries either.
//   - The TIMER and MANUAL variants DO take caller-built `steps: LogStep[]`
//     (`buildLogSteps(run, draft)` / `buildManualLogSteps(workout,
//     baselines)`) because building those requires `SessionDraft`/
//     `Baselines`/the workout's own `Step[]` — none of which this module
//     declares as inputs. Pulling that whole resolution chain in here
//     would grow this module's surface far past "pure model over a
//     finished run's own numbers"; the caller (Task 5's screen, which
//     already has draft/baselines on hand to build the Log screen's own
//     step list today) builds `steps` once and hands it to both this
//     module and the Log screen.
//
// SCOPE DECISIONS (documented, not silent — recurring failure #10):
//
//   - DISTANCE is MONITOR-DOOR ONLY. R-B ties it explicitly to "the
//     machine's own number" (0x0037's rest distance, `IntervalActual.
//     restDistanceMeters` — R-B's own citation), and no other door has a
//     comparable machine total: a phone-timer session never records a
//     distance actual for a TIME phase at all (`session/engine.ts`'s
//     `nextDistance` is the only actuals writer and needs `phase.meters`),
//     and the manual door has no measurement of any kind. TIMER/MANUAL
//     `heroes.distanceMeters` is always absent. This matches §2B's own
//     per-cell absence rule ("any cell whose inputs are absent is ABSENT")
//     rather than inventing a number neither door can check against
//     anything.
//   - TIME uses R-D's formula (Σ work seconds + programmed rest for
//     completed intervals) on the MONITOR door only — R-D's own heading is
//     explicitly scoped ("every monitor session's TIME") and its caveat
//     ("connected times will read LOWER than today's wall-clock minutes")
//     only makes sense as a change FROM wall-clock, which is what TIMER
//     keeps: `completedAt - startedAt`, at m:ss precision (not rounded to
//     the nearest minute the way the old `logTotals` was — the same
//     "expose what Math.round hid" reasoning R-D's own F-1 note gives for
//     the monitor door, applied here for consistency, not because the spec
//     names it for TIMER). MANUAL has no run record and no `workout` input
//     (see below), so its TIME hero is always absent — the "or date-only"
//     half of §2B's own stated fallback ("manual: the estimate or
//     date-only"); the "estimate" half needs the workout's authored steps,
//     which this module does not take as input.
//   - `caption` implements ONLY §2E's "TARGETS ONLY · NOTHING MEASURED"
//     rule. §2E's header row ALSO wants a "paces caption" (`PACES OFF 6K
//     m:ss`) — that computation (`LogSession.tsx`'s own unexported
//     `pacesLockedText`/`lockedBaseline`/`manualLockedBaseline`) needs
//     baselines and, for the timer door, the matched `SessionDraft` —
//     inputs this module deliberately does not take (see above). Left for
//     Task 5, which already has those values in hand when it builds
//     `steps`. Flagged here rather than guessed at with a fragile
//     reimplementation that would silently drift from the Log screen's own
//     "never a bare dash" rule.
//   - A PRESCRIBED row's "offset" cell (§2E: `6K +8`) is not decomposed out
//     of `LogStep.label` — `label` already IS `${duration} @ ${refLabel
//     (ref)}` (the shared idiom every `LogStep` builder uses), so Task 5
//     can render it whole; splitting it back into separate
//     distance/target-pace/offset cells would mean parsing a string this
//     module has no structural guarantee about (a legacy pre-`ref`
//     `SessionRun`'s fallback label, `logDraft.ts`'s own FALLBACK
//     paragraph, does not follow the `@` idiom). `SummaryRow`'s prescribed
//     variant exposes `targetPaceLabel` (from `targetSplit`, cleanly
//     available) and `durationLabel` (from `meters`/`seconds`, also
//     cleanly available) alongside the whole `label`, and leaves the
//     isolated offset fragment to a follow-up if Task 5 finds it's
//     genuinely needed.

import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import type { IntervalActual } from "../../domain/monitor/types.js";
import {
  measuredSessionSeconds,
  type MonitorRun,
} from "../monitor/monitorRun.js";
import {
  buildMonitorLogSteps,
  formatLogDate,
  MONITOR_SPLIT_MAX,
  type LogStep,
} from "./logDraft";
import type { SessionRun } from "./run";

/** Per §2A: `AUG 10 · 18:57 · PM5 <id>` / `· TIMER` / `· LOGGED BY HAND`.
 *  `timeLabel` is absent for the manual door — an off-app row has no
 *  wall-clock moment to show (§2B's own "date-only" fallback wording). */
export interface SummaryMeta {
  dateLabel: string;
  timeLabel?: string;
  sourceLabel: string;
}

/** §2B. `time`/`avgSplit` are pre-formatted display strings (the house
 *  `m:ss`/`m:ss.t` grammars, `domain/duration.js`/`domain/format.js`) so
 *  Task 5 never re-derives rounding; `distanceMeters` stays a raw whole
 *  number (the brief's own declared shape) since a hero showing a bare
 *  number with a unit suffix is a rendering choice, not a value one. Any
 *  field is absent, never a fabricated zero (§2B's own "no `0:00`, no
 *  `0 m`" rule) — see this module's own per-hero comments for the exact
 *  "present only when its underlying sum is greater than zero" rule each
 *  one applies.
 *
 *  Phase PW spec 2 §2: `avgSplitSeconds`/`timeSeconds` are the NUMBERS the
 *  strings above were formatted FROM, exported so the from-the-log POST
 *  site (`LogSession.tsx`'s shared body assembly) never re-derives one —
 *  this module is the ONE place the number-string pairing is decided.
 *  Each numeric field is present EXACTLY when its string sibling is:
 *  `avgSplit = fmtSplit(avgSplitSeconds)`, `time = fmtDuration(timeSeconds
 *  / 60)` (the formatter takes MINUTES — spec §2's documented trap, easy
 *  to get backwards at a call site that already has raw seconds in
 *  hand). `distanceMeters` already doubles as its own number (no separate
 *  string sibling to pair with). */
export interface SummaryHeroes {
  avgSplit?: string;
  avgSplitSeconds?: number;
  time?: string;
  timeSeconds?: number;
  distanceMeters?: number;
}

/** A judged measured row's deviation vs. the 2B working average (§2E,
 *  §1's own capped formula). `direction` is redundant with
 *  `deviationSeconds`'s sign but spares every consumer from re-deriving
 *  "faster means negative" — the ONE place that fact is decided. */
export interface RowJudgment {
  direction: "faster" | "slower";
  deviationSeconds: number;
  /** `"+1.5"` / `"−1.1"` — one decimal, the house minus sign (U+2212,
   *  `refLabel`'s own convention, `domain/pace.ts`), never a hyphen. */
  deviationLabel: string;
  /** `min(50, max(1.2, |dev|/1.6 × 50))` — §1's deviation table. */
  barWidthPercent: number;
}

/** A measured row (§2E: index/time/pace/deviation-bar geometry) — includes
 *  the warm-up row, which is measured-shaped but never `judged` (R-C: "no
 *  deviation bar, excluded from the average"). `index` is absent for the
 *  warm-up row (it is never numbered — §2E labels it `WARM-UP` instead,
 *  via `isWarmup`). `timeLabel`/`paceLabel` are each independently absent
 *  when their own underlying reading is unavailable (per-cell absence);
 *  `judged` is present only when a `paceLabel` exists AND the door has a
 *  working average to compare it against. */
export interface MeasuredRow {
  measured: true;
  isWarmup: boolean;
  index?: number;
  label: string;
  timeLabel?: string;
  paceLabel?: string;
  judged?: RowJudgment;
}

/** A prescribed (unmeasured) row (§2E: index/distance-duration/target-pace/
 *  offset/`—`). See this module's header for why the offset fragment is
 *  not split out of `label`. */
export interface PrescribedRow {
  measured: false;
  isWarmup: boolean;
  index?: number;
  label: string;
  durationLabel?: string;
  targetPaceLabel?: string;
}

export type SummaryRow = MeasuredRow | PrescribedRow;

export interface SummaryModel {
  meta: SummaryMeta;
  heroes: SummaryHeroes;
  rows: SummaryRow[];
  /** §2E: `TARGETS ONLY · NOTHING MEASURED`, present only when literally no
   *  row (including the warm-up) carries a measurement (R-E, verbatim:
   *  "appears only when NO row carries a measurement"). */
  caption?: string;
}

export type SummaryInput =
  | { door: "monitor"; run: MonitorRun }
  | { door: "timer"; run: SessionRun; steps: LogStep[] }
  | { door: "manual"; steps: LogStep[]; dateIso: string };

/** §1's capped deviation-bar formula, exported standalone so its two clamp
 *  edges (1.2% floor, 50% cap) get a direct, non-integration test. Takes
 *  the SIGNED deviation in seconds (row pace − working average); only the
 *  magnitude drives the width. */
export function deviationBarWidthPercent(deviationSeconds: number): number {
  const raw = (Math.abs(deviationSeconds) / 1.6) * 50;
  return Math.min(50, Math.max(1.2, raw));
}

/** Exported (from-the-log spec, 2026-08-18, Task 5): the from-the-log
 *  view's own row builder (`src/log/storedSummary.ts`) judges a stored
 *  row's `actualSplit` against the STORED `avg_split_seconds` — the exact
 *  same formula this module's own doors use to judge a row against their
 *  freshly-computed working average, never re-derived a second time. Pure
 *  visibility change only: the function itself is unmodified. */
export function judge(
  rowSplitSeconds: number,
  workingAverageSeconds: number,
): RowJudgment {
  const deviationSeconds = rowSplitSeconds - workingAverageSeconds;
  // "+ = slower" (R-C/§1): a positive deviation means the row's own split
  // took MORE seconds per 500m than the average, i.e. slower. A dead-even
  // row (deviation exactly 0) reads as "slower" by this same rule — there
  // is no third "even" bucket in the design (§1's own two-color legend,
  // "← FASTER (BLUE) · SLOWER (RED) →", has no middle case) — pinned by a
  // dedicated test.
  const direction: "faster" | "slower" =
    deviationSeconds < 0 ? "faster" : "slower";
  const sign = deviationSeconds < 0 ? "−" : "+";
  const deviationLabel = `${sign}${Math.abs(deviationSeconds).toFixed(1)}`;
  return {
    direction,
    deviationSeconds,
    deviationLabel,
    barWidthPercent: deviationBarWidthPercent(deviationSeconds),
  };
}

/** A working average plus how many rows built it — the `count` half exists
 *  for review finding 5 (RULED, controller, flagged for James at PR): when
 *  exactly ONE measured row fed the average, that row's own deviation
 *  against it is always exactly zero (it IS the average) — judging it
 *  anyway would paint the commonest session shape (one measured interval)
 *  with an invented full-width bar and a color, for a "deviation" that was
 *  never really measured against anything but itself. Callers gate
 *  `judge()` on `count >= 2`, never on `seconds !== undefined` alone. */
interface WorkingAverage {
  seconds: number | undefined;
  count: number;
}

/** `500 × Σt/Σd`, absent when `Σd` is not `> 0` (R-C's own formula; the
 *  "no `0:00`, no `0 m`" per-cell absence rule extended to a division that
 *  would otherwise produce `NaN`/`Infinity`). `count` is `rows.length`
 *  unconditionally — every row a caller pushes here already passed that
 *  caller's own floor/exclusion checks (review findings 1/2), so array
 *  length IS the count of genuinely judgeable readings. */
function weightedAverage(
  rows: { seconds: number; meters: number }[],
): WorkingAverage {
  let t = 0;
  let d = 0;
  for (const r of rows) {
    t += r.seconds;
    d += r.meters;
  }
  return { seconds: d > 0 ? (500 * t) / d : undefined, count: rows.length };
}

/**
 * Review finding 1: a rowed interval takes real strokes — nobody covers
 * meaningful ground in under a second. An elapsed-time reading below this
 * floor (reported directly by the PM5 on the monitor door, or
 * reconstructed from `actualSplit × meters ÷ 500` on the timer door — see
 * `timerAvgSplitSeconds`'s own doc comment for why that reconstruction is
 * exact) is measurement noise, not a real reading — a mis-tapped
 * stopwatch button, a boundary read before the erg settled. Every site
 * below treats a sub-floor reading as though NOTHING was measured at
 * all: no time/pace string is ever rendered (never a fabricated
 * `"0:00"`/`"0:00.1"` — the OLD `> 0` guard let a 0.2s reading straight
 * through, since 0.2 rounds to "0:00" but is still `> 0`), and the row is
 * excluded from whatever working average it would otherwise distort — a
 * single 0.2s mis-tap can drag a multi-interval AVG SPLIT hero to roughly
 * half its honest value (the review's own worked example: 2:00.0 →
 * 1:00.0). A sub-floor row renders in its PRESCRIBED shape (§2E's
 * unmeasured-row geometry), not a measured row with blank cells — "stay
 * out of the average" and "render as unmeasured" are the same rule
 * applied to the hero and to the row respectively.
 *
 * Picked, not derived: comfortably below the shortest interval this app
 * lets anyone program at all (`compileProgram`'s own documented minimum —
 * interface-notes.md §8 — 20s time / 100m distance) and comfortably above
 * what a button-press artifact reads.
 *
 * Applied uniformly across BOTH doors' warm-up and work rows, and both
 * AVG SPLIT computations — the review's own citation (`timerWarmupRow`/
 * `timerWorkRows`) named only the timer door, where the defect was found,
 * but the identical unguarded shape existed on the monitor door's own
 * `paceLabel`/`timeLabel` emission (gated only by `MONITOR_SPLIT_MAX`'s
 * upper band, never a lower one) — closed here too rather than left as a
 * known-analogous hole next to the one just fixed.
 */
export const MIN_MEASURABLE_ELAPSED_SECONDS = 1;

// ---------------------------------------------------------------------
// Monitor door
// ---------------------------------------------------------------------

/** Same map `buildMonitorLogSteps` (`logDraft.ts`) builds internally —
 *  duplicated here (not exported from that module) because this function
 *  needs it for the heroes AND the warm-up row, neither of which
 *  `buildMonitorLogSteps`'s own `LogStep[]` output carries (warm-up rows
 *  never appear there at all — `logDraft.ts`'s own doc comment, "shape
 *  parity with the manual door"). `IntervalActual.index === null` ("this
 *  actual's own interval identity is unknown") is skipped, same rule as
 *  every other consumer of `run.actuals` (`domain/monitor/types.ts`'s own
 *  doc comment on the field). */
function actualByIndex(run: MonitorRun): Map<number, IntervalActual> {
  const map = new Map<number, IntervalActual>();
  for (const actual of run.actuals) {
    if (actual.index !== null) map.set(actual.index, actual);
  }
  return map;
}

/** The warm-up interval's position in `run.program.intervals`, or -1 when
 *  this run has no warm-up (or no `logSeed` at all — a v1 `MonitorRun`
 *  predating the field, `MonitorRun.logSeed`'s own doc comment). At most
 *  one warm-up ever exists (`session/engine.ts`'s `warmupPhases`, the ONE
 *  producer, always emits zero or one) — `findIndex` rather than assuming
 *  index 0 for clarity, not because a second one is expected. */
function warmupIndex(run: MonitorRun): number {
  return run.logSeed?.steps.findIndex((s) => s.kind === "warmup") ?? -1;
}

/** R-B: DISTANCE = Σ(work + rest distance) over ALL actuals incl. warm-up
 *  — the erg-checkable total (0x0037's own Interval Rest Distance, task 2's
 *  wire addition). `restDistanceMeters` reads `?? 0` per that field's own
 *  documented contract: a `MonitorRun.actuals` entry persisted before the
 *  field existed loads back `undefined` at runtime despite the type saying
 *  `number` (`domain/monitor/types.ts`'s own comment on
 *  `IntervalActual.restDistanceMeters`) — this is the first consumer of
 *  that contract. Absent (not `0`) when the sum is not `> 0` — no actuals
 *  at all, or a degenerate all-zero-distance run — per §2B's "no `0 m`"
 *  rule. */
function monitorDistanceMeters(run: MonitorRun): number | undefined {
  let total = 0;
  for (const actual of run.actuals) {
    total += actual.distanceMeters + (actual.restDistanceMeters ?? 0);
  }
  return total > 0 ? Math.round(total) : undefined;
}

/** R-D: TIME = Σ work seconds + programmed rest for completed intervals,
 *  warm-up included — `monitorRun.ts`'s `measuredSessionSeconds` (review
 *  finding 3: this used to be a byte-for-byte duplicate of that module's
 *  `interruptedTotalSeconds`, a formula with its own OPEN hardware finding
 *  — F-1, the walk sheet's unreproduced "6 MIN where the wire computes 5"
 *  reading. Importing the shared function means F-1's eventual fix lands
 *  in both callers at once, not just the one this duplicate happened to
 *  live next to). Generalized here to every monitor run per R-D's own text
 *  ("James's recorded rule, generalized from the interrupted branch") —
 *  this call site is not itself about an interrupted run, which is why it
 *  reaches for the neutral name rather than the original. Absent when the
 *  sum is not `> 0` (no `0:00`). */
function monitorTimeSeconds(run: MonitorRun): number | undefined {
  const total = measuredSessionSeconds(run);
  return total > 0 ? total : undefined;
}

/** R-C: AVG SPLIT = `500 × Σt/Σd` over measured WORK rows — warm-up
 *  EXCLUDED (R-C, verified against the committed walk-3 wire: including it
 *  moves the hero — see the test file's own oracle). Two further
 *  exclusions (review finding 1/2, neither present in the original cut):
 *
 *  - `actual.index === null` — an unattributable boundary
 *    (`IntervalActual.index`'s own doc comment: "must not be treated as
 *    interval 0") has no program identity to judge against at all; the
 *    OLD condition (`actual.index !== null && actual.index === wuIndex`)
 *    only ever fired when an index WAS present, so a null-index actual
 *    fell straight through into the average instead of being excluded —
 *    contaminating the exact hero R-C exists to protect. DISTANCE/TIME
 *    still include it (machine semantics — the meters/seconds genuinely
 *    happened, `monitorDistanceMeters`/`monitorTimeSeconds` above, both
 *    unconditional on `index`); only JUDGING it is what has no honest
 *    basis.
 *  - `actual.elapsedSeconds < MIN_MEASURABLE_ELAPSED_SECONDS` — see that
 *    constant's own doc comment.
 *
 *  Returns the `{seconds, count}` pair (`WorkingAverage`'s own doc
 *  comment) — `count` is what lets `monitorWorkRows` apply finding 5's
 *  RULING (a lone measured row is never judged). */
function monitorAvgSplit(run: MonitorRun): WorkingAverage {
  const wuIndex = warmupIndex(run);
  const rows: { seconds: number; meters: number }[] = [];
  for (const actual of run.actuals) {
    if (actual.index === null) continue;
    if (actual.index === wuIndex) continue;
    if (actual.elapsedSeconds < MIN_MEASURABLE_ELAPSED_SECONDS) continue;
    rows.push({
      seconds: actual.elapsedSeconds,
      meters: actual.distanceMeters,
    });
  }
  return weightedAverage(rows);
}

function monitorHeroes(
  run: MonitorRun,
  avgSplit: WorkingAverage,
): SummaryHeroes {
  const timeSeconds = monitorTimeSeconds(run);
  return {
    avgSplit:
      avgSplit.seconds !== undefined ? fmtSplit(avgSplit.seconds) : undefined,
    avgSplitSeconds: avgSplit.seconds,
    time: timeSeconds !== undefined ? fmtDuration(timeSeconds / 60) : undefined,
    timeSeconds,
    distanceMeters: monitorDistanceMeters(run),
  };
}

/** The warm-up row (§2E: "Rendered, labeled WARM-UP, measured values
 *  shown, UNJUDGED"), or `null` when this run has no warm-up interval at
 *  all. When the warm-up's own boundary never arrived (the piece was
 *  skipped, or its actual was lost the same way any boundary can be — the
 *  run contract's `boundary-out-of-run`/divergence cases,
 *  `domain/monitor/types.ts`) OR its own elapsed reading is below
 *  `MIN_MEASURABLE_ELAPSED_SECONDS` (review finding 1 — a boundary this
 *  degenerate is not a real reading either), the row still renders (the
 *  label alone is honest — "there was a warm-up interval") with every
 *  measured field absent, never a fabricated `0:00`. */
function monitorWarmupRow(run: MonitorRun): MeasuredRow | null {
  const wuIndex = warmupIndex(run);
  if (wuIndex === -1) return null;
  const actual = actualByIndex(run).get(wuIndex);
  if (
    actual === undefined ||
    actual.elapsedSeconds < MIN_MEASURABLE_ELAPSED_SECONDS
  ) {
    return { measured: true, isWarmup: true, label: "WARM-UP" };
  }
  const paceSeconds =
    actual.avgSplit !== null &&
    actual.avgSplit > 0 &&
    actual.avgSplit <= MONITOR_SPLIT_MAX
      ? actual.avgSplit
      : undefined;
  return {
    measured: true,
    isWarmup: true,
    label: "WARM-UP",
    timeLabel: fmtDuration(actual.elapsedSeconds / 60),
    paceLabel: paceSeconds !== undefined ? fmtSplit(paceSeconds) : undefined,
    // UNJUDGED by construction: R-C excludes the warm-up from the working
    // average, so there is nothing honest to compare it against.
  };
}

/** Review finding 1: a `pm5`-sourced row whose own elapsed reading is
 *  below `MIN_MEASURABLE_ELAPSED_SECONDS` renders in its PRESCRIBED shape
 *  (§2E's unmeasured-row geometry) — not a measured row with blank
 *  cells — and is excluded from `monitorAvgSplitSeconds`'s average by
 *  that same function's own floor check, so the row list and the hero
 *  agree on which readings count. */
function isMonitorRowMeasurable(step: LogStep): boolean {
  return (
    step.actualSource === "pm5" &&
    step.actualSeconds !== undefined &&
    step.actualSeconds >= MIN_MEASURABLE_ELAPSED_SECONDS
  );
}

function monitorWorkRows(
  run: MonitorRun,
  avgSplit: WorkingAverage,
): SummaryRow[] {
  const steps = buildMonitorLogSteps(run);
  return steps.map((step, i) => {
    const index = i + 1;
    if (!isMonitorRowMeasurable(step)) {
      return {
        measured: false,
        isWarmup: false,
        index,
        label: step.label,
        durationLabel:
          step.meters !== undefined
            ? `${step.meters} m`
            : step.seconds !== undefined
              ? fmtDuration(step.seconds / 60)
              : undefined,
        targetPaceLabel:
          step.targetSplit !== undefined
            ? fmtSplit(step.targetSplit)
            : undefined,
      };
    }
    // isMonitorRowMeasurable already proved actualSeconds is defined and
    // >= the floor — the `!` documents that, matching this file's own `!`
    // convention for a fact a preceding check already established.
    const timeLabel = fmtDuration(step.actualSeconds! / 60);
    const paceLabel =
      step.actualSplit !== undefined ? fmtSplit(step.actualSplit) : undefined;
    // Finding 5 (RULED): a lone measured row is never judged — `count`
    // must be at least 2 (`WorkingAverage`'s own doc comment), not merely
    // `seconds !== undefined`.
    const judged =
      step.actualSplit !== undefined &&
      avgSplit.seconds !== undefined &&
      avgSplit.count >= 2
        ? judge(step.actualSplit, avgSplit.seconds)
        : undefined;
    return {
      measured: true,
      isWarmup: false,
      index,
      label: step.label,
      timeLabel,
      paceLabel,
      judged,
    };
  });
}

function buildMonitorModel(run: MonitorRun): SummaryModel {
  const avgSplit = monitorAvgSplit(run);
  const heroes = monitorHeroes(run, avgSplit);
  const warmupRow = monitorWarmupRow(run);
  const workRows = monitorWorkRows(run, avgSplit);
  const rows = warmupRow !== null ? [warmupRow, ...workRows] : workRows;

  const iso =
    run.endedBy === "interrupted"
      ? run.startedAt
      : (run.completedAt ?? run.startedAt);
  const meta: SummaryMeta = {
    dateLabel: formatLogDate(iso),
    timeLabel: formatTimeOfDay(iso),
    sourceLabel: run.deviceName,
  };

  return { meta, heroes, rows, caption: targetsOnlyCaption(rows) };
}

// ---------------------------------------------------------------------
// Timer door
// ---------------------------------------------------------------------

/** The phone-timer engine's own warm-up phase, if this run has one
 *  (`session/engine.ts`'s `warmupPhases`, the ONE producer of `type:
 *  "warmup"` phases — see that module's header). Unlike the manual/monitor
 *  builders, `buildLogSteps` (`logDraft.ts`) never emits a `LogStep` for
 *  it at all (module header: "Warm-up and rest phases never become a
 *  LogStep"), so the caller's `steps: LogStep[]` genuinely cannot carry
 *  it — this reads `run.phases` directly, the one place it survives. A
 *  DISTANCE warm-up CAN be genuinely measured: `session/engine.ts`'s
 *  `nextDistance` is keyed by phase position, not phase TYPE, so a
 *  distance-kind warm-up phase can receive a real `PhaseActual` the same
 *  way any distance work phase does. */
function timerWarmupRow(run: SessionRun): MeasuredRow | null {
  const index = run.phases.findIndex((p) => p.type === "warmup");
  if (index === -1) return null;
  const actual = run.actuals[index];
  // Review finding 1: a below-floor elapsed reading (a mis-tapped
  // stopwatch button on this door's own genuinely-measurable distance
  // warm-up) is treated identically to "no actual at all" — see
  // `MIN_MEASURABLE_ELAPSED_SECONDS`'s own doc comment. This is also what
  // closes the ORIGINAL unguarded `paceLabel: fmtSplit(actual.splitSeconds)`
  // below: that line used to run unconditionally, with no lower bound at
  // all.
  if (
    actual === undefined ||
    actual.elapsedSeconds < MIN_MEASURABLE_ELAPSED_SECONDS
  ) {
    return { measured: true, isWarmup: true, label: "WARM-UP" };
  }
  return {
    measured: true,
    isWarmup: true,
    label: "WARM-UP",
    timeLabel: fmtDuration(actual.elapsedSeconds / 60),
    paceLabel: fmtSplit(actual.splitSeconds),
  };
}

/** Wall-clock TIME (this module's header: R-D is monitor-only). `m:ss`
 *  precision, not rounded to the nearest minute the way the old
 *  `logDraft.ts`'s `logTotals` was. Absent when the run never closed
 *  (`completedAt === null`, shouldn't happen for a finished summary but
 *  defensive) or the span is not `> 0`. */
function timerTimeSeconds(run: SessionRun): number | undefined {
  if (run.completedAt === null) return undefined;
  const seconds = Math.max(
    0,
    (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) /
      1000,
  );
  return seconds > 0 ? seconds : undefined;
}

/** A stopwatch-measured row's reconstructed elapsed seconds
 *  (`actualSplit × meters ÷ 500`, the exact inverse of `session/engine.ts`'s
 *  `nextDistance`), or `undefined` for a non-stopwatch row — `undefined`
 *  when either the row isn't a stopwatch reading at all, or its
 *  reconstructed elapsed time is below `MIN_MEASURABLE_ELAPSED_SECONDS`
 *  (review finding 1: treated as though nothing was measured, never a
 *  fabricated small pace/time). Every stopwatch-measured `LogStep` carries
 *  `actualSplit`/`meters` TOGETHER by construction (`nextDistance` is the
 *  only actuals writer and only ever runs on a phase with `meters` set) —
 *  the `!`s document that guarantee, matching `logDraft.ts`'s own
 *  convention for the identical fact. Shared by `timerAvgSplit` (the hero)
 *  and `timerWorkRows` (the row list) so the two can never disagree on
 *  which readings count. */
function timerMeasurableElapsedSeconds(step: LogStep): number | undefined {
  if (step.actualSource !== "stopwatch") return undefined;
  const elapsedSeconds = (step.actualSplit! * step.meters!) / 500;
  return elapsedSeconds >= MIN_MEASURABLE_ELAPSED_SECONDS
    ? elapsedSeconds
    : undefined;
}

/** Measured (stopwatch) rows only, weighted by distance — `LogStep.
 *  actualSeconds` doesn't exist on the phone-timer door (that field is
 *  pm5-only, `LogStep`'s own doc comment), which is why
 *  `timerMeasurableElapsedSeconds` reconstructs it rather than reading it
 *  straight off the step. The warm-up phase's own `LogStep` never reaches
 *  this function at all (`buildLogSteps` never emits one), so it is
 *  excluded from the average the same way R-C excludes it for the monitor
 *  door — a generalization of that rule's reasoning, not its letter (this
 *  module's own header). Returns `{seconds, count}` (`WorkingAverage`'s
 *  own doc comment) — `count` is what lets `timerWorkRows` apply finding
 *  5's RULING (a lone measured row is never judged). */
function timerAvgSplit(steps: LogStep[]): WorkingAverage {
  const rows: { seconds: number; meters: number }[] = [];
  for (const step of steps) {
    const seconds = timerMeasurableElapsedSeconds(step);
    if (seconds === undefined) continue;
    // meters is defined here by the same construction guarantee
    // `timerMeasurableElapsedSeconds` already relies on.
    rows.push({ seconds, meters: step.meters! });
  }
  return weightedAverage(rows);
}

function timerWorkRows(
  steps: LogStep[],
  avgSplit: WorkingAverage,
): SummaryRow[] {
  return steps.map((step, i) => {
    const index = i + 1;
    const elapsedSeconds = timerMeasurableElapsedSeconds(step);
    if (elapsedSeconds === undefined) {
      return {
        measured: false,
        isWarmup: false,
        index,
        label: step.label,
        durationLabel:
          step.meters !== undefined
            ? `${step.meters} m`
            : step.seconds !== undefined
              ? fmtDuration(step.seconds / 60)
              : undefined,
        targetPaceLabel:
          step.targetSplit !== undefined
            ? fmtSplit(step.targetSplit)
            : undefined,
      };
    }
    // timerMeasurableElapsedSeconds already proved this is a stopwatch
    // row with actualSplit defined — the `!` documents that.
    // Finding 5 (RULED): a lone measured row is never judged — `count`
    // must be at least 2, not merely `seconds !== undefined`.
    const judged =
      avgSplit.seconds !== undefined && avgSplit.count >= 2
        ? judge(step.actualSplit!, avgSplit.seconds)
        : undefined;
    return {
      measured: true,
      isWarmup: false,
      index,
      label: step.label,
      timeLabel: fmtDuration(elapsedSeconds / 60),
      paceLabel: fmtSplit(step.actualSplit!),
      judged,
    };
  });
}

function buildTimerModel(run: SessionRun, steps: LogStep[]): SummaryModel {
  const avgSplit = timerAvgSplit(steps);
  const timeSeconds = timerTimeSeconds(run);
  const heroes: SummaryHeroes = {
    avgSplit:
      avgSplit.seconds !== undefined ? fmtSplit(avgSplit.seconds) : undefined,
    avgSplitSeconds: avgSplit.seconds,
    time: timeSeconds !== undefined ? fmtDuration(timeSeconds / 60) : undefined,
    timeSeconds,
    // DISTANCE: this module's header — timer door has no machine total.
  };
  const warmupRow = timerWarmupRow(run);
  const workRows = timerWorkRows(steps, avgSplit);
  const rows = warmupRow !== null ? [warmupRow, ...workRows] : workRows;

  const iso = run.completedAt ?? run.startedAt;
  const meta: SummaryMeta = {
    dateLabel: formatLogDate(iso),
    timeLabel: formatTimeOfDay(iso),
    sourceLabel: "TIMER",
  };

  return { meta, heroes, rows, caption: targetsOnlyCaption(rows) };
}

// ---------------------------------------------------------------------
// Manual door
// ---------------------------------------------------------------------

function buildManualModel(steps: LogStep[], dateIso: string): SummaryModel {
  // `buildManualLogSteps` never sets `actualSource: "stopwatch"` — its own
  // doc comment: "ALL split-ref actuals are 'assumed'" — so a manual
  // door's rows are always prescribed-shaped and its caption always fires.
  const rows: SummaryRow[] = steps.map((step, i) => ({
    measured: false,
    isWarmup: false,
    index: i + 1,
    label: step.label,
    durationLabel:
      step.meters !== undefined
        ? `${step.meters} m`
        : step.seconds !== undefined
          ? fmtDuration(step.seconds / 60)
          : undefined,
    targetPaceLabel:
      step.targetSplit !== undefined ? fmtSplit(step.targetSplit) : undefined,
  }));

  const meta: SummaryMeta = {
    dateLabel: formatLogDate(dateIso),
    sourceLabel: "LOGGED BY HAND",
  };

  return {
    meta,
    // No `run` at all and no `workout` input (module header) — TIME/
    // DISTANCE/AVG SPLIT are all absent; the "date-only" half of §2B's
    // own stated fallback.
    heroes: {},
    rows,
    caption: targetsOnlyCaption(rows),
  };
}

// ---------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------

/** R-E, verbatim: "TARGETS ONLY · NOTHING MEASURED appears only when NO
 *  row carries a measurement" — every row, warm-up included. Final-review
 *  FIX-2: `measured: true` alone is not a real reading — both
 *  `monitorWarmupRow` and `timerWarmupRow` return `{measured: true,
 *  isWarmup: true, label: "WARM-UP"}` with no `timeLabel`/`paceLabel` when
 *  the warm-up carries no reading (a lost boundary, or a TIME-kind warm-up
 *  that can never be measured at all). A row like that "carries" nothing;
 *  gate on an actual label, not the discriminant alone. */
// Exported (from-the-log spec, Task 5): `storedSummary.ts`'s own caption
// reuses this exact rule rather than a second copy — visibility change
// only.
export function targetsOnlyCaption(rows: SummaryRow[]): string | undefined {
  return rows.some(
    (r) =>
      r.measured && (r.timeLabel !== undefined || r.paceLabel !== undefined),
  )
    ? undefined
    : "TARGETS ONLY · NOTHING MEASURED";
}

/** §2A: "Local time via the device locale, minutes precision" —
 *  `18:57`-style (24-hour, no seconds). `hourCycle: "h23"` (review: pin
 *  this explicitly, never `hour12: false`) is the fix, not a style choice:
 *  `hour12: false` only says "not 12-hour" — ICU is free to satisfy that
 *  with EITHER `h23` (0-23, midnight is `"00"`) or `h24` (1-24, midnight
 *  is `"24"`), and which one a given build/locale picks is exactly the
 *  ambiguity that produced a `"24:05"` reading on some builds. `h23` is
 *  named explicitly so midnight can never print as `"24:XX"`. The empty
 *  locales array defers to the device's own locale exactly as the
 *  requirement asks. */
// Exported (from-the-log spec, Task 5): `storedSummary.ts`'s own meta
// builder reuses this exact formatter (same h23-pinned reasoning) rather
// than a second copy — visibility change only.
export function formatTimeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** @throws {MonitorLogSeedError} for the monitor door only, when `input.run`
 *  is a legacy (`v1`, no `logSeed`) `MonitorRun` or one whose `logSeed`
 *  doesn't line up with its own `program` — see this module's own header,
 *  "CAN THROW", for the full contract and what a caller owes it. */
export function buildSummaryModel(input: SummaryInput): SummaryModel {
  switch (input.door) {
    case "monitor":
      return buildMonitorModel(input.run);
    case "timer":
      return buildTimerModel(input.run, input.steps);
    case "manual":
      return buildManualModel(input.steps, input.dateIso);
  }
}
