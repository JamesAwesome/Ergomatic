#!/bin/bash
# bench.sh <label> <sql>  -- 6 runs in ONE psql session, discard run 1, print median of 5.
# $BENCH_PRE is prepended (e.g. "set max_parallel_workers_per_gather=0;")
LABEL="$1"; SQL="$2"
OUT=$( { echo "${BENCH_PRE}"; echo "\\timing on"; echo "\\o /dev/null"; for i in 1 2 3 4 5 6; do echo "$SQL"; done; } \
  | docker exec -i erg-dba-pg psql -U postgres -q 2>&1 | grep -o 'Time: [0-9.]*' | awk '{print $2}' )
MED=$(echo "$OUT" | tail -n +2 | sort -g | awk '{a[NR]=$1} END{print a[int((NR+1)/2)]}')
ALL=$(echo "$OUT" | tail -n +2 | tr '\n' ' ')
printf "%-14s median %9s ms   (runs: %s)\n" "$LABEL" "$MED" "$ALL"
