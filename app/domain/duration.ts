import type { WorkDuration } from "./types.js";

/** Phase SF PR2 (spec §3): TIME is a minutes RANGE, not four buckets. `min`
 *  and `max` are whole minutes; `min` from 0 and `max` to
 *  `DURATION_RANGE_MAX` (120), where 0 means "no lower bound" and 120 means
 *  "no upper bound" — `[0, 120]` is the no-filter (unbounded) state and the
 *  two-thumb control steps by `DURATION_STEP` (5). Stored on both screens'
 *  filter records; the server's `/api/today` derives its own from the
 *  account cap via `rangeForCap`. The old `DurationBucket` union
 *  (`<30/30-45/45-60/60+`) is retired — `rangeFromBuckets` maps a stored v1
 *  union to a range once, on load. */
export interface DurationRange {
  min: number;
  max: number;
}

export const DURATION_RANGE_MAX = 120;
export const DURATION_STEP = 5;
export const UNBOUNDED_RANGE: DurationRange = {
  min: 0,
  max: DURATION_RANGE_MAX,
};

/** True when the range admits everything (min at 0, max at the top). */
export function isUnbounded(range: DurationRange): boolean {
  return range.min <= 0 && range.max >= DURATION_RANGE_MAX;
}

/** Membership: `min ≤ minutes ≤ max`, with a `max` at the top meaning no
 *  upper bound at all (a 200-minute workout passes `[60, 120]`). Both ends
 *  are inclusive — read against the SAME integer the card prints
 *  (`estimateMinutes(...).minutes`), never a float, so the card and the
 *  filter can never disagree by rounding (spec §3.6). */
export function inRange(minutes: number, range: DurationRange): boolean {
  if (minutes < range.min) return false;
  if (range.max >= DURATION_RANGE_MAX) return true;
  return minutes <= range.max;
}

/** The account's `timeCapMinutes` (validated 10..300 by the server) as a
 *  default range: `[0, cap]` with the cap rounded DOWN to the step so
 *  nothing longer than the cap is admitted (47 → 45), and clamped at the
 *  top (≥ 120 → unbounded). Spec I-12. */
export function rangeForCap(cap: number): DurationRange {
  const snapped = Math.floor(cap / DURATION_STEP) * DURATION_STEP;
  return { min: 0, max: Math.max(0, Math.min(DURATION_RANGE_MAX, snapped)) };
}

/** Clamps and orders an arbitrary pair into a valid range: integers, within
 *  `[0, DURATION_RANGE_MAX]`, `min ≤ max` (a crossed pair collapses to a
 *  point at the lower of the two). Parsers use it after validating that
 *  both members are finite numbers. */
export function clampRange(range: DurationRange): DurationRange {
  const clamp = (n: number) =>
    Math.min(DURATION_RANGE_MAX, Math.max(0, Math.round(n)));
  const a = clamp(range.min);
  const b = clamp(range.max);
  return a <= b ? { min: a, max: b } : { min: b, max: b };
}

/** v1 → v2 mapping for a stored bucket union (spec §3.3, PM finding: a
 *  permanent memory is MAPPED, never discarded). A bucket IS a range, so
 *  the union becomes `[lowest lower bound, highest upper bound]` with
 *  `60+` reaching the top; unknown strings are ignored; an empty union (or
 *  nothing recognisable) returns null so the caller can use its default. */
export function rangeFromBuckets(
  buckets: readonly unknown[],
): DurationRange | null {
  const bounds: Record<string, [number, number]> = {
    "<30": [0, 30],
    "30-45": [30, 45],
    "45-60": [45, 60],
    "60+": [60, DURATION_RANGE_MAX],
  };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const b of buckets) {
    if (typeof b !== "string" || !(b in bounds)) continue;
    const [lo, hi] = bounds[b];
    if (lo < min) min = lo;
    if (hi > max) max = hi;
  }
  if (!Number.isFinite(min)) return null;
  return { min, max };
}

// Lenient by construction: the minutes and seconds groups may overflow
// (`1:70`), because the masked field can produce that transiently and
// normalising by total seconds is friendlier than rejecting a keystroke on a
// phone. The canonical forms `fmtDuration` emits are a strict subset of what
// this accepts.
const CLOCK_RE = /^(?:(\d+):)?(\d{1,3}):(\d{1,2})$/;

/** Minutes for a clock string, or null. `"1:70"` is 130 seconds, not an
 *  error — see CLOCK_RE. */
export function parseClock(text: string): number | null {
  const m = CLOCK_RE.exec(text.trim());
  if (!m) return null;
  const hours = m[1] === undefined ? 0 : Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  return hours * 60 + minutes + seconds / 60;
}

function splitParts(minutes: number): { h: number; m: number; s: number } {
  const total = Math.round(minutes * 60);
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

export function fmtDuration(minutes: number): string {
  const { h, m, s } = splitParts(minutes);
  const ss = String(s).padStart(2, "0");
  return h === 0 ? `${m}:${ss}` : `${h}:${String(m).padStart(2, "0")}:${ss}`;
}

/** The spoken form for an accessible name. A positional duration announces as
 *  "one oh five colon zero zero" otherwise — Primer's guidance on compact time
 *  formats makes the same point about assistive tech and translation. Every
 *  place that renders `fmtDuration` renders this as its accessible name. */
export function fmtDurationSpoken(minutes: number): string {
  const { h, m, s } = splitParts(minutes);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (s > 0) parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return parts.length === 0 ? "0 seconds" : parts.join(" ");
}

/** The one duration grammar: clock form (`0:45`, `1:05:00`), a bare decimal
 *  (minutes), `10'` (minutes), `2500m` (meters).
 *
 *  This used to exist twice — `domain/bulk.ts`'s `parseDuration` and
 *  `src/builder/builderState.ts`'s `parseDurationInput` were byte-identical
 *  regexes kept in lockstep BY HAND, with comments in both files admitting it.
 *  Both now import this. A bulk block reading `0:45 6k+2` and a row typed as
 *  `0:45` provably mean the same thing. */
export function parseDurationToken(token: string): WorkDuration | null {
  const trimmed = token.trim();

  const clock = parseClock(trimmed);
  if (clock !== null) return { kind: "time", minutes: clock };

  // Plain decimals only — no `Number()`-isms like hex ("0x10" -> 16),
  // scientific notation ("1e3" -> 1000) or a leading "+".
  const bare = /^(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (bare) return { kind: "time", minutes: Number(bare[1]) };

  const apostrophe = /^(\d+(?:\.\d+)?)'$/.exec(trimmed);
  if (apostrophe) return { kind: "time", minutes: Number(apostrophe[1]) };

  const distance = /^(\d+)m$/.exec(trimmed);
  if (distance) return { kind: "distance", meters: Number(distance[1]) };

  return null;
}
