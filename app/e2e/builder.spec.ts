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
    await page.getByRole("radio", { name: "Pain 3" }).click();
    await page.getByLabel("Row 1 duration").fill("20");
    // Base defaults to 6k (builderState.ts's newRow) — two clicks on the
    // faster stepper reaches the "-2" offset the exit criterion needs.
    const fasterButton = page.getByRole("button", {
      name: "Row 1 pace faster",
    });
    await fasterButton.click();
    await fasterButton.click();
    await page.getByLabel("Row 1 stroke rate").fill("22");

    // With a 6k baseline of 122.0s: 122 - 2 = 120.0, tolerance +/-1s (the
    // token default, tokens.css's --pace-tolerance) -> "1:59.0-2:01.0" (EN
    // DASH, domain/pace.ts's toleranceRange). The builder resolves this live
    // (StepRowEditor.tsx), before any save — check it here too, not just on
    // the post-save detail screen below, so a failure here (bad live math)
    // isn't confused with a failure there (bad round-trip through the API).
    await expect(page.locator(".step-row-range").first()).toHaveText(
      "1:59.0–2:01.0",
    );

    await page.getByRole("button", { name: "Save to library" }).click();

    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
    await expect(page.locator(".step-row-range").first()).toHaveText(
      "1:59.0–2:01.0",
    );

    await cleanupByTitle(page, title);
  });

  test("a bulk paste with one bad pace ref reports the failing line and still creates the good workout", async ({
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
    // whole second block is rejected while the first is still created. Line
    // numbers are 1-based over the raw pasted text (including the blank
    // separator) — the bad ref sits on line 7.
    const text = [
      "9410 | Bulk Good | O2 | easy | 2",
      "wu 5",
      "w 10' 6k @20",
      "",
      "9411 | Bulk Bad | O2 | easy | 2",
      "wu 5",
      "w 10' 9k @20",
    ].join("\n");
    await page.getByLabel("Bulk import text").fill(text);
    await page.getByRole("button", { name: "Import", exact: true }).click();

    await expect(page.locator(".bulk-import-errors li")).toHaveText(
      "line 7: bad pace ref: 9k",
    );
    await expect(page.locator(".bulk-import-result .mono-status")).toHaveText(
      "1 created",
    );

    // A partial result (some created, some failed) deliberately keeps the
    // rower on this panel (BulkImport.tsx) rather than navigating away, so
    // the created workout's presence has to be confirmed on Library itself.
    await page.goto("/library");
    await expect(page.getByText("Bulk Good", { exact: false })).toBeVisible();

    await cleanupByTitle(page, "Bulk Good");
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
    await page.getByRole("radio", { name: "Pain 2" }).click();
    await page.getByLabel("Row 1 duration").fill("10");
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
    await page.getByRole("radio", { name: "Pain 1" }).click();
    await page.getByLabel("Row 1 duration").fill("5");
    await page.getByRole("radio", { name: "Row 1 pace 2K" }).click();
    await page.getByRole("button", { name: "Save to library" }).click();

    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    // Staged-confirm idiom (src/you/BaselineEditor.tsx): the destructive
    // action never fires on the first press.
    await page.getByRole("button", { name: "Delete workout" }).click();

    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByText(title, { exact: false })).not.toBeVisible();
  });

  test("a global starter workout's detail shows no Edit or Delete control", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "builder-global@e2e.test",
      name: "Builder Global Tester",
    });
    await setBaselines(page);
    await page.goto("/library");

    // A brand-new user has no personal workouts yet, so every row on a
    // fresh /library is one of the 35 global starters (server/seed/
    // starter.ts) — the first is as good as any for asserting the
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
      page.getByRole("button", { name: "Delete", exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("new controls this phase introduced", () => {
  test("authoring with a bare-number duration and no legacy number field saves and appears in the Library", async ({
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
    await page.getByRole("radio", { name: "Pain 2" }).click();
    // "5" alone means 5 minutes (builderState.ts's parseDurationInput) — no
    // trailing apostrophe needed, and there is no numeric "No." field
    // anywhere on this screen to fill in the first place.
    await page.getByLabel("Row 1 duration").fill("5");
    await page.getByRole("radio", { name: "Row 1 pace 2K" }).click();
    await page.getByRole("button", { name: "Save to library" }).click();

    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

    await page.goto("/library");
    await expect(page.getByText(title, { exact: false })).toBeVisible();

    await cleanupByTitle(page, title);
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

    // Four-field header — "title | TYPE | difficulty | pain", no leading
    // legacy number (domain/bulk.ts's parseHeader accepts both shapes; this
    // paste exercises the current one).
    const title = "Import Screen Row";
    const text = [`${title} | AT | medium | 3`, "wu 5", "w 5 6k @20"].join(
      "\n",
    );
    await page.getByLabel("Bulk import text").fill(text);
    await page.getByRole("button", { name: "Import", exact: true }).click();

    // A clean import (zero errors) navigates away to /library
    // (BulkImportRoute's onImported in AppRoutes.tsx).
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByText(title, { exact: false })).toBeVisible();

    await cleanupByTitle(page, title);
  });

  test("pressing the dice icon fills the Title field with a non-empty suggested name", async ({
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
    await page.getByRole("button", { name: "Suggest a name" }).click();
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
});
