import TypeBadge from "../components/TypeBadge";
import { fmtDuration } from "../../domain/duration.js";
import FreeRowChip from "../workout/FreeRowChip";
import { fmtSplit } from "../../domain/format.js";
import { historyChipWord } from "./storedSummary";
import type { RecentLog } from "../api/useRecentLogs";

// From-the-log spec (2026-08-18), §1: "one row component, not two" — the
// history list reuses Today's LAST THREE row idiom (type badge, title, the
// segment-joined meta line) exactly, rather than a second, independently
// maintained near-copy. Today.tsx's own LAST THREE section and
// HistoryList.tsx both render this component; only the `hero` prop
// differs. Moved here (not left duplicated in Today.tsx) so the two never
// drift the way `.col-*`/`.set-toggle`/`.field-dur` did (CLAUDE.md's own
// recurring-failure #5, a different flavor of the same "two copies, one
// forgotten" class of bug).

// docs/design/README.md:185's LAST THREE row format, literally: type badge
// + title + "JUL 25 · HELD · 2/10" — a date (not days-ago), the plain
// word, and the pain figure. The handoff's own "2/10" is its unmodified
// 1-10 scale; docs/design/DEVIATIONS.md's first row establishes
// Ergomatic's is 1-5 everywhere else (PainBar, WorkoutDetail's "PAIN
// n/5", Library's own 1-5 PAIN filter cells) — matching the handoff's
// literal "/10" here would contradict that already-decided,
// already-documented scale, so this uses "/5" like every other pain
// display in the app.
const MONTH_ABBREV = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

function formatLogDate(loggedAt: string): string {
  const d = new Date(loggedAt);
  return `${MONTH_ABBREV[d.getMonth()]} ${d.getDate()}`;
}

// Hand-rolled thousands separator (matching `fmtSplit`/`fmtDuration`'s own
// house style of hand-rolled formatters, never `Intl`/`toLocaleString` —
// the runtime's default locale isn't guaranteed `en-US` across every
// environment this app's tests and builds run in, and a comma is the only
// separator the design ever shows).
function fmtMeters(meters: number): string {
  return meters.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// RC-5 (hero-truth design spec) §3, Task 4: the list's own tier gate,
// mirroring `storedSummary.ts`'s `buildHeroes` — TRUE exactly when the
// row carries the machine's own work totals (PR #190's pair, both
// non-null and `> 0`), the same gate that function uses to decide DISTANCE
// and to decide whether ANY avg-split fallback is forbidden.
function hasMachineTotals(log: RecentLog): boolean {
  return (
    log.machineWorkSeconds !== null &&
    log.machineWorkMeters !== null &&
    log.machineWorkSeconds > 0 &&
    log.machineWorkMeters > 0
  );
}

// RC-5 §3, Task 4: DISTANCE, tier-aware — parallel to `buildHeroes`'
// DISTANCE branch, minus the TIER B2 rung that function has and this one
// can't (`steps` is excluded from `LOG_LIST_COLUMNS` for size; see this
// module's header comment). A row that would land in the detail screen's
// TIER B2 (no machine totals, no RC-1 work pair, but steps carry
// `actualMeters`) falls through to FALLBACK here instead.
//
// **CORRECTED (Task 3 fix round 2, final whole-branch review, finding
// I1): the disagreement window is NOT "a CLOSED, ~16-day historical
// window that cannot grow" — that premise was false.**
// `computeWorkRestSums`/`appendSummaryObservations` (the work-pair and
// machine-totals writers) only ever fire for `"finished"`/`"rower"`
// closes, so any other non-finished/rower close (link-lost,
// program-failed, program-dropped, interrupted, burst-less-terminate) on a
// monitor row can NEVER carry either pair, forever — an ONGOING
// population, not a closed window. `storedSummary.ts`'s own TIER B2 now
// gates on `isReconstructableClose(row.endedBy)` for exactly this reason
// (fix round 2): it DECLINES to FALLBACK for that same ongoing
// population, reading the SAME stored, possibly-fused `distanceMeters`
// this list already does — so THIS list and the detail screen now AGREE
// on that population too, not just disagree-by-design. The remaining
// disagreement is genuinely bounded to the population `storedSummary.ts`'s
// TIER B2 (SAFE) branch still trusts Σ steps for: a row whose `endedBy`
// is `"finished"`/`null`/`undefined` AND predates RC-1 (2026-08-24) —
// the SAME closed 2026-08-08..2026-08-24 window fix round 1 originally
// (mis-)claimed for the WHOLE population. Pinned by its own dedicated
// test (`HistoryList.test.tsx`), not left to be discovered later.
//
//  TIER A — `hasMachineTotals`: the machine's own work meters, rounded —
//  byte-identical to `buildHeroes`' TIER A DISTANCE (both round the same
//  stored scalar).
//  TIER B1 — no machine totals, but `workSeconds`/`workMeters` (RC-1's
//  own pair) both present and `> 0`: the work meters, rounded — same
//  reasoning as TIER A, matching `buildHeroes`' TIER B1 DISTANCE.
//  FALLBACK — neither pair: the row's stored, possibly-fused
//  `distanceMeters`, unchanged. This is ALSO `buildHeroes`' own FALLBACK
//  (and its DECLINED TIER B2 — endedBy names an incomplete-by-
//  construction close — per the note above) — the two screens already
//  agree here, both reading the identical stored column. Only a TRUSTED
//  TIER B2 row (endedBy proves historical) still disagrees.
function heroDistanceMeters(log: RecentLog): number | undefined {
  if (hasMachineTotals(log)) {
    return Math.round(log.machineWorkMeters!);
  }
  if (
    log.workSeconds !== null &&
    log.workMeters !== null &&
    log.workSeconds > 0 &&
    log.workMeters > 0
  ) {
    return Math.round(log.workMeters);
  }
  return log.distanceMeters ?? undefined;
}

// RC-5 §3, Task 4: AVG SPLIT, tier-aware.
//
//  TIER A — `machineAvgPaceSecondsPer500m` (the narrow scalar projected
//  server-side, option (a)) when present and `> 0`; otherwise UNDEFINED —
//  **never** a fallback to `avgSplitSeconds` below, which can hold a
//  stale pre-hero-truth quotient on a build-738-era row (machine totals
//  present, the scalar absent because it predates Task 1). Printing that
//  old quotient beside a detail screen that renders nothing for the same
//  row is the exact defect this task exists to kill, one screen over
//  (Global Constraints: the PM5 truncates, we round).
//
//  TIER B1 / FALLBACK — the row's stored `avgSplitSeconds` column,
//  unchanged. This is safe (not a second, drifting quotient) because that
//  column is posted at live-save time by `monitorAvgSplit`
//  (`summaryModel.ts`) — a null-index/sub-threshold-excluding computation
//  that predates and is UNCHANGED by this phase (`storedSummary.ts`'s own
//  TIER B1 comment) — over the SAME underlying actuals the detail
//  screen's `tierBAvgSplitSeconds` independently recomputes from `steps`.
//  Both read the identical population by construction, so the two numbers
//  agree without this list needing `steps` at all (which
//  `LOG_LIST_COLUMNS` excludes for size) — proven for a shared exit-7
//  fixture in `HistoryList.test.tsx`'s own tier-B1 case.
//
//  **THAT PREMISE HAS ONE EXCEPTION, AND IT IS NOW HANDLED ON THE OTHER
//  SIDE (Phase JR PR 1, spec rev 4's F1).** "The identical population by
//  construction" assumes both sides have a population. A FREE ROW (Just
//  Row) stores `steps: []` — it prescribes nothing, so there is nothing to
//  fabricate — and an empty population is exactly what falsifies the
//  premise: this list still reads the stored column and shows a figure,
//  while the detail screen's `tierBAvgSplitSeconds` returned `undefined`
//  and showed NOTHING. This list is unchanged; `storedSummary.ts`'s TIER
//  B1 now falls back to the same stored column when `steps` carries no PM5
//  rows, which restores the agreement. Pinned across BOTH screens by
//  `HistoryList.test.tsx`'s free-row case (exit criterion 7), whose two
//  expectations are derived from one `buildStoredSummary` result so a
//  change to the stored value must move both or fail. For a FALLBACK
//  row (no machine totals, no work pair — a timer/manual row, a legacy
//  monitor row, or a TIER B2 row per `heroDistanceMeters`' own note),
//  this is ALSO `buildHeroes`' own FALLBACK avg split, so the two screens
//  already agree there too.
function heroAvgSplitSeconds(log: RecentLog): number | undefined {
  if (hasMachineTotals(log)) {
    return log.machineAvgPaceSecondsPer500m !== null &&
      log.machineAvgPaceSecondsPer500m > 0
      ? log.machineAvgPaceSecondsPer500m
      : undefined;
  }
  return log.avgSplitSeconds ?? undefined;
}

// Spec §5G: `AVG 2:04.5 · 5,000 m` from the tier-resolved numbers above,
// each segment independently absent when its underlying value is
// undefined, the whole snippet absent (returns "") when both are — the
// same absence idiom §2B's stored-hero block already uses (old rows read
// back null everywhere). TIME is deliberately not part of THAT snippet —
// §5G's own literal example carries only AVG and DISTANCE.
//
// ONE EXCEPTION (timer-mode spec 2026-09-02, ruling 4; `History.dc.html`):
// a row with NEITHER an average NOR a distance but a stored `timeSeconds`
// — the phone-timed free row, whose only number IS its time — prints
// `TIME m:ss` here instead, the detail door's own label (`JustRowLog`'s
// TIME card, formatted by the same `fmtDuration`). It fills the line §5G
// would leave empty and touches no row that has an AVG or DISTANCE
// segment: a connected free row keeps `AVG · m`, a workout row keeps its
// pair, and a row with no time at all keeps its bare meta line (never a
// placeholder). `RecentLog.timeSeconds` was already on the wire
// (`useRecentLogs.ts`); nothing new is projected.
function heroSnippet(log: RecentLog): string {
  const avgSplitSeconds = heroAvgSplitSeconds(log);
  const distanceMeters = heroDistanceMeters(log);
  if (
    avgSplitSeconds === undefined &&
    distanceMeters === undefined &&
    log.timeSeconds !== null
  ) {
    return `TIME ${fmtDuration(log.timeSeconds / 60)}`;
  }
  return [
    avgSplitSeconds !== undefined ? `AVG ${fmtSplit(avgSplitSeconds)}` : null,
    distanceMeters !== undefined ? `${fmtMeters(distanceMeters)} m` : null,
  ]
    .filter((segment): segment is string => segment !== null)
    .join(" · ");
}

/** One LAST THREE / history row's CONTENT (type badge, title, meta line,
 *  optional hero snippet) — the caller supplies the wrapping element
 *  (`<li>`/`<Link>`), same "content only" split `ArticleRow`'s own family
 *  in News.tsx doesn't need (News's rows never get reused elsewhere), but
 *  this one does. `hero` (default false, Today's own rows never set it)
 *  adds the §5G snippet line as a fourth flex child — `.today-log-row`
 *  carries `flex-wrap: wrap` (index.css) specifically so this optional
 *  4th item drops to its own line via `flex-basis: 100%` without
 *  disturbing the existing 3-child single-line layout Today's rows have
 *  always used (their 3 children never fill a row's full width, so they
 *  never wrap regardless). */
export function LogRow({
  log,
  hero = false,
}: {
  log: RecentLog;
  hero?: boolean;
}) {
  const snippet = hero ? heroSnippet(log) : "";
  // Door spec (2026-09-02) §1.3: the short word for a session that
  // stopped early, decided ONCE in `storedSummary.ts` and shared with the
  // detail screen's own close line, so the two surfaces cannot name one
  // close two ways. `link-lost` is ungated on `partial` there for the same
  // reason it is ungated on the detail screen.
  //
  // `hero`-gated, and Today's rows never set `hero`: Gate 0-A slot B put
  // the chip BESIDE THE NUMBERS it qualifies, and Today's LAST THREE rows
  // render no numbers line at all. James approved that slot knowing Today
  // stays silent; `Today.test.tsx` pins the cost so it cannot drift in by
  // accident.
  const chip = hero ? historyChipWord(log) : undefined;
  return (
    <>
      <TypeBadge type={log.workoutType} />
      {/* The JR chip, in the SAME slot: `TypeBadge` returns null for a null
          type and the chip returns null unless the PAIR is null, so exactly
          one of the two renders — a free row wears JR, a deleted-workout
          retry row (null id, surviving type) keeps its type badge. */}
      <FreeRowChip workoutId={log.workoutId} workoutType={log.workoutType} />
      <span className="today-log-title">{log.workoutTitle}</span>
      <span className="today-log-meta">
        {/* R-A: held/pain are nullable ahead of the write side that can
            produce a null row - each segment renders only when present
            (the F1 no-dash rule), joined by " · ". */}
        {[
          formatLogDate(log.loggedAt),
          log.held === null ? null : log.held.toUpperCase(),
          log.pain === null ? null : `${log.pain}/5`,
        ]
          .filter((segment) => segment !== null)
          .join(" · ")}
      </span>
      {/* A DELIBERATE WIDENING of this line's old `snippet !== ""` gate: a
          partial row with no hero numbers would otherwise say NOTHING in
          History, which is the exact silence this spec exists to break.
          That one shape (chip alone on the line) is not on Gate 0-A's
          artboard and is named in the PR's risk note. */}
      {(snippet !== "" || chip !== undefined) && (
        <span
          className={`today-log-hero${
            chip !== undefined ? " today-log-hero-chipped" : ""
          }`}
        >
          {chip !== undefined && (
            <span className="log-partial-chip">{chip}</span>
          )}
          {snippet}
        </span>
      )}
    </>
  );
}
