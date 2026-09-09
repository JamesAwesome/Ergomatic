import { defineConfig, devices } from "@playwright/test";

// GATE 0 ONLY. `playwright.config.ts` is the suite CI runs; this config
// exists so the Gate 0 capture harness (`e2e/gate0/*.gate.ts`) can be run
// on demand WITHOUT joining that suite — the default `testMatch` rejects
// `.gate.ts`, so `pnpm e2e` and CI never pick these up, and a minutes-long
// connected walk per rendered frame never lands on the push gate.
//
// Same stack, same baseURL contract as `playwright.config.ts`: run it after
// `scripts/e2e.sh` (or a hand-booted compose stack) with `E2E_BASE_URL`
// exported by `scripts/stack-env.sh`.
export default defineConfig({
  testDir: "./e2e/gate0",
  testMatch: "**/*.gate.ts",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    launchOptions: { args: ["--disable-blink-features=WebBluetooth"] },
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8081",
  },
  projects: [
    {
      name: "gate0",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
