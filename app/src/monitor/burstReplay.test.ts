// Storage-spine design spec §2/§6, exit criterion 2 — Task 5 of PR 1: "the
// walk's own finish, replayed to the byte, through the real stack".
//
// The capture: `docs/monitor/sessions/walk-2026-08-23/keystone-pm5-
// recording-1787491974452.jsonl.gz` (README.md's "the laptop keystone
// (2×250m, no rest) with the hold-open armed"). Its own raw bytes carry the
// burst-first race exactly as it happened (spec §1's PRIMARY citation,
// re-verified here against the decompressed capture, not carried from the
// spec by memory): the final split (0x0037 seq 514 / 0x0038 seq 515) at
// t=171859.9/171860.3, the summary pair (0x0039 seq 516 / 0x003A seq 517)
// at t=172129.5/172130.6, the verification hash (0x003F seq 518) at
// t=172167.7, and OUR OWN terminal transition (0x0031 seq 519, state byte
// 0x0c = 12/WORKOUTLOGGED) at t=172309.3 — state 5 (rowing, seq 511) jumps
// straight to 12; state 10 (WORKOUTEND) never appears on the wire in
// between, matching the spec's "state 5→12 directly ... state 10 never
// appears" citation.
//
// NOT an addition to `captureReplay.test.ts`, deliberately. That file's own
// header (read before this one was written) explains why IT can never
// drive `createPm5Driver`/a hook at all: its captures are `.log.gz`
// bridge-mirrored logs holding already-DECODED `MonitorFrame` JSON, with no
// wire bytes to feed a codec and no armed program to normalize an interval
// index against. This capture is the opposite shape — a `.jsonl.gz`
// `pm5-recording/v1` file of raw CSAFE/BLE bytes, the same format
// `registerReplay.test.ts`/`connectedMetricsReplay.test.ts` already replay
// through `transports/replay.ts`'s barrier engine into the real driver.
// This file follows THEIR idiom (path-surgery `SESSIONS_DIR`, hand-
// transcribed `WorkoutProgram` byte-verified against the recorded
// programming frames, `createReplayTransport` + `now`/`schedule` bound to
// the SAME virtual clock) one layer further up the stack than either of
// them goes: through `useMonitorSession` itself — "the real hook" — via the
// identical `vi.doMock("../adapters/monitorTransport")` +
// `vi.resetModules()` + dynamic re-import composition
// `useMonitorSession.test.ts`'s own "Phase LL Task 4 review fix" describe
// block already established, so `frameSilence`/the driver's finish-grace
// clock/the hook's `summary-observations` handler are the genuine
// production wiring, not a bypass. No test file in `src/monitor/` imports
// another test file (that describe block's own header names the
// convention); every helper below is independently re-derived, not shared.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT (spec §6 criterion 2's own
// words): decode and fold, on real bytes, through the real stack, into the
// persisted record. The capture's 0x003F reached this run's subscriber
// because a DEV INSTRUMENT (`README.md`'s "hold-open ring",
// `__pm5HoldOpen__.ring()`) held a second, independent subscription open
// for the walk — not because THIS driver's own production subscribe list
// carried one at capture time. What this replay DOES exercise, correctly,
// is today's driver code: `driver.ts`'s own `t.subscribe(LOGGED_WORKOUT_
// UUID, ...)` (storage-spine Task 1) is unconditional and permanent
// (`mergeStatus`'s own "every characteristic stays subscribed... for the
// whole life of the transport" rule applies to this raw subscription too),
// so replaying the recorded 0x003F notification against TODAY's driver
// delivers it to that real subscriber regardless of who originally
// subscribed at capture time — this pin proves decode+fold on real bytes;
// production 0x003F REACHABILITY (the characteristic existing/being
// mappable on both transport arms) is Task 1's own subscription tests, not
// this file's job.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import {
  END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
  END_OF_WORKOUT_SUMMARY_UUID,
  LOGGED_WORKOUT_UUID,
} from "../../domain/monitor/pm5/uuids.js";
import { loadMonitorRun, type MonitorRun } from "./monitorRun";
import type { RunIdentity } from "./useMonitorSession";
import {
  parseRecording,
  type ParsedRecording,
  type RecordedEvent,
} from "./transports/recording";
import { createReplayTransport, type ReplayResult } from "./transports/replay";
import { withLiveness } from "./transports/liveness";

/** Same path-surgery idiom as `registerReplay.test.ts`/`connectedMetrics
 *  Replay.test.ts`/`captureReplay.test.ts` (all three cite the same reason:
 *  this project's jsdom environment resolves `new URL(...)` against
 *  `http://localhost:3000/` instead of a `file://` base, so plain string
 *  surgery on `import.meta.url` is used instead). `docs/monitor/sessions/`
 *  lives three directories above `app/src/monitor/`. */
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/burstReplay\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-23/",
  );

const CAPTURE_FILE = "keystone-pm5-recording-1787491974452.jsonl.gz";

/** Parsed once, at module scope (`captureReplay.test.ts`'s own established
 *  reasoning: gunzip+parse is fast but not worth repeating per test). */
const KEYSTONE_CAPTURE: ParsedRecording = parseRecording(
  gunzipSync(readFileSync(`${SESSIONS_DIR}${CAPTURE_FILE}`)).toString("utf8"),
);

/**
 * HAND-TRANSCRIBED, and byte-verified against the capture's own recorded
 * programming frames — same discipline `registerReplay.test.ts`'s own
 * `SESSION_1_PROGRAM`/`SESSION_2_PROGRAM` header comment describes
 * (`domain/monitor/pm5/commands.ts`'s `buildIntervalBlock` encoding).
 * The capture carries NO `header.program` (this file's own `KEYSTONE_
 * CAPTURE.header.program` is `undefined` — consistent with `recording.ts`'s
 * own "program is OPTIONAL" doc comment for a post-session download), so
 * this literal was reconstructed from the recorded `ce060021` tx bytes
 * (seq 14-17) and confirmed BYTE-FOR-BYTE against
 * `buildProgrammingSequence(KEYSTONE_PROGRAM)`'s own output in a throwaway
 * `tsx` script this session, both interval blocks: `SET_WORKOUTDURATION`
 * distance=250 (`08 17 01 01 03 05 80 00 00 00 fa 04` decodes the 250 m
 * distance-interval duration), `SET_TARGETPACETIME` `00 00 2f da` =
 * 0x00002fda = 12250 centiseconds/500m = 122.5 s/500m (2:02.5), and
 * `SET_RESTDURATION 00 00` = 0 s — two identical 250m/122.5-pace/no-rest
 * work intervals, matching README.md's "2×250m, no rest" and reproducing
 * the assembled tx frame `f1 76 3b 18 01 00 01 01 08 17 01 01 03 05 80 00
 * 00 00 fa 04 02 00 00 06 04 00 00 2f da 14 01 01 18 01 01 17 01 01 03 05
 * 80 00 00 00 fa 04 02 00 00 06 04 00 00 2f da 14 01 01 13 02 01 01 55 f2`
 * exactly. The replay's own `result.divergences` (asserted empty below,
 * bug-independent first) is the SECOND, independent proof this transcription
 * is right — a wrong `targetSplit` fails that assertion, not silently.
 */
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

/** No library workout behind this run — it is a real captured erg session,
 *  not a library-fixture replay (`registerReplay.test.ts`/`connectedMetrics
 *  Replay.test.ts` both hand-transcribe their identities the same way, for
 *  the same reason: the fixture's realism here comes from the wire bytes
 *  themselves, not from routing through `buildDraft`/`fromWorkout`). */
const KEYSTONE_IDENTITY: RunIdentity = {
  workoutId: null,
  title: "2×250m Keystone",
  logSeed: { steps: [], paces: {} },
};

/** Frozen for BOTH replay runs below (the real burst run and the
 *  burst-stripped control) so `MonitorRun.startedAt`/`completedAt` — both
 *  derived from `MonitorSessionDeps.now()` at the instant each hook calls
 *  it — read identically on both records. Without this, the two runs'
 *  otherwise-identical records would differ on two fields for no reason
 *  but wall-clock jitter between two sequential `it()` steps, and the
 *  "byte-identical-but-for-observations" comparison below would need to
 *  carve those two fields out for a reason that has nothing to do with the
 *  burst. */
const FIXED_NOW = new Date("2026-08-23T09:28:00.000Z");

/** Strips every 0x0039/0x003A/0x003F rx notification from a parsed
 *  recording's own event list — the control run's only difference from the
 *  real one. Every other event (every 0x0031/0x0032/0x0033/0x0037/0x0038
 *  tick, every tx, the scan/connect/subscribe/disconnect entries) survives
 *  untouched, so the control replay still reaches the identical terminal
 *  transition (state 12) off the identical General Status stream — it just
 *  never hears the burst that would let the driver buffer or fold a
 *  summary. This is `noteSummary`'s OWN wire-side rule, exercised by
 *  omission rather than by mocking anything the driver does with the bytes
 *  it is given. */
function stripBurst(events: RecordedEvent[]): RecordedEvent[] {
  const burstChars: string[] = [
    END_OF_WORKOUT_SUMMARY_UUID,
    END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
    LOGGED_WORKOUT_UUID,
  ];
  return events.filter(
    (e) => !("dir" in e && e.dir === "rx" && burstChars.includes(e.char)),
  );
}

interface ReplayOutcome {
  divergences: string[];
  record: MonitorRun | null;
}

/**
 * Drives `events` through the real transport-replay engine, composed with
 * the SAME `withLiveness` decorator production's own `defaultTransport`
 * always applies (`useMonitorSession.test.ts`'s "Phase LL Task 4 review
 * fix" describe block, "the genuine production wiring, not a bypass"), into
 * a FRESH `useMonitorSession` instance obtained through
 * `vi.doMock("../adapters/monitorTransport")` + `vi.resetModules()` — that
 * file's own established idiom for reaching the real hook under a replay
 * transport, restated here rather than imported (this repo's own
 * convention: no test file in `src/monitor/` imports another). `driver
 * Options.now`/`.schedule` bind to the SAME `replay.clock` the recorded
 * `t` values replay against, exactly as `registerReplay.test.ts`'s/
 * `connectedMetricsReplay.test.ts`'s own `replaySession` helpers do one
 * layer down — so `FINISH_GRACE_MS`/the liveness watchdog read the
 * identical clock the wire timing is scripted on, never two independent
 * clocks that could drift for no reason.
 *
 * Called TWICE in the one test below (the real burst run, then the
 * burst-stripped control) — `vi.doMock` simply re-registers its factory
 * each call, and `vi.resetModules()` forces a genuinely fresh module graph
 * (a fresh `useMonitorSession`, a fresh `driver.ts`, a fresh `monitorRun.ts`
 * instance) each time, so nothing about the first run's driver/hook state
 * leaks into the second. `loadMonitorRun()` — this FILE's own static
 * import, never the freshly-reimported module's own — is what reads the
 * result back: both module instances read/write the identical
 * `localStorage` key, a shared global neither module graph owns privately,
 * the same fact `useMonitorSession.test.ts`'s own interceptingTransport
 * tests already rely on when they call the file-level `loadMonitorRun()`
 * after driving a freshly re-imported hook.
 */
async function runReplay(events: RecordedEvent[]): Promise<ReplayOutcome> {
  const recording: ParsedRecording = {
    header: KEYSTONE_CAPTURE.header,
    events,
  };
  const replay = createReplayTransport(recording);
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
    const pending = result.current.program(KEYSTONE_PROGRAM, KEYSTONE_IDENTITY);
    replayResult = await replay.run();
    await pending;
  });

  return { divergences: replayResult.divergences, record: loadMonitorRun() };
}

describe("the walk's own finish, replayed to the byte (storage-spine design spec §2/§6 criterion 2)", () => {
  afterEach(() => {
    vi.doUnmock("../adapters/monitorTransport");
    vi.doUnmock("../adapters/appLifecycle");
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("the burst-first race, replayed end-to-end into the real hook: summaryTotals, verificationBytes, the real split's final interval, endedBy — and byte-identical-but-for-observations against a burst-stripped control", async () => {
    localStorage.clear();

    // --- the real capture: the burst genuinely beat our own terminal ----
    const real = await runReplay(KEYSTONE_CAPTURE.events);

    // Bug-independent sanity first (this repo's own convention throughout
    // `registerReplay.test.ts`/`connectedMetricsReplay.test.ts`): if the
    // hand-transcribed program is wrong, THIS fails, not the assertions
    // below it.
    expect(real.divergences).toStrictEqual([]);
    expect(real.record).not.toBeNull();
    const realRecord = real.record!;

    expect(realRecord.endedBy).toBe("finished");
    expect(realRecord.completedAt).not.toBeNull();

    // The record's ONLY writer for these two fields is `appendSummary
    // Observations`, folded on by `reconcileSummary`'s split-won branch
    // (driver.ts) the instant the buffered 0x0039 is consumed alongside
    // the split that already won — spec §6 criterion 2's own numbers.
    expect(realRecord.summaryTotals).toStrictEqual({
      workElapsedSeconds: 138.7,
      workDistanceMeters: 500,
    });
    expect(realRecord.verificationBytes).toBeDefined();
    expect(Array.from(realRecord.verificationBytes!.slice(0, 8))).toStrictEqual(
      [0x27, 0xd8, 0xf3, 0x6e, 0xe1, 0x52, 0x55, 0x5b],
    );

    // `summaryDetail` (RC-3, storage-spine design spec §2, PR 1 Task 3) —
    // hand-decoded HERE off seq 516's own raw hex (never by calling the
    // parser: `78 35 1c 09 2e 36 00 88 13 00 19 00 00 00 00 65 00 08 6b 05`,
    // `parseEndOfWorkoutSummary`'s own byte offsets, interface-notes.md
    // §23/§24): offset 10 `19` = 25 (avgStrokeRate); offsets 11-14
    // `00 00 00 00` are ALL the heart-rate `0`/`255` sentinel
    // (`domain/monitor/pm5/parse.ts`'s `heartRate()`, D5) — no belt was
    // worn on this walk, so every HR field is `null`; offset 15 `65` = 101
    // (dragFactorAverage); offset 16 `00` -> null (recoveryHeartRateBpm,
    // same sentinel); offset 17 `08` = 8 (workoutType); offsets 18-19
    // `6b 05` LE = 0x056b = 1387, /10 = 138.7 (avgPaceSecondsPer500m) —
    // matching `summaryTotals.workElapsedSeconds` above is NOT a
    // coincidence, it is a SCALE ORACLE (PM gate on PR #190): a 500m
    // piece's pace-per-500m IS its elapsed time by identity, and the two
    // fields decode from DIFFERENT byte ranges — so their agreement at
    // 138.7 externally confirms the /10 scale the BLE doc alone could not
    // (the doc was wrong about Last Split Time two pages earlier). The
    // terminate capture corroborates: 24.3s/76m implies 159.9 vs the
    // wire's decoded 159.8.
    expect(realRecord.summaryDetail).toStrictEqual({
      avgStrokeRate: 25,
      endingHeartRateBpm: null,
      avgHeartRateBpm: null,
      minHeartRateBpm: null,
      maxHeartRateBpm: null,
      dragFactorAverage: 101,
      workoutType: 8,
      recoveryHeartRateBpm: null,
      avgPaceSecondsPer500m: 138.7,
    });

    // The final interval is the REAL 0x0037's own shape (splitInterval
    // TimeSeconds/splitIntervalDistanceMeters, decoded off seq 514's raw
    // hex `c7 1a 00 c4 09 00 ae 02 00 fa 00 00 00 00 00 00 01 02`:
    // offset 6 `ae 02 00`/10 = 68.6s, offset 9 `00 fa 00` = 250m) — NEVER
    // the summary-derived fallback shape (which would have no split
    // averages and OMIT `restDistanceMeters` entirely, `driver.ts`'s own
    // `deriveFinalIntervalFromSummary` caller comment). The split won this
    // race; the burst only ever contributes OBSERVATIONS on top of it.
    expect(realRecord.actuals.length).toBe(2);
    const finalActual = realRecord.actuals[realRecord.actuals.length - 1]!;
    expect(finalActual.elapsedSeconds).toBeCloseTo(68.6, 5);
    expect(finalActual.distanceMeters).toBe(250);
    // A summary-derived actual always carries `avgSplit: null` (`driver.ts`'s
    // own "THE AVERAGES ARE NULL" comment) and no `restDistanceMeters` at
    // all — a REAL split's own decode never does either, which is what
    // discriminates the two shapes here without reading any internal log.
    expect(finalActual.avgSplit).not.toBeNull();
    expect(finalActual.restDistanceMeters).toBeDefined();

    // --- the control: identical capture, burst stripped programmatically ---
    const control = await runReplay(stripBurst(KEYSTONE_CAPTURE.events));

    expect(control.divergences).toStrictEqual([]);
    expect(control.record).not.toBeNull();
    const controlRecord = control.record!;

    expect(controlRecord.summaryTotals).toBeUndefined();
    expect(controlRecord.summaryDetail).toBeUndefined();
    expect(controlRecord.verificationBytes).toBeUndefined();
    expect(controlRecord.endedBy).toBe("finished");

    // BYTE-IDENTICAL-BUT-FOR-OBSERVATIONS (spec §6 criterion 2 rephrased
    // as the plan's own task-5 wording): every field the burst does not
    // touch reads identically whether or not the machine's own burst ever
    // arrived — decode+fold changes ONLY the three observation fields,
    // nothing about the split-derived record underneath them.
    const {
      summaryTotals: _st,
      summaryDetail: _sd,
      verificationBytes: _vb,
      ...realWithoutBurst
    } = realRecord;
    expect(realWithoutBurst).toStrictEqual(controlRecord);
  });
});
