# DBA ledger

The dated per-engagement record for the `dba` agent, one section per
engagement. **Not read up front** — the bounded, always-read half is
`dba-techniques.md`, and an entry is proposed to both. Grep this file for the
numbers behind a technique, the environment a measurement was taken in, or
the history of a table you are about to judge again. Every number here
carries the command that produced it; a section without commands is not a
DBA entry.

## 2026-09-13 — Apple account-access policy query and lock gate

**PASS, new policy scope only.** Five synthetic users/25 sessions ruled:
every path remains a point lookup. At 100k synthetic users/1m sessions,
session resolution measured 0.011 ms, baseline vs widened original-session
lookup 0.008 vs 0.006 ms, Google/Apple subject lookups 0.008/0.009 ms,
and the saved-email-preserving legacy upsert 0.020 ms. These are medians
of five warm PostgreSQL execution times, discarding run 1. Existing unique
and primary-key indexes served every stress query; no schema, migration,
new index, bulk API or workout-log scan was added.

Postgres 18.4 Debian aarch64; Docker Desktop 29.4.1, 10 CPUs/8.32 GB;
Apple M5 host, 10 CPUs/16 GiB. Settings: shared buffers 128 MB, work memory
4 MB, JIT off, parallel gather workers 0. The widened unqualified
`FOR UPDATE` locks one matched user in addition to its session; 250 ms
lock-timeout probes blocked writes to that user/session while another user
remained writable. A held-user probe showed the session was locked first.
Production scale, throughput and whole-transaction lock duration are untested.

Commands, exact SQL, measurements and limitations are in the
[report](../../docs/superpowers/research/2026-09-13-access-mode/db-cost.md)
and its linked evidence archive. This does not complete the original Apple
implementation's outstanding DBA PR gate.

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

## 2026-09-12 — Phase PS PR 1 PR gate, the SHIPPED `statsRows()`

**Verdict: PASS.** The shipped query's `.toSQL()` on the merged tree
`cfc06cb7` is byte-identical to the plan pass's (the unaliased `case when`
for `totalCalories`, no `ORDER BY`, no `LIMIT`), so the plan-pass numbers
stand: 1k rows 8.38 ms / 9.5 ms over HTTP / 224,781 B; 10k rows p95
90.8 ms / 2,248,115 B; 100k rows 943 ms / 22,481,319 B.

- No migration, schema or index change:
  `git diff origin/main...HEAD -- app/drizzle app/server/db` is empty.
- 1 + 1 statements per request — the route's own select plus
  `resolveSession`'s (INFERENCE from source: `app/server/auth/sessions.ts:44`
  under `requireUser`); constant, no N+1.
- The user filter and the `jsonb_typeof` poison guard are gated on real
  Postgres by the new `statsRows` contract case
  (`server/stores/contracts/storeContracts.ts`, `contracts.real.integration`);
  the route's integration test runs 1/1 in 1.68 s.
- The protocol scripts are present under
  `docs/superpowers/research/2026-09-12-stats-rows/` with the `BENCH_PRE`
  fix in `bench.sh`.
- Nit: the research `README.md` carries no results table — the numbers live
  in the `.txt` outputs beside it.
- Untested: the prod host, the prod row count, a 1M-row single user, TLS.

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

## 2026-09-12 — Wave A Apple-auth spec pass

**FAIL on the draft.** Provider columns held, but grant/attempt columns,
predicates, indexes, atomic completion, cleanup and rollback were underdefined.
Anonymous attempts grow with public requests rather than users; TTL bounded
authority but neither row count nor physical retention. Required exact named
constraints, atomic create/link consumption, no network I/O under DB locks,
admission and resident-row bounds, and separate validity/deletion lifetimes.
No prescribed SQL existed, so latency, locks, WAL and index size were unmeasured.
The author folded these contracts into the corrected spec; the implementation
plan owes measurement of auth tables, not unrelated session-log volume.

Evidence: `docs/superpowers/specs/2026-09-12-apple-signin-review.md`; corrected
spec and rendered Gate 0 approved by James on 2026-09-12. No rerun PASS claimed.

## 2026-09-13 — Wave A Apple sign-in plan measurement

**PASS on corrected `299a31d3`; original `82fb92cb` FAILED held-lock concurrency.**
Source fingerprints and every command are in
`docs/superpowers/research/2026-09-13-apple-db-measurement/report.md`; original
and corrected source snapshots, raw JSON plans, scripts and an archive manifest
live beside it. Follow that directory's README for the pinned replay inputs.

PostgreSQL 18.4 Debian/aarch64 on Apple M5, 10 logical CPUs, 16 GiB RAM;
work_mem 4 MB, shared_buffers 128 MB, JIT on, parallel gather 0. WAL comparisons
used full-page images off and restored them on; the capped-row trial kept the
default. Synthetic scales: 5/1k/100k/1M users, sessions, grants and links, each
with 511 live anonymous attempts. Household plus the anonymous cap decides the
cost ruling; production traffic/hardware remain unmeasured.

The actual query capture found admission COUNT also scans links (0.040 to
36.958 ms). Identity queries use their unique/PK indexes at scale. Original
claim versus same-session link replacement deadlocked with 40P01 after
1018.197 ms; session-first `bound()` made the identical held-order probe's two
operations fulfill in 12.431 ms. Held session revocation rejects; a concurrent
subject winner retains its exact ID/profile; slot 512 makes a competing begin
reject `rate_limited` with exactly 512 rows.

Migration 0031 users-lock bracket: 80.556–80.928 ms at 1M users. The prior
server booted against the migrated schema and an Apple-only row with health200,
which does not remove the activation-dependent authentication floor. No competing
open PRs were observed. At the deciding scale, begin+cancel was 2.122 ms and
returning begin→claim→accept 4.747 ms; no additional index was recommended.
The full 512 pending-confirmation cap with 8192-character synthetic refresh
tokens occupied 5,177,344 B total relation. No ROADMAP row proposed. This is the
plan gate; the final PR still owes measurement against its shipped source.

## 2026-09-13 — Apple failure-discard plan delta

**PASS for the plan delta, not final-PR signoff**, committed candidate259882ba1087b6ad853159b19799b2358fbf3905; attempts SHA256d8df3812f5b4bb6e29256f3ced465616f3b0cf3b9d51582b6a90657772a88980. Diff from prior299a31d3 is exactly one new conditional DELETE; prior migration/schema/index and session-first query measurements remain inherited by byte identity.

| Environment | Value |
|---|---|
| Container / PG | apple-dba-discard-pg / PostgreSQL18.4 Debian aarch64 |
| Host | Apple M5,10CPUs,16GiB |
| Query settings | work_mem4MB,shared_buffers128MB,jit on,parallel gather0,WAL FPI off then restored |
| Scale | 5users;512anonymous attempts plus5/1k/100k/1M links with matching sessions; smallest full-anonymous-cap fixture rules |

Real discard-call medians under benchmark rollback transactions: matching signup0.310/0.276/0.351/0.290ms; matching link0.281/0.261/0.358/0.261ms. The actual index is state_unique, despite a PK predicate. Matched/stale WAL54/0B; warm matching buffers4–5, stale3–4. Held real accept→COMMIT protects confirm/version3+grant and target_authorize/version3 from stale discard; the old id/hash/surface cleanup fails the exact gate; pinned original rerun passes. Holding the parent session does not block child discard (0.569ms), and the original claim-versus-replacement deadlock reproducer still fulfills both operations (13.048ms).

Commands and complete SQL/EXPLAIN/held outputs are in `docs/superpowers/research/2026-09-13-apple-db-discard/report.md`, `measure.ts`→`measure.json`, `held.ts`→`held.json`/`held-mutant.json`, and `original-deadlock-replay.ts`→JSON. Run with Node26 `pnpm exec tsx /tmp/apple-dba-discard/<script>.ts` from candidate app, using the report's isolated postgres:18.4 command and the pinned source snapshot. The original scripts and raw artifacts are archived beside the report with a SHA256 manifest and replay prerequisites. No ROADMAP row; final integrated-head fingerprint, caller/gate and migration-competition checks remain owed.

## 2026-09-13 — Session expiry sweep review fix

**PASS after correcting the fixture; no index or migration.** PostgreSQL 18.4 Debian/aarch64, dedicated 2 CPU/1 GiB container, Apple M5 host; all 32 migrations applied; query JIT off/parallel gather 0. The original 6.421 ms fixture omitted `auth_attempts.original_session_id ON DELETE CASCADE` and remains parent-core evidence only. Actual schema, median of 5 warm: household 5 expired/25 sessions +25 links +511 anonymous attempts **0.170 ms**; sensitivity 10k expired/100k sessions +100k links +511 anonymous **29.290 ms**, including one `auth_attempts_link_session_unique` child probe per deleted parent (committed trigger 22.082 ms/10k calls; total WAL 1,124,048 B by LSN). The next 90k-live minute scan was 2.628 ms/1,819 pages. Committed deletion retained all live parents/links and anonymous rows, removed every expired parent's link, and left zero orphans. Held parent DELETE locked both tables/indexes; retained parent/child/anonymous updates succeeded, deleted parent/child updates timed out at 250 ms. A single concurrent-owner 100k probe completed both sweeps with zero expired/orphan rows and no observed deadlock. Full evidence: `docs/superpowers/research/2026-09-13-apple-review-fixes/db-cost/cascade/`. Production and >100k remain unmeasured; no ROADMAP row.

## 2026-09-13 — Apple front door, PR #425 `wave-a-apple` @ `4f9b8d66` (stored-shape PR gate)

**PASS WITH ROWS. The household fixture decided it.** Closes the gate the
spec-stage entry left FAILing ("neither row count nor physical retention") and
the access-policy entry explicitly did not complete.

Environment: `postgres:18.4` in Docker, `PostgreSQL 18.4 (Debian) aarch64`,
`work_mem=4096kB`, `statement_timeout=0`, `lock_timeout=0`, autovacuum on /
naptime 60 s; `set jit=off; set max_parallel_workers_per_gather=0` per session;
all 32 `app/drizzle/*.sql` applied in order; medians of 5 after discarding run 1.

**Hot paths, household → 100k → 1M.** `begin()` serialised section
**0.344 → 13.601 → 221.351 ms**; resident cap `count(*) … purpose='signin'`
0.086 → 9.136 → 63.092 ms (**Seq Scan at every scale** — no index on
`purpose`); attempt sweep 0.069 → 5.494 → 151.667 ms. At 1M: `load()` 0.049 ms,
`save()` 0.195 ms, link delete 0.140 ms (the PARTIAL index is used),
`resolveSession` 0.126 ms. The new allowlist check is IN PROCESS and adds zero
queries. `auth_attempts_state_unique` is never queried in SQL.

**Retention.** Structurally bounded: 512 live signin rows + one link row per
live session + one sweep window. 3 × 20,000 real cycles: heap truncated to
**0 bytes**, and round 3 added **zero** index bytes — the earlier growth was
btree recycling lag. Plateau ~13 MB. Autovacuum needs no tuning.

**Migration 0031.** Additive, one drizzle transaction (so CONCURRENTLY is
unavailable): total **3.312–6.074 ms at 5 users**, 90 ms at 1M, of which the
unique index build is 0.138–0.267 / 87 ms. `ADD COLUMN apple_sub` is
metadata-only. Holds `AccessExclusiveLock` on `users` for the transaction; a
concurrent `resolveSession`-shape read hit a 2 s `lock_timeout`. Older image
boots against the migrated DB. `users_apple_sub_unique` is NULLS DISTINCT.

**Statement census against the SHIPPED store** (`log_statement='all'`): new
account 15 data statements / 4 pooled transactions; returning account 12 / 3.
**No N+1.** Full integration suite green: 28 files, 469 tests, exit 0.

**Three rows proposed.** R1: the cap scans link rows under the global advisory
lock, trigger ~1.4M rows. R2: a 3 s pool timeout disables sign-in for up to
60 s after recovery and `healthy()` has no consumer, so `/api/health` stays 200
— reproduced end to end. R3: the boot diagnostic gated the health port with no
statement timeout — **fixed in this PR rather than filed**, together with a
node-postgres defect the fix itself exposed (a multi-statement `SET LOCAL`
string returns an array, so the bounded query read `undefined` and reported a
silent zero; corrected to an explicit transaction and verified against a real
container: timeout fires at 5004 ms, pool survives).

Handed to other agents: plaintext `apple_refresh_token` at rest (antagonist /
code review) and `original()`'s `FOR UPDATE` with no `OF` clause locking
`users` (code review).

**Unmeasured:** production host CPU/RAM, real production row counts (these
tables have never held one), the Apple provider round trip, and whether a real
Apple refresh token approaches the 8192-char bound.

## 2026-09-14 — Wave A PR1 Task 1, migration 0032 `auth_attempts` delete purpose (stored-shape PR gate)

**PASS.** Widens three CHECK constraints on `auth_attempts` (`purpose`, `stage`,
`session`) to admit a `delete` attempt and its `delete_ready` stage. No new
table, no new index, no column added.

Environment: `postgres:18.4` (Debian aarch64) in Docker Desktop, Apple M5 host,
10 CPUs/16 GiB; stock `shared_buffers=128MB`, `work_mem=4MB`; all 33
`app/drizzle/*.sql` applied via `psql -v ON_ERROR_STOP=1`; single runs
(deterministic DDL, not sampled).

**Migration timing/lock**, 3xDROP + 3xADD CONSTRAINT CHECK in one transaction:
**2.268 / 16.999 / 116.971 ms** at 1k / 100k / 1M rows. `AccessExclusiveLock` on
`auth_attempts` for the whole transaction, confirmed via `pg_locks` against a
held transaction; a concurrent INSERT with `lock_timeout=500ms` was refused
while held. Deploy is restart-based (`docker compose up -d --build --wait`), not
rolling, so no live old instance runs against the mid-migration schema.

**Additive/backward-compatible**: old-shape inserts (`signin`/no-session,
`link`/differing-providers) succeed unchanged against the widened schema — no
`docs/RELEASING.md` rollback row needed. This matters for `deploy.sh`'s ERR-trap
rollback, which rebuilds the OLD image against the ALREADY-migrated database.

**Delete-arm admit/refuse matrix** (9 direct inserts, not the app's suite):
admits `signin` (old shape), `link`/differ, and `delete` with session +
existing_provider present **regardless of whether `existing_provider` equals
`target_provider`**; refuses `link`/equal (unchanged), `delete`/null session,
`delete`/null existing_provider. **Finding, handed to Task 3, not a blocker
here**: the delete arm does not enforce `existing_provider = target_provider` at
the DB layer despite the code comment's "by design" equality. That invariant is
100% application-layer. Pre-existing in kind, not a regression — `stage`/`purpose`
pairing was never DB-enforced either.

**Read path (Task 3, not yet built)**: `SELECT id FROM sessions WHERE user_id=$1
ORDER BY id FOR UPDATE` is already served by the pre-existing
`sessions_user_id_idx` — `Bitmap Index Scan`, 0.109 ms at 1,050 sessions and
0.098 ms at 1,000,000. **No new index needed.**

**Unmeasured**: production host CPU/RAM; per-row WAL cost of a future
`delete`-purpose insert (inferred identical to `link`'s, since no column or index
changed); Task 3's actual code, which does not exist yet.

## 2026-09-14 — Wave A PR2 plan gate: widening the signin arm of `auth_attempts_session_check`

**Verdict: FAIL.** The proposed predicate refuses the state the plan's own
Task 2 produces. Every cost measured clean; the failure is correctness at one
row, not cost at any row count.

| | |
|---|---|
| Container | `docker run --rm -d --name erg-dba-pg -p 5434:5432 -e POSTGRES_PASSWORD=dev postgres:18.4` |
| Version | `PostgreSQL 18.4 (Debian 18.4-1.pgdg13+1) on aarch64-unknown-linux-gnu` |
| Machine | Apple M5, `hw.ncpu` 10, `hw.memsize` 17179869184 (laptop; prod host CPU/RAM untested) |
| Settings | `work_mem` 4096 kB, `shared_buffers` 16384x8kB, `jit` on, `lock_timeout` 0, `statement_timeout` 0, `deadlock_timeout` 1000 ms, `max_parallel_workers_per_gather` 0 for the write bench |
| Schema | all 33 `app/drizzle/*.sql` applied in name order, `psql -v ON_ERROR_STOP=1` |
| Target | plan `docs/superpowers/plans/2026-09-14-wave-a-pr2-follow-through.md` rev 2, "The design" + Task 0 |
| Timings | median of 5, run 1 discarded, one psql session per label |

### Blocking 1 — the predicate refuses the design's own middle state

Task 0 Step 1's four cases all behave as the plan expects (admit / admit /
refuse 23514 / refuse 23514). A fifth, unenumerated case is the design's:
`signin` at `reauth_authorize` with `existing_provider` SET and
`original_session_id` NULL is refused 23514, both as an INSERT and by `save()`'s
UPDATE statement text applied to a real `confirm` row (corrected at the revision
3 re-gate: `followThrough` does not exist yet, so the original entry's
attribution to it was wrong; the measurement itself is sound).

`attemptProvider()` reads `existing_provider` at every `reauth_*` stage, and
FOUR `frontDoorRoutes.ts` call sites use it at `reauth_authorize` (`:101`,
`:130`, `:307`, `:358` — corrected at the revision 3 re-gate; the original
entry said three) -- while the
rower is at their usual provider's consent screen, before any session can
exist. The plan's "two-state arm, never one without the other" is a three-state
design.

Two corrected predicates measured. **Variant B** (delete
`original_session_id is not null and` from the second disjunct): all five cases
correct, but admits `reauth_authorize` with `existing_provider` NULL
(`UPDATE 1`), where `attemptProvider()` returns `null`. **Variant C,
recommended** (stage-keyed three-state arm): all five correct AND refuses both
states B admits (`reauth_authorize` with a session already adopted; `confirm`
with `existing_provider` set -- both 23514).

Variant C's ordering prescription, measured, because CHECKs evaluate per
statement and `save()` writes neither column:

| write | result |
|---|---|
| `SET stage='reauth_authorize'` alone | 23514 |
| `SET stage='reauth_authorize', existing_provider='google'` | `UPDATE 1` |
| `SET original_session_id=...` alone at `reauth_exchanging` | 23514 |
| `SET original_session_id=..., stage='link_ready', reauthenticated_at=now()` | `UPDATE 1` |

### Blocking 2 — the machine still refuses `signin@link_ready`

Through the real `createAttempts(...).read()` against real Postgres:

    signin@confirm            -> READ OK           <- control
    signin@reauth_authorize   -> THREW attempt_expired
    signin@reauth_exchanging  -> THREW attempt_expired
    signin@link_ready         -> THREW attempt_expired

Then `consistent()` extracted verbatim with ONLY the plan's Task 1 Step 3 edit
applied (widening the `signup` array): the first three PASS and
`signin@link_ready` STILL THROWS, refused by the separate
`((a.stage.startsWith("target_") || a.stage === "link_ready") && a.purpose !== "link")`
clause -- the one added to close RF34's mirror case. Task 1 names two
`consistent()` edits; three are needed, and without the third, Task 3 Step 7's
falsification test would read as the design's central claim failing.

### Lock behaviour

`BEGIN; DROP CONSTRAINT; ADD CONSTRAINT; COMMIT;` x6, median of 5:

| rows | heap | BEGIN | DROP | ADD | COMMIT | txn |
|---|---|---|---|---|---|---|
| 513 (realistic) | 64 kB | 0.036 | 0.080 | 0.164 | 0.284 | **0.564 ms** |
| 1,000 | 120 kB | 0.039 | 0.121 | 0.256 | 0.169 | 0.585 ms |
| 100,000 | 12.0 MB | 0.041 | 0.102 | 4.924 | 0.168 | 5.235 ms |
| 1,000,000 | 120 MB | 0.046 | 0.118 | 49.211 | 0.250 | 49.625 ms |

`AccessExclusiveLock` (from `pg_locks` inside the transaction). With it held, a
second connection at `lock_timeout='500ms'` was refused on **both** `INSERT` and
`SELECT count(*)`. `ADD` scans at ~49 us/1,000 rows; `DROP` is flat. Against
`deploy.sh`'s `--wait-timeout 120`, the realistic figure is 0.0005%.

The ADD validates: one row of each of the 11 states the shipped machine can
produce (3 signin, 5 link, 3 delete) validated clean under both predicates; a
deliberate bad row gave `check constraint ... is violated by some row` and
aborted the transaction. No competing migration index (`gh pr list --state
open` -> `[]`).

### `auth_attempts_link_session_unique`

Direct collision reproduced: a `link` attempt on a session already held by a
signin follow-through gives `duplicate key value violates unique constraint`.
**No legitimate flow can hit it** -- `mintSession` inserts a fresh session
inside the adopting transaction, so nothing else can name it.

The NEW exposure is the reverse: `begin()`'s pre-sweep
(`DELETE FROM auth_attempts WHERE original_session_id=$1`) now silently deletes
an in-flight signin follow-through when the rower starts a link or delete from
the adopted session. And the FK's `ON DELETE CASCADE` makes signout and the
expiry sweep reach a signin attempt for the first time.

Worst case (all 512 signin rows in the follow-through state):
`link_session_unique` 8,192 -> 32,768 B; table total 160 kB -> 200 kB.

### Deadlock probe (held transaction on one connection, never a race)

| interleave | result |
|---|---|
| delete first, follow-through second | `INSERT INTO sessions` blocked **6,473 ms**, then 23503 on `sessions_user_id_users_id_fk` |
| follow-through first, delete second | `deleteAccount`'s `original()` blocked **6,458 ms**, then completed; the delete cascaded away the adopted session and attempt |
| RF21 control: deliberate reverse order, same two rows | `ERROR: deadlock detected` |

No deadlock is available: the adopter locks attempt-then-users (`bound()` skips
`original()` while `original_session_id` is NULL), the deleter locks
sessions-then-users-then-attempts, and the adopter's uncommitted session is
invisible to the deleter -- a wait, never a cycle. But 23503 is unmapped:
`transaction()`'s catch converts only 23505 on the two subject uniques, so the
rower gets a 500 where `account_changed` is correct. Both `lock_timeout` and
`statement_timeout` are 0, so the 6.5 s figures are the probe's own `pg_sleep`,
not a ceiling.

### Rollback

PRIMARY, `drizzle-orm/pg-core/dialect.js`: the migrator selects
`order by created_at desc limit 1` and applies only
`Number(lastDbMigration.created_at) < migration.folderMillis`, so an older image
against the migrated database applies nothing and boots. The widened CHECK is
strictly more permissive for every shipped state (validated). **No
`docs/RELEASING.md` floor row owed**; the 0031 Apple row remains the floor. A
hand-written narrowing ABORTS while a widened row is live and succeeds after the
expiry sweep -- loud, never lossy. Old image reading a widened row:
`consistent()` throws `attempt_expired` on a 5-minute row. **What a revert
cannot undo:** the minted session at its 30-day TTL, and `users.apple_sub` if
`finalize()` ran.

### Write cost

100k INSERTs per predicate, interleaved over two rounds, median of 5:
shipped 450.314 / 519.386 ms, plan's 478.752 / 504.306, variant C 457.296 /
523.217. Unresolvable; upper bound <1 us/row. A first NON-interleaved pass read
365.870 vs 428.997 ms and would have published a fabricated +0.63 us/row.

### Which scale ruled

The household, and specifically the CAP. `auth_attempts` is 160 kB at its
structural ceiling (512 signin + one per live session) and the migration is
0.56 ms of exclusive lock there. 1k/100k/1M were the ceiling and decided
nothing.

### Could not establish

Production `auth_attempts`/`sessions` counts (no prod access; the cap bounds
them). Prod host CPU/RAM (untested). The per-insert CHECK cost (below the noise
floor). Staging's `ACCESS_MODE` -- the plan's own open item, and the PM's.

### Re-gate on revision 3 (2026-09-14)

**PASS WITH ROWS.** Same container recipe. The rev-3 predicate written out in
full (signin arm replaced, `link`/`delete` arms verbatim from
`0032_account_delete_purpose.sql`), applied to the migrated schema with real
`users`/`sessions` rows so the FK and `auth_attempts_link_session_unique` are
live. All seven cases reproduce the controller's isolated harness exactly:
ADMIT / ADMIT / 23514 / 23514 / **ADMIT (the middle state)** / 23514 / 23514,
every refusal naming `auth_attempts_session_check`.

**Why an isolated arm is sound for REFUSE and not for ADMIT.** The constraint is
a three-way OR and each arm opens with an equality on `purpose`, so no
`purpose='signin'` row can be rescued by the `link` or `delete` disjunct — an
isolated refusal is a refusal in company. The other direction is not safe: two
false ADMITs measured on rows THIS design produces — `signin@link_ready` on a
session a link attempt already holds (real: **23505**
`auth_attempts_link_session_unique`) and on a nonexistent session (real:
**23503** `auth_attempts_original_session_id_sessions_id_fk`). **Task 0 Step 1's
seven rows must go into the real table.**

**11 shipped states.** Seeded one row of each (3 signin / 5 link / 3 delete)
under the SHIPPED constraint, each session-bearing row on its own session; the
widened `DROP`+`ADD` validated clean, 11 rows surviving. They also stay
WRITABLE: a `save()`-shaped UPDATE rewriting all of `save()`'s columns across all
11 returned `UPDATE 11`. (`ADD` validating proves admissibility, not that the
app's own write statement still lands — measure both.)

**Every `stage` writer, enumerated mechanically.**
`grep -rn "SET stage\|stage=\$\|,stage," app/server | grep -v '\.test\.'` returns
exactly two: `begin()`'s INSERT and `save()`'s UPDATE. `save()` writes neither
`existing_provider` nor `original_session_id`, so the signin transitions check
as: `authorize->exchanging` and `exchanging->confirm` stay within disjunct 1 and
need nothing; `confirm->reauth_authorize` crosses 1->2 and needs
`existing_provider` in the same statement (stage alone 23514);
**`reauth_authorize->reauth_exchanging` stays within disjunct 2 and needs
NOTHING — stage alone is fine, on the UNCHANGED `claim()` path**;
`reauth_exchanging->link_ready` crosses 2->3 and needs `original_session_id` in
the same statement (stage alone 23514, session alone 23514, together ok). The
third row is the one worth keeping: it looks like it needs a companion column
and does not, and a stage-keyed CHECK invites an implementer to widen `save()`
defensively when nothing requires it.

**23503 -> `account_changed` is correct and narrow.** Through the real `pg`
driver: `code: 23503 | constraint: sessions_user_id_users_id_fk | table:
sessions`. Only ONE statement inside `transaction()` can raise it —
`mintSession`'s `INSERT INTO sessions`; `sessions.ts`'s `createSession` runs on
the drizzle pool OUTSIDE `transaction()` and is unreachable by the catch. No
client collision: the producer carries `purpose: "signin"`, and `SignIn.tsx`
enumerates only `access_denied`/`account_conflict` and defaults the rest to
"That sign-in didn't work. Give it another try." — right for a concurrent
delete. `SignInMethods.tsx`'s "Start linking again" copy is unreachable from
here (its retry is gated on `purpose === "link"`). `account_changed` is already
409. **Open:** Task 3 Step 4 does not name its code for "proven subject belongs
to no account"; picking `account_changed` puts a user error and a concurrent
delete behind one code on one screen. `account_conflict` fits and already has
copy there.

**Four things rev 3 states that measurement did not support; TWO ARE THIS
AGENT'S OWN, corrected in place above.** (1) Task 0's Files line named
`app/server/db/migrations/`, which does not exist — `app/drizzle.config.ts` is
`out: "./drizzle"` and all 33 migrations live in `app/drizzle/`. (2) "three
`frontDoorRoutes.ts` call sites" is FOUR. (3) "`followThrough`'s real UPDATE"
was `save()`'s UPDATE text. (4) Task 0 Step 4 still read "all four cases hold"
while Step 1 enumerates seven — and Step 4 is the step that reads the gate.

**Which scale ruled:** none. Decided at one row, by correctness, like revision 2.
