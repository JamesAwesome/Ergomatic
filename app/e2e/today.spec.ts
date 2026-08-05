import { test, expect, type Page } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

// Today enhancements (post-6C, Task 4): the four flows the task's own plan
// names — visible filters actually narrowing the suggestion, a
// type-swap that survives to Start and resets once the plan advances, the
// outside-plan toggle read from Today's own counter (the manual-door half
// of that flow lives in e2e/session.spec.ts, alongside Task 2's other Log
// screen loops — see that file's own "Phase 6C Task 3" describe), and a
// freestyle (no-plan) spot-check that the type chips genuinely don't
// render without a plan to swap against. Task 3 (2026-08-04 round) re-routes
// the filter interactions through the FILTER ⌄ sheet (`TodayFilterSheet.tsx`)
// — DIFFICULTY/TIME/PAIN no longer render as inline chips on the screen
// itself, only inside the sheet the FILTER ⌄ chip opens — and adds the
// sheet's own CLEAR-ALL-restores-defaults and backdrop-discard coverage.
// Every test signs in as its own unique, workout-free email (session.spec.ts's
// own convention) and cleans up its own personal workout(s) via
// `test.afterEach` so a re-run against a dirty, persisted database doesn't
// accumulate stale rows or drift a suggestion's expected pick.

/** Opens Today's FILTER sheet — every filter interaction below goes through
 *  it now that the old inline DIFFICULTY/TIME/PAIN chip rows are retired
 *  (Task 3, 2026-08-04 round) — same idiom as library.spec.ts's own
 *  `openFilterSheet`. */
function openFilterSheet(page: Page) {
  return page.getByRole("button", { name: "FILTER ⌄" }).click();
}

/** The sheet's own primary — a constant "Apply Filter" (Revision, mid-round:
 *  the live count moved off this button's own copy onto a caption above it,
 *  `todayFilterSheetCount` below). Commits the draft and closes the sheet. */
function applyFilterSheet(page: Page) {
  return page.getByRole("button", { name: "Apply Filter" }).click();
}

/** The sheet's own live-counting caption (`N OPTIONS`/`1 OPTION`) — the
 *  Revision's replacement for the count the primary button's copy used to
 *  carry ("Show N options"). Locates by class rather than text so callers
 *  can assert its CONTENTS without knowing the exact count in advance. */
function filterSheetCount(page: Page) {
  return page.locator(".today-filter-sheet-count");
}

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
 *  without hardcoding which seeded workout happens to sort first.
 *
 *  Cost control (the 35→300 seed made the naive form ~90 sequential POSTs
 *  per call, every run):
 *  - Only NEVER-DONE globals are logged — the list payload already carries
 *    `lastDoneDaysAgo`, and any non-null value loses the tie to a fresh
 *    personal fixture just the same, so rows neutralized by an earlier run
 *    against this fixed account are skipped for free. First run per
 *    account/type pays the full quota; every later run pays ~zero, and the
 *    stray-row accumulation in the shared e2e DB is capped at one log per
 *    global per account instead of growing per run.
 *  - POSTs go out in concurrent batches of 10 — order is irrelevant here
 *    (all that matters is non-null recency), and `advancesPlan: false`
 *    (below) removes the one shared row the old sequential loop was
 *    implicitly serializing on.
 *  - Each POST carries `advancesPlan: false`, so `plan_state.done_n` is
 *    untouched — the old form's per-POST bump (and the "harmless because
 *    every caller resets the plan afterward" caveat that had to excuse it)
 *    is gone. */
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
      lastDoneDaysAgo: number | null;
    }>;
    const targets = workouts.filter(
      (w) => w.isGlobal && w.type === t && w.lastDoneDaysAgo === null,
    );
    const BATCH = 10;
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map((w) =>
          fetch("/api/logs", {
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
              advancesPlan: false,
            }),
          }),
        ),
      );
      const failed = results.find((res) => !res.ok);
      if (failed) return { ok: false, status: failed.status };
    }
    return { ok: true, status: 200 };
  }, type);
  if (!result.ok) {
    throw new Error(`neutralize failed: ${result.status}`);
  }
}

/** Logs a single personal (non-global) workout, by title, once — giving it
 *  a real, non-null `lastDoneDaysAgo` (a few seconds old, so it always
 *  reads as 0 days ago) instead of never-done. Fix round (L1, 2026-08-04
 *  whole-branch review): the SOURCE=CUSTOM keep-or-move e2e below needs
 *  ONE of its two personal fixtures to rank BELOW the other in
 *  `byLeastRecentlyDone` (never-done always outranks any real number) —
 *  without this, both fixtures tie as never-done and a stable sort makes
 *  `sorted[0]` the same card whether the pickOverride mechanic the test
 *  means to prove actually ran or not. Same `advancesPlan: false` POST
 *  /api/logs idiom as `neutralizeGlobalRecency` above, scoped to one row
 *  instead of a batch. */
async function logOnce(page: Page, title: string): Promise<void> {
  const result = await page.evaluate(async (t) => {
    const listRes = await fetch("/api/workouts");
    if (!listRes.ok) return { ok: false, status: listRes.status };
    const workouts = (await listRes.json()) as Array<{
      id: string;
      title: string;
      type: string;
      isGlobal: boolean;
    }>;
    const match = workouts.find((w) => !w.isGlobal && w.title === t);
    if (!match) return { ok: false, status: 404 };
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutId: match.id,
        workoutTitle: t,
        workoutType: match.type,
        held: "held",
        pain: 1,
        notes: null,
        steps: [{ label: "Work" }],
        advancesPlan: false,
      }),
    });
    return { ok: res.ok, status: res.status };
  }, title);
  if (!result.ok) {
    throw new Error(`logOnce failed for "${title}": ${result.status}`);
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

    // Task 3 (2026-08-04 round): the tap moves inside the FILTER sheet — the
    // PAIN cells no longer render on the screen itself.
    await openFilterSheet(page);
    const dialog = page.getByRole("dialog");
    const painGroup = dialog.getByRole("group", { name: "PAIN" });
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
    await applyFilterSheet(page);

    // A real, provable change: the recommendation itself swapped to the
    // low-pain fixture now that the high-pain one is filtered out.
    await expect(page.locator(".today-card-title")).toHaveText(lowPainTitle);

    // Reload: the override persists (same day, same planKey/doneN) — the
    // card stays on the filtered pick, not back to the pre-filter default,
    // and re-opening the sheet shows the cells still pressed.
    await page.reload();
    await expect(page.locator(".today-card")).toBeVisible();
    await expect(page.locator(".today-card-title")).toHaveText(lowPainTitle);
    await openFilterSheet(page);
    const painGroupAfterReload = page
      .getByRole("dialog")
      .getByRole("group", { name: "PAIN" });
    await expect(
      painGroupAfterReload.getByRole("button", { name: "1", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      painGroupAfterReload.getByRole("button", { name: "2", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

// Round 2 (2026-08-04): the LAST DONE/SOURCE groups join DIFFICULTY/TIME/
// PAIN in the sheet, and the primary button's copy settled on the constant
// "Apply Filter" (Revision, mid-round) with the live count moved to its own
// caption. This single continuous flow covers three things at once, per
// the round's own testing note: a real SOURCE=CUSTOM filter (the personal
// fixtures ARE the pool, the caption's count is honest, not hardcoded), and
// both halves of the revision's "keep-or-move" requirement.
//
// Fix round (L1, 2026-08-04 whole-branch review): the KEEP half needs a
// SHUFFLE-established pick that a naive recompute would NOT reproduce on
// its own — mirroring domain/suggest.test.ts's own "shown" vs.
// "would-otherwise-win" fixture trick — rather than two never-done
// fixtures whose tie-broken sort would show the same card whether the
// pickOverride mechanic ran or not. `naturalWinnerTitle` stays never-done
// (outranks everything); `shuffledPickTitle` is logged once (`logOnce`) so
// it carries a real `lastDoneDaysAgo` and would NEVER win the sort on its
// own — the only way it appears on screen is because SHUFFLE explicitly
// picked it and the app correctly preserves that pick across a filter
// apply.
test.describe("Today enhancements: SOURCE=CUSTOM and the keep-or-move guarantee", () => {
  const naturalWinnerTitle = "Today Keep-Or-Move Natural Winner E2E";
  const shuffledPickTitle = "Today Keep-Or-Move Shuffled Pick E2E";

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, naturalWinnerTitle);
    await cleanupByTitle(page, shuffledPickTitle);
  });

  test("SOURCE=CUSTOM narrows to the two personal fixtures with an honest count; a SHUFFLE-established pick survives a still-matching filter, then moves once LAST DONE excludes it", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "today-keep-or-move@e2e.test",
      name: "Today Keep-Or-Move Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    // Same neutralize idiom as the PAIN-filter test above: makes
    // `naturalWinnerTitle` the only never-done O2 entry in the WHOLE
    // library (globals included), so it's the deterministic pre-filter
    // pick regardless of either personal fixture's own creation order.
    await neutralizeGlobalRecency(page, "O2");
    await importBulk(
      page,
      [`${naturalWinnerTitle} | O2 | medium | 2`, "w 1:00 6k"].join("\n"),
    );
    await importBulk(
      page,
      [`${shuffledPickTitle} | O2 | medium | 5`, "w 1:00 6k"].join("\n"),
    );
    // Gives shuffledPickTitle a real (non-null) lastDoneDaysAgo — it now
    // permanently loses the recency sort to naturalWinnerTitle's own
    // never-done null, in BOTH the unfiltered and the SOURCE=CUSTOM pool.
    await logOnce(page, shuffledPickTitle);
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);

    await page.goto("/today");
    await expect(page.locator(".today-card")).toBeVisible();
    await expect(page.locator(".today-card-title")).toHaveText(
      naturalWinnerTitle,
    );

    // SOURCE=CUSTOM: both personal fixtures pass (neither is global), and
    // nothing else in this fresh account's library is personal — the
    // caption's count is a real, honest 2, not a hardcoded label. The
    // natural winner still wins the sort here too (still never-done) — no
    // discrimination yet, just proves the narrowing itself works.
    await openFilterSheet(page);
    const dialog = page.getByRole("dialog");
    const sourceGroup = dialog.getByRole("group", { name: "SOURCE" });
    const customCell = sourceGroup.getByRole("button", {
      name: "CUSTOM",
      exact: true,
    });
    await expect(customCell).toHaveAttribute("aria-pressed", "false");
    await customCell.click();
    await expect(customCell).toHaveAttribute("aria-pressed", "true");
    await expect(filterSheetCount(page)).toHaveText("2 OPTIONS");
    // The button copy itself, asserted directly rather than only through
    // the `applyFilterSheet` helper — Revision (mid-round): the constant
    // "Apply Filter", no count, no Show/Shuffle wording.
    await expect(
      page.getByRole("button", { name: "Apply Filter" }),
    ).toBeVisible();
    await applyFilterSheet(page);
    await expect(page.locator(".today-card-title")).toHaveText(
      naturalWinnerTitle,
    );

    // Establish a genuinely discriminating pick: SHUFFLE, against the now
    // exactly-2-entry CUSTOM pool, cycles from index 0 (naturalWinnerTitle,
    // the current recommendation) to index 1 (shuffledPickTitle) — a card
    // that could ONLY appear here because the pickOverride mechanic ran,
    // never because of the recency sort (which permanently favors the
    // never-done natural winner instead).
    await page.getByRole("button", { name: "SHUFFLE ↻" }).click();
    await expect(page.locator(".today-card-title")).toHaveText(
      shuffledPickTitle,
    );

    // KEEP: a genuinely NEW filter (deselect HARD — both fixtures are
    // `medium`, so this can't touch the pool) is applied — the shuffled
    // pick still matches it, so it must survive Apply. Discriminating: a
    // naive recompute that dropped/ignored the stored pickOverride would
    // incorrectly revert to naturalWinnerTitle here, since that's what the
    // recency sort alone would produce.
    await openFilterSheet(page);
    await dialog.getByRole("button", { name: "HARD", exact: true }).click();
    await applyFilterSheet(page);
    await expect(page.locator(".today-card-title")).toHaveText(
      shuffledPickTitle,
    );
    await expect(
      page.locator(".filter-token", { hasText: "EASY–MEDIUM" }),
    ).toBeVisible();

    // MOVE: LAST DONE=21D+ now excludes the shuffled pick specifically (it
    // has a real, recent `lastDoneDaysAgo` — under the 21-day boundary,
    // i.e. NOT `21D+`) while keeping the never-done natural winner (never-
    // done counts as `21D+`, the Library's own pinned rule) — Apply has to
    // swap the card back, not merely narrow silently while leaving a
    // now-invalid pick on screen.
    await openFilterSheet(page);
    const lastDoneGroup = page.getByRole("dialog").getByRole("group", {
      name: "LAST DONE",
    });
    await lastDoneGroup
      .getByRole("button", { name: "21D+", exact: true })
      .click();
    await expect(filterSheetCount(page)).toHaveText("1 OPTION");
    await applyFilterSheet(page);

    await expect(page.locator(".today-card-title")).toHaveText(
      naturalWinnerTitle,
    );
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
  // Task 3 (2026-08-04 round): the flat filter chip row is gone — a
  // freestyle (no-plan) user sees the same FILTER ⌄ chip a plan-driven
  // Today does, and opening it shows every group the sheet has (the sheet
  // has no notion of a plan at all). Round 2 (2026-08-04) adds LAST DONE/
  // SOURCE to that same unconditional set — five groups now, not three.
  test("a no-plan user sees FILTER ⌄ and all five of its sheet's groups, but no type chips", async ({
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

    await expect(page.getByRole("button", { name: "FILTER ⌄" })).toBeVisible();
    await openFilterSheet(page);
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("group", { name: "DIFFICULTY" }),
    ).toBeVisible();
    await expect(dialog.getByRole("group", { name: "TIME" })).toBeVisible();
    await expect(dialog.getByRole("group", { name: "PAIN" })).toBeVisible();
    await expect(
      dialog.getByRole("group", { name: "LAST DONE" }),
    ).toBeVisible();
    await expect(dialog.getByRole("group", { name: "SOURCE" })).toBeVisible();
    const painGroup = dialog.getByRole("group", { name: "PAIN" });
    await expect(
      painGroup.getByRole("button", { name: "1", exact: true }),
    ).toBeVisible();

    // No plan active — nothing to swap away from, so the type-swap chip
    // row doesn't render at all (unaffected by this round: it never lived
    // inside the sheet).
    await expect(page.locator(".today-type-chips")).toHaveCount(0);
  });
});

// Task 3 (2026-08-04 round): CLEAR ALL's own deliberate divergence from the
// Library's CLEAR ALL (which empties every filter to nothing) — Today's
// CLEAR ALL resets to the day's pref-derived DEFAULTS instead
// (`filterDefaults` in Today.tsx: every difficulty, the account's own cap,
// no pain filter). The reason it CAN'T just empty everything the way the
// Library does: `suggest()`/`suggestFreestyle()` treat an EMPTY
// `difficulties` array as "match nothing" (domain/suggest.ts:
// `prefs.difficulties.includes(e.difficulty)`, with no `.length` escape
// hatch the way `painLevels` gets one) — emptying DIFFICULTY the way the
// Library empties TYPE would zero the pool, not restore it. This test
// proves the actual behaviour: two groups pushed off-default, then CLEAR
// ALL removes the tokens AND the card returns to the day's real, unfiltered
// pick — never an empty-pool dead end.
test.describe("Today enhancements: CLEAR ALL restores the day's defaults", () => {
  const highPainTitle = "Today Clear All High Pain E2E";
  const lowPainTitle = "Today Clear All Low Pain E2E";

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, highPainTitle);
    await cleanupByTitle(page, lowPainTitle);
  });

  test("two groups off-default -> CLEAR ALL -> tokens gone and the card shows the unfiltered pick, not an empty pool", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "today-clear-all@e2e.test",
      name: "Today Clear All Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    // Same neutralize-then-import idiom as the PAIN-filter test above: makes
    // these two personal fixtures the only never-done O2 entries, so the
    // unfiltered pick is deterministic (creation order: high-pain first).
    await neutralizeGlobalRecency(page, "O2");
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
    await expect(page.locator(".today-card-title")).toHaveText(highPainTitle);
    // At rest, nothing deviates from the day's defaults — no tokens, no
    // CLEAR ALL.
    await expect(page.locator(".filter-token")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "CLEAR ALL" })).toHaveCount(
      0,
    );

    // Push two groups off-default: DIFFICULTY (deselect HARD — harmless to
    // the pool, since these fixtures are both `medium`, but a real,
    // provable deviation from the all-three default) and PAIN (1+2, which
    // excludes the high-pain fixture and narrows the pool to the low-pain
    // one alone).
    await openFilterSheet(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "HARD", exact: true }).click();
    const painGroup = dialog.getByRole("group", { name: "PAIN" });
    await painGroup.getByRole("button", { name: "1", exact: true }).click();
    await painGroup.getByRole("button", { name: "2", exact: true }).click();
    await applyFilterSheet(page);

    await expect(page.locator(".filter-token")).toHaveCount(2);
    await expect(page.locator(".today-card-title")).toHaveText(lowPainTitle);
    const clearAll = page.getByRole("button", { name: "CLEAR ALL" });
    await expect(clearAll).toBeVisible();

    await clearAll.click();

    // Tokens gone...
    await expect(page.locator(".filter-token")).toHaveCount(0);
    await expect(clearAll).toHaveCount(0);
    // ...AND the card is back on the real, unfiltered pick — never an
    // empty-pool dead end (the Library's own CLEAR ALL, which empties
    // TYPE to nothing, would zero this exact pool if Today reused it).
    await expect(page.locator(".today-card-title")).toHaveText(highPainTitle);

    // Re-opening confirms the draft itself reset too, not just the applied
    // record — every cell back to its default pressed state.
    await openFilterSheet(page);
    const dialogAfterClear = page.getByRole("dialog");
    for (const label of ["EASY", "MEDIUM", "HARD"]) {
      await expect(
        dialogAfterClear.getByRole("button", { name: label, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    const painGroupAfterClear = dialogAfterClear.getByRole("group", {
      name: "PAIN",
    });
    for (const level of ["1", "2", "3", "4", "5"]) {
      await expect(
        painGroupAfterClear.getByRole("button", { name: level, exact: true }),
      ).toHaveAttribute("aria-pressed", "false");
    }
  });
});

// Task 3 (2026-08-04 round): the sheet's own backdrop-discards-the-draft
// semantics (SheetShell.tsx's `onDismiss`, already pinned at the component
// level by SheetShell.test.tsx/TodayFilterSheet.test.tsx) get exactly one
// end-to-end pin here — a real backdrop tap, against the real applied
// state, proving the draft never reaches storage.
test.describe("Today enhancements: sheet dismiss discards the draft", () => {
  test("tapping the backdrop after changing the draft leaves the applied filters unchanged", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "today-sheet-dismiss@e2e.test",
      name: "Today Sheet Dismiss Tester",
    });
    await page.goto("/today");
    await expect(page.locator(".today-card")).toBeVisible();
    await expect(page.locator(".filter-token")).toHaveCount(0);

    await openFilterSheet(page);
    const dialog = page.getByRole("dialog");
    const painCell3 = dialog
      .getByRole("group", { name: "PAIN" })
      .getByRole("button", { name: "3", exact: true });
    await expect(painCell3).toHaveAttribute("aria-pressed", "false");
    await painCell3.click();
    await expect(painCell3).toHaveAttribute("aria-pressed", "true");

    // The backdrop is the dialog's own parent (`.filter-sheet-backdrop`,
    // SheetShell.tsx) — clicked near the top, well clear of the bottom-
    // anchored panel itself, so this can't accidentally land on a group
    // cell instead.
    await page
      .locator(".filter-sheet-backdrop")
      .click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Discarded: no token rendered from the never-applied PAIN pick.
    await expect(page.locator(".filter-token")).toHaveCount(0);

    // Re-opening starts fresh from the still-unapplied overrides — PAIN 3
    // is inactive again, not left over from the discarded draft.
    await openFilterSheet(page);
    await expect(
      page
        .getByRole("dialog")
        .getByRole("group", { name: "PAIN" })
        .getByRole("button", { name: "3", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
