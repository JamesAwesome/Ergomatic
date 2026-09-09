#!/usr/bin/env bash
# Gate for the tiered pre-push hook. Runs the hook BODY under `sh -e`, which is how husky invokes it (`.husky/_/h` line 19) -- the whole point, since a bare fallible statement aborts there:
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
fails=0
check() { if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1 -- expected '$2' got '$3'"; fails=$((fails+1)); fi; }

# DRY_RUN makes the hook echo its invocations instead of running them.
run_hook() { ( cd "$ROOT" && DRY_RUN=1 PREPUSH_BASE="$1" sh -e .husky/pre-push 2>&1 ); }

out="$(run_hook refs/remotes/origin/main)"; rc=$?
check "a resolvable base exits 0"            "0" "$rc"
case "$out" in *"--changed"*) r=0 ;; *) r=1 ;; esac
check "a resolvable base uses --changed"     "0" "$r"

out="$(run_hook refs/remotes/origin/does-not-exist)"; rc=$?
check "an unresolvable base still exits 0"   "0" "$rc"
case "$out" in *"FALLBACK"*) r=0 ;; *) r=1 ;; esac
check "an unresolvable base falls back loud" "0" "$r"
case "$out" in *"--changed"*) r=1 ;; *) r=0 ;; esac
check "the fallback does NOT use --changed"  "0" "$r"
# The brief's own mutation table pairs "drop $SCOPE from the fallback" with
# the Docker-free check below -- but that check reads $out from the LATER
# resolvable-base call, never the fallback's own output, so dropping $SCOPE
# from the fallback could never make it fail (DRY_RUN never spells out
# vitest's default project list either, so grepping the fallback's own
# output for the absent flag "--project integration" wouldn't catch it).
# "--project client" is distinctive to the SCOPE-bearing invocation (the
# unconditional scripts/ gate below never carries it), so its presence in
# the fallback's own output is what actually proves $SCOPE survived.
case "$out" in *"--project client"*) r=0 ;; *) r=1 ;; esac
check "the fallback keeps its Docker-free scope" "0" "$r"

# The whole-tree gates cannot be selected by --changed, so they must be a
# SECOND invocation -- `--changed X scripts/` INTERSECTS and finds nothing.
out="$(run_hook refs/remotes/origin/main)"
# Both dry-run lines contain "scripts/test-run.sh", so a bare `grep -c
# 'scripts/'` counts 2 and fails against a CORRECT hook. Anchor on the
# second invocation's distinctive argument instead.
check "the scripts/ gates run unconditionally" "1" "$(printf '%s' "$out" | grep -c -- '--project unit scripts/')"
check "there are two vitest invocations"       "2" "$(printf '%s' "$out" | grep -c 'test-run.sh')"

# Docker-free: the integration project must never be admitted.
case "$out" in *"--project integration"*) r=1 ;; *) r=0 ;; esac
check "integration project is never admitted" "0" "$r"

if [ "$fails" -ne 0 ]; then echo "$fails failure(s)"; exit 1; fi
echo "all pre-push cases pass"
