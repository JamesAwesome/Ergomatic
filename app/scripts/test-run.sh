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
  # CAPACITY BANNER (2026-09-14 flake hunt). One line, before the run, so
  # every log carries the machine it ran on.
  #
  # WHY: `Releases.test.tsx` timed out at 5000ms on a SYNCHRONOUS test in
  # CI -- a render with nothing to await missing a five-second deadline is
  # the worker not being scheduled, not the test's logic. The obvious
  # suspect is `vitest.config.ts`'s `maxWorkers`, which caps a laptop and
  # is `undefined` in CI by design. But NOTHING IN CI PRINTED THE CORE
  # COUNT OR THE RESOLVED WORKER COUNT, so the suspicion could not be
  # checked against any run we already had -- and the ROADMAP row filed on
  # it guessed "a two-core runner" from nothing, which is the RF16 failure
  # this banner exists to make impossible next time. Capping workers is the
  # SECOND step; this is the first, because capping to a number nobody
  # measured against a baseline nobody can see is guessing twice.
  #
  # NODE-FREE ON PURPOSE: CI's `scripts` job runs this file's gate and has
  # no `setup-node` step, so `nproc`/`sysctl` carry the line and the Node
  # reading is best-effort. `availableParallelism()` is the one vitest
  # actually derives its default from, which is why it is reported
  # separately rather than assumed equal to the core count -- it respects
  # cgroup limits and CPU affinity, and a container runner is exactly where
  # the two diverge.
  _cores="$( { command -v nproc >/dev/null 2>&1 && nproc; } \
    || sysctl -n hw.ncpu 2>/dev/null || echo '?' )"
  _par="$(node -p 'const o=require("os"); (o.availableParallelism?o.availableParallelism():o.cpus().length)' 2>/dev/null || echo '?')"
  if [ -n "${ERGOMATIC_TEST_WORKERS:-}" ]; then
    _cap="$ERGOMATIC_TEST_WORKERS (ERGOMATIC_TEST_WORKERS)"
  elif [ -n "${CI:-}" ]; then
    _cap="none -- vitest default (the config's cap is CI-inert by design)"
  else
    _cap="4 (the local default in vitest.config.ts)"
  fi
  echo "test-run: cores=$_cores availableParallelism=$_par maxWorkers=$_cap" >&2
  # BOTH streams tee live and are captured. Vitest writes failure DETAIL to
  # stderr -- measured 2026-09-08 on one failing client test: 504 bytes
  # stderr against 351 bytes stdout -- so buffering stderr to a file and
  # replaying it at the end hides every failure until the run ends, prints
  # the summary BEFORE the failures it summarises, and loses the lot if the
  # OS kills this wrapper (the EXIT trap never runs on SIGKILL, which is
  # precisely the event Part A exists to report).
  #
  # The fd-swap, not `2> >(tee ...)`: a process substitution is asynchronous
  # and bash 3.2.57 sets no `$!` for one, so the classifier below would grep
  # "$ERR" in a race with the tee still writing it. Here both tees are
  # ordinary pipeline members, so the shell has waited for both before the
  # next line runs. Reading it outside in: the subshell's stdout is the pipe
  # to `tee "$OUT"`; `3>&1` hands that pipe to fd 3; inside, `2>&1` sends
  # stderr to the INNER pipe (fd 1 is still the inner pipe at that point) and
  # `1>&3` then puts stdout back on the outer one. `3>&-` keeps fd 3 out of
  # vitest.
  #
  # PIPESTATUS[0] names the CHILD's status and does so whether or not
  # `pipefail` is set; `$?` names neither. Without pipefail it is tee's 0, so
  # a SIGKILL reads as a clean pass; with pipefail it is the RIGHTMOST
  # non-zero, i.e. tee's status whenever tee also fails.
  #
  # ERGOMATIC_TEST_RUN_BIN is a test seam, and the only way the gate can
  # drive this pipeline at all: --self-test fabricates rc and never reaches
  # the tees, so every classifier case is blind to a regression here. See
  # test-run.test.sh's "the REAL pipeline" block, which points it at a child
  # that dies by SIGKILL. Measured there 2026-09-08: `rc=$?` on its own is
  # still 137, because the `set -uo pipefail` at the top of this file saves
  # it -- the mutation that turns that case red is dropping `-o pipefail`
  # AND substituting `rc=$?`, which then reports exit 0 and no banner.
  (
    "${ERGOMATIC_TEST_RUN_BIN:-$APP_ROOT/node_modules/.bin/vitest}" run "$@" \
      2>&1 1>&3 3>&- | tee "$ERR" >&2
    exit "${PIPESTATUS[0]}"
  ) 3>&1 | tee "$OUT"
  rc=${PIPESTATUS[0]}
fi

# Rules in order, first match wins. 130 is a deliberate Ctrl-C and is silent.
#
# 137 (SIGKILL) is memory WITHOUT a needle, because an OS memory kill leaves
# no message at all -- the absence IS its only signature on this machine.
# 134 (SIGABRT) is NOT: a V8 fatal OOM always prints "Allocation failed",
# so a bare SIGABRT is some other abort (`process.abort()`, a native abort,
# a manual `kill -6`) and saying "the suite ran out of memory" about it is
# the RF26 over-claim. It reads as a signal death instead, which is true.
#
# Every needle rule is gated on `rc != 0`: without that, a PASSING run whose
# output merely CONTAINS the string is declared a memory kill. Measured
# before the guard: FAKE_RC=0 with a summary on stdout and
# "FATAL ERROR: Allocation failed" on stderr printed "!! MEMORY KILL",
# wrote a capture, and exited 0. The guard costs nothing -- the fork-worker
# case this rule exists for always exits non-zero.
TEST_RUN_VERDICT=""
if [ "$rc" -eq 130 ]; then
  TEST_RUN_VERDICT=""
elif [ "$rc" -eq 137 ]; then
  TEST_RUN_VERDICT="memory"
elif [ "$rc" -ne 0 ] && grep -qF "Allocation failed" "$ERR"; then
  TEST_RUN_VERDICT="memory"          # 134 with the needle, and the fork
                                     # case: exit 1 WITH a summary
elif [ "$rc" -ge 128 ]; then
  TEST_RUN_VERDICT="signal"
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
