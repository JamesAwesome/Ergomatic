import { useState } from "react";
import { ONBOARDING_DURATION_COPY } from "../../domain/onboarding.js";
import {
  useStartWorkout,
  type StartableWorkout,
} from "../session/useStartWorkout";

type OnboardingDistance = "k6" | "k2";

const CHIP_TEXT: Record<OnboardingDistance, string> = {
  k6: "6K BASELINE · NOT SET · ROW IT HOW IT FEELS",
  k2: "2K BASELINE · NOT SET · ROW IT HOW IT FEELS",
};

const INSTEAD_LABEL: Record<OnboardingDistance, string> = {
  // The label names the OTHER distance — tapping it swaps you TO that one
  // (spec: "2K INSTEAD ... swaps the card to the 2k variant (and back: 6K
  // INSTEAD)").
  k6: "2K INSTEAD",
  k2: "6K INSTEAD",
};

const OTHER: Record<OnboardingDistance, OnboardingDistance> = {
  k6: "k2",
  k2: "k6",
};

/** The card's own inner body — split out from `BaselineCard` so
 *  `useStartWorkout` (a hook) is only ever called once `workout` is known
 *  to exist, never conditionally (mirrors `WorkoutDetail`/
 *  `WorkoutDetailView`'s identical split, for the identical reason).
 *  `key={distance}` at the call site remounts this on every toggle, so a
 *  staged replace-confirmation for the 6k never survives a swap to the 2k
 *  (they are, correctly, two different workouts with two different
 *  start-guard states). */
function BaselineCardBody({
  workout,
  distance,
  showToggle,
  onToggle,
}: {
  workout: StartableWorkout;
  distance: OnboardingDistance;
  showToggle: boolean;
  onToggle: () => void;
}) {
  // `{}` — no preview surface on this card (fast-follow spec §3, entry 3);
  // deliberately no baselines guard either — the card's own workout is
  // effort-only by construction (it's the onboarding baseline-setter
  // itself), so `needsBaselines` never blocks it. That exemption lives in
  // `WorkoutDetail.tsx`'s own predicate, not here — there is nothing to
  // exempt from in the first place.
  const {
    replaceStage,
    startError,
    handleStart,
    confirmReplace,
    cancelReplace,
  } = useStartWorkout(workout, {});

  return (
    <div className="baselinecard">
      <span className="baselinecard-label mono-status">
        SUGGESTED · SETS YOUR BASELINE
      </span>
      <div className="baselinecard-top">
        <h2 className="baselinecard-title">{workout.title}</h2>
        <span className="baselinecard-duration">
          {ONBOARDING_DURATION_COPY[distance]}
        </span>
      </div>
      <span className="baselinecard-chip mono-status">
        {CHIP_TEXT[distance]}
      </span>
      {replaceStage === null ? (
        <button type="button" className="button-l1" onClick={handleStart}>
          Start
        </button>
      ) : (
        // Same staged replace-confirm shape as WorkoutDetail.tsx's own
        // inline panel — this card carries the identical
        // `useStartWorkout` flow (spec: "not duplicated and not skipped"),
        // so the two must look and behave identically, not just share
        // logic under the hood.
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
      {showToggle && (
        <button type="button" className="button-l2" onClick={onToggle}>
          {INSTEAD_LABEL[distance]}
        </button>
      )}
    </div>
  );
}

/** The no-baseline SETS YOUR BASELINE card (design spec, screen 2b) —
 *  replaces Today's normal suggestion card while either baseline is null.
 *  `k6Workout`/`k2Workout` are the two designated global seed workouts
 *  (`domain/onboarding.ts`'s `ONBOARDING_TITLES`), looked up by the CALLER
 *  (Today.tsx already has the full library list fetched) rather than
 *  fetched again here — `undefined` is the defensive "not found" case
 *  (never expected in production: the server seeds both unconditionally,
 *  Phase 6I Task 3), rendered as nothing rather than crashing on a missing
 *  workout the rest of the app assumes always exists.
 *
 *  Either-null rule (spec, corrected by the antagonistic pass): both null
 *  defaults to the 6k with a `2K INSTEAD` toggle; exactly one null offers
 *  ONLY the missing distance, with no toggle at all (there is nothing to
 *  toggle TO — the other baseline is already set). */
export default function BaselineCard({
  k6Missing,
  k2Missing,
  k6Workout,
  k2Workout,
}: {
  k6Missing: boolean;
  k2Missing: boolean;
  k6Workout: StartableWorkout | undefined;
  k2Workout: StartableWorkout | undefined;
}) {
  const bothMissing = k6Missing && k2Missing;
  // Reachable only when exactly one baseline is missing (the caller never
  // renders this component with NEITHER missing) — `k6Missing` alone then
  // tells the whole story: true means 6k is the missing (and only offered)
  // one, false means 2k is.
  const onlyMissing: OnboardingDistance = k6Missing ? "k6" : "k2";
  const [toggled, setToggled] = useState<OnboardingDistance>("k6");
  const distance = bothMissing ? toggled : onlyMissing;
  const workout = distance === "k6" ? k6Workout : k2Workout;

  if (!workout) return null;

  return (
    <BaselineCardBody
      key={distance}
      workout={workout}
      distance={distance}
      showToggle={bothMissing}
      onToggle={() => setToggled((d) => OTHER[d])}
    />
  );
}
