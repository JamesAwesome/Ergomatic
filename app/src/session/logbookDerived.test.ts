import { describe, expect, it } from "vitest";
import {
  logbookCalPerHour,
  logbookWatts,
  sessionStrokeRate,
} from "./logbookDerived";

// James's 6k, photographed from the Concept2 logbook on 2026-09-06 (spec
// 2026-09-06-logbook-parity §1.2): five 1200 m splits and the session row.
// INDEPENDENT literals — transcribed from the photograph, never derived by
// the functions under test (RF21: a contract is pinned with literals).
const ROW = [
  { seconds: 313.5, meters: 1200, cal: 73, watts: 157, calHr: 838 },
  { seconds: 309.0, meters: 1200, cal: 75, watts: 164, calHr: 873 },
  { seconds: 310.1, meters: 1200, cal: 74, watts: 162, calHr: 859 },
  { seconds: 310.1, meters: 1200, cal: 75, watts: 162, calHr: 870 },
  { seconds: 307.4, meters: 1200, cal: 75, watts: 167, calHr: 878 },
  { seconds: 1550.1, meters: 6000, cal: 372, watts: 162, calHr: 863 },
];

describe("logbookWatts — Concept2's watts = 2.80/pace³ from full-precision time and distance", () => {
  it.each(ROW)(
    "reproduces the logbook's cell: $seconds s over $meters m → $watts W",
    (r) => {
      expect(logbookWatts(r.seconds, r.meters)).toBe(r.watts);
    },
  );

  it("is undefined without a positive time AND a positive distance — never 0, never Infinity", () => {
    expect(logbookWatts(0, 1200)).toBeUndefined();
    expect(logbookWatts(300, 0)).toBeUndefined();
    expect(logbookWatts(Number.NaN, 1200)).toBeUndefined();
  });
});

describe("logbookCalPerHour — the logbook's calories ÷ time, floored", () => {
  it.each(ROW)(
    "reproduces the logbook's cell: $cal cal over $seconds s → $calHr cal/hr",
    (r) => {
      expect(logbookCalPerHour(r.cal, r.seconds)).toBe(r.calHr);
    },
  );

  it("keeps zero calories as 0 — a value, not an absence", () => {
    expect(logbookCalPerHour(0, 60)).toBe(0);
  });

  it("is undefined without a positive time", () => {
    expect(logbookCalPerHour(10, 0)).toBeUndefined();
  });
});

describe("sessionStrokeRate — 0x0039's average for a finished piece, the splits' time-weighted mean for a terminated one", () => {
  it("uses 0x0039's own average when the piece finished, whatever the splits say", () => {
    expect(
      sessionStrokeRate({
        finished: true,
        avgStrokeRate: 26,
        splits: [{ seconds: 60, spm: 40 }],
      }),
    ).toBe(26);
  });

  it("uses the time-weighted per-split mean on a terminated piece, where 0x0039 reads exactly double (smoke-terminated: 46 on the wire, 23 rowed)", () => {
    expect(
      sessionStrokeRate({
        finished: false,
        avgStrokeRate: 46,
        splits: [
          { seconds: 60, spm: 22 },
          { seconds: 120, spm: 24 },
        ],
      }),
    ).toBe(23);
  });

  it("weights by time, not by count: a long slow split outweighs a short fast one", () => {
    expect(
      sessionStrokeRate({
        finished: false,
        avgStrokeRate: 60,
        splits: [
          { seconds: 300, spm: 20 },
          { seconds: 30, spm: 30 },
        ],
      }),
    ).toBe(21);
  });

  it("is undefined on a terminated piece with no splits, and when 0x0039 gave nothing on a finished one", () => {
    expect(
      sessionStrokeRate({ finished: false, avgStrokeRate: 46, splits: [] }),
    ).toBeUndefined();
    expect(
      sessionStrokeRate({
        finished: true,
        avgStrokeRate: undefined,
        splits: [],
      }),
    ).toBeUndefined();
  });
});
