import path from "node:path";
import { test } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

// Committed into docs/screenshots/ for PR bodies. NOT diff-asserted — a
// human judges these, this spec only judges "did it render" (see
// docs/superpowers/specs/2026-07-28-testing-validation-design.md). Run via
// `pnpm screenshots` (scripts/screenshots.sh), never as part of `pnpm e2e`.
const SCREENSHOTS_DIR = path.resolve(process.cwd(), "../docs/screenshots");

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
