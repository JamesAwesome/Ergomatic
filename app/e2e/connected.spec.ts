import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

// news.spec.ts's own idiom, imported here for the same reason it exists
// there — and for one more this file taught the hard way: `cleanupByTitle`
// runs only when a walk SUCCEEDS, so a mid-walk failure strands the
// imported workout on the (find-or-create-by-email) user, and CI's retry
// then re-imports the same title and dies on a strict-mode duplicate
// instead of actually retrying (2026-08-08, two red main runs). Unique
// per-process emails and titles make every attempt — retry, repeat local
// run, concurrent worker — its own clean world.

// Phase 7B Task 8 — THE CONNECTED WALK, fake-driven, in a real browser
// against the real compose stack.
//
// Every OTHER e2e spec in this repo runs against `docker compose`'s `web`
// image, which is a `vite build` production bundle (`Dockerfile`'s single
// `build` stage — no `vite dev` path exists anywhere in it). That matters
// here specifically: `src/monitor/transports/index.ts`'s fake-injection
// seam is gated on `import.meta.env.DEV || import.meta.env
// .VITE_ENABLE_FAKE_MONITOR === "1"` — NOT `DEV` alone (that file's own
// header explains why the brief's original "DEV-gated" framing didn't
// survive contact with this compose stack: the e2e/screenshots build is
// byte-identical to a real deploy's, so `DEV` alone would have made this
// whole file undrivable). `compose.e2e.yml` sets the second half of that
// `||` as a `web` build ARG, which is why this file can run through the
// ordinary `pnpm e2e` path like every other spec, with no separate `vite
// dev` server of its own.
//
// THE SESSION CLOCK is `transports/index.ts`'s own in-page auto-ticking
// wrapper for the SHORT stretches (`walkToReady`'s own interstitial) — this
// file only reaches for `window.__pm5FakeControls__` directly
// (`pumpUntilPaused`/`pumpUntilResumed`, below) once the STORY's own
// multi-second span makes the auto-tick clock's own throttling exposure
// (next paragraph) worth working around. Two things about it were
// discovered building this file, both empirical:
//
// - It genuinely is reliable at close to 1:1 real:virtual pacing for a good
//   while (tens of real seconds) — an EARLIER draft's own timeline (a few
//   hundred milliseconds of "story" starting right after `connect()`) was
//   consumed almost entirely by the real time connect/pairing/programming/
//   the ready dwell themselves take, landing this test on an already-
//   resumed session before its own first assertion ever ran.
// - Past roughly 20-30 real seconds, Chromium's own background-tab timer
//   throttling can stop an in-page `setInterval` from firing again at all —
//   proven directly: with the clock stalled at a fixed reading indefinitely,
//   a single manual `page.evaluate(() => window.__pm5FakeControls__
//   .tick(ms))` call (which runs over the DevTools protocol, not subject to
//   the same throttling policy) advanced it immediately and correctly.
//
// So `buildStoryEvents()` below is scheduled to start comfortably PAST
// realistic setup time (a handful of real seconds, not hundreds of
// milliseconds) and finish comfortably BEFORE the throttling cliff — no
// number here is provably correct for all machines, but the margins on both
// sides are generous relative to everything actually observed running this
// file for real.
//
// THE FIXTURE PROGRAM is fixed and pre-computed, not re-derived here: a
// bulk import of five `w 100m max` lines compiles (verified independently,
// via `compileProgram` run against the exact same draft this test builds)
// to `{ intervals: [ { kind: "distance", value: 100, targetSplit: null,
// displaySpm: null, restSeconds: 0 } ] }` repeated five times. `createFake
// Transport` asserts every incoming programming byte against its OWN
// `script.program` (`fake.ts`'s own doc comment) — this Playwright process
// cannot reach into the app's Vite-served JS to ask it what it actually
// compiled, so the two have to agree by construction, not by introspection.
// Five intervals (not one) so pane C — reachable in a real browser for the
// first time this phase, `screenshots.spec.ts`'s own fixture-swap approach
// notwithstanding (that one draws real layout against SYNTHETIC data; this
// walk is real layout against a REAL, fake-driven session) — renders its
// full five-row grid.
const FIXTURE_PROGRAM = {
  intervals: Array.from({ length: 5 }, () => ({
    type: "work" as const,
    kind: "distance" as const,
    value: 100,
    targetSplit: null,
    displaySpm: null,
    restSeconds: 0,
  })),
};

const BULK_TEXT = (title: string): string =>
  [
    `${title} | AN | easy | 1`,
    "w 100m max",
    "w 100m max",
    "w 100m max",
    "w 100m max",
    "w 100m max",
  ].join("\n");

interface FakeStatusEventLike {
  atMs: number;
  kind: "status";
  workoutState: number;
  elapsedSeconds: number;
  distanceMeters: number;
  spm: number;
  currentSplit: number;
  heartRateBpm: number | null;
  programIntervalIndex: number;
}

interface FakeBoundaryEventLike {
  atMs: number;
  kind: "boundary";
  actual: {
    index: number;
    elapsedSeconds: number;
    distanceMeters: number;
    avgSplit: number;
    avgSpm: number;
    avgHeartRateBpm: number;
  };
  cumulativeElapsedSeconds: number;
  cumulativeDistanceMeters: number;
}

// `pm5/parse.ts`'s own ordinal, copied here as a plain number (this file has
// no access to the app's TS modules — it drives the app from OUTSIDE,
// through a real browser, per Playwright's own model — never `import`s
// them). `WORKOUTSTATE_INTERVALWORKTIME` is `4` (`domain/monitor/pm5/
// parse.ts` — NOT `3`, which is `WORKOUTSTATE_INTERVALREST`; an earlier
// draft of this file used `3` and every "rowing" story frame silently
// parsed as `state: "resting"` instead, which `nextFreezeRun`
// [`useMonitorSession.ts`] resets to zero on every single frame — PAUSED
// could never accumulate its four-frame hold, discovered only by reading
// `parse.ts`'s own `WORKOUTSTATE_TO_STATE` table after `pumpUntilPaused`
// ran its full budget and still found nothing). This walk ends by the
// ROWER pressing End, never by the machine finishing all five intervals —
// pane C's own five-row render only needs the PROGRAM to have five
// intervals, not for the session to reach all of them, and scripting that
// many status ticks would only make this spec slower for no more coverage.
const WORKOUTSTATE_INTERVALWORKTIME = 4;

/** The story's own start, in virtual milliseconds — see this file's header
 *  for why it is neither "right after connect()" nor "tens of seconds
 *  out". */
const STORY_START_MS = 8000;

/** Offsets (from `STORY_START_MS + 900`, interval 1's own first tick) of
 *  the FROZEN frames — `buildStoryEvents()`'s own header explains why there
 *  are far more than the four `PAUSED_FRAME_HOLD` needs: this holds for
 *  ~6 real seconds so the pane-navigation sequence between reaching the
 *  surface and checking for `PAUSED` has real room to run without racing
 *  the resume that follows it. */
const FREEZE_OFFSETS = Array.from({ length: 20 }, (_, i) => 300 + i * 300);

/**
 * The session timeline: interval 0 runs to completion (one boundary),
 * interval 1 begins, then FREEZES for four consecutive identical frames —
 * `useMonitorSession.ts`'s own `PAUSED_FRAME_HOLD` — which is what the
 * connected surface reads as "paused" (`isPausedRun`), then resumes with a
 * changed frame. The rower's own "End session" press (staged, two taps)
 * ends the walk from there.
 *
 * The 700ms gap between the last freeze frame and the resume is
 * deliberately wide relative to the fake's own 100ms auto-tick step:
 * `PAUSED` has to be an OBSERVABLE state, not a value that only ever
 * existed between two ticks.
 */
function buildStoryEvents(): (FakeStatusEventLike | FakeBoundaryEventLike)[] {
  const t = STORY_START_MS;
  return [
    {
      atMs: t,
      kind: "status",
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      elapsedSeconds: 5,
      distanceMeters: 30,
      spm: 24,
      currentSplit: 110,
      heartRateBpm: 140,
      programIntervalIndex: 0,
    },
    {
      atMs: t + 300,
      kind: "status",
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      elapsedSeconds: 10,
      distanceMeters: 70,
      spm: 24,
      currentSplit: 108,
      heartRateBpm: 142,
      programIntervalIndex: 0,
    },
    {
      atMs: t + 600,
      kind: "boundary",
      actual: {
        index: 0,
        elapsedSeconds: 15,
        distanceMeters: 100,
        avgSplit: 112,
        avgSpm: 24,
        avgHeartRateBpm: 141,
      },
      cumulativeElapsedSeconds: 15,
      cumulativeDistanceMeters: 100,
    },
    // WIRE-IMPOSSIBLE (review IMPORTANT-2, Task 6 fix round): elapsed/
    // distance continue cumulatively from interval 0's own boundary above
    // (15s/100m) instead of resetting per-interval (item 12) — post-Task-6
    // this renders METERS LEFT = 0 (Math.max clamp) through every
    // interval-1 frame this story reaches, not a real countdown.
    // Rewriting this walk to per-interval-reset values also moves TOTAL M
    // and needs its own pass; deferred, not fixed this round.
    {
      atMs: t + 900,
      kind: "status",
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      elapsedSeconds: 17,
      distanceMeters: 115,
      spm: 24,
      currentSplit: 110,
      heartRateBpm: 140,
      programIntervalIndex: 1,
    },
    // THE FREEZE — many consecutive frames while the machine reads `rowing`
    // in which DISTANCE, SPLIT and RATE hold identical values and the
    // WORKOUT CLOCK KEEPS RUNNING (`PAUSED_FRAME_HOLD`, `useMonitorSession.
    // ts`), the exact shape the paused derivation requires (only four are
    // NEEDED to trip it; this holds for several REAL seconds on purpose, so
    // `PAUSED` stays observable through this file's own real-time
    // pane-navigation sequence — clicking through three rail targets and
    // three swipes, every one a real round trip — rather than a window
    // narrow enough for that sequence alone to blow past it before the
    // assertion ever runs).
    //
    // `elapsedSeconds` ADVANCES frame to frame on purpose (erg-day review,
    // MEDIUM-4). The whole hardware finding behind the three-metric key is
    // that a real PM5 runs the clock through a stop — the earlier fixture
    // froze elapsed alongside the other three, which meant a revert to the
    // superseded four-metric key would have left this walk GREEN. With the
    // clock running, the browser gate proves the finding end to end: a key
    // that includes elapsed can never repeat here, and PAUSED never fires.
    //
    // WIRE-IMPOSSIBLE, same disclosure as the interval-1 tick above
    // (review IMPORTANT-2): `distanceMeters: 140` continues this story's
    // own already-cumulative interval-1 narrative (115 there), not a
    // per-interval reset — this block's own purpose is testing the freeze
    // derivation, not METERS LEFT, but post-Task-6 it still renders 0
    // (clamped) throughout. Same deferral: not fixed this round.
    ...FREEZE_OFFSETS.map((offset, i) => ({
      atMs: t + 900 + offset,
      kind: "status" as const,
      // One whole second of machine clock per frame — the same compressed
      // time scale the story's earlier frames already use (5s of clock per
      // 300ms tick), and whole seconds because `elapsedDisplay` renders at
      // second resolution: a sub-second advance would move the FRAME
      // without moving the STRIP, and the assertion below reads the strip.
      // 20 -> 39 across the 20 frames.
      elapsedSeconds: 20 + i,
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      distanceMeters: 140,
      spm: 24,
      currentSplit: 110,
      heartRateBpm: 140,
      programIntervalIndex: 1,
    })),
    // THE RESUME — any changed value clears the freeze (`nextFreezeRun`'s
    // own "exit is on ANY change" rule).
    {
      atMs: t + 900 + FREEZE_OFFSETS[FREEZE_OFFSETS.length - 1]! + 700,
      kind: "status",
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      // Past the last freeze frame's own 39 — the clock never goes
      // backwards here just because the fixture stopped pinning it.
      elapsedSeconds: 45,
      distanceMeters: 165,
      spm: 25,
      currentSplit: 106,
      heartRateBpm: 139,
      programIntervalIndex: 1,
    },
  ];
}

// `delayWritesMs` (`transports/index.ts`'s own `InjectedFakeScript` field):
// with instant (same-microtask) writes, pairing/programming resolve within
// a fraction of one animation frame — too fast for
// "Connecting"/"Sending the workout" to ever be observed at all (this
// file's own first real run against the compose stack skipped straight
// past both). 120ms per write is slow enough to be assertable, at the real
// cost of a couple of real seconds for a 5-interval program's own chunk
// count.
const INTERSTITIAL_WRITE_DELAY_MS = 120;

async function injectFakeMonitor(
  page: Page,
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
      program: FIXTURE_PROGRAM,
      events: buildStoryEvents(),
      deviceName,
      delayWritesMs: INTERSTITIAL_WRITE_DELAY_MS,
    },
  );
}

async function setBaselines(page: Page): Promise<void> {
  const result = await page.evaluate(async () => {
    const res = await fetch("/api/baselines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ k2Seconds: 100, k6Seconds: 120 }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  });
  if (!result.ok) {
    throw new Error(`baseline setup failed: ${result.status} ${result.body}`);
  }
}

async function importBulk(page: Page, text: string): Promise<void> {
  await page.goto("/library/import");
  await page.getByLabel("Bulk import text").fill(text);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
}

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

/** A native `TouchEvent` swipe on `.connected-surface` — the ONLY thing
 *  `page.touchscreen` cannot do is a two-point gesture with a real delta
 *  (it only exposes `tap()`), and `ConnectedSurface.tsx`'s own swipe is
 *  read from `onTouchStart`/`onTouchEnd`'s `clientX`, which a synthetic
 *  `Touch`/`TouchEvent` pair satisfies exactly like a real finger would.
 *  `deltaX` follows `paneAfterSwipe`'s own convention: negative moves
 *  forward through `PANES`, positive moves backward. */
async function swipeSurface(page: Page, deltaX: number): Promise<void> {
  await page.evaluate((dx) => {
    const el = document.querySelector(".connected-surface");
    if (!el) throw new Error("no .connected-surface to swipe");
    const rect = el.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const touch = (x: number, id: number) =>
      new Touch({ identifier: id, target: el, clientX: x, clientY: y });
    el.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        touches: [touch(startX, 1)],
        changedTouches: [touch(startX, 1)],
      }),
    );
    el.dispatchEvent(
      new TouchEvent("touchend", {
        bubbles: true,
        cancelable: true,
        touches: [],
        changedTouches: [touch(startX + dx, 1)],
      }),
    );
  }, deltaX);
}

/**
 * Advances the fake's virtual clock and reads whether `PAUSED` is on
 * screen, in the SAME `page.evaluate` round trip — the fix for a discovery
 * running this file for real: checking `tick()` and the DOM in two
 * SEPARATE steps (a Node-side interval ticking, a Playwright `expect(...)
 * .toBeVisible()` polling independently) leaves a gap neither side
 * controls, and `transports/index.ts`'s own in-page auto-tick clock can
 * ALSO be contributing ticks concurrently and unpredictably (it is never
 * disabled, only supplemented) — between two checks, enough ticks can land
 * to deliver the ENTIRE freeze-then-resume sequence, which React batches
 * into one commit with no paint of the transient `PAUSED` state in
 * between. Combining tick-then-read into one atomic step, and doing it in
 * a TIGHT loop with a small step, is what actually catches a state this
 * narrow reliably. */
async function pumpUntilPaused(page: Page, maxRealMs = 20_000): Promise<void> {
  const deadline = Date.now() + maxRealMs;
  for (;;) {
    const paused = await page.evaluate(() => {
      window.__pm5FakeControls__?.tick(30);
      return !!document.querySelector(".connected-paused");
    });
    if (paused) return;
    if (Date.now() >= deadline) {
      // One last, honest assertion — surfaces a real Playwright failure
      // against the actual DOM rather than a bespoke timeout error.
      await expect(page.getByText("PULL TO RESUME")).toBeVisible();
      return;
    }
  }
}

/** The mirror of `pumpUntilPaused`, for the RESUME — kept driven the same
 *  atomic tick-then-read way rather than a plain `expect(...).toBeHidden()`
 *  in case the in-page auto-tick clock has stalled by this point (this
 *  file's own header) and nothing else would ever deliver the resume
 *  event at all. */
async function pumpUntilResumed(page: Page, maxRealMs = 10_000): Promise<void> {
  const deadline = Date.now() + maxRealMs;
  for (;;) {
    const stillPaused = await page.evaluate(() => {
      window.__pm5FakeControls__?.tick(30);
      return !!document.querySelector(".connected-paused");
    });
    if (!stillPaused) return;
    if (Date.now() >= deadline) {
      await expect(page.getByText("PULL TO RESUME")).toBeHidden();
      return;
    }
  }
}

/** Signs in, sets baselines, imports the fixture workout, injects the fake
 *  script, and drives Connect through pairing/programming to the `ready`
 *  dwell screen — the shared setup every walk test below starts from,
 *  parameterised only by viewport (set by the caller BEFORE this runs, so
 *  the very first paint is already the target frame). Relies on
 *  `transports/index.ts`'s own in-page auto-tick alone — empirically fast
 *  and reliable for this short a stretch (well under a second, measured
 *  directly) — `pumpUntilPaused`/`pumpUntilResumed` (below) are reserved
 *  for the STORY, whose own multi-second span is where the in-page clock's
 *  own unreliability (this file's own header) actually bites. */
async function walkToReady(
  page: Page,
  title: string,
  email: string,
  deviceName: string,
): Promise<void> {
  await injectFakeMonitor(page, deviceName);
  await signInViaBackdoor(page, { email, name: "Connected Walk Tester" });
  await setBaselines(page);
  await importBulk(page, BULK_TEXT(title));
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

  // Scoped to `.connected-serif-line` (not a bare `getByText`) — the
  // status label and the checklist's own current-line marker both ALSO say
  // "CONNECTING", and Playwright's text matching is case-insensitive, so an
  // unscoped query is ambiguous across all three.
  const connectingLine = page.locator(".connected-serif-line", {
    hasText: "Connecting",
  });
  const sendingLine = page.locator(".connected-serif-line", {
    hasText: "Sending the workout",
  });
  const readyLine = page.locator(".connected-serif-line", {
    hasText: "Ready when you pull",
  });

  await page.getByRole("button", { name: "Connect" }).click();

  // State 4 — pairing. `deviceName` is still null the instant `phase`
  // flips (`useMonitorSession.ts`'s own ordering comment), so this can
  // legitimately render "CONNECTING" first before the real name lands.
  await expect(connectingLine).toBeVisible({ timeout: 5000 });

  // State 5 — programming. `program()` dispatches once `deviceName` is
  // known (the deviceName-gated race `ConnectedInterstitial.test.tsx`'s own
  // organic regression test pins) — `delayWritesMs` (this file's own
  // header) is what keeps this and the pairing screen above both real,
  // observable states instead of a same-microtask blur.
  await expect(sendingLine).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator(".connected-panel-line", { hasText: "5 INTERVALS" }),
  ).toBeVisible();

  // State 7 — ready. The dwell auto-advance is GONE (2026-08-08 operator
  // ruling, walks 2-3): this screen holds until the button or the first
  // pull. The press below is UNCONDITIONAL on purpose (erg-day review,
  // MEDIUM-5): with no dwell the button is always present at `ready`, so a
  // `isVisible()` guard could only ever be false if the dwell regression
  // came back — and then the walk would silently skip the click and still
  // pass. Asserting it is the one place CI can catch that.
  await expect(readyLine).toBeVisible({ timeout: 15_000 });
  const showNumbers = page.getByRole("button", {
    name: "Show me the numbers",
  });
  await expect(showNumbers).toBeVisible();
  await showNumbers.click();
}

/** The walk from the ready dwell through paused, resumed, End, and the log
 *  screen — everything past `walkToReady` that does not depend on
 *  orientation.
 *
 *  FROZEN/RESUMED are checked FIRST, before any pane navigation — a
 *  discovery from this file's own first real runs: `PULL TO RESUME`
 *  renders in the surface's shared FOOTER regardless of which pane
 *  is active (`ConnectedSurface.tsx`'s own render — the footer's own
 *  content sits outside the per-pane body entirely), so nothing about
 *  observing it requires being on any particular pane first. Checking it
 *  EARLY, before the rail-and-swipe sequence's own real round trips, is
 *  what keeps this walk from racing its own story: `buildStoryEvents()`'s
 *  freeze deliberately holds for several real seconds, but "several" is
 *  still a budget, and spending it on unrelated pane clicks before ever
 *  looking left nothing for the actual assertion on two of this file's own
 *  earlier runs. */
async function walkSurfaceToLog(
  page: Page,
  title: string,
  deviceName: string,
): Promise<void> {
  // The surface, on the default pane (`DEFAULT_PANE`, "live" — "B on the
  // first connected session").
  await expect(
    page.getByRole("navigation", { name: "Connected panes" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Live pane" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // THE HEADER NEVER SHIFTS (connected-revamp Task 6, revision §2/§4): End
  // moved out of the footer into the header, which now renders
  // UNCONDITIONALLY, so the header's own top edge should never move because
  // the erg froze or resumed — real pixel proof, not the structural jsdom
  // pin `ConnectedSurface.test.tsx` carries for the same claim.
  //
  // THE PANE'S OWN BOTTOM CONTENT DOES NOW MOVE, DELIBERATELY (connected-
  // axes 2a, task 5 — this used to also pin the metric row's own top
  // position as unchanging; that invariant is GONE ON PURPOSE, not a
  // regression). The task-6 round bought "nothing moves at all" by
  // painting the frozen block OVER the pane's own last 52px as an
  // absolutely-positioned overlay — free of any layout shift, but at the
  // one moment it rendered, it covered TOTAL LEFT, the number the freeze
  // exists to keep the rower reading (spec 2a's own trigger: "the block we
  // drew covers the one number that would have told the rower so"). Task 5
  // puts the block back IN FLOW, so the pane's own `1fr` track genuinely
  // shrinks while frozen and grows back on resume — the metric row's own Y
  // position is EXPECTED to differ between the two reads below, and the new
  // pixel proof this walk carries is the no-overlap one further down
  // instead: TOTAL LEFT's own bar never sits under the frozen block, in
  // either direction.
  const header = page.locator(".connected-header");
  const totalLeftBar = page.locator(".timer-total");

  // PAUSED — the freeze in `buildStoryEvents()` above lands here. The
  // footer's own content swaps from empty to the paused block (End keeps
  // showing in the header throughout, unaffected); the THREE keyed
  // metrics (distance/split/rate) hold the SAME reading the whole time
  // while the machine's clock keeps running, which is the entire point of
  // the derivation (`PAUSED_FRAME_HOLD`'s own doc comment). Driven by
  // `pumpUntilPaused` (this file's own header on why an ordinary
  // `expect(...).toBeVisible()` cannot be trusted to catch it).
  await pumpUntilPaused(page);
  await expect(page.getByText("PULL TO RESUME")).toBeVisible();
  const pausedHeaderTop = (await header.boundingBox())!.y;
  // NO OCCLUSION, THE REAL-PIXEL PROOF (task 5's own fix): TOTAL LEFT's own
  // bar sits ENTIRELY above the frozen block, never under it — the box
  // painting the exact number the task-6 overlay used to cover.
  const [ruler, frozenBlock] = await Promise.all([
    totalLeftBar.boundingBox(),
    page.locator(".connected-paused").boundingBox(),
  ]);
  expect(ruler, ".timer-total").not.toBeNull();
  expect(frozenBlock, ".connected-paused").not.toBeNull();
  expect(
    frozenBlock!.y,
    `.connected-paused (top ${frozenBlock!.y}) overlaps .timer-total (bottom ${ruler!.y + ruler!.height})`,
  ).toBeGreaterThanOrEqual(ruler!.y + ruler!.height);
  // Cards are gone from pane B (connected-revamp Task 3, revision §3: "the
  // old three metric cards are gone") — METERS is now a plain metric-row
  // cell, `.connected-metric-cell` in place of the old `.timer-card`.
  // Structural `has()`, not `hasText`. This was originally a workaround for
  // the two labels being indistinguishable: the interval clock read "METERS
  // LEFT" and this cell read "METERS", so a substring match on the CELL
  // could not tell "METERS LEFT<value>" from "METERS<value>". James renamed
  // this one to "TOTAL M" on 2026-08-13 precisely because that collision
  // was a rower's problem before it was a test's. The structural form is
  // kept anyway — an exact-text label child is the honest way to identify a
  // cell, and it no longer depends on the two names staying distinguishable
  // by accident.
  const metersValue = page
    .locator(".connected-metric-cell")
    .filter({
      has: page.locator(".connected-metric-label", { hasText: /^TOTAL M$/ }),
    })
    .locator(".connected-metric-value");
  const pausedMeters = await metersValue.textContent();
  // The ELAPSED strip retired with the same task (replaced by the metric
  // row) and took its own MEDIUM-4 regression anchor with it — no cell the
  // strip's replacement carries (left-in-interval, meters, HR) is
  // guaranteed to keep moving through a pause the way a wall clock does.
  // TOTAL LEFT is: it is priced off the SAME accumulated
  // `sessionElapsedSeconds` the retired ELAPSED strip read
  // (`surfaceModel.ts`'s own `totalLeftSeconds`/`elapsedDisplay`, one
  // driver clock behind both), and `TimerRuler`'s `.timer-total-value`
  // survives Task 3 unchanged, so it re-anchors the same proof: something
  // on pane B keeps counting while METERS holds.
  const totalLeftValue = page.locator(".timer-total-value");
  const pausedTotalLeft = await totalLeftValue.textContent();
  // Reads the same frozen METERS across two checks a beat apart — proof
  // this is a HOLD, not a coincidence of timing. TOTAL LEFT is deliberately
  // NOT part of that check: it is the one metric the fixture keeps moving
  // through the freeze, exactly as a real PM5 does.
  await page.waitForTimeout(700);
  await expect(metersValue).toHaveText(pausedMeters ?? "");
  await expect(page.getByText("PULL TO RESUME")).toBeVisible();
  // ...and the clock really did move while PAUSED held (erg-day review,
  // MEDIUM-4: without this the four-metric key would still pass here).
  expect(await totalLeftValue.textContent()).not.toBe(pausedTotalLeft);

  // RESUMED — the changed frame in `buildStoryEvents()` clears the freeze
  // (700ms of clearance past the freeze's own last tick).
  await pumpUntilResumed(page);
  await expect(page.getByText("PULL TO RESUME")).toBeHidden();
  await expect(page.getByRole("button", { name: "End session" })).toBeVisible();
  // THE HEADER'S OWN TOP NEVER MOVED, the actual pixel proof for the one
  // invariant task 5 keeps: End's control renders unconditionally at a
  // fixed height (connected-revamp Task 6), so its top edge is identical
  // whether or not the frozen block is on screen below it. The PANE's own
  // bottom content is NOT asserted unchanged here any more — task 5 spends
  // exactly that space to stop occluding TOTAL LEFT (the no-overlap
  // assertion above, while frozen, is this walk's replacement proof).
  const resumedHeaderTop = (await header.boundingBox())!.y;
  expect(resumedHeaderTop).toBeCloseTo(pausedHeaderTop, 0);

  // Pane navigation VIA THE RAIL. Interval 0's boundary has certainly landed
  // by now (it precedes even the freeze), so the grid read below is against
  // SETTLED data, not a race.
  await page.getByRole("button", { name: "Grid pane" }).click();
  await expect(page.getByRole("button", { name: "Grid pane" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // The five-row grid: one program, five intervals, five rows — regardless
  // of how many the fake has actually walked the session through.
  await expect(page.locator(".connected-grid-row")).toHaveCount(5);
  await expect(page.locator(".connected-grid-completed")).toHaveCount(1);
  await expect(page.locator(".connected-grid-active")).toHaveCount(1);

  // Pane navigation VIA SWIPE, back from grid to live — `paneAfterSwipe`: a
  // POSITIVE delta moves backward through `PANES` (["live","grid"]), and
  // "live" is the far end, so one swipe is the whole round trip there is
  // (connected-revamp Task 2 dropped the timer pane, PANES's third stop).
  await swipeSurface(page, 120);
  await expect(page.getByRole("button", { name: "Live pane" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // END — staged, two presses (`ARM_TIMEOUT_MS`'s own 4s window).
  await page.getByRole("button", { name: "End session" }).click();
  await expect(
    page.getByRole("button", { name: "Tap again to end" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tap again to end" }).click();

  // THE ENDED HAND-OFF FRAME — genuinely a ONE-RENDER flash for a
  // user-initiated End (`ConnectedSurface.tsx`'s own header: `handoffHeld`
  // stays `false` for `endedBy: "user"`, so `onEnded()` fires on the very
  // next render and the caller navigates immediately). A plain
  // `toBeVisible()` here raced that window under full-suite CPU load
  // (caught directly investigating this task's own two new
  // `boundingBox()` round trips just above — 6/6 green in isolation, an
  // intermittent miss only under the full 279-test parallel run) and is
  // not this task's frame to make less transient. Whichever of "the frame
  // painted" or "navigation already landed" happens first is equally good
  // proof End worked.
  //
  // `Promise.any`, NOT `Promise.race` (task-6 review, I4 — this is a
  // disclosed retirement-and-restoration, not a silent weakening). The
  // first version of this raced two promises that each swallowed their own
  // rejection with `.catch(() => undefined)`, which asserts NOTHING: a race
  // settles on the first SETTLEMENT, so two timeouts resolved it just as
  // happily as a painted frame did, and the ended hand-off went unpinned in
  // this walk. `any` resolves on the first FULFILMENT and rejects with an
  // `AggregateError` if both fail — so the tolerance for which of the two
  // wins survives, and a double failure still fails here, on this line,
  // naming both branches.
  await Promise.any([
    page.getByText("That is the session").waitFor({ state: "visible" }),
    page.waitForURL(/\/library\/[^/]+\/log\?from=monitor$/),
  ]);

  // THE LOG FLOW — `WorkoutDetail.tsx`'s own `handleConnectedEnded`
  // navigates here, `?from=monitor` appended; a `MonitorRun`, not a phone
  // `SessionRun`, is what closed, so this is the manual door's own
  // `/library/:id/log`, not `/session/log`, and the monitor mode (7C spec
  // §4) is what engages on this exact URL shape.
  await expect(page).toHaveURL(/\/library\/[^/]+\/log\?from=monitor$/);
  await expect(page.locator("h1.screen-title")).toHaveText(`Log ${title}`);

  // THE STASH (hardware walk 2's loss, pinned in a real browser): the
  // surface is gone, the session is over, and the wire log is still
  // copyable from this very screen — teardown wrote it on the way out.
  const stash = await page.evaluate(() =>
    sessionStorage.getItem("ergomatic:last-monitor-log"),
  );
  expect(
    stash,
    "teardown stashes the wire log for the ended session",
  ).not.toBeNull();
  const entries = JSON.parse(stash!) as { kind: string }[];
  expect(entries.some((e) => e.kind === "write")).toBe(true);

  // THE MONITOR MODE FORM (7C spec §4/§7, Task 6): the caption line, a
  // rendered pm5 split, then Save — proving the mode engaged for real,
  // not just that the route matched. `buildStoryEvents()` above lands
  // exactly ONE boundary (interval 0) before End is pressed, so the
  // caption reads "1 OF 5" (the fixture program's five work intervals,
  // `monitorCaption`'s own `total` — warmups are never in this array to
  // begin with) and only interval 0's row grows an ACTUAL line.
  await expect(page.locator(".log-from-monitor")).toHaveText(
    `FROM ${deviceName} · 1 OF 5 INTERVALS MEASURED`,
  );
  // avgSplit 112 (`buildStoryEvents()`'s own boundary actual) -> fmtSplit
  // "1:52.0" — a real, plausible split, not a placeholder value.
  await expect(page.locator(".log-step-actual").first()).toHaveText(
    "ACTUAL 1:52.0",
  );

  // Fill idiom from `session.spec.ts`'s own manual door coverage: HELD,
  // then a mid-scale pain rating (deliberately not the extremes).
  await page.getByRole("button", { name: "HELD" }).click();
  await page.getByRole("button", { name: "Pain 3" }).click();
  await page.getByRole("button", { name: "Save session" }).click();
  await expect(page).toHaveURL(/\/today$/);

  // THE STORED LOG — the save posted for real; read it back off the same
  // route Today itself uses, in-page (same-origin, same session cookie).
  const logs = (await page.evaluate(() =>
    fetch("/api/logs").then((r) => r.json()),
  )) as {
    deviceName: string | null;
    steps: { actualSource?: string; actualSeconds?: number }[];
  }[];
  const newest = logs[0];
  expect(newest, "the just-saved log is the newest one back").toBeDefined();
  expect(newest!.deviceName).toBe(deviceName);
  const pm5Steps = newest!.steps.filter((step) => step.actualSource === "pm5");
  expect(
    pm5Steps.length,
    "at least the one measured interval carries a pm5 step",
  ).toBeGreaterThan(0);
  for (const step of pm5Steps) {
    expect(typeof step.actualSeconds).toBe("number");
  }
}

// `STORY_START_MS` (8s) plus the story's own ~7.3s span (`FREEZE_OFFSETS`'s
// own header — most of it a deliberately long paused hold), on top of
// connect/pairing/programming/the ready dwell/pane navigation/the staged
// End — comfortably past Playwright's 30s default test timeout.
test.setTimeout(90_000);

test.describe("Phase 7B Task 8: the connected walk, fake-driven — portrait (390×844)", () => {
  test("connect -> pairing -> programming -> ready -> the surface (rail + swipe) -> paused -> resumed -> End -> the log screen", async ({
    page,
  }) => {
    const title = `Connected Walk Portrait ${RUN_ID}`;
    const deviceName = "PM5 918273645";
    await walkToReady(
      page,
      title,
      `connected-walk-portrait-${RUN_ID}@e2e.test`,
      deviceName,
    );
    await walkSurfaceToLog(page, title, deviceName);
    await cleanupByTitle(page, title);
  });
});

test.describe("Phase 7B Task 8: the connected walk, fake-driven — landscape (844×390)", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("the same walk, at the phase's own landscape-first reference frame", async ({
    page,
  }) => {
    const title = `Connected Walk Landscape ${RUN_ID}`;
    const deviceName = "PM5 837465921";
    await walkToReady(
      page,
      title,
      `connected-walk-landscape-${RUN_ID}@e2e.test`,
      deviceName,
    );

    // NEW ASSERTION TERRITORY (this task's own brief): the pager rail,
    // measured against the exact 390px-tall landscape frame every pane
    // spec's own column math is quoted in. connected-revamp Task 2 moved
    // the rail INTO the sensor gutter: `.connected-pager` is now a 44px
    // WIDE column at the PHYSICAL edge (`x === 0`, revision §2/§6) in
    // landscape (`index.css`'s own landscape media query, `grid-row: 1 /
    // -1`) that spans the full SURFACE height (not the raw 390px viewport —
    // `.connected-surface`'s own height formula reserves 26px above it,
    // with no separate `- var(--tap)` term to steal ANOTHER 44px from it,
    // Task 8's own `:has()` conversion) with no truncation of its own on
    // top of that.
    const surfaceBox = await page.locator(".connected-surface").boundingBox();
    const railBox = await page.locator(".connected-pager").boundingBox();
    expect(surfaceBox).not.toBeNull();
    expect(railBox).not.toBeNull();
    expect(railBox!.width).toBeCloseTo(44, 0);
    expect(railBox!.x).toBeCloseTo(0, 0);
    // The rail spans (most of) the surface's own full height — comfortably
    // more than the 320px-vs-364px, clipped-UP-NEXT-strip shape the task-6
    // review measured BEFORE `.connected-surface`'s own `:has()` rule
    // existed, and nowhere near a truncated-rail shape. Not pinned to the
    // pixel: grid-row sizing in this engine measures a few pixels different
    // from the surface's own reported box, which is the CSS's business, not
    // this walk's.
    expect(railBox!.height).toBeGreaterThan(surfaceBox!.height - 30);
    expect(railBox!.y + railBox!.height).toBeGreaterThan(390 - 60);

    await walkSurfaceToLog(page, title, deviceName);
    await cleanupByTitle(page, title);
  });
});
