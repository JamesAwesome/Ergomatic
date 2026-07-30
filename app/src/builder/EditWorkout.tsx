import { Link, useParams } from "react-router-dom";
import { useWorkouts } from "../api/useWorkouts";
import Builder from "./Builder";
import {
  fromWorkout,
  hasMidSpanReps,
  hasUnsupportedSteps,
} from "./builderState";

// Loading/error/404 states mirror WorkoutDetail.tsx's — deliberately
// duplicated rather than extracted, matching the precedent Builder.tsx set
// for readPaceTolerance (a shared helper wasn't worth it for this small a
// screen count).
export default function EditWorkout() {
  const { id } = useParams();
  const workoutsState = useWorkouts();

  if (workoutsState.state === "loading") {
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

  // Defence in depth: the Edit link is never rendered for a global workout
  // (WorkoutDetail.tsx), but a hand-typed /library/:id/edit URL must not
  // present an editor whose save the server will 403 anyway.
  if (workout.isGlobal) {
    return (
      <main className="screen">
        <p className="mono-status">Starter workouts can't be edited yet.</p>
        <Link to={`/library/${workout.id}`} className="back-link">
          ← BACK
        </Link>
      </main>
    );
  }

  // The BuilderRow model has no representation for a `test` step at all —
  // fromWorkout would silently drop it, and re-saving from the builder
  // would then destroy it for good. Check BEFORE calling fromWorkout and
  // refuse to open the editor rather than let that happen quietly.
  if (hasUnsupportedSteps(workout.steps)) {
    return (
      <main className="screen">
        <p className="mono-status">
          This workout can't be edited yet — it has a step type the builder
          doesn't support.
        </p>
        <Link to={`/library/${workout.id}`} className="back-link">
          ← BACK
        </Link>
      </main>
    );
  }

  // The row model's repeat span is derived from row kinds/position
  // (spanStartIndex), not stored — so a `reps` marker anywhere other than
  // where that derivation would put it can't be represented either. Same
  // precedent as the check above: refuse to open rather than let a save
  // silently move the marker and change the workout's meaning.
  if (hasMidSpanReps(workout.steps)) {
    return (
      <main className="screen">
        <p className="mono-status">
          This workout can't be edited yet — its repeat structure can't be
          represented here.
        </p>
        <Link to={`/library/${workout.id}`} className="back-link">
          ← BACK
        </Link>
      </main>
    );
  }

  return (
    <Builder
      mode={{ kind: "edit", id: workout.id, initial: fromWorkout(workout) }}
    />
  );
}
