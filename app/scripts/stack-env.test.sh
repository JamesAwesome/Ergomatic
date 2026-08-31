#!/usr/bin/env bash
# Regression tests for stack-env.sh's REPO_ROOT guard (#235 review, P2).
#
# The trap: `${REPO_ROOT:?}` aborts noninteractive shells but INTERACTIVE
# Bash prints the error and continues (bash(1)), so the manual-`source`
# workflow the guard exists for sailed past it and minted the phantom
# `ergomatic-67295` stack anyway. The guard is now an explicit check that
# `return`s from the sourced file; these tests pin BOTH shell modes plus
# the green path, and run in CI's `scripts` job (same pattern as
# scripts/*.test.sh at the repo root).
#
# The invariant under test is not the message or the exit code — it is
# that with REPO_ROOT unset, NO stack identity is exported. A guard that
# scolds and then exports anyway is the bug, not a degraded pass.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT="$(cd "$HERE/../.." && pwd)"
fails=0

check() { # name, condition-result
  if [ "$2" -eq 0 ]; then
    echo "ok    $1"
  else
    echo "FAIL  $1"
    fails=$((fails + 1))
  fi
}

# 1. INTERACTIVE bash, REPO_ROOT unset: the sourced file must stop before
#    exporting anything. This is the exact reproduction from the review.
out=$(printf '%s\n' \
  "cd '$WORKTREE_ROOT'" \
  'unset REPO_ROOT' \
  'source app/scripts/stack-env.sh' \
  'echo "PROBE rc=$? project=${COMPOSE_PROJECT_NAME-unset} port=${APP_PORT-unset}"' \
  'exit' |
  env -u REPO_ROOT bash --noprofile --norc -i 2>&1)
grep -q 'PROBE rc=1 project=unset port=unset' <<<"$out"
check "interactive: unset REPO_ROOT exports no stack identity, rc=1" $?
grep -q 'set REPO_ROOT' <<<"$out"
check "interactive: the refusal names the fix" $?
! grep -q '^stack: ' <<<"$out"
check "interactive: no stack line is printed" $?

# 2. Noninteractive, unset: same invariant.
out=$(env -u REPO_ROOT bash --noprofile --norc -c \
  "cd '$WORKTREE_ROOT'; source app/scripts/stack-env.sh; echo \"PROBE rc=\$? project=\${COMPOSE_PROJECT_NAME-unset}\"" 2>&1)
grep -q 'PROBE rc=1 project=unset' <<<"$out"
check "noninteractive: unset REPO_ROOT exports no stack identity, rc=1" $?

# 3. Green path: with REPO_ROOT set, the derivation runs and stays inside
#    the documented ranges (names % 100000, ports 8100-8499 / 15100-15499).
out=$(env -u COMPOSE_PROJECT_NAME -u APP_PORT -u POSTGRES_PORT bash --noprofile --norc -c \
  "REPO_ROOT='$WORKTREE_ROOT'; source '$WORKTREE_ROOT/app/scripts/stack-env.sh'; echo \"PROBE project=\$COMPOSE_PROJECT_NAME app=\$APP_PORT pg=\$POSTGRES_PORT\"" 2>&1)
grep -Eq 'PROBE project=ergomatic-[0-9]{1,5} app=8[1-4][0-9]{2} pg=15[1-4][0-9]{2}' <<<"$out"
check "set: derives a project name and in-range ports" $?

if [ "$fails" -gt 0 ]; then
  echo "stack-env.test.sh: $fails failure(s)"
  exit 1
fi
echo "stack-env.test.sh: all passed"
