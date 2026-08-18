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
// carry read state from one run into the next and make "7 UNREAD" a lie on
// the second pass. `RUN_ID` is computed once per test PROCESS (i.e. once
// per `pnpm e2e` invocation, however many times this file itself re-runs
// inside a single process) and folded into every email below, so each
// invocation gets its own never-before-seen users regardless of what a
// prior run left in the database — the "fresh user" half of the brief's
// own suggested fix, not the "assert deltas" half, since the brief's own
// literal assertions ("7 UNREAD", "6 UNREAD" — Phase 6I Task 6 shifted
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
  // `signInViaBackdoor` ends on `page.goto("/")`, which resolves on `load`
  // — before React has mounted the shell. `allInnerTexts()` is a ONE-SHOT
  // read with no auto-retry, so this raced the mount and returned `[]`
  // whenever the machine was busy enough (caught 2026-08-12 during
  // connected-revamp Task 4's fix round: 2 failures in 3 isolated runs on a
  // loaded host, and the failure's own page snapshot showed the nav fully
  // present with Today still reading LOADING…). Waiting for the bar to
  // exist is the fix; the ORDER assertion below is unchanged, so a real
  // tab-order regression still fails here exactly as it always did.
  const tabs = page.locator('nav[aria-label="Main"] a');
  await expect(tabs.first()).toBeVisible();
  const labels = await tabs.allInnerTexts();
  expect(labels).toEqual(["TODAY", "NEWS", "LIBRARY", "PLAN", "YOU"]);
});

test("News at rest: 7 UNREAD, two pinned rows, five latest rows, WHAT'S NEW shows the latest version", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `news-rest-${RUN_ID}@e2e.test`,
    name: "News At Rest",
  });
  await page.goto("/news");

  await expect(page.locator(".news-unread-count")).toHaveText("7 UNREAD");

  // PINNED: workout-types (with type chips), then reading-the-shorthand —
  // registry order (the PR #81 pin swap: baselines moved back to LATEST).
  const pinnedRows = page.locator(".news-pinned .news-row");
  await expect(pinnedRows).toHaveCount(2);
  await expect(pinnedRows.nth(0)).toHaveAttribute(
    "href",
    "/news/workout-types",
  );
  await expect(pinnedRows.nth(1)).toHaveAttribute(
    "href",
    "/news/reading-the-shorthand",
  );
  await expect(pinnedRows.nth(0).locator(".news-row-chips")).toBeVisible();
  await expect(pinnedRows.nth(1).locator(".news-row-chips")).toHaveCount(0);

  // LATEST: your-first-row and connect-the-monitor sort first (published
  // 2026-08-08), then the 2026-08-07 three in registry order — baselines,
  // picking-a-workout, pain-scale (baselines rejoined LATEST in the PR #81
  // pin swap; registry order wins the date tie).
  // Minor #3 (Phase 6I Task 7): scoped to the LATEST section's own
  // `.news-latest` class now, rather than a negation locator — Task 7 added
  // a third row kind to News.tsx (the Start-here pin, inside `.news-pinned`,
  // not a fourth `<section>`) that the old `:not(.news-pinned):not(.news-
  // whatsnew)` selector would still correctly skip, but a named positive
  // selector is the more robust contract going forward.
  const latestRows = page.locator(".news-latest .news-row");
  await expect(latestRows).toHaveCount(5);
  await expect(latestRows.nth(0)).toHaveAttribute(
    "href",
    "/news/your-first-row",
  );
  await expect(latestRows.nth(1)).toHaveAttribute(
    "href",
    "/news/connect-the-monitor",
  );
  await expect(latestRows.nth(2)).toHaveAttribute("href", "/news/baselines");
  await expect(latestRows.nth(3)).toHaveAttribute(
    "href",
    "/news/picking-a-workout",
  );
  await expect(latestRows.nth(4)).toHaveAttribute("href", "/news/pain-scale");

  await expect(page.getByRole("heading", { name: "WHAT'S NEW" })).toBeVisible();
  await expect(page.locator(".news-release-version").first()).toContainText(
    "v0.12.0",
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
  await expect(page.locator(".news-unread-count")).toHaveText("7 UNREAD");

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

  await expect(page.locator(".news-unread-count")).toHaveText("6 UNREAD");
  await expect(baselinesRow).toHaveAttribute("data-read", "true");
  await expect(baselinesRow.locator(".news-row-meta")).toContainText("READ");

  // The cross-reload proof: a client-only hook update would survive a BACK
  // navigation (same SPA session) but not a hard reload — this is the one
  // assertion no client test can give, the entire point of this phase.
  await page.reload();
  await expect(page.locator(".news-unread-count")).toHaveText("6 UNREAD");
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

test("/news/releases lists every version, newest first", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: `news-releases-${RUN_ID}@e2e.test`,
    name: "News Releases",
  });
  await page.goto("/news/releases");

  await expect(
    page.getByRole("heading", { name: "Release notes" }),
  ).toBeVisible();
  // The exact list, newest first, not a count: the ORDER is the claim (a
  // rower opening this screen wants the newest release at the top), and a
  // bare count would pass with the entries shuffled. Adding a release
  // deliberately fails here — that is this pin's job, and it is why the
  // title no longer names a number that goes stale every tag.
  const versions = page.locator(".news-release-version");
  await expect(versions).toHaveCount(9);
  await expect(versions.nth(0)).toContainText("v0.12.0");
  await expect(versions.nth(1)).toContainText("v0.11.0");
  await expect(versions.nth(2)).toContainText("v0.10.0");
  await expect(versions.nth(3)).toContainText("v0.9.0");
  await expect(versions.nth(4)).toContainText("v0.8.0");
  await expect(versions.nth(5)).toContainText("v0.7.0");
  await expect(versions.nth(6)).toContainText("v0.5.1");
  await expect(versions.nth(7)).toContainText("v0.5.0");
  await expect(versions.nth(8)).toContainText("v0.4.0");
});

test("item 1 / round 4: opening an article from a scrolled News feed lands the reader at the top of its OWN scroller, and ← BACK now restores News's own scroll position (CL item: News scroll memory)", async ({
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

  // Scroll to (and open) `pain-scale` specifically — the LAST row of the
  // LATEST section, i.e. the row nearest the bottom of the feed — rather
  // than a PINNED row near the top. A first version of this test scrolled
  // to reveal "ALL RELEASE NOTES" (the true bottom) and then clicked the
  // `baselines` PINNED row instead: since that row sits off-screen near
  // the TOP, Playwright's own `.click()` auto-scrolls it into view before
  // clicking — a second, genuine scroll (down near 45px, `baselines`'s own
  // resting position) that legitimately overwrites the saved 460 BEFORE
  // navigating away. That was a real scroll, correctly saved — the test's
  // own premise was wrong, not `News.tsx`. Clicking a row that's actually
  // near where the feed was scrolled to avoids manufacturing that second
  // scroll.
  const painScaleRow = page.locator('a.news-row[href="/news/pain-scale"]');
  // A real Playwright scroll action (`scrollIntoViewIfNeeded`), not a raw
  // `page.evaluate(() => window.scrollTo(...))` — same idiom
  // `library.spec.ts`'s own scroll-restoration test uses. A synthetic JS
  // `scrollTo` call updates `window.scrollY` synchronously but doesn't
  // reliably dispatch a native "scroll" DOM event in this headless
  // environment (confirmed empirically: `newsScroll.ts`'s sessionStorage
  // write never landed at all when this test used that form), so
  // `News.tsx`'s own scroll listener — which the whole point of this test
  // is to exercise — would never fire in the first place.
  await painScaleRow.scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  const scrolledY = await page.evaluate(() => window.scrollY);

  // Deliberately no wait here — same idiom as `library.spec.ts`'s own
  // scroll-restoration test: the save listener is throttled to ~100ms
  // (`News.tsx`), and clicking IMMEDIATELY, inside that window, is exactly
  // the case the unmount cleanup has to cover (flush the CURRENT scrollY
  // synchronously on unmount) rather than relying on the throttled write
  // ever having landed on its own.
  await painScaleRow.click();
  await expect(page).toHaveURL(/\/news\/pain-scale$/);
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

  // CL item / ROADMAP "News scroll memory": BACK now returns to News per
  // B1's contract (News was the entry surface — `ArticleRow`'s own
  // `state={{from: "/news"}}`), and News restores (within a small
  // tolerance — same idiom and reasoning as `library.spec.ts`'s own
  // `Math.abs(restoredY - scrolledY) <= 50` check) the position it was
  // left at, reversing the #56 tradeoff this test used to pin as permanent
  // (a real, verified brief contradiction at the time — now superseded:
  // the shelf grew, so the tradeoff's own stated trigger fired).
  await page.getByRole("link", { name: "← BACK" }).click();
  await expect(page).toHaveURL(/\/news$/);

  // The restore runs in a useLayoutEffect gated on preferences having
  // settled — poll rather than read once, so a slow first paint on CI
  // doesn't race a bare assertion.
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(scrolledY - 50);
  const restoredY = await page.evaluate(() => window.scrollY);
  expect(Math.abs(restoredY - scrolledY)).toBeLessThanOrEqual(50);
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
// another article) now pushes and carries the same `{ trail, origin }`
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
