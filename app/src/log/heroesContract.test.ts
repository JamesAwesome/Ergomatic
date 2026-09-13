import { describe, expect, it } from "vitest";
import { rowContribution } from "../../domain/stats/rowContribution.js";
import captured from "./fixtures/heroesCapture.json";
import { HEROES_CONTRACT_FIXTURES } from "./heroesContract.fixtures";
import { buildStoredSummary, toStatsRowInput } from "./storedSummary";

// Spec §8.1 / invariant 2. `heroesCapture.json` is `buildHeroes`'s output
// captured from main at the commit BEFORE the refactor (see
// scripts/capture-heroes.ts); both halves below compare to THAT record,
// so the refactor is proved by equality, not by reading the diff.
// Strongest claim: for every committed fixture the two agree.
const CAPTURED = new Map(
  (
    captured as {
      id: string;
      distanceMeters: number | null;
      timeSeconds: number | null;
    }[]
  ).map((c) => [c.id, c]),
);

describe("rowContribution ≡ buildHeroes on every contract fixture (spec §8.1)", () => {
  it("the capture covers every fixture and every fixture is captured", () => {
    expect([...CAPTURED.keys()].sort()).toStrictEqual(
      HEROES_CONTRACT_FIXTURES.map((f) => f.id).sort(),
    );
  });

  it.each(HEROES_CONTRACT_FIXTURES.map((f) => [f.id, f.row] as const))(
    "%s: the refactored buildHeroes still prints the captured metres and seconds",
    (id, row) => {
      const heroes = buildStoredSummary(row).heroes;
      expect({
        distanceMeters: heroes.distanceMeters ?? null,
        timeSeconds: heroes.timeSeconds ?? null,
      }).toStrictEqual({
        distanceMeters: CAPTURED.get(id)!.distanceMeters,
        timeSeconds: CAPTURED.get(id)!.timeSeconds,
      });
    },
  );

  it.each(HEROES_CONTRACT_FIXTURES.map((f) => [f.id, f.row] as const))(
    "%s: rowContribution's workMeters/workSeconds equal the captured hero (null ↔ undefined)",
    (id, row) => {
      const c = rowContribution(toStatsRowInput(row));
      expect({
        id,
        distanceMeters: c.workMeters,
        timeSeconds: c.workSeconds,
      }).toStrictEqual({
        id,
        distanceMeters: CAPTURED.get(id)!.distanceMeters,
        timeSeconds: CAPTURED.get(id)!.timeSeconds,
      });
    },
  );
});
