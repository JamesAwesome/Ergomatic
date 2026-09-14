#!/usr/bin/env bash
set -euo pipefail

PGURL='postgres://postgres:dev@127.0.0.1:5432/postgres'
DIR="$(cd "$(dirname "$0")" && pwd)"
PSQL=(psql "$PGURL" -X -v ON_ERROR_STOP=1)
CUTOFF="timestamptz '2026-09-13 12:00:00+00'"

counts() {
  local label="$1"
  "${PSQL[@]}" -P pager=off -c "
    select '$label' label,
      (select count(*) from sessions) sessions_total,
      (select count(*) from sessions where expires_at < $CUTOFF) sessions_expired,
      (select count(*) from auth_attempts) attempts_total,
      (select count(*) from auth_attempts where purpose='link') links_total,
      (select count(*) from auth_attempts where purpose='signin') anonymous_total,
      (select count(*) from auth_attempts where original_session_id in (select id from sessions where expires_at < $CUTOFF)) links_on_expired_sessions,
      (select count(*) from auth_attempts a left join sessions s on s.id=a.original_session_id where a.original_session_id is not null and s.id is null) orphan_links;
    select relname, pg_relation_size(oid) heap_bytes, pg_indexes_size(oid) index_bytes, pg_total_relation_size(oid) total_bytes
    from pg_class where oid in ('sessions'::regclass, 'auth_attempts'::regclass)
    order by relname;
  "
}

run_fixture() {
  local label="$1"
  local fixture="$2"
  "${PSQL[@]}" -f "$fixture" > "$DIR/${label}-seed.log"
  counts "$label-before" > "$DIR/${label}-before.log"

  for n in 1 2 3 4 5 6; do
    "${PSQL[@]}" -qAt -c "
      set max_parallel_workers_per_gather=0;
      set jit=off;
      begin;
      explain (analyze, buffers, wal, verbose) delete from sessions where expires_at < $CUTOFF;
      rollback;
    " > "$DIR/${label}-cascade-run-${n}.log"
  done
  awk '/Execution Time:/ {print $3}' "$DIR/${label}"-cascade-run-{2,3,4,5,6}.log | sort -n > "$DIR/${label}-cascade-warm-ms.log"

  "${PSQL[@]}" -qAt -c "select pg_current_wal_lsn()" > "$DIR/${label}-wal-before.log"
  "${PSQL[@]}" -P pager=off -c "
    set max_parallel_workers_per_gather=0;
    set jit=off;
    explain (analyze, buffers, wal, verbose) delete from sessions where expires_at < $CUTOFF;
  " > "$DIR/${label}-cascade-actual.log"
  "${PSQL[@]}" -qAt -c "select pg_current_wal_lsn()" > "$DIR/${label}-wal-after.log"
  "${PSQL[@]}" -P pager=off -c "select pg_wal_lsn_diff('$(cat "$DIR/${label}-wal-after.log")','$(cat "$DIR/${label}-wal-before.log")') as wal_lsn_bytes" > "$DIR/${label}-wal-diff.log"
  counts "$label-after" > "$DIR/${label}-after.log"

  for n in 1 2 3 4 5 6; do
    "${PSQL[@]}" -qAt -c "
      set max_parallel_workers_per_gather=0;
      set jit=off;
      explain (analyze, buffers, wal, verbose) delete from sessions where expires_at < $CUTOFF;
    " > "$DIR/${label}-repeat-run-${n}.log"
  done
  awk '/Execution Time:/ {print $3}' "$DIR/${label}"-repeat-run-{2,3,4,5,6}.log | sort -n > "$DIR/${label}-repeat-warm-ms.log"
}

"${PSQL[@]}" -P pager=off -c "select version(); show work_mem; show shared_buffers; show jit; show max_parallel_workers_per_gather; select count(*) migration_sql_files from pg_ls_dir('/drizzle') f where f like '%.sql';" > "$DIR/environment.log"
run_fixture household "$DIR/01-household.sql"
run_fixture growth "$DIR/02-growth.sql"

