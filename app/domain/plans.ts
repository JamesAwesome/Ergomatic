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
// limiter yet at this stage. Week 4 is a deload: AN+TR volume drops back
// to near week-1 levels and O2 volume rises, before the jump into build.
// Build (weeks 5-8): AN/TR ramp up as the primary stimulus while O2/AT
// steps down to maintenance. Week 8 is a second deload — AN+TR volume
// drops noticeably (more O2 fills the gap) before the final ramp into
// peak, mirroring the week-4 pattern one third up.
// Peak (weeks 9-12): race-specific sharpening. AN/TR dominate every
// week; O2/AT sessions are just enough easy volume to stay fresh for
// the short, fast racing this preset targets. Per-week AN+TR volume:
// 1,2,3,1(deload), 3,4,5,2(deload), 6,6,6,6 — a ramp with two visible
// step-backs, not a monotonic 0-to-max climb.
export const SPRINT_WEEKS: WorkoutType[][] = [
  // -- base --
  ['O2', 'AT', 'O2', 'AT', 'O2', 'AT', 'TR'],
  ['O2', 'AT', 'O2', 'AT', 'TR', 'AT', 'AN'],
  ['O2', 'AT', 'AN', 'O2', 'AT', 'TR', 'AN'],
  ['AT', 'O2', 'AT', 'O2', 'AT', 'O2', 'TR'], // deload: AN+TR=1, O2 up
  // -- build --
  ['O2', 'AT', 'TR', 'AN', 'O2', 'AT', 'TR'],
  ['AT', 'AN', 'O2', 'TR', 'AT', 'AN', 'TR'],
  ['TR', 'AN', 'AT', 'TR', 'AN', 'TR', 'O2'],
  ['O2', 'AT', 'O2', 'TR', 'AT', 'O2', 'AN'], // deload: AN+TR=2, O2 up
  // -- peak --
  ['TR', 'AN', 'TR', 'AN', 'O2', 'TR', 'AN'],
  ['AN', 'TR', 'AN', 'TR', 'AT', 'AN', 'TR'],
  ['TR', 'AN', 'O2', 'TR', 'AN', 'TR', 'AN'],
  ['AN', 'TR', 'AT', 'TR', 'AN', 'TR', 'AN'],
]

// --- Head race (long-course, e.g. 5k/6k head-race format) preset ------
// Endurance is the throughline across all three thirds, not just the
// early ones — but each third has its own character rather than
// repeating one micro-cycle:
// Base (weeks 1-4): O2-dominant. O2 outnumbers AT most weeks; this is
// pure aerobic-capacity building before any race-pace specificity.
// Build (weeks 5-8): AT density rises past O2 — sessions get closer to
// anaerobic-threshold race pace as the block progresses.
// Peak (weeks 9-12): sharper — TR volume doubles versus base/build for
// race-pace rehearsal — but still endurance-biased: O2+AT stays above
// AN+TR in every peak week, since a head race is decided by sustained
// pace, not a finishing kick.
export const HEAD_WEEKS: WorkoutType[][] = [
  // -- base: O2-dominant --
  ['O2', 'O2', 'AT', 'O2', 'AT', 'O2', 'TR'],
  ['O2', 'AT', 'O2', 'AT', 'O2', 'TR', 'AN'],
  ['AT', 'O2', 'O2', 'AT', 'O2', 'AN', 'TR'],
  ['O2', 'O2', 'AT', 'O2', 'AN', 'AT', 'TR'],
  // -- build: AT density rises --
  ['AT', 'O2', 'AT', 'O2', 'AT', 'AN', 'TR'],
  ['AT', 'AT', 'O2', 'AT', 'O2', 'TR', 'AN'],
  ['O2', 'AT', 'AT', 'O2', 'AT', 'TR', 'AN'],
  ['AT', 'O2', 'AT', 'AT', 'O2', 'AN', 'TR'],
  // -- peak: sharper, still endurance-biased --
  ['O2', 'AT', 'TR', 'AT', 'O2', 'TR', 'AN'],
  ['AT', 'O2', 'TR', 'AT', 'TR', 'O2', 'AN'],
  ['O2', 'TR', 'AT', 'O2', 'TR', 'AT', 'AN'],
  ['AT', 'TR', 'O2', 'AT', 'TR', 'O2', 'AN'],
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
