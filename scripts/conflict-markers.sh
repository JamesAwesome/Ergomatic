#!/usr/bin/env bash
# Are there unresolved merge-conflict markers anywhere in the tracked tree?
#
# Usage: conflict-markers.sh [repo-root]
#
# WHY: on 2026-09-15 PR #446 merged to main carrying `<<<<<<< HEAD` /
# `=======` / `>>>>>>> origin/main` in THREE agent memory files —
# antagonist-techniques.md, antagonist-ledger.md and pm-ledger.md. Nothing
# anywhere went red. The paths live under `.claude/`, so `ci-changes.sh`
# correctly skipped the app, docker and e2e jobs; lint-staged's globs are
# `app/**`, so no formatter ever opened them; and the files are prose, so no
# compiler or test could. The markers survived a merge commit, a full review
# and a PM gate, and landed as INSTRUCTIONS that every future agent reads.
#
# That is the whole case for this check: a conflict marker is a defect no
# other gate in this repo can see, in exactly the files whose whole job is to
# be read and believed. It is deliberately dumb — a line-anchored grep over
# tracked files — because the failure it catches is dumb.
#
# It checks CONTENT, not conflict STATE: a checkout mid-rebase is the human's
# business, but a marker that reaches a commit is not.
set -uo pipefail

ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT" || exit 1

# Anchored at line start and requiring the 7-character run, so prose that
# merely mentions a marker does not trip it. This script's own comment above
# is why that matters: it names all three markers, and it is a tracked file.
PATTERN='^(<<<<<<<|>>>>>>>)[[:space:]]|^=======$'

# `git grep` over the INDEX+worktree of tracked files only: node_modules,
# dist/ and every build artifact are excluded for free, and a binary file
# cannot produce a false hit.
HITS="$(git grep -nE "$PATTERN" -- \
  ':!scripts/conflict-markers.sh' \
  ':!scripts/conflict-markers.test.sh' 2>/dev/null)"

if [ -n "$HITS" ]; then
  echo "conflict-markers: unresolved merge-conflict markers in tracked files:" >&2
  echo "$HITS" >&2
  echo "conflict-markers: resolve the conflict and keep BOTH sides where both are real additions — the #446 case was two independent sets of ledger entries, not a choice between them" >&2
  exit 1
fi

echo "conflict-markers: none in tracked files"
