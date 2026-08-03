import type { WorkoutInput } from "../../../domain/types.js";

// AN (anaerobic) block of the generated library — 60 workouts,
// easy→hard. Authored in Task 7 against the pattern digest
// (app/domain/generation/patterns.json); ordering here IS the library
// browsing order within the type block.
export const AN_WORKOUTS: WorkoutInput[] = [
  // ------------------------------------------------- medium, pain 3 (1–11)
  {
    // AN: 6×30 s at 2k-3 with 1:3 rest — the smallest honest anaerobic dose.
    title: "Scud Cloud",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -3 },
        spm: 27,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 5×45 s at 2k-3 with 1:2 rest — longer reps, deliberately shy of the rate cap.
    title: "Dust Whirl",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 27,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 6×200 m at 2k-4 with ~1:1.7 rest — anaerobic work measured by the metre, not the clock.
    title: "Steam Devil",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 200 },
        ref: { base: "2k", off: -4 },
        spm: 28,
        restMinutes: 1.25,
      },
    ],
  },
  {
    // AN: 4×30 s at 2k-4 with 1:4 rest — few reps, canonical recovery, nothing to hide behind.
    title: "Snow Devil",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 28,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 5×30 s at 2k-5 with 1:3.5 rest — a faster target bought with a longer sit.
    title: "Beaver Tail",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 7 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -5 },
        spm: 29,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AN: 5×150 m at 2k-5 with ~1:2.8 rest — short sharp distance reps for rate control.
    title: "Tail Cloud",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 150 },
        ref: { base: "2k", off: -5 },
        spm: 30,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 6×30 s at 2k-3 with 1:3.5 rest off a full warm-up — quality over quantity.
    title: "Roll Cloud",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -3 },
        spm: 27,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AN: 8×30 s at 2k-4 with 1:3 rest — the standard half-minute set at full volume.
    title: "Shelf Cloud",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 28,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 8×200 m at 2k-4 with ~1:2 rest — distance reps where the last two decide the session.
    title: "Wall Cloud",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "distance", meters: 200 },
        ref: { base: "2k", off: -4 },
        spm: 28,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 6×45 s at 2k-3 with ~1:2.3 rest — three-quarter-minute reps at a holdable target.
    title: "Mammatus",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 27,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AN: 10×30 s at 2k-5 with 1:2.5 rest — the rest shrinks as the count grows.
    title: "Funnel Cloud",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -5 },
        spm: 29,
        restMinutes: 1.25,
      },
    ],
  },

  // ------------------------------------------------ medium, pain 4 (12–20)
  {
    // AN: 8×30 s at 2k-4 with 1:2 rest — half the canonical recovery, twice the residue.
    title: "Collar Cloud",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 1,
      },
    ],
  },
  {
    // AN: 60/45/30/30 s descending, target and rate climbing 2k-3 → 2k-6 as the pieces shorten.
    title: "Inflow Notch",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -3 },
        spm: 27,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -5 },
        spm: 31,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -6 },
        spm: 32,
      },
    ],
  },
  {
    // AN: 30/45/60 s ascending ladder, rate walking back 30→28 as the pieces lengthen.
    title: "Barber Pole",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -5 },
        spm: 30,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -3 },
        spm: 28,
      },
    ],
  },
  {
    // AN: 5×30 s at 2k-5 with 1:2 rest — short set, short rest, thorough warm-up.
    title: "Inflow Band",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -5 },
        spm: 30,
        restMinutes: 1,
      },
    ],
  },
  {
    // AN: 8×45 s at 2k-4 with 1:2 rest — the set where the rest stops being enough.
    title: "Hook Echo",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 6×250 m at 2k-5 with ~1:2.2 rest — the longest distance rep that still counts as anaerobic.
    title: "Bow Echo",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: -5 },
        spm: 30,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 60/60/45/45/30 s descending, targets sharpening 2k-3 → 2k-6 — a session that ends faster than it starts.
    title: "Downdraft",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -3 },
        spm: 27,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 28,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -5 },
        spm: 30,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -5 },
        spm: 30,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -6 },
        spm: 32,
      },
    ],
  },
  {
    // AN: 30/45/60/75 s ascending ladder at easing targets — each piece longer, each rest longer with it.
    title: "Updraft",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -6 },
        spm: 32,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -5 },
        spm: 31,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { base: "2k", off: -3 },
        spm: 28,
      },
    ],
  },
  {
    // AN: one 2' piece at 2k-3 off a 20' warm-up — the whole session is a single strike; the rest is preparation for it.
    title: "Lightning Strike",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 20 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: -3 },
        spm: 30,
      },
    ],
  },

  // -------------------------------------------------- hard, pain 4 (21–33)
  {
    // AN: 6×30 s at 2k-6 with 1:2 rest — the fastest split this library prescribes without saying "max".
    title: "Gust Front",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -6 },
        spm: 31,
        restMinutes: 1,
      },
    ],
  },
  {
    // AN: 6×100 m at 2k-6 with ~1:3.5 rest — twenty-second starts at the top of the rate band.
    title: "Dust Storm",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 100 },
        ref: { base: "2k", off: -6 },
        spm: 32,
        restMinutes: 1.25,
      },
    ],
  },
  {
    // AN: 4×30 s all out with 1:3 rest — the shortest max-effort set here; no split to hide behind.
    title: "Heat Burst",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 8×30 s all out with 1:3 rest — max effort held to a rate that keeps the stroke honest.
    title: "Sheet Lightning",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 10×30 s all out with 1:2.5 rest — ten strikes, none of them cheap.
    title: "Fork Lightning",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.25,
      },
    ],
  },
  {
    // AN: 10×150 m all out with ~1:2.2 rest — max effort scored by the metre, so the fade is visible.
    title: "Heat Lightning",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 150 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.25,
      },
    ],
  },
  {
    // AN: 6×60 s at 2k-4 with 1:1.5 rest — full-minute reps on deliberately short recovery.
    title: "Dry Lightning",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 10×45 s at 2k-5 with ~1:2.7 rest — the workhorse anaerobic volume session.
    title: "Anvil Crawler",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -5 },
        spm: 30,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 10×250 m at 2k-5 with ~1:2.5 rest — 2500 m of anaerobic work, one hailstone at a time.
    title: "Hailstorm",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: -5 },
        spm: 30,
        restMinutes: 2.25,
      },
    ],
  },
  {
    // AN: 30/45/60/75/90/60/30 s pyramid, rate mirroring it 32-31-30-29-28-30-32 — up one side and straight back down.
    title: "Outflow Boundary",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 14 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -6 },
        spm: 32,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -5 },
        spm: 31,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { base: "2k", off: -3 },
        spm: 29,
        restMinutes: 3.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
      },
    ],
  },
  {
    // AN: 12×30 s at 2k-6 with 1:3.5 rest — maximum rep count at a prescribed split.
    title: "Satellite Tornado",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -6 },
        spm: 31,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AN: 12×200 m at 2k-6 with ~1:2.5 rest — a dozen links, each one the same length.
    title: "Chain Lightning",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "distance", meters: 200 },
        ref: { base: "2k", off: -6 },
        spm: 31,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AN: 10×300 m at 2k-6 with ~1:2.6 rest — the longest prescribed-split distance set in the block.
    title: "Plow Wind",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 15 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 300 },
        ref: { base: "2k", off: -6 },
        spm: 31,
        restMinutes: 2.75,
      },
    ],
  },

  // -------------------------------------------------- hard, pain 5 (34–60)
  {
    // AN: 3×45 s all out with ~1:2.7 rest — three reps is not a small session when every one is emptied.
    title: "Wind Gust",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 6×60 s all out with 1:2 rest — a full minute at max, six times, on half the honest recovery.
    title: "Ground Strike",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 8×45 s all out with ~1:1.7 rest — the rest is the hard part.
    title: "Downburst",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.25,
      },
    ],
  },
  {
    // AN: 5×75 s all out with ~1:1.8 rest — long max-effort reps; the fifth is the only one that matters.
    title: "Dry Microburst",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.25,
      },
    ],
  },
  {
    // AN: 6×200 m all out with ~1:2.7 rest — max effort with a distance to answer for.
    title: "Wet Microburst",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 200 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 12×30 s all out with 1:2 rest — twelve maximal bursts on the shortest rest in the block.
    title: "Landspout",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1,
      },
    ],
  },
  {
    // AN: 7×75 s at 2k-6 with 1:1 rest — equal work and rest at a sub-2k split; the visibility goes first.
    title: "Whiteout",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 7 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { base: "2k", off: -6 },
        spm: 32,
        restMinutes: 1.25,
      },
    ],
  },
  {
    // AN: 12×30 s all out with 1:4 rest — full canonical recovery, and still nowhere to hide by rep nine.
    title: "Ball Lightning",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 10×60 s all out with 1:2 rest — ten minutes of maximal work spread over forty.
    title: "Giant Hail",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 10×300 m all out with ~1:1.8 rest — 3000 m of maximal metres, one shaft at a time.
    title: "Hail Shaft",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 300 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 8×75 s all out with 1:2 rest — the longest max rep repeated past the point it stays maximal.
    title: "Flash Flood",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AN: 90/75/60/45/30 s descending, targets sharpening 2k-3 → all out — everything that comes loose ends up at the bottom.
    title: "Debris Flow",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 14 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 3.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -5 },
        spm: 30,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -6 },
        spm: 31,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
      },
    ],
  },
  {
    // AN: 12×45 s all out with ~1:2.3 rest — the rotating core of the block; nine minutes of maximal work.
    title: "Supercell",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AN: 8×60 s all out with 1:2.25 rest off a 15' warm-up — the deep-rotation minute set.
    title: "Mesocyclone",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 15 },
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.25,
      },
    ],
  },
  {
    // AN: 10×60 s all out with 1:1.75 rest — wide, slow-moving and it takes everything with it.
    title: "Wedge Tornado",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 15 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AN: 12×30 s all out with 1:3.5 rest — thin, fast and far more violent than it looks on paper.
    title: "Rope Tornado",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AN: 9×75 s all out with ~1:1.6 rest — spun off the side of the session and just as destructive.
    title: "Gustnado",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 9 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 12×45 s all out with 1:2 rest — the fire column; nine minutes maximal on the shortest rest that survives it.
    title: "Pyrocumulonimbus",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 15 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 90/90/60/60/30 s all out with descending rests — the wrong phenomenon in the wrong season, all of it maximal.
    title: "Thundersnow",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
      },
    ],
  },
  {
    // AN: 12×60 s all out with 1:1.25 rest — twelve minutes maximal on rest that barely qualifies. The worst hour under 45'.
    title: "Tornado Outbreak",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 15 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.25,
      },
    ],
  },
  {
    // AN: 10×60 s all out with ~1:2.75 rest — honest recovery, honest maximal reps, fifty minutes of it.
    title: "Violent Storm",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 15 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.75,
      },
    ],
  },
  {
    // AN: 8×75 s all out with ~1:2.8 rest — ten minutes of maximal work with nothing but rest between.
    title: "Hurricane Force",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 15 },
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 3.5,
      },
    ],
  },
  {
    // AN: 6×90 s all out with ~1:2.7 rest — the longest maximal rep the anaerobic band admits.
    title: "Macroburst",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 20 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 4,
      },
    ],
  },
  {
    // AN: 10×60 s all out with ~1:2.75 rest off a 20' warm-up — deepening fast, and it does not let up.
    title: "Bomb Cyclone",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 20 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.75,
      },
    ],
  },
  {
    // AN: 12×90 s all out with 1:2 rest — an hour of session for eighteen minutes of work, and it earns every one.
    title: "Typhoon",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 3,
      },
    ],
  },
  {
    // AN: 12×90 s all out with ~1:2.3 rest — the same eighteen minutes with more room to recover, and it is still the second-longest session here.
    title: "Explosive Cyclogenesis",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 3.5,
      },
    ],
  },
  {
    // AN: 12×75 s all out with ~1:3.2 rest — the longest session in the block and mostly rest by volume; that is what it takes to keep twelve reps maximal.
    title: "Violent Tornado",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 15 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 4,
      },
    ],
  },
];
