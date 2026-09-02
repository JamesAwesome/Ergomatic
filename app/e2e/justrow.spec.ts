import { test, expect, type Page } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

// PHASE JR PR 2 — the free row's own e2e walk, fake-driven, in a real
// browser: Today → JUST ROW → Connect → the ready frame → the standard
// connected surface wearing the free-row treatment → a Menu end on the
// erg → the ended hand-off → the workout-less log door → Save without
// logging (no plan on a fresh user) → the row in history. The one flow a rower actually walks, entered at the
// top, so nothing here seeds a record past any producer (recurring
// failure 24's rule at this layer too).
//
// The fake's `program` field is REQUIRED by its script shape and never
// consulted here: a free row programs nothing, and the fake's
// byte-for-byte programming assertion has nothing to check when no
// programming bytes ever arrive.

const WORKOUTSTATE_INTERVALWORKTIME = 4; // parse.ts's own ordinal

const FIXTURE_PROGRAM = {
  intervals: [
    {
      type: "work" as const,
      kind: "distance" as const,
      value: 100,
      targetSplit: null,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

/** The story's own start, in virtual milliseconds — connected.spec.ts's
 *  STORY_START_MS rationale: frames that begin right after connect() race
 *  the arm (the free-row effect fires on the render after the link comes
 *  up, and frames delivered before `ready` are ignored by the record-open
 *  branch). This spec WAS flaky at 1000 ms — one run passed, the next
 *  stuck at "Ready when you pull" with the timeline already spent. */
const STORY_START_MS = 8000;

/** A LONG free row at 1 Hz — sixty frames, no scripted ending. The flow
 *  below ends by the ROWER's own END control, deliberately: a scripted
 *  terminate races the assertions against the fake's real-speed virtual
 *  clock (measured: three shapes of the same flake), while the Menu-end
 *  path is already proven on the walk's real bytes by
 *  `justRowReplay.test.ts`. What this spec buys is the flow a rower
 *  walks, not a second wire-ending oracle. Frame values are
 *  row-cumulative, as the capture walk proved 0x0031 behaves (CLOSED 1). */
function freeRowEvents() {
  return Array.from({ length: 60 }, (_, i) => ({
    atMs: STORY_START_MS + 1000 + i * 1000,
    kind: "status" as const,
    workoutState: WORKOUTSTATE_INTERVALWORKTIME,
    elapsedSeconds: i + 1,
    distanceMeters: (i + 1) * 4,
    spm: 22,
    currentSplit: 140,
    heartRateBpm: null,
    programIntervalIndex: 0,
  }));
}

async function injectFakeMonitor(page: Page): Promise<void> {
  await page.addInitScript(
    ({ program, events }) => {
      window.__pm5FakeScript__ = {
        program,
        events,
        deviceName: "PM5 e2e-justrow",
      };
    },
    { program: FIXTURE_PROGRAM, events: freeRowEvents() },
  );
}

test.describe("Just Row: the whole flow", () => {
  test("Today → Connect → live free row → Menu end → log door → history", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `justrow-flow-${RUN_ID}@e2e.test`,
      name: "Just Row Walker",
    });
    await injectFakeMonitor(page);

    await page.goto("/today");
    await page.getByRole("link", { name: "JUST ROW" }).click();
    await expect(page).toHaveURL(/\/justrow$/);

    await page.getByRole("button", { name: "Connect" }).click();

    // The ready frame: the interstitial's own copy with the one changed
    // word — CONNECTED, not PROGRAMMED — because nothing was sent.
    await expect(
      page.getByRole("heading", { name: "Ready when you pull" }),
    ).toBeVisible();
    await expect(page.getByText(/CONNECTED/)).toBeVisible();

    // "Show me the numbers" hands over to the surface BEFORE the first
    // pull — the ready screen's own lead action, and the one branch only
    // this layer can reach (jsdom cannot take the bare hook live). The
    // frames have not started yet (STORY_START_MS), so this also pins that
    // the pre-motion surface renders rather than waiting for motion.
    await page.getByRole("button", { name: "Show me the numbers" }).click();

    // First motion then fills the standard surface in its free-row
    // treatment: the identity where a count would be, Free in both target
    // slots, ELAPSED as the band's one cell, no GRID control anywhere.
    // The 15 s allowance is the story's own arithmetic, not slack: the
    // first frame lands at STORY_START_MS + 1000 ≈ 9 s of virtual time, and
    // the fake's auto-tick runs virtual at real speed.
    await expect(page.getByText("JUST ROW", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Free")).toHaveCount(2);
    await expect(page.getByText("ELAPSED")).toBeVisible();
    await expect(page.locator(".connected-control")).toHaveCount(0);
    await expect(page.getByText("UP NEXT")).toHaveCount(0);

    // MOTION BEFORE THE END, pinned on a real number — the structural
    // assertions above all pass on the PRE-motion surface too (the armed
    // mirror renders the same treatment), and a first cut of this spec
    // ended a row that never started: END at ready closes no record, the
    // door finds nothing, and the flow lands on Today. 64m is frame 16's
    // own meters.
    await expect(page.getByText("64m")).toBeVisible({ timeout: 30_000 });

    // The rower ends the row from the app: the header END control, staged
    // (first tap arms TAP AGAIN). The ended frame is deliberately not
    // asserted — `onEnded` navigates the moment the hand-off hold
    // releases, so its copy is a client-test assertion
    // (ConnectedSurface.test.tsx's free-row ended block); what this flow
    // owns is the destination.
    await page.getByRole("button", { name: "End session" }).click();
    await expect(
      page.getByRole("button", { name: "Tap again to end" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Tap again to end" }).click();
    await expect(page).toHaveURL(/\/justrow\/log$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Just Row" })).toBeVisible();
    await expect(page.getByText("PAIN", { exact: true })).toBeVisible();
    await expect(page.getByText(/DID YOU HOLD THE TARGETS/)).toHaveCount(0);

    // A fresh backdoor user has no plan, so the door's save stack is the
    // no-plan rule's one button — `Save` leading alone (timer-mode spec 2026-09-02, ruling 5)
    // (substitution spec 2026-09-02 §Mechanism 2; the plan-active pair is
    // its own flow below). Asserted as the ONLY save control so a pair
    // rendered against a plan the user never chose would be caught here.
    await expect(
      page.getByRole("button", { name: /Log against plan/ }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Save" }).click();

    // History, with the free row named and wearing the JR chip in the
    // badge slot — and NO type badge. The `.type-badge` absence is exit
    // criterion 2's LITERAL subject — a history list holding the null-type
    // row renders no `.type-badge` at all — and this is the one place a
    // null-type row from the supported producer reaches a list. A fresh
    // backdoor user's history holds only this row, so a badge on it is the
    // only badge there could be: the probe bites. The chip is the
    // unconnected spec's criterion 4, derived from the PAIR
    // (`FreeRowChip.tsx`), on its OWN class — never `type-badge`.
    await expect(page).toHaveURL(/\/today\/log$/);
    await expect(page.getByText("Just Row").first()).toBeVisible();
    await expect(page.locator(".type-badge")).toHaveCount(0);
    await expect(page.locator(".free-row-chip")).toHaveText("JR");
  });
});

// Just Row WITHOUT the monitor (spec 2026-09-02, exit criteria 1, 3, 4,
// 8): the phone's own clock times the row, the row saves with TIME ONLY,
// and the record reads `TIMER` everywhere it names its door. Entered at
// the door and walked to the detail through the real POST validator and a
// real GET (RF24: the one test that STARTS upstream of every producer —
// the SessionRun the door mints, the actual ▶ freezes, the body Save
// posts — and asserts downstream of every reader).
//
// The wait after Start Timer is REAL time, not a fake clock: the Timer's
// count-up is wall-clock based (criterion 5's invariant), so the recorded
// TIME must be at least the seconds this test genuinely stood on the
// screen — `0:00` there would mean ▶ recorded nothing.
test.describe("Just Row: without the monitor", () => {
  test("Today → Start Timer → count-up → ▶ → Finish session → time-only log door → history chip → TIMER detail", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `justrow-timer-${RUN_ID}@e2e.test`,
      name: "Just Row Timer Walker",
    });

    await page.goto("/today");
    await page.getByRole("link", { name: "JUST ROW" }).click();
    await expect(page).toHaveURL(/\/justrow$/);

    // The door's second action, under Connect (handoff `Main.dc.html`).
    await page.getByRole("button", { name: "Start Timer" }).click();
    await expect(page).toHaveURL(/\/session\/run$/);

    // The shipped Timer wearing the free-row words (handoff
    // `Clock.dc.html`): the STEP slot reads `JUST ROW`, both target slots
    // read `Free`, and UP NEXT reads FINISH — nothing follows a free row.
    await expect(page.getByText("JUST ROW", { exact: true })).toBeVisible();
    await expect(page.getByText("Free", { exact: true })).toHaveCount(2);
    await expect(page.getByText("FINISH", { exact: true })).toBeVisible();

    // Stand on the screen for real seconds, then pin that the clock moved:
    // `0:03` is the count-up's own rendering three seconds in (the big
    // number and the ELAPSED cell both carry it, hence `.first()`).
    await expect(page.getByText("0:03").first()).toBeVisible({
      timeout: 10_000,
    });

    // ▶ stages the finish (handoff `ClockFinish.dc.html`, verbatim from the
    // shipped Timer) rather than advancing: a free row has no next phase.
    await page.getByRole("button", { name: "Next phase" }).click();
    await expect(page.getByText("Finish this session?")).toBeVisible();
    await page.getByRole("button", { name: "Finish session" }).click();

    // The time-only log door (handoff `LogDoor.dc.html`): `Just Row`, a
    // meta line naming the TIMER door, TIME alone — no DISTANCE cell, no
    // AVG SPLIT cell, no dash standing in for either. The TIME figure is at
    // least the three seconds stood on the clock above: `0:00` here would
    // mean ▶ froze nothing (criterion 1's shape at this layer).
    await expect(page).toHaveURL(/\/justrow\/log$/);
    await expect(page.getByRole("heading", { name: "Just Row" })).toBeVisible();
    await expect(page.locator(".justrow-meta")).toContainText("TIMER");
    await expect(page.getByText("TIME", { exact: true })).toBeVisible();
    await expect(page.locator(".justrow-log-numvalue")).toHaveText(
      /^0:(0[3-9]|[1-5]\d)$/,
    );
    await expect(page.getByText("DISTANCE")).toHaveCount(0);
    await expect(page.getByText("AVG SPLIT")).toHaveCount(0);
    await expect(page.getByText("—")).toHaveCount(0);

    // A fresh backdoor user has no plan, so the door's save stack is the
    // no-plan rule's one button — `Save` leading alone (timer-mode spec 2026-09-02, ruling 5)
    // (substitution spec 2026-09-02 §Mechanism 2; the plan-active pair is
    // its own flow below). Asserted as the ONLY save control so a pair
    // rendered against a plan the user never chose would be caught here.
    await expect(
      page.getByRole("button", { name: /Log against plan/ }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Save" }).click();

    // History (handoff `History.dc.html`, criterion 4): the row wears the
    // JR chip on its own class, no `.type-badge`, and NO second line — a
    // row with no avg split and no distance gets no hero snippet
    // (`LogRow.heroSnippet` returns ""). A fresh backdoor user's history
    // holds only this row, so every count below is about it.
    await expect(page).toHaveURL(/\/today\/log$/);
    const row = page.locator(".today-log-row", { hasText: "Just Row" });
    await expect(row).toHaveCount(1);
    await expect(row.locator(".free-row-chip")).toHaveText("JR");
    await expect(row.locator(".type-badge")).toHaveCount(0);
    await expect(row.locator(".today-log-hero")).toHaveCount(0);

    // The detail (handoff `Detail.dc.html`, criterion 3): the meta line
    // reads `SEP 2 · hh:mm · TIMER` from the stored `source` column (never
    // inferred from steps — criterion 3d), and the heroes are TIME alone:
    // no AVG SPLIT, no DISTANCE, and no INTERVALS because `steps` is `[]`.
    await row.click();
    await expect(page).toHaveURL(/\/today\/log\/[^/]+$/);
    await expect(page.locator(".summary-meta")).toContainText("· TIMER");
    await expect(page.locator(".summary-hero-label")).toHaveText(["TIME"]);
    await expect(page.getByText("AVG SPLIT")).toHaveCount(0);
    await expect(page.getByText("DISTANCE")).toHaveCount(0);
    await expect(page.getByText("INTERVALS")).toHaveCount(0);
  });
});

/** Sets baselines so Today renders its plan line rather than the
 *  onboarding doors (`Today.tsx`'s `needsDoors = baselines === null` hides
 *  the whole plan apparatus) — duplicated from `today.spec.ts`'s own helper,
 *  this repo's precedent for small per-file e2e helpers. */
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

/** Activates a preset plan via the real `PUT /api/plan` route — copied
 *  from `log.spec.ts`'s own `choosePlan`. */
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

/** Zeroes `doneN` via `PUT /api/plan {reset:true}` — copied from
 *  `log.spec.ts`'s own `resetPlanProgress`. A fresh backdoor user starts at
 *  zero anyway; the reset makes the starting position an assertion of this
 *  test rather than an accident of the user being new. */
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

// A Just Row STANDS IN for a plan session (substitution spec 2026-09-02,
// exit criterion 4 — the RF24 seam test): the one e2e that starts at the
// Just Row door with a plan active and walks the whole producer → reader
// chain for real. The door posts `advancesPlan: true` (the free row's
// explicit opt-in — the store's default for a free row is "does not
// count"), the store bumps `done_n` AND writes the link in the same
// transaction, Today's plan line re-reads `SESSION n OF N` from
// `GET /api/plan`, and the Plan tab reads the link back through
// `GET /api/logs?plan=sprint` and prints the stand-in: the JR chip in the
// badge slot (the pair `workoutId` null + `workoutType` null — never the
// unknown-type box, which the same null type would otherwise claim), the
// name `Just Row`, and the shipped swap mark naming what the day asked
// for. Sprint index 0 is an O2 day (`domain/plans.ts` `SPRINT_WEEKS[0][0]`),
// so the mark reads `INSTEAD OF O2`.
//
// Every number here is READ, not seeded: `resetPlanProgress` puts the
// plan at zero, and the only thing that moves it is the button under
// test. Red-proof (RF21): asserting `SESSION 1 OF 84` on Today after the
// save fails with the line reading `SESSION 2 OF 84` — the count moved
// because the door's lead moved it.
test.describe("Just Row: standing in for a plan session", () => {
  test("plan at SESSION 1 → Start Timer → Finish → Log against plan · SESSION 1 OF 84 → Today reads SESSION 2 OF 84 → Plan row 1 is the JR stand-in INSTEAD OF O2", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `justrow-standin-${RUN_ID}@e2e.test`,
      name: "Just Row Stand-in Walker",
    });
    await setBaselines(page, { k2Seconds: 100, k6Seconds: 120 });
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);

    // The starting position, read off Today's own plan line — the number
    // whose meaning this feature changes (TRIAD).
    await page.goto("/today");
    await expect(page.locator(".today-plan-line")).toContainText(
      "SESSION 1 OF 84",
    );

    // The phone-timed door, three real seconds on the clock, then ▶ →
    // Finish — the same walk `Just Row: without the monitor` takes.
    await page.getByRole("link", { name: "JUST ROW" }).click();
    await page.getByRole("button", { name: "Start Timer" }).click();
    await expect(page).toHaveURL(/\/session\/run$/);
    await expect(page.getByText("0:03").first()).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Next phase" }).click();
    await page.getByRole("button", { name: "Finish session" }).click();
    await expect(page).toHaveURL(/\/justrow\/log$/);

    // The door wears the shipped pair (handoff `Main.dc.html`): the lead
    // carries the plan position it will consume, and `Save without
    // logging` sits under it. Both asserted so a door showing only one
    // cannot pass.
    const lead = page.getByRole("button", {
      name: "Log against plan · SESSION 1 OF 84",
    });
    await expect(lead).toBeVisible();
    await expect(lead).toHaveClass(/summary-save-lead/);
    const secondary = page.getByRole("button", {
      name: "Save without logging",
    });
    await expect(secondary).toBeVisible();
    await expect(secondary).toHaveClass(/summary-save-secondary/);
    await lead.click();
    await expect(page).toHaveURL(/\/today\/log$/);

    // Today: the plan moved by exactly one, because a free row that opted
    // in counts (unconnected criterion 2, amended by the substitution
    // spec: "unless the body opted in").
    await page.goto("/today");
    await expect(page.locator(".today-plan-line")).toContainText(
      "SESSION 2 OF 84",
    );

    // Plan tab (handoff `PlanRow.dc.html`, row 5's treatment on row 1):
    // the done row is a LINK to the stored log, wears the JR chip on its
    // own class in the badge slot — no `.type-badge`, no unknown box — is
    // named `Just Row`, and carries the mark naming the O2 day it stood
    // in for.
    await page.goto("/plan");
    await page.locator(".plan-sequence").waitFor();
    await expect(page.locator(".plan-row")).toHaveCount(84);
    const row = page.locator(".plan-row").nth(0);
    await expect(row).toHaveClass(/plan-row-done/);
    await expect(row).toHaveClass(/plan-row-swapped/);
    await expect(row).toHaveAttribute("href", /\/today\/log\/.+/);
    await expect(row.locator(".free-row-chip")).toHaveText("JR");
    await expect(row.locator(".type-badge")).toHaveCount(0);
    await expect(row.locator(".plan-row-badge-unknown")).toHaveCount(0);
    await expect(row.locator(".plan-row-name")).toHaveText("Just Row");
    await expect(row.locator(".plan-row-swap")).toHaveText("INSTEAD OF O2");
    // Exactly one done row: the stand-in is the ONLY thing that advanced.
    await expect(page.locator("a.plan-row-done")).toHaveCount(1);
  });
});
