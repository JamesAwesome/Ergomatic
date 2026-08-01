import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkouts } from "../api/useWorkouts";
import type { LibraryWorkout } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { usePlan } from "../api/usePlan";
import type { PlanData } from "../api/usePlan";
import { usePreferences } from "../api/usePreferences";
import { useRecentLogs } from "../api/useRecentLogs";
import type { RecentLog } from "../api/useRecentLogs";
import { estimateMinutes } from "../../domain/expand.js";
import { suggest, suggestFreestyle } from "../../domain/suggest.js";
import type { LibraryEntry, SuggestPrefs } from "../../domain/suggest.js";
import type { Baselines } from "../../domain/types.js";
import { clearDraft, loadDraft } from "../session/draft";
import { loadTodayPick, saveTodayPick, todayDateString } from "./todayPick";
import TypeBadge from "../components/TypeBadge";

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

  // A draft older than 24h with startedAt still null was abandoned mid-
  // confirm and never started — discard it with no ceremony (spec: "Deep-
  // link/reload rules"). A started draft (startedAt set) is left alone even
  // if old; 6B owns what happens to an in-progress session.
  useEffect(() => {
    const draft = loadDraft();
    if (
      draft &&
      draft.startedAt === null &&
      Date.now() - new Date(draft.createdAt).getTime() > STALE_DRAFT_MS
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

  const prefs: SuggestPrefs = {
    difficulties: preferencesState.preferences.difficulties,
    timeCapMinutes: preferencesState.preferences.timeCapMinutes,
    // See toLibraryEntry's comment: with no baselines, every entry's
    // estMinutes is a 0 placeholder, so the reason text must not claim a
    // cap was actually checked against a real duration.
    durationsUnknown: baselines === null,
  };

  // key={} forces a fresh TodayView (and thus fresh pickOverride/shuffle
  // state) whenever the plan's identity or position changes underneath —
  // same reasoning as WorkoutDetail.tsx's key={workout.id}.
  return (
    <TodayView
      key={`${planState.plan.planKey}-${planState.plan.doneN}`}
      library={workoutsState.workouts}
      baselines={baselines}
      prefs={prefs}
      plan={planState.plan}
      logs={recentLogsState.logs}
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
  prefs,
  plan,
  logs,
}: {
  library: LibraryWorkout[];
  baselines: Baselines | null;
  prefs: SuggestPrefs;
  plan: PlanData;
  logs: RecentLog[];
}) {
  const today = todayDateString();
  // plan.sequence always has 84 entries while a plan is active; doneN can
  // only reach 84 once every session is logged (out of scope this phase —
  // 6C is what advances it) — treated the same as freestyle rather than
  // crashing on a missing sequence entry.
  const todayCode =
    plan.planKey !== null ? (plan.sequence[plan.doneN]?.code ?? null) : null;

  // Lazy initializer: read once at mount, exactly like WorkoutDetail.tsx's
  // nudge state — the `key` above already forces a remount (and thus a
  // fresh read) whenever plan/doneN change underneath this screen.
  const [pickOverride, setPickOverride] = useState<string | null>(() =>
    loadTodayPick(today, plan.planKey, plan.doneN),
  );

  const entries = library.map((w) => toLibraryEntry(w, baselines));

  // Narrowing on todayCode (rather than a separate boolean) lets TS see
  // `suggest`'s todayCode argument is non-null in the true branch with no
  // assertion.
  const suggestion =
    todayCode !== null
      ? suggest({
          todayCode,
          library: entries,
          prefs,
          todayPickId: pickOverride ?? undefined,
        })
      : suggestFreestyle(entries, prefs, pickOverride ?? undefined);
  const usesPlan = todayCode !== null;

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
        <p className="today-plan-line mono-status">
          SESSION {plan.doneN + 1} OF {plan.sequence.length} · {todayCode}
        </p>
      ) : (
        <div className="today-plan-line today-plan-line-freestyle">
          <span className="mono-status">FREESTYLE</span>
          <Link to="/plan" className="today-plan-link">
            choose a plan →
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

      {recommended ? (
        <Link to={`/library/${recommended.id}`} className="today-card">
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
          <Link to="/library/new" className="button-outline">
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
