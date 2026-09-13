#!/usr/bin/env bash
set -euo pipefail

PGURL='postgres://postgres:dev@127.0.0.1:5432/postgres'
DIR="$(cd "$(dirname "$0")" && pwd)"
PSQL=(psql "$PGURL" -X -v ON_ERROR_STOP=1)
CUTOFF="timestamptz '2026-09-13 12:00:00+00'"

"${PSQL[@]}" -f "$DIR/02-growth.sql" > "$DIR/concurrent-seed.log"
"${PSQL[@]}" -P pager=off -c "
  select count(*) filter(where s.expires_at < $CUTOFF and a.expires_at <= $CUTOFF) expired_parent_expired_link,
    count(*) filter(where s.expires_at < $CUTOFF and a.expires_at > $CUTOFF) expired_parent_live_link,
    count(*) filter(where s.expires_at >= $CUTOFF and a.expires_at <= $CUTOFF) live_parent_expired_link,
    count(*) filter(where s.expires_at >= $CUTOFF and a.expires_at > $CUTOFF) live_parent_live_link
  from sessions s join auth_attempts a on a.original_session_id=s.id;
  select count(*) filter(where expires_at <= $CUTOFF) anonymous_expired,
    count(*) filter(where expires_at > $CUTOFF) anonymous_live
  from auth_attempts where purpose='signin';
" > "$DIR/concurrent-before.log"

"${PSQL[@]}" -P pager=off -c "\\timing on" -c "delete from auth_attempts where expires_at <= $CUTOFF;" > "$DIR/concurrent-attempt-sweep.log" 2>&1 &
attempt_pid=$!
"${PSQL[@]}" -P pager=off -c "\\timing on" -c "delete from sessions where expires_at < $CUTOFF;" > "$DIR/concurrent-session-sweep.log" 2>&1 &
session_pid=$!

set +e
wait "$attempt_pid"; attempt_status=$?
wait "$session_pid"; session_status=$?
set -e
printf 'attempt_status=%s session_status=%s\n' "$attempt_status" "$session_status" > "$DIR/concurrent-status.log"

"${PSQL[@]}" -P pager=off -c "
  select (select count(*) from sessions) sessions,
    (select count(*) from sessions where expires_at < $CUTOFF) expired_sessions,
    (select count(*) from auth_attempts where purpose='link') links,
    (select count(*) from auth_attempts where purpose='signin') anonymous,
    (select count(*) from auth_attempts where expires_at <= $CUTOFF) expired_attempts,
    (select count(*) from auth_attempts a left join sessions s on s.id=a.original_session_id where a.original_session_id is not null and s.id is null) orphan_links;
" > "$DIR/concurrent-after.log"

