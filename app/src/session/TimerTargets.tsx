import { fmtSplit } from "../../domain/format.js";
import type { EnginePhase } from "./engine";

/** TARGET SPLIT card content: `main` is the mono-30px accent value, `range`
 *  (when non-null) is the smaller line beneath it.
 *
 *  `targetKind` is only ever set on work phases (domain/expand.ts's own
 *  comment on `Phase.targetKind`: "work phases only; set on every work
 *  phase"), so branching on it alone — never on `phase.type` — already
 *  covers every case correctly:
 *  - `"effort"`: the word (`phase.label` — "ALL OUT"/"EASY"), no range.
 *    The spec is explicit that the numeric estimate behind an effort target
 *    (`targetSplit`) is NEVER displayed, so there is nothing to put
 *    underneath it, unlike a split-ref target below.
 *  - `"split"`: the resolved CENTRAL split (`fmtSplit(phase.targetSplit)`)
 *    as the main value, with the tolerance range (`phase.label` — already a
 *    formatted `"lo–hi"` string, `domain/pace.ts`'s `toleranceRange`) as the
 *    line beneath — UNLESS the tolerance is 0, in which case
 *    `toleranceRange`'s own label collapses to the exact same string as the
 *    central value, and showing it twice would be pointless duplication,
 *    not information.
 *  - `undefined` (warmup/rest/test — the only phase kinds with no
 *    `targetKind` at all): `phase.label` alone (already "Easy"/"Rest"/
 *    "All out"), no range — there is no split to range around.
 *
 *  The older design prototype's own mock data (`Erg Log.dc.html`) reuses
 *  this same "range" slot to show `'rate free'` for a warm-up's TARGET
 *  SPLIT card and a bare `'—'` for a warm-up's RATE card — an internal
 *  inconsistency in the prototype's own placeholder logic (the written
 *  handoff text and this house's binding "never a bare dash" rule both
 *  contradict it), not something this implementation reproduces. See the
 *  task-3 report. */
// eslint-disable-next-line react-refresh/only-export-components
export function targetSplitDisplay(phase: EnginePhase): {
  main: string;
  range: string | null;
} {
  if (phase.targetKind === "effort") {
    return { main: phase.label, range: null };
  }
  if (phase.targetKind === "split" && phase.targetSplit !== undefined) {
    const main = fmtSplit(phase.targetSplit);
    return { main, range: phase.label === main ? null : phase.label };
  }
  return { main: phase.label, range: null };
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
        {target.range !== null && (
          <span className="timer-card-caption">{target.range}</span>
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
