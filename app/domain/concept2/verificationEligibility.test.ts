import { describe, expect, it } from "vitest";
import {
  concept2OffersVerification,
  concept2OverallTotals,
} from "./verificationEligibility.js";

/** A row with no rest and no monitor summary: overall == work. */
const plain = (meters: number, seconds: number) => ({
  machineWorkMeters: null,
  machineWorkSeconds: null,
  workMeters: meters,
  workSeconds: seconds,
  restMeters: null,
  restSeconds: null,
});

describe("concept2OffersVerification — the measured rule", () => {
  // Every figure below was checked on a real Concept2 edit form on
  // 2026-09-07. This suite is that measurement, transcribed.
  it.each([100, 500, 1000, 2000, 5000, 6000, 10000, 21097, 42195, 100000])(
    "offers the field at %i m, a listed distance",
    (m) => {
      // A deliberately non-standard time, so only the distance can qualify.
      expect(concept2OffersVerification(plain(m, 137.3))).toBe(true);
    },
  );

  it.each([
    [60, "1:00"],
    [240, "4:00"],
    [1800, "30:00"],
    [3600, "60:00"],
  ])("offers the field at %i s (%s), a listed time", (s) => {
    // 1234 m is on no list, so only the time can qualify.
    expect(concept2OffersVerification(plain(1234, s))).toBe(true);
  });

  it("matches distance EXACTLY — one metre either side is refused", () => {
    expect(concept2OffersVerification(plain(2000, 450))).toBe(true);
    expect(concept2OffersVerification(plain(1999, 450))).toBe(false);
    expect(concept2OffersVerification(plain(2001, 452))).toBe(false);
  });

  it("ROUNDS seconds to tenths rather than truncating", () => {
    // 60.05 s rounds to 601 tenths and is NOT the 1:00 standard; truncating
    // gives 600 and would wrongly offer the field. Every other seconds value
    // in this suite is exact at x10, so this is the only case that can tell
    // `Math.round` from `Math.floor`.
    expect(concept2OverallTotals(plain(1234, 60.05))?.tenths).toBe(601);
    expect(concept2OffersVerification(plain(1234, 60.05))).toBe(false);
    // …and rounding DOWN onto a standard qualifies, which is the same rule
    // read the other way: 60.04 s is 600 tenths, exactly 1:00.
    expect(concept2OverallTotals(plain(1234, 60.04))?.tenths).toBe(600);
    expect(concept2OffersVerification(plain(1234, 60.04))).toBe(true);
  });

  it("matches time EXACTLY — one tenth either side is refused", () => {
    expect(concept2OffersVerification(plain(7101, 1800))).toBe(true);
    expect(concept2OffersVerification(plain(7102, 1799.9))).toBe(false);
    expect(concept2OffersVerification(plain(7103, 1800.1))).toBe(false);
  });

  it.each([
    [3000, 680],
    [750, 170],
    [10501, 2700],
  ])("refuses %i m / %i s, off both lists", (m, s) => {
    expect(concept2OffersVerification(plain(m, s))).toBe(false);
  });

  it("does not treat BikeErg's 200 m as rankable — we ship RowErg only", () => {
    // 200 m appears on Concept2's BikeErg list but NOT its RowErg one. Its
    // ABSENCE from the RowErg list is the reason a 200 m row on a RowErg is
    // never offered the field; its presence on the other list is a
    // coincidence worth naming so nobody "fixes" this by adding it.
    expect(concept2OffersVerification(plain(200, 53.4))).toBe(false);
  });
});

describe("concept2OverallTotals — rest counts toward the figure", () => {
  it("adds rest to both axes, which is what makes a standard piece miss", () => {
    // The crossed experiment, transcribed: same work, rest decides.
    const withRest = {
      ...plain(2000, 480),
      restMeters: 180,
      restSeconds: 120,
    };
    expect(concept2OverallTotals(withRest)).toStrictEqual({
      meters: 2180,
      tenths: 6000,
    });
    expect(concept2OffersVerification(withRest)).toBe(false);
    // …and the reverse: a NON-standard work distance whose overall lands on
    // 2000 IS offered the field. Only the overall figure explains both.
    const landsOnStandard = {
      ...plain(1820, 420),
      restMeters: 180,
      restSeconds: 60,
    };
    expect(concept2OverallTotals(landsOnStandard)?.meters).toBe(2000);
    expect(concept2OffersVerification(landsOnStandard)).toBe(true);
  });

  it("treats a ZERO machine total as absent, exactly as the mapper does", () => {
    // `mapping.ts` argues this predicate at length ("NOT `??`"): a stored 0
    // is a value `??` would post while the screen falls back to our sum.
    // Without the `> 0` half, overall reads 0 and the row is refused.
    const zeroMachine = {
      ...plain(500, 124),
      machineWorkMeters: 0,
      machineWorkSeconds: 0,
    };
    expect(concept2OverallTotals(zeroMachine)).toStrictEqual({
      meters: 500,
      tenths: 1240,
    });
    expect(concept2OffersVerification(zeroMachine)).toBe(true);
  });

  it("prefers the monitor's own totals, the same numbers we post", () => {
    const row = {
      machineWorkMeters: 5706,
      machineWorkSeconds: 1319.3,
      workMeters: 5708,
      workSeconds: 1319.4,
      restMeters: 500,
      restSeconds: 300,
      machineRestMeters: 525,
    };
    // 5706 + 525 = 6231, and 1319.3 s + 300 s = 16193 tenths.
    expect(concept2OverallTotals(row)).toStrictEqual({
      meters: 6231,
      tenths: 16193,
    });
  });

  it("ignores a machine rest distance that is not a whole number in band", () => {
    const base = { ...plain(2000, 480), restMeters: 100, restSeconds: 60 };
    expect(
      concept2OverallTotals({ ...base, machineRestMeters: 0 })?.meters,
    ).toBe(2100);
    expect(
      concept2OverallTotals({ ...base, machineRestMeters: 12.5 })?.meters,
    ).toBe(2100);
    expect(
      concept2OverallTotals({ ...base, machineRestMeters: 180 })?.meters,
    ).toBe(2180);
  });

  it("falls back per AXIS, so a row carrying only monitor totals still decides", () => {
    // The shape a stored monitor piece actually has: machine totals set, our
    // summed pair still null. Treating that as "no totals" would hide the
    // code on exactly the rows that earn it.
    const monitorOnly = {
      machineWorkMeters: 500,
      machineWorkSeconds: 124,
      workMeters: null,
      workSeconds: null,
      restMeters: null,
      restSeconds: null,
    };
    expect(concept2OverallTotals(monitorOnly)).toStrictEqual({
      meters: 500,
      tenths: 1240,
    });
    expect(concept2OffersVerification(monitorOnly)).toBe(true);
  });

  it("is null only when an AXIS carries neither number", () => {
    expect(
      concept2OverallTotals({
        ...plain(0, 0),
        workMeters: null,
        machineWorkMeters: null,
      }),
    ).toBeNull();
    expect(
      concept2OffersVerification({
        ...plain(0, 0),
        workSeconds: null,
        machineWorkSeconds: null,
      }),
    ).toBe(false);
  });
});
