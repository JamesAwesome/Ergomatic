import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  parseAdditionalStatus1,
  parseGeneralStatus,
  toMonitorState,
  WORKOUTSTATE_INTERVALREST,
} from "../../domain/monitor/pm5/parse.js";
import {
  ADDITIONAL_STATUS_1_UUID,
  GENERAL_STATUS_UUID,
} from "../../domain/monitor/pm5/uuids.js";
import type { MonitorFrame } from "../../domain/monitor/types.js";
import { fromHexString, parseRecording } from "./transports/recording.js";
import { createSeriesRecorder } from "./seriesRecorder.js";
import {
  deriveAverageHeartRate,
  type HeartRateSample,
} from "../../domain/monitor/derivedHeartRate.js";

// RF11: the tile's number is checked against the MACHINE's own trace, off a
// committed capture, not against a fixture this file chose. The corpus fact
// this whole change rests on is visible here too — the same recordings that
// carry hundreds of real heart-rate readings leave the end-of-workout
// summary's four heart-rate fields empty, which is why the tile reads `—`.
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /app\/src\/monitor\/derivedHeartRate\.replay\.test\.ts$/,
    "docs/monitor/sessions/",
  );

function samplesFrom(file: string): HeartRateSample[] {
  const bytes = readFileSync(`${SESSIONS_DIR}${file}`);
  const text = file.endsWith(".gz")
    ? gunzipSync(bytes).toString("utf8")
    : bytes.toString("utf8");
  const out: HeartRateSample[] = [];
  let resting = false;
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s.startsWith("{")) continue;
    const o = JSON.parse(s) as { char?: string; hex?: string };
    if (o.char === undefined || o.hex === undefined) continue;
    const b = Uint8Array.from(Buffer.from(o.hex.replace(/ /g, ""), "hex"));
    const kind = o.char.toLowerCase().slice(4, 8);
    if (kind === "0031") {
      const g = parseGeneralStatus(b);
      if (!("error" in g))
        resting = g.workoutState === WORKOUTSTATE_INTERVALREST;
    } else if (kind === "0032") {
      const a = parseAdditionalStatus1(b);
      if ("error" in a || a.heartRateBpm === null) continue;
      out.push({
        // DECISECONDS and `r`, exactly as `seriesRecorder.ts` constructs a
        // `Sample`. Building this in seconds with a `rest` key is what let a
        // dead rest-guard and a 10x dropout cap both pass for a whole round.
        t: Math.round(a.elapsedSeconds * 10),
        hr: a.heartRateBpm,
        ...(resting ? { r: true as const } : {}),
      });
    }
  }
  return out;
}

describe("deriveAverageHeartRate, against real captures", () => {
  // Expected values are INDEPENDENT literals (RF21): each was computed by
  // running `domain/monitor/pm5/parse.ts` over the capture's raw hex in a
  // throwaway script on 2026-09-07, never by calling the function under test.
  it.each([
    ["walk-2026-08-25/rests-finished-recording.jsonl.gz", 806, 235, 103],
    ["walk-2026-08-16/session-2-wu-4unequal.jsonl", 983, 177, 133],
    [
      "walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
      608,
      116,
      117,
    ],
    ["walk-2026-08-16/session-1-keystone-2x250r0.jsonl", 287, 0, 116],
  ])("%s: %i samples, %i resting, derives %i bpm", (file, total, rest, bpm) => {
    const samples = samplesFrom(file as string);
    expect(samples).toHaveLength(total as number);
    expect(samples.filter((s) => s.r === true)).toHaveLength(rest as number);
    expect(deriveAverageHeartRate(samples)).toBe(bpm as number);
  });

  it("EXCLUDES rest, which is the whole of option A", () => {
    // The 25 Aug capture carries 235 resting samples out of 806. Counting them
    // is option B, which James did not pick; the two answers differ here, so
    // this assertion can tell them apart rather than passing either way.
    const samples = samplesFrom(
      "walk-2026-08-25/rests-finished-recording.jsonl.gz",
    );
    const withRestCounted = samples.map(({ t, hr }) => ({ t, hr }));
    expect(deriveAverageHeartRate(samples)).toBe(103);
    expect(deriveAverageHeartRate(withRestCounted)).toBe(103);
    // …and on the capture where they genuinely diverge, the two differ by a
    // single beat — 133 working-strokes-only against 134 counting rest. The
    // DIRECTION is not fixed and this comment used to claim it was: a rest
    // stretch pulls the session mean down only if the heart rate actually
    // falls during it, and over a 60 s rest after a hard interval it often
    // has not yet. What the assertion pins is that the two answers DIFFER,
    // which is the whole of option A versus option B.
    const four = samplesFrom("walk-2026-08-16/session-2-wu-4unequal.jsonl");
    expect(deriveAverageHeartRate(four)).toBe(133);
    expect(deriveAverageHeartRate(four.map(({ t, hr }) => ({ t, hr })))).toBe(
      134,
    );
  });

  it("pins the dropout cap at SIX seconds, in the deciseconds t carries", () => {
    // The one constant a weighted mean cannot reveal: the four capture
    // literals above are scale-invariant, so they held while the cap was ten
    // times too large. INDEPENDENT literals, not the module's constant: a gap
    // of 59 deciseconds is a reading that stood for 5.9 s and counts; 60 is a
    // dropout and does not. Widening the cap to 600 (the shipped bug) makes
    // the second case return 100 instead of null.
    expect(
      deriveAverageHeartRate([
        { t: 0, hr: 100 },
        { t: 59, hr: 180 },
      ]),
    ).toBe(100);
    expect(
      deriveAverageHeartRate([
        { t: 0, hr: 100 },
        { t: 60, hr: 180 },
      ]),
    ).toBeNull();
  });

  it("refuses a reading outside the band the wire would refuse", () => {
    // Banded here so the tile cannot show a figure the upload rejects: a
    // live MonitorRun trace has not been through the server's validator.
    expect(
      deriveAverageHeartRate([
        { t: 0, hr: 19 },
        { t: 10, hr: 19 },
      ]),
    ).toBeNull();
    expect(
      deriveAverageHeartRate([
        { t: 0, hr: 255 },
        { t: 10, hr: 255 },
      ]),
    ).toBeNull();
    expect(
      deriveAverageHeartRate([
        { t: 0, hr: 20 },
        { t: 10, hr: 20 },
      ]),
    ).toBe(20);
  });

  it("returns null rather than a number when nothing usable is there", () => {
    expect(deriveAverageHeartRate([])).toBeNull();
    expect(deriveAverageHeartRate([{ t: 0, hr: 120 }])).toBeNull();
    expect(
      deriveAverageHeartRate([
        { t: 0, hr: 120, r: true },
        { t: 10, hr: 118, r: true },
      ]),
    ).toBeNull();
    // A dropout is not a stroke: one reading either side of a 10-minute gap
    // must not dominate the mean.
    expect(
      deriveAverageHeartRate([
        { t: 0, hr: 200 },
        { t: 6000, hr: 100 },
        { t: 6010, hr: 100 },
      ]),
    ).toBe(100);
  });
});

// RF24, and the gate this change most needed. Everything above extracts
// samples the way THIS FILE chooses to; the producer is `seriesRecorder.ts`,
// and the first version of this change read a rest flag named `rest` while
// the recorder writes `r`. Structural typing accepted it, every hand-built
// test proved a guard that never ran, and the app shipped an average nobody
// approved. So one test starts at the recorder's own output and never names
// a field itself.
describe("deriveAverageHeartRate over the RECORDER's own samples", () => {
  /** The recorder's real input, decoded from a capture through the real
   *  parsers. Re-declared rather than imported: no test file in this
   *  directory imports another (the convention `avgPaceVerdict.replay.test.ts`
   *  states and follows). */
  function framesFrom(file: string): MonitorFrame[] {
    const { events } = parseRecording(
      readFileSync(`${SESSIONS_DIR}${file}`, "utf8"),
    );
    const frames: MonitorFrame[] = [];
    let last: {
      currentSplit: number;
      spm: number;
      heartRateBpm: number | null;
    } | null = null;
    for (const e of events) {
      if (!("dir" in e) || e.dir !== "rx") continue;
      if (e.char === ADDITIONAL_STATUS_1_UUID) {
        const p = parseAdditionalStatus1(fromHexString(e.hex));
        if (!("error" in p)) last = p;
        continue;
      }
      if (e.char !== GENERAL_STATUS_UUID) continue;
      const gs = parseGeneralStatus(fromHexString(e.hex));
      if ("error" in gs) continue;
      frames.push({
        elapsedSeconds: gs.elapsedSeconds,
        distanceMeters: gs.distanceMeters,
        sessionElapsedSeconds: gs.elapsedSeconds,
        sessionDistanceMeters: gs.distanceMeters,
        currentSplit: last?.currentSplit ?? null,
        spm: last?.spm ?? null,
        heartRateBpm: last?.heartRateBpm ?? null,
        rowingActive: gs.rowingState === 1,
        splitAvgPace: null,
        restSeconds: 0,
        intervalIndex: null,
        intervalRemaining: null,
        intervalAccrued: null,
        state: toMonitorState(gs.workoutState),
      });
    }
    return frames;
  }

  it("excludes the rest the RECORDER marked, without this test naming the field", () => {
    const recorder = createSeriesRecorder();
    for (const f of framesFrom("walk-2026-08-16/session-2-wu-4unequal.jsonl")) {
      recorder.onFrame(f);
    }
    const produced = recorder.snapshot()?.samples ?? [];
    expect(produced.length).toBeGreaterThan(50);
    // The recorder marked some of these resting. This test never writes that
    // key, so a rename cannot be papered over here.
    const derived = deriveAverageHeartRate(produced);
    expect(derived).not.toBeNull();

    // Strip whatever marks rest, by rebuilding each sample from the two
    // fields the derivation reads by value. If the exclusion is live, the two
    // answers differ; if the flag is misnamed or ignored, they are equal and
    // this fails — which is exactly what the first version of this change did.
    const rest = produced.filter((s) => "r" in s && s.r === true);
    expect(rest.length).toBeGreaterThan(0);
    const withoutFlag = produced.map(({ t, hr }) => ({ t, hr }));
    expect(deriveAverageHeartRate(withoutFlag)).not.toBe(derived);
  });
});
