/**
 * Phase PS (spec §3.3): calendar arithmetic on `{ y, m, d }` triples. No
 * `Date`, no clock, no zone, no string parsing (invariant 14): the ONE
 * instant→date conversion lives in the client adapter (`useStatsRows`).
 */
export interface CalendarDate {
  y: number;
  m: number; // 1..12
  d: number; // 1..31
}

/** Days since 1970-01-01 (Howard Hinnant's `days_from_civil`, public
 *  domain). Pure integer arithmetic; valid for every Gregorian date. */
export function toDayNumber({ y, m, d }: CalendarDate): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The inverse of `toDayNumber` (`civil_from_days`). */
export function fromDayNumber(days: number): CalendarDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

export function addDays(date: CalendarDate, n: number): CalendarDate {
  return fromDayNumber(toDayNumber(date) + n);
}

/** Negative when a < b, 0 when equal, positive when a > b. */
export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** `null` at either end means unbounded; both ends inclusive (invariant 5). */
export interface DateRange {
  from: CalendarDate | null;
  to: CalendarDate | null;
}

export function inRange(date: CalendarDate, range: DateRange): boolean {
  return (
    (range.from === null || compareDates(date, range.from) >= 0) &&
    (range.to === null || compareDates(date, range.to) <= 0)
  );
}

export interface Season {
  start: CalendarDate;
  end: CalendarDate;
  /** The logbook names a season by its END year (spec §1, PRIMARY). */
  name: number;
}

/** May 1 – Apr 30 (spec §3.3): `2026-04-30 → 2026`, `2026-05-01 → 2027`. */
export function seasonOf(date: CalendarDate): Season {
  const startYear = date.m >= 5 ? date.y : date.y - 1;
  return {
    start: { y: startYear, m: 5, d: 1 },
    end: { y: startYear + 1, m: 4, d: 30 },
    name: startYear + 1,
  };
}

export const PRESETS = [
  "all",
  "season",
  "year",
  "month",
  "30d",
  "custom",
] as const;
export type Preset = (typeof PRESETS)[number];

/** The five non-custom presets' ranges for `today` (spec §3.3); CUSTOM is
 *  the caller's own pair, validated by `customRange`. */
export function presetRange(
  preset: Exclude<Preset, "custom">,
  today: CalendarDate,
): DateRange {
  switch (preset) {
    case "all":
      return { from: null, to: null };
    case "season":
      return { from: seasonOf(today).start, to: today };
    case "year":
      return { from: { y: today.y, m: 1, d: 1 }, to: today };
    case "month":
      return { from: { y: today.y, m: today.m, d: 1 }, to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
  }
}

/** `null` when FROM follows TO — the surface keeps its previous range and
 *  reads `FROM MUST NOT FOLLOW TO` (spec §5). */
export function customRange(
  from: CalendarDate,
  to: CalendarDate,
): DateRange | null {
  return compareDates(from, to) > 0 ? null : { from, to };
}
