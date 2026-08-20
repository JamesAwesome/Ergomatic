#!/usr/bin/env bash
# Does this change need the code jobs (app, docker, e2e) to run?
#
# Usage: ci-changes.sh <base-sha> <head-sha>   → prints "true" or "false"
#
# WHY THIS EXISTS: e2e is ~8 minutes and about a fifth of the commits that
# reach main are documentation only — release notes, ledgers, ROADMAP,
# CLAUDE.md. Those commits cannot break a Playwright flow, and paying eight
# minutes for each of them makes the whole loop slower to no end.
#
# THE ONE INVARIANT: "false" is a positive claim that EVERY changed path is
# documentation. Anything else — an unknown sha, an empty file list, a git
# invocation that fails, a path this script does not recognise — prints
# "true". A wrongly-skipped e2e is a green suite that should have been red,
# so every uncertainty resolves toward running the suite. The workflow
# reinforces this from the other side: its jobs test `!= 'false'`, so a
# crashed or missing answer still runs them (see .github/workflows/ci.yml).
#
# DOCUMENTATION means: anything under docs/ or .claude/, plus markdown at
# the repo root (README, ROADMAP, CLAUDE). Deliberately NOT .github/ — a
# workflow edit must exercise the workflow it edits, including this one.
set -uo pipefail

DOCS_ONLY_RE='^(docs/|\.claude/|[^/]*\.md$)'

run_everything() {
  echo "ci-changes: $1 — running the code jobs" >&2
  echo "true"
  exit 0
}

BASE="${1:-}"
HEAD="${2:-}"

[ -n "$BASE" ] && [ -n "$HEAD" ] || run_everything "missing base or head sha"

# A branch's first push reports an all-zero "before" sha: there is no
# previous commit to diff against, so nothing can be established.
case "$BASE" in
  *[!0]*) ;;
  *) run_everything "base sha is all zeros (new branch)" ;;
esac

git rev-parse --git-dir > /dev/null 2>&1 || run_everything "not inside a git repository"
git cat-file -e "$BASE^{commit}" 2> /dev/null || run_everything "base sha $BASE is not a commit here"
git cat-file -e "$HEAD^{commit}" 2> /dev/null || run_everything "head sha $HEAD is not a commit here"

# Compare against the merge base so commits landed on main since this branch
# started do not masquerade as this change's own files. If there is no shared
# ancestor, fall back to the base itself rather than guessing.
MERGE_BASE="$(git merge-base "$BASE" "$HEAD" 2> /dev/null)" || MERGE_BASE="$BASE"
[ -n "$MERGE_BASE" ] || MERGE_BASE="$BASE"

FILES="$(git diff --name-only --no-renames "$MERGE_BASE" "$HEAD" 2> /dev/null)" \
  || run_everything "git diff failed"

[ -n "$FILES" ] || run_everything "no files in the diff"

while IFS= read -r file; do
  [ -n "$file" ] || continue
  if ! printf '%s\n' "$file" | grep -qE "$DOCS_ONLY_RE"; then
    run_everything "$file is not documentation"
  fi
done <<< "$FILES"

count="$(printf '%s\n' "$FILES" | grep -c .)"
echo "ci-changes: all $count changed paths are documentation — skipping the code jobs" >&2
echo "false"
