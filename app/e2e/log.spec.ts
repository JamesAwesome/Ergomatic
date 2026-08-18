import { test, expect, type Page } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

// From-the-log spec (2026-08-18), Task 4 (history list) + Task 5 (the
// from-the-log detail view, /today/log/:id). Every test signs in as its
// own unique, session-free email (session.spec.ts's own convention) so a
// re-run against a persisted database never inherits another test's rows.

/** Same in-page-`fetch` idiom as session.spec.ts's own `setBaselines`
 *  (duplicated per that file's own stated precedent: e2e helpers are
 *  copied across files here, not shared). */
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

/** Bulk-imports `text` and waits for the clean-import redirect — copied
 *  from session.spec.ts's own `importBulk` verbatim. */
async function importBulk(page: Page, text: string): Promise<void> {
  await page.goto("/library/import");
  await page.getByLabel("Bulk import text").fill(text);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
}

/** Opens `title`'s detail page from the library list and presses Start,
 *  landing on the countdown — copied from session.spec.ts's own
 *  `startFromLibrary` verbatim. */
async function startFromLibrary(page: Page, title: string): Promise<void> {
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
}

/** SKIP the countdown — copied from session.spec.ts's own
 *  `startAndSkipCountdown` verbatim. */
async function startAndSkipCountdown(page: Page): Promise<void> {
  await expect(page.getByText("GET ON THE HANDLE")).toBeVisible();
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
}

/** POSTs one session log via a real in-page fetch (`page.evaluate`, same
 *  idiom as `today.spec.ts`'s own `neutralizeGlobalRecency`/`logOnce`) —
 *  `workoutId: null` throughout: the row's `workoutTitle`/`workoutType` are
 *  freeform strings the route never cross-checks against a real workout
 *  (validated identically to a workout whose source row was later
 *  deleted), and this suite has no need to author real library rows first.
 *  `advancesPlan: false` so seeding history never perturbs plan state. */
async function postLog(
  page: Page,
  body: {
    workoutTitle: string;
    workoutType: string;
    held?: "held" | "under" | "over" | null;
    pain?: number | null;
    avgSplitSeconds?: number | null;
    distanceMeters?: number | null;
    timeSeconds?: number | null;
  },
): Promise<void> {
  const result = await page.evaluate(async (b) => {
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutId: null,
        held: null,
        pain: null,
        notes: null,
        steps: [{ label: "Work" }],
        advancesPlan: false,
        ...b,
      }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, body);
  if (!result.ok) {
    throw new Error(`postLog failed: ${result.status} ${result.body}`);
  }
}

// Exit criterion 2's own fixture, verbatim: the frozen v0.11.0 body shape
// (no hero keys at all — data.test.ts's own `V0_11_0_LOG_BODY`) posted for
// real, so this suite's null-hero row is the SAME shape a pre-spec-2
// client actually sent, not a hand-simulated null.
async function postV0110Log(page: Page, title: string): Promise<void> {
  const result = await page.evaluate(async (t) => {
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutId: null,
        workoutTitle: t,
        workoutType: "AT",
        held: "held",
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
        advancesPlan: false,
      }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, title);
  if (!result.ok) {
    throw new Error(`postV0110Log failed: ${result.status} ${result.body}`);
  }
}

test("Today's LAST THREE heading is the ALL SESSIONS link, and the history list renders the same row idiom plus the §5G hero snippet", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `log-list-${RUN_ID}@e2e.test`,
    name: "Log List",
  });

  await postV0110Log(page, "Steady State");
  await postLog(page, {
    workoutTitle: "Sea Fret",
    workoutType: "O2",
    held: "held",
    pain: 2,
    avgSplitSeconds: 124.5,
    distanceMeters: 5000,
  });

  await page.goto("/today");
  const heading = page.getByRole("link", { name: "ALL SESSIONS" });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute("href", "/today/log");
  await heading.click();
  await expect(page).toHaveURL(/\/today\/log$/);
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

  const heroRow = page
    .locator(".today-log-row")
    .filter({ hasText: "Sea Fret" });
  await expect(heroRow).toBeVisible();
  await expect(heroRow.locator(".today-log-hero")).toHaveText(
    "AVG 2:04.5 · 5,000 m",
  );

  // Exit criterion 2: a v0.11.0 row (no hero keys posted) renders with its
  // meta line intact and NO hero snippet at all — never a dash, never a
  // recomputed stand-in.
  const oldRow = page
    .locator(".today-log-row")
    .filter({ hasText: "Steady State" });
  await expect(oldRow).toBeVisible();
  await expect(oldRow.locator(".today-log-hero")).toHaveCount(0);
});

test("a fresh account sees the exact empty-state string on /today/log", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `log-empty-${RUN_ID}@e2e.test`,
    name: "Log Empty",
  });
  await page.goto("/today/log");
  await expect(page.getByText("No sessions logged yet.")).toBeVisible();
});

test("each history row opens /today/log/:id, carrying the BackLink's own from state", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `log-row-link-${RUN_ID}@e2e.test`,
    name: "Log Row Link",
  });
  await postLog(page, { workoutTitle: "Sea Fret", workoutType: "O2" });
  await page.goto("/today/log");

  const row = page.locator(".today-log-row").filter({ hasText: "Sea Fret" });
  await expect(row).toHaveAttribute("href", /^\/today\/log\/[^/]+$/);
});

// Spec §4 N2's own witness: scroll deep, open a row, BACK, the offset
// survives — under CPU throttle (the recipe named for this exact class of
// race: PR #84's disconnected-root echo only ever reproduced under load).
test("scroll deep into the history list, TODAY tap clears it, but a BACK return restores the position — under CPU throttle", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `log-scroll-${RUN_ID}@e2e.test`,
    name: "Log Scroll",
  });

  // A short viewport plus enough rows to genuinely overflow it — same
  // reasoning as news.spec.ts's own scroll test (a viewport that happens
  // to fit everything would make this test a no-op on the bug it exists
  // to catch).
  await page.setViewportSize({ width: 390, height: 500 });
  for (let i = 0; i < 20; i++) {
    await postLog(page, {
      workoutTitle: `Session ${i}`,
      workoutType: i % 2 === 0 ? "AT" : "O2",
      held: "held",
      pain: 2,
    });
  }

  // CPU throttle: the same class of timing-dependent race PR #84 named
  // (a passive effect's cleanup scheduled after paint, racing a
  // navigation-triggered scroll clamp) reproduces far more reliably under
  // load than at full desktop speed.
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  await page.goto("/today/log");
  await expect(page.locator(".today-log-row").first()).toBeVisible();

  const lastRow = page.locator(".today-log-row").last();
  await lastRow.scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  const scrolledY = await page.evaluate(() => window.scrollY);

  // Leaves via the LIBRARY tab, not a row and not ← BACK. Two reasons,
  // both real:
  // (1) /today/log/:id (Task 5) is registered now, so a row click no
  //     longer 404s — but this test still deliberately doesn't open one:
  //     proving THIS scroll mechanism only needs SOME real navigation
  //     away and back, and Task 6's own sweep is where the row-open path
  //     itself gets exercised as part of the full N1-N7 witness set (this
  //     test predates that route and was written to prove the list's own
  //     save/restore pair before it existed; reason 2 below is the one
  //     that would still rule out a row click even now).
  // (2) ← BACK sits at the TOP of the screen — Playwright's `.click()`
  //     auto-scrolls its target into view first, which would scroll the
  //     page back to ~0 BEFORE the click even registers, legitimately
  //     erasing the very offset this test means to prove survives (this
  //     was verified directly: an earlier version of this test using
  //     ← BACK reproduced a "saved 0" failure that root-caused to
  //     exactly that auto-scroll, not to any save/restore defect). The
  //     tab bar is `position: fixed` (index.css) — always in the
  //     viewport regardless of scroll position — so tapping it never
  //     disturbs the scroll it's supposed to leave untouched. LIBRARY
  //     (not TODAY) specifically: N7's own clear-on-tap only targets the
  //     TODAY tab, so leaving via LIBRARY is the honest "left without
  //     going through the clearing door" case this same test also needs
  //     below.
  //
  // Deliberately no wait here — same idiom as news.spec.ts/library.spec.ts's
  // own scroll-restoration tests: leaving immediately, inside the ~100ms
  // throttle window, is exactly the case the unmount cleanup's synchronous
  // flush has to cover.
  await page.getByRole("link", { name: "LIBRARY" }).click();
  await expect(page).toHaveURL(/\/library$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/today\/log$/);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(scrolledY - 50);
  const restoredY = await page.evaluate(() => window.scrollY);
  expect(Math.abs(restoredY - scrolledY)).toBeLessThanOrEqual(50);

  // §4 N7: the TODAY tab tap is the fresh-visit door — it clears the
  // saved scroll (`TabBar.tsx`'s `CLEAR_ON_TAB["/today"]`), asserted
  // directly against sessionStorage rather than the eventual `window.
  // scrollY` — the app's minimal scroll-restoration architecture (manual
  // `history.scrollRestoration`, no forced scroll-to-top on a bare
  // mount) never promises WHAT a fresh mount's scrollY settles at, only
  // that it won't be reached by RESTORING the stale saved value (News's
  // own identical restore effect has no `else` branch either — "do
  // nothing" is the whole contract once nothing's saved).
  await page.getByRole("link", { name: "TODAY" }).click();
  await expect(page).toHaveURL(/\/today$/);
  expect(
    await page.evaluate(() => sessionStorage.getItem("ergomatic.logScroll")),
  ).toBeNull();

  await page.getByRole("link", { name: "ALL SESSIONS" }).click();
  await expect(page).toHaveURL(/\/today\/log$/);
  await expect(page.locator(".today-log-row").first()).toBeVisible();
});

// Spec §4 N1's own witness (Task 5 in-task requirement, the
// `e2e/session.spec.ts:900` "hard constraint" idiom replayed here): a REAL
// live (not completed) session for one workout sits in storage while BOTH
// `/today/log` and `/today/log/:id` are visited for a completely different
// row — both localStorage records come out byte-identical (raw string
// equality), not merely "still present." Neither route may fetch-and-
// render with any side effect on session state.
test("N1: a live in-progress session is byte-identical in storage after visiting both /today/log and /today/log/:id", async ({
  page,
}) => {
  const liveTitle = `Log N1 Live Sibling ${RUN_ID}`;
  await signInViaBackdoor(page, {
    email: `log-n1-${RUN_ID}@e2e.test`,
    name: "Log N1",
  });

  // A separate, already-saved row so /today/log/:id has something real to
  // open.
  await postLog(page, {
    workoutTitle: "N1 History Sibling",
    workoutType: "AT",
    held: "held",
    pain: 2,
  });

  // A real live session for a DIFFERENT workout, deliberately never
  // finished — two 30s time phases so the first is still running for the
  // rest of this test.
  await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
  await importBulk(
    page,
    [`${liveTitle} | AN | easy | 1`, "w 0:30 6k", "w 0:30 6k"].join("\n"),
  );
  await startFromLibrary(page, liveTitle);
  await startAndSkipCountdown(page);
  await expect(page.getByText(/^STEP 1 OF 2/)).toBeVisible();

  const draftBefore = await page.evaluate(() =>
    localStorage.getItem("ergomatic.sessionDraft"),
  );
  const runBefore = await page.evaluate(() =>
    localStorage.getItem("ergomatic.sessionRun"),
  );
  expect(draftBefore).not.toBeNull();
  expect(runBefore).not.toBeNull();

  // Visit BOTH routes — the list, then the detail view — without ever
  // touching the live session above.
  await page.goto("/today/log");
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  const row = page
    .locator(".today-log-row")
    .filter({ hasText: "N1 History Sibling" });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/today\/log\/[^/]+$/);
  await expect(
    page.getByRole("heading", { name: "N1 History Sibling" }),
  ).toBeVisible();

  const draftAfter = await page.evaluate(() =>
    localStorage.getItem("ergomatic.sessionDraft"),
  );
  const runAfter = await page.evaluate(() =>
    localStorage.getItem("ergomatic.sessionRun"),
  );
  expect(draftAfter).toBe(draftBefore);
  expect(runAfter).toBe(runBefore);
});

// Spec §7 criterion 3, verbatim: "skip everything at save, open from
// history, answer all four, reload cold, the answers persist; clear one
// via PATCH null, it reads back cleared." Driven through the manual door
// (no timer to run, no baselines needed for an effort-only step) so the
// test stays fast while still exercising a real save → real fetch → real
// PATCH → real cold reload round trip against the compose stack.
test("criterion 3: the PATCH round trip — skip everything at save, open from history, answer all four, reload cold (persists), clear one via the UI (reads back cleared)", async ({
  page,
}) => {
  const title = `Round Trip ${RUN_ID}`;
  await signInViaBackdoor(page, {
    email: `log-roundtrip-${RUN_ID}@e2e.test`,
    name: "Log Round Trip",
  });
  await importBulk(page, [`${title} | AN | easy | 1`, "w 100m max"].join("\n"));

  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("link", { name: "Log it after" }).click();
  await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // Save with everything skipped — no HELD/PAIN/THUMBS/NOTES chosen.
  await page.getByRole("button", { name: "Save without logging" }).click();
  await expect(page).toHaveURL(/\/today$/);

  await page.getByRole("link", { name: "ALL SESSIONS" }).click();
  await expect(page).toHaveURL(/\/today\/log$/);
  const row = page.locator(".today-log-row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/today\/log\/[^/]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // Nothing answered yet — the empty-state affordance, not a read-back
  // block, is what's on screen.
  const addButton = page.getByRole("button", { name: "Add how it felt" });
  await expect(addButton).toBeVisible();
  await addButton.click();

  await page.getByRole("button", { name: "HELD" }).click();
  await page.getByRole("button", { name: "Pain 3" }).click();
  await page.getByRole("button", { name: "↑ MORE LIKE THIS" }).click();
  await page.getByLabel("NOTES").fill("Answered after the fact.");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("HELD · PAIN 3/5 · LIKED")).toBeVisible();
  await expect(page.getByText("Answered after the fact.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();

  // Cold reload — a real navigation, not client state — the answers must
  // come back from the server, not merely survive in memory.
  await page.reload();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("HELD · PAIN 3/5 · LIKED")).toBeVisible();
  await expect(page.getByText("Answered after the fact.")).toBeVisible();

  // Clear ONE field via the UI (HELD, tapping the same selected chip a
  // second time — the clearable-control idiom every reflection control
  // shares) and confirm it reads back cleared while the rest survive.
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "HELD" }).click();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("PAIN 3/5 · LIKED")).toBeVisible();
  await expect(page.getByText("HELD · PAIN 3/5 · LIKED")).not.toBeVisible();
});
