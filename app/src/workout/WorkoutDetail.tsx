import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useWorkouts } from "../api/useWorkouts";
import type { LibraryWorkout } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { estimateMinutes } from "../../domain/expand.js";
import { isEffortRef, resolveSplit } from "../../domain/pace.js";
import type { Baselines } from "../../domain/types.js";
import { MIN_SPLIT, MAX_SPLIT } from "../you/baselineDraft";
import { buildDraft, loadDraft, saveDraft } from "../session/draft";
import { clearRun, loadRun } from "../session/run";
import BackLink from "../shell/BackLink";
import TypeBadge from "../components/TypeBadge";
import StepRow from "./StepRow";

// Settings expose --pace-tolerance (tokens.css); read once, in this lazy
// initializer, so it's captured at mount. A future settings screen changing
// the custom property at runtime would NOT propagate here without a remount
// (useState's initializer only runs once) — that's a known limitation, not
// an oversight.
function readPaceTolerance(): number {
  if (typeof window === "undefined") return 1;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--pace-tolerance")
    .trim();
  const parsed = Number(raw);
  return raw !== "" && Number.isFinite(parsed) ? parsed : 1;
}

export default function WorkoutDetail() {
  const { id } = useParams();
  const workoutsState = useWorkouts();
  const baselinesState = useBaselines();

  if (workoutsState.state === "loading" || baselinesState.state === "loading") {
    return (
      <main className="screen">
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (workoutsState.state === "error") {
    return (
      <main className="screen">
        <p className="mono-status">Couldn't load your library.</p>
        <button
          type="button"
          className="button-outline"
          onClick={workoutsState.retry}
        >
          Retry
        </button>
      </main>
    );
  }

  if (baselinesState.state === "error") {
    return (
      <main className="screen">
        <p className="mono-status">Couldn't load your baselines.</p>
        <button
          type="button"
          className="button-outline"
          onClick={baselinesState.retry}
        >
          Retry
        </button>
      </main>
    );
  }

  const workout = workoutsState.workouts.find((w) => w.id === id);
  if (!workout) {
    return (
      <main className="screen">
        <p className="mono-status">That workout isn't in your library.</p>
        <BackLink />
      </main>
    );
  }

  // A partially-set baseline pair (e.g. a brand-new account) is treated the
  // same as "unknown" — same convention as Library.
  const baselines: Baselines | null =
    baselinesState.baselines.k2Seconds !== null &&
    baselinesState.baselines.k6Seconds !== null
      ? {
          k2Seconds: baselinesState.baselines.k2Seconds,
          k6Seconds: baselinesState.baselines.k6Seconds,
        }
      : null;

  // `key={workout.id}` forces a fresh WorkoutDetailView (and thus fresh
  // nudge state) on every workout switch — otherwise a direct
  // /library/w1 → /library/w2 navigation would reuse this component
  // instance and reapply w1's nudges to w2's steps by index.
  return (
    <WorkoutDetailView
      key={workout.id}
      workout={workout}
      baselines={baselines}
    />
  );
}

function WorkoutDetailView({
  workout,
  baselines,
}: {
  workout: LibraryWorkout;
  baselines: Baselines | null;
}) {
  // Session-only preview nudges, keyed by the RAW step index (the handoff's
  // model: one nudge covers a whole repeat block, since we render
  // workout.steps directly rather than the expanded per-repetition list) —
  // never persisted (Phase 6 will pass them per-request).
  const [nudges, setNudges] = useState<Record<number, number>>({});
  const [tolerance] = useState(readPaceTolerance);
  const [startError, setStartError] = useState<string | null>(null);
  // Staged-confirm idiom (src/you/BaselineEditor.tsx, also copied by this
  // file's own OwnerActions delete flow): gates the one-shot replacement of
  // an in-progress OR completed-but-unlogged session behind an explicit
  // second press rather than letting the first Start press silently
  // overwrite it. Two distinct reasons share one staged panel (below), not
  // two separate booleans — `null` means "no stage," either non-null value
  // both blocks the immediate `startSession()` call AND picks the panel's
  // copy, so the two can never disagree about which case triggered it.
  const [replaceStage, setReplaceStage] = useState<
    "in-progress" | "unlogged" | null
  >(null);
  const navigate = useNavigate();
  // Whatever origin THIS screen was itself entered from (Today's suggestion
  // card, a Library row, or nothing for a deep link) — forwarded onto the
  // Edit link below UNCHANGED (its own received `from`, never this screen's
  // own pathname) so the chain survives a detail -> edit -> back -> detail
  // -> back round trip instead of collapsing to the /library fallback the
  // instant an intermediate screen is inserted (design doc: "Chains
  // preserve the ORIGINAL origin").
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;

  // Builds and saves the session draft (session/draft.ts owns the shape and
  // the storage key — this screen never touches localStorage itself), then
  // hands off to the confirm screen. `saveDraft` can fail (quota, private-
  // mode Safari) without throwing; that's surfaced inline rather than
  // navigating to a confirm screen with nothing behind it. `clearRun` runs
  // only AFTER a successful `saveDraft` — never before — so a save failure
  // never destroys a prior run record for nothing: the reviewer's F5
  // finding (Phase 6B Task 4 fix round) was exactly this, a stale run
  // sitting in RUN_KEY (SessionComplete.tsx deliberately keeps one, for 6C)
  // getting silently orphaned the instant a NEW draft overwrote DRAFT_KEY —
  // clearing it here, at the one point this screen actually commits to a
  // new session, is what makes the staged confirm's "Replace" copy true
  // rather than aspirational. Unconditional (not gated on `replaceStage`):
  // `clearRun` is a no-op `localStorage.removeItem` when there was nothing
  // to clear, so this needs no extra branching for the common case where
  // there wasn't a stale run at all.
  function startSession() {
    const draft = buildDraft(workout);
    if (saveDraft(draft)) {
      clearRun();
      navigate("/session/confirm");
    } else {
      setStartError("Couldn't start this session. Try again.");
    }
  }

  // Two independent reasons block an immediate start, checked in order of
  // severity: a completed-but-unlogged RUN record (reviewer's F5 — real
  // data loss, since nothing else will ever surface it again once
  // overwritten) takes priority over a merely-started, not-yet-finished
  // DRAFT (the original F4 finding, still real but recoverable — the old
  // session was never going to be logged anyway once abandoned). Checking
  // the run first also resolves the one case where both could be true at
  // once (the SAME workout's own detail page, revisited after finishing
  // it): that reads as "unlogged," the accurate description, not
  // "in progress." A STARTED draft with no matching run (shouldn't happen
  // in the normal flow, but costs nothing to keep guarding) still falls
  // through to the "in-progress" copy exactly as before this fix round.
  function handleStart() {
    const existingRun = loadRun();
    if (existingRun !== null && existingRun.completedAt !== null) {
      setReplaceStage("unlogged");
      return;
    }
    const existingDraft = loadDraft();
    if (existingDraft !== null && existingDraft.startedAt !== null) {
      setReplaceStage("in-progress");
      return;
    }
    startSession();
  }

  const minutesLabel = baselines
    ? `${estimateMinutes(workout.steps, baselines).minutes} MIN`
    : "— MIN";
  const daysLabel =
    workout.lastDoneDaysAgo === null
      ? "NEVER DONE"
      : `LAST DONE ${workout.lastDoneDaysAgo} DAYS AGO`;

  // Clamps the RESOLVED split (baseline + off + nudge), not the raw nudge
  // number, to the same 60-240 s/500m range the baseline editor
  // (you/baselineDraft.ts) and the API enforce. Unclamped, extreme nudges
  // would push the resolved split past what a real split can be — and
  // eventually negative, where fmtSplit emits garbage like "-1:-1.0".
  const handleNudge = (index: number, delta: number) => {
    setNudges((prev) => {
      const current = prev[index] ?? 0;
      const step = workout.steps[index];
      if (!baselines || step.k !== "w") {
        return { ...prev, [index]: current + delta };
      }
      // Effort refs do not have a resolved split; guard against accidentally
      // calling resolveSplit with them. (Review finding L2: structural
      // defense-in-depth to prevent future nudge paths from introducing an
      // unguarded call; StepRow.tsx:155 already prevents nudge buttons from
      // rendering for efforts, but Phase 6's timer may add other nudge paths.)
      if (isEffortRef(step.ref)) {
        return { ...prev, [index]: current + delta };
      }
      const base = resolveSplit(baselines, step.ref, 0);
      const resolved = base + current + delta;
      const clamped = Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, resolved));
      return { ...prev, [index]: clamped - base };
    });
  };

  return (
    <main className="screen">
      <BackLink />
      <div className="workout-detail-meta">
        <TypeBadge type={workout.type} />
        {/* Same metadata tag as the library row (5H): a custom workout must
            read as yours here too — the list badge alone left the detail
            screen unmarked (device report, 2026-08-01). */}
        {!workout.isGlobal && (
          <span className="workout-row-custom">CUSTOM</span>
        )}
        <span className="mono-status">{workout.difficulty.toUpperCase()}</span>
      </div>
      <h1 className="workout-detail-title">{workout.title}</h1>
      <p className="mono-status">
        {minutesLabel} · PAIN {workout.pain}/5 · {daysLabel}
      </p>
      <p className="workout-detail-note">PREVIEW — NUDGE ANY TARGET</p>
      <div className="step-list">
        {workout.steps.map((step, index) =>
          step.k === "reps" ? (
            <p key={index} className="step-reps-marker">
              {step.count}× the block below
            </p>
          ) : (
            <StepRow
              key={index}
              step={step}
              baselines={baselines}
              tolerance={tolerance}
              nudge={nudges[index] ?? 0}
              onNudge={(delta) => handleNudge(index, delta)}
            />
          ),
        )}
      </div>
      <div className="workout-detail-actions">
        {replaceStage === null ? (
          <button
            type="button"
            className="button-primary"
            onClick={handleStart}
          >
            Start
          </button>
        ) : (
          <div className="baseline-confirm">
            <p className="baseline-confirm-line">
              {replaceStage === "unlogged"
                ? "You have an unlogged session — starting a new one discards it."
                : "A session is in progress — replace it?"}
            </p>
            <div className="baseline-actions">
              <button
                type="button"
                className="button-outline"
                onClick={() => setReplaceStage(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={startSession}
              >
                Replace session
              </button>
            </div>
          </div>
        )}
        {startError && <p className="baseline-error">{startError}</p>}
        {/* Task 3 (the manual door): gated on baselines with the exact same
            "no target" idiom Start's own footer uses at ConfirmTargets.tsx
            (`baselines ? <button> : <span className="step-row-no-target">`)
            — `buildManualLogSteps` (LogSession.tsx's manual door) takes a
            concrete `Baselines`, never a nullable one, so there is nothing
            honest to resolve a split against without them. A plain `Link`
            (not a `navigate()` button): this is a one-way hand-off to a new
            route, the same idiom `OwnerActions`' own Edit link below uses. */}
        {baselines ? (
          <Link to={`/library/${workout.id}/log`} className="button-outline">
            Log it after
          </Link>
        ) : (
          <span className="step-row-no-target">
            <em>no target</em> <Link to="/you">Set baselines</Link>
          </span>
        )}
      </div>
      {/* Globals are read-only server-side (a 403 on any mutation) — the UI
          must never present controls whose only outcome is that rejection,
          so Edit/Delete render only for the rower's own workouts. */}
      {!workout.isGlobal && (
        <OwnerActions workoutId={workout.id} navigate={navigate} from={from} />
      )}
    </main>
  );
}

function OwnerActions({
  workoutId,
  navigate,
  from,
}: {
  workoutId: string;
  navigate: (path: string) => void;
  from: unknown;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      const res = await api(`/api/workouts/${workoutId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Couldn't delete this workout. Try again.");
        return;
      }
      // Deliberately NOT `from`-chained (design doc: "Delete stays
      // /library"): whatever the rower came from may no longer make sense
      // after this workout is gone (e.g. a Today suggestion pointing at a
      // now-deleted workout), so delete always lands on the library
      // regardless of origin.
      navigate("/library");
    } catch {
      setError("Couldn't delete this workout. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="workout-owner-actions">
      <Link
        to={`/library/${workoutId}/edit`}
        state={{ from }}
        className="button-outline"
      >
        Edit
      </Link>
      {!confirming ? (
        <button
          type="button"
          className="button-outline"
          onClick={() => setConfirming(true)}
        >
          Delete
        </button>
      ) : (
        // Staged-confirm idiom (src/you/BaselineEditor.tsx): the destructive
        // action never fires on the first press. Copy is explicit that
        // logged history survives — session_logs.workout_id is set to NULL
        // on delete and each log keeps its own frozen title/type, so
        // deleting a workout does NOT erase the rower's past sessions of it.
        <div className="baseline-confirm">
          <p className="baseline-confirm-line">
            Delete this workout? Your logged sessions are kept — they keep their
            own copy of the title and type.
          </p>
          {error && <p className="baseline-error">{error}</p>}
          <div className="baseline-actions">
            <button
              type="button"
              className="button-outline"
              onClick={() => setConfirming(false)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={handleDelete}
              disabled={deleting}
            >
              Delete workout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
