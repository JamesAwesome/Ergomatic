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

/** Neutralises `.tabbar`'s `position: fixed` for a `fullPage: true` capture.
 *  A full-page screenshot on a document taller than the viewport stitches
 *  it together from scrolled segments; a fixed-position element gets
 *  redrawn at its *viewport-relative* spot in every segment, so on a page
 *  well past the 390×844 viewport (six steps plus an expanded editor) the
 *  tab bar ends up composited into the middle of the stitched image,
 *  overlapping whatever content happened to be in that segment — a capture
 *  artifact, not a product bug (the bar being fixed is correct behaviour,
 *  so this is not a fix to `src/`). `position: static` makes it render
 *  exactly once, in its real DOM position — `AppRoutes.tsx` renders
 *  `<TabBar />` right after the routed screen inside `.app-shell`, so
 *  static positioning puts it at the true end of the document. `.app-shell`
 *  only carries `padding-bottom` to reserve room for the fixed bar so
 *  scrolled content doesn't land underneath it; with the bar no longer
 *  fixed that padding would just leave a blank gap above it, so this drops
 *  it too. Call right before any `fullPage: true` screenshot whose content
 *  can exceed one viewport — currently only "builder" (see the other tests
 *  in this file: none else sets `fullPage`, so none else stitches, so none
 *  else is exposed to this). */
async function neutralizeFixedTabBarForFullPageCapture(
  page: Page,
): Promise<void> {
  await page.addStyleTag({
    content: `
      .tabbar { position: static !important; }
      .app-shell { padding-bottom: 0 !important; }
    `,
  });
}

test("signin", async ({ page }) => {
  await page.goto("/");
  // The only capture here that didn't wait for content, and it eventually
  // bit: a run caught the page between load and first paint and committed a
  // blank cream rectangle. Every other test in this file waits for a real
  // element first — this one now does too.
  await page
    .getByRole("link", { name: /continue with google/i })
    .waitFor({ state: "visible" });
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

/** Test-only cleanup: finds the signed-in user's own workout with the given
 *  title via the real API and deletes it. Duplicated from e2e/design.spec.ts
 *  / e2e/builder.spec.ts's own `cleanupByTitle` rather than shared — same
 *  precedent as this codebase's other intentionally-duplicated small
 *  helpers — so the "workout-detail" capture below doesn't pile up a fresh
 *  personal workout under the same fixed email every time `pnpm
 *  screenshots` reruns against a database that isn't reset between runs. */
async function cleanupByTitle(page: Page, title: string): Promise<void> {
  const result = await page.evaluate(async (t) => {
    const listRes = await fetch("/api/workouts");
    if (!listRes.ok) return { ok: false, status: listRes.status };
    const workouts = (await listRes.json()) as Array<{
      id: string;
      title: string;
      isGlobal: boolean;
    }>;
    const match = workouts.find((w) => !w.isGlobal && w.title === t);
    if (!match) return { ok: true, status: 200 };
    const delRes = await fetch(`/api/workouts/${match.id}`, {
      method: "DELETE",
    });
    return { ok: delRes.ok, status: delRes.status };
  }, title);
  if (!result.ok) {
    throw new Error(`cleanup failed for "${title}": ${result.status}`);
  }
}

test("workout-detail", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-detail@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);

  // A personal (non-global) workout, authored through the builder like the
  // "builder" capture below — WorkoutDetail.tsx renders Edit/Delete only
  // for `!workout.isGlobal`, and every seeded starter workout is global, so
  // the previous version of this capture (the library's first row) never
  // showed Task 8's owner-action styling fix at all. This replaces that
  // capture rather than adding a second one: a screenshot of a *global*
  // workout's detail screen (no Edit/Delete, no owner-actions block) records
  // strictly less of this app's own surface than a personal one does, so
  // keeping both would just be two similar images where one already
  // subsumes the other.
  const title = "Screenshot Personal Workout";
  await page.goto("/library/new");
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Pain 3" }).click();
  await page.getByLabel("Row 1 duration", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "Save to library" }).click();
  await expect(page).toHaveURL(/\/library\/[^/]+$/);
  await page.locator(".workout-detail-title").waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "workout-detail.png"),
  });

  await cleanupByTitle(page, title);
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
 *  Step 1: a sub-minute minutes row (`0:45`, typed through the masked
 *  numeric-pad clock field, ClockInput.tsx — the Phase 5F feature this
 *  screenshot exists to prove: before that phase the closest a rower could
 *  get was `0.75` or a rejected `:` keystroke), stroke rate raised off FREE
 *  via the SPM stepper (Stepper.tsx) — collapsed once configured.
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
  // the "slower" stepper reaches "6k +10". "45" digits into the masked
  // clock field renders as "0:45" (45 seconds) — a sub-minute duration,
  // valid since this phase widened duration validation from half-steps to
  // any whole second, and unrepresentable in the old free-text/decimal
  // field this phase replaced.
  await page.getByLabel("Row 1 duration", { exact: true }).fill("45");
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

  // Row 2: a distance row (2000m against 2k). The unit switch clears the
  // field (a clock string is meaningless as meters), so the M chip has to
  // be selected BEFORE typing the meter count, not after.
  await page.getByRole("button", { name: "+ ADD STEP" }).click();
  await page.getByRole("radio", { name: "Row 2 duration unit meters" }).click();
  await page.getByLabel("Row 2 duration", { exact: true }).fill("2000");
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

  // Step 6: "+ ADD STEP" appends a blank work step and opens it (Task 6 —
  // it no longer copies the last row's values) — give it distinct values
  // (minutes, not metres; 6k, not 2k) so the screenshot doesn't read as
  // four identical clones. A blank row already defaults to "min"
  // (newRow(), builderState.ts), so no unit switch is needed before typing;
  // "800" digits into the masked clock field renders as "8:00".
  await page.getByRole("button", { name: "+ ADD STEP" }).click();
  const lastRowLabel = "Row 6";
  await page
    .getByLabel(`${lastRowLabel} duration`, { exact: true })
    .fill("800");
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
  await neutralizeFixedTabBarForFullPageCapture(page);
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
