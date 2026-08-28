// PHASE RC CLOSE-OUT — THE ORACLE CORPUS. Zero product code: every
// committed wire recording this repo holds is replayed through the real
// `createPm5Driver`, and the two oracles RC-9 shipped are asserted on each
// one — either the verdict and its numbers, or the exact reason it refused
// to compare. Until now both oracles were pinned on ONE capture each
// (`avgPaceVerdict.replay.test.ts`'s session-2, `driver.test.ts:11443`'s
// synthetic 2-interval program), and everything else we know about them
// came from reading a ring by hand after a walk.
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
// silence RC-14 is open on. Replaying that walk's OWN recording produces a
// ring that matches it entry for entry and then records the verdict in
// exactly that gap. RC-14 stays open; what this file adds to it is that
// the recorded wire stream is SUFFICIENT to produce the verdict, so
// whatever swallowed it at the erg is not in the traffic. See the RC-14
// row in ROADMAP.md for the rest of that finding.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import type { MonitorEvent } from "../../domain/monitor/types.js";
import { parseEndOfWorkoutSummary } from "../../domain/monitor/pm5/parse.js";
import { END_OF_WORKOUT_SUMMARY_UUID } from "../../domain/monitor/pm5/uuids.js";
import { createEventLog } from "./eventLog";
import {
  fromHexString,
  parseRecording,
  type ParsedRecording,
} from "./transports/recording";
import { createPm5Driver } from "./driver";
import { createReplayTransport, type ReplayResult } from "./transports/replay";

/** Same path-surgery idiom as `avgPaceVerdict.replay.test.ts`/
 *  `structureWatchReplay.test.ts` (jsdom resolves `new URL(...)` against
 *  `http://localhost:3000/`, so string surgery on `import.meta.url` stands
 *  in for it). `docs/monitor/sessions/` lives three directories above
 *  `app/src/monitor/`. */
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/oracleCorpusReplay\.test\.ts$/,
    "../docs/monitor/sessions/",
  );

function loadCapture(relPath: string): ParsedRecording {
  const full = `${SESSIONS_DIR}${relPath}`;
  const raw = full.endsWith(".gz")
    ? gunzipSync(readFileSync(full)).toString("utf8")
    : readFileSync(full, "utf8");
  return parseRecording(raw);
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

const RESTS_FINISHED = "walk-2026-08-25/rests-finished-recording.jsonl.gz";
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
    // waits.
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
  // agreement mean something and is itself asserted below, since a
  // rest-INCLUSIVE 0x0039 would read `recorded + programmed rest`.

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
    expect(machine.elapsedSeconds).toBeCloseTo(ours.seconds, 1);
    expect(machine.meters).toBeCloseTo(ours.meters, 1);
    expect(machine.elapsedSeconds).toBe(254.8);
    expect(machine.meters).toBe(935);
    // Rest-EXCLUSIVE, stated as a falsifiable difference rather than left
    // implicit: this program carried 120 s of programmed rest, and the
    // machine's own elapsed is nowhere near the rest-inclusive figure.
    expect(machine.elapsedSeconds).toBeLessThan(ours.seconds + 120 - 1);
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
    expect(machine.elapsedSeconds).toBeCloseTo(ours.seconds, 1);
    expect(machine.meters).toBeCloseTo(ours.meters, 1);
    expect(machine.meters).toBe(500);
    // 500 m is intervals 1 and 2 exactly (250 + 250); the partial third
    // interval appears on neither side, which is walk-2026-08-27's own
    // finding 7 reproduced off the bytes.
    expect(machine.elapsedSeconds).toBeLessThan(ours.seconds + 60 - 1);
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
    expect(machine.elapsedSeconds).toBe(60);
    expect(ours.seconds).toBe(60);
    expect(machine.meters).toBe(198);
    expect(ours.meters).toBe(197);
    expect(Math.abs(machine.meters - ours.meters)).toBeLessThanOrEqual(1);
    // 120 s of programmed rest, one completed interval: rest-exclusive
    // again, and this is the capture whose absence RC-9(b) was queued on.
    expect(machine.elapsedSeconds).toBeLessThan(ours.seconds + 120 - 1);
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
