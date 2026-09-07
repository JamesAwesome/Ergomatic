\pset format aligned
select 'rows' k, (select count(*) from logs_a)::text a, (select count(*) from logs_b)::text b;
select
  t as variant,
  pg_size_pretty(pg_relation_size(t))            as heap,
  pg_size_pretty(pg_indexes_size(t))             as indexes,
  pg_size_pretty(coalesce(pg_relation_size(reltoastrelid),0)) as toast_heap,
  pg_size_pretty(pg_total_relation_size(t))      as total,
  pg_total_relation_size(t)                      as total_bytes
from (values ('logs_a'),('logs_b')) v(t)
join pg_class c on c.oid = t::regclass;
-- TOAST: is machine_summary or steps out of line?
select 'logs_a' t,
  count(*) filter (where machine_summary is not null) as ms_rows,
  round(avg(pg_column_size(machine_summary))) as ms_avg_colsize,
  max(pg_column_size(machine_summary)) as ms_max_colsize,
  round(avg(length(machine_summary::text))) as ms_avg_jsontext,
  max(length(machine_summary::text)) as ms_max_jsontext,
  round(avg(pg_column_size(steps))) as steps_avg_colsize,
  max(pg_column_size(steps)) as steps_max_colsize,
  round(avg(length(steps::text))) as steps_avg_jsontext,
  max(length(steps::text)) as steps_max_jsontext
from logs_a
union all
select 'logs_b',
  count(*) filter (where machine_summary is not null),
  round(avg(pg_column_size(machine_summary))), max(pg_column_size(machine_summary)),
  round(avg(length(machine_summary::text))), max(length(machine_summary::text)),
  round(avg(pg_column_size(steps))), max(pg_column_size(steps)),
  round(avg(length(steps::text))), max(length(steps::text))
from logs_b;
-- whole-row width
select 'logs_a' t, round(avg(pg_column_size(logs_a.*))) avg_row_bytes, max(pg_column_size(logs_a.*)) max_row_bytes from logs_a
union all
select 'logs_b', round(avg(pg_column_size(logs_b.*))), max(pg_column_size(logs_b.*)) from logs_b;
