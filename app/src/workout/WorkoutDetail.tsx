import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useWorkouts } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { estimateMinutes, liveSteps } from "../../domain/expand.js";
import type { Baselines } from "../../domain/types.js";
import TypeBadge from "../components/TypeBadge";
import StepRow from "./StepRow";

// Settings expose --pace-tolerance (tokens.css); read once at mount rather
// than hardcoding 1 so a future settings screen can change it without a
// WorkoutDetail code change.
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
  // Session-only preview nudges, keyed by expanded step index — never
  // persisted (Phase 6 will pass them per-request).
  const [nudges, setNudges] = useState<Record<number, number>>({});
  const [tolerance] = useState(readPaceTolerance);

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

  const steps = liveSteps(workout.steps);
  const minutesLabel = baselines
    ? `${estimateMinutes(workout.steps, baselines).minutes} MIN`
    : "— MIN";
  const daysLabel =
    workout.lastDoneDaysAgo === null
      ? "NEVER DONE"
      : `LAST DONE ${workout.lastDoneDaysAgo} DAYS AGO`;

  const handleNudge = (index: number, delta: number) => {
    setNudges((prev) => ({ ...prev, [index]: (prev[index] ?? 0) + delta }));
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
        {steps.map((step, index) => (
          <StepRow
            key={index}
            step={step}
            index={index}
            baselines={baselines}
            tolerance={tolerance}
            nudge={nudges[index] ?? 0}
            onNudge={(delta) => handleNudge(index, delta)}
          />
        ))}
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
    </main>
  );
}
