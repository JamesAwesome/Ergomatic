/**
 * When will Concept2 let a rower type this row's verification code in?
 *
 * MEASURED, not inferred, 2026-09-07 by driving a logged-in browser over 21
 * purpose-built rows — every listed figure, both boundaries and three
 * negatives, identical on desktop and iPhone
 * (`docs/superpowers/research/2026-09-07-c2-verification-field-rule.md`).
 * The `verification_code` input is ALWAYS in Concept2's edit form; its
 * VISIBILITY carries the rule, which is why a detector that asked whether the
 * input existed could never go red.
 *
 * The rule: visible if and only if the row's OVERALL distance is one of the
 * rankable distances, or its OVERALL time one of the rankable durations, each
 * matched exactly — to the metre and to the tenth of a second. "Overall" is
 * work plus rest, the figure Concept2 displays; a crossed experiment settled
 * that on BOTH axes: work 1820 m + 180 m rest shows the field at 2000 m
 * overall while work 2000 m + 180 m rest does not at 2180 m, and work 25:00
 * + 5:00 rest shows it at 30:00 overall while 6:00 of rest does not at
 * 31:00. In each pair the work figure alone explains neither arm.
 *
 * Showing a code the rower has nowhere to type is noise, so the Log screen
 * asks this before printing one.
 *
 * WHAT THIS ANSWERS, exactly (review finding 6): "if this row reached
 * Concept2 with the figures we would post, would its edit form offer a code
 * field?" It does NOT ask whether the row is uploadable — `eligibilityFailure`
 * in `server/concept2/mapping.ts` owns that, and refuses a row with no work
 * totals, one that did not finish, or one that is not from the monitor. A
 * caller that renders on rows those rules reject (the Log screen does, for a
 * terminated partial) is asking a hypothetical, and gets a hypothetical
 * answer. That is the right shape for a display: the alternative is printing
 * a code beside a row whose numbers Concept2 will never see.
 */

/** `log.concept2.com/help`, RowErg and SkiErg, quoted: "100 Meters, 500
 *  Meters, 1000 Meters, 2000 Meters, 5000 Meters, 6000 Meters, 10000 Meters,
 *  21,097 Meters (half marathon), 42,195 Meters (marathon), 100,000 Meters
 *  (team event)". Every one of these was measured to show the field.
 *  The same page publishes a SEPARATE list for BikeErg, quoted: "200 Meters,
 *  500 Meters, 1000 Meters, 4000 Meters, 10,000 Meters, 20,000 Meters,
 *  40,000 Meters, 100,000 Meters (team event), 1 minute, 30 minutes, 60
 *  minutes". It is deliberately absent here: we ship no BikeErg, its list was
 *  never measured, and guessing behaviour from RowErg's is exactly the
 *  inference this module exists to avoid. */
const ROWERG_RANKABLE_METERS: readonly number[] = [
  100, 500, 1000, 2000, 5000, 6000, 10000, 21097, 42195, 100000,
];

/** The same page's timed pieces — "1 minute, 4 minutes, 30 minutes, 60
 *  minutes" — in TENTHS, the unit Concept2's wire uses. All four measured. */
const RANKABLE_TENTHS: readonly number[] = [600, 2400, 18000, 36000];

/** The row fields that decide what we post. Deliberately the SAME names the
 *  stored row and the mapper both use, so a caller cannot quietly feed this
 *  something other than the numbers Concept2 will actually receive. */
export interface PostedTotalsInput {
  machineWorkMeters: number | null;
  machineWorkSeconds: number | null;
  workMeters: number | null;
  workSeconds: number | null;
  restMeters: number | null;
  restSeconds: number | null;
  /** `machineSummary.totalRestMeters` — the monitor's own rest distance,
   *  which the mapper prefers over our summed one when it is a whole number
   *  in 1..1_000_000. */
  machineRestMeters?: number | null;
}

/** Tenths of a second, the wire's unit. Mirrors `server/concept2/tenths.ts`'s
 *  `c2Tenths` exactly; kept as its own line here because this module is
 *  `domain/` and may not import from `server/`. */
function tenths(seconds: number): number {
  return Math.round(seconds * 10);
}

/**
 * What Concept2 ends up displaying for this row: work plus rest, on both
 * axes, in the units it receives. `null` when the row has no work totals at
 * all — such a row cannot be uploaded, so nothing downstream is meaningful.
 *
 * The work-total choice mirrors `buildC2Payload`: the monitor's own figure
 * when it is present and positive, our summed one otherwise, and the two axes
 * move independently exactly as they do there.
 */
export function concept2OverallTotals(
  row: PostedTotalsInput,
): { meters: number; tenths: number } | null {
  // Per AXIS, not per row: the mapper picks the monitor's figure over ours
  // independently on each, and a row can legitimately carry one without the
  // other. `null` only when an axis has neither number, where there is no
  // figure Concept2 could display and nothing to decide.
  const meters =
    row.machineWorkMeters !== null && row.machineWorkMeters > 0
      ? row.machineWorkMeters
      : row.workMeters;
  const seconds =
    row.machineWorkSeconds !== null && row.machineWorkSeconds > 0
      ? row.machineWorkSeconds
      : row.workSeconds;
  if (meters === null || seconds === null) return null;
  const postedMeters = meters;
  const postedTenths = tenths(seconds);

  const machineRest = row.machineRestMeters;
  const restMeters =
    typeof machineRest === "number" &&
    Number.isInteger(machineRest) &&
    machineRest >= 1 &&
    machineRest <= 1_000_000
      ? machineRest
      : row.restMeters !== null && row.restMeters > 0
        ? row.restMeters
        : 0;
  const restTenths =
    row.restSeconds !== null && row.restSeconds > 0
      ? tenths(row.restSeconds)
      : 0;

  return {
    meters: postedMeters + restMeters,
    tenths: postedTenths + restTenths,
  };
}

/**
 * True when Concept2's edit form will show this row a verification code
 * field, so a code we print is one the rower can actually use.
 */
export function concept2OffersVerification(row: PostedTotalsInput): boolean {
  const overall = concept2OverallTotals(row);
  if (overall === null) return false;
  return (
    ROWERG_RANKABLE_METERS.includes(overall.meters) ||
    RANKABLE_TENTHS.includes(overall.tenths)
  );
}
