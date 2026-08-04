import { RECENCY_BOUNDARY_DAYS, type Filters } from "./filters";
import { collapseDurations } from "../components/durationTokenLabel";

// One token per active GROUP, not per selected band — DESIGN.md's own rule
// ("the header count counts tokens, so the row and the count never
// disagree"). `kind` doubles as the rendering hook for colour (FilterSheet.tsx
// and Library.tsx both fill a "type" token with that type's own colour,
// tokens.css var; every other kind fills `--ink`) — for a "type" token,
// `label` IS the WorkoutType code itself (`AN`/`O2`/`AT`/`TR`), so a renderer
// never needs a second field to look the colour up.
export type TokenKind = "type" | "duration" | "pain" | "lastDone" | "source";

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

/** Filters -> the active tokens row, in the sheet's own group order (TYPE,
 *  TIME, PAIN, LAST DONE, SOURCE). Each token's `clear` resets exactly its
 *  own group on whatever Filters it's given — not the group's value at the
 *  moment this token was built — so a token handed to a later, changed
 *  Filters still clears the right field. */
export function filterTokens(f: Filters): Token[] {
  const tokens: Token[] = [];

  if (f.type !== null) {
    tokens.push({
      kind: "type",
      label: f.type,
      clear: (current) => ({ ...current, type: null }),
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
