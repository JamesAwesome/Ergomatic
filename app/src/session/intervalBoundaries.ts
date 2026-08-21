// Where the intervals actually are, in seconds from the start of the
// session — the one derivation behind the notched TOTAL LEFT bar (design
// spec §5), shared by both surfaces.
//
// WHY THIS IS ITS OWN MODULE, and not a fourth index-based twin inside
// `Timer.tsx` beside `totalSessionSecondsOf`/`upNextTextAt`/`thenNextTextAt`
// (the file that already hosts every other phase-list derivation the
// connected model reuses): `TimerRuler` needs the `IntervalBoundaries` TYPE,
// and `Timer.tsx` imports `TimerRuler`. A type-only import back the other
// way would be a module cycle between a component and its own child. The
// connected model cannot host it either — `surfaceModel.ts` already imports
// FROM `Timer.tsx`, so the phone timer importing from the connected model
// would close the same loop one file further out. A neutral module both
// surfaces (and the component) can import is the only placement with no
// cycle, and it keeps the derivation testable without rendering anything.
//
// THE UNIT IS THE INTERVAL, NOT THE PHASE (design spec §5, adversarial B1).
// The caption a rower reads says `2 OF 5`; `program.intervals.length` is
// what makes that 5, and it is one interval per NON-REST phase with every
// consecutive rest phase after it folded in (`domain/monitor/program.ts`'s
// `compileProgram`: "every `type: "rest"` input phase either attaches to the
// interval already emitted immediately before it (summed into that
// interval's `restSeconds`...)"). `foldIntervals` below is that same rule
// applied to a bare phase list — the inverse walk `phaseIndexForInterval`
// (`workout/connected/surfaceModel.ts`) already does for a single index —
// so a bar derived here can never draw a different number of spans than the
// caption counts.

import { phaseSeconds } from "../../domain/expand.js";
import type { IntervalType } from "../../domain/monitor/program.js";
import type { EnginePhase } from "./engine";

/**
 * The notch positions for one session: cumulative seconds at each INTERIOR
 * interval boundary (so `intervals.length - 1` entries for a fully priced
 * session), plus the index from which those entries stop being facts.
 *
 * `predictedFrom` is the first boundary whose position depends on an
 * ESTIMATE rather than on something the machine (or the stopwatch) actually
 * measured; `null` means every entry is measured. It carries no colour or
 * size this wave — design spec §5 makes the notches monochrome hairlines,
 * deliberately — but it is what makes the re-anchoring auditable in the DOM
 * (`TimerRuler` marks estimated notches `data-predicted`), and it is the
 * flag the spec's own sentence asks for ("cumulative seconds per boundary,
 * plus a flag for where prediction stops").
 */
export interface IntervalBoundaries {
  seconds: number[];
  predictedFrom: number | null;
}

/** One interval as the caption counts it: its own non-rest phase plus every
 *  rest phase folded onto it. */
export interface IntervalGroup {
  /** What the interval IS, straight off its own phase — the same fact
   *  `ProgramInterval.type` carries on the compiled side (design spec §5b),
   *  and the same union for the same reason: a rest never gets a group of
   *  its own, it folds onto the one before it. */
  type: IntervalType;
  /** Position in the `phases` array of the interval's non-rest phase — the
   *  key `SessionRun.actuals` is stored under (`session/run.ts`: "keyed by
   *  POSITION in `phases`"), so a caller can look its measurement up. */
  workIndex: number;
  /** The work phase's own priced duration, or `null` when it cannot be
   *  priced at all (`phaseSeconds` — an open-ended "test" piece, or a
   *  distance piece with no split to price it from). */
  workSeconds: number | null;
  /** The folded trailing rest, in seconds. Always priceable: a rest phase
   *  always carries `seconds` (`domain/expand.ts`'s `phases()`). */
  restSeconds: number;
}

/** What `foldIntervals` sees in a phase list: the intervals the caption
 *  counts, plus whatever ran BEFORE the first of them. */
export interface FoldedPhases {
  groups: IntervalGroup[];
  /** Seconds of leading rest — rest phases with no interval yet open. They
   *  get no interval of their own (see `foldIntervals`) but they DO occupy
   *  the front of the bar, so every boundary after them is offset by this. */
  leadInSeconds: number;
}

/**
 * Folds a phase list into intervals, `compileProgram`'s rule exactly (see
 * this module's header).
 *
 * A LEADING rest gets no interval of its own — it belongs to no interval the
 * caption counts, and inventing one would put the bar's spans permanently
 * out of step with the words — but it is NOT discarded: its seconds come
 * back as `leadInSeconds` and seed the first boundary's position.
 *
 * THE SHAPE IS REACHABLE, which a first version of this comment denied
 * (task-4-review.md I-1). `compileProgram` does reject it (`leading-rest`,
 * `domain/monitor/program.ts`) so no CONNECTED session can have one — but
 * the phone timer never runs that compiler, and nothing on the authoring
 * path stops a rest from being step 1: `domain/validate.ts`'s `validateSteps`
 * has no positional rule, `builder/builderState.ts`'s `addRow`/reorder have
 * no leading-rest guard, and `domain/bulk.ts` parses a rest line wherever it
 * appears. Dropping those seconds while `totalSessionSecondsOf`
 * (`session/Timer.tsx`, the bar's own denominator) still counted them put
 * every notch `leadIn / totalSeconds` too far left — on a
 * `[5:00 rest, 4 × (4:00 + 1:00)]` session, the first notch landed at 20.8%
 * instead of 41.7%.
 */
export function foldIntervals(phases: EnginePhase[]): FoldedPhases {
  const groups: IntervalGroup[] = [];
  let leadInSeconds = 0;
  for (let i = 0; i < phases.length; i += 1) {
    const phase = phases[i]!;
    if (phase.type === "rest") {
      const open = groups[groups.length - 1];
      if (open === undefined) {
        leadInSeconds += phaseSeconds(phase) ?? 0;
        continue;
      }
      open.restSeconds += phaseSeconds(phase) ?? 0;
      continue;
    }
    groups.push({
      // Not `"rest"` by construction — the arm above `continue`s on every
      // rest phase, exactly as `compileProgram`'s own loop does.
      type: phase.type,
      workIndex: i,
      workSeconds: phaseSeconds(phase),
      restSeconds: 0,
    });
  }
  return { groups, leadInSeconds };
}

/**
 * The boundary array itself (design spec §5, ruling 8 — "truth about the
 * past, best guess about the future").
 *
 * `measuredWorkSeconds[i]` is interval `i`'s REAL elapsed work time when
 * something actually measured it — the machine's own per-interval actual on
 * the connected surface (`IntervalActual.elapsedSeconds`), the stopwatch's
 * recorded actual on the phone timer (`PhaseActual.elapsedSeconds`) — and
 * `undefined`/`null` when nothing did. Sparse arrays are fine and expected:
 * an actual that arrived with no interval identity files against no index
 * at all, so a gap in the middle is a real state, not a caller error.
 *
 * THE REST IS PROGRAMMED, EVEN WHEN THE WORK IS MEASURED. An interval's
 * measurement covers its WORK bout only — `IntervalActual` "represents the
 * work bout" (`domain/monitor/pm5/parse.ts`'s `toIntervalActual`, which
 * reads 0x0037/0x0038's Split/Interval Time and pairs it with a sibling
 * rest value it does not carry), and on the phone timer a rest is a
 * separate phase with its own actual-less clock. So a re-anchored boundary
 * is measured work + programmed rest, and the rest term is the one part of
 * a "fact" notch that is still the program's number rather than the
 * machine's. Both machines run a programmed rest to its stated length, so
 * the error is bounded by a tick, not by a rower's behaviour.
 *
 * THE HONEST STOP: an interval that can be neither measured nor priced ends
 * the array. Its own boundary and every boundary after it are omitted — the
 * bar stops predicting rather than collapsing the unpriceable span to zero
 * width and shunting every later notch left.
 *
 * The stop is honest about POSITIONS, not about LENGTH, and the difference
 * is documented rather than fixed here (task-4-review.md M-3): the bar's
 * denominator is `totalSessionSecondsOf` (`session/Timer.tsx`), which prices
 * an unpriceable phase at 0 (`phaseSeconds(p) ?? 0`), so a session with a
 * mid-list unpriceable piece is scaled against a total that omits it and
 * the surviving notches sit right of where a true total would put them.
 * Deliberately left alone: the FILL edge divides by the same number, so the
 * bar and its notches stay mutually consistent, and changing that
 * denominator would move TOTAL LEFT itself — a whole-surface decision, not
 * this module's. Flagged for Task 8's DEVIATIONS pass.
 *
 * Boundaries are ABSOLUTE seconds from the start of the SESSION, not from
 * the first interval: `leadInSeconds` seeds the running total so a session
 * that opens with a rest still puts its notches where that rest leaves them.
 */
export function intervalBoundaries(
  phases: EnginePhase[],
  measuredWorkSeconds: readonly (number | null | undefined)[] = [],
): IntervalBoundaries {
  const { groups, leadInSeconds } = foldIntervals(phases);
  const seconds: number[] = [];
  let predictedFrom: number | null = null;
  let cumulative = leadInSeconds;
  let estimating = false;

  // `groups.length - 1`: these are INTERIOR boundaries. The end of the last
  // interval is the end of the bar, which the bar's own right edge already
  // draws — a notch there would be a line on a line.
  for (let i = 0; i < groups.length - 1; i += 1) {
    const group = groups[i]!;
    const measured = measuredWorkSeconds[i];
    const work =
      typeof measured === "number" && Number.isFinite(measured)
        ? measured
        : group.workSeconds;
    if (typeof measured !== "number" || !Number.isFinite(measured)) {
      estimating = true;
    }
    if (work === null) break;
    cumulative += work + group.restSeconds;
    if (estimating && predictedFrom === null) predictedFrom = i;
    seconds.push(cumulative);
  }

  return { seconds, predictedFrom };
}
