import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { keepAwakeOff, keepAwakeOn } from "../adapters/keepAwake";
import { fmtDuration } from "../../domain/duration.js";
import { phaseSeconds } from "../../domain/expand.js";
import {
  advance,
  elapsedSeconds,
  isComplete,
  nextDistance,
  pause,
  remainingSeconds,
  resume,
  rewind,
  tick,
  totalRemainingSeconds,
  type EnginePhase,
} from "./engine";
import { clearDraft, loadDraft, type SessionDraft } from "./draft";
import { clearRun, loadRun, saveRun, type SessionRun } from "./run";
import TimerTargets from "./TimerTargets";
import TimerRuler from "./TimerRuler";

/** STEP N OF M's own kind word — a fixed vocabulary independent of the
 *  phase's resolved TARGET (that lives on `EnginePhase.label`; this reads
 *  only `.type`). */
// eslint-disable-next-line react-refresh/only-export-components
export function phaseKindWord(type: EnginePhase["type"]): string {
  switch (type) {
    case "warmup":
      return "WARM-UP";
    case "work":
      return "WORK";
    case "rest":
      return "REST";
    case "test":
      return "TEST";
  }
}

/** "STEP N OF M · WORK · SET 1/4" — handoff §6's own example, reproduced
 *  verbatim for a repeated time work phase — plus, for a distance phase,
 *  its own meters target folded in (`· 2000M`). The brief's "meters …"
 *  requirement for distance mode has no dedicated slot in the handoff's own
 *  static markup (the design prototype models only time phases); this is
 *  where it lives instead of a new UI element, since a distance phase
 *  otherwise has no visible label for what it's a distance OF. See the
 *  task-3 report. */
// eslint-disable-next-line react-refresh/only-export-components
export function stepLineText(
  phase: EnginePhase,
  index: number,
  total: number,
): string {
  const parts = [`STEP ${index + 1} OF ${total}`, phaseKindWord(phase.type)];
  if (phase.set) parts.push(`SET ${phase.set.index}/${phase.set.of}`);
  if (phase.meters !== undefined) parts.push(`${phase.meters}M`);
  return parts.join(" · ");
}

/** The 96px numeral's seconds: a countdown for any phase with a fixed
 *  duration, a count-UP stopwatch otherwise. `engine.ts`'s own
 *  `remainingSeconds` doc comment already says a phase with no fixed
 *  `seconds` "has nothing to count down from" — true of a distance phase
 *  (the brief's own explicit case) AND an open-ended "test" phase alike; a
 *  test phase frozen at a static `0:00` for its entire duration would be a
 *  useless display, not a faithful reading of the brief's literal text
 *  either. */
// eslint-disable-next-line react-refresh/only-export-components
export function bigNumberSeconds(
  run: SessionRun,
  phase: EnginePhase,
  now: Date,
): number {
  return phase.seconds !== undefined
    ? remainingSeconds(run, now)
    : elapsedSeconds(run, now);
}

/** The 6px phase-progress bar's fill, 0-100 — reuses `domain/expand.js`'s
 *  `phaseSeconds` estimate for a distance phase exactly as
 *  `totalRemainingSeconds` does (the shared formula, not a second copy of
 *  it). A "test" phase has no full duration to divide by (`phaseSeconds`
 *  returns null), so its bar stays empty throughout — consistent with its
 *  open-ended nature, never a divide-by-zero. */
// eslint-disable-next-line react-refresh/only-export-components
export function phaseProgressPct(phase: EnginePhase, elapsed: number): number {
  const full = phaseSeconds(phase);
  if (full === null || full <= 0) return 0;
  return Math.min(100, Math.max(0, (elapsed / full) * 100));
}

/** TOTAL LEFT's denominator: every phase's full duration, summed from the
 *  START of the run — invariant across the whole session (phases are
 *  frozen at `buildRun` time), unlike `totalRemainingSeconds` which shrinks
 *  as the rower progresses. Shares `phaseSeconds`, not a reimplementation
 *  of its formula. */
// eslint-disable-next-line react-refresh/only-export-components
export function totalSessionSeconds(run: SessionRun): number {
  return run.phases.reduce((sum, p) => sum + (phaseSeconds(p) ?? 0), 0);
}

/** UP NEXT's text: the next phase's kind + resolved target, or `FINISH`
 *  past the last phase. `EnginePhase` carries no `desc`/duration phrase (an
 *  implementation detail of the domain's `Phase`, not something 6B adds) —
 *  Countdown.tsx's own next-phase line hit the identical gap and made the
 *  same call: the resolved label alone, not a reconstructed two-part
 *  prototype phrase built from data this app doesn't have. */
// eslint-disable-next-line react-refresh/only-export-components
export function upNextText(run: SessionRun): string {
  const next = run.phases[run.index + 1];
  if (next === undefined) return "FINISH";
  return `${phaseKindWord(next.type)} · ${next.label}`;
}

/** The suspect-actual seam (Phase 6B Task 1 review, product; routed into
 *  this task's ledger). After a long suspend, a distance phase's honest
 *  stopwatch can be huge — recording it as-is on NEXT would silently log an
 *  absurd split (the review's own example: a 2000m piece "finished" at a
 *  7:30/500m pace after a long suspend). `estimate` is `domain/expand.js`'s
 *  own `phaseSeconds` — the exact formula `totalRemainingSeconds` already
 *  uses to price a distance phase's full duration. More than double it and
 *  the timer stages a choice instead of recording silently. */
// eslint-disable-next-line react-refresh/only-export-components
export function isSuspectActual(
  phase: EnginePhase,
  elapsedSecondsValue: number,
): boolean {
  const estimate = phaseSeconds(phase);
  return estimate !== null && elapsedSecondsValue > estimate * 2;
}

/** The live timer (handoff §6). Portrait only — landscape is Task 4's own
 *  `@media (orientation: landscape)` layer over this exact component.
 *
 *  One 1s interval repaints; every displayed number is computed fresh from
 *  engine functions against `new Date()`, never accumulated — the same
 *  wall-clock discipline `engine.ts` itself documents. `tick()` runs on
 *  every repaint AND on `visibilitychange` (the catch-up walk needs to fire
 *  the instant a locked screen wakes, not up to a second later on the next
 *  interval tick). */
export default function Timer() {
  const navigate = useNavigate();
  // Lazy initializers: read both fresh from storage exactly once, the same
  // idiom every other session screen uses, so a real browser reload lands
  // here exactly as if this were the first render.
  const [draft] = useState<SessionDraft | null>(() => loadDraft());
  const [run, setRun] = useState<SessionRun | null>(() => loadRun());
  const [now, setNow] = useState<Date>(() => new Date());
  const [endStaged, setEndStaged] = useState(false);
  const [suspect, setSuspect] = useState(false);

  // Keep-awake spans the screen's whole lifetime (spec: "on during
  // countdown + timer + complete, released on exit"). Countdown already
  // released it on ITS OWN unmount when it handed off here, so the timer
  // must re-acquire it independently or the screen would go dark mid-
  // workout. Platform-split lives entirely inside the adapter — this
  // component never calls isNative() itself.
  useEffect(() => {
    void keepAwakeOn();
    return () => void keepAwakeOff();
  }, []);

  // Applies a pure engine transition at the CURRENT wall-clock instant,
  // persisting the result when it actually changed (reference equality —
  // every engine function returns the SAME run object on a no-op, per
  // engine.ts's own contract) and refreshing `now` so the numbers on screen
  // reflect this exact moment, not whenever the next 1s tick lands.
  function apply(fn: (r: SessionRun, at: Date) => SessionRun) {
    const at = new Date();
    setNow(at);
    setRun((prev) => {
      if (prev === null) return prev;
      const next = fn(prev, at);
      if (next !== prev) saveRun(next);
      return next;
    });
  }

  // The repaint loop: depends on a boolean (whether a run exists at all),
  // not on `run` itself — `run` changes every tick, and depending on the
  // object directly would tear the interval down and recreate it every
  // single second instead of running continuously (the same idiom
  // Countdown.tsx's own tick effect uses for the identical reason).
  const hasRun = run !== null;
  useEffect(() => {
    if (!hasRun) return;
    const repaint = () => apply(tick);
    const id = setInterval(repaint, 1000);
    document.addEventListener("visibilitychange", repaint);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", repaint);
    };
  }, [hasRun]);

  // Past the last phase: hand off to Task 4's session-complete screen. That
  // route doesn't exist yet in this task (Task 4 builds it); until it
  // lands, AppRoutes' own catch-all redirects an unregistered path to
  // /today, which is a harmless intermediate state — this task's own e2e
  // deliberately doesn't drive a workout to completion (brief: "your task's
  // e2e covers the timer through phases, not completion").
  useEffect(() => {
    if (run !== null && isComplete(run)) {
      navigate("/session/complete");
    }
  }, [run, navigate]);

  if (draft === null || run === null) {
    return <Navigate to="/today" replace />;
  }

  if (isComplete(run)) {
    // The single render between completion and the effect above
    // committing its navigate — not a stuck state.
    return (
      <main className="screen timer-screen">
        <p className="mono-status">Finishing…</p>
      </main>
    );
  }

  // Assigning to new `const`s (rather than reading `draft`/`run` directly
  // inside the closures below) is deliberate, same reasoning as
  // ConfirmTargets.tsx's own `handleStart` comment: a nested function
  // declared later in this body shouldn't have to re-prove what the guard
  // above already established. `title`/`currentRun` are typed non-nullable
  // from the moment they're declared, not narrowed-and-hoping the closure
  // remembers it.
  const title = draft.title;
  const currentRun: SessionRun = run;
  const phase = currentRun.phases[currentRun.index]!;
  const isDistance = phase.meters !== undefined;
  const elapsed = elapsedSeconds(currentRun, now);
  const pausedAt = currentRun.pausedAt;

  function handleEndTap() {
    // Pausing before staging the confirm means the phase clock can't
    // silently auto-advance (or complete the run) while the rower is still
    // deciding — `tick()` still fires every second in the background
    // regardless of `endStaged`, since this component has no idea a
    // decision is pending.
    apply(pause);
    setEndStaged(true);
  }

  function handleKeepGoing() {
    // Deliberately does NOT resume — same rule Pause/Resume already
    // follows everywhere else: pausing is explicit, so is resuming. The
    // rower presses ▶ Resume same as if they'd paused for any other
    // reason.
    setEndStaged(false);
  }

  function handleAbandon() {
    clearDraft();
    clearRun();
    navigate("/today");
  }

  function handlePauseResume() {
    apply(pausedAt !== null ? resume : pause);
  }

  function handlePrev() {
    apply(rewind);
  }

  function handleNext() {
    apply(advance);
  }

  function handleDistanceNext() {
    const at = new Date();
    if (isSuspectActual(phase, elapsedSeconds(currentRun, at))) {
      setSuspect(true);
      return;
    }
    apply(nextDistance);
  }

  function handleKeepSplit() {
    apply(nextDistance);
    setSuspect(false);
  }

  function handleDiscardSplit() {
    // Discard records NO actual (advance, not nextDistance) but still
    // moves the rower on — the ledger's own wording for this path.
    apply(advance);
    setSuspect(false);
  }

  return (
    <main className="screen timer-screen">
      <div className="timer-header">
        <span className="timer-name">{title}</span>
        <button type="button" className="timer-end" onClick={handleEndTap}>
          END →
        </button>
      </div>

      {endStaged && (
        // BaselineEditor.tsx's own staged-dirty idiom (`.baseline-confirm`/
        // `.baseline-actions`): a panel appended below, not a modal —
        // copy names the abandonment explicitly rather than a euphemism
        // ("Cancel"/"OK"), same reasoning BaselineEditor's own ConfirmLine
        // spells out `2k 1:52.0 → 1:50.0` rather than a bare "Save?".
        <div className="timer-end-confirm">
          <p className="timer-end-copy">
            Abandon this session? Nothing will be saved — no log, no actuals.
          </p>
          <div className="timer-end-actions">
            <button
              type="button"
              className="button-outline"
              onClick={handleKeepGoing}
            >
              Keep going
            </button>
            <button
              type="button"
              className="button-primary timer-end-abandon"
              onClick={handleAbandon}
            >
              Abandon session
            </button>
          </div>
        </div>
      )}

      <div className="timer-dots">
        {currentRun.phases.map((_, i) => (
          <span
            key={i}
            className={
              i < currentRun.index
                ? "timer-dot timer-dot-past"
                : i === currentRun.index
                  ? "timer-dot timer-dot-current"
                  : "timer-dot timer-dot-future"
            }
          />
        ))}
      </div>

      <div className="timer-phase">
        <div className="timer-phase-head">
          <span className="timer-phase-label">
            {stepLineText(phase, currentRun.index, currentRun.phases.length)}
          </span>
          <span className="timer-state">
            {pausedAt !== null ? "PAUSED" : "RUNNING"}
          </span>
        </div>
        <div className="timer-time">
          {fmtDuration(bigNumberSeconds(currentRun, phase, now) / 60)}
        </div>
        <div className="timer-phase-bar">
          <span style={{ width: `${phaseProgressPct(phase, elapsed)}%` }} />
        </div>
      </div>

      <TimerTargets phase={phase} />

      <div className="timer-upnext">
        <span className="timer-upnext-label">UP NEXT</span>
        <span className="timer-upnext-value">{upNextText(currentRun)}</span>
      </div>

      <TimerRuler
        totalLeftSeconds={totalRemainingSeconds(currentRun, now)}
        totalSeconds={totalSessionSeconds(currentRun)}
      />

      {isDistance ? (
        suspect ? (
          <div className="timer-suspect">
            <p className="timer-suspect-copy">
              That took a lot longer than expected — keep the split, or discard
              it and move on?
            </p>
            <div className="timer-suspect-actions">
              <button
                type="button"
                className="button-outline timer-suspect-discard"
                onClick={handleDiscardSplit}
              >
                Discard split
              </button>
              <button
                type="button"
                className="button-primary timer-suspect-keep"
                onClick={handleKeepSplit}
              >
                Keep split
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="timer-next-distance"
            onClick={handleDistanceNext}
          >
            NEXT →
          </button>
        )
      ) : (
        <div className="timer-controls">
          <button
            type="button"
            className="timer-control"
            aria-label="Previous phase"
            onClick={handlePrev}
          >
            ◀
          </button>
          <button
            type="button"
            className="timer-control timer-control-pause"
            onClick={handlePauseResume}
          >
            {pausedAt !== null ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className="timer-control"
            aria-label="Next phase"
            onClick={handleNext}
          >
            ▶
          </button>
        </div>
      )}
    </main>
  );
}
