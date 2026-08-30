// James's PR #230 review, P2a (Important): the real recovery COMPOSITION
// was untested. `summaryHoldReplay.test.ts`'s AUD-016 legs call
// `proceedHandoff()` directly on the bare hook and mount `LogSession` at a
// hard-coded `?from=monitor` URL — proving the hook and the reader each
// work in isolation, never that the PRODUCT ROUTE between them (a rower
// pressing a real button, `WorkoutDetail.tsx`'s own `handleConnectedEnded`
// navigating) actually connects them. This is the same composition gap
// that let P1a's READY stale-slot case escape the dedicated C1 test: that
// test also calls `createMonitorRun()` directly rather than driving a
// connected session through its own real lifecycle.
//
// This file drives the REAL stack: a real `WorkoutDetail` renders a real
// `ConnectedInterstitial` over a real `useMonitorSession` over a fake
// (CSAFE-correct) transport (`../adapters/monitorTransport`'s
// `defaultTransport` is the one seam mocked, so the hook's own default
// wiring — never a `deps` override — is what runs), through a real row, a
// real End press, a denied write entering held-error, a real "Log it
// anyway" press, the REAL `handleConnectedEnded` navigation, and a real
// `LogSession` mount that must find the machine's own data in the slot.
//
// The mutation this test exists to catch (RF22, proven in this task's own
// report rather than left as a second assertion in this file): removing
// `?from=monitor` from `WorkoutDetail.tsx`'s `handleConnectedEnded` makes
// every OTHER test in the suite (including `summaryHoldReplay.test.ts`'s
// own legs, which never navigate through that function at all) stay
// green while a real rower would land on the manual door with the
// connected session's numbers gone. Only a test that runs the real
// `navigate` call can see that.

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
import { MONITOR_RUN_KEY } from "../monitor/monitorRun";
import { createFakeTransport } from "../monitor/transports/fake";
import type { FakeControls } from "../monitor/transports/fake";
import WorkoutDetail from "./WorkoutDetail";
import LogSession from "../session/LogSession";

// A single effort-only work step (no baselines question in play at all,
// so this test's own subject — the recovery composition — is never
// entangled with target resolution). Distance, not time: the fake's own
// scripted status event (below) drives `distanceMeters` directly, which
// is what `useMonitorSession.ts`'s own rowing-detection gate reads.
const WORKOUT: LibraryWorkout = {
  id: "w-p2a-recovery",
  title: "P2a Recovery Row",
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
const DEVICE = "PM5 998877 Row";

/** The SAME `buildDraft -> buildRun -> compileProgram` pipeline
 *  `WorkoutDetail.tsx`'s own `handleConnectProceed` runs (that function's
 *  own comment) — reproduced here so `createFakeTransport`'s own
 *  structural-byte assertion (`FakeScript.program`'s doc comment: "a test
 *  that calls `driver.program(p)` with a DIFFERENT `p` ... fails loudly")
 *  has a program that genuinely matches what the real Connect flow will
 *  send. `now` never reaches `WorkoutProgram`'s own shape (`intervals`
 *  only — no timestamp field), so using a different `Date` than
 *  `handleConnectProceed`'s own `new Date()` cannot cause a mismatch. */
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
// `ConnectedSurface` reads this hook directly (`WorkoutDetail.test.tsx`'s
// own `mockHooks` comment: WU removed WorkoutDetail's own reason to read
// it, but the connected surface a Connect flow renders still does).
vi.mock("../api/usePreferences", () => ({
  usePreferences: () => ({
    state: "ready",
    preferences: { difficulties: [], timeCapMinutes: 60, countdownSeconds: 10 },
  }),
}));
// LogSession's own dependency, mocked to the same "no active plan" shape
// `LogSession.test.tsx`'s own default `mockPlan()` uses — this test's
// subject is the connected recovery route, not plan bookkeeping.
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
    new Response(JSON.stringify({ id: "log-p2a-recovery" }), { status: 201 }),
  ),
);
vi.mock("../api", () => ({
  api: (path: string, init?: RequestInit) => apiFn(path, init),
}));

// The one adapter seam: `useMonitorSession`'s own default `createTransport`
// resolves through `defaultTransport` (`../adapters/monitorTransport`)
// when a caller (here, `WorkoutDetail.tsx`, which never passes `deps` to
// `ConnectedInterstitial`) supplies none. Mocking this ONE function, not
// `ConnectedInterstitial`'s props, is what keeps `WorkoutDetail.tsx`'s own
// `handleConnectedEnded` — the function this whole test exists to exercise
// — completely real.
let fakeForTest: (Transport & FakeControls) | null = null;
vi.mock("../adapters/monitorTransport", () => ({
  defaultTransport: () => fakeForTest,
}));

function parsedBodies(fn: typeof apiFn): Record<string, unknown>[] {
  return fn.mock.calls.map(([, init]) =>
    JSON.parse((init as RequestInit).body as string),
  );
}

beforeEach(() => {
  localStorage.clear();
  fakeForTest = null;
  apiFn.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WorkoutDetail -> real connected recovery -> LogSession (James's PR #230 review, P2a)", () => {
  it("a held-error 'Log it anyway' press navigates through the REAL handleConnectedEnded into a slot-served Log screen that POSTs the connected session", async () => {
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

    // Denied from before the session even opens (leg A's own shape,
    // `summaryHoldReplay.test.ts`) — every write this recovery relies on
    // must come from the SLOT, never storage, or this test would not be
    // able to tell "the composition works" from "storage happened to
    // still hold something."
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (this === localStorage && key === MONITOR_RUN_KEY) {
        throw new DOMException(
          "The quota has been exceeded.",
          "QuotaExceededError",
        );
      }
    });

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

    // Pump the fake's ack-gated programming exchange — chunk-by-chunk
    // microtask hops, never timed (`ConnectedSurface.test.tsx`'s own
    // fake-driven walk, identical loop).
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
    // Delivers the scripted rowing frame (atMs: 100) — real flywheel
    // evidence, so `useMonitorSession.ts`'s own rowing-detection gate
    // opens the record via `createMonitorRun` (whose own write is already
    // denied and ignored, per the AUD-015/016 pattern — `runRef.current`
    // is set from the return value regardless).
    await act(async () => {
      fake.tick(200);
      await Promise.resolve();
    });
    await screen.findByRole("navigation", { name: "Connected panes" });

    // A real, link-up, rower-initiated End — burst-eligible (unlike the
    // link-lost shape every OTHER held-error test in this codebase uses),
    // so the hold waits for the machine's own summary rather than
    // resolving the verify synchronously inside `endSession` itself.
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to end" }),
    );
    await screen.findByText("Getting the monitor's own numbers.");

    // The machine's own end-of-workout summary (0x0039), delivered on
    // demand — `FakeControls.deliverSummary`'s own doc comment: "the 20
    // real bytes a PM5 sends after a natural finish." This resolves the
    // burst hold; the release-verify it triggers is denied, entering
    // held-error with the ONLY machine numbers this run will ever get
    // folded into memory (spec §1 step 4).
    await act(async () => {
      fake.deliverSummary({ elapsedSeconds: 42, meters: 210 });
    });

    await screen.findByText("COULD NOT KEEP THE RECORD ON THIS PHONE.");
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();

    // THE BUTTON PRESS THIS TEST EXISTS FOR: `proceedHandoff()` stashes
    // the in-memory run (machine numbers included) into the slot and
    // releases, which is what fires `onEnded` -> the REAL
    // `handleConnectedEnded` -> `navigate("/library/:id/log?from=monitor")`.
    await userEvent.click(
      screen.getByRole("button", { name: "Log it anyway" }),
    );

    // The REAL LogSession, reached through the REAL navigation, serving
    // the slot (storage is still empty — asserted again below).
    await screen.findByRole("heading", { name: WORKOUT.title });
    expect(screen.queryByText(/NO MONITOR READING/)).not.toBeInTheDocument();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "HELD" }));
    await userEvent.click(screen.getByRole("button", { name: "Pain 2" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Save without logging" }),
    );

    await waitFor(() => expect(apiFn).toHaveBeenCalled());
    const body = parsedBodies(apiFn)[0]!;
    // THE MACHINE FIELDS (P2a's own wording): the real PM5 device name
    // threaded from the fake transport through `createMonitorRun` -> the
    // slot -> the POST — present only on the connected path (the manual
    // door never sets this field at all) — and the real machine-summary
    // totals `deliverSummary` put on the wire, folded in memory because
    // storage never held them.
    expect(body.deviceName).toBe(DEVICE);
    expect(body.machineWorkSeconds).toBe(42);
    expect(body.machineWorkMeters).toBe(210);
  });
});
