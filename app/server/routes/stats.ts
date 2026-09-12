import { Router, type RequestHandler } from "express";
import {
  rowContribution,
  statsRowInput,
} from "../../domain/stats/rowContribution.js";
import type {
  StatsRow,
  StatsRowsResponse,
} from "../../domain/stats/statsRow.js";
import { isWorkoutType } from "../../domain/types.js";
import type { LogsStore } from "../stores/logs.js";

type StoredStatsRow = Awaited<ReturnType<LogsStore["statsRows"]>>[number];

/** Phase PS PR 1 (career-stats spec §4.3): one stored row → the slim
 *  projection the surface sums. Computed HERE so `steps` never crosses
 *  the wire; the tier rule is the domain's, the same one `buildHeroes`
 *  calls (invariant 2). `loggedAt` comes off the driver as a `Date`
 *  (`timestamp with time zone`) and leaves as the ISO instant. */
export function toStatsRow(r: StoredStatsRow): StatsRow {
  // The store row IS a `StatsRowSource` (enum column → `T | null`, jsonb
  // `steps` → unknown); the same builder the client's `buildHeroes` calls.
  const c = rowContribution(statsRowInput(r));
  return {
    id: r.id,
    loggedAt: r.loggedAt.toISOString(),
    source: r.source,
    // The column is plain text (a save-time snapshot); only members of the
    // union are ever written (`POST /api/logs`), and anything else — or
    // null — is NO TYPE here (invariant 9).
    workoutType: isWorkoutType(r.workoutType) ? r.workoutType : null,
    tier: c.tier,
    workMeters: c.workMeters,
    workSeconds: c.workSeconds,
    restMeters: c.restMeters,
    restSeconds: c.restSeconds,
    calories: c.calories,
  };
}

export function createStatsRouter({
  logs,
  requireUser,
}: {
  logs: LogsStore;
  requireUser: RequestHandler;
}) {
  const router = Router();
  // Scoped like `routes/data.ts`'s own guard: only this prefix, never `/`.
  router.use("/api/stats", requireUser);

  // Every row of the caller, UNORDERED, no query params in PR 1 (no
  // pagination, no date filter — the client filters). Bounded by design
  // up to the measured trigger (spec §4.3, invariant 15).
  router.get("/api/stats/rows", async (req, res) => {
    const rows = await logs.statsRows(req.user!.id);
    const body: StatsRowsResponse = { rows: rows.map(toStatsRow) };
    res.json(body);
  });

  return router;
}
