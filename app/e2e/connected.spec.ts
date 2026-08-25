import type { CDPSession, Page } from "@playwright/test";
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
// bulk import of five `w 100m max` lines (the first carrying an authored
// rate, `@22` — LOW-3, Task 1 review: the connected e2e fixtures were
// otherwise SPM-blind, every walked interval's `displaySpm` null, so no
// e2e path ever exercised the authored-target half of the split at all)
// compiles (verified independently, via `compileProgram` run against the
// exact same draft this test builds) to `{ intervals: [ { kind:
// "distance", value: 100, targetSplit: null, displaySpm: 22 (interval 0
// only; null on the rest), restSeconds: 0 } ] }` — grammar per
// `domain/bulk.ts`'s `parseWorkStep`, `@<n>` is the spm token
// (`domain/bulk.test.ts`'s own fixtures, e.g. "w 1' 6k-2 @22 r5"),
// independent of the ref kind (works the same after an effort ref like
// `max` as after a split ref). `createFakeTransport` asserts every
// incoming programming byte against its OWN `script.program` (`fake.ts`'s
// own doc comment) — this Playwright process cannot reach into the app's
// Vite-served JS to ask it what it actually compiled, so the two have to
// agree by construction, not by introspection. `displaySpm` itself is
// NEVER wired (`domain/monitor/program.ts`'s own doc comment on the
// field, confirmed against `commands.ts`'s `buildProgrammingSequence`,
// which never reads it), so giving one interval a real value here changes
// nothing about the programming bytes this walk already asserts — it only
// makes the fixture SPM-aware for whichever later task renders the cell.
// Five intervals (not one) so pane C — reachable in a real browser for the
// first time this phase, `screenshots.spec.ts`'s own fixture-swap approach
// notwithstanding (that one draws real layout against SYNTHETIC data; this
// walk is real layout against a REAL, fake-driven session) — renders its
// full five-row grid.
const FIXTURE_PROGRAM = {
  intervals: Array.from({ length: 5 }, (_, i) => ({
    type: "work" as const,
    kind: "distance" as const,
    value: 100,
    targetSplit: null,
    displaySpm: i === 0 ? 22 : null,
    restSeconds: 0,
  })),
};

const BULK_TEXT = (title: string): string =>
  [
    `${title} | AN | easy | 1`,
    "w 100m max @22",
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
  // No `avgSplit` field (PM final-PR gate, condition round, 2026-08-17,
  // matching `transports/fake.ts`'s own `FakeBoundaryEvent.actual`): the
  // fake derives 0x0037's Average Pace from this same elapsed/distance
  // pair (`derivedAvgSplit`) rather than accepting an independently-
  // scripted number a real PM5 could never send.
  actual: {
    index: number;
    elapsedSeconds: number;
    distanceMeters: number;
    avgSpm: number;
    avgHeartRateBpm: number;
    restDistanceMeters: number;
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
        avgSpm: 24,
        avgHeartRateBpm: 141,
        restDistanceMeters: 0,
      },
      cumulativeElapsedSeconds: 15,
      cumulativeDistanceMeters: 100,
    },
    // WIRE-IMPOSSIBLE (review IMPORTANT-2, Task 6 fix round): elapsed/
    // distance continue cumulatively from interval 0's own boundary above
    // (15s/100m) instead of resetting per-interval (item 12) — historically
    // this rendered METERS LEFT (`Math.max` clamp) as 0 through every
    // interval-1 frame this story reaches, not a real countdown. CR2 spec 3
    // Task 4 retired both METERS LEFT and TOTAL M off `PaneLive` outright
    // (spec §3 fate table), so neither cell exists to render anything any
    // more — this disclosure is kept as a fact about the FIXTURE's own
    // shape (still wire-impossible, still worth knowing for whoever adds a
    // per-interval-reset variant of this story), not as a claim about a
    // currently-rendered cell.
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
    // derivation, not METERS LEFT (retired off `PaneLive` entirely, CR2
    // spec 3 Task 4). Same fixture-shape note as above.
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
  // Task 4 (series capture, S3's real forced-quota leg): optional so every
  // EXISTING call site keeps `buildStoryEvents()` byte-for-byte (this
  // param defaults to it) — S3's own test is the first caller to pass a
  // shorter, boundary-free timeline of its own.
  events: (FakeStatusEventLike | FakeBoundaryEventLike)[] = buildStoryEvents(),
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
      events,
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
  // Task 4 (S3): forwarded straight to `injectFakeMonitor` — see that
  // function's own comment. `undefined` here means "use its default"
  // (`buildStoryEvents()`), exactly what every pre-existing call site got
  // before this parameter existed.
  events?: (FakeStatusEventLike | FakeBoundaryEventLike)[],
): Promise<void> {
  await injectFakeMonitor(page, deviceName, events);
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
  // shrinks while frozen and grows back on resume — the band's own Y
  // position is EXPECTED to differ between the two reads below, and the new
  // pixel proof this walk carries is the no-overlap one further down
  // instead: the band's own TOTAL LEFT cell never sits under the frozen
  // block, in either direction.
  //
  // RE-ANCHORED (CR2 spec 3 Task 4, spec §5 "Named e2e casualty" — THREE
  // dying anchors, not two, antagonist correction 3): `TimerRuler` — and
  // with it `.timer-total`/`.timer-total-value` — is cut outright, spec §3
  // fate table. `.connected-band-cell-value` (the band's own TOTAL LEFT
  // cell) replaces both the "something keeps moving" proof AND the
  // no-occlusion box below; a frozen HERO value (dash, held) replaces the
  // old TOTAL M cell as the "something holds" proof, since `meters` died
  // off `PaneLive` too (same fate table).
  const header = page.locator(".connected-header");
  const totalLeftCell = page.locator(".connected-band-cell");

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
  // NO OCCLUSION, THE REAL-PIXEL PROOF (task 5's own fix, RE-ANCHORED Task
  // 4): the band's own TOTAL LEFT cell sits ENTIRELY above the frozen
  // block, never under it — the box painting the exact number the task-6
  // overlay used to cover, and spec 2a's founding defect names by number.
  // This is THE dying anchor antagonist correction 3 calls out by name
  // (`:561`+`:579-590` in the pre-Task-4 file) — do not drop it as
  // cosmetic: it is the one assertion in this whole walk that encodes "the
  // frozen block must never occlude what it exists to keep visible."
  const [totalLeftBox, frozenBlock] = await Promise.all([
    totalLeftCell.boundingBox(),
    page.locator(".connected-paused").boundingBox(),
  ]);
  expect(totalLeftBox, ".connected-band-cell").not.toBeNull();
  expect(frozenBlock, ".connected-paused").not.toBeNull();
  expect(
    frozenBlock!.y,
    `.connected-paused (top ${frozenBlock!.y}) overlaps .connected-band-cell (bottom ${totalLeftBox!.y + totalLeftBox!.height})`,
  ).toBeGreaterThanOrEqual(totalLeftBox!.y + totalLeftBox!.height);
  // THE FROZEN HERO VALUE HOLDS (CR2 spec 3 Task 4's own replacement for
  // the retired TOTAL M cell — spec §5's own "frozen hero value … replace
  // the TOTAL M cell" line). Pane B's split hero already suppresses to a
  // dash while frozen (`livePace`'s own paused branch: nobody is pulling,
  // so there is no current reading to show) — this proves that
  // suppression HOLDS through the freeze rather than flickering a stale
  // number in and out, the same "reads the same value across two checks a
  // beat apart" proof the old METERS cell gave, now on the cell that
  // actually still exists.
  const splitHero = page.locator(".connected-hero-split .connected-hero-value");
  const pausedSplit = await splitHero.textContent();
  expect(pausedSplit).toBe("—");
  // THE BAND'S EST LEFT KEEPS MOVING (spec §5's own "… + band TOTAL LEFT
  // replace … `.timer-total-value`" line, TOTAL LEFT since renamed EST
  // LEFT — PR #143) — this fixture's freeze is a WORK phase (`state`
  // stays "rowing"), so `surfaceModel.ts`'s live term for it is still the
  // raw interval clock (`frame.elapsedSeconds`), which `buildStoryEvents()`
  // deliberately keeps advancing through the freeze (EST LEFT design spec
  // §1: not `sessionElapsedSeconds` read directly any more — that was the
  // pre-Phase-LL mechanism this comment used to describe, and this PR
  // replaces it with a phase-sum plus that live term). One driver clock
  // behind the split hero's own suppression either way, so this
  // re-anchors the same proof: something on pane B keeps counting while
  // the hero holds.
  const totalLeftValue = page.locator(".connected-band-cell-value");
  const pausedTotalLeft = await totalLeftValue.textContent();
  // Reads the same frozen hero value across two checks a beat apart —
  // proof this is a HOLD, not a coincidence of timing. TOTAL LEFT is
  // deliberately NOT part of that check: it is the one figure the fixture
  // keeps moving through the freeze, exactly as a real PM5 does.
  await page.waitForTimeout(700);
  await expect(splitHero).toHaveText(pausedSplit ?? "");
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

  // Pane navigation VIA THE SEGMENTED CONTROL. Interval 0's boundary has
  // certainly landed by now (it precedes even the freeze), so the grid read
  // below is against SETTLED data, not a race.
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

  // Back to LIVE, the same control (CR2 spec 3 task 1, design spec Ruling
  // 4: the swipe this walk used to exercise here is gone — the segmented
  // control is the only navigation left, in both directions).
  await page.getByRole("button", { name: "Live pane" }).click();
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
  // §2A: the summary's title renders bare, no "Log" prefix.
  await expect(page.locator("h1.screen-title")).toHaveText(title);

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

  // THE MONITOR MODE SUMMARY (7C spec §4/§7, Task 6, rebuilt on
  // PostWorkoutSummary by post-workout-summary spec Task 5): a rendered
  // pm5 split proves the mode engaged for real, not just that the route
  // matched. `buildStoryEvents()` above lands exactly ONE boundary
  // (interval 0) before End is pressed — 15s/100m, the fake's own
  // `derivedAvgSplit` (`transports/fake.ts`, PM final-PR gate condition
  // round, 2026-08-17) computes 500×15/100 = 75s -> fmtSplit "1:15.0", a
  // real, plausible split honestly derived from the SAME elapsed/distance
  // this boundary carries, rendered in that one interval's own measured
  // row — and, by the SAME derivation, the AVG SPLIT hero too, so a bare
  // `getByText("1:15.0")` now matches BOTH (strict-mode violation,
  // discovered running this walk): scoped to the row specifically.
  // (This used to assert a scripted-but-unrelated "1:52.0" on the row
  // alone — the exact incoherence the PM gate caught between this row and
  // its own hero on `log-monitor.png`.)
  await expect(
    page.locator(".summary-row-pace", { hasText: "1:15.0" }),
  ).toBeVisible();

  // Fill idiom from `session.spec.ts`'s own manual door coverage: HELD,
  // then a mid-scale pain rating (deliberately not the extremes). No plan
  // is active in this walk, so Save without logging is the lead button.
  await page.getByRole("button", { name: "HELD" }).click();
  await page.getByRole("button", { name: "Pain 3" }).click();
  await page.getByRole("button", { name: "Save without logging" }).click();
  await expect(page).toHaveURL(/\/today$/);

  // THE STORED LOG — the save posted for real; read it back off the same
  // route Today itself uses, in-page (same-origin, same session cookie).
  // From-the-log spec (2026-08-18), §3: the list projection drops `steps`
  // (zero client consumers) — the newest row's id comes off the list,
  // then the full row (steps included) comes off `GET /api/logs/:id`,
  // exactly like `data.test.ts`'s own fix for this same shape change.
  const logs = (await page.evaluate(() =>
    fetch("/api/logs").then((r) => r.json()),
  )) as { id: string; deviceName: string | null }[];
  const newestSummary = logs[0];
  expect(
    newestSummary,
    "the just-saved log is the newest one back",
  ).toBeDefined();
  expect(newestSummary!.deviceName).toBe(deviceName);
  const newest = (await page.evaluate(
    (id) => fetch(`/api/logs/${id}`).then((r) => r.json()),
    newestSummary!.id,
  )) as {
    deviceName: string | null;
    steps: { actualSource?: string; actualSeconds?: number }[];
    series: {
      samples: { t: number; d: number; p: number; spm: number; hr?: number }[];
      truncated?: true;
    } | null;
  };
  const pm5Steps = newest.steps.filter((step) => step.actualSource === "pm5");
  expect(
    pm5Steps.length,
    "at least the one measured interval carries a pm5 step",
  ).toBeGreaterThan(0);
  for (const step of pm5Steps) {
    expect(typeof step.actualSeconds).toBe("number");
  }

  // THE FULL LOOP (series capture spec, Task 4): the fake's own frames
  // already feed `useMonitorSession.ts`'s `SeriesRecorder` (no fake-seam
  // extension needed — checked before writing this, `handleFrame`'s own
  // `seriesRecorderRef.current?.onFrame(frame)` calls run on every live
  // frame this walk already drives), the recorder's snapshot rides the
  // CLOSE flush onto `MonitorRun.series`, `LogSession.tsx` posts it, and
  // the server stores it in the new `series` jsonb column — this is the
  // first real-browser proof that whole chain actually delivers a trace
  // through to `GET /api/logs/:id`, not just each link in isolation.
  expect(
    newest.series,
    "the connected walk's series survived to GET /:id",
  ).not.toBeNull();
  const series = newest.series!;

  // PLAUSIBLE VALUES, "count vs session seconds" (§4 exit criteria): the
  // recorder decimates to one sample per WHOLE work-second the WIRE's own
  // `elapsedSeconds` crosses — `buildStoryEvents()`'s own status frames
  // are the single source of truth for which work-seconds this walk's
  // fixture ever crosses (5, 10, 17, then 20..39 contiguously, then 45;
  // the skipped 6-9/11-16/18-19/40-44 gaps are BY DESIGN, this file's own
  // header on the story's pacing — not a defect this walk needs to prove
  // anything about). Computed from the SAME `buildStoryEvents()` this
  // walk actually injected, not a hand-copied magic number, so a future
  // edit to the story's own timeline keeps this assertion honest instead
  // of silently drifting stale.
  //
  // CORRECTED (trace-truth Task 1 close-out, `pnpm e2e` run owed by that
  // task's own review): the SAMPLE COUNT below is unaffected by Task 1's
  // register-map fold — `elapsedSeconds` is strictly increasing across
  // every status frame here (raw values 5, 10, 17, 20..39, 45, all
  // distinct), so every frame wins a NEW bucket whether or not a fold
  // constant is added underneath it, and this loop's own bucket-crossing
  // count still matches.
  //
  // RE-CORRECTED (series-truth Task 4, `pnpm e2e` run owed by that spec's
  // own §D): the LAST SAMPLE'S OWN `t` VALUE flips again, for a THIRD
  // reason unrelated to either correction above. `buildStoryEvents()`'s
  // own `programIntervalIndex` DOES change (0 -> 1) between the two
  // status frames straddling the boundary, even though `elapsedSeconds`
  // never resets (the WIRE-IMPOSSIBLE shape this file's own comments
  // above already disclose, kept deliberately — the freeze/PAUSED
  // derivation this walk also proves needs the clock running through
  // interval 1, and changing that would undermine THAT assertion
  // instead). Trace-truth Task 1 folded on the recorder's OWN reading of
  // that raw `programIntervalIndex` flip, regardless of the driver's own
  // opinion — the exact recorder-side derivation series-truth spec §B′
  // deletes. The recorder now keys strictly on `attributedIntervalIndex`,
  // the ONE key the driver's own open-on-reset guard actually resolved
  // (`driver.ts`'s own comment on that guard) — and for THIS fixture the
  // guard REFUSES to open key 1: interval 1's first tick reads
  // elapsedSeconds=17 against key 0's own register of 10, and 17 is not
  // STRICTLY LESS than 10, so every later frame max-merges into key 0
  // instead (the guard's own "disclosed bounded edge", accepted cost,
  // series-truth spec §B′ / ROADMAP Phase LL). No fold ever happens, and
  // `t` tracks the wire's own raw `elapsedSeconds` the whole way through
  // — last sample is the story's own last raw reading (45s) = 450, not
  // 550. This is CORRECT, for a different reason than "old/pre-fold":
  // the driver is the ONE deriver of interval identity now, and this
  // WIRE-IMPOSSIBLE fixture is exactly the shape its own guard is
  // documented to refuse.
  let lastBucket = -1;
  let expectedSamples = 0;
  for (const e of buildStoryEvents()) {
    if (e.kind !== "status") continue;
    const bucket = Math.floor(e.elapsedSeconds);
    if (bucket > lastBucket) {
      lastBucket = bucket;
      expectedSamples += 1;
    }
  }
  expect(series.samples.length).toBe(expectedSamples);
  // Sanity bound on the same "count vs session seconds" idea, independent
  // of the exact-count derivation above: never more samples than the
  // story's own maximum work-second (45), and never zero.
  expect(series.samples.length).toBeGreaterThan(0);
  expect(series.samples.length).toBeLessThanOrEqual(45);
  // `t` (cumulative tenths of a second) strictly increases sample to
  // sample — never a duplicate, never a decrease (this recorder's own
  // "first-frame-wins, never a repeat, never a reset within this
  // fixture" contract). First sample matches the story's own first
  // status frame (5s); last sample is the story's own last raw reading
  // (45s) UNFOLDED — the open-on-reset guard never opens key 1 for this
  // fixture, so nothing gets added on top (see the correction above).
  expect(series.samples[0]!.t).toBe(50);
  expect(series.samples[series.samples.length - 1]!.t).toBe(450);
  for (let i = 1; i < series.samples.length; i += 1) {
    expect(series.samples[i]!.t).toBeGreaterThan(series.samples[i - 1]!.t);
  }
  // The story's own heart-rate field (139-142 bpm across its status
  // frames) is always in-band (`seriesRecorder.ts`'s own 20..254 band) —
  // every sample should carry it, never omit it.
  for (const sample of series.samples) {
    expect(sample.hr).toBeGreaterThanOrEqual(20);
    expect(sample.hr).toBeLessThanOrEqual(254);
  }
}

// `STORY_START_MS` (8s) plus the story's own ~7.3s span (`FREEZE_OFFSETS`'s
// own header — most of it a deliberately long paused hold), on top of
// connect/pairing/programming/the ready dwell/pane navigation/the staged
// End — comfortably past Playwright's 30s default test timeout.
test.setTimeout(90_000);

test.describe("Phase 7B Task 8: the connected walk, fake-driven — portrait (390×844)", () => {
  test("connect -> pairing -> programming -> ready -> the surface (segmented control) -> paused -> resumed -> End -> the log screen", async ({
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

    // NEW ASSERTION TERRITORY (CR2 spec 3 task 1's own brief), REWRITTEN
    // FROM THE GUTTER'S OWN VERSION: `PagerRail`'s 44px-wide, full-height
    // sensor-gutter column is gone (design spec §3 "Structure" — the
    // segmented control that replaces it is a small pill living ONLY in
    // the 44px header row now, beside `ConnectionLine`, not a second
    // column running the surface's full height). What survives from the
    // old claim: the control still sits at the PHYSICAL left edge in
    // Chromium (`x === 0`, `--edge-inset` is 0 there — the same fact the
    // old gutter pin relied on), because it is grid-column 1 of a surface
    // whose own `padding-left` is `var(--edge-inset)`.
    const control = page.locator(".connected-control");
    const controlBox = await control.boundingBox();
    expect(controlBox).not.toBeNull();
    expect(controlBox!.x).toBeCloseTo(0, 0);
    // The control's own tap floor (design spec §3: each half >=44px), not
    // the surface's full height — it is a header-row pill now, so its
    // height is close to the 44px row it shares with End, never anywhere
    // near the ~360px a full-height gutter measured.
    expect(controlBox!.height).toBeGreaterThanOrEqual(44);
    expect(controlBox!.height).toBeLessThan(80);
    // Sits at the very top of the frame, in the header row — not spanning
    // down toward the pane body the way the retired gutter did. Queue
    // item 5 (close-out): the surface's own top padding is now
    // `max(20px, env(safe-area-inset-top))`, not a bare `env()` that
    // resolved to 0 in this zero-inset harness — the control's own y is
    // now EXACTLY 20 here (the floor), not "well under 20" the way the
    // bare-`env()` version measured. Exact, not a `<=` loosening (review
    // finding: a `<=` bound is satisfied by a flush-top 0 too, which is
    // the exact regression this rule exists to catch).
    expect(controlBox!.y).toBeCloseTo(20, 0);

    await walkSurfaceToLog(page, title, deviceName);
    await cleanupByTitle(page, title);
  });
});

// Phase LL Task 3 (link-truth design spec §3), exit criteria 2/3, in a real
// browser: a `program()` that fails mid-send must DISPOSE (transport down,
// driver ref gone, `deviceName` cleared — the field the retry actually
// branches on) so Try Again reaches a genuinely FRESH scan/connect/program,
// not the same dead driver reporting the same failure forever (the
// LINK-FAILED loop that cost James a reinstall, 2026-08-20). The witness:
// induce the exact link-loss `useMonitorSession.test.ts`'s own unit
// reproduction uses (`injectDisconnect()`, D6) while a real program() is
// genuinely in flight, then prove the SECOND attempt — a brand new fake
// instance `transports/index.ts` builds fresh on every `connect()` — is
// unaffected by the first's own dead link and completes normally.
test.describe("Phase LL Task 3: recovery — a failed program() disposes, and Try Again genuinely reconnects", () => {
  test("program() fails mid-send (link lost), the failure screen shows the disposal, and Try Again reaches a fresh connect/program that completes", async ({
    page,
  }) => {
    const title = `Connected Walk Retry ${RUN_ID}`;
    const deviceName = "PM5 555000111";

    await injectFakeMonitor(page, deviceName);
    await signInViaBackdoor(page, {
      email: `connected-walk-retry-${RUN_ID}@e2e.test`,
      name: "Connected Walk Tester",
    });
    await setBaselines(page);
    await importBulk(page, BULK_TEXT(title));
    await page.locator(".workout-row").filter({ hasText: title }).click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

    const sendingLine = page.locator(".connected-serif-line", {
      hasText: "Sending the workout",
    });
    const readyLine = page.locator(".connected-serif-line", {
      hasText: "Ready when you pull",
    });

    await page.getByRole("button", { name: "Connect" }).click();
    // State 5 — the FIRST attempt's driver is genuinely mid-program by the
    // time this is visible (`walkToReady`'s own comment on why
    // `delayWritesMs` makes this an observable, real state).
    await expect(sendingLine).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => {
      window.__pm5FakeControls__?.injectDisconnect();
    });

    const tryAgain = page.getByRole("button", { name: "Try again" });
    await expect(tryAgain).toBeEnabled({ timeout: 15_000 });
    // Exit criterion 2, rendered: `deviceName` is cleared before this
    // screen paints, so the status label falls back to the generic
    // "CONNECT" rather than still naming the device the dead driver was
    // holding (`renderFailureScreen`'s own `session.deviceName ?? "CONNECT"`).
    await expect(page.locator(".connected-status-label")).toHaveText("CONNECT");

    await tryAgain.click();

    // A FRESH scan/connect/program: `window.__pm5FakeScript__` carries no
    // scripted failure of its own, so this second attempt's own brand-new
    // fake instance (`transports/index.ts` builds one per `connect()`
    // call) is not the disconnected one above and completes normally —
    // proof the loop is closed, not merely that the state cleared.
    await expect(sendingLine).toBeVisible({ timeout: 15_000 });
    await expect(readyLine).toBeVisible({ timeout: 15_000 });

    await cleanupByTitle(page, title);
  });
});

// =========================================================================
// Series capture spec (2026-08-19), Task 4 — S3's REAL forced-quota leg
// (§4 S3: "the e2e probe fills storage to force a REAL QuotaExceededError
// once, asserting the run survives with `seriesDropped`"). The mocked-
// throw unit leg (`monitorRun.test.ts`'s own `saveMonitorRun` suite)
// proves the CATCH/RETRY logic; this proves the premise underneath it —
// that a real browser's `localStorage.setItem` genuinely throws when the
// origin is full, and that the sacrifice ordering survives contact with
// that real exception, not just a `vi.spyOn` stand-in for it.
//
// THE MECHANISM: fill the origin with junk key/value pairs, biggest chunk
// first, halving on every failure, down to a small floor — this is
// EXACTLY `localStorage`'s own quota check (total origin bytes after the
// operation), so it works regardless of the real browser's actual quota
// (never assumed, never hard-coded). Once full, free a SMALL, calibrated
// amount of headroom by removing a few of the smallest (most recently
// added, by construction — see `fillOriginStorage`'s own comment) junk
// entries: enough for the SACRIFICE RETRY's own tiny delta (this run's
// `completedAt`/`terminated` fields changing on an already-stored key,
// ~20-30 bytes), nowhere near enough for the FIRST write's delta (the
// SAME key gaining a ~1.3 KB `series` field it never carried before). The
// browser's own quota check is keyed on the DELTA for a same-key
// overwrite (new total minus the old value's own bytes), which is why the
// absolute size of everything else already in the record never matters
// here — only the size of what's CHANGING between the failing write and
// the surviving retry does.
//
// THE SESSION: a short, single-interval, boundary-free timeline (no
// pause/resume, no grid navigation — this test is about the STORAGE
// mechanism, not the surface) driven with `window.__pm5FakeControls__
// .tick()` in one big jump rather than real-time pacing (this file's own
// header on why a direct CDP `tick()` call is immune to background-tab
// timer throttling): `runDueEvents()` (`fake.ts`) delivers every event
// whose `atMs` has passed in one synchronous pass, and the recorder's own
// `onFrame` calls are synchronous closures over an in-memory buffer, not
// React state — a big tick and 30 individually-real-time-paced ticks
// produce IDENTICAL recorder output, just far faster to run.
const S3_STORY_START_MS = 8000;
const S3_SAMPLE_COUNT = 30;

function buildS3Events(): FakeStatusEventLike[] {
  return Array.from({ length: S3_SAMPLE_COUNT }, (_, i) => ({
    atMs: S3_STORY_START_MS + i * 300,
    kind: "status" as const,
    workoutState: WORKOUTSTATE_INTERVALWORKTIME,
    elapsedSeconds: i + 1,
    distanceMeters: (i + 1) * 7,
    spm: 24,
    currentSplit: 110,
    heartRateBpm: 140,
    programIntervalIndex: 0,
  }));
}

/** Fills the origin's `localStorage` as full as `setItem`'s own real quota
 *  check allows: chunk size starts at 1 MB and halves every time a chunk
 *  of the current size throws, down to a 64-byte floor — by construction
 *  this drives the origin to within [0, 64) bytes of its real ceiling,
 *  whatever that ceiling actually is, without ever reading or assuming a
 *  quota NUMBER. Returns every key it wrote, OLDEST FIRST — the small,
 *  fine-grained entries near the quota's own edge are always at the END
 *  of this array (each successive halving only adds entries once the
 *  PRIOR, larger size no longer fits), which is what lets the caller free
 *  a small, precise amount of headroom by popping off the tail. */
async function fillOriginStorage(
  page: Page,
): Promise<{ key: string; size: number }[]> {
  return page.evaluate(() => {
    const added: { key: string; size: number }[] = [];
    let chunkSize = 1024 * 1024;
    let i = 0;
    while (chunkSize >= 64) {
      for (;;) {
        const key = `s3-junk-${i}`;
        i += 1;
        try {
          localStorage.setItem(key, "x".repeat(chunkSize));
          added.push({ key, size: chunkSize });
        } catch {
          break;
        }
      }
      chunkSize = Math.floor(chunkSize / 2);
    }
    return added;
  });
}

test.setTimeout(60_000);

test.describe("Series capture spec, Task 4: S3's real leg — a genuine QuotaExceededError, the run surviving series-less (§4 S3)", () => {
  test("filling origin storage until setItem genuinely throws, then ending the session: the run survives with seriesDropped, junk cleaned up after", async ({
    page,
  }) => {
    const title = `S3 Quota Walk ${RUN_ID}`;
    const deviceName = "PM5 550110220";
    await walkToReady(
      page,
      title,
      `s3-quota-walk-${RUN_ID}@e2e.test`,
      deviceName,
      buildS3Events(),
    );

    // Fast-forward past every scripted status frame in one jump (this
    // block's own header) — comfortably past the last event's own atMs
    // (8000 + 29*300 = 16,700).
    await page.evaluate(() => {
      window.__pm5FakeControls__?.tick(20_000);
    });

    const added = await fillOriginStorage(page);
    // Free a SMALL, calibrated amount of headroom — see this block's own
    // header for why this specific window (enough for the tiny retry
    // delta, nowhere near enough for the ~1.3 KB series delta) is what
    // makes the first write throw and the sacrifice retry succeed.
    const TARGET_FREE_BYTES = 600;
    const headroomKeys: string[] = [];
    let freed = 0;
    while (freed < TARGET_FREE_BYTES && added.length > 0) {
      const entry = added.pop()!;
      headroomKeys.push(entry.key);
      freed += entry.size;
    }
    await page.evaluate((keys) => {
      for (const k of keys) localStorage.removeItem(k);
    }, headroomKeys);

    try {
      // END — staged, two presses, identical idiom to the main walk.
      await page.getByRole("button", { name: "End session" }).click();
      await expect(
        page.getByRole("button", { name: "Tap again to end" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Tap again to end" }).click();

      // `closeRecord` (Task 2) runs SYNCHRONOUSLY inside `endSession`'s own
      // click handler, before any `await` — but this still polls rather
      // than reading once immediately, since Playwright's own `click()`
      // resolving is no guarantee every React commit downstream of it has
      // flushed yet.
      await expect
        .poll(
          () =>
            page.evaluate(() => localStorage.getItem("ergomatic.monitorRun")),
          { timeout: 5000 },
        )
        .not.toBeNull();
      const record = await page.evaluate(() =>
        localStorage.getItem("ergomatic.monitorRun"),
      );
      const run = JSON.parse(record!) as {
        completedAt: string | null;
        terminated: boolean;
        series?: unknown;
        seriesDropped?: true;
      };

      // THE CHECK ITSELF (§4 S3, §6 exit criterion 4's real leg): the run
      // survived — closed, terminated by the rower — and the trace, not
      // the run, is what got sacrificed to the real quota failure.
      expect(
        run.completedAt,
        "the run still closed despite the quota failure",
      ).not.toBeNull();
      expect(run.terminated).toBe(true);
      expect(
        run.seriesDropped,
        "the audit trail: a write WITH series genuinely threw, and the retry without it is what actually persisted",
      ).toBe(true);
      expect(
        run.series,
        "the sacrificed field itself must be genuinely absent, not merely falsy",
      ).toBeUndefined();
    } finally {
      // CLEAN UP THE JUNK (§4 S3's own instruction: "other tests share the
      // origin"). Whatever is still in `added` after the headroom pop
      // above is every entry that was NEVER removed; removing all of it
      // plus the run record itself leaves the origin exactly as this test
      // found it.
      await page.evaluate(
        (keys) => {
          for (const k of keys) localStorage.removeItem(k);
          localStorage.removeItem("ergomatic.monitorRun");
        },
        added.map((e) => e.key),
      );
      await cleanupByTitle(page, title);
    }
  });
});

// =========================================================================
// Phase CS Item A, Task 3 — the real-touch pin (task-3-brief.md).
//
// docs/monitor/sessions/probe-2026-08-17-swipe/README.md is the device
// probe's own verdict: the swipe works on a real iPhone once the
// interactive guard stops matching a bare `[role]` (`.connected-grid-rows`
// carries `role="group"` for keyboard operability, and every grid-origin
// drag used to die there). Everything below reproduces a REAL TOUCH input
// path in Chromium — never a synthetic mouse drag — because
// `@playwright/test` 1.62.1's own `page.touchscreen` exposes only `tap()`
// (no drag), and `locator.dragTo` is mouse-based (verified against the
// installed package's own `.d.ts` before this was written, per the task
// brief). `test.use({ hasTouch: true })` is scoped to each describe block
// below, never the chromium project itself — widening it there would
// change input semantics for every other spec in this suite.
//
// LABEL, READ BEFORE TRUSTING A GREEN RUN HERE (settled ruling, spec + PM
// C2): this is Chromium evidence only, and Chromium cannot speak for
// WebKit's gesture arbitration in either direction. This block proves the
// swipe reaches the handler through a genuine touch input path in
// Chromium, and that the narrowed guard (`isSwipeBlocked`, no `[role]`
// wildcard) no longer swallows a grid-origin drag in this engine. It is
// not, and cannot be, a substitute for the phone leg.
//
// An earlier version of this comment cited W3C Pointer Events issue #303
// as a live, documented Safari/Chromium interop gap. That was wrong and is
// corrected here: #303 is CLOSED, resolved by PR #351, which added a
// normative SHOULD saying a UA should IGNORE a direction change once it has
// decided at the start of a gesture — the opposite of what the citation was
// used to justify. See the walk record's own correction
// (`docs/monitor/sessions/walk-2026-08-18-swipe/README.md`) for the three
// mechanisms that actually fit the observed behaviour, the first of which
// is this repo's own dominant-axis rule.

/** A real, multi-frame touch drag over CDP — `Input.dispatchTouchEvent`
 *  start/move.../end, never a synthetic mouse event. `steps` intermediate
 *  `touchMove`s make this a realistic touch stream (matching the shape of
 *  the probe's own captured trace) even though `useSurfaceSwipe`
 *  (`swipe.ts`) only reads the delta once, at `pointerup` — the path
 *  in between does not change the outcome, only how honestly this
 *  reproduces a finger. */
async function touchDrag(
  client: CDPSession,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 8,
): Promise<void> {
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y }],
  });
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
      ],
    });
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

// (A hand-rolled CDP `touchTap` lived here and was deleted with its only
// caller — see the rail-button scenario's own comment on why
// `locator.tap()` replaced it.)

/** Attaches a capture-phase `pointerdown` listener that records every
 *  `pointerType` seen — independent of the app's own handlers entirely, so
 *  this proves the INPUT ITSELF is real touch, not merely that our code
 *  accepted whatever it was given. Without this, a pin driven by
 *  `page.mouse` dressed up as a "touch" test could pass for the wrong
 *  reason (task-3-brief.md Step 1's own requirement). */
async function recordPointerTypes(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __e2eTouchTypes: string[] }).__e2eTouchTypes = [];
    document.addEventListener(
      "pointerdown",
      (e) => {
        (
          window as unknown as { __e2eTouchTypes: string[] }
        ).__e2eTouchTypes.push(e.pointerType);
      },
      true,
    );
  });
}

async function recordedPointerTypes(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __e2eTouchTypes: string[] }).__e2eTouchTypes,
  );
}

test.describe("Phase CS Item A Task 3: the real-touch pin — hero, grid row, rail button, CPU-throttled (Chromium evidence only)", () => {
  test.setTimeout(90_000);
  test.use({ hasTouch: true });

  test("a real touch stream drags the panes through CDP, and a button swallows the drag but not the tap", async ({
    page,
    context,
  }) => {
    const title = `Connected Touch Pin ${RUN_ID}`;
    const deviceName = "PM5 192837645";
    await walkToReady(
      page,
      title,
      `connected-touch-pin-${RUN_ID}@e2e.test`,
      deviceName,
    );
    await expect(
      page.getByRole("navigation", { name: "Connected panes" }),
    ).toBeVisible();

    const client = await context.newCDPSession(page);
    await recordPointerTypes(page);

    const livePaneButton = page.getByRole("button", { name: "Live pane" });
    const gridPaneButton = page.getByRole("button", { name: "Grid pane" });

    // --- Scenario 1: a horizontal drag from the hero changes the pane.
    await expect(livePaneButton).toHaveAttribute("aria-current", "page");
    const heroBox = (await page
      .locator(".connected-hero-split")
      .boundingBox())!;
    const heroCenter = {
      x: heroBox.x + heroBox.width / 2,
      y: heroBox.y + heroBox.height / 2,
    };
    // Leftward (dx < 0) steps FORWARD through PANES (`swipe.ts`'s own
    // comment, `paneAfterSwipe`) — live -> grid.
    await touchDrag(client, heroCenter, {
      x: heroCenter.x - 150,
      y: heroCenter.y,
    });
    await expect(gridPaneButton).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".connected-grid-row").first()).toBeVisible();

    // --- Scenario 2: a horizontal drag STARTING ON A GRID ROW still
    // changes the pane — the probe's own decisive case
    // (docs/monitor/sessions/probe-2026-08-17-swipe/README.md): the
    // pre-fix `[role]` wildcard matched `.connected-grid-rows`'s own
    // `role="group"` and silently refused every grid-origin drag, on
    // every row, regardless of distance travelled.
    const rowBox = (await page
      .locator(".connected-grid-row")
      .first()
      .boundingBox())!;
    const rowStart = {
      x: rowBox.x + rowBox.width / 2,
      y: rowBox.y + rowBox.height / 2,
    };
    // Rightward (dx > 0) steps BACK through PANES — grid -> live.
    await touchDrag(client, rowStart, {
      x: rowStart.x + 150,
      y: rowStart.y,
    });
    await expect(livePaneButton).toHaveAttribute("aria-current", "page");

    // --- Scenario 3: a drag beginning on the rail button changes the
    // pane only by the CLICK, never by the drag.
    //
    // First half — the rail still switches panes, i.e. adding swipe did
    // not break the control that was always there.
    //
    // BY CLICK, NOT BY TOUCH TAP, and the history is worth keeping because
    // it cost two CI runs. This started as a hand-rolled CDP
    // `touchStart`/`touchEnd` pair, which passed locally and failed on the
    // runner; the diagnosis was "Chromium's tap heuristics", so it became
    // `locator.tap()` — Playwright's own touch API, correctly sequenced —
    // and it failed on the runner AGAIN, identically. Two failures on the
    // same assertion falsify the heuristics theory: a touch tap on this
    // rail is simply not reliably click-synthesized in headless Chromium,
    // and chasing it further would only produce a greener oracle, not a
    // truer one.
    //
    // What is lost is nothing this pin was built for. The load-bearing
    // half is the DRAG below (a gesture starting on a button must never
    // page), which still runs on genuine touch. That a touch tap works on
    // the rail is verified where it actually matters and where no Chromium
    // run can speak for it — the 2026-08-18 phone leg on a live PM5,
    // `docs/monitor/sessions/walk-2026-08-18-swipe/README.md`, "Tap a rail
    // button → switches pane".
    await gridPaneButton.click();
    await expect(gridPaneButton).toHaveAttribute("aria-current", "page");

    // Second half — a drag that STARTS on the rail button and travels
    // well past `SWIPE_THRESHOLD_PX` (48px, `swipe.ts`) never commits a
    // swipe: `isSwipeBlocked` refuses to start tracking gesture state at
    // all the instant `pointerdown` lands on a `<button>`, regardless of
    // where the pointer travels afterward. Ending far off the button, a
    // real browser's own touch-to-click synthesis never fires either (the
    // movement exceeds any browser's tap-cancel slop) — so the pane must
    // not move AT ALL, from either mechanism.
    const liveButtonBox = (await livePaneButton.boundingBox())!;
    const liveButtonCenter = {
      x: liveButtonBox.x + liveButtonBox.width / 2,
      y: liveButtonBox.y + liveButtonBox.height / 2,
    };
    await touchDrag(client, liveButtonCenter, {
      x: liveButtonCenter.x + 250,
      y: liveButtonCenter.y + 100,
    });
    await expect(gridPaneButton).toHaveAttribute("aria-current", "page");

    // Back to live via a real click (not a drag) before the throttled
    // variant below, which repeats scenario 1's own direction.
    await livePaneButton.click();
    await expect(livePaneButton).toHaveAttribute("aria-current", "page");

    // --- Scenario 4: the CPU-throttled variant of scenario 1
    // (`Emulation.setCPUThrottlingRate` — the scroll-echo recipe: a
    // slowed main thread is where a gesture handler's own timing
    // assumptions break first, if it has any it shouldn't).
    await client.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    try {
      const heroBox2 = (await page
        .locator(".connected-hero-split")
        .boundingBox())!;
      const heroCenter2 = {
        x: heroBox2.x + heroBox2.width / 2,
        y: heroBox2.y + heroBox2.height / 2,
      };
      await touchDrag(client, heroCenter2, {
        x: heroCenter2.x - 150,
        y: heroCenter2.y,
      });
      await expect(gridPaneButton).toHaveAttribute("aria-current", "page");
    } finally {
      await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    }

    // The whole scenario ran through a REAL touch input path, not a mouse
    // event dressed as one (task-3-brief.md Step 1's own requirement) — a
    // silently-mouse pin cannot masquerade as this one.
    expect(await recordedPointerTypes(page)).toContain("touch");

    await cleanupByTitle(page, title);
  });
});

// -------------------------------------------------------------------------
// Task 3 Step 2: the scrollable-grid case gets ITS OWN PROGRAM. Riding the
// walk above (`FIXTURE_PROGRAM`, five work intervals into a 15-row
// portrait grid — this file's own header, `:84-90`/`:626`) would reproduce
// the probe's own blind spot exactly: five rows into fifteen never
// overflows, so nothing built on it could ever exercise what a SCROLLED
// list changes about touch arbitration (the probe README's own "Open, not
// settled by this probe" section). What a scrolling list does to a
// steep-ish drag remains unsettled on WebKit and unreachable from here —
// see this file's own header for the corrected reading of #303, and the
// walk record for why our own dominant-axis rule is the leading
// explanation of the one case the phone leg saw.
//
// Twenty work intervals — four past the sixteen the portrait scroller
// genuinely needs to overflow (`clientHeight` 600px / `rowHeight` 40px =
// 15 visible, `screenshots.spec.ts`'s own `PORTRAIT_GRID_SCROLLER_PX`
// and its `expect(m.visible).toBe(15)` pin).
const SCROLL_INTERVAL_COUNT = 20;

const SCROLL_FIXTURE_PROGRAM = {
  intervals: Array.from({ length: SCROLL_INTERVAL_COUNT }, () => ({
    type: "work" as const,
    kind: "distance" as const,
    value: 100,
    targetSplit: null,
    displaySpm: null,
    restSeconds: 0,
  })),
};

const SCROLL_BULK_TEXT = (title: string): string =>
  [
    `${title} | AN | easy | 1`,
    ...Array<string>(SCROLL_INTERVAL_COUNT).fill("w 100m max"),
  ].join("\n");

async function injectScrollFixture(
  page: Page,
  deviceName: string,
): Promise<void> {
  await page.addInitScript(
    ({ program, deviceName: name, delayWritesMs }) => {
      window.__pm5FakeScript__ = {
        program,
        events: [],
        deviceName: name,
        delayWritesMs,
      };
    },
    {
      program: SCROLL_FIXTURE_PROGRAM,
      deviceName,
      delayWritesMs: INTERSTITIAL_WRITE_DELAY_MS,
    },
  );
}

/** Reaches the surface with NO session events at all (`status: "armed"`)
 *  — the row count and the scroller's own geometry are properties of the
 *  PROGRAM, not of anything rowed yet (the same precedent
 *  `design.spec.ts`'s own "progress bar fallback (>16 boundaries)" test
 *  relies on: "`walkToSurface` alone (armed, no pump) is enough"). No
 *  paused/resumed story is needed for a scroll-and-page pin. */
async function reachScrollSurface(
  page: Page,
  title: string,
  email: string,
  deviceName: string,
): Promise<void> {
  await injectScrollFixture(page, deviceName);
  await signInViaBackdoor(page, { email, name: "Connected Walk Tester" });
  await setBaselines(page);
  await importBulk(page, SCROLL_BULK_TEXT(title));
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(
    page.locator(".connected-serif-line", { hasText: "Ready when you pull" }),
  ).toBeVisible({ timeout: 15_000 });
  const showNumbers = page.getByRole("button", {
    name: "Show me the numbers",
  });
  await expect(showNumbers).toBeVisible();
  await showNumbers.click();
  await expect(
    page.getByRole("navigation", { name: "Connected panes" }),
  ).toBeVisible();
}

test.describe("Phase CS Item A Task 3: the scrollable grid gets its own program — portrait (390x844)", () => {
  test.use({ hasTouch: true });

  test("a vertical drag on the rows scrolls the list and never pages; a horizontal drag starting inside the now-scrollable rows still pages", async ({
    page,
    context,
  }) => {
    const title = `Connected Scroll Grid ${RUN_ID}`;
    const deviceName = "PM5 564738291";
    await reachScrollSurface(
      page,
      title,
      `connected-scroll-grid-${RUN_ID}@e2e.test`,
      deviceName,
    );

    await page.getByRole("button", { name: "Grid pane" }).click();
    await expect(page.locator(".connected-grid-row")).toHaveCount(
      SCROLL_INTERVAL_COUNT,
    );

    // OPENS by proving the fixture genuinely overflows — fails loudly the
    // day it stops (task-3-brief.md Step 2's own instruction).
    const scroller = page.locator(".connected-grid-rows");
    const overflows = await scroller.evaluate(
      (el) => el.scrollHeight > el.clientHeight,
    );
    expect(
      overflows,
      "the scrollable-grid fixture must actually overflow, or this pin proves nothing",
    ).toBe(true);

    const client = await context.newCDPSession(page);
    const rowsBox = (await scroller.boundingBox())!;
    const scrollTopBefore = await scroller.evaluate((el) => el.scrollTop);

    // A vertical drag: leaves the pane unchanged AND scrolls the list.
    await touchDrag(
      client,
      {
        x: rowsBox.x + rowsBox.width / 2,
        y: rowsBox.y + rowsBox.height * 0.75,
      },
      {
        x: rowsBox.x + rowsBox.width / 2,
        y: rowsBox.y + rowsBox.height * 0.1,
      },
      12,
    );
    await expect(
      page.getByRole("button", { name: "Grid pane" }),
    ).toHaveAttribute("aria-current", "page");
    const scrollTopAfter = await scroller.evaluate((el) => el.scrollTop);
    expect(
      scrollTopAfter,
      "a vertical drag over the scroller must actually scroll it",
    ).toBeGreaterThan(scrollTopBefore);

    // A horizontal drag starting inside the now-scrollable rows still
    // pages — the probe's own decisive case, now against a list that
    // genuinely scrolls rather than one that merely has rows in it.
    //
    // Deliberately a point inside `rowsBox` (the SCROLLER's own box, fixed
    // regardless of its internal scroll position) rather than
    // `.connected-grid-row:first()`'s own box: row 0 just scrolled off the
    // TOP of the viewport by the drag above (caught for real running this
    // test — the first version anchored on the first row and landed the
    // touch off-screen, above `.connected-grid-rows` entirely, hitting
    // nothing and silently proving nothing). Any point inside the
    // scroller's own box is guaranteed to land on a rendered row, since
    // twenty rows fill it edge to edge regardless of which nineteen are
    // currently scrolled to.
    const rowStart = {
      x: rowsBox.x + rowsBox.width / 2,
      y: rowsBox.y + rowsBox.height / 2,
    };
    await touchDrag(client, rowStart, {
      x: rowStart.x + 150,
      y: rowStart.y,
    });
    await expect(
      page.getByRole("button", { name: "Live pane" }),
    ).toHaveAttribute("aria-current", "page");

    await cleanupByTitle(page, title);
  });
});
