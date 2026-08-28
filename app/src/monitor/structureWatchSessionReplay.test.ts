// RC-37 (design spec 2026-08-27-link-authority-design.md §1, [R5]) — Part
// 2's own end-to-end proof: the committed `menu-at-ready-recording.jsonl.gz`
// capture, replayed through the REAL driver AND the REAL
// `useMonitorSession` hook (the same harness idiom `lifecycleReplay.test.ts`
// already established: path-surgery `SESSIONS_DIR`, `vi.doMock` the
// transport seam, `vi.resetModules()`, dynamic re-import so this file's own
// fresh `useMonitorSession` picks the mock up).
//
// What this proves that `structureWatchReplay.test.ts` (driver-only) does
// not: that the driver's `programDropped` event actually REACHES the hook's
// own handler, that the hook exits WITHOUT sending a terminate (no program
// left to terminate — [R5]'s own constraint), and that it does so from
// exactly the "ready" phase the walk's own trigger describes (Menu at
// READY), never touching `runOpen`/a stored record (a pre-row session opens
// no record at all — Phase LM's own finding, restated in the design spec's
// §1 consumer section).

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import { RECEIVE_CHARACTERISTIC_UUID } from "../../domain/monitor/pm5/uuids.js";
import type { Transport } from "../../domain/monitor/types.js";
import type { RunIdentity } from "./useMonitorSession";
import { parseRecording, type ParsedRecording } from "./transports/recording";
import { createReplayTransport, type ReplayResult } from "./transports/replay";
import { withLiveness, type LivenessDeps } from "./transports/liveness";

const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/structureWatchSessionReplay\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-27/",
  );

const CAPTURE_FILE = "menu-at-ready-recording.jsonl.gz";

const MENU_AT_READY_CAPTURE: ParsedRecording = parseRecording(
  gunzipSync(readFileSync(`${SESSIONS_DIR}${CAPTURE_FILE}`)).toString("utf8"),
);

/** Hand-transcribed from the capture's own `ce060021` programming tx bytes
 *  — byte-verified (`structureWatchReplay.test.ts`'s own header carries the
 *  decode method and this file's own transcription is copied verbatim from
 *  there, per this project's "no test file in src/monitor/ imports another"
 *  convention). `header.program` is absent, true of every real capture. */
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

const MENU_AT_READY_IDENTITY: RunIdentity = {
  workoutId: null,
  title: "RC-37 walk fixture",
  logSeed: { steps: [], paces: {} },
};

const FIXED_NOW = new Date("2026-08-27T09:00:00.000Z");

interface SessionReplayOutcome {
  divergences: string[];
  programDropped: boolean;
  phase: string;
  runOpen: boolean;
  /** Total wire writes to `RECEIVE_CHARACTERISTIC_UUID` across the whole
   *  replay. Compared against the CAPTURE's own recorded tx count on the
   *  same characteristic (below) rather than a before/after split around
   *  `program()`'s own resolve — `replay.run()` delivers every remaining
   *  event, mismatches included, before that resolve is ever awaited, so a
   *  split taken afterward would already include a spurious extra write
   *  and prove nothing (caught by this test's own self-mutation: adding a
   *  `driver.terminate()` call to the consumer left the before/after split
   *  at 0 regardless, because both snapshots were taken on the far side of
   *  it). Equal to the recording's own count is the [R5] constraint: our
   *  own program() sends byte-for-byte what the capture recorded
   *  (`divergences` empty proves it) and nothing else — the capture itself
   *  carries no terminate tx at all, since Menu was pressed ON THE DEVICE,
   *  never through our own command. */
  totalWireWrites: number;
}

async function runReplay(): Promise<SessionReplayOutcome> {
  const replay = createReplayTransport(MENU_AT_READY_CAPTURE);

  // A thin counting wrapper around the replay transport (mirrors
  // `useMonitorSession.test.ts`'s own `spyTransport`, redeclared here per
  // this project's per-file convention) — split into "writes before the
  // detector's own ring entry" and "after", read from the driver's own log
  // once the replay finishes, so the split needs no extra plumbing here.
  let wireWrites = 0;
  const countingTransport: Transport = {
    ...replay.transport,
    write(characteristicId: string, bytes: Uint8Array): Promise<void> {
      if (characteristicId === RECEIVE_CHARACTERISTIC_UUID) wireWrites += 1;
      return replay.transport.write(characteristicId, bytes);
    },
  };

  const mockDefaultTransport = vi.fn((deps: LivenessDeps) =>
    withLiveness(countingTransport, {
      ...deps,
      now: () => replay.clock.now(),
      schedule: (fn, ms) => replay.clock.schedule(fn, ms),
    }),
  );
  vi.doMock("../adapters/monitorTransport", () => ({
    defaultTransport: mockDefaultTransport,
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
    const pending = result.current.program(
      MENU_AT_READY_PROGRAM,
      MENU_AT_READY_IDENTITY,
    );
    replayResult = await replay.run();
    await pending;
  });

  return {
    divergences: replayResult.divergences,
    programDropped: result.current.programDropped,
    phase: result.current.phase,
    runOpen: result.current.runOpen,
    totalWireWrites: wireWrites,
  };
}

/** How many `tx` events the capture itself recorded on
 *  `RECEIVE_CHARACTERISTIC_UUID` — the [R5] baseline: our own program()
 *  reproduces these bytes exactly (`divergences` empty), and nothing sent
 *  afterward (no terminate) may add to the count. */
const RECORDED_RECEIVE_TX_COUNT = MENU_AT_READY_CAPTURE.events.filter(
  (e) => "dir" in e && e.dir === "tx" && e.char === RECEIVE_CHARACTERISTIC_UUID,
).length;

describe("useMonitorSession, replayed against walk-2026-08-27/menu-at-ready: RC-37's consumer wiring end to end", () => {
  afterEach(() => {
    vi.doUnmock("../adapters/monitorTransport");
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("exits to idle with no terminate sent and no record opened — [R5]: 'take it back here', no banner, nothing to save", async () => {
    localStorage.clear();
    const out = await runReplay();

    // Bug-independent sanity first, same convention every replay harness in
    // this project leads with.
    expect(out.divergences).toStrictEqual([]);

    expect(out.programDropped).toBe(true);
    // Reset away from "ready"/"programming" — the same two states Cancel
    // itself is only ever valid from.
    expect(out.phase).toBe("idle");
    // No row: a pre-row session opens no record at all (Phase LM's own
    // finding) — nothing was ever open to leave open.
    expect(out.runOpen).toBe(false);
    // [R5]'s own constraint: the machine has already left, so there is no
    // program of ours left to terminate — total wire writes equal exactly
    // what the capture itself recorded, not one write more.
    expect(out.totalWireWrites).toBe(RECORDED_RECEIVE_TX_COUNT);
  });
});
