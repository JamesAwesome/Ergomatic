import { describe, it, expect } from "vitest";
import {
  c2Tenths,
  formatC2Date,
  eligibilityFailure,
  buildC2Payload,
  deriveWeightClass,
  pickDeclaredWeightClass,
  type C2ResultRow,
  type SessionLogRow,
} from "./mapping.js";
import { concept2OverallTotals } from "../../domain/concept2/verificationEligibility.js";

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
// invented (RF16).
//
// This is the corpus's ONLY eligible machineSummary fixture (RF3 — every
// committed store fixture carries workoutType:1 from a terminated
// capture, ineligible by this module's finished-only fence), so it is
// transcribed fresh here rather than reused.
//
// Door PR A (2026-09-02) §2.2: `source: "pm5"` replaces the fixture's
// former `deviceName` field — the row is the eligible fixture BECAUSE
// its source is `pm5`, the same fact `deviceName: "PM5 432331249 Row"`
// used to stand in for.
const FINISHED_ROW: SessionLogRow = {
  loggedAt: new Date("2026-08-25T21:40:00.000Z"),
  completedAt: new Date("2026-08-25T21:42:03.110Z"), // ring.json:65's wall stamp
  tz: "America/New_York",
  workSeconds: 254.8,
  workMeters: 935,
  restSeconds: 120,
  restMeters: 274,
  machineWorkMeters: null,
  machineWorkSeconds: null,
  machineSummary: { avgStrokeRate: 24, workoutType: 8 },
  source: "pm5",
  endedBy: "finished",
  // Phase LP PR 2: no steps → no `workout` array, so PR0's accepted payload
  // below stays byte-identical.
  steps: [],
};
// Wave E PR2, ruling (i): `buildC2Payload`'s second parameter used to be
// the stored LINK row; it is now the RESOLVED class. Twelve call sites all
// pass this one constant, so the edit is one line here rather than twelve —
// and a reviewer sees twelve unchanged call sites instead of twelve to check.
const LINK = "H" as const;

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
  // Door PR A (2026-09-02) §2.2: the gate reads `source`, not
  // `deviceName` — every non-`pm5` member is equally ineligible.
  it.each(["no-reading", "timer", "manual"] as const)(
    "returns not_monitor when source is %s",
    (source) => {
      expect(
        eligibilityFailure({
          source,
          endedBy: "finished",
          workSeconds: 254.8,
          workMeters: 935,
        }),
      ).toBe("not_monitor");
    },
  );

  it("returns not_finished when endedBy is a non-finished close reason", () => {
    expect(
      eligibilityFailure({
        source: "pm5",
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
        source: "pm5",
        endedBy: null,
        workSeconds: 254.8,
        workMeters: 935,
      }),
    ).toBe("not_finished");
  });

  it("returns no_work_totals when workSeconds is null", () => {
    expect(
      eligibilityFailure({
        source: "pm5",
        endedBy: "finished",
        workSeconds: null,
        workMeters: 935,
      }),
    ).toBe("no_work_totals");
  });

  it("returns no_work_totals when workMeters is null", () => {
    expect(
      eligibilityFailure({
        source: "pm5",
        endedBy: "finished",
        workSeconds: 254.8,
        workMeters: null,
      }),
    ).toBe("no_work_totals");
  });

  it("checks source before close-reason (ordering)", () => {
    expect(
      eligibilityFailure({
        source: "manual",
        endedBy: null,
        workSeconds: null,
        workMeters: null,
      }),
    ).toBe("not_monitor");
  });

  it("returns null for the eligible fixture row", () => {
    expect(eligibilityFailure(FINISHED_ROW)).toBeNull();
  });

  // Door PR A (2026-09-02) §2.2: the discriminator between the retired
  // `deviceName === null` check and the new `source !== "pm5"` check. The
  // row below is UNREACHABLE on the wire (`logSourceContradiction` 400s a
  // `deviceName` on any non-pm5 row, so a `timer` row can never carry
  // one) and the extra key is illegal in `eligibilityFailure`'s own
  // parameter type (deliberately cast past the excess-property check) —
  // it exists ONLY to make the two predicates disagree. Under the current
  // `source !== "pm5"` gate this returns `not_monitor` immediately; under
  // the retired `deviceName === null` gate the non-null `deviceName`
  // would have passed gate 1, and — with `endedBy: "finished"` and both
  // totals present — fallen all the way through to `null` (eligible).
  it("source, not deviceName, decides eligibility (mutation discriminator)", () => {
    const row = {
      source: "timer",
      deviceName: "PM5 432331249 Row",
      endedBy: "finished",
      workSeconds: 254.8,
      workMeters: 935,
    } as unknown as Parameters<typeof eligibilityFailure>[0];
    expect(eligibilityFailure(row)).toBe("not_monitor");
  });
});

describe("buildC2Payload", () => {
  it("maps the fixture row to EXACTLY PR0's accepted payload", () => {
    // effectiveTz is a decoy ("UTC") to prove the stored completedAt+tz
    // pair wins over it when both are present (precedence rule).
    expect(buildC2Payload(FINISHED_ROW, LINK, "UTC", false)).toStrictEqual({
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

  // Wave E PR C: the send posts the monitor's OWN totals for the two
  // code-checked numeric fields, so the PM5 verification code accepts the
  // row (proven live: 5706 verifies, our 5708 sum does not —
  // docs/superpowers/research/2026-09-05-c2-verification-measurement.md).
  it("posts machineWorkMeters as distance and machineWorkSeconds as time when present", () => {
    // James's walk row: interval sum 5708 (workMeters) diverges from the
    // monitor's own 5706 total (machineWorkMeters); the code was minted over
    // 5706. Seconds diverge on real captures too (oracleCorpusReplay
    // KEYSTONE: machine 138.7 vs ours 138.8); here they are given an
    // independent seeded divergence (1500 vs 1499.8) so this store→payload
    // test pins BOTH fields at the machine value with independent literals
    // (RF21). oracleCorpusReplay gates the wire→machine_work_seconds step;
    // this gates the seam PR C touches.
    const row: SessionLogRow = {
      ...FINISHED_ROW,
      workMeters: 5708,
      workSeconds: 1500,
      machineWorkMeters: 5706,
      machineWorkSeconds: 1499.8,
    };
    const payload = buildC2Payload(row, LINK, "UTC", false);
    expect(payload.distance).toBe(5706);
    expect(payload.time).toBe(14998); // c2Tenths(1499.8), NOT c2Tenths(1500)=15000
  });

  it("falls back to workMeters/workSeconds when the machine totals are null (no 0x0039 summary)", () => {
    // A pm5/finished row that never received a machine summary keeps today's
    // behavior — it could not verify anyway; the point is no regression.
    const row: SessionLogRow = {
      ...FINISHED_ROW,
      workMeters: 5708,
      workSeconds: 1500,
      machineWorkMeters: null,
      machineWorkSeconds: null,
    };
    const payload = buildC2Payload(row, LINK, "UTC", false);
    expect(payload.distance).toBe(5708);
    expect(payload.time).toBe(15000);
  });

  it("falls back to workMeters/workSeconds when the machine totals are 0, matching the hero's own >0 guard", () => {
    // A `0` machine total is a value `??` would post while the hero
    // (LogRow.heroDistanceMeters, `!== null && > 0`) falls back to our sum —
    // send≠display, the split this PR closes (lens 2). The send uses the
    // hero's predicate, so a 0 here posts the interval sum, not 0.
    const row: SessionLogRow = {
      ...FINISHED_ROW,
      workMeters: 5708,
      workSeconds: 1500,
      machineWorkMeters: 0,
      machineWorkSeconds: 0,
    };
    const payload = buildC2Payload(row, LINK, "UTC", false);
    expect(payload.distance).toBe(5708);
    expect(payload.distance).not.toBe(0);
    expect(payload.time).toBe(15000);
    expect(payload.time).not.toBe(0);
  });

  it("uses loggedAt + effectiveTz when completedAt/tz are both null (legacy row)", () => {
    const legacyRow: SessionLogRow = {
      ...FINISHED_ROW,
      completedAt: null,
      tz: null,
    };
    const payload = buildC2Payload(legacyRow, LINK, "America/New_York", false);
    expect(payload.date).toBe(
      formatC2Date(legacyRow.loggedAt, "America/New_York"),
    );
    expect(payload.timezone).toBe("America/New_York");
  });

  it("falls back to loggedAt + effectiveTz when only tz is null", () => {
    const row: SessionLogRow = { ...FINISHED_ROW, tz: null };
    const payload = buildC2Payload(row, LINK, "America/Los_Angeles", false);
    expect(payload.date).toBe(
      formatC2Date(row.loggedAt, "America/Los_Angeles"),
    );
    expect(payload.timezone).toBe("America/Los_Angeles");
  });

  it("falls back to loggedAt + effectiveTz when only completedAt is null", () => {
    const row: SessionLogRow = { ...FINISHED_ROW, completedAt: null };
    const payload = buildC2Payload(row, LINK, "America/Los_Angeles", false);
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
    const payload = buildC2Payload(row, LINK, "UTC", false);
    expect(payload).not.toHaveProperty("rest_time");
    expect(payload).not.toHaveProperty("rest_distance");
  });

  it("omits rest_time/rest_distance when both are null", () => {
    const row: SessionLogRow = {
      ...FINISHED_ROW,
      restSeconds: null,
      restMeters: null,
    };
    const payload = buildC2Payload(row, LINK, "UTC", false);
    expect(payload).not.toHaveProperty("rest_time");
    expect(payload).not.toHaveProperty("rest_distance");
  });

  it("omits stroke_rate/workout_type when machineSummary is absent (null)", () => {
    const row: SessionLogRow = { ...FINISHED_ROW, machineSummary: null };
    const payload = buildC2Payload(row, LINK, "UTC", false);
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
      expect(buildC2Payload(row, LINK, "UTC", false)).not.toHaveProperty(
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
      expect(buildC2Payload(low, LINK, "UTC", false).stroke_rate).toBe(1);
      expect(buildC2Payload(high, LINK, "UTC", false).stroke_rate).toBe(99);
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
      expect(buildC2Payload(row, LINK, "UTC", false)).not.toHaveProperty(
        "workout_type",
      );
    });
  });

  it("throws if called on a row that has not passed eligibilityFailure (defensive contract)", () => {
    const row: SessionLogRow = { ...FINISHED_ROW, workSeconds: null };
    expect(() => buildC2Payload(row, LINK, "UTC", false)).toThrow();
  });
});

const NOW = Date.parse("2026-09-03T12:00:00Z");

function resultRow(over: Partial<C2ResultRow> = {}): C2ResultRow {
  return {
    id: 85561,
    type: "rower",
    weightClass: "H",
    dateUtc: "2026-09-02 10:00:30",
    date: "2026-09-02 06:00:30",
    verified: null,
    ...over,
  };
}

describe("pickDeclaredWeightClass", () => {
  it("never reads OUR OWN writes back as the rower's declaration", () => {
    // Observation 29. The row is indistinguishable from a real declaration
    // in every projected field EXCEPT its id, which is why the id is
    // projected — and the second assertion proves the fixture is a
    // declaration in every other respect, so the first one is really about
    // the exclusion and not about some other skip.
    const ours = resultRow({ id: 90001, weightClass: "H" });
    expect(
      pickDeclaredWeightClass([ours], {
        ourResultIds: new Set([90001]),
        now: NOW,
      }),
    ).toBeNull();
    expect(
      pickDeclaredWeightClass([ours], { ourResultIds: new Set(), now: NOW }),
    ).toBe("H");
  });

  it("takes the NEWEST readable class, skipping our own row above it", () => {
    // Two survivors that DISAGREE, so list order is what decides — a
    // fixture whose survivors agreed would let a reversed iteration pass.
    expect(
      pickDeclaredWeightClass(
        [
          resultRow({ id: 85561, weightClass: "L" }),
          resultRow({ id: 85560, weightClass: "H" }),
        ],
        { ourResultIds: new Set(), now: NOW },
      ),
    ).toBe("L");
    expect(
      pickDeclaredWeightClass(
        [
          resultRow({ id: 90001, weightClass: "H" }),
          resultRow({ id: 85561, weightClass: "L" }),
          resultRow({ id: 85560, weightClass: "H" }),
        ],
        { ourResultIds: new Set([90001]), now: NOW },
      ),
    ).toBe("L");
  });

  it("reads a class only off a type Concept2 REQUIRES one on", () => {
    // The vendor's ten documented types, in the order its own table lists
    // them. The three that answer are the three the Add Result table names
    // ("Required if type is rower, dynamic or slides"); a `skierg` row
    // carrying a class is the vendor's OWN example, and it is noise.
    const seen = (
      [
        "rower",
        "dynamic",
        "slides",
        "skierg",
        "bike",
        "paddle",
        "water",
        "snow",
        "rollerski",
        "multierg",
      ] as const
    ).map((type) =>
      pickDeclaredWeightClass([resultRow({ type, weightClass: "L" })], {
        ourResultIds: new Set(),
        now: NOW,
      }),
    );
    expect(seen).toStrictEqual([
      "L",
      "L",
      "L",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("skips a row dated in the FUTURE, so one bad stamp cannot pin the declaration forever", () => {
    expect(
      pickDeclaredWeightClass(
        [
          resultRow({
            id: 1,
            weightClass: "L",
            dateUtc: "2030-01-01 00:00:00",
          }),
          resultRow({ id: 2, weightClass: "H" }),
        ],
        { ourResultIds: new Set(), now: NOW },
      ),
    ).toBe("H");
  });

  it("skips a row whose id did not parse, because an unidentifiable row cannot be checked against the exclusion", () => {
    // F7. The exclusion is keyed on `id`; a row with none cannot be tested
    // against it, so reading a class off it risks laundering OUR OWN write
    // back as the rower's declaration — the exact defect skip 1 exists for.
    // The second assertion proves the fixture is a declaration in every
    // other respect, so the first is really about the missing id.
    expect(
      pickDeclaredWeightClass([resultRow({ id: null, weightClass: "L" })], {
        ourResultIds: new Set(),
        now: NOW,
      }),
    ).toBeNull();
    expect(
      pickDeclaredWeightClass([resultRow({ id: 85561, weightClass: "L" })], {
        ourResultIds: new Set(),
        now: NOW,
      }),
    ).toBe("L");
  });

  it("takes a row whose timestamps are BOTH absent, because Concept2's own example carries a null date_utc", () => {
    expect(
      pickDeclaredWeightClass(
        [resultRow({ weightClass: "L", dateUtc: null, date: null })],
        { ourResultIds: new Set(), now: NOW },
      ),
    ).toBe("L");
  });

  it("skips rows whose class is not exactly H or L, and returns null when the page holds none", () => {
    // Not only absent and empty: a lowercase letter and a spelled-out word
    // are not wire classes, and sending one would be refused by Concept2
    // (or worse, accepted as something else).
    expect(
      pickDeclaredWeightClass(
        [
          resultRow({ weightClass: null }),
          resultRow({ weightClass: "" }),
          resultRow({ weightClass: "l" }),
          resultRow({ weightClass: "Heavyweight" }),
        ],
        { ourResultIds: new Set(), now: NOW },
      ),
    ).toBeNull();
    expect(
      pickDeclaredWeightClass([], { ourResultIds: new Set(), now: NOW }),
    ).toBeNull();
  });
});

describe("deriveWeightClass", () => {
  it("case-folds gender, because the wire's letter case is documented only by example", () => {
    expect(deriveWeightClass({ weight: 7000, gender: "m" })).toStrictEqual({
      ok: true,
      weightClass: "L",
    });
    expect(deriveWeightClass({ weight: 7000, gender: " F " })).toStrictEqual({
      ok: true,
      weightClass: "H",
    });
  });

  it("classifies every case in the table", () => {
    // INDEPENDENT literals: 7500 / 6150 are written here, never imported
    // from the module they gate (RF21's first smell). "or less" is
    // inclusive, so the boundary itself is LIGHT on both sides.
    const table = [
      { weight: 7500, gender: "M", expected: "L" },
      { weight: 7501, gender: "M", expected: "H" },
      { weight: 6150, gender: "F", expected: "L" },
      { weight: 6151, gender: "F", expected: "H" },
    ] as const;
    expect(
      table.map((c) =>
        deriveWeightClass({ weight: c.weight, gender: c.gender }),
      ),
    ).toStrictEqual(table.map((c) => ({ ok: true, weightClass: c.expected })));
  });

  it("REFUSES four of the six wrong-unit readings of a 75 kg rower", () => {
    // decigrams, grams, hundredths-kg (the assumed unit), hundredths-lb,
    // integer kg, integer lb. The THIRD is the assumed-correct reading and
    // the FOURTH is the one no band can catch — this test records that
    // rather than implying the guard is complete, so a later overclaim
    // goes red here.
    const readings = [750000, 75000, 7500, 16530, 75, 165];
    expect(
      readings.map((weight) => deriveWeightClass({ weight, gender: "M" }).ok),
    ).toStrictEqual([false, false, true, true, false, false]);
  });

  it("tells 'present but unreadable' apart from 'not set', and refuses a profile it cannot classify", () => {
    expect(
      deriveWeightClass({ weight: "unreadable", gender: "M" }),
    ).toStrictEqual({ ok: false, reason: "unreadable_weight" });
    expect(deriveWeightClass({ weight: null, gender: "M" })).toStrictEqual({
      ok: false,
      reason: "no_weight",
    });
    expect(deriveWeightClass({ weight: 0, gender: "M" })).toStrictEqual({
      ok: false,
      reason: "no_weight",
    });
    expect(deriveWeightClass({ weight: 7000, gender: null })).toStrictEqual({
      ok: false,
      reason: "no_gender",
    });
    // The band runs BEFORE the gender branch, so a wrong unit refuses for
    // every profile rather than only for the two we can classify.
    expect(deriveWeightClass({ weight: 750000, gender: "X" })).toStrictEqual({
      ok: false,
      reason: "implausible_weight",
    });
  });
});

// Phase LP PR 2 (spec 2026-09-06-logbook-parity §5): the result-level
// fields and the per-interval array, from the stored record and nothing
// else. Literals are hand computed, never via the mapper.
describe("buildC2Payload — Phase LP PR 2, result-level fields", () => {
  const LP_SUMMARY = {
    avgStrokeRate: 24,
    workoutType: 8,
    totalCalories: 372,
    dragFactorAverage: 101,
    avgHeartRateBpm: 142,
    minHeartRateBpm: 96,
    maxHeartRateBpm: 175,
    endingHeartRateBpm: 168,
    recoveryHeartRateBpm: null,
  };

  it("posts calories_total, drag_factor and a heart_rate object from the stored 0x0039/0x003A keys, each key only when present (a null recovery HR is left out)", () => {
    const post = buildC2Payload(
      { ...FINISHED_ROW, machineSummary: LP_SUMMARY },
      LINK,
      "UTC",
      false,
    );
    expect(post).toMatchObject({
      calories_total: 372,
      drag_factor: 101,
      heart_rate: { average: 142, min: 96, max: 175, ending: 168 },
    });
    expect(post.heart_rate as Record<string, unknown>).not.toHaveProperty(
      "recovery",
    );
  });

  it("0 calories posts 0 (a value); a missing key posts nothing; an all-null heart rate posts no heart_rate object at all", () => {
    const zero = buildC2Payload(
      {
        ...FINISHED_ROW,
        machineSummary: { avgStrokeRate: 24, workoutType: 8, totalCalories: 0 },
      },
      LINK,
      "UTC",
      false,
    );
    expect(zero.calories_total).toBe(0);
    expect(zero).not.toHaveProperty("drag_factor");
    // A drag factor of 0 is not a reading (no sentinel on the wire): omitted.
    expect(
      buildC2Payload(
        {
          ...FINISHED_ROW,
          machineSummary: {
            avgStrokeRate: 24,
            workoutType: 8,
            dragFactorAverage: 0,
          },
        },
        LINK,
        "UTC",
        false,
      ),
    ).not.toHaveProperty("drag_factor");
    expect(zero).not.toHaveProperty("heart_rate");
    const nulls = buildC2Payload(
      {
        ...FINISHED_ROW,
        machineSummary: {
          avgStrokeRate: 24,
          workoutType: 8,
          avgHeartRateBpm: null,
          minHeartRateBpm: null,
          maxHeartRateBpm: null,
          endingHeartRateBpm: null,
          recoveryHeartRateBpm: null,
        },
      },
      LINK,
      "UTC",
      false,
    );
    expect(nulls).not.toHaveProperty("heart_rate");
  });

  it("rest_distance is the PM5's own session total when stored and > 0, else today's summed rest metres; a stored 0 falls back (the > 0 rule the field already had)", () => {
    const withMachine = buildC2Payload(
      {
        ...FINISHED_ROW,
        machineSummary: {
          avgStrokeRate: 24,
          workoutType: 8,
          totalRestMeters: 275,
        },
      },
      LINK,
      "UTC",
      false,
    );
    expect(withMachine.rest_distance).toBe(275);
    const zeroMachine = buildC2Payload(
      {
        ...FINISHED_ROW,
        machineSummary: {
          avgStrokeRate: 24,
          workoutType: 8,
          totalRestMeters: 0,
        },
      },
      LINK,
      "UTC",
      false,
    );
    expect(zeroMachine.rest_distance).toBe(274);
    expect(buildC2Payload(FINISHED_ROW, LINK, "UTC", false).rest_distance).toBe(
      274,
    );
  });

  it("a non-integer or string stored value is omitted, never sent (the API fails the whole workout on one decimal)", () => {
    const post = buildC2Payload(
      {
        ...FINISHED_ROW,
        machineSummary: {
          avgStrokeRate: 24,
          workoutType: 8,
          totalCalories: 372.5,
          dragFactorAverage: "101",
          avgHeartRateBpm: 142.2,
        },
      },
      LINK,
      "UTC",
      false,
    );
    expect(post).not.toHaveProperty("calories_total");
    expect(post).not.toHaveProperty("drag_factor");
    expect(post).not.toHaveProperty("heart_rate");
  });
});

describe("buildC2Payload — Phase LP PR 2, workout.intervals[]", () => {
  const STEP_1 = {
    label: "250m @ 2:07.0",
    targetSplit: 127.0,
    actualSplit: 135.8,
    actualSeconds: 67.9,
    actualSource: "pm5" as const,
    meters: 250,
    actualMeters: 250,
    actualSpm: 25,
    spm: 26,
    machineCalories: 16,
    machineRestHr: null,
    machineRestSeconds: 60,
    machineRestMeters: 147,
  };
  const STEP_2 = {
    ...STEP_1,
    actualSplit: 112.2,
    actualSeconds: 56.1,
    actualSpm: 28,
    machineRestMeters: 95,
  };

  it("rides the payload as workout.intervals when every step fills the API's REQUIRED keys, and stays off PR0's fixture (steps: [])", () => {
    const post = buildC2Payload(
      { ...FINISHED_ROW, steps: [STEP_1, STEP_2] },
      LINK,
      "UTC",
      false,
    );
    expect(post.workout).toStrictEqual({
      intervals: [
        {
          type: "distance",
          time: 679,
          distance: 250,
          rest_time: 600,
          rest_distance: 147,
          stroke_rate: 25,
          calories_total: 16,
          targets: { pace: 1270, stroke_rate: 26 },
        },
        {
          type: "distance",
          time: 561,
          distance: 250,
          rest_time: 600,
          rest_distance: 95,
          stroke_rate: 28,
          calories_total: 16,
          targets: { pace: 1270, stroke_rate: 26 },
        },
      ],
    });
    expect(buildC2Payload(FINISHED_ROW, LINK, "UTC", false)).not.toHaveProperty(
      "workout",
    );
  });

  it("sends no workout array when the workout_type is one we do not map (ordinal 1), however complete the steps", () => {
    const post = buildC2Payload(
      {
        ...FINISHED_ROW,
        machineSummary: { avgStrokeRate: 24, workoutType: 1 },
        steps: [STEP_1, STEP_2],
      },
      LINK,
      "UTC",
      false,
    );
    expect(post).not.toHaveProperty("workout_type");
    expect(post).not.toHaveProperty("workout");
  });

  it("sends no workout array — not a partial one — when one step lacks its rest readback (a row saved before PR 2)", () => {
    const { machineRestSeconds: _r, ...prePr2 } = STEP_2;
    const post = buildC2Payload(
      { ...FINISHED_ROW, steps: [STEP_1, prePr2] },
      LINK,
      "UTC",
      false,
    );
    expect(post).not.toHaveProperty("workout");
    expect(post.workout_type).toBe("VariableInterval");
  });

  it("every numeric leaf of a full payload is an integer after JSON round-trip, and every string leaf is one the API enumerates", () => {
    const post = JSON.parse(
      JSON.stringify(
        buildC2Payload(
          {
            ...FINISHED_ROW,
            machineSummary: {
              avgStrokeRate: 24,
              workoutType: 8,
              totalCalories: 32,
              dragFactorAverage: 100,
              avgHeartRateBpm: 142,
              totalRestMeters: 242,
            },
            steps: [STEP_1, STEP_2],
          },
          LINK,
          "UTC",
          false,
        ),
      ),
    ) as unknown;
    const STRING_KEYS = new Set([
      "type",
      "date",
      "timezone",
      "weight_class",
      "workout_type",
    ]);
    // Collect every offending leaf, then assert once (no conditional
    // expect): an empty list is the pass.
    const offenders: string[] = [];
    const walk = (node: unknown, key: string): void => {
      if (typeof node === "number") {
        if (!Number.isInteger(node)) offenders.push(`${key}=${node}`);
      } else if (typeof node === "string") {
        if (!STRING_KEYS.has(key)) offenders.push(`${key}=${node}`);
      } else if (Array.isArray(node)) {
        node.forEach((n) => walk(n, key));
      } else if (node !== null && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) walk(v, k);
      }
    };
    walk(post, "");
    expect(offenders).toStrictEqual([]);
  });
});

// Phase AV (spec 2026-09-07-optional-auto-verify, Gate 0 approved): the code
// is sent ONLY when the rower has turned AUTO VERIFY on. OFF is the default
// and remains PR #337's behaviour verbatim — Concept2's own app leaves
// verifying to the rower, so the app must not do it uninvited.
//
// BOTH ARMS ARE PINNED. The OFF arm is not the weaker test here; it is the
// default every rower gets and the one a regression would ship silently.
describe("buildC2Payload — verification_code rides the AUTO VERIFY flag", () => {
  const EXIT7_BYTES = [
    0x06, 0x47, 0x99, 0xaf, 0x54, 0xb0, 0x21, 0xc0, 0x82, 0x16, 0x01, 0x00,
    0x94, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ];

  const VERIFIABLE_ROW = {
    ...FINISHED_ROW,
    machineWorkMeters: 500,
    machineWorkSeconds: 124.0,
    machineSummary: {
      avgStrokeRate: 26,
      workoutType: 8,
      verificationBytes: EXIT7_BYTES,
    },
  };

  it("OFF: withholds the code even on the row that would verify", () => {
    // This is exactly the row PR 2.5 sent a code for (it verified live,
    // rows 86044/5706), so nothing about the row explains the withholding —
    // only the flag does.
    const post = buildC2Payload(VERIFIABLE_ROW, LINK, "UTC", false);
    expect(post).not.toHaveProperty("verification_code");
    // The numbers the code WOULD have been checked against still post — the
    // rower can read the code off the monitor and verify by hand.
    expect(post.distance).toBe(500);
    expect(post.time).toBe(1240);
  });

  it("ON: sends the code, and the numbers it is checked against are unchanged", () => {
    const post = buildC2Payload(VERIFIABLE_ROW, LINK, "UTC", true);
    // Derived by hand from EXIT7_BYTES, not read off the implementation:
    // two LE u32 words from the FIRST EIGHT bytes only. 06 47 99 AF ->
    // 0xAF994706 -> "AF99-4706"; 54 B0 21 C0 -> 0xC021B054 -> "C021-B054".
    // Corroborated independently by `FromTheLog.test.tsx`, which derives the
    // display form "AF99-4706 C021-B054" from these same walk bytes.
    expect(post.verification_code).toBe("AF99-4706-C021-B054");
    expect(post.distance).toBe(500);
    expect(post.time).toBe(1240);
  });

  // THE GUARD IS AN AND, AND ONLY THESE TWO TESTS CAN SAY SO. The round-2
  // review mutated `usedMachineMeters && usedMachineSeconds` to `||` and all
  // 249 tests passed: the only negative arm nulled BOTH totals, so nothing
  // could tell the two operators apart.
  //
  // The divergent state is representable, not theoretical — the two columns
  // are independently nullable and `FromTheLog.tsx` says so in its own
  // comment. Under the mutant, a row with the machine's METRES and our
  // interval-sum SECONDS would post a code minted over neither, which is the
  // exact mismatch this block's comment promises to prevent.
  it("ON with machine METRES but no machine seconds: no code", () => {
    const post = buildC2Payload(
      { ...VERIFIABLE_ROW, machineWorkSeconds: null },
      LINK,
      "UTC",
      true,
    );
    expect(post).not.toHaveProperty("verification_code");
    // And the posted time really is the fallback, so the row this test
    // describes is the dangerous one rather than a hypothetical.
    expect(post.distance).toBe(500);
  });

  it("ON with machine SECONDS but no machine metres: no code", () => {
    const post = buildC2Payload(
      { ...VERIFIABLE_ROW, machineWorkMeters: null },
      LINK,
      "UTC",
      true,
    );
    expect(post).not.toHaveProperty("verification_code");
  });

  // The byte guard, and the null-code guard below it. Both are
  // defence-in-depth over `verificationWords`'s own checks, and both
  // survived round 2's mutations because nothing exercised a BAD blob.
  it("ON with a non-integer in the bytes: no code, not a guess", () => {
    const post = buildC2Payload(
      {
        ...VERIFIABLE_ROW,
        machineSummary: {
          ...VERIFIABLE_ROW.machineSummary,
          verificationBytes: [0x06, 1.5, 0x99, 0xaf, 0x54, 0xb0, 0x21, 0xc0],
        },
      },
      LINK,
      "UTC",
      true,
    );
    expect(post).not.toHaveProperty("verification_code");
  });

  it("ON with a SHORT blob: no code, and never the key set to null", () => {
    // `wireVerificationCode` returns null under 8 bytes. Without the
    // `code !== null` guard the key would post as `verification_code: null`
    // — a field Concept2 never asked for, on a row that cannot verify.
    const post = buildC2Payload(
      {
        ...VERIFIABLE_ROW,
        machineSummary: {
          ...VERIFIABLE_ROW.machineSummary,
          verificationBytes: [0x06, 0x47, 0x99],
        },
      },
      LINK,
      "UTC",
      true,
    );
    expect(post).not.toHaveProperty("verification_code");
  });

  it("ON but no machine totals: still no code, because it could only mismatch", () => {
    // The guard that survives from #336 verbatim. The code is minted over the
    // MACHINE's own distance and time; a row falling back to our interval
    // sums would post a code against numbers it was never minted over, and
    // measurement says that returns verified:false (the 5707 control).
    const post = buildC2Payload(
      {
        ...VERIFIABLE_ROW,
        machineWorkMeters: null,
        machineWorkSeconds: null,
      },
      LINK,
      "UTC",
      true,
    );
    expect(post).not.toHaveProperty("verification_code");
  });
});

// The seam the branch review named as ungated, and the one that would have
// caught the real bug in it: the Log screen decides whether to print a
// verification code from `concept2OverallTotals`, while THIS module decides
// what Concept2 actually receives. If the two disagree, the screen promises
// or withholds a code against numbers Concept2 never saw. Nothing else
// compares them — RF24's shape, where both halves are well tested and the
// seam between them is not. Reproducing the review's bug here (feeding the
// predicate `machineRestMeters: null`) fails the second case with
// "expected 6206 to be 6231", the 25 m between our summed rest and the
// monitor's own.
describe("buildC2Payload agrees with the eligibility predicate", () => {
  const cases: [string, SessionLogRow][] = [
    ["our summed totals, with rest", FINISHED_ROW],
    [
      "the monitor's own totals, with the monitor's own rest",
      {
        ...FINISHED_ROW,
        machineWorkMeters: 5706,
        machineWorkSeconds: 1319.3,
        restSeconds: 300,
        restMeters: 500,
        machineSummary: {
          avgStrokeRate: 21,
          workoutType: 8,
          totalRestMeters: 525,
        },
      },
    ],
    [
      "a monitor total of ZERO, which both sides must ignore",
      { ...FINISHED_ROW, machineWorkMeters: 0, machineWorkSeconds: 0 },
    ],
    [
      "no rest at all",
      { ...FINISHED_ROW, restSeconds: null, restMeters: null },
    ],
    [
      "a machine rest total out of band, so both fall back to ours",
      {
        ...FINISHED_ROW,
        machineSummary: {
          avgStrokeRate: 24,
          workoutType: 8,
          totalRestMeters: 0,
        },
      },
    ],
    [
      "a fractional seconds pair, where rounding could diverge",
      { ...FINISHED_ROW, workSeconds: 254.85, restSeconds: 120.04 },
    ],
  ];

  it.each(cases)(
    "posts the same overall figures the screen judges: %s",
    (_label, row) => {
      const post = buildC2Payload(row, LINK, "UTC", false);
      const overall = concept2OverallTotals({
        ...row,
        machineRestMeters:
          typeof row.machineSummary?.totalRestMeters === "number"
            ? row.machineSummary.totalRestMeters
            : null,
      });
      expect(overall).not.toBeNull();
      // What Concept2 receives, added up the way its own form displays it.
      const postedMeters =
        (post.distance as number) + ((post.rest_distance as number) ?? 0);
      const postedTenths =
        (post.time as number) + ((post.rest_time as number) ?? 0);
      expect(overall!.meters).toBe(postedMeters);
      expect(overall!.tenths).toBe(postedTenths);
    },
  );
});

// Phase LP: the derived heart-rate average on the wire.
describe("buildC2Payload — heart_rate.average is derived when the monitor sends none", () => {
  // Uneven gaps on purpose, both inside the six-second dropout cap: one
  // second at 100 then five at 140 is 133 time-weighted and 120 if each
  // sample counted once, so this pins the weighting, not just the plumbing.
  // Deciseconds, the unit `Sample.t` actually carries.
  const trace = {
    samples: [
      { t: 0, hr: 100 },
      { t: 10, hr: 140 },
      { t: 60, hr: 140 },
    ],
  };

  it("derives it from the trace, the same figure and rule the tile shows", () => {
    const post = buildC2Payload(
      { ...FINISHED_ROW, series: trace },
      LINK,
      "UTC",
      false,
    );
    expect(post.heart_rate).toStrictEqual({ average: 133 });
  });

  it("EXCLUDES resting strokes, so the wire agrees with the screen", () => {
    const resting = {
      samples: [
        { t: 0, hr: 100 },
        { t: 10, hr: 140, r: true as const },
        { t: 60, hr: 140 },
      ],
    };
    // With the middle stretch resting, only the opening second counts.
    expect(
      (
        buildC2Payload({ ...FINISHED_ROW, series: resting }, LINK, "UTC", false)
          .heart_rate as Record<string, number>
      ).average,
    ).toBe(100);
  });

  it("never overrides the monitor's OWN average when it sends one", () => {
    const post = buildC2Payload(
      {
        ...FINISHED_ROW,
        series: trace,
        machineSummary: { avgStrokeRate: 24, avgHeartRateBpm: 151 },
      },
      LINK,
      "UTC",
      false,
    );
    // 151, not the trace's 138: the machine's own reading wins wherever it
    // exists, which is what keeps this a FALLBACK rather than a replacement.
    expect(post.heart_rate).toStrictEqual({ average: 151 });
  });

  it("sends no heart rate at all when there is nothing to send", () => {
    expect(buildC2Payload(FINISHED_ROW, LINK, "UTC", false)).not.toHaveProperty(
      "heart_rate",
    );
    expect(
      buildC2Payload(
        { ...FINISHED_ROW, series: { samples: [] } },
        LINK,
        "UTC",
        false,
      ),
    ).not.toHaveProperty("heart_rate");
    // Out of band low: a derived 19 is not a heart rate we will post.
    expect(
      buildC2Payload(
        {
          ...FINISHED_ROW,
          series: {
            samples: [
              { t: 0, hr: 19 },
              { t: 10, hr: 19 },
            ],
          },
        },
        LINK,
        "UTC",
        false,
      ),
    ).not.toHaveProperty("heart_rate");
  });
});
