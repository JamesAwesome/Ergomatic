import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { GATE0_ROWS, GATE0_TODAY, parseSeedDate } from "./gate0Seed.js";

// Spec §8.5: a transcription of the seed asserts its per-row figures equal
// `seed.mjs`'s. Loaded by URL at runtime (plain ESM, no types) so the
// design source stays the ONE origin of every asserted figure.
const SEED_URL = pathToFileURL(
  new URL("../../../docs/design/career-stats/seed.mjs", import.meta.url)
    .pathname,
).href;

interface SeedModule {
  today: string;
  rows: {
    id: string;
    date: string;
    source: string;
    tier: string;
    type: string | null;
    workMeters: number;
    workSeconds: number;
    restMeters: number | null;
    calories: number | null;
  }[];
}

describe("gate0Seed — the transcription equals docs/design/career-stats/seed.mjs", () => {
  it("carries every seed row's id, date, source, tier, type, metres, seconds, rest and calories, in order, and the same today", async () => {
    const seed = (await import(/* @vite-ignore */ SEED_URL)) as SeedModule;
    expect(parseSeedDate(seed.today)).toStrictEqual(GATE0_TODAY);
    expect(
      GATE0_ROWS.map((r) => ({
        id: r.id,
        date: r.date,
        source: r.source,
        tier: r.tier,
        type: r.workoutType,
        workMeters: r.workMeters,
        workSeconds: r.workSeconds,
        restMeters: r.restMeters,
        calories: r.calories,
      })),
    ).toStrictEqual(
      seed.rows.map((r) => ({
        id: r.id,
        date: parseSeedDate(r.date),
        source: r.source,
        tier: r.tier,
        type: r.type,
        workMeters: r.workMeters,
        workSeconds: r.workSeconds,
        restMeters: r.restMeters,
        calories: r.calories,
      })),
    );
  });
});

describe("parseSeedDate — a malformed seed date fails at import, never a quiet null", () => {
  it("throws naming the bad string (the guard a mis-typed table row hits)", () => {
    expect(() => parseSeedDate("2026-9-1")).toThrow(
      "gate0Seed: bad date 2026-9-1",
    );
    expect(parseSeedDate("2026-09-01")).toStrictEqual({ y: 2026, m: 9, d: 1 });
  });
});
