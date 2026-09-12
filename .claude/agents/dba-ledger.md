# DBA ledger

The dated per-engagement record for the `dba` agent, one section per
engagement. **Not read up front** — the bounded, always-read half is
`dba-techniques.md`, and an entry is proposed to both. Grep this file for the
numbers behind a technique, the environment a measurement was taken in, or
the history of a table you are about to judge again. Every number here
carries the command that produced it; a section without commands is not a
DBA entry.

## 2026-09-12 — PR #412, Phase MD PR 3 "one Sample shape" (gate, TRIAD: stored shape)

**Verdict: PASS.** No migration, no schema change, no SQL change, zero stored
bytes changed. Ruling scale: none — a byte-equality verdict holds identically
at 133 samples and at the 14,400 cap.

| Environment | |
| --- | --- |
| Postgres | 18.4 (Debian, aarch64), `docker run --rm -d --name erg-dba-pg -p 5434:5432 -e POSTGRES_PASSWORD=dev postgres:18.4` |
| Settings | `work_mem` 4 MB · `shared_buffers` 128 MB · `jit` on · `max_parallel_workers_per_gather` 2 (untouched; no timing claimed) |
| Machine | Apple M5, 10 cores, 16 GB; Docker 29.4.1; Node v26.5.0 |
| Trees | `3fc49767` (main) vs `877495a4`, both `git archive`d with `node_modules` symlinked |
| Migrations | `migrate(db, { migrationsFolder })`, production's own call |
| Runs | single run each (byte comparison, not timing) |

**Method.** One `tsx` probe copied identically into both trees, importing the
REAL `createDataRouter` + `createLogsStore(db)` and POSTing via supertest —
client shape → validator → drizzle → pg → jsonb. Series from the real
`createSeriesRecorder` over `walk-2026-08-16/session-2-wu-4unequal.jsonl`
(133 samples, 21 resting), plus a deterministic synthetic series at
`SERIES_SAMPLE_CAP` = 14,400.

| Measure | main | branch |
| --- | --- | --- |
| capture `md5(series::text)` | `fcc401bda2b5b8a26b0dea3ee1bd9d45` | identical |
| capture `pg_column_size` / `::text` chars | 1580 B / 7654 | 1580 B / 7654 |
| 14,400-cap `md5` | `a2c5f84ebdbe3a11addea757f9ad0023` | identical |
| 14,400-cap `pg_column_size` / chars | 163,347 B / 763,396 | identical |
| `GET /api/logs/:id` bytes (capture / cap) | 7,078 / 635,790 | identical |
| `INSERT INTO "session_logs"` text (`log_statement='all'`) | 34 cols, `series`=$19, `ended_by`=$20 | string-identical |
| `LOG_LIST_COLUMNS` keys | 33, no `series` | diff empty |
| `endedBy` error prose, derived vs deleted literal | — | `derived === literal` → true |
| `app/drizzle/` files changed | — | 0 |

**RF21 — the gate goes red.** Mutating the branch validator to
`r: r === true ? true : null` moved both rows (capture md5 → `483b28085f…`,
cap md5 → `9a174a014d…`).

**Intuition corrected.** The ROADMAP row's feared "+19.1 %" was a `::text`
figure: `r: null` at the cap is +18.2 % of text characters but only +2.95 %
of stored bytes — jsonb compresses ~4.7× at this size.

**Observation, no row.** `ENDED_BY_VALUES === endedByEnum.enumValues` and the
array is not frozen; nothing mutates it. No measured trigger.

**Untested.** Prod row count (last dated figure 16 rows, 2026-08-28);
WAL/write cost (identical statement + identical parameters — INFERENCE);
response compression in production.

## 2026-09-12 — Phase PS PR 1 plan pass, the prescribed `statsRows()` (plan Task 4 / Task 10)

**Verdict: PASS.** Scale that ruled: the household — 1k rows/user (≈4 years at
5/week) costs 9.5 ms and 225 KB per fetch. Both plan literals hold; the plan's
two departures from the spec's sketch are improvements, measured.

| Environment | |
| --- | --- |
| Postgres | `PostgreSQL 18.4 (Debian 18.4-1.pgdg13+1) aarch64`, `docker run --rm -d --name erg-dba-pg -p 5434:5432 -e POSTGRES_PASSWORD=dev postgres:18.4` |
| Settings | `work_mem` 4 MB · `shared_buffers` 128 MB · `jit` on · `set max_parallel_workers_per_gather=0` on every timing |
| Machine | Apple M5, 10 cores, 16 GB; Docker 29.4.1; Node v26.5.0 |
| Tree | worktree `ps-pr1` at `68d0653e` (route NOT implemented — the plan's blocks were run verbatim from a scratchpad script) |
| Schema | all 31 `app/drizzle/*.sql` via `psql -v ON_ERROR_STOP=1`; `\d session_logs` → `session_logs_user_id_idx` only |
| Seed | 2026-09-07 `dba_gen_a` retargeted at `session_logs`, users at 1k/10k/100k + filler → 1,000,000 rows, 1411 MB, 50.5 s |
| Runs | medians of 5 after a discarded run 1, one psql session; HTTP p95 over n=25 |

**The SQL measured** is drizzle's own `.toSQL()` for the prescribed
`STATS_ROW_COLUMNS`:

    select "id", "logged_at", "source", "workout_type", "ended_by",
      "machine_work_seconds", "machine_work_meters", "work_seconds",
      "work_meters", "rest_seconds", "rest_meters", "distance_meters",
      "time_seconds", "steps",
      case when jsonb_typeof("machine_summary"->'totalCalories') = 'number'
           then ("machine_summary"->>'totalCalories')::double precision
           else null end
    from "session_logs" where "session_logs"."user_id" = $1

The `case` column ships UNALIASED; drizzle maps by position and read
`totalCalories` numeric in 700/1000, 7000/10000, 70000/100000 rows.

| rows/user | psql | EXPLAIN exec | drizzle warm | raw `pg` | HTTP median | payload |
|---|---|---|---|---|---|---|
| 1k | 8.38 ms | 0.91 ms | 7.8 ms | 6.7 ms | 9.5 ms | 224,781 B |
| 10k | 75.23 ms | 4.19 ms | 80.2 ms | 70.6 ms | 86.3 ms (p95 90.8) | 2,248,115 B |
| 100k | 943.40 ms | 56.37 ms | 832.4 ms | 766.6 ms | 939.2 ms | 22,481,319 B |

**Plan literals.** 224.8 B/row ≤ 240 → PASS (identical at all three scales —
`steps` is genuinely dropped). 10k p95 90.8 ms ≤ 150 ms → PASS.

**Deltas vs the spec pass (same box, same seed).**
1. **No `ORDER BY` kills the sort.** Spec shape: Bitmap Heap Scan + `Sort
   Method: external merge Disk: 73680kB`, exec 129 ms at 100k. Plan shape:
   `Index Scan using session_logs_user_id_idx … Buffers: shared hit=174
   read=17580`, **no Sort node**, exec 56.37 ms. `rows=` estimate within 3%
   at 10k/100k (30% low at 1k, sampling).
2. **Drizzle's mapper is +9-15%** over raw `pg` (`driver.ts`); the spec-pass
   Node figure was raw `pg` and was that much low. At 10k it moved 71.8 → 80.2.
3. **The `jsonb_typeof` guard closes the ledger's poison-value hazard.** In a
   rolled-back tx, two rows with `totalCalories` `"thirty-seven"` and `37.5`:
   guarded → `null` / `37.5`; the spec's bare cast → `ERROR: invalid input
   syntax for type double precision: "thirty-seven"`, which would 500 that
   user's entire history. Cost is noise (75.2 guarded vs 77.6 unguarded at 10k).
4. **gzip measured, was UNTESTED.** `curl -H 'Accept-Encoding: gzip'` returned
   byte-identical bodies at every scale — no compression middleware, confirmed
   on the wire rather than from `package.json`.

**Queries per request.** `log_statement='all'` → exactly ONE
`execute <unnamed>: select "id", "logged_at", …` per `GET`. No N+1; `pg.Pool`'s
default `max` 10 is not in play. Reset after.

**Migration / lock / index.** None owed and none prescribed: no schema hit in
the plan; `session_logs_user_id_idx` is 6376 kB at 1M and serves every scale;
the `(user_id, logged_at desc, id desc)` composite stays unowed because there
is no `ORDER BY`.

**Correctness (the spec pass's open note, now closed).** Task 4 Step 5 seeds
`machineFused` with the fused `distanceMeters: 500 + FUSED_REST_METERS` = 620
and `preRc5` as an explicit pre-RC-5 fused row, and asserts **three**
stored-tier rows — so the `k ROWS PREDATE` count can go red, and Step 6's
mutation (`workMeters: r.distanceMeters`) bites on exactly the fusion
(`expected 620 to be 500`).

**Plan corrections (folded at `b4bddbdf`).** Task 10 Step 1's `payload.sh`
cannot exist before the route does — `payload.ts` plus `http-bench.sh`
replace it. `bench.sh` must drop `BENCH_PRE`'s own `Time:` line in ORDER
before sorting, or it discards the fastest run rather than the cold one.

**Untested.** Prod host CPU/RAM (`docs/deploy.md` states neither); prod row
count (last dated figure 16 rows, 2026-08-28); a single user at 1M rows;
production TLS/tunnel transfer. Container torn down (`docker ps -a` → 0).

**Scripts:** `docs/superpowers/research/2026-09-12-stats-rows/` (landed with
the plan fold, `b4bddbdf`).

## 2026-09-12 — Phase PS spec pass, `GET /api/stats/rows` shape and growth

**Verdict: PASS WITH ROWS** (one row; the two Wave E rows do NOT open from
this route). Scale that ruled: the household — 260 rows/user/yr → the route
costs <10 ms and 58 KB per fetch for a decade of rowing.

**Environment.** `PostgreSQL 18.4 (Debian 18.4-1.pgdg13+1) aarch64`,
`docker run --rm -d --name erg-dba-pg -p 5434:5432 -e POSTGRES_PASSWORD=dev
postgres:18.4`; Apple M5, 10 CPUs, 16 GiB (`sysctl`); stock `shared_buffers`
128 MB, `work_mem` 4 MB, `jit` on; `set max_parallel_workers_per_gather=0`
on every timing. Schema: all 31 `app/drizzle/*.sql` via
`psql -v ON_ERROR_STOP=1` (`\d session_logs` shows `session_logs_user_id_idx`
only). Seed: the 2026-09-07 research dir's `02-gen.sql` `dba_gen_a`
retargeted at `session_logs` with 40 real `users` rows, user ranges
1k / 10k / 100k, filled to 1,000,000 rows (56.5 s; `pg_total_relation_size`
1412 MB). Medians of 5 after a discarded run (`bench2.sh`, psql `\timing`,
`\o /dev/null`); Node numbers via `pg` from `app/node_modules` +
`JSON.stringify` (`payload.mjs`). Prod host CPU/RAM UNTESTED (`docs/deploy.md`
states neither). Container torn down (`docker ps -a` → 0).

**1. Query shape.** The projection needs 13 scalars (`id, logged_at, source,
workout_type, ended_by, machine_work_*, work_*, rest_*, distance_meters,
time_seconds`) + `machine_summary->>'totalCalories'` (a narrow extract,
~free) + the whole `steps` jsonb, because tier `steps` (Σ `actualMeters`,
gated on `ended_by`) is decided in Node. `WHERE user_id = $1` uses
`session_logs_user_id_idx` (Bitmap Index Scan at every scale, `rows=`
estimate within 3% of actual). `ORDER BY logged_at desc, id desc` sorts in
memory at 1k (`quicksort Memory: 769kB`, `Buffers: shared read=178`) and
spills at 100k (`Sort Method: external merge Disk: 73680kB`, width=767) —
15 ms of the 129 ms execution; not the cost.

| rows/user (1M table) | scalar-only psql | slim (spec's shape) psql | EXPLAIN exec | Node query+parse | map+stringify | payload |
|---|---|---|---|---|---|---|
| 1k | 0.80 ms | 6.95 ms | 0.94 ms | 7.4 ms | 0.6 ms | 224,781 B |
| 10k | 7.9 ms | 72.1 ms | — | 71.8 ms | 5.5 ms | 2.14 MiB |
| 100k | 89.7 ms | 726 ms | 129 ms | 779 ms | 55 ms | 21.4 MiB |

`steps` crossing PG→Node is the whole cost: 6.2 µs/row (779 − 157 ms ÷ 100k),
5× the scalar query. Pushing the Σ into SQL (`jsonb_array_elements`) saves
30% (517 vs 726 ms at 100k) but splits the tier rule across SQL and
`rowContribution` — not recommended, measured so nobody has to guess.
`select *` is 893 ms.

**2. Growth and payload.** Rows grow with users × sessions only. Measured
**224.8 B/row**; the spec's ~150 B INFERENCE was 50% low. At 5/week: 260
rows/yr → **58 KB**, 2,600 (10 yr) → **585 KB**, 100k → 21.4 MiB. gzip
would cut 6.4× (38.6 KB at 1k) but no compression middleware exists
(`grep compression app/package.json` → none; live `Accept-Encoding`
UNTESTED). Prod count on 2026-08-28: 16 rows. "No pagination in PR 1" is
defensible: the 10k-row user (38 years at 5/week) costs 78 ms server-side
and 2.1 MiB. **Trigger: any user > 5,000 rows** — the 1 MiB / ~40 ms line,
`select user_id, count(*) from session_logs group by 1 having count(*) > 5000`.

**3. Generated columns / composite index — neither reachable from this
shape.** Created `(user_id, logged_at desc, id desc)` at 1M: 425 ms, 56 MB.
The planner IGNORED it for the full-history read (743 vs 726 ms — noise)
because it fetches every row anyway; a composite pays only under `LIMIT`. A
covering index cannot carry `steps` (`INCLUDE` takes columns; steps is up to
77 KB), and the heap read is 35 ms of 129 — generated columns only help a
SERVER roll-up (`SUM ... GROUP BY`), which this spec deliberately does not
do. Both Wave E rows stay closed.

**4. Deletes.** No hazard. `stores.logs.delete` runs one tx (`FOR UPDATE` on
`plan_state`, then DELETE; `test_history.session_log_id ON DELETE SET NULL`,
`schema.ts:534`). Both stats reads are plain SELECTs (ACCESS SHARE) on
separate pool connections at READ COMMITTED; a delete landing between them
leaves the rows fetch without the row and the trend with its point — exactly
§14 ruling 4's steady state. INFERENCE on invisibility; PRIMARY on the schema
and store.

**5. Correctness.** The seed produced 0 `stored`-tier rows (70% machine /
30% steps); PR 1's fixture must include pre-RC-5 fused rows so the
`k ROWS PREDATE` count can go red.

**Not measured:** prod host; gzip on the live route; a 1M-row single user
(1M table, 100k user is the ceiling measured).

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
