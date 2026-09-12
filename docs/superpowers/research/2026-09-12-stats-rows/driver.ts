// Prices drizzle's row mapper against raw `pg` for the SAME shipped SQL,
// in ONE warmed process (20 warm-up iterations before any timing) — the
// spec-pass Node number was taken with raw pg, the shipped store uses drizzle.
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sessionLogs } from "/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/ps-pr1/app/server/db/schema.js";

const pool = new pg.Pool({ connectionString: "postgres://postgres:dev@localhost:5434/postgres" });
const db = drizzle(pool);
const CAL = sql<number | null>`case when jsonb_typeof(${sessionLogs.machineSummary}->'totalCalories') = 'number' then (${sessionLogs.machineSummary}->>'totalCalories')::double precision else null end`;
const COLS = { id: sessionLogs.id, loggedAt: sessionLogs.loggedAt, source: sessionLogs.source, workoutType: sessionLogs.workoutType,
  endedBy: sessionLogs.endedBy, machineWorkSeconds: sessionLogs.machineWorkSeconds, machineWorkMeters: sessionLogs.machineWorkMeters,
  workSeconds: sessionLogs.workSeconds, workMeters: sessionLogs.workMeters, restSeconds: sessionLogs.restSeconds, restMeters: sessionLogs.restMeters,
  distanceMeters: sessionLogs.distanceMeters, timeSeconds: sessionLogs.timeSeconds, steps: sessionLogs.steps, totalCalories: CAL };
const RAW = db.select(COLS).from(sessionLogs).where(eq(sessionLogs.userId, "x")).toSQL().sql;

const U: Record<string, string> = { "1k": "4f60dae9-297e-4786-a716-db09df8ff223", "10k": "adc55aa1-2a15-4554-87a9-0ecca2ac8a3a", "100k": "551ff664-ad66-47e3-b5fc-e89a045177e2" };
const med = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function time(f: () => Promise<unknown>, warm: number, n: number) {
  for (let i = 0; i < warm; i++) await f();
  const xs: number[] = [];
  for (let i = 0; i < n; i++) { const t = performance.now(); await f(); xs.push(performance.now() - t); }
  return med(xs);
}
for (const [label, uid] of Object.entries(U)) {
  const warm = label === "100k" ? 3 : 20;
  const dz = await time(() => db.select(COLS).from(sessionLogs).where(eq(sessionLogs.userId, uid)), warm, 5);
  const raw = await time(() => pool.query(RAW, [uid]), warm, 5);
  console.log(`${label.padEnd(5)} drizzle ${dz.toFixed(1)} ms   raw pg ${raw.toFixed(1)} ms   drizzle mapper overhead ${(dz - raw).toFixed(1)} ms (${((dz / raw - 1) * 100).toFixed(0)}%)`);
}
await pool.end();
