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
 * real numbers (durations, resolved targets) instead of the no-baselines
 * fallback ("—" / "no target"). Driven via an in-page fetch
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
 *  can exceed one viewport — "builder" and "confirm" (see the other tests
 *  in this file: neither of the rest sets `fullPage`, so neither of those
 *  is exposed to this). */
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

/** Activates a preset plan via the real `PUT /api/plan` route — same
 *  in-page-fetch idiom as `setBaselines` above, duplicated from
 *  `e2e/design.spec.ts`'s own `choosePlan` rather than shared (this
 *  codebase's established precedent for small per-file e2e helpers). */
async function choosePlan(
  page: Page,
  planKey: "sprint" | "head",
): Promise<void> {
  const result = await page.evaluate(async (key) => {
    const res = await fetch("/api/plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planKey: key }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, planKey);
  if (!result.ok) {
    throw new Error(`plan setup failed: ${result.status} ${result.body}`);
  }
}

/** Zeroes `doneN` via `PUT /api/plan {reset:true}` (keeps the already-set
 *  planKey — see planState.ts's own `reset`). Needed because `stores/
 *  logs.ts`'s `create` bumps `plan_state.done_n` on every logged session,
 *  and this file's screenshot accounts are fixed emails re-used on every
 *  `pnpm screenshots` run — without this, "SESSION N OF 84" would drift a
 *  little further every time the script reruns instead of landing on a
 *  stable, reviewable "SESSION 1 OF 84". Duplicated from `e2e/
 *  design.spec.ts`'s identical helper, added there for the same reason. */
async function resetPlanProgress(page: Page): Promise<void> {
  const result = await page.evaluate(async () => {
    const res = await fetch("/api/plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  });
  if (!result.ok) {
    throw new Error(`plan reset failed: ${result.status} ${result.body}`);
  }
}

/** Seeds `count` real logs via `POST /api/logs` so Today's LAST THREE
 *  renders its populated layout, not the "No sessions logged yet." empty
 *  state — duplicated from `e2e/design.spec.ts`'s identical helper. */
async function seedLogs(page: Page, count: number): Promise<void> {
  const result = await page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutId: null,
          workoutTitle: `Screenshot Session ${i + 1}`,
          workoutType: "AT",
          held: i % 2 === 0 ? "held" : "under",
          pain: 2,
          notes: null,
          steps: [
            {
              label: "Work",
              targetSplit: 120,
              actualSplit: 121,
              actualSource: "stopwatch",
            },
          ],
        }),
      });
      if (!res.ok) {
        return { ok: false, status: res.status, body: await res.text() };
      }
    }
    return { ok: true, status: 200, body: "" };
  }, count);
  if (!result.ok) {
    throw new Error(`log seed failed: ${result.status} ${result.body}`);
  }
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

// Replaces the old "signed-in-home" capture (Phase 6A Task 5): "/" has
// redirected to "/today" since Task 2, so a bare post-sign-in screenshot and
// a dedicated Today screenshot were always going to be the same route —
// keeping both would just be two images of one screen, one of them a stale,
// undersetup duplicate of the other (the same "one capture already subsumes
// the other" reasoning "workout-detail" used to retire its own predecessor
// below). The committed `signed-in-home.png` was additionally already stale
// two ways by the time this task started: it pre-dated the "/" -> "/today"
// flip entirely (still showed the old Library screen), and the one time it
// was regenerated (Task 4, sanity-checking an unrelated change) it raced
// Today's five concurrent data hooks and caught a bare "LOADING…" frame —
// the exact "wait for a real element, not just navigation" lesson `signin`
// above already carries a scar for. This capture seeds a plan and real
// history first specifically so it never reduces to that empty/loading
// state again.
//
// Task 3 (2026-08-04 round): three captures from one continuous flow — the
// same "multiple screenshots per test" idiom the "library" test below (and
// "today-unlogged" above it in history) already uses — now that DIFFICULTY/
// TIME/PAIN live behind a FILTER ⌄ sheet instead of always-on chip rows.
// `today.png` is the REST state (FILTER ⌄ beside SHUFFLE, no chip groups on
// screen); `today-sheet.png` and `today-filtered.png` mirror
// `library-sheet.png`/`library-filtered.png`'s own open/applied pair.
test("today", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-today@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await seedLogs(page, 3);
  await choosePlan(page, "sprint");
  await resetPlanProgress(page);
  await page.goto("/today");
  // Today shows "LOADING…" until all five of its data hooks resolve — wait
  // for the suggested-workout card itself before shooting.
  await page.locator(".today-card").waitFor();

  // REST: FILTER ⌄ beside SHUFFLE, no DIFFICULTY/TIME/PAIN chip groups on
  // the screen itself.
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today.png"),
  });

  // SHEET: open, all three groups (DIFFICULTY/TIME/PAIN), and the live-
  // counting primary (`Show N options`). Deselecting HARD is a real,
  // visible DIFFICULTY deviation with zero risk of a zero-result pool — the
  // 300-workout library's own O2 quota (today's sprint-plan code) has no
  // HARD entries at all (design.spec.ts's own SHUFFLE-disabled comment).
  await page.getByRole("button", { name: "FILTER ⌄" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "HARD", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Show \d+ options?$/ }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today-sheet.png"),
  });

  // FILTERED: applied — the DIFFICULTY token ("EASY–MEDIUM") and CLEAR ALL.
  await page.getByRole("button", { name: /^Show \d+ options?$/ }).click();
  await expect(page.locator(".filter-token")).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today-filtered.png"),
  });
});

// Task 3 (ui-fix round): the unlogged row's own staged Discard — a real
// timer run driven to /session/complete, then a bare `/today` nav WITHOUT
// logging it, is the only way to land a completed-but-unlogged run record
// (same "drive the real flow" idiom the "session-complete"/"log-session"
// captures above already use). Two captures, DEFAULT and ARMED, matching
// the design mockup's own labelled pair — `today-unlogged` doubles as the
// pair's shared setup since Playwright screenshots are just PNG writes, not
// a separate render each time.
test("today-unlogged", async ({ page }) => {
  const title = "Screenshot Unlogged Row Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-today-unlogged@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await importBulk(page, [`${title} | AN | easy | 1`, "w 0:03 6k"].join("\n"));
  await startFromLibrary(page, title);
  await page.getByRole("button", { name: "START" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
  await expect(page).toHaveURL(/\/session\/complete$/, { timeout: 6000 });
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Back to Today" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByText(/unlogged session/i)).toBeVisible();

  // DEFAULT: title + "unlogged session.", Log it, and the outlined ✕.
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today-unlogged.png"),
  });

  // ARMED: the same row's contents swapped in place — border to accent,
  // the discard question, and a solid "Tap again" replacing Log it/✕.
  await page.getByRole("button", { name: "Discard without logging" }).click();
  await expect(page.getByRole("button", { name: "Tap again" })).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today-unlogged-armed.png"),
  });

  await cleanupByTitle(page, title);
});

test("plan", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-plan@e2e.test",
    name: "Screenshot Tester",
  });
  await choosePlan(page, "sprint");
  await resetPlanProgress(page);
  await page.goto("/plan");
  // With no plan chosen, /plan renders two preset cards instead — a
  // different, already-reachable layout. Wait for the real 84-row sequence,
  // the state this capture exists to show.
  await page.locator(".plan-sequence").waitFor();
  await expect(page.locator(".plan-row")).toHaveCount(84);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "plan.png"),
  });
});

// Task 4 (ui-fix round): three captures from one continuous flow — the same
// "multiple screenshots per test" idiom "today-unlogged" above uses for its
// DEFAULT/ARMED pair. `library.png` is now the REST state proper (DESIGN.md's
// own "1 · AT REST" — FILTER ⌄ + a plain count, no tokens), so the CUSTOM
// badge showcase this test always did moves to `library-filtered.png`
// instead of being baked into the rest capture.
test("library", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-library@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);

  // Phase 5H: personal (non-global) workouts now wear a CUSTOM badge on
  // the library row's second line. Every seeded library workout is
  // global, so without authoring one of its own first, no capture below
  // would ever show the badge at all — same reasoning as "workout-detail"'s
  // own builder-authored personal workout further down. Simplest valid
  // form: title + pain + one row's duration.
  const customTitle = "Screenshot Custom Workout";
  await page.goto("/library/new");
  await page.getByLabel("Title").fill(customTitle);
  await page.getByRole("button", { name: "Pain 3" }).click();
  await page.getByLabel("Row 1 duration", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "Save to library" }).click();
  await expect(page).toHaveURL(/\/library\/[^/]+$/);

  await page.goto("/library");
  // Library shows "LOADING…" until the workouts/baselines fetches resolve;
  // page.goto only waits for the navigation's load event, not that — wait
  // for a real row so the screenshot isn't just the loading state.
  await page.locator(".workout-row").first().waitFor();

  // REST: FILTER ⌄ + "N WORKOUTS", no tokens.
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "library.png"),
  });

  // SHEET: open, with SOURCE=CUSTOM selected but not yet applied — the
  // live-counting singular-aware "Show 1 workout" primary (fix round 2,
  // whole-branch review M2) is the point of this capture.
  await page.getByRole("button", { name: "FILTER ⌄" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "CUSTOM", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Show 1 workout" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "library-sheet.png"),
  });

  // FILTERED: applied — the SOURCE token, the narrowed count, and (the
  // library sorts the 36 global starter workouts ahead of the one
  // freshly-authored personal one, so filtering is what actually gets the
  // CUSTOM badge into frame) the isolated custom row.
  await page.getByRole("button", { name: "Show 1 workout" }).click();
  await expect(page.locator(".workout-row-custom").first()).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "library-filtered.png"),
  });

  await cleanupByTitle(page, customTitle);
});

// Phase 6E fix round: "library.png" above deliberately captures the
// Phase 5H CUSTOM-filter single-row state, so it never shows what the
// screen actually looks like for the vast majority of visits — the
// unfiltered list of the real generated 300. This capture is that missing
// state: no CUSTOM filter, scrolled to the top, so the committed image
// shows genuine library rows (sorted O2-first, "Sea Fret" leading per
// ROADMAP.md's Phase 6E entry) and the real "300 ENTERED" count header,
// not a single custom row against a near-empty background.
test("library-seeded", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-library-seeded@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);

  await page.goto("/library");
  // Same "LOADING…" race as the "library" capture above — wait for a real
  // row before shooting.
  await page.locator(".workout-row").first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "library-seeded.png"),
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
  // for `!workout.isGlobal`, and every seeded library workout is global, so
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
  await page.getByRole("button", { name: "DONE" }).click();

  // Row 2 (Phase 5G): a MAX-effort row, so the committed detail capture
  // shows a real resolved effort word ("ALL OUT") next to an ordinary
  // resolved split range, not just the latter — the visual record this
  // phase's ledger calls for.
  await page.getByRole("button", { name: "+ ADD STEP" }).click();
  await page.getByLabel("Row 2 duration", { exact: true }).fill("30");
  await page.getByRole("radio", { name: "Row 2 pace MAX" }).click();
  const row2SpmUp = page.getByRole("button", {
    name: "Row 2 stroke rate up",
  });
  await row2SpmUp.click();
  await row2SpmUp.click();

  await page.getByRole("button", { name: "Save to library" }).click();
  await expect(page).toHaveURL(/\/library\/[^/]+$/);
  await page.locator(".workout-detail-title").waitFor();
  await expect(page.getByText("ALL OUT")).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "workout-detail.png"),
  });

  await cleanupByTitle(page, title);
});

// Confirm targets (Phase 6A Task 4/5): a personal workout authored via bulk
// import (the only way to land a standalone REST row and a reps marker in
// the same workout — `+ REST`/`+ WARM-UP` aren't authorable from a blank
// create-mode builder, per docs/design/DEVIATIONS.md's "+ ADD ROW" row) so
// the committed capture shows every step-row shape Confirm targets renders:
// WARM-UP (DUR only), REPEAT xN (REPS stepper, no remove/restore — the
// binding decision from Task 1's review), a work row (DUR + SPM + resolved
// TARGET + nudges), and a standalone REST row (DUR only) — plus one row
// struck, so the removed-row treatment (sunken background, struck label)
// is part of the visual record too, not just the "everything present"
// state "confirm" would otherwise only ever show.
test("confirm", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-confirm@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);

  const title = "Screenshot Confirm Workout";
  await page.goto("/library/import");
  const text = [
    `${title} | AT | medium | 3`,
    "wu 5",
    "x3",
    "w 1' 6k @22",
    "r 2",
  ].join("\n");
  await page.getByLabel("Bulk import text").fill(text);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);

  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/session\/confirm$/);
  await page.locator(".confirm-recount").waitFor();

  // Strike the REST row (Row 4: wu, reps marker, w, r) — the ordinary
  // removed-row case, distinct from the marker row's own no-remove-control
  // treatment covered by the design sweep instead of a screenshot.
  await page.getByRole("button", { name: "Remove Row 4" }).click();
  await expect(
    page.getByRole("button", { name: "Restore Row 4" }),
  ).toBeVisible();

  // Fix (final whole-branch review): four step-editor rows plus the header
  // push `.confirm-footer` (the recount + "Looks right, start" — the
  // screen's one L1) below the 390×844 viewport, so a viewport-only
  // capture used to cut it off entirely. Same fullPage + fixed-tabbar
  // neutralizer as "builder" above, for the same reason: a fullPage
  // capture on a document taller than the viewport stitches the fixed
  // `.tabbar` into the middle of the image unless it's made non-fixed
  // first.
  await neutralizeFixedTabBarForFullPageCapture(page);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "confirm.png"),
    fullPage: true,
  });

  await cleanupByTitle(page, title);
});

/** Fills the top-level fields plus a seven-step body so the committed
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
 *  Step 5 (Phase 5G): a MAX effort row (`0:30 @ MAX`), collapsed like every
 *  other step above it — this is the one the committed image exists to
 *  show: the collapsed StepCard reads `0:30 @ MAX` on its summary line and
 *  `ALL OUT` in its resolved-target slot, proving the effort-chip feature
 *  reads correctly in the folded state, not just the open editor.
 *  Step 6: "+ ADD STEP" appends a seventh, deliberately different row (a
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

  // Step 5 (Phase 5G): a fresh MAX-effort row, collapsed via DONE like every
  // step above it — "30" into the masked clock field renders as "0:30".
  // Row 1 + Row 2 + three ⧉ duplicates (Rows 3-5) already occupy the first
  // five slots, so this freshly-added row lands as Row 6.
  await page.getByRole("button", { name: "+ ADD STEP" }).click();
  await page.getByLabel("Row 6 duration", { exact: true }).fill("30");
  await page.getByRole("radio", { name: "Row 6 pace MAX" }).click();
  const maxRowSpmUp = page.getByRole("button", {
    name: "Row 6 stroke rate up",
  });
  for (let i = 0; i < 13; i++) {
    await maxRowSpmUp.click();
  }
  await page.getByRole("button", { name: "DONE" }).click();

  // Step 6 (7th row overall): "+ ADD STEP" appends a blank work step and
  // opens it (Task 6 — it no longer copies the last row's values) — give it
  // distinct values (minutes, not metres; 6k, not 2k) so the screenshot
  // doesn't read as clones of the earlier rows. A blank row already
  // defaults to "min" (newRow(), builderState.ts), so no unit switch is
  // needed before typing; "800" digits into the masked clock field renders
  // as "8:00".
  await page.getByRole("button", { name: "+ ADD STEP" }).click();
  const lastRowLabel = "Row 7";
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
  // Row 7 is left EXPANDED here (no DONE press) — this is the one card the
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

  // Seven steps total (Phase 5G added the MAX row): six collapsed cards
  // (StepCard.tsx) and exactly one open editor (StepEditor.tsx) — the
  // accordion invariant this whole redesign exists to prove, captured live
  // before any save. Every collapsed row resolves a target (five splits
  // against the set baselines, one effort word for the MAX row); the open
  // row shows its own resolved (exact) split in the TARGET strip instead.
  await expect(page.locator(".step-card")).toHaveCount(6);
  await expect(page.locator(".step-card-split")).toHaveCount(6);
  await expect(page.locator(".step-editor")).toHaveCount(1);
  await expect(page.locator(".step-editor-target-value")).toHaveCount(1);
  // The MAX row's own collapsed summary — this is the shot the phase's
  // ledger note calls out: `0:30 @ MAX` visible in the folded list, not
  // just inside an open editor.
  await expect(page.getByText("0:30 @ MAX")).toBeVisible();
  await expect(
    page.locator(".step-card-split", { hasText: "ALL OUT" }),
  ).toBeVisible();
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

// Phase 6B (Task 5): the pre-workout countdown, live timer (portrait +
// 844×420 landscape), and session-complete screens. Every capture drives a
// bulk-imported, non-empty workout through the real START -> countdown ->
// timer flow (never a hand-built minimum) — same three-step idiom as e2e/
// design.spec.ts's/e2e/session.spec.ts's own identical helpers, duplicated
// here per this file's own stated precedent (see `cleanupByTitle`'s own
// comment above) rather than shared across files.

/** Bulk-imports `text` and waits for the redirect back to /library. */
async function importBulk(page: Page, text: string): Promise<void> {
  await page.goto("/library/import");
  await page.getByLabel("Bulk import text").fill(text);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
}

/** Opens `title`'s detail page from the library list and presses Start,
 *  landing on Confirm. */
async function startFromLibrary(page: Page, title: string): Promise<void> {
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/session\/confirm$/);
}

test("countdown", async ({ page }) => {
  const title = "Screenshot Countdown Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-countdown@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  // A warm-up-first, three-step ladder — the realistic shape the seeded
  // library itself uses (CLAUDE.md's own "test against a realistic
  // fixture" rule), not a single bare work step. The countdown's own
  // next-phase line reads the CURRENT (warm-up) phase's resolved label —
  // "Easy" — the same never-a-dash word every warm-up phase resolves to.
  await importBulk(
    page,
    [
      `${title} | AT | medium | 3`,
      "wu 5",
      "w 4:00 6k @20 r1",
      "w 3:00 6k @18",
    ].join("\n"),
  );
  await startFromLibrary(page, title);
  await page.getByRole("button", { name: "START" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
  await expect(page.getByText("GET ON THE HANDLE")).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "countdown.png"),
  });
  await cleanupByTitle(page, title);
});

test("timer", async ({ page }) => {
  const title = "Screenshot Timer Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-timer@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  // Two work steps with a rest between them (the `r1.5` suffix expands to
  // its own REST phase — domain/expand.js) — three phases total, so the
  // committed capture shows a real, populated dots row, STEP line, resolved
  // TARGET SPLIT/RATE cards, and a meaningful UP NEXT (the rest phase),
  // landing on the WORK phase itself (phase 0) — the brief's own "work
  // phase, targets visible" case, not the warm-up "countdown.png" already
  // shows.
  await importBulk(
    page,
    [`${title} | AT | medium | 3`, "w 4:00 6k @20 r1.5", "w 4:00 6k @20"].join(
      "\n",
    ),
  );
  await startFromLibrary(page, title);
  await page.getByRole("button", { name: "START" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
  await expect(page.getByText(/^STEP 1 OF 3/)).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "timer.png"),
  });
  await cleanupByTitle(page, title);
});

test("timer-landscape", async ({ page }) => {
  const title = "Screenshot Timer Landscape Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-timer-landscape@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  // Same fixture as "timer" above — three phases, so the landscape-only
  // "then …" UP NEXT line (Timer.tsx's `thenNextText`) has something real
  // to resolve to (the second work phase, past the rest phase UP NEXT
  // already names).
  await importBulk(
    page,
    [`${title} | AT | medium | 3`, "w 4:00 6k @20 r1.5", "w 4:00 6k @20"].join(
      "\n",
    ),
  );
  await startFromLibrary(page, title);
  await page.getByRole("button", { name: "START" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
  await expect(page.getByText(/^STEP 1 OF 3/)).toBeVisible();
  // The handoff's own landscape reference frame (docs/design/README.md).
  await page.setViewportSize({ width: 844, height: 420 });
  await expect(page.locator(".timer-upnext-then")).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "timer-landscape.png"),
  });
  await cleanupByTitle(page, title);
});

test("session-complete", async ({ page }) => {
  const title = "Screenshot Session Complete Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-session-complete@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  // Same tiny time-phase-then-distance-phase shape as e2e/session.spec.ts's
  // own completion test: the time phase auto-advances in ~3s, then the
  // distance phase's actual gets recorded on NEXT, producing the committed
  // capture's one real, non-dash split.
  await importBulk(
    page,
    [`${title} | AN | easy | 1`, "w 0:03 6k", "w 100m max"].join("\n"),
  );
  await startFromLibrary(page, title);
  await page.getByRole("button", { name: "START" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
  await expect(page.getByText(/^STEP 1 OF 2/)).toBeVisible();
  await expect(page.getByText("STEP 2 OF 2 · WORK · 100M")).toBeVisible({
    timeout: 6000,
  });
  // SCREENSHOT_BASELINES' own k2Seconds (112.0) prices this 100m/max
  // phase's estimate at ~22.4s (domain/expand.js's own phaseSeconds
  // formula, via estimationSplit's own max-effort branch) — landing NEXT
  // around 20s in sits safely inside Timer.tsx's own non-suspect window
  // (11.2s-44.8s), the same "land centered, not at either edge" reasoning
  // e2e/session.spec.ts's own completion test documents for its own
  // (smaller) baseline pair.
  await page.waitForTimeout(20_000);
  await page.getByRole("button", { name: "NEXT →" }).click();
  await expect(page.getByText("Finish this session?")).toBeVisible();
  await page.getByRole("button", { name: "Finish session" }).click();
  await expect(page).toHaveURL(/\/session\/complete$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator(".complete-actual-row")).toHaveCount(1);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "session-complete.png"),
  });
  await cleanupByTitle(page, title);
});

// Task 3 (ui-fix round): the new Discard without logging block (rule + L4)
// pushed this screen's landscape content past its own tight budget (the
// reviewer's own F8 note) — index.css's landscape media query for
// `.session-complete-screen`/`.complete-actions` was retuned to fit it; this
// capture is the visual record of that fit, same idiom as "timer-landscape"
// above.
test("session-complete-landscape", async ({ page }) => {
  const title = "Screenshot Session Complete Landscape Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-session-complete-landscape@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await importBulk(
    page,
    [`${title} | AN | easy | 1`, "w 0:03 6k", "w 100m max"].join("\n"),
  );
  await startFromLibrary(page, title);
  await page.getByRole("button", { name: "START" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
  await expect(page.getByText(/^STEP 1 OF 2/)).toBeVisible();
  await expect(page.getByText("STEP 2 OF 2 · WORK · 100M")).toBeVisible({
    timeout: 6000,
  });
  await page.waitForTimeout(20_000);
  await page.getByRole("button", { name: "NEXT →" }).click();
  await expect(page.getByText("Finish this session?")).toBeVisible();
  await page.getByRole("button", { name: "Finish session" }).click();
  await expect(page).toHaveURL(/\/session\/complete$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator(".complete-actual-row")).toHaveCount(1);
  // The handoff's own landscape reference frame.
  await page.setViewportSize({ width: 844, height: 420 });
  await expect(
    page.getByRole("button", { name: "Discard without logging" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "session-complete-landscape.png"),
  });
  await cleanupByTitle(page, title);
});

test("log-session", async ({ page }) => {
  test.setTimeout(90_000); // a real 60s step, not this file's usual ~3s ones
  const title = "Screenshot Log Session Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-log-session@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  // F1 (whole-branch review): the FIRST capture used two split-ref steps
  // (one "2k", one "6k") to show the PACES LOCKED panel's own two-slot
  // form — but ZERO of the library's 300 generated workouts reference both
  // bases in one workout (LogSession.tsx's own reconciled comment, Task
  // 11/12; the taste pass, 9b9fde5, converted AT's last remaining 2k-base
  // refs to 6k — 3 workouts mixed both before that pass), so that shape
  // never occurs in production and the panel showing both is a
  // synthetic-fixture-only case, not something a real session hits. This
  // capture uses a REAL single-base shape instead — one 60-SECOND (not an
  // artificially tiny 3s) split-ref
  // TIME step at "6k" (off 0) — so the TOTAL reads as a genuine non-zero
  // "1 MIN" rather than the earlier capture's misleading "0 MIN", and the
  // PACES LOCKED panel shows only the 6K half, matching what an actual
  // rower would see. SCREENSHOT_BASELINES' own k6Seconds (122.0) is the
  // design handoff's own literal reference split (README.md §7: "…6K
  // 2:02.0"). A single TIME phase completes the run automatically once
  // it's the last one — no NEXT/finish-stage click needed (the same fact
  // e2e/session.spec.ts's own "two browser BACKs…" test relies on).
  await importBulk(
    page,
    [`${title} | AT | medium | 3`, "w 1:00 6k"].join("\n"),
  );
  await startFromLibrary(page, title);
  await page.getByRole("button", { name: "START" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
  await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();
  await expect(page).toHaveURL(/\/session\/complete$/, { timeout: 70_000 });
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByRole("link", { name: "Log this session" }).click();
  await expect(page).toHaveURL(/\/session\/log$/);
  await expect(
    page.getByRole("heading", { name: `Log ${title}` }),
  ).toBeVisible();
  // Only 6K renders (F1) — this workout's one step never references "2k".
  await expect(page.locator(".log-paces-value")).toHaveText("6K 2:02.0");
  // A real, non-zero total — the exact defect F1 found in the prior capture.
  await expect(page.locator(".log-meta")).not.toContainText("0 MIN");

  // Realistic, non-empty state (CLAUDE.md's own "screenshots that capture
  // empty states" rule): a real Held answer, pain level, and note, not the
  // screen's own just-opened blank form.
  await page.getByRole("button", { name: "HELD" }).click();
  await page.getByRole("button", { name: "Pain 2" }).click();
  await page.getByLabel("NOTES").fill("Felt strong for the full minute.");

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "log-session.png"),
  });
  await cleanupByTitle(page, title);
});

// Phase 6C Task 4: the Log screen's OTHER door (Task 3, `/library/:id/log`)
// — visibly distinct from the session door above (no tab-bar hiding, no
// Discard button at all, reached straight from a workout's detail screen
// rather than the timer's own hand-off), so per the plan's own "both doors
// if visibly distinct" clause this gets its own capture too. Same single-
// base "6k" shape and SCREENSHOT_BASELINES pairing as the session door's
// capture, so the two images read as the same product's two doors, not two
// different products — and no real timer run is needed at all here, so this
// test needs none of that one's extended timeout.
//
// Today enhancements (Task 4): a plan is chosen here too, specifically so
// this capture also shows the plan toggle (`.log-plan-toggle`) — no
// screenshot fixture ever activated a plan on the Log screen before this,
// so the toggle had never appeared in a committed capture at all. Left in
// its default ("COUNTS TOWARD PLAN …") state rather than toggled, since
// that's what a rower logging a genuine plan session actually sees; the
// toggled ("OUTSIDE THE PLAN") state is covered instead by design.spec.ts's
// own dedicated sweep, which measures and axes BOTH states.
test("log-session-manual", async ({ page }) => {
  const title = "Screenshot Log Session Manual Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-log-session-manual@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await choosePlan(page, "sprint");
  await resetPlanProgress(page);
  await importBulk(
    page,
    [`${title} | AT | medium | 3`, "w 1:00 6k"].join("\n"),
  );
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("link", { name: "Log it after" }).click();
  await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);
  await expect(
    page.getByRole("heading", { name: `Log ${title}` }),
  ).toBeVisible();
  // Same 6K value as the session door's own capture (SCREENSHOT_BASELINES'
  // k6Seconds, 122.0 -> "2:02.0") — the manual door reads CURRENT baselines
  // directly (the lock moment IS save time, Task 3's brief), which happen
  // to be identical to what the session door's run locked here since
  // neither test ever changes a baseline mid-flow.
  await expect(page.locator(".log-paces-value")).toHaveText("6K 2:02.0");
  // No Discard button at all on this door — the visible difference the
  // screenshot pair exists to show.
  await expect(page.getByRole("button", { name: /discard/i })).toHaveCount(0);
  // The plan toggle, default state — a plan is active for this fixture now.
  await expect(
    page.getByRole("button", { name: /COUNTS TOWARD PLAN/ }),
  ).toContainText("SESSION 1 OF 84");

  // Realistic, non-empty state (CLAUDE.md's own "no empty-state screenshots"
  // rule), same values as the session door's own capture for a fair visual
  // comparison between the two doors.
  await page.getByRole("button", { name: "HELD" }).click();
  await page.getByRole("button", { name: "Pain 2" }).click();
  await page
    .getByLabel("NOTES")
    .fill("Rowed at the gym, logging it after the fact.");

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "log-session-manual.png"),
  });
  await cleanupByTitle(page, title);
});
