// Everything the two connected panes render, derived ONCE from the
// machine's frame plus the workout's own frozen phases (7B Task 6, handoff
// §§3-4). The panes themselves are dumb: they read fields off `SurfaceModel`
// and place them. Two rules live here and nowhere else:
//
//  1. **ONE judgement path — with one sanctioned exception.** `judgedValue`
//     below is the only function in `src/` that calls `domain/judge.ts`'s
//     `judgeActual`. Every live actual on every pane — pane B's hero, rate,
//     HR and meters cards — is a `JudgedValue` produced by that one helper
//     (handoff §3: "One helper decides the colour; no pane implements its
//     own judgement"). The AVG cell (`avgValue`/`avgVerdict`, Phase CM) is
//     the sanctioned second path: it needs an on-target state `judgeActual`
//     has no concept of, and its own comment block carries the reasoning —
//     this rule's statement is amended rather than silently contradicted. Pane C's
//     grid (Task 7) inherits the same rule: every
//     ACTUAL cell in `buildGridModel` below is a `judgedValue` too, and its
//     PROGRAMMED cells are plain strings that structurally cannot carry a
//     verdict (`GridValue.judged` is `null` for them) — "programmed values
//     are never tinted; only what actually happened gets judged".
//  2. **Stale beats everything.** `judgeActual`'s own precedence already
//     returns `"stale"` ahead of any comparison; `staleFor` below is the
//     single place that decides WHEN a reading is stale (the disconnected
//     phase, and only that), so no cell can opt out of the greying.
//
// This module is pure: no React, no clock, no storage. `MonitorFrame` in,
// display strings out.

import { fmtDuration } from "../../../domain/duration.js";
import { fmtSplit } from "../../../domain/format.js";
import { judgeActual, type Judgement } from "../../../domain/judge.js";
import { ON_TARGET_BAND_SECONDS } from "../../judgeBand.js";
import type {
  ProgramInterval,
  WorkoutProgram,
} from "../../../domain/monitor/program.js";
import type {
  IntervalActual,
  MonitorFrame,
} from "../../../domain/monitor/types.js";
import { phaseSeconds } from "../../../domain/expand.js";
import type { EnginePhase } from "../../session/engine";
import {
  intervalBoundaries,
  type IntervalBoundaries,
} from "../../session/intervalBoundaries";
import {
  hasRemainingEstimate as phaseHasRemainingEstimate,
  phaseKindWord,
  totalSessionSecondsOf,
} from "../../session/Timer";
import { FREE, targetSplitDisplay } from "../../session/TimerTargets";

/** What the surface itself renders differently — NOT a narrowed
 *  `ConnectedPhase` any more (connected-axes design spec §1, task 2). The
 *  CALLER (`ConnectedSurface.tsx`) derives this from `connectedAxes.ts`'s
 *  four axes, in one place, in the precedence that module's own header
 *  comment writes down: `stale` (the link is lost) beats `armed` (a program
 *  sits on the machine with no session open yet — `"ready"`, once the rower
 *  has asked for the numbers, used to launder into `"live"` here via this
 *  file's own `?? "live"`; it no longer does, which is this task's whole
 *  reason to exist) beats `paused` (the freeze predicate fired) beats
 *  `live` (everything else the surface draws). `"ended"` is not a member:
 *  `ConnectedSurface.tsx` renders its own hand-off frame and returns before
 *  `buildSurfaceModel` is ever called for it, so this module never has to
 *  answer for a phase with no live pane at all. */
export type SurfaceStatus = "live" | "paused" | "stale" | "armed";

/** One live actual, ready to place: the formatted string and the verdict
 *  that colours it. `absent` is NOT a fifth judgement — it is "there is no
 *  reading to show" (`—`), which `judgeActual` deliberately reads as
 *  `"within"` (its rule 2: nothing to judge is not a deviation). The panes
 *  need the distinction anyway, because a dash is rendered in `--ink-3`
 *  rather than in whatever the verdict would have painted it. */
export interface JudgedValue {
  display: string;
  judgement: Judgement;
  absent: boolean;
}

/** The house dash. Never a bare `-`; this is the same U+2014 the HR card,
 *  the paused NOW card and pane C's pending rows all use. */
export const DASH = "—";

/**
 * THE ONE JUDGEMENT PATH (see this file's header). Every judged cell on
 * every pane is built here, so a change to `judgeActual` — or to the stale
 * rule — moves all of them together, and a pane that wanted its own opinion
 * would have to import `judgeActual` itself, which nothing else in `src/`
 * does.
 */
export function judgedValue(args: {
  kind: "pace" | "spm" | "hr" | "meters";
  actual: number | null;
  target: number | null;
  stale: boolean;
  format: (value: number) => string;
}): JudgedValue {
  const { kind, actual, target, stale, format } = args;
  return {
    display: actual === null ? DASH : format(actual),
    judgement: judgeActual({ kind, actual, target, stale }),
    absent: actual === null,
  };
}

/** WHEN a reading is stale, in one place. Only the lost link makes a number
 *  unvouchable: a paused erg is still talking to us, it just isn't moving
 *  (`useMonitorSession`'s own paused derivation is "distance/split/rate
 *  unchanged across N frames", not "no frames"), so paused values are held
 *  and greyed by their own treatment, not judged `"stale"`. */
export function staleFor(status: SurfaceStatus): boolean {
  return status === "stale";
}

/** The NEXT line's own extent phrase (design spec §"Composition", Item B):
 *  `1500m` for a distance phase, the house duration format for a time one.
 *  A `rest`/`work` phase always has exactly one of the two set
 *  (`domain/expand.ts`'s producers never emit both); `test` phases have
 *  neither and never reach this helper (see `connectedNextText`'s own
 *  `test` branch, which composes no extent at all). */
function nextLineExtent(
  phase: Pick<EnginePhase, "meters" | "seconds">,
): string {
  return phase.meters !== undefined
    ? `${phase.meters}m`
    : fmtDuration((phase.seconds ?? 0) / 60);
}

/**
 * THE NEXT LINE, EXHAUSTIVELY (connected-polish design spec, Item B —
 * "the NEXT line says more"). Replaces `upNextTextAt`/`thenNextTextAt`
 * (`session/Timer.tsx`, still used unchanged by the phone timer's own UP
 * NEXT strip) as the connected surface's ONE builder for `SurfaceModel.
 * upNext`; `thenNext` is retired outright (the then-clause dies
 * everywhere, James's ruling — one richer phase, not two).
 *
 * BUILT FROM `label`, NEVER RE-DERIVED (PM C5): `EnginePhase.label` is the
 * domain's already-resolved display value — the exact split
 * (`fmtSplit(targetSplit)`), `"Easy"`, `"Rest"`, `"All out"`, or an effort
 * word (`"ALL OUT"`/`"EASY"`) — for every phase kind that carries one
 * (`domain/expand.ts`'s `phases()`).
 * This function composes that label with the phase's own extent and rate;
 * it never calls `fmtSplit`/`resolveSplit` itself, so a future change to
 * how a target is resolved cannot silently drift the two apart the way a
 * second copy of that arithmetic could.
 *
 * `index` carries the SAME +1 offset `upNextTextAt` always had —
 * `phases[index + 1]` is the phase this function describes, `undefined`
 * past the end reads `"FINISH"` (`upNextTextAt`'s own contract, preserved
 * verbatim) — so every existing call site (including the armed shift,
 * `phaseIndex - 1` at this file's `buildSurfaceModel`) wires in unchanged;
 * only the FUNCTION changed, not the index arithmetic around it.
 *
 * EXHAUSTIVE OVER `Phase["type"]` (antagonist B2, the axes lesson): a
 * `switch` with a `never` default, not an `if`/`else` chain a fifth phase
 * kind could silently fall through.
 */
export function connectedNextText(
  phases: EnginePhase[],
  index: number,
): string {
  const phase = phases[index + 1];
  if (phase === undefined) return "FINISH";
  const kind = phaseKindWord(phase.type);
  switch (phase.type) {
    case "work":
      // `@spm` only when spm is SET (design spec table) — `!== undefined`,
      // not truthiness, so a phase could never suppress its own rate by
      // resolving to a falsy-but-real spm (unreachable today, since a real
      // spm is never 0, but the honest check costs nothing).
      return `${kind} ${nextLineExtent(phase)} · ${phase.label}${
        phase.spm !== undefined ? ` @${phase.spm}` : ""
      }`;
    case "test":
      // No extent fields exist on a test phase (`domain/expand.ts`'s
      // `case "test"` sets neither `seconds` nor `meters`) — the table's
      // own `TEST · All out` row has none to show.
      return `${kind} · ${phase.label}`;
    case "rest":
      return `${kind} ${nextLineExtent(phase)}`;
    default: {
      // The axes lesson: a phase kind added to the union without a branch
      // here fails `pnpm typecheck`, not silently at runtime.
      const exhaustive: never = phase.type;
      return exhaustive;
    }
  }
}

/**
 * Which `EnginePhase` the machine's interval index is currently inside.
 *
 * `MonitorFrame.intervalIndex` is OUR program index (`domain/monitor/pm5/
 * intervalIndex.ts` normalizes the machine's forward-attributed value
 * before it ever reaches a consumer), and `compileProgram` emits exactly one
 * `ProgramInterval` per NON-REST phase, folding every `type: "rest"` phase
 * into the `restSeconds` of the interval before it. So interval `i` is the
 * `i`-th non-rest phase — this walk is the inverse of that folding, not a
 * second copy of the compiler's rules.
 *
 * While the machine reports `resting`, the rower is in the REST phase that
 * folded onto that interval, so the current phase is the one after it (when
 * the program actually has one — a final interval's rest with nothing after
 * it still resolves to its own rest phase).
 */
export function phaseIndexForInterval(
  phases: EnginePhase[],
  intervalIndex: number,
  resting: boolean,
): number {
  let seen = -1;
  for (let i = 0; i < phases.length; i++) {
    if (phases[i]!.type === "rest") continue;
    seen += 1;
    if (seen === intervalIndex) {
      if (resting && phases[i + 1]?.type === "rest") return i + 1;
      return i;
    }
  }
  // An index past the end of the program (a machine that kept counting past
  // what we sent) pins to the last phase rather than rendering an empty
  // pane. `intervalIndex` itself is already normalized and range-checked one
  // layer down, so this is defence, not an expected path.
  return Math.max(0, phases.length - 1);
}

/**
 * THE NUMBER THE ROWER HAS IN THEIR HEAD (design spec §5b, ruling 12).
 *
 * Every program interval is a piece the rower counts, so this numbers them
 * 1..n and `workCount` is simply how many there are. It was NOT always an
 * identity: a warm-up interval used to be excluded — unnumbered in the
 * caption, `WU` in the grid's `#` cell — because a four-piece workout is
 * four pieces whether or not the rower's preference put eight easy minutes
 * in front of them. Phase WU removed the warm-up outright, so there is
 * nothing left to skip.
 *
 * ONE RULE, TWO SURFACES: the caption below and the grid read the same
 * array, so a row's number and the header's `N OF M` cannot disagree. That
 * is why this stays a shared array rather than each surface computing
 * `i + 1` for itself.
 *
 * A "test" (open-ended all-out) interval COUNTS — a test piece is the
 * hardest work in the session, not a preamble to it. (It is also
 * unreachable today: `compileProgram` rejects a phase with neither seconds
 * nor meters, which every "test" phase is — see its `unrepresentable-value`
 * arm.)
 */
export interface IntervalNumbering {
  /** Per program interval, in the program's own order: its 1-based number. */
  ordinals: number[];
  /** The caption's denominator — how many intervals there are. */
  workCount: number;
}

export function intervalNumbering(
  intervals: readonly ProgramInterval[],
): IntervalNumbering {
  const ordinals = intervals.map((_interval, i) => i + 1);
  return { ordinals, workCount: ordinals.length };
}

/** The frame a pane renders before the machine has sent one (the instant
 *  between `ready` and the first status tick). Every field is the honest
 *  "nothing yet" value; `state: "armed"` is what the PM itself reports while
 *  it waits for stroke one. */
const NO_FRAME: MonitorFrame = {
  elapsedSeconds: 0,
  distanceMeters: 0,
  sessionElapsedSeconds: 0,
  sessionDistanceMeters: 0,
  currentSplit: null,
  spm: null,
  heartRateBpm: null,
  rowingActive: false,
  splitAvgPace: null,
  restSeconds: 0,
  intervalIndex: 0,
  intervalRemaining: null,
  intervalAccrued: null,
  state: "armed",
};

export interface SurfaceModelInput {
  phases: EnginePhase[];
  program: WorkoutProgram;
  /** The precedence-resolved status the CALLER computed from
   *  `connectedAxes.ts`'s four axes (design spec §1) — this module no
   *  longer narrows a `ConnectedPhase` itself; `surfaceStatusFor` and this
   *  function's own `?? "live"` laundering are both gone (task 2). Required,
   *  not optional: every caller must say which of the four states this
   *  render is, and a `// @ts-expect-error` test pins that a missing one is
   *  a compile error, not a silent live surface. */
  status: SurfaceStatus;
  frame: MonitorFrame | null;
  deviceName: string | null;
  /** Everything the machine has reported finishing, straight off the hook.
   *  Pane C's completed rows are built from these and from nothing else —
   *  an interval with no actual on record shows dashes rather than a
   *  re-derived number (see `buildGridModel`). */
  actuals: IntervalActual[];
  /** EST LEFT (Phase LL design spec §3): the estimate must never
   *  DECREASE, but `buildSurfaceModel` is otherwise pure — no clock, no
   *  memory of the frame before this one. This is that memory, supplied
   *  by the CALLER: the previous model's own `elapsedSeconds`.
   *  `ConnectedSurface.tsx` is the one production caller that threads it
   *  — a `useState` with a render-phase comparison-then-set, NOT a ref
   *  (this repo's `react-hooks/refs` lint forbids reading/writing
   *  `ref.current` during render; that component's own comment carries
   *  the full reasoning for the pattern it uses instead); a replay test
   *  threads its own loop variable the same way. Omitted or `undefined`
   *  reads as `0` — the honest answer for the very first frame of a
   *  session, and the same floor `armedMirror`'s own "un-started,
   *  always" stance already assumes. */
  previousElapsedSeconds?: number;
}

// --- Pane C's grid (handoff §3, "Pane C — the grid") ---------------------

export type GridRowState = "completed" | "active" | "upcoming";

/** One judged-or-programmed grid cell. `judged` is non-null ONLY when the
 *  cell holds a machine ACTUAL; a programmed target is a plain string and
 *  can therefore never pick up a tint, no matter what a pane does with it
 *  (handoff §3: "Programmed values are never tinted — only what actually
 *  happened gets judged"). */
export interface GridValue {
  display: string;
  judged: JudgedValue | null;
}

export interface GridRow {
  /** 0-based program index. NOT what the `#` cell renders (see `ordinal`) —
   *  kept for the React key and for filing an actual against its row. */
  index: number;
  state: GridRowState;
  /** THE `#` CELL (connected-revamp Task 5, design spec §5b): the row's
   *  1-based position. `intervalNumbering(program.intervals)`'s own
   *  `ordinals` array, read straight through — this function does not
   *  re-derive it, so the row and the header's own `N OF M` cannot disagree
   *  (`buildSurfaceModel` reads the same array for `intervalLabelShort`).
   *  Phase WU removed the `null`/`WU` case: there is no unnumbered
   *  interval any more. */
  ordinal: number;
  time: string;
  meters: string;
  /** Which cell is the ACTIVE row's countdown — the programmed dimension
   *  (handoff §3: "the programmed dimension is the one that counts down and
   *  the one that wears accent"). `null` on every other row, and it is the
   *  only place `--accent` appears anywhere on the three panes. */
  countdown: "time" | "meters" | null;
  pace: GridValue;
  spm: GridValue;
  hr: string;
  rest: string;
}

export interface GridModel {
  rows: GridRow[];
  activeIndex: number;
  /** The handoff's own words-not-glyphs caption naming which rows count
   *  METERS down, or `null` when the session has no distance interval and
   *  therefore nothing to explain. CR2 spec 3 Task 5 (design spec §2B):
   *  merged with the README's own scroll hint — `N MORE BELOW` prefixed
   *  ahead of the distance sentence, e.g. `5 MORE BELOW · ROW 5 IS A
   *  500 M PIECE` — built by `footerCaptionFor` below. */
  caption: string | null;
}

export interface SurfaceModel {
  status: SurfaceStatus;
  /** Every actual is greyed and unjudgeable. */
  stale: boolean;
  /** Filled indicator square (linked) vs hollow (link lost). */
  linked: boolean;
  /** `PM5 430123456`, or `PM5 430123456 · LOST`. */
  deviceCaption: string;
  /** `INTERVAL 3 OF 24 · WORK` (design spec §5b). Falls back to the bare
   *  phase word for an interval with no ordinal at all, which only an
   *  EMPTY program can now produce — Phase WU removed the unnumbered
   *  warm-up that used to be the real case. No current renderer: its only one, `PaneTimer.tsx`'s pane A, retired with
   *  connected-revamp Task 2. CR2 spec 3 Task 5 CORRECTS an earlier plan
   *  assumption carried in this comment: the grid header does NOT rehome
   *  THIS field — it composes `intervalOrdinalLabel` (below) with
   *  `totalLeftDisplay` instead, because this field bakes the phase word
   *  in and the grid header never wants it (`ConnectedSurface.tsx`'s own
   *  header comment). So this field stays computed, correct and genuinely
   *  unrendered — kept for the same reason `intervalLabelShort` is kept
   *  alongside it, not because a future task still owes it a home. */
  intervalLabel: string;
  /** `3 OF 24 · WORK` (pane B's header line, where the device name already
   *  occupies the left of the row). The denominator is every interval — see
   *  `intervalNumbering`. CR2 spec 3 Task 2 (design spec §2D): gains an
   *  ARMED branch — `${ordinal} OF ${count} · READY` — closing PROVENANCE
   *  item 3. */
  intervalLabelShort: string;
  /** CR2 spec 3 Task 2 (design spec §3, composition note under §2B):
   *  ordinal-only sibling of `intervalLabelShort` — `3 OF 24`, or `null`
   *  when the interval has no ordinal at all (an empty program; Phase WU
   *  removed the unnumbered warm-up that used to be the real case).
   *  `intervalLabelShort` bakes the phase word in
   *  (`· WORK`/`· READY`), which the grid header (§2B) does not want — it
   *  joins THIS field with `totalLeftDisplay` instead
   *  (`3 OF 12 · 38:20 LEFT`), so a later task reads the ordinal without
   *  re-parsing the phase word back out of the combined caption. */
  intervalOrdinalLabel: string | null;
  /** `LAST` once the link is gone (handoff §4); `""` every other status.
   *  CR2 spec 3 Task 2 (design spec §3 fate table, "Stale" table): the
   *  `NOW` branch DIES with the hero labels themselves — 2A's own table
   *  cuts `NOW`/`TARGET`/`UP NEXT` labels from LIVE outright, so `LAST` is
   *  now the only word this field ever produces, and `PaneLive.tsx`'s
   *  existing `!== ""` guard already renders nothing for every other
   *  status with no pane-file change required. The unit used to ride in
   *  this label (`NOW · /500M`); testers asked for it beside the NUMERAL
   *  instead (James, 2026-08-13), and `PaneLive.tsx` renders it there now —
   *  carrying it in both places would say `/500m` twice inside one hero. */
  nowLabel: string;
  /** THE NEXT LINE (connected-polish design spec, Item B): built by
   *  `connectedNextText` from the coming phase's own `label` plus its
   *  extent and `@spm` — `WORK 1500m · 2:13.0 @24`, `TEST · All out`,
   *  `REST 1:00`, or `FINISH` past the last phase. One
   *  richer phase, not two: `thenNext` is gone from this interface outright
   *  (the then-clause dies everywhere, James's ruling). CR2 spec 3 Task 2
   *  (design spec §2D) gains an ARMED branch — at armed this reads the
   *  FIRST interval forward (`phases[phaseIndex]`) rather than
   *  `phases[phaseIndex + 1]`, because there is no "current" phase yet to
   *  be up-next FROM; the non-armed formula is unchanged. */
  upNext: string;
  totalSeconds: number;
  /** `44:12` — CR2 spec 3 Task 4 deleted the sibling `totalLeftSeconds`
   *  field (spec §3 fate table): `PaneLive`'s own `TimerRuler` cell was its
   *  only render site, and the band cell that replaces it renders THIS
   *  field directly; `ConnectedProgressBar` takes elapsed/`totalSeconds`
   *  itself rather than a pre-subtracted figure. Pane C's grid header reads
   *  it too — there is no room for a second ruler there either.
   *
   *  EST LEFT (Phase LL): `totalSeconds - elapsedSeconds` still, but
   *  `elapsedSeconds` no longer mirrors the wire's own accumulated clock —
   *  see that field's own doc comment for the estimate it now carries. */
  totalLeftDisplay: string;
  /** CR2 spec 3 Task 2 (antagonist correction 1): the model's own numeric
   *  elapsed, `0` on the `armedMirror` branch (mirrors `totalLeftSeconds`'s
   *  own "armed reads un-started, always" stance one line above it).
   *  `elapsedDisplay` below is the same fact as a STRING for the log
   *  sheet; this is the NUMBER `ConnectedProgressBar` needs to place its
   *  fill.
   *
   *  EST LEFT (Phase LL design spec §1): no longer a straight mirror of
   *  `frame.sessionElapsedSeconds` — that field is the wire's own
   *  accumulated clock, which FREEZES for the whole span of a rest a
   *  rower sits through motionless (the bug this rewrite fixes). The
   *  value here is `min(estElapsed, totalSeconds)` (§2: the cap is kept,
   *  load-bearing so the bar can never exceed 100%), where `estElapsed`
   *  is every COMPLETED phase's own PROGRAMMED length, summed, plus a
   *  LIVE term for the phase in progress — the machine's own Rest Time
   *  countdown (`frame.restSeconds`) during a rest, which counts down in
   *  real time regardless of the flywheel, or the raw interval clock
   *  otherwise — clamped to never decrease across frames (§3;
   *  `input.previousElapsedSeconds` is how that memory reaches this
   *  otherwise-pure function). See `buildSurfaceModel`'s own `estElapsed`
   *  local for the exact formula and its citations. */
  elapsedSeconds: number;
  /** EST LEFT (Phase LL design spec §4, plan Step 5): `true` unless every
   *  phase from the current one to the end of the session is UNPRICED
   *  (`phaseSeconds` returns `null` for all of them — reachable with a
   *  null-baseline distance effort phase) — the identical
   *  rule `session/Timer.tsx`'s `hasRemainingEstimate` already gives the
   *  phone timer, reused rather than reinvented (its own doc comment has
   *  the full reasoning: re-evaluated fresh every frame against the
   *  CURRENT phase, not computed once). `PaneLive.tsx` hides the progress
   *  bar and the EST LEFT cell entirely when this is `false`, the same
   *  "absent, never a frozen 0:00/0%" stance the phone timer takes — an
   *  unpriced phase's own live term is a genuine hole (DEVIATIONS.md), and
   *  showing a number built on it would be worse than showing nothing. */
  hasRemainingEstimate: boolean;
  /** THE SESSION'S OWN RUNNING TOTAL (connected-metrics design spec, "Total
   *  meters (whole session)") — `frame.sessionDistanceMeters`, work + rest
   *  by construction, read straight through (Task 4 places and formats
   *  it). A plain running number, never a `JudgedValue`: nothing programs
   *  a target for the WHOLE SESSION to judge it against, so there is no
   *  verdict for this field to carry — unlike the now-dead session-wide
   *  `meters` field this replaces (see `targetSplit`'s own neighbouring
   *  comment for what died and why), this one is unjudged by design, not
   *  by omission. `null` until the machine's first frame arrives — `0m`
   *  thereafter — never conflated with the honestly-zero `NO_FRAME`
   *  placeholder (`buildSurfaceModel`'s own `sessionDistanceMeters` local
   *  checks `input.frame` directly for exactly this reason). */
  sessionDistanceMeters: number | null;
  /** Where the intervals actually are, for the live pane's notched TOTAL
   *  LEFT bar (design spec §5). One entry per INTERIOR interval boundary —
   *  the bar's spans are the intervals the program has, never
   *  `phases.length` — exactly `intervalLabelShort`'s own `OF N` minus one.
   *  Completed intervals are re-anchored to the machine's own actuals; see
   *  `session/intervalBoundaries.ts`. */
  boundaries: IntervalBoundaries;
  elapsedDisplay: string;
  pace: JudgedValue;
  /** The hero split, cut so the tenths can be set smaller (handoff §3: "the
   *  eye should land on the seconds, not the decimal"). `paceTenths` is `""`
   *  when there is no reading. */
  paceWhole: string;
  paceTenths: string;
  rate: JudgedValue;
  /** THE INTERVAL AVERAGE (connected-metrics design spec, "Average split" +
   *  States table): `frame.splitAvgPace`, plain ink and unjudged while the
   *  interval runs (the standing start dominates a live running average
   *  until 65-99% of the interval has elapsed — a judged cell would read
   *  SLOWER for most of every interval no matter how well the rower is
   *  pulling), judged only at REST against the FINISHED interval's own
   *  target, using `ON_TARGET_BAND_SECONDS` — see `avgVerdict`. `absent`
   *  for a zero/null reading (the wire's own "no sample yet" value), for a
   *  referent mismatch (the driver already nulls `frame.splitAvgPace` when
   *  its own provenance lags the referent — this file does not re-derive
   *  that), for a rest with no completed WORK interval behind it, and for
   *  finished/terminated/idle (`frame.intervalIndex === null` checked
   *  directly, never through the `?? 0` laundering the interval clamp above
   *  uses — that laundering would otherwise pair AVG with interval 0's
   *  target). */
  avg: JudgedValue;
  /** The rate hero's own target row: `FREE` when the phase carries no spm,
   *  and the house `DASH` when there is no phase at all — exactly the two
   *  cases `targetSplit.main` distinguishes, since a rate slot cannot claim
   *  a phase asks for no particular rate when no phase exists (tail review
   *  M-1). Connected-revamp
   *  Task 3 fix round 1 (task-3-review.md Minor-3): this replaced a string
   *  caption (`"NO RATE TARGET"` / `` `TARGET ${targetSpm}` ``) PaneLive
   *  used to parse for its numeral — `targetSpm` was already in hand two
   *  lines from where that caption used to be built, so reading it
   *  straight into a `{ main }` pair costs nothing and removes the
   *  presentation-string coupling. Mirrors `targetSplit` below; no `sub`
   *  because a rate target carries no ref to show underneath it. */
  targetRate: { main: string; absent: boolean };
  // `meters` and `hr` (session-wide JUDGED distance and heart rate) DIED
  // here (CR2 spec 3 Task 4, spec §3 fate table): `PaneLive`'s `TOTAL M`
  // and `HR` cells were their only render sites, and both cells are cut
  // outright — `GridRow.meters` (the grid's METERS column) is a different
  // field and SURVIVES; HR stays as a grid COLUMN, off `GridRow`, computed
  // locally in `buildGridModel` below rather than exposed here.
  // `sessionDistanceMeters` above is NOT that field come back — it is an
  // unjudged plain number restoring a render site (connected-metrics
  // design spec), never a `JudgedValue`; see its own doc comment.
  /** The TARGET SPLIT card: resolved value + the ref it came from —
   *  ordinarily this interval's own target, but during a rest that folded
   *  onto a completed WORK interval, the FINISHED interval's target
   *  instead (connected-metrics design spec, States table) — see
   *  `buildSurfaceModel`'s own `targetSplitPhase` for the exact rule. */
  targetSplit: { main: string; sub: string | null; absent: boolean };
  /** That card's third line — the ref when there is one, and EMPTY when
   *  there isn't. It used to read `NO SPLIT TARGET` beside a dash; both
   *  surfaces now name the phase instead — `Easy`, `Rest`, `All out` for
   *  the phase kinds, and `ALL OUT`/`EASY` for a work phase at an effort
   *  ref (`domain/pace.ts`'s `effortWord`, caps on purpose — see the `FREE`
   *  comment in `session/TimerTargets.tsx`) — so the caption would only
   *  repeat the value above it. Empty is therefore the COMMON case, not the
   *  edge one, and `PaneLive.tsx` renders no element at all for it rather
   *  than an empty span (tail review M-5; that file's own comment carries
   *  the measurement behind the choice). */
  targetSplitCaption: string;
  /** Pane C. Built here, not in the pane, so its actual cells go through
   *  the same `judgedValue` path every other pane's do. */
  grid: GridModel;
}

/** `frame.currentSplit` is meaningless when nobody is pulling: the PM holds
 *  its last value rather than reporting zero, and the handoff is explicit
 *  that a paused `NOW` reads `—` with the caption `NOT ROWING` ("there is no
 *  current pace when nobody is pulling"). Suppressing it HERE, once, is why
 *  no pane has to know about the paused case.
 *
 *  A ZERO split is the same statement from the other direction (7B
 *  iteration, 2026-08-08): before the first pull — and in rests and
 *  boundary frames — the PM reports Current Pace 0, and hardware walk 2
 *  showed the hero judging that 0 against the target: `0:00.0` painted in
 *  the FASTER-than-target colour (ochre on that walk, blue since the
 *  2026-08-13 repaint) at a rower who had not taken a stroke. A 0.00
 *  s/500m pace is not
 *  a reading; it maps to the same `null` the paused case takes, so the
 *  hero renders the dash in ink and judgement colours appear only once a
 *  real split exists. */
function livePace(frame: MonitorFrame, status: SurfaceStatus): number | null {
  if (status === "paused") return null;
  return frame.currentSplit === 0 ? null : frame.currentSplit;
}

/** THE RATE HERO'S OWN VERSION OF `livePace`, ADDED task 5 (connected-axes
 *  2a — the brief's own "gaining what livePace has"). A stopped rower's spm
 *  does not fall to zero the way a REST boundary's does; the freeze
 *  predicate's own three-metric key (`useMonitorSession.ts`'s `freezeKey`)
 *  holds it PINNED at its last value right alongside split and distance —
 *  that pinned value is the very evidence `PAUSED_FRAME_HOLD` fires on. So
 *  without this suppression the rate hero would keep showing a live-looking
 *  number (a real erg's own last cadence, e.g. 68) at a rower who has
 *  stopped pulling, exactly the "claims a reading it doesn't have" defect
 *  the split hero was already fixed against. No zero-split-is-not-a-reading
 *  twin exists for rate (0 spm is a real, honest reading — a rest, or the
 *  instant before the first stroke — `judgedValue`'s own `null`-only
 *  absence rule already covers it), so this function is shorter than
 *  `livePace`: paused suppresses, everything else passes the frame's spm
 *  straight through. */
function liveRate(frame: MonitorFrame, status: SurfaceStatus): number | null {
  if (status === "paused") return null;
  return frame.spm;
}

/** THE HERO CANNOT CLIP (design spec §6/revision §3): `min-width: 0` and
 *  `white-space: nowrap` (`PaneLive.tsx`, `index.css`) keep a real split
 *  from wrapping mid-numeral, but nothing bounds how WIDE a live reading
 *  can be — a boundary-frame glitch or a genuinely stalled erg can report a
 *  split with more digits than the hero was sized for. Anything slower
 *  than this (599.9s, `fmtSplit`'s own one-decimal precision) is treated
 *  as no reading at all rather than a five-plus-character numeral: `null`
 *  through `judgedValue` renders `DASH` and judges `"within"` (rule 2),
 *  the same honest "nothing to show" every other absent case on this pane
 *  takes.
 *
 *  LEAKS INTO PANE C, deliberately (task-3-review.md Minor-4): `pace`
 *  below is the same `JudgedValue` `buildGridModel` receives as `livePace`
 *  for the active row's `/500M` cell, so a capped split blanks that cell
 *  too — a 19px grid cell has no width problem of its own, so the cap's
 *  own reason does not apply there, but the alternative (deriving a
 *  SECOND, uncapped pace for pane C) would let a rower swipe from a dash
 *  on B to a five-digit number on C for the exact same live reading,
 *  which is worse. One capped value, shared, stays consistent with "the
 *  same objects, so a rower swiping cannot find the split judged one way
 *  on one pane and another way on the next" (`buildGridModel`'s own
 *  comment). */
const PACE_HERO_CAP_SECONDS = 599.9;

/** THE MID-SESSION MIRROR's own reset window (design spec §2, Item 3; 2a
 *  plan Task 3) — how close `frame.distanceMeters` (0x0031's PER-INTERVAL
 *  distance, `domain/monitor/types.ts`'s own field, never
 *  `sessionDistanceMeters`) must sit to zero for a `rowingActive === false`
 *  frame to count as "before the first pull of the next piece" rather than
 *  a genuinely stalled rower mid-piece.
 *
 *  Tuned against the walk's own committed rings
 *  (`docs/monitor/sessions/walk-2026-08-15/`), the ONLY observed values at
 *  this exact boundary: session-a seq29 `distance=0`, session-b seq28
 *  `distance=0.8`, session-c seq26 `distance=0` — all three
 *  `rowingActive=false`. `1` sits strictly above the largest of those and
 *  strictly below the guard's own advancing-distance case (this file's
 *  tests move to `5.4`), so it is not a coin-flip between the two: it is a
 *  reset window with real headroom on both sides of the only readings that
 *  exist. */
const MID_SESSION_RESET_METERS = 1;

/** THE REST VERDICT'S OWN BAND (connected-metrics design spec, "The
 *  judgement" — SETTLED 2026-08-18): 0.5 s/500m, not `domain/judge.ts`'s
 *  `PACE_TOLERANCE_SECONDS` (2s) — a tighter band because this comparison
 *  judges a SETTLED number, the finished interval's own average held flat
 *  by the machine through the whole rest, never a live one still
 *  converging (the same design section's own measurement: a judged LIVE
 *  cell would read SLOWER for 65-99% of every interval no matter how well
 *  the rower pulls, which is why that comparison never runs while rowing —
 *  see `avgValue` below).
 *
 *  EXTRACTED to `../../judgeBand.js` (Phase LT spec 1, Task 2 — James's
 *  2026-08-18 ruling that the summary's row judgment shares this SAME
 *  band): this file no longer defines the number, it imports and
 *  re-exports the one shared copy, so every existing import of
 *  `ON_TARGET_BAND_SECONDS` from this module (this file's own
 *  `avgVerdict` below, plus `surfaceModel.test.ts`) keeps resolving with
 *  no other change. `judgeBand.test.ts`'s drift test pins this re-export
 *  to the shared module's own value by reference, not just by number. */
export { ON_TARGET_BAND_SECONDS };

/** AVG's OWN COMPARISON — deliberately NOT a second call into
 *  `domain/judge.ts`'s `judgeActual` (this file's header comment, rule 1:
 *  "ONE judgement path... the only function in `src/` that calls
 *  `judgeActual`"). Two reasons this is a dedicated comparator rather than
 *  a second call site:
 *   - the tolerance is `ON_TARGET_BAND_SECONDS` above, not `judgeActual`'s
 *     `toleranceFor("pace")` (`PACE_TOLERANCE_SECONDS`, 2s) — adding a
 *     third `kind` there for this one caller would grow that file's own
 *     tripwire comment for a target it was never asked to carry, and this
 *     task's scope is `surfaceModel.ts`/`.test.ts` alone (task-3 brief).
 *   - the design spec cites the direction rule by name
 *     (`summaryModel.ts:208-224`'s "+ = slower"), not `judgeActual`'s own
 *     `fasterThanTarget` branch — the same answer, computed the way the
 *     spec asks for it.
 *  `"within"` reuses the SAME `Judgement` union and the SAME
 *  `.timer-card-actual-within` CSS hook (`index.css`: "within tolerance IS
 *  plain ink") — no new visual state exists to add. What is new is only
 *  that AVG can reach a real verdict at all: `avgValue` below forces the
 *  target `null` on every path but a genuine rest-after-a-completed-work-
 *  interval, which resolves here to `"within"` the same "nothing to judge"
 *  way `judgeActual`'s own rule 2 does — so "plain ink, unjudged" while
 *  rowing falls out of this function rather than needing its own branch. */
function avgVerdict(actualSeconds: number, targetSeconds: number): Judgement {
  // "+ = slower" (summaryModel.ts:208-224): a positive deviation means the
  // held average took MORE seconds per 500m than the target, i.e. slower —
  // the same sign `judgeActual`'s own pace direction resolves to (`diff =
  // actual - target`), arrived at independently per the design's own
  // citation rather than by calling that function.
  const deviationSeconds = actualSeconds - targetSeconds;
  if (Math.abs(deviationSeconds) <= ON_TARGET_BAND_SECONDS) return "within";
  return deviationSeconds > 0 ? "slower" : "faster";
}

/** AVG's own `JudgedValue` builder — mirrors `judgedValue`'s precedence
 *  (stale beats everything; a `null` actual or target reads `"within"`)
 *  without routing through `judgeActual`, for the reasons `avgVerdict`'s
 *  own comment gives. `target` is `null` on every path except a genuine
 *  rest-after-a-completed-work-interval with a numeric split target
 *  (`buildSurfaceModel`'s own `avgJudgeTarget`) — everywhere else this
 *  collapses to "show the number, plain ink", the design's "plain ink,
 *  unjudged" rule for every state but the rest verdict. */
function avgValue(args: {
  actual: number | null;
  target: number | null;
  stale: boolean;
}): JudgedValue {
  const { actual, target, stale } = args;
  const judgement: Judgement = stale
    ? "stale"
    : actual === null || target === null
      ? "within"
      : avgVerdict(actual, target);
  return {
    display: actual === null ? DASH : fmtSplit(actual),
    judgement,
    absent: actual === null,
  };
}

export function buildSurfaceModel(input: SurfaceModelInput): SurfaceModel {
  const { phases, program, deviceName, status } = input;
  const frame = input.frame ?? NO_FRAME;
  const stale = staleFor(status);

  // THE SESSION'S OWN RUNNING TOTAL (connected-metrics design spec, "Total
  // meters (whole session)"): exposed here because `PaneLive` reads only
  // `SurfaceModel`, never `frame`, directly (`ConnectedSurface.tsx`'s own
  // `<PaneLive model={model} />`) — Task 4 places and formats it, this
  // file only carries the fact through. Checked against `input.frame`,
  // never the `frame` local (which falls back to `NO_FRAME`): `null` is
  // "absent until the first frame arrives" (the design's own words) —
  // `NO_FRAME.sessionDistanceMeters` is honestly `0`, which would
  // otherwise be indistinguishable from a real first frame reporting zero.
  const sessionDistanceMeters =
    input.frame === null ? null : frame.sessionDistanceMeters;

  // The CLAMP is against the program's own length: `frame.intervalIndex` is
  // a program index. This used to be one of TWO DIFFERENT COUNTS (design
  // spec §5b) — the caption's denominator counted working intervals only,
  // excluding the warm-up — and Phase WU collapsed them back into one
  // legitimately, by removing the thing they differed over.
  const intervals = program.intervals.length;
  const rawIndex = frame.intervalIndex ?? 0;
  const intervalIndex = Math.min(
    Math.max(rawIndex, 0),
    Math.max(intervals - 1, 0),
  );
  const numbering = intervalNumbering(program.intervals);
  const resting = frame.state === "resting";
  const phaseIndex = phaseIndexForInterval(phases, intervalIndex, resting);
  const phase = phases[phaseIndex];

  // A work phase's programmed split is only a TARGET when the rower chose a
  // pace: `targetKind === "effort"` means the number is an estimate the
  // compiler deliberately does not program (`program.ts`'s H8 rule), so
  // judging a live split against it would invent a target the machine was
  // never given.
  const targetSplitSeconds =
    phase?.targetKind === "split" && phase.targetSplit !== undefined
      ? phase.targetSplit
      : null;
  const targetSpm = phase?.spm ?? null;

  // THE REST VERDICT'S OWN REFERENT (connected-metrics design spec, States
  // table rows "Rest, after a completed work interval" vs "Rest, before
  // any work interval completes"). `phaseIndexForInterval`'s own resting
  // rule lands `phase` on the REST phase that folded onto the current
  // referent — but only when one exists in `phases[]` at all: an interval
  // with zero programmed rest never gets a `"rest"` phase
  // (`domain/expand.ts`'s/`engine.ts`'s own truthiness checks on
  // `restMinutes`), so a machine that briefly reports
  // `resting` there still resolves `phase` to the WORK phase itself — the
  // r0 case the design's own "Honest limits" names ("gets the average but
  // never the colour"). `isRestPhase` is therefore the real discriminant,
  // never `resting` alone.
  const isRestPhase = phase?.type === "rest";
  // The interval that JUST FINISHED — `undefined` unless this genuinely IS
  // a rest phase AND the phase before it was real WORK ("before any work
  // interval completes", design spec row 5, must read exactly as it always
  // has). ONE lookup shared by the TGT override below and by AVG's own
  // judgement target, so the two can never name different intervals.
  const finishedWorkPhase =
    isRestPhase && phases[phaseIndex - 1]?.type === "work"
      ? phases[phaseIndex - 1]
      : undefined;

  // THE MIRROR (design spec §2, Item 3 — "mirror the machine wherever ITS
  // display shows 0, not only at armed"; 2a plan Task 3). Wherever the
  // MACHINE's own screen would show 0 (or, at `armed`, a preview rather
  // than a reading), this surface must say the same thing — never the
  // wire's carried-over ghost from the piece that just ended, and never a
  // colour derived from comparing that ghost to a target. Two trigger
  // conditions the plan names as ONE rule, but which substitute DIFFERENT
  // values (design frame 2D, `docs/design/handoffs/2026-08-15-connected-v2/
  // README.md`'s own "Nothing is judged" line):
  //
  //  - `armedMirror` (pre-first-stroke of the whole SESSION): rate shows
  //    `0` in plain ink; split shows the TARGET value itself, as a preview
  //    — there is no live reading yet, so the hero previews what the rower
  //    is about to chase rather than an uninformative zero. (The "ghost"
  //    ink-4 STYLING that word names is a presentation concern, Task 5's;
  //    this file only has to produce the right VALUE and the right
  //    judgement.)
  //  - `midSessionMirror` (a mid-session interval boundary, before the
  //    first pull of the NEXT piece): `rowingActive === false` with
  //    `distanceMeters` at/near reset is the OBSERVED discriminator (the
  //    evidence dowry above `MID_SESSION_RESET_METERS`'s own comment) —
  //    here BOTH heroes read `0`: the machine's own display goes to zero at
  //    exactly this instant, and there is no earlier-in-the-piece target
  //    worth previewing (the rower has already seen it for the whole piece
  //    that just ended).
  //
  // `armedMirror` is checked separately from — not "OR'd blindly with" —
  // `midSessionMirror`: `status` is the CALLER's fact (Task 2's axes),
  // `rowingActive`/`distanceMeters` are THIS FRAME's. An armed frame's own
  // distance is always at reset anyway (the session has not begun), so the
  // two conditions never actually collide; naming them apart keeps the two
  // DIFFERENT substitutions legible rather than one boolean hiding two
  // answers.
  //
  // NEVER survives advancing distance (the plan's own words) —
  // `midSessionMirror` re-evaluates every frame, so the instant
  // `distanceMeters` moves past the reset window the mirror simply stops
  // firing; nothing here "latches" or needs an explicit end condition of
  // its own.
  const armedMirror = status === "armed";
  const midSessionMirror =
    !armedMirror &&
    frame.rowingActive === false &&
    frame.distanceMeters <= MID_SESSION_RESET_METERS;
  const mirrored = armedMirror || midSessionMirror;

  const rawPace = livePace(frame, status);
  const cappedPace =
    rawPace !== null && rawPace > PACE_HERO_CAP_SECONDS ? null : rawPace;
  // The ACTUAL slot substitutes; the TARGET slot rendered beneath it
  // (`targetSplit`/`targetRate` below) does not — those still name the
  // real programmed target regardless of the mirror, which is exactly what
  // `armedMirror`'s split preview borrows its number FROM. The JUDGING
  // target is forced `null` whenever mirrored (`judgeActual`'s own rule 2:
  // a `null` target is never a deviation) rather than relying on
  // `paceActual === targetSplitSeconds` happening to diff to zero at
  // `armedMirror` — that would be a coincidence this substitution should
  // not depend on for the "nothing judged" guarantee.
  const paceActual = mirrored
    ? armedMirror
      ? targetSplitSeconds
      : 0
    : cappedPace;
  const paceJudgeTarget = mirrored ? null : targetSplitSeconds;
  // `liveRate`, not `frame.spm` straight through (task 5): composes with
  // the mirror rather than fighting it — `mirrored` is checked FIRST in
  // this ternary exactly as `paceActual`'s own does, so an armed/reset
  // frame still gets its `0` regardless of `status`, and `liveRate`'s own
  // paused suppression only ever applies on the branch mirroring is not
  // already deciding.
  const rateActual = mirrored ? 0 : liveRate(frame, status);
  const rateJudgeTarget = mirrored ? null : targetSpm;

  const pace = judgedValue({
    kind: "pace",
    actual: paceActual,
    target: paceJudgeTarget,
    stale,
    format: fmtSplit,
  });
  const rate = judgedValue({
    kind: "spm",
    actual: rateActual,
    target: rateJudgeTarget,
    stale,
    format: (v) => String(Math.round(v)),
  });
  // THE SESSION-WIDE `meters` JUDGED VALUE DIED HERE (CR2 spec 3 Task 4):
  // it fed only `PaneLive`'s own `TOTAL M` cell, which the redesign cut
  // outright (spec §3 fate table). `frame.sessionDistanceMeters` gained a
  // NEW, unjudged consumer above (`sessionDistanceMeters`,
  // connected-metrics design spec, "Total meters (whole session)") — a
  // plain running total, never a `JudgedValue`, since nothing programs a
  // target for the whole session to judge it against. `GridRow.meters`
  // (the grid's own METERS column, a different fact — per-interval, not
  // session-wide) is still computed separately, in `buildGridModel` below.
  //
  // `hr` SURVIVES as a LOCAL value only — its own `PaneLive` HR cell is cut
  // the same way, but the grid's active row still needs a live HR reading
  // for its own HR column (`buildGridModel`'s `liveHr` param, just below),
  // so the computation stays; only the field's exposure on the returned
  // `SurfaceModel` is gone.
  const hr = judgedValue({
    kind: "hr",
    actual: frame.heartRateBpm,
    target: null,
    stale,
    format: (v) => String(Math.round(v)),
  });

  // THE INTERVAL AVERAGE (connected-metrics design spec, "Average split" +
  // States table). `frame.splitAvgPace` already carries the ONLY
  // provenance guarantee this file trusts: the driver nulls it whenever
  // its own capture lagged the referent (`domain/monitor/types.ts`'s own
  // field comment, interval-referent-monotone spec Task 2) — this
  // function does not re-derive that; the checks below add only the
  // product-level suppressions the wire cannot know about on its own.
  const avgAbsentByReferent = frame.intervalIndex === null;
  // ^ Checked against the RAW field, never `intervalIndex` (the laundered
  // `?? 0` local a few lines up) — finished/terminated/idle report `null`
  // here by the field's own business rule, and laundering it to 0 would
  // pair AVG with interval 0's referent instead of suppressing it
  // (design spec States table, "Finished / terminated / idle").
  const avgSuppressedByRest = isRestPhase && finishedWorkPhase === undefined;
  // ^ Design spec row "Rest, before any work interval completes": a rest
  // with no completed WORK phase behind it — a LEADING rest — suppresses
  // AVG even though 0x0033 may genuinely be holding a real number, because
  // there is no finished interval for that number to be a verdict on.
  const rawAvg = frame.splitAvgPace;
  const avgActual =
    avgAbsentByReferent ||
    avgSuppressedByRest ||
    rawAvg === null ||
    rawAvg === 0
      ? null
      : rawAvg;
  // Judged ONLY at rest, against the FINISHED interval's own numeric split
  // target — everywhere else (rowing, free, effort, the r0 edge)
  // this is `null`, which `avgValue` resolves to `"within"`/plain ink, the
  // design's "plain ink, unjudged" rule for every state but this one.
  const avgJudgeTarget =
    finishedWorkPhase?.targetKind === "split" &&
    finishedWorkPhase.targetSplit !== undefined
      ? finishedWorkPhase.targetSplit
      : null;
  const avg = avgValue({ actual: avgActual, target: avgJudgeTarget, stale });

  const [paceWhole, paceTenths] = pace.absent
    ? [pace.display, ""]
    : splitHero(pace.display);

  // THE NO-TARGET STATE (design spec §6, adversarial finding — REVISED
  // 2026-08-12 by James, from #89's warm-up captures). A REST phase with
  // NOTHING finished behind it (a leading rest), or any work phase without
  // a numeric split target (an "effort" target, a legacy run frozen before
  // `ref` existed), has no number for the hero's TARGET slot.
  //
  // §6 originally made that a `DASH` on this surface, because the phase's
  // own WORD in the target's type weight "read as a target that doesn't
  // exist". The phone timer never adopted that rule — it kept showing
  // `Easy`/`Rest`/`All out` — and once the revamp taught the two surfaces
  // one visual language, the same effort phase read `Easy` on the phone and
  // `— NO SPLIT TARGET` on the erg. James ruled the WORD, both places.
  //
  // §6's concern is answered by treatment rather than by omission: `absent`
  // still drives `connected-value-absent`, so the word is greyed and cannot
  // be mistaken for a programmed number. A dash carried no information; the
  // word says which kind of piece this is.
  //
  // THE WORD IS WHATEVER THE PHASE CALLS ITSELF, not a vocabulary this file
  // curates: `Easy`/`Rest`/`All out` for the phase kinds, and `ALL OUT`/
  // `EASY` (caps, `domain/pace.ts`'s `effortWord`) for a work phase at an
  // effort ref, which is the branch the ruling newly routed here and the
  // one no test or capture had reached (tail review I-1). The caps are
  // deliberate and shared with the timer's UP NEXT strip; the reasoning is
  // beside `FREE` in `session/TimerTargets.tsx`.
  //
  // REST NO LONGER ALWAYS TAKES THE PLAIN "Rest" WORD (connected-metrics
  // design spec, States table, "Rest, after a completed work interval" —
  // OVERTURNS the rule this comment used to state without exception).
  // `targetSplitPhase` below reads `finishedWorkPhase` in place of `phase`
  // whenever this genuinely is a rest that folded onto a completed WORK
  // interval, so the row reads as a verdict on what was rowed (`TGT
  // 2:13.0 · AVG 2:11.8`, not `TGT Rest`) — pairing a verdict with the
  // NEXT interval's target would judge a number the rower never rowed.
  // `finishedWorkPhase` is `undefined` on every other path (rowing, a
  // leading rest, the r0 edge), where this collapses back
  // to `phase` unchanged — "as today" everywhere the design's own States
  // table says "as today".
  const targetSplitPhase = finishedWorkPhase ?? phase;
  const targetSplitPhaseSeconds =
    targetSplitPhase?.targetKind === "split" &&
    targetSplitPhase.targetSplit !== undefined
      ? targetSplitPhase.targetSplit
      : null;
  const targetSplit =
    targetSplitPhase && targetSplitPhaseSeconds !== null
      ? { ...targetSplitDisplay(targetSplitPhase), absent: false }
      : {
          main: targetSplitPhase ? targetSplitPhase.label : DASH,
          sub: null,
          absent: true,
        };

  const totalSeconds = totalSessionSecondsOf(phases);

  // EST LEFT (Phase LL design spec §1): `frame.sessionElapsedSeconds` — the
  // wire's own driver-accumulated clock — is what this used to subtract,
  // and it is WRONG whenever a rower sits through a rest motionless: the
  // PM5's own per-interval clock (what that accumulation is built from)
  // freezes to the centisecond the instant `rowingActive` goes false, so
  // the countdown stopped moving while real time kept passing (James's own
  // report: TOTAL LEFT finished ~a minute high). The replacement sums
  // every COMPLETED phase's own PROGRAMMED length, plus a LIVE term for
  // whichever phase is current: the machine's own Rest Time countdown
  // (`frame.restSeconds`, 0x0032 offsets 13-15) during a rest — which
  // counts down in real time regardless of the flywheel, measured against
  // `docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl`
  // (spec §5) — or the raw per-interval clock (`frame.elapsedSeconds`)
  // while a work phase is running, which is correct there: a rower in a
  // WORK phase who has stopped pulling is not the case this fix exists
  // for, and the PM5 has no pause capability mid-piece (there is no wire
  // "paused" state at all — `MonitorFrame.state`'s own doc comment).
  //
  // `frame.intervalIndex === null` (armed/idle/finished/terminated — the
  // business rule `MonitorFrame.intervalIndex`'s own doc comment states)
  // has no CURRENT phase to found a phase-sum on. `phaseIndex`/`phase`/
  // `isRestPhase` above are already laundered to phase 0 for exactly these
  // states (`intervalIndex = frame.intervalIndex ?? 0`, needed there so
  // the hero targets always show SOMETHING) — reusing that laundering HERE
  // is precisely what a captured `finished` frame proved wrong: phase
  // index 7 collapsed to 0, and the completed-phase sum collapsed with it,
  // a measured −428.5 s jump (design spec §3). `surfaceModel.ts:865-870`
  // (this file's own AVG cell) already refuses the identical laundering,
  // checking the RAW field instead — this copies that stance rather than
  // inventing a new one. The fallback for a null index is the driver's own
  // session-accumulated total: not phase-founded, but never fabricates an
  // interval-0 identity nobody reported.
  const estElapsedRaw =
    frame.intervalIndex === null
      ? frame.sessionElapsedSeconds
      : (() => {
          let completed = 0;
          for (let i = 0; i < phaseIndex; i++) {
            completed += phaseSeconds(phases[i]!) ?? 0;
          }
          const live = isRestPhase
            ? Math.max(0, (phaseSeconds(phase) ?? 0) - frame.restSeconds)
            : frame.elapsedSeconds;
          return completed + live;
        })();
  // MONOTONIC, NOT OPTIONAL (§3): replayed frame-by-frame over the same
  // capture, the un-clamped estimate above drops five times — the
  // finished-frame collapse cited above, a work→work boundary race where
  // 0x0031's counters reset one notification before 0x0033's Interval
  // Count (−29.25 s), and a mid-rest elapsed re-base the register map
  // already absorbs for other consumers (−5.97 s). Clamping against the
  // LAST model's own `elapsedSeconds` catches all three without having to
  // enumerate their wire causes here. `buildSurfaceModel` has no memory of
  // its own — `input.previousElapsedSeconds` is the caller's, see
  // `SurfaceModelInput`'s own doc comment for who threads it and why.
  const estElapsed = Math.max(estElapsedRaw, input.previousElapsedSeconds ?? 0);
  // ARMED READS UN-STARTED, ALWAYS (I-1, final whole-branch review, carried
  // forward unchanged by this rewrite). Frame 2D's own words: "Progress bar
  // all-upcoming" and `TOTAL LEFT 50:00` — the whole session, nothing
  // subtracted — the same defensive stance the pace/rate mirror above
  // already takes: the wire's own carry-over rule (design spec §2 Item 3)
  // says elapsed/distance genuinely zero at armed, but the surface says
  // "un-started" on the STATUS, never on trusting the wire to actually be
  // zero every time.
  const totalLeftSeconds = armedMirror
    ? totalSeconds
    : Math.max(0, totalSeconds - estElapsed);
  // THE CAP IS KEPT (§2 — load-bearing, not incidental): `min(estElapsed,
  // totalSeconds)` is what stops a long final interval (or an accumulated
  // overrun) from ever pushing `ConnectedProgressBar`'s fill past 100%.
  // `0` on the armedMirror branch, the identical "armed reads un-started"
  // stance `totalLeftSeconds` just took, for the identical reason: an
  // armed frame's own carried-over pair is not to be trusted even where it
  // happens to already read zero.
  const elapsedSeconds = armedMirror ? 0 : Math.min(estElapsed, totalSeconds);
  const hasRemainingEstimate = phaseHasRemainingEstimate(phases, phaseIndex);

  const remaining = frame.intervalRemaining;
  const kindWord = phase ? phaseKindWord(phase.type) : "WORK";

  // THE ORDINAL BELONGS TO THE INTERVAL, THE WORD TO THE PHASE (§5b):
  // `2 OF 4 · WORK`, `2 OF 4 · REST` in its rest.
  //
  // The `null` fallback is the ONE unnumbered case Phase WU left behind: an
  // EMPTY program, where the clamp above pins `intervalIndex` to 0 with no
  // interval there to number. `compileProgram` cannot produce one
  // (`no-work`), so this is defence, not an expected path — but it is what
  // stops the caption reading `undefined OF 0`. The real case it used to
  // serve, a warm-up interval, no longer exists. The explicit annotation is
  // load-bearing: `ordinals` is `number[]` and `noUncheckedIndexedAccess`
  // is off, so without it TypeScript would call an out-of-range read a
  // `number` and delete the guard below as dead.
  const ordinalAt: number | undefined = numbering.ordinals[intervalIndex];
  const ordinal = ordinalAt ?? null;
  const counted = `${ordinal} OF ${numbering.workCount} · ${kindWord}`;
  // THE ORDINAL, ALONE (CR2 spec 3 Task 2, design spec §3): the grid header
  // (§2B) wants `3 OF 12` joined with `totalLeftDisplay`, never the phase
  // word `counted` already bakes in — see `intervalOrdinalLabel`'s own doc
  // comment on the interface above.
  const intervalOrdinalLabel =
    ordinal === null ? null : `${ordinal} OF ${numbering.workCount}`;
  // READY (design spec §2D — "the READY word ships HERE", closing
  // PROVENANCE item 3): the armed caption keeps the same no-ordinal rule
  // `counted`/`kindWord` already enforce, substituting the WORD only —
  // `intervalOrdinalLabel` above is exactly the prefix this needs, so the
  // two cannot drift apart the same way the grid `#` column and this
  // caption already cannot (`ordinal`, read once, both places).
  const readyLabel =
    intervalOrdinalLabel === null ? "READY" : `${intervalOrdinalLabel} · READY`;

  return {
    status,
    stale,
    linked: status !== "stale",
    deviceCaption: deviceCaptionFor(deviceName, status),
    intervalLabel: ordinal === null ? kindWord : `INTERVAL ${counted}`,
    // ARMED READS READY (CR2 spec 3 Task 2, design spec §2D — the READY
    // word ships HERE). Not-armed is entirely unchanged from before this
    // task: `ordinal === null ? kindWord : counted`.
    intervalLabelShort: armedMirror
      ? readyLabel
      : ordinal === null
        ? kindWord
        : counted,
    intervalOrdinalLabel,
    // ARMED CARRIES NO LABEL AT ALL (I-1, final whole-branch review — the
    // task seam that dropped this: `ConnectedSurface.test.tsx`'s own "Task
    // 3 owns the armed pane"). Frame 2D draws the heroes with no `NOW`
    // above them — the rower has taken no stroke yet, so there is nothing
    // "now" to caption. CR2 spec 3 Task 2 (design spec §3 fate table)
    // widens this to EVERY status but `stale`: 2A's own property table cuts
    // the `NOW` label from LIVE outright ("Cut from LIVE: NO NOW/TARGET/UP
    // NEXT labels"), so the word this field used to carry live/paused
    // never had anywhere left to be read once the labels themselves are
    // gone — `stale` still wins outright over every other status, unchanged
    // precedence, one fewer case. `PaneLive.tsx` renders nothing for the
    // empty string, the same "absent, not blank" idiom the target-ref
    // caption beside it already uses.
    nowLabel: stale ? "LAST" : "",
    // ARMED'S UP-NEXT IS THE FIRST INTERVAL FORWARD (design spec §2D,
    // antagonist correction 2): today's `connectedNextText(phases,
    // phaseIndex)` names `phases[phaseIndex + 1]` — the coming REST at
    // armed, per the committed `connected-armed-landscape.png` — because at
    // every OTHER status `phaseIndex` names the phase already IN PROGRESS,
    // so "next" correctly starts one further out. At armed nothing is in
    // progress yet, so `phaseIndex` itself is the first thing coming — one
    // index short of where the ordinary formula looks.
    // `connectedNextText(phases, i)` names `phases[i + 1]` by construction
    // (the same offset `upNextTextAt` always had, preserved verbatim), so
    // calling it one index EARLIER (`phaseIndex - 1`) reads
    // `phases[phaseIndex]` exactly, reusing the existing FINISH-at-the-end
    // handling rather than duplicating it.
    upNext: armedMirror
      ? connectedNextText(phases, phaseIndex - 1)
      : connectedNextText(phases, phaseIndex),
    totalSeconds,
    // `totalLeftSeconds` stays a LOCAL value only (CR2 spec 3 Task 4): the
    // returned `SurfaceModel` no longer exposes it — see this field's own
    // doc comment above.
    totalLeftDisplay: fmtDuration(totalLeftSeconds / 60),
    elapsedSeconds,
    hasRemainingEstimate,
    sessionDistanceMeters,
    boundaries: intervalBoundaries(phases, measuredWorkSeconds(input.actuals)),
    // The log sheet captions this `SESSION m:ss` — its ONLY render site
    // since the redesign (PaneLive's running clock retired with the label
    // layer; ConnectedSurface threads it to ConnectionLogSheet). Reads the
    // driver's accumulated pair straight through, DELIBERATELY unchanged by
    // the EST LEFT rewrite above: this caption is "how long has the session
    // actually been running" (walk 4's register map, rower-visible — a
    // mis-keyed register write shows here as well as in distance), a real
    // elapsed-time log rather than an estimate of what remains — a
    // genuinely different question from `elapsedSeconds`'s now-estimated
    // one, so the two are free to read different fields.
    elapsedDisplay: fmtDuration(frame.sessionElapsedSeconds / 60),
    pace,
    paceWhole,
    paceTenths,
    rate,
    avg,
    // `Free`, not a dash, for the same reason `targetSplit` names its phase
    // (James, 2026-08-12): the phone timer has always said `free` here, and
    // the two surfaces now share a language. Capitalized to sit beside the
    // phase-kind words `Easy`/`Rest`/`All out`, which are already Title case.
    //
    // ...but only when there IS a phase (tail review M-1). `Free` says "this
    // piece asks for no particular rate"; with no phase there is no piece to
    // say it about, and the split slot above already dashes for exactly that
    // reason. The two halves of the slot now agree on every path, which is
    // the invariant a reader assumes when they see one of them.
    targetRate: {
      main:
        phase === undefined
          ? DASH
          : targetSpm === null
            ? FREE
            : String(targetSpm),
      absent: targetSpm === null,
    },
    // `meters`/`hr` (the old JUDGED distance/HR) do NOT appear here (CR2
    // spec 3 Task 4) — see the doc comment above `targetSplit` for what
    // died and why; `hr` still feeds the grid's `liveHr` param a few lines
    // below, as a local value only. `sessionDistanceMeters` above and
    // `avg` are the two connected-metrics fields that replace it — neither
    // is the dead `meters` field's shape (unjudged number; judged-only-at-
    // rest, respectively).
    targetSplit,
    targetSplitCaption: targetSplit.sub ?? "",
    grid: buildGridModel({
      intervals: program.intervals,
      actuals: input.actuals,
      activeIndex: intervalIndex,
      remaining,
      accrued: frame.intervalAccrued,
      // The live cells the ACTIVE row shares with panes A and B — the same
      // objects, so a rower swiping from B to C cannot find the split
      // judged one way on one pane and another way on the next.
      livePace: pace,
      liveRate: rate,
      liveHr: hr,
      numbering,
      armed: armedMirror,
    }),
  };
}

/** The measured half of the notched bar (design spec §5): every interval the
 *  machine has actually finished, keyed by ITS OWN interval index, in the
 *  sparse-array shape `intervalBoundaries` documents.
 *
 *  Same `index !== null` contract `buildGridModel` applies for the same
 *  reason (`IntervalActual.index`: "A CONSUMER MUST NOT TREAT `null` AS
 *  INTERVAL 0") — an actual that belongs to no interval we can name
 *  re-anchors nothing, and the boundary it would have fixed stays an
 *  estimate rather than being moved to somebody else's number. */
function measuredWorkSeconds(
  actuals: IntervalActual[],
): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  for (const actual of actuals) {
    if (actual.index !== null) out[actual.index] = actual.elapsedSeconds;
  }
  return out;
}

/**
 * Pane C's rows, in the program's own order (handoff §3's three row states).
 *
 * **THREE STATES, NOT FOUR.** A row's state is decided by POSITION against
 * the machine's current interval, never by whether an actual happens to
 * exist for it: `MISSED` is not built. The handoff's own missed-row
 * treatment was only ever needed for the reconnect backfill (its open
 * question 2 — "if not, those rows need a `— · MISSED` treatment and I'll
 * design it"), and design spec C5 descopes auto-reconnect entirely, which
 * takes the backfill and the rows it would have failed to fill with it. So
 * a completed row with no actual on record shows dashes, and says nothing
 * it cannot back.
 *
 * WHAT THE ACTIVE ROW USED TO NOT BE ABLE TO SAY, and why one of its two
 * big cells was a permanent dash before ROADMAP CL item 7 (CLOSED,
 * `docs/design/DEVIATIONS.md`'s pane-C active-row row, reconciled the same
 * batch). The programmed dimension counts DOWN and comes from
 * `MonitorFrame.intervalRemaining` (the driver computes it). The OTHER
 * dimension — meters accrued on a time interval, time accrued on a distance
 * one — used to have no honest field anywhere on the seam; it now does,
 * `MonitorFrame.intervalAccrued`, the field's own doc comment (`domain/
 * monitor/types.ts`) has the full reasoning. The two REJECTED derivations
 * this comment used to consider are still worth naming, because they are
 * still why `intervalAccrued` had to be a DRIVER field rather than
 * something this file computes itself: `MonitorFrame`'s
 * `sessionElapsedSeconds`/`sessionDistanceMeters` are the session's
 * cumulative totals, and subtracting completed intervals from them would
 * silently fold every rest bout into the answer; 0x0031's own
 * `elapsedSeconds`/`distanceMeters` ARE per-interval (walk 4,
 * interface-notes.md §18) but span the interval's work AND its trailing
 * rest as one count, answering a different question than "meters accrued
 * rowing this interval". `intervalAccrued` reads 0x0031's own per-interval
 * pair directly (CR2 spec 2a Task 6 — the old 0x0033 checkpoint subtraction
 * was deleted after the checkpoint was measured lagging one boundary); see
 * `driver.ts`'s `computeAccruedForFrame`.
 * Same reasoning still applies, unrelated field, to task 6's own
 * `TOTAL`-not-`THIS INTERVAL` row (panes A/B's meters card).
 */
export function buildGridModel(args: {
  intervals: ProgramInterval[];
  actuals: IntervalActual[];
  activeIndex: number;
  remaining: MonitorFrame["intervalRemaining"];
  /** ROADMAP CL item 7: the active row's OTHER cell — meters accrued on a
   *  time interval, time accrued on a distance one. `null` (the pre-first-
   *  frame case, same guard `remaining` shares) keeps that cell the house
   *  dash; anything else replaces it, per `accruedDisplayFor` below. */
  accrued: MonitorFrame["intervalAccrued"];
  /** THERE IS NO `stale` PARAMETER, deliberately (task-7 review, M2). The
   *  active row's judged cells arrive already judged, as the SAME
   *  `JudgedValue` objects panes A and B show — so the stale greying reaches
   *  them through the one path that decided it, and no second caller here
   *  can disagree. Completed rows hold closed records, which the stale
   *  question does not apply to at all. Nothing in this function needs to
   *  know. */
  livePace: JudgedValue;
  liveRate: JudgedValue;
  liveHr: JudgedValue;
  /** Connected-revamp Task 5 (design spec §5b): `intervalNumbering`'s own
   *  output, READ not re-derived — `buildSurfaceModel` computes it once and
   *  hands it to both the header caption and this function, so a row's `#`
   *  and the header's `N OF M` are structurally the same array and cannot
   *  drift apart. */
  numbering: IntervalNumbering;
  /** I-1, final whole-branch review: `status === "armed"`, straight through
   *  from `buildSurfaceModel`'s own `armedMirror`. Before the first stroke
   *  nothing on the machine is actually counting down — the active row's
   *  countdown cell holds the PROGRAMMED full value (`countdownDisplayFor`'s
   *  own fallback), not a live reading — so the gold `--marker` mark that
   *  says "this is the one you're on and it's moving" would be claiming a
   *  motion that has not started. Suppressing `countdown` here is the same
   *  "nothing is judged" stance frame 2D takes on pane B's heroes, carried
   *  to pane C's own analogous mark. */
  armed: boolean;
}): GridModel {
  const { intervals, activeIndex, remaining, accrued, numbering, armed } = args;
  // An actual whose own `index` is `null` belongs to no interval we can
  // name (`IntervalActual.index`'s own contract: "A CONSUMER MUST NOT TREAT
  // `null` AS INTERVAL 0"), so it files against no row rather than against
  // the first one.
  const byIndex = new Map<number, IntervalActual>();
  for (const actual of args.actuals) {
    if (actual.index !== null) byIndex.set(actual.index, actual);
  }

  const rows = intervals.map((interval, index): GridRow => {
    const rest =
      interval.restSeconds > 0 ? fmtDuration(interval.restSeconds / 60) : DASH;
    // THE `#` CELL (design spec §5b): read straight off `numbering`, never
    // re-derived from `index` — see `GridRow.ordinal`'s own comment. The
    // `?? index + 1` is unreachable while caller and callee share one
    // program (`buildSurfaceModel` builds `numbering` from these same
    // `intervals`); it exists so a mismatched pair renders a number rather
    // than `undefined`.
    const ordinal = numbering.ordinals[index] ?? index + 1;
    if (index === activeIndex) {
      const countdown = countdownDisplayFor(interval, remaining);
      const accrual = accruedDisplayFor(interval, accrued);
      return {
        index,
        ordinal,
        state: "active",
        time: interval.kind === "time" ? countdown : accrual,
        meters: interval.kind === "distance" ? countdown : accrual,
        countdown: armed ? null : interval.kind === "time" ? "time" : "meters",
        pace: { display: args.livePace.display, judged: args.livePace },
        spm: { display: args.liveRate.display, judged: args.liveRate },
        hr: args.liveHr.display,
        rest,
      };
    }
    if (index < activeIndex) {
      const actual = byIndex.get(index);
      // A CLOSED ACTUAL NEVER ENTERS THE STALE QUESTION (task-7 review, M2,
      // and the handoff read correctly). §3 defines staleness once and it is
      // a property of the FEED — "stale data during a reconnect... a number
      // we can't vouch for is not judged" — and §4's own next sentence gives
      // the frame of reference away: "Hero labels change `NOW` -> `LAST`". A
      // value that becomes LAST was NOW. A completed interval's average was
      // never NOW: the machine reported it at the boundary, the driver filed
      // it as an `IntervalActual`, and a dead link cannot retract it. It is
      // the same number this grid shows after the session ends and the same
      // number 7C's log prefills from.
      //
      // This matters beyond taste because spec C5 makes `disconnected`
      // TERMINAL for the session: greying these would permanently erase every
      // judgement the rower had earned, on the one pane whose job is to show
      // what they have done, the moment a link dropped.
      //
      // `staleFor` stays "the single place that decides WHEN a reading is
      // stale" — this is not a second opinion about when, it is a cell that
      // holds no reading to ask about.
      const pace = judgedValue({
        kind: "pace",
        actual: actual?.avgSplit ?? null,
        target: interval.targetSplit,
        stale: false,
        format: fmtSplit,
      });
      const spm = judgedValue({
        kind: "spm",
        actual: actual?.avgSpm ?? null,
        target: interval.displaySpm,
        stale: false,
        format: (v) => String(Math.round(v)),
      });
      return {
        index,
        ordinal,
        state: "completed",
        time:
          actual === undefined ? DASH : fmtDuration(actual.elapsedSeconds / 60),
        meters:
          actual === undefined
            ? DASH
            : String(Math.round(actual.distanceMeters)),
        countdown: null,
        pace: { display: pace.display, judged: pace },
        spm: { display: spm.display, judged: spm },
        hr:
          actual?.avgHeartRateBpm === undefined ||
          actual.avgHeartRateBpm === null
            ? DASH
            : String(Math.round(actual.avgHeartRateBpm)),
        rest,
      };
    }
    // Upcoming: the PROGRAMMED values, every one of them a plain string.
    // "A pending distance row shows `—` in the time cell and its meters in
    // the meters cell" (handoff §3) — and the mirror for a time interval,
    // which the same sentence implies and the mockup's rows 4 and 6 draw.
    return {
      index,
      ordinal,
      state: "upcoming",
      time: interval.kind === "time" ? fmtDuration(interval.value / 60) : DASH,
      meters: interval.kind === "distance" ? String(interval.value) : DASH,
      countdown: null,
      pace: {
        display:
          interval.targetSplit === null ? DASH : fmtSplit(interval.targetSplit),
        judged: null,
      },
      spm: {
        display:
          interval.displaySpm === null ? DASH : String(interval.displaySpm),
        judged: null,
      },
      hr: DASH,
      rest,
    };
  });

  return {
    rows,
    activeIndex,
    caption: footerCaptionFor(intervals, numbering, activeIndex),
  };
}

/** The active interval's countdown, in its own programmed dimension. Falls
 *  back to the PROGRAMMED value when the machine has not reported a
 *  remaining figure yet (the instant before the first frame) or when the
 *  frame's own dimension disagrees with the program's — showing the full
 *  interval is honest there; inventing a number from the other dimension
 *  would not be. */
function countdownDisplayFor(
  interval: ProgramInterval,
  remaining: MonitorFrame["intervalRemaining"],
): string {
  const value =
    remaining !== null && remaining.kind === interval.kind
      ? remaining.value
      : interval.value;
  return interval.kind === "distance"
    ? String(Math.round(value))
    : fmtDuration(value / 60);
}

/** The active row's OTHER cell (ROADMAP CL item 7; `docs/design/
 *  DEVIATIONS.md`'s pane-C active-row row) — meters accrued on a time
 *  interval, time accrued on a distance one, closing the gap that row
 *  recorded as a bare dash. `null` — before the machine's first frame, or
 *  whenever `accrued` disagrees with the interval's own complement kind
 *  (the same defensive stance `countdownDisplayFor` takes for `remaining`)
 *  — is the one case still genuinely unknowable, and stays the house dash;
 *  there is no "programmed value" to fall back to here the way
 *  `countdownDisplayFor` has one, because an accrual that hasn't started is
 *  genuinely zero, not "the full interval". */
function accruedDisplayFor(
  interval: ProgramInterval,
  accrued: MonitorFrame["intervalAccrued"],
): string {
  const otherKind = interval.kind === "distance" ? "time" : "distance";
  if (accrued === null || accrued.kind !== otherKind) return DASH;
  return otherKind === "distance"
    ? String(Math.round(accrued.value))
    : fmtDuration(accrued.value / 60);
}

/** CR2 spec 3 Task 5 (design spec §2B): the footer caption merges the
 *  README's own scroll hint ahead of the distance sentence —
 *  `5 MORE BELOW · ROW 5 IS A 500 M PIECE`. "N MORE BELOW" is the count of
 *  program rows strictly after the ACTIVE one (every row past `activeIndex`
 *  is `"upcoming"` by construction — `buildGridModel`'s own three-state
 *  rule above is positional, not actual-backed), never a count of rows
 *  scrolled off the visible viewport: this module is pure (no React, no
 *  DOM — this file's own header comment) and has no way to ask the
 *  scroller what is actually on screen, so "below" reads the list's own
 *  order, the same "below" the active row's auto-scroll
 *  (`PaneGrid.tsx`'s `scrollIntoView`) keeps in view.
 *
 *  TWO SUPPRESSIONS, both deliberate: `below === 0` (the active row is the
 *  last one — nothing left to hint at) omits the prefix rather than
 *  printing `0 MORE BELOW`, and a `null` distance caption (no distance
 *  interval in the program at all) stays `null` outright — the hint's only
 *  job is to point at the sentence beneath it, and pointing at nothing
 *  would be its own false claim. */
function footerCaptionFor(
  intervals: ProgramInterval[],
  numbering: IntervalNumbering,
  activeIndex: number,
): string | null {
  const distance = distanceCaptionFor(intervals, numbering);
  if (distance === null) return null;
  const below = intervals.length - 1 - activeIndex;
  return below > 0 ? `${below} MORE BELOW · ${distance}` : distance;
}

/** Handoff §3: "A mono caption under the grid names it in words — `ROW 5 IS
 *  A 500 M PIECE · METERS COUNT DOWN` — rather than inventing a glyph."
 *
 *  The handoff writes the ONE-distance-row case. A real library workout has
 *  three (Filling Low) or twenty-four (Sea Smoke), so the sentence
 *  generalises: a short uniform set is listed by number, and anything
 *  longer or ragged is counted rather than enumerated, because a caption
 *  that lists twenty-four row numbers is not a caption. No distance
 *  interval at all -> no caption, not an empty one.
 *
 *  CONNECTED-REVAMP TASK 5 (design spec §5b, adversarial find, not named in
 *  the brief): the row numbers this caption prints must be the SAME numbers
 *  the grid's own `#` column shows, or the caption reads "ROW 2" beside a
 *  row visibly labelled "1". It therefore reads `numbering.ordinals` rather
 *  than keeping its own `i + 1` count — structurally the same array the
 *  grid uses, even now that Phase WU has made the numbering an identity
 *  again. */
function distanceCaptionFor(
  intervals: ProgramInterval[],
  numbering: IntervalNumbering,
): string | null {
  const rows = intervals
    .map((interval, i) => ({
      interval,
      number: numbering.ordinals[i] ?? i + 1,
    }))
    .filter((r) => r.interval.kind === "distance");
  if (rows.length === 0) return null;
  const tail = "METERS COUNT DOWN";
  const first = rows[0]!;
  if (rows.length === 1) {
    const m = first.interval.value;
    return `ROW ${first.number} IS ${articleFor(m)} ${m} M PIECE · ${tail}`;
  }
  const uniform = rows.every((r) => r.interval.value === first.interval.value);
  if (uniform && rows.length <= 4) {
    const list = rows.map((r) => r.number).join(", ");
    return `ROWS ${list} ARE ${first.interval.value} M PIECES · ${tail}`;
  }
  return `${rows.length} ROWS ARE DISTANCE PIECES · ${tail}`;
}

/** `AN 800 M PIECE`, `A 500 M PIECE`, `AN 1800 M PIECE`. These captions are
 *  read aloud by a screen reader as often as they are scanned, so the
 *  article follows the SPOKEN form.
 *
 *  Two cases take "an" (task-7 review, L6 — the first version claimed eight
 *  was the only one):
 *   - a leading 8: eight, eighty, eight hundred, eight thousand.
 *   - a four-digit distance beginning 11 or 18, which a rower says in
 *     hundreds: "an eleven hundred", "an eighteen hundred". 1500 is "a
 *     fifteen hundred", so the rule is the leading PAIR, not the leading 1.
 *
 *  Anything else takes "a". */
function articleFor(meters: number): string {
  const digits = String(meters);
  if (digits.startsWith("8")) return "AN";
  if (
    digits.length === 4 &&
    (digits.startsWith("11") || digits.startsWith("18"))
  ) {
    return "AN";
  }
  return "A";
}

/** `1:57.8` -> `["1:57", ".8"]`. `fmtSplit` always emits exactly one decimal
 *  place, so the cut is total; a value without one (only reachable if that
 *  formatter ever changes) keeps the whole string in the big slot rather
 *  than losing a digit. Exported for that second case alone — no production
 *  caller can reach it, and a guard nothing tests is a guard nobody knows
 *  works. */
export function splitHero(display: string): [string, string] {
  const dot = display.lastIndexOf(".");
  if (dot === -1) return [display, ""];
  return [display.slice(0, dot), display.slice(dot)];
}

/** Handoff §4's lost-link caption, with the spec's descope framing rather
 *  than the handoff's `· TRYING`: nothing IS trying. Auto-reconnect is a
 *  named follow-on (design spec §C5 — "7B ships lose-and-degrade"), so the
 *  caption states the fact, `LOST`, and promises nothing. */
function deviceCaptionFor(
  deviceName: string | null,
  status: SurfaceStatus,
): string {
  const name = deviceName ?? "PM5";
  return status === "stale" ? `${name} · LOST` : name;
}
