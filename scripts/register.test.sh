#!/usr/bin/env bash
# Unit tests for register.sh — the ROADMAP register ratchet (Phase RR, spec
# §8.2). A throwaway git repo stands in for the real history wherever a case
# needs a ref, the pattern scripts/ci-changes.test.sh already uses.
#
# The invariants these tests defend (spec §2):
#   I1 the register's row count never rises across a PR
#   I3 a register section contains only OPEN rows
#   I6 moving a row between classes is not a strike, so every class is reported
#   I9 every section carries a class marker, and there is no default
#
# Every REFUSAL case is the point of this file rather than padding: rev 2 of
# the spec shipped five of them as silent passes, and a gate that fails open
# into a tidier number is the worst available failure (spec §5.1, §5.2).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/register.sh"
FIX="$HERE/fixtures/register"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
fails=0
check() { if [ "$1" = "$2" ]; then echo "ok: $3"; else echo "FAIL: $3 (want '$2' got '$1')"; fails=$((fails + 1)); fi; }
# has <haystack> <needle> <name> — the needle must appear
has() { case "$1" in *"$2"*) echo "ok: $3" ;; *) echo "FAIL: $3 (missing '$2')"; fails=$((fails + 1)) ;; esac; }
# lacks <haystack> <needle> <name> — the needle must NOT appear
lacks() { case "$1" in *"$2"*) echo "FAIL: $3 (unwanted '$2')"; fails=$((fails + 1)) ;; *) echo "ok: $3" ;; esac; }

run() { out="$(bash "$SCRIPT" "$@" 2>&1)"; rc=$?; }

# ---------------------------------------------------------------- count

run count "$FIX/well-formed.md"
check "$rc" "0" "count: a fully marked file exits 0"
has "$out" "unmarked=0" "count: reports unmarked=0"
has "$out" "register open:7 closed:4 sub:1" "count: register tallies both carriers"
has "$out" "debt open:1 closed:0 sub:0" "count: debt is counted, never payable"
has "$out" "pinned open:1" "count: pinned is reported (I6)"
has "$out" "vision open:1" "count: vision is reported (I6)"
has "$out" "phase open:1 closed:1" "count: phase is reported (I6)"
has "$out" "ledger open:1" "count: ledger is reported (I6)"
has "$out" "container open:0" "count: container is reported (I6)"

run count "$FIX/unmarked.md"
check "$rc" "2" "count: REFUSES a section with no marker"
has "$out" "Owed captures and walk items" "count: names the unmarked section"

run count "$FIX/bad-marker.md"
check "$rc" "2" "count: REFUSES an unrecognised marker"
has "$out" "regsiter" "count: names the unrecognised marker"

run count "$FIX/no-sections.md"
check "$rc" "2" "count: REFUSES a file with zero sections"

run count "$FIX/does-not-exist.md"
check "$rc" "2" "count: REFUSES an unreadable file"

# The PR-2 seam test (spec §8.3): PR 2 writes a marker into every section of
# the REAL ROADMAP.md and every later gate reads them. Exact tallies are NOT
# asserted here — a transcribed census goes stale (spec §3.4) — but every one
# of the seven classes must be present and nothing may be unmarked.
run count "$REPO_ROOT/ROADMAP.md"
check "$rc" "0" "count: the real ROADMAP.md is fully marked"
has "$out" "unmarked=0" "count: the real ROADMAP.md has no unmarked section"
for cls in register debt pinned vision phase ledger container; do
  has "$out" "$cls open:" "count: the real ROADMAP.md reports class $cls"
done

# ---------------------------------------------------------------- closed

run closed "$FIX/well-formed.md"
check "$rc" "1" "closed: candidates present exits 1"
has "$out" "DONE — a closed bullet" "closed: flags a closed BULLET"
has "$out" "RULED KEEP" "closed: flags a closed TABLE ROW"
has "$out" "401 route table" "closed: matches a mid-title disposition"
has "$out" "says CLOSED" "closed: matches a title WRAPPED across lines"
lacks "$out" "UNRESOLVED" "closed: does NOT flag UNRESOLVED (negation guard)"
lacks "$out" "UNSHIPPED" "closed: does NOT flag UNSHIPPED (word boundaries alone)"
lacks "$out" "NOT DISCHARGED" "closed: does NOT flag 'NOT DISCHARGED BY IT'"
lacks "$out" "RESOLVED in principle" "closed: does NOT flag an open [ ] row"
lacks "$out" "A row with a clean title" "closed: does NOT match the row BODY"
lacks "$out" "a phase task" "closed: looks only in register and debt sections"
check "$(bash "$SCRIPT" closed "$FIX/well-formed.md" 2> /dev/null | grep -c .)" "4" "closed: exactly four candidates"

run closed "$FIX/bad-marker.md"
check "$rc" "2" "closed: REFUSES an unrecognised marker"

# ---------------------------------------------------------------- ratchet

# mkrepo — a throwaway repo whose ROADMAP.md is the well-formed fixture.
# Prints nothing; sets TMP and BASE.
mkrepo() {
  TMP="$(mktemp -d)"
  git init -q -b main "$TMP/repo"
  cd "$TMP/repo" || exit 1
  git config user.email t@t
  git config user.name t
  cp "$FIX/well-formed.md" ROADMAP.md
  git add -A
  git commit -q -m base
  BASE="$(git rev-parse HEAD)"
}
teardown() { cd /; rm -rf "$TMP"; }

# file_row <section-heading-text> <title> — append a row to that section
file_row() {
  awk -v sec="$1" -v title="$2" '
    index($0, sec) == 1 { insec = 1; print; next }
    insec && /^#{1,2} / { print "- [ ] **" title "** A newly filed row."; print ""; insec = 0 }
    { print }
    END { if (insec) print "- [ ] **" title "** A newly filed row." }
  ' ROADMAP.md > .r && mv .r ROADMAP.md
}
strike_row() { grep -v "$1" ROADMAP.md > .r && mv .r ROADMAP.md; }

mkrepo
file_row "## Small, queued" "A brand new row"
strike_row "A live row that names no code site"
run ratchet "$BASE"
check "$rc" "0" "ratchet: file one, strike one passes"
has "$out" "register base:7 head:7 delta:0" "ratchet: reports base, head and delta"
teardown

mkrepo
file_row "## Small, queued" "A brand new row"
run ratchet "$BASE"
check "$rc" "1" "ratchet: file one, strike none FAILS"
has "$out" "delta:+1" "ratchet: names the rise"
has "$out" "ENTERED: A brand new row" "ratchet: names the row that entered"
teardown

mkrepo
strike_row "A live row that names no code site"
run ratchet "$BASE"
check "$rc" "0" "ratchet: striking one passes"
has "$out" "LEFT: A live row that names no code site" "ratchet: names the rows that LEFT"
teardown

mkrepo
file_row "## Phase ZZ" "A scheduled task"
run ratchet "$BASE"
check "$rc" "0" "ratchet: a row filed into a phase section is ignored"
teardown

mkrepo
file_row "## Small, queued" "A brand new row"
run ratchet "$BASE"
for cls in register debt pinned vision phase ledger container; do
  has "$out" "$cls base:" "ratchet: reports class $cls at base and head (I6)"
done
teardown

mkrepo
: > ROADMAP.md
run ratchet "$BASE"
check "$rc" "2" "ratchet: REFUSES a head with zero sections"
teardown

mkrepo
awk '!/^- / && !/^\|/' ROADMAP.md > .r && mv .r ROADMAP.md
run ratchet "$BASE"
check "$rc" "2" "ratchet: REFUSES head register 0 against a nonzero base"
teardown

mkrepo
run ratchet "not-a-ref"
check "$rc" "2" "ratchet: REFUSES a base that cannot be resolved"
teardown

mkrepo
run ratchet
check "$rc" "2" "ratchet: REFUSES when origin/main does not resolve"
lacks "$out" "delta" "ratchet: prints no result when it refused"
teardown

# The two-branch collision (spec §5.2's exploit, §8.2's bolded case). Two
# branches from one base each strike the SAME row and file one elsewhere;
# each reads delta 0 against its own fork point, both go green, and the
# register rises anyway. The gate catches it only by recomputing the merge
# base AFTER `git merge origin/main`, and only once main carries a nonzero
# register net between the shared base and that merge — so main NET-STRIKES
# one row here. Without that, correct and mutant both report +1 and the
# mutation does not bite.
TMP="$(mktemp -d)"
git init -q --bare "$TMP/origin.git"
git clone -q "$TMP/origin.git" "$TMP/work" 2> /dev/null
cd "$TMP/work" || exit 1
git config user.email t@t
git config user.name t
cp "$FIX/well-formed.md" ROADMAP.md
git add -A
git commit -q -m base
git push -q origin HEAD:main
git branch -q -M main
SHARED="$(git rev-parse HEAD)"

# branch 1 lands on main: strikes the shared row AND a second one, files one.
git checkout -q -b branch1
strike_row "A live row that names no code site"
strike_row "UNSHIPPED, and still owed"
file_row "## Small, queued" "Branch one's new row"
git commit -q -am branch1
git push -q origin HEAD:main

# branch 2, from the shared base, strikes the SAME row and files its own.
git checkout -q -b branch2 "$SHARED"
strike_row "A live row that names no code site"
file_row "## Rides the next PR touching the connected surface" "Branch two's new row"
git commit -q -am branch2
git fetch -q origin
run ratchet
check "$rc" "2" "collision: REFUSES before the branch has merged main"
has "$out" "ancestor" "collision: the refusal names the ancestor check"

git merge -q --no-edit origin/main > /dev/null 2>&1
run ratchet
check "$rc" "1" "collision: FAILS once main is merged (the strike was already banked)"
has "$out" "delta:+1" "collision: the register rose by one"
teardown

# ---------------------------------------------------------------- usage

run
check "$rc" "2" "usage: no subcommand REFUSES"
run frobnicate
check "$rc" "2" "usage: an unknown subcommand REFUSES"
run stamps "$FIX/well-formed.md"
check "$rc" "2" "usage: stamps is not built yet and says so"
has "$out" "PR 4" "usage: stamps names the PR that builds it"
run expired "$FIX/well-formed.md"
check "$rc" "2" "usage: expired is not built yet and says so"

echo
if [ "$fails" -eq 0 ]; then echo "register.test.sh: all cases passed"; else echo "register.test.sh: $fails FAILED"; fi
exit $((fails > 0))
