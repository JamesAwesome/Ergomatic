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
import type { ConnectedPhase } from "../../monitor/useMonitorSession";
import type { EnginePhase } from "../../session/engine";
import {
  phaseKindWord,
  segmentKind,
  thenNextTextAt,
  totalSessionSecondsOf,
  upNextTextAt,
} from "../../session/Timer";
import { targetSplitDisplay } from "../../session/TimerTargets";

/** The four `ConnectedPhase` values the surface is mounted for. Everything
 *  earlier (`idle`/`picking`/`pairing`/`programming`/`ready`/`failed`) still
 *  belongs to the interstitial (Task 5). */
export type SurfaceStatus = "live" | "paused" | "disconnected" | "ended";

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
  return status === "disconnected";
}

/** `ConnectedPhase` narrowed to the four the surface draws. Anything else
 *  reaching here is a caller bug — the interstitial's own phase gate is what
 *  decides the surface is on screen at all — so this returns `null` rather
 *  than guessing a state. */
export function surfaceStatusFor(phase: ConnectedPhase): SurfaceStatus | null {
  switch (phase) {
    case "live":
    case "paused":
    case "disconnected":
    case "ended":
      return phase;
    default:
      return null;
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
  phase: ConnectedPhase;
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
  /** 0-based program index. The rendered `#` is this plus one. */
  index: number;
  state: GridRowState;
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
  /** The active row's third line, `REMAINING · TARGET 2:00.0 · 6K −2`.
   *  `null` on every other row. */
  remainingLine: string | null;
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
  /** `INTERVAL 3 OF 25 · WORK`. No current renderer: its only one,
   *  `PaneTimer.tsx`'s pane A, retired with connected-revamp Task 2. Casualty
   *  list (design spec §3) rehomes it to the grid header (revision §4's `3
   *  OF 12 · WORK · 0:47 LEFT`) — a later task's job, not this field's; the
   *  value stays computed and correct in the meantime. */
  intervalLabel: string;
  /** `3 OF 25 · WORK` (pane B's header line, where the device name already
   *  occupies the left of the row). */
  intervalLabelShort: string;
  /** `NOW · /500M` live; `LAST · /500M` once the link is gone (handoff §4). */
  nowLabel: string;
  segments: {
    total: number;
    current: number;
    kinds: ("work" | "rest" | "wu")[];
  };
  upNext: string;
  thenNext: string | null;
  totalSeconds: number;
  totalLeftSeconds: number;
  /** `44:12`, the same figure `TimerRuler` prints — pane C has no room for
   *  the ruler and carries it as the header line's trailing caption
   *  instead. */
  totalLeftDisplay: string;
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
  /** `"NO RATE TARGET"` or `` `TARGET ${targetSpm}` ``. Connected-revamp
   *  Task 3 promotes this to the rate hero's own ink numeral
   *  (`PaneLive.tsx`'s `rateTargetValue`) rather than deriving a second
   *  field for it — see that file's own header comment. */
  rateCaption: string;
  meters: JudgedValue;
  hr: JudgedValue;
  /** The TARGET SPLIT card: resolved value + the ref it came from. */
  targetSplit: { main: string; sub: string | null };
  /** That card's third line, never blank — the ref when there is one, and
   *  the honest reason when there isn't (a warm-up, a rest, an effort
   *  phase whose estimate `compileProgram` deliberately never programmed,
   *  or a legacy run frozen before `ref` existed). */
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
 *  showed the hero judging that 0 against the target: `0:00.0` painted
 *  OCHRE at a rower who had not taken a stroke. A 0.00 s/500m pace is not
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
 *  takes. */
const PACE_HERO_CAP_SECONDS = 599.9;

export function buildSurfaceModel(input: SurfaceModelInput): SurfaceModel {
  const { phases, program, deviceName } = input;
  const status = surfaceStatusFor(input.phase) ?? "live";
  const frame = input.frame ?? NO_FRAME;
  const stale = staleFor(status);

  const intervals = program.intervals.length;
  const rawIndex = frame.intervalIndex ?? 0;
  const intervalIndex = Math.min(
    Math.max(rawIndex, 0),
    Math.max(intervals - 1, 0),
  );
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

  // THE NO-TARGET STATE (design spec §6, adversarial finding): every REST
  // phase, and any work phase without a numeric split target (an "effort"
  // target, a warm-up, a legacy run frozen before `ref` existed), has
  // nothing for the hero's TARGET slot to show. `targetSplitDisplay` alone
  // used to fall back to the phase's own WORD (`phase.label` — "REST",
  // "ALL OUT") for `main` in exactly this case, which read as a target
  // that doesn't exist. Gating on `targetSplitSeconds !== null` — the same
  // "is there a real number" test `pace`'s own judgement already uses —
  // makes `main` the house `DASH` instead, so `PaneLive.tsx` can hold the
  // slot's space and greys it via `connected-value-absent` rather than
  // rendering a word in the target's own type weight.
  const targetSplit =
    phase && targetSplitSeconds !== null
      ? targetSplitDisplay(phase)
      : { main: DASH, sub: null };

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

  return {
    status,
    stale,
    linked: status !== "disconnected",
    deviceCaption: deviceCaptionFor(deviceName, status),
    intervalLabel: `INTERVAL ${intervalIndex + 1} OF ${intervals} · ${kindWord}`,
    intervalLabelShort: `${intervalIndex + 1} OF ${intervals} · ${kindWord}`,
    nowLabel: stale ? "LAST · /500M" : "NOW · /500M",
    segments: {
      total: phases.length,
      current: phaseIndex,
      kinds: phases.map((p) => segmentKind(p.type)),
    },
    upNext: upNextTextAt(phases, phaseIndex),
    thenNext: thenNextTextAt(phases, phaseIndex),
    totalSeconds,
    totalLeftSeconds,
    totalLeftDisplay: fmtDuration(totalLeftSeconds / 60),
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
    rateCaption: targetSpm === null ? "NO RATE TARGET" : `TARGET ${targetSpm}`,
    meters,
    hr,
    targetSplit,
    targetSplitCaption: targetSplit.sub ?? "NO SPLIT TARGET",
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
      targetSplitMain: targetSplit.main,
      targetSplitRef: targetSplit.sub,
      hasTargetSplit: targetSplitSeconds !== null,
    }),
  };
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
  targetSplitMain: string;
  targetSplitRef: string | null;
  hasTargetSplit: boolean;
}): GridModel {
  const { intervals, activeIndex, remaining, accrued } = args;
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
    if (index === activeIndex) {
      const countdown = countdownDisplayFor(interval, remaining);
      const accrual = accruedDisplayFor(interval, accrued);
      return {
        index,
        state: "active",
        time: interval.kind === "time" ? countdown : accrual,
        meters: interval.kind === "distance" ? countdown : accrual,
        countdown: interval.kind === "time" ? "time" : "meters",
        pace: { display: args.livePace.display, judged: args.livePace },
        spm: { display: args.liveRate.display, judged: args.liveRate },
        hr: args.liveHr.display,
        rest,
        remainingLine: remainingLineFor(
          args.hasTargetSplit,
          args.targetSplitMain,
          args.targetSplitRef,
        ),
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
        remainingLine: null,
      };
    }
    // Upcoming: the PROGRAMMED values, every one of them a plain string.
    // "A pending distance row shows `—` in the time cell and its meters in
    // the meters cell" (handoff §3) — and the mirror for a time interval,
    // which the same sentence implies and the mockup's rows 4 and 6 draw.
    return {
      index,
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
      remainingLine: null,
    };
  });

  return { rows, activeIndex, caption: distanceCaptionFor(intervals) };
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

/** The active row's third line (handoff §3: `REMAINING · TARGET 2:00.0 ·
 *  6K −2`). The word REMAINING is what names the accent cell above it, so
 *  it is present even on an interval with no split target at all — a
 *  warm-up still counts something down. */
function remainingLineFor(
  hasTargetSplit: boolean,
  main: string,
  ref: string | null,
): string {
  if (!hasTargetSplit) return "REMAINING · NO SPLIT TARGET";
  const parts = ["REMAINING", `TARGET ${main}`];
  if (ref !== null) parts.push(ref);
  return parts.join(" · ");
}

/** Handoff §3: "A mono caption under the grid names it in words — `ROW 5 IS
 *  A 500 M PIECE · METERS COUNT DOWN` — rather than inventing a glyph."
 *
 *  The handoff writes the ONE-distance-row case. A real library workout has
 *  three (Filling Low) or twenty-four (Sea Smoke), so the sentence
 *  generalises: a short uniform set is listed by number, and anything
 *  longer or ragged is counted rather than enumerated, because a caption
 *  that lists twenty-four row numbers is not a caption. No distance
 *  interval at all -> no caption, not an empty one. */
function distanceCaptionFor(intervals: ProgramInterval[]): string | null {
  const rows = intervals
    .map((interval, i) => ({ interval, number: i + 1 }))
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
  return status === "disconnected" ? `${name} · LOST` : name;
}

function intervalClockValueFor(
  remaining: MonitorFrame["intervalRemaining"],
): string {
  if (remaining === null) return DASH;
  return remaining.kind === "distance"
    ? String(Math.round(remaining.value))
    : fmtDuration(remaining.value / 60);
}
