import {
  DURATION_BUCKETS,
  type DurationBucket,
} from "../../domain/duration.js";

/** Bucket -> its own display label. Exported alongside `DURATION_CHIPS`
 *  (not just kept private) so `durationTokenLabel.ts`'s `collapseDurations`
 *  can look a label up without a second, hand-kept copy of this map (fix
 *  round, N2). */
export const DURATION_LABEL: Record<DurationBucket, string> = {
  "<30": "<30′",
  "30-45": "30–45′",
  "45-60": "45–60′",
  "60+": "60′+",
};

/** `<30′ 30–45′ 45–60′ 60′+` — the Library's own TIME cell definitions
 *  (originally `FilterSheet.tsx`'s local `DURATION_CHIPS`), shared with
 *  Today's identical TIME group (Amendment, 2026-08-04 PR #50 round: "TIME
 *  unifies on the Library's bucket ranges" — Today's cap single-select
 *  dies in favour of these same four buckets). Same "two screens drifted
 *  before a shared module existed" precedent as `difficultyChips.ts`
 *  above it in this directory.
 *
 *  Fix round (N2): built by mapping OVER `domain/duration.ts`'s own
 *  `DURATION_BUCKETS` rather than as an independent literal array that
 *  merely happened to list the same four buckets in the same order — two
 *  hand-kept "canonical orders" (this array's own, and `DURATION_BUCKETS`)
 *  could drift the instant either one gained a bucket the other didn't.
 *  Deriving from `DURATION_BUCKETS` makes that structurally impossible:
 *  there is exactly one canonical order now, domain's. */
export const DURATION_CHIPS: { bucket: DurationBucket; label: string }[] =
  DURATION_BUCKETS.map((bucket) => ({ bucket, label: DURATION_LABEL[bucket] }));
