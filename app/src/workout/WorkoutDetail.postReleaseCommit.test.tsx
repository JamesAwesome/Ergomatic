// §10 ROW 2 — "producer update after release ... all reach `commit`" —
// GATED THROUGH THE REAL DESTINATION SEAM (PR #239 review round 3,
// reviewer finding 1).
//
// **WHY THIS FILE EXISTS AT ALL.** Round 1 answered the row with four
// orderings driven at the hook layer, and the reviewer rejected them as a
// manufactured 2x2: one cell unmounted `renderHook` directly with no
// production navigation anywhere near it; one fired the driver's reconcile
// from a test-only layout effect on a destination component that rendered
// `null`; the post-teardown cells installed a receipt channel production
// does not have; and nothing bound the row to real capture bytes. The
// ruling was "amend the matrix to reachable production orderings and gate
// those through the actual destination seam." This file is that gate. The
// destination is the REAL consumer — `LogSession`, the hand-off's reader —
// reached by the REAL producer of that navigation, `WorkoutDetail.tsx`'s
// own `handleConnectedEnded`, from a REAL release, over the wire.
//
// Composition is `WorkoutDetail.connectedRecovery.test.tsx`'s (spec §10
// row 12's own binding route gate, which this file deliberately mirrors
// rather than reinvents): real `WorkoutDetail` -> real
// `ConnectedInterstitial` -> real `useMonitorSession` -> a CSAFE-correct
// fake transport, with `../adapters/monitorTransport` as the ONE mocked
// seam so every product handler in between stays real.
//
// ---------------------------------------------------------------------
// THE MATRIX, RE-DERIVED AGAINST PRODUCTION (this is the amendment).
//
// §10 row 2 asks for "before/after navigation x before/after teardown".
// Read against the shipped code, those two axes are not independent, and
// row 2 owns TWO producer orderings, both gated in this file (round 9
// correction — an earlier revision of this header said three of four
// cells were not rower-reachable, which the file's own tests had
// outgrown): (i) delivery inside the release->navigation gap (defensive
// synthetic; tests 2/3), and (ii) post-navigation delivery during the
// teardown linger (test 1). After-navigation/before-teardown is a real
// gap OWNED BY ROW 3, and the one genuinely dead cell is:
//
//  - **Navigation and teardown are ONE React commit, not two axes.**
//    `WorkoutDetail.tsx`'s `handleConnectedEnded` (the ONLY door out of a
//    finished connected session) runs `setConnecting(null)` and
//    `navigate(`/library/${workout.id}/log?from=monitor`)` in a single
//    handler, so the interstitial subtree is dropped in the same commit
//    that changes the URL. There is no "teardown, then navigation": the
//    navigation IS what tears the surface down. **That kills the
//    after-teardown/before-navigation cell outright.**
//
//  - **The release LEADS to the navigation, and there is a real gap
//    between them (PR #239 review round 6; THE CLAIM ABOUT THAT GAP
//    NARROWED at round 8, reviewer finding 1 — this bullet twice said more
//    than its evidence supported, first in the other direction).**
//    `releaseHandoff` commits `handoffHeld: false`
//    (`useMonitorSession.ts:2158`); `ConnectedSurface.tsx:352-358` then
//    fires `onEnded` from a PASSIVE effect, which React runs after that
//    commit, not inside it. Three separate facts, kept apart:
//      1. **The gap is REAL** — React's own passive-effect contract, and
//         nothing text-shaped can close it (the source pins at the bottom
//         of this file exclude only ADDITIONAL deferral inside the
//         handler). PRIMARY: React's documented `useEffect` timing.
//      2. **Production delivery is TASK-scheduled, and its order against
//         the navigation task is UNSPECIFIED.** On web a notification
//         arrives as a `characteristicvaluechanged` event queued on the
//         **Bluetooth task source** — a task, not a microtask (PRIMARY:
//         https://webbluetoothcg.github.io/web-bluetooth/#dfn-bluetooth-task-source).
//         On native it is a Capacitor plugin callback with NO evidenced
//         ordering; we have no source that pins it. Two macrotask sources
//         have no specified relative order, so a real frame occupying this
//         particular interval is **PLAUSIBLE, not demonstrated.**
//      3. **What this file's wedge is** — a `MutationObserver` microtask
//         invoking a synchronous fake, i.e. a DEFENSIVE SYNTHETIC
//         ORDERING. It proves the app ACCEPTS a summary delivered in the
//         gap (acceptance-if-delivered) and NOT that a supported wire
//         producer occupies it. Rounds 3-5 claimed the interval was
//         unoccupiable with no evidence; rounds 6-7 then read as though
//         occupancy had been demonstrated. Neither is what we have.
//    A gate on the task-source race itself is deliberately NOT attempted:
//    a deterministic one would be manufactured, since the platform
//    specifies no order between the two sources.
//    **So the navigation axis carries two orderings, both gated:**
//    (i) delivery INSIDE the interval — synthetic, this file's second and
//    third tests at the route layer, with `useMonitorSession.test.ts`'s
//    `row 2, HOOK LAYER` arm carrying the same state at the hook
//    (released, still mounted, still subscribed, commit accepted and
//    receipted after the release); and (ii) delivery AFTER the navigation —
//    this file's first test, which needs no wedge at all.
//    **The consumer consequence of (i) is not a third state.** No consumer
//    exists during the interval: `LogSession` is what the navigation
//    mounts. So (i)'s consumer half is a MOUNT snapshot, and the only
//    question is which side of the fold-in that mount falls on. BOTH sides
//    are now driven through the ORIGINAL navigation, and the wire itself
//    decides which one happens: 0x0039 alone leaves the driver holding its
//    observations emit for `HASH_SUBWINDOW_MS`, so the mount lands FIRST
//    (test 2); 0x0039 followed by its 0x003F flushes that emit
//    synchronously, so the FOLD-IN lands first and the mounted consumer
//    shows the machine's numbers and saves them (test 3). Contract A is
//    asserted on both sides. Test 4 keeps the separate RE-ENTRY case — a
//    cold door onto an already-folded store — which is equivalence, not
//    ordering.
//
//  - **HOW THE FIRST BULLET IS ESTABLISHED, said exactly (PR #239
//    review round 4, reviewer finding 2).** It is a SOURCE-REVIEWED
//    REACHABILITY ASSUMPTION about two named handlers — NOT a production
//    observable the behavioural test below pins. (The second bullet no
//    longer rests on it at all: it names its own three facts and their
//    separate strengths.) The reviewer proved the
//    difference: wrapping `navigate(...)` in `setTimeout(..., 0)` inside
//    `handleConnectedEnded` leaves that test GREEN, because `waitFor`
//    cannot tell a same-commit route change from one a macrotask later.
//    What the behavioural test DOES establish is the weaker,
//    still-load-bearing fact that the connected surface is gone and the
//    real `LogSession` replaced it — never `WorkoutDetail`'s own detail
//    view with its Connect button back. The one-commit claim itself is
//    gated separately and honestly, by the source-shape pins in "the
//    reduction's premise, pinned at the source it was reviewed at" at
//    the bottom of this file, which go red on exactly that mutation.
//
//  - **After navigation, before teardown** is a real gap — React renders
//    the new route before the old subtree's passive cleanup — but the spec
//    already rules on who may occupy it, and it is not this row.
//    §10 row 3, verbatim: "R1 committed from the OLD hook's
//    passive-cleanup teardown (the only occupant React allows between the
//    new render and its mount effect — delta pass; **an arbitrary driver
//    callback cannot be scheduled there**, and a store-level direct call
//    would be RF24 wearing this row's number)". Round 1 scheduled exactly
//    such an arbitrary callback, from a test-only layout effect, which is
//    the thing that sentence forbids. **SPOKEN SKIP: this cell belongs to
//    row 3 and is gated by row 3's own test; row 2 does not manufacture a
//    driver callback into it.**
//
// What is left is the row's own headline case (§1: "the late burst"; §9.1:
// "the window is bounded by the producer's subscription life") in its
// reachable positions: the hold times out on its own backstop, the release
// frees the surface, and the machine's summary arrives inside
// `BURST_LINGER_MS` — after the navigation (test 1, no wedge), or placed
// inside the release-to-navigation interval by the wedge, on either side of
// the driver's own fold-in (tests 2 and 3). Test 1's position is
// production's; tests 2-3's is synthetic and labelled as such. Test 4
// carries the separate re-entry case. This file drives all four end to end,
// with no seam touched but the transport.
//
// **Why the window is still open after teardown**, stated so the test does
// not read as wishful thinking: `useMonitorSession.ts`'s `teardown` takes
// the LATE side on a burst-eligible record whose burst has not landed —
// it stashes the ring, arms `BURST_LINGER_MS`, and RETURNS, deferring the
// reconcile/release/unsubscribe/disconnect steps. The producer's
// subscription therefore outlives the component, which is exactly what
// makes a post-teardown producer update reachable at all.
//
// ---------------------------------------------------------------------
// THE OBSERVABLES ARE PRODUCTION'S OWN (the round-1 objection this file
// answers most directly).
//
// Round 1 installed `setReceiptChannel` after the hook handed its own
// back, and asserted on receipts collected through it — a channel the app
// never has in that state. It never has it for a reason: the hook's
// unmount cleanup calls `setReceiptChannel(null)`
// (`useMonitorSession.ts:4119-4127`), so a commit landing after teardown
// genuinely emits into nothing. Asserting there was asserting on the
// harness.
//
// This file asserts only on things production itself reads or writes:
//   1. `currentUnretired()` / `read()` — the store API `LogSession.tsx`
//      and `Today.tsx` read the record through. Revision advanced, the
//      machine's totals on the entry.
//   2. `localStorage[MONITOR_RUN_KEY]` — the durable bytes, read straight
//      back out, which is what survives a reload.
//   3. `sessionStorage["ergomatic:last-rowed-log"]` — the ring stash
//      `teardown`'s own `stash()` writes, and re-writes at linger end
//      precisely so the burst-era entries are captured. This is the
//      instrument a WALK reads; it exists in production whether or not a
//      test is running.
//   4. The rendered screens — the real `LogSession` heading, and the
//      absence of `WorkoutDetail`'s Connect button.
//
// The REAL-BYTES half of §10's header ("the burst orderings of row 2")
// lives in `handoffStoreReplay.test.ts`'s row-2 leg, over
// `walk-2026-08-25/rests-finished-recording.jsonl.gz`, where a genuine
// post-close producer frame lands ~180 ms after the close on the wire's
// own timing. A jsdom component test cannot replay capture bytes through
// a full route tree; the two halves are deliberately split, and each says
// so.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import { WORKOUTSTATE_INTERVALWORKTIME } from "../../domain/monitor/pm5/parse.js";
import type { Transport } from "../../domain/monitor/types.js";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { api } from "../api";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import { MONITOR_RUN_KEY, type MonitorRun } from "../monitor/monitorRun";
import {
  currentUnretired,
  resetForTests as resetHandoffStore,
} from "../monitor/handoffStore";
import { BURST_HANDOFF_HOLD_MS } from "../monitor/useMonitorSession";
import { createFakeTransport } from "../monitor/transports/fake";
import type { FakeControls } from "../monitor/transports/fake";
import WorkoutDetail from "./WorkoutDetail";
import LogSession from "../session/LogSession";

/** One effort-only distance step, so no baselines question is entangled
 *  with this file's subject — `connectedRecovery`'s own fixture shape and
 *  reasoning. */
const WORKOUT: LibraryWorkout = {
  id: "w-row2-late-burst",
  title: "Row 2 Late Burst",
  type: "O2",
  difficulty: "easy",
  pain: 2,
  steps: [
    {
      k: "w",
      duration: { kind: "distance", meters: 6000 },
      ref: { effort: "min" },
    },
  ],
  isGlobal: true,
  lastDoneDaysAgo: null,
};

const BASELINES: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const DEVICE = "PM5 445566 Row";

/** The machine's own end-of-workout numbers, delivered LATE — after the
 *  release, after the navigation, after the teardown. Distinct from
 *  anything the scripted rowing frame produces, so an assertion on them
 *  cannot be satisfied by a value that was already on the record. */
const LATE_SUMMARY = { elapsedSeconds: 57, meters: 244 };

/** The same `buildDraft -> buildRun -> compileProgram` pipeline
 *  `WorkoutDetail.tsx`'s own `handleConnectProceed` runs, so
 *  `createFakeTransport`'s structural-byte check has the program the real
 *  Connect flow will actually send (`connectedRecovery`'s own `programFor`,
 *  same reasoning). */
function programFor(
  workout: LibraryWorkout,
  baselines: Baselines,
): WorkoutProgram {
  const draft = buildDraft({
    id: workout.id,
    title: workout.title,
    type: workout.type as WorkoutType,
    steps: workout.steps,
  });
  const run = buildRun(draft, baselines, new Date("2026-08-30T12:00:00.000Z"));
  const compiled = compileProgram(run.phases);
  if ("code" in compiled) {
    throw new Error(`fixture failed to compile: ${compiled.code}`);
  }
  return compiled;
}

vi.mock("../api/useWorkouts", () => ({
  useWorkouts: () => ({ state: "ready", workouts: [WORKOUT] }),
}));
vi.mock("../api/useBaselines", () => ({
  useBaselines: () => ({ state: "ready", baselines: BASELINES }),
}));
vi.mock("../api/usePreferences", () => ({
  usePreferences: () => ({
    state: "ready",
    preferences: { difficulties: [], timeCapMinutes: 60, countdownSeconds: 10 },
  }),
}));
vi.mock("../api/usePlan", () => ({
  usePlan: () => ({
    state: "ready",
    plan: { planKey: null, doneN: 0, sequence: [] },
    choose: vi.fn(),
    reset: vi.fn(),
  }),
}));

const apiFn = vi.fn<typeof api>(async () =>
  Promise.resolve(
    new Response(JSON.stringify({ id: "log-row2" }), { status: 201 }),
  ),
);
vi.mock("../api", () => ({
  api: (path: string, init?: RequestInit) => apiFn(path, init),
}));

/** The ONE mocked seam — `useMonitorSession`'s default `createTransport`
 *  resolves through this when no caller supplies one, and `WorkoutDetail`
 *  never passes `deps` to `ConnectedInterstitial`. Mocking here rather
 *  than at the component's props is what keeps `handleConnectedEnded`
 *  real. */
let fakeForTest: (Transport & FakeControls) | null = null;
vi.mock("../adapters/monitorTransport", () => ({
  defaultTransport: () => fakeForTest,
}));

function durableRun(): MonitorRun | null {
  const raw = localStorage.getItem(MONITOR_RUN_KEY);
  return raw === null ? null : (JSON.parse(raw) as MonitorRun);
}

/** The ring stash `useMonitorSession.ts`'s own `teardown`/`finish` write
 *  (`sessionStorage.setItem("ergomatic:last-rowed-log", ...)`) — a
 *  production instrument, not a test channel. */
function rowedLogKinds(): string[] {
  const raw = sessionStorage.getItem("ergomatic:last-rowed-log");
  if (raw === null) return [];
  return (JSON.parse(raw) as { kind: string }[]).map((e) => e.kind);
}

/** Everything the rower can read on the current screen, as one string —
 *  the coarsest possible "did anything on this screen change" instrument,
 *  chosen deliberately over naming individual numbers so a late commit
 *  moving ANY rendered figure (a hero, a row, the total line, a caption)
 *  fails the comparison rather than only the two fields this test knows
 *  to look for. */
function screenText(): string {
  return document.querySelector("main")?.textContent ?? "";
}

/** The fake this file's tests all script: one real rowing frame, nothing
 *  else, so the burst hold has to time out on its own backstop. */
function makeFake(): Transport & FakeControls {
  return createFakeTransport({
    program: programFor(WORKOUT, BASELINES),
    deviceName: DEVICE,
    events: [
      {
        atMs: 100,
        kind: "status",
        workoutState: WORKOUTSTATE_INTERVALWORKTIME,
        elapsedSeconds: 20,
        distanceMeters: 70,
        spm: 21,
        currentSplit: 117.8,
        heartRateBpm: 164,
        programIntervalIndex: 0,
      },
    ],
  });
}

/** What the screen was showing at the instant a wire frame was delivered —
 *  the whole of a wedge test's claim about WHERE in the flush the delivery
 *  happened. */
type GapRecord = { main: string; consumerMounted: boolean };

/**
 * THE WEDGE (PR #239 review round 6, NARROWED at round 8) — a
 * `MutationObserver` that fires on the DOM mutation the release's own commit
 * produces and runs `deliver` there, between that commit and the passive
 * effect that navigates.
 *
 * **WHAT IT IS, SAID AT ITS REAL STRENGTH.** This is a DEFENSIVE SYNTHETIC
 * ORDERING, not a demonstration of wire reachability. The observer callback
 * is a MICROTASK invoking a synchronous fake, so the delivery is guaranteed
 * to land in the gap — which is exactly what makes it a usable gate and
 * exactly what stops it from proving that a real producer occupies that gap.
 * See the two tests' own headers for the scheduling facts and what they do
 * and do not license.
 *
 * The observer renders no component, mounts no effect into the production
 * tree, and installs no channel the app lacks; it observes the DOM from
 * outside and supplies only the MOMENT. Whatever `deliver` does goes through
 * the same wire seam (`fake.deliver*`) every other test in this file uses.
 */
function wedgeIntoTheGap(deliver: () => void): {
  atDelivery: GapRecord[];
  disconnect: () => void;
} {
  const atDelivery: GapRecord[] = [];
  let delivered = false;
  const observer = new MutationObserver(() => {
    // Every mutation while the hold is still open is skipped: the held
    // branch's own caption is on screen, so this is not the release.
    if (delivered) return;
    if (screen.queryByText("Getting the monitor's own numbers.") !== null) {
      return;
    }
    delivered = true;
    atDelivery.push({
      main: screenText(),
      consumerMounted:
        screen.queryByRole("button", { name: "Save without logging" }) !== null,
    });
    deliver();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  return {
    atDelivery,
    disconnect: () => {
      observer.disconnect();
    },
  };
}

/** The position assertions every wedge test shares: ONE delivery, made while
 *  the surface was showing the RELEASED ended frame (production's own
 *  `!handoffHeld` copy — `ConnectedSurface.tsx:485-495` renders "No numbers
 *  to keep." on that branch alone, the held branch reading "Getting the
 *  monitor's own numbers.") and no consumer existed yet. That pair IS
 *  after-release and before-navigation, in production's own strings. */
function expectDeliveredInTheGap(atDelivery: GapRecord[]): void {
  expect(atDelivery).toHaveLength(1);
  expect(atDelivery[0]!.main).toContain("SESSION ENDED");
  expect(atDelivery[0]!.main).toContain("No numbers to keep.");
  expect(atDelivery[0]!.main).not.toContain(
    "Getting the monitor's own numbers.",
  );
  expect(atDelivery[0]!.consumerMounted).toBe(false);
}

/** The two production routes this file composes over, plus a Today stub —
 *  identical in both tests, so the composition is stated once. */
function renderRoutes(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[`/library/${WORKOUT.id}`]}>
      <Routes>
        <Route path="/library/:id" element={<WorkoutDetail />} />
        <Route path="/library/:id/log" element={<LogSession />} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The rower's own path from the library screen to the burst hold: Connect,
 *  the ack-gated programming exchange, one real rowing frame, then End
 *  pressed twice. Every step is a production interaction; nothing here
 *  asserts the row, and both tests below start from its end state. */
async function rowToBurstHold(fake: Transport & FakeControls): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));

  // Pump the ack-gated programming exchange — microtask hops, never
  // timed (`connectedRecovery`'s own identical loop).
  for (let i = 0; i < 40; i += 1) {
    await act(async () => {
      fake.tick(0);
      await Promise.resolve();
    });
    if (screen.queryByText("Ready when you pull")) break;
  }
  await screen.findByText("Ready when you pull");

  await userEvent.click(
    screen.getByRole("button", { name: "Show me the numbers" }),
  );
  // The scripted rowing frame: real flywheel evidence, so the rowing
  // gate opens the record through the store's create-commit.
  await act(async () => {
    fake.tick(200);
    await Promise.resolve();
  });
  await screen.findByRole("navigation", { name: "Connected panes" });

  // A real, link-up End press — burst-eligible, so the hand-off HOLDS
  // for the machine's own summary instead of releasing at once.
  await userEvent.click(screen.getByRole("button", { name: "End session" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Tap again to end" }),
  );
  await screen.findByText("Getting the monitor's own numbers.");
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetHandoffStore();
  fakeForTest = null;
  apiFn.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("§10 row 2 through the real destination seam: a producer update after release still reaches `commit`", () => {
  // REAL TIMERS ON PURPOSE, and the cost is stated rather than hidden:
  // this test waits out `BURST_HANDOFF_HOLD_MS` (2000 ms) on the wall
  // clock. `vi.useFakeTimers()` is not usable in this stack (React Testing
  // Library's `act` integration needs the real clock —
  // `useMonitorSession.test.ts`'s own harness records 19 failures under
  // it), and the alternative — injecting a manual schedule — is not
  // reachable here BY DESIGN: `WorkoutDetail` passes no `deps` to
  // `ConnectedInterstitial`, which is precisely what makes this a test of
  // the real composition. The backstop firing on its own real timer is the
  // production event; waiting for it is the honest way to observe it.
  it("the burst backstop releases, the REAL handleConnectedEnded replaces the connected surface with the REAL LogSession, and the machine's summary — arriving after all of it — still lands on the store, the durable tier, and the ring", async () => {
    const fake = makeFake();
    fakeForTest = fake;
    renderRoutes();
    await rowToBurstHold(fake);

    // The state at the moment of the hold, read through the store's own
    // public API — the baseline every "+1" below is measured against.
    const held = currentUnretired();
    expect(held).not.toBeNull();
    expect(held!.run.summaryTotals).toBeUndefined();
    const heldRevision = held!.revision;

    // ---------------------------------------------------------------
    // THE RELEASE — nothing but the machine's own silence causes it. The
    // burst never came inside `BURST_HANDOFF_HOLD_MS`, the backstop fires
    // on its own real timer, `ConnectedSurface`'s effect sees
    // `!handoffHeld` and calls `onEnded`, and `WorkoutDetail`'s REAL
    // `handleConnectedEnded` navigates. No test code participates.
    // ---------------------------------------------------------------
    await waitFor(
      () => {
        expect(
          screen.getByRole("heading", { name: WORKOUT.title }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Save without logging" }),
        ).toBeInTheDocument();
      },
      { timeout: BURST_HANDOFF_HOLD_MS + 3000 },
    );

    // WHAT THIS ASSERTION ACTUALLY ESTABLISHES, said exactly (PR #239
    // review rounds 4 and 5): the connected surface is gone (its End
    // button with it) and what replaced it is `LogSession`, NOT
    // `WorkoutDetail`'s own detail view — had `setConnecting(null)` been
    // able to run without the navigate beside it, the Connect button would
    // be back on screen here. That is a production observable and it is
    // the whole of the claim.
    //
    // It is NOT a claim about React commit timing. This behavioural route
    // test cannot observe the difference between a same-commit route
    // change and one a macrotask later (the reviewer proved it: wrapping
    // `navigate(...)` in `setTimeout(..., 0)` leaves this test green).
    // The one-commit premise the matrix reduction rests on is a
    // SOURCE-REVIEWED ASSUMPTION about two named handlers, and it is
    // gated separately by the source-shape pins at the bottom of this
    // file, which DO go red on that mutation.
    expect(
      screen.queryByRole("button", { name: "End session" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect" }),
    ).not.toBeInTheDocument();

    // The record reached the reader complete-as-of-release, and the
    // durable tier has it too (storage is healthy in this test — the
    // denied-storage composition is row 12's file).
    expect(screen.queryByText(/NO MONITOR READING/)).not.toBeInTheDocument();
    const atRelease = currentUnretired();
    expect(atRelease).not.toBeNull();
    expect(atRelease!.run.summaryTotals).toBeUndefined();
    expect(durableRun()?.summaryTotals).toBeUndefined();

    // WHAT THE ROWER IS LOOKING AT, captured at release time so the
    // post-burst comparison below has something independent to be
    // measured against (contract A's consumer half — see that block for
    // what it is for). Captured, never hard-coded: the point is that this
    // string does not MOVE, not what it happens to say.
    const shownAtRelease = screenText();
    expect(shownAtRelease).not.toBe("");
    // The machine's own figures are NOT on screen now, so "unchanged"
    // below is a real claim rather than a tautology about numbers that
    // were never going to appear. This run's record carries no boundary
    // actuals — a rower who presses End mid-interval, which is exactly
    // how this test got here — so `summaryModel.ts`'s tier B has no
    // measured distance to render, and `summaryTotals` landing on the
    // record is what would make a DISTANCE hero of 244 m appear.
    expect(shownAtRelease).not.toContain(String(LATE_SUMMARY.meters));
    expect(screen.queryByText("DISTANCE")).not.toBeInTheDocument();

    // ...and the departing hook really did hand its receipt channel back,
    // which is WHY this test asserts on the store and the stash instead of
    // on receipts. Asserted, not assumed: the ring stash `teardown` wrote
    // on its way out exists, so teardown genuinely ran.
    expect(rowedLogKinds()).toContain("handoff-released");

    // ---------------------------------------------------------------
    // THE LATE BURST — off the wire, with the rower already on the next
    // screen and the connected component gone. It arrives at all because
    // `teardown` deferred the unsubscribe for `BURST_LINGER_MS`.
    // ---------------------------------------------------------------
    await act(async () => {
      fake.deliverSummary(LATE_SUMMARY);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(currentUnretired()?.run.summaryTotals).toBeDefined();
    });

    // THE ROW: the commit landed. Revision advanced by exactly one — an
    // independent count, since this test makes exactly one further
    // producer write after the release, so `+1` is the test's own
    // arithmetic and not a number read back out of production.
    const afterBurst = currentUnretired();
    expect(afterBurst).not.toBeNull();
    expect(afterBurst!.revision).toBe(heldRevision + 1);
    expect(afterBurst!.run.summaryTotals).toStrictEqual({
      workElapsedSeconds: LATE_SUMMARY.elapsedSeconds,
      workDistanceMeters: LATE_SUMMARY.meters,
    });
    // Both tiers, not just memory: the durable bytes carry it too, read
    // straight back out of `localStorage` the way a reload would.
    expect(durableRun()?.summaryTotals).toStrictEqual({
      workElapsedSeconds: LATE_SUMMARY.elapsedSeconds,
      workDistanceMeters: LATE_SUMMARY.meters,
    });

    // And the production instrument saw it: the linger's own SECOND ring
    // stash re-wrote `ergomatic:last-rowed-log` after the burst was
    // recorded, so the fold-in is in the record a walk would read. This is
    // the receipt-shaped evidence, taken from the channel the app actually
    // has in this state rather than one installed for the test.
    await waitFor(() => {
      expect(rowedLogKinds()).toContain("summary-recorded");
    });

    // ---------------------------------------------------------------
    // A REAL POST-BURST INTERACTION — WITHOUT ONE, EVERYTHING BELOW IS
    // SATISFIED BY THE ABSENCE OF A RENDER (PR #239 review round 5,
    // reviewer finding 1).
    //
    // The reviewer mutated the snapshot away — `LogSession.tsx:1553`'s
    // lazy `useState<HandoffEntry | null>(() => monitorModeEntry(...))`
    // replaced by a plain `const monitorEntry = monitorModeEntry(...)`
    // re-read on every render — and this test stayed GREEN. Nothing above
    // rerenders `LogSession` after the burst (the store is not a React
    // store; the late commit reaches it without touching this tree), and
    // Save ran the closure built at the last render, which predated the
    // burst. So both claims below were being met by a screen that never
    // re-ran, not by the snapshot doing its job.
    //
    // A rower who has just arrived here does not sit still — the
    // reflection card sits directly under the heroes — and one tap on it
    // is a production rerender with no bearing on the record.
    //
    // The tap is the feel chip rather than a pain chip DELIBERATELY:
    // `screenText()` is the whole of `<main>`, and the pain row renders
    // its own caption (`PostWorkoutSummary.tsx`'s `painCaption`:
    // `TAP TO RATE` -> `EASIER THAN PLANNED`), so a pain tap moves that
    // string for a legitimate reason and the `toBe` equality below could
    // no longer be used. The feel chip changes only its own
    // `aria-pressed`. A pain tap follows immediately after, carrying the
    // narrower assertions its caption change still allows.
    // ---------------------------------------------------------------
    await userEvent.click(
      screen.getByRole("button", { name: "↑ MORE LIKE THIS" }),
    );

    // ---------------------------------------------------------------
    // "THE CONSUMER'S SNAPSHOT UNAFFECTED" — the half of §10 row 2 the
    // store assertions above do not touch, and the half the ratified
    // product contract is actually about: **renders snapshot; recording
    // actions post what was shown.**
    //
    // The reader is ALREADY MOUNTED, and has now re-rendered (the tap
    // above). Its record came from a `useState` lazy initializer
    // (`LogSession.tsx:1553` — `useState<HandoffEntry | null>(() =>
    // monitorModeEntry(searchParams, workoutId))`) that runs once and
    // never re-reads, so the commit that just advanced the store must not
    // advance the screen. `summaryModel.ts:919` makes the alternative
    // concrete: with `summaryTotals` present, its tier-A branch renders
    // the machine's own totals VERBATIM, so a re-reading consumer would
    // sprout a DISTANCE hero reading 244 m under a rower who had already
    // arrived on this screen.
    // ---------------------------------------------------------------
    expect(screenText()).toBe(shownAtRelease);
    expect(screen.queryByText("DISTANCE")).not.toBeInTheDocument();
    expect(
      screen.queryByText(String(LATE_SUMMARY.meters)),
    ).not.toBeInTheDocument();

    // A SECOND real rerender, this one the reviewer's own interaction,
    // held to the narrower claim its caption change allows: the machine's
    // figures are still not on this screen. The rower's own reflection
    // moves; the record's numbers do not.
    await userEvent.click(screen.getByRole("button", { name: "Pain 1" }));
    expect(screen.queryByText("DISTANCE")).not.toBeInTheDocument();
    expect(
      screen.queryByText(String(LATE_SUMMARY.meters)),
    ).not.toBeInTheDocument();

    // ...and the RECORDING ACTION posts what was shown. Save is where the
    // divergence would become PERMANENT: `LogSession.tsx`'s
    // `handleMonitorSave` builds its body from `monitorEntry.run` and
    // spreads the machine fields on when `summaryTotals !== undefined` —
    // which the store now satisfies and this screen's snapshot does not.
    await userEvent.click(
      screen.getByRole("button", { name: "Save without logging" }),
    );
    await waitFor(() => {
      expect(apiFn).toHaveBeenCalled();
    });
    const [path, init] = apiFn.mock.calls.at(-1)!;
    expect(path).toBe("/api/logs");
    const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
    // The three fields that spread would have added, all absent: the late
    // commit reached the store (asserted above) and stopped there.
    expect(body).not.toHaveProperty("machineWorkSeconds");
    expect(body).not.toHaveProperty("machineWorkMeters");
    expect(body).not.toHaveProperty("machineSummary");
    // THE POSITIVE HALF, so those three absences cannot be satisfied by
    // an empty, failed, or wrong-door POST: the body is this session's
    // own, carrying the snapshot's identity and its one measured sample.
    expect(body.workoutId).toBe(WORKOUT.id);
    expect(body.deviceName).toBe(DEVICE);
    expect(body.endedBy).toBe("rower");
    expect(body.series).toStrictEqual(atRelease!.run.series);
  }, 20000);

  // ---------------------------------------------------------------------
  // ORDERING (i) — A FRAME PLACED IN THE INTERVAL ITSELF (PR #239 review
  // round 6; ITS CLAIM NARROWED at round 8, reviewer finding 1).
  //
  // The interval is the one the header names: after `releaseHandoff`
  // commits `handoffHeld: false` and the surface has RENDERED that release,
  // and before `ConnectedSurface.tsx:352-358`'s passive effect fires
  // `onEnded` and `handleConnectedEnded` navigates.
  //
  // **WHAT THIS TEST PROVES, AND WHAT IT DOES NOT.** Rounds 6-7 read as
  // though a production wire frame had been shown to occupy the interval.
  // It has not been, and the difference is a scheduling fact:
  //   - **The gap is REAL** — React runs a passive effect after the commit
  //     that scheduled it, never inside it (PRIMARY: React's own
  //     documentation of `useEffect` timing). That half is not in doubt and
  //     never was.
  //   - **Production delivery is TASK-scheduled.** On web, a notification
  //     arrives as a `characteristicvaluechanged` event that the Web
  //     Bluetooth spec queues on the **Bluetooth task source** — a task, not
  //     a microtask (PRIMARY:
  //     https://webbluetoothcg.github.io/web-bluetooth/#dfn-bluetooth-task-source).
  //     On native it is a Capacitor plugin callback whose ordering relative
  //     to React's scheduler is UNEVIDENCED — we have no source that pins
  //     it. Two macrotask sources have no specified relative order, so
  //     whether a real frame lands inside this particular interval is
  //     PLAUSIBLE and UNDEMONSTRATED.
  //   - **This wedge is a MICROTASK invoking a synchronous fake**, so it
  //     lands in the gap by construction. It is therefore a DEFENSIVE
  //     SYNTHETIC ORDERING: it proves the app ACCEPTS a summary delivered
  //     there — acceptance-if-delivered — and not that a supported wire
  //     producer demonstrably occupies it.
  //
  // Deliberately NOT attempted: a gate on the task-source race itself.
  // Making one deterministic would mean manufacturing an ordering the
  // platform does not specify, which is the move the reviewer rejects.
  //
  // **The delivery's position IS asserted**, by `expectDeliveredInTheGap` —
  // production's own released-frame copy beside an unmounted consumer. What
  // that pins is where the wedge put the frame, not that the wire would.
  it("IN THE INTERVAL (synthetic ordering): a summary delivered after the release's own commit and BEFORE the passive effect that navigates is still ACCEPTED — `commit` on both tiers — and the consumer that mounts a beat later keeps its own snapshot", async () => {
    const fake = makeFake();
    fakeForTest = fake;
    renderRoutes();
    await rowToBurstHold(fake);

    const held = currentUnretired();
    expect(held).not.toBeNull();
    expect(held!.run.summaryTotals).toBeUndefined();
    const heldRevision = held!.revision;

    // 0x0039 ALONE, with no 0x003F behind it — which is why this test's
    // consumer mounts BEFORE the fold-in. `driver.ts`'s
    // `noteTerminateObservations` holds the observations emit for up to
    // `HASH_SUBWINDOW_MS` (200 ms) waiting for the verification byte, so
    // the fold lands well after the navigation this same release triggers.
    // The next test delivers BOTH halves and gets the other side.
    const wedge = wedgeIntoTheGap(() => {
      fake.deliverSummary(LATE_SUMMARY);
    });

    try {
      // Nothing below causes the release: the burst never came inside
      // `BURST_HANDOFF_HOLD_MS`, so the backstop fires on its own real
      // timer, the observer above delivers the summary in the gap, and the
      // real `handleConnectedEnded` navigates immediately after it.
      await waitFor(
        () => {
          expect(
            screen.getByRole("button", { name: "Save without logging" }),
          ).toBeInTheDocument();
        },
        { timeout: BURST_HANDOFF_HOLD_MS + 3000 },
      );
    } finally {
      wedge.disconnect();
    }

    // WHERE THE FRAME LANDED.
    expectDeliveredInTheGap(wedge.atDelivery);

    // WHAT THE CONSUMER MOUNTED WITH. Captured the moment the destination
    // is on screen, before the fold-in has drained — non-vacuity for the
    // "unchanged" claim below, exactly as the first test captures it at
    // release.
    const shownAtMount = screenText();
    expect(shownAtMount).not.toContain(String(LATE_SUMMARY.meters));
    expect(screen.queryByText("DISTANCE")).not.toBeInTheDocument();
    expect(rowedLogKinds()).toContain("handoff-released");

    // THE ROW: a frame delivered inside the interval still reaches
    // `commit`, on both tiers, with the same independent +1 arithmetic —
    // this test makes exactly one producer write after the hold.
    await waitFor(() => {
      expect(currentUnretired()?.run.summaryTotals).toBeDefined();
    });
    const afterBurst = currentUnretired();
    expect(afterBurst!.revision).toBe(heldRevision + 1);
    expect(afterBurst!.run.summaryTotals).toStrictEqual({
      workElapsedSeconds: LATE_SUMMARY.elapsedSeconds,
      workDistanceMeters: LATE_SUMMARY.meters,
    });
    expect(durableRun()?.summaryTotals).toStrictEqual({
      workElapsedSeconds: LATE_SUMMARY.elapsedSeconds,
      workDistanceMeters: LATE_SUMMARY.meters,
    });
    await waitFor(() => {
      expect(rowedLogKinds()).toContain("summary-recorded");
    });

    // THE CONSUMER'S HALF, with a real rerender first so the equality is
    // not satisfied by a screen that never re-ran (round 5's finding 1, the
    // same feel chip and the same reason it rather than a pain chip carries
    // the whole-screen equality).
    await userEvent.click(
      screen.getByRole("button", { name: "↑ MORE LIKE THIS" }),
    );
    expect(screenText()).toBe(shownAtMount);
    expect(screen.queryByText("DISTANCE")).not.toBeInTheDocument();
    expect(
      screen.queryByText(String(LATE_SUMMARY.meters)),
    ).not.toBeInTheDocument();
  }, 20000);

  // ---------------------------------------------------------------------
  // THE OTHER SIDE OF THE FOLD-IN, ON THE ORIGINAL NAVIGATION (PR #239
  // review round 8, reviewer finding 3).
  //
  // The test above delivers 0x0039 alone, so its consumer mounts BEFORE the
  // fold-in: `driver.ts`'s `noteTerminateObservations` holds the
  // observations emit for up to `HASH_SUBWINDOW_MS` (200 ms) waiting for the
  // verification byte, and the navigation this same release triggers happens
  // long before that. §10 row 2's other side — a consumer whose MOUNT reads
  // a store that already carries the machine's numbers — was previously
  // gated by unmounting and re-entering through a fresh router, which proves
  // re-entry equivalence and NOT the ordering the row claims.
  //
  // This test gates the claimed ordering directly, and the mechanism is
  // production's own: the machine sends 0x0039 and 0x003F as a PAIR, and
  // 0x003F's own subscriber (`driver.ts` call site 5) flushes the pending
  // terminate-observations emit the instant it lands. Deliver both halves in
  // the gap and the fold-in completes SYNCHRONOUSLY, before React's passive
  // effect runs — so the `LogSession` that the ORIGINAL
  // `handleConnectedEnded` navigation mounts is the one reading the folded
  // store. No unmount, no second render, no fresh router.
  //
  // The wedge carries the round-8 caveat its sibling does (see that header):
  // it places the PAIR in the gap by construction, which licenses
  // "acceptance-if-delivered", not "the wire lands here."
  //
  // Contract A ("renders snapshot; recording actions post what was shown")
  // is the claim on BOTH sides, and it is not trivially true here: the
  // screen now shows the machine's own numbers, so Save has to post THOSE.
  it("MOUNTING AFTER AN IN-GAP FOLD: the consumer the ORIGINAL navigation mounts shows the machine's numbers and saves exactly what it showed", async () => {
    const fake = makeFake();
    fakeForTest = fake;
    renderRoutes();
    await rowToBurstHold(fake);

    const held = currentUnretired();
    expect(held).not.toBeNull();
    expect(held!.run.summaryTotals).toBeUndefined();
    const heldRevision = held!.revision;

    /** Read INSIDE the gap, immediately after the pair is delivered and
     *  still ahead of the passive effect — the direct evidence that the
     *  fold-in preceded the navigation rather than merely preceding an
     *  assertion. */
    let foldedInsideTheGap: boolean | null = null;
    const wedge = wedgeIntoTheGap(() => {
      fake.deliverSummary(LATE_SUMMARY);
      // The pair's second half. Nothing about this is test-only plumbing:
      // it is the byte the machine sends next, through the same transport
      // seam, and it is what turns the driver's held emit into an
      // immediate one.
      fake.deliverVerification();
      foldedInsideTheGap =
        currentUnretired()?.run.summaryTotals !== undefined &&
        screen.queryByRole("button", { name: "Save without logging" }) === null;
    });

    try {
      await waitFor(
        () => {
          expect(
            screen.getByRole("button", { name: "Save without logging" }),
          ).toBeInTheDocument();
        },
        { timeout: BURST_HANDOFF_HOLD_MS + 3000 },
      );
    } finally {
      wedge.disconnect();
    }

    // WHERE THE PAIR LANDED — the same production-string position proof the
    // sibling test uses.
    expectDeliveredInTheGap(wedge.atDelivery);
    // ...AND THAT THE FOLD-IN BEAT THE NAVIGATION. Without this the test
    // below would be satisfied by a fold that merely happened before the
    // ASSERTION, which is the weaker claim round 7 was making.
    expect(foldedInsideTheGap).toBe(true);

    // The connected surface really is gone and the REAL `LogSession`
    // replaced it — this is the original navigation, not a re-render of the
    // detail view with its Connect button back.
    expect(
      screen.queryByRole("button", { name: "End session" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect" }),
    ).not.toBeInTheDocument();

    // The commit itself, with the same independent +1 arithmetic: this test
    // makes exactly one producer write after the hold.
    const afterBurst = currentUnretired();
    expect(afterBurst!.revision).toBe(heldRevision + 1);
    expect(afterBurst!.run.summaryTotals).toStrictEqual({
      workElapsedSeconds: LATE_SUMMARY.elapsedSeconds,
      workDistanceMeters: LATE_SUMMARY.meters,
    });
    expect(durableRun()?.summaryTotals).toStrictEqual({
      workElapsedSeconds: LATE_SUMMARY.elapsedSeconds,
      workDistanceMeters: LATE_SUMMARY.meters,
    });

    // WHAT IT SHOWS: the machine's own totals, `summaryModel.ts`'s tier-A
    // branch rendering `summaryTotals` verbatim — on the screen the rower
    // arrived at, never a second one.
    expect(screen.getByText("DISTANCE")).toBeInTheDocument();
    expect(screen.getByText(String(LATE_SUMMARY.meters))).toBeInTheDocument();
    expect(screen.queryByText(/NO MONITOR READING/)).not.toBeInTheDocument();

    // ...AND WHAT IT SAVES: the same numbers. The three machine fields the
    // first test asserts ABSENT (its consumer never saw them) are present
    // here, carrying the shown values, with the identity fields as the
    // positive half so this cannot be satisfied by some other POST.
    await userEvent.click(
      screen.getByRole("button", { name: "Save without logging" }),
    );
    await waitFor(() => {
      expect(apiFn).toHaveBeenCalled();
    });
    const [path, init] = apiFn.mock.calls.at(-1)!;
    expect(path).toBe("/api/logs");
    const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
    expect(body.machineWorkMeters).toBe(LATE_SUMMARY.meters);
    expect(body.machineWorkSeconds).toBe(LATE_SUMMARY.elapsedSeconds);
    expect(body.machineSummary).toBeDefined();
    expect(body.workoutId).toBe(WORKOUT.id);
    expect(body.deviceName).toBe(DEVICE);
  }, 20000);

  // ---------------------------------------------------------------------
  // RE-ENTRY EQUIVALENCE (PR #239 review round 6; RE-SCOPED at round 8,
  // reviewer finding 3 — this used to carry §10 row 2's mount-after-fold-in
  // claim, which it does not establish).
  //
  // What this drives is an unmount and a fresh entry through a new router:
  // the rower's ordinary case on a RE-ENTRY or a RELOAD, where the store is
  // already folded and the door opens cold. That is worth its own gate —
  // `LogSession.tsx`'s once-only `useState` initializer is the whole of the
  // difference between the two sides, and a re-entering reader must read
  // the same numbers the original navigation's reader would — but it is
  // equivalence, not ordering. The ordering itself is the test above.
  it("RE-ENTRY: a consumer entering cold on an already-folded store shows the machine's numbers and saves exactly what it showed", async () => {
    const fake = makeFake();
    fakeForTest = fake;
    const first = renderRoutes();
    await rowToBurstHold(fake);
    await waitFor(
      () => {
        expect(
          screen.getByRole("button", { name: "Save without logging" }),
        ).toBeInTheDocument();
      },
      { timeout: BURST_HANDOFF_HOLD_MS + 3000 },
    );
    await act(async () => {
      fake.deliverSummary(LATE_SUMMARY);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(currentUnretired()?.run.summaryTotals).toBeDefined();
    });

    // The door opens AFTER the fold-in. The first tree goes first so the
    // fresh mount is the only consumer on screen.
    first.unmount();
    apiFn.mockClear();
    render(
      <MemoryRouter
        initialEntries={[`/library/${WORKOUT.id}/log?from=monitor`]}
      >
        <Routes>
          <Route path="/library/:id/log" element={<LogSession />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Save without logging" });

    // WHAT IT SHOWS: the machine's own totals, `summaryModel.ts`'s tier-A
    // branch rendering `summaryTotals` verbatim.
    expect(screen.getByText("DISTANCE")).toBeInTheDocument();
    expect(screen.getByText(String(LATE_SUMMARY.meters))).toBeInTheDocument();
    expect(screen.queryByText(/NO MONITOR READING/)).not.toBeInTheDocument();

    // ...AND WHAT IT SAVES: the same numbers. The three machine fields the
    // first test asserts ABSENT (its consumer never saw them) are present
    // here, carrying the shown values, with the identity fields as the
    // positive half so this cannot be satisfied by some other POST.
    await userEvent.click(
      screen.getByRole("button", { name: "Save without logging" }),
    );
    await waitFor(() => {
      expect(apiFn).toHaveBeenCalled();
    });
    const [path, init] = apiFn.mock.calls.at(-1)!;
    expect(path).toBe("/api/logs");
    const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
    expect(body.machineWorkMeters).toBe(LATE_SUMMARY.meters);
    expect(body.machineWorkSeconds).toBe(LATE_SUMMARY.elapsedSeconds);
    expect(body.machineSummary).toBeDefined();
    expect(body.workoutId).toBe(WORKOUT.id);
    expect(body.deviceName).toBe(DEVICE);
  }, 20000);

  // ---------------------------------------------------------------------
  // THE REDUCTION'S PREMISE, PINNED AS WHAT IT ACTUALLY IS (PR #239 review
  // round 4, reviewer finding 2).
  //
  // The reviewer wrapped `navigate(...)` in `setTimeout(..., 0)` inside
  // `handleConnectedEnded` and the behavioural test above STILL PASSED —
  // correctly, because `waitFor` does not care whether the route change
  // landed in the release's own commit or one macrotask later. So this
  // file's matrix reduction rests on a claim its own behavioural gate
  // cannot fail on, and the header now says so. These two tests are the
  // honest complement: a gate that DOES go red on that mutation.
  //
  // WHAT THIS IS AND IS NOT: a TEXT pin on the shape of two named
  // handlers, not a scheduler claim and not a behavioural observation. It
  // cannot see a deferral introduced through a helper it does not read.
  // What it does catch is a deferral written into either handler — the
  // move that would make the after-teardown/before-navigation cell
  // reachable again and silently invalidate the reduction.
  //
  // **AND WHAT IT NEVER CLAIMED (PR #239 review round 6, restated at round
  // 8).** These pins exclude ADDITIONAL deferral inside the handler and the
  // effect. They do NOT close React's own passive-effect boundary between
  // the release's commit and the `onEnded` call — nothing text-shaped
  // could. That gap is real, and the tests above gate the app's BEHAVIOUR
  // when something lands in it, on a synthetic ordering. Whether a real
  // wire frame lands there is unsettled and is not asserted anywhere in
  // this file (see the second test's header for the scheduling facts).
  describe("the reduction's premise, pinned at the source it was reviewed at", () => {
    const readSource = (rel: string): string =>
      readFileSync(join(import.meta.dirname, rel), "utf8");

    /** The body of a named handler, by brace matching from its
     *  declaration — so a RENAME throws here (loudly, with the reason)
     *  rather than silently pinning an empty string. */
    function handlerBody(source: string, declaration: string): string {
      const start = source.indexOf(declaration);
      if (start === -1) {
        throw new Error(
          `handler not found: \`${declaration}\` — renamed or reshaped, so this pin's premise needs re-reviewing at the source before the reduction can stand`,
        );
      }
      let depth = 0;
      for (let i = source.indexOf("{", start); i < source.length; i += 1) {
        if (source[i] === "{") depth += 1;
        else if (source[i] === "}") {
          depth -= 1;
          if (depth === 0) return source.slice(start, i + 1);
        }
      }
      throw new Error(`unbalanced braces reading \`${declaration}\``);
    }

    /** `//` line comments only — the crude stripper this repo's other
     *  source-shape gate already uses. Enough here: neither handler body
     *  contains a block comment or a string with a `//` in it, and the
     *  statement-count pin below would notice if one appeared. */
    const stripLineComments = (s: string): string => s.replace(/\/\/.*$/gm, "");

    const DEFERRAL =
      /setTimeout|setInterval|queueMicrotask|requestAnimationFrame|\bawait\b|\.then\s*\(|Promise\./;

    it("`handleConnectedEnded` releases and navigates in ONE synchronous statement block — nothing defers either half", () => {
      const body = stripLineComments(
        handlerBody(
          readSource("./WorkoutDetail.tsx"),
          "function handleConnectedEnded()",
        ),
      );
      // Both statements present, release first.
      const release = body.indexOf("setConnecting(null)");
      const navigate = body.indexOf("navigate(");
      expect(release).toBeGreaterThan(-1);
      expect(navigate).toBeGreaterThan(release);
      // And nothing defers them. THIS is the assertion the reviewer's
      // `setTimeout(() => navigate(...), 0)` mutation trips.
      expect(body).not.toMatch(DEFERRAL);
      // The handler is exactly those two statements — no third has
      // quietly appeared between them, deferring or not.
      const statements = body
        .slice(body.indexOf("{") + 1, body.lastIndexOf("}"))
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      expect(statements).toHaveLength(2);
    });

    it("`ConnectedSurface`'s ended effect calls `onEnded` with no deferral OF ITS OWN — React's passive-effect boundary is the only hop left between the release and the navigation", () => {
      const source = readSource("./ConnectedSurface.tsx");
      // Located by the guard clause that is the effect's first statement,
      // so a change to the guard's own inputs fails here too.
      const marker = 'if (session.phase !== "ended" || session.handoffHeld';
      const at = source.indexOf(marker);
      expect(at).toBeGreaterThan(-1);
      const effect = stripLineComments(handlerBody(source, marker));
      // The call is in the effect body, and nothing between the guard and
      // it defers the call.
      const onEnded = source.indexOf("onEnded();", at);
      expect(onEnded).toBeGreaterThan(-1);
      expect(stripLineComments(source.slice(at, onEnded))).not.toMatch(
        DEFERRAL,
      );
      // The guard is a bare early return, not a deferral of its own.
      expect(effect).not.toMatch(DEFERRAL);
    });
  });
});
