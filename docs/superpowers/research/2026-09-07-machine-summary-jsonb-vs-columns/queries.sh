U='030c1d9e-4787-4d73-8f1b-ee2ad4ce7704'
R='736be1bb-2d8b-45cc-a3bc-dda5b4c26f6c'
# --- Q2 detail read: stores/logs.ts get() -- select * where user_id and id
Q2A="select * from logs_a where user_id='$U' and id='$R';"
Q2B="select * from logs_b where user_id='$U' and id='$R';"

# --- Q3 history LIST: stores/logs.ts list(), LOG_LIST_COLUMNS, page of 50.
# Variant A: machineAvgPaceSecondsPer500m stays a jsonb-path read (as shipped).
LISTCOLS="id,user_id,workout_id,workout_title,workout_type,logged_at,baseline_k2,baseline_k6,held,effort,notes,device_name,source,thumbs,avg_split_seconds,distance_meters,time_seconds,plan_key,plan_index,ended_by,work_seconds,work_meters,rest_seconds,rest_meters,machine_work_seconds,machine_work_meters,c2_result_id,c2_user_id,completed_at,tz"
PARTIAL="coalesce(source='pm5' and jsonb_array_length(steps)>0 and ended_by in ('rower','link-lost','program-dropped','program-failed','interrupted') and exists (select 1 from jsonb_array_elements(steps) as s where not (s ? 'actualSource')), false) as partial"
AVGPACE="case when jsonb_typeof(machine_summary->'avgPaceSecondsPer500m')='number' then (machine_summary->>'avgPaceSecondsPer500m')::double precision else null end as machine_avg_pace"
Q3A="select $LISTCOLS, $AVGPACE, $PARTIAL from logs_a where user_id='$U' order by logged_at desc, id desc limit 50;"
Q3B="select $LISTCOLS, $AVGPACE, $PARTIAL from logs_b where user_id='$U' order by logged_at desc, id desc limit 50;"
# Variant A's list would ALSO have to project the four new numbers if history ever shows them:
Q3A_PLUS="select $LISTCOLS, $AVGPACE, $PARTIAL, (machine_summary->>'totalCalories')::int c, (machine_summary->>'avgWatts')::int w, (machine_summary->>'avgCalPerHour')::int ch, (machine_summary->>'totalRestMeters')::int rm from logs_a where user_id='$U' order by logged_at desc, id desc limit 50;"
Q3B_PLUS="select $LISTCOLS, $AVGPACE, $PARTIAL, machine_calories c, machine_avg_watts w, machine_cal_per_hour ch, machine_rest_meters rm from logs_b where user_id='$U' order by logged_at desc, id desc limit 50;"

# --- Q4 personal-stats aggregates
Q4A_MONTH="select date_trunc('month',logged_at) m, sum((machine_summary->>'totalCalories')::int) cal, avg((machine_summary->>'avgWatts')::int) w from logs_a where user_id='$U' and logged_at > now() - interval '12 months' group by 1 order by 1;"
Q4B_MONTH="select date_trunc('month',logged_at) m, sum(machine_calories) cal, avg(machine_avg_watts) w from logs_b where user_id='$U' and logged_at > now() - interval '12 months' group by 1 order by 1;"
Q4A_MAX="select max((machine_summary->>'avgWatts')::int) from logs_a where user_id='$U';"
Q4B_MAX="select max(machine_avg_watts) from logs_b where user_id='$U';"
# whole-cohort variant (a leaderboard / all-users roll-up)
Q4A_ALL="select date_trunc('month',logged_at) m, sum((machine_summary->>'totalCalories')::int) cal, avg((machine_summary->>'avgWatts')::int) w from logs_a where logged_at > now() - interval '12 months' group by 1 order by 1;"
Q4B_ALL="select date_trunc('month',logged_at) m, sum(machine_calories) cal, avg(machine_avg_watts) w from logs_b where logged_at > now() - interval '12 months' group by 1 order by 1;"

# --- Q6 filter
Q6A="select id, logged_at from logs_a where user_id='$U' and (machine_summary->>'avgWatts')::int > 180 order by logged_at desc;"
Q6B="select id, logged_at from logs_b where user_id='$U' and machine_avg_watts > 180 order by logged_at desc;"
