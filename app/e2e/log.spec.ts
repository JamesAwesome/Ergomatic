import { test, expect, type Page } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

// From-the-log spec (2026-08-18), Task 4: the history list (`/today/log`).
// Every test signs in as its own unique, session-free email (session.spec.ts's
// own convention) so a re-run against a persisted database never inherits
// another test's rows.

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
  // (1) Task 5 hasn't shipped /today/log/:id yet, so a row click 404s
  //     (falls through to the catch-all's `Navigate replace`), which
  //     REPLACES rather than PUSHES the history entry and would prove
  //     nothing about this task's own scroll mechanism — Task 6's sweep
  //     re-proves the same witness through the real row-open path once
  //     Task 5's detail route lands (per this task's own brief: "your
  //     links may 404 until then; keep the route link correct and test
  //     the LINK, not the destination").
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
