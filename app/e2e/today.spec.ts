import { test, expect, type Page } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

// Today enhancements (post-6C, Task 4): the four flows the task's own plan
// names — visible filter chips actually narrowing the suggestion, a
// type-swap that survives to Start and resets once the plan advances, the
// outside-plan toggle read from Today's own counter (the manual-door half
// of that flow lives in e2e/session.spec.ts, alongside Task 2's other Log
// screen loops — see that file's own "Phase 6C Task 3" describe), and a
// freestyle (no-plan) spot-check that the type chips genuinely don't
// render without a plan to swap against. Every test signs in as its own
// unique, workout-free email (session.spec.ts's own convention) and cleans
// up its own personal workout(s) via `test.afterEach` so a re-run against
// a dirty, persisted database doesn't accumulate stale rows or drift a
// suggestion's expected pick.

async function setBaselines(
  page: Page,
  baselines: { k2Seconds: number; k6Seconds: number },
): Promise<void> {
  const result = await page.evaluate(async (patch) => {
    const res = await fetch("/api/baselines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, baselines);
  if (!result.ok) {
    throw new Error(`baseline setup failed: ${result.status} ${result.body}`);
  }
}

/** Copied from session.spec.ts's own `cleanupByTitle` (itself copied from
 *  builder.spec.ts) — duplicated per this repo's established e2e-file
 *  precedent rather than shared. */
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

/** Activates a preset plan via the real `PUT /api/plan` route — copied from
 *  session.spec.ts's own `choosePlan` (same duplication precedent). */
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

/** Zeroes `doneN` via `PUT /api/plan {reset:true}` — needed alongside
 *  `choosePlan` because re-selecting the SAME plan key (a per-test fixed
 *  email reused across two back-to-back full suite runs) is a no-op for
 *  `doneN` (server/routes/data.ts: "re-selecting the SAME plan must be a
 *  no-op") — copied from session.spec.ts's own identical helper. */
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

/** Bulk-imports `text` and waits for the redirect back to /library — copied
 *  from session.spec.ts's own `importBulk`. */
async function importBulk(page: Page, text: string): Promise<void> {
  await page.goto("/library/import");
  await page.getByLabel("Bulk import text").fill(text);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
}

/** START on Confirm, then SKIP the countdown — copied from session.spec.ts's
 *  own `startAndSkipCountdown`. */
async function startAndSkipCountdown(page: Page): Promise<void> {
  await page.getByRole("button", { name: "START" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
  await expect(page.getByText("GET ON THE HANDLE")).toBeVisible();
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
}

/** Marks every GLOBAL workout of `type` as "done" (a real, non-null
 *  `lastDoneDaysAgo`) via a genuine logged session against each one's own
 *  id. `suggest()`'s tie-break sorts never-done (`null`) entries strictly
 *  before ANY done entry regardless of how many days ago (`byLeastRecently
 *  Done`), but a brand-new account's 60-90 seeded global workouts of a given
 *  type (server/seed/library/index.ts's quota grid: O2 90 / AT 75 / TR 75 /
 *  AN 60) are ALSO all never-done — and `stores/workouts.ts`'s own `list()` orders
 *  globals ahead of personal rows unconditionally, so a fresh personal
 *  fixture of the same type would otherwise never win the recency tie no
 *  matter what its own difficulty/pain/cap says. Logging every global of
 *  that type first makes a personal fixture imported right after this call
 *  the SOLE never-done entry of that type, and therefore its guaranteed top
 *  pick — the only way to make the filter chips' own effect deterministic
 *  without hardcoding which seeded workout happens to sort first. Each POST
 *  also bumps `plan_state.done_n` (`stores/logs.ts`'s own unconditional
 *  bump); harmless here since every caller of this helper chooses/resets a
 *  plan afterward, which always re-zeroes it regardless of what it was
 *  bumped to meanwhile. */
async function neutralizeGlobalRecency(
  page: Page,
  type: string,
): Promise<void> {
  const result = await page.evaluate(async (t) => {
    const listRes = await fetch("/api/workouts");
    if (!listRes.ok) return { ok: false, status: listRes.status };
    const workouts = (await listRes.json()) as Array<{
      id: string;
      type: string;
      isGlobal: boolean;
    }>;
    const targets = workouts.filter((w) => w.isGlobal && w.type === t);
    for (const w of targets) {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutId: w.id,
          workoutTitle: "neutralized for recency",
          workoutType: t,
          held: "held",
          pain: 1,
          notes: null,
          steps: [{ label: "Work" }],
        }),
      });
      if (!res.ok) return { ok: false, status: res.status };
    }
    return { ok: true, status: 200 };
  }, type);
  if (!result.ok) {
    throw new Error(`neutralize failed: ${result.status}`);
  }
}

test.describe("Today enhancements: visible filter chips", () => {
  const highPainTitle = "Today Filters High Pain E2E";
  const lowPainTitle = "Today Filters Low Pain E2E";

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, highPainTitle);
    await cleanupByTitle(page, lowPainTitle);
  });

  test("tap PAIN cells 1+2 -> the suggestion card changes (a real title swap); reload -> cells and card unchanged", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "today-filters@e2e.test",
      name: "Today Filters Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    // Neutralize the 90 seeded global O2 workouts (sprint's own doneN=0
    // code is "O2" — SPRINT_WEEKS week 0, index 0) so the two personal
    // fixtures below are the only never-done O2 entries, and therefore
    // deterministically win the recency tie regardless of the library's
    // own authored order.
    await neutralizeGlobalRecency(page, "O2");
    // Imported in this order deliberately: creation order is the tie-break
    // among the two (both never-done, same difficulty/cap) — the
    // HIGH-pain one, created first, is the pre-filter pick; the LOW-pain
    // one only surfaces once the 1+2 pain union excludes the high-pain one.
    await importBulk(
      page,
      [`${highPainTitle} | O2 | medium | 5`, "w 1:00 6k"].join("\n"),
    );
    await importBulk(
      page,
      [`${lowPainTitle} | O2 | medium | 2`, "w 1:00 6k"].join("\n"),
    );
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);

    await page.goto("/today");
    await expect(page.locator(".today-card")).toBeVisible();
    await expect(page.locator(".today-plan-line")).toContainText(
      "SESSION 1 OF 84",
    );
    await expect(page.locator(".today-plan-line")).toContainText("O2");

    // Pre-filter: the high-pain fixture, created first, wins the
    // never-done tie.
    await expect(page.locator(".today-card-title")).toHaveText(highPainTitle);

    const painGroup = page.getByRole("group", { name: "PAIN" });
    const cell1 = painGroup.getByRole("button", { name: "1", exact: true });
    const cell2 = painGroup.getByRole("button", { name: "2", exact: true });
    await expect(cell1).toHaveAttribute("aria-pressed", "false");
    await expect(cell2).toHaveAttribute("aria-pressed", "false");
    // Union, not a single tap: [1] alone would still exclude the pain-2
    // fixture along with the pain-5 one, so both cells have to go active
    // before the low-pain fixture (pain 2) is the sole survivor.
    await cell1.click();
    await cell2.click();
    await expect(cell1).toHaveAttribute("aria-pressed", "true");
    await expect(cell2).toHaveAttribute("aria-pressed", "true");

    // A real, provable change: the recommendation itself swapped to the
    // low-pain fixture now that the high-pain one is filtered out.
    await expect(page.locator(".today-card-title")).toHaveText(lowPainTitle);

    // Reload: the override persists (same day, same planKey/doneN) — the
    // cells stay pressed and the card stays on the filtered pick, not back
    // to the pre-filter default.
    await page.reload();
    await expect(page.locator(".today-card")).toBeVisible();
    const painGroupAfterReload = page.getByRole("group", { name: "PAIN" });
    await expect(
      painGroupAfterReload.getByRole("button", { name: "1", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      painGroupAfterReload.getByRole("button", { name: "2", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".today-card-title")).toHaveText(lowPainTitle);
  });
});

test.describe("Today enhancements: the type-swap loop", () => {
  const title = "Today Swap Tiny AN E2E";

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("swap to a different type -> plan line shows the arrow -> Start/SKIP/complete/Log/Save -> counter +1, LAST THREE shows the swapped type, and the swap resets", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "today-swap@e2e.test",
      name: "Today Swap Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    // Neutralize the 60 seeded global AN workouts so this fixture (also AN)
    // is the sole never-done AN entry, and therefore the guaranteed pick
    // once the type chip swaps the pool to AN — same reasoning as the
    // filters describe block above.
    await neutralizeGlobalRecency(page, "AN");
    // A single 3s time step referencing "6k" — the 6B bulk-import tiny-
    // session idiom every completion-driving e2e test in this repo uses
    // (session.spec.ts's own comment on this): the last (and only) phase
    // auto-advances straight to /session/complete with no further click.
    await importBulk(
      page,
      [`${title} | AN | medium | 1`, "w 0:03 6k"].join("\n"),
    );
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);

    await page.goto("/today");
    await expect(page.locator(".today-card")).toBeVisible();
    // Sprint's doneN=0 code is "O2" (SPRINT_WEEKS week 0, index 0) — no
    // swap yet, so the plan line names it plainly with no arrow.
    await expect(page.locator(".today-plan-line")).toContainText(
      "SESSION 1 OF 84",
    );
    await expect(page.locator(".today-plan-line")).not.toContainText("→");
    const o2Chip = page.getByRole("button", { name: "O2", exact: true });
    const anChip = page.getByRole("button", { name: "AN", exact: true });
    await expect(o2Chip).toHaveAttribute("aria-pressed", "true");
    await expect(anChip).toHaveAttribute("aria-pressed", "false");

    await anChip.click();
    await expect(anChip).toHaveAttribute("aria-pressed", "true");
    await expect(o2Chip).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".today-plan-line")).toContainText("O2 → AN");
    // The pool re-ran against AN — this fixture, the sole never-done AN
    // entry, is now the recommendation.
    await expect(page.locator(".today-card-title")).toHaveText(title);

    const card = page.locator(".today-card");
    await card.click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page).toHaveURL(/\/session\/confirm$/);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();
    await expect(page).toHaveURL(/\/session\/complete$/, { timeout: 6000 });

    await page.getByRole("link", { name: "Log this session" }).click();
    await expect(page).toHaveURL(/\/session\/log$/);
    // Default toggle state — this session still counts toward the plan.
    await expect(
      page.getByRole("button", { name: /COUNTS TOWARD PLAN/ }),
    ).toContainText("SESSION 1 OF 84");
    await page.getByRole("button", { name: "HELD" }).click();
    await page.getByRole("button", { name: "Pain 2" }).click();
    await page.getByRole("button", { name: "Save session" }).click();

    await expect(page).toHaveURL(/\/today$/);
    // Counter advanced by exactly one.
    await expect(page.locator(".today-plan-line")).toContainText(
      "SESSION 2 OF 84",
    );
    // The doneN bump invalidated the stored override record (its own
    // `doneN` no longer matches) — the swap reset, back to the plan's own
    // (new) prescribed type, with no arrow.
    await expect(page.locator(".today-plan-line")).not.toContainText("→");

    // LAST THREE's top (most recent) row shows the SWAPPED type (AN), not
    // the plan's originally-prescribed O2 — TypeBadge renders the actual
    // logged workout's own type.
    const topRow = page.locator(".today-log-row").first();
    await expect(topRow).toContainText(title);
    await expect(topRow.locator(".type-badge")).toHaveText("AN");
  });
});

// The outside-plan toggle's OTHER half — the manual door
// (`/library/:id/log`, "Log it after") — lives in e2e/session.spec.ts's own
// "Phase 6C Task 3: the manual door" describe block, reusing that file's
// already-established `choosePlan`/`resetPlanProgress`/`titles` cleanup
// idiom rather than duplicating a third copy of them here.

// Fix round 2 (whole-branch review, the swap × outside-plan seam): the
// type-swap loop above proves the swap RESETS after an ADVANCING log, and
// session.spec.ts's manual-door test proves the counter HOLDS after an
// outside-plan log — but nothing before this crossed the two. The spec's
// Amendment (2026-08-02-today-enhancements-design.md) settles that an
// outside-plan log must NOT reset the swap either (composability: marking a
// swapped session outside-plan would otherwise destroy the very swap the
// rower is mid-way through using), and the review's own adjudication walked
// this exact path by hand: `advancesPlan: false` skips the `done_n` upsert,
// so the `{date, planKey, doneN}` key Today remounts with is unchanged,
// `loadTodayOverrides` matches, and the swap survives.
test.describe("Today enhancements: the swap x outside-plan composition seam", () => {
  const title = "Today Swap Outside Plan E2E";

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("swap type -> run the swapped session -> Log OUTSIDE THE PLAN -> Save -> Today: counter unchanged, the swap survives, LAST THREE shows the row", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "today-swap-outside-plan@e2e.test",
      name: "Today Swap Outside Plan Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    // Same neutralize-then-import idiom as the type-swap loop test above:
    // makes this fixture the guaranteed pick once the pool swaps to AN.
    await neutralizeGlobalRecency(page, "AN");
    await importBulk(
      page,
      [`${title} | AN | medium | 1`, "w 0:03 6k"].join("\n"),
    );
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);

    await page.goto("/today");
    await expect(page.locator(".today-card")).toBeVisible();
    await expect(page.locator(".today-plan-line")).toContainText(
      "SESSION 1 OF 84",
    );
    await expect(page.locator(".today-plan-line")).not.toContainText("→");

    const anChip = page.getByRole("button", { name: "AN", exact: true });
    await anChip.click();
    await expect(page.locator(".today-plan-line")).toContainText("O2 → AN");
    await expect(page.locator(".today-card-title")).toHaveText(title);

    const card = page.locator(".today-card");
    await card.click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page).toHaveURL(/\/session\/confirm$/);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();
    await expect(page).toHaveURL(/\/session\/complete$/, { timeout: 6000 });

    await page.getByRole("link", { name: "Log this session" }).click();
    await expect(page).toHaveURL(/\/session\/log$/);
    const toggle = page.getByRole("button", { name: /COUNTS TOWARD PLAN/ });
    await expect(toggle).toContainText("SESSION 1 OF 84");
    await toggle.click();
    await expect(
      page.getByRole("button", { name: "OUTSIDE THE PLAN — won't advance" }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "HELD" }).click();
    await page.getByRole("button", { name: "Pain 2" }).click();
    await page.getByRole("button", { name: "Save session" }).click();

    await expect(page).toHaveURL(/\/today$/);
    // The seam itself: unlike the type-swap loop test's ADVANCING log
    // (which bumps the counter to SESSION 2 OF 84 and resets the swap),
    // an outside-plan log leaves doneN untouched — the counter stays put
    // AND the swap survives, because the invalidation key never changed.
    await expect(page.locator(".today-plan-line")).toContainText(
      "SESSION 1 OF 84",
    );
    await expect(page.locator(".today-plan-line")).toContainText("O2 → AN");

    const topRow = page.locator(".today-log-row").first();
    await expect(topRow).toContainText(title);
    await expect(topRow.locator(".type-badge")).toHaveText("AN");
  });
});

test.describe("Today enhancements: freestyle spot-check", () => {
  test("a no-plan user sees the filter chips but no type chips", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "today-freestyle@e2e.test",
      name: "Today Freestyle Tester",
    });
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.locator(".today-plan-line-freestyle")).toBeVisible();
    await expect(page.getByText("FREESTYLE")).toBeVisible();

    await expect(page.locator(".today-filter-chips")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "EASY", exact: true }),
    ).toBeVisible();
    const painGroup = page.getByRole("group", { name: "PAIN" });
    await expect(
      painGroup.getByRole("button", { name: "1", exact: true }),
    ).toBeVisible();

    // No plan active — nothing to swap away from, so the type-swap chip
    // row doesn't render at all.
    await expect(page.locator(".today-type-chips")).toHaveCount(0);
  });
});
