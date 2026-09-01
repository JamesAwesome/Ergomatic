import { describe, it, expect } from "vitest";
import {
  c2Tenths,
  formatC2Date,
  eligibilityFailure,
  buildC2Payload,
  type SessionLogRow,
} from "./mapping.js";

// Wave E PR1 Task 5 (task-5-brief.md). FIXTURE transcribed from
// docs/monitor/sessions/walk-2026-08-25/rests-finished-ring.json:65-67
// (0x0039 raw+decode: "elapsed=254.8s distance=935m workoutType=8"; raw
// byte 10 on line 65's hex = `18` hex = 24 = avgStrokeRate) and line 70
// ("machine(0x003A)=274m ours=274m delta=0m" — rest distance), plus the
// walk README's W-9 rest-time table
// (docs/monitor/sessions/walk-2026-08-25/README.md:178-183: splits carry
// 60s/130m + 60s/144m + 0s/0m rest -> 120s/274m totals). This is the SAME
// transcription PR0's harness fixture used
// (scripts/c2-crossconnect.ts:280-346, FIXTURE/FIXTURE_OPTS) — never
// invented (RF16). deviceName is the repo-standard monitor-log fixture
// string (e.g. server/stores/stores.integration.test.ts:603).
//
// This is the corpus's ONLY eligible machineSummary fixture (RF3 — every
// committed store fixture carries workoutType:1 from a terminated
// capture, ineligible by this module's finished-only fence), so it is
// transcribed fresh here rather than reused.
const FINISHED_ROW: SessionLogRow = {
  loggedAt: new Date("2026-08-25T21:40:00.000Z"),
  completedAt: new Date("2026-08-25T21:42:03.110Z"), // ring.json:65's wall stamp
  tz: "America/New_York",
  workSeconds: 254.8,
  workMeters: 935,
  restSeconds: 120,
  restMeters: 274,
  machineSummary: { avgStrokeRate: 24, workoutType: 8 },
  deviceName: "PM5 432331249 Row",
  endedBy: "finished",
};
const LINK = { weightClass: "H" as const };

describe("c2Tenths", () => {
  it("rounds to the nearest tenth-second (transplanted Math.round(s*10))", () => {
    // Transcript echo: docs/monitor/c2-crossconnect-2026-09/raw-output.txt:1-26
    // ("time": 2548 for workSeconds 254.8).
    expect(c2Tenths(254.8)).toBe(2548);
  });

  it("rounds a boundary half-tenth up", () => {
    expect(c2Tenths(254.85)).toBe(2549);
  });

  it("rounds a sub-half-tenth down to zero", () => {
    expect(c2Tenths(0.04)).toBe(0);
  });
});

describe("formatC2Date", () => {
  it("matches PR0's accepted transcript for the fixture instant/tz", () => {
    // raw-output.txt:1-26: "date": "2026-08-25 17:42:03".
    expect(
      formatC2Date(new Date("2026-08-25T21:42:03.110Z"), "America/New_York"),
    ).toBe("2026-08-25 17:42:03");
  });
});

describe("eligibilityFailure", () => {
  it("returns not_monitor when deviceName is null", () => {
    expect(
      eligibilityFailure({
        deviceName: null,
        endedBy: "finished",
        workSeconds: 254.8,
        workMeters: 935,
      }),
    ).toBe("not_monitor");
  });

  it("returns not_finished when endedBy is a non-finished close reason", () => {
    expect(
      eligibilityFailure({
        deviceName: "PM5 432331249 Row",
        endedBy: "rower",
        workSeconds: 254.8,
        workMeters: 935,
      }),
    ).toBe("not_finished");
  });

  // A pre-RC row has no close reason recorded AT ALL (endedBy shipped in
  // Phase LL Task 4, after which this column exists) — this is that row
  // excluded with an honest reason, not a wrong one (brief's own note).
  it("returns not_finished when endedBy is null (a pre-RC row)", () => {
    expect(
      eligibilityFailure({
        deviceName: "PM5 432331249 Row",
        endedBy: null,
        workSeconds: 254.8,
        workMeters: 935,
      }),
    ).toBe("not_finished");
  });

  it("returns no_work_totals when workSeconds is null", () => {
    expect(
      eligibilityFailure({
        deviceName: "PM5 432331249 Row",
        endedBy: "finished",
        workSeconds: null,
        workMeters: 935,
      }),
    ).toBe("no_work_totals");
  });

  it("returns no_work_totals when workMeters is null", () => {
    expect(
      eligibilityFailure({
        deviceName: "PM5 432331249 Row",
        endedBy: "finished",
        workSeconds: 254.8,
        workMeters: null,
      }),
    ).toBe("no_work_totals");
  });

  it("checks device before close-reason (ordering)", () => {
    expect(
      eligibilityFailure({
        deviceName: null,
        endedBy: null,
        workSeconds: null,
        workMeters: null,
      }),
    ).toBe("not_monitor");
  });

  it("returns null for the eligible fixture row", () => {
    expect(eligibilityFailure(FINISHED_ROW)).toBeNull();
  });
});

describe("buildC2Payload", () => {
  it("maps the fixture row to EXACTLY PR0's accepted payload", () => {
    // effectiveTz is a decoy ("UTC") to prove the stored completedAt+tz
    // pair wins over it when both are present (precedence rule).
    expect(buildC2Payload(FINISHED_ROW, LINK, "UTC")).toStrictEqual({
      type: "rower",
      date: "2026-08-25 17:42:03",
      timezone: "America/New_York",
      distance: 935,
      time: 2548,
      weight_class: "H",
      rest_time: 1200,
      rest_distance: 274,
      stroke_rate: 24,
      workout_type: "VariableInterval",
    });
  });

  it("uses loggedAt + effectiveTz when completedAt/tz are both null (legacy row)", () => {
    const legacyRow: SessionLogRow = {
      ...FINISHED_ROW,
      completedAt: null,
      tz: null,
    };
    const payload = buildC2Payload(legacyRow, LINK, "America/New_York");
    expect(payload.date).toBe(
      formatC2Date(legacyRow.loggedAt, "America/New_York"),
    );
    expect(payload.timezone).toBe("America/New_York");
  });

  it("falls back to loggedAt + effectiveTz when only tz is null", () => {
    const row: SessionLogRow = { ...FINISHED_ROW, tz: null };
    const payload = buildC2Payload(row, LINK, "America/Los_Angeles");
    expect(payload.date).toBe(
      formatC2Date(row.loggedAt, "America/Los_Angeles"),
    );
    expect(payload.timezone).toBe("America/Los_Angeles");
  });

  it("falls back to loggedAt + effectiveTz when only completedAt is null", () => {
    const row: SessionLogRow = { ...FINISHED_ROW, completedAt: null };
    const payload = buildC2Payload(row, LINK, "America/Los_Angeles");
    expect(payload.date).toBe(
      formatC2Date(row.loggedAt, "America/Los_Angeles"),
    );
    expect(payload.timezone).toBe("America/Los_Angeles");
  });

  it("omits rest_time/rest_distance when both are zero (PR0: never forced)", () => {
    const row: SessionLogRow = {
      ...FINISHED_ROW,
      restSeconds: 0,
      restMeters: 0,
    };
    const payload = buildC2Payload(row, LINK, "UTC");
    expect(payload).not.toHaveProperty("rest_time");
    expect(payload).not.toHaveProperty("rest_distance");
  });

  it("omits rest_time/rest_distance when both are null", () => {
    const row: SessionLogRow = {
      ...FINISHED_ROW,
      restSeconds: null,
      restMeters: null,
    };
    const payload = buildC2Payload(row, LINK, "UTC");
    expect(payload).not.toHaveProperty("rest_time");
    expect(payload).not.toHaveProperty("rest_distance");
  });

  it("omits stroke_rate/workout_type when machineSummary is absent (null)", () => {
    const row: SessionLogRow = { ...FINISHED_ROW, machineSummary: null };
    const payload = buildC2Payload(row, LINK, "UTC");
    expect(payload).not.toHaveProperty("stroke_rate");
    expect(payload).not.toHaveProperty("workout_type");
  });

  describe("stroke_rate band (house band: integer 1..99, not the wire u8's 0..255)", () => {
    it.each([
      ["0 (below the house floor of 1)", 0],
      ["100 (above the house ceiling of 99)", 100],
      ["24.5 (not an integer)", 24.5],
      ['"24" (not a number)', "24"],
    ])("omits stroke_rate for %s", (_label, value) => {
      const row: SessionLogRow = {
        ...FINISHED_ROW,
        machineSummary: {
          ...FINISHED_ROW.machineSummary,
          avgStrokeRate: value,
        },
      };
      expect(buildC2Payload(row, LINK, "UTC")).not.toHaveProperty(
        "stroke_rate",
      );
    });

    it("accepts the house floor (1) and ceiling (99)", () => {
      const low: SessionLogRow = {
        ...FINISHED_ROW,
        machineSummary: { ...FINISHED_ROW.machineSummary, avgStrokeRate: 1 },
      };
      const high: SessionLogRow = {
        ...FINISHED_ROW,
        machineSummary: { ...FINISHED_ROW.machineSummary, avgStrokeRate: 99 },
      };
      expect(buildC2Payload(low, LINK, "UTC").stroke_rate).toBe(1);
      expect(buildC2Payload(high, LINK, "UTC").stroke_rate).toBe(99);
    });
  });

  describe("workout_type ordinal map (only ordinal 8 -> VariableInterval)", () => {
    it.each([
      ["1 (the JustRow capture's raw reading, not yet interpreted)", 1],
      ["null", null],
      ['"8" (not a number)', "8"],
    ])("omits workout_type for %s", (_label, value) => {
      const row: SessionLogRow = {
        ...FINISHED_ROW,
        machineSummary: { ...FINISHED_ROW.machineSummary, workoutType: value },
      };
      expect(buildC2Payload(row, LINK, "UTC")).not.toHaveProperty(
        "workout_type",
      );
    });
  });

  it("throws if called on a row that has not passed eligibilityFailure (defensive contract)", () => {
    const row: SessionLogRow = { ...FINISHED_ROW, workSeconds: null };
    expect(() => buildC2Payload(row, LINK, "UTC")).toThrow();
  });
});
