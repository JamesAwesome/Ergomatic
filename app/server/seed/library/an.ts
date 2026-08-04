import type { WorkoutInput } from "../../../domain/types.js";

// AN (anaerobic) block of the generated library — 60 workouts,
// easy→hard. Authored in Task 7 against the pattern digest
// (app/domain/generation/patterns.json); ordering here IS the library
// browsing order within the type block.
//
// Revised at James's content review (2026-08-03): nothing faster than
// 2k-4 as a split ref (beyond that is {effort:"max"}), variety by
// structure (ladders, pyramids, stroke-builds, paired reps, waves)
// instead of rep-count tweaks, and every time-computable total lands on
// a 0/5 minute. Distance sets estimate from the nominal 2k baseline and
// are exempt from the round-total rule.
export const AN_WORKOUTS: WorkoutInput[] = [
  // ------------------------------------------------- medium, pain 3 (1–11)
  {
    // AN: 5×30 s at 2k-3 with 1:3 rest — the smallest honest anaerobic dose.
    title: "Scud Cloud",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 5 },
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
    // AN: 4×45 s at 2k-3 with ~1:2.3 rest — longer reps, deliberately shy of the rate cap.
    title: "Dust Whirl",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 4 },
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
      { k: "wu", minutes: 5 },
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
    // AN: 30/45/60/45/30 s pyramid at 2k-4, easing to 2k-3 at the apex — the block's smallest pyramid.
    title: "Beaver Tail",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 28,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -3 },
        spm: 27,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 28,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 29,
      },
    ],
  },
  {
    // AN: 5×150 m at 2k-4 with ~1:2.8 rest — short sharp distance reps for rate control.
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
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 6×45 s at 2k-3 with the rate building 27→32 across the set — a stroke-build, not a pace-build.
    title: "Roll Cloud",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 27,
        restMinutes: 1.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 1.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 29,
        restMinutes: 1.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 30,
        restMinutes: 1.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 31,
        restMinutes: 1.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 32,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AN: 2 rounds of a 60/45/30 s descending ladder at 2k-4 — rest tapers with the reps, then resets.
    title: "Shelf Cloud",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 28,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 2,
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
    // AN: 45/60/90/60/45 s pyramid at 2k-3 with generous rest — a minute and a half at the apex.
    title: "Mammatus",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -3 },
        spm: 27,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: -3 },
        spm: 26,
        restMinutes: 3,
      },
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
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 10×30 s at 2k-4 with 1:3 rest — the rest holds its ratio as the count grows.
    title: "Funnel Cloud",
    type: "AN",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 1.5,
      },
    ],
  },

  // ------------------------------------------------ medium, pain 4 (12–20)
  {
    // AN: 3 rounds of 45 s + 30 s at 2k-4 on tight rest — half the canonical recovery, twice the residue.
    title: "Collar Cloud",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 0.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 1,
      },
    ],
  },
  {
    // AN: 60/45/30/30 s descending, 2k-3 → 2k-4 → max as the pieces shorten.
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
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 1.75,
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
    // AN: 30/45/60/90 s ascending ladder, target easing 2k-4 → 2k-3 and the rate walking back with it.
    title: "Barber Pole",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
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
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: -3 },
        spm: 27,
      },
    ],
  },
  {
    // AN: 6×30 s at 2k-4 with 1:2 rest — short set, short rest, thorough for its fifteen minutes.
    title: "Inflow Band",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 1,
      },
    ],
  },
  {
    // AN: 4 rounds of 60 s + 30 s at 2k-4 — the short rep hangs off the long one like the echo it is named for.
    title: "Hook Echo",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 0.75,
      },
    ],
  },
  {
    // AN: 6×250 m at 2k-4 with ~1:2.2 rest — a long distance rep for anaerobic
    // work, though not the longest here (Plow Wind and Hail Shaft both run 300 m).
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
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 90/60/45/30 s descending, 2k-3 → 2k-4 → max — a session that ends faster than it starts.
    title: "Downdraft",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 7 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: -3 },
        spm: 27,
        restMinutes: 3,
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
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 2,
      },
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
    // AN: 30/45/60/90 s ascending from a max start to 2k-3 — each piece longer, each rest longer with it.
    title: "Updraft",
    type: "AN",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: -3 },
        spm: 27,
        restMinutes: 3.75,
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
        restMinutes: 3,
      },
    ],
  },

  // -------------------------------------------------- hard, pain 4 (21–33)
  {
    // AN: 5×45 s at 2k-4 with the rate building 28→32 — the front arrives one rate notch at a time.
    title: "Gust Front",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 28,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 31,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 32,
        restMinutes: 1.25,
      },
    ],
  },
  {
    // AN: 6×100 m all out with ~1:3.4 rest — twenty-second starts at the top of the rate band.
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
        ref: { effort: "max" },
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
      { k: "wu", minutes: 7 },
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
    // AN: 8×30 s all out with 1:2.5 rest — a broad flat flicker of a set; every rep the same, none of them cheap.
    title: "Sheet Lightning",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 1.25,
      },
    ],
  },
  {
    // AN: 5 rounds of two 30 s max strikes 45 s apart, then a long sit — twin bolts, one recovery.
    title: "Fork Lightning",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 0.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.25,
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
      { k: "wu", minutes: 5 },
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
    // AN: 10×45 s at 2k-4 with 1:3 rest — the workhorse anaerobic volume session.
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
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 2.25,
      },
    ],
  },
  {
    // AN: 10×250 m at 2k-4 with ~1:2.2 rest — 2500 m of anaerobic work, one hailstone at a time.
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
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 30/45/60/90/60/45/30 s pyramid, splits easing toward the apex and a max 30 s to finish — up one side and straight back down.
    title: "Outflow Boundary",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: -3 },
        spm: 27,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 30,
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
    // AN: 4 rounds of a 60/45/30 s descending ladder (2k-4 → max); rest
    // tapers within the round then resets longer before the next round
    // starts — a repeating ladder instead of one flat rep count.
    title: "Satellite Tornado",
    type: "AN",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 29,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 0.75,
      },
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
    // AN: 12×200 m all out with ~1:2.3 rest — a dozen links, each one the same length.
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
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AN: 10×300 m at 2k-4 with ~1:2.5 rest — the longest prescribed-split distance set in the block.
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
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 2.75,
      },
    ],
  },

  // -------------------------------------------------- hard, pain 5 (34–60)
  {
    // AN: 3×45 s all out with 1:3 rest — three reps is not a small session when every one is emptied.
    title: "Wind Gust",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.25,
      },
    ],
  },
  {
    // AN: 4×90 s all out with 1:2 rest — four long bolts, each one grounded completely.
    title: "Ground Strike",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 7 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 3,
      },
    ],
  },
  {
    // AN: 45/60/90/60/45 s all-out pyramid — the column is widest in the middle, and so is the damage.
    title: "Downburst",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 9 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { effort: "max" },
        spm: 32,
      },
    ],
  },
  {
    // AN: 90/60/45/30 s descending, all of it max — the reps shrink faster than the rest does.
    title: "Dry Microburst",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 3.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
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
      { k: "wu", minutes: 7 },
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
    // AN: 5×90 s at 2k-4 with 1:1 rest — equal work and rest at a fast split; the visibility goes first.
    title: "Whiteout",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 3 volleys of 3×30 s all out — a minute of rest inside the volley, a long sit between them.
    title: "Ball Lightning",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 12 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AN: 4×(75 s + 30 s) all out, generous rest after each — a long strike
    // and a short one, paired and repeated, instead of one flat rep length.
    title: "Giant Hail",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.5,
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
    // AN: 2 rounds of a 30/45/60/90 s ascending ladder, all out — the water rises twice.
    title: "Flash Flood",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 3.75,
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
      { k: "wu", minutes: 12 },
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
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
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
    // AN: 12×45 s all out with ~1:2.7 rest — the rotating core of the block; nine minutes of maximal work.
    title: "Supercell",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 7 },
      { k: "reps", count: 12 },
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
    // AN: 10×60 s at 2k-4 with 1' rest — the classic minute-on/minute-off, prescribed at a split that keeps it repeatable.
    title: "Mesocyclone",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 1,
      },
    ],
  },
  {
    // AN: 5×(60 s + 30 s) all out, generous rest after each — wide,
    // slow-moving, and the short second strike in every round is the part
    // that takes everything with it.
    title: "Wedge Tornado",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 15 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.5,
      },
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
    // AN: 30/45/60/45/30 s all-out pyramid, generous rest throughout — thin,
    // fast and far more violent than it looks on paper, building to one
    // longer strike in the middle and back down.
    title: "Rope Tornado",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 4.5,
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
        duration: { kind: "time", minutes: 0.75 },
        ref: { effort: "max" },
        spm: 32,
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
    // AN: 8×60 s all out with 1:2 rest — spun off the side of the session and just as destructive.
    title: "Gustnado",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 8 },
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
    // AN: 2 rounds of a 45/60/90 s ascending build, all out — the fire column assembles itself twice.
    title: "Pyrocumulonimbus",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 4,
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
        spm: 31,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 4.5,
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
    // AN: 4 waves of 3×60 s all out — a minute of rest inside the wave, a longer one between waves.
    title: "Tornado Outbreak",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AN: 10×60 s all out with 1:2.5 rest — honest recovery, honest maximal reps, forty-five minutes of it.
    title: "Violent Storm",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AN: 4 rounds of 90 s + 60 s all out — ten maximal minutes; the eye between rounds never quite arrives.
    title: "Hurricane Force",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 14 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 3.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 3,
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
      { k: "wu", minutes: 17 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 4,
      },
    ],
  },
  {
    // AN: 2 rounds of a 75/60/45/30 s all-out descending ladder off a 20'
    // warm-up, generous rest scaling down with the reps — deepening fast,
    // and it does not let up.
    title: "Bomb Cyclone",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 20 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
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
    // AN: 12×90 s all out with ~1:2.3 rest — eighteen maximal minutes; a seventy-minute session that is mostly rest, as it has to be.
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
        spm: 31,
        restMinutes: 3.5,
      },
    ],
  },
  {
    // AN: 5 rounds of 60 s + 90 s all out, the long rep earning the long rest — the pressure drops in pairs.
    title: "Explosive Cyclogenesis",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 31,
        restMinutes: 5,
      },
    ],
  },
  {
    // AN: 12×60 s all out with 1:4.5 rest — the block's longest session and mostly rest by volume; that is what it takes to keep twelve reps maximal.
    title: "Violent Tornado",
    type: "AN",
    difficulty: "hard",
    pain: 5,
    steps: [
      { k: "wu", minutes: 9 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 4.5,
      },
    ],
  },
];
