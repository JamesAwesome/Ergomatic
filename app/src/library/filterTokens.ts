import { RECENCY_BOUNDARY_DAYS, type Filters } from "./filters";
import { collapseDifficulties } from "../components/difficultyTokenLabel";
import { collapseDurations } from "../components/durationTokenLabel";

// One token per active GROUP, not per selected band — DESIGN.md's own rule
// ("the header count counts tokens"). NOTE the count itself no longer keys
// off this row: see filters.ts's `hasActiveFilters`, because TYPE narrows
// the list while contributing no token.
//
// TYPE is deliberately NOT among the kinds (James, 2026-08-12: "the type
// shouldn't be added as a tag since it's already visible"). Its control is
// the chip row above this row, which shows the selection in the type's own
// colour with the descriptor word beneath it, and clears by being tapped
// again — a token would restate what the rower can already see. This also
// retired the whole colour seam: the type token was the only token that
// ever carried a `fill`, so `Token.fill` and `TokenRow`'s `fill` prop went
// with it rather than lingering unused.
export type TokenKind =
  "difficulty" | "duration" | "pain" | "lastDone" | "source";

export interface Token {
  kind: TokenKind;
  label: string;
  clear(f: Filters): Filters;
}

function collapsePain(levels: number[]): string {
  const sorted = [...levels].sort((a, b) => a - b);
  const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  if (!contiguous) return `PAIN ${sorted.join(", ")}`;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return min === max ? `PAIN ${min}` : `PAIN ${min}–${max}`;
}

/** Filters -> the active tokens row, in TYPE, DIFFICULTY, TIME, PAIN, LAST
 *  DONE, SOURCE order. This is NOT "the sheet's own group order" — after
 *  Task 1, the sheet holds neither TYPE nor DIFFICULTY (TYPE is the chip
 *  row above it; DIFFICULTY is Task 2's own addition to the sheet). The
 *  actual rule (library-filter-unification spec, "Token row order"): the
 *  row reads top-to-bottom in the order the CONTROLS appear on screen —
 *  the chip row first, then each of the sheet's own groups in the order
 *  they're rendered there. A future reorder of the sheet's groups reorders
 *  this array to match; it does not fall out of the sheet's order
 *  automatically. Each token's `clear` resets exactly its own group on
 *  whatever Filters it's given — not the group's value at the moment this
 *  token was built — so a token handed to a later, changed Filters still
 *  clears the right field. */
export function filterTokens(f: Filters): Token[] {
  const tokens: Token[] = [];

  if (f.difficulties.length > 0) {
    tokens.push({
      kind: "difficulty",
      label: collapseDifficulties(f.difficulties),
      clear: (current) => ({ ...current, difficulties: [] }),
    });
  }

  if (f.durations.length > 0) {
    tokens.push({
      kind: "duration",
      label: collapseDurations(f.durations),
      clear: (current) => ({ ...current, durations: [] }),
    });
  }

  if (f.painLevels.length > 0) {
    tokens.push({
      kind: "pain",
      label: collapsePain(f.painLevels),
      clear: (current) => ({ ...current, painLevels: [] }),
    });
  }

  if (f.lastDone !== null) {
    tokens.push({
      kind: "lastDone",
      label:
        f.lastDone === "under21"
          ? `<${RECENCY_BOUNDARY_DAYS}D`
          : `${RECENCY_BOUNDARY_DAYS}D+`,
      clear: (current) => ({ ...current, lastDone: null }),
    });
  }

  if (f.source !== null) {
    tokens.push({
      kind: "source",
      label: f.source === "custom" ? "CUSTOM" : "GLOBAL",
      clear: (current) => ({ ...current, source: null }),
    });
  }

  return tokens;
}
