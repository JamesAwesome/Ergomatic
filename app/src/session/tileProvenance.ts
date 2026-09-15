// Gate 0B round 2, approved 2026-09-15 — ruling 1, the answerable drill-down.
//
// Why this exists as a TYPE rather than a lookup the sheet performs:
// `MachineTier` carries values only, so a renderer cannot tell which branch
// produced `rate` or `avgHr`. Re-deriving the predicate downstream gives two
// copies that drift, and `machineTierFromRun`'s own doc comment in
// `summaryModel.ts` already records that exact
// failure happening once this phase ("the alternative is two that drift,
// which is how the tile and the wire came to disagree"). So the source is
// stamped at the SAME site that picks the value, and the sheet only renders
// what it is handed.

/** Who did the arithmetic. Deliberately not "ours" vs "theirs": AVG WATTS
 *  and CAL/HOUR reproduce CONCEPT2'S OWN LOGBOOK figures over the
 *  monitor's figures, so the formula is theirs and only the running of it is
 *  ours. And deliberately not "estimated", which is what the tilde already
 *  means on the baselines surface.
 *
 *  The user-facing words are MEASURED and DERIVED (James, 2026-09-15). See
 *  `MachineSummaryTable.tsx` for the objection raised against "MEASURED" and
 *  why it is weaker than it sounds. The same two words carry the same
 *  distinction on BOTH surfaces, so a rower learns it once. */
export type TileSource = "measured" | "derived" | "planned";

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
  /** Present only when every interval agreed a target, which is exactly when
   *  the RATE tile renders a SECOND number (`RATE · TARGET  26 / 26`). It is
   *  neither measured nor derived: the rower authored it by choosing the
   *  workout, so it is a THIRD source. The sheet's title claims every number
   *  on the block, and this one was missing from it — the gate never showed
   *  it because the captured fixture had no agreed target (RF3). */
  target?: TileProvenance;
}

/** The tiles whose source is the same on every row. */
export type FixedTile = "avgWatts" | "calories" | "calPerHour" | "drag";

/** The four that never switch. Stated once so the conditional two are the
 *  only thing a reader has to think about. Typed as `TileProvenance` rather
 *  than `as const` so `detail` is readable on every entry — a caller asking
 *  "which of these name Concept2's formula?" should not have to know which
 *  literal it is holding. */
export const FIXED_SOURCES: Record<FixedTile, TileProvenance> = {
  avgWatts: {
    label: "AVG WATTS",
    source: "derived",
    detail: "Concept2's published formula, from your time and distance.",
  },
  calories: { label: "CALORIES", source: "measured" },
  calPerHour: {
    label: "CAL / HOUR",
    source: "derived",
    // NOT "published": `logbookDerived.ts` tags the WATTS formula PRIMARY
    // from Concept2's own calculator, but records this one as reproduced by
    // matching six cells of a photographed logbook row — no publication is
    // cited anywhere in this repo. The copy says what we actually know.
    detail:
      "Worked out from the monitor's calorie count, to match what Concept2's logbook shows.",
  },
  drag: { label: "DRAG", source: "measured" },
} satisfies Record<FixedTile, TileProvenance>;

/** TARGET, when the tile shows one. */
export function targetProvenance(): TileProvenance {
  return {
    label: "TARGET",
    source: "planned",
    detail: "The rate you asked for, from the workout you chose.",
  };
}

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
