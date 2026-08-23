import { Link } from "react-router-dom";
import { ONBOARDING_TITLES } from "../../domain/onboarding.js";
import { useWorkouts } from "../api/useWorkouts";

/** Phase BL PR B, reshaped by James's tester feedback (2026-08-22): row
 *  the 6k / race the 2k, right beside the baseline fields — one tap from
 *  the numbers to the designated test's DETAIL screen, the one offering
 *  Connect / Start Timer / Log it after. The original shipped straight
 *  into the timer via `useStartWorkout`; the feedback ("It should take me
 *  to the connect/start timer/log it after screen") makes this a pure
 *  navigation, so the F5 data-loss guards now fire where they already
 *  live: `useStartWorkout`'s staged replace confirm on the detail's Start
 *  Timer, and `ConnectAction`'s `connectGuardStage` on Connect — this
 *  component itself starts nothing and writes nothing.
 *
 *  `state={{ from: "/you" }}`: the detail's `BackLink` reads it, so BACK
 *  returns HERE, not the /library fallback ("Make sure back takes you to
 *  the You screen") — the same origin idiom every other entry Link uses.
 *
 *  Identity: the designated GLOBAL rows only (`ONBOARDING_TITLES` +
 *  `isGlobal`, domain/onboarding.ts's own rule). A missing row hides its
 *  link; a loading or errored library renders nothing at all — this is
 *  a shortcut, not a capability the screen owes, and You must never gate
 *  its baselines editor behind the workouts fetch. */
export default function RetestShortcut() {
  const workoutsState = useWorkouts();
  if (workoutsState.state !== "ready") return null;

  const k6 = workoutsState.workouts.find(
    (w) => w.title === ONBOARDING_TITLES.k6 && w.isGlobal,
  );
  const k2 = workoutsState.workouts.find(
    (w) => w.title === ONBOARDING_TITLES.k2 && w.isGlobal,
  );
  if (k6 === undefined && k2 === undefined) return null;

  return (
    <div className="retest">
      {k6 !== undefined && (
        <Link
          to={`/library/${k6.id}`}
          state={{ from: "/you" }}
          className="button-l3 retest-button"
        >
          ROW THE 6K
        </Link>
      )}
      {k2 !== undefined && (
        <Link
          to={`/library/${k2.id}`}
          state={{ from: "/you" }}
          className="button-l3 retest-button"
        >
          RACE THE 2K
        </Link>
      )}
    </div>
  );
}
