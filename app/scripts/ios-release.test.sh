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
#
# **Round 7 (P1, finding 1a):** `GIT_DIR=/nonexistent` now also covers
# case 1 — defense in depth: case 1 already stops at the release-flag
# guard itself and never reaches `git describe`, but if that guard were
# ever broken (exactly what the guard-deletion mutation probes), case 1's
# OWN invocation should be no more exposed than 2/3 already are. Also
# adds isolated coverage for the round 7 `.env`-file guard (finding 1b's
# early check) and a STRUCTURAL check for the dist:grep-after-build gate
# (finding 1b's real, artifact-level check) — see that section's own
# comment for why it is structural rather than a live run.
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
#    GIT_DIR=/nonexistent added round 7 (defense in depth — see header).
out=$(VITE_ENABLE_C2_LINK_PROBE=1 GIT_DIR=/nonexistent bash "$HERE/ios-release.sh" 2>&1)
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

# 4-7. Round 7 (P1, finding 1b): the .env-file guard. `APP_DIR` inside
# ios-release.sh is derived from the SCRIPT'S OWN location
# (`dirname "${BASH_SOURCE[0]}")/..`), never the caller's cwd — so testing
# this WITHOUT ever writing an `.env*` file into the real `app/` checkout
# means copying the script into its own throwaway `scripts/../` structure
# first. Each case writes exactly one of Vite's four production-mode env
# files (vite.dev/guide/env-and-mode, quoted in ios-release.sh's own
# comment) with the flag defined, and expects the SAME refusal shape the
# shell-var guard uses, naming the specific file. No `.git` exists in
# these throwaway dirs, so even a case that somehow got PAST the env
# guard would only ever reach `git describe`'s own natural "not a git
# repository" failure — never real tooling.
for envfile in .env .env.local .env.production .env.production.local; do
  SIM="$(mktemp -d)"
  mkdir -p "$SIM/scripts"
  cp "$HERE/ios-release.sh" "$SIM/scripts/ios-release.sh"
  echo "VITE_ENABLE_C2_LINK_PROBE=1" >"$SIM/$envfile"
  out=$(bash "$SIM/scripts/ios-release.sh" 2>&1)
  rc=$?
  rm -rf "$SIM"
  [ "$rc" -eq 1 ]
  check "$envfile defines the flag: exits 1" $?
  grep -q "$envfile defines VITE_ENABLE_C2_LINK_PROBE" <<<"$out"
  check "$envfile defines the flag: refusal names this exact file" $?
done

# 8. Negative control: an env file present but the flag genuinely absent
#    from it must NOT trigger the env guard's message (proves the grep is
#    conditional on the file's CONTENT, not merely its existence).
SIM="$(mktemp -d)"
mkdir -p "$SIM/scripts"
cp "$HERE/ios-release.sh" "$SIM/scripts/ios-release.sh"
echo "SOME_OTHER_VAR=1" >"$SIM/.env"
out=$(bash "$SIM/scripts/ios-release.sh" 2>&1)
rm -rf "$SIM"
! grep -q 'defines VITE_ENABLE_C2_LINK_PROBE' <<<"$out"
check ".env present without the flag: the env guard does not fire" $?

# 9. Round 8 (MINOR, scoped re-review): the env-file grep was `^`-anchored
#    and missed a dotenv-legal `export VITE_ENABLE_C2_LINK_PROBE=1` line —
#    this vite version's own `loadEnv` parses these files with Node's
#    built-in `node:util.parseEnv`, which strips a leading `export `
#    (verified this session: `node -e 'require("node:util").parseEnv(...)'`
#    returns the var live). One representative file suffices: the same
#    regex change applies uniformly to all four in the loop above.
SIM="$(mktemp -d)"
mkdir -p "$SIM/scripts"
cp "$HERE/ios-release.sh" "$SIM/scripts/ios-release.sh"
echo "export VITE_ENABLE_C2_LINK_PROBE=1" >"$SIM/.env"
out=$(bash "$SIM/scripts/ios-release.sh" 2>&1)
rc=$?
rm -rf "$SIM"
[ "$rc" -eq 1 ]
check ".env defines the flag via 'export ...': exits 1" $?
grep -q '.env defines VITE_ENABLE_C2_LINK_PROBE' <<<"$out"
check ".env defines the flag via 'export ...': refusal names this exact file" $?

# 10. STRUCTURAL check, finding 1b's real gate (the dist:grep-after-build
# step). Honestly labeled: this is a SOURCE-ORDERING proof, not a runtime
# one — actually exercising it means a real `pnpm ios:build` (a full vite
# build + `npx cap sync ios`) followed by a real `xcodebuild archive` if
# it were to fail open, which needs a macOS+Xcode toolchain this repo's
# own `scripts` CI job (ubuntu-latest) does not have, and which this
# session verified MANUALLY instead this round (PATH-stubbed
# xcodebuild/agvtool, a real temp git tag, guard-deletion mutation applied
# and reverted — see the commit message / task report for that
# evidence). What this DOES prove, cheaply and on every CI run: an ACTUAL
# INVOCATION of `pnpm dist:grep` exists in the script's source, textually
# AFTER the `pnpm ios:build` invocation and BEFORE the `xcodebuild ...
# archive` invocation.
#
# CODE lines only (`grep -v '^\s*#'`) — a mutation probe caught this test
# passing vacuously on its first draft: deleting the real `if ! (cd
# "$APP_DIR" && pnpm dist:grep); then ... fi` block still left a comment
# mentioning "`pnpm dist:grep`'s eighth needle" nearby, and a naive
# `grep -n 'pnpm dist:grep'` matched THAT instead, reporting "found" with
# the gate gone. Stripping comment-only lines before searching, and
# anchoring on the actual subshell-call shape (not just the bare string),
# fixed it — see the mutation record below.
code_only=$(grep -v '^[[:space:]]*#' "$HERE/ios-release.sh")
build_line=$(grep -n 'pnpm ios:build' <<<"$code_only" | head -1 | cut -d: -f1)
gate_line=$(grep -n 'cd "\$APP_DIR" && pnpm dist:grep' <<<"$code_only" | head -1 | cut -d: -f1)
archive_line=$(grep -n -- '-archivePath .* archive ' <<<"$code_only" | head -1 | cut -d: -f1)
[ -n "$build_line" ] && [ -n "$gate_line" ] && [ -n "$archive_line" ] &&
  [ "$gate_line" -gt "$build_line" ] && [ "$archive_line" -gt "$gate_line" ]
check "dist:grep is actually INVOKED (in source order) between ios:build and archive" $?

# 11. Round 9 (P1, reviewer): case 10 above is a SOURCE-ORDERING proof
# only — it never actually RUNS the gate, so deleting the `exit 1` at
# ios-release.sh's own dist:grep-refusal line would leave case 10 fully
# green. This case closes that gap with an isolated, PATH-stubbed RUNTIME
# execution of the real script: `git`, `pnpm`, and `xcodebuild` are all
# stubbed on PATH (no real repo, build, or Xcode toolchain touched), the
# stub `pnpm dist:grep` deliberately FAILS (mimicking a real dev-only
# literal found in the built bundle), and the assertions are that the
# script (a) exits non-zero, (b) prints the refusal, and (c) NEVER
# invokes the stub `xcodebuild` — proving the refusal actually stops the
# pipeline before archiving, not just that the source mentions the right
# call in the right order. `GOOGLE_IOS_CLIENT_ID` is pre-set so the
# script's own PlistBuddy derivation is skipped entirely — real
# `/usr/libexec/PlistBuddy` calls are absolute-path, so PATH stubbing
# can't intercept them, and skipping the one call this path would
# otherwise reach keeps the case free of any real Info.plist.
SIM="$(mktemp -d)"
mkdir -p "$SIM/scripts" "$SIM/bin"
cp "$HERE/ios-release.sh" "$SIM/scripts/ios-release.sh"
STUB_LOG="$SIM/stub.log"
: >"$STUB_LOG"

cat >"$SIM/bin/git" <<'STUB'
#!/usr/bin/env bash
echo "git $*" >>"$STUB_LOG"
if printf '%s' "$*" | grep -q 'describe'; then
  echo "v0.0.0-fake"
fi
exit 0
STUB
chmod +x "$SIM/bin/git"

cat >"$SIM/bin/pnpm" <<'STUB'
#!/usr/bin/env bash
echo "pnpm $*" >>"$STUB_LOG"
case "$1" in
  ios:build) exit 0 ;;
  dist:grep)
    echo "dist-grep: FOUND dev-only reference (stub, round 9 case)" >&2
    exit 1
    ;;
esac
exit 0
STUB
chmod +x "$SIM/bin/pnpm"

cat >"$SIM/bin/xcodebuild" <<'STUB'
#!/usr/bin/env bash
echo "xcodebuild $*" >>"$STUB_LOG"
exit 0
STUB
chmod +x "$SIM/bin/xcodebuild"

out=$(PATH="$SIM/bin:$PATH" STUB_LOG="$STUB_LOG" \
  GOOGLE_IOS_CLIENT_ID="fake.apps.googleusercontent.com" \
  bash "$SIM/scripts/ios-release.sh" 2>&1)
rc=$?
stub_log_contents="$(cat "$STUB_LOG")"
rm -rf "$SIM"

[ "$rc" -ne 0 ]
check "dist:grep failure (runtime): script exits non-zero" $?
grep -q 'refusing to archive' <<<"$out"
check "dist:grep failure (runtime): refusal message printed" $?
grep -q 'pnpm ios:build' <<<"$stub_log_contents"
check "dist:grep failure (runtime): reached ios:build before the gate (sanity)" $?
! grep -q 'xcodebuild' <<<"$stub_log_contents"
check "dist:grep failure (runtime): xcodebuild is NEVER invoked" $?

# Wave E PR1.75b (2026-09-02-concept2-pr175-app-bind-design.md §0: the app
# registers `haus.waffle.ergomatic` in CFBundleURLTypes). Before this PR the
# release derived GOOGLE_IOS_CLIENT_ID from CFBundleURLTypes INDEX 0
# (ios-release.sh's old `PlistBuddy -c 'Print :CFBundleURLTypes:0:
# CFBundleURLSchemes:0'`). Adding a second URL type makes that index a
# silent trap: put the Concept2 entry first and the release exports
# `haus.waffle.ergomatic.apps.googleusercontent.com`, which fails
# jwtVerify's audience check (server/auth/nativeVerify.ts:14-18) in a
# SHIPPED build with no error at build time. The derivation is now
# name-based and lives in its own script so this test can run it for real
# (the same "run it for real" bar as the cases above), on Linux CI too --
# PlistBuddy does not exist on ubuntu-latest, which is why the new script
# greps the plist XML rather than using it.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

write_plist() { # $1 = file, $2 = "google-first" | "concept2-first"
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<plist version="1.0"><dict><key>CFBundleURLTypes</key><array>'
    if [ "$2" = "concept2-first" ]; then
      echo '<dict><key>CFBundleURLName</key><string>Concept2Link</string><key>CFBundleURLSchemes</key><array><string>haus.waffle.ergomatic</string></array></dict>'
    fi
    echo '<dict><key>CFBundleURLName</key><string>GoogleSignIn</string><key>CFBundleURLSchemes</key><array><string>com.googleusercontent.apps.896004543555-9m5cf46vdgf57dv1r68u7stad6ngi304</string></array></dict>'
    if [ "$2" = "google-first" ]; then
      echo '<dict><key>CFBundleURLName</key><string>Concept2Link</string><key>CFBundleURLSchemes</key><array><string>haus.waffle.ergomatic</string></array></dict>'
    fi
    echo '</array></dict></plist>'
  } > "$1"
}

expected="896004543555-9m5cf46vdgf57dv1r68u7stad6ngi304.apps.googleusercontent.com"

write_plist "$tmp/google-first.plist" google-first
[ "$(bash "$HERE/ios-google-client-id.sh" "$tmp/google-first.plist")" = "$expected" ]
check "google client id: derived when the Google URL type is first" $?

write_plist "$tmp/concept2-first.plist" concept2-first
[ "$(bash "$HERE/ios-google-client-id.sh" "$tmp/concept2-first.plist")" = "$expected" ]
check "google client id: derived when the Concept2 URL type is first (the index-0 trap)" $?

echo '<?xml version="1.0"?><plist version="1.0"><dict/></plist>' > "$tmp/none.plist"
out=$(bash "$HERE/ios-google-client-id.sh" "$tmp/none.plist" 2>&1); rc=$?
[ "$rc" -ne 0 ]
check "google client id: exits non-zero when no reversed scheme is present" $?
grep -q 'no com.googleusercontent.apps' <<<"$out"
check "google client id: the failure names what it looked for" $?

# The REAL committed plist still yields the real id -- the fixtures above
# could all pass against a plist shape we do not actually ship.
[ "$(bash "$HERE/ios-google-client-id.sh" "$HERE/../ios/App/App/Info.plist")" = "$expected" ]
check "google client id: the committed Info.plist still derives the real id" $?

# ios-release.sh must not carry the index-based form any more.
! grep -q 'CFBundleURLTypes:0:CFBundleURLSchemes:0' "$HERE/ios-release.sh"
check "ios-release: no longer derives the client id from URL-type index 0" $?

if [ "$fails" -gt 0 ]; then
  echo "ios-release.test.sh: $fails failure(s)"
  exit 1
fi
echo "ios-release.test.sh: all passed"
