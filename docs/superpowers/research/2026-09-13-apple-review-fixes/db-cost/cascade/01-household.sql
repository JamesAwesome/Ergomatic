\set ON_ERROR_STOP on
truncate auth_attempts, sessions, users cascade;

insert into users (id, google_sub, email, name)
select (
  substr(md5(('cascade-user-' || g)::text), 1, 8) || '-' ||
  substr(md5(('cascade-user-' || g)::text), 9, 4) || '-' ||
  substr(md5(('cascade-user-' || g)::text), 13, 4) || '-' ||
  substr(md5(('cascade-user-' || g)::text), 17, 4) || '-' ||
  substr(md5(('cascade-user-' || g)::text), 21, 12)
)::uuid,
'google-' || g,
'cascade-' || g || '@test.local',
'Cascade ' || g
from generate_series(1, 5) g;

insert into sessions (id, token_hash, user_id, created_at, expires_at)
select (
  substr(md5(('cascade-session-' || g)::text), 1, 8) || '-' ||
  substr(md5(('cascade-session-' || g)::text), 9, 4) || '-' ||
  substr(md5(('cascade-session-' || g)::text), 13, 4) || '-' ||
  substr(md5(('cascade-session-' || g)::text), 17, 4) || '-' ||
  substr(md5(('cascade-session-' || g)::text), 21, 12)
)::uuid,
md5(('cascade-token-a-' || g)::text) || md5(('cascade-token-b-' || g)::text),
(
  substr(md5(('cascade-user-' || (((g - 1) % 5) + 1))::text), 1, 8) || '-' ||
  substr(md5(('cascade-user-' || (((g - 1) % 5) + 1))::text), 9, 4) || '-' ||
  substr(md5(('cascade-user-' || (((g - 1) % 5) + 1))::text), 13, 4) || '-' ||
  substr(md5(('cascade-user-' || (((g - 1) % 5) + 1))::text), 17, 4) || '-' ||
  substr(md5(('cascade-user-' || (((g - 1) % 5) + 1))::text), 21, 12)
)::uuid,
timestamptz '2026-07-01 12:00:00+00' + g * interval '1 hour',
case when g % 5 = 0
  then timestamptz '2026-09-13 12:00:00+00' - g * interval '1 hour'
  else timestamptz '2026-09-13 12:00:00+00' + g * interval '1 day'
end
from generate_series(1, 25) g;

insert into auth_attempts (
  binding_hash, surface, purpose, target_provider, existing_provider,
  stage, version, state, nonce, original_session_id, created_at, expires_at,
  reauthenticated_at
)
select
  md5(('link-binding-' || row_number() over(order by id))::text),
  case when row_number() over(order by id) % 2 = 0 then 'native' else 'web' end,
  'link', 'apple', 'google', 'target_authorize', 1,
  md5(('link-state-a-' || row_number() over(order by id))::text) || md5(('link-state-b-' || row_number() over(order by id))::text),
  md5(('link-nonce-' || row_number() over(order by id))::text), id,
  timestamptz '2026-09-13 11:50:00+00',
  case when row_number() over(order by id) % 4 in (0, 1)
    then timestamptz '2026-09-13 11:55:00+00'
    else timestamptz '2026-09-13 12:05:00+00'
  end,
  timestamptz '2026-09-13 11:51:00+00'
from sessions;

insert into auth_attempts (
  binding_hash, surface, purpose, target_provider, stage, version, state,
  nonce, created_at, expires_at
)
select
  md5(('anon-binding-' || g)::text), 'web', 'signin', 'apple', 'authorize', 1,
  md5(('anon-state-a-' || g)::text) || md5(('anon-state-b-' || g)::text),
  md5(('anon-nonce-' || g)::text),
  timestamptz '2026-09-13 11:50:00+00',
  case when g % 2 = 0
    then timestamptz '2026-09-13 11:55:00+00'
    else timestamptz '2026-09-13 12:05:00+00'
  end
from generate_series(1, 511) g;

vacuum analyze sessions;
vacuum analyze auth_attempts;

