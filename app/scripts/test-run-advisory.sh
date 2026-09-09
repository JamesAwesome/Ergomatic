# Sourced by test-run.sh before the suite starts. Warns that another run is
# live; never blocks (James, 2026-09-08).
#
# One file per run, not one shared file: a shared file cannot represent two
# live peers, and its "ignore and rewrite" step is the operation that erases
# a live one. Identity is (pid, start time, worktree) because pid alone is a
# heuristic -- this machine forks 4-10 workers per run, so reuse is real.
_peer_dir="${ERGOMATIC_TEST_PEERDIR:-/tmp/ergomatic-test-runs}"
if mkdir -p "$_peer_dir" 2>/dev/null; then
  _live=0
  for _f in "$_peer_dir"/*.peer; do
    [ -f "$_f" ] || continue
    _pid=""; _started=""; _wt=""
    while IFS='=' read -r _k _v; do
      case "$_k" in pid) _pid="$_v" ;; started) _started="$_v" ;; worktree) _wt="$_v" ;; esac
    done 2>/dev/null < "$_f"   # 2> BEFORE the <, or the shell's own
                               # "Permission denied" for a chmod 000 peer
                               # file still reaches the terminal (measured
                               # 2026-09-08: `done < f 2>/dev/null` prints
                               # it, `done 2>/dev/null < f` does not).
    [ -n "$_pid" ] || { rm -f "$_f" 2>/dev/null; continue; }
    # Skip our own prior registration: bash keeps $$ fixed across command
    # substitution (verified: bash 3.2.57), so a process that sources this
    # file more than once (as the gate does, invocation per case) would
    # otherwise see its own earlier entry and warn about itself. The write
    # at the bottom refreshes it unconditionally either way.
    [ "$_pid" != "$$" ] || continue
    _now="$(ps -o lstart= -p "$_pid" 2>/dev/null | tr -s ' ')"
    if [ -z "$_now" ] || [ "$_now" != "$_started" ]; then
      rm -f "$_f" 2>/dev/null            # dead, or the pid was reused
      continue
    fi
    _live=$((_live + 1))
    echo "NOTE: another Ergomatic test run is live (pid $_pid, $_wt, started $_started)." >&2
  done
  if [ "$_live" -gt 0 ]; then
    _free="$(vm_stat 2>/dev/null | awk '/Pages free/{gsub(/\./,"",$3); printf "%d MB", $3*16384/1048576}')"
    _swap="$(sysctl -n vm.swapusage 2>/dev/null | awk '{print $6" / "$3}')"
    # The cap in force -- the failure it exists to reveal is the cap
    # SILENTLY ABSENT, which nothing else surfaces (spec Part A3 / B1).
    # It says only what this shell can read WITHOUT reimplementing
    # testEnv.ts's workerCap(): isCI()'s three-way string test reproduced
    # exactly, an override quoted verbatim beside the bound it is subject
    # to, and the default as a literal. It never states a resulting worker
    # count for an override, because a hardcoded one was wrong twice --
    # measured 2026-09-08: `CI=1` printed `workers=4` where the real value
    # is `undefined` (9 workers), and `ERGOMATIC_TEST_WORKERS=999` printed
    # `workers=999` where workerCap clamps to 16. The `4` below is pinned
    # against vitest.config.ts by test-run-advisory.test.sh.
    _ci="${CI:-}"
    if [ -n "$_ci" ] && [ "$_ci" != "false" ] && [ "$_ci" != "0" ]; then
      _w="uncapped (CI=$_ci)"
    elif [ -n "${ERGOMATIC_TEST_WORKERS:-}" ]; then
      _w="from ERGOMATIC_TEST_WORKERS=${ERGOMATIC_TEST_WORKERS}, bounded 1..16"
    else
      _w="4"
    fi
    echo "      Free ${_free:-unknown}, swap ${_swap:-unknown}, worker cap ${_w}. Consider a scoped run." >&2
  fi
  _me="$_peer_dir/$$.peer"
  {
    echo "pid=$$"
    echo "started=$(ps -o lstart= -p $$ 2>/dev/null | tr -s ' ')"
    echo "worktree=${APP_ROOT:-unknown}"
  } > "$_me" 2>/dev/null && _PEER_FILE="$_me"
  # NOT a trap: test-run.sh owns the single EXIT trap, and a second one here
  # would silently replace it, leaking its two temp files every run.
fi
true   # the advisory must never be the reason a run fails
