/** Concept2's time unit: tenths of a second, rounded (transplanted from
 *  `scripts/c2-crossconnect.ts`'s `Math.round(s*10)`, measured live at
 *  PR0). A leaf module so both `mapping.ts` and `intervals.ts` import one
 *  definition without a cycle (Phase LP PR 2). */
export function c2Tenths(seconds: number): number {
  return Math.round(seconds * 10);
}
