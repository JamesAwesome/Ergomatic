-- Variant A: the branch's shape (four keys inside machine_summary jsonb)
-- Variant B: the spec's original shape (four nullable integer columns)
drop table if exists logs_a, logs_b, dba_users;
create table logs_a (like session_logs including all);
create table logs_b (like session_logs including all);
alter table logs_b
  add column machine_calories integer,
  add column machine_avg_watts integer,
  add column machine_cal_per_hour integer,
  add column machine_rest_meters integer;

create table dba_users (idx int primary key, id uuid not null);
insert into dba_users select g, gen_random_uuid() from generate_series(0,39) g;
