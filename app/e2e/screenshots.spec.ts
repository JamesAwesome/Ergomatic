import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
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

/** Fills the top-level fields plus a six-step body so the committed
 *  screenshot shows the whole point of the accordion redesign
 *  (docs/design/builder-redesign/README.md): only the LAST step ends up
 *  expanded — every other step folds down to its ~86px collapsed summary
 *  card (StepCard.tsx), which is exactly the vertical-density problem this
 *  phase's redesign exists to fix. A blank/default form (one row, always
 *  open) could never show that, so this deliberately builds more than one
 *  step and explicitly collapses each one via DONE before moving on.
 *
 *  Step 1: a minutes row (bare number, builderState.ts's
 *  parseDurationInput), stroke rate raised off FREE via the SPM stepper
 *  (Stepper.tsx) — collapsed once configured.
 *  Steps 2-4: a distance row (2000m @ 2k, exercising DurationInput's M
 *  chip and the REST stepper's 30s increments) plus two collapsed-card ⧉
 *  duplicates of it (docs/design/DEVIATIONS.md's SET-cell replacement) —
 *  the fast way to build a realistic multi-step ladder without opening
 *  three separate editors.
 *  Step 5: "+ ADD STEP" appends a sixth, deliberately different row (a
 *  minutes row back at 6k, offset) and — being the freshly-added step —
 *  is the one left open when this function returns, since that's the
 *  state the screenshot needs to capture. */
async function fillSampleWorkout(page: Page): Promise<void> {
  await page.getByLabel("Title").fill("Screenshot Intervals");
  await page.getByRole("button", { name: "Pain 3" }).click();

  // Row 1: base defaults to 6k (builderState.ts's newRow) — ten clicks on
  // the "slower" stepper reaches "6k +10".
  await page.getByLabel("Row 1 duration", { exact: true }).fill("20");
  const row1Slower = page.getByRole("button", { name: "Row 1 pace slower" });
  for (let i = 0; i < 10; i++) {
    await row1Slower.click();
  }
  const row1SpmUp = page.getByRole("button", {
    name: "Row 1 stroke rate up",
  });
  await row1SpmUp.click();
  await row1SpmUp.click();
  await page.getByRole("button", { name: "DONE" }).click();

  // Row 2: a distance row (2000m against 2k).
  await page.getByRole("button", { name: "+ ADD STEP" }).click();
  await page.getByLabel("Row 2 duration", { exact: true }).fill("2000");
  await page.getByRole("radio", { name: "Row 2 duration unit meters" }).click();
  await page.getByRole("radio", { name: "Row 2 pace 2K" }).click();
  const row2SpmUp = page.getByRole("button", {
    name: "Row 2 stroke rate up",
  });
  for (let i = 0; i < 6; i++) {
    await row2SpmUp.click();
  }
  const row2RestUp = page.getByRole("button", { name: "Row 2 rest up" });
  for (let i = 0; i < 6; i++) {
    await row2RestUp.click();
  }
  await page.getByRole("button", { name: "DONE" }).click();

  // Two collapsed-card ⧉ duplicates of Row 2 (Steps 3 and 4) — everything
  // stays collapsed the whole time.
  const duplicateRow2 = page.getByRole("button", { name: "Duplicate Step 2" });
  await duplicateRow2.click();
  await duplicateRow2.click();
  await duplicateRow2.click();

  // Step 6: "+ ADD STEP" appends a copy of the last row's values and opens
  // it — nudge it to look deliberately different (minutes, not metres;
  // 6k, not 2k) so the screenshot doesn't read as four identical clones.
  await page.getByRole("button", { name: "+ ADD STEP" }).click();
  const lastRowLabel = "Row 6";
  await page.getByLabel(`${lastRowLabel} duration`, { exact: true }).fill("8");
  await page
    .getByRole("radio", { name: `${lastRowLabel} duration unit minutes` })
    .click();
  await page.getByRole("radio", { name: `${lastRowLabel} pace 6K` }).click();
  const lastFaster = page.getByRole("button", {
    name: `${lastRowLabel} pace faster`,
  });
  for (let i = 0; i < 5; i++) {
    await lastFaster.click();
  }
  // Row 6 is left EXPANDED here (no DONE press) — this is the one card the
  // screenshot needs open.

  const repeatUp = page.getByRole("button", { name: "Repeat up" });
  await repeatUp.click();
  await repeatUp.click();
  await repeatUp.click();
}

test("builder", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-builder@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await page.goto("/library/new");
  await fillSampleWorkout(page);

  // Six steps total: five collapsed cards (StepCard.tsx) and exactly one
  // open editor (StepEditor.tsx) — the accordion invariant this whole
  // redesign exists to prove, captured live before any save. Every
  // collapsed row is a work step with baselines set, so each one resolves
  // its own split (StepCard's `splitOnCollapsed`); the open row shows its
  // resolved range in the TARGET strip instead.
  await expect(page.locator(".step-card")).toHaveCount(5);
  await expect(page.locator(".step-card-split")).toHaveCount(5);
  await expect(page.locator(".step-editor")).toHaveCount(1);
  await expect(page.locator(".step-editor-target-value")).toHaveCount(1);
  // Scoped to the REPEAT stepper's own value cell, not a page-wide text
  // search: StepCard.tsx's collapsed delete button is also the "×" glyph,
  // so an unscoped getByText("×4") can match across two adjacent rows'
  // concatenated text (a delete "×" immediately followed by the next
  // card's index digit) as readily as it matches the real stepper.
  await expect(page.locator(".builder-repeat-row .stepper-value")).toHaveText(
    "×4",
  );

  // fillSampleWorkout scrolls the page down while filling rows near the
  // bottom of the form, so a viewport-only screenshot here would start at
  // the classification card and never show `← BACK`, the "New workout"
  // heading, the Title field, or ↻ AUTO NAME. fullPage captures the whole
  // scrollable form regardless of current scroll position.
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "builder.png"),
    fullPage: true,
  });
});

test("import", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-import@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  // Its own screen now (Library's IMPORT link / the /library/import route
  // in AppRoutes.tsx), not a toggle inside the builder.
  await page.goto("/library/import");

  // A filled textarea, not the blank placeholder state — the grammar help
  // below it (.bulk-import-help) is static and always rendered either way,
  // but an empty control isn't "real content" for a screenshot. Same
  // example text as BulkImport.tsx's own GRAMMAR_EXAMPLE constant.
  const text = [
    "Ladder Day | AT | medium | 3",
    "wu 10",
    "x4",
    "w 1' 6k-2 @22 r5",
    "r 5",
  ].join("\n");
  await page.getByLabel("Bulk import text").fill(text);
  await page.locator(".bulk-import-help").waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "import.png"),
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
