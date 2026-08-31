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
// three of the four cells are not rower-reachable:
//
//  - **Navigation and teardown are ONE React commit, not two axes.**
//    `WorkoutDetail.tsx`'s `handleConnectedEnded` (the ONLY door out of a
//    finished connected session) runs `setConnecting(null)` and
//    `navigate(`/library/${workout.id}/log?from=monitor`)` in a single
//    handler, so the interstitial subtree is dropped in the same commit
//    that changes the URL. There is no "teardown, then navigation": the
//    navigation IS what tears the surface down. **That kills the
//    after-teardown/before-navigation cell outright**, and it is pinned
//    below by production observables — the moment the connected surface is
//    gone, the screen is `LogSession`, never `WorkoutDetail`'s own detail
//    view with its Connect button back.
//
//  - **The release IS the navigation.** `ConnectedSurface.tsx:352-358`
//    fires `onEnded` from an effect the instant
//    `phase === "ended" && !session.handoffHeld`, guarded once by
//    `endedRef`. No rower tap sits between the release and the route
//    change, so "after release, before navigation" is not an interval a
//    rower or a wire frame can occupy — it is the gap inside React's own
//    flush between the release's commit and the passive effect that
//    navigates. Pinned below as well: nothing but the backstop firing
//    happens in this test, and the real `LogSession` is what comes back.
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
// What is left is ONE reachable cell, and it is the row's own headline
// case (§1: "the late burst"; §9.1: "the window is bounded by the
// producer's subscription life"): the hold times out on its own backstop,
// the release navigates and tears the surface down in one commit, and the
// machine's summary arrives on the wire AFTERWARDS, inside
// `BURST_LINGER_MS`. That is the cell this file drives, end to end, with
// no seam touched but the transport.
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
  it("the burst backstop releases, the REAL handleConnectedEnded navigates to the REAL LogSession and tears the surface down in the same commit, and the machine's summary — arriving after all of it — still lands on the store, the durable tier, and the ring", async () => {
    const program = programFor(WORKOUT, BASELINES);
    const fake = createFakeTransport({
      program,
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
    fakeForTest = fake;

    render(
      <MemoryRouter initialEntries={[`/library/${WORKOUT.id}`]}>
        <Routes>
          <Route path="/library/:id" element={<WorkoutDetail />} />
          <Route path="/library/:id/log" element={<LogSession />} />
          <Route path="/today" element={<p>TODAY SCREEN</p>} />
        </Routes>
      </MemoryRouter>,
    );

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

    // NAVIGATION AND TEARDOWN ARE ONE COMMIT — the after-teardown/
    // before-navigation cell, killed by observation rather than by
    // assertion. The connected surface is gone (its End button with it),
    // and what replaced it is `LogSession`, NOT `WorkoutDetail`'s own
    // detail view. Had `setConnecting(null)` been able to run without the
    // navigate beside it, the Connect button would be back on screen here
    // — that is the discriminator, and it is a production observable.
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
  }, 20000);
});
