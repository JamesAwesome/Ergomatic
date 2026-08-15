import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkouts } from "../api/useWorkouts";
import type { LibraryWorkout } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { usePlan } from "../api/usePlan";
import type { PlanData } from "../api/usePlan";
import { usePreferences } from "../api/usePreferences";
import type { PreferencesData } from "../api/usePreferences";
import { useRecentLogs } from "../api/useRecentLogs";
import type { RecentLog } from "../api/useRecentLogs";
import { fmtDuration } from "../../domain/duration.js";
import { estimateMinutes } from "../../domain/expand.js";
import { suggest, suggestFreestyle } from "../../domain/suggest.js";
import type { LibraryEntry, SuggestPrefs } from "../../domain/suggest.js";
import {
  pieceList,
  peakIndex,
  workAndTotal,
} from "../../domain/display/stepDetail.js";
import type { PieceRow } from "../../domain/display/stepDetail.js";
import type {
  Baselines,
  Difficulty,
  Step,
  WorkoutType,
} from "../../domain/types.js";
import type { PlanCode } from "../../domain/plans.js";
import {
  ONBOARDING_TITLES,
  isOnboardingTitle,
} from "../../domain/onboarding.js";
import { clearDraft, loadDraft } from "../session/draft";
import { loadRun, type SessionRun } from "../session/run";
import { loadMonitorRun } from "../monitor/monitorRun";
import { useStagedDiscard } from "../session/useStagedDiscard";
import StartHere from "./StartHere";
import BaselineCard from "./BaselineCard";
import { loadTodayPick, saveTodayPick, todayDateString } from "./todayPick";
import {
  loadTodayOverrides,
  saveTodayOverrides,
  bucketsForCap,
  type TodayOverrides,
} from "./todayOverrides";
import {
  todayFilterTokens,
  type TodayFilterDefaults,
} from "./todayFilterTokens";
import TodayFilterSheet, { type TodayFilterDraft } from "./TodayFilterSheet";
import TypeBadge from "../components/TypeBadge";
import { TokenRow } from "../components/TokenRow";
import { TYPE_WORDS } from "../components/typeWords";

// Chip order: O2, AT, TR, AN — the pyramid's base-first order, matching
// Library's own FilterSheet.tsx and Builder's ClassificationCard.tsx TYPE
// cells (docs/design/README.md §Screens → "2. Library", amended 2026-08-08:
// James's ordering decision unifies every left-to-right type row app-wide).
const TYPE_CHIPS: WorkoutType[] = ["O2", "AT", "TR", "AN"];

// CSS custom property per workout type — never a raw hex (tokens.css). Kept
// local rather than shared with ClassificationCard.tsx's own identical map:
// this repo's established per-file duplication convention (that file's own
// comment on TYPE_COLOR_VAR explains the precedent — Builder.tsx, PainBar.tsx
// and TypeBadge.tsx each already keep their own copy).
const TYPE_COLOR_VAR: Record<WorkoutType, string> = {
  O2: "--type-o2",
  AT: "--type-at",
  AN: "--type-an",
  TR: "--type-tr",
};

// The day's "no filter" difficulty baseline (todayFilterTokens.ts's own
// TodayFilterDefaults, "Active" rule per the collapsible-filter spec) —
// always the full set, independent of the account's own (possibly
// narrower) server preference, which only seeds the INITIAL overrides
// record below, a separate concern.
const ALL_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** Local chip button — same `.chip` class + `aria-pressed` rendering
 *  convention Library's own filter controls use, not a shared component.
 *  Today's only remaining consumer is the type-swap row (Task 2, 2026-08-04
 *  round: DIFFICULTY/TIME/PAIN's own inline chips moved into
 *  TodayFilterSheet.tsx's CellGrid instances, which render through
 *  CellGrid's own cell button, not this one) — every caller here passes
 *  `typeColorVar`, mirroring ClassificationCard.tsx's own inline-style-
 *  when-selected treatment for TYPE, so the same chip reads identically
 *  whether the rower is filtering here or authoring in the builder. */
function TodayChip({
  label,
  active,
  onClick,
  typeColorVar,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  typeColorVar?: string;
}) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={active}
      style={
        active && typeColorVar
          ? {
              background: `var(${typeColorVar})`,
              borderColor: `var(${typeColorVar})`,
              color: "var(--on-color)",
            }
          : undefined
      }
      onClick={onClick}
    >
      {label}
    </button>
  );
}

const STALE_DRAFT_MS = 24 * 60 * 60 * 1000;

// docs/design/README.md:185's LAST THREE row format, literally: type badge +
// title + "JUL 25 · HELD · 2/10" — a date (not days-ago), the plain word,
// and the pain figure. The handoff's own "2/10" is its unmodified 1-10
// scale; docs/design/DEVIATIONS.md's first row establishes Ergomatic's is
// 1-5 everywhere else (PainBar, WorkoutDetail's "PAIN n/5", Library's own
// 1-5 PAIN filter cells) — matching the handoff's literal "/10" here would
// contradict that already-decided, already-documented scale, so this uses
// "/5" like every other pain display in the app.
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

/** Wall-clock time since a LIVE run started (F2, whole-branch review: the
 *  resume card's own elapsed-so-far reading) — `now - startedAt`, the same
 *  "real time, including any pauses" convention SessionComplete.tsx's own
 *  `totalElapsedSeconds` documents for a FINISHED run's `completedAt -
 *  startedAt`. That one can't be reused here: `completedAt` is null by
 *  construction of every caller (this only ever runs against a run
 *  `TodayView` already confirmed is still live, never a completed one).
 *  Never negative (defensive floor, same discipline as `engine.ts`'s own
 *  `phaseElapsedMs`). */
// eslint-disable-next-line react-refresh/only-export-components
export function elapsedSinceStart(run: SessionRun, now: Date): number {
  const ms = now.getTime() - new Date(run.startedAt).getTime();
  return Math.max(0, Math.round(ms / 1000));
}

// Baselines unset (a brand-new account) means estimateMinutes cannot
// resolve a single work step's split — it would throw, not return an
// estimate. The suggestion card still has to render in that state (reason
// without a target preview), and suggest()/suggestFreestyle()'s duration-
// bucket filter needs *some* estMinutes number per entry. Building
// estMinutes as 0 here does NOT by itself make the filter harmless the way
// it did under the old single-value cap (0 <= any positive cap,
// unconditionally): `bucketFor(0)` is `"<30"`, a real bucket a narrower
// `durations` selection (e.g. `["45-60"]`) would legitimately exclude,
// wrongly treating an UNKNOWABLE duration as a known short one. What
// actually keeps the filter harmless is passing `durationsUnknown: true`
// in prefs below — domain/suggest.ts's own `passesDurationFilter` skips
// the bucket check ENTIRELY when that flag is set, regardless of which
// bucket the 0 placeholder resolves to (SuggestPrefs' own doc comment
// spells out why the placeholder value alone can no longer carry this).
// The same flag also keeps the reason text honest, unchanged from before:
// without it, the standard/fellback reasons would claim a duration was
// actually checked when every one fed in was a placeholder.
function toLibraryEntry(
  w: LibraryWorkout,
  baselines: Baselines | null,
): LibraryEntry {
  return {
    id: w.id,
    type: w.type,
    difficulty: w.difficulty,
    pain: w.pain,
    estMinutes: baselines ? estimateMinutes(w.steps, baselines).minutes : 0,
    lastDoneDaysAgo: w.lastDoneDaysAgo,
    // Round 2 (2026-08-04): passed straight through so domain/suggest.ts's
    // own SOURCE predicate can tell a global (starter-library) entry apart
    // from a personal one — mirrors the Library's own LibraryWorkout.isGlobal
    // exactly.
    isGlobal: w.isGlobal,
  };
}

/** The suggest()/suggestFreestyle() call TodayView makes for its own
 *  (applied) `overrides`, extracted as a pure module-scope helper — Task 2
 *  (2026-08-04 round) needs the EXACT SAME call runnable against
 *  TodayFilterSheet's in-progress DRAFT too (the sheet's live `Show N
 *  options` count), and a pure function both call sites can share is
 *  simpler than lifting suggestion state up out of TodayView. */
function computeSuggestion(
  filters: Pick<
    TodayOverrides,
    "difficulties" | "durations" | "painLevels" | "lastDone" | "source"
  >,
  entries: LibraryEntry[],
  baselines: Baselines | null,
  todayCode: PlanCode | null,
  pickOverride: string | null,
) {
  const prefs: SuggestPrefs = {
    difficulties: filters.difficulties,
    durations: filters.durations,
    painLevels: filters.painLevels,
    // Round 2 (2026-08-04): the two new dims — see domain/suggest.ts's own
    // SuggestPrefs doc comment for why they're optional there (the server's
    // /api/today route has no equivalent) even though Today always sets a
    // real value (possibly null) here.
    lastDone: filters.lastDone,
    source: filters.source,
    // See toLibraryEntry's comment: with no baselines, every entry's
    // estMinutes is a 0 placeholder. This flag does double duty in
    // domain/suggest.ts — it skips the duration-bucket FILTER entirely
    // (not just the reason text) so the placeholder's own bucket
    // (`bucketFor(0)` is `"<30"`) never wrongly includes or excludes an
    // unknown-duration entry, and it keeps the reason text from claiming a
    // duration was actually checked against a real number.
    durationsUnknown: baselines === null,
  };
  // Narrowing on todayCode (rather than a separate boolean) lets TS see
  // `suggest`'s todayCode argument is non-null in the true branch with no
  // assertion.
  return todayCode !== null
    ? suggest({
        todayCode,
        library: entries,
        prefs,
        todayPickId: pickOverride ?? undefined,
      })
    : suggestFreestyle(entries, prefs, pickOverride ?? undefined);
}

/** TodayFilterSheet's own live pool count: the same call above, run
 *  against the sheet's draft rather than the applied overrides, reduced to
 *  just the pool size — the count TodayFilterSheet's own live-count caption
 *  renders (Revision, mid-round: the primary button itself is now the
 *  constant "Apply Filter", no count of its own). */
function poolCountFor(
  draft: Pick<
    TodayOverrides,
    "difficulties" | "durations" | "painLevels" | "lastDone" | "source"
  >,
  entries: LibraryEntry[],
  baselines: Baselines | null,
  todayCode: PlanCode | null,
  pickOverride: string | null,
): number {
  return computeSuggestion(draft, entries, baselines, todayCode, pickOverride)
    .poolIds.length;
}

export default function Today() {
  const workoutsState = useWorkouts();
  const baselinesState = useBaselines();
  const planState = usePlan();
  const preferencesState = usePreferences();
  const recentLogsState = useRecentLogs(3);

  // Lazy initializer, same read-once-at-mount idiom every session screen
  // uses (Countdown.tsx/Timer.tsx's own comment on this): F2's cold-start
  // resume card (below, via `TodayView`) needs whatever run record already
  // exists — live (`completedAt === null`) or completed-but-unlogged — the
  // instant this screen mounts, which is exactly the moment a cold start
  // (the OS killed the app mid-session; nothing else in the client ever
  // surfaces this) lands the rower here with no other path back in.
  const [run] = useState<SessionRun | null>(() => loadRun());

  // A draft older than 24h with startedAt still null was abandoned mid-
  // confirm and never started — discard it with no ceremony (spec: "Deep-
  // link/reload rules"). A started draft (startedAt set) is left alone even
  // if old; 6B owns what happens to an in-progress session.
  //
  // Fast-follow Task 4 (spec §3, adversarial B1): `startedAt` is now
  // stamped at EVERY rewired entry point (`useStartWorkout.ts`'s
  // `confirmReplace`, `WorkoutDetail.tsx`'s `handleRowInstead`) — the
  // instant a fresh draft is built and saved, never later. So `draft &&
  // draft.startedAt === null` can no longer describe a draft the CURRENT
  // app itself ever writes; the only way to land here is a draft this
  // client saved BEFORE that stamp moved (a pre-upgrade localStorage
  // value), which this guard still discards correctly once it's 24h stale.
  //
  // Phase 6B Task 4 amendment: a completed-but-unlogged run record (`run.ts`
  // — Timer/SessionComplete both deliberately keep it, for 6C's still-
  // unbuilt "log this session" screen) protects its draft from this discard
  // regardless of age, one further exception layered onto the same rule.
  // Doubly inert since fast-follow Task 4 (see above): the edge case it
  // used to guard — the rower completes session A (leaving draft A + run A
  // both in storage on purpose), then opens a DIFFERENT workout and taps
  // Start before ever logging A, overwriting the draft key with a fresh
  // draft B while run A's own completedAt is still sitting there — no
  // longer produces an UNSTARTED draft B either, so the first condition
  // already excludes it on its own now, same as the completion case always
  // did. Left in place rather than removed: it still protects a legacy
  // pre-upgrade unstarted draft B against the identical race, and deleting
  // a defensive check because its normal-flow trigger became unreachable
  // is exactly the kind of "simplicity over precision" tradeoff this
  // codebase's own convention is to keep, not silently narrow.
  //
  // Phase 7A Task 5 amendment: a LIVE monitor run (`monitorRun.ts` —
  // `completedAt === null`, a workout currently being run by a connected
  // PM5 rather than the phone's own timer) gets its own, symmetric-but-
  // distinct exception, layered on top of the two above rather than
  // replacing either. Distinct on purpose: a monitor-driven session (7B)
  // has no reason to have set the phone-side draft's `startedAt` at all —
  // the PM5 owns pacing, not this screen's own Start flow — so a stale,
  // never-started draft sitting here while the erg is mid-workout is
  // exactly the case the FIRST condition (`draft.startedAt === null`)
  // would otherwise let straight through to a wipe. Checked here directly
  // rather than through `anyLiveSession()` (`monitorRun.ts`): that
  // function's own truth table treats a completed-but-unlogged monitor run
  // the same as absent (nothing LIVE), which is right for a resume-style
  // caller but wrong here — this guard is answering "is the erg possibly
  // still running", not "should a resume card show." 7B's own guard
  // rewiring is expected to consume `anyLiveSession()` mechanically where
  // that distinction doesn't matter; this one 7A-owned line does not.
  useEffect(() => {
    const draft = loadDraft();
    const monitorRun = loadMonitorRun();
    const monitorRunIsLive =
      monitorRun !== null && monitorRun.completedAt === null;
    if (
      draft &&
      draft.startedAt === null &&
      Date.now() - new Date(draft.createdAt).getTime() > STALE_DRAFT_MS &&
      // `?? null`, not a bare `?.completedAt === null`: no run record at
      // all (the ordinary never-started-draft case this rule has always
      // covered) must still discard — only an ACTUAL completed run should
      // protect, not the absence of one coalescing to a false negative.
      (loadRun()?.completedAt ?? null) === null &&
      !monitorRunIsLive
    ) {
      clearDraft();
    }
  }, []);

  if (
    workoutsState.state === "loading" ||
    baselinesState.state === "loading" ||
    planState.state === "loading" ||
    preferencesState.state === "loading" ||
    recentLogsState.state === "loading"
  ) {
    return (
      <main className="screen">
        <h1 className="screen-title">Today</h1>
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (workoutsState.state === "error") {
    return (
      <ErrorScreen
        message="Couldn't load your library."
        retry={workoutsState.retry}
      />
    );
  }
  if (baselinesState.state === "error") {
    return (
      <ErrorScreen
        message="Couldn't load your baselines."
        retry={baselinesState.retry}
      />
    );
  }
  if (planState.state === "error") {
    return (
      <ErrorScreen message="Couldn't load your plan." retry={planState.retry} />
    );
  }
  if (preferencesState.state === "error") {
    return (
      <ErrorScreen
        message="Couldn't load your preferences."
        retry={preferencesState.retry}
      />
    );
  }
  if (recentLogsState.state === "error") {
    return (
      <ErrorScreen
        message="Couldn't load your recent sessions."
        retry={recentLogsState.retry}
      />
    );
  }

  // A partially-set baseline pair (e.g. a brand-new account) is treated the
  // same as "unknown" — same convention as Library.tsx/WorkoutDetail.tsx.
  const baselines: Baselines | null =
    baselinesState.baselines.k2Seconds !== null &&
    baselinesState.baselines.k6Seconds !== null
      ? {
          k2Seconds: baselinesState.baselines.k2Seconds,
          k6Seconds: baselinesState.baselines.k6Seconds,
        }
      : null;

  // key={} forces a fresh TodayView (and thus fresh pickOverride/overrides/
  // shuffle state) whenever the plan's identity or position changes
  // underneath — same reasoning as WorkoutDetail.tsx's key={workout.id}.
  // TodayView builds its own SuggestPrefs from the sheet-edited overrides
  // below (Task 2, 2026-08-04 round: FILTER ⌄ + TodayFilterSheet, replacing
  // the old inline chips); it still needs the raw server preferences to
  // seed those overrides' defaults on first mount
  // (bucketsForCap(preferences.timeCapMinutes), preferences.difficulties) and
  // `baselines` to compute durationsUnknown itself, so both are passed
  // through rather than a pre-built SuggestPrefs.
  return (
    <TodayView
      key={`${planState.plan.planKey}-${planState.plan.doneN}`}
      library={workoutsState.workouts}
      baselines={baselines}
      k6Missing={baselinesState.baselines.k6Seconds === null}
      k2Missing={baselinesState.baselines.k2Seconds === null}
      preferences={preferencesState.preferences}
      onDismissStartHere={() =>
        preferencesState.save({ startHereDismissed: true })
      }
      plan={planState.plan}
      logs={recentLogsState.logs}
      run={run}
    />
  );
}

function ErrorScreen({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <main className="screen">
      <h1 className="screen-title">Today</h1>
      <p className="mono-status">{message}</p>
      <button type="button" className="button-outline" onClick={retry}>
        Retry
      </button>
    </main>
  );
}

/** The completed-but-unlogged line's own Discard (Task 3, ui-fix round;
 *  DESIGN.md "Items 2 + 3" — "Today's unlogged row"). Split out as its own
 *  component (not inlined in `TodayView`) specifically so its
 *  `useStagedDiscard`/`dismissed` state lives in a subtree TodayView never
 *  re-renders as a side effect of — see the render-site comment on why that
 *  matters for the suggestion card.
 *
 *  Arming swaps the ROW'S CONTENTS, not its layout: the DEFAULT state's
 *  "{title}: unlogged session." line, "Log it" link, and outlined ✕ button
 *  become the ARMED state's "Discard {title} without logging?" line and a
 *  single solid-accent "Tap again" button — same `.today-unlogged-line`
 *  wrapper, same border-box sizing, so the row's height and position never
 *  move (the mockup's own DEFAULT/ARMED pair, implemented as one row).
 *  Firing removes the row in place (`dismissed`) with no navigation — unlike
 *  SessionComplete's/the Log screen's own Discard, which both leave this
 *  screen entirely. */
function UnloggedRow({ run }: { run: SessionRun }) {
  const discard = useStagedDiscard();
  const [dismissed, setDismissed] = useState(false);
  const armedButtonRef = useRef<HTMLButtonElement>(null);

  // Fix round 1 (reviewer M1): arming swaps in a STRUCTURALLY DIFFERENT
  // element (a bare `<button>` replacing a `<div><Link/><button/></div>`),
  // unlike SessionComplete's own single button whose class/copy just
  // changes in place — React unmounts the pressed ✕ and mounts a brand-new
  // "Tap again" node at the same tree position, which does NOT inherit
  // focus (measured: the real activeElement fell back to `<body>`).
  // Without an explicit re-focus here, `onBlur` below can never fire from
  // a real tap-away — nothing is focused for a later blur to leave.
  // Focusing the new node the instant it mounts restores the same "focus
  // follows the armed control" behavior SessionComplete/WorkoutDetail get
  // for free from keeping one DOM node armed in place.
  useEffect(() => {
    if (discard.armed) armedButtonRef.current?.focus();
  }, [discard.armed]);

  if (dismissed) return null;

  function handleClick() {
    if (discard.armed) {
      discard.fire();
      setDismissed(true);
    } else {
      discard.arm();
    }
  }

  return (
    <div
      className={
        discard.armed
          ? "today-unlogged-line today-unlogged-line-armed"
          : "today-unlogged-line"
      }
    >
      {discard.armed ? (
        <>
          <p className="today-unlogged-text">
            Discard <strong>{run.title}</strong> without logging?
          </p>
          <button
            type="button"
            ref={armedButtonRef}
            className="today-unlogged-discard-armed"
            onClick={handleClick}
            onBlur={discard.disarm}
          >
            Tap again
          </button>
        </>
      ) : (
        <>
          <p className="today-unlogged-text">
            <strong>{run.title}</strong>: unlogged session.
          </p>
          <div className="today-unlogged-actions">
            {/* The run record is the source LogSession.tsx itself reads, so
                this link carries no state/params of its own. */}
            <Link to="/session/log" className="today-unlogged-link">
              Log it
            </Link>
            <button
              type="button"
              className="today-unlogged-discard"
              onClick={handleClick}
              onBlur={discard.disarm}
              aria-label="Discard without logging"
            >
              ✕
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Task 2 (2026-08-10 workout-step-detail spec §2): the Today card's piece
// region — a row per RUN of pieces (identical consecutive pieces roll into
// one row with a count, 2026-08-11 spec) between the meta line and the
// reason foot, built
// on Task 1's pure domain/display/stepDetail.ts exports. Four rows visible
// at most; beyond that the rows compress to one line each (spec: "5+
// pieces") and a non-interactive "+N more pieces" row replaces the rest —
// the card's own Link is still the only tap target in here, nothing nests.
const PIECE_CAP = 4;

// Task 2 (2026-08-11 piece-rollup spec, rule 7): a rolled row (`count` > 1)
// prefixes "N × " to its duration in the SAME slot a lone piece's bare
// duration occupies — everything else about the row (ref text, rest, spm,
// split) is already the run's shared value by construction (`rollRuns`
// keeps the first row's fields; the identity check that formed the run
// guarantees every joined piece agreed on them). U+00D7 with single spaces,
// exactly the Library line's own idiom (`structureLine`'s
// `${real.length} × ${pieceToken(...)}` — same character, same spacing).
function pieceToken(row: PieceRow): string {
  return row.count > 1 ? `${row.count} × ${row.duration}` : row.duration;
}

function TodayPieceRow({
  row,
  numeral,
  compact,
  peak,
}: {
  row: PieceRow;
  numeral: string;
  compact: boolean;
  peak: boolean;
}) {
  // One ref form in BOTH layouts (James, 2026-08-14): the compressed row
  // used to swap in an offset-only string ("at +12") whenever the set
  // shared one base, and nothing else on the card named that base — so
  // the rower could not tell a 2k piece from a 6k one. `compact` still
  // decides the row's class and geometry below; only the ref text stopped
  // varying.
  const refText = row.refTextFull;
  // Effort pieces carry their word ("ALL OUT"/"EASY") in the SAME slot a
  // split target would occupy (Task 1's own PieceRow doc comment: "in the
  // pace slot") — test pieces have neither and the slot renders empty.
  const rightSlot = row.effortText ?? row.split;
  const rowClass =
    (compact ? "today-piece-row-compact" : "today-piece-row") +
    (peak ? " today-piece-peak" : "");

  const text = (
    <span className="today-piece-text">
      {pieceToken(row)}
      {refText !== null && (
        <>
          {" "}
          <span className="today-piece-ref">
            {refText}
            {row.restText !== null ? "," : ""}
          </span>
        </>
      )}
      {row.restText !== null && (
        <>
          {" "}
          <span className="today-piece-rest">{row.restText}</span>
        </>
      )}
    </span>
  );

  if (compact) {
    return (
      <div className={rowClass}>
        <span className="today-piece-numeral">{numeral}</span>
        {text}
        {row.spm !== null && <span className="today-piece-spm">{row.spm}</span>}
        {rightSlot !== null && (
          <span className="today-piece-split">{rightSlot}</span>
        )}
      </div>
    );
  }

  return (
    <div className={rowClass}>
      <div className="today-piece-row-main">
        <span className="today-piece-numeral">{numeral}</span>
        {text}
        {rightSlot !== null && (
          <span className="today-piece-split">{rightSlot}</span>
        )}
      </div>
      {row.spm !== null && (
        <span className="today-piece-spm-line">{row.spm} SPM</span>
      )}
    </div>
  );
}

function PieceRegion({
  steps,
  baselines,
}: {
  steps: Step[];
  baselines: Baselines;
}) {
  const rows = pieceList(steps, baselines);
  const peak = peakIndex(rows, PIECE_CAP);
  const { workMinutes, totalMinutes } = workAndTotal(steps, baselines);
  const visible = rows.slice(0, PIECE_CAP);
  const hidden = rows.slice(PIECE_CAP);
  // Piece-rollup spec rule 4: the two-line/compressed threshold and the cap
  // both count ROWS (post-roll `pieceList` output), unchanged from before
  // this feature — a rolled row already stands for its own N pieces, it
  // does not inflate the row count that drives this layout decision.
  const compact = rows.length >= 5;
  // The "+N more pieces" row counts remaining PIECES, not rows (spec rule
  // 4): a hidden rolled row stands for `count` pieces, not one.
  const hiddenPieceCount = hidden.reduce((sum, r) => sum + r.count, 0);
  // The foot's "· N PIECES" suffix (spec rule 5) names TOTAL pieces the
  // same way — the count it named before rolling existed (one row per
  // piece, so `rows.length` and this sum agreed by construction); summing
  // every row's `count` keeps that number true now that rows can stand for
  // more than one piece each.
  const totalPieceCount = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="today-pieces">
      {visible.map((row, i) => (
        <TodayPieceRow
          key={i}
          row={row}
          numeral={String(i + 1).padStart(2, "0")}
          compact={compact}
          peak={i === peak}
        />
      ))}
      {hidden.length > 0 && (
        <div className="today-piece-more">
          <span className="today-piece-more-glyph">+</span>
          <div className="today-piece-more-text">
            <span className="today-piece-more-title">
              {hiddenPieceCount} more piece{hiddenPieceCount === 1 ? "" : "s"}
            </span>
            <span className="today-piece-more-sub">
              {hidden
                .slice(0, 3)
                .map((r) => pieceToken(r))
                .join(" · ")}
              {hidden.length > 3 ? " …" : ""}
            </span>
          </div>
          <span className="today-piece-more-arrow">›</span>
        </div>
      )}
      <div className="today-piece-foot">
        <span className="today-piece-foot-work">{workMinutes}′ WORK</span>
        <span className="today-piece-foot-total">{totalMinutes}′ TOTAL</span>
        {rows.length > PIECE_CAP && (
          <span className="today-piece-foot-count">
            · {totalPieceCount} PIECES
          </span>
        )}
      </div>
    </div>
  );
}

function TodayView({
  library,
  baselines,
  k6Missing,
  k2Missing,
  preferences,
  onDismissStartHere,
  plan,
  logs,
  run,
}: {
  library: LibraryWorkout[];
  baselines: Baselines | null;
  // Phase 6I: individual nullability, kept alongside the already-combined
  // `baselines` above (null the moment EITHER is null, per the app-wide
  // partial-pair convention) — BaselineCard's either-null branching needs
  // to know WHICH one(s) are missing, information the combined value alone
  // has already thrown away.
  k6Missing: boolean;
  k2Missing: boolean;
  preferences: PreferencesData;
  onDismissStartHere: () => void;
  plan: PlanData;
  logs: RecentLog[];
  run: SessionRun | null;
}) {
  const today = todayDateString();
  // Read once per render — this screen has no ticking display (unlike
  // Timer.tsx's own repaint interval); F2's resume card only needs a single
  // "elapsed so far" reading, not a live-updating stopwatch.
  const now = new Date();
  // plan.sequence always has 84 entries while a plan is active; doneN
  // reaches 84 once every session has been logged (each advancing log
  // increments it — server/stores/logs.ts's own upsert) — treated the same
  // as freestyle rather than crashing on a missing sequence entry.
  // `prescribedCode` is the plan's OWN call (never affected by a type-swap
  // chip below) — the plan line's first segment and the type chips' "which
  // one is the un-swap target" both read off this, never off the swapped
  // `todayCode`.
  const prescribedCode: PlanCode | null =
    plan.planKey !== null ? (plan.sequence[plan.doneN]?.code ?? null) : null;
  const usesPlan = prescribedCode !== null;

  // TEST maps to TR's pool exactly like suggest.ts's own `matchType`
  // (domain/suggest.ts:93) — the type chips' "which chip is currently
  // active absent a swap" and "which chip un-swaps" both need that same
  // mapping client-side, so it's computed once here rather than duplicated
  // at each call site below.
  const effectivePrescribed: WorkoutType | null =
    prescribedCode === null
      ? null
      : prescribedCode === "TEST"
        ? "TR"
        : prescribedCode;

  // Lazy initializer: read once at mount, exactly like WorkoutDetail.tsx's
  // nudge state — the `key` above already forces a remount (and thus a
  // fresh read) whenever plan/doneN change underneath this screen. Falls
  // back to the preference-derived default (no swap, prefs' own
  // difficulties/cap, pain filter off) when nothing valid is stored —
  // same "stored wins, else derive a default" shape as `pickOverride`
  // below, just with a richer default than `null`.
  const [overrides, setOverrides] = useState<TodayOverrides>(
    () =>
      loadTodayOverrides(today, plan.planKey, plan.doneN) ?? {
        date: today,
        planKey: plan.planKey,
        doneN: plan.doneN,
        swapType: null,
        difficulties: preferences.difficulties,
        // Approximates the rower's real preference to the buckets it
        // implies — see bucketsForCap's own doc comment for why this is a
        // deliberate approximation, not an exact re-derivation.
        durations: bucketsForCap(preferences.timeCapMinutes),
        painLevels: [],
        // Round 2 (2026-08-04): both default to null ("off") — neither has
        // an account-level preference to seed from, unlike
        // difficulties/durations above.
        lastDone: null,
        source: null,
      },
  );

  // The type the chips (and now the descriptor word below them) actually
  // treat as selected: a swap if one is set, else whatever's effectively
  // prescribed today (TR standing in on a TEST day) — the exact expression
  // each TodayChip's own `active` prop already used inline, pulled out once
  // so the new word row reads off the identical value rather than a second
  // copy of the same ternary. Null only in freestyle (no plan, no chips, no
  // word to show).
  const effectiveType: WorkoutType | null =
    overrides.swapType ?? effectivePrescribed;

  // Every chip handler below funnels through this: update the visible
  // state AND persist in the same call, so no chip tap is ever lost to a
  // reload/remount before its effect would otherwise flush.
  function updateOverrides(next: TodayOverrides) {
    setOverrides(next);
    saveTodayOverrides(next);
  }

  function handleTypeChip(type: WorkoutType) {
    // Tapping the chip that matches what's already effectively prescribed
    // (the plan's own call, or TR standing in for a TEST day) clears the
    // swap rather than swapping to itself — the brief's "tapping the
    // prescribed chip (or TR on a TEST day) sets swapType: null".
    updateOverrides({
      ...overrides,
      swapType: type === effectivePrescribed ? null : type,
    });
  }

  // Task 2 (2026-08-04 round): the day's pref-derived "no filter" baseline
  // — consumed by todayFilterTokens() (deviation detection) and CLEAR ALL
  // below. `difficulties` is the hardcoded all-three set (ALL_DIFFICULTIES,
  // module scope) per the spec's own "Active" rule, deliberately NOT
  // `preferences.difficulties` (which only seeds the INITIAL record above
  // and can itself be a narrower account preference) — see
  // TodayFilterDefaults' own doc comment.
  const filterDefaults: TodayFilterDefaults = {
    difficulties: ALL_DIFFICULTIES,
    durations: bucketsForCap(preferences.timeCapMinutes),
  };

  // The FILTER ⌄ sheet's own state: whether it's open, its in-progress
  // draft (seeded from `overrides` each time it opens — see
  // `openFilterSheet`), and the button's own ref, which doubles as
  // SheetShell's focus-restore target (Today.tsx's FILTER ⌄ button below,
  // not `document.activeElement` — see TodayFilterSheet.tsx's own doc
  // comment on why).
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<TodayFilterDraft>({
    difficulties: overrides.difficulties,
    durations: overrides.durations,
    painLevels: overrides.painLevels,
    lastDone: overrides.lastDone,
    source: overrides.source,
  });
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  function openFilterSheet() {
    setDraft({
      difficulties: overrides.difficulties,
      durations: overrides.durations,
      painLevels: overrides.painLevels,
      lastDone: overrides.lastDone,
      source: overrides.source,
    });
    setSheetOpen(true);
  }

  function applyFilterSheet() {
    updateOverrides({ ...overrides, ...draft });
    setSheetOpen(false);
  }

  function dismissFilterSheet() {
    // The draft is simply never written back — same "closes without
    // applying" semantics as Library's own FilterSheet.tsx (backdrop tap,
    // Escape, a tab tap, or a hardware/browser back navigation all unmount
    // this the same way, since it pushes no history entry of its own).
    setSheetOpen(false);
  }

  // Token ✕ / CLEAR ALL apply immediately (no sheet, no confirm) and save
  // the record — same as a chip tap did before this task's rewiring.
  function resetFilterGroup(
    group: "difficulties" | "durations" | "pain" | "lastDone" | "source",
  ) {
    if (group === "difficulties") {
      updateOverrides({
        ...overrides,
        difficulties: filterDefaults.difficulties,
      });
    } else if (group === "durations") {
      updateOverrides({ ...overrides, durations: filterDefaults.durations });
    } else if (group === "pain") {
      updateOverrides({ ...overrides, painLevels: [] });
    } else if (group === "lastDone") {
      updateOverrides({ ...overrides, lastDone: null });
    } else {
      updateOverrides({ ...overrides, source: null });
    }
  }

  // CLEAR ALL resets to the day's pref-derived DEFAULTS, never to empty —
  // the deliberate divergence from Library's own CLEAR ALL (which empties
  // every filter), per the collapsible-filter spec's own decision table.
  // lastDone/source (Round 2) have no pref-derived default to fall back to
  // (unlike difficulties/durations) — both simply reset to null, the same
  // "off" value they start the day at.
  function clearAllFilters() {
    updateOverrides({
      ...overrides,
      difficulties: filterDefaults.difficulties,
      durations: filterDefaults.durations,
      painLevels: [],
      lastDone: null,
      source: null,
    });
  }

  // Lazy initializer: read once at mount, exactly like WorkoutDetail.tsx's
  // nudge state — the `key` above already forces a remount (and thus a
  // fresh read) whenever plan/doneN change underneath this screen.
  const [pickOverride, setPickOverride] = useState<string | null>(() =>
    loadTodayPick(today, plan.planKey, plan.doneN),
  );

  // Phase 6I: the two designated onboarding workouts are never a real
  // suggestion once a rower has real baselines — "invisible outside
  // onboarding" (design spec, no-baseline card's own Mechanics section). A
  // veteran with both baselines set must never see "First 6k"/"First 2k"
  // in SUGGESTED or SHUFFLE's pool. Final-review fix (2026-08-09): the
  // exclusion must key off `isGlobal` too, not title alone — a rower's own
  // CUSTOM workout that happens to collide with one of these titles is a
  // real, ownable workout, not a stray to hide; excluding it by title
  // alone orphaned it (invisible everywhere, no UI path back).
  const entries = library
    .filter((w) => !(isOnboardingTitle(w.title) && w.isGlobal))
    .map((w) => toLibraryEntry(w, baselines));

  // The swapped-in type: a swap always names a real WorkoutType, which IS a
  // PlanCode (WorkoutType is a subset of the PlanCode union), so this needs
  // no cast to feed `suggest`'s `todayCode: PlanCode` parameter below.
  const todayCode: PlanCode | null =
    prescribedCode !== null ? (overrides.swapType ?? prescribedCode) : null;

  const suggestion = computeSuggestion(
    overrides,
    entries,
    baselines,
    todayCode,
    pickOverride,
  );

  // TodayFilterSheet's own live count — the SAME call above, run against
  // the sheet's in-progress draft rather than the applied `overrides`.
  const draftPoolCount = poolCountFor(
    draft,
    entries,
    baselines,
    todayCode,
    pickOverride,
  );

  const filterTokens = todayFilterTokens(
    overrides,
    filterDefaults,
    resetFilterGroup,
  );

  // The `?? null` is defensive, not reachable from this call site: `entries`
  // (fed to `suggest`/`suggestFreestyle`) is `library.map(toLibraryEntry)`,
  // a 1:1 id-preserving mapping, so any `recommendationId` those functions
  // return is provably one of `library`'s own ids. Kept rather than
  // asserted away in case that invariant ever changes.
  const recommended = suggestion.recommendationId
    ? (library.find((w) => w.id === suggestion.recommendationId) ?? null)
    : null;

  const canShuffle = suggestion.poolIds.length > 1;

  // Phase 6I: BaselineCard's own two possible targets, looked up from the
  // UNFILTERED `library` (unlike `entries` above, which drops them from
  // suggestion pools on purpose) — the card needs to find exactly these
  // two by title. `undefined` is the defensive "not seeded yet" case
  // BaselineCard itself documents; never expected once the server has run
  // its onboarding seed (Phase 6I Task 3). Final-review fix (2026-08-09):
  // also require `isGlobal` — a colliding CUSTOM workout with the same
  // title must never be the one the card starts (it would run the
  // rower's own workout under the "SETS YOUR BASELINE" banner instead of
  // the designated global one).
  const k6Workout = library.find(
    (w) => w.title === ONBOARDING_TITLES.k6 && w.isGlobal,
  );
  const k2Workout = library.find(
    (w) => w.title === ONBOARDING_TITLES.k2 && w.isGlobal,
  );
  const needsBaselineCard = baselines === null;

  function handleShuffle() {
    const pool = suggestion.poolIds;
    // Defensive, not reachable via the UI: SHUFFLE's own `disabled={!canShuffle}`
    // (canShuffle = poolIds.length > 1) already keeps a click from firing
    // this at all when the pool has 0 or 1 members.
    if (pool.length === 0) return;
    // Defensive: suggest.ts's own invariant is poolIds.length > 0 iff
    // recommendationId !== null (see `recommended`'s comment above), so
    // past the guard above `recommendationId` is never actually null here.
    const currentId = suggestion.recommendationId ?? pool[0];
    const currentIndex = pool.indexOf(currentId);
    // Defensive: the same invariant means `currentId` is always one of
    // `pool`'s own members, so `indexOf` never actually returns -1 here.
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + 1) % pool.length;
    const nextId = pool[nextIndex];
    setPickOverride(nextId);
    saveTodayPick({
      date: today,
      planKey: plan.planKey,
      doneN: plan.doneN,
      workoutId: nextId,
    });
  }

  return (
    <main className="screen">
      <h1 className="screen-title">Today</h1>
      {/* Phase 6I: mounted above everything else on the screen (spec:
          "Sits at the top of Today, above the suggestion card") — including
          the live-run resume card below, per the controller's own "above
          everything" framing. No layout reservation once dismissed: this
          simply doesn't render (Today.tsx owns the mount condition;
          StartHere itself has no opinion on whether it should exist). */}
      {!preferences.startHereDismissed && (
        <StartHere onDismiss={onDismissStartHere} />
      )}
      {/* Phase 6I: the whole plan/freestyle line, type-swap chips and
          descriptor word are "plan apparatus" (spec's own words) — hidden
          entirely while the no-baseline card shows, matching the design
          mock's screen 2b exactly (no plan line of any kind renders there,
          not even the freestyle variant): "there is no suggestion to
          filter or swap" applies whether or not a plan happens to be
          active underneath. */}
      {!needsBaselineCard &&
        (usesPlan ? (
          <>
            <p className="today-plan-line mono-status">
              SESSION {plan.doneN + 1} OF {plan.sequence.length} ·{" "}
              {prescribedCode}
              {overrides.swapType !== null && ` → ${overrides.swapType}`}
            </p>
            {/* Type-swap chips: only meaningful with a plan active (there is
                no "prescribed type" to swap away from in freestyle). Active
                state reads `swapType ?? effectivePrescribed` — the un-swapped
                chip lights up whichever type the plan actually calls for
                today (TR standing in on a TEST day), and tapping THAT chip
                again clears the swap rather than swapping to itself
                (handleTypeChip). Amendment (2026-08-04 PR #50 round), Task 2:
                `.type-chip-grid` (index.css — renamed from `.today-type-
                chips`, library-filter-unification round, Task 2: Library's
                own multi-select chip row needed the identical grid override)
                lays these out as a 4-column 1fr grid spanning the full
                content width, rather than `.chip-wrap`'s own inline
                flex-wrap — 44px chip height unchanged, same `.chip`/
                TodayChip classes. */}
            <div className="chip-wrap type-chip-grid">
              {TYPE_CHIPS.map((type) => (
                <TodayChip
                  key={type}
                  label={type}
                  active={effectiveType === type}
                  onClick={() => handleTypeChip(type)}
                  typeColorVar={TYPE_COLOR_VAR[type]}
                />
              ))}
            </div>
            {/* The effective type's descriptor word (James's request,
                2026-08-08 round), reusing the classification card's own word
                idiom (ClassificationCard.tsx/.classification-type-word —
                mono, --ink-2, 11px) and its reserved-line-box fix
                (.classification-type-label-row's min-height pattern) so a
                rerender can never nudge anything below it — moot here in
                practice since `effectiveType` is never null whenever this
                branch renders (a plan is active), but kept for the same
                belt-and-suspenders reason ClassificationCard.tsx's own
                comment gives. `aria-hidden`: purely presentational
                reinforcement of what each chip's own `aria-pressed` already
                conveys to assistive tech, not a second announcement of it.
                `.type-word` (index.css — renamed from `.today-type-word` in
                the library-filter-unification round, Task 2's M-7 review
                fix: Library's own descriptor reuses the identical text
                style) is the fourth of this round's class extractions.

                Fix round (whole-branch review comment): `.type-chip-grid`'s
                own 4px margin-bottom (index.css) assumes THIS wrapper
                always follows it — true today only because `effectiveType`
                is never null whenever this branch renders, per the
                paragraph above. If a future change ever makes that false
                while the chip row still renders, the chip row will inherit
                the exact ~34px jump Library's own I-1 fix corrected (that
                fix's answer was mounting the wrapper unconditionally,
                `aria-hidden` regardless — do the same here rather than
                patching the CSS rule). */}
            {effectiveType !== null && (
              <div className="type-word-row" aria-hidden="true">
                <p className="type-word">{TYPE_WORDS[effectiveType]}</p>
              </div>
            )}
          </>
        ) : (
          <div className="today-plan-line today-plan-line-freestyle">
            <span className="mono-status">FREESTYLE</span>
            <Link to="/plan" className="today-plan-link">
              choose a plan →
            </Link>
          </div>
        ))}

      {/* F2 (whole-branch review, spec Resilience #6): a cold start (the OS
          killed the app mid-session — real on iOS) lands here with nothing
          else surfacing the live/unlogged run otherwise; Start on the
          suggestion card below only ever REPLACES it (WorkoutDetail.tsx's
          own staged "in progress"/"unlogged" confirm already guards that —
          verified, not re-implemented here). Keyed off `run` alone, not the
          draft: F3a stamped `title` straight onto the run record for
          exactly this card, so it never needs to also read `SessionDraft`.
          Rendered ABOVE the suggestion card — the screen's most prominent
          element when a live run exists, per the brief. */}
      {run !== null && run.completedAt === null && (
        <div className="today-resume-card">
          <span className="today-resume-label">SESSION IN PROGRESS</span>
          <h2 className="today-resume-title">{run.title}</h2>
          <span className="today-resume-elapsed">
            {fmtDuration(elapsedSinceStart(run, now) / 60)} elapsed
          </span>
          <Link to="/session/run" className="today-resume-button">
            Resume session
          </Link>
        </div>
      )}
      {/* Quieter than the resume card, deliberately (F2's own call): no
          accent banner, just the workout's name plus a real "Log it" action
          (Phase 6C Task 2) and — Task 3 (ui-fix round) — a staged Discard.
          `UnloggedRow` owns ITS OWN `useStagedDiscard`/dismissed state
          rather than TodayView reading it: a state change scoped to that
          child component re-renders only the row, never TodayView itself,
          which is what keeps `suggestion` (computed in TodayView's own
          render body below) from ever recomputing — and therefore from
          ever re-shuffling the suggestion card — as a side effect of
          arming or firing the discard. */}
      {run !== null && run.completedAt !== null && <UnloggedRow run={run} />}

      {/* Phase 6I: the no-baseline SETS YOUR BASELINE card (design spec,
          screen 2b) replaces the entire suggestion apparatus — header
          (SUGGESTED/FILTER ⌄/SHUFFLE ↻), the active-filter tokens, the
          filter sheet, and the suggestion/empty card itself — while either
          baseline is null. There is nothing to filter or swap and nothing
          real to suggest, so none of it renders alongside the card. */}
      {needsBaselineCard ? (
        <BaselineCard
          k6Missing={k6Missing}
          k2Missing={k2Missing}
          k6Workout={k6Workout}
          k2Workout={k2Workout}
        />
      ) : (
        <>
          <div className="today-suggestion-header">
            <span className="mono-status">
              {/* Final fix wave (2026-08-04 round, M2): "SUGGESTED FOR TODAY"
                  wrapped to two lines beside FILTER/SHUFFLE at 390px — "FOR
                  TODAY" was redundant on the Today screen anyway, so the label
                  is just "SUGGESTED" in both modes now (freestyle already used
                  that). Never pick-state — suggestion.reason already says
                  "YOUR PICK: …" when pickOverride is set, so this label
                  staying constant avoids saying the same thing twice in two
                  different places on the card. */}
              {suggestion.recommendationId ? "SUGGESTED" : ""}
            </span>
            <div className="today-suggestion-actions">
              {/* Task 2 (2026-08-04 round): DIFFICULTY/TIME/PAIN's three inline
                  chip clusters (Phase 6F, then regrouped by fix round 2) are
                  gone — they now live inside TodayFilterSheet, opened by this
                  chip. Same geometry as SHUFFLE below (`.filter-trigger`,
                  renamed from `.today-shuffle` in the library-filter-
                  unification round, Task 2 — Library's own FILTER ⌄ trigger
                  needed this exact chip look too; chip-style: 44px,
                  transparent, rule-3 border) since the two now sit side by
                  side on the header's right; `filterButtonRef` doubles as
                  SheetShell's focus-restore target once the sheet closes. */}
              <button
                type="button"
                className="button-outline filter-trigger"
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                ref={filterButtonRef}
                onClick={openFilterSheet}
              >
                FILTER ⌄
              </button>
              <button
                type="button"
                className="button-outline filter-trigger"
                onClick={handleShuffle}
                disabled={!canShuffle}
              >
                SHUFFLE ↻
              </button>
            </div>
          </div>

          {/* The active-filter tokens, one per DEVIATING group (todayFilterTokens.ts)
              — renders nothing at all (TokenRow's own null-return) when every
              group still matches `filterDefaults`, which is Today's rest state.
              CLEAR ALL only ever appears alongside at least one token (the
              brief's "only when tokens exist"), and resets to `filterDefaults`
              rather than to nothing — the deliberate divergence from Library's
              own CLEAR ALL, which empties every filter instead. */}
          <TokenRow
            tokens={filterTokens}
            trailing={
              filterTokens.length > 0 ? (
                <button
                  type="button"
                  className="today-clear-all"
                  onClick={clearAllFilters}
                >
                  CLEAR ALL
                </button>
              ) : undefined
            }
          />

          {sheetOpen && (
            <TodayFilterSheet
              draft={draft}
              onChangeDraft={setDraft}
              poolCount={draftPoolCount}
              opener={filterButtonRef}
              onApply={applyFilterSheet}
              onDismiss={dismissFilterSheet}
            />
          )}

          {recommended ? (
            <Link
              to={`/library/${recommended.id}`}
              state={{ from: "/today" }}
              className="today-card"
            >
              <div className="today-card-top">
                <TypeBadge type={recommended.type} />
                <span className="today-card-duration">
                  {/* `baselines` is never null in this branch
                      (`needsBaselineCard` above already gated on it), so the
                      bare-dash fallback this ternary used to need is gone —
                      the branch itself is the guarantee now. */}
                  {estimateMinutes(recommended.steps, baselines!).minutes}′
                </span>
              </div>
              <h2 className="today-card-title">{recommended.title}</h2>
              <p className="today-card-meta">
                {recommended.difficulty.toUpperCase()} · PAIN {recommended.pain}
                /5
              </p>
              {/* `baselines` is never null here — same guarantee `today-card-
                  duration` above already relies on (`needsBaselineCard`). */}
              <PieceRegion steps={recommended.steps} baselines={baselines!} />
              <p className="today-reason-foot">
                <span className="today-reason-foot-text">
                  {suggestion.reason}
                </span>
                <span className="today-reason-foot-open">OPEN ›</span>
              </p>
            </Link>
          ) : (
            <div className="today-card today-card-empty">
              <p className="today-card-reason">{suggestion.reason}</p>
              <Link
                to="/library/new"
                state={{ from: "/today" }}
                className="button-outline"
              >
                + Build a workout
              </Link>
            </div>
          )}
        </>
      )}

      <section className="today-last-three">
        <h2 className="section-heading">LAST THREE</h2>
        {logs.length === 0 ? (
          <p className="mono-status">No sessions logged yet.</p>
        ) : (
          <ul className="today-log-list">
            {logs.map((log) => (
              <li key={log.id} className="today-log-row">
                <TypeBadge type={log.workoutType} />
                <span className="today-log-title">{log.workoutTitle}</span>
                <span className="today-log-meta">
                  {formatLogDate(log.loggedAt)} · {log.held.toUpperCase()} ·{" "}
                  {log.pain}/5
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
