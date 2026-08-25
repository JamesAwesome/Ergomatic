// buildStoredSummary — Phase PW spec 2 (from-the-log), Task 5: the pure
// view-model behind the from-the-log screen (design spec
// docs/superpowers/specs/2026-08-18-from-the-log-design.md §5 — this
// module implements that property table row by row, cited inline below).
// Reads a STORED `session_logs` row (`GET /api/logs/:id`'s own response
// shape, typed here as `StoredLog` per this repo's own convention of
// client hooks typing their own view of a server response rather than
// importing the server's row type — `useRecentLogs.ts`'s own comment)
// and derives exactly what `PostWorkoutSummary`'s extracted presentational
// pieces (`SummaryMetaBlock`/`SummaryHeroesBlock`/`SummaryIntervalsBlock`)
// need to re-render it, plus the read-back/plan-footer text this screen
// alone needs. Nothing here touches the DOM, a clock, or storage — pure
// and directly testable, same shape as `summaryModel.ts` itself.
//
// WHY THIS ISN'T JUST `buildSummaryModel` AGAIN: that module's three door
// builders each know which door produced the run (monitor/timer/manual)
// and read fresh actuals straight off a live `MonitorRun`/`SessionRun`. A
// stored row carries none of that: only `steps` (the persisted
// `LogStep[]`) and the three already-computed hero numbers — so this
// module does not call `buildSummaryModel` at all, it re-derives the
// row/hero shapes directly from the stored columns, reusing the same
// presentation-formula pieces `summaryModel.ts` exports for exactly this
// reuse (`targetsOnlyCaption`, `formatTimeOfDay`,
// `MIN_MEASURABLE_ELAPSED_SECONDS`).
//
// Phase LT spec 1, §4 (2026-08-18): row judgment is RE-BASELINED here too,
// to the exact same §1 rule the live summary uses — each row judges
// against ITS OWN stored `targetSplit`, via the identical imported
// `rowJudgment`/`buildSpmCell` (Task 2) rather than a second, hand-rolled
// copy of either rule. HISTORY: before this task, §5C judged every row
// against the STORED `avg_split_seconds` working average ("never
// re-averaged") — that whole baseline is gone from row judgment; the
// stored `avg_split_seconds` hero itself is UNTOUCHED (still the session
// average, still what `buildHeroes` below renders, ruling 4 — only the
// per-row comparison changed).
//
// SOURCE INFERENCE (§5A, antagonist B7): a stored row has no explicit
// "which door" column — `deviceName` names a monitor row, and a stopwatch-
// sourced step is the timer door's own fingerprint (`buildLogSteps` is the
// ONLY producer of `actualSource: "stopwatch"`); a row with neither is
// door-ambiguous only in the sense that it's exactly the "assumed
// everything" shape both the manual door and a not-actually-timed timer
// session produce. James's copy ruling (fix round, 2026-08-18): the third
// bucket reads `LOGGED BY HAND` — matching spec 1's live manual door
// (`summaryModel.ts`'s `buildManualModel`) and the handoff, not §5A's own
// shorter table literal — so the identical fact never reads as two
// different words depending on whether a rower is looking at a session
// live or from the log.

import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import { PLANS } from "../../domain/plans.js";
import type { WorkoutType } from "../../domain/types.js";
import type { HeldResult, Thumbs } from "../api/useRecentLogs";
import type { CloseReason } from "../monitor/monitorRun";
import type { SeriesData } from "../monitor/seriesRecorder.js";
import { formatLogDate } from "../session/logDraft";
import {
  buildSpmCell,
  buildTotalLine,
  formatTimeOfDay,
  MIN_MEASURABLE_ELAPSED_SECONDS,
  rowJudgment,
  targetsOnlyCaption,
  type SummaryHeroes,
  type SummaryMeta,
  type SummaryRow,
} from "../session/summaryModel";

// Re-typed rather than imported from `server/stores/logs.ts` (this
// repo's standing rule: client code never imports server/'s module
// graph — `useRecentLogs.ts`'s own comment). Kept a structural mirror of
// `LogStep` there; the union member names/shape must stay in lockstep by
// hand, same as `HeldResult`/`Thumbs` already are across three files
// (`PostWorkoutSummary.tsx`'s own comment names them).
export interface StoredLogStep {
  label: string;
  targetSplit?: number;
  actualSplit?: number;
  actualSource?: "assumed" | "stopwatch" | "pm5";
  spm?: number;
  meters?: number;
  seconds?: number;
  avgHr?: number;
  actualSeconds?: number;
  actualMeters?: number;
  // Phase LT spec 1 (2026-08-18), §2, MEDIUM-1 (Task 1 review): the
  // lockstep line this interface's own header comment demands —
  // `session/logDraft.ts`'s `LogStep` gained this field the same task
  // (the monitor door's MEASURED average, `spm` above reverting to the
  // AUTHORED target on every door). Without it here, `spmIsMeasured`
  // (`session/logDraft.ts`, structurally compatible with this type) would
  // read `actualSpm` as always-absent on every stored row this module
  // hands it, so EVERY stored pm5 row would misread as "predates the
  // split" forever, regardless of when it was actually saved.
  actualSpm?: number;
}

/** `GET /api/logs/:id`'s full row (spec §3) — the from-the-log view's own
 *  fetch. `planKey` is a bare `string | null`, not `PlanKey`:
 *  the `session_logs.plan_key` column carries no CHECK/enum constraint
 *  (unlike `plan_state.plan_key` — `server/db/schema.ts`'s own comment),
 *  deliberately, so a row saved under a plan this app's CURRENT `PLANS`
 *  table no longer defines still reads back its original key rather than
 *  failing a type the stored value can no longer satisfy (§5E's "unknown
 *  key renders verbatim" rule, `buildPlanFooter` below). */
export interface StoredLog {
  id: string;
  workoutId: string | null;
  workoutTitle: string;
  workoutType: WorkoutType;
  loggedAt: string;
  held: HeldResult | null;
  pain: number | null;
  notes: string | null;
  thumbs: Thumbs | null;
  deviceName: string | null;
  steps: StoredLogStep[];
  avgSplitSeconds: number | null;
  timeSeconds: number | null;
  distanceMeters: number | null;
  planKey: string | null;
  planIndex: number | null;
  // Trace-rendering spec (Phase LT spec 3), §1: the stored door's own
  // source — `server/stores/logs.ts`'s `LogSeries` column, re-typed
  // against the CLIENT's own `SeriesData` shape rather than a second
  // hand-mirrored copy (unlike `StoredLogStep` above, which mirrors the
  // server's `LogStep` because that type has no client-side twin —
  // `SeriesData` already does, and the two are structurally identical:
  // `t`/`d`/`p`/`spm`/`hr?`, spec 2's own C2-logbook shape on both sides
  // of the wire). `null` (not just absent) is the real, common case: any
  // row logged before spec 2 shipped, or one whose series was sacrificed
  // at either storage boundary — `TraceChart` (Task 2) treats an absent
  // OR `null` series identically (nothing to draw), so this screen never
  // has to tell the two apart itself.
  series?: SeriesData | null;
  // Cohort-unlock spec (2026-08-23), §2: the honest close reason the
  // route already returns — `server/stores/logs.ts`'s `get()`/`list()`
  // have selected this column since Phase LL Task 4 (`endedBy.
  // integration.test.ts` already pins the GET round-trip); this task is
  // the first to actually READ it client-side. Mirrors `MonitorRun.
  // endedBy`'s own widened union (`CloseReason | "interrupted"`) rather
  // than a third hand-copied literal union — see that field's doc
  // comment for the five values. Optional AND nullable, same convention
  // as `deviceName`/`thumbs` above: explicit null is the common case (a
  // phone-timer/manual log, or any row predating Phase LL Task 4);
  // absent covers a response that never included the key at all (this
  // repo's own defensive posture for every optional field here, even
  // though `stores.logs.get()` always selects the column now).
  endedBy?: (CloseReason | "interrupted") | null;
  // RC-2/RC-3 wave design spec (docs/superpowers/specs/2026-08-24-summary-
  // record-design.md §3): the machine's own end-of-workout totals, PR
  // #190's server columns (`server/stores/logs.ts`'s `LOG_LIST_COLUMNS` /
  // `get()` — both selected on every GET, `machineWorkSeconds`/
  // `machineWorkMeters` doubles/integer, `machineSummary` untyped jsonb).
  // Type only, matching the GET shape exactly: required-and-nullable, same
  // convention as `avgSplitSeconds`/`timeSeconds`/`distanceMeters` above
  // (never optional — the column is always selected, so "absent" isn't a
  // shape this row can actually carry). `machineSummary` is narrowed to
  // the ONE key this wave's display reads (§3: "the display reads only
  // the two machine totals + the verification bytes" — the other nine
  // decoded fields are stored but have no display surface yet); the
  // server's own type keeps it a bare `Record<string, unknown> | null`
  // (`server/stores/logs.ts`'s own comment: "stored VERBATIM once
  // validated"), so this narrower client type is a deliberate view, not a
  // structural mirror like `StoredLogStep` above.
  machineWorkSeconds: number | null;
  machineWorkMeters: number | null;
  // RC-5 (hero-truth design spec) §1, Task 1: the machine's own average
  // split, added to `machineSummary`'s narrowed client view alongside the
  // existing `verificationBytes` key — the SAME additive-jsonb-key
  // convention (`server/stores/logs.ts`'s own comment: "stored VERBATIM
  // once validated"), no new column, no migration. Optional: absent on
  // any row saved before Task 1 shipped, including a build-738-era row
  // that already carries `machineWorkSeconds`/`machineWorkMeters` but
  // predates this key entirely — `buildHeroes` below renders NO avg
  // split hero for that shape, on purpose (never a fallback quotient,
  // Global Constraints: the PM5 truncates, we round).
  machineSummary: {
    verificationBytes?: number[];
    avgPaceSecondsPer500m?: number;
  } | null;
  // RC-1 (storage-spine design spec §3, TRIAD): the session's rest pair,
  // required-and-nullable — same convention as `machineWorkSeconds` above
  // (the column is always selected on GET, so "absent" isn't a shape this
  // row can carry; `null` is the real, common case for any row predating
  // RC-1, or a phone-timer/manual save, or a monitor close that isn't a
  // natural "finished" finish — `server/stores/logs.ts`'s own
  // `LogInput.restSeconds`/`restMeters` comment). Task 3's ONLY rest
  // source for the TOTAL line's own §2 derivation — see `buildStoredRest`
  // below for why there is no third, per-actual fallback rung here the
  // way the live door has (`StoredLogStep` carries no per-step rest
  // field at all).
  restSeconds: number | null;
  restMeters: number | null;
  // RC-1 (storage-spine design spec §3, TRIAD): the session's WORK pair —
  // `computeWorkRestSums` (`monitorRun.ts`) writes it for the SAME
  // `"finished"`-close population `restSeconds`/`restMeters` above are
  // written for, as an UNCONDITIONAL sum over every actual
  // (`actuals.reduce((sum, a) => sum + a.elapsedSeconds, 0)`, no
  // index/sub-threshold filter) — the identical population
  // `summaryModel.ts`'s `tierBWorkDistanceMeters`/`tierBWorkTimeSeconds`
  // sum on the live door. Fix round 1 (Task 3 review, IMPORTANT): THIS is
  // the sound signal `buildHeroes` below now PREFERS over recomputing
  // from `Σ steps` — see that function's own tier-B comment for why Σ
  // steps alone can under-count (a null-index actual, or a legacy
  // warm-up interval, never becomes a step at all) while this pair
  // cannot, because it is summed directly off `run.actuals`, never off
  // `steps`/`logSeed`. Required-and-nullable, same convention as
  // `restSeconds`/`restMeters` above.
  workSeconds: number | null;
  workMeters: number | null;
}

/** §5D: the read-back's own three pieces. `empty` is the "all four null"
 *  gate (thumbs/held/pain/notes) — when true, neither `segmentLine` nor
 *  `note` is ever set, and the screen renders the Edit affordance's
 *  `Add how it felt` empty-state copy instead of this block at all.
 *  `segmentLine` is present only when at least one of thumbs/held/pain is
 *  non-null (a notes-only log has `note` set with `segmentLine`
 *  undefined — no empty segment line renders above the note). */
export interface StoredReadBack {
  empty: boolean;
  segmentLine?: string;
  note?: string;
}

export interface StoredSummaryView {
  meta: SummaryMeta;
  heroes: SummaryHeroes;
  rows: SummaryRow[];
  caption?: string;
  readBack: StoredReadBack;
  /** §5E: `Logged to <title> · SESSION <plan_index+1> OF <sequence
   *  length>`, present only when linkage is stored (both `planKey`/
   *  `planIndex` non-null — `create()`'s own invariant, `stores/logs.ts`,
   *  keeps them null together). */
  planFooter?: string;
  /** Cohort-unlock spec (2026-08-23), §2: the exact marked line, present
   *  only when `row.endedBy === "link-lost"` — every other `endedBy`
   *  value (including the other four real ones and absent/null) renders
   *  nothing here; this spec is the lost-link surface, not an `endedBy`
   *  taxonomy display (spec's own line). */
  linkLostLine?: string;
}

// §5A: `deviceName` when stored; else `TIMER` when any stored step carries
// `actualSource: "stopwatch"`; else `LOGGED BY HAND`. James's copy ruling
// (fix round, 2026-08-18) supersedes §5A's own shorter table literal
// ("BY HAND") with the live door's exact string — see the module header's
// SOURCE INFERENCE paragraph for why the two screens must agree.
function sourceLabel(row: StoredLog): string {
  if (row.deviceName !== null) return row.deviceName;
  if (row.steps.some((s) => s.actualSource === "stopwatch")) return "TIMER";
  return "LOGGED BY HAND";
}

// §5A: "Spec 1's 2A rendering" — that rendering omits `timeLabel`
// entirely for the manual door (`buildManualModel`, no wall-clock moment
// to show for an off-app session) but carries it for both connected
// doors (`buildMonitorModel`/`buildTimerModel`, `formatTimeOfDay` off
// each door's own closing timestamp). A stored row always HAS a
// `loggedAt` (`session_logs.logged_at` is `NOT NULL`), even for a by-hand
// save — but showing a wall-clock reading next to "LOGGED BY HAND" would
// fill in a moment the original screen never claimed to know, the exact
// fabrication §2B's own absence idiom forbids elsewhere. Gated on the
// SAME inferred-source bucket, not a separate flag: `sourceLabel(row) ===
// "LOGGED BY HAND"` is precisely the door-ambiguous case this module's
// own header describes (manual door, or a not-actually-timed session) —
// symmetric with the two doors that DO get a timeLabel live, and BYTE-
// IDENTICAL to what `buildManualModel` itself does (no `timeLabel` field
// at all) — fix round's own 5A resolution: consistency with the live
// door's manual-summary meta wins over table-literalism.
function buildMeta(row: StoredLog): SummaryMeta {
  const source = sourceLabel(row);
  const meta: SummaryMeta = {
    dateLabel: formatLogDate(row.loggedAt),
    sourceLabel: source,
  };
  if (source !== "LOGGED BY HAND") {
    meta.timeLabel = formatTimeOfDay(row.loggedAt);
  }
  return meta;
}

// RC-5 (hero-truth design spec) §1, Task 3: the stored screen's own tier
// split, parallel to `summaryModel.ts`'s `monitorHeroes` but reading a
// PERSISTED row rather than a live `MonitorRun` — `StoredLogStep` has no
// `run.actuals`/`logSeed` to read, only whatever was actually saved.
//
//  TIER A — the row carries the machine's own work totals
//  (`machineWorkSeconds`/`machineWorkMeters`, both non-null and `> 0` —
//  PR #190). DISTANCE/TIME render verbatim; AVG SPLIT renders the
//  machine's own `machineSummary.avgPaceSecondsPer500m` (Task 1) — NEVER
//  a quotient of ours (Global Constraints: the PM5 truncates, we round).
//  A build-738-era row (machine totals present, `avgPaceSecondsPer500m`
//  absent — that key predates Task 1) renders NO avg split hero at all,
//  intentionally (pinned by a dedicated test in `storedSummary.test.ts`
//  so nobody "fixes" it into a fallback quotient later). Fix round 2
//  (CRITICAL finding C1): `buildStoredTotalLine` is called with an EMPTY
//  `stepSums` here too, for the identical reason TIER B1 below is —
//  `appendSummaryObservations` admits a TERMINATED (`endedBy: "rower"`)
//  row into tier A, and such a row's RC-1 rest pair is NULL
//  (`computeWorkRestSums` runs only for `"finished"`) while its abandoned
//  final interval's own rowed metres can be missing from `steps` (no
//  0x0037 ever sent for it) — passing the real `stepSums` let
//  fallback-2 relabel that ROWED WORK as rest.
//
//  TIER B1 — no machine totals, but the row carries RC-1's own WORK pair
//  (`workSeconds`/`workMeters`, both non-null and `> 0` — written by
//  `computeWorkRestSums`, `monitorRun.ts`, for any `"finished"`-close
//  monitor row since RC-1 shipped, 2026-08-24). PREFERRED over Σ steps
//  (fix round 1, Task 3 review, IMPORTANT finding): this pair sums
//  DIRECTLY off `run.actuals` at save time, unconditionally — the
//  IDENTICAL population `summaryModel.ts`'s `tierBWorkDistanceMeters`/
//  `tierBWorkTimeSeconds` sum on the live door, with no null-index or
//  warm-up exclusion — so it is SOUND where Σ steps (tier B2 below) is
//  not: a null-index actual, or a legacy warm-up interval, never becomes
//  a stored step at all (see B2's own comment), but this pair counts it
//  regardless, because it never goes through `steps`/`logSeed` at all.
//  AVG SPLIT still comes from `tierBAvgSplitSeconds(row.steps)` — that
//  computation is UNAFFECTED by the same gap (a null-index actual is
//  correctly excluded from AVG SPLIT by §1's own rule, and since it never
//  becomes a step, `tierBAvgSplitSeconds` already excludes it by
//  construction, the same "not by a check this module has to write"
//  reasoning B2 relies on). `buildStoredTotalLine` is called with an
//  EMPTY `stepSums` in this branch (never the real one) — see that
//  function's own note on why fallback-2 must never fire here: this
//  branch's hero is already correct and complete, so any excess between
//  it and Σ steps is exactly the same null-index/warm-up gap, not rest,
//  and attributing it to the TOTAL line's rest clause would be the same
//  wrong-number class this whole spec exists to kill, one line lower.
//
//  TIER B2 — no machine totals, no RC-1 work pair, at least one stored
//  step carries `actualMeters`, AND `row.endedBy` is `"finished"`, `null`,
//  or `undefined` (`isReconstructableClose` below) — **corrected at fix
//  round 2 (final whole-branch review, IMPORTANT finding I1): the
//  original comment here claimed this population was "a CLOSED, ~16-day
//  historical window that cannot grow" — FALSE.** `computeWorkRestSums`
//  (RC-1's work-pair writer) runs ONLY for `endedBy === "finished"`
//  (`completeMonitorRun`'s own gate, `monitorRun.ts`), and
//  `appendSummaryObservations` (the machine-totals writer) admits only
//  `"finished"`/`"rower"` — so a row closed `"link-lost"`,
//  `"program-failed"`, `"interrupted"`, OR a `"rower"` terminate whose
//  burst never arrived can NEVER carry machine totals OR the work pair,
//  by design, FOREVER — not a closed window, an ONGOING population that
//  grows with every future interrupted/lost-link session. The
//  `row.endedBy` GATE ABOVE is the fix: it restricts THIS branch (Σ
//  steps trusted, fallback-2 rest recovery applied) to the population
//  that is provably historical — a `"finished"` row reaching here (no
//  machine totals, no work pair) MUST predate RC-1 (2026-08-24), because
//  every `"finished"` row saved since then gets the work pair
//  unconditionally whenever it has any actuals at all (the same reason a
//  `"finished"` row with `hasStepActuals` true can never lack it) — and
//  `null`/`undefined` `endedBy` predates Phase LL Task 4 (2026-08-2X,
//  before RC-1 too). A row whose `endedBy` is one of the four
//  "incomplete by construction" reasons (RC-1's own ROADMAP row's
//  phrase) is EXCLUDED from this branch regardless of when it was saved
//  — see the RISK NOTE below for why, and DECLINE (FALLBACK) for what it
//  gets instead.
//  DISTANCE/TIME are Σ `actualMeters`/Σ `actualSeconds` over every step
//  that carries them. **PARITY CLAIM (fix round 1: TRUE for the
//  sub-threshold exclusion, FALSE for null-index/warm-up):**
//    - Sub-threshold parity HOLDS: like the live door, this sum applies
//      no sub-threshold exclusion (a mis-tap's own tiny reading still
//      counts toward DISTANCE/TIME here, exactly as `tierBWorkDistanceMeters`
//      does) — only AVG SPLIT excludes it, below.
//    - Null-index/warm-up parity DOES NOT HOLD: `logDraft.ts:844-846`
//      builds `buildMonitorLogSteps`'s `actualByIndex` map ONLY from
//      actuals whose `index !== null`, so a null-index actual — or a
//      LEGACY warm-up interval (`buildMonitorLogSteps`'s own "a legacy
//      warmup seed step produces NO step" rule) — can NEVER produce a
//      stored step, on ANY row, at any time. Σ steps therefore
//      UNDER-COUNTS relative to what the live door's `tierBWorkDistanceMeters`/
//      `tierBWorkTimeSeconds` compute (which sum `run.actuals` directly
//      and include both), while spec §1 explicitly requires a null-index
//      actual to STAY counted in DISTANCE/TIME. This is a real, KNOWN,
//      ACCEPTED gap — but now genuinely bounded, because the `endedBy`
//      gate above confines this branch to the provably-historical
//      population (see the RISK NOTE).
//  AVG SPLIT is ONE quotient (`500 × Σt/Σd`, `tierBAvgSplitSeconds`
//  below) over the steps whose `actualSeconds` clears
//  `MIN_MEASURABLE_ELAPSED_SECONDS`; a null-index actual is excluded from
//  this sum too, but (unlike DISTANCE/TIME) that's the CORRECT behavior
//  per §1 — the gap above is about DISTANCE/TIME under-counting, not
//  about AVG SPLIT over-counting.
//
//  RISK NOTE — TIER B2's ACCEPTED, TESTED residual, RE-DECIDED at fix
//  round 2 on the TRUE population (final whole-branch review, IMPORTANT
//  finding I1's own question: "is trusting Σ steps still right, or
//  should B2 decline to the stored fused columns?"). No stored field
//  distinguishes "this row's Σ steps under-counts because of a
//  null-index/warm-up gap" from "this row's Σ steps is exactly right and
//  its OWN stored `distanceMeters`/`timeSeconds` are simply the
//  pre-task-3 FUSED numbers" (`buildStoredRest`'s own fallback-2 rung,
//  held sound at fix round 1) — both produce the IDENTICAL observable
//  shape (`stored > Σ steps`), and the two cases want OPPOSITE treatment
//  (decline vs. shrink-and-derive-rest). Fix round 1's answer ("declines
//  to decline: B2 keeps computing from Σ steps") rested on the FALSE
//  "closed, non-growing window" premise — re-decided here on the TRUE
//  one: **for the population where we CANNOT tell historical from
//  ongoing (any row whose `endedBy` names an incomplete-by-construction
//  close), B2 now DECLINES to FALLBACK** (the stored, possibly-fused
//  columns, unchanged, no rest-line derivation) rather than risk an
//  ever-growing stream of silent under-counts on interrupted/lost-link
//  rows — the SAME C1-shaped harm (a rowed interval's own work
//  relabelled as rest, or simply dropped) this fix round already closed
//  for tier A. Trusting Σ steps stays RIGHT only for the population where
//  `endedBy` PROVES the row is historical (`isReconstructableClose`
//  above) — a genuinely closed, non-growing 2026-08-08..2026-08-24
//  window, same size as fix round 1 believed the WHOLE population to be.
//  Pinned, not silent: `storedSummary.test.ts` carries both a
//  "TIER B2 (SAFE)" case (Σ steps trusted, endedBy finished/null) and a
//  "TIER B2 DECLINES" case (endedBy link-lost, falls to FALLBACK) so
//  neither behavior can silently drift into the other.
//
//  FALLBACK — no step carries `actualMeters` at all, OR steps carry
//  `actualMeters` but `row.endedBy` names an incomplete-by-construction
//  close (the DECLINED tier-B2 population, RISK NOTE above). This covers
//  every timer/manual-door row (neither door ever writes the field —
//  their heroes were already work-only before this task and stay
//  byte-identical), any monitor row predating the 2026-08-08 amendment
//  entirely, AND — new at fix round 2 — every link-lost/program-failed/
//  interrupted/burst-less-terminate monitor row, forever: the stored
//  `avgSplitSeconds`/`timeSeconds`/`distanceMeters` render exactly as
//  saved, unimproved but never silently wrong. `buildStoredTotalLine` is
//  called with an EMPTY `stepSums` here too (fix round 2) — a declined
//  row can still have `stepSums.meters` defined (steps exist, just
//  distrusted), and passing the real one would let fallback-2 fire on
//  the SAME gap this branch exists to protect against.
// Fix round 2 (final whole-branch review, IMPORTANT finding I1): TIER
// B2's own gate — TRUE for `"finished"`, `null`, and `undefined` (every
// shape that PROVES this row predates RC-1, 2026-08-24 — see the TIER B2
// comment block above for why), FALSE for the four close reasons RC-1's
// own ROADMAP row calls "incomplete by construction": `"rower"` (a
// terminate whose burst never arrived, so it never became tier A),
// `"link-lost"`, `"program-failed"`, `"interrupted"`. A row failing this
// check falls through to FALLBACK instead of trusting Σ steps.
function isReconstructableClose(endedBy: StoredLog["endedBy"]): boolean {
  return (
    endedBy !== "rower" &&
    endedBy !== "link-lost" &&
    endedBy !== "program-failed" &&
    endedBy !== "interrupted"
  );
}

function stepActualSums(steps: StoredLogStep[]): {
  meters?: number;
  seconds?: number;
} {
  let hasMeters = false;
  let meters = 0;
  let hasSeconds = false;
  let seconds = 0;
  for (const step of steps) {
    if (step.actualMeters !== undefined) {
      hasMeters = true;
      meters += step.actualMeters;
    }
    if (step.actualSeconds !== undefined) {
      hasSeconds = true;
      seconds += step.actualSeconds;
    }
  }
  return {
    meters: hasMeters ? meters : undefined,
    seconds: hasSeconds ? seconds : undefined,
  };
}

// Tier B's AVG SPLIT: `500 × Σt/Σd` over pm5-sourced steps whose own
// `actualSeconds` clears the sub-threshold floor — `MIN_MEASURABLE_
// ELAPSED_SECONDS`'s own doc comment, `summaryModel.ts`'s
// `monitorAvgSplit`'s identical rule, generalized to a stored step (the
// `actualSource === "pm5"` gate is defensive: no other door writes
// `actualMeters` at all, so a non-pm5 step can never reach this sum in
// practice, but the check documents the intent rather than relying on
// that as an unstated accident).
function tierBAvgSplitSeconds(steps: StoredLogStep[]): number | undefined {
  let t = 0;
  let d = 0;
  for (const step of steps) {
    if (step.actualSource !== "pm5") continue;
    if (step.actualSeconds === undefined || step.actualMeters === undefined) {
      continue;
    }
    if (step.actualSeconds < MIN_MEASURABLE_ELAPSED_SECONDS) continue;
    t += step.actualSeconds;
    d += step.actualMeters;
  }
  return d > 0 ? (500 * t) / d : undefined;
}

// RC-5 §2, Task 3: the TOTAL line's rest source, on the stored screen.
// Only TWO rungs — this screen has no per-actual rest field to fall back
// to (`StoredLogStep` carries none at all — a fact Task 2's own live-door
// ladder doesn't have to deal with):
//
//  1. The RC-1 stored pair, `row.restSeconds`/`row.restMeters` — both or
//     neither (same all-or-nothing contract `monitorRun.ts`'s own writer
//     keeps for the pair, `summaryModel.ts`'s `monitorRest` reads).
//  2. PRE-PR ONLY: derived from the fused stored columns minus Σ steps —
//     `row.distanceMeters − stepSums.meters` /
//     `row.timeSeconds − stepSums.seconds` — valid ONLY when the stored
//     totals EXCEED Σ steps, which can only happen for a row saved
//     BEFORE this task shipped: a post-task-3 tier-B save posts
//     `distanceMeters`/`timeSeconds` that already equal Σ steps exactly
//     (`LogSession.tsx`'s `model.heroes.*`, Task 2's own commit). The
//     comparison itself IS the pre-PR detector; no separate flag exists
//     to check, and none is needed. Chosen over omitting this rung
//     entirely (the brief's stated alternative): most of today's real
//     stored monitor rows predate this task, and without it they'd show
//     a work-only hero with no way to recover the rest their own fused
//     column already proves happened.
//  3. Neither resolves: no rest clause.
//
// Fix round 1 (Task 3 review, IMPORTANT finding), widened at fix round 2
// (CRITICAL finding C1): rung 2 is SAFE only because its caller controls
// `stepSums` — `buildHeroes`' TIER A and TIER B1 branches (the machine's
// own totals; RC-1's own `workSeconds`/`workMeters` pair — BOTH sound and
// complete on their own) pass an EMPTY `stepSums` here on purpose, so this
// rung can never fire and misattribute a gap between the hero and Σ steps
// as rest when that gap is really an abandoned interval's own rowed work
// (tier A, a terminated row) or a null-index/warm-up actual (tier B1).
// Only a TIER B2 row whose Σ steps IS the hero passes the real `stepSums`
// — and, since fix round 2 (finding I1), that is now further gated on
// `isReconstructableClose(row.endedBy)`: a row whose `endedBy` names an
// incomplete-by-construction close DECLINES to FALLBACK instead (also an
// empty `stepSums`) rather than risk this rung firing on a growing,
// un-bounded population. See the tier-B2/FALLBACK comment block above
// `stepActualSums` for the full risk/decision writeup.
function buildStoredRest(
  row: StoredLog,
  stepSums: { meters?: number; seconds?: number },
): { seconds?: number; meters?: number } {
  if (row.restSeconds !== null && row.restMeters !== null) {
    return { seconds: row.restSeconds, meters: row.restMeters };
  }
  if (
    stepSums.meters !== undefined &&
    stepSums.seconds !== undefined &&
    row.distanceMeters !== null &&
    row.timeSeconds !== null &&
    row.distanceMeters > stepSums.meters &&
    row.timeSeconds > stepSums.seconds
  ) {
    return {
      seconds: row.timeSeconds - stepSums.seconds,
      meters: row.distanceMeters - stepSums.meters,
    };
  }
  return {};
}

// RC-5 §2, Task 3: the stored screen's own TOTAL line, built through the
// SAME exported formatter `summaryModel.ts`'s live screen uses
// (`buildTotalLine` — the design spec's own "built in one place, not
// twice" requirement); this function does only the sourcing
// (`buildStoredRest` above plus the monitor-row gate below), never a
// second copy of the formatting.
//
// `isMonitorRow` gates this OFF for the timer/manual doors, mirroring
// `SummaryHeroes.totalLine`'s own doc comment ("the manual/timer doors
// never set it — no rest concept applies to either"): every timer/manual
// row lands in `buildHeroes`' FALLBACK branch (neither door writes
// `actualMeters`), which is otherwise ambiguous between "a genuinely
// door-agnostic fallback row" and "a legacy monitor row predating
// actualMeters" — `row.deviceName !== null` is the SAME signal
// `sourceLabel`/`buildMeta` above already use to tell a PM5 row from a
// TIMER/LOGGED-BY-HAND one. Without this gate, every stored timer/manual
// row in the database would suddenly grow a spurious "X:XX total" line
// it never had before and the live door still never renders.
function buildStoredTotalLine(
  row: StoredLog,
  workSeconds: number | undefined,
  stepSums: { meters?: number; seconds?: number },
): string | undefined {
  if (workSeconds === undefined || row.deviceName === null) return undefined;
  const rest = buildStoredRest(row, stepSums);
  const totalSeconds = workSeconds + (rest.seconds ?? 0);
  return buildTotalLine(totalSeconds, rest.meters);
}

// §5B (extended by RC-5 §1/§2, Task 3): each hero independently
// `undefined` when its own source has nothing to show (never a
// fabricated `0:00`/`0 m`) — see this module's own tier comment above
// for the three branches and their sources.
function buildHeroes(row: StoredLog): SummaryHeroes {
  const hasMachineTotals =
    row.machineWorkSeconds !== null &&
    row.machineWorkMeters !== null &&
    row.machineWorkSeconds > 0 &&
    row.machineWorkMeters > 0;
  const stepSums = stepActualSums(row.steps);

  if (hasMachineTotals) {
    // machineWorkSeconds/machineWorkMeters is `number | null`, non-null
    // and > 0 here by `hasMachineTotals`'s own gate — the `!`s document
    // that fact, matching this repo's own convention for a fact a
    // preceding check already established.
    const distanceMeters = Math.round(row.machineWorkMeters!);
    const timeSeconds = row.machineWorkSeconds!;
    const avgSplitSeconds = row.machineSummary?.avgPaceSecondsPer500m;
    const hasAvgSplit = avgSplitSeconds !== undefined && avgSplitSeconds > 0;
    return {
      distanceMeters,
      time: fmtDuration(timeSeconds / 60),
      timeSeconds,
      avgSplit: hasAvgSplit ? fmtSplit(avgSplitSeconds!) : undefined,
      avgSplitSeconds: hasAvgSplit ? avgSplitSeconds : undefined,
      // Fix round 2 (final whole-branch review, CRITICAL finding C1): an
      // EMPTY `stepSums`, not the real one — see TIER B1's own comment a
      // few lines down for the shared reasoning, which applies here
      // UNCHANGED. `appendSummaryObservations` admits `endedBy ===
      // "rower"` (a Menu/End terminate) as well as `"finished"`, so a
      // TERMINATED row can be tier A while its RC-1 rest pair is NULL
      // (`computeWorkRestSums` runs ONLY for `"finished"`,
      // `completeMonitorRun`'s own gate) — and the abandoned final
      // interval's own actual can arrive with no matching program index
      // a step was ever built for (its 0x0037 boundary never sends), so
      // Σ steps under-counts the machine's own `machineWorkMeters` by
      // exactly that interval's real, ROWED metres. Passing the real
      // `stepSums` here let fallback-2 relabel that rowed work as rest —
      // caught by a dedicated tier-A-with-null-rest-pair test below.
      totalLine: buildStoredTotalLine(row, timeSeconds, {}),
    };
  }

  // TIER B1 — RC-1's own work pair, preferred over Σ steps whenever
  // present (fix round 1: the sound signal the null-index finding asked
  // for). `stepSums` is deliberately NOT passed to `buildStoredTotalLine`
  // here — see that function's own note and `buildStoredRest`'s comment
  // for why fallback-2 must never fire against a hero this branch already
  // knows is complete.
  const hasWorkPair =
    row.workSeconds !== null &&
    row.workMeters !== null &&
    row.workSeconds > 0 &&
    row.workMeters > 0;
  if (hasWorkPair) {
    const distanceMeters = Math.round(row.workMeters!);
    const timeSeconds = row.workSeconds!;
    const avgSplitSeconds = tierBAvgSplitSeconds(row.steps);
    return {
      distanceMeters,
      time: fmtDuration(timeSeconds / 60),
      timeSeconds,
      avgSplit:
        avgSplitSeconds !== undefined ? fmtSplit(avgSplitSeconds) : undefined,
      avgSplitSeconds,
      totalLine: buildStoredTotalLine(row, timeSeconds, {}),
    };
  }

  // TIER B2 — no RC-1 work pair; Σ steps is the best (imperfect, see this
  // module's own tier-B2 comment block above) available signal, trusted
  // ONLY when `endedBy` proves the row is historical (fix round 2,
  // `isReconstructableClose`) — otherwise DECLINES to FALLBACK below.
  const hasStepActuals =
    row.steps.some((s) => s.actualMeters !== undefined) &&
    isReconstructableClose(row.endedBy);
  if (hasStepActuals) {
    const timeSeconds = stepSums.seconds;
    const avgSplitSeconds = tierBAvgSplitSeconds(row.steps);
    return {
      distanceMeters: stepSums.meters,
      time:
        timeSeconds !== undefined ? fmtDuration(timeSeconds / 60) : undefined,
      timeSeconds,
      avgSplit:
        avgSplitSeconds !== undefined ? fmtSplit(avgSplitSeconds) : undefined,
      avgSplitSeconds,
      totalLine: buildStoredTotalLine(row, timeSeconds, stepSums),
    };
  }

  // FALLBACK — stored heroes, unchanged. Fix round 2: EMPTY `stepSums`
  // here too (never the real one) — a DECLINED tier-B2 row (steps exist
  // but `endedBy` is unsafe) can still have `stepSums.meters` defined,
  // and passing it would let fallback-2 fire on the exact gap this
  // branch exists to protect against (see the TIER B2/FALLBACK comment
  // block above `stepActualSums`).
  const timeSeconds = row.timeSeconds ?? undefined;
  return {
    avgSplit:
      row.avgSplitSeconds !== null ? fmtSplit(row.avgSplitSeconds) : undefined,
    avgSplitSeconds: row.avgSplitSeconds ?? undefined,
    time: timeSeconds !== undefined ? fmtDuration(timeSeconds / 60) : undefined,
    timeSeconds,
    distanceMeters: row.distanceMeters ?? undefined,
    totalLine: buildStoredTotalLine(row, timeSeconds, {}),
  };
}

/** A row's genuinely-measured elapsed seconds, or `undefined` when the
 *  row should render in its PRESCRIBED shape — generalizes
 *  `summaryModel.ts`'s own per-door floor checks
 *  (`isMonitorRowMeasurable`/`timerMeasurableElapsedSeconds`) across BOTH
 *  door fingerprints a stored step can carry, since a from-the-log row
 *  doesn't know which door wrote it, only what the step itself says:
 *
 *  - `actualSource: "pm5"` — measured when `actualSeconds` is present
 *    AND at/above the floor (the monitor door's own rule; `actualSplit`
 *    can still be independently absent — a valid elapsed reading with an
 *    out-of-band `avgSplit`, `monitorWorkRows`' own documented shape).
 *  - `actualSource: "stopwatch"` — measured when the reconstructed
 *    `actualSplit × meters ÷ 500` is at/above the floor (the timer
 *    door's own exact reconstruction, `timerMeasurableElapsedSeconds`'s
 *    own doc comment — "the exact inverse of `nextDistance`").
 *  - `actualSource: "assumed"` (or absent) — never measured: an assumed
 *    reading is "held the target", not a real one, the same rule both
 *    live doors already apply. */
function measuredElapsedSeconds(step: StoredLogStep): number | undefined {
  if (step.actualSource === "pm5") {
    return step.actualSeconds !== undefined &&
      step.actualSeconds >= MIN_MEASURABLE_ELAPSED_SECONDS
      ? step.actualSeconds
      : undefined;
  }
  if (
    step.actualSource === "stopwatch" &&
    step.actualSplit !== undefined &&
    step.meters !== undefined
  ) {
    const elapsed = (step.actualSplit * step.meters) / 500;
    return elapsed >= MIN_MEASURABLE_ELAPSED_SECONDS ? elapsed : undefined;
  }
  return undefined;
}

// §5C, re-baselined (Phase LT spec 1, §4): fed by stored `steps`, spec
// 1's §1 rendering/judgment rule verbatim — `rowJudgment`/`buildSpmCell`
// (Task 2, `summaryModel.ts`) are the ONE place either rule is decided;
// this function never re-derives them. `targetLabel` keys on
// `step.targetSplit` ALONE (§1's "abstains when" rule, antagonist B5) —
// independent of whether the row ends up measured enough to judge at
// all. `avgSplitSeconds` is no longer a parameter here: judgment reads
// nothing but the row's own `targetSplit`/`actualSplit`/`actualSource`
// (the stored session average still feeds ONLY the AVG SPLIT hero, via
// `buildHeroes` below, untouched).
function buildRows(steps: StoredLogStep[]): SummaryRow[] {
  return steps.map((step, i) => {
    const index = i + 1;
    const elapsed = measuredElapsedSeconds(step);
    if (elapsed === undefined) {
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
    const timeLabel = fmtDuration(elapsed / 60);
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

// §5D: option-B held words, mirrored verbatim from `PostWorkoutSummary.
// tsx`'s own `HELD_OPTIONS` (that file's own comment names every mirror
// of this ruling: server, client type, pgEnum — this read-back label
// table joins that list). Kept as its own small table rather than an
// import from that `.tsx` file: this module is pure (no React/DOM), and
// `PostWorkoutSummary.tsx` is a component module — importing it here
// would pull JSX into a module this task's own brief calls "pure,
// heaviest coverage". Both copies are pinned by their own dedicated
// tests, which is what actually catches drift, not shared code alone.
const HELD_READBACK_LABEL: Record<HeldResult, string> = {
  held: "HELD",
  under: "UNDER · FASTER",
  over: "OVER · SLOWER",
};

// Thumbs read-back words: "LIKED" for `up` is the design spec's own
// literal example (§5D: "HELD · PAIN 3/5 · LIKED"). The spec never names
// a `down` word — James's copy ruling (fix round, 2026-08-18): "LESS LIKE
// THIS", reusing the live door's own control vocabulary verbatim
// (`PostWorkoutSummary.tsx`'s thumbs-down button carries `aria-label="Less
// like this"`) rather than a fresh invented antonym ("DISLIKED", this
// task's original, unconfirmed guess).
function thumbsReadBackLabel(thumbs: Thumbs): string {
  return thumbs === "up" ? "LIKED" : "LESS LIKE THIS";
}

function buildReadBack(row: StoredLog): StoredReadBack {
  const noteText =
    row.notes !== null && row.notes.trim() !== "" ? row.notes : undefined;
  const empty =
    row.thumbs === null &&
    row.held === null &&
    row.pain === null &&
    noteText === undefined;
  if (empty) return { empty: true };

  const segments = [
    row.held !== null ? HELD_READBACK_LABEL[row.held] : null,
    row.pain !== null ? `PAIN ${row.pain}/5` : null,
    row.thumbs !== null ? thumbsReadBackLabel(row.thumbs) : null,
  ].filter((s): s is string => s !== null);

  return {
    empty: false,
    segmentLine: segments.length > 0 ? segments.join(" · ") : undefined,
    note: noteText,
  };
}

// Fix round MEDIUM: narrows against the real `PLANS` object via `in`,
// not a hand-duplicated `"sprint" || "head"` literal union — a THIRD
// preset added to `domain/plans.ts` in the future is recognized here for
// free (this function needs no edit), where the old literal check would
// have silently kept treating it as unknown with no typecheck to catch
// the drift.
function isKnownPlanKey(key: string): key is keyof typeof PLANS {
  return key in PLANS;
}

// §5E: title resolves from `plan_key` against the client's PLANS table
// (`domain/plans.ts`); an unknown key renders verbatim. The sequence
// LENGTH has no fallback source when the key is unknown (PLANS is the
// ONLY place a plan's length is recorded, client-side) — this task's own
// judgment call, flagged in the report: rather than fabricate a length
// for a plan this build no longer defines, the "OF <length>" clause is
// omitted entirely for an unknown key, leaving `Logged to <key> · SESSION
// <n>` — honest about what is and isn't still known, consistent with
// this spec's own "never invention, degrade toward absence" rule applied
// everywhere else (§5C's judging gate, §2B's hero absence).
function buildPlanFooter(row: StoredLog): string | undefined {
  if (row.planKey === null || row.planIndex === null) return undefined;
  const preset = isKnownPlanKey(row.planKey) ? PLANS[row.planKey] : undefined;
  const title = preset?.title ?? row.planKey;
  const session = `SESSION ${row.planIndex + 1}`;
  return preset !== undefined
    ? `Logged to ${title} · ${session} OF ${preset.sessions.length}`
    : `Logged to ${title} · ${session}`;
}

// Cohort-unlock spec (2026-08-23), §2: the copy is verbatim from the
// spec — plain words, no promise the gap was filled (the house "LL copy
// rule"), middle dot never an em-dash (house style, lint-checked for
// copy). Named as its own constant so the exact string is pinned once,
// not re-typed at both this builder and the FromTheLog test that asserts
// it renders.
const LINK_LOST_LINE = "LINK LOST · the app lost the monitor before the end";

// §2: "no other endedBy values render anything." A plain equality check
// against the one value this spec owns — never a negation of the other
// four (which would silently start rendering the line for any FUTURE
// sixth value the union might grow, exactly the taxonomy-display this
// spec explicitly declines to be).
function buildLinkLostLine(row: StoredLog): string | undefined {
  return row.endedBy === "link-lost" ? LINK_LOST_LINE : undefined;
}

/** The from-the-log view's own pure model — §5's property table,
 *  property by property (see each `build*` helper above for its own
 *  citation). Never throws: unlike `buildSummaryModel`'s monitor door,
 *  there is no live `MonitorRun`/`logSeed` alignment to fail here — a
 *  stored row's `steps` is whatever was actually persisted, rendered as
 *  is. */
export function buildStoredSummary(row: StoredLog): StoredSummaryView {
  const meta = buildMeta(row);
  const heroes = buildHeroes(row);
  const rows = buildRows(row.steps);
  const caption = targetsOnlyCaption(rows);
  const readBack = buildReadBack(row);
  const linkLostLine = buildLinkLostLine(row);
  const planFooter = buildPlanFooter(row);
  return { meta, heroes, rows, caption, readBack, planFooter, linkLostLine };
}
