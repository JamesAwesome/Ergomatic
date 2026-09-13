import type { StoredLog } from "./storedSummary";

/**
 * Phase PS PR 1, spec §8.1: the rows the `rowContribution ≡ buildHeroes`
 * contract is proved on. The first five are `storedSummary.test.ts`'s own
 * tier fixtures, copied value for value (that file stays untouched); the
 * sixth is NEW and exists for the gate-order mutation — a work pair AND
 * reconstructable step actuals whose Σ differs from the pair. Title/type
 * are a real library workout's ("Sea Fret", O2 — `LIBRARY_WORKOUTS`),
 * per RF3. `scripts/capture-heroes.ts` prints `buildHeroes` over these;
 * `fixtures/heroesCapture.json` is that printout from BEFORE the refactor.
 */
function baseRow(overrides: Partial<StoredLog>): StoredLog {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    workoutId: null,
    workoutTitle: "Sea Fret",
    workoutType: "O2",
    loggedAt: "2026-08-18T18:57:00.000Z",
    held: null,
    effort: null,
    notes: null,
    thumbs: null,
    deviceName: null,
    source: "manual",
    c2ResultId: null,
    c2UserId: null,
    verified: null,
    steps: [],
    avgSplitSeconds: null,
    timeSeconds: null,
    distanceMeters: null,
    planKey: null,
    planIndex: null,
    machineWorkSeconds: null,
    machineWorkMeters: null,
    machineSummary: null,
    restSeconds: null,
    restMeters: null,
    workSeconds: null,
    workMeters: null,
    ...overrides,
  };
}

// The exit-7 walk's real values (docs/monitor/sessions/walk-2026-08-24):
// 250 m / 67.9 s and 250 m / 56.1 s; Σ 500 m / 124.0 s; fused 742 m / 244 s.
const EXIT7_STEPS: StoredLog["steps"] = [
  {
    label: "250m @ 2:07.0",
    targetSplit: 127.0,
    actualSplit: 135.8,
    actualSeconds: 67.9,
    actualMeters: 250,
    actualSource: "pm5",
    meters: 250,
    actualSpm: 25,
  },
  {
    label: "250m @ 2:07.0",
    targetSplit: 127.0,
    actualSplit: 112.2,
    actualSeconds: 56.1,
    actualMeters: 250,
    actualSource: "pm5",
    meters: 250,
    actualSpm: 28,
  },
];

export const HEROES_CONTRACT_FIXTURES: readonly {
  id: string;
  row: StoredLog;
}[] = [
  {
    id: "tier-A-terminated-null-rest-pair",
    row: baseRow({
      deviceName: "PM5 432331249",
      source: "pm5",
      endedBy: "rower",
      steps: [EXIT7_STEPS[0]!],
      machineWorkSeconds: 97.9,
      machineWorkMeters: 300,
      machineSummary: { avgPaceSecondsPer500m: 163.2 },
      avgSplitSeconds: 163.2,
      timeSeconds: 97.9,
      distanceMeters: 300,
    }),
  },
  {
    id: "tier-A-build-738",
    row: baseRow({
      deviceName: "PM5 432331249",
      source: "pm5",
      steps: EXIT7_STEPS,
      machineWorkSeconds: 124.0,
      machineWorkMeters: 500,
      machineSummary: { verificationBytes: [1, 2, 3] },
    }),
  },
  {
    id: "tier-B1-free-row-empty-steps",
    row: baseRow({
      workoutType: null,
      workoutTitle: "Just Row",
      deviceName: "PM5 432331249",
      source: "pm5",
      endedBy: "rower",
      steps: [],
      workSeconds: 800.5,
      workMeters: 3012,
      avgSplitSeconds: 132.9,
      timeSeconds: 800.5,
      distanceMeters: 3012,
    }),
  },
  {
    id: "tier-B2-declined-link-lost",
    row: baseRow({
      deviceName: "PM5 432331249",
      source: "pm5",
      endedBy: "link-lost",
      steps: EXIT7_STEPS,
      avgSplitSeconds: 124.0,
      timeSeconds: 150.0,
      distanceMeters: 560,
    }),
  },
  {
    id: "fallback-fused-pre-rc5",
    row: baseRow({
      deviceName: "PM5 432331249",
      source: "pm5",
      steps: [{ label: "6k" }],
      avgSplitSeconds: 132.7,
      timeSeconds: 1592.0,
      distanceMeters: 6240,
    }),
  },
  {
    // The STEPS tier, landed by a hand-logged row (the seed's R2/R9/R10
    // shape, `source: "manual"`): no machine totals, no work pair, one
    // step carrying both actuals under a `finished` close. Its captured
    // hero is Σ steps — 6000 m / 1550 s — and it is the row whose figure
    // moves when `toStatsRowInput`'s step-key mapping is wrong.
    id: "tier-B2-steps-manual-finished",
    row: baseRow({
      endedBy: "finished",
      steps: [{ label: "6k", actualMeters: 6000, actualSeconds: 1550 }],
    }),
  },
  {
    // The STEPS tier with metres and no seconds at all
    // (`storedSummary.test.ts`'s "actualMeters but no actualSeconds" case,
    // independently optional per the server's validator): DISTANCE
    // renders, TIME is absent — `workSeconds` null on the steps tier.
    id: "tier-B2-steps-meters-only",
    row: baseRow({
      deviceName: "PM5 432331249",
      source: "pm5",
      endedBy: "finished",
      steps: [
        { label: "distance only", actualSource: "pm5", actualMeters: 500 },
      ],
    }),
  },
  {
    // NEW (spec §8.1): work pair AND reconstructable steps that DISAGREE —
    // Σ steps 500 m ≠ workMeters 560 — so swapping the two gates changes
    // this row's metres and nothing else in the set.
    id: "work-pair-beats-disagreeing-steps",
    row: baseRow({
      deviceName: "PM5 432331249",
      source: "pm5",
      endedBy: "finished",
      steps: EXIT7_STEPS,
      workSeconds: 150.0,
      workMeters: 560,
      restSeconds: 120,
      restMeters: 242,
      avgSplitSeconds: 124.0,
      timeSeconds: 150.0,
      distanceMeters: 560,
    }),
  },
];
