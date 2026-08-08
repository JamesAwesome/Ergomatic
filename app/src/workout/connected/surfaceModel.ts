// Everything the two connected panes render, derived ONCE from the
// machine's frame plus the workout's own frozen phases (7B Task 6, handoff
// §§3-4). The panes themselves are dumb: they read fields off `SurfaceModel`
// and place them. Two rules live here and nowhere else:
//
//  1. **ONE judgement path.** `judgedValue` below is the only function in
//     `src/` that calls `domain/judge.ts`'s `judgeActual`. Every live actual
//     on every pane — pane A's NOW/RATE/METERS cards, pane B's hero, rate,
//     HR and meters cards — is a `JudgedValue` produced by that one helper
//     (handoff §3: "One helper decides the colour; no pane implements its
//     own judgement"). Pane C (Task 7) inherits the same rule by building
//     its cells from `judgedValue` too.
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
import type { WorkoutProgram } from "../../../domain/monitor/program.js";
import type { MonitorFrame } from "../../../domain/monitor/types.js";
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
 *  (`useMonitorSession`'s own paused derivation is "four metrics unchanged
 *  across N frames", not "no frames"), so paused values are held and greyed
 *  by their own treatment, not judged `"stale"`. */
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
  currentSplit: null,
  spm: null,
  heartRateBpm: null,
  intervalIndex: 0,
  intervalRemaining: null,
  state: "armed",
};

export interface SurfaceModelInput {
  phases: EnginePhase[];
  program: WorkoutProgram;
  phase: ConnectedPhase;
  frame: MonitorFrame | null;
  deviceName: string | null;
}

export interface SurfaceModel {
  status: SurfaceStatus;
  /** Every actual is greyed and unjudgeable. */
  stale: boolean;
  /** Filled indicator square (linked) vs hollow (link lost). */
  linked: boolean;
  /** `PM5 430123456`, or `PM5 430123456 · LOST`. */
  deviceCaption: string;
  /** `INTERVAL 3 OF 25 · WORK` (pane A). */
  intervalLabel: string;
  /** `3 OF 25 · WORK` (pane B's header line, where the device name already
   *  occupies the left of the row). */
  intervalLabelShort: string;
  /** `ROWING` / `RESTING` / `PAUSED` / `LOST` / `ENDED`, in ink (DEVIATIONS
   *  row 1: never the phone timer's accent). */
  statusWord: string;
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
  elapsedDisplay: string;
  /** `LEFT IN INTERVAL` on a time interval, `METERS LEFT` on a distance one
   *  (handoff §3: "On a distance interval the second slot becomes METERS
   *  LEFT"). */
  intervalClockLabel: string;
  intervalClockValue: string;
  /** 0-100, pane A's 6px bar under the interval clock. */
  intervalProgressPct: number;
  pace: JudgedValue;
  /** The hero split, cut so the tenths can be set smaller (handoff §3: "the
   *  eye should land on the seconds, not the decimal"). `paceTenths` is `""`
   *  when there is no reading. */
  paceWhole: string;
  paceTenths: string;
  paceCaption: string;
  rate: JudgedValue;
  rateCaption: string;
  meters: JudgedValue;
  metersCaption: string;
  hr: JudgedValue;
  hrCaption: string;
  /** No belt data this frame — the card keeps its slot, goes dashed-border
   *  and reads `—` (handoff §4's no-HR treatment, which "never leaves"). */
  hrAbsent: boolean;
  /** The TARGET SPLIT card: resolved value + the ref it came from. */
  targetSplit: { main: string; sub: string | null };
  /** That card's third line, never blank — the ref when there is one, and
   *  the honest reason when there isn't (a warm-up, a rest, an effort
   *  phase whose estimate `compileProgram` deliberately never programmed,
   *  or a legacy run frozen before `ref` existed). */
  targetSplitCaption: string;
}

/** `frame.currentSplit` is meaningless when nobody is pulling: the PM holds
 *  its last value rather than reporting zero, and the handoff is explicit
 *  that a paused `NOW` reads `—` with the caption `NOT ROWING` ("there is no
 *  current pace when nobody is pulling"). Suppressing it HERE, once, is why
 *  no pane has to know about the paused case. */
function livePace(frame: MonitorFrame, status: SurfaceStatus): number | null {
  return status === "paused" ? null : frame.currentSplit;
}

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

  const pace = judgedValue({
    kind: "pace",
    actual: livePace(frame, status),
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
  // The machine's own whole-workout distance (0x0031's Distance field). NOT
  // per-interval meters: `MonitorFrame` carries no such field, and the
  // mockup's `THIS INTERVAL` caption would be a claim the seam cannot back
  // (see the task-6 report's deviation note).
  const meters = judgedValue({
    kind: "meters",
    actual: frame.distanceMeters,
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

  const targetSplit = phase
    ? targetSplitDisplay(phase)
    : { main: DASH, sub: null };

  const totalSeconds = totalSessionSecondsOf(phases);
  const totalLeftSeconds = Math.max(0, totalSeconds - frame.elapsedSeconds);

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
    statusWord: statusWordFor(status, frame),
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
    elapsedDisplay: fmtDuration(frame.elapsedSeconds / 60),
    intervalClockLabel: distanceInterval ? "METERS LEFT" : "LEFT IN INTERVAL",
    intervalClockValue: intervalClockValueFor(remaining),
    intervalProgressPct: intervalProgressPctFor(phase, remaining),
    pace,
    paceWhole,
    paceTenths,
    paceCaption: paceCaptionFor(status, targetSplitSeconds),
    rate,
    rateCaption: targetSpm === null ? "NO RATE TARGET" : `TARGET ${targetSpm}`,
    meters,
    metersCaption: "TOTAL",
    hr,
    hrCaption: hr.absent ? "NO HR MONITOR" : "BPM",
    hrAbsent: hr.absent,
    targetSplit,
    targetSplitCaption: targetSplit.sub ?? "NO SPLIT TARGET",
  };
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

/** In ink on every pane (DEVIATIONS row 1). `RESTING` is ours: the handoff
 *  names only `ROWING` and `PAUSED`, but the machine reports a distinct
 *  `resting` state during a programmed rest and calling that "ROWING" would
 *  be the one thing this surface promises never to do — report a number, or
 *  a word, the monitor did not say. */
function statusWordFor(status: SurfaceStatus, frame: MonitorFrame): string {
  if (status === "paused") return "PAUSED";
  if (status === "disconnected") return "LOST";
  if (status === "ended") return "ENDED";
  return frame.state === "resting" ? "RESTING" : "ROWING";
}

function intervalClockValueFor(
  remaining: MonitorFrame["intervalRemaining"],
): string {
  if (remaining === null) return DASH;
  return remaining.kind === "distance"
    ? String(Math.round(remaining.value))
    : fmtDuration(remaining.value / 60);
}

/** Pane A's 6px bar: how much of THIS interval is behind the rower, in the
 *  interval's own programmed dimension (time counts time, distance counts
 *  meters — the handoff's distance rule). Zero when the machine has not
 *  reported a remaining value yet, never a divide-by-zero. */
function intervalProgressPctFor(
  phase: EnginePhase | undefined,
  remaining: MonitorFrame["intervalRemaining"],
): number {
  if (phase === undefined || remaining === null) return 0;
  const full = remaining.kind === "distance" ? phase.meters : phase.seconds;
  if (full === undefined || full <= 0) return 0;
  return Math.min(100, Math.max(0, ((full - remaining.value) / full) * 100));
}

/** The NOW card's third line. Static while rowing (handoff §3: "a static
 *  target readout that never re-words or reflows"), with the one re-wording
 *  §4 itself mandates — a paused erg has no current pace, and the caption
 *  says so. */
function paceCaptionFor(
  status: SurfaceStatus,
  targetSplitSeconds: number | null,
): string {
  if (status === "paused") return "NOT ROWING";
  if (targetSplitSeconds === null) return "NO PACE TARGET";
  return `TARGET ${fmtSplit(targetSplitSeconds)}`;
}
