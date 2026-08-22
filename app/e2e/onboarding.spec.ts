import { test, expect, type Page } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

// Phase 6I Task 8: the whole fresh-user onboarding arc, against the real
// stack — block + card on Today, a cross-surface read advancing the count,
// the no-baseline card's own real START -> Confirm -> Countdown -> Timer ->
// Complete -> Log -> Save loop (an effort-only workout run with NULL
// baselines, the domain change this phase owns), the either-null card
// swap once one baseline lands, the plan/suggestion apparatus returning
// once both do, DISMISS, the News pin, and the /you/learning round-trip
// (PUT IT BACK, MARK ALL FOUR UNREAD). One long test, deliberately: every
// step depends on the state the previous one left (the read count carried
// through to the pin's own meta line, the dismissed flag carried through
// to the News pin's very existence) — splitting it into independent tests
// would mean re-deriving that state at each boundary instead of proving
// the real, continuous journey a fresh rower actually takes.
//
// `RUN_ID` (news.spec.ts's own convention, its own comment explains why):
// this test asserts ABSOLUTE read/unread counts at a specific step, and the
// compose stack's Postgres volume persists across back-to-back `pnpm e2e`
// invocations — a fixed email would carry read state from a prior run into
// this one and make "1 OF 4 READ" a lie on the second pass.

// The two designated onboarding titles (domain/onboarding.ts's
// ONBOARDING_TITLES) — hardcoded here rather than imported, matching every
// other e2e file's own precedent of literal strings rather than reaching
// into `domain/` from a Playwright spec.
const K6_TITLE = "6K Test";
const K2_TITLE = "2K Test";

/** Partial-safe: `PUT /api/baselines` accepts either field independently
 *  (server/routes/data.ts's own per-field loop), which is exactly what
 *  "set the 6k, leave the 2k null" needs. Task-review round (PR #66,
 *  Finding 1, BLOCKER) FIXED `BaselineEditor.tsx`'s own Apply so its real
 *  UI CAN now produce this state (it used to always commit both fields
 *  from the seeded draft, fabricating a fake value for whichever side the
 *  rower never touched — the comment this replaces documented that bug as
 *  if it were a permanent constraint). This helper still goes straight at
 *  the real route rather than the UI for THIS file's own tests, which are
 *  about Today's/News's downstream reaction to a known baseline state, not
 *  about proving the editor's own reachability — that proof now lives in
 *  its own dedicated test below ("the derivation offer is reachable
 *  through the real editor flow"), which deliberately does NOT use this
 *  helper. Same "state setup via a genuine API call, UI budget spent on
 *  the flow actually under test" idiom every other e2e file in this repo
 *  already uses for baselines/plan/prefs. */
async function setBaselines(
  page: Page,
  patch: { k2Seconds?: number; k6Seconds?: number },
): Promise<void> {
  const result = await page.evaluate(async (p) => {
    const res = await fetch("/api/baselines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, patch);
  if (!result.ok) {
    throw new Error(`baseline setup failed: ${result.status} ${result.body}`);
  }
}

/** Copied idiom from today.spec.ts/design.spec.ts's own `choosePlan`. A
 *  plan must be ACTIVE for this arc (spec: "outside-plan default WITH A
 *  PLAN ACTIVE" — the toggle's default only reads as a deliberate opt-out
 *  when there is a plan session it could otherwise have consumed). */
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

test.describe("Phase 6I: Today onboarding — the fresh-user arc", () => {
  test("block + card -> cross-surface read -> real no-baseline session -> either-null swap -> apparatus returns -> dismiss/pin/You round-trip", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `onboarding-arc-${RUN_ID}@e2e.test`,
      name: "Onboarding Arc",
    });
    // A plan active throughout — the outside-plan default (below) only
    // means something against a real plan session it could have consumed.
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);

    // -- fresh user: START HERE (0 OF 4, reads loaded) + the no-baseline
    //    card, defaulted to the 6k, plan/suggestion apparatus entirely gone.
    await page.goto("/today");
    await expect(page.locator(".starthere-block")).toBeVisible();
    await expect(page.locator(".starthere-label")).toHaveText(
      "START HERE · 0 OF 4 READ",
    );
    await expect(page.locator(".starthere-steps .starthere-row")).toHaveCount(
      4,
    );

    const card = page.locator(".baselinecard");
    await expect(card).toBeVisible();
    await expect(card.locator(".baselinecard-label")).toHaveText(
      "SUGGESTED · SETS YOUR BASELINE",
    );
    await expect(card.locator(".baselinecard-title")).toHaveText(
      "Your first 6k",
    );
    await expect(card.locator(".baselinecard-duration")).toHaveText(
      "ABOUT 25 MIN",
    );
    await expect(card.locator(".baselinecard-chip")).toHaveText(
      "6K BASELINE · NOT SET · ROW IT HOW IT FEELS",
    );
    await expect(
      page.getByRole("button", { name: "2K INSTEAD" }),
    ).toBeVisible();

    // Plan apparatus, entirely gone — not merely the suggestion card
    // (spec: "there is no suggestion to filter or swap").
    await expect(page.locator(".today-plan-line")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "FILTER ⌄" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "SHUFFLE ↻" })).toHaveCount(
      0,
    );

    // -- cross-surface read: reading "baselines" from News legitimately
    //    advances the SAME count Today's block shows (the spec's own
    //    "linking rather than restating" principle) — no restating needed.
    await page.goto("/news");
    await expect(page.locator(".news-unread-count")).toHaveText("7 UNREAD");
    await page.locator('a.news-row[href="/news/baselines"]').click();
    await expect(page).toHaveURL(/\/news\/baselines$/);
    await expect(page.locator(".reader-body")).toBeVisible();

    // Back to Today via IN-APP navigation (the tab link), not `page.goto`
    // (a hard reload): Reader.tsx's own `markRead` PUT fires from a mount
    // useEffect, fire-and-forget with no on-screen completion signal — a
    // hard navigation right after opening the article can outrace or abort
    // that still-in-flight request (found by this test's own first full-
    // suite run: an intermittent "0 OF 4 READ" one nav later). Staying
    // in-SPA keeps the same JS execution context (and therefore the same
    // in-flight fetch) alive across the trip, the same reason news.spec.ts's
    // own read test uses "← BACK" rather than `page.goto("/news")` to return.
    await page
      .locator('nav[aria-label="Main"]')
      .getByRole("link", { name: "TODAY" })
      .click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.locator(".starthere-label")).toHaveText(
      "START HERE · 1 OF 4 READ",
    );

    // -- card Start -> the countdown DIRECTLY, UNBLOCKED (needsBaselines()
    //    reads false for an effort-only workout — the domain change this
    //    phase owns; BaselineCard's own Start also carries no baselines
    //    guard at all, fast-follow spec §3 entry 3 — ConfirmTargets, the
    //    screen that used to sit between them, is deleted) -> SKIP the
    //    countdown -> the timer.
    const startButton = page.getByRole("button", { name: "Start" });
    await expect(startButton).toBeEnabled();
    await startButton.click();

    await expect(page).toHaveURL(/\/session\/countdown$/);
    await expect(page.getByText("GET ON THE HANDLE")).toBeVisible();
    await page.getByRole("button", { name: "SKIP ›" }).click();
    await expect(page).toHaveURL(/\/session\/run$/);
    // The K6 onboarding workout genuinely started, not some other one —
    // the same proof the old Confirm heading used to carry, now read off
    // the live timer instead.
    await expect(page.locator(".timer-name")).toHaveText(K6_TITLE);

    // No warm-up (the setting defaults OFF — this arc never turns it on,
    // and the 6K Test's own seed steps carry no `wu` any more since
    // 2026-08-09's warmup-setting spec stripped it): the distance work
    // phase is the ONLY phase, STEP 1 OF 1 — the exact case
    // `hasRemainingEstimate` exists for. The TARGET SPLIT card shows the
    // effort word ("EASY" — {effort:"min"}), never a resolved number, and
    // TOTAL LEFT/the phase progress bar are both gone entirely rather than
    // frozen at 0:00/0%.
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();
    const targetCard = page.locator(".timer-card").first();
    await expect(targetCard.locator(".timer-card-label")).toHaveText(
      "TARGET SPLIT",
    );
    await expect(targetCard.locator(".timer-card-value")).toHaveText("EASY");
    await expect(page.getByText("TOTAL LEFT")).toHaveCount(0);
    await expect(page.locator(".timer-phase-bar")).toHaveCount(0);

    // The server's own `actualSplit` floor (server/routes/data.ts:
    // 30..600 s/500m) means a split computed from a LITERALLY instant
    // click (a fraction of a second for 6000m) would 400 at save time —
    // discovered by this test's own first run, which produced exactly that
    // save failure. Reaching a real, valid split honestly needs the
    // distance phase's own elapsed to clear 30s/500m (360s for 6000m)
    // BEFORE tapping NEXT — literally waiting six minutes of wall clock
    // per run is not a serious option for a suite this runs inside twice
    // per gate. Playwright's Clock (`page.clock.fastForward`, "closing the
    // laptop lid and reopening it later") advances the SAME `Date`/timers
    // `Timer.tsx`/`engine.ts` read from, so the elapsed this produces is
    // exactly as real as a six-minute wait would have measured, just
    // reached without literally waiting it out.
    await page.clock.install();
    await page.clock.fastForward("07:00");

    // NEXT on the last (distance) phase: `isSuspectActual` reads false
    // unconditionally here (`phaseSeconds` is null for an un-priceable
    // effort-distance phase — nothing to compare the real elapsed against),
    // so this stages the ordinary one-way-door finish confirm, not the
    // suspect Keep/Discard panel.
    await page.getByRole("button", { name: "NEXT →" }).click();
    await expect(page.getByText("Finish this session?")).toBeVisible();
    await page.getByRole("button", { name: "Finish session" }).click();
    // Post-workout-summary spec §3: the finish stage navigates straight to
    // the summary — no intermediate SessionComplete/"Log this session" hop.
    await expect(page).toHaveURL(/\/session\/log$/);

    // -- Summary: a plan is active AND this is a designated onboarding
    //    workout, so §2F's button-order rule makes Save without logging
    //    LEAD (Log against plan demotes to the outline slot) — "a baseline
    //    test must not silently consume plan session 1," now expressed as
    //    which button is primary rather than a pre-toggled state.
    const leadSave = page.getByRole("button", { name: "Save without logging" });
    await expect(leadSave).toBeVisible();
    await expect(leadSave).toHaveClass(/summary-save-lead/);
    await expect(
      page.getByRole("button", { name: /Log against plan/ }),
    ).toHaveClass(/summary-save-secondary/);

    // The measured split survives into the summary: the ONLY work row (the
    // distance phase — no warm-up is set for this walk, so there's nothing
    // else to log) is MEASURED — a real stopwatch pace, the 6I amendment to
    // the drop rule, proven end to end — with no target (5G rule, effort).
    const rows = page.locator(".summary-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator(".summary-row-pace")).not.toBeEmpty();

    await page.getByRole("button", { name: "HELD" }).click();
    await page.getByRole("button", { name: "Pain 2" }).click();
    await leadSave.click();
    await expect(page).toHaveURL(/\/today$/);

    // -- either-null: baseline entry is manual (You), never auto-captured
    //    from the log just saved — the card still offers the 6k, untouched.
    await expect(page.locator(".baselinecard-title")).toHaveText(
      "Your first 6k",
    );

    // "set the 6k in You" (a real, partial API round trip — see
    // `setBaselines`'s own doc comment for why this file still uses the
    // route directly rather than the editor's UI) -> the card offers ONLY
    // the 2k now, no toggle.
    await setBaselines(page, { k6Seconds: 122 });
    await page.reload();
    await expect(page.locator(".baselinecard-title")).toHaveText(
      "Your first 2k",
    );
    await expect(page.locator(".baselinecard-duration")).toHaveText(
      "ABOUT 8 MIN",
    );
    await expect(page.locator(".baselinecard-chip")).toHaveText(
      "2K BASELINE · NOT SET · ROW IT HOW IT FEELS",
    );
    await expect(page.getByRole("button", { name: /INSTEAD/ })).toHaveCount(0);

    // "set the 2k" -> both set -> real suggestions, and the whole
    // plan/suggestion apparatus, return.
    await setBaselines(page, { k2Seconds: 112 });
    await page.reload();
    await expect(page.locator(".baselinecard")).toHaveCount(0);
    await expect(page.locator(".today-plan-line")).toContainText(
      /SESSION \d+ OF 84/,
    );
    await expect(page.getByRole("button", { name: "FILTER ⌄" })).toBeVisible();
    await expect(page.getByRole("button", { name: "SHUFFLE ↻" })).toBeVisible();
    // The outside-plan log didn't advance doneN — still session 1.
    await expect(page.locator(".today-plan-line")).toContainText(
      "SESSION 1 OF 84",
    );

    // -- DISMISS: immediate, no staged confirm.
    await expect(page.locator(".starthere-block")).toBeVisible();
    await page.getByRole("button", { name: "DISMISS" }).click();
    await expect(page.locator(".starthere-block")).toHaveCount(0);

    // -- the News pin appears only now, carrying the SAME read count
    //    (1 OF 4) the block itself showed all along. Via the tab link (SPA
    //    nav), not `page.goto` — DISMISS's own `preferences.save` is the
    //    SAME fire-and-forget shape `markRead` is (usePreferences.ts's own
    //    comment: "optimistic value may revert on next load"), so a hard
    //    reload right after clicking it risks the identical outrace this
    //    file's earlier cross-surface-read step already hit once.
    await page
      .locator('nav[aria-label="Main"]')
      .getByRole("link", { name: "NEWS" })
      .click();
    await expect(page).toHaveURL(/\/news$/);
    const pin = page.locator("a.news-pin-starthere");
    await expect(pin).toBeVisible();
    await expect(pin.locator(".news-row-title")).toHaveText(
      "Start here, in four steps",
    );
    await expect(pin.locator(".news-row-meta")).toHaveText(
      "1 OF 4 READ · DISMISSED ON TODAY",
    );

    await pin.click();
    await expect(page).toHaveURL(/\/you\/learning$/);
    await expect(
      page.getByRole("heading", { name: "Learning the app" }),
    ).toBeVisible();
    await expect(page.locator(".learning-progress-count")).toHaveText(
      "1 OF 4 READ",
    );
    await expect(page.locator(".learning-status-line")).toHaveText(
      "DISMISSED ON TODAY · STILL PINNED IN NEWS",
    );

    // -- PUT IT BACK ON TODAY: restores the block, read state untouched.
    await page.getByRole("button", { name: "PUT IT BACK ON TODAY" }).click();
    await expect(page.locator(".learning-status-line")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "PUT IT BACK ON TODAY" }),
    ).toHaveCount(0);
    // Same fire-and-forget-save reasoning as DISMISS above — the tab link,
    // not `page.goto`.
    await page
      .locator('nav[aria-label="Main"]')
      .getByRole("link", { name: "TODAY" })
      .click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.locator(".starthere-block")).toBeVisible();

    // -- MARK ALL FOUR UNREAD (staged, tap-again idiom): un-reads every
    //    step slug AND clears the dismissed flag (a no-op here — already
    //    put back) — cross-surface consequence, pinned end to end: the
    //    count drops to 0 here on /you/learning, "baselines" un-greys back
    //    on News, and News's own unread count rises.
    await page.goto("/you/learning");
    await expect(page.locator(".learning-progress-count")).toHaveText(
      "1 OF 4 READ",
    );
    const markAllUnread = page.getByRole("button", {
      name: "MARK ALL FOUR UNREAD",
    });
    await markAllUnread.click();
    await expect(page.getByRole("button", { name: "TAP AGAIN" })).toBeVisible();
    await page.getByRole("button", { name: "TAP AGAIN" }).click();
    await expect(page.locator(".learning-progress-count")).toHaveText(
      "0 OF 4 READ",
    );

    // Same fire-and-forget reasoning again — MARK ALL FOUR UNREAD fires
    // four `markUnread` DELETEs plus a `preferences.save`, none awaited by
    // the click handler; the tab link keeps them alive across the trip.
    await page
      .locator('nav[aria-label="Main"]')
      .getByRole("link", { name: "NEWS" })
      .click();
    await expect(page).toHaveURL(/\/news$/);
    // Un-greyed: "baselines" reads unread again, and the count rises back
    // from 5 (after the earlier read) to 6 (this account's full, untouched
    // registry) — a real reversal, not merely "still shows 6 because
    // nothing else was ever read."
    await expect(page.locator(".news-unread-count")).toHaveText("7 UNREAD");
    await expect(
      page.locator('a.news-row[href="/news/baselines"]'),
    ).toHaveAttribute("data-read", "false");
    // Un-dismissed too (idempotent here — PUT IT BACK already cleared it):
    // the pin itself is gone, since it renders only while dismissed.
    await expect(page.locator("a.news-pin-starthere")).toHaveCount(0);
  });
});

// Suggestion-exclusion pins (spec: "a baselines-set user's SHUFFLE pool
// never contains a designated title, and Library's list doesn't show
// them"). Separate from the arc above — these need a rower who ALREADY has
// both baselines set (the arc proves the no-baseline PATH; this proves the
// two designated workouts stay invisible once a rower is past it).
test.describe("Phase 6I: designated-workout exclusion", () => {
  test("a baselines-set veteran's SHUFFLE pool never surfaces the 6K Test or the 2K Test", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `onboarding-exclusion-shuffle-${RUN_ID}@e2e.test`,
      name: "Onboarding Exclusion Shuffle",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    // No plan chosen — freestyle, whose own pool scans the WHOLE library
    // (today.spec.ts's own comment on this), the broadest surface the
    // exclusion has to hold up against.
    await page.goto("/today");
    await expect(page.locator(".today-card")).toBeVisible();

    const titleLocator = page.locator(".today-card-title");
    const shuffle = page.getByRole("button", { name: "SHUFFLE ↻" });
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      await shuffle.click();
      seen.add((await titleLocator.textContent()) ?? "");
    }
    expect(seen.has(K6_TITLE)).toBe(false);
    expect(seen.has(K2_TITLE)).toBe(false);
  });

  // James's ruling (2026-08-22, Phase 8A PR B): the Library-list exclusion
  // is GONE — a rower can voluntarily re-test, so both tests show as
  // ordinary rows. Only the SUGGESTION-POOL exclusion (the SHUFFLE test
  // above) survives.
  test("Library's list SHOWS the 6K Test and the 2K Test", async ({ page }) => {
    await signInViaBackdoor(page, {
      email: `onboarding-exclusion-library-${RUN_ID}@e2e.test`,
      name: "Onboarding Exclusion Library",
    });
    await page.goto("/library");
    await expect(page.locator(".library-count")).toHaveText(/^\d+ WORKOUTS$/);
    await expect(
      page.locator(".workout-row", { hasText: K6_TITLE }),
    ).toHaveCount(1);
    await expect(
      page.locator(".workout-row", { hasText: K2_TITLE }),
    ).toHaveCount(1);
  });
});

// Task-review round (PR #66, Finding 1, BLOCKER): the derivation offer's
// own eligibility (exactly one baseline server-null) used to be
// UNREACHABLE through the real app — `BaselineEditor.tsx`'s one Apply
// button always committed BOTH fields from the seeded draft, so a fresh
// rower's very first Apply fabricated a fake value for whichever side they
// never touched. This test proves the fix end to end against the real
// stack: touch ONLY one field through the real UI, Apply, and inspect the
// actual PUT wire body — no raw-API seeding anywhere in this test, unlike
// `setBaselines` above (deliberately: that helper proves nothing about
// whether the CLIENT's own Apply logic can produce this state).
test.describe("the derivation offer is reachable through the real editor flow (task review round, Finding 1)", () => {
  test("touching only the 6k field and applying sends ONLY k6Seconds — 2k stays null, and the offer plus Today's own no-baseline card both still name it", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `ui-notes-offer-reach-${RUN_ID}@e2e.test`,
      name: "UI Notes Offer Reach",
    });
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);

    let putBody: unknown = null;
    await page.route("**/api/baselines", async (route) => {
      if (route.request().method() === "PUT") {
        putBody = route.request().postDataJSON();
      }
      await route.continue();
    });

    await page.goto("/you");
    await page.locator(".baseline-value").first().waitFor();
    await page.getByRole("button", { name: "6k slower" }).click();
    await page.getByRole("button", { name: "Apply baselines" }).click();

    // The wire body itself — the exact assertion Finding 1 names — carries
    // ONLY the touched field. A fabricated k2Seconds here would mean the
    // fix didn't actually reach the network layer. Since Phase BL PR A the
    // touched field also carries its truthful provenance: a stepper nudge
    // is a manual entry.
    await expect.poll(() => putBody).not.toBeNull();
    expect(putBody).toStrictEqual({ k6Seconds: 122.5, k6Source: "manual" });

    // The offer becomes visible for 2k — reachable, at last, through the
    // real editor flow rather than a raw API seed.
    await expect(
      page.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
    ).toBeVisible();

    // And the SAME fact holds system-wide: Today's own no-baseline card (a
    // completely separate screen/component reading the identical baselines
    // row) still offers the 2k, not "both set."
    await page.goto("/today");
    await expect(page.locator(".baselinecard-title")).toHaveText(
      "Your first 2k",
    );
    await expect(page.locator(".baselinecard-chip")).toHaveText(
      "2K BASELINE · NOT SET · ROW IT HOW IT FEELS",
    );
  });
});
