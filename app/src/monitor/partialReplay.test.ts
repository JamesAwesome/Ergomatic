// Door spec (2026-09-02) §8.2 — THE HEADLINE GATE, replay half.
//
// RF24, stated as the binding condition this file exists to satisfy:
// "every test seeding PAST the producer, so no gate can go red on the one
// defect that matters". `MACHINE CONFIRMED · WORK ONLY` shipped having
// reached zero of sixteen production rows while three gates stayed green,
// because every one of them entered the pipe downstream of the break. So
// this file starts at the WIRE BYTES of a committed capture and asserts at
// the STORED ROW's shape: real `createReplayTransport` -> real
// `useMonitorSession` -> real `closeRecord`/`withPartial` -> real
// `localStorage` (`loadMonitorRun`) -> real `buildMonitorLogSteps`. Nothing
// is seeded; no `MonitorRun` is hand-built anywhere below.
//
// The other half of the gate is a supertest POST->GET leg in
// `server/routes/data.test.ts` (jsdom cannot host it, and `unit` cannot host
// this). The two are joined by ONE IMPORTED declaration —
// `src/session/partialGateFixture.ts` — never by two hand-typed literals, so
// they cannot drift into two stale copies. **They do NOT redden together,
// and the plan does not pretend they do** (task brief step 5, M7.3): this
// half gates WHAT THE HOOK BANKS, the route half gates THAT THE ROUTE
// PRESERVES THE PAIR. Mutating a fixture number reddens this file and leaves
// the route leg green (it posts the fixture and asserts the fixture — a
// round-trip identity over whatever the declaration says); mutating the
// route's own field list (M0.1) reddens the route leg and leaves this one
// green. The VALUE of the single declaration is that changing what the hook
// banks forces the declaration to change, which re-points both consumers in
// one edit.
//
// THE CAPTURES (`docs/monitor/sessions/walk-2026-08-28/`, that walk's own
// README provenance table). Both were programmed with the IDENTICAL
// 3x1:00-work / 1:00-rest workout — byte-identical `ce060021` programming
// tx at seq 15-19 in each file — and both were ended by the rower's own End
// press AT THE ERG, which is why each carries a trailing terminate tx that
// no replay can ever satisfy (see `EXPECTED_*_DIVERGENCE` below).
//
//   - `end-on-interval-1-recording.jsonl.gz` — 8.3 s into interval 1, before
//     any boundary. ZERO attributable actuals: the partial is the only
//     number the row has. Decoded THIS session off the recorded bytes with
//     this repo's own `parseGeneralStatus`/`parseAdditionalStatus2` (never
//     eyeballed off the hex, never carried from a document):
//       seq 72  t=14631.6  0x0031 state=4 (rowing)     el=7.75  d=14.1  intervalCount=0
//       seq 75  t=15155.4  TX f1 76 04 13 02 01 02 60 f2   <- the rower's End
//       seq 76  t=15183.6  0x0031 state=4 (rowing)     el=8.28  d=15    intervalCount=0
//       seq 80  t=15441.7  0x0031 state=11 (terminated) el=8.49 d=15.3
//       seq 81  t=15442.1  0x0037 splitTime=8.5 splitDist=15 num=1
//     Seq 76 is the LAST rowing frame, and its pair is what the row banks.
//     Seq 81 is the in-flight 0x0037 the machine volunteers at a terminate
//     and WE DECLINE (`toActualIndex` returns `null` for `state ===
//     "terminated"`, CSAFE-DEF footnote 12: the interval number "will change
//     depending on where you are in the interval") — asserting `actuals` is
//     `[]` below is what pins that we still decline it.
//
//   - `rest-boundary-recording.jsonl.gz` — one banked boundary, End during
//     interval 2. Decoded the same way:
//       seq 411 t=76038.6  0x0031 state=4 (rowing)  el=59.74 d=196.6 intervalCount=0
//       seq 414 t=76488.9  0x0031 state=3 (resting) el=60.21 d=197.6 intervalCount=0
//       seq 771 t=136429.2 0x0037 splitTime=60 splitDist=197 restT=60 restD=6 num=1
//       seq 772 t=136429.5 0x0038 avgStrokeRate=25 avgPace=152.2 num=1
//       seq 836 t=147319.3 0x0031 state=4 (rowing)  el=10.9  d=37.6  intervalCount=1
//       seq 839 t=147592   TX f1 76 04 13 02 01 02 60 f2   <- the rower's End
//     Interval 0's WORK BOUT ends at seq 414 (t=76488.9) while interval 0's
//     own `IntervalActual` does not arrive until seq 771 (t=136429.2) —
//     **59 940 ms apart**, which is I-B3's whole reason for existing and what
//     leg C2 gates.
//
// THE THIRD CAPTURE, for leg D — `walk-2026-08-25/rests-finished-recording
// .jsonl.gz` ("Walk Rests", README's own grammar `w 1' r1 / w 500m r1 /
// w 1'`), the corpus's NATURAL FINISH. Decoded the same way:
//       seq 2437 t=416082.2 0x0031 state=4  (rowing)     el=59.52 d=215.7
//       seq 2440 t=416622.6 0x0031 state=10 (WORKOUTEND) el=60.0   d=217.1
//       seq 2443 t=416802.3 0x0037 splitT=60.0 splitD=217 num=3
// The close fires SYNCHRONOUSLY on seq 2440 — 180 ms BEFORE the final
// boundary at seq 2443 — and a `WORKOUTEND` frame is neither `rowing` nor
// `resting`, so `noteFrameForPartial` neither mints nor clears on it. Seq
// 2437's reading is therefore STILL HELD, on an interval that has no actual
// yet, at the instant `closeRecord` runs. **I-B1's allowlist is the only
// thing standing between a completed workout and a partial on its last
// row**, which is exactly why this leg exists and what M7.2 reddens.
//
// Composition is `lifecycleReplay.test.ts`'s exactly (`createReplayTransport`
// + `vi.doMock("../adapters/monitorTransport")` + `vi.resetModules()` +
// dynamic re-import + the real `withLiveness` decorator with its clock
// rebound to the replay clock). "No test file in `src/monitor/` imports
// another" holds here too — the single import this file adds is a NON-test
// module, `../session/partialGateFixture`.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import {
  PARTIAL_STEP_LEG_A,
  PARTIAL_STEP_LEG_B,
} from "../session/partialGateFixture";
import { buildMonitorLogSteps } from "../session/logDraft";
import { measuredIntervalCount } from "../session/summaryModel";
import { loadMonitorRun, type MonitorRun } from "./monitorRun";
import type { MonitorSession, RunIdentity } from "./useMonitorSession";
import { parseRecording, type ParsedRecording } from "./transports/recording";
import { createReplayTransport, type ReplayResult } from "./transports/replay";
import { withLiveness } from "./transports/liveness";

/** Same path-surgery idiom as `lifecycleReplay.test.ts`/`burstReplay.test.ts`
 *  (jsdom resolves `new URL(...)` against `http://localhost:3000/`, so string
 *  surgery on `import.meta.url` stands in for it). */
const MONITOR_SESSIONS_ROOT = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/partialReplay\.test\.ts$/,
    "../docs/monitor/sessions/",
  );

function loadCapture(walkDir: string, file: string): ParsedRecording {
  return parseRecording(
    gunzipSync(
      readFileSync(`${MONITOR_SESSIONS_ROOT}${walkDir}/${file}`),
    ).toString("utf8"),
  );
}

const END_ON_INTERVAL_1 = loadCapture(
  "walk-2026-08-28",
  "end-on-interval-1-recording.jsonl.gz",
);
const REST_BOUNDARY = loadCapture(
  "walk-2026-08-28",
  "rest-boundary-recording.jsonl.gz",
);
const RESTS_FINISHED = loadCapture(
  "walk-2026-08-25",
  "rests-finished-recording.jsonl.gz",
);

/** HAND-TRANSCRIBED from the captures' own `ce060021` programming tx (seq
 *  15-19), which are byte-identical between the two files. **Its
 *  correctness is not asserted on trust and is not taken on a comment's
 *  word: those five tx frames are replay BARRIERS**, so a wrong duration,
 *  rest or target pace produces a `tx#N expected ... got ...` divergence.
 *  Legs A and B assert the divergence list is EXACTLY one element — the
 *  trailing terminate — which is precisely the statement "every programming
 *  barrier matched, byte for byte". `displaySpm` is never on the wire at all
 *  (`pm5/commands.ts#buildIntervalBlock` never encodes it), so `null` costs
 *  nothing against that check. */
const WALK_0828_PROGRAM: WorkoutProgram = {
  intervals: [0, 1, 2].map((i) => ({
    type: "work",
    kind: "time",
    value: 60,
    targetSplit: 152,
    displaySpm: null,
    restSeconds: i === 2 ? 0 : 60,
  })),
};

/** The seed label is `partialGateFixture.ts`'s own `label`, deliberately: the
 *  fixture IS the assertion target, so a seed that disagreed with it would
 *  make every `toStrictEqual` below a statement about this file instead of
 *  about the pipe. Three steps, matching `WALK_0828_PROGRAM.intervals.length`
 *  — `buildMonitorLogSteps` throws `MonitorLogSeedError` on any length
 *  mismatch, so a wrong count fails loudly rather than silently. */
const STEP_LABEL = PARTIAL_STEP_LEG_A.label;

const WALK_0828_IDENTITY: RunIdentity = {
  workoutId: "id-walk-2026-08-28-fixture",
  title: "3x1:00 @ 2:32",
  logSeed: {
    steps: [
      { label: STEP_LABEL, kind: "work" },
      { label: STEP_LABEL, kind: "work" },
      { label: STEP_LABEL, kind: "work" },
    ],
    paces: {},
  },
};

/** The step every unreached/unmeasured interval builds to: the authored
 *  target and nothing else. Named rather than repeated so "carries NEITHER
 *  partial key AND no actual keys" is one strict comparison at each use,
 *  the same way `PARTIAL_STEP_LEG_A`/`_B` carry their own absences. */
const BARE_STEP = {
  label: STEP_LABEL,
  targetSplit: 152,
  seconds: 60,
} as const;

/** Leg D's program. HAND-TRANSCRIBED from `rests-finished`'s own programming
 *  tx and byte-verified the same way `WALK_0828_PROGRAM` is — TIME 60 s r60
 *  (`03 05 00 00 00 17 70` = duration id TIME/6000 centiseconds,
 *  `04 02 00 3c` = rest 0x3c = 60 s), DISTANCE 500 m r60
 *  (`03 05 80 00 00 01 f4` = duration id DISTANCE/500), TIME 60 s r0, every
 *  target pace `06 04 00 00 3b 60` = 15200 centiseconds = 152.0 s/500 m. Leg
 *  D's `toStrictEqual([])` divergence assertion is the proof, exactly as legs
 *  A and B's one-element pin is theirs. Independently reproduces
 *  `structureWatchReplay.test.ts`'s own already-committed transcription of
 *  this capture — a second confirmation of the same bytes, not a copy taken
 *  on faith ("no test file in `src/monitor/` imports another"). */
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

const RESTS_FINISHED_IDENTITY: RunIdentity = {
  workoutId: "id-walk-2026-08-25-rests-fixture",
  title: "Walk Rests",
  logSeed: {
    steps: [
      { label: "1:00 @ 2:32", kind: "work" },
      { label: "500m @ 2:32", kind: "work" },
      { label: "1:00 @ 2:32", kind: "work" },
    ],
    paces: {},
  },
};

/** Only ever feeds `MonitorRun.startedAt`/`completedAt`'s ISO stamps, which
 *  no assertion below reads. */
const FIXED_NOW = new Date("2026-08-28T09:00:00.000Z");

/** Each capture's LAST tx is the terminate the rower's own End press sent at
 *  the erg. A replay cannot press a button, so nothing in these legs ever
 *  calls `driver.terminate()` and that barrier can only time out. **A
 *  `toStrictEqual([])` here would be wrong**, and pinning the exact
 *  one-element array is strictly stronger than pinning nothing: it says every
 *  OTHER barrier in the file matched. Both values independently reproduce
 *  `oracleCorpusReplay.test.ts`'s own already-committed pins for the same two
 *  captures (that file drives the DRIVER; this one drives the HOOK). */
const EXPECTED_END_DIVERGENCE = ["tx#75 barrier timeout"];
const EXPECTED_REST_DIVERGENCE = ["tx#839 barrier timeout"];

/** 250 ms rather than `createReplayTransport`'s 2000 ms default, for the one
 *  barrier per capture that can only ever time out — the identical choice
 *  `oracleCorpusReplay.test.ts` makes over these same two files, and for the
 *  reason its own comment records: the timeout changes only how long the
 *  unmatchable barrier waits, never which barriers match, VERIFIED there at
 *  250 / 500 / 2000 / 4000 ms with byte-identical divergence sets. Both
 *  pinned barriers are the LAST `tx` in their capture, so a timed-out barrier
 *  cannot cascade into a mismatch on the next one. */
const BARRIER_TIMEOUT_MS = 250;

/**
 * Legs C1/C2 only. **A CUT IS A CLAIM ABOUT WHERE IN THE TIMELINE YOU
 * LANDED**, so each call site states the frames its `tMs` lands between,
 * decoded (this file's header). Truncation, never surgery: every surviving
 * event keeps its own recorded `t`, `seq` and bytes.
 */
function cutAt(capture: ParsedRecording, tMs: number): ParsedRecording {
  return {
    header: capture.header,
    events: capture.events.filter((e) => e.t <= tMs),
  };
}

interface ReplayOutcome {
  divergences: string[];
  run: MonitorRun;
}

/**
 * Drives `recording` through the real replay engine into a FRESH
 * `useMonitorSession`, then reads the record back out of `localStorage` the
 * way the Log door does.
 *
 * `pressEnd` is legs C1/C2's CONSTRUCTED ORDERING (RF26): no recording can
 * contain a button press, so the End arm is reached by cutting the capture
 * and calling the hook's own public `endSession()` from the harness. The
 * strongest claim either leg may state is therefore about `endSession`'s
 * behaviour given a wire history that stops where the cut stops — it is not
 * a claim that a rower's press has ever been RECORDED at that instant.
 *
 * `void`, not `await`: `endSession` closes the record SYNCHRONOUSLY (its
 * `closeRecord` call runs above the `await driver.terminate()`), so the close
 * is complete when this returns. The returned promise is deliberately not
 * awaited — the replay is finished, so that `terminate()` write has no
 * barrier left to match and never resolves; awaiting it times the test out at
 * 5000 ms (measured).
 */
async function runReplay(
  recording: ParsedRecording,
  program: WorkoutProgram,
  identity: RunIdentity,
  opts: { pressEnd?: boolean } = {},
): Promise<ReplayOutcome> {
  // Physical `localStorage` is a real global that `vi.resetModules()` cannot
  // touch, and every leg in this file shares the identical `FIXED_NOW`-derived
  // hand-off `sessionKey` — the same collision `summaryHoldReplay.test.ts` and
  // `burstReplay.test.ts` both clear for.
  localStorage.clear();
  const replay = createReplayTransport(recording, {
    barrierTimeoutMs: BARRIER_TIMEOUT_MS,
  });
  const transport = withLiveness(replay.transport, {
    now: () => replay.clock.now(),
    schedule: (fn, ms) => replay.clock.schedule(fn, ms),
    onSilence: () => undefined,
    onRecovery: () => undefined,
  });

  vi.doMock("../adapters/monitorTransport", () => ({
    defaultTransport: vi.fn(() => transport),
  }));
  vi.doMock("../adapters/appLifecycle", () => ({
    registerAppLifecycleListener: vi.fn(() => (): void => undefined),
  }));
  vi.resetModules();

  const { useMonitorSession: freshUseMonitorSession } =
    await import("./useMonitorSession");

  const { result } = renderHook(() =>
    freshUseMonitorSession({
      now: () => FIXED_NOW,
      schedule: (cb, ms) => replay.clock.schedule(cb, ms),
      driverOptions: {
        now: () => replay.clock.now(),
        schedule: (cb, ms) => replay.clock.schedule(cb, ms),
      },
    }),
  );

  await act(async () => {
    await result.current.connect();
  });

  let replayResult: ReplayResult = { divergences: [] };
  await act(async () => {
    const pending = result.current.program(program, identity);
    replayResult = await replay.run();
    await pending;
  });

  if (opts.pressEnd === true) {
    act(() => {
      void (result.current as MonitorSession).endSession();
    });
  }

  const run = loadMonitorRun();
  if (run === null) {
    throw new Error(
      "partialReplay.test.ts: no MonitorRun in storage after the replay — the record never closed, so nothing below can be asserted",
    );
  }
  return { divergences: replayResult.divergences, run };
}

describe("door spec §8.2 — the in-flight pair, from the wire bytes to the built step", () => {
  afterEach(() => {
    vi.doUnmock("../adapters/monitorTransport");
    vi.doUnmock("../adapters/appLifecycle");
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("LEG A — end-on-interval-1: zero actuals, and the partial is the only number the row has", async () => {
    const out = await runReplay(
      END_ON_INTERVAL_1,
      WALK_0828_PROGRAM,
      WALK_0828_IDENTITY,
    );

    // FIRST, before anything about the partial: the wire replayed as
    // recorded. A mis-transcribed `WALK_0828_PROGRAM` fails HERE rather than
    // silently colouring every assertion below.
    expect(out.divergences).toStrictEqual(EXPECTED_END_DIVERGENCE);

    // The MACHINE-TERMINATE arm — `endByMachine(true)`, which closes with
    // `"rower"` (`closeRecord(terminated, terminated ? "rower" : "finished")`).
    // A replay cannot press End, so this is the arm every committed capture
    // exercises; legs C1/C2 below reach the End arm by construction instead.
    expect(out.run.endedBy).toBe("rower");

    // I-B2 — a partial is NEVER an `IntervalActual`. This also pins that we
    // still DECLINE the in-flight 0x0037 the PM5 volunteers at seq 81 (this
    // file's header): the machine reports the quantity but cannot attribute
    // it, so 15 m / 8.5 s must reach the row as a PARTIAL and never as an
    // actual.
    expect(out.run.actuals).toStrictEqual([]);
    expect(measuredIntervalCount(out.run.actuals)).toBe(0);

    // Seq 76's own reading, MEASURED (header): el=8.28, d=15, interval 0.
    expect(out.run.partial).toStrictEqual({
      intervalIndex: 0,
      meters: 15,
      seconds: 8.28,
    });

    const steps = buildMonitorLogSteps(out.run);
    expect(steps).toHaveLength(3);
    // ONE strict comparison asserts the pair AND the absence of
    // `actualMeters`/`actualSeconds`/`actualSource`. Imported, never retyped:
    // `server/routes/data.test.ts` asserts the same declaration.
    expect(steps[0]).toStrictEqual(PARTIAL_STEP_LEG_A);
    // Intervals 2 and 3 were never reached: target only, neither partial key.
    expect(steps[1]).toStrictEqual(BARE_STEP);
    expect(steps[2]).toStrictEqual(BARE_STEP);
  });

  it("LEG B — rest-boundary: the banked boundary is untouched and the partial rides the NEXT step", async () => {
    const out = await runReplay(
      REST_BOUNDARY,
      WALK_0828_PROGRAM,
      WALK_0828_IDENTITY,
    );

    expect(out.divergences).toStrictEqual(EXPECTED_REST_DIVERGENCE);
    expect(out.run.endedBy).toBe("rower");

    // I-B2 again, from the other side: one real boundary, and the partial
    // moved NEITHER the actual nor the count. Seq 771/772's own decoded
    // values (this file's header).
    expect(out.run.actuals).toStrictEqual([
      {
        index: 0,
        elapsedSeconds: 60,
        distanceMeters: 197,
        avgSplit: 152.2,
        avgSpm: 25,
        avgHeartRateBpm: null,
        restSeconds: 60,
        restDistanceMeters: 6,
        // RF10 — the task brief's enumeration of this actual omitted `type`;
        // the record carries it and the brief is the one that was wrong (the
        // omission was silent, not a disagreement: the measured run produced
        // `type: 0` where the brief listed seven fields). 0x0037's own
        // Split/Interval Type byte, stored RAW (`IntervalActual.type`), and
        // `0` is what this repo has observed a TIME-kind interval put on the
        // wire — correct for a 1:00 work interval.
        type: 0,
      },
    ]);
    expect(measuredIntervalCount(out.run.actuals)).toBe(1);

    // Seq 836's own reading, MEASURED (header): el=10.9, d=37.6, interval 1.
    expect(out.run.partial).toStrictEqual({
      intervalIndex: 1,
      meters: 37.6,
      seconds: 10.9,
    });

    const steps = buildMonitorLogSteps(out.run);
    expect(steps).toHaveLength(3);
    // Step 0 carries the full pm5 actual set and NO partial key — a step can
    // never show both (I-B6 on the read side).
    expect(steps[0]).toStrictEqual({
      label: STEP_LABEL,
      targetSplit: 152,
      seconds: 60,
      actualSource: "pm5",
      actualSplit: 152.2,
      actualSpm: 25,
      actualSeconds: 60,
      actualMeters: 197,
    });
    expect(steps[1]).toStrictEqual(PARTIAL_STEP_LEG_B);
    expect(steps[2]).toStrictEqual(BARE_STEP);
  });

  it("LEG C1 — the End arm: cut mid-work-bout, press End, and the live reading is banked", async () => {
    // A CONSTRUCTED ORDERING (RF26), stated: no recording can contain a
    // button press, so `rest-boundary` is TRUNCATED and the harness calls
    // the hook's own `endSession()`. THE CUT, decoded (this file's header):
    // t <= 76200 keeps interval 0's last rowing frame (seq 411, t=76038.6,
    // el=59.74, d=196.6) and its 0x0033 companion (seq 413, t=76039.4), and
    // drops interval 0's FIRST resting frame (seq 414, t=76488.9) — so the
    // work bout is still running when End is pressed, and the reading is
    // still live.
    const out = await runReplay(
      cutAt(REST_BOUNDARY, 76_200),
      WALK_0828_PROGRAM,
      WALK_0828_IDENTITY,
      { pressEnd: true },
    );

    // The terminate tx (seq 839) is not in the cut, so there is no barrier
    // left to time out.
    expect(out.divergences).toStrictEqual([]);
    // The link is up (no disconnect in the cut, no latched `frameSilence`),
    // so `endSession` takes the `rower` arm rather than `link-lost`.
    expect(out.run.endedBy).toBe("rower");
    expect(out.run.partial).toStrictEqual({
      intervalIndex: 0,
      meters: 196.6,
      seconds: 59.74,
    });

    const steps = buildMonitorLogSteps(out.run);
    expect(steps[0]).toStrictEqual({
      ...BARE_STEP,
      partialMeters: 196.6,
      partialSeconds: 59.74,
    });
  });

  it("LEG C2 — I-B3 under an End close: cut mid-REST, press End, and nothing is banked", async () => {
    // The same constructed ordering as C1, one cut later. THE CUT, decoded:
    // t <= 100000 lands 3.5 s AFTER interval 0's first resting frame (seq
    // 414, t=76488.9 — which cleared the reading) and 36 s BEFORE interval
    // 0's own `IntervalActual` (seq 771, t=136429.2). That 59 940 ms window
    // is I-B3's whole reason for existing: interval 0 is COMPLETE here, and
    // a partial written now would store a completed interval as an in-flight
    // one and count it unmeasured — the inverse of the complaint this spec
    // exists for.
    const out = await runReplay(
      cutAt(REST_BOUNDARY, 100_000),
      WALK_0828_PROGRAM,
      WALK_0828_IDENTITY,
      { pressEnd: true },
    );

    expect(out.divergences).toStrictEqual([]);
    expect(out.run.endedBy).toBe("rower");
    expect(out.run.partial).toBeUndefined();

    // And the interval whose bout ended carries no partial key on the row
    // either — it has no actual yet at this cut, so the ONLY thing keeping
    // the pair off this step is I-B3.
    const steps = buildMonitorLogSteps(out.run);
    expect(steps[0]).toStrictEqual(BARE_STEP);
  });

  it("LEG D — I-B1 on the wire: a NATURAL FINISH banks nothing, with a live reading still in hand", async () => {
    // The one leg in this file that is not a `rower` close, and the only
    // gate anywhere that reaches I-B1 from the wire bytes rather than from
    // a hand-passed `endedBy`. Its value is entirely in the PRECONDITION,
    // which this capture supplies and no synthetic fixture would have
    // volunteered (this file's header, "THE THIRD CAPTURE"): at the instant
    // `closeRecord` runs, seq 2437's rowing reading is still held, on an
    // interval with no actual — every gate EXCEPT I-B1 would let it
    // through. Measured: with `"finished"` added to `PARTIAL_WRITE_REASONS`
    // this leg banks `{ intervalIndex: 2, meters: 215.7, seconds: 59.52 }`
    // — a COMPLETED workout carrying an in-flight pair on its last row.
    const out = await runReplay(
      RESTS_FINISHED,
      RESTS_FINISHED_PROGRAM,
      RESTS_FINISHED_IDENTITY,
    );

    // No trailing terminate tx in this capture — the machine finished on its
    // own, so nothing was ever sent that a replay could fail to match.
    expect(out.divergences).toStrictEqual([]);
    expect(out.run.endedBy).toBe("finished");
    expect(out.run.partial).toBeUndefined();

    // And no step carries either key. Asserted over ALL THREE rather than
    // just the last: the reading held at close belongs to interval 2, but a
    // gate that only looked there would miss a write mis-keyed onto another
    // index.
    const steps = buildMonitorLogSteps(out.run);
    expect(steps).toHaveLength(3);
    for (const step of steps) {
      expect(step.partialMeters).toBeUndefined();
      expect(step.partialSeconds).toBeUndefined();
    }
  });
});
