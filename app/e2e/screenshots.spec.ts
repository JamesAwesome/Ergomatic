import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";
import { LIBRARY_WORKOUTS } from "../server/seed/library/index.js";
import type { Step, WorkoutType } from "../domain/types.js";
import { compileProgram } from "../domain/monitor/program.js";
import type { WorkoutProgram } from "../domain/monitor/program.js";
import type { IntervalActual } from "../domain/monitor/types.js";
import { buildDraft, startDraft } from "../src/session/draft";
import { buildRun } from "../src/session/engine";
import { buildLogSeed } from "../src/session/logDraft";
import { MONITOR_RUN_KEY, type MonitorRun } from "../src/monitor/monitorRun";

// Committed into docs/screenshots/ for PR bodies. NOT diff-asserted — a
// human judges these, this spec only judges "did it render" (see
// docs/superpowers/specs/2026-07-28-testing-validation-design.md). Run via
// `pnpm screenshots` (scripts/screenshots.sh), never as part of `pnpm e2e`.
const SCREENSHOTS_DIR = path.resolve(process.cwd(), "../docs/screenshots");

// The handoff's own reference values, so captured targets/durations match
// what the design docs describe.
const SCREENSHOT_BASELINES = { k2Seconds: 112.0, k6Seconds: 122.0 };

/**
 * Sets baselines for the signed-in user so screenshots show the product's
 * real numbers (durations, resolved targets) instead of the no-baselines
 * fallback ("—" / "no target"). Driven via an in-page fetch
 * (real Chromium networking), not `page.request`: the api container runs
 * with NODE_ENV=production, so the session cookie is Set-Cookie'd with
 * `Secure` — Chromium exempts http://127.0.0.1 from that (the loopback
 * "potentially trustworthy origin" carve-out), but Playwright's Node-side
 * APIRequestContext does not, so `page.request.put` 401s here even though
 * the identical request from the loaded page succeeds. Mirrors the reset
 * helper in library.spec.ts's baseline-propagation describe block.
 */
async function setBaselines(page: Page): Promise<void> {
  const result = await page.evaluate(async (patch) => {
    const res = await fetch("/api/baselines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, SCREENSHOT_BASELINES);
  if (!result.ok) {
    throw new Error(`baseline setup failed: ${result.status} ${result.body}`);
  }
}

/** Sets the warm-up preference via the real `PUT /api/prefs` route
 *  (2026-08-09 warmup-setting spec §2) — same real-networking reasoning as
 *  `setBaselines` above. Used by the captures whose whole point is to show
 *  the setting ON (the "countdown" screen's own next-phase line, the
 *  "you-warmup-on" capture — ConfirmTargets' own WARM-UP row died with the
 *  screen, fast-follow Task 4 — and, as of Phase LT spec 1 Task 3, the DISTANCE
 *  variant on "post-workout-summary" itself, so the mixed row list includes
 *  a genuinely-measured completed WARM-UP row for the first time), since
 *  the setting defaults OFF. */
async function setWarmup(
  page: Page,
  warmup: (
    { kind: "time"; minutes: number } | { kind: "distance"; meters: number }
  ) & { restSeconds?: number },
): Promise<void> {
  const result = await page.evaluate(async (patch) => {
    const res = await fetch("/api/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warmup: patch }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, warmup);
  if (!result.ok) {
    throw new Error(`warmup setup failed: ${result.status} ${result.body}`);
  }
}

/** Phase 6I Task 7: dismisses START HERE on Today via an in-page fetch —
 *  same real-networking reasoning as `setBaselines` above — so a screenshot
 *  can show News's own Start-here pin (only visible once dismissed) and
 *  the Learning screen's own dismissed status line/PUT IT BACK control,
 *  rather than the empty/never-dismissed state. */
async function dismissStartHere(page: Page): Promise<void> {
  const result = await page.evaluate(async () => {
    const res = await fetch("/api/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startHereDismissed: true }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  });
  if (!result.ok) {
    throw new Error(
      `dismiss start-here failed: ${result.status} ${result.body}`,
    );
  }
}

/** Marks a single article slug read via an in-page fetch — used to give the
 *  Learning screen's own progress line/pin meta a real, non-zero count
 *  rather than a fresh account's 0 OF 4. */
async function markArticleRead(page: Page, slug: string): Promise<void> {
  const result = await page.evaluate(async (s) => {
    const res = await fetch(`/api/article-reads/${s}`, { method: "PUT" });
    return { ok: res.ok, status: res.status };
  }, slug);
  if (!result.ok) {
    throw new Error(`mark read failed: ${result.status}`);
  }
}

/** Neutralises `.tabbar`'s `position: fixed`, for THREE different reasons
 *  across its callers (round 4 review: this comment used to name only the
 *  first; trace-truth Task 3 added the third).
 *
 *  1. **`fullPage: true` on a plain document-flow screen** (`builder`):
 *  a full-page screenshot on a document taller than the viewport stitches
 *  it together from scrolled segments; a fixed-position element gets
 *  redrawn at its *viewport-relative* spot in every segment, so on a page
 *  well past the 390×844 viewport (six steps plus an expanded editor) the
 *  tab bar ends up composited into the middle of the stitched image,
 *  overlapping whatever content happened to be in that segment — a capture
 *  artifact, not a product bug (the bar being fixed is correct behaviour,
 *  so this is not a fix to `src/`). `position: static` makes it render
 *  exactly once, in its real DOM position — on THIS kind of route,
 *  `AppRoutes.tsx` renders `<TabBar />` right after the routed screen
 *  inside `.app-shell`, so static positioning puts it at the true end of
 *  the document.
 *
 *  2. **Freeing the tabbar's own reserved space on an `.overlay-screen`
 *  route** (`log-detail`, R3-1/round 4): `.overlay-screen`
 *  (`index.css`) is `position: fixed; inset: 0` — it takes the WHOLE
 *  routed screen out of `.app-shell`'s document flow, so claim 1 above
 *  does NOT hold there: `.tabbar`, once static, lands at the literal top
 *  of `.app-shell` (confirmed against the real stack — its only other
 *  flow-contributing child is gone), not "the true end of the document".
 *  `fullPage: true` is useless on this route for the identical reason
 *  (Playwright measures `document`'s own scrollable size, which a fixed
 *  element never contributes to) — `scrollTraceChartIntoFrame` (below)
 *  is what actually reveals more content here, by scrolling the overlay
 *  element's own internal `overflow-y: auto`. What THIS function still
 *  buys on that route: the tabbar visually SAT ON TOP of the overlay's
 *  own last ~45px (fixed, higher paint layer) before being neutralised,
 *  so removing it frees that space for the overlay's real content to
 *  show through.
 *
 *  3. **Freeing the same reserved space on an ORDINARY plain-flow route,
 *  no `fullPage` involved** (`log-monitor`/`log-monitor-landscape`,
 *  trace-truth Task 3): `/library/:id/log` is claim 1's own route shape
 *  (`.app-shell` flow, not `.overlay-screen`), but neither of these tests
 *  ever sets `fullPage: true` — they take an ordinary viewport screenshot
 *  after `scrollTraceChartIntoFrame`. The x-axis this task added sits low
 *  enough in the chart that its OWN labels landed in the same visually
 *  fixed-bar-covered zone claim 2 describes, on a screen shaped like claim
 *  1. Same fix, reason 2's own words applied to a reason-1-shaped route.
 *
 *  The `.app-shell { padding-bottom: 0 }` line matters for cases 1 and 3
 *  (both plain document flow): `.app-shell`'s own `padding-bottom`
 *  (reserved for the fixed bar so scrolled content doesn't land underneath
 *  it) becomes a blank gap once the bar is no longer fixed there, so this
 *  drops it. It is a NO-OP for case 2 — `.overlay-screen` sets its own
 *  separate `padding-bottom` directly (`index.css`), never inheriting
 *  `.app-shell`'s — kept here anyway because it is harmless and cases 1/3
 *  still need it. */
async function neutralizeFixedTabBarForFullPageCapture(
  page: Page,
): Promise<void> {
  await page.addStyleTag({
    content: `
      .tabbar { position: static !important; }
      .app-shell { padding-bottom: 0 !important; }
    `,
  });
}

// R3-1 (review round 3): `.trace-figure`'s own bottom edge (now including
// F-2's `.trace-legend`, its last child) needs to clear whichever
// container actually scrolls THIS route — that is NOT always `window`.
// `/session/log` (log-monitor's own door) is a plain document-flow
// screen, so `window.scrollBy` moves it — but `/today/log/:id`
// (log-detail's own door, `FromTheLog.tsx`) renders inside
// `.overlay-screen` (`index.css`'s own documented iOS-scroll-restoration
// idiom: `position: fixed; inset: 0; overflow-y: auto`), which takes
// the whole screen OUT of `.app-shell`'s document flow and gives it an
// INTERNAL scroll of its own — `window.scrollBy` has no effect on it at
// all (confirmed against the real stack: `document.body.scrollHeight`
// stays pinned at the viewport's own height the instant this mounts,
// same collapse this file's own `.overlay-screen` CSS comment documents
// for News's BACK-position tradeoff). `fullPage: true` is equally
// ineffective here for the identical reason — Playwright measures
// `document`'s own scrollable size, which this fixed, internally-
// scrolling element never contributes to. Detects which case applies
// and scrolls the RIGHT thing rather than assuming `window` always
// works.
async function scrollTraceChartIntoFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector(".trace-figure");
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const margin = 16;
    const delta = rect.bottom - window.innerHeight + margin;
    const overlay = document.querySelector(".overlay-screen");
    if (overlay !== null) {
      overlay.scrollTop += delta;
    } else {
      window.scrollBy(0, delta);
    }
  });
}

/** Activates a preset plan via the real `PUT /api/plan` route — same
 *  in-page-fetch idiom as `setBaselines` above, duplicated from
 *  `e2e/design.spec.ts`'s own `choosePlan` rather than shared (this
 *  codebase's established precedent for small per-file e2e helpers). */
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

/** Zeroes `doneN` via `PUT /api/plan {reset:true}` (keeps the already-set
 *  planKey — see planState.ts's own `reset`). Needed because `stores/
 *  logs.ts`'s `create` bumps `plan_state.done_n` on every logged session,
 *  and this file's screenshot accounts are fixed emails re-used on every
 *  `pnpm screenshots` run — without this, "SESSION N OF 84" would drift a
 *  little further every time the script reruns instead of landing on a
 *  stable, reviewable "SESSION 1 OF 84". Duplicated from `e2e/
 *  design.spec.ts`'s identical helper, added there for the same reason. */
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

/** Seeds `count` real logs via `POST /api/logs` so Today's LAST THREE
 *  renders its populated layout, not the "No sessions logged yet." empty
 *  state — duplicated from `e2e/design.spec.ts`'s identical helper. */
async function seedLogs(page: Page, count: number): Promise<void> {
  const result = await page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutId: null,
          workoutTitle: `Screenshot Session ${i + 1}`,
          workoutType: "AT",
          held: i % 2 === 0 ? "held" : "under",
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
        }),
      });
      if (!res.ok) {
        return { ok: false, status: res.status, body: await res.text() };
      }
    }
    return { ok: true, status: 200, body: "" };
  }, count);
  if (!result.ok) {
    throw new Error(`log seed failed: ${result.status} ${result.body}`);
  }
}

test("signin", async ({ page }) => {
  await page.goto("/");
  // The only capture here that didn't wait for content, and it eventually
  // bit: a run caught the page between load and first paint and committed a
  // blank cream rectangle. Every other test in this file waits for a real
  // element first — this one now does too.
  await page
    .getByRole("link", { name: /continue with google/i })
    .waitFor({ state: "visible" });
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "signin.png"),
  });
});

// Replaces the old "signed-in-home" capture (Phase 6A Task 5): "/" has
// redirected to "/today" since Task 2, so a bare post-sign-in screenshot and
// a dedicated Today screenshot were always going to be the same route —
// keeping both would just be two images of one screen, one of them a stale,
// undersetup duplicate of the other (the same "one capture already subsumes
// the other" reasoning "workout-detail" used to retire its own predecessor
// below). The committed `signed-in-home.png` was additionally already stale
// two ways by the time this task started: it pre-dated the "/" -> "/today"
// flip entirely (still showed the old Library screen), and the one time it
// was regenerated (Task 4, sanity-checking an unrelated change) it raced
// Today's five concurrent data hooks and caught a bare "LOADING…" frame —
// the exact "wait for a real element, not just navigation" lesson `signin`
// above already carries a scar for. This capture seeds a plan and real
// history first specifically so it never reduces to that empty/loading
// state again.
//
// Task 3 (2026-08-04 round): three captures from one continuous flow — the
// same "multiple screenshots per test" idiom the "library" test below (and
// "today-unlogged" above it in history) already uses — now that DIFFICULTY/
// TIME/PAIN live behind a FILTER ⌄ sheet instead of always-on chip rows.
// `today.png` is the REST state (FILTER ⌄ beside SHUFFLE, no chip groups on
// screen); `today-sheet.png` and `today-filtered.png` mirror
// `library-sheet.png`/`library-filtered.png`'s own open/applied pair.
//
// Round 2 (2026-08-04): `today-sheet.png` now shows all FIVE groups
// (DIFFICULTY/TIME/PAIN/LAST DONE/SOURCE), and the Revision (mid-round)
// replaced the live-counting primary ("Show N options") with the constant
// "Apply Filter" plus a small mono count caption above it.
test("today", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-today@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await seedLogs(page, 3);
  await choosePlan(page, "sprint");
  await resetPlanProgress(page);
  await page.goto("/today");
  // Today shows "LOADING…" until all five of its data hooks resolve — wait
  // for the suggested-workout card itself before shooting.
  await page.locator(".today-card").waitFor();

  // REST: FILTER ⌄ beside SHUFFLE, no DIFFICULTY/TIME/PAIN chip groups on
  // the screen itself.
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today.png"),
  });

  // SHEET: open, all five groups (DIFFICULTY/TIME/PAIN/LAST DONE/SOURCE),
  // and the constant "Apply Filter" primary with its own live-count caption.
  // Deselecting HARD is a real, visible DIFFICULTY deviation with zero risk
  // of a zero-result pool — the 300-workout library's own O2 quota (today's
  // sprint-plan code) has no HARD entries at all (design.spec.ts's own
  // SHUFFLE-disabled comment).
  await page.getByRole("button", { name: "FILTER ⌄" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "HARD", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply Filter" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today-sheet.png"),
  });

  // FILTERED: applied — the DIFFICULTY token ("EASY–MEDIUM") and CLEAR ALL.
  await page.getByRole("button", { name: "Apply Filter" }).click();
  await expect(page.locator(".filter-token")).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today-filtered.png"),
  });
});

// Task 2 (2026-08-10 workout-step-detail spec §2/§7.1): the capped
// (5+ piece) state of the piece region — "today.png" above never shows it,
// since whichever real global workout the sprint plan happens to recommend
// there is never guaranteed to carry 5+ pieces. Determinism: a single
// custom 7-piece import, narrowed to via SOURCE=CUSTOM (this account's only
// personal workout) — no recency race against the 300 seeded globals
// needed, and no plan/type coupling either (freestyle, the account's
// default). §7.1 pins the viewport at 375×812 (narrower than this file's
// default 390×844) specifically to check the card + LAST THREE heading
// still fit the first screenful at the tightest common width; if they
// don't, spec §7.1 calls for a cap-of-three media query at that width.
test("today-capped", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const title = "Screenshot Today Capped Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-today-capped@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  // §7.1 is about the CARD's own height at 375px, not the unrelated
  // Phase 6I START HERE block (an every-fresh-account onboarding panel
  // that already pushes the card down in "today.png" above, before this
  // task) — dismissed here so the check isn't confounded by it.
  await dismissStartHere(page);
  // The mock's own "Long Fetch" pyramid (Workout steps final.dc.html):
  // 2-4-6-8-6-4-2' at 6k+6→6k+0→6k+6, 2' rest between — 32' work / 44'
  // total, matching the design handoff's own printed numbers exactly.
  await importBulk(
    page,
    [
      `${title} | O2 | hard | 4`,
      "w 2' 6k+6 @22 r2",
      "w 4' 6k+4 @24 r2",
      "w 6' 6k+2 @26 r2",
      "w 8' 6k+0 @28 r2",
      "w 6' 6k+2 @26 r2",
      "w 4' 6k+4 @24 r2",
      "w 2' 6k+6 @22",
    ].join("\n"),
  );
  await page.goto("/today");
  await page.locator(".today-card").waitFor();

  await page.getByRole("button", { name: "FILTER ⌄" }).click();
  await page
    .getByRole("dialog")
    .getByRole("group", { name: "SOURCE" })
    .getByRole("button", { name: "CUSTOM", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply Filter" }).click();
  await expect(page.locator(".today-card-title")).toHaveText(title);
  await expect(page.locator(".today-piece-more")).toBeVisible();

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today-capped.png"),
  });

  await cleanupByTitle(page, title);
});

// 2026-08-11 piece-rollup spec: the rolled (single-row) state of the piece
// region — the trigger fixture was Ostro's own 9×1000m card, which used to
// spend the whole cap on four identical rows plus a "+5 more pieces" row.
// Determinism: a CUSTOM import of Ostro's exact real shape (9 reps ×
// 1000m at 6k+2, spm 26, 1' rest — server/seed/library/at.ts's own Ostro
// entry), narrowed via SOURCE=CUSTOM — the same idiom "today-capped" above
// already uses for exactly the same reason (no recency race against the
// 300 seeded globals, no plan/type coupling). A custom import rather than
// filtering the real global Ostro entry itself: with 300 seeded workouts,
// no combination of TYPE/DURATION/DIFFICULTY/PAIN filters reliably narrows
// the pool to that one title (many share type+duration+difficulty), so
// SOURCE=CUSTOM stays the only deterministic pick in this account.
test("today-rolled", async ({ page }) => {
  const title = "Screenshot Today Rolled Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-today-rolled@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await dismissStartHere(page);
  await importBulk(
    page,
    [`${title} | AT | medium | 4`, "x9", "w 1000m 6k+2 @26 r1"].join("\n"),
  );
  await page.goto("/today");
  await page.locator(".today-card").waitFor();

  await page.getByRole("button", { name: "FILTER ⌄" }).click();
  await page
    .getByRole("dialog")
    .getByRole("group", { name: "SOURCE" })
    .getByRole("button", { name: "CUSTOM", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply Filter" }).click();
  await expect(page.locator(".today-card-title")).toHaveText(title);
  // The whole 9-piece set rolls into ONE row — no more-row, no PIECES
  // suffix (piece-rollup contract items 1/4).
  await expect(page.locator(".today-piece-row")).toHaveCount(1);
  await expect(page.locator(".today-piece-text")).toContainText("9 × 1000m");
  await expect(page.locator(".today-piece-more")).toHaveCount(0);
  await expect(page.locator(".today-piece-foot-count")).toHaveCount(0);

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today-rolled.png"),
  });

  await cleanupByTitle(page, title);
});

// Phase 6I Task 8: the fresh-user state "today.png" above never shows —
// that capture deliberately sets baselines first (line ~234) so it can
// exercise FILTER/SHUFFLE. This is the OTHER state a brand-new account
// actually lands on: no baselines row at all, the dismissible START HERE
// block above everything, and the no-baseline SETS YOUR BASELINE card in
// place of the normal suggestion apparatus — the phase's own new screen,
// and the one screenshot obligation this phase adds that isn't a re-capture
// of something that already existed.
test("today-onboarding", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-today-onboarding@e2e.test",
    name: "Screenshot Tester",
  });
  await page.goto("/today");
  await page.locator(".baselinecard").waitFor();
  // The header's own "N OF 4 READ" count resolves from a separate fetch
  // (`useArticleReads`) than the card's — waiting on the card alone raced
  // it on this test's own first run, capturing the bare "START HERE"
  // loading-suppression fallback instead of the real "0 OF 4 READ" a fresh
  // account actually shows once both have loaded.
  await expect(page.locator(".starthere-label")).toContainText("READ");
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today-onboarding.png"),
  });
});

// Task 3 (ui-fix round): the unlogged row's own staged Discard — a real
// timer run driven to the summary (/session/log), then a non-destructive
// `/today` exit WITHOUT logging it, is the only way to land a
// completed-but-unlogged run record (same "drive the real flow" idiom the
// "post-workout-summary" captures above already use). Two captures,
// DEFAULT and ARMED, matching the design mockup's own labelled pair —
// `today-unlogged` doubles as the pair's shared setup since Playwright
// screenshots are just PNG writes, not a separate render each time.
test("today-unlogged", async ({ page }) => {
  const title = "Screenshot Unlogged Row Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-today-unlogged@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await importBulk(page, [`${title} | AN | easy | 1`, "w 0:03 6k"].join("\n"));
  await startFromLibrary(page, title);
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
  await expect(page).toHaveURL(/\/session\/log$/, { timeout: 6000 });
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("link", { name: "← DONE" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByText(/unlogged session/i)).toBeVisible();

  // DEFAULT: title + "unlogged session.", Log it, and the outlined ✕.
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today-unlogged.png"),
  });

  // ARMED: the same row's contents swapped in place — border to accent,
  // the discard question, and a solid "Tap again" replacing Log it/✕.
  await page.getByRole("button", { name: "Discard without logging" }).click();
  await expect(page.getByRole("button", { name: "Tap again" })).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today-unlogged-armed.png"),
  });

  await cleanupByTitle(page, title);
});

// F6 spec 2b, Task 5: the twin row's own capture — a dead `MonitorRun`
// (`completedAt === null`) the rower closes through Today rather than the
// monitor itself. Duplicated helper set from e2e/design.spec.ts's own
// identical block (this file's own stated precedent, `cleanupByTitle`'s
// comment above) — a real `buildDraft -> startDraft -> buildRun ->
// compileProgram -> buildLogSeed` compile against the real seeded library
// workout "Hoarfrost", with `workoutId` fetched from the compose stack's
// own `/api/workouts`, never a hand-typed record. No `cleanupByTitle` call
// needed: "Hoarfrost" is a global library workout, not a personal one this
// user created, and the `MonitorRun` itself lives in localStorage.

function library(title: string) {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  return w;
}

function compileOrThrow(
  phases: Parameters<typeof compileProgram>[0],
): WorkoutProgram {
  const result = compileProgram(phases);
  if ("code" in result) {
    throw new Error(
      `fixture failed to compile (${result.code}): ${result.message}`,
    );
  }
  return result;
}

const MONITOR_FIXED_NOW = new Date("2026-08-01T12:00:00.000Z");
const MONITOR_FIXTURE_BASELINES = { k2Seconds: 100, k6Seconds: 120 };

async function libraryWorkoutId(page: Page, title: string): Promise<string> {
  const result = await page.evaluate(async (t) => {
    const res = await fetch("/api/workouts");
    if (!res.ok) return { ok: false as const, status: res.status, id: null };
    const workouts = (await res.json()) as Array<{
      id: string;
      title: string;
    }>;
    return {
      ok: true as const,
      status: res.status,
      id: workouts.find((w) => w.title === t)?.id ?? null,
    };
  }, title);
  if (!result.ok) {
    throw new Error(`workout lookup failed for "${title}": ${result.status}`);
  }
  if (result.id === null) {
    throw new Error(`workout not found in the seeded library: "${title}"`);
  }
  return result.id;
}

function buildInterruptedMonitorRun(workoutId: string): MonitorRun {
  const hoarfrost = library("Hoarfrost");
  const timeWork = hoarfrost.steps.find((s) => s.k === "w") as Extract<
    Step,
    { k: "w" }
  >;
  const calmSea = library("Calm Sea");
  const distanceWork = calmSea.steps.find((s) => s.k === "w") as Extract<
    Step,
    { k: "w" }
  >;
  const draft = buildDraft({
    id: workoutId,
    title: hoarfrost.title,
    type: hoarfrost.type as WorkoutType,
    steps: [timeWork, distanceWork],
  });
  const started = startDraft(draft);
  const built = buildRun(
    started,
    MONITOR_FIXTURE_BASELINES,
    MONITOR_FIXED_NOW,
    {
      kind: "time",
      minutes: 4,
    },
  );
  const program = compileOrThrow(built.phases);
  const logSeed = buildLogSeed(built.phases, MONITOR_FIXTURE_BASELINES);
  const actuals: IntervalActual[] = [
    {
      index: 1,
      elapsedSeconds: 360,
      distanceMeters: 1200,
      avgSplit: 150,
      avgSpm: 22,
      avgHeartRateBpm: 130,
      restDistanceMeters: 0,
    },
  ];
  return {
    v: 2,
    workoutId,
    title: hoarfrost.title,
    program,
    logSeed,
    actuals,
    deviceName: "PM5 432331249 Row",
    startedAt: MONITOR_FIXED_NOW.toISOString(),
    completedAt: null,
    terminated: false,
  };
}

test("today-interrupted", async ({ page }) => {
  const title = "Hoarfrost";
  await signInViaBackdoor(page, {
    email: "screenshots-today-interrupted@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  const workoutId = await libraryWorkoutId(page, title);
  const run = buildInterruptedMonitorRun(workoutId);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: MONITOR_RUN_KEY,
    value: JSON.stringify(run),
  });

  await page.goto("/today");
  await expect(page.getByText(/interrupted connected session\./)).toBeVisible();

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "today-interrupted.png"),
  });
});

test("plan", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-plan@e2e.test",
    name: "Screenshot Tester",
  });
  await choosePlan(page, "sprint");
  await resetPlanProgress(page);
  await page.goto("/plan");
  // With no plan chosen, /plan renders two preset cards instead — a
  // different, already-reachable layout. Wait for the real 84-row sequence,
  // the state this capture exists to show.
  await page.locator(".plan-sequence").waitFor();
  await expect(page.locator(".plan-row")).toHaveCount(84);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "plan.png"),
  });
});

// PM final-PR gate, condition 3: `plan.png` above is reset to zero done
// rows (recurring failure #7's own trap in reverse — no done row at all,
// let alone a linked one). This capture advances one real session through
// the same `advancesPlan: true` path `log-detail` uses (a genuine atomic
// upsert, not a faked checkmark), so Plan.tsx's own done-row link (§1:
// "a done row with stored linkage becomes a link" — `usePlanLinks`,
// `GET /api/logs?plan=<key>`) has something real to find and render row 1
// as an `<a class="plan-row plan-row-done">` instead of a plain `<div>`.
test("plan-linked", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-plan-linked@e2e.test",
    name: "Screenshot Tester",
  });
  await choosePlan(page, "sprint");
  await resetPlanProgress(page);
  await postLog(page, {
    workoutTitle: "Sea Fret",
    workoutType: "O2",
    held: "held",
    pain: 2,
    avgSplitSeconds: 130,
    timeSeconds: 780,
    distanceMeters: 3000,
    advancesPlan: true,
    steps: [
      {
        label: "6:00 @ 6k",
        targetSplit: 130,
        actualSplit: 130,
        actualSource: "stopwatch",
        meters: 3000,
      },
    ],
  });

  await page.goto("/plan");
  await page.locator(".plan-sequence").waitFor();
  await expect(page.locator(".plan-row")).toHaveCount(84);

  // The load-bearing assertion: a done row that is genuinely a link, not
  // just a checkmark glyph — `usePlanLinks`'s fetch has to have resolved
  // and matched row 1 before this holds.
  const linkedRow = page.locator("a.plan-row-done");
  await expect(linkedRow).toHaveCount(1);
  await expect(linkedRow).toHaveAttribute("href", /\/today\/log\/.+/);

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "plan-linked.png"),
  });
});

// Task 4 (ui-fix round): three captures from one continuous flow — the same
// "multiple screenshots per test" idiom "today-unlogged" above uses for its
// DEFAULT/ARMED pair. `library.png` is now the REST state proper (DESIGN.md's
// own "1 · AT REST" — FILTER ⌄ + a plain count, no tokens), so the CUSTOM
// badge showcase this test always did moves to `library-filtered.png`
// instead of being baked into the rest capture.
//
// Library-filter-unification round, Task 3: the flow now also selects the
// chip row's own O2 chip between the REST and SHEET captures, so the
// descriptor word and a TYPE token enter the visual record too (the sheet
// no longer has any TYPE cell to demonstrate that through) — `library.png`
// itself stays ZERO-selection, deliberately: that's the state the I-1 fix
// (Task 2 — a 4px-vs-16px chip-row gap, a ~34px jump on toggle) has to be
// checked against, not a selected one.
test("library", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-library@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);

  // Phase 5H: personal (non-global) workouts now wear a CUSTOM badge on
  // the library row's second line. Every seeded library workout is
  // global, so without authoring one of its own first, no capture below
  // would ever show the badge at all — same reasoning as "workout-detail"'s
  // own builder-authored personal workout further down. Simplest valid
  // form: title + pain + one row's duration — `newForm()`'s own default
  // TYPE (O2) and DIFFICULTY (easy) are left untouched, which matters
  // below: the chip-row TYPE filter this flow adds has to actually match
  // this workout, or SOURCE=CUSTOM would narrow to zero instead of one.
  const customTitle = "Screenshot Custom Workout";
  await page.goto("/library/new");
  await page.getByLabel("Title").fill(customTitle);
  await page.getByRole("button", { name: "Pain 3" }).click();
  await page.getByLabel("Row 1 duration", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "Save to library" }).click();
  await expect(page).toHaveURL(/\/library\/[^/]+$/);

  await page.goto("/library");
  // Library shows "LOADING…" until the workouts/baselines fetches resolve;
  // page.goto only waits for the navigation's load event, not that — wait
  // for a real row so the screenshot isn't just the loading state.
  await page.locator(".workout-row").first().waitFor();

  // REST: FILTER ⌄ + "N WORKOUTS", no tokens, ZERO chips selected.
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "library.png"),
  });

  // THE RANGE LINE HAS A VISUAL RECORD (review of the always-name-the-base
  // change, Minor-3). Every row visible in `library.png` above carries a
  // COLLAPSED single ref (`@ 6K+12`), so before this capture no committed
  // image showed `structureLine`'s range form at all — the one place the
  // baseline used to go missing was the one place nothing photographed.
  // Ground Fog is the reported case: five pieces, offsets +12 down to +10.
  const rangeRow = page
    .locator(".workout-row")
    .filter({ hasText: "Ground Fog" });
  await rangeRow.scrollIntoViewIfNeeded();
  // Assert the state BEFORE shooting: a capture of an empty or wrong row is
  // recurring failure #7, and this one exists specifically to prove a string.
  await expect(rangeRow.locator(".workout-row-structure")).toHaveText(
    "4-6-8-6-4 @ 6K+12 → +10 · 1′ REST",
  );
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "library-range.png"),
  });
  // Scroll back before the captures below: `scrollIntoViewIfNeeded` above
  // leaves the list mid-page, and `library-sheet.png` shot the scrolled
  // list behind its dialog the first time this ran. A capture that moves
  // because a NEIGHBOURING capture moved is the drift these files exist to
  // make visible, so undo the scroll rather than re-baselining the sibling.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".workout-row").first()).toBeInViewport();

  // Select the chip row's own O2 chip (library-filter-unification round,
  // Task 2, spec §2 — TYPE's control now lives here, not in the sheet):
  // applies immediately, fills the chip with its own type colour, and
  // surfaces the descriptor word beneath it. O2 matches the custom workout
  // authored above, so combining it with SOURCE=CUSTOM below still narrows
  // to exactly one row rather than zero.
  await page
    .locator(".type-chip-grid")
    .getByRole("button", { name: "O2", exact: true })
    .click();

  // SHEET: open, with SOURCE=CUSTOM selected but not yet applied — the
  // DIFFICULTY group (Task 2's own addition, first in the sheet now that
  // TYPE has left it for the chip row) and the "Apply Filter" primary with
  // its live-counting caption (spec §3, singular-aware: "1 WORKOUT") are
  // the point of this capture.
  await page.getByRole("button", { name: "FILTER ⌄" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "CUSTOM", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Apply Filter" }),
  ).toBeEnabled();
  await expect(dialog.getByText("1 WORKOUT", { exact: true })).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "library-sheet.png"),
  });

  // FILTERED: applied — the O2 chip still selected with its descriptor
  // word visible, the TYPE token alongside the SOURCE token, the narrowed
  // count, and (the library sorts the global starter workouts ahead of the
  // one freshly-authored personal one, so filtering is what actually gets
  // the CUSTOM badge into frame) the isolated custom row.
  await dialog.getByRole("button", { name: "Apply Filter" }).click();
  await expect(page.locator(".workout-row-custom").first()).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "library-filtered.png"),
  });

  await cleanupByTitle(page, customTitle);
});

// Phase 6E fix round: "library.png" above deliberately captures the
// Phase 5H CUSTOM-filter single-row state, so it never shows what the
// screen actually looks like for the vast majority of visits — the
// unfiltered list of the real generated 300. This capture is that missing
// state: no CUSTOM filter, scrolled to the top, so the committed image
// shows genuine library rows (sorted O2-first, "Sea Fret" leading per
// ROADMAP.md's Phase 6E entry) and the real "300 ENTERED" count header,
// not a single custom row against a near-empty background.
test("library-seeded", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-library-seeded@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);

  await page.goto("/library");
  // Same "LOADING…" race as the "library" capture above — wait for a real
  // row before shooting.
  await page.locator(".workout-row").first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "library-seeded.png"),
  });
});

/** Test-only cleanup: finds the signed-in user's own workout with the given
 *  title via the real API and deletes it. Duplicated from e2e/design.spec.ts
 *  / e2e/builder.spec.ts's own `cleanupByTitle` rather than shared — same
 *  precedent as this codebase's other intentionally-duplicated small
 *  helpers — so the "workout-detail" capture below doesn't pile up a fresh
 *  personal workout under the same fixed email every time `pnpm
 *  screenshots` reruns against a database that isn't reset between runs. */
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

test("workout-detail", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-detail@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);

  // A personal (non-global) workout, authored through the builder like the
  // "builder" capture below — WorkoutDetail.tsx renders Edit/Delete only
  // for `!workout.isGlobal`, and every seeded library workout is global, so
  // the previous version of this capture (the library's first row) never
  // showed Task 8's owner-action styling fix at all. This replaces that
  // capture rather than adding a second one: a screenshot of a *global*
  // workout's detail screen (no Edit/Delete, no owner-actions block) records
  // strictly less of this app's own surface than a personal one does, so
  // keeping both would just be two similar images where one already
  // subsumes the other.
  const title = "Screenshot Personal Workout";
  await page.goto("/library/new");
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Pain 3" }).click();
  await page.getByLabel("Row 1 duration", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "DONE" }).click();

  // Row 2 (Phase 5G): a MAX-effort row, so the committed detail capture
  // shows a real resolved effort word ("ALL OUT") next to an ordinary
  // resolved split range, not just the latter — the visual record this
  // phase's ledger calls for.
  await page.getByRole("button", { name: "+ ADD STEP" }).click();
  await page.getByLabel("Row 2 duration", { exact: true }).fill("30");
  await page.getByRole("radio", { name: "Row 2 pace MAX" }).click();
  const row2SpmUp = page.getByRole("button", {
    name: "Row 2 stroke rate up",
  });
  await row2SpmUp.click();
  await row2SpmUp.click();

  await page.getByRole("button", { name: "Save to library" }).click();
  await expect(page).toHaveURL(/\/library\/[^/]+$/);
  await page.locator(".workout-detail-title").waitFor();
  await expect(page.getByText("ALL OUT")).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "workout-detail.png"),
  });

  await cleanupByTitle(page, title);
});

// Fast-follow Task 5 (M-3, Task 4 review): the reordered action stack's
// normal state is `workout-detail.png` above (Connect, LAST USED-capable,
// leads; Start Timer, enabled, at L2). This is the OTHER state that used
// to have no capture at all: a never-baselined account, where Start Timer
// renders disabled with the dashed idiom and the "no target · Set
// baselines" caption. A plain distance/duration row (no explicit effort
// pace) is enough — `needsBaselines()` reads true for it, and this
// account never calls the baselines API.
test("workout-detail-no-target", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-detail-no-target@e2e.test",
    name: "Screenshot No Target Tester",
  });

  const title = "Screenshot No Target Workout";
  await page.goto("/library/new");
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Pain 3" }).click();
  await page.getByLabel("Row 1 duration", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "Save to library" }).click();
  await expect(page).toHaveURL(/\/library\/[^/]+$/);
  await page.locator(".workout-detail-title").waitFor();
  await expect(
    page.getByRole("button", { name: "Start Timer" }),
  ).toBeDisabled();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "workout-detail-no-target.png"),
  });

  await cleanupByTitle(page, title);
});

/** Fills the top-level fields plus a seven-step body so the committed
 *  screenshot shows the whole point of the accordion redesign
 *  (docs/design/builder-redesign/README.md): only the LAST step ends up
 *  expanded — every other step folds down to its ~86px collapsed summary
 *  card (StepCard.tsx), which is exactly the vertical-density problem this
 *  phase's redesign exists to fix. A blank/default form (one row, always
 *  open) could never show that, so this deliberately builds more than one
 *  step and explicitly collapses each one via DONE before moving on.
 *
 *  Step 1: a sub-minute minutes row (`0:45`, typed through the masked
 *  numeric-pad clock field, ClockInput.tsx — the Phase 5F feature this
 *  screenshot exists to prove: before that phase the closest a rower could
 *  get was `0.75` or a rejected `:` keystroke), stroke rate raised off FREE
 *  via the SPM stepper (Stepper.tsx) — collapsed once configured.
 *  Steps 2-4: a distance row (2000m @ 2k, exercising DurationInput's M
 *  chip and the REST stepper's 30s increments) plus two collapsed-card ⧉
 *  duplicates of it (docs/design/DEVIATIONS.md's SET-cell replacement) —
 *  the fast way to build a realistic multi-step ladder without opening
 *  three separate editors.
 *  Step 5 (Phase 5G): a MAX effort row (`0:30 @ MAX`), collapsed like every
 *  other step above it — this is the one the committed image exists to
 *  show: the collapsed StepCard reads `0:30 @ MAX` on its summary line and
 *  `ALL OUT` in its resolved-target slot, proving the effort-chip feature
 *  reads correctly in the folded state, not just the open editor.
 *  Step 6: "+ ADD STEP" appends a seventh, deliberately different row (a
 *  minutes row back at 6k, offset) and — being the freshly-added step —
 *  is the one left open when this function returns, since that's the
 *  state the screenshot needs to capture. */
async function fillSampleWorkout(page: Page): Promise<void> {
  await page.getByLabel("Title").fill("Screenshot Intervals");
  await page.getByRole("button", { name: "Pain 3" }).click();

  // Row 1: base defaults to 6k (builderState.ts's newRow) — ten clicks on
  // the "slower" stepper reaches "6k +10". "45" digits into the masked
  // clock field renders as "0:45" (45 seconds) — a sub-minute duration,
  // valid since this phase widened duration validation from half-steps to
  // any whole second, and unrepresentable in the old free-text/decimal
  // field this phase replaced.
  await page.getByLabel("Row 1 duration", { exact: true }).fill("45");
  const row1Slower = page.getByRole("button", { name: "Row 1 pace slower" });
  for (let i = 0; i < 10; i++) {
    await row1Slower.click();
  }
  const row1SpmUp = page.getByRole("button", {
    name: "Row 1 stroke rate up",
  });
  await row1SpmUp.click();
  await row1SpmUp.click();
  await page.getByRole("button", { name: "DONE" }).click();

  // Row 2: a distance row (2000m against 2k). The unit switch clears the
  // field (a clock string is meaningless as meters), so the M chip has to
  // be selected BEFORE typing the meter count, not after.
  await page.getByRole("button", { name: "+ ADD STEP" }).click();
  await page.getByRole("radio", { name: "Row 2 duration unit meters" }).click();
  await page.getByLabel("Row 2 duration", { exact: true }).fill("2000");
  await page.getByRole("radio", { name: "Row 2 pace 2K" }).click();
  const row2SpmUp = page.getByRole("button", {
    name: "Row 2 stroke rate up",
  });
  for (let i = 0; i < 6; i++) {
    await row2SpmUp.click();
  }
  const row2RestUp = page.getByRole("button", { name: "Row 2 rest up" });
  for (let i = 0; i < 6; i++) {
    await row2RestUp.click();
  }
  await page.getByRole("button", { name: "DONE" }).click();

  // Two collapsed-card ⧉ duplicates of Row 2 (Steps 3 and 4) — everything
  // stays collapsed the whole time.
  const duplicateRow2 = page.getByRole("button", { name: "Duplicate Step 2" });
  await duplicateRow2.click();
  await duplicateRow2.click();
  await duplicateRow2.click();

  // Step 5 (Phase 5G): a fresh MAX-effort row, collapsed via DONE like every
  // step above it — "30" into the masked clock field renders as "0:30".
  // Row 1 + Row 2 + three ⧉ duplicates (Rows 3-5) already occupy the first
  // five slots, so this freshly-added row lands as Row 6.
  await page.getByRole("button", { name: "+ ADD STEP" }).click();
  await page.getByLabel("Row 6 duration", { exact: true }).fill("30");
  await page.getByRole("radio", { name: "Row 6 pace MAX" }).click();
  const maxRowSpmUp = page.getByRole("button", {
    name: "Row 6 stroke rate up",
  });
  for (let i = 0; i < 13; i++) {
    await maxRowSpmUp.click();
  }
  await page.getByRole("button", { name: "DONE" }).click();

  // Step 6 (7th row overall): "+ ADD STEP" appends a blank work step and
  // opens it (Task 6 — it no longer copies the last row's values) — give it
  // distinct values (minutes, not metres; 6k, not 2k) so the screenshot
  // doesn't read as clones of the earlier rows. A blank row already
  // defaults to "min" (newRow(), builderState.ts), so no unit switch is
  // needed before typing; "800" digits into the masked clock field renders
  // as "8:00".
  await page.getByRole("button", { name: "+ ADD STEP" }).click();
  const lastRowLabel = "Row 7";
  await page
    .getByLabel(`${lastRowLabel} duration`, { exact: true })
    .fill("800");
  await page.getByRole("radio", { name: `${lastRowLabel} pace 6K` }).click();
  const lastFaster = page.getByRole("button", {
    name: `${lastRowLabel} pace faster`,
  });
  for (let i = 0; i < 5; i++) {
    await lastFaster.click();
  }
  // Row 7 is left EXPANDED here (no DONE press) — this is the one card the
  // screenshot needs open.

  const repeatUp = page.getByRole("button", { name: "Repeat up" });
  await repeatUp.click();
  await repeatUp.click();
  await repeatUp.click();
}

test("builder", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-builder@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await page.goto("/library/new");
  await fillSampleWorkout(page);

  // Seven steps total (Phase 5G added the MAX row): six collapsed cards
  // (StepCard.tsx) and exactly one open editor (StepEditor.tsx) — the
  // accordion invariant this whole redesign exists to prove, captured live
  // before any save. Every collapsed row resolves a target (five splits
  // against the set baselines, one effort word for the MAX row); the open
  // row shows its own resolved (exact) split in the TARGET strip instead.
  await expect(page.locator(".step-card")).toHaveCount(6);
  await expect(page.locator(".step-card-split")).toHaveCount(6);
  await expect(page.locator(".step-editor")).toHaveCount(1);
  await expect(page.locator(".step-editor-target-value")).toHaveCount(1);
  // The MAX row's own collapsed summary — this is the shot the phase's
  // ledger note calls out: `0:30 @ MAX` visible in the folded list, not
  // just inside an open editor.
  await expect(page.getByText("0:30 @ MAX")).toBeVisible();
  await expect(
    page.locator(".step-card-split", { hasText: "ALL OUT" }),
  ).toBeVisible();
  // Scoped to the REPEAT stepper's own value cell, not a page-wide text
  // search: StepCard.tsx's collapsed delete button is also the "×" glyph,
  // so an unscoped getByText("×4") can match across two adjacent rows'
  // concatenated text (a delete "×" immediately followed by the next
  // card's index digit) as readily as it matches the real stepper.
  await expect(page.locator(".builder-repeat-row .stepper-value")).toHaveText(
    "×4",
  );

  // fillSampleWorkout scrolls the page down while filling rows near the
  // bottom of the form, so a viewport-only screenshot here would start at
  // the classification card and never show `← BACK`, the "New workout"
  // heading, the Title field, or ↻ AUTO NAME. fullPage captures the whole
  // scrollable form regardless of current scroll position.
  await neutralizeFixedTabBarForFullPageCapture(page);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "builder.png"),
    fullPage: true,
  });
});

test("builder-draft-restored", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-builder-draft@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  // Real content, not an empty state (recurring-failure #7): type a title,
  // leave via the tab bar (the silent-discard path the feature exists for),
  // and come back — the capture's whole point is the `Draft restored.`
  // notice with its START OVER control above a form that kept the text.
  await page.goto("/library/new");
  await page.getByLabel("Title").fill("Interrupted workout");
  await page.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.goto("/library/new");
  await expect(page.getByText("Draft restored.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Interrupted workout");
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "builder-draft-restored.png"),
  });
});

test("releases", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-releases@e2e.test",
    name: "Screenshot Tester",
  });
  // The Releases screen had no committed visual record before the v0.7.0
  // notes entry; the capture asserts the newest entry is actually rendered
  // (not an empty state, recurring-failure #7) before shooting.
  await page.goto("/news/releases");
  await expect(
    page.getByRole("heading", { name: "Release notes" }),
  ).toBeVisible();
  await expect(page.locator(".news-release-version").first()).toContainText(
    "v0.15.0",
  );
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "releases.png"),
  });
});

test("import", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-import@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  // Its own screen now (Library's IMPORT link / the /library/import route
  // in AppRoutes.tsx), not a toggle inside the builder.
  await page.goto("/library/import");

  // A filled textarea, not the blank placeholder state — the grammar help
  // below it (.bulk-import-help) is static and always rendered either way,
  // but an empty control isn't "real content" for a screenshot. Same
  // example text as BulkImport.tsx's own GRAMMAR_EXAMPLE constant.
  const text = [
    "Ladder Day | AT | medium | 3",
    "x4",
    "w 1' 6k-2 @22 r5",
    "r 5",
  ].join("\n");
  await page.getByLabel("Bulk import text").fill(text);
  await page.locator(".bulk-import-help").waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "import.png"),
  });
});

// A fresh account's WARM-UP row reads its default OFF state (2026-08-09
// warmup-setting spec §2: `null` is the column's default, off for
// everyone) — no setup needed beyond baselines loading, unlike
// "you-warmup-on" below.
test("you", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-you@e2e.test",
    name: "Screenshot Tester",
  });
  await page.goto("/you");
  // Same "LOADING…" race as /library — wait for the baseline card's real
  // content before capturing.
  await page.locator(".baseline-value").first().waitFor();
  // Scoped by class, not accessible name: whole-branch review finding F's
  // dedup fix means the meta slot holds the status value alone ("OFF"),
  // not "WARM-UP · OFF" — the row's own title ("Warm-up") already says
  // that word once.
  await expect(
    page.locator(".warmup-row-button .you-settings-row-meta"),
  ).toHaveText("OFF");
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "you.png"),
  });
});

// The ON state's own house duration format (spec §3's own literal writes
// the "WARM-UP · " prefix in; the shipped row doesn't, per finding F's
// dedup fix — recorded where the row itself renders. `+ :30 REST` when
// set — rendered here as `+ 0:30 REST`, block2-review F5) — "you.png"
// above only ever shows the default OFF row.
test("you-warmup-on", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-you-warmup-on@e2e.test",
    name: "Screenshot Tester",
  });
  await setWarmup(page, { kind: "time", minutes: 10, restSeconds: 30 });
  await page.goto("/you");
  await page.locator(".baseline-value").first().waitFor();
  await expect(
    page.locator(".warmup-row-button .you-settings-row-meta"),
  ).toHaveText("10:00 + 0:30 REST");
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "you-warmup-on.png"),
  });
});

test("you-staged", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-you-staged@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await page.goto("/you");
  await page.locator(".baseline-value").first().waitFor();
  // Press the 2k "slower" stepper a few times (0.5 s/step) to dirty the
  // draft without touching `committed` — this is the whole point of the
  // staged editor: nothing re-paces until Apply. Three presses from the
  // 112.0 s seed land the confirm block at "2k 1:52.0 → 1:53.5", which
  // "you.png" never shows because it captures the empty/seeded state
  // before any draft edits.
  const slower = page.getByRole("button", { name: "2k slower" });
  await slower.click();
  await slower.click();
  await slower.click();
  await page.getByRole("button", { name: "Apply baselines" }).waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "you-staged.png"),
  });
});

// ui-notes round, item 2 — the derivation offer, visible in neither "you"
// (both baselines unset) nor "you-staged" (both set, mid-nudge): a fresh
// rower who has nudged ONLY the 6k field and applied sees the ESTIMATE FROM
// 6K offer appear under the still-empty 2k row. Task-review round (PR #66,
// Finding 1, BLOCKER) fixed: reached here through the REAL editor flow (a
// UI nudge + Apply), never a raw `fetch` PUT — a raw-API seed would prove
// nothing about whether the client's own Apply can actually produce this
// state (it couldn't, before the fix: Apply always committed both fields).
test("you-derive-offer", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-you-derive-offer@e2e.test",
    name: "Screenshot Tester",
  });
  await page.goto("/you");
  await page.locator(".baseline-value").first().waitFor();
  await page.getByRole("button", { name: "6k slower" }).click();
  await page.getByRole("button", { name: "Apply baselines" }).click();
  await page.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }).waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "you-derive-offer.png"),
  });
});

// Task-review round, Finding 2 (ship-risk): accepting the offer used to
// unmount the button outright — this capture is the committed visual
// record of the fix, the inert "ESTIMATED" status line occupying the exact
// same reserved slot the button did, so a reviewer can see the layout
// never collapses. Continues straight from the offer state above (same
// account, same session) rather than a fresh sign-in — tapping ESTIMATE
// FROM 6K is the one interaction this capture exists to show.
test("you-derive-offer-accepted", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-you-derive-offer-accepted@e2e.test",
    name: "Screenshot Tester",
  });
  await page.goto("/you");
  await page.locator(".baseline-value").first().waitFor();
  await page.getByRole("button", { name: "6k slower" }).click();
  await page.getByRole("button", { name: "Apply baselines" }).click();
  await page.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }).click();
  await page.getByText("ESTIMATED — ADJUST WITH ± BELOW").waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "you-derive-offer-accepted.png"),
  });
});

// Re-review round (PR #66): the CONFIRMED CSS regression's own visual
// record — the MIRROR direction of "you-derive-offer" above. Touching only
// 2k and applying leaves 6k server-null, so the offer (and
// `.baseline-derive-slot`) render directly under the 6K row instead of the
// 2K row — exactly the arrangement that broke `.baseline-row:last-of-type`
// (fixed in index.css via `:has(~ .baseline-row)`). Reached through the
// real UI, same discipline as the other offer captures — no raw-API seed.
test("you-derive-offer-6k", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-you-derive-offer-6k@e2e.test",
    name: "Screenshot Tester",
  });
  await page.goto("/you");
  await page.locator(".baseline-value").first().waitFor();
  await page.getByRole("button", { name: "2k slower" }).click();
  await page.getByRole("button", { name: "Apply baselines" }).click();
  await page.getByRole("button", { name: "ESTIMATE FROM 2K (+7s)" }).waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "you-derive-offer-6k.png"),
  });
});

// Phase 6I Task 7: You › Learning the app — dismissed on Today (so the
// status line/PUT IT BACK ON TODAY control both render, not just the
// baseline empty state) with one of the four steps already read (a real,
// non-zero progress count), the realistic state a rower actually reaches
// this screen from rather than a brand-new account's 0 OF 4.
test("you-learning", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-you-learning@e2e.test",
    name: "Screenshot Tester",
  });
  await dismissStartHere(page);
  await markArticleRead(page, "baselines");
  await page.goto("/you/learning");
  await page.locator(".learning-progress-count").waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "you-learning.png"),
  });
});

// Phase 6B (Task 5): the pre-workout countdown, live timer (portrait +
// 844×420 landscape), and the post-workout summary (Phase PW Task 5's own
// screen, which replaced SessionComplete). Every capture drives a
// bulk-imported, non-empty workout through the real START -> countdown ->
// timer flow (never a hand-built minimum) — same three-step idiom as e2e/
// design.spec.ts's/e2e/session.spec.ts's own identical helpers, duplicated
// here per this file's own stated precedent (see `cleanupByTitle`'s own
// comment above) rather than shared across files.

/** Bulk-imports `text` and waits for the redirect back to /library. */
async function importBulk(page: Page, text: string): Promise<void> {
  await page.goto("/library/import");
  await page.getByLabel("Bulk import text").fill(text);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
}

/** Opens `title`'s detail page from the library list and presses Start,
 *  landing directly on the countdown (fast-follow Task 4: ConfirmTargets is
 *  deleted, Start is the one door now). */
async function startFromLibrary(page: Page, title: string): Promise<void> {
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
}

test("countdown", async ({ page }) => {
  const title = "Screenshot Countdown Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-countdown@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  // A warm-up-first session — the warm-up preference turned ON (2026-08-09:
  // no seeded/imported workout can carry a `wu` step any more, the setting
  // is the ONLY producer of a warm-up phase) ahead of an ordinary two-step
  // ladder. The countdown's own next-phase line reads the CURRENT (warm-up)
  // phase's resolved label — "Easy" — the same never-a-dash word every
  // warm-up phase resolves to.
  await setWarmup(page, { kind: "time", minutes: 5 });
  await importBulk(
    page,
    [`${title} | AT | medium | 3`, "w 4:00 6k @20 r1", "w 3:00 6k @18"].join(
      "\n",
    ),
  );
  await startFromLibrary(page, title);
  await expect(page.getByText("GET ON THE HANDLE")).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "countdown.png"),
  });
  await cleanupByTitle(page, title);
});

test("timer", async ({ page }) => {
  const title = "Screenshot Timer Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-timer@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  // Two work steps with a rest between them (the `r1.5` suffix expands to
  // its own REST phase — domain/expand.js) — three phases total, so the
  // committed capture shows a real, populated dots row, STEP line, resolved
  // TARGET SPLIT/RATE cards, and a meaningful UP NEXT (the rest phase),
  // landing on the WORK phase itself (phase 0) — the brief's own "work
  // phase, targets visible" case, not the warm-up "countdown.png" already
  // shows.
  await importBulk(
    page,
    [`${title} | AT | medium | 3`, "w 4:00 6k @20 r1.5", "w 4:00 6k @20"].join(
      "\n",
    ),
  );
  await startFromLibrary(page, title);
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
  await expect(page.getByText(/^STEP 1 OF 3/)).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "timer.png"),
  });
  await cleanupByTitle(page, title);
});

test("timer-landscape", async ({ page }) => {
  const title = "Screenshot Timer Landscape Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-timer-landscape@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  // Same fixture as "timer" above — three phases, so the landscape-only
  // "then …" UP NEXT line (Timer.tsx's `thenNextText`) has something real
  // to resolve to (the second work phase, past the rest phase UP NEXT
  // already names).
  await importBulk(
    page,
    [`${title} | AT | medium | 3`, "w 4:00 6k @20 r1.5", "w 4:00 6k @20"].join(
      "\n",
    ),
  );
  await startFromLibrary(page, title);
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
  await expect(page.getByText(/^STEP 1 OF 3/)).toBeVisible();
  // The handoff's own landscape reference frame (docs/design/README.md).
  await page.setViewportSize({ width: 844, height: 420 });
  await expect(page.locator(".timer-upnext-then")).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "timer-landscape.png"),
  });
  await cleanupByTitle(page, title);
});

/** THE PHONE TIMER, MID-WARM-UP (connected-revamp Task 4b, review I-2).
 *
 *  The wave's other warm-up captures are all connected-pane ones, where the
 *  warm-up fill is `--ink-4` under an ink work fill. THIS surface fills
 *  `--accent`, so its warm-up tone is `--ink-5` and sits only 1.97:1 from
 *  the unfilled track — the weakest contrast anywhere in the wave, and the
 *  one nobody had a picture of. `timer.png` cannot serve: its fixture is
 *  deliberately warm-up-less (that IS the no-warm-up byte-identity pin), so
 *  this is a separate state rather than a change to that one.
 *
 *  THE CLOCK IS REWOUND, NOT WAITED OUT. The bar has to be PARTIALLY filled
 *  — a fill at 0% would photograph nothing, and the phase would have to run
 *  for two and a half real minutes to reach the middle of a 5:00 warm-up.
 *  So the stored run's `phaseStartedAt` is moved 150 s into the past through
 *  the app's own record (`session/run.ts`'s `ergomatic.sessionRun`, the same
 *  reach `e2e/session.spec.ts:256-264` already makes into the draft) and the
 *  page reloaded, which is exactly the round-trip a rower's own reload
 *  takes. The `2:30` assertion below is what proves the rewind landed.
 *
 *  What the frame then holds: a 5:00 warm-up inside a 13:00 session, so the
 *  warm-up's span is 38.5% of the bar and the fill sits at 19.2% — half the
 *  warm-up rowed. Three zones, left to right: the warm-up's own fill, the
 *  unrowed remainder of its span in plain track, and the interval notch that
 *  ends it. */
async function timerMidWarmup(page: Page, title: string): Promise<void> {
  await setBaselines(page);
  await setWarmup(page, { kind: "time", minutes: 5 });
  await importBulk(
    page,
    [`${title} | AT | medium | 3`, "w 4:00 6k @20 r1", "w 3:00 6k @18"].join(
      "\n",
    ),
  );
  await startFromLibrary(page, title);
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
  // Phases: warm-up 5:00, work 4:00, its rest 1:00, work 3:00 — four steps,
  // three INTERVALS (the rest folds), so the bar draws two notches.
  await expect(page.getByText(/^STEP 1 OF 4 · WARM-UP/)).toBeVisible();
  await page.evaluate((elapsedMs) => {
    const raw = localStorage.getItem("ergomatic.sessionRun");
    if (raw === null) throw new Error("no stored run to rewind");
    const run = JSON.parse(raw) as { phaseStartedAt: string };
    run.phaseStartedAt = new Date(Date.now() - elapsedMs).toISOString();
    localStorage.setItem("ergomatic.sessionRun", JSON.stringify(run));
  }, 150_000);
  await page.reload();
  await expect(page.getByText(/^STEP 1 OF 4 · WARM-UP/)).toBeVisible();
  // 5:00 warm-up, 2:30 rowed: the countdown proves the rewind took, and the
  // bar is therefore 150/780 = 19.2% filled inside a 38.5% warm-up span.
  await expect(page.locator(".timer-time")).toHaveText("2:30");
}

test("timer-warmup", async ({ page }) => {
  const title = "Screenshot Timer Warmup Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-timer-warmup@e2e.test",
    name: "Screenshot Tester",
  });
  await timerMidWarmup(page, title);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "timer-warmup.png"),
  });
  await cleanupByTitle(page, title);
});

test("timer-warmup-landscape", async ({ page }) => {
  const title = "Screenshot Timer Warmup Landscape Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-timer-warmup-landscape@e2e.test",
    name: "Screenshot Tester",
  });
  await timerMidWarmup(page, title);
  // The handoff's own landscape reference frame, matching "timer-landscape".
  await page.setViewportSize({ width: 844, height: 420 });
  await expect(page.locator(".timer-total-bar")).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "timer-warmup-landscape.png"),
  });
  await cleanupByTitle(page, title);
});

/** Rewinds the CURRENT phase's own `phaseStartedAt` (`session/run.ts`'s
 *  `ergomatic.sessionRun`) so a real elapsed reading of exactly
 *  `elapsedSecondsValue` is on the stopwatch the instant NEXT is next
 *  clicked — the same reach `timerMidWarmup` above uses for its warm-up
 *  rewind, generalized here so a live JUDGED (or on-target) distance row
 *  can be recorded without waiting out several minutes of real elapsed
 *  time. Reloads so the running Timer picks up the rewritten start; every
 *  call site re-asserts its STEP heading is back on screen before clicking
 *  NEXT — the gap between that reload and the click is the only real-time
 *  jitter the recorded split is exposed to, and each call site below sizes
 *  its own margin against it via the phase's own meters (a bigger phase
 *  divides that jitter down further before it reaches the split). */
async function recordDistanceActual(
  page: Page,
  elapsedSecondsValue: number,
): Promise<void> {
  await page.evaluate((elapsedMs) => {
    const raw = localStorage.getItem("ergomatic.sessionRun");
    if (raw === null) throw new Error("no stored run to rewind");
    const run = JSON.parse(raw) as { phaseStartedAt: string };
    run.phaseStartedAt = new Date(Date.now() - elapsedMs).toISOString();
    localStorage.setItem("ergomatic.sessionRun", JSON.stringify(run));
  }, elapsedSecondsValue * 1000);
  await page.reload();
}

// Phase PW Task 5: the post-workout summary replaces SessionComplete AND
// the old Log screen ("log-session") captures wholesale — one screen now,
// reached directly off the finish stage (no intermediate hop). This one
// capture does both of its predecessors' jobs at once: a real recorded
// measured row (session-complete's own job) AND a filled-in reflection
// card (log-session's own job) — the two things a rower actually sees on
// the SAME screen now, never two different ones.
//
// Phase LT spec 1, Task 3 (2026-08-18): now THREE phases, not two — a
// DISTANCE warm-up (100m, `setWarmup`) is on ahead of the original
// time-then-distance pair, giving this LIVE-door capture the one row
// state `log-detail.png` (a stored, no-warm-up door) can never show at
// all: a genuinely measured, completed WARM-UP row, sitting alongside the
// new TARGET/SPM columns. The "0:03 @ 6k" TIME phase is UNCHANGED and
// stays a useful negative check: `timerWorkRows`'s own measurability gate
// (`timerMeasurableElapsedSeconds`) recognizes ONLY `actualSource:
// "stopwatch"`, never `"assumed"` (a TIME phase with no distance actual
// to record — `buildLogSteps`'s own rule) — so this row renders
// PRESCRIBED, exactly as it always has, proving Task 3's two new cells
// (which only the MEASURED branch of `IntervalRow` renders) left the
// prescribed branch untouched. The LAST work phase ("100m max") demonstrates
// the ABSTAINED EFFORT row live: a real (stopwatch) elapsed reading with no
// `targetSplit` at all — the same state `log-detail.png` also
// demonstrates via the stored door, here reached through the live one.
//
// Phase LT spec 1, Task 4 (PM final-PR gate condition C1, 2026-08-19): until
// this task, this was still the ONLY committed picture of the LIVE door
// with ZERO judged rows — the TARGET/SPM cells rendered, but the blue/red-
// vs-target judgment (the exact feature James's bug report was about) never
// once appeared here, only on the STORED `log-detail.png` door. THREE new
// distance work phases (ref `6k`, target 122.0 s/500m —
// `SCREENSHOT_BASELINES.k6Seconds`) now sit between the unchanged
// prescribed/abstained rows, each recorded via `recordDistanceActual`
// above rather than a real multi-minute wait: a JUDGED FASTER row (actual
// split 112.0, dev −10.0), a JUDGED SLOWER row (actual split 132.0, dev
// +10.0), and an ON-TARGET row (actual split 122.0, dev 0.0, inside
// `judgeBand.ts`'s ±0.5s band) — the same three-state mix `log-detail.png`
// already proved on the stored door, now proved live too. Six phases total
// (was three): every "STEP N OF 3" below became "STEP N OF 6".
test("post-workout-summary", async ({ page }) => {
  // Three real-elapsed distance waits now (the warm-up below, plus the
  // "100m max" work phase already in the fixture) push this comfortably
  // past Playwright's 30s default — same reasoning as
  // `e2e/connected.spec.ts`'s/`design.spec.ts`'s own `test.setTimeout`
  // calls for a multi-real-wait flow. The three new judged/on-target rows
  // add no further REAL waiting (`recordDistanceActual` rewinds instead of
  // waiting), just a few extra reload/expect round trips.
  test.setTimeout(120_000);
  const title = "Screenshot Post Workout Summary Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-post-workout-summary@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await setWarmup(page, { kind: "distance", meters: 100 });
  // Warm-up (100m, distance) — same real-elapsed-then-NEXT shape as the
  // "100m max" work phase below — then the tiny time-phase-then-distance-
  // phase pair (e2e/session.spec.ts's own completion test): the time
  // phase auto-advances in ~3s, then the distance phase's actual gets
  // recorded on NEXT, producing the committed capture's own real,
  // non-dash measured rows. The MAX piece carries an authored rate too
  // (`@22`, bulk grammar's spm token, independent of ref kind — Task 1's
  // own confirmed syntax) — the abstained effort row's own SPM cell then
  // renders TARGET-ONLY quiet (`buildSpmCell`: `actualSpm` is
  // monitor-only, so a stopwatch-sourced row's authored rate is all it
  // can ever show), the one SPM shape `log-detail.png` doesn't carry.
  await importBulk(
    page,
    [
      `${title} | AN | easy | 1`,
      "w 0:03 6k",
      // Task 4's three new distance work phases — all against the SAME
      // "6k" ref (target 122.0 s/500m, `SCREENSHOT_BASELINES.k6Seconds`)
      // so every judged/on-target row below is checkable against the ONE
      // TARGET number the fixture ever authors: "2:02.0".
      "w 2000m 6k",
      "w 2000m 6k",
      "w 6000m 6k",
      "w 100m max @22",
    ].join("\n"),
  );
  await startFromLibrary(page, title);
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
  await expect(page.getByText(/^STEP 1 OF 6 · WARM-UP/)).toBeVisible();
  // A DISTANCE warm-up is priced too (`session/engine.ts`'s
  // `warmupPhases`: `estimationSplit(baselines, {effort: "min"})`, "MIN"
  // effort — SCREENSHOT_BASELINES' own k6Seconds 122.0 + 20 = 142.0
  // s/500m), so it is JUST as suspect-bounded as any other distance
  // phase (`isSuspectActual`, Timer.tsx): 100m prices at (100/500)×142.0
  // = 28.4s, non-suspect window 14.2s-56.8s. Landing NEXT around 20s in
  // (the same value, and the same "land centered" reasoning, as the
  // "100m max" work phase below) sits safely inside it.
  await page.waitForTimeout(20_000);
  await page.getByRole("button", { name: "NEXT →" }).click();
  await expect(page.getByText(/^STEP 2 OF 6/)).toBeVisible();
  await expect(page.getByText("STEP 3 OF 6 · WORK · 2000M")).toBeVisible({
    timeout: 6000,
  });
  // JUDGED FASTER (Task 4, PM condition C1): `phaseSeconds` prices this
  // 2000m/6k phase at (2000/500)×122.0 = 488.0s, non-suspect window
  // 244.0s-976.0s. Rewinding to a precise 448.0s elapsed
  // (`448 = 112.0 × 2000 / 500`) lands a real actual split of 112.0 —
  // −10.0 against the 122.0 target, well outside `judgeBand.ts`'s ±0.5s
  // on-target band. The 2000m/500m = 0.25 jitter factor between this
  // rewind's reload and the NEXT click below would need over 2 real
  // seconds of drift to visibly move this row off "about −10"; the STEP
  // re-check right after the rewind bounds that drift to well under one.
  await recordDistanceActual(page, 448);
  await expect(page.getByText("STEP 3 OF 6 · WORK · 2000M")).toBeVisible();
  await page.getByRole("button", { name: "NEXT →" }).click();
  await expect(page.getByText("STEP 4 OF 6 · WORK · 2000M")).toBeVisible();
  // JUDGED SLOWER: the mirror image — 528.0s elapsed
  // (`528 = 132.0 × 2000 / 500`) lands an actual split of 132.0, +10.0.
  await recordDistanceActual(page, 528);
  await expect(page.getByText("STEP 4 OF 6 · WORK · 2000M")).toBeVisible();
  await page.getByRole("button", { name: "NEXT →" }).click();
  await expect(page.getByText("STEP 5 OF 6 · WORK · 6000M")).toBeVisible();
  // ON-TARGET: a bigger phase (6000m, not 2000m) buys headroom against the
  // same reload/click jitter — the 500/6000 = 0.083 factor is a third of
  // the two rows above's own 0.25, so the same real-world drift that
  // safely clears ±10.0 by a wide margin still lands this row's actual
  // split inside `judgeBand.ts`'s tight ±0.5s band: 1464.0s elapsed
  // (`1464 = 122.0 × 6000 / 500`) targets an actual split of exactly
  // 122.0, dev 0.0.
  await recordDistanceActual(page, 1464);
  await expect(page.getByText("STEP 5 OF 6 · WORK · 6000M")).toBeVisible();
  await page.getByRole("button", { name: "NEXT →" }).click();
  await expect(page.getByText("STEP 6 OF 6 · WORK · 100M")).toBeVisible({
    timeout: 6000,
  });
  // Landing NEXT around 20s in sits safely inside Timer.tsx's own
  // non-suspect window (11.2s-44.8s), the same "land centered, not at
  // either edge" reasoning e2e/session.spec.ts's own completion test
  // documents for its own (smaller) baseline pair.
  await page.waitForTimeout(20_000);
  await page.getByRole("button", { name: "NEXT →" }).click();
  await expect(page.getByText("Finish this session?")).toBeVisible();
  await page.getByRole("button", { name: "Finish session" }).click();
  // Post-workout-summary spec §3: the finish stage navigates straight to
  // the summary — no intermediate SessionComplete/"Log this session" hop.
  await expect(page).toHaveURL(/\/session\/log$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const rows = page.locator(".summary-row");
  await expect(rows).toHaveCount(6);
  const warmupRow = page.locator(".summary-row-warmup");
  await expect(warmupRow).toHaveCount(1);
  await expect(warmupRow.locator(".summary-row-time")).not.toBeEmpty();
  await expect(warmupRow.locator(".summary-row-pace")).not.toBeEmpty();
  await expect(rows.last().locator(".summary-row-pace")).not.toBeEmpty();
  // JUDGED FASTER/SLOWER (Task 4, PM condition C1): the live door's first
  // ever committed judged rows — the actual `.summary-row-pace`/
  // `.summary-row-bar` carry the SAME `summary-row-faster`/
  // `summary-row-slower` color class the stored `log-detail.png` door's
  // own rows do (`PostWorkoutSummary.tsx`'s `judgedColorClass`), proving
  // the live door renders the feature's color, not just its TARGET/SPM
  // cells. `.summary-row-dev`'s exact magnitude is left to a range (real
  // browser timing, not a POSTed literal, feeds this row) but the SIGN and
  // ".0"-precision format are pinned — recurring failure #7's own
  // "invoke it and assert the consequence" rule, applied to a live capture
  // rather than a unit test.
  const fasterRow = rows.nth(2);
  await expect(fasterRow.locator(".summary-row-target")).toHaveText("2:02.0");
  await expect(fasterRow.locator(".summary-row-pace")).toHaveClass(
    /summary-row-faster/,
  );
  await expect(
    fasterRow.locator(".summary-row-bar-track .summary-row-bar"),
  ).toHaveClass(/summary-row-faster/);
  await expect(fasterRow.locator(".summary-row-dev")).toHaveText(/^−\d+\.\d$/);
  const slowerRow = rows.nth(3);
  await expect(slowerRow.locator(".summary-row-target")).toHaveText("2:02.0");
  await expect(slowerRow.locator(".summary-row-pace")).toHaveClass(
    /summary-row-slower/,
  );
  await expect(
    slowerRow.locator(".summary-row-bar-track .summary-row-bar"),
  ).toHaveClass(/summary-row-slower/);
  await expect(slowerRow.locator(".summary-row-dev")).toHaveText(/^\+\d+\.\d$/);
  // ON-TARGET: plain ink, no bar, no ± label — the third state
  // `judgeBand.ts` produces, sitting right beside the two colored ones.
  const onTargetRow = rows.nth(4);
  await expect(onTargetRow.locator(".summary-row-target")).toHaveText("2:02.0");
  await expect(onTargetRow.locator(".summary-row-dev")).toHaveText("");
  await expect(
    onTargetRow.locator(".summary-row-bar-track .summary-row-bar"),
  ).toHaveCount(0);
  await expect(onTargetRow.locator(".summary-row-pace")).not.toHaveClass(
    /summary-row-faster|summary-row-slower/,
  );
  // The abstained effort row (the "100m max @22" phase, `rows.last()`): a
  // real elapsed reading, no TARGET cell at all, but a real TARGET-ONLY
  // quiet SPM cell (its own authored rate, `@22` — no measured half, a
  // stopwatch-sourced row never gets `actualSpm`).
  await expect(rows.last().locator(".summary-row-target")).toHaveText("");
  await expect(rows.last().locator(".summary-row-spm")).toHaveText("/ 22");
  await expect(
    rows.last().locator(".summary-row-spm .summary-row-spm-target"),
  ).toHaveText("/ 22");
  // The "0:03 @ 6k" phase's own row: still PRESCRIBED (the negative
  // check this comment block's own header names) — index/duration/
  // target-pace/offset/dash, no `.summary-row-spm` at all (that class
  // only exists on the MEASURED branch of `IntervalRow`).
  const prescribedRow = rows.nth(1);
  await expect(prescribedRow.locator(".summary-row-target")).toHaveText(
    "2:02.0",
  );
  await expect(prescribedRow.locator(".summary-row-spm")).toHaveCount(0);
  await expect(prescribedRow.locator(".summary-row-dash")).toHaveText("—");

  // Realistic, non-empty state (CLAUDE.md's own "screenshots that capture
  // empty states" rule): a real Held answer, pain level, and note, not the
  // screen's own just-opened blank form.
  await page.getByRole("button", { name: "HELD" }).click();
  await page.getByRole("button", { name: "Pain 2" }).click();
  await page.getByLabel("NOTES").fill("Felt strong.");

  // Task 4: six rows plus the reflection card no longer fit the 390×844
  // viewport this file's other captures use unscrolled — `fullPage: true`
  // (no `.tabbar`/other fixed element on `/session/log`, so no stitching
  // artifact to guard against — see `neutralizeFixedTabBarForFullPageCapture`
  // above for the case where one exists) keeps the hero AND every row in
  // the ONE committed image, which recurring failure #7's own sharpened
  // rule needs: a reviewer must be able to recompute the hero from the
  // rows without a second capture.
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "post-workout-summary.png"),
    fullPage: true,
  });
  await cleanupByTitle(page, title);
});

// Task 3 (ui-fix round): the Discard block (rule + button) pushed this
// screen's landscape content past its own tight budget — index.css's
// landscape media query was retuned to fit it; this capture is the visual
// record of that fit, same idiom as "timer-landscape" above.
test("post-workout-summary-landscape", async ({ page }) => {
  const title = "Screenshot Post Workout Summary Landscape Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-post-workout-summary-landscape@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await importBulk(
    page,
    [`${title} | AN | easy | 1`, "w 0:03 6k", "w 100m max"].join("\n"),
  );
  await startFromLibrary(page, title);
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
  await expect(page.getByText(/^STEP 1 OF 2/)).toBeVisible();
  await expect(page.getByText("STEP 2 OF 2 · WORK · 100M")).toBeVisible({
    timeout: 6000,
  });
  await page.waitForTimeout(20_000);
  await page.getByRole("button", { name: "NEXT →" }).click();
  await expect(page.getByText("Finish this session?")).toBeVisible();
  await page.getByRole("button", { name: "Finish session" }).click();
  await expect(page).toHaveURL(/\/session\/log$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  // The handoff's own landscape reference frame.
  await page.setViewportSize({ width: 844, height: 420 });
  await expect(
    page.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "post-workout-summary-landscape.png"),
  });
  await cleanupByTitle(page, title);
});

// From-the-log spec (2026-08-18), Task 4: the history list (`/today/log`).
// POSTs session logs directly (a real in-page fetch, same idiom as the
// `neutralizeGlobalRecency`/`logOnce` helpers `today.spec.ts` uses) rather
// than running real timer sessions — this screen renders server rows, not
// live session state, so seeding it directly is both faster and closer to
// what the screen actually reads.
async function postLog(
  page: Page,
  body: {
    workoutTitle: string;
    workoutType: string;
    held?: "held" | "under" | "over" | null;
    pain?: number | null;
    thumbs?: "up" | "down" | null;
    notes?: string | null;
    avgSplitSeconds?: number | null;
    distanceMeters?: number | null;
    timeSeconds?: number | null;
    // Phase LT spec 1, Task 3: §5A's own source-inference table reads
    // `deviceName` first — a pm5-sourced `steps` entry with no
    // `deviceName` here reads as door-ambiguous ("LOGGED BY HAND"), NOT
    // as a monitor row, so a capture wanting a genuinely pm5-attributed
    // session must set this explicitly.
    deviceName?: string | null;
    // Task 5's own "log-detail" capture: real measured/judged rows and,
    // via `advancesPlan` below, genuine plan linkage — both need fields
    // this helper's original narrower signature (§5G's own hero-snippet
    // capture, Task 4) never had to pass.
    advancesPlan?: boolean;
    steps?: {
      label: string;
      targetSplit?: number;
      actualSplit?: number;
      actualSource?: "assumed" | "stopwatch" | "pm5";
      meters?: number;
      seconds?: number;
      // Phase LT spec 1, Task 3: the pm5-only pair — a pm5-sourced step's
      // own elapsed reading (`storedSummary.ts`'s `measuredElapsedSeconds`
      // reads THIS field for a pm5 row, never `actualSplit × meters ÷
      // 500` the way a stopwatch row does) and the measured/target stroke
      // rate split (`spm` = target on every door, `actualSpm` = measured,
      // monitor-only — §2's own overload fix).
      actualSeconds?: number;
      spm?: number;
      actualSpm?: number;
    }[];
    // Trace-rendering spec (Phase LT spec 3), Task 3: the stored door's
    // own source. This helper already builds every OTHER field by hand
    // (steps, hero numbers) for the same reason a live timer run isn't
    // used here — `log-detail` needs precise, hand-checkable per-row
    // numbers a real session can't cheaply reproduce; `series` follows
    // the identical convention rather than routing this already-direct-
    // POST fixture through a live monitor session it was never built to
    // use.
    series?: {
      samples: { t: number; d: number; p: number; spm: number; hr?: number }[];
    };
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

// Trace-rendering spec (Phase LT spec 3), Task 3: `log-detail`'s own
// series — one continuous line (2 s cadence, under the 3 s gap-break
// threshold) tracking the SAME four WORK rows that test's own big header
// comment already hand-checks (120/140/118/100 s per 500m, in that
// order), so the drawn shape and the row numbers agree in the same
// frame (recurring failure #7, sharpened). `d` is an arbitrary monotonic
// filler — nothing in the chart reads it (Task 2's own `traceModel.ts`
// never touches `Sample.d`) — and the small jitter keeps the WORK line
// honest (a real trace is never perfectly flat, `traceModel.ts`'s own
// "noise is shown, not smoothed" rule). No `hr` on any row's own stored
// fields, so this series invents a plausible climbing 130->158 bpm
// independently rather than pretending a number this fixture never
// measured.
// FIXTURE HONESTY (final review, 2026-08-19): this series is HAND-BUILT to
// track log-detail's own four hand-built row actuals, and its WORK pace
// jitters by about a second per 500m. A real device trace does not look
// like this — the committed captures swing by double digits sample to
// sample and carry a ~26% share of zero-pace sentinels (see
// `traceModel.test.ts`, which replays them). The capture is honest about
// the chart's SHAPE and placement; it is not, and must never be cited as,
// a picture of what real WORK data looks like. The `log-monitor` capture
// beside it comes from a genuine recorder replay and is the representative
// one for that.
// REST REALISM (rest-scale round, PM correction 2026-08-20): the rest
// window's own pace is NOT derived from the surrounding segment any more
// — round 1 of this fixture reused `seg.pace` unchanged during the rest,
// which made the domain-exclusion fix invisible in this exact capture
// (the rest sat at the SAME value as its own segment's work, so excluding
// it moved nothing). `restPace()` below is calibrated off James's own
// 2026-08-20 session (work ~2:02-2:04/500m, rests wandering around 3:20
// with excursions past 5:00): it wanders from 200s (3:20) at the rest
// window's own edges up to 310s (5:10) at its midpoint — materially
// slower than every WORK row in this fixture (max 140s/500m), so this
// capture now actually exercises the fix it is meant to demonstrate: a
// domain that excluded the rest would top out near the WORK max (140s);
// one that still counted it would top out past 300s. `traceModel.test.ts`
// pins the equivalent assertion numerically; this fixture is what makes
// it visible in a screenshot.
// trace-truth Task 2 review (I-2): a run inside segment 2 (WORK pace
// 140 s/500m, rest pace 200-310s/500m, t 180..210s) is marked `r: true`
// — the ONLY committed capture that shows the rest tint at all
// (`log-monitor`'s own fake program carries no rest; see that fixture's
// own comment). Placed mid-segment, not at a row boundary — this chart
// draws no boundary marks (§4) and the rest band's own position is
// independent of the four rows' own split points.
const REST_WINDOW: readonly [number, number] = [180, 210];
/** Rest-scale round (2026-08-20): a wandering, materially-slower-than-work
 *  pace for samples inside `REST_WINDOW` — see "REST REALISM" above for
 *  the calibration and why this can no longer just reuse `seg.pace`.
 *  Triangular: 200s (3:20) at the window's own edges, peaking at 310s
 *  (5:10, past James's own observed 5:00 excursions) at its midpoint. */
function restPace(t: number): number {
  const span = REST_WINDOW[1] - REST_WINDOW[0];
  const pos = (t - REST_WINDOW[0]) / span; // 0 at the start edge, 1 at the end edge
  const shape = 1 - Math.abs(pos - 0.5) * 2; // 0 at either edge, 1 at the midpoint
  return Math.round(200 + 110 * shape);
}
function buildLogDetailSeries(): {
  samples: {
    t: number;
    d: number;
    p: number;
    spm: number;
    hr: number;
    r?: true;
  }[];
} {
  const segments = [
    { end: 120, pace: 120, spm: 24 },
    { end: 260, pace: 140, spm: 26 },
    { end: 378, pace: 118, spm: 24 },
    { end: 478, pace: 100, spm: 28 },
  ];
  const samples: {
    t: number;
    d: number;
    p: number;
    spm: number;
    hr: number;
    r?: true;
  }[] = [];
  for (let t = 0; t <= 478; t += 2) {
    const seg =
      segments.find((s) => t < s.end) ?? segments[segments.length - 1]!;
    const jitter = t % 4 === 0 ? -1 : 1;
    const resting = t >= REST_WINDOW[0] && t <= REST_WINDOW[1];
    const workPace = seg.pace + jitter;
    samples.push({
      t: t * 10,
      d: t * 4,
      p: (resting ? restPace(t) : workPace) * 10,
      spm: seg.spm + (t % 6 === 0 ? -1 : 0),
      hr: 130 + Math.round((t / 478) * 28),
      ...(resting ? { r: true as const } : {}),
    });
  }
  return { samples };
}

// Exit criterion 2's own fixture, verbatim: the frozen v0.11.0 body shape
// (no hero keys at all — server/routes/data.test.ts's own
// `V0_11_0_LOG_BODY`) — the capture's null-hero row is the SAME shape a
// pre-spec-2 client actually sent, not a hand-simulated null.
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

// §5G: the row idiom plus the hero snippet, four real sessions (recurring
// failure #7's own floor) including one null-hero old row (exit criterion
// 2's own v0.11.0 shape) — the screen's whole point is showing a rower
// their real history, so an empty or single-row capture would show
// nothing this task actually built.
test("log-history", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-log-history@e2e.test",
    name: "Screenshot Tester",
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
  await postLog(page, {
    workoutTitle: "Occluded Front",
    workoutType: "AT",
    held: "under",
    pain: 1,
    avgSplitSeconds: 118.2,
    distanceMeters: 6200,
  });
  await postLog(page, {
    workoutTitle: "Pressure Ridge",
    workoutType: "TR",
    held: "over",
    pain: 3,
    avgSplitSeconds: 132.7,
    distanceMeters: 4500,
  });

  await page.goto("/today/log");
  await expect(page.locator(".today-log-row")).toHaveCount(4);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "log-history.png"),
  });
});

// Task 5: the from-the-log detail view (/today/log/:id) — a real saved
// row (via the real POST route, `advancesPlan: true` over a chosen+reset
// plan so linkage is genuinely stamped by the server's own atomic upsert,
// not faked client-side) reopened through the real UI: heroes, all four
// reflection fields answered (the read-back, not the just-opened blank
// form), and the plan footer all on one screen.
//
// Phase LT spec 1, Task 3 (2026-08-18): the row list is the spec's own
// mixed set — every §1/§2 state in one capture, precisely, via the
// direct-POST recipe (zero real-time/timing dependence, unlike a live
// timer run): a JUDGED FASTER row, a JUDGED SLOWER row, an ON-TARGET row
// (dead-even — 0s deviation, inside the ±0.5s band per `judgeBand.ts`),
// and an ABSTAINED EFFORT row (no `targetSplit` at all — a MAX piece).
// The SPM cell rides along on three of the four rows, each demonstrating
// a DIFFERENT §2 shape: row 1/2 the modern both-halves cell
// (`actualSpm`+`spm`), row 3 the OLD pre-split shape (`spm` holds the
// measured value, no `actualSpm` key at all — exit criterion 3's own
// discriminant, rendered as measured-only with no target half), row 4
// the modern measured-only cell (a MAX piece's own real rate, no
// authored target to show beside it).
//
// Recurring failure #7, sharpened: every number below is hand-checkable
// on the committed capture. All four rows are 500m each (2,000 m total,
// matching DISTANCE) with `actualSeconds` set to the row's own
// `actualSplit` (a 500m piece's elapsed time and its split ARE the same
// number) — total elapsed 120+140+118+100 = 478s, so AVG SPLIT
// (`500 × Σt/Σd`) is EXACTLY `500 × 478/2000` = 119.5 = "1:59.5", and TIME
// is the same 478s sum = "7:58". Each row's own judgment is likewise
// checkable against its inline TARGET: row 1 120 vs 130 = −10.0 (faster,
// outside the band); row 2 140 vs 130 = +10.0 (slower); row 3 118 vs 118
// = 0.0 (inside ±0.5s, plain ink, no bar); row 4 has no TARGET cell at
// all, so nothing to check it against.
test("log-detail", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-log-detail@e2e.test",
    name: "Screenshot Tester",
  });
  await choosePlan(page, "sprint");
  await resetPlanProgress(page);
  await postLog(page, {
    workoutTitle: "Sea Fret",
    workoutType: "O2",
    // Every step below is pm5-sourced — a real device name is what makes
    // §5A's source inference read this row as a monitor session rather
    // than door-ambiguous "LOGGED BY HAND".
    deviceName: "PM5 432331249",
    held: "under",
    pain: 3,
    thumbs: "up",
    notes: "Held on through the back half.",
    avgSplitSeconds: 119.5,
    timeSeconds: 478,
    distanceMeters: 2000,
    advancesPlan: true,
    steps: [
      {
        label: "2:00 @ 2k",
        targetSplit: 130,
        actualSplit: 120,
        actualSeconds: 120,
        actualSource: "pm5",
        meters: 500,
        actualSpm: 24,
        spm: 22,
      },
      {
        label: "2:20 @ 2k",
        targetSplit: 130,
        actualSplit: 140,
        actualSeconds: 140,
        actualSource: "pm5",
        meters: 500,
        actualSpm: 26,
        spm: 22,
      },
      {
        label: "1:58 @ 6k",
        targetSplit: 118,
        actualSplit: 118,
        actualSeconds: 118,
        actualSource: "pm5",
        meters: 500,
        // No `actualSpm` key at all — the pre-split shape: `spm` holds
        // the OLD measured value (exit criterion 3's own row-local
        // discriminant, `spmIsMeasured`).
        spm: 24,
      },
      {
        label: "1:40 @ MAX",
        // No targetSplit — a pure-effort piece, the abstained row.
        actualSplit: 100,
        actualSeconds: 100,
        actualSource: "pm5",
        meters: 500,
        actualSpm: 28,
      },
    ],
    // Trace-rendering spec (Phase LT spec 3), Task 3: the row's own
    // trace — `buildLogDetailSeries`'s own header comment names the
    // exact correspondence to the four rows above.
    series: buildLogDetailSeries(),
  });

  await page.goto("/today/log");
  const row = page.locator(".today-log-row").filter({ hasText: "Sea Fret" });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/today\/log\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
  await expect(page.getByText("AVG SPLIT")).toBeVisible();
  await expect(page.getByText("1:59.5")).toBeVisible();
  await expect(
    page.getByText("UNDER · FASTER · PAIN 3/5 · LIKED"),
  ).toBeVisible();
  await expect(page.getByText("Held on through the back half.")).toBeVisible();
  await expect(
    page.getByText("Logged to Sprint (2k) Prep · SESSION 1 OF 84"),
  ).toBeVisible();
  // §1/§2's mixed set, each state asserted structurally (not just "the
  // page contains the number somewhere" — a faster row's own dev label
  // could otherwise coincidentally match a slower row's if the fixture
  // numbers weren't distinct, which is why they are).
  const rows = page.locator(".summary-row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0).locator(".summary-row-target")).toHaveText("2:10.0");
  await expect(rows.nth(0).locator(".summary-row-dev")).toHaveText("−10.0");
  await expect(rows.nth(0).locator(".summary-row-spm")).toHaveText("24 / 22");
  await expect(rows.nth(1).locator(".summary-row-dev")).toHaveText("+10.0");
  await expect(rows.nth(1).locator(".summary-row-spm")).toHaveText("26 / 22");
  // Row 3: ON TARGET — plain ink, no bar, no ± label, but the OLD-shape
  // SPM cell still renders (measured-only, no target half).
  await expect(rows.nth(2).locator(".summary-row-dev")).toHaveText("");
  await expect(rows.nth(2).locator(".summary-row-bar")).toHaveCount(0);
  await expect(rows.nth(2).locator(".summary-row-spm")).toHaveText("24");
  await expect(rows.nth(2).locator(".summary-row-pace")).not.toHaveClass(
    /summary-row-faster|summary-row-slower/,
  );
  // Row 4: the abstained effort row — no TARGET cell, no dev, but a real
  // measured-only SPM cell (its own real rate, no authored target).
  await expect(rows.nth(3).locator(".summary-row-target")).toHaveText("");
  await expect(rows.nth(3).locator(".summary-row-dev")).toHaveText("");
  await expect(rows.nth(3).locator(".summary-row-spm")).toHaveText("28");

  // Trace-rendering spec (Phase LT spec 3), Task 3: the chart itself,
  // below the intervals list — real, not the absence case (the row
  // above carries a `series`).
  await expect(page.locator(".trace-figure")).toBeVisible();
  await expect(page.locator(".trace-line").first()).toBeVisible();
  // Rest-scale round (PM correction, 2026-08-20): the assertion that
  // proves the domain-exclusion fix on the EXACT data the screenshot
  // above shows, not just a synthetic fixture in traceModel.test.ts.
  // `buildLogDetailSeries`'s rest window now wanders 200-310s/500m
  // (`restPace()`, materially slower than every WORK row here, whose
  // slowest is row 2 at 140 s/500m) — under the OLD rule (domain from
  // ALL real readings) the y-axis's slow edge would have to reach past
  // 300s to cover it; under the fix (domain from WORK readings only)
  // it stays anchored to the WORK range. Reading the actual rendered
  // tick labels, not re-deriving the domain by hand, so this is
  // red-provable by reverting the domain-exclusion fix alone.
  const yTickTexts = await page
    .locator(".trace-tick-label-y")
    .allTextContents();
  expect(yTickTexts.length).toBeGreaterThan(0);
  const yTickSeconds = yTickTexts.map((text) => {
    const m = text.match(/^(\d+):(\d\d)\.(\d)$/);
    if (!m) throw new Error(`unparsed y-axis tick label "${text}"`);
    return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 10;
  });
  const slowestTickSeconds = Math.max(...yTickSeconds);
  // Nowhere near the rest excursion's own 200-310s range — proves the
  // rest did NOT set the scale.
  expect(slowestTickSeconds).toBeLessThan(200);
  // Still covers the slowest WORK row (140 s/500m) with real padding —
  // proves the fix didn't just clamp the axis arbitrarily tight either.
  expect(slowestTickSeconds).toBeGreaterThanOrEqual(140);

  // R3-1 (review round 3): a viewport-only capture cropped out the
  // chart's own `.trace-legend` ("BAND = REST", F-2, round 4 wording) — the identical
  // shape as I-2 (a committed capture that doesn't show the element the
  // round added), one element later. First attempt copied `builder.png`'s
  // `fullPage: true` + `neutralizeFixedTabBarForFullPageCapture` verbatim
  // and it LOOKED fixed (the legend became visible) — but measurement
  // against the real stack proved that was luck, not the mechanism:
  // this route (`FromTheLog.tsx`) renders inside `.overlay-screen`
  // (`position: fixed`, its OWN internal `overflow-y: auto`), which
  // `fullPage: true` cannot see past (Playwright measures `document`'s
  // own scrollable size, and a fixed element contributes nothing to
  // it) — the legend was landing on the LAST pixel row of the capture,
  // genuinely clipped, only reachable at all because neutralizing the
  // tabbar freed the ~45px it used to visually cover. The tabbar
  // neutralize is still correct (it frees that real space), but the fix
  // that actually matters is scrolling the ELEMENT that owns the
  // overflow — `scrollTraceChartIntoFrame` (above) now detects
  // `.overlay-screen` and scrolls IT instead of `window`.
  await neutralizeFixedTabBarForFullPageCapture(page);
  await scrollTraceChartIntoFrame(page);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "log-detail.png"),
  });
});

// Log-delete spec (2026-08-18) Task 2's own capture: the staged confirm
// panel, seeded with a genuine plan-linked session (same real-POST,
// `advancesPlan: true` recipe as "log-detail" above — linkage stamped by
// the server's own atomic upsert, not faked client-side), so the LINKED
// copy (the hedge, "if it is your latest plan session, the checkmark
// un-ticks.") is the one actually on screen, not the no-linkage string.
test("log-delete-confirm", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-log-delete-confirm@e2e.test",
    name: "Screenshot Tester",
  });
  await choosePlan(page, "sprint");
  await resetPlanProgress(page);
  await postLog(page, {
    workoutTitle: "Sea Fret",
    workoutType: "O2",
    held: "under",
    pain: 3,
    thumbs: "up",
    notes: "Held on through the back half.",
    avgSplitSeconds: 130,
    timeSeconds: 780,
    distanceMeters: 3000,
    advancesPlan: true,
    steps: [
      {
        label: "6:00 @ 6k",
        targetSplit: 130,
        actualSplit: 120,
        actualSource: "stopwatch",
        meters: 1500,
      },
      {
        label: "6:00 @ 6k",
        targetSplit: 130,
        actualSplit: 140,
        actualSource: "stopwatch",
        meters: 1500,
      },
    ],
  });

  await page.goto("/today/log");
  const row = page.locator(".today-log-row").filter({ hasText: "Sea Fret" });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/today\/log\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
  await expect(
    page.getByText("Logged to Sprint (2k) Prep · SESSION 1 OF 84"),
  ).toBeVisible();

  // First tap stages — the trigger is replaced by the consequence copy
  // and the Cancel/Delete session pair, still on the detail view.
  await page.getByRole("button", { name: "Delete session" }).click();
  await expect(
    page.getByText(
      "This removes the session and its reflection. If it is your latest plan session, the checkmark un-ticks.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "log-delete-confirm.png"),
  });
});

// PM final-PR gate, condition 3: the detail screen's OTHER install-day
// reality — a row saved in the frozen pre-update body shape
// (`postV0110Log`, byte-identical to server/routes/data.test.ts's own
// `V0_11_0_LOG_BODY`: no avgSplitSeconds/timeSeconds/distanceMeters keys
// on the wire at all). This is the state 100% of the tester's existing
// corpus renders in on install day, and `log-detail.png` above never
// shows it — every hero was populated there. Load-bearing per recurring
// failure #7: `.summary-heroes` must be ABSENT entirely (not present-but-
// empty, not dashes) — `SummaryHeroesBlock`'s own "every hero undefined
// → return null" gate (PostWorkoutSummary.tsx) — while the row and the
// reflection read-back (`held: "held", pain: 2`, no thumbs/notes) render
// exactly as they do for a current-shape log.
test("log-detail-legacy", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-log-detail-legacy@e2e.test",
    name: "Screenshot Tester",
  });
  await postV0110Log(page, "Steady State");

  await page.goto("/today/log");
  const row = page
    .locator(".today-log-row")
    .filter({ hasText: "Steady State" });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/today\/log\/[^/]+$/);
  await expect(
    page.getByRole("heading", { name: "Steady State" }),
  ).toBeVisible();

  // The load-bearing assertion: no hero block at all.
  await expect(page.locator(".summary-heroes")).toHaveCount(0);
  await expect(page.getByText("AVG SPLIT")).toHaveCount(0);

  // Rows + reflection read-back still render (storedSummary.ts's
  // buildReadBack: HELD_READBACK_LABEL.held + "PAIN 2/5").
  await expect(page.locator(".summary-row-list .summary-row")).toHaveCount(1);
  await expect(page.getByText("HELD · PAIN 2/5")).toBeVisible();

  // Trace-rendering spec (Phase LT spec 3), Task 3, §1's own ABSENT case:
  // a pre-spec-2 row (this fixture's whole point, `postV0110Log`'s own
  // header) has no `series` at all — no chart, no empty frame.
  await expect(page.locator(".trace-figure")).toHaveCount(0);

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "log-detail-legacy.png"),
  });
});

// Phase 6C Task 4, rebuilt on PostWorkoutSummary by Phase PW Task 5: the
// summary's OTHER door (Task 3, `/library/:id/log`) — visibly distinct from
// the session door above (no tab-bar hiding, no hero block, reached
// straight from a workout's detail screen rather than the timer's own
// hand-off), so per the plan's own "both doors if visibly distinct" clause
// this gets its own capture too. Same single-base "6k" shape and
// SCREENSHOT_BASELINES pairing as the session door's capture, so the two
// images read as the same product's two doors, not two different products
// — and no real timer run is needed at all here, so this test needs none
// of that one's extended timeout.
//
// LT-0 (2026-08-18-target-truth-design.md §3): this door used to be the
// app's only discard-less save surface ("no Discard button at all" — the
// old comment right below this one) — it now HAS one, same idiom as the
// other two doors, so this capture now shows it too.
//
// Today enhancements (Task 4), rewired by post-workout-summary spec §2F: a
// plan is chosen here too, specifically so this capture also shows the
// save stack's plan position (Log against plan · SESSION N OF N) — no
// screenshot fixture ever activated a plan on this screen before this, so
// the position had never appeared in a committed capture at all. Left in
// its default (Log against plan LEADS) state rather than the onboarding
// swap; that state is covered instead by design.spec.ts's own dedicated
// sweep.
test("post-workout-summary-manual", async ({ page }) => {
  const title = "Screenshot Post Workout Summary Manual Workout";
  await signInViaBackdoor(page, {
    email: "screenshots-post-workout-summary-manual@e2e.test",
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  await choosePlan(page, "sprint");
  await resetPlanProgress(page);
  await importBulk(
    page,
    [`${title} | AT | medium | 3`, "w 1:00 6k"].join("\n"),
  );
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("link", { name: "Log it after" }).click();
  await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  // Same 6K value as the session door's own capture (SCREENSHOT_BASELINES'
  // k6Seconds, 122.0 -> "2:02.0") — the manual door reads CURRENT baselines
  // directly (the lock moment IS save time, Task 3's brief).
  await expect(page.getByText("PACES OFF 6K 2:02.0")).toBeVisible();
  // LT-0: Discard now renders here too — same button, same idiom as the
  // session/monitor doors' own captures.
  await expect(
    page.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
  ).toBeVisible();
  // The save stack's plan position, default state — a plan is active for
  // this fixture now.
  await expect(
    page.getByRole("button", { name: "Log against plan · SESSION 1 OF 84" }),
  ).toBeVisible();

  // Realistic, non-empty state (CLAUDE.md's own "no empty-state screenshots"
  // rule), same values as the session door's own capture for a fair visual
  // comparison between the two doors.
  await page.getByRole("button", { name: "HELD" }).click();
  await page.getByRole("button", { name: "Pain 2" }).click();
  await page
    .getByLabel("NOTES")
    .fill("Rowed at the gym, logging it after the fact.");

  // LT-0: this capture exists specifically to show the new Discard button
  // (the visible fix — the app's last discard-less save surface gained
  // one). A plain, non-fullPage `page.screenshot()` at this fixed mobile
  // viewport only shows the fold, and the reflection card + one interval
  // row push the save stack's Discard past the bottom edge (the session
  // door's own sibling capture, `post-workout-summary.png`, has the exact
  // same pre-existing crop — its own Discard has never been in frame
  // either) — scroll it into view so THIS capture's whole reason for
  // existing is actually visible in the committed image, not merely
  // present in the DOM.
  await page
    .getByRole("button", { name: "DISCARD WITHOUT SAVING" })
    .scrollIntoViewIfNeeded();

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "post-workout-summary-manual.png"),
  });
  await cleanupByTitle(page, title);
});

// Phase 6H Task 7: News + Reader. Mixed read state seeded by actually
// opening an article through the UI (click the row, wait for the reader,
// go BACK) rather than a direct API PUT — recurring-failure #7's own
// lesson ("seed real data, then open the image and look at it") extends
// here to "seed it the way a rower actually would," so the capture is
// honest about what marks something read, not just about what the read
// state ends up looking like.
//
// News-polish round: the read article is now workout-types, not baselines —
// it's the pinned row carrying the type chips (.news-row-chips), so this
// capture shows that read-state treatment applied to the one row that also
// visibly differs from an unread row in a second way (the chip strip is
// rendered regardless of read state, but this keeps the two captures below
// pointed at the same article throughout the flow).
test("news", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-news@e2e.test",
    name: "Screenshot Tester",
  });
  // Phase 6I Task 7: dismissed first, so this capture is "News recaptured
  // with the third pin" (the phase spec's own screenshot obligation) —
  // Start-here now sits above the two permanent explainers.
  await dismissStartHere(page);
  await page.goto("/news");
  await page.locator(".news-unread-count").waitFor();
  await page.locator(".news-pin-starthere").waitFor();

  const workoutTypesRow = page.locator(
    'a.news-row[href="/news/workout-types"]',
  );
  await workoutTypesRow.click();
  await expect(page).toHaveURL(/\/news\/workout-types$/);
  await page.locator(".reader-body").waitFor();
  await page.getByRole("link", { name: "← BACK" }).click();
  await expect(page).toHaveURL(/\/news$/);
  // The row's own read styling (page-coloured square, grey 400-weight
  // title) is what this capture exists to show — wait for it explicitly
  // rather than racing the read-state PUT's own round trip.
  await expect(workoutTypesRow).toHaveAttribute("data-read", "true");

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "news.png"),
  });
});

// News-polish round: /news/workout-types replaces /news/baselines as the
// reader capture — the richest article now that it carries inline type
// chips (Item 4) and the training-pyramid figure (Item 5), so this is the
// honest visual record of what the reader actually renders, not just of
// its typographic scale.
test("news-reader", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-news-reader@e2e.test",
    name: "Screenshot Tester",
  });
  await page.goto("/news/workout-types");
  await page.locator(".reader-body").waitFor();
  // The pyramid figure is the point of this capture, and it sits well below
  // the fold on a 390x844 viewport (six paragraphs of serif prose precede
  // it) — a viewport-only screenshot at scroll position 0 would never show
  // it at all. Scroll it into the middle of the viewport rather than to the
  // very top, so the capture also carries a paragraph of surrounding prose
  // (with its own inline O2/AT chips) for context, not just a bare figure.
  await page.evaluate(() => {
    document
      .querySelector(".reader-figure")
      ?.scrollIntoView({ block: "center" });
  });
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "news-reader.png"),
  });
});

// ui-notes round, item 1 — a separate, unscrolled capture: news-reader.png
// above deliberately scrolls to the pyramid figure (its own established
// job), which scrolls the header — and this round's new ✕ close inside it
// — out of frame entirely (recurring-failure #7: open the image and look
// at it caught that the recaptured news-reader.png was byte-identical to
// its pre-round version, proving the ✕ never entered that frame). This
// capture exists solely to put ← BACK and the new ✕ on screen together.
test("news-reader-close", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-news-reader-close@e2e.test",
    name: "Screenshot Tester",
  });
  await page.goto("/news/workout-types");
  await page.locator(".reader-body").waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "news-reader-close.png"),
  });
});

// -- Phase 7B Task 5: the connected interstitial (task-5 review, HIGH-3) ---
//
// `pnpm screenshots` was not run for this screen when it first shipped — a
// brand-new full-screen route is the strongest possible trigger for the
// briefing's own gate table, and running it here is what would have caught
// the 151px landscape overflow (Cancel and "Row on the phone timer instead"
// starting 132px behind the fixed tab bar) the review measured directly.
//
// The FAILED state is reached by removing `navigator.bluetooth` itself
// BEFORE the app loads — never through a real
// `navigator.bluetooth.requestDevice()` call: this environment's real
// Chromium exposes the Web Bluetooth API even headless, and with no adapter
// and no way to render/dismiss a chooser, `requestDevice()` HANGS rather
// than rejecting (the identical hazard `session.spec.ts`'s own "Connect
// anyway" comment documents, LOW-1). With `navigator.bluetooth` gone no
// picker is ever opened, so there is nothing to hang on, and `failed` is
// the one state HIGH-3's own measurement named by number.
//
// **Corrected by the fix wave (review H4).** This block used to go on to
// say that states 4/5/7 (pairing/programming/ready) were "deliberately NOT
// driven", that this capture was "the one real-browser check the CSS fix
// (the `var(--tap)` term, the centred body) actually holds up under real
// fonts and the real fixed tab bar", and that
// `ConnectedInterstitial.test.tsx` had 52 DOM assertions. All three were
// superseded by Task 8 in the SAME commit that left them standing:
//
// - Six more captures live ~90 lines below — pairing, programming and
//   ready, both orientations, driven for real through the fake seam.
// - Task 8 DELETED the `var(--tap)` term (`index.css`: "No `- var(--tap)`
//   term (Task 8)").
// - Task 8's `:has()` conversion HIDES the tab bar on this exact screen
//   (`index.css`'s `.app-shell:has(.connected-interstitial)` rule), so this
//   capture is not a check on the tab bar's presence at all.
// - `ConnectedInterstitial.test.tsx` has 35 `it(` blocks and 80 `expect(`
//   calls, not 52 assertions.
//
// What is still true: all four built states share the same
// `.connected-interstitial`/`.connected-interstitial-body` layout classes,
// and this file's connected captures are the real-browser check that the
// interstitial's height and centring hold up under real fonts.
async function stubNoBluetooth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "bluetooth", {
      value: undefined,
      configurable: true,
    });
  });
}

async function openConnectedFailedState(
  page: Page,
  title: string,
  email: string,
): Promise<void> {
  await stubNoBluetooth(page);
  await signInViaBackdoor(page, {
    email,
    name: "Screenshot Tester",
  });
  await setBaselines(page);
  // A single 100m distance work step — the PM5's own minimum distance
  // interval, so `compileProgram` succeeds and Connect actually reaches the
  // interstitial rather than staying on the button with an inline
  // CompileError (the "test"/open-ended step the handoff's own reference
  // fixtures elsewhere in this file are not compilable for the monitor).
  await importBulk(page, [`${title} | AN | easy | 1`, "w 100m max"].join("\n"));
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(
    page.locator(".connected-serif-line", {
      hasText: "This device has no Bluetooth transport.",
    }),
  ).toBeVisible();
}

test("connected-interstitial-failed", async ({ page }) => {
  const title = "Screenshot Connected Failed Workout";
  await openConnectedFailedState(
    page,
    title,
    "screenshots-connected-failed@e2e.test",
  );
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "connected-interstitial-failed.png"),
  });
  await cleanupByTitle(page, title);
});

test("connected-interstitial-failed-landscape", async ({ page }) => {
  const title = "Screenshot Connected Failed Landscape Workout";
  await openConnectedFailedState(
    page,
    title,
    "screenshots-connected-failed-landscape@e2e.test",
  );
  // The phase's own landscape-first reference frame (same as
  // "timer-landscape"/"session-complete-landscape" above) — the orientation
  // HIGH-3's own 151px overflow measurement was taken in.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({
    path: path.join(
      SCREENSHOTS_DIR,
      "connected-interstitial-failed-landscape.png",
    ),
  });
  await cleanupByTitle(page, title);
});

// --- Phase 7B Task 8: the connected interstitial's DRIVEN states -----------
//
// States 4/5/7 (pairing/programming/ready) could not be captured for real
// when Task 5's screenshots above were taken — no seam existed to drive them
// without a real radio, which is exactly why the comment above
// `stubNoBluetooth` named `failed` as "the one state HIGH-3's own
// measurement named by number". Task 8's fake-injection seam
// (`src/monitor/transports/index.ts`) removes that constraint: this compose
// stack's `web` image is built with `VITE_ENABLE_FAKE_MONITOR=1`
// (`compose.e2e.yml`), so `window.__pm5FakeScript__` — set via
// `page.addInitScript`, exactly like `e2e/connected.spec.ts` — drives a REAL
// `createFakeTransport()` through the REAL `ConnectedInterstitial` component.
// No `navigator.bluetooth` stub involved, so none of the hanging-picker
// hazard above applies to any of these three.
//
// `delayWritesMs` (200ms — `connected.spec.ts`'s own proven-reliable
// 120ms, plus margin) delays EVERY write, including each individual
// 20-byte BLE chunk of the programming frame (`driver.ts`'s per-frame send
// loop awaits one chunk at a time, never in parallel) — so the REAL
// duration "Sending the workout" stays on screen scales with chunk COUNT,
// not just this one constant. A single 100m distance interval's program
// packs into very few chunks, and measured directly, that left too short a
// real window for a screenshot taken right after a polled `expect` to
// reliably still be looking at it (this file's own first attempt, a
// single-interval program at up to 1500ms/write, still intermittently
// raced past "Sending the workout" before the screenshot call landed).
// Five intervals — `connected.spec.ts`'s own `FIXTURE_PROGRAM` shape,
// proven reliable there at 120ms — packs enough chunks that the
// programming state holds for a real, comfortable multiple of one write's
// own delay.
const SCREENSHOT_DELAY_WRITES_MS = 200;

async function injectFakeMonitorForScreenshots(
  page: Page,
  deviceName: string,
): Promise<void> {
  await page.addInitScript(
    ({ program, deviceName: name, delayWritesMs }) => {
      window.__pm5FakeScript__ = {
        program,
        deviceName: name,
        delayWritesMs,
      };
    },
    {
      // Five 100m distance steps — `connected.spec.ts`'s own
      // `FIXTURE_PROGRAM` shape (`SCREENSHOT_DELAY_WRITES_MS`'s own doc
      // comment for why chunk count, not just delay, is what actually
      // holds "Sending the workout" on screen long enough to capture).
      program: {
        intervals: Array.from({ length: 5 }, () => ({
          type: "work" as const,
          kind: "distance" as const,
          value: 100,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        })),
      },
      deviceName,
      delayWritesMs: SCREENSHOT_DELAY_WRITES_MS,
    },
  );
}

async function openConnectedInterstitial(
  page: Page,
  title: string,
  email: string,
  deviceName: string,
): Promise<void> {
  await injectFakeMonitorForScreenshots(page, deviceName);
  await signInViaBackdoor(page, { email, name: "Screenshot Tester" });
  await setBaselines(page);
  // Five "w 100m max" lines — MUST match `injectFakeMonitorForScreenshots`'s
  // own five-interval `program` exactly (`connected.spec.ts`'s own header
  // comment: `createFakeTransport` asserts every incoming programming byte
  // against its OWN `script.program`, so the bulk-import text and the
  // injected fixture have to agree BY CONSTRUCTION — an earlier draft of
  // this file left this at a single line after the fixture above grew to
  // five intervals, and got a genuine "programming chunk 0 mismatch" from
  // the fake for it).
  await importBulk(
    page,
    [
      `${title} | AN | easy | 1`,
      "w 100m max",
      "w 100m max",
      "w 100m max",
      "w 100m max",
      "w 100m max",
    ].join("\n"),
  );
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Connect" }).click();
}

test("connected-interstitial-pairing", async ({ page }) => {
  const title = "Screenshot Connected Pairing Workout";
  await openConnectedInterstitial(
    page,
    title,
    "screenshots-connected-pairing@e2e.test",
    "PM5 918273645",
  );
  await expect(
    page.locator(".connected-serif-line", { hasText: "Connecting" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "connected-interstitial-pairing.png"),
  });
  await cleanupByTitle(page, title);
});

test("connected-interstitial-pairing-landscape", async ({ page }) => {
  const title = "Screenshot Connected Pairing Landscape Workout";
  await openConnectedInterstitial(
    page,
    title,
    "screenshots-connected-pairing-landscape@e2e.test",
    "PM5 918273645",
  );
  await expect(
    page.locator(".connected-serif-line", { hasText: "Connecting" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({
    path: path.join(
      SCREENSHOTS_DIR,
      "connected-interstitial-pairing-landscape.png",
    ),
  });
  await cleanupByTitle(page, title);
});

test("connected-interstitial-programming", async ({ page }) => {
  const title = "Screenshot Connected Programming Workout";
  await openConnectedInterstitial(
    page,
    title,
    "screenshots-connected-programming@e2e.test",
    "PM5 918273645",
  );
  await expect(
    page.locator(".connected-serif-line", { hasText: "Sending the workout" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "connected-interstitial-programming.png"),
  });
  await cleanupByTitle(page, title);
});

test("connected-interstitial-programming-landscape", async ({ page }) => {
  const title = "Screenshot Connected Programming Landscape Workout";
  await openConnectedInterstitial(
    page,
    title,
    "screenshots-connected-programming-landscape@e2e.test",
    "PM5 918273645",
  );
  await expect(
    page.locator(".connected-serif-line", { hasText: "Sending the workout" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({
    path: path.join(
      SCREENSHOTS_DIR,
      "connected-interstitial-programming-landscape.png",
    ),
  });
  await cleanupByTitle(page, title);
});

test("connected-interstitial-ready", async ({ page }) => {
  const title = "Screenshot Connected Ready Workout";
  await openConnectedInterstitial(
    page,
    title,
    "screenshots-connected-ready@e2e.test",
    "PM5 918273645",
  );
  await expect(
    page.locator(".connected-serif-line", { hasText: "Ready when you pull" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "connected-interstitial-ready.png"),
  });
  await cleanupByTitle(page, title);
});

test("connected-interstitial-ready-landscape", async ({ page }) => {
  const title = "Screenshot Connected Ready Landscape Workout";
  await openConnectedInterstitial(
    page,
    title,
    "screenshots-connected-ready-landscape@e2e.test",
    "PM5 918273645",
  );
  await expect(
    page.locator(".connected-serif-line", { hasText: "Ready when you pull" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({
    path: path.join(
      SCREENSHOTS_DIR,
      "connected-interstitial-ready-landscape.png",
    ),
  });
  await cleanupByTitle(page, title);
});

// --- CR2 spec 3 Task 6: the armed GRID pane — no visual record until now ---
//
// Design spec §2D describes the armed frame for LIVE only (`connected-
// armed.html`'s own committed capture); GRID's armed branch (Task 5,
// `ConnectedSurface.tsx`'s `headerTrailing`, "armed is checked FIRST, ahead
// of the ordinal check, so GRID never reaches the countdown composition
// while armed") had NO screenshot at all — the exact defect class
// `.claude/agent-briefing.md` names by name (a RUNNING gold countdown at a
// rower who has taken no stroke) has a regression test in
// `ConnectedSurface.tsx` but no photograph proving it. This walks the same
// real fake-driven path `openConnectedInterstitial`'s ready captures use,
// one step further: past "Show me the numbers" (which mounts the real
// surface at `status: "armed"`, `axes.session === "none"` — nothing has
// been rowed) and one click onto the GRID pane, with NO story events pumped
// at all, so nothing here can accidentally advance past armed.
test("connected-armed-grid", async ({ page }) => {
  const title = "Screenshot Connected Armed Grid Workout";
  await openConnectedInterstitial(
    page,
    title,
    "screenshots-connected-armed-grid@e2e.test",
    "PM5 918273645",
  );
  await expect(
    page.locator(".connected-serif-line", { hasText: "Ready when you pull" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Show me the numbers" }).click();
  await expect(
    page.getByRole("navigation", { name: "Connected panes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Grid pane" }).click();
  await expect(page.getByRole("button", { name: "Grid pane" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // The header's own armed branch, not the countdown composition — the
  // one line this capture exists to put a picture behind.
  await expect(page.getByText("1 OF 5 · READY")).toBeVisible();
  await expect(page.locator(".connected-header-countdown")).toHaveCount(0);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "connected-armed-grid.png"),
  });
  await cleanupByTitle(page, title);
});

test("connected-armed-grid-landscape", async ({ page }) => {
  const title = "Screenshot Connected Armed Grid Landscape Workout";
  await openConnectedInterstitial(
    page,
    title,
    "screenshots-connected-armed-grid-landscape@e2e.test",
    "PM5 837465921",
  );
  await expect(
    page.locator(".connected-serif-line", { hasText: "Ready when you pull" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Show me the numbers" }).click();
  await expect(
    page.getByRole("navigation", { name: "Connected panes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Grid pane" }).click();
  await expect(page.getByRole("button", { name: "Grid pane" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText("1 OF 5 · READY")).toBeVisible();
  await expect(page.locator(".connected-header-countdown")).toHaveCount(0);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "connected-armed-grid-landscape.png"),
  });
  await cleanupByTitle(page, title);
});

// --- Phase 7C Task 6: the monitor mode's Log screen form --------------------
//
// The monitor mode (spec §4) only ever engages once a REAL connected session
// has ended through the fake seam — same fake-injection idiom as
// `openConnectedInterstitial` above, extended past "ready" through a single
// interval's boundary and a staged End, mirroring `e2e/connected.spec.ts`'s
// own walk but WITHOUT that file's paused/resumed theatrics: this capture
// only needs a genuinely-ended `MonitorRun` with one measured interval, not
// a PAUSED derivation to exercise. `program`/the bulk-import text are
// `connected.spec.ts`'s own `FIXTURE_PROGRAM` shape (five 100m distance
// "max" intervals) — the walk's own fixture, per this task's brief.
async function openLogMonitorForm(
  page: Page,
  title: string,
  email: string,
  deviceName: string,
): Promise<void> {
  await page.addInitScript(
    ({ program, events, deviceName: name, delayWritesMs }) => {
      window.__pm5FakeScript__ = {
        program,
        events,
        deviceName: name,
        delayWritesMs,
      };
    },
    {
      program: {
        intervals: Array.from({ length: 5 }, () => ({
          type: "work" as const,
          kind: "distance" as const,
          value: 100,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        })),
      },
      // Trace-rendering spec (Phase LT spec 3), Task 3: densified past this
      // file's own original short story (two ticks + one boundary) so the
      // REAL `createSeriesRecorder()` — fed genuine wire frames through
      // this exact fake-transport seam, never a hand-written `series` —
      // produces a multi-point trace for `log-monitor.png` to show, real
      // and multi-interval in the sense that matters to the chart: it
      // spans two DIFFERENT `programIntervalIndex` stretches (a plain
      // status field, no wire-index translation involved), not one
      // program interval's own boundary a second time (a second scripted
      // `boundary` event was tried and dropped — its own `actual.index`
      // round-trips through `toMachineIndex`/the driver's forward-
      // attribution rules, `domain/monitor/pm5/intervalIndex.ts`, which
      // this fixture is not the place to get right a second time; ONE
      // boundary, `surfaceModel.ts`'s own single-row "MEASURED" grid, and
      // the pre-existing `log-monitor` assertions all stay exactly as
      // this file originally proved them).
      //
      // CORRECTED (review finding I2, trace-truth Task 1 close-out): every
      // status tick's own `elapsedSeconds`/`distanceMeters` RESETS to near
      // zero at the interval-0 -> interval-1 boundary (ticks below,
      // `atMs: 5400` onward) — a genuine PM5 clears both per-interval
      // fields at the same instant it advances its own interval count
      // (`domain/monitor/types.ts`'s own `MonitorFrame.elapsedSeconds` doc
      // comment), so a monotonic-across-the-boundary stream was never
      // physically real; it only read as "safe" under the recorder's OLD
      // edge-triggered fold (which only ever looked for a DECREASE to
      // detect a reset, so a stream that never decreased just never
      // folded — this file's own now-corrected comment used to describe
      // exactly that). The CURRENT recorder keys on `MonitorFrame.
      // intervalIndex` instead (trace-truth spec §1/§2): `fake.ts`'s own
      // `toMachineIndex(e.programIntervalIndex, ...)` round-trips each
      // tick's `programIntervalIndex` onto the wire's 0x0033 Interval
      // Count, so the real driver's `toProgramIndex` reads the key change
      // straight off the boundary below regardless of what
      // `elapsedSeconds` does — the reset here is for WIRE REALISM, not
      // to keep the recorder from mis-folding (that hazard no longer
      // exists). Every consecutive pair, BEFORE and AFTER folding, still
      // sits at most 3 s apart (never over the trace's own gap-break
      // threshold), so the drawn line stays ONE continuous piece — no
      // accidental split. `avgSplit`/`avgSpm` on the boundary are the
      // fake's own scripted per-interval actuals (independent of the raw
      // elapsed stream, `derivedAvgSplit`'s own doc comment) — unchanged
      // from this file's own original 500×15/100 = 75s = "1:15.0" (the
      // value `log-monitor`'s own assertion below still expects).
      events: [
        {
          atMs: 3000,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 2,
          distanceMeters: 13,
          spm: 22,
          currentSplit: 130,
          heartRateBpm: 126,
          programIntervalIndex: 0,
        },
        {
          atMs: 3300,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 4,
          distanceMeters: 27,
          spm: 23,
          currentSplit: 122,
          heartRateBpm: 130,
          programIntervalIndex: 0,
        },
        {
          atMs: 3600,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 6,
          distanceMeters: 41,
          spm: 24,
          currentSplit: 116,
          heartRateBpm: 134,
          programIntervalIndex: 0,
        },
        {
          atMs: 3900,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 8,
          distanceMeters: 55,
          spm: 24,
          currentSplit: 112,
          heartRateBpm: 138,
          programIntervalIndex: 0,
        },
        {
          atMs: 4200,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 10,
          distanceMeters: 70,
          spm: 25,
          currentSplit: 108,
          heartRateBpm: 141,
          programIntervalIndex: 0,
        },
        {
          atMs: 4500,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 12,
          distanceMeters: 85,
          spm: 25,
          currentSplit: 106,
          heartRateBpm: 144,
          programIntervalIndex: 0,
        },
        {
          atMs: 4800,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 14,
          distanceMeters: 96,
          spm: 26,
          currentSplit: 104,
          heartRateBpm: 146,
          programIntervalIndex: 0,
        },
        {
          atMs: 5100,
          kind: "boundary" as const,
          actual: {
            index: 0,
            elapsedSeconds: 15,
            distanceMeters: 100,
            avgSpm: 24,
            avgHeartRateBpm: 138,
            restDistanceMeters: 0,
          },
          cumulativeElapsedSeconds: 15,
          cumulativeDistanceMeters: 100,
        },
        {
          atMs: 5400,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 2,
          distanceMeters: 15,
          spm: 26,
          currentSplit: 102,
          heartRateBpm: 148,
          programIntervalIndex: 1,
        },
        {
          atMs: 5700,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 4,
          distanceMeters: 30,
          spm: 27,
          currentSplit: 100,
          heartRateBpm: 150,
          programIntervalIndex: 1,
        },
        {
          atMs: 6000,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 6,
          distanceMeters: 45,
          spm: 27,
          currentSplit: 99,
          heartRateBpm: 151,
          programIntervalIndex: 1,
        },
        {
          atMs: 6300,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 8,
          distanceMeters: 60,
          spm: 28,
          currentSplit: 98,
          heartRateBpm: 152,
          programIntervalIndex: 1,
        },
        {
          atMs: 6600,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 10,
          distanceMeters: 75,
          spm: 28,
          currentSplit: 97,
          heartRateBpm: 153,
          programIntervalIndex: 1,
        },
        {
          atMs: 6900,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 12,
          distanceMeters: 90,
          spm: 28,
          currentSplit: 96,
          heartRateBpm: 154,
          programIntervalIndex: 1,
        },
        {
          atMs: 7200,
          kind: "status" as const,
          workoutState: 4,
          elapsedSeconds: 14,
          distanceMeters: 101,
          spm: 28,
          currentSplit: 95,
          heartRateBpm: 155,
          programIntervalIndex: 1,
        },
      ],
      deviceName,
      delayWritesMs: SCREENSHOT_DELAY_WRITES_MS,
    },
  );
  await signInViaBackdoor(page, { email, name: "Screenshot Tester" });
  await setBaselines(page);
  await importBulk(
    page,
    [
      `${title} | AN | easy | 1`,
      "w 100m max",
      "w 100m max",
      "w 100m max",
      "w 100m max",
      "w 100m max",
    ].join("\n"),
  );
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(
    page.locator(".connected-serif-line", { hasText: "Ready when you pull" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Show me the numbers" }).click();
  await expect(
    page.getByRole("navigation", { name: "Connected panes" }),
  ).toBeVisible();

  // Interval 0's boundary has landed once the grid shows one completed row.
  // Driven by an atomic tick-then-read loop (`connected.spec.ts`'s own
  // `pumpUntilPaused` idiom), not a bare polled `expect`: the in-page
  // auto-tick clock (`transports/index.ts`) can stall or lag on its own
  // (this file's own earlier discovery, above `SCREENSHOT_DELAY_WRITES_MS`),
  // and a `tick()` call over the DevTools protocol is not subject to that.
  await page.getByRole("button", { name: "Grid pane" }).click();
  const deadline = Date.now() + 15_000;
  for (;;) {
    const completed = await page.evaluate(() => {
      window.__pm5FakeControls__?.tick(100);
      return document.querySelectorAll(".connected-grid-completed").length;
    });
    if (completed >= 1) break;
    if (Date.now() >= deadline) {
      await expect(page.locator(".connected-grid-completed")).toHaveCount(1);
      break;
    }
  }

  // NOTE (unlike `log-session`'s own F1 fix, above): this capture's header
  // reads "0 MIN", not a padded "1 MIN". `MonitorRun.startedAt` is stamped
  // only once the machine's first genuinely-rowing frame lands
  // (`useMonitorSession.ts`'s own `declared`/`fallback` gate), not at
  // Connect, so getting a real non-zero minute here would mean holding the
  // LIVE surface open on an actual 30+ second wall-clock wait with no
  // further scripted wire traffic — a real cost (this whole capture would
  // roughly 6x in wall time) for one cosmetic digit on a screenshot that is
  // explicitly NOT diff-asserted (this file's own header: "a human judges
  // these"). Left honest rather than padded.

  // END — staged, two presses, same idiom as `connected.spec.ts`.
  await page.getByRole("button", { name: "End session" }).click();
  await expect(
    page.getByRole("button", { name: "Tap again to end" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tap again to end" }).click();

  await expect(page).toHaveURL(/\/library\/[^/]+\/log\?from=monitor$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // Realistic, non-empty state (CLAUDE.md's own "no empty-state
  // screenshots" rule), same fill idiom as `post-workout-summary`/
  // `post-workout-summary-manual` above.
  await page.getByRole("button", { name: "HELD" }).click();
  await page.getByRole("button", { name: "Pain 2" }).click();
  await page
    .getByLabel("NOTES")
    .fill("Rowed against a connected monitor for the first time.");
}

// Trace-rendering spec (Phase LT spec 3), Task 3, recurring failure #7
// (sharpened — "check the drawn shape against the row values in the same
// frame"): every capture in this file is viewport-only, never
// `fullPage: true` (this file's own `neutralizeFixedTabBarForFullPageCapture`
// header names the one exception, "builder"), and the summary's reflection
// card pushes the chart below a single 390×844/844×390 fold. Scrolls so
// the chart's own bottom edge lands `margin` px above the viewport's own
// bottom, which — on both fixtures below — keeps the TAIL of the
// intervals list (the rows a human reads the chart's shape against) on
// screen too, rather than centering the chart alone.
test("log-monitor", async ({ page }) => {
  const title = "Screenshot Log Monitor Workout";
  await openLogMonitorForm(
    page,
    title,
    "screenshots-log-monitor@e2e.test",
    "PM5 918273645",
  );
  // A real pm5 pace on at least one row is the visible difference from the
  // manual door's own `post-workout-summary-manual` capture — the whole
  // reason this gets its own shot (post-workout-summary spec: the old
  // "FROM <device> · N OF M MEASURED" caption is retired, superseded by
  // the meta line's own device name and each row's own measured-ness).
  // Review FIX-5: the device-name check alone passes whether or not any
  // interval was actually measured (the meta line's device name is
  // unconditional). Assert the thing the comment promises — a genuine
  // `m:ss.t` pace label (`fmtSplit`'s own format) on a `.summary-row-pace`
  // cell.
  await expect(page.getByText(/PM5 918273645/)).toBeVisible();
  await expect(
    page.locator(".summary-row-pace", { hasText: /^\d+:\d{2}\.\d$/ }).first(),
  ).toBeVisible();
  // Trace-rendering spec (Phase LT spec 3), Task 3: a real trace, drawn
  // from the SAME live session's own `MonitorRun.series` (the fake
  // transport's frames flowed through the real `createSeriesRecorder()`,
  // never a hand-written series) — below the intervals block, on the
  // live door.
  await expect(page.locator(".trace-figure")).toBeVisible();
  await expect(page.locator(".trace-line").first()).toBeVisible();
  // trace-truth Task 3: the new x-axis pushed `.trace-figure`'s own
  // bottom edge into the ~44px the fixed `.tabbar` visually covers on
  // this plain document-flow route (`/library/:id/log` is not in
  // `HIDDEN_TABBAR_PREFIXES`) — the axis's tick MARKS survived (they sit
  // higher, at the gutter's own top) but the LABELS below them rendered
  // fully behind the opaque bar, invisible in the committed capture.
  // `neutralizeFixedTabBarForFullPageCapture`'s case 1 (this function's
  // own header comment) is exactly this shape: freeing the reserved
  // space by taking the bar out of fixed position, same fix `builder`
  // already uses.
  await neutralizeFixedTabBarForFullPageCapture(page);
  await scrollTraceChartIntoFrame(page);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "log-monitor.png"),
  });
  await cleanupByTitle(page, title);
});

test("log-monitor-landscape", async ({ page }) => {
  const title = "Screenshot Log Monitor Landscape Workout";
  await openLogMonitorForm(
    page,
    title,
    "screenshots-log-monitor-landscape@e2e.test",
    "PM5 837465921",
  );
  await expect(page.getByText(/PM5 837465921/)).toBeVisible();
  // Review FIX-5, same reasoning as `log-monitor` above.
  await expect(
    page.locator(".summary-row-pace", { hasText: /^\d+:\d{2}\.\d$/ }).first(),
  ).toBeVisible();
  // Trace-rendering spec (Phase LT spec 3), Task 3, same reasoning as
  // `log-monitor` above.
  await expect(page.locator(".trace-figure")).toBeVisible();
  await expect(page.locator(".trace-line").first()).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  // Same reasoning as `log-monitor` above — more pressing here, the
  // shorter 390px landscape viewport leaves even less headroom.
  await neutralizeFixedTabBarForFullPageCapture(page);
  await scrollTraceChartIntoFrame(page);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "log-monitor-landscape.png"),
  });
  await cleanupByTitle(page, title);
});

// --- Phase 7B Task 6: the connected surface, both orientations -------------
//
// The panes cannot be REACHED in this stack: they only render once a monitor
// is programmed and rowing, the DEV-gated fake-transport injection seam is
// Task 8's (`src/monitor/transports/index.ts`), the stack serves a
// PRODUCTION bundle where such a seam cannot fire, and a real
// `requestDevice()` hangs here rather than rejecting (the note above
// `stubNoBluetooth`).
//
// So the markup comes from `src/workout/ConnectedSurface.screens.test.tsx`,
// which renders the REAL component tree on the REAL "Filling Low" library
// fixture and writes each state to `e2e/fixtures/`, kept honest by
// `toMatchFileSnapshot` (the fixture cannot drift from the component without
// that test failing). This spec loads the real app — so the real `index.css`
// cascade and the real self-hosted fonts are live — and swaps the fixture
// into the page.
//
// What that buys: real LAYOUT, at both reference frames, which is exactly
// what would have caught the 151px landscape overflow Task 5 shipped. What
// it does not buy: proof that a live monitor's numbers reach these nodes —
// `ConnectedSurface.test.tsx`'s fake-driven walk covers that in jsdom, and
// Task 8's `connected.spec.ts` covers it in a browser once the seam exists.
const CONNECTED_FIXTURES = path.resolve(process.cwd(), "e2e/fixtures");

/** The real shell's own tab bar, reproduced structurally (`shell/TabBar.tsx`
 *  renders `<nav class="tabbar">` with five `.tab` links, as a SIBLING of the
 *  routed screen inside `.app-shell`). It is here because
 *  `.app-shell:has(.connected-surface)` hides it and drops the 44px
 *  `.app-shell` reserves for it — 44px of landscape height the panes cannot
 *  do without — and a wrapper with no bar in it photographs a DOM the device
 *  never produces, exercising neither half of that rule (task-6 review, M1).
 *  With the rule in place these captures are byte-identical to the ones taken
 *  before this node existed; with it deleted, the bar appears in every one of
 *  them and the frame shrinks. The count is `CONNECTED_STATES.length × 2`
 *  orientations and is stated that way deliberately: this comment has
 *  carried a stale literal twice (fix round, review Minor-10 — 8 states
 *  after Task 2 retired `connected-pane-timer`, then 9 once Task 4b added
 *  `connected-pane-live-warmup`). */
const TAB_BAR_MARKUP = `<nav class="tabbar" aria-label="Main">
  <a class="tab tab-active" href="#">TODAY</a>
  <a class="tab" href="#">LIBRARY</a>
  <a class="tab" href="#">PLAN</a>
  <a class="tab" href="#">TREND</a>
  <a class="tab" href="#">YOU</a>
</nav>`;

/** Loads the app (for its stylesheet and fonts), then replaces the document
 *  body with one fixture inside the same `.app-shell` wrapper the real
 *  routes render into — tab bar included. No sign-in: nothing here talks to
 *  the API. */
async function showConnectedFixture(page: Page, name: string): Promise<void> {
  const html = readFileSync(path.join(CONNECTED_FIXTURES, `${name}.html`), {
    encoding: "utf-8",
  });
  await page.goto("/", { waitUntil: "load" });
  // The app's own stylesheet has to be APPLIED before the swap, or the
  // capture is unstyled markup. `networkidle` never settles on this stack
  // (the signed-out page holds a connection open), so this waits on the
  // observable fact instead: `--page` resolving means tokens.css is live.
  await page.waitForFunction(
    () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--page")
        .trim() !== "",
  );
  await page.evaluate(
    ({ markup, tabBar }) => {
      document.body.innerHTML = `<div class="app-shell">${markup}${tabBar}</div>`;
    },
    { markup: html, tabBar: TAB_BAR_MARKUP },
  );
  await expect(page.locator(".connected-surface")).toBeVisible();
  // The other half of the same rule, asserted rather than assumed: with a
  // connected surface on screen the shell's bar is gone. Without this the
  // node above would just be decoration a deleted rule could ignore.
  await expect(page.locator(".tabbar")).toBeHidden();
  // The fonts are self-hosted (@fontsource) and already requested by the
  // app's own first paint; this makes the wait explicit so a capture can
  // never land on a fallback face.
  await page.evaluate(() => document.fonts.ready);
}

const CONNECTED_STATES = [
  // I-1, final whole-branch review fix wave: frame 2D's "first frame"
  // (before the first stroke) — the state this suite had no picture of at
  // all. `e2e/fixtures/connected-armed.html` is a static `outerHTML`
  // snapshot of the REAL `ConnectedSurface`, same idiom as every other
  // fixture in this array (`showConnectedFixture`'s own header), rendered
  // at `status: "armed"` with the mirror test's own ghost values (spm 46,
  // currentSplit 251 — `surfaceModel.test.ts`'s "armed's first frame"
  // describe block) so the capture can visually prove the ghost is
  // suppressed, not merely absent because nothing was ever carried over.
  "connected-armed",
  "connected-pane-live",
  // connected-revamp Task 4b (design spec §5b): the WARM-UP state, which had
  // no committed picture of its own — every other live fixture is already
  // past it. What it records: the caption with no ordinal, and the bar's
  // three tones — the warm-up's leading span filling in ITS own tone as the
  // rower rows it (`--ink-4` here, lighter than the ink work fill), the
  // unrowed rest of that span in plain track, and the work fill beyond it
  // (James, 2026-08-12: the bar must move while the rower is moving, and
  // still read as visibly not-work).
  "connected-pane-live-warmup",
  "connected-pane-live-nohr",
  "connected-paused",
  "connected-disconnected",
  // Task 7: pane C mid-session (one row of each state), the 25-interval
  // case that forces the contained scroll (DEVIATIONS row 2), and the
  // diagnostics sheet the triple-tap opens over it.
  "connected-pane-grid",
  "connected-pane-grid-long",
  "connected-log-sheet",
  "connected-ended",
] as const;

/** THE GRID SCROLLER'S OWN BUDGET, in pixels, per orientation — the number
 *  every row count on this surface is derived from, pinned here so a drift
 *  fails on the budget with its delta rather than on a bare integer that
 *  hides how close it was (task-6 review, Scrutiny 1b).
 *
 *  Measured against this worktree's own served bundle, both fonts applied
 *  (`showConnectedFixture` waits on `document.fonts.ready`; the review
 *  reproduced a 3px swing by skipping that wait, which is what the original
 *  "13 one run, 14 the next" report actually was). Both are `clientHeight`
 *  of `.connected-grid-rows` on the 25-interval fixture. The TWO flex-none
 *  siblings above and below it (`.connected-grid-head` and
 *  `.connected-grid-caption`) carry explicit heights in `index.css` for
 *  exactly this reason, so these are arithmetic, not typography.
 *
 *  CR2 spec 3 task 1 moved `ConnectionLine` out of `.connected-grid-headline`
 *  into the shell's own header, which moved PORTRAIT's own figure once
 *  already (612 -> 626). CR2 spec 3 Task 5 moved both again (626 -> 640
 *  portrait, 276 -> 286 landscape, deleting the pane's own headline
 *  outright). CR2 spec 3 TASK 6's OWN FIX ROUND MOVES PORTRAIT A THIRD
 *  TIME, LANDSCAPE NOT AT ALL (re-measured against this worktree, not
 *  derived): CRITICAL 1's header restructure gives the status caption its
 *  own line below the header row in portrait ONLY (§2C; landscape keeps
 *  the single 44px row the whole surface has always used, so its own
 *  scroller budget is untouched) — the header's own portrait height grows
 *  by the status line's own height plus the header's `gap`, and every
 *  byte of that growth comes directly out of the scroller's budget one
 *  flex row down: 640 -> 600, a clean 40px (one full grid row) lighter,
 *  landing at another zero-slack exact fit (600 / 40 = 15.0). Landscape's
 *  286 was unchanged BY THAT round — the fix round's own comment on
 *  `.connected-header` has the reasoning for why the two orientations
 *  diverged there.
 *
 *  CR2 close-out queue item 5 MOVES LANDSCAPE, for the first time (286 ->
 *  266): `.connected-surface`'s own top padding changed from a bare
 *  `env(safe-area-inset-top)` (0px in this zero-inset harness) to
 *  `max(20px, env(safe-area-inset-top))` — the header row's own height is
 *  untouched (still 44px, still one row), but the SURFACE's total
 *  available height for its `1fr` body track shrinks by the new 20px
 *  floor, and the grid scroller sits inside that track. 8 rows at 32px
 *  (256px) still fit inside 266 (10px to spare, not the zero-slack exact
 *  fit portrait's own 600 has) — re-measured against this worktree, not
 *  derived, same discipline this whole comment insists on. */
const PORTRAIT_GRID_SCROLLER_PX = 600;
const LANDSCAPE_GRID_SCROLLER_PX = 266;

for (const name of CONNECTED_STATES) {
  test(name, async ({ page }) => {
    await showConnectedFixture(page, name);
    if (name === "connected-pane-live") {
      // UP NEXT'S PORTRAIT STRING (connected-revamp Task 6, design spec §6/
      // revision §3; RE-ANCHORED CR2 spec 3 Task 4 — the band renders this
      // line directly now, `.connected-band-upnext-value`, not
      // `UpNextStrip`'s own classes; PHASE CS Item B, task 2: the
      // then-clause and its `.connected-band-upnext-then` span are retired
      // outright — one richer phase, not two). "REST 3:00" — the SAME
      // value landscape shows, minus the "NEXT · " prefix, which is
      // landscape-only (queue item 7: portrait's own stacked `UP NEXT`
      // label above already names the line). This fixture's own program
      // has a real rest next (`connected-pane-live.html`, "Filling Low"'s
      // rest between work intervals), so there is something real to
      // resolve to. `innerText`, NOT `textContent`: `textContent` reads
      // the raw DOM regardless of CSS, `innerText` approximates rendered
      // text — the same reasoning that used to matter for the retired
      // "then" span still applies to the "NEXT · " prefix span, which
      // stays hidden in portrait (the landscape block below proves it
      // shown).
      const value = await page
        .locator(".connected-band-upnext-value")
        .innerText();
      expect(value?.replace(/\s+/g, " ").trim()).toBe("REST 3:00");
      await expect(page.locator(".connected-band-upnext-then")).toHaveCount(0);

      // THE SAFETY FIX, MEASURED (James 2026-08-12): End's hit box is a
      // small fraction of the surface's width, not the full-width bar this
      // replaces (the old `.connected-end` was `button-l2`'s own
      // `width: 100%`, spanning the entire 390px).
      //
      // ONE ceiling, and a measured one (test-integrity sweep, P3). The
      // pair that used to sit here was `< 150` and `< surfaceWidth * 0.4`;
      // 0.4 of 390 is 156 and of 844 is 337.6, both above 150, so the
      // second line was satisfied by anything the first admitted and read
      // as an independent check without being one. The button measures
      // 45.8px, so 80 is a real ceiling rather than 3.3x headroom, and it
      // is still slack enough for padding and font tuning.
      const endBox = await page
        .getByRole("button", { name: "End session" })
        .boundingBox();
      expect(endBox).not.toBeNull();
      expect(endBox!.width).toBeLessThan(80);
      // OUT OF THE SWIPE CORRIDOR: pinned to the surface's TOP edge, not
      // hovering mid-screen where a rower's thumb actually crosses when
      // swiping panes.
      expect(endBox!.y).toBeLessThan(60);
    }
    if (name === "connected-pane-grid-long") {
      // PORTRAIT'S OWN DENSITY CLAIM (connected-revamp Task 5, JAMES RULING
      // 2026-08-12: "take all the rows" — the revision packet's 12 was
      // written before anyone measured a real build, and no code should
      // exist whose only job is to hide capacity a 40px-fixed-height row
      // genuinely has room for). SECOND RULING, same day, task-6 fix round:
      // the shipped 13 blamed the safety fix's 44px header for a row it did
      // not cost. The task-6 review measured the real spender — a footer
      // slot reserving 52px + 4px that stood EMPTY for the whole session
      // (the paused block only ever occupies it while the erg is stopped) —
      // and James ruled the space back to the pane. The footer is a
      // zero-height anchor now and the paused block overlays out of flow
      // (`index.css`'s `.connected-surface-footer`), which is what pays for
      // the count below.
      //
      // THE BUDGET IS PINNED, NOT ONLY THE INTEGER (review, Scrutiny 1b).
      // The count is derived — rows fit into a scroller — so asserting the
      // integer alone hides how close it came, and the shipped 13 was 4px
      // from reading 14. All four numbers are asserted instead: the row's
      // own fixed height, the scroller's exact height (the real budget, and
      // the one a font or padding drift moves), the count EXACTLY at the
      // ruling's number, and zero document overflow. Rows cannot shrink to
      // fake a higher count (the height is exact), content cannot spill
      // (overflow is zero), and a drift fails on `clientHeight` with the px
      // delta in the message rather than on a bare integer.
      //
      // The count was a floor until the test-integrity sweep (P2): given
      // the two exact assertions above it, `floor(clientHeight/40)` could
      // not fail unless one of them had already failed and aborted the
      // test. James's ruling is a number, so the number is what is pinned.
      // Measured, not derived: 15 (Task 6's own FIX ROUND moved this from
      // 16 — CRITICAL 1's header restructure costs the scroller one row's
      // worth of height, `PORTRAIT_GRID_SCROLLER_PX`'s own top comment has
      // the arithmetic), at another zero-slack EXACT fit — 600/40 is 15.0
      // precisely. A zero-slack fit is still an EXACT number, not a
      // fragile one: `clientHeight` is pinned above this assertion, so any
      // future px drift fails there FIRST, by its own delta, before this
      // line could ever see a fractional row.
      //
      // And the count is NOT merely implied by the two heights above, as
      // an earlier round's own note claimed (a re-review corrected it):
      // `rowHeight` samples `children[0]` alone while `visible` walks every
      // child, so later rows can diverge from the first. Proven — giving
      // `.connected-grid-row:not(:first-child)` a 50px height leaves
      // `rowHeight` 40 and `clientHeight` unchanged both green and fails
      // here on a wrong count (5 in landscape, at its own budget). This
      // line detects on its own.
      const m = await page.evaluate(() => {
        const scroller = document.querySelector(".connected-grid-rows")!;
        const box = scroller.getBoundingClientRect();
        const first = scroller.children[0]!.getBoundingClientRect();
        return {
          rowHeight: first.height,
          clientHeight: scroller.clientHeight,
          visible: Array.from(scroller.children).filter((el) => {
            const r = el.getBoundingClientRect();
            return r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
          }).length,
          docOverflow:
            document.documentElement.scrollHeight -
            document.documentElement.clientHeight,
        };
      });
      expect(m.rowHeight).toBe(40);
      expect(m.clientHeight).toBe(PORTRAIT_GRID_SCROLLER_PX);
      expect(m.visible).toBe(15);
      // The pane itself never scrolls: only the rows do (DEVIATIONS row 2).
      // Landscape has always pinned this; portrait did not until the fix
      // round, which is how a portrait overflow could have gone unseen.
      expect(m.docOverflow).toBe(0);
    }
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `${name}.png`),
    });
  });

  test(`${name}-landscape`, async ({ page }) => {
    // The phase's own landscape-first reference frame (handoff §3's
    // 844×390), the frame every pane spec's landscape column sizes are
    // quoted in.
    await page.setViewportSize({ width: 844, height: 390 });
    await showConnectedFixture(page, name);
    if (name === "connected-pane-live") {
      // UP NEXT'S LANDSCAPE STRING. RE-ANCHORED (CR2 spec 3 Task 4): the
      // band renders this line directly now, `.connected-band-upnext-
      // value`, not `UpNextStrip`'s own classes — PHASE CS Item B, task 2:
      // the then-clause is retired outright, so landscape's own value is
      // now IDENTICAL to portrait's, just with "NEXT · " ahead of it
      // (close-out queue item 7, James's ruling: the prefix prepends
      // always, landscape only — portrait's own stacked `UP NEXT` label
      // already names this line, so the prefix stays hidden there, proved
      // by the portrait block above). `innerText` for the same reason the
      // portrait block above uses it.
      const value = await page
        .locator(".connected-band-upnext-value")
        .innerText();
      expect(value?.replace(/\s+/g, " ").trim()).toBe("NEXT · REST 3:00");
      await expect(page.locator(".connected-band-upnext-then")).toHaveCount(0);
      // NOT VISUALLY CLIPPED — the bug `innerText` above cannot catch
      // (found by eye in the pre-redesign task's own first landscape
      // screenshot: the old `.timer-upnext-value`'s `text-overflow:
      // ellipsis` silently truncated this exact string, and `innerText`
      // still read the full un-clipped string throughout, because
      // ellipsis clips PAINT, not the DOM `innerText` walks — the same
      // risk applies to the band's own value, which keeps the identical
      // `text-overflow: ellipsis` safety net). `scrollWidth >
      // clientWidth` is what visual truncation actually looks like from
      // script.
      const overflow = await page
        .locator(".connected-band-upnext-value")
        .evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      // THE SAFETY FIX, MEASURED — landscape (844×390). Same claims as the
      // portrait block above: not full-width, and pinned to the top edge
      // rather than the vertical middle a swipe crosses.
      const endBox = await page
        .getByRole("button", { name: "End session" })
        .boundingBox();
      expect(endBox).not.toBeNull();
      // One measured ceiling, for the reason the portrait block sets out.
      expect(endBox!.width).toBeLessThan(80);
      expect(endBox!.y).toBeLessThan(60);
    }
    if (name === "connected-log-sheet") {
      // THE FOUR `.connected-surface .filter-sheet*` RULES, PINNED (task-7
      // review, L2b). They are the only thing standing between the log list
      // and the 35px — one and a half lines — it got at `.filter-sheet`'s
      // shipped defaults on this frame. Nothing in a unit test can see them:
      // the standard modal refactor (portalling `SheetShell` to
      // `document.body`) silently deletes all four by removing the
      // `.connected-surface` ancestor, and every other gate stays green. So
      // the measurement lives here, beside the five-row one, for the same
      // reason.
      const visible = await page.evaluate(() => {
        const list = document.querySelector(".connected-log-list")!;
        const box = list.getBoundingClientRect();
        return Array.from(list.children).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
        }).length;
      });
      expect(visible).toBeGreaterThanOrEqual(5);
      // Both controls are on the frame, and both clear the 44px floor.
      for (const label of ["COPY LOG", "Close"]) {
        const box = await page
          .locator(".filter-sheet button", { hasText: label })
          .boundingBox();
        expect(box, label).not.toBeNull();
        expect(box!.height, label).toBeGreaterThanOrEqual(44);
        expect(box!.y + box!.height).toBeLessThanOrEqual(390);
      }
    }
    if (name === "connected-pane-grid-long") {
      // THE REAL TAB ORDER, measured in the browser (task-7 review, M3;
      // REWRITTEN A SECOND TIME by connected-revamp Task 6, design spec
      // §9's own "Tab order changes twice"). Chromium makes a scroll
      // container keyboard-focusable when it has no focusable children, so
      // this pane's scroller was ALREADY the surface's first tab stop
      // before it carried a `tabindex` — as an unnamed `<div>`, invisible
      // to a jsdom pin. It is declared now, so the two engines agree and
      // iOS Safari (which supplies no implicit focus) behaves the same.
      // Task 6 moves End itself out of the shell's footer (after the pane
      // body in DOM order) into its header (before the pane body, the
      // safety fix's own placement — `ConnectedSurface.tsx`), which
      // reorders the first two stops: End now comes BEFORE the grid, not
      // after it. This is also the reading order in both orientations —
      // End sits above the grid on screen now.
      const tabOrder = await page.evaluate(() => {
        const stops: string[] = [];
        const focusables = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[tabindex], button, a[href], input, select, textarea",
          ),
        ).filter((el) => el.tabIndex >= 0);
        for (const el of focusables) {
          stops.push(
            el.getAttribute("aria-label") ??
              (el.textContent ?? "").trim().slice(0, 20),
          );
        }
        return stops;
      });
      // connected-revamp Task 2's own comment on this pin's first rewrite
      // ("Timer pane" drops out with the rail's third target, arity 5→4)
      // still applies to the arity; the ORDER within that arity is Task
      // 6's own second rewrite.
      expect(tabOrder.slice(0, 4)).toStrictEqual([
        "End session",
        "Interval grid",
        "Live pane",
        "Grid pane",
      ]);
      // JAMES RULING 2026-08-12 (connected-revamp Task 5, superseding the
      // packet's "8 fit at 36px"): 8 rows at 36px is 288px, which no
      // measured build of this frame has ever held, and the fixed row
      // height came down to 32px. TASK 6 SHIPPED 7 AT ZERO SLACK — the
      // review measured 224px of scroller against 224px of rows, so half a
      // pixel of growth anywhere above it would have turned the assertion
      // red with no clue why. SECOND RULING, task-6 fix round: the empty
      // footer's 52px goes back to the pane (see the portrait block above
      // for the mechanism), which restores the packet's original 8 AND
      // leaves real margin under it. Asserted in the BROWSER, because it is
      // a measurement — the row height, the header, the totals line, the
      // column head and the caption all have to land inside 844×390's
      // landscape frame for it to be true, and jsdom computes none of them.
      // An earlier run of this pane fitted five (the column headings were
      // rendering at the row type size, and the rows were 4px too tall);
      // the CSS carries the arithmetic that fixed it.
      //
      // The budget, not only the derived integer — same four assertions as
      // the portrait block above, and the same reasoning (review, Scrutiny
      // 1b). The floor is bounded on both sides by the exact row height and
      // the zero-overflow pin, so it cannot pass by rows shrinking.
      const m = await page.evaluate(() => {
        const scroller = document.querySelector(".connected-grid-rows")!;
        const box = scroller.getBoundingClientRect();
        const first = scroller.children[0]!.getBoundingClientRect();
        return {
          rowHeight: first.height,
          clientHeight: scroller.clientHeight,
          visible: Array.from(scroller.children).filter((el) => {
            const r = el.getBoundingClientRect();
            return r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
          }).length,
          docOverflow:
            document.documentElement.scrollHeight -
            document.documentElement.clientHeight,
        };
      });
      expect(m.rowHeight).toBe(32);
      expect(m.clientHeight).toBe(LANDSCAPE_GRID_SCROLLER_PX);
      // EXACT, not a floor, for the reason the portrait block sets out
      // (test-integrity sweep, P2): `floor(266/32)` is 8, so the FLOOR was
      // implied by the two exact assertions above it. The exact count is
      // not — `rowHeight` samples only `children[0]`, so uneven later rows
      // fail here (5) with both heights still green. Measured 8, at an
      // 8.3125 fit (CR2 close-out queue item 5 shrinks the budget from 286
      // to 266 — this block's own top comment has the arithmetic — which
      // shrinks the margin under 8 rows from 30px slack to 10px; still
      // short of fitting a 9th) — the packet's own count, unchanged by
      // this shrink.
      expect(m.visible).toBe(8);
      // ...and the pane itself never scrolls: only the rows do (DEVIATIONS
      // row 2). The document is exactly the viewport.
      expect(m.docOverflow).toBe(0);
    }
    if (name === "connected-ended") {
      // THE HAND-OFF FRAME KEEPS ITS OWN SPACING IN LANDSCAPE (task-6 fix
      // round). `.connected-surface-ended` declares `gap: 10px`, but Task 6
      // added `row-gap: 0` to the landscape `.connected-surface` rule —
      // equal specificity, declared later, so the row axis silently went to
      // zero on this frame and only on this frame. Nothing in jsdom can see
      // a cascade resolved across two media-scoped rules; the computed
      // value in a real 844×390 browser can, so the pin lives here.
      const gaps = await page
        .locator(".connected-surface-ended")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return { row: cs.rowGap, column: cs.columnGap };
        });
      expect(gaps).toStrictEqual({ row: "10px", column: "10px" });
    }
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `${name}-landscape.png`),
    });
  });
}
