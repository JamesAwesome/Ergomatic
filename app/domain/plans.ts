import type { WorkoutType } from "./types.js";
import type { Prescription } from "./prescription.js";
import { ONBOARDING_TITLES } from "./onboarding.js";

// Phase 8A: the "TEST" plan code retired. A plan day is a real workout
// type that MAY carry authored data — the three checkpoints populate
// `prescribe` today; a future authoring UI writes the same field, and a
// DB-loaded plan satisfies the same interface (spec §3.1).
export interface PlanDay {
  type: WorkoutType;
  /** Pre-suggested workout for this day, if any. AUTHORED DATA. */
  prescribe?: Prescription;
}

export interface PlanPreset {
  key: "sprint" | "head";
  title: string;
  sessions: PlanDay[]; // length 84
}

// Start-of-block checkpoints: one per training third, at the close of that
// third's opening week (each third is 4 weeks / 28 sessions, so the local
// offset is the same in every third: index 6 of 0..27). Deliberately NOT
// the intake handoff's 7/31/55 cadence — these plans use a 28-session
// third, not a 24-session one.
const CHECKPOINT_INDICES = [6, 34, 62] as const;

// Each plan pins its own instrument (rulings, 2026-08-12): the sprint plan
// re-tests the 2k (AN — the ceiling every AN/TR pace resolves against),
// the head plan the 6k (AT — the threshold every AT/O2 pace resolves
// against). That parenthetical is a claim about the LIBRARY, not about this
// file: nothing here branches on a WorkoutType, and `SplitRef.base` is
// authored per step, so the convention lives entirely in the corpus. It is
// checked by `server/seed/library/library.test.ts`'s "resolves each type
// against its own baseline" — zero crossings across all 300 workouts. If that
// test ever goes red, this sentence is what it is defending.
// Refs are authored as ONBOARDING_TITLES constants, never string
// literals, so the seam has zero dependency on the titles' later rename
// (gate ruling, 2026-08-22). The reason ships WITH the prescription so no
// consumer invents one.
const SPRINT_CHECKPOINT: PlanDay = {
  type: "AN",
  prescribe: {
    ref: { kind: "title", title: ONBOARDING_TITLES.k2, globalOnly: true },
    reason: "Plan checkpoint: re-test your 2k and update your baseline.",
  },
};

const HEAD_CHECKPOINT: PlanDay = {
  type: "AT",
  prescribe: {
    ref: { kind: "title", title: ONBOARDING_TITLES.k6, globalOnly: true },
    reason: "Plan checkpoint: re-test your 6k and update your baseline.",
  },
};

/** Flattens 12 week-arrays (7 types each = 84) into PlanDays and overwrites
 *  the checkpoint slots with the plan's own prescribed checkpoint day,
 *  keeping the total length at 84. */
function buildSessions(weeks: WorkoutType[][], checkpoint: PlanDay): PlanDay[] {
  const flat: PlanDay[] = weeks.flat().map((type) => ({ type }));
  for (const i of CHECKPOINT_INDICES) flat[i] = checkpoint;
  return flat;
}

// --- Sprint (2k / short-course) preset --------------------------------
// O2-forward philosophy: the aerobic base carries even sprint prep. A 2k
// is still ~80% aerobic, so steady-state volume stays the single biggest
// line item in every third — speed work is sharpened on top of it, never
// swapped in for it. Type mix across all 84 sessions (the three
// checkpoints are AN days re-testing the 2k) is pinned:
// O2 34, AT 23, TR 14, AN 13 (a strict O2 > AT > TR > AN pyramid).
// Base (weeks 1-4): almost all O2/AT — the engine gets built here. One
// AN touch and a weekly TR rate session keep the fast-twitch honest.
// Week 4 deloads to pure O2/AT (AN+TR drops to zero).
// Build (weeks 5-8): speed enters for real — AN+TR climbs 2→3→3 per
// week while O2 keeps its plurality. Week 8 is the second deload: back
// to O2/AT only before the peak ramp.
// Peak (weeks 9-12): a steady 3 AN+TR sessions every week for race
// sharpening, but O2 still outnumbers everything else — fresh and fast
// beats flat and fried. Per-week AN+TR: 1,1,2,0(deload),
// 2,3,3,0(deload), 3,3,3,3.
// EDITING A SESSION TYPE BELOW REWRITES HISTORY ON THE PLAN SCREEN.
// `Plan.tsx`'s `swapMark` decides "you rowed something else that day" by
// comparing a stored log's own type against the type THIS ARRAY gives
// that slot TODAY — so changing a day from O2 to AT retroactively marks
// every already-rowed O2 at that index as a swap, for work that matched
// the plan exactly when it was done. Accepted at the 2026-08-30 design
// gate (these presets are static code and have changed once, at Phase
// 8A); ROADMAP carries the trigger. If preset editing ever becomes
// routine — an authoring UI, DB-loaded plans — the fix is a stored
// prescribed-type column on the log, not a change here. Applies to
// `HEAD_WEEKS` below in exactly the same way.
export const SPRINT_WEEKS: WorkoutType[][] = [
  // -- base --
  ["O2", "AT", "O2", "TR", "AT", "O2", "O2"],
  ["O2", "AT", "O2", "TR", "O2", "AT", "O2"],
  ["O2", "AT", "AN", "O2", "AT", "TR", "O2"],
  ["O2", "AT", "O2", "AT", "O2", "AT", "O2"], // deload: AN+TR=0, O2/AT only
  // -- build --
  ["O2", "AT", "TR", "AN", "AT", "O2", "O2"],
  ["AT", "TR", "O2", "AN", "AT", "TR", "O2"],
  ["O2", "TR", "AT", "AN", "O2", "TR", "O2"],
  ["AT", "O2", "AT", "O2", "AT", "O2", "O2"], // deload: AN+TR=0, O2/AT only
  // -- peak --
  ["TR", "AT", "AN", "O2", "TR", "O2", "O2"],
  ["AN", "O2", "TR", "AT", "AN", "AT", "O2"],
  ["TR", "O2", "AN", "AT", "O2", "TR", "O2"],
  ["AN", "AT", "TR", "O2", "AN", "O2", "AT"],
];

// --- Head race (long-course, e.g. 5k/6k head-race format) preset ------
// O2-forward philosophy, turned up: a head race is decided by the size
// of the aerobic engine, so O2 alone is nearly half the plan. Type mix
// across all 84 sessions (the three checkpoints are AT days re-testing
// the 6k) is pinned: O2 41, AT 24, TR 11, AN 8
// (a strict O2 > AT > TR > AN pyramid). Each third keeps its own
// character rather than repeating one micro-cycle:
// Base (weeks 1-4): O2-dominant capacity building — steady state nearly
// three sessions for every threshold one, with only occasional TR/AN
// touches to keep turnover honest.
// Build (weeks 5-8): threshold density peaks here (week 5 carries three
// AT sessions) — the block that converts base fitness into sustainable
// race pace — while O2 still holds the plurality.
// Peak (weeks 9-12): TR/AN reach their high-water mark for race-pace
// rehearsal, but the endurance bias never flips: O2+AT stays well above
// AN+TR in every single week.
export const HEAD_WEEKS: WorkoutType[][] = [
  // -- base: O2-dominant --
  ["O2", "AT", "O2", "O2", "AT", "O2", "O2"],
  ["O2", "O2", "AT", "O2", "TR", "O2", "O2"],
  ["O2", "AT", "O2", "AN", "O2", "AT", "O2"],
  ["O2", "AT", "O2", "TR", "AN", "O2", "O2"],
  // -- build: AT density peaks --
  ["AT", "O2", "AT", "TR", "AT", "O2", "O2"],
  ["AT", "O2", "AN", "O2", "TR", "AT", "O2"],
  ["O2", "AT", "O2", "TR", "O2", "AT", "O2"],
  ["AT", "O2", "TR", "O2", "AN", "AT", "O2"],
  // -- peak: sharper, still endurance-biased --
  ["O2", "TR", "AT", "O2", "AN", "O2", "O2"],
  ["O2", "AT", "TR", "O2", "AN", "AT", "O2"],
  ["O2", "TR", "AT", "O2", "TR", "AN", "O2"],
  ["AT", "O2", "TR", "O2", "AN", "O2", "AT"],
];

export const PLANS: Record<"sprint" | "head", PlanPreset> = {
  sprint: {
    key: "sprint",
    title: "Sprint (2k) Prep",
    sessions: buildSessions(SPRINT_WEEKS, SPRINT_CHECKPOINT),
  },
  head: {
    key: "head",
    title: "Head Race Prep",
    sessions: buildSessions(HEAD_WEEKS, HEAD_CHECKPOINT),
  },
};
