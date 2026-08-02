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

    await page.reload();
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();
    await expect(page.locator(".timer-state")).toHaveText("PAUSED");
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

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

    await cleanupByTitle(page, title);
  });
});
