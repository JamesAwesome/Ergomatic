import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import UnsavedWorkouts from "./UnsavedWorkouts";
import { useWorkouts } from "../api/useWorkouts";
import type { LibraryWorkout } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { usePlan } from "../api/usePlan";
import type { PlanData } from "../api/usePlan";
import { usePreferences } from "../api/usePreferences";
import type { PreferencesData } from "../api/usePreferences";
import { useRecentLogs } from "../api/useRecentLogs";
import type { RecentLog } from "../api/useRecentLogs";
import { LogRow } from "../log/LogRow";
import { fmtDuration } from "../../domain/duration.js";
import { estimateMinutes } from "../../domain/expand.js";
import {
  drawOne,
  nextShuffle,
  suggest,
  suggestFreestyle,
} from "../../domain/suggest.js";
import { bucketsForCap } from "../../domain/duration.js";
import type { LibraryEntry, SuggestPrefs } from "../../domain/suggest.js";
import {
  planPrescription,
  resolvePrescribed,
} from "../../domain/prescription.js";
import { PLANS } from "../../domain/plans.js";
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
import { isOnboardingTitle } from "../../domain/onboarding.js";
import { clearDraft, loadDraft } from "../session/draft";
import { loadRun, type SessionRun } from "../session/run";
import { loadMonitorRun } from "../monitor/monitorRun";
import {
  hydrate as hydrateHandoff,
  read as readHandoff,
  type HandoffEntry,
} from "../monitor/handoffStore";
import DoorsCard from "./DoorsCard";
import {
  loadTodayPick,
  saveTodayPick,
  todayDateString,
  type StoredPick,
} from "./todayPick";
import {
  loadTodayOverrides,
  saveTodayOverrides,
  type TodayOverrides,
} from "./todayOverrides";
import {
  filterKeyFor,
  filterSetFor,
  loadTodayFilters,
  saveTodayFilters,
  withFilterSet,
  type FilterSet,
  type TodayFilters,
} from "./todayFilters";
import { clientRng } from "./rng";
import {
  todayFilterTokens,
  type TodayFilterDefaults,
} from "./todayFilterTokens";
import TodayFilterSheet, { type TodayFilterDraft } from "./TodayFilterSheet";
import TypeBadge from "../components/TypeBadge";
import { TokenRow } from "../components/TokenRow";
import { TYPE_WORDS } from "../components/typeWords";

// Hand-off store design spec (rev 4), §8/§1, plan Task 4: this route's own
// hydration boundary — same reasoning as `LogSession.tsx`'s own identical
// top-level call (see that module's comment for the full justification).
// `Today()`'s own mount snapshot (below, `useState(() => readHandoff())`)
// is a RENDER-CONTEXT read that must never trigger hydration itself; this
// module-scope statement is the genuinely NON-RENDER site that does it
// first — plain JS module evaluation, always strictly before `Today()`'s
// own function body ever runs, whether at real app startup (`AppRoutes.tsx`
// imports this module eagerly) or, in this file's own tests, at each fresh
// `vi.resetModules()` + dynamic `import("./Today")`.
hydrateHandoff();

/** Storage-denial owner for the day's two random draws (spec §2.3, RF25).
 *  `saveTodayPick`/`saveTodayOverrides` return false when the write did
 *  not land (quota, private mode, the denied-storage population researched
 *  2026-09-03). Without this, a denied write would make the first-pick
 *  and daily-roll initializers draw AGAIN on the next mount — a card that
 *  changes on every tab round trip, strictly worse than today's stable
 *  one. The initializers consult this map before drawing, so within the
 *  app's life the draw is stable; it is lost on relaunch, which is the
 *  stated, accepted cost (the same acceptance the storage-denial spec
 *  records for `session/run.ts`). Keyed exactly like the records it stands
 *  in for, so a plan advance or a new day never reads a stale entry.
 *  PRECEDENCE (review F1): a fallback entry exists only while the LATEST
 *  write of that field failed — every successful write clears it — so an
 *  entry present is always newer than whatever storage holds, and both
 *  initializers consult it BEFORE storage. Without that rule, storage
 *  that was healthy at mount and denied on a later SHUFFLE would hand the
 *  next mount the OLDER stored pick, reverting the card and regressing
 *  `shownIds` (repeats) within one session. */
const sessionFallback = new Map<
  string,
  { pick?: StoredPick; swapType?: WorkoutType | null }
>();

function fallbackKey(
  today: string,
  planKey: string | null,
  doneN: number | null,
): string {
  return `${today}|${planKey ?? ""}|${doneN ?? ""}`;
}

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

/** Wall-clock time since a LIVE run started (F2, whole-branch review: the
 *  resume card's own elapsed-so-far reading) — `now - startedAt`, the same
 *  "real time, including any pauses" convention `summaryModel.ts`'s own
 *  TIMER-door TIME hero documents for a FINISHED run's `completedAt -
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
  filters: FilterSet,
  entries: LibraryEntry[],
  baselines: Baselines | null,
  todayCode: WorkoutType | null,
  // Phase SF PR1: the day's stored pick — the drawn first card
  // (`shuffled: false`, honoured but reported "Least recently done" and
  // never beating a checkpoint pin) or the rower's own SHUFFLE
  // (`shuffled: true`, "YOUR PICK", beats the pin). Null: nothing stored.
  pick: StoredPick | null,
  // Phase 8A: the plan day's resolved prescription, or null (no plan, no
  // prescription authored for this index, an unresolvable ref, or a chip
  // swap overriding it — TodayView owns all four of those decisions).
  // Only the plan branch consumes it: freestyle has no plan day to carry
  // a prescription at all.
  prescribed: { entry: LibraryEntry; reason: string } | null,
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
  const todayPickId = pick?.shuffled ? pick.workoutId : undefined;
  const drawnId = pick && !pick.shuffled ? pick.workoutId : undefined;
  return todayCode !== null
    ? suggest({
        todayCode,
        library: entries,
        prefs,
        todayPickId,
        drawnId,
        prescribed,
      })
    : suggestFreestyle(entries, prefs, todayPickId, drawnId);
}

/** TodayFilterSheet's own live pool count: the same call above, run
 *  against the sheet's draft rather than the applied overrides, reduced to
 *  just the pool size — the count TodayFilterSheet's own live-count caption
 *  renders (Revision, mid-round: the primary button itself is now the
 *  constant "Apply Filter", no count of its own). */
function poolCountFor(
  draft: FilterSet,
  entries: LibraryEntry[],
  baselines: Baselines | null,
  todayCode: WorkoutType | null,
  pick: StoredPick | null,
  prescribed: { entry: LibraryEntry; reason: string } | null,
): number {
  // `poolIds` keeps its pool meaning with a prescription pinned
  // (suggest.ts's own contract), so the sheet's live count stays an
  // honest count of the ESCAPE pool either way — the prescribed entry is
  // never a pool member.
  return computeSuggestion(
    draft,
    entries,
    baselines,
    todayCode,
    pick,
    prescribed,
  ).poolIds.length;
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

  // Same lazy-initializer, read-once-at-mount idiom as `run` above — F6
  // spec 2b's own twin card (below, via `TodayView`) needs whatever
  // `MonitorRun` already exists the instant this screen mounts, exactly the
  // same "cold start with no other path back in" reasoning `run`'s own
  // comment gives, just for the monitor's own record rather than the phone
  // timer's.
  //
  // Hand-off store design spec (rev 4), §5, plan Task 4: reads via the
  // store's `read()` (never `loadMonitorRun()`) — the §5 product gain: a
  // record that is LIVE ONLY IN THE STORE'S MEMORY TIER (its durable write
  // denied) is now visible here too, closing the escape-hatch gap filed at
  // #230's gate (a stashed record with no door under denial-from-first-
  // write). Retains the full `HandoffEntry`, not a bare `MonitorRun`: the
  // row's own discard/Log-it handlers (`UnloggedMonitorRow`, below) need
  // the revision to retire/commit against, key-bound, never a fresh re-read
  // for authorization. §9.5's own residual — this memory-only row vanishes
  // on a reload indistinguishable from a durable one — is named, not fixed:
  // after a reload nothing survives to tell a fresh process the row was
  // ever there, so no NEW receipt is invented for it; the commit that put
  // the record there in the first place already receipted its own
  // `verdict:"failed"` (`handoffStoreReplay`-style row-9 test, task-4-
  // report.md), which is the artifact that explains the vanish.
  const [monitorEntry] = useState<HandoffEntry | null>(() => readHandoff());

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
  // — Timer/LogSession both deliberately keep it, for 6C's still-
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
  //
  // Task 6 close-out ruling (hand-off store plan, 2026-08-30; reworded at
  // fix round 1/5, L-2): this is the THIRD legacy `loadMonitorRun()` read
  // the review named alongside `monitorRunState()`/`anyLiveSession()`
  // (ROADMAP.md's AUD-016 item) — swept and LEFT AS-IS, not rerouted onto
  // `handoffStore`. The load-bearing reason is `todayGuard.pin.test.ts`'s
  // own stated one (its "still reads the monitor record DIRECTLY, never
  // through anyLiveSession()" test): "this guard needs a synchronous,
  // un-hydrated, always-fresh raw read at effect time... a genuinely
  // different call from anything the store's `read()` does." Rerouting it
  // onto `handoffStore` would be exactly the helper-indirection Phase 7B's
  // own pin (this exact block, BYTE-IDENTICAL) exists to catch, and its own
  // header says a legitimate change here updates the pin "in the same
  // commit and say why," which this ruling does not do.
  //
  // **CORRECTED (fix round 1/5, L-2): §8 and §4/§5 do not SANCTION this
  // read — they only fail to FORBID it.** §8's render-time ban and §4/§5's
  // destroyer census are both silent on a plain, non-render GETTER outside
  // the store; that silence is not an endorsement, only an absence of a
  // rule this read happens to fall outside of (fired from a `useEffect`
  // with an empty dependency array, never during render). The actual
  // justification for KEEPING it is the pin above, not these sections.
  //
  // **CORRECTED AGAIN (final fix round, 2026-08-30; adversarial pass
  // F-2), because the sentence that used to sit here — "never `setItem`/
  // `removeItem` ... destroys nothing" — was FALSE when it was written.**
  // `loadMonitorRun()` fell through to `clearMonitorRun()` on any
  // malformed blob, so this line WAS a `removeItem` on the durable tier,
  // reached by simply opening Today: an unparseable record the store was
  // deliberately preserving (§8: "malformed durable bytes are never
  // cleared during a read") was destroyed by this guard's mount effect,
  // and no test in the composed app could see it because every §8 test
  // lived at the store. The claim is true NOW only because the loader was
  // fixed in the same round — `monitorRun.ts`'s `loadMonitorRun` returns
  // `null` and clears nothing — and it is pinned by
  // `Today.test.tsx`'s own "a MALFORMED monitor record SURVIVES a Today
  // mount" test, not by this comment. Do not restore the self-heal.
  //
  // The one real gap this leaves is NEWLY OBSERVABLE, DELIBERATELY NOT
  // CONSULTED — not "not worsened by this branch": pre-store, a monitor
  // session whose every durable write failed left no record ANYWHERE a
  // durable-only read like this one could have found, live or not — the
  // gap was unreachable in practice. Post-store, that same session's
  // record exists, live, in the store's own memory tier, and this guard
  // still reads only the durable tier — the gap is now a real,
  // in-principle-visible state this reader chooses not to look at, per the
  // pin's own reasoning above, rather than a state that could not have
  // existed either way. Not chased further here.
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

  return (
    <main className="screen">
      <div className="today-title-row">
        <h1 className="screen-title">Today</h1>
        <Link to="/justrow" className="today-justrow">
          JUST ROW
        </Link>
      </div>
      {run !== null && run.completedAt === null && (
        <div className="today-resume-card">
          <span className="today-resume-label">SESSION IN PROGRESS</span>
          <h2 className="today-resume-title">{run.title}</h2>
          <span className="today-resume-elapsed">
            {fmtDuration(elapsedSinceStart(run, new Date()) / 60)} elapsed
          </span>
          <Link to="/session/run" className="today-resume-button">
            Resume session
          </Link>
        </div>
      )}
      <UnsavedWorkouts run={run} monitorEntry={monitorEntry} />
      <TodayContent
        workoutsState={workoutsState}
        baselinesState={baselinesState}
        planState={planState}
        preferencesState={preferencesState}
        recentLogsState={recentLogsState}
      />
    </main>
  );
}

function TodayContent({
  workoutsState,
  baselinesState,
  planState,
  preferencesState,
  recentLogsState,
}: {
  workoutsState: ReturnType<typeof useWorkouts>;
  baselinesState: ReturnType<typeof useBaselines>;
  planState: ReturnType<typeof usePlan>;
  preferencesState: ReturnType<typeof usePreferences>;
  recentLogsState: ReturnType<typeof useRecentLogs>;
}) {
  if (
    workoutsState.state === "loading" ||
    baselinesState.state === "loading" ||
    planState.state === "loading" ||
    preferencesState.state === "loading" ||
    recentLogsState.state === "loading"
  ) {
    return <p className="mono-status">LOADING…</p>;
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

  // key={} forces a fresh TodayView (and thus fresh pick/overrides/
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
    <section>
      <p className="mono-status">{message}</p>
      <button type="button" className="button-outline" onClick={retry}>
        Retry
      </button>
    </section>
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
  preferences,
  plan,
  logs,
}: {
  library: LibraryWorkout[];
  // Null the moment EITHER side is null (the app-wide partial-pair
  // convention) — which is exactly the doors card's own render condition
  // (Phase BL PR C: an incomplete PAIR re-enters onboarding; the old
  // per-side k6Missing/k2Missing props died with BaselineCard's
  // either-null branching).
  baselines: Baselines | null;
  preferences: PreferencesData;
  plan: PlanData;
  logs: RecentLog[];
}) {
  const today = todayDateString();
  // Read once per render — this screen has no ticking display (unlike
  // Timer.tsx's own repaint interval); F2's resume card only needs a single
  // "elapsed so far" reading, not a live-updating stopwatch.
  // plan.sequence always has 84 entries while a plan is active; doneN
  // reaches 84 once every session has been logged (each advancing log
  // increments it — server/stores/logs.ts's own upsert) — treated the same
  // as freestyle rather than crashing on a missing sequence entry.
  // `prescribedCode` is the plan's OWN call (never affected by a type-swap
  // chip below) — the plan line's first segment and the type chips' "which
  // one is the un-swap target" both read off this, never off the swapped
  // `todayCode`.
  const prescribedCode: WorkoutType | null =
    plan.planKey !== null ? (plan.sequence[plan.doneN]?.code ?? null) : null;
  const usesPlan = prescribedCode !== null;

  // ---- Phase SF PR1 (spec §2): per-type filter memory, the day's random
  // draws, and SHUFFLE without repeats. Everything below the doors card
  // reads off these. Hook ORDER is fixed and unconditional; the derived
  // values between the hooks are plain computations on props/state.

  // The undated per-type filter memory (I-6). Loaded once per mount; every
  // write goes through `updateFilterStore` so the in-memory copy and the
  // stored one move together.
  const [filterStore, setFilterStore] = useState<TodayFilters>(() =>
    loadTodayFilters(),
  );

  // Phase 6I: the two designated onboarding workouts are never a real
  // suggestion once a rower has real baselines — "invisible outside
  // onboarding" (design spec, no-baseline card's own Mechanics section). A
  // veteran with both baselines set must never see "6K Test"/"2K Test"
  // in SUGGESTED or SHUFFLE's pool. Final-review fix (2026-08-09): the
  // exclusion must key off `isGlobal` too, not title alone — a rower's own
  // CUSTOM workout that happens to collide with one of these titles is a
  // real, ownable workout, not a stray to hide; excluding it by title
  // alone orphaned it (invisible everywhere, no UI path back).
  // Computed ABOVE the two draw initializers because they need the pool at
  // mount — and it IS complete here: TodayContent holds "LOADING…" until
  // every data hook resolves before it mounts this view (anchor pass,
  // vetted ground).
  const entries = library
    .filter((w) => !(isOnboardingTitle(w.title) && w.isGlobal))
    .map((w) => toLibraryEntry(w, baselines));

  // A key the memory has never seen reads as the preference-seeded set —
  // the same values a fresh day used to start with before PR1 (prefs'
  // own difficulties, the cap's buckets, pain/recency/source off).
  const seedSet: FilterSet = {
    difficulties: preferences.difficulties,
    // Approximates the rower's real preference to the buckets it implies
    // — see bucketsForCap's own doc comment for why this is a deliberate
    // approximation, not an exact re-derivation.
    durations: bucketsForCap(preferences.timeCapMinutes),
    painLevels: [],
    lastDone: null,
    source: null,
  };

  const fbKey = fallbackKey(today, plan.planKey, plan.doneN);

  // The two persistence owners (RF25). Each writes the record and keeps the
  // session fallback exact: cleared on a landed write, set on a failed one
  // — see `sessionFallback`'s comment for why the order matters.
  function persistOverrides(record: TodayOverrides) {
    const fallback = sessionFallback.get(fbKey);
    if (saveTodayOverrides(record)) {
      if (fallback?.swapType !== undefined) {
        sessionFallback.set(fbKey, { ...fallback, swapType: undefined });
      }
    } else {
      sessionFallback.set(fbKey, { ...fallback, swapType: record.swapType });
    }
  }
  function persistPick(drawn: StoredPick) {
    const fallback = sessionFallback.get(fbKey);
    const landed = saveTodayPick({
      date: today,
      planKey: plan.planKey,
      doneN: plan.doneN,
      ...drawn,
    });
    if (landed) {
      if (fallback?.pick !== undefined) {
        sessionFallback.set(fbKey, { ...fallback, pick: undefined });
      }
    } else {
      sessionFallback.set(fbKey, { ...fallback, pick: drawn });
    }
  }

  // Lazy initializer: read once at mount, exactly like WorkoutDetail.tsx's
  // nudge state — the `key` above already forces a remount (and thus a
  // fresh read) whenever plan/doneN change underneath this screen.
  // Phase SF PR1 (I-5): on the day's FIRST freestyle mount this also rolls
  // the type — write-once-per-day, and the write happens inside this same
  // read-then-write initializer, so React StrictMode's development-only
  // double invocation reads the first call's write (react.dev; anchor
  // pass, vetted ground). Render impurity is confined to this initializer
  // and `pick`'s below, on purpose. No roll: with a plan (its call IS the
  // type), when today's record already exists (rolled earlier, or the
  // rower cleared it to ANY TYPE — a clear holds for the rest of the day
  // and tomorrow rolls again; James struck the sticky clear at Gate 0),
  // or without baselines (the doors card hides the chip row; nothing to
  // light). Candidates are the types whose pool, under THAT type's
  // remembered filters, is non-empty without falling back — ANY TYPE is
  // never rolled. The record is written whether or not a candidate was
  // found, so "not yet rolled today" is exactly "no record today".
  const [overrides, setOverrides] = useState<TodayOverrides>(() => {
    const record: TodayOverrides = {
      date: today,
      planKey: plan.planKey,
      doneN: plan.doneN,
      swapType: null,
    };
    const fallback = sessionFallback.get(fbKey);
    if (fallback?.swapType !== undefined) {
      return { ...record, swapType: fallback.swapType };
    }
    const stored = loadTodayOverrides(today, plan.planKey, plan.doneN);
    if (stored !== null) return stored;
    if (prescribedCode === null && baselines !== null) {
      // A candidate is a type whose pool under ITS remembered filters is
      // non-empty WITHOUT falling back (review F2, spec I-5): a type whose
      // filters match nothing would open the morning on "Nothing fit your
      // filters", which is not a suggestion, so it is not rolled. If every
      // type falls back there is no roll and the day opens on ANY TYPE.
      const candidates = TYPE_CHIPS.filter((type) => {
        const s = computeSuggestion(
          filterSetFor(filterStore, type, seedSet),
          entries,
          baselines,
          type,
          null,
          null,
        );
        return !s.fellBack && s.poolIds.length > 0;
      });
      record.swapType = drawOne(candidates, clientRng);
      persistOverrides(record);
    }
    return record;
  });

  // The type the chips (and the descriptor word below them) actually
  // treat as selected: a swap if one is set, else the plan's own call for
  // today. Since Phase 8A a checkpoint day carries its REAL type here (the
  // "TEST" code and its TR stand-in are retired), so no mapping sits
  // between the wire's code and the chips. Null only in freestyle with no
  // chip lit (ANY TYPE — the rower cleared it, or nothing could be rolled).
  const effectiveType: WorkoutType | null =
    overrides.swapType ?? prescribedCode;

  // The chosen type if one is set, else the plan's own call — what
  // `suggest`'s `todayCode` actually receives below. Null only in freestyle
  // with no chip lit, which is the whole-library `suggestFreestyle` pool.
  const todayCode: WorkoutType | null = effectiveType;

  // I-6: the memory key is the EFFECTIVE type in both modes (a checkpoint
  // day keys on the day's own type; freestyle with nothing lit keys on
  // ANY), and `filters` is what every consumer below reads — the sheet,
  // the tokens, the suggestion, CLEAR ALL.
  const currentKey = filterKeyFor(effectiveType);
  const filters: FilterSet = filterSetFor(filterStore, currentKey, seedSet);

  function updateFilterStore(next: TodayFilters) {
    setFilterStore(next);
    // RF25, the owner named: a false return means this choice is not
    // REMEMBERED (the storage-denied population); the screen still shows
    // it, because `next` is state. "Not remembered" is exactly the
    // pre-PR1 behaviour for every rower, so it is the accepted outcome
    // rather than one to surface.
    saveTodayFilters(next);
  }

  function updateFilters(next: FilterSet) {
    updateFilterStore(withFilterSet(filterStore, currentKey, next));
  }

  // Every chip handler below funnels through this: update the visible
  // state AND persist in the same call, so no chip tap is ever lost to a
  // reload/remount before its effect would otherwise flush. A denied write
  // goes to the session fallback so the next mount reads the same swap.
  function updateOverrides(next: TodayOverrides) {
    setOverrides(next);
    persistOverrides(next);
  }

  function handleTypeChip(type: WorkoutType) {
    // Tapping the chip that matches the plan's own call for today clears
    // the swap rather than swapping to itself. In freestyle there is no
    // plan call, so the same rule reads: tapping the lit chip clears it
    // (back to the whole library), tapping any other lights that one.
    const clears =
      prescribedCode !== null
        ? type === prescribedCode
        : type === overrides.swapType;
    // In freestyle a clear writes `swapType: null` into TODAY's record,
    // which is what keeps the roll from re-running on a remount today;
    // tomorrow's record is a different date and rolls afresh.
    updateOverrides({
      ...overrides,
      swapType: clears ? null : type,
    });
  }

  // Task 2 (2026-08-04 round): the day's pref-derived "no filter" baseline
  // — consumed by todayFilterTokens() (deviation detection) and CLEAR ALL
  // below. `difficulties` is the hardcoded all-three set (ALL_DIFFICULTIES,
  // module scope) per the spec's own "Active" rule, deliberately NOT
  // `preferences.difficulties` (which only seeds a never-written key above
  // and can itself be a narrower account preference) — see
  // TodayFilterDefaults' own doc comment.
  const filterDefaults: TodayFilterDefaults = {
    difficulties: ALL_DIFFICULTIES,
    durations: bucketsForCap(preferences.timeCapMinutes),
  };

  // The FILTER ⌄ sheet's own state: whether it's open, its in-progress
  // draft (seeded from the current key's `filters` each time it opens —
  // see `openFilterSheet`), and the button's own ref, which doubles as
  // SheetShell's focus-restore target (Today.tsx's FILTER ⌄ button below,
  // not `document.activeElement` — see TodayFilterSheet.tsx's own doc
  // comment on why).
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<TodayFilterDraft>(filters);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  function openFilterSheet() {
    setDraft(filters);
    setSheetOpen(true);
  }

  function applyFilterSheet() {
    updateFilters({ ...filters, ...draft });
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
  // the current key's memory — same as a chip tap did before this task's
  // rewiring.
  function resetFilterGroup(
    group: "difficulties" | "durations" | "pain" | "lastDone" | "source",
  ) {
    if (group === "difficulties") {
      updateFilters({ ...filters, difficulties: filterDefaults.difficulties });
    } else if (group === "durations") {
      updateFilters({ ...filters, durations: filterDefaults.durations });
    } else if (group === "pain") {
      updateFilters({ ...filters, painLevels: [] });
    } else if (group === "lastDone") {
      updateFilters({ ...filters, lastDone: null });
    } else {
      updateFilters({ ...filters, source: null });
    }
  }

  // CLEAR ALL resets the CURRENT KEY to the day's pref-derived DEFAULTS,
  // never to empty — the deliberate divergence from Library's own CLEAR
  // ALL (which empties every filter), per the collapsible-filter spec's
  // own decision table. lastDone/source (Round 2) have no pref-derived
  // default to fall back to (unlike difficulties/durations) — both simply
  // reset to null, the same "off" value a fresh key starts at.
  function clearAllFilters() {
    updateFilters({
      difficulties: filterDefaults.difficulties,
      durations: filterDefaults.durations,
      painLevels: [],
      lastDone: null,
      source: null,
    });
  }

  // Phase 8A: the plan day's own authored prescription (a checkpoint's
  // designated test), computed CLIENT-SIDE from PLANS — it never crosses
  // the wire (antagonist B2's wire contract; Plan.tsx's checkpoint mark
  // does the same). Resolved against the UNFILTERED `library`, NOT
  // `entries`: both suggestion pools deliberately exclude the onboarding
  // titles, and the prescribed test is exactly such a title (the same
  // reason door 3's RowToFind.tsx looks its rows up unfiltered too).
  // An unresolvable ref degrades quietly to the ordinary pool
  // suggestion (domain/prescription.ts's own contract; authored refs are
  // guarded by prescription.test.ts's seed-resolution test instead).
  const prescription =
    plan.planKey !== null
      ? planPrescription(PLANS[plan.planKey], plan.doneN)
      : null;
  const prescribedWorkout =
    prescription !== null ? resolvePrescribed(prescription.ref, library) : null;
  // James's chips ruling (2026-08-12): a chip swap OVERRIDES the
  // prescription — the rower acting now wins — so the pin only rides into
  // suggest() while no swap is active. The override renders a visible
  // marker on the plan line below; because a swap escapes, the chips are
  // the exit on a day where SHUFFLE is disabled (the empty-or-single-pool
  // case the prescription bypass exists to serve).
  const prescribed =
    prescription !== null &&
    prescribedWorkout !== null &&
    overrides.swapType === null
      ? {
          entry: toLibraryEntry(prescribedWorkout, baselines),
          reason: prescription.reason,
        }
      : null;
  // Keyed on the RESOLVED workout, not the authored ref: if the ref never
  // resolved, the rower never saw a checkpoint card, so a swap displaces
  // nothing and the marker would assert an override that never happened.
  const prescriptionOverridden =
    prescribedWorkout !== null && overrides.swapType !== null;

  // The day's pick and SHUFFLE's shown list (I-2, I-3). Lazy initializer,
  // read once at mount; on the day's first mount it DRAWS the first card
  // uniformly from the least-recently-done tie class (`tieIds`) and
  // writes it — the same write-once-per-day shape as the roll above. No
  // draw on a checkpoint day (the pin shows; SHUFFLE is the escape) or
  // without baselines (the doors card shows). A stored pick that the
  // current pool no longer contains (the rower changed a filter or the
  // type since) is simply ignored by `suggest`, which then shows the
  // pool's least-recently-done head until the next SHUFFLE draws afresh —
  // unchanged from pre-PR1 behaviour, and the reason `shownIds` may name
  // ids outside the current pool (they are just not candidates, spec
  // §2.4).
  const [pick, setPick] = useState<StoredPick | null>(() => {
    const fallback = sessionFallback.get(fbKey);
    if (fallback?.pick !== undefined) return fallback.pick;
    const stored = loadTodayPick(today, plan.planKey, plan.doneN);
    if (stored !== null) return stored;
    if (prescribed !== null || baselines === null) return null;
    const first = computeSuggestion(
      filters,
      entries,
      baselines,
      todayCode,
      null,
      null,
    );
    const id = drawOne(first.tieIds, clientRng);
    if (id === null) return null;
    const drawn: StoredPick = {
      workoutId: id,
      shownIds: [id],
      shuffled: false,
    };
    persistPick(drawn);
    return drawn;
  });

  const suggestion = computeSuggestion(
    filters,
    entries,
    baselines,
    todayCode,
    pick,
    prescribed,
  );

  // TodayFilterSheet's own live count — the SAME call above, run against
  // the sheet's in-progress draft rather than the applied `filters`.
  const draftPoolCount = poolCountFor(
    draft,
    entries,
    baselines,
    todayCode,
    pick,
    prescribed,
  );

  const filterTokens = todayFilterTokens(
    filters,
    filterDefaults,
    resetFilterGroup,
  );

  // The `?? null` is defensive, not reachable from this call site: `entries`
  // (fed to `suggest`/`suggestFreestyle`) is an id-preserving mapping of
  // `library` rows, and the prescribed entry (Phase 8A, the one
  // recommendation that can come from OUTSIDE `entries`) is resolved from
  // the same `library` above — so any `recommendationId` those functions
  // return is provably one of `library`'s own ids. Kept rather than
  // asserted away in case that invariant ever changes.
  const recommended = suggestion.recommendationId
    ? (library.find((w) => w.id === suggestion.recommendationId) ?? null)
    : null;

  const canShuffle = suggestion.poolIds.length > 1;

  // Phase BL PR C: the doors card render condition — the PAIR is
  // incomplete (`baselines` is null the moment either side is, see the
  // prop comment above). The old BaselineCard's k6Workout/k2Workout
  // lookups died with it: the doors card is pure navigation, and door 3's
  // own screen (onboarding/RowToFind.tsx) does the designated-row lookup
  // where it is actually needed.
  const needsDoors = baselines === null;

  // I-3: a uniform draw from the pool minus everything shown today minus
  // the card on screen; `nextShuffle` resets the shown list once the pool
  // is exhausted. On a checkpoint day `recommendationId` is the pin, which
  // is not a pool member, so it excludes nothing and the draw is the
  // escape into the day's own type pool — same escape as pre-PR1, now
  // random rather than "the least-recently-done member".
  function handleShuffle() {
    const pool = suggestion.poolIds;
    // Defensive, not reachable via the UI: SHUFFLE's own `disabled={!canShuffle}`
    // (canShuffle = poolIds.length > 1) already keeps a click from firing
    // this at all when the pool has 0 or 1 members.
    if (pool.length === 0) return;
    const next = nextShuffle(
      pool,
      pick?.shownIds ?? [],
      suggestion.recommendationId,
      clientRng,
    );
    if (next === null) return;
    const drawn: StoredPick = {
      workoutId: next.id,
      shownIds: next.shownIds,
      shuffled: true,
    };
    setPick(drawn);
    persistPick(drawn);
  }

  return (
    <>
      {/* PHASE JR PR 2 — the free row's door, two words, top right (Gate 0,
          James, 2026-09-01: "a button in the top right that only says Just
          Row").

          DELIBERATELY OUTSIDE the `!needsDoors` guard below. Everything that
          guard hides is plan apparatus, and this is the opposite of plan
          apparatus: ruling 4 makes it visible with or without a baseline,
          and a rower who has not set one up yet is exactly the rower most
          likely to want to just pull. */}

      {/* Phase 6I (condition carried into BL PR C's doors): the whole
          plan/freestyle line, type-swap chips and descriptor word are
          "plan apparatus" (spec's own words) — hidden entirely while the
          doors card shows: "there is no suggestion to filter or swap"
          applies whether or not a plan happens to be active underneath. */}
      {!needsDoors && (
        <>
          {usesPlan ? (
            <p className="today-plan-line mono-status">
              SESSION {plan.doneN + 1} OF {plan.sequence.length} ·{" "}
              {prescribedCode}
              {overrides.swapType !== null && ` → ${overrides.swapType}`}
              {/* Phase 8A, stated design (DEVIATIONS row): the override
                  marker rides the plan line's existing swap arrow — the
                  arrow already records the swap, and the marker qualifies
                  exactly that act. Same mono-status style as the rest of
                  the line (no new colour, no new class). It says
                  overridden and never names the displaced workout
                  (James's ruling, 2026-08-12). */}
              {prescriptionOverridden && " · CHECKPOINT OVERRIDDEN"}
            </p>
          ) : (
            <div className="today-plan-line today-plan-line-freestyle">
              <span className="mono-status">FREESTYLE</span>
              <Link to="/plan" className="today-plan-link">
                choose a plan →
              </Link>
            </div>
          )}
          {/* Type chips, in BOTH modes (freestyle chips, James 2026-09-04:
              "look similar to how it does right now when you DO have a plan
              selected"). With a plan, active state reads
              `swapType ?? prescribedCode` — the un-swapped chip lights up
              whichever type the plan actually calls for today, and tapping
              THAT chip again clears the swap rather than swapping to itself
              (handleTypeChip). In freestyle there is no plan call, so no
              chip is lit until the rower taps one, and tapping the lit chip
              clears it back to the whole library.
              Amendment (2026-08-04 PR #50 round), Task 2:
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
              rerender can never nudge anything below it. `aria-hidden`:
              purely presentational reinforcement of what each chip's own
              `aria-pressed` already conveys to assistive tech, not a second
              announcement of it. `.type-word` (index.css — renamed from
              `.today-type-word` in the library-filter-unification round,
              Task 2's M-7 review fix: Library's own descriptor reuses the
              identical text style) is the fourth of this round's class
              extractions.

              Mounted UNCONDITIONALLY, the same answer Library's I-1 fix
              gave: `.type-chip-grid`'s own 4px margin-bottom (index.css)
              assumes this wrapper always follows it, and since the
              freestyle chips `effectiveType` CAN be null while the row
              renders — the row then reads ANY TYPE rather than leaving a
              blank reserved line under four unlit chips. */}
          <div className="type-word-row" aria-hidden="true">
            <p className="type-word">
              {effectiveType !== null ? TYPE_WORDS[effectiveType] : "ANY TYPE"}
            </p>
          </div>
        </>
      )}

      {/* Phase BL PR C: the three-door onboarding card (canvas Main)
          replaces the entire suggestion apparatus — header
          (SUGGESTED/FILTER ⌄/SHUFFLE ↻), the active-filter tokens, the
          filter sheet, and the suggestion/empty card itself — while the
          baseline pair is incomplete. There is nothing to filter or swap
          and nothing real to suggest, so none of it renders alongside
          the card (Phase 6I's rule, condition unchanged). */}
      {needsDoors ? (
        <DoorsCard />
      ) : (
        <>
          <div className="today-suggestion-header">
            <span className="mono-status">
              {/* Final fix wave (2026-08-04 round, M2): "SUGGESTED FOR TODAY"
                  wrapped to two lines beside FILTER/SHUFFLE at 390px — "FOR
                  TODAY" was redundant on the Today screen anyway, so the label
                  is just "SUGGESTED" in both modes now (freestyle already used
                  that). Never pick-state — suggestion.reason already says
                  "YOUR PICK: …" once the rower has shuffled, so this label
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
                      (`needsDoors` above already gated on it), so the
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
                  duration` above already relies on (`needsDoors`). */}
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
        <h2 className="section-heading today-last-three-heading">
          <Link
            to="/today/log"
            state={{ from: "/today" }}
            className="today-last-three-heading-link"
          >
            ALL SESSIONS
          </Link>
        </h2>
        {logs.length === 0 ? (
          <p className="mono-status">No sessions logged yet.</p>
        ) : (
          <ul className="today-log-list">
            {logs.map((log) => (
              <li key={log.id}>
                <Link
                  to={`/today/log/${log.id}`}
                  state={{ from: "/today" }}
                  className="today-log-row"
                >
                  <LogRow log={log} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
