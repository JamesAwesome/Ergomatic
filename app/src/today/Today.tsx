import { useEffect, useState } from "react";
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
import { loadTodayPick, saveTodayPick, todayDateString } from "./todayPick";
import {
  loadTodayOverrides,
  saveTodayOverrides,
  snapCap,
  type TodayOverrides,
} from "./todayOverrides";
import TypeBadge from "../components/TypeBadge";
import { DIFFICULTY_CHIPS } from "../components/difficultyChips";

// Chip order per the task brief — AN before O2, matching Library's own
// FilterChips.tsx (docs/design/README.md §Screens → "2. Library": not
// alphabetical).
const TYPE_CHIPS: WorkoutType[] = ["AN", "O2", "AT", "TR"];

// "≤NN′" — Library's own prime-mark idiom for minutes (FilterChips.tsx's
// DURATION_CHIPS), applied here to an upper-bound cap rather than a range
// bucket, hence "≤" instead of Library's "<"/"–"/"+".
const CAP_CHIPS: { value: number | null; label: string }[] = [
  { value: 30, label: "≤30′" },
  { value: 45, label: "≤45′" },
  { value: 60, label: "≤60′" },
  { value: 90, label: "≤90′" },
  { value: null, label: "NO CAP" },
];

/** Local chip button — same `.chip` class + `aria-pressed` rendering
 *  convention as Library's own FilterChips.tsx `Chip`, not that component
 *  itself: Today's chips have different selection semantics per group
 *  (multi-select difficulties, single-select cap, a toggle, and a type
 *  swap that reads its active state off two different sources). */
function TodayChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={active}
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
// 1-5 everywhere else (PainBar, WorkoutDetail's "PAIN n/5", the library's
// "PAIN ≤3" chip) — matching the handoff's literal "/10" here would
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
// without a target preview), and suggest()/suggestFreestyle()'s time-cap
// filter needs *some* estMinutes number per entry. Building estMinutes as 0
// here means the cap filter never excludes an entry for having an
// "unknowable" duration — 0 is <= any positive cap. The FILTER being
// harmless this way isn't enough on its own, though: suggest.ts's default
// reason text used to claim "within your N min cap" unconditionally, which
// is untrue when every duration fed into it was a placeholder — fixed by
// passing `durationsUnknown: true` in prefs below, which is domain/suggest.ts's
// own job to honor (SuggestPrefs' own doc comment explains why).
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
  // TodayView builds its own SuggestPrefs from the chip overrides below
  // (Task 2); it still needs the raw server preferences to seed those
  // overrides' defaults on first mount (snapCap(preferences.timeCapMinutes),
  // preferences.difficulties) and `baselines` to compute durationsUnknown
  // itself, so both are passed through rather than a pre-built SuggestPrefs.
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
  // plan.sequence always has 84 entries while a plan is active; doneN can
  // only reach 84 once every session is logged (out of scope this phase —
  // 6C is what advances it) — treated the same as freestyle rather than
  // crashing on a missing sequence entry. `prescribedCode` is the plan's OWN
  // call (never affected by a type-swap chip below) — the plan line's first
  // segment and the type chips' "which one is the un-swap target" both read
  // off this, never off the swapped `todayCode`.
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
        // Approximates the rower's real preference to the nearest chip —
        // see snapCap's own doc comment for why this rounds up, never down.
        capMinutes: snapCap(preferences.timeCapMinutes),
        painMax3: false,
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

  function handleDifficultyChip(value: Difficulty) {
    // Multi-select, deselecting every difficulty is allowed by design (the
    // fellBack pool then applies, with an honest reason) — no "at least one
    // must stay active" guard, unlike the single-select cap chips below.
    const difficulties = overrides.difficulties.includes(value)
      ? overrides.difficulties.filter((d) => d !== value)
      : [...overrides.difficulties, value];
    updateOverrides({ ...overrides, difficulties });
  }

  function handleCapChip(value: number | null) {
    // Single-select: unlike toggleType/toggleDuration's "tap again to
    // clear" idiom, exactly one cap chip (including NO CAP) is always
    // active, so this always sets rather than toggling.
    updateOverrides({ ...overrides, capMinutes: value });
  }

  function handlePainChip() {
    updateOverrides({ ...overrides, painMax3: !overrides.painMax3 });
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

  const suggestPrefs: SuggestPrefs = {
    difficulties: overrides.difficulties,
    timeCapMinutes: overrides.capMinutes,
    painMax3: overrides.painMax3,
    // See toLibraryEntry's comment: with no baselines, every entry's
    // estMinutes is a 0 placeholder, so the reason text must not claim a
    // cap was actually checked against a real duration.
    durationsUnknown: baselines === null,
  };

  // Narrowing on todayCode (rather than a separate boolean) lets TS see
  // `suggest`'s todayCode argument is non-null in the true branch with no
  // assertion.
  const suggestion =
    todayCode !== null
      ? suggest({
          todayCode,
          library: entries,
          prefs: suggestPrefs,
          todayPickId: pickOverride ?? undefined,
        })
      : suggestFreestyle(entries, suggestPrefs, pickOverride ?? undefined);

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
              (handleTypeChip). */}
          <div className="chip-wrap today-type-chips">
            {TYPE_CHIPS.map((type) => (
              <TodayChip
                key={type}
                label={type}
                active={(overrides.swapType ?? effectivePrescribed) === type}
                onClick={() => handleTypeChip(type)}
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
      {run !== null && run.completedAt !== null && (
        // Quieter than the resume card, deliberately (F2's own call): no
        // accent banner, just the workout's name plus a real "Log it"
        // action now that Phase 6C Task 2 has built the screen it points
        // to — the run record is the source LogSession.tsx itself reads,
        // so this link carries no state/params of its own.
        <div className="today-unlogged-line">
          <p className="today-unlogged-text">
            <strong>{run.title}</strong> — unlogged session.
          </p>
          <Link to="/session/log" className="today-unlogged-link">
            Log it
          </Link>
        </div>
      )}

      <div className="today-suggestion-header">
        <span className="mono-status">
          {/* usesPlan/freestyle, never pick-state — suggestion.reason already
              says "YOUR PICK — …" when pickOverride is set, so this label
              staying constant avoids saying the same thing twice in two
              different places on the card. */}
          {suggestion.recommendationId
            ? usesPlan
              ? "SUGGESTED FOR TODAY"
              : "SUGGESTED"
            : ""}
        </span>
        <button
          type="button"
          className="button-outline today-shuffle"
          onClick={handleShuffle}
          disabled={!canShuffle}
        >
          SHUFFLE ↻
        </button>
      </div>

      {/* Filter chips: both modes (plan and freestyle alike narrow the same
          pool), order per the brief — difficulty (multi) · cap
          (single-select, exactly one always active) · pain (toggle). Every
          tap re-runs suggest() above on the next render since they all
          write into `overrides`, which the suggestion computation reads
          directly — no separate "apply" step. */}
      <div className="chip-wrap today-filter-chips">
        {DIFFICULTY_CHIPS.map(({ value, label }) => (
          <TodayChip
            key={value}
            label={label}
            active={overrides.difficulties.includes(value)}
            onClick={() => handleDifficultyChip(value)}
          />
        ))}
        {CAP_CHIPS.map(({ value, label }) => (
          <TodayChip
            key={label}
            label={label}
            active={overrides.capMinutes === value}
            onClick={() => handleCapChip(value)}
          />
        ))}
        <TodayChip
          label="PAIN ≤3"
          active={overrides.painMax3}
          onClick={handlePainChip}
        />
      </div>

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
