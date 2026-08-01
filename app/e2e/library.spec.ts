import { test, expect, type Page } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

// Golden flows through Library -> detail -> You, against the real compose
// stack (nginx + api + postgres, seeded with 35 global workouts at boot —
// see server/seed/starter.ts). Per docs/TESTING.md's pyramid, this layer
// proves the wiring between screens/routes/the SPA fallback, not the Erg
// Book math itself (that's domain/pace.test.ts's job).

const SEEDED_WORKOUT_COUNT = 35;

test.describe("library list", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "library@e2e.test",
      name: "Library Tester",
    });
    await page.goto("/library");
  });

  test("lists the seeded workouts and the header count matches the rendered rows", async ({
    page,
  }) => {
    const rows = page.locator(".workout-row");
    await expect(rows).toHaveCount(SEEDED_WORKOUT_COUNT);
    await expect(page.locator(".library-count")).toHaveText(
      `${SEEDED_WORKOUT_COUNT} ENTERED`,
    );
  });

  test("a type chip narrows the list and ALL restores it", async ({ page }) => {
    const rows = page.locator(".workout-row");
    // Anchor on the known seeded total first: Library shows "LOADING…" until
    // both workouts and baselines resolve, and a bare `.count()` doesn't
    // auto-wait like a `toHaveCount` assertion does — reading it too early
    // races the fetch and observes 0.
    await expect(rows).toHaveCount(SEEDED_WORKOUT_COUNT);
    const initialCount = await rows.count();

    // Seed has 8 AN / 10 O2 / 8 AT / 9 TR workouts (server/seed/starter.ts)
    // — a proper, non-trivial subset either way of the 35 total.
    await page.getByRole("button", { name: "AN", exact: true }).click();
    await expect(rows).not.toHaveCount(initialCount);
    const filteredCount = await rows.count();
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(initialCount);
    await expect(page.locator(".library-count")).toHaveText(
      `${filteredCount} ENTERED`,
    );

    await page.getByRole("button", { name: "ALL", exact: true }).click();
    await expect(rows).toHaveCount(initialCount);
    await expect(page.locator(".library-count")).toHaveText(
      `${initialCount} ENTERED`,
    );
  });

  test("opening a row navigates to /library/:id and shows that workout's title", async ({
    page,
  }) => {
    const firstRow = page.locator(".workout-row").first();
    // Row and detail both render the bare title now (WorkoutRow.tsx /
    // WorkoutDetail.tsx's <h1>) — there's no leading "N. " to strip; the
    // server orders the library itself (sort_order), invisibly to the UI.
    const title = await firstRow.locator(".workout-row-title").innerText();

    await firstRow.click();

    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  });

  test("a full reload on the detail URL still renders the detail screen (SPA fallback)", async ({
    page,
  }) => {
    const firstRow = page.locator(".workout-row").first();
    const title = await firstRow.locator(".workout-row-title").innerText();

    await firstRow.click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
    const detailUrl = page.url();

    // A hard reload issues a fresh GET for /library/<id> straight to nginx —
    // exercising the real SPA-fallback config, not React Router's client-side
    // routing (which would render fine even if nginx 404'd on this path).
    await page.reload();

    await expect(page).toHaveURL(detailUrl);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  });
});

test.describe("baseline changes propagate to a workout's detail targets", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "baseline-e2e@e2e.test",
      name: "Baseline Tester",
    });
    // Order-independent regardless of what a previous run left behind: pin
    // baselines to a known pair via the API before any assertion below runs.
    // Driven via an in-page fetch (real Chromium networking), not
    // `page.request`: the api container runs with NODE_ENV=production (see
    // Dockerfile), so the session cookie is Set-Cookie'd with `Secure` —
    // Chromium exempts http://127.0.0.1 from that (the loopback
    // "potentially trustworthy origin" carve-out), but Playwright's Node-side
    // APIRequestContext does not, so `page.request.put` 401s here even
    // though the identical request from the loaded page succeeds.
    const reset = await page.evaluate(
      async (patch) => {
        const res = await fetch("/api/baselines", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        return { ok: res.ok, status: res.status, body: await res.text() };
      },
      { k2Seconds: 100, k6Seconds: 110 },
    );
    if (!reset.ok) {
      throw new Error(`baseline reset failed: ${reset.status} ${reset.body}`);
    }
  });

  test("setting a baseline in You changes a resolved target shown on a workout's detail screen", async ({
    page,
  }) => {
    await page.goto("/library");
    const firstRow = page.locator(".workout-row").first();
    const detailHref = await firstRow.getAttribute("href");
    if (!detailHref) throw new Error("first workout row has no href");

    await firstRow.click();
    // Every seeded workout has at least one paced ("w") step, so the first
    // rendered target range is a real, comparable value once baselines are
    // set (never the "no target" fallback — see StepRow.tsx).
    const target = page.locator(".step-row-range").first();
    const before = await target.innerText();
    expect(before).toMatch(/\d/);

    await page.goto("/you");
    // Nudge BOTH splits: the first target's pace ref could be based on
    // either 2k or 6k, and this test asserts the end-to-end wiring (a
    // baseline change reaches the detail screen), not which ref a given
    // step happens to use — see docs/TESTING.md's pyramid on e2e's scope.
    const NUDGES = 6; // 6 * 0.5s step (you/baselineDraft.ts's STEP) = +3s
    for (const base of ["2k", "6k"] as const) {
      const slower = page.getByRole("button", {
        name: `${base} slower`,
        exact: true,
      });
      for (let i = 0; i < NUDGES; i++) {
        await slower.click();
      }
    }
    await page
      .getByRole("button", { name: "Apply baselines", exact: true })
      .click();
    // The Apply/Discard controls only render while the draft is dirty
    // (BaselineEditor.tsx) — their disappearance confirms the save resolved.
    await expect(
      page.getByRole("button", { name: "Apply baselines" }),
    ).toBeHidden();

    await page.goto(detailHref);
    await expect(page.locator(".step-row-range").first()).not.toHaveText(
      before,
    );
  });
});

/** Same in-page-`fetch` idiom as builder.spec.ts's `cleanupByTitle` (Secure
 *  cookie makes `page.request` unusable here — see that file's comment). A
 *  no-op if the title isn't found, so a test that already asserted a delete
 *  happened can still call this defensively. */
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

test.describe("CUSTOM filter", () => {
  test("tapping CUSTOM narrows to an authored workout, and ALL restores the full library", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "library-custom@e2e.test",
      name: "Custom Filter Tester",
    });
    const title = "E2E Custom Filter Workout";

    // Author a workout through the builder (same minimal single-row flow as
    // builder.spec.ts's exit-criterion test) — it lands in the library as
    // `isGlobal: false`, the only kind CUSTOM should surface.
    await page.goto("/library/new");
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Pain 3" }).click();
    await page.getByLabel("Row 1 duration", { exact: true }).fill("2000");
    await page.getByRole("button", { name: "Save to library" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+$/);

    await page.goto("/library");
    const rows = page.locator(".workout-row");
    await expect(rows).toHaveCount(SEEDED_WORKOUT_COUNT + 1);

    await page.getByRole("button", { name: "CUSTOM", exact: true }).click();

    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator(".workout-row-title")).toHaveText(title);
    await expect(rows.first().locator(".workout-row-custom")).toHaveText(
      "CUSTOM",
    );

    await page.getByRole("button", { name: "ALL", exact: true }).click();
    await expect(rows).toHaveCount(SEEDED_WORKOUT_COUNT + 1);

    await cleanupByTitle(page, title);
  });
});
