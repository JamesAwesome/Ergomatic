\set ON_ERROR_STOP on
truncate sessions;
insert into sessions (id, token_hash, user_id, created_at, expires_at)
select (
  substr(md5(('growth-session-' || g)::text), 1, 8) || '-' ||
  substr(md5(('growth-session-' || g)::text), 9, 4) || '-' ||
  substr(md5(('growth-session-' || g)::text), 13, 4) || '-' ||
  substr(md5(('growth-session-' || g)::text), 17, 4) || '-' ||
  substr(md5(('growth-session-' || g)::text), 21, 12)
)::uuid,
md5(('growth-token-a-' || g)::text) || md5(('growth-token-b-' || g)::text),
(
  substr(md5((((g - 1) % 5) + 1)::text), 1, 8) || '-' ||
  substr(md5((((g - 1) % 5) + 1)::text), 9, 4) || '-' ||
  substr(md5((((g - 1) % 5) + 1)::text), 13, 4) || '-' ||
  substr(md5((((g - 1) % 5) + 1)::text), 17, 4) || '-' ||
  substr(md5((((g - 1) % 5) + 1)::text), 21, 12)
)::uuid,
timestamptz '2026-06-01 12:00:00+00' + (g % 2000) * interval '1 minute',
case when g % 10 = 0
  then timestamptz '2026-09-13 12:00:00+00' - (g % 10000 + 1) * interval '1 second'
  else timestamptz '2026-09-13 12:00:00+00' + (g % 5184000 + 1) * interval '1 second'
end
from generate_series(1, 100000) g;
vacuum analyze sessions;

