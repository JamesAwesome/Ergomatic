import { test, expect, type Page } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

// The authoring loop: /library/new -> save -> /library/:id, plus bulk paste,
// edit, and delete. Against the real compose stack (nginx + api + postgres —
// see docs/TESTING.md's pyramid), so this proves the wiring, not the Erg
// Book math itself (domain/pace.test.ts and domain/bulk.test.ts own that).
//
// Every test signs in as its own unique email (a fresh, workout-free user)
// and sets these same baselines, matching the task brief. The server orders
// workouts itself now (no user-visible `num` field), so there's nothing left
// to clash on across reruns — titles here are still spec-distinctive, and
// each test deletes its own workout again at the end via `cleanupByTitle` so
// a re-run against a dirty database (same email -> same user row) doesn't
// accumulate stale rows.
//
// The builder is an accordion now (docs/design/builder-redesign/README.md,
// wired up by src/builder/Builder.tsx/StepCard.tsx/StepEditor.tsx): a fresh
// form opens its one row for editing; every other row renders as a
// collapsed ~86px StepCard with inline EDIT/duplicate/delete, and only one
// StepEditor is ever mounted at a time. SPM/REST/PACE-offset/REPEAT are all
// "− value +" Stepper controls (src/builder/Stepper.tsx), not typable
// fields, and EXPECTED PAIN/TYPE are plain toggle buttons
// (`aria-pressed`), not radios — see ClassificationCard.tsx.
const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

/** Sets baselines for the signed-in user via an in-page `fetch`, not
 *  Playwright's `page.request`: the api container runs with
 *  NODE_ENV=production, so the session cookie is Set-Cookie'd with `Secure`
 *  — Chromium exempts http://127.0.0.1 from that (the loopback "potentially
 *  trustworthy origin" carve-out), but Playwright's Node-side
 *  APIRequestContext does not, so `page.request.put` 401s here even though
 *  the identical request from the loaded page succeeds. Copied from
 *  screenshots.spec.ts's own `setBaselines`. */
async function setBaselines(page: Page): Promise<void> {
  const result = await page.evaluate(async (patch) => {
    const res = await fetch("/api/baselines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, BASELINES);
  if (!result.ok) {
    throw new Error(`baseline setup failed: ${result.status} ${result.body}`);
  }
}

/** Test-only cleanup: finds the signed-in user's own workout with the given
 *  title via the real API and deletes it, so a workout this spec creates
 *  never lingers into the next run. Same in-page-`fetch` idiom as
 *  `setBaselines` above, for the same Secure-cookie reason. A no-op (not a
 *  failure) if the title isn't found, so a test that already asserted a
 *  delete happened can still call this defensively. */
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

test.describe("authoring loop", () => {
  test("the phase exit criterion: 6k-2 @ 22spm resolves against the real 6k baseline on detail", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-exit@e2e.test",
      name: "Builder Exit Tester",
    });
    await setBaselines(page);
    await page.goto("/library/new");

    const title = "Exit Criterion Row";
    await page.getByLabel("Title").fill(title);
    // EXPECTED PAIN's chips are plain toggle buttons (aria-pressed), not
    // radios (ClassificationCard.tsx) — each carries its own
    // `aria-label="Pain N"`.
    await page.getByRole("button", { name: "Pain 3" }).click();
    // A fresh builder opens Row 1's editor immediately (Builder.tsx: nothing
    // to scan yet, only something to fill in) — no EDIT tap needed here.
    // The duration field is a masked numeric-pad clock field now
    // (ClockInput, Task 3/4): digits fill right to left into seconds then
    // minutes, so "2000" produces "20:00" (20 minutes), not "20" (20
    // seconds).
    await page.getByLabel("Row 1 duration", { exact: true }).fill("2000");
    // Base defaults to 6k (builderState.ts's newRow) — two clicks on the
    // faster stepper reaches the "-2" offset the exit criterion needs.
    const fasterButton = page.getByRole("button", {
      name: "Row 1 pace faster",
    });
    await fasterButton.click();
    await fasterButton.click();
    // SPM is a Stepper (StepEditor.tsx) — typable since Phase 5F Task 5, but
    // pressing the button still wakes at 20 from empty, then steps by 1, so
    // three presses reaches 22.
    const spmUp = page.getByRole("button", { name: "Row 1 stroke rate up" });
    await spmUp.click();
    await spmUp.click();
    await spmUp.click();

    // With a 6k baseline of 122.0s: 122 - 2 = 120.0 -> "2:00.0" exact
    // (ui-fix round, Item 1: the tolerance band retired from every display
    // call site). The builder resolves this live (StepEditor.tsx's TARGET
    // strip), before any save —
    // check it here too, not just on the post-save detail screen below, so
    // a failure here (bad live math) isn't confused with a failure there
    // (bad round-trip through the API).
    await expect(page.locator(".step-editor-target-value")).toHaveText(
      "2:00.0",
    );

    await page.getByRole("button", { name: "Save to library" }).click();

    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
    // WorkoutDetail's own resolved-target class (StepRow.tsx) — untouched by
    // the builder redesign.
    await expect(page.locator(".step-row-range").first()).toHaveText("2:00.0");

    await cleanupByTitle(page, title);
  });

  // CL item (BACK-walks-the-stack batch, whole-batch review): bulk import
  // used to insert block-by-block in a plain loop, so a bad LATER block
  // left the good EARLIER block created — and re-pasting the same text
  // after fixing the bad line duplicated it. This e2e twin of the
  // server-level fix pinned the OLD partial-success contract (a real CI
  // catch: the scoped gate table's own blind spot — B3 was server-only,
  // so no gate re-ran this file). Rewritten to the all-or-nothing truth,
  // stronger than the row it replaces: zero created AND the per-line
  // error AND the honest end-to-end proof (Library itself, not just the
  // response body) that the good block never landed — then the recovery
  // arc that is the actual point of the CL item: fix the one bad line,
  // re-paste the WHOLE text, and both blocks land exactly once.
  test("a bulk paste with one bad pace ref creates NOTHING — re-pasting the corrected text afterward creates both, with no duplicate", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-bulk@e2e.test",
      name: "Builder Bulk Tester",
    });
    await setBaselines(page);
    // Bulk import is its own screen now (Library's IMPORT link / BulkImport
    // route in AppRoutes.tsx) — there's no in-builder toggle to click any
    // more.
    await page.goto("/library/import");

    // Two blocks, blank-line separated (domain/bulk.ts's splitBlocks). The
    // first is entirely valid; the second's only work step references "9k",
    // which parsePaceRef (domain/pace.ts) never accepts (2k/6k only), so the
    // whole PASTE is rejected — all-or-nothing, not just the second block.
    // Line numbers are 1-based over the raw pasted text (including the
    // blank separator) — the bad ref sits on line 5. No `wu` line in either
    // block: this test's subject is all-or-nothing plus line-number
    // reporting, not warm-ups, and a `wu` line would just get silently
    // dropped (2026-08-09 warmup-setting spec) without changing the
    // numbering (bulk.ts's `RawLine.lineNumber` is assigned before any
    // drop), so it would only add noise here. The wu lines this block used
    // to carry are why the bad ref moved from line 7 to line 5.
    const text = [
      "9410 | Bulk Good | O2 | easy | 2",
      "w 10' 6k @20",
      "",
      "9411 | Bulk Bad | O2 | easy | 2",
      "w 10' 9k @20",
    ].join("\n");
    await page.getByLabel("Bulk import text").fill(text);
    await page.getByRole("button", { name: "Import", exact: true }).click();

    await expect(page.locator(".bulk-import-errors li")).toHaveText(
      "line 5: bad pace ref: 9k",
    );
    // The reversal: this used to read "1 created" (the good block landed
    // despite the bad one) — all-or-nothing means zero, even though only
    // the SECOND block was actually invalid.
    await expect(page.locator(".bulk-import-result .mono-status")).toHaveText(
      "0 created",
    );

    // Any error at all deliberately keeps the rower on this panel
    // (BulkImport.tsx) rather than navigating away.
    await expect(page).toHaveURL(/\/library\/import$/);

    // The honest end-to-end proof: the good block genuinely never landed
    // in the real store — not merely that the response body claims zero,
    // which a route that still inserted rows behind a lying `created: []`
    // would also show here.
    await page.goto("/library");
    await expect(
      page.getByText("Bulk Good", { exact: false }),
    ).not.toBeVisible();

    // The recovery arc — the actual defect the CL item existed to kill:
    // fix the one bad line and re-paste the WHOLE text again. Before the
    // fix, "Bulk Good" would already have landed on the first attempt, so
    // this second paste would create it a SECOND time; proving that means
    // asserting both blocks land exactly once each, not merely that the
    // corrected paste succeeds.
    await page.goto("/library/import");
    const fixedText = text.replace("9k", "6k");
    await page.getByLabel("Bulk import text").fill(fixedText);
    await page.getByRole("button", { name: "Import", exact: true }).click();

    // A clean import (zero errors) navigates away automatically
    // (BulkImportRoute's onImported in AppRoutes.tsx).
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByText("Bulk Good", { exact: false })).toBeVisible();
    await expect(page.getByText("Bulk Bad", { exact: false })).toBeVisible();
    // Exactly one of each — the duplicate-on-retry defect would show two.
    await expect(page.getByText("Bulk Good", { exact: false })).toHaveCount(1);
    await expect(page.getByText("Bulk Bad", { exact: false })).toHaveCount(1);

    await cleanupByTitle(page, "Bulk Good");
    await cleanupByTitle(page, "Bulk Bad");
  });

  test("editing a saved workout's title changes what its detail screen shows", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-edit@e2e.test",
      name: "Builder Edit Tester",
    });
    await setBaselines(page);
    await page.goto("/library/new");

    const originalTitle = "Edit Target Row";
    await page.getByLabel("Title").fill(originalTitle);
    await page.getByRole("button", { name: "Pain 2" }).click();
    // "1000" digits into the masked clock field renders as "10:00".
    await page.getByLabel("Row 1 duration", { exact: true }).fill("1000");
    await page.getByRole("radio", { name: "Row 1 pace 2K" }).click();
    await page.getByRole("button", { name: "Save to library" }).click();

    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(
      originalTitle,
    );

    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+\/edit$/);

    const renamedTitle = "Renamed Row";
    const titleInput = page.getByLabel("Title");
    await expect(titleInput).toHaveValue(originalTitle);
    await titleInput.fill(renamedTitle);
    await page.getByRole("button", { name: "Save to library" }).click();

    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(
      renamedTitle,
    );

    await cleanupByTitle(page, renamedTitle);
  });

  test("deleting a workout removes it from the library list", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-delete@e2e.test",
      name: "Builder Delete Tester",
    });
    await setBaselines(page);
    await page.goto("/library/new");

    const title = "Delete Me Row";
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Pain 1" }).click();
    // "500" digits into the masked clock field renders as "5:00".
    await page.getByLabel("Row 1 duration", { exact: true }).fill("500");
    await page.getByRole("radio", { name: "Row 1 pace 2K" }).click();
    await page.getByRole("button", { name: "Save to library" }).click();

    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

    await page
      .getByRole("button", { name: "Delete workout", exact: true })
      .click();
    // Fix round 1 (F2): Delete workout arms IN PLACE (the level system's
    // own L4/L4-armed idiom) rather than opening a side confirm panel — the
    // destructive action still never fires on the first press.
    await page.getByRole("button", { name: "Tap again to delete" }).click();

    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByText(title, { exact: false })).not.toBeVisible();
  });

  test("a global library workout's detail shows no Edit or Delete control", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-global@e2e.test",
      name: "Builder Global Tester",
    });
    await setBaselines(page);
    await page.goto("/library");

    // A brand-new user has no personal workouts yet, so every row on a
    // fresh /library is one of the seeded global workouts (server/seed/
    // library/index.ts) — the first is as good as any for asserting the
    // read-only affordance.
    await page.locator(".workout-row").first().click();
    await expect(page.locator("h1.workout-detail-title")).toBeVisible();

    // WorkoutDetail.tsx renders OwnerActions (Edit link + Delete button)
    // only for `!workout.isGlobal` — confirm the whole block is absent, not
    // just that the individual controls are, so this also catches a future
    // refactor that renders the wrapper without its children.
    await expect(page.locator(".workout-owner-actions")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Delete workout", exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("new controls this phase introduced", () => {
  test("authoring a duration through the masked numeric field saves and appears in the Library, with no legacy number field", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-bare-duration@e2e.test",
      name: "Builder Bare Duration Tester",
    });
    await setBaselines(page);
    await page.goto("/library/new");

    const title = "Bare Duration Row";
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Pain 2" }).click();
    // "500" digits into the masked clock field renders as "5:00" (5
    // minutes) — there is no numeric "No." field anywhere on this screen to
    // fill in the first place.
    await page.getByLabel("Row 1 duration", { exact: true }).fill("500");
    await page.getByRole("radio", { name: "Row 1 pace 2K" }).click();
    await page.getByRole("button", { name: "Save to library" }).click();

    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

    await page.goto("/library");
    await expect(page.getByText(title, { exact: false })).toBeVisible();

    await cleanupByTitle(page, title);
  });

  test("authoring a 0:45 step through the masked field saves and reappears in the edit form", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-clock-45@e2e.test",
      name: "Builder Clock 45 Tester",
    });
    await setBaselines(page);
    await page.goto("/library/new");

    const title = "Clock 45 Row";
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Pain 3" }).click();
    // "45" digits into the masked clock field renders as "0:45" (45
    // seconds) — a flow that only ever authors whole minutes would pass no
    // matter how badly the mask worked, so this is the one flow that
    // actually exercises sub-minute precision end to end.
    const durationField = page.getByLabel("Row 1 duration", { exact: true });
    await durationField.fill("45");
    await expect(durationField).toHaveValue("0:45");
    await page.getByRole("button", { name: "Save to library" }).click();

    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

    // Reappears: opening the saved workout for edit round-trips the same
    // 45-second value back through `fromWorkout`/`stepToRow`, not just
    // whatever the form happened to hold before the page navigated away.
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+\/edit$/);
    await page
      .locator(".builder-step-list > div")
      .first()
      .getByRole("button", { name: "EDIT" })
      .click();
    await expect(
      page.getByLabel("Row 1 duration", { exact: true }),
    ).toHaveValue("0:45");

    await cleanupByTitle(page, title);
  });

  // CL remainder Task 2: leaving the builder mid-edit and coming back used
  // to lose everything typed — there was zero e2e coverage of leaving the
  // builder at all (verified 2026-08-10). These three flows are against
  // the REAL Library screen (its "+ NEW" link, `library-new` class — not
  // the brief's own UNVERIFIED "new workout" guess) and the real tab bar
  // (`LIBRARY`, all-caps — Playwright's string `name` match is
  // case-insensitive substring, so "Library" matches it).
  test.describe("builder draft persistence", () => {
    test("typed content survives a tab-bar exit and return", async ({
      page,
    }) => {
      await signInViaBackdoor(page, {
        email: "builder-draft-survive@e2e.test",
        name: "Builder Draft Survive Tester",
      });
      await setBaselines(page);
      await page.goto("/library/new");

      await page.getByLabel("Title").fill("Draft survives");
      await page.getByRole("link", { name: "Library" }).click();
      await expect(page).toHaveURL(/\/library$/);

      await page.getByRole("link", { name: "+ NEW" }).click();
      await expect(page).toHaveURL(/\/library\/new$/);
      await expect(page.getByText("Draft restored.")).toBeVisible();
      await expect(page.getByLabel("Title")).toHaveValue("Draft survives");
    });

    test("START OVER is two-tap and resets the form", async ({ page }) => {
      await signInViaBackdoor(page, {
        email: "builder-draft-startover@e2e.test",
        name: "Builder Draft Start Over Tester",
      });
      await setBaselines(page);
      await page.goto("/library/new");

      await page.getByLabel("Title").fill("Doomed draft");
      await page.getByRole("link", { name: "Library" }).click();
      await page.getByRole("link", { name: "+ NEW" }).click();
      await expect(page.getByText("Draft restored.")).toBeVisible();

      const startOver = page.getByRole("button", { name: "START OVER" });
      await startOver.click();
      const tapAgain = page.getByRole("button", {
        name: "Tap again to start over",
      });
      await expect(tapAgain).toBeVisible();
      await tapAgain.click();

      await expect(page.getByText("Draft restored.")).not.toBeVisible();
      await expect(page.getByLabel("Title")).toHaveValue("");
    });

    test("saving clears the draft: leave and return lands pristine", async ({
      page,
    }) => {
      await signInViaBackdoor(page, {
        email: "builder-draft-save-clears@e2e.test",
        name: "Builder Draft Save Clears Tester",
      });
      await setBaselines(page);
      await page.goto("/library/new");

      const title = "Draft Save Clears Row";
      await page.getByLabel("Title").fill(title);
      await page.getByRole("button", { name: "Pain 2" }).click();
      await page.getByLabel("Row 1 duration", { exact: true }).fill("500");
      await page.getByRole("radio", { name: "Row 1 pace 2K" }).click();
      await page.getByRole("button", { name: "Save to library" }).click();

      await expect(page).toHaveURL(/\/library\/[^/]+$/);
      await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

      await page.goto("/library/new");
      await expect(page.getByText("Draft restored.")).not.toBeVisible();
      await expect(page.getByLabel("Title")).toHaveValue("");

      await cleanupByTitle(page, title);
    });
  });

  test("/library/import loads directly on a full page reload and imports a four-field-header paste", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-import-direct@e2e.test",
      name: "Builder Import Direct Tester",
    });
    await setBaselines(page);

    // A direct page.goto to /library/import is a real network request to
    // nginx for a path with no matching static file on disk — it renders
    // the importer (not a 404, and not WorkoutDetail's dynamic :id route)
    // only because nginx's SPA fallback serves index.html and
    // AppRoutes.tsx's static /library/import route matches ahead of the
    // dynamic one. A hard reload re-issues that same fresh GET a second
    // time, rather than any client-side transition ever standing in.
    await page.goto("/library/import");
    await expect(page.locator("h1.screen-title")).toHaveText("Import");
    await page.reload();
    await expect(page.locator("h1.screen-title")).toHaveText("Import");

    // Three-field header — "title | TYPE | effort" (Phase DE PR 1; the
    // legacy four- and five-field forms still parse, this paste exercises
    // the current one).
    const title = "Import Screen Row";
    const text = [`${title} | AT | 3`, "w 5 6k @20"].join("\n");
    await page.getByLabel("Bulk import text").fill(text);
    await page.getByRole("button", { name: "Import", exact: true }).click();

    // A clean import (zero errors) navigates away to /library
    // (BulkImportRoute's onImported in AppRoutes.tsx).
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByText(title, { exact: false })).toBeVisible();

    await cleanupByTitle(page, title);
  });

  test("pressing AUTO NAME fills the Title field with a non-empty suggested name", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-dice@e2e.test",
      name: "Builder Dice Tester",
    });
    await setBaselines(page);
    await page.goto("/library/new");

    const titleInput = page.getByLabel("Title");
    await expect(titleInput).toHaveValue("");
    // "↻ AUTO NAME" (Builder.tsx) replaced the old 🎲/"Suggest a name"
    // button this phase — the handoff's own rationale: the dice read as a
    // label, not a button.
    await page.getByRole("button", { name: /AUTO NAME/i }).click();
    await expect(titleInput).not.toHaveValue("");
  });

  test("saving a blank form scrolls the first invalid field into view and focuses it", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-focus@e2e.test",
      name: "Builder Focus Tester",
    });
    await setBaselines(page);
    await page.goto("/library/new");

    // Nothing is filled in: title and pain are both invalid, but toSteps
    // (builderState.ts) sets errors.title first, so Title is the field
    // handleSave's fieldRefs lookup focuses and scrolls into view — the
    // reported bug was that pressing Save did nothing visible when the
    // invalid field was scrolled off-screen.
    await page.getByRole("button", { name: "Save to library" }).click();

    await expect(page.getByLabel("Title")).toBeFocused();
  });

  test("expanding a second step collapses the first — only one editor is present at a time", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-accordion@e2e.test",
      name: "Builder Accordion Tester",
    });
    await setBaselines(page);
    await page.goto("/library/new");

    // A fresh builder opens Row 1's editor by default — nothing to scan yet.
    await expect(page.locator(".step-editor")).toHaveCount(1);
    await expect(
      page.getByLabel("Row 1 duration", { exact: true }),
    ).toBeVisible();

    // "+ ADD STEP" opens the new Row 2, which collapses Row 1 to a card —
    // never two editors at once (Builder.tsx's `editing: rowId | null`).
    await page.getByRole("button", { name: "+ ADD STEP" }).click();
    await expect(page.locator(".step-editor")).toHaveCount(1);
    await expect(page.locator(".step-card")).toHaveCount(1);
    await expect(
      page.getByLabel("Row 2 duration", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Row 1 duration", { exact: true }),
    ).toHaveCount(0);

    // Expanding the now-collapsed Row 1 swaps which row is open — Row 2
    // collapses in turn, still exactly one editor mounted.
    await page
      .locator(".step-card")
      .getByRole("button", { name: "EDIT" })
      .click();
    await expect(page.locator(".step-editor")).toHaveCount(1);
    await expect(
      page.getByLabel("Row 1 duration", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Row 2 duration", { exact: true }),
    ).toHaveCount(0);
  });

  test("cloning a collapsed row via ⧉ copies every field; deleting the clone confirms first; ×5 builds 5×1′ @ 6k−2", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-clone-reps@e2e.test",
      name: "Builder Clone Reps Tester",
    });
    await setBaselines(page);
    await page.goto("/library/new");

    const title = "Clone Reps Row";
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Pain 2" }).click();
    // "100" digits into the masked clock field renders as "1:00".
    await page.getByLabel("Row 1 duration", { exact: true }).fill("100");
    const fasterButton = page.getByRole("button", {
      name: "Row 1 pace faster",
    });
    await fasterButton.click();
    await fasterButton.click();

    // Collapse Row 1 so the fast "5x1'" path — the collapsed card's own ⧉
    // — is what actually gets exercised, not the expanded card's DUPLICATE.
    await page.getByRole("button", { name: "DONE" }).click();

    const rows = page.locator(".builder-step-list > div");
    // The clone button (⧉) is the SET cell's replacement
    // (docs/design/DEVIATIONS.md) — it inserts a copy beneath and leaves
    // everything collapsed, the fast way to build `5×1′`.
    await page.getByRole("button", { name: "Duplicate Step 1" }).click();
    await expect(rows).toHaveCount(2);
    await expect(page.locator(".step-editor")).toHaveCount(0);

    // Prove it actually copied every field, not just that a second card
    // appeared, by expanding the clone and reading its duration/pace back.
    await rows.nth(1).getByRole("button", { name: "EDIT" }).click();
    await expect(
      page.getByLabel("Row 2 duration", { exact: true }),
    ).toHaveValue("1:00");
    await expect(page.locator(".step-editor .pace-ref-display")).toHaveText(
      "6k −2",
    );
    await page.getByRole("button", { name: "DONE" }).click();

    // Delete the clone from its own collapsed card — James's recorded
    // departure from the handoff (docs/design/DEVIATIONS.md): the first
    // press only asks, so a mis-tap can't silently destroy a configured
    // step.
    await rows.nth(1).getByRole("button", { name: "Delete Step 2" }).click();
    await expect(rows).toHaveCount(2);
    await rows
      .nth(1)
      .getByRole("button", { name: "Yes, confirm delete Step 2" })
      .click();
    await expect(rows).toHaveCount(1);

    // The bottom-only ×N control (no more per-row SET) — 4 presses from the
    // default ×1 reaches ×5, completing the `5×1′ @ 6k−2` workout.
    const repeatUp = page.getByRole("button", { name: "Repeat up" });
    for (let i = 0; i < 4; i++) {
      await repeatUp.click();
    }
    // Scoped to the REPEAT stepper's own value cell, not a page-wide text
    // search: StepCard.tsx's collapsed delete button is also the "×"
    // glyph, so an unscoped getByText("×5") risks matching across two
    // adjacent rows' concatenated text as readily as the real stepper.
    await expect(page.locator(".builder-repeat-row .stepper-value")).toHaveText(
      "×5",
    );

    await page.getByRole("button", { name: "Save to library" }).click();

    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    // One row, 1 minute, ×5, no warm-up/rest bookends — five work phases'
    // worth of duration is 5 minutes total (domain/expand.ts's
    // estimateMinutes), asserted here as a hardcoded literal rather than
    // recomputed via the production function under test.
    await expect(page.locator("p.mono-status").first()).toContainText("5 MIN");

    await cleanupByTitle(page, title);
  });

  // Was "editing a workout with a stored warm-up keeps its wu row, and Save
  // still PUTs it unchanged" — that scenario is now categorically
  // impossible (2026-08-09 warmup-setting spec): bulk import DROPS `wu`
  // lines rather than turning them into a step, and migration 0008 already
  // stripped every existing stored `wu`. Repurposed into the import walk's
  // own wu-strip notice case (block2-review's plan hole).
  //
  // Two passes, because the composed import contract (`domain/bulk.ts`'s
  // header, written when this branch rebased onto Phase CL's all-or-nothing
  // import) makes it impossible to see both halves in ONE paste: **`wu`
  // lines are never "bad"; everything else is all-or-nothing.** The notice
  // only stays on screen when something ELSE errored (a clean import
  // navigates away immediately — BulkImport.tsx's own `onImported`), and
  // any such error now means ZERO rows are created, so there is nothing to
  // open and edit from that same paste. The earlier single-paste version of
  // this test asserted "1 created" beside an error, which was the
  // pre-transaction partial-success contract.
  //
  // Pass 1 is the notice itself, and doubles as the composed contract's own
  // e2e pin: the dropped `wu` is NOT counted as an error (the error list
  // names only the bad pace ref) yet the paste still creates nothing.
  // Pass 2 is the strip's real consequence, through a CLEAN paste: the
  // created workout has no wu row to edit and Save never PUTs one back.
  test("a paste with one wu line shows the drop notice beside an unrelated error and still creates nothing; a clean one creates a workout with no wu row to edit", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-wu-strip@e2e.test",
      name: "Builder WU Strip Tester",
    });
    await setBaselines(page);
    await page.goto("/library/import");

    const title = "WU Strip Row";
    const blockLines = [`${title} | O2 | easy | 2`, "wu 5", "w 10' 6k @20"];
    const text = [
      ...blockLines,
      "",
      "WU Strip Bad | O2 | easy | 2",
      "w 10' 9k @20",
    ].join("\n");
    await page.getByLabel("Bulk import text").fill(text);
    await page.getByRole("button", { name: "Import", exact: true }).click();

    // All-or-nothing: the second block's bad pace ref rejects the WHOLE
    // paste, which is also what keeps the rower on this panel long enough
    // for the dropped-warm-ups notice to render at all.
    await expect(page.locator(".bulk-import-result .mono-status")).toHaveText(
      "0 created",
    );
    await expect(page.locator(".bulk-import-notice")).toHaveText(
      "1 warm-up line dropped. Add a warm-up as an ordinary first step instead.",
    );
    // The `wu 5` on line 2 contributes NO entry here — the drop is not an
    // error. Only the bad ref on line 6 is.
    await expect(page.locator(".bulk-import-errors li")).toHaveText(
      "line 6: bad pace ref: 9k",
    );

    // Pass 2: the same first block on its own. Clean, so it lands (proving
    // the wu line never blocked it) and navigates away.
    await page.getByLabel("Bulk import text").fill(blockLines.join("\n"));
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page).toHaveURL(/\/library$/);

    await page.locator(".workout-row").filter({ hasText: title }).click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+\/edit$/);

    // Exactly one step survived — the dropped `wu` line left no row behind
    // for the builder to render, edit, or round-trip.
    await expect(page.locator(".builder-step-list > div")).toHaveCount(1);
    await page
      .locator(".builder-step-list > div")
      .first()
      .getByRole("button", { name: "EDIT" })
      .click();
    await expect(
      page.getByLabel("Row 1 duration", { exact: true }),
    ).toHaveValue("10:00");
    await expect(
      page.getByRole("radio", { name: "Row 1 pace 6K" }),
    ).toHaveAttribute("aria-checked", "true");

    const putRequestPromise = page.waitForRequest(
      (req) => req.method() === "PUT" && req.url().includes("/api/workouts/"),
    );
    await page.getByRole("button", { name: "Save to library" }).click();
    const putRequest = await putRequestPromise;
    const body = putRequest.postDataJSON() as {
      steps: Array<{ k: string }>;
    };
    expect(body.steps).toHaveLength(1);
    expect(body.steps.some((s) => s.k === "wu")).toBe(false);

    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await cleanupByTitle(page, title);
  });

  test("editing a stored workout's rest, then tapping REST once, still saves — the seam that used to write NaN", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-rest-roundtrip@e2e.test",
      name: "Builder Rest Roundtrip Tester",
    });
    await setBaselines(page);
    // Bulk import a work step carrying rest (domain/bulk.ts's inline `r5`
    // token) — the same shape a real library workout (Hoarfrost,
    // server/seed/library/o2.ts — Task 11's fixture-anchor replacement for
    // the retired Doldrums, same reps count and rest minutes) carries.
    // `stepToRow` writes the stored
    // `restMinutes` into `row.rest` as a clock string ("5:00"); before this
    // fix `restSecondsFromRow` still read that with a bare `Number(...)`
    // (NaN), so one tap of REST wrote the literal string "NaN" back into
    // the row and `toSteps` refused to save it.
    await page.goto("/library/import");
    const title = "Rest Roundtrip Row";
    const text = [`${title} | O2 | easy | 2`, "w 10' 6k @20 r5"].join("\n");
    await page.getByLabel("Bulk import text").fill(text);
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page).toHaveURL(/\/library$/);

    await page.locator(".workout-row").filter({ hasText: title }).click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+\/edit$/);

    // Edit mode starts collapsed — expand Row 1 (the only, stored `w` row)
    // before touching its REST stepper.
    await page
      .locator(".builder-step-list > div")
      .first()
      .getByRole("button", { name: "EDIT" })
      .click();

    // One tap up: 5:00 -> 5:30 (a 30s step). Confirms the stepper reads the
    // stored clock-form rest correctly before this test relies on it also
    // writing back something `toSteps` can still parse. REST's value cell is
    // a typable ClockInput now (Task 5), not a `<span>` — read its value,
    // not its text content.
    await page.getByRole("button", { name: "Row 1 rest up" }).click();
    await expect(page.getByLabel("Row 1 rest value")).toHaveValue("5:30");

    await page.getByRole("button", { name: "Save to library" }).click();

    // The bug's symptom: Save silently no-ops (an inline validation error
    // appears, not a navigation) because `toSteps` can't parse "NaN" as a
    // rest duration. A successful save navigates back to the detail screen.
    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

    await cleanupByTitle(page, title);
  });

  test("pressing AUTO NAME twice yields two different suggested titles", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-dice-twice@e2e.test",
      name: "Builder Dice Twice Tester",
    });
    await setBaselines(page);
    await page.goto("/library/new");

    const titleInput = page.getByLabel("Title");
    const autoName = page.getByRole("button", { name: /AUTO NAME/i });
    await autoName.click();
    const first = await titleInput.inputValue();
    await autoName.click();
    const second = await titleInput.inputValue();

    // The reported bug, end to end: nameGenerator.ts used to probe linearly
    // forward from a seed-derived start index, and its noun list opened
    // with the same weather words the library's own titles use — every seed
    // inside that taken cluster slid to the same first-free slot, so
    // repeated presses returned the same name forever (fixed in Task 1;
    // unit-covered in nameGenerator.test.ts against the real 300-workout
    // library — this proves the same fix through the live UI).
    expect(second).not.toBe(first);
  });

  test("SPM's + from an empty field shows 20, not 21", async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "builder-spm-wake@e2e.test",
      name: "Builder SPM Wake Tester",
    });
    await setBaselines(page);
    await page.goto("/library/new");

    // SPM is a typable Stepper now (Task 5) — the joined "− value +" group
    // (Stepper.tsx) whose value cell is a numeric input; its value stays ""
    // when empty (a field you can type into can't also hold a literal word
    // as its value). Task 9 added a "FREE" placeholder so the cell still
    // reads that word visually — this asserts the underlying value, which
    // the placeholder doesn't change.
    const spmValue = page.getByLabel("Row 1 stroke rate value");
    await expect(spmValue).toHaveValue("");
    await page.getByRole("button", { name: "Row 1 stroke rate up" }).click();
    await expect(spmValue).toHaveValue("20");
  });
});

test.describe("effort refs (Phase 5G)", () => {
  test("authors 0:30 max @ 32, saves, reopens as ALL OUT with no nudges", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-effort-max@e2e.test",
      name: "Builder Effort Max Tester",
    });
    await setBaselines(page);
    await page.goto("/library/new");

    const title = "Effort Max Row";
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Pain 5" }).click();
    // "30" digits into the masked clock field renders as "0:30".
    await page.getByLabel("Row 1 duration", { exact: true }).fill("30");
    await page.getByRole("radio", { name: "Row 1 pace MAX" }).click();
    // MAX/MIN have no offset of their own — the stepper unmounts entirely
    // (PaceRefInput.tsx), not just visually hidden.
    await expect(page.locator(".pace-ref-offset")).toHaveCount(0);
    await page
      .getByLabel("Row 1 stroke rate value", { exact: true })
      .pressSequentially("32");

    // The TARGET strip resolves live, before save — an effort word needs no
    // baseline to resolve, so it renders unconditionally once an effort
    // chip is checked (StepEditor.tsx).
    await expect(page.locator(".step-editor-target-value")).toHaveText(
      "ALL OUT",
    );

    await page.getByRole("button", { name: "Save to library" }).click();

    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
    // StepRow.tsx: the visible left label composes as "<duration> @ <chip
    // word>" (refLabel), and the right-hand range slot renders the effort
    // word instead of a resolved split.
    await expect(page.locator(".step-row-label").first()).toHaveText(
      "0:30 @ MAX",
    );
    await expect(page.locator(".step-row-range").first()).toHaveText("ALL OUT");
    // No nudge buttons at all for an effort ref — StepRow.tsx only renders
    // `.step-row-nudges` when baselines are set AND the ref is a split, and
    // baselines ARE set here (setBaselines above), so the only thing that
    // can be suppressing them is the effort branch itself.
    await expect(page.locator(".nudge-btn")).toHaveCount(0);

    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+\/edit$/);

    // Edit mode opens with every row collapsed — expand Row 1 to read the
    // round-tripped chip state back.
    await page
      .locator(".builder-step-list > div")
      .first()
      .getByRole("button", { name: "EDIT" })
      .click();
    await expect(
      page.getByRole("radio", { name: "Row 1 pace MAX" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".pace-ref-offset")).toHaveCount(0);

    await cleanupByTitle(page, title);
  });
});
