#!/usr/bin/env bash
# Q_STATS is the SHIPPED query text for the plan's statsRows(), taken VERBATIM
# from drizzle's own .toSQL() over the prescribed STATS_ROW_COLUMNS
# (Task 4 Step 2). Reproduce with app/dba-tosql.ts in the scratchpad README.
# %s is the user id.
Q_STATS='select "id", "logged_at", "source", "workout_type", "ended_by", "machine_work_seconds", "machine_work_meters", "work_seconds", "work_meters", "rest_seconds", "rest_meters", "distance_meters", "time_seconds", "steps", case when jsonb_typeof("machine_summary"->'"'"'totalCalories'"'"') = '"'"'number'"'"' then ("machine_summary"->>'"'"'totalCalories'"'"')::double precision else null end from "session_logs" where "session_logs"."user_id" = '"'"'%s'"'"';'

# The same projection minus the case-expression, to price the totalCalories extract.
Q_NOCAL='select "id", "logged_at", "source", "workout_type", "ended_by", "machine_work_seconds", "machine_work_meters", "work_seconds", "work_meters", "rest_seconds", "rest_meters", "distance_meters", "time_seconds", "steps" from "session_logs" where "session_logs"."user_id" = '"'"'%s'"'"';'

# Scalars only (no steps) — prices the steps jsonb crossing the wire.
Q_SCALAR='select "id", "logged_at", "source", "workout_type", "ended_by", "machine_work_seconds", "machine_work_meters", "work_seconds", "work_meters", "rest_seconds", "rest_meters", "distance_meters", "time_seconds", case when jsonb_typeof("machine_summary"->'"'"'totalCalories'"'"') = '"'"'number'"'"' then ("machine_summary"->>'"'"'totalCalories'"'"')::double precision else null end from "session_logs" where "session_logs"."user_id" = '"'"'%s'"'"';'
