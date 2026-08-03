import type { WorkoutInput } from "../../../domain/types.js";

// O2 (aerobic base) block of the generated library — 90 workouts,
// easy→hard. Authored in Task 7 against the pattern digest
// (app/domain/generation/patterns.json); ordering here IS the library
// browsing order within the type block.
export const O2_WORKOUTS: WorkoutInput[] = [
  // ------------------------------------------------------- easy / pain 1
  {
    // O2: 18' total — 12' continuous at 6k+15 — the shortest aerobic entry point.
    title: "Sea Fret",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 15 },
        spm: 18,
      },
    ],
  },
  {
    // O2: 12' continuous UT2 at 6k+15 — a conversational first steady piece.
    title: "Petrichor",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 15 },
        spm: 18,
      },
    ],
  },
  {
    // O2: 15' continuous at 6k+14 — smooth unbroken rowing, nothing to chase.
    title: "Laminar",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
    ],
  },
  {
    // O2: 18' continuous at 6k+13 — steady-state sit-time on a short clock.
    title: "Flat Calm",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 18 },
        ref: { base: "6k", off: 13 },
        spm: 19,
      },
    ],
  },
  {
    // O2: 4000 m continuous at 6k+12 — the same easy effort measured in metres.
    title: "Dead Calm",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 4000 },
        ref: { base: "6k", off: 12 },
        spm: 18,
      },
    ],
  },
  {
    // O2: 2×6' at 6k+12 with 2' rest — broken steady state for new aerobic legs.
    title: "Slack Tide",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 12 },
        spm: 19,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 25' continuous at 6k+14 — the default easy-day aerobic dose.
    title: "Horse Latitudes",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 25 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
    ],
  },
  {
    // O2: 22' continuous at 6k+15 — low and slow, rate pinned at 18.
    title: "Ground Fog",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 22 },
        ref: { base: "6k", off: 15 },
        spm: 18,
      },
    ],
  },

  // ------------------------------------------------------- easy / pain 2
  {
    // O2: 6'+6' at 6k+10 then 6k+6 — a short two-gear build, no rest between.
    title: "Haar",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 10 },
        spm: 19,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 6 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 4×4' at 6k+10 with 1:30 rest — short aerobic reps at a workable rate.
    title: "Slack Water",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 10 },
        spm: 20,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // O2: 8'/6'/4' descending ladder, 6k+14 → +8, rate climbing 18→21 as it shortens.
    title: "Millpond",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 11 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 8 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 4'/6'/8' ascending ladder at 6k+13 → +9 — longest piece last, fastest last.
    title: "Glassy Swell",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 13 },
        spm: 18,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 11 },
        spm: 19,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 9 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 10' at 6k+12, 2' off, 8' at 6k+9 — a long piece and a firmer tail.
    title: "Ground Swell",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 12 },
        spm: 19,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 9 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 3000 m at 6k+14 straight into 4' at 6k+9 — distance then a short lift.
    title: "Following Sea",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 9 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 28' continuous at 6k+13 — half an hour of unbroken UT2.
    title: "Radiation Fog",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 28 },
        ref: { base: "6k", off: 13 },
        spm: 19,
      },
    ],
  },
  {
    // O2: 30' continuous at 6k+12 — the standard weekday aerobic block.
    title: "Advection Fog",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 30 },
        ref: { base: "6k", off: 12 },
        spm: 19,
      },
    ],
  },
  {
    // O2: 7500 m continuous at 6k+13 — distance-framed steady state, rate 18.
    title: "Valley Fog",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "distance", meters: 7500 },
        ref: { base: "6k", off: 13 },
        spm: 18,
      },
    ],
  },
  {
    // O2: 6000 m continuous at 6k+11 — a touch firmer than base, still all aerobic.
    title: "Tule Fog",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 6000 },
        ref: { base: "6k", off: 11 },
        spm: 19,
      },
    ],
  },
  {
    // O2: 24' continuous at 6k+10 — top-of-UT2 steady state at rate 20.
    title: "Ice Fog",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 24 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 5500 m continuous held off 2k+14 — the same easy split, read from race pace.
    title: "Freezing Fog",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 5500 },
        ref: { base: "2k", off: 14 },
        spm: 19,
      },
    ],
  },
  {
    // O2: 2×12' at 6k+12 with 3' rest — broken steady state, generous break.
    title: "Hoarfrost",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 12 },
        spm: 19,
        restMinutes: 3,
      },
    ],
  },
  {
    // O2: 3×8' at 6k+11 with 2' rest — the same volume cut three ways.
    title: "Rime Ice",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 11 },
        spm: 19,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 6'/8'/10' unbroken ladder, 6k+14 → +10, rate 18→20 — a slow warming.
    title: "Corona",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 12 },
        spm: 19,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 15' + 12' at 6k+15 then 6k+13 with 3' between — long, low, barely stepped.
    title: "Moonbow",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 15 },
        spm: 18,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 13 },
        spm: 18,
      },
    ],
  },
  {
    // O2: 40' continuous at 6k+14 — long, easy, unbroken; rate never leaves 18.
    title: "Fine Weather",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 40 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
    ],
  },
  {
    // O2: 38' continuous at 6k+15 off a 12' warm-up — the gentlest long piece here.
    title: "Fair Weather",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 38 },
        ref: { base: "6k", off: 15 },
        spm: 18,
      },
    ],
  },

  // ----------------------------------------------------- medium / pain 2
  {
    // O2: 2×1750 m at 6k+13 with 1:30 rest — an odd distance, deliberately.
    title: "Light Air",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1750 },
        ref: { base: "6k", off: 13 },
        spm: 19,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // O2: 10' at 6k+8, 3' off, 6' at 6k+5 — upper-aerobic work on a short clock.
    title: "Light Breeze",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 8 },
        spm: 20,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 5 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 4×3' at 6k+7 with 1' rest — brisk aerobic touches, short recovery.
    title: "Gentle Breeze",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 7 },
        spm: 21,
        restMinutes: 1,
      },
    ],
  },
  {
    // O2: 3×6' unbroken at 6k+12 / +9 / +6, rate 18→22 — one gear per piece.
    title: "Moderate Breeze",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 12 },
        spm: 18,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 9 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 6 },
        spm: 22,
      },
    ],
  },
  {
    // O2: 26' continuous at 6k+9 — sustained UT1, the honest half-hour.
    title: "Pogonip",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 26 },
        ref: { base: "6k", off: 9 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 32' continuous at 6k+8 — the top of the aerobic band, held a long time.
    title: "Diamond Dust",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 32 },
        ref: { base: "6k", off: 8 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 4×5' at 6k+10 with 1:30 rest — a tight work:rest ratio for a base session.
    title: "Silver Thaw",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 10 },
        spm: 20,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // O2: 3×2000 m at 6k+12 with 1:30 rest — aerobic distance reps, barely broken.
    title: "Sun Dog",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 12 },
        spm: 19,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // O2: 2×2500 m at 6k+10 with 3' rest — two long halves, full reset between.
    title: "Moon Halo",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2500 },
        ref: { base: "6k", off: 10 },
        spm: 20,
        restMinutes: 3,
      },
    ],
  },
  {
    // O2: 12'/9'/6' descending at 6k+13 → +7 — shorter and faster each time.
    title: "Alpenglow",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 13 },
        spm: 18,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 7 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 1000/2000/3000 m ladder at 6k+14 → +10 — longer and faster together.
    title: "Green Flash",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 12 },
        spm: 19,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 4'/8'/12' ladder at 6k+12 → +8 with 1' snaps between — a slow negative split.
    title: "Afterglow",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 12 },
        spm: 18,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 10 },
        spm: 19,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 8 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 1000/2000/1000 m pyramid at 6k+12 → +10 → +8 with 2' breaks — up and back down.
    title: "Airglow",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 12 },
        spm: 18,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 10 },
        spm: 20,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 8 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 10'/10'/8' at 6k+14 → +11 → +9 with 2' rests — three gears, one session.
    title: "Fog Bow",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 11 },
        spm: 19,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 9 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 2×(8' at 6k+13 + 4' at 6k+10), 2' between everything — a repeated two-gear set.
    title: "Sun Pillar",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 13 },
        spm: 18,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 10 },
        spm: 20,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 20' at 6k+12, 3' off, 8' at 6k+9 — a long body and a firm finish.
    title: "Light Pillar",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "6k", off: 12 },
        spm: 19,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 9 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 5000 m at 6k+13, 3' off, 1500 m at 6k+9 — a long haul then a short push.
    title: "Indian Summer",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 5000 },
        ref: { base: "6k", off: 13 },
        spm: 18,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "6k", off: 9 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 4×(4' at 6k+9 + 2' at 6k+13), 1' rests — alternating firm and float.
    title: "Hazy Sunshine",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 9 },
        spm: 20,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 13 },
        spm: 18,
        restMinutes: 1,
      },
    ],
  },
  {
    // O2: 45' continuous at 6k+12 — three quarters of an hour, one split.
    title: "Etesian",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 45 },
        ref: { base: "6k", off: 12 },
        spm: 19,
      },
    ],
  },
  {
    // O2: 10,000 m continuous at 6k+13 — the round-number aerobic distance.
    title: "Meltemi",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 10000 },
        ref: { base: "6k", off: 13 },
        spm: 19,
      },
    ],
  },
  {
    // O2: 3×12' at 6k+12 with 3' rest — a big aerobic block cut into thirds.
    title: "Embat",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 12 },
        spm: 19,
        restMinutes: 3,
      },
    ],
  },
  {
    // O2: 2×18' at 6k+11 with 4' rest — long halves, sit-time the point of it.
    title: "Puelche",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 18 },
        ref: { base: "6k", off: 11 },
        spm: 19,
        restMinutes: 4,
      },
    ],
  },
  {
    // O2: 25' at 6k+13, 4' off, 15' at 6k+10 — a big base piece with a firmer second half.
    title: "Favonius",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 25 },
        ref: { base: "6k", off: 13 },
        spm: 18,
      },
      { k: "r", minutes: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 55' continuous at 6k+16 — an hour's worth of the easiest split in the block.
    title: "Cirrocumulus",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 55 },
        ref: { base: "6k", off: 16 },
        spm: 18,
      },
    ],
  },
  {
    // O2: 60' continuous at 6k+14 — the hour piece, rate 18, nothing clever.
    title: "Altocumulus",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 60 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
    ],
  },
  {
    // O2: 2×30' at 6k+14 then 6k+11 with 5' between — the hour, split and stepped.
    title: "Snow Grains",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 30 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
      { k: "r", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 30 },
        ref: { base: "6k", off: 11 },
        spm: 19,
      },
    ],
  },

  // ----------------------------------------------------- medium / pain 3
  {
    // O2: 4×6' at 6k+8 with 2' rest — upper-aerobic reps that add up.
    title: "Halo Ring",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 8 },
        spm: 21,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 12'/10'/6' descending at 6k+11 → +7 with 2' rests — each piece costs more.
    title: "Crepuscular Rays",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 11 },
        spm: 19,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 9 },
        spm: 20,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 7 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 4/6/8/6/4' pyramid at 6k+12 → +8 → +12, unbroken — one continuous arc.
    title: "Zodiacal Light",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 12 },
        spm: 18,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 10 },
        spm: 19,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 8 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 10 },
        spm: 19,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 12 },
        spm: 18,
      },
    ],
  },
  {
    // O2: 3000/2000/1000 m at 6k+12 → +9 → +6, rests shrinking 3'/2' — a cutdown.
    title: "Rainbow",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 12 },
        spm: 18,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 9 },
        spm: 20,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 6 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 3×(5' at 6k+11 + 3' at 6k+8), short rests — a repeating firm-firmer couplet.
    title: "Double Rainbow",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 11 },
        spm: 19,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 8 },
        spm: 21,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // O2: 12'/12'/4' held off 2k+16 → +11 — aerobic work read from race pace instead.
    title: "Mirage",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "2k", off: 16 },
        spm: 18,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "2k", off: 13 },
        spm: 19,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 11 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 22' at 6k+11, 3' off, 6' at 6k+6 — a long body with a genuinely hard tail.
    title: "Fata Morgana",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 22 },
        ref: { base: "6k", off: 11 },
        spm: 19,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 6 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 2×(2000 m at 6k+11 + 1000 m at 6k+8) with 2'/1' rests — distance couplets.
    title: "Heat Haze",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 11 },
        spm: 19,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 8 },
        spm: 21,
        restMinutes: 1,
      },
    ],
  },
  {
    // O2: 10'/6'/8'/5' at scrambled offsets, 1' rests — deliberately uneven pacing practice.
    title: "Shimmer",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 13 },
        spm: 18,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 10 },
        spm: 20,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 11 },
        spm: 19,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 8 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 13'/10'/5' at 6k+12 → +8 with 2' rests — a compressing negative split.
    title: "Golden Hour",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 13 },
        ref: { base: "6k", off: 12 },
        spm: 19,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 8 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 42' continuous at 6k+10 — long and firm; the split never lets up.
    title: "Imbat",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 42 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 10'/14'/18' unbroken ladder at 6k+15 → +10 — the hardest piece is the longest.
    title: "Terral",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 15 },
        spm: 18,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 14 },
        ref: { base: "6k", off: 12 },
        spm: 19,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 18 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 18'/12'/6' at 6k+13 → +7 with 2' rests — halving pieces, rising rate.
    title: "Virazon",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 18 },
        ref: { base: "6k", off: 13 },
        spm: 18,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 10 },
        spm: 20,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 7 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 2000/3000/4000 m at 6k+14 → +10 with 2' rests — nine kilometres, ascending.
    title: "Cape Doctor",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 14 },
        spm: 18,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 12 },
        spm: 19,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 4000 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 16'/12'/8' at 6k+14 → +8 with 3' rests — a long descending ladder, hot at the end.
    title: "Harmattan",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 16 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 11 },
        spm: 19,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 8 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 7000 m at 6k+14, 4' off, 2000 m at 6k+9 — a long grind and a hard closer.
    title: "Ponente",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 7000 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
      { k: "r", minutes: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 9 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 2×(10' at 6k+12 + 6' at 6k+9), 2'/3' rests — two long couplets, thirty-two minutes on.
    title: "Stratus",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 12 },
        spm: 19,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 9 },
        spm: 21,
        restMinutes: 3,
      },
    ],
  },
  {
    // O2: 3×(8' at 6k+11 + 4' at 6k+8), tight rests — thirty-six minutes of work, no long break.
    title: "Nimbostratus",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 11 },
        spm: 19,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 8 },
        spm: 21,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // O2: 20' at 6k+12, 5' light paddle, 20' at 6k+10 — the float is prescribed as effort, not a split.
    title: "Altostratus",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "6k", off: 12 },
        spm: 19,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { effort: "min" },
        spm: 18,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 3×12' off 2k+18 → +12 with 2' rests — thirty-six minutes measured from race pace.
    title: "Cirrostratus",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "2k", off: 18 },
        spm: 18,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "2k", off: 15 },
        spm: 19,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "2k", off: 12 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 6000 m at 6k+12, 3' off, 3000 m at 6k+9 — nine kilometres in two unequal halves.
    title: "Cirrus",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 6000 },
        ref: { base: "6k", off: 12 },
        spm: 19,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 9 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 70' continuous at 6k+15 — the long slow distance session, rate 18 throughout.
    title: "Stratocumulus",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 70 },
        ref: { base: "6k", off: 15 },
        spm: 18,
      },
    ],
  },
  {
    // O2: 15,000 m continuous at 6k+12 — a serious distance sit at a firm base split.
    title: "Fair Wind",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 15000 },
        ref: { base: "6k", off: 12 },
        spm: 19,
      },
    ],
  },
  {
    // O2: half marathon — 21,097 m continuous at 6k+14, rate 18. Patience, not power.
    title: "Calm Sea",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 21097 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
    ],
  },
  {
    // O2: 75' continuous at 6k+13 — an hour and a quarter without a break.
    title: "Glass Sea",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 75 },
        ref: { base: "6k", off: 13 },
        spm: 19,
      },
    ],
  },
  {
    // O2: 4×3000 m at 6k+12 with 3' rest — twelve kilometres of aerobic distance reps.
    title: "Morning Mist",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 12 },
        spm: 19,
        restMinutes: 3,
      },
    ],
  },
  {
    // O2: 6×2000 m at 6k+10 with 2' rest — twelve kilometres, short rests, firm split.
    title: "Evening Mist",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 10 },
        spm: 20,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 8×1500 m at 6k+8 with 1:30 rest — the highest rep count here, barely any recovery.
    title: "Dawn Fog",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "6k", off: 8 },
        spm: 21,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // O2: 20'/16'/12'/8' at 6k+15 → +6 with 3' rests — fifty-six minutes of work, descending.
    title: "River Fog",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "6k", off: 15 },
        spm: 18,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 16 },
        ref: { base: "6k", off: 12 },
        spm: 19,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 9 },
        spm: 20,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 6 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 3000/4000/5000 m at 6k+16 → +10 with 3' rests — twelve kilometres, getting faster.
    title: "Steam Fog",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 16 },
        spm: 18,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 4000 },
        ref: { base: "6k", off: 13 },
        spm: 19,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 5000 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 10'/15'/20' unbroken at 6k+16 → +10, then 3' off and 10' at 6k+7 — ladder plus sting.
    title: "Sea Smoke",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 16 },
        spm: 18,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 13 },
        spm: 19,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 7 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 3×(15' at 6k+12 + 5' at 6k+9) with 3'/2' rests — an hour of work in three long sets.
    title: "Frost Flower",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 12 },
        spm: 19,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 9 },
        spm: 21,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 10,000 m at 6k+13, 5' off, 5000 m at 6k+10 — fifteen kilometres, negative split.
    title: "Graupel",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 10000 },
        ref: { base: "6k", off: 13 },
        spm: 19,
      },
      { k: "r", minutes: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 5000 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 5×(10' at 6k+11 + 2' light paddle) — fifty minutes on with the float prescribed as effort.
    title: "Sleet",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 11 },
        spm: 19,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { effort: "min" },
        spm: 18,
      },
    ],
  },
  {
    // O2: 20'/20'/15' off 2k+15 → +10 with 4' rests — a long session read from race pace.
    title: "Virga",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "2k", off: 15 },
        spm: 19,
      },
      { k: "r", minutes: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "2k", off: 12 },
        spm: 20,
      },
      { k: "r", minutes: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "2k", off: 10 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 45' at 6k+15, 5' off, 5000 m at 6k+11 — time then distance, the second half firmer.
    title: "Soft Rain",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 45 },
        ref: { base: "6k", off: 15 },
        spm: 18,
      },
      { k: "r", minutes: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 5000 },
        ref: { base: "6k", off: 11 },
        spm: 19,
      },
    ],
  },
  {
    // O2: 3×(12' at 6k+13 + 2000 m at 6k+10) with 2'/3' rests — the biggest mixed set in the block.
    title: "Summer Shower",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 13 },
        spm: 18,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 10 },
        spm: 20,
        restMinutes: 3,
      },
    ],
  },
  {
    // O2: 25'/25'/15' at 6k+14 → +8 with 4' rests — sixty-five minutes of work, hardest last.
    title: "April Shower",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 25 },
        ref: { base: "6k", off: 14 },
        spm: 18,
      },
      { k: "r", minutes: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 25 },
        ref: { base: "6k", off: 11 },
        spm: 19,
      },
      { k: "r", minutes: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 8 },
        spm: 21,
      },
    ],
  },
];
