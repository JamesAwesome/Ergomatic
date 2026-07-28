import type { WorkoutType } from './types.js'

export type PlanCode = WorkoutType | 'TEST'

export interface PlanPreset {
  key: 'sprint' | 'head'
  title: string
  sessions: PlanCode[] // length 84
}

// Start-of-block checkpoints: one per training third, at the close of that
// third's opening week (each third is 4 weeks / 28 sessions, so the local
// offset is the same in every third: index 6 of 0..27). Deliberately NOT
// the intake handoff's 7/31/55 cadence — these plans use a 28-session
// third, not a 24-session one.
const TEST_INDICES = [6, 34, 62] as const

/** Flattens 12 week-arrays (7 codes each = 84) and overwrites the
 *  checkpoint slots with 'TEST', keeping the total length at 84. */
function buildSessions(weeks: WorkoutType[][]): PlanCode[] {
  const flat: PlanCode[] = weeks.flat()
  for (const i of TEST_INDICES) flat.splice(i, 1, 'TEST')
  return flat
}

// --- Sprint (2k / short-course) preset --------------------------------
// O2-forward philosophy: the aerobic base carries even sprint prep. A 2k
// is still ~80% aerobic, so steady-state volume stays the single biggest
// line item in every third — speed work is sharpened on top of it, never
// swapped in for it. Type mix across the 81 non-TEST sessions is pinned:
// O2 34, AT 23, TR 14, AN 10 (a strict O2 > AT > TR > AN pyramid).
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
export const SPRINT_WEEKS: WorkoutType[][] = [
  // -- base --
  ['O2', 'AT', 'O2', 'TR', 'AT', 'O2', 'O2'],
  ['O2', 'AT', 'O2', 'TR', 'O2', 'AT', 'O2'],
  ['O2', 'AT', 'AN', 'O2', 'AT', 'TR', 'O2'],
  ['O2', 'AT', 'O2', 'AT', 'O2', 'AT', 'O2'], // deload: AN+TR=0, O2/AT only
  // -- build --
  ['O2', 'AT', 'TR', 'AN', 'AT', 'O2', 'O2'],
  ['AT', 'TR', 'O2', 'AN', 'AT', 'TR', 'O2'],
  ['O2', 'TR', 'AT', 'AN', 'O2', 'TR', 'O2'],
  ['AT', 'O2', 'AT', 'O2', 'AT', 'O2', 'O2'], // deload: AN+TR=0, O2/AT only
  // -- peak --
  ['TR', 'AT', 'AN', 'O2', 'TR', 'O2', 'O2'],
  ['AN', 'O2', 'TR', 'AT', 'AN', 'AT', 'O2'],
  ['TR', 'O2', 'AN', 'AT', 'O2', 'TR', 'O2'],
  ['AN', 'AT', 'TR', 'O2', 'AN', 'O2', 'AT'],
]

// --- Head race (long-course, e.g. 5k/6k head-race format) preset ------
// O2-forward philosophy, turned up: a head race is decided by the size
// of the aerobic engine, so O2 alone is nearly half the plan. Type mix
// across the 81 non-TEST sessions is pinned: O2 41, AT 21, TR 11, AN 8
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
  ['O2', 'AT', 'O2', 'O2', 'AT', 'O2', 'O2'],
  ['O2', 'O2', 'AT', 'O2', 'TR', 'O2', 'O2'],
  ['O2', 'AT', 'O2', 'AN', 'O2', 'AT', 'O2'],
  ['O2', 'AT', 'O2', 'TR', 'AN', 'O2', 'O2'],
  // -- build: AT density peaks --
  ['AT', 'O2', 'AT', 'TR', 'AT', 'O2', 'O2'],
  ['AT', 'O2', 'AN', 'O2', 'TR', 'AT', 'O2'],
  ['O2', 'AT', 'O2', 'TR', 'O2', 'AT', 'O2'],
  ['AT', 'O2', 'TR', 'O2', 'AN', 'AT', 'O2'],
  // -- peak: sharper, still endurance-biased --
  ['O2', 'TR', 'AT', 'O2', 'AN', 'O2', 'O2'],
  ['O2', 'AT', 'TR', 'O2', 'AN', 'AT', 'O2'],
  ['O2', 'TR', 'AT', 'O2', 'TR', 'AN', 'O2'],
  ['AT', 'O2', 'TR', 'O2', 'AN', 'O2', 'AT'],
]

export const PLANS: Record<'sprint' | 'head', PlanPreset> = {
  sprint: {
    key: 'sprint',
    title: 'Sprint (2k) Prep',
    sessions: buildSessions(SPRINT_WEEKS),
  },
  head: {
    key: 'head',
    title: 'Head Race Prep',
    sessions: buildSessions(HEAD_WEEKS),
  },
}
