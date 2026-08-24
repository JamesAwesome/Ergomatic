import { test, expect, type Page } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

// Phase 6I Task 8, rebuilt for Phase BL PR C's three doors, then cut
// down by James's 2026-08-23 ruling (the START HERE block, You › Learning
// the app, and News's dismissed-only pin are all REMOVED — News's pinned
// articles carry the teaching alone): the fresh-user onboarding arc
// against the real stack — the DOORS card leading Today, then DOOR 3
// walked end to end (doors -> RowPath -> the 6K Test's DETAIL screen ->
// Start Timer -> Countdown -> Timer -> Log -> Save), landing in PR B's
// post-save offer whose accept + derived-counterpart accept is what
// finally completes the pair — the plan/suggestion apparatus returning
// once it does. One long test, deliberately: every step depends on the
// state the previous one left. Doors 1 and 2 and Reset baseline setup get
// their own tests below (their state needs differ: door 1 wants a wire
// capture, reset wants a set pair).
//
// `RUN_ID` (news.spec.ts's own convention, its own comment explains why):
// the arc's post-save offer WRITES both baselines, and the compose
// stack's Postgres volume persists across back-to-back `pnpm e2e`
// invocations — a fixed email would carry the set pair from a prior run
// into this one and never see the doors at all on the second pass.

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

test.describe("Today onboarding — the fresh-user arc", () => {
  test("doors lead Today -> door 3 rowed end to end -> the offer completes the pair -> apparatus returns", async ({
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

    // -- fresh user: the three-door card LEADS the screen (James's
    //    2026-08-23 ruling took the START HERE teaching block off Today;
    //    nothing sits between the h1 and the card now), plan/suggestion
    //    apparatus entirely gone.
    await page.goto("/today");
    const card = page.locator(".doorscard");
    await expect(card).toBeVisible();
    // The card is the FIRST thing after the screen's own <h1> — red if
    // any teaching block is ever restored above it.
    await expect(page.locator("main.screen > :nth-child(1)")).toHaveClass(
      /screen-title/,
    );
    await expect(page.locator("main.screen > :nth-child(2)")).toHaveClass(
      /doorscard/,
    );
    await expect(card.locator(".doorscard-label")).toHaveText(
      "SET UP YOUR BASELINE",
    );
    await expect(card.locator(".doorscard-title")).toHaveText(
      "How do you want to start?",
    );
    // Three doors, outcome-framed, door 3 carrying James's 2026-08-23
    // strong-and-steady ruling in its sub-copy.
    await expect(
      page.getByRole("link", { name: /Recommend my baseline/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /I know my baseline/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Row to find my baseline/ }),
    ).toBeVisible();
    await expect(card).toContainText(
      "A strong, steady 6k, or race a 2k. Your time sets it.",
    );

    // Plan apparatus, entirely gone — not merely the suggestion card
    // (spec: "there is no suggestion to filter or swap").
    await expect(page.locator(".today-plan-line")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "FILTER ⌄" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "SHUFFLE ↻" })).toHaveCount(
      0,
    );

    // -- DOOR 3: the doors card -> RowPath (canvas copy, incl. the ruled
    //    strong-and-steady chip) -> the 6K Test's DETAIL screen (the #168
    //    pattern; the guards live there) -> BACK honestly returns to
    //    RowPath (state.from) -> Start Timer -> the countdown (unblocked:
    //    needsBaselines() reads false for the effort-only test) -> timer.
    await page.getByRole("link", { name: /Row to find my baseline/ }).click();
    await expect(page).toHaveURL(/\/onboarding\/row$/);
    await expect(
      page.getByRole("heading", { name: "Pick your distance" }),
    ).toBeVisible();
    await expect(page.getByText("Row a strong, steady 6k")).toBeVisible();
    await expect(
      page.getByText("6K BASELINE · STRONG AND STEADY · NOT A SPRINT"),
    ).toBeVisible();
    await expect(page.getByText("ABOUT 25 MIN")).toBeVisible();
    await expect(page.getByText("Race a 2k")).toBeVisible();
    await expect(
      page.getByText("2K BASELINE · NOT SET · ALL OUT, EMPTY THE TANK"),
    ).toBeVisible();

    await page.getByRole("link", { name: "Start" }).first().click();
    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(K6_TITLE);
    // Honest back navigation: the detail's BackLink reads the carried
    // from:"/onboarding/row", never the /library fallback.
    await page.getByRole("link", { name: "← BACK" }).click();
    await expect(page).toHaveURL(/\/onboarding\/row$/);
    await page.getByRole("link", { name: "Start" }).first().click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(K6_TITLE);

    await page.getByRole("button", { name: "Start Timer" }).click();
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
    // effort word ("ALL OUT" — {effort:"max"}, James's 2026-08-22
    // correction: a 6K test is all out, never easy), never a resolved
    // number, and
    // TOTAL LEFT/the phase progress bar are both gone entirely rather than
    // frozen at 0:00/0%.
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();
    const targetCard = page.locator(".timer-card").first();
    await expect(targetCard.locator(".timer-card-label")).toHaveText(
      "TARGET SPLIT",
    );
    await expect(targetCard.locator(".timer-card-value")).toHaveText("ALL OUT");
    await expect(page.getByText("TOTAL LEFT")).toHaveCount(0);
    await expect(page.locator(".timer-phase-bar")).toHaveCount(0);

    // A REALISTIC elapsed for 6000m — 26 minutes measures 2:10.0/500m,
    // inside the post-save offer's storable 60..240 band AND the server's
    // own `actualSplit` floor (30..600). The old 7-minute fast-forward
    // (35 s/500m) satisfied the server floor but sat below the offer's
    // band, which would silently skip the very prompt this arc now exists
    // to walk. Playwright's Clock (`page.clock.fastForward`, "closing the
    // laptop lid and reopening it later") advances the SAME `Date`/timers
    // `Timer.tsx`/`engine.ts` read from, so the elapsed this produces is
    // exactly as real as a 26-minute wait would have measured.
    await page.clock.install();
    await page.clock.fastForward("26:00");

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

    // -- THE POST-SAVE OFFER (PR B's loop, finally fed by a door): the
    //    measured 6k split, offered — recompute by eye: 26:00 over 6000m
    //    is 26*60/12 = 130 s/500m = 2:10.0. Accept writes `tested`; the
    //    counterpart offer then derives the 2k at 130-7 = 123 = 2:03.0
    //    (`derived`) — accepting BOTH is what completes the pair. This
    //    replaces the old arc's raw setBaselines() API seeding: the pair
    //    now completes through the app's own front door.
    await expect(page.getByText("SESSION SAVED")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Set your 6k baseline?" }),
    ).toBeVisible();
    await expect(page.locator(".posttest-value")).toHaveText("2:10.0");
    await page.getByRole("button", { name: "Set 6k baseline" }).click();
    await expect(
      page.getByRole("heading", { name: "Also set your 2k?" }),
    ).toBeVisible();
    await expect(page.locator(".posttest-value")).toHaveText("2:03.0");
    await page.getByRole("button", { name: "Set 2k estimate" }).click();
    await expect(page).toHaveURL(/\/today$/);

    // -- both set -> the doors are gone; real suggestions and the whole
    //    plan/suggestion apparatus return.
    await expect(page.locator(".doorscard")).toHaveCount(0);
    await expect(page.locator(".today-plan-line")).toContainText(
      /SESSION \d+ OF 84/,
    );
    await expect(page.getByRole("button", { name: "FILTER ⌄" })).toBeVisible();
    await expect(page.getByRole("button", { name: "SHUFFLE ↻" })).toBeVisible();
    // The outside-plan log didn't advance doneN — still session 1.
    await expect(page.locator(".today-plan-line")).toContainText(
      "SESSION 1 OF 84",
    );
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
  test("touching only the 6k field and applying sends ONLY k6Seconds — 2k stays null, and the offer plus Today's own doors card both still show it", async ({
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
    await page.locator(".baseline-input").first().waitFor();
    // Option T: touch the 6k side by TYPING into its field — digits fill
    // right to left, "230" -> 2:30 = 150s.
    const k6Field = page.getByRole("textbox", { name: "6k split" });
    await k6Field.click();
    await k6Field.pressSequentially("230");
    await page.getByRole("button", { name: "Apply baselines" }).click();

    // The wire body itself — the exact assertion Finding 1 names — carries
    // ONLY the touched field. A fabricated k2Seconds here would mean the
    // fix didn't actually reach the network layer. Since Phase BL PR A the
    // touched field also carries its truthful provenance: a typed entry
    // is a manual one.
    await expect.poll(() => putBody).not.toBeNull();
    expect(putBody).toStrictEqual({ k6Seconds: 150, k6Source: "manual" });

    // The offer becomes visible for 2k — reachable, at last, through the
    // real editor flow rather than a raw API seed.
    await expect(
      page.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }),
    ).toBeVisible();

    // And the SAME fact holds system-wide: Today's own doors card (a
    // completely separate screen/component reading the identical baselines
    // row) still renders for the incomplete pair — the doors are the
    // superset re-entry since PR C, so a partial pair shows all three.
    await page.goto("/today");
    await expect(page.locator(".doorscard")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Row to find my baseline/ }),
    ).toBeVisible();

    // PR A's PM gate (C3): the one case the provenance ruling exists for,
    // proven END TO END — the client PRODUCES `derived` and the server
    // stores it. Client tests pin the component (mocked save) and the
    // integration tests pin the route (hand-sent source); this is the only
    // run where the two sides must agree on the value's NAME — the client
    // re-declares the enum as string literals (`src/api/useBaselines.ts`,
    // no compile-time link to the pgEnum), so a rename on either side is
    // caught HERE, not by a type. Runs LAST in this test because accepting
    // the offer sets BOTH baselines, which removes the doors card the
    // assertions above depend on.
    await page.goto("/you");
    await page.locator(".baseline-input").first().waitFor();
    putBody = null;
    await page.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }).click();
    await page.getByRole("button", { name: "Apply baselines" }).click();
    await expect.poll(() => putBody).not.toBeNull();
    // deriveK2FromK6(150) = 143.
    expect(putBody).toStrictEqual({ k2Seconds: 143, k2Source: "derived" });
  });
});

// ---------------------------------------------------------------------------
// Phase BL PR C: doors 1 and 2, and Reset baseline setup — each against the
// real stack. Door 1's test captures the wire (the minimal-PII ruling's
// falsifiable half: the ONLY write the questionnaire makes is the baseline
// PUT — the answers themselves never leave the page). Reset's test drives
// a SET pair back to the doors end to end, the spec's own exit criterion.
// ---------------------------------------------------------------------------
test.describe("Phase BL PR C: door 1 (recommend), door 2 (know), and Reset", () => {
  test("door 1: two answers -> the table's cell -> Use this baseline writes both as `estimated` and nothing else rides the wire", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `door1-recommend-${RUN_ID}@e2e.test`,
      name: "Door One Rower",
    });

    const apiWrites: { method: string; url: string; body: unknown }[] = [];
    await page.route("**/api/**", async (route) => {
      const req = route.request();
      if (req.method() !== "GET") {
        apiWrites.push({
          method: req.method(),
          url: req.url(),
          body: req.postDataJSON() as unknown,
        });
      }
      await route.continue();
    });

    await page.goto("/today");
    await page.getByRole("link", { name: /Recommend my baseline/ }).click();
    await expect(page).toHaveURL(/\/onboarding\/recommend$/);

    // Q1 (canvas Question1): Next is disabled until an answer exists,
    // and tapping an answer auto-advances by itself (James's 2026-08-23
    // feedback) — no Next tap.
    await expect(
      page.getByRole("heading", { name: "How much have you rowed?" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
    await page
      .getByRole("radio", { name: "A little. I know the stroke" })
      .click();

    // Q2 (canvas Question2) — reached without touching Next. Go BACK
    // once: the answer survives (transient state), and Next — which
    // stays for the keyboard path and exactly this re-entry case — is
    // enabled and advances the already-selected answer. This is the
    // flow's one explicit Next exercise, kept so the button stays
    // covered end to end.
    await expect(
      page.getByRole("heading", { name: "How is your cardio right now?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "← BACK" }).click();
    await expect(
      page.getByRole("radio", { name: "A little. I know the stroke" }),
    ).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByRole("heading", { name: "How is your cardio right now?" }),
    ).toBeVisible();
    // Q2's answer tap auto-advances to the recommendation.
    await page
      .getByRole("radio", { name: "Active once or twice a week" })
      .click();

    // The recommendation (canvas Recommendation): a-little x 1-2-week is
    // the table's modal cell, 145/152 -> 2:25.0 and 2:32.0 — recompute by
    // eye against domain/estimateBaseline.ts, gap exactly the derive
    // offer's 7s.
    await expect(
      page.getByRole("heading", { name: "Your starting baseline" }),
    ).toBeVisible();
    await expect(page.getByText("2:25.0")).toBeVisible();
    await expect(page.getByText("2:32.0")).toBeVisible();
    await expect(page.getByText(/A COMFORTABLE STARTING POINT/)).toBeVisible();

    await page.getByRole("button", { name: "Use this baseline" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.locator(".doorscard")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "FILTER ⌄" })).toBeVisible();

    // The wire, whole: exactly ONE non-GET call left this flow — the
    // baseline PUT, both sides stamped `estimated`. No questionnaire
    // answer, in any shape, was ever sent (the transient-answers ruling,
    // asserted as an exhaustive write list rather than a spot check).
    expect(apiWrites).toHaveLength(1);
    expect(apiWrites[0]!.method).toBe("PUT");
    expect(apiWrites[0]!.url).toMatch(/\/api\/baselines$/);
    expect(apiWrites[0]!.body).toStrictEqual({
      k2Seconds: 145,
      k2Source: "estimated",
      k6Seconds: 152,
      k6Source: "estimated",
    });
  });

  test("door 2: enter one split -> Save writes ONLY it as `manual`, and the doors (superset) still stand for the partial pair", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `door2-know-${RUN_ID}@e2e.test`,
      name: "Door Two Rower",
    });

    let putBody: unknown = null;
    await page.route("**/api/baselines", async (route) => {
      if (route.request().method() === "PUT") {
        putBody = route.request().postDataJSON();
      }
      await route.continue();
    });

    await page.goto("/today");
    await page.getByRole("link", { name: /I know my baseline/ }).click();
    await expect(page).toHaveURL(/\/onboarding\/know$/);
    await expect(
      page.getByRole("heading", { name: "Enter your splits" }),
    ).toBeVisible();

    // Save is disabled until something is typed — the untouched seed
    // pair must never be writable by a bare Save.
    await expect(
      page.getByRole("button", { name: "Save baseline" }),
    ).toBeDisabled();

    // Option T: tap the field, type the digits — "158" -> 1:58 = 118s
    // (the exact entry whose 27-tap stepper cost prompted the change).
    const know2k = page.getByRole("textbox", { name: "2k split" });
    await know2k.click();
    await know2k.pressSequentially("158");
    await page.getByRole("button", { name: "Save baseline" }).click();
    await expect(page).toHaveURL(/\/today$/);

    // The typed 1:58, manual — and only that side.
    await expect.poll(() => putBody).not.toBeNull();
    expect(putBody).toStrictEqual({ k2Seconds: 118, k2Source: "manual" });

    // A partial pair is still an incomplete pair: the doors render again
    // (the superset ruling), all three of them.
    await expect(page.locator(".doorscard")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Recommend my baseline/ }),
    ).toBeVisible();
  });

  test("Reset baseline setup: a set pair, staged confirm on You, and the doors render again — with the server pair truly gone", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `reset-doors-${RUN_ID}@e2e.test`,
      name: "Reset Rower",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    await page.goto("/today");
    await expect(page.locator(".doorscard")).toHaveCount(0);

    await page.goto("/you");
    await page.getByRole("button", { name: "Reset baseline setup" }).click();
    // Staged: the destructive copy renders, nothing has fired yet.
    await expect(
      page.getByText(/This clears both baseline splits/),
    ).toBeVisible();
    // Cancel backs out whole.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByText(/This clears both baseline splits/),
    ).toHaveCount(0);
    const stillSet = await page.evaluate(async () => {
      const res = await fetch("/api/baselines");
      return (await res.json()) as { k2Seconds: number | null };
    });
    expect(stillSet.k2Seconds).toBe(100);

    // Arm again and confirm — the armed panel's own lead button.
    await page.getByRole("button", { name: "Reset baseline setup" }).click();
    await page
      .getByRole("button", { name: "Reset baseline setup" })
      .last()
      .click();
    await expect(
      page.getByText(/This clears both baseline splits/),
    ).toHaveCount(0);

    // The editor re-seeds from the now-empty server state (the modal-cell
    // seeds, not the cleared 100/120).
    await expect(page.getByRole("textbox", { name: "2k split" })).toHaveValue(
      "2:25.0",
    );

    // The server pair is truly the no-row shape...
    const cleared = await page.evaluate(async () => {
      const res = await fetch("/api/baselines");
      return (await res.json()) as {
        k2Seconds: number | null;
        k6Seconds: number | null;
      };
    });
    expect(cleared).toEqual({ k2Seconds: null, k6Seconds: null });

    // ...and Today offers the doors again — the whole point of Reset.
    await page.goto("/today");
    await expect(page.locator(".doorscard")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Row to find my baseline/ }),
    ).toBeVisible();
  });
});
