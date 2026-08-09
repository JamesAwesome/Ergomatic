import { test, expect } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

// Phase 6H Task 7: the News tab proven against the real stack — the one
// thing no client test can give is the cross-reload proof that a read
// survives a server round-trip, not just an in-memory hook update.
//
// Read-state isolation: `article_reads` has no reset/delete route (by
// design — `markRead` is deliberately idempotent-forever, see
// `server/stores/articleReads.ts`), and the compose stack this suite runs
// against is left running between back-to-back `pnpm e2e` invocations
// (`E2E_KEEP=1` default, `scripts/e2e.sh`), so a fixed email string would
// carry read state from one run into the next and make "6 UNREAD" a lie on
// the second pass. `RUN_ID` is computed once per test PROCESS (i.e. once
// per `pnpm e2e` invocation, however many times this file itself re-runs
// inside a single process) and folded into every email below, so each
// invocation gets its own never-before-seen users regardless of what a
// prior run left in the database — the "fresh user" half of the brief's
// own suggested fix, not the "assert deltas" half, since the brief's own
// literal assertions ("6 UNREAD", "5 UNREAD" — Phase 6I Task 6 shifted
// these up by 2 from the original "4 UNREAD"/"3 UNREAD" once
// your-first-row/connect-the-monitor joined the registry) are absolute
// counts.

const WORKOUT_TYPES_TITLE =
  "The four workout types, and how hard each should feel";
const BASELINES_TITLE = "What a baseline is, and why every pace comes from one";
const PICKING_A_WORKOUT_TITLE = "Picking a workout by how much it should hurt";
const PAIN_SCALE_TITLE = "The pain scale, without a heart rate monitor";
const YOUR_FIRST_ROW_TITLE = "Your first row";
const CONNECT_THE_MONITOR_TITLE =
  "Connect the monitor, and it drives the piece";

test("tab order: TODAY · NEWS · LIBRARY · PLAN · YOU, TREND gone", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `news-tabs-${RUN_ID}@e2e.test`,
    name: "News Tabs",
  });
  const labels = await page.locator('nav[aria-label="Main"] a').allInnerTexts();
  expect(labels).toEqual(["TODAY", "NEWS", "LIBRARY", "PLAN", "YOU"]);
});

test("News at rest: 6 UNREAD, two pinned rows, four latest rows, WHAT'S NEW v0.5.1", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `news-rest-${RUN_ID}@e2e.test`,
    name: "News At Rest",
  });
  await page.goto("/news");

  await expect(page.locator(".news-unread-count")).toHaveText("6 UNREAD");

  // PINNED: workout-types (with type chips), then baselines — registry
  // order, both permanently pinned (articles.tsx's own `pinned: true`).
  const pinnedRows = page.locator(".news-pinned .news-row");
  await expect(pinnedRows).toHaveCount(2);
  await expect(pinnedRows.nth(0)).toHaveAttribute(
    "href",
    "/news/workout-types",
  );
  await expect(pinnedRows.nth(1)).toHaveAttribute("href", "/news/baselines");
  await expect(pinnedRows.nth(0).locator(".news-row-chips")).toBeVisible();
  await expect(pinnedRows.nth(1).locator(".news-row-chips")).toHaveCount(0);

  // LATEST: your-first-row and connect-the-monitor sort first (Phase 6I
  // Task 6, published 2026-08-08), then picking-a-workout and pain-scale
  // (published 2026-08-07, registry order wins that date's sort tie).
  // Minor #3 (Phase 6I Task 7): scoped to the LATEST section's own
  // `.news-latest` class now, rather than a negation locator — Task 7 added
  // a third row kind to News.tsx (the Start-here pin, inside `.news-pinned`,
  // not a fourth `<section>`) that the old `:not(.news-pinned):not(.news-
  // whatsnew)` selector would still correctly skip, but a named positive
  // selector is the more robust contract going forward.
  const latestRows = page.locator(".news-latest .news-row");
  await expect(latestRows).toHaveCount(4);
  await expect(latestRows.nth(0)).toHaveAttribute(
    "href",
    "/news/your-first-row",
  );
  await expect(latestRows.nth(1)).toHaveAttribute(
    "href",
    "/news/connect-the-monitor",
  );
  await expect(latestRows.nth(2)).toHaveAttribute(
    "href",
    "/news/picking-a-workout",
  );
  await expect(latestRows.nth(3)).toHaveAttribute("href", "/news/pain-scale");

  await expect(page.getByRole("heading", { name: "WHAT'S NEW" })).toBeVisible();
  await expect(page.locator(".news-release-version").first()).toContainText(
    "v0.5.1",
  );
});

test("opening the baselines article marks it read, and the read survives BACK and a reload", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `news-read-${RUN_ID}@e2e.test`,
    name: "News Reader",
  });
  await page.goto("/news");
  await expect(page.locator(".news-unread-count")).toHaveText("6 UNREAD");

  const baselinesRow = page.locator('a.news-row[href="/news/baselines"]');
  await expect(baselinesRow).toHaveAttribute("data-read", "false");

  await baselinesRow.click();
  await expect(page).toHaveURL(/\/news\/baselines$/);
  await expect(page.locator(".reader-title")).toHaveText(BASELINES_TITLE);
  // The serif prose body — the point of the reader, not a stub.
  await expect(page.locator(".reader-body")).toBeVisible();
  const firstParagraph = page.locator(".reader-body p").first();
  await expect(firstParagraph).toBeVisible();
  await expect(firstParagraph).not.toHaveText("");

  await page.getByRole("link", { name: "← BACK" }).click();
  await expect(page).toHaveURL(/\/news$/);

  await expect(page.locator(".news-unread-count")).toHaveText("5 UNREAD");
  await expect(baselinesRow).toHaveAttribute("data-read", "true");
  await expect(baselinesRow.locator(".news-row-meta")).toContainText("READ");

  // The cross-reload proof: a client-only hook update would survive a BACK
  // navigation (same SPA session) but not a hard reload — this is the one
  // assertion no client test can give, the entire point of this phase.
  await page.reload();
  await expect(page.locator(".news-unread-count")).toHaveText("5 UNREAD");
  await expect(baselinesRow).toHaveAttribute("data-read", "true");
  await expect(baselinesRow.locator(".news-row-meta")).toContainText("READ");
});

test("reader NEXT footer names the next unread article from workout-types", async ({
  page,
}) => {
  // Its own fresh user, never touched by any other test in this file, so
  // "baselines is still unread" holds deterministically regardless of test
  // order — the ordering hazard the brief calls out by name.
  await signInViaBackdoor(page, {
    email: `news-next-${RUN_ID}@e2e.test`,
    name: "News Next",
  });
  await page.goto("/news/workout-types");
  await expect(page.locator(".reader-title")).toHaveText(WORKOUT_TYPES_TITLE);

  const next = page.locator(".reader-next");
  await expect(next).toBeVisible();
  await expect(next).toHaveAttribute("href", "/news/baselines");
  await expect(next).toContainText("NEXT");
  await expect(next).toContainText("3 MIN");
  await expect(next).toContainText(BASELINES_TITLE);
});

test("/news/releases lists all three versions", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: `news-releases-${RUN_ID}@e2e.test`,
    name: "News Releases",
  });
  await page.goto("/news/releases");

  await expect(
    page.getByRole("heading", { name: "Release notes" }),
  ).toBeVisible();
  const versions = page.locator(".news-release-version");
  await expect(versions).toHaveCount(3);
  await expect(versions.nth(0)).toContainText("v0.5.1");
  await expect(versions.nth(1)).toContainText("v0.5.0");
  await expect(versions.nth(2)).toContainText("v0.4.0");
});

test("item 1 / round 4: opening an article from a scrolled News feed lands the reader at the top of its OWN scroller", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `news-scroll-${RUN_ID}@e2e.test`,
    name: "News Scroll",
  });
  // The default 390x844 mobile viewport was originally measured to fit all
  // four of News's original rows plus WHAT'S NEW without overflow — this
  // test shrinks the viewport explicitly rather than depending on that
  // measurement staying true as the feed grows (Phase 6I Task 6 already
  // took it from four rows to six), since a viewport that happens to fit
  // everything would make this test a no-op on the very bug it exists to
  // catch. A shorter viewport (a small phone, or a longer feed) is the
  // realistic scrollable case, so this test forces it explicitly.
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto("/news");
  await expect(page.locator(".news-unread-count")).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 800));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);

  const baselinesRow = page.locator('a.news-row[href="/news/baselines"]');
  await baselinesRow.click();
  await expect(page).toHaveURL(/\/news\/baselines$/);
  await page.locator(".reader-body").waitFor();

  // Round 4 (architectural): the reader is its own scroller now, not the
  // window — assert the READER element itself sits at scrollTop 0 AND that
  // it really is the scrolling element (scrollHeight > clientHeight), not
  // an unscrollable div that trivially reads 0 either way.
  const reader = page.locator(".reader-screen");
  const readerScroll = await reader.evaluate((el) => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(readerScroll.scrollTop).toBe(0);
  expect(readerScroll.scrollHeight).toBeGreaterThan(readerScroll.clientHeight);

  // NOT asserted here, deliberately (brief contradiction, see PR body/report):
  // the brief predicted the window's own scrollY would stay untouched behind
  // the overlay, restoring News's position for free on BACK. Verified false
  // on this real stack — `position: fixed` removes the routed screen from
  // `.app-shell`'s document flow entirely, so `document.body.scrollHeight`
  // collapses to the app-shell padding alone the instant the overlay mounts,
  // and the browser clamps `window.scrollY` to 0 as a consequence (the same
  // clamp Library.tsx's own scroll-memory comment describes for a shorter
  // list). BACK still lands News at the top, unchanged from round 3 — round
  // 4 fixes the reader-opens-mid-scroll bug this suite is named for, but
  // does NOT undo #56's BACK-position tradeoff the way the brief predicted.
  await page.getByRole("link", { name: "← BACK" }).click();
  await expect(page).toHaveURL(/\/news$/);
});

test("round 4: NEXT navigates into a freshly mounted scroller that starts at 0, even though the first article was scrolled down", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `news-next-scroll-${RUN_ID}@e2e.test`,
    name: "News Next Scroll",
  });
  // A short viewport again, so workout-types' body actually overflows its
  // own overlay scroller — otherwise there'd be nothing to scroll down
  // before clicking NEXT, and this test would prove nothing.
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto("/news/workout-types");
  await expect(page.locator(".reader-title")).toHaveText(WORKOUT_TYPES_TITLE);

  // Scroll the CONTAINER, not the window — the whole point of round 4 is
  // that the window never moves at all any more.
  const reader = page.locator(".reader-screen");
  await reader.evaluate((el) => {
    el.scrollTop = 300;
  });
  await expect
    .poll(() => reader.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);

  await page.locator(".reader-next").click();
  await expect(page.locator(".reader-title")).toHaveText(BASELINES_TITLE);

  // Same `.reader-screen` selector, now the NEW article's freshly mounted
  // scroller (React remounts on the slug-keyed root) — it starts at 0 by
  // construction, with nothing to hold or re-assert.
  expect(
    await page.locator(".reader-screen").evaluate((el) => el.scrollTop),
  ).toBe(0);
});

// BACK-walks-the-stack round (James's 2026-08-09 recordings, both, taken
// together): report 1 (pre-✕) — escaping N articles took N backs and the
// origin got lost — shipped the ui-notes round's replace-collapse + ✕
// (#66/#69): NEXT/cross-links REPLACED, so BACK and ✕ both resolved the
// SAME collapsed origin. Report 2, same day: ← BACK from a cross-linked
// article jumped straight to Today instead of the previous article — the
// direct consequence of that single shared value. This round REVERSES the
// collapse: NEXT/ArticleLink PUSH again. ← BACK and browser BACK retrace
// the article stack one article per press, then exit to Today; ✕ still
// exits directly to Today from any depth, unchanged from #66/#69.
test("BACK-walks-the-stack round: from Today's START HERE step 1, NEXT-chaining two articles deep, ← BACK retraces one article at a time and only reaches Today on the THIRD press — ✕ still exits directly from any depth", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `back-stack-chain-${RUN_ID}@e2e.test`,
    name: "Back Stack Chain",
  });
  await page.goto("/today");
  await expect(page.locator(".starthere-block")).toBeVisible();

  // Step 1 is "your-first-row" (startHereSteps.tsx's own fixed table),
  // entered with `from: "/today"` (StartHere.tsx).
  const step1 = page.locator(".starthere-steps .starthere-row").first();
  await expect(step1).toHaveAttribute("href", "/news/your-first-row");
  await step1.click();
  await expect(page).toHaveURL(/\/news\/your-first-row$/);
  await expect(page.locator(".reader-body")).toBeVisible();
  const entryArticleUrl = page.url();

  await page.locator(".reader-next").click();
  await expect(page.locator(".reader-body")).toBeVisible();
  const afterFirstHopUrl = page.url();

  await page.locator(".reader-next").click();
  await expect(page.locator(".reader-body")).toBeVisible();

  // The reversal this round makes: ← BACK from two hops in must land back
  // on the article one level up the chain, NOT jump straight to Today —
  // the ui-notes round's own replace-collapse contract (and the pre-fix
  // bug's multi-BACK cost, at the other extreme) both predicted a wrong
  // answer here.
  await page.getByRole("link", { name: /BACK/ }).click();
  await expect(page).toHaveURL(afterFirstHopUrl);
  await expect(page.locator(".reader-body")).toBeVisible();

  // A second ← BACK reaches the ENTRY article (your-first-row) — three
  // articles were visited (your-first-row, then two NEXT hops), so three
  // presses are needed to fully unwind the stack, not two.
  await page.getByRole("link", { name: /BACK/ }).click();
  await expect(page).toHaveURL(entryArticleUrl);
  await expect(page.locator(".reader-body")).toBeVisible();

  // A THIRD ← BACK reaches Today — the stack, walked fully.
  await page.getByRole("link", { name: /BACK/ }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator(".starthere-block")).toBeVisible();

  // Re-enter the chain and prove ✕ still exits directly from the same
  // depth, unchanged from #66/#69 — only BACK's own target reversed.
  await step1.click();
  await expect(page).toHaveURL(/\/news\/your-first-row$/);
  await page.locator(".reader-next").click();
  await page.locator(".reader-next").click();
  await page.getByRole("link", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/today$/);
});

// Crosslink round — field bug (James's 2026-08-09 recording, Chromium):
// Today → START HERE step 3 → the picking-a-workout article → tapping the
// IN-PROSE cross-link "pain from 1 to 5" → ✕ landed on NEWS, not Today.
// Report 2, same day, same path one level deeper: ← BACK from that
// cross-linked article jumped straight to Today instead of back to
// picking-a-workout — the ui-notes round's replace-collapse fixed the
// FIRST symptom (origin lost entirely) but, by design, made BACK and ✕
// resolve identically, which is exactly what made the second report
// possible. `ArticleLink` (the one door an article body may use to link to
// another article) now pushes and carries the same `{ from, origin }`
// shape NEXT does, so BACK retraces THROUGH a cross-link hop exactly like
// it does through a NEXT hop.
test("BACK-walks-the-stack round: an in-prose cross-link inside an article retraces via ← BACK one hop at a time (both the in-page link and browser BACK), while ✕ still exits directly to Today", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `crosslink-${RUN_ID}@e2e.test`,
    name: "Crosslink Origin",
  });
  await page.goto("/today");
  await expect(page.locator(".starthere-block")).toBeVisible();

  // Step 3 is "picking-a-workout" (startHereSteps.tsx's own fixed table),
  // entered with `from: "/today"` (StartHere.tsx).
  const step3 = page.locator(".starthere-steps .starthere-row").nth(2);
  await expect(step3).toHaveAttribute("href", "/news/picking-a-workout");
  await step3.click();
  await expect(page).toHaveURL(/\/news\/picking-a-workout$/);
  await expect(page.locator(".reader-title")).toHaveText(
    PICKING_A_WORKOUT_TITLE,
  );
  const pickingAWorkoutUrl = page.url();

  // James's exact path: the IN-PROSE cross-link, not NEXT.
  const crossLink = page
    .locator(".reader-body")
    .getByRole("link", { name: "pain from 1 to 5" });
  await expect(crossLink).toHaveAttribute("href", "/news/pain-scale");
  await crossLink.click();
  await expect(page).toHaveURL(/\/news\/pain-scale$/);
  await expect(page.locator(".reader-title")).toHaveText(PAIN_SCALE_TITLE);

  // (a) James's exact path, one level deeper than the field report: ← BACK
  // from the cross-linked article must land back on picking-a-workout —
  // the previous article the rower actually read — not jump to Today the
  // way the ui-notes round's replace-collapse contract made it.
  await page.getByRole("link", { name: /BACK/ }).click();
  await expect(page).toHaveURL(pickingAWorkoutUrl);
  await expect(page.locator(".reader-title")).toHaveText(
    PICKING_A_WORKOUT_TITLE,
  );

  // ← BACK again reaches Today, the entry surface.
  await page.getByRole("link", { name: /BACK/ }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator(".starthere-block")).toBeVisible();

  // (b) Re-enter, hop through the cross-link again, then ✕ — it still
  // exits directly to Today, unchanged from #66/#69; only ← BACK's own
  // target reversed.
  await step3.click();
  await expect(page).toHaveURL(/\/news\/picking-a-workout$/);
  await page
    .locator(".reader-body")
    .getByRole("link", { name: "pain from 1 to 5" })
    .click();
  await expect(page).toHaveURL(/\/news\/pain-scale$/);
  const close = page.getByRole("link", { name: "Close" });
  await expect(close).toBeVisible();
  await expect(close).toHaveAttribute("href", "/today");
  await close.click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator(".starthere-block")).toBeVisible();

  // (c) The depth lock, browser-BACK form: re-enter, hop through the
  // cross-link a third time, then ONE browser BACK — proving the PUSH (not
  // the ui-notes round's `replace`) restored a real, walkable history
  // entry for the cross-link hop itself, not just for a NEXT hop.
  await step3.click();
  await expect(page).toHaveURL(/\/news\/picking-a-workout$/);
  await page
    .locator(".reader-body")
    .getByRole("link", { name: "pain from 1 to 5" })
    .click();
  await expect(page).toHaveURL(/\/news\/pain-scale$/);

  await page.goBack();
  await expect(page).toHaveURL(pickingAWorkoutUrl);
  await expect(page.locator(".reader-title")).toHaveText(
    PICKING_A_WORKOUT_TITLE,
  );

  // (d) Origin survives a NEXT + cross-link MIX: hop through the cross-link
  // once more from picking-a-workout, then take a NEXT hop from the
  // cross-linked article itself — a genuinely different hop KIND than
  // (a)-(c) above, which never left the cross-link/cross-link pattern. ✕
  // must still resolve Today after the mix, proving `origin` (established
  // at the cross-link hop) threads through a SUBSEQUENT NEXT hop unchanged.
  await page
    .locator(".reader-body")
    .getByRole("link", { name: "pain from 1 to 5" })
    .click();
  await expect(page).toHaveURL(/\/news\/pain-scale$/);
  await page.locator(".reader-next").click();
  await expect(page.locator(".reader-body")).toBeVisible();
  await expect(page.getByRole("link", { name: "Close" })).toHaveAttribute(
    "href",
    "/today",
  );
});

// Sanity check the titles above actually match the registry, so a future
// content edit that silently drifts the constants gets caught here instead
// of failing every test above with a confusing "element not found."
test("article titles used by this file exist in the registry", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `news-titles-${RUN_ID}@e2e.test`,
    name: "News Titles",
  });
  await page.goto("/news");
  for (const title of [
    WORKOUT_TYPES_TITLE,
    BASELINES_TITLE,
    PICKING_A_WORKOUT_TITLE,
    PAIN_SCALE_TITLE,
    YOUR_FIRST_ROW_TITLE,
    CONNECT_THE_MONITOR_TITLE,
  ]) {
    await expect(
      page.locator(".news-row-title").filter({ hasText: title }),
    ).toHaveCount(1);
  }
});
