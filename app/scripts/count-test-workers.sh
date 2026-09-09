#!/usr/bin/env bash
# Usage: bash scripts/count-test-workers.sh <logfile> <app-abs-path> <command...>
set -uo pipefail
if [ $# -lt 3 ]; then echo "usage: $0 <logfile> <app-abs-path> <command...>" >&2; exit 2; fi
LOG="$1"; APPPATH="$2"; shift 2
mkdir -p "$(dirname "$LOG")" 2>/dev/null || { echo "cannot create dir for $LOG" >&2; exit 2; }
: > "$LOG" 2>/dev/null || { echo "cannot write $LOG" >&2; exit 2; }
FLOOR=$(ps -Ao args | grep '[v]itest/dist/worker' | grep -cF -- "$APPPATH" || true)
( while true; do
    ps -Ao args | grep '[v]itest/dist/worker' | grep -cF -- "$APPPATH" >> "$LOG" || true
    sleep 0.3
  done ) & SAMPLER=$!
"$@" >/dev/null 2>&1; RC=$?
{ kill "$SAMPLER"; wait "$SAMPLER"; } 2>/dev/null
N=$(grep -c . "$LOG" || true)
if [ "${N:-0}" -eq 0 ]; then echo "MEASUREMENT INVALID: no samples" >&2; exit 3; fi
echo "exit=$RC samples=$N start_floor=$FLOOR peak=$(sort -rn "$LOG"|head -1) log=$LOG"
if [ "$FLOOR" -ne 0 ]; then
  echo "MEASUREMENT INVALID: $FLOOR foreign worker(s) already running for this path" >&2; exit 3
fi
exit "$RC"
