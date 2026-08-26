// Phase LM PR 1, fix round 2 — Task 4: THE GATE THAT WAS MISSING.
//
// James asked, after the 2026-08-26 walk: *"why wasn't this caught by
// replaying a normal-ish recording?"* The answer was that it could not be.
// Four instruments were blind at once, by construction (design spec
// `docs/superpowers/specs/2026-08-26-lost-monitor-trigger-design.md`, Task 4's
// own table):
//
//   - record/replay — `RecordedEvent` had no lifecycle member at all. The
//     recorder sits at the TRANSPORT seam; this defect entered from iOS ABOVE
//     it, so no recording could carry it and no replay could reproduce it.
//   - unit tests — they `vi.doMock("../adapters/appLifecycle")`, replacing the
//     very seam that was wrong.
//   - coverage — `src/native/**` is `v8 ignore`d, and that is the arm that was
//     wrong.
//   - e2e — runs on web, where the lifecycle arm is a deliberate no-op
//     (`adapters/appLifecycle.ts`'s Phase LL minor 9 header).
//
// `recording.ts` now has a `lifecycle` event kind and `replay.ts` emits it
// through an `onLifecycle` callback, so a recording can carry "the app went
// away here / came back here" and a DESK replay can drive the whole class.
// This file is what that buys: the real committed keystone capture, spliced,
// driven through the real `useMonitorSession` — exit criterion 8.
//
// WHAT THIS FILE PROVES, AND WHAT IT DOES NOT. It proves the SESSION's
// handling of a lifecycle transition, from the `adapters/appLifecycle`
// callback inward — which is where the banner decision lives. It does NOT
// prove which `@capacitor/app` event that callback is bound to on a device;
// that is one plugin call above this seam and is pinned by
// `src/native/appLifecycle.test.ts` (Task 1), which mocks `@capacitor/app`
// itself. Together the two cover the whole path; neither covers it alone, and
// saying so here is the point of the task.
//
// NO CAUSE IS ASSERTED ANYWHERE BELOW. A silence has three undistinguished
// producers (design spec); the recording says the app went away and came back,
// the assertions say what was MEASURED and what was DECIDED, and nothing here
// claims to know why.
//
// The capture: `docs/monitor/sessions/walk-2026-08-23/keystone-pm5-recording-
// 1787491974452.jsonl.gz` (README.md's laptop keystone, 2×250 m no rest) —
// picked because its General Status stream is DEMONSTRABLY healthy end to end:
// 254 × 0x0031 notifications, median inter-arrival 990 ms, MAXIMUM 1260 ms,
// zero gaps over 2000 ms (measured this session off the decompressed file,
// not carried from any document). A stream that never once approaches
// `SILENCE_THRESHOLD_MS` is exactly the fixture that makes a false alarm
// unambiguous: nothing in these bytes can honestly raise the banner. State
// byte 5 (rowing) runs from t=33979 ms to t=172309 ms, so the splice point
// below (t≈100.6 s) is mid-row, mid-piece — the moment the walk failed at.
//
// Harness idiom follows `burstReplay.test.ts` (the only other file that drives
// the REAL hook under a replay transport): path-surgery `SESSIONS_DIR`, a
// hand-transcribed `WorkoutProgram` whose correctness is proven by the replay's
// own empty `divergences`, `vi.doMock` + `vi.resetModules()` + dynamic
// re-import. Re-derived rather than imported — no test file in `src/monitor/`
// imports another (that convention is stated in `connectedMetricsReplay.test
// .ts`'s own header).

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import { GENERAL_STATUS_UUID } from "../../domain/monitor/pm5/uuids.js";
import type { AppLifecycleEvent } from "../adapters/appLifecycle";
import type { RunIdentity } from "./useMonitorSession";
import {
  parseRecording,
  type ParsedRecording,
  type RecordedEvent,
} from "./transports/recording";
import { createReplayTransport, type ReplayResult } from "./transports/replay";
import { withLiveness, type LivenessDeps } from "./transports/liveness";

/** Same path-surgery idiom as `burstReplay.test.ts`/`registerReplay.test.ts`
 *  (jsdom resolves `new URL(...)` against `http://localhost:3000/`, so string
 *  surgery on `import.meta.url` is used instead). */
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/lifecycleReplay\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-23/",
  );

const CAPTURE_FILE = "keystone-pm5-recording-1787491974452.jsonl.gz";

/** Parsed once at module scope. **This parse is also the format's own
 *  back-compatibility proof**: the file on disk predates the `lifecycle`
 *  event kind by three days and carries none, and the union member added for
 *  this task is purely additive inside `pm5-recording/v1` — no tag bump, no
 *  new required field, nothing an old file could fail. The `divergences`
 *  assertions below extend that from "it parses" to "it still REPLAYS,
 *  unchanged, through the real driver". */
const KEYSTONE_CAPTURE: ParsedRecording = parseRecording(
  gunzipSync(readFileSync(`${SESSIONS_DIR}${CAPTURE_FILE}`)).toString("utf8"),
);

/** HAND-TRANSCRIBED from the capture's own `ce060021` programming tx bytes
 *  (seq 14-17), same discipline `registerReplay.test.ts`'s own header
 *  describes. Correctness is not asserted on trust: a wrong field makes the
 *  replay's tx barrier mismatch, and every test below asserts
 *  `divergences` is empty BEFORE it asserts anything about the banner. */
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

const KEYSTONE_IDENTITY: RunIdentity = {
  workoutId: null,
  title: "2×250m Keystone",
  logSeed: { steps: [], paces: {} },
};

const FIXED_NOW = new Date("2026-08-23T09:28:00.000Z");

/** The splice point, in the capture's own recorded milliseconds: the hole
 *  between the 0x0033 at t≈100580 (seq 301) and the next 0x0031 at t≈101569
 *  (seq 302), mid-row under state byte 5. */
const BACKGROUND_AT_MS = 100700;

/** The last General Status arrival before the splice — the reading every gap
 *  below is measured FROM, because `decideResumeLatch` keys on 0x0031 alone
 *  (`useMonitorSession.ts`, `GENERAL_STATUS_UUID`), not on any notification.
 *  READ OUT OF THE CAPTURE rather than typed in: the recorded `t` values are
 *  fractional `performance.now()` readings, and a rounded literal here would
 *  make the exact-string assertions below a transcription exercise instead of
 *  a measurement. It is seq 299, t≈100578.9. */
const LAST_STATUS_BEFORE_SPLICE_MS = (() => {
  const before = KEYSTONE_CAPTURE.events.filter(
    (e) =>
      "dir" in e &&
      e.dir === "rx" &&
      e.char === GENERAL_STATUS_UUID &&
      e.t < BACKGROUND_AT_MS,
  );
  const last = before[before.length - 1];
  if (last === undefined) throw new Error("no 0x0031 before the splice point");
  return last.t;
})();

/** The exact ring line the session writes for a resume, so a test can say
 *  what it expects rather than pattern-match it. Mirrors
 *  `useMonitorSession.ts`'s own template — deliberately, so that a change to
 *  the wording (which exit criterion 4 governs: it must assert no cause) has
 *  to come through here. */
function resumeLine(gapMs: number, silent: boolean, latched: boolean): string {
  return (
    `resume gap=${gapMs}ms threshold=2500ms ` +
    `silent=${silent} latched=${latched}`
  );
}

/** Renumbers `seq` after a splice so the file stays internally consistent
 *  (`seq` is used only in divergence messages, but a recording with duplicate
 *  sequence numbers is not a recording anybody should read). */
function renumber(events: RecordedEvent[]): RecordedEvent[] {
  return events.map((e, seq) => ({ ...e, seq }));
}

/**
 * THE WALK'S OWN SHAPE: the app reports going away and coming back while the
 * frame stream never stops. Nothing is shifted and nothing is removed — every
 * recorded notification still arrives at its recorded time, straight through
 * the window, exactly as 233 of them did across the walk's nine supposed gaps
 * (`docs/monitor/sessions/walk-2026-08-26/README.md`). `awayMs` is deliberately
 * far under `SILENCE_THRESHOLD_MS`.
 */
function spliceBriefInterruption(
  events: RecordedEvent[],
  awayMs: number,
): RecordedEvent[] {
  const inserted: RecordedEvent[] = [
    { seq: 0, t: BACKGROUND_AT_MS, kind: "lifecycle", event: "background" },
    {
      seq: 0,
      t: BACKGROUND_AT_MS + awayMs,
      kind: "lifecycle",
      event: "foreground",
    },
  ];
  const merged = [...events, ...inserted].sort((a, b) => a.t - b.t);
  return renumber(merged);
}

/**
 * A GENUINE GAP: the app goes away, the stream STOPS for `awayMs`, and the app
 * comes back. Every event at or after the background is shifted forward by
 * `awayMs`, so the recorded wire timeline resumes exactly where it left off
 * with a real hole punched in it — the thing a suspended WebView would leave
 * behind, and the case the alarm exists for.
 */
function spliceSuspension(
  events: RecordedEvent[],
  awayMs: number,
): RecordedEvent[] {
  const shifted = events.map((e) =>
    e.t >= BACKGROUND_AT_MS ? { ...e, t: e.t + awayMs } : e,
  );
  const inserted: RecordedEvent[] = [
    { seq: 0, t: BACKGROUND_AT_MS, kind: "lifecycle", event: "background" },
    {
      seq: 0,
      t: BACKGROUND_AT_MS + awayMs,
      kind: "lifecycle",
      event: "foreground",
    },
  ];
  const merged = [...shifted, ...inserted].sort((a, b) => a.t - b.t);
  return renumber(merged);
}

interface RingEntry {
  seq: number;
  kind: string;
  detail: string;
}

interface LifecycleReplayOutcome {
  divergences: string[];
  /** `frameSilence` as the hook reports it once the whole log has played. */
  frameSilence: boolean;
  ring: RingEntry[];
}

/**
 * Drives `events` through the real replay engine into a FRESH
 * `useMonitorSession`, with the real `withLiveness` decorator composed the way
 * `defaultTransport` composes it in production — the hook's OWN
 * `onSilence`/`onRecovery` handlers, spread through from the `deps` it passes
 * in, never stubs. The decorator's clock is rebound to the replay clock (the
 * one deviation from production, and it is the point of a replay: the recorded
 * `t` values ARE the timeline the watchdog and the resume predicate measure).
 *
 * `onLifecycle` is wired to the callback `useMonitorSession` registers through
 * `adapters/appLifecycle` — so a `lifecycle` event in the recording arrives at
 * exactly the seam iOS delivers to on a device, and the code under test is the
 * production handler, unmodified.
 */
async function runReplay(
  events: RecordedEvent[],
): Promise<LifecycleReplayOutcome> {
  const recording: ParsedRecording = {
    header: KEYSTONE_CAPTURE.header,
    events,
  };
  let lifecycleCb: ((event: AppLifecycleEvent) => void) | undefined;
  const replay = createReplayTransport(recording, {
    onLifecycle: (event) => lifecycleCb?.(event),
  });

  vi.doMock("../adapters/monitorTransport", () => ({
    defaultTransport: vi.fn((deps: LivenessDeps) =>
      withLiveness(replay.transport, {
        ...deps,
        now: () => replay.clock.now(),
        schedule: (fn, ms) => replay.clock.schedule(fn, ms),
      }),
    ),
  }));
  vi.doMock("../adapters/appLifecycle", () => ({
    registerAppLifecycleListener: vi.fn(
      (cb: (e: AppLifecycleEvent) => void) => {
        lifecycleCb = cb;
        return () => undefined;
      },
    ),
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

  return {
    divergences: replayResult.divergences,
    frameSilence: result.current.frameSilence,
    ring: JSON.parse(result.current.exportLog()) as RingEntry[],
  };
}

function lifecycleEntries(ring: RingEntry[]): RingEntry[] {
  return ring.filter((e) => e.kind === "app-lifecycle");
}

describe("Phase LM Task 4 (design spec exit criterion 8): a lifecycle transition, replayed", () => {
  afterEach(() => {
    vi.doUnmock("../adapters/monitorTransport");
    vi.doUnmock("../adapters/appLifecycle");
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("THE BUG: the app comes back over a stream that never stopped — nothing raises the banner, and the ring reports the gap it measured", async () => {
    localStorage.clear();
    const AWAY_MS = 300;
    const out = await runReplay(
      spliceBriefInterruption(KEYSTONE_CAPTURE.events, AWAY_MS),
    );

    // Bug-independent sanity first: a wrong program transcription, or a
    // splice that disturbed the recorded wire order, fails HERE rather than
    // silently colouring the assertions below.
    expect(out.divergences).toStrictEqual([]);

    // The recording reached the seam at all. Without this, every assertion
    // below would pass vacuously against a harness that never delivered the
    // lifecycle event — the exact blindness this task exists to remove.
    const lifecycle = lifecycleEntries(out.ring);
    expect(lifecycle).toHaveLength(1);

    // THE DEFECT ITSELF, ASSERTED BEFORE ANY WORDING. Ordered deliberately:
    // against the pre-fix hook this is the line that goes red, so this test
    // is demonstrably about the BANNER and not about a ring string that
    // happened to change in the same commit.
    //
    // And it says the banner never went up AT ANY INSTANT, not merely "not at
    // the end". `frameSilence` has exactly two writers that set it true: the
    // watchdog's own `onSilence`, which records a `liveness-silence` ring
    // entry every time it fires, and the resume latch. Neither entry present
    // and the flag false at the end means nothing ever raised it.
    expect(out.ring.filter((e) => e.kind === "liveness-silence")).toStrictEqual(
      [],
    );
    expect(out.frameSilence).toBe(false);

    // What was MEASURED and what was DECIDED. The gap runs from the last
    // 0x0031 before the splice to the foreground at t=100700+300 — about
    // 421 ms, six times under the 2500 ms threshold — and `latched=false` is
    // the fix's own verdict on it. Exit criterion 4 lives here too: this
    // string reports numbers and a decision, and asserts no cause.
    const measuredGapMs =
      BACKGROUND_AT_MS + AWAY_MS - LAST_STATUS_BEFORE_SPLICE_MS;
    expect(measuredGapMs).toBeLessThan(2500);
    expect(lifecycle[0]!.detail).toBe(resumeLine(measuredGapMs, false, false));
  });

  it("THE ALARM STILL BITES: the app comes back after a real hole in the stream — the resume latches, on the gap it measured", async () => {
    localStorage.clear();
    const AWAY_MS = 4000;
    const out = await runReplay(
      spliceSuspension(KEYSTONE_CAPTURE.events, AWAY_MS),
    );

    expect(out.divergences).toStrictEqual([]);

    const lifecycle = lifecycleEntries(out.ring);
    expect(lifecycle).toHaveLength(1);
    // THE DISCRIMINATING ASSERTION. `frameSilence` alone cannot tell the two
    // alarms apart here — a 4 s hole trips the watchdog on its own, so the
    // banner would be up either way. `latched=true` is the RESUME handler's
    // own verdict, and it is what goes red if the alarm is deleted rather
    // than corrected. A test that only proved the quiet case above would
    // license exactly that deletion.
    const measuredGapMs =
      BACKGROUND_AT_MS + AWAY_MS - LAST_STATUS_BEFORE_SPLICE_MS;
    expect(measuredGapMs).toBeGreaterThanOrEqual(2500);
    expect(lifecycle[0]!.detail).toBe(resumeLine(measuredGapMs, true, true));
    expect(out.frameSilence).toBe(true);
  });

  it("back-compatibility, against the committed file itself: the capture replays unchanged with no lifecycle event in it, and the session records no resume", async () => {
    localStorage.clear();
    const out = await runReplay(KEYSTONE_CAPTURE.events);

    expect(out.divergences).toStrictEqual([]);
    expect(lifecycleEntries(out.ring)).toStrictEqual([]);
    expect(out.frameSilence).toBe(false);
  });
});
