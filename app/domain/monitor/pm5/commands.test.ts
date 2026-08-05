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
  buildProgrammingSequence,
  buildSampleRateConfig,
  buildTerminate,
  Pm5EncodeError,
} from "./commands.js";

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
  // Sea Smoke: wu 6' + 6x[500m/22spm, 500m/24spm, 500m/22spm, 500m/24spm +
  // 2' rest] (server/seed/library/o2.ts) -> 1 warmup interval + 24 work
  // intervals = 25 intervals, the design spec's own named stress case
  // ("Sea Smoke (25 intervals) is ~=6 frames ~=40 sequential writes",
  // design spec §3).
  it("Sea Smoke (25 real intervals): every frame's commands walk cleanly, none truncated", () => {
    const program = realProgram("Sea Smoke");
    expect(program.intervals).toHaveLength(25);

    const frames = buildProgrammingSequence(program);
    // L-3 (final-review): pinned exactly, not just "more than one" —
    // interface-notes.md §15 #6/§17 item 7 and design spec §3 both cite
    // Sea Smoke needing 7 frames under this packing; a regression to 6 or
    // 8 (a packing change) must fail this test, not slide through under a
    // >1 assertion.
    expect(frames.length).toBe(7);

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
    expect(workoutIntervalCountCommands).toBe(25);
    expect(screenStateCommands).toBe(1);
    // The stronger guard (L7): the COUNT alone survives a mutant that
    // shuffles, duplicates, or reorders interval blocks across frames as
    // long as it still emits 25 total 0x18 commands — asserting the actual
    // index VALUES form the exact ascending sequence 0..24, spanning every
    // frame boundary in order, is what an atomicity break (or a reordering
    // bug in buildFrameGroups) cannot survive.
    expect(intervalIndexSequence).toStrictEqual(
      Array.from({ length: 25 }, (_, i) => i),
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
