import { ONBOARDING_TITLES } from "../../domain/onboarding.js";
import { useWorkouts } from "../api/useWorkouts";
import {
  useStartWorkout,
  type StartableWorkout,
} from "../session/useStartWorkout";

/** Phase BL PR B (baseline-onboarding spec 2026-08-22 rev 2, "The
 *  You-screen re-test shortcut"): row the 6k / race the 2k, right beside
 *  the baseline fields — one tap from the numbers to the session that
 *  measures them, landing (on completion) in the post-test prompt.
 *
 *  Reuses `useStartWorkout` — NOT `BaselineCard` (spec M7: the card
 *  refuses to render for a both-set account, and its distance toggle
 *  only exists in the both-missing state; this shortcut exists precisely
 *  FOR the account whose baselines are already set). The hook carries
 *  the full F5 data-loss guard set: an unlogged run or in-progress draft
 *  stages the same replace confirm every other start surface shows.
 *
 *  Identity: the designated GLOBAL rows only (`ONBOARDING_TITLES` +
 *  `isGlobal`, domain/onboarding.ts's own rule). A missing row hides its
 *  button; a loading or errored library renders nothing at all — this is
 *  a shortcut, not a capability the screen owes, and You must never gate
 *  its baselines editor behind the workouts fetch. */
function RetestButton({
  workout,
  label,
}: {
  workout: StartableWorkout;
  label: string;
}) {
  const {
    replaceStage,
    startError,
    handleStart,
    confirmReplace,
    cancelReplace,
  } = useStartWorkout(workout, {});

  return (
    <div
      className={
        replaceStage === null ? "retest-item" : "retest-item retest-item-staged"
      }
    >
      {replaceStage === null ? (
        <button
          type="button"
          className="button-l3 retest-button"
          onClick={handleStart}
        >
          {label}
        </button>
      ) : (
        // The staged replace confirm, byte-for-byte BaselineCard's own
        // panel (which is itself WorkoutDetail's) — same guard, same look,
        // one more surface it protects.
        <div className="baseline-confirm">
          <p className="baseline-confirm-line">
            {replaceStage === "unlogged"
              ? "You have an unlogged session. Starting a new one discards it."
              : "A session is in progress. Replace it?"}
          </p>
          <div className="baseline-actions">
            <button
              type="button"
              className="button-outline"
              onClick={cancelReplace}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={confirmReplace}
            >
              Replace session
            </button>
          </div>
        </div>
      )}
      {startError && <p className="baseline-error">{startError}</p>}
    </div>
  );
}

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
      <p className="mono-status retest-caption">
        RE-TEST · THE RESULT IS OFFERED AFTER SAVING
      </p>
      <div className="retest-row">
        {k6 !== undefined && <RetestButton workout={k6} label="ROW THE 6K" />}
        {k2 !== undefined && <RetestButton workout={k2} label="RACE THE 2K" />}
      </div>
    </div>
  );
}
