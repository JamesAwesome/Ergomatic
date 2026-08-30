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
 *  `advancesPlan: false` so seeding history never perturbs plan state.
 *  Returns the created row's `id` — Task 6's own §4 N4/N6 tests need a
 *  real id to deep-link/PATCH against directly, without going through the
 *  history list's own row-click first. */
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
    notes?: string | null;
    steps?: { label: string }[];
    advancesPlan?: boolean;
    // The workout this log LINKS TO. Defaults to null below, which is
    // what every caller in this file used before the plan row started
    // asking what a logged session actually WAS — the identity-seam
    // describe at the end of this file passes real workout ids.
    workoutId?: string | null;
  },
): Promise<{ id: string }> {
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
  return JSON.parse(result.body) as { id: string };
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

/** Activates a preset plan via the real `PUT /api/plan` route — copied
 *  from `today.spec.ts`'s own `choosePlan` (this file's own header states
 *  the duplication precedent for e2e helpers generally). */
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

/** Zeroes `doneN` via `PUT /api/plan {reset:true}` — copied from
 *  `today.spec.ts`'s own `resetPlanProgress`. */
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

// Spec §4's own requirement: "The plan must carry one task that is
// nothing but N1-N7's witnesses ... the witnesses live in one task"
// (§7 exit criterion 1) — this is that task's one describe, gathering
// every burn's witness under a single name rather than scattering N1-N7
// across the file. N1 and N2 below are Tasks 4/5's own witnesses,
// RELOCATED here (not duplicated — their content is unchanged from where
// they landed in those tasks, only their position and this wrapper are
// new); N3-N7 are this task's own new pieces.
test.describe("§4 N1-N7: the navigation-flow burn list's own witnesses", () => {
  // Spec §4 N2's own witness: scroll deep, open a row, BACK, the offset
  // survives — under CPU throttle (the recipe named for this exact class of
  // race: PR #84's disconnected-root echo only ever reproduced under load).
  test("N2: scroll deep into the history list, TODAY tap clears it, but a BACK return restores the position — under CPU throttle", async ({
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
    //
    // Final whole-branch review (2026-08-18), finding IMPORTANT 2: a
    // single immediate read right after the click is racy-green.
    // `HistoryList`'s own unmount-flush cleanup is a passive effect,
    // which React defers until after paint — it can land LATER than this
    // synchronous read, so a read taken BEFORE that flush has had a
    // chance to fire would pass whether or not the flush went on to
    // silently re-save the cleared value a moment later. `expect.poll`
    // keeps re-reading past that window instead of sampling once inside
    // it. Even that only proves the value SETTLES null; the check that
    // actually forces the race to matter is the one below it — a
    // genuinely fresh `HistoryList` mount (via the heading link, exactly
    // like the rower would use it) must not restore the stale offset,
    // which is the one thing a defeated clear can never fake regardless
    // of when its own re-save happened to land.
    await page.getByRole("link", { name: "TODAY" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect
      .poll(() =>
        page.evaluate(() => sessionStorage.getItem("ergomatic.logScroll")),
      )
      .toBeNull();

    await page.getByRole("link", { name: "ALL SESSIONS" }).click();
    await expect(page).toHaveURL(/\/today\/log$/);
    await expect(page.locator(".today-log-row").first()).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThan(scrolledY - 50);
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

  // Spec §4 N3's own witness: the detail view renders as an OVERLAY SCREEN
  // (Reader/Releases' own `.overlay-screen` idiom) with its own scroller,
  // landing at the top on open — the only shape that has ever held real
  // iOS WebKit (the repo's own comments record THREE window-scroll fixes
  // lost to real-device Safari before this mechanism won). **This e2e
  // witness pins the STRUCTURE only** (the class, the container's own
  // scrollTop/scrollHeight relationship, top-on-open) — it cannot pin the
  // WebKit behavior itself: `App.tsx`'s own comment records that
  // Playwright's WebKit build never reproduced the failure this mechanism
  // exists to fix (antagonist B1's own name for this shape: "the e2e green
  // cannot see this bug"). §7 criterion 8 is where the REAL check lives —
  // the phone pass, RUNSHEET's own new item, open a deep-scrolled history,
  // open a session, confirm it lands at top, return, confirm the list
  // position survived. This test proves the harness's own blindness is
  // structural, not a gap in effort.
  test("N3: the from-the-log view is its own overlay scroller, landing at scrollTop 0 on open (harness-blind to the real iOS failure — see criterion 8)", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `log-n3-${RUN_ID}@e2e.test`,
      name: "Log N3",
    });
    // Enough rows to genuinely overflow a short viewport — otherwise
    // scrollHeight === clientHeight and this test can't tell "a real
    // scroller" apart from "an unscrollable div that trivially reads 0
    // either way" (same reasoning news.spec.ts's own round-4 reader test
    // states for its identical assertion).
    const manySteps = Array.from({ length: 40 }, (_, i) => ({
      label: `Work ${i}`,
    }));
    const { id } = await postLog(page, {
      workoutTitle: "N3 Overlay",
      workoutType: "AT",
      steps: manySteps,
    });
    await page.setViewportSize({ width: 390, height: 500 });

    await page.goto(`/today/log/${id}`);
    await expect(
      page.getByRole("heading", { name: "N3 Overlay" }),
    ).toBeVisible();

    const overlay = page.locator(".overlay-screen");
    await expect(overlay).toHaveCount(1);
    const box = await overlay.evaluate((el) => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    // Top-on-open: a fresh DOM node structurally starts at 0 — this is
    // the whole mechanism (§4 N3's own words: "a fresh DOM node
    // structurally starts at 0").
    expect(box.scrollTop).toBe(0);
    // It really is a scroller, not an unscrollable div reading 0 either
    // way.
    expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);

    // The WINDOW never scrolls — the container does. Same distinction
    // news.spec.ts's own round-4 test draws ("the reader is its own
    // scroller now, not the window").
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  // Spec §4 N4's own cold-entry trio: a direct deep link with a cold
  // client cache, an id that 404s, and an unauthenticated hit. All three
  // in one test — each is a genuinely different ENTRY, not three
  // assertions on the same page load, so each gets its own `page.goto`.
  test("N4: cold entry — a fresh deep link renders, a 404'd id shows the not-found state with ← LOG, and an unauthenticated hit gets the standing auth redirect", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `log-n4-${RUN_ID}@e2e.test`,
      name: "Log N4",
    });
    const { id } = await postLog(page, {
      workoutTitle: "N4 Cold Entry",
      workoutType: "O2",
    });

    // (1) Cold deep link: never having visited /today/log first — no
    // client-side navigation warmed anything, just a direct load of the
    // detail route.
    await page.goto(`/today/log/${id}`);
    await expect(
      page.getByRole("heading", { name: "N4 Cold Entry" }),
    ).toBeVisible();

    // (2) A well-formed id that 404s (deleted server-side, or simply
    // never existed) — §5F's friendly not-found, never a rebuild of
    // anything (§4 N1's own adjacent rule).
    await page.goto("/today/log/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("This session is gone.")).toBeVisible();
    const backOut = page.getByRole("link", { name: "← LOG" });
    await expect(backOut).toBeVisible();
    await expect(backOut).toHaveAttribute("href", "/today/log");

    // (3) An unauthenticated hit — the app's standing auth redirect,
    // unchanged (§4 N4: "no route dies in this spec ... the app's
    // standing auth redirect, unchanged"). `App.tsx` renders `<SignIn>`
    // in place of the router entirely whenever `useMe` reads signed-out,
    // regardless of which URL loaded — proven here the same way
    // flows.spec.ts's own "unauthenticated / shows the sign-in screen"
    // test proves it for `/`.
    await page.context().clearCookies();
    await page.goto(`/today/log/${id}`);
    await expect(
      page.getByRole("link", { name: /continue with google/i }),
    ).toBeVisible();
  });

  // Spec §4 N5's own e2e leg: the unit-level label/destination mapping
  // already exists (`FromTheLog.test.tsx`'s own "reads ← LOG/← TODAY/
  // ← PLAN" tests, Task 5) — this proves the SAME mapping through real
  // navigation from all three in-app origins, plus the cold-deep-link
  // fallback, so the shipped `resolveLogBack` map is exercised end to end
  // at least once, not only against a hand-built `location.state`.
  test("N5: the back label names its exact destination across all three in-app origins, plus the cold-deep-link fallback", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `log-n5-${RUN_ID}@e2e.test`,
      name: "Log N5",
    });
    await postLog(page, { workoutTitle: "N5 Origin", workoutType: "AT" });

    // Origin 1: /today/log's own row → ← LOG → /today/log.
    await page.goto("/today/log");
    await page
      .locator(".today-log-row")
      .filter({ hasText: "N5 Origin" })
      .click();
    await expect(page).toHaveURL(/\/today\/log\/[^/]+$/);
    let back = page.getByRole("link", { name: "← LOG" });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", "/today/log");

    // Origin 2: a Today LAST THREE row → ← TODAY → /today.
    await page.goto("/today");
    await page
      .locator(".today-log-row")
      .filter({ hasText: "N5 Origin" })
      .click();
    await expect(page).toHaveURL(/\/today\/log\/[^/]+$/);
    back = page.getByRole("link", { name: "← TODAY" });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", "/today");

    // Origin 3: a done Plan row → ← PLAN → /plan (this task's own Plan.tsx
    // change). `advancesPlan: true` overrides `postLog`'s own
    // seeding-safe default (`false`) so this ONE row genuinely advances
    // the plan, producing a real linked done row to click.
    await page.evaluate(async () => {
      await fetch("/api/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: "sprint" }),
      });
    });
    await postLog(page, {
      workoutTitle: "N5 Plan Origin",
      workoutType: "AT",
      advancesPlan: true,
    });
    await page.goto("/plan");
    const doneRow = page.locator(".plan-row-done").first();
    // `usePlanLinks`' own fetch (Plan.tsx, this task) is async — wait for
    // the row to actually BE the link (not just visible; it renders
    // plain first) before clicking it, or the click can land on a plain
    // `<div>` and never navigate at all (criterion-4's own test hit this
    // exact race first).
    await expect(doneRow).toHaveAttribute("href", /^\/today\/log\/[^/]+$/);
    await doneRow.click();
    await expect(page).toHaveURL(/\/today\/log\/[^/]+$/);
    back = page.getByRole("link", { name: "← PLAN" });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", "/plan");

    // Cold fallback: no `location.state` at all → ← LOG → /today/log,
    // the same label §4 N5 names explicitly for this exact case.
    const { id } = await postLog(page, {
      workoutTitle: "N5 Cold",
      workoutType: "AT",
    });
    await page.goto(`/today/log/${id}`);
    back = page.getByRole("link", { name: "← LOG" });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", "/today/log");
  });

  // Spec §4 N6's two cases: leaving mid-edit discards without a trap, and
  // an in-flight PATCH still lands consistently even when BACK fires
  // before the response returns.
  test("N6: BACK mid-edit discards without a trap, leaving the stored value untouched", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `log-n6a-${RUN_ID}@e2e.test`,
      name: "Log N6a",
    });
    const { id } = await postLog(page, {
      workoutTitle: "N6 Discard",
      workoutType: "AT",
      notes: "Original note.",
    });

    await page.goto("/today/log");
    await page
      .locator(".today-log-row")
      .filter({ hasText: "N6 Discard" })
      .click();
    await expect(page).toHaveURL(/\/today\/log\/[^/]+$/);

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("NOTES").fill("Unsaved edit — never saved.");

    // No confirmation dialog fires — a `dialog` listener that never
    // resolves would hang this test if the house's "no blocking dialogs"
    // rule (§4 N6) were violated, so the test proceeding to complete IS
    // part of the proof; the explicit flag below makes the assertion
    // self-checking regardless of timing.
    let dialogFired = false;
    page.on("dialog", () => {
      dialogFired = true;
    });

    // Edit mode is in-page state, not a route (§4 N6) — BACK pops all
    // the way to wherever this screen's own entry came from, not merely
    // out of edit mode.
    await page.goBack();
    await expect(page).toHaveURL(/\/today\/log$/);
    expect(dialogFired).toBe(false);

    // Discarded: re-opening reads back the ORIGINAL note, never the
    // unsaved text.
    await page
      .locator(".today-log-row")
      .filter({ hasText: "N6 Discard" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/today/log/${id}$`));
    await expect(page.getByText("Original note.")).toBeVisible();
    await expect(
      page.getByText("Unsaved edit — never saved."),
    ).not.toBeVisible();
  });

  test("N6: an in-flight PATCH still lands consistently even when BACK fires before the response returns", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `log-n6b-${RUN_ID}@e2e.test`,
      name: "Log N6b",
    });
    const { id } = await postLog(page, {
      workoutTitle: "N6 In Flight",
      workoutType: "AT",
      notes: "Before the race.",
    });

    // Delay only the PATCH response — GETs (the list, the cold re-fetch
    // below) stay instant, so this doesn't turn the whole test into a
    // slow-network test, only the one write this case exists to race.
    await page.route(`**/api/logs/${id}`, async (route) => {
      if (route.request().method() === "PATCH") {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      await route.continue();
    });

    // Enters via a real row click (not a bare `page.goto`) so there is a
    // genuine `/today/log` history entry for BACK to land on below — a
    // direct `goto` has no such entry and would instead pop to whatever
    // preceded it in this tab's history (the sign-in redirect's `/today`),
    // which is a fact about THIS TEST's own navigation, not about N6.
    await page.goto("/today/log");
    await page
      .locator(".today-log-row")
      .filter({ hasText: "N6 In Flight" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/today/log/${id}$`));
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("NOTES").fill("After the race.");
    await page.getByRole("button", { name: "Save" }).click();

    // BACK fires immediately — well inside the 800ms delay above, before
    // the PATCH's own response has landed in this tab.
    await page.goBack();
    await expect(page).toHaveURL(/\/today\/log$/);

    // The write was never aborted (no AbortController on this door's own
    // `save()` — a genuine fetch-in-flight completes regardless of the
    // component that started it unmounting) — a fresh, COLD re-fetch of
    // the same row confirms the server-side value landed correctly, not
    // half-written or lost. In-page `fetch`, not `page.request` — this
    // file's own `setBaselines`-family comment states why: the api
    // container's session cookie is Set-Cookie'd `Secure`
    // (NODE_ENV=production), which Playwright's Node-side
    // APIRequestContext doesn't get the loopback exemption for even
    // though an in-page `fetch` does (`page.request` 401s here, silently
    // reading back an undefined `notes` off the error body — caught by
    // this exact test on the first run).
    await expect
      .poll(async () => {
        return page.evaluate(async (logId) => {
          const res = await fetch(`/api/logs/${logId}`);
          const row = (await res.json()) as { notes: string | null };
          return row.notes;
        }, id);
      })
      .toBe("After the race.");
  });

  // Spec §4 N7: TODAY stays lit on both routes (the tab convention is
  // URL-prefix-based — §4 N7's own words), and a tab tap pops to Today's
  // root, clearing the saved scroll (the N2 test above already proves the
  // clearing half end to end; this test's own job is the "lit on both
  // routes" half N2 never asserted).
  test("N7: the TODAY tab stays lit on both /today/log and /today/log/:id", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `log-n7-${RUN_ID}@e2e.test`,
      name: "Log N7",
    });
    const { id } = await postLog(page, {
      workoutTitle: "N7 Tab Lit",
      workoutType: "AT",
    });

    await page.goto("/today/log");
    let todayTab = page.getByRole("link", { name: "TODAY" });
    await expect(todayTab).toHaveClass(/tab-active/);
    await expect(todayTab).toHaveAttribute("aria-current", "page");

    await page.goto(`/today/log/${id}`);
    todayTab = page.getByRole("link", { name: "TODAY" });
    await expect(todayTab).toHaveClass(/tab-active/);
    await expect(todayTab).toHaveAttribute("aria-current", "page");
  });
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

// Spec §7 criterion 4, verbatim: "advance a plan by saving, the done row
// opens the exact log that advanced it; Reset the plan, the footer on
// that log still reads the original linkage." Driven through the real
// manual-door "Log against plan" button (not `postLog`'s raw fetch) so
// this is a genuine save → plan-advance → Plan-tap → footer round trip
// through the shipped UI, not a simulation of one.
test("criterion 4: advance a plan by saving via Log against plan, the done row opens the exact log that advanced it, and Reset leaves that log's own footer unchanged", async ({
  page,
}) => {
  const title = `Criterion 4 ${RUN_ID}`;
  await signInViaBackdoor(page, {
    email: `log-criterion4-${RUN_ID}@e2e.test`,
    name: "Log Criterion 4",
  });
  await choosePlan(page, "sprint");
  await importBulk(page, [`${title} | AN | easy | 1`, "w 100m max"].join("\n"));

  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("link", { name: "Log it after" }).click();
  await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // "Log against plan" — NOT "Save without logging" (criterion 3's own
  // button): this is the save that DOES advance `doneN`.
  await page.getByRole("button", { name: /Log against plan/ }).click();
  await expect(page).toHaveURL(/\/today$/);

  // Plan's own done-row link (this task's own Plan.tsx change) makes the
  // newly-advanced row tappable — capture its id from the real anchor
  // `href`, not from any client state, so the assertion below opens
  // whatever the SERVER actually resolved as newest-wins for index 0.
  await page.goto("/plan");
  const doneRow = page.locator(".plan-row-done").first();
  // `usePlanLinks`' own fetch (Plan.tsx, this task) is async — the row
  // renders PLAIN first (no `href` yet) and only becomes the link once
  // that fetch resolves, so this polls via `toHaveAttribute` (which
  // retries) rather than a one-shot `getAttribute` right after
  // `toBeVisible()` — a bare visibility check passes on either render,
  // long before the link exists, and reading `href` at that moment reads
  // null (caught live: the first version of this test raced exactly
  // this window).
  await expect(doneRow).toHaveAttribute("href", /^\/today\/log\/[^/]+$/);
  const href = await doneRow.getAttribute("href");
  const id = href!.split("/").pop()!;

  await doneRow.click();
  await expect(page).toHaveURL(new RegExp(`/today/log/${id}$`));
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const expectedFooter = "Logged to Sprint (2k) Prep · SESSION 1 OF 84";
  await expect(page.locator(".log-plan-footer")).toHaveText(expectedFooter);

  // Reset: doneN zeroes, the row that WAS done reverts to today/upcoming
  // and stops linking entirely (spec §2: "Reset does not null them" — the
  // COLUMNS are untouched, only the live sequence's status changes). The
  // log itself, reopened directly by the id already captured above, still
  // carries its ORIGINAL linkage — the exact footer text, unchanged.
  await resetPlanProgress(page);
  await page.goto(`/today/log/${id}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator(".log-plan-footer")).toHaveText(expectedFooter);
});

// Log-delete spec (2026-08-18), §5 criterion 3, leg (a) verbatim: "save
// through the shipped Log-against-plan button, open the log from Plan's
// checkmark, delete via the staged confirm, assert the checkmark un-ticks
// and the slot reads as today's session." Same id-from-href oracle as
// criterion 4's own test above (capture whatever the server actually
// resolved for index 0, never a client-guessed id).
test("§5.3 leg (a) terminal: deleting the log that advanced the plan un-ticks the checkmark, and that slot reads as today's session", async ({
  page,
}) => {
  const title = `Delete Leg A ${RUN_ID}`;
  await signInViaBackdoor(page, {
    email: `log-delete-leg-a-${RUN_ID}@e2e.test`,
    name: "Delete Leg A",
  });
  await choosePlan(page, "sprint");
  await resetPlanProgress(page);
  await importBulk(page, [`${title} | AN | easy | 1`, "w 100m max"].join("\n"));

  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("link", { name: "Log it after" }).click();
  await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // "Log against plan" — the shipped save that DOES advance doneN.
  await page.getByRole("button", { name: /Log against plan/ }).click();
  await expect(page).toHaveURL(/\/today$/);

  await page.goto("/plan");
  await expect(page.locator(".plan-active-header .mono-status")).toHaveText(
    "SESSION 2 OF 84",
  );
  const doneRow = page.locator(".plan-row-done").first();
  await expect(doneRow).toHaveAttribute("href", /^\/today\/log\/[^/]+$/);
  const href = await doneRow.getAttribute("href");
  const id = href!.split("/").pop()!;

  await doneRow.click();
  await expect(page).toHaveURL(new RegExp(`/today/log/${id}$`));
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator(".log-plan-footer")).toHaveText(
    "Logged to Sprint (2k) Prep · SESSION 1 OF 84",
  );

  // Delete via the staged confirm — §1's LINKED copy fires (this row's
  // own plan_key is non-null).
  await page.getByRole("button", { name: "Delete session" }).click();
  const confirmPanel = page.locator(".log-delete-confirm");
  await expect(confirmPanel).toBeVisible();
  await expect(confirmPanel).toContainText(
    "This removes the session and its reflection. If it is your latest plan session, the checkmark un-ticks.",
  );
  await confirmPanel.getByRole("button", { name: "Delete session" }).click();

  // Origin-faithful navigation: this row was opened via Plan's own link
  // (`state.from = "/plan"`), so the delete lands back there — the SAME
  // `resolveLogBack` map N5's own test proves against every other origin.
  await expect(page).toHaveURL(/\/plan$/);

  // The checkmark un-ticks: doneN reverts to 0, index 0 is TODAY's slot
  // again — not done, not upcoming.
  await expect(page.locator(".plan-active-header .mono-status")).toHaveText(
    "SESSION 1 OF 84",
  );
  await expect(page.locator(".plan-row-done")).toHaveCount(0);
  const todayRow = page.locator(".plan-row-today").first();
  await expect(todayRow).toHaveAttribute("aria-current", "step");

  // The stale deep link, direct-loaded post-delete: the existing 5F
  // not-found state (§1's own "already shipped, no new work" line).
  await page.goto(`/today/log/${id}`);
  await expect(page.getByText("This session is gone.")).toBeVisible();
});

// Log-delete spec (2026-08-18), §5 criterion 3, leg (b) verbatim: "three
// saves (one pre-Reset at index 0, one post-Reset at index 0, one at
// index 1), delete the MIDDLE one (newest holder of index 0, non-
// terminal): tick stays, counter unchanged, the index-0 checkmark now
// opens the pre-Reset log." Three distinct titles so the assertion at
// the end can tell the pre-Reset log's own content apart from the
// deleted post-Reset one, not merely a byte-equal id.
test("§5.3 leg (b) re-point: deleting the middle (newest, non-terminal) holder of index 0 leaves the tick and counter alone, and re-points index 0's checkmark to the pre-Reset log", async ({
  page,
}) => {
  const titlePreReset = `Delete Leg B Pre-Reset ${RUN_ID}`;
  const titlePostReset = `Delete Leg B Post-Reset ${RUN_ID}`;
  const titleIndex1 = `Delete Leg B Index1 ${RUN_ID}`;
  await signInViaBackdoor(page, {
    email: `log-delete-leg-b-${RUN_ID}@e2e.test`,
    name: "Delete Leg B",
  });
  await choosePlan(page, "sprint");
  await resetPlanProgress(page);

  async function logAgainstPlan(title: string): Promise<void> {
    await importBulk(
      page,
      [`${title} | AN | easy | 1`, "w 100m max"].join("\n"),
    );
    await page.locator(".workout-row").filter({ hasText: title }).click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
    await page.getByRole("link", { name: "Log it after" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("button", { name: /Log against plan/ }).click();
    await expect(page).toHaveURL(/\/today$/);
  }

  async function capturePlanRowId(nth: number): Promise<string> {
    await page.goto("/plan");
    const row = page.locator(".plan-row-done").nth(nth);
    await expect(row).toHaveAttribute("href", /^\/today\/log\/[^/]+$/);
    const rowHref = await row.getAttribute("href");
    return rowHref!.split("/").pop()!;
  }

  // Save #1 — pre-Reset, index 0.
  await logAgainstPlan(titlePreReset);
  const idPreReset = await capturePlanRowId(0);

  // Reset zeroes doneN — index 0 is up for grabs again, the old row's
  // own `plan_key`/`plan_index` untouched (spec §2's "linkage is
  // history" rule).
  await resetPlanProgress(page);

  // Save #2 — post-Reset, index 0. This is the newest-wins holder of
  // index 0 (spec 2's own resolution rule), the one this test deletes.
  await logAgainstPlan(titlePostReset);
  const idPostReset = await capturePlanRowId(0);
  expect(idPostReset).not.toBe(idPreReset);

  // Save #3 — index 1, the terminal session (doneN advances 1 -> 2).
  await logAgainstPlan(titleIndex1);

  await page.goto("/plan");
  await expect(page.locator(".plan-active-header .mono-status")).toHaveText(
    "SESSION 3 OF 84",
  );
  await expect(page.locator(".plan-row-done")).toHaveCount(2);

  // Delete the MIDDLE save, deep-linked directly by its captured id —
  // non-terminal (index 1 is doneN - 1, not index 0), so §2 condition 2
  // never holds for this row.
  await page.goto(`/today/log/${idPostReset}`);
  await expect(
    page.getByRole("heading", { name: titlePostReset }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete session" }).click();
  const confirmPanel = page.locator(".log-delete-confirm");
  await expect(confirmPanel).toBeVisible();
  await confirmPanel.getByRole("button", { name: "Delete session" }).click();

  // No `state.from` on this deep-linked entry — the cold fallback (§4
  // N5's own rule) lands back on /today/log, never /plan.
  await expect(page).toHaveURL(/\/today\/log$/);

  // The tick stays, the counter is unchanged: idPostReset was never the
  // terminal holder, so `unCounted` is false and doneN is still 2.
  await page.goto("/plan");
  await expect(page.locator(".plan-active-header .mono-status")).toHaveText(
    "SESSION 3 OF 84",
  );
  await expect(page.locator(".plan-row-done")).toHaveCount(2);

  // Index 0's checkmark now re-points to the PRE-RESET log — the next-
  // newest survivor at that index — asserted by the captured id, so a
  // false pass off a stale title match is impossible.
  const row0 = page.locator(".plan-row-done").nth(0);
  await expect(row0).toHaveAttribute("href", `/today/log/${idPreReset}`);
  await row0.click();
  await expect(page).toHaveURL(new RegExp(`/today/log/${idPreReset}$`));
  await expect(
    page.getByRole("heading", { name: titlePreReset }),
  ).toBeVisible();
});

// The identity seam, end to end (re-review of 1b2e80f5). Every other gate
// on the checkpoint check enters the pipe partway along: the store
// contracts stop at `listPlanLinks`, and `Plan.test.tsx` starts after it
// by mocking the hook. Nothing crossed POST -> a REAL workout row -> the
// plan-links response -> the hook -> the rendered row, and that is the
// seam the feature is built on — recurring failure 24's shape, and the
// shape that let this PR's own two P1s ship. One test, both directions,
// driven entirely through the real API and the real screen.
test.describe("the plan checkpoint's identity seam (POST -> join -> hook -> row)", () => {
  /** Creates a PERSONAL workout through the real route and returns its
   *  id. Titles are not unique or reserved, so this is a supported row
   *  that happens to share the prescribed test's name. */
  async function createPersonalWorkout(
    page: Page,
    title: string,
    type: string,
  ): Promise<string> {
    const result = await page.evaluate(
      async (w) => {
        const res = await fetch("/api/workouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: w.title,
            type: w.type,
            difficulty: "hard",
            pain: 5,
            steps: [
              {
                k: "w",
                duration: { kind: "distance", meters: 2000 },
                ref: { effort: "max" },
              },
            ],
          }),
        });
        return { ok: res.ok, status: res.status, body: await res.text() };
      },
      { title, type },
    );
    if (!result.ok) {
      throw new Error(`workout create failed: ${result.status} ${result.body}`);
    }
    return (JSON.parse(result.body) as { id: string }).id;
  }

  /** Waits until the plan-links fetch has actually landed on the
   *  checkpoint row.
   *
   *  Without this, a "no mark" assertion is a FALSE GREEN: before
   *  `usePlanLinks` resolves, an upcoming checkpoint row already renders
   *  the prescribed title as its name and carries zero swap marks, so
   *  `name === "2K Test"` and `markCount === 0` are both true of a screen
   *  that has not yet learned anything about the log. Proved by holding
   *  `GET /api/logs?plan=sprint` (re-review of dd95d335). Becoming an
   *  `<a>` with an href is the one signal that only a RESOLVED, matched
   *  link can produce.
   */
  async function awaitCheckpointLinked(page: Page) {
    const row = page.locator(".plan-row").nth(6);
    await expect(row).toHaveAttribute("href", /\/today\/log\/.+/);
    return row;
  }

  /** The sprint plan's first checkpoint is session 7 (index 6), so six
   *  advancing saves land the next one exactly on it. */
  async function advanceToFirstCheckpoint(page: Page): Promise<void> {
    for (let i = 0; i < 6; i += 1) {
      await postLog(page, {
        workoutTitle: `Filler ${i}`,
        workoutType: "O2",
        advancesPlan: true,
      });
    }
  }

  test("a PERSONAL workout sharing the prescribed title is marked; the real global one is not", async ({
    page,
  }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `plan-identity-${testInfo.parallelIndex}@e2e.test`,
      name: "Plan Identity Tester",
    });
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);

    // The rower's OWN "2K Test", authored as an AN so neither title nor
    // type can tell it apart from the prescribed one. Only provenance
    // can.
    const personalId = await createPersonalWorkout(page, "2K Test", "AN");
    await advanceToFirstCheckpoint(page);
    await postLog(page, {
      workoutTitle: "2K Test",
      workoutType: "AN",
      workoutId: personalId,
      advancesPlan: true,
    });

    await page.goto("/plan");
    const checkpointRow = await awaitCheckpointLinked(page);
    await expect(checkpointRow.locator(".plan-row-name")).toHaveText("2K Test");
    await expect(checkpointRow.locator(".plan-row-swap")).toHaveText(
      "INSTEAD OF 2K Test",
    );

    // Now the real thing. A Reset puts session 1 back at index 0, so the
    // same six-filler walk lands the next save on the checkpoint again —
    // this time linked to the GLOBAL row the plan actually prescribes,
    // resolved by title through the library the app itself serves.
    await resetPlanProgress(page);
    const globalId = await page.evaluate(async () => {
      const res = await fetch("/api/workouts");
      const list = (await res.json()) as {
        id: string;
        title: string;
        isGlobal: boolean;
      }[];
      return list.find((w) => w.title === "2K Test" && w.isGlobal)!.id;
    });
    expect(globalId).not.toBe(personalId);

    await advanceToFirstCheckpoint(page);
    await postLog(page, {
      workoutTitle: "2K Test",
      workoutType: "AN",
      workoutId: globalId,
      advancesPlan: true,
    });

    await page.goto("/plan");
    // The link has to exist BEFORE "no mark" means anything — see
    // `awaitCheckpointLinked`.
    const doneCheckpoint = await awaitCheckpointLinked(page);
    await expect(doneCheckpoint.locator(".plan-row-name")).toHaveText(
      "2K Test",
    );
    await expect(doneCheckpoint.locator(".plan-row-swap")).toHaveCount(0);
  });

  // The reviewer's own falsifier, and the case that separates "identity"
  // from "provenance": a log LINKED to the global 6K Test while claiming
  // a "2K Test" snapshot. The route resolves `workoutId` only to check
  // ownership and then trusts the submitted title, so this is postable —
  // and both rows here are global, so a provenance-only check cannot tell
  // them apart. Only reading the LINKED row's own title can.
  test("a checkpoint linked to the OTHER global test is marked, whatever its snapshot title claims", async ({
    page,
  }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `plan-identity-cross-${testInfo.parallelIndex}@e2e.test`,
      name: "Plan Identity Cross Tester",
    });
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);

    const sixK = await page.evaluate(async () => {
      const res = await fetch("/api/workouts");
      const list = (await res.json()) as {
        id: string;
        title: string;
        isGlobal: boolean;
      }[];
      return list.find((w) => w.title === "6K Test" && w.isGlobal)!.id;
    });

    await advanceToFirstCheckpoint(page);
    await postLog(page, {
      // What the request claims...
      workoutTitle: "2K Test",
      workoutType: "AN",
      // ...and what it actually links to.
      workoutId: sixK,
      advancesPlan: true,
    });

    await page.goto("/plan");
    const row = await awaitCheckpointLinked(page);
    // The row still DISPLAYS the snapshot — what a rower is shown they
    // did never changes — but the mark is decided by the link.
    await expect(row.locator(".plan-row-name")).toHaveText("2K Test");
    await expect(row.locator(".plan-row-swap")).toHaveText(
      "INSTEAD OF 2K Test",
    );
  });
});
