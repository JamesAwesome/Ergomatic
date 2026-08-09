import { test, expect, type Page } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

test.describe("health", () => {
  test("returns ok/db/version JSON", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      ok: boolean;
      db: boolean;
      version: string;
    };
    expect(body.ok).toBe(true);
    expect(body.db).toBe(true);
    expect(typeof body.version).toBe("string");
  });
});

test.describe("sign-in screen", () => {
  test("unauthenticated / shows the sign-in screen", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /continue with google/i }),
    ).toBeVisible();
  });

  test("?denied=x%40y.com shows the invite-refused notice", async ({
    page,
  }) => {
    await page.goto("/?denied=x%40y.com");
    await expect(page.getByRole("alert")).toContainText("x@y.com");
  });
});

test.describe("backdoor sign-in", () => {
  test("signs in, renders the shell + You card, then signs back out", async ({
    page,
  }) => {
    // Built with RUN_ID up front (the helper suffixes any email without
    // one) because the You-card assertion below needs the FINAL address.
    const email = `flows-${RUN_ID}@e2e.test`;
    await signInViaBackdoor(page, {
      email,
      name: "Flows Tester",
    });
    // AppRoutes redirects "/" -> "/today" (Phase 6A Task 2; was "/library"
    // in Phase 5A) — the "Ergomatic" heading only exists on the signed-out
    // SignIn screen (SignIn.tsx), and the account block + sign-out control
    // live on /you (You.tsx), not on the landing route.
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    // `exact: true` (Phase 6I): a never-dismissed START HERE block's own
    // step-1 row ("Row 6k once. That is your baseline.") contains "your",
    // a case-insensitive substring match for "YOU" — without `exact`, a
    // fresh backdoor user (who has never dismissed the block) makes this
    // locator ambiguous once that block has mounted. The nav tab's own
    // literal, all-caps "YOU" is the only exact match.
    await expect(
      page.getByRole("link", { name: "YOU", exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "YOU", exact: true }).click();
    await expect(page.getByText(email)).toBeVisible();

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(
      page.getByRole("link", { name: /continue with google/i }),
    ).toBeVisible();
  });
});

test.describe("unauthenticated api", () => {
  test("/api/workouts 401s without a session", async ({ request }) => {
    const res = await request.get("/api/workouts");
    expect(res.status()).toBe(401);
  });
});

const FLOW_BASELINES = { k2Seconds: 100, k6Seconds: 120 };

/** Sets baselines via an in-page `fetch`, not Playwright's `page.request` —
 *  copied from builder.spec.ts's own `setBaselines`: the api container runs
 *  with NODE_ENV=production, so the session cookie is Set-Cookie'd with
 *  `Secure`, which Playwright's Node-side APIRequestContext doesn't get the
 *  loopback exemption for even though the in-page fetch does. */
async function setBaselines(page: Page): Promise<void> {
  const result = await page.evaluate(async (patch) => {
    const res = await fetch("/api/baselines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, FLOW_BASELINES);
  if (!result.ok) {
    throw new Error(`baseline setup failed: ${result.status} ${result.body}`);
  }
}

/** Raises the freestyle suggestion's time-cap filter to its max (300 min,
 *  data.ts's own ceiling) so a real, non-trivial workout's estimated
 *  duration can never accidentally exclude it from the pool — this spec
 *  doesn't pin which workout gets suggested (see the test's own comment), so
 *  nothing here should be able to make that pool empty. */
async function setGenerousTimeCap(page: Page): Promise<void> {
  const result = await page.evaluate(async () => {
    const res = await fetch("/api/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeCapMinutes: 300 }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  });
  if (!result.ok) {
    throw new Error(`prefs setup failed: ${result.status} ${result.body}`);
  }
}

test.describe("Phase 6A/6B: today -> detail -> confirm -> countdown -> timer", () => {
  // The phase's proof, end to end, against the real compose stack: Today's
  // suggestion -> a workout's detail screen -> Start builds+saves the
  // session draft -> confirm targets (adjust a duration, an SPM, strike a
  // step; the recount reacts each time) -> START stamps startedAt and
  // navigates to the countdown (Phase 6B Task 3 rewired this from the old
  // 6A placeholder route) -> SKIP straight to the real live timer -> a real
  // browser reload proves the run/draft round-tripped through localStorage
  // rather than router state. Design sweeps + screenshots for the timer
  // land in Task 5; this is the flow spec only. The timer's own controls
  // (pause/resume, rewind/advance, END, distance mode) are covered by
  // Timer.test.tsx at the client level — this e2e only proves the real
  // browser stack wires the hand-off correctly.
  test("suggestion through confirm, countdown, and into the real live timer, surviving a reload", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "phase6a-flow@e2e.test",
      name: "Flow Tester",
    });
    await setBaselines(page);
    await setGenerousTimeCap(page);
    await page.goto("/today");

    // Today's freestyle suggestion is deterministic for a fresh user (every
    // seeded workout ties on "never done", so the stable sort falls back to
    // the library's own authored order — server/seed/library/index.ts's
    // `sortOrder`) but which TITLE that resolves to is a seed-data detail
    // this spec has no business pinning. Read whatever the card actually
    // shows and follow it, the way a rower would.
    const card = page.locator(".today-card");
    await expect(card).toBeVisible();
    const title = (
      await card.locator(".today-card-title").textContent()
    )?.trim();
    expect(title).toBeTruthy();

    await card.click();
    await expect(page.getByRole("heading", { name: title! })).toBeVisible();

    // Start (WorkoutDetail.tsx): builds + saves the session draft, then
    // navigates — no longer the Phase 5 disabled stub.
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page).toHaveURL(/\/session\/confirm$/);
    await expect(page.getByRole("heading", { name: title! })).toBeVisible();

    const recount = page.locator(".confirm-recount");
    await expect(recount).toBeVisible();
    const recountAfterLoad = await recount.textContent();

    // Adjust one duration: every workout in the library opens with a warm-up
    // (docs/design comment, builderState.ts), so "Row 1 duration" always
    // exists regardless of which workout got suggested. Two 30s presses (=
    // exactly 60s = 1 minute) rather than one: round(x + 1 minute) always
    // equals round(x) + 1 for any starting fractional value, so the
    // recount is GUARANTEED to shift by exactly one minute — a single 30s
    // press can, for some starting totals, land on the same rounded minute
    // it started from (e.g. 9.8 -> round 10, +0.5 -> 10.3 -> round 10
    // again), which would make this assertion flaky against an
    // unpredictable suggested workout.
    const durationGroup = page.getByRole("group", { name: "Row 1 duration" });
    const durationBefore = await durationGroup
      .locator(".stepper-value")
      .textContent();
    const durationUp = durationGroup.getByRole("button", {
      name: /duration up$/,
    });
    await durationUp.click();
    await durationUp.click();
    await expect(durationGroup.locator(".stepper-value")).not.toHaveText(
      durationBefore ?? "",
    );
    const recountAfterDuration = await recount.textContent();
    expect(recountAfterDuration).not.toBe(recountAfterLoad);

    // Adjust one SPM: every workout has at least one work step
    // (validateSteps requires it), so some "stroke rate" stepper always
    // exists somewhere on the page, but not at a fixed row index — a reps
    // marker ahead of it shifts the row number per workout.
    const spmGroup = page.getByRole("group", { name: /stroke rate$/ }).first();
    const spmBefore = await spmGroup.locator(".stepper-value").textContent();
    await spmGroup.getByRole("button", { name: /stroke rate up$/ }).click();
    await expect(spmGroup.locator(".stepper-value")).not.toHaveText(
      spmBefore ?? "",
    );

    // Strike one step — reuse Row 1 (the warm-up): guaranteed present, and
    // striking it removes real minutes from the recount, unlike the earlier
    // 30s duration nudge.
    await page.getByRole("button", { name: "Remove Row 1" }).click();
    await expect(
      page.getByRole("button", { name: "Restore Row 1" }),
    ).toBeVisible();
    const recountAfterStrike = await recount.textContent();
    expect(recountAfterStrike).not.toBe(recountAfterDuration);

    // START stamps startedAt and navigates to the countdown (Phase 6B Task
    // 3 rewired this: it used to go straight to the 6B placeholder at
    // /session/run — Countdown existed since Task 2 but nothing sent a
    // rower there until this task closed that gap).
    await page.getByRole("button", { name: "START" }).click();
    await expect(page).toHaveURL(/\/session\/countdown$/);
    await expect(page.getByText("GET ON THE HANDLE")).toBeVisible();

    // SKIP straight to the timer — the real Timer (Task 3), not the 6B
    // placeholder it replaced.
    await page.getByRole("button", { name: "SKIP ›" }).click();
    await expect(page).toHaveURL(/\/session\/run$/);
    await expect(page.locator(".timer-name")).toHaveText(title!);
    const endButton = page.getByRole("button", { name: "END →" });
    await expect(endButton).toBeVisible();
    // Fix round (spec review F4): 44×44 is a jsdom-invisible fact — CSS box
    // layout only exists in a real browser, so this is the one place that
    // can actually prove `.timer-end`'s tap target (previously 36px wide,
    // no min-width) is fixed, not just reasoned about from the stylesheet.
    const endBox = await endButton.boundingBox();
    expect(endBox!.width).toBeGreaterThanOrEqual(44);
    expect(endBox!.height).toBeGreaterThanOrEqual(44);
    // Every workout in the library opens with a warm-up (this file's own earlier
    // comment, "Adjust one duration"), so the first phase is always step 1
    // of however many — not pinning the total, which varies per workout.
    await expect(page.getByText(/^STEP 1 OF \d+/)).toBeVisible();

    // Reload: the run/draft round-trip through localStorage, not router
    // state — the same proof the old placeholder-era test made, now against
    // the real timer.
    await page.reload();
    await expect(page.locator(".timer-name")).toHaveText(title!);
    await expect(page.getByText(/^STEP 1 OF \d+/)).toBeVisible();
  });
});

test.describe("bugfix round: history-aware ← BACK", () => {
  // The exact recorded bug (owner's screen recording, 2026-08-02): Today ->
  // a suggestion -> the workout's detail screen -> ← BACK used to always
  // land on /library, because that Link was hardcoded and predates Today
  // being the landing screen. Asserts the TODAY HEADING, not just the URL —
  // a URL-only check would pass even if the heading briefly flashed
  // "Library" during a redirect.
  test("Today -> suggestion -> detail -> BACK returns to Today", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "backnav-flow@e2e.test",
      name: "Back Nav Tester",
    });
    // Phase 6I: this test is about BACK-navigation history, not baseline
    // state — with baselines unset, Today now shows the no-baseline card
    // instead of `.today-card` (the exact behavior this spec's own new
    // describe block down the file proves separately). Setting a real pair
    // keeps this test's actual intent (the suggestion card's own detail ->
    // BACK round trip) exercising the surface it was written against.
    await setBaselines(page);
    await setGenerousTimeCap(page);
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    const card = page.locator(".today-card");
    await expect(card).toBeVisible();
    const title = (
      await card.locator(".today-card-title").textContent()
    )?.trim();
    expect(title).toBeTruthy();

    await card.click();
    await expect(page.getByRole("heading", { name: title! })).toBeVisible();

    await page.getByRole("link", { name: "← BACK" }).click();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page).toHaveURL(/\/today$/);
  });
});
