import type { WorkoutInput } from "../../../domain/types.js";

// AT (anaerobic threshold) block of the generated library — 75 workouts,
// easy→hard. Authored in Task 7 against the pattern digest
// (app/domain/generation/patterns.json), then revised after James's content
// review: variety comes from structure (rep counts, rest schemes, pyramids,
// rate-change pieces), not ±1' tweaks; continuous threshold singles stay
// rare. Retuned or newly generated totals land on a 0 or 5 WHERE THE
// 0:15 GRID ALLOWS; every time value a retune CREATES (every rest, and
// any piece a retune scales) stays on the 0:15 grid always — a value
// inherited unchanged from the pre-retune workout stands as it was,
// on-grid or not; a total that cannot be round with grid values stands
// as its pieces sum. Distance sets remain exempt (2026-08-10
// library-rebalance spec, §2/the zero-five audit; rest-grid pin, James
// 2026-08-10, extended to created work pieces the same day). Ordering
// here IS the library browsing order within the type block.
export const AT_WORKOUTS: WorkoutInput[] = [
  {
    // AT: 10' continuous at 6k+4 — one short threshold piece, in and out.
    title: "Occluded Front",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 4 },
        spm: 22,
      },
    ],
  },
  {
    // AT: rate-change 3×3' at 6k+4 — same pace every rung, spm 22→24→26.
    title: "Stationary Front",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 4 },
        spm: 22,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 4 },
        spm: 24,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 4 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 1'-2'-3'-2'-1' pyramid at 6k+2 with 30 s rests — nine quick minutes.
    title: "Pressure Ridge",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: 2 },
        spm: 26,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: 2 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 4×500 m at 6k+2 with 1' rest — threshold by distance on a short clock.
    title: "Gradient Wind",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 4'/3'/2' descending ladder, pace sharpening 6k+4 → 6k+0.
    title: "Barometric Low",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 4 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 1,
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
    // AT: 3×1000 m at 6k+6 with 2.5' rest — threshold by distance, easy end.
    title: "Warm Sector",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
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
    // AT: 2'-3'-4'-3'-2' pyramid at 6k+3 with 1.5' rests — the C2 signature.
    title: "Frontal Wave",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 3 },
        spm: 22,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 3 },
        spm: 22,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 3 },
        spm: 22,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 3 },
        spm: 24,
      },
    ],
  },
  {
    // AT: 600/1200/1750 m ascending distance ladder, pace easing 6k+0→+4.
    title: "Isobaric Ridge",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 600 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1200 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 3.25,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1750 },
        ref: { base: "6k", off: 4 },
        spm: 22,
      },
    ],
  },
  {
    // AT: rate-change 3×6' at 6k+5 — the pace holds while the rate climbs.
    title: "Upper Ridge",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 5 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 5 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 5 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 9' at 6k+6 then 2×2' at 6k+1 — one long piece, two sharp ones after.
    title: "Frontal Boundary",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 3.5,
      },
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 1 },
        spm: 26,
        restMinutes: 1.75,
      },
    ],
  },
  {
    // AT: 1050 m / 5:30 / 1050 m sandwich at 6k+4 and 6k+2 — distance either side.
    title: "Marine Layer",
    type: "AT",
    difficulty: "easy",
    pain: 2,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 1050 },
        ref: { base: "6k", off: 4 },
        spm: 22,
        restMinutes: 3.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5.5 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1050 },
        ref: { base: "6k", off: 4 },
        spm: 22,
      },
    ],
  },
  {
    // AT: 5×3' at 6k+1 with 1' rest — honest threshold reps, short breaks.
    title: "Trough",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 1'/2'/3'/4' ascending ladder — starts at 6k-2 and eases as it grows.
    title: "Offshore Flow",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: -2 },
        spm: 26,
        restMinutes: 1,
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
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 0 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 2 },
        spm: 24,
      },
    ],
  },
  {
    // AT: 2×(4' at 6k+4 + 2' at 6k+0) — a hard second half to every set.
    title: "Barrier Jet",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "reps", count: 2 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 4 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 0.5,
      },
    ],
  },
  {
    // AT: 5×2' at 6k-1 with the rest CUT each time — 2'/1.5'/1'/30 s.
    title: "Pressure Gradient",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 2,
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
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 0.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -1 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 8×90 s at 6k-1 with 1' rest — fast, dense, barely-there recovery.
    title: "Cold Sector",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 3×(3' at 6k+4 + 2' at 6k-1) — steady then a sting, three times over.
    title: "Baroclinic Zone",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 4 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: rate-change 6×2:30 at 6k+1 — spm steps 22/22/24/24/26/26, 1' rests.
    title: "Confluence Zone",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 2.5 },
        ref: { base: "6k", off: 1 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2.5 },
        ref: { base: "6k", off: 1 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2.5 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2.5 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2.5 },
        ref: { base: "6k", off: 1 },
        spm: 26,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2.5 },
        ref: { base: "6k", off: 1 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 5×750 m at 6k+2 with 1.5' rest — the short threshold distance rep.
    title: "Diffluence Zone",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AT: 500/750/1000/750/500 m distance pyramid, all at 6k+2.
    title: "Trough Axis",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 2 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 750 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 2 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 3×5' with the pace stepping 6k+4 / +1 / -2 — equal rungs, rising cost.
    title: "Ridge Axis",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 4 },
        spm: 22,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: -2 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 10' at 6k+6 then 3×90 s at 6k-1 — steady base, then a fast finish.
    title: "Onshore Flow",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 2.5,
      },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1.5 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 3×(2'-3'-2' mini pyramid) at 6k+0/+2 — three peaks, 1' rests throughout.
    title: "Comma Cloud",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 2×5' at 6k+3/+1, then 4×1' at 6k-2 — the tail is the point.
    title: "Frontal Passage",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 1 },
        spm: 26,
        restMinutes: 1.5,
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
    // AT: 4×5' at 6k+2 with 2:30 rest — the C2 workhorse threshold set.
    title: "Blocking High",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
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
    // AT: 30' continuous at 6k+4 — sustained threshold with nowhere to hide.
    title: "Anticyclone",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 30 },
        ref: { base: "6k", off: 4 },
        spm: 22,
      },
    ],
  },
  {
    // AT: 2:30-5'-8'-5'-2:30 pyramid at 6k+3, each rest sized to the rung it follows — 23' of work.
    title: "Long Wave",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 2.5 },
        ref: { base: "6k", off: 3 },
        spm: 26,
        restMinutes: 1.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 1.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 3 },
        spm: 22,
        restMinutes: 2.25,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 1.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2.5 },
        ref: { base: "6k", off: 3 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 6×3:30 at 6k+3 with 1:30 rest — more reps, less recovery each.
    title: "Omega Block",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3.5 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AT: 5'/4'/3'/2'/1' descending ladder, 6k+4 sharpening to 6k-2.
    title: "Geostrophic Wind",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 4 },
        spm: 22,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: -2 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 1'-2'-3'-4'-3'-2'-1' full pyramid at 6k+1 with 1' rests.
    title: "Rossby Wave",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: 1 },
        spm: 26,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 1 },
        spm: 22,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: 1 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 15' at 6k+2 then 3×2:30 at 6k+0 — long sustained block, sharp coda.
    title: "Inversion Layer",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 3.75,
      },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2.5 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 1.25,
      },
    ],
  },
  {
    // AT: 3×6' at 6k+2 with 4' easy rest — the classic C2 3×6' shape.
    title: "Deepening Low",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 4,
      },
    ],
  },
  {
    // AT: 4×6' at 6k+1 with the rest CUT each time — 3'/2'/1'.
    title: "Thermal Low",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: 1 },
        spm: 24,
      },
    ],
  },
  {
    // AT: rate-change 3×9' at 6k+3 — 27' of work, spm stepping 22→24→26.
    title: "Thermal Wind",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 3 },
        spm: 22,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 3 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 3×(8' at 6k+4 + 4' at 6k+0) — a hard back half to each long set.
    title: "Coastal Jet",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 4 },
        spm: 22,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 6×1000 m at 6k+2 with 1.5' rest — threshold volume in short bites.
    title: "Downslope Wind",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 1.5,
      },
    ],
  },
  {
    // AT: 4×2000 m at 6k+4 with 3' rest — threshold volume by the 2k marker.
    title: "Filling Low",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 4 },
        spm: 22,
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
    // AT: 3×3000 m at 6k+5 with 4' rest — three long pieces, honest pacing test.
    title: "Short Wave",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 3000 },
        ref: { base: "6k", off: 5 },
        spm: 22,
        restMinutes: 4,
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
        spm: 24,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 2 },
        spm: 26,
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
    // AT: 2'/5'/8'/5'/2' pyramid, easing out to 6k+4 then sharpening home to
    // 6k-1 — the second half is the honest one.
    title: "Occlusion Point",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
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
        spm: 22,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -1 },
        spm: 26,
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
      {
        k: "w",
        duration: { kind: "distance", meters: 2000 },
        ref: { base: "6k", off: 4 },
        spm: 22,
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
    // AT: 15' at 6k+6 then 4×3' at 6k+0 — long steady block, four fast reps.
    title: "Katabatic Wind",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 15 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 3,
      },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 3'-5'-8'-5'-3' pyramid that negative-splits, 6k+4 down to 6k+0.
    title: "Zonda",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 4 },
        spm: 22,
        restMinutes: 1.5,
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
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 1 },
        spm: 26,
        restMinutes: 1.5,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 5×7' at 6k+3 with 2' rest — 35' of threshold, no frills.
    title: "Santa Ana",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 7 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 2,
      },
    ],
  },
  {
    // AT: 3×12:30 at 6k+5 with 2:30 rest — long reps, recovery that never repays.
    title: "Foehn",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 12.5 },
        ref: { base: "6k", off: 5 },
        spm: 22,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AT: 4×9' at 6k+4 with 2:15 rest — 36' of threshold in one session.
    title: "Maestro",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 9 },
        ref: { base: "6k", off: 4 },
        spm: 22,
        restMinutes: 2.25,
      },
    ],
  },
  {
    // AT: 12:30/10:30/8:30/6:30 descending ladder, 6k+6 down to 6k+0 — 38' of work.
    title: "Buran",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 12.5 },
        ref: { base: "6k", off: 6 },
        spm: 22,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 10.5 },
        ref: { base: "6k", off: 4 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8.5 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6.5 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 9×1000 m at 6k+2 with 1' rest — the C2 WOD staple, all business.
    title: "Ostro",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "reps", count: 9 },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 2 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 4×2500 m at 6k+5 with 4' rest — long distance reps, modest recovery.
    title: "Chinook",
    type: "AT",
    difficulty: "medium",
    pain: 4,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "distance", meters: 2500 },
        ref: { base: "6k", off: 5 },
        spm: 22,
        restMinutes: 4,
      },
    ],
  },
  {
    // AT: 4×5' at 6k-2 with 2:30 rest — top of the band, paid for with rest.
    title: "Heat Low",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: -2 },
        spm: 26,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AT: 2150/1600/1050/550 m descending ladder, 6k+2 sharpening to 6k-4.
    title: "Squall Line",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 2150 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 3.25,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1600 },
        ref: { base: "6k", off: 0 },
        spm: 24,
        restMinutes: 2.75,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1050 },
        ref: { base: "6k", off: -2 },
        spm: 26,
        restMinutes: 2.25,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 550 },
        ref: { base: "6k", off: -4 },
        spm: 26,
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
    // AT: 2'-3'-4'-3'-2' pyramid at 6k-1 with 2' rests — the C2 shape, sharpened.
    title: "Frontal Inversion",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: -1 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: -1 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 3 },
        ref: { base: "6k", off: -1 },
        spm: 24,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: -1 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 2×13' at 6k pace with 4' between — the long threshold rep, undiluted.
    title: "Cyclogenesis",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 13 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 13 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 3×6' at 6k-1 with the rest CUT 3'→2' — faster than 6k, less room each time.
    title: "Frontogenesis",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 3,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 2,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 6 },
        ref: { base: "6k", off: -1 },
        spm: 26,
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
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 4 },
        spm: 22,
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
    // AT: 6×4' at 6k-1 with 1' rest — long fast reps, no room to settle.
    title: "Cutoff Low",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "reps", count: 6 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: -1 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 12' at 6k+3 then 3×3:30 at 6k-2 — the long piece is only the setup.
    title: "Gap Wind",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 12 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 3.75,
      },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 3.5 },
        ref: { base: "6k", off: -2 },
        spm: 26,
        restMinutes: 1.25,
      },
    ],
  },
  {
    // AT: 500/1000/1550/1000/500 m distance pyramid, all at 6k pace.
    title: "Triple Point",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 2.5,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 0 },
        spm: 24,
        restMinutes: 3.25,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1550 },
        ref: { base: "6k", off: 0 },
        spm: 24,
        restMinutes: 3.25,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 0 },
        spm: 24,
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
    // AT: 2150 m at 6k+5, 2150 m at 6k+3, then 4:30 at 6k pace — descending.
    title: "Cold Core",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "distance", meters: 2150 },
        ref: { base: "6k", off: 5 },
        spm: 22,
        restMinutes: 3.75,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 2150 },
        ref: { base: "6k", off: 3 },
        spm: 24,
        restMinutes: 3.75,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 4.5 },
        ref: { base: "6k", off: 0 },
        spm: 26,
      },
    ],
  },
  {
    // AT: 30' continuous at 6k+3 — half an hour of threshold, unbroken.
    title: "Jet Streak",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 30 },
        ref: { base: "6k", off: 3 },
        spm: 24,
      },
    ],
  },
  {
    // AT: 20' at 6k+6 then 5' at 6k+0 — a long block and one hard rep after.
    title: "Channeled Wind",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
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
    // AT: 5000 m at 6k+8 then a single 3' at 6k-2 — a long haul with a kick.
    title: "Anabatic Wind",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
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
    // AT: 20' at 6k+2 then 3×4' at 6k pace — a long piece, then three fast.
    title: "Barber",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { base: "6k", off: 2 },
        spm: 24,
        restMinutes: 5,
      },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 0 },
        spm: 26,
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 8×4' at 6k+1 with 1' rest — 32' of threshold with hardly a seam.
    title: "Subsidence Inversion",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 1 },
        spm: 24,
        restMinutes: 1,
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
    // AT: 6×5' at 6k pace with 2.5' rest — six times to the line and back.
    title: "Diablo Wind",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
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
    // AT: 4×(6' at 6k+3 + 2' at 6k-2) — 32' of work, a quarter of it above pace.
    title: "Boreas",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
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
        restMinutes: 1,
      },
    ],
  },
  {
    // AT: 12×2' at 6k-3 with 1.5' rest — twenty-four minutes above the line, two at a time.
    title: "Bora",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
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
    // AT: 3000/2000/1000/500 m descending ladder, 6k+7 down to 6k-2.
    title: "Berg Wind",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
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
        spm: 22,
        restMinutes: 4,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 1000 },
        ref: { base: "6k", off: 1 },
        spm: 24,
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
    // AT: 25' at 6k+4 then 4×4' at 6k+1 — the long block first, on purpose.
    title: "Warm Core",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 25 },
        ref: { base: "6k", off: 4 },
        spm: 22,
        restMinutes: 5,
      },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "6k", off: 1 },
        spm: 26,
        restMinutes: 2.5,
      },
    ],
  },
  {
    // AT: 8000 m at 6k+8 then 4×3' at 6k pace — the fast reps come after the
    // distance, not before it.
    title: "Split Front",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
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
  {
    // AT: 5×10' at 6k+4 with 3.33:1 rest — 50' of threshold in one sitting.
    title: "Polar Vortex",
    type: "AT",
    difficulty: "hard",
    pain: 4,
    steps: [
      { k: "reps", count: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 4 },
        spm: 22,
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
        spm: 24,
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
];
