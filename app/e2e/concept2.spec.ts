import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

/**
 * Wave E PR2, Task 11 — the two Concept2 surfaces driven in a real browser
 * for the first time.
 *
 * WHAT THESE PROVE, AND WHAT THEY DO NOT (RF26, and it is the whole reason
 * this header exists). The compose stack this suite runs against is
 * Concept2-DARK by construction: `compose.yml` passes the flag through as
 * `C2_LINK_ENABLED: ${C2_LINK_ENABLED:-}` and neither `scripts/e2e.sh` nor
 * `scripts/screenshots.sh` exports it, so `GET /api/concept2/link` answers
 * `{available:false}` and both surfaces render nothing. A committed CI test
 * enforces that darkness rather than merely observing it
 * (`scripts/compose-env.test.sh`, the "e2e stack stays dark" check, run by
 * CI's `scripts` job), so lighting the flag here is not an option and would
 * not be one even if it were convenient.
 *
 * So every case below fakes the SERVER'S ANSWERS at the client boundary with
 * `page.route` — the precedent is `e2e/onboarding.spec.ts`'s PUT-body
 * interception and `e2e/log.spec.ts`'s PATCH delay. That makes these tests
 * evidence about **the client**: its states, its wiring, its copy, its
 * navigation, and the order in which it reads and re-reads. They are NOT
 * evidence about the server, the OAuth hop, or the upload seam. The seam is
 * proved one layer down, by
 * `server/routes/concept2Send.integration.test.ts` (Task 10), which starts
 * before the write and reads after it against a real database.
 *
 * A real fake-Concept2 SERVICE — a stack that could light the flag and
 * answer as Concept2 — is a follow-on, not something smuggled in here. It
 * is OWED a ROADMAP row rather than already carrying one: `grep -in
 * "fake.*concept2" ROADMAP.md` returns nothing on this branch as of this
 * commit, and Task 13 is what writes it.
 *
 * THE ROWS ARE REAL. Every log this file sends is posted through the real
 * `POST /api/logs` route with the shape a finished monitor session actually
 * stores (`source: "pm5"` + a `deviceName`, which the route's own
 * `logSourceContradiction` requires of that member; `endedBy: "finished"`;
 * both work columns), so `isSendable`'s four clauses are decided by a
 * genuine stored row rather than a hand-built minimum (RF3).
 */

/** The link body the fake answers `GET /api/concept2/link` with. Deliberately
 *  written as the ROUTE's own JSON rather than the client's `Concept2Link`,
 *  since the thing under test includes `normalizeLink`. */
interface LinkBody {
  available: boolean;
  linked?: boolean;
  c2UserId?: number | null;
  c2Username?: string | null;
  needsReauth?: boolean;
  logbookBaseUrl?: string | null;
}

interface Answer {
  status: number;
  body?: unknown;
  /** Serve this as an HTML document instead of JSON — the stubbed OAuth
   *  landing page the web arm's full-page navigation lands on. */
  html?: string;
}

/** The Concept2 origin every fake link body echoes, and the one the
 *  link-outs are therefore built from. The SANDBOX host on purpose: it is
 *  what `server/index.ts`'s `C2_BASE_URL` defaults to and what
 *  `compose.yml` passes through today, so the URLs asserted below are the
 *  ones this deployment would really open. */
const C2_ORIGIN = "https://log-dev.concept2.com";

/**
 * One route over every `/api/concept2/*` call, plus a recorder.
 *
 * MUTABLE ON PURPOSE. Three cases here need the server's answer to CHANGE
 * mid-test without re-registering a route — a Retry that succeeds, an
 * unlink that lands on the second tap, and the Back case that has to see a
 * DIFFERENT link than the one it left. Playwright resolves handlers in
 * reverse registration order, so stacking a second `page.route` over the
 * same pattern would leave the first one live underneath and make "which
 * answer did that read get" a question about registration order. One
 * handler reading one mutable record has no such question.
 */
class C2Fake {
  link: Answer = { status: 200, body: { available: false } };
  connect: Answer = { status: 200, body: {} };
  unlink: Answer = { status: 204 };
  send: Answer = { status: 200, body: {} };

  /** Reads of `GET /api/concept2/link`. The POSITIVE readiness signal every
   *  negative assertion in this file waits on: "the card is absent" is only
   *  meaningful once the read it would have rendered from has happened. */
  linkReads = 0;
  /** Every `POST /api/concept2/connect` body, verbatim off the wire — the
   *  mint carries nothing of the rower's (ruling i) and this is what says
   *  so. */
  connectBodies: unknown[] = [];
  deletes = 0;
  sends = 0;

  async install(page: Page): Promise<void> {
    await page.route(/\/api\/concept2\//, async (route: Route) => {
      const req = route.request();
      const url = new URL(req.url());
      const method = req.method();
      let answer: Answer;
      if (url.pathname.endsWith("/api/concept2/link")) {
        if (method === "DELETE") {
          this.deletes += 1;
          answer = this.unlink;
        } else {
          this.linkReads += 1;
          answer = this.link;
        }
      } else if (url.pathname.endsWith("/api/concept2/connect")) {
        this.connectBodies.push(req.postDataJSON());
        answer = this.connect;
      } else if (url.pathname.includes("/api/concept2/results/")) {
        this.sends += 1;
        answer = this.send;
      } else {
        // The stubbed consent landing page: a document inside the app's own
        // origin, so the web arm's `window.location.assign` really unloads
        // the SPA and the Back that follows is a real one. Nothing about
        // the OAuth hop itself is under test.
        answer = {
          status: 200,
          html: "<!doctype html><title>C2 stub</title><p>consent stub</p>",
        };
      }
      if (answer.html !== undefined) {
        await route.fulfill({
          status: answer.status,
          contentType: "text/html",
          body: answer.html,
        });
        return;
      }
      await route.fulfill({
        status: answer.status,
        contentType: "application/json",
        body: JSON.stringify(answer.body ?? {}),
      });
    });
  }

  linked(extra: Partial<LinkBody> = {}): void {
    this.link = {
      status: 200,
      body: {
        available: true,
        linked: true,
        c2UserId: 2211,
        c2Username: "jamesawesome",
        needsReauth: false,
        logbookBaseUrl: C2_ORIGIN,
        ...extra,
      } satisfies LinkBody,
    };
  }

  unlinked(): void {
    this.link = {
      status: 200,
      body: {
        available: true,
        linked: false,
        c2UserId: null,
        c2Username: null,
        needsReauth: false,
        logbookBaseUrl: C2_ORIGIN,
      } satisfies LinkBody,
    };
  }

  unavailable(): void {
    this.link = { status: 200, body: { available: false } satisfies LinkBody };
  }
}

/** A finished monitor row: the ONE shape `isSendable` accepts, posted for
 *  real. `deviceName` is not decoration — `logSourceContradiction` 400s a
 *  `source: "pm5"` body without one. */
async function postMonitorLog(
  page: Page,
  title: string,
): Promise<{ id: string }> {
  return postLog(page, {
    workoutTitle: title,
    workoutType: "O2",
    source: "pm5",
    endedBy: "finished",
    deviceName: "PM5 432331249",
    // The walk-2026-08-24 exit-7 pair, the same real numbers
    // `screenshots.spec.ts`'s `log-detail` capture seeds: 250+250 m over
    // 67.9+56.1 s.
    workSeconds: 124,
    workMeters: 500,
    avgSplitSeconds: 124,
    timeSeconds: 124,
    distanceMeters: 500,
    steps: [
      {
        label: "250m @ 2:07.0",
        targetSplit: 127,
        actualSplit: 135.8,
        actualSeconds: 67.9,
        actualSource: "pm5",
      },
      {
        label: "250m @ 2:07.0",
        targetSplit: 127,
        actualSplit: 112.2,
        actualSeconds: 56.1,
        actualSource: "pm5",
      },
    ],
  });
}

/** A phone-timer row: same screen, same door, and NOT sendable — it fails
 *  `isSendable`'s FIRST clause and its third and fourth as well. */
async function postTimerLog(
  page: Page,
  title: string,
): Promise<{ id: string }> {
  return postLog(page, {
    workoutTitle: title,
    workoutType: "AT",
    source: "timer",
    endedBy: "finished",
    steps: [
      {
        label: "Work",
        targetSplit: 120,
        actualSplit: 121,
        actualSource: "stopwatch",
      },
    ],
  });
}

interface LogBody {
  workoutTitle: string;
  workoutType: string;
  source: "pm5" | "timer" | "manual" | "no-reading";
  endedBy?: string | null;
  deviceName?: string | null;
  workSeconds?: number | null;
  workMeters?: number | null;
  avgSplitSeconds?: number | null;
  timeSeconds?: number | null;
  distanceMeters?: number | null;
  steps: {
    label: string;
    targetSplit?: number;
    actualSplit?: number;
    actualSeconds?: number;
    actualSource?: string;
  }[];
}

/** Posts one row through the real route with a real in-page fetch — the same
 *  idiom `log.spec.ts`'s own `postLog` uses, and for the same reason
 *  `screenshots.spec.ts` states: the api container runs with
 *  NODE_ENV=production, so the session cookie is `Secure` and Playwright's
 *  Node-side request context does not send it. */
async function postLog(page: Page, body: LogBody): Promise<{ id: string }> {
  const result = await page.evaluate(async (b) => {
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutId: null,
        held: null,
        pain: null,
        notes: null,
        advancesPlan: false,
        ...b,
      }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, body);
  if (!result.ok) {
    throw new Error(`postLog failed: ${result.status} ${result.body}`);
  }
  return JSON.parse(result.body) as { id: string };
}

/** Enters the detail door the way a rower does — through the history list —
 *  rather than deep-linking, so the row under test is the one the list
 *  actually links to. */
async function openLogDetail(page: Page, title: string): Promise<void> {
  await page.goto("/today/log");
  const row = page.locator(".today-log-row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/today\/log\/[^/]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

/** You is rendered when its LAST child is on screen: the DIAGNOSTICS row is
 *  `You.tsx`'s own final element and its comment requires it stay there. A
 *  negative assertion about the card is worthless until this has passed. */
async function openYou(page: Page): Promise<void> {
  await page.goto("/you");
  await expect(page.locator(".diag-row")).toBeVisible();
}

async function signIn(page: Page, slug: string): Promise<C2Fake> {
  const fake = new C2Fake();
  await fake.install(page);
  await signInViaBackdoor(page, {
    email: `c2-${slug}-${RUN_ID}@e2e.test`,
    name: "Ergo Tester",
  });
  return fake;
}

test.describe("Concept2 link and send, in a real browser", () => {
  test("the surface is invisible while the server says unavailable", async ({
    page,
  }) => {
    // THE STATE EVERY DEPLOYMENT IS IN TODAY, which is why it is first: the
    // flag is unset in production, so this is what a rower sees, and it is
    // the one case that must never regress. `unavailable()` is also the
    // fake's DEFAULT, so this test would still be honest if a future edit
    // forgot the call.
    const fake = await signIn(page, "dark");
    fake.unavailable();
    await postMonitorLog(page, "Dark Row");

    await openYou(page);
    await expect.poll(() => fake.linkReads).toBeGreaterThan(0);
    await expect(page.locator(".c2-card")).toHaveCount(0);
    await expect(page.getByText("CONCEPT2")).toHaveCount(0);

    const readsBefore = fake.linkReads;
    await openLogDetail(page, "Dark Row");
    await expect.poll(() => fake.linkReads).toBeGreaterThan(readsBefore);
    await expect(page.locator(".c2-send")).toHaveCount(0);
    await expect(page.getByText("CONCEPT2")).toHaveCount(0);
    // The rest of the screen is untouched — an invisible surface is not a
    // broken one.
    await expect(
      page.getByRole("button", { name: "Delete session" }),
    ).toBeVisible();
  });

  test("connect asks nothing and hands off", async ({ page }) => {
    const fake = await signIn(page, "connect");
    fake.unlinked();
    fake.connect = {
      status: 200,
      body: { authorizeUrl: "/api/concept2/callback?stub=1", state: "s" },
    };

    await openYou(page);
    const connect = page.getByRole("button", { name: "CONNECT TO CONCEPT2" });
    // LIVE ON FIRST PAINT (ruling i). Not "eventually enabled" — the card's
    // only gate on this button is `busy`, and nothing has been tapped.
    await expect(connect).toBeEnabled();

    // RULING (i), THE VISUAL HALF: the card asks the rower for nothing. The
    // WEIGHT CLASS section and its two-option control that the board's 1a
    // drew are gone, so there is no radiogroup and no text field anywhere
    // inside the card.
    const card = page.locator(".c2-card");
    await expect(card.getByRole("radiogroup")).toHaveCount(0);
    await expect(card.getByRole("radio")).toHaveCount(0);
    await expect(card.getByRole("textbox")).toHaveCount(0);
    await expect(card.locator("input, select, textarea")).toHaveCount(0);
    // AND IT SAYS NOTHING ABOUT THE CLASS EITHER (James, 2026-09-04: "Stop
    // talking about the weight class"). The helper line that replaced the
    // control is gone too, so the whole phrase is absent from the card in
    // its own rendered engine — asserted after `toBeEnabled()` above, so
    // "absent" cannot mean "not painted yet".
    await expect(card.getByText(/weight class/i)).toHaveCount(0);

    await connect.click();
    // The web arm navigates THIS document (`adapters/webNavigate.ts`'s
    // `navigateWeb` -> `window.location.assign`), so the hand-off is
    // observable as a URL change, not as a promise.
    await expect(page).toHaveURL(/\/api\/concept2\/callback\?stub=1$/);
    // THE MINT BODY IS EMPTY. Ruling (i) in one assertion: nothing about
    // the rower travels in it, and on web not even the `linkClient`
    // declaration (which is a claim about a NATIVE build).
    expect(fake.connectBodies).toEqual([{}]);
  });

  test("a linked account names itself and unlinks in two taps", async ({
    page,
  }) => {
    const fake = await signIn(page, "unlink");
    fake.linked();
    await openYou(page);

    const email = `c2-unlink-${RUN_ID}@e2e.test`;
    await expect(page.locator(".c2-card-identity")).toHaveText(
      `Concept2 jamesawesome · Ergomatic ${email}`,
    );
    await expect(page.locator(".c2-card-status")).toHaveText("LINKED ✓");

    const unlink = page.getByRole("button", { name: "Unlink Concept2" });
    await unlink.click();
    // ONE tap arms and fires nothing. The DELETE count is the assertion,
    // not the button's label: a card that changed its words while also
    // sending the request would pass a label-only check.
    await expect(
      page.getByRole("button", { name: "Tap again to unlink" }),
    ).toBeVisible();
    expect(fake.deletes).toBe(0);
    await expect(
      page.getByText("DISARMS ON ITS OWN AFTER 4 SECONDS"),
    ).toBeVisible();

    fake.unlinked();
    await page.getByRole("button", { name: "Tap again to unlink" }).click();
    await expect.poll(() => fake.deletes).toBe(1);
    // Invariant I1: the card does not infer the unlink from its own tap, it
    // re-reads. The unlinked chrome appearing is that re-read landing.
    await expect(
      page.getByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeVisible();
    await expect(page.locator(".c2-card-identity")).toHaveCount(0);
  });

  test("a qualifying row offers Send; a timer row does not", async ({
    page,
  }) => {
    const fake = await signIn(page, "eligible");
    fake.linked();
    await postMonitorLog(page, "Sea Fret");
    await postTimerLog(page, "Hand Timed");

    await openLogDetail(page, "Sea Fret");
    await expect(page.locator(".c2-send")).toBeVisible();
    await expect(page.locator(".c2-send-status")).toHaveText("NOT SENT");
    await expect(
      page.getByRole("button", { name: "Send to Concept2" }),
    ).toBeVisible();

    const readsBefore = fake.linkReads;
    await openLogDetail(page, "Hand Timed");
    // Positive readiness before the negative claim: the block's own link
    // read has happened on THIS screen, so "absent" cannot mean "not yet".
    await expect.poll(() => fake.linkReads).toBeGreaterThan(readsBefore);
    // TOTAL absence, not a disabled control: the board's rule is "the block
    // does not render, ever" for a non-qualifying row.
    await expect(page.locator(".c2-send")).toHaveCount(0);
    await expect(page.getByText("CONCEPT2")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Send to Concept2" }),
    ).toHaveCount(0);
  });

  test("send -> SENT with the result link", async ({ page }) => {
    const fake = await signIn(page, "sent");
    fake.linked();
    fake.send = {
      status: 200,
      body: { resultId: 339, weightClass: "H", weightClassSource: "profile" },
    };
    await postMonitorLog(page, "Sea Fret");
    await openLogDetail(page, "Sea Fret");

    await page.getByRole("button", { name: "Send to Concept2" }).click();
    await expect(page.locator(".c2-send-status")).toHaveText("SENT");
    await expect(page.getByText("Accepted by Concept2.")).toBeVisible();
    await expect(page.getByText("RESULT 339")).toBeVisible();
    // THE 200 STILL CARRIES THE CLASS AND ITS PRODUCER — see `fake.send`
    // above, which is the route's real answer — AND THE SCREEN STILL SHOWS
    // NEITHER (James, 2026-09-04). This is the driven gate on that: the
    // withdrawn sub-line drew here and nowhere else, so a client that
    // started reading those two fields again would light it up in a real
    // browser. Asserted after `RESULT 339` is visible, so the send has
    // demonstrably landed before the absence is claimed.
    await expect(page.locator(".c2-send-foot")).toHaveText(["RESULT 339"]);
    expect(fake.sends).toBe(1);

    // THE LINK-OUT IS DRIVEN, NOT INSPECTED, and the distinction is worth
    // the extra machinery: `openReadOnlyUrl`'s web arm is
    // `window.open(url, "_blank", "noopener,noreferrer")`, so asserting a
    // `data-` attribute or the model's own `c2ResultUrl` would prove the
    // string and not the plumbing. The real `window.open` runs, the real
    // browsing context opens, and its URL is read off the context that
    // actually appeared. `noopener` means the opener gets no handle, which
    // is why this waits on the CONTEXT's `page` event rather than the
    // page's `popup` event.
    //
    // The Concept2 origin is routed to a stub at the CONTEXT level so the
    // new page resolves without leaving the machine — this suite makes no
    // request to a third party.
    await page.context().route(`${C2_ORIGIN}/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>logbook stub</title>",
      });
    });
    const opened = page.context().waitForEvent("page");
    await page.getByRole("button", { name: "View on Concept2 →" }).click();
    const logbook = await opened;
    expect(logbook.url()).toBe(`${C2_ORIGIN}/profile/2211/log/339`);
    await logbook.close();
  });

  test("send -> 409 duplicate -> ALREADY THERE", async ({ page }) => {
    const fake = await signIn(page, "dupe");
    fake.linked();
    fake.send = {
      status: 409,
      body: { error: "duplicate", c2ResultId: 4102 },
    };
    await postMonitorLog(page, "Sea Fret");
    await openLogDetail(page, "Sea Fret");

    await page.getByRole("button", { name: "Send to Concept2" }).click();
    await expect(page.locator(".c2-send-status")).toHaveText("ALREADY THERE");
    await expect(
      page.getByText(
        "Concept2 already has this row: same date, time and distance.",
      ),
    ).toBeVisible();
    // The 409's own id is what makes this state useful: it is a duplicate
    // the rower can go and LOOK at.
    await expect(page.getByText("RESULT 4102")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View on Concept2 →" }),
    ).toBeVisible();
    // NOT the SENT copy — the two states are one status word apart and must
    // not read the same.
    await expect(page.getByText("Accepted by Concept2.")).toHaveCount(0);
  });

  test("send -> 502 -> SEND FAILED with a REASON and a retry", async ({
    page,
  }) => {
    const fake = await signIn(page, "502");
    fake.linked();
    fake.send = { status: 502, body: { error: "upstream" } };
    await postMonitorLog(page, "Sea Fret");
    await openLogDetail(page, "Sea Fret");

    await page.getByRole("button", { name: "Send to Concept2" }).click();
    await expect(page.locator(".c2-send-status")).toHaveText("SEND FAILED");
    await expect(
      page.getByText("The send didn't reach Concept2."),
    ).toBeVisible();
    await expect(page.getByText("REASON: CONCEPT2 ERROR · 502")).toBeVisible();

    // A retry that RETRIES (RF4): the control is invoked and the wire count
    // is the consequence asserted, never the button's existence.
    fake.send = { status: 200, body: { resultId: 512 } };
    await page.getByRole("button", { name: "Retry send" }).click();
    await expect(page.locator(".c2-send-status")).toHaveText("SENT");
    await expect(page.getByText("RESULT 512")).toBeVisible();
    expect(fake.sends).toBe(2);
    // The retry's 200 is the bare `{resultId}` an older server answers, and
    // it renders the same single sub-line as the class-bearing 200 above.
    await expect(page.locator(".c2-send-foot")).toHaveText(["RESULT 512"]);
  });

  test("send -> 422 no_weight_class -> the account link-out", async ({
    page,
  }) => {
    const fake = await signIn(page, "noweight");
    fake.linked();
    fake.send = {
      status: 422,
      body: { error: "no_weight_class", reason: "no_weight" },
    };
    await postMonitorLog(page, "Sea Fret");
    await openLogDetail(page, "Sea Fret");

    await page.getByRole("button", { name: "Send to Concept2" }).click();
    await expect(page.locator(".c2-send-status")).toHaveText("NO WEIGHT CLASS");
    await expect(
      page.getByText(
        "Concept2 needs a weight class. Your Concept2 profile has no weight set.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("REASON: SET YOUR WEIGHT ON CONCEPT2"),
    ).toBeVisible();
    // The state's own sentence tells the rower to fix something on Concept2
    // and come back, so it must offer a way back.
    await expect(
      page.getByRole("button", { name: "Send again" }),
    ).toBeVisible();

    await page.context().route(`${C2_ORIGIN}/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>profile stub</title>",
      });
    });
    const opened = page.context().waitForEvent("page");
    await page.getByRole("button", { name: "OPEN CONCEPT2 PROFILE" }).click();
    const profile = await opened;
    // NO ID IN THE PATH (observation 28). `/profile/2211` renders a PUBLIC
    // read-only card with no weight and no form; `/profile` 302s to login
    // and lands the rower in their own account. The id-bearing URL is the
    // thing this assertion exists to catch.
    expect(profile.url()).toBe(`${C2_ORIGIN}/profile`);
    expect(profile.url()).not.toContain("2211");
    await profile.close();

    // THE SECOND TOKEN, AND THE REASON THIS CASE IS AN e2e AT ALL: four
    // server tokens collapse to THREE renderings, and a collapse to one
    // line would be invisible to a unit test that only ever asserts the
    // string it passed in. `no_gender` is a profile we could not derive a
    // class from — that rower's weight is not the broken thing, and the
    // copy must not send them after it.
    fake.send = {
      status: 422,
      body: { error: "no_weight_class", reason: "no_gender" },
    };
    await page.getByRole("button", { name: "Send again" }).click();
    await expect(
      page.getByText("REASON: COULDN'T GET A CLASS FROM CONCEPT2"),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Concept2 needs a weight class. We couldn't work one out from your Concept2 profile.",
      ),
    ).toBeVisible();
    // The three things this rendering must NOT say.
    await expect(page.getByText(/no weight set/)).toHaveCount(0);
    await expect(page.getByText(/SET YOUR WEIGHT ON CONCEPT2/)).toHaveCount(0);
    await expect(page.getByText(/logbook/i)).toHaveCount(0);
  });

  test("a read that fails says so and retries", async ({ page }) => {
    // Amendment 1i, and the counterpart of the invisibility case: a read
    // that FAILED is a different answer from a deployment that has no
    // Concept2, and drawing them the same way tells a rower whose server
    // does have it that it does not.
    const fake = await signIn(page, "readfail");
    fake.link = { status: 502, body: { error: "upstream" } };
    await openYou(page);

    await expect(page.locator(".c2-card")).toBeVisible();
    await expect(page.locator(".c2-card-status")).toHaveText("COULDN'T READ");
    await expect(
      page.getByText("Couldn't reach Concept2 linking."),
    ).toBeVisible();
    await expect(
      page.getByText("REASON: THE SERVER ANSWERED 502"),
    ).toBeVisible();

    fake.unlinked();
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(
      page.getByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeVisible();
    await expect(
      page.getByText("Couldn't reach Concept2 linking."),
    ).toHaveCount(0);
  });

  test("an unlink the server refuses says the link is unchanged", async ({
    page,
  }) => {
    // Amendment 1j, and RF25's shape at the UI seam: a lower layer reported
    // a failure and the caller must not proceed as if it succeeded. The
    // dangerous reading of a failed destructive action is that it
    // half-worked.
    const fake = await signIn(page, "unlinkfail");
    fake.linked();
    fake.unlink = { status: 500, body: { error: "boom" } };
    await openYou(page);

    await page.getByRole("button", { name: "Unlink Concept2" }).click();
    await page.getByRole("button", { name: "Tap again to unlink" }).click();
    await expect.poll(() => fake.deletes).toBe(1);

    await expect(page.getByText("UNLINK DIDN'T HAPPEN")).toBeVisible();
    await expect(
      page.getByText("Couldn't unlink. Your link is unchanged."),
    ).toBeVisible();
    await expect(
      page.getByText("REASON: THE SERVER ANSWERED 500"),
    ).toBeVisible();
    // The link really is unchanged, and the card says the same thing its
    // panel does.
    await expect(page.locator(".c2-card-status")).toHaveText("LINKED ✓");
    await expect(page.locator(".c2-card-identity")).toContainText(
      "Concept2 jamesawesome",
    );
    // The arm is SPENT on every exit, not only the happy one (invariant
    // I2): a live "Tap again to unlink" sitting under a REASON line is one
    // stray tap away from a DELETE the rower has not decided to repeat.
    await expect(
      page.getByRole("button", { name: "Unlink Concept2" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Tap again to unlink" }),
    ).toHaveCount(0);
  });
});

/**
 * COMING BACK FROM CONCEPT2 — AND WHAT THIS CAN AND CANNOT SEE (RF26).
 *
 * The web arm's `startLink` UNLOADS this document
 * (`adapters/webNavigate.ts`'s `window.location.assign`), so the rower's
 * only way home is Back. Invariant I5 says the card must show the link that
 * was made while it was away, and the hook holds up TWO halves of that: a
 * mount read for a browser that rebuilds the page, and a `pageshow`
 * listener for one that RESTORES it from the back-forward cache and runs no
 * mount at all.
 *
 * THIS TEST PROVES THE FIRST HALF ONLY, and the reason is a measured
 * property of the harness rather than a choice. Playwright launches
 * Chromium with `--disable-back-forward-cache` unconditionally
 * (`playwright-core`'s `chromiumSwitches.ts`: "Avoids surprises like main
 * request not being intercepted during page.goBack()") — and dropping that
 * switch with `ignoreDefaultArgs` is NOT enough. Measured 2026-09-03 with a
 * throwaway spec listening to CDP `Page.backForwardCacheNotUsed` over this
 * very flow, with the switch removed: the restore is refused
 * `BrowsingInstanceNotSwapped` + `BackForwardCacheDisabledForDelegate` —
 * the embedder disables the cache for any page a debugger is attached to,
 * and Playwright drives every page over CDP. So NO Playwright test in this
 * repo can observe a bfcache restore, and a green Back case here is
 * evidence about RE-ENTRY, never about `pageshow`.
 *
 * The `pageshow` half is gated where it can actually be driven:
 * `api/useConcept2Link.test.ts`'s "re-reads on pageshow, which is the ONLY
 * event a bfcache restore fires" and `you/Concept2Card.test.tsx`'s own
 * dispatch, both of which fire the real event at the real listener.
 *
 * The heap marker below is kept as an INSTRUMENT, not an assertion: it
 * reports which of the two paths a given run took, so nobody reads a future
 * green as evidence for the half it cannot reach. Pinning it would be
 * pinning an engine fact.
 */
test.describe("coming back from Concept2", () => {
  test("Back shows the link that was made while the app was away", async ({
    page,
  }) => {
    const fake = await signIn(page, "back");
    fake.unlinked();
    fake.connect = {
      status: 200,
      body: { authorizeUrl: "/api/concept2/callback?stub=1", state: "s" },
    };
    await openYou(page);

    // A MARKER IN THE JS HEAP — the instrument this describe's header
    // names. A back-forward-cache RESTORE preserves this document and
    // everything in it, so the marker survives; a REBUILD makes a new
    // document and the marker is gone. Without it, "it passed" and "the
    // `pageshow` listener fired" are indistinguishable, and only the second
    // would be evidence for the restore half of I5.
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__c2HeapMarker = "alive";
    });

    await page.getByRole("button", { name: "CONNECT TO CONCEPT2" }).click();
    await expect(page).toHaveURL(/\/api\/concept2\/callback\?stub=1$/);
    await expect(page.locator("body")).toContainText("consent stub");

    // The rower approved: the server now answers LINKED. Nothing about the
    // client knows that yet.
    fake.linked();
    await page.goBack();

    // NO RELOAD IS DRIVEN BY THIS TEST — the whole point is what the app
    // does on its own.
    await expect(page.locator(".c2-card-status")).toHaveText("LINKED ✓");
    await expect(page.locator(".c2-card-identity")).toContainText(
      "Concept2 jamesawesome",
    );

    const restored = await page.evaluate(
      () =>
        (window as unknown as Record<string, unknown>).__c2HeapMarker ?? null,
    );
    // Recorded, never asserted: the outcome is a fact about the ENGINE.
    // Under Playwright it is always REBUILT (see the header's CDP
    // measurement), so an assertion either way would be pinning a harness
    // property. Printed so the next reader of a green run knows exactly
    // which half of I5 it exercised.
    console.log(
      `[c2 back] document was ${restored === "alive" ? "RESTORED (bfcache — the pageshow listener is what re-read)" : "RELOADED (a fresh mount read got there first)"}`,
    );
  });
});
