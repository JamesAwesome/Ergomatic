<!-- DBA benchmark, 2026-09-07, dispatched by James ("Put a DBA agent on the columns question. If possible do real tests. I'm concerned about performance at scale"). Scripts that produced every number live beside this file in `2026-09-07-machine-summary-jsonb-vs-columns/`. Ruling: jsonb (A), James 2026-09-07 — the You-stats phase inherits the generated-columns escape hatch (ROADMAP open-item register). -->

# Phase LP §2.2 — jsonb keys vs four columns: measured

**Recommendation: A (jsonb keys on `machine_summary`), as the branch already has it — and the trigger for B is a correctness event, not a performance one. Move to columns the first time Phase PS wants a covering index over these numbers, because that is the one thing the jsonb shape cannot do.**

- **Performance never decides this.** At **1,000,000 rows** the detail read, the history page of 50, an indexed `avgWatts > 180` filter and an indexed `MAX(avgWatts)` are identical between shapes — every one ≤ 0.36 ms, both ways. Only aggregates differ.
- **The jsonb tax is ~0.6 µs per row scanned** in a `SUM`/`AVG`. Prod held 16 log rows on 2026-08-28; a rower would need roughly **170,000 rows of their own history in one query** before that reached 100 ms. At household scale (5,000 rows, 208 for the busiest user) it is **1.0 ms vs 0.5 ms**.
- **Storage is a rounding error:** +52 bytes/row on disk (142 MB vs 137 MB at 100k) and +76 bytes/row of WAL per insert. `machine_summary` **never gets TOASTed** — 0 bytes of TOAST across 1M rows of both shapes; the widest whole row is 1932 B, under Postgres's ~2032 B threshold.
- **The one real gap: `INCLUDE` takes columns, never expressions.** A covering index for a monthly roll-up must carry the whole 666-byte blob — **346 MB vs 48 MB**, and the 12-month cohort roll-up is **337 ms vs 53 ms**, per-user **20.0 ms vs 3.3 ms**. That is the X.
- **The risk that is not about speed:** nothing below `validateMachineSummary` enforces integer-ness. One string value in that key makes the naive aggregate 500 for that whole user **and makes the expression index permanently uncreatable** — both demonstrated. Variant B's `integer` column enforces range at the DB (it rounds a decimal rather than rejecting it).
- **Header room is fine:** the branch's maximum `machineSummary` serializes to **444 chars** against the 2048 cap (today's is 357) — 1604 chars spare.

**Flag, not a DBA call:** the merged spec §2.2 names four columns (`machine_calories`, `machine_avg_watts`, `machine_cal_per_hour`, `machine_rest_meters`); the branch stores jsonb keys. The deviation is recorded only in a code comment (`app/src/monitor/monitorRun.ts`, `MachineSummaryDetail`: _"These ride `machine_summary` jsonb — no column, no migration"_). It needs a spec amendment or a ruling either way.

<details>
<summary><b>Record (for agents and audits)</b></summary>

## Environment

| Item | Value |
| --- | --- |
| Postgres | `PostgreSQL 18.4 (Debian 18.4-1.pgdg13+1) on aarch64-unknown-linux-gnu` (`select version()`), the repo's pinned image (`compose.yml:5`, `image: postgres:18.4`) |
| Container | `docker run --rm -d --name erg-dba-pg -p 5434:5432 -e POSTGRES_PASSWORD=dev postgres:18.4` — **a laptop Docker container**, not prod-like hardware |
| Machine | Apple M5, 10 CPUs, 16 GiB (`sysctl machdep.cpu.brand_string hw.ncpu hw.memsize`); Docker Desktop 29.4.1 allocated 10 CPUs / 8.32 GB |
| PG settings | `shared_buffers` 128 MB, `work_mem` 4 MB, `jit` on, `default_toast_compression` pglz, `wal_compression` off — all stock (`pg_settings`) |
| Parallelism | every timing below run with `set max_parallel_workers_per_gather=0`, so the two shapes are compared on one CPU. Without it the planner picked different strategies for the two shapes and the comparison was not like-for-like (see "Why parallelism is off"). |
| Prod host | `docs/deploy.md` names the same compose file and image but states no RAM/CPU shape — **UNTESTED**. |
| Prod scale | 16 log rows on 2026-08-28 — **brief-supplied, not measured by me**. |

Schema applied by running every file in `app/drizzle/*.sql` in name order through `psql -v ON_ERROR_STOP=1`
(no `db:migrate` script exists in `app/package.json` — only `db:generate`; the server migrates at boot,
`app/server/index.ts:32`). Verified `\d session_logs` matches `app/server/db/schema.ts`, including
`session_logs_user_id_idx` and `session_logs_effort_check`.

## The two shapes

```sql
create table logs_a (like session_logs including all);          -- variant A, as the branch has it
create table logs_b (like session_logs including all);          -- variant B, the spec's §2.2 wording
alter table logs_b
  add column machine_calories integer,
  add column machine_avg_watts integer,
  add column machine_cal_per_hour integer,
  add column machine_rest_meters integer;
```

`INCLUDING ALL` copied both indexes and the CHECK (verified with `\di`); it does not copy foreign keys, so
no `users`/`workouts` rows were needed. `logs_b` is derived **from `logs_a`** by moving the four keys out of
the jsonb into the columns, so both tables hold byte-identical logical data:

```sql
insert into logs_b select l.<every column>,
  l.machine_summary - 'totalCalories' - 'avgWatts' - 'avgCalPerHour' - 'totalRestMeters',
  ..., (l.machine_summary->>'totalCalories')::int, (l.machine_summary->>'avgWatts')::int,
  (l.machine_summary->>'avgCalPerHour')::int, (l.machine_summary->>'totalRestMeters')::int
from logs_a l;
```

## Fixture realism

40 users; dates spread over 3 years; 70% `source='pm5'` rows carrying `machine_summary`, 30% timer/manual/
no-reading with `machine_summary IS NULL`. Every row carries 3–8 steps with the branch's real `LogStep`
keys (`app/server/stores/logs.ts`, `LogStep`): `label, targetSplit, actualSplit, actualSource, spm, meters,
seconds, avgHr, actualSeconds, actualMeters, actualSpm, machineCalories, machineCalPerHour, machineWatts,
machineDragFactor, machineRestHr`. `machine_summary` carries the nine real `MachineSummaryDetail` keys
(`app/src/monitor/monitorRun.ts`) — `avgStrokeRate, endingHeartRateBpm, avgHeartRateBpm, minHeartRateBpm,
maxHeartRateBpm, dragFactorAverage, workoutType, recoveryHeartRateBpm, avgPaceSecondsPer500m` — plus a
19-int `verificationBytes`, plus (variant A only) the four new keys. Generator: `02-gen.sql`.

## 1. Size and TOAST

100,000 rows (`vacuum analyze` first):

| | heap | indexes | TOAST heap | total |
| --- | --- | --- | --- | --- |
| A (jsonb) | 137 MB | 4936 kB | **0 bytes** | 142 MB (148,488,192 B) |
| B (columns) | 132 MB | 5072 kB | **0 bytes** | 137 MB (143,335,424 B) |

1,000,000 rows, shipped indexes only:

| | heap | indexes | TOAST heap | total |
| --- | --- | --- | --- | --- |
| A | 1367 MB | 44 MB | **0 bytes** | 1412 MB (1,480,441,856 B) |
| B | 1317 MB | 45 MB | **0 bytes** | 1362 MB (1,428,619,264 B) |

Delta 51,822,592 B / 1,000,000 rows = **51.8 bytes per row**.

Column widths (1M rows, 700,000 of them pm5):

| | `pg_column_size(machine_summary)` avg / max | `length(machine_summary::text)` avg / max | whole-row avg / max |
| --- | --- | --- | --- |
| A | **666 / 670** | 420 / 434 | 1346 / 1932 |
| B | **554 / 558** | 335 / 348 | 1279 / 1932 |

`steps` is identical in both: 656 B stored avg (1760 max), 1816 chars of JSON text avg (2646 max).

**Does `machine_summary` get TOASTed at ~600 bytes? No.** `pg_relation_size(reltoastrelid)` is `0` for both
tables at 100k and at 1M. The widest whole row is 1932 B, under Postgres's ~2032 B TOAST threshold, so
nothing goes out of line. Constructed worst case (200 steps — the route's own cap, `routes/data.ts:1855` —
every machine key set, 32 `verificationBytes`, all values at their band maxima):

```
steps_stored=1878  steps_text=77292  ms_stored=428  ms_text=502  row_bytes=2404
heap=8192 bytes    toast=8192 bytes
```

The row does exceed the threshold, and Postgres pushes out **`steps`** (the largest attribute); the
666-byte `machine_summary` stays inline even then. So the four extra keys never move a byte into TOAST.

## 2–3. The app's real reads (1M rows, 25,000 for the benchmarked user, all indexes present)

Median of 5 warm runs (run 1 discarded), one psql session per query, `\o /dev/null`, `\timing on`.
Harness: `bench.sh`, queries transcribed from `app/server/stores/logs.ts` in `queries.sh`.

| Query | A (jsonb) | B (columns) |
| --- | --- | --- |
| **detail read** — `get()`: `select * where user_id and id` | 0.142 ms | 0.123 ms |
| **history LIST** — `LOG_LIST_COLUMNS` + the `avgPaceSecondsPer500m` jsonb-path read + the `partial` EXISTS predicate, `order by logged_at desc, id desc limit 50` | 0.357 ms | 0.232 ms |
| **history LIST + the four new numbers** projected into the list too | 0.220 ms | 0.243 ms |
| **`MAX(avgWatts)`** for one user, with its index | 0.124 ms | 0.098 ms |
| **filter** `avgWatts > 180` for one user, with its index | 0.115 ms | 0.118 ms |

All five are inside run-to-run noise. Note the third row: if History ever renders these numbers, adding
four jsonb-path projections costs nothing measurable.

Without the composite `(user_id, logged_at desc, id desc)` index the LIST is 39.0 ms (A) / 41.7 ms (B) —
that index, not the storage shape, is what the history page depends on, and it is **missing today**
(`schema.ts` has only `session_logs_user_id_idx`).

## 4. Aggregates a personal-stats phase would run

Indexes built for the test:

```sql
create index la_list  on logs_a (user_id, logged_at desc, id desc);
create index lb_list  on logs_b (user_id, logged_at desc, id desc);
create index la_watts on logs_a (user_id, ((machine_summary->>'avgWatts')::int));  -- expression index
create index lb_watts on logs_b (user_id, machine_avg_watts);                      -- plain btree
create index lb_cover on logs_b (user_id, logged_at) include (machine_calories, machine_avg_watts);
create index la_cover on logs_a (user_id, logged_at) include (machine_summary);     -- the only A can build
```

**Index sizes at 1M rows** (`pg_relation_size` per `pg_stat_user_indexes`):

| index | A | B |
| --- | --- | --- |
| list `(user_id, logged_at desc, id desc)` | 56 MB | 56 MB |
| watts (expression / column) | 7000 kB | 7000 kB |
| **cover for the roll-up** | **346 MB** | **48 MB** |
| total indexes on the table | 446 MB | 155 MB |

`INCLUDE` accepts columns only, never an expression — so A's covering index has to carry the whole
`machine_summary` jsonb. That is the 7.2× gap.

**Timings, median of 5, with the covering index:**

| Aggregate | A | B | ratio |
| --- | --- | --- | --- |
| per-user, monthly `SUM(calories)` + `AVG(watts)`, last 12 months (24,334 rows) | **20.0 ms** | **3.3 ms** | 6.1× |
| whole-cohort, same roll-up, last 12 months (331,419 rows) | **337 ms** | **53 ms** | 6.3× |
| per-user `MAX(avgWatts)` (uses the watts index) | 0.124 ms | 0.098 ms | — |

Without any covering index (list index only), the cohort roll-up is 414 ms (A, with the repo's
`jsonb_typeof` guard) / 266 ms (B).

**Why: the plan, not just the parse.** `EXPLAIN (ANALYZE, BUFFERS)` on the cohort roll-up:

```
A:  GroupAggregate
      ->  Sort  ... width=674 ... Sort Method: external merge  Disk: 91952kB
            ->  Index Only Scan using la_cover on logs_a  (rows=331419) Heap Fetches: 0
    Execution Time: 415.916 ms

B:  HashAggregate  Batches: 1  Memory Usage: 545kB
      ->  Index Only Scan using lb_cover on logs_b  (rows=331419 width=16) Heap Fetches: 0
    Execution Time: 66.991 ms
```

Both get an index-only scan. The aggregate's input tuple is **674 bytes wide in A and 16 bytes in B**,
because `(machine_summary->>'avgWatts')::int` is evaluated at the Aggregate node, so the whole jsonb has
to be carried into it. At default `work_mem` A therefore spills 92 MB to disk. **Forcing the same plan
does not close the gap** — with `work_mem='256MB'` A also gets a `HashAggregate` with no spill and still
runs **256 ms vs B's 55 ms**, so ~190 ms of the difference is pure jsonb parse-and-extract CPU over
331k rows ≈ **0.6 µs per row**.

**Scale curve (per-user roll-up, same query, varying row count):**

| rows in the query | A | B |
| --- | --- | --- |
| 208 (one user, household-scale 5,000-row table) | **1.0 ms** | **0.5 ms** |
| 5,000 (whole household-scale table) | 2.4 ms | 1.5 ms |
| 16,688 | 42.7 ms | 5.4 ms |
| 24,334 | 41.2 ms | 9.4 ms |
| 41,003 | 68.5 ms | 8.2 ms |
| 331,419 (cohort) | 337–414 ms | 53–266 ms |

Extrapolating the measured 0.6 µs/row: **~170,000 rows in a single query before the jsonb shape costs
100 ms more than columns.** At the household cohort's real rate that is not reachable this decade.

**The `jsonb_typeof` guard the repo already uses costs little:** per-user roll-up, guarded 14.8 ms vs
naive 11.7 ms (same run, no cover index).

## 5. Write cost

1,000-row set-based insert of a full realistic pm5 row, median of 5:

| | time |
| --- | --- |
| A insert ×1000 | 23.8 ms |
| B insert ×1000 | 27.6 ms |
| A update ×1000 (`machine_summary \|\| jsonb_build_object(...)`) | 24.1 ms |
| B update ×1000 (`set machine_calories=…, …`) | 12.4 ms |

Insert is noise; the jsonb **update** is ~2× the column update. There is no update path for these fields
in the app (`routes/data.ts` patches only held/effort/thumbs/notes — the spec §2.3 says so and the code
agrees), so that row is informational.

**WAL, measured exactly with `EXPLAIN (ANALYZE, WAL)`.** First attempt used `pg_current_wal_lsn()` deltas
and was worthless — full-page images swamped it and one pass reported literally `0 bytes`. Redone with
`alter system set full_page_writes = off; select pg_reload_conf();` (confirmed `show full_page_writes` →
`off`), which removes FPI entirely, and with the covering indexes dropped so the index shape does not
confound the row shape:

| | WAL bytes / 1000 rows | per row |
| --- | --- | --- |
| A insert | 1,623,564 | **1624 B** |
| B insert | 1,547,890 | **1548 B** |
| A update (4 fields) | 1,883,720 | 1884 B |
| B update (4 fields) | 1,771,745 | 1772 B |

**+76 bytes of WAL per insert** for A. `full_page_writes` was reset (`alter system reset`, reload,
`show` → `on`) before the final timings.

With A's `INCLUDE (machine_summary)` covering index present, A's insert WAL rises to 2132 B/row vs B's
1660 B/row — the extra ~470 B is that index writing a 670-byte entry per row. Another cost of the
covering index A cannot build cheaply.

## 6. Non-performance factors

**NULL semantics.** Both shapes collapse "key absent" and "explicit JSON null" into SQL `NULL`, and both
preserve `0` as a value — the app's stated rule holds either way. Measured:

```
absent_is_null=t  jsonnull_is_null=t  zero_reads_zero=0  absent_key_exists=f  null_key_exists=t
```

Variant A can additionally distinguish absent from explicit-null with `machine_summary ? 'totalCalories'`,
which B cannot (a NULL column is a NULL column). Nothing in the branch needs that distinction — the client
type is `totalCalories?: number` and the driver never writes an explicit null.

**Type safety — the real asymmetry.** jsonb numbers are `numeric` and jsonb accepts any type at all. The
DB enforces nothing; `validateMachineSummary` (`app/server/routes/data.ts:951-981`, integer + `0..65535`
for the three counts, `0..1_000_000` for rest metres) is the **only** enforcement in variant A.
Demonstrated consequences of one bad value:

```sql
-- accepted by the column, no error:
insert into logs_a (... machine_summary) values (..., '{"avgWatts":"one sixty two","totalCalories":162.4}');

-- (a) the naive aggregate now errors for that user's ENTIRE history:
select sum((machine_summary->>'avgWatts')::int) from logs_a where user_id=...;
ERROR:  invalid input syntax for type integer: "one sixty two"

-- (b) the expression index can no longer be created AT ALL:
create index la_watts on logs_a (user_id, ((machine_summary->>'avgWatts')::int));
ERROR:  invalid input syntax for type integer: "one sixty two"

-- (c) with that index already in place, the INSERT itself fails with the same 22P02 —
--     i.e. a rower's save 500s instead of 400ing at the validator.

-- (d) the repo's jsonb_typeof guard survives the read, but silently drops the value —
--     and does NOT catch a non-integer NUMBER: 162.4 guarded-casts fine.
```

Variant B for comparison: `machine_avg_watts` given `162.4` **silently rounds to 162** (Postgres assignment
cast), and `3000000000` raises `ERROR: integer out of range`. So B enforces range and integer storage at the
DB; it does not reject a decimal, it rounds one.

**The 2048-char cap** (`MACHINE_SUMMARY_MAX_BYTES`, `routes/data.ts:912`, measured as
`JSON.stringify(raw).length`). Computed in Node over the real key set:

| shape | chars | headroom |
| --- | --- | --- |
| 9 keys + `verificationBytes[19]` (today, typical) | 305 | 1743 |
| 9 keys + `verificationBytes[32]` (today, max) | 357 | 1691 |
| 13 keys + `verificationBytes[19]` (branch, typical) | **392** | 1656 |
| 13 keys + `verificationBytes[32]`, all four at band maxima (branch, absolute max) | **444** | **1604** |

The four keys cost 87 chars. The cap is not remotely at risk.

**Drizzle compile-time safety.** `machineSummary: jsonb("machine_summary")` carries no `.$type<>()` binding
(`schema.ts`, and its own comment says so), so Drizzle infers `unknown`; `LogInput.machineSummary` is hand-
typed `Record<string, unknown> | null` (`stores/logs.ts`). Key access therefore returns `unknown` and a
**misspelled key name compiles clean** — in TypeScript and in the SQL string of a `->>` path alike. The
client's view of those keys (`src/log/storedSummary.ts`) is a hand-written mirror of
`MachineSummaryDetail`, which is exactly the RF11 drift class. Variant B's `sessionLogs.machineCalories`
is a typed column: a typo fails `tsc`. **This favours B and is not a performance argument.**

**Migration / deploy ordering.** A needs no migration, which also means it cannot collide with a parallel
branch minting the same Drizzle index (the briefing's timestamp-ordering trap) and cannot hit the
rewritten-migration hash problem. Server deploys first (`docs/deploy.md`), so under the normal order
neither shape has an old-client hazard. Out of order: a new client against an **old** server stores the
four keys **unvalidated** under A (the old `validateMachineSummary` size-caps and checks
`verificationBytes` only, and jsonb accepts unknown keys), whereas under B the old route ignores the
unknown body fields and the numbers are **silently lost**. Both are recoverable-by-nothing; A loses
validation, B loses data.

**Precedent.** Three sibling session-level machine fields already live as `machine_summary` keys and are
already read by jsonb path in production code: `avgPaceSecondsPer500m` (projected in `LOG_LIST_COLUMNS`
with the `jsonb_typeof` guard), `avgStrokeRate` and `workoutType` (read in
`app/server/concept2/mapping.ts` as `row.machineSummary?.avgStrokeRate` / `?.workoutType`). Variant A is
the consistent choice; variant B would make these four the odd ones out unless the siblings move too.

## Why parallelism is off in every timing

The first 100k run (parallelism default) had A's cohort roll-up *faster* than B's — 14.8 ms vs 20.7 ms.
`EXPLAIN` showed why: A's 673-byte estimated row width pushed the planner to a `Gather Merge` with 2
workers, while B's 16-byte width fitted a single-threaded `HashAggregate`. Three CPUs beat one, and the
comparison said nothing about the shapes. Every number in this report was re-taken with
`max_parallel_workers_per_gather=0`.

## Files

All in this directory: `01-setup.sql` (variant tables), `02-gen.sql` (generator), `03-sizes.sql`,
`04-indexes.sql`, `05-writes.sql` / `06-writebench.sql` (the discarded LSN-delta attempt),
`07-wal.sql` / `08-wal-ins.sql` (the `EXPLAIN (ANALYZE, WAL)` measurements), `queries.sh` (every query
under test), `bench.sh` (median-of-5 harness), `run-queries.sh`, `explain.sh`.

## Not measured

- Prod host CPU/RAM — `docs/deploy.md` states neither. **UNTESTED.**
- Concurrency: no measurement of these shapes under concurrent load. **UNTESTED.**
- Network/serialization cost of the detail read to a phone over a real link. **UNTESTED** (the psql
  numbers include server→client transfer to a local socket only).
- Whether Phase PS will actually aggregate these four numbers; the ROADMAP's PS entry names no queries
  (it names a live hazard about `distance_meters` fused-vs-work-only semantics instead).
