#!/bin/bash
SP="$(dirname "$0")"; source "$SP/queries.sh"
for q in "$@"; do
  echo "### $q"
  { echo "set max_parallel_workers_per_gather=0;"; echo "explain (analyze, buffers) ${!q}"; } | docker exec -i erg-dba-pg psql -U postgres -q
done
