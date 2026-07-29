import path from "node:path";
import type { Page } from "@playwright/test";
import { test } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

// Committed into docs/screenshots/ for PR bodies. NOT diff-asserted — a
// human judges these, this spec only judges "did it render" (see
// docs/superpowers/specs/2026-07-28-testing-validation-design.md). Run via
// `pnpm screenshots` (scripts/screenshots.sh), never as part of `pnpm e2e`.
const SCREENSHOTS_DIR = path.resolve(process.cwd(), "../docs/screenshots");

// The handoff's own reference values, so captured targets/durations match
// what the design docs describe.
const SCREENSHOT_BASELINES = { k2Seconds: 112.0, k6Seconds: 122.0 };

/**
 * Sets baselines for the signed-in user so screenshots show the product's
 * real numbers (durations, resolved target ranges) instead of the
 * no-baselines fallback ("—" / "no target"). Driven via an in-page fetch
 * (real Chromium networking), not `page.request`: the api container runs
 * with NODE_ENV=production, so the session cookie is Set-Cookie'd with
 * `Secure` — Chromium exempts http://127.0.0.1 from that (the loopback
 * "potentially trustworthy origin" carve-out), but Playwright's Node-side
 * APIRequestContext does not, so `page.request.put` 401s here even though
 * the identical request from the loaded page succeeds. Mirrors the reset
 * helper in library.spec.ts's baseline-propagation describe block.
 */
async function setBaselines(page: Page): Promise<void> {
  const result = await page.evaluate(async (patch) => {
    const res = await fetch("/api/baselines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, SCREENSHOT_BASELINES);
  if (!result.ok) {
    throw new Error(`baseline setup failed: ${result.status} ${result.body}`);
  }
}

test("signin", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "signin.png"),
  });
});

test("signed-in-home", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots@e2e.test",
    name: "Screenshot Tester",
  });
  // "/" redirects to /library (AppRoutes) — same load race as the
  // dedicated "library" screenshot below.
  await page.locator(".workout-row").first().waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "signed-in-home.png"),
  });
});

test("library", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-library@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await page.goto("/library");
  // Library shows "LOADING…" until the workouts/baselines fetches resolve;
  // page.goto only waits for the navigation's load event, not that — wait
  // for a real row so the screenshot isn't just the loading state.
  await page.locator(".workout-row").first().waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "library.png"),
  });
});

test("workout-detail", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-detail@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await page.goto("/library");
  await page.locator(".workout-row").first().click();
  await page.locator(".workout-detail-title").waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "workout-detail.png"),
  });
});

test("you", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-you@e2e.test",
    name: "Screenshot Tester",
  });
  await page.goto("/you");
  // Same "LOADING…" race as /library — wait for the baseline card's real
  // content before capturing.
  await page.locator(".baseline-value").first().waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "you.png"),
  });
});

test("you-staged", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-you-staged@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await page.goto("/you");
  await page.locator(".baseline-value").first().waitFor();
  // Press the 2k "slower" stepper a few times (0.5 s/step) to dirty the
  // draft without touching `committed` — this is the whole point of the
  // staged editor: nothing re-paces until Apply. Three presses from the
  // 112.0 s seed land the confirm block at "2k 1:52.0 → 1:53.5", which
  // "you.png" never shows because it captures the empty/seeded state
  // before any draft edits.
  const slower = page.getByRole("button", { name: "2k slower" });
  await slower.click();
  await slower.click();
  await slower.click();
  await page.getByRole("button", { name: "Apply baselines" }).waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "you-staged.png"),
  });
});
