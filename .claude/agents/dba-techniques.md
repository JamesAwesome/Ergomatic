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

- **An unqualified `FOR UPDATE` on a join locks matching rows in every joined
  table.** Widening an original-session lookup to include the account email
  added a user-row lock: same-user and same-session updates exceeded a 250 ms
  `lock_timeout`, while another user remained writable. Hold one joined row
  on a second connection, start the join, then probe each relation; `LockRows`
  alone does not identify which write now contends. Measured in the
  [2026-09-13 access-policy report](../../docs/superpowers/research/2026-09-13-access-mode/db-cost.md).

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
- **(2026-09-13, PR #425) A btree over churning random keys looks unbounded for
  two vacuum cycles and then plateaus.** 20,000 sign-in cycles grew
  `auth_attempts_state_unique` 5128 → 10136 kB across two rounds and then
  **exactly zero** on the third: a page deleted by one VACUUM only becomes
  recyclable at a later one. Heap truncated to 0 bytes. **Never call index
  growth unbounded from two samples — run a third round with two manual
  VACUUMs between.**
- **(2026-09-13) A `FOR UPDATE` on a join with no `OF` clause locks a row in
  EVERY table in the join.** `sessions INNER JOIN users … FOR UPDATE` takes a
  row lock on `users`: a concurrent `UPDATE users` on that row hit a 2 s
  `lock_timeout`; a different row finished in 3.591 ms.
- **(2026-09-13) A unique CONSTRAINT that no query reads still costs on every
  write.** `auth_attempts_state_unique` (compared in process, never in SQL) is
  93 MB at 1M rows and adds +1 WAL record / +104 B per INSERT (527 vs 423 B).
- **(2026-09-13) `connectionTimeoutMillis` is not a statement timeout.** It
  governs connection ACQUISITION only; `statement_timeout` and `lock_timeout`
  default to 0, so a query behind an ACCESS EXCLUSIVE lock waits forever and a
  `try/catch` cannot fire (measured 6209 ms against a held lock).
- **(2026-09-13) `SET LOCAL` needs a transaction, and a multi-statement string
  returns an ARRAY of results.** `pool.query("SET LOCAL statement_timeout=…;
  SELECT …")` reads `undefined` off `.rows`, throws, and a caller's catch turns
  it into a silent zero — a bounded diagnostic that never fires. Take a client,
  BEGIN, SET LOCAL, query. Measured against a real container, both the broken
  and the working form.
- **(2026-09-13) A sweep's own error handling can be the outage.** A 3 s pool
  timeout made `attempts.sweep()` throw, setting `healthy=false`, which refused
  every sign-in for up to 60 s AFTER the pool recovered. When a boolean gates a
  user-facing path, ask what ELSE can set it.


- **(2026-09-13, corrected session cleanup) Measure FK cascades from the migrated schema, not a hand-built parent table.** The sessions expiry DELETE uses a parent Seq Scan plus indexed child cascades through `auth_attempts_link_session_unique`. With 10k expired/100k sessions and one bound link each, complete median was 29.290 ms (committed trigger 22.082 ms, total WAL 1,124,048 B by LSN); the next 90k-live minute scan was 2.628 ms/1,819 pages. Household 5/25 plus 511 anonymous attempts was 0.170 ms. No new index is justified at this scale. The earlier 6.421 ms/540,000 B were parent-core measurements only. Keep cleanup error boundaries independent; run the harness in its dedicated container if host `psql` is absent.

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
- **(2026-09-12, Phase PS PR 1) Dropping `ORDER BY` from a full-history read
  turns a Bitmap Heap Scan + external-merge Sort into a plain Index Scan**:
  at 100k rows/user the spec's ordered shape spilled `Disk: 73680kB` for
  129 ms exec; the same projection unordered is `Index Scan using
  session_logs_user_id_idx`, no Sort node, **56.4 ms** — and `work_mem`
  stops mattering. A route whose client sums an unordered set should say so.
- **Drizzle's row mapper costs 9-15% over raw `pg` for the same SQL** (10k
  rows: 80.2 vs 70.6 ms; 100k: 832 vs 767) — measure the ORM, not `pg`, when
  the shipped store is drizzle. `db.select(COLS)…toSQL()` gives the exact
  text; an expression column ships UNALIASED (`case … end`) and drizzle still
  reads it, because it maps by position.
- **Guard every jsonb→numeric cast with `jsonb_typeof(… ) = 'number'`.**
  `(machine_summary->>'totalCalories')::double precision` on one string value
  errors `invalid input syntax for type double precision: "thirty-seven"` and
  500s that user's WHOLE history; the guarded `case` returns null for the
  string and 37.5 for a float, at no measurable cost.
- **Express sends uncompressed even when the client asks (2026-09-12, now
  MEASURED, previously UNTESTED):** `curl -H 'Accept-Encoding: gzip'` returned
  byte-identical payloads at 1k/10k/100k rows. Any "gzip would cut it 6.4×"
  claim is about a middleware that does not exist.
- **`bench.sh` must discard `BENCH_PRE`'s own `Time:` line IN ORDER before
  sorting**, or `tail -n +2 | sort -n` drops the fastest run and keeps the
  cold one.

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

- **(2026-09-12, PR gate) Print a store's real SQL WITHOUT writing into the
  checkout**: put the `.toSQL()` script in the scratchpad,
  `ln -sfn <worktree>/app/node_modules <scratch>/node_modules` (Node resolves
  from the script's own directory), import the store and `schema.js` by
  ABSOLUTE path, and run it with `pnpm exec tsx` from `app/`. Byte-identical
  output means the plan-pass numbers stand and no container is owed.
- **An authed GET costs TWO statements, not one.** `requireUser` →
  `resolveSession` (`app/server/auth/sessions.ts:44`) runs a
  `sessions`⋈`users` select on every request, plus an `update` once past the
  30-day half-life. Constant per request (no N+1), but a "one query per
  request" claim about any route under `requireUser` is about the route's
  own query only — say which.

- **Expiry and secret deletion have different lifetimes.** An expiry predicate
  denies authority immediately; only a named DELETE trigger removes the row. A
  sweep on later traffic has no idle-time retention bound. State both lifetimes
  and their owners. (Wave A Apple-auth spec, 2026-09-12.)

- **Measure the populations an auth query scans.** The anonymous cap does not
  bound live link attempts. With 511 anonymous attempts and 5/1k/100k/1M links,
  admission COUNT took 0.040/0.064/2.597/36.958 ms in PostgreSQL 18.4; those
  links are sensitivity fixtures, not a traffic claim. A reverse lock order
  needed only one session and attempt: claim→session versus replacement
  session→attempt reproduced 40P01. The same held-order probe passed after
  session-first locking. Include parent FK-cascade order in the analysis.
  (2026-09-13 Apple plan; commands/raw plans in the archived report.)
- **Bracket lock ownership, not startup time.** Timestamp around acquisition
  and transaction completion. Migration 0031's users lock bracket was
  80.556–80.928 ms at 1M synthetic users on the measured laptop. Old-server
  health200 after migration proves boot/schema compatibility, not access for
  Apple-only rowers. (2026-09-13 Apple plan.)

- **(2026-09-13, Apple discard delta) A PK predicate does not mean a PK plan.** The snapshot-conditional failure DELETE includes id, binding, provider intent, stage/version, state/nonce and original session; PostgreSQL18.4 chose `auth_attempts_state_unique` at517–1,000,512 attempts. Matching deletion cost54WAL B; stale stage/version/binding cost0; captured warm execution0.005–0.019ms. Hold the real winner after its UPDATE and before COMMIT, issue stale cleanup on another connection, observe its lock wait, then commit: the conditional delete returnedfalse and retained the winner. The former id/hash/surface predicate deleted it and failed the same gate. Read the actual Index Cond and test failure cleanup independently of successful transitions.

## Where the dated record lives

`dba-ledger.md`, one section per engagement with its environment table and
commands; `grep -n '^## ' .claude/agents/dba-ledger.md` lists them. **Propose
every entry to BOTH files** — an entry only in the record is invisible here.
