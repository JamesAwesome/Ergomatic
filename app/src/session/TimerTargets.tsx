import { fmtSplit } from "../../domain/format.js";
import { refLabel } from "../../domain/pace.js";
import type { Judgement } from "../../domain/judge.js";
import type { EnginePhase } from "./engine";

/** TARGET SPLIT card content: `main` is the mono-30px accent value, `sub`
 *  (when non-null) is the smaller line beneath it.
 *
 *  `targetKind` is only ever set on work phases (domain/expand.ts's own
 *  comment on `Phase.targetKind`: "work phases only; set on every work
 *  phase"), so branching on it alone — never on `phase.type` — already
 *  covers every case correctly:
 *  - `"effort"`: the word (`phase.label` — "ALL OUT"/"EASY"), no sub-line.
 *    The spec is explicit that the numeric estimate behind an effort target
 *    (`targetSplit`) is NEVER displayed, so there is nothing to put
 *    underneath it, unlike a split-ref target below.
 *  - `"split"`: the resolved EXACT split (`fmtSplit(phase.targetSplit)`) as
 *    the main value, with the REF it was resolved from (`refLabel(phase.ref)`,
 *    uppercased — e.g. `"6K +16"`) as the line beneath. Ui-fix round, Item 1:
 *    this used to be a tolerance-range label (a "lo–hi" string, or the bare
 *    central value once tol hit 0) — retired in favour of "where did this
 *    number come from," which the band never answered and the ref does.
 *    `phase.ref` is only absent
 *    for a LEGACY `v:1` `SessionRun` frozen before this field existed on
 *    `Phase`/`EnginePhase` at all (`domain/expand.ts`'s own `case "w"`
 *    always sets both together for a run built today; an old stored
 *    record, loaded via `run.ts`'s loose `isSessionRun` validation, can
 *    still have `targetKind: "split"` with no `ref`) — the sub-line is
 *    omitted rather than crashing on it, degrading to a two-line card.
 *  - `undefined` (warmup/rest/test — the only phase kinds with no
 *    `targetKind` at all): `phase.label` alone (already "Easy"/"Rest"/
 *    "All out"), no sub-line — there is no split to trace a ref for.
 *
 *  The older design prototype's own mock data (`Erg Log.dc.html`) reuses
 *  this same sub-line slot to show `'rate free'` for a warm-up's TARGET
 *  SPLIT card and a bare `'—'` for a warm-up's RATE card — an internal
 *  inconsistency in the prototype's own placeholder logic (the written
 *  handoff text and this house's binding "never a bare dash" rule both
 *  contradict it), not something this implementation reproduces. See the
 *  task-3 report. */
// eslint-disable-next-line react-refresh/only-export-components
export function targetSplitDisplay(phase: EnginePhase): {
  main: string;
  sub: string | null;
} {
  if (phase.targetKind === "effort") {
    return { main: phase.label, sub: null };
  }
  if (phase.targetKind === "split" && phase.targetSplit !== undefined) {
    const main = fmtSplit(phase.targetSplit);
    const sub = phase.ref ? refLabel(phase.ref).toUpperCase() : null;
    return { main, sub };
  }
  return { main: phase.label, sub: null };
}

/** RATE card content: the spm value + its `"spm"` caption when the phase
 *  has one, or the phrase `"rate free"` alone (never a bare dash) when it
 *  doesn't — true for every warm-up/rest/test phase (none carries `spm`),
 *  and for a work phase whose author never set a stroke rate and whose
 *  confirm-screen SPM stepper was never touched either. */
// eslint-disable-next-line react-refresh/only-export-components
export function rateDisplay(phase: EnginePhase): {
  main: string;
  caption: string | null;
} {
  if (phase.spm !== undefined) {
    return { main: String(phase.spm), caption: "spm" };
  }
  return { main: "rate free", caption: null };
}

/** The phone timer's own rendering (unlabelled — the only variant that
 *  existed before Phase 7B Task 3) vs. the connected panes'. The
 *  `"default"` branch below is BYTE-IDENTICAL to what this component
 *  rendered before that task (pinned by `TimerTargets.test.tsx`'s own
 *  regression test, lifted from the pre-task commit) — every
 *  `variant === "connected"` branch is additive JSX gated behind a
 *  condition that's `false` by default.
 *
 *  **`"connected"` STILL HAS NO CONSUMER, and Task 6 is why.** This
 *  variant puts the live actual INSIDE the target card. The handoff's
 *  pane A is explicit that the actual is a SEPARATE card of the same
 *  geometry beside it — "distinguished by its label (`NOW · /500M` vs
 *  `TARGET SPLIT`)" — laid out `[NOW][TARGET SPLIT]` then
 *  `[RATE][METERS]`. The handoff is the visual authority, so
 *  `src/workout/connected/PaneTimer.tsx` renders those four cards itself
 *  and imports only `targetSplitDisplay`/`rateDisplay` from this file.
 *  The variant's CSS hooks (`timer-card-actual-{judgement}`) ARE in use;
 *  this JSX is not. Left standing rather than deleted mid-phase (it is
 *  another task's reviewed work) and flagged in the task-6 report — a
 *  reviewer's call, not an implementer's. */
export type TimerTargetsVariant = "default" | "connected";

/** A live actual value ready to drop into the connected variant's judged-
 *  actual slot: a caller (reading a real PM5 `MonitorFrame` through
 *  `domain/judge.ts`'s `judgeActual`) supplies both
 *  the already-formatted display string (this component never touches raw
 *  PM5-shaped numbers) and the verdict, which becomes a `timer-card-actual-
 *  {judgement}` class hook for that future consumer's own styling pass. */
export interface JudgedActual {
  display: string;
  judgement: Judgement;
}

export default function TimerTargets({
  phase,
  variant = "default",
  paceActual = null,
  rateActual = null,
}: {
  phase: EnginePhase;
  variant?: TimerTargetsVariant;
  paceActual?: JudgedActual | null;
  rateActual?: JudgedActual | null;
}) {
  const target = targetSplitDisplay(phase);
  const rate = rateDisplay(phase);
  const connected = variant === "connected";
  return (
    <div className="timer-cards">
      <div className="timer-card">
        <span className="timer-card-label">TARGET SPLIT</span>
        <span
          className={
            connected
              ? "timer-card-value"
              : "timer-card-value timer-card-value-accent"
          }
        >
          {target.main}
        </span>
        {target.sub !== null && (
          <span className="timer-card-caption">{target.sub}</span>
        )}
        {connected && <span className="timer-card-static">LIVE PACE</span>}
        {connected && paceActual !== null && (
          <span
            className={`timer-card-actual timer-card-actual-${paceActual.judgement}`}
          >
            {paceActual.display}
          </span>
        )}
      </div>
      <div className="timer-card">
        <span className="timer-card-label">RATE</span>
        <span className="timer-card-value">{rate.main}</span>
        {rate.caption !== null && (
          <span className="timer-card-caption">{rate.caption}</span>
        )}
        {connected && <span className="timer-card-static">LIVE RATE</span>}
        {connected && rateActual !== null && (
          <span
            className={`timer-card-actual timer-card-actual-${rateActual.judgement}`}
          >
            {rateActual.display}
          </span>
        )}
      </div>
    </div>
  );
}
