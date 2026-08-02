import { Link } from "react-router-dom";
import type { LibraryWorkout } from "../api/useWorkouts";
import TypeBadge from "../components/TypeBadge";
import PainBar from "../components/PainBar";

export default function WorkoutRow({
  workout,
  durationMinutes,
}: {
  workout: LibraryWorkout;
  durationMinutes: number | null;
}) {
  const daysLabel =
    workout.lastDoneDaysAgo === null
      ? "NEVER DONE"
      : `${workout.lastDoneDaysAgo}D AGO`;

  return (
    <Link
      to={`/library/${workout.id}`}
      state={{ from: "/library" }}
      className="workout-row"
    >
      <div className="workout-row-line1">
        <span className="workout-row-title">{workout.title}</span>
        <span className="workout-row-duration">
          {/* Rounded for display only — filters.ts calls estimateMinutes
              itself for bucketing, so the unrounded value still reaches the
              duration-bucket filter. estimateMinutes (domain/expand.ts)
              already rounds internally, so Library.tsx's own call site never
              hands this a fraction today — but this prop is typed `number`,
              and Phase 6's distance-based estimation may well produce one,
              so this component must not print "2.25′" if a future caller
              passes a fractional value. See WorkoutRow.test.tsx. */}
          {durationMinutes !== null ? `${Math.round(durationMinutes)}′` : "—"}
        </span>
      </div>
      <div className="workout-row-line2">
        <TypeBadge type={workout.type} />
        {!workout.isGlobal && (
          <span className="workout-row-custom">CUSTOM</span>
        )}
        <span className="workout-row-meta">
          {workout.difficulty.toUpperCase()} · {daysLabel}
        </span>
        <PainBar pain={workout.pain} type={workout.type} />
      </div>
      {!workout.isGlobal && (
        <span className="visually-hidden">, custom workout</span>
      )}
    </Link>
  );
}
