#!/usr/bin/env bash
set -euo pipefail

PGURL='postgres://postgres:dev@127.0.0.1:5432/postgres'
DIR="$(cd "$(dirname "$0")" && pwd)"
PSQL=(psql "$PGURL" -X -v ON_ERROR_STOP=1)
CUTOFF="timestamptz '2026-09-13 12:00:00+00'"

"${PSQL[@]}" -f "$DIR/02-household.sql" > "$DIR/lock-seed.log"
expired_id="$("${PSQL[@]}" -qAt -c "select id from sessions where expires_at < $CUTOFF order by id limit 1")"
live_id="$("${PSQL[@]}" -qAt -c "select id from sessions where expires_at >= $CUTOFF order by id limit 1")"

"${PSQL[@]}" -qAt -c "
  set application_name='sweep-holder';
  begin;
  delete from sessions where expires_at < $CUTOFF;
  select pg_sleep(4);
  commit;
" > "$DIR/lock-holder.log" &
holder_pid=$!

for _ in $(seq 1 40); do
  state="$("${PSQL[@]}" -qAt -c "select state || ':' || wait_event_type || ':' || wait_event from pg_stat_activity where application_name='sweep-holder'")"
  if [[ "$state" == active:Timeout:PgSleep ]]; then break; fi
  sleep 0.1
done

"${PSQL[@]}" -P pager=off -c "
  select locktype, mode, granted, relation::regclass as relation
  from pg_locks l
  join pg_stat_activity a on a.pid=l.pid
  where a.application_name='sweep-holder'
  order by locktype, relation::text nulls last, mode;
" > "$DIR/lock-held-locks.log"

"${PSQL[@]}" -P pager=off -c "
  set lock_timeout='250ms';
  update sessions set token_hash=token_hash where id='$live_id';
" > "$DIR/lock-live-update.log"

set +e
"${PSQL[@]}" -P pager=off -c "
  set lock_timeout='250ms';
  update sessions set token_hash=token_hash where id='$expired_id';
" > "$DIR/lock-expired-update.log" 2>&1
expired_status=$?
set -e
printf 'expired_update_exit=%s\n' "$expired_status" >> "$DIR/lock-expired-update.log"
wait "$holder_pid"

"${PSQL[@]}" -P pager=off -c "
  select count(*) as total_rows,
    count(*) filter (where expires_at < $CUTOFF) as expired_rows,
    count(*) filter (where expires_at >= $CUTOFF) as live_rows
  from sessions;
" > "$DIR/lock-after.log"
