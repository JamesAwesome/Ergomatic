import type { WorkoutInput } from "../../../domain/types.js";

// TR (transport/race pace) block of the generated library — 75 workouts,
// easy→hard. 2k race-pace and sprint pieces, including community-canon
// shapes. Rest is not one ratio across the block: short sprint reps (30 s-2')
// carry generous rest, often 1:2 or more; sustained sets at or near 2k pace
// sit nearer 1:1; and a few canon volume sets (8×1000 m on 1' rest) run
// deliberately tight, with the pace eased to pay for it. Authored in Task 7
// against the pattern digest (app/domain/generation/patterns.json) and
// restructured at James's review (2026-08-03) for variety by shape rather
// than by a minute here or there. Retuned or newly generated totals land
// on a 0 or 5 WHERE THE 0:15 GRID ALLOWS; every time value a retune
// CREATES (every rest, and any piece a retune scales) stays on the 0:15
// grid always — a value inherited unchanged from the pre-retune workout
// stands as it was, on-grid or not; a total that cannot be round with
// grid values stands as its pieces sum. Distance sets remain exempt
// (2026-08-10 library-rebalance spec, §2/the zero-five audit; rest-grid
// pin, James 2026-08-10, extended to created work pieces the same day).
// Ordering here IS the library browsing order within the type block.
export const TR_WORKOUTS: WorkoutInput[] = [
  {
    // TR: 2000 m continuous at 2k+6 — race distance rehearsed just off pace.
    title: "Beam Sea",
    type: "TR",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "2k", off: 6 },
        spm: 24,
      },
    ],
  },
  {
    // TR: 5×1' at 2k+3 on 1' rest — the minute-on, minute-off habit at its smallest.
    title: "Tidal Bore",
    type: "TR",
    pain: 2,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // TR: 5×250 m at 2k+2 with ~1:1.5 rest — short and sharp, over before it bites.
    title: "Rip Current",
    type: "TR",
    pain: 2,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // TR: 750/500/250 m cut-down — each piece shorter and two seconds quicker.
    title: "Gyre",
    type: "TR",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "2k", off: 5 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: 1 },
        spm: 26,
      },
    ],
  },
  {
    // TR: 2×(500 m + 250 m) — a longer piece and a short one, twice through.
    title: "Loop Current",
    type: "TR",
    pain: 2,
    steps: [
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // TR: 3×2' at 2k+6 with 2' rest — rate practice more than a beating.
    title: "Canary Current",
    type: "TR",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 6 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 6 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 6 },
        spm: 24,
      },
    ],
  },
  {
    // TR: 1'/2'/3' building in length with growing rest — a lengthening intro set.
    title: "California Current",
    type: "TR",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "2k", off: 4 },
        spm: 24,
      },
    ],
  },
  {
    // TR: 250-500-750-500-250 m pyramid at 2k+3 with 1' rest — the shape at its smallest.
    title: "Benguela Current",
    type: "TR",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: 3 },
        spm: 26,
      },
    ],
  },
  {
    // TR: 1000 m at 2k+4, then two quick 250s at 2k-2 — an opener with a louder ending.
    title: "Equatorial Current",
    type: "TR",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: -2 },
        spm: 28,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: -2 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 4×500 m descending 2k+6 → 2k+3 — each one a second quicker, each rest a little longer.
    title: "Following Swell",
    type: "TR",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 6 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 5 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 4 },
        spm: 26,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 3 },
        spm: 26,
      },
    ],
  },
  {
    // TR: 5×90 s at 2k+4 with ~1:1.7 rest — five clean minute-and-a-halves.
    title: "Amihan",
    type: "TR",
    pain: 2,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // TR: 6×300 m at 2k+2 with generous rest — race pace touched six times over.
    title: "Habagat",
    type: "TR",
    pain: 2,
    steps: [
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 300 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // TR: 2000 m at 2k+5, a long rest, then 500 m at 2k+2 — the race split into distance and sprint.
    title: "Marin",
    type: "TR",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "2k", off: 5 },
        spm: 24,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 2 },
        spm: 26,
      },
    ],
  },
  {
    // TR: 3×1000 m at 2k+4 with 3' rest — the 1k repeat, learned before it gets expensive.
    title: "Ponant",
    type: "TR",
    pain: 2,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 3,
      },
    ],
  },
  {
    // TR: 4'-3'-2'-1' cut-down, pace tightening a second per rung, rest near 1:1.
    title: "Solano",
    type: "TR",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 5 },
        spm: 24,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: 2 },
        spm: 26,
      },
    ],
  },
  {
    // TR: 3×(3' + 500 m) — the same effort measured two ways, three times over.
    title: "Leveche",
    type: "TR",
    pain: 2,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "2k", off: 5 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 2,
      },
    ],
  },
  {
    // TR: 10×30 s at 2k+1 on 1' rest — brief, quick, and repeated until it adds up.
    title: "Vendaval",
    type: "TR",
    pain: 2,
    steps: [
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { base: "2k", off: 1 },
        spm: 28,
        restMinutes: 1,
      },
    ],
  },
  {
    // TR: 4×2' at 2k+4 with 3' rest — long recovery, so every rep starts fresh.
    title: "Norte",
    type: "TR",
    pain: 2,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 3,
      },
    ],
  },
  {
    // TR: 5×2' at 2k+2, rate climbing 24→28 with the rest growing to match —
    // the pace holds while the rate does the asking.
    title: "Strong Breeze",
    type: "TR",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 2 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 2 },
        spm: 28,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 2 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 10×1' at 2k+2 on 1:1 — the minute repeat grows up: more reps, less room.
    title: "Fresh Gale",
    type: "TR",
    pain: 3,
    steps: [
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // TR: 3×4' at 2k+2 with full 4' rest — three even efforts at 1:1.
    title: "Near Gale",
    type: "TR",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 2 },
        spm: 26,
      },
    ],
  },
  {
    // TR: 10×45 s at 2k-1 with ~1:1.7 rest — faster than race pace, ten times over.
    title: "Squall Gust",
    type: "TR",
    pain: 3,
    steps: [
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 0.75 },
        ref: { base: "2k", off: -1 },
        spm: 28,
        restMinutes: 1.25,
      },
    ],
  },
  {
    // TR: 500-750-1000-1250 m ladder, pace easing as the pieces stretch out.
    title: "Line Squall",
    type: "TR",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1250 },
        ref: { base: "2k", off: 3 },
        spm: 24,
      },
    ],
  },
  {
    // TR: 4×750 m descending 2k+4 → 2k-2 with 3' rest — each one faster than the last.
    // (replacement — Cross Sea's slot: medium/3, 20-30. Cross Sea could not
    // stretch into any unfilled seat, spec §3/move-plan residual; generated
    // fresh against book cell TR|30-45, §6's translation rule for a
    // replacement with no historical warm-up. Kept Cross Sea's own offset
    // sequence [+4,+2,0,-2] and spm progression on purpose — it is the
    // fixture `src/session/logDraft.test.ts` names for covering all three
    // `refLabel` sign branches, only scaled up in distance to reach the
    // 20-30 band.)
    title: "Beam Reach",
    type: "TR",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "2k", off: -2 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 1-2-3-2-1' time pyramid near race pace, generous rest either side of the peak.
    title: "Confused Sea",
    type: "TR",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 2.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 3.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: 0 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 1100 m / 3' / 550 m / 1' cut-down — every piece shorter and a second quicker.
    title: "Quartering Sea",
    type: "TR",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 1100 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 4.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 3.25,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 1 },
        spm: 28,
        restMinutes: 2.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: -1 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 10-12-14-16' time ladder at 2k+6 easing to flat 2k, 6' rest — a long broken race, building.
    // (replacement — Head Sea's slot: medium/3, 60+. Head Sea is 15:48 on
    // the real clock; reachability that assigned it 20-30 ran on the
    // rounded minute, and +25% of the real total tops out at 19:45, short
    // of any band's floor — the seat was licensed by rounding, so no
    // sketch exists (James's Head Sea addendum, Gate 1). Generated fresh
    // against book cell TR|60+.)
    title: "Following Seas",
    type: "TR",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "2k", off: 6 },
        spm: 24,
        restMinutes: 6,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 6,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 14 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 6,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 16 },
        ref: { base: "2k", off: 0 },
        spm: 28,
      },
    ],
  },
  {
    // TR: two 5:30 pieces around a 550 m at flat 2k — the sprint sits in the middle.
    title: "Monsoon Trough",
    type: "TR",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 5.5 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 4.25,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5.5 },
        ref: { base: "2k", off: 3 },
        spm: 24,
      },
    ],
  },
  {
    // TR: 5×500 m at 2k+2 with ~1:1 rest — the 500 repeat at a rehearsable pace.
    title: "Tropical Wave",
    type: "TR",
    pain: 3,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 2,
      },
    ],
  },
  {
    // TR: 9×250 m at flat 2k with 1:1.6 rest — nine bursts at exactly race pace.
    title: "Easterly Wave",
    type: "TR",
    pain: 3,
    steps: [
      { k: "reps", count: 9 },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // TR: 8×550 m in pairs — one at 2k+3 on short rest, one at race pace with more.
    title: "Gulf Stream",
    type: "TR",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 0 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 6×750 m at 2k+3 with ~1:0.9 rest — 4.5 km of work with no real hiding place.
    title: "Kuroshio",
    type: "TR",
    pain: 3,
    steps: [
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // TR: 12×300 m at flat 2k with ~1:1.4 rest — a dozen race-pace bursts for rate control.
    title: "Labrador Current",
    type: "TR",
    pain: 3,
    steps: [
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "distance", meters: 300 },
        ref: { base: "2k", off: 0 },
        spm: 26,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // TR: 2-3-4-3-2' pyramid at 2k+2 on 2' rest — the community-canon time pyramid.
    title: "Taku Wind",
    type: "TR",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 2 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 2 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 5-10-15-10-5' pyramid at 2k+6 into flat 2k and back out, 5' rest — the middle rung is the test.
    // (replacement — Monsoon Surge's slot: medium/4, 60+. Monsoon Surge
    // could not stretch into any unfilled seat, spec §3/move-plan
    // residual; generated fresh against book cell TR|60+.)
    title: "Tidal Race",
    type: "TR",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "2k", off: 6 },
        spm: 24,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "2k", off: 4 },
        spm: 26,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "2k", off: 2 },
        spm: 28,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "2k", off: 4 },
        spm: 26,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "2k", off: 6 },
        spm: 24,
      },
    ],
  },
  {
    // TR: 4×1050 m descending 2k+4 → 2k+1 with 4:45 rest — the 1k repeat as a negative split.
    title: "Humboldt Current",
    type: "TR",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 1050 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 4.75,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1050 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 4.75,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1050 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 4.75,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1050 },
        ref: { base: "2k", off: 1 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 10×400 m at 2k+1 with 1:1 rest — ten of them, and the ninth is the one that tells.
    title: "Agulhas Current",
    type: "TR",
    pain: 4,
    steps: [
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 400 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // TR: 4×5' at 2k+4 on 2:30 rest — longer pieces on short rest, pace eased to make it possible.
    title: "Mistral",
    type: "TR",
    pain: 4,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // TR: 4 pairs of 2' — one at 2k+3, one at 2k+1, the short rest after the easier rep.
    title: "Levanter",
    type: "TR",
    pain: 4,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 1 },
        spm: 28,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // TR: 5×4' at 2k+3 with 1:0.75 rest — long enough that pacing beats aggression.
    title: "Shamal",
    type: "TR",
    pain: 4,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 3,
      },
    ],
  },
  {
    // TR: 550-1100-1700-1100-550 m pyramid at 2k+2 on 2:45 rest — the middle rung is the test.
    title: "Khamsin",
    type: "TR",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1100 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1700 },
        ref: { base: "2k", off: 2 },
        spm: 24,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1100 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 2 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 4×(1000 m + 250 m) — a kilometre at 2k+3, then a burst at race pace, four times.
    title: "Libeccio",
    type: "TR",
    pain: 4,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 2,
      },
    ],
  },
  {
    // TR: 6-5-3:30-2:30-1' ladder with constant rest, pace tightening one second a rung.
    title: "Southerly Buster",
    type: "TR",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "2k", off: 5 },
        spm: 24,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3.5 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2.5 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: 1 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 2×2000 m — the race distance twice, 8' apart, the second one a second quicker.
    title: "Pampero",
    type: "TR",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 8,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "2k", off: 3 },
        spm: 26,
      },
    ],
  },
  {
    // TR: 2×(7' + 2:30) — a long piece off pace, a short one at it, twice through.
    title: "Elephanta",
    type: "TR",
    pain: 4,
    steps: [
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 7 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 3.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2.5 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 2.25,
      },
    ],
  },
  {
    // TR: 1-2-3-4-5' ladder starting at flat 2k and easing out — front-loaded speed.
    title: "Norther",
    type: "TR",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 1 },
        spm: 28,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "2k", off: 4 },
        spm: 24,
      },
    ],
  },
  {
    // TR: two broken 2.2ks — 4×550 m on 1:15 rest, 6' between sets, the first set at race pace.
    title: "Piteraq",
    type: "TR",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 6,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 2 },
        spm: 26,
      },
    ],
  },
  {
    // TR: 1500/1000/500 m descending to flat 2k on long rest — a negative-split rehearsal.
    title: "Papagayo",
    type: "TR",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 6,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 0 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 6×2' descending 2k+3 → 2k-2 on 2' rest — the pace tightens every rep.
    title: "Tehuantepecer",
    type: "TR",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: -1 },
        spm: 28,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: -2 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 1150-550-300-550-1150 m — the pyramid upside down, quickest in the middle.
    title: "Sundowner",
    type: "TR",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 1150 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 1 },
        spm: 28,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 300 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "2k", off: 1 },
        spm: 28,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1150 },
        ref: { base: "2k", off: 2 },
        spm: 26,
      },
    ],
  },
  {
    // TR: 3×1500 m at 2k+3 with 5' rest — three honest three-quarter races.
    title: "Squamish",
    type: "TR",
    pain: 4,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 5,
      },
    ],
  },
  {
    // TR: 8×500 m at flat 2k with ~1:1 rest — the canon set at the real number. It hurts.
    title: "Storm Warning",
    type: "TR",
    pain: 5,
    steps: [
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 2,
      },
    ],
  },
  {
    // TR: 3×(1000 m + 500 m), the 500 under race pace — compound pairs with no soft half.
    title: "Gale Warning",
    type: "TR",
    pain: 5,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: -1 },
        spm: 28,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // TR: 5×1000 m at 2k+1 with 1:0.7 rest — five near-race kilometres on short recovery.
    title: "Circumpolar Current",
    type: "TR",
    pain: 5,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // TR: 4×4' at 2k+2 with 3:30 rest — sixteen minutes of work on rest that nearly matches it.
    title: "Equatorial Countercurrent",
    type: "TR",
    pain: 5,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 3.5,
      },
    ],
  },
  {
    // TR: 6×90 s at 2k-2 on 3:30 rest — well under race pace, with the rest to support it.
    title: "Somali Current",
    type: "TR",
    pain: 5,
    steps: [
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "2k", off: -2 },
        spm: 28,
        restMinutes: 3.5,
      },
    ],
  },
  {
    // TR: 250-500-750-1000-750-500-250 m pyramid at 2k+1 — 4 km, all of it near pace.
    title: "Brazil Current",
    type: "TR",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: 1 },
        spm: 28,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 1 },
        spm: 28,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 1 },
        spm: 28,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { base: "2k", off: 1 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 4×1250 m at 2k+2 with 4' rest — past the 1k mark every rep, which is where the pace argues.
    title: "Falkland Current",
    type: "TR",
    pain: 5,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1250 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 4,
      },
    ],
  },
  {
    // TR: 5×2' at 2k-1 on 4' rest — sprint pace held for two minutes, paid back double.
    title: "Kamchatka Current",
    type: "TR",
    pain: 5,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: -1 },
        spm: 28,
        restMinutes: 4,
      },
    ],
  },
  {
    // TR: 6'/4'/2' cut-down closing under race pace, then 250 m all out.
    title: "Oyashio Current",
    type: "TR",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 3.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: -1 },
        spm: 28,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { effort: "max" },
        spm: 28,
      },
    ],
  },
  {
    // TR: 6' / 500 m twice over with a 2' sting on the end — long, fast, long, fast, done.
    title: "Ekman Drift",
    type: "TR",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: -1 },
        spm: 28,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "2k", off: 3 },
        spm: 26,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: -1 },
        spm: 28,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 0 },
        spm: 28,
      },
    ],
  },
  {
    // TR: four 4:30 pieces stepping 2k+2 → 2k-1, then 300 m all out — the tank empties on the last one.
    title: "Antarctic Drift",
    type: "TR",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 4.5 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4.5 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4.5 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4.5 },
        ref: { base: "2k", off: -1 },
        spm: 28,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 300 },
        ref: { effort: "max" },
        spm: 28,
      },
    ],
  },
  {
    // TR: 1250-1000-750-500 m cut-down and a 250 m all out — five rungs down to nothing left.
    title: "Cold Snap",
    type: "TR",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 1250 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 3.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: -1 },
        spm: 28,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 250 },
        ref: { effort: "max" },
        spm: 28,
      },
    ],
  },
  {
    // TR: 8×1000 m at 2k+8 on 1' rest — the community-canon volume set; the pace eased to pay for the missing rest.
    title: "Polar Blast",
    type: "TR",
    pain: 5,
    steps: [
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 8 },
        spm: 24,
        restMinutes: 1,
      },
    ],
  },
  {
    // TR: 12×500 m at 2k+2 on 105 s rest — the canon set, doubled, on shrinking recovery.
    title: "Arctic Blast",
    type: "TR",
    pain: 5,
    steps: [
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // TR: 6×3' at 2k+1 with 1:1.5 rest — eighteen minutes a second off race pace, rest that covers it.
    title: "Karayel",
    type: "TR",
    pain: 5,
    steps: [
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 4.5,
      },
    ],
  },
  {
    // TR: 2000-1500-1000-500 m cut-down on long rest — 5 km, each rung a second quicker.
    title: "Poyraz",
    type: "TR",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 8,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 6,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 1 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 4×6' at 2k+2 with equal rest — long clock reps at a pace that notices.
    title: "Lodos",
    type: "TR",
    pain: 5,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 6,
      },
    ],
  },
  {
    // TR: 500-1000-1500-2000-1500-1000-500 m pyramid at 2k+5 — 8 km with a 2k in the middle.
    title: "Grec",
    type: "TR",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 5 },
        spm: 26,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 5 },
        spm: 24,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "2k", off: 5 },
        spm: 24,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "2k", off: 5 },
        spm: 24,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "2k", off: 5 },
        spm: 24,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 5 },
        spm: 26,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 5 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 2000 m / 5' / 1500 m / 4' / 500 m — long distance pieces broken up by faster clock work.
    title: "Garbi",
    type: "TR",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 7,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 6,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 1 },
        spm: 26,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 0 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 6' / 1000 m three times through, closing with 500 m all out — a long day at race pace.
    title: "Peru Current",
    type: "TR",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { effort: "max" },
        spm: 28,
      },
    ],
  },
  {
    // TR: 1500 m / 4' / 1250 m / 3' / 1000 m / 2' — the distance shrinks, the pace does not.
    title: "Kuroshio Extension",
    type: "TR",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 1 },
        spm: 28,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1250 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "2k", off: 0 },
        spm: 28,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: -1 },
        spm: 28,
      },
    ],
  },
  {
    // TR: 8×4' at 2k+3 with 3:30 rest — thirty-two minutes of race work; the back half is the workout.
    title: "Alaska Current",
    type: "TR",
    pain: 5,
    steps: [
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 3.5,
      },
    ],
  },
  {
    // TR: 6×2000 m at 2k+6 on 5' rest — the six-by-2k grinder, 12 km bought with real recovery.
    title: "Roaring Forties",
    type: "TR",
    pain: 5,
    steps: [
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "2k", off: 6 },
        spm: 24,
        restMinutes: 5,
      },
    ],
  },
  {
    // TR: 2000/1500 m, 4', 1000 m, 3', 500 m — six pieces descending to flat 2k.
    title: "Furious Fifties",
    type: "TR",
    pain: 5,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "2k", off: 4 },
        spm: 24,
        restMinutes: 8,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "2k", off: 3 },
        spm: 24,
        restMinutes: 7,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 6,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "2k", off: 2 },
        spm: 26,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "2k", off: 1 },
        spm: 28,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "2k", off: 0 },
        spm: 28,
      },
    ],
  },
];
