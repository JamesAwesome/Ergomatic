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
    done < "$_f"
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
    # workers= is the only place the cap actually in force becomes visible.
    _w="${ERGOMATIC_TEST_WORKERS:-4}"
    echo "      Free ${_free:-unknown}, swap ${_swap:-unknown}, workers=${_w}. Consider a scoped run." >&2
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
