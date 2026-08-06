import { describe, expect, it, vi } from "vitest";
import {
  buildProgrammingSequence,
  buildTerminate,
} from "../../../domain/monitor/pm5/commands.js";
import {
  HEARTRATE_NO_BELT,
  parseAdditionalSplitIntervalData,
  parseAdditionalStatus2,
  parseGeneralStatus,
  WORKOUTSTATE_INTERVALREST,
  WORKOUTSTATE_INTERVALWORKTIME,
  WORKOUTSTATE_TERMINATE,
  WORKOUTSTATE_WAITTOBEGIN,
} from "../../../domain/monitor/pm5/parse.js";
import { parseCsafeResponse } from "../../../domain/monitor/pm5/response.js";
import { buildAdditionalStatus1Bytes } from "../../../domain/monitor/pm5/statusFrames.js";
import {
  ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
  ADDITIONAL_STATUS_1_UUID,
  ADDITIONAL_STATUS_2_UUID,
  GENERAL_STATUS_UUID,
  RECEIVE_CHARACTERISTIC_UUID,
  SAMPLE_RATE_UUID,
  SPLIT_INTERVAL_DATA_UUID,
  TRANSMIT_CHARACTERISTIC_UUID,
} from "../../../domain/monitor/pm5/uuids.js";
import type { WorkoutProgram } from "../../../domain/monitor/program.js";
import { createFakeTransport, type FakeTimelineEvent } from "./fake";

// A minimal, hand-built one-interval program — deliberately NOT a real
// library workout, unlike driver.test.ts's happy-path suite (which drives
// this same fake through a real compiled Sea Fret program per the
// briefing's fixture-realism rule). This file's job is FAKE-specific unit
// behaviour (byte assertion, injection hooks, tick semantics), where a
// small hand-built program keeps the expected byte sequence short enough
// to reason about directly.
const PROGRAM: WorkoutProgram = {
  intervals: [
    {
      kind: "time",
      value: 60,
      targetSplit: 120,
      displaySpm: 22,
      restSeconds: 0,
    },
  ],
};

const DISTANCE_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      kind: "distance",
      value: 500,
      targetSplit: null,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

/** A two-event timeline (one status tick, one interval boundary) shared by
 *  both the plain tick-delivery tests and the disconnect/reconnect tests
 *  below — the latter rely on it having exactly these two `atMs` values. */
const TIMELINE_EVENTS: FakeTimelineEvent[] = [
  {
    atMs: 1000,
    kind: "status",
    workoutState: WORKOUTSTATE_INTERVALWORKTIME,
    elapsedSeconds: 5,
    distanceMeters: 20,
    spm: 24,
    currentSplit: 110,
    heartRateBpm: 140,
    programIntervalIndex: 0,
  },
  {
    atMs: 2000,
    kind: "boundary",
    actual: {
      index: 0,
      elapsedSeconds: 60,
      distanceMeters: 220,
      avgSplit: 118,
      avgSpm: 23,
      avgHeartRateBpm: 145,
    },
    cumulativeElapsedSeconds: 60,
    cumulativeDistanceMeters: 220,
  },
];

async function programIt(
  fake: ReturnType<typeof createFakeTransport>,
  program: WorkoutProgram,
) {
  // Plan Task 2: `program()`'s own best-effort clear step precedes the real
  // programming sequence (`src/monitor/driver.ts`'s `sendClear()`) — the
  // fake's `"clearing"` phase expects the SAME `buildTerminate()` bytes
  // first, always rejecting (0x81) before advancing to `"programming"`.
  for (const chunk of buildTerminate()[0]!) {
    await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
  }
  for (const chunk of buildProgrammingSequence(program)[0]!) {
    await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
  }
  // Fix-round 1, F1: the armed bundle is no longer delivered synchronously
  // inside the last chunk's ack (that hid driver.ts's tick-driven verify
  // wait from every fake-based test) — this file tests the FAKE's own
  // wire-protocol modeling in isolation, not `verifyArmed()`'s waiting
  // behaviour (covered directly in driver.test.ts), so `programIt` uses
  // the synchronous escape hatch to keep every existing assertion's timing
  // exactly as it was.
  fake.deliverArmedNow();
}

function decodeGeneral(bytes: Uint8Array) {
  const decoded = parseGeneralStatus(bytes);
  if ("error" in decoded)
    throw new Error("unexpected parse error in test fixture");
  return decoded;
}

function decodeAs2(bytes: Uint8Array) {
  const decoded = parseAdditionalStatus2(bytes);
  if ("error" in decoded)
    throw new Error("unexpected parse error in test fixture");
  return decoded;
}

function decodeAsSplit(bytes: Uint8Array) {
  const decoded = parseAdditionalSplitIntervalData(bytes);
  if ("error" in decoded)
    throw new Error("unexpected parse error in test fixture");
  return decoded;
}

describe("createFakeTransport: scan/connect", () => {
  it("scan resolves one discovered monitor, defaulting the name", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    await expect(fake.scan()).resolves.toStrictEqual([
      { id: "fake-pm5", name: "PM5 (fake)" },
    ]);
    await expect(fake.connect("fake-pm5")).resolves.toBeUndefined();
  });

  it("uses the script's deviceName when given", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      deviceName: "PM5 99999",
    });
    await expect(fake.scan()).resolves.toStrictEqual([
      { id: "fake-pm5", name: "PM5 99999" },
    ]);
  });

  it("disconnect() resolves — caller-initiated, distinct from onDisconnect", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    await expect(fake.disconnect()).resolves.toBeUndefined();
  });
});

describe("createFakeTransport: programming — byte-for-byte verification, ack per FRAME not per chunk", () => {
  it("acks 'ok' only once the whole frame's chunks have arrived, matching bytes exactly", async () => {
    const fake = createFakeTransport({ program: PROGRAM });

    // Plan Task 2's clear step precedes programming — consumed here BEFORE
    // subscribing below, so this test's own ack count stays scoped to the
    // PROGRAM sequence exactly as before.
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }

    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );

    const [frame] = buildProgrammingSequence(PROGRAM);
    expect(frame).toBeDefined();
    expect(frame!.length).toBeGreaterThan(1); // this fixture spans >1 BLE chunk

    await fake.write(RECEIVE_CHARACTERISTIC_UUID, frame![0]!);
    expect(acks).toHaveLength(0); // no ack until the frame completes

    for (const chunk of frame!.slice(1)) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ status: "ok" });
  });

  it("asserts — a corrupted chunk throws rather than being silently accepted (it's a protocol assertion, not a stub)", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    // Clear the plan-Task-2 clearing phase first, so the corrupted write
    // below is actually checked against the PROGRAM sequence.
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    const [frame] = buildProgrammingSequence(PROGRAM);
    const corrupted = Uint8Array.from(frame![0]!);
    corrupted[2] = (corrupted[2]! ^ 0xff) & 0xff;
    await expect(
      fake.write(RECEIVE_CHARACTERISTIC_UUID, corrupted),
    ).rejects.toThrow(/mismatch/);
  });

  it("asserts during the clearing phase too — a corrupted clear chunk throws rather than being silently accepted", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const [clearFrame] = buildTerminate();
    const corrupted = Uint8Array.from(clearFrame![0]!);
    corrupted[2] = (corrupted[2]! ^ 0xff) & 0xff;
    await expect(
      fake.write(RECEIVE_CHARACTERISTIC_UUID, corrupted),
    ).rejects.toThrow(/unexpected write during the clear step/);
  });

  it("throws on a write past the end of the expected programming sequence", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    await programIt(fake, PROGRAM); // now armed; only a terminate write is legal
    const badTerminate = Uint8Array.from([0xff, 0xff]);
    await expect(
      fake.write(RECEIVE_CHARACTERISTIC_UUID, badTerminate),
    ).rejects.toThrow(/unexpected write while armed/);
  });

  it("injectNak(0) rejects frame 0's ack and does NOT advance to armed", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    fake.injectNak(0);
    // Consumed BEFORE subscribing (plan Task 2's clearing phase always
    // rejects on its own, regardless of `injectNak` — see `phase`'s own
    // doc comment) so `acks` below stays scoped to the PROGRAM sequence.
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));

    for (const chunk of buildProgrammingSequence(PROGRAM)[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ status: "reject" });
    // Never armed: no WAITTOBEGIN bundle should have been sent.
    expect(generals).toHaveLength(0);
  });

  it("injectNak targeting a frame index that never occurs leaves every real ack as 'ok'", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    fake.injectNak(7); // this program only ever reaches frame 0
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    for (const chunk of buildProgrammingSequence(PROGRAM)[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ status: "ok" });
  });

  it("injectNak(2) rejects a LATER frame (not just frame 0) in a genuinely multi-frame sequence (fix-round L2)", async () => {
    const multiFrameProgram: WorkoutProgram = {
      intervals: Array.from({ length: 13 }, () => ({
        kind: "time" as const,
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 30,
      })),
    };
    const seq = buildProgrammingSequence(multiFrameProgram);
    expect(seq).toHaveLength(4); // confirms this fixture is genuinely 4 frames

    const fake = createFakeTransport({ program: multiFrameProgram });
    fake.injectNak(2);
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));

    for (const frame of seq.slice(0, 3)) {
      for (const chunk of frame) {
        await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
      }
    }
    expect(acks.map((a) => a.status)).toStrictEqual(["ok", "ok", "reject"]);
    expect(generals).toHaveLength(0); // never reached "armed" — frame 2's rejection halts the sequence
  });

  it("injectTimeout() during the PROGRAMMING phase itself withholds that frame's ack (distinct from the clearing-phase case)", async () => {
    // Plan Task 2's leading "clearing" phase has its OWN `timeoutInjected`
    // short-circuit (`onClearingFrameComplete`) — this pins the SEPARATE
    // one in `onProgrammingFrameComplete`, by injecting the timeout only
    // AFTER the clear step has already completed normally.
    const fake = createFakeTransport({ program: PROGRAM });
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    fake.injectTimeout();

    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));

    for (const chunk of buildProgrammingSequence(PROGRAM)[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(acks).toHaveLength(0); // link stays up, but no ack for this frame
    expect(generals).toHaveLength(0); // never armed either
  });

  it("a write after a NAK'd frame (which never advances to armed) past the expected sequence's own end throws", async () => {
    // injectNak(0) rejects PROGRAM's only frame, so `phase` never leaves
    // "programming" — a further write finds the expected-chunk cursor
    // already past the end of the (never-completed) sequence, a distinct
    // path from the "armed" out-of-sequence write covered above.
    const fake = createFakeTransport({ program: PROGRAM });
    fake.injectNak(0);
    await programIt(fake, PROGRAM);
    await expect(
      fake.write(RECEIVE_CHARACTERISTIC_UUID, Uint8Array.from([0xff])),
    ).rejects.toThrow(/already complete/);
  });

  it("delivers the WAITTOBEGIN bundle once the sequence acks successfully AND armed delivery is flushed (programIt's own deliverArmedNow(), fix-round 1, F1)", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    await programIt(fake, PROGRAM);
    expect(generals).toHaveLength(1);
    expect(decodeGeneral(generals[0]!).workoutState).toBe(
      WORKOUTSTATE_WAITTOBEGIN,
    );
  });

  it("a distance-kind program's status bundle carries intervalType=1", async () => {
    const fake = createFakeTransport({
      program: DISTANCE_PROGRAM,
      events: [
        {
          atMs: 100,
          kind: "status",
          workoutState: WORKOUTSTATE_INTERVALWORKTIME,
          elapsedSeconds: 10,
          distanceMeters: 50,
          spm: 24,
          currentSplit: 110,
          heartRateBpm: 140,
          programIntervalIndex: 0,
        },
      ],
    });
    await programIt(fake, DISTANCE_PROGRAM);
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    fake.tick(100);
    expect(generals).toHaveLength(1);
    expect(decodeGeneral(generals[0]!).intervalType).toBe(1);
  });
});

describe("createFakeTransport: terminate", () => {
  it("acks the documented terminate frame and immediately reports TERMINATE", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    await programIt(fake, PROGRAM);

    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));

    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ status: "ok" });
    expect(generals).toHaveLength(1);
    expect(decodeGeneral(generals[0]!).workoutState).toBe(
      WORKOUTSTATE_TERMINATE,
    );
  });

  it("injectTimeout() withholds the terminate ack too — link stays up, nothing reported (fix-round HIGH-2)", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    await programIt(fake, PROGRAM);
    fake.injectTimeout();

    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));

    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(acks).toHaveLength(0);
    expect(generals).toHaveLength(0);
  });
});

describe("createFakeTransport: write() target validation", () => {
  it("accepts a sample-rate write without treating it as a CSAFE frame", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    await expect(
      fake.write(SAMPLE_RATE_UUID, Uint8Array.from([0x03])),
    ).resolves.toBeUndefined();
  });

  it("rejects a write to any other characteristic", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    await expect(
      fake.write("not-a-real-uuid", Uint8Array.from([0x00])),
    ).rejects.toThrow(/unexpected write target/);
  });
});

describe("createFakeTransport: tick-driven timeline", () => {
  const events = TIMELINE_EVENTS;

  it("delivers nothing before a scheduled event's atMs is reached", async () => {
    const fake = createFakeTransport({ program: PROGRAM, events });
    await programIt(fake, PROGRAM);
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    fake.tick(500);
    expect(generals).toHaveLength(0);
  });

  it("delivers a due status event exactly once its atMs is reached", async () => {
    const fake = createFakeTransport({ program: PROGRAM, events });
    await programIt(fake, PROGRAM);
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    fake.tick(1000);
    expect(generals).toHaveLength(1);
    expect(decodeGeneral(generals[0]!).workoutState).toBe(
      WORKOUTSTATE_INTERVALWORKTIME,
    );
  });

  it("delivers a due boundary event on 0x0037", async () => {
    const fake = createFakeTransport({ program: PROGRAM, events });
    await programIt(fake, PROGRAM);
    const splits: Uint8Array[] = [];
    fake.subscribe(SPLIT_INTERVAL_DATA_UUID, (b) => splits.push(b));
    fake.tick(2000);
    expect(splits).toHaveLength(1);
  });

  it("a boundary actual with null avg fields encodes without throwing", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      events: [
        {
          atMs: 500,
          kind: "boundary",
          actual: {
            index: 0,
            elapsedSeconds: 60,
            distanceMeters: 220,
            avgSplit: null,
            avgSpm: null,
            avgHeartRateBpm: null,
          },
          cumulativeElapsedSeconds: 60,
          cumulativeDistanceMeters: 220,
        },
      ],
    });
    await programIt(fake, PROGRAM);
    const splits: Uint8Array[] = [];
    fake.subscribe(SPLIT_INTERVAL_DATA_UUID, (b) => splits.push(b));
    expect(() => fake.tick(500)).not.toThrow();
    expect(splits).toHaveLength(1);
  });

  it("a large single tick delivers every event that has now become due, in order", async () => {
    const fake = createFakeTransport({ program: PROGRAM, events });
    await programIt(fake, PROGRAM);
    const generals: Uint8Array[] = [];
    const splits: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    fake.subscribe(SPLIT_INTERVAL_DATA_UUID, (b) => splits.push(b));
    fake.tick(5000);
    expect(generals).toHaveLength(1);
    expect(splits).toHaveLength(1);
  });
});

describe("createFakeTransport: disconnect / reconnect", () => {
  it("injectDisconnect fires the registered onDisconnect callback with a reason", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const cb = vi.fn();
    fake.onDisconnect(cb);
    fake.injectDisconnect();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0]).toStrictEqual(expect.any(String));
  });

  it("unsubscribing onDisconnect stops the callback from firing", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const cb = vi.fn();
    const unsubscribe = fake.onDisconnect(cb);
    unsubscribe();
    fake.injectDisconnect();
    expect(cb).not.toHaveBeenCalled();
  });

  it("while disconnected, tick advances the schedule but delivers nothing", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      events: TIMELINE_EVENTS,
    });
    await programIt(fake, PROGRAM);
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    fake.injectDisconnect();
    fake.tick(1000); // the 1000ms status event becomes due, but is suppressed
    expect(generals).toHaveLength(0);
  });

  it("completeReconnect flushes the latest cached status (re-derived, not interpolated)", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      events: TIMELINE_EVENTS,
    });
    await programIt(fake, PROGRAM);
    fake.injectDisconnect();
    fake.tick(3000); // both scheduled events elapse while disconnected
    const generals: Uint8Array[] = [];
    const splits: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    fake.subscribe(SPLIT_INTERVAL_DATA_UUID, (b) => splits.push(b));
    fake.completeReconnect();
    // Exactly one flush of whatever the LATEST state is (the boundary at
    // 2000ms, the last event in the schedule) — not one per skipped event.
    expect(generals).toHaveLength(1);
    expect(splits).toHaveLength(1);
  });

  it("completeReconnect with nothing cached yet flushes nothing", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    expect(() => fake.completeReconnect()).not.toThrow();
    expect(generals).toHaveLength(0);
  });

  it("after completeReconnect, subsequent ticks deliver normally again", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      events: TIMELINE_EVENTS,
    });
    await programIt(fake, PROGRAM);
    fake.injectDisconnect();
    fake.tick(1000);
    fake.completeReconnect();
    const splits: Uint8Array[] = [];
    fake.subscribe(SPLIT_INTERVAL_DATA_UUID, (b) => splits.push(b));
    fake.tick(1000); // reaches the 2000ms boundary event freshly
    expect(splits).toHaveLength(1);
  });
});

describe("createFakeTransport: injectGarbledFrame", () => {
  it("delivers a too-short General Status notification immediately", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    fake.injectGarbledFrame();
    expect(generals).toHaveLength(1);
    expect("error" in parseGeneralStatus(generals[0]!)).toBe(true);
  });
});

describe("createFakeTransport: subscribe", () => {
  it("unsubscribing stops further notifications on that characteristic", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const cb = vi.fn();
    const unsubscribe = fake.subscribe(GENERAL_STATUS_UUID, cb);
    unsubscribe();
    await programIt(fake, PROGRAM); // would normally deliver one WAITTOBEGIN notify
    expect(cb).not.toHaveBeenCalled();
  });

  it("a second subscriber on the same characteristic both receive notifications", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const first = vi.fn();
    const second = vi.fn();
    fake.subscribe(GENERAL_STATUS_UUID, first);
    fake.subscribe(GENERAL_STATUS_UUID, second);
    await programIt(fake, PROGRAM);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("createFakeTransport: onDisconnect replacing a prior registration", () => {
  it("unsubscribing a STALE onDisconnect callback (already replaced by a newer one) leaves the active one intact", () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = fake.onDisconnect(first);
    fake.onDisconnect(second); // replaces the registration
    unsubscribeFirst(); // stale — should NOT clear `second`
    fake.injectDisconnect();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 7A-fix Task 4: the wire values that make this a MODEL of the PM5 we
// met (interface-notes.md §18) rather than an idealized one. Each suite here
// pins something the real machine did and this fake previously did not.
// ---------------------------------------------------------------------------

describe("createFakeTransport: D3 — the wire carries the MACHINE's numbering, not ours", () => {
  const TWO_INTERVALS: WorkoutProgram = {
    intervals: Array.from({ length: 2 }, () => ({
      kind: "time" as const,
      value: 60,
      targetSplit: 120,
      displaySpm: 22,
      restSeconds: 30,
    })),
  };

  /** The full §18 #3 observation table for a 2×(1:00/0:30) session, in the
   *  fake's own terms: what OUR index and the machine's state are at each
   *  point, and what the machine actually put in 0x0033's Interval Count. */
  const OBSERVED_TABLE = [
    { our: 0, state: WORKOUTSTATE_INTERVALWORKTIME, machine: 0 }, // work0
    { our: 0, state: WORKOUTSTATE_INTERVALREST, machine: 1 }, // rest after work0
    { our: 1, state: WORKOUTSTATE_INTERVALWORKTIME, machine: 1 }, // work1
    { our: 1, state: WORKOUTSTATE_INTERVALREST, machine: 2 }, // the phantom
  ];

  it("0x0033's Interval Count reproduces the observed table, phantom index and all", async () => {
    const events: FakeTimelineEvent[] = OBSERVED_TABLE.map((row, i) => ({
      atMs: 100 * (i + 1),
      kind: "status" as const,
      workoutState: row.state,
      elapsedSeconds: 30 * (i + 1),
      distanceMeters: 100 * (i + 1),
      spm: 22,
      currentSplit: 120,
      heartRateBpm: 140,
      programIntervalIndex: row.our,
    }));
    const fake = createFakeTransport({ program: TWO_INTERVALS, events });
    await programIt(fake, TWO_INTERVALS);

    const as2: Uint8Array[] = [];
    fake.subscribe(ADDITIONAL_STATUS_2_UUID, (b) => as2.push(b));
    for (let i = 0; i < OBSERVED_TABLE.length; i += 1) fake.tick(100);

    expect(as2.map((b) => decodeAs2(b).intervalCount)).toStrictEqual(
      OBSERVED_TABLE.map((row) => row.machine),
    );
  });

  it("a boundary that lands mid-rest carries the forward-attributed Split/Interval Number too", async () => {
    const fake = createFakeTransport({
      program: TWO_INTERVALS,
      events: [
        {
          atMs: 100,
          kind: "status",
          workoutState: WORKOUTSTATE_INTERVALREST,
          elapsedSeconds: 65,
          distanceMeters: 200,
          spm: 0,
          currentSplit: 0,
          heartRateBpm: 130,
          programIntervalIndex: 1,
        },
        {
          atMs: 200,
          kind: "boundary",
          actual: {
            index: 1,
            elapsedSeconds: 60,
            distanceMeters: 200,
            avgSplit: 120,
            avgSpm: 22,
            avgHeartRateBpm: 140,
          },
          cumulativeElapsedSeconds: 90,
          cumulativeDistanceMeters: 200,
        },
      ],
    });
    await programIt(fake, TWO_INTERVALS);

    const asSplits: Uint8Array[] = [];
    fake.subscribe(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, (b) =>
      asSplits.push(b),
    );
    fake.tick(200);

    // The last interval of a two-interval program, reported as `2` — the
    // phantom the session ended on.
    expect(asSplits).toHaveLength(1);
    expect(decodeAsSplit(asSplits[0]!).splitIntervalNumber).toBe(2);
  });

  it("a boundary while ROWING is NOT adjusted — no offset is invented for a work->work boundary (§17 item 13)", async () => {
    const fake = createFakeTransport({
      program: TWO_INTERVALS,
      events: [
        {
          atMs: 100,
          kind: "status",
          workoutState: WORKOUTSTATE_INTERVALWORKTIME,
          elapsedSeconds: 55,
          distanceMeters: 190,
          spm: 22,
          currentSplit: 120,
          heartRateBpm: 140,
          programIntervalIndex: 0,
        },
        {
          atMs: 200,
          kind: "boundary",
          actual: {
            index: 0,
            elapsedSeconds: 60,
            distanceMeters: 200,
            avgSplit: 120,
            avgSpm: 22,
            avgHeartRateBpm: 140,
          },
          cumulativeElapsedSeconds: 60,
          cumulativeDistanceMeters: 200,
        },
      ],
    });
    await programIt(fake, TWO_INTERVALS);

    const asSplits: Uint8Array[] = [];
    fake.subscribe(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, (b) =>
      asSplits.push(b),
    );
    fake.tick(200);

    expect(decodeAsSplit(asSplits[0]!).splitIntervalNumber).toBe(0);
  });
});

describe("createFakeTransport: D4 — 0x0037 arrives BEFORE 0x0038 at every boundary", () => {
  it("delivers the identity half first and the averages half second, the order the machine used", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      events: TIMELINE_EVENTS,
    });
    await programIt(fake, PROGRAM);

    const order: string[] = [];
    fake.subscribe(SPLIT_INTERVAL_DATA_UUID, () => order.push("0x0037"));
    fake.subscribe(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, () =>
      order.push("0x0038"),
    );
    fake.tick(2000);

    // Task 1's verdict rests on this order: a driver that emitted from
    // 0x0037 while gated on 0x0038 lost the first boundary entirely.
    expect(order).toStrictEqual(["0x0037", "0x0038"]);
  });
});

describe("createFakeTransport: D5 — the beltless heart-rate byte is 0, not 255", () => {
  it("puts HEARTRATE_NO_BELT on the wire for a null heart rate, byte for byte", async () => {
    const beltlessTick: FakeTimelineEvent = {
      atMs: 100,
      kind: "status",
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      elapsedSeconds: 10,
      distanceMeters: 40,
      spm: 24,
      currentSplit: 110,
      heartRateBpm: null, // no belt paired
      programIntervalIndex: 0,
    };
    const fake = createFakeTransport({
      program: PROGRAM,
      events: [beltlessTick],
    });
    await programIt(fake, PROGRAM);

    const as1: Uint8Array[] = [];
    fake.subscribe(ADDITIONAL_STATUS_1_UUID, (b) => as1.push(b));
    fake.tick(100);

    // Built through the SAME pm5 encoder rather than asserting a byte
    // offset here (offsets live in `pm5/`, never in `src/`): the two
    // variants below differ in exactly the heart-rate byte, and the fake
    // must produce the `0` one.
    const fields = {
      elapsedSeconds: beltlessTick.elapsedSeconds,
      speedMetersPerSecond: 0,
      spm: beltlessTick.spm,
      currentSplit: beltlessTick.currentSplit,
      averageSplit: beltlessTick.currentSplit,
      restDistanceMeters: 0,
      restSeconds: 0,
      ergMachineType: 1,
    };
    const noBeltBytes = buildAdditionalStatus1Bytes({
      ...fields,
      heartRateBpm: HEARTRATE_NO_BELT,
    });
    const documentedSentinelBytes = buildAdditionalStatus1Bytes({
      ...fields,
      heartRateBpm: null, // the encoder's own 255
    });
    expect(noBeltBytes).not.toStrictEqual(documentedSentinelBytes); // the two really do differ
    expect(as1).toHaveLength(1);
    expect(as1[0]).toStrictEqual(noBeltBytes);
  });
});

describe("createFakeTransport: D1 — a machine with a workout already loaded", () => {
  it("accepts the clear, rejects the program, and WIPES what it was holding", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      loadedWorkout: { intervalCount: 3 },
    });
    expect(fake.loadedIntervals()).toBe(3);

    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));

    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    // Accepted with something loaded — the D1 UPDATE observation, and the
    // opposite of the clean-state case every other test in this file drives.
    expect(acks.map((a) => a.status)).toStrictEqual(["ok"]);
    expect(fake.loadedIntervals()).toBe(3); // terminate is NOT a clear

    for (const chunk of buildProgrammingSequence(PROGRAM)[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(acks.map((a) => a.status)).toStrictEqual(["ok", "reject"]);
    // The destructive half, confirmed twice on hardware: the rejection took
    // the rower's loaded workout with it.
    expect(fake.loadedIntervals()).toBeNull();
    fake.deliverArmedNow();
    expect(generals).toHaveLength(0); // never armed
  });

  it("a fake with nothing loaded reports nothing loaded, and rejects the clear instead", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    expect(fake.loadedIntervals()).toBeNull();

    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(acks.map((a) => a.status)).toStrictEqual(["reject"]);
  });
});

describe("createFakeTransport: D6 — handles die with the link", () => {
  it("every write throws the invalidated-handle error while disconnected, and works again after reconnecting", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    await programIt(fake, PROGRAM);

    fake.injectDisconnect();
    await expect(
      fake.write(RECEIVE_CHARACTERISTIC_UUID, buildTerminate()[0]![0]!),
    ).rejects.toThrow(/no longer valid/);
    // Not just the control characteristic — a stale handle is stale
    // whatever it points at.
    await expect(
      fake.write(SAMPLE_RATE_UUID, Uint8Array.from([0x03])),
    ).rejects.toThrow(/InvalidStateError/);

    fake.completeReconnect();
    await expect(
      fake.write(SAMPLE_RATE_UUID, Uint8Array.from([0x03])),
    ).resolves.toBeUndefined();
  });
});

describe("createFakeTransport: a multi-frame programming sequence", () => {
  it("acks each frame separately and only arms once the LAST frame acks", async () => {
    const multiFrameProgram: WorkoutProgram = {
      intervals: Array.from({ length: 5 }, () => ({
        kind: "time" as const,
        value: 60,
        targetSplit: 120,
        displaySpm: 22,
        restSeconds: 30,
      })),
    };
    const seq = buildProgrammingSequence(multiFrameProgram);
    expect(seq.length).toBeGreaterThan(1); // confirms this fixture really is multi-frame

    const fake = createFakeTransport({ program: multiFrameProgram });

    // Plan Task 2's clear step precedes programming — consumed here BEFORE
    // subscribing below, so this test's own ack/general-status counts stay
    // scoped to the PROGRAM sequence exactly as before.
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }

    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));

    for (const frame of seq.slice(0, -1)) {
      for (const chunk of frame)
        await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(acks).toHaveLength(seq.length - 1);
    expect(acks.every((a) => a.status === "ok")).toBe(true);
    expect(generals).toHaveLength(0); // not armed yet — the last frame hasn't acked

    for (const chunk of seq[seq.length - 1]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(acks).toHaveLength(seq.length);
    expect(generals).toHaveLength(0); // acked, but armed delivery is withheld until a tick (fix-round 1, F1)
    fake.deliverArmedNow();
    expect(generals).toHaveLength(1); // armed now
  });
});
