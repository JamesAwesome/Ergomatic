\timing on
-- (i) the list index, identical for both shapes
create index la_list on logs_a (user_id, logged_at desc, id desc);
create index lb_list on logs_b (user_id, logged_at desc, id desc);
-- (ii) filter/max support: expression index (A) vs plain btree (B)
create index la_watts on logs_a (user_id, ((machine_summary->>'avgWatts')::int));
create index lb_watts on logs_b (user_id, machine_avg_watts);
-- (iii) covering index for the monthly aggregate.
--   B: a real INCLUDE index -> index-only scan.
--   A: INCLUDE accepts COLUMNS ONLY, never an expression, so the best A can do
--      is include the whole machine_summary jsonb blob.
create index lb_cover on logs_b (user_id, logged_at) include (machine_calories, machine_avg_watts);
create index la_cover on logs_a (user_id, logged_at) include (machine_summary);
