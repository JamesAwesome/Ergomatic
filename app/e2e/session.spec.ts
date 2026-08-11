import { test, expect, type Page } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

// Phase 6B Task 4's own proof: a tiny bulk-imported workout driven all the
// way through completion (flows.spec.ts's own Phase 6A/6B describe block
// deliberately stops short of completion — "the timer's own controls...
// are covered by Timer.test.tsx at the client level"; this file is what
// actually reaches SessionComplete against the real compose stack), plus
// the reload-resilience and landscape assertions the phase's brief calls
// for. Every test signs in as its own unique, workout-free email (same
// convention as builder.spec.ts) and deletes its own workout again via
// `cleanupByTitle` so a re-run against a dirty database doesn't accumulate
// stale rows.

/** Same in-page-`fetch` idiom as flows.spec.ts/builder.spec.ts's own
 *  `setBaselines`: the api container's session cookie is Set-Cookie'd
 *  `Secure` (NODE_ENV=production), which Playwright's Node-side
 *  APIRequestContext doesn't get the loopback exemption for even though an
 *  in-page `fetch` does. Takes the baselines as an argument (unlike the
 *  other files' fixed constants) because this file's own distance-phase
 *  test deliberately tunes k2Seconds to land the phase's estimate in a
 *  timing-friendly window — see that test's own comment. */
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

/** Copied from builder.spec.ts's own `cleanupByTitle` — duplicated rather
 *  than shared across e2e files, this repo's own established precedent
 *  (design.spec.ts's identical copy says so explicitly). */
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

/** Activates a preset plan via the real `PUT /api/plan` route — the same
 *  in-page-fetch idiom as `setBaselines` above. Copied from design.spec.ts's
 *  own `choosePlan` (duplicated per this file's own stated precedent on
 *  `cleanupByTitle`, above) — Task 2's own e2e extension is the first thing
 *  in THIS file that needs a plan active, to prove the plan's session
 *  counter advances on save. */
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

/** Zeroes `doneN` unconditionally via `PUT /api/plan {reset:true}` — copied
 *  from design.spec.ts's own `resetPlanProgress` (same duplication
 *  precedent as `cleanupByTitle` above). Needed alongside `choosePlan`: a
 *  per-worker email reused across CI runs (this file's own convention)
 *  would otherwise start from whatever `doneN` a PRIOR run against the same
 *  email left behind, since `choosePlan` only resets `doneN` when it
 *  actually CHANGES the plan key (server/routes/data.ts: "re-selecting the
 *  SAME plan must be a no-op") — a real bug this test tripped over the
 *  first time it was run twice in a row locally. */
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

/** Bulk-imports `text` (domain/bulk.ts's own grammar — BulkImport.tsx's own
 *  GRAMMAR_HELP) and waits for the clean-import redirect back to /library
 *  (BulkImportRoute's `onImported` in AppRoutes.tsx). */
async function importBulk(page: Page, text: string): Promise<void> {
  await page.goto("/library/import");
  await page.getByLabel("Bulk import text").fill(text);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
}

/** Opens `title`'s detail page from the library list and presses Start,
 *  landing directly on the countdown (fast-follow Task 4: ConfirmTargets is
 *  deleted, Start is the one door now) — the same click sequence
 *  builder.spec.ts's own bulk-import tests use to get from a fresh import
 *  to the workout's own detail screen. */
async function startFromLibrary(page: Page, title: string): Promise<void> {
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
}

/** SKIP the countdown — the same handoff flows.spec.ts's own Phase 6A/6B
 *  test already proves against a real seeded workout; reused here verbatim
 *  for this file's own tiny bulk-imported fixtures. */
async function startAndSkipCountdown(page: Page): Promise<void> {
  await expect(page.getByText("GET ON THE HANDLE")).toBeVisible();
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
}

/** The house time format (`domain/duration.ts`'s own `fmtDuration`) parsed
 *  back to whole seconds — mm:ss is the only shape this file's own short
 *  fixtures ever produce, so the hour group is never present. */
function clockToSeconds(text: string | null): number {
  if (text === null) throw new Error("expected a timer value, got null");
  return text
    .split(":")
    .map(Number)
    .reduce((acc, n) => acc * 60 + n, 0);
}

/** Phase 6C Task 4: the exact label Today's own LAST THREE row renders for
 *  "right now" — `Today.tsx`'s (and `logDraft.ts`'s) own private
 *  `formatLogDate`/`MONTH_ABBREV` pair, duplicated here rather than
 *  imported (an e2e file can't import a client module; same "tiny local
 *  copy" precedent `cleanupByTitle`'s own comment in this file already
 *  states). Computed INSIDE the browser context, not in Node: the real
 *  `formatLogDate` parses the server's `loggedAt` ISO string via `new
 *  Date(iso)`, which resolves the month/day in the BROWSER's own local
 *  timezone — asserting from a Node-side `Date` would risk a host/container
 *  timezone mismatch this file has never otherwise had to care about. */
async function todayDateLabel(page: Page): Promise<string> {
  return page.evaluate(() => {
    const MONTH_ABBREV = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];
    const d = new Date();
    return `${MONTH_ABBREV[d.getMonth()]} ${d.getDate()}`;
  });
}

test.describe("Phase 6B Task 4: session completion + resilience", () => {
  test("tiny bulk-imported workout: time phase auto-advances, distance phase counts up, the last-phase finish stage completes the run, and Today keeps the completed-but-unlogged draft", async ({
    page,
  }) => {
    const title = "Tiny E2E Session";
    await signInViaBackdoor(page, {
      email: "session-complete@e2e.test",
      name: "Session Complete Tester",
    });
    // k2Seconds: 60 — the server's own PUT /api/baselines floor
    // (server/routes/data.ts's MIN_SPLIT_SECONDS; anything under 60 400s)
    // — is chosen deliberately, not copied from another file's fixed
    // constant: it prices the 100m distance phase's own estimate
    // (domain/expand.ts's phaseSeconds: (100/500)*60 = 12s) into a window
    // this test can safely land NEXT inside without tripping Timer.tsx's
    // own isSuspectActual two-sided check (suspect below 6s or above 24s)
    // — waiting ~12s after the phase starts lands comfortably centered, not
    // timing-sensitive at either edge, so the LAST-phase FINISH stage (not
    // the suspect one) is what this test actually exercises.
    await setBaselines(page, { k2Seconds: 60, k6Seconds: 120 });
    await importBulk(
      page,
      [`${title} | AN | easy | 1`, "w 0:03 6k", "w 100m max"].join("\n"),
    );

    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);

    // Phase 1: 3s time-based work. Real wait for the engine's own 1s
    // repaint interval to auto-advance it — the phase's own brief calls
    // for this real wait rather than seeding the run mid-phase.
    await expect(page.getByText(/^STEP 1 OF 2/)).toBeVisible();
    await expect(page.getByText("STEP 2 OF 2 · WORK · 100M")).toBeVisible({
      timeout: 6000,
    });

    // Distance phase: the stopwatch counts UP (elapsedSeconds, not a
    // countdown) — read the numeral twice, 2s apart, and require it to
    // have actually changed.
    const beforeCount = await page.locator(".timer-time").textContent();
    await page.waitForTimeout(2000);
    const afterCount = await page.locator(".timer-time").textContent();
    expect(afterCount).not.toBe(beforeCount);

    // Land inside the non-suspect window before pressing NEXT (see the
    // baseline comment above) — ~10.5s total elapsed on a 12s estimate is
    // safely between the 6s/24s suspect bounds, with margin on both sides
    // for the click itself.
    await page.waitForTimeout(8500);
    await page.getByRole("button", { name: "NEXT →" }).click();

    // This is the LAST phase — NEXT always stages a finish confirm here
    // (Timer.tsx's own handleDistanceNext), never a bare advance.
    await expect(page.getByText("Finish this session?")).toBeVisible();
    await page.getByRole("button", { name: "Finish session" }).click();

    await expect(page).toHaveURL(/\/session\/complete$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.locator(".complete-total-label")).toHaveText("TOTAL");
    await expect(page.locator(".complete-total-value")).toBeVisible();
    // A real recorded split (SessionComplete's own `fmtSplit` format,
    // m:ss.t), not a placeholder — the "never a bare dash" house rule.
    const split = await page.locator(".complete-actual-value").textContent();
    expect(split).toMatch(/^\d+:\d{2}\.\d$/);

    // Completed-run protection (Today.tsx's amended stale-discard rule):
    // backdate the draft's own `createdAt` so it LOOKS stale by the
    // existing 24h rule, then navigate to Today and prove it survives —
    // a freshly-completed draft is never stale in the first place, so
    // skipping this backdate would pass vacuously without ever exercising
    // the amendment. `ergomatic.sessionDraft` is draft.ts's own DRAFT_KEY,
    // spelled out literally since an e2e file can't import a client module.
    await page.evaluate(() => {
      const raw = localStorage.getItem("ergomatic.sessionDraft");
      if (raw === null) {
        throw new Error("expected a session draft to still be in storage");
      }
      const draft = JSON.parse(raw) as { createdAt: string };
      draft.createdAt = new Date(
        Date.now() - 25 * 60 * 60 * 1000,
      ).toISOString();
      localStorage.setItem("ergomatic.sessionDraft", JSON.stringify(draft));
    });

    await page.getByRole("button", { name: "Back to Today" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    const draftAfterToday = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionDraft"),
    );
    expect(draftAfterToday).not.toBeNull();

    await cleanupByTitle(page, title);
  });

  test("page.reload() mid-time-phase preserves the remaining time within ±2s", async ({
    page,
  }) => {
    const title = "Reload Mid Phase";
    await signInViaBackdoor(page, {
      email: "session-reload-time@e2e.test",
      name: "Reload Time Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    // A single 60s time-based step — long enough that neither the wait
    // below nor the reload's own real-world overhead risks landing on the
    // auto-advance boundary.
    await importBulk(
      page,
      [`${title} | AN | easy | 1`, "w 1:00 6k"].join("\n"),
    );

    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();

    await page.waitForTimeout(10_000);
    const before = clockToSeconds(
      await page.locator(".timer-time").textContent(),
    );

    await page.reload();
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();
    const after = clockToSeconds(
      await page.locator(".timer-time").textContent(),
    );

    // Remaining only ever counts DOWN — reload can't have gained time back —
    // and the reload's own real-world cost (a fresh page load against the
    // compose stack) is the only thing that should separate the two reads.
    expect(after).toBeLessThanOrEqual(before);
    expect(before - after).toBeLessThanOrEqual(2);

    await cleanupByTitle(page, title);
  });

  test("page.reload() while paused keeps the run paused", async ({ page }) => {
    // Deliberately NOT "…Paused…" — Playwright's own `getByText` does a
    // substring, case-insensitive match by default, and a title containing
    // "Paused" would make `getByText("PAUSED")` below resolve to BOTH
    // `.timer-name` and `.timer-state` (a strict-mode violation this test
    // actually tripped over first).
    const title = "Reload Suspend Fixture";
    await signInViaBackdoor(page, {
      email: "session-reload-paused@e2e.test",
      name: "Reload Paused Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    await importBulk(
      page,
      [`${title} | AN | easy | 1`, "w 1:00 6k"].join("\n"),
    );

    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();

    await page.getByRole("button", { name: "Pause" }).click();
    // `.timer-state` directly, not a generic getByText, for the same
    // reason the title above was renamed — targeted class selector rather
    // than relying on no OTHER text on the page ever containing "PAUSED".
    await expect(page.locator(".timer-state")).toHaveText("PAUSED");
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
    const frozen = await page.locator(".timer-time").textContent();

    // Real wall-clock time actually needs to pass here — a reload racing
    // straight through in under a second would pass even with a broken
    // pause (the elapsed-since-phaseStartedAt math only misbehaves once
    // real time has elapsed to misbehave ON).
    await page.waitForTimeout(3000);
    await page.reload();
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();
    await expect(page.locator(".timer-state")).toHaveText("PAUSED");
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
    // Fix round (whole-branch review, F1): this used to only check "still
    // paused," which the running-phase test next to it already proves
    // isn't a coincidence — a paused phase's elapsed time must be
    // IDENTICAL after a reload, not merely close (engine.ts's own contract:
    // `pausedAt`, not `now`, is elapsed's right edge while paused — the
    // whole reason `phaseElapsedMs` freezes is so THIS is exact, not
    // approximate). The ±2s tolerance belongs to the running-phase test
    // only, where real time elapsing during the reload is expected to move
    // the number; here it must not move at all.
    await expect(page.locator(".timer-time")).toHaveText(frozen ?? "");

    await cleanupByTitle(page, title);
  });

  test("landscape viewport renders the handoff's two-column timer layout", async ({
    page,
  }) => {
    const title = "Landscape Layout";
    await signInViaBackdoor(page, {
      email: "session-landscape@e2e.test",
      name: "Landscape Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    // Two steps, not one: the landscape-only "then …" UP NEXT line
    // (Timer.tsx's `thenNextText`) is null with nothing after the very next
    // phase, so a single-step workout would never render it.
    await importBulk(
      page,
      [`${title} | AN | easy | 1`, "w 1:00 6k", "w 0:30 6k"].join("\n"),
    );

    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 2/)).toBeVisible();

    // The handoff's own landscape swap size (docs/design/README.md).
    await page.setViewportSize({ width: 844, height: 420 });

    const header = page.locator(".timer-header");
    const dots = page.locator(".timer-dots");
    const phaseBlock = page.locator(".timer-phase");
    const totalBlock = page.locator(".timer-total");
    const cards = page.locator(".timer-cards");
    const controls = page.locator(".timer-controls");
    const upnext = page.locator(".timer-upnext");
    await expect(header).toBeVisible();
    await expect(cards).toBeVisible();

    const headerBox = (await header.boundingBox())!;
    const dotsBox = (await dots.boundingBox())!;
    const cardsBox = (await cards.boundingBox())!;
    const upnextBox = (await upnext.boundingBox())!;
    const phaseBox = (await phaseBlock.boundingBox())!;
    const totalBox = (await totalBlock.boundingBox())!;
    const controlsBox = (await controls.boundingBox())!;

    // Left column (phase/time/bar, TOTAL LEFT+ruler, controls) sits
    // strictly left of the right column (name/END, dots, cards, UP NEXT) —
    // the handoff §6's own split, proven by real CSS box geometry (a
    // jsdom-invisible fact, the same reasoning flows.spec.ts's own
    // `.timer-end` hit-target check already established for this file's
    // sibling).
    for (const rightBox of [headerBox, dotsBox, cardsBox, upnextBox]) {
      expect(rightBox.x).toBeGreaterThan(phaseBox.x);
      expect(rightBox.x).toBeGreaterThan(totalBox.x);
      expect(rightBox.x).toBeGreaterThan(controlsBox.x);
    }

    // The landscape-only "then …" UP NEXT second line is showing now.
    await expect(page.locator(".timer-upnext-then")).toBeVisible();
    await expect(page.locator(".timer-upnext-then")).toContainText("then");

    // 128px numeral (handoff §6's own landscape figure; 96px portrait).
    const fontSize = await page
      .locator(".timer-time")
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(fontSize).toBe("128px");

    // Fix round (whole-branch review, F3): the 844×420 frame used to carry
    // 18px of dead vertical scroll (`.timer-screen`'s own min-height
    // formula never accounted for `.app-shell`'s hidden-tab-bar padding —
    // see index.css's own comment on this media query). A real
    // scrollHeight-vs-clientHeight check, not a bounding-box one, is what
    // actually proves the frame fits with nothing to scroll.
    const overflow = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
    expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight);

    await cleanupByTitle(page, title);
  });

  // Task 3 (ui-fix round): SessionComplete's own new Discard without
  // logging — clears the run/draft records with no POST, lands on Today
  // with neither an unlogged line NOR an advanced plan counter (only a
  // real logged session advances `doneN`, via POST /api/logs — this never
  // fires one).
  test("SessionComplete's Discard without logging clears the records and never posts a log — Today shows no unlogged line and the plan counter is unchanged", async ({
    page,
  }) => {
    const title = "Tiny E2E Complete Discard";
    await signInViaBackdoor(page, {
      email: "session-complete-discard@e2e.test",
      name: "Session Complete Discard Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);
    await importBulk(
      page,
      [`${title} | AT | medium | 3`, "w 0:03 6k"].join("\n"),
    );

    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page).toHaveURL(/\/session\/complete$/, { timeout: 6000 });

    // Staged — the first press only arms the L4 button, nothing clears yet.
    await page.getByRole("button", { name: "Discard without logging" }).click();
    const runMidStage = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(runMidStage).not.toBeNull();

    await page.getByRole("button", { name: "Tap again to discard" }).click();
    await expect(page).toHaveURL(/\/today$/);

    const runAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(runAfter).toBeNull();
    const draftAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionDraft"),
    );
    expect(draftAfter).toBeNull();

    // No unlogged line — there's no completed-but-unlogged run left to show.
    await expect(page.getByText(/unlogged session/i)).toHaveCount(0);
    // The plan's own session counter never moved — discarding is not
    // logging, so `doneN` was never touched.
    await expect(page.locator(".today-plan-line")).toContainText(
      "SESSION 1 OF 84",
    );
    // LAST THREE never shows this workout — discarding never POSTs a log.
    await expect(
      page.locator(".today-log-row").filter({ hasText: title }),
    ).toHaveCount(0);

    await cleanupByTitle(page, title);
  });
});

test.describe("Phase 6C Task 2: the Log screen — the session door", () => {
  // F3 (whole-branch review, Task 2 fix round): each test used to call
  // `cleanupByTitle` only at the END of its own body — a test that failed
  // (or was interrupted) partway through never reached it, leaking its
  // workout into the next run against the SAME persisted dev/CI database.
  // A proper `test.afterEach` (design.spec.ts's own idiom for every one of
  // its describe blocks) runs regardless of pass/fail. `title` moves to
  // describe scope, set at the top of each test, so this one hook covers
  // both.
  let title = "";

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("the full loop: Today → detail → countdown → tiny timer session → complete → Log → Held + pain + notes → Save → Today shows it in LAST THREE and the plan's session counter advanced", async ({
    page,
  }) => {
    title = "Tiny E2E Log Session";
    await signInViaBackdoor(page, {
      email: "session-log@e2e.test",
      name: "Session Log Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);
    // A single short time step — the last (and only) phase auto-advances
    // straight to /session/complete with no NEXT/finish-stage click needed
    // (same "single time phase auto-advances straight to completion" fact
    // the whole-branch-review F1 describe block below relies on).
    await importBulk(
      page,
      [`${title} | AT | medium | 3`, "w 0:03 6k"].join("\n"),
    );

    await page.goto("/today");
    await expect(page.getByText(/^SESSION 1 OF 84/)).toBeVisible();

    // startFromLibrary's own `.workout-row` click assumes /library is
    // already the current page (true right after importBulk, not after the
    // /today detour above).
    await page.goto("/library");
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();
    await expect(page).toHaveURL(/\/session\/complete$/, { timeout: 6000 });
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    await page.getByRole("link", { name: "Log this session" }).click();
    await expect(page).toHaveURL(/\/session\/log$/);
    await expect(
      page.getByRole("heading", { name: `Log ${title}` }),
    ).toBeVisible();
    // The dashed PACES LOCKED panel and the per-step list both render real
    // content (the "never a bare dash" house rule) — this workout's one
    // step references "6k" plainly (off 0), so the 6K half resolves.
    await expect(page.locator(".log-paces-value")).toContainText("6K 2:00.0");
    await expect(page.locator(".log-step-row")).toHaveCount(1);

    await page.getByRole("button", { name: "HELD" }).click();
    // Pain 3, not 2 (Phase 6C Task 4's own brief) — deliberately mid-scale,
    // distinct from every other pain figure this file's design/screenshot
    // siblings already pin (2), so this assertion can't pass by coincidence
    // if the wrong picker cell were wired.
    await page.getByRole("button", { name: "Pain 3" }).click();
    await page.getByLabel("NOTES").fill("Felt strong.");
    await page.getByRole("button", { name: "Save session" }).click();

    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    // The plan's session counter advanced BY EXACTLY ONE (server-side
    // done_n, bumped by stores/logs.ts's own `create` — Task 1.5's own
    // report on this) — asserted both before (SESSION 1 OF 84, above) and
    // after this save, the exact "before and after" pairing Phase 6C
    // Task 4's brief calls for.
    await expect(page.getByText(/^SESSION 2 OF 84/)).toBeVisible();
    // LAST THREE shows the just-logged session for real. `.first()`: a
    // log row is never deleted by `cleanupByTitle` (that only removes the
    // WORKOUT — `session_logs.workout_id` goes NULL on delete, per
    // WorkoutDetail.tsx's own comment on that FK behavior, and each log
    // keeps its own frozen title/type regardless), so a re-run against a
    // persisted (not freshly reset) database can find more than one row
    // with this exact title — `.first()` asserts against the just-created
    // one (LAST THREE's own newest-first order) without strict-mode
    // failing on the older one(s).
    const row = page
      .locator(".today-log-row")
      .filter({ hasText: title })
      .first();
    await expect(row).toBeVisible();
    // Today's date, not merely "some date" — Phase 6C Task 4's own brief:
    // the LAST THREE row this loop produces reads as having happened today.
    await expect(row).toContainText(await todayDateLabel(page));
    await expect(row).toContainText("HELD");
    await expect(row).toContainText("3/5");

    // Both session records cleared — nothing left to accidentally resurface
    // the Log screen or Today's resume/unlogged treatment on a later visit.
    const runAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(runAfter).toBeNull();
    const draftAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionDraft"),
    );
    expect(draftAfter).toBeNull();
  });

  test("discard without logging clears both records and never posts a log", async ({
    page,
  }) => {
    title = "Tiny E2E Discard Session";
    await signInViaBackdoor(page, {
      email: "session-log-discard@e2e.test",
      name: "Session Log Discard Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    await importBulk(
      page,
      [`${title} | AT | medium | 3`, "w 0:03 6k"].join("\n"),
    );

    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page).toHaveURL(/\/session\/complete$/, { timeout: 6000 });
    await page.getByRole("link", { name: "Log this session" }).click();
    await expect(page).toHaveURL(/\/session\/log$/);

    // Staged — the first press only arms the L4 button in place (same
    // in-place idiom as WorkoutDetail's Delete workout), nothing clears yet.
    await page.getByRole("button", { name: "Discard without logging" }).click();
    const runMidStage = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(runMidStage).not.toBeNull();

    await page.getByRole("button", { name: "Tap again to discard" }).click();
    await expect(page).toHaveURL(/\/today$/);

    const runAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(runAfter).toBeNull();
    const draftAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionDraft"),
    );
    expect(draftAfter).toBeNull();
    // LAST THREE never shows this workout — discarding never POSTs a log.
    // (Unlike the full-loop test's own row assertion above, `toHaveCount(0)`
    // needs no `.first()` — asserting ABSENCE is unaffected by how many
    // duplicate rows a re-run might otherwise accumulate, since discarding
    // is specifically what must never create even one.)
    await expect(
      page.locator(".today-log-row").filter({ hasText: title }),
    ).toHaveCount(0);
  });
});

test.describe("Phase 6C Task 3: the manual door", () => {
  // Two of these tests each create TWO workouts (a live sibling plus the
  // one actually logged), so cleanup tracks a list rather than the single
  // `title` variable Task 2's own describe block above uses.
  let titles: string[] = [];

  test.afterEach(async ({ page }) => {
    for (const t of titles) {
      await cleanupByTitle(page, t);
    }
    titles = [];
  });

  test("the full loop: Library → detail → Log it after → Held + pain + notes → Save → Today shows it in LAST THREE, with no draft/run record ever created", async ({
    page,
  }) => {
    const title = "Tiny E2E Manual Log";
    titles.push(title);
    await signInViaBackdoor(page, {
      email: "manual-log@e2e.test",
      name: "Manual Log Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    await importBulk(
      page,
      [`${title} | AT | medium | 3`, "w 1:00 6k"].join("\n"),
    );

    await page.locator(".workout-row").filter({ hasText: title }).click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
    const logItAfter = page.getByRole("link", { name: "Log it after" });
    await expect(logItAfter).toBeVisible();
    await logItAfter.click();

    await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);
    await expect(
      page.getByRole("heading", { name: `Log ${title}` }),
    ).toBeVisible();
    // No Discard button on this door at all — nothing to discard (the task
    // brief's own words), unlike the session door's own staged confirm.
    await expect(page.getByRole("button", { name: /discard/i })).toHaveCount(0);
    // Real content, never a bare dash: this workout's one step references
    // "6k" plainly (off 0), and it's the only step in the list.
    await expect(page.locator(".log-paces-value")).toContainText("6K 2:00.0");
    await expect(page.locator(".log-step-row")).toHaveCount(1);

    await page.getByRole("button", { name: "HELD" }).click();
    await page.getByRole("button", { name: "Pain 2" }).click();
    await page
      .getByLabel("NOTES")
      .fill("Rowed at the gym, logging it after the fact.");
    await page.getByRole("button", { name: "Save session" }).click();

    await expect(page).toHaveURL(/\/today$/);
    const row = page
      .locator(".today-log-row")
      .filter({ hasText: title })
      .first();
    await expect(row).toBeVisible();
    // Phase 6C Task 4: today's date, the same assertion the session door's
    // own full-loop test above pins — an off-app row logged through the
    // manual door reads as having happened today too, not the workout's own
    // (irrelevant) creation date.
    await expect(row).toContainText(await todayDateLabel(page));
    await expect(row).toContainText("HELD");
    await expect(row).toContainText("2/5");

    // This door never reads OR writes either record — both stay absent the
    // whole way through, not merely "cleared at the end" (there was nothing
    // to clear in the first place).
    const runAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(runAfter).toBeNull();
    const draftAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionDraft"),
    );
    expect(draftAfter).toBeNull();
  });

  // THE hard constraint (task brief's own words): "must NOT touch the
  // draft/run records — an in-progress session elsewhere survives logging
  // an off-app row." A REAL live (not completed) session for one workout
  // sits in storage while a completely different workout is logged
  // manually — both localStorage records come out byte-identical (raw
  // string equality), not merely "still present."
  test("the hard constraint: a live in-progress session elsewhere is byte-identical in storage after logging an off-app row", async ({
    page,
  }) => {
    const liveTitle = "Manual Door Live Sibling";
    const manualTitle = "Manual Door Off-App Row";
    titles.push(liveTitle, manualTitle);
    await signInViaBackdoor(page, {
      email: "manual-log-constraint@e2e.test",
      name: "Manual Log Constraint Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    // Two 30s time phases — long enough that the first is still running
    // (not auto-advanced) for the whole rest of this test, which never
    // returns to /session/run to let its own 1s tick interval keep ticking.
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

    // A completely separate workout, logged manually while the live one
    // above sits untouched in the same storage.
    await importBulk(
      page,
      [`${manualTitle} | AT | medium | 3`, "w 1:00 6k"].join("\n"),
    );
    await page.locator(".workout-row").filter({ hasText: manualTitle }).click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(
      manualTitle,
    );
    await page.getByRole("link", { name: "Log it after" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);

    await page.getByRole("button", { name: "HELD" }).click();
    await page.getByRole("button", { name: "Pain 3" }).click();
    await page.getByRole("button", { name: "Save session" }).click();
    await expect(page).toHaveURL(/\/today$/);

    const draftAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionDraft"),
    );
    const runAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(draftAfter).toBe(draftBefore);
    expect(runAfter).toBe(runBefore);
  });

  test("Log it after is absent (replaced by the no-target/Set baselines idiom) when baselines are unset", async ({
    page,
  }) => {
    const title = "Manual Door No Baselines";
    titles.push(title);
    // A brand-new account — deliberately no `setBaselines` call.
    await signInViaBackdoor(page, {
      email: "manual-log-no-baselines@e2e.test",
      name: "Manual Log No Baselines Tester",
    });
    await importBulk(
      page,
      [`${title} | AT | medium | 3`, "w 1:00 6k"].join("\n"),
    );
    await page.locator(".workout-row").filter({ hasText: title }).click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

    await expect(page.getByRole("link", { name: "Log it after" })).toHaveCount(
      0,
    );
    await expect(page.getByText("no target").last()).toBeVisible();
  });

  // Today enhancements (Task 4): the outside-plan toggle's manual-door half
  // — the session-door half of the SAME toggle already gets driven, in its
  // default (untouched) state, by e2e/today.spec.ts's own type-swap loop
  // test. This is the one e2e proof that actually TOGGLES it and confirms
  // the plan's counter really does stay put.
  test("the plan toggle: Log it after -> toggle OUTSIDE THE PLAN -> Save -> Today's counter is unchanged, LAST THREE shows the row", async ({
    page,
  }) => {
    const title = "Tiny E2E Outside Plan";
    titles.push(title);
    await signInViaBackdoor(page, {
      email: "manual-log-outside-plan@e2e.test",
      name: "Manual Log Outside Plan Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);
    await importBulk(
      page,
      [`${title} | AT | medium | 3`, "w 1:00 6k"].join("\n"),
    );

    await page.goto("/today");
    await expect(page.getByText(/^SESSION 1 OF 84/)).toBeVisible();

    await page.goto("/library");
    await page.locator(".workout-row").filter({ hasText: title }).click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
    await page.getByRole("link", { name: "Log it after" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);

    const toggle = page.getByRole("button", { name: /COUNTS TOWARD PLAN/ });
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText("SESSION 1 OF 84");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    const toggledOff = page.getByRole("button", {
      name: "OUTSIDE THE PLAN · won't advance",
    });
    await expect(toggledOff).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "HELD" }).click();
    await page.getByRole("button", { name: "Pain 2" }).click();
    await page.getByRole("button", { name: "Save session" }).click();

    await expect(page).toHaveURL(/\/today$/);
    // Unchanged — exactly what advancesPlan:false is for.
    await expect(page.getByText(/^SESSION 1 OF 84/)).toBeVisible();
    const row = page
      .locator(".today-log-row")
      .filter({ hasText: title })
      .first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("HELD");
    await expect(row).toContainText("2/5");
  });
});

test.describe("whole-branch review F1: browser BACK must never rebuild/wipe a progressed or completed run", () => {
  // Before this fix round: Countdown.tsx rebuilt + saved a fresh SessionRun
  // unconditionally on every mount, and both SKIP (Countdown.tsx) and
  // Timer's own past-the-last-phase hand-off pushed their next route rather
  // than replacing it — leaving the countdown screen (or a since-finished
  // Timer) reachable via the browser's own BACK button, which re-mounted
  // whichever screen and silently destroyed real progress/actuals, or a
  // completed-but-unlogged record 6C still needs. The fix: `replace` on
  // both those navigations, plus a mount guard in Countdown.tsx
  // (`hasRunProgress`) that redirects straight back to the live timer
  // instead of rebuilding whenever the existing run already shows real
  // progress. These two tests drive the real browser's own history stack
  // (`page.goBack()`), not a simulated one.
  //
  // Fast-follow Task 4 shortened the history stack: Start now pushes
  // straight from the workout's own detail page to `/session/countdown`
  // (no ConfirmTargets hop in between), and SKIP still REPLACES that entry
  // with `/session/run`. One BACK from a live session therefore lands on
  // the detail page itself now, not on a screen that bounces back to the
  // timer — `hasRunProgress`'s own guard still exists (Countdown.tsx) and
  // still protects a DEEPER back-walk or a stale deep link, but a single
  // BACK from `/session/run` no longer passes through Countdown at all.
  // The property this describe block actually cares about — nothing
  // silently destroyed — still holds: the run record sits untouched (the
  // detail page's own Start button, pressed again, must stage the
  // "in-progress" replace-confirm rather than overwrite it).

  test("BACK mid-session (after real progress) lands on the workout's own detail page and never resets the run", async ({
    page,
  }) => {
    const title = "Back Mid Session";
    await signInViaBackdoor(page, {
      email: "session-back-mid@e2e.test",
      name: "Back Mid Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    // Two short time phases — real time only has to pass once (the first
    // phase's own 3s), not per assertion.
    await importBulk(
      page,
      [`${title} | AN | easy | 1`, "w 0:03 6k", "w 0:03 6k"].join("\n"),
    );

    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 2/)).toBeVisible();

    // Real progress: the engine's own 1s repaint interval auto-advances
    // past phase 1 (a plain time phase, no click needed) — `index` is now
    // 1, the exact condition `hasRunProgress` treats as real progress.
    await expect(page.getByText(/^STEP 2 OF 2/)).toBeVisible({
      timeout: 6000,
    });
    const runBefore = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(JSON.parse(runBefore ?? "null").index).toBe(1);

    await page.goBack();

    // Never the countdown screen — the whole point of the fix.
    await expect(page.getByText("GET ON THE HANDLE")).not.toBeVisible();
    // Lands on the workout's own detail page (the entry Start pushed from,
    // one hop away now that ConfirmTargets no longer sits in between) —
    // the run record itself is simply untouched, not "recovered" by a
    // redirect.
    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    const runAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(JSON.parse(runAfter ?? "null").index).toBe(1);
    expect(JSON.parse(runAfter ?? "null").startedAt).toBe(
      JSON.parse(runBefore ?? "null").startedAt,
    );

    // The actual safety property: a second Start press from here must not
    // silently overwrite the progressed run — WorkoutDetail's own
    // `useStartWorkout` guard stages the same "in-progress" replace-confirm
    // any other stale-draft Start press gets, never a bare rebuild.
    await page.getByRole("button", { name: "Start" }).click();
    await expect(
      page.getByText("A session is in progress. Replace it?"),
    ).toBeVisible();
    const runStillAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(runStillAfter).toBe(runAfter);

    await cleanupByTitle(page, title);
  });

  // Fix round 1 (M-1): this test used to drive two real `page.goBack()`
  // presses and check neither resurrected the countdown. Fast-follow Task 4
  // shortened the history stack (Start pushes straight from the workout's
  // own detail page to `/session/countdown`, no ConfirmTargets hop in
  // between), so a real back-walk from Session Complete now reaches the
  // detail page in ONE hop and never passes through Countdown at all — see
  // the "BACK mid-session" test above for that proof. A `page.goBack()`
  // repeat of the old shape would therefore assert something true but
  // vacuous here (Countdown never mounts, so of course it never rebuilds
  // anything). The property this describe block actually exists to pin —
  // `hasRunProgress` never lets a completed run be silently rebuilt — still
  // has one real way in: a stale deep link or bookmark landing directly on
  // `/session/countdown`. Drives that instead: Countdown's own guard bounces
  // it to `/session/run`, and Timer's own already-complete check immediately
  // bounces THAT to `/session/complete` — completedAt must survive both
  // hops byte-identical, not get wiped by an accidental rebuild in between.
  test("a stale deep link to /session/countdown after completion never rebuilds or wipes the completed run", async ({
    page,
  }) => {
    const title = "Deep Link After Complete";
    await signInViaBackdoor(page, {
      email: "session-deep-link-complete@e2e.test",
      name: "Deep Link Complete Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    await importBulk(
      page,
      [`${title} | AN | easy | 1`, "w 0:03 6k"].join("\n"),
    );

    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible({
      timeout: 6000,
    });
    // The single time phase auto-advances straight to completion.
    await expect(page).toHaveURL(/\/session\/complete$/, { timeout: 6000 });

    const completedAtBefore = await page.evaluate(() => {
      const raw = localStorage.getItem("ergomatic.sessionRun");
      return raw === null
        ? null
        : (JSON.parse(raw) as { completedAt: string | null }).completedAt;
    });
    expect(completedAtBefore).not.toBeNull();

    await page.goto("/session/countdown");

    // Both bounces land: Countdown -> /session/run -> /session/complete —
    // never stalled mid-chain, never resurrecting "GET ON THE HANDLE".
    await expect(page).toHaveURL(/\/session\/complete$/);
    await expect(page.getByText("GET ON THE HANDLE")).not.toBeVisible();
    const completedAtAfter = await page.evaluate(() => {
      const raw = localStorage.getItem("ergomatic.sessionRun");
      return raw === null
        ? null
        : (JSON.parse(raw) as { completedAt: string | null }).completedAt;
    });
    expect(completedAtAfter).toBe(completedAtBefore);

    await cleanupByTitle(page, title);
  });
});

test.describe("Phase 7B Task 2: Start over a connected session's record (the F5 walk, reversed)", () => {
  // `startSession` now cross-clears `MONITOR_RUN_KEY` as well as
  // `RUN_KEY` — the mirror of `createMonitorRun` clearing the phone-side
  // record, and 7A's own documented obligation. That clear is only safe
  // because `handleStart`'s guard was WIDENED to read the monitor record
  // in the same commit: without it, a rower who finished a PM5-driven
  // session and hadn't logged it yet would lose it (7C's whole prefill
  // input) to one unwarned press. These tests drive the real browser
  // against the real screen; `ergomatic.monitorRun` is monitorRun.ts's own
  // MONITOR_RUN_KEY, spelled out literally since an e2e file can't import
  // a client module.
  //
  // The record is SEEDED rather than produced by a real connected session:
  // no Connect affordance exists until Task 5, and there is no PM5 (or
  // Bluetooth radio) in CI at all. The shape below is exactly what
  // `isMonitorRun` validates and `createMonitorRun` writes.
  async function seedMonitorRun(
    page: Page,
    completedAt: string | null,
  ): Promise<void> {
    await page.evaluate((completed) => {
      localStorage.setItem(
        "ergomatic.monitorRun",
        JSON.stringify({
          v: 1,
          workoutId: "seeded-connected",
          title: "Connected Session",
          program: { intervals: [] },
          actuals: [],
          deviceName: "PM5 430123456",
          startedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
          completedAt: completed,
          terminated: false,
        }),
      );
    }, completedAt);
  }

  async function monitorRunRaw(page: Page): Promise<string | null> {
    return page.evaluate(() => localStorage.getItem("ergomatic.monitorRun"));
  }

  /** Opens the first library row's detail screen. Any workout will do —
   *  the guard is about what's in storage, not which workout is starting. */
  async function openFirstWorkout(page: Page): Promise<void> {
    await page.goto("/library");
    await page.locator(".workout-row").first().click();
    await expect(page.locator("h1.workout-detail-title")).toBeVisible();
  }

  test("a finished-but-unlogged monitor run: Start stages the warning, Cancel preserves it byte-identical", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "session-monitor-unlogged@e2e.test",
      name: "Monitor Unlogged Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    await seedMonitorRun(page, new Date().toISOString());
    const before = await monitorRunRaw(page);
    expect(before).not.toBeNull();

    await openFirstWorkout(page);
    await page.getByRole("button", { name: "Start" }).click();

    // Warned, not walked past — and still on the detail screen.
    await expect(
      page.getByText(
        "You have an unlogged session. Starting a new one discards it.",
      ),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    expect(await monitorRunRaw(page)).toBe(before);

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
    // Byte-identical after the round trip, not merely still present.
    expect(await monitorRunRaw(page)).toBe(before);
  });

  test("Replace session clears the connected record and proceeds to the countdown", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "session-monitor-replace@e2e.test",
      name: "Monitor Replace Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    await seedMonitorRun(page, new Date().toISOString());

    await openFirstWorkout(page);
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("button", { name: "Replace session" }).click();

    await expect(page).toHaveURL(/\/session\/countdown$/);
    // The reverse cross-clear, through the real browser's own storage.
    expect(await monitorRunRaw(page)).toBeNull();
  });

  test("a LIVE monitor run (the erg is mid-piece) stages the 'in progress' sentence instead", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "session-monitor-live@e2e.test",
      name: "Monitor Live Tester",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    await seedMonitorRun(page, null);
    const before = await monitorRunRaw(page);

    await openFirstWorkout(page);
    await page.getByRole("button", { name: "Start" }).click();

    await expect(
      page.getByText("A session is in progress. Replace it?"),
    ).toBeVisible();
    await expect(
      page.getByText(
        "You have an unlogged session. Starting a new one discards it.",
      ),
    ).toHaveCount(0);
    expect(await monitorRunRaw(page)).toBe(before);
  });
});

test.describe("Phase 7B Task 5: Connect over a real (not seeded) unlogged session — the F5 door's own e2e", () => {
  // `ConnectAction` (Task 2) shipped unmounted with no reachable e2e —
  // "mounting it here owns its end-to-end proof" (Task 5's own inherited
  // obligation). Unlike the Task 2 describe block above (which seeds a
  // `MonitorRun` by raw JSON, since no Connect affordance existed to
  // produce one), the `SessionRun` this guard protects is driven through a
  // REAL completed phone session.
  //
  // A SINGLE 100m distance work step, not this file's own `"w 0:03 6k"`
  // one-liner (the "whole-branch review F1" describe block's own fixture):
  // that 3s TIME phase is exactly what `compileProgram` exists to refuse
  // (`interval-too-short` — the PM5's documented 20s time-interval floor,
  // `domain/monitor/program.ts`'s `MIN_TIME_SECONDS`), which the SECOND
  // test below needs to compile cleanly to ever reach "Connect anyway" at
  // all. 100m is the PM5's own distance floor (`MIN_DISTANCE_METERS`) —
  // met exactly, not padded — and doubles as this file's OWN proven
  // distance-phase fixture (`k2Seconds: 60` prices the 100m estimate at
  // ~12s, same reasoning as the "Tiny E2E Session" test above), so the
  // same NEXT -> "Finish this session?" -> Finish session walk that test
  // already proves against the real compose stack completes it without a
  // real per-phase wait for a TIME phase to elapse.
  async function finishATinySession(page: Page, title: string): Promise<void> {
    await setBaselines(page, { k2Seconds: 60, k6Seconds: 120 });
    await importBulk(
      page,
      [`${title} | AN | easy | 1`, "w 100m max"].join("\n"),
    );
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    // Same non-suspect window as "Tiny E2E Session" above (Timer.tsx's
    // `isSuspectActual`: suspect below 6s or above 24s against a 12s
    // estimate) — ~8.5s lands centered with margin either side.
    await page.waitForTimeout(8500);
    await page.getByRole("button", { name: "NEXT →" }).click();
    await expect(page.getByText("Finish this session?")).toBeVisible();
    await page.getByRole("button", { name: "Finish session" }).click();
    await expect(page).toHaveURL(/\/session\/complete$/);
  }

  async function reopenDetail(page: Page, title: string): Promise<void> {
    await page.goto("/library");
    await page.locator(".workout-row").filter({ hasText: title }).click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  }

  async function sessionRunRaw(page: Page): Promise<string | null> {
    return page.evaluate(() => localStorage.getItem("ergomatic.sessionRun"));
  }

  async function monitorRunRaw(page: Page): Promise<string | null> {
    return page.evaluate(() => localStorage.getItem("ergomatic.monitorRun"));
  }

  test("Connect over a real finished-but-unlogged session stages the confirm; Cancel preserves it byte-identical", async ({
    page,
  }) => {
    const title = "Connect Guard Cancel";
    await signInViaBackdoor(page, {
      email: "connect-guard-cancel@e2e.test",
      name: "Connect Guard Cancel Tester",
    });
    await finishATinySession(page, title);
    await reopenDetail(page, title);
    const before = await sessionRunRaw(page);
    expect(before).not.toBeNull();

    // `exact: true` on every "Connect" query below: Playwright's default
    // name match is a substring, and "Connect anyway" (the staged panel's
    // own primary) contains "Connect" — without `exact` the plain trigger
    // and the staged confirm's button are indistinguishable to this query.
    await page.getByRole("button", { name: "Connect", exact: true }).click();

    await expect(
      page.getByText("You have an unlogged session. Connecting discards it."),
    ).toBeVisible();
    // Not walked past — the Connect trigger itself is gone, the panel
    // replaced it, and NOTHING has been written to the monitor side yet.
    await expect(
      page.getByRole("button", { name: "Connect", exact: true }),
    ).toHaveCount(0);
    expect(await monitorRunRaw(page)).toBeNull();

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(
      page.getByRole("button", { name: "Connect", exact: true }),
    ).toBeVisible();
    // Byte-identical after the round trip, not merely still present.
    expect(await sessionRunRaw(page)).toBe(before);

    await cleanupByTitle(page, title);
  });

  // "Connect anyway proceeds" is deliberately NOT driven further than this
  // in Playwright. Tried first, and reverted: this environment's real
  // Chromium (unlike jsdom, which has no `navigator.bluetooth` at all) DOES
  // expose the Web Bluetooth API, so the real `useMonitorSession`'s default
  // transport genuinely calls `navigator.bluetooth.requestDevice(...)` —
  // which, with no adapter and no user gesture able to dismiss a chooser
  // that headless Chromium cannot render, HANGS rather than rejecting
  // (observed directly: the click on "Connect anyway" itself never
  // resolves, and the whole test times out tearing down the browser
  // context). That is a genuine, useful finding about the real risk on a
  // laptop with Bluetooth support but no adapter — worth a note for
  // whoever builds Task 8's transport seam — but it makes this exact path
  // actively unsafe to drive in CI without a fake transport this task does
  // not wire into the production bundle (see ConnectedInterstitial.test.tsx's
  // own header comment on why the fake-driven walk lives at the client
  // level instead). The "Connect anyway proceeds" walk is fully covered
  // there and in WorkoutDetail.test.tsx's own real-hook, real-jsdom
  // "transport-missing" integration test — both deterministic, because
  // jsdom simply has no `navigator.bluetooth` to hang on.
  //
  // LOW-1 (task-5 review): the blast radius is WIDER than "pressing Connect
  // anyway" — `ConnectedInterstitial`'s own mount effect calls `connect()`
  // UNCONDITIONALLY, so ANY future e2e test that so much as reaches the
  // interstitial's mount (not only one that presses through the staged
  // confirm) will hang in this same real-Chromium environment. Task 8's
  // transport seam needs to land, or a test-safe injection point needs to
  // exist, before any e2e spec drives PAST the Connect button itself.
  test("Connect anyway is reachable and staged copy is exact — proceeding further belongs to the client-level suite (see comment above)", async ({
    page,
  }) => {
    const title = "Connect Guard Proceed";
    await signInViaBackdoor(page, {
      email: "connect-guard-proceed@e2e.test",
      name: "Connect Guard Proceed Tester",
    });
    await finishATinySession(page, title);
    await reopenDetail(page, title);
    const before = await sessionRunRaw(page);

    await page.getByRole("button", { name: "Connect", exact: true }).click();

    await expect(
      page.getByRole("button", { name: "Connect anyway" }),
    ).toBeVisible();
    // Nothing has moved yet — the button exists and is enabled, and that is
    // as far as this file drives it.
    await expect(
      page.getByRole("button", { name: "Connect anyway" }),
    ).toBeEnabled();
    expect(await sessionRunRaw(page)).toBe(before);
    expect(await monitorRunRaw(page)).toBeNull();

    await cleanupByTitle(page, title);
  });
});
