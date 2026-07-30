import { useState } from "react";
import { Link } from "react-router-dom";
import { useWorkouts } from "../api/useWorkouts";
import { useBaselines } from "../api/useBaselines";
import { estimateMinutes } from "../../domain/expand.js";
import type { Baselines } from "../../domain/types.js";
import {
  applyFilters,
  clearFilters,
  EMPTY_FILTERS,
  type Filters,
} from "./filters";
import FilterChips from "./FilterChips";
import WorkoutRow from "./WorkoutRow";

function Header() {
  return (
    <div className="library-header">
      <h1 className="screen-title">Library</h1>
      <div className="library-header-actions">
        <Link to="/library/import" className="library-import">
          IMPORT
        </Link>
        <Link to="/library/new" className="library-new">
          + NEW
        </Link>
      </div>
    </div>
  );
}

export default function Library() {
  const workoutsState = useWorkouts();
  const baselinesState = useBaselines();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  if (workoutsState.state === "loading" || baselinesState.state === "loading") {
    return (
      <main className="screen">
        <Header />
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (workoutsState.state === "error") {
    return (
      <main className="screen">
        <Header />
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
        <Header />
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

  // Duration filtering/display needs both baseline splits; a partially-set
  // pair (e.g. a brand-new account) is treated the same as "unknown".
  const baselines: Baselines | null =
    baselinesState.baselines.k2Seconds !== null &&
    baselinesState.baselines.k6Seconds !== null
      ? {
          k2Seconds: baselinesState.baselines.k2Seconds,
          k6Seconds: baselinesState.baselines.k6Seconds,
        }
      : null;

  const visible = applyFilters(workoutsState.workouts, filters, baselines);

  return (
    <main className="screen">
      <Header />
      <p className="library-count">{visible.length} ENTERED</p>
      <FilterChips filters={filters} onChange={setFilters} />
      {visible.length === 0 ? (
        <div className="library-empty">
          <p>No workouts match these filters.</p>
          <button
            type="button"
            className="button-outline"
            onClick={() => setFilters(clearFilters())}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="workout-list">
          {visible.map((workout) => (
            <li key={workout.id}>
              <WorkoutRow
                workout={workout}
                durationMinutes={
                  baselines
                    ? estimateMinutes(workout.steps, baselines).minutes
                    : null
                }
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
