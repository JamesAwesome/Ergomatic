import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInViaBackdoor, stableBoundingBox } from "./helpers";
import { LIBRARY_WORKOUTS } from "../server/seed/library/index.js";
import type { Step, WorkoutType } from "../domain/types.js";
import { compileProgram } from "../domain/monitor/program.js";
import type { WorkoutProgram } from "../domain/monitor/program.js";
import type { IntervalActual } from "../domain/monitor/types.js";
import { buildDraft, startDraft } from "../src/session/draft";
import { buildRun } from "../src/session/engine";
import { buildLogSeed } from "../src/session/logDraft";
import { MONITOR_RUN_KEY, type MonitorRun } from "../src/monitor/monitorRun";

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
          // Required since the v0.35.0 sunset: the member the server
          // derived for a stopwatch step with no device.
          source: "timer",
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

// From-the-log spec (2026-08-18), Task 6: unlike `seedLogs` above (a fake
// title, no heroes, no reflection), the from-the-log sweep below needs the
// FULL row this spec actually adds — a real library title (recurring-
// failure #3: "test against a realistic fixture"), all three stored
// heroes, and all four reflection fields answered, so §5B/§5C/§5D/§5G
// each have something real to render rather than degrading to their own
// absence idiom. Returns the created row's own id.
async function postFromLogFixture(page: Page): Promise<string> {
  const seaFret = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret")!;
  const result = await page.evaluate(
    async (workout) => {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutId: null,
          workoutTitle: workout.title,
          workoutType: workout.type,
          held: "held",
          pain: 2,
          thumbs: "up",
          notes: "Felt strong through the back half.",
          avgSplitSeconds: 124.5,
          distanceMeters: 5000,
          timeSeconds: 1500,
          steps: [
            {
              label: "Work",
              targetSplit: 125,
              actualSplit: 124,
              actualSource: "pm5",
            },
          ],
          advancesPlan: false,
          // Required since the v0.35.0 sunset: no `deviceName` on this
          // fixture, so the server derived `manual` for it (device name
          // wins, else a stopwatch step, else by hand) and the row read
          // LOGGED BY HAND — the same provenance it keeps here.
          source: "manual",
        }),
      });
      return { ok: res.ok, status: res.status, body: await res.text() };
    },
    { title: seaFret.title, type: seaFret.type },
  );
  if (!result.ok) {
    throw new Error(
      `from-the-log fixture seed failed: ${result.status} ${result.body}`,
    );
  }
  return (JSON.parse(result.body) as { id: string }).id;
}

// Phase LT spec 1, Task 4 (witness sweep): the same four-row §1/§2 mixed
// set `e2e/screenshots.spec.ts`'s own "log-detail" capture builds and
// proves by hand in its own comment (row 1 target 130/actual 120 ->
// −10.0 faster, spm 24/22; row 2 target 130/actual 140 -> +10.0 slower,
// spm 26/22; row 3 target 118/actual 118 -> 0.0, inside the ±0.5s band ->
// ON-TARGET, the OLD pre-split spm shape — `spm` holds the measured
// value, no `actualSpm` key, so it renders measured-only with no target
// half; row 4 no `targetSplit` at all -> the abstained effort row, spm
// 28 measured-only). Reused verbatim rather than re-derived (that file's
// own arithmetic already stands, cited not repeated) — this fixture's
// only job here is task-3-report.md's own note: give this task's
// COMPUTED-STYLE layer (the layer no existing e2e assertion reaches, live
// `getComputedStyle`, not text/class-name presence) something real to
// read. Returns the created row's own id.
async function postJudgmentMixLog(page: Page): Promise<string> {
  const result = await page.evaluate(async () => {
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutId: null,
        workoutTitle: "Sea Fret",
        workoutType: "O2",
        deviceName: "PM5 432331249",
        source: "pm5",
        held: "under",
        pain: 3,
        thumbs: "up",
        notes: null,
        avgSplitSeconds: 119.5,
        timeSeconds: 478,
        distanceMeters: 2000,
        advancesPlan: false,
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
            // The pre-split shape: no `actualSpm` key at all — `spm`
            // holds the OLD measured value (exit criterion 3's own
            // row-local discriminant, `spmIsMeasured`).
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
      }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  });
  if (!result.ok) {
    throw new Error(
      `judgment-mix fixture seed failed: ${result.status} ${result.body}`,
    );
  }
  return (JSON.parse(result.body) as { id: string }).id;
}

// Trace-rendering spec (Phase LT spec 3), Task 3: a plausible multi-
// interval `series` for the design sweep's own structural witnesses
// (token colors, contrast, tap targets, the accessible description, the
// absence of boundary marks) — none of which need a device-realistic wire
// capture (Task 1/2's own job, already proven there against a real
// recording); this fixture's only job is giving the CHART something real
// to draw, POSTed straight into the stored row the same hand-built way
// `postJudgmentMixLog` above already builds its own `steps`. One real
// wire second per sample (§3's own recorder cadence — `t` increments of 1
// keep every consecutive gap under the 3 s break threshold, so this draws
// as ONE continuous line, not a fragmented scatter), pace descending
// smoothly 140s -> 112s/500m (so "faster is up" has a real shape to
// check, and "fastest"/"at the end" coincide, monotonic by construction),
// stroke rate and heart rate climbing alongside — all three toggle
// measures end up with real readings, so every one of them renders.
function traceLogSeries(): {
  samples: { t: number; d: number; p: number; spm: number; hr: number }[];
} {
  const samples: {
    t: number;
    d: number;
    p: number;
    spm: number;
    hr: number;
  }[] = [];
  for (let i = 0; i <= 40; i++) {
    const pace = 140 - Math.round(i * 0.7); // 140 -> 112, monotonic
    const spm = 22 + Math.round(i / 7); // 22 -> 28
    const hr = 128 + Math.round(i * 0.6); // 128 -> 152
    samples.push({ t: i * 10, d: i * 4, p: pace * 10, spm, hr });
  }
  return { samples };
}

// trace-truth Task 2 (spec §3): a variant of `traceLogSeries` above
// carrying a real, non-frozen rest run — 5 consecutive samples (i in
// 15..19) marked `r: true`, values still real (the pace/spm/hr keep
// advancing per the same formulas, never frozen or zeroed: §3's own
// "the pace value during a rest is real but not meaningful"). `t` stays
// one-second-apart throughout (same cadence as the base fixture), so the
// rest introduces no gap of its own — the polyline must stay ONE
// continuous segment across it.
function traceLogSeriesWithRest(): {
  samples: {
    t: number;
    d: number;
    p: number;
    spm: number;
    hr: number;
    r?: true;
  }[];
} {
  const samples: {
    t: number;
    d: number;
    p: number;
    spm: number;
    hr: number;
    r?: true;
  }[] = [];
  for (let i = 0; i <= 40; i++) {
    const pace = 140 - Math.round(i * 0.7); // 140 -> 112, monotonic
    const spm = 22 + Math.round(i / 7); // 22 -> 28
    const hr = 128 + Math.round(i * 0.6); // 128 -> 152
    const rest = i >= 15 && i <= 19 ? { r: true as const } : {};
    samples.push({ t: i * 10, d: i * 4, p: pace * 10, spm, hr, ...rest });
  }
  return { samples };
}

async function postTraceLogFixture(
  page: Page,
  series: ReturnType<typeof traceLogSeries> = traceLogSeries(),
): Promise<string> {
  const seaFret = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret")!;
  const result = await page.evaluate(
    async ({ workout, series }) => {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutId: null,
          workoutTitle: workout.title,
          workoutType: workout.type,
          deviceName: "PM5 432331249",
          source: "pm5",
          held: "held",
          pain: 2,
          notes: null,
          avgSplitSeconds: 124.5,
          distanceMeters: 5000,
          timeSeconds: 1500,
          steps: [
            {
              label: "Work",
              targetSplit: 125,
              actualSplit: 124,
              actualSource: "pm5",
            },
          ],
          advancesPlan: false,
          series,
        }),
      });
      return { ok: res.ok, status: res.status, body: await res.text() };
    },
    {
      workout: { title: seaFret.title, type: seaFret.type },
      series,
    },
  );
  if (!result.ok) {
    throw new Error(
      `trace-chart fixture seed failed: ${result.status} ${result.body}`,
    );
  }
  return (JSON.parse(result.body) as { id: string }).id;
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
 *  landing directly on the countdown (fast-follow Task 4: ConfirmTargets is
 *  deleted, Start is the one door now). */
async function startFromLibrary(page: Page, title: string): Promise<void> {
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/session\/countdown$/);
}

/** SKIP the countdown, landing on the live timer. */
async function startAndSkipCountdown(page: Page): Promise<void> {
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
  // A single in-page $$eval pass: enumerate, filter and measure every
  // candidate synchronously inside the browser, so no DOM change (a route
  // transition unmounting the screen mid-sweep) can interleave between
  // resolving an element and measuring it. The previous version issued
  // three separate CDP round trips per element via re-querying Playwright
  // locators (`.all()` + `isVisible()` + `evaluate()` + `boundingBox()`),
  // any of which could land on a different node than the ones before it —
  // see docs/superpowers/research/2026-08-22-e2e-readiness-gate-flake.md.
  // A node that no longer exists by measurement time surfaced as a `null`
  // bounding box misattributed to whatever unrelated element the next
  // round trip happened to resolve, not a real violation. That failure
  // mode cannot occur here: a node excluded by the visibility filter below
  // (an empty client-rect list, i.e. detached or `display: none`) is never
  // measured, so there is no "missing bounding box" case left to report.
  const offenders = await page.$$eval(
    "a, button, [role=button], input, select",
    (nodes) =>
      nodes
        .filter((n) => {
          const el = n as HTMLElement;
          // Playwright's own isVisible(): non-empty box AND
          // visibility !== hidden.
          if (el.getClientRects().length === 0) return false;
          if (getComputedStyle(el).visibility === "hidden") return false;
          // The one narrow, already-documented exception (docs/design/
          // DEVIATIONS.md, "N/A — the handoff has no notion of a
          // 'convenience' tap area..."): StepCard.tsx's collapsed
          // `.step-card-line1` (326x18) and `.step-card-sub` (180x14)
          // each duplicate the fully-compliant 48x44 EDIT cell's own
          // onExpand action, in the same card, at less than 44x44 —
          // WCAG 2.5.8's Equivalent Control exception covers exactly
          // this. The project's own stricter, exception-free 44px rule
          // still treats these as a genuine, accepted violation (per
          // DEVIATIONS.md); excluding them here is that one recorded
          // carve-out, not a general weakening of this sweep.
          const className = el.className;
          return !(
            typeof className === "string" &&
            (className.includes("step-card-line1") ||
              className.includes("step-card-sub"))
          );
        })
        .map((n) => {
          const r = (n as HTMLElement).getBoundingClientRect();
          return {
            width: r.width,
            height: r.height,
            label: n.outerHTML.slice(0, 120),
          };
        })
        .filter((m) => m.width < 44 || m.height < 44),
  );
  for (const { width, height, label } of offenders) {
    expect(width, `width < 44 for: ${label}`).toBeGreaterThanOrEqual(44);
    expect(height, `height < 44 for: ${label}`).toBeGreaterThanOrEqual(44);
  }
}

async function assertNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

/**
 * WHAT THIS FORGERY DOES AND DOES NOT PROVE (recurring failure 26).
 *
 * `__pm5FakeScript__` sends `resolveDefaultTransport()` down its FAKE arm,
 * and that arm never installs a recording tap — only the real-web-transport
 * arm does. So `__pm5Recording__` here is hand-built, and these assertions
 * prove the observer renders its capture controls WHEN a tap is present.
 * They do not prove the walk build installs one; that seam lives in
 * `transports/index.ts` and is covered by its own tests. The unit suite
 * installs its tap inside the transport's `connect()`, which is where the
 * real seam does it, so the ordering has a gate even though this one cannot
 * be it.
 */
async function injectJustRowObserverFake(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__pm5FakeScript__ = {
      program: { intervals: [] },
      deviceName: "PM5 Observer",
    };
    window.__pm5Recording__ = {
      lines: () => [],
      eventCount: () => 1284,
      download: () => Promise.resolve(),
    };
  });
}

test("Just Row observer: VITE-enabled route, accessibility, controls, and shell", async ({
  page,
}) => {
  await injectJustRowObserverFake(page);
  await signInViaBackdoor(page, {
    email: "design-just-row-observer@e2e.test",
    name: "Observer Design Tester",
  });
  await page.goto("/justrow/observe");

  // The screen opens OFFLINE and connects from a tap, never from a mount
  // effect: `scan()` reaches `navigator.bluetooth.requestDevice()` on the
  // real arm, which is transient-activation gated, and a typed URL is a
  // fresh Window with no activation. Driving the same tap here keeps this
  // spec on the operator's actual path.
  await expect(
    page.getByRole("heading", { name: "Not connected" }),
  ).toBeVisible();
  const connect = page.getByRole("button", { name: "Connect" });
  await expect(connect).toBeVisible();
  // Swept BEFORE the tap as well as after: offline is the state the operator
  // actually lands on, and it is the only one carrying the accent-filled L1.
  await assertNoA11yViolations(page);
  const connectBox = await stableBoundingBox(connect);
  expect(connectBox).not.toBeNull();
  expect(connectBox!.width).toBeGreaterThanOrEqual(44);
  expect(connectBox!.height).toBeGreaterThanOrEqual(44);
  await connect.click();

  await expect(
    page.getByRole("heading", { name: "PM5 Observer connected" }),
  ).toBeVisible();
  await expect(page.getByText("1284 events captured")).toBeVisible();
  const download = page.getByRole("button", { name: "Download capture" });
  const disconnect = page.getByRole("button", { name: "Disconnect" });
  await expect(download).toBeVisible();
  await expect(disconnect).toBeVisible();
  await assertNoA11yViolations(page);

  for (const control of [download, disconnect]) {
    const box = await stableBoundingBox(control);
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
});

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

  // Fix round (whole-branch review, finding D): the TYPE chip row (four
  // bare `aria-pressed` buttons, library-filter-unification round) replaced
  // a sheet `CellGrid` that had `role="group"` + a visible label — axe's
  // own scan above doesn't catch a missing GROUP around otherwise-correctly-
  // named buttons, so this is a dedicated structural pin, mirroring the
  // sheet's own "DIFFICULTY/TIME/PAIN each expose a role=group" sweep
  // further down this file for `TodayFilterSheet`/`FilterSheet`.
  test("the TYPE chip row exposes a role=group named TYPE", async ({
    page,
  }) => {
    const group = page.getByRole("group", { name: "TYPE" });
    await expect(group).toBeVisible();
    await expect(group.getByRole("button")).toHaveCount(4);
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
    // Needs a real TOKEN on screen, so it must come from a sheet group:
    // TYPE moved to its own chip row AND stopped tokenizing (2026-08-12,
    // "already visible"), so the chip alone would leave the token row empty
    // and this sweep would assert nothing. A pressed chip is included too,
    // so the pass covers both indicators at once.
    await page
      .locator(".type-chip-grid")
      .getByRole("button", { name: "O2", exact: true })
      .click();
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "MEDIUM", exact: true }).click();
    await dialog.getByRole("button", { name: "Apply Filter" }).click();
    await expect(
      page.locator(".filter-token-label", { hasText: "MEDIUM" }),
    ).toBeVisible();
    await assertNoA11yViolations(page);
  });

  test("body background matches the token palette", async ({ page }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page
  });

  // Task 4 (ui-fix round) asserted this rule on the TYPE TOKEN; that token
  // was retired on 2026-08-12 ("already visible"). The RULE is unchanged and
  // still needs a guard — DESIGN.md's selected-state rule: a type's control
  // wears that type's OWN colour, never a flat accent — so the subject moves
  // to the chip row, which is where a selected type is now shown. Same
  // expected colour, same reason; only the element changed.
  test("a selected TYPE chip fills with its own type colour, not accent", async ({
    page,
  }) => {
    const chip = page
      .locator(".type-chip-grid")
      .getByRole("button", { name: "O2", exact: true });
    await chip.click();

    const chipBg = await chip.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(chipBg).toBe("rgb(42, 98, 117)"); // --type-o2, not --accent

    // And the retired token really is gone — no pill restates the type.
    await expect(
      page.locator(".filter-token-label", { hasText: /^O2$/ }),
    ).toHaveCount(0);
  });

  // Task 4 (ui-fix round): every token kind fills plain ink — now that
  // TYPE is not tokenized, that is EVERY token, with no exceptions.
  test("a token (e.g. LAST DONE) fills ink, not accent", async ({ page }) => {
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "21D+", exact: true })
      .click();
    await page.getByRole("button", { name: "Apply Filter" }).click();

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
  // `--on-color` text on `--ink` background measures 17.1:1
  // (TypeBadge.tsx sets a fixed `--on-color` label regardless of which
  // type fills the background).
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
    // Pin Web Bluetooth PRESENT before the app loads — the mirror of the
    // no-Bluetooth describe below, and for the same reason. Connect's
    // dashed state repaints the button `--surface` (Task 5's contrast
    // fix), so a runner WITHOUT the API renders this screen's primary
    // cream instead of blue: green on a dev Chrome, red on CI's headless
    // one (2026-08-12, PR #85's first CI run — received rgb(255,253,247)).
    // The available-state pins below assert the AVAILABLE state, so they
    // state it rather than inheriting whatever radio the runner has.
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "bluetooth", {
        value: { getAvailability: () => Promise.resolve(true) },
        configurable: true,
      });
    });
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

  // Task 1 (ui-fix round) originally pinned Start as this screen's one L1
  // at 56px. Fast-follow spec §4 (James's ruling 3) retargets it: Connect
  // is now the screen's single primary — L1 geometry (56px) but its own
  // `.button-connect` class and `--action-connect` token, never
  // `.button-l1`/`--accent` (tokens.css's amended "accent means exactly
  // four things" comment: one red, one blue, never two reds). Start
  // renamed to "Start Timer" and demoted to `.button-l2` (52px) — the
  // companion pin below. `.button-l1` zeroes padding/border explicitly so
  // Connect is still the first button in the app whose rendered height
  // actually equals its own spec (DEVIATIONS.md's IMP-6 row).
  test("Connect is the screen's one primary action at 56px; Start Timer sits at L2", async ({
    page,
  }) => {
    const connect = page.locator(".button-connect");
    await expect(connect).toHaveCount(1);
    await expect(connect).toHaveText("Connect");
    const connectHeight = await connect.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(connectHeight).toBe(56);
    // Palette sweep: --action-connect is a NEW token this task introduces —
    // pinned here alongside the geometry, the same "match the token
    // palette" idiom every other screen's own primary color gets. Same
    // computed rgb this file already asserts for --type-o2 elsewhere
    // (identical hex, #2a6275 — a deliberately separate token, tokens.css).
    const connectBg = await connect.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(connectBg).toBe("rgb(42, 98, 117)"); // --action-connect

    const startTimer = page.getByRole("button", { name: "Start Timer" });
    await expect(startTimer).toBeVisible();
    await expect(startTimer).toHaveClass(/button-l2/);
    const startHeight = await startTimer.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(startHeight).toBe(52);

    // Fix round 1 (F2, reviewer finding): the one-L1 count alone couldn't
    // tell a genuine L1 migration from a screen that ALSO still rendered a
    // legacy `.button-primary` block sitting outside the level system
    // entirely (WorkoutDetail's own staged-delete panel did exactly this
    // until F2). Asserted on every one-primary screen's sweep now; extended
    // here to `.button-l1` too, now that WorkoutDetail's own primary lives
    // on `.button-connect` instead and should never ALSO render a stray
    // `.button-l1`.
    await expect(page.locator(".button-l1")).toHaveCount(0);
    await expect(page.locator(".button-primary")).toHaveCount(0);
  });
});

// M-3 (Task 4 review, routed here): the disabled/dashed Start Timer state
// (the needsBaselines guard, WorkoutDetail.tsx's own `startBlocked`) never
// got a design sweep or a capture — every OTHER WorkoutDetail describe in
// this file either calls `setBaselines` or (the default "workout detail
// screen" describe above) opens whichever `.workout-row` happens to sort
// first, neither of which reliably exercises the guarded render. This
// describe forces it on purpose: a fresh account that never calls
// `setBaselines`, viewing a personal workout with a plain distance work
// step (no explicit effort pace — the same construction "workout detail
// screen (personal workout, owner actions)" above uses for its own owned
// workout) — `needsBaselines()` reads true for a plain distance/duration
// row, so Start Timer renders disabled with the dashed idiom every time.
test.describe("workout detail screen (no baselines, guarded Start Timer)", () => {
  const title = "Design No Baselines Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-detail-noBaselines-${testInfo.parallelIndex}@e2e.test`,
      name: "Design No Baselines Tester",
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

  test("Start Timer renders disabled/dashed and the screen still clears the tap-target/a11y/ink4 sweeps", async ({
    page,
  }) => {
    const startTimer = page.getByRole("button", { name: "Start Timer" });
    await expect(startTimer).toBeDisabled();
    await expect(startTimer).toHaveClass(/button-l2/);

    const startStyles = await startTimer.evaluate((el) => {
      const s = getComputedStyle(el);
      return { borderStyle: s.borderStyle, color: s.color };
    });
    expect(startStyles.borderStyle).toBe("dashed");
    // The global `button:disabled` rule's --ink-5 text on --surface
    // computes 2.754:1 (verified independently, WCAG relative-luminance
    // formula, and already documented at this exact figure elsewhere in
    // index.css's own connect-block-dashed comment) — well under 4.5:1,
    // but WCAG 1.4.3 exempts disabled controls (axe-core's own
    // color-contrast rule skips them too, which `assertNoA11yViolations`
    // below proves empirically rather than just by exemption).
    expect(startStyles.color).toBe("rgb(160, 154, 140)"); // --ink-5

    // `needsBaselines()` reading true with no baselines set makes BOTH
    // Start Timer's own caption AND the "Log it after" fallback below it
    // render this exact class (WorkoutDetail.test.tsx's own comment: "the
    // step rows and 'Log it after' grow their own 'no target' idiom too")
    // — `.first()`, scoped to the action stack, picks Start Timer's own,
    // the one adjacent to it in document order (StepRow's own copy, if
    // any, lives inside `.step-list`, a sibling of the action stack, so
    // the `>` direct-child scope never reaches it).
    const caption = page
      .locator(".workout-detail-actions > .step-row-no-target")
      .first();
    await expect(caption).toBeVisible();
    const captionColor = await caption.evaluate(
      (el) => getComputedStyle(el).color,
    );
    // --ink-4 on --page (the screen's own body background, not --surface —
    // this caption sits directly on `.screen`, which sets no background of
    // its own) computes 4.76:1, independently verified against the same
    // WCAG formula — clears the 4.5:1 AA floor for real (non-exempt) text,
    // matching the figure design.spec.ts's own assertNoFailingInk4Labels
    // doc comment already cites for this exact pairing.
    expect(captionColor).toBe("rgb(111, 106, 95)"); // --ink-4

    await assertTapTargets(page);
    await assertNoA11yViolations(page);
    await assertNoFailingInk4Labels(page);
  });
});

// Fast-follow spec §4 (adversarial I9), the real bug the mechanical
// selector retarget alone would have missed: `.button-l2`'s own resting
// fill was `--surface` (unfilled), so the OLD dashed rule only had to
// override border-style/color. `.button-connect` fills solid blue by
// default — a bare selector rename would leave dark `--ink-3` text sitting
// on that solid fill, both visually wrong and a real contrast failure.
// This forces the dashed state on a REAL browser (no Web Bluetooth API,
// same `addInitScript` idiom `design.spec.ts`'s own FAILED-state test
// above and `screenshots.spec.ts`'s `stubNoBluetooth` use) and asserts the
// fill actually reverted, not just that the border went dashed.
test.describe("workout detail screen (Connect, no Bluetooth API)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "bluetooth", {
        value: undefined,
        configurable: true,
      });
    });
    await signInViaBackdoor(page, {
      email: "design-detail-no-bt@e2e.test",
      name: "Design No Bluetooth Tester",
    });
    await page.goto("/library");
    await page.locator(".workout-row").first().click();
    await expect(page.locator(".workout-detail-title")).toBeVisible();
  });

  test("Connect's dashed state reverts the blue fill to --surface, keeping the same measured ink-3 contrast", async ({
    page,
  }) => {
    await expect(page.getByText("NO BLUETOOTH ON THIS DEVICE")).toBeVisible();
    const connect = page.getByRole("button", { name: "Connect" });
    const styles = await connect.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        borderStyle: s.borderStyle,
        color: s.color,
      };
    });
    expect(styles.background).toBe("rgb(255, 253, 247)"); // --surface, NOT --action-connect
    expect(styles.borderStyle).toBe("dashed");
    expect(styles.color).toBe("rgb(87, 84, 76)"); // --ink-3, 7.432:1 on --surface

    await assertNoA11yViolations(page);
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
  // standalone rest row" describe below: this test creates real data (a saved
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
  // difficulty, a 60-min cap's own bucket set, no pain filter) — and the
  // swap chips read the plan's own prescribed type with nothing swapped
  // yet.
  //
  // Task 3 (2026-08-04 round): DIFFICULTY/TIME/PAIN no longer render inline
  // — the FILTER ⌄ sheet has to be opened first to reach them; the O2/AN/
  // AT/TR type-swap chips are untouched (they stay on the plan line, never
  // moved into the sheet).
  //
  // Amendment (2026-08-04 PR #50 round): TIME's default is the bucket SET
  // `bucketsForCap(60)` derives (the first three buckets), not a single
  // cap chip.
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
    for (const label of ["<30′", "30–45′", "45–60′"]) {
      await expect(
        dialog.getByRole("button", { name: label, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    await expect(
      dialog.getByRole("button", { name: "60′+", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
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

  // Amendment (2026-08-04 PR #50 round), Task 2: the four type-swap chips
  // now span the plan line's full content width as a 4-column 1fr grid
  // (`.type-chip-grid`, index.css — renamed from `.today-type-chips` in the
  // library-filter-unification round, Task 2: Library's own multi-select
  // chip row needed the identical grid override) instead of sitting
  // left-packed at their own intrinsic `.chip` width inside a flex-wrap
  // row. Verified via real bounding boxes (jsdom has no layout engine) —
  // all four chips are near-equal width (a 1fr share each) and the row's
  // total span (first chip's left edge to last chip's right edge) reaches
  // the container's own width, proving they stretch rather than merely sit
  // side by side.
  test("the type-swap chips span the full row as a 4-column grid, not left-packed intrinsic widths", async ({
    page,
  }) => {
    const chips = await page
      .locator(".type-chip-grid .chip")
      .evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().toJSON()),
      );
    expect(chips).toHaveLength(4);

    const rowBox = (await page.locator(".type-chip-grid").boundingBox())!;

    // Every cell within a few px of an equal 1fr share of the row.
    const expectedWidth = rowBox.width / 4;
    for (const box of chips) {
      expect(Math.abs(box.width - expectedWidth)).toBeLessThan(6);
    }

    // The row itself spans (within a couple px) the full width Today's
    // other full-width controls (e.g. the suggestion card) also use —
    // proof this is a stretching grid, not four chips merely sitting next
    // to each other at their own content width (which left a visible gap
    // on the right at 390px before this task).
    const firstLeft = chips[0]!.x;
    const lastRight = chips[3]!.x + chips[3]!.width;
    expect(lastRight - firstLeft).toBeGreaterThan(rowBox.width - 4);
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

    const timeChip = dialog.getByRole("button", {
      name: "45–60′",
      exact: true,
    });
    const timeBg = await timeChip.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(timeBg).toBe("rgb(27, 26, 23)"); // --ink

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
      [`${soloTitle} | O2 | hard | 4`, "w 20:00 6k+10 @20"].join("\n"),
    );
    await page.goto("/today");
    await expect(page.locator(".today-card")).toBeVisible();

    // Task 3 (2026-08-04 round): the setup that narrows to this solo
    // fixture moves through the FILTER sheet — EASY/MEDIUM no longer
    // render inline. Amendment (2026-08-04 PR #50 round): TIME's default
    // (bucketsForCap(60) — the first three buckets) already covers this
    // fixture's 20-min estimate (2026-08-09: no `wu` line any more — a
    // workout's own displayed/estimated duration is work-only now, per the
    // warmup-setting spec §5), so no TIME cell needs touching at all to
    // narrow to HARD alone.
    await page.getByRole("button", { name: "FILTER ⌄" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "EASY", exact: true }).click();
    await dialog.getByRole("button", { name: "MEDIUM", exact: true }).click();
    await page.getByRole("button", { name: "Apply Filter" }).click();

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
    await page.getByRole("button", { name: "Apply Filter" }).click();
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
    await page.getByRole("button", { name: "Apply Filter" }).click();
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
  // pinned here now that DIFFICULTY/TIME/PAIN live inside the sheet
  // (LAST DONE/SOURCE, Round 2, get the identical treatment from the same
  // CellGrid component, spot-checked in TodayFilterSheet.test.tsx instead
  // of duplicated here).
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
// ✕ that arms IN PLACE — a real timer run driven all the way to the summary
// (`/session/log`), then a non-destructive exit WITHOUT ever logging it, is
// the only way to land a completed-but-unlogged run record here (same
// "drive the real flow" idiom as e2e/session.spec.ts's own discard test).
// Post-workout-summary spec §3/§2A: the finish stage now lands on the
// summary directly (no SessionComplete hop), and its own non-destructive
// exit is the ← DONE BackLink (SessionComplete's old "Back to Today" is
// gone with it).
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
    await expect(page).toHaveURL(/\/session\/log$/, { timeout: 6000 });
    await page.getByRole("link", { name: "← DONE" }).click();
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

// F6 spec 2b, Task 5: Today's OTHER twin row — a dead `MonitorRun`
// (`completedAt === null`) the rower is closing through Today rather than
// through the monitor itself. No PM5/Bluetooth radio exists in CI, so
// unlike the phone-timer row above (a real timer driven to
// /session/complete), this record is SEEDED — but through the SAME real
// `buildDraft -> startDraft -> buildRun -> compileProgram -> buildLogSeed`
// pipeline `LogSession.test.tsx`'s own `buildMonitorFixture` uses, never a
// hand-typed `MonitorRun` literal (antagonist correction, this task's
// brief: a seed that merely RENDERS is not a seed that ENGAGES
// `monitorModeRun`'s four-condition gate in `LogSession.tsx`). Two things
// make this seed honest, not just shaped: `logSeed.steps` and
// `program.intervals` come out of the identical compile (condition 4), and
// `workoutId` is the compose stack's own server-assigned id for the real
// seeded library workout "Hoarfrost" (condition 3) — fetched via
// `libraryWorkoutId`, never the unit fixture's hand-picked literal id.

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

/** Fetches the REAL, server-assigned id the compose stack's own seeded
 *  global library gave `title` — never a client-side literal — via the
 *  same in-page-fetch idiom `cleanupByTitle` above uses (the api
 *  container's Secure-cookied session only survives Chromium's loopback
 *  exemption from inside the page, not Playwright's Node-side
 *  `page.request`). */
async function libraryWorkoutId(page: Page, title: string): Promise<string> {
  const result = await page.evaluate(async (t) => {
    const res = await fetch("/api/workouts");
    if (!res.ok) return { ok: false as const, status: res.status, id: null };
    const workouts = (await res.json()) as Array<{
      id: string;
      title: string;
    }>;
    const match = workouts.find((w) => w.title === t);
    return { ok: true as const, status: res.status, id: match?.id ?? null };
  }, title);
  if (!result.ok) {
    throw new Error(`workout lookup failed for "${title}": ${result.status}`);
  }
  if (result.id === null) {
    throw new Error(`workout not found in the seeded library: "${title}"`);
  }
  return result.id;
}

/** Hoarfrost's own time-work step (restMinutes 5, its auto-inserted rest
 *  phase — folds into `program.intervals[1].restSeconds`, `program.ts`'s
 *  own "no rest interval of its own" rule) plus Calm Sea's own
 *  distance-work step, the SAME two real library steps
 *  `LogSession.test.tsx`'s own `buildMonitorFixture` assembles — real
 *  library data, never a hand-built minimum (recurring failure #3). Only
 *  interval 1 (Hoarfrost's time work) is measured: 360s elapsed + 300s its
 *  own programmed rest = 660s = 11 MIN, the EXACT fixture
 *  `LogSession.test.tsx`'s own "the interrupted header stops reading
 *  wall-clock" unit test already proves — reusing a proven number here
 *  instead of a fresh one this file would have to re-derive. */
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
    // Phase WU: interval 0 came from `buildRun`'s deleted warm-up argument.
    // An authored 4' EASY step compiles to the identical target-less
    // interval, so every `IntervalActual.index` below is unchanged. What
    // DID change is that it now produces a logged, numbered summary row
    // rather than the unnumbered WARM-UP row.
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { effort: "min" },
      },
      timeWork,
      distanceWork,
    ],
  });
  const started = startDraft(draft);
  const built = buildRun(started, MONITOR_FIXTURE_BASELINES, MONITOR_FIXED_NOW);
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
    // Real hardware's own BLE advertising name (Concept2's own naming,
    // verbatim) — same literal `LogSession.test.tsx`'s own
    // `buildMonitorFixture` uses.
    deviceName: "PM5 432331249 Row",
    startedAt: MONITOR_FIXED_NOW.toISOString(),
    completedAt: null,
    terminated: false,
  };
}

/** Seeds the record and writes it via an in-page `localStorage.setItem` —
 *  `MONITOR_RUN_KEY`/`run` are passed as `evaluate`'s own argument, not
 *  closed over, since a `page.evaluate` callback runs in the browser's own
 *  global scope, where neither this file's outer consts nor its imports
 *  exist. */
async function seedInterruptedMonitorRun(page: Page): Promise<void> {
  const workoutId = await libraryWorkoutId(page, "Hoarfrost");
  const run = buildInterruptedMonitorRun(workoutId);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: MONITOR_RUN_KEY,
    value: JSON.stringify(run),
  });
}

// Task 6 (property sweep): a NORMALLY-completed (not interrupted) monitor
// run with TWO measured work intervals plus a measured opening piece — the
// interrupted fixture above only ever carries one measured actual, so
// `monitorAvgSplit`'s own `count >= 2` gate (finding 5) never lets a row
// get JUDGED there. This is the fixture §2E's judged-color/deviation-bar/
// legend rows and §2B's DISTANCE (R-B, incl. a nonzero rest distance) and
// TIME (R-D, F-1's own m:ss re-observation surface) rows need — none of
// which the interrupted fixture, or any fixture already in this file,
// exercises. Same real Hoarfrost + Calm Sea steps, same
// buildDraft->startDraft->buildRun->compileProgram->buildLogSeed pipeline
// as `buildInterruptedMonitorRun`/`buildMonitorFixture`
// (LogSession.test.tsx) — never a hand-built minimum.
//
// Every number below is hand-verifiable, not merely "whatever the code
// says": DISTANCE (RC-5, hero-truth: work-only Σ over ALL actuals incl.
// the opening piece, tier B non-legacy — this fixture's own `logSeed`
// never carries `kind: "warmup"`) = 600+2000+10000 = 12600 exactly —
// asserted as an EXACT value below, since this sum is fully within this
// fixture's own control. R-B's OLD fused formula (which also folded in
// each actual's `restDistanceMeters`, 0+64+0) produced 12664 — that
// number is retired as this hero's own value (RC-5 §1); fix round 1's I3
// also means it can't reach the TOTAL line's rest clause either here,
// since none of these three actuals carries a `restSeconds` field (see
// below). The two work intervals' own displayed
// pace is `actual.avgSplit` VERBATIM (`buildMonitorLogSteps`, logDraft.ts:
// `step.actualSplit = actual.avgSplit` — the wire-reported reading, never
// recomputed from elapsed/distance), while the baseline they are judged
// against is Phase LT spec 1's re-baseline: EACH ROW'S OWN TARGET, not a
// working average (`rowJudgment`, summaryModel.ts). Both work steps are
// "@ 6K +12" (Hoarfrost's TIME step, Calm Sea's DISTANCE step), which the
// real `compileProgram` pipeline resolves to the SAME `targetSplit`, 132,
// off this fixture's own `MONITOR_FIXTURE_BASELINES.k6Seconds` (120) —
// verified by reading `compileProgram`'s own output for this exact
// fixture, not assumed. Interval 1's avgSplit (150) deviates +18.0
// (SLOWER); interval 2's avgSplit (120) deviates −12.0 (FASTER) —
// opposite signs, both comfortably past the 50%-cap threshold (|dev| >=
// 1.6s/500m caps the bar at 50% by construction, §1's own formula), so
// this fixture also witnesses the CAP rule, not just the two colors.
// (Before the re-baseline this same fixture's two rows deviated +25.0/
// −5.0 against a 125.0 WORKING AVERAGE — same two colors/directions by
// coincidence, different magnitudes; Phase LT spec 1 task 2 updated the
// two exact-label assertions below, nothing else about this fixture.)
// TIME (RC-5: work-only Σ `elapsedSeconds`, 187+600+2400=3187 -> "53:07")
// is asserted structurally (`m:ss`, not ending ":00") rather than to an
// exact value below — a holdover from when this fixture's own TIME
// summed each completed interval's PROGRAMMED rest too (R-D's old fused
// formula) and two of the three intervals' own restSeconds were never
// independently verified; RC-5 retired that formula from the hero
// entirely (it's Σ elapsedSeconds alone now, fully known), but the
// structural assertion is kept rather than tightened to an exact value,
// since it still holds and a future task may find it worth tightening on
// its own.
const MONITOR_COMPLETED_ACTUALS: IntervalActual[] = [
  {
    index: 0,
    elapsedSeconds: 187,
    distanceMeters: 600,
    // 500×187/600 = 155.8 (rounded to the wire's 0.1s resolution), not the
    // old unrelated 200 (PM final-PR gate, condition round, 2026-08-17): a
    // real PM5 computes this opening row's own average pace FROM the same
    // elapsed/distance the row also displays (identity a `fake.ts`-driven
    // capture caught contradicting its own hero, `log-monitor.png`). This
    // row is UNJUDGED (an EFFORT-ref step has no target by definition — §1's
    // own rule, this fixture's own comment above), so the exact figure is not
    // load-bearing for the deviation math below — only its own internal
    // coherence is.
    avgSplit: 155.8,
    avgSpm: 20,
    avgHeartRateBpm: 110,
    restDistanceMeters: 0,
  },
  {
    index: 1,
    elapsedSeconds: 600,
    distanceMeters: 2000,
    avgSplit: 150,
    avgSpm: 24,
    avgHeartRateBpm: 138,
    restDistanceMeters: 64,
  },
  {
    index: 2,
    elapsedSeconds: 2400,
    distanceMeters: 10000,
    avgSplit: 120,
    avgSpm: 26,
    avgHeartRateBpm: 150,
    restDistanceMeters: 0,
  },
];

/** Real hardware's own BLE advertising name, verbatim — the same literal
 *  `buildMonitorFixture`/`buildInterruptedMonitorRun` above use. §2A's own
 *  meta row (`AUG 10 · 18:57 · PM5 <id>`) reads this straight through as
 *  `sourceLabel` (`summaryModel.ts`'s `buildMonitorModel`). */
const MONITOR_DEVICE_NAME = "PM5 432331249 Row";

function buildCompletedMonitorRun(workoutId: string): MonitorRun {
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
    // Phase WU: interval 0 came from `buildRun`'s deleted warm-up argument.
    // An authored 4' EASY step compiles to the identical target-less
    // interval, so every `IntervalActual.index` below is unchanged. What
    // DID change is that it now produces a logged, NUMBERED summary row
    // rather than the unnumbered WARM-UP row — so this fixture's summary
    // has three rows where it used to have a warm-up row plus two.
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { effort: "min" },
      },
      timeWork,
      distanceWork,
    ],
  });
  const started = startDraft(draft);
  const built = buildRun(started, MONITOR_FIXTURE_BASELINES, MONITOR_FIXED_NOW);
  const program = compileOrThrow(built.phases);
  const logSeed = buildLogSeed(built.phases, MONITOR_FIXTURE_BASELINES);
  return {
    v: 2,
    workoutId,
    title: hoarfrost.title,
    program,
    logSeed,
    actuals: MONITOR_COMPLETED_ACTUALS,
    deviceName: MONITOR_DEVICE_NAME,
    startedAt: MONITOR_FIXED_NOW.toISOString(),
    // A normal completion — §2A's date/time rule reads `completedAt`,
    // unlike the interrupted branch above which reads `startedAt` (the F6
    // rule). Whole-branch review minor 10: this used to omit `endedBy`
    // entirely, a shape no real writer produces — every close stamps one
    // (design spec §4's writer table) — and the honest value for a
    // `terminated: false` natural finish is the machine's own WORKOUTEND
    // door, `"finished"` (`completeMonitorRun`'s own doc comment: "finished
    // is the only CloseReason that pairs with terminated: false").
    completedAt: new Date(
      MONITOR_FIXED_NOW.getTime() + 70 * 60 * 1000,
    ).toISOString(),
    terminated: false,
    endedBy: "finished",
  };
}

/** Returns the seeded record's own `workoutId` (the real, server-assigned
 *  "Hoarfrost" id) — the caller needs it to build the
 *  `/library/:id/log?from=monitor` URL `monitorModeRun`'s condition 3
 *  checks against (this module's own header). */
async function seedCompletedMonitorRun(page: Page): Promise<string> {
  const workoutId = await libraryWorkoutId(page, "Hoarfrost");
  const run = buildCompletedMonitorRun(workoutId);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: MONITOR_RUN_KEY,
    value: JSON.stringify(run),
  });
  return workoutId;
}

test.describe("today screen (interrupted connected session row)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-interrupted-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Interrupted Tester",
    });
    await seedInterruptedMonitorRun(page);
    await page.goto("/today");
    await expect(
      page.getByText(/interrupted connected session\./),
    ).toBeVisible();
  });

  // Step 1 (task brief): proves the seed ENGAGES `monitorModeRun`'s gate,
  // not merely renders past it. If the seed's `logSeed`/`program.intervals`
  // alignment were wrong, or `workoutId` didn't match the route's own real
  // id, `monitorModeRun` (LogSession.tsx) would return null and this
  // landing would silently show the MANUAL door's own (baseline-priced,
  // wall-clock-dated) header instead — a visibly different heading and a
  // different number, which the assertions below would catch.
  test("Log it stamps the record and opens the log screen with the actuals-derived minutes, not a wall-clock guess", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Log it" }).click();

    await expect(page).toHaveURL(/\/library\/[^/]+\/log\?from=monitor$/);
    await expect(
      page.getByRole("heading", { name: "Hoarfrost" }),
    ).toBeVisible();

    // The monitor-mode summary's own TIME hero (RC-5, hero-truth,
    // fix round 1): work-only now, 360s measured -> "6:00" — nowhere near
    // the wall-clock gap between `startedAt` (seeded Aug 1) and
    // `completedAt` (stamped just now by this very click), which a
    // regression back to wall-clock reading would show instead. The OLD
    // fused figure this hero used to render ("11:00" = 360s + Hoarfrost's
    // own 300s programmed rest) does NOT reappear on the TOTAL line
    // either: fix round 1's I3 requires EVERY actual to carry BOTH
    // `restSeconds` and `restDistanceMeters` before deriving a rest
    // clause, and this seeded actual (`buildInterruptedMonitorRun`) only
    // ever set `restDistanceMeters: 0` — no `restSeconds` at all — so the
    // total renders work-only too, "6:00 total", with no rest clause.
    // dateLabel reads from `startedAt`, not `completedAt` (the "Log it"
    // moment, possibly days later).
    await expect(page.getByText(/^AUG 1 ·/)).toBeVisible();
    await expect(
      page.locator(".summary-hero-value", { hasText: "6:00" }),
    ).toBeVisible();
    await expect(page.locator(".summary-total-line")).toHaveText("6:00 total");

    const stamped = await page.evaluate(() => {
      const raw = localStorage.getItem("ergomatic.monitorRun");
      return raw === null
        ? null
        : (JSON.parse(raw) as {
            completedAt: string | null;
            endedBy?: string;
          });
    });
    expect(stamped?.completedAt).not.toBeNull();
    expect(stamped?.endedBy).toBe("interrupted");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // The DEFAULT state's own ✕ — outlined, never solid (DEVIATIONS.md #2) —
  // and carrying a DISTINCT accessible name from the phone-timer row's own
  // ✕ (antagonist correction, this task's brief), the same shared
  // `.today-unlogged-discard` class both rows use.
  test("the row's ✕ is 44x44 and accent-outlined at rest, under its own distinct accessible name", async ({
    page,
  }) => {
    const discardBtn = page.getByRole("button", {
      name: "Discard connected session without logging",
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

  // "Log it" is a `<button>` here (it stamps before navigating), not the
  // phone-timer row's bare `<Link>` — same shared `.today-unlogged-link`
  // pill class either way (Task 4's own antagonist correction: `font:
  // inherit`/`cursor: pointer` ADDED, never a reset), so the two usages
  // must look identical, not merely both clear 44px.
  test("Log it is >=44x44, sharing the phone-timer row's own pill style", async ({
    page,
  }) => {
    const logIt = page.getByRole("button", { name: "Log it" });
    const box = (await logIt.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const styles = await logIt.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        borderColor: s.borderColor,
        color: s.color,
        cursor: s.cursor,
      };
    });
    expect(styles.background).toBe("rgb(255, 253, 247)"); // --surface
    expect(styles.borderColor).toBe("rgb(27, 26, 23)"); // --ink
    expect(styles.color).toBe("rgb(27, 26, 23)"); // --ink
    expect(styles.cursor).toBe("pointer");
  });

  // Arming swaps the ROW's CONTENTS, not its layout — the same contract
  // the phone-timer row's own identical test proves, mirrored here for the
  // twin's own copy ("interrupted connected session" naming, the discard
  // question naming the run's title) and its own distinctly-named ✕.
  test("arming swaps the row's contents in place — border to accent, text to the discard question, ✕ to a solid 'Tap again' — without moving the row", async ({
    page,
  }) => {
    const row = page.locator(".today-unlogged-line");
    const boxBefore = (await row.boundingBox())!;

    await page
      .getByRole("button", {
        name: "Discard connected session without logging",
      })
      .click();
    await page.mouse.move(0, 0);

    await expect(row).toHaveClass(/today-unlogged-line-armed/);
    const rowBorderColor = await row.evaluate(
      (el) => getComputedStyle(el).borderColor,
    );
    expect(rowBorderColor).toBe("rgb(181, 52, 31)"); // --accent
    await expect(
      page.getByText("Discard Hoarfrost without logging?"),
    ).toBeVisible();
    const tapAgain = page.getByRole("button", { name: "Tap again" });
    const tapAgainStyles = await tapAgain.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color };
    });
    expect(tapAgainStyles.background).toBe("rgb(181, 52, 31)"); // --accent
    expect(tapAgainStyles.color).toBe("rgb(255, 253, 247)"); // --on-color
    // "Log it" is gone while armed — replaced, not merely joined.
    await expect(page.getByRole("button", { name: "Log it" })).toHaveCount(0);

    const boxAfter = (await row.boundingBox())!;
    expect(Math.round(boxAfter.y)).toBe(Math.round(boxBefore.y));
    expect(Math.round(boxAfter.height)).toBe(Math.round(boxBefore.height));
  });

  // arm -> tap -> gone: the row disappears in place with no navigation,
  // and clears ONLY the monitor record — `clearMonitorRun()`, never
  // `useStagedDiscard().fire()` (the phone-timer row's own body, which
  // would clear the WRONG records for a `MonitorRun`).
  test("a second press while armed fires the discard — the row disappears in place, no navigation, and clears only the monitor record", async ({
    page,
  }) => {
    await page
      .getByRole("button", {
        name: "Discard connected session without logging",
      })
      .click();
    await page.getByRole("button", { name: "Tap again" }).click();

    await expect(page.getByText(/interrupted connected session/i)).toHaveCount(
      0,
    );
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    const runAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.monitorRun"),
    );
    expect(runAfter).toBeNull();
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

  // Final whole-branch review (2026-08-18), finding IMPORTANT 1's own
  // structural witness: `.plan-row:last-of-type` matched by TAG among ALL
  // siblings of that tag, not by class — Task 6 wrapped every row in its
  // own `<li><a|div class="plan-row">`, so each `.plan-row` became the
  // ONLY element of its own tag inside its own `<li>`, and the old
  // selector matched EVERY row rather than just the true last one (every
  // divider vanished; `docs/screenshots/plan.png` shows rules before Task
  // 6, none after). No prior sweep asserted the divider's PRESENCE, only
  // its absence on the true last row (`.baseline-row`'s own PR #66 tests
  // cover just that half) — asserting BOTH directions here is what keeps
  // the fixed selector (`.plan-sequence > li:last-child .plan-row`) from
  // silently inverting again: a selector that removes every divider, or
  // one that never removes any, would each fail exactly one of these two
  // checks.
  test("a non-last plan row keeps its divider and the true last row still drops it", async ({
    page,
  }) => {
    const rows = page.locator(".plan-sequence > li .plan-row");
    await expect(rows).toHaveCount(84);

    const firstBorder = await rows
      .nth(0)
      .evaluate((el) => getComputedStyle(el).borderBottomWidth);
    expect(firstBorder).not.toBe("0px");

    const lastBorder = await rows
      .nth(83)
      .evaluate((el) => getComputedStyle(el).borderBottomWidth);
    expect(lastBorder).toBe("0px");
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

  // From-the-log spec (2026-08-18) §1/§5, Task 6: the describe above's own
  // fixture (`choosePlan` alone, doneN 0) never produces a DONE row at
  // all — this sweep's whole point is the ONE new interactive element
  // Task 6 adds to this screen, a done row rendered as an `<a>`
  // (Plan.tsx), which the sibling describe above has never visited.
  test.describe("with a linked done row (Task 6's own Plan.tsx change)", () => {
    test.beforeEach(async ({ page }, testInfo) => {
      await signInViaBackdoor(page, {
        email: `design-plan-linked-${testInfo.parallelIndex}@e2e.test`,
        name: "Design Plan Linked Tester",
      });
      await choosePlan(page, "sprint");
      await resetPlanProgress(page);
      // A real advancing save (default `advancesPlan: true`) — the ONLY
      // way a genuinely linked done row exists (§2: linkage is stored,
      // never inferred).
      // The title is deliberately a LONG custom one (design gate,
      // 2026-08-30): the row now renders that string, and a seed short
      // enough to fit would sweep the one case that cannot clip. It lands
      // on plan index 0, an O2 day, and is stored as an AT — so this
      // fixture is also the swapped-row layout, which is the taller of the
      // two and the one the tap-target and axe sweeps below most need to
      // see.
      const result = await page.evaluate(async () => {
        const res = await fetch("/api/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workoutId: null,
            workoutTitle:
              "Design Plan Link Sweep, a long custom title that cannot fit one row",
            workoutType: "AT",
            held: null,
            pain: null,
            notes: null,
            steps: [{ label: "Work" }],
            source: "manual",
          }),
        });
        return { ok: res.ok, status: res.status };
      });
      if (!result.ok) {
        throw new Error(`advancing log seed failed: ${result.status}`);
      }
      await page.goto("/plan");
      await expect(page.locator(".plan-row-done")).toHaveCount(1);
      // `usePlanLinks`' own fetch (Plan.tsx, this task) is async — the
      // row renders PLAIN first (a `<div>`, no `href`) and only becomes
      // the `<a>` this whole describe exists to sweep once that fetch
      // resolves. Waiting here, once, for every test in this describe,
      // closes the race a bare `toHaveCount` leaves open (caught live:
      // reading a still-plain row's `getComputedStyle` mid-swap once
      // returned an empty string, the disconnected-node symptom of
      // evaluating against a node React was already replacing).
      await expect(page.locator(".plan-row-done")).toHaveAttribute(
        "href",
        /^\/today\/log\/[^/]+$/,
      );
    });

    test("the linked done row is an <a> with a >=44x44 tap target, and the sweep still holds", async ({
      page,
    }) => {
      const link = page.locator(".plan-row-done");
      await expect(link).toHaveAttribute("href", /^\/today\/log\/[^/]+$/);
      const tag = await link.evaluate((el) => el.tagName);
      expect(tag).toBe("A");
      // `.plan-row`'s own `min-height: 44px` rule — measured live rather
      // than trusted from the CSS source, same reasoning `assertTapTargets`
      // itself is built on (a computed box can diverge from an authored
      // rule when flex/content pushes it taller or a sibling collapses it).
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await assertTapTargets(page);
      await assertNoA11yViolations(page);
    });

    test("the linked row's own inherited color/decoration are unchanged from an ordinary <li> (no color regression from swapping <li> for <a>)", async ({
      page,
    }) => {
      // `.plan-row`'s new `text-decoration: none; color: inherit;` rule
      // (index.css, Task 6) exists exactly so this holds — an unstyled
      // anchor would otherwise paint the UA default blue/underline here.
      // Asserted on the ANCHOR ELEMENT ITSELF, not a child span: every
      // child here (`.plan-row-index`/`.plan-row-status`) already carries
      // its OWN explicit color (`.mono-status`/`.plan-row-status`'s own
      // rules) regardless of this fix, so a child-level assertion would
      // prove nothing about the rule this test exists to guard — the
      // anchor's own computed color is the one property those don't
      // shadow.
      const styles = await page.locator(".plan-row-done").evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.color, decoration: s.textDecorationLine };
      });
      expect(styles.color).toBe("rgb(27, 26, 23)"); // --ink, 15.41:1 on --page
      expect(styles.decoration).toBe("none");
    });

    // Design gate (2026-08-30). The name is a stored string the rower
    // authored, so the only thing standing between it and a row that
    // pushes the page sideways is `.plan-row-name`'s clip. That
    // rule is inert on an INLINE box — a span only gets `overflow`/
    // `text-overflow` because it is a flex (or, on a swapped row, grid)
    // ITEM and so is blockified. Recurring failure 21's second smell is
    // exactly this: measuring an inline element, whose `clientWidth` is
    // always 0, and reading the resulting green as proof.
    test("a long workout name is clipped inside its row, and never widens the page", async ({
      page,
    }) => {
      // Scoped to the DONE row: since 2026-08-30 the three checkpoint
      // days name their prescribed workout through this same class, so a
      // page-wide locator matches four elements on this screen.
      const name = page.locator(".plan-row-done .plan-row-name");
      await expect(name).toHaveCount(1);
      await expect(page.locator(".plan-row-name")).toHaveCount(4);

      const box = await name.evaluate((el) => ({
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        display: getComputedStyle(el).display,
        overflow: getComputedStyle(el).overflowX,
        ellipsis: getComputedStyle(el).textOverflow,
      }));
      // Blockified, so the clip rules apply at all. A zero clientWidth
      // here is the inline-box failure, not a narrow row.
      expect(box.clientWidth).toBeGreaterThan(0);
      expect(box.display).not.toBe("inline");
      expect(box.overflow).toBe("hidden");
      expect(box.ellipsis).toBe("ellipsis");
      // Genuinely clipped: the content is wider than the box it is shown
      // in, which is what makes this fixture a real test of the rule
      // rather than a short title that would fit under any CSS at all.
      expect(box.scrollWidth).toBeGreaterThan(box.clientWidth);

      // And the clip actually contains it: the document never gains a
      // horizontal scroll, and the row stays inside the viewport.
      const page_ = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(page_.scrollWidth).toBeLessThanOrEqual(page_.clientWidth);

      const rowBox = (await page.locator(".plan-row-done").boundingBox())!;
      expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(page_.clientWidth);
    });

    // The unknown-type box (edge-marks PR; James's review made it a
    // meaningful cue). NO supported writer can produce a row rendering
    // it — POST /api/logs validates types since #233 — so this test
    // INJECTS the badge markup into the live Plan screen and measures it
    // against the SERVED stylesheet, which is the one thing jsdom
    // cannot do. Deleting the `.plan-row-badge-unknown` rule turns the
    // computed colours transparent and this red — the class-name checks
    // in Plan.test.tsx alone could not (James's review, verbatim:
    // "deleting the entire CSS rule stays green").
    test("the unknown-type box: computed colours meet 1.4.11 and its outer geometry equals a real badge's", async ({
      page,
    }) => {
      const m = await page.evaluate(() => {
        const row = document.querySelector(".plan-row");
        const real = row!.querySelector(".type-badge") as HTMLElement;
        const box = document.createElement("span");
        box.className = "type-badge plan-row-badge-unknown";
        box.innerHTML =
          '<span aria-hidden="true">\u00A0\u00A0</span>' +
          '<span class="visually-hidden">type unknown</span>';
        real.insertAdjacentElement("afterend", box);
        const bs = getComputedStyle(box);
        const rb = real.getBoundingClientRect();
        const bb = box.getBoundingClientRect();
        // The ADJACENT background the border must contrast against —
        // read from the page, not assumed (re-review of dc6ea3ed).
        const rowBg = getComputedStyle(document.body).backgroundColor;
        return {
          background: bs.backgroundColor,
          borderColor: bs.borderTopColor,
          borderWidth: bs.borderTopWidth,
          adjacentBg: rowBg,
          heightDelta: Math.abs(rb.height - bb.height),
          // IBM Plex Mono is monospace: two nbsp and two letters have the
          // SAME advance, and the border is padding-compensated — so the
          // outer widths are equal, not merely close. A 2px allowance
          // would let the compensation be dropped unnoticed (exactly a
          // 2px width change); sub-pixel only.
          widthDelta: Math.abs(rb.width - bb.width),
        };
      });
      expect(m.background).toBe("rgb(222, 216, 201)"); // --rule-2
      expect(m.borderColor).toBe("rgb(111, 106, 95)"); // --ink-4
      expect(m.borderWidth).toBe("1px");
      // 1.4.11's 3:1 floor, COMPUTED from the measured pair rather than
      // trusted from a comment: sRGB relative luminance per WCAG 2.x.
      const lum = (css: string) => {
        const [r, g, b] = css
          .match(/\d+/g)!
          .slice(0, 3)
          .map((v) => Number(v) / 255)
          .map((c) =>
            c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
          );
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const [hi, lo] = [lum(m.borderColor), lum(m.adjacentBg)].sort(
        (a, b) => b - a,
      );
      expect((hi! + 0.05) / (lo! + 0.05)).toBeGreaterThanOrEqual(3);
      expect(m.heightDelta).toBeLessThanOrEqual(0.5);
      expect(m.widthDelta).toBeLessThanOrEqual(0.5);
    });

    // The swap mark: index 0 is an O2 day in the real sprint sequence and
    // the seeded log is an AT, so this fixture IS a swapped row.
    test("the swapped row names what the plan asked for, at the vetted --ink-3 token", async ({
      page,
    }) => {
      const mark = page.locator(".plan-row-swap");
      await expect(mark).toHaveCount(1);
      await expect(mark).toHaveText("INSTEAD OF O2");

      const color = await mark.evaluate((el) => getComputedStyle(el).color);
      // --ink-3 #57544c: 6.69:1 on --page, 6.30:1 on --surface-sunken.
      // Deliberately NOT --ink-4, which is 4.48:1 on --surface-sunken.
      expect(color).toBe("rgb(87, 84, 76)");

      // The mark sits on its own line (variant B), so it must be BELOW
      // the name rather than beside it — measured, not assumed from the
      // grid rule.
      const nameBox = (await page
        .locator(".plan-row-done .plan-row-name")
        .boundingBox())!;
      const markBox = (await mark.boundingBox())!;
      expect(markBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height);

      // The badge follows what was ROWED, not what the plan asked.
      await expect(page.locator(".plan-row-done .type-badge")).toHaveText("AT");
    });

    // Substitution spec (2026-09-02) §Mechanism 3, exit criterion 3, Gate
    // 0 (James: "make sure to still center the chips"; "the chips are
    // still not vertically centered"). Two stand-ins seeded through the
    // real POST — the supported producer — on top of the describe's own
    // swapped AT row: a Just Row with `advancesPlan: true` lands on plan
    // index 1 (an AT day) wearing the JR chip and `INSTEAD OF AT`. The
    // layout claim lives HERE and not in jsdom, which returns zero rects
    // for everything and would pass any CSS at all ⟨G1⟩: on every
    // two-line row, the badge slot's vertical centre is within 1px of the
    // name+mark block's centre, for the TypeBadge and the chip alike —
    // the rule moves every swapped row's badge on purpose. Mutation:
    // delete `grid-row: 1 / -1` from `.plan-row-swapped`'s slot rule and
    // both rows fail by about half the mark line.
    test.describe("with a Just Row that stood in for a session", () => {
      test.beforeEach(async ({ page }) => {
        const result = await page.evaluate(async () => {
          const res = await fetch("/api/logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workoutId: null,
              workoutTitle: "Just Row",
              workoutType: null,
              held: null,
              pain: null,
              notes: null,
              steps: [],
              source: "timer",
              timeSeconds: 600,
              advancesPlan: true,
            }),
          });
          return { ok: res.ok, status: res.status, body: await res.text() };
        });
        if (!result.ok) {
          throw new Error(
            `stand-in seed failed: ${result.status} ${result.body}`,
          );
        }
        await page.goto("/plan");
        await expect(page.locator("a.plan-row-done")).toHaveCount(2);
        await expect(page.locator(".free-row-chip")).toHaveCount(1);
      });

      test("the stand-in row wears the JR chip, names Just Row, and is marked INSTEAD OF AT — no type badge, no unknown box", async ({
        page,
      }) => {
        const row = page.locator(".plan-row").nth(1);
        await expect(row).toHaveClass(/plan-row-swapped/);
        await expect(row.locator(".free-row-chip")).toHaveText("JR");
        await expect(row.locator(".type-badge")).toHaveCount(0);
        await expect(row.locator(".plan-row-badge-unknown")).toHaveCount(0);
        await expect(row.locator(".plan-row-name")).toHaveText("Just Row");
        await expect(row.locator(".plan-row-swap")).toHaveText("INSTEAD OF AT");
      });

      test("on every two-line row the badge slot, number and glyph centre against name + mark, and the mark starts in the name's column", async ({
        page,
      }) => {
        const rows = page.locator(".plan-row-swapped");
        await expect(rows).toHaveCount(2);
        for (const [i, slot] of [
          [0, ".type-badge"],
          [1, ".free-row-chip"],
        ] as const) {
          const row = rows.nth(i);
          const box = async (sel: string) => {
            const b = await row.locator(sel).boundingBox();
            if (b === null) throw new Error(`no box for ${sel} on row ${i}`);
            return b;
          };
          const name = await box(".plan-row-name");
          const mark = await box(".plan-row-swap");
          // The block the badge must centre against: name on line one,
          // mark on line two — measured as the union of both boxes.
          const blockCentre =
            (name.y + Math.max(name.y + name.height, mark.y + mark.height)) / 2;
          for (const sel of [slot, ".plan-row-index", ".plan-row-status"]) {
            const b = await box(sel);
            expect(
              Math.abs(b.y + b.height / 2 - blockCentre),
              `${sel} on row ${i} is off the name+mark centre`,
            ).toBeLessThanOrEqual(1);
          }
          // The mark aligns with the name's left edge (grid column 3),
          // never with the badge's (column 2) — a mark that started under
          // the spanning badge would share its cell.
          expect(Math.abs(mark.x - name.x)).toBeLessThanOrEqual(1);
          const badge = await box(slot);
          expect(mark.x).toBeGreaterThanOrEqual(badge.x + badge.width);
        }
      });
    });
  });
});

// From-the-log spec (2026-08-18) §5, Task 6: design witnesses for the
// rows Tasks 4-5's own unit/e2e coverage and this task's own §4 sweep
// don't reach — tap targets, WCAG, and computed token contrast on both
// screens this spec ships, including EDIT MODE, which conditionally
// renders a set of interactive elements (Save/Cancel + the reused
// reflection card) no OTHER sweep in this file ever visits, since they
// only exist behind this one screen's own Edit tap.
test.describe("from-the-log (history list + detail view, §5)", () => {
  let logId: string;

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-fromlog-${testInfo.parallelIndex}@e2e.test`,
      name: "Design From The Log Tester",
    });
    logId = await postFromLogFixture(page);
  });

  test.describe("history list (/today/log)", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/today/log");
      await expect(page.locator(".today-log-row").first()).toBeVisible();
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations", async ({ page }) => {
      await assertNoA11yViolations(page);
    });

    test("no small mono label uses the failing --ink-4 color", async ({
      page,
    }) => {
      await assertNoFailingInk4Labels(page);
    });

    // §5G: the hero snippet's own literal example, rendered from REAL
    // stored numbers (not a unit-test mock) — `AVG 2:04.5 · 5,000 m`,
    // exactly `log.spec.ts`'s own e2e fixture proves the same numbers
    // format to, at the mono meta line's own vetted token color.
    test("the hero snippet renders the stored AVG/DISTANCE pair, at --ink-3 token color", async ({
      page,
    }) => {
      const hero = page.locator(".today-log-hero").first();
      await expect(hero).toHaveText("AVG 2:04.5 · 5,000 m");
      const color = await hero.evaluate((el) => getComputedStyle(el).color);
      expect(color).toBe("rgb(87, 84, 76)"); // --ink-3, 6.69:1 on --page
    });
  });

  test.describe("detail view, read-back (/today/log/:id)", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/today/log/${logId}`);
      await expect(
        page.getByRole("heading", { name: "Sea Fret" }),
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

    // §5D: "Dashed block (handoff): the answered fields as HELD · PAIN
    // 3/5 · LIKED segments ... note text beneath" — the dashed border is
    // the one genuinely new visual rule this row adds (index.css's own
    // comment: "only the read-back block and plan footer below are
    // genuinely new rules"); the two text colors are the shared ink
    // scale, computed live rather than trusted from a comment elsewhere.
    test("the read-back block is a dashed border, and its two text rows meet the token contrast pair", async ({
      page,
    }) => {
      const block = page.locator(".log-readback");
      await expect(block).toBeVisible();
      const style = await block.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          borderStyle: s.borderTopStyle,
          borderColor: s.borderTopColor,
        };
      });
      expect(style.borderStyle).toBe("dashed");
      expect(style.borderColor).toBe("rgb(201, 195, 178)"); // --rule-3

      await expect(page.locator(".log-readback-segments")).toHaveText(
        "HELD · PAIN 2/5 · LIKED",
      );
      const segmentColor = await page
        .locator(".log-readback-segments")
        .evaluate((el) => getComputedStyle(el).color);
      expect(segmentColor).toBe("rgb(27, 26, 23)"); // --ink, 15.41:1 on --page

      await expect(page.locator(".log-readback-note")).toHaveText(
        "Felt strong through the back half.",
      );
      const noteColor = await page
        .locator(".log-readback-note")
        .evaluate((el) => getComputedStyle(el).color);
      expect(noteColor).toBe("rgb(63, 60, 53)"); // --ink-2, 9.74:1 on --page
    });
  });

  test.describe("detail view, EDIT MODE (/today/log/:id, Edit tapped)", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/today/log/${logId}`);
      await page.getByRole("button", { name: "Edit" }).click();
      await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
    });

    // The reflection card's own controls are vetted ground (§8: "the
    // reflection card's controls" inherited from spec 1's own sweep) —
    // this sweep's job is proving THIS route's own conditionally-rendered
    // subtree (Save/Cancel alongside the reused card) clears the bars,
    // since no OTHER sweep in this file ever puts this route into edit
    // mode first.
    test("every visible interactive element, including Save/Cancel, has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations in edit mode", async ({ page }) => {
      await assertNoA11yViolations(page);
    });

    // §5D edit row, read precisely: "four clearable controls, same 46px
    // targets, PLUS Save/Cancel" — the 46px figure names the FOUR
    // reflection-card controls (spec 1's own vetted `.summary-held-chip`/
    // `.summary-pain-chip`, §8 vetted ground), not Save/Cancel, which the
    // row lists separately with no size figure of their own — so they
    // owe only the house 44px floor (CLAUDE.md's hard requirement),
    // already covered by the tap-target sweep above. Measured live
    // (fix round, first draft wrongly held Save/Cancel to 46px too and
    // found `.button-outline`'s real 44px — a correct-as-shipped value,
    // not a defect; the test's own assumption was wrong, not the app).
    test("the four reflection-card controls are each >=46px, and Save/Cancel each clear the house 44px floor", async ({
      page,
    }) => {
      const heldChip = page.getByRole("button", { name: "HELD" });
      const painChip = page.getByRole("button", { name: "Pain 3" });
      const save = page.getByRole("button", { name: "Save" });
      const cancel = page.getByRole("button", { name: "Cancel" });
      const heldBox = await heldChip.boundingBox();
      const painBox = await painChip.boundingBox();
      const saveBox = await save.boundingBox();
      const cancelBox = await cancel.boundingBox();
      expect(heldBox).not.toBeNull();
      expect(painBox).not.toBeNull();
      expect(saveBox).not.toBeNull();
      expect(cancelBox).not.toBeNull();
      expect(heldBox!.height).toBeGreaterThanOrEqual(46);
      expect(painBox!.height).toBeGreaterThanOrEqual(46);
      expect(saveBox!.height).toBeGreaterThanOrEqual(44);
      expect(cancelBox!.height).toBeGreaterThanOrEqual(44);
    });
  });

  test.describe("detail view, not found (/today/log/:id, an id that 404s)", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/today/log/00000000-0000-0000-0000-000000000000");
      await expect(page.getByText("This session is gone.")).toBeVisible();
    });

    // §5F: "renders `This session is gone.` with ← LOG; no auto-redirect"
    // — the copy and destination themselves are `e2e/log.spec.ts`'s own
    // N4 test's job (§4's own cold-entry trio); this sweep's job is the
    // ← LOG affordance's own tap target and this state's WCAG bar,
    // neither of which N4 checks.
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

// Phase LT spec 1, Task 4 (witness sweep): task-3-report.md's own note —
// `e2e/screenshots.spec.ts`'s "log-detail" capture already proves this
// exact fixture's TEXT/CLASS shape (row counts, cell text, the on-target
// row's CLASS absence); this describe adds the layer that leaves
// unwitnessed: the LIVE COMPUTED style on the same cells, via a real
// browser cascade — the on-target row's plain ink is an absent CLASS
// resolving to the ABSENT judge token, proven as a color, not a class
// name.
test.describe("from-the-log detail (Phase LT spec 1, Task 4: computed styles on the judged/on-target/SPM cells)", () => {
  let logId: string;

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-judgmentmix-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Judgment Mix Tester",
    });
    logId = await postJudgmentMixLog(page);
    await page.goto(`/today/log/${logId}`);
    await expect(page.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
  });

  // A new page state (four rows, TARGET+SPM on every one) never swept by
  // this file's own tap-target sweep before — `pnpm screenshots` renders
  // this exact fixture but never runs axe/tap-target checks against it.
  test("every visible interactive element has a >=44x44 tap target with TARGET/SPM present on all four rows", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations on the mixed judged/on-target/abstained list", async ({
    page,
  }) => {
    await assertNoA11yViolations(page);
  });

  // §1's on-target row (index 2, dev 118−118=0.0 — inside the ±0.5s
  // band): `screenshots.spec.ts`'s own capture already proves the CLASS
  // is absent (`not.toHaveClass(/summary-row-faster|summary-row-slower/)`)
  // — this proves the CONSEQUENCE, live: with neither class present, the
  // cascade resolves `.summary-row-pace`/`.summary-row-dev` to plain
  // `--ink`, never a `--judge-faster`/`--judge-slower` token surviving
  // through some other selector (a class-name check alone cannot tell
  // "no color rule fired" apart from "a DIFFERENT rule fired the same
  // token by coincidence" — computed style can).
  test("§1 on-target row: pace and dev compute to plain --ink, never a judge token — the absence proven, not assumed", async ({
    page,
  }) => {
    const onTargetRow = page.locator(".summary-row").nth(2);
    const paceColor = await onTargetRow
      .locator(".summary-row-pace")
      .evaluate((el) => getComputedStyle(el).color);
    expect(paceColor).toBe("rgb(27, 26, 23)"); // --ink
    expect(paceColor).not.toBe("rgb(29, 78, 137)"); // --judge-faster
    expect(paceColor).not.toBe("rgb(150, 39, 24)"); // --judge-slower

    const devColor = await onTargetRow
      .locator(".summary-row-dev")
      .evaluate((el) => getComputedStyle(el).color);
    expect(devColor).not.toBe("rgb(29, 78, 137)"); // --judge-faster
    expect(devColor).not.toBe("rgb(150, 39, 24)"); // --judge-slower
  });

  // §2's own ruling ("the authored target after the slash in quiet ink"),
  // on this fixture's OLD pre-split row (index 2 — `spm: 24`, no
  // `actualSpm`): the screenshot capture proves the text renders
  // measured-only ("24"); this proves the row 0/1 modern-shape quiet half
  // computes to the real --ink-3 token, live, the same check the monitor-
  // door describe above runs against a different fixture (Hoarfrost/Calm
  // Sea's own authored rates) — two independent fixtures pinning the same
  // color, never duplicating each other's row content.
  test("§2 SPM cell: the modern-shape quiet target half computes to --ink-3, live", async ({
    page,
  }) => {
    const rows = page.locator(".summary-row");
    await expect(rows.nth(0).locator(".summary-row-spm")).toHaveText("24 / 22");
    const quietColor = await rows
      .nth(0)
      .locator(".summary-row-spm-target")
      .evaluate((el) => getComputedStyle(el).color);
    expect(quietColor).toBe("rgb(87, 84, 76)"); // --ink-3, DEVIATIONS row 47
  });

  // The task brief's own words: "the aria-label live (one design-layer
  // accessible-name check on a judged row)". `rowJudgmentDescription`
  // itself is pinned exactly at the component level
  // (PostWorkoutSummary.test.tsx); this is the ONE live check proving the
  // composed string actually reaches a real browser's accessibility tree
  // on THIS door (from-the-log, `storedSummary.ts`'s §5C re-judge path) —
  // a different render path than the monitor-door describe's own live
  // check above, so this is a second, independent proof, not a repeat of
  // it. Row 1 (target 130, actual 140) deviates +10.0 -> SLOWER.
  test("the judged row's aria-label carries TARGET, SPM (both halves), and the judgment sentence — live, from-the-log door", async ({
    page,
  }) => {
    const slowerRow = page.locator(".summary-row").nth(1);
    const ariaLabel = await slowerRow.getAttribute("aria-label");
    expect(ariaLabel).toContain("target 2:10.0 per 500"); // fmtSplit(130)
    expect(ariaLabel).toContain("26 strokes per minute, target 22");
    expect(ariaLabel).toContain("10.0 slower than target");
  });
});

// Trace-rendering spec (Phase LT spec 3), Task 3, §5's own witness sweep —
// the design layer §7.6/§7.4's exit criteria name: computed styles no unit
// test can see (a real browser cascade resolving `var(--ink)` etc.),
// live tap targets/accessible names, and the structural absence of any
// interval-boundary mark. `postTraceLogFixture` seeds the stored door
// (`/today/log/:id`) — the live door renders the identical `<TraceChart>`
// (one component, §1's own "same rules on both" — no reason to duplicate
// every witness a second time against the other host).
test.describe("trace chart (Phase LT spec 3, Task 3: design witnesses)", () => {
  let logId: string;

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-trace-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Trace Tester",
    });
    logId = await postTraceLogFixture(page);
    await page.goto(`/today/log/${logId}`);
    await expect(page.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // §2's own toggle idiom: real controls, one per measure the series can
  // actually draw — this fixture carries pace/rate/hr readings on every
  // sample, so all three toggle buttons exist, each under its own spoken
  // name (`MEASURE_LABEL[m].spoken`, `TraceChart.tsx`).
  test("the toggle exposes three real controls (Pace/Stroke rate/Heart rate), each >=44x44", async ({
    page,
  }) => {
    for (const name of ["Pace", "Stroke rate", "Heart rate"]) {
      const button = page.getByRole("button", { name });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  // §2/§3: the line takes ink (never a judged token — a trace isn't a
  // verdict), the tick label takes the quiet ink-3. Computed live, not
  // trusted from the CSS source (house rule).
  test("the polyline strokes --ink and the y-axis tick label fills --ink-3", async ({
    page,
  }) => {
    const line = page.locator(".trace-line").first();
    await expect(line).toBeVisible();
    const stroke = await line.evaluate((el) => getComputedStyle(el).stroke);
    expect(stroke).toBe("rgb(27, 26, 23)"); // --ink, 17.11:1 on --surface

    const tickLabel = page.locator(".trace-tick-label").first();
    await expect(tickLabel).toBeVisible();
    const fill = await tickLabel.evaluate((el) => getComputedStyle(el).fill);
    expect(fill).toBe("rgb(87, 84, 76)"); // --ink-3, 7.43:1 on --surface
  });

  // trace-truth Task 3 (spec §4), exit criterion 7: the x-axis's own
  // labels, checked SEPARATELY from the y-axis test just above — both
  // share the same `.trace-tick-label` CSS rule, but this is the one
  // place the x-axis's own computed fill (not merely its class name) is
  // verified, live in a real browser cascade.
  test("the x-axis renders, is visible, and its labels fill --ink-3", async ({
    page,
  }) => {
    const xLabels = page.locator(".trace-tick-label-x");
    await expect(xLabels.first()).toBeVisible();
    expect(await xLabels.count()).toBeGreaterThanOrEqual(2);
    await expect(xLabels.first()).toHaveText("0:00");
    const fill = await xLabels
      .first()
      .evaluate((el) => getComputedStyle(el).fill);
    expect(fill).toBe("rgb(87, 84, 76)"); // --ink-3, 7.43:1 on --surface
  });

  // §5: "a text alternative naming the measure, its range, and the
  // direction of travel ... computed from the same model that draws,
  // never hand-written" — asserted with THIS fixture's own real values
  // (the series above starts at 140s/500m, ends at 112s/500m, fastest
  // 112s/500m — never rises above the start, so "fastest" and "at the
  // end" coincide here, which the regex allows for rather than assumes
  // away).
  test("the figure's accessible description names Pace with real m:ss.t values, not placeholder text", async ({
    page,
  }) => {
    const svg = page.locator(".trace-svg");
    const label = await svg.getAttribute("aria-label");
    expect(label).toMatch(
      /^Pace, \d+:\d{2}\.\d at the start to \d+:\d{2}\.\d at the end, fastest \d+:\d{2}\.\d/,
    );
    expect(label).toContain("2:20.0 at the start"); // pace 140s/500m
    expect(label).toContain("1:52.0 at the end"); // pace 112s/500m
  });

  // §4's own cut: NO interval boundary marks, ever, on this surface.
  // Structural, not a name-based guess — every `<line>` inside the chart
  // is an axis tick mark, x or y (one per tick label, `TraceChart.tsx`'s
  // own `ticksY.map`/`ticksX.map`, trace-truth Task 3), so a 1:1 count
  // rules out any extra mark a future regression might quietly add.
  test("no boundary marks: every SVG line is an axis tick, one-for-one with the tick labels", async ({
    page,
  }) => {
    const lineCount = await page.locator(".trace-svg line").count();
    const tickLabelCount = await page.locator(".trace-svg text").count();
    expect(lineCount).toBeGreaterThan(0);
    expect(lineCount).toBe(tickLabelCount);
    // Belt-and-braces: no element anywhere in the chart carries a class
    // or id even suggesting an interval/boundary concept.
    expect(
      await page.locator('.trace-figure [class*="boundary" i]').count(),
    ).toBe(0);
    expect(
      await page.locator('.trace-figure [class*="interval" i]').count(),
    ).toBe(0);
  });
});

// trace-truth Task 2 (spec §3, James's ruling: rests are DRAWN, but
// MARKED). Own describe block, own fixture (`traceLogSeriesWithRest`) —
// the block above's fixture carries no rest sample at all, so it can
// never exercise this.
test.describe("trace chart (trace-truth Task 2: rest-span design witness)", () => {
  let logId: string;

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-trace-rest-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Trace Rest Tester",
    });
    logId = await postTraceLogFixture(page, traceLogSeriesWithRest());
    await page.goto(`/today/log/${logId}`);
    await expect(page.getByRole("heading", { name: "Sea Fret" })).toBeVisible();
  });

  // The band exists and carries its computed token — never eyeballed
  // (house rule): `--trace-rest` (#97692a = rgb(151, 105, 42)), 4.72:1
  // against `--surface`, the only background this card ever sits on
  // (`tokens.css`'s own comment on the token carries the full computation).
  test("a rest band renders with its computed --trace-rest fill, and the polyline stays ONE unbroken segment across it", async ({
    page,
  }) => {
    const band = page.locator(".trace-rest-band").first();
    await expect(band).toBeVisible();
    const fill = await band.evaluate((el) => getComputedStyle(el).fill);
    expect(fill).toBe("rgb(151, 105, 42)"); // --trace-rest

    // §3: a rest is data, not a gap — the fixture's rest run introduces
    // no gap of its own (every sample stays 1s apart), so the default
    // (pace) trace must still be exactly one polyline, not fragmented
    // around the rest.
    expect(await page.locator(".trace-svg polyline").count()).toBe(1);
  });

  // F-1 (James's ruling, review round 2; SUPERSEDED trace-truth Task 3):
  // the band now lives in the axis gutter, BELOW the plot floor, computed
  // in a REAL browser against the rendered SVG's own pixel geometry —
  // never inside the plot's own y-range (round 1's full-height fill let
  // the polyline cross it; round 2's short in-plot bar removed the
  // visual crossing but not the geometric possibility). Compared against
  // the SVG's own viewBox-to-pixel scale factor rather than a hardcoded
  // pixel count, so this stays correct at any viewport width.
  test("the rest band sits in the axis gutter, below the plot floor, never a full-height fill (real browser geometry)", async ({
    page,
  }) => {
    const svgBox = (await page.locator(".trace-svg").boundingBox())!;
    const bandBox = (await page
      .locator(".trace-rest-band")
      .first()
      .boundingBox())!;
    // viewBox is "0 0 320 174" (`TraceChart.tsx`'s own CHART_WIDTH/
    // CHART_HEIGHT, trace-truth Task 3: 140 plot + 34 axis gutter) — the
    // SVG's rendered pixel height maps 1:1 to that 174 user-unit height,
    // so this scale factor converts either way without hardcoding the
    // component's own internal constants beyond this one.
    const pxPerUnit = svgBox.height / 174;
    const bandTopUnits = (bandBox.y - svgBox.y) / pxPerUnit;
    const bandHeightUnits = bandBox.height / pxPerUnit;
    // Flush against the plot floor (PLOT_AREA_HEIGHT(140) -
    // BOTTOM_PAD(10) = 130), hanging DOWN — never floating higher, which
    // would put it back inside the plot's own `[10, 130)` y-range.
    expect(bandTopUnits).toBeGreaterThan(128);
    expect(bandTopUnits).toBeLessThan(132);
    // SHORT: well under the plot's own height (120).
    expect(bandHeightUnits).toBeLessThan(36); // 120 * 0.3
    expect(bandHeightUnits).toBeGreaterThan(0);
  });

  // Structural, not a name-based guess: the band rect sits strictly
  // BEFORE the polyline(s) in document order, so it paints beneath them
  // (SVG's own paint order is document order) — never a foreground
  // overlay that could obscure a real reading. Walks ALL descendants
  // (2026-08-20: the polylines moved one level deeper, into a
  // `<g clip-path>` wrapper — see `TraceChart.tsx`'s `PLOT_CLIP_*` — so
  // a direct-children-only query would no longer see them at all), and
  // keys on the REST BAND's own class rather than "any rect" — the new
  // clip-path's own `<rect>` (inside `<defs>`, never painted) sits even
  // earlier in document order and would otherwise let this pass for the
  // wrong reason.
  test("the rest band paints beneath the polyline (document order: rect before polyline)", async ({
    page,
  }) => {
    const order = await page.locator(".trace-svg *").evaluateAll((els) =>
      els.map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: el.getAttribute("class"),
      })),
    );
    const firstRestBand = order.findIndex((e) => e.cls === "trace-rest-band");
    const firstPolyline = order.findIndex((e) => e.tag === "polyline");
    expect(firstRestBand).toBeGreaterThanOrEqual(0);
    expect(firstPolyline).toBeGreaterThanOrEqual(0);
    expect(firstRestBand).toBeLessThan(firstPolyline);
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

  // PHASE WU deleted the test that stood here, "the warm-up line precedes
  // the step list" — the Builder's `+ N warm-up from your preferences` hint
  // and the `.builder-warmup-line` element it rendered are gone with the
  // setting they promised.

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
    const before = await stableBoundingBox(chip);
    await chip.click();
    await expect(page.getByText("WORKING")).toBeVisible();
    const after = await stableBoundingBox(chip);

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
    const beforeType = await stableBoundingBox(typeChipRow);
    const beforeDifficulty = await stableBoundingBox(difficultyRow);

    await page.getByRole("button", { name: "AT", exact: true }).click();
    await expect(page.getByText("COMFORTABLY HARD")).toBeVisible();

    const afterType = await stableBoundingBox(typeChipRow);
    const afterDifficulty = await stableBoundingBox(difficultyRow);

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
    // --ink. The alternative this rules out was the old per-level pain ramp
    // (--pain-ramp-4, #a3491f), deleted 2026-08-28 once nothing read it.
    expect(painBg).toBe("rgb(27, 26, 23)");

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
  // WCAG 4.1.2). UPDATED 2026-08-09 (warmup-setting spec): `wu` itself left
  // the `Step` union — it can no longer land anywhere, including via bulk
  // import (which now drops a `wu` line with a notice instead) or an
  // already-saved workout (migration 0008 stripped every stored one). The
  // standalone `r` (rest) row is the ONLY surviving Step kind with this
  // empty-sub-summary shape (`StepCard.tsx`'s own comment: "wu was
  // RowKind's other such member until 2026-08-09's warmup setting removed
  // it") — a `r` row can still only land in the builder via bulk import or
  // an already-saved (edit-mode) workout, same as `wu` used to, so this
  // describe is re-anchored to it instead of being deleted outright.
  test.describe("edit mode with a stored standalone rest row (r StepCard)", () => {
    const title = "Design R Sweep";

    // Unlike this file's other describe blocks (which only ever read/
    // navigate), every test here creates real data via bulk import under
    // the same title — Playwright runs different tests in this file across
    // several parallel workers, so a fixed shared email here raced two
    // workers' concurrent sign-ins/imports into each other (a 500 from the
    // backdoor route on a duplicate concurrent signup, and two "Design R
    // Sweep" workouts existing at once, breaking the row-filter locator).
    // `parallelIndex` gives each worker its own account, matching
    // builder.spec.ts's own "every test signs in as its own unique email"
    // convention one level up (per-worker instead of per-test, since the
    // three tests below share this describe's beforeEach/afterEach and run
    // one at a time within a given worker).
    test.beforeEach(async ({ page }, testInfo) => {
      await signInViaBackdoor(page, {
        email: `design-builder-r-${testInfo.parallelIndex}@e2e.test`,
        name: "Design Builder R Tester",
      });
      // Bulk import is the only way to get a standalone `r` row into a
      // personal (editable) workout — seeded library workouts are global
      // and can't be edited (EditWorkout.tsx refuses isGlobal workouts),
      // and the create-mode builder has no control that can author one (no
      // "+ REST" any more — docs/design/DEVIATIONS.md).
      await page.goto("/library/import");
      const text = [`${title} | O2 | easy | 2`, "r 5", "w 10' 6k @20"].join(
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
      // the stored standalone `r` row, neither ever expanded.
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

    test("zero WCAG 2A/2AA violations, including the collapsed r card's sub-summary button", async ({
      page,
    }) => {
      await assertNoA11yViolations(page);
    });

    // Structural pin, beyond the axe scan: the first card (the stored `r`
    // row) renders no `.step-card-sub` element at all — not an empty one —
    // proving the fix is "don't render it" and not "render it with empty
    // text" (which would still be a nameless focusable control). The second
    // card (the `w` row) still renders its own populated sub-summary, so
    // this also proves the fix is conditional per-row, not a blanket
    // removal of the control.
    test("the r card renders no sub-summary button; the w card still does", async ({
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

  test("body background and a baseline field's value ink match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    // The typed field keeps the accent value ink the retired
    // `.baseline-value` span carried — 5.94:1 on --surface, measured.
    const baselineValueColor = await page
      .locator(".baseline-input")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(baselineValueColor).toBe("rgb(181, 52, 31)"); // --accent
  });

  // The honest-empty round (2026-08-24). This account has NO baselines —
  // the state the "you" screenshot captures — so both fields are empty and
  // the seed is showing as a placeholder. The distinction James reported
  // missing has to be visible in the RENDERED pixels, not just in the DOM:
  // placeholder ink is --ink-4 (5.29:1 on --surface, computed), value ink
  // is --accent, and the two must not be the same colour.
  test("an unset baseline's placeholder renders in the dim ink, not the accent a saved value gets", async ({
    page,
  }) => {
    const field = page.locator(".baseline-input").first();
    await expect(field).toHaveValue("");
    await expect(field).toHaveAttribute("placeholder", "2:25.0");

    const { value, placeholder } = await field.evaluate((el) => ({
      value: getComputedStyle(el).color,
      placeholder: getComputedStyle(el, "::placeholder").color,
    }));
    expect(placeholder).toBe("rgb(111, 106, 95)"); // --ink-4, 5.29:1
    expect(placeholder).not.toBe(value);
  });

  // The unified control, on the surface that had no steppers at all — and
  // the tap-target/axe sweeps above only ever see it in its unset state,
  // so this drives it into the materialised one and re-sweeps.
  test("the steppers reached the You editor: the first tap materialises the seed exactly, and the sweeps still pass with a value in the field", async ({
    page,
  }) => {
    const field = page.locator(".baseline-input").first();
    await expect(field).toHaveValue("");

    await page.getByRole("button", { name: "2k faster" }).click();

    // The seed itself (2:25.0), never 2:24.5.
    await expect(field).toHaveValue("2:25.0");
    await expect(field).not.toHaveAttribute("placeholder", /./);
    await assertTapTargets(page);
    await assertNoA11yViolations(page);
  });

  // MIN_SPLIT is 25 half-second taps below the seed, so this drives the
  // real control to its own floor rather than seeding one: the dead-end
  // button must dim, keep its 44×44 target, and stay out of axe's way.
  test("a dead-end stepper at MIN_SPLIT is aria-disabled and dimmed, and still passes the tap-target and axe sweeps", async ({
    page,
  }) => {
    const field = page.locator(".baseline-input").first();
    const faster = page.getByRole("button", { name: "2k faster" });
    // 1:00.0 from an empty field: one tap materialises 2:25.0, then 170
    // half-second taps reach the 60s floor. Typing gets there in three
    // keystrokes, which is the point of the round — do that instead.
    await field.click();
    await field.pressSequentially("100");
    await page.getByRole("button", { name: "2k slower" }).click();
    await page.getByRole("button", { name: "2k faster" }).click();
    await expect(field).toHaveValue("1:00.0");

    await expect(faster).toHaveAttribute("aria-disabled", "true");
    const color = await faster.evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgb(111, 106, 95)"); // --ink-4, 5.29:1 on --surface

    // `force`, deliberately: Playwright's own actionability check reads
    // `aria-disabled="true"` as "not enabled" and would sit here for 30s
    // rather than click. A real finger has no such courtesy, so the tap is
    // forced through — the handler's own refusal is what must hold, and
    // the client suite drives the same click via user-event, which honours
    // only the real `disabled` attribute.
    await faster.click({ force: true });
    await expect(field).toHaveValue("1:00.0");
    await assertTapTargets(page);
    await assertNoA11yViolations(page);
  });
});

// ui-notes round, item 2 / task-review Finding 5 (cheap sweep addition): a
// design sweep over the derivation-offer state itself — neither the plain
// "you screen" sweep above (both baselines unset) nor any other existing
// sweep ever renders `.baseline-derive-slot`/`.baseline-derive-done` at
// all. A partial raw-API seed is legitimate HERE (unlike
// onboarding.spec.ts's own reachability-proving test, PR #66 Finding 1):
// this sweep is about tap targets/contrast on an already-known state, not
// about proving the client's own Apply can produce it.
test.describe("you screen with the derivation offer visible (task review round, Finding 5)", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-you-offer@e2e.test",
      name: "Design You Offer Tester",
    });
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/baselines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k6Seconds: 122 }),
      });
      return { ok: res.ok, status: res.status, body: await res.text() };
    });
    if (!result.ok) {
      throw new Error(`baseline setup failed: ${result.status} ${result.body}`);
    }
    await page.goto("/you");
    await page
      .getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" })
      .waitFor();
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // Task-review round, Finding 2 (ship-risk): the actual, rendered proof
  // that accepting the offer never collapses the layout — the real browser
  // boundingBox() comparison the client-level test's own comment defers to
  // (jsdom has no layout engine to measure this against).
  test("accepting the offer does not change the slot's rendered height — the fix for the ghost-tap hazard", async ({
    page,
  }) => {
    const slot = page.locator(".baseline-derive-slot");
    // `stableBoundingBox`, not the raw `boundingBox()` this used until the
    // 2026-08-21 flake hunt REPRODUCED it: `waitFor()` resolves when the
    // confirmation text ATTACHES, which is before the slot's own reflow has
    // finished, so `after.y` was read mid-layout. Measured failure:
    // expected 291, received 286 — a five-pixel shift that is the reflow,
    // not a regression. The helper was already imported by this file and
    // simply unused here.
    const before = await stableBoundingBox(slot);
    expect(before).not.toBeNull();

    await page.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }).click();
    await page.getByText("ESTIMATED").waitFor();

    const after = await stableBoundingBox(slot);
    expect(after).not.toBeNull();
    expect(after!.height).toBe(before!.height);
    expect(after!.y).toBe(before!.y);
  });

  // James, 2026-08-24: the offer button ran the full card width while the
  // fields it belongs to are inset by their "2K"/"6K" label, so a button
  // and a field sat stacked at two visibly different widths. Both edges
  // now derive from `--baseline-label-col` (index.css), and this measures
  // the consequence in a real browser rather than trusting the rule: the
  // button's box must match the field's box it belongs to, on BOTH edges.
  // Deleting either the label's fixed width or the slot's padding-left
  // moves one edge and reddens this.
  test("the derive offer's button spans exactly the field above it, not the whole card", async ({
    page,
  }) => {
    const field = page.locator(".baseline-row .baseline-field").first();
    const button = page.getByRole("button", {
      name: "ESTIMATE FROM 6K (−7s)",
    });

    const fieldBox = await stableBoundingBox(field);
    const buttonBox = await stableBoundingBox(button);
    expect(fieldBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();

    // Sub-pixel tolerance only: these are the same computed inset, so any
    // real drift is whole pixels.
    expect(Math.abs(buttonBox!.x - fieldBox!.x)).toBeLessThan(1);
    expect(Math.abs(buttonBox!.width - fieldBox!.width)).toBeLessThan(1);
  });

  test("the inert 'ESTIMATED' line clears ink contrast, and the sweep re-passes axe with it rendered", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "ESTIMATE FROM 6K (−7s)" }).click();
    const done = page.getByText("ESTIMATED");
    await done.waitFor();

    const color = await done.evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgb(87, 84, 76)"); // --ink-3, 7.43:1 on --surface

    await assertTapTargets(page);
    await assertNoA11yViolations(page);
  });

  // Re-review round (PR #66): `.baseline-row`'s own trailing-divider rule
  // used to key off `:last-of-type` (matches by TAG, not class — the last
  // `<div>` among ALL sibling divs), which `.baseline-derive-slot` broke
  // for the 6K-TARGET case specifically (the mirror test below): the slot
  // became the last div, so the 6k row's border-bottom reappeared as a
  // stray divider. This 2k-target case was NEVER actually broken (the 6k
  // row — with no offer slot after it — was always the true last div
  // here), so this assertion is the "stayed correct" half of the pair, not
  // a regression guard on its own.
  test("no stray divider under the 6k row (this direction was never broken — the mirror test below is the regression guard)", async ({
    page,
  }) => {
    const style = await page
      .locator(".baseline-row", { hasText: "6k" })
      .evaluate((el) => getComputedStyle(el).borderBottomStyle);
    expect(style).toBe("none");
  });
});

// Re-review round (PR #66): the CONFIRMED regression, verified live —
// {k2Seconds: real, k6Seconds: null} (a rower who rowed only the 2k) puts
// `.baseline-derive-slot` directly after the 6K row, which used to break
// `.baseline-row:last-of-type`'s tag-based matching and leave a stray
// border-bottom under the 6k row. Fixed via `:has(~ .baseline-row)`
// (index.css) — this is the mirror of the "you screen with the derivation
// offer visible" block above, same sweep shape, opposite direction.
test.describe("you screen with the derivation offer visible (6k-target mirror, re-review round)", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-you-offer-6k@e2e.test",
      name: "Design You Offer 6K Tester",
    });
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/baselines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k2Seconds: 100 }),
      });
      return { ok: res.ok, status: res.status, body: await res.text() };
    });
    if (!result.ok) {
      throw new Error(`baseline setup failed: ${result.status} ${result.body}`);
    }
    await page.goto("/you");
    await page
      .getByRole("button", { name: "ESTIMATE FROM 2K (+7s)" })
      .waitFor();
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // The regression itself, pinned structurally: computed
  // `border-bottom-style` on the 6k row (the one immediately followed by
  // the offer slot in THIS direction) must be "none", never a stray
  // "solid".
  test("no stray divider under the 6k row with the offer slot directly after it (the confirmed regression)", async ({
    page,
  }) => {
    const style = await page
      .locator(".baseline-row", { hasText: "6k" })
      .evaluate((el) => getComputedStyle(el).borderBottomStyle);
    expect(style).toBe("none");
  });
});

// THE EMAIL MAY NOT REFLOW THE PAGE (2026-08-27). Found by an antagonist
// pass on the capture suite, and it falsifies a ROADMAP item marked DONE
// on 2026-08-20: `e2e/helpers.ts`'s `RUN_ID` was made fixed-LENGTH by
// construction and the reflow was declared fixed, but the layout reads
// WIDTH, and Archivo has no tabular figures (measured in the running
// stack at 13px: ten `1` = 67.734px, ten `8` = 74.625px; a 6-char base36
// suffix spans 17.41px to 67.09px). Twelve sampled run ids spread 9.23px,
// straddling the wrap boundary — so the same address LENGTH rendered
// either two or three lines depending on which characters it drew, and
// three lines pushed four whole You captures down by a row band
// (48,610-62,167px of image diff, an independent coin flip per run).
//
// This is a real product bug, not only a test-harness one: any user whose
// address is long enough gets the same push. The fix clamps the address to
// one line (`min-width: 0` on the flex child plus ellipsis on the value),
// so the block's height stops depending on its content at all.
//
// ASSERT THE DIMENSION THE LAYOUT READS, which is the lesson that produced
// this test: the pin is the BLOCK'S HEIGHT against a long address, never
// the string's length or its character set.
test.describe("you screen: the address may not reflow the identity block", () => {
  test("the address renders on exactly ONE line and is clamped, however long it is", async ({
    page,
  }) => {
    // `signInViaBackdoor` appends `RUN_ID` to whatever is passed, so every
    // e2e address is already long — that is the point, and it is why an
    // earlier draft of this test passed vacuously: BOTH its "short" and
    // "long" cases wrapped to the same 42px (three lines), so comparing
    // them proved nothing. Measure the element against ITS OWN line box
    // instead of against another address.
    await signInViaBackdoor(page, {
      email: `design-you-${"n".repeat(48)}@e2e.test`,
      name: "Design You Tester",
    });
    await page.goto("/you");

    const email = await page.locator(".you-email").evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        offsetHeight: (el as HTMLElement).offsetHeight,
        lineHeight: parseFloat(cs.lineHeight),
        fontSize: parseFloat(cs.fontSize),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    });

    // ONE LINE. `lineHeight: normal` computes to a number in Chromium, so
    // this is a real comparison; the fallback keeps it honest if a future
    // rule sets a keyword the parse cannot resolve.
    const oneLine = Number.isFinite(email.lineHeight)
      ? email.lineHeight
      : email.fontSize * 1.2;
    expect(email.offsetHeight).toBeLessThanOrEqual(Math.ceil(oneLine) + 1);

    // ...and genuinely clamped, not accidentally short: the content is
    // wider than the box showing it, which is what ellipsis means here.
    expect(email.scrollWidth).toBeGreaterThan(email.clientWidth);
  });
});

// Final whole-branch review, item 3: register the diagnostics door in the
// design sweep — Task 3's `/you/diagnostics` menu and the
// `/you/diagnostics/monitor-logs` list behind it shipped with no entry
// here (TESTING.md §"structural design assertions": "a new screen with no
// entry here is a screen the a11y/tap-target/token rules aren't actually
// checking"). Tokens/contrast below are the ones `index.css`'s own comment
// above `.diag-row` already records, computed and passed at Gate 0.
test.describe("diagnostics screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-diagnostics@e2e.test",
      name: "Design Diagnostics Tester",
    });
    await page.goto("/you/diagnostics");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and the Monitor logs card's title/caption ink match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const titleColor = await page
      .locator(".diag-card-title")
      .evaluate((el) => getComputedStyle(el).color);
    expect(titleColor).toBe("rgb(27, 26, 23)"); // --ink, 17.11:1 on --surface

    const captionColor = await page
      .locator(".diag-caption")
      .evaluate((el) => getComputedStyle(el).color);
    expect(captionColor).toBe("rgb(87, 84, 76)"); // --ink-3, 6.69:1 on --page
  });
});

/** A plausible mix of the driver's own real `log.record` kinds, same idiom
 *  `screenshots.spec.ts`'s own `sessionLogRing` uses (duplicated rather
 *  than shared across e2e files, this file's own established precedent for
 *  small fixture helpers) — a realistic ring shape, not a screenshot of a
 *  loop counter (agent-briefing's "realistic fixtures" rule). */
function designSweepSessionLogRing(n: number): string {
  const kinds = ["notify", "write", "status", "notify-first"];
  const entries = [{ seq: 0, kind: "connect", detail: "PM5 432331249" }];
  for (let i = 1; i < n - 1; i += 1) {
    entries.push({
      seq: i,
      kind: kinds[i % kinds.length]!,
      detail: `0x00${(31 + (i % 9)).toString(16)} ${i.toString(16).padStart(2, "0")}`,
    });
  }
  if (n > 1) entries.push({ seq: n - 1, kind: "terminal", detail: "finished" });
  return JSON.stringify(entries.slice(0, n));
}

// Realistic, populated state (RF3: an empty fixture would leave the sweep's
// tap-target/axe pass never exercising `.diag-copy`, the only interactive
// element this screen has beyond the back link) — two entries, matching
// `sessionLogHistory.ts`'s own single-key array shape (M-6, final
// whole-branch review item 4; `sessionId` added at review round 2, items
// 1+2 — an entry missing it fails `isStoredEntry`'s shape check and is
// dropped as corrupt, same as any other malformed entry, so this fixture
// must carry one per entry or the screen renders its EMPTY state instead):
// newest first.
test.describe("diagnostics: monitor logs screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-diagnostics-logs@e2e.test",
      name: "Design Diagnostics Logs Tester",
    });
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: "ergomatic:session-log-history",
      value: JSON.stringify([
        {
          sessionId: "design-sweep-newest",
          savedAt: now.toISOString(),
          exported: designSweepSessionLogRing(37),
        },
        {
          sessionId: "design-sweep-oldest",
          savedAt: yesterday.toISOString(),
          exported: designSweepSessionLogRing(9),
        },
      ]),
    });
    await page.goto("/you/diagnostics/monitor-logs");
    await page
      .getByText(/EVENTS/)
      .first()
      .waitFor();
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background, a card's 'when' line and the COPY button ink match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const whenColor = await page
      .locator(".diag-log-when")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(whenColor).toBe("rgb(27, 26, 23)"); // --ink, 17.11:1 on --surface

    const copyColor = await page
      .locator(".diag-copy")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(copyColor).toBe("rgb(63, 60, 53)"); // --ink-2, 10.81:1 on --surface
  });
});

// Phase 6B (Task 5): the pre-workout countdown (handoff §5). A single
// 2-minute work step gets a rower here directly off Start (fast-follow
// Task 4: ConfirmTargets is deleted) without ever pressing SKIP —
// SKIP/CANCEL's own behavior is e2e/session.spec.ts's job, this sweep only
// needs the screen on-render.
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

  // CONNECTED-REVAMP TASK 7 (revision §5, spec §7): RUNNING and both
  // targets go ink — James's ruling 6 narrows DEVIATIONS row 1 (RUNNING)
  // rather than adding to it, and the packet's own TARGET SPLIT accent is
  // retired the same way (`timer-card-value-accent` no longer exists).
  test("the state pill goes ink, TARGET SPLIT/RATE go ink, and the ▶ control matches the token palette", async ({
    page,
  }) => {
    const stateColor = await page
      .locator(".timer-state")
      .evaluate((el) => getComputedStyle(el).color);
    expect(stateColor).toBe("rgb(27, 26, 23)"); // --ink

    // A resolved SPLIT target, not an effort word — this TIME sweep's own
    // distinguishing case from the EFFORT sweep below.
    await expect(page.locator(".timer-card-value").first()).not.toHaveText(
      "ALL OUT",
    );
    const targetColor = await page
      .locator(".timer-card-value")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(targetColor).toBe("rgb(27, 26, 23)"); // --ink

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

  // CONNECTED-REVAMP TASK 7 (revision §5, spec §7): Pause is the surface's
  // only level-1 control now — NEXT falls back to the same neutral
  // `.timer-control` look ◀ already has (surface fill, ink-2 text), not the
  // accent/on-color fill it wore before this task.
  test("the NEXT control (not ▶) is what renders, on the neutral (not accent) palette", async ({
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
    expect(styles.background).toBe("rgb(255, 253, 247)"); // --surface
    expect(styles.color).toBe("rgb(63, 60, 53)"); // --ink-2
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
    await expect(page.locator(".timer-card-value").first()).toHaveText(
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

  // CONNECTED-REVAMP TASK 7 (revision §5): the effort word is ink now, not
  // accent (`timer-card-value-accent` retired — both TARGET cards render
  // through the plain `.timer-card-value` rule).
  test("the effort word renders with no numeric range underneath, in ink", async ({
    page,
  }) => {
    const card = page.locator(".timer-card").first();
    await expect(card.locator(".timer-card-caption")).toHaveCount(0);
    const color = await card
      .locator(".timer-card-value")
      .evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgb(27, 26, 23)"); // --ink
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
      if (!controls || !screen) {
        throw new Error("timer controls and timer screen must both be present");
      }
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

// TIMER MODE, BOTH WAYS UP (spec 2026-09-02-timer-mode-design, exit
// criterion 2; handoff `docs/design/handoffs/2026-09-02-timer-mode/`).
// James's phone (build 823): END was plain header text in portrait and an
// accent box in landscape, and both orientations left a dead band at the
// bottom. The geometry below is the phone's OWN CSS size (393×852 /
// 852×393, the handoff's mechanical-reference captures), measured for the
// programmed timer AND the free row — the free row exposed the defects,
// but they were the shipped programmed timer's own. jsdom has no layout,
// so this is where the rulings are pinned as numbers; `Timer.test.tsx`
// pins the stylesheet's structure.
const PHONE_PORTRAIT = { width: 393, height: 852 };
const PHONE_LANDSCAPE = { width: 852, height: 393 };

async function assertOneEndBox(page: Page): Promise<void> {
  // Ruling 1: one END, the accent-outlined 44×44 box, whichever way up.
  const end = page.getByRole("button", { name: "END →" });
  const box = (await stableBoundingBox(end))!;
  expect(Math.round(box.width)).toBe(44);
  expect(Math.round(box.height)).toBe(44);
  const style = await end.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      color: s.color,
      border: s.borderTopWidth,
      borderColor: s.borderTopColor,
    };
  });
  expect(style.color).toBe("rgb(181, 52, 31)"); // --accent
  expect(style.border).toBe("1px");
  expect(style.borderColor).toBe("rgb(181, 52, 31)"); // --accent
}

async function assertNoVerticalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight);
}

/** Portrait (ruling 2): the ◀ ▶ row sits under Pause as one control group
 *  — its top within 12px of Pause's bottom — instead of clinging to the
 *  viewport's bottom edge (`margin-top: auto`, measured 264px of dead band
 *  on build 823). */
async function assertPortraitTimerGeometry(page: Page): Promise<void> {
  await page.setViewportSize(PHONE_PORTRAIT);
  await assertOneEndBox(page);
  const pause = (await stableBoundingBox(
    page.locator(".timer-control-pause"),
  ))!;
  const controls = (await stableBoundingBox(page.locator(".timer-controls")))!;
  const gap = controls.y - (pause.y + pause.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(12);
  await assertNoVerticalScroll(page);
}

/** Landscape (ruling 2): the controls row sits on the bottom edge (within
 *  16px of the viewport's bottom — build 823 measured 70px of page under
 *  it) and the face centres in the room the hero row gains (its vertical
 *  centre within 24px of the hero row's). */
async function assertLandscapeTimerGeometry(page: Page): Promise<void> {
  await page.setViewportSize(PHONE_LANDSCAPE);
  await assertOneEndBox(page);
  const controls = (await stableBoundingBox(page.locator(".timer-controls")))!;
  expect(
    PHONE_LANDSCAPE.height - (controls.y + controls.height),
  ).toBeLessThanOrEqual(16);
  const hero = (await stableBoundingBox(page.locator(".timer-hero")))!;
  const face = (await stableBoundingBox(page.locator(".timer-time")))!;
  const heroCentre = hero.y + hero.height / 2;
  const faceCentre = face.y + face.height / 2;
  expect(Math.abs(faceCentre - heroCentre)).toBeLessThanOrEqual(24);
  await assertNoVerticalScroll(page);
}

test.describe("timer mode, both ways up — programmed timer at the phone's own size", () => {
  const title = "Design Timer Mode Programmed";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-timer-mode-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Timer Mode Tester",
    });
    await setBaselines(page);
    // The handoff's own three-phase fixture (a rest between two work
    // steps), so the dots row, TOTAL LEFT and UP NEXT are all populated —
    // the fullest column this screen renders, where a dead band is
    // hardest to blame on an empty middle.
    await importBulk(
      page,
      [
        `${title} | AT | medium | 3`,
        "w 4:00 6k @20 r1.5",
        "w 4:00 6k @20",
      ].join("\n"),
    );
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 3/)).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("portrait 393×852: one END box, ◀ ▶ under Pause, no dead band", async ({
    page,
  }) => {
    await assertPortraitTimerGeometry(page);
  });

  test("landscape 852×393: one END box, controls on the bottom edge, face centred in the hero row", async ({
    page,
  }) => {
    await assertLandscapeTimerGeometry(page);
  });
});

test.describe("timer mode, both ways up — free row at the phone's own size", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-timer-mode-jr-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Timer Mode Tester",
    });
    // The Just Row door's Start Timer: one phase, nothing to fill the
    // middle — the emptiest column this screen renders, which is what
    // exposed the band on the phone.
    await page.goto("/justrow");
    await page.getByRole("button", { name: "Start Timer" }).click();
    await expect(page).toHaveURL(/\/session\/run$/);
    await expect(page.getByText("JUST ROW", { exact: true })).toBeVisible();
  });

  test("portrait 393×852: one END box, ◀ ▶ under Pause, no dead band", async ({
    page,
  }) => {
    await assertPortraitTimerGeometry(page);
  });

  test("landscape 852×393: one END box, controls on the bottom edge, face centred in the hero row", async ({
    page,
  }) => {
    await assertLandscapeTimerGeometry(page);
  });
});

// Phase PW Task 5: the post-workout summary (PostWorkoutSummary.tsx)
// replaces SessionComplete AND the old Log screen chrome wholesale — the
// session door's own "just finished" render, reached through the real
// completion hand-off (no intermediate SessionComplete screen any more:
// Timer.tsx's finish stage navigates straight to `/session/log`). Same
// tiny two-step fixture, k2Seconds floor, and non-suspect timing window as
// e2e/session.spec.ts's own completion test.
test.describe("post-workout summary (session door, just finished)", () => {
  const title = "Design Summary Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-summary-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Summary Tester",
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
    await expect(page).toHaveURL(/\/session\/log$/);
    // §2A: the title renders bare, no "Log" prefix.
    await expect(page.locator("h1.summary-title")).toHaveText(title);
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

  // Trace-rendering spec (Phase LT spec 3), Task 3, §1's own ABSENT case,
  // witnessed live: the timer door has no PM5, so no `series` prop is
  // ever passed (`LogSession.tsx`) — no chart, no empty frame.
  test("renders no trace chart — the timer door has no series to draw", async ({
    page,
  }) => {
    await expect(page.locator(".trace-figure")).toHaveCount(0);
  });

  test("no small mono label uses the failing --ink-4 color", async ({
    page,
  }) => {
    await assertNoFailingInk4Labels(page);
  });

  // Contrast, computed via the WCAG relative-luminance formula (index.css's
  // own comment on this new class family carries the full worked numbers;
  // this test proves the LIVE computed styles, not just the arithmetic).
  test("the eyebrow/hint labels and the lead hero value match the token palette", async ({
    page,
  }) => {
    const eyebrowColor = await page
      .locator(".summary-eyebrow")
      .evaluate((el) => getComputedStyle(el).color);
    expect(eyebrowColor).toBe("rgb(87, 84, 76)"); // --ink-3, 6.69:1 on --page

    // PM final-PR gate, condition round, 2026-08-17: the rust `--accent`
    // fill (5.35:1) is GONE — James's ruling ("neutral is best, prefer
    // black") after the PM gate flagged it colliding with the
    // --judge-slower red family on this same screen. Inherits `--ink`
    // from `.summary-hero-value` like every sibling hero; 15.41:1 on
    // --page (the house text default, so it clears the 4.5:1 floor
    // trivially — computed here rather than judged by eye).
    const leadValueColor = await page
      .locator(".summary-hero-lead .summary-hero-value")
      .evaluate((el) => getComputedStyle(el).color);
    expect(leadValueColor).toBe("rgb(27, 26, 23)"); // --ink, 15.41:1 on --page
  });

  // §2A: title block. Newsreader is the loaded serif family (spec's own
  // "font already loaded — vetted"); `--font-serif` resolves through
  // `.screen-title` (`.summary-title` adds only margin — index.css's own
  // rule — inheriting the house title size rather than a bespoke one).
  // DISCOVERED CONTRADICTION (reported per this repo's own "if the brief
  // contradicts what you observe, say so" rule, and recurring failure #10):
  // the spec's own §2A row reads "Newsreader 500 32px"; the shipped,
  // shared `.screen-title` rule (index.css:410) is 31px, not 32px — this
  // witness pins the REAL shipped value rather than silently asserting the
  // spec's unverified number. The 2px ink rule below the meta line
  // (`.summary-rule`) is its own, separately computed assertion.
  test("§2A title: Newsreader 500 (font-weight) at its shipped size, with the 2px ink rule below the meta line", async ({
    page,
  }) => {
    const title = page.locator(".summary-title");
    const titleStyles = await title.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        fontFamily: s.fontFamily,
        fontWeight: s.fontWeight,
        fontSize: s.fontSize,
      };
    });
    expect(titleStyles.fontFamily).toContain("Newsreader");
    expect(titleStyles.fontWeight).toBe("500");
    expect(titleStyles.fontSize).toBe("31px"); // shipped value; spec says 32px — see comment above

    const rule = page.locator(".summary-rule");
    const ruleStyles = await rule.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        borderTopWidth: s.borderTopWidth,
        borderTopStyle: s.borderTopStyle,
        borderTopColor: s.borderTopColor,
      };
    });
    expect(ruleStyles.borderTopWidth).toBe("2px");
    expect(ruleStyles.borderTopStyle).toBe("solid");
    expect(ruleStyles.borderTopColor).toBe("rgb(27, 26, 23)"); // --ink
  });

  // §2A: Back. The labeled BackLink (`← DONE`, not the generic `← BACK`
  // every other screen's BackLink renders) — non-destructive: the run
  // record survives the tap, unlike Discard. Reuses the exact click idiom
  // "today screen (unlogged session row)" already drives end to end; this
  // is the summary's OWN named witness for the §2A row itself, in this
  // describe block rather than borrowed from that one.
  test("§2A Back: ← DONE is the labeled BackLink and returns to /today without touching the saved run record", async ({
    page,
  }) => {
    const backLink = page.getByRole("link", { name: "← DONE" });
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL(/\/today$/);
    const runAfter = await page.evaluate(() =>
      localStorage.getItem("ergomatic.sessionRun"),
    );
    expect(runAfter).not.toBeNull();
  });

  // §2A meta + §2D hint, this fixture's own two properties: the phone-
  // timer door's source tag reads `· TIMER` (never `· PM5 …`/`· LOGGED BY
  // HAND`), and `singleTargetHint` fires here because exactly one of this
  // fixture's two steps carries a resolvable target split (the "w 0:03 6k"
  // step at k6Seconds=120, off 0 → 2:00.0; "w 100m max" has no ref at
  // all) — §2D's "TARGET m:ss only when the session has EXACTLY ONE
  // distinct target split" rule, witnessed present here; the absence half
  // gets its own fixture/describe below (multi-target).
  test("§2A meta reads date · time · TIMER; §2D hint reads TARGET 2:00.0 (this fixture's single resolvable target)", async ({
    page,
  }) => {
    await expect(page.locator(".summary-meta")).toHaveText(
      /^[A-Z]{3} \d{1,2} · \d{1,2}:\d{2} · TIMER$/,
    );
    await expect(page.getByText("TARGET 2:00.0")).toBeVisible();
  });

  // The interval list renders real content, never a bare dash: this
  // fixture's distance/effort step earns a real stopwatch reading (the
  // measured row), the time step has no actual at all (prescribed).
  test("the interval list renders both a prescribed and a measured row", async ({
    page,
  }) => {
    const rows = page.locator(".summary-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.last().locator(".summary-row-pace")).not.toBeEmpty();
  });

  // Discovered contradiction (reported, not silently worked around — the
  // brief's own "if the brief contradicts what you observe, say so" rule):
  // this test originally copied SessionComplete's own "no dead vertical
  // scroll" requirement verbatim. That rule fits a glanceable, single-
  // purpose screen (a title, a total, a short actuals list, three
  // buttons); the summary carries a title block, three heroes, a full
  // reflection card, an interval list AND the save stack — and the design
  // handoff's own §"Frame" line states this screen is "Single scroll, no
  // tabs" even in its PORTRAIT reference frame (`docs/design/handoffs/
  // 2026-08-12-post-workout/README.md`), never "fits without scrolling."
  // A live measurement at 844×420 (this fixture) reads `scrollHeight` 972
  // against a 420 `clientHeight` — the screen is genuinely, by design, a
  // scrolling one in landscape too, not a layout regression. What DOES
  // still matter, and is what this test checks instead: no HORIZONTAL
  // overflow (the one axis a mobile frame can never recover from), and
  // Discard — the stack's own last, most consequential control — is
  // present, enabled, and reachable by scrolling to it, not clipped away
  // by `overflow: hidden` or a fixed-height ancestor.
  test("no horizontal overflow at 844x420, and Discard (the stack's last child) is reachable by scrolling, not clipped", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 420 });

    const horizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBe(false);

    const discard = page.getByRole("button", {
      name: "DISCARD WITHOUT SAVING",
    });
    await discard.scrollIntoViewIfNeeded();
    await expect(discard).toBeVisible();
    await expect(discard).toBeEnabled();
  });

  // §2F: no active plan in this fixture — the lone save leads alone at
  // its own 54px (the accent slot), Discard sits last. It reads `Save`,
  // not `Save without logging` (timer-mode spec 2026-09-02, ruling 5:
  // with no plan there is nothing to log against, so the qualifier
  // survives only beneath `Log against plan` — the plan describes below).
  test("Save (no plan) renders at the specced 54px height, not the browser's default button chrome, and never says 'without logging'", async ({
    page,
  }) => {
    const lead = page.getByRole("button", { name: "Save" });
    await expect(lead).toHaveClass(/summary-save-lead/);
    const height = await lead.evaluate((el) => getComputedStyle(el).height);
    expect(height).toBe("54px");
    await expect(
      page.getByRole("button", { name: /Log against plan/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save without logging" }),
    ).toHaveCount(0);
  });

  // §2F: DISCARD WITHOUT SAVING is borderless mono at rest (the mock's own
  // literal spec), and arms in place to the house's solid-accent "Tap again
  // to discard" look (PROVENANCE item 4: the mock never designed its own
  // armed state).
  test.describe("Discard staged", () => {
    test.beforeEach(async ({ page }) => {
      await page
        .getByRole("button", { name: "DISCARD WITHOUT SAVING" })
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

    test("armed fills solid accent, cream label", async ({ page }) => {
      const armed = page.getByRole("button", { name: "Tap again to discard" });
      await expect(armed).toHaveClass(/summary-discard-armed/);
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

// Phase PW Task 5: the manual door's own summary render — the same
// PostWorkoutSummary component, reached via a workout's own detail screen
// ("Log it after"), not a completed timer run. Deliberately does NOT
// re-sweep every assertion the session-door block above already covers on
// the shared component — only what actually differs for this door: no
// tab-bar hiding, no hero block, and a workout-detail entry point instead
// of the finish hand-off.
//
// LT-0 (2026-08-18-target-truth-design.md §3): this door used to also
// differ by having no Discard button at all — the app's only discard-less
// save surface. It now has one, same idiom as the other two doors; see
// "renders LT-0's own Discard" below.
test.describe("post-workout summary (manual door)", () => {
  const title = "Design Manual Summary Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-manual-summary-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Manual Summary Tester",
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
    await expect(page.locator("h1.summary-title")).toHaveText(title);
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

  test("no mono label ≤11px still paints at --ink-4", async ({ page }) => {
    await assertNoFailingInk4Labels(page);
  });

  // Trace-rendering spec (Phase LT spec 3), Task 3, §1's own ABSENT case,
  // witnessed live: the by-hand door has no PM5 either — same "prop never
  // passed" idiom as the timer door's own equivalent test above.
  test("renders no trace chart — the by-hand door has no series to draw", async ({
    page,
  }) => {
    await expect(page.locator(".trace-figure")).toHaveCount(0);
  });

  // §2A meta: the manual door's own source tag — the third of the three
  // named variants (`· TIMER`/`· PM5 <id>`/`· LOGGED BY HAND`), witnessed
  // nowhere else in this file. This door's meta also carries no timeLabel
  // segment at all (§2A: "timeLabel is absent for the manual door" —
  // `SummaryMeta`'s own doc comment), so the line is date · source only,
  // never date · time · source.
  test("§2A meta: date · LOGGED BY HAND — the manual door's own source tag, with no time segment", async ({
    page,
  }) => {
    await expect(page.locator(".summary-meta")).toHaveText(
      /^[A-Z]{3} \d{1,2} · LOGGED BY HAND$/,
    );
  });

  // Unlike the session door (which hides the tab bar as the same full-bleed
  // holder family as the countdown/timer), this route keeps its tab bar
  // visible: this door touches no storage at all, so there's nothing an
  // early exit could leave dangling, and showing the tab bar costs it
  // nothing (AppRoutes.tsx's own comment on this route registration).
  test("the tab bar stays visible on this route, unlike the session door", async ({
    page,
  }) => {
    await expect(page.locator(".tabbar")).toHaveCount(1);
  });

  test("renders LT-0's own Discard, same idiom as the other two doors", async ({
    page,
  }) => {
    await expect(
      page.getByRole("button", { name: "DISCARD WITHOUT SAVING" }),
    ).toBeVisible();
  });

  test("no hero block — the manual door has no measurement of any kind (§2B's date-only fallback)", async ({
    page,
  }) => {
    await expect(page.getByText("AVG SPLIT")).toHaveCount(0);
    await expect(page.getByText("TIME", { exact: true })).toHaveCount(0);
    await expect(page.getByText("DISTANCE")).toHaveCount(0);
  });

  test("renders real content, never a bare dash: the PACES OFF caption, the row list, BY FEEL, and EXPECTED N/5", async ({
    page,
  }) => {
    // The manual door's lock moment IS save time (task brief) — PACES OFF
    // shows the CURRENT baseline directly (DESIGN_BASELINES' k6Seconds,
    // 120.0 -> "2:00.0"), while the row's own target shows the RESOLVED
    // split this step's own -2 offset produces (120 - 2 = 118.0 -> "1:58.0")
    // — two different, both-honest numbers, not a discrepancy. Only "6K"
    // renders (no step here references "2k" at all).
    await expect(page.getByText("PACES OFF 6K 2:00.0")).toBeVisible();
    await expect(page.locator(".summary-row")).toHaveCount(1);
    await expect(page.locator(".summary-row-target")).toHaveText("1:58.0");
    await expect(page.getByText("BY FEEL")).toBeVisible();
    await expect(page.getByText("EXPECTED 3/5")).toBeVisible();
  });

  // §2D NOTES row (review fix round: this row had zero design-suite
  // witness — `PostWorkoutSummary.test.tsx`'s own NOTES test only fires
  // `onNotes` and checks the placeholder string via RTL, never a computed
  // style). The four literal properties the row names: "Dashed textarea
  // on `--page`... min-height 74, no resize".
  test("§2D NOTES: dashed textarea on --page, min-height >= 74px, never resizable", async ({
    page,
  }) => {
    const notes = page.locator(".summary-notes-textarea");
    await expect(notes).toBeVisible();
    const styles = await notes.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        borderStyle: s.borderStyle,
        background: s.backgroundColor,
        minHeight: s.minHeight,
        resize: s.resize,
      };
    });
    expect(styles.borderStyle).toBe("dashed");
    expect(styles.background).toBe("rgb(244, 241, 232)"); // --page
    expect(parseFloat(styles.minHeight)).toBeGreaterThanOrEqual(74);
    expect(styles.resize).toBe("none");
  });
});

// Review finding C1 (fix round): the summary's Task 5 CSS sweep deleted
// `.log-monitor-diag` from index.css while `MonitorLogRow`/
// `RecordingDownloadRow` (LogSession.tsx) kept rendering
// `className="log-monitor-diag"` — no design/e2e sweep ever exercised these
// rows (both are gated behind a sessionStorage stash / a dev-only recording
// seam that no other spec in this file sets up), so the regression shipped
// with a fully green suite. This block seeds BOTH seams before the summary
// ever mounts (each row's own `useState` lazy initializer reads its seam
// exactly once, on mount — seeding after render would not retroactively
// show it) and proves the RESTORED rule actually resolves on the live DOM,
// not merely that the button exists.
test.describe("post-workout summary — quiet diagnostics doors (review finding C1)", () => {
  const title = "Design Diagnostics Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-diagnostics-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Diagnostics Tester",
    });
    await setBaselines(page);
    // `importBulk` itself does a real `page.goto` (a fresh document load,
    // wiping any plain `window.*` property a previous `page.evaluate` set —
    // `sessionStorage` alone survives a same-origin reload). Seeding the
    // seams AFTER it, and after the workout-row/"Log it after" clicks below
    // (both client-side React Router transitions, no document reload), is
    // what makes BOTH seams actually reach the summary's mount.
    await importBulk(
      page,
      [`${title} | AT | medium | 3`, "w 1:00 6k-2"].join("\n"),
    );
    await page.locator(".workout-row").filter({ hasText: title }).click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
    await page.evaluate(() => {
      sessionStorage.setItem(
        "ergomatic:last-rowed-log",
        JSON.stringify([{ seq: 0, kind: "write", detail: "design-sweep" }]),
      );
      (
        window as unknown as {
          __pm5Recording__: {
            lines(): string[];
            eventCount(): number;
            download(): Promise<void>;
          };
        }
      ).__pm5Recording__ = {
        lines: () => [],
        eventCount: () => 0,
        download: () => Promise.resolve(),
      };
    });
    await page.getByRole("link", { name: "Log it after" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);
    await expect(page.locator("h1.summary-title")).toHaveText(title);
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      sessionStorage.removeItem("ergomatic:last-rowed-log");
    });
    await cleanupByTitle(page, title);
  });

  test("both rows render (the seams engaged) and the restored .log-monitor-diag rule resolves live — not UA-default buttons", async ({
    page,
  }) => {
    const monitorRow = page.getByRole("button", {
      name: "MONITOR LOG · COPY",
    });
    const recordingRow = page.getByRole("button", {
      name: "RECORDING · DOWNLOAD",
    });
    await expect(monitorRow).toBeVisible();
    await expect(recordingRow).toBeVisible();

    for (const row of [monitorRow, recordingRow]) {
      const className = await row.evaluate(
        (el) => (el as HTMLElement).className,
      );
      expect(className).toContain("log-monitor-diag");
      const style = await row.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          minHeight: cs.minHeight,
          borderStyle: cs.borderStyle,
          background: cs.backgroundColor,
          color: cs.color,
        };
      });
      // A UA-default `<button>` never lands on exactly these four values
      // together — this is the "the class name resolves to real rules"
      // witness the review demanded, not just "the button exists".
      expect(style.minHeight).toBe("44px");
      expect(style.borderStyle).toBe("none");
      expect(style.background).toBe("rgba(0, 0, 0, 0)");
      expect(style.color).toBe("rgb(87, 84, 76)"); // --ink-3, 6.69:1 on --page
    }
  });
});

// Today enhancements (Task 4): the Log screen's plan toggle, with a plan
// actually active — no other design sweep in this file ever chooses a plan
// before reaching either Log door, so the toggle has never been rendered
// under this file's own axe/tap-target sweeps at all. Reuses the manual
// door (no timer run needed to reach it, unlike the session door) plus this
// file's own top-level `choosePlan`/`resetPlanProgress` helpers.
// §2F: the old separate toggle is gone — the save stack's own two buttons
// carry the plan choice now, swapping which one leads based on
// plan/isOnboarding. This block replaces the toggle sweep with the save
// stack's own geometry/contrast under an active plan.
test.describe("post-workout summary (manual door, plan active — the save stack)", () => {
  const title = "Design Summary Save Stack Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-summary-savestack-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Summary Save Stack Tester",
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
    await expect(page.locator("h1.summary-title")).toHaveText(title);
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("every visible interactive element has a >=44x44 tap target, including both save buttons", async ({
    page,
  }) => {
    await assertTapTargets(page);
    const lead = page.getByRole("button", {
      name: "Log against plan · SESSION 1 OF 84",
    });
    const leadBox = await lead.boundingBox();
    expect(leadBox).not.toBeNull();
    expect(leadBox!.height).toBeGreaterThanOrEqual(44);
    expect(leadBox!.width).toBeGreaterThanOrEqual(44);

    const secondary = page.getByRole("button", {
      name: "Save without logging",
    });
    const secondaryBox = await secondary.boundingBox();
    expect(secondaryBox).not.toBeNull();
    expect(secondaryBox!.height).toBeGreaterThanOrEqual(44);
  });

  test("zero WCAG 2A/2AA violations with an active plan's save stack rendered", async ({
    page,
  }) => {
    await assertNoA11yViolations(page);
  });

  // Log against plan leads (accent fill, 54px); Save without logging is
  // the outline secondary (48px) — the geometry index.css's own comment
  // names for `.summary-save-lead`/`.summary-save-secondary`.
  test("Log against plan fills accent at 54px; Save without logging is the outline secondary at 48px", async ({
    page,
  }) => {
    const lead = page.getByRole("button", {
      name: "Log against plan · SESSION 1 OF 84",
    });
    await expect(lead).toHaveClass(/summary-save-lead/);
    const leadStyles = await lead.evaluate((el) => {
      const s = getComputedStyle(el);
      return { height: s.height, background: s.backgroundColor };
    });
    expect(leadStyles.height).toBe("54px");
    expect(leadStyles.background).toBe("rgb(181, 52, 31)"); // --accent

    const secondary = page.getByRole("button", {
      name: "Save without logging",
    });
    await expect(secondary).toHaveClass(/summary-save-secondary/);
    const secondaryHeight = await secondary.evaluate(
      (el) => getComputedStyle(el).height,
    );
    expect(secondaryHeight).toBe("48px");
  });
});

// Task 6 (property sweep): §2D's hint ABSENCE half — the session-door
// describe above witnesses PRESENCE (one distinct target -> "TARGET
// 2:00.0"); this fixture's own two steps resolve to TWO distinct target
// splits (2k @60s, 6k @120s — `setCustomBaselines` below), so
// `singleTargetHint` returns `undefined` for both (its own doc comment:
// "more than one ... both read as 'no hint'"). Both steps are TIME-phase
// (never distance), driven via the manual "▶ Next phase" skip-ahead
// control (`Timer.tsx`'s `handleNext`: `apply(advance)` on a non-last
// phase, `setFinishStaged(true)` on the last) rather than a real wait —
// `handleNext` never stages the suspect-actual confirm (that path is
// `handleDistanceNext`-only), so this reaches the summary in two clicks,
// no `waitForTimeout` needed.
test.describe("post-workout summary (session door, multi-target — no hint)", () => {
  const title = "Design Summary Multi-Target Sweep";

  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-summary-multitarget-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Summary Multi-Target Tester",
    });
    await setCustomBaselines(page, { k2Seconds: 60, k6Seconds: 120 });
    await importBulk(
      page,
      [`${title} | AN | easy | 2`, "w 5:00 2k", "w 3:00 6k"].join("\n"),
    );
    await startFromLibrary(page, title);
    await startAndSkipCountdown(page);
    await expect(page.getByText(/^STEP 1 OF 2/)).toBeVisible();
    await page.getByRole("button", { name: "Next phase" }).click();
    await expect(page.getByText(/^STEP 2 OF 2/)).toBeVisible();
    await page.getByRole("button", { name: "Next phase" }).click();
    await expect(page.getByText("Finish this session?")).toBeVisible();
    await page.getByRole("button", { name: "Finish session" }).click();
    await expect(page).toHaveURL(/\/session\/log$/);
    await expect(page.locator("h1.summary-title")).toHaveText(title);
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("§2D hint: no TARGET hint renders when the door's steps resolve to more than one distinct target split", async ({
    page,
  }) => {
    await expect(page.locator(".summary-row")).toHaveCount(2);
    await expect(page.getByText(/^TARGET /)).toHaveCount(0);
  });
});

// Task 6 (property sweep): §2F's "Onboarding" row — a real seeded global
// onboarding workout ("6K Test", `domain/onboarding.ts`'s own
// `ONBOARDING_TITLES.k6`, needs no baselines at all per that module's own
// doc comment), reached directly (never through Today's own dedicated
// no-baseline card, which this file has no fixture for) via the exact
// `libraryWorkoutId` + WorkoutDetail + "Log it after" idiom every other
// manual-door describe in this file already uses. A plan IS active
// (`choosePlan`/`resetPlanProgress`, same as the "plan active" describe
// above), so both save buttons render — the row under test is which one
// LEADS: 6I's "a baseline test must not silently consume plan session 1"
// survives here as button ORDER (§2F: "Save without logging LEADS and Log
// against plan demotes to the outline slot"), not the old pre-toggled
// state the spec's own §1 deviation table retired.
test.describe("post-workout summary (manual door, onboarding title + plan active)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-summary-onboarding-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Summary Onboarding Tester",
    });
    await choosePlan(page, "sprint");
    await resetPlanProgress(page);
    const id = await libraryWorkoutId(page, "6K Test");
    await page.goto(`/library/${id}`);
    await expect(page.locator("h1.workout-detail-title")).toHaveText("6K Test");
    await page.getByRole("link", { name: "Log it after" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);
    await expect(page.locator("h1.summary-title")).toHaveText("6K Test");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("§2F Onboarding: Save without logging leads (54px accent) and Log against plan demotes to the 48px outline slot", async ({
    page,
  }) => {
    const lead = page.getByRole("button", { name: "Save without logging" });
    await expect(lead).toHaveClass(/summary-save-lead/);
    const leadHeight = await lead.evaluate((el) => getComputedStyle(el).height);
    expect(leadHeight).toBe("54px");

    const secondary = page.getByRole("button", {
      name: "Log against plan · SESSION 1 OF 84",
    });
    await expect(secondary).toHaveClass(/summary-save-secondary/);
    const secondaryHeight = await secondary.evaluate(
      (el) => getComputedStyle(el).height,
    );
    expect(secondaryHeight).toBe("48px");
  });
});

// Task 6 (property sweep): the monitor door's own summary — §2E's judged-
// color/deviation-bar/legend rows, §2B's DISTANCE (R-B) and TIME (R-D,
// F-1's own re-observation surface) rows, and §2A's `PM5 <id>` meta row —
// none of which any fixture already in this file exercises (the
// interrupted fixture above carries only ONE measured actual, below
// finding 5's `count >= 2` judging floor). `buildCompletedMonitorRun`'s
// own doc comment above carries every number's derivation.
test.describe("post-workout summary (monitor door, completed — judged rows & machine totals)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-summary-monitor-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Summary Monitor Tester",
    });
    const workoutId = await seedCompletedMonitorRun(page);
    await page.goto(`/library/${workoutId}/log?from=monitor`);
    await expect(
      page.getByRole("heading", { name: "Hoarfrost" }),
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

  test("§2A meta: date · time · PM5 <id> — the connected door's own source tag, verbatim off run.deviceName", async ({
    page,
  }) => {
    await expect(page.locator(".summary-meta")).toHaveText(
      new RegExp(`^AUG 1 · \\d{1,2}:\\d{2} · ${MONITOR_DEVICE_NAME}$`),
    );
  });

  // F-1 (walk sheet): "m:ss exposes what Math.round hid" — this fixture's
  // own elapsed seconds (187+600+2400) plus the programmed rests for each
  // completed interval essentially never sums to an exact minute; asserted
  // structurally (never ending ":00") rather than to a hand-computed exact
  // total, since two of the three intervals' own `restSeconds` are not
  // independently verified anywhere in this repo (`buildCompletedMonitorRun`'s
  // own doc comment).
  test("§2B TIME: m:ss precision survives, never collapsed to a bare rounded minute", async ({
    page,
  }) => {
    const value = await page
      .locator(".summary-hero", {
        has: page.getByText("TIME", { exact: true }),
      })
      .locator(".summary-hero-value")
      .innerText();
    expect(value).toMatch(/^\d+:\d{2}$/);
    expect(value.endsWith(":00")).toBe(false);
  });

  // RC-5 (hero-truth, fix round 1): MONITOR_COMPLETED_ACTUALS carries no
  // `summaryTotals`, so this row is TIER B, non-legacy (its `logSeed`
  // never carries `kind: "warmup"`) — DISTANCE is now WORK-ONLY, Σ
  // `distanceMeters` alone, never R-B's old fused sum: 600+2000+10000 =
  // 12600, not the fused 12664 (which folded in the opening piece's 0m
  // and interval 1's 64m rest — those rest metres are no longer read by
  // this hero at all). None of this fixture's three actuals carries a
  // `restSeconds` field (only `restDistanceMeters` on two of them), so
  // fix round 1's I3 completeness gate can't derive a rest clause either
  // — the TOTAL line renders work-only too, with no clause: Σelapsed
  // 187+600+2400=3187s -> "53:07 total".
  test("§2B DISTANCE: work-only Σ, incl. the opening piece, whole meters — the machine's own fused TWD (12664) is no longer this hero", async ({
    page,
  }) => {
    const value = await page
      .locator(".summary-hero", {
        has: page.getByText("DISTANCE", { exact: true }),
      })
      .locator(".summary-hero-value")
      .innerText();
    expect(value).toBe("12600");
    await expect(page.locator(".summary-total-line")).toHaveText("53:07 total");
  });

  // Interval 1 (Hoarfrost, avgSplit 150) deviates +18.0 from its OWN 132s
  // target -> SLOWER; interval 2 (Calm Sea, avgSplit 120) deviates −12.0
  // from the SAME 132s target -> FASTER (Phase LT spec 1's re-baseline —
  // `buildCompletedMonitorRun`'s own doc comment has the full arithmetic).
  // Rows render in `[opening piece, interval 1, interval 2]` order — all
  // three come from the SAME `monitorWorkRows` index order now; there is no
  // separate warm-up-row branch to special-case any more (Phase WU).
  test("§2E judged colors: the slower row paints --judge-slower, the faster row paints --judge-faster, and the legend renders", async ({
    page,
  }) => {
    const rows = page.locator(".summary-row");
    await expect(rows).toHaveCount(3);
    const slowerRow = rows.nth(1);
    const fasterRow = rows.nth(2);

    const slowerPaceColor = await slowerRow
      .locator(".summary-row-pace")
      .evaluate((el) => getComputedStyle(el).color);
    expect(slowerPaceColor).toBe("rgb(150, 39, 24)"); // --judge-slower

    const fasterPaceColor = await fasterRow
      .locator(".summary-row-pace")
      .evaluate((el) => getComputedStyle(el).color);
    expect(fasterPaceColor).toBe("rgb(29, 78, 137)"); // --judge-faster

    await expect(page.locator(".summary-legend")).toHaveText(
      "← FASTER (BLUE) · SLOWER (RED) →",
    );
  });

  // §1's own capped formula (`min(50, max(1.2, |dev|/1.6×50))`) — both
  // rows' deviations (18.0/12.0) are comfortably past the 1.6s threshold
  // that saturates the cap, so this fixture ALSO witnesses "a 4s outlier
  // must not paint past the track" (§1's own words), not merely that a
  // width renders at all. Anchoring: SLOWER bars grow from center-right
  // (`left: 50%`), FASTER bars grow from center-left (`right: 50%`) — the
  // OTHER side is asserted empty so a mutant that sets both would still be
  // caught (same discipline PostWorkoutSummary.test.tsx's own C3 unit
  // tests use, applied here against the real computed styles).
  test("§2E deviation bar: track height, anchored direction, and the 50% width cap on this outlier pair", async ({
    page,
  }) => {
    const rows = page.locator(".summary-row");
    const slowerRow = rows.nth(1);
    const fasterRow = rows.nth(2);

    const trackHeight = await slowerRow
      .locator(".summary-row-bar-track")
      .evaluate((el) => getComputedStyle(el).height);
    expect(trackHeight).toBe("14px");

    const slowerBarStyle = await slowerRow
      .locator(".summary-row-bar")
      .evaluate((el) => {
        const style = (el as HTMLElement).style;
        return { width: style.width, left: style.left, right: style.right };
      });
    expect(slowerBarStyle.width).toBe("50%");
    expect(slowerBarStyle.left).toBe("50%");
    expect(slowerBarStyle.right).toBe("");

    const fasterBarStyle = await fasterRow
      .locator(".summary-row-bar")
      .evaluate((el) => {
        const style = (el as HTMLElement).style;
        return { width: style.width, left: style.left, right: style.right };
      });
    expect(fasterBarStyle.width).toBe("50%");
    expect(fasterBarStyle.right).toBe("50%");
    expect(fasterBarStyle.left).toBe("");

    const slowerDev = await slowerRow.locator(".summary-row-dev").innerText();
    expect(slowerDev).toBe("+18.0");
    const fasterDev = await fasterRow.locator(".summary-row-dev").innerText();
    expect(fasterDev).toBe("−12.0"); // U+2212, the house minus sign
  });

  // R-C's own reconciliation row: rendered and measured, but never judged
  // (no bar, no tick — Phase LT spec 1's re-baseline: an EFFORT-ref
  // interval has no target by definition, so there is nothing to judge it
  // against; `rowJudgment`, summaryModel.ts, never reaches such a row
  // through the targetSplit/actualSource gate a work row goes through —
  // it is built straight from the machine actual). Before Phase WU this
  // was the warm-up interval specifically; the rule and the row are the
  // same, only the reason for reaching them changed (see the test's own
  // comment below).
  test("§2E opening row: numbered, measured, UNJUDGED — no bar, no tick", async ({
    page,
  }) => {
    // PHASE WU CHANGED WHAT THIS ROW IS. It was the unnumbered `WARM-UP`
    // row — `.summary-row-warmup` / `.summary-row-warmup-label`, both
    // deleted with the row type. Row 1 is an ordinary numbered row now, and
    // it is still measured and still unjudged, because the fixture's
    // opening piece is an EFFORT step and carries no target to judge
    // against. Same rule, different reason for reaching it.
    const openingRow = page.locator(".summary-row").first();
    await expect(openingRow).toBeVisible();
    await expect(openingRow.locator(".summary-row-index")).toHaveText("1");
    await expect(openingRow.locator(".summary-row-time")).not.toBeEmpty();
    await expect(openingRow.locator(".summary-row-pace")).not.toBeEmpty();
    await expect(openingRow.locator(".summary-row-bar")).toHaveCount(0);
    await expect(openingRow.locator(".summary-row-bar-tick")).toHaveCount(0);
  });

  // Task 4 (witness sweep): §2's own ruling, live — "the authored target
  // after the slash in QUIET ink" — proven as a real computed color, not
  // merely the `.summary-row-spm-target` class name resolving to SOME
  // rule (the C1 review finding earlier in this file shows a class name
  // alone can be a false positive). Both judged rows carry a real §2
  // target half (Hoarfrost's own authored `spm: 22`, Calm Sea's `spm: 20`
  // — `o2.ts`), so either suffices; the slower row is used for both this
  // and the aria-label test below, one fixture read twice.
  test("§2 SPM cell: the quiet target half's computed color is --ink-3, live", async ({
    page,
  }) => {
    const rows = page.locator(".summary-row");
    const slowerRow = rows.nth(1);
    await expect(slowerRow.locator(".summary-row-spm")).toHaveText("24 / 22");
    const quietColor = await slowerRow
      .locator(".summary-row-spm-target")
      .evaluate((el) => getComputedStyle(el).color);
    expect(quietColor).toBe("rgb(87, 84, 76)"); // --ink-3, DEVIATIONS row 47
  });

  // Task 4 (witness sweep): the review fix round's `rowJudgmentDescription`
  // (PostWorkoutSummary.tsx) is pinned exactly by
  // `PostWorkoutSummary.test.tsx`'s own per-state RTL tests — this is the
  // one LIVE check the brief calls for: the composed string actually
  // reaches the real browser DOM's `aria-label` attribute on a genuinely
  // judged row, not just a React Testing Library render. Interval 2
  // (Calm Sea, avgSplit 120 vs its own 132s target) deviates −12.0 ->
  // FASTER; substrings only (not the full string) — the exact wording is
  // already pinned at the component level, this proves live delivery.
  test("the judged row's aria-label carries TARGET, SPM (both halves), and the judgment sentence — live on the real DOM", async ({
    page,
  }) => {
    const rows = page.locator(".summary-row");
    const fasterRow = rows.nth(2);
    const ariaLabel = await fasterRow.getAttribute("aria-label");
    expect(ariaLabel).toContain("target 2:12.0 per 500"); // fmtSplit(132)
    expect(ariaLabel).toContain("26 strokes per minute, target 20");
    expect(ariaLabel).toContain("12.0 faster than target");
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

// Phase 6H Task 7: News/Reader/Releases design sweeps. Every describe below
// seeds a MIXED read state first (one article — "baselines" — marked read
// via a real PUT, idempotent so re-running against a persisted database is
// harmless) rather than the virgin state, per the brief: a virgin-state
// sweep would never render the read-row/read-square styling this phase
// exists to prove.
async function markArticleRead(page: Page, slug: string): Promise<void> {
  const result = await page.evaluate(async (s) => {
    const res = await fetch(`/api/article-reads/${s}`, { method: "PUT" });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, slug);
  if (!result.ok) {
    throw new Error(`markArticleRead failed: ${result.status} ${result.body}`);
  }
}

test.describe("news screen (mixed read state)", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-news@e2e.test",
      name: "Design News Tester",
    });
    await markArticleRead(page, "baselines");
    await page.goto("/news");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations against a mixed read state", async ({
    page,
  }) => {
    await assertNoA11yViolations(page);
  });

  // News §8's own "no START anywhere on this tab" rule (design decision 2)
  // — accent is reserved for the unread square and text links, never a
  // level-1 button, computed structurally rather than trusted by eye.
  test("no .button-l1 anywhere on News — the no-START rule", async ({
    page,
  }) => {
    await expect(page.locator('[class*="button-l1"]')).toHaveCount(0);
  });

  test("the read row title computes --ink-3/400-weight, and clears 4.5:1 against both --page and --surface", async ({
    page,
  }) => {
    const readTitle = page.locator(
      'a.news-row[data-read="true"] .news-row-title',
    );
    const styles = await readTitle.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, fontWeight: s.fontWeight };
    });
    expect(styles.color).toBe("rgb(87, 84, 76)"); // --ink-3
    expect(styles.fontWeight).toBe("400");

    const pageBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(pageBg).toBe("rgb(244, 241, 232)"); // --page
    // The read row itself sits inside .news-pinned, whose own background
    // literally IS --surface — measuring it here (rather than restating
    // the hex) means this assertion breaks if that card's background ever
    // stops being --surface, not just if the token's value changes.
    const surfaceBg = await page
      .locator(".news-pinned")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(surfaceBg).toBe("rgb(255, 253, 247)"); // --surface

    // WCAG 2.1 relative-luminance contrast ratio, computed from the three
    // measured `rgb(r, g, b)` computed-style strings above — not asserted
    // against a pre-computed constant, so a future token change that
    // quietly drops below 4.5:1 fails here rather than only being caught
    // by eye. Inlined into the evaluate callback (Playwright serializes
    // the whole function across the browser boundary) rather than shared
    // as a Node-side helper, matching this file's other `page.evaluate`
    // computations.
    const ratios = await page.evaluate(
      ({ fg, bgPage, bgSurface }) => {
        function channel(c: number) {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        }
        function luminance(rgb: string) {
          const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
          if (!m) throw new Error(`unparseable colour: ${rgb}`);
          const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
          return (
            0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
          );
        }
        function contrastRatio(a: string, b: string) {
          const la = luminance(a);
          const lb = luminance(b);
          const lighter = Math.max(la, lb);
          const darker = Math.min(la, lb);
          return (lighter + 0.05) / (darker + 0.05);
        }
        return {
          vsPage: contrastRatio(fg, bgPage),
          vsSurface: contrastRatio(fg, bgSurface),
        };
      },
      { fg: styles.color, bgPage: pageBg, bgSurface: surfaceBg },
    );
    // Measured, not the brief's own UNVERIFIED ~6.8/~7.0 estimate — see
    // task-7-report.md for the exact numbers.
    expect(ratios.vsPage).toBeGreaterThanOrEqual(4.5);
    expect(ratios.vsSurface).toBeGreaterThanOrEqual(4.5);
  });

  test("unread square is --accent, read square is page-coloured", async ({
    page,
  }) => {
    // workout-types stays unread throughout this describe's seed (only
    // "baselines" is marked read), so its square is the live unread case.
    const unreadSquare = page.locator(
      'a.news-row[href="/news/workout-types"] .news-square',
    );
    await expect(unreadSquare).toHaveAttribute("data-read", "false");
    const unreadBg = await unreadSquare.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(unreadBg).toBe("rgb(181, 52, 31)"); // --accent

    const readSquare = page.locator(
      'a.news-row[href="/news/baselines"] .news-square',
    );
    await expect(readSquare).toHaveAttribute("data-read", "true");
    const readBg = await readSquare.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(readBg).toBe("rgb(244, 241, 232)"); // --page
  });
});

test.describe("reader screen (/news/baselines, mixed read state)", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-reader@e2e.test",
      name: "Design Reader Tester",
    });
    await markArticleRead(page, "baselines");
    await page.goto("/news/baselines");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("no .button-l1 anywhere on the reader", async ({ page }) => {
    await expect(page.locator('[class*="button-l1"]')).toHaveCount(0);
  });

  // Round 4 (architectural): the reader is now a `position: fixed` overlay
  // (`.overlay-screen`) — the risk that change carries is the tab bar
  // ending up underneath it. Pinned computed, not judged by eye: the tab
  // bar is visible and its stacking context sits above the overlay's.
  test("the tab bar stays visible and above the reader overlay in stacking", async ({
    page,
  }) => {
    const tabbar = page.locator(".tabbar");
    await expect(tabbar).toBeVisible();
    const stacking = await page.evaluate(() => {
      const bar = document.querySelector(".tabbar");
      const overlay = document.querySelector(".overlay-screen");
      if (!bar || !overlay) return null;
      return {
        barZ: Number(getComputedStyle(bar).zIndex),
        overlayZ: Number(getComputedStyle(overlay).zIndex),
      };
    });
    expect(stacking).not.toBeNull();
    expect(stacking!.barZ).toBeGreaterThan(stacking!.overlayZ);
  });

  // ui-notes round, item 1 / task-review Finding 5 (cheap sweep addition):
  // `.reader-close` is a normal-flow flex child of `.reader-header` today,
  // not absolutely positioned, so it automatically sits inside `.screen`'s
  // own safe-area-aware padding (`calc(6px + env(safe-area-inset-top))`).
  // Pinned structurally so a FUTURE refactor that switches it to
  // `position: absolute; top: 0` (a plausible-looking "pin it to the
  // corner" change) can't silently put it under a real device's Dynamic
  // Island/notch without a test noticing — this environment's own
  // `env(safe-area-inset-top)` resolves to 0 (no real notch), so the
  // assertion is really "at or below the padded content edge," not a claim
  // about a specific inset value.
  test("the ✕ close sits INSIDE the safe-area-padded content box, not flush with the viewport edge (structural pin against a future absolute-positioning refactor)", async ({
    page,
  }) => {
    const main = page.locator("main.reader-screen");
    const mainBox = await main.boundingBox();
    const paddingTop = await main.evaluate((el) =>
      parseFloat(getComputedStyle(el).paddingTop),
    );
    expect(mainBox).not.toBeNull();

    const close = page.locator(".reader-close");
    const closeBox = await close.boundingBox();
    expect(closeBox).not.toBeNull();

    expect(closeBox!.y).toBeGreaterThanOrEqual(mainBox!.y + paddingTop);
  });
});

// The training pyramid (workout-types article) — TL-3's own gate.
//
// The client test pins the AUTHORED font sizes; only a real browser can say
// what they RENDER at, and that is the number the defect was about. The
// figure is a 320-unit viewBox inside `.reader-figure svg`'s 340px
// max-width, so a change to either — the CSS cap, the viewBox, or a
// `fontSize` — moves every label's real size at once. It shipped at 7.44px
// against the house 10px mono floor.
//
// Both orientations run because the figure's width is set by a DIFFERENT
// constraint in each: portrait 390 by `.screen`'s own width (390 - 40px
// padding = 350, capped to 340), landscape 844 by `.screen`'s 480px
// max-width (480 - 40 = 440, capped to 340). They agree today; a change to
// either bound would break only one of them.
test.describe("workout-types article, the training pyramid", () => {
  for (const viewport of [
    { width: 390, height: 844, label: "portrait" },
    { width: 844, height: 390, label: "landscape" },
  ] as const) {
    test(`every pyramid label renders at or above the 10px mono floor — ${viewport.label} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await signInViaBackdoor(page, {
        email: `design-pyramid-floor-${viewport.label}@e2e.test`,
        name: "Design Pyramid Tester",
      });
      await page.goto("/news/workout-types");
      await page.locator(".reader-figure svg").waitFor();
      await page.evaluate(() => document.fonts.ready);

      const measured = await page.evaluate(() => {
        const svg = document.querySelector(".reader-figure svg")!;
        // NOT `getComputedStyle(text).fontSize` — inside an SVG that returns
        // the AUTHORED value (a mutation to `fontSize="7"` read back as
        // "7px", not the 7.44px it actually painted), so it is blind to the
        // half of this defect that lives in CSS. The rendered size is the
        // authored size times the viewBox scale, and the scale is the box
        // the browser gave the svg over the viewBox's own width.
        const laidOutWidth = svg.getBoundingClientRect().width;
        const viewBoxWidth = Number(
          svg.getAttribute("viewBox")!.trim().split(/\s+/)[2],
        );
        const scale = laidOutWidth / viewBoxWidth;
        return {
          laidOutWidth,
          scale,
          labels: [...svg.querySelectorAll("text")].map((t) => ({
            text: t.textContent!.trim(),
            renderedPx: Number(t.getAttribute("font-size")) * scale,
          })),
        };
      });

      expect(measured.labels.length).toBe(8); // four type codes, four words
      // The scale is load-bearing above, so pin it rather than trusting it:
      // 340px of figure over a 320-unit viewBox. If `.reader-figure svg`'s
      // max-width or the viewBox moves, this says so directly instead of
      // letting every label's px silently drift.
      expect(measured.laidOutWidth).toBe(340);
      expect(measured.scale).toBeCloseTo(1.0625, 4);
      for (const label of measured.labels) {
        expect(
          label.renderedPx,
          `"${label.text}" renders at ${label.renderedPx.toFixed(2)}px`,
        ).toBeGreaterThanOrEqual(10);
      }
    });
  }

  // The other half of the same change, and the reason the apex is
  // truncated: raising the words to the floor made SPEED WORK wider than a
  // pointed tip could hold. This measures each word against the band it
  // sits in, so it fails if a longer word arrives in `typeWords.ts`, if the
  // geometry narrows, or if a font size rises again — the three ways this
  // can silently clip.
  test("every plain word fits inside its own band, measured against the band's edges", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "design-pyramid-fit@e2e.test",
      name: "Design Pyramid Fit Tester",
    });
    await page.goto("/news/workout-types");
    await page.locator(".reader-figure svg").waitFor();
    await page.evaluate(() => document.fonts.ready);

    const fits = await page.evaluate(() => {
      const svg = document.querySelector(".reader-figure svg")!;
      const bands = [...svg.querySelectorAll("polygon")].map((p) => {
        const pts = p
          .getAttribute("points")!
          .trim()
          .split(/\s+/)
          .map((pair) => pair.split(",").map(Number) as [number, number]);
        const ys = [...new Set(pts.map(([, y]) => y))].sort((a, b) => a - b);
        // Each band is a trapezoid with a horizontal top and bottom edge, so
        // its half-width is linear in y between the two.
        const halfAt = (edgeY: number) => {
          const xs = pts.filter(([, y]) => y === edgeY).map(([x]) => x);
          return (Math.max(...xs) - Math.min(...xs)) / 2;
        };
        const top = ys[0];
        const bottom = ys[ys.length - 1];
        return {
          top,
          bottom,
          halfTop: halfAt(top),
          halfBottom: halfAt(bottom),
        };
      });

      // Cap height of IBM Plex Mono, measured in this same browser rather
      // than assumed: the words are all-caps, so their ink reaches this far
      // above the baseline, and THAT row is the narrowest part of the band
      // the word crosses.
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 300;
      const cx = canvas.getContext("2d")!;
      cx.fillStyle = "#fff";
      cx.fillRect(0, 0, 400, 300);
      cx.fillStyle = "#000";
      cx.font = "400 100px 'IBM Plex Mono'";
      cx.textBaseline = "alphabetic";
      cx.fillText("SPEEDWORK", 10, 200);
      const px = cx.getImageData(0, 0, 400, 300).data;
      let inkTopRow = 300;
      for (let y = 0; y < 300 && inkTopRow === 300; y++) {
        for (let x = 0; x < 400; x++) {
          if (px[(y * 400 + x) * 4] < 128) {
            inkTopRow = y;
            break;
          }
        }
      }
      const capHeightEm = (200 - inkTopRow) / 100;

      return [...svg.querySelectorAll("text")]
        .filter((t) => t.getAttribute("letter-spacing") !== null) // the words
        .map((t) => {
          const size = Number(t.getAttribute("font-size"));
          const baseline = Number(t.getAttribute("y"));
          const inkTop = baseline - capHeightEm * size;
          const band = bands.find(
            (b) => baseline > b.top && baseline <= b.bottom,
          )!;
          const half =
            band.halfTop +
            ((band.halfBottom - band.halfTop) * (inkTop - band.top)) /
              (band.bottom - band.top);
          return {
            text: t.textContent!.trim(),
            capHeightEm,
            // 1 unit for the polygon's own centred 2-unit --page stroke.
            clearanceEachSide: half - 1 - t.getComputedTextLength() / 2,
          };
        });
    });

    expect(fits.length).toBe(4);
    // A sanity floor on the measurement itself: a cap height that came back
    // as 0 would make every clearance look generous.
    expect(fits[0].capHeightEm).toBeGreaterThan(0.5);
    for (const fit of fits) {
      expect(
        fit.clearanceEachSide,
        `"${fit.text}" clears its band edge by ${fit.clearanceEachSide.toFixed(2)} units`,
      ).toBeGreaterThan(0);
    }
  });
});

test.describe("releases screen (/news/releases)", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-releases@e2e.test",
      name: "Design Releases Tester",
    });
    await markArticleRead(page, "baselines");
    await page.goto("/news/releases");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("no .button-l1 anywhere on release notes", async ({ page }) => {
    await expect(page.locator('[class*="button-l1"]')).toHaveCount(0);
  });
});

// --- Phase 7B, fix wave H2: the connected screens --------------------------
//
// Task-7 review L7 named this and it was then silently dropped: two
// full-screen surfaces plus a sheet, in two orientations, shipped with no
// browser accessibility gate in a repo that applies `assertNoA11yViolations`
// at ~40 other call sites. This section closes it with the SAME three
// helpers every other screen in this file uses — no bespoke assertions, no
// argument in place of a gate.
//
// Reaching these screens needs the fake-transport seam
// (`src/monitor/transports/index.ts`), which this compose stack's `web`
// image enables via `VITE_ENABLE_FAKE_MONITOR=1` (`compose.e2e.yml`). The
// injection idiom is `e2e/connected.spec.ts`'s, duplicated rather than
// shared, the same precedent as `cleanupByTitle` at the top of this file.
//
// The interstitial's pairing/programming/ready states are TRANSIENT — each
// one holds for a real fraction of a second and then the app moves on — so
// each state gets ONE test that runs all three sweeps back to back rather
// than this file's usual one-assertion-per-test shape. There is no way to
// re-enter a state a second time from the same walk; splitting them would
// mean three full walks each and three chances to catch a different moment.

/** Five 100m distance steps. `createFakeTransport` asserts every incoming
 *  programming byte against its OWN `script.program`
 *  (`connected.spec.ts`'s header), so this and `CONNECTED_BULK_TEXT` below
 *  have to agree BY CONSTRUCTION. Five (not one) so pane C renders its full
 *  grid rather than a single row. */
const CONNECTED_PROGRAM = {
  intervals: Array.from({ length: 5 }, () => ({
    type: "work" as const,
    kind: "distance" as const,
    value: 100,
    targetSplit: null,
    displaySpm: null,
    restSeconds: 0,
  })),
};

const CONNECTED_BULK_TEXT = (title: string): string =>
  [`${title} | AN | easy | 1`, ...Array<string>(5).fill("w 100m max")].join(
    "\n",
  );

/** 18 intervals — one past `ConnectedProgressBar.tsx`'s own
 *  `MAX_NOTCH_BOUNDARIES = 16` threshold (17 interior boundaries), the
 *  §2A property-table row's fallback-mode trigger. Same shape as
 *  `CONNECTED_PROGRAM` (`createFakeTransport` asserts programming bytes
 *  against its own `script.program`, so this and `LONG_BULK_TEXT` below
 *  agree BY CONSTRUCTION), used only by the fallback test — the armed
 *  frame alone is enough to prove which mode the bar renders in, no
 *  rowing story needed. */
const LONG_PROGRAM = {
  intervals: Array.from({ length: 18 }, () => ({
    type: "work" as const,
    kind: "distance" as const,
    value: 100,
    targetSplit: null,
    displaySpm: null,
    restSeconds: 0,
  })),
};

const LONG_BULK_TEXT = (title: string): string =>
  [`${title} | AN | easy | 1`, ...Array<string>(18).fill("w 100m max")].join(
    "\n",
  );

/** `pm5/parse.ts`'s `WORKOUTSTATE_INTERVALWORKTIME`, copied as a plain
 *  number — this file drives the app from outside and never imports its
 *  modules (`connected.spec.ts` makes the same copy for the same reason). */
const WORKOUTSTATE_ROWING = 4;

/** Far enough out that nothing in the story can land during sign-in,
 *  import, pairing or programming — the walk pumps the clock itself once
 *  the surface is up. */
const CONNECTED_STORY_START_MS = 8000;

interface StoryStatus {
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

function rowingAt(
  atMs: number,
  over: Partial<StoryStatus> = {},
): StoryStatus & Record<string, unknown> {
  return {
    atMs,
    kind: "status",
    workoutState: WORKOUTSTATE_ROWING,
    elapsedSeconds: 10,
    distanceMeters: 70,
    spm: 24,
    currentSplit: 108,
    heartRateBpm: 142,
    programIntervalIndex: 0,
    ...over,
  };
}

/** A session that rows through interval 0's boundary into interval 1 and
 *  then STOPS SPEAKING. No further frames arrive, so nothing accumulates
 *  toward `PAUSED_FRAME_HOLD` and the surface holds this reading for as
 *  long as the sweeps need — the paused footer is swept by
 *  `FREEZING_STORY` below instead, which is the fixture that reaches it. */
const ROWING_STORY = [
  rowingAt(CONNECTED_STORY_START_MS, { elapsedSeconds: 5, distanceMeters: 30 }),
  {
    atMs: CONNECTED_STORY_START_MS + 300,
    kind: "boundary" as const,
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
  // distance continue cumulatively from interval 0's own boundary (15s/
  // 100m) instead of resetting per-interval (item 12) — historically this
  // rendered METERS LEFT as 0 (Math.max clamp) through every interval-1
  // frame this story reaches, not a real countdown. CR2 spec 3 Task 4
  // retired METERS LEFT and TOTAL M off `PaneLive` outright (spec §3 fate
  // table); this disclosure is kept as a fact about the FIXTURE's own
  // shape, not a claim about a currently-rendered cell.
  rowingAt(CONNECTED_STORY_START_MS + 600, {
    elapsedSeconds: 17,
    distanceMeters: 115,
    programIntervalIndex: 1,
  }),
];

/** The same opening, then a currentSplit no realistic erg reports (10:50 per
 *  500m) — connected-revamp Task 3's own cap: "the hero cannot clip" (design
 *  spec §6/revision §3) is pinned at the model layer (`surfaceModel.test
 *  .ts`'s own pace-cap it) and unit level (`ConnectedSurface.test.tsx`);
 *  this is the rendered-geometry half — a wildly-off reading through the
 *  real driver still lands on screen as the house dash, never a numeral
 *  wider than the hero was sized for. 650, not something larger: the wire
 *  encodes Current Pace as a `U16LE` in hundredths of a second
 *  (`domain/monitor/pm5/statusFrames.ts`'s `writeU16LE(bytes, 7,
 *  Math.round(s.currentSplit * 100))`, max 655.35s) — a first attempt at
 *  3661 overflowed that field and silently wrapped to 384.2s, which is a
 *  real fixture-authoring trap this file's own comment records so nobody
 *  re-picks a value past the wire's own ceiling. */
const EXTREME_SPLIT_STORY = [
  rowingAt(CONNECTED_STORY_START_MS, { elapsedSeconds: 5, distanceMeters: 30 }),
  {
    atMs: CONNECTED_STORY_START_MS + 300,
    kind: "boundary" as const,
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
  // WIRE-IMPOSSIBLE (review IMPORTANT-2, same shape as `ROWING_STORY`'s own
  // interval-1 tick above — session-cumulative, not per-interval-reset):
  // historically rendered METERS LEFT as 0. Retired off `PaneLive`
  // entirely (CR2 spec 3 Task 4) — same fixture-shape note as above.
  rowingAt(CONNECTED_STORY_START_MS + 600, {
    elapsedSeconds: 17,
    distanceMeters: 115,
    programIntervalIndex: 1,
    currentSplit: 650,
  }),
];

/** The same opening, then many IDENTICAL frames and no resume — four is all
 *  `PAUSED_FRAME_HOLD` needs, and with nothing after them the paused footer
 *  stays on screen indefinitely instead of racing the sweep. */
const FREEZING_STORY = [
  ...ROWING_STORY,
  // TWO MORE PROGRESSING FRAMES BEFORE THE FREEZE (2026-08-26), for the
  // reason `connected.spec.ts`'s own story carries at length: the predicate
  // now asks whether THIS interval has been pulled in before it will call a
  // hold a pause (`PULL_EVIDENCE_FRAMES`, five consecutive frames of
  // strictly increasing distance), so a fixture that freezes after three
  // frames is a rower who never started rowing — which is now, correctly,
  // not a pause.
  ...[125, 133].map((distanceMeters, i) =>
    rowingAt(CONNECTED_STORY_START_MS + 700 + i * 100, {
      elapsedSeconds: 18 + i,
      distanceMeters,
      programIntervalIndex: 1,
    }),
  ),
  // WIRE-IMPOSSIBLE (review IMPORTANT-2, same shape again — 20s/140m
  // continues cumulatively past `ROWING_STORY`'s own 17s/115m rather than
  // resetting per-interval): historically rendered METERS LEFT as 0
  // through every one of these frozen frames. Retired off `PaneLive`
  // entirely (CR2 spec 3 Task 4) — same fixture-shape note as above.
  ...Array.from({ length: 12 }, (_, i) =>
    rowingAt(CONNECTED_STORY_START_MS + 900 + i * 300, {
      elapsedSeconds: 20,
      distanceMeters: 140,
      currentSplit: 110,
      heartRateBpm: 140,
      programIntervalIndex: 1,
    }),
  ),
];

/** `pm5/parse.ts`'s `WORKOUTSTATE_INTERVALREST`, copied as a plain number —
 *  this file drives the app from outside and never imports its modules
 *  (`WORKOUTSTATE_ROWING` above does the same). `3`, NOT `4`
 *  (`WORKOUTSTATE_ROWING`) — `connected.spec.ts`'s own header names the
 *  exact bug that swapping these two produces. */
const WORKOUTSTATE_RESTING = 3;

/** RC-24: one pull, then a rest — `programIntervalIndex: 0` on the resting
 *  tick because `toProgramIndex` undoes the wire's own forward attribution
 *  (`domain/monitor/pm5/intervalIndex.ts`: a rest tick's machine index is
 *  ONE HIGHER than the interval it belongs to, so authoring OUR index here
 *  keeps this tick filed against the SAME interval — index 0 — the rowing
 *  tick before it already put the active row on).
 *
 *  `restSeconds: 595` is the TRUE ceiling, not a synthetic stress value —
 *  fix round, review finding B corrected an earlier version of this story
 *  that used `3599` (59:59), reasoning from the wrong layer
 *  (`domain/validate.ts`'s builder-authoring bound, `0:01..60:00`, which
 *  governs what a rower may TYPE, not what a connected session can carry).
 *  Every authored program still has to pass `compileProgram`, which
 *  rejects a folded rest over `MAX_REST_SECONDS = 595` (9:55) as
 *  `rest-too-long` (`domain/monitor/program.ts:200-204`, Table 19 of the
 *  CSAFE spec — the PM5's own `CSAFE_PM_SET_RESTDURATION` ceiling, pinned
 *  by `domain/monitor/program.test.ts`'s "compileProgram: rest-too-long").
 *  595 is that exact, INCLUSIVE bound — the widest string this cell can
 *  ever hold in a real connected session, not a margin beyond it.
 *
 *  `currentSplit: 117.8`, fix round 2, item A — deliberately NOT 0. A
 *  dead-stop `currentSplit: 0` already dashes via a DIFFERENT, older rule
 *  ("a zero split is not a reading"), which would make this story unable
 *  to tell the fix-round-2 suppression apart from that pre-existing one —
 *  the exact gap James caught ("So /500m in landscape isn't '-' during
 *  rest???"): a real, decaying coasting split, `1:57.8`, the same number
 *  the round-1 capture actually showed. If the model-level suppression
 *  ever regressed, THIS is the value that would expose it; `0` would not. */
const RESTING_STORY = [
  rowingAt(CONNECTED_STORY_START_MS, { elapsedSeconds: 5, distanceMeters: 30 }),
  {
    atMs: CONNECTED_STORY_START_MS + 400,
    kind: "status" as const,
    workoutState: WORKOUTSTATE_RESTING,
    elapsedSeconds: 5,
    distanceMeters: 30,
    spm: 0,
    currentSplit: 117.8,
    heartRateBpm: 140,
    programIntervalIndex: 0,
    restSeconds: 595,
  },
];

/** 200 ms per write for the SURFACE walks — `connected.spec.ts` proved
 *  120 ms enough to make pairing and programming observable at all, and
 *  `screenshots.spec.ts` raised it to 200 ms for the same reason. These
 *  walks only pass THROUGH the interstitial, so the delay is kept low. */
const CONNECTED_DELAY_WRITES_MS = 200;

/** …and 1200 ms for the INTERSTITIAL sweeps, which have to stand still on
 *  a state rather than pass through it. `delayWrites` gates `connect()`
 *  and every individual 20-byte chunk, so this is also how long the
 *  PAIRING screen holds (one `connect()`), while PROGRAMMING holds for the
 *  whole five-interval chunk count times this. READY needs no budget at
 *  all since the dwell's removal (2026-08-08 operator ruling): it holds
 *  until the rower acts. Each test below still asserts its state is STILL
 *  on screen after its sweep — without that assertion an over-slow axe
 *  run would silently sweep the NEXT screen and report a pass. */
const INTERSTITIAL_DELAY_WRITES_MS = 1200;

async function injectConnectedFake(
  page: Page,
  events: unknown[],
  delayWritesMs = CONNECTED_DELAY_WRITES_MS,
  program: unknown = CONNECTED_PROGRAM,
): Promise<void> {
  await page.addInitScript(
    ({ program: p, events: e, delayWritesMs: delay }) => {
      window.__pm5FakeScript__ = {
        program: p,
        events: e,
        deviceName: "PM5 918273645",
        delayWritesMs: delay,
      } as typeof window.__pm5FakeScript__;
    },
    { program, events, delayWritesMs },
  );
}

/** Signs in, seeds baselines, imports the fixture and presses Connect —
 *  stopping the instant the interstitial mounts, so the caller can catch
 *  whichever transient state it came for. */
/** `cleanupByTitle` deletes ONE match. These walks import their fixture on
 *  every run and a run that fails before its own cleanup leaves a copy
 *  behind, so the next run's `.workout-row` filter — a strict locator —
 *  resolves to two elements and fails for the wrong reason. Called on the
 *  way IN as well as out. */
async function cleanupAllConnected(page: Page, title: string): Promise<void> {
  for (let i = 0; i < 5; i += 1) await cleanupByTitle(page, title);
}

async function openConnected(
  page: Page,
  title: string,
  email: string,
  bulkText: string = CONNECTED_BULK_TEXT(title),
): Promise<void> {
  await signInViaBackdoor(page, { email, name: "Connected Design Tester" });
  await setBaselines(page);
  await cleanupAllConnected(page, title);
  await importBulk(page, bulkText);
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Connect" }).click();
}

/** The three sweeps this file applies everywhere else, in one call —
 *  ordered axe FIRST because it is by far the slowest of the three and the
 *  interstitial states it runs against are on a clock. */
async function sweep(page: Page): Promise<void> {
  await assertNoA11yViolations(page);
  await assertTapTargets(page);
  await assertNoFailingInk4Labels(page);
}

/** Advances the fake's virtual clock in one `page.evaluate` round trip and
 *  reads a predicate off the DOM in the same trip — `connected.spec.ts`'s
 *  own `pumpUntilPaused` idiom, and for its reason: the in-page auto-tick
 *  clock contributes ticks concurrently, so a Node-side tick and a
 *  separately-polling `expect` leave a gap neither side controls. */
async function pumpUntil(
  page: Page,
  selector: string,
  maxRealMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + maxRealMs;
  for (;;) {
    const found = await page.evaluate((sel) => {
      window.__pm5FakeControls__?.tick(200);
      return !!document.querySelector(sel);
    }, selector);
    if (found) return;
    if (Date.now() >= deadline) {
      await expect(page.locator(selector).first()).toBeVisible();
      return;
    }
  }
}

/** The same pump, keyed on painted TEXT rather than a class — the pane the
 *  surface lands on (B, live) shares no class with the pane whose data
 *  proves the story arrived, and "INTERVAL 2 OF 5" is the reading that says
 *  interval 0's boundary has been crossed. */
async function pumpUntilText(
  page: Page,
  text: string,
  maxRealMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + maxRealMs;
  for (;;) {
    const found = await page.evaluate((t) => {
      window.__pm5FakeControls__?.tick(200);
      return (document.body.textContent ?? "").includes(t);
    }, text);
    if (found) return;
    if (Date.now() >= deadline) {
      await expect(page.getByText(text).first()).toBeVisible();
      return;
    }
  }
}

/** Presses past the ready screen onto the two-pane surface. */
async function walkToSurface(page: Page): Promise<void> {
  await expect(
    page.locator(".connected-serif-line", { hasText: "Ready when you pull" }),
  ).toBeVisible({ timeout: 20_000 });
  // Unconditional (erg-day review, MEDIUM-5): the ready dwell is gone, so
  // the button is always there — a guard here could only mask the dwell
  // regression coming back.
  const showNumbers = page.getByRole("button", { name: "Show me the numbers" });
  await expect(showNumbers).toBeVisible();
  await showNumbers.click();
  await expect(
    page.getByRole("navigation", { name: "Connected panes" }),
  ).toBeVisible();
}

// The connected walk is minutes of real setup per test (sign-in, import,
// a 200ms-per-chunk five-interval program, a pumped session), well past
// Playwright's 30s default.
test.describe("connected screens (fake-driven)", () => {
  test.setTimeout(120_000);

  test("the interstitial's PAIRING state: axe, the 44px floor and the ink-4 rule", async ({
    page,
  }) => {
    const title = "Design Connected Pairing Workout";
    await injectConnectedFake(page, [], INTERSTITIAL_DELAY_WRITES_MS);
    await openConnected(page, title, "design-connected-pairing@e2e.test");
    // Scoped to `.connected-serif-line`: the status label and the
    // checklist's current-line marker also read "CONNECTING", and
    // Playwright's text matching is case-insensitive.
    const pairing = page.locator(".connected-serif-line", {
      hasText: "Connecting",
    });
    await expect(pairing).toBeVisible({ timeout: 10_000 });
    await sweep(page);
    await expect(pairing).toBeVisible({ timeout: 1000 });
    await cleanupAllConnected(page, title);
  });

  test("the interstitial's PROGRAMMING state: axe, the 44px floor and the ink-4 rule", async ({
    page,
  }) => {
    const title = "Design Connected Programming Workout";
    await injectConnectedFake(page, [], INTERSTITIAL_DELAY_WRITES_MS);
    await openConnected(page, title, "design-connected-programming@e2e.test");
    const programming = page.locator(".connected-serif-line", {
      hasText: "Sending the workout",
    });
    await expect(programming).toBeVisible({ timeout: 30_000 });
    await sweep(page);
    await expect(programming).toBeVisible({ timeout: 1000 });
    await cleanupAllConnected(page, title);
  });

  test("the interstitial's READY state: axe, the 44px floor and the ink-4 rule", async ({
    page,
  }) => {
    const title = "Design Connected Ready Workout";
    await injectConnectedFake(page, [], INTERSTITIAL_DELAY_WRITES_MS);
    await openConnected(page, title, "design-connected-ready@e2e.test");
    const ready = page.locator(".connected-serif-line", {
      hasText: "Ready when you pull",
    });
    await expect(ready).toBeVisible({ timeout: 60_000 });
    await sweep(page);
    // Since the dwell's removal this screen holds until the rower acts,
    // so this assertion can no longer lose a race — it stays because it is
    // what proves the sweep measured THIS screen and not the next one.
    await expect(ready).toBeVisible({ timeout: 1000 });
    await cleanupAllConnected(page, title);
  });

  test("the interstitial's FAILED state (no Bluetooth transport): axe, the 44px floor and the ink-4 rule", async ({
    page,
  }) => {
    const title = "Design Connected Failed Workout";
    // `screenshots.spec.ts`'s own `stubNoBluetooth`: removing
    // `navigator.bluetooth` BEFORE the app loads reaches `failed` via
    // `transport-missing` with no picker to hang on. Duplicated here for
    // the same reason the other helpers in this file are.
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "bluetooth", {
        value: undefined,
        configurable: true,
      });
    });
    await openConnected(page, title, "design-connected-failed@e2e.test");
    const failed = page.locator(".connected-serif-line", {
      hasText: "This device has no Bluetooth transport.",
    });
    await expect(failed).toBeVisible({ timeout: 10_000 });
    await sweep(page);
    await expect(failed).toBeVisible({ timeout: 1000 });
    await cleanupAllConnected(page, title);
  });

  // Phase CS Item A, Task 3 (task-3-brief.md Step 3): `touch-action:
  // pan-y` on `.connected-surface` and `.connected-grid-rows` — the
  // COMPUTED style in a real browser, never a grep of the stylesheet
  // (jsdom does not implement `touch-action` cascade resolution at all,
  // which is why this pin lives here and not in a unit test). It is
  // load-bearing beyond its own size: the probe's own falsification of
  // the touch-action/scroller-intersection candidate
  // (docs/monitor/sessions/probe-2026-08-17-swipe/README.md — "FALSIFIED
  // for the horizontal case, CONDITIONALLY") holds only for a build that
  // ships both declarations, and this branch carried NEITHER before Task
  // 2 landed them (`grep -n "touch-action" src/index.css` returned
  // nothing beforehand, per that same README).
  test("touch-action: pan-y on the surface and the grid scroller, computed in a real browser", async ({
    page,
  }) => {
    const title = "Design Connected Touch Action Workout";
    await injectConnectedFake(page, ROWING_STORY);
    await openConnected(page, title, "design-connected-touch-action@e2e.test");
    await walkToSurface(page);
    await pumpUntilText(page, "2 OF 5");

    // Read on the HERO while the LIVE pane is still up (it is a live-pane
    // element and does not exist once GRID is showing — the first version
    // of this assertion read it after the pane switch below and timed out
    // waiting for a locator that could never resolve). Asserted on the
    // hero rather than on `.connected-surface`, which carries the
    // declaration, so the pin proves the property actually INHERITS to the
    // element the finger lands on: from the 2026-08-18 phone walk, where
    // dragging across the hero raised a text selection mid-gesture.
    const heroUserSelect = await page
      .locator(".connected-hero")
      .first()
      .evaluate((el) => getComputedStyle(el).userSelect);
    expect(heroUserSelect).toBe("none");

    await page.getByRole("button", { name: "Grid pane" }).click();
    await expect(page.locator(".connected-grid-row").first()).toBeVisible();

    const [surfaceTouchAction, rowsTouchAction] = await Promise.all([
      page
        .locator(".connected-surface")
        .evaluate((el) => getComputedStyle(el).touchAction),
      page
        .locator(".connected-grid-rows")
        .evaluate((el) => getComputedStyle(el).touchAction),
    ]);
    expect(surfaceTouchAction).toBe("pan-y");
    expect(rowsTouchAction).toBe("pan-y");

    // The same non-selection guarantee on a GRID ROW — the other surface a
    // swipe starts from, and the one this phase's whole bug lived on.
    const rowUserSelect = await page
      .locator(".connected-grid-row")
      .first()
      .evaluate((el) => getComputedStyle(el).userSelect);
    expect(rowUserSelect).toBe("none");

    await cleanupAllConnected(page, title);
  });

  // ---------------------------------------------------------------------
  // CR2 spec 3 Task 6: the §2 property-table sweep. Every test below names
  // a row (or a tight cluster of the same row's sub-properties) from
  // docs/superpowers/specs/2026-08-16-connected-redesign-design.md §2's six
  // tables — the tables ARE the checklist (§6 criterion 1). Grouped per
  // frame (2A/2B/2C/2D/Stale/Disconnected), matching the spec's own section
  // order.
  //
  // TWO SOURCES OF TRUTH, DELIBERATELY MIXED. The frame-specific rows below
  // (sizes, colours, presence/absence, text) read the COMMITTED FIXTURES
  // (`e2e/fixtures/connected-*.html`) through the real app shell — same
  // `page.goto("/")` + body-swap idiom the up-next-reflow test above uses:
  // real CSS cascade, real self-hosted fonts, a real "Filling Low" library
  // workout (`ConnectedSurface.screens.test.tsx`'s own fixture), and no
  // live-driver flakiness. This is also strictly MORE deterministic than
  // driving `ROWING_STORY` through the fake for judged-colour assertions:
  // `CONNECTED_PROGRAM`'s five untargeted "max"-effort distance intervals
  // give no fixed judgement direction, where the fixtures' own actuals
  // (verified by grepping each committed file below) are fixed facts. The
  // NAVIGATION-dependent rows (pane switching, the triple-tap sheet, tab
  // order, safe-area rotation) stay on the live fake driver below this
  // section, unchanged — a fixture cannot prove a click routes anywhere.
  //
  // Every judged-colour assertion reads the ACTUAL judgement class off the
  // DOM rather than asserting a hardcoded direction, then checks the
  // resolved colour against the correct token for whatever class is
  // present — robust to which class a given fixture happens to carry,
  // while still proving "colour via token resolution" for real.

  const CONNECTED_FIXTURES_DIR = path.join(process.cwd(), "e2e/fixtures");

  /** Loads a committed connected fixture's real markup into the real app
   *  shell (the SAME pattern the up-next-reflow test above uses). Real CSS,
   *  real fonts, zero live-driver flakiness. */
  async function loadConnectedFixture(page: Page, name: string): Promise<void> {
    const markup = readFileSync(
      path.join(CONNECTED_FIXTURES_DIR, `${name}.html`),
      { encoding: "utf-8" },
    );
    await page.goto("/", { waitUntil: "load" });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--page")
          .trim() !== "",
    );
    await page.evaluate((html) => {
      document.body.innerHTML = `<div class="app-shell">${html}</div>`;
    }, markup);
    await expect(page.locator(".connected-surface")).toBeVisible();
  }

  // Resolved token RGBs (tokens.css), computed once — `INK_4_RGB` above is
  // this file's own existing constant, reused rather than redeclared.
  const INK_RGB = "rgb(27, 26, 23)";
  const INK_2_RGB = "rgb(63, 60, 53)";
  const INK_3_RGB = "rgb(87, 84, 76)";
  const RULE_2_RGB = "rgb(222, 216, 201)";
  const RULE_3_RGB = "rgb(201, 195, 178)";
  const JUDGE_FASTER_RGB = "rgb(29, 78, 137)";
  const JUDGE_SLOWER_RGB = "rgb(150, 39, 24)";
  const MARKER_RGB = "rgb(125, 85, 16)";
  const PROGRESS_ACTIVE_RGB = "rgb(138, 132, 120)";
  const SURFACE_RGB = "rgb(255, 253, 247)";

  /** The colour a judged element SHOULD resolve to, read off whichever
   *  `timer-card-actual-{judgement}` class is actually present — the same
   *  mapping `index.css`'s own judgement-keyed rules encode. `"within"`
   *  declares no colour of its own (plain ink by inheritance). */
  function expectedJudgedRgb(judgement: string): string {
    if (judgement === "faster") return JUDGE_FASTER_RGB;
    if (judgement === "slower") return JUDGE_SLOWER_RGB;
    if (judgement === "stale") return INK_3_RGB;
    return INK_RGB; // "within"
  }

  /** Reads a judged element's own `timer-card-actual-*` class and its
   *  resolved `color`, in one round trip. */
  async function judgedColor(
    page: Page,
    selector: string,
  ): Promise<{ judgement: string; color: string }> {
    return page.locator(selector).evaluate((el) => {
      const cls = Array.from(el.classList).find((c) =>
        c.startsWith("timer-card-actual-"),
      );
      return {
        judgement: cls ? cls.replace("timer-card-actual-", "") : "(none)",
        color: getComputedStyle(el).color,
      };
    });
  }

  test.describe("navigation and diagnostics (design spec §3 structure)", () => {
    test("the surface's two panes and the diagnostics sheet — portrait", async ({
      page,
    }) => {
      const title = "Design Connected Surface Workout";
      await injectConnectedFake(page, ROWING_STORY);
      await openConnected(page, title, "design-connected-surface@e2e.test");
      await walkToSurface(page);
      // Real numbers, not the pre-first-stroke placeholders: pumped until
      // interval 0's boundary has landed, so pane C paints a completed row
      // and pane B paints live readings.
      await pumpUntilText(page, "2 OF 5");

      // Pane B (`DEFAULT_PANE`, the first-connected-session landing pane).
      await expect(
        page.getByRole("button", { name: "Live pane" }),
      ).toHaveAttribute("aria-current", "page");
      await sweep(page);

      await page.getByRole("button", { name: "Grid pane" }).click();
      await expect(
        page.getByRole("button", { name: "Grid pane" }),
      ).toHaveAttribute("aria-current", "page");
      await expect(page.locator(".connected-grid-row")).toHaveCount(5);
      await expect(page.locator(".connected-grid-completed")).toHaveCount(1);
      await expect(page.locator(".connected-grid-active")).toHaveCount(1);
      await sweep(page);

      // The diagnostics sheet: three deliberate presses on the ACTIVE pane's
      // own control target (§3: "the triple-tap diagnostics gesture ports
      // onto the control's halves"), inside its 600ms window. Pressed in a
      // loop that stops as soon as the sheet is up rather than a fixed
      // three: the pane switch above already counts as this target's first
      // tap whenever it lands inside the window, and a third press then
      // hits the sheet's own backdrop instead.
      const gridTarget = page.getByRole("button", { name: "Grid pane" });
      const sheetTitle = page.getByRole("heading", { name: "Connection log" });
      for (let i = 0; i < 6 && !(await sheetTitle.isVisible()); i += 1) {
        await gridTarget.click();
      }
      await expect(sheetTitle).toBeVisible();
      await sweep(page);

      // Focus restores to the pressed half on close (§3: "the `logOpener`
      // focus-restore ref intact").
      await page.getByRole("button", { name: "Close" }).click();
      await expect(sheetTitle).toBeHidden();
      await expect(gridTarget).toBeFocused();

      await cleanupAllConnected(page, title);
    });

    test("the surface's two panes and the diagnostics sheet — landscape (844x390)", async ({
      page,
    }) => {
      const title = "Design Connected Surface Landscape Workout";
      await page.setViewportSize({ width: 844, height: 390 });
      await injectConnectedFake(page, ROWING_STORY);
      await openConnected(
        page,
        title,
        "design-connected-surface-landscape@e2e.test",
      );
      await walkToSurface(page);
      await pumpUntilText(page, "2 OF 5");

      await sweep(page);

      await page.getByRole("button", { name: "Grid pane" }).click();
      await expect(
        page.getByRole("button", { name: "Grid pane" }),
      ).toHaveAttribute("aria-current", "page");
      await sweep(page);

      const gridTarget = page.getByRole("button", { name: "Grid pane" });
      const sheetTitle = page.getByRole("heading", { name: "Connection log" });
      for (let i = 0; i < 6 && !(await sheetTitle.isVisible()); i += 1) {
        await gridTarget.click();
      }
      await expect(sheetTitle).toBeVisible();
      await sweep(page);

      await page.getByRole("button", { name: "Close" }).click();
      await expect(sheetTitle).toBeHidden();
      await expect(gridTarget).toBeFocused();

      await cleanupAllConnected(page, title);
    });

    // §3: "armed is checked FIRST, ahead of the ordinal check, so GRID
    // never reaches the countdown composition while armed" — the exact
    // defect class the briefing names (a RUNNING gold countdown at a rower
    // who has taken no stroke), driven for real: `walkToSurface` alone
    // (no pump) lands on `status: "armed"`, and a click straight onto GRID
    // with zero story events pumped proves nothing can advance it.
    test("GRID's armed branch reads READY, never the countdown composition", async ({
      page,
    }) => {
      const title = "Design Connected Armed Grid Workout";
      await injectConnectedFake(page, []);
      await openConnected(page, title, "design-connected-armed-grid@e2e.test");
      await walkToSurface(page);
      await page.getByRole("button", { name: "Grid pane" }).click();
      await expect(
        page.getByRole("button", { name: "Grid pane" }),
      ).toHaveAttribute("aria-current", "page");
      await expect(page.getByText("1 OF 5 · READY")).toBeVisible();
      await expect(page.locator(".connected-header-countdown")).toHaveCount(0);
      await sweep(page);
      await cleanupAllConnected(page, title);
    });
  });

  test.describe("2A — LIVE, landscape (design spec §2A)", () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test("header row: 44px, control far left / END far right, never adjacent", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live");
      const header = await page.locator(".connected-header").boundingBox();
      expect(header).not.toBeNull();
      expect(header!.height).toBeCloseTo(44, 0);
      // The header itself spans the surface's full physical width — its
      // own 12px right padding (`.connected-header`'s own rule) is what
      // insets END from the raw edge, not a gap this test should assume
      // away.
      expect(header!.x + header!.width).toBeCloseTo(844, 0);

      const [control, line, end] = await Promise.all([
        page.locator(".connected-control").boundingBox(),
        page.locator(".connected-line").boundingBox(),
        page.getByRole("button", { name: "End session" }).boundingBox(),
      ]);
      expect(control).not.toBeNull();
      expect(end).not.toBeNull();
      expect(line).not.toBeNull();
      // Far left / far right, and never adjacent: `.connected-line` (the
      // device caption + status, `flex: 1`) fills the whole gap between
      // them — its own box has real, positive width. END sits at the
      // header's own right edge, inset only by the header's own padding.
      expect(control!.x).toBeCloseTo(0, 0);
      expect(end!.x + end!.width).toBeCloseTo(
        header!.x + header!.width - 12,
        0,
      );
      expect(line!.width).toBeGreaterThan(0);
      expect(control!.x + control!.width).toBeLessThanOrEqual(line!.x + 0.5);
      expect(line!.x + line!.width).toBeLessThanOrEqual(end!.x + 0.5);
    });

    test("header row: device caption mono 13/0.10em/ink-2, status mono 22/0.04em/ink", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live");
      const device = await page
        .locator(".connected-line-device")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            fontSize: cs.fontSize,
            letterSpacing: parseFloat(cs.letterSpacing),
            color: cs.color,
            text: el.textContent,
          };
        });
      expect(device.fontSize).toBe("13px");
      expect(device.letterSpacing).toBeCloseTo(13 * 0.1, 1);
      expect(device.color).toBe(INK_2_RGB);
      expect(device.text).toBe("PM5 432331249");

      const status = await page
        .locator(".connected-line-trailing")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            fontSize: cs.fontSize,
            letterSpacing: parseFloat(cs.letterSpacing),
            color: cs.color,
            text: el.textContent,
          };
        });
      expect(status.fontSize).toBe("22px");
      expect(status.letterSpacing).toBeCloseTo(22 * 0.04, 1);
      expect(status.color).toBe(INK_RGB);
      expect(status.text).toBe("2 OF 5 · WORK"); // Phase WU: was "1 OF 4 · WORK"
    });

    test("progress bar: 6px track, 3px gaps, done/active/upcoming colours (contrast logged)", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live");
      const track = await page
        .locator(".connected-progress-track")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return { height: cs.height, gap: cs.gap, bg: cs.backgroundColor };
        });
      expect(track.height).toBe("6px");
      expect(track.gap).toBe("3px");
      expect(track.bg).toBe(RULE_2_RGB);

      const segs = await page
        .locator(".connected-progress-seg")
        .evaluateAll((els) =>
          els.map((el) => ({
            state: Array.from(el.classList)
              .find((c) => c.startsWith("connected-progress-seg-"))
              ?.replace("connected-progress-seg-", ""),
            bg: getComputedStyle(el).backgroundColor,
          })),
        );
      expect(segs.length).toBeGreaterThan(0);
      for (const seg of segs) {
        const expected =
          seg.state === "done"
            ? INK_RGB
            : seg.state === "active"
              ? PROGRESS_ACTIVE_RGB
              : RULE_2_RGB;
        expect([seg.state, seg.bg]).toStrictEqual([seg.state, expected]);
      }
      // Exactly one active segment (the interval being rowed) — the same
      // "one you are on" invariant the grid's own active row carries.
      expect(segs.filter((s) => s.state === "active")).toHaveLength(1);

      // Duration-proportional widths, read from COMPUTED style (antagonist
      // phase-exit pass: the unit test reads the inline style, so a CSS
      // `flex-grow: 1 !important` would equalize the bar while every test
      // stayed green — the computed value is what the browser actually
      // lays out). The fixture's program is a 480s opener + 4×684s; the
      // computed flex-grow ratios must match those durations, not each
      // other.
      const grows = await page
        .locator(".connected-progress-seg")
        .evaluateAll((els) =>
          els.map((el) => parseFloat(getComputedStyle(el).flexGrow)),
        );
      expect(grows).toStrictEqual([480, 684, 684, 684, 684]);

      // THE DISCLOSED RESIDUAL (§2A): active-vs-upcoming contrast, computed
      // rather than trusted — `--progress-active` on `--rule-2`.
      const ratio = await page.evaluate(
        ({ fg, bg }) => {
          function channel(c: number) {
            const s = c / 255;
            return s <= 0.03928
              ? s / 12.92
              : Math.pow((s + 0.055) / 1.055, 2.4);
          }
          function luminance(rgb: string) {
            const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
            if (!m) throw new Error(`unparseable colour: ${rgb}`);
            const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
            return (
              0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
            );
          }
          const la = luminance(fg);
          const lb = luminance(bg);
          const lighter = Math.max(la, lb);
          const darker = Math.min(la, lb);
          return (lighter + 0.05) / (darker + 0.05);
        },
        { fg: PROGRESS_ACTIVE_RGB, bg: RULE_2_RGB },
      );
      // Logged via the assertion message: 2.61:1, under WCAG 1.4.11's 3:1 —
      // accepted per §2A because the status text carries the same state
      // redundantly (`assertNoFailingInk4Labels`'s own numbered-disclosure
      // idiom, "recurring failure #6": compute it, don't judge by eye).
      expect(
        ratio,
        `active-vs-upcoming contrast ${ratio.toFixed(2)}:1`,
      ).toBeCloseTo(2.61, 1);
    });

    // Phase CM follow-up (James, 2026-08-20): `.connected-progress-meters`
    // reserves `min-width: calc(7ch + 0.12em)` — wide enough for a real
    // five-digit session (Calm Sea, 10,000m, `server/seed/library/o2.ts`)
    // — but nothing had ever rendered that case in a real browser cascade
    // before this test. Loads the same committed fixture the rest of this
    // block uses, then substitutes a five-digit total the way the grid
    // pane's own no-clip test (below, `.connected-grid-meters`) already
    // does for its own cell — real computed layout, not a unit-test DOM.
    test("the session-meters counter doesn't clip or shrink the bar at a real five-digit total (10,000m)", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live");
      const measured = await page.evaluate(() => {
        const row = document.querySelector(".connected-progress-row")!;
        const bar = row.querySelector<HTMLElement>(".connected-progress")!;
        const counter = row.querySelector<HTMLElement>(
          ".connected-progress-meters",
        )!;
        const barWidthBefore = bar.getBoundingClientRect().width;
        counter.textContent = "10,000m";
        return {
          counterScrollWidth: counter.scrollWidth,
          counterClientWidth: counter.clientWidth,
          counterText: counter.textContent,
          barWidthBefore,
          barWidthAfter: bar.getBoundingClientRect().width,
        };
      });
      expect(measured.counterText).toBe("10,000m");
      // No clip: the reserved width actually holds all seven characters.
      expect(measured.counterScrollWidth).toBeLessThanOrEqual(
        measured.counterClientWidth,
      );
      // The reserve's whole point (the CSS comment's own claim): the bar
      // beside it does not move when the counter reaches its reserved
      // width — never a hardcoded pixel budget, the property itself.
      expect(measured.barWidthAfter).toBeCloseTo(measured.barWidthBefore, 0);
    });

    test("progress bar fallback (>16 boundaries): proportional fill + quarter-tick row", async ({
      page,
    }) => {
      // None of the committed fixtures carry more than 16 boundaries
      // (`FIXTURE`/`LONG_FIXTURE` top out at 4 and 24 intervals but the
      // grid pane — the only one `LONG_FIXTURE` photographs — never mounts
      // `ConnectedProgressBar` at all, §2B: "No progress bar"). Driven live
      // instead, off `LONG_PROGRAM` (18 intervals, one past
      // `MAX_NOTCH_BOUNDARIES = 16`) — `walkToSurface` alone (armed, no
      // pump) is enough: the fallback's own trigger is
      // `boundaries.seconds.length`, a property of the PROGRAM, not of
      // anything rowed yet.
      const title = "Design Connected Progress Fallback Workout";
      await injectConnectedFake(
        page,
        [],
        CONNECTED_DELAY_WRITES_MS,
        LONG_PROGRAM,
      );
      await openConnected(
        page,
        title,
        "design-connected-progress-fallback@e2e.test",
        LONG_BULK_TEXT(title),
      );
      await walkToSurface(page);

      await expect(page.locator(".connected-progress-seg")).toHaveCount(0);
      const fill = page.locator(".connected-progress-fill");
      await expect(fill).toHaveCount(1);
      const bg = await fill.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      expect(bg).toBe(INK_RGB);
      const ticks = await page
        .locator(".connected-progress-tick-label")
        .allTextContents();
      expect(ticks).toStrictEqual(["¼", "½", "¾", ticks[3]]);
      expect(ticks[3]).toMatch(/^\d+′$/);

      await cleanupAllConnected(page, title);
    });

    test("heroes: split 112px mono 500 -0.05em judged nowrap, tenths 58px span, target 40px ink + source tag 15px ink-3", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live");
      const value = await page
        .locator(".connected-hero-split .connected-hero-value")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            fontSize: cs.fontSize,
            fontWeight: cs.fontWeight,
            letterSpacing: parseFloat(cs.letterSpacing),
            whiteSpace: cs.whiteSpace,
          };
        });
      expect(value.fontSize).toBe("112px");
      expect(value.fontWeight).toBe("500");
      expect(value.letterSpacing).toBeCloseTo(112 * -0.05, 0);
      expect(value.whiteSpace).toBe("nowrap");

      const tenths = await page
        .locator(".connected-hero-split .connected-hero-tenths")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(tenths).toBe("58px");

      // Split's own actual reads FASTER in this fixture (verified against
      // the committed file: `grep timer-card-actual- connected-pane-
      // live.html` — 1 faster, 1 within) — read dynamically anyway so the
      // assertion states the mechanism, not a fact this fixture happens to
      // hold today.
      const split = await judgedColor(
        page,
        ".connected-hero-split .connected-hero-value",
      );
      expect(split.color).toBe(expectedJudgedRgb(split.judgement));

      const target = await page
        .locator(".connected-hero-split .connected-hero-target-value")
        .evaluate((el) => ({
          fontSize: getComputedStyle(el).fontSize,
          color: getComputedStyle(el).color,
          text: el.textContent,
        }));
      expect(target.fontSize).toBe("40px");
      expect(target.color).toBe(INK_RGB);
      expect(target.text).toBe("2:06.0");

      const tag = await page
        .locator(".connected-hero-split .connected-hero-target-ref")
        .evaluate((el) => ({
          fontSize: getComputedStyle(el).fontSize,
          color: getComputedStyle(el).color,
          text: el.textContent,
        }));
      expect(tag.fontSize).toBe("15px");
      expect(tag.color).toBe(INK_3_RGB);
      expect(tag.text).toBe("6K +4");
    });

    // connected-metrics design spec, Task 5 (exit criterion 5's own
    // computed-style requirement) — the AVG cell Task 4 added inside
    // `.connected-hero-target` (a third flex child beside TGT's value +
    // ref, task-4-report.md's own e2e-impact map naming this exact
    // overlap risk; the "rows never overlap" test below still passes
    // real-browser, this test is the geometry itself). `connected-pane-
    // live.html` now carries a genuine non-zero AVG (Task 5's own fixture
    // edit) — before that this cell rendered nothing in every committed
    // fixture and no computed-style pin could exist for it.
    test("target row's third cell: AVG label 15px ink-3, value 34px ink (unjudged while rowing)", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live");
      const label = await page
        .locator(".connected-hero-avg-label")
        .evaluate((el) => ({
          fontSize: getComputedStyle(el).fontSize,
          color: getComputedStyle(el).color,
          text: el.textContent,
        }));
      expect(label.fontSize).toBe("15px");
      expect(label.color).toBe(INK_3_RGB);
      expect(label.text).toBe("AVG");

      const value = await judgedColor(page, ".connected-hero-avg-value");
      const valueFontSize = await page
        .locator(".connected-hero-avg-value")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(valueFontSize).toBe("34px");
      // Live pane, rowing (not resting): design states table row 1 —
      // unjudged, plain ink, however far from target. `connected-pane-
      // live.html`'s own frame is genuinely rowing, so "within" (plain
      // ink) is the CORRECT verdict here, not a coincidence of the
      // fixture never reaching a rest.
      expect(value.judgement).toBe("within");
      expect(value.color).toBe(INK_RGB);
      const valueText = await page
        .locator(".connected-hero-avg-value")
        .textContent();
      expect(valueText).toBe("2:08.4");

      // TGT is unaffected by AVG's presence — same value/ref this file's
      // own "heroes: split..." test already pins, re-read here so a
      // regression that shifted TGT's own text when AVG was added fails
      // at the cell that would actually show it.
      const target = await page
        .locator(".connected-hero-split .connected-hero-target-value")
        .textContent();
      expect(target).toBe("2:06.0");
    });

    test("heroes: rate 92px same treatment judged, target 40px + SPM 19px ink-3", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live");
      const value = await page
        .locator(".connected-hero-rate .connected-hero-value")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            fontSize: cs.fontSize,
            fontWeight: cs.fontWeight,
            letterSpacing: parseFloat(cs.letterSpacing),
          };
        });
      expect(value.fontSize).toBe("92px");
      expect(value.fontWeight).toBe("500");
      expect(value.letterSpacing).toBeCloseTo(92 * -0.05, 0);

      const rate = await judgedColor(
        page,
        ".connected-hero-rate .connected-hero-value",
      );
      expect(rate.color).toBe(expectedJudgedRgb(rate.judgement));

      const target = await page
        .locator(".connected-hero-rate .connected-hero-target-value")
        .evaluate((el) => ({
          fontSize: getComputedStyle(el).fontSize,
          color: getComputedStyle(el).color,
        }));
      expect(target.fontSize).toBe("40px");
      expect(target.color).toBe(INK_RGB);

      const unit = await page
        .locator(".connected-hero-rate-unit")
        .evaluate((el) => ({
          fontSize: getComputedStyle(el).fontSize,
          color: getComputedStyle(el).color,
          text: el.textContent,
        }));
      expect(unit.fontSize).toBe("19px");
      expect(unit.color).toBe(INK_3_RGB);
      expect(unit.text).toBe("SPM");
    });

    test("cut from LIVE: no NOW/TARGET labels, no /500m unit, no LEFT IN INTERVAL/TOTAL M/HR cells, no TimerRuler block", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live");
      const pane = page.locator(".connected-pane-live");
      await expect(pane.getByText("NOW", { exact: true })).toHaveCount(0);
      await expect(pane.getByText("TARGET", { exact: true })).toHaveCount(0);
      const paneText = (await pane.textContent()) ?? "";
      expect(paneText).not.toContain("/500m");
      expect(paneText).not.toContain("LEFT IN INTERVAL");
      expect(paneText).not.toContain("TOTAL M");
      await expect(page.locator(".connected-metric-row")).toHaveCount(0);
      await expect(page.locator(".timer-total")).toHaveCount(0);
      await expect(page.locator(".timer-ruler")).toHaveCount(0);
      await expect(page.locator(".connected-hero-unit")).toHaveCount(0);
      // The HR reading itself: this fixture has one (`heartRateBpm: 164`
      // baked into `liveFrame`'s own default), so its absence from the
      // pane is a real assertion about the redesign, not the fixture's
      // own missing data — `-nohr` covers the null case separately.
      expect(paneText).not.toMatch(/\bHR\b/);
    });

    test("bottom band: rule above, up-next mono 30 ink flex1 nowrap no label, EST LEFT labelled cell (label 15/0.10em/ink-3 over value 30/ink)", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live");
      const band = await page.locator(".connected-band").evaluate((el) => {
        const cs = getComputedStyle(el);
        return { borderTop: cs.borderTopWidth, borderColor: cs.borderTopColor };
      });
      expect(band.borderTop).toBe("1px");
      expect(band.borderColor).toBe(INK_RGB);

      // Always in the DOM (one markup, both orientations — the same
      // toggle idiom the "NEXT · " prefix span uses); landscape hides
      // it via CSS (§2A: "NO label"), it is never absent from the tree.
      await expect(page.locator(".connected-band-upnext-label")).toBeHidden();
      const upnext = await page
        .locator(".connected-band-upnext-value")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            fontSize: cs.fontSize,
            color: cs.color,
            whiteSpace: cs.whiteSpace,
            text: (el as HTMLElement).innerText,
          };
        });
      expect(upnext.fontSize).toBe("30px");
      expect(upnext.color).toBe(INK_RGB);
      expect(upnext.whiteSpace).toBe("nowrap");
      // PHASE CS Item B (task 2): the then-clause is retired outright — one
      // richer phase, not two — so landscape's own value is "NEXT · " plus
      // exactly the same string portrait shows, nothing appended.
      expect(upnext.text.replace(/\s+/g, " ").trim()).toBe("NEXT · REST 3:00");

      const label = await page
        .locator(".connected-band-cell-label")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            fontSize: cs.fontSize,
            letterSpacing: parseFloat(cs.letterSpacing),
            color: cs.color,
            text: el.textContent,
          };
        });
      expect(label.fontSize).toBe("15px");
      expect(label.letterSpacing).toBeCloseTo(15 * 0.1, 1);
      expect(label.color).toBe(INK_3_RGB);
      expect(label.text).toBe("EST LEFT");

      const value = await page
        .locator(".connected-band-cell-value")
        .evaluate((el) => ({
          fontSize: getComputedStyle(el).fontSize,
          color: getComputedStyle(el).color,
          text: el.textContent,
        }));
      expect(value.fontSize).toBe("30px");
      expect(value.color).toBe(INK_RGB);
      // EST LEFT (Phase LL): no longer a straight session-clock subtraction
      // (was "39:48"). `connected-pane-live`'s fixture (`intervalIndex: 1`)
      // lands on Filling Low's FIRST 2000 m rep (index 0 is the easy
      // opener), so the estimate is opener(480) + this frame's own live
      // term — the INTERVAL clock, 205.44 s, which is what the fixture's
      // own 800 m at its own 2:08.4 average takes. (It read `828` until PR
      // #144's fix round: that was the SESSION clock, the opener included,
      // in the raw half too — impossible, and it put this cell 8:00 low
      // beside a bar painted two intervals past its own caption.) 480 +
      // 205.44 = 685.44; totalLeft = 3216 - 685.44 = 2530.56 s. The number
      // is untouched by Phase WU; only the caption beside it renumbered.
      expect(value.text).toBe("42:11");
    });

    test("split cap: 4 chars + tenths; slower than 9:59.9 shows —", async ({
      page,
    }) => {
      const title = "Design Connected Live No-Clip Workout";
      await injectConnectedFake(page, EXTREME_SPLIT_STORY);
      await openConnected(page, title, "design-connected-live-noclip@e2e.test");
      await walkToSurface(page);
      await pumpUntilText(page, "2 OF 5");

      const hero = page.locator(".connected-hero-split .connected-hero-value");
      await expect(hero).toHaveText("—");

      const measured = await Promise.all([
        page.locator(".connected-pane-live").evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        })),
        page.evaluate(() => ({
          docScrollWidth: document.documentElement.scrollWidth,
          docClientWidth: document.documentElement.clientWidth,
        })),
      ]);
      expect(measured[0].scrollWidth).toBeLessThanOrEqual(
        measured[0].clientWidth,
      );
      expect(measured[0].scrollHeight).toBeLessThanOrEqual(
        measured[0].clientHeight,
      );
      expect(measured[1].docScrollWidth).toBeLessThanOrEqual(
        measured[1].docClientWidth,
      );

      await cleanupAllConnected(page, title);
    });
  });

  test.describe("2A — insets (safe-area, side/top insets, rotation)", () => {
    // --- Task 1 (design spec §4): the content column's width invariant ---
    //
    // James's report: the landscape content column changed width view to
    // view. Only ONE pane is mounted at a time
    // (`ConnectedSurface.tsx:324-325`), so `.connected-surface-body` — a
    // grid item in landscape's `1fr` track — measured its automatic
    // minimum against whichever pane happened to be showing. The pin: a
    // tap on "Grid pane" between LIVE and GRID and the content column must
    // not move a pixel, in BOTH orientations. Portrait's own run is
    // defense in depth (`.connected-surface` is a flex column there, so
    // the `minmax(auto, 1fr)` track this guards does not exist), kept
    // deliberately and said out loud.
    for (const viewport of [
      { width: 390, height: 844, label: "portrait" },
      { width: 844, height: 390, label: "landscape" },
    ] as const) {
      test(`the content column doesn't drift between panes — ${viewport.label} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        const title = `Design Connected Width Invariant ${viewport.label}`;
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await injectConnectedFake(page, ROWING_STORY);
        await openConnected(
          page,
          title,
          `design-connected-width-${viewport.label}@e2e.test`,
        );
        await walkToSurface(page);
        await pumpUntilText(page, "2 OF 5");

        const box = async () =>
          page.locator(".connected-surface-body").evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { width: r.width, left: r.left };
          });
        const onLive = await box();
        await page.getByRole("button", { name: "Grid pane" }).click();
        await expect(page.locator(".connected-pane-grid")).toBeVisible();
        const onGrid = await box();
        expect(onGrid).toStrictEqual(onLive);

        // The adversarial half: force the grid pane's own content past the
        // fair share and prove the content column STILL does not move.
        await page.evaluate(() => {
          const meters = document.querySelector<HTMLElement>(
            ".connected-grid-meters",
          )!;
          meters.textContent = "M".repeat(150);
        });
        const onGridForcedWide = await box();
        expect(onGridForcedWide).toStrictEqual(onLive);

        const minWidth = await page
          .locator(".connected-surface-body")
          .evaluate((el) => getComputedStyle(el).minWidth);
        expect(minWidth).toBe("0px");

        await cleanupAllConnected(page, title);
      });
    }

    // --- Task 1 (design spec §4): the grid's clip consequence ---
    test("the grid pane doesn't clip a three-digit interval number or a five-digit meters value — landscape (844x390)", async ({
      page,
    }) => {
      const title = "Design Connected Grid No-Clip Workout";
      await page.setViewportSize({ width: 844, height: 390 });
      await injectConnectedFake(page, ROWING_STORY);
      await openConnected(page, title, "design-connected-grid-noclip@e2e.test");
      await walkToSurface(page);
      await pumpUntilText(page, "2 OF 5");
      await page.getByRole("button", { name: "Grid pane" }).click();
      await expect(page.locator(".connected-pane-grid")).toBeVisible();

      const measured = await page.evaluate(() => {
        const row = document.querySelector(".connected-grid-row")!;
        const num = row.querySelector<HTMLElement>(".connected-grid-num")!;
        const meters = row.querySelector<HTMLElement>(
          ".connected-grid-meters",
        )!;
        num.textContent = "128";
        meters.textContent = "21097";
        const doc = document.documentElement;
        return {
          docScrollWidth: doc.scrollWidth,
          docClientWidth: doc.clientWidth,
          numScrollWidth: num.scrollWidth,
          numClientWidth: num.clientWidth,
          metersScrollWidth: meters.scrollWidth,
          metersClientWidth: meters.clientWidth,
          metersText: meters.textContent,
        };
      });
      expect(measured.docScrollWidth).toBeLessThanOrEqual(
        measured.docClientWidth,
      );
      expect(measured.numScrollWidth).toBeLessThanOrEqual(
        measured.numClientWidth,
      );
      expect(measured.metersScrollWidth).toBeLessThanOrEqual(
        measured.metersClientWidth,
      );
      expect(measured.metersText).toBe("21097");

      await cleanupAllConnected(page, title);
    });

    // --- RC-24: the grid says a rest is running ---
    // Fix round 2, item C: 375×812, not 390×844 — this repo's own
    // "tightest common width" (`e2e/screenshots.spec.ts`'s own
    // `today-capped` test, "narrower than this file's default 390×844"),
    // the genuinely narrowest supported portrait, not merely a common one.
    test("the rest countdown does not overflow its /500M column, and lines up EXACTLY with every other row — narrowest supported portrait (375x812)", async ({
      page,
    }) => {
      const title = "Design Connected Rest No-Clip Workout";
      await page.setViewportSize({ width: 375, height: 812 });
      await injectConnectedFake(page, RESTING_STORY);
      await openConnected(page, title, "design-connected-rest-noclip@e2e.test");
      await walkToSurface(page);
      // The pane switch is a UI action, not a wire event — safe to do
      // before the story's own resting tick has even fired.
      await page.getByRole("button", { name: "Grid pane" }).click();
      await expect(page.locator(".connected-pane-grid")).toBeVisible();
      await pumpUntil(page, ".connected-grid-rest-countdown");

      const measured = await page.evaluate(() => {
        // MEASURE THE FLEX ITEM, NOT ITS INLINE CHILD (fix round's own
        // second self-caught bug): `.connected-grid-rest-countdown` is a
        // plain inline `<span>` nested INSIDE `.connected-grid-pace` (the
        // DOM restructuring the landscape swap needed) — an inline
        // element's `scrollWidth`/`clientWidth` are 0 by CSSOM
        // definition, so measuring it directly always reads `0 <= 0` and
        // passes no matter what overflows. `.connected-grid-pace` is the
        // actual flex item (blockified by being a flex child, per the CSS
        // Display spec), the same element every other no-clip test in
        // this file already measures for its own column — THAT box is
        // what can genuinely overflow the row.
        const paceCell = document.querySelector<HTMLElement>(
          ".connected-grid-active .connected-grid-pace",
        )!;
        const textCell = document.querySelector<HTMLElement>(
          ".connected-grid-rest-countdown",
        )!;
        const row = paceCell.closest(".connected-grid-row")!;
        const doc = document.documentElement;
        // Fix round 2, item C: `reference` is an upcoming row at the SAME
        // columns, so a right-edge delta against it is a direct
        // measurement of any steal this row's own column costs its
        // neighbours — not an assumption about what "should" line up.
        // The `R` label (item B) needs no column widening at all
        // (measured, `index.css`'s own rule comment has the numbers), so
        // this now asserts EXACT alignment, not a bounded deficit.
        const reference = document.querySelector(".connected-grid-upcoming")!;
        const rightEdgeDelta = (cls: string): number =>
          Math.abs(
            row.querySelector(`.${cls}`)!.getBoundingClientRect().right -
              reference.querySelector(`.${cls}`)!.getBoundingClientRect().right,
          );
        return {
          cellText: (textCell.textContent ?? "").replace(/\s+/g, " ").trim(),
          rowResting: row.className.includes("connected-grid-resting"),
          cellScrollWidth: paceCell.scrollWidth,
          cellClientWidth: paceCell.clientWidth,
          docScrollWidth: doc.scrollWidth,
          docClientWidth: doc.clientWidth,
          metersDelta: rightEdgeDelta("connected-grid-meters"),
          spmDelta: rightEdgeDelta("connected-grid-spm"),
          hrDelta: rightEdgeDelta("connected-grid-hr"),
        };
      });
      // Real render, real layout, not the eyeballed capture recurring
      // failure #7 warns against — `R 9:55` is the label the fix-round-2
      // measurement chose (`index.css`'s own rule comment has both
      // labels' numbers), at the TRUE ceiling
      // (`RESTING_STORY`'s own doc comment has the `MAX_REST_SECONDS`
      // citation), measured, not asserted by construction.
      expect(measured.cellText).toBe("R 9:55");
      expect(measured.rowResting).toBe(true);
      expect(measured.cellScrollWidth).toBeLessThanOrEqual(
        measured.cellClientWidth,
      );
      expect(measured.docScrollWidth).toBeLessThanOrEqual(
        measured.docClientWidth,
      );
      // EXACTLY ZERO (fix round 2, item C — tightened from a bounded
      // deficit): the resting row's columns line up with every other row,
      // pixel for pixel. A gate that still permitted the old deficit would
      // not notice its return — proven red in the report (a temporary
      // revert of the fix reintroduces a real, non-zero delta here).
      expect(measured.metersDelta).toBe(0);
      expect(measured.spmDelta).toBe(0);
      expect(measured.hrDelta).toBe(0);

      await cleanupAllConnected(page, title);
    });

    // --- RC-24 fix round (James, 2026-08-26): the landscape swap ---
    test("landscape shows the countdown in the REST column and reverts /500M to the coast pace, unjudged — 844x390", async ({
      page,
    }) => {
      const title = "Design Connected Rest Landscape Workout";
      await page.setViewportSize({ width: 844, height: 390 });
      await injectConnectedFake(page, RESTING_STORY);
      await openConnected(
        page,
        title,
        "design-connected-rest-landscape@e2e.test",
      );
      await walkToSurface(page);
      await page.getByRole("button", { name: "Grid pane" }).click();
      await expect(page.locator(".connected-pane-grid")).toBeVisible();
      await pumpUntil(page, ".connected-grid-rest-live");

      const measured = await page.evaluate(() => {
        const activeRow = document.querySelector(".connected-grid-active")!;
        const restCell = activeRow.querySelector(".connected-grid-rest")!;
        const paceCell = activeRow.querySelector(
          ".connected-grid-pace",
        ) as HTMLElement;
        const coast = activeRow.querySelector<HTMLElement>(
          ".connected-grid-pace-coast",
        )!;
        const rest = activeRow.querySelector(".connected-grid-rest-countdown");
        return {
          restCellText: (restCell.textContent ?? "").trim(),
          restCellColor: getComputedStyle(restCell).color,
          // `innerText`, NOT `textContent`: a `display: none` sibling's
          // text is still IN `textContent` (a DOM property, blind to
          // rendering) — the exact trap `showConnectedFixture`'s own
          // comment elsewhere in this file names for the same reason.
          // `innerText` approximates what a rower actually sees.
          paceCellRenderedText: paceCell.innerText.trim(),
          coastText: coast.textContent?.trim(),
          paceCellClasses: paceCell.className,
          coastDisplay: getComputedStyle(coast).display,
          restFormDisplay: rest ? getComputedStyle(rest).display : "none",
        };
      });
      // The countdown moved: the REST column now shows it, gold — matches
      // `.connected-grid-rest-live`'s own token, `--marker` (#7d5510).
      expect(measured.restCellText).toBe("9:55");
      expect(measured.restCellColor).toBe("rgb(125, 85, 16)");
      // Fix round 2, item A (James: "So /500m in landscape isn't '-'
      // during rest???"): /500M does NOT revert to the coasting split —
      // it dashes, unjudged. `RESTING_STORY` scripts a real, non-zero
      // `currentSplit: 117.8` (the same `1:57.8` the round-1 capture
      // showed) specifically so this assertion cannot pass by accident of
      // an already-dashing zero reading.
      expect(measured.coastText).toBe("—");
      expect(measured.paceCellRenderedText).toBe("—");
      expect(measured.paceCellClasses).not.toMatch(/timer-card-actual-/);
      // The CSS orientation swap itself, computed — not assumed from the
      // class list alone: the coast form is genuinely painted, the
      // rest-countdown form genuinely is not.
      expect(measured.coastDisplay).not.toBe("none");
      expect(measured.restFormDisplay).toBe("none");

      await cleanupAllConnected(page, title);
    });

    // --- Task 2 (design spec §6/ruling 10): full-bleed ---
    test("the surface is full-bleed — landscape (844x390)", async ({
      page,
    }) => {
      const title = "Design Connected Gutter Workout";
      await page.setViewportSize({ width: 844, height: 390 });
      await injectConnectedFake(page, ROWING_STORY);
      await openConnected(page, title, "design-connected-gutter@e2e.test");
      await walkToSurface(page);
      await pumpUntilText(page, "2 OF 5");

      const surfaceBox = await page.locator(".connected-surface").boundingBox();
      expect(surfaceBox).not.toBeNull();
      expect(surfaceBox!.x).toBeCloseTo(0, 0);
      expect(surfaceBox!.x + surfaceBox!.width).toBeCloseTo(844, 0);
      const controlBox = await page.locator(".connected-control").boundingBox();
      expect(controlBox).not.toBeNull();
      expect(controlBox!.x).toBeCloseTo(0, 0);

      await cleanupAllConnected(page, title);
    });

    // Chromium reports every `env(safe-area-inset-*)` as `0px` on a normal
    // run — a real inset is SIMULATED via CDP's
    // `Emulation.setSafeAreaInsetsOverride`, verified empirically to move
    // `env(safe-area-inset-left)` in this repo's bundled Chromium.
    // ROTATION-STABILITY UNDER AN ASYMMETRIC INSET, which is ANDROID's
    // case.
    test("the segmented control and the content column are IDENTICAL in both landscape rotations, notch left or notch right (844x390)", async ({
      page,
    }) => {
      const title = "Design Connected Gutter Inset Workout";
      await page.setViewportSize({ width: 844, height: 390 });
      await injectConnectedFake(page, ROWING_STORY);
      await openConnected(
        page,
        title,
        "design-connected-gutter-inset@e2e.test",
      );
      await walkToSurface(page);
      await pumpUntilText(page, "2 OF 5");

      const INSET = 59;
      const client = await page.context().newCDPSession(page);

      async function measure(left: number, right: number) {
        await client.send("Emulation.setSafeAreaInsetsOverride", {
          insets: { top: 0, left, bottom: 0, right },
        });
        await page.evaluate(
          () => new Promise((r) => requestAnimationFrame(() => r(null))),
        );
        const [surface, control, pane, live] = await Promise.all([
          page.locator(".connected-surface").boundingBox(),
          page.locator(".connected-control").boundingBox(),
          page.locator(".connected-pane").boundingBox(),
          page.getByRole("button", { name: "Live pane" }).boundingBox(),
        ]);
        const round = (n: number) => Math.round(n * 100) / 100;
        return {
          surfaceX: round(surface!.x),
          controlX: round(control!.x),
          contentX: round(pane!.x),
          contentWidth: round(pane!.width),
          liveX: round(live!.x),
        };
      }

      const notchLeft = await measure(INSET, 0);
      const notchRight = await measure(0, INSET);

      expect(notchRight).toStrictEqual(notchLeft);
      expect(notchLeft.surfaceX).toBeCloseTo(0, 0);
      expect(notchLeft.controlX).toBeCloseTo(INSET, 0);
      expect(notchLeft.contentX).toBeCloseTo(INSET, 0);
      expect(Math.abs(notchLeft.liveX - INSET)).toBeLessThanOrEqual(2);

      await cleanupAllConnected(page, title);
    });

    // THE TOP AXIS — a real measured iOS landscape-TOP inset order of
    // magnitude, the status-bar-free notch band a mounted phone's rotation
    // still reports on the short physical edge (§1's deviation row: "the
    // header also honours `env(safe-area-inset-top)` in landscape").
    test("the segmented control clears a real TOP inset — landscape (844x390)", async ({
      page,
    }) => {
      const title = "Design Connected Top Inset Workout";
      await page.setViewportSize({ width: 844, height: 390 });
      await injectConnectedFake(page, ROWING_STORY);
      await openConnected(page, title, "design-connected-top-inset@e2e.test");
      await walkToSurface(page);
      await pumpUntilText(page, "2 OF 5");

      const TOP = 20;

      // Queue item 5 (close-out, James's device screenshot): the ZERO-
      // inset case, no CDP override at all — the exact shape a non-notch
      // device (or this suite's own default Chromium, which reports
      // every `env(safe-area-inset-*)` as `0px`) reports. Before the
      // fix, bare `env(safe-area-inset-top)` resolved to `0px` here and
      // the control/END row sat flush with the physical top edge — this
      // is the case the `max(20px, …)` floor exists for; the real-inset
      // block below (unchanged) proves the floor still yields to a
      // genuinely larger inset.
      const [zeroControlBox, zeroEndBox] = await Promise.all([
        page.locator(".connected-control").boundingBox(),
        page.getByRole("button", { name: "End session" }).boundingBox(),
      ]);
      expect(zeroControlBox).not.toBeNull();
      expect(zeroEndBox).not.toBeNull();
      expect(zeroControlBox!.y).toBeGreaterThanOrEqual(TOP);
      expect(zeroEndBox!.y).toBeGreaterThanOrEqual(TOP);

      const client = await page.context().newCDPSession(page);
      await client.send("Emulation.setSafeAreaInsetsOverride", {
        insets: { top: TOP, left: 0, bottom: 0, right: 0 },
      });
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => r(null))),
      );

      const [controlBox, endBox] = await Promise.all([
        page.locator(".connected-control").boundingBox(),
        page.getByRole("button", { name: "End session" }).boundingBox(),
      ]);
      expect(controlBox).not.toBeNull();
      expect(endBox).not.toBeNull();
      expect(controlBox!.y).toBeGreaterThanOrEqual(TOP);
      expect(endBox!.y).toBeGreaterThanOrEqual(TOP);
      expect(controlBox!.height).toBeGreaterThanOrEqual(44);

      await cleanupAllConnected(page, title);
    });

    test("under a real bottom inset the surface still reaches the physical bottom edge — landscape (844x390)", async ({
      page,
    }) => {
      const title = "Design Connected Bottom Inset Workout";
      await page.setViewportSize({ width: 844, height: 390 });
      await injectConnectedFake(page, ROWING_STORY);
      await openConnected(
        page,
        title,
        "design-connected-bottom-inset@e2e.test",
      );
      await walkToSurface(page);
      await pumpUntilText(page, "2 OF 5");

      const BOTTOM = 21;
      const client = await page.context().newCDPSession(page);
      await client.send("Emulation.setSafeAreaInsetsOverride", {
        insets: { top: 0, left: 0, bottom: BOTTOM, right: 0 },
      });
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => r(null))),
      );

      const surfaceBox = await page.locator(".connected-surface").boundingBox();
      expect(surfaceBox!.y + surfaceBox!.height).toBeCloseTo(390, 0);

      await cleanupAllConnected(page, title);
    });

    test("under real portrait insets the live pane does not clip, and EST LEFT is still inside it (390x844)", async ({
      page,
    }) => {
      const title = "Design Connected Portrait Inset Workout";
      await page.setViewportSize({ width: 390, height: 844 });
      await injectConnectedFake(page, ROWING_STORY);
      await openConnected(
        page,
        title,
        "design-connected-portrait-inset@e2e.test",
      );
      await walkToSurface(page);
      await pumpUntilText(page, "2 OF 5");

      const client = await page.context().newCDPSession(page);
      for (const [device, top] of [
        ["iPhone 14", 47],
        ["iPhone 14 Pro", 59],
      ] as const) {
        await client.send("Emulation.setSafeAreaInsetsOverride", {
          insets: { top, left: 0, bottom: 34, right: 0 },
        });
        await page.evaluate(
          () => new Promise((r) => requestAnimationFrame(() => r(null))),
        );

        const measured = await page.evaluate(() => {
          const pane = document.querySelector(".connected-pane-live")!;
          const total = document.querySelector(".connected-band")!;
          return {
            scrollHeight: pane.scrollHeight,
            clientHeight: pane.clientHeight,
            paneBottom: pane.getBoundingClientRect().bottom,
            totalBottom: total.getBoundingClientRect().bottom,
          };
        });

        expect([
          device,
          measured.scrollHeight <= measured.clientHeight,
        ]).toStrictEqual([device, true]);
        expect([
          device,
          measured.totalBottom <= measured.paneBottom + 0.5,
        ]).toStrictEqual([device, true]);
      }

      await cleanupAllConnected(page, title);
    });

    // NO-SCROLL / NO-OVERLAP: `.connected-pane` declares `overflow: clip`,
    // so a genuine layout overflow reads as CLIPPED content, not a visible
    // scrollbar.
    for (const viewport of [
      { width: 390, height: 844, label: "portrait" },
      { width: 844, height: 390, label: "landscape" },
    ] as const) {
      test(`the live pane does not scroll — ${viewport.label} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        const title = `Design Connected Live No-Scroll ${viewport.label}`;
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await injectConnectedFake(page, ROWING_STORY);
        await openConnected(
          page,
          title,
          `design-connected-live-noscroll-${viewport.label}@e2e.test`,
        );
        await walkToSurface(page);
        await pumpUntilText(page, "2 OF 5");

        const overflow = await page
          .locator(".connected-pane-live")
          .evaluate((el) => ({
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          }));
        expect(overflow.scrollHeight).toBeLessThanOrEqual(
          overflow.clientHeight,
        );

        await cleanupAllConnected(page, title);
      });
    }

    test("the landscape surface reclaims the dead 26px: its height equals the viewport's (844x390)", async ({
      page,
    }) => {
      const title = "Design Connected Surface Height Workout";
      await page.setViewportSize({ width: 844, height: 390 });
      await injectConnectedFake(page, ROWING_STORY);
      await openConnected(
        page,
        title,
        "design-connected-surface-height@e2e.test",
      );
      await walkToSurface(page);
      await pumpUntilText(page, "2 OF 5");

      const surfaceBox = await page.locator(".connected-surface").boundingBox();
      expect(surfaceBox).not.toBeNull();
      expect(surfaceBox!.height).toBeCloseTo(390, 0);
      expect(surfaceBox!.y).toBeCloseTo(0, 0);

      await cleanupAllConnected(page, title);
    });

    for (const viewport of [
      { width: 390, height: 844, label: "portrait" },
      { width: 844, height: 390, label: "landscape" },
    ] as const) {
      test(`the live pane's rows never overlap their neighbours — ${viewport.label} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        const title = `Design Connected Live No-Overlap ${viewport.label}`;
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await injectConnectedFake(page, ROWING_STORY);
        await openConnected(
          page,
          title,
          `design-connected-live-nooverlap-${viewport.label}@e2e.test`,
        );
        await walkToSurface(page);
        await pumpUntilText(page, "2 OF 5");

        const pairs: [string, string][] = [
          [".connected-line", ".connected-progress"],
          [
            ".connected-progress",
            ".connected-hero-split .connected-hero-value",
          ],
          [".connected-progress", ".connected-hero-rate .connected-hero-value"],
          [".connected-hero-split .connected-hero-target", ".connected-band"],
          [".connected-hero-rate .connected-hero-target", ".connected-band"],
        ];
        for (const [aboveSel, belowSel] of pairs) {
          const [above, below] = await Promise.all([
            page.locator(aboveSel).boundingBox(),
            page.locator(belowSel).boundingBox(),
          ]);
          expect(above, aboveSel).not.toBeNull();
          expect(below, belowSel).not.toBeNull();
          expect(
            below!.y,
            `${belowSel} (top ${below!.y}) overlaps ${aboveSel} (bottom ${above!.y + above!.height})`,
          ).toBeGreaterThanOrEqual(above!.y + above!.height);
        }

        await cleanupAllConnected(page, title);
      });
    }

    // NO-OVERLAP, the frozen footer's own geometry check (connected-axes
    // 2a task 5) — `.connected-band-cell` (EST LEFT) is the element the
    // old overlay covered.
    for (const viewport of [
      { width: 390, height: 844, label: "portrait" },
      { width: 844, height: 390, label: "landscape" },
    ] as const) {
      test(`the frozen footer never covers EST LEFT — ${viewport.label} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        const title = `Design Connected Frozen No-Overlap ${viewport.label}`;
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await injectConnectedFake(page, FREEZING_STORY);
        await openConnected(
          page,
          title,
          `design-connected-frozen-nooverlap-${viewport.label}@e2e.test`,
        );
        await walkToSurface(page);
        await pumpUntil(page, ".connected-paused");
        await expect(page.getByText("PULL TO RESUME")).toBeVisible();
        await expect(page.getByText(/PAUSED/)).toHaveCount(0);

        const totalLeft = page.locator(".connected-band-cell");
        const frozenBlock = page.locator(".connected-paused");
        const [ruler, block] = await Promise.all([
          totalLeft.boundingBox(),
          frozenBlock.boundingBox(),
        ]);
        expect(ruler, ".connected-band-cell").not.toBeNull();
        expect(block, ".connected-paused").not.toBeNull();
        expect(
          block!.y,
          `.connected-paused (top ${block!.y}) overlaps .connected-band-cell (bottom ${ruler!.y + ruler!.height})`,
        ).toBeGreaterThanOrEqual(ruler!.y + ruler!.height);
        expect(ruler!.y + ruler!.height).toBeLessThanOrEqual(viewport.height);

        await sweep(page);
        await cleanupAllConnected(page, title);
      });
    }

    test("nothing in the band's own up-next value reflows at the notched content width", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live-opener");
      await page.setViewportSize({ width: 844, height: 390 });

      const client = await page.context().newCDPSession(page);
      async function stripAt(left: number) {
        await client.send("Emulation.setSafeAreaInsetsOverride", {
          insets: { top: 0, left, bottom: 0, right: 0 },
        });
        await page.evaluate(
          () => new Promise((r) => requestAnimationFrame(() => r(null))),
        );
        const [value, pane] = await Promise.all([
          page.locator(".connected-band-upnext-value").boundingBox(),
          page.locator(".connected-pane").boundingBox(),
        ]);
        return {
          valueHeight: Math.round(value!.height),
          contentWidth: Math.round(pane!.width),
        };
      }

      const unnotched = await stripAt(0);
      const notched = await stripAt(59);

      expect(notched.contentWidth).toBeLessThan(unnotched.contentWidth);
      expect(notched.valueHeight).toBe(unnotched.valueHeight);
    });
  });

  test.describe("2B — GRID, landscape (design spec §2B)", () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test("header: GRID active, status composed ordinal + EST LEFT in marker gold, no progress bar", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-grid");
      await expect(
        page.getByRole("button", { name: "Grid pane" }),
      ).toHaveAttribute("aria-current", "page");
      const trailing = page.locator(".connected-line-trailing");
      await expect(trailing).toContainText("2 OF 5"); // Phase WU: was "1 OF 4"
      // EST LEFT (Phase LL): "42:11", not "39:48" — see the identical
      // `connected-pane-grid` fixture's own note in the LIVE band test
      // above ("bottom band: rule above...").
      await expect(trailing).toContainText("42:11 LEFT");
      const countdown = await page
        .locator(".connected-header-countdown")
        .evaluate((el) => ({
          color: getComputedStyle(el).color,
          text: el.textContent,
        }));
      expect(countdown.color).toBe(MARKER_RGB);
      expect(countdown.text).toBe("42:11 LEFT");
      await expect(page.locator(".connected-progress")).toHaveCount(0);
    });

    test("table head: mono 12/0.12em/ink-3, 2px ink rule below, columns # 30 · TIME · METERS · /500M · SPM · HR · REST", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-grid");
      const head = await page.locator(".connected-grid-head").evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          borderBottom: cs.borderBottomWidth,
          borderColor: cs.borderBottomColor,
        };
      });
      expect(head.borderBottom).toBe("2px");
      expect(head.borderColor).toBe(INK_RGB);

      const cells = await page
        .locator(".connected-grid-head > span")
        .evaluateAll((els) =>
          els.map((el) => {
            const cs = getComputedStyle(el);
            return {
              text: el.textContent,
              fontSize: cs.fontSize,
              letterSpacing: parseFloat(cs.letterSpacing),
              color: cs.color,
            };
          }),
        );
      expect(cells.map((c) => c.text)).toStrictEqual([
        "#",
        "TIME",
        "METERS",
        "/500M",
        "SPM",
        "HR",
        "REST",
      ]);
      for (const cell of cells) {
        expect([cell.text, cell.fontSize]).toStrictEqual([cell.text, "12px"]);
        expect([cell.text, cell.color]).toStrictEqual([cell.text, INK_3_RGB]);
        expect(cell.letterSpacing).toBeCloseTo(12 * 0.12, 1);
      }

      const numWidth = await page
        .locator(".connected-grid-head .connected-grid-num")
        .evaluate((el) => el.getBoundingClientRect().width);
      expect(numWidth).toBeCloseTo(30, 0);
    });

    test("rows: 32px, mono 19 -0.01em; completed ink+rule-2 bottom; active surface-fill + ink rules + marker bar + weight600 + marker countdown + judged split/rate; upcoming ink-3 dashed rule-3, — for unknowables", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-grid");

      const rowHeights = await page
        .locator(".connected-grid-row")
        .evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect().height),
        );
      for (const h of rowHeights) expect(h).toBeCloseTo(32, 0);

      const valueStyle = await page
        .locator(".connected-grid-row .connected-grid-pace")
        .first()
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            fontSize: cs.fontSize,
            letterSpacing: parseFloat(cs.letterSpacing),
          };
        });
      expect(valueStyle.fontSize).toBe("19px");
      expect(valueStyle.letterSpacing).toBeCloseTo(19 * -0.01, 1);

      // Completed: the WU row (`ordinal === null` → "WU"), ink values, a
      // solid `--rule-2` bottom border.
      const completed = page.locator(".connected-grid-completed");
      await expect(completed).toHaveCount(1);
      // Phase WU: `1`, not `WU` — the leading interval is a numbered piece
      // now, and the `#` column has no unnumbered case left at all.
      await expect(completed.locator(".connected-grid-num")).toHaveText("1");
      const completedStyle = await completed.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          borderBottomStyle: cs.borderBottomStyle,
          borderBottomColor: cs.borderBottomColor,
        };
      });
      expect(completedStyle.borderBottomStyle).toBe("solid");
      expect(completedStyle.borderBottomColor).toBe(RULE_2_RGB);

      // Active: surface fill, ink rules top+bottom, 4px marker bar, weight
      // 600 number, marker-gold countdown cell, judged split/rate.
      const active = page.locator(".connected-grid-active");
      await expect(active).toHaveCount(1);
      const activeStyle = await active.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          background: cs.backgroundColor,
          borderTopStyle: cs.borderTopStyle,
          borderTopColor: cs.borderTopColor,
          borderBottomStyle: cs.borderBottomStyle,
          borderBottomColor: cs.borderBottomColor,
        };
      });
      expect(activeStyle.background).toBe(SURFACE_RGB);
      expect(activeStyle.borderTopStyle).toBe("solid");
      expect(activeStyle.borderTopColor).toBe(INK_RGB);
      expect(activeStyle.borderBottomStyle).toBe("solid");
      expect(activeStyle.borderBottomColor).toBe(INK_RGB);
      const numWeight = await active
        .locator(".connected-grid-num")
        .evaluate((el) => getComputedStyle(el).fontWeight);
      expect(numWeight).toBe("600");
      await expect(active.locator(".connected-grid-marker")).toHaveCount(1);
      const marker = await active
        .locator(".connected-grid-marker")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return { width: cs.width, height: cs.height, bg: cs.backgroundColor };
        });
      expect(marker.width).toBe("4px");
      expect(marker.height).toBe("20px");
      expect(marker.bg).toBe(INK_RGB);
      const countdown = await active
        .locator(".connected-grid-countdown")
        .evaluate((el) => ({
          color: getComputedStyle(el).color,
          text: el.textContent,
        }));
      expect(countdown.color).toBe(MARKER_RGB);
      expect(countdown.text).toBe("1200");
      const pace = await judgedColor(
        page,
        ".connected-grid-active .connected-grid-pace",
      );
      expect(pace.color).toBe(expectedJudgedRgb(pace.judgement));
      const spm = await judgedColor(
        page,
        ".connected-grid-active .connected-grid-spm",
      );
      expect(spm.color).toBe(expectedJudgedRgb(spm.judgement));

      // Upcoming: ink-3 values, programmed targets, 1px dashed rule-3
      // bottom, `—` for the unknowable cells (HR, TIME on a distance row).
      const upcomingAll = page.locator(".connected-grid-upcoming");
      await expect(upcomingAll).toHaveCount(3);
      const upcoming = upcomingAll.first();
      const upcomingStyle = await upcoming.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          color: cs.color,
          borderBottomStyle: cs.borderBottomStyle,
          borderBottomColor: cs.borderBottomColor,
        };
      });
      expect(upcomingStyle.color).toBe(INK_3_RGB);
      expect(upcomingStyle.borderBottomStyle).toBe("dashed");
      expect(upcomingStyle.borderBottomColor).toBe(RULE_3_RGB);
      await expect(upcoming.locator(".connected-grid-time")).toHaveText("—");
      await expect(upcoming.locator(".connected-grid-hr")).toHaveText("—");
    });

    test("footer caption: mono 12 ink-3, merges distance-caption content", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-grid");
      const caption = await page
        .locator(".connected-grid-caption")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            fontSize: cs.fontSize,
            color: cs.color,
            text: el.textContent,
          };
        });
      expect(caption.fontSize).toBe("12px");
      expect(caption.color).toBe(INK_3_RGB);
      // Phase WU renumbered every row: the leading easy piece is counted
      // now, so Filling Low's four 2000 m reps are rows 2-5, not 1-4.
      expect(caption.text).toBe(
        "3 MORE BELOW · ROWS 2, 3, 4, 5 ARE 2000 M PIECES · METERS COUNT DOWN",
      );
    });

    test("scroll/focus: row list is the only scrolling region, keyboard-focusable, named", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-grid-long");
      const rows = page.locator(".connected-grid-rows");
      await expect(rows).toHaveAttribute("tabindex", "0");
      await expect(rows).toHaveAttribute("role", "group");
      await expect(rows).toHaveAccessibleName("Interval grid");
      const overflow = await rows.evaluate(
        (el) => getComputedStyle(el).overflowY,
      );
      expect(overflow).toBe("auto");
    });

    // Auto-scroll on mount is a REACT EFFECT (`PaneGrid.tsx`'s own
    // `useEffect` calling `scrollIntoView`), not a CSS fact — a static
    // fixture loaded by innerHTML injection (this describe's usual route)
    // never mounts React, so it cannot exercise it. Driven live instead,
    // through the real fake, the same way `PaneGrid.tsx`'s own comment
    // says it is proven ("asserted by a spy in `PaneGrid.test.tsx`, and by
    // the landscape screenshot") — this is the real-browser geometry half
    // of that same claim, in a real Chromium scroller.
    test("the active row scrolls into view on mount, in a real browser", async ({
      page,
    }) => {
      // `LONG_PROGRAM` (18 intervals, past landscape's own 8-visible
      // budget) with the active row jumped straight to index 10 — a
      // SINGLE status frame, no boundary events needed: `activeIndex`
      // reads off the latest frame's own `programIntervalIndex` directly
      // (the same single-jump shape `ROWING_STORY`'s own one status frame
      // already relies on), and this test only needs the row to be
      // genuinely off-screen without the scroll effect, not a "completed"
      // trail of actuals behind it.
      const title = "Design Connected Grid Autoscroll Workout";
      await page.setViewportSize({ width: 844, height: 390 });
      await injectConnectedFake(
        page,
        [
          {
            atMs: CONNECTED_STORY_START_MS,
            kind: "status" as const,
            workoutState: WORKOUTSTATE_ROWING,
            elapsedSeconds: 10,
            distanceMeters: 70,
            spm: 24,
            currentSplit: 108,
            heartRateBpm: 142,
            programIntervalIndex: 10,
          },
        ],
        CONNECTED_DELAY_WRITES_MS,
        LONG_PROGRAM,
      );
      await openConnected(
        page,
        title,
        "design-connected-grid-autoscroll@e2e.test",
        LONG_BULK_TEXT(title),
      );
      await walkToSurface(page);
      await pumpUntilText(page, "11 OF 18");
      await page.getByRole("button", { name: "Grid pane" }).click();
      await expect(page.locator(".connected-grid-active")).toHaveCount(1);

      const inView = await page.evaluate(() => {
        const scroller = document.querySelector(".connected-grid-rows")!;
        const active = document.querySelector(".connected-grid-active")!;
        const box = scroller.getBoundingClientRect();
        const r = active.getBoundingClientRect();
        return r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
      });
      expect(inView).toBe(true);

      await cleanupAllConnected(page, title);
    });

    test("interval countdown's home: only in the grid's active-row cell, never in the header composition twice", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-grid");
      // One countdown cell inside the active row (§2B), and the header's
      // OWN countdown span (`.connected-header-countdown`) is a SEPARATE
      // element carrying `totalLeftDisplay`, not a second copy of the same
      // per-interval clock — the grid headline that used to duplicate it
      // is gone outright (§2B composition note).
      await expect(page.locator(".connected-grid-countdown")).toHaveCount(1);
      await expect(page.locator(".connected-grid-headline")).toHaveCount(0);
    });
  });

  test.describe('2B — GRID, portrait (design spec §2B, "today\'s geometry, new skin")', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("40px rows, current scroller, restyled with the new tokens", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-grid-long");
      const rowHeights = await page
        .locator(".connected-grid-row")
        .evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect().height),
        );
      for (const h of rowHeights) expect(h).toBeCloseTo(40, 0);

      // REST hidden in portrait (§2B: "portrait drops it").
      await expect(page.locator(".connected-grid-rest").first()).toBeHidden();

      const numWidth = await page
        .locator(".connected-grid-head .connected-grid-num")
        .evaluate((el) => el.getBoundingClientRect().width);
      expect(numWidth).toBeCloseTo(22, 0);

      const head = await page
        .locator(".connected-grid-head > span")
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(head).toBe("12px");

      const caption = await page
        .locator(".connected-grid-caption")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(caption).toBe("12px");
    });

    test("the 54px bottom bar stands in for the rail", async ({ page }) => {
      await loadConnectedFixture(page, "connected-pane-grid");
      const controlBox = await page.locator(".connected-control").boundingBox();
      expect(controlBox).not.toBeNull();
      expect(controlBox!.height).toBeCloseTo(54, 0);
    });
  });

  test.describe("2C — LIVE, portrait (design spec §2C)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("layout: header row is 44px (PM5 id + END, no segmented control), status on its OWN LINE below it, mono 21, same 6px progress bar", async ({
      page,
    }) => {
      // FIX ROUND (CRITICAL 1): this used to measure the WHOLE
      // `.connected-header` box at ~48px, with the status caption composed
      // INSIDE that same row — the shape that let it overprint the device
      // id / END on long fixtures (three committed captures, see
      // `index.css`'s own header comment). §2C: "Header: PM5 id + END
      // (44px, no segmented control up top). Status line mono 21." — two
      // separate rows now, so this test measures the ROW, not the header
      // element's own (now taller, two-line) bounding box.
      await loadConnectedFixture(page, "connected-pane-live");
      const [header, end, control, status] = await Promise.all([
        page.locator(".connected-header").boundingBox(),
        page.getByRole("button", { name: "End session" }).boundingBox(),
        page.locator(".connected-control").boundingBox(),
        page.locator(".connected-line-trailing").boundingBox(),
      ]);
      expect(header).not.toBeNull();
      expect(end).not.toBeNull();
      expect(status).not.toBeNull();
      // End is `flex: none; min-height: 44px` and the tallest item on the
      // header's own first flex line (`.connected-line`, mark + device
      // caption, is shorter and vertically centered beside it) — a
      // wrapped flex container's line height is set by its tallest member,
      // so End's own box IS the row: measuring it directly is the row's
      // 44px, not an inference from the header's own (now two-line) total.
      expect(end!.height).toBeCloseTo(44, 0);
      // The status caption sits AT OR BELOW End's own bottom edge — a
      // different line entirely, never sharing End's row.
      expect(status!.y).toBeGreaterThanOrEqual(end!.y + end!.height - 0.5);
      // The header's OWN total height is genuinely taller than the single
      // row now (both lines plus the gap between them) — the positive
      // half of the same fact the assertion above proves negatively.
      expect(header!.height).toBeGreaterThan(end!.height + 10);

      // No segmented control up top: it sits at the BOTTOM of the frame in
      // portrait (§3: "into the last row as the 54px bottom bar"), well
      // below the header's own bottom edge — not merely absent from the
      // header's DOM subtree, which is true in every orientation.
      expect(control).not.toBeNull();
      expect(control!.y).toBeGreaterThan(header!.y + header!.height);

      const statusFontSize = await page
        .locator(".connected-line-trailing")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(statusFontSize).toBe("21px");

      const track = await page
        .locator(".connected-progress-track")
        .evaluate((el) => getComputedStyle(el).height);
      expect(track).toBe("6px");
    });

    test("heroes stacked: split 100 (tenths 52) over target 36 + tag 14; rate 84 over target 36 + SPM 18; rule weights + 16px padding-top", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live");
      const split = await page
        .locator(".connected-hero-split .connected-hero-value")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(split).toBe("100px");
      const tenths = await page
        .locator(".connected-hero-split .connected-hero-tenths")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(tenths).toBe("52px");
      const splitTarget = await page
        .locator(".connected-hero-split .connected-hero-target-value")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(splitTarget).toBe("36px");
      const tag = await page
        .locator(".connected-hero-split .connected-hero-target-ref")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(tag).toBe("14px");

      const rate = await page
        .locator(".connected-hero-rate .connected-hero-value")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(rate).toBe("84px");
      const rateTarget = await page
        .locator(".connected-hero-rate .connected-hero-target-value")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(rateTarget).toBe("36px");
      const unit = await page
        .locator(".connected-hero-rate-unit")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(unit).toBe("18px");

      const split2px = await page
        .locator(".connected-hero-split")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            width: cs.borderTopWidth,
            color: cs.borderTopColor,
            padTop: cs.paddingTop,
          };
        });
      expect(split2px.width).toBe("2px");
      expect(split2px.color).toBe(INK_RGB);
      expect(split2px.padTop).toBe("16px");

      const rate1px = await page
        .locator(".connected-hero-rate")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return { width: cs.borderTopWidth, padTop: cs.paddingTop };
        });
      expect(rate1px.width).toBe("1px");
      expect(rate1px.padTop).toBe("16px");
    });

    // connected-metrics design spec, Task 5 — portrait's own step of the
    // same AVG geometry the landscape describe block pins above (34px
    // there, `calc(var(--c-size-target) - 6px)` — `PaneLive.tsx`'s own
    // doc comment on why AVG tracks TGT's own portrait/landscape step
    // through shared tokens rather than a second hardcoded pair).
    test("target row's third cell, portrait: AVG label 14px ink-3, value 30px ink", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live");
      const labelFontSize = await page
        .locator(".connected-hero-avg-label")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(labelFontSize).toBe("14px");
      const valueFontSize = await page
        .locator(".connected-hero-avg-value")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(valueFontSize).toBe("30px");
    });

    test("up-next: UP NEXT label mono 14 ink-3 over value mono 23 nowrap, then-less form, never wraps or overflows", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live-opener");
      const label = await page
        .locator(".connected-band-upnext-label")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            fontSize: cs.fontSize,
            color: cs.color,
            text: el.textContent,
          };
        });
      expect(label.fontSize).toBe("14px");
      expect(label.color).toBe(INK_3_RGB);
      expect(label.text).toBe("UP NEXT");

      const value = page.locator(".connected-band-upnext-value");
      const fontSize = await value.evaluate(
        (el) => getComputedStyle(el).fontSize,
      );
      expect(fontSize).toBe("23px");
      const text = await value.innerText();
      // PHASE CS Item B (task 2): the then-clause is retired outright, so
      // this reads only the coming WORK phase's own composition-table
      // string (distance, split, rate) — nothing appended for the rest
      // that follows it.
      expect(text.replace(/\s+/g, " ").trim()).toBe("WORK 2000m · 2:06.0 @22");
      await expect(page.locator(".connected-band-upnext-then")).toHaveCount(0);
      // Queue item 7: portrait keeps its own stacked UP NEXT label above,
      // so the landscape-only "NEXT · " prefix stays hidden here too — no
      // double-labeling.
      await expect(page.locator(".connected-band-upnext-next")).toBeHidden();

      const overflow = await value.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    });

    test("EST LEFT: label + value mono 28 on a rule, above the bottom bar", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live");
      const cell = await page.locator(".connected-band-cell").evaluate((el) => {
        const cs = getComputedStyle(el);
        return { borderTop: cs.borderTopWidth, color: cs.borderTopColor };
      });
      expect(cell.borderTop).toBe("1px");
      expect(cell.color).toBe(INK_RGB);
      const value = await page
        .locator(".connected-band-cell-value")
        .evaluate((el) => ({
          fontSize: getComputedStyle(el).fontSize,
          text: el.textContent,
        }));
      expect(value.fontSize).toBe("28px");
      // EST LEFT (Phase LL): "42:11", not "39:48" — see the identical
      // `connected-pane-live` fixture's own note in the LIVE band test
      // above ("bottom band: rule above...").
      expect(value.text).toBe("42:11");
    });

    test("bottom bar: 54px full-width segmented bar, two equal halves, active fill ink/surface text mono 13 600, above home indicator", async ({
      page,
    }) => {
      const title = "Design Connected Portrait Tab Bar Workout";
      await injectConnectedFake(page, ROWING_STORY);
      await openConnected(
        page,
        title,
        "design-connected-portrait-tabbar@e2e.test",
      );
      await walkToSurface(page);
      await pumpUntilText(page, "2 OF 5");

      const controlBox = await page.locator(".connected-control").boundingBox();
      expect(controlBox).not.toBeNull();
      expect(controlBox!.height).toBeCloseTo(54, 0);
      expect(controlBox!.width).toBeCloseTo(390, 0);
      expect(
        await page
          .getByRole("navigation", { name: "Connected panes" })
          .locator("button")
          .count(),
      ).toBe(2);

      const active = page.locator(".connected-control-half-active");
      const activeStyle = await active.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          background: cs.backgroundColor,
          color: cs.color,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
        };
      });
      expect(activeStyle.background).toBe(INK_RGB);
      expect(activeStyle.color).toBe(SURFACE_RGB);
      expect(activeStyle.fontSize).toBe("13px");
      expect(activeStyle.fontWeight).toBe("600");

      await cleanupAllConnected(page, title);
    });
  });

  // RC-27 fix round 1, item 1 (James: "nothing proves the gold actually
  // paints" — recurring failure #21's own shape). `PaneLive.test.tsx`'s
  // CSS-source-text assertion proves the RULE exists in `index.css`; it
  // cannot prove the RESOLVED colour, because jsdom loads no stylesheet —
  // a later rule that out-ranks or follows `.connected-hero-value-rest`
  // would leave both that assertion AND the class-name check green while
  // the hero painted black. This reads `getComputedStyle` against the
  // real cascade, the same technique the grid's own rest-countdown colour
  // check already uses two describe blocks up ("landscape shows the
  // countdown in the REST column...", `restCellColor`).
  test.describe("2A/2C — LIVE, mid-rest (RC-27)", () => {
    test("portrait: the split hero's countdown resolves to --marker gold, not merely carries the class", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-pane-live-resting");
      const value = await page
        .locator(".connected-hero-split .connected-hero-value")
        .evaluate((el) => ({
          color: getComputedStyle(el).color,
          text: el.textContent,
        }));
      expect(value.text).toBe("0:59");
      expect(value.color).toBe(MARKER_RGB);
    });

    test("landscape: the same resolved colour, and no judgement class rides along with it", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 844, height: 390 });
      await loadConnectedFixture(page, "connected-pane-live-resting");
      const value = await page
        .locator(".connected-hero-split .connected-hero-value")
        .evaluate((el) => ({
          color: getComputedStyle(el).color,
          className: el.className,
        }));
      expect(value.color).toBe(MARKER_RGB);
      expect(value.className).not.toMatch(/timer-card-actual-/);
    });
  });

  test.describe("2D — First frame (armed), landscape (design spec §2D)", () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test("status: 1 OF 4 · READY (portrait status likewise)", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-armed");
      const status = await page
        .locator(".connected-line-trailing")
        .textContent();
      expect(status).toBe("1 OF 4 · READY");
    });

    test("status reads READY in portrait too (390x844)", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await loadConnectedFixture(page, "connected-armed");
      const status = await page
        .locator(".connected-line-trailing")
        .textContent();
      expect(status).toBe("1 OF 4 · READY");
    });

    test("mirror: split ghost ink-4 (never ink-5), rate 0 plain ink, nothing judged, no dash-bars", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-armed");
      const split = await judgedColor(
        page,
        ".connected-hero-split .connected-hero-value",
      );
      // Forced "within" by the model (armedMirror), so ink-4 must come
      // from the `.connected-hero-ghost` class layered on top, not from a
      // real judgement colour.
      expect(split.judgement).toBe("within");
      const ghostColor = await page
        .locator(".connected-hero-split .connected-hero-value")
        .evaluate((el) => getComputedStyle(el).color);
      expect(ghostColor).toBe(INK_4_RGB);
      const splitText = await page
        .locator(".connected-hero-split .connected-hero-value")
        .evaluate((el) => (el as HTMLElement).innerText);
      expect(splitText.replace(/\s+/g, "")).toBe("2:06.0");

      const rate = await judgedColor(
        page,
        ".connected-hero-rate .connected-hero-value",
      );
      expect(rate.judgement).toBe("within");
      expect(rate.color).toBe(INK_RGB);
      await expect(
        page.locator(".connected-hero-rate .connected-hero-value"),
      ).toHaveText("0");
      // No ghost class on the rate hero (§2D: "the rate hero does NOT
      // ghost").
      const rateGhost = await page
        .locator(".connected-hero-rate .connected-hero-value")
        .evaluate((el) => el.classList.contains("connected-hero-ghost"));
      expect(rateGhost).toBe(false);

      // No dash-bars: neither hero shows the "no target" dash treatment —
      // armed always substitutes a real preview value.
      expect(await page.locator(".connected-value-absent").count()).toBe(0);
    });

    test("up-next (armed branch): reads the FIRST interval forward, EST LEFT full session, and the rate survives at the corpus worst case", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-armed");
      const upnext = page.locator(".connected-band-upnext-value");
      const value = await upnext.innerText();
      // PHASE CS Item B (task 2): the then-clause is retired, so armed's
      // own value is just the coming WORK phase's composition-table
      // string, nothing appended for the rest after it.
      const normalized = value.replace(/\s+/g, " ").trim();
      expect(normalized).toBe("NEXT · WORK 2000m · 2:06.0 @22");
      const total = await page
        .locator(".connected-band-cell-value")
        .textContent();
      expect(total).toBe("45:36");

      // THE RATE SURVIVES (spec EC3): this fixture's 30-char string —
      // "NEXT · WORK 2000m · 2:06.0 @22" — is the longest COMMITTED-
      // FIXTURE string, not the corpus worst (that's 32 chars, the 70' O2
      // continuous piece at server/seed/library/o2.ts:780 — see the
      // spec's Width section for the correction). This element has room
      // to spare regardless: the retired 35-char then-string rendered
      // here for months pre-ruling, and the pin's own mutation measured
      // this element's clientWidth at 679px with the 30-char string
      // nowhere near filling it, on the phase's own reference landscape
      // frame (844x390, this describe's `test.use`). The `toBe` above
      // already proves the exact string, but this is the criterion's OWN
      // assertion, independently
      // falsifiable from the equality check above: the rendered text
      // ENDS with its `@NN` rate token (never an ellipsis or a cut
      // numeral) — the ellipsis on `.connected-band-upnext-value` and the
      // `scrollWidth <= clientWidth` pins elsewhere in this file are the
      // backstop that the path is never entered; this proves the token
      // that backstop would have clipped is actually there, unclipped.
      expect(normalized).toMatch(/@\d+$/);
      const overflow = await upnext.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    });
  });

  test.describe("Stale — link lost, values held (design spec Stale table)", () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test("values: heroes grey (stale), LAST SEEN caption above each hero — the only post-redesign hero label", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-disconnected");
      const labels = await page
        .locator(".connected-hero-label")
        .evaluateAll((els) =>
          els.map((el) => ({
            text: el.textContent,
            fontSize: getComputedStyle(el).fontSize,
            letterSpacing: parseFloat(getComputedStyle(el).letterSpacing),
            color: getComputedStyle(el).color,
          })),
        );
      expect(labels).toHaveLength(2);
      for (const label of labels) {
        // `LAST SEEN`, not `LAST` (Phase LM PR 1 Task 3, Gate 0): the bare
        // word reads as an ordinal — the last of several readings — where
        // the fact the rower needs is that this is the last number we
        // HEARD.
        expect(label.text).toBe("LAST SEEN");
        expect(label.fontSize).toBe("15px");
        expect(label.letterSpacing).toBeCloseTo(15 * 0.1, 1);
        expect(label.color).toBe(INK_3_RGB);
      }

      const split = await judgedColor(
        page,
        ".connected-hero-split .connected-hero-value",
      );
      expect(split.judgement).toBe("stale");
      expect(split.color).toBe(INK_3_RGB);
      const rate = await judgedColor(
        page,
        ".connected-hero-rate .connected-hero-value",
      );
      expect(rate.judgement).toBe("stale");
      expect(rate.color).toBe(INK_3_RGB);

      // EVERYTHING STALE GREYS TOGETHER, INCLUDING THE METRES (Gate 0).
      // The session counter is fed by frames that simply stop arriving, so
      // it used to hold its last value at full `--ink` beside two greyed
      // heroes: the one number still painted as current was the one nobody
      // could vouch for. Resolved through the real cascade here, not just
      // asserted as a class name.
      const meters = await page
        .locator(".connected-progress-meters")
        .evaluate((el) => getComputedStyle(el).color);
      expect(meters).toBe(INK_3_RGB);
    });

    test("banner: LostBanner (landscape one-line variant), device caption PM5…LOST, hollow mark", async ({
      page,
    }) => {
      await loadConnectedFixture(page, "connected-disconnected");
      const banner = page.locator(".connected-lost");
      await expect(banner).toHaveAttribute("role", "status");
      await expect(page.locator(".connected-lost-title")).toHaveText(
        "LOST THE MONITOR",
      );
      // A TITLE PLUS AT MOST FOUR WORDS, and the body names what actually
      // survives (Phase LM PR 1 Task 3, Gate 0). The twelve-word promise
      // this replaces — "Row on. The erg is still counting and End keeps
      // what we saw." — was true whenever we saw something and a lie in
      // exactly the case that costs a rower their workout. This fixture
      // carries interval 0's own actual, so one interval survives.
      await expect(page.locator(".connected-lost-body")).toHaveText(
        "1 interval kept.",
      );
      // FILLED RED (Gate 0), resolved through the real cascade rather than
      // read off the stylesheet: `--judge-slower` ground with `--surface`
      // text measures 7.94:1, against the house 4.5:1 floor. The banner
      // has to land at arm's length mid-stroke — "the LOST isn't easy to
      // notice, i think we need to highlight that more" (James,
      // 2026-08-25).
      const fill = await banner.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor };
      });
      expect(fill.bg).toBe(JUDGE_SLOWER_RGB);
      for (const child of [".connected-lost-title", ".connected-lost-body"]) {
        const color = await page
          .locator(child)
          .evaluate((el) => getComputedStyle(el).color);
        expect(color).toBe(SURFACE_RGB);
      }
      const device = await page.locator(".connected-line-device").textContent();
      expect(device).toBe("PM5 432331249 · LOST");
      const hollow = await page
        .locator(".connected-line-mark-hollow")
        .evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            bg: cs.backgroundColor,
            borderStyle: cs.borderStyle,
            borderColor: cs.borderColor,
          };
        });
      expect(hollow.bg).toBe("rgba(0, 0, 0, 0)");
      expect(hollow.borderStyle).toBe("solid");
      expect(hollow.borderColor).toBe(INK_RGB);
    });

    test("layout: survives the banner's height without overflow, both orientations", async ({
      page,
    }) => {
      for (const viewport of [
        { width: 844, height: 390, label: "landscape" },
        { width: 390, height: 844, label: "portrait" },
      ] as const) {
        await page.setViewportSize(viewport);
        await loadConnectedFixture(page, "connected-disconnected");
        const overflow = await page.evaluate(() => ({
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
        }));
        expect([
          viewport.label,
          overflow.scrollHeight <= overflow.clientHeight,
        ]).toStrictEqual([viewport.label, true]);
        // The band's EST LEFT stays fully inside the pane even with the
        // banner's own height taken out of the track.
        const paneBox = await page
          .locator(".connected-pane-live")
          .boundingBox();
        const bandBox = await page
          .locator(".connected-band-cell")
          .boundingBox();
        expect(bandBox!.y + bandBox!.height).toBeLessThanOrEqual(
          paneBox!.y + paneBox!.height + 0.5,
        );
      }
    });
  });

  test.describe("Disconnected step-down (design spec Disconnected table)", () => {
    test("heroes step down 112→86 / 92→70 landscape, tenths 58→44", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 844, height: 390 });
      await loadConnectedFixture(page, "connected-disconnected");
      const split = await page
        .locator(".connected-hero-split .connected-hero-value")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(split).toBe("86px");
      const rate = await page
        .locator(".connected-hero-rate .connected-hero-value")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(rate).toBe("70px");
      const tenths = await page
        .locator(".connected-hero-split .connected-hero-tenths")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(tenths).toBe("44px");
    });

    test("heroes step down 100→76 / 84→64 portrait, tenths 52→40", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await loadConnectedFixture(page, "connected-disconnected");
      const split = await page
        .locator(".connected-hero-split .connected-hero-value")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(split).toBe("76px");
      const rate = await page
        .locator(".connected-hero-rate .connected-hero-value")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(rate).toBe("64px");
      const tenths = await page
        .locator(".connected-hero-split .connected-hero-tenths")
        .evaluate((el) => getComputedStyle(el).fontSize);
      expect(tenths).toBe("40px");
    });

    // "Today's step-down is ONE shared rule for both heroes … it splits
    // into two" (§1 deviation table's own words) — the two heroes no
    // longer share a base size, so this proves the split is REAL, not a
    // coincidence of both landing on the same number.
    test("the split and rate step-downs are genuinely two rules, not one shared value", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 844, height: 390 });
      await loadConnectedFixture(page, "connected-disconnected");
      const [split, rate] = await Promise.all([
        page
          .locator(".connected-hero-split .connected-hero-value")
          .evaluate((el) => getComputedStyle(el).fontSize),
        page
          .locator(".connected-hero-rate .connected-hero-value")
          .evaluate((el) => getComputedStyle(el).fontSize),
      ]);
      expect(split).not.toBe(rate);
    });
  });

  // FIX ROUND (Task 6 review, CRITICAL 1): three committed captures
  // (`connected-pane-grid.png`, `connected-pane-grid-long.png`,
  // `connected-disconnected.png`) showed the header's composed status text
  // overprinting the device id and/or END in portrait — §2C's own table
  // draws the status on ITS OWN LINE below the header row ("Header: PM5 id
  // + END (44px, no segmented control up top). Status line mono 21."), not
  // inside it. This mirrors 2A's own landscape header-row idiom
  // (~4789-4796, `control!.x + control!.width <= line!.x`-style pairwise
  // geometry) but as a general AABB overlap test rather than an x-only
  // left-to-right chain: post-fix, status sits on a DIFFERENT row than
  // device/End, so the three boxes no longer share one axis to compare the
  // simpler way — a real 2D intersection test is what actually proves "no
  // collision" regardless of which axis a future regression moves on.
  // Both fixtures below are worst cases for a different reason: the GRID
  // fixture has GRID's own composed `N OF M · <countdown> LEFT` (the
  // longest status string any pane produces); the disconnected fixture has
  // BOTH a long device id (`PM5 432331249 · LOST`) and a status string in
  // the same header, the other half of the collision risk. PROVEN RED
  // against this task's own starting point (bda0a95, before the header
  // restructure below), TWO DIFFERENT WAYS on the two fixtures — plain
  // `element.boundingBox()` alone was NOT enough to catch both. On
  // `connected-pane-grid-long`, status/End genuinely intersect (a measured
  // 12.6px, task-6-report.md's own "New finding" section) — an element-box
  // overlap check goes red on its own there. On `connected-disconnected`,
  // opening a zoomed capture (not just measuring boxes) showed the real
  // defect a box comparison MISSES entirely: `.connected-line-device`
  // shrinks to a 69.5px LAYOUT box under the header's width squeeze, but
  // its own content ("432331249", one unbreakable word with no `word-
  // break`) is wider than that box and PAINTS past it — `getBoundingClient
  // Rect()` on the element reports the narrow 69.5px box (a real 8px gap
  // to `.connected-line-trailing`'s box by that measure), while the actual
  // GLYPHS overflow into trailing's own territory with zero space, reading
  // as "4323312491 OF 4" in the capture. Comparing ELEMENT boxes cannot
  // see this — CSS overflow is a paint-time fact a layout box does not
  // carry — so `textRect` below measures via `Range.getClientRects()`
  // instead (the DOM API for "what glyphs actually painted where," the
  // same mechanism a browser's own text-selection highlight uses), unioned
  // across every rect the range covers so a composed, multi-span trailing
  // (GRID's ordinal + `--marker` countdown) measures as one shape too.
  test.describe("portrait header: device id / status / End never collide (fix round, CRITICAL 1)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    function overlaps(
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ): boolean {
      return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      );
    }

    for (const fixture of [
      "connected-pane-grid-long",
      "connected-disconnected",
    ] as const) {
      test(`${fixture}: device / status / End painted extents never overlap`, async ({
        page,
      }) => {
        await loadConnectedFixture(page, fixture);
        const [device, status, end] = await Promise.all([
          page.evaluate(() => {
            const el = document.querySelector(".connected-line-device")!;
            const range = document.createRange();
            range.selectNodeContents(el);
            const rects = Array.from(range.getClientRects());
            const x = Math.min(...rects.map((r) => r.x));
            const y = Math.min(...rects.map((r) => r.y));
            return {
              x,
              y,
              width: Math.max(...rects.map((r) => r.x + r.width)) - x,
              height: Math.max(...rects.map((r) => r.y + r.height)) - y,
            };
          }),
          page.evaluate(() => {
            const el = document.querySelector(".connected-line-trailing")!;
            const range = document.createRange();
            range.selectNodeContents(el);
            const rects = Array.from(range.getClientRects());
            const x = Math.min(...rects.map((r) => r.x));
            const y = Math.min(...rects.map((r) => r.y));
            return {
              x,
              y,
              width: Math.max(...rects.map((r) => r.x + r.width)) - x,
              height: Math.max(...rects.map((r) => r.y + r.height)) - y,
            };
          }),
          page.getByRole("button", { name: "End session" }).boundingBox(),
        ]);
        expect(end).not.toBeNull();
        expect([
          fixture,
          "device/status",
          overlaps(device, status),
        ]).toStrictEqual([fixture, "device/status", false]);
        expect([fixture, "status/end", overlaps(status, end!)]).toStrictEqual([
          fixture,
          "status/end",
          false,
        ]);
        expect([fixture, "device/end", overlaps(device, end!)]).toStrictEqual([
          fixture,
          "device/end",
          false,
        ]);
      });
    }
  });

  // --progress-active is decoration-only (tokens.css's own comment,
  // reproduced at its one consumer, `.connected-progress-seg-active`):
  // never a TEXT colour, where its 2.61:1 residual would fail WCAG 1.4.3's
  // 4.5:1 floor outright with no redundant carrier. Walked the same
  // leaf-node way `assertNoFailingInk4Labels` walks the ink-4 ban, across
  // every committed connected fixture, so a future consumer of the token
  // on a text node fails here regardless of which fixture exercises it.
  test("--progress-active is never used as a text colour, on any connected fixture", async ({
    page,
  }) => {
    const PROGRESS_ACTIVE_RGB_LOCAL = "rgb(138, 132, 120)";
    const fixtures = [
      "connected-pane-live",
      "connected-pane-live-opener",
      "connected-pane-grid",
      "connected-pane-grid-long",
      "connected-armed",
      "connected-disconnected",
      "connected-paused",
    ];
    for (const name of fixtures) {
      await loadConnectedFixture(page, name);
      const offenders = await page.evaluate((tint) => {
        const bad: string[] = [];
        document.querySelectorAll("body *").forEach((node) => {
          const el = node as HTMLElement;
          if (el.children.length > 0) return;
          if ((el.textContent ?? "").trim() === "") return;
          const style = getComputedStyle(el);
          if (style.color === tint) {
            bad.push(`${el.tagName}.${el.className || "(no class)"}`);
          }
        });
        return bad;
      }, PROGRESS_ACTIVE_RGB_LOCAL);
      expect([name, offenders]).toStrictEqual([name, []]);
    }
  });

  // The ink-4 ban, unchanged by this task's rewrite (design spec §1: "no
  // ink-4 mono <=11px" — the house ban this file's own
  // `assertNoFailingInk4Labels` sweep already enforces everywhere `sweep`
  // runs). Kept as its own named assertion against the frame with the most
  // ink-4 usage (the armed ghost) so the ban has a connected-scoped
  // witness independent of the live-driven `sweep()` calls above.
  test("the ink-4 ban holds on the armed frame's own ghost value", async ({
    page,
  }) => {
    await loadConnectedFixture(page, "connected-armed");
    await assertNoFailingInk4Labels(page);
  });
});

// Phase BL PR C's fresh-user Today (the three-door card; the START HERE
// block that used to sit above it was removed by James's 2026-08-23
// ruling — News's pinned articles carry the teaching alone now).
test.describe("today screen (Phase BL PR C: fresh user — the three-door card)", () => {
  test.beforeEach(async ({ page }) => {
    // A genuinely fresh account (no baselines row at all): the state a
    // real brand-new sign-in lands on, not a fixture layered on top of one
    // — both the block and the doors card only exist in this state.
    await signInViaBackdoor(page, {
      email: "design-onboarding-today@e2e.test",
      name: "Design Onboarding Today Tester",
    });
    await page.goto("/today");
    await expect(page.locator(".doorscard")).toBeVisible();
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // The door sub-copy is the smallest new text this card adds (13px sans
  // ink-3 on the door's own --surface fill) — measured rather than assumed
  // identical to an already-passing --ink-3 pairing elsewhere, per the
  // standing "compute the ratio, don't judge by eye" rule.
  test("a door's sub-copy --ink-3 text clears 4.5:1 against the door's own --surface background", async ({
    page,
  }) => {
    const sub = page.locator(".doorscard-door-sub").first();
    const subColor = await sub.evaluate((el) => getComputedStyle(el).color);
    const doorBg = await page
      .locator(".doorscard-door")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(subColor).toBe("rgb(87, 84, 76)"); // --ink-3
    expect(doorBg).toBe("rgb(255, 253, 247)"); // --surface

    const ratio = await page.evaluate(
      ({ fg, bg }) => {
        function channel(c: number) {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        }
        function luminance(rgb: string) {
          const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
          if (!m) throw new Error(`unparseable colour: ${rgb}`);
          const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
          return (
            0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
          );
        }
        const la = luminance(fg);
        const lb = luminance(bg);
        const lighter = Math.max(la, lb);
        const darker = Math.min(la, lb);
        return (lighter + 0.05) / (darker + 0.05);
      },
      { fg: subColor, bg: doorBg },
    );
    // Measured, not assumed: --ink-3 on --surface computes 7.432:1 —
    // comfortably past the 4.5:1 AA floor.
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

// Phase BL PR C: the three door flow screens themselves (new screens
// register here — TESTING.md §8's "a new screen with no entry here is a
// screen the rules aren't checking"). Each gets the two machine-checkable
// sweeps in its fullest state; the questionnaire additionally sweeps with
// an option SELECTED (the accent-border checked state is this flow's own
// new visual vocabulary).
test.describe("onboarding door flows (Phase BL PR C)", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-onboarding-doors@e2e.test",
      name: "Design Onboarding Doors Tester",
    });
  });

  test("door 1's question screen: tap targets and zero WCAG violations, with an option selected", async ({
    page,
  }) => {
    await page.goto("/onboarding/recommend");
    await expect(
      page.getByRole("heading", { name: "How much have you rowed?" }),
    ).toBeVisible();
    // Tapping an answer auto-advances (2026-08-23); the selected-state
    // question screen is reached by going BACK to it, answer kept.
    await page
      .getByRole("radio", { name: "A little. I know the stroke" })
      .click();
    await page.getByRole("button", { name: "← BACK" }).click();
    await expect(
      page.getByRole("radio", { name: "A little. I know the stroke" }),
    ).toHaveAttribute("aria-checked", "true");
    await assertTapTargets(page);
    await assertNoA11yViolations(page);
  });

  test("door 1's recommendation screen: tap targets and zero WCAG violations", async ({
    page,
  }) => {
    await page.goto("/onboarding/recommend");
    // Answer taps auto-advance through both questions (2026-08-23).
    await page
      .getByRole("radio", { name: "A little. I know the stroke" })
      .click();
    await page
      .getByRole("radio", { name: "Active once or twice a week" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your starting baseline" }),
    ).toBeVisible();
    await assertTapTargets(page);
    await assertNoA11yViolations(page);
  });

  // Door 1's ADJUST step had no sweep of its own until the one-control
  // round (2026-08-24) gave it typed fields — it is the surface whose
  // controls changed most, and it is the only baseline surface with no
  // empty state at all (a prefilled recommendation is PROPOSED, shown at
  // full accent strength, never dimmed).
  test("door 1's adjust step: tap targets, zero WCAG violations, and prefilled values that are values", async ({
    page,
  }) => {
    await page.goto("/onboarding/recommend");
    await page
      .getByRole("radio", { name: "A little. I know the stroke" })
      .click();
    await page
      .getByRole("radio", { name: "Active once or twice a week" })
      .click();
    await page
      .getByRole("button", { name: "Adjust the numbers first" })
      .click();
    const k2 = page.getByRole("textbox", { name: "2k split" });
    await expect(k2).toHaveValue("2:25.0");
    await expect(k2).not.toHaveAttribute("placeholder", /./);

    // Typed entry, the affordance this step never had: three keystrokes
    // instead of the 54 stepper taps 2:25 -> 1:58 used to cost here.
    await k2.click();
    await k2.pressSequentially("158");
    await page.getByRole("button", { name: "2k faster" }).click();
    await expect(k2).toHaveValue("1:57.5");

    await assertTapTargets(page);
    await assertNoA11yViolations(page);
  });

  test("door 2's editor screen: tap targets and zero WCAG violations", async ({
    page,
  }) => {
    await page.goto("/onboarding/know");
    await expect(
      page.getByRole("heading", { name: "Enter your splits" }),
    ).toBeVisible();
    // Honest-empty round: this account has no baselines, so both fields
    // are empty with the seed as a dim placeholder.
    const k2 = page.getByRole("textbox", { name: "2k split" });
    await expect(k2).toHaveValue("");
    await expect(k2).toHaveAttribute("placeholder", "2:25.0");
    await assertTapTargets(page);
    await assertNoA11yViolations(page);

    // The steppers this door never had, and the materialise rule: the
    // first tap on an empty field is the seed exactly, not seed ± a step.
    await page.getByRole("button", { name: "2k faster" }).click();
    await expect(k2).toHaveValue("2:25.0");
    await assertTapTargets(page);
    await assertNoA11yViolations(page);
  });

  test("door 3's distance screen: tap targets and zero WCAG violations", async ({
    page,
  }) => {
    await page.goto("/onboarding/row");
    await expect(
      page.getByRole("heading", { name: "Pick your distance" }),
    ).toBeVisible();
    await assertTapTargets(page);
    await assertNoA11yViolations(page);
  });

  test("no mono label ≤11px paints at --ink-4 on any door flow screen", async ({
    page,
  }) => {
    for (const path of [
      "/onboarding/recommend",
      "/onboarding/know",
      "/onboarding/row",
    ]) {
      await page.goto(path);
      await expect(page.locator(".onb-screen")).toBeVisible();
      await assertNoFailingInk4Labels(page);
    }
  });
});

// ── Wave E PR2, Surface 1: the Concept2 card's landscape interior ──────────
//
// WHAT THIS PROVES, exactly (RF26 — the strongest claim it may make): that
// `index.css`'s `@media (orientation: landscape)` rules for
// `.c2-card-body-split` really move the card's own markup in a real engine,
// that portrait does not, and that the states the amendment draws SINGLE
// column stay single column with their hairlines intact.
//
// WHICH STATES ARE WHICH IS MEASURED, NOT READ. A script over every
// `class="frame land"` block in `amendment-2026-09-03.html` reports a
// two-column grid on 1a, 1c, 1f, 1f-b, 1f-c, 1i and 1j and no grid on 1b, 1d, 1e
// and 1g, and reports that 1d's landscape frame DRAWS a hairline. A previous
// revision of this file asserted that no landscape frame draws one and that
// only 1b and 1g are un-gridded; both were false, and the hairline test here
// enforced the wrong claim. The fixtures below cover one state of each kind.
//
// THE FIXTURES ARE THE COMPONENT'S OWN OUTPUT, and that is gated rather than
// asserted: `Concept2Card.test.tsx`'s "the e2e fixtures ARE this component's
// output" compares each committed file against the component's `innerHTML`
// in full, so any drift at all — a moved `<hr>`, a changed status string, a
// dropped aria attribute — reddens there. `loadCard` applies the same
// whitespace normalisation those tests use, so the browser sees the
// component's exact markup regardless of how the file is formatted on disk;
// the empty act column in the 1g fixture must stay `:empty` to collapse.
//
// WHAT IT DOES NOT PROVE: that the card is reachable on You. It is not, yet —
// Task 8 mounts it and the e2e stack runs with `C2_LINK_ENABLED` unset
// (`compose.yml`'s `C2_LINK_ENABLED: ${C2_LINK_ENABLED:-}`, exported by
// neither `e2e.sh` nor `screenshots.sh`), so the route answers
// `{available:false}` and the card renders `null` on every screen in this
// suite today. The end-to-end version is owed at Task 8/11.
//
// Boxes are read off `.c2-card-tell` and `.c2-card-act`, which are `div`s and
// therefore block-level; an inline element reports 0 for every box metric,
// which is the measurement error RF21's own example shipped.
test.describe("Concept2 card: the landscape interior (Gate 0 amendment §1a-1j)", () => {
  async function loadCard(page: Page, fixture: string): Promise<void> {
    const markup = readFileSync(
      path.join(process.cwd(), "e2e/fixtures", fixture),
      { encoding: "utf-8" },
    ).replace(/>\s+</g, "><");
    await page.goto("/", { waitUntil: "load" });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--page")
          .trim() !== "",
    );
    await page.evaluate((html) => {
      document.body.innerHTML = `<div class="app-shell">${html}</div>`;
    }, markup);
    await expect(page.locator(".c2-card")).toBeVisible();
  }

  /** Both columns' boxes in one round trip. */
  async function columns(page: Page) {
    const tell = await page.locator(".c2-card-tell").boundingBox();
    const act = await page.locator(".c2-card-act").boundingBox();
    if (tell === null || act === null)
      throw new Error("a column had no box — the fixture did not render");
    return { tell, act };
  }

  test("a SPLIT state puts the action column to the right of the tell column in landscape, and stacks in portrait", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_LANDSCAPE);
    await loadCard(page, "c2-card-unlinked.html");
    const land = await columns(page);
    // Side by side means the action column STARTS to the right of where the
    // tell column ENDS — stronger than comparing left edges alone, which a
    // stacked layout with any indent could pass.
    expect(land.act.x).toBeGreaterThan(land.tell.x + land.tell.width - 1);
    expect(Math.abs(land.act.y - land.tell.y)).toBeLessThan(land.tell.height);

    await page.setViewportSize(PHONE_PORTRAIT);
    await loadCard(page, "c2-card-unlinked.html");
    const port = await columns(page);
    expect(port.act.x).toBeCloseTo(port.tell.x, 0);
    expect(port.act.y).toBeGreaterThan(port.tell.y + port.tell.height - 1);
  });

  test("a SINGLE-column state (1d armed) stays stacked in landscape and keeps its hairline", async ({
    page,
  }) => {
    // 1d is badged UNCHANGED on the page — inherited from the approved board
    // — and the page draws it single column WITH a hairline in landscape as
    // well as portrait. This is the assertion that stops the split rule
    // reaching it.
    await page.setViewportSize(PHONE_LANDSCAPE);
    await loadCard(page, "c2-card-armed.html");
    const land = await columns(page);
    expect(land.act.x).toBeCloseTo(land.tell.x, 0);
    expect(land.act.y).toBeGreaterThan(land.tell.y + land.tell.height - 1);
    await expect(page.locator(".c2-card-hair")).toBeVisible();

    await page.setViewportSize(PHONE_PORTRAIT);
    await loadCard(page, "c2-card-armed.html");
    await expect(page.locator(".c2-card-hair")).toBeVisible();
  });

  test("a SPLIT state drops the hairline in landscape, and keeps it in portrait", async ({
    page,
  }) => {
    // Scoped to the split body only: the 20px column gap has taken over the
    // job of marking the break, which is why all seven gridded frames
    // (1a, 1c, 1f, 1f-b, 1f-c, 1i, 1j) draw no hairline in landscape while
    // 1d does.
    await page.setViewportSize(PHONE_LANDSCAPE);
    await loadCard(page, "c2-card-unlinked.html");
    await expect(page.locator(".c2-card-hair")).toBeHidden();

    await page.setViewportSize(PHONE_PORTRAIT);
    await loadCard(page, "c2-card-unlinked.html");
    await expect(page.locator(".c2-card-hair")).toBeVisible();
  });

  test("every control clears the height its own frame draws, in both orientations", async ({
    page,
  }) => {
    // THE GATE D1 NEEDED AND DID NOT HAVE (fix round 4). The retry button
    // shipped at 48px for four rounds — 4px shorter than every frame that
    // draws it — and nothing here would have noticed, because no test
    // measured a control's box. The reviewer caught it by measuring the
    // PAGE; this measures the BUILD against the same numbers.
    //
    // The numbers are the amendment's own inline styles, transcribed, not
    // read back off `index.css`: all seven LIVE in-card outline buttons
    // carry `min-height: 52px`, `.btn-primary` is 48px and `.btn-danger` is
    // 52px. Independent literals, so retuning the CSS cannot retune the
    // test with it (RF21).
    //
    // "LIVE" corrected at Task 5 fix round 1 (F3): this comment said
    // "all seven `.btn-outline`s inside a `c2card` frame", and a
    // nesting-aware scan of the page counts EIGHT. The eighth is the inert,
    // struck "Cancel" at 44px under "REMOVED FROM THE BOARD, SHOWN STRUCK
    // FOR THE RECORD" — a drawing of a deleted control, which is why none of
    // the three cases below moves. An absolute over a mechanical class is a
    // census, and this one had already gone stale in the round that wrote it.
    const cases: [string, string, number][] = [
      ["c2-card-unlinked.html", ".c2-card-primary", 48],
      ["c2-card-armed.html", ".c2-card-danger", 52],
      ["c2-card-read-failed.html", ".c2-card-retry", 52],
    ];
    for (const vp of [PHONE_PORTRAIT, PHONE_LANDSCAPE]) {
      await page.setViewportSize(vp);
      for (const [fixture, selector, expected] of cases) {
        await loadCard(page, fixture);
        const box = await page.locator(selector).boundingBox();
        if (box === null) throw new Error(`${selector} had no box`);
        expect(box.height).toBe(expected);
        // And the house floor, which is the reason any of this matters.
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("a state with nothing to DO (1g) gives its panel the full card width", async ({
    page,
  }) => {
    // `.c2-card-act:empty { display: none }`, measured on what it actually
    // buys. The first draft of this test asserted `toBeHidden()` on the act
    // column and that the tell column spanned the body width, and DELETING
    // THE RULE LEFT BOTH GREEN (probe M38): 1g is single-column anyway, so
    // an empty flex child is already full width, and Playwright counts a
    // zero-height box as hidden. Both assertions were decoration.
    //
    // The rule's real effect is the trailing 12px flex GAP an empty child
    // would add under the panel — so the deciding assertion is the body's
    // own height against its one visible column's, plus the computed
    // `display`, which is the property the rule sets.
    for (const vp of [PHONE_LANDSCAPE, PHONE_PORTRAIT]) {
      await page.setViewportSize(vp);
      await loadCard(page, "c2-card-update-required.html");
      const tell = await page.locator(".c2-card-tell").boundingBox();
      const body = await page.locator(".c2-card-body").boundingBox();
      if (tell === null || body === null) throw new Error("no box");
      expect(tell.width).toBeCloseTo(body.width, 0);
      // No trailing gap: the body is exactly as tall as its one column.
      expect(body.height).toBeCloseTo(tell.height, 0);
      expect(
        await page
          .locator(".c2-card-act")
          .evaluate((el) => getComputedStyle(el).display),
      ).toBe("none");
    }
  });
});

// ── Wave E PR2, Surface 2: the log-detail Send block's control heights ─────
//
// WHAT THIS PROVES, exactly (RF26): that the `.c2-send-action` and
// `.c2-send-linkout` rules in the shipped `index.css` give those controls
// the heights the amendment's §2 frames draw, in a real engine, in both
// orientations — 48px for the outline action (the page's `.btn-outline`
// default, which is what the Send block's four buttons carry: unlike every
// `.btn-outline` inside a `c2card`, none of them takes an inline override)
// and 44px for the link row (`.send-linkrow`).
//
// WHY IT EXISTS: D1, one surface over. `.c2-card-retry` shipped at 48px for
// four review rounds — 4px shorter than every frame that draws it — because
// nothing measured a control's box. The reviewer found it by measuring the
// PAGE; this measures the BUILD.
//
// The expected numbers are the amendment's own CSS transcribed as
// INDEPENDENT literals, never read back off `index.css`, so retuning the
// stylesheet cannot retune the test with it (RF21).
//
// THE FIXTURES ARE THE COMPONENT'S OWN OUTPUT, and that is gated rather
// than asserted: `Concept2SendBlock.test.tsx`'s "the e2e fixtures ARE this
// block's output" compares each committed file against the component's
// `innerHTML` in full, so any drift — a renamed class, a moved button, a
// reworded status — reddens there.
//
// WHAT IT DOES NOT PROVE: that the block is reachable on a real log row.
// It is not, in this stack — `compose.yml`'s `C2_LINK_ENABLED:
// ${C2_LINK_ENABLED:-}` is exported by neither `e2e.sh` nor
// `screenshots.sh`, so `GET /api/concept2/link` answers `{available:false}`
// and this block renders `null` on every screen in this suite. The
// end-to-end version is owed at Task 11.
//
// Boxes are read off `<button>`s, which are not inline (RF21's own
// measurement error: an inline element reports 0 for every box metric).
test.describe("Concept2 send block: the control heights §2 draws", () => {
  async function loadBlock(page: Page, fixture: string): Promise<void> {
    const markup = readFileSync(
      path.join(process.cwd(), "e2e/fixtures", fixture),
      { encoding: "utf-8" },
    ).replace(/>\s+</g, "><");
    await page.goto("/", { waitUntil: "load" });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--page")
          .trim() !== "",
    );
    await page.evaluate((html) => {
      document.body.innerHTML = `<div class="app-shell">${html}</div>`;
    }, markup);
    await expect(page.locator(".c2-send")).toBeVisible();
  }

  test("every control clears the height its own frame draws, in both orientations", async ({
    page,
  }) => {
    const cases: [string, string, number][] = [
      // 2a: the outline action, at `.btn-outline`'s own 48px.
      ["c2-send-idle.html", ".c2-send-action", 48],
      // 2c: the link row, at `.send-linkrow`'s 44px.
      ["c2-send-sent.html", ".c2-send-linkout", 44],
      // 2i draws BOTH. Its `Send again` is the ink outline 2e gives
      // `Retry send` — the frames drew it as the 44px accent Delete control
      // and the callout named a treatment 2e does not use, and both were
      // corrected on the page in this task's fix round 1 (ruling R5). So
      // this row and the 2a row above pin the SAME expected height, which
      // is the point: one control class, one number.
      ["c2-send-no-weight.html", ".c2-send-linkout", 44],
      ["c2-send-no-weight.html", ".c2-send-action", 48],
    ];
    for (const vp of [PHONE_PORTRAIT, PHONE_LANDSCAPE]) {
      await page.setViewportSize(vp);
      for (const [fixture, selector, expected] of cases) {
        await loadBlock(page, fixture);
        const box = await page.locator(selector).boundingBox();
        if (box === null) throw new Error(`${selector} had no box`);
        expect(box.height).toBe(expected);
        // And the house floor, which is the reason any of this matters.
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
