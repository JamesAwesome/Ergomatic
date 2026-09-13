// Phase PS PR 1, spec §8.1: prints `buildStoredSummary(row).heroes`'s two
// numbers for every contract fixture. Run ONCE on the tree BEFORE the
// `buildHeroes` refactor and commit the output as
// `src/log/fixtures/heroesCapture.json` — the record the contract test
// compares BOTH the refactored `buildHeroes` and `rowContribution` to.
// Re-running it after the refactor overwrites the record with the thing
// under test, so do not.
//   pnpm exec tsx scripts/capture-heroes.ts > src/log/fixtures/heroesCapture.json
import { HEROES_CONTRACT_FIXTURES } from "../src/log/heroesContract.fixtures";
import { buildStoredSummary } from "../src/log/storedSummary";

const out = HEROES_CONTRACT_FIXTURES.map(({ id, row }) => {
  const { distanceMeters, timeSeconds } = buildStoredSummary(row).heroes;
  return {
    id,
    distanceMeters: distanceMeters ?? null,
    timeSeconds: timeSeconds ?? null,
  };
});
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
