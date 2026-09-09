import { defineConfig, devices } from "@playwright/test";
import { isCI, workerCap } from "./scripts/testEnv.js";

// Lives outside the Vitest projects entirely (app/e2e/, not server/** or
// src/**) — Playwright drives a real browser against the compose stack
// started by scripts/e2e.sh / scripts/screenshots.sh, never against Vitest's
// jsdom or node environments.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Phase MEM: local worker cap (see vitest.config.ts's comment and
  // docs/superpowers/specs/2026-09-08-local-test-memory-design.md Part B).
  // Inert in CI, overridable with ERGOMATIC_E2E_WORKERS. Raised from the
  // spec's proposed 2 to 3 after measuring: 2 workers cost 2.34-2.39x the
  // old default of 5 (test phase 5.5m vs 2.3m; total wall 6:12 vs 2:39),
  // over the spec's ~2x threshold, while 3 workers cost only ~1.5x
  // (test phase 3.6m; total wall 3:58). The full figures are the Part B
  // tables in docs/superpowers/specs/2026-09-08-local-test-memory-design.md.
  workers: isCI() ? undefined : workerCap(process.env.ERGOMATIC_E2E_WORKERS, 3),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  use: {
    // Web Bluetooth is exposed by macOS Chromium but absent in Linux CI.
    // Start unsupported everywhere; connected scenarios explicitly inject
    // the fake monitor or a supported browser with a rejected scan.
    launchOptions: { args: ["--disable-blink-features=WebBluetooth"] },
    // Set by scripts/stack-env.sh (per-worktree compose scoping, Phase CL);
    // the fallback keeps a bare `playwright test` against a hand-started
    // legacy stack working.
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8081",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
      testIgnore: "**/screenshots.spec.ts",
    },
    {
      name: "screenshots",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
      testMatch: "**/screenshots.spec.ts",
    },
  ],
});
