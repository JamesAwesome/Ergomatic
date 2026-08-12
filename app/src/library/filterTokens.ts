import { RECENCY_BOUNDARY_DAYS, type Filters } from "./filters";
import { collapseDifficulties } from "../components/difficultyTokenLabel";
import { collapseDurations } from "../components/durationTokenLabel";
import type { WorkoutType } from "../../domain/types.js";

// One token per active GROUP, not per selected band — DESIGN.md's own rule
// ("the header count counts tokens, so the row and the count never
// disagree"). `kind` doubles as the rendering hook for colour (FilterSheet.tsx
// and Library.tsx both fill a "type" token with that type's own colour,
// tokens.css var; every other kind fills `--ink`) — a "type" token now
// carries that colour itself, via `fill` (see the `Token` doc comment
// below): with `types` plural, `label` can be a multi-code join
// ("O2 · AT"), so a renderer can no longer derive the colour by looking
// the label up in a WorkoutType-keyed map — that lookup is exactly the bug
// this round's Task 1 fixes (library-filter-unification spec, finding 1).
export type TokenKind =
  "type" | "difficulty" | "duration" | "pain" | "lastDone" | "source";

// The repo's canonical left-to-right type order (docs/design/README.md
// §Screens → "2. Library", amended 2026-08-08) — every multi-type label
// joins in THIS order, never selection order, so "AT · O2" and "O2 · AT"
// (built by toggling in different sequences) always read identically.
const TYPE_ORDER: readonly WorkoutType[] = ["O2", "AT", "TR", "AN"];

// CSS custom property per workout type — never a raw hex (tokens.css). Kept
// local per this repo's established per-file duplication convention
// (TypeBadge.tsx's own comment names the precedent, Library.tsx's and
// FilterSheet.tsx's own identical copies are the same pattern) rather than
// importing either of those files' maps.
const TYPE_COLOR_VAR: Record<WorkoutType, string> = {
  O2: "--type-o2",
  AT: "--type-at",
  AN: "--type-an",
  TR: "--type-tr",
};

export interface Token {
  kind: TokenKind;
  label: string;
  // The token's own colour var (e.g. "var(--type-o2)"), or undefined when
  // it has none — a renderer applies this directly and falls back to its
  // own default (`--ink`) when it's absent, rather than re-deriving a
  // colour from `label` (which, for a multi-type label, names no single
  // WorkoutType to look up). Only ever set on a single-type "type" token;
  // every other kind, including a multi-type one, leaves it undefined.
  fill?: string;
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

/** Filters -> the active tokens row, in the sheet's own group order (TYPE,
 *  DIFFICULTY, TIME, PAIN, LAST DONE, SOURCE). Each token's `clear` resets
 *  exactly its own group on whatever Filters it's given — not the group's
 *  value at the moment this token was built — so a token handed to a
 *  later, changed Filters still clears the right field. */
export function filterTokens(f: Filters): Token[] {
  const tokens: Token[] = [];

  if (f.types.length > 0) {
    const ordered = TYPE_ORDER.filter((t) => f.types.includes(t));
    tokens.push({
      kind: "type",
      label: ordered.join(" · "),
      // Only a single selected type has one colour to show; several types
      // fill with the row's own `--ink` default instead (no key at all —
      // see the `Token.fill` doc comment above), never a blended/first-
      // wins guess.
      ...(ordered.length === 1
        ? { fill: `var(${TYPE_COLOR_VAR[ordered[0]]})` }
        : {}),
      clear: (current) => ({ ...current, types: [] }),
    });
  }

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
