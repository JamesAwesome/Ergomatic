import { describe, expect, it } from "vitest";
import { phases as expandPhases } from "../../expand.js";
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index.js";
import {
  compileProgram,
  type CompiledPhase,
  type WorkoutProgram,
} from "../program.js";
import { parseFrame } from "../csafe.js";
import { reassemble } from "./framer.js";
import {
  buildGetErrorType,
  buildProgrammingSequence,
  buildSampleRateConfig,
  buildTerminate,
  expectedArmedStructure,
  Pm5EncodeError,
} from "./commands.js";
import { armedStructureFields } from "./statusFrames.js";

// Mirrors domain/monitor/program.test.ts's real-workout fixture plumbing
// (same BASELINES, same Phase->CompiledPhase rename) so this file can drive
// buildProgrammingSequence from an ACTUAL seeded workout rather than a
// hand-built minimum (agent-briefing.md's realistic-fixtures rule).
const BASELINES = { k2Seconds: 100, k6Seconds: 120 };

function toCompiledPhases(
  raw: ReturnType<typeof expandPhases>,
): CompiledPhase[] {
  return raw.map(({ originalStepIndex, ...rest }) => ({
    ...rest,
    originalIndex: originalStepIndex,
  }));
}

function realProgram(title: string): WorkoutProgram {
  const workout = LIBRARY_WORKOUTS.find((w) => w.title === title);
  if (!workout) throw new Error(`fixture workout not found: ${title}`);
  const result = compileProgram(
    toCompiledPhases(expandPhases(workout.steps, BASELINES)),
  );
  if (!("intervals" in result)) {
    throw new Error(`fixture workout failed to compile: ${result.message}`);
  }
  return result;
}

/**
 * Reconstructs the raw (unwrapped, unstuffed) command bytes carried by one
 * frame's already-chunked pieces: concatenate the chunks (each inner array
 * from `buildProgrammingSequence`/`buildTerminate` belongs to exactly ONE
 * frame by construction), verify it round-trips through `parseFrame`
 * (start/stop flags, unstuffing, XOR checksum), then strip the leading
 * `0x76 <count>` proprietary wrapper.
 */
function unwrapFrame(chunks: Uint8Array[]): number[] {
  const frameBytes = Uint8Array.from(
    chunks.flatMap((chunk) => Array.from(chunk)),
  );
  const parsed = parseFrame(frameBytes);
  if (!("payload" in parsed)) {
    throw new Error(`frame failed to parse: ${JSON.stringify(parsed.error)}`);
  }
  const payload = Array.from(parsed.payload);
  const [wrapper, count, ...commandBytes] = payload;
  expect(wrapper).toBe(0x76); // C2 proprietary wrapper, interface-notes.md §11
  expect(count).toBe(commandBytes.length); // the wrapper's own declared byte count
  return commandBytes;
}

/**
 * Walks a wrapped payload's command bytes assuming the uniform
 * `<opcode> <length> <length bytes of data>` shape every command
 * `pm5/commands.ts` emits uses (interface-notes.md §11) and returns the
 * total byte length consumed by EACH command in order. Throws if a command
 * declares more data than remains, or if any bytes are left over after the
 * last complete command — either shape is exactly what "a frame split a
 * command mid-way" would produce (Task 1's M4 obligation): a truncated
 * length byte, a data byte count that runs past the end, or a dangling
 * partial command with no length byte at all.
 */
function walkCommands(commandBytes: number[]): number[] {
  const lengths: number[] = [];
  let i = 0;
  while (i < commandBytes.length) {
    const opcode = commandBytes[i];
    const len = commandBytes[i + 1];
    if (opcode === undefined || len === undefined) {
      throw new Error(
        `truncated command at byte ${i}: missing opcode/length byte`,
      );
    }
    const total = 2 + len;
    if (i + total > commandBytes.length) {
      throw new Error(
        `truncated command at byte ${i} (opcode 0x${opcode.toString(16)}): declares ${len} data bytes but only ${commandBytes.length - i - 2} remain`,
      );
    }
    lengths.push(total);
    i += total;
  }
  return lengths;
}

describe("buildProgrammingSequence: command-boundary alignment (Task 1 M4)", () => {
  // Sea Smoke: 6x[500m/22spm, 500m/24spm, 500m/22spm, 500m/24spm + 2'
  // rest] (server/seed/library/o2.ts) -> 24 work intervals, this suite's
  // stress case. It was 25 until 2026-08-09's warmup setting took the `wu`
  // step out of every seeded workout (the design spec §3 named it "Sea
  // Smoke (25 intervals) is ~=6 frames ~=40 sequential writes"); the
  // interval that left is the warm-up, a per-user SETTING now, prepended
  // at `buildRun` rather than authored into the workout.
  it("Sea Smoke (24 real intervals): every frame's commands walk cleanly, none truncated", () => {
    const program = realProgram("Sea Smoke");
    expect(program.intervals).toHaveLength(24);

    const frames = buildProgrammingSequence(program);
    // L-3 (final-review): pinned exactly, not just "more than one" — a
    // packing change must fail this test, not slide through under a >1
    // assertion. interface-notes.md §15 #6/§17 item 5 and design spec §3
    // cite SEVEN frames, measured when Sea Smoke still had its warm-up
    // interval; MEASURED at 6 here now that 2026-08-09's warmup setting
    // took that 25th interval out of the workout. The packing itself is
    // unchanged — one interval fewer to pack.
    expect(frames.length).toBe(6);

    let workoutIntervalCountCommands = 0;
    let screenStateCommands = 0;
    const intervalIndexSequence: number[] = [];
    for (const chunks of frames) {
      const commandBytes = unwrapFrame(chunks);
      const lengths = walkCommands(commandBytes); // throws on any split/truncated command
      expect(lengths.reduce((a, b) => a + b, 0)).toBe(commandBytes.length);

      let offset = 0;
      for (const len of lengths) {
        const opcode = commandBytes[offset]!;
        if (opcode === 0x18) {
          workoutIntervalCountCommands += 1;
          // SET_WORKOUTINTERVALCOUNT is "18 01 <index>" — collect the
          // actual index byte, not just the fact that an 0x18 occurred.
          intervalIndexSequence.push(commandBytes[offset + 2]!);
        }
        if (opcode === 0x13) screenStateCommands += 1;
        offset += len;
      }
    }
    // One SET_WORKOUTINTERVALCOUNT per interval, and exactly one trailing
    // SET_SCREENSTATE for the whole sequence (never duplicated across a
    // split, never dropped).
    expect(workoutIntervalCountCommands).toBe(24);
    expect(screenStateCommands).toBe(1);
    // The stronger guard (L7): the COUNT alone survives a mutant that
    // shuffles, duplicates, or reorders interval blocks across frames as
    // long as it still emits 24 total 0x18 commands — asserting the actual
    // index VALUES form the exact ascending sequence 0..23, spanning every
    // frame boundary in order, is what an atomicity break (or a reordering
    // bug in buildFrameGroups) cannot survive.
    expect(intervalIndexSequence).toStrictEqual(
      Array.from({ length: 24 }, (_, i) => i),
    );
  });

  it("Sea Smoke: the full multi-frame byte stream reassembles via framer.reassemble()", () => {
    // Cross-validates the outer/inner Uint8Array[][] shape against Task 1's
    // OWN reassembly state machine: simulates a receiver that only sees a
    // flat byte stream (every chunk from every frame, concatenated in
    // order) with no per-frame grouping, and confirms it recovers exactly
    // as many frames as buildProgrammingSequence produced.
    const frames = buildProgrammingSequence(realProgram("Sea Smoke"));
    const reassembler = reassemble();
    const recovered: Uint8Array[] = [];
    for (const chunks of frames) {
      for (const chunk of chunks) {
        const frame = reassembler.push(chunk);
        if (frame) recovered.push(frame);
      }
    }
    let drained = reassembler.push(new Uint8Array());
    while (drained) {
      recovered.push(drained);
      drained = reassembler.push(new Uint8Array());
    }

    expect(recovered).toHaveLength(frames.length);
    recovered.forEach((frame, i) => {
      const expected = Uint8Array.from(
        frames[i]!.flatMap((chunk) => Array.from(chunk)),
      );
      expect(frame).toStrictEqual(expected);
    });
  });

  // Synthetic, hand-computed boundary: 5 identical intervals, each encoding
  // to bytes with no flag-byte (0xF0-0xF3) collisions, so the post-stuffing
  // frame size is exactly the pre-stuffing size and the split point is
  // computable by hand: interval 0 is 29 bytes (SET_WORKOUTTYPE included),
  // intervals 1-4 are 26 bytes each. Wrapped-payload content bytes for a
  // group of N subsequent-shape intervals after interval 0:
  //   2 (0x76 wrapper) + 29 (interval 0) + 26*k
  // k=3 (4 intervals total) -> 2+29+78 = 109 content bytes -> frame total
  //   (F1 + 109 + checksum + F2) = 112, fits in 120.
  // k=4 (5 intervals total) -> 2+29+104 = 135 content bytes -> frame total
  //   138, exceeds 120 -> MUST split before the 5th interval.
  it("5 identical intervals: the frame splits exactly at the interval-block boundary, not mid-command", () => {
    const program: WorkoutProgram = {
      intervals: Array.from({ length: 5 }, () => ({
        kind: "time" as const,
        value: 60, // 1:00 -> 0x00001770, no flag bytes
        targetSplit: 120, // 2:00/500m -> 0x00002EE0, no flag bytes
        displaySpm: null,
        restSeconds: 30, // :30 -> 0x001E, no flag bytes
      })),
    };

    const frames = buildProgrammingSequence(program);
    expect(frames).toHaveLength(2);

    const frame1Commands = unwrapFrame(frames[0]!);
    const frame1Lengths = walkCommands(frame1Commands);
    const frame1IntervalCounts = frame1Lengths.filter((_, idx) => {
      let offset = 0;
      for (let j = 0; j < idx; j += 1) offset += frame1Lengths[j]!;
      return frame1Commands[offset] === 0x18;
    });
    expect(frame1IntervalCounts).toHaveLength(4); // intervals 0-3

    const frame2Commands = unwrapFrame(frames[1]!);
    const frame2Lengths = walkCommands(frame2Commands);
    let offset = 0;
    let frame2IntervalCounts = 0;
    let frame2ScreenStateIsLast = false;
    frame2Lengths.forEach((len, idx) => {
      const opcode = frame2Commands[offset]!;
      if (opcode === 0x18) frame2IntervalCounts += 1;
      if (opcode === 0x13 && idx === frame2Lengths.length - 1) {
        frame2ScreenStateIsLast = true;
      }
      offset += len;
    });
    expect(frame2IntervalCounts).toBe(1); // interval 4 only
    expect(frame2ScreenStateIsLast).toBe(true); // the trailing SET_SCREENSTATE
  });

  it("a single-interval program fits in one frame ending with SET_SCREENSTATE", () => {
    const program: WorkoutProgram = {
      intervals: [
        {
          kind: "distance",
          value: 2000,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    };
    const frames = buildProgrammingSequence(program);
    expect(frames).toHaveLength(1);
    const commandBytes = unwrapFrame(frames[0]!);
    const lengths = walkCommands(commandBytes);
    const lastCommandOffset = lengths.slice(0, -1).reduce((a, b) => a + b, 0);
    expect(commandBytes[lastCommandOffset]).toBe(0x13); // SET_SCREENSTATE
  });
});

describe("buildProgrammingSequence: encoding, cited against interface-notes.md §12", () => {
  it("encodes a null targetSplit as pace time zero (interface-notes.md §15 #3)", () => {
    const program: WorkoutProgram = {
      intervals: [
        {
          kind: "time",
          value: 300,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    };
    const commandBytes = unwrapFrame(buildProgrammingSequence(program)[0]!);
    // SET_TARGETPACETIME (0x06) with 4 zero data bytes must appear.
    const idx = commandBytes.indexOf(0x06);
    expect(commandBytes.slice(idx, idx + 6)).toStrictEqual([
      0x06, 0x04, 0, 0, 0, 0,
    ]);
  });

  it("a HALF-SECOND targetSplit reaches the wire at 0.01s/lsb: 106.5 -> 06 04 00 00 29 9a", () => {
    // The byte-level half of `86963ff` (erg-day review, MEDIUM-7). The
    // COMPILE side is pinned in `program.test.ts` — that a 2:14.5 split
    // survives `representableCentiseconds` instead of being rejected — but
    // nothing pinned that the encoder then puts it on the wire correctly,
    // and interface-notes.md §18 records that a half-second pace has still
    // never been sent to a real PM5. Computed, not quoted: 106.5 s x 100
    // (`TARGET_PACE_SCALE`, 0.01 s/lsb per interface-notes.md §11) = 10650,
    // and 10650 = 0x299A (0x2000 + 0x900 + 0x90 + 0xA), big-endian over four
    // bytes per `be32`.
    const program: WorkoutProgram = {
      intervals: [
        {
          kind: "time",
          value: 60,
          targetSplit: 106.5,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    };
    const commandBytes = unwrapFrame(buildProgrammingSequence(program)[0]!);
    const idx = commandBytes.indexOf(0x06);
    expect(commandBytes.slice(idx, idx + 6)).toStrictEqual([
      0x06, 0x04, 0x00, 0x00, 0x29, 0x9a,
    ]);
    // ...and the value really is 10650, not a truncation that happens to
    // land on those bytes.
    expect(
      (commandBytes[idx + 2]! << 24) |
        (commandBytes[idx + 3]! << 16) |
        (commandBytes[idx + 4]! << 8) |
        commandBytes[idx + 5]!,
    ).toBe(10650);
  });

  it("matches the CSAFE doc's own Variable Interval worked example byte-for-byte (interface-notes.md §12)", () => {
    // v500m/1:00r...4 (CSAFE doc pp.84-86): reconstructing this exact
    // WorkoutProgram and comparing against the doc's own transcribed bytes
    // is the strongest possible conformance check for buildProgrammingSequence.
    const program: WorkoutProgram = {
      intervals: [
        {
          kind: "distance",
          value: 500,
          targetSplit: 100,
          displaySpm: null,
          restSeconds: 60,
        },
        {
          kind: "time",
          value: 180,
          targetSplit: 100,
          displaySpm: null,
          restSeconds: 0,
        },
        {
          kind: "distance",
          value: 1000,
          targetSplit: 100,
          displaySpm: null,
          restSeconds: 0,
        },
        {
          kind: "time",
          value: 300,
          targetSplit: 100,
          displaySpm: null,
          restSeconds: 120,
        },
      ],
    };
    const frames = buildProgrammingSequence(program);
    expect(frames).toHaveLength(1); // the doc's own example is a single 116-byte frame
    const commandBytes = unwrapFrame(frames[0]!);
    expect(commandBytes).toStrictEqual([
      0x18, 0x01, 0x00, 0x01, 0x01, 0x08, 0x17, 0x01, 0x01, 0x03, 0x05, 0x80,
      0x00, 0x00, 0x01, 0xf4, 0x04, 0x02, 0x00, 0x3c, 0x06, 0x04, 0x00, 0x00,
      0x27, 0x10, 0x14, 0x01, 0x01, 0x18, 0x01, 0x01, 0x17, 0x01, 0x00, 0x03,
      0x05, 0x00, 0x00, 0x00, 0x46, 0x50, 0x04, 0x02, 0x00, 0x00, 0x06, 0x04,
      0x00, 0x00, 0x27, 0x10, 0x14, 0x01, 0x01, 0x18, 0x01, 0x02, 0x17, 0x01,
      0x01, 0x03, 0x05, 0x80, 0x00, 0x00, 0x03, 0xe8, 0x04, 0x02, 0x00, 0x00,
      0x06, 0x04, 0x00, 0x00, 0x27, 0x10, 0x14, 0x01, 0x01, 0x18, 0x01, 0x03,
      0x17, 0x01, 0x00, 0x03, 0x05, 0x00, 0x00, 0x00, 0x75, 0x30, 0x04, 0x02,
      0x00, 0x78, 0x06, 0x04, 0x00, 0x00, 0x27, 0x10, 0x14, 0x01, 0x01, 0x13,
      0x02, 0x01, 0x01,
    ]);
  });
});

describe("buildTerminate", () => {
  it("matches the CSAFE doc's Terminate Workout example exactly, checksum per the XOR rule (errata #9)", () => {
    const frames = buildTerminate();
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(1); // 9 bytes total, well under one 20-byte chunk
    // F1 76 04 13 02 01 02 60 F2 -- interface-notes.md §13; the document's
    // own printed checksum (0x62) is errata #9 (§6) and is NOT what this
    // asserts: 0x60 is the XOR rule's computed value.
    expect(Array.from(frames[0]![0]!)).toStrictEqual([
      0xf1, 0x76, 0x04, 0x13, 0x02, 0x01, 0x02, 0x60, 0xf2,
    ]);
  });
});

describe("buildGetErrorType", () => {
  it("wraps 0xC8 under the 0x1A pull wrapper, matching CSAFE-DEF's own worked GET example's shape — F1 1A 01 C8 D3 F2", () => {
    const frame = buildGetErrorType();
    // Content is `1a 01 c8` (topOpcode 0x1A, one echoed opcode, 0xC8
    // itself) — the SAME shape as interface-notes.md §6 example 13's
    // `F1 1A 01 BF A4 F2` (GetStrokeState), never the 0x76 push wrapper
    // every other builder in this file uses. Checksum
    // 0x1A^0x01^0xC8 = 0xD3, the XOR rule this whole codec trusts.
    expect(Array.from(frame)).toStrictEqual([
      0xf1, 0x1a, 0x01, 0xc8, 0xd3, 0xf2,
    ]);
  });
});

describe("buildProgrammingSequence: M-9 — be32/be16 reject what compileProgram can no longer produce", () => {
  // A caller-constructed WorkoutProgram bypassing compileProgram entirely
  // (final-review M-9's own named 7B risk: `loadMonitorRun` only shallow-
  // validates a PERSISTED program's shape, never its field values, before
  // a future replay path could hand it straight back to this function) —
  // this is the defense-in-depth half of the fix; `program.ts`'s own
  // representability guard is the primary one.
  it("a non-integer targetSplit throws a typed Pm5EncodeError instead of being silently truncated onto the wire", () => {
    const program: WorkoutProgram = {
      intervals: [
        {
          kind: "time",
          value: 60,
          targetSplit: 106.567,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    };
    expect(() => buildProgrammingSequence(program)).toThrow(Pm5EncodeError);
  });

  it("a negative restSeconds also throws, not wraps around via >>>'s ToUint32", () => {
    const program: WorkoutProgram = {
      intervals: [
        {
          kind: "time",
          value: 60,
          targetSplit: null,
          displaySpm: null,
          restSeconds: -5,
        },
      ],
    };
    expect(() => buildProgrammingSequence(program)).toThrow(Pm5EncodeError);
  });
});

describe("buildSampleRateConfig", () => {
  it("writes the fastest documented rate, 0x03 = 100ms (BLE doc p.16)", () => {
    expect(buildSampleRateConfig()).toStrictEqual(Uint8Array.from([0x03]));
  });
});

describe("expectedArmedStructure (fix-3 Task 4 — what 0x0031 must read back)", () => {
  // The values below are SESSION 4a's own readings (2026-08-07, PM5
  // 432331249; interface-notes.md §18, "SESSION 4a", ANSWERING
  // interface-notes.md §17 item 12), restated as literals rather than
  // derived from this module's constants — a test that recomputed the
  // prediction the same way the implementation does would agree with a
  // wrong scale just as happily as a right one.
  function timeProgram(seconds: number, restSeconds = 30): WorkoutProgram {
    return {
      intervals: [
        {
          kind: "time",
          value: seconds,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds,
        },
        {
          kind: "time",
          value: 999,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds,
        },
      ],
    };
  }

  it("a TIME interval 0 reads back seconds x 100 at duration identifier 0 (4a: 2x60s r30 -> 6000/Time)", () => {
    expect(expectedArmedStructure(timeProgram(60))).toStrictEqual({
      workoutType: 8,
      workoutDurationRaw: 6000,
      workoutDurationType: 0,
    });
  });

  it("a DISTANCE interval 0 reads back WHOLE METRES at duration identifier 128 (4a: 3x500m r60 -> 500/Distance, read/write symmetric)", () => {
    const program: WorkoutProgram = {
      intervals: [
        {
          kind: "distance",
          value: 500,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 60,
        },
      ],
    };
    expect(expectedArmedStructure(program)).toStrictEqual({
      workoutType: 8,
      workoutDurationRaw: 500,
      workoutDurationType: 128,
    });
  });

  it("rest-0 does NOT change the type: still 8, never a rest-less sibling ordinal (4a's third row is the whole reason the type check is usable)", () => {
    expect(expectedArmedStructure(timeProgram(60, 0))).toStrictEqual(
      expectedArmedStructure(timeProgram(60, 30)),
    );
    expect(expectedArmedStructure(timeProgram(60, 0)).workoutType).toBe(8);
  });

  it("only INTERVAL 0 is predicted — a later interval's own duration never reaches 0x0031", () => {
    // The second interval above is 999s (99900 raw); the prediction must
    // ignore it entirely. This is the assertion that dies if the
    // implementation ever reaches for `intervals.at(-1)` or a sum.
    expect(expectedArmedStructure(timeProgram(60)).workoutDurationRaw).toBe(
      6000,
    );
  });

  it("mirrors the ENCODER exactly: the predicted raw duration is the same number buildIntervalBlock puts on the wire", () => {
    // The drift guard. `SET_WORKOUTDURATION` (0x03) is followed by its
    // 5-byte payload — the duration identifier, then a big-endian 32-bit
    // value — inside interval 0's block, so the prediction and the bytes
    // can be compared directly rather than trusted to agree.
    const program = timeProgram(60);
    const expected = expectedArmedStructure(program);
    const chunks = buildProgrammingSequence(program)[0]!;
    const wire = chunks.reduce<number[]>((acc, c) => [...acc, ...c], []);
    const at = wire.findIndex(
      (b, i) => b === 0x03 && wire[i + 1] === 0x05 && wire[i - 1] === 0x00,
    );
    expect(at).toBeGreaterThan(-1);
    expect(wire[at + 2]).toBe(expected.workoutDurationType);
    const encoded =
      (wire[at + 3]! << 24) |
      (wire[at + 4]! << 16) |
      (wire[at + 5]! << 8) |
      wire[at + 6]!;
    expect(encoded).toBe(expected.workoutDurationRaw);
  });

  it("an interval-less program predicts the EMPTY ARM's own duration reading (0 at identifier 128) — the shape 4a captured on the wire", () => {
    // Not constructible through `compileProgram`, but `WorkoutProgram` is
    // a plain shape a persisted-replay path (`monitorRun.ts`'s shallow
    // validator) could hand over — the prediction must be defined for it
    // rather than reading `undefined` into a comparison.
    expect(expectedArmedStructure({ intervals: [] })).toStrictEqual({
      workoutType: 8,
      workoutDurationRaw: 0,
      workoutDurationType: 128,
    });
  });

  // Sea Fret's interval 0 was its 300s warm-up until 2026-08-09's warmup
  // setting stripped `wu` from every seeded workout; it is now the first
  // of the two 4' work intervals (240s -> 24000 at the TIME scale's 0.01s
  // lsb). The prediction reads interval 0 whatever it is — that is the
  // property under test, and a real library workout is still the honest
  // fixture for it.
  it("a real library workout (Sea Fret): interval 0 is the 240s work interval, so the readback owed is 24000/Time", () => {
    const program = realProgram("Sea Fret");
    expect(program.intervals[0]).toMatchObject({ kind: "time", value: 240 });
    expect(expectedArmedStructure(program)).toStrictEqual({
      workoutType: 8,
      workoutDurationRaw: 24000,
      workoutDurationType: 0,
    });
  });
});

describe("expectedArmedStructure (the DRIVER's prediction) vs armedStructureFields (fix-3 Task 5, the FAKE's own wire encoding) — independent implementations agreeing about the machine", () => {
  // Fix-3 Task 5 / review I-5: `src/monitor/transports/fake.ts` used to
  // compute its 0x0031 bytes by calling `expectedArmedStructure` directly —
  // a MIRROR, not a witness, since a wrong prediction and a wrong wire would
  // then always agree and no fake-driven test could ever catch a real drift
  // between the two. `pm5/statusFrames.ts`'s `armedStructureFields` now
  // re-declares SESSION 4a's constants independently (its own literals, not
  // imported from `commands.ts`) — this describe block is what actually
  // PROVES the two stayed in agreement, rather than merely asserting it in
  // a comment. If either function's own literals ever drift from the
  // other's (e.g. one file's TIME scale becomes 10 instead of 100), this is
  // the test that catches it — see the task report's mutation table.
  function timeProgram(seconds: number): WorkoutProgram {
    return {
      intervals: [
        {
          kind: "time",
          value: seconds,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 30,
        },
      ],
    };
  }

  function distanceProgram(meters: number): WorkoutProgram {
    return {
      intervals: [
        {
          kind: "distance",
          value: meters,
          targetSplit: 120,
          displaySpm: 22,
          restSeconds: 60,
        },
      ],
    };
  }

  it("a TIME program: both computations agree (60s -> 6000/Time)", () => {
    const program = timeProgram(60);
    expect(armedStructureFields(program.intervals)).toStrictEqual(
      expectedArmedStructure(program),
    );
  });

  it("a DISTANCE program: both computations agree (500m -> 500/Distance)", () => {
    const program = distanceProgram(500);
    expect(armedStructureFields(program.intervals)).toStrictEqual(
      expectedArmedStructure(program),
    );
  });

  it("a real library workout (Sea Fret, 300s warmup): both computations agree", () => {
    const program = realProgram("Sea Fret");
    expect(armedStructureFields(program.intervals)).toStrictEqual(
      expectedArmedStructure(program),
    );
  });

  it("an interval-less program: the two DISAGREE ON PURPOSE — the driver's fallback prediction (8/0/128) is not the fake's empty-arm anatomy (1/0/128)", () => {
    // Not a bug: `expectedArmedStructure({intervals: []})`'s own doc
    // comment explains its fallback exists only to give the duration PAIR
    // something to compare against; `armedStructureFields([])` instead
    // returns SESSION 4a's own captured empty-arm reading, `workoutType=1`,
    // which no prediction has ever produced (review L-3, fix-3 Task 4).
    // This asymmetry is exactly what lets `verifyArmed` catch a real empty
    // arm on the type byte even though the duration pair alone would not
    // distinguish it.
    const driverPrediction = expectedArmedStructure({ intervals: [] });
    const fakeWire = armedStructureFields([]);
    expect(driverPrediction.workoutDurationRaw).toBe(
      fakeWire.workoutDurationRaw,
    );
    expect(driverPrediction.workoutDurationType).toBe(
      fakeWire.workoutDurationType,
    );
    expect(driverPrediction.workoutType).not.toBe(fakeWire.workoutType);
    expect(fakeWire).toStrictEqual({
      workoutType: 1,
      workoutDurationRaw: 0,
      workoutDurationType: 128,
    });
  });
});
