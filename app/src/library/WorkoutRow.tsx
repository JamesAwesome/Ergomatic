import { Link } from "react-router-dom";
import type { LibraryWorkout } from "../api/useWorkouts";
import TypeBadge from "../components/TypeBadge";
import PainBar from "../components/PainBar";
import { structureLine } from "../../domain/display/stepDetail.js";

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
      {/* Line 2 of 3 (spec §3): structureLine takes authored steps only,
          never baselines (Task 1, domain/display/stepDetail.ts) — it
          renders for every row whether or not the signed-in user has
          baselines set, unlike Today's baseline-gated piece region. */}
      <span className="workout-row-structure">
        {structureLine(workout.steps)}
      </span>
      <div className="workout-row-line2">
        <TypeBadge type={workout.type} />
        {!workout.isGlobal && <span className="workout-row-custom">MINE</span>}
        <span className="workout-row-meta">
          {workout.difficulty.toUpperCase()} · {daysLabel}
        </span>
        <PainBar pain={workout.pain} type={workout.type} />
      </div>
      {!workout.isGlobal && (
        <span className="visually-hidden">, one of your own</span>
      )}
    </Link>
  );
}
