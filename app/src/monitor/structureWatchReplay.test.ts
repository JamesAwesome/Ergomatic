// RC-37 (design spec 2026-08-27-link-authority-design.md §1, [R5]) — THE
// NEGATIVE CORPUS, the most important test in this task. A detector that
// fires on a real rest boundary is worse than the bug it fixes: it would
// end a session the rower is mid-way through. Replays FIVE committed,
// genuinely healthy captures through the real driver and asserts ZERO
// `structure-left` entries across their own armed frames — the brief's own
// §1 cites a 300-armed-frame, four-capture corpus in the EXISTING
// `verifyArmed`-scoped comparator; this file proves the EXTENDED, past-
// verify one holds the same line, and (James, reinforced) widens the
// corpus to all five captures this repo currently has, including the two
// (pyramid, keystone) that never fed that original 300-frame figure —
// genuinely new evidence, not a re-count. Per-capture armed-frame and
// mismatch counts are asserted below AND reported in the task's own
// report file, not just a pass.
//
// Every program below is HAND-TRANSCRIBED from each capture's own `ce060021`
// programming tx bytes — never guessed — the same discipline
// `avgPaceVerdict.replay.test.ts`/`lifecycleReplay.test.ts` already use.
// Decoded this session with a throwaway script built on this repo's own
// `domain/monitor/csafe.ts#parseFrame` + `domain/monitor/pm5/framer.ts
// #reassemble` (the exact inverse of `pm5/commands.ts#buildProgrammingSequence`),
// never eyeballed off the hex. Every `divergences` assertion below is the
// SAME bug-independent sanity check the rest of this project's replay
// harnesses lead with: a wrong transcription fails THERE, not on the
// structure-watch assertion, because a byte the real machine was never told
// to hold cannot honestly be compared against anything it reports back.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { MonitorEvent } from "../../domain/monitor/types.js";
import {
  parseGeneralStatus,
  toMonitorState,
} from "../../domain/monitor/pm5/parse.js";
import { GENERAL_STATUS_UUID } from "../../domain/monitor/pm5/uuids.js";
import { createEventLog } from "./eventLog";
import { createPm5Driver } from "./driver";
import {
  fromHexString,
  parseRecording,
  type ParsedRecording,
} from "./transports/recording";
import { createReplayTransport, type ReplayResult } from "./transports/replay";

/** Same path-surgery idiom as `avgPaceVerdict.replay.test.ts`/
 *  `lifecycleReplay.test.ts` (jsdom resolves `new URL(...)` against
 *  `http://localhost:3000/`, so string surgery on `import.meta.url` stands
 *  in for it). `docs/monitor/sessions/` lives three directories above
 *  `app/src/monitor/`. */
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/structureWatchReplay\.test\.ts$/,
    "../docs/monitor/sessions/",
  );

function loadCapture(relPath: string): ParsedRecording {
  const full = `${SESSIONS_DIR}${relPath}`;
  const raw = full.endsWith(".gz")
    ? gunzipSync(readFileSync(full)).toString("utf8")
    : readFileSync(full, "utf8");
  return parseRecording(raw);
}

/** `walk-2026-08-25/rests-finished-recording.jsonl.gz` — "Walk Rests"
 *  (README's own grammar: `w 1' r1 / w 500m r1 / w 1'`), natural finish.
 *  Byte-verified: frame 1's payload decodes to three intervals — TIME 60s
 *  r60 (`03 05 00 00 00 17 70` = duration id TIME/6000, `04 02 00 3c` =
 *  rest 60s), DISTANCE 500m r60 (`03 05 80 00 00 01 f4` = duration id
 *  DISTANCE/500), TIME 60s r0 — every interval's target pace `06 04 00 00
 *  3b 60` = 15200 centiseconds = 152.0s/500m. `displaySpm` is never on the
 *  wire at all (`pm5/commands.ts#buildIntervalBlock` never encodes it), so
 *  `null` here costs nothing against the divergence check. */
const RESTS_FINISHED_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 152,
      displaySpm: null,
      restSeconds: 60,
    },
    {
      type: "work",
      kind: "distance",
      value: 500,
      targetSplit: 152,
      displaySpm: null,
      restSeconds: 60,
    },
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 152,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

/** `walk-2026-08-25/smoke-terminated-recording.jsonl.gz` — "Walk Smoke"
 *  (`w 1'`), Menu-killed at ~31s. Byte-verified: one interval, TIME 60s r0,
 *  target pace 152.0s/500m — the same duration/rest/target encoding as
 *  `RESTS_FINISHED_PROGRAM`'s own first interval. */
const SMOKE_TERMINATED_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 152,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

/** `walk-2026-08-27/boundaries-terminated-recording.jsonl.gz` — "Walk
 *  Boundaries", 3x250m with a 1:00 rest after interval 1 only, terminated
 *  from the PM5's Menu 59.8m into interval 3. Byte-verified: three DISTANCE
 *  250m intervals (`03 05 80 00 00 00 fa` = duration id DISTANCE/250),
 *  rest 60/0/0, every target pace 152.0s/500m. */
const BOUNDARIES_TERMINATED_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "distance",
      value: 250,
      targetSplit: 152,
      displaySpm: null,
      restSeconds: 60,
    },
    {
      type: "work",
      kind: "distance",
      value: 250,
      targetSplit: 152,
      displaySpm: null,
      restSeconds: 0,
    },
    {
      type: "work",
      kind: "distance",
      value: 250,
      targetSplit: 152,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

/** `walk-2026-08-27/menu-at-ready-recording.jsonl.gz` — RC-37's OWN
 *  positive capture (README's addendum: "if you hit 'menu' to end the
 *  workout while the app is on the ready screen, it doesn't cancel out").
 *  Byte-verified: two TIME 240s intervals, r60 each (`03 05 00 00 00 5d c0`
 *  = duration id TIME/24000 = 240s x 100 — matches the README's own decoded
 *  `durRaw=24000 durType=0` verbatim), target pace 164.0s/500m
 *  (`06 04 00 00 40 10` = 16400 centiseconds). `header.program` is absent
 *  (true of every real capture, per the brief) — hardcoded here the same
 *  way `lifecycleReplay.test.ts` hardcodes `KEYSTONE_PROGRAM`. */
const MENU_AT_READY_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "time",
      value: 240,
      targetSplit: 164,
      displaySpm: null,
      restSeconds: 60,
    },
    {
      type: "work",
      kind: "time",
      value: 240,
      targetSplit: 164,
      displaySpm: null,
      restSeconds: 60,
    },
  ],
};

/** `walk-2026-08-23/keystone-pm5-recording-1787491974452.jsonl.gz` — the
 *  laptop keystone (2x250m no rest), natural finish. Re-declared verbatim
 *  from `lifecycleReplay.test.ts`'s own `KEYSTONE_PROGRAM` (this project's
 *  "no test file in src/monitor/ imports another" convention — see that
 *  file's own header), whose correctness is proven there by its own
 *  zero-divergence replay. */
const KEYSTONE_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "distance",
      value: 250,
      targetSplit: 122.5,
      displaySpm: null,
      restSeconds: 0,
    },
    {
      type: "work",
      kind: "distance",
      value: 250,
      targetSplit: 122.5,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

/** `walk-2026-08-18-metrics/pyramid-pm5-recording-1787090555458.jsonl.gz`
 *  — Phase CM's own exit walk, "Walk Pyramid, distinct targets"
 *  (that walk's own README, verbatim): `w 300m 6k @22 r1 · w 700m 6k-4 @24
 *  r1 · w 300m 6k+4 @22` — last interval deliberately rest-free, so the
 *  session ends rowing -> finished with no trailing rest. Byte-verified:
 *  three DISTANCE intervals (300/700/300m, `03 05 80 00 00 01 2c` etc.),
 *  rest 60/60/0, target paces 122.5/118.5/126.5 s/500m
 *  (`06 04 00 00 2f da`=12250, `00 00 2e 4a`=11850, `00 00 31 6a`=12650
 *  centiseconds) — all three matching the README's own base-6k-with-offset
 *  targets by construction, though this file trusts the byte decode, not
 *  the pace arithmetic. 1087 armed-relevant 0x0031 notifications — by far
 *  the largest capture in this corpus, and (per James's reinforcement) NOT
 *  part of the spec's original 300-armed-frame figure — genuinely new
 *  evidence. */
const PYRAMID_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "distance",
      value: 300,
      targetSplit: 122.5,
      displaySpm: null,
      restSeconds: 60,
    },
    {
      type: "work",
      kind: "distance",
      value: 700,
      targetSplit: 118.5,
      displaySpm: null,
      restSeconds: 60,
    },
    {
      type: "work",
      kind: "distance",
      value: 300,
      targetSplit: 126.5,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

interface ReplayOutcome {
  divergences: string[];
  entries: ReturnType<ReturnType<typeof createEventLog>["entries"]>;
  events: MonitorEvent[];
  /** How many 0x0031 notifications in the RAW capture itself decode to
   *  `state === "armed"` (WAITTOBEGIN/COUNTDOWNPAUSE) — an INDEPENDENT
   *  count, read directly off the capture's own bytes via
   *  `parseGeneralStatus`/`toMonitorState`, never off anything the driver
   *  under test decided. This is the same "300 armed frames" methodology
   *  the design spec's own §1 cites, applied per-capture and reported
   *  alongside the pass/fail rather than only asserted. */
  armedFrameCount: number;
}

async function replayThroughDriver(
  capturePath: string,
  program: WorkoutProgram,
): Promise<ReplayOutcome> {
  const parsed = loadCapture(capturePath);
  const armedFrameCount = parsed.events.filter(
    (e) =>
      "dir" in e &&
      e.dir === "rx" &&
      e.char === GENERAL_STATUS_UUID &&
      (() => {
        const decoded = parseGeneralStatus(fromHexString(e.hex));
        return (
          !("error" in decoded) &&
          toMonitorState(decoded.workoutState) === "armed"
        );
      })(),
  ).length;
  const replay = createReplayTransport(parsed);
  const [dev] = await replay.transport.scan();
  await replay.transport.connect(dev.id);

  const log = createEventLog();
  const driver = createPm5Driver(replay.transport, log, {
    deviceName: dev.name,
    now: () => replay.clock.now(),
    schedule: (cb, ms) => replay.clock.schedule(cb, ms),
  });
  const events: MonitorEvent[] = [];
  driver.events((e) => events.push(e));

  const programPending = driver.program(program);
  const result: ReplayResult = await replay.run();
  await programPending;
  driver.reconcile();

  return {
    divergences: result.divergences,
    entries: log.entries(),
    events,
    armedFrameCount,
  };
}

describe("createPm5Driver: RC-37's negative corpus — five healthy captures, zero false detections across their armed frames", () => {
  // `armedFrameCount` is PINNED exactly (fix round 1, finding 4 —
  // "recurring failure #14: prose numbers are silent when they drift"), not
  // merely asserted positive: a capture swap, a re-record, or a
  // `WORKOUTSTATE_TO_STATE` edit changes one of these numbers, and an exact
  // pin makes that a red test instead of a quiet prose mismatch with the
  // task report. Every count below was read off THIS test's own passing run
  // (`outcome.armedFrameCount`, itself an independent oracle — computed
  // directly off each capture's raw 0x0031 bytes, never off anything the
  // driver under test decided) and cross-checked against a standalone
  // decode script outside this suite before being pinned here.
  //
  // WHAT THIS CORPUS DOES NOT PROVE (fix round 1, finding 3): every armed
  // run in every one of these six captures (five negative, one positive)
  // is a SINGLE CONTIGUOUS block at the very head — index `[0..N-1]` of
  // that capture's own General Status stream — and zero armed frames occur
  // at or after the first rest state in any of them (verified this session
  // by walking each capture's own decoded state sequence). So "zero false
  // detections at a rest boundary" is proved by the `armed` GATE and its
  // own dedicated mutation (`driver.test.ts`'s "pins the armed gate" test,
  // which fabricates a rest-boundary-shaped mismatch directly and confirms
  // the gate suppresses it) — never by this corpus, which never puts an
  // armed frame anywhere near a rest boundary to sweep. This is exactly
  // why the design spec's own exit criterion 5, leg 2 (a rest-bearing
  // piece, ROWED, not replayed) exists as the actual gate; overstating what
  // replay evidence covers would make that walk leg look redundant when it
  // is the one thing this suite structurally cannot stand in for.
  //
  // Also worth naming (inherited from `verifyArmed`, not introduced by RC-
  // 37): `WORKOUTSTATE_TO_STATE` admits BOTH ordinal 0 (WaitToBegin) and
  // ordinal 2 (COUNTDOWNPAUSE) as `"armed"`. COUNTDOWNPAUSE appears in
  // NONE of the six captures in this corpus (verified this session) — an
  // unobserved armed sub-state, not a gap this task opened.
  const HEALTHY_CAPTURES: {
    name: string;
    path: string;
    program: WorkoutProgram;
    /** Independently verified — see this `describe` block's own header
     *  comment. */
    armedFrameCount: number;
  }[] = [
    {
      name: "walk-2026-08-25/rests-finished (natural finish, two real rests)",
      path: "walk-2026-08-25/rests-finished-recording.jsonl.gz",
      program: RESTS_FINISHED_PROGRAM,
      armedFrameCount: 68,
    },
    {
      name: "walk-2026-08-25/smoke-terminated (Menu terminate mid-piece)",
      path: "walk-2026-08-25/smoke-terminated-recording.jsonl.gz",
      program: SMOKE_TERMINATED_PROGRAM,
      armedFrameCount: 31,
    },
    {
      name: "walk-2026-08-27/boundaries-terminated (Menu terminate mid-interval-3, one real rest)",
      path: "walk-2026-08-27/boundaries-terminated-recording.jsonl.gz",
      program: BOUNDARIES_TERMINATED_PROGRAM,
      armedFrameCount: 181,
    },
    {
      name: "walk-2026-08-23/keystone (natural finish, laptop keystone)",
      path: "walk-2026-08-23/keystone-pm5-recording-1787491974452.jsonl.gz",
      program: KEYSTONE_PROGRAM,
      armedFrameCount: 27,
    },
    {
      name: "walk-2026-08-18-metrics/pyramid (natural finish, two real rests, distinct targets, 1087 frames)",
      path: "walk-2026-08-18-metrics/pyramid-pm5-recording-1787090555458.jsonl.gz",
      program: PYRAMID_PROGRAM,
      armedFrameCount: 167,
    },
  ];

  for (const capture of HEALTHY_CAPTURES) {
    it(`${capture.name}: ${capture.armedFrameCount} armed frames, zero 'structure-left' entries, zero programDropped events`, async () => {
      const outcome = await replayThroughDriver(capture.path, capture.program);

      // Bug-independent sanity FIRST (this project's own convention
      // throughout the replay harnesses): if the hand-transcribed program
      // is wrong, THIS fails, never the assertion below it.
      expect(outcome.divergences).toStrictEqual([]);

      expect(outcome.armedFrameCount).toBe(capture.armedFrameCount);
      expect(
        outcome.entries.filter((e) => e.kind === "structure-left"),
      ).toStrictEqual([]);
      expect(
        outcome.events.filter((e) => e.kind === "programDropped"),
      ).toStrictEqual([]);
    });
  }

  it("the negative corpus totals 474 armed frames, zero of them past any rest boundary — see this describe block's own header for what that does and does not prove", () => {
    const total = HEALTHY_CAPTURES.reduce(
      (sum, c) => sum + c.armedFrameCount,
      0,
    );
    expect(total).toBe(474);
  });
});

describe("createPm5Driver: RC-37's own positive capture — walk-2026-08-27/menu-at-ready", () => {
  it("112 consecutive armed ticks over 56.4s reporting the machine's unprogrammed shape: the watch fires 'structure-left' and emits programDropped", async () => {
    const outcome = await replayThroughDriver(
      "walk-2026-08-27/menu-at-ready-recording.jsonl.gz",
      MENU_AT_READY_PROGRAM,
    );

    expect(outcome.divergences).toStrictEqual([]);

    // Pinned exactly (fix round 1, finding 4) — 156 armed frames, the
    // capture's own full WaitToBegin run, all contiguous at the head
    // (this file's negative-corpus `describe` block carries the full
    // reasoning for why that matters).
    expect(outcome.armedFrameCount).toBe(156);

    const fired = outcome.entries.filter((e) => e.kind === "structure-left");
    expect(fired).toHaveLength(1);
    // The README's own decode: wt 8 -> 1, durRaw 24000 -> 0, durType 0 ->
    // 128 — the machine's unprogrammed shape, verbatim.
    expect(fired[0]!.detail).toContain(
      "observed workoutType=1 durationRaw=0 durationType=128",
    );
    expect(fired[0]!.detail).toContain(
      "expected workoutType=8 durationRaw=24000 durationType=0",
    );

    const droppedEvents = outcome.events.filter(
      (e) => e.kind === "programDropped",
    );
    expect(droppedEvents).toHaveLength(1);
  });
});
