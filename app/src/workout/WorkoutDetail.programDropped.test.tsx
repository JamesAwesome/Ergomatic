// Wave F PR 1, Task 5 (design spec 2026-08-31-lifecycle-design.md §1, "Test
// obligation — recurring failure 24"): the COMPOSITION drive-through for the
// live program drop. `WorkoutDetail.connectedRecovery.test.tsx` (James's PR
// #230 review, P2a) is the proven model — this file drives the SAME real
// stack: a real `WorkoutDetail` renders a real `ConnectedInterstitial` over a
// real `useMonitorSession` over a fake (CSAFE-correct) transport
// (`../adapters/monitorTransport`'s `defaultTransport` is one of the two
// seams mocked, so the hook's own default wiring is what runs), through a
// real row, one completed interval, the REAL `handleConnectedEnded`
// navigation, and a real `LogSession` mount that must find the machine's own
// data.
//
// Task 3's `liveDropSeamReplay.test.ts` already carries the honestly-scoped
// claim that the WIRE-to-DRIVER seam works: a committed capture plus
// constructed wrong-armed-structure frames drive `driver.ts`'s own
// armed-watch comparator to emit `programDropped` for real. THIS file's job
// is different — the spec's own words: "the composed route (hook → surfaces
// → navigation → log door)" — and re-driving the wire-level detector here
// would only re-prove Task 3's own claim, not exercise anything new.
//
// **THE SECOND SEAM MOCKED, AND WHY (spec §1's own sanctioned shortcut, task
// brief: "delivering the event at the hook seam is acceptable for THIS
// composition test... the driver seam is already gated by Task 3").**
// `WorkoutDetail.tsx` never threads `ConnectedInterstitial`'s `deps` prop in
// production (that component's own header comment states why), so there is
// no route from this file down to `driver.ts`'s own `DriverOptions.now`/
// `schedule` — the only way to hold three constructed wrong-armed ticks
// `STRUCTURE_MISMATCH_WINDOW_MS` (2000ms) apart without a real multi-second
// wall-clock wait in every CI run. Rather than accept that wait (or thread a
// clock override this composed harness has no seam for), `../monitor/driver`
// is mocked to WRAP the real `createPm5Driver`: every method it returns
// (`program`, `connect`, `disconnect`, `terminate`, `exportLog`, …) is the
// REAL implementation, delegated unchanged — the wrap only intercepts the
// single `events(cb)` registration `useMonitorSession.ts`'s `connect()` makes
// (`unsubscribeRef.current = driver.events((event) => handleEvent(event,
// driver))`), capturing `cb` so this file can call it directly with
// `{ kind: "programDropped" }` — the EXACT event shape RC-37's own detector
// emits (`domain/monitor/types.ts`'s `MonitorEvent` union: "No payload").
// This is "the hook seam" in the most literal sense available: the boundary
// where the driver's own event stream hands off to the hook's own listener.
// Everything upstream of that hand-off (pairing, programming, the ack-gated
// exchange, the rowing-detection gate that opens the record, the boundary
// that completes interval 0) is the REAL fake-driven driver, unchanged;
// everything downstream (the hook's own `event.kind === "programDropped"`
// live-arm handler, `closeRecord`, the published `closeReason`, the ended
// frame, `onEnded`, the real `navigate`, the real `LogSession`) is exactly
// what a genuine session runs.

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../domain/monitor/program.js";
import { WORKOUTSTATE_INTERVALWORKTIME } from "../../domain/monitor/pm5/parse.js";
import type { MonitorEvent } from "../../domain/monitor/types.js";
import type { Transport } from "../../domain/monitor/types.js";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import type { LibraryWorkout } from "../api/useWorkouts";
import type { api } from "../api";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import { MONITOR_RUN_KEY } from "../monitor/monitorRun";
import {
  createFakeTransport,
  type FakeTimelineEvent,
} from "../monitor/transports/fake";
import type { FakeControls } from "../monitor/transports/fake";
import WorkoutDetail from "./WorkoutDetail";
import LogSession from "../session/LogSession";

// A two-interval distance workout (250m, 250m, no rest step between — the
// same "consecutive work phases with no rest between them" shape
// `compileProgram`'s own loop treats as two separate intervals, each with
// `restSeconds: 0`, per its own per-phase `intervals.push` — see that
// function's own body: only a `type: "rest"` phase folds into the PREVIOUS
// interval; two work phases in a row always produce two). This is what lets
// the test complete interval 0 via a real boundary and stay LIVE, mid
// interval 1, at the moment the drop lands — the exact precondition the
// spec's own test obligation names ("a live phase carrying one completed
// interval actual").
const WORKOUT: LibraryWorkout = {
  id: "w-t5-livedrop-composition",
  title: "T5 Live Drop Composition",
  type: "O2",
  difficulty: "easy",
  pain: 2,
  steps: [
    {
      k: "w",
      duration: { kind: "distance", meters: 250 },
      ref: { effort: "min" },
    },
    {
      k: "w",
      duration: { kind: "distance", meters: 250 },
      ref: { effort: "min" },
    },
  ],
  isGlobal: true,
  lastDoneDaysAgo: null,
};

const BASELINES: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const DEVICE = "PM5 998877 Row";

/** The SAME `buildDraft -> buildRun -> compileProgram` pipeline
 *  `WorkoutDetail.tsx`'s own `handleConnectProceed` runs — copied from
 *  `WorkoutDetail.connectedRecovery.test.tsx`'s own identically-named,
 *  identically-reasoned helper (not imported: this project's per-file
 *  fixture convention). */
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
  const run = buildRun(draft, baselines, new Date("2026-08-31T12:00:00.000Z"));
  const compiled = compileProgram(run.phases);
  if ("code" in compiled) {
    throw new Error(`fixture failed to compile: ${compiled.code}`);
  }
  return compiled;
}

/** interval 0's real boundary, then a real status tick mid interval 1 — one
 *  completed interval actual (65s/250m, well past
 *  `MIN_MEASURABLE_ELAPSED_SECONDS`, `summaryModel.ts`'s own
 *  `isMeasuredReading`), live, unfinished, the precondition every assertion
 *  below rests on. The two STATUS ticks' own `elapsedSeconds`/
 *  `distanceMeters` are PER-INTERVAL on the wire — 0x0031's own top-level
 *  pair (`fake.ts`'s `updateSessionAvgSplit` doc comment: "PER-INTERVAL on
 *  the wire, not session-cumulative", citing `pm5/parse.ts`'s
 *  `toMonitorFrame` doc and `connectedMetricsReplay.test.ts`), never
 *  session-cumulative. Only the BOUNDARY event's own, SEPARATE
 *  `cumulativeElapsedSeconds`/`cumulativeDistanceMeters` pair genuinely
 *  accumulates (`FakeBoundaryEvent`'s own doc comment): 20s/70m mid
 *  interval 0 (identical to the session total there, since interval 0 is
 *  the session's first), the boundary's own actual and cumulative pair
 *  both at 65s/250m (same reason), then 10s/10m into interval 1 — a fresh
 *  per-interval count, not a continuation of the session's 65s/250m. */
function timeline(): FakeTimelineEvent[] {
  return [
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
    {
      atMs: 200,
      kind: "boundary",
      actual: {
        index: 0,
        elapsedSeconds: 65,
        distanceMeters: 250,
        avgSpm: 22,
        avgHeartRateBpm: 165,
        restDistanceMeters: 0,
      },
      cumulativeElapsedSeconds: 65,
      cumulativeDistanceMeters: 250,
    },
    {
      atMs: 300,
      kind: "status",
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      elapsedSeconds: 10,
      distanceMeters: 10,
      spm: 22,
      currentSplit: 118,
      heartRateBpm: 166,
      programIntervalIndex: 1,
    },
  ];
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
    new Response(JSON.stringify({ id: "log-t5-livedrop" }), { status: 201 }),
  ),
);
vi.mock("../api", () => ({
  api: (path: string, init?: RequestInit) => apiFn(path, init),
}));

let fakeForTest: (Transport & FakeControls) | null = null;
vi.mock("../adapters/monitorTransport", () => ({
  defaultTransport: () => fakeForTest,
}));

/** THE HOOK SEAM (this file's own header). Captures the listener
 *  `useMonitorSession.ts`'s `connect()` registers on the REAL driver
 *  (`unsubscribeRef.current = driver.events((event) => handleEvent(event,
 *  driver))`), so this file can hand it a `programDropped` event directly —
 *  the exact `MonitorEvent` shape RC-37's own detector emits, with none of
 *  its own upstream wire-level machinery re-driven (that is Task 3's own,
 *  already-honestly-scoped claim). Every other method on the returned
 *  driver is the REAL `createPm5Driver` implementation, spread through
 *  unchanged — this wrap changes nothing about pairing, programming, or the
 *  fake-driven rowing/boundary timeline above. */
let capturedDriverEventCb: ((e: MonitorEvent) => void) | null = null;
vi.mock("../monitor/driver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../monitor/driver")>();
  return {
    ...actual,
    createPm5Driver: (
      ...args: Parameters<typeof actual.createPm5Driver>
    ): ReturnType<typeof actual.createPm5Driver> => {
      const real = actual.createPm5Driver(...args);
      return {
        ...real,
        events(cb: (e: MonitorEvent) => void) {
          capturedDriverEventCb = cb;
          return real.events(cb);
        },
      };
    },
  };
});

beforeEach(() => {
  localStorage.clear();
  fakeForTest = null;
  capturedDriverEventCb = null;
  apiFn.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Connect through the real ack-gated programming exchange, request the
 *  numbers, and drive the timeline to a live phase with interval 0's own
 *  boundary already folded in — the identical pump loop
 *  `WorkoutDetail.connectedRecovery.test.tsx` uses (chunk-by-chunk microtask
 *  hops, never timed — that file's own comment: "identical fake-driven
 *  walk"). Returns the fake so a test can keep driving it if it needs to. */
async function connectToLiveWithOneCompletedInterval() {
  const program = programFor(WORKOUT, BASELINES);
  const fake = createFakeTransport({
    program,
    deviceName: DEVICE,
    events: timeline(),
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

  // One tick delivers the whole scripted timeline in order: the mid-work
  // status that opens the rowing-detection gate (real `createMonitorRun`),
  // the real boundary that completes interval 0, and the status that
  // carries the session into interval 1 — still live.
  await act(async () => {
    fake.tick(400);
    await Promise.resolve();
  });
  await screen.findByRole("navigation", { name: "Connected panes" });

  return fake;
}

describe("WorkoutDetail -> real live program drop -> LogSession (Wave F PR 1 Task 5, spec 2026-08-31-lifecycle-design.md §1)", () => {
  it("the drop copy renders on the real ended frame before navigation, then the REAL handleConnectedEnded navigates to the REAL log door, which renders the strip AND the row", async () => {
    await connectToLiveWithOneCompletedInterval();
    expect(capturedDriverEventCb).not.toBeNull();

    // THE DROP. Delivered at the hook seam (this file's own header) — the
    // real live-arm handler (`useMonitorSession.ts`'s `event.kind ===
    // "programDropped"` branch, phase === "live") runs for real: closes the
    // record (`closeRecord(true, "program-dropped")`), and publishes
    // `closeReason: "program-dropped"` in the SAME patch that flips
    // `phase: "ended"` — no frame can render "ended" without it.
    //
    // CONTROLLER AMENDMENT (Task 4 review ruling, 2026-08-31), ASSERTION 6
    // — CAPTURED VIA A `MutationObserver`, not a bare DOM read (self-found,
    // this task). `ConnectedSurface.tsx`'s own `useEffect` that calls
    // `onEnded()` is a PASSIVE effect, and React 18's `act()` flushes a
    // render commit, its passive effects, AND whatever cascading update
    // those effects trigger (here, the router's own state update from the
    // real `navigate()` call) as one atomic unit with no seam observable
    // from outside — proven empirically in this task: a bare unwrapped call
    // (no `act()`) leaves the render entirely un-committed, a DOM read taken
    // INSIDE the `act()` callback body still shows the pre-drop live pane,
    // and only AFTER `act()` returns is the DOM already past `LogSession`.
    // A `MutationObserver` sidesteps this: its internal record QUEUE is
    // appended to SYNCHRONOUSLY as each DOM mutation happens (only the
    // CALLBACK's own firing is deferred to a microtask), so the synchronous
    // `takeRecords()` below recovers every mutation batch the single
    // `act()` flush produced — including the ended frame's own commit that
    // a LATER mutation (the navigate-away render) has since painted over.
    const observer = new MutationObserver(() => undefined);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    act(() => {
      capturedDriverEventCb!({ kind: "programDropped" });
    });
    const records = observer.takeRecords();
    observer.disconnect();

    // The read loop below scans only each record's `addedNodes` — if
    // `ConnectedSurface`'s ended frame ever reconciles the body line's text
    // IN PLACE instead of adding a new node, this assertion fails LOUD
    // (null vs a string) rather than silently passing, which is the safe
    // direction, but whoever sees that failure should know the read loop is
    // why.
    let dropBodyLineText: string | null = null;
    let sawSessionEnded = false;
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (!(node instanceof Element)) continue;
        const bodyLine = node.matches(".connected-body-line")
          ? node
          : node.querySelector(".connected-body-line");
        if (bodyLine?.textContent) dropBodyLineText = bodyLine.textContent;
        if (node.textContent?.includes("SESSION ENDED")) sawSessionEnded = true;
      }
    }
    // Reads the interim drop copy the transport's own `closeReason` field
    // carries — never a second notion of "what happened" invented at this
    // layer. `kept` is 1 (this fixture's own single completed boundary).
    expect(dropBodyLineText).toBe(
      "The erg dropped the workout. 1 interval kept.",
    );
    // Pins that line to the real ended frame, not some other
    // body-line-bearing screen.
    expect(sawSessionEnded).toBe(true);

    // NOW let the navigation effect (and the router's own cascading
    // re-render) settle: the REAL `handleConnectedEnded` fires
    // (`WorkoutDetail.tsx`), `navigate("/library/:id/log?from=monitor")`
    // runs for real, and the REAL `LogSession` mounts, reading the record
    // out of the store's memory tier.
    const heading = await screen.findByRole("heading", {
      name: WORKOUT.title,
    });

    // ASSERTION 3 (spec §1's own words): "the log door renders the row" —
    // about the READER EXISTING, not about a destination. A prior draft
    // asserted only the destination and would have passed on the exact
    // defect that stranded the record (a removed `?from=monitor` navigates
    // to the workout screen, never the log, with nothing rendered from the
    // connected session at all) — this reads the actual interval ROW
    // (`PostWorkoutSummary.tsx`'s own `.summary-row-list`/`.summary-row`,
    // `IntervalRow`) the monitor door renders from `monitorRun.actuals`.
    const rows = document.querySelectorAll(".summary-row");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.querySelector(".summary-row-index")!.textContent).toBe("1");

    // The strip (Task 4, Gate 0): the DURABLE record's own `endedBy`, read
    // by `LogSession.tsx` directly — never the session's `closeReason`,
    // which died with the session at navigation (spec §1: "the record is
    // the only authority that survives the navigation").
    const strip = document.querySelector(".log-dropped-strip");
    expect(strip).not.toBeNull();
    expect(strip!.querySelector(".log-dropped-title")!.textContent).toBe(
      "THE ERG DROPPED THE WORKOUT.",
    );
    expect(strip!.querySelector(".log-dropped-body")!.textContent).toBe(
      "1 interval kept. The row below is what the erg measured before it stopped.",
    );
    expect(
      heading.compareDocumentPosition(strip!) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();

    // The hand-off's durable half: the record persisted for real (no
    // storage denial in this test), so the memory-tier record and durable
    // storage agree — matching `WorkoutDetail.connectedRecovery.test.tsx`'s
    // own POST-body assertions for the same shape, on a shorter fixture.
    await userEvent.click(screen.getByRole("button", { name: "HELD" }));
    await userEvent.click(screen.getByRole("button", { name: "Pain 2" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Save without logging" }),
    );
    await waitFor(() => expect(apiFn).toHaveBeenCalled());
    const [, init] = apiFn.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as {
      endedBy: string;
      deviceName: string;
    };
    expect(body.endedBy).toBe("program-dropped");
    expect(body.deviceName).toBe(DEVICE);
  });

  it("assertion 4: under a forced durable-write failure, no hand-off occurs and the COULD-NOT-KEEP state renders in the ended frame", async () => {
    // Denied from before the session even opens — the SAME idiom
    // `WorkoutDetail.connectedRecovery.test.tsx` uses for its own held-error
    // leg: every write this recovery relies on must come from the store's
    // own memory tier, never durable storage.
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

    await connectToLiveWithOneCompletedInterval();
    expect(capturedDriverEventCb).not.toBeNull();

    act(() => {
      capturedDriverEventCb!({ kind: "programDropped" });
    });

    // The durable verify (run synchronously in the SAME patch, per the
    // spec's own "Mechanism" section: "the close owes no hold conditions")
    // failed, so `holdError === "storage-failed"` — the ended frame's
    // held-error branch renders INSTEAD of the drop body-line, and
    // `ConnectedSurface.tsx`'s own `onEnded` effect never fires while this
    // branch is up (there is no `handoffHeld`/no-error path to trigger it).
    await waitFor(() =>
      expect(
        screen.getByText("COULD NOT KEEP THE RECORD ON THIS PHONE."),
      ).toBeInTheDocument(),
    );

    // NO HAND-OFF: the real `LogSession` never mounted, so there is no
    // workout-title heading anywhere in the tree, and the drop body-line
    // never rendered either (mutually exclusive with the held-error
    // branch — `ConnectedSurface.tsx`'s own ternary).
    expect(
      screen.queryByRole("heading", { name: WORKOUT.title }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector(".connected-body-line"),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(MONITOR_RUN_KEY)).toBeNull();
  });
});
