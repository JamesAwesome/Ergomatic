// GATE 0B ROUND 2 PROTOTYPE — ruling 1, the answerable drill-down.
//
// Why this exists as a TYPE rather than a lookup the sheet performs:
// `MachineTier` carries values only, so a renderer cannot tell which branch
// produced `rate` or `avgHr`. Re-deriving the predicate downstream gives two
// copies that drift, and `summaryModel.ts:1229` already records that exact
// failure happening once this phase ("the alternative is two that drift,
// which is how the tile and the wire came to disagree"). So the source is
// stamped at the SAME site that picks the value, and the sheet only renders
// what it is handed.

/** Who did the arithmetic. Deliberately not "ours" vs "theirs": AVG WATTS
 *  and CAL/HOUR run CONCEPT2'S OWN published logbook formula over the
 *  monitor's figures, so the formula is theirs and only the running of it is
 *  ours. And deliberately not "estimated", which is what the tilde already
 *  means on the baselines surface.
 *
 *  The user-facing words are MEASURED and DERIVED (James, 2026-09-15). See
 *  `MachineSummaryTable.tsx` for the objection raised against "MEASURED" and
 *  why it is weaker than it sounds. The same two words carry the same
 *  distinction on BOTH surfaces, so a rower learns it once. */
export type TileSource = "measured" | "derived";

export interface TileProvenance {
  label: string;
  source: TileSource;
  /** Present only where the source was CHOSEN for this row rather than
   *  fixed. This is the sentence the screen has never said. */
  because?: string;
  /** What the arithmetic actually IS, where naming it adds something. Held
   *  PER ROW rather than per group because the first draft put "Concept2's
   *  own published formula" as a heading over all four computed tiles, and
   *  it is true of exactly two of them — RATE is a weighted mean of the
   *  splits and AVG HR a time-weighted mean of the trace. A heading that
   *  over-claims what sits under it is the defect this whole pass exists to
   *  remove; shipping one inside the fix would have been funny. */
  detail?: string;
}

export interface MachineTileProvenance {
  avgWatts: TileProvenance;
  calories: TileProvenance;
  calPerHour: TileProvenance;
  rate: TileProvenance;
  drag: TileProvenance;
  avgHr: TileProvenance;
}

/** The four that never switch. Stated once so the conditional two are the
 *  only thing a reader has to think about. */
export const FIXED_SOURCES = {
  avgWatts: {
    label: "AVG WATTS",
    source: "derived",
    detail:
      "Concept2's published logbook formula, from your time and distance.",
  },
  calories: { label: "CALORIES", source: "measured" },
  calPerHour: {
    label: "CAL / HOUR",
    source: "derived",
    detail:
      "Concept2's published logbook formula, from the monitor's calorie count.",
  },
  drag: { label: "DRAG", source: "measured" },
} as const satisfies Record<string, TileProvenance>;

/** RATE, per row. `finished` is the same flag `sessionStrokeRate` branches
 *  on — a free row counts as finished (James, 2026-09-07). */
export function rateProvenance(finished: boolean): TileProvenance {
  return finished
    ? { label: "RATE", source: "measured" }
    : {
        label: "RATE",
        source: "derived",
        because:
          "You stopped this piece early. The monitor's own average is not reliable when that happens, so this is the average of your splits instead.",
      };
}

/** AVG HR, per row. The monitor's own field is empty on every capture this
 *  repo holds, but it is not impossible, so the tile has two sources and
 *  the screen has never said which one it is showing. */
export function heartRateProvenance(monitorSentOne: boolean): TileProvenance {
  return monitorSentOne
    ? { label: "AVG HR", source: "measured" }
    : {
        label: "AVG HR",
        source: "derived",
        because:
          "The monitor sent no average, so this is your belt's reading over the time you were working.",
      };
}
