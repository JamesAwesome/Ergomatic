import { defineConfig, devices } from "@playwright/test";

// Lives outside the Vitest projects entirely (app/e2e/, not server/** or
// src/**) — Playwright drives a real browser against the compose stack
// started by scripts/e2e.sh / scripts/screenshots.sh, never against Vitest's
// jsdom or node environments.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  use: {
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
