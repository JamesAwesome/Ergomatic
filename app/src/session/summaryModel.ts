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
//     what a rower's saved log would show), and all three heroes are
//     computed straight from `run.actuals`/`run.program`,
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
import { judgeVsTarget } from "../judgeBand.js";
import {
  measuredSessionSeconds,
  type MonitorRun,
} from "../monitor/monitorRun.js";
import {
  buildMonitorLogSteps,
  formatLogDate,
  spmIsMeasured,
  type LogStep,
} from "./logDraft";
import type { SessionRun } from "./run";

/** Per §2A: `AUG 10 · 18:57 · PM5 <id>` / `· TIMER` / `· LOGGED BY HAND`,
 *  plus Phase LM Task 4's fourth answer `· NO MONITOR READING`
 *  (`NO_MONITOR_READING_SOURCE` below has the whole rule).
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
 *  string sibling to pair with).
 *
 *  RC-5 (hero-truth design spec, 2026-08-25) §1: on the monitor door,
 *  these three are now ONE population — work only — whatever the row's
 *  tier: tier A (the row carries the machine's own `summaryTotals`)
 *  renders them verbatim, including the machine's OWN `avgSplit` (never a
 *  quotient of ours); tier B computes the identical three quantities from
 *  the row's own actuals. See `monitorHeroes` in this module for the
 *  tier split itself.
 *
 *  `totalLine` (§2): the wall-clock total — the number DISTANCE/TIME
 *  above used to fold rest into, before this task — on its OWN line,
 *  built by the exported `buildTotalLine` (the ONE place the string is
 *  formatted; `storedSummary.ts`'s stored-row screen reuses it rather
 *  than a second copy). Absent only when there is no total to show at
 *  all (the manual/timer doors never set it — no rest concept applies to
 *  either). */
export interface SummaryHeroes {
  avgSplit?: string;
  avgSplitSeconds?: number;
  time?: string;
  timeSeconds?: number;
  distanceMeters?: number;
  totalLine?: string;
}

/** A judged row's deviation vs. a baseline split — the shape itself stays
 *  baseline-agnostic (`direction`/`deviationLabel`/`barWidthPercent` are
 *  computed the same way regardless of what `judge()` below is fed) even
 *  though, as of Task 3, only ONE baseline is left in the codebase: the
 *  row's OWN target (James's ruling, 2026-08-18: "that section needs to
 *  be about performance against target per int"). `rowJudgment` below
 *  (THIS module's own live rows) and `storedSummary.ts` (from-the-log,
 *  re-baselined at Task 3, §4) both reach `judge()` the SAME way now —
 *  through `rowJudgment` itself, never a direct call against a working
 *  average — history: before Task 3, `storedSummary.ts` called `judge()`
 *  directly against the stored `avg_split_seconds` working average; that
 *  whole second baseline is retired from row judgment (the stored average
 *  still feeds the AVG SPLIT hero, untouched — ruling 4). The type stays
 *  baseline-agnostic in NAME because the underlying math has no opinion
 *  about what "baseline" means, not because a second live baseline still
 *  exists.
 *  `direction` is redundant with `deviationSeconds`'s sign but spares
 *  every consumer from re-deriving "faster means negative" — the ONE
 *  place that fact is decided. */
export interface RowJudgment {
  direction: "faster" | "slower";
  deviationSeconds: number;
  /** `"+1.5"` / `"−1.1"` — one decimal, the house minus sign (U+2212,
   *  `refLabel`'s own convention, `domain/pace.ts`), never a hyphen. */
  deviationLabel: string;
  /** `min(50, max(1.2, |dev|/1.6 × 50))` — §1's deviation table. */
  barWidthPercent: number;
}

/** A measured row (§2E: index/time/pace/deviation-bar geometry, §1's
 *  re-baseline: TARGET + SPM cells). `timeLabel`/`paceLabel` are each
 *  independently absent when their own underlying reading is unavailable
 *  (per-cell absence). Phase WU removed the `isWarmup` discriminant and the
 *  unnumbered `WARM-UP` row it labelled — every row is a numbered piece
 *  now. */
export interface MeasuredRow {
  measured: true;
  index?: number;
  label: string;
  timeLabel?: string;
  paceLabel?: string;
  /** §1's inline TARGET cell: this row's own target split, `m:ss.t`.
   *  Absent when the row has none — keyed on `targetSplit` ALONE (§1's
   *  own "abstains when" rule: "the TARGET cell keys on targetSplit
   *  alone"), so a pm5 pairing-exception row (real time/meters, no pace)
   *  still shows its target even though `judged`/`onTarget` below can
   *  never fire for it — hiding a true number would be the wrong-number
   *  class this phase exists to kill (antagonist B5). */
  targetLabel?: string;
  /** §2's compact SPM cell: `24 / 22`, measured first, the authored
   *  target after the slash. Either half independently absent (§2's own
   *  "absent halves drop" rule) — `buildSpmCell` below is the ONE place
   *  that resolves the pre-/post-split discriminant (`spmIsMeasured`,
   *  `logDraft.ts`) into this shape. Absent entirely when NEITHER half
   *  has a value. */
  spmCell?: { measured?: number; target?: number };
  /** §1's re-baselined row judgment, against THIS row's own target — see
   *  `rowJudgment` below for the judged-when rule (antagonist B4: the
   *  member set is NAMED — `actualSource` `"pm5"` or `"stopwatch"` only,
   *  never `"assumed"`) and the documented encoding choice for the third,
   *  on-target state: present ONLY when the row is judged AND lands
   *  OUTSIDE `ON_TARGET_BAND_SECONDS` (faster or slower). Within the
   *  band, `onTarget` below is `true` instead and this stays absent —
   *  chosen over widening `RowJudgment.direction` to a third value so
   *  this type and every existing `.direction === "faster"` consumer keep
   *  compiling unchanged. As of Task 3, `storedSummary.ts` (from-the-log)
   *  produces this field the SAME way THIS module's own rows do — through
   *  `rowJudgment` itself, not a second hand-rolled call — so there is
   *  only ONE producer of this field across the whole app (see
   *  `onTarget`'s own INVARIANT paragraph below). */
  judged?: RowJudgment;
  /** `true` ONLY when this row was judged (`rowJudgment`'s own gate —
   *  target present, real measured actual, `pm5`/`stopwatch` source) AND
   *  landed WITHIN `ON_TARGET_BAND_SECONDS`: plain ink, no bar, no `±`.
   *  Absent in every other case, including the genuinely unjudged one (no
   *  target, no measured actual, or an `"assumed"` source) — the renderer
   *  (Task 3) tells "on-target, evaluated" apart from "never evaluated at
   *  all" by checking THIS flag before falling back to "nothing to
   *  show", which is exactly the distinction the task brief's own
   *  encoding-choice note asks for.
   *
   *  INVARIANT (fix round, review LOW-4; reconfirmed at Task 3): `judged`
   *  and `onTarget` are MUTUALLY EXCLUSIVE — never both present, never
   *  both absent while the other side of the "was this row evaluated"
   *  question says otherwise. This holds ONLY because `rowJudgment`
   *  (below) is the SINGLE producer of both fields together, in one
   *  `return`, and no other code path in this file OR `storedSummary.ts`
   *  (from-the-log, Task 3 — reads a `StoredLogStep`, structurally
   *  compatible with `rowJudgment`'s own `Pick`-shaped input, and calls
   *  the SAME function rather than re-deriving the rule) sets either. It
   *  is a behavioral guarantee, not a type-level one — TypeScript's own
   *  structural typing does not forbid a caller from setting both, or
   *  neither, by hand. If any future work ever needs a SECOND producer of
   *  a `MeasuredRow` (a different door, a hand-built fixture assembled
   *  outside `rowJudgment`), that producer must go through `rowJudgment`
   *  too, or this pair belongs in a discriminated union instead (e.g.
   *  `{ state: "judged"; judgment: RowJudgment } | { state: "onTarget" }
   *  | { state: "unjudged" }`) so the compiler enforces the exclusion
   *  this comment currently only asserts in prose. */
  onTarget?: true;
}

/** A prescribed (unmeasured) row (§2E: index/distance-duration/target-pace/
 *  offset/`—`). See this module's header for why the offset fragment is
 *  not split out of `label`. */
export interface PrescribedRow {
  measured: false;
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
   *  row carries a measurement (R-E, verbatim: "appears only when NO row
   *  carries a measurement"). */
  caption?: string;
  /** PR #248's round-1 review recommended suppression ("My recommendation
   *  is to suppress the completion eyebrow"), implemented here, then
   *  Gate-0 approved (James: "Gold approved", 2026-08-31, on the rendered
   *  `log-monitor-dropped.png` / `log-monitor-dropped-landscape.png`
   *  captures at `9bd4ddac`). `PostWorkoutSummary`'s own `WORKOUT COMPLETE`
   *  eyebrow lies on an
   *  arrival that did not complete. Present-means-flag, same idiom as
   *  `MonitorRun.seriesDropped`/`MeasuredRow.onTarget` — absent (every
   *  timer/manual-door model, and every monitor model whose `run.endedBy`
   *  is `"finished"`, `"rower"`, `"program-failed"`, or absent) renders the
   *  eyebrow exactly as always. Set `true` ONLY by `buildMonitorModel`
   *  below, for the three arrival types scoped at the PM gate —
   *  `"program-dropped"`, `"link-lost"`, `"interrupted"` — never a
   *  drop-only fork. Derived here, from the SAME `run.endedBy` this
   *  function's own `meta.dateLabel` branch already reads, rather than
   *  threaded through as a second, caller-computed prop —
   *  `PostWorkoutSummary` has no channel to the underlying `MonitorRun`
   *  except this model. */
  suppressCompletionEyebrow?: true;
}

export type SummaryInput =
  | { door: "monitor"; run: MonitorRun }
  | { door: "timer"; run: SessionRun; steps: LogStep[] }
  | {
      door: "manual";
      steps: LogStep[];
      dateIso: string;
      /** Phase LM PR 1 Task 4 (lost-monitor design spec): the caller has
       *  proven this arrival came through the CONNECTED door and found no
       *  record at all — see `NO_MONITOR_READING_SOURCE` below for what it
       *  changes and `LogSession.tsx`'s `connectedArrivalWithNoRecord` for
       *  what "proven" means. Absent/false on every ordinary by-hand
       *  visit, which is why nothing else in this union changes shape. */
      connectedNoRecord?: boolean;
    };

/** §1's capped deviation-bar formula, exported standalone so its two clamp
 *  edges (1.2% floor, 50% cap) get a direct, non-integration test. Takes
 *  the SIGNED deviation in seconds (row pace − working average); only the
 *  magnitude drives the width. */
export function deviationBarWidthPercent(deviationSeconds: number): number {
  const raw = (Math.abs(deviationSeconds) / 1.6) * 50;
  return Math.min(50, Math.max(1.2, raw));
}

/** BASELINE-GENERIC in NAME (the "vs. a baseline split" framing in
 *  `RowJudgment`'s own doc comment above) — the deviation/direction/label
 *  math has no opinion about what "baseline" means. As of Task 3, the
 *  ONLY caller left is `rowJudgment` below, and only ONCE it has already
 *  ruled out the on-target band, feeding `target` as the second argument
 *  — never a working average any more. HISTORY: before Task 3,
 *  `storedSummary.ts` (from-the-log) called this directly against the
 *  STORED `avg_split_seconds` working average (the old §2E/§5C formula);
 *  that call site is gone (§4's re-baseline routes it through
 *  `rowJudgment` too), so `baselineSeconds` below is named for what it
 *  IS today (whatever split this row is judged against), not what it
 *  used to be.
 *
 *  MODULE-PRIVATE (review fix round, MINOR-2, 2026-08-18): grepped the
 *  whole `src`/`server` tree — `rowJudgment` below is the only caller
 *  anywhere, and no file imports `judge` by name from this module (not
 *  even this module's own test file, which exercises this function only
 *  indirectly through `rowJudgment`). Dropped the `export` rather than
 *  deleting the function outright: it is still genuinely used, just
 *  never from outside this file — a real, if narrow, distinction from
 *  dead code. */
function judge(rowSplitSeconds: number, baselineSeconds: number): RowJudgment {
  const deviationSeconds = rowSplitSeconds - baselineSeconds;
  // "+ = slower" (R-C/§1): a positive deviation means the row's own split
  // took MORE seconds per 500m than the baseline, i.e. slower. A
  // dead-even row (deviation exactly 0) reads as "slower" by this same
  // rule when called directly — there is no third "even" bucket in THIS
  // function's own two-color legend, "← FASTER (BLUE) · SLOWER (RED) →".
  // `rowJudgment` (this module's ONLY caller as of Task 3, live rows and
  // stored rows alike) never reaches this function with a dead-even (or
  // any within-band) deviation at all — it intercepts the on-target case
  // first via `judgeVsTarget`'s own band — so this dead-even rule is now
  // provably unreachable through EITHER renderer; it survives only as
  // this function's own defined behavior for a caller that reaches it
  // directly (no test in this codebase does, as of Task 3 — every test
  // of judged output goes through `rowJudgment`, which never triggers
  // this branch).
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

/** Phase LT spec 1, §1's re-baselined row judgment — THIS row's own
 *  target, never a working average; as of Task 3, `judge()` above has no
 *  caller left on the old working-average baseline at all —
 *  `storedSummary.ts` (from-the-log) reaches `judge()` through THIS
 *  function too, exactly like the two door builders below. Judged-when
 *  (antagonist B4, the member set NAMED — "assumed" actuals equal their
 *  targets by construction, `logDraft.ts:470`/`:552`, and judging them
 *  would paint the whole by-hand/held-target shape a tautological
 *  on-target or a "+0.0" — see this repo's own history: before this
 *  task, `judge()`'s unbanded dead-even rule would have read that
 *  tautology as "slower"):
 *   - `step.targetSplit` present (§1's own gate on the TARGET half too);
 *   - `step.actualSplit` present (no pace, nothing to compute a deviation
 *     from — the pairing-exception row's own reason `targetLabel` above
 *     still shows while this stays absent);
 *   - `step.actualSource` is `"pm5"` or `"stopwatch"` — never `"assumed"`.
 *
 *  None of this function's three callers can actually FEED it an
 *  `"assumed"`-sourced step today: `isMonitorRowMeasurable`/
 *  `timerMeasurableElapsedSeconds` (this module, below) and
 *  `measuredElapsedSeconds` (`storedSummary.ts`, Task 3's own
 *  generalization of the identical rule across both door fingerprints a
 *  stored step can carry) all gate MeasuredRow-ness on `"pm5"`/
 *  `"stopwatch"` before a step ever reaches here — an `"assumed"` step is
 *  always PRESCRIBED-shaped instead, on every door — so the third check
 *  above is currently unreachable-false via any caller. It is written
 *  explicitly anyway rather than relied on as an accident of unrelated
 *  gates lining up — `summaryModel.test.ts`'s own "by-hand fixture" test
 *  calls this function directly with a hand-built `actualSource:
 *  "assumed"` step to prove the guard holds on its own terms, and the
 *  self-mutation recorded in task-2-report.md (widening this check to
 *  also accept `"assumed"`) turns that one test red.
 *
 *  Within `ON_TARGET_BAND_SECONDS` (`judgeVsTarget`'s own band, shared
 *  with the connected surface): `onTarget: true`, `judged` absent — see
 *  `MeasuredRow`'s own doc comment for why a second field was chosen over
 *  widening `RowJudgment.direction`. Outside it: `judged` carries the
 *  `RowJudgment` (via `judge()`, fed `target` as its baseline — see that
 *  function's own doc comment for why this is sound). Neither field when
 *  unjudged. */
export function rowJudgment(step: {
  targetSplit?: number;
  actualSplit?: number;
  actualSource?: LogStep["actualSource"];
}): { judged?: RowJudgment; onTarget?: true } {
  if (
    step.targetSplit === undefined ||
    step.actualSplit === undefined ||
    (step.actualSource !== "pm5" && step.actualSource !== "stopwatch")
  ) {
    return {};
  }
  const verdict = judgeVsTarget(step.actualSplit, step.targetSplit);
  return verdict === "on-target"
    ? { onTarget: true }
    : { judged: judge(step.actualSplit, step.targetSplit) };
}

/** §2's compact SPM cell (`MeasuredRow.spmCell`'s own doc comment carries
 *  the shape/absence rules) — the ONE place the pre-/post-split
 *  discriminant (`spmIsMeasured`, `logDraft.ts`) resolves into a
 *  measured/target pair. Three shapes, in the order `spmIsMeasured`
 *  checks them:
 *   - PRE-SPLIT monitor row (`spmIsMeasured` true): `step.spm` holds the
 *     OLD measured value, never a target — rendered `{measured}`, no
 *     target half, ever (a pre-split row structurally cannot carry one).
 *   - POST-SPLIT (every other shape, both doors): `step.actualSpm`
 *     (monitor-only, absent on timer/manual doors — `LogStep.actualSpm`'s
 *     own doc comment) is the measured half, `step.spm` is the target
 *     half — independently absent, per §2's own "absent halves drop"
 *     rule.
 *   - Neither half present (an untargeted, unmeasured step on any door):
 *     no cell at all, `undefined` — matching this module's per-cell
 *     absence idiom everywhere else, never an empty `{}`.
 *
 *  THE FLOOR-ROW GUARD (final-review fix round, IMPORTANT finding):
 *  either half also reads as absent when it is `<= 0`, not merely
 *  `undefined` — spec §2's own promise ("existing stored zeros: rendered
 *  as absent, `> 0` read guard"), implemented HERE, the one place both
 *  renderers resolve this field (`logDraft.ts`'s `MONITOR_SPM_MIN`
 *  comment names this exact obligation and points here). A pre-split row
 *  saved under the old 0 floor (`actualSource: "pm5"`, no `actualSpm`,
 *  `spm: 0`) would otherwise read as `{measured: 0}` — a real "0" on
 *  screen, the wrong-number class this phase exists to kill. The same
 *  guard applies to the POST-split target half too: a zero authored rate
 *  is equally not a rate, even though a live monitor row can never
 *  produce a zero MEASURED half post-split (`buildMonitorLogSteps` only
 *  writes `actualSpm` when `avgSpm >= MONITOR_SPM_MIN`, i.e. `1` — the
 *  write floor already forbids it there).
 *
 *  EXPORTED for two reasons: (1) the PRE-SPLIT leg is, as of Task 1,
 *  unreachable through EITHER door builder below — `buildMonitorLogSteps`
 *  can no longer produce that shape at all (Task 1's §2 amendment made it
 *  sound by construction) and the timer/manual doors already gate
 *  MeasuredRow-ness on `actualSource === "stopwatch"`, which a pm5-shaped
 *  step always fails — so `summaryModel.test.ts` exercises that branch
 *  directly with a hand-built `LogStep`, the only route left to it; (2)
 *  `storedSummary.ts` (from-the-log) reads a STORED `LogStep[]` straight
 *  off the wire with no door-measurability gate in front of it at all, so
 *  a genuinely old stored pm5 row DOES reach this shape live — as of
 *  Task 3, that module imports this ONE function rather than re-deriving
 *  the same three-way rule against its own `StoredLogStep` (structurally
 *  compatible with the `Pick` this function's sibling `spmIsMeasured`
 *  already accepts). */
export function buildSpmCell(
  step: LogStep,
): { measured?: number; target?: number } | undefined {
  if (spmIsMeasured(step)) {
    return step.spm !== undefined && step.spm > 0
      ? { measured: step.spm }
      : undefined;
  }
  const measured =
    step.actualSpm !== undefined && step.actualSpm > 0
      ? step.actualSpm
      : undefined;
  const target = step.spm !== undefined && step.spm > 0 ? step.spm : undefined;
  if (measured === undefined && target === undefined) {
    return undefined;
  }
  return {
    ...(measured !== undefined ? { measured } : {}),
    ...(target !== undefined ? { target } : {}),
  };
}

/** A working average — the number the AVG SPLIT hero renders (ruling 4:
 *  "the AVG SPLIT hero stays the session average, neutral ink, unjudged").
 *  USED TO also carry `count` (PW review finding 5's lone-row gate: "a
 *  row's deviation against its own lone average is always exactly zero —
 *  judging it would paint an invented full-width bar for a comparison
 *  never really made against anything but itself") — Phase LT spec 1
 *  RETIRES that whole comparison (rows now judge against their OWN
 *  target via `rowJudgment` above, never this average), so `count` is
 *  gone: nothing reads it any more (the history note lives in
 *  `summaryModel.test.ts`'s rewritten lone-row test, per this task's own
 *  brief). */
interface WorkingAverage {
  seconds: number | undefined;
}

/** `500 × Σt/Σd`, absent when `Σd` is not `> 0` (R-C's own formula; the
 *  "no `0:00`, no `0 m`" per-cell absence rule extended to a division that
 *  would otherwise produce `NaN`/`Infinity`). */
function weightedAverage(
  rows: { seconds: number; meters: number }[],
): WorkingAverage {
  let t = 0;
  let d = 0;
  for (const r of rows) {
    t += r.seconds;
    d += r.meters;
  }
  return { seconds: d > 0 ? (500 * t) / d : undefined };
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
 * Applied uniformly across BOTH doors' rows and both AVG SPLIT
 * computations — the review's own citation (the timer door's own warm-up
 * row, since removed, and `timerWorkRows`) named only that door, where the
 * defect was found,
 * but the identical unguarded shape existed on the monitor door's own
 * `paceLabel`/`timeLabel` emission (gated only by `MONITOR_SPLIT_MAX`'s
 * upper band, never a lower one) — closed here too rather than left as a
 * known-analogous hole next to the one just fixed.
 */
export const MIN_MEASURABLE_ELAPSED_SECONDS = 1;

// ---------------------------------------------------------------------
// The measured-anything rule (Phase LM PR 1 Task 3)
// ---------------------------------------------------------------------
//
// "Did the monitor actually measure any of this?" is asked in three
// places that hold three DIFFERENT shapes: `monitorWorkRows` below has a
// `LogStep`, `targetsOnlyCaption` has already-built `SummaryRow`s, and the
// connected surface's lost banner has `IntervalActual[]` straight off the
// hook. So this is ONE RULE PLUS ONE ADAPTER PER CALLER, not one function
// called three times — the shapes cannot be unified without dragging the
// summary's whole row builder onto a live pane.
//
// WHY IT IS SHARED AT ALL, rather than two independent predicates that
// happen to agree today: the obvious banner predicate ("any actual at
// all") disagrees with this file's own caption on a SUB-SECOND reading,
// and a rower meets both screens minutes apart. The banner would say two
// intervals were kept; the summary for the same run would say TARGETS ONLY
// · NOTHING MEASURED. `summaryModel.test.ts`'s own
// "measured-anything rule" block checks the adapters against each other on
// one fixture rather than each against itself.

/** The two facts the rule turns on, extracted from whatever shape a caller
 *  holds. `fromMonitor` is provenance — a stopwatch reading of the same
 *  length is a rower's own timing, never a machine measurement — and
 *  `elapsedSeconds` is the reading's own elapsed time, `undefined` when it
 *  carries none. */
export interface MeasuredReading {
  fromMonitor: boolean;
  elapsedSeconds: number | undefined;
}

/** THE RULE. A reading counts only when the MONITOR produced it and it ran
 *  at least `MIN_MEASURABLE_ELAPSED_SECONDS` (see that constant for why a
 *  floor exists at all). */
export function isMeasuredReading(reading: MeasuredReading): boolean {
  return (
    reading.fromMonitor &&
    reading.elapsedSeconds !== undefined &&
    reading.elapsedSeconds >= MIN_MEASURABLE_ELAPSED_SECONDS
  );
}

/** Adapter: the summary/log row shape. `actualSource === "pm5"` is the
 *  provenance discriminant every monitor-door row already carries
 *  (`logDraft.ts`'s `buildMonitorLogSteps` writes it, and nothing else
 *  does). */
export function readingOfLogStep(step: LogStep): MeasuredReading {
  return {
    fromMonitor: step.actualSource === "pm5",
    elapsedSeconds: step.actualSeconds,
  };
}

/** Adapter: the live-surface shape. An `IntervalActual` exists only
 *  because the machine reported a boundary, so provenance is settled by
 *  construction — stated here rather than assumed, so the one axis that
 *  differs between the two callers is visible in both adapters.
 *  `elapsedSeconds` is copied verbatim into `LogStep.actualSeconds`
 *  downstream (`buildMonitorLogSteps`), which is what makes the two
 *  adapters answer identically for the same interval. */
export function readingOfIntervalActual(
  actual: IntervalActual,
): MeasuredReading {
  return { fromMonitor: true, elapsedSeconds: actual.elapsedSeconds };
}

/** How many of these readings the rule would keep. The connected
 *  surface's lost banner names this number ("2 intervals kept."), so it
 *  must be the number the summary screen will agree with minutes later. */
export function measuredIntervalCount(
  actuals: readonly IntervalActual[],
): number {
  return actuals.filter((a) => isMeasuredReading(readingOfIntervalActual(a)))
    .length;
}

// ---------------------------------------------------------------------
// Monitor door
// ---------------------------------------------------------------------

/** KEEP (Phase WU). A LEGACY warm-up interval's position in
 *  `run.program.intervals`, or -1 when this run has none — which post-WU is
 *  every run built by today's code, since `buildLogSeed` (`logDraft.ts`)
 *  can no longer write `kind: "warmup"`. It stays because `LogSeed` is
 *  PERSISTED: a `MonitorRun` stored before Phase WU still carries the
 *  value, and dropping this would silently fold that run's warm-up
 *  interval into its AVG SPLIT — moving a number on a record already shown
 *  to the rower. Also -1 when there is no `logSeed` at all (a v1
 *  `MonitorRun` predating the field, `MonitorRun.logSeed`'s own doc
 *  comment). Owed removal: ROADMAP Phase WU, at the first server-touching
 *  phase after two tags have shipped. */
function warmupIndex(run: MonitorRun): number {
  return run.logSeed?.steps.findIndex((s) => s.kind === "warmup") ?? -1;
}

/** THE FUSED TOTAL (work + rest distance), Σ(work + rest) over ALL
 *  actuals — the erg-checkable total (0x0037's own Interval Rest
 *  Distance). `restDistanceMeters` reads `?? 0` per that field's own
 *  documented contract: a `MonitorRun.actuals` entry persisted before the
 *  field existed loads back `undefined` at runtime despite the type saying
 *  `number` (`domain/monitor/types.ts`'s own comment on
 *  `IntervalActual.restDistanceMeters`). Absent (not `0`) when the sum is
 *  not `> 0` — no actuals at all, or a degenerate all-zero-distance run —
 *  per §2B's "no `0 m`" rule.
 *
 *  RC-5 (hero-truth design spec) §1: this is R-B's ORIGINAL formula, and
 *  it used to BE the DISTANCE hero for every monitor row. It no longer is
 *  — `tierBWorkDistanceMeters` below is the tier B hero now (work only).
 *  **Fix round 1 (I3):** this function survives for exactly ONE caller
 *  now — a LEGACY wu-carrying run's own DISTANCE hero, which must not
 *  move under a record already shown to the rower (§1's warm-up ruling,
 *  `isLegacyWarmupRun`). It is deliberately NOT used to derive the TOTAL
 *  line's rest clause any more — that subtraction (`fused - Σwork`) was
 *  identical to `Σ(restDistanceMeters ?? 0)`, the exact partial-sum shape
 *  `monitorRun.ts:738-750` forbids by name; `monitorRest` below derives
 *  from the actuals directly instead, gated on every actual actually
 *  carrying the field. */
function monitorDistanceMeters(run: MonitorRun): number | undefined {
  let total = 0;
  for (const actual of run.actuals) {
    total += actual.distanceMeters + (actual.restDistanceMeters ?? 0);
  }
  return total > 0 ? Math.round(total) : undefined;
}

/** THE FUSED TOTAL (work + programmed rest for completed intervals) —
 *  `monitorRun.ts`'s `measuredSessionSeconds` (review
 *  finding 3: this used to be a byte-for-byte duplicate of that module's
 *  `interruptedTotalSeconds`, a formula with its own OPEN hardware finding
 *  — F-1, the walk sheet's unreproduced "6 MIN where the wire computes 5"
 *  reading. Importing the shared function means F-1's eventual fix lands
 *  in both callers at once, not just the one this duplicate happened to
 *  live next to). Generalized here to every monitor run per R-D's own text
 *  ("James's recorded rule, generalized from the interrupted branch") —
 *  this call site is not itself about an interrupted run, which is why it
 *  reaches for the neutral name rather than the original. Absent when the
 *  sum is not `> 0` (no `0:00`).
 *
 *  RC-5 §1: this is R-D's ORIGINAL formula, and it used to BE the TIME
 *  hero. **Fix round 1 (I2):** it is NOT the TOTAL line's own wall-clock
 *  number any more either — I2's own finding was that feeding the TOTAL
 *  line's seconds through THIS function (programmed rest) while its
 *  metres derived from the WIRE's measured rest put two different rest
 *  populations under one line (`monitorRun.ts:718-733` names exactly when
 *  they diverge). `buildMonitorTotalLine` above builds the total from
 *  this row's own work seconds plus `monitorRest`'s measured figure
 *  instead. This function survives for exactly ONE caller now, like
 *  `monitorDistanceMeters` above: a LEGACY wu-carrying run's own (unmoved)
 *  TIME hero. */
function monitorTimeSeconds(run: MonitorRun): number | undefined {
  const total = measuredSessionSeconds(run);
  return total > 0 ? total : undefined;
}

/** RC-5 §1: a legacy (pre-Phase-WU) stored run — `warmupIndex(run) !== -1`
 *  — whose DISTANCE/TIME must not move under a record already shown to
 *  the rower (`warmupIndex`'s own KEEP comment). Every run this app can
 *  build today fails this check (`warmupIndex` returns -1), so it only
 *  ever fires for a genuinely old `MonitorRun` still sitting unlogged. */
function isLegacyWarmupRun(run: MonitorRun): boolean {
  return warmupIndex(run) !== -1;
}

/** RC-5 §1: tier B's DISTANCE, WORK ONLY — Σ `actual.distanceMeters` over
 *  EVERY actual, no rest term. No wu exclusion here (a legacy wu run
 *  never reaches this function — `isLegacyWarmupRun` routes it to
 *  `monitorDistanceMeters` above instead) and no null-index/sub-threshold
 *  exclusion either: §1's corrected exclusions keep those readings IN
 *  DISTANCE/TIME (the meters genuinely happened; only AVG SPLIT judges
 *  them, via `monitorAvgSplit` below, unchanged). Absent when the sum is
 *  not `> 0`. */
function tierBWorkDistanceMeters(run: MonitorRun): number | undefined {
  let total = 0;
  for (const actual of run.actuals) total += actual.distanceMeters;
  return total > 0 ? Math.round(total) : undefined;
}

/** RC-5 §1: tier B's TIME, WORK ONLY — Σ `actual.elapsedSeconds` over
 *  EVERY actual, no programmed-rest term. Same exclusion rules (none) as
 *  `tierBWorkDistanceMeters` above, for the identical reason. Not rounded
 *  (matching `monitorTimeSeconds`'s own convention — every committed
 *  wire reading is a whole number in practice; `MachineSummaryDetail`'s
 *  own tier A sibling can be fractional too, e.g. 24.3). Absent when the
 *  sum is not `> 0`. */
function tierBWorkTimeSeconds(run: MonitorRun): number | undefined {
  let total = 0;
  for (const actual of run.actuals) total += actual.elapsedSeconds;
  return total > 0 ? total : undefined;
}

/** RC-5 §2, CORRECTED at fix round 1 (I2/I3 — the pass proved the original
 *  cut mixed two rest populations under one line, and its metres-only
 *  derivation recreated the exact partial-sum shape `monitorRun.ts:738-750`
 *  forbids by name). Resolves rest SECONDS and rest METRES TOGETHER, as
 *  ONE pair, through ONE priority ladder — never seconds through R-D's
 *  programmed-rest formula while metres derives from the wire (I2's own
 *  finding: "two different rest populations under one line").
 *
 *   1. RC-1's stored `run.restSeconds`/`run.restMeters` — written together
 *      or not at all (`monitorRun.ts`'s own `computeWorkRestSums`:
 *      "restSeconds"/"restMeters are NOT unconditional ... the rest PAIR
 *      is all-or-nothing"). Checking one is checking both by that same
 *      writer's own contract; this function checks both anyway, defensively.
 *   2. Otherwise DERIVED from the actuals — summed ONLY when EVERY actual
 *      in `run.actuals` carries BOTH `restSeconds` AND `restDistanceMeters`
 *      (I3's fix). This is deliberately NOT "distance-minus-work" any
 *      more: that subtraction was identical to `Σ (restDistanceMeters ??
 *      0)` — the exact partial sum the design spec forbids, since it
 *      silently reads a genuinely-missing reading as a real zero. A run
 *      with even one actual missing either field (the synthesized-final
 *      fallback's own documented gap, `IntervalActual.restSeconds`'s own
 *      doc comment; a real shape on this app's committed e2e fixtures)
 *      derives NOTHING, on purpose.
 *   3. Neither field resolves: the TOTAL line renders with no rest clause,
 *      and (RC-5 §2) its own total-seconds figure is then just this row's
 *      work seconds alone — an honest "we don't know the rest" reading,
 *      never a fabricated one. */
function monitorRest(run: MonitorRun): { seconds?: number; meters?: number } {
  if (run.restSeconds !== undefined && run.restMeters !== undefined) {
    return { seconds: run.restSeconds, meters: run.restMeters };
  }
  const complete =
    run.actuals.length > 0 &&
    run.actuals.every(
      (a) => a.restSeconds !== undefined && a.restDistanceMeters !== undefined,
    );
  if (!complete) return {};
  let seconds = 0;
  let meters = 0;
  for (const actual of run.actuals) {
    // `?? 0` is defense-in-depth, not a reachable branch: `complete` above
    // already proved every actual's `restSeconds`/`restDistanceMeters` is
    // defined, so the fallback can never fire here — the same documented,
    // deliberately-uncovered shape `monitorRun.ts`'s own
    // `computeWorkRestSums` keeps for the identical reason.
    seconds += actual.restSeconds ?? 0;
    meters += actual.restDistanceMeters ?? 0;
  }
  return { seconds, meters };
}

/** RC-5 §2: the TOTAL line's own total-seconds figure — this row's own
 *  WORK seconds (`workSeconds`, whatever the caller's tier already
 *  computed as the TIME hero's own number — machine-verbatim on tier A,
 *  work-only Σ on tier B) plus `monitorRest`'s resolved rest seconds, when
 *  resolvable. Absent when `workSeconds` itself is absent (nothing to
 *  build a total from at all). */
function buildMonitorTotalLine(
  run: MonitorRun,
  workSeconds: number | undefined,
): string | undefined {
  const rest = monitorRest(run);
  const totalSeconds =
    workSeconds !== undefined ? workSeconds + (rest.seconds ?? 0) : undefined;
  return buildTotalLine(totalSeconds, rest.meters);
}

/** RC-5 §2's TOTAL line — ONE formatter, exported so Task 3's stored-row
 *  screen renders the identical string rather than a second hand-rolled
 *  copy (the design spec's own "built in one place, not twice"
 *  requirement). Takes the already-RESOLVED pair — `totalSeconds` (the
 *  wall-clock total, work + rest, however the caller's own door/tier
 *  computed it) and `restMeters` (already resolved through §2's own
 *  priority order, e.g. `monitorRest` above) — this function does
 *  no sourcing of its own, only formatting. House style: middle dot,
 *  "coasting" never "during" (the rower's own correction, design review
 *  2026-08-25), no em-dash. Absent entirely when there's no total to show
 *  at all (never a `0:00 total`); the rest clause independently drops
 *  whenever `restMeters` is absent or not `> 0` — a genuine no-rest run
 *  renders the total alone, never a `0 m` that implies a measurement
 *  neither side actually has. */
export function buildTotalLine(
  totalSeconds: number | undefined,
  restMeters: number | undefined,
): string | undefined {
  if (totalSeconds === undefined || totalSeconds <= 0) return undefined;
  const total = `${fmtDuration(totalSeconds / 60)} total`;
  return restMeters !== undefined && restMeters > 0
    ? `${total} · plus ${Math.round(restMeters)} m coasting in rest`
    : total;
}

/** R-C: AVG SPLIT = `500 × Σt/Σd` over measured WORK rows. Post-Phase-WU
 *  every interval of a freshly-built run is work, so the `wuIndex`
 *  exclusion below fires only for a LEGACY stored run (see `warmupIndex`).
 *  Two further exclusions (review finding 1/2, neither present in the
 *  original cut):
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
 *  Feeds ONLY the AVG SPLIT hero now (ruling 4 — `WorkingAverage`'s own
 *  doc comment carries the history of what else used to read it). */
function monitorAvgSplit(run: MonitorRun): WorkingAverage {
  const wuIndex = warmupIndex(run);
  const rows: { seconds: number; meters: number }[] = [];
  for (const actual of run.actuals) {
    if (actual.index === null) continue;
    // KEEP (Phase WU) — legacy-only. `warmupIndex` returns -1 for every run
    // built by today's code, so this skips nothing; it still fires for a
    // `MonitorRun` persisted before Phase WU, whose AVG SPLIT must not move.
    if (actual.index === wuIndex) continue;
    if (actual.elapsedSeconds < MIN_MEASURABLE_ELAPSED_SECONDS) continue;
    rows.push({
      seconds: actual.elapsedSeconds,
      meters: actual.distanceMeters,
    });
  }
  return weightedAverage(rows);
}

/** RC-5 §1: TIER A when the row carries the machine's own work totals —
 *  `run.summaryTotals` (RC-3, `MachineSummaryDetail`'s sibling field:
 *  written together as a pair by `appendSummaryObservations`, never one
 *  without the other — `MonitorRun.summaryTotals`'s own type,
 *  `{ workElapsedSeconds: number; workDistanceMeters: number }`, has no
 *  optional half). DISTANCE/TIME render `summaryTotals` VERBATIM, and AVG
 *  SPLIT renders the machine's OWN `avgPaceSecondsPer500m`
 *  (`run.summaryDetail`, Task 1) — NEVER a quotient of ours (Global
 *  Constraints: the PM5 truncates, we round). `summaryDetail` can be
 *  absent even when `summaryTotals` is present (a build-738-era record,
 *  `LogSession.tsx`'s own comment) — AVG SPLIT is simply absent then,
 *  never a fallback quotient. **Fix round 1, I4:** `avgSplit` ALSO gates
 *  on the machine's own totals being real (`> 0`) — a burst that arrived
 *  with nothing measured (`summaryTotals` both zero, the "0 OF N
 *  INTERVALS MEASURED" hardware shape) must not render a lone AVG SPLIT
 *  off `summaryDetail` alone: a row with no work at all has no average to
 *  report, whatever `summaryDetail` happens to carry.
 *
 *  TIER B (everything else): the SAME three quantities, computed from
 *  this row's own actuals — DISTANCE/TIME work-only
 *  (`tierBWorkDistanceMeters`/`tierBWorkTimeSeconds`) UNLESS this is a
 *  legacy wu-carrying run (`isLegacyWarmupRun`), which keeps the OLD
 *  fused numbers unchanged (§1's warm-up ruling: "moving a number on a
 *  record already shown to the rower"). AVG SPLIT is `monitorAvgSplit`,
 *  UNCHANGED by this task either way — it was already work-only,
 *  excluding wu/null-index/sub-threshold readings, before RC-5.
 *
 *  The TOTAL line (§2): this row's own TIME hero seconds plus
 *  `monitorRest`'s resolved rest (`buildMonitorTotalLine` above) — on
 *  EITHER tier. **Fix round 1, I6:** a LEGACY wu-carrying run gets NO
 *  total line at all — its DISTANCE/TIME heroes already ARE the fused
 *  (work+rest) numbers (the carve-out immediately above), so a total line
 *  restating the identical figure with a rest clause on top would double
 *  the rest that hero already counts once. Only tier A and non-legacy
 *  tier B rows — the two shapes whose heroes are genuinely work-only —
 *  get a total line at all. */
function monitorHeroes(run: MonitorRun): SummaryHeroes {
  if (run.summaryTotals !== undefined) {
    const distanceMeters = Math.round(run.summaryTotals.workDistanceMeters);
    const timeSecondsRaw = run.summaryTotals.workElapsedSeconds;
    const hasTotals = distanceMeters > 0 && timeSecondsRaw > 0;
    const avgSplitSeconds = run.summaryDetail?.avgPaceSecondsPer500m;
    const hasAvgSplit =
      hasTotals && avgSplitSeconds !== undefined && avgSplitSeconds > 0;
    const timeSeconds = timeSecondsRaw > 0 ? timeSecondsRaw : undefined;
    return {
      distanceMeters: distanceMeters > 0 ? distanceMeters : undefined,
      time:
        timeSeconds !== undefined ? fmtDuration(timeSeconds / 60) : undefined,
      timeSeconds,
      avgSplit: hasAvgSplit ? fmtSplit(avgSplitSeconds) : undefined,
      avgSplitSeconds: hasAvgSplit ? avgSplitSeconds : undefined,
      totalLine: buildMonitorTotalLine(run, timeSeconds),
    };
  }
  const avgSplit = monitorAvgSplit(run);
  const legacy = isLegacyWarmupRun(run);
  const distanceMeters = legacy
    ? monitorDistanceMeters(run)
    : tierBWorkDistanceMeters(run);
  const timeSeconds = legacy
    ? monitorTimeSeconds(run)
    : tierBWorkTimeSeconds(run);
  return {
    avgSplit:
      avgSplit.seconds !== undefined ? fmtSplit(avgSplit.seconds) : undefined,
    avgSplitSeconds: avgSplit.seconds,
    time: timeSeconds !== undefined ? fmtDuration(timeSeconds / 60) : undefined,
    timeSeconds,
    distanceMeters,
    totalLine: legacy ? undefined : buildMonitorTotalLine(run, timeSeconds),
  };
}

/** Review finding 1: a `pm5`-sourced row whose own elapsed reading is
 *  below `MIN_MEASURABLE_ELAPSED_SECONDS` renders in its PRESCRIBED shape
 *  (§2E's unmeasured-row geometry) — not a measured row with blank
 *  cells — and is excluded from `monitorAvgSplitSeconds`'s average by
 *  that same function's own floor check, so the row list and the hero
 *  agree on which readings count.
 *
 *  THE RULE ITSELF MOVED OUT (Phase LM PR 1 Task 3): this is now the
 *  shared `isMeasuredReading` plus this door's own adapter, so the
 *  connected surface's lost banner counts intervals by the same rule this
 *  screen will judge them by. The logic is unchanged, byte for byte — see
 *  the "measured-anything rule" section above for why it is shared. */
function isMonitorRowMeasurable(step: LogStep): boolean {
  return isMeasuredReading(readingOfLogStep(step));
}

function monitorWorkRows(run: MonitorRun): SummaryRow[] {
  const steps = buildMonitorLogSteps(run);
  return steps.map((step, i) => {
    const index = i + 1;
    if (!isMonitorRowMeasurable(step)) {
      return {
        measured: false,
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
    const targetLabel =
      step.targetSplit !== undefined ? fmtSplit(step.targetSplit) : undefined;
    return {
      measured: true,
      index,
      label: step.label,
      timeLabel,
      paceLabel,
      targetLabel,
      spmCell: buildSpmCell(step),
      ...rowJudgment(step),
    };
  });
}

function buildMonitorModel(run: MonitorRun): SummaryModel {
  const heroes = monitorHeroes(run);
  const rows = monitorWorkRows(run);

  const iso =
    run.endedBy === "interrupted"
      ? run.startedAt
      : (run.completedAt ?? run.startedAt);
  const meta: SummaryMeta = {
    dateLabel: formatLogDate(iso),
    timeLabel: formatTimeOfDay(iso),
    sourceLabel: run.deviceName,
  };

  // PR #248's round-1 review recommendation, implemented and Gate-0
  // approved (`SummaryModel.suppressCompletionEyebrow`'s own doc comment):
  // the three arrival types that did not complete, never a drop-only fork.
  const suppressCompletionEyebrow =
    run.endedBy === "program-dropped" ||
    run.endedBy === "link-lost" ||
    run.endedBy === "interrupted";

  return {
    meta,
    heroes,
    rows,
    caption: targetsOnlyCaption(rows),
    ...(suppressCompletionEyebrow ? { suppressCompletionEyebrow: true } : {}),
  };
}

// ---------------------------------------------------------------------
// Timer door
// ---------------------------------------------------------------------

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
 *  straight off the step. Feeds ONLY the AVG SPLIT hero now (`WorkingAverage`'s
 *  own doc comment carries the history of what else used to read it). */
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

function timerWorkRows(steps: LogStep[]): SummaryRow[] {
  return steps.map((step, i) => {
    const index = i + 1;
    const elapsedSeconds = timerMeasurableElapsedSeconds(step);
    if (elapsedSeconds === undefined) {
      return {
        measured: false,
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
    const targetLabel =
      step.targetSplit !== undefined ? fmtSplit(step.targetSplit) : undefined;
    return {
      measured: true,
      index,
      label: step.label,
      timeLabel: fmtDuration(elapsedSeconds / 60),
      paceLabel: fmtSplit(step.actualSplit!),
      targetLabel,
      spmCell: buildSpmCell(step),
      ...rowJudgment(step),
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
  const rows = timerWorkRows(steps);

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

/** Phase LM PR 1 Task 4: the fourth answer this screen's SOURCE slot can
 *  give, beside `PM5 <name>` / `TIMER` / `LOGGED BY HAND`. That slot
 *  answers ONE question — where did these numbers come from — and for a
 *  connected arrival with no record the honest answer is that there is no
 *  reading behind them. It is NOT a close reason and must never become
 *  one: `endedBy` answers how a session closed, and the two agree only on
 *  the zero-measured case (spec's own line, and `storedSummary.ts`'s
 *  `LINK_LOST_LINE` is where a close reason renders).
 *
 *  WHAT IT DOES NOT SAY: why. Three producers of the silence are
 *  undistinguished, so this names only what we can see from here — that we
 *  hold no reading. The connected surface's own lost banner says
 *  "Nothing kept." for the same session minutes earlier; the two are
 *  deliberately the same register (short, no cause, no blame) without
 *  sharing a string, because they answer different questions on different
 *  screens.
 *
 *  RETIRED DIVERGENCE (Task 4 option 2 named it; Door PR A, 2026-09-02,
 *  §2.1 closes it): the STORED row for this same session used to read
 *  `LOGGED BY HAND` regardless, because `storedSummary.ts`'s `sourceLabel`
 *  had only three columns to infer from and nothing the manual door posted
 *  distinguished this case from a genuine by-hand entry. `session_logs`
 *  now carries a fourth `source` member, `no-reading`, and the manual
 *  door's `handleSave` posts it for exactly this arrival
 *  (`LogSession.tsx`) — the stored row reads this SAME word from that
 *  column now. A row saved BEFORE this PR shipped still reads `LOGGED BY
 *  HAND` (no backfill — spec §2.4); only a row saved after it is honest. */
export const NO_MONITOR_READING_SOURCE = "NO MONITOR READING";

function buildManualModel(
  steps: LogStep[],
  dateIso: string,
  connectedNoRecord: boolean,
): SummaryModel {
  // `buildManualLogSteps` never sets `actualSource: "stopwatch"` — its own
  // doc comment: "ALL split-ref actuals are 'assumed'" — so a manual
  // door's rows are always prescribed-shaped and its caption always fires.
  const rows: SummaryRow[] = steps.map((step, i) => ({
    measured: false,
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

  // Task 4: the SOURCE slot only. `timeLabel` stays absent either way —
  // §2B's own date-only fallback for a door with no wall-clock moment of
  // its own. This is now an ACCEPTED DIVERGENCE from the stored screen,
  // not a mirrored gate: the STORED no-reading row carries a `timeLabel`
  // by Gate 0-A decision (c) — the app witnessed the connected arrival
  // even though it measured nothing — but this LIVE screen keeps none.
  // Whether the live screen should gain one too is out of Door PR A's
  // scope (`storedSummary.ts`'s `buildMeta`, §2.3, is where the stored
  // side's own allowlist lives).
  const meta: SummaryMeta = {
    dateLabel: formatLogDate(dateIso),
    sourceLabel: connectedNoRecord
      ? NO_MONITOR_READING_SOURCE
      : "LOGGED BY HAND",
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
 *  row carries a measurement" — every row. Final-review FIX-2:
 *  `measured: true` alone is not a real reading, since a measured-shaped
 *  row can carry no `timeLabel`/`paceLabel` at all; gate on an actual
 *  label, not the discriminant alone. */
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
      return buildManualModel(
        input.steps,
        input.dateIso,
        input.connectedNoRecord === true,
      );
  }
}
