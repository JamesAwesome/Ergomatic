#!/usr/bin/env bash
# explain.sh "<sql>" — explain (analyze, buffers) with parallelism pinned off.
set -euo pipefail
CONTAINER="${CONTAINER:-erg-dba-pg}"
{
  printf '%s\n' 'set max_parallel_workers_per_gather=0;'
  printf '%s\n' "explain (analyze, buffers) ${1%;}"';'
} | docker exec -i "$CONTAINER" psql -U postgres -q -X
