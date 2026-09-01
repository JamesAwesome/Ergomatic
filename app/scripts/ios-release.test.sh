#!/usr/bin/env bash
# Regression test for ios-release.sh's release-flag guard (Wave E PR1.5
# round 5 review, P1): a walk operator exports VITE_ENABLE_C2_LINK_PROBE
# in their shell to build the dev-only probe card; without a guard, a
# LATER `pnpm ios:release` run in that SAME shell would ship it, since
# `pnpm ios:build`'s `vite build` reads the var straight from
# `process.env`. Runs the REAL script (same "run it for real" bar as
# `stack-env.test.sh` next door, not a copy of the guard's logic) — the
# guard is the very first executable check in the file, before the
# git-tag check or any Xcode/`pnpm ios:build` call, so no tag, no Xcode,
# and no build tooling needs to be present for this test to observe the
# refusal.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fails=0

check() { # name, condition-result
  if [ "$2" -eq 0 ]; then
    echo "ok    $1"
  else
    echo "FAIL  $1"
    fails=$((fails + 1))
  fi
}

# 1. Flag set: refuses immediately, names the flag and the reason.
out=$(VITE_ENABLE_C2_LINK_PROBE=1 bash "$HERE/ios-release.sh" 2>&1)
rc=$?
[ "$rc" -eq 1 ]
check "flag set: exits 1 before doing anything else" $?
grep -q 'VITE_ENABLE_C2_LINK_PROBE is set' <<<"$out"
check "flag set: refusal names the flag" $?
grep -q 'probe card must never ship via ios:release' <<<"$out"
check "flag set: refusal states why" $?

# 2. Flag set to the empty string: `-n` treats this the same as unset —
#    confirms the guard checks for a genuinely non-empty value, not just
#    "the variable exists in the environment".
out=$(VITE_ENABLE_C2_LINK_PROBE= bash "$HERE/ios-release.sh" 2>&1)
! grep -q 'VITE_ENABLE_C2_LINK_PROBE is set' <<<"$out"
check "flag set empty: the guard does not fire" $?

# 3. Flag unset: the guard does not fire — proves the refusal is
#    conditional, not unconditional (a different, unrelated check further
#    down the script may still reject a non-tag HEAD in this environment;
#    that is not this test's concern).
out=$(env -u VITE_ENABLE_C2_LINK_PROBE bash "$HERE/ios-release.sh" 2>&1)
! grep -q 'VITE_ENABLE_C2_LINK_PROBE is set' <<<"$out"
check "flag unset: the guard does not fire" $?

if [ "$fails" -gt 0 ]; then
  echo "ios-release.test.sh: $fails failure(s)"
  exit 1
fi
echo "ios-release.test.sh: all passed"
