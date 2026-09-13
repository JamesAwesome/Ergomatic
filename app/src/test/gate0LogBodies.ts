/**
 * The Gate 0 seed (`docs/design/career-stats/seed.mjs`) as `POST /api/logs`
 * bodies — one per row, shaped so the supported save path lands each row
 * in the seed's TIER (spec §8.5). `date` is the seed date the e2e backdates
 * `loggedAt` to. `gate0LogBodies.test.ts` holds every body's tier and
 * figures equal to `domain/stats/gate0Seed.ts` through `rowContribution`.
 */
import { fmtDate } from "../../domain/stats/calendar.js";
import { GATE0_ROWS } from "../../domain/stats/gate0Seed.js";

export const GATE0_TODAY_ISO = "2026-09-12";
const PM5 = "PM5 432331249";

export interface Gate0LogBody {
  id: string;
  date: string;
  body: Record<string, unknown>;
}

export const GATE0_LOG_BODIES: Gate0LogBody[] = GATE0_ROWS.map((r) => {
  const base: Record<string, unknown> = {
    workoutId: null,
    workoutTitle: r.workoutType === null ? "Just Row" : `Seed ${r.id}`,
    workoutType: r.workoutType,
    held: null,
    effort: null,
    notes: null,
    advancesPlan: false,
    source: r.source,
    ...(r.source === "pm5" ? { deviceName: PM5 } : {}),
  };
  const m = r.workMeters!;
  const s = r.workSeconds!;
  const cal =
    r.calories === null
      ? {}
      : { machineSummary: { totalCalories: r.calories } };
  let body: Record<string, unknown>;
  switch (r.tier) {
    case "machine":
      body = {
        ...base,
        endedBy: "finished",
        steps:
          r.workoutType === null
            ? []
            : [{ label: "Work", actualMeters: m, actualSeconds: s }],
        machineWorkSeconds: s,
        machineWorkMeters: m,
        workSeconds: s,
        workMeters: m,
        restSeconds: r.restMeters === 0 ? 0 : 60,
        restMeters: r.restMeters,
        distanceMeters: m,
        timeSeconds: s,
        ...cal,
      };
      break;
    case "work-pair":
      body = {
        ...base,
        endedBy: "link-lost",
        steps: [],
        workSeconds: s,
        workMeters: m,
        restSeconds: 0,
        restMeters: 0,
        distanceMeters: m,
        timeSeconds: s,
      };
      break;
    case "steps":
      body = {
        ...base,
        steps: [{ label: "Work", actualMeters: m, actualSeconds: s }],
      };
      break;
    case "stored":
      // Pre-RC-5: fused columns only, no pair, no machine totals, steps
      // without actuals — the stored tier by having nothing else.
      body = {
        ...base,
        endedBy: "rower",
        steps: [{ label: "6k" }],
        distanceMeters: m,
        timeSeconds: s,
      };
      break;
  }
  return {
    id: r.id,
    date: fmtDate(r.date),
    body,
  };
});
