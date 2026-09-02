import { fmtSplit } from "../../domain/format.js";
import { refLabel } from "../../domain/pace.js";
import type { EnginePhase } from "./engine";

/** The rate target when the phase never set one — the word BOTH surfaces
 *  show (James, 2026-08-12, from #89's warm-up captures). It lives here,
 *  not in `surfaceModel.ts`, because that file already imports this one:
 *  the connected surface reads the phone timer's vocabulary, never the
 *  reverse. Title case to match the PHASE-KIND words it sits beside
 *  (`Easy`, `Rest`, `All out`, the literals `domain/expand.ts` and
 *  `engine.ts` stamp on warm-up/rest/test phases) — lowercase `free` was
 *  the only exception, and on the timer the two render side by side as a
 *  pair.
 *
 *  THE EFFORT WORD IS NOT ONE OF THOSE and is deliberately NOT title-cased:
 *  a work phase at `MAX`/`MIN` labels itself from `domain/pace.ts`'s
 *  `effortWord`, which is `ALL OUT`/`EASY` in caps, and that literal is what
 *  the split slot beside this one shows for it (tail review I-1, measured
 *  2026-08-13 against `Fog Bow` and `Rear Flank`). Caps because the same
 *  field feeds the strip directly above the card (`Timer.tsx`'s
 *  `phaseAnnouncement` -> `WORK ALL OUT`), `StepRow`'s library rows, and
 *  `logDraft.ts`, which reads it back through `effortFromWord` on a cast —
 *  title-casing it for this one card would disagree with its own neighbour
 *  and break the round-trip. The mixed case is the vocabulary saying which
 *  KIND of thing it names: a phase kind, or the effort the rower asked for.
 *  `session/TimerTargets.test.tsx` and `connected/surfaceModel.test.ts` both
 *  pin it against real library workouts. */
export const FREE = "Free";

/** TARGET SPLIT card content: `main` is the mono `--size-subhero` value
 *  (connected-revamp Task 7, revision §5: "both TARGET · /500M and
 *  TARGET · SPM, both 56px landscape / 52px portrait, both ink" — no
 *  machine reading here to judge against, so nothing on this surface is
 *  tinted off-target), `sub` (when non-null) is the smaller line beneath
 *  it.
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
 *  this same sub-line slot to show `'free'` for a warm-up's TARGET
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
 *  has one, or `FREE` above (the word `"Free"`) alone (never a bare dash) when it
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
  return { main: FREE, caption: null };
}

/** The phone timer's own rendering — the ONLY rendering this component has
 *  had since Task 8 retired `variant="connected"` (task-6 review ruling:
 *  Task 7 built pane A/C's judged cells as ROWS, directly in
 *  `PaneTimer.tsx`/`PaneGrid.tsx`, never by consuming this component's own
 *  JSX — the handoff's pane A puts the live actual in a SEPARATE card of the
 *  same geometry beside the target, "distinguished by its label (`NOW ·
 *  /500M` vs `TARGET SPLIT`)", not inside the target card the way the
 *  retired variant drew it. `targetSplitDisplay` below is still the shared
 *  derivation this component calls directly AND the one `surfaceModel.ts`
 *  calls on the connected surface's behalf, for the TARGET SPLIT card's
 *  value/ref pair (`PaneLive.tsx`'s `model.targetSplit`); `rateDisplay` has
 *  no caller outside this component. connected-revamp Task 2 retired
 *  `PaneTimer.tsx` (pane A), the connected surface's OWN caller of this
 *  file's exports before `surfaceModel.ts` mediated the call — only the
 *  mediation survives, not a second copy of either function.
 *
 *  Of the CSS hooks the retired variant exercised, only the
 *  judgement-keyed one survives: `timer-card-actual-{judgement}` is
 *  declared in `index.css` and rendered today by `connected/PaneLive.tsx`
 *  and `connected/PaneGrid.tsx` (connected-revamp Task 3 retired
 *  `connected/JudgedCard.tsx` itself — pane B's own rebuild dropped the
 *  three metric cards it wrapped, and it had no other consumer).
 *  `.timer-card-static` and the bare `.timer-card-actual` had no renderer
 *  left at all and were deleted from `index.css` by the fix wave that
 *  retired the earlier `variant="connected"`. */
export default function TimerTargets({
  phase,
  freeRow = false,
}: {
  phase: EnginePhase;
  /** A free-row timer run (Just Row without the monitor, spec 2026-09-02
   *  §Mechanism piece 3): TARGET SPLIT reads `Free`, the word RATE already
   *  shows for a phase with no `spm`. Without this the card would show
   *  the phase's own label — "Just Row", the run's name a second time —
   *  since `targetSplitDisplay` falls back to `phase.label` for every
   *  phase kind with no `targetKind`. The caller branches on `run.mode`;
   *  this component never sees the run. */
  freeRow?: boolean;
}) {
  const target = freeRow
    ? { main: FREE, sub: null }
    : targetSplitDisplay(phase);
  const rate = rateDisplay(phase);
  return (
    <div className="timer-cards">
      <div className="timer-card">
        <span className="timer-card-label">TARGET SPLIT</span>
        {/* Plain `.timer-card-value` — no `-accent` modifier (connected-
            revamp Task 7, revision §5: both targets are ink, RUNNING is the
            only other word this surface used to colour differently and
            that's ink now too). `.timer-card-value-accent` had no other
            renderer and is retired from index.css in the same edit. */}
        <span className="timer-card-value">{target.main}</span>
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
