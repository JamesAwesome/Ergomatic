import { fmtSplit } from "../../domain/format.js";
import { refLabel } from "../../domain/pace.js";
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
 *    this used to be the tolerance-range label (`domain/pace.ts`'s
 *    `toleranceRange`, a "lo–hi" string, or the bare central value once tol
 *    hit 0) — retired in favour of "where did this number come from," which
 *    the band never answered and the ref does. `phase.ref` is only absent
 *    here in the unreachable case of a "split" targetKind phase that
 *    somehow carries no ref (domain/expand.ts's own `case "w"` always sets
 *    both together); the sub-line is omitted rather than crashing on it.
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

export default function TimerTargets({ phase }: { phase: EnginePhase }) {
  const target = targetSplitDisplay(phase);
  const rate = rateDisplay(phase);
  return (
    <div className="timer-cards">
      <div className="timer-card">
        <span className="timer-card-label">TARGET SPLIT</span>
        <span className="timer-card-value timer-card-value-accent">
          {target.main}
        </span>
        {target.sub !== null && (
          <span className="timer-card-caption">{target.sub}</span>
        )}
      </div>
      <div className="timer-card">
        <span className="timer-card-label">RATE</span>
        <span className="timer-card-value">{rate.main}</span>
        {rate.caption !== null && (
          <span className="timer-card-caption">{rate.caption}</span>
        )}
      </div>
    </div>
  );
}
