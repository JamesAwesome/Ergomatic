/**
 * TD SPIKE RE-RUN — NOT A KEPT TEST. Branch `td-spike` only; nothing merges.
 *
 * The first spike (`tdSpike.freeRowEndSummary.test.ts`) stubbed out the
 * three knobs that decide the answer:
 *   settleTicks: 0, prepareSettleTicks: 0, burstLingerSchedule: no-op.
 * This file is that file with those three removed, so the hook takes the
 * PRODUCTION values (`DEFAULT_SETTLE_TICKS = 3`, `DEFAULT_PREPARE_SETTLE_TICKS`,
 * a real `setTimeout(_, BURST_LINGER_MS = 2000)`). Everything else —
 * script, drive sequence, ring read — is byte-identical.
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

/** PRODUCTION DEFAULTS. The only surviving driverOption is `schedule`,
 *  which exists to release the DEFERRED status subscriptions at
 *  construction — without it the driver never subscribes at all under a
 *  fake with no wall clock, so it is a harness necessity, not a knob that
 *  shapes the answer (`src/test/statusSubscriptions.ts` header). */
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
        schedule: releasingSchedule(() => (): void => undefined),
      },
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

/** jsdom's `console` is swallowed by this runner (measured: a
 *  `console.log` in a passing client test never reaches stdout, a
 *  `process.stdout.write` does). Every readout in this file goes through
 *  here so the ring is actually observable. */
function say(s: string): void {
  process.stdout.write(s + "\n");
}

function dump(label: string, ring: Ring): void {
  say(
    `\n===== ${label} (${ring.length} entries) =====\n` +
      ring.map((e, i) => `[${i}] ${e.kind} :: ${e.detail}`).join("\n") +
      `\n===== end ${label} =====\n`,
  );
}

function relevant(ring: Ring): Ring {
  return ring.filter(
    (e) =>
      e.kind.includes("summary") ||
      e.kind.includes("terminate") ||
      e.kind.includes("record") ||
      e.kind.includes("handoff") ||
      e.detail.includes("out-of-window") ||
      e.detail.includes("terminate-observations"),
  );
}

beforeEach(() => {
  localStorage.clear();
  resetHandoffStore();
  resetConnectionAttemptTraceForTests();
});

describe("TD SPIKE RE-RUN: production defaults", () => {
  /** connect + free row + two pulls. Stops BEFORE endSession(). */
  async function driveToLive(
    deps: Omit<MonitorSessionDeps, "createTransport"> = {},
  ) {
    const h = harness(deps);
    const { result, fake } = h;
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
    return h;
  }

  /** Fires `endSession()` WITHOUT awaiting it, then reports whether it has
   *  resolved after each successive status tick. This is the premise
   *  measurement: at `settleTicks: 0` it resolved with zero ticks. */
  function startEnd(result: ReturnType<typeof harness>["result"]): {
    promise: Promise<void>;
    resolved: () => boolean;
  } {
    let done = false;
    const promise = result.current.endSession().then(() => {
      done = true;
    });
    return { promise, resolved: () => done };
  }

  it("PREMISE — does endSession() resolve before three new status ticks?", async () => {
    const { result, fake } = await driveToLive();

    let end!: ReturnType<typeof startEnd>;
    await act(async () => {
      end = startEnd(result);
      await flush();
    });
    say(`PREMISE phase right after the call = ${result.current.phase}`);
    say(`PREMISE resolved after 0 ticks = ${end.resolved()}`);

    for (const n of [1, 2, 3, 4]) {
      tick(fake, 1000);
      await act(async () => {
        await flush();
      });
      say(`PREMISE resolved after ${n} tick(s) = ${end.resolved()}`);
    }
    await act(async () => {
      await end.promise;
      await flush();
    });
    expect(result.current.phase).toBe("ended");
  });

  it("ORDER A — summary delivered BEFORE endSession() has resolved (0 ticks)", async () => {
    const { result, fake } = await driveToLive();

    let end!: ReturnType<typeof startEnd>;
    await act(async () => {
      end = startEnd(result);
      await flush();
    });
    say(`ORDER A resolved before summary = ${end.resolved()}`);

    await act(async () => {
      fake.deliverSummary({ elapsedSeconds: 393.6, meters: 1396 });
      fake.deliverVerification();
      await flush();
    });

    // Let endSession() finish so nothing dangles.
    for (let i = 0; i < 4; i += 1) tick(fake, 1000);
    await act(async () => {
      await end.promise;
      await flush();
    });

    const ring = JSON.parse(result.current.exportLog()) as Ring;
    dump("ORDER A FULL RING", ring);
    dump("ORDER A RELEVANT", relevant(ring));
    say(
      `ORDER A run present = ${loadMonitorRun() !== null} summaryTotals = ${JSON.stringify(loadMonitorRun()?.summaryTotals)}`,
    );
    expect(ring.length).toBeGreaterThan(0);
  });

  /** The boundary probe: ORDER A (0 ticks) is red and ORDER B (3 ticks,
   *  endSession() resolved) is green, so the transition happens at 1, 2 or
   *  3 ticks. This runs each. */
  for (const n of [1, 2]) {
    it(`ORDER A${n} — ${n} tick(s) after the terminate ack, endSession() NOT yet resolved, then the summary`, async () => {
      const { result, fake } = await driveToLive();

      let end!: ReturnType<typeof startEnd>;
      await act(async () => {
        end = startEnd(result);
        await flush();
      });
      for (let i = 0; i < n; i += 1) {
        tick(fake, 1000);
        await act(async () => {
          await flush();
        });
      }
      say(`ORDER A${n} endSession resolved before summary = ${end.resolved()}`);

      await act(async () => {
        fake.deliverSummary({ elapsedSeconds: 393.6, meters: 1396 });
        fake.deliverVerification();
        await flush();
      });

      for (let i = 0; i < 4; i += 1) tick(fake, 1000);
      await act(async () => {
        await end.promise;
        await flush();
      });

      const ring = JSON.parse(result.current.exportLog()) as Ring;
      dump(`ORDER A${n} RELEVANT`, relevant(ring));
      say(
        `ORDER A${n} run present = ${loadMonitorRun() !== null} summaryTotals = ${JSON.stringify(loadMonitorRun()?.summaryTotals)}`,
      );
      expect(ring.length).toBeGreaterThan(0);
    });
  }

  it("ORDER B — endSession() RESOLVED (3 ticks), then the summary", async () => {
    const { result, fake } = await driveToLive();

    let end!: ReturnType<typeof startEnd>;
    await act(async () => {
      end = startEnd(result);
      await flush();
    });
    for (let i = 0; i < 3; i += 1) {
      tick(fake, 1000);
      await act(async () => {
        await flush();
      });
    }
    await act(async () => {
      await end.promise;
      await flush();
    });
    say(`ORDER B resolved before summary = ${end.resolved()}`);

    await act(async () => {
      fake.deliverSummary({ elapsedSeconds: 393.6, meters: 1396 });
      fake.deliverVerification();
      await flush();
    });

    const ring = JSON.parse(result.current.exportLog()) as Ring;
    dump("ORDER B FULL RING", ring);
    dump("ORDER B RELEVANT", relevant(ring));
    say(
      `ORDER B summaryTotals = ${JSON.stringify(loadMonitorRun()?.summaryTotals)}`,
    );
    expect(ring.length).toBeGreaterThan(0);
  });

  it("ORDER C — endSession() resolved, auto-cycle fully drained (5 ticks), then the summary", async () => {
    const { result, fake } = await driveToLive();

    let end!: ReturnType<typeof startEnd>;
    await act(async () => {
      end = startEnd(result);
      await flush();
    });
    for (let i = 0; i < 5; i += 1) {
      tick(fake, 1000);
      await act(async () => {
        await flush();
      });
    }
    await act(async () => {
      await end.promise;
      await flush();
    });

    await act(async () => {
      fake.deliverSummary({ elapsedSeconds: 393.6, meters: 1396 });
      fake.deliverVerification();
      await flush();
    });

    const ring = JSON.parse(result.current.exportLog()) as Ring;
    dump("ORDER C FULL RING", ring);
    dump("ORDER C RELEVANT", relevant(ring));
    say(
      `ORDER C summaryTotals = ${JSON.stringify(loadMonitorRun()?.summaryTotals)}`,
    );
    expect(ring.length).toBeGreaterThan(0);
  });

  it("ORDER D (Candidate B) — endSession() resolved, UNMOUNT, then the summary INSIDE the real 2000ms linger", async () => {
    const { result, fake, unmount } = await driveToLive();

    let end!: ReturnType<typeof startEnd>;
    await act(async () => {
      end = startEnd(result);
      await flush();
    });
    for (let i = 0; i < 3; i += 1) {
      tick(fake, 1000);
      await act(async () => {
        await flush();
      });
    }
    await act(async () => {
      await end.promise;
      await flush();
    });

    act(() => {
      unmount();
    });

    await act(async () => {
      fake.deliverSummary({ elapsedSeconds: 393.6, meters: 1396 });
      fake.deliverVerification();
      await flush();
    });

    const ring = JSON.parse(result.current.exportLog()) as Ring;
    dump("ORDER D FULL RING", ring);
    dump("ORDER D RELEVANT", relevant(ring));
    say(
      `ORDER D summaryTotals = ${JSON.stringify(loadMonitorRun()?.summaryTotals)}`,
    );
    expect(ring.length).toBeGreaterThan(0);
  });

  it("ORDER E — endSession() resolved, UNMOUNT, real 2000ms linger EXPIRES, then the summary", async () => {
    const { result, fake, unmount } = await driveToLive();

    let end!: ReturnType<typeof startEnd>;
    await act(async () => {
      end = startEnd(result);
      await flush();
    });
    for (let i = 0; i < 3; i += 1) {
      tick(fake, 1000);
      await act(async () => {
        await flush();
      });
    }
    await act(async () => {
      await end.promise;
      await flush();
    });

    act(() => {
      unmount();
    });

    // REAL wall clock: the default `burstLingerSchedule` is `setTimeout`,
    // and `BURST_LINGER_MS` is 2000. Wait past it, then deliver.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2300));
      await flush();
    });
    say("ORDER E linger window has expired; delivering now");

    await act(async () => {
      fake.deliverSummary({ elapsedSeconds: 393.6, meters: 1396 });
      fake.deliverVerification();
      await flush();
    });

    const ring = JSON.parse(result.current.exportLog()) as Ring;
    dump("ORDER E FULL RING", ring);
    dump("ORDER E RELEVANT", relevant(ring));
    say(
      `ORDER E run present = ${loadMonitorRun() !== null} summaryTotals = ${JSON.stringify(loadMonitorRun()?.summaryTotals)}`,
    );
    expect(ring.length).toBeGreaterThan(0);
  }, 20000);
});
