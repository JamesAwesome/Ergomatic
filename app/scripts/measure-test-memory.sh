#!/usr/bin/env bash
# Usage: bash scripts/measure-test-memory.sh <logfile> <app-abs-path> <command...>
#
# Peak RSS of the node tree BELONGING TO THIS CHECKOUT while a command runs.
# The <app-abs-path> argument is not optional and is the whole difference
# between a number and a comparison: an unscoped `grep -E 'node|vitest'` sums
# every Node process on the machine -- other worktrees' vitest runs, agent
# sessions, editor language servers -- so its peak is a floor plus a signal
# and only the DELTA between two runs taken in one sitting means anything.
# Scoping matches the sibling count-test-workers.sh, which has always
# filtered by path. `start_floor` is printed for the same reason: a non-zero
# floor says something else in THIS checkout was already running, and the
# peak is not yours alone.
set -uo pipefail
if [ $# -lt 3 ]; then echo "usage: $0 <logfile> <app-abs-path> <command...>" >&2; exit 2; fi
LOG="$1"; APPPATH="$2"; shift 2
mkdir -p "$(dirname "$LOG")" 2>/dev/null || { echo "cannot create dir for $LOG" >&2; exit 2; }
: > "$LOG" 2>/dev/null || { echo "cannot write $LOG" >&2; exit 2; }
# The bracketed classes keep the greps from matching their own argv lines.
_rss_mb() {
  ps -Ao rss,args | grep -E '[n]ode|[v]itest' | grep -F -- "$APPPATH" \
    | awk '{s+=$1} END{printf "%.0f\n", s/1024}'
}
FLOOR=$(_rss_mb)
( while true; do _rss_mb >> "$LOG"; sleep 0.5; done ) & SAMPLER=$!
START=$(date +%s); "$@" >/dev/null 2>&1; RC=$?; END=$(date +%s)
{ kill "$SAMPLER"; wait "$SAMPLER"; } 2>/dev/null   # 'wait' suppresses the job-control notice
N=$(grep -c . "$LOG" || true)
if [ "${N:-0}" -eq 0 ]; then
  echo "MEASUREMENT INVALID: no samples (command finished inside one interval)" >&2; exit 3
fi
echo "exit=$RC wall=$((END-START))s samples=$N start_floor=${FLOOR}MB min=$(sort -n "$LOG"|head -1)MB peak=$(sort -rn "$LOG"|head -1)MB log=$LOG"
if [ "${FLOOR:-0}" -ne 0 ]; then
  echo "NOTE: ${FLOOR}MB of node was already running for this checkout; peak includes it." >&2
fi
exit "$RC"
