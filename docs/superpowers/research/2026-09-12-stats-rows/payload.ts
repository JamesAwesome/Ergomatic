// Phase PS PR 1 — payload + Node-side latency for the PRESCRIBED statsRows()
// and toStatsRow(). Runs the real drizzle query builder over the real schema
// against the seeded Postgres, applies the plan's Task 4 Step 4 mapping
// through the plan's Task 2 rowContribution, and serves it from a real
// Express router so the measured bytes are HTTP bytes, not JSON.stringify.
import express from "express";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sessionLogs } from "/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/ps-pr1/app/server/db/schema.js";
import { isWorkoutType } from "/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/ps-pr1/app/domain/types.js";

const pool = new pg.Pool({ connectionString: "postgres://postgres:dev@localhost:5434/postgres" });
const db = drizzle(pool);

// --- plan Task 4 Step 2, verbatim ---
const STATS_ROW_COLUMNS = {
  id: sessionLogs.id, loggedAt: sessionLogs.loggedAt, source: sessionLogs.source, workoutType: sessionLogs.workoutType,
  endedBy: sessionLogs.endedBy, machineWorkSeconds: sessionLogs.machineWorkSeconds, machineWorkMeters: sessionLogs.machineWorkMeters,
  workSeconds: sessionLogs.workSeconds, workMeters: sessionLogs.workMeters, restSeconds: sessionLogs.restSeconds, restMeters: sessionLogs.restMeters,
  distanceMeters: sessionLogs.distanceMeters, timeSeconds: sessionLogs.timeSeconds, steps: sessionLogs.steps,
  totalCalories: sql<number | null>`case when jsonb_typeof(${sessionLogs.machineSummary}->'totalCalories') = 'number' then (${sessionLogs.machineSummary}->>'totalCalories')::double precision else null end`,
};
const statsRows = (userId: string) => db.select(STATS_ROW_COLUMNS).from(sessionLogs).where(eq(sessionLogs.userId, userId));

// --- plan Task 2 Step 3, verbatim ---
interface StatsStepInput { actualMeters: number | null; actualSeconds: number | null }
function stepActualSums(steps: readonly StatsStepInput[]) {
  let meters: number | null = null; let seconds: number | null = null;
  for (const step of steps) {
    if (step.actualMeters !== null) meters = (meters ?? 0) + step.actualMeters;
    if (step.actualSeconds !== null) seconds = (seconds ?? 0) + step.actualSeconds;
  }
  return { meters, seconds };
}
const isReconstructableClose = (e: string | null) => e === "finished" || e === null;
function rowContribution(row: any): any {
  const rest = { restMeters: row.restMeters, restSeconds: row.restSeconds,
    calories: Number.isInteger(row.totalCalories) ? row.totalCalories : null };
  if (row.machineWorkSeconds !== null && row.machineWorkMeters !== null && row.machineWorkSeconds > 0 && row.machineWorkMeters > 0)
    return { ...rest, tier: "machine", workMeters: Math.round(row.machineWorkMeters), workSeconds: row.machineWorkSeconds };
  if (row.workSeconds !== null && row.workMeters !== null && row.workSeconds > 0 && row.workMeters > 0)
    return { ...rest, tier: "work-pair", workMeters: Math.round(row.workMeters), workSeconds: row.workSeconds };
  const sums = stepActualSums(row.steps);
  if (sums.meters !== null && isReconstructableClose(row.endedBy))
    return { ...rest, tier: "steps", workMeters: sums.meters, workSeconds: sums.seconds };
  return { ...rest, tier: "stored", workMeters: row.distanceMeters, workSeconds: row.timeSeconds };
}

// --- plan Task 4 Step 4, verbatim ---
function stepActuals(steps: unknown): StatsStepInput[] {
  if (!Array.isArray(steps)) return [];
  return steps.map((s: unknown) => {
    const step = (typeof s === "object" && s !== null ? s : {}) as Record<string, unknown>;
    return { actualMeters: typeof step.actualMeters === "number" ? step.actualMeters : null,
      actualSeconds: typeof step.actualSeconds === "number" ? step.actualSeconds : null };
  });
}
function toStatsRow(r: any) {
  const c = rowContribution({ endedBy: r.endedBy, machineWorkSeconds: r.machineWorkSeconds, machineWorkMeters: r.machineWorkMeters,
    workSeconds: r.workSeconds, workMeters: r.workMeters, distanceMeters: r.distanceMeters, timeSeconds: r.timeSeconds,
    restSeconds: r.restSeconds, restMeters: r.restMeters, steps: stepActuals(r.steps), totalCalories: r.totalCalories });
  return { id: r.id, loggedAt: r.loggedAt.toISOString(), source: r.source,
    workoutType: isWorkoutType(r.workoutType) ? r.workoutType : null,
    tier: c.tier, workMeters: c.workMeters, workSeconds: c.workSeconds, restMeters: c.restMeters, restSeconds: c.restSeconds, calories: c.calories };
}

const USERS: Record<string, string> = {
  "1k": "4f60dae9-297e-4786-a716-db09df8ff223",
  "10k": "adc55aa1-2a15-4554-87a9-0ecca2ac8a3a",
  "100k": "551ff664-ad66-47e3-b5fc-e89a045177e2",
};

const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function measure(label: string, uid: string) {
  const q: number[] = []; const m: number[] = [];
  let body = "";
  for (let i = 0; i < 6; i++) {
    const t0 = performance.now();
    const rows = await statsRows(uid);
    const t1 = performance.now();
    body = JSON.stringify({ rows: rows.map(toStatsRow) });
    const t2 = performance.now();
    if (i > 0) { q.push(t1 - t0); m.push(t2 - t1); }
    if (i === 0) {
      const first = toStatsRow(rows[0]);
      console.log(`  sample row keys(${Object.keys(first).length}): ${Object.keys(first).sort().join(",")}`);
      console.log(`  sample row: ${JSON.stringify(first)}`);
      const tiers: Record<string, number> = {};
      for (const r of rows) { const t = toStatsRow(r).tier; tiers[t] = (tiers[t] ?? 0) + 1; }
      console.log(`  tiers: ${JSON.stringify(tiers)}`);
      const calN = rows.filter((r: any) => typeof r.totalCalories === "number").length;
      console.log(`  totalCalories numeric in ${calN}/${rows.length} rows (drizzle read the unaliased case-expression)`);
    }
  }
  const n = JSON.parse(body).rows.length;
  console.log(`${label.padEnd(6)} rows=${n}  query+parse median ${median(q).toFixed(1)} ms  map+stringify ${median(m).toFixed(1)} ms  body ${body.length} B  = ${(body.length / n).toFixed(1)} B/row`);
  return { n, bytes: body.length, q, m };
}

console.log("== Node-side, drizzle over the real schema ==");
for (const [label, uid] of Object.entries(USERS)) { console.log(`-- ${label} --`); await measure(label, uid); }

// --- real HTTP, real Express, the plan's router shape ---
const app = express();
app.get("/api/stats/rows", async (req, res) => {
  const uid = USERS[String(req.query.u)];
  const rows = await statsRows(uid);
  res.json({ rows: rows.map(toStatsRow) });
});
const server = app.listen(8099);
console.log("\n== HTTP on :8099 (Express res.json, no compression middleware) ==");
process.on("SIGTERM", () => { server.close(); pool.end(); });
