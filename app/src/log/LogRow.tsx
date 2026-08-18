import TypeBadge from "../components/TypeBadge";
import { fmtSplit } from "../../domain/format.js";
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

// Spec §5G: `AVG 2:04.5 · 5,000 m` from the stored numbers, each segment
// independently absent when its underlying value is null, the whole
// snippet absent (returns "") when both are — the same absence idiom
// §2B's stored-hero block already uses (old rows read back null
// everywhere). TIME is deliberately not part of this snippet — §5G's own
// literal example carries only AVG and DISTANCE.
function heroSnippet(log: RecentLog): string {
  return [
    log.avgSplitSeconds !== null
      ? `AVG ${fmtSplit(log.avgSplitSeconds)}`
      : null,
    log.distanceMeters !== null ? `${fmtMeters(log.distanceMeters)} m` : null,
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
  return (
    <>
      <TypeBadge type={log.workoutType} />
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
      {snippet !== "" && <span className="today-log-hero">{snippet}</span>}
    </>
  );
}
