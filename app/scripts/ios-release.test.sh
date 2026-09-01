#!/usr/bin/env bash
# Regression test for ios-release.sh's release-flag guard (Wave E PR1.5
# round 5 review, P1): a walk operator exports VITE_ENABLE_C2_LINK_PROBE
# in their shell to build the dev-only probe card; without a guard, a
# LATER `pnpm ios:release` run in that SAME shell would ship it, since
# `pnpm ios:build`'s `vite build` reads the var straight from
# `process.env`. Runs the REAL script (same "run it for real" bar as
# `stack-env.test.sh` next door, not a copy of the guard's logic) — the
# guard is the very first executable check in the file.
#
# **Round 6 correction (P1, reviewer-verified):** this file used to claim
# NO test here needed a tag, Xcode, or build tooling present. True only
# for case 1 (flag set — the guard itself stops everything). Cases 2/3
# deliberately run the flag-unset/empty paths, which fall PAST the guard
# into the real git-tag check and beyond — on a checkout where HEAD
# happens to sit exactly on a `vX.Y.Z` tag (James's own state right
# before a real release), that continues into `pnpm ios:build` ->
# `xcodebuild archive` -> an ACTUAL TestFlight upload. Those two cases now
# force `GIT_DIR=/nonexistent` so `git describe` fails outright regardless
# of the real repo state, stopping the script at the tag check
# deterministically — see each case's own comment for the verified
# failure text.
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

# 2/3 round 6 correction (P1, reviewer-verified): both cases run the REAL
# script PAST this guard (the flag isn't set, so the guard doesn't fire),
# straight into the git-tag check and beyond. On a machine where HEAD
# happens to sit exactly on a `vX.Y.Z` tag — i.e., James's own state right
# before cutting a release — that continues into PlistBuddy -> `pnpm
# ios:build` -> `xcodebuild archive` -> a REAL TestFlight upload. A unit
# test must never be able to do that depending on which commit it happens
# to run against. `GIT_DIR=/nonexistent` forces `git -C "$APP_DIR"
# describe` to fail outright (verified: "fatal: not a git repository:
# '/nonexistent'", exit 128) regardless of the ACTUAL repo state, which
# the script's own `|| true` turns into an empty `$describe` and its `*)`
# branch: "HEAD is '', not exactly a vX.Y.Z tag" — exit 2, before
# `GOOGLE_IOS_CLIENT_ID` derivation, `pnpm ios:build`, or anything else
# ever runs. The invariant under test (the guard does not fire when the
# flag is unset/empty) is unaffected: the guard runs BEFORE this git call
# even happens, so isolating the git call changes nothing about whether
# the guard's own message appears.

# 2. Flag set to the empty string: `-n` treats this the same as unset —
#    confirms the guard checks for a genuinely non-empty value, not just
#    "the variable exists in the environment".
out=$(VITE_ENABLE_C2_LINK_PROBE= GIT_DIR=/nonexistent bash "$HERE/ios-release.sh" 2>&1)
! grep -q 'VITE_ENABLE_C2_LINK_PROBE is set' <<<"$out"
check "flag set empty: the guard does not fire" $?

# 3. Flag unset: the guard does not fire — proves the refusal is
#    conditional, not unconditional (the git-tag check's own rejection,
#    forced deterministic above, is not this test's concern).
out=$(env -u VITE_ENABLE_C2_LINK_PROBE GIT_DIR=/nonexistent bash "$HERE/ios-release.sh" 2>&1)
! grep -q 'VITE_ENABLE_C2_LINK_PROBE is set' <<<"$out"
check "flag unset: the guard does not fire" $?

if [ "$fails" -gt 0 ]; then
  echo "ios-release.test.sh: $fails failure(s)"
  exit 1
fi
echo "ios-release.test.sh: all passed"
