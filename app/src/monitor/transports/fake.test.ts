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
import { parseFrame } from "../../../domain/monitor/csafe.js";
import {
  echoedCommandIds,
  parseCsafeResponse,
  type CsafeResponse,
} from "../../../domain/monitor/pm5/response.js";
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

/** Phase 7A-fix-2, Task 2 (pm5/response.ts §19.1): `parseCsafeResponse` no
 *  longer returns a `status` field — a response is either `{kind: "parsed",
 *  frameStatus, ...}` or `{kind: "unparseable"}`. This file's own acks are
 *  always well-formed (the fake builds them with `buildAckFrame`), so every
 *  call site below is safe to read `frameStatus` off directly; this helper
 *  exists only to keep the many `.map`/`.every` call sites below readable. */
function frameStatusOf(response: CsafeResponse): string {
  return response.kind === "parsed" ? response.frameStatus : "unparseable";
}

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
  // Plan Task 2 (renamed by Phase 7A-fix-2 Task 3): `program()`'s own
  // best-effort PREPARE step precedes the real programming sequence
  // (`src/monitor/driver.ts`'s `sendPrepare()`) — the fake's `"clearing"`
  // phase expects the SAME `buildTerminate()` bytes first, always
  // rejecting before advancing to `"programming"`.
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

/** The whole CSAFE frame a pre-chunked sequence entry reassembles into —
 *  what the machine acks, and what `echoedCommandIds` reads. */
function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const frame = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    frame.set(chunk, offset);
    offset += chunk.length;
  }
  return frame;
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
    expect(acks[0]).toMatchObject({ kind: "parsed", frameStatus: "ok" });
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
    expect(acks[0]).toMatchObject({ kind: "parsed", frameStatus: "reject" });
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
    expect(acks[0]).toMatchObject({ kind: "parsed", frameStatus: "ok" });
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
    expect(acks.map(frameStatusOf)).toStrictEqual(["ok", "ok", "reject"]);
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

  it("a rejected frame rewinds to ITSELF, not past the end — the retry re-sends the same bytes and is rejected again (injectNak is sticky)", async () => {
    // Task 6: a refusal is not the end of the conversation. The chunk
    // cursor goes back to the START of the frame that was refused (every
    // laptop session retried refused programs, interface-notes.md §19.1),
    // and `injectNak`'s positional selector still names that frame, so the
    // retry meets the same answer. Before this the cursor was left past the
    // frame's own chunks and any further write threw.
    const fake = createFakeTransport({ program: PROGRAM });
    fake.injectNak(0);
    await programIt(fake, PROGRAM);

    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    // A whole second attempt: prepare step, then the same frame again.
    await programIt(fake, PROGRAM);
    expect(acks.map(frameStatusOf)).toStrictEqual(["reject", "reject"]);

    // A chunk that belongs to neither sequence still throws, at the frame
    // the machine is actually waiting for.
    await expect(
      fake.write(RECEIVE_CHARACTERISTIC_UUID, Uint8Array.from([0xff])),
    ).rejects.toThrow(/programming chunk 0 mismatch/);
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
    expect(acks[0]).toMatchObject({ kind: "parsed", frameStatus: "ok" });
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

  /** The same program with its rests removed — the ONLY shape in which a
   *  boundary can legitimately be delivered while the state word still
   *  reads "rowing" (§17 item 13's own open question). The fake enforces
   *  this: see `boundaryBundle`'s guard. */
  const TWO_INTERVALS_NO_REST: WorkoutProgram = {
    intervals: TWO_INTERVALS.intervals.map((i) => ({ ...i, restSeconds: 0 })),
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
    // `restSeconds: 0`, and now REQUIRED to be: a rowing boundary on an
    // interval that HAS a trailing rest describes a machine that has never
    // existed, and the fake throws rather than quietly identity-numbering
    // it. The no-rest shape is the only one where a rowing boundary is
    // real — which is exactly why §17 item 13 is still open.
    const fake = createFakeTransport({
      program: TWO_INTERVALS_NO_REST,
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
    await programIt(fake, TWO_INTERVALS_NO_REST);

    const asSplits: Uint8Array[] = [];
    fake.subscribe(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, (b) =>
      asSplits.push(b),
    );
    fake.tick(200);

    expect(decodeAsSplit(asSplits[0]!).splitIntervalNumber).toBe(0);
  });

  it("REFUSES an impossible fixture: an interval with a trailing rest cannot report its boundary while the machine still reads 'rowing'", async () => {
    // The guard exists because the documented-only version of this rule was
    // already broken once, by this file's own suite (Task 4 review,
    // IMPORTANT-4). A fixture like this used to sail through and quietly
    // produce an identity-numbered wire value — a test "proving" the D3
    // normalization against bytes the hardware would never have sent.
    const fake = createFakeTransport({
      program: TWO_INTERVALS, // every interval has a 30s trailing rest
      events: [
        {
          atMs: 100,
          kind: "status",
          workoutState: WORKOUTSTATE_INTERVALWORKTIME, // not resting
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

    expect(() => fake.tick(200)).toThrow(/30s trailing rest/);
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

// D1 IS WITHDRAWN (interface-notes.md §19.2, on §19.1's per-send
// re-derivation table). This block used to assert the opposite of what it
// asserts now — that the fake rejected a program while something was loaded
// and destroyed what it held. Both halves were our own parse bug; §19.1's
// Verdict (b) established the replacement behaviourally.
describe("createFakeTransport: a machine with a workout already loaded ACCEPTS and REPLACES", () => {
  it("accepts the prepare step, accepts the program, and holds the NEW program afterwards (today: rejected, and the old one wiped)", async () => {
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
    // Accepted with something loaded (§19.1's `S2 D2`/`S2 D3` rows) — the
    // opposite of the clean-state case every other test in this file drives.
    expect(acks.map(frameStatusOf)).toStrictEqual(["ok"]);
    expect(fake.loadedIntervals()).toBe(3); // terminate routes to Rearm, §19.5

    for (const chunk of buildProgrammingSequence(PROGRAM)[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(acks.map(frameStatusOf)).toStrictEqual(["ok", "ok"]);
    // Replaced, not wiped: what the monitor holds is the program just sent.
    expect(fake.loadedIntervals()).toBe(PROGRAM.intervals.length);
    fake.deliverArmedNow();
    expect(generals).toHaveLength(1); // and it really did arm
  });

  it("a fake with nothing loaded reports nothing loaded, and rejects the prepare step instead", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    expect(fake.loadedIntervals()).toBeNull();

    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(acks.map(frameStatusOf)).toStrictEqual(["reject"]);
  });
});

// Phase 7A-fix-2 Task 6. Three facts about the STATUS BYTE and one about
// the echo, all of them things the pre-fix-2 fake got wrong, and all of
// them the reason the whole-byte compare survived in CI for so long.
describe("createFakeTransport: the ack's status byte is the bitfield the machine actually sends (interface-notes.md §19.1)", () => {
  /** [S2]'s own `program-two-time`: two TIME intervals with a trailing
   *  rest — the exact command SHAPE behind §19.1's captured 14-opcode ack
   *  (the echo carries opcodes, never parameter values, so the rest/pace
   *  numbers below do not enter into it). */
  const TWO_INTERVAL_PROGRAM: WorkoutProgram = {
    intervals: Array.from({ length: 2 }, () => ({
      kind: "time" as const,
      value: 60,
      targetSplit: 120,
      displaySpm: 22,
      restSeconds: 30,
    })),
  };

  /** Every raw ack frame the fake puts on 0x0022, in order — one
   *  subscription for the whole test, so a second `program()` keeps
   *  appending to the same list. */
  function collectAckFrames(
    fake: ReturnType<typeof createFakeTransport>,
  ): Uint8Array[] {
    const frames: Uint8Array[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) => frames.push(b));
    return frames;
  }

  async function drivePrepareAndProgram(
    fake: ReturnType<typeof createFakeTransport>,
    program: WorkoutProgram,
  ): Promise<void> {
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    for (const chunk of buildProgrammingSequence(program)[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
  }

  it("reproduces [S2] Dump 3's captured prepare+program ack pair BYTE FOR BYTE — toggle low then high, real opcode echoes", async () => {
    // The two frames §19.1's table records verbatim from `exportLog()`:
    //   f1 01 76 01 13 65 f2                      (the "clear-sent" ack)
    //   f1 81 76 0e 18 01 17 03 04 06 14
    //            18 17 03 04 06 14 13 eb f2       (the SetProgram ack)
    // Both are ACCEPTS. They differ in bit 7 because the toggle alternates,
    // and in their echo because they are acking different frames. The old
    // fake sent `f1 01 76 00 77 f2` for both.
    const fake = createFakeTransport({
      program: TWO_INTERVAL_PROGRAM,
      // As [S2] was: mid-session, with a workout already on the monitor —
      // which is why its prepare step acked "ok" rather than refusing.
      loadedWorkout: { intervalCount: 2 },
    });

    const frames = collectAckFrames(fake);
    await drivePrepareAndProgram(fake, TWO_INTERVAL_PROGRAM);

    expect(frames).toHaveLength(2);
    expect(Array.from(frames[0]!)).toStrictEqual([
      0xf1, 0x01, 0x76, 0x01, 0x13, 0x65, 0xf2,
    ]);
    expect(Array.from(frames[1]!)).toStrictEqual([
      0xf1, 0x81, 0x76, 0x0e, 0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18,
      0x17, 0x03, 0x04, 0x06, 0x14, 0x13, 0xeb, 0xf2,
    ]);
  });

  it("flips bit 7 on EVERY ack, so no two consecutive acks are the same frame (today: bit 7 is never set)", async () => {
    const fake = createFakeTransport({ program: TWO_INTERVAL_PROGRAM });
    const frames = collectAckFrames(fake);
    const togglesSoFar = (): (boolean | null)[] =>
      frames.map((f) => {
        const parsed = parseCsafeResponse(f);
        return parsed.kind === "parsed" ? parsed.frameToggle : null;
      });

    await drivePrepareAndProgram(fake, TWO_INTERVAL_PROGRAM);
    expect(togglesSoFar()).toStrictEqual([false, true]);

    // Keep going through a terminate and a whole second program: five acks,
    // strict alternation, never two alike in a row.
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    await drivePrepareAndProgram(fake, TWO_INTERVAL_PROGRAM);
    expect(togglesSoFar()).toStrictEqual([false, true, false, true, false]);
  });

  it("echoes the opcodes of the frame it is acking — the same list the request actually carried (today: an empty echo)", async () => {
    const fake = createFakeTransport({ program: TWO_INTERVAL_PROGRAM });
    const frames = collectAckFrames(fake);
    await drivePrepareAndProgram(fake, TWO_INTERVAL_PROGRAM);

    const sentPrepare = buildTerminate()[0]!;
    const sentProgram = buildProgrammingSequence(TWO_INTERVAL_PROGRAM)[0]!;
    const echoOf = (f: Uint8Array): number[] => {
      const parsed = parseCsafeResponse(f);
      return parsed.kind === "parsed" ? parsed.commandIds : [];
    };

    // Derived from what was SENT, not restated: the echo must match the
    // request's own command list.
    expect(echoOf(frames[0]!)).toStrictEqual(
      echoedCommandIds(joinChunks(sentPrepare)),
    );
    expect(echoOf(frames[1]!)).toStrictEqual(
      echoedCommandIds(joinChunks(sentProgram)),
    );
    // And independently, the literal shapes §19.1 captured: one opcode for
    // the terminate, fourteen for the 2-interval program.
    expect(echoOf(frames[0]!)).toStrictEqual([0x13]);
    expect(echoOf(frames[1]!)).toStrictEqual([
      0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x18, 0x17, 0x03, 0x04, 0x06,
      0x14, 0x13,
    ]);
  });

  it("a ONE-interval program's ack is the doc's own hand-verified 8-opcode shape", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const frames = collectAckFrames(fake);
    await drivePrepareAndProgram(fake, PROGRAM);
    const parsed = parseCsafeResponse(frames[1]!);
    expect(parsed).toMatchObject({
      kind: "parsed",
      commandIds: [0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x13],
    });
    // `f1 81 76 08 … f7 f2` — interface-notes.md's own hand-verified
    // checksum shape, at the toggle-high state this ack lands on.
    expect(Array.from(frames[1]!)).toStrictEqual([
      0xf1, 0x81, 0x76, 0x08, 0x18, 0x01, 0x17, 0x03, 0x04, 0x06, 0x14, 0x13,
      0xf7, 0xf2,
    ]);
  });

  it("carries slave state 'ready' while idle and 'in-use' while a workout is rowing (today: always ready)", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      events: [TIMELINE_EVENTS[0]!], // a rowing status tick at 1000ms
    });
    const frames = collectAckFrames(fake);
    await drivePrepareAndProgram(fake, PROGRAM);
    const stateOf = (f: Uint8Array): string => {
      const parsed = parseCsafeResponse(f);
      return parsed.kind === "parsed" ? parsed.slaveState : "unparseable";
    };
    // Programmed from idle: both acks read Ready, exactly as all eleven of
    // [S2]'s non-OFFLINE captures do.
    expect(frames.map(stateOf)).toStrictEqual(["ready", "ready"]);

    fake.tick(1000); // the erg is now rowing the workout it was given
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(stateOf(frames[2]!)).toBe("in-use");
  });

  it("scripting slaveState 'offline' models §19.3's live-erg capture: an ACCEPT with a non-Ready low nibble", async () => {
    // [S2] Dump 1, raw: `f1 09 76 0e … 63 f2` — status 0x09 from a
    // connected, responsive erg being rowed OUTSIDE master control
    // ([CSAFE-DEF] Figure 7 p.49). `(0x09 & 0x30) === 0x00`: an accept. A
    // whole-byte compare calls it a rejection.
    const fake = createFakeTransport({
      program: PROGRAM,
      slaveState: "offline",
      loadedWorkout: { intervalCount: 1 },
    });
    const frames = collectAckFrames(fake);
    await drivePrepareAndProgram(fake, PROGRAM);
    expect(parseCsafeResponse(frames[0]!)).toMatchObject({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "offline",
      frameToggle: false,
    });
    // The status byte itself: 0x09, the byte the machine sent.
    expect(frames[0]![1]).toBe(0x09);
  });
});

// SYNTHETIC, and the field says so at its own definition: not one of the
// twelve status bytes [S2] captured is a rejection, and nothing ever
// arrived unparseable (interface-notes.md §19.1). These hooks exist so the
// driver's reject and garbled paths can be exercised over real bytes.
describe("createFakeTransport: FakeScript.failNextWrite — the two never-observed ack shapes", () => {
  it("'reject' answers the next PROGRAMMING frame with a genuine 0x11-class reject, and is spent afterwards", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      failNextWrite: "reject",
    });
    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );

    await programIt(fake, PROGRAM);
    // The prepare step is untouched by the hook (its own doc comment): it
    // refuses because nothing is loaded, not because of `failNextWrite`.
    expect(acks.map(frameStatusOf)).toStrictEqual(["reject", "reject"]);
    // A genuine reject, not the `0x81` that never meant one: bits 4-5 say
    // Reject, and the toggle is still just the toggle.
    expect(acks[1]).toMatchObject({
      kind: "parsed",
      frameStatus: "reject",
      frameToggle: true,
    });

    // One-shot: the retry of the very same frame is accepted. (Its own
    // prepare step is refused again — nothing is loaded yet, which is a
    // statement about the machine, not about the spent hook.)
    await programIt(fake, PROGRAM);
    expect(acks.map(frameStatusOf)).toStrictEqual([
      "reject", // prepare — nothing loaded
      "reject", // the program: failNextWrite, consumed here
      "reject", // prepare again — still nothing loaded
      "ok", // the program lands
    ]);
    expect(fake.loadedIntervals()).toBe(PROGRAM.intervals.length);
  });

  it("'garbled' answers with a frame that cannot be parsed AT ALL — structurally different from any reject", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      failNextWrite: "garbled",
    });
    const raw: Uint8Array[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) => raw.push(b));

    await programIt(fake, PROGRAM);

    expect(raw).toHaveLength(2);
    expect(parseCsafeResponse(raw[1]!)).toStrictEqual({ kind: "unparseable" });
    // It really is a CHECKSUM failure, not a lost start/stop flag or an
    // unstuffing error: the frame still opens and closes correctly, and
    // `parseFrame` names the exact reason it will not have it.
    expect(raw[1]![0]).toBe(0xf1);
    expect(raw[1]![raw[1]!.length - 1]).toBe(0xf2);
    expect(parseFrame(raw[1]!)).toStrictEqual({
      error: { kind: "checksum-mismatch", received: 0x01, computed: 0x00 },
    });
    // And it is not merely a reject wearing a different hat: an ordinary
    // reject for the same frame parses fine.
    const cleanReject = createFakeTransport({
      program: PROGRAM,
      failNextWrite: "reject",
    });
    const rejectFrames: Uint8Array[] = [];
    cleanReject.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      rejectFrames.push(b),
    );
    await programIt(cleanReject, PROGRAM);
    expect(parseCsafeResponse(rejectFrames[1]!).kind).toBe("parsed");
  });

  it("'garbled' still consumes a toggle step — the PM's frame counter does not care whether the bytes survived", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      failNextWrite: "garbled",
    });
    const raw: Uint8Array[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) => raw.push(b));

    await programIt(fake, PROGRAM); // ack 0 (toggle false), garbled ack 1
    await programIt(fake, PROGRAM); // ack 2, ack 3

    const toggles = raw.map((f) => {
      const parsed = parseCsafeResponse(f);
      return parsed.kind === "parsed" ? parsed.frameToggle : "unparseable";
    });
    expect(toggles).toStrictEqual([false, "unparseable", false, true]);
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
    expect(acks.every((a) => frameStatusOf(a) === "ok")).toBe(true);
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
