\set ON_ERROR_STOP on
drop table if exists sessions;
drop table if exists users;

create table users (
  id uuid primary key,
  email text not null unique,
  name text not null,
  google_sub text unique,
  apple_sub text unique,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key,
  token_hash text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_id_idx on sessions(user_id);

insert into users (id, email, name)
select (
  substr(md5(g::text), 1, 8) || '-' ||
  substr(md5(g::text), 9, 4) || '-' ||
  substr(md5(g::text), 13, 4) || '-' ||
  substr(md5(g::text), 17, 4) || '-' ||
  substr(md5(g::text), 21, 12)
)::uuid,
'dba-' || g || '@test.local',
'DBA ' || g
from generate_series(1, 5) g;

