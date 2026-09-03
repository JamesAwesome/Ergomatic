// Wave F PR 1 Task 3 (design spec 2026-08-31-lifecycle-design.md §1, review
// P1-3): the seam test the spec's "gate is two tests with honestly-scoped
// claims" paragraph names first — "the seam test drives the REAL driver
// until IT emits." James's review of rev 2 (P1-3) rejected an earlier
// revision's synthesised-event version for proving only the handler and the
// storage path, "not the driver->hook seam a live session actually
// crosses." This file drives that seam for real: the committed
// `walk-2026-08-16/session-1-keystone-2x250r0.jsonl` capture plays through
// the REAL driver AND the REAL `useMonitorSession` hook (the harness idiom
// `structureWatchSessionReplay.test.ts` established for RC-37's READY-phase
// half: path-surgery `SESSIONS_DIR`, `vi.doMock` the transport seam,
// `vi.resetModules()`, dynamic re-import so this file's own fresh
// `useMonitorSession` picks the mock up) to a LIVE phase carrying one
// completed interval actual, and only THEN does constructed input begin.
//
// **THE HONEST BOUNDARY, stated verbatim (spec §1's own words): "The BYTES
// are constructed (no committed recording carries this shape mid-live,
// §0.4); the DETECTOR, the emit, the listener seam, and everything
// downstream are real."** No committed capture holds a genuine mid-live
// program drop to replay (§0.4) — the wrong-structure General Status
// frames below are hand-built to RC-37's own documented positive shape
// (`driver.test.ts`'s armed-watch describe block, `~:8480`: workoutType=1,
// workoutDurationRaw=0, workoutDurationType=128 — session 4a's own
// "empty arm" reading, reused verbatim by every armed-watch fixture in this
// codebase, copied here rather than imported per this project's "no test
// file in src/monitor/ imports another" convention) and injected directly
// at the transport's own subscriber callbacks, past `createReplayTransport`'s
// recorded-event queue entirely. Everything else in this file — the
// program() call, the driver's `armedWatch` comparator, its
// `STRUCTURE_MISMATCH_TICKS`/`STRUCTURE_MISMATCH_WINDOW_MS` thresholds, the
// `programDropped` event, the hook's real listener (Task 2's live arm,
// `useMonitorSession.ts`'s `event.kind === "programDropped"` handler), and
// the record it closes — is exactly what a genuine session would run.
//
// **A DEPARTURE FROM THE BRIEF'S OWN DESCRIPTION, worth stating plainly**
// (SDLC item 10): the brief describes RC-37's signature as "all three
// `expectedArmedStructure` fields diverged." That is true for a TIME-kind
// program (`useMonitorSession.test.ts`'s own Task 2 block, whose single
// 60s interval predicts `workoutDurationType: 0`). `session-1-keystone-
// 2x250r0.jsonl`'s own program is DISTANCE-kind (2x250m r0,
// `registerReplay.test.ts`'s own `SESSION_1_PROGRAM`), whose
// `expectedArmedStructure` predicts `workoutDurationType: 128` — the SAME
// ordinal the canonical wrong-structure fixture carries (both a distance
// interval's healthy duration-type identifier AND the unprogrammed empty
// arm's own duration-type identifier are 128, `commands.ts`'s
// `expectedArmedStructure` and `WRONG_STRUCTURE`'s own citations,
// verified this session against seq510's own real armed-structure
// broadcast: workoutType=8, workoutDurationRaw=250,
// workoutDurationType=128). Only TWO of the three fields (`workoutType`:
// 1 vs 8, `workoutDurationRaw`: 0 vs 250) actually diverge here — still
// sufficient to fail `driver.ts`'s `sameStructure` (an exact match on all
// three, `driver.ts:5161`) and trigger the detector, so the test's claim
// holds; the field COUNT in the brief's description does not, for this
// specific armed program.

import { readFileSync } from "node:fs";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import {
  WORKOUTSTATE_WAITTOBEGIN,
  type GeneralStatus,
} from "../../domain/monitor/pm5/parse.js";
import { buildGeneralStatusBytes } from "../../domain/monitor/pm5/statusFrames.js";
import { GENERAL_STATUS_UUID } from "../../domain/monitor/pm5/uuids.js";
import type { Transport } from "../../domain/monitor/types.js";
import type { RunIdentity } from "./useMonitorSession";
import { loadMonitorRun } from "./monitorRun";
import {
  parseRecording,
  type ParsedRecording,
  type RecordedEvent,
} from "./transports/recording";
import {
  createReplayTransport,
  type ReplayClock,
  type ReplayResult,
} from "./transports/replay";
import { withLiveness, type LivenessDeps } from "./transports/liveness";
import { releasingSchedule } from "../test/statusSubscriptions";

const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/liveDropSeamReplay\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-16/",
  );

const CAPTURE_FILE = "session-1-keystone-2x250r0.jsonl";

const FULL_CAPTURE: ParsedRecording = parseRecording(
  readFileSync(`${SESSIONS_DIR}${CAPTURE_FILE}`, "utf8"),
);

/** Where this file cuts the capture off: seq 510 (t=91486.9ms) — ten real
 *  General Status ticks past the interval-0 -> interval-1 boundary
 *  (seq 445/446, the 0x0037/0x0038 pair carrying interval 0's own
 *  completed actual: 65.3s/249.8m, `registerReplay.test.ts`'s own
 *  transcribed totals). By seq 510 the machine has been rowing interval 1
 *  for ~10.3s (real elapsed=10.33s, distance=7.3m into this interval,
 *  decoded below) — comfortably inside `"live"`, nowhere near the
 *  capture's own tail (the final boundary at seq 879 and `disconnect` at
 *  seq 884, both left OUT of this slice on purpose: leg (a)'s own "live
 *  phase with >=1 completed interval actual" needs the run still open,
 *  not finished). `parsed.events[seq] `'s own index equals its `seq`
 *  (verified this session: the file's `seq` runs 0..883 with no gaps), so
 *  a plain array slice is exact. */
const LIVE_CUTOFF_SEQ = 510;

const LIVE_CAPTURE_PREFIX: ParsedRecording = {
  header: FULL_CAPTURE.header,
  events: FULL_CAPTURE.events.slice(0, LIVE_CUTOFF_SEQ + 1),
};

/** Hand-transcribed from `registerReplay.test.ts`'s own `SESSION_1_PROGRAM`
 *  (copied verbatim per this project's "no test file in src/monitor/
 *  imports another" convention) — that file's own header names its two
 *  independent sources (HANDOFF.md's shape plus a byte-level decode of the
 *  capture's own `ce060021` programming tx against `commands.ts`'s
 *  `buildIntervalBlock` encoding). 2x250m, no rest. */
const SESSION_1_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "distance",
      value: 250,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 0,
    },
    {
      type: "work",
      kind: "distance",
      value: 250,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

const LIVE_DROP_IDENTITY: RunIdentity = {
  workoutId: null,
  title: "walk-2026-08-16 keystone replay",
  logSeed: { steps: [], paces: {} },
};

const FIXED_NOW = new Date("2026-08-16T00:00:00.000Z");

/** seq 510's own real broadcast, decoded by hand off the recorded hex
 *  ("09 04 00 49 00 00 08 01 05 01 02 fa 00 00 fa 00 00 80 66", u24LE @0
 *  /100 = elapsed, u24LE @3 /10 = distance, u24LE @11 = TWD whole metres —
 *  `parse.ts`'s documented 0x0031 layout, the same offsets
 *  `registerReplay.test.ts`'s own independent reader re-implements) — the
 *  "run's last real reading" the constructed wrong-armed frames below hold
 *  steady at, so injecting them cannot ALSO satisfy `continuity.ts`'s own
 *  reset signature (elapsed+distance+TWD all strictly backward in the same
 *  reading) — `useMonitorSession.test.ts`'s own Task 2 `wrongArmedStatus`
 *  doc comment names the identical hazard this guards against. */
const LAST_LIVE_ELAPSED_SECONDS = 10.33;
const LAST_LIVE_DISTANCE_METERS = 7.3;
const LAST_LIVE_TWD_METERS = 250;

/** RC-37's own canonical "empty arm" wrong structure — session 4a's real
 *  hardware reading for an armed-but-unprogrammed machine
 *  (`commands.ts`'s `expectedArmedStructure` doc comment), reused verbatim
 *  by `driver.test.ts`'s own `WRONG_STRUCTURE` and
 *  `useMonitorSession.test.ts`'s own `wrongArmedStatus` — copied here per
 *  this project's per-file convention, never imported. `elapsedSeconds`/
 *  `distanceMeters`/`totalWorkDistanceMeters` are the CALLER's per this
 *  file's own header — see `LAST_LIVE_*` above. */
function wrongArmedStatus(
  elapsedSeconds: number,
  distanceMeters: number,
  totalWorkDistanceMeters: number,
): Uint8Array {
  const status: GeneralStatus = {
    elapsedSeconds,
    distanceMeters,
    workoutType: 1,
    intervalType: 1,
    workoutState: WORKOUTSTATE_WAITTOBEGIN,
    rowingState: 0,
    strokeState: 0,
    totalWorkDistanceMeters,
    workoutDurationRaw: 0,
    workoutDurationType: 128,
    dragFactor: 130,
  };
  return buildGeneralStatusBytes(status);
}

/** Extends `ReplayHandle.clock` with a manual `advance()` past the point
 *  where `replay.run()` itself stops moving the virtual clock forward
 *  (`replay.ts`'s own `advanceClock` only ever runs while iterating
 *  recorded events) — this file's own three constructed ticks need REAL
 *  elapsed time between them for `STRUCTURE_MISMATCH_WINDOW_MS`
 *  (`driver.test.ts`'s own armed-watch block: "1000ms apart" x3 clears
 *  both the 3-tick and 2000ms thresholds), and nothing in the recording
 *  can supply that once the recording itself has been exhausted.
 *  `schedule()` is passed straight through unmodified: nothing this file
 *  injects needs a driver-scheduled timer to fire after `replay.run()`
 *  resolves (the structure watch is tick-driven off `now()` reads at each
 *  notification, never a scheduled callback — `driver.ts`'s own
 *  `armedWatch` block). */
function extendClock(base: ReplayClock): ReplayClock & {
  advance(ms: number): void;
} {
  let extraMs = 0;
  return {
    now: () => base.now() + extraMs,
    schedule: (cb, ms) => base.schedule(cb, ms),
    advance(ms: number): void {
      extraMs += ms;
    },
  };
}

/** Wraps `inner` so this file can call constructed frames directly into
 *  whatever subscribed to `uuid` — bypassing `createReplayTransport`'s own
 *  recorded-event queue entirely, which is the point: the capture itself
 *  carries no mid-live drop to replay (this file's own header, §0.4), so
 *  the only way to deliver RC-37's signature past the point the recording
 *  ends is to call the driver's own registered callback directly, the same
 *  way a real characteristic notification would arrive. Tracks its own
 *  subscriber map (rather than reaching into `inner`'s private one, which
 *  is opaque past the `Transport` interface) so `notify()` can call
 *  exactly the callback `withLiveness` wraps `inner.subscribe`'s own
 *  callback with — the full real chain (liveness bookkeeping, then the
 *  driver's own dispatch), not a shortcut around it. */
function injectable(
  inner: Transport,
): Transport & { notify(uuid: string, bytes: Uint8Array): void } {
  const subs = new Map<string, Set<(bytes: Uint8Array) => void>>();
  return {
    ...inner,
    subscribe(uuid, cb) {
      let set = subs.get(uuid);
      if (!set) {
        set = new Set();
        subs.set(uuid, set);
      }
      set.add(cb);
      const unsub = inner.subscribe(uuid, cb);
      return () => {
        set!.delete(cb);
        unsub();
      };
    },
    notify(uuid, bytes) {
      for (const cb of subs.get(uuid) ?? []) cb(bytes);
    },
  };
}

interface LiveDropOutcome {
  divergences: string[];
  phaseBeforeDrop: string;
  actualsBeforeDrop: unknown[];
  phase: string;
  endedBy: string | null;
  closeReason: string | null;
  runOpen: boolean;
  programDropped: boolean;
  actuals: unknown[];
  structureLeftLogEntries: number;
}

async function runLiveDropReplay(): Promise<LiveDropOutcome> {
  const replay = createReplayTransport(LIVE_CAPTURE_PREFIX);
  const clock = extendClock(replay.clock);
  const wrapped = injectable(replay.transport);

  const mockDefaultTransport = vi.fn((deps: LivenessDeps) =>
    withLiveness(wrapped, {
      ...deps,
      now: () => clock.now(),
      schedule: (fn, ms) => clock.schedule(fn, ms),
    }),
  );
  vi.doMock("../adapters/monitorTransport", () => ({
    defaultTransport: mockDefaultTransport,
  }));
  vi.resetModules();

  const { useMonitorSession: freshUseMonitorSession } =
    await import("./useMonitorSession");

  const { result, unmount } = renderHook(() =>
    freshUseMonitorSession({
      now: () => FIXED_NOW,
      driverOptions: {
        now: () => clock.now(),
        schedule: releasingSchedule((cb, ms) => clock.schedule(cb, ms)),
      },
    }),
  );

  await act(async () => {
    await result.current.connect();
  });

  let replayResult: ReplayResult = { divergences: [] };
  await act(async () => {
    const pending = result.current.program(
      SESSION_1_PROGRAM,
      LIVE_DROP_IDENTITY,
    );
    replayResult = await replay.run();
    await pending;
  });

  // Bug-independent sanity, and leg (a)'s own precondition — this file's
  // own convention, matching every replay harness in this project: assert
  // the setup reached the state this test needs BEFORE asserting anything
  // about the drop itself.
  const phaseBeforeDrop = result.current.phase;
  const actualsBeforeDrop = result.current.actuals;

  // THE CONSTRUCTED HALF (this file's own header). Three consecutive,
  // stable, wrong-structure "armed" ticks, 1000ms apart —
  // `STRUCTURE_MISMATCH_TICKS`/`STRUCTURE_MISMATCH_WINDOW_MS` both cleared
  // by the numbers (`driver.test.ts`'s own "fires" test uses the identical
  // shape: tick1 stamps `mismatchSince`, tick3 arrives 2000ms later).
  for (let i = 0; i < 3; i += 1) {
    clock.advance(1000);
    act(() => {
      wrapped.notify(
        GENERAL_STATUS_UUID,
        wrongArmedStatus(
          LAST_LIVE_ELAPSED_SECONDS,
          LAST_LIVE_DISTANCE_METERS,
          LAST_LIVE_TWD_METERS,
        ),
      );
    });
  }

  const logEntries = JSON.parse(result.current.exportLog()) as {
    kind: string;
  }[];
  const structureLeftLogEntries = logEntries.filter(
    (e) => e.kind === "structure-left",
  ).length;

  const outcome: LiveDropOutcome = {
    divergences: replayResult.divergences,
    phaseBeforeDrop,
    actualsBeforeDrop,
    phase: result.current.phase,
    endedBy: result.current.endedBy,
    closeReason: result.current.closeReason,
    runOpen: result.current.runOpen,
    programDropped: result.current.programDropped,
    actuals: result.current.actuals,
    structureLeftLogEntries,
  };

  act(() => {
    unmount();
  });

  return outcome;
}

describe("useMonitorSession, replayed against walk-2026-08-16/session-1-keystone-2x250r0 through a constructed mid-live drop: Wave F PR 1's live arm end to end (design spec 2026-08-31-lifecycle-design.md §1, review P1-3)", () => {
  afterEach(() => {
    vi.doUnmock("../adapters/monitorTransport");
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("drives the REAL driver until its own armed-watch emits 'structure-left'/programDropped, and the REAL hook's live listener closes the record: actuals kept, closeReason published, runOpen false, programDropped stays false", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const out = await runLiveDropReplay();

    // Bug-independent sanity first: the real replay through the boundary
    // must itself be clean, and must have actually reached the state this
    // test is about — a "live" phase with the interval 0 actual already
    // recorded. If either of these is wrong, the assertions below are
    // proving nothing about the drop.
    expect(out.divergences).toStrictEqual([]);
    expect(out.phaseBeforeDrop).toBe("live");
    expect(out.actualsBeforeDrop.length).toBeGreaterThanOrEqual(1);

    // THE DRIVER'S OWN DETECTOR FIRED — not inferred from hook state, read
    // off `exportLog()` (`MonitorSession`'s "ONE READ-ONLY WINDOW ONTO THE
    // DRIVER'S EVENT LOG"), the same ring `driver.ts`'s `armedWatch` block
    // writes `"structure-left"` into on the real emit.
    expect(out.structureLeftLogEntries).toBe(1);

    // THE HOOK'S REAL LIVE LISTENER received it and closed the record
    // through the ENDED path (Task 2, spec §1's own "Mechanism").
    expect(out.phase).toBe("ended");
    expect(out.endedBy).toBe("machine");
    expect(out.closeReason).toBe("program-dropped");
    expect(out.runOpen).toBe(false);
    // The pre-row exit signal must NOT fire on a live drop (spec §1's own
    // "does NOT set programDropped: true" — it would wrongly arm
    // `ConnectedInterstitial`'s `onExit` effect against this navigation).
    expect(out.programDropped).toBe(false);

    // ACTUALS INTACT: interval 0's own completed actual survives the drop
    // untouched — the live arm's whole point (spec §1: "keep what was
    // rowed").
    expect(out.actuals).toStrictEqual(out.actualsBeforeDrop);

    // THE STORED RECORD, closed and honestly reasoned.
    const stored = loadMonitorRun();
    expect(stored).not.toBeNull();
    expect(stored?.completedAt).not.toBeNull();
    expect(stored?.terminated).toBe(true);
    expect(stored?.endedBy).toBe("program-dropped");
    expect(stored?.actuals.length).toBeGreaterThanOrEqual(1);
  });
});

// Self-documentation only — not a test, just this file's own record that
// `parsed.events[seq] === seq` was verified for THIS capture before
// `LIVE_CAPTURE_PREFIX` was built on that assumption (this file's own
// `LIVE_CUTOFF_SEQ` doc comment). Left as a standing regression pin: a
// future re-capture that drops or reorders events would silently break the
// slice's own meaning, and this line turns that into a red assertion
// instead of a quiet wrong cutoff.
describe("LIVE_CAPTURE_PREFIX's own precondition", () => {
  it("FULL_CAPTURE's events are seq-indexed with no gaps, so a plain array slice by seq is exact", () => {
    FULL_CAPTURE.events.forEach((e: RecordedEvent, i: number) => {
      expect(e.seq).toBe(i);
    });
  });
});
