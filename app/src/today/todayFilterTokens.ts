import type { Difficulty } from "../../domain/types.js";
import type { DurationBucket } from "../../domain/duration.js";
import { RECENCY_BOUNDARY_DAYS } from "../../domain/recency.js";
import { DIFFICULTY_CHIPS } from "../components/difficultyChips";
import { collapseDurations } from "../components/durationTokenLabel";
import type { Token } from "../components/TokenRow";
import type { TodayOverrides } from "./todayOverrides";

/**
 * The day's "no filter" baseline for deviation purposes — per the
 * collapsible-filter spec's own "Active" rule
 * (docs/superpowers/specs/2026-08-04-today-filter-sheet-design.md):
 * `difficulties` is always the full EASY/MEDIUM/HARD set, not necessarily
 * the account's own server preference (which can itself be a narrower
 * subset — Today.tsx's INITIAL overrides record seeds from
 * `preferences.difficulties` for that separate concern: what a fresh
 * day's record starts as, not what counts as "unfiltered" here).
 * `durations` is the account's cap preference expanded to the buckets it
 * implies (`bucketsForCap`, todayOverrides.ts) — Amendment (2026-08-04
 * PR #50 round) replaces the old single-cap `capMinutes` default with this
 * bucket SET.
 */
export interface TodayFilterDefaults {
  difficulties: Difficulty[];
  durations: DurationBucket[];
}

// Empty durations is reachable two ways that must render two DIFFERENT
// token labels despite behaving identically in suggest() (both = no
// filtering, domain/suggest.ts's own predicate): explicitly selecting every
// bucket reads as its own contiguous-range label
// (`collapseDurations` below, e.g. "<30′–60′+"), but a genuinely EMPTY
// selection has no bucket to name at all — this is that label. Only
// rendered when empty deviates from a non-empty default (a narrower-than-
// all-four default, e.g. a 60-min account preference), since an all-four
// default matching an all-four override is no deviation and renders no
// token either way.
const NO_TIME_FILTER_LABEL = "ANY TIME";

/** Set equality, order-independent — todayOverrides.ts's own parser
 *  de-dupes/canonically-orders `durations` on load and the sheet's own
 *  toggle logic never introduces a duplicate, so a plain length +
 *  membership check is enough (no defensive de-dupe needed here). */
function sameDurationSet(a: DurationBucket[], b: DurationBucket[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v) => b.includes(v));
}

/** Set equality, order-independent — todayOverrides.ts's own parser
 *  de-dupes `difficulties` on load and the sheet's own toggle logic never
 *  introduces a duplicate, so a plain length + membership check is enough
 *  (no defensive de-dupe needed here). A stored/committed record whose
 *  difficulties happen to be in a different order than `defaults` (e.g.
 *  `["hard","easy","medium"]`) must still read as "no deviation". */
function sameDifficultySet(a: Difficulty[], b: Difficulty[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v) => b.includes(v));
}

/** Ordered-range collapse over EASY/MEDIUM/HARD — the same contiguous-run
 *  idiom Library's filterTokens.ts uses for durations/pain (collapsePain
 *  below is that same file's rule, copied verbatim): a contiguous run
 *  collapses to its endpoints ("EASY–MEDIUM"), a non-contiguous selection
 *  lists every member ("EASY, HARD"). Order-independent — DIFFICULTY_CHIPS'
 *  own fixed index is what "contiguous" means, not insertion order.
 *  Empty is reachable (deselecting every difficulty in the sheet's
 *  DIFFICULTY group is allowed by design — TodayFilterSheet.tsx's CellGrid
 *  has no "at least one must stay active" guard, same as the pre-sheet
 *  chips it replaced) and reads "NONE" rather than an empty string, since
 *  an empty token label would render as an invisible, un-clearable-looking
 *  token. */
function collapseDifficulties(values: Difficulty[]): string {
  if (values.length === 0) return "NONE";
  const indices = values
    .map((d) => DIFFICULTY_CHIPS.findIndex((c) => c.value === d))
    .sort((a, b) => a - b);
  const contiguous = indices.every(
    (idx, i) => i === 0 || idx === indices[i - 1] + 1,
  );
  if (!contiguous) {
    return indices.map((i) => DIFFICULTY_CHIPS[i].label).join(", ");
  }
  const first = indices[0];
  const last = indices[indices.length - 1];
  return first === last
    ? DIFFICULTY_CHIPS[first].label
    : `${DIFFICULTY_CHIPS[first].label}–${DIFFICULTY_CHIPS[last].label}`;
}

/** Library's filterTokens.ts's own pain collapse, copied verbatim — this
 *  repo's established per-file duplication convention for small display
 *  maps (unlike TIME's own collapse above, PAIN's shape never drifted
 *  between the two screens the way TIME's cap-vs-bucket-union split did,
 *  so there's no equivalent pressure to genuinely share this one). */
function collapsePain(levels: number[]): string {
  const sorted = [...levels].sort((a, b) => a - b);
  const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  if (!contiguous) return `PAIN ${sorted.join(", ")}`;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return min === max ? `PAIN ${min}` : `PAIN ${min}–${max}`;
}

/**
 * Today's overrides -> the active tokens row, in the sheet's own group
 * order (DIFFICULTY, TIME, PAIN, LAST DONE, SOURCE) — one token per group
 * that DEVIATES from `defaults`, never one per selected value (mirrors
 * Library's filterTokens.ts "the header count counts tokens" rule).
 * `onReset` fires with which group to reset; this module has no
 * storage/save knowledge of its own — Today.tsx owns turning a reset into a
 * saved record, exactly like Library.tsx owns turning filterTokens.ts's own
 * `clear` into a committed `Filters` write.
 *
 * LAST DONE/SOURCE (Round 2, 2026-08-04) don't need a `defaults` comparison
 * the way DIFFICULTY/TIME do — both default to `null` unconditionally (the
 * spec's own "no token until set" rule), so "deviates" is simply "is not
 * null", identical to PAIN's own `length > 0` check just below.
 */
export function todayFilterTokens(
  overrides: Pick<
    TodayOverrides,
    "difficulties" | "durations" | "painLevels" | "lastDone" | "source"
  >,
  defaults: TodayFilterDefaults,
  onReset: (
    group: "difficulties" | "durations" | "pain" | "lastDone" | "source",
  ) => void,
): Token[] {
  const tokens: Token[] = [];

  if (!sameDifficultySet(overrides.difficulties, defaults.difficulties)) {
    tokens.push({
      key: "difficulties",
      label: collapseDifficulties(overrides.difficulties),
      onClear: () => onReset("difficulties"),
    });
  }

  if (!sameDurationSet(overrides.durations, defaults.durations)) {
    tokens.push({
      key: "durations",
      label:
        overrides.durations.length === 0
          ? NO_TIME_FILTER_LABEL
          : collapseDurations(overrides.durations),
      onClear: () => onReset("durations"),
    });
  }

  if (overrides.painLevels.length > 0) {
    tokens.push({
      key: "pain",
      label: collapsePain(overrides.painLevels),
      onClear: () => onReset("pain"),
    });
  }

  if (overrides.lastDone !== null) {
    tokens.push({
      key: "lastDone",
      label:
        overrides.lastDone === "under21"
          ? `<${RECENCY_BOUNDARY_DAYS}D`
          : `${RECENCY_BOUNDARY_DAYS}D+`,
      onClear: () => onReset("lastDone"),
    });
  }

  if (overrides.source !== null) {
    tokens.push({
      key: "source",
      label: overrides.source === "custom" ? "CUSTOM" : "GLOBAL",
      onClear: () => onReset("source"),
    });
  }

  return tokens;
}
