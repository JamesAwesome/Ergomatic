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
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "signed-in-home.png"),
  });
});
