# 2026-09-12 — Phase PS PR 1 DBA protocol (plan Task 10)

Measures the SHIPPED query the plan prescribes in Task 4 Step 2
(`STATS_ROW_COLUMNS` / `statsRows()`), not the spec's sketch.

Environment recorded by every run: `postgres:18.4` in Docker on port 5434,
stock `work_mem` 4 MB / `shared_buffers` 128 MB / `jit` on, and
`set max_parallel_workers_per_gather=0` on every timing (dba-techniques
step 4 — without it the planner gives the wide shape workers and the
comparison measures CPU count).

1. `docker run --rm -d --name erg-dba-pg -p 5434:5432 -e POSTGRES_PASSWORD=dev postgres:18.4`
2. `for f in app/drizzle/*.sql; do docker exec -i erg-dba-pg psql -U postgres -v ON_ERROR_STOP=1 -q < "$f"; done`
3. `docker exec -i erg-dba-pg psql -U postgres -v ON_ERROR_STOP=1 < 01-seed.sql`
   (three users at 1k / 10k / 100k plus filler to 1,000,000 rows; ~50 s)
4. `source queries.sh; export BENCH_PRE='set max_parallel_workers_per_gather=0;'`
   then `./bench.sh <label> "$(printf "$Q_STATS" <user-uuid>)"`
5. `./explain.sh "$(printf "$Q_STATS" <user-uuid>)"`
6. `tsx payload.ts` (real drizzle + the plan's `toStatsRow`, serving on :8099),
   then `./http-bench.sh` — bytes and latency with and without gzip.
   `tsx driver.ts` prices drizzle's row mapper against raw `pg`.

`Q_STATS` in `queries.sh` is drizzle's own `.toSQL()` output for the
prescribed `STATS_ROW_COLUMNS` — reproduce it by pasting the plan's
`STATS_ROW_COLUMNS` block into a tsx script that imports
`server/db/schema.js` and printing `.toSQL()`.

Tear down: `docker rm -f erg-dba-pg`.
