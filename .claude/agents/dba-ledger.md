# DBA ledger

The dated per-engagement record for the `dba` agent, one section per
engagement. **Not read up front** — the bounded, always-read half is
`dba-techniques.md`, and an entry is proposed to both. Grep this file for the
numbers behind a technique, the environment a measurement was taken in, or
the history of a table you are about to judge again. Every number here
carries the command that produced it; a section without commands is not a
DBA entry.

## 2026-09-07 — Phase LP §2.2, jsonb keys vs four columns on `session_logs.machine_summary` (seed entry, transcribed)

Transcribed from `docs/superpowers/research/2026-09-07-machine-summary-jsonb-vs-columns.md`
(scripts beside it in `2026-09-07-machine-summary-jsonb-vs-columns/`), the
repo's one DB performance measurement before this agent existed. Dispatched
by James: "Put a DBA agent on the columns question. If possible do real
tests. I'm concerned about performance at scale."

**Verdict (as ruled):** jsonb (variant A) stays; James, 2026-09-07. The
trigger for columns is a correctness event, not a performance one: the first
time Phase PS wants a covering index over these numbers. Filed as the
generated-columns ROADMAP register row ("opens WITH that phase, not before").

**Environment.** `PostgreSQL 18.4 (Debian 18.4-1.pgdg13+1) on aarch64`
(`select version()`), `docker run --rm -d --name erg-dba-pg -p 5434:5432 -e
POSTGRES_PASSWORD=dev postgres:18.4`; Apple M5, 10 CPUs, 16 GiB, Docker
Desktop 29.4.1 at 10 CPUs / 8.32 GB; stock `shared_buffers` 128 MB,
`work_mem` 4 MB, `jit` on; `set max_parallel_workers_per_gather=0` on every
timing. Schema from `app/drizzle/*.sql` in name order via `psql -v
ON_ERROR_STOP=1`, verified against `schema.ts` with `\d session_logs`. Two
clone tables `create table logs_a/logs_b (like session_logs including all)`,
B with four `integer` columns, B derived from A so the logical data is
byte-identical. Fixture: `02-gen.sql`, 40 users, 70 % pm5 rows, 3–8 real
`LogStep` steps, nine `MachineSummaryDetail` keys + `verificationBytes[19]`.
Timings: `bench.sh`, median of 5 warm runs after a discarded first.
**Prod host CPU/RAM UNTESTED** (`docs/deploy.md` states neither); prod
scale 16 rows on 2026-08-28, brief-supplied.

**Numbers that will still be true next time:**

- **Reads through an index do not distinguish the shapes at 1M rows**
  (25k rows for the benchmarked user): detail read 0.142 / 0.123 ms; history
  page of 50 0.357 / 0.232 ms; indexed `MAX(avgWatts)` 0.124 / 0.098 ms;
  indexed `avgWatts > 180` 0.115 / 0.118 ms. All inside run-to-run noise.
- **The history LIST depends on an index that does not exist.** Without
  `(user_id, logged_at desc, id desc)` the page of 50 is 39.0 / 41.7 ms;
  with it 0.36 / 0.23 ms. `schema.ts` carries `session_logs_user_id_idx`
  only. Filed as its own ROADMAP row ("rides the next PR that adds a Drizzle
  migration to `session_logs`").
- **The jsonb aggregate tax is ~0.6 µs per row scanned**, measured by
  forcing the same `HashAggregate` plan with `work_mem='256MB'`: 256 ms vs
  55 ms over 331,419 rows. Scale curve, per-user 12-month roll-up: 208 rows
  1.0 / 0.5 ms; 5,000 rows 2.4 / 1.5 ms; 24,334 rows 41.2 / 9.4 ms;
  331,419 rows 337–414 / 53–266 ms. Extrapolated: ~170,000 rows in one
  query before jsonb costs 100 ms more than columns.
- **`INCLUDE` accepts columns, never expressions**, so A's covering index
  carries the whole 666-byte blob: **346 MB vs 48 MB** at 1M rows
  (`pg_relation_size` per `pg_stat_user_indexes`); total indexes 446 MB vs
  155 MB. With it, the 12-month cohort roll-up is **337 ms vs 53 ms** and
  the per-user one **20.0 ms vs 3.3 ms**. `EXPLAIN (ANALYZE, BUFFERS)`: A
  sorts a `width=674` tuple with `Sort Method: external merge  Disk:
  91952kB`; B hash-aggregates `width=16` in `Memory Usage: 545kB`. Both get
  `Heap Fetches: 0`.
- **Storage:** +51.8 B/row on disk (1412 MB vs 1362 MB at 1M), +76 B of WAL
  per insert (1624 vs 1548 B, `explain (analyze, wal)` with
  `full_page_writes` off); `pg_column_size(machine_summary)` 666 / 554 B.
  **TOAST is 0 bytes for both at 100k and 1M** — widest row 1932 B, under
  the ~2032 B threshold; at the route's 200-step cap `steps` goes out of
  line (77,292 chars of JSON text), the summary stays inline.
- **Writes:** 1,000-row insert 23.8 / 27.6 ms (noise); the jsonb `||`
  update is 2× the column update (24.1 / 12.4 ms) — informational, no
  update path exists for these fields.
- **The correctness asymmetry:** jsonb accepts `'{"avgWatts":"one sixty
  two"}'`; then the naive `SUM` errors for that user's whole history, the
  expression index cannot be created (`22P02`), and with the index already
  in place the rower's INSERT itself fails. The `jsonb_typeof` guard the
  repo uses survives the read but silently drops the value and does NOT
  catch `162.4`. A column silently rounds `162.4` to 162 and rejects
  `3000000000` (`integer out of range`).
- **Header room:** the branch's widest `machineSummary` serialises to 444
  chars against the 2048-char cap (`MACHINE_SUMMARY_MAX_BYTES`).

**What the method got wrong the first time, kept as technique:** the first
100k run had A FASTER (14.8 vs 20.7 ms) because its wide row earned a
`Gather Merge` with 2 workers and B's did not — parallelism must be off for
a shape comparison. The first WAL measurement used `pg_current_wal_lsn()`
deltas and returned literally `0 bytes` on one pass (full-page images
swamped it) — use `explain (analyze, wal)` with `full_page_writes` off.

**Not measured:** prod host shape; concurrency; serialisation to a phone
over a real link (psql timings include a local socket only); whether Phase
PS aggregates these four numbers at all.
