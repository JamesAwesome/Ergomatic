-- Deterministic-ish generator. Writes variant A, then derives variant B
-- from it so both hold IDENTICAL logical data (only placement differs).
create or replace function dba_gen_a(lo bigint, hi bigint) returns void language plpgsql as $fn$
begin
insert into logs_a (
  id, user_id, workout_id, workout_title, workout_type, logged_at,
  baseline_k2, baseline_k6, held, effort, notes, steps, device_name,
  thumbs, avg_split_seconds, distance_meters, time_seconds,
  plan_key, plan_index, series, ended_by,
  work_seconds, work_meters, rest_seconds, rest_meters,
  machine_work_seconds, machine_work_meters, machine_summary,
  c2_result_id, c2_user_id, completed_at, tz, source)
select
  gen_random_uuid(),
  u.id,
  null,
  'Session ' || g,
  (array['AN','O2','AT','TR'])[1 + (g % 4)],
  timestamptz '2023-09-06 06:00:00+00' + ((g % 1095) || ' days')::interval
    + ((g % 41) * 17 || ' minutes')::interval,
  112.4, 118.9,
  (array['held','under','over'])[1 + (g % 3)]::held_result,
  1 + (g % 5),
  case when g % 7 = 0 then 'felt strong on the last piece' else null end,
  (select jsonb_agg(jsonb_build_object(
      'label', 'Interval ' || i,
      'targetSplit', 112.0 + (i % 5),
      'actualSplit', 111.4 + ((g + i) % 7) * 0.3,
      'actualSource', 'pm5',
      'spm', 22 + (i % 4),
      'meters', 500 * (1 + (i % 4)),
      'seconds', 120 * (1 + (i % 4)),
      'avgHr', 140 + ((g + i) % 30),
      'actualSeconds', 119.4 + (i % 3),
      'actualMeters', 500 * (1 + (i % 4)),
      'actualSpm', 22 + ((g + i) % 5),
      'machineCalories', 20 + ((g + i) % 60),
      'machineCalPerHour', 700 + ((g + i) % 400),
      'machineWatts', 120 + ((g + i) % 90),
      'machineDragFactor', 110 + (i % 20),
      'machineRestHr', case when i % 3 = 0 then null else 120 + (i % 25) end))
   from generate_series(1, 3 + (g % 6)) i),
  case when ispm then 'PM5 4323' || (g % 100000) || ' Row' else null end,
  (array['up','down'])[1 + (g % 2)]::thumbs,
  111.8 + (g % 9) * 0.4,
  2000 + (g % 6000),
  460.4 + (g % 900),
  case when g % 5 = 0 then 'sprint' else null end,
  case when g % 5 = 0 then (g % 12) else null end,
  null,
  case when ispm then (array['finished','finished','finished','rower','link-lost'])[1 + (g % 5)]::ended_by else null end,
  case when ispm then 398.4 + (g % 700) else null end,
  case when ispm then 2000 + (g % 6000) else null end,
  case when ispm then 60.0 * (g % 4) else null end,
  case when ispm then 130 * (g % 3) else null end,
  case when ispm then 398.4 + (g % 700) else null end,
  case when ispm then 2000 + (g % 6000) else null end,
  case when ispm then
    jsonb_build_object(
      'avgStrokeRate', 22 + (g % 8),
      'endingHeartRateBpm', case when g % 11 = 0 then null else 140 + (g % 30) end,
      'avgHeartRateBpm', case when g % 11 = 0 then null else 148 + (g % 20) end,
      'minHeartRateBpm', case when g % 11 = 0 then null else 95 + (g % 15) end,
      'maxHeartRateBpm', case when g % 11 = 0 then null else 168 + (g % 12) end,
      'dragFactorAverage', 110 + (g % 20),
      'workoutType', (g % 8),
      'recoveryHeartRateBpm', case when g % 13 = 0 then null else 115 + (g % 20) end,
      'avgPaceSecondsPer500m', 111.8 + (g % 9) * 0.4,
      'verificationBytes', (select jsonb_agg((g * b) % 256) from generate_series(1,19) b),
      'totalCalories', 200 + (g % 400),
      'avgWatts', 120 + (g % 130),
      'avgCalPerHour', 700 + (g % 500),
      'totalRestMeters', (g % 5) * 137)
  else null end,
  case when ispm and g % 3 = 0 then 900000 + g else null end,
  case when ispm and g % 3 = 0 then 100000 + (g % 40) else null end,
  case when ispm then timestamptz '2023-09-06 06:00:00+00' + ((g % 1095) || ' days')::interval else null end,
  case when ispm then 'Europe/London' else null end,
  (case when ispm then 'pm5' when g % 10 = 7 then 'timer' when g % 10 = 8 then 'manual' else 'no-reading' end)::log_source
from generate_series(lo, hi) g
cross join lateral (select (g % 10) < 7 as ispm) f
join dba_users u on u.idx = (g % 40);

end $fn$;


create or replace function dba_build_b() returns void language plpgsql as $fn2$
begin
  truncate logs_b;
  insert into logs_b select
    l.id, l.user_id, l.workout_id, l.workout_title, l.workout_type, l.logged_at,
    l.baseline_k2, l.baseline_k6, l.held, l.effort, l.notes, l.steps, l.device_name,
    l.thumbs, l.avg_split_seconds, l.distance_meters, l.time_seconds,
    l.plan_key, l.plan_index, l.series, l.ended_by,
    l.work_seconds, l.work_meters, l.rest_seconds, l.rest_meters,
    l.machine_work_seconds, l.machine_work_meters,
    l.machine_summary - 'totalCalories' - 'avgWatts' - 'avgCalPerHour' - 'totalRestMeters',
    l.c2_result_id, l.c2_user_id, l.completed_at, l.tz, l.source,
    (l.machine_summary->>'totalCalories')::int,
    (l.machine_summary->>'avgWatts')::int,
    (l.machine_summary->>'avgCalPerHour')::int,
    (l.machine_summary->>'totalRestMeters')::int
  from logs_a l;
end $fn2$;
