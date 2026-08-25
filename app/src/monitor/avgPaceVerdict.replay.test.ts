// RC-9a (design spec 2026-08-25-free-oracles §1) — exit criterion 1's own
// evidence: "on a rest-bearing capture, (a)'s verdict fires with a
// disagreement inside the measured band ... asserted from the capture's own
// numbers." STEP ONE IS THE FAKE, and it is not optional (task-2-brief.md):
// `fake.ts` used to fabricate `averageSplit: e.currentSplit`, a world with no
// cumulative work-only average at all, which would make any fake-driven test
// of this verdict vacuous by construction (third sighting of the shape,
// antagonist ledger 2026-08-25). That fake IS fixed in this same PR
// (`updateSessionAvgSplit`, `transports/fake.ts`) — but THIS file drives the
// flagship, real-numbers assertion from a committed capture regardless,
// which is the safer oracle for the one test that has to prove the real
// disagreement is small: a scripted fixture could only ever confirm the code
// agrees with a number the test itself chose.
//
// The capture: `docs/monitor/sessions/walk-2026-08-16/
// session-2-wu-4unequal.jsonl` — the same recording
// `connectedMetricsReplay.test.ts` already replays (this file's own
// `SESSION_2_PROGRAM` is copied verbatim from that file's own
// byte-verified transcription, re-declared rather than imported per this
// project's "no test file in src/monitor/ imports another" convention) and
// the "session-2" the pre-spec oracle pass's own evidence cites
// (`.claude/agents/antagonist-ledger.md`, 2026-08-25 entry): `averageSplit`
// freezes at 136.13 across seq 600-777 (9.6s/30.6m of rest coast, matching
// the evidence base's "session-2 seq 600→774" citation) and steps
// 129.78→128.76 at the terminal transition (workoutState 4, seq 2976 →
// workoutState 10, seq 2979) — this task's own throwaway decode script
// (report) re-confirmed both figures directly off `parse.ts`, independently
// of anything this test asserts.
//
// GROUND TRUTH (this task's own decode, `domain/monitor/pm5/parse.ts`
// applied directly to the capture's raw hex, never re-run through the
// driver under test — the identical "independent oracle" discipline
// `connectedMetricsReplay.test.ts`'s own header states): the five 0x0037
// boundaries (seq 246/779/1666/2607/2981) decode to
// {29.7s/100m, 60s/229m, 120s/461m, 128.7s/500m, 60s/245m} — Σt=398.4s,
// Σd=1535m, quotient 500×398.4/1535 = 129.7720 s/500m. Against the last
// work-state 0x0032 reading (129.78), the delta is 0.008s — well inside the
// evidence base's own measured 0.07-0.20s median band and the 1.0s
// suppression band `driver.ts`'s own `AVG_PACE_VERDICT_BAND_SECONDS`
// documents. 1535m also matches `connectedMetricsReplay.test.ts`'s own "TWD
// 1599 = 1535 work + 64 rest" citation — the same population, cross-checked.
//
// This capture carries NO 0x0039 at all (the pre-spec pass's own "of eight
// recordings exactly one carries a 0x0039, and it is the only one with zero
// rest" finding — session-2 has rest, so it is not that one), so
// `run.finalFilledFromSummary` can never fire here: the final interval's
// own split (seq 2981/2982) arrives ~83ms after the terminal frame, well
// inside the 3000ms finish grace, via the ORDINARY split path. The
// recording's own trailing "disconnect" event (unlike a "link-drop") fires
// no `onDisconnect` callback (`transports/replay.ts`'s own binding
// semantics — only "link-drop" does), so nothing in this replay reaches the
// 3000ms deadline or a drain on its own; this test calls the driver's own
// public `reconcile()` after `replay.run()` resolves, the identical method
// `useMonitorSession.ts`'s own teardown calls, to settle the one still-open
// question a genuinely torn-down session would have settled for it anyway.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import { createEventLog } from "./eventLog";
import { createPm5Driver } from "./driver";
import { parseRecording, type ParsedRecording } from "./transports/recording";
import { createReplayTransport, type ReplayResult } from "./transports/replay";

/** Same path-surgery idiom as `connectedMetricsReplay.test.ts`/
 *  `burstReplay.test.ts` (both cite the same jsdom `new URL(...)` base
 *  reason). `docs/monitor/sessions/` lives three directories above
 *  `app/src/monitor/`. */
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/avgPaceVerdict\.replay\.test\.ts$/,
    "../docs/monitor/sessions/walk-2026-08-16/",
  );

/** Hand-transcribed, byte-identical to `connectedMetricsReplay.test.ts`'s
 *  own `SESSION_2_PROGRAM` — that file's own header comment carries the
 *  provenance (HANDOFF.md's program shape plus a byte-for-byte decode of
 *  every `ce060021` programming tx). Re-declared, not imported, per this
 *  project's own convention for these harnesses. */
const SESSION_2_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
      kind: "distance",
      value: 100,
      targetSplit: null,
      displaySpm: null,
      restSeconds: 0,
    },
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 30,
    },
    {
      type: "work",
      kind: "time",
      value: 120,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 30,
    },
    {
      type: "work",
      kind: "distance",
      value: 500,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 30,
    },
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

describe("createPm5Driver: the live average-pace verdict, replayed off a real rest-bearing capture (RC-9a exit criterion 1)", () => {
  it("session-2-wu-4unequal.jsonl: avg-pace-verdict compares the last work-state 0x0032 averageSplit (129.78, NOT the terminal frame's 128.76) against our own quotient (129.77), delta 0.01s — well inside the 1.0s band", async () => {
    const text = readFileSync(
      `${SESSIONS_DIR}session-2-wu-4unequal.jsonl`,
      "utf8",
    );
    const parsed: ParsedRecording = parseRecording(text);

    const replay = createReplayTransport(parsed);
    const [dev] = await replay.transport.scan();
    await replay.transport.connect(dev.id);

    const log = createEventLog();
    const driver = createPm5Driver(replay.transport, log, {
      deviceName: dev.name,
      now: () => replay.clock.now(),
      schedule: (cb, ms) => replay.clock.schedule(cb, ms),
    });

    const programPending = driver.program(SESSION_2_PROGRAM);
    const result: ReplayResult = await replay.run();
    await programPending;

    // Bug-independent first (this project's own convention throughout the
    // replay harnesses): if the hand-transcribed program is wrong, THIS
    // fails, not the assertion below it.
    expect(result.divergences).toStrictEqual([]);

    // The recording's own terminal transition is a natural "finished"
    // (workoutState 10), which arms the 3000ms finish grace — never
    // reached by this replay's own recorded clock (the capture's last
    // event is ~100ms later). `reconcile()` is the driver's own public
    // drain (`MonitorDriver.reconcile`, the same method
    // `useMonitorSession.ts`'s teardown calls), settling it deterministically
    // rather than waiting on virtual time nothing in this replay advances.
    driver.reconcile();

    const entries = log.entries().filter((e) => e.kind === "avg-pace-verdict");
    expect(entries).toHaveLength(1);
    const detail = entries[0]!.detail;
    expect(detail).not.toContain("suppressed");
    // The machine's own reading, sampled LIVE (the last work-state 0x0032
    // tick, seq 2976) — never the terminal frame's own 128.76 (seq 2979),
    // the evidence base's own "unexplained terminal step".
    expect(detail).toContain("machine(0x0032)=129.78s/500m");
    expect(detail).toContain("ours=129.77s/500m");
    const deltaMatch = detail.match(/delta=([0-9.]+)s/);
    expect(deltaMatch).not.toBeNull();
    const delta = Number(deltaMatch![1]);
    expect(delta).toBeLessThanOrEqual(1.0);
    // The capture's own measured disagreement (this file's header comment:
    // 129.78 vs 129.7720) — asserted as a tight upper bound, not a round
    // number, per the plan's own "assert the capture's own value" rule.
    expect(delta).toBeLessThanOrEqual(0.02);
    expect(detail).toContain("agree");
  });
});
