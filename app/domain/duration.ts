import type { WorkDuration } from "./types.js";

/** The house time format is elastic positional: seconds are always present,
 *  the hour group appears only when nonzero, and the leading group is never
 *  zero-padded — `0:45`, `20:00`, `1:05:00`, `3:00:00`. Because the rightmost
 *  pair is ALWAYS seconds, a bare `1:30` can only mean 90 seconds anywhere in
 *  the app.
 *
 *  Researched, not chosen: ECMA-402's Intl.DurationFormat defines a `digital`
 *  style and documents it as the right one for durations under a day; Android's
 *  DateUtils.formatElapsedTime documents `MM:SS` or `H:MM:SS`, adding the hour
 *  group only when there is one; Apple's Music/Fitness convention drops the
 *  leading zero, and this app is iOS-first. Totals deliberately do NOT use this
 *  format — they keep unit labels ("302 MIN"), which is what keeps a colon
 *  value's meaning unambiguous. See the Phase 5F spec. */

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
