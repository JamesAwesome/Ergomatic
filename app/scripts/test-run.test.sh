#!/usr/bin/env bash
# Gate for test-run.sh's exit classifier. Runs in CI's `scripts` job.
#
# The invariant: a run that was KILLED never reads as a test failure, and a
# run that merely FAILED is never promoted to a memory verdict (RF26). Each
# case below drives the classifier with a fake child that reproduces one
# real signature; the "no banner" rows are what stop the over-claim.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fails=0

check() { # name, expected-substring-or-EMPTY, actual
  if [ "$2" = "EMPTY" ]; then
    if [ -z "$3" ]; then echo "ok    $1"; else echo "FAIL  $1 -- expected no banner, got: $3"; fails=$((fails+1)); fi
  else
    case "$3" in
      *"$2"*) echo "ok    $1" ;;
      *) echo "FAIL  $1 -- expected '$2', got: $3"; fails=$((fails+1)) ;;
    esac
  fi
}

# Runs the classifier against a fake child. $1=exit code, $2=stdout, $3=stderr.
# Returns only the banner lines (those starting with '!!').
classify() {
  FAKE_RC="$1" FAKE_OUT="$2" FAKE_ERR="$3" \
    bash "$HERE/test-run.sh" --self-test 2>&1 | grep '^!!' || true
}

SUMMARY=" Test Files  1 passed (1)"

check "134 SIGABRT is a memory kill"        "MEMORY KILL"          "$(classify 134 "" "")"
check "137 SIGKILL is a memory kill"        "MEMORY KILL"          "$(classify 137 "" "")"
check "130 SIGINT is silent (Ctrl-C)"       "EMPTY"                "$(classify 130 "" "")"
check "143 SIGTERM is a signal, not memory" "KILLED BY SIGNAL"     "$(classify 143 "" "")"
check "fork OOM: exit 1 WITH a summary"     "MEMORY KILL"          "$(classify 1 "$SUMMARY" "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory")"
check "third V8 string, no 'heap' wording"  "MEMORY KILL"          "$(classify 1 "$SUMMARY" "FATAL ERROR: Allocation failed - process out of memory")"
check "non-zero, no summary => incomplete"  "SUITE DID NOT COMPLETE" "$(classify 1 "" "node: --bogus is not allowed in NODE_OPTIONS")"
check "a real test failure is not a kill"   "EMPTY"                "$(classify 1 " Test Files  1 failed (1)" "")"
check "a clean pass says nothing"           "EMPTY"                "$(classify 0 "$SUMMARY" "")"
check "empty --changed selection"           "EMPTY"                "$(classify 0 "No test files found, exiting with code 0" "")"
check "caught ERR_HTTP2_NO_MEM not promoted" "EMPTY"               "$(classify 1 " Test Files  1 failed (1)" "Error [ERR_HTTP2_NO_MEM]: Out of memory")"
# Deliberately LOWERCASE. The line above says "Out of memory" with a capital
# O, so it cannot catch an over-broad `grep -qF "out of memory"` needle --
# it would miss on case rather than on correctness, and pass for the wrong
# reason. Verified: with only the capital-O row, the over-match mutation
# does NOT bite; with this row it does.
check "lowercase 'out of memory' not promoted" "EMPTY"              "$(classify 1 " Test Files  1 failed (1)" "MEMALLOC: Error allocating memory, we are most likely out of memory")"

# --- capture (Task 2) ---
CAPDIR="$(cd "$HERE/.." && pwd)/.test-kills"
rm -rf "$CAPDIR"
classify 137 "" "" >/dev/null
n=$(ls -1 "$CAPDIR" 2>/dev/null | wc -l | tr -d ' ')
check "a kill writes exactly one capture file" "1" "$n"
body="$(cat "$CAPDIR"/* 2>/dev/null)"
check "the capture names the exit code"        "exit=137"  "$body"
check "the capture names the signal"           "signal=9"  "$body"
rm -rf "$CAPDIR"

# A capture failure must never change the command's exit code.
mkdir -p "$CAPDIR" && chmod 500 "$CAPDIR"
FAKE_RC=137 bash "$HERE/test-run.sh" --self-test >/dev/null 2>&1
check "an unwritable capture dir still exits 137" "137" "$?"
chmod 700 "$CAPDIR"; rm -rf "$CAPDIR"

if [ "$fails" -ne 0 ]; then echo "$fails failure(s)"; exit 1; fi
echo "all classifier cases pass"
