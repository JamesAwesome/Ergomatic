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
// SOURCE — A COLUMN, NOT AN INFERENCE (Just Row unconnected spec,
// 2026-09-02, §Mechanism stored shape (c) and §Mechanism 6). `sourceLabel`
// below reads `session_logs.source` (`pm5` / `timer` / `manual`, NOT NULL,
// written by every log door and backfilled for every earlier row by
// migration 0020) and NOTHING else — exit criterion 3d pins that the door
// is never again inferred from a step's `actualSource` here. (The per-step
// `measuredElapsedSeconds` below still reads that field, legitimately: it
// decides whether ONE ROW's elapsed can be reconstructed, which is a fact
// about the step, not about which door saved the row.)
//
// HISTORY, kept because the copy rulings it carries still stand. From
// Phase PW spec 2 (§5A, antagonist B7) until 2026-09-02 a stored row had
// no "which door" column, so this module GUESSED: `deviceName` named a
// monitor row, a stopwatch-sourced step was the timer door's fingerprint
// (`buildLogSteps` being that member's only producer), and a row with
// neither read as the "assumed everything" shape both the manual door and
// a not-actually-timed timer session produce. James's copy ruling (fix
// round, 2026-08-18) fixed the third bucket's word at `LOGGED BY HAND` —
// matching spec 1's live manual door (`summaryModel.ts`'s
// `buildManualModel`) and the handoff, not §5A's own shorter table
// literal — so the identical fact never reads as two different words
// depending on whether a rower is looking at a session live or from the
// log. That ruling is unchanged; only where the fact comes FROM changed.
//
// The guess was knowingly wrong about one row (Phase LM PR 1 Task 4,
// option 2 — stated in the PR, not discovered later): a connected session
// the app never heard a pull from opens no record at all, so its save
// falls through the manual door and posts neither `deviceName` nor
// `endedBy`. The LIVE screen names that arrival honestly
// (`summaryModel.ts`'s `NO_MONITOR_READING_SOURCE`); the STORED row could
// not, because the columns carried no signal separating it from a genuine
// by-hand entry. Both fields that already existed were examined and
// rejected as carriers (`endedBy` would assert a close reason for a record
// that never existed; `deviceName` — reachable via `loadLastDevice()` — is
// a best-effort LAST-USED name, so posting it would have the row assert
// that a named erg supplied numbers that came off nothing), and the
// conclusion was "a new stored field plus a migration", queued at the time
// under a ROADMAP heading that no longer exists (formalized since as
// `docs/superpowers/specs/2026-09-02-door-partial-design.md` §2). THAT
// FIELD IS THIS COLUMN. Door PR A (2026-09-02) closes the divergence: a
// connected arrival with no record now posts `source: "no-reading"`
// (`LogSession.tsx`'s manual door), never `manual`, and this switch's
// fourth arm renders it as `NO_MONITOR_READING_SOURCE` — the same word
// the live screen already used. A row saved before this PR shipped still
// carries `manual` (no backfill — §2.4) and still renders `LOGGED BY
// HAND`; only a row saved after this PR can be honest.

import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import { PLANS } from "../../domain/plans.js";
import type { LogSource, WorkoutType } from "../../domain/types.js";
import type { HeldResult, Thumbs } from "../api/useRecentLogs";
import { NAMELESS_MONITOR_CAPTION } from "../monitor/deviceCaption.js";
import type { CloseReason } from "../monitor/monitorRun";
import type { SeriesData } from "../monitor/seriesRecorder.js";
import { formatLogDate } from "../session/logDraft";
import {
  buildSpmCell,
  buildTotalLine,
  formatTimeOfDay,
  MIN_MEASURABLE_ELAPSED_SECONDS,
  NO_MONITOR_READING_SOURCE,
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
  /** Phase JR PR 1: NULLABLE — see `RecentLog.workoutType`. */
  workoutType: WorkoutType | null;
  loggedAt: string;
  held: HeldResult | null;
  pain: number | null;
  notes: string | null;
  thumbs: Thumbs | null;
  deviceName: string | null;
  /** Just Row unconnected spec (2026-09-02), stored shape (c): the door
   *  this row came through, as a stored fact — `session_logs.source`,
   *  NOT NULL in the column (every earlier row backfilled by migration
   *  0020), so typed non-null here: a row without it cannot be
   *  constructed in the client at all (exit criterion 3d). `sourceLabel`
   *  below reads this and nothing else. */
  source: LogSource;
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
  // warm-up interval, never becomes a MEASURED step at all) while this
  // pair cannot, because it is summed directly off `run.actuals`, never
  // off `steps`/`logSeed`. Required-and-nullable, same convention as
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
  /** Door spec (2026-09-02) §1.2: the close-reason line, on TWO triggers
   *  and no others. (1) `row.endedBy === "link-lost"` ALONE, steps-
   *  independent, exactly as the cohort-unlock spec (2026-08-23) §2 shipped
   *  it — a release-noted promise (`news/content/releaseNotes.ts:366`).
   *  (2) a row `partialCloseReason` marks PARTIAL, which renders that
   *  reason's own sentence plus `· N of M intervals measured`; for
   *  `link-lost` the two triggers compose into one line. Every other
   *  `endedBy` value — including `finished` and absent/null — renders
   *  nothing here: this is not an `endedBy` taxonomy display. */
  closeLine?: string;
}

// Just Row unconnected spec (2026-09-02), §Mechanism 6: the word comes from
// the COLUMN — `pm5` ⇒ the device's own name, `timer` ⇒ `TIMER`, `manual`
// ⇒ `LOGGED BY HAND` (James's copy ruling, fix round 2026-08-18, supersedes
// §5A's own shorter table literal "BY HAND" with the live door's exact
// string — see the module header for why the two screens must agree).
// Door PR A (2026-09-02) §2.1 adds a fourth: `no-reading` ⇒ the live
// screen's own `NO_MONITOR_READING_SOURCE`, imported rather than retyped —
// this is the "next stored-shape change" the module header's LM exception
// named as its own trigger.
// `steps` are never consulted: a time-only Just Row is `timer` with NO
// steps, which the old fingerprint could only ever have called by-hand.
// The `?? NAMELESS_MONITOR_CAPTION` arm is the type's, not the wire's: the
// server refuses `pm5` without a `deviceName` (`server/logSource.ts`), so a
// stored `pm5` row always carries a name; the fallback only keeps the
// function total over `deviceName: string | null` — RC-18 (door spec §3),
// same as before, DEAD by the biconditional's own guarantee and
// deliberately untested here for that reason. What RC-18 changes is
// upstream, not this arm's reachability: a `pm5` row MUST carry a name
// (the biconditional, `server/logSource.ts`), so without a neutral
// fallback a nameless erg's row would 400 the whole save — `LogSession.tsx`
// (`:730-755`) is the site that actually substitutes
// `NAMELESS_MONITOR_CAPTION` for the unusable advertised name, which is
// what makes the word load-bearing rather than decorative: a real saved
// row can genuinely read `MONITOR` here, just never via THIS `??`.
function sourceLabel(row: StoredLog): string {
  switch (row.source) {
    case "pm5":
      return row.deviceName ?? NAMELESS_MONITOR_CAPTION;
    case "timer":
      return "TIMER";
    case "manual":
      return "LOGGED BY HAND";
    case "no-reading":
      // Door spec (2026-09-02) §2.1: the live screen's own word
      // (`summaryModel.ts`'s `NO_MONITOR_READING_SOURCE`), imported so one
      // fact never reads as two words live vs from the log (James's
      // 2026-08-18 ruling). This closes the LM exception the module
      // header above describes — its trigger was "the next stored-shape
      // change to the logs table", which is this PR.
      return NO_MONITOR_READING_SOURCE;
  }
}

// §5A: "Spec 1's 2A rendering" — that rendering omits `timeLabel`
// entirely for the manual door (`buildManualModel`, no wall-clock moment
// to show for an off-app session) but carries it for both connected
// doors (`buildMonitorModel`/`buildTimerModel`, `formatTimeOfDay` off
// each door's own closing timestamp). A stored row always HAS a
// `loggedAt` (`session_logs.logged_at` is `NOT NULL`), even for a by-hand
// save — but showing a wall-clock reading next to "LOGGED BY HAND" would
// fill in a moment the original screen never claimed to know, the exact
// fabrication §2B's own absence idiom forbids elsewhere.
//
// Door PR A (2026-09-02) §2.3. Re-derived POSITIVELY, over the column,
// after the negation this replaced (`sourceLabel(row) !== "LOGGED BY
// HAND"`) was found to hand a fourth member a wall-clock time by
// accident — phase-lm.md:314-318 predicted exactly this. The three
// members that carry a time are the three whose moment the APP WITNESSED:
// the connected door, the phone clock, and a connected arrival that
// measured nothing (Gate 0-A decision (c) — it gains the time BECAUSE the
// app was there). `manual` is an off-app session and shows none, which is
// byte-identical to what `buildManualModel` does live. An ALLOWLIST,
// never a negation: a future fifth member shows no time rather than
// silently gaining one.
const TIME_LABEL_SOURCES: readonly LogSource[] = ["pm5", "timer", "no-reading"];

function buildMeta(row: StoredLog): SummaryMeta {
  const source = sourceLabel(row);
  const meta: SummaryMeta = {
    dateLabel: formatLogDate(row.loggedAt),
    sourceLabel: source,
  };
  if (TIME_LABEL_SOURCES.includes(row.source)) {
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
//  a MEASURED stored step at all (see B2's own comment), but this pair
//  counts it regardless, because it never goes through `steps`/`logSeed`
//  at all.
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
//  `"program-failed"`, `"program-dropped"`, `"interrupted"`, OR a
//  `"rower"` terminate whose burst never arrived can NEVER carry machine
//  totals OR the work pair,
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
//  before RC-1 too). A row whose `endedBy` is one of the five
//  "incomplete by construction" reasons (RC-1's own ROADMAP row's
//  phrase) is EXCLUDED from this branch regardless of when it was saved
//  — see the RISK NOTE below for why, and DECLINE (FALLBACK) for what it
//  gets instead.
//  DISTANCE/TIME are Σ `actualMeters`/Σ `actualSeconds` over every step
//  that carries them. **PARITY CLAIM (fix round 1: TRUE for the
//  sub-threshold exclusion, FALSE for null-index/warm-up. Door PR A's
//  rider 2 narrowed `LogSeed.steps[].kind` to the literal `"work"` but
//  KEPT `buildMonitorLogSteps`'s legacy warm-up skip — restored at the
//  whole-branch review, Important 1 — so the warm-up leg below stands
//  exactly as written, and no number moves):**
//    - Sub-threshold parity HOLDS: like the live door, this sum applies
//      no sub-threshold exclusion (a mis-tap's own tiny reading still
//      counts toward DISTANCE/TIME here, exactly as `tierBWorkDistanceMeters`
//      does) — only AVG SPLIT excludes it, below.
//    - Null-index/warm-up parity DOES NOT HOLD: `logDraft.ts`'s
//      `buildMonitorLogSteps` builds its `actualByIndex` map ONLY from
//      actuals whose `index !== null`, so a null-index actual — or a
//      LEGACY warm-up interval (`buildMonitorLogSteps`'s own "a legacy
//      warmup seed step produces NO step" rule) — can NEVER produce a
//      MEASURED stored step, on ANY row, at any time. Σ steps therefore
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
//  entirely, AND — new at fix round 2 — every non-finished/rower monitor
//  row (link-lost, program-failed, program-dropped, interrupted,
//  burst-less-terminate), forever: the stored
//  `avgSplitSeconds`/`timeSeconds`/`distanceMeters` render exactly as
//  saved, unimproved but never silently wrong. `buildStoredTotalLine` is
//  called with an EMPTY `stepSums` here too (fix round 2) — a declined
//  row can still have `stepSums.meters` defined (steps exist, just
//  distrusted), and passing the real one would let fallback-2 fire on
//  the SAME gap this branch exists to protect against.
// Fix round 2 (final whole-branch review, IMPORTANT finding I1): TIER
// B2's own gate — TRUE for `"finished"`, `null`, and `undefined` (every
// shape that PROVES this row predates RC-1, 2026-08-24 — see the TIER B2
// comment block above for why), FALSE for the five close reasons RC-1's
// own ROADMAP row calls "incomplete by construction": `"rower"` (a
// terminate whose burst never arrived, so it never became tier A),
// `"link-lost"`, `"program-failed"`, `"program-dropped"` (Wave F PR 1 —
// a live drop keeps whatever was rowed but never gets another boundary,
// same incompleteness shape as the others), `"interrupted"`. A row
// failing this check falls through to FALLBACK instead of trusting Σ
// steps.
// Fix round 3 (re-review, Minor): an ALLOWLIST, not a denylist — the
// earlier `!== "rower" && !== "link-lost" && ...` shape fails OPEN: a
// new `CloseReason` added later (`monitorRun.ts:1099` already
// anticipates one, W8's inactivity auto-terminate) would silently pass
// this check and re-enter the trusted TIER B2 branch, resurrecting the
// exact under-count/misattribution bug this fix round closed — no type
// error, no failing test, just a quiet regression the day that value
// ships. This form fails CLOSED instead: only the two shapes that
// PROVE a row historical (`"finished"`, or `null`/`undefined` predating
// `endedBy` entirely) are trusted; anything else — including a value
// this union doesn't even know about yet — declines. Byte-identical
// behavior today (the six current values, `"program-dropped"` now among
// them, partition the same way either direction), different behavior the
// day a seventh value exists.
function isReconstructableClose(endedBy: StoredLog["endedBy"]): boolean {
  return endedBy === "finished" || endedBy == null;
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
// Gates this OFF for the timer/manual/no-reading doors, mirroring
// `SummaryHeroes.totalLine`'s own doc comment ("the manual/timer doors
// never set it — no rest concept applies to either"): every non-pm5 row
// lands in `buildHeroes`' FALLBACK branch (neither door writes
// `actualMeters`), which is otherwise ambiguous between "a genuinely
// door-agnostic fallback row" and "a legacy monitor row predating
// actualMeters". Without this gate, every stored timer/manual/no-reading
// row in the database would suddenly grow a spurious "X:XX total" line it
// never had before and the live door still never renders.
//
// Door PR A (2026-09-02) §2.2: reads `row.source !== "pm5"`, not
// `row.deviceName === null`. Provenance is what the column is FOR — the
// deviceName check was convenient (it happened to agree with `source` on
// every stored row, never itself the stated signal for "which door") —
// and the rewrite is a true no-op: 0020's backfill CASE was `WHEN
// device_name IS NOT NULL THEN 'pm5'`, and `logSourceContradiction` has
// enforced the biconditional `deviceName ≠ null ⟺ source = 'pm5'` on
// every write since, attacked and held (spec §9).
function buildStoredTotalLine(
  row: StoredLog,
  workSeconds: number | undefined,
  stepSums: { meters?: number; seconds?: number },
): string | undefined {
  if (workSeconds === undefined || row.source !== "pm5") return undefined;
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
    // Steps first — they are the population this row actually measured, so
    // where they carry PM5 actuals they outrank anything stored.
    //
    // THE FALLBACK (Phase JR PR 1, spec rev 4's F1). When they carry none,
    // read the STORED column rather than returning `undefined`. A free row
    // (Just Row) stores `steps: []` — it prescribes nothing, so there is
    // nothing to fabricate — with a real work pair and a derived
    // `avg_split_seconds`. Without this, `tierBAvgSplitSeconds` returns
    // `undefined` (its `d` never leaves 0) and this screen shows NO avg
    // split, while the history list falls through to that same stored
    // column (`LogRow.tsx:154`) and shows one. Same row, two screens, one
    // number present and one absent — the defect RC-5 exists to kill, one
    // screen over, and `LogRow.tsx`'s "identical population by
    // construction" premise is exactly what an empty `steps` falsifies.
    //
    // `?? undefined` because the column is `number | null` and every hero
    // in this module speaks `undefined` for absent.
    const avgSplitSeconds =
      tierBAvgSplitSeconds(row.steps) ?? row.avgSplitSeconds ?? undefined;
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

/** The five close reasons that name WHO ended a session. The server enum
 *  (`schema.ts`'s `endedByEnum`) minus `finished`. A value-equality
 *  ALLOWLIST, never `!== "finished"`: `null` is NOT a member and DOES
 *  occur on `pm5` rows (a legacy v1/v2 `MonitorRun` logged from Today —
 *  `monitorRun.ts:228-233`, `routes/data.ts:1738` stores `?? null`), and
 *  a negation would mark every one of them partial. */
export const PARTIAL_CLOSE_REASONS = [
  "rower",
  "link-lost",
  "program-dropped",
  "program-failed",
  "interrupted",
] as const;
export type PartialCloseReason = (typeof PARTIAL_CLOSE_REASONS)[number];

/** The close reason when the row is genuinely PARTIAL, else `undefined` —
 *  door spec (2026-09-02) §1.1's four clauses, in the order they are
 *  cheapest to refute. Pure and framework-free on purpose: the server's
 *  list projection derives the same boolean, and the two surfaces must
 *  agree by construction rather than by two hand-kept copies of the rule
 *  (the divergence class that burned at `HistoryList.test.tsx:459`).
 *
 *  DETERMINISTIC: every input is a stored fact the machine or the rower
 *  produced; there is no threshold. `endedBy` owns HOW THE SESSION ENDED,
 *  `steps` owns WHAT WAS MEASURED, neither derives from the other, and
 *  they can legally disagree — a short step on a `finished` row is
 *  MEASUREMENT LOSS, not a stopped piece, and clause 4 excludes it. */
export function partialCloseReason(
  row: Pick<StoredLog, "source" | "steps" | "endedBy">,
): PartialCloseReason | undefined {
  // Clause 1 (spec §1.1): only the connected door stores planned-vs-
  // measured steps. `buildMonitorLogSteps` is the ONLY writer of
  // `actualMeters`/`actualSeconds` (`logDraft.ts:921-922`); a timer step
  // never rowed emits `actualSplit = targetSplit`, `actualSource:
  // "assumed"` — byte-identical to one rowed to plan. A timer row cannot
  // be partial in stored data at all: `/session/log` is reached only from
  // `isComplete(run)` (`Timer.tsx:477-483`) and the abandon path saves
  // nothing.
  if (row.source !== "pm5") return undefined;
  // Clause 2: a connected Just Row stores `steps: []` (`JustRowLog.tsx:209`)
  // and has no plan to be partial against. REDUNDANT given clause 3
  // (`[].some(...)` is false); kept as an explicit statement of the rule,
  // not as the thing that enforces it. MEASURED, not asserted: deleting
  // this line alone leaves the whole suite green (170/170 files,
  // 4591/4591 tests, mutation M3.1b), which is the evidence for the word
  // "redundant". Deleting it is therefore NOT a probe of the Just Row
  // leg — only clause 3 flipped to `.every` (so `[].every()` is `true`
  // and the empty case falls through) WITH this line gone makes that leg
  // red ("expected 'rower' to be undefined", M3.1c); `.every` on its own
  // leaves it green, because this line still catches it.
  if (row.steps.length === 0) return undefined;
  // Clause 3: an interval never reached carries no `actualSource` at all
  // (`logDraft.ts:924-928`, "Unambiguous against the row-local
  // discriminant"). `undefined` is the only absence the wire can produce —
  // `routes/data.ts:472-479` 400s an explicit null. This clause is also
  // what guarantees PARTIAL => N < M, so the rendered suffix can never
  // read `5 of 5`.
  if (!row.steps.some((s) => s.actualSource === undefined)) return undefined;
  // Clause 4: an ALLOWLIST of five, never `!== "finished"`.
  const endedBy = row.endedBy ?? null;
  return PARTIAL_CLOSE_REASONS.find((r) => r === endedBy);
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
//
// SHORTENED at Gate 0-A (door spec 2026-09-02, James APPROVED): it read
// "LINK LOST · the app lost the monitor before the end" from the
// cohort-unlock spec until now; the trailing clause goes so the combined
// PARTIAL line fits the header. The release note's promise
// (`news/content/releaseNotes.ts:366`, "LINK LOST appears on the session
// detail") is unchanged — the words `LINK LOST` and the trigger are what
// it promised.
// DECLARED FIRST: `CLOSE_REASON_WORDS` reads it in its initialiser, and a
// `const` below would be a TDZ ReferenceError at module load.
const LINK_LOST_LINE = "LINK LOST · the app lost the monitor";

// Gate 0-A (`docs/superpowers/specs/2026-09-02-door-gate-a.html`,
// decisions (a) and (e), APPROVED by James 2026-09-02): one row per close
// reason, the full sentence for the detail screen and a short form for the
// list row (`THE MONITOR DROPPED THE PROGRAM` is ~240px on a 332px row).
// Keyed by VALUE, so a future sixth close reason renders NOTHING rather
// than a wrong word.
const CLOSE_REASON_WORDS: Record<
  PartialCloseReason,
  { line: string; chip: string }
> = {
  rower: { line: "STOPPED EARLY", chip: "STOPPED EARLY" },
  "link-lost": { line: LINK_LOST_LINE, chip: "LINK LOST" },
  "program-dropped": {
    line: "THE MONITOR DROPPED THE PROGRAM",
    chip: "PROGRAM DROPPED",
  },
  "program-failed": {
    line: "THE PROGRAM DID NOT LOAD",
    chip: "PROGRAM NOT LOADED",
  },
  interrupted: { line: "LEFT UNFINISHED", chip: "UNFINISHED" },
};

// Door spec §1.2: `link-lost` keeps its OWN ungated, steps-independent
// trigger exactly as it has since the cohort-unlock spec — it is a
// release-noted promise and it renders on rows the PARTIAL predicate
// EXCLUDES (a link-lost Just Row; a link-lost row with every step
// measured), which is why the non-partial branch below is not simply
// "render nothing". The other four words render ONLY when all four
// clauses hold: a steps-independent `STOPPED EARLY` would print on every
// connected Just Row (`useMonitorSession.ts:5010`) and on every planned
// row Ended after its last interval. Both branches are value equalities,
// never negations, so a future sixth close reason renders nothing.
function buildCloseLine(row: StoredLog): string | undefined {
  const reason = partialCloseReason(row);
  if (reason === undefined) {
    return row.endedBy === "link-lost" ? LINK_LOST_LINE : undefined;
  }
  const measured = row.steps.filter(
    (s) => measuredElapsedSeconds(s) !== undefined,
  ).length;
  // "measured", never "progress" (Gate 0-A decision (b), approved on the
  // rendered frame): after a lost boundary (`logDraft.ts:806-809`) a rower
  // who did two and a bit reads `1 of 5`, true of what the machine
  // reported and silent about what was rowed. `N` calls
  // `measuredElapsedSeconds` — the stored door's own generalisation of the
  // live surface's `isMonitorRowMeasurable`/`timerMeasurableElapsedSeconds`
  // (see its doc comment above) and the same quantity the connected
  // surface's lost banner counts. There is no fourth definition.
  // PARTIAL => measured < steps.length by clause 3, so this can never read
  // `5 of 5`.
  return `${CLOSE_REASON_WORDS[reason].line} · ${measured} of ${row.steps.length} intervals measured`;
}

/** The short word the History chip carries for a close reason, or
 *  `undefined` for a value outside the allowlist. Shared with the detail
 *  line (one `CLOSE_REASON_WORDS` row per reason) so the two surfaces
 *  cannot name one close two ways. */
export function partialChipWord(
  endedBy: (CloseReason | "interrupted") | null | undefined,
): string | undefined {
  const reason = PARTIAL_CLOSE_REASONS.find((r) => r === endedBy);
  return reason === undefined ? undefined : CLOSE_REASON_WORDS[reason].chip;
}

/** THE LIST'S WHOLE RULE, in one place, so the two surfaces cannot
 *  disagree about the WORD. `link-lost` is UNGATED here exactly as it is
 *  in `buildCloseLine`: a link-lost row the PARTIAL predicate EXCLUDES —
 *  a link-lost Just Row, or one with every step measured — still reads
 *  `LINK LOST · the app lost the monitor` on the detail screen, so a chip
 *  gated on `partial` alone would leave History silent about the one row
 *  the detail screen shouts about. The other four words render only when
 *  the row is partial. Both branches are value equalities, never
 *  negations.
 *
 *  `partial` is the caller's own evaluation of `partialCloseReason` — the
 *  list row cannot compute it itself (`LOG_LIST_COLUMNS` carries `source`
 *  and `endedBy` but not `steps`), so the server derives it over the same
 *  four clauses and the list passes it in. */
export function historyChipWord(row: {
  partial: boolean;
  endedBy: (CloseReason | "interrupted") | null;
}): string | undefined {
  if (row.endedBy === "link-lost") return CLOSE_REASON_WORDS["link-lost"].chip;
  if (!row.partial) return undefined;
  return partialChipWord(row.endedBy);
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
  const closeLine = buildCloseLine(row);
  const planFooter = buildPlanFooter(row);
  return { meta, heroes, rows, caption, readBack, planFooter, closeLine };
}
