// Spec §8.3: nothing else in the repo pins `TZ`, and a calendar pin that
// passes in UTC proves nothing about a device in New York. Set BEFORE any
// Date is constructed in this file; the first test ASSERTS the zone took
// (RF38: a property of how the test got there is an assertion).
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";
import { toCalendarDate } from "./useStatsRows";

describe("useStatsRows — the adapter converts in the process's zone (spec §8.3, invariant 5)", () => {
  it("the test process is in America/New_York: a September instant reads UTC-4 (offset 240)", () => {
    expect(new Date("2026-09-12T12:00:00Z").getTimezoneOffset()).toBe(240);
  });

  it("02:30 UTC on the 13th is still the 12th in New York (22:30 EDT) — the previous local day; UTC would say the 13th", () => {
    // 23:30Z on the 12th cannot serve: it is the 12th in UTC too, so the
    // UTC-getter mutant passes it (measured at 652ac26c).
    expect(toCalendarDate(new Date("2026-09-13T02:30:00Z"))).toStrictEqual({
      y: 2026,
      m: 9,
      d: 12,
    });
  });

  it("a local-noon instant lands on its own day and the month is 1-based", () => {
    expect(toCalendarDate(new Date(2026, 0, 17, 12))).toStrictEqual({
      y: 2026,
      m: 1,
      d: 17,
    });
  });
});
