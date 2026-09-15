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
# THREE KNOWN FALSE POSITIVES, all accepted and all cheap to work around,
# because the miss they would cost to allow is worse than the nuisance:
#   1. ANY line that is exactly seven `=` and nothing else — a setext heading
#      underline is the common case, but a section separator is the same
#      shape. Use eight or more.
#   2. A fenced code block in a document demonstrating what a conflict looks
#      like. Indent the demonstrated marker by one space inside the fence.
#   3. A seven-deep markdown blockquote (`>>>>>>> quoted text`). Nothing in
#      this repo nests that far; if something does, reflow it.
# They are recorded here, not only in the test, so the person who hits one
# finds the reason at the file they are told to fix. Measured 2026-09-15:
# `git grep -nE '^={5,12}$'` returns nothing, so there are no near-misses in
# the tree today.
set -uo pipefail

ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
# exit 2, not 1: since the work-tree check below, 1 means "markers found" and
# 2 means "nothing was checked". A bad path is the second thing, not the first.
cd "$ROOT" || { echo "conflict-markers: cannot enter $ROOT" >&2; exit 2; }

# FAIL LOUD, NEVER OPEN. Outside a git work tree `git grep` errors and returns
# nothing, and an empty result would otherwise read as "clean" — a green that
# proves nothing, which is the exact shape RF21 exists to forbid.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "conflict-markers: $ROOT is not a git work tree, so NOTHING was checked" >&2
  exit 2
fi

# Anchored at line start, so prose that merely MENTIONS a marker mid-line does
# not trip it — this script's own header names them all, and it is a tracked
# file. Three things the first version got wrong and this one does not:
#   * The labelled arms take an OPTIONAL label. A half-resolved conflict whose
#     branch name has been deleted leaves the run alone on its line, which is
#     precisely the shape this exists to catch.
#   * `|||||||` is here because `merge.conflictStyle=diff3`/`zdiff3` emits it
#     for the common ancestor. A conflict half-resolved down to only that line
#     passed the first version entirely.
#   * The `=======` arm tolerates trailing whitespace, which makes it
#     CRLF-safe. Without it a conflict in a file with CRLF endings was caught
#     on two arms and missed on the third.
PATTERN='^(<<<<<<<|>>>>>>>|\|\|\|\|\|\|\|)([[:space:]]|$)|^=======[[:space:]]*$'

# `git grep` over tracked files only: node_modules, dist/ and every build
# artifact are excluded for free, and a binary file cannot produce a false hit.
# NO PATHSPEC EXCLUSIONS, deliberately. The line anchor already protects this
# script and its test, and excluding them would mean the gate could never see
# a real conflict inside itself — a blind spot in the one file whose job is to
# have none.
HITS="$(git grep -nE "$PATTERN" 2>/dev/null)"
GREP_STATUS=$?

# READ THE STATUS, not just the output. `git grep` answers 0 for "found" and
# 1 for "none found"; ANYTHING ELSE is a failure to look — a corrupt index
# exits 128 with no output, which the empty-string check alone would have
# reported as a clean tree. That is the same fail-open this file's header
# forbids, one layer in from the not-a-work-tree case.
if [ "$GREP_STATUS" -gt 1 ]; then
  echo "conflict-markers: git grep exited $GREP_STATUS, so NOTHING was checked" >&2
  git grep -nE "$PATTERN" >&2
  exit 2
fi

if [ -n "$HITS" ]; then
  echo "conflict-markers: unresolved merge-conflict markers in tracked files:" >&2
  echo "$HITS" >&2
  echo "conflict-markers: resolve the conflict and keep BOTH sides where both are real additions — the #446 case was two independent sets of ledger entries, not a choice between them" >&2
  echo "conflict-markers: and if a side was a NUMBERED list, renumber it and then grep the repo for citations of the OLD numbers" >&2
  exit 1
fi

echo "conflict-markers: none in tracked files"
