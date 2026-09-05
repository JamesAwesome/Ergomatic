import type { DurationRange } from "../../domain/duration.js";
import { RECENCY_BOUNDARY_DAYS } from "../../domain/recency.js";
import { formatRangeLabel } from "../components/durationRangeLabel";
import type { Token } from "../components/TokenRow";
import type { FilterSet } from "./todayFilters";

/**
 * The day's "no filter" baseline for deviation purposes — per the
 * collapsible-filter spec's own "Active" rule
 * (docs/superpowers/specs/2026-08-04-today-filter-sheet-design.md):
 * `durationRange` is the account's cap preference as a range
 * (`rangeForCap`, domain/duration.ts: `[0, cap]`, cap rounded down to the
 * step) — Phase SF PR2 replaces the 2026-08-04 Amendment's bucket SET.
 */
export interface TodayFilterDefaults {
  // Phase SF PR2: `rangeForCap(timeCapMinutes)`, the key's TIME default.
  durationRange: DurationRange;
}

/** Range equality — both ends, nothing else to compare. */
function sameRange(a: DurationRange, b: DurationRange): boolean {
  return a.min === b.min && a.max === b.max;
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
 * order (TIME, PAIN, LAST DONE, SOURCE) — one token per group
 * that DEVIATES from `defaults`, never one per selected value (mirrors
 * Library's filterTokens.ts "the header count counts tokens" rule).
 * `onReset` fires with which group to reset; this module has no
 * storage/save knowledge of its own — Today.tsx owns turning a reset into a
 * saved record, exactly like Library.tsx owns turning filterTokens.ts's own
 * `clear` into a committed `Filters` write.
 *
 * LAST DONE/SOURCE (Round 2, 2026-08-04) don't need a `defaults` comparison
 * the way TIME does — both default to `null` unconditionally (the
 * spec's own "no token until set" rule), so "deviates" is simply "is not
 * null", identical to PAIN's own `length > 0` check just below.
 */
export function todayFilterTokens(
  overrides: FilterSet,
  defaults: TodayFilterDefaults,
  onReset: (group: "durations" | "pain" | "lastDone" | "source") => void,
): Token[] {
  const tokens: Token[] = [];

  // Spec I-13, stated per cell: a token whenever the range differs from
  // the KEY'S DEFAULT and never otherwise — at default no token; the
  // unbounded `[0, 120]` when the default is narrower reads ANY LENGTH (a
  // real deviation with its own ✕, which restores the default).
  if (!sameRange(overrides.durationRange, defaults.durationRange)) {
    tokens.push({
      key: "durations",
      label: formatRangeLabel(overrides.durationRange),
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
      label:
        overrides.source === "custom" ? "MY WORKOUTS" : "ERGOMATIC LIBRARY",
      onClear: () => onReset("source"),
    });
  }

  return tokens;
}
