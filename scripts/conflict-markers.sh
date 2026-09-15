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
#
# TWO KNOWN FALSE POSITIVES, both accepted and both cheap to work around,
# because the miss they would cost to allow is worse than the nuisance: a
# markdown setext heading underlined with EXACTLY seven `=`, and a fenced code
# block in a document demonstrating what a conflict looks like. Use eight or
# more equals signs for an underline; indent a demonstrated marker by one
# space inside the fence. Both are recorded here rather than in the test alone
# so the person who hits one finds the reason at the file they are told to fix.
set -uo pipefail

ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT" || exit 1

# FAIL LOUD, NEVER OPEN. Outside a git work tree `git grep` errors and returns
# nothing, and an empty result would otherwise read as "clean" — a green that
# proves nothing, which is the exact shape RF21 exists to forbid.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "conflict-markers: $ROOT is not a git work tree, so NOTHING was checked" >&2
  exit 2
fi

# Anchored at line start, so prose that merely MENTIONS a marker mid-line does
# not trip it — this script's own header names all three, and it is a tracked
# file. The `<<<<<<<` and `>>>>>>>` arms take an optional label: a
# half-resolved conflict whose branch name has been deleted leaves the run
# alone on its line, and that is precisely the shape this exists to catch.
PATTERN='^(<<<<<<<|>>>>>>>)([[:space:]]|$)|^=======$'

# `git grep` over tracked files only: node_modules, dist/ and every build
# artifact are excluded for free, and a binary file cannot produce a false hit.
# NO PATHSPEC EXCLUSIONS, deliberately. The line anchor already protects this
# script and its test, and excluding them would mean the gate could never see
# a real conflict inside itself — a blind spot in the one file whose job is to
# have none.
HITS="$(git grep -nE "$PATTERN" 2>/dev/null)"

if [ -n "$HITS" ]; then
  echo "conflict-markers: unresolved merge-conflict markers in tracked files:" >&2
  echo "$HITS" >&2
  echo "conflict-markers: resolve the conflict and keep BOTH sides where both are real additions — the #446 case was two independent sets of ledger entries, not a choice between them" >&2
  echo "conflict-markers: and if a side was a NUMBERED list, renumber it and then grep the repo for citations of the OLD numbers" >&2
  exit 1
fi

echo "conflict-markers: none in tracked files"
