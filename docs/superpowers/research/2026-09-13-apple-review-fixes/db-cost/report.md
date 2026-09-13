# Session expiry sweep: bounded DBA review

**PASS.** Moving `SessionStore.sweepExpired()` onto `createFrontDoor`'s existing startup/60-second cleanup owner does not require an `expires_at` index or migration at the measured scales. The deciding fixture is the 100,000-row diagnostic backlog: the initial 10,000-row delete took a 6.421 ms median, and the subsequent zero-match scan over 90,000 live rows took 2.523 ms per minute. The five-person household fixture is effectively free. The production host and populations above 100,000 sessions are unmeasured.

## Source and scope

Tree inspected: `86ed0636fd37c5969bdd369813534c4690de964d`. `app/server/auth/sessions.ts` defines one row per `createSession()` and the exact range delete `DELETE sessions WHERE expires_at < <JavaScript Date>`. `app/server/db/schema.ts` has the session PK, unique `token_hash`, and `sessions_user_id_idx`; there is no `expires_at` index. At measurement close, `app/server/auth/frontDoor.ts` still invoked only `attempts.sweep()` at startup and every 60,000 ms, so this is a measurement of the authorized candidate move, not a claim that the source change had already landed. No source, schema, migration, index, credential, provider, or live environment was touched.

Rows grow with sessions minted. The live authority window is 60 days (`SESSION_TTL_MS`), but without a caller for `sweepExpired`, expired physical rows can accumulate indefinitely. The growth fixture is therefore a conservative public-auth/backlog diagnostic, not a claim about the current household: 100,000 rows across the same five users, 10,000 expired and 90,000 live, with 64-character token hashes matching the stored SHA-256 hex shape.

## Environment and method

PRIMARY: PostgreSQL 18.4 Debian/aarch64 in the dedicated `erg-dba-session-sweep-pg` container, loopback port 55436, capped at 2 CPUs and 1 GiB; stock `work_mem=4MB`, `shared_buffers=128MB`, JIT globally on. Each measured query set `jit=off` and `max_parallel_workers_per_gather=0`. Host: Apple M5, 10 cores, 16 GB, Docker Desktop 29.4.1. The host has no `psql`, so the scripts ran inside the dedicated container and connected to its own loopback database. `04-measure.sh` ran six `EXPLAIN (ANALYZE, BUFFERS, WAL)` deletes per shape, discarded run 1, and reports the median of the next five; mutating timing runs used `BEGIN`/`ROLLBACK`. A separate actual delete proved retention. Full commands are in `commands.log`; raw plans and sorted timings are beside this report.

| Fixture | Before: total / expired / live | Heap / indexes / total | First-delete median (5 warm) | Actual delete | Next zero-match median (5 warm) |
|---|---:|---:|---:|---:|---:|
| Household | 25 / 5 / 20 | 8,192 / 49,152 / 98,304 B | 0.024 ms | 5 removed; 270 WAL B | 0.014 ms |
| Growth diagnostic | 100,000 / 10,000 / 90,000 | 14,901,248 / 17,612,800 / 32,555,008 B | 6.421 ms | 10,000 removed; 540,000 WAL B | 2.523 ms |
| Growth after `VACUUM ANALYZE` | 90,000 / 0 / 90,000 | not re-sized | n/a | n/a | 2.239 ms |

PRIMARY: both fixtures chose `Seq Scan on sessions`; no existing index can serve `expires_at`. At growth scale the actual cleanup scanned 100,000 rows in 4.762 ms, executed in 6.142 ms, hit 1,819 heap pages plus 10,000 delete buffers, and wrote 10,000 WAL records / 540,000 bytes. It retained exactly 90,000 live rows and zero expired rows. `DELETE` did not shrink the 32,555,008-byte relation immediately; those pages remain available for vacuum/reuse. The zero-match minute scan touched the same 1,819 cached heap pages (14,901,248 bytes) and consumed 2.523/60,000 = 0.0042% of one CPU-second interval on this laptop. That repeated cost is too small to justify the write and migration cost of another index.

## Locks and cleanup ownership

PRIMARY: while the household sweep was held open, PostgreSQL held `RowExclusiveLock` on `sessions` and its three indexes. An update to a retained live row succeeded; an update to a matching expired row hit the configured 250 ms `lock_timeout`. After commit, all 5 expired rows were gone and all 20 live rows remained. The table lock mode permits ordinary concurrent writes; tuple conflicts are confined to rows the sweep deletes.

The owner should execute attempt cleanup and session cleanup independently. If both calls share one `try` and `attempts.sweep()` fails first, session cleanup is skipped and its physical-retention bound disappears; a session failure also needs its own accurate event name. At measured duration, `setInterval` overlap is not a concern. No migration or rollback-table entry is owed.

## Verdict and limits

The 100,000-row fixture rules the index recommendation; the household fixture confirms current cost. No `expires_at` index, migration, or ROADMAP row is warranted. Production CPU/storage and multi-process timer multiplicity are untested. The shipped call wiring was not present at the captured tree and remains a code-review concern rather than a database-cost gap.

## Proposed durable entries (controller-owned; do not write here)

`dba-techniques.md`, under measured facts:

> - **(2026-09-13, session cleanup) A once-per-minute unindexed expiry sweep is cheap at 100k sessions.** `DELETE FROM sessions WHERE expires_at < $1` chose a Seq Scan: 10k/100k deletion median 6.421 ms and 540,000 WAL B; the next 0-match scan over 90k live rows median 2.523 ms and touched 1,819 cached pages (14,901,248 B). Household 5/25 was 0.024 ms. Decline an `expires_at` index at this scale; run independent cleanup error boundaries so one sweep cannot starve the other. If host `psql` is absent, copy the scratch harness into the dedicated Postgres container and connect to its own `127.0.0.1:5432`.

`dba-ledger.md`:

> ## 2026-09-13 — Session expiry sweep review fix
>
> **PASS; no index or migration.** PostgreSQL 18.4 Debian/aarch64 in dedicated `erg-dba-session-sweep-pg`, 2 CPU/1 GiB cap, Apple M5 host; `work_mem` 4 MB, `shared_buffers` 128 MB, query JIT off/parallel gather 0. Exact unindexed expiry DELETE, median of 5 warm after discard: household 5 expired/25 total 0.024 ms; growth diagnostic 10k expired/100k total 6.421 ms, 540,000 WAL B. After deletion, 90k live rows remained and the 60-second zero-match sweep was 2.523 ms over 1,819 cached pages/14,901,248 heap B; post-vacuum 2.239 ms. Held DELETE used RowExclusiveLock on table/indexes, allowed a live-row update, and blocked an update to a deleted tuple past 250 ms. Commands, fixtures, plans, and logs: `.superpowers/sdd/2026-09-13-apple-review-fixes/db-cost/`. Production host and >100k sessions unmeasured; no ROADMAP row.
