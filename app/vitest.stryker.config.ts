import { defineConfig } from "vitest/config";

// Dedicated Vitest config for Stryker mutation testing.
//
// Stryker's mutate scope (see stryker.config.json) is domain/**, server/stores/**,
// and server/routes/** — none of which are exercised by the "client" vitest
// project (src/**) or the "integration" project (server/**/*.integration.test.ts,
// which needs a Testcontainers-managed Postgres). Reusing the full multi-project
// vitest.config.ts here would make Stryker spin up Testcontainers per mutant
// (or at minimum run redundant client tests), which is both slow and requires
// Docker to be available wherever `pnpm mutate` runs.
//
// This config narrows to exactly the "unit" project's test config (no
// `projects` wrapper, no coverage thresholds — Stryker does its own
// mutation-coverage accounting via coverageAnalysis, not vitest's coverage
// provider).
export default defineConfig({
  test: {
    name: "unit",
    environment: "node",
    include: ["server/**/*.test.ts", "domain/**/*.test.ts"],
    exclude: ["server/**/*.integration.test.ts"],
  },
});
