import {
  isWorkoutType,
  type Difficulty,
  type WorkoutType,
} from "../../domain/types.js";
import {
  UNBOUNDED_RANGE,
  clampRange,
  rangeFromBuckets,
  type DurationRange,
} from "../../domain/duration.js";

/** localStorage key for Today's per-type filter memory (Phase SF PR1, spec
 *  §2.3 / I-6). UNDATED, unlike `todayPick`/`todayOverrides`: this is the
 *  "set and forget" store — a rower's DIFFICULTY/TIME/PAIN/LAST DONE/
 *  SOURCE choices survive reloads, days and plan changes, remembered
 *  separately for each type the chip row can light (and for ANY TYPE). */
export const TODAY_FILTERS_KEY = "ergomatic.todayFilters";

/** The memory's key: the EFFECTIVE type in both modes — with a plan,
 *  `swapType ?? prescribedCode`; in freestyle, the lit chip — or `"ANY"`
 *  when freestyle has no chip lit. */
export type TodayFilterKey = WorkoutType | "ANY";

export const TODAY_FILTER_KEYS: readonly TodayFilterKey[] = [
  "O2",
  "AT",
  "TR",
  "AN",
  "ANY",
];

export function filterKeyFor(
  effectiveType: WorkoutType | null,
): TodayFilterKey {
  return effectiveType ?? "ANY";
}

/** The five filter groups Today's sheet edits — the fields that lived on
 *  `TodayOverrides` until PR1 moved them here. Semantics unchanged: an
 *  empty `durations`/`painLevels` array means that group is off; `null`
 *  means off for the two pairs. Every field always holds a real value. */
export interface FilterSet {
  difficulties: Difficulty[];
  // Phase SF PR2 (spec §3): a minutes range; `[0, 120]` means TIME is off.
  durationRange: DurationRange;
  painLevels: number[];
  lastDone: "under21" | "over21" | null;
  source: "global" | "custom" | null;
}

/** The whole store. `byKey` holds one FilterSet per key that has ever
 *  been written; a key never written reads as the caller's defaults.
 *  (Revision 1 of the spec carried a `rollSuppressed` "sticky clear" here;
 *  James struck it at PR1's Gate 0 — "I don't like the sticky clear, can
 *  it default to on?" — so a clear holds for the rest of the day only and
 *  every new day rolls. That state lives on the DATED day record, where a
 *  day-scoped fact belongs.) */
export interface TodayFilters {
  /** v2 (Phase SF PR2): `durationRange` replaces the v1 bucket union. A v1
   *  store is MAPPED on load, never discarded — this is permanent memory
   *  (spec §3.3, the PM's finding). */
  v: 2;
  byKey: Partial<Record<TodayFilterKey, FilterSet>>;
}

export const EMPTY_TODAY_FILTERS: TodayFilters = {
  v: 2,
  byKey: {},
};

const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
const PAIN_LEVELS: readonly number[] = [1, 2, 3, 4, 5];

function isDifficulty(v: unknown): v is Difficulty {
  return (
    typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v)
  );
}

function isPainLevel(v: unknown): v is number {
  return typeof v === "number" && PAIN_LEVELS.includes(v);
}

function isLastDone(v: unknown): v is "under21" | "over21" {
  return v === "under21" || v === "over21";
}

function isSource(v: unknown): v is "global" | "custom" {
  return v === "global" || v === "custom";
}

function isFilterKey(v: unknown): v is TodayFilterKey {
  return v === "ANY" || isWorkoutType(v);
}

/** Strict per-set check, the discipline `todayOverrides.ts`'s parser kept
 *  for these five fields: a present-but-wrong-shaped value fails the SET.
 *  Returns null for a bad set so the caller can drop that key alone —
 *  one corrupt key must not discard the other four (the store is
 *  permanent memory, not a per-day convenience). De-dupes and canonically
 *  orders `durations`/`painLevels`, same as before. */
function isRangeShape(v: unknown): v is DurationRange {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.min === "number" &&
    Number.isFinite(r.min) &&
    typeof r.max === "number" &&
    Number.isFinite(r.max)
  );
}

function parseFilterSet(value: unknown, version: 1 | 2): FilterSet | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.difficulties) || !o.difficulties.every(isDifficulty)) {
    return null;
  }
  // TIME: v2 carries `durationRange` (required, clamped); v1 carried a
  // bucket union, mapped to the range it spans — an empty v1 union meant
  // "TIME off", which is the unbounded range.
  let durationRange: DurationRange;
  if (version === 1) {
    if (!Array.isArray(o.durations)) return null;
    durationRange = rangeFromBuckets(o.durations) ?? UNBOUNDED_RANGE;
  } else {
    if (!isRangeShape(o.durationRange)) return null;
    durationRange = clampRange(o.durationRange);
  }
  if (!Array.isArray(o.painLevels) || !o.painLevels.every(isPainLevel)) {
    return null;
  }
  if (o.lastDone !== null && !isLastDone(o.lastDone)) return null;
  if (o.source !== null && !isSource(o.source)) return null;
  return {
    difficulties: [...new Set(o.difficulties)],
    durationRange,
    painLevels: [...new Set(o.painLevels)].sort((a, b) => a - b),
    lastDone: o.lastDone,
    source: o.source,
  };
}

function parseTodayFilters(raw: string): TodayFilters {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_TODAY_FILTERS;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return EMPTY_TODAY_FILTERS;
  }
  const o = parsed as Record<string, unknown>;
  if (o.v !== 1 && o.v !== 2) return EMPTY_TODAY_FILTERS;
  const version = o.v;
  const byKey: Partial<Record<TodayFilterKey, FilterSet>> = {};
  if (typeof o.byKey === "object" && o.byKey !== null) {
    for (const [k, v] of Object.entries(o.byKey as Record<string, unknown>)) {
      if (!isFilterKey(k)) continue;
      const set = parseFilterSet(v, version);
      if (set !== null) byKey[k] = set;
    }
  }
  return { v: 2, byKey };
}

/** Never null: a missing, denied, garbage, or unknown-version store reads
 *  as the empty store (every key at defaults); a v1 store is mapped to v2. Storage
 *  denial (2026-09-03 research): the getter itself can throw; that is the
 *  same "nothing remembered" outcome, never a crash. */
export function loadTodayFilters(): TodayFilters {
  try {
    const raw = localStorage.getItem(TODAY_FILTERS_KEY);
    if (raw === null) return EMPTY_TODAY_FILTERS;
    return parseTodayFilters(raw);
  } catch {
    return EMPTY_TODAY_FILTERS;
  }
}

/** Returns whether the write landed — the caller keeps the in-memory copy
 *  either way, so a denied write costs persistence, never the current
 *  screen (RF25: the boolean is read by `Today.tsx`'s owner). */
export function saveTodayFilters(store: TodayFilters): boolean {
  try {
    localStorage.setItem(TODAY_FILTERS_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** The set for `key`, or `defaults` when the key has never been written. */
export function filterSetFor(
  store: TodayFilters,
  key: TodayFilterKey,
  defaults: FilterSet,
): FilterSet {
  return store.byKey[key] ?? defaults;
}

/** A new store with `key`'s set replaced (never mutates the input). */
export function withFilterSet(
  store: TodayFilters,
  key: TodayFilterKey,
  set: FilterSet,
): TodayFilters {
  return { ...store, byKey: { ...store.byKey, [key]: set } };
}
