import { describe, it, expect } from "vitest";
import {
  FIXED_SOURCES,
  heartRateProvenance,
  rateProvenance,
  type MachineTileProvenance,
  type TileSource,
} from "./tileProvenance";

// The whole point of this module is that the SCREEN can state which branch
// produced a value. A test that only checked the happy branch would leave the
// conditional half — the half that exists at all because the monitor doubles
// its own average on a terminate — unguarded.

describe("tileProvenance: the four that never switch", () => {
  it.each([
    ["avgWatts", "AVG WATTS", "derived"],
    ["calPerHour", "CAL / HOUR", "derived"],
    ["calories", "CALORIES", "measured"],
    ["drag", "DRAG", "measured"],
  ] as const)("%s is labelled %s and is always %s", (key, label, source) => {
    const p = FIXED_SOURCES[key];
    expect(p.label).toBe(label);
    expect(p.source).toBe(source);
    // A fixed tile must NOT carry a per-row explanation: `because` is the
    // sentence that says which way a switch went, and these never switch.
    expect(p).not.toHaveProperty("because");
  });

  // Scoped to the WHOLE tile set and every branch, not just the fixed four.
  // The first version of this assertion read `FIXED_SOURCES` alone, and a
  // mutant adding "Concept2's published logbook formula" to RATE — the exact
  // over-claim this board was built around, written three times during the
  // gate — passed it 12/12. A census that cannot see the conditional tiles
  // cannot catch the defect that lives in them (RF21/RF24).
  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])(
    "names Concept2 on exactly AVG WATTS and CAL/HOUR (finished=%s, monitorHr=%s)",
    (finished, monitorHr) => {
      const all: MachineTileProvenance = {
        ...FIXED_SOURCES,
        rate: rateProvenance(finished),
        avgHr: heartRateProvenance(monitorHr),
      };
      const named = (Object.keys(all) as (keyof MachineTileProvenance)[])
        .filter((k) => {
          const p = all[k];
          return (
            p.detail?.includes("Concept2") === true ||
            p.because?.includes("Concept2") === true
          );
        })
        .sort();
      // RATE is a weighted mean of the splits and AVG HR a time-weighted mean
      // of the trace. Neither is the logbook formula, on either branch.
      expect(named).toStrictEqual(["avgWatts", "calPerHour"]);
    },
  );
});

describe("tileProvenance: RATE switches on whether the piece finished", () => {
  it("is MEASURED on a finished piece, with nothing to explain", () => {
    const p = rateProvenance(true);
    expect(p.source satisfies TileSource).toBe("measured");
    expect(p.because).toBeUndefined();
  });

  it("is DERIVED on a piece cut short, and says why", () => {
    const p = rateProvenance(false);
    expect(p.source).toBe("derived");
    expect(p.because).toMatch(/stopped this piece early/i);
  });

  it("keeps ONE label either way, so the tile face never changes", () => {
    expect(rateProvenance(true).label).toBe(rateProvenance(false).label);
  });
});

describe("tileProvenance: AVG HR switches on whether the monitor sent one", () => {
  it("is MEASURED when the monitor sent its own average", () => {
    const p = heartRateProvenance(true);
    expect(p.source).toBe("measured");
    expect(p.because).toBeUndefined();
  });

  it("is DERIVED from the belt's trace otherwise, and says so", () => {
    const p = heartRateProvenance(false);
    expect(p.source).toBe("derived");
    expect(p.because).toMatch(/belt/i);
  });

  it("keeps ONE label either way", () => {
    expect(heartRateProvenance(true).label).toBe(
      heartRateProvenance(false).label,
    );
  });
});

describe("the two conditional tiles are independent", () => {
  // They switch on DIFFERENT predicates. A single shared flag would make one
  // of them lie on any row where the predicates disagree, which is exactly
  // why no static grouping can cover both.
  it("a terminated piece whose monitor DID send a heart rate splits them", () => {
    const sources: MachineTileProvenance = {
      ...FIXED_SOURCES,
      rate: rateProvenance(false),
      avgHr: heartRateProvenance(true),
    };
    expect(sources.rate.source).toBe("derived");
    expect(sources.avgHr.source).toBe("measured");
  });
});
