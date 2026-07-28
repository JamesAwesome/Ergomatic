import type { WorkoutInput } from '../../domain/types.js'

// Re-exported for the starter-content review context (Task 8 gate): the two
// original plan presets live alongside the library James reviews.
export { PLANS } from '../../domain/plans.js'

// ---------------------------------------------------------------------------
// Ergomatic starter library — ORIGINAL content.
//
// Naming theme: weather systems and the named winds of the world. Intensity
// maps onto the atmosphere: calm and steady phenomena (Zephyr, Drizzle,
// Doldrums) are easy aerobic sessions; organized fronts and pressure systems
// are threshold work; violent convective events (Microburst, Derecho,
// Tempest) are the hardest sprint sessions.
//
// Structures come from standard, public rowing training methodology:
// - AN (anaerobic): 30–90 s intervals at faster-than-2k pace, ~1:4–1:5 rest.
// - O2 (aerobic base): continuous steady state or long alternating pieces at
//   6k+10..18 splits (UT2/UT1 intensity), low stroke rates.
// - AT (anaerobic threshold): sustained intervals near 6k pace with rest
//   about half to equal the work time.
// - TR (transport/race pace): 2k race-pace and sprint pieces with roughly
//   1:2–1:3 rest, including community-canon shapes (8×500 m, 4×1000 m,
//   pyramids) that are rowing-culture commons.
// Pain 1–5 is honest perceived suffering: steady state is a 1–2, threshold a
// 2–4, and full-rate sprint work a 4–5.
// Stroke rates: every work step prescribes spm within 18–32, banded by type —
// O2 steady 18–22, AT threshold 22–26, TR race pace 24–28, AN sprints 26–32 —
// and ladder-shaped structures step the rate together with the intensity.
// ---------------------------------------------------------------------------

export const STARTER_WORKOUTS: WorkoutInput[] = [
  // ------------------------------------------------------------- O2 (1–10)
  {
    // O2: 20' continuous UT2 steady state at 6k+18 — the shortest aerobic entry point.
    num: 1,
    title: 'Zephyr',
    type: 'O2',
    difficulty: 'easy',
    pain: 1,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'w', duration: { kind: 'time', minutes: 20 }, ref: { base: '6k', off: 18 }, spm: 18 },
    ],
  },
  {
    // O2: 30' continuous UT2 steady state at 6k+16, conversational effort.
    num: 2,
    title: 'Drizzle',
    type: 'O2',
    difficulty: 'easy',
    pain: 1,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'w', duration: { kind: 'time', minutes: 30 }, ref: { base: '6k', off: 16 }, spm: 18 },
    ],
  },
  {
    // O2: 40' continuous steady state at 6k+15 — classic single-piece aerobic volume.
    num: 3,
    title: 'Trade Winds',
    type: 'O2',
    difficulty: 'easy',
    pain: 2,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'w', duration: { kind: 'time', minutes: 40 }, ref: { base: '6k', off: 15 }, spm: 19 },
    ],
  },
  {
    // O2: 24' continuous UT2 at 6k+17 — easy recovery-day volume.
    num: 4,
    title: 'Halcyon',
    type: 'O2',
    difficulty: 'easy',
    pain: 1,
    steps: [
      { k: 'wu', minutes: 4 },
      { k: 'w', duration: { kind: 'time', minutes: 24 }, ref: { base: '6k', off: 17 }, spm: 18 },
    ],
  },
  {
    // O2: 2×20' UT2 at 6k+16 with a short break — broken steady state for building sit-time.
    num: 5,
    title: 'Doldrums',
    type: 'O2',
    difficulty: 'easy',
    pain: 1,
    steps: [
      { k: 'wu', minutes: 4 },
      { k: 'reps', count: 2 },
      { k: 'w', duration: { kind: 'time', minutes: 20 }, ref: { base: '6k', off: 16 }, spm: 18, restMinutes: 3 },
    ],
  },
  {
    // O2: 3×15' alternating UT1 pieces at 6k+12 with 2' paddles between.
    num: 6,
    title: 'Westerlies',
    type: 'O2',
    difficulty: 'medium',
    pain: 2,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 3 },
      { k: 'w', duration: { kind: 'time', minutes: 15 }, ref: { base: '6k', off: 12 }, spm: 20, restMinutes: 2 },
    ],
  },
  {
    // O2: 60' continuous steady state at 6k+14 — the long-season volume staple.
    num: 7,
    title: 'Monsoon',
    type: 'O2',
    difficulty: 'medium',
    pain: 2,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'w', duration: { kind: 'time', minutes: 60 }, ref: { base: '6k', off: 14 }, spm: 19 },
    ],
  },
  {
    // O2: 45' negative-split steady piece — 15' each at 6k+16 / +13 / +10, rate ladder 18→20→22.
    num: 8,
    title: 'Mackerel Sky',
    type: 'O2',
    difficulty: 'medium',
    pain: 2,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'w', duration: { kind: 'time', minutes: 15 }, ref: { base: '6k', off: 16 }, spm: 18 },
      { k: 'w', duration: { kind: 'time', minutes: 15 }, ref: { base: '6k', off: 13 }, spm: 20 },
      { k: 'w', duration: { kind: 'time', minutes: 15 }, ref: { base: '6k', off: 10 }, spm: 22 },
    ],
  },
  {
    // O2: 10,000 m continuous at 6k+8 — upper-end aerobic distance benchmark.
    num: 9,
    title: 'Jet Stream',
    type: 'O2',
    difficulty: 'hard',
    pain: 3,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'w', duration: { kind: 'distance', meters: 10000 }, ref: { base: '6k', off: 8 }, spm: 21 },
    ],
  },
  {
    // O2: 3×20' UT1 at 6k+10 with 3' rest — a big aerobic block for strong weeks.
    num: 10,
    title: 'High Pressure',
    type: 'O2',
    difficulty: 'hard',
    pain: 3,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 3 },
      { k: 'w', duration: { kind: 'time', minutes: 20 }, ref: { base: '6k', off: 10 }, spm: 22, restMinutes: 3 },
    ],
  },

  // ------------------------------------------------------------ AT (11–18)
  {
    // AT: 3×8' at 6k+4 with 1:2 rest — threshold introduction session.
    num: 11,
    title: 'Isobar',
    type: 'AT',
    difficulty: 'easy',
    pain: 2,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 3 },
      { k: 'w', duration: { kind: 'time', minutes: 8 }, ref: { base: '6k', off: 4 }, spm: 22, restMinutes: 4 },
    ],
  },
  {
    // AT: 2×10' at 6k+5 with equal rest — gentle threshold with full recovery.
    num: 12,
    title: 'Warm Front',
    type: 'AT',
    difficulty: 'easy',
    pain: 2,
    steps: [
      { k: 'wu', minutes: 4 },
      { k: 'reps', count: 2 },
      { k: 'w', duration: { kind: 'time', minutes: 10 }, ref: { base: '6k', off: 5 }, spm: 22, restMinutes: 5 },
    ],
  },
  {
    // AT: 3×5' at 6k+4 with 1:2 rest — compact threshold dose for tight days.
    num: 13,
    title: 'Tailwind',
    type: 'AT',
    difficulty: 'easy',
    pain: 2,
    steps: [
      { k: 'wu', minutes: 3 },
      { k: 'reps', count: 3 },
      { k: 'w', duration: { kind: 'time', minutes: 5 }, ref: { base: '6k', off: 4 }, spm: 23, restMinutes: 2.5 },
    ],
  },
  {
    // AT: 4×2000 m at 6k+1 with 5' rest — the canonical threshold distance set.
    num: 14,
    title: 'Cold Front',
    type: 'AT',
    difficulty: 'medium',
    pain: 3,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 4 },
      { k: 'w', duration: { kind: 'distance', meters: 2000 }, ref: { base: '6k', off: 1 }, spm: 25, restMinutes: 5 },
    ],
  },
  {
    // AT: 3×12' at 6k+2 with 1:2 rest — extended threshold intervals.
    num: 15,
    title: 'Low Pressure',
    type: 'AT',
    difficulty: 'medium',
    pain: 3,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 3 },
      { k: 'w', duration: { kind: 'time', minutes: 12 }, ref: { base: '6k', off: 2 }, spm: 24, restMinutes: 6 },
    ],
  },
  {
    // AT: 5×2000 m at 6k+3 with 4' rest — threshold volume by distance.
    num: 16,
    title: 'Crosswind',
    type: 'AT',
    difficulty: 'medium',
    pain: 3,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 5 },
      { k: 'w', duration: { kind: 'distance', meters: 2000 }, ref: { base: '6k', off: 3 }, spm: 25, restMinutes: 4 },
    ],
  },
  {
    // AT: 4×3000 m at 6k+2 with 6' rest — heavy threshold day by distance.
    num: 17,
    title: 'Storm Front',
    type: 'AT',
    difficulty: 'hard',
    pain: 4,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 4 },
      { k: 'w', duration: { kind: 'distance', meters: 3000 }, ref: { base: '6k', off: 2 }, spm: 26, restMinutes: 6 },
    ],
  },
  {
    // AT: 2×20' at 6k+1 with 8' rest — long threshold pieces at the top of the band.
    num: 18,
    title: 'Headwind',
    type: 'AT',
    difficulty: 'hard',
    pain: 4,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 2 },
      { k: 'w', duration: { kind: 'time', minutes: 20 }, ref: { base: '6k', off: 1 }, spm: 26, restMinutes: 8 },
    ],
  },

  // ------------------------------------------------------------ AN (19–26)
  {
    // AN: 6×30 s at 2k-2 with 1:4 rest — anaerobic starter dose.
    num: 19,
    title: 'Dust Devil',
    type: 'AN',
    difficulty: 'easy',
    pain: 3,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 6 },
      { k: 'w', duration: { kind: 'time', minutes: 0.5 }, ref: { base: '2k', off: -2 }, spm: 28, restMinutes: 2 },
    ],
  },
  {
    // AN: 8×30 s at 2k-1 with 1:5 rest — short bursts, generous recovery.
    num: 20,
    title: 'Brickfielder',
    type: 'AN',
    difficulty: 'easy',
    pain: 3,
    steps: [
      { k: 'wu', minutes: 4 },
      { k: 'reps', count: 8 },
      { k: 'w', duration: { kind: 'time', minutes: 0.5 }, ref: { base: '2k', off: -1 }, spm: 29, restMinutes: 2.5 },
    ],
  },
  {
    // AN: 8×60 s at 2k-3 with 1:4 rest — the classic minute-on anaerobic set.
    num: 21,
    title: 'Squall',
    type: 'AN',
    difficulty: 'medium',
    pain: 4,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 8 },
      { k: 'w', duration: { kind: 'time', minutes: 1 }, ref: { base: '2k', off: -3 }, spm: 30, restMinutes: 4 },
    ],
  },
  {
    // AN: 8×250 m at 2k-4 with ~1:4.5 rest — anaerobic power by distance.
    num: 22,
    title: 'Haboob',
    type: 'AN',
    difficulty: 'medium',
    pain: 4,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 8 },
      { k: 'w', duration: { kind: 'distance', meters: 250 }, ref: { base: '2k', off: -4 }, spm: 30, restMinutes: 4 },
    ],
  },
  {
    // AN: 10×60 s at 2k-2 with 1:4.5 rest — extended minute-rep volume.
    num: 23,
    title: 'Sirocco',
    type: 'AN',
    difficulty: 'medium',
    pain: 4,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 10 },
      { k: 'w', duration: { kind: 'time', minutes: 1 }, ref: { base: '2k', off: -2 }, spm: 29, restMinutes: 4.5 },
    ],
  },
  {
    // AN: 10×30 s at 2k-5 with 1:5 rest — maximal short bursts.
    num: 24,
    title: 'Microburst',
    type: 'AN',
    difficulty: 'hard',
    pain: 5,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 10 },
      { k: 'w', duration: { kind: 'time', minutes: 0.5 }, ref: { base: '2k', off: -5 }, spm: 32, restMinutes: 2.5 },
    ],
  },
  {
    // AN: 6×90 s at 2k-2 with ~1:4.3 rest — long anaerobic reps, full commitment.
    num: 25,
    title: 'Williwaw',
    type: 'AN',
    difficulty: 'hard',
    pain: 5,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 6 },
      { k: 'w', duration: { kind: 'time', minutes: 1.5 }, ref: { base: '2k', off: -2 }, spm: 28, restMinutes: 6.5 },
    ],
  },
  {
    // AN: 12×60 s at 2k-4 with 1:4 rest — peak anaerobic volume session.
    num: 26,
    title: 'Derecho',
    type: 'AN',
    difficulty: 'hard',
    pain: 5,
    steps: [
      { k: 'wu', minutes: 6 },
      { k: 'reps', count: 12 },
      { k: 'w', duration: { kind: 'time', minutes: 1 }, ref: { base: '2k', off: -4 }, spm: 31, restMinutes: 4 },
    ],
  },

  // ------------------------------------------------------------ TR (27–35)
  {
    // TR: 4×60 s at 2k+2 with 1:3 rest — race-pace touch without the damage.
    num: 27,
    title: 'Waterspout',
    type: 'TR',
    difficulty: 'easy',
    pain: 3,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 4 },
      { k: 'w', duration: { kind: 'time', minutes: 1 }, ref: { base: '2k', off: 2 }, spm: 26, restMinutes: 3 },
    ],
  },
  {
    // TR: 3×2' at 2k+4 with 1:2 rest — race-rhythm rehearsal at low cost.
    num: 28,
    title: 'Anvil Cloud',
    type: 'TR',
    difficulty: 'easy',
    pain: 3,
    steps: [
      { k: 'wu', minutes: 4 },
      { k: 'reps', count: 3 },
      { k: 'w', duration: { kind: 'time', minutes: 2 }, ref: { base: '2k', off: 4 }, spm: 24, restMinutes: 4 },
    ],
  },
  {
    // TR: 5×2' at 2k+3 with 1:2.5 rest — sustained race-pace intervals.
    num: 29,
    title: 'Gale',
    type: 'TR',
    difficulty: 'medium',
    pain: 4,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 5 },
      { k: 'w', duration: { kind: 'time', minutes: 2 }, ref: { base: '2k', off: 3 }, spm: 26, restMinutes: 5 },
    ],
  },
  {
    // TR: 6×90 s at 2k+2 with 1:3 rest — race-pace repeats with full reset.
    num: 30,
    title: 'Cyclone',
    type: 'TR',
    difficulty: 'medium',
    pain: 4,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 6 },
      { k: 'w', duration: { kind: 'time', minutes: 1.5 }, ref: { base: '2k', off: 2 }, spm: 27, restMinutes: 4.5 },
    ],
  },
  {
    // TR: 4×1000 m at 2k+1 with 8' rest — the canonical 1k race-pace repeat.
    num: 31,
    title: 'Cloudburst',
    type: 'TR',
    difficulty: 'medium',
    pain: 4,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 4 },
      { k: 'w', duration: { kind: 'distance', meters: 1000 }, ref: { base: '2k', off: 1 }, spm: 27, restMinutes: 8 },
    ],
  },
  {
    // TR: 750/750/500 m descending sprint set, finishing faster than 2k pace; rate builds 25→26→28.
    num: 32,
    title: "Nor'easter",
    type: 'TR',
    difficulty: 'medium',
    pain: 4,
    steps: [
      { k: 'wu', minutes: 8 },
      { k: 'w', duration: { kind: 'distance', meters: 750 }, ref: { base: '2k', off: 2 }, spm: 25, restMinutes: 6 },
      { k: 'w', duration: { kind: 'distance', meters: 750 }, ref: { base: '2k', off: 0 }, spm: 26, restMinutes: 6 },
      { k: 'w', duration: { kind: 'distance', meters: 500 }, ref: { base: '2k', off: -2 }, spm: 28 },
    ],
  },
  {
    // TR: 8×500 m at 2k pace with 4' rest — the community-canon speed workout.
    num: 33,
    title: 'Thunderhead',
    type: 'TR',
    difficulty: 'hard',
    pain: 5,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 8 },
      { k: 'w', duration: { kind: 'distance', meters: 500 }, ref: { base: '2k', off: 0 }, spm: 28, restMinutes: 4 },
    ],
  },
  {
    // TR: 500-1000-1500-1000-500 m pyramid at 2k+2 — the classic distance pyramid; rate mirrors it, 27-26-25-26-28.
    num: 34,
    title: 'Tempest',
    type: 'TR',
    difficulty: 'hard',
    pain: 5,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'w', duration: { kind: 'distance', meters: 500 }, ref: { base: '2k', off: 2 }, spm: 27, restMinutes: 3 },
      { k: 'w', duration: { kind: 'distance', meters: 1000 }, ref: { base: '2k', off: 2 }, spm: 26, restMinutes: 5 },
      { k: 'w', duration: { kind: 'distance', meters: 1500 }, ref: { base: '2k', off: 2 }, spm: 25, restMinutes: 7 },
      { k: 'w', duration: { kind: 'distance', meters: 1000 }, ref: { base: '2k', off: 2 }, spm: 26, restMinutes: 5 },
      { k: 'w', duration: { kind: 'distance', meters: 500 }, ref: { base: '2k', off: 2 }, spm: 28 },
    ],
  },
  {
    // TR: 4×4' at 2k+3 with 1:2 rest — long race-pace pieces for 2k endurance.
    num: 35,
    title: 'Storm Surge',
    type: 'TR',
    difficulty: 'hard',
    pain: 5,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'reps', count: 4 },
      { k: 'w', duration: { kind: 'time', minutes: 4 }, ref: { base: '2k', off: 3 }, spm: 26, restMinutes: 8 },
    ],
  },
]
