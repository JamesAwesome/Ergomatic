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
import {
  clearRun,
  loadRun,
  saveRun,
  type PhaseActual,
  type SessionRun,
} from "./run";
import TimerTargets from "./TimerTargets";
import TimerRuler from "./TimerRuler";
import IntervalSegments from "../components/IntervalSegments";
import UpNextStrip from "../components/UpNextStrip";

/** Maps an `EnginePhase.type` onto `IntervalSegments`'s own neutral
 *  `kinds` shape (`"work" | "rest" | "wu"`, Phase 7B Task 3's pinned prop
 *  interface for the extracted dot strip — `src/components/
 *  IntervalSegments.tsx`). That shape has no dedicated bucket for `"test"`
 *  (an open-ended piece, e.g. a bare "2k test" step) — folded into `"work"`
 *  here, the closest semantic match (an effortful interval, not a rest or a
 *  warm-up) — since the strip's own rendering doesn't discriminate by kind
 *  yet regardless (see that file's own doc comment), this mapping has no
 *  visible effect today; it only matters once a future consumer actually
 *  paints dots by kind. */
// eslint-disable-next-line react-refresh/only-export-components
export function segmentKind(type: EnginePhase["type"]): "work" | "rest" | "wu" {
  switch (type) {
    case "warmup":
      return "wu";
    case "rest":
      return "rest";
    case "work":
    case "test":
      return "work";
  }
}

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

/** "KIND · label", except when the phase's own resolved `label` IS its kind
 *  word — a rest phase's label is literally `"Rest"` (domain/expand.ts's
 *  own `phases()`), which collides with `phaseKindWord("rest")`'s `"REST"`
 *  (case-insensitive: the two vocabularies capitalize differently) — in
 *  which case this renders the word once, not "REST · Rest" (whole-branch
 *  review, F4: exactly this duplication was visible in the committed
 *  timer.png). No other phase kind's label ever matches its own kind word
 *  (a warm-up's "Easy", a work phase's exact resolved split or "ALL
 *  OUT"/"EASY", a test phase's "All out" — none of them equal "WARM-UP"/
 *  "WORK"/"TEST"), so this only ever actually collapses the rest case, but
 *  the check is general rather than hardcoded to "rest" specifically.
 *  Shared by `upNextText`/`thenNextText` below — both build the identical
 *  "kind + resolved target" phrase for a different phase, one algorithm
 *  rather than two copies of the same dedupe rule. */
function phaseAnnouncement(phase: EnginePhase): string {
  const kind = phaseKindWord(phase.type);
  return kind.toLowerCase() === phase.label.toLowerCase()
    ? kind
    : `${kind} · ${phase.label}`;
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
  return phaseAnnouncement(next);
}

/** Landscape's UP NEXT panel gets a second "then …" line (handoff §6:
 *  "UP NEXT panel with a 'then …' second line" — landscape only, portrait's
 *  UP NEXT never grows one); this is the phase AFTER the one `upNextText`
 *  already names. `null` when there's nothing meaningful to say: once the
 *  CURRENT phase is already the last one, `upNextText` itself reads
 *  "FINISH" and a second "then FINISH" underneath it would be redundant,
 *  not informative — mirrors `upNextText`'s own "FINISH past the last
 *  phase" contract one phase further out. */
// eslint-disable-next-line react-refresh/only-export-components
export function thenNextText(run: SessionRun): string | null {
  const next = run.phases[run.index + 1];
  if (next === undefined) return null;
  const afterNext = run.phases[run.index + 2];
  if (afterNext === undefined) return "FINISH";
  return phaseAnnouncement(afterNext);
}

/** The suspect-actual seam (Phase 6B Task 1 review, product; routed into
 *  this task's ledger; made two-sided in the spec review's F6 fix round).
 *  After a long suspend, a distance phase's honest stopwatch can be huge —
 *  recording it as-is on NEXT would silently log an absurd split (the
 *  review's own example: a 2000m piece "finished" at a 7:30/500m pace after
 *  a long suspend). The LOWER bound catches the opposite mistake: NEXT
 *  mis-tapped moments after starting a piece (the F6 live probe's own
 *  example — 1s elapsed on a 100s-estimate piece — would otherwise record
 *  `splitSeconds ≈ 1.0`, a physically absurd 500m-in-one-second split, with
 *  no staging at all). `estimate` is `domain/expand.js`'s own
 *  `phaseSeconds` — the exact formula `totalRemainingSeconds` already uses
 *  to price a distance phase's full duration. More than double it, or
 *  under half it, and the timer stages a choice instead of recording
 *  silently — the boundaries themselves (exactly half, exactly double)
 *  are NOT suspect, symmetric with the original upper-bound-only version's
 *  own "the boundary itself is not suspect" rule. */
// eslint-disable-next-line react-refresh/only-export-components
export function isSuspectActual(
  phase: EnginePhase,
  elapsedSecondsValue: number,
): boolean {
  const estimate = phaseSeconds(phase);
  if (estimate === null) return false;
  return (
    elapsedSecondsValue > estimate * 2 || elapsedSecondsValue < estimate / 2
  );
}

/** The live timer (handoff §6). One component for both orientations — Task
 *  4's own `@media (orientation: landscape)` layer (index.css) reflows this
 *  exact markup into the handoff's two-column layout via CSS Grid explicit
 *  placement (every top-level element gets its own `grid-column`/
 *  `grid-row`); portrait stays the plain flex column it always was, and
 *  neither layout reorders or duplicates a single DOM node. `thenNextText`
 *  above is the one piece of genuinely NEW content landscape's own UP NEXT
 *  panel needs (a "then …" line portrait never shows) — rendered
 *  unconditionally here and hidden by CSS in portrait, since this component
 *  has no JS notion of the device's current orientation.
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
  // Whether tapping END was the thing that paused the run (vs. the rower
  // having already paused it themselves beforehand) — see `handleEndTap`/
  // `handleKeepGoing`'s own comments (fix round, spec review F1): the two
  // must be exact inverses, and that requires remembering which case this
  // was.
  const [pausedByEndTap, setPausedByEndTap] = useState(false);
  const [suspect, setSuspect] = useState(false);
  // The distance phase's elapsed seconds AT THE MOMENT NEXT was tapped and
  // judged suspect — frozen here, not re-read at Keep-split time (fix
  // round, spec review F3): the whole POINT of staging the choice is a
  // deliberation window, and re-measuring after that window inflates the
  // recorded split by however long the rower spent deciding.
  const [stagedElapsed, setStagedElapsed] = useState<number | null>(null);
  // A staged confirm before ▶ ends the run on the FINAL phase (fix round,
  // spec review F5): completion is a documented one-way door (engine.ts's
  // own `isComplete` comment), so the affordance that triggers it must be
  // deliberate, not a single stray tap under an unassuming "Next phase"
  // aria-label.
  const [finishStaged, setFinishStaged] = useState(false);

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

  // Past the last phase: hand off to SessionComplete (AppRoutes.tsx,
  // Phase 6B Task 4) — this component's own run-guard clause below renders
  // one harmless "Finishing…" frame between this effect committing and the
  // navigate actually landing. `replace`, not push (whole-branch review,
  // F1): a plain push left THIS Timer mount (already showing a completed
  // run) reachable via browser BACK from Session Complete — landing back
  // here re-triggers this exact effect, which used to push ANOTHER
  // /session/complete entry, and a second BACK from there could reach
  // Countdown, whose own unconditional rebuild (fixed separately, see
  // Countdown.tsx's `hasRunProgress`) would then overwrite the completed
  // record with a fresh `completedAt: null` one. Replacing here means BACK
  // from Session Complete lands one level further out (Confirm, which
  // itself redirects a started draft straight back to this same completed
  // Timer) instead of resurrecting a stale live-timer frame.
  useEffect(() => {
    if (run !== null && isComplete(run)) {
      navigate("/session/complete", { replace: true });
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
  const isLastPhase = currentRun.index === currentRun.phases.length - 1;
  const elapsed = elapsedSeconds(currentRun, now);
  const pausedAt = currentRun.pausedAt;
  const thenText = thenNextText(currentRun);

  function handleEndTap() {
    // Pausing before staging the confirm means the phase clock can't
    // silently auto-advance (or complete the run) while the rower is still
    // deciding — `tick()` still fires every second in the background
    // regardless of `endStaged`, since this component has no idea a
    // decision is pending. `pause` is idempotent (engine.ts's own
    // contract), so calling it when ALREADY paused is a harmless no-op —
    // but `handleKeepGoing` needs to know which case this was (fix round,
    // spec review F1): if the rower had already paused themselves before
    // tapping END, "Keep going" must leave that alone, not resume a state
    // the rower chose on their own.
    setPausedByEndTap(pausedAt === null);
    apply(pause);
    setEndStaged(true);
  }

  function handleKeepGoing() {
    // The exact inverse of what `handleEndTap` did, regardless of phase
    // kind (fix round, spec review F1): resume ONLY if tapping END was
    // what paused the run in the first place. Previously this deliberately
    // never resumed — on a distance phase (no Resume control existed at
    // all before this fix round) that soft-bricked the stopwatch at
    // whatever elapsed END was tapped at, forever.
    if (pausedByEndTap) apply(resume);
    setPausedByEndTap(false);
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
    // Defensive: END staging already pauses and takes over the header;
    // stacking a SECOND staged confirm on top of it (by advancing to a new
    // phase, or opening the finish confirm) is confusing state this button
    // shouldn't be able to reach mid-decision.
    if (endStaged) return;
    if (isLastPhase) {
      // Completion is a documented one-way door (engine.ts's own
      // `isComplete` comment) — the control that triggers it must be a
      // deliberate act, not a single tap under an unassuming "Next phase"
      // label (fix round, spec review F5).
      setFinishStaged(true);
      return;
    }
    apply(advance);
  }

  function handleCancelFinish() {
    setFinishStaged(false);
    // Hygiene: only ever meaningful on the distance path (see
    // `handleDistanceNext`'s own last-phase branch below); harmless no-op
    // otherwise.
    setStagedElapsed(null);
  }

  function handleConfirmFinish() {
    // Shared by BOTH ▶'s own last-phase staging (non-distance — plain
    // `advance`, nothing to record) AND NEXT's last-phase staging (fix
    // round, spec review F6 — distance, records the FROZEN elapsed exactly
    // like `handleKeepSplit` does, for the identical F3 reason: deliberating
    // over "Finish this session?" must not inflate the recorded split).
    if (isDistance) {
      if (stagedElapsed !== null) applyDistanceActual(stagedElapsed);
    } else {
      apply(advance);
    }
    setFinishStaged(false);
    setStagedElapsed(null);
  }

  // Records a distance phase's actual from an ALREADY-FROZEN elapsed value,
  // then advances with a FRESH timestamp — shared by `handleKeepSplit` (the
  // suspect-actual path) and `handleConfirmFinish` (the last-phase-NEXT
  // path, F6), since both need the exact same "freeze the measurement,
  // don't re-read the stopwatch at confirm time" shape. Not `nextDistance`
  // (which would re-measure elapsed against a fresh `now`) — this
  // replicates its actual-recording step with the frozen value, then calls
  // `advance` with `apply`'s own fresh timestamp (the NEXT phase's clock —
  // or the run's `completedAt`, if this was the last phase — must start
  // now, not back-dated to whenever the choice was first staged).
  function applyDistanceActual(elapsedValue: number) {
    const meters = phase.meters;
    // Defensive: only ever called from the two distance-staged paths above,
    // both gated on `isDistance` (so `meters` is always defined here).
    if (meters === undefined) return;
    const splitSeconds = (elapsedValue / meters) * 500;
    const actual: PhaseActual = {
      elapsedSeconds: elapsedValue,
      splitSeconds,
      actualSource: "stopwatch",
    };
    apply((r, at) =>
      advance({ ...r, actuals: { ...r.actuals, [r.index]: actual } }, at),
    );
  }

  function handleDistanceNext() {
    // Same defensive reasoning as `handleNext`'s own guard.
    if (endStaged) return;
    const at = new Date();
    const currentElapsed = elapsedSeconds(currentRun, at);
    if (isSuspectActual(phase, currentElapsed)) {
      // Freeze the measurement NOW (fix round, spec review F3) — Keep
      // split records THIS value, not whatever the stopwatch reads by the
      // time the rower finishes deliberating. This branch is ALSO the
      // combined flow for F6's "suspect actual on the last phase" case
      // (spec review, decided below): the suspect dialog is shown, full
      // stop — no SEPARATE finish confirm stacks on top of it. Its own
      // Keep/Discard actions already call `advance`-family engine
      // functions, which set `completedAt` themselves the moment they
      // walk past the final phase (engine.ts's own contract) — a rower on
      // the last piece resolving a suspect split ends the session AND
      // resolves the split with the SAME single tap, never two.
      setStagedElapsed(currentElapsed);
      setSuspect(true);
      return;
    }
    if (isLastPhase) {
      // F6: NEXT ending the session on the final phase is exactly the same
      // one-way-door risk ▶ already had (fixed as F5) — a single tap
      // shouldn't complete the run, suspect or not. Reuses the SAME
      // `finishStaged` panel/copy ▶ stages ("Finish this session?"), not a
      // distance-specific one; only `handleConfirmFinish`'s OWN behavior
      // differs by phase kind. Elapsed is frozen here for the identical
      // F3 reason the suspect path freezes it — the split is fine now, but
      // isn't guaranteed to still be fine after however long "Finish this
      // session?" sits on screen.
      setStagedElapsed(currentElapsed);
      setFinishStaged(true);
      return;
    }
    apply(nextDistance);
  }

  function handleKeepSplit() {
    // Defensive: `suspect`/`stagedElapsed` are only ever set together, by
    // `handleDistanceNext` above, which only runs when `isDistance`.
    if (stagedElapsed === null) return;
    applyDistanceActual(stagedElapsed);
    setSuspect(false);
    setStagedElapsed(null);
  }

  function handleDiscardSplit() {
    // Discard records NO actual (advance, not nextDistance) but still
    // moves the rower on — the ledger's own wording for this path. Still
    // completes the run via `advance`'s own contract if this was the last
    // phase (the same "one combined stage" reasoning as Keep split above).
    apply(advance);
    setSuspect(false);
    setStagedElapsed(null);
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
              className="button-primary timer-confirm-primary"
              onClick={handleAbandon}
            >
              Abandon session
            </button>
          </div>
        </div>
      )}

      <IntervalSegments
        total={currentRun.phases.length}
        current={currentRun.index}
        kinds={currentRun.phases.map((p) => segmentKind(p.type))}
      />

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

      {/* `UpNextStrip` (src/components/UpNextStrip.tsx, Phase 7B Task 3) —
          the landscape-only "then …" second line it renders is still
          governed entirely by CSS (`.timer-upnext-then`'s own base rule),
          not a conditional keyed off orientation: neither this component
          nor the strip has any JS notion of the device's current
          orientation. `upNextText`/`thenNextText` stay here, unchanged —
          the strip only ever sees their already-computed output. */}
      <UpNextStrip upNext={upNextText(currentRun)} thenNext={thenText} />

      <TimerRuler
        totalLeftSeconds={totalRemainingSeconds(currentRun, now)}
        totalSeconds={totalSessionSeconds(currentRun)}
      />

      {suspect ? (
        // Distance-only (only `handleDistanceNext` ever sets `suspect`):
        // the deliberation choice fully replaces the control row — Pause
        // alongside it would invite pausing mid-decision for no reason,
        // since `tick()` never auto-advances a distance phase anyway. Also
        // the combined stage for F6's "suspect actual on the last phase"
        // case (see `handleDistanceNext`'s own comment) — no separate
        // finish confirm ever stacks on top of this one. Generic wording
        // (fix round, spec review F6): `isSuspectActual` is two-sided now
        // (unbelievably fast is exactly as suspect as unbelievably slow),
        // so the copy can't say "longer than expected" any more.
        <div className="timer-suspect">
          <p className="timer-suspect-copy">
            This split looks off — keep it, or discard it and move on?
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
      ) : finishStaged ? (
        // Non-distance only (only the ▶ control, absent in distance mode,
        // ever sets `finishStaged`). Same BaselineEditor-idiom panel END's
        // own confirm uses — a staged confirm, not a modal — with its own
        // copy/handlers (fix round, spec review F5).
        <div className="timer-end-confirm">
          <p className="timer-end-copy">Finish this session?</p>
          <div className="timer-end-actions">
            <button
              type="button"
              className="button-outline"
              onClick={handleCancelFinish}
            >
              Keep going
            </button>
            <button
              type="button"
              className="button-primary timer-confirm-primary"
              onClick={handleConfirmFinish}
            >
              Finish session
            </button>
          </div>
        </div>
      ) : (
        // Fix round (spec review F1/F2): every phase kind — distance
        // included — shares this SAME ◀ / Pause / [▶ or NEXT] grid now.
        // README §6 gives the control row no distance carve-out, and a
        // distance phase with no Pause had no recourse for a broken foot
        // strap. Only the rightmost slot's control changes.
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
          {isDistance ? (
            <button
              type="button"
              className="timer-control timer-control-next"
              onClick={handleDistanceNext}
            >
              NEXT →
            </button>
          ) : (
            <button
              type="button"
              className="timer-control"
              aria-label="Next phase"
              onClick={handleNext}
            >
              ▶
            </button>
          )}
        </div>
      )}
    </main>
  );
}
