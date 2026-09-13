// Spec §8.3/§8.4: the trend's hook converts `test_history.loggedAt` the
// same way as every stats row, and gets the same negative-offset pin. Set
// BEFORE any Date is constructed; the first test ASSERTS the zone took.
const TZ_BEFORE = process.env.TZ;
process.env.TZ = "America/New_York";

import { afterAll, describe, expect, it } from "vitest";

afterAll(() => {
  if (TZ_BEFORE === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_BEFORE;
});
import { testRowToPoint } from "./useTestHistory";

describe("useTestHistory — the append instant becomes a date in the process's zone", () => {
  it("the test process is in America/New_York (offset 240 in September)", () => {
    expect(new Date("2026-09-12T12:00:00Z").getTimezoneOffset()).toBe(240);
  });

  it("02:30 UTC on the 13th is still the 12th in New York; UTC would say the 13th", () => {
    expect(
      testRowToPoint({
        id: "t",
        distance: "2k",
        splitSeconds: 114,
        loggedAt: "2026-09-13T02:30:00Z",
      }),
    ).toStrictEqual({
      id: "t",
      distance: "2k",
      splitSeconds: 114,
      date: { y: 2026, m: 9, d: 12 },
    });
  });
});
