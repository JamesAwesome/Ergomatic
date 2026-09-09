#!/usr/bin/env bash
# Gate for the tiered pre-push hook. Runs the hook BODY under `sh -e`, which is how husky invokes it (`.husky/_/h` line 19) -- the whole point, since a bare fallible statement aborts there:
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
fails=0
check() { if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1 -- expected '$2' got '$3'"; fails=$((fails+1)); fi; }

# The hook's preamble (.husky/common.sh) blocks below the .nvmrc Node major,
# and CI's `scripts` job installs no node -- so a real `node -v` there is
# whatever the runner image happens to ship. Measured 2026-09-08 by putting a
# `v24.9.0` stub on PATH: 8 of 11 cases FAIL on "HOOK BLOCKED", including
# every case about the hook's body. Stub it, exactly as the sibling
# scripts/pre-commit.test.sh does, so this gate tests the BODY and not the
# runner image. Production is unaffected: the real hook still reads real node.
STUB="$(mktemp -d)"
trap 'rm -rf "$STUB"' EXIT
cat > "$STUB/node" <<'STUB_NODE'
#!/bin/sh
if [ "${1:-}" = "-v" ]; then echo v26.0.0; exit 0; fi
exit 64
STUB_NODE
chmod +x "$STUB/node"

# PREPUSH_DRY_RUN makes the hook echo its invocations instead of running them.
run_hook() { ( cd "$ROOT" && PATH="$STUB:$PATH" PREPUSH_DRY_RUN=1 PREPUSH_BASE="$1" sh -e .husky/pre-push 2>&1 ); }

# The "resolvable" cases below use HEAD, not refs/remotes/origin/main --
# the hook's own production default. Measured 2026-09-08 by simulating CI's
# checkout exactly (actions/checkout@v7 with no fetch-depth defaults to 1):
# `git clone --depth 1 --branch <branch> file://<repo> sim` leaves
# `sim`'s `git for-each-ref` with ONLY this branch's heads/remotes entries --
# refs/remotes/origin/main is absent, so `git rev-parse --verify --quiet` on
# it fails and the hook correctly takes its FALLBACK branch, failing this
# test for a ref reason having nothing to do with the hook body. HEAD always
# resolves in any checkout depth and still exercises the --changed branch
# (the hook only needs $BASE to resolve, not to be origin/main specifically).
# Do NOT swap this back to refs/remotes/origin/main and do NOT add
# fetch-depth: 0 to ci.yml to make that ref exist -- the hook's production
# default is correct and unrelated; only this test's base needed changing.
out="$(run_hook HEAD)"; rc=$?
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
# from the fallback could never make it fail (PREPUSH_DRY_RUN never spells out
# vitest's default project list either, so grepping the fallback's own
# output for the absent flag "--project integration" wouldn't catch it).
# "--project client" is distinctive to the SCOPE-bearing invocation (the
# unconditional scripts/ gate below never carries it), so its presence in
# the fallback's own output is what actually proves $SCOPE survived.
case "$out" in *"--project client"*) r=0 ;; *) r=1 ;; esac
check "the fallback keeps its Docker-free scope" "0" "$r"

# The whole-tree gates cannot be selected by --changed, so they must be a
# SECOND invocation -- `--changed X scripts/` INTERSECTS and finds nothing.
# HEAD again -- see the comment above the first run_hook call.
out="$(run_hook HEAD)"
# Both dry-run lines contain "scripts/test-run.sh", so a bare `grep -c
# 'scripts/'` counts 2 and fails against a CORRECT hook. Anchor on the
# second invocation's distinctive argument instead.
check "the scripts/ gates run unconditionally" "1" "$(printf '%s' "$out" | grep -c -- '--project unit scripts/')"
check "there are three vitest invocations"     "3" "$(printf '%s' "$out" | grep -c 'test-run.sh')"

# The CLIENT half of the same class. Measured 2026-09-08 on this branch:
# appending `.zz-probe { color: var(--totally-undefined-probe); }` to
# app/src/index.css and running
# `vitest run --changed HEAD --project client` prints no test-file summary at
# all and selects nothing, while
# `vitest run --project client src/theme/customPropertyCensus.test.ts` prints
# `Test Files  1 failed (1)`. index.css is imported only by main.tsx, which
# no test imports, so it sits in no test's module graph and `--changed`
# cannot reach the suites whose subject it is. Before this invocation existed
# the hook let that push through.
check "the client whole-tree gate runs unconditionally" "1" "$(printf '%s' "$out" | grep -c -- '--project client src/')"
client_line="$(printf '%s\n' "$out" | grep -- '--project client src/' | head -1 || true)"
case "$client_line" in *" src/theme/customPropertyCensus.test.ts"*) r=0 ;; *) r=1 ;; esac
check "the selection names the index.css census suite" "0" "$r"

# CENSUS, on a needle INDEPENDENT of the hook's own. The hook enumerates on
# the `node:fs` IMPORT; this enumerates on the readFileSync/readdirSync/
# statSync CALL. Measured 2026-09-08: both return the same 46 files. The
# moment they stop agreeing, the hook's enumeration has gone stale for a
# suite that reads the tree, and this goes red naming it -- which is the
# whole reason the hook enumerates instead of carrying a list.
missing=""
for f in $( cd "$ROOT/app" && grep -rlE 'readFileSync|readdirSync|statSync' src \
              --include='*.test.ts' --include='*.test.tsx' | sort ); do
  case "$client_line" in *" $f"*) ;; *) missing="$missing $f" ;; esac
done
check "every file-reading client suite is selected" "" "$missing"
# Mutation run 2026-09-08: delete the whole `CLIENT_TREE` block from
# .husky/pre-push --
#   FAIL  there are three vitest invocations -- expected '3' got '2'
#   FAIL  the client whole-tree gate runs unconditionally -- expected '1' got '0'
#   FAIL  the selection names the index.css census suite -- expected '0' got '1'
#   FAIL  every file-reading client suite is selected -- expected '' got ' src/...'
#     (46 names)
# Mutation run 2026-09-08: narrow the hook's needle to `'"node:fs"'` with the
# closing quote, so `node:fs/promises` importers drop out -- the census stays
# green because no client test imports that form today, which is exactly why
# the census needle is the CALL and not a second spelling of the import.

# Docker-free: the integration project must never be admitted.
case "$out" in *"--project integration"*) r=1 ;; *) r=0 ;; esac
check "integration project is never admitted" "0" "$r"

# The seam is NAMESPACED, and that is the point: an ambient DRY_RUN=1 must
# not turn a push into two echoed lines and a zero exit. Runs the hook for
# real with a stub `pnpm` first on PATH, so nothing heavy executes.
FAKEBIN="$(mktemp -d)"
printf '#!/bin/sh\necho "ran: $*"\n' > "$FAKEBIN/pnpm"
chmod +x "$FAKEBIN/pnpm"
out="$( cd "$ROOT" && DRY_RUN=1 PREPUSH_BASE=HEAD \
  PATH="$FAKEBIN:$STUB:$PATH" sh -e .husky/pre-push 2>&1 )"
case "$out" in *"would run:"*) r=1 ;; *) r=0 ;; esac
check "an ambient DRY_RUN does not disarm the hook" "0" "$r"
check "an ambient DRY_RUN still runs all three gates" "3" "$(printf '%s' "$out" | grep -c '^ran: ')"
rm -rf "$FAKEBIN"
# Mutation run 2026-09-08: rename PREPUSH_DRY_RUN back to DRY_RUN in
# .husky/pre-push --
#   FAIL  an ambient DRY_RUN does not disarm the hook -- expected '0' got '1'
#   FAIL  an ambient DRY_RUN still runs all three gates -- expected '3' got '0'
# 6 failures in total: the four dry-run cases above lose their seam and go
# red too, which is the same fact from the other side.

if [ "$fails" -ne 0 ]; then echo "$fails failure(s)"; exit 1; fi
echo "all pre-push cases pass"
