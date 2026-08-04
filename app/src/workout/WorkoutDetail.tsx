import { useEffect, useRef, useState } from "react";
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
import { ARM_TIMEOUT_MS } from "../session/useStagedDiscard";
import BackLink from "../shell/BackLink";
import TypeBadge from "../components/TypeBadge";
import StepRow from "./StepRow";

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
              nudge={nudges[index] ?? 0}
              onNudge={(delta) => handleNudge(index, delta)}
            />
          ),
        )}
      </div>
      {/* Task 1 (ui-fix round): one `.action-stack` for every screen-level
          action — Start / Log it after / Edit / a rule / Delete workout —
          not two separate divs the way this used to split Start/Log it
          after from OwnerActions' own Edit/Delete. OwnerActions still owns
          its own wrapping element below (`.workout-owner-actions`, kept for
          e2e/builder.spec.ts's existing "absent for a global workout"
          check) but renders `display: contents` (index.css) so its children
          are this stack's own direct flex items, not a nested box breaking
          the 12px gap rhythm. */}
      <div className="action-stack workout-detail-actions">
        {replaceStage === null ? (
          <button type="button" className="button-l1" onClick={handleStart}>
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
          <Link
            to={`/library/${workout.id}/log`}
            state={{ from }}
            className="button-l2"
          >
            Log it after
          </Link>
        ) : (
          <span className="step-row-no-target">
            <em>no target</em> <Link to="/you">Set baselines</Link>
          </span>
        )}
        {/* Globals are read-only server-side (a 403 on any mutation) — the
            UI must never present controls whose only outcome is that
            rejection, so Edit/Delete render only for the rower's own
            workouts. */}
        {!workout.isGlobal && (
          <OwnerActions
            workoutId={workout.id}
            navigate={navigate}
            from={from}
          />
        )}
      </div>
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
  // Fix round 1 (F2): the two-button staged-confirm panel (Cancel beside a
  // second solid-`.button-primary` "Delete workout") sat outside the level
  // system this round otherwise landed everywhere else — a second
  // accent-filled block, and a side-by-side pair, on the exact screen this
  // round systematized. Replaced with the level system's OWN destructive
  // idiom: the L4 button arms IN PLACE (fills solid accent, copy swaps to
  // "Tap again to delete") rather than opening a side panel with its own
  // Cancel — the same two-tap safety, the system's own shape. `armed`
  // replaces the old `confirming` boolean 1:1.
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Belt-and-suspenders: a pending disarm timer must not fire (and call
  // setState) after this component has already unmounted — e.g. Edit was
  // clicked while armed, navigating away before the 4s elapses.
  useEffect(() => {
    return () => {
      if (disarmTimer.current !== null) clearTimeout(disarmTimer.current);
    };
  }, []);

  function disarm() {
    if (disarmTimer.current !== null) {
      clearTimeout(disarmTimer.current);
      disarmTimer.current = null;
    }
    setArmed(false);
  }

  function arm() {
    setArmed(true);
    disarmTimer.current = setTimeout(disarm, ARM_TIMEOUT_MS);
  }

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      const res = await api(`/api/workouts/${workoutId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Couldn't delete this workout. Try again.");
        disarm();
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
      disarm();
    } finally {
      setDeleting(false);
    }
  };

  // The button's own click handler carries both taps: the first arms (no
  // network call yet — logged history survives a delete regardless, but
  // the action itself never fires on a first press), the second — reached
  // only while already `armed`, which `disabled` can't be true for at the
  // same time as a delete in flight — fires it for real.
  function handleClick() {
    if (armed) {
      disarm();
      void handleDelete();
    } else {
      arm();
    }
  }

  return (
    // `display: contents` (index.css): this wrapper stays purely for the
    // e2e "absent for a global workout" check — visually its children are
    // direct items of the parent `.action-stack`, not a nested flex column
    // of their own, so the shared 12px gap and full-width sizing apply
    // exactly as if Edit/the rule/Delete were declared inline there.
    <div className="workout-owner-actions">
      <Link
        to={`/library/${workoutId}/edit`}
        state={{ from }}
        className="button-l2"
      >
        Edit
      </Link>
      <hr className="action-stack-rule" />
      <button
        type="button"
        className={armed ? "button-l4-armed" : "button-l4"}
        onClick={handleClick}
        onBlur={disarm}
        disabled={deleting}
      >
        {armed ? "Tap again to delete" : "Delete workout"}
      </button>
      {error && <p className="baseline-error">{error}</p>}
    </div>
  );
}
