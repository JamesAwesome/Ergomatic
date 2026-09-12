# DBA techniques

The measurement recipe for this repo, the reading rules, and the questions
every engagement asks. Read whole by the `dba` agent; bounded on purpose
(~120 lines). The dated record is `dba-ledger.md` — grep it, never up front.

## The recipe (paths from the worktree root; `app/` where shown)

1. **Start the repo's own Postgres** — the image every gate uses
   (`compose.yml:5`; each `*.integration.test.ts` does
   `new PostgreSqlContainer("postgres:18.4")`): `docker run --rm -d --name
   erg-dba-pg -p 5434:5432 -e POSTGRES_PASSWORD=dev postgres:18.4`. 5434
   keeps clear of the dev DB (5433) and the per-worktree e2e stacks. Record
   `select version()` and `sysctl machdep.cpu.brand_string hw.ncpu hw.memsize`.
2. **Migrate the way production does.** Boot the server once — `cd app &&
   DATABASE_URL=postgres://postgres:dev@localhost:5434/postgres pnpm dev:server`
   — which runs `migrate(db, { migrationsFolder: "drizzle" })`
   (`app/server/index.ts:32`), records each file in
   `drizzle.__drizzle_migrations`, seeds the library; then stop it. There is
   no `db:migrate` script (`app/package.json` has only `db:generate`). The
   2026-09-07 benchmark ran `app/drizzle/*.sql` through `psql -v
   ON_ERROR_STOP=1` instead — same schema, empty bookkeeping table.
3. **Seed realistic rows (RF3).** The TS fixture `logInput()` in
   `app/server/stores/stores.integration.test.ts` is ONE step, no
   `machine_summary` — emptier than any production row. The realistic
   generator is `dba_gen_a(lo, hi)` in
   `docs/superpowers/research/2026-09-07-machine-summary-jsonb-vs-columns/02-gen.sql`:
   3–8 steps with the real `LogStep` keys (`app/server/stores/logs.ts`), 70 %
   `source='pm5'` rows carrying the nine `MachineSummaryDetail` keys plus
   `verificationBytes[19]` (`app/src/monitor/monitorRun.ts`), 30 % with
   `machine_summary IS NULL`. It targets a clone (`create table logs_a (like
   session_logs including all)`); to seed the real table, point its `insert`
   at `session_logs` with one real `users` row and fix `u.id` for a
   one-rower history. Diff its keys against the CURRENT `LogStep` first.
   Seed 1k, 100k, 1M; `vacuum analyze` after each.
4. **Time it like for like.** `bench.sh <label> "<sql>"` beside the generator
   runs six times in one psql session, discards run 1, prints the median of
   5. Prepend `BENCH_PRE="set max_parallel_workers_per_gather=0;"` — without
   it the planner gave a 674-byte row two workers and a 16-byte row none, and
   the comparison measured CPU count. Report `work_mem`, `shared_buffers`,
   `jit` from `pg_settings` beside every table. The repo's `bench.sh` prints
   empty medians when its `echo "\\timing"` reaches psql as a tab — use
   `printf '%s\n' '\timing on'` (scratchpad `bench2.sh`, 2026-09-12) and end
   every SQL with `;`.
5. **Explain it** — `explain.sh <Qname>` or `explain (analyze, buffers)` by
   hand — and attach the plan to the ledger entry, never a paraphrase.
6. **Size the payload against the real route.** Arm the e2e backdoor:
   `TEST_AUTH_SECRET=x DATABASE_URL=... pnpm dev:server` in `app/` (it
   `console.warn`s at boot, `index.ts:96`). Then
   `curl -s -c jar -H 'content-type: application/json' -d '{"secret":"x","email":"dba@test.local"}' localhost:8080/api/auth/test-signin`
   creates user `test:dba@test.local` (`app/server/auth/testSignin.ts`);
   seed that user's id; then
   `curl -s -b jar -o /dev/null -w '%{size_download} B %{time_total} s\n' localhost:8080/api/<route>`
   and `curl -s -b jar localhost:8080/api/<route> | wc -c`. Whether the
   server compresses is UNTESTED — run with and without
   `-H 'Accept-Encoding: gzip'` and say which you report. Bytes per row × the
   busiest user's rows is what a phone downloads.
7. **Write cost, when a write path changes:** `explain (analyze, wal)` with
   `full_page_writes` off (reset after); LSN deltas returned `0 bytes`.

## Reading an EXPLAIN (ANALYZE, BUFFERS)

- **`rows=` estimated vs actual** — a 10× gap is stale stats (`analyze`) or
  a predicate the planner cannot see through (a jsonb path).
- **`Seq Scan on session_logs` under a `user_id` filter** is a FAIL at 100k+
  unless the user owns most of the table. The shipped index is
  `session_logs_user_id_idx` alone (`schema.ts`); `order by logged_at desc,
  id desc limit 50` without a composite sorts the whole history (39 ms vs
  0.36 ms at 25k rows per user).
- **`Sort Method: external merge  Disk: NNNNkB`** — spilled past `work_mem`
  (4 MB stock). Read `width=`: a jsonb key extracted at the aggregate node
  drags the whole blob (674 B) through the sort; a column is 16 B.
- **`HashAggregate ... Batches: 1`** is in memory; `> 1` is a spill.
  **`Heap Fetches: 0`** is the covering index working (non-zero: `vacuum`,
  re-run). **`Buffers: ... read=M`** on a warm run means the working set
  exceeds `shared_buffers` (128 MB stock) at that scale.

## Which number rules

The population is a five-person household — 16 log rows on 2026-08-28;
James, 2026-09-05: "we have like five users". Measure at 1k / 100k / 1M
because it is cheap and it is the ceiling, then SAY which scale decided the
verdict. A cost that bites only past the household's horizon (0.6 µs/row →
~170,000 rows per user before +100 ms) is a ROADMAP row with a measured
trigger, never a FAIL; one that bites at 5,000 rows is a FAIL in any phase.

## Questions to always ask (answer each, or write "untested")

1. What index does every `WHERE` use, and does `ORDER BY ... LIMIT` have a
   matching composite? `explain` it; do not read the schema and infer.
2. What does the row count grow WITH — sessions, samples, days — and what is
   today's count (`select count(*)` here; prod's last known figure, dated)?
3. What happens on DELETE? `session_logs.user_id` cascades from `users`
   (`schema.ts`). Measure the cascade at 1M if the change adds a child table.
4. Is the migration reversible — additive (older image still boots) or
   one-way (needs a `docs/RELEASING.md` rollback-table row)? Does
   `scripts/deploy.sh`'s `ERR`-trap rollback cross it unattended?
5. Does the route paginate, and what is the busiest user's payload in
   measured bytes? An unbounded per-user `select *` is a FAIL unless the
   spec states the bound and the measurement shows it holds at 1M.
6. What locks does the migration take, for how long at 1M rows, inside the
   ONE transaction drizzle wraps every pending migration in
   (`drizzle-orm/pg-core/dialect.js:60`, so `CONCURRENTLY` is unavailable)?
   And does a competing open PR mint the same migration index?

## Measured facts that keep paying (2026-09-07 unless dated otherwise)

- **jsonb aggregation costs ~0.6 µs per row scanned**; indexed reads are
  identical between jsonb and columns (≤ 0.36 ms at 1M).
- **`INCLUDE` takes columns, never expressions**: a covering index over a
  jsonb key carries the whole blob (346 MB vs 48 MB at 1M; cohort roll-up
  337 ms vs 53 ms). Escape hatch: `GENERATED ALWAYS AS (...) STORED` plus a
  btree — no backfill, no write-path change (ROADMAP register row).
- **One non-integer value in a jsonb key breaks the naive aggregate for that
  user's whole history AND makes the expression index uncreatable**; nothing
  below `validateMachineSummary` (`routes/data.ts`) enforces a type.
- **`machine_summary` never TOASTs** (widest row 1932 B < ~2032 B); at the
  200-step cap Postgres pushes `steps` out of line, not the summary.
- **(2026-09-12) `steps` crossing PG→Node costs 6.2 µs/row and is the whole
  cost of a per-row projection** (Node query+parse 779 vs 157 ms without it
  at 100k rows; psql 726 vs 90 ms). A StatsRow serialises to **224.8 B**
  (uuid + ISO instant + ten keys); gzip 6.4×, but Express sends uncompressed
  (no middleware in `app/package.json`). **A full-history read ignores the
  `(user_id, logged_at desc, id desc)` composite** (planner keeps Bitmap
  Heap Scan + Sort at 100k; 743 vs 726 ms) — it pays only under `LIMIT`.

- **(2026-09-12, PR #412) A required key valued `undefined` costs zero stored
  bytes, measured end to end.** `Sample.r` became `r: true | undefined`
  (required) instead of `r?: true`; driving the real recorder over
  `walk-2026-08-16/session-2-wu-4unequal.jsonl` through the real POST route
  into real Postgres gave `md5(series::text)` `fcc401bda2b5b8a26b0dea3ee1bd9d45`
  on BOTH trees, `pg_column_size` 1580 B both. Same at the 14,400-sample cap
  (`a2c5f84e…`, 163,347 B both). PRIMARY for why: drizzle's
  `pg-core/columns/jsonb.js:21` `mapToDriverValue` and `pg/lib/utils.js:82`
  are both `JSON.stringify`, which drops an `undefined`-valued key.
- **jsonb at the series cap is TOAST-compressed ~4.7×, so a wire cost and a
  storage cost are different numbers (RF11).** Writing the feared `r: null`
  instead of `undefined` at 14,400 samples costs **+18.2 % of `::text`
  characters** (763,396 → 901,996) but only **+2.95 % of `pg_column_size`**
  (163,347 → 168,170). A ROADMAP row quoting a jsonb size increase must say
  which oracle it used.
- **The cheapest proof that a store's query shape did not change** is a
  comment-stripped diff of the store file, not a grep:
  `git show <sha>:app/server/stores/logs.ts | perl -0pe 's{/\*.*?\*/}{}gs' |
  sed 's://.*::' | grep -vE '^[[:space:]]*$'` on both sides, then `diff`.
- **To see the SQL a route really emits, log it in the container, don't read
  the ORM**: `alter system set log_statement='all'; select pg_reload_conf();`
  then `docker logs <c> | grep 'execute <unnamed>: insert into'`. Reset after.

## Where the dated record lives

`dba-ledger.md`, one section per engagement with its environment table and
commands; `grep -n '^## ' .claude/agents/dba-ledger.md` lists them. **Propose
every entry to BOTH files** — an entry only in the record is invisible here.
