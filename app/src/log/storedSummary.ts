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
//
// WARM-UP: stored `steps` never carries a warm-up row at all — neither
// `buildMonitorLogSteps` nor `buildLogSteps` ever pushes one (module
// header comments, `session/logDraft.ts`: "Warmup intervals produce NO
// step" / "Warm-up and rest phases never become a LogStep"). §5C's own
// text ("fed by stored steps") already implies this; this module's row
// builder therefore never emits `isWarmup: true` — there is nothing in
// the stored shape for it to derive one from.

import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import { PLANS } from "../../domain/plans.js";
import type { WorkoutType } from "../../domain/types.js";
import type { HeldResult, Thumbs } from "../api/useRecentLogs";
import type { SeriesData } from "../monitor/seriesRecorder.js";
import { formatLogDate } from "../session/logDraft";
import {
  buildSpmCell,
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
 *  fetch. `planKey` is a bare `string | null`, not `PlanCode`/`PlanKey`:
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

// §5B: "fed by the STORED three; per-cell absence identical" — each
// field independently `undefined` when its own stored number is `null`,
// exactly `SummaryHeroes`' own per-hero absence contract (never a
// fabricated `0:00`/`0 m`). `?? undefined` turns the stored `null` into
// the interface's own absence value.
function buildHeroes(row: StoredLog): SummaryHeroes {
  return {
    avgSplit:
      row.avgSplitSeconds !== null ? fmtSplit(row.avgSplitSeconds) : undefined,
    avgSplitSeconds: row.avgSplitSeconds ?? undefined,
    time:
      row.timeSeconds !== null ? fmtDuration(row.timeSeconds / 60) : undefined,
    timeSeconds: row.timeSeconds ?? undefined,
    distanceMeters: row.distanceMeters ?? undefined,
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
    const timeLabel = fmtDuration(elapsed / 60);
    const paceLabel =
      step.actualSplit !== undefined ? fmtSplit(step.actualSplit) : undefined;
    const targetLabel =
      step.targetSplit !== undefined ? fmtSplit(step.targetSplit) : undefined;
    return {
      measured: true,
      isWarmup: false,
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
  const planFooter = buildPlanFooter(row);
  return { meta, heroes, rows, caption, readBack, planFooter };
}
