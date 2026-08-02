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
 *  landing on Confirm — the same click sequence builder.spec.ts's own
 *  bulk-import tests use to get from a fresh import to the workout's own
 *  detail screen. */
async function startFromLibrary(page: Page, title: string): Promise<void> {
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/session\/confirm$/);
}

/** START on Confirm, then SKIP the countdown — the same handoff flows.spec.ts's
 *  own Phase 6A/6B test already proves against a real starter workout;
 *  reused here verbatim for this file's own tiny bulk-imported fixtures. */
async function startAndSkipCountdown(page: Page): Promise<void> {
  await page.getByRole("button", { name: "START" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
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

  test("the full loop: Today → confirm → countdown → tiny timer session → complete → Log → Held + pain + notes → Save → Today shows it in LAST THREE and the plan's session counter advanced", async ({
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

    // Staged — the first press only reveals the confirm, nothing clears yet.
    await page.getByRole("button", { name: "Discard without logging" }).click();
    const runMidStage = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(runMidStage).not.toBeNull();

    await page.getByRole("button", { name: "Discard session" }).click();
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

  test("BACK mid-session (after real progress) never lands on the countdown and never resets the run", async ({
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
    // Settles back on the live timer, same progressed phase — not reset to
    // phase 1, not bounced anywhere that lost the run.
    await expect(page).toHaveURL(/\/session\/run$/);
    await expect(page.getByText(/^STEP 2 OF 2/)).toBeVisible();
    const runAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(JSON.parse(runAfter ?? "null").index).toBe(1);
    expect(JSON.parse(runAfter ?? "null").startedAt).toBe(
      JSON.parse(runBefore ?? "null").startedAt,
    );

    await cleanupByTitle(page, title);
  });

  test("two browser BACKs after session completion never resurrect the countdown or wipe completedAt", async ({
    page,
  }) => {
    const title = "Back Twice From Complete";
    await signInViaBackdoor(page, {
      email: "session-back-complete@e2e.test",
      name: "Back Complete Tester",
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

    await page.goBack();
    await expect(page.getByText("GET ON THE HANDLE")).not.toBeVisible();
    const completedAtAfterFirstBack = await page.evaluate(() => {
      const raw = localStorage.getItem("ergomatic.sessionRun");
      return raw === null
        ? null
        : (JSON.parse(raw) as { completedAt: string | null }).completedAt;
    });
    expect(completedAtAfterFirstBack).toBe(completedAtBefore);

    await page.goBack();
    await expect(page.getByText("GET ON THE HANDLE")).not.toBeVisible();
    const completedAtAfterSecondBack = await page.evaluate(() => {
      const raw = localStorage.getItem("ergomatic.sessionRun");
      return raw === null
        ? null
        : (JSON.parse(raw) as { completedAt: string | null }).completedAt;
    });
    expect(completedAtAfterSecondBack).toBe(completedAtBefore);

    await cleanupByTitle(page, title);
  });
});
