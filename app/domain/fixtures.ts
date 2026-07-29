import type { Step } from "./types.js";

/** Canonical math fixture: the handoff's structural contract (25 phases / 50'). Original content. */
export const intervalLadder: { title: string; steps: Step[] } = {
  title: "Ladder Sets",
  steps: [
    { k: "wu", minutes: 10 },
    { k: "reps", count: 4 },
    {
      k: "w",
      duration: { kind: "time", minutes: 1 },
      ref: { base: "6k", off: 0 },
      spm: 16,
    },
    {
      k: "w",
      duration: { kind: "time", minutes: 1 },
      ref: { base: "6k", off: -1 },
      spm: 18,
    },
    {
      k: "w",
      duration: { kind: "time", minutes: 1 },
      ref: { base: "6k", off: -2 },
      spm: 20,
    },
    {
      k: "w",
      duration: { kind: "time", minutes: 1 },
      ref: { base: "6k", off: -3 },
      spm: 22,
    },
    {
      k: "w",
      duration: { kind: "time", minutes: 1 },
      ref: { base: "6k", off: -4 },
      spm: 24,
    },
    { k: "r", minutes: 5 },
  ],
};

/** Distance-axis fixture: 2500m at 2k-4, 5' rest, ×5. */
export const distanceRepeats: { title: string; steps: Step[] } = {
  title: "Long Repeats",
  steps: [
    { k: "wu", minutes: 10 },
    { k: "reps", count: 5 },
    {
      k: "w",
      duration: { kind: "distance", meters: 2500 },
      ref: { base: "2k", off: -4 },
      spm: 24,
      restMinutes: 5,
    },
  ],
};
