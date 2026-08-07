import { describe, expect, it } from "vitest";
import { mastheadDate, releaseDate, updatedLabel } from "./newsDates";

describe("mastheadDate", () => {
  it('formats "WED 5 AUG" for the masthead', () => {
    expect(mastheadDate(new Date(2026, 7, 5))).toBe("WED 5 AUG");
  });

  it('formats a different weekday/day correctly ("SAT 1 AUG")', () => {
    expect(mastheadDate(new Date(2026, 7, 1))).toBe("SAT 1 AUG");
  });
});

describe("releaseDate", () => {
  it('formats an ISO date as "4 AUG"', () => {
    expect(releaseDate("2026-08-04")).toBe("4 AUG");
  });

  it("does not drift a day from a UTC-midnight ISO date regardless of the runner's local timezone", () => {
    // The bug this guards: parsing "2026-08-04" with `new Date("2026-08-04")`
    // then formatting with the LOCAL timezone can print "3 AUG" in any
    // timezone west of UTC. releaseDate must anchor both the parse and the
    // format to UTC so the printed day always matches the ISO date's own day.
    expect(releaseDate("2026-01-01")).toBe("1 JAN");
  });
});

describe("updatedLabel", () => {
  it('formats an ISO date as month-short + year, uppercase ("JUL 2026")', () => {
    expect(updatedLabel("2026-07-01")).toBe("JUL 2026");
  });

  it("does not drift a day/month from a UTC-midnight ISO date regardless of the runner's local timezone", () => {
    // Same class of bug releaseDate guards against: a naive
    // `new Date("2026-01-01")` formatted in a local timezone west of UTC can
    // print "DEC 2025" instead of "JAN 2026". Anchor both parse and format
    // to UTC.
    expect(updatedLabel("2026-01-01")).toBe("JAN 2026");
  });
});
