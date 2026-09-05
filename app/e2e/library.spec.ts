import { test, expect, type Page } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

// Golden flows through Library -> detail -> You, against the real compose
// stack (nginx + api + postgres, seeded with the global workout library at
// boot — see server/seed/seed.ts / server/seed/library/index.ts). Per
// docs/TESTING.md's pyramid, this layer proves the wiring between
// screens/routes/the SPA fallback, not the Erg Book math itself (that's
// domain/pace.test.ts's job).
//
// The library is regenerated periodically (300 workouts as of the
// workout-generation phase, up from an original 35) and its exact count
// isn't this suite's concern, so nothing here hardcodes it. `.library-count`
// only renders once both workouts and baselines have resolved (Library.tsx
// shows "LOADING…" until then), so waiting for it to match `/^\d+ WORKOUTS$/`
// doubles as this suite's "the list finished loading" signal — the same
// auto-retry a `toHaveCount(35)` used to provide, without pinning a number
// that drifts every time the library is regenerated. (Task 4, ui-fix round,
// retired the literal word "ENTERED" for "WORKOUTS" — DEVIATIONS.md.)
async function waitForLibraryLoaded(page: Page): Promise<void> {
  await expect(page.locator(".library-count")).toHaveText(/^\d+ WORKOUTS$/);
}

/** Opens the FILTER sheet — DIFFICULTY/TIME/PAIN/LAST DONE/SOURCE all go
 *  through it (library-filter-unification round: TYPE left the sheet
 *  entirely for the chip row above it — see the type-chip-row tests below,
 *  which never call this). */
function openFilterSheet(page: Page) {
  return page.getByRole("button", { name: "FILTER ⌄" }).click();
}

/** The sheet's own primary — commits the draft and closes the sheet. Its
 *  accessible name is now the constant "Apply Filter" (library-filter-
 *  unification round, Task 2: the live count moved off the button's own
 *  name onto a caption above it, spec §3) rather than the old live-counting
 *  "Show N workouts" this helper used to target. */
function applyFilterSheet(page: Page) {
  return page.getByRole("button", { name: "Apply Filter" }).click();
}

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
    await waitForLibraryLoaded(page);
    const count = await rows.count();
    // The starter library seeds 300 (Phase 6I: the seed itself now converges
    // 302 global rows — the same 300 plus the two designated onboarding
    // workouts, server/seed/library/index.ts's GLOBAL_LIBRARY_SEED — but
    // Library.tsx's own list filters those two out by title, domain/
    // onboarding.ts's isOnboardingTitle, so the rendered row count here
    // stays 300). This is a FLOOR, not a pin: it catches a broken/regressed
    // seed (e.g. a quota bug shipping 5 rows) without hardcoding the exact
    // count, which is expected to keep growing.
    expect(count).toBeGreaterThan(250);
    await expect(rows).toHaveCount(count);
    await expect(page.locator(".library-count")).toHaveText(
      `${count} WORKOUTS`,
    );
  });

  test("a TYPE chip narrows the list, and CLEAR ALL restores it", async ({
    page,
  }) => {
    const rows = page.locator(".workout-row");
    // Anchor on load completion first, via the header text rather than a
    // hardcoded total (see `waitForLibraryLoaded`) — a bare `.count()`
    // doesn't auto-wait like a `toHaveText` assertion does; reading it too
    // early races the fetch and observes 0.
    await waitForLibraryLoaded(page);
    const initialCount = await rows.count();

    // The library has 90 O2 / 75 AT / 75 TR / 60 AN workouts
    // (server/seed/library/index.ts's quota grid) — a proper, non-trivial
    // subset either way of the whole library. TYPE left the FILTER sheet
    // for its own chip row above the list (library-filter-unification
    // round, Task 2, spec §2) — tapping the chip applies immediately, no
    // sheet/Apply Filter round trip needed.
    await page.getByRole("button", { name: "AN", exact: true }).click();

    await expect(rows).not.toHaveCount(initialCount);
    const filteredCount = await rows.count();
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(initialCount);
    await expect(page.locator(".library-count")).toHaveText(
      `${filteredCount} OF ${initialCount} SHOWN`,
    );
    // The chip itself is the indicator — TYPE is not tokenized (2026-08-12,
    // "already visible"), so assert the pressed chip and the ABSENCE of a
    // pill rather than a token label.
    await expect(
      page
        .locator(".type-chip-grid")
        .getByRole("button", { name: "AN", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator(".filter-token-label", { hasText: /^AN$/ }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "CLEAR ALL" }).click();
    await expect(rows).toHaveCount(initialCount);
    await expect(page.locator(".library-count")).toHaveText(
      `${initialCount} WORKOUTS`,
    );
  });

  // Task 3 (workout-step-detail spec §3): line 2 of 3, the generated
  // structure line (structureLine(), domain/display/stepDetail.ts). This
  // hits the real compose stack seeded with the actual 300-workout
  // library (server/seed/library/index.ts) — not a hand-built fixture —
  // so a workout whose steps somehow can't be expanded (structureLine
  // throwing, or falling through to an empty string) would show up here
  // as an empty/missing line, unlike a unit test built on one chosen shape.
  test("the first row's structure line (line 2 of 3) is non-empty", async ({
    page,
  }) => {
    await waitForLibraryLoaded(page);
    const structureLine = page.locator(".workout-row-structure").first();
    await expect(structureLine).toBeVisible();
    await expect(structureLine).not.toHaveText("");
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

test.describe("scroll restoration (bugfix round: back-nav + scroll)", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "library-scroll@e2e.test",
      name: "Scroll Tester",
    });
    await page.goto("/library");
    await waitForLibraryLoaded(page);
  });

  test("BACK from a workout's detail restores where you were; leaving via a tab and returning starts fresh at the top", async ({
    page,
  }) => {
    const rows = page.locator(".workout-row");
    const fullCount = await rows.count();
    expect(fullCount).toBeGreaterThan(29);
    // Row ~30 of the library — deep enough that "restored to the top" and
    // "restored to where you were" are unambiguously different outcomes,
    // not accidentally within each other's tolerance.
    const targetRow = rows.nth(29);
    await targetRow.scrollIntoViewIfNeeded();
    const scrolledY = await page.evaluate(() => window.scrollY);
    expect(scrolledY).toBeGreaterThan(200);

    // Deliberately no wait here: the save listener is throttled to ~100ms
    // (Library.tsx), and clicking IMMEDIATELY — inside that window — is
    // exactly the case Library.tsx's unmount cleanup has to cover (flush
    // the CURRENT scrollY synchronously on unmount) rather than relying on
    // the throttled write ever having landed on its own.
    const title = await targetRow.locator(".workout-row-title").innerText();
    await targetRow.click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

    await page.getByRole("link", { name: "← BACK" }).click();
    await expect(page.locator(".workout-row").first()).toBeVisible();

    // The restore runs in a useLayoutEffect gated on the rows having
    // rendered — poll rather than read once, so a slow first paint on CI
    // doesn't race a bare assertion.
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(scrolledY - 50);
    const restoredY = await page.evaluate(() => window.scrollY);
    expect(Math.abs(restoredY - scrolledY)).toBeLessThanOrEqual(50);

    // Leave Library entirely via a DIFFERENT tab (so the next Library visit
    // is a genuine fresh mount, not the same instance BACK returned to),
    // then tap the LIBRARY tab explicitly — that tap is what clears the
    // saved position (TabBar.tsx), so this lands at the top, not back at
    // row 30.
    await page.getByRole("link", { name: "TODAY" }).click();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    await page.getByRole("link", { name: "LIBRARY" }).click();
    await waitForLibraryLoaded(page);
    await expect(page.locator(".workout-row")).toHaveCount(fullCount);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThanOrEqual(50);
  });

  test("BACK with filters enabled keeps the tokens active and restores against the FILTERED list; a fresh tab tap forgets both", async ({
    page,
  }) => {
    // The device bug this pins: filters lived in component state, so a
    // BACK return remounted Library unfiltered — the filter row was gone
    // and the restored scroll position (measured against the shorter
    // filtered list) landed on the wrong rows.
    // PAIN 1, 2, 3 (via the sheet) keeps a genuine subset of the library
    // (per-workout pain values are spread 1–5, server/seed/library/index.ts)
    // — narrowed enough, yet still several viewports deep, so "restored
    // against the filtered list" and "restored to the top" stay
    // unambiguously different outcomes. Task 4 (ui-fix round) replaces the
    // old single PAIN ≤3 chip with a 1–5 multi-select, contiguous-collapsing
    // to one "PAIN 1–3" token — reached through the sheet.
    const rows = page.locator(".workout-row");
    const fullCount = await rows.count();
    await openFilterSheet(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "1", exact: true }).click();
    await dialog.getByRole("button", { name: "2", exact: true }).click();
    await dialog.getByRole("button", { name: "3", exact: true }).click();
    await applyFilterSheet(page);

    const painToken = page.locator(".filter-token-label", {
      hasText: "PAIN 1–3",
    });
    await expect(painToken).toBeVisible();
    const filteredCount = await rows.count();
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(fullCount);

    // Scroll deep into the FILTERED list — the position only means
    // anything against this narrowed set of rows.
    const lastRow = rows.nth(filteredCount - 1);
    await lastRow.scrollIntoViewIfNeeded();
    // Poll, don't read-once: under CI load the scroll settles a beat after
    // scrollIntoViewIfNeeded resolves, and a same-tick read caught a
    // mid-flight scrollY (red main run, 2026-08-08). The settled value is
    // what the restore assertion below compares against.
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(200);
    const scrolledY = await page.evaluate(() => window.scrollY);
    const title = await lastRow.locator(".workout-row-title").innerText();
    await lastRow.click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

    await page.getByRole("link", { name: "← BACK" }).click();

    // Filters survive the round trip: the token is back, count still the
    // filtered one — asserted BEFORE the scroll check because the restore
    // is only correct if it happened against this narrowed list.
    await expect(painToken).toBeVisible();
    await expect(rows).toHaveCount(filteredCount);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(scrolledY - 50);

    // A deliberate tab tap is a fresh visit: both halves forgotten.
    await page.getByRole("link", { name: "TODAY" }).click();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await page.getByRole("link", { name: "LIBRARY" }).click();
    await waitForLibraryLoaded(page);
    await expect(rows).toHaveCount(fullCount);
    await expect(painToken).not.toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThanOrEqual(50);
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
    // rendered target is a real, comparable value once baselines are
    // set (never the "no target" fallback — see StepRow.tsx).
    const target = page.locator(".step-row-range").first();
    const before = await target.innerText();
    expect(before).toMatch(/\d/);

    await page.goto("/you");
    // Retype BOTH splits (Option T typed fields): the first target's pace
    // ref could be based on either 2k or 6k, and this test asserts the
    // end-to-end wiring (a baseline change reaches the detail screen), not
    // which ref a given step happens to use — see docs/TESTING.md's
    // pyramid on e2e's scope. The seeded pair is 100/110 (beforeEach);
    // +3s each: "143" -> 1:43 = 103s, "153" -> 1:53 = 113s.
    for (const [base, digits] of [
      ["2k", "143"],
      ["6k", "153"],
    ] as const) {
      const field = page.getByRole("textbox", { name: `${base} split` });
      await field.click();
      await field.pressSequentially(digits);
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

test.describe("SOURCE filter", () => {
  test("selecting MY WORKOUTS narrows to an authored workout, and CLEAR ALL restores the full library", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "library-custom@e2e.test",
      name: "Custom Filter Tester",
    });
    const title = "E2E Custom Filter Workout";

    // Baseline count first (the global library, dynamic per
    // `waitForLibraryLoaded` above — see its comment for why this suite
    // doesn't hardcode a total).
    await page.goto("/library");
    const rows = page.locator(".workout-row");
    await waitForLibraryLoaded(page);
    const baselineCount = await rows.count();

    // Author a workout through the builder (same minimal single-row flow as
    // builder.spec.ts's exit-criterion test) — it lands in the library as
    // `isGlobal: false`, the only kind SOURCE=custom should surface.
    await page.goto("/library/new");
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Pain 3" }).click();
    await page.getByLabel("Row 1 duration", { exact: true }).fill("2000");
    await page.getByRole("button", { name: "Save to library" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+$/);

    await page.goto("/library");
    await expect(rows).toHaveCount(baselineCount + 1);

    await openFilterSheet(page);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "MY WORKOUTS", exact: true })
      .click();
    await applyFilterSheet(page);

    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator(".workout-row-title")).toHaveText(title);
    await expect(rows.first().locator(".workout-row-custom")).toHaveText(
      "MY WORKOUTS",
    );

    await page.getByRole("button", { name: "CLEAR ALL" }).click();
    await expect(rows).toHaveCount(baselineCount + 1);

    await cleanupByTitle(page, title);
  });
});

test.describe("TYPE + DIFFICULTY composition (chip row union intersected with the sheet)", () => {
  // Phase 8A PR B (James's ruling, 2026-08-22): the Library list SHOWS
  // the two tests now, so the independently-computed expected counts
  // below include every workout the API returns — no exclusion.

  // Library-filter-unification round, Task 3 (spec's own Testing section:
  // "an e2e picking two types from the chip row plus a difficulty in the
  // sheet, surviving a BACK round trip") — and the review's own M-8 (the
  // chip row's selection lives directly in `filters`, not a sheet draft, so
  // nothing before this test pinned it surviving a BACK round trip at the
  // client-observable level).
  test("two TYPE chips union, a sheet DIFFICULTY intersects, and both survive a BACK round trip", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "library-union-e2e@e2e.test",
      name: "Union Filter Tester",
    });
    await page.goto("/library");
    const rows = page.locator(".workout-row");
    await waitForLibraryLoaded(page);

    // Independently computed straight off the real seeded data via the API
    // — NOT re-derived from the app's own `applyFilters` (that would only
    // prove the app agrees with itself). Same in-page-`fetch` idiom this
    // file's own `cleanupByTitle`/baseline-reset helpers use (the api
    // container's Secure-cookie session makes `page.request` unusable here).
    const counts = await page.evaluate(async () => {
      const res = await fetch("/api/workouts");
      const workouts = (await res.json()) as Array<{
        title: string;
        type: string;
        difficulty: string;
      }>;
      const real = workouts;
      const isUnionType = (w: { type: string }) =>
        w.type === "O2" || w.type === "AT";
      const total = real.length;
      const unionCount = real.filter(isUnionType).length;
      const difficultyCount = real.filter(
        (w) => w.difficulty === "medium",
      ).length;
      const expected = real.filter(
        (w) => isUnionType(w) && w.difficulty === "medium",
      ).length;
      return { total, unionCount, difficultyCount, expected };
    });
    // A real, non-trivial intersection against the actual seeded library —
    // not a degenerate 0-or-all case a broken union/intersection predicate
    // could still pass under.
    expect(counts.expected).toBeGreaterThan(0);
    expect(counts.expected).toBeLessThan(counts.unionCount);
    expect(counts.expected).toBeLessThan(counts.difficultyCount);
    expect(counts.unionCount).toBeLessThan(counts.total);

    // Two chips from the row — a UNION (both types' rows show), never a
    // single-select replace (library-filter-unification round, Task 2:
    // Library's own TYPE chips are multi-select, unlike Today's).
    await page.getByRole("button", { name: "O2", exact: true }).click();
    await page.getByRole("button", { name: "AT", exact: true }).click();
    await expect(rows).toHaveCount(counts.unionCount);
    // Both chips pressed, and still no type pill (2026-08-12 ruling).
    for (const code of ["O2", "AT"]) {
      await expect(
        page
          .locator(".type-chip-grid")
          .getByRole("button", { name: code, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    await expect(
      page.locator(".filter-token-label", { hasText: /^O2 · AT$/ }),
    ).toHaveCount(0);

    // A DIFFICULTY band from the sheet intersects with the chip-row union —
    // composed together, not either alone.
    await openFilterSheet(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "MEDIUM", exact: true }).click();
    // The sheet's own primary reads the constant name (library-filter-
    // unification round, Task 2, spec §3) — never a live "Show N workouts".
    await expect(
      dialog.getByRole("button", { name: "Apply Filter" }),
    ).toBeVisible();
    await applyFilterSheet(page);

    await expect(rows).toHaveCount(counts.expected);
    await expect(page.locator(".library-count")).toHaveText(
      `${counts.expected} OF ${counts.total} SHOWN`,
    );
    await expect(
      page.locator(".filter-token-label", { hasText: "MEDIUM" }),
    ).toBeVisible();

    // BACK round trip: both the chip row's own TYPE selection (which lives
    // directly in `filters`, never a sheet draft) and the sheet's own
    // DIFFICULTY selection survive — extending the existing filters-survive-
    // BACK lock (`scroll restoration` describe above) to the chip row.
    const firstRow = rows.first();
    const title = await firstRow.locator(".workout-row-title").innerText();
    await firstRow.click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

    await page.getByRole("link", { name: "← BACK" }).click();

    // The chip-row selection survives BACK as PRESSED CHIPS (its own
    // persistence path), the sheet's difficulty as a token — both halves,
    // since only one of them is tokenized now.
    for (const code of ["O2", "AT"]) {
      await expect(
        page
          .locator(".type-chip-grid")
          .getByRole("button", { name: code, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    await expect(
      page.locator(".filter-token-label", { hasText: "MEDIUM" }),
    ).toBeVisible();
    await expect(rows).toHaveCount(counts.expected);
    await expect(page.locator(".library-count")).toHaveText(
      `${counts.expected} OF ${counts.total} SHOWN`,
    );
  });
});

// Phase SF PR3 (spec §4, exit criterion 6): SEARCH BY NAME on the real
// 300-workout seed — `fog` finds the fog titles and nothing else, survives a
// detail round trip through the BACK record, and the LIBRARY tab forgets it.
test.describe("Phase SF PR3: search by name", () => {
  test("`fog` narrows to the fog titles, survives BACK from a detail, and the LIBRARY tab clears it", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "library-search@e2e.test",
      name: "Library Search Tester",
    });
    await page.goto("/library");
    await waitForLibraryLoaded(page);
    const total = await page.locator(".workout-row").count();
    const field = page.getByRole("searchbox", { name: "Search by name" });
    await expect(field).not.toBeFocused();

    await field.fill("fog");
    const rows = page.locator(".workout-row");
    await expect(rows.first()).toBeVisible();
    const narrowed = await rows.count();
    expect(narrowed).toBeGreaterThan(0);
    expect(narrowed).toBeLessThan(total);
    for (const title of await rows
      .locator(".workout-row-title")
      .allTextContents()) {
      expect(title.toLowerCase()).toContain("fog");
    }
    await expect(page.locator(".library-count")).toHaveText(
      `${narrowed} OF ${total} SHOWN`,
    );
    await expect(page.locator(".filter-token")).toHaveCount(0);

    // BACK round trip: the query and the narrowed list come back.
    await rows.first().locator("a").click();
    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await page.goBack();
    await waitForLibraryLoaded(page);
    await expect(field).toHaveValue("fog");
    await expect(page.locator(".workout-row")).toHaveCount(narrowed);

    // The tab forgets it, like every other filter.
    await page.getByRole("link", { name: "TODAY" }).click();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await page.getByRole("link", { name: "LIBRARY" }).click();
    await waitForLibraryLoaded(page);
    await expect(field).toHaveValue("");
    await expect(page.locator(".workout-row")).toHaveCount(total);
  });
});
