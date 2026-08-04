import type { DurationBucket } from "../../domain/duration.js";

/** `<30′ 30–45′ 45–60′ 60′+` — the Library's own TIME cell definitions
 *  (originally `FilterSheet.tsx`'s local `DURATION_CHIPS`), shared with
 *  Today's identical TIME group (Amendment, 2026-08-04 PR #50 round: "TIME
 *  unifies on the Library's bucket ranges" — Today's cap single-select
 *  dies in favour of these same four buckets). Same "two screens drifted
 *  before a shared module existed" precedent as `difficultyChips.ts`
 *  above it in this directory. */
export const DURATION_CHIPS: { bucket: DurationBucket; label: string }[] = [
  { bucket: "<30", label: "<30′" },
  { bucket: "30-45", label: "30–45′" },
  { bucket: "45-60", label: "45–60′" },
  { bucket: "60+", label: "60′+" },
];
