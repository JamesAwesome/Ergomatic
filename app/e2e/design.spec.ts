import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInViaBackdoor } from "./helpers";

/** Deletes a signed-in user's own (non-global) workout by title, so a
 *  design-sweep test that has to create real data via bulk import doesn't
 *  accumulate stale rows across reruns against the same e2e email. Copied
 *  from builder.spec.ts's own `cleanupByTitle` — duplicated rather than
 *  shared across e2e files, same precedent as this codebase's other
 *  intentionally-duplicated small helpers (e.g. EditWorkout.tsx's
 *  loading/error states mirroring WorkoutDetail.tsx's). */
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

// Phase 6A (Task 5) fixtures — Today/Plan/Confirm all need real, non-empty
// data to sweep the layouts that actually ship (an empty library/no-plan
// state is a distinct, already-covered layout, not the one these three
// screens spend most of their life in). Same in-page-fetch idiom as
// screenshots.spec.ts/flows.spec.ts's own setBaselines: the api container's
// session cookie is Set-Cookie'd `Secure` (NODE_ENV=production), which
// Playwright's Node-side APIRequestContext doesn't get the loopback
// exemption for even though an in-page `fetch` does.
const DESIGN_BASELINES = { k2Seconds: 100, k6Seconds: 120 };

async function setBaselines(page: Page): Promise<void> {
  const result = await page.evaluate(async (patch) => {
    const res = await fetch("/api/baselines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, DESIGN_BASELINES);
  if (!result.ok) {
    throw new Error(`baseline setup failed: ${result.status} ${result.body}`);
  }
}

/** Activates a preset plan via the real `PUT /api/plan` route (Plan.tsx's
 *  own `choose`) — this is what puts a genuine 84-row sequence behind
 *  Today's plan-driven suggestion and the Plan screen's active view. */
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

/** Zeroes `doneN` unconditionally via `PUT /api/plan {reset:true}`
 *  (planState.ts's own `reset`: always sets doneN back to 0, leaving
 *  whatever `planKey` is already set untouched). Needed alongside
 *  `choosePlan` above because `choosePlan` only zeroes doneN when it
 *  actually *changes* the plan key (server/routes/data.ts: "re-selecting
 *  the SAME plan must be a no-op") — a per-worker email reused by every
 *  test in a describe block (this file's own convention) would otherwise
 *  leave doneN wherever a PRIOR test in the same worker left it, since
 *  `stores/logs.ts`'s own `create` bumps `plan_state.done_n` on every
 *  logged session (found while pinning "SESSION 1 OF 84" below — a design
 *  sweep account that seeds 3 logs before this call landed on "SESSION 4"
 *  the first time this was written). Calling this after `choosePlan` makes
 *  the fixture's end state (planKey=sprint, doneN=0) deterministic no
 *  matter how many times this email has run through this suite before. */
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

/** Seeds `count` real logs via `POST /api/logs` (the same route the 6C log
 *  screen will eventually write to) so Today's LAST THREE renders its
 *  populated layout rather than the "No sessions logged yet." empty state —
 *  the exact fixture-emptier-than-production blind spot CLAUDE.md's
 *  recurring-failures list warns about. */
async function seedLogs(page: Page, count: number): Promise<void> {
  const result = await page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutId: null,
          workoutTitle: `Design Sweep Session ${i + 1}`,
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

/** Navigates to a workout's detail screen by title via the real API list —
 *  used to reach Heat Lightning (server/seed/library/an.ts), one of the
 *  library's effort-ref AN workouts (`{effort:"max"}`, reps×10, a single
 *  repeated work step per rep, spm 32 — see Task 11's fixture-anchor
 *  mapping; the old 35-workout library had exactly one such workout,
 *  Microburst, but the current 300-workout library has 43. Fork Lightning
 *  used to hold this anchor role, but the content rewrite (a62c33f) turned
 *  its reps block into TWO alternating work steps, which breaks the
 *  "exactly one ALL OUT row" assumption this file's confirm-targets sweep
 *  makes (same reason `ConfirmTargets.test.tsx` re-anchored) — without
 *  hardcoding its seeded id. */
async function gotoWorkoutByTitle(page: Page, title: string): Promise<void> {
  const workout = await page.evaluate(async (t) => {
    const res = await fetch("/api/workouts");
    const workouts = (await res.json()) as Array<{
      id: string;
      title: string;
    }>;
    return workouts.find((w) => w.title === t) ?? null;
  }, title);
  if (!workout) {
    throw new Error(`workout not found: ${title}`);
  }
  await page.goto(`/library/${workout.id}`);
}

// Phase 6B (Task 5): the session-route sweeps below (countdown, timer,
// session complete) all need a tiny bulk-imported workout driven through
// the real START -> countdown -> timer flow, not a seeded library workout —
// same three-step idiom as e2e/session.spec.ts's own identical helpers,
// duplicated here per this file's own stated precedent (see
// `cleanupByTitle`'s own comment above) rather than shared across files.

/** Bulk-imports `text` and waits for the redirect back to /library. */
async function importBulk(page: Page, text: string): Promise<void> {
  await page.goto("/library/import");
  await page.getByLabel("Bulk import text").fill(text);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
}

/** Opens `title`'s detail page from the library list and presses Start,
 *  landing on Confirm. */
async function startFromLibrary(page: Page, title: string): Promise<void> {
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/session\/confirm$/);
}

/** START on Confirm, then SKIP the countdown, landing on the live timer. */
async function startAndSkipCountdown(page: Page): Promise<void> {
  await page.getByRole("button", { name: "START" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
  await expect(page.getByText("GET ON THE HANDLE")).toBeVisible();
  await page.getByRole("button", { name: "SKIP ›" }).click();
  await expect(page).toHaveURL(/\/session\/run$/);
}

/** Same in-page-fetch idiom as `setBaselines` above, but with the caller's
 *  own values — needed by the session-complete sweep below, which (like
 *  e2e/session.spec.ts's own identical fixture) prices its distance phase's
 *  estimate off `k2Seconds` specifically, tuned to land NEXT inside a safe,
 *  non-suspect timing window, rather than the fixed `DESIGN_BASELINES` pair
 *  every other describe in this file uses. */
async function setCustomBaselines(
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

// Structural design rules, asserted against the real rendered app rather
// than a mock — a failure here is a real finding about the shipped UI, not
// a fixture drift. See docs/superpowers/specs/2026-07-28-testing-
// validation-design.md ("no pixel-diff gating; machines judge rules").

async function assertTapTargets(page: Page): Promise<void> {
  const elements = await page
    .locator("a, button, [role=button], input, select")
    .all();
  for (const el of elements) {
    if (!(await el.isVisible())) continue;
    const className = await el.evaluate(
      (node) => (node as HTMLElement).className,
    );
    // The one narrow, already-documented exception (docs/design/
    // DEVIATIONS.md, "N/A — the handoff has no notion of a 'convenience'
    // tap area..."): StepCard.tsx's collapsed `.step-card-line1` (326x18)
    // and `.step-card-sub` (180x14) each duplicate the fully-compliant
    // 48x44 EDIT cell's own onExpand action, in the same card, at less than
    // 44x44 — WCAG 2.5.8's Equivalent Control exception covers exactly
    // this. The project's own stricter, exception-free 44px rule still
    // treats these as a genuine, accepted violation (per DEVIATIONS.md);
    // excluding them here is that one recorded carve-out, not a general
    // weakening of this sweep.
    if (
      typeof className === "string" &&
      (className.includes("step-card-line1") ||
        className.includes("step-card-sub"))
    ) {
      continue;
    }
    const box = await el.boundingBox();
    const label = await el.evaluate((node) => node.outerHTML.slice(0, 120));
    expect(box, `missing bounding box for: ${label}`).not.toBeNull();
    expect(box!.width, `width < 44 for: ${label}`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `height < 44 for: ${label}`).toBeGreaterThanOrEqual(44);
  }
}

async function assertNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

// --ink-4's own rgb (tokens.css #6f6a5f) — computed once here rather than
// re-derived per call site.
const INK_4_RGB = "rgb(111, 106, 95)";

/** Task 1 (ui-fix round) contrast sweep: docs/design/handoffs/2026-08-03-
 *  ui-fix/DESIGN.md's contrast note — "All small mono labels in the mockup
 *  are --ink-3 or darker" — --ink-4 measures only 4.48:1 against
 *  --surface-sunken (index.css's own token comment), just under the 4.5:1
 *  AA floor, even though it clears comfortably against --page/--surface
 *  (4.76:1/5.29:1). Walking every leaf element rather than asserting a
 *  fixed list of selectors is deliberate: a label some future task adds at
 *  this size inherits the same guard automatically instead of needing its
 *  own new pin. Leaf-only (no element children) — a wrapper's own computed
 *  font-size/color describe layout, not what's actually painted as text. */
async function assertNoFailingInk4Labels(page: Page): Promise<void> {
  const offenders = await page.evaluate((ink4) => {
    const bad: string[] = [];
    document.querySelectorAll("body *").forEach((node) => {
      const el = node as HTMLElement;
      if (el.children.length > 0) return;
      if ((el.textContent ?? "").trim() === "") return;
      const style = getComputedStyle(el);
      const fontSize = parseFloat(style.fontSize);
      const isMono = style.fontFamily.toLowerCase().includes("mono");
      if (fontSize <= 11 && isMono && style.color === ink4) {
        bad.push(
          `${el.tagName}.${el.className || "(no class)"}: "${(el.textContent ?? "").slice(0, 40)}"`,
        );
      }
    });
    return bad;
  }, INK_4_RGB);
  expect(offenders).toEqual([]);
}

test.describe("sign-in screen (signed out)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and primary button match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const buttonBg = await page
      .getByRole("link", { name: /continue with google/i })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(buttonBg).toBe("rgb(181, 52, 31)"); // --accent
  });
});

test.describe("signed-in home", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design@e2e.test",
      name: "Design Tester",
    });
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background matches the token palette", async ({ page }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page
  });
});

test.describe("library screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-library@e2e.test",
      name: "Design Library Tester",
    });
    await page.goto("/library");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // L1 (whole-branch review): this describe renders `.workout-row-meta`
  // (11px mono), a guard-gap the ink-4 sweep never covered on this screen.
  // Waits for a real row first — unlike every other describe this sweep
  // runs in, this one's own `beforeEach` only navigates (no locator-based
  // wait), so the workouts fetch can still be in flight when a raw
  // `page.evaluate()` (no auto-wait, unlike a locator action) would
  // otherwise run against a still-empty list.
  test("no mono label ≤11px still paints at --ink-4", async ({ page }) => {
    await page.locator(".workout-row").first().waitFor();
    await assertNoFailingInk4Labels(page);
  });

  // Task 6 (ui-fix round, close-out): this axe scan used to exist only as a
  // one-off manual probe run by Task 4's own reviewer (N5: "I ran axe
  // (wcag2a+wcag2aa) against the open sheet and against a filtered token
  // row: zero violations in both") — never codified as a structural test, so
  // nothing would have caught a future regression here. This is that
  // codification, against the SAME two states the reviewer checked by hand:
  // the sheet open (FilterSheet.tsx's `role="dialog"`/`aria-modal="true"`,
  // the first such element in the codebase, per N5) and a filtered token
  // row. N5's own separate finding — `aria-modal="true"` with no focus trap
  // or focus restore — is a real, accepted Minor gap axe cannot see either
  // way; recorded, not fixed here (out of this task's scope; see the task-4
  // review for the full writeup).
  test("zero WCAG 2A/2AA violations with the FILTER sheet open", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await assertNoA11yViolations(page);
  });

  test("zero WCAG 2A/2AA violations with an active filter token on screen", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "O2", exact: true })
      .click();
    await page.getByRole("button", { name: /^Show \d+ workouts?$/ }).click();
    await expect(
      page.locator(".filter-token", { hasText: "O2" }),
    ).toBeVisible();
    await assertNoA11yViolations(page);
  });

  test("body background matches the token palette", async ({ page }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page
  });

  // Task 4 (ui-fix round): a TYPE token fills with its own type colour, the
  // same selected-state rule DESIGN.md extends from chips to tokens — never
  // a flat accent regardless of which type is active.
  test("a TYPE token fills with its own type colour, not accent", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "O2", exact: true })
      .click();
    await page.getByRole("button", { name: /^Show \d+ workouts?$/ }).click();

    const tokenBg = await page
      .locator(".filter-token", { hasText: "O2" })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(tokenBg).toBe("rgb(42, 98, 117)"); // --type-o2, not --accent
  });

  // Task 4 (ui-fix round): every other token kind fills plain ink.
  test("a non-TYPE token (e.g. LAST DONE) fills ink, not accent", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "21D+", exact: true })
      .click();
    await page.getByRole("button", { name: /^Show \d+ workouts?$/ }).click();

    const tokenBg = await page
      .locator(".filter-token", { hasText: "21D+" })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(tokenBg).toBe("rgb(27, 26, 23)"); // --ink
  });

  // iOS device report, 2026-08-01: long-pressing a filter chip or a
  // workout row popped the text-selection callout (Copy/Look Up/
  // Translate) — WKWebView treats button/link text as selectable unless
  // told otherwise. Chromium can only assert the computed style; the
  // callout behaviour itself is verified on device (see index.css).
  test("the FILTER toggle and workout row resist the iOS text-selection callout", async ({
    page,
  }) => {
    const toggleSelect = await page
      .getByRole("button", { name: "FILTER ⌄" })
      .evaluate((el) => getComputedStyle(el).userSelect);
    expect(toggleSelect).toBe("none");

    const rowSelect = await page
      .locator(".workout-row")
      .first()
      .evaluate((el) => getComputedStyle(el).userSelect);
    expect(rowSelect).toBe("none");
  });

  // Fix round 1 (F1, James's ruling): `--type-tr` used to be the IDENTICAL
  // hex to `--accent` — every TR badge/chip filled with what was
  // structurally "accent". A fresh account's 300-workout generated library
  // (server/seed/library/index.ts) always include several TR workouts, so
  // this pins the resolved colour on a REAL `.type-badge` here, not just the
  // chip contexts (Today/Builder, asserted in their own describes) — the
  // same `.type-badge` class Library/Plan/Today's LAST THREE all share.
  // `--on-color` text on `--ink` background measures 17.1:1, the identical
  // pairing `--type-test` already used before this fix (TypeBadge.tsx sets
  // a fixed `--on-color` label regardless of which type fills the
  // background).
  test("a TR type badge fills ink, not accent, with on-color text", async ({
    page,
  }) => {
    const trBadge = page.locator(".type-badge", { hasText: "TR" }).first();
    await expect(trBadge).toBeVisible();
    const styles = await trBadge.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color };
    });
    expect(styles.background).toBe("rgb(27, 26, 23)"); // --type-tr = --ink
    expect(styles.color).toBe("rgb(255, 253, 247)"); // --on-color
  });
});

test.describe("workout detail screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-detail@e2e.test",
      name: "Design Detail Tester",
    });
    await page.goto("/library");
    await page.locator(".workout-row").first().click();
    await expect(page.locator(".workout-detail-title")).toBeVisible();
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and the back link match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const backLinkColor = await page
      .locator(".back-link")
      .evaluate((el) => getComputedStyle(el).color);
    expect(backLinkColor).toBe("rgb(27, 26, 23)"); // --ink
  });

  test("no small mono label uses the failing --ink-4 color", async ({
    page,
  }) => {
    await assertNoFailingInk4Labels(page);
  });

  // Task 1 (ui-fix round): Start is the screen's one L1, at the level
  // system's own 56px — not the pre-Task-1 `.button-primary`'s 52px (which
  // itself under-rendered further still, DEVIATIONS.md's IMP-6 row: a real
  // `<button>`'s UA chrome added ~6px on top of THAT). `.button-l1` zeroes
  // padding/border explicitly so this is the first button in the app whose
  // rendered height actually equals its own spec.
  test("Start is the screen's one L1 action, rendered at 56px", async ({
    page,
  }) => {
    const l1 = page.locator(".button-l1");
    await expect(l1).toHaveCount(1);
    await expect(l1).toHaveText("Start");
    const height = await l1.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBe(56);

    // Fix round 1 (F2, reviewer finding): the one-L1 count alone couldn't
    // tell a genuine L1 migration from a screen that ALSO still rendered a
    // legacy `.button-primary` block sitting outside the level system
    // entirely (WorkoutDetail's own staged-delete panel did exactly this
    // until F2). Asserted on every one-L1 screen's sweep now.
    await expect(page.locator(".button-primary")).toHaveCount(0);
  });
});

// Task 8's `.button-outline` fix (color/text-decoration/inline-flex, so the
// Edit link stops falling through to the browser's default blue underline)
// has no visual home in jsdom at all — CSS never applies there — so this is
// its only real-browser proof. It needs its own describe rather than a test
// added to "workout detail screen" above: OwnerActions (WorkoutDetail.tsx)
// renders Edit/Delete only for `!workout.isGlobal`, and that describe's own
// beforeEach opens the first `.workout-row`, which is always one of the
// seeded (global, read-only) library workouts — Edit/Delete never render
// there at all. Author a personal workout through the builder instead, the
// only way to land on a workout this signed-in user actually owns.
test.describe("workout detail screen (personal workout, owner actions)", () => {
  const title = "Design Owner Actions Sweep";

  // Per-worker email, same reasoning as the "edit mode with a stored
  // warm-up row" describe below: this test creates real data (a saved
  // workout) rather than only reading, and Playwright's fullyParallel
  // config can run this file's tests across several workers at once — a
  // fixed shared email raced two workers' concurrent sign-ins into a 500
  // from the backdoor route in that describe, so this one avoids the same
  // failure mode up front rather than waiting to hit it.
  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-detail-owner-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Detail Owner Tester",
    });
    await page.goto("/library/new");
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Pain 3" }).click();
    await page.getByLabel("Row 1 duration", { exact: true }).fill("2000");
    await page.getByRole("button", { name: "Save to library" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("Edit and Delete are on-palette, not default browser link blue", async ({
    page,
  }) => {
    const edit = page.getByRole("link", { name: "Edit" });
    await expect(edit).toBeVisible();

    const styles = await edit.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, decoration: s.textDecorationLine };
    });
    expect(styles.color).toBe("rgb(27, 26, 23)"); // --ink
    expect(styles.decoration).toBe("none");
  });

  // Task 1 (ui-fix round): one merged `.action-stack` — Edit (L2, 52px) and
  // Delete workout (L4, 52px) render as this owned workout's own stack
  // items, under a rule divider, rather than a second detached block.
  //
  // Fix round 1 (F3, reviewer finding): the prior version of this test only
  // checked that Edit/Delete's Y positions fell somewhere inside the
  // stack's own bounding box — a `display: contents` -> `display: block`
  // regression on `.workout-owner-actions` (index.css) still passes THAT
  // check (Edit/Delete would still render inside the stack's box, just as
  // a nested column with its own margin) while silently collapsing the
  // shared 12px gap to whatever margin that nested block happens to carry.
  // This measures the actual gaps between consecutive stack children
  // (Edit-bottom -> rule-top, rule-bottom -> Delete-top) — the thing
  // `display: contents` is actually FOR — rather than mere containment.
  test("Edit and Delete workout render at the level system's 52px, 12px apart, under a rule, inside the one action stack", async ({
    page,
  }) => {
    const stack = page.locator(".action-stack");
    await expect(stack).toHaveCount(1);

    const edit = page.getByRole("link", { name: "Edit" });
    const editHeight = await edit.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(editHeight).toBe(52);
    await expect(edit).toHaveClass(/button-l2/);

    const del = page.getByRole("button", {
      name: "Delete workout",
      exact: true,
    });
    const delHeight = await del.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(delHeight).toBe(52);
    await expect(del).toHaveClass("button-l4");
    const delColor = await del.evaluate((el) => getComputedStyle(el).color);
    expect(delColor).toBe("rgb(181, 52, 31)"); // --accent, outlined not solid

    const rule = stack.locator(".action-stack-rule");
    await expect(rule).toHaveCount(1);

    const editBox = (await edit.boundingBox())!;
    const ruleBox = (await rule.boundingBox())!;
    const delBox = (await del.boundingBox())!;

    // The real proof `display: contents` (index.css) is doing its job:
    // Edit/Delete and the rule share the SAME 12px gap `.action-stack`
    // declares for its own direct children — not "inside the box
    // somewhere," a check a collapsed/degenerate gap could still satisfy.
    expect(Math.round(ruleBox.y - (editBox.y + editBox.height))).toBe(12);
    expect(Math.round(delBox.y - (ruleBox.y + ruleBox.height))).toBe(12);
  });

  // Fix round 1 (F2): the old two-button staged-confirm panel (Cancel
  // beside a second solid-accent "Delete workout") is gone — Delete workout
  // now arms IN PLACE, the level system's own L4/L4-armed idiom (fills
  // solid accent, copy swaps to "Tap again to delete"), same shape as
  // Discard elsewhere in this round. Disarms on blur; the 4s auto-disarm
  // timer itself is proven in WorkoutDetail.test.tsx (jsdom fake timers),
  // not re-proven here in real time.
  test("Delete workout arms in place (solid accent, 'Tap again to delete') and disarms on blur", async ({
    page,
  }) => {
    const del = page.getByRole("button", {
      name: "Delete workout",
      exact: true,
    });
    await expect(del).toHaveClass("button-l4");

    await del.click();
    // Playwright's own click leaves the mouse resting on the button, so
    // its `:hover` rule (index.css, same fix round's own F7) would
    // otherwise paint `--accent-hover` here instead of the armed state's
    // OWN base `--accent` fill — move the pointer away first so this reads
    // the resting armed style, not the hovered one.
    await page.mouse.move(0, 0);
    const armed = page.getByRole("button", { name: "Tap again to delete" });
    await expect(armed).toHaveClass("button-l4-armed");
    const armedStyles = await armed.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color };
    });
    expect(armedStyles.background).toBe("rgb(181, 52, 31)"); // --accent
    expect(armedStyles.color).toBe("rgb(255, 253, 247)"); // --on-color

    await armed.evaluate((el) => (el as HTMLElement).blur());
    await expect(
      page.getByRole("button", { name: "Delete workout", exact: true }),
    ).toHaveClass("button-l4");
    await expect(
      page.getByRole("button", { name: "Tap again to delete" }),
    ).toHaveCount(0);
  });
});

// Phase 6A (Task 5): Today, Plan, and Confirm targets each get their own
// sweep run against real data — a plan active, logs present — rather than
// the empty/no-plan/no-baselines state every one of these screens also
// renders. That fallback state is a real, distinct layout (and is already
// exercised structurally by "signed-in home" above, which signs in fresh
// with no setup at all), but the plan-driven suggestion, the 84-row
// sequence, and the effort-step confirm row only ever render once there's
// something behind them — sweeping only the empty state would repeat
// exactly the fixture blind spot CLAUDE.md's recurring-failures list warns
// about (#3: "every test used an empty library").
test.describe("today screen (plan active, logs present)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Per-worker email: this describe mutates real per-user state (baselines,
    // plan, logs) via the API, and Playwright's fullyParallel config can run
    // this file's tests across several workers at once — same reasoning as
    // the "workout detail screen (personal workout, owner actions)" describe
    // above.
    await signInViaBackdoor(page, {
      email: `design-today-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Today Tester",
    });
    await setBaselines(page);
    await seedLogs(page, 3);
    await choosePlan(page, "sprint");
    // Deterministic doneN: see resetPlanProgress's own comment — logs.create
    // bumps doneN on every seeded log, and a per-worker email reused across
    // this describe's tests would otherwise carry doneN forward from
    // whatever a prior test in the same worker left it at.
    await resetPlanProgress(page);
    await page.goto("/today");
    // Today races five concurrent data hooks (workouts/baselines/plan/
    // preferences/recentLogs) and renders "LOADING…" until all five
    // resolve — wait for the suggested-workout card itself, not just
    // navigation, before sweeping (the same LOADING race that caught the
    // committed `signed-in-home.png`/`today.png` screenshot — see this
    // task's handoff).
    await expect(page.locator(".today-card")).toBeVisible();
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("the suggested card, session line, and LAST THREE meta match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    // Plan-driven (sprint, doneN 0 -> "O2"): the header names the real
    // session number rather than the freestyle FREESTYLE line.
    await expect(page.locator(".today-plan-line")).toContainText(
      "SESSION 1 OF 84",
    );

    const cardBorder = await page
      .locator(".today-card")
      .evaluate((el) => getComputedStyle(el).borderColor);
    expect(cardBorder).toBe("rgb(27, 26, 23)"); // --ink

    // LAST THREE's own mono meta line ("JUL 25 · HELD · 2/5" shape) — Task 1
    // (ui-fix round) moved this off --ink-4 (4.76:1 here, but part of the
    // blanket "no small mono label reads --ink-4" sweep DESIGN.md's contrast
    // note calls for) onto --ink-3, same substitution as every other small
    // mono label this task's sweep touched (index.css).
    const logMetaColor = await page
      .locator(".today-log-meta")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(logMetaColor).toBe("rgb(87, 84, 76)"); // --ink-3
  });

  test("no small mono label uses the failing --ink-4 color", async ({
    page,
  }) => {
    await assertNoFailingInk4Labels(page);
  });

  // Fix round 1 (F2, reviewer finding): Today never had an L1 of its own,
  // but the "one-L1 + no legacy .button-primary" sweep still applies —
  // asserted here rather than skipped just because there's no L1 count to
  // pair it with.
  test("no legacy .button-primary renders on this screen", async ({ page }) => {
    await expect(page.locator(".button-primary")).toHaveCount(0);
  });

  // Today enhancements (Task 4): the chip row's default aria-pressed state
  // matches the server preferences it was derived from on first mount
  // (todayOverrides.ts's own fallback — DESIGN_BASELINES' fixture never
  // touches /api/prefs, so this is the server's own default row: every
  // difficulty, a 60-min cap, no pain filter) — and the swap chips read the
  // plan's own prescribed type with nothing swapped yet.
  //
  // Task 3 (2026-08-04 round): DIFFICULTY/TIME/PAIN no longer render inline
  // — the FILTER ⌄ sheet has to be opened first to reach them; the O2/AN/
  // AT/TR type-swap chips are untouched (they stay on the plan line, never
  // moved into the sheet).
  test("the chip row's default aria-pressed state matches the unmodified server preferences", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    const dialog = page.getByRole("dialog");
    for (const label of ["EASY", "MEDIUM", "HARD"]) {
      await expect(
        dialog.getByRole("button", { name: label, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    await expect(
      dialog.getByRole("button", { name: "≤60′", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    for (const label of ["≤30′", "≤45′", "≤90′", "NO CAP"]) {
      await expect(
        dialog.getByRole("button", { name: label, exact: true }),
      ).toHaveAttribute("aria-pressed", "false");
    }
    const painGroup = dialog.getByRole("group", { name: "PAIN" });
    for (const level of ["1", "2", "3", "4", "5"]) {
      await expect(
        painGroup.getByRole("button", { name: level, exact: true }),
      ).toHaveAttribute("aria-pressed", "false");
    }
    // Sprint's doneN=0 code is "O2" (SPRINT_WEEKS week 0, index 0) — the O2
    // type chip reads active with nothing swapped, the other three don't.
    // Queried page-wide (not scoped to `dialog`): the type-swap chips live
    // on the plan line, outside the sheet, and no name here collides with
    // anything the sheet itself renders.
    await expect(
      page.getByRole("button", { name: "O2", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    for (const label of ["AN", "AT", "TR"]) {
      await expect(
        page.getByRole("button", { name: label, exact: true }),
      ).toHaveAttribute("aria-pressed", "false");
    }
  });

  // Today enhancements (Task 4): the swap state itself — tapping a
  // different type chip shows the plan line's own `→` arrow and flips
  // aria-pressed on both the newly-active and newly-inactive chip; tapping
  // the plan's own prescribed chip again (the "un-swap" rule,
  // handleTypeChip's own doc comment) clears it.
  test("tapping a different type chip shows the swap arrow in the plan line; tapping the prescribed chip again clears it", async ({
    page,
  }) => {
    const o2Chip = page.getByRole("button", { name: "O2", exact: true });
    const atChip = page.getByRole("button", { name: "AT", exact: true });

    await atChip.click();
    await expect(atChip).toHaveAttribute("aria-pressed", "true");
    await expect(o2Chip).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".today-plan-line")).toContainText("O2 → AT");

    await o2Chip.click();
    await expect(o2Chip).toHaveAttribute("aria-pressed", "true");
    await expect(atChip).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".today-plan-line")).not.toContainText("→");
  });

  // Task 1 (ui-fix round): "the fix for Today vs Builder" — a selected type
  // chip fills with ITS OWN type color (identical rule to Builder's
  // ClassificationCard, DESIGN.md's "Identical chip whether the rower is
  // filtering or authoring"), never the flat accent red this used to render
  // (the bug DESIGN.md names explicitly). Every OTHER selection here
  // (DIFFICULTY/TIME/PAIN) fills ink instead — accent no longer means
  // "selected" anywhere on this screen.
  //
  // Fix round 1 (F1, James's ruling): TR is asserted explicitly, not just
  // O2/AT — `--type-tr` used to be the IDENTICAL hex to `--accent`, so a
  // selected TR chip rendered "accent" by coincidence and this exact test,
  // checking only two of the four types, never caught it. TR now resolves
  // to `--ink` (tokens.css).
  test("the active type-swap chip fills with its own type color, not accent", async ({
    page,
  }) => {
    const o2Chip = page.getByRole("button", { name: "O2", exact: true });
    const o2Bg = await o2Chip.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(o2Bg).toBe("rgb(42, 98, 117)"); // --type-o2, not --accent

    const atChip = page.getByRole("button", { name: "AT", exact: true });
    await atChip.click();
    const atBg = await atChip.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(atBg).toBe("rgb(138, 95, 24)"); // --type-at

    const trChip = page.getByRole("button", { name: "TR", exact: true });
    await trChip.click();
    const trBg = await trChip.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(trBg).toBe("rgb(27, 26, 23)"); // --type-tr = --ink, NOT --accent
  });

  // Task 3 (2026-08-04 round): re-targeted at the FILTER sheet's own cells —
  // the assertion's intent (ink, never accent, on both the cells AND the
  // tokens `--ink` resolves to) is unchanged, only the location moved.
  test("selected DIFFICULTY/TIME/PAIN chips fill ink, never accent", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    const dialog = page.getByRole("dialog");

    const easyChip = dialog.getByRole("button", { name: "EASY", exact: true });
    const easyBg = await easyChip.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(easyBg).toBe("rgb(27, 26, 23)"); // --ink

    const capChip = dialog.getByRole("button", { name: "≤60′", exact: true });
    const capBg = await capChip.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(capBg).toBe("rgb(27, 26, 23)"); // --ink

    const painCell = dialog
      .getByRole("group", { name: "PAIN" })
      .getByRole("button", { name: "3", exact: true });
    await painCell.click();
    const painBg = await painCell.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(painBg).toBe("rgb(27, 26, 23)"); // --ink
  });

  // Item 4 (DESIGN.md): SHUFFLE stops being "its own species" — 44px chip
  // geometry, transparent fill, mono 11/0.14em ink-1 label, 1px rule-3
  // border, parked right of the header label (unchanged position). Pool is
  // the day's O2 entries from the 300-workout library, unfiltered
  // (difficulty/cap/pain all at their default, unset state) — comfortably
  // >1 member with this describe's fixture, so SHUFFLE is enabled here.
  test("SHUFFLE re-cut to chip geometry: 44px, transparent, mono ink-1 label, rule-3 border", async ({
    page,
  }) => {
    const shuffle = page.getByRole("button", { name: "SHUFFLE ↻" });
    await expect(shuffle).toBeEnabled();
    const styles = await shuffle.evaluate((el) => {
      const s = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        height: box.height,
        background: s.backgroundColor,
        borderColor: s.borderColor,
        borderStyle: s.borderStyle,
        color: s.color,
        fontFamily: s.fontFamily,
      };
    });
    expect(styles.height).toBe(44);
    expect(styles.background).toBe("rgba(0, 0, 0, 0)"); // transparent
    expect(styles.borderColor).toBe("rgb(201, 195, 178)"); // --rule-3
    expect(styles.borderStyle).toBe("solid");
    expect(styles.color).toBe("rgb(27, 26, 23)"); // --ink-1 (alias of --ink)
    expect(styles.fontFamily.toLowerCase()).toContain("mono");
  });

  // Fix round 1 (F4): SHUFFLE's disabled state (pool <= 1) — ink-5 label,
  // DASHED rule-3 border, no grey fill — computed, not just `toBeDisabled`.
  // This describe's fixture is sprint/doneN=0 (O2 for today, DESIGN_
  // BASELINES {k2Seconds:100, k6Seconds:120}). Rebase seed-math note
  // (2026-08-04): the 300-workout library has ZERO O2/HARD entries at all
  // (aerobic-base work is never authored "hard" — see library.test.ts's own
  // PAIN_BY_TYPE/PAIN_BY_DIFF bands), so a natural pool-of-one no longer
  // exists the way the old 35-starter library's "High Pressure"/"Jet
  // Stream" pair once provided one. Built here instead: one personal O2/
  // HARD workout under the 60' cap, via bulk import — with zero global O2/
  // HARD entries to join it, narrowing to HARD-only + <=60' leaves exactly
  // this one row.
  test("SHUFFLE disabled (pool of 1): ink-5 label, dashed rule-3 border, no fill", async ({
    page,
  }) => {
    const soloTitle = "Design Sweep Solo O2 Hard";
    await importBulk(
      page,
      [`${soloTitle} | O2 | hard | 4`, "wu 5", "w 20:00 6k+10 @20"].join("\n"),
    );
    await page.goto("/today");
    await expect(page.locator(".today-card")).toBeVisible();

    // Task 3 (2026-08-04 round): the setup that narrows to this solo
    // fixture moves through the FILTER sheet — EASY/MEDIUM/≤60′ no longer
    // render inline. ≤60′ is already the default cap (server preference
    // 60, snapCap unchanged) — re-clicking it is a harmless no-op, kept for
    // the same "explicitly narrow to HARD + ≤60′" clarity the original
    // setup had.
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "EASY", exact: true }).click();
    await dialog.getByRole("button", { name: "MEDIUM", exact: true }).click();
    await dialog.getByRole("button", { name: "≤60′", exact: true }).click();
    await page.getByRole("button", { name: /^Show \d+ options?$/ }).click();

    const shuffle = page.getByRole("button", { name: "SHUFFLE ↻" });
    await expect(shuffle).toBeDisabled();
    const styles = await shuffle.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        borderColor: s.borderColor,
        borderStyle: s.borderStyle,
        color: s.color,
      };
    });
    expect(styles.background).toBe("rgba(0, 0, 0, 0)"); // no fill
    expect(styles.borderColor).toBe("rgb(201, 195, 178)"); // --rule-3
    expect(styles.borderStyle).toBe("dashed");
    expect(styles.color).toBe("rgb(160, 154, 140)"); // --ink-5

    await cleanupByTitle(page, soloTitle);
  });

  // Task 3 (2026-08-04 round): structural sweeps against the FILTER sheet
  // itself — mirrors design.spec.ts's own Library "the FILTER sheet open"/
  // "an active filter token on screen" pair (Task 6, ui-fix round) for the
  // identical SheetShell/CellGrid/TokenRow machinery reused here.
  test("zero WCAG 2A/2AA violations with the FILTER sheet open", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await assertNoA11yViolations(page);
  });

  test("zero WCAG 2A/2AA violations with an active filter token on screen", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("group", { name: "PAIN" })
      .getByRole("button", { name: "3", exact: true })
      .click();
    await page.getByRole("button", { name: /^Show \d+ options?$/ }).click();
    await expect(
      page.locator(".filter-token", { hasText: "PAIN 3" }),
    ).toBeVisible();
    await assertNoA11yViolations(page);
  });

  test("every visible interactive element still meets the 44px floor with the FILTER sheet open", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await assertTapTargets(page);
  });

  test("every visible interactive element still meets the 44px floor with an active filter token on screen", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("group", { name: "PAIN" })
      .getByRole("button", { name: "3", exact: true })
      .click();
    await page.getByRole("button", { name: /^Show \d+ options?$/ }).click();
    await expect(
      page.locator(".filter-token", { hasText: "PAIN 3" }),
    ).toBeVisible();
    await assertTapTargets(page);
  });

  test("no mono label ≤11px still paints at --ink-4 with the FILTER sheet open", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await assertNoFailingInk4Labels(page);
  });

  // CellGrid.tsx's own `role="group"` + `aria-labelledby` (fix round 1,
  // whole-branch review M3, present at HEAD for this round) restores the
  // accessible group name Today's pre-extraction inline chip groups had —
  // pinned here now that all three groups live inside the sheet.
  test("DIFFICULTY/TIME/PAIN each expose a role=group with the visible label as its accessible name", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("group", { name: "DIFFICULTY" }),
    ).toBeVisible();
    await expect(dialog.getByRole("group", { name: "TIME" })).toBeVisible();
    await expect(dialog.getByRole("group", { name: "PAIN" })).toBeVisible();
  });
});

// Task 3 (ui-fix round): Today's unlogged row gains a 44×44 accent-outlined
// ✕ that arms IN PLACE — a real timer run driven all the way to
// /session/complete, then a bare `/today` nav WITHOUT ever logging it, is
// the only way to land a completed-but-unlogged run record here (same
// "drive the real flow" idiom as e2e/session.spec.ts's own discard test).
test.describe("today screen (unlogged session row)", () => {
  const title = "Design Unlogged Row Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-unlogged-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Unlogged Tester",
    });
    await setBaselines(page);
    await importBulk(
      page,
      [`${title} | AN | easy | 1`, "w 0:03 6k"].join("\n"),
    );
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page).toHaveURL(/\/session\/complete$/, { timeout: 6000 });
    await page.getByRole("button", { name: "Back to Today" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByText(/unlogged session/i)).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // The DEFAULT state's own ✕ — outlined, never solid (DEVIATIONS.md #2).
  test("the row's ✕ is 44x44 and accent-outlined at rest", async ({ page }) => {
    const discardBtn = page.getByRole("button", {
      name: "Discard without logging",
    });
    const box = (await discardBtn.boundingBox())!;
    expect(box.width).toBe(44);
    expect(box.height).toBe(44);
    const styles = await discardBtn.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, borderColor: s.borderColor };
    });
    expect(styles.background).toBe("rgba(0, 0, 0, 0)"); // no fill
    expect(styles.borderColor).toBe("rgb(181, 52, 31)"); // --accent
  });

  // Arming swaps the ROW's CONTENTS, not its layout (DESIGN.md's own words):
  // border -> accent, text -> "Discard {title} without logging?", ✕ ->
  // solid accent "Tap again" — and the row's own box stays the same size and
  // position throughout.
  test("arming swaps the row's contents in place — border to accent, text to the discard question, ✕ to a solid 'Tap again' — without moving the row", async ({
    page,
  }) => {
    const row = page.locator(".today-unlogged-line");
    const boxBefore = (await row.boundingBox())!;

    await page.getByRole("button", { name: "Discard without logging" }).click();
    await page.mouse.move(0, 0);

    await expect(row).toHaveClass(/today-unlogged-line-armed/);
    const rowBorderColor = await row.evaluate(
      (el) => getComputedStyle(el).borderColor,
    );
    expect(rowBorderColor).toBe("rgb(181, 52, 31)"); // --accent
    await expect(
      page.getByText(`Discard ${title} without logging?`),
    ).toBeVisible();
    const tapAgain = page.getByRole("button", { name: "Tap again" });
    const tapAgainStyles = await tapAgain.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color };
    });
    expect(tapAgainStyles.background).toBe("rgb(181, 52, 31)"); // --accent
    expect(tapAgainStyles.color).toBe("rgb(255, 253, 247)"); // --on-color
    // "Log it" is gone while armed — replaced, not merely joined.
    await expect(page.getByRole("link", { name: "Log it" })).toHaveCount(0);

    const boxAfter = (await row.boundingBox())!;
    expect(Math.round(boxAfter.y)).toBe(Math.round(boxBefore.y));
    expect(Math.round(boxAfter.height)).toBe(Math.round(boxBefore.height));
  });

  // Fix round 1 (reviewer M1): the original version of this test asserted
  // with Playwright's default 5s `expect` timeout — LONGER than the 4s
  // auto-disarm timer, so it stayed a false green even with `onBlur`
  // deleted entirely (the timeout alone would flip the button back before
  // the 5s poll gave up). Two changes make this load-bearing: (1) a real
  // focus check BEFORE blurring — `el.blur()` (called via `.evaluate`,
  // below) is a spec'd no-op unless `el` genuinely is
  // `document.activeElement`, so asserting that first is what actually
  // proves the row's own re-focus-on-arm fix is wired, not just that SOME
  // path eventually flips the copy back; (2) a ≤1s assertion timeout, well
  // under the 4s auto-disarm, so a real regression can't hide behind the
  // timer firing first.
  test("disarms on a REAL blur — not a synthetic event, and faster than the 4s auto-disarm timer could account for", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Discard without logging" }).click();
    const armed = page.getByRole("button", { name: "Tap again" });
    await expect(armed).toBeVisible();

    const armedIsFocused = await armed.evaluate(
      (el) => el === document.activeElement,
    );
    expect(armedIsFocused).toBe(true);

    await armed.evaluate((el) => (el as HTMLElement).blur());

    await expect(
      page.getByRole("button", { name: "Discard without logging" }),
    ).toBeVisible({ timeout: 1000 });
  });

  // A real 4s wait (no fake timers in an e2e context) — the machine's own
  // arm/disarm-timeout logic is proven fast, with fake timers, in
  // useStagedDiscard.test.ts; this only proves it's actually WIRED to the
  // real row, end to end.
  test("arms, waits 4s with no second press, and disarms automatically — with the run record still intact", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Discard without logging" }).click();
    await expect(page.getByRole("button", { name: "Tap again" })).toBeVisible();

    await page.waitForTimeout(4200);

    await expect(
      page.getByRole("button", { name: "Discard without logging" }),
    ).toBeVisible();
    const runAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(runAfter).not.toBeNull();
  });

  // arm -> tap -> gone: the row disappears in place with no navigation, and
  // clears both records with no POST.
  test("a second press while armed fires the discard — the row disappears in place, no navigation, both records cleared, no POST", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Discard without logging" }).click();
    await page.getByRole("button", { name: "Tap again" }).click();

    await expect(page.getByText(/unlogged session/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /discard/i })).toHaveCount(0);
    // Still on Today — unlike SessionComplete's/the Log screen's own
    // Discard, this one never navigates anywhere.
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    const runAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(runAfter).toBeNull();
    const draftAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionDraft"),
    );
    expect(draftAfter).toBeNull();
    // LAST THREE never shows this workout — discarding never POSTs a log.
    await expect(
      page.locator(".today-log-row").filter({ hasText: title }),
    ).toHaveCount(0);
  });
});

test.describe("plan screen (a plan active)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-plan-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Plan Tester",
    });
    await choosePlan(page, "sprint");
    await page.goto("/plan");
    // With no plan, /plan renders two preset cards — a different, already-
    // reachable layout. Wait for the real 84-row sequence (the layout this
    // sweep exists to cover) rather than just the route settling.
    await expect(page.locator(".plan-sequence")).toBeVisible();
    await expect(page.locator(".plan-row")).toHaveCount(84);
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("the active header and today's row match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const todayRow = page.locator(".plan-row-today");
    await expect(todayRow).toHaveCount(1);
    const styles = await todayRow.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, borderLeft: s.borderLeftColor };
    });
    expect(styles.background).toBe("rgb(239, 234, 222)"); // --surface-sunken
    expect(styles.borderLeft).toBe("rgb(181, 52, 31)"); // --accent
  });

  // Reset/Switch: the staged-confirm idiom copied from BaselineEditor.tsx —
  // structurally proving the confirm panel itself (not just the header
  // buttons) clears the tap-target/axe bars, since it renders a different
  // subtree than the plain active-header state above.
  test.describe("Reset staged confirm", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      await expect(page.locator(".baseline-confirm")).toBeVisible();
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations", async ({ page }) => {
      await assertNoA11yViolations(page);
    });
  });
});

// The confirm sweep's own fixture: Heat Lightning (server/seed/library/an.ts)
// is an AN-hard workout with an effort-ref work step (`{effort:"max"}`) AND
// a reps marker (reps×10) — the no-nudge, no-remove-on-the-marker layout
// that a split-only workout (e.g. any other library entry) never renders at
// all. In the old 35-workout library, Microburst was the sole such workout;
// Task 11 originally anchored this sweep to Fork Lightning (same shape: 0:30
// work, effort:max, spm 32), but the content rewrite (a62c33f) turned Fork
// Lightning's reps block into TWO alternating work steps — both rendering
// their own "ALL OUT" TARGET-strip row — which breaks this test's own
// `expect(effortWord).toBeVisible()` single-match assumption (strict-mode
// violation on 2 elements). Re-anchored to Heat Lightning, which still has a
// single repeated work step (distance-ref 150 m, effort:max, spm 32) — the
// same re-anchor `ConfirmTargets.test.tsx` made for the identical reason.
// Sweeping only a split-ref confirm screen would repeat exactly the "every
// test built the same shape" blind spot this task's brief calls out.
test.describe("confirm targets screen (effort step present — Heat Lightning)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-confirm-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Confirm Tester",
    });
    await setBaselines(page);
    await gotoWorkoutByTitle(page, "Heat Lightning");
    await expect(page.locator("h1.workout-detail-title")).toHaveText(
      "Heat Lightning",
    );
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page).toHaveURL(/\/session\/confirm$/);
    await expect(page.locator(".confirm-recount")).toBeVisible();
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("the effort word, recount, and reps marker (no remove control) match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    // The effort-ref row's TARGET strip shows the word, not a resolved
    // range (docs/design/DEVIATIONS.md's PACE REF/effort row).
    // Scoped to the TARGET strip's own value cell, not a page-wide text
    // search: the row's header label also reads "ROW 3 · ALL OUT"
    // (kindLabel), so an unscoped getByText("ALL OUT") matches both.
    const effortWord = page.locator(".step-editor-target-value", {
      hasText: "ALL OUT",
    });
    await expect(effortWord).toBeVisible();
    const effortColor = await effortWord.evaluate(
      (el) => getComputedStyle(el).color,
    );
    expect(effortColor).toBe("rgb(27, 26, 23)"); // --ink

    const recountColor = await page
      .locator(".confirm-recount")
      .evaluate((el) => getComputedStyle(el).color);
    expect(recountColor).toBe("rgb(27, 26, 23)"); // --ink

    // Binding decision (ConfirmTargets.tsx's toggleRemoved comment, Task 1's
    // review handoff): the reps marker (REPEAT x10) never gets a
    // remove/restore control, unlike every other row here — removing it
    // would silently reshape the whole repeated workout. Structural proof
    // it's the marker row's own kind label rendering, not a coincidence of
    // row order.
    const markerRow = page.locator(".step-editor", { hasText: "REPEAT" });
    await expect(markerRow).toBeVisible();
    await expect(
      markerRow.getByRole("button", { name: /remove|restore/i }),
    ).toHaveCount(0);
  });

  // Task 5 brief: "the confirm sweep runs with an effort step present ...
  // also sweep Confirm's struck-row state (a removed step's styling must
  // survive contrast checks)". Strikes the warm-up row (guaranteed present,
  // and NOT the effort/marker rows so this is testing the ordinary case).
  test.describe("a removed step (struck-row state)", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("button", { name: "Remove Row 1" }).click();
      await expect(
        page.getByRole("button", { name: "Restore Row 1" }),
      ).toBeVisible();
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations, including the struck row's strikethrough label", async ({
      page,
    }) => {
      await assertNoA11yViolations(page);
    });

    // docs/index.css's own comment: "ink-3 on --surface-sunken measures
    // 6.3:1" — pin the resolved colors structurally, not just "axe found no
    // violation" (a struck row's whole background AND text color changed
    // together, so the axe scan alone can't tell this from an accidental
    // regression to some other still-passing pair).
    test("the struck row's sunken background and struck label match the token palette", async ({
      page,
    }) => {
      const row = page.locator(".confirm-step-removed");
      await expect(row).toHaveCount(1);
      const rowBg = await row.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      expect(rowBg).toBe("rgb(239, 234, 222)"); // --surface-sunken

      const label = row.locator(".step-editor-header-label");
      const labelStyles = await label.evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.color, decoration: s.textDecorationLine };
      });
      expect(labelStyles.color).toBe("rgb(87, 84, 76)"); // --ink-3
      expect(labelStyles.decoration).toBe("line-through");

      // Pins the fix for a real finding this sweep caught: the DUR field
      // label used to be ink-4 (5.29:1) on the row's ordinary --surface,
      // but the SAME class sat at only 4.48:1 on --surface-sunken before
      // index.css gained a struck-row override — failing axe's
      // color-contrast rule the first time this test ran. Task 1 (ui-fix
      // round)'s own blanket small-mono-label sweep since moved
      // `.step-editor-row-label`'s BASE rule to --ink-3 everywhere, so the
      // struck-row override that used to carry this colour is gone — this
      // now just confirms the base rule still resolves the same way here.
      const durLabelColor = await row
        .locator(".step-editor-row-label")
        .first()
        .evaluate((el) => getComputedStyle(el).color);
      expect(durLabelColor).toBe("rgb(87, 84, 76)"); // --ink-3
    });
  });

  test("no small mono label uses the failing --ink-4 color", async ({
    page,
  }) => {
    await assertNoFailingInk4Labels(page);
  });

  // Task 1 (ui-fix round): the small bottom-right START becomes a
  // full-width L1 "Looks right, start" at 56px, below the TOTAL line —
  // matching Detail and Builder's own L1. REMOVE (the per-row control)
  // stays the existing 44px text control (`.confirm-toggle-btn`),
  // unchanged.
  test("the confirm footer's one L1 action reads 'Looks right, start' at 56px, below the recount", async ({
    page,
  }) => {
    const l1 = page.locator(".button-l1");
    await expect(l1).toHaveCount(1);
    await expect(l1).toHaveText("Looks right, start");
    const height = await l1.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBe(56);

    const recountBox = (await page.locator(".confirm-recount").boundingBox())!;
    const l1Box = (await l1.boundingBox())!;
    expect(l1Box.y).toBeGreaterThan(recountBox.y);

    const remove = page.getByRole("button", { name: "Remove Row 1" });
    const removeHeight = await remove.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(removeHeight).toBe(44);

    // Fix round 1 (F2, reviewer finding): see WorkoutDetail's identical
    // assertion — the one-L1 count alone doesn't rule out a legacy
    // `.button-primary` block surviving elsewhere on the same screen.
    await expect(page.locator(".button-primary")).toHaveCount(0);
  });
});

test.describe("builder screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-builder@e2e.test",
      name: "Design Builder Tester",
    });
    await page.goto("/library/new");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and the active TYPE chip match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    // A brand-new form defaults to O2 (Builder.tsx's newForm) — the O2 chip
    // is the active (aria-pressed) one.
    const o2ChipBg = await page
      .getByRole("button", { name: "O2", exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(o2ChipBg).toBe("rgb(42, 98, 117)"); // --type-o2

    // Fix round 1 (F1, James's ruling): TR asserted explicitly — it used to
    // be the IDENTICAL hex to --accent, so a selected TR chip rendered
    // "accent" by coincidence and no test here ever picked TR to notice.
    // Now resolves to --ink (tokens.css).
    const trChip = page.getByRole("button", { name: "TR", exact: true });
    await trChip.click();
    const trChipBg = await trChip.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(trChipBg).toBe("rgb(27, 26, 23)"); // --type-tr = --ink
  });

  // Phase 5F Task 7: the warm-up line moved above the step list, reading as
  // an implicit step 0 rather than a footnote down by the totals — a
  // real-browser structural pin, since jsdom has no layout and can't tell
  // "above" from "below".
  test("the warm-up line precedes the step list", async ({ page }) => {
    const warmup = page.locator(".builder-warmup-line");
    const steps = page.locator(".builder-steps");
    await expect(warmup).toBeVisible();

    const warmupBox = await warmup.boundingBox();
    const stepsBox = await steps.boundingBox();
    expect(warmupBox!.y).toBeLessThan(stepsBox!.y);
  });

  // Phase 5F Tasks 3/4: the DUR field used to open a decimal number pad
  // (`inputMode="decimal"`) that had no way to type a colon — a rower
  // guessing "0:30" could not enter it. `ClockInput` now masks a digit-only
  // numeric-pad field instead; `inputmode="numeric"` is the one attribute
  // that actually changes which keyboard iOS/Android show, so it's the
  // real-browser-relevant thing to assert (jsdom renders no keyboard at
  // all). The task brief that seeded this test named the field "Step 1
  // duration" — DurationInput/ClockInput actually carry `Row N duration`
  // (StepEditor.tsx builds `rowLabel` as `Row ${index + 1}`; "Step N" is
  // only the expanded editor's own header/DUPLICATE/DELETE labels), and
  // `{ exact: true }` is required or the substring also matches the
  // duration-unit radio buttons ("Row 1 duration unit minutes"/"meters").
  test("the masked duration field opens a digit-only keypad", async ({
    page,
  }) => {
    await expect(
      page.getByLabel("Row 1 duration", { exact: true }),
    ).toHaveAttribute("inputmode", "numeric");
  });

  // The pain level's word ("WORKING") only renders once a level is picked,
  // and it sets in 11px against the label's 10px — so the label row grew
  // taller on first selection and pushed the chips, and everything below
  // them, down under the user's thumb. The label row now reserves its line
  // box, so picking a level moves nothing.
  test("picking a pain level does not shift the chips below it", async ({
    page,
  }) => {
    const chip = page.getByRole("button", { name: "Pain 3" });
    const before = await chip.boundingBox();
    await chip.click();
    await expect(page.getByText("WORKING")).toBeVisible();
    const after = await chip.boundingBox();

    expect(after?.y).toBe(before?.y);
  });

  // Same nudge-bug class, mid-phase addition (Task 7): TYPE's own summary
  // word (TYPE_WORDS) sits opposite its label the same way PAIN's does.
  // Unlike PAIN, a type is always selected — the word is present on first
  // paint, so there's no "word appears" transition to reproduce here — but
  // switching between chips swaps in a differently-*wide* word ("LOW & SLOW"
  // vs "COMFORTABLY HARD"), and a width change alone must not shift
  // anything below it either. Asserts both the TYPE chip row itself and the
  // DIFFICULTY row beneath it hold their y position across the switch.
  test("picking a different TYPE does not shift the TYPE chips or the DIFFICULTY row below them", async ({
    page,
  }) => {
    // A fresh builder defaults to O2 ("LOW & SLOW") — switch to AT
    // ("COMFORTABLY HARD"), the widest of the four words.
    const typeChipRow = page.locator(".classification-chip-row").first();
    const difficultyRow = page.locator(".classification-chip-row").nth(1);
    const beforeType = await typeChipRow.boundingBox();
    const beforeDifficulty = await difficultyRow.boundingBox();

    await page.getByRole("button", { name: "AT", exact: true }).click();
    await expect(page.getByText("COMFORTABLY HARD")).toBeVisible();

    const afterType = await typeChipRow.boundingBox();
    const afterDifficulty = await difficultyRow.boundingBox();

    expect(afterType?.y).toBe(beforeType?.y);
    expect(afterDifficulty?.y).toBe(beforeDifficulty?.y);
  });

  // Same iOS device report as the library screen's callout test: a typed
  // field must stay selectable (copy/paste a workout title) even though
  // the surrounding chips and steppers must not pop the callout.
  test("the Title field stays text-selectable while a stepper button resists the iOS callout", async ({
    page,
  }) => {
    const titleSelect = await page
      .getByLabel("Title")
      .evaluate((el) => getComputedStyle(el).userSelect);
    expect(titleSelect).not.toBe("none");

    // REPEAT's stepper is present on every fresh builder screen (Builder.tsx's
    // builder-repeat-card), no extra setup needed.
    const stepperSelect = await page
      .getByRole("button", { name: "Repeat up" })
      .evaluate((el) => getComputedStyle(el).userSelect);
    expect(stepperSelect).toBe("none");
  });

  test("no small mono label uses the failing --ink-4 color", async ({
    page,
  }) => {
    await assertNoFailingInk4Labels(page);
  });

  // Task 1 (ui-fix round): "Save to library stays L1" — the screen's one
  // L1, now the level system's own 56px class rather than the bespoke
  // 62px `.builder-save`.
  test("Save to library is the screen's one L1 action, rendered at 56px", async ({
    page,
  }) => {
    const l1 = page.locator(".button-l1");
    await expect(l1).toHaveCount(1);
    await expect(l1).toHaveText("Save to library");
    const height = await l1.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBe(56);

    // Fix round 1 (F2, reviewer finding): see WorkoutDetail's identical
    // assertion — the one-L1 count alone doesn't rule out a legacy
    // `.button-primary` block surviving elsewhere on the same screen.
    await expect(page.locator(".button-primary")).toHaveCount(0);
  });

  // Task 1 (ui-fix round): DONE is a NAMED level (L3) — solid ink, mono
  // 12/600, 0.16em, 48px — "was already black" (DESIGN.md) but not
  // previously part of any named system.
  test("the step editor's DONE button is L3: solid ink, mono, 48px", async ({
    page,
  }) => {
    const done = page.getByRole("button", { name: "DONE" });
    const styles = await done.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        height: el.getBoundingClientRect().height,
        background: s.backgroundColor,
        color: s.color,
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        letterSpacing: s.letterSpacing,
      };
    });
    expect(styles.height).toBe(48);
    expect(styles.background).toBe("rgb(27, 26, 23)"); // --ink
    expect(styles.color).toBe("rgb(255, 253, 247)"); // --on-color
    expect(styles.fontFamily.toLowerCase()).toContain("mono");
    expect(styles.fontSize).toBe("12px");
    expect(styles.fontWeight).toBe("600");
    // getComputedStyle resolves letter-spacing to its computed PIXEL value,
    // not the authored em string — 0.16em @ 12px font-size = 1.92px.
    expect(styles.letterSpacing).toBe("1.92px");
  });

  // Task 1 (ui-fix round): DESIGN.md's selected-state fix, Builder's own
  // half — PAIN's old per-level ramp colour goes ("Builder's gold pain
  // selection goes"), DIFFICULTY was already ink (ClassificationCard.tsx's
  // own unit tests cover that structurally); both read ink here too, in a
  // real browser, alongside PACE (2k/6k/MAX/MIN) and the MIN/M duration
  // unit toggle — none of them accent.
  test("selected PAIN/DIFFICULTY/PACE/MIN-M chips fill ink, never accent", async ({
    page,
  }) => {
    const painChip = page.getByRole("button", { name: "Pain 4" });
    await painChip.click();
    const painBg = await painChip.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(painBg).toBe("rgb(27, 26, 23)"); // --ink, not --pain-ramp-4

    const hardChip = page.getByRole("button", { name: "HARD", exact: true });
    await hardChip.click();
    const hardBg = await hardChip.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(hardBg).toBe("rgb(27, 26, 23)"); // --ink

    const sixK = page.getByRole("radio", { name: /pace 6K/i });
    await sixK.click();
    const sixKBg = await sixK.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(sixKBg).toBe("rgb(27, 26, 23)"); // --ink, not --accent

    const meters = page.getByRole("radio", { name: /duration unit meters/i });
    await meters.click();
    const metersBg = await meters.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(metersBg).toBe("rgb(27, 26, 23)"); // --ink
  });

  // A prior review (5B) only ever swept the builder blank — never after a
  // failed Save exposes its error-state markup (role=alert banners,
  // aria-invalid/aria-describedby on the first bad field, inline field-error
  // text). Press Save on the untouched form and re-run the sweep against
  // that state instead.
  test.describe("error state (Save pressed on a blank form)", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("button", { name: "Save to library" }).click();
      // Builder.tsx's own invalid-field-count banner (`role="alert"`) —
      // there's no dedicated status class any more, this IS the error
      // state's marker.
      await expect(page.getByText(/needs? attention/i)).toBeVisible();
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations", async ({ page }) => {
      await assertNoA11yViolations(page);
    });
  });

  // Task 6 (this phase): the plain /library/new sweep above only ever
  // exercises the accordion's EXPANDED state — a brand-new form's one row
  // opens by default, so no StepCard ever renders. Add a second step to
  // force a real collapsed/expanded split (StepCard.tsx + StepEditor.tsx)
  // and re-run the same sweep, plus pin the two tokens the redesign
  // introduced for these cards: the collapsed surface/marker colours and
  // the step-index numeral's ink-4 substitution for the handoff's
  // AA-failing `#8a8478` (docs/design/builder-redesign/README.md's own
  // accessibility note: "if the axe scan flags it, move it to `#6f6a5f`" —
  // already done in tokens.css; this pins it structurally).
  test.describe("accordion states (one card collapsed, one expanded)", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("button", { name: "+ ADD STEP" }).click();
      await expect(page.locator(".step-card")).toHaveCount(1);
      await expect(page.locator(".step-editor")).toHaveCount(1);
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations", async ({ page }) => {
      await assertNoA11yViolations(page);
    });

    test("the collapsed card, its step index, and the expanded card's left marker match the token palette", async ({
      page,
    }) => {
      const collapsedBg = await page
        .locator(".step-card")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(collapsedBg).toBe("rgb(251, 249, 241)"); // --surface-collapsed

      const collapsedMarker = await page
        .locator(".step-card")
        .evaluate((el) => getComputedStyle(el).borderLeftColor);
      expect(collapsedMarker).toBe("rgb(222, 216, 201)"); // --rule-2

      // The step-index numeral: the handoff's own `#8a8478` measures
      // ~3.4:1 and fails AA at this size — index.css already substitutes
      // --ink-4 (#6f6a5f) here, same convention as every other mono label
      // in docs/design/DEVIATIONS.md. Pinning the resolved colour, not just
      // the absence of an axe violation, is what keeps this from silently
      // regressing back to the literal hex.
      const indexColor = await page
        .locator(".step-card-index")
        .first()
        .evaluate((el) => getComputedStyle(el).color);
      expect(indexColor).toBe("rgb(111, 106, 95)"); // --ink-4

      // The expanded card's left marker is the current TYPE colour
      // (StepEditor.tsx's inline borderLeftColor) — O2 is the builder's
      // default type (Builder.tsx's newForm).
      const expandedMarker = await page
        .locator(".step-editor")
        .evaluate((el) => getComputedStyle(el).borderLeftColor);
      expect(expandedMarker).toBe("rgb(42, 98, 117)"); // --type-o2
    });

    // Same iOS device report: the collapsed card's EDIT control is a
    // frequent long-press target (it's the whole card's stated affordance),
    // while the still-expanded row's typed SPM field must not lose text
    // selection to the same rule (`.stepper-value` only ever targets the
    // non-editable `<span>` variant — `.stepper-value-input` stays out of
    // the selector list on purpose).
    test("the collapsed card's EDIT control resists the callout; the expanded row's SPM field stays selectable", async ({
      page,
    }) => {
      const editSelect = await page
        .locator(".step-card-edit")
        .evaluate((el) => getComputedStyle(el).userSelect);
      expect(editSelect).toBe("none");

      const spmSelect = await page
        .getByLabel("Row 2 stroke rate value")
        .evaluate((el) => getComputedStyle(el).userSelect);
      expect(spmSelect).not.toBe("none");
    });
  });

  // This review's IMPORTANT 2: every prior accordion sweep only ever built
  // its collapsed card via "+ ADD STEP", which can only ever produce a
  // `kind: "w"` row (docs/design/DEVIATIONS.md: there's no "+ WARM-UP"
  // control any more) — so no sweep's axe scan ever actually rendered a
  // collapsed `wu`/`r` StepCard, the one shape whose sub-summary is empty
  // and used to render a nameless, focusable button (axe button-name /
  // WCAG 4.1.2). A `wu` row can only land in the builder via bulk import or
  // an already-saved (edit-mode) workout — see builder.spec.ts's own
  // "editing a workout with a stored warm-up" test, which this mirrors to
  // get an edit-mode screen open, but for the axe/tap-target sweep instead
  // of a save-round-trip assertion. Every one of the library's 300 workouts
  // opens with a `wu` (verified in Task 12's docs reconcile), so this is the
  // realistic, common case the earlier sweep never touched.
  test.describe("edit mode with a stored warm-up row (wu StepCard)", () => {
    const title = "Design WU Sweep";

    // Unlike this file's other describe blocks (which only ever read/
    // navigate), every test here creates real data via bulk import under
    // the same title — Playwright runs different tests in this file across
    // several parallel workers, so a fixed shared email here raced two
    // workers' concurrent sign-ins/imports into each other (a 500 from the
    // backdoor route on a duplicate concurrent signup, and two "Design WU
    // Sweep" workouts existing at once, breaking the row-filter locator).
    // `parallelIndex` gives each worker its own account, matching
    // builder.spec.ts's own "every test signs in as its own unique email"
    // convention one level up (per-worker instead of per-test, since the
    // three tests below share this describe's beforeEach/afterEach and run
    // one at a time within a given worker).
    test.beforeEach(async ({ page }, testInfo) => {
      await signInViaBackdoor(page, {
        email: `design-builder-wu-${testInfo.parallelIndex}@e2e.test`,
        name: "Design Builder WU Tester",
      });
      // Bulk import is the only way to get a `wu` row into a personal
      // (editable) workout — seeded library workouts are global and can't be
      // edited (EditWorkout.tsx refuses isGlobal workouts), and the
      // create-mode builder has no control that can author one.
      await page.goto("/library/import");
      const text = [`${title} | O2 | easy | 2`, "wu 5", "w 10' 6k @20"].join(
        "\n",
      );
      await page.getByLabel("Bulk import text").fill(text);
      await page.getByRole("button", { name: "Import", exact: true }).click();
      await expect(page).toHaveURL(/\/library$/);

      await page.locator(".workout-row").filter({ hasText: title }).click();
      await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
      await page.getByRole("link", { name: "Edit" }).click();
      await expect(page).toHaveURL(/\/library\/[^/]+\/edit$/);

      // Edit mode opens with every row collapsed (Builder.tsx) — exactly
      // the state this sweep needs: two collapsed StepCards, one of them
      // the stored `wu` row, neither ever expanded.
      await expect(page.locator(".step-card")).toHaveCount(2);
      await expect(page.locator(".step-editor")).toHaveCount(0);
    });

    test.afterEach(async ({ page }) => {
      await cleanupByTitle(page, title);
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations, including the collapsed wu card's sub-summary button", async ({
      page,
    }) => {
      await assertNoA11yViolations(page);
    });

    // Structural pin, beyond the axe scan: the first card (the stored `wu`
    // row) renders no `.step-card-sub` element at all — not an empty one —
    // proving the fix is "don't render it" and not "render it with empty
    // text" (which would still be a nameless focusable control). The second
    // card (the `w` row) still renders its own populated sub-summary, so
    // this also proves the fix is conditional per-row, not a blanket
    // removal of the control.
    test("the wu card renders no sub-summary button; the w card still does", async ({
      page,
    }) => {
      const cards = page.locator(".step-card");
      await expect(cards.nth(0).locator(".step-card-sub")).toHaveCount(0);
      await expect(cards.nth(1).locator(".step-card-sub")).toHaveCount(1);
      await expect(cards.nth(1).locator(".step-card-sub")).toContainText("spm");
    });
  });

  // Every sweep above only ever scans a blank builder (a fresh row 1's
  // fields are all empty) — Phase 5F's typable DUR/SPM/REST fields, and
  // their new "FREE"/"NONE" placeholders, only actually render once
  // something is typed into them. Fill all three via the same masked
  // fields a rower would use, then re-run the sweep against that state.
  test.describe("expanded editor with typed values", () => {
    test.beforeEach(async ({ page }) => {
      await page
        .getByLabel("Row 1 duration", { exact: true })
        .pressSequentially("45");
      await page
        .getByLabel("Row 1 stroke rate value", { exact: true })
        .pressSequentially("27");
      await page
        .getByLabel("Row 1 rest value", { exact: true })
        .pressSequentially("300");
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations", async ({ page }) => {
      await assertNoA11yViolations(page);
    });
  });

  // Phase 5G (Task 4): tapping MAX/MIN hides the offset stepper entirely
  // (PaceRefInput.tsx renders it only when `effort === null`) and swaps in
  // the TARGET strip's word instead of a resolved range — a real structural
  // change to what's on screen, not just a different value in an existing
  // field. Every sweep above only ever exercises the default split-mode
  // layout; this is the one sweep that runs with an effort chip checked, so
  // the hidden-stepper state gets its own tap-target/axe coverage instead of
  // inheriting a pass that never actually rendered it.
  test.describe("effort chip selected (MAX) — hidden offset stepper", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("radio", { name: "Row 1 pace MAX" }).click();
      await expect(
        page.getByRole("radio", { name: "Row 1 pace MAX" }),
      ).toHaveAttribute("aria-checked", "true");
      await expect(page.locator(".pace-ref-offset")).toHaveCount(0);
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations", async ({ page }) => {
      await assertNoA11yViolations(page);
    });
  });
});

test.describe("import screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-import@e2e.test",
      name: "Design Import Tester",
    });
    await page.goto("/library/import");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and the back link match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const backLinkColor = await page
      .locator(".back-link")
      .evaluate((el) => getComputedStyle(el).color);
    expect(backLinkColor).toBe("rgb(27, 26, 23)"); // --ink
  });
});

test.describe("you screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-you@e2e.test",
      name: "Design You Tester",
    });
    await page.goto("/you");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and a baseline value match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const baselineValueColor = await page
      .locator(".baseline-value")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(baselineValueColor).toBe("rgb(181, 52, 31)"); // --accent
  });
});

// Phase 6B (Task 5): the pre-workout countdown (handoff §5). A single
// 2-minute work step gets a rower to /session/confirm fast; pressing START
// lands here without ever pressing SKIP — SKIP/CANCEL's own behavior is
// e2e/session.spec.ts's job, this sweep only needs the screen on-render.
test.describe("countdown screen", () => {
  const title = "Design Countdown Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-countdown-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Countdown Tester",
    });
    await setBaselines(page);
    await importBulk(
      page,
      [`${title} | AN | easy | 1`, "w 2:00 6k @20"].join("\n"),
    );
    await startFromLibrary(page, title);
    await page.getByRole("button", { name: "START" }).click();
    await expect(page).toHaveURL(/\/session\/countdown$/);
    await expect(page.getByText("GET ON THE HANDLE")).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("no tab bar on this session route", async ({ page }) => {
    await expect(page.locator(".tabbar")).toHaveCount(0);
  });

  test("the label, numeral, and SKIP button match the token palette", async ({
    page,
  }) => {
    const labelColor = await page
      .locator(".countdown-label")
      .evaluate((el) => getComputedStyle(el).color);
    expect(labelColor).toBe("rgb(111, 106, 95)"); // --ink-4

    const numeralColor = await page
      .locator(".countdown-number")
      .evaluate((el) => getComputedStyle(el).color);
    expect(numeralColor).toBe("rgb(181, 52, 31)"); // --accent

    const skipStyles = await page.locator(".countdown-skip").evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color };
    });
    expect(skipStyles.background).toBe("rgb(181, 52, 31)"); // --accent
    expect(skipStyles.color).toBe("rgb(255, 253, 247)"); // --on-color
  });

  // Final-review triage item (carried from Task 4's own flag): F3
  // (index.css) fixed `.timer-screen`'s landscape min-height formula but
  // never accounted for `.countdown-screen`/`.session-complete-screen`
  // sharing the identical pre-fix formula. Task 5 measured this screen live
  // at 844×420 BEFORE its own fix: scrollHeight 438 vs clientHeight 420 —
  // the exact same 18px `.timer-screen` itself carried. Same fix (subtract
  // `var(--tap)` in a landscape media query), same durable guard as Timer's
  // own landscape e2e test (session.spec.ts): a real scrollHeight check,
  // not a bounding-box inference. Re-measured after the fix: scrollHeight
  // 414, clientHeight 420 (this is the guard, not the measurement itself —
  // see index.css's own comment on `.countdown-screen`'s landscape rule for
  // the full before/after numbers).
  test("no dead vertical scroll at 844x420 (the same fix Timer's own landscape layout needed)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 420 });
    const overflow = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
    expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight);
  });
});

// Phase 6B (Task 5): the live timer (handoff §6) in a plain TIME-based work
// phase — the ▶ control, a resolved SPLIT target (not an effort word), no
// distance meters in the STEP line. A 5-minute first step (far longer than
// any single test in this describe takes to run) keeps the engine's own
// auto-advance from firing mid-sweep. Two steps (not one) so STEP 1 OF 2 /
// UP NEXT both resolve to something real.
test.describe("timer screen (portrait, TIME phase)", () => {
  const title = "Design Timer Time Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-timer-time-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Timer Time Tester",
    });
    await setBaselines(page);
    await importBulk(
      page,
      [`${title} | AN | easy | 2`, "w 5:00 6k @20", "w 3:00 6k @20"].join("\n"),
    );
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 2/)).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("no tab bar on this session route", async ({ page }) => {
    await expect(page.locator(".tabbar")).toHaveCount(0);
  });

  test("the state pill, TARGET SPLIT value, and ▶ control match the token palette", async ({
    page,
  }) => {
    const stateColor = await page
      .locator(".timer-state")
      .evaluate((el) => getComputedStyle(el).color);
    expect(stateColor).toBe("rgb(181, 52, 31)"); // --accent

    // A resolved SPLIT target, not an effort word — this TIME sweep's own
    // distinguishing case from the EFFORT sweep below.
    await expect(page.locator(".timer-card-value-accent")).not.toHaveText(
      "ALL OUT",
    );
    const targetColor = await page
      .locator(".timer-card-value-accent")
      .evaluate((el) => getComputedStyle(el).color);
    expect(targetColor).toBe("rgb(181, 52, 31)"); // --accent

    const controlColor = await page
      .locator(".timer-control")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(controlColor).toBe("rgb(63, 60, 53)"); // --ink-2

    // The ▶ control (never "NEXT →") — this TIME phase's own control-row
    // shape, distinct from the DISTANCE sweep below.
    await expect(
      page.getByRole("button", { name: "Next phase" }),
    ).toBeVisible();
  });

  test("no small mono label uses the failing --ink-4 color", async ({
    page,
  }) => {
    await assertNoFailingInk4Labels(page);
  });

  // Fix round 1 (F2, reviewer finding): Timer's transport row (Pause
  // between two 56x56 L2 squares) is the documented full-width-stack
  // exception — it never carries `.button-l1`, so this checks the "no
  // legacy .button-primary" half of the sweep on its own. `.button-primary`
  // only ever renders here for the END/finish/suspect STAGED confirms
  // (Timer.tsx:522/611/635, DEVIATIONS.md's IMP-6 row) — none of which is
  // staged in this describe's own default portrait/TIME-phase state.
  test("no legacy .button-primary renders in this screen's default state", async ({
    page,
  }) => {
    await expect(page.locator(".button-primary")).toHaveCount(0);
  });
});

// Phase 6B (Task 5): the live timer in a DISTANCE work phase (meters
// defined, a resolved SPLIT target — not an effort ref, that's its own
// sweep below) — the brief's own "the NEXT layout is distinct" case.
// Task 3's fix round restored the SAME 3-column ◀/Pause/[control] grid for
// every phase kind; what's actually distinct is the rightmost control
// itself (NEXT → replacing ▶), proven structurally below rather than
// assumed from the class name alone.
test.describe("timer screen (portrait, DISTANCE phase)", () => {
  const title = "Design Timer Distance Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-timer-distance-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Timer Distance Tester",
    });
    await setBaselines(page);
    await importBulk(
      page,
      [`${title} | AN | easy | 2`, "w 500m 6k @20", "w 3:00 6k @20"].join("\n"),
    );
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText("STEP 1 OF 2 · WORK · 500M")).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("the NEXT control (not ▶) is what renders, on-palette", async ({
    page,
  }) => {
    const next = page.getByRole("button", { name: "NEXT →" });
    await expect(next).toBeVisible();
    await expect(page.getByRole("button", { name: "Next phase" })).toHaveCount(
      0,
    );
    const styles = await next.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color };
    });
    expect(styles.background).toBe("rgb(181, 52, 31)"); // --accent
    expect(styles.color).toBe("rgb(255, 253, 247)"); // --on-color
  });
});

// Phase 6B (Task 5): the live timer with an effort-ref TARGET (`ref:
// {effort:"max"}`) — TimerTargets.tsx's own binding rule: the numeric
// estimate behind an effort ref is NEVER shown, only the resolved word
// ("ALL OUT"/"EASY"), with no sub-line underneath it (unlike a split-ref
// target's own ref sub-line, ui-fix round Item 1). Time-based (not distance) so the ▶ control
// shows, distinct from the DISTANCE sweep above.
test.describe("timer screen (portrait, effort target visible)", () => {
  const title = "Design Timer Effort Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-timer-effort-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Timer Effort Tester",
    });
    await setBaselines(page);
    await importBulk(
      page,
      [`${title} | AN | hard | 4`, "w 5:00 max @28"].join("\n"),
    );
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();
    await expect(page.locator(".timer-card-value-accent")).toHaveText(
      "ALL OUT",
    );
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("the effort word renders with no numeric range underneath, on-palette", async ({
    page,
  }) => {
    const card = page.locator(".timer-card").first();
    await expect(card.locator(".timer-card-caption")).toHaveCount(0);
    const color = await card
      .locator(".timer-card-value-accent")
      .evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgb(181, 52, 31)"); // --accent
  });
});

// Phase 6B (Task 5): the live timer's landscape reflow (handoff §6) at the
// handoff's own 844×420 reference frame (docs/design/README.md). Two steps,
// like e2e/session.spec.ts's own landscape test, so the landscape-only
// "then …" UP NEXT line has something real to resolve to. The geometry/
// column-order proof and the dead-scroll regression guard both already
// live in session.spec.ts; this sweep's own job is tap-targets/axe/tokens
// at the same frame, not a second copy of that structural proof.
test.describe("timer screen (landscape, 844x420)", () => {
  const title = "Design Timer Landscape Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-timer-landscape-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Timer Landscape Tester",
    });
    await setBaselines(page);
    await importBulk(
      page,
      [`${title} | AN | easy | 2`, "w 3:00 6k @20", "w 1:00 6k @20"].join("\n"),
    );
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 2/)).toBeVisible();
    await page.setViewportSize({ width: 844, height: 420 });
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  // Owner report (2026-08-02, device screenshot): on frames taller than the
  // handoff's 844x420 (e.g. a Pro Max's 932x430) the grid top-packed its
  // rows and left a dead band under the controls. `align-content:
  // space-between` distributes the rows to fill any frame height; this
  // asserts the fill at the taller frame — the 844x420 scroll guard above
  // (session.spec.ts) still covers the no-overflow direction.
  test("fills a taller landscape frame — no dead band under the controls (932x430)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 932, height: 430 });
    const gap = await page.evaluate(() => {
      const controls = document.querySelector(".timer-controls");
      const screen = document.querySelector(".timer-screen");
      const controlsBottom = controls.getBoundingClientRect().bottom;
      const screenBottom = screen.getBoundingClientRect().bottom;
      return Math.round(screenBottom - controlsBottom);
    });
    // The last grid row must sit near the frame's bottom edge; the old
    // top-packed layout measured a gap of 60px+ here.
    expect(gap).toBeLessThanOrEqual(24);
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("the 128px numeral and the landscape-only 'then' line match the token palette", async ({
    page,
  }) => {
    const fontSize = await page
      .locator(".timer-time")
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(fontSize).toBe("128px");

    const then = page.locator(".timer-upnext-then");
    await expect(then).toBeVisible();
    await expect(then).toContainText("then");
  });
});

// Phase 6B (Task 5): SessionComplete with a recorded actual — the "never a
// bare dash" case, not the empty-actuals early return. Same tiny two-step
// fixture, k2Seconds floor, and non-suspect timing window as
// e2e/session.spec.ts's own completion test — see that file's comment for
// why k2Seconds is 60 (the server's own PUT /api/baselines floor) and why
// the wait lands at ~10.5s (safely inside the 6s/24s non-suspect window on
// a 12s estimate).
test.describe("session complete screen (with a recorded actual)", () => {
  const title = "Design Session Complete Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-complete-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Complete Tester",
    });
    await setCustomBaselines(page, { k2Seconds: 60, k6Seconds: 120 });
    await importBulk(
      page,
      [`${title} | AN | easy | 1`, "w 0:03 6k", "w 100m max"].join("\n"),
    );
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);

    await expect(page.getByText(/^STEP 1 OF 2/)).toBeVisible();
    await expect(page.getByText("STEP 2 OF 2 · WORK · 100M")).toBeVisible({
      timeout: 6000,
    });
    await page.waitForTimeout(10_500);
    await page.getByRole("button", { name: "NEXT →" }).click();
    await expect(page.getByText("Finish this session?")).toBeVisible();
    await page.getByRole("button", { name: "Finish session" }).click();
    await expect(page).toHaveURL(/\/session\/complete$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("no tab bar on this session route", async ({ page }) => {
    await expect(page.locator(".tabbar")).toHaveCount(0);
  });

  test("TOTAL and the recorded actual split match the token palette", async ({
    page,
  }) => {
    // Task 1 (ui-fix round): moved off --ink-4 onto --ink-3, same blanket
    // small-mono-label sweep as Today's `.today-log-meta` above.
    const totalLabelColor = await page
      .locator(".complete-total-label")
      .evaluate((el) => getComputedStyle(el).color);
    expect(totalLabelColor).toBe("rgb(87, 84, 76)"); // --ink-3

    await expect(page.locator(".complete-actual-row")).toHaveCount(1);
    const actualColor = await page
      .locator(".complete-actual-value")
      .evaluate((el) => getComputedStyle(el).color);
    expect(actualColor).toBe("rgb(181, 52, 31)"); // --accent
  });

  test("no small mono label uses the failing --ink-4 color", async ({
    page,
  }) => {
    await assertNoFailingInk4Labels(page);
  });

  // Final-review triage item (see the countdown describe's identical test
  // above for the full derivation): `.session-complete-screen` shared
  // `.countdown-screen`'s own pre-fix landscape min-height formula.
  //
  // Fix round 1 (reviewer M2): the bare document-level check below is
  // structurally UNFALSIFIABLE the instant `.session-complete-screen`
  // itself gets an inner `overflow-y: auto` (exactly what this fix round's
  // first pass shipped, to make the OUTER document's own scrollHeight
  // artificially always equal its clientHeight) — it would keep passing
  // even while Discard sits entirely below the fold inside that inner
  // scroll container, which is exactly what happened. Two more checks make
  // this test actually bite: the screen element's OWN scrollHeight vs its
  // own clientHeight (catches an inner scroll container directly, not just
  // the document that wraps it), and a bounding-rect check on the stack's
  // own LAST child (Discard) — the control most likely to clip first —
  // confirming it renders fully inside the 420px frame with nothing to
  // scroll to reach it.
  test("no dead vertical scroll at 844x420, and Discard (the stack's last child) renders fully in-frame with nothing to scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 420 });

    const overflow = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
    expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight);

    const screenOverflow = await page
      .locator(".session-complete-screen")
      .evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
    expect(screenOverflow.scrollHeight).toBeLessThanOrEqual(
      screenOverflow.clientHeight,
    );

    const discard = page.getByRole("button", {
      name: "Discard without logging",
    });
    const box = (await discard.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(420);
  });

  // Task 1 (ui-fix round): the two half-width side-by-side buttons become
  // full-width L1/L2 blocks in one `.action-stack` — one L1 ("Log this
  // session") per screen, "Back to Today" at L2's own 52px.
  test("Log this session (L1, 56px) stacks above Back to Today (L2, 52px) in one action stack", async ({
    page,
  }) => {
    const l1 = page.locator(".button-l1");
    await expect(l1).toHaveCount(1);
    await expect(l1).toHaveText("Log this session");
    const l1Height = await l1.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(l1Height).toBe(56);

    const l2 = page.getByRole("button", { name: "Back to Today" });
    const l2Height = await l2.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(l2Height).toBe(52);

    const l1Box = (await l1.boundingBox())!;
    const l2Box = (await l2.boundingBox())!;
    expect(l2Box.y).toBeGreaterThan(l1Box.y);

    // Fix round 1 (F2, reviewer finding): see WorkoutDetail's identical
    // assertion — the one-L1 count alone doesn't rule out a legacy
    // `.button-primary` block surviving elsewhere on the same screen.
    await expect(page.locator(".button-primary")).toHaveCount(0);
  });

  // Task 3 (ui-fix round): a third action, Discard without logging
  // (L4/L4-armed), joins the stack under a rule below Back to Today — same
  // in-place two-tap idiom as WorkoutDetail's own Delete workout above.
  test("Discard without logging sits under a rule below Back to Today, and arms in place (solid accent, 'Tap again to discard')", async ({
    page,
  }) => {
    const stack = page.locator(".action-stack.complete-actions");
    const discard = page.getByRole("button", {
      name: "Discard without logging",
    });
    await expect(discard).toHaveClass("button-l4");

    const rule = stack.locator(".action-stack-rule");
    await expect(rule).toHaveCount(1);
    const backToToday = page.getByRole("button", { name: "Back to Today" });
    const backBox = (await backToToday.boundingBox())!;
    const ruleBox = (await rule.boundingBox())!;
    const discardBoxBefore = (await discard.boundingBox())!;
    expect(Math.round(ruleBox.y - (backBox.y + backBox.height))).toBe(12);
    expect(Math.round(discardBoxBefore.y - (ruleBox.y + ruleBox.height))).toBe(
      12,
    );

    await discard.click();
    // Same reasoning as WorkoutDetail's identical assertion: move the
    // pointer off the button first so `:hover`'s own `--accent-hover` fill
    // doesn't mask the armed state's resting `--accent` one.
    await page.mouse.move(0, 0);
    const armed = page.getByRole("button", { name: "Tap again to discard" });
    await expect(armed).toHaveClass("button-l4-armed");
    const armedStyles = await armed.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color };
    });
    expect(armedStyles.background).toBe("rgb(181, 52, 31)"); // --accent
    expect(armedStyles.color).toBe("rgb(255, 253, 247)"); // --on-color

    await armed.evaluate((el) => (el as HTMLElement).blur());
    await expect(
      page.getByRole("button", { name: "Discard without logging" }),
    ).toBeVisible();
  });
});

// Phase 6C (Task 2): the Log screen (session door). Reaches it through the
// real complete -> "Log this session" hand-off, same as e2e/session.spec.ts's
// own full-loop test, rather than navigating to /session/log directly — a
// direct nav with no run record would just redirect to /today, the exact
// deep-link guard this screen has.
test.describe("log session screen (session door)", () => {
  const title = "Design Log Session Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-log-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Log Tester",
    });
    await setBaselines(page);
    // A single short 6k-based split step: the time phase auto-advances
    // straight to /session/complete with no NEXT/finish-stage click needed,
    // and its "6k" reference is exactly what the PACES LOCKED panel's own
    // baseline-reconstruction reads (Task 2's own `lockedBaseline`).
    await importBulk(
      page,
      [`${title} | AT | medium | 3`, "w 0:03 6k-2"].join("\n"),
    );
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page).toHaveURL(/\/session\/complete$/, { timeout: 6000 });
    await page.getByRole("link", { name: "Log this session" }).click();
    await expect(page).toHaveURL(/\/session\/log$/);
    await expect(
      page.getByRole("heading", { name: `Log ${title}` }),
    ).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // L1 (whole-branch review): this describe renders `.log-paces-label`
  // (10px mono), a guard-gap the ink-4 sweep never covered on this screen.
  test("no mono label ≤11px still paints at --ink-4", async ({ page }) => {
    await assertNoFailingInk4Labels(page);
  });

  test("no tab bar on this session route", async ({ page }) => {
    await expect(page.locator(".tabbar")).toHaveCount(0);
  });

  test("renders real content, never a bare dash: the PACES LOCKED 6K value, the per-step list, and EXPECTED N/5", async ({
    page,
  }) => {
    // DESIGN_BASELINES' k6Seconds (120.0) -> "2:00.0", recovered exactly
    // regardless of this step's own -2 offset — the baseline, not the
    // per-step split. F1 (whole-branch review): no step here references
    // "2k" at all, so that half is OMITTED entirely (not a "2K —" dash).
    // This fixture is a bulk-imported synthetic (single 6k-only step) that
    // deliberately doesn't mix bases, to prove the OMIT branch directly —
    // none of the library's workouts do either (zero of the 300 generated
    // workouts reference both bases post the taste pass, 9b9fde5 — 3 did
    // before it — per Task 11/12's LogSession.tsx and DEVIATIONS.md
    // reconciliation), but this test never depends on a real seeded
    // workout's shape.
    await expect(page.locator(".log-paces-value")).toHaveText("6K 2:00.0");
    await expect(page.locator(".log-step-row")).toHaveCount(1);
    // 118.0s target (120 - 2), shown as the frozen split this step was
    // logged at.
    await expect(page.locator(".log-step-target")).toHaveText("1:58.0");
    // The bulk-import header's own pain field ("| AT | medium | 3").
    await expect(page.locator(".classification-pain-word")).toHaveText(
      "EXPECTED 3/5",
    );
  });

  // Phase 6C Task 2's own F4 fix round found `.log-save` rendering at 60px
  // against a 54px spec — neither `button` nor `.button-primary` resets the
  // browser's UA button chrome (a ~2px outset border plus ~1px vertical
  // padding), which `min-height`/`line-height` alone can't clamp below. The
  // fix (`border: none; padding: 0;`, scoped to `.log-save` only — see
  // index.css's own comment on this, and the app-wide `.button-primary` gap
  // now recorded in docs/design/DEVIATIONS.md, whole-branch review IMP-6)
  // was never pinned by a computed-style assertion — a deferred obligation
  // from that round's review, closed here (Phase 6C Task 4) so a future
  // edit to `.log-save`/`.button-primary` can't silently regress the height
  // back to the UA default.
  test("Save session renders at the specced 54px height, not the browser's default button chrome", async ({
    page,
  }) => {
    const height = await page
      .locator(".log-save")
      .evaluate((el) => getComputedStyle(el).height);
    expect(height).toBe("54px");
  });

  // Task 3 (ui-fix round): the old `.baseline-confirm` side panel is gone —
  // Discard now arms in place, the level system's own L4/L4-armed idiom
  // (same shape WorkoutDetail's own Delete workout and SessionComplete's own
  // Discard both use) — this sweep runs with the button already armed.
  test.describe("Discard staged", () => {
    test.beforeEach(async ({ page }) => {
      await page
        .getByRole("button", { name: "Discard without logging" })
        .click();
      await expect(
        page.getByRole("button", { name: "Tap again to discard" }),
      ).toBeVisible();
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations", async ({ page }) => {
      await assertNoA11yViolations(page);
    });

    test("armed fills solid accent, cream label — the same L4-armed look as WorkoutDetail's Delete and SessionComplete's Discard", async ({
      page,
    }) => {
      const armed = page.getByRole("button", { name: "Tap again to discard" });
      await expect(armed).toHaveClass("button-l4-armed");
      await page.mouse.move(0, 0);
      const styles = await armed.evaluate((el) => {
        const s = getComputedStyle(el);
        return { background: s.backgroundColor, color: s.color };
      });
      expect(styles.background).toBe("rgb(181, 52, 31)"); // --accent
      expect(styles.color).toBe("rgb(255, 253, 247)"); // --on-color
    });
  });
});

// Phase 6C (Task 3): the Log screen's manual door — the same LogSession
// component and CSS classes as the session door above, reached instead via
// a workout's own detail screen ("Log it after"), not a completed timer
// run. Deliberately does NOT re-sweep every assertion the session-door
// block above already covers on the shared `LogScreen` markup — only what
// actually differs for this door: no tab-bar hiding, no Discard button, and
// a workout-detail entry point instead of the complete-screen hand-off.
test.describe("log session screen (manual door)", () => {
  const title = "Design Manual Log Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-manual-log-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Manual Log Tester",
    });
    await setBaselines(page);
    await importBulk(
      page,
      [`${title} | AT | medium | 3`, "w 1:00 6k-2"].join("\n"),
    );
    await page.locator(".workout-row").filter({ hasText: title }).click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
    await page.getByRole("link", { name: "Log it after" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);
    await expect(
      page.getByRole("heading", { name: `Log ${title}` }),
    ).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // L1 (whole-branch review): this describe renders `.log-paces-label`
  // (10px mono), a guard-gap the ink-4 sweep never covered on this screen.
  test("no mono label ≤11px still paints at --ink-4", async ({ page }) => {
    await assertNoFailingInk4Labels(page);
  });

  // Unlike the session door (which hides the tab bar as the same full-bleed
  // holder family as /session/complete), this route keeps its tab bar
  // visible — corrected by the whole-branch review (IMP-2): this comment
  // used to say that was because the manual door "has no Discard/Back
  // button to leave with," which stopped being true once that same review
  // added a `BackLink` to this door's main state too (it just never needed
  // the tab bar hidden to have a non-destructive exit). The real reason
  // (still valid, AppRoutes.tsx's own comment on this route registration):
  // this door touches no storage at all, so there's nothing an early exit
  // could leave dangling, and showing the tab bar costs it nothing.
  test("the tab bar stays visible on this route, unlike the session door", async ({
    page,
  }) => {
    await expect(page.locator(".tabbar")).toHaveCount(1);
  });

  test("no Discard button at all — there is nothing staged to discard", async ({
    page,
  }) => {
    await expect(page.getByRole("button", { name: /discard/i })).toHaveCount(0);
  });

  test("renders real content, never a bare dash: the PACES LOCKED 6K value, the per-step list, and EXPECTED N/5", async ({
    page,
  }) => {
    // The manual door's lock moment IS save time (task brief) — PACES
    // LOCKED shows the CURRENT baseline directly (DESIGN_BASELINES'
    // k6Seconds, 120.0 -> "2:00.0"), while the step row shows the
    // RESOLVED split this step's own -2 offset produces (120 - 2 = 118.0
    // -> "1:58.0") — two different, both-honest numbers, not a
    // discrepancy. Only "6K" renders (no step here references "2k" at
    // all).
    await expect(page.locator(".log-paces-value")).toHaveText("6K 2:00.0");
    await expect(page.locator(".log-step-row")).toHaveCount(1);
    await expect(page.locator(".log-step-target")).toHaveText("1:58.0");
    await expect(page.locator(".classification-pain-word")).toHaveText(
      "EXPECTED 3/5",
    );
  });
});

// Today enhancements (Task 4): the Log screen's plan toggle, with a plan
// actually active — no other design sweep in this file ever chooses a plan
// before reaching either Log door, so the toggle has never been rendered
// under this file's own axe/tap-target sweeps at all. Reuses the manual
// door (no timer run needed to reach it, unlike the session door) plus this
// file's own top-level `choosePlan`/`resetPlanProgress` helpers.
test.describe("log session screen (manual door, plan active — the plan toggle)", () => {
  const title = "Design Log Plan Toggle Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-log-toggle-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Log Toggle Tester",
    });
    await setBaselines(page);
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);
    await importBulk(
      page,
      [`${title} | AT | medium | 3`, "w 1:00 6k-2"].join("\n"),
    );
    await page.locator(".workout-row").filter({ hasText: title }).click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
    await page.getByRole("link", { name: "Log it after" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);
    await expect(
      page.getByRole("heading", { name: `Log ${title}` }),
    ).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("every visible interactive element has a >=44x44 tap target, including the plan toggle in its default state", async ({
    page,
  }) => {
    await assertTapTargets(page);
    const toggle = page.getByRole("button", { name: /COUNTS TOWARD PLAN/ });
    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toContainText("SESSION 1 OF 84");
  });

  test("zero WCAG 2A/2AA violations with the plan toggle rendered in its default state", async ({
    page,
  }) => {
    await assertNoA11yViolations(page);
  });

  test.describe("toggled to OUTSIDE THE PLAN", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("button", { name: /COUNTS TOWARD PLAN/ }).click();
      await expect(
        page.getByRole("button", { name: "OUTSIDE THE PLAN — won't advance" }),
      ).toBeVisible();
    });

    test("every visible interactive element has a >=44x44 tap target, including the toggled plan toggle", async ({
      page,
    }) => {
      await assertTapTargets(page);
      const toggle = page.getByRole("button", {
        name: "OUTSIDE THE PLAN — won't advance",
      });
      const box = await toggle.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
    });

    test("zero WCAG 2A/2AA violations with the plan toggle in its toggled state", async ({
      page,
    }) => {
      await assertNoA11yViolations(page);
    });

    // Fix round 2 (whole-branch review, Md1): OUTSIDE THE PLAN's own
    // selected fill used to switch to an accent border/text — the round's
    // last surviving "accent means selected" use. Now the same plain ink
    // fill every other selected state uses, never pinned by a computed-style
    // assertion before this one.
    test("the toggled state fills ink, not accent", async ({ page }) => {
      const toggle = page.getByRole("button", {
        name: "OUTSIDE THE PLAN — won't advance",
      });
      const styles = await toggle.evaluate((el) => {
        const s = getComputedStyle(el);
        return { background: s.backgroundColor, color: s.color };
      });
      expect(styles.background).toBe("rgb(27, 26, 23)"); // --ink
      expect(styles.color).toBe("rgb(255, 253, 247)"); // --on-color
    });
  });
});

// Phase 6B (Task 5): the three mutually-exclusive staged-confirm panels
// (END's abandon confirm, ▶/NEXT's finish confirm, NEXT's suspect-actual
// choice) each get their own sweep, one staged open at a time — the
// brief's own "sweep with one staged open" instruction. All three reuse
// token pairings already computed in index.css's own comment; these sweeps
// prove the LIVE rendered panel, not just the pairing on paper.
test.describe("timer screen: END staged (abandon confirm)", () => {
  const title = "Design Timer End Confirm Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-timer-end-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Timer End Tester",
    });
    await setBaselines(page);
    await importBulk(
      page,
      [`${title} | AN | easy | 2`, "w 5:00 6k @20", "w 3:00 6k @20"].join("\n"),
    );
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 2/)).toBeVisible();
    await page.getByRole("button", { name: "END →" }).click();
    await expect(page.locator(".timer-end-confirm")).toBeVisible();
    await expect(page.getByText("Abandon this session?")).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("the panel copy and Abandon button match the token palette", async ({
    page,
  }) => {
    // Neutralize the pointer before any computed-style read (CI hazard,
    // whole-branch review follow-up): the beforeEach's own staging click
    // (END →) can leave the mouse resting somewhere `:hover` styling
    // reaches once the panel reflows the page under it — a neutral corner
    // with nothing interactive there can never apply a hover rule.
    await page.mouse.move(0, 0);
    const copyColor = await page
      .locator(".timer-end-copy")
      .evaluate((el) => getComputedStyle(el).color);
    expect(copyColor).toBe("rgb(63, 60, 53)"); // --ink-2

    const panelBg = await page
      .locator(".timer-end-confirm")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(panelBg).toBe("rgb(239, 234, 222)"); // --surface-sunken

    const abandonBg = await page
      .locator(".timer-confirm-primary")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(abandonBg).toBe("rgb(181, 52, 31)"); // --accent
  });
});

test.describe("timer screen: finish staged (▶ on the last phase)", () => {
  const title = "Design Timer Finish Confirm Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-timer-finish-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Timer Finish Tester",
    });
    await setBaselines(page);
    await importBulk(
      page,
      [`${title} | AN | easy | 1`, "w 5:00 6k @20"].join("\n"),
    );
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();
    // Completion is a documented one-way door (Timer.tsx's own comment) —
    // ▶ on the ONLY (therefore last) phase stages a finish confirm instead
    // of completing outright.
    await page.getByRole("button", { name: "Next phase" }).click();
    await expect(page.getByText("Finish this session?")).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("the Finish session button matches the token palette", async ({
    page,
  }) => {
    // Neutralize the pointer before the read (CI hazard, whole-branch
    // review follow-up): the beforeEach's own staging click (▶, the
    // control row's rightmost slot) lands almost exactly where "Finish
    // session" — the finish panel's own rightmost/primary button — renders
    // once the panel replaces that same control row, so CI's pointer can
    // still be resting on it when this reads `:hover` styling instead of
    // the resting state.
    await page.mouse.move(0, 0);
    const finishBg = await page
      .getByRole("button", { name: "Finish session" })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(finishBg).toBe("rgb(181, 52, 31)"); // --accent
  });
});

test.describe("timer screen: suspect actual staged (NEXT tapped far off the estimate)", () => {
  const title = "Design Timer Suspect Confirm Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-timer-suspect-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Timer Suspect Tester",
    });
    await setBaselines(page);
    await importBulk(
      page,
      [`${title} | AN | easy | 2`, "w 500m 6k @20", "w 3:00 6k @20"].join("\n"),
    );
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText("STEP 1 OF 2 · WORK · 500M")).toBeVisible();
    // 500m @6k prices this phase's estimate at 120s (DESIGN_BASELINES' own
    // k6Seconds: 120; domain/expand.js's own phaseSeconds formula) —
    // tapping NEXT within a couple of seconds of the phase starting is far
    // under half that (60s), well inside Timer.tsx's own isSuspectActual
    // lower bound, so this reliably stages the choice rather than racing a
    // timing window (contrast the session-complete describe above, which
    // deliberately lands INSIDE the safe window instead).
    await page.getByRole("button", { name: "NEXT →" }).click();
    await expect(page.locator(".timer-suspect")).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("the suspect copy and Keep split button match the token palette", async ({
    page,
  }) => {
    // Neutralize the pointer before the read (CI-only failure, whole-branch
    // review follow-up: this is the exact test CI reported —
    // `.timer-suspect-keep` reading `--accent-hover` — since the
    // beforeEach's own staging click (NEXT →, the control row's rightmost
    // slot) lands almost exactly where "Keep split" renders once the
    // suspect panel replaces that same control row, leaving CI's pointer
    // resting on it for this read.
    await page.mouse.move(0, 0);
    const copyColor = await page
      .locator(".timer-suspect-copy")
      .evaluate((el) => getComputedStyle(el).color);
    expect(copyColor).toBe("rgb(63, 60, 53)"); // --ink-2

    const keepBg = await page
      .locator(".timer-suspect-keep")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(keepBg).toBe("rgb(181, 52, 31)"); // --accent
  });
});

test.describe("iOS safe-area insets", () => {
  // A desktop-Chrome e2e run always resolves env(safe-area-inset-*) to 0,
  // so pixel/computed-style assertions here would pass whether or not the
  // env() rules exist at all (0px is also the default for an undeclared
  // padding). Instead these assert the *mechanism*: the viewport meta that
  // makes env() resolve on iOS, and the literal env() expressions in the
  // stylesheet source — both of which genuinely fail if someone deletes the
  // safe-area handling, unlike a computed-value check would.

  test("viewport meta opts into safe-area insets (viewport-fit=cover)", async ({
    page,
  }) => {
    const response = await page.goto("/");
    const html = await response!.text();
    const match = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/);
    expect(match, "no <meta name=viewport> found in served HTML").not.toBe(
      null,
    );
    expect(match![1]).toContain("viewport-fit=cover");
  });

  test("tab bar, app shell, and screen padding declare safe-area env() expressions", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "design-safe-area@e2e.test",
      name: "Design Safe Area Tester",
    });
    await page.goto("/library");

    const declarations = await page.evaluate(() => {
      // Walk every same-origin stylesheet's rules (skip any that throw,
      // e.g. cross-origin font sheets) and return the raw declaration
      // block text for each selector we care about, so the assertion
      // inspects the *authored* CSS value rather than a resolved/computed
      // one that can't distinguish "env() present, evaluates to 0" from
      // "no such padding rule at all".
      function cssTextFor(selector: string): string {
        for (const sheet of Array.from(document.styleSheets)) {
          let rules: CSSRuleList;
          try {
            rules = sheet.cssRules;
          } catch {
            continue;
          }
          for (const rule of Array.from(rules)) {
            if (
              rule instanceof CSSStyleRule &&
              rule.selectorText === selector
            ) {
              return rule.cssText;
            }
          }
        }
        return "";
      }
      return {
        tabbar: cssTextFor(".tabbar"),
        appShell: cssTextFor(".app-shell"),
        screen: cssTextFor(".screen"),
        builderScreen: cssTextFor(".screen.builder-screen"),
      };
    });

    expect(
      declarations.tabbar,
      "no .tabbar rule found in any stylesheet",
    ).not.toBe("");
    expect(declarations.tabbar).toContain("env(safe-area-inset-bottom");

    expect(
      declarations.appShell,
      "no .app-shell rule found in any stylesheet",
    ).not.toBe("");
    expect(declarations.appShell).toContain("env(safe-area-inset-bottom");

    expect(
      declarations.screen,
      "no .screen rule found in any stylesheet",
    ).not.toBe("");
    expect(declarations.screen).toContain("env(safe-area-inset-top");
    expect(declarations.screen).toContain("env(safe-area-inset-left");
    expect(declarations.screen).toContain("env(safe-area-inset-right");

    // The builder screen's own compound-selector override (index.css:
    // "The compound selector (rather than a bare .builder-screen rule)
    // guarantees this wins over .screen's own padding/margin regardless of
    // stylesheet order") silently dropped the insets earlier this phase —
    // the header rendered under the Dynamic Island on a notched iPhone
    // until it was caught and fixed. Assert it structurally so a future
    // edit to this override can't drop the insets again unnoticed. Bottom
    // is deliberately a plain 24px here (index.css: the bottom inset is
    // already reserved once, screen-wide, by .app-shell), so only top/
    // right/left are asserted, matching the base `.screen` rule above.
    expect(
      declarations.builderScreen,
      "no .screen.builder-screen rule found in any stylesheet",
    ).not.toBe("");
    expect(declarations.builderScreen).toContain("env(safe-area-inset-top");
    expect(declarations.builderScreen).toContain("env(safe-area-inset-left");
    expect(declarations.builderScreen).toContain("env(safe-area-inset-right");
  });
});

test.describe("iOS input zoom guard", () => {
  // iOS Safari/WKWebView zooms the page when a focused input's font-size is
  // below 16px, wrecking the 44px-tap-target layout (device report,
  // 2026-08-01: the builder title field zoomed on focus). Chromium cannot
  // reproduce the zoom itself, so this asserts the mechanism: every
  // input/textarea on every screen computes to >=16px. The signed-in
  // builder + import screens carry every typed field in the app; You is
  // stepper-only but swept anyway in case that changes.
  for (const [name, path] of [
    ["builder", "/library/new"],
    ["import", "/library/import"],
    ["you", "/you"],
  ] as const) {
    test(`every input on ${name} computes font-size >= 16px`, async ({
      page,
    }) => {
      await signInViaBackdoor(page, {
        email: `design-zoom-${name}@e2e.test`,
        name: "Zoom Guard",
      });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const undersized = await page.evaluate(() =>
        Array.from(document.querySelectorAll("input, textarea"))
          .map((el) => ({
            id:
              el.getAttribute("aria-label") ??
              el.getAttribute("class") ??
              el.tagName,
            size: parseFloat(getComputedStyle(el).fontSize),
          }))
          .filter((e) => e.size < 16),
      );
      expect(undersized, JSON.stringify(undersized)).toEqual([]);
    });
  }
});
