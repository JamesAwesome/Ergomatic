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

# ERGOMATIC_TEST_KILLDIR keeps every case off app/.test-kills, the LIVE
# forensic directory. This gate used to `rm -rf` that directory three times,
# which destroys the one thing it exists to hold: the next real kill's
# evidence, sitting there waiting for a human to read it.
KILLDIR="$(mktemp -d)"
export ERGOMATIC_TEST_KILLDIR="$KILLDIR"
REAL_KILLDIR="$(cd "$HERE/.." && pwd)/.test-kills"
# cksum, not the listing itself: this file's `check` is a SUBSTRING match
# (see its EMPTY branch), and a listing that has GAINED files still contains
# the old one as a substring -- so comparing listings passes while the
# directory is being written to. Measured 2026-09-08 with the
# ERGOMATIC_TEST_KILLDIR override deleted: 30 files became 42 and the case
# still read `ok`. cksum of the sorted listing is a fixed-width digest, so a
# substring match on it is an equality.
_killdir_digest() { ls -1 "$REAL_KILLDIR" 2>/dev/null | sort | cksum; }
real_before="$(_killdir_digest)"
trap 'rm -rf "$KILLDIR"' EXIT

SUMMARY=" Test Files  1 passed (1)"

# 134 and 137 are NOT symmetrical, and this trio is the whole reason.
# 137 (SIGKILL) is memory with no message at all -- an OS memory kill leaves
# nothing behind, so the absence is its only signature on this machine.
# 134 (SIGABRT) fires for ANY abort: a V8 fatal OOM, `process.abort()`, a
# native abort, a manual `kill -6`. A V8 fatal OOM always prints
# "Allocation failed", so the needle is what separates the two, and a bare
# SIGABRT reads as a signal death rather than claiming a memory cause it has
# no evidence for (RF26). Before this round, 134 was memory unconditionally.
check "134 SIGABRT WITH the needle is memory"  "MEMORY KILL"       "$(classify 134 "" "FATAL ERROR: Allocation failed - process out of memory")"
check "134 SIGABRT with NO needle is a signal" "KILLED BY SIGNAL"  "$(classify 134 "" "")"
case "$(classify 134 "" "")" in *"MEMORY KILL"*) r=1 ;; *) r=0 ;; esac
check "a bare SIGABRT never claims memory"     "0"                 "$r"
check "137 SIGKILL is a memory kill"        "MEMORY KILL"          "$(classify 137 "" "")"
check "130 SIGINT is silent (Ctrl-C)"       "EMPTY"                "$(classify 130 "" "")"
check "143 SIGTERM is a signal, not memory" "KILLED BY SIGNAL"     "$(classify 143 "" "")"
check "fork OOM: exit 1 WITH a summary"     "MEMORY KILL"          "$(classify 1 "$SUMMARY" "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory")"
check "third V8 string, no 'heap' wording"  "MEMORY KILL"          "$(classify 1 "$SUMMARY" "FATAL ERROR: Allocation failed - process out of memory")"
check "non-zero, no summary => incomplete"  "SUITE DID NOT COMPLETE" "$(classify 1 "" "node: --bogus is not allowed in NODE_OPTIONS")"
check "a real test failure is not a kill"   "EMPTY"                "$(classify 1 " Test Files  1 failed (1)" "")"
check "a clean pass says nothing"           "EMPTY"                "$(classify 0 "$SUMMARY" "")"
# Every needle rule is gated on rc != 0. Measured against this file's parent
# commit: FAKE_RC=0 with this exact stderr printed "!! MEMORY KILL", wrote a
# capture file, and exited 0 -- a PASSING run declared a memory kill on a
# string match alone. The fork-worker case the rule exists for always exits
# non-zero, so the guard costs nothing.
check "rc=0 with the needle is NOT a kill" "EMPTY"                "$(classify 0 "$SUMMARY" "FATAL ERROR: Allocation failed")"
check "empty --changed selection"           "EMPTY"                "$(classify 0 "No test files found, exiting with code 0" "")"
check "caught ERR_HTTP2_NO_MEM not promoted" "EMPTY"               "$(classify 1 " Test Files  1 failed (1)" "Error [ERR_HTTP2_NO_MEM]: Out of memory")"
# Deliberately LOWERCASE. The line above says "Out of memory" with a capital
# O, so it cannot catch an over-broad `grep -qF "out of memory"` needle --
# it would miss on case rather than on correctness, and pass for the wrong
# reason. Verified: with only the capital-O row, the over-match mutation
# does NOT bite; with this row it does.
check "lowercase 'out of memory' not promoted" "EMPTY"              "$(classify 1 " Test Files  1 failed (1)" "MEMALLOC: Error allocating memory, we are most likely out of memory")"

# --- the REAL pipeline ---
# Every case above runs --self-test, which fabricates rc and never reaches
# the tees -- so none of them can see a PIPESTATUS regression, nor the
# stderr capture, which are the two mechanics this script exists to protect.
# These cases drive the actual pipeline by pointing ERGOMATIC_TEST_RUN_BIN at
# a child. No node: each child is three lines of `sh`, so they run on
# ubuntu-latest in CI's `scripts` job.
#
# The mutation that makes the first pair red (run 2026-09-08): drop
# `-o pipefail` from test-run.sh's `set -uo pipefail` AND substitute `rc=$?`
# for `rc=${PIPESTATUS[0]}` --
#   FAIL  ... exits 137 -- expected '137', got: 0
#   FAIL  ... banners   -- expected '0', got: 1
# Substituting `rc=$?` ALONE does NOT bite: under pipefail a pipeline's
# status is its rightmost non-zero, which is the child's 137 here. Both
# halves are the mechanic, so the mutation is both halves.
PIPEDIR="$(mktemp -d)"
cat > "$PIPEDIR/dies-by-signal" <<'SH'
#!/bin/sh
kill -9 $$
SH
chmod +x "$PIPEDIR/dies-by-signal"
pipe_out="$(ERGOMATIC_TEST_RUN_BIN="$PIPEDIR/dies-by-signal" \
  ERGOMATIC_TEST_PEERDIR="$PIPEDIR/peers" \
  bash "$HERE/test-run.sh" 2>&1)"; pipe_rc=$?
check "a SIGKILLed child through the real pipeline exits 137" "137" "$pipe_rc"
case "$pipe_out" in *"MEMORY KILL"*) r=0 ;; *) r=1 ;; esac
check "a SIGKILLed child through the real pipeline banners" "0" "$r"

# stderr is TEE'd, not buffered: it reaches the terminal as the run happens
# AND lands in $ERR in time for the classifier's grep. The second half is
# the one a naive fix breaks -- `2> >(tee "$ERR" >&2)` is an asynchronous
# process substitution that bash 3.2.57 gives no `$!` to wait on, so the
# grep can run against a half-written file. Here both tees are ordinary
# pipeline members and the shell has waited for them.
#
# This child prints the needle on stderr, a summary on stdout, and exits 1
# -- the fork-worker OOM shape. It is the ONLY case in this file where the
# needle has to survive the real pipeline; every other needle case fabricates
# $ERR directly.
cat > "$PIPEDIR/fork-oom" <<'SH'
#!/bin/sh
echo " Test Files  1 failed (1)"
echo "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory" >&2
exit 1
SH
chmod +x "$PIPEDIR/fork-oom"
fork_out="$(ERGOMATIC_TEST_RUN_BIN="$PIPEDIR/fork-oom" \
  ERGOMATIC_TEST_PEERDIR="$PIPEDIR/peers" \
  bash "$HERE/test-run.sh" 2>&1)"; fork_rc=$?
check "a fork OOM through the real pipeline exits 1" "1" "$fork_rc"
case "$fork_out" in *"MEMORY KILL"*) r=0 ;; *) r=1 ;; esac
check "the needle survives the real pipeline"        "0" "$r"
case "$fork_out" in *"Allocation failed"*) r=0 ;; *) r=1 ;; esac
check "the child's stderr reaches the caller"        "0" "$r"
rm -rf "$PIPEDIR"

# --- capture (Task 2) ---
# Each case gets its own empty directory. The gate must never write to, read
# from, or delete app/.test-kills -- see ERGOMATIC_TEST_KILLDIR above.
CAPDIR="$(mktemp -d)"
ERGOMATIC_TEST_KILLDIR="$CAPDIR" classify 137 "" "" >/dev/null
n=$(ls -1 "$CAPDIR" 2>/dev/null | wc -l | tr -d ' ')
check "a kill writes exactly one capture file" "1" "$n"
body="$(cat "$CAPDIR"/* 2>/dev/null)"
check "the capture names the exit code"        "exit=137"  "$body"
check "the capture names the signal"           "signal=9"  "$body"
rm -rf "$CAPDIR"

# A capture failure must never change the command's exit code, AND must not
# leak the shell's own redirect error in front of the banner. Redirections
# apply left to right, so `} > "$f" 2>/dev/null` reports the failing stdout
# redirect on a stderr that is not silenced yet.
# Mutation run 2026-09-08: `} 2>/dev/null > "$_cap_file"` ->
# `} > "$_cap_file" 2>/dev/null` in test-kill-capture.sh --
#   FAIL  an unwritable capture dir stays silent -- expected '0' got '1'
# (the exit-code case stays green under it, which is why it needed its own.)
CAPDIR="$(mktemp -d)"
if [ "$(id -u)" = "0" ]; then
  # Root writes into a chmod 500 directory, so neither case below can fail
  # whatever the redirect order says -- RF21. Skipped out loud.
  echo "skip  an unwritable capture dir still exits 137 -- running as root"
  echo "skip  an unwritable capture dir stays silent    -- running as root"
else
  chmod 500 "$CAPDIR"
  cap_err="$(ERGOMATIC_TEST_KILLDIR="$CAPDIR" FAKE_RC=137 \
    bash "$HERE/test-run.sh" --self-test 2>&1 >/dev/null)"; cap_rc=$?
  check "an unwritable capture dir still exits 137" "137" "$cap_rc"
  case "$cap_err" in *"ermission denied"*|*"ermission Denied"*) r=1 ;; *) r=0 ;; esac
  check "an unwritable capture dir stays silent"    "0"   "$r"
  chmod 700 "$CAPDIR"
fi
rm -rf "$CAPDIR"

# RF3's sibling, and the reason ERGOMATIC_TEST_KILLDIR exists: running this
# gate must not disturb the live forensic directory. Before the seam it was
# `rm -rf`'d three times, so a real kill's evidence survived only until the
# next `pnpm test`.
real_after="$(_killdir_digest)"
check "the gate leaves app/.test-kills untouched" "$real_before" "$real_after"

if [ "$fails" -ne 0 ]; then echo "$fails failure(s)"; exit 1; fi
echo "all classifier cases pass"
