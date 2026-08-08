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
  WORKOUTSTATE_REARM,
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
  // phase expects the SAME `buildTerminate()` bytes first, ACCEPTS them
  // (fix-3 Task 3, §18 s3 item 15) and advances to `"programming"`. The
  // fakes driven through this helper are all idle at that moment, so the
  // accept starts no auto-cycle (`queueTerminateAutoCycle`) either.
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

  it("a MULTI-frame sequence refused mid-way is retried from frame 0 and completes — the prepare step is the reset point (review MED-1)", async () => {
    // Task 6 fix round. The refused-frame position is reset by the PREPARE
    // step, not by the refusal: `program()` always leads with a terminate
    // and then re-sends its whole sequence from frame 0, so that is where
    // the machine's expectation has to go back to. An earlier version
    // rewound only to the start of the REFUSED FRAME, which is identical
    // for a one-frame program (every other test here) and wrong for
    // anything longer: this exact scenario threw
    // `programming chunk 12 mismatch` on the retry's very first chunk.
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
    expect(seq).toHaveLength(4);

    const fake = createFakeTransport({ program: multiFrameProgram });
    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    const sendPrepare = async (): Promise<void> => {
      for (const chunk of buildTerminate()[0]!) {
        await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
      }
    };
    const sendFrames = async (count: number): Promise<void> => {
      for (const frame of seq.slice(0, count)) {
        for (const chunk of frame) {
          await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
        }
      }
    };

    // Attempt 1: refused at frame 2, three frames in.
    fake.injectNak(2);
    await sendPrepare();
    await sendFrames(3);
    expect(acks.map(frameStatusOf)).toStrictEqual([
      "ok", // the prepare step — ACCEPTED (§18 s3 item 15)
      "ok",
      "ok",
      "reject", // frame 2
    ]);

    // Attempt 2: a real `program()` retry — prepare, then the WHOLE
    // sequence again from frame 0. (`injectNak(9)` names a frame index this
    // sequence never reaches, the same disarming idiom the sibling test
    // above uses, so the retry is allowed to finish.)
    fake.injectNak(9);
    await sendPrepare();
    await sendFrames(4);

    expect(acks.slice(4).map(frameStatusOf)).toStrictEqual([
      "ok", // prepare again — accepted again
      "ok",
      "ok",
      "ok",
      "ok", // frame 2 re-sent and accepted, then frame 3: the sequence completes
    ]);
    fake.deliverArmedNow();
    expect(fake.loadedIntervals()).toBe(multiFrameProgram.intervals.length);
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

  it("a refused frame can be re-sent behind another prepare step, and injectNak still names it (sticky)", async () => {
    // Task 6: a refusal is not the end of the conversation — every laptop
    // session retried refused programs (interface-notes.md §19.1's table is
    // largely retries). The retry's own prepare step resets the sequence
    // position, so frame 0 is expected again; `injectNak`'s positional
    // selector still names frame 0, so it meets the same answer. Before
    // this the cursor was left past the refused frame's chunks and any
    // further write threw.
    const fake = createFakeTransport({ program: PROGRAM });
    fake.injectNak(0);
    await programIt(fake, PROGRAM);

    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    // A whole second attempt: prepare step (accepted, §18 s3 item 15),
    // then the same frame again (refused again — `injectNak` is sticky).
    await programIt(fake, PROGRAM);
    expect(acks.map(frameStatusOf)).toStrictEqual(["ok", "reject"]);

    // A chunk that belongs to neither sequence still throws, and at the
    // position the machine is genuinely at: the refusal itself rewinds
    // nothing (this program's two chunks have both arrived), and only a
    // prepare step puts the sequence back to frame 0.
    await expect(
      fake.write(RECEIVE_CHARACTERISTIC_UUID, Uint8Array.from([0xff])),
    ).rejects.toThrow(/programming chunk 2 mismatch/);
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

  it("the armed reading is a LEVEL, not a one-shot: a tick that lands before anyone subscribes does NOT consume it (fix wave F-CRIT)", async () => {
    // The exact race `e2e/connected.spec.ts` hit 100% of the time.
    // `transports/index.ts`'s `autoTicking` pump (100ms) fires while
    // `program()` is still suspended on a `delayWrites(120)` write, i.e.
    // AFTER the last frame's synchronous ack but BEFORE `driver.ts`'s
    // `verifyArmed()` has registered its listener. With a one-shot flush
    // that tick swallowed the only "armed" notification the fake would
    // ever send, and `verifyArmed` ran its whole 20-tick budget against a
    // silent machine. A level cannot be swallowed.
    const fake = createFakeTransport({ program: PROGRAM });
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    for (const chunk of buildProgrammingSequence(PROGRAM)[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    // The unrelated pump, landing in the gap — nobody is listening yet.
    fake.tick(0);
    // NOW the listener registers, exactly as `verifyArmed()` does.
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    fake.tick(0);
    fake.tick(0);
    expect(generals.map((b) => decodeGeneral(b).workoutState)).toStrictEqual([
      WORKOUTSTATE_WAITTOBEGIN,
      WORKOUTSTATE_WAITTOBEGIN,
    ]);
  });

  it("one 0x0031 reading per tick, including the tick that first reports the arm — the repeat never doubles up with the F1 first report", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    for (const chunk of buildProgrammingSequence(PROGRAM)[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    fake.tick(0);
    expect(generals).toHaveLength(1); // the F1 first report, not it plus a repeat
    fake.tick(0);
    expect(generals).toHaveLength(2);
  });

  it("the FIRST armed report precedes a scripted event that is due on the same tick — a timeline's opening entry never lands ahead of the arm (fix-round 1, F1's ordering half)", async () => {
    // The level alone is not enough. A script whose very first entry is
    // already due on the first tick after the accept would otherwise take
    // that tick's single 0x0031 reading for itself, dropping the level
    // (`deliverOrCache`) before the arm was ever reported at all — and
    // `driver.ts`'s `verifyArmed()` would wait out its whole budget on a
    // machine that had moved on. So the first report is unconditional and
    // goes out FIRST; only the repeats yield.
    const fake = createFakeTransport({
      program: PROGRAM,
      events: [
        {
          atMs: 0,
          kind: "status",
          workoutState: WORKOUTSTATE_INTERVALWORKTIME,
          elapsedSeconds: 5,
          distanceMeters: 20,
          spm: 24,
          currentSplit: 110,
          heartRateBpm: 140,
          programIntervalIndex: 0,
        },
      ],
    });
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    for (const chunk of buildProgrammingSequence(PROGRAM)[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    fake.tick(0);
    expect(generals.map((b) => decodeGeneral(b).workoutState)).toStrictEqual([
      WORKOUTSTATE_WAITTOBEGIN,
      WORKOUTSTATE_INTERVALWORKTIME,
    ]);
  });

  it("the armed level DROPS the moment a new programming sequence begins — a stale arm can never be re-reported into the next send (fix wave F-CRIT, driver.ts's F1 pins)", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    await programIt(fake, PROGRAM);
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    // A SECOND program lands over the first. Its prepare step is where the
    // next sequence begins (`beginProgrammingSequence`), so from that byte
    // on the machine reports nothing armed until the new sequence accepts —
    // the single TERMINATE status below is the prepare's own documented
    // reaction (`onArmedFrameComplete`), and no tick after it repeats an
    // arm the machine is no longer holding.
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    fake.tick(0);
    fake.tick(0);
    expect(generals.map((b) => decodeGeneral(b).workoutState)).toStrictEqual([
      WORKOUTSTATE_TERMINATE,
    ]);
    // …and the arm comes back the moment the new sequence accepts.
    for (const chunk of buildProgrammingSequence(PROGRAM)[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    fake.tick(0);
    expect(generals.map((b) => decodeGeneral(b).workoutState)).toStrictEqual([
      WORKOUTSTATE_TERMINATE,
      WORKOUTSTATE_WAITTOBEGIN,
    ]);
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

  it("delivers no SCHEDULED event before its atMs is reached — the ticks in between carry the armed LEVEL, repeated (fix wave F-CRIT)", async () => {
    const fake = createFakeTransport({ program: PROGRAM, events });
    await programIt(fake, PROGRAM);
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    // Three ticks, none of them reaching the first scheduled event at
    // 1000ms. Nothing from the SCRIPT goes out — but the machine is
    // holding an un-pulled program and says so on every one of them, which
    // is what a real PM5 does at its configured sample rate. Modelling
    // this as a single edge is what let an unrelated pump consume the
    // one-and-only "armed" reading before `driver.ts`'s `verifyArmed()`
    // registered (`fake.ts`'s `armedLevel`).
    fake.tick(300);
    fake.tick(300);
    fake.tick(300);
    expect(generals).toHaveLength(3);
    expect(generals.map((b) => decodeGeneral(b).workoutState)).toStrictEqual([
      WORKOUTSTATE_WAITTOBEGIN,
      WORKOUTSTATE_WAITTOBEGIN,
      WORKOUTSTATE_WAITTOBEGIN,
    ]);
    // …and the scripted event at 1000ms REPLACES the repeat on the tick it
    // becomes due — one 0x0031 reading per tick, never two.
    fake.tick(300);
    expect(generals).toHaveLength(4);
    expect(decodeGeneral(generals[3]!).workoutState).toBe(
      WORKOUTSTATE_INTERVALWORKTIME,
    );
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

  it("the armed LEVEL is suppressed while disconnected too, and completeReconnect flushes 'still armed' (fix wave F-CRIT)", async () => {
    // No timeline at all: the machine is armed and the rower has not
    // pulled, so the only thing it has to say is the arm — which it goes on
    // holding while the radio is down, and reports as its next status frame
    // the moment the link is back. Same rule `deliverOrCache` applies to a
    // scripted status; the level must not notify straight through
    // `linkDown` just because it is generated inside the fake rather than
    // read off a script.
    const fake = createFakeTransport({ program: PROGRAM });
    await programIt(fake, PROGRAM);
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    fake.injectDisconnect();
    fake.tick(500);
    fake.tick(500);
    expect(generals).toHaveLength(0);
    fake.completeReconnect();
    expect(generals.map((b) => decodeGeneral(b).workoutState)).toStrictEqual([
      WORKOUTSTATE_WAITTOBEGIN,
    ]);
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

  it("a fake with nothing loaded reports nothing loaded, and ACCEPTS the prepare step anyway (§18 s3 item 15: the captured byte is an accept)", async () => {
    // Fix-3 Task 3. This test asserted `["reject"]` until item 15 captured
    // the byte the refusal rested on — a standalone terminate sent to a
    // machine with nothing running acked `f1 81 76 01 13 e5 f2`:
    // toggle-high, previous-frame OK, slave READY. An ACCEPT. The
    // nothing-loaded refusal was the last behaviour in this fake sourced
    // from the withdrawn whole-byte parse, and it never existed.
    const fake = createFakeTransport({ program: PROGRAM });
    expect(fake.loadedIntervals()).toBeNull();

    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(acks.map(frameStatusOf)).toStrictEqual(["ok"]);
    // Item 15's DECODE, all three fields, not merely a status class that
    // parses as an accept: its `f1 81 76 01 13 e5 f2` decodes to
    // previous-frame-OK + slave READY + frame-toggle. The toggle is the one
    // field that cannot match here — this fake's toggle starts LOW and item
    // 15's byte was the high partner of a pair — so it is pinned as `false`
    // rather than glossed over ([CSAFE-DEF] p.11 Table 9: the toggle belongs
    // to the frame counter, never to the outcome).
    expect(acks[0]).toMatchObject({
      kind: "parsed",
      frameStatus: "ok",
      slaveState: "ready",
      frameToggle: false,
    });
    expect(fake.loadedIntervals()).toBeNull(); // terminate loads nothing
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
    // The terminate's OWN ack reports the state at the moment it arrived —
    // the machine was still rowing when it was handed the command.
    expect(stateOf(frames[2]!)).toBe("in-use");

    // But the ack AFTER that must not (review MED-3). This terminate made
    // the machine report WORKOUTSTATE_TERMINATE, and `currentSlaveState`'s
    // own contract puts a terminated machine in `ready`. Until the
    // `latestStatus` assignment was routed through `setLatestStatus`,
    // `machineState` never left `"rowing"` and every subsequent ack kept
    // claiming `in-use` — a wrong low nibble on the exact field this task
    // exists to make honest.
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    expect(frames).toHaveLength(4);
    expect(stateOf(frames[3]!)).toBe("ready");
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
describe("createFakeTransport: FakeScript.failNextProgramFrame — the two never-observed ack shapes", () => {
  it("'reject' answers the next PROGRAMMING frame with a genuine 0x11-class reject, and is spent afterwards", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      failNextProgramFrame: "reject",
    });
    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );

    await programIt(fake, PROGRAM);
    // The prepare step is untouched by the hook (its own doc comment):
    // it acks "ok" like every prepare does, and only the PROGRAMMING
    // frame behind it is refused. (`refuseNextPrepare` is the hook that
    // reaches the other one.)
    expect(acks.map(frameStatusOf)).toStrictEqual(["ok", "reject"]);
    // A genuine reject, not the `0x81` that never meant one: bits 4-5 say
    // Reject, and the toggle is still just the toggle.
    expect(acks[1]).toMatchObject({
      kind: "parsed",
      frameStatus: "reject",
      frameToggle: true,
    });

    // One-shot: the retry of the very same frame is accepted.
    await programIt(fake, PROGRAM);
    expect(acks.map(frameStatusOf)).toStrictEqual([
      "ok", // prepare — accepted
      "reject", // the program: failNextProgramFrame, consumed here
      "ok", // prepare again — accepted again
      "ok", // the program lands
    ]);
    expect(fake.loadedIntervals()).toBe(PROGRAM.intervals.length);
  });

  it("'garbled' answers with a frame that cannot be parsed AT ALL — structurally different from any reject", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      failNextProgramFrame: "garbled",
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
      failNextProgramFrame: "reject",
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
      failNextProgramFrame: "garbled",
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

// Fix-3 Task 3 (design spec §1c/§1d, interface-notes.md §18 session 3).
// Until this task the fake's `onClearingFrameComplete` acked the prepare
// step and changed NOTHING — no transition, no status — while the hardware
// visibly ran terminate → idle → armed off the same wire command in every
// mid-session arm it recorded. That gap is why CI could see neither the
// empty arm (§19.13) nor the settle that prevents it.
describe("createFakeTransport: the prepare step's own machine reaction (§18 session 3)", () => {
  /** A machine mid-piece: one rowing status tick, due immediately. */
  function rowingAt(atMs: number, elapsedSeconds: number): FakeTimelineEvent {
    return {
      atMs,
      kind: "status",
      workoutState: WORKOUTSTATE_INTERVALWORKTIME,
      elapsedSeconds,
      distanceMeters: elapsedSeconds * 4,
      spm: 24,
      currentSplit: 120,
      heartRateBpm: 140,
      programIntervalIndex: 0,
    };
  }

  async function sendPrepare(
    fake: ReturnType<typeof createFakeTransport>,
  ): Promise<void> {
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
  }

  async function sendProgram(
    fake: ReturnType<typeof createFakeTransport>,
    program: WorkoutProgram,
  ): Promise<void> {
    for (const frame of buildProgrammingSequence(program)) {
      for (const chunk of frame) {
        await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
      }
    }
  }

  it("a prepare landing on a RUNNING machine reports TERMINATE and then walks Rearm → WaitToBegin, one status tick each (today: acks and changes nothing)", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      events: [rowingAt(0, 10)],
    });
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));

    fake.tick(0);
    expect(decodeGeneral(generals[0]!).workoutState).toBe(
      WORKOUTSTATE_INTERVALWORKTIME,
    );

    await sendPrepare(fake);
    // The ack is immediate; the machine's REACTION is not. It arrives on
    // the same 0x0031 pulse as everything else this machine says, which is
    // precisely the window `driver.ts`'s settle exists to wait out.
    expect(generals).toHaveLength(1);

    fake.tick(0);
    fake.tick(0);
    fake.tick(0);
    expect(
      generals.slice(1).map((b) => decodeGeneral(b).workoutState),
    ).toStrictEqual([
      WORKOUTSTATE_TERMINATE,
      WORKOUTSTATE_REARM,
      WORKOUTSTATE_WAITTOBEGIN,
    ]);
    // Carried over from what the machine last reported, exactly as the
    // app's own explicit `terminate()` does (`synthesizeTerminated` is one
    // function with two callers): the terminate reading keeps the piece's
    // own elapsed/distance, and the re-arm zeroes them.
    expect(decodeGeneral(generals[1]!).elapsedSeconds).toBe(10);
    expect(decodeGeneral(generals[1]!).distanceMeters).toBe(40);
    expect(decodeGeneral(generals[3]!).elapsedSeconds).toBe(0);

    // Three states, not a heartbeat: the cycle has drained and the machine
    // has nothing further to say on its own.
    fake.tick(0);
    expect(generals).toHaveLength(4);
  });

  it("a prepare landing on an IDLE machine is a plain accept — no transition, no cycle (§18 s3 item 15's captured byte)", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));

    await sendPrepare(fake);

    expect(acks.map(frameStatusOf)).toStrictEqual(["ok"]);
    expect(generals).toHaveLength(0);
    fake.tick(0);
    fake.tick(0);
    fake.tick(0);
    fake.tick(0);
    expect(generals).toHaveLength(0);
  });

  it("refuseNextPrepare answers ONE prepare with a genuine reject and changes nothing on the machine; the next prepare acks and cycles normally", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      refuseNextPrepare: true,
      events: [rowingAt(0, 10)],
    });
    const acks: ReturnType<typeof parseCsafeResponse>[] = [];
    fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) =>
      acks.push(parseCsafeResponse(b)),
    );
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));

    fake.tick(0);
    await sendPrepare(fake);
    expect(acks.map(frameStatusOf)).toStrictEqual(["reject"]);
    // A refusal means the machine did not act: no terminate reading, no
    // auto-cycle, however long the master waits.
    fake.tick(0);
    fake.tick(0);
    fake.tick(0);
    expect(generals).toHaveLength(1);
    expect(decodeGeneral(generals[0]!).workoutState).toBe(
      WORKOUTSTATE_INTERVALWORKTIME,
    );

    // One-shot. The retry's prepare is accepted, and NOW the machine reacts.
    await sendPrepare(fake);
    expect(acks.map(frameStatusOf)).toStrictEqual(["reject", "ok"]);
    fake.tick(0);
    fake.tick(0);
    fake.tick(0);
    expect(
      generals.slice(1).map((b) => decodeGeneral(b).workoutState),
    ).toStrictEqual([
      WORKOUTSTATE_TERMINATE,
      WORKOUTSTATE_REARM,
      WORKOUTSTATE_WAITTOBEGIN,
    ]);
  });

  it("§19.13 THE EMPTY ARM: programming frames that land while the machine is STILL rowing arm zero intervals, and no boundary is ever reported for that program", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      events: [rowingAt(0, 10), TIMELINE_EVENTS[1]!],
    });
    const splits: Uint8Array[] = [];
    fake.subscribe(SPLIT_INTERVAL_DATA_UUID, (b) => splits.push(b));
    fake.subscribe(ADDITIONAL_SPLIT_INTERVAL_DATA_UUID, (b) => splits.push(b));
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));

    fake.tick(0);
    // No tick between the prepare and the frames: the whole sequence lands
    // inside the machine's own reaction window, exactly as it did on
    // hardware (§19.13's REPRO — `{"kind":"terminated"}` fired MID-send).
    await sendPrepare(fake);
    await sendProgram(fake, PROGRAM);

    // It ARMED — every checkpoint this codec reads says success — holding a
    // workout with nothing in it. `0`, never `null`: something is loaded.
    expect(fake.loadedIntervals()).toBe(0);

    // §19.13's headline is "armed AND empty" — the arm half needs pinning
    // too (review LOW-1), or a fake that suppressed the arm outright would
    // satisfy every other assertion here and only be caught downstream as
    // a five-second hang.
    fake.deliverArmedNow();
    expect(
      generals.slice(1).map((b) => decodeGeneral(b).workoutState),
    ).toStrictEqual([WORKOUTSTATE_WAITTOBEGIN]);

    // Fix-3 Task 5: the WIRE now says so too — SESSION 4a's own captured
    // empty-arm anatomy (`workoutType=1 durationRaw=0 durationType=128`),
    // NOT `PROGRAM`'s real structure (`{8, 6000, 0}`, `60s -> 6000` — what
    // this exact fixture reported before this task, and what a fake calling
    // the driver's own predictor would still report today, since an empty
    // arm is invisible to `expectedArmedStructure` — it only ever sees the
    // program actually sent). This is the reading `driver.ts`'s
    // `verifyArmed` now catches end to end.
    expect(decodeGeneral(generals[1]!)).toMatchObject({
      workoutType: 1,
      workoutDurationRaw: 0,
      workoutDurationType: 128,
    });

    // Rowed past the scripted boundary: nothing on either characteristic,
    // ever (hardware: 108.4 m past a 100 m interval, no boundary at all).
    fake.tick(5000);
    expect(splits).toStrictEqual([]);
  });

  it("the SAME frames sent to a machine that has finished its cycle arm the real program, boundaries and all — the key is the machine's state", async () => {
    const fake = createFakeTransport({
      program: PROGRAM,
      events: [rowingAt(0, 10), TIMELINE_EVENTS[1]!],
    });
    const splits: Uint8Array[] = [];
    fake.subscribe(SPLIT_INTERVAL_DATA_UUID, (b) => splits.push(b));

    fake.tick(0);
    await sendPrepare(fake);
    // Three ticks: the machine walks terminated → idle → armed and is done
    // reacting before the first programming chunk goes out — which is what
    // `driver.ts`'s prepare-settle wait buys on real hardware.
    fake.tick(0);
    fake.tick(0);
    fake.tick(0);
    await sendProgram(fake, PROGRAM);

    expect(fake.loadedIntervals()).toBe(PROGRAM.intervals.length);
    fake.deliverArmedNow();
    fake.tick(5000);
    expect(splits).toHaveLength(1);
  });

  it("a bare programming sequence behind an explicit terminate() does NOT inherit a previous empty arm (review LOW-3/I-7)", async () => {
    // `onArmedFrameComplete` deliberately rewinds `phase` and both
    // programming cursors so a whole new sequence can follow the app's own
    // `terminate()` with no prepare in front of it. The empty-arm flag has
    // to be rewound with them, or the machine stays poisoned by a sequence
    // that finished before the terminate — a state no hardware reading
    // supports, and one that would silently make a future test arm empty
    // for the wrong reason.
    const fake = createFakeTransport({
      program: PROGRAM,
      events: [rowingAt(0, 10)],
    });

    fake.tick(0);
    await sendPrepare(fake);
    await sendProgram(fake, PROGRAM); // lands while rowing: arms EMPTY
    expect(fake.loadedIntervals()).toBe(0);
    fake.deliverArmedNow();

    // An explicit terminate() — the machine now reads `terminated`, and is
    // programmable again (§19.4/§19.5).
    for (const chunk of buildTerminate()[0]!) {
      await fake.write(RECEIVE_CHARACTERISTIC_UUID, chunk);
    }
    await sendProgram(fake, PROGRAM);

    expect(fake.loadedIntervals()).toBe(PROGRAM.intervals.length);
  });

  it("the empty arm is keyed on the machine's STATE, not on how soon the frames arrive: any number of ticks can pass and a still-rowing machine still arms empty", async () => {
    // The tick-counted trigger this rules out would be modelling
    // `driver.ts`'s settle budget (the fix) instead of the machine (the
    // defect). A REFUSED prepare leaves the machine running — it never
    // acted — so the master can wait as long as it likes and the frames
    // still land on a rowing piece.
    const fake = createFakeTransport({
      program: PROGRAM,
      refuseNextPrepare: true,
      events: [
        rowingAt(0, 10),
        rowingAt(100, 12),
        rowingAt(200, 14),
        rowingAt(300, 16),
        rowingAt(400, 18),
      ],
    });

    fake.tick(0);
    await sendPrepare(fake);
    // FOUR ticks — more than the auto-cycle's own three, so a trigger that
    // counted ticks instead of reading the state would have "settled" by
    // now and armed this program for real.
    fake.tick(100);
    fake.tick(100);
    fake.tick(100);
    fake.tick(100);
    await sendProgram(fake, PROGRAM);

    expect(fake.loadedIntervals()).toBe(0);
  });
});

describe("createFakeTransport: fix-3 Task 5 — 0x0031 carries structure, independently of the driver's own prediction", () => {
  it("a TIME program's WAITTOBEGIN bundle reads back seconds x 100 at duration identifier 0 (60s -> 6000, SESSION 4a's TIME row)", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    await programIt(fake, PROGRAM);
    expect(decodeGeneral(generals[0]!)).toMatchObject({
      workoutType: 8,
      workoutDurationRaw: 6000,
      workoutDurationType: 0,
    });
  });

  it("a DISTANCE program's WAITTOBEGIN bundle reads back WHOLE METRES at duration identifier 128 (500 -> 500, SESSION 4a's DISTANCE row)", async () => {
    const fake = createFakeTransport({ program: DISTANCE_PROGRAM });
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    await programIt(fake, DISTANCE_PROGRAM);
    expect(decodeGeneral(generals[0]!)).toMatchObject({
      workoutType: 8,
      workoutDurationRaw: 500,
      workoutDurationType: 128,
    });
  });

  it("a script that never calls program() at all reports script.program's OWN structure throughout — the pre-loaded fallback stays exactly what it was", async () => {
    // No `programIt` call anywhere here: `deliverStatus` is reached purely
    // through the scripted timeline, never through an accept.
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
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    fake.tick(100);
    expect(decodeGeneral(generals[0]!)).toMatchObject({
      workoutType: 8,
      workoutDurationRaw: 500,
      workoutDurationType: 128,
    });
  });

  it("FakeScript.lagStructureOneTick: the WAITTOBEGIN bundle right after an accept carries the PRIOR structure once, then the true one from the next tick on (SESSION 4a's recorded mid-cycle transients)", async () => {
    // This fake's FIRST-ever arm: nothing has armed before it, so the
    // "prior" structure it lags on is SESSION 4a's own pre-arm baseline
    // (`workoutType=0 durationRaw=0 durationType=128`), not a zero of this
    // test's own invention.
    const fake = createFakeTransport({
      program: PROGRAM,
      lagStructureOneTick: true,
      events: [
        {
          atMs: 1,
          kind: "status",
          workoutState: WORKOUTSTATE_WAITTOBEGIN,
          elapsedSeconds: 0,
          distanceMeters: 0,
          spm: 0,
          currentSplit: 0,
          heartRateBpm: null,
          programIntervalIndex: 0,
        },
      ],
    });
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    await programIt(fake, PROGRAM); // consumes the lag via deliverArmedNow()

    expect(decodeGeneral(generals[0]!)).toMatchObject({
      workoutType: 0,
      workoutDurationRaw: 0,
      workoutDurationType: 128,
    });

    fake.tick(1); // the scripted second WaitToBegin tick — the lag is spent
    expect(decodeGeneral(generals[1]!)).toMatchObject({
      workoutType: 8,
      workoutDurationRaw: 6000,
      workoutDurationType: 0,
    });
  });

  it("FakeScript.lagStructureOneTick OMITTED (the default): the very first armed tick already carries the true structure — every other fake-driven test in this repo depends on this", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const generals: Uint8Array[] = [];
    fake.subscribe(GENERAL_STATUS_UUID, (b) => generals.push(b));
    await programIt(fake, PROGRAM);
    expect(decodeGeneral(generals[0]!)).toMatchObject({
      workoutType: 8,
      workoutDurationRaw: 6000,
      workoutDurationType: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Task 8: the timing-realism knobs (task-5 re-review, MEDIUM-9/LOW-8)
// ---------------------------------------------------------------------------

describe("createFakeTransport: delayWrites — the promise, not the wire, is what's delayed", () => {
  it("defaults to instant (same-microtask) settlement, unchanged from before this knob existed", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    let settled = false;
    void fake.connect("fake-pm5").then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(true);
  });

  it("connect() does not resolve until the configured delay elapses", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeTransport({ program: PROGRAM });
      fake.delayWrites(500);
      let settled = false;
      void fake.connect("fake-pm5").then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(499);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("write() does not resolve until the configured delay elapses, but still processes the frame (acks, cursor advances) SYNCHRONOUSLY at call time", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeTransport({ program: PROGRAM });
      fake.delayWrites(300);
      const acks: Uint8Array[] = [];
      fake.subscribe(TRANSMIT_CHARACTERISTIC_UUID, (b) => acks.push(b));
      let settled = false;
      void fake
        .write(RECEIVE_CHARACTERISTIC_UUID, buildTerminate()[0]![0]!)
        .then(() => {
          settled = true;
        });
      // The ack for a clearing-phase frame only fires once the WHOLE frame
      // has reassembled (`onClearingFrameComplete`) — `buildTerminate()`'s
      // single chunk is the whole frame, so this one write is enough to
      // prove the point: the ack lands before any real time has passed at
      // all, independent of `delayWrites`.
      expect(acks.length).toBeGreaterThan(0);
      // Flushed WITHOUT advancing the fake clock — proves `settled` reads
      // `false` because of the CONFIGURED DELAY, not merely because the
      // `.then()` callback above has not had a turn yet (a same-microtask
      // `write()` resolution — the actual bug this pin caught: `write()`'s
      // own implementation called `Promise.resolve()` directly rather than
      // `settleWrite()`, so this exact assertion PASSED anyway with ZERO
      // real delay, for a reason having nothing to do with `delayWrites` —
      // flushing every pending microtask first, with the clock held still,
      // is what actually tells the two apart. `advanceTimersByTimeAsync(0)`,
      // not a bare `await Promise.resolve()`: vitest's own fake-timer
      // microtask flush needs its OWN async tick loop to drain an
      // `async function`'s implicit Promise-wrapping hops — a couple of
      // bare `await Promise.resolve()`s measured directly here were not
      // enough to surface the mutation this pin exists to catch.
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(300);
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a rejected write() (a genuine byte mismatch) is NOT delayed — only a successful settlement is", async () => {
    const fake = createFakeTransport({ program: PROGRAM });
    fake.delayWrites(10_000);
    await expect(
      fake.write(RECEIVE_CHARACTERISTIC_UUID, Uint8Array.from([0xff])),
    ).rejects.toThrow();
  });
});

describe("createFakeTransport: subscriptionCount", () => {
  it("starts at zero", () => {
    const fake = createFakeTransport({ program: PROGRAM });
    expect(fake.subscriptionCount()).toBe(0);
  });

  it("counts one per live subscribe() call, summed across characteristics, and drops back to zero once every unsubscribe fires", () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const unsubA = fake.subscribe(GENERAL_STATUS_UUID, () => undefined);
    expect(fake.subscriptionCount()).toBe(1);
    const unsubB = fake.subscribe(ADDITIONAL_STATUS_1_UUID, () => undefined);
    expect(fake.subscriptionCount()).toBe(2);
    // A SECOND callback on the SAME characteristic is a distinct
    // subscription (a `Set`, not a single slot) — `driver.ts` itself never
    // double-subscribes one characteristic, but this method's own contract
    // (its doc comment) is general, not driver-specific.
    const unsubC = fake.subscribe(GENERAL_STATUS_UUID, () => undefined);
    expect(fake.subscriptionCount()).toBe(3);
    unsubA();
    expect(fake.subscriptionCount()).toBe(2);
    unsubB();
    unsubC();
    expect(fake.subscriptionCount()).toBe(0);
  });

  it("calling the SAME unsubscribe function twice never goes negative", () => {
    const fake = createFakeTransport({ program: PROGRAM });
    const unsub = fake.subscribe(GENERAL_STATUS_UUID, () => undefined);
    unsub();
    unsub();
    expect(fake.subscriptionCount()).toBe(0);
  });
});
