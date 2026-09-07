/** Concept2's time unit: tenths of a second, rounded (transplanted from
 *  `scripts/c2-crossconnect.ts`'s `Math.round(s*10)`, measured live at
 *  PR0). A leaf module so both `mapping.ts` and `intervals.ts` import one
 *  definition without a cycle (Phase LP PR 2). */
export function c2Tenths(seconds: number): number {
  return Math.round(seconds * 10);
}

/** A stored number that may be sent to Concept2: an integer within
 *  [min, max]. Anything else — absent, null, a decimal, a string — is
 *  omitted, because the API fails the WHOLE workout on one non-integer
 *  ("Sending across a decimal value or a string where an integer is
 *  expected … will result in the workout failing"). */
export function sendableInt(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : undefined;
}
