import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkouts } from "../api/useWorkouts";
import type { LibraryWorkout } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { usePlan } from "../api/usePlan";
import type { PlanData } from "../api/usePlan";
import { usePreferences } from "../api/usePreferences";
import { useRecentLogs } from "../api/useRecentLogs";
import type { HeldResult, RecentLog } from "../api/useRecentLogs";
import { estimateMinutes } from "../../domain/expand.js";
import { suggest, suggestFreestyle } from "../../domain/suggest.js";
import type { LibraryEntry } from "../../domain/suggest.js";
import type { Baselines, Difficulty } from "../../domain/types.js";
import { clearDraft, loadDraft } from "../session/draft";
import { loadTodayPick, saveTodayPick, todayDateString } from "./todayPick";
import TypeBadge from "../components/TypeBadge";

const STALE_DRAFT_MS = 24 * 60 * 60 * 1000;

// docs/design/README.md's glyph set (↻ ▲ ▼ ◀ ▶ − + × ✓ →). No prior screen
// renders a held/under/over result (6C — logging — hasn't shipped a UI yet),
// so this mapping is this task's own judgement call, not a reconciled
// design decision: ✓ held the target, ▲ came in over it (slower — a higher
// split number), ▼ came in under it (faster). UNVERIFIED — flag for design
// review alongside the rest of the log-result UI in 6C.
const HELD_GLYPH: Record<HeldResult, string> = {
  held: "✓",
  under: "▼",
  over: "▲",
};

function daysAgoLabel(loggedAt: string): string {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(loggedAt).getTime()) / 86_400_000),
  );
  // House phrasing (WorkoutRow.tsx's daysLabel): "ND AGO", uppercase mono.
  return `${days}D AGO`;
}

// Baselines unset (a brand-new account) means estimateMinutes cannot
// resolve a single work step's split — it would throw, not return an
// estimate. The suggestion card still has to render in that state (reason
// without a target preview), and suggest()/suggestFreestyle()'s time-cap
// filter needs *some* estMinutes number per entry. Building estMinutes as 0
// here means the cap filter never excludes an entry for having an
// "unknowable" duration — 0 is <= any positive cap — which is the same
// outcome as skipping the filter, without giving suggest.ts a second,
// baselines-shaped code path. UNVERIFIED: a judgement call, not something
// the brief or an existing caller pins down; flagged for review.
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

  const prefs: { difficulties: Difficulty[]; timeCapMinutes: number } = {
    difficulties: preferencesState.preferences.difficulties,
    timeCapMinutes: preferencesState.preferences.timeCapMinutes,
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
  prefs: { difficulties: Difficulty[]; timeCapMinutes: number };
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

  const recommended = suggestion.recommendationId
    ? (library.find((w) => w.id === suggestion.recommendationId) ?? null)
    : null;

  const canShuffle = suggestion.poolIds.length > 1;

  function handleShuffle() {
    const pool = suggestion.poolIds;
    if (pool.length === 0) return;
    const currentId = suggestion.recommendationId ?? pool[0];
    const currentIndex = pool.indexOf(currentId);
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
                  {daysAgoLabel(log.loggedAt)} · {HELD_GLYPH[log.held]}{" "}
                  {log.held.toUpperCase()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
