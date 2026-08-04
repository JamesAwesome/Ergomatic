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
import type { Baselines, Difficulty, WorkoutType } from "../../domain/types.js";
import type { PlanCode } from "../../domain/plans.js";
import { clearDraft, loadDraft } from "../session/draft";
import { loadRun, type SessionRun } from "../session/run";
import { useStagedDiscard } from "../session/useStagedDiscard";
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

// Chip order per the task brief — AN before O2, matching Library's own
// FilterSheet.tsx TYPE cells (docs/design/README.md §Screens → "2. Library":
// not alphabetical).
const TYPE_CHIPS: WorkoutType[] = ["AN", "O2", "AT", "TR"];

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
  };
}

/** The suggest()/suggestFreestyle() call TodayView makes for its own
 *  (applied) `overrides`, extracted as a pure module-scope helper — Task 2
 *  (2026-08-04 round) needs the EXACT SAME call runnable against
 *  TodayFilterSheet's in-progress DRAFT too (the sheet's live `Show N
 *  options` count), and a pure function both call sites can share is
 *  simpler than lifting suggestion state up out of TodayView. */
function computeSuggestion(
  filters: Pick<TodayOverrides, "difficulties" | "durations" | "painLevels">,
  entries: LibraryEntry[],
  baselines: Baselines | null,
  todayCode: PlanCode | null,
  pickOverride: string | null,
) {
  const prefs: SuggestPrefs = {
    difficulties: filters.difficulties,
    durations: filters.durations,
    painLevels: filters.painLevels,
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
 *  just the pool size the primary button's `Show N options` label needs. */
function poolCountFor(
  draft: Pick<TodayOverrides, "difficulties" | "durations" | "painLevels">,
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
  // Phase 6B Task 4 amendment: a completed-but-unlogged run record (`run.ts`
  // — Timer/SessionComplete both deliberately keep it, for 6C's still-
  // unbuilt "log this session" screen) protects its draft from this discard
  // regardless of age, one further exception layered onto the same rule.
  // In the normal single-session-at-a-time flow this exception is inert (a
  // draft that reached completion always has `startedAt` set, so the
  // `startedAt === null` check above already excludes it on its own) — it
  // only bites for the edge case the rule is actually guarding: the rower
  // completes session A (leaving draft A + run A both in storage on
  // purpose), then opens a DIFFERENT workout and taps Start before ever
  // logging A, which overwrites the draft key with a fresh, unstarted
  // draft B while run A's own completedAt is still sitting there. This
  // doesn't try to verify the run actually belongs to the CURRENT draft
  // (6B has no id linking the two) — same "simplicity over precision" call
  // ConfirmTargets.tsx's own footer comment makes for the identical reason.
  useEffect(() => {
    const draft = loadDraft();
    if (
      draft &&
      draft.startedAt === null &&
      Date.now() - new Date(draft.createdAt).getTime() > STALE_DRAFT_MS &&
      // `?? null`, not a bare `?.completedAt === null`: no run record at
      // all (the ordinary never-started-draft case this rule has always
      // covered) must still discard — only an ACTUAL completed run should
      // protect, not the absence of one coalescing to a false negative.
      (loadRun()?.completedAt ?? null) === null
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
      preferences={preferencesState.preferences}
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
 *  "{title} — unlogged session." line, "Log it" link, and outlined ✕ button
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
            <strong>{run.title}</strong> — unlogged session.
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

function TodayView({
  library,
  baselines,
  preferences,
  plan,
  logs,
  run,
}: {
  library: LibraryWorkout[];
  baselines: Baselines | null;
  preferences: PreferencesData;
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
      },
  );

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
  });
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  function openFilterSheet() {
    setDraft({
      difficulties: overrides.difficulties,
      durations: overrides.durations,
      painLevels: overrides.painLevels,
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
  function resetFilterGroup(group: "difficulties" | "durations" | "pain") {
    if (group === "difficulties") {
      updateOverrides({
        ...overrides,
        difficulties: filterDefaults.difficulties,
      });
    } else if (group === "durations") {
      updateOverrides({ ...overrides, durations: filterDefaults.durations });
    } else {
      updateOverrides({ ...overrides, painLevels: [] });
    }
  }

  // CLEAR ALL resets to the day's pref-derived DEFAULTS, never to empty —
  // the deliberate divergence from Library's own CLEAR ALL (which empties
  // every filter), per the collapsible-filter spec's own decision table.
  function clearAllFilters() {
    updateOverrides({
      ...overrides,
      difficulties: filterDefaults.difficulties,
      durations: filterDefaults.durations,
      painLevels: [],
    });
  }

  // Lazy initializer: read once at mount, exactly like WorkoutDetail.tsx's
  // nudge state — the `key` above already forces a remount (and thus a
  // fresh read) whenever plan/doneN change underneath this screen.
  const [pickOverride, setPickOverride] = useState<string | null>(() =>
    loadTodayPick(today, plan.planKey, plan.doneN),
  );

  const entries = library.map((w) => toLibraryEntry(w, baselines));

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
      {usesPlan ? (
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
              `.today-type-chips` (index.css) now lays these out as a
              4-column 1fr grid spanning the full content width, rather than
              `.chip-wrap`'s own inline flex-wrap — 44px chip height
              unchanged, same `.chip`/TodayChip classes. */}
          <div className="chip-wrap today-type-chips">
            {TYPE_CHIPS.map((type) => (
              <TodayChip
                key={type}
                label={type}
                active={(overrides.swapType ?? effectivePrescribed) === type}
                onClick={() => handleTypeChip(type)}
                typeColorVar={TYPE_COLOR_VAR[type]}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="today-plan-line today-plan-line-freestyle">
          <span className="mono-status">FREESTYLE</span>
          <Link to="/plan" className="today-plan-link">
            choose a plan →
          </Link>
        </div>
      )}

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

      <div className="today-suggestion-header">
        <span className="mono-status">
          {/* Final fix wave (2026-08-04 round, M2): "SUGGESTED FOR TODAY"
              wrapped to two lines beside FILTER/SHUFFLE at 390px — "FOR
              TODAY" was redundant on the Today screen anyway, so the label
              is just "SUGGESTED" in both modes now (freestyle already used
              that). Never pick-state — suggestion.reason already says
              "YOUR PICK — …" when pickOverride is set, so this label
              staying constant avoids saying the same thing twice in two
              different places on the card. */}
          {suggestion.recommendationId ? "SUGGESTED" : ""}
        </span>
        <div className="today-suggestion-actions">
          {/* Task 2 (2026-08-04 round): DIFFICULTY/TIME/PAIN's three inline
              chip clusters (Phase 6F, then regrouped by fix round 2) are
              gone — they now live inside TodayFilterSheet, opened by this
              chip. Same geometry as SHUFFLE below (`.today-shuffle`, chip-
              style: 44px, transparent, rule-3 border) since the two now sit
              side by side on the header's right; `filterButtonRef` doubles
              as SheetShell's focus-restore target once the sheet closes. */}
          <button
            type="button"
            className="button-outline today-shuffle"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            ref={filterButtonRef}
            onClick={openFilterSheet}
          >
            FILTER ⌄
          </button>
          <button
            type="button"
            className="button-outline today-shuffle"
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
              {baselines
                ? `${estimateMinutes(recommended.steps, baselines).minutes}′`
                : "—"}
            </span>
          </div>
          <h2 className="today-card-title">{recommended.title}</h2>
          <p className="today-card-meta">
            {recommended.difficulty.toUpperCase()} · PAIN {recommended.pain}/5
          </p>
          <p className="today-card-reason">{suggestion.reason}</p>
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
