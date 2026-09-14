#!/usr/bin/env bash
set -euo pipefail

PGURL='postgres://postgres:dev@127.0.0.1:5432/postgres'
DIR="$(cd "$(dirname "$0")" && pwd)"
PSQL=(psql "$PGURL" -X -v ON_ERROR_STOP=1)
CUTOFF="timestamptz '2026-09-13 12:00:00+00'"

"${PSQL[@]}" -f "$DIR/01-household.sql" > "$DIR/lock-seed.log"
cascade_attempt_id="$("${PSQL[@]}" -qAt -c "select a.id from auth_attempts a join sessions s on s.id=a.original_session_id where s.expires_at < $CUTOFF order by a.id limit 1")"
retained_attempt_id="$("${PSQL[@]}" -qAt -c "select a.id from auth_attempts a join sessions s on s.id=a.original_session_id where s.expires_at >= $CUTOFF order by a.id limit 1")"
anonymous_id="$("${PSQL[@]}" -qAt -c "select id from auth_attempts where original_session_id is null order by id limit 1")"
expired_session_id="$("${PSQL[@]}" -qAt -c "select id from sessions where expires_at < $CUTOFF order by id limit 1")"
live_session_id="$("${PSQL[@]}" -qAt -c "select id from sessions where expires_at >= $CUTOFF order by id limit 1")"

"${PSQL[@]}" -qAt -c "
  set application_name='cascade-holder';
  begin;
  delete from sessions where expires_at < $CUTOFF;
  select pg_sleep(5);
  commit;
" > "$DIR/lock-holder.log" &
holder_pid=$!

for _ in $(seq 1 50); do
  state="$("${PSQL[@]}" -qAt -c "select state || ':' || wait_event_type || ':' || wait_event from pg_stat_activity where application_name='cascade-holder'")"
  if [[ "$state" == active:Timeout:PgSleep ]]; then break; fi
  sleep 0.1
done

"${PSQL[@]}" -P pager=off -c "
  select locktype, mode, granted, relation::regclass as relation
  from pg_locks l join pg_stat_activity a on a.pid=l.pid
  where a.application_name='cascade-holder'
  order by locktype, relation::text nulls last, mode;
" > "$DIR/lock-held-locks.log"

for probe in "live-session:$live_session_id:sessions" "retained-link:$retained_attempt_id:auth_attempts" "anonymous:$anonymous_id:auth_attempts" "expired-session:$expired_session_id:sessions" "cascaded-link:$cascade_attempt_id:auth_attempts"; do
  IFS=: read -r label id table <<< "$probe"
  set +e
  "${PSQL[@]}" -P pager=off -c "set lock_timeout='250ms'; update $table set id=id where id='$id';" > "$DIR/lock-${label}.log" 2>&1
  status=$?
  set -e
  printf '%s_exit=%s\n' "$label" "$status" >> "$DIR/lock-${label}.log"
done
wait "$holder_pid"

"${PSQL[@]}" -P pager=off -c "select count(*) sessions, (select count(*) from auth_attempts where purpose='link') links, (select count(*) from auth_attempts where purpose='signin') anonymous from sessions;" > "$DIR/lock-after.log"

