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
    <Link to={`/library/${workout.id}`} className="workout-row">
      <div className="workout-row-line1">
        <span className="workout-row-title">{workout.title}</span>
        <span className="workout-row-duration">
          {durationMinutes !== null ? `${durationMinutes}′` : "—"}
        </span>
      </div>
      <div className="workout-row-line2">
        <TypeBadge type={workout.type} />
        <span className="workout-row-meta">
          {workout.difficulty.toUpperCase()} · {daysLabel}
        </span>
        <PainBar pain={workout.pain} type={workout.type} />
      </div>
    </Link>
  );
}
