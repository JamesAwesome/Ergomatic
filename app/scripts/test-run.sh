#!/usr/bin/env bash
# Runs Vitest and says plainly when the run was KILLED rather than failed.
#
# Why this exists: a killed run and a flaky test look alike unless you read
# the exit status, and the status only survives on a signal-preserving
# invocation. `pnpm exec` collapses 134/137 to 1 -- measured -- so this
# script calls node_modules/.bin/vitest directly. See the spec's
# "The signal exists, and two things destroy it".
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$HERE/.." && pwd)"

# --no-experimental-webstorage FIRST so a caller's later --max-old-space-size
# wins (duplicate flags are last-wins). ${NODE_OPTIONS:-} because set -u.
NODE_OPTIONS="--no-experimental-webstorage ${NODE_OPTIONS:-}"
export NODE_OPTIONS

OUT="$(mktemp)"; ERR="$(mktemp)"
_cleanup() { rm -f "$OUT" "$ERR" "${_PEER_FILE:-}" 2>/dev/null; }
trap _cleanup EXIT

if [ "${1:-}" = "--self-test" ]; then
  # Gate hook: classify a fabricated child instead of running Vitest.
  rc="${FAKE_RC:-0}"
  printf '%s' "${FAKE_OUT:-}" > "$OUT"
  printf '%s' "${FAKE_ERR:-}" > "$ERR"
else
  [ -f "$HERE/test-run-advisory.sh" ] && . "$HERE/test-run-advisory.sh"
  # stdout streams live via tee; stderr is captured and replayed after.
  # On a clean run stderr is empty (measured: 260 bytes stdout, 0 stderr),
  # so nothing useful is deferred. PIPESTATUS[0] -- NOT $? -- because a
  # pipe's status is its tail's, which makes a SIGKILL read as exit 0.
  "$APP_ROOT/node_modules/.bin/vitest" run "$@" 2>"$ERR" | tee "$OUT"
  rc=${PIPESTATUS[0]}
  cat "$ERR" >&2
fi

# Rules in order, first match wins. 130 is a deliberate Ctrl-C and is silent.
TEST_RUN_VERDICT=""
if [ "$rc" -eq 130 ]; then
  TEST_RUN_VERDICT=""
elif [ "$rc" -eq 134 ] || [ "$rc" -eq 137 ]; then
  TEST_RUN_VERDICT="memory"
elif [ "$rc" -ge 128 ]; then
  TEST_RUN_VERDICT="signal"
elif grep -qF "Allocation failed" "$ERR"; then
  TEST_RUN_VERDICT="memory"          # the fork case: exit 1 WITH a summary
elif [ "$rc" -ne 0 ] && ! grep -qF "Test Files" "$OUT"; then
  TEST_RUN_VERDICT="incomplete"
fi
export TEST_RUN_VERDICT

DETAIL=""
if [ -n "$TEST_RUN_VERDICT" ] && [ -f "$HERE/test-kill-capture.sh" ]; then
  . "$HERE/test-kill-capture.sh"     # sets DETAIL to the capture path
fi

case "$TEST_RUN_VERDICT" in
  memory)
    echo "!! MEMORY KILL -- the suite ran out of memory and did not complete." >&2
    echo "!! NOT a flaky test. Do not re-run it.${DETAIL:+ Details: $DETAIL}" >&2 ;;
  signal)
    echo "!! KILLED BY SIGNAL $((rc - 128)) -- the suite did not complete." >&2
    echo "!! NOT a flaky test, and not a memory kill.${DETAIL:+ Details: $DETAIL}" >&2 ;;
  incomplete)
    echo "!! SUITE DID NOT COMPLETE -- no test summary was printed." >&2
    echo "!! NOT a flaky test, and not necessarily memory. Read the output above." >&2 ;;
esac

exit "$rc"
