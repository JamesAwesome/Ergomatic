import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  parseAdditionalStatus1,
  parseGeneralStatus,
  WORKOUTSTATE_INTERVALREST,
} from "../../domain/monitor/pm5/parse.js";
import {
  deriveAverageHeartRate,
  type HeartRateSample,
} from "../../domain/monitor/derivedHeartRate.js";

// RF11: the tile's number is checked against the MACHINE's own trace, off a
// committed capture, not against a fixture this file chose. The corpus fact
// this whole change rests on is visible here too — the same recordings that
// carry hundreds of real per-stroke heart rates leave the end-of-workout
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
        t: a.elapsedSeconds,
        hr: a.heartRateBpm,
        ...(resting ? { rest: true as const } : {}),
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
  ])("%s derives %i bpm from its own strokes", (file, total, rest, bpm) => {
    const samples = samplesFrom(file as string);
    expect(samples).toHaveLength(total as number);
    expect(samples.filter((s) => s.rest === true)).toHaveLength(rest as number);
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
    // …and on the capture where they genuinely diverge, the work-only answer
    // is the higher one, because resting strokes drag a session mean down.
    const four = samplesFrom("walk-2026-08-16/session-2-wu-4unequal.jsonl");
    expect(deriveAverageHeartRate(four)).toBe(133);
    expect(deriveAverageHeartRate(four.map(({ t, hr }) => ({ t, hr })))).toBe(
      134,
    );
  });

  it("returns null rather than a number when nothing usable is there", () => {
    expect(deriveAverageHeartRate([])).toBeNull();
    expect(deriveAverageHeartRate([{ t: 0, hr: 120 }])).toBeNull();
    expect(
      deriveAverageHeartRate([
        { t: 0, hr: 120, rest: true },
        { t: 1, hr: 118, rest: true },
      ]),
    ).toBeNull();
    // A dropout is not a stroke: one reading either side of a 10-minute gap
    // must not dominate the mean.
    expect(
      deriveAverageHeartRate([
        { t: 0, hr: 200 },
        { t: 600, hr: 100 },
        { t: 601, hr: 100 },
      ]),
    ).toBe(100);
  });
});
