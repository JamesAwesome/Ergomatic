import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useWorkouts } from "../api/useWorkouts";
import type { LibraryWorkout } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { estimateMinutes } from "../../domain/expand.js";
import { resolveSplit } from "../../domain/pace.js";
import type { Baselines } from "../../domain/types.js";
import { MIN_SPLIT, MAX_SPLIT } from "../you/baselineDraft";
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
        <Link to="/library" className="back-link">
          ← BACK
        </Link>
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
  const navigate = useNavigate();

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
      const base = resolveSplit(baselines, step.ref, 0);
      const resolved = base + current + delta;
      const clamped = Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, resolved));
      return { ...prev, [index]: clamped - base };
    });
  };

  return (
    <main className="screen">
      <Link to="/library" className="back-link">
        ← BACK
      </Link>
      <div className="workout-detail-meta">
        <TypeBadge type={workout.type} />
        <span className="mono-status">
          NO. {workout.num} · {workout.difficulty.toUpperCase()}
        </span>
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
        <button
          type="button"
          className="button-primary"
          disabled
          title="Arrives in Phase 6"
        >
          Start
        </button>
        <button
          type="button"
          className="button-outline"
          disabled
          title="Arrives in Phase 6"
        >
          Log it after
        </button>
      </div>
      {/* Globals are read-only server-side (a 403 on any mutation) — the UI
          must never present controls whose only outcome is that rejection,
          so Edit/Delete render only for the rower's own workouts. */}
      {!workout.isGlobal && (
        <OwnerActions workoutId={workout.id} navigate={navigate} />
      )}
    </main>
  );
}

function OwnerActions({
  workoutId,
  navigate,
}: {
  workoutId: string;
  navigate: (path: string) => void;
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
      navigate("/library");
    } catch {
      setError("Couldn't delete this workout. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="workout-owner-actions">
      <Link to={`/library/${workoutId}/edit`} className="button-outline">
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
