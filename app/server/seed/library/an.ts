import type { WorkoutInput } from "../../../domain/types.js";

// AN (anaerobic) block of the generated library — 60 workouts,
// easy→hard. Authored in Task 7 against the pattern digest
// (app/domain/generation/patterns.json); ordering here IS the library
// browsing order within the type block.
//
// Revised at James's content review (2026-08-03): nothing faster than
// 2k-4 as a split ref (beyond that is {effort:"max"}), variety by
// structure (ladders, pyramids, stroke-builds, paired reps, waves)
// instead of rep-count tweaks. Retuned or newly generated totals land on
// a 0 or 5 WHERE THE 0:15 GRID ALLOWS; every time value a retune CREATES
// (every rest, and any piece a retune scales) stays on the 0:15 grid
// always — a value inherited unchanged from the pre-retune workout
// stands as it was, on-grid or not; a total that cannot be round with
// grid values stands as its pieces sum. Distance sets remain exempt
// (2026-08-10 library-rebalance spec, §2/the zero-five audit; rest-grid
// pin, James 2026-08-10, extended to created work pieces the same day).
export const AN_WORKOUTS: WorkoutInput[] = [
  // ------------------------------------------------- pain 3 (1–11)
  {
    // AN: 5×30 s at 2k-3 with 1:3 rest — five short strikes with room to breathe between them.
    title: "Scud Cloud",
    type: "AN",
    pain: 3,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 4×45 s at 2k-3 with ~1:2.3 rest — longer reps, deliberately held at the bottom of the rate band.
    title: "Dust Whirl",
    type: "AN",
    pain: 3,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 26,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AN: 6×200 m at 2k-4 with ~1:1.7 rest — anaerobic work measured by the metre, not the clock.
    title: "Steam Devil",
    type: "AN",
    pain: 3,
    steps: [
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
    pain: 3,
    steps: [
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
    // AN: 30/45/60/45/30 s pyramid at 2k-4, easing to 2k-3 at the apex — up to a minute and back, quickly.
    title: "Beaver Tail",
    type: "AN",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 30,
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
        spm: 26,
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
        spm: 30,
      },
    ],
  },
  {
    // AN: 5×150 m at 2k-4 with ~1:2.8 rest — short sharp distance reps for rate control.
    title: "Tail Cloud",
    type: "AN",
    pain: 3,
    steps: [
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
    // AN: 6×45 s at 2k-3 with the rate building 28→32 in paired steps — a stroke-build, not a pace-build.
    title: "Roll Cloud",
    type: "AN",
    pain: 3,
    steps: [
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
        spm: 28,
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
        spm: 30,
        restMinutes: 1.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 32,
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
    pain: 3,
    steps: [
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
        spm: 30,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 32,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 8×250 m at 2k-4 with ~1:1.7 rest — distance reps where the last two decide the session.
    title: "Wall Cloud",
    type: "AN",
    pain: 3,
    steps: [
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: -4 },
        spm: 28,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AN: 45/75/105/75/45 s pyramid at 2k-3 with generous rest — a minute and three-quarters at the apex.
    // (grid pin, 2026-08-10: the plan's own scaled values — 0:50/1:10/1:50
    // pieces, a 2:20 rest — sat off the 0:15 grid; grown to the nearest
    // grid values that hold the 20-30 band, landing exactly on 20:00.)
    title: "Mammatus",
    type: "AN",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 30,
        restMinutes: 2.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 3.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.75 },
        ref: { base: "2k", off: -3 },
        spm: 26,
        restMinutes: 3.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 3.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 30,
        restMinutes: 2.25,
      },
    ],
  },
  {
    // AN: 10×30 s at 2k-4 with 1:3 rest — the rest holds its ratio as the count grows.
    title: "Funnel Cloud",
    type: "AN",
    pain: 3,
    steps: [
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 1.5,
      },
    ],
  },

  // ------------------------------------------------ pain 4 (12–20)
  {
    // AN: 3 rounds of 45 s + 30 s at 2k-4 on tight rest — half the canonical recovery, twice the residue.
    title: "Collar Cloud",
    type: "AN",
    pain: 4,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 28,
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
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -3 },
        spm: 26,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -4 },
        spm: 28,
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
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
        spm: 32,
        restMinutes: 1.5,
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
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: -3 },
        spm: 26,
      },
    ],
  },
  {
    // AN: 6×30 s at 2k-4 with 1:2 rest — short set, short rest, thorough for its fifteen minutes.
    title: "Inflow Band",
    type: "AN",
    pain: 4,
    steps: [
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
    pain: 4,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 30,
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
    // AN: 7×250 m at 2k-4 with ~1:2.2 rest — seven fast quarter-Ks on real recovery.
    title: "Bow Echo",
    type: "AN",
    pain: 4,
    steps: [
      { k: "reps", count: 7 },
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
    pain: 4,
    steps: [
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
        ref: { base: "2k", off: -4 },
        spm: 28,
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
    // AN: 10×3' at 2k-4 with 2' rest — steady anaerobic volume, thirty minutes of it.
    // (replacement — Updraft's slot: medium/4, 45-60. Updraft could not
    // stretch into any unfilled seat, spec §3/move-plan residual;
    // generated fresh against book cell AN|60+, §6's translation rule for
    // a replacement with no historical warm-up.)
    title: "Meso Low",
    type: "AN",
    pain: 4,
    steps: [
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 3 rounds of 4×45 s at 2k-3 — quick rest inside the round, a real one between.
    title: "Wind Gust",
    type: "AN",
    pain: 4,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 3.25,
      },
    ],
  },

  // -------------------------------------------------- pain 4 (21–33)
  {
    // AN: 5 rounds of a 1-2-3' ladder all out — the rear flank climbs and climbs.
    // (replacement — Gust Front's slot: hard/4, 45-60. Gust Front could
    // not stretch into any unfilled seat, spec §3/move-plan residual;
    // generated fresh against book cell AN|60+.)
    title: "Rear Flank",
    type: "AN",
    pain: 4,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 12×1:30 all out with 1:1.5 rest — twelve honest minutes of maximal work.
    // (replacement — Dust Storm's slot: hard/4, 45-60. Dust Storm could
    // not stretch into any unfilled seat, spec §3/move-plan residual;
    // generated fresh against book cell AN|60+.)
    title: "Scud Run",
    type: "AN",
    pain: 4,
    steps: [
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.25,
      },
    ],
  },
  {
    // AN: 4 rounds of 1:30/3/1/2:30 all out — the long ones bracket the short ones.
    // (replacement — Heat Burst's slot: hard/4, 45-60. Heat Burst could
    // not stretch into any unfilled seat, spec §3/move-plan residual;
    // generated fresh against book cell AN|60+.)
    title: "Cloud to Ground",
    type: "AN",
    pain: 4,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 2.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2.5 },
        ref: { effort: "max" },
        spm: 30,
      },
    ],
  },
  {
    // AN: 3 rounds of a 1-2-3-2-1' pyramid all out — climb to three minutes and straight back down, three times.
    // (replacement — Sheet Lightning's slot: hard/4, 45-60. Sheet
    // Lightning could not stretch into any unfilled seat, spec §3/
    // move-plan residual; generated fresh against book cell AN|60+.)
    title: "Bolt from the Blue",
    type: "AN",
    pain: 4,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
      },
    ],
  },
  {
    // AN: 5 rounds of two 30 s max strikes 45 s apart, then a long sit — twin bolts, one recovery.
    title: "Fork Lightning",
    type: "AN",
    pain: 4,
    steps: [
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
    // AN: 10×150 m all out with 1:1.8 rest — max effort scored by the metre, so the fade is visible.
    title: "Heat Lightning",
    type: "AN",
    pain: 4,
    steps: [
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 150 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AN: 11×90 s all out with ~1:2.3 rest — the longest flat max-effort set here.
    // (replacement — Dry Lightning's slot: hard/4, 45-60. Dry Lightning
    // could not stretch into any unfilled seat, spec §3/move-plan
    // residual; generated fresh against book cell AN|60+.)
    title: "Ground Flash",
    type: "AN",
    pain: 4,
    steps: [
      { k: "reps", count: 11 },
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
    // AN: 10×45 s at 2k-4 with 1:3 rest — the workhorse anaerobic volume session.
    title: "Anvil Crawler",
    type: "AN",
    pain: 4,
    steps: [
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
    // AN: 2 volleys of 5×300 m at 2k-4 — 90 s inside the volley, 3:45 between them.
    title: "Hailstorm",
    type: "AN",
    pain: 4,
    steps: [
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "distance", meters: 300 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 300 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 300 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 300 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 300 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 3.75,
      },
    ],
  },
  {
    // AN: 30/45/60/90/60/45/30 s pyramid, splits easing toward the apex and a max 30 s to finish — up one side and straight back down.
    title: "Outflow Boundary",
    type: "AN",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: -4 },
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
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: -3 },
        spm: 26,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 28,
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
    // AN: 4 rounds of 60/45/30 s, 2k-4 down to max — the reps shrink, the rest resets, four times through.
    title: "Satellite Tornado",
    type: "AN",
    pain: 4,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 28,
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
    pain: 4,
    steps: [
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "distance", meters: 200 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AN: 10×300 m at 2k-4 with ~1:2.5 rest — the longest prescribed-split distance set in the block.
    title: "Plow Wind",
    type: "AN",
    pain: 4,
    steps: [
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

  // -------------------------------------------------- pain 5 (34–60)
  {
    // AN: 4 rounds of a 1-2-3-4' ladder all out — a full hour of climbing bolts.
    // (replacement — Lightning Strike's slot: hard/5, 60+. Lightning
    // Strike could not stretch into any unfilled seat, spec §3/move-plan
    // residual; generated fresh against book cell AN|60+.)
    title: "Positive Strike",
    type: "AN",
    pain: 5,
    steps: [
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
        duration: { kind: "time", minutes: 2 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 4×90 s all out with 1:2.3 rest — four long bolts, each one grounded completely.
    title: "Ground Strike",
    type: "AN",
    pain: 5,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 3.5,
      },
    ],
  },
  {
    // AN: 60/90/120/90/60 s all-out pyramid — the column is widest in the middle, and so is the damage.
    title: "Downburst",
    type: "AN",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 3.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 3.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        spm: 32,
      },
    ],
  },
  {
    // AN: 3 rounds of a 1:30-3-4:30-3-1:30' pyramid all out — the column widens three times over.
    // (replacement — Dry Microburst's slot: hard/5, 60+. Dry Microburst
    // could not stretch into any unfilled seat, spec §3/move-plan
    // residual; generated fresh against book cell AN|60+.)
    title: "Downburst Line",
    type: "AN",
    pain: 5,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4.5 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 32,
      },
    ],
  },
  {
    // AN: 6×250 m all out with 1:3 rest — max effort with a distance to answer for.
    title: "Wet Microburst",
    type: "AN",
    pain: 5,
    steps: [
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AN: 12×30 s all out with 1:2.5 rest — the reps arrive faster than the recovery can.
    title: "Landspout",
    type: "AN",
    pain: 5,
    steps: [
      { k: "reps", count: 12 },
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
    // AN: 5×90 s at 2k-4 with ~1:1.7 rest — long reps at a fast split; the visibility goes first.
    title: "Whiteout",
    type: "AN",
    pain: 5,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AN: 3 volleys of 3×30 s all out — 1:15 inside the volley, 3' between them.
    // (grid pin, 2026-08-10: the plan's own scaled rests — 1:10, 1:10, 2:50
    // — sat off the 0:15 grid; the last rest grown past its nearest grid
    // value, to 3', to land exactly on 21:00 rather than the 20:15 the
    // nearest value alone would leave — still inside the retune's own
    // ±25% envelope.)
    title: "Ball Lightning",
    type: "AN",
    pain: 5,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 3,
      },
    ],
  },
  {
    // AN: 4 rounds of 90 s + 30 s all out — empty the long one, then answer the short one.
    title: "Giant Hail",
    type: "AN",
    pain: 5,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 3,
      },
    ],
  },
  {
    // AN: 10×300 m all out with ~1:1.8 rest — 3000 m of maximal metres, one shaft at a time.
    title: "Hail Shaft",
    type: "AN",
    pain: 5,
    steps: [
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
    // AN: 2 rounds of a 30/45/75/105 s ascending ladder, all out — the water rises twice.
    // (grid pin, 2026-08-10: the plan's own scaled pieces/rests — 0:50,
    // 1:10, 1:40, and rests 1:40/2:10/2:50/4:10 — sat off the 0:15 grid;
    // regrown to grid values that hold the same 4-rung ladder and land
    // exactly on 30:00.)
    title: "Flash Flood",
    type: "AN",
    pain: 5,
    steps: [
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
        duration: { kind: "time", minutes: 1.25 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.75 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 4.5,
      },
    ],
  },
  {
    // AN: 105/90/75/60/30 s descending, targets sharpening 2k-3 → all out — everything that comes loose ends up at the bottom.
    // (grid pin, 2026-08-10: the plan's own scaled pieces/rests — 1:40,
    // 1:20, 1:10, 0:50, and rests 4:30/3:50/3:20/2:50 — sat off the 0:15
    // grid; regrown to grid values that hold the same descending shape and
    // land exactly on 20:00.)
    title: "Debris Flow",
    type: "AN",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 1.75 },
        ref: { base: "2k", off: -3 },
        spm: 28,
        restMinutes: 4.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 3.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.25 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 3.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 32,
        restMinutes: 2.75,
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
    pain: 5,
    steps: [
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
    // AN: 10×60 s at 2k-4 with 1:2 rest — ten fast minutes, each one paid for before the next.
    title: "Mesocyclone",
    type: "AN",
    pain: 5,
    steps: [
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -4 },
        spm: 30,
        restMinutes: 2,
      },
    ],
  },
  {
    // AN: 5 rounds of 60 s + 30 s all out on 2'/2:30 rest — a full minute emptied, then a sprint on top of it.
    title: "Wedge Tornado",
    type: "AN",
    pain: 5,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
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
    // AN: 30/45/60/45/30 s all-out pyramid on long rests — climb to a full minute and back down, every rep maximal.
    title: "Rope Tornado",
    type: "AN",
    pain: 5,
    steps: [
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
    // AN: 8×75 s all out with 1:2 rest — spun off the side of the session and just as destructive.
    title: "Gustnado",
    type: "AN",
    pain: 5,
    steps: [
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
    // AN: 2 rounds of a 60/90/120 s ascending build, all out — the fire column assembles itself twice.
    title: "Pyrocumulonimbus",
    type: "AN",
    pain: 5,
    steps: [
      { k: "reps", count: 2 },
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
        spm: 30,
        restMinutes: 3.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 4.75,
      },
    ],
  },
  {
    // AN: 90/90/60/60/30 s all out with descending rests — the wrong phenomenon in the wrong season, all of it maximal.
    title: "Thundersnow",
    type: "AN",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 30,
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
    // AN: 4 waves of 90/60/30 s all out — each wave shrinks as it breaks, then the longer sit.
    title: "Tornado Outbreak",
    type: "AN",
    pain: 5,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 30,
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
        duration: { kind: "time", minutes: 0.5 },
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
    pain: 5,
    steps: [
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
    pain: 5,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 30,
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
    pain: 5,
    steps: [
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 4,
      },
    ],
  },
  {
    // AN: 2 rounds of 90/75/60/45 s all out — the reps shrink and the rest shrinks with them.
    // (grid pin, 2026-08-10: the plan's own scaled pieces/rests — 1:10,
    // 0:50, 0:40, and rests 3:40/3'/2:20/1:50 — sat off the 0:15 grid;
    // regrown to grid values that hold the same descending shape and land
    // exactly on 30:00.)
    title: "Bomb Cyclone",
    type: "AN",
    pain: 5,
    steps: [
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 3.75,
      },
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
        restMinutes: 2.25,
      },
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
    // AN: 12×90 s all out with ~1:2.3 rest — eighteen maximal minutes; a seventy-minute session that is mostly rest, as it has to be.
    title: "Typhoon",
    type: "AN",
    pain: 5,
    steps: [
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { effort: "max" },
        spm: 30,
        restMinutes: 3.5,
      },
    ],
  },
  {
    // AN: 5 rounds of 60 s + 90 s all out, the long rep earning the long rest — the pressure drops in pairs.
    title: "Explosive Cyclogenesis",
    type: "AN",
    pain: 5,
    steps: [
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
        spm: 30,
        restMinutes: 5,
      },
    ],
  },
  {
    // AN: 12×60 s all out with 1:4.5 rest — the block's longest session and mostly rest by volume; that is what it takes to keep twelve reps maximal.
    title: "Violent Tornado",
    type: "AN",
    pain: 5,
    steps: [
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
