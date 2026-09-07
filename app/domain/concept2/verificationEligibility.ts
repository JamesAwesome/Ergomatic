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
 * that (work 1820 + 180 rest shows the field, work 2000 + 180 rest does not).
 *
 * Showing a code the rower has nowhere to type is noise, so the Log screen
 * asks this before printing one.
 */

/** `log.concept2.com/help`, RowErg and SkiErg, quoted: "100 Meters, 500
 *  Meters, 1000 Meters, 2000 Meters, 5000 Meters, 6000 Meters, 10000 Meters,
 *  21,097 Meters (half marathon), 42,195 Meters (marathon), 100,000 Meters
 *  (team event)". Every one of these was measured to show the field.
 *  BikeErg's list DIFFERS (it carries 200 m and 4000 m and drops others) and
 *  is deliberately absent: we ship no BikeErg, and guessing its behaviour
 *  from RowErg's is exactly the inference this module exists to avoid. */
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
