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
// Base (weeks 1-4): aerobic foundation. O2/AT carry the volume, TR is
// technique/stroke-rate work, AN is minimal — raw speed isn't the
// limiter yet at this stage.
// Build (weeks 5-8): AN/TR take over as the primary stimulus while O2/AT
// steps down to maintenance; the second half of this third (weeks 7-8)
// is where AN/TR volume first overtakes what the base third carried.
// Peak (weeks 9-12): race-specific sharpening. AN/TR dominate every
// week; O2/AT sessions are just enough easy volume to stay fresh for
// the short, fast racing this preset targets.
const SPRINT_WEEKS: WorkoutType[][] = [
  // -- base --
  ['O2', 'AT', 'O2', 'AT', 'O2', 'AT', 'TR'],
  ['AT', 'O2', 'AT', 'O2', 'TR', 'AT', 'O2'],
  ['O2', 'AT', 'AN', 'O2', 'AT', 'O2', 'TR'],
  ['AT', 'O2', 'TR', 'AT', 'AN', 'O2', 'AT'],
  // -- build --
  ['O2', 'TR', 'AT', 'AN', 'O2', 'AT', 'TR'],
  ['AT', 'AN', 'O2', 'TR', 'AT', 'O2', 'AN'],
  ['TR', 'AN', 'TR', 'AT', 'AN', 'TR', 'O2'],
  ['AN', 'TR', 'AN', 'O2', 'TR', 'AN', 'TR'],
  // -- peak --
  ['TR', 'AN', 'TR', 'AN', 'O2', 'TR', 'AN'],
  ['AN', 'TR', 'AN', 'TR', 'AT', 'AN', 'TR'],
  ['TR', 'AN', 'O2', 'TR', 'AN', 'TR', 'AN'],
  ['AN', 'TR', 'AN', 'AT', 'TR', 'AN', 'TR'],
]

// --- Head race (long-course, e.g. 5k/6k head-race format) preset ------
// Endurance is the throughline across all three thirds, not just the
// early ones: O2/AT sessions outnumber AN/TR in base, build, AND peak.
// TR shows up consistently as race-pace rehearsal, and AN stays a light
// seasoning spread across the whole plan rather than saved for a late
// speed peak — a head race is decided by sustained pace, not a
// finishing kick, so there's no reason to back-load intensity.
const HEAD_WEEKS: WorkoutType[][] = [
  // -- base --
  ['O2', 'AT', 'O2', 'AT', 'O2', 'AT', 'TR'],
  ['AT', 'O2', 'AT', 'O2', 'AT', 'TR', 'AN'],
  ['O2', 'AT', 'O2', 'AN', 'AT', 'O2', 'TR'],
  ['AT', 'O2', 'AT', 'O2', 'TR', 'AT', 'O2'],
  // -- build --
  ['O2', 'AT', 'O2', 'AT', 'AN', 'AT', 'O2'],
  ['AT', 'O2', 'AT', 'TR', 'O2', 'AT', 'AN'],
  ['O2', 'AT', 'O2', 'TR', 'AT', 'O2', 'AT'],
  ['AT', 'O2', 'TR', 'AT', 'O2', 'AN', 'AT'],
  // -- peak --
  ['O2', 'AT', 'AN', 'AT', 'O2', 'AT', 'TR'],
  ['AT', 'O2', 'AT', 'TR', 'AT', 'O2', 'AN'],
  ['O2', 'AT', 'AN', 'AT', 'O2', 'AT', 'TR'],
  ['AT', 'O2', 'AT', 'TR', 'O2', 'AT', 'AN'],
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
