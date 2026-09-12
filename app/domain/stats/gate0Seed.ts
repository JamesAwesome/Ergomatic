/**
 * The Gate 0 seed (`docs/design/career-stats/seed.mjs`, spec §8.5 /
 * invariant 18) transcribed to the domain's row shape. `gate0Seed.test.ts`
 * holds this transcription equal to `seed.mjs` row for row, so a figure
 * asserted against it is a figure `compute.mjs` printed. `loggedAt` is
 * noon UTC of the seed date — an instant no reader here parses.
 */
import { parseDate, type CalendarDate } from "./calendar.js";
import type { DatedStatsRow } from "./statsRow.js";

export const GATE0_TODAY: CalendarDate = { y: 2026, m: 9, d: 12 };

type SeedRow = [
  id: string,
  date: string,
  source: DatedStatsRow["source"],
  tier: DatedStatsRow["tier"],
  type: DatedStatsRow["workoutType"],
  workMeters: number,
  workSeconds: number,
  restMeters: number | null,
  calories: number | null,
];

// prettier-ignore
const SEED: SeedRow[] = [
  ["R1",  "2025-11-08", "pm5",    "stored",    "O2", 6240,  1592.0, null, null],
  ["R2",  "2026-01-17", "manual", "steps",     "TR", 2000,  470.2,  null, null],
  ["R3",  "2026-03-02", "pm5",    "machine",   "AT", 4000,  1000.8, 96,   258],
  ["R4",  "2026-04-25", "pm5",    "machine",   "AN", 1500,  330.6,  240,  92],
  ["R5",  "2026-05-14", "pm5",    "machine",   "O2", 8000,  2064.0, 0,    512],
  ["R6",  "2026-06-02", "pm5",    "machine",   "TR", 2000,  461.3,  0,    118],
  ["R7",  "2026-06-21", "pm5",    "work-pair", null, 3012,  800.5,  0,    null],
  ["R8",  "2026-07-19", "pm5",    "machine",   "AN", 2000,  492.0,  214,  131],
  ["R9",  "2026-08-03", "manual", "steps",     "O2", 10000, 2588.0, null, null],
  ["R10", "2026-08-24", "manual", "steps",     "AT", 8000,  2050.0, null, null],
  ["R11", "2026-08-30", "pm5",    "machine",   null, 5000,  1305.5, 0,    310],
  ["R12", "2026-09-04", "pm5",    "machine",   "AT", 3000,  768.6,  168,  189],
  ["R13", "2026-09-11", "pm5",    "machine",   "TR", 2000,  455.8,  0,    121],
];

/** The seed's dates through the domain's one parser (`calendar.ts`); a
 *  malformed row in the table is a thrown error at import, never a quiet
 *  null. */
export function parseSeedDate(date: string): CalendarDate {
  const parsed = parseDate(date);
  if (parsed === null) throw new Error(`gate0Seed: bad date ${date}`);
  return parsed;
}

export const GATE0_ROWS: readonly DatedStatsRow[] = SEED.map(
  ([
    id,
    date,
    source,
    tier,
    workoutType,
    workMeters,
    workSeconds,
    restMeters,
    calories,
  ]) => ({
    id,
    loggedAt: `${date}T12:00:00.000Z`,
    date: parseSeedDate(date),
    source,
    workoutType,
    tier,
    workMeters,
    workSeconds,
    restMeters,
    restSeconds: null,
    calories,
  }),
);
