-- Write cost: 1000 single-row inserts, then 1000 updates that set the four
-- fields, each shape. Reports wall time AND WAL bytes generated.
create or replace function dba_time_wal(stmt text, reps int) returns table(ms numeric, wal_bytes bigint)
language plpgsql as $f$
declare t0 timestamptz; l0 pg_lsn; l1 pg_lsn; i int;
begin
  perform pg_switch_wal();
  l0 := pg_current_wal_lsn(); t0 := clock_timestamp();
  for i in 1..reps loop execute stmt using i; end loop;
  ms := extract(epoch from (clock_timestamp()-t0))*1000;
  l1 := pg_current_wal_lsn(); wal_bytes := l1 - l0;
  return next;
end $f$;
