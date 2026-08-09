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

    // Adjust one duration: the warm-up setting defaults OFF for a fresh
    // backdoor user (2026-08-09) and no seeded workout carries a `wu` step
    // any more, so — unlike the old assumption this comment used to make —
    // "Row 1" is no longer guaranteed to have a duration control at all: a
    // workout whose first step is a REPEAT marker renders only its own REPS
    // stepper there. `.first()` over every "Row N duration" group instead
    // of pinning "Row 1": every workout still guarantees at least one work
    // (or standalone rest) step (`validateSteps`), so some duration group
    // always exists somewhere on the page, whichever row number it lands
    // on. Two 30s presses (= exactly 60s = 1 minute) rather than one:
    // round(x + 1 minute) always equals round(x) + 1 for any starting
    // fractional value, so the recount is GUARANTEED to shift by exactly
    // one minute — a single 30s press can, for some starting totals, land
    // on the same rounded minute it started from (e.g. 9.8 -> round 10,
    // +0.5 -> 10.3 -> round 10 again), which would make this assertion
    // flaky against an unpredictable suggested workout.
    const durationGroup = page
      .getByRole("group", { name: /^Row \d+ duration$/ })
      .first();
    const durationRowLabel = (await durationGroup.getAttribute(
      "aria-label",
    ))!.replace(/ duration$/, "");
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

    // Strike one step — reuse the same row the duration nudge just touched
    // (not necessarily Row 1 any more — see above): it's a "w"/"r" row,
    // never the reps marker (which never grows a remove control at all —
    // ConfirmTargets.tsx's own binding decision), so a REMOVE control is
    // guaranteed there, and striking it removes real minutes from the
    // recount, unlike the earlier 30s duration nudge. RESTORE it again
    // right after: some seeded workouts (Sea Fret — a bare `REPEAT x2` over
    // ONE work step) have exactly one non-marker row, so leaving it struck
    // would hand START a session with zero live phases, landing straight
    // on /session/complete instead of the running Timer this test still
    // needs below — found by this test's own first run against exactly
    // that fixture.
    await page
      .getByRole("button", { name: `Remove ${durationRowLabel}` })
      .click();
    await expect(
      page.getByRole("button", { name: `Restore ${durationRowLabel}` }),
    ).toBeVisible();
    const recountAfterStrike = await recount.textContent();
    expect(recountAfterStrike).not.toBe(recountAfterDuration);
    await page
      .getByRole("button", { name: `Restore ${durationRowLabel}` })
      .click();
    await expect(
      page.getByRole("button", { name: `Remove ${durationRowLabel}` }),
    ).toBeVisible();
    const recountAfterRestore = await recount.textContent();
    expect(recountAfterRestore).toBe(recountAfterDuration);

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
    // A fresh run always opens on its own phase 0 regardless of the warm-up
    // setting (OFF here, the default) — "STEP 1 OF" however many, not
    // pinning the total, which varies per workout.
    await expect(page.getByText(/^STEP 1 OF \d+/)).toBeVisible();

    // Reload: the run/draft round-trip through localStorage, not router
    // state — the same proof the old placeholder-era test made, now against
    // the real timer.
    await page.reload();
    await expect(page.locator(".timer-name")).toHaveText(title!);
    await expect(page.getByText(/^STEP 1 OF \d+/)).toBeVisible();
  });
});

// 2026-08-09 warmup-setting spec: the setting's own end-to-end walk,
// against the real stack. Unlike the happy-path test above (which
// deliberately leaves the setting at its OFF default — class (a),
// default-off honesty), warm-up IS the subject here, so it's turned ON
// through the real You screen UI (WarmupRow.tsx), not an API shortcut —
// this walk exists to prove the whole seam, not just the server side of
// it. §4's aria ruling (ConfirmTargets.tsx) says the WARM-UP row is
// preference chrome, not an authored step: it renders first, outside the
// Row-N numbering, with no REMOVE/RESTORE and no DUR/REST stepper of its
// own — and the Timer opens on it as phase 0.
test.describe("the warm-up setting: You sets it, a library session runs it", () => {
  test("a time warm-up with rest set on You appears first in Confirm (outside Row-N) and the Timer opens on it", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "warmup-walk@e2e.test",
      name: "Warmup Walk Tester",
    });
    await setBaselines(page);

    // Set a 5:00 TIME warm-up with a 0:30 trailing rest through the real
    // WarmupRow editor — "500"/"30" into the same masked ClockInput idiom
    // the builder's own duration fields use, rendering "5:00"/"0:30".
    // Scoped by class, not accessible name: whole-branch review finding F's
    // dedup fix means the meta slot no longer restates "WARM-UP · " (the
    // row's title already says "Warm-up"), so the two spans no longer
    // combine into one matchable literal.
    await page.goto("/you");
    await page.locator(".warmup-row-button").click();
    await page.getByLabel("Warm-up duration", { exact: true }).fill("500");
    await page.getByLabel("Warm-up rest after", { exact: true }).fill("30");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".warmup-row-button")).toBeVisible();
    await expect(
      page.locator(".warmup-row-button .you-settings-row-meta"),
    ).toHaveText("5:00 + 0:30 REST");

    // Open any library workout and start it — this walk doesn't pin which
    // one, the same "read whatever's actually there" idiom the suggestion
    // test above uses.
    await page.goto("/library");
    await page.locator(".workout-row").first().click();
    await expect(page.locator("h1.workout-detail-title")).toBeVisible();
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page).toHaveURL(/\/session\/confirm$/);

    // The WARM-UP row: first on the screen, OUTSIDE the Row-N numbering
    // (no REMOVE/RESTORE, no DUR/REST stepper — the rower edits the
    // SETTING on You, not the session it's about to prepend to), and
    // showing exactly the duration/rest just saved.
    const warmupRow = page.locator(".confirm-warmup-row");
    await expect(warmupRow).toBeVisible();
    await expect(warmupRow.locator(".step-editor-header-label")).toHaveText(
      "WARM-UP",
    );
    await expect(
      warmupRow.locator(".step-editor-row", { hasText: "DUR" }),
    ).toContainText("5:00");
    await expect(
      warmupRow.locator(".step-editor-row", { hasText: "REST" }),
    ).toContainText("0:30");
    await expect(warmupRow.getByRole("button")).toHaveCount(0);

    const warmupBox = await warmupRow.boundingBox();
    const row1Box = await page
      .locator(".confirm-steps .step-editor")
      .first()
      .boundingBox();
    expect(warmupBox!.y).toBeLessThan(row1Box!.y);

    // START -> countdown -> SKIP -> the real Timer opens ON the warm-up
    // phase: phase 0 of however many (buildRun's own ordering contract,
    // engine.ts — warm-up first, its rest second, then the workout's own
    // expanded steps).
    await page.getByRole("button", { name: "Looks right, start" }).click();
    await expect(page).toHaveURL(/\/session\/countdown$/);
    await page.getByRole("button", { name: "SKIP ›" }).click();
    await expect(page).toHaveURL(/\/session\/run$/);
    await expect(page.getByText(/^STEP 1 OF \d+ · WARM-UP/)).toBeVisible();
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
