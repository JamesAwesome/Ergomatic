\set ON_ERROR_STOP on
truncate sessions;
insert into sessions (id, token_hash, user_id, created_at, expires_at)
select (
  substr(md5(('session-' || g)::text), 1, 8) || '-' ||
  substr(md5(('session-' || g)::text), 9, 4) || '-' ||
  substr(md5(('session-' || g)::text), 13, 4) || '-' ||
  substr(md5(('session-' || g)::text), 17, 4) || '-' ||
  substr(md5(('session-' || g)::text), 21, 12)
)::uuid,
md5(('token-a-' || g)::text) || md5(('token-b-' || g)::text),
(
  substr(md5((((g - 1) % 5) + 1)::text), 1, 8) || '-' ||
  substr(md5((((g - 1) % 5) + 1)::text), 9, 4) || '-' ||
  substr(md5((((g - 1) % 5) + 1)::text), 13, 4) || '-' ||
  substr(md5((((g - 1) % 5) + 1)::text), 17, 4) || '-' ||
  substr(md5((((g - 1) % 5) + 1)::text), 21, 12)
)::uuid,
timestamptz '2026-07-01 12:00:00+00' + g * interval '1 hour',
case when g % 5 = 0
  then timestamptz '2026-09-13 12:00:00+00' - g * interval '1 hour'
  else timestamptz '2026-09-13 12:00:00+00' + g * interval '1 day'
end
from generate_series(1, 25) g;
vacuum analyze sessions;

