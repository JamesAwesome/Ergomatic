// Wave E PR1 Task 5 (task-5-brief.md): the pure row -> Concept2 result
// mapping, plus the eligibility gate a caller runs before ever building a
// payload. A fresh SERVER module, not a re-export of
// scripts/c2-crossconnect.ts (the PR0 desk harness) — that file stays
// dev-only, never imported by server/ or src/ (agent briefing: "Two
// footguns"/module boundaries; same posture client.ts already states for
// itself). `c2Tenths`/`formatC2Date` below are TRANSPLANTED, logic-for-
// logic, from scripts/c2-crossconnect.ts:132-152, with their own comments
// here rather than a shared import.

// Independent, own-bounds structural mirror of `stores/logs.ts`'s `get()`
// return row (the SAME "independent mirror" idiom that file's own
// `LogSeriesSample` doc comment names) — only the fields this module
// actually reads, never the full Drizzle row type, so server/concept2/
// never imports server/stores/ or server/db/schema.ts. Every field's
// nullability mirrors its real column (`db/schema.ts`): `loggedAt` is
// NOT NULL (a DB-side default); everything else here is nullable exactly
// as stored.
export interface SessionLogRow {
  loggedAt: Date;
  completedAt: Date | null;
  tz: string | null;
  workSeconds: number | null;
  workMeters: number | null;
  restSeconds: number | null;
  restMeters: number | null;
  machineSummary: Record<string, unknown> | null;
  deviceName: string | null;
  endedBy: string | null;
}

// The three reasons a row is not eligible for a Concept2 upload, in the
// order `eligibilityFailure` checks them (spec §The mapping).
export type EligibilityFailure =
  "not_monitor" | "not_finished" | "no_work_totals";

// `endedBy` is NULLABLE on the row (pre-RC rows carry null — the column
// shipped in Phase LL Task 4, so any row logged before that has no close
// reason recorded AT ALL): null !== "finished" -> "not_finished". That is
// deliberate: a pre-RC row is excluded with the SAME reason a
// rower-terminated row gets, stated here because a pre-RC row has no
// close reason at all, not a wrong one.
export function eligibilityFailure(row: {
  deviceName: string | null;
  endedBy: string | null;
  workSeconds: number | null;
  workMeters: number | null;
}): EligibilityFailure | null {
  if (row.deviceName === null) return "not_monitor";
  if (row.endedBy !== "finished") return "not_finished";
  if (row.workSeconds === null || row.workMeters === null) {
    return "no_work_totals";
  }
  return null;
}

// Transplanted from scripts/c2-crossconnect.ts:132-134.
export function c2Tenths(seconds: number): number {
  return Math.round(seconds * 10);
}

// Transplanted from scripts/c2-crossconnect.ts:136-152 (en-CA date + en-GB
// h23 time via Intl — en-CA gives yyyy-mm-dd; hourCycle h23 avoids
// "24:00"). Measured live against this exact instant/tz at PR0
// (docs/monitor/c2-crossconnect-2026-09/raw-output.txt:1-26, "date":
// "2026-08-25 17:42:03").
export function formatC2Date(instant: Date, tz: string): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  return `${date} ${time}`;
}

// The HOUSE stroke-rate band, duplicated here (not imported — the source
// constants are module-private in routes/data.ts) as an independent
// mirror, same idiom as `SessionLogRow` above: `ACTUAL_SPM_MIN = 1`
// (server/routes/data.ts:348) and `PM5_SPM_MAX = 99`
// (server/routes/data.ts:332). This is NOT the wire's own u8 range
// (0..255 — that same file's comment at line 320 notes "avgSpm up to
// 255" as the reason the manual/pm5 bands had to widen in the first
// place). `machineSummary` is untyped jsonb and `validateMachineSummary`
// band-checks nothing numeric in it, so THIS band is the only thing
// standing between a malformed or out-of-range stroke count and a C2
// upload — load-bearing, not decorative.
//
// The 2x stroke-rate anomaly (walk-2026-08-25 README W-3) has never been
// observed on a FINISHED row (n=1) and RC-16 itself was closed
// PREMISE-FALSIFIED (docs/history/phase-rc.md:1962-1968 — a later capture
// read 25 against a PM5 screen reading 25, refuting the "always 2x"
// premise). The guard here is this band plus the finished-only fence
// `eligibilityFailure` already enforces upstream — never RC-16, which
// answered a different, now-closed question.
const STROKE_RATE_MIN = 1;
const STROKE_RATE_MAX = 99;

// `machineSummary.workoutType` is the raw 0x0039 byte 17
// (domain/monitor/pm5/parse.ts:370). Ordinal 8 is the programmed-row
// reading on the finished capture this module's fixture transcribes, and
// Concept2 accepted the string "VariableInterval" live at PR0
// (docs/monitor/c2-crossconnect-2026-09/raw-output.txt:1-26). The JustRow
// capture read `01` on this same byte, "noted raw, not yet interpreted"
// (docs/monitor/sessions/walk-2026-08-24/README.md:116-118), so ordinal 1
// stays UNMAPPED until phase JR confirms what it means — any ordinal not
// in this table (including 1) omits `workout_type` entirely (spec's
// "everything else OMITTED" rule, anchor F6: omission is honest).
const C2_WORKOUT_TYPE_BY_ORDINAL: Record<number, string> = {
  8: "VariableInterval",
};

// Row totals `buildC2Payload` requires — non-null, unlike `SessionLogRow`'s
// own nullable fields — because this function is only ever called on a
// row that has ALREADY passed `eligibilityFailure` (whose "no_work_totals"
// branch is exactly this guarantee). Throwing here is a defensive
// contract check, not a reachable production path when callers respect
// the gate.
function requireWorkTotals(row: SessionLogRow): {
  workSeconds: number;
  workMeters: number;
} {
  if (row.workSeconds === null || row.workMeters === null) {
    throw new Error(
      "buildC2Payload requires a row that has already passed eligibilityFailure (workSeconds/workMeters is null)",
    );
  }
  return { workSeconds: row.workSeconds, workMeters: row.workMeters };
}

// Builds the Concept2 result payload for one eligible row (spec §The
// mapping). Callers run `eligibilityFailure` first; this function does
// not re-derive eligibility itself beyond the work-totals guard above.
//
// tz precedence: `row.completedAt` + `row.tz` when BOTH are present (the
// client's own recorded instant and zone); otherwise `row.loggedAt` +
// `effectiveTz`, where the CALLER is responsible for resolving
// `effectiveTz` to the row's stored tz when present, else the request's
// (persisted by the route before this runs — plan deviation 2). This
// function only ever reads `row.tz` as part of the FIRST branch's paired
// check — it never falls back to `row.tz` alone.
export function buildC2Payload(
  row: SessionLogRow,
  link: { weightClass: "H" | "L" },
  effectiveTz: string,
): Record<string, unknown> {
  const { workSeconds, workMeters } = requireWorkTotals(row);

  // Narrowing happens per-branch of this ternary (TS control-flow
  // analysis), so no non-null assertion is needed on either side.
  const instant =
    row.completedAt !== null && row.tz !== null
      ? row.completedAt
      : row.loggedAt;
  const tz = row.completedAt !== null && row.tz !== null ? row.tz : effectiveTz;

  const post: Record<string, unknown> = {
    type: "rower",
    date: formatC2Date(instant, tz),
    timezone: tz,
    distance: workMeters,
    time: c2Tenths(workSeconds),
    weight_class: link.weightClass,
  };

  // rest_time/rest_distance ride only when > 0 — PR0's own rule
  // (scripts/c2-crossconnect.ts:166-167): a zero-rest row never forces
  // either key.
  if (row.restSeconds !== null && row.restSeconds > 0) {
    post.rest_time = c2Tenths(row.restSeconds);
  }
  if (row.restMeters !== null && row.restMeters > 0) {
    post.rest_distance = row.restMeters;
  }

  const avgStrokeRate = row.machineSummary?.avgStrokeRate;
  if (
    typeof avgStrokeRate === "number" &&
    Number.isInteger(avgStrokeRate) &&
    avgStrokeRate >= STROKE_RATE_MIN &&
    avgStrokeRate <= STROKE_RATE_MAX
  ) {
    post.stroke_rate = avgStrokeRate;
  }

  const workoutType = row.machineSummary?.workoutType;
  if (
    typeof workoutType === "number" &&
    workoutType in C2_WORKOUT_TYPE_BY_ORDINAL
  ) {
    post.workout_type = C2_WORKOUT_TYPE_BY_ORDINAL[workoutType];
  }

  return post;
}
