/**
 * TD SPIKE — NOT A KEPT TEST. Branch `td-spike` only; nothing here merges.
 *
 * Question: on the FREE-ROW path, does a `deliverSummary()` delivered after
 * the app's own `endSession()` reach a live driver at all, and if it does,
 * what verdict does it get? The ring is the oracle:
 *   - no `summary-half`            -> the notification never reached a driver
 *   - `summary-half` + out-of-window -> no terminated frame had arrived yet
 *   - `terminate-observations`     -> the mechanism works end to end
 *
 * Setup copied from `useMonitorSession.test.ts` (its `harness`, `connect`,
 * `armFreeRow`, `tick`, `flush` and `beforeEach`), deliberately, so the
 * probe measures the hook rather than a bespoke rig.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { WORKOUTSTATE_INTERVALWORKTIME } from "../../domain/monitor/pm5/parse.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import { releasingSchedule } from "../test/statusSubscriptions";
import {
  loadMonitorRun,
  resetForTests as resetHandoffStore,
} from "./handoffStore";
import { resetConnectionAttemptTraceForTests } from "./nfc/connectionAttemptTrace";
import {
  createFakeTransport,
  type FakeControls,
  type FakeScript,
  type FakeTimelineEvent,
} from "./transports/fake";
import {
  useMonitorSession,
  type MonitorSessionDeps,
} from "./useMonitorSession";

const DEVICE_NAME = "PM5 432331249";
const t0 = new Date("2026-08-07T09:00:00.000Z");

/** Never sent — a free row calls no `program()`. Required by `FakeScript`. */
const UNSENT_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 120,
      displaySpm: 22,
      restSeconds: 0,
    },
  ],
};

/** Two pulls. NO third TERMINATE event: the row ends through the APP's End
 *  button, which is the whole point of this probe. */
const FREE_ROW_EVENTS: FakeTimelineEvent[] = [
  {
    atMs: 1000,
    kind: "status",
    workoutState: WORKOUTSTATE_INTERVALWORKTIME,
    elapsedSeconds: 1,
    distanceMeters: 4,
    spm: 22,
    currentSplit: 140,
    heartRateBpm: null,
    programIntervalIndex: 0,
  },
  {
    atMs: 2000,
    kind: "status",
    workoutState: WORKOUTSTATE_INTERVALWORKTIME,
    elapsedSeconds: 2,
    distanceMeters: 11,
    spm: 23,
    currentSplit: 139,
    heartRateBpm: null,
    programIntervalIndex: 0,
  },
];

function freeRowScript(): FakeScript {
  return { program: UNSENT_PROGRAM, events: FREE_ROW_EVENTS };
}

function harness(deps: Omit<MonitorSessionDeps, "createTransport"> = {}) {
  const fake = createFakeTransport({
    deviceName: DEVICE_NAME,
    ...freeRowScript(),
  });
  const rendered = renderHook(() =>
    useMonitorSession({
      createTransport: () => fake,
      now: () => t0,
      driverOptions: {
        settleTicks: 0,
        prepareSettleTicks: 0,
        schedule: releasingSchedule(() => (): void => undefined),
      },
      burstLingerSchedule: () => (): void => undefined,
      ...deps,
    }),
  );
  return { fake, ...rendered };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 200; i += 1) await Promise.resolve();
}

function tick(fake: FakeControls, ms: number): void {
  act(() => {
    fake.tick(ms);
  });
}

type Ring = { kind: string; detail: string }[];

function dump(label: string, ring: Ring): void {
  console.log(
    `\n===== ${label} (${ring.length} entries) =====\n` +
      ring.map((e, i) => `[${i}] ${e.kind} :: ${e.detail}`).join("\n") +
      `\n===== end ${label} =====\n`,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetHandoffStore();
  resetConnectionAttemptTraceForTests();
});

describe("TD SPIKE: free row + endSession() + deliverSummary", () => {
  function harnessDriven() {
    return harness();
  }

  async function driveWith(
    result: ReturnType<typeof harness>["result"],
    fake: FakeControls,
  ): Promise<void> {
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      result.current.beginFreeRow();
      await flush();
    });
    tick(fake, 1000);
    tick(fake, 1000);
    await act(async () => {
      await result.current.endSession();
      await flush();
    });
  }

  async function driveToEnd(): Promise<{
    result: ReturnType<typeof harness>["result"];
    fake: FakeControls;
  }> {
    const { result, fake } = harness();
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      result.current.beginFreeRow();
      await flush();
    });
    expect(result.current.phase).toBe("ready");

    tick(fake, 1000);
    tick(fake, 1000);
    expect(result.current.phase).toBe("live");
    expect(loadMonitorRun()?.mode).toBe("justrow");

    await act(async () => {
      await result.current.endSession();
      await flush();
    });
    expect(result.current.phase).toBe("ended");
    return { result, fake };
  }

  it("RUN 0 (the oracle's red case) — ZERO ticks after endSession(): the auto-cycle has not delivered the terminated frame yet", async () => {
    const { result, fake } = await driveToEnd();

    // NO tick. `queueTerminateAutoCycle` has queued the terminated frame
    // but nothing has drained it, so the driver has seen no terminal
    // transition when 0x0039 lands.
    await act(async () => {
      fake.deliverSummary({ elapsedSeconds: 393.6, meters: 1396 });
      fake.deliverVerification();
      await flush();
    });

    const ring = JSON.parse(result.current.exportLog()) as Ring;
    dump("RUN 0 FULL RING", ring);
    console.log(
      `RUN 0 summaryTotals = ${JSON.stringify(loadMonitorRun()?.summaryTotals)}`,
    );
    expect(ring.length).toBeGreaterThan(0);
  });

  it("RUN 1 — ONE tick after endSession(), then the summary", async () => {
    const { result, fake } = await driveToEnd();

    // ONE tick: `queueTerminateAutoCycle` drains exactly one status here.
    tick(fake, 1000);

    await act(async () => {
      fake.deliverSummary({ elapsedSeconds: 393.6, meters: 1396 });
      fake.deliverVerification();
      await flush();
    });

    const ring = JSON.parse(result.current.exportLog()) as Ring;
    dump("RUN 1 FULL RING", ring);
    dump(
      "RUN 1 SUMMARY-RELEVANT",
      ring.filter(
        (e) =>
          e.kind.includes("summary") ||
          e.kind.includes("terminate") ||
          e.kind.includes("record") ||
          e.kind.includes("handoff") ||
          e.detail.includes("out-of-window") ||
          e.detail.includes("terminate-observations"),
      ),
    );
    console.log(
      `RUN 1 summaryTotals = ${JSON.stringify(loadMonitorRun()?.summaryTotals)}`,
    );
    expect(ring.length).toBeGreaterThan(0);
  });

  it("RUN 2 — FOUR ticks after endSession() (auto-cycle fully drained), then the summary", async () => {
    const { result, fake } = await driveToEnd();

    // `queueTerminateAutoCycle` queues three statuses, one per tick; a
    // fourth tick proves the queue is empty.
    tick(fake, 1000);
    tick(fake, 1000);
    tick(fake, 1000);
    tick(fake, 1000);

    await act(async () => {
      fake.deliverSummary({ elapsedSeconds: 393.6, meters: 1396 });
      fake.deliverVerification();
      await flush();
    });

    const ring = JSON.parse(result.current.exportLog()) as Ring;
    dump("RUN 2 FULL RING", ring);
    dump(
      "RUN 2 SUMMARY-RELEVANT",
      ring.filter(
        (e) =>
          e.kind.includes("summary") ||
          e.kind.includes("terminate") ||
          e.kind.includes("record") ||
          e.kind.includes("handoff") ||
          e.detail.includes("out-of-window") ||
          e.detail.includes("terminate-observations"),
      ),
    );
    console.log(
      `RUN 2 summaryTotals = ${JSON.stringify(loadMonitorRun()?.summaryTotals)}`,
    );
    expect(ring.length).toBeGreaterThan(0);
  });

  it("RUN 3 (Candidate B's signature) — the hook UNMOUNTS before the summary arrives", async () => {
    const { result, fake, unmount } = harnessDriven();
    await driveWith(result, fake);

    tick(fake, 1000);
    // The navigate-and-unmount the 2026-09-07 e2e attempt could not rule out.
    act(() => {
      unmount();
    });

    await act(async () => {
      fake.deliverSummary({ elapsedSeconds: 393.6, meters: 1396 });
      fake.deliverVerification();
      await flush();
    });

    console.log(
      `RUN 3 summaryTotals = ${JSON.stringify(loadMonitorRun()?.summaryTotals)}`,
    );
    const ring = JSON.parse(result.current.exportLog()) as Ring;
    dump("RUN 3 FULL RING", ring);
    expect(ring.length).toBeGreaterThan(0);
  });
});
