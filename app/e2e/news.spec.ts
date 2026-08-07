import { test, expect } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

// Phase 6H Task 7: the News tab proven against the real stack — the one
// thing no client test can give is the cross-reload proof that a read
// survives a server round-trip, not just an in-memory hook update.
//
// Read-state isolation: `article_reads` has no reset/delete route (by
// design — `markRead` is deliberately idempotent-forever, see
// `server/stores/articleReads.ts`), and the compose stack this suite runs
// against is left running between back-to-back `pnpm e2e` invocations
// (`E2E_KEEP=1` default, `scripts/e2e.sh`), so a fixed email string would
// carry read state from one run into the next and make "4 UNREAD" a lie on
// the second pass. `RUN_ID` is computed once per test PROCESS (i.e. once
// per `pnpm e2e` invocation, however many times this file itself re-runs
// inside a single process) and folded into every email below, so each
// invocation gets its own never-before-seen users regardless of what a
// prior run left in the database — the "fresh user" half of the brief's
// own suggested fix, not the "assert deltas" half, since the brief's own
// literal assertions ("4 UNREAD", "3 UNREAD") are absolute counts.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const WORKOUT_TYPES_TITLE =
  "The four workout types, and how hard each should feel";
const BASELINES_TITLE = "What a baseline is, and why every pace comes from one";
const PICKING_A_WORKOUT_TITLE = "Picking a workout by how much it should hurt";
const PAIN_SCALE_TITLE = "The pain scale, without a heart rate strap";

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

test("News at rest: 4 UNREAD, two pinned rows, two latest rows, WHAT'S NEW v0.5.1", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: `news-rest-${RUN_ID}@e2e.test`,
    name: "News At Rest",
  });
  await page.goto("/news");

  await expect(page.locator(".news-unread-count")).toHaveText("4 UNREAD");

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

  // LATEST: picking-a-workout, then pain-scale — the two unpinned articles,
  // both published the same date so registry order wins the sort tie.
  const latestRows = page.locator(
    "section:not(.news-pinned):not(.news-whatsnew) .news-row",
  );
  await expect(latestRows).toHaveCount(2);
  await expect(latestRows.nth(0)).toHaveAttribute(
    "href",
    "/news/picking-a-workout",
  );
  await expect(latestRows.nth(1)).toHaveAttribute("href", "/news/pain-scale");

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
  await expect(page.locator(".news-unread-count")).toHaveText("4 UNREAD");

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

  await expect(page.locator(".news-unread-count")).toHaveText("3 UNREAD");
  await expect(baselinesRow).toHaveAttribute("data-read", "true");
  await expect(baselinesRow.locator(".news-row-meta")).toContainText("READ");

  // The cross-reload proof: a client-only hook update would survive a BACK
  // navigation (same SPA session) but not a hard reload — this is the one
  // assertion no client test can give, the entire point of this phase.
  await page.reload();
  await expect(page.locator(".news-unread-count")).toHaveText("3 UNREAD");
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
  ]) {
    await expect(
      page.locator(".news-row-title").filter({ hasText: title }),
    ).toHaveCount(1);
  }
});
