// PHASE RC CLOSE-OUT — THE ORACLE CORPUS. Zero product code: ten of the
// fourteen committed wire recordings are replayed through the real
// `createPm5Driver`, and the two oracles RC-9 shipped are asserted on each
// one — either the verdict and its numbers, or the exact reason it refused
// to compare. Until now both oracles were pinned on ONE capture each
// (`avgPaceVerdict.replay.test.ts`'s session-2, `driver.test.ts:11443`'s
// synthetic 2-interval program), and everything else we know about them
// came from reading a ring by hand after a walk.
//
// THE FOUR RECORDINGS THIS FILE DOES NOT REPLAY, and why — counted with
// `find docs/monitor/sessions -name "*.jsonl*"`, not asserted (the exit
// pass caught an earlier version of this header claiming "every committed
// recording", which was 8 of 14; a coverage headline is a countable claim
// and this is the count):
//   - `walk-2026-08-16/session-2-wu-4unequal.jsonl` — replayed already, by
//     `avgPaceVerdict.replay.test.ts`, which is RC-9a's own flagship
//     assertion. Replaying it here too would duplicate, not extend.
//   - `walk-2026-08-17/step-1-...` — carries ZERO rx frames. Nothing to
//     replay.
//   - `walk-2026-08-17/step-3-...` — the run reaches 2 of its 5 programmed
//     intervals, so no oracle can speak. It is the ONLY committed capture
//     whose header carries a `program` object outright, and the only one
//     carrying a legacy `type: "warmup"` interval — the population
//     `recordAvgPaceVerdict`'s own doc comment calls unreachable
//     post-Phase-WU. Worth a test the day someone wants that arm
//     exercised; it cannot be exercised from this capture.
//   - `walk-2026-08-17/step-4-...` — no boundary is ever recorded, so
//     there is no "our side" to compare.
//
// WHAT EACH ORACLE MEASURES, stated before any of it is trusted (recurring
// failure #11's second half — "an oracle that shares your definition is a
// mirror", the rule that retired `recordTwdVerdict` in RC-9c):
//
//   - `avg-pace-verdict` compares 0x0032's `averageSplit` — a figure the
//     PM5 itself computes and we never derive — against our own quotient
//     over the per-interval actuals we assembled from 0x0037/0x0038. Two
//     different computers of the same quantity (cumulative, work-only
//     average pace), one of them ours. NOT a mirror.
//   - `rest-distance-verdict` compares 0x003A's Total Rest Distance
//     against the sum of `restDistanceMeters` across our recorded actuals,
//     which come off 0x0037/0x0038 — again a different register from the
//     one being checked.
//   - THE THIRD COMPARISON, RC-9(b), lives in its own `describe` below:
//     0x0039's own end-of-workout totals against the sum of the interval
//     actuals we recorded. RC-9(b) has stood QUEUED since 2026-08-25 on a
//     corpus fact — "of the eight committed recordings exactly ONE carries
//     a 0x0039 at all, and it is the ONLY one of the eight with ZERO rest
//     frames" — which the corpus has since outgrown: SIX of the fourteen
//     recordings now carry a 0x0039 rx frame, and three of those six are
//     rest-bearing. Our side of it EXCLUDES the null-index actual a
//     terminate synthesizes out of 0x0039 itself (`sumRecordedActuals`'s
//     own comment) — including it would be the mirror again, and one
//     capture in this corpus sets exactly that trap.
//     That is not a claim about the ROADMAP being careless;
//     it is recurring failure #16's second corollary in the ordinary
//     direction — a corpus fact with an expiry date, re-checked by listing
//     the capture directory rather than by re-reading the sentence.
//
// WHAT THIS FILE DOES NOT DO. It never asserts that a walk PRODUCED a
// verdict — only that this wire stream, through this driver, does. The
// distinction is not academic: `walk-2026-08-25/rests-finished-ring.json`
// (73 entries, seq 0..72, well inside `eventLog`'s 500-entry capacity, so
// nothing was evicted) goes straight from `summary-reconciled — split-won`
// to `disconnect-requested`, with NO `avg-pace-verdict` between them — the
// silence that was RC-14. Replaying that walk's OWN recording produces a
// ring that matches it entry for entry and then records the verdict in
// exactly that gap. What this file contributed to that finding, and what
// it still asserts, is that the recorded wire stream is SUFFICIENT to
// produce the verdict, so whatever swallowed it at the erg was not in the
// traffic.
//
// **RC-14 IS CLOSED (2026-09-09), and the answer was one frame below this
// file's floor.** Nothing swallowed the verdict: it fired and reached the
// in-memory ring. The deferred teardown had already serialised the
// SNAPSHOT that becomes `MONITOR LOG · COPY`, because it was running
// re-entrantly inside the driver's own event delivery, one statement
// before `recordAvgPaceVerdict`. The fix takes a third snapshot once that
// stack unwinds. This file could never have caught it and is not meant to
// — it holds a log it constructs itself and never stashes; the gate lives
// in `useMonitorSession.test.ts`'s RC-14 block. The walked capture's own
// derivation is in `docs/monitor/sessions/walk-2026-08-25/README.md`,
// under the dated addendum to finding W-2.

import { describe, expect, it } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { MonitorEvent } from "../../domain/monitor/types.js";
import {
  parseAdditionalSplitIntervalData,
  parseAdditionalSummary,
  parseEndOfWorkoutSummary,
} from "../../domain/monitor/pm5/parse.js";
import {
  ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
  END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
  END_OF_WORKOUT_SUMMARY_UUID,
} from "../../domain/monitor/pm5/uuids.js";
import { logbookWatts } from "../session/logbookDerived";
import { createEventLog } from "./eventLog";
import {
  fromHexString,
  parseRecording,
  type ParsedRecording,
} from "./transports/recording";
import { createSubscribedDriver } from "../test/statusSubscriptions";
import { createReplayTransport, type ReplayResult } from "./transports/replay";
import { readCapture } from "../test/captures";

/** `relPath` is `walkDir/file` (the shape every call site below passes it
 *  in) — split once and handed to the shared loader. */
function loadCapture(relPath: string): ParsedRecording {
  const slash = relPath.indexOf("/");
  return parseRecording(
    readCapture(relPath.slice(0, slash), relPath.slice(slash + 1)),
  );
}

// ---------------------------------------------------------------------
// THE PROGRAMS. Five are re-declared verbatim from
// `structureWatchReplay.test.ts`, whose own header carries the byte-level
// provenance for each and whose zero-divergence replays prove them; this
// project's convention is that no test file in `src/monitor/` imports
// another. The sixth (`REST_BOUNDARY_PROGRAM`) is new to this file and its
// bytes are decoded in its own comment.
// ---------------------------------------------------------------------

/** `walk-2026-08-25/rests-finished-recording.jsonl.gz` — "Walk Rests"
 *  (`w 1' r1 / w 500m r1 / w 1'`), natural finish. RC-14's own capture. */
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
 *  (`w 1'`), Menu-killed at ~31 s, i.e. terminated INSIDE interval 1. */
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
 *  Boundaries", 3x250 m with a 1:00 rest after interval 1 only, terminated
 *  from the PM5's Menu 59.8 m into interval 3. */
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

/** `walk-2026-08-27/menu-at-ready-recording.jsonl.gz` — RC-37's own
 *  positive capture: armed, then Menu, never rowed. */
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

/** `walk-2026-08-23/keystone-pm5-recording-...jsonl.gz` — the laptop
 *  keystone (2x250 m, no rest), natural finish. The r0 case both oracles
 *  have to handle without a false alarm. */
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

/** `walk-2026-08-18-metrics/pyramid-pm5-recording-...jsonl.gz` — Phase
 *  CM's own exit walk, 300/700/300 m with r1 after the first two,
 *  deliberately rowed well off target. */
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

/** BOTH `walk-2026-08-28` captures — `rest-boundary-recording.jsonl.gz`
 *  (the walk's own gate leg: 3x1' with 1:00 rests, End pressed in the app
 *  during interval 2) and `end-on-interval-1-recording.jsonl.gz` (the
 *  aborted first attempt at the same leg). NEW to this file, and the two
 *  captures carry byte-identical programming frames — decoded from their
 *  own `ce060021` tx bytes, the same discipline
 *  `structureWatchReplay.test.ts` applies to the five above:
 *  `03 05 00 00 00 17 70` = duration id TIME / 6000 (60.00 s) on all three
 *  intervals; `04 02 00 3c` = rest 60 s on intervals 1 and 2,
 *  `04 02 00 00` = rest 0 on interval 3; `06 04 00 00 3b 60` = 15200
 *  centiseconds = 152.0 s/500 m target on all three. That matches that
 *  walk's own README ("3x1' time-only with 1:00 rests, ended in interval
 *  2") without being taken from it. */
const REST_BOUNDARY_PROGRAM: WorkoutProgram = {
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
      kind: "time",
      value: 60,
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

/** BOTH `walk-2026-08-16/session-1-keystone-2x250r0.jsonl` and
 *  `walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl` — added at
 *  the exit pass, which found them omitted from a corpus whose header
 *  claimed to hold everything. Their `ce060021` programming frames are
 *  BYTE-IDENTICAL to each other (seq 14-17 of both), decoded here the same
 *  way as `REST_BOUNDARY_PROGRAM`: two slots of
 *  `03 05 80 00 00 00 fa` = duration id DISTANCE / 250, `04 02 00 00` =
 *  rest 0 on both, `06 04 00 00 32 64` = 12900 centiseconds = 129.0 s/500 m.
 *  Note this is NOT `KEYSTONE_PROGRAM` above — same 2x250 r0 shape, a
 *  different target pace (129.0 against 122.5), which is why it is its own
 *  constant rather than a reuse. */
const KEYSTONE_2X250_R0_PROGRAM: WorkoutProgram = {
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

const RESTS_FINISHED = "walk-2026-08-25/rests-finished-recording.jsonl.gz";
const SESSION_1_KEYSTONE = "walk-2026-08-16/session-1-keystone-2x250r0.jsonl";
const STEP_2 = "walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl";
const SMOKE_TERMINATED = "walk-2026-08-25/smoke-terminated-recording.jsonl.gz";
const BOUNDARIES_TERMINATED =
  "walk-2026-08-27/boundaries-terminated-recording.jsonl.gz";
const MENU_AT_READY = "walk-2026-08-27/menu-at-ready-recording.jsonl.gz";
const KEYSTONE =
  "walk-2026-08-23/keystone-pm5-recording-1787491974452.jsonl.gz";
const PYRAMID =
  "walk-2026-08-18-metrics/pyramid-pm5-recording-1787090555458.jsonl.gz";
const REST_BOUNDARY = "walk-2026-08-28/rest-boundary-recording.jsonl.gz";
const END_ON_INTERVAL_1 =
  "walk-2026-08-28/end-on-interval-1-recording.jsonl.gz";

interface ReplayOutcome {
  divergences: string[];
  entries: ReturnType<ReturnType<typeof createEventLog>["entries"]>;
  events: MonitorEvent[];
  /** Every 0x0039 rx frame in the RAW capture, decoded by
   *  `parseEndOfWorkoutSummary` directly off the recorded bytes — never
   *  through the driver under test. The independent side of RC-9(b)'s
   *  comparison, and the same methodology `structureWatchReplay.test.ts`
   *  uses for its armed-frame count. */
  summaries: ReturnType<typeof parseEndOfWorkoutSummary>[];
}

async function replayThroughDriver(
  capturePath: string,
  program: WorkoutProgram,
  barrierTimeoutMs?: number,
): Promise<ReplayOutcome> {
  const parsed = loadCapture(capturePath);
  const summaries = parsed.events
    .filter(
      (e) =>
        "dir" in e && e.dir === "rx" && e.char === END_OF_WORKOUT_SUMMARY_UUID,
    )
    .map((e) =>
      parseEndOfWorkoutSummary(fromHexString((e as { hex: string }).hex)),
    );

  const replay = createReplayTransport(
    parsed,
    barrierTimeoutMs === undefined ? {} : { barrierTimeoutMs },
  );
  const [dev] = await replay.transport.scan();
  await replay.transport.connect(dev.id);

  const log = createEventLog();
  const driver = createSubscribedDriver(replay.transport, log, {
    deviceName: dev.name,
    now: () => replay.clock.now(),
    schedule: (cb, ms) => replay.clock.schedule(cb, ms),
  });
  const events: MonitorEvent[] = [];
  driver.events((e) => events.push(e));

  const programPending = driver.program(program);
  const result: ReplayResult = await replay.run();
  await programPending;
  // The driver's own public drain — the identical method
  // `useMonitorSession.ts`'s teardown calls. A no-op on every capture whose
  // deadline already fired inside the replay's own virtual clock.
  driver.reconcile();

  return {
    divergences: result.divergences,
    entries: log.entries(),
    events,
    summaries,
  };
}

function detailsOf(outcome: ReplayOutcome, kind: string): string[] {
  return outcome.entries.filter((e) => e.kind === kind).map((e) => e.detail);
}

/** Σ over the interval actuals THIS DRIVER emitted for the replayed run —
 *  our own side of RC-9(b), assembled from 0x0037/0x0038 and nothing else.
 *
 *  NULL-INDEX ACTUALS ARE EXCLUDED, and that exclusion is the whole reason
 *  this helper exists rather than a one-line reduce. On a terminate the
 *  driver synthesizes an actual FROM 0x0039 itself (RC-3's terminate
 *  observation — `index: null`, carrying the summary's own elapsed and
 *  metres verbatim). Summing it into "our side" would compare 0x0039
 *  against 0x0039 and report a perfect agreement that proves nothing: the
 *  exact mirror shape recurring failure #11 records and RC-9c retired the
 *  TWD verdict for. The count this returns is therefore the number of
 *  actuals that came from a BOUNDARY, which is the population RC-9(b)
 *  means. */
function sumRecordedActuals(outcome: ReplayOutcome): {
  count: number;
  seconds: number;
  meters: number;
  fromSummary: number;
} {
  let seconds = 0;
  let meters = 0;
  let count = 0;
  let fromSummary = 0;
  for (const event of outcome.events) {
    if (event.kind !== "intervalComplete") continue;
    if (event.actual.index === null) {
      fromSummary += 1;
      continue;
    }
    count += 1;
    seconds += event.actual.elapsedSeconds;
    meters += event.actual.distanceMeters;
  }
  return { count, seconds, meters, fromSummary };
}

describe("the two shipped oracles, replayed across every committed capture (Phase RC exit evidence)", () => {
  it(`${RESTS_FINISHED}: both oracles fire and agree — 0x0032 136.02 vs our 136.26 s/500m, 0x003A 274 m vs our 274 m`, async () => {
    const outcome = await replayThroughDriver(
      RESTS_FINISHED,
      RESTS_FINISHED_PROGRAM,
    );
    // Bug-independent first, as every replay harness in this directory
    // leads: a mis-transcribed program fails HERE, not on the oracle.
    expect(outcome.divergences).toStrictEqual([]);

    const avg = detailsOf(outcome, "avg-pace-verdict");
    expect(avg).toHaveLength(1);
    expect(avg[0]).toContain("machine(0x0032)=136.02s/500m");
    expect(avg[0]).toContain("ours=136.26s/500m");
    expect(avg[0]).toContain("agree");
    // The capture's own measured disagreement, pinned as a tight bound
    // rather than a round number.
    expect(Number(avg[0]!.match(/delta=([0-9.]+)s/)![1])).toBeLessThanOrEqual(
      0.25,
    );

    const rest = detailsOf(outcome, "rest-distance-verdict");
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain("machine(0x003A)=274m ours=274m delta=0m");
    expect(rest[0]).toContain("agree");
  });

  it(`${KEYSTONE}: the r0 keystone — both oracles fire, and the rest oracle agrees on ZERO without a false alarm`, async () => {
    const outcome = await replayThroughDriver(KEYSTONE, KEYSTONE_PROGRAM);
    expect(outcome.divergences).toStrictEqual([]);

    const avg = detailsOf(outcome, "avg-pace-verdict");
    expect(avg).toHaveLength(1);
    expect(avg[0]).toContain("machine(0x0032)=138.44s/500m");
    expect(avg[0]).toContain("ours=138.80s/500m");
    expect(avg[0]).toContain("agree");

    const rest = detailsOf(outcome, "rest-distance-verdict");
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain("machine(0x003A)=0m ours=0m delta=0m");
    expect(rest[0]).toContain("agree");
  });

  it(`${PYRAMID}: rowed well off target across 1300 m — 0x0032 133.07 vs our 133.12 s/500m, the corpus's tightest agreement`, async () => {
    const outcome = await replayThroughDriver(PYRAMID, PYRAMID_PROGRAM);
    expect(outcome.divergences).toStrictEqual([]);

    const avg = detailsOf(outcome, "avg-pace-verdict");
    expect(avg).toHaveLength(1);
    expect(avg[0]).toContain("machine(0x0032)=133.07s/500m");
    expect(avg[0]).toContain("ours=133.12s/500m");
    expect(avg[0]).toContain("agree");
    expect(Number(avg[0]!.match(/delta=([0-9.]+)s/)![1])).toBeLessThanOrEqual(
      0.06,
    );

    // This capture carries no 0x003A rx frame at all (it predates the
    // subscription), so the rest oracle has nothing to speak about — and
    // says nothing rather than inventing a zero.
    expect(detailsOf(outcome, "rest-distance-verdict")).toStrictEqual([]);
  });

  it(`${SMOKE_TERMINATED}: terminated inside interval 1 — BOTH oracles refuse to compare, and say which population is short`, async () => {
    const outcome = await replayThroughDriver(
      SMOKE_TERMINATED,
      SMOKE_TERMINATED_PROGRAM,
    );
    expect(outcome.divergences).toStrictEqual([]);

    const avg = detailsOf(outcome, "avg-pace-verdict");
    expect(avg).toHaveLength(1);
    expect(avg[0]).toContain("suppressed");
    expect(avg[0]).toContain("final interval (index 0) was never recorded");

    const rest = detailsOf(outcome, "rest-distance-verdict");
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain("distance suppressed");
    expect(rest[0]).toContain("no run's actuals to compare against");
  });

  it(`${BOUNDARIES_TERMINATED}: terminated inside interval 3 — both oracles suppress, on a run that DID record two intervals`, async () => {
    const outcome = await replayThroughDriver(
      BOUNDARIES_TERMINATED,
      BOUNDARIES_TERMINATED_PROGRAM,
    );
    expect(outcome.divergences).toStrictEqual([]);

    const avg = detailsOf(outcome, "avg-pace-verdict");
    expect(avg).toHaveLength(1);
    expect(avg[0]).toContain("suppressed");
    expect(avg[0]).toContain("final interval (index 2) was never recorded");

    const rest = detailsOf(outcome, "rest-distance-verdict");
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain("distance suppressed");
    expect(rest[0]).toContain("was not yet recorded when 0x003A arrived");
  });

  it(`${SESSION_1_KEYSTONE}: the oldest capture in the corpus still agrees — 0x0032 138.09 vs our 137.90 s/500m`, async () => {
    const outcome = await replayThroughDriver(
      SESSION_1_KEYSTONE,
      KEYSTONE_2X250_R0_PROGRAM,
    );
    expect(outcome.divergences).toStrictEqual([]);

    const avg = detailsOf(outcome, "avg-pace-verdict");
    expect(avg).toHaveLength(1);
    expect(avg[0]).toContain("machine(0x0032)=138.09s/500m");
    expect(avg[0]).toContain("ours=137.90s/500m");
    expect(avg[0]).toContain("agree");

    // No 0x003A rx frame in this capture (it predates the subscription),
    // so the rest oracle stays silent rather than inventing a zero.
    expect(detailsOf(outcome, "rest-distance-verdict")).toStrictEqual([]);
  });

  it(`${STEP_2}: the same program a day later — 0x0032 138.92 vs our 139.00 s/500m`, async () => {
    const outcome = await replayThroughDriver(
      STEP_2,
      KEYSTONE_2X250_R0_PROGRAM,
    );
    expect(outcome.divergences).toStrictEqual([]);

    const avg = detailsOf(outcome, "avg-pace-verdict");
    expect(avg).toHaveLength(1);
    expect(avg[0]).toContain("machine(0x0032)=138.92s/500m");
    expect(avg[0]).toContain("ours=139.00s/500m");
    expect(avg[0]).toContain("agree");
    expect(detailsOf(outcome, "rest-distance-verdict")).toStrictEqual([]);
  });

  it(`${MENU_AT_READY}: armed and abandoned without a stroke — neither oracle speaks at all`, async () => {
    const outcome = await replayThroughDriver(
      MENU_AT_READY,
      MENU_AT_READY_PROGRAM,
    );
    expect(outcome.divergences).toStrictEqual([]);
    // No summary characteristic ever arrives (this capture has no 0x0037,
    // 0x0039 or 0x003A rx frame), and no run ever reaches a terminal
    // transition, so there is nothing to compare and nothing is claimed.
    expect(detailsOf(outcome, "avg-pace-verdict")).toStrictEqual([]);
    expect(detailsOf(outcome, "rest-distance-verdict")).toStrictEqual([]);
  });

  it(`${REST_BOUNDARY}: End pressed mid-interval-2 — both oracles suppress, the newest rest-bearing capture in the corpus`, async () => {
    // 250 ms rather than the 2000 ms default: this capture's LAST tx is the
    // terminate the rower's own End press sent at the erg, which this
    // replay never issues (nothing here calls `driver.terminate()`), so its
    // barrier can only ever time out. Pinning the resulting divergence
    // EXACTLY still catches a mis-transcribed program — that would produce
    // a different or an additional entry, and the shortened timeout does
    // not change which barriers match, only how long the one that cannot
    // waits. VERIFIED at the exit pass by replaying both captures at 250 /
    // 500 / 2000 / 4000 ms: byte-identical divergence sets at 16x the
    // timeout, and both pinned barriers are the LAST `tx` in their capture,
    // so a timed-out barrier cannot cascade into a mismatch on the next.
    // Worth knowing while reading this: `tx#839` is not the last EVENT —
    // the 0x0039 (seq 844) and 0x003A (seq 845) that drive both oracles
    // arrive AFTER it, so everything this test and the RC-9(b) block assert
    // about this capture is downstream of that barrier releasing by
    // timeout.
    const outcome = await replayThroughDriver(
      REST_BOUNDARY,
      REST_BOUNDARY_PROGRAM,
      250,
    );
    expect(outcome.divergences).toStrictEqual(["tx#839 barrier timeout"]);

    const avg = detailsOf(outcome, "avg-pace-verdict");
    expect(avg).toHaveLength(1);
    expect(avg[0]).toContain("suppressed");
    expect(avg[0]).toContain("final interval (index 2) was never recorded");

    const rest = detailsOf(outcome, "rest-distance-verdict");
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain("distance suppressed");
  });

  it(`${END_ON_INTERVAL_1}: ended 8.5 s in, before any boundary — both oracles suppress`, async () => {
    const outcome = await replayThroughDriver(
      END_ON_INTERVAL_1,
      REST_BOUNDARY_PROGRAM,
      250,
    );
    expect(outcome.divergences).toStrictEqual(["tx#75 barrier timeout"]);

    const avg = detailsOf(outcome, "avg-pace-verdict");
    expect(avg).toHaveLength(1);
    expect(avg[0]).toContain("suppressed");

    const rest = detailsOf(outcome, "rest-distance-verdict");
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain("no run's actuals to compare against");
  });
});

describe("RC-9(b) — 0x0039's own end-of-workout totals against the sum of the actuals we recorded", () => {
  // The comparison RC-9(b) has been queued on. Both sides are decoded
  // here, not read out of a ring line: the machine's side by
  // `parseEndOfWorkoutSummary` applied directly to the capture's own
  // recorded 0x0039 bytes, ours by summing the `intervalComplete` events
  // this driver emitted from 0x0037/0x0038. Different registers, same
  // quantity — work only, rest excluded — which is exactly what makes the
  // agreement mean something and is itself asserted below (first in each
  // case, so it is the assertion that reports), since a rest-INCLUSIVE
  // 0x0039 would read `recorded + the rest actually taken`.
  //
  // ONE RESIDUAL MIRROR PATH, named here because the guard against it is
  // not the one the code makes obvious (exit pass). `sumRecordedActuals`
  // excludes `index === null` — but a `deriveFinalIntervalFromSummary`
  // FILL carries a REAL index and would be counted, which would be
  // 0x0039 against 0x0039. It never happens on these four captures, and
  // what prevents it is `finalFilledFromSummary`'s ORDERING rather than
  // the `fromSummary` count: `rests-finished` asserts `split-won`
  // directly (the split stayed authoritative); `boundaries-terminated`
  // and `rest-boundary` assert "never recorded", a branch reached only
  // AFTER the fill check; and `keystone`'s protection lives in the other
  // `describe`, where its avg-pace verdict reads `agree` — impossible if
  // the fill had fired, since that suppresses.

  it(`${RESTS_FINISHED}: 254.8 s / 935 m on both sides, across a program carrying 120 s of rest`, async () => {
    const outcome = await replayThroughDriver(
      RESTS_FINISHED,
      RESTS_FINISHED_PROGRAM,
    );
    expect(outcome.divergences).toStrictEqual([]);
    // Not a tautology on this run: the ring's own `summary-reconciled`
    // reads `split-won`, i.e. the final interval was recorded from its own
    // 0x0037/0x0038 split and NOT filled from this summary. (When it is
    // filled from the summary, `avg-pace-verdict` suppresses for exactly
    // that reason — `finalFilledFromSummary`.)
    expect(detailsOf(outcome, "summary-reconciled").join(" ")).toContain(
      "split-won",
    );

    expect(outcome.summaries).toHaveLength(1);
    const machine = outcome.summaries[0]!;
    const ours = sumRecordedActuals(outcome);
    expect(ours.count).toBe(3);
    // No summary-derived actual on this run at all, so neither side of the
    // comparison touched 0x0039 twice.
    expect(ours.fromSummary).toBe(0);
    // REST-EXCLUSIVITY FIRST, deliberately (exit pass, finding I-2): this
    // is the assertion carrying the block's headline claim, and running it
    // ahead of the equalities is what makes it the one that REPORTS when a
    // rest-inclusive 0x0039 is simulated. All three intervals completed, so
    // both programmed 60 s rests actually elapsed; a rest-inclusive reading
    // would be 374.8 s against this bound's 373.8. (Programmed and taken
    // coincide here; where they do not, the bound uses TAKEN — see the
    // rest-boundary case.)
    expect(machine.elapsedSeconds).toBeLessThan(ours.seconds + 120 - 1);
    expect(machine.elapsedSeconds).toBeCloseTo(ours.seconds, 1);
    expect(machine.meters).toBeCloseTo(ours.meters, 1);
    expect(machine.elapsedSeconds).toBe(254.8);
    expect(machine.meters).toBe(935);
  });

  it(`${BOUNDARIES_TERMINATED}: 132.5 s / 500 m on both sides — and the 59.8 m partial the rower rowed into interval 3 is in NEITHER`, async () => {
    const outcome = await replayThroughDriver(
      BOUNDARIES_TERMINATED,
      BOUNDARIES_TERMINATED_PROGRAM,
    );
    expect(outcome.divergences).toStrictEqual([]);

    expect(outcome.summaries).toHaveLength(1);
    const machine = outcome.summaries[0]!;
    const ours = sumRecordedActuals(outcome);
    expect(ours.count).toBe(2);
    expect(ours.fromSummary).toBe(0);
    // Rest-exclusivity first, same reason as above. One 60 s rest was
    // programmed and taken (after interval 1 only).
    expect(machine.elapsedSeconds).toBeLessThan(ours.seconds + 60 - 1);
    expect(machine.elapsedSeconds).toBeCloseTo(ours.seconds, 1);
    expect(machine.meters).toBeCloseTo(ours.meters, 1);
    // 500 m is intervals 1 and 2 exactly (250 + 250); the partial third
    // interval appears on neither side, which is walk-2026-08-27's own
    // finding 7 reproduced off the bytes.
    expect(machine.meters).toBe(500);
  });

  it(`${REST_BOUNDARY}: 60 s / 198 m against our 60 s / 197 m — one metre apart, the corpus's widest 0x0039 gap`, async () => {
    const outcome = await replayThroughDriver(
      REST_BOUNDARY,
      REST_BOUNDARY_PROGRAM,
      250,
    );
    expect(outcome.divergences).toStrictEqual(["tx#839 barrier timeout"]);

    expect(outcome.summaries).toHaveLength(1);
    const machine = outcome.summaries[0]!;
    const ours = sumRecordedActuals(outcome);
    expect(ours.count).toBe(1);
    expect(ours.fromSummary).toBe(0);
    // Rest-exclusivity first, same reason as above, and see the bound's own
    // note below for why it is 60 and not 120.
    expect(machine.elapsedSeconds).toBeLessThan(ours.seconds + 60 - 1);
    expect(machine.elapsedSeconds).toBe(60);
    expect(ours.seconds).toBe(60);
    expect(machine.meters).toBe(198);
    expect(ours.meters).toBe(197);
    expect(Math.abs(machine.meters - ours.meters)).toBeLessThanOrEqual(1);
    // THE BOUND ABOVE IS THE REST ACTUALLY TAKEN, not the program's total.
    // CORRECTED at the exit pass, which found the earlier version vacuous:
    // this run ended in interval 2, so exactly ONE of the two programmed
    // 60 s rests elapsed (the walk's own trace: interval 1 ends t=76.49,
    // interval 2 begins t=136.70 — 60.2 s). A rest-INCLUSIVE 0x0039 would
    // therefore have read ~120.2 s here, which clears a 120 s-based bound
    // comfortably and would have PASSED. Against the rest actually taken it
    // does not.
  });

  it(`${KEYSTONE}: 138.7 s / 500 m against our 138.8 s / 500 m on an r0 program`, async () => {
    const outcome = await replayThroughDriver(KEYSTONE, KEYSTONE_PROGRAM);
    expect(outcome.divergences).toStrictEqual([]);

    expect(outcome.summaries).toHaveLength(1);
    const machine = outcome.summaries[0]!;
    const ours = sumRecordedActuals(outcome);
    expect(ours.count).toBe(2);
    expect(ours.fromSummary).toBe(0);
    expect(machine.elapsedSeconds).toBeCloseTo(ours.seconds, 0);
    expect(machine.meters).toBe(500);
    expect(ours.meters).toBe(500);
  });

  it(`${SMOKE_TERMINATED}: the asymmetry a terminate inside interval 1 leaves — the machine keeps a 31.5 s / 110 m row and we record nothing`, async () => {
    const outcome = await replayThroughDriver(
      SMOKE_TERMINATED,
      SMOKE_TERMINATED_PROGRAM,
    );
    expect(outcome.divergences).toStrictEqual([]);

    expect(outcome.summaries).toHaveLength(1);
    const machine = outcome.summaries[0]!;
    const ours = sumRecordedActuals(outcome);
    // Asserted as the observed FACT, not as a thing that is right: the PM5
    // logged this piece (its own memory screen reads `:31.5  110  2:23.1`,
    // photographed in `walk-2026-08-25/pm5-terminate-view-detail.jpg`) and
    // no boundary ever reached us, which is why the oracle above refuses
    // to compare rather than reporting a 100% disagreement. The product
    // question this raises — what a rower should get for an abandoned
    // piece — is Phase RC's open PARTIAL item, not this file's.
    expect(machine.elapsedSeconds).toBe(31.5);
    expect(machine.meters).toBe(110);
    expect(ours.count).toBe(0);
    expect(ours.meters).toBe(0);
    // AND THE TRAP THIS CAPTURE SETS, pinned so nobody walks into it while
    // "finishing" RC-9(b): the driver DOES emit one actual here — the
    // null-index terminate observation, built out of this very summary
    // (31.5 s / 110 m, the same two numbers). Counting it as ours would
    // turn this comparison into 0x0039 against itself.
    expect(ours.fromSummary).toBe(1);
    const synthesized = outcome.events.filter(
      (e) => e.kind === "intervalComplete" && e.actual.index === null,
    );
    expect(synthesized).toHaveLength(1);
    expect(
      (synthesized[0] as { actual: { distanceMeters: number } }).actual
        .distanceMeters,
    ).toBe(machine.meters);
  });
});

// ---------------------------------------------------------------------
// Phase LP (spec 2026-09-06-logbook-parity §4.1) — identities that do NOT
// share our arithmetic, over every committed capture that carries 0x003A.
// RF11: an oracle that shares your definition is a mirror. These do not:
//   (1) Σ of the RAW 0x0038 frames' Total Calories == the RAW 0x003A's Total
//       Calories — two characteristics, both decoded straight off the
//       capture bytes, never through the driver. Confirms offsets 8-9 of
//       BOTH frames at once (a wrong offset on either side breaks the sum).
//   (2) every actual the DRIVER emitted carries the calories/watts/drag/
//       cal-hr the RAW frame with its split number carries — retention
//       through `toIntervalActual`, checked against the wire, not a fixture.
//   (3) the RAW per-split watts equal round(2.80/(t/d)³) from that split's
//       own 0x0037 time and distance as the driver emitted them — the PM5's
//       power against Concept2's published formula over the PM5's own
//       time/distance (spec §1.2's derivation, on the wire's numbers).
//   (4) the RAW 0x003A watts are within 1 W of the same derivation from
//       0x0039's own work time/distance.
// `menu-at-ready`, `pyramid`, `session-1-keystone` and `step-2` carry no
// 0x003A frame (`grep -c '"rx".*ce06003a'` over each, 2026-09-06) and are
// out of scope here, not skipped silently: the four older captures predate
// the 0x003A subscription.
// ---------------------------------------------------------------------
describe("Phase LP — cross-characteristic identities: 0x0038 splits against 0x003A, and the wire's watts against Concept2's formula", () => {
  // Fourth column: whether the driver emits at least one indexed actual.
  // `smoke-terminated` and `end-on-interval-1` were ended before any
  // boundary — their lone 0x0038 is the terminate's own partial, which is
  // `boundary-out-of-run` by CSAFE-DEF footnote 12 and never an actual —
  // so (2)/(3) have nothing to check there while (1) and (4) still hold.
  const CARRYING_0X003A: [
    string,
    WorkoutProgram,
    number | undefined,
    boolean,
  ][] = [
    [RESTS_FINISHED, RESTS_FINISHED_PROGRAM, undefined, true],
    [SMOKE_TERMINATED, SMOKE_TERMINATED_PROGRAM, undefined, false],
    [BOUNDARIES_TERMINATED, BOUNDARIES_TERMINATED_PROGRAM, undefined, true],
    [KEYSTONE, KEYSTONE_PROGRAM, undefined, true],
    [REST_BOUNDARY, REST_BOUNDARY_PROGRAM, 250, true],
    [END_ON_INTERVAL_1, REST_BOUNDARY_PROGRAM, 250, false],
  ];

  function rawFrames(capturePath: string, char: string): Uint8Array[] {
    return loadCapture(capturePath)
      .events.filter((e) => "dir" in e && e.dir === "rx" && e.char === char)
      .map((e) => fromHexString((e as { hex: string }).hex));
  }

  it.each(CARRYING_0X003A)(
    "%s: the raw 0x0038 calories sum to the raw 0x003A total, and the raw per-split watts are 2.80/(t/d)³ of the split's own time and distance",
    async (capturePath, program, barrierTimeoutMs, expectActuals) => {
      const summary1 = rawFrames(
        capturePath,
        END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
      ).map(parseAdditionalSummary);
      expect(summary1).toHaveLength(1);
      const additional = summary1[0]!;
      expect(additional).not.toBeNull();

      const rawSplits = rawFrames(
        capturePath,
        ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
      ).map((bytes) => {
        const decoded = parseAdditionalSplitIntervalData(bytes);
        if ("error" in decoded) throw new Error("undecodable 0x0038 fixture");
        return decoded;
      });
      expect(rawSplits.length).toBeGreaterThan(0);

      // (1) two characteristics, both straight off the bytes.
      const rawCalorieSum = rawSplits.reduce(
        (n, f) => n + f.splitIntervalTotalCalories,
        0,
      );
      expect(rawCalorieSum).toBe(additional!.totalCalories);

      // (2) + (3): through the driver, against the raw frame with the same
      // split number, and against Concept2's formula.
      const outcome = await replayThroughDriver(
        capturePath,
        program,
        barrierTimeoutMs,
      );
      const actuals = outcome.events
        .filter((e) => e.kind === "intervalComplete")
        .map(
          (e) =>
            (
              e as {
                actual: import("../../domain/monitor/types.js").IntervalActual;
              }
            ).actual,
        )
        .filter((a) => a.index !== null);
      expect(actuals.length > 0).toBe(expectActuals);
      for (const a of actuals) {
        const raw = rawSplits.find(
          (f) => f.splitIntervalNumber === (a.index as number) + 1,
        );
        expect(raw).toBeDefined();
        expect(a.calories).toBe(raw!.splitIntervalTotalCalories);
        expect(a.calPerHour).toBe(raw!.splitIntervalAvgCalories);
        expect(a.watts).toBe(raw!.splitIntervalPowerWatts);
        expect(a.dragFactor).toBe(raw!.splitAvgDragFactor);
        expect(logbookWatts(a.elapsedSeconds, a.distanceMeters)).toBe(
          raw!.splitIntervalPowerWatts,
        );
      }

      // (4) the session's own watts against the same formula over 0x0039's
      // own work time and distance.
      expect(outcome.summaries).toHaveLength(1);
      const s39 = outcome.summaries[0]!;
      if (s39 === null) throw new Error("undecodable 0x0039 fixture");
      const derived = logbookWatts(s39.elapsedSeconds, s39.meters);
      expect(derived).toBeDefined();
      expect(Math.abs(additional!.avgWatts - derived!)).toBeLessThanOrEqual(1);
    },
  );

  it.each(CARRYING_0X003A)(
    "%s: the driver's summary observations carry the raw 0x003A's four fields verbatim",
    async (capturePath, program, barrierTimeoutMs) => {
      const additional = parseAdditionalSummary(
        rawFrames(capturePath, END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID)[0]!,
      )!;
      const outcome = await replayThroughDriver(
        capturePath,
        program,
        barrierTimeoutMs,
      );
      const observations = outcome.events.filter(
        (e) => e.kind === "summary-observations",
      );
      expect(observations).toHaveLength(1);
      const detail = (
        observations[0] as {
          detail: {
            totalCalories?: number;
            avgWatts?: number;
            avgCalPerHour?: number;
            totalRestMeters?: number;
          };
        }
      ).detail;
      expect(detail.totalCalories).toBe(additional.totalCalories);
      expect(detail.avgWatts).toBe(additional.avgWatts);
      expect(detail.avgCalPerHour).toBe(additional.avgCalPerHour);
      expect(detail.totalRestMeters).toBe(additional.totalRestDistanceMeters);
      expect(
        outcome.entries.filter((e) => e.kind === "summary-1-missing"),
      ).toHaveLength(0);
    },
  );
});
