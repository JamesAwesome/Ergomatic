// Hand-off store implementation plan, Task 1 (docs/superpowers/plans/
// 2026-08-30-handoff-store.md) — the store plan's own gate suite; THIS is
// its leg 1, §10 row 8 ("the §3 defect row"), red against `main`'s
// `recordActual` on the fresh branch's first commit, per the plan's Global
// Constraints ("row 8 ... is red against main's `recordActual` on the FIRST
// commit"). Binding: docs/superpowers/specs/2026-08-30-handoff-protocol-
// design.md §3 and §10 row 8.
//
// THE DEFECT (spec §3, `origin/main:monitorRun.ts:832-834` on this branch's
// base — read this session, not carried by memory): `recordActual`'s late
// branch (a boundary arriving after the record already closed, "the finish
// grace") rebuilds its base from `stillLive(run.startedAt)` — a FRESH
// `loadMonitorRun()` read, filtered only by `startedAt` — rather than from
// `run`, the record the caller is actually holding. When the live→closed
// write (`completeMonitorRun`'s own `saveMonitorRun` call, `monitorRun.ts:
// 920`) is swallowed by a storage failure, `stillLive` hands the late
// boundary the LAST WRITE THAT ACTUALLY SUCCEEDED — a stale, still-open
// copy from before the close — and that becomes `base`: `completedAt`
// reverts to `null`, `endedBy` is gone (never spread from a `base` that
// never had it), and the `wasClosed && base.endedBy === "finished"` guard
// that would recompute `workSeconds`/`workMeters`/etc. never fires either,
// because it reads `base.endedBy`, not the correctly-closed value the
// caller was holding a moment ago.
//
// WHY THIS CAPTURE (README.md's own provenance table,
// `docs/monitor/sessions/walk-2026-08-25/README.md`, Piece 1 — "Walk Rests
// (`w 1' r1 / w 500m r1 / w 1'`)", a NATURAL finish, never photographed but
// wire-corroborated by W-5/W-6/W-9 in the same README): `recordActual`'s
// late branch exists for exactly ONE production shape — "at a natural
// finish the PM5 sends the final interval's 0x0037/0x0038 pair one
// notification AFTER the general-status frame that ended the workout"
// (`useMonitorSession.ts`'s own `intervalComplete` handler comment). A
// TERMINATE never opens this window at all (`driver.ts`'s own leading
// comment on its `else` branch: "a `terminated` close opens no finish grace
// ... no further split can ever reach `recordedActuals` after this point" —
// RC-9a), which is why `smoke-terminated-recording.jsonl.gz` (walk-2026-
// 08-25, Piece 2 — a Menu terminate, already `summaryHoldReplay.test.ts`'s
// own capture for the BURST/summary hold) cannot exercise this row: its
// ending never asks `recordActual` to accept anything late. Decoded THIS
// session, off the raw bytes (never carried from the spec or the README by
// memory), via a throwaway `tsx` script built on this repo's own
// `parseRecording` + `domain/monitor/pm5/parse.ts`:
//   - seq 2440's raw 0x0031 (`70 17 00 7b 08 00 08 00 0a 01 04 b9 04 00 70
//     17 00 00 65`) is the FIRST general-status frame reading
//     `workoutState=10` (WORKOUTEND, `toMonitorState` → "finished") at
//     t=416622.6 ms — this is the frame `driver.ts`'s own terminal-state
//     branch closes the run on, opens the finish grace
//     (`FINISH_GRACE_MS = 3000`) against, and emits `{kind:
//     "workoutComplete"}` from, synchronously.
//   - seq 2443/2444's raw 0x0037/0x0038 (`70 17 00 7b 08 00 58 02 00 d9 00
//     00 00 00 00 00 00 03` / `70 17 00 17 75 00 66 05 0c 00 f3 02 20 0e 84
//     00 64 03 00`) are the THIRD interval's own split pair, decoding via
//     `parseSplitIntervalData`/`parseAdditionalSplitIntervalData` to
//     `splitIntervalNumber: 3`, `splitIntervalTimeSeconds: 60`,
//     `splitIntervalDistanceMeters: 217` — arriving at t=416802.3/416802.4,
//     ~180 ms AFTER the finished frame above and well inside the 3000 ms
//     finish grace: the exact "boundary lands after the close" ordering
//     `recordActual`'s late branch exists for, on real wire bytes, not a
//     hand-built fixture. (seq 2445-2447's 0x0039/0x003A/0x003F summary
//     burst arrives later still, t≈417162-417164 — the OTHER post-close
//     writer's territory, `appendSummaryObservations`, not this row's
//     concern; left in the replayed event stream unstripped because it is
//     harmless to every assertion below.)
//
// THE PROGRAM, hand-transcribed and byte-verified against the capture's own
// recorded programming frames (same discipline `burstReplay.test.ts`'s own
// `KEYSTONE_PROGRAM` comment describes): the capture carries no
// `header.program` (a post-session download never carries one — `recording
// .ts`'s own "program is OPTIONAL" comment), so `RESTS_PROGRAM` below was
// reconstructed from the recorded `ce060021` tx bytes (seq 15-19, the
// single CSAFE frame `76 55 18 01 00 01 01 08 17 01 00 03 05 00 00 00 17 70
// 04 02 00 3c 06 04 00 00 3b 60 14 01 01 18 01 01 17 01 01 03 05 80 00 00
// 01 f4 04 02 00 3c 06 04 00 00 3b 60 14 01 01 18 01 02 17 01 00 03 05 00
// 00 00 17 70 04 02 00 00 06 04 00 00 3b 60 14 01 01 13 02 01 01`, framing
// stripped) and confirmed BYTE-FOR-BYTE against
// `buildProgrammingSequence(RESTS_PROGRAM)`'s own output in a throwaway
// `tsx` script this session, all five chunks, identically to the captured
// bytes above: interval 0 `SET_INTERVALTYPE=00` (time) `SET_WORKOUTDURATION
// 00 00 00 17 70` (0x1770 centiseconds = 60.00 s) `SET_RESTDURATION 00 3c`
// (60 s) `SET_TARGETPACETIME 00 00 3b 60` (0x3b60 centiseconds = 152.00
// s/500m); interval 1 `SET_INTERVALTYPE=01` (distance)
// `SET_WORKOUTDURATION 80 00 00 01 f4` (identifier 0x80 = distance, 0x01f4
// = 500 m) `SET_RESTDURATION 00 3c` (60 s) same target pace; interval 2
// `SET_INTERVALTYPE=00` (time) same 60 s duration, `SET_RESTDURATION 00 00`
// (0 s — the final interval, no trailing rest), same target pace —
// matching README.md's "w 1' r1 / w 500m r1 / w 1'" and the decoded
// 0x0037/0x0038 rest fields (W-9: interval 1/2 both carry a 60 s trailing
// rest, interval 3 carries 0). The replay's own `divergences` (asserted
// empty in both `it()`s below, bug-independent first, same convention as
// every other `src/monitor/*Replay.test.ts`) is the SECOND, independent
// proof this transcription is right — a wrong duration/pace/rest fails
// that assertion, not silently.
//
// Composition: the SAME `createReplayTransport` + `vi.doMock("../adapters/
// monitorTransport")` + `vi.resetModules()` + dynamic re-import idiom
// `burstReplay.test.ts` established — restated here rather than imported
// (this repo's own convention: no test file in `src/monitor/` imports
// another test file).
//
// THE FAULT INJECTION (plan Task 1's own brief, spec §10's header rule —
// "PAYLOAD-INSPECTING storage stubs — deny by content, never by count
// alone"): `installClosedWriteDenial` below spies on
// `Storage.prototype.setItem`, watches only `MONITOR_RUN_KEY`, and denies
// the FIRST write whose serialized payload carries a non-null
// `completedAt` (`completeMonitorRun`'s own live→closed write) — and every
// write to that key after it, forever, modelling a storage failure that
// never heals rather than one write happening to fail. Every write BEFORE
// the trigger (the run's own mid-piece boundary writes, which is what
// leaves the stale copy behind for `stillLive` to find) and every write to
// any OTHER key pass straight through to the real `setItem`.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import { MONITOR_RUN_KEY, loadMonitorRun, type MonitorRun } from "./monitorRun";
import type { RunIdentity } from "./useMonitorSession";
import { parseRecording, type ParsedRecording } from "./transports/recording";
import { createReplayTransport, type ReplayResult } from "./transports/replay";
import { withLiveness } from "./transports/liveness";

/** Same path-surgery idiom as `burstReplay.test.ts`/`registerReplay.test.ts`
 *  (this project's jsdom environment resolves `new URL(...)` against
 *  `http://localhost:3000/` instead of a `file://` base). `docs/monitor/
 *  sessions/` lives three directories above `app/src/monitor/`. */
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/handoffStoreReplay\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-25/",
  );

const CAPTURE_FILE = "rests-finished-recording.jsonl.gz";

/** Parsed once, at module scope (established convention, `burstReplay.test
 *  .ts`/`captureReplay.test.ts`). */
const RESTS_CAPTURE: ParsedRecording = parseRecording(
  gunzipSync(readFileSync(`${SESSIONS_DIR}${CAPTURE_FILE}`)).toString("utf8"),
);

/** See the file header's decode section — byte-verified against
 *  `buildProgrammingSequence`'s own output, not merely plausible-looking. */
const RESTS_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 152.0,
      displaySpm: null,
      restSeconds: 60,
    },
    {
      type: "work",
      kind: "distance",
      value: 500,
      targetSplit: 152.0,
      displaySpm: null,
      restSeconds: 60,
    },
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 152.0,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

/** No library workout behind this run — a real captured erg session, same
 *  reasoning as `burstReplay.test.ts`'s `KEYSTONE_IDENTITY`. */
const RESTS_IDENTITY: RunIdentity = {
  workoutId: null,
  title: "Walk Rests",
  logSeed: { steps: [], paces: {} },
};

/** Frozen for every replay run below — `burstReplay.test.ts`'s own reason:
 *  `MonitorRun.startedAt`/`completedAt` are both derived from `Monitor
 *  SessionDeps.now()` at the instant the hook calls it, and nothing about
 *  this file's assertions depends on wall-clock jitter between `it()`s. */
const FIXED_NOW = new Date("2026-08-25T09:00:00.000Z");

/**
 * §10 row 8's fault injection: deny `MONITOR_RUN_KEY`'s live→closed write
 * (the first payload carrying a non-null `completedAt`) and every write to
 * that key after it — see the file header's "THE FAULT INJECTION" section.
 * Captures the REAL `Storage.prototype.setItem` before installing the spy
 * so allowed writes (every other key, and every write before the trigger)
 * still reach jsdom's actual implementation rather than a mock no-op.
 *
 * **Also records every ATTEMPTED `MONITOR_RUN_KEY` write's parsed body,
 * denied or not** — spec §3's own words, "the existing spy already
 * receives the serialized value." This is deliberate, not incidental: once
 * the close write is denied, the denial is STICKY (every write to this key
 * after it is denied too, forever — the "denied-at-close" shape of §10 row
 * 7's four, distinct from "healed-on-Retry"), which means storage can
 * NEVER again show a closed record for this key — not today, and not once
 * the store lands, because the sticky rule denies by CONTENT
 * (`completedAt` non-null) and a correctly-closed record's write always
 * carries exactly that content. A raw `loadMonitorRun()` read after this
 * stub is installed is therefore not a fair oracle for "did the fix work"
 * — it is permanently the same regardless. What DOES change under a fix is
 * what `recordActual`'s late branch COMPUTES as `next` and attempts to
 * persist — captured here, independent of whether the attempt was allowed
 * through.
 */
function installClosedWriteDenial(): { attempts: () => MonitorRun[] } {
  const realSetItem = Storage.prototype.setItem;
  const attempts: MonitorRun[] = [];
  let denyFromHere = false;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (key === MONITOR_RUN_KEY) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = undefined;
      }
      if (typeof parsed === "object" && parsed !== null) {
        attempts.push(parsed as MonitorRun);
        if (
          !denyFromHere &&
          "completedAt" in parsed &&
          (parsed as { completedAt: unknown }).completedAt !== null
        ) {
          denyFromHere = true;
        }
      }
      if (denyFromHere) {
        throw new DOMException(
          "simulated close-write denial (design spec §3/§10 row 8)",
          "QuotaExceededError",
        );
      }
    }
    return realSetItem.call(this, key, value);
  });
  return { attempts: () => attempts };
}

interface ReplayOutcome {
  divergences: string[];
  record: MonitorRun | null;
}

/**
 * Drives `RESTS_CAPTURE.events` through the real transport-replay engine
 * into a FRESH `useMonitorSession` instance — the identical `vi.doMock`/
 * `vi.resetModules()` composition `burstReplay.test.ts`'s own `runReplay`
 * established (restated here, not imported: no test file in `src/monitor/`
 * imports another). `driverOptions.now`/`.schedule` bind to the SAME
 * `replay.clock` the recorded `t` values replay against, so `FINISH_GRACE_
 * MS` reads the identical clock the wire timing is scripted on.
 */
async function runReplay(): Promise<ReplayOutcome> {
  const replay = createReplayTransport(RESTS_CAPTURE);
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
    const pending = result.current.program(RESTS_PROGRAM, RESTS_IDENTITY);
    replayResult = await replay.run();
    await pending;
  });

  return { divergences: replayResult.divergences, record: loadMonitorRun() };
}

describe("the finish-grace boundary vs. a denied live→closed write (design spec §3, §10 row 8) — plan Task 1's own gate", () => {
  afterEach(() => {
    vi.doUnmock("../adapters/monitorTransport");
    vi.doUnmock("../adapters/appLifecycle");
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // RED until the store lands (plan Tasks 2-3). This asserts the DESIRED
  // invariant (spec §10 row 8: the record stays closed, keeps all its
  // actuals, and reaches the reader complete) under a denied live→closed
  // write — not the bug's own output. It fails today against THIS
  // branch's `main`-based `recordActual` (`monitorRun.ts:832-834`) and is
  // expected to start passing, unmodified, once the store lands: the base
  // for a late boundary stops being a fresh, possibly-stale storage read
  // and becomes the caller's own current entry (spec §3, "the base is the
  // caller's own current record"). Proven on a real natural-finish
  // capture whose final boundary genuinely lands after the close, not a
  // hand-built fixture standing in for the wire.
  //
  // **Asserted against the LAST ATTEMPTED `MONITOR_RUN_KEY` write, never
  // `loadMonitorRun()`.** The stub's denial is STICKY (§10 row 7's
  // "denied-at-close" shape: fails and stays failed, unlike "healed-on-
  // Retry") and keys on the exact content a correctly-closed record always
  // carries (`completedAt` non-null) — so once triggered, storage can
  // NEVER again show a closed record for this key, whether `recordActual`
  // is fixed or not. That makes a raw storage read structurally unable to
  // distinguish today's bug from tomorrow's fix; it would stay red
  // forever even after Tasks 2-3 land. What DOES change under the fix is
  // what `recordActual`'s late branch COMPUTES and attempts to persist —
  // exactly what `installClosedWriteDenial`'s `attempts()` captures,
  // independent of whether the write was let through. In production this
  // in-memory value is what the store's own `read()` will return to the
  // reader (spec §8: "memory entry when present ... memory wins"); today,
  // before the store exists, it is the closest same-layer proxy for that
  // future read, and matches this file's own `runReplay` layer (the hook
  // + `monitorRun.ts`, never a full `LogSession` mount — that is row 12's
  // job, not this one's).
  it("RED — the record stays closed and keeps all three actuals even when the live→closed write is denied", async () => {
    localStorage.clear();
    const stub = installClosedWriteDenial();

    const outcome = await runReplay();

    // Bug-independent sanity first (this repo's convention throughout
    // `src/monitor/*Replay.test.ts`): if the hand-transcribed program were
    // wrong, THIS fails, never the assertions below it. The fault
    // injection above only ever throws on `MONITOR_RUN_KEY`, so a
    // programming mismatch would still surface as a real divergence here.
    expect(outcome.divergences).toStrictEqual([]);

    // The late boundary's own attempted write is the LAST entry — nothing
    // else touches `MONITOR_RUN_KEY` after it in this capture (the summary
    // burst that follows moments later, seq 2445-2447, calls
    // `appendSummaryObservations`, which declines outright once `stillLive`
    // reads a `completedAt: null` record and never attempts a write at
    // all — `monitorRun.ts:1096-1098`).
    const attempts = stub.attempts();
    expect(attempts.length).toBeGreaterThan(0);
    const lastAttempt = attempts[attempts.length - 1]!;

    // THE ASSERTION THAT IS RED TODAY: `completeMonitorRun`'s own
    // live→closed write was denied, and `stillLive` (`monitorRun.ts:
    // 1021-1025`) hands the finish-grace boundary the last write that DID
    // succeed instead — a stale, still-open mid-piece copy. Today that
    // makes every line below fail: `completedAt` comes back `null`
    // (never the non-null ISO string a correct close produces), `endedBy`
    // comes back `undefined` (never "finished"), and the sums are
    // `undefined` (the `wasClosed && base.endedBy === "finished"` guard
    // reads the STALE base's `endedBy`, which was never set).
    expect(lastAttempt.completedAt).not.toBeNull();
    expect(lastAttempt.endedBy).toBe("finished");
    expect(lastAttempt.actuals.length).toBe(3);
    expect(lastAttempt.actuals[2]!.index).toBe(2);
    expect(lastAttempt.workSeconds).toBeDefined();
    expect(lastAttempt.workMeters).toBeDefined();
    expect(lastAttempt.restSeconds).toBeDefined();
    expect(lastAttempt.restMeters).toBeDefined();
  });

  // THE CONTROL — proves the RED assertion above is the defect, not a
  // harness mistake: identical capture, identical program, storage never
  // denied. The finish-grace boundary is still handled by `stillLive`
  // underneath (this branch has no other code path), but with storage
  // healthy `stillLive` hands it back the record `completeMonitorRun`
  // itself just closed, so the late branch's spread carries the real
  // `endedBy`/`completedAt` forward and the `computeWorkRestSums` guard
  // fires correctly.
  it("the control: storage healthy — the identical finish-grace boundary closes correctly, all three actuals kept", async () => {
    localStorage.clear();

    const outcome = await runReplay();

    expect(outcome.divergences).toStrictEqual([]);
    expect(outcome.record).not.toBeNull();
    const healthy = outcome.record!;

    expect(healthy.completedAt).not.toBeNull();
    expect(healthy.endedBy).toBe("finished");
    expect(healthy.terminated).toBe(false);
    expect(healthy.actuals.length).toBe(3);
    expect(healthy.actuals[2]!.index).toBe(2);

    // Sums are DEFINED and self-consistent with the record's own actuals
    // — computed from the record under test, never hand-typed against a
    // hex dump, so this can't drift from a transcription slip elsewhere
    // in this file.
    expect(healthy.workSeconds).toBeDefined();
    expect(healthy.workMeters).toBeDefined();
    expect(healthy.workSeconds).toBeCloseTo(
      healthy.actuals.reduce((sum, a) => sum + a.elapsedSeconds, 0),
      5,
    );
    expect(healthy.workMeters).toBeCloseTo(
      healthy.actuals.reduce((sum, a) => sum + a.distanceMeters, 0),
      5,
    );
  });
});
