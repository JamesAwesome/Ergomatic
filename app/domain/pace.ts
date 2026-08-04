import type {
  Baselines,
  PaceRef,
  Effort,
  EffortRef,
  SplitRef,
} from "./types.js";

const EFFORT_RE = /^(max|min)$/i;
const REF_RE = /^(2k|6k)\s*([+-]\s*\d+(\.\d+)?)?$/i;

export function isEffortRef(ref: PaceRef): ref is EffortRef {
  return "effort" in ref;
}

export function parsePaceRef(input: string): PaceRef | null {
  const trimmed = input.trim();
  const effort = EFFORT_RE.exec(trimmed);
  if (effort) return { effort: effort[1].toLowerCase() as Effort };
  const m = REF_RE.exec(trimmed);
  if (!m) return null;
  const base = m[1].toLowerCase() as SplitRef["base"];
  const off = m[2] ? Number(m[2].replace(/\s+/g, "")) : 0;
  return Number.isFinite(off) ? { base, off } : null;
}

export function resolveSplit(
  baselines: Baselines,
  ref: PaceRef,
  nudge = 0,
): number {
  if (!isEffortRef(ref)) {
    const base = ref.base === "2k" ? baselines.k2Seconds : baselines.k6Seconds;
    return base + ref.off + nudge;
  }
  throw new Error("resolveSplit requires a split ref");
}

export function effortWord(effort: Effort): "ALL OUT" | "EASY" {
  return effort === "max" ? "ALL OUT" : "EASY";
}

// Inverse of effortWord. Exists so a caller holding only a frozen "ALL
// OUT"/"EASY" display word (not the original PaceRef/Effort it came from)
// can still reach `refLabel`'s chip idiom ("MAX"/"MIN") — the session log
// builder (`src/session/logDraft.ts`'s `buildLogSteps`) only ever sees an
// `EnginePhase`'s frozen `label`, which for an effort phase already IS
// `effortWord`'s own output, but needs the SAME step-text chip the manual
// log door produces from a real ref for the same workout (Phase 6C Task 1
// F1 review: the two doors disagreed — "0:30 @ ALL OUT" vs "0:30 @ MAX" for
// Microburst's identical effort step). Bijective by construction (effortWord
// is a total function over the two-element Effort type), so this never
// needs a null/error case. Kept beside `effortWord` rather than duplicated
// as a private map at that call site, so the ALL OUT/EASY <-> MAX/MIN
// vocabulary — the 5G rule's own domain — lives in exactly one file.
export function effortFromWord(word: "ALL OUT" | "EASY"): Effort {
  return word === "ALL OUT" ? "max" : "min";
}

// The spoken form for an effort step's composed accessible name. The chip
// word (`refLabel`'s "MAX"/"MIN") is a visual token that reads as ambiguous
// jargon aloud — "MIN" is indistinguishable from "minutes", the exact
// confusion the display-word pair exists to prevent — so callers building a
// spoken name substitute this instead. Includes its own leading "at" for
// "max" (a noun phrase, "at max effort") but not for "min" (a plain adverb,
// "30 seconds easy" — rowing's own idiom, not "at easy" or "at easy
// effort"), so a caller can compose `${duration} ${effortSpoken(effort)}`
// uniformly without an effort-specific grammar branch of its own.
export function effortSpoken(effort: Effort): "at max effort" | "easy" {
  return effort === "max" ? "at max effort" : "easy";
}

export function estimationSplit(baselines: Baselines, ref: PaceRef): number {
  if (!isEffortRef(ref)) return resolveSplit(baselines, ref);
  return ref.effort === "max" ? baselines.k2Seconds : baselines.k6Seconds + 20;
}

export function refLabel(ref: PaceRef): string {
  if (isEffortRef(ref)) return ref.effort === "max" ? "MAX" : "MIN";
  if (ref.off === 0) return ref.base;
  const sign = ref.off < 0 ? "−" : "+";
  return `${ref.base} ${sign}${Math.abs(ref.off)}`;
}
