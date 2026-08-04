import {
  DURATION_BUCKETS,
  type DurationBucket,
} from "../../domain/duration.js";
import { DURATION_LABEL } from "./durationChips";

/** Genuinely shared now (Amendment, 2026-08-04 PR #50 round) — originally
 *  `src/library/filterTokens.ts`'s own private `collapseDurations`, the
 *  ONE collapse helper this codebase's usual per-file-duplication
 *  convention (`DURATION_LABEL`'s own precedent, `TYPE_COLOR_VAR`'s
 *  comment) deliberately does NOT get duplicated a second time: Today's
 *  TIME token now needs the identical range-collapse rule the Library's
 *  own TIME token already had, byte-for-byte, and the brief calling for
 *  this move is explicit that a second hand-kept copy is the wrong answer
 *  here. The Library's own `filterTokens.test.ts` exercises this
 *  unmodified through `filterTokens()` — extracting the implementation
 *  changes nothing about its inputs/outputs.
 *
 *  Fix round (N2): what "contiguous" means below reads `domain/duration
 *  .ts`'s own `DURATION_BUCKETS` directly, rather than re-deriving a
 *  second "canonical order" from `DURATION_CHIPS` (which is itself now
 *  built FROM `DURATION_BUCKETS` — see that file's own comment). One
 *  fewer hop to the one real source of the order. `DURATION_LABEL` (the
 *  bucket -> display-label map) still comes from `durationChips.ts`, the
 *  one place that owns it. */

// A bucket's own minute boundaries, indexed the same as DURATION_BUCKETS —
// used only to compose a MERGED range label for a contiguous run longer
// than one bucket (a single selected bucket just reuses its own
// DURATION_LABEL verbatim, which already reads identically to what this
// would produce).
const LOWER_BOUND: readonly (string | null)[] = [null, "30", "45", "60"];
const UPPER_BOUND: readonly (string | null)[] = ["30", "45", "60", null];

/** Collapses a non-empty set of buckets into one label: a contiguous run
 *  reads as its endpoints (`<30′–45–60′`-style, or the bucket's own label
 *  verbatim when it's a run of one), a non-contiguous selection lists every
 *  member comma-separated. Callers own the "what does an EMPTY set mean"
 *  question themselves (Library's `filterTokens.ts` never renders a token
 *  for one at all; Today's `todayFilterTokens.ts` renders one with its own
 *  label, since an empty set can itself be a deviation there) — this
 *  function is never called with one. */
export function collapseDurations(durations: DurationBucket[]): string {
  const indices = durations
    .map((d) => DURATION_BUCKETS.indexOf(d))
    .sort((a, b) => a - b);
  const contiguous = indices.every(
    (idx, i) => i === 0 || idx === indices[i - 1] + 1,
  );
  if (!contiguous) {
    return indices.map((i) => DURATION_LABEL[DURATION_BUCKETS[i]]).join(", ");
  }
  const first = indices[0];
  const last = indices[indices.length - 1];
  if (first === last) return DURATION_LABEL[DURATION_BUCKETS[first]];
  const includesUnder = first === 0;
  const includesPlus = last === DURATION_BUCKETS.length - 1;
  // Both ends selected as part of one contiguous run means every bucket is
  // in — a real (if functionally inert) active filter state, not an error.
  if (includesUnder && includesPlus) return "<30′–60′+";
  if (includesUnder) return `<${UPPER_BOUND[last]}′`;
  if (includesPlus) return `${LOWER_BOUND[first]}′+`;
  return `${LOWER_BOUND[first]}–${UPPER_BOUND[last]}′`;
}
