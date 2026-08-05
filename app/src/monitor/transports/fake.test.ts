import { describe, expect, it, vi } from "vitest";
import {
  buildProgrammingSequence,
  buildTerminate,
} from "../../../domain/monitor/pm5/commands.js";
import {
  parseGeneralStatus,
  WORKOUTSTATE_INTERVALWORKTIME,
  WORKOUTSTATE_TERMINATE,
  WORKOUTSTATE_WAITTOBEGIN,
} from "../../../domain/monitor/pm5/parse.js";
import { parseCsafeResponse } from "../../../domain/monitor/pm5/response.js";
import {
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
    intervalIndex: 0,
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
  for (const chunk of buildProgrammingSequence(program)[0]!) {
    await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
  }
}

function decodeGeneral(bytes: Uint8Array) {
  const decoded = parseGeneralStatus(bytes);
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
    const [frame] = buildProgrammingSequence(PROGRAM);
    const corrupted = Uint8Array.from(frame![0]!);
    corrupted[2] = (corrupted[2]! ^ 0xff) & 0xff;
    await expect(
      fake.write(RECEIVE_CHARACTERISTIC_UUID, corrupted),
    ).rejects.toThrow(/mismatch/);
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
    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));

    await programIt(fake, PROGRAM);
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ status: "reject" });
    // Never armed: no WAITTOBEGIN bundle should have been sent.
    expect(generals).toHaveLength(0);
  });

  it("injectNak targeting a frame index that never occurs leaves every real ack as 'ok'", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    fake.injectNak(7); // this program only ever reaches frame 0
    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    await programIt(fake, PROGRAM);
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

  it("delivers the WAITTOBEGIN bundle immediately once the sequence acks successfully", async () => {
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
          intervalIndex: 0,
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
    expect(generals).toHaveLength(1); // armed now
  });
});
