# Sourced by test-run.sh when a run is classified as killed. Writes one
# forensic file so the NEXT real kill answers what the spec could not:
# whether these runs die to a per-process V8 limit or to machine pressure.
#
# Anchored on APP_ROOT, never on cwd: `pnpm run` sets cwd to the package
# dir, so a relative "app/.test-kills" resolves to app/app/.test-kills
# there while being correct from the repo root.
#
# ERGOMATIC_TEST_KILLDIR is a test seam, named to match the advisory's
# ERGOMATIC_TEST_PEERDIR. Without it the gate has to point at the LIVE
# directory and `rm -rf` it, which is the one directory whose entire purpose
# is holding the next real kill's forensics until someone reads them --
# running the gate would destroy the evidence it exists to protect.
#
# Every operation is swallowed. A capture that cannot be written must
# never change the exit code of the command being captured.
DETAIL=""
_cap_dir="${ERGOMATIC_TEST_KILLDIR:-$APP_ROOT/.test-kills}"
if mkdir -p "$_cap_dir" 2>/dev/null; then
  _cap_file="$_cap_dir/$(date +%Y%m%dT%H%M%S)-$$.txt"
  {
    echo "verdict=$TEST_RUN_VERDICT"
    echo "exit=$rc"
    [ "$rc" -ge 128 ] && echo "signal=$((rc - 128))"
    echo "date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "argv=$*"
    echo "--- stderr (last 40) ---"
    tail -40 "$ERR" 2>/dev/null
    echo "--- vm_stat ---"
    vm_stat 2>/dev/null
    echo "--- swap ---"
    sysctl vm.swapusage 2>/dev/null
    echo "--- memorystatus kills (last 5m) ---"
    # /usr/bin/log, not `log`: it resolves to a shell builtin in some shells.
    /usr/bin/log show --last 5m --predicate 'eventMessage CONTAINS "memorystatus: killing"' 2>/dev/null | tail -20
    # 2> BEFORE the >, or the shell reports a failing stdout redirect on a
    # stderr that has not been silenced yet: redirections apply left to
    # right. Measured 2026-09-08 with `chmod 500 app/.test-kills` --
    # `} > "$f" 2>/dev/null` prints "Permission denied" ahead of the kill
    # banner, `} 2>/dev/null > "$f"` prints nothing. Same fix, and same
    # reason, as the advisory's `done 2>/dev/null < "$_f"`.
  } 2>/dev/null > "$_cap_file" && DETAIL="$_cap_file"
fi
