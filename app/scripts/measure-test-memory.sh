#!/usr/bin/env bash
# Usage: bash scripts/measure-test-memory.sh <logfile> <command...>
set -uo pipefail
if [ $# -lt 2 ]; then echo "usage: $0 <logfile> <command...>" >&2; exit 2; fi
LOG="$1"; shift
mkdir -p "$(dirname "$LOG")" 2>/dev/null || { echo "cannot create dir for $LOG" >&2; exit 2; }
: > "$LOG" 2>/dev/null || { echo "cannot write $LOG" >&2; exit 2; }
( while true; do
    ps -Ao rss,comm | grep -E 'node|vitest' | awk '{s+=$1} END{print s/1024}' >> "$LOG"
    sleep 0.5
  done ) & SAMPLER=$!
START=$(date +%s); "$@" >/dev/null 2>&1; RC=$?; END=$(date +%s)
{ kill "$SAMPLER"; wait "$SAMPLER"; } 2>/dev/null   # 'wait' suppresses the job-control notice
N=$(grep -c . "$LOG" || true)
if [ "${N:-0}" -eq 0 ]; then
  echo "MEASUREMENT INVALID: no samples (command finished inside one interval)" >&2; exit 3
fi
echo "exit=$RC wall=$((END-START))s samples=$N floor=$(sort -n "$LOG"|head -1)MB peak=$(sort -rn "$LOG"|head -1)MB log=$LOG"
exit "$RC"
