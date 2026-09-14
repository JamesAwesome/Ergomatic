# Corrected session expiry sweep DBA report

**PASS; replace the earlier full-query numbers.** The repository's migrated `auth_attempts.original_session_id → sessions.id ON DELETE CASCADE` adds one indexed trigger call per deleted session. On the 100,000-session fixture, the complete delete median is **29.290 ms**, not the isolated parent-table 6.421 ms previously reported. The subsequent 90,000-live-row minute sweep remains **2.628 ms**. Neither result warrants another index or migration.

## Correction and source

The previous `../report.md` hand-built only `users` and `sessions`, so its plans and 6.421 ms / 540,000 WAL B describe the parent DELETE core only. This correction applied all **32 current `app/drizzle/*.sql` files** in filename order to a fresh PostgreSQL database. `actual-schema.log` records the resulting FK and indexes; `migration-sha256.log` fingerprints every input.

Source state was HEAD `5e514fb2c4fca94c7857124e8ce76b248d9736ce` plus the implementer's uncommitted `frontDoor.ts` change, fingerprinted in `source-state.log`. The working implementation runs `attempts.sweep()` and `sessions.sweepExpired()` concurrently under independent error boundaries at startup and every 60 seconds. No app source was written, staged, or reverted.

## Environment and fixture

PRIMARY: dedicated `erg-dba-session-cascade-pg`, PostgreSQL 18.4 Debian/aarch64, loopback 55436, capped at 2 CPUs / 1 GiB; `work_mem=4MB`, `shared_buffers=128MB`, per-query JIT off and parallel gather 0. Host: Apple M5, 10 cores, 16 GB, Docker 29.4.1. Timing is median of five warm `EXPLAIN (ANALYZE, BUFFERS, WAL, VERBOSE)` executions after discarding run 1; timed deletes ran inside `BEGIN`/`ROLLBACK`, followed by one committed correctness run.

Both fixtures use five users, one bound link attempt per session (the schema maximum from `auth_attempts_link_session_unique`), mixed live/expired attempt rows, and **511 anonymous signin attempts**, split 256 live / 255 expired and below the existing 512-row admission cap. Household has 25 sessions / 5 expired. The sensitivity fixture has 100,000 sessions / 10,000 expired. Every expired parent has a bound child; this is a conservative cascade backlog, not a production population claim.

| Actual migrated schema | Household | 100k sensitivity |
|---|---:|---:|
| sessions before: total / expired / live | 25 / 5 / 20 | 100,000 / 10,000 / 90,000 |
| auth attempts before: bound / anonymous | 25 / 511 | 100,000 / 511 |
| sessions heap / indexes / total | 8,192 / 49,152 / 98,304 B | 14,901,248 / 17,522,688 / 32,464,896 B |
| attempts heap / indexes / total | 131,072 / 163,840 / 335,872 B | 27,435,008 / 20,815,872 / 48,291,840 B |
| complete cascade DELETE median | **0.170 ms** | **29.290 ms** |
| trigger time, committed observation | 0.126 ms / 5 calls | 22.082 ms / 10,000 calls |
| total WAL by LSN, committed observation | 4,256 B | 1,124,048 B |
| next zero-match minute sweep median | 0.015 ms | 2.628 ms |

PRIMARY: the parent `expires_at` predicate still chose `Seq Scan on sessions`. At 100k, the committed observation scanned 100,000 parents in 5.499 ms, performed the parent delete in 7.665 ms, then spent 22.082 ms across 10,000 FK trigger calls; total 29.977 ms. The top EXPLAIN's 540,000 WAL B covers the parent node only. The isolated transaction LSN delta, which includes child cascades and transaction records, was 1,124,048 B.

`auto_explain.log_nested_statements=on` captured the actual cascade SPI statement: `DELETE FROM ONLY auth_attempts WHERE $1 = original_session_id`. Every household call used **Index Scan using `auth_attempts_link_session_unique`**, returned one row, and hit two buffers for the scan; nested execution was 0.001–0.008 ms. The existing partial unique index is exactly the cascade index. No new session or child index is owed.

## Correctness, locks, and the 60-second owner

After the session-only committed growth delete, exactly 90,000 live sessions, their 90,000 bound attempts, and all 511 anonymous attempts remained; the 10,000 bound children of deleted sessions were gone and orphan count was zero. This deliberately proves the session sweep's boundary: expired attempts attached to live parents and anonymous attempts remain for `attempts.sweep()`.

While a household session sweep was held open, PostgreSQL held `RowExclusiveLock` on `sessions`, `auth_attempts`, and all seven indexes across those tables. Updates to a retained live session, retained bound attempt, and anonymous attempt succeeded. Updates to a deleted parent and its cascaded child each exceeded the 250 ms lock timeout. This confirms parent-before-child lock order and confines tuple contention to rows being removed.

A single current-owner overlap probe at 100k ran the two sweeps concurrently: attempt cleanup removed 50,255 expired attempts in 22.580 ms; session cleanup removed 10,000 expired sessions in 43.335 ms; both exited 0. Final state was 90,000 sessions, 45,006 live bound links, 256 live anonymous attempts, zero expired attempts, and zero orphans. The timings are single wall-clock observations affected by mutual waiting, not medians; they prove the concurrent owner completes without a lost row or observed deadlock in this fixture.

The zero-match minute scan touches 1,819 cached parent pages (14,901,248 B) and consumes 2.628 / 60,000 = 0.0044% of one CPU-second interval on this laptop. The 29 ms sensitivity backlog and 0.170 ms household cleanup keep the no-index recommendation. Production host, actual production counts, and populations above 100k sessions are unmeasured. No ROADMAP row is warranted.

## Required ledger correction

Replace the session-cleanup bullet in `dba-techniques.md` with:

> - **(2026-09-13, corrected session cleanup) Measure FK cascades from the migrated schema, not a hand-built parent table.** `sessions` expiry cleanup uses an unindexed parent Seq Scan, then one indexed `auth_attempts` cascade per deleted session via `auth_attempts_link_session_unique`. At 10k expired / 100k sessions with one bound link each, complete DELETE median was 29.290 ms (22.082 ms trigger time in the committed observation, 1,124,048 total WAL B by LSN); the next 90k-live zero-match minute scan was 2.628 ms over 1,819 pages. Household 5/25 plus 511 anonymous attempts was 0.170 ms. No additional index is justified at this scale. The earlier 6.421 ms / 540,000 B values are the parent node only. Keep cleanup error boundaries independent; if host `psql` is absent, run the harness inside its dedicated container.

Replace the `2026-09-13 — Session expiry sweep review fix` ledger body with:

> **PASS after correcting the fixture; no index or migration.** PostgreSQL 18.4 Debian/aarch64, dedicated 2 CPU/1 GiB container, Apple M5 host; all 32 migrations applied; query JIT off/parallel gather 0. The original 6.421 ms fixture omitted `auth_attempts.original_session_id ON DELETE CASCADE` and remains parent-core evidence only. Actual schema, median of 5 warm: household 5 expired/25 sessions +25 links +511 anonymous attempts **0.170 ms**; sensitivity 10k expired/100k sessions +100k links +511 anonymous **29.290 ms**, including one `auth_attempts_link_session_unique` child probe per deleted parent (committed trigger 22.082 ms/10k calls; total WAL 1,124,048 B by LSN). The next 90k-live minute scan was 2.628 ms/1,819 pages. Committed deletion retained all live parents/links and anonymous rows, removed every expired parent's link, and left zero orphans. Held parent DELETE locked both tables/indexes; retained parent/child/anonymous updates succeeded, deleted parent/child updates timed out at 250 ms. A single concurrent-owner 100k probe completed both sweeps with zero expired/orphan rows and no observed deadlock. Full evidence: `docs/superpowers/research/2026-09-13-apple-review-fixes/db-cost/cascade/`. Production and >100k remain unmeasured; no ROADMAP row.

