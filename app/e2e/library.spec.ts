import { test, expect } from "@playwright/test";
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
    const rowTitle = await firstRow.locator(".workout-row-title").innerText();
    // Row renders "<num>. <title>" (WorkoutRow.tsx); detail renders the bare
    // title (WorkoutDetail.tsx's <h1>) — strip the "N. " prefix to compare.
    const title = rowTitle.replace(/^\d+\.\s*/, "");

    await firstRow.click();

    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  });

  test("a full reload on the detail URL still renders the detail screen (SPA fallback)", async ({
    page,
  }) => {
    const firstRow = page.locator(".workout-row").first();
    const rowTitle = await firstRow.locator(".workout-row-title").innerText();
    const title = rowTitle.replace(/^\d+\.\s*/, "");

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
