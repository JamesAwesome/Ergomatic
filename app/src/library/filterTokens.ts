import type { DurationBucket, Filters } from "./filters";

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

// Bucket order defines what "contiguous" means for the collapse rule below —
// duplicated from FilterSheet.tsx's own cell order rather than shared, this
// repo's established per-file-duplication convention for small display maps
// (TypeBadge.tsx's own TYPE_COLOR_VAR comment names the precedent).
const DURATION_ORDER: readonly DurationBucket[] = [
  "<30",
  "30-45",
  "45-60",
  "60+",
];

const DURATION_LABEL: Record<DurationBucket, string> = {
  "<30": "<30′",
  "30-45": "30–45′",
  "45-60": "45–60′",
  "60+": "60′+",
};

// A bucket's own minute boundaries, indexed the same as DURATION_ORDER — used
// only to compose a MERGED range label for a contiguous run longer than one
// bucket (a single selected bucket just reuses its own DURATION_LABEL
// verbatim, which already reads identically to what this would produce).
const LOWER_BOUND: readonly (string | null)[] = [null, "30", "45", "60"];
const UPPER_BOUND: readonly (string | null)[] = ["30", "45", "60", null];

function collapseDurations(durations: DurationBucket[]): string {
  const indices = durations
    .map((d) => DURATION_ORDER.indexOf(d))
    .sort((a, b) => a - b);
  const contiguous = indices.every(
    (idx, i) => i === 0 || idx === indices[i - 1] + 1,
  );
  if (!contiguous) {
    return indices.map((i) => DURATION_LABEL[DURATION_ORDER[i]]).join(", ");
  }
  const first = indices[0];
  const last = indices[indices.length - 1];
  if (first === last) return DURATION_LABEL[DURATION_ORDER[first]];
  const includesUnder = first === 0;
  const includesPlus = last === DURATION_ORDER.length - 1;
  // Both ends selected as part of one contiguous run means every bucket is
  // in — a real (if functionally inert) active filter state, not an error.
  if (includesUnder && includesPlus) return "<30′–60′+";
  if (includesUnder) return `<${UPPER_BOUND[last]}′`;
  if (includesPlus) return `${LOWER_BOUND[first]}′+`;
  return `${LOWER_BOUND[first]}–${UPPER_BOUND[last]}′`;
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
      label: f.lastDone === "under21" ? "<21D" : "21D+",
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
