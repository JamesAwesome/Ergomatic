# Account-access policy database cost gate

**PASS**

This is the narrow database gate for the approved account-access amendment at
`c8369d43`, measured against the stable candidate subsequently committed as `c3e75610`, in
`app/server/auth/{sessions,attempts,users}.ts` over base
`d54d74ec8fa17138a89507f6706e60f9e247752a`. It is not the broad Apple
implementation review, which remains incomplete.

The five-user/25-session synthetic scale rules the verdict: every changed or
reused path is a one-row identity lookup, and the policy adds no population
scan. The 100,000-user/1,000,000-session synthetic stress fixture confirms
that the same queries switch to the existing unique/primary indexes and remain
one-row plans. These fixture sizes are diagnostics, not a production census.

## Numbers

All timings are PRIMARY: PostgreSQL `Execution Time`, median of five warm runs
after discarding run 1, in one psql session per query, with
`max_parallel_workers_per_gather=0` and `jit=off`. Commands:
`docker exec -i erg-dba-access-pg psql -U postgres < 01-seed.sql`, then
`./04-bench.sh 25 5 4`; grow with `02-grow-stress.sql`, then
`./04-bench.sh 1000000 100000 100000`. Exact SQL and single-run
`EXPLAIN (ANALYZE, BUFFERS)` plans are in `03-measure.sql`.

| Data path | 5 synthetic users / 25 sessions | 100k synthetic users / 1m sessions | Stress plan / bound |
| --- | ---: | ---: | --- |
| Existing `resolveSession` session→user join | 0.013 ms | 0.011 ms | `sessions_token_hash_unique` then `users_pkey`; 1 row |
| Baseline `attempts.original` session lookup | 0.004 ms | 0.008 ms | `sessions_pkey`; 1 row |
| Policy `attempts.original` session→user email join | 0.006 ms | 0.006 ms | `sessions_pkey` then `users_pkey`; 1 row |
| Google subject lookup | 0.006 ms | 0.008 ms | `users_google_sub_unique`; 1 row |
| Apple subject lookup | 0.005 ms | 0.009 ms | `users_apple_sub_unique`; 1 row |
| Legacy Google existing-subject upsert, saved-email preserving | 0.021 ms | 0.020 ms | conflict arbiter `users_google_sub_unique`; 1 conflicting tuple |
| Baseline Google-only profile update (`email,name`) | not measured at small scale | 0.018 ms | `users_pkey`; 1 row |
| Policy Google-only profile update (`name`) | not measured at small scale | 0.014 ms | `users_pkey`; 1 row |
| Baseline locked `attempts.original` | not measured at small scale | 0.023 ms | `LockRows` over `sessions_pkey`; 1 session row |
| Policy locked `attempts.original` | not measured at small scale | 0.013 ms | `LockRows` over nested PK scans; 1 session + 1 user row |

The profile-update difference is within run-to-run noise; it is included only
to show that preserving canonical email does not add a write. The existing
subject upsert emitted 138 WAL bytes in one captured stress run
(`EXPLAIN (ANALYZE, BUFFERS, WAL) ... ON CONFLICT(google_sub) DO UPDATE SET
name=excluded.name RETURNING id,email,name`). A separate transaction seeded
`saved-canonical@synthetic.test`, supplied
`provider-current@synthetic.test`, and returned the saved canonical address
while updating the name; command and plan are reproducible from the upsert in
`03-measure.sql` after changing the two email literals.

PRIMARY payload-content oracle:
`octet_length(id::text)+octet_length(user_id::text)[+octet_length(email)]`.
This measures projected value bytes, not PostgreSQL protocol framing or an HTTP
payload. The original-session lookup returned exactly one row at both scales:
72 content bytes before the policy and 94 bytes at the small fixture / 99 bytes
at stress after adding the saved email. The stress Google subject projection
was 76 content bytes. No changed path returns a set, no bulk API was added, and
pagination is not applicable.

## Query and growth shape

- PRIMARY: `git diff -- app/server/auth/sessions.ts` shows the
  `resolveSession` select is unchanged and already selects the complete user,
  including `users.email`; the new policy check runs in memory before its
  optional refresh. Database cost is unchanged.
- PRIMARY: the new `attempts.original` SQL widens `sessions_pkey` lookup into
  `sessions_pkey` → `users_pkey` and projects `users.email`. Its stress plan is
  a nested loop with one row at each side, eight shared-buffer hits when warm,
  and no sort, aggregate, or sequential scan.
- PRIMARY: returning-subject resolution continues to use the existing unique
  Google/Apple subject constraints. The legacy upsert still uses
  `users_google_sub_unique`; changing its conflict action from `email,name` to
  `name` preserves the returned canonical email and adds no statement.
- INFERENCE grounded in the plans: costs grow with protected requests and auth
  transitions, one indexed account/session row per call. They do not grow with
  workout or `session_logs` count. No `session_logs` rows were seeded.

## Lock shape

PRIMARY command: `./05-lock-probe.sh` against 100k synthetic users / 1m
synthetic sessions. Holding the baseline `SELECT ... FROM sessions ... FOR
UPDATE` allowed an update to the matched user and made an update to the matched
session exceed `lock_timeout='250ms'`. Holding the policy join made updates to
both the matched user and matched session exceed 250 ms; an update to another
user completed. Thus unqualified `FOR UPDATE` expanded the target from one
session row to one session plus its one user row. The lock lasts until the auth
transition transaction commits; whole-transition lock retention under
concurrent request load is UNTESTED.

PRIMARY command: `./06-lock-order-probe.sh`. While another transaction held the
user row, the policy join acquired the session row before waiting for the user:
a third transaction's same-session update exceeded the 250 ms timeout. No
production account-delete statement was found (`rg -n "DELETE FROM users|delete\\(users\\)" app/server` found only a schema integration test), so a live
user-parent cascade/reverse-order deadlock is not claimed. The current auth
paths keep the existing session→attempt order and only serialize concurrent
writes for the same account.

## Environment and limits

| Item | Measured value |
| --- | --- |
| PostgreSQL | `18.4 (Debian 18.4-1.pgdg13+1)`, aarch64, repo-pinned image |
| Container | `erg-dba-access-pg`, Docker Desktop 29.4.1, 10 CPUs / 8,321,712,128 bytes |
| Host | Apple M5, 10 CPUs, 17,179,869,184 bytes |
| Settings | `shared_buffers=128 MB`, `work_mem=4 MB`, `jit=off`, parallel gather workers `0` |
| Stress relation sizes | users 24 MB total; sessions 311 MB total |

Production CPU/RAM, account count, session count, network framing, concurrent
auth throughput, and whole-transaction lock duration are UNTESTED. No live
host, real data, secret, provider, or Apple call was used.

### Separate environment diagnostic: DB/host clock offset

This does not affect the account-policy verdict. At the controller's request,
20 TCP samples bracketed `SELECT clock_timestamp()` with host Node
`Date.now()` before and after each query. The oracle is
`db_ms - ((before_ms + after_ms) / 2)`: median **-1.0 ms**, minimum **-1.5
ms**, maximum **+7 ms**; round-trip minimum **0 ms**, maximum **18 ms**. The
only positive offset was the first connection sample; the 19 warm samples
were -1.5 to -1.0 ms. PRIMARY: this synthetic container's DB clock was not
ahead of the host enough to explain an unchanged fresh-row calculation
flooring to -1.

Command, from `app/`:

```sh
node --input-type=module -e 'import pg from "pg"; const p=new pg.Pool({connectionString:"postgres://postgres:dev@127.0.0.1:55434/postgres"}); const a=[]; for(let i=0;i<20;i++){const b=Date.now(); const r=await p.query("select clock_timestamp() as db"); const e=Date.now(); const d=r.rows[0].db.getTime(); a.push({i,rtt:e-b,offset:d-(b+e)/2,b,db:d,e});} await p.end(); const s=[...a].sort((x,y)=>x.offset-y.offset); console.log(JSON.stringify({samples:a,summary:{min_offset_ms:s[0].offset,median_offset_ms:s[Math.floor(s.length/2)].offset,max_offset_ms:s.at(-1).offset,min_rtt_ms:Math.min(...a.map(x=>x.rtt)),max_rtt_ms:Math.max(...a.map(x=>x.rtt))}},null,2));'
```

DELETE behavior is unchanged: no new child table or foreign key exists.
Migration and rollback questions are not applicable: no schema, index,
migration, backfill, DDL lock, or rollback floor is introduced. A current diff
under `app/server/db` and `app/drizzle` is empty. There is no competing
migration index to check for this policy.

## Findings and filing

No ROADMAP row is proposed. The only new contention is bounded to the same
account's single user row during a short auth transaction; fixing it now would
mean qualifying the row-lock target or changing the policy's stability
contract, and the measured household and stress paths do not justify either
change.

The controller recorded the measured join-lock technique in the standing DBA ledger. Reproduction scripts are under `db-cost/` in [the evidence archive](../../access-mode-evidence.tar.gz). The archive also carries the implementation and validation receipts; no real credentials or data are included.

