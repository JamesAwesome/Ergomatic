#!/usr/bin/env bash
# Unit tests for ci-changes.sh: a throwaway git repo stands in for the real
# history, and each case commits a specific file set and asks the script
# whether CI must run the code jobs.
#
# The invariant these tests exist to defend: the script may only answer
# "false" (skip e2e/app/docker) when it POSITIVELY knows every changed path
# is documentation. Every other outcome — a bad sha, an empty diff, a git
# failure, a path it does not recognise — answers "true". A wrongly-skipped
# e2e is a GREEN suite that should have been red, which is worse than a red
# one, so the degenerate cases below are the point of this file, not padding.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/ci-changes.sh"
fails=0
check() { if [ "$1" = "$2" ]; then echo "ok: $3"; else echo "FAIL: $3 (want '$2' got '$1')"; fails=$((fails + 1)); fi; }

setup() {
  TMP="$(mktemp -d)"
  git init -q "$TMP/repo"
  cd "$TMP/repo" || exit 1
  git config user.email t@t
  git config user.name t
  mkdir -p docs app/src .claude .github/workflows
  echo x > README.md
  echo x > docs/seed.md
  echo x > app/src/seed.ts
  git add -A
  git commit -q -m base
  BASE=$(git rev-parse HEAD)
}
teardown() {
  cd /
  rm -rf "$TMP"
}

# commit_and_ask <path>... — touch each path, commit, ask BASE..HEAD
commit_and_ask() {
  for f in "$@"; do
    mkdir -p "$(dirname "$f")"
    echo "change" >> "$f"
  done
  git add -A
  git commit -q -m change
  bash "$SCRIPT" "$BASE" "$(git rev-parse HEAD)" 2> /dev/null
}

setup
check "$(commit_and_ask docs/notes.md)" "false" "docs/ only → skip"
teardown

setup
check "$(commit_and_ask ROADMAP.md CLAUDE.md)" "false" "root markdown only → skip"
teardown

setup
check "$(commit_and_ask .claude/agents/pm-ledger.md)" "false" "agent ledgers only → skip"
teardown

setup
check "$(commit_and_ask docs/a.md .claude/b.md README.md)" "false" "mixed documentation → skip"
teardown

setup
check "$(commit_and_ask app/src/feature.ts)" "true" "app code → run"
teardown

setup
check "$(commit_and_ask docs/notes.md app/src/feature.ts)" "true" "one code file among docs → run"
teardown

setup
check "$(commit_and_ask .github/workflows/ci.yml)" "true" "the workflow itself → run"
teardown

setup
check "$(commit_and_ask scripts/ci-changes.sh)" "true" "this script itself → run"
teardown

setup
check "$(commit_and_ask app/README.md)" "true" "markdown inside app/ is not root docs → run"
teardown

setup
check "$(commit_and_ask app/compose.yml)" "true" "compose files → run"
teardown

# --- fail-safe cases: uncertainty must never skip ---

setup
check "$(bash "$SCRIPT" 0000000000000000000000000000000000000000 "$BASE" 2> /dev/null)" "true" "all-zero base (new branch) → run"
teardown

setup
check "$(bash "$SCRIPT" deadbeefdeadbeefdeadbeefdeadbeefdeadbeef "$BASE" 2> /dev/null)" "true" "unknown base sha → run"
teardown

setup
check "$(bash "$SCRIPT" "$BASE" "$BASE" 2> /dev/null)" "true" "empty diff → run"
teardown

setup
check "$(bash "$SCRIPT" "" "" 2> /dev/null)" "true" "missing arguments → run"
teardown

setup
OUTSIDE=$(cd /tmp && bash "$SCRIPT" "$BASE" "$BASE" 2> /dev/null)
check "$OUTSIDE" "true" "outside a git repo → run"
teardown

if [ "$fails" = 0 ]; then echo "ALL PASS"; exit 0; else echo "$fails FAILED"; exit 1; fi
