#!/usr/bin/env bash
set -euo pipefail

PGURL='postgres://postgres:dev@127.0.0.1:5432/postgres'
DIR="$(cd "$(dirname "$0")" && pwd)"
PSQL=(psql "$PGURL" -X -v ON_ERROR_STOP=1)
CUTOFF="timestamptz '2026-09-13 12:00:00+00'"

run_fixture() {
  local label="$1"
  local fixture="$2"
  "${PSQL[@]}" -f "$fixture" > "$DIR/${label}-seed.log"
  "${PSQL[@]}" -P pager=off -c "
    select '$label' as fixture,
      count(*) as total_rows,
      count(*) filter (where expires_at < $CUTOFF) as expired_rows,
      count(*) filter (where expires_at >= $CUTOFF) as live_rows,
      pg_relation_size('sessions') as heap_bytes,
      pg_indexes_size('sessions') as index_bytes,
      pg_total_relation_size('sessions') as total_bytes
    from sessions;
    select indexname, indexdef from pg_indexes where tablename='sessions' order by indexname;
  " > "$DIR/${label}-before.log"

  for n in 1 2 3 4 5 6; do
    "${PSQL[@]}" -qAt -c "
      set max_parallel_workers_per_gather=0;
      set jit=off;
      begin;
      explain (analyze, buffers, wal) delete from sessions where expires_at < $CUTOFF;
      rollback;
    " > "$DIR/${label}-delete-run-${n}.log"
  done
  awk '/Execution Time:/ {print $3}' "$DIR/${label}"-delete-run-{2,3,4,5,6}.log | sort -n > "$DIR/${label}-delete-warm-ms.log"

  "${PSQL[@]}" -P pager=off -c "
    set max_parallel_workers_per_gather=0;
    set jit=off;
    explain (analyze, buffers, wal) delete from sessions where expires_at < $CUTOFF;
  " > "$DIR/${label}-delete-actual.log"
  "${PSQL[@]}" -P pager=off -c "
    select '$label-after-delete' as fixture,
      count(*) as total_rows,
      count(*) filter (where expires_at < $CUTOFF) as expired_rows,
      count(*) filter (where expires_at >= $CUTOFF) as live_rows,
      pg_relation_size('sessions') as heap_bytes,
      pg_indexes_size('sessions') as index_bytes,
      pg_total_relation_size('sessions') as total_bytes
    from sessions;
  " > "$DIR/${label}-after.log"

  for n in 1 2 3 4 5 6; do
    "${PSQL[@]}" -qAt -c "
      set max_parallel_workers_per_gather=0;
      set jit=off;
      explain (analyze, buffers, wal) delete from sessions where expires_at < $CUTOFF;
    " > "$DIR/${label}-repeat-run-${n}.log"
  done
  awk '/Execution Time:/ {print $3}' "$DIR/${label}"-repeat-run-{2,3,4,5,6}.log | sort -n > "$DIR/${label}-repeat-warm-ms.log"
}

"${PSQL[@]}" -f "$DIR/01-schema.sql" > "$DIR/schema.log"
"${PSQL[@]}" -P pager=off -c "select version(); show work_mem; show shared_buffers; show jit; show max_parallel_workers_per_gather;" > "$DIR/environment.log"
run_fixture household "$DIR/02-household.sql"
run_fixture growth "$DIR/03-growth.sql"
"${PSQL[@]}" -c 'vacuum analyze sessions' > "$DIR/growth-vacuum.log"
for n in 1 2 3 4 5 6; do
  "${PSQL[@]}" -qAt -c "
    set max_parallel_workers_per_gather=0;
    set jit=off;
    explain (analyze, buffers, wal) delete from sessions where expires_at < $CUTOFF;
  " > "$DIR/growth-vacuum-repeat-run-${n}.log"
done
awk '/Execution Time:/ {print $3}' "$DIR/growth-vacuum-repeat-run-"{2,3,4,5,6}".log" | sort -n > "$DIR/growth-vacuum-repeat-warm-ms.log"
