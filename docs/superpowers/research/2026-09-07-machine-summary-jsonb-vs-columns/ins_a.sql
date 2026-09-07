insert into logs_a (id,user_id,workout_title,workout_type,logged_at,steps,source,held,effort,
  avg_split_seconds,distance_meters,time_seconds,ended_by,work_seconds,work_meters,rest_seconds,rest_meters,
  machine_work_seconds,machine_work_meters,machine_summary,completed_at,tz)
select gen_random_uuid(),'030c1d9e-4787-4d73-8f1b-ee2ad4ce7704','WALbench '||n,'O2',now(),
  (select jsonb_agg(jsonb_build_object('label','Interval '||i,'targetSplit',112.0,'actualSplit',111.6,
    'actualSource','pm5','spm',24,'meters',2000,'seconds',480,'avgHr',151,'actualSeconds',479.4,
    'actualMeters',2000,'actualSpm',23,'machineCalories',53,'machineCalPerHour',842,'machineWatts',162,
    'machineDragFactor',118,'machineRestHr',null)) from generate_series(1,5) i),
  'pm5','held',3,111.8,6000,1380.4,'finished',1380.4,6000,0,0,1380.4,6000,
  jsonb_build_object('avgStrokeRate',24,'endingHeartRateBpm',148,'avgHeartRateBpm',152,'minHeartRateBpm',98,
    'maxHeartRateBpm',171,'dragFactorAverage',118,'workoutType',1,'recoveryHeartRateBpm',120,
    'avgPaceSecondsPer500m',111.8,'verificationBytes',(select jsonb_agg(b) from generate_series(1,19) b),'totalCalories',372,'avgWatts',162,'avgCalPerHour',858,'totalRestMeters',274),
  now(),'Europe/London'
from generate_series(1,1000) n;