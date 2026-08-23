import { Link, useNavigate } from "react-router-dom";
import {
  ONBOARDING_DURATION_COPY,
  ONBOARDING_TITLES,
} from "../../domain/onboarding.js";
import { useWorkouts } from "../api/useWorkouts";

/** Door 3 — "Row to find my baseline" (canvas RowPath): the distance
 *  choice. Two cards in the old BaselineCard's ANATOMY (label / title +
 *  duration / dashed chip / lead action) but NEW UI — the phase-open gate
 *  proved the old component itself cannot serve these states (it refuses
 *  to render for a both-set account and its toggle only exists
 *  both-missing), and BOTH cards render here regardless of which single
 *  baseline might exist (the spec's superset ruling: either distance is a
 *  legitimate re-test).
 *
 *  Start is PURE NAVIGATION to the designated test's DETAIL screen — the
 *  one offering Connect / Start Timer / Log it after (the #168 pattern,
 *  same as you/RetestShortcut.tsx) — with `state.from` pointing back
 *  here, so the detail's BackLink returns honestly. The start guards
 *  live where they already are (useStartWorkout's replaceStage,
 *  ConnectAction's connectGuardStage); this screen writes nothing.
 *  Completing the test lands in PR B's post-save prompt, whose accept
 *  offers the derived counterpart — that is what completes the pair.
 *
 *  Copy: the 6k card carries James's 2026-08-23 ruling — "strong and
 *  steady", with the newcomer's not-breakneck reminder on the chip —
 *  replacing the canvas's earlier "relaxed / row it how it feels"
 *  framing (the committed canvas is updated in the same commit). The 2k
 *  card's ALL OUT framing stands, and the 6K Test WORKOUT itself still
 *  renders MAX everywhere (v0.18.1's ruling, untouched here).
 *
 *  Identity: the designated GLOBAL rows only (ONBOARDING_TITLES +
 *  isGlobal — a rower's own same-titled custom workout must never run
 *  under this banner; domain/onboarding.ts's rule). A missing row hides
 *  its card (defensive; the server seeds both unconditionally). */
export default function RowToFind() {
  const navigate = useNavigate();
  const workoutsState = useWorkouts();

  if (workoutsState.state === "loading") {
    return (
      <main className="screen onb-screen">
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (workoutsState.state === "error") {
    return (
      <main className="screen onb-screen">
        <p className="mono-status">Couldn't load the test workouts.</p>
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

  const k6 = workoutsState.workouts.find(
    (w) => w.title === ONBOARDING_TITLES.k6 && w.isGlobal,
  );
  const k2 = workoutsState.workouts.find(
    (w) => w.title === ONBOARDING_TITLES.k2 && w.isGlobal,
  );

  return (
    <main className="screen onb-screen">
      <span className="mono-status">ROW TO FIND MY BASELINE</span>
      <h1 className="screen-title onb-title">Pick your distance</h1>
      <p className="onb-body">
        Either one sets your baseline. The 6k is the gentler door.
      </p>
      {k6 !== undefined && (
        <div className="onb-rowcard">
          <span className="onb-rowcard-label mono-status">
            SETS YOUR BASELINE
          </span>
          <div className="onb-rowcard-top">
            <span className="onb-rowcard-title">Row a strong, steady 6k</span>
            <span className="onb-rowcard-duration">
              {ONBOARDING_DURATION_COPY.k6}
            </span>
          </div>
          <span className="onb-chip mono-status">
            6K BASELINE · STRONG AND STEADY · NOT A SPRINT
          </span>
          <Link
            to={`/library/${k6.id}`}
            state={{ from: "/onboarding/row" }}
            className="button-l1 onb-rowcard-start"
          >
            Start
          </Link>
        </div>
      )}
      {k2 !== undefined && (
        <div className="onb-rowcard">
          <span className="onb-rowcard-label mono-status">
            SETS YOUR BASELINE
          </span>
          <div className="onb-rowcard-top">
            <span className="onb-rowcard-title">Race a 2k</span>
            <span className="onb-rowcard-duration">
              {ONBOARDING_DURATION_COPY.k2}
            </span>
          </div>
          <span className="onb-chip mono-status">
            2K BASELINE · NOT SET · ALL OUT, EMPTY THE TANK
          </span>
          <Link
            to={`/library/${k2.id}`}
            state={{ from: "/onboarding/row" }}
            className="button-l1 onb-rowcard-start"
          >
            Start
          </Link>
        </div>
      )}
      <div className="onb-foot">
        <button
          type="button"
          className="button-outline onb-back"
          onClick={() => navigate("/today")}
        >
          Back
        </button>
      </div>
    </main>
  );
}
