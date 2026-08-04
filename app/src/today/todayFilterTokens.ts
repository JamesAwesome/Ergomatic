import type { Difficulty } from "../../domain/types.js";
import { DIFFICULTY_CHIPS } from "../components/difficultyChips";
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
 * `capMinutes` is the account's cap preference snapped to the nearest chip
 * (`snapCap`, todayOverrides.ts).
 */
export interface TodayFilterDefaults {
  difficulties: Difficulty[];
  capMinutes: number | null;
}

// "≤NN′" — Today's own cap labels. TodayFilterSheet.tsx keeps an identical
// copy for the sheet's TIME cells rather than importing this one: this
// repo's established per-file duplication convention for small display
// maps (TYPE_COLOR_VAR's own comment, Today.tsx/FilterSheet.tsx, names the
// precedent).
const CAP_LABEL: Record<number, string> = {
  30: "≤30′",
  45: "≤45′",
  60: "≤60′",
  90: "≤90′",
};

function capLabel(minutes: number | null): string {
  return minutes === null ? "NO CAP" : CAP_LABEL[minutes];
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

/** Library's filterTokens.ts's own pain collapse, copied verbatim — same
 *  per-file duplication convention as CAP_LABEL above, not a shared
 *  import. */
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
 * order (DIFFICULTY, TIME, PAIN) — one token per group that DEVIATES from
 * `defaults`, never one per selected value (mirrors Library's
 * filterTokens.ts "the header count counts tokens" rule). `onReset` fires
 * with which group to reset; this module has no storage/save knowledge of
 * its own — Today.tsx owns turning a reset into a saved record, exactly
 * like Library.tsx owns turning filterTokens.ts's own `clear` into a
 * committed `Filters` write.
 */
export function todayFilterTokens(
  overrides: Pick<TodayOverrides, "difficulties" | "capMinutes" | "painLevels">,
  defaults: TodayFilterDefaults,
  onReset: (group: "difficulties" | "cap" | "pain") => void,
): Token[] {
  const tokens: Token[] = [];

  if (!sameDifficultySet(overrides.difficulties, defaults.difficulties)) {
    tokens.push({
      key: "difficulties",
      label: collapseDifficulties(overrides.difficulties),
      onClear: () => onReset("difficulties"),
    });
  }

  if (overrides.capMinutes !== defaults.capMinutes) {
    tokens.push({
      key: "cap",
      label: capLabel(overrides.capMinutes),
      onClear: () => onReset("cap"),
    });
  }

  if (overrides.painLevels.length > 0) {
    tokens.push({
      key: "pain",
      label: collapsePain(overrides.painLevels),
      onClear: () => onReset("pain"),
    });
  }

  return tokens;
}
