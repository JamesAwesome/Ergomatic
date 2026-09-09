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

# PRODUCER -> CONSUMER (RF24). Every case above hand-writes the peer file
# with printf, so none of them starts upstream of the writer -- rename the
# writer's key and they all stay green while the real path goes dead. Here
# the advisory IS the producer: a background shell sources it, writing a
# real entry with its own real pid and start time, and the foreground then
# sources it again and must see that entry.
#
# The mutation that makes it red (run 2026-09-08): rename the writer's key,
# `echo "pid=$$"` -> `echo "PID=$$"` in test-run-advisory.sh --
#   FAIL  an entry the advisory itself wrote is reported -- expected '0' got '1'
#   FAIL  a live peer's own entry survives the read      -- expected '1' got '0'
# All five hand-written cases above stayed green under it.
bash -c '. "$1"; sleep 30' _ "$HERE/test-run-advisory.sh" >/dev/null 2>&1 &
producer=$!
i=0
while [ ! -f "$DIR/$producer.peer" ] && [ "$i" -lt 100 ]; do sleep 0.1; i=$((i+1)); done
check "the advisory writes its own peer entry" "1" "$([ -f "$DIR/$producer.peer" ] && echo 1 || echo 0)"
out="$( . "$HERE/test-run-advisory.sh" 2>&1 )"
case "$out" in *"another Ergomatic test run is live (pid $producer,"*) r=0 ;; *) r=1 ;; esac
check "an entry the advisory itself wrote is reported" "0" "$r"
# ... and is NOT swept: an unparsed entry takes the `rm -f` arm, so the
# reader deleting a live peer's file is the same defect wearing a mask.
check "a live peer's own entry survives the read" "1" "$([ -f "$DIR/$producer.peer" ] && echo 1 || echo 0)"
kill $producer 2>/dev/null; wait $producer 2>/dev/null

# The `worker cap` field (spec Part A3). Both readings below were WRONG
# before this round -- the field was a hardcoded ${ERGOMATIC_TEST_WORKERS:-4},
# so `CI=1` printed `workers=4` against a real `undefined` and `999` printed
# `workers=999` against workerCap's clamp of 16. It exists to reveal a cap
# that is silently absent, so a reading it cannot get right is worse than
# none. A live peer is required for the line to print at all.
#
# Mutations run 2026-09-08, each against the block it decides:
#   restore `_w="${ERGOMATIC_TEST_WORKERS:-4}"` ->
#     FAIL CI says the cap is off / an override is quoted with its bound /
#     an override never reads as the result (3 failures)
#   `[ -n "$_ci" ] && [ "$_ci" != "false" ] && ...` -> `[ -n "$_ci" ]` ->
#     FAIL CI=false is not CI / CI=0 is not CI (2 failures)
#   vitest.config.ts's fallback 4 -> 5 ->
#     FAIL the default matches vitest.config.ts -- expected '1' got '0'
sleep 30 & cappeer=$!
capstart="$(ps -o lstart= -p $cappeer | tr -s ' ')"
capline() { # $1.. = env assignments; echoes the "Free ..." line
  printf 'pid=%s\nstarted=%s\nworktree=/x\n' "$cappeer" "$capstart" > "$DIR/$cappeer.peer"
  env "$@" bash -c '. "$0"' "$HERE/test-run-advisory.sh" 2>&1 | grep 'Free ' || true
}
case "$(capline CI=1)" in *"worker cap uncapped (CI=1)"*) r=0 ;; *) r=1 ;; esac
check "CI says the cap is off, not a number"   "0" "$r"
case "$(capline CI=false)" in *"worker cap 4."*) r=0 ;; *) r=1 ;; esac
check "CI=false is not CI, so the cap stands"  "0" "$r"
case "$(capline CI=0)" in *"worker cap 4."*) r=0 ;; *) r=1 ;; esac
check "CI=0 is not CI, so the cap stands"      "0" "$r"
case "$(capline ERGOMATIC_TEST_WORKERS=999)" in
  *"ERGOMATIC_TEST_WORKERS=999, bounded 1..16"*) r=0 ;; *) r=1 ;;
esac
check "an override is quoted with its bound"   "0" "$r"
case "$(capline ERGOMATIC_TEST_WORKERS=999)" in *"cap 999."*) r=1 ;; *) r=0 ;; esac
check "an override never reads as the result"  "0" "$r"
kill $cappeer 2>/dev/null; wait $cappeer 2>/dev/null
rm -f "$DIR/$cappeer.peer"
# The literal 4 is the ONLY duplicated number here, so pin it at its source
# rather than letting the two drift.
check "the default matches vitest.config.ts" "1" \
  "$(grep -c 'ERGOMATIC_TEST_WORKERS, 4)' "$APP_ROOT/vitest.config.ts")"

# An UNREADABLE peer file must be silent too. `[ -f ]` passes on a chmod
# 000 file, so the `while ... done < "$_f"` redirect fails and bash prints
# its own "Permission denied" -- raw shell noise in front of a test run.
# Mutation run 2026-09-08: `done 2>/dev/null < "$_f"` -> `done < "$_f"
# 2>/dev/null` (the order the obvious fix reaches for) --
#   FAIL  an unreadable peer file is silent -- expected '0' got '1'
if [ "$(id -u)" = "0" ]; then
  # Root reads a chmod 000 file, so the case would be green whatever the
  # redirect order says -- RF21. Skipped out loud rather than counted.
  echo "skip  an unreadable peer file is silent -- running as root"
else
  printf 'pid=1\nstarted=x\nworktree=/x\n' > "$DIR/unreadable.peer"
  chmod 000 "$DIR/unreadable.peer"
  out="$( . "$HERE/test-run-advisory.sh" 2>&1 )"
  case "$out" in *"ermission denied"*) r=1 ;; *) r=0 ;; esac
  check "an unreadable peer file is silent" "0" "$r"
  chmod 700 "$DIR/unreadable.peer" 2>/dev/null; rm -f "$DIR/unreadable.peer"
fi

# An unreadable peer dir must be silent and must not fail.
export ERGOMATIC_TEST_PEERDIR=/proc/nonexistent/nope
( . "$HERE/test-run-advisory.sh" ) >/dev/null 2>&1
check "an unusable peer dir does not fail the run" "0" "$?"

rm -rf "$DIR"
if [ "$fails" -ne 0 ]; then echo "$fails failure(s)"; exit 1; fi
echo "all advisory cases pass"
