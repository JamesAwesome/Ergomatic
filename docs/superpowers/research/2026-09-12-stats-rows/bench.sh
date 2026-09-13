#!/usr/bin/env bash
# bench.sh <label> "<sql ending in ;>" — six runs in ONE psql session.
# The stream of `Time:` lines is: BENCH_PRE's own timing, then runs 1..6.
# Drop BOTH in ORDER (dba-techniques step 4: discard run 1 as cold), then
# sort the remaining 5 and take the median.
# psql \timing must be fed with printf, not echo (echo's \t becomes a tab).
set -euo pipefail
CONTAINER="${CONTAINER:-erg-dba-pg}"
label="$1"; sql="$2"
skip=1; [ -n "${BENCH_PRE:-}" ] && skip=2
{
  printf '%s\n' '\timing on'
  printf '%s\n' '\o /dev/null'
  [ -n "${BENCH_PRE:-}" ] && printf '%s\n' "$BENCH_PRE"
  for _ in 1 2 3 4 5 6; do printf '%s\n' "$sql"; done
} | docker exec -i "$CONTAINER" psql -U postgres -q -X 2>&1 \
  | grep -o 'Time: [0-9.]*' | awk '{print $2}' \
  | tail -n "+$((skip + 1))" | sort -n \
  | awk -v l="$label" '{a[NR]=$1} END {if(NR==0){printf "%-18s NO TIMINGS\n", l; exit 1} printf "%-18s median %8.2f ms  (n=%d, run 1 discarded)  sorted:", l, a[int((NR+1)/2)], NR; for(i=1;i<=NR;i++) printf " %.2f", a[i]; printf "\n"}'
