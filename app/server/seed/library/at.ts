import type { WorkoutInput } from "../../../domain/types.js";

// AT (anaerobic threshold) block of the generated library — 75 workouts,
// easy→hard. Authored in Task 7 against the pattern digest
// (app/domain/generation/patterns.json); ordering here IS the library
// browsing order within the type block.
export const AT_WORKOUTS: WorkoutInput[] = [
  {
    // AT: 10' continuous at 6k+4 — the shortest threshold piece in the block.
    title: "Occluded Front",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 4 },
        spm: 22,
      },
    ],
  },
  {
    // AT: 12' continuous at 6k+3 — one unbroken piece, no rest to hide behind.
    title: "Stationary Front",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 3 },
        spm: 22,
      },
    ],
  },
  {
    // AT: 3×3' at 6k+2 with 3:1 rest — a threshold taste on a short clock.
    title: "Pressure Ridge",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 2 },
        spm: 23,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 4×3' at 6k+5 with 1.5:1 rest — the gentlest full set in the block.
    title: "Gradient Wind",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 5 },
        spm: 22,
        restMinutes: 2,
      },
    ],
  },
  {
    // AT: 3×4' at 6k+4 with 1.6:1 rest — slightly longer reps, same easy pace.
    title: "Barometric Low",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 7 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 4 },
        spm: 22,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AT: 3×1000 m at 6k+6 with 2.5' rest — threshold by distance, easy end.
    title: "Warm Sector",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AT: 3'/5'/7' ascending ladder, pace easing 6k+4→+6 as the rungs grow.
    title: "Frontal Wave",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 7 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 5 },
        spm: 22,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 7 },
        ref: { base: "6k", off: 6 },
        spm: 22,
      },
    ],
  },
  {
    // AT: 500/1000/1500 m ascending distance ladder, pace easing 6k+0→+4.
    title: "Isobaric Ridge",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 2 },
        spm: 25,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "6k", off: 4 },
        spm: 23,
      },
    ],
  },
  {
    // AT: 6'/4'/2' descending ladder, pace sharpening 6k+4→6k+0 as it shortens.
    title: "Upper Ridge",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 8' at 6k+6 then 2×2' at 6k+1 — one long piece, two sharp ones after.
    title: "Frontal Boundary",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 3,
      },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 1 },
        spm: 25,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AT: 1000 m / 5' / 1000 m sandwich at 6k+4 and 6k+2 — distance either side.
    title: "Marine Layer",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 4 },
        spm: 23,
      },
    ],
  },
  {
    // AT: 4'/3'/2' descending ladder from 6k+2 down to 6k-2 — short and pointed.
    title: "Trough",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 2 },
        spm: 23,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 0 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -2 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 2'/3'/4' ascending ladder, pace bleeding off 6k-2 → 6k+0.
    title: "Pressure Gradient",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -2 },
        spm: 26,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: -1 },
        spm: 25,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 0 },
        spm: 24,
      },
    ],
  },
  {
    // AT: 5×2:30 at 6k+1 with 1.67:1 rest — honest threshold reps, short rest.
    title: "Cold Sector",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2.5 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AT: 6×2' at 6k+2 with 1.33:1 rest — more reps, less recovery each.
    title: "Baroclinic Zone",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AT: 10×1' at 6k-2 with 45 s rest — fast, dense, barely-there recovery.
    title: "Confluence Zone",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: -2 },
        spm: 26,
        restMinutes: 0.75,
      },
    ],
  },
  {
    // AT: 4×750 m at 6k+2 with 1.5' rest — the short threshold distance rep.
    title: "Diffluence Zone",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "6k", off: 2 },
        spm: 25,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AT: 7'/5'/4' descending ladder, pace building 6k+5 → 6k+1 as it shortens.
    title: "Trough Axis",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 7 },
        ref: { base: "6k", off: 5 },
        spm: 22,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 1 },
        spm: 25,
      },
    ],
  },
  {
    // AT: 3×5' with the pace stepping 6k+6 / +3 / +0 — a rate ladder, not a
    // duration one; every rung is the same length and each one costs more.
    title: "Ridge Axis",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 9' at 6k+7 then 3×90 s at 6k-1 — steady base, then a fast finish.
    title: "Onshore Flow",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 7 },
        spm: 22,
        restMinutes: 3,
      },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AT: three descending 2' sharpeners, then 6' at 6k+4 on tired legs.
    title: "Offshore Flow",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 0 },
        spm: 25,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -2 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 4 },
        spm: 22,
      },
    ],
  },
  {
    // AT: 6'/4'/6' with the middle piece at 6k+1 — a dip in the sandwich.
    title: "Comma Cloud",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 7 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 1 },
        spm: 25,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 4 },
        spm: 23,
      },
    ],
  },
  {
    // AT: 11' at 6k+7 then 4×1' at 6k-2 — a long grind with a stinging tail.
    title: "Frontal Passage",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 11 },
        ref: { base: "6k", off: 7 },
        spm: 22,
        restMinutes: 3,
      },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: -2 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 25' continuous at 6k+4 — sustained threshold with nowhere to hide.
    title: "Anticyclone",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 25 },
        ref: { base: "6k", off: 4 },
        spm: 23,
      },
    ],
  },
  {
    // AT: 4×5' at 6k+2 with 2:1 rest — the workhorse threshold set.
    title: "Blocking High",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AT: 3×8' at 6k+4 with ~3:1 rest — long reps, short recovery.
    title: "Omega Block",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AT: 4×6' at 6k+3 with 3:1 rest — steady threshold volume, tight breaks.
    title: "Thermal Low",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 2,
      },
    ],
  },
  {
    // AT: 4×4' at 6k-2 with 2:1 rest — top of the band, paid for with rest.
    title: "Heat Low",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: -2 },
        spm: 26,
        restMinutes: 2,
      },
    ],
  },
  {
    // AT: 2×10' at 2k+10 with 2:1 rest — the long rep, prescribed off 2k.
    title: "Cutoff Low",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "2k", off: 10 },
        spm: 24,
        restMinutes: 5,
      },
    ],
  },
  {
    // AT: 3×7' at 6k+1 with 2:1 rest — the middle distance of threshold work.
    title: "Deepening Low",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 7 },
        ref: { base: "6k", off: 1 },
        spm: 25,
        restMinutes: 3.5,
      },
    ],
  },
  {
    // AT: 3×2000 m at 6k+4 with 3' rest — threshold volume by the 2k marker.
    title: "Filling Low",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 3,
      },
    ],
  },
  {
    // AT: 4×1500 m at 6k+2 with 2' rest — three-minute-ish reps, brief breaks.
    title: "Upper Trough",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 2,
      },
    ],
  },
  {
    // AT: 2×3000 m at 6k+5 with 4' rest — two long pieces, honest pacing test.
    title: "Short Wave",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 5 },
        spm: 23,
        restMinutes: 4,
      },
    ],
  },
  {
    // AT: 10'/8'/6' descending ladder, pace building 6k+6 → 6k+2.
    title: "Long Wave",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 2 },
        spm: 25,
      },
    ],
  },
  {
    // AT: 5'/7'/9' ascending ladder from 6k-1 — the pieces grow, the pace slips.
    title: "Rossby Wave",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 7 },
        ref: { base: "6k", off: 0 },
        spm: 25,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 1 },
        spm: 24,
      },
    ],
  },
  {
    // AT: 2000/1500/1000/500 m descending ladder, 6k+6 down to 6k+0.
    title: "Ekman Spiral",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 2 },
        spm: 25,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 3'/6'/9' ascending ladder starting at 6k-2 — front-loaded speed.
    title: "Geostrophic Wind",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: -2 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 0 },
        spm: 25,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 2 },
        spm: 23,
      },
    ],
  },
  {
    // AT: 3×8' with the pace stepping 6k+6 / +3 / +0 — equal rungs, rising cost.
    title: "Thermal Wind",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 2'/5'/8'/5'/2' pyramid — fastest at the ends, longest in the middle.
    title: "Occlusion Point",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 500/1000/1500/1000/500 m distance pyramid at 6k+0 through 6k+4.
    title: "Triple Point",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 2 },
        spm: 25,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 2 },
        spm: 25,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 15' at 6k+6 then 2×3' at 6k+0 — long steady block, sharp coda.
    title: "Inversion Layer",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 4,
      },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AT: 15' at 2k+14 then 2×4' at 6k+0 — the long piece prescribed off 2k.
    title: "Subsidence Inversion",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "2k", off: 14 },
        spm: 22,
        restMinutes: 4,
      },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 2,
      },
    ],
  },
  {
    // AT: four descending 2' sharpeners (6k-1 to 6k-4), then 12' at 6k+4.
    title: "Frontal Inversion",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -1 },
        spm: 25,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -2 },
        spm: 25,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -3 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -4 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 4 },
        spm: 23,
      },
    ],
  },
  {
    // AT: 2000 m / 6' / 1000 m / 3' — distance and clock alternating, pace
    // sharpening every piece from 6k+4 down to 6k-2.
    title: "Nocturnal Jet",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: -2 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 3×(4' at 6k+4 + 2' at 6k+0) — a hard second half to every set.
    title: "Barrier Jet",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 2,
      },
    ],
  },
  {
    // AT: 4×(3' at 6k+2 + 1' at 6k-3) — steady then a sting, four times over.
    title: "Coastal Jet",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: -3 },
        spm: 26,
        restMinutes: 2,
      },
    ],
  },
  {
    // AT: 12' / 1500 m / 4' descending, 6k+3 to 6k-1 — three ways to measure.
    title: "Katabatic Wind",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 3 },
        spm: 23,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "6k", off: 1 },
        spm: 25,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: -1 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 5000 m at 6k+8 then a single 3' at 6k-2 — a long haul with a kick.
    title: "Anabatic Wind",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 5000 },
        ref: { base: "6k", off: 8 },
        spm: 22,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: -2 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 10'/10'/5' negative split off 2k — 2k+13, +11, +9, all threshold.
    title: "Downslope Wind",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "2k", off: 13 },
        spm: 23,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "2k", off: 11 },
        spm: 24,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "2k", off: 9 },
        spm: 25,
      },
    ],
  },
  {
    // AT: 10' at 6k+5 then 4×90 s at 6k-2 — a short session with a fast tail.
    title: "Gap Wind",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 5 },
        spm: 22,
        restMinutes: 3,
      },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "6k", off: -2 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 20' at 6k+6 then 5' at 6k+0 — a long block and one hard rep after.
    title: "Channeled Wind",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 4×8' at 6k+3 with ~2.7:1 rest — 32' of threshold in one session.
    title: "Foehn",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 3 },
        spm: 23,
        restMinutes: 3,
      },
    ],
  },
  {
    // AT: 3×2500 m at 6k+5 with 4' rest — long distance reps, modest recovery.
    title: "Chinook",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2500 },
        ref: { base: "6k", off: 5 },
        spm: 23,
        restMinutes: 4,
      },
    ],
  },
  {
    // AT: 3'/7'/11'/15' ascending ladder — every rung longer and slower.
    title: "Zonda",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 7 },
        ref: { base: "6k", off: 1 },
        spm: 25,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 11 },
        ref: { base: "6k", off: 3 },
        spm: 23,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 5 },
        spm: 22,
      },
    ],
  },
  {
    // AT: 3000/2000/1000/500 m descending ladder, 6k+7 down to 6k-2.
    title: "Berg Wind",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 7 },
        spm: 22,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 1 },
        spm: 25,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: -2 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 4×8' with the pace stepping 6k+7 / +4 / +1 / -1 — a pure rate ladder.
    title: "Maestro",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 7 },
        spm: 22,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 1 },
        spm: 25,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: -1 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 5000 m / 2000 m / 4' — a long aerobic-threshold haul that keeps
    // accelerating; the last four minutes are faster than 6k pace.
    title: "Ostro",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 5000 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: -2 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 2000 m at 6k+6 then 3×500 m at 6k pace — a short, mean session.
    title: "Squall Line",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 3,
      },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AT: 30' continuous at 2k+11 — half an hour at the line, unbroken.
    title: "Jet Streak",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 30 },
        ref: { base: "2k", off: 11 },
        spm: 24,
      },
    ],
  },
  {
    // AT: 2×12' at 6k pace with 3:1 rest — the long threshold rep, undiluted.
    title: "Cyclogenesis",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 0 },
        spm: 25,
        restMinutes: 4,
      },
    ],
  },
  {
    // AT: 3×6' at 6k-1 with 2:1 rest — faster than 6k, six minutes at a time.
    title: "Frontogenesis",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 3,
      },
    ],
  },
  {
    // AT: 4×1000 m at 6k-2 with 2.5' rest — the top of the threshold band.
    title: "Vorticity Max",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: -2 },
        spm: 26,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AT: 8' at 6k+4, 8' at 6k+2, then 4×1' at 6k-3 — the tail is the point.
    title: "Cold Pool",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 3,
      },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: -3 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 2000 m at 6k+5, 2000 m at 6k+3, then 4' at 6k pace — descending.
    title: "Cold Core",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 5 },
        spm: 23,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 3×12' at 6k+1 with 4:1 rest — 36' of threshold on three short breaks.
    title: "Santa Ana",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 1 },
        spm: 25,
        restMinutes: 3,
      },
    ],
  },
  {
    // AT: 6×5' at 6k pace with 2:1 rest — six times to the line and back.
    title: "Diablo Wind",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AT: 12×2' at 6k-3 with 1.33:1 rest — the densest set in the block.
    title: "Bora",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -3 },
        spm: 26,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AT: 12'/10'/8'/5' descending ladder, 6k+5 down to 6k-1 — 35' of work.
    title: "Buran",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 5 },
        spm: 22,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 3 },
        spm: 23,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 1 },
        spm: 25,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: -1 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 4'/8'/12'/8'/4' pyramid — 36' of work with the peak in the middle.
    title: "Nor'wester",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 4 },
        spm: 22,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 20' at 2k+12 then 3×4' at 6k pace — a long piece, then three fast.
    title: "Barber",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "2k", off: 12 },
        spm: 23,
        restMinutes: 5,
      },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 2,
      },
    ],
  },
  {
    // AT: 4×(6' at 6k+3 + 2' at 6k-2) — 32' of work, half of it above pace.
    title: "Boreas",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -2 },
        spm: 26,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AT: 5×10' at 6k+4 with 3.33:1 rest — 50' of threshold in one sitting.
    title: "Polar Vortex",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 3,
      },
    ],
  },
  {
    // AT: 20'/16'/12'/8' descending ladder, 6k+6 down to 6k pace — 56' of work.
    title: "Subtropical Jet",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 16 },
        ref: { base: "6k", off: 4 },
        spm: 23,
        restMinutes: 5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 30' at 2k+13 then 4×5' at 6k+1 — the long block first, on purpose.
    title: "Warm Core",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 30 },
        ref: { base: "2k", off: 13 },
        spm: 22,
        restMinutes: 6,
      },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 1 },
        spm: 25,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AT: 8000 m at 6k+8 then 4×3' at 6k pace — a long session (71'), though
    // not the longest here (Subtropical Jet is 80'); the fast reps come
    // after the distance, not before it.
    title: "Split Front",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 8000 },
        ref: { base: "6k", off: 8 },
        spm: 22,
        restMinutes: 6,
      },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 2,
      },
    ],
  },
];
