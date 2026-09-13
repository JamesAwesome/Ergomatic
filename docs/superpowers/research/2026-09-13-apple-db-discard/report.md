# Apple discard — bounded DBA plan delta

**PASS for the plan delta at `259882ba`. No measured blocker. This is not a final integrated-PR DBA PASS.** The conditional discard preserves a committed newer stage after waiting for its row lock; the former unversioned cleanup fails the same gate. The original session/attempt deadlock reproducer still passes.

| Discard case — local Node→PG call median, discard first of six runs | 517 attempts | 1,512 attempts | 100,512 attempts | 1,000,512 attempts |
|---|---:|---:|---:|---:|
| Matching signin snapshot, returns true | 0.310 ms | 0.276 ms | 0.351 ms | 0.290 ms |
| Matching link snapshot, returns true | 0.281 ms | 0.261 ms | 0.358 ms | 0.261 ms |
| Stale stage only, returns false | 0.270 ms | 0.272 ms | 0.362 ms | 0.260 ms |
| Stale version only, returns false | 0.254 ms | 0.252 ms | 0.303 ms | 0.252 ms |
| Stale binding only, returns false | 0.253 ms | 0.269 ms | 0.317 ms | 0.273 ms |

PRIMARY measurements: `measure.ts`, `measure.json`, `measure.log`. Calls invoke the pinned real `Attempts.discard`; each timing excludes its enclosing benchmark BEGIN/ROLLBACK. These are query-call round trips inside a rollback transaction, not endpoint or autocommit durability latency. Single EXPLAIN execution observations range **0.005–0.019 ms**; raw plans include exact SQL, synthetic parameters, buffers, WAL and returned-row assertions.

## Source and inherited evidence

Candidate checkout: `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/wave-a-apple-server-paste`, clean HEAD **259882ba1087b6ad853159b19799b2358fbf3905** at capture and final check. All probes import the committed snapshot under `source/`, created using `git show 259882ba:<path>`, so subsequent work in the candidate cannot change the measurement.

* `attempts.ts`: SHA256 **d8df3812f5b4bb6e29256f3ced465616f3b0cf3b9d51582b6a90657772a88980**.
* `schema.ts`: SHA256 **93b59177d5ab928d0e4ed93770e53cda82d89f720dd06249c6c18e119a466c6f**.
* Migration0031: SHA256 **2107affc89d40a959794354fc3431d2aba593f8165ae4ddd0a4cddb718ee0387**.

`git diff 299a31d3..259882ba -- app/server/auth/attempts.ts app/server/db/schema.ts app/drizzle`, saved as `source-diff.patch`, contains exactly the new `discard(expected)` method. The prior query bodies, session-first `bound()` path, schema, indexes and migration are unchanged. Therefore the prior report at `docs/superpowers/research/2026-09-13-apple-db-measurement/report.md` remains the evidence for unchanged query families, index sizes/write cost, migration/reversal/old-server boot and activation-dependent authentication rollback floor. No old million-user migration or old-image boot was repeated. The canonical briefing and CLAUDE.md were already read completely earlier in this engagement; the diff against that read revision `aefc59b7` was empty. Current DBA role and complete techniques were read for this delta.

The harden mechanism report's F1 showed why failure cleanup must differ from explicit cancellation: an older callback lost its stage claim, then erased the winner's confirm row and grant using unversioned cleanup. The updated server-author evidence reports eight held HTTP/real-Postgres signup/reauth cases, their biting cleanup mutations, and 47 passing scoped tests. That is attributed route evidence; this delta independently measures the SQL and held transaction behavior, without claiming to repeat the HTTP suite or resolve its disclosed scoped coverage shortfall.

## Exact query and scale

The SQL captured from the real method is:

```sql
DELETE FROM auth_attempts
WHERE id=$1 AND binding_hash=$2 AND surface=$3 AND purpose=$4
  AND target_provider=$5
  AND existing_provider IS NOT DISTINCT FROM $6
  AND stage=$7 AND version=$8 AND state=$9 AND nonce=$10
  AND original_session_id IS NOT DISTINCT FROM $11
```

The returned boolean is true exactly when `rowCount === 1` (`attempts.ts`, `discard`). There is no row-set payload, ORDER BY, pagination or new index; bulk payload measurement is **inapplicable**. The query deletes an attempt, adds no rows or child table, and does not change growth or retention owners.

Five users are seeded at every scale. The deciding scale is the full **512 anonymous attempts plus five link attempts**, each link belonging to a distinct session. Additional fixtures have 1k/100k/1M sessions and link attempts plus the same 512 anonymous attempts, and measure sensitivity of this new query only. They are not traffic or production-user claims. No session_logs or unrelated grant population decides discard cost. Initial migrated DB user/attempt counts are empty; seeded counts are recorded in `measure.json`. Production counts remain untested.

**Actual chosen index: `auth_attempts_state_unique`, not the PK.** Every EXPLAIN uses an Index Scan with state as Index Cond and the other snapshot fields as a Filter. The query contains the PK predicate, but PostgreSQL can choose another unique equality index. Matching deletes use **4 shared-hit buffers** at 517/1,512 rows and **5** at 100,512/1,000,512 rows; stale cases use **3/4** respectively, with **zero shared reads** in all captured warm plans. The stale filter removes one candidate row and deletes none. Every matched deletion writes **54 WAL bytes**; every stale case writes **0 WAL bytes**, with full_page_writes off. These are statement WAL observations, excluding commit WAL and not a secure-storage-erasure claim. No additional index is justified by these measurements; no index was added or recommended.

## Held-stage proof and negative control

`held.ts` uses the real begin→claim→accept producer. A separate winner pool pauses its actual COMMIT after accept has updated the row, retaining the row lock. Real discard runs on another connection using the earlier claimed snapshot. The harness positively observes a PostgreSQL **transactionid lock wait** in discard before releasing the winner; this is a held ordering, not a probabilistic race.

Final restored-source run (`held.json`):

| Held winner | Discard after winner commits | Independent retained row | Deliberately scheduled case elapsed time |
|---|---|---|---:|
| Signup exchange→confirmation | false | confirm/version3, synthetic pending refresh grant retained | 4.428 ms |
| Existing-provider reauth→target authorization | false | target_authorize/version3 retained | 1.198 ms |

The time includes the harness's wait observation/release and is not a service latency estimate. The result establishes that the conditional DELETE rechecks against the committed newer row in these actual producer orderings. The independent method benchmarks also prove an owned matching signup and link snapshot deletes successfully.

A scratch-only copy under `mutant/` substitutes the old operation-wide predicate `id,binding_hash,surface` in discard. The **same held gate** then deletes both winners; it exits1 with `AssertionError: stale discard must preserve the winner` (`true !== false`), and raw outputs show both retained-row sets empty (`held-mutant.json`, `held-mutant.log`). The unmodified pinned source was rerun afterward on a fresh isolated fixture DB and exits0 (`held.json`, `held.log`). No checkout source was mutated or restored; both original and mutant snapshots remain inspectable. `held-first.*` preserves the initial green before the negative control.

This does not independently test cookie clearing or every HTTP failure branch; those are the server author's eight-case route producer gates. It does directly disprove the old cleanup behavior at the database seam those routes call.

## Lock-order regression

The new statement touches only the child attempt. An independent transaction held the original sessions row `FOR UPDATE`; real discard of a matching link attempt still returned true in **0.569 ms** before that parent lock was released (`held.json`, `parentLock`). This measures absence of a parent-row wait for this discard path. It adds no attempt→session lock acquisition to oppose the existing session-first transition order.

The archived original deadlock reproducer was replayed unchanged except its pinned import, scratch output path and isolated database name (`original-deadlock-replay.ts`). It pauses a real claim after the attempt SELECT FOR UPDATE, starts same-session replacement, observes replacement waiting on **sessions**, then releases claim. Both operations fulfill in **13.048 ms**, with no40P01 (`original-deadlock-replay.json`). The script's existing held-session-revocation check rejects account_changed, and its held-subject-confirm check preserves the committed winner's ID/profile. These are observations of the original reported ordering, not a universal no-deadlock claim.

## Environment, commands and limits

| Environment | Value |
|---|---|
| Isolated container | apple-dba-discard-pg, postgres:18.4, loopback port5434 |
| Actual PG | PostgreSQL18.4 Debian18.4-1.pgdg13+1, aarch64 |
| Host | Apple M5,10CPUs,17,179,869,184 B RAM (`sysctl`) |
| Query measurement settings | work_mem4MB,shared_buffers128MB,jit on,max_parallel_workers_per_gather0,full_page_writes off |
| Timing oracle | Node performance.now around actual method; EXPLAIN server execution time recorded separately |
| Isolation/provenance | Actual repository Drizzle migrations applied once to each empty fixture DB; committed source snapshot imported from scratch |

From the candidate `app/`, after creating `/tmp/apple-dba-discard/package.json` with `{"type":"module"}` and the committed snapshots:

```sh
docker run --rm -d --name apple-dba-discard-pg -p 127.0.0.1:5434:5432 -e POSTGRES_PASSWORD=dev postgres:18.4
ln -sfn /Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/wave-a-apple-server-paste/app/node_modules /tmp/apple-dba-discard/node_modules
export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"
pnpm exec tsx /tmp/apple-dba-discard/measure.ts
pnpm exec tsx /tmp/apple-dba-discard/held.ts
pnpm exec tsx /tmp/apple-dba-discard/held.ts --mutant
pnpm exec tsx /tmp/apple-dba-discard/original-deadlock-replay.ts
# Preserve first held output, then reset only this owned fixture for restored green:
cp /tmp/apple-dba-discard/held.json /tmp/apple-dba-discard/held-first.json
cp /tmp/apple-dba-discard/held.log /tmp/apple-dba-discard/held-first.log
docker exec apple-dba-discard-pg psql -U postgres -c 'DROP DATABASE discard_held'
pnpm exec tsx /tmp/apple-dba-discard/held.ts
sysctl machdep.cpu.brand_string hw.ncpu hw.memsize
```

Commands were executed with stdout/stderr redirected to the matching `.log` files. `--mutant` is expected to exit1; measure, original-order replay and both unmodified held runs exit0. These scripts CREATE named isolated databases and need a fresh container for a full replay. The copied original-order script points at the same repository migrations; their fingerprint is unchanged. full_page_writes was reset on after measurement; the owned container is stopped after collecting the report. All artifacts remain under this scratch directory. No repository edits, commits, agents, phone actions or PR actions.

Unmeasured and deliberately not claimed: production latency/traffic, real Apple HTTP, browser cookies, full HTTP failure coverage, universal concurrency correctness, and final integrated-branch behavior. Full code/coverage/CI gates remain the implementation/controller's work; no plan-pass result substitutes for them. Before final PR DBA signoff, verify the integrated store/schema/migration fingerprints and actual callers, run the applicable integrated-head gates and query deltas, and recheck migration competition/rollback documentation against that exact head. No ROADMAP row is proposed.

## Ready-to-paste technique update

Add under “Measured facts that keep paying”:

- **(2026-09-13, Apple discard delta) A PK predicate does not mean a PK plan.** The snapshot-conditional failure DELETE includes id, binding, provider intent, stage/version, state/nonce and original session; PostgreSQL18.4 chose `auth_attempts_state_unique` at517–1,000,512 attempts. Matching deletion cost54WAL B; stale stage/version/binding cost0; captured warm execution0.005–0.019ms. Hold the real winner after its UPDATE and before COMMIT, issue stale cleanup on another connection, observe its lock wait, then commit: the conditional delete returnedfalse and retained the winner. The former id/hash/surface predicate deleted it and failed the same gate. Read the actual Index Cond and test failure cleanup independently of successful transitions.

## Ready-to-paste ledger update

### 2026-09-13 — Apple failure-discard plan delta

**PASS for the plan delta, not final-PR signoff**, committed candidate259882ba1087b6ad853159b19799b2358fbf3905; attempts SHA256d8df3812f5b4bb6e29256f3ced465616f3b0cf3b9d51582b6a90657772a88980. Diff from prior299a31d3 is exactly one new conditional DELETE; prior migration/schema/index and session-first query measurements remain inherited by byte identity.

| Environment | Value |
|---|---|
| Container / PG | apple-dba-discard-pg / PostgreSQL18.4 Debian aarch64 |
| Host | Apple M5,10CPUs,16GiB |
| Query settings | work_mem4MB,shared_buffers128MB,jit on,parallel gather0,WAL FPI off then restored |
| Scale | 5users;512anonymous attempts plus5/1k/100k/1M links with matching sessions; smallest full-anonymous-cap fixture rules |

Real discard-call medians under benchmark rollback transactions: matching signup0.310/0.276/0.351/0.290ms; matching link0.281/0.261/0.358/0.261ms. The actual index is state_unique, despite a PK predicate. Matched/stale WAL54/0B; warm matching buffers4–5, stale3–4. Held real accept→COMMIT protects confirm/version3+grant and target_authorize/version3 from stale discard; the old id/hash/surface cleanup fails the exact gate; pinned original rerun passes. Holding the parent session does not block child discard (0.569ms), and the original claim-versus-replacement deadlock reproducer still fulfills both operations (13.048ms).

Commands and complete SQL/EXPLAIN/held outputs are in `/tmp/apple-dba-discard/report.md`, `measure.ts`→`measure.json`, `held.ts`→`held.json`/`held-mutant.json`, and `original-deadlock-replay.ts`→JSON. Run with Node26 `pnpm exec tsx /tmp/apple-dba-discard/<script>.ts` from candidate app, using the report's isolated postgres:18.4 command and the pinned source snapshot. Preserve the scripts/raw artifacts alongside this report in committed research and replace this scratch reference when landing the entry. No ROADMAP row; final integrated-head fingerprint, caller/gate and migration-competition checks remain owed.
