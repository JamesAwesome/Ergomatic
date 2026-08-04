import type { WorkoutInput } from "../../../domain/types.js";

// O2 (aerobic base) block of the generated library — 90 workouts,
// easy→hard. Rewritten after James's content review: variety comes from
// structure (interval sets, pyramids, ladders, rate-change pieces), not
// ±1' tweaks; continuous singles are held to the genuinely long rows.
// Conventions: 6k-base pace only, steady work at 6k+6..+16 with brief
// tempo touches down to 6k+4; spm 22 is the mode with 20–24 the steady
// range, 18 only as a ladder's bottom rung and 26 only as a ladder's
// top; time-computable totals end in 0 or 5. Ordering here IS the
// library browsing order within the type block.
export const O2_WORKOUTS: WorkoutInput[] = [
  // ------------------------------------------------------- easy / pain 1
  {
    // O2: 2×4' at 6k+14 with 1' rest — eight easy minutes, already broken.
    title: "Sea Fret",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 14 },
        spm: 22,
        restMinutes: 1,
      },
    ],
  },
  {
    // O2: rate change — 3×3' at 6k+12, spm 20→22→24, 30 s between rungs.
    title: "Petrichor",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 12 },
        spm: 20,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 12 },
        spm: 22,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 12 },
        spm: 24,
      },
    ],
  },
  {
    // O2: rate change — 3×1000 m unbroken at 6k+12, spm 20→22→24.
    title: "Laminar",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 12 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 12 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 12 },
        spm: 24,
      },
    ],
  },
  {
    // O2: 3×1200 m at 6k+10 with 1' rest — easy distance reps, barely broken.
    title: "Dead Calm",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1200 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 1,
      },
    ],
  },
  {
    // O2: 5×3' at 6k+12 with 1' rest — short aerobic reps, plenty of resets.
    title: "Slack Tide",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 12 },
        spm: 22,
        restMinutes: 1,
      },
    ],
  },
  {
    // O2: 2'-3'-4'-3'-2' pyramid at 6k+12 with 1' rests — a small first pyramid.
    title: "Millpond",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 7 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 12 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 12 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 12 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 12 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 12 },
        spm: 22,
      },
    ],
  },
  {
    // O2: rate change — 10' at spm 20 then 10' at spm 22, same 6k+13 pace throughout.
    title: "Flat Calm",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 13 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 13 },
        spm: 22,
      },
    ],
  },
  {
    // O2: 2×10' at 6k+13 with 1' rest — broken steady state for new aerobic legs.
    title: "Horse Latitudes",
    type: "O2",
    difficulty: "easy",
    pain: 1,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 13 },
        spm: 21,
        restMinutes: 1,
      },
    ],
  },

  // ------------------------------------------------------- easy / pain 2
  {
    // O2: rate change — 4×4' ladder at 6k+12, spm 18→20→22→24, unbroken.
    title: "Haar",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 12 },
        spm: 18,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 12 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 12 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 12 },
        spm: 24,
      },
    ],
  },
  {
    // O2: 4×4' at 6k+10 with 1' rest, the rate climbing 21→24 — same pace, more life each rep.
    title: "Slack Water",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 10 },
        spm: 21,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 10 },
        spm: 23,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 10 },
        spm: 24,
      },
    ],
  },
  {
    // O2: 2000/1000/500 m cutdown, 6k+12 → +8, rests 2'/1:30 — shorter and quicker.
    title: "Glassy Swell",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 12 },
        spm: 20,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 8 },
        spm: 23,
      },
    ],
  },
  {
    // O2: 6×2' at 6k+8 with 1' rest — brisk touches, never long enough to hurt.
    title: "Ground Swell",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 7 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 8 },
        spm: 23,
        restMinutes: 1,
      },
    ],
  },
  {
    // O2: 4'-6'-8'-6'-4' pyramid squeezing 6k+14 → +10 with 1' rests — the middle is the test.
    title: "Ground Fog",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 14 },
        spm: 21,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 12 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 12 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 14 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 3×6' at 6k+10 with 4' rest — the classic C2 shape, full recovery.
    title: "Following Sea",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 4,
      },
    ],
  },
  {
    // O2: 4×4' at 6k+10 with 2' rest — the C2 four-by-four at an aerobic pace.
    title: "Radiation Fog",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: rate change — 30' unbroken wave at 6k+12, 6' blocks at spm 22/24/22/24/22.
    title: "Advection Fog",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 12 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 12 },
        spm: 24,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 12 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 12 },
        spm: 24,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 12 },
        spm: 22,
      },
    ],
  },
  {
    // O2: 2×3000 m at 6k+10 with 3' rest — two long halves, full reset between.
    title: "Valley Fog",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 10 },
        spm: 21,
        restMinutes: 3,
      },
    ],
  },
  {
    // O2: 6'/9'/12' ascending ladder, 6k+14 → +10, 1:30 rests — longest piece last.
    title: "Tule Fog",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 14 },
        spm: 20,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 12 },
        spm: 21,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
    ],
  },
  {
    // O2: 12'/9'/6'/3' descending ladder, 6k+14 → +8, rests shrinking 1:30/1:00/0:30.
    title: "Ice Fog",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 7 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 14 },
        spm: 20,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 12 },
        spm: 21,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 8 },
        spm: 23,
      },
    ],
  },
  {
    // O2: 3×8' at 6k+12 with 3' rest — steady volume cut into thirds.
    title: "Freezing Fog",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 7 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 12 },
        spm: 22,
        restMinutes: 3,
      },
    ],
  },
  {
    // O2: 2×12' at 6k+12 with 5' rest — long halves and a genuinely lazy break.
    title: "Hoarfrost",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 12 },
        spm: 22,
        restMinutes: 5,
      },
    ],
  },
  {
    // O2: 8×3' at 6k+10 with 1' rest — many small bites of the same steady pace.
    title: "Rime Ice",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 1,
      },
    ],
  },
  {
    // O2: 1000/2000/1000 m pyramid, 6k+12 → +10 → +8, 2' rests — up and back down.
    title: "Corona",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 12 },
        spm: 21,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 8 },
        spm: 23,
      },
    ],
  },
  {
    // O2: 15' at 6k+13, 3' off, 12' at 6k+11 — two long pieces, barely stepped.
    title: "Moonbow",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 13 },
        spm: 21,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 11 },
        spm: 22,
      },
    ],
  },
  {
    // O2: 40' continuous at 6k+14 — the first genuinely long unbroken row here.
    title: "Fine Weather",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 40 },
        ref: { base: "6k", off: 14 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 2×18' at 6k+13 with 2' rest — sit-time split just once.
    title: "Fair Weather",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 18 },
        ref: { base: "6k", off: 13 },
        spm: 21,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: rate change — 4×(5' at spm 22 + 5' at spm 24) unbroken, 6k+13 throughout.
    title: "Moon Halo",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 13 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 13 },
        spm: 24,
      },
    ],
  },
  {
    // O2: 3×12' at 6k+13 with 2' rest — a big aerobic block in three sittings.
    title: "Alpenglow",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 13 },
        spm: 21,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 10,000 m continuous at 6k+12 — the round-number distance, one sitting.
    title: "Calm Sea",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "distance", meters: 10000 },
        ref: { base: "6k", off: 12 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 60' continuous at 6k+15 — the hour, kept honest by nothing but patience.
    title: "Glass Sea",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 60 },
        ref: { base: "6k", off: 15 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 30' at 6k+14, 5' light paddle, 25' at 6k+11 — an hour with a soft hinge.
    title: "Fog Bow",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 30 },
        ref: { base: "6k", off: 14 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { effort: "min" },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 25 },
        ref: { base: "6k", off: 11 },
        spm: 22,
      },
    ],
  },
  {
    // O2: 70' continuous at 6k+16 — the longest easy row in the block. Just sit.
    title: "Fair Wind",
    type: "O2",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 70 },
        ref: { base: "6k", off: 16 },
        spm: 20,
      },
    ],
  },

  // ----------------------------------------------------- medium / pain 2
  {
    // O2: 4×(2' firm at 6k+6 + 2' float at 6k+12) unbroken — pace waves, no rest.
    title: "Light Air",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 4 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 6 },
        spm: 23,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 12 },
        spm: 20,
      },
    ],
  },
  {
    // O2: rate change — 4×3' build at 6k+8, spm 20→22→24→26, unbroken.
    title: "Light Breeze",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 8 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 8 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 8 },
        spm: 24,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 8 },
        spm: 26,
      },
    ],
  },
  {
    // O2: 500-1000-1500-1000-500 m pyramid at 6k+8, 30 s rests — distance up and down.
    title: "Gentle Breeze",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 8 },
        spm: 22,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 8 },
        spm: 22,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "6k", off: 8 },
        spm: 22,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 8 },
        spm: 22,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 8 },
        spm: 22,
      },
    ],
  },
  {
    // O2: 8×1:30 at 6k+4 with 1' rest — brief tempo touches, never sustained.
    title: "Moderate Breeze",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "6k", off: 4 },
        spm: 24,
        restMinutes: 1,
      },
    ],
  },
  {
    // O2: 2000 m at 6k+8, 2' off, 2000 m at 6k+6 — a negative-split pair.
    title: "Sun Dog",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 8 },
        spm: 22,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 6 },
        spm: 23,
      },
    ],
  },
  {
    // O2: 12' at 6k+8, 2' off, 6' at 6k+6 — a firm body and a firmer tail.
    title: "Pogonip",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 8 },
        spm: 22,
      },
      { k: "r", minutes: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 6 },
        spm: 23,
      },
    ],
  },
  {
    // O2: rate change — 3×8' ladder at 6k+10, spm 22→24→26, unbroken.
    title: "Diamond Dust",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 10 },
        spm: 24,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 10 },
        spm: 26,
      },
    ],
  },
  {
    // O2: 2000/1500/1000/500 m cutdown, 6k+10 → +4, rests 2'/1:30/1' — a fast finish.
    title: "Silver Thaw",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 10 },
        spm: 21,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "6k", off: 8 },
        spm: 22,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 6 },
        spm: 23,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 4 },
        spm: 24,
      },
    ],
  },
  {
    // O2: rate change — 3×(6' at spm 22 + 4' at spm 24) unbroken, 6k+10 throughout —
    // the lift comes late in each third.
    title: "Green Flash",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 10 },
        spm: 24,
      },
    ],
  },
  {
    // O2: 3'-4'-5'-4'-3' pyramid at 6k+8 with 1:30 rests — firmer than it reads.
    title: "Afterglow",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 8 },
        spm: 22,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 8 },
        spm: 22,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 8 },
        spm: 22,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 8 },
        spm: 22,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 8 },
        spm: 22,
      },
    ],
  },
  {
    // O2: 3×2000 m at 6k+8 with 2' rest — firm distance reps, short breaks.
    title: "Airglow",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 8 },
        spm: 22,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 18' at 6k+10, 3' off, 9' at 6k+6 — long body, tempo close.
    title: "Sun Pillar",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 18 },
        ref: { base: "6k", off: 10 },
        spm: 21,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 6 },
        spm: 23,
      },
    ],
  },
  {
    // O2: rate change — 6×(2' at spm 22 + 2' at spm 24) at 6k+9 with 1' rest per set.
    title: "Light Pillar",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 9 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 9 },
        spm: 24,
        restMinutes: 1,
      },
    ],
  },
  {
    // O2: rate change — 10'/8'/6'/4' at 6k+10, spm 20→22→24→26 as pieces shrink.
    title: "Indian Summer",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 10 },
        spm: 24,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 10 },
        spm: 26,
      },
    ],
  },
  {
    // O2: 5000 m at 6k+12, 3' off, 3000 m at 6k+8 — a long haul then a firm half.
    title: "Hazy Sunshine",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 5000 },
        ref: { base: "6k", off: 12 },
        spm: 21,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 8 },
        spm: 22,
      },
    ],
  },
  {
    // O2: 6×4' at 6k+9 with 1' rest — a tight work:rest ratio, all business.
    title: "Etesian",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 9 },
        spm: 22,
        restMinutes: 1,
      },
    ],
  },
  {
    // O2: rate-and-length pyramid — 4'/6'/10'/6'/4' at 6k+12, spm 20/22/24/22/20 —
    // the middle is both longest and liveliest.
    title: "Meltemi",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 12 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 12 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 12 },
        spm: 24,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 12 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 12 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 4×1500 m at 6k+6 with 1' rest — quick distance reps, minimal recovery.
    title: "Embat",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1500 },
        ref: { base: "6k", off: 6 },
        spm: 23,
        restMinutes: 1,
      },
    ],
  },
  {
    // O2: 5×(1000 m firm at 6k+8 + 500 m float at 6k+14) unbroken — distance waves.
    title: "Puelche",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 8 },
        spm: 23,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 14 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 10' at 6k+8 first, 3' off, then 22' settled at 6k+13 — tempo before volume.
    title: "Favonius",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 8 },
        spm: 23,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 22 },
        ref: { base: "6k", off: 13 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 4×8' at 6k+10 with 2' rest — a solid aerobic block in four pieces.
    title: "Cirrocumulus",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: rate change — 4×2000 m at 6k+10, spm 22 then 24 per 1000 m, 3' rest.
    title: "Altocumulus",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 10 },
        spm: 24,
        restMinutes: 3,
      },
    ],
  },
  {
    // O2: 2×20' at 6k+12 with 2:30 rest — forty minutes of work, one break.
    title: "Snow Grains",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "6k", off: 12 },
        spm: 21,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // O2: 5×6' at 6k+9 with 2' rest — half an hour on, cut five ways.
    title: "Cirrus",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 9 },
        spm: 22,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 3×3000 m at 6k+12 with 2' rest — nine kilometres of steady reps.
    title: "Cirrostratus",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 12 },
        spm: 21,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 15'/12'/9'/6' descending, 6k+14 → +8, rests shrinking 2:30/1:30/1:00.
    title: "Stratus",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 14 },
        spm: 20,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 12 },
        spm: 21,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 8 },
        spm: 23,
      },
    ],
  },
  {
    // O2: 50' continuous at 6k+11 — long, even, and a shade firmer than it looks.
    title: "Altostratus",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 50 },
        ref: { base: "6k", off: 11 },
        spm: 22,
      },
    ],
  },
  {
    // O2: 35' at 6k+13, 4' off, 15' at 6k+9 — one big body, one firm coda.
    title: "Nimbostratus",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 35 },
        ref: { base: "6k", off: 13 },
        spm: 21,
      },
      { k: "r", minutes: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 9 },
        spm: 22,
      },
    ],
  },
  {
    // O2: rate change — 3×(8' at spm 22 + 8' at spm 24) at 6k+11 with 2' rest per set.
    title: "Stratocumulus",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 11 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 11 },
        spm: 24,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 15,000 m continuous at 6k+14 — a serious distance sit, nothing clever.
    title: "Morning Mist",
    type: "O2",
    difficulty: "medium",
    pain: 2,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 15000 },
        ref: { base: "6k", off: 14 },
        spm: 20,
      },
    ],
  },

  // ----------------------------------------------------- medium / pain 3
  {
    // O2: 8'/6'/4'/2' cutdown, 6k+12 → +4, rests 2'/2'/1' — every rung sharper.
    title: "Halo Ring",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 12 },
        spm: 21,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 9 },
        spm: 22,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 6 },
        spm: 23,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 4 },
        spm: 24,
      },
    ],
  },
  {
    // O2: 12×1' at 6k+4 with 1' rest — tempo in the smallest possible doses.
    title: "Crepuscular Rays",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 12 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: 4 },
        spm: 24,
        restMinutes: 1,
      },
    ],
  },
  {
    // O2: 12'/8'/4' cutdown, 6k+12 → +6, rests 3'/2' — halving pieces, rising cost.
    title: "Zodiacal Light",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 12 },
        spm: 21,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 8 },
        spm: 22,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 6 },
        spm: 24,
      },
    ],
  },
  {
    // O2: 10'/10'/8' stepping 6k+12 → +9 → +6 with 1' breathers — barely broken.
    title: "Rainbow",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 12 },
        spm: 21,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 9 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 6 },
        spm: 23,
      },
    ],
  },
  {
    // O2: 5×1000 m at 6k+6 with 2' rest — quick kilometres, honest recovery.
    title: "Double Rainbow",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 6 },
        spm: 23,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: rate change — 5×6' full ladder at 6k+10, spm 18→20→22→24→26, unbroken.
    title: "Mirage",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 10 },
        spm: 18,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 10 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 10 },
        spm: 24,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 10 },
        spm: 26,
      },
    ],
  },
  {
    // O2: 2×(2000 m at 6k+10 + 1000 m at 6k+6), 2' rests — distance couplets.
    title: "Heat Haze",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 6 },
        spm: 23,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 15' at 6k+11, 5' light paddle, 15' at 6k+9 — the float is effort, not a split.
    title: "Fata Morgana",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 11 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { effort: "min" },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 9 },
        spm: 22,
      },
    ],
  },
  {
    // O2: 5×6' at 6k+8 with shrinking rests 4'/3'/2'/1' — recovery quietly disappears.
    title: "Shimmer",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 8 },
        spm: 23,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 8 },
        spm: 23,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 8 },
        spm: 23,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 8 },
        spm: 23,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 8 },
        spm: 23,
      },
    ],
  },
  {
    // O2: 2×(2'-3'-4'-3'-2' pyramid) at 6k+8, 2' rests throughout — the second climb costs.
    title: "Golden Hour",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 7 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 8 },
        spm: 23,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 8 },
        spm: 23,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 8 },
        spm: 23,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 8 },
        spm: 23,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 8 },
        spm: 23,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 1000/2000/3000/2000/1000 m pyramid at 6k+10 with 1' rests — nine km, peaked.
    title: "Imbat",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
    ],
  },
  {
    // O2: rate change — 40' as 10×(2' at spm 22 + 2' at spm 24), 6k+10, unbroken.
    title: "Terral",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 10 },
        spm: 24,
      },
    ],
  },
  {
    // O2: 15'/15'/9' stepping 6k+12 → +10 → +7 with 3' rests — a tempo close at the end.
    title: "Virazon",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 12 },
        spm: 21,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
      { k: "r", minutes: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 7 },
        spm: 23,
      },
    ],
  },
  {
    // O2: 4×2500 m at 6k+10 with 2' rest — ten kilometres in awkward-length pieces.
    title: "Cape Doctor",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2500 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: rate change — 3×14' at 6k+12, spm 20→22→24, unbroken — a long slow build.
    title: "Harmattan",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 14 },
        ref: { base: "6k", off: 12 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 14 },
        ref: { base: "6k", off: 12 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 14 },
        ref: { base: "6k", off: 12 },
        spm: 24,
      },
    ],
  },
  {
    // O2: 5'-10'-15'-10'-5' pyramid at 6k+10 with 2' rests — the quarter-hour is the summit.
    title: "Ponente",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 7 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
    ],
  },
  {
    // O2: rate change — 6×2000 m at 6k+10, spm alternating 22/24 per 500 m, 2' rest.
    title: "Sea Smoke",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 10 },
        spm: 24,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 10 },
        spm: 24,
        restMinutes: 2,
      },
    ],
  },
  {
    // O2: 55' continuous at 6k+10 — the firm hour; the split never lets up.
    title: "Evening Mist",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 55 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
    ],
  },
  {
    // O2: 4×12' at 6k+10 with 3' rest — nearly an hour of work, honest breaks.
    title: "Dawn Fog",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 3,
      },
    ],
  },
  {
    // O2: 2×10,000 m at 6k+10 with 6' rest — the C2 monster; bring a plan and a bottle.
    title: "River Fog",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "distance", meters: 10000 },
        ref: { base: "6k", off: 10 },
        spm: 21,
        restMinutes: 6,
      },
    ],
  },
  {
    // O2: rate change — 60' as 10×(3' at spm 22 + 3' at spm 24), 6k+11, unbroken.
    title: "Steam Fog",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      { k: "reps", count: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 11 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 11 },
        spm: 24,
      },
    ],
  },
  {
    // O2: 3×20' at 6k+12 with 3' rest — the classic hour of steady state, in thirds.
    title: "Frost Flower",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "6k", off: 12 },
        spm: 21,
        restMinutes: 3,
      },
    ],
  },
  {
    // O2: half marathon — 21,097 m continuous at 6k+14. Patience, not power.
    title: "Graupel",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 21097 },
        ref: { base: "6k", off: 14 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 65' continuous at 6k+12 — past the hour without a break.
    title: "Sleet",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 65 },
        ref: { base: "6k", off: 12 },
        spm: 21,
      },
    ],
  },
  {
    // O2: 10'-15'-20'-15'-10' pyramid, unbroken, 6k+14 → +10 → +14 — seventy minutes, one arc.
    title: "Virga",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 14 },
        spm: 20,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 12 },
        spm: 21,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "6k", off: 10 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 12 },
        spm: 21,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 14 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 3×5000 m at 6k+12 with 4' rest — fifteen kilometres in long thirds.
    title: "Soft Rain",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 6 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 5000 },
        ref: { base: "6k", off: 12 },
        spm: 21,
        restMinutes: 4,
      },
    ],
  },
  {
    // O2: 6×(9' firm at 6k+9 + 3' float at 6k+15) unbroken — 72' of pace waves.
    title: "Summer Shower",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 9 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 15 },
        spm: 20,
      },
    ],
  },
  {
    // O2: 6×10' at 6k+10 with 2' rest — an hour of firm work in six sittings.
    title: "April Shower",
    type: "O2",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "wu", minutes: 8 },
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 10 },
        spm: 22,
        restMinutes: 2,
      },
    ],
  },
];
