#!/usr/bin/env bash
# Gate for the preflight advisory's LIFETIME rules (RF27). The invariant is
# not the wording: it is that the advisory never blocks, never fails a run,
# and never mistakes a reused pid for a live peer.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fails=0
check() { if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1 -- expected '$2' got '$3'"; fails=$((fails+1)); fi; }

DIR="$(mktemp -d)"; export ERGOMATIC_TEST_PEERDIR="$DIR"
APP_ROOT="$(cd "$HERE/.." && pwd)"

# A live peer is reported.
sleep 30 & peer=$!
started="$(ps -o lstart= -p $peer | tr -s ' ')"
printf 'pid=%s\nstarted=%s\nworktree=/somewhere/else\n' "$peer" "$started" > "$DIR/$peer.peer"
out="$( . "$HERE/test-run-advisory.sh" 2>&1 )"
case "$out" in *"another Ergomatic test run is live"*) r=0 ;; *) r=1 ;; esac
check "a live peer is reported" "0" "$r"
kill $peer 2>/dev/null; wait $peer 2>/dev/null

# A dead pid is swept, not reported.
printf 'pid=999999\nstarted=whenever\nworktree=/x\n' > "$DIR/999999.peer"
out="$( . "$HERE/test-run-advisory.sh" 2>&1 )"
case "$out" in *"another Ergomatic test run is live"*) r=1 ;; *) r=0 ;; esac
check "a dead pid is not reported" "0" "$r"
check "a dead pid's entry is swept" "0" "$([ -f "$DIR/999999.peer" ] && echo 1 || echo 0)"

# PID REUSE: a live pid whose start time differs is NOT a peer.
sleep 30 & other=$!
printf 'pid=%s\nstarted=Thu Jan  1 00:00:00 1970\nworktree=/x\n' "$other" > "$DIR/$other.peer"
out="$( . "$HERE/test-run-advisory.sh" 2>&1 )"
case "$out" in *"another Ergomatic test run is live"*) r=1 ;; *) r=0 ;; esac
check "a reused pid is not a live peer" "0" "$r"
kill $other 2>/dev/null; wait $other 2>/dev/null

# An unreadable peer dir must be silent and must not fail.
export ERGOMATIC_TEST_PEERDIR=/proc/nonexistent/nope
( . "$HERE/test-run-advisory.sh" ) >/dev/null 2>&1
check "an unusable peer dir does not fail the run" "0" "$?"

rm -rf "$DIR"
if [ "$fails" -ne 0 ]; then echo "$fails failure(s)"; exit 1; fi
echo "all advisory cases pass"
