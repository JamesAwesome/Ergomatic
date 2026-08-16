// Everything the two connected panes render, derived ONCE from the
// machine's frame plus the workout's own frozen phases (7B Task 6, handoff
// §§3-4). The panes themselves are dumb: they read fields off `SurfaceModel`
// and place them. Two rules live here and nowhere else:
//
//  1. **ONE judgement path.** `judgedValue` below is the only function in
//     `src/` that calls `domain/judge.ts`'s `judgeActual`. Every live actual
//     on every pane — pane B's hero, rate, HR and meters cards — is a
//     `JudgedValue` produced by that one helper (handoff §3: "One helper
//     decides the colour; no pane implements its own judgement"). Pane C's
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
import type {
  ProgramInterval,
  WorkoutProgram,
} from "../../../domain/monitor/program.js";
import type {
  IntervalActual,
  MonitorFrame,
} from "../../../domain/monitor/types.js";
import type { EnginePhase } from "../../session/engine";
import {
  intervalBoundaries,
  type IntervalBoundaries,
} from "../../session/intervalBoundaries";
import {
  phaseKindWord,
  thenNextTextAt,
  totalSessionSecondsOf,
  upNextTextAt,
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
 * A warm-up is real time on the erg and a real `ProgramInterval`, but it is
 * no part of the count: a four-piece workout is four pieces whether or not
 * the rower's preference put eight easy minutes in front of them. So this
 * numbers the WORKING intervals 1..n and hands the warm-up `null` — the
 * caption drops its ordinal entirely, and Task 5's grid renders `WU` in the
 * `#` cell and starts at 1 on the first work piece.
 *
 * ONE RULE, TWO SURFACES: the caption below and the grid read the same
 * array, so a row's number and the header's `N OF M` cannot disagree.
 *
 * A "test" (open-ended all-out) interval COUNTS. "Working intervals only"
 * excludes the warm-up and nothing else — a test piece is the hardest work
 * in the session, not a preamble to it. (It is also unreachable today:
 * `compileProgram` rejects a phase with neither seconds nor meters, which
 * every "test" phase is — see its `unrepresentable-value` arm.)
 */
export interface IntervalNumbering {
  /** Per program interval, in the program's own order: its 1-based number
   *  among the working intervals, or `null` if it is a warm-up. */
  ordinals: (number | null)[];
  /** The caption's denominator — how many intervals are the work. */
  workCount: number;
}

export function intervalNumbering(
  intervals: readonly ProgramInterval[],
): IntervalNumbering {
  let workCount = 0;
  const ordinals = intervals.map((interval) =>
    interval.type === "warmup" ? null : (workCount += 1),
  );
  return { ordinals, workCount };
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
   *  1-based position among WORKING intervals, `null` for the warm-up.
   *  `intervalNumbering(program.intervals)`'s own `ordinals` array, read
   *  straight through — this function does not re-derive it, so the row and
   *  the header's own `N OF M` cannot disagree (`buildSurfaceModel` reads
   *  the same array for `intervalLabelShort`). `PaneGrid.tsx` renders `WU`
   *  when this is `null`. */
  ordinal: number | null;
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
   *  therefore nothing to explain. */
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
  /** `INTERVAL 3 OF 24 · WORK`, or a bare `WARM-UP` while the warm-up runs
   *  (design spec §5b — the ordinal belongs to the interval and a warm-up
   *  has none, so there is no `INTERVAL` prefix left to hang on it). No
   *  current renderer: its only one, `PaneTimer.tsx`'s pane A, retired with
   *  connected-revamp Task 2. Casualty list (design spec §3) rehomes it to
   *  the grid header (revision §4's `3 OF 12 · WORK · 0:47 LEFT`) — a later
   *  task's job, not this field's; the value stays computed and correct in
   *  the meantime. */
  intervalLabel: string;
  /** `3 OF 24 · WORK`, or `WARM-UP` (pane B's header line, where the device
   *  name already occupies the left of the row). The denominator counts
   *  WORKING intervals only — see `intervalNumbering`. */
  intervalLabelShort: string;
  /** `NOW` live; `LAST` once the link is gone (handoff §4). The unit used
   *  to ride in this label (`NOW · /500M`); testers asked for it beside the
   *  NUMERAL instead (James, 2026-08-13), and `PaneLive.tsx` renders it
   *  there now — carrying it in both places would say `/500m` twice inside
   *  one hero. */
  nowLabel: string;
  upNext: string;
  thenNext: string | null;
  totalSeconds: number;
  totalLeftSeconds: number;
  /** `44:12`, the same figure `TimerRuler` prints — pane C has no room for
   *  the ruler and carries it as the header line's trailing caption
   *  instead. */
  totalLeftDisplay: string;
  /** Where the intervals actually are, for the live pane's notched TOTAL
   *  LEFT bar (design spec §5). One entry per INTERIOR interval boundary —
   *  the bar's spans are the intervals the program has, never
   *  `phases.length`. On a session with no warm-up that is exactly
   *  `intervalLabelShort`'s own `OF N` minus one; with one, the extra span
   *  is the warm-up's, which `warmupEndsAt` marks so the bar can tone it out
   *  of the work (§5b). Completed intervals are re-anchored to the machine's
   *  own actuals; see `session/intervalBoundaries.ts`. */
  boundaries: IntervalBoundaries;
  elapsedDisplay: string;
  /** `LEFT IN INTERVAL` on a time interval, `METERS LEFT` on a distance one
   *  (handoff §3: "On a distance interval the second slot becomes METERS
   *  LEFT"). */
  intervalClockLabel: string;
  intervalClockValue: string;
  pace: JudgedValue;
  /** The hero split, cut so the tenths can be set smaller (handoff §3: "the
   *  eye should land on the seconds, not the decimal"). `paceTenths` is `""`
   *  when there is no reading. */
  paceWhole: string;
  paceTenths: string;
  rate: JudgedValue;
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
  meters: JudgedValue;
  hr: JudgedValue;
  /** The TARGET SPLIT card: resolved value + the ref it came from. */
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

export function buildSurfaceModel(input: SurfaceModelInput): SurfaceModel {
  const { phases, program, deviceName, status } = input;
  const frame = input.frame ?? NO_FRAME;
  const stale = staleFor(status);

  // TWO DIFFERENT COUNTS, deliberately (design spec §5b). The CLAMP is
  // against the program's own length — `frame.intervalIndex` is a program
  // index and a warm-up occupies one — while the caption's denominator below
  // counts working intervals only. Collapsing them back into one number is
  // exactly the defect this task exists to remove.
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

  const rawPace = livePace(frame, status);
  const paceActual =
    rawPace !== null && rawPace > PACE_HERO_CAP_SECONDS ? null : rawPace;

  const pace = judgedValue({
    kind: "pace",
    actual: paceActual,
    target: targetSplitSeconds,
    stale,
    format: fmtSplit,
  });
  const rate = judgedValue({
    kind: "spm",
    actual: frame.spm,
    target: targetSpm,
    stale,
    format: (v) => String(Math.round(v)),
  });
  // The whole-SESSION distance — `sessionDistanceMeters`, the driver's
  // accumulated total, NOT 0x0031's own `distanceMeters`. This comment used
  // to call the raw field "the machine's own whole-workout distance"; walk 4
  // (interface-notes.md §18, 2026-08-08) showed that premise is false —
  // 0x0031's Distance RESETS at every work interval, and this card was seen
  // falling 109 -> 50 at the 2x100m's second interval because of it.
  // Still not per-interval meters (the mockup's `THIS INTERVAL` caption
  // remains a claim the seam cannot back — see the task-6 report's deviation
  // note); the `TOTAL` caption below is now literally true rather than
  // accidentally so.
  const meters = judgedValue({
    kind: "meters",
    actual: frame.sessionDistanceMeters,
    target: null,
    stale,
    format: (v) => String(Math.round(v)),
  });
  const hr = judgedValue({
    kind: "hr",
    actual: frame.heartRateBpm,
    target: null,
    stale,
    format: (v) => String(Math.round(v)),
  });

  const [paceWhole, paceTenths] = pace.absent
    ? [pace.display, ""]
    : splitHero(pace.display);

  // THE NO-TARGET STATE (design spec §6, adversarial finding — REVISED
  // 2026-08-12 by James, from #89's warm-up captures). Every REST phase,
  // and any work phase without a numeric split target (an "effort" target,
  // a warm-up, a legacy run frozen before `ref` existed), has no number for
  // the hero's TARGET slot.
  //
  // §6 originally made that a `DASH` on this surface, because the phase's
  // own WORD in the target's type weight "read as a target that doesn't
  // exist". The phone timer never adopted that rule — it kept showing
  // `Easy`/`Rest`/`All out` — and once the revamp taught the two surfaces
  // one visual language, the same warm-up read `Easy` on the phone and
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
  const targetSplit =
    phase && targetSplitSeconds !== null
      ? { ...targetSplitDisplay(phase), absent: false }
      : {
          main: phase ? phase.label : DASH,
          sub: null,
          absent: true,
        };

  const totalSeconds = totalSessionSecondsOf(phases);
  // `sessionElapsedSeconds`, never `frame.elapsedSeconds`: 0x0031's own
  // clock RESETS at every work interval (walk 4, interface-notes.md §18), so
  // subtracting it counted the current interval only — TOTAL LEFT was
  // recorded falling 1:30 -> 1:11 and then RISING to 1:38 as interval 2
  // started. The driver's accumulated total is monotone across those resets,
  // which is the only thing that makes this subtraction a countdown.
  const totalLeftSeconds = Math.max(
    0,
    totalSeconds - frame.sessionElapsedSeconds,
  );

  const remaining = frame.intervalRemaining;
  const distanceInterval = remaining?.kind === "distance";
  const kindWord = phase ? phaseKindWord(phase.type) : "WORK";

  // THE ORDINAL BELONGS TO THE INTERVAL, THE WORD TO THE PHASE (§5b). An
  // unnumbered interval — a warm-up — leaves the kind word standing on its
  // own: `WARM-UP` while it runs, and `REST` through the warm-up setting's
  // own trailing rest, which is still no part of the rower's count. A work
  // interval is unchanged: `2 OF 4 · WORK`, `2 OF 4 · REST` in its rest.
  const ordinal = numbering.ordinals[intervalIndex] ?? null;
  const counted = `${ordinal} OF ${numbering.workCount} · ${kindWord}`;

  return {
    status,
    stale,
    linked: status !== "stale",
    deviceCaption: deviceCaptionFor(deviceName, status),
    intervalLabel: ordinal === null ? kindWord : `INTERVAL ${counted}`,
    intervalLabelShort: ordinal === null ? kindWord : counted,
    nowLabel: stale ? "LAST" : "NOW",
    upNext: upNextTextAt(phases, phaseIndex),
    thenNext: thenNextTextAt(phases, phaseIndex),
    totalSeconds,
    totalLeftSeconds,
    totalLeftDisplay: fmtDuration(totalLeftSeconds / 60),
    boundaries: intervalBoundaries(phases, measuredWorkSeconds(input.actuals)),
    // The log sheet captions this `SESSION m:ss` and PaneLive shows it as
    // the piece's running clock — both mean the whole session, so it reads
    // the accumulated pair for the same walk-4 reason TOTAL LEFT does.
    elapsedDisplay: fmtDuration(frame.sessionElapsedSeconds / 60),
    intervalClockLabel: distanceInterval ? "METERS LEFT" : "LEFT IN INTERVAL",
    intervalClockValue: intervalClockValueFor(remaining),
    pace,
    paceWhole,
    paceTenths,
    rate,
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
    meters,
    hr,
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
 * rowing this interval". `intervalAccrued` avoids both traps by reading the
 * SAME 0x0033 per-interval checkpoint `intervalRemaining` already trusts,
 * for the complement dimension — see `driver.ts`'s `computeAccruedForFrame`.
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
}): GridModel {
  const { intervals, activeIndex, remaining, accrued, numbering } = args;
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
    // re-derived from `index` — see `GridRow.ordinal`'s own comment.
    const ordinal = numbering.ordinals[index] ?? null;
    if (index === activeIndex) {
      const countdown = countdownDisplayFor(interval, remaining);
      const accrual = accruedDisplayFor(interval, accrued);
      return {
        index,
        ordinal,
        state: "active",
        time: interval.kind === "time" ? countdown : accrual,
        meters: interval.kind === "distance" ? countdown : accrual,
        countdown: interval.kind === "time" ? "time" : "meters",
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
    caption: distanceCaptionFor(intervals, numbering),
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
 *  row visibly labelled "1". Before this task the caption used the raw
 *  program index (`i + 1`, warm-up included), which was silently correct
 *  only because the `#` column used to be the same raw index — now that the
 *  column reads `numbering.ordinals` instead (WU unnumbered, work starting
 *  at 1), this function reads the identical array rather than keeping its
 *  own count. A warm-up that is itself a distance interval (a real case —
 *  `WarmupSetting.kind === "meters"`, `engine.ts`'s `warmupPhases`) is
 *  excluded from the list entirely: it has no ordinal to be named by, the
 *  same reasoning `intervalNumbering`'s own doc comment gives for excluding
 *  it from `workCount`. */
function distanceCaptionFor(
  intervals: ProgramInterval[],
  numbering: IntervalNumbering,
): string | null {
  const rows = intervals
    .map((interval, i) => ({ interval, number: numbering.ordinals[i] ?? null }))
    .filter(
      (r): r is { interval: ProgramInterval; number: number } =>
        r.interval.kind === "distance" && r.number !== null,
    );
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

function intervalClockValueFor(
  remaining: MonitorFrame["intervalRemaining"],
): string {
  if (remaining === null) return DASH;
  return remaining.kind === "distance"
    ? String(Math.round(remaining.value))
    : fmtDuration(remaining.value / 60);
}
