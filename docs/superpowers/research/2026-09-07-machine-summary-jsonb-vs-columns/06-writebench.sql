\pset format aligned
-- INSERT: one realistic pm5 row, full shape, per iteration.
create temp table res(label text, ms numeric, wal bigint);
insert into res select 'A insert x1000', ms, wal_bytes from dba_time_wal($$
  insert into logs_a (id,user_id,workout_title,workout_type,logged_at,steps,source,
    held,effort,avg_split_seconds,distance_meters,time_seconds,ended_by,
    work_seconds,work_meters,rest_seconds,rest_meters,machine_work_seconds,machine_work_meters,
    machine_summary,completed_at,tz)
  select gen_random_uuid(),'030c1d9e-4787-4d73-8f1b-ee2ad4ce7704','Bench '||$1,'O2',now(),
    (select jsonb_agg(jsonb_build_object('label','Interval '||i,'targetSplit',112.0,'actualSplit',111.6,
      'actualSource','pm5','spm',24,'meters',2000,'seconds',480,'avgHr',151,'actualSeconds',479.4,
      'actualMeters',2000,'actualSpm',23,'machineCalories',53,'machineCalPerHour',842,'machineWatts',162,
      'machineDragFactor',118,'machineRestHr',null)) from generate_series(1,5) i),
    'pm5','held',3,111.8,6000,1380.4,'finished',1380.4,6000,0,0,1380.4,6000,
    jsonb_build_object('avgStrokeRate',24,'endingHeartRateBpm',148,'avgHeartRateBpm',152,
      'minHeartRateBpm',98,'maxHeartRateBpm',171,'dragFactorAverage',118,'workoutType',1,
      'recoveryHeartRateBpm',120,'avgPaceSecondsPer500m',111.8,
      'verificationBytes',(select jsonb_agg(b) from generate_series(1,19) b),
      'totalCalories',372,'avgWatts',162,'avgCalPerHour',858,'totalRestMeters',274),
    now(),'Europe/London'
$$, 1000);
insert into res select 'B insert x1000', ms, wal_bytes from dba_time_wal($$
  insert into logs_b (id,user_id,workout_title,workout_type,logged_at,steps,source,
    held,effort,avg_split_seconds,distance_meters,time_seconds,ended_by,
    work_seconds,work_meters,rest_seconds,rest_meters,machine_work_seconds,machine_work_meters,
    machine_summary,completed_at,tz,
    machine_calories,machine_avg_watts,machine_cal_per_hour,machine_rest_meters)
  select gen_random_uuid(),'030c1d9e-4787-4d73-8f1b-ee2ad4ce7704','Bench '||$1,'O2',now(),
    (select jsonb_agg(jsonb_build_object('label','Interval '||i,'targetSplit',112.0,'actualSplit',111.6,
      'actualSource','pm5','spm',24,'meters',2000,'seconds',480,'avgHr',151,'actualSeconds',479.4,
      'actualMeters',2000,'actualSpm',23,'machineCalories',53,'machineCalPerHour',842,'machineWatts',162,
      'machineDragFactor',118,'machineRestHr',null)) from generate_series(1,5) i),
    'pm5','held',3,111.8,6000,1380.4,'finished',1380.4,6000,0,0,1380.4,6000,
    jsonb_build_object('avgStrokeRate',24,'endingHeartRateBpm',148,'avgHeartRateBpm',152,
      'minHeartRateBpm',98,'maxHeartRateBpm',171,'dragFactorAverage',118,'workoutType',1,
      'recoveryHeartRateBpm',120,'avgPaceSecondsPer500m',111.8,
      'verificationBytes',(select jsonb_agg(b) from generate_series(1,19) b)),
    now(),'Europe/London',372,162,858,274
$$, 1000);
-- UPDATE: set the four fields on 1000 distinct existing rows.
create temp table ida as select id, row_number() over () rn from logs_a where source='pm5' limit 1000;
create temp table idb as select id, row_number() over () rn from logs_b where source='pm5' limit 1000;
insert into res select 'A update x1000', ms, wal_bytes from dba_time_wal($$
  update logs_a set machine_summary = machine_summary || jsonb_build_object(
    'totalCalories',373,'avgWatts',163,'avgCalPerHour',859,'totalRestMeters',275)
  where id = (select id from ida where rn = $1)
$$, 1000);
insert into res select 'B update x1000', ms, wal_bytes from dba_time_wal($$
  update logs_b set machine_calories=373, machine_avg_watts=163,
    machine_cal_per_hour=859, machine_rest_meters=275
  where id = (select id from idb where rn = $1)
$$, 1000);
select label, round(ms,1) as ms, pg_size_pretty(wal) as wal_generated, wal as wal_bytes,
       round(wal/1000.0) as wal_bytes_per_row from res;
