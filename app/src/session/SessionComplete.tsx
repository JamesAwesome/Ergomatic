import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { keepAwakeOff } from "../adapters/keepAwake";
import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import { isComplete, type EnginePhase } from "./engine";
import { loadDraft, type SessionDraft } from "./draft";
import { loadRun, type PhaseActual, type SessionRun } from "./run";
import { phaseKindWord } from "./Timer";

/** The session's own wall-clock length: `completedAt` minus `startedAt`,
 *  both stamped by the engine (buildRun/tick/advance) — not a sum of phase
 *  durations, which would silently exclude however long the rower spent
 *  paused or lingering on a staged confirm. Never negative (defensive floor,
 *  same discipline as `engine.ts`'s own `phaseElapsedMs`), though the
 *  engine's own invariant — `completedAt` is only ever stamped by a
 *  transition running strictly after `startedAt` — means this shouldn't
 *  actually go negative in practice. */
// eslint-disable-next-line react-refresh/only-export-components
export function totalElapsedSeconds(run: SessionRun): number {
  const completedAt = run.completedAt;
  if (completedAt === null) return 0;
  const ms =
    new Date(completedAt).getTime() - new Date(run.startedAt).getTime();
  return Math.max(0, Math.round(ms / 1000));
}

/** The actuals list, in phase order (not insertion/object-key order, which
 *  `Object.entries` on a numeric-keyed object happens to already give
 *  ascending for small non-negative integers, but that's an implementation
 *  detail of JS object key ordering this doesn't want to depend on). Only
 *  distance phases ever get an entry (`run.ts`'s own `PhaseActual` doc:
 *  the engine only ever records one via `nextDistance`/the frozen-elapsed
 *  paths in Timer.tsx) — a time-based work phase has nothing recorded here,
 *  by design, not an oversight; 6C's own "Log session" screen (README §7) is
 *  where a session's HELD/UNDER/OVER judgment and full step list live. */
// eslint-disable-next-line react-refresh/only-export-components
export function actualRows(
  run: SessionRun,
): { phase: EnginePhase; actual: PhaseActual }[] {
  return Object.entries(run.actuals)
    .map(([key, actual]) => ({ index: Number(key), actual }))
    .sort((a, b) => a.index - b.index)
    .flatMap(({ index, actual }) => {
      const phase = run.phases[index];
      return phase === undefined ? [] : [{ phase, actual }];
    });
}

/** SessionComplete: the screen `Timer.tsx` hands off to the instant
 *  `isComplete(run)` — name, TOTAL (house `fmtDuration`, not the "302 MIN"
 *  totals format `duration.ts`'s own header reserves for estimates: this is
 *  a real elapsed clock reading, the same convention `TimerRuler.tsx`'s own
 *  TOTAL LEFT already established), each distance phase's recorded actual
 *  split, and two actions: Log this session (primary, `/session/log` — the
 *  session door, Phase 6C Task 2) and Back to Today (outline). Deliberately
 *  does NOT clear the run record itself — LogSession.tsx's own save/discard
 *  are the only things that do (a completed-but-unlogged run persisting is
 *  the whole point of Today's amended stale-discard rule); Timer's own
 *  END→Abandon is the only other path that clears it. Keep-awake: ON since
 *  Countdown's own mount, carried
 *  through Timer — this screen's only job is to turn it back OFF, once, on
 *  mount (not spanning its own lifetime the way Countdown/Timer's effects
 *  do): `keepAwakeOff` is idempotent (its own doc comment), so this is safe
 *  even though Timer's unmount, moments earlier, already released it in the
 *  ordinary router-navigation case — a direct/reload landing here (draft +
 *  a completed run both survive in storage) is the case this guards. */
export default function SessionComplete() {
  const navigate = useNavigate();
  // Lazy initializers: read both fresh from storage exactly once, the same
  // idiom every other session screen uses (Timer.tsx's own comment on this).
  const [draft] = useState<SessionDraft | null>(() => loadDraft());
  const [run] = useState<SessionRun | null>(() => loadRun());

  useEffect(() => {
    void keepAwakeOff();
  }, []);

  // Deep-link/reload guard, mirroring Timer.tsx's own: no draft, no run, or
  // a run that isn't actually complete (a direct nav here mid-session,
  // Timer's own effect hasn't fired yet) all bounce to Today rather than
  // rendering a screen with nothing real to show.
  if (draft === null || run === null || !isComplete(run)) {
    return <Navigate to="/today" replace />;
  }

  const rows = actualRows(run);

  function handleBack() {
    navigate("/today");
  }

  return (
    <main className="screen session-complete-screen">
      <h1 className="screen-title">{draft.title}</h1>
      <div className="complete-total">
        <span className="complete-total-label">TOTAL</span>
        <span className="complete-total-value">
          {fmtDuration(totalElapsedSeconds(run) / 60)}
        </span>
      </div>
      {rows.length > 0 && (
        <ul className="complete-actuals">
          {rows.map(({ phase, actual }, i) => (
            <li key={i} className="complete-actual-row">
              <span className="complete-actual-label">
                {phaseKindWord(phase.type)}
                {phase.meters !== undefined ? ` · ${phase.meters}M` : ""}
              </span>
              <span className="complete-actual-value">
                {fmtSplit(actual.splitSeconds)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="complete-actions">
        <Link to="/session/log" className="button-primary complete-log">
          Log this session
        </Link>
        <button
          type="button"
          className="button-outline complete-back"
          onClick={handleBack}
        >
          Back to Today
        </button>
      </div>
    </main>
  );
}
