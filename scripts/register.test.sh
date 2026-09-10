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
fails=0
check() { if [ "$1" = "$2" ]; then echo "ok: $3"; else echo "FAIL: $3 (want '$2' got '$1')"; fails=$((fails + 1)); fi; }
# has <haystack> <needle> <name> — the needle must appear
has() { case "$1" in *"$2"*) echo "ok: $3" ;; *) echo "FAIL: $3 (missing '$2')"; fails=$((fails + 1)) ;; esac; }
# lacks <haystack> <needle> <name> — the needle must NOT appear
lacks() { case "$1" in *"$2"*) echo "FAIL: $3 (unwanted '$2')"; fails=$((fails + 1)) ;; *) echo "ok: $3" ;; esac; }

run() { out="$(bash "$SCRIPT" "$@" 2>&1)"; rc=$?; }
# has_last <needle> <name> — the needle must be on the REFUSAL line itself. The
# marker refusal prints the path twice, on an echo and on the refuse, and an
# assertion over the whole output is satisfied by either.
has_last() { case "$(printf '%s\n' "$out" | tail -1)" in *"$1"*) echo "ok: $2" ;; *) echo "FAIL: $2 (refusal line lacks '$1')"; fails=$((fails + 1)) ;; esac; }

# ---------------------------------------------------------------- count

run count "$FIX/well-formed.md"
check "$rc" "0" "count: a fully marked file exits 0"
has "$out" "unmarked=0" "count: reports unmarked=0"
has "$out" "register open:10 closed:9 sub:2" "count: register tallies both carriers"
has "$out" "debt open:1 closed:2 sub:0" "count: debt is counted, never payable"
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

# NOT HERE: `count` against the REAL ROADMAP.md. It was, and that made marker
# discipline a RED CI check — this file runs in CI's `scripts` job, which has
# no `if:` gate, so any PR adding an unmarked section would turn CI red even on
# a docs-only push. James ruled the gate ADVISORY (2026-09-09) and spec §8.3
# says in as many words that no CI job checks the real ROADMAP.md after PR 2.
# The PR-2 seam is run once as a gate command and recorded in the PR body.

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
check "$(bash "$SCRIPT" closed "$FIX/well-formed.md" 2> /dev/null | grep -c .)" "11" "closed: exactly eleven candidates"

run closed "$FIX/bad-marker.md"
check "$rc" "2" "closed: REFUSES an unrecognised marker"

run closed "$FIX/well-formed.md"
has "$out" "an absent-evidence row that was finally measured" "closed: searches the DEBT class too (I3 housekeeping)"
lacks "$out" "C2 account injection" "closed: a table row's LATER cell is not its title"
has "$out" "split with a blank line before it was CLOSED" "closed: a row's fold survives an internal blank line"
lacks "$out" "AMENDED" "closed: AMENDED is not a disposition (0 of 2 real matches were closed)"
lacks "$out" "NO LONGER CARRIES A COUNT" "closed: an open row refusing a count is not closed"
has "$out" "ACCEPTED (2026-09-10)" "closed: ACCEPTED still closes (2 of 2 real matches were closed)"
lacks "$out" "not a row" "closed: bullets inside a fenced block are not rows"

# Two classes the suite deliberately does NOT gate, named rather than left to
# read as coverage (RF21 — a green probe is a question about the suite):
#   * charging the `container` class. Container sections hold only other
#     headings, so they have no rows in any tree; widening the charge to
#     include one is behaviourally identical. Adding a row to a container
#     fixture would test a state the grammar forbids.
#   * `RATCHET_CLASS`'s whitelist check. It is belt: measured, removing the
#     check AND typo'ing the constant still fails five ratchet cases, because
#     a class that matches nothing makes every delta zero.

# ------------------------------------------------------------- refusals

run count "$FIX/untitled-row.md"
check "$rc" "2" "count: REFUSES an untitled row"
has "$out" "untitled" "count: names the untitled-row refusal"

run count "$FIX/empty-section.md"
check "$rc" "2" "count: REFUSES a section whose heading is followed by another heading"
has "$out" "# A" "count: names the empty unmarked section"

run count "$FIX/bad-marker.md"
has_last "bad-marker.md" "the marker REFUSAL line names which tree it read"

run count "$FIX/unclosed-fence.md"
check "$rc" "2" "count: REFUSES a file that ends inside an unclosed fence"
has_last "unclosed-fence.md" "the fence REFUSAL line names which tree it read"

run count "$FIX/empty-cell.md"
check "$rc" "2" "count: REFUSES a table row whose first cell is empty"

run count "$FIX/trailing-heading.md"
check "$rc" "2" "count: REFUSES an unmarked heading on the LAST line of the file"
has "$out" "A trailing heading with no marker" "count: names the trailing unmarked section"

run count "$FIX/untitled-row.md"
has_last "untitled-row.md" "the untitled-row REFUSAL line names which tree it read"

run count "$FIX/fence-spans-heading.md"
check "$rc" "2" "count: REFUSES a fence that SPANS a heading (parity would pass this)"
has_last "fence-spans-heading.md" "the spanning-fence REFUSAL line names which tree it read"

run count "$FIX/container-row.md"
check "$rc" "2" "count: REFUSES a row inside a container section"
has "$out" "container" "count: names the container refusal"

# ------------------------------------------------------------- sections

run sections "$FIX/well-formed.md"
check "$rc" "0" "sections: exits 0"
has "$out" "ARCHIVE? ## A door whose criteria are all ticked" "sections: marks a fully-ticked section as a CANDIDATE"
has "$out" "ARCHIVE? ## An emptied register section nobody removed" "sections: a section emptied to ZERO rows still appears (the terminal state)"
lacks "$out" "ARCHIVE? ## A section whose only rows are sub-bullets" "sections: an open SUB-bullet disqualifies a section"
has "$out" "sub:1            ## A section whose only rows are sub-bullets" "sections: reports open sub-bullets so open:0 is not three states at once"
has "$out" "ARCHIVE? ## A debt bucket that was finally emptied" "sections: an emptied DEBT section is a candidate too"
has "$out" "archive-candidates=3" "sections: counts the candidates"
lacks "$out" "ARCHIVE? ## Small, queued" "sections: a section with open rows is NOT a candidate"
lacks "$out" "## Phase ZZ" "sections: phase sections are out of scope"

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
has "$out" "register base:10 head:10 delta:0" "ratchet: reports base, head and delta"
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
# Values, not labels: the loop prints every class with `+0` regardless, so
# asserting the label is a tautology (it passes whenever the command exits 0).
has "$out" "register base:10 head:11" "ratchet: register tallies are real values"
has "$out" "debt base:1 head:1" "ratchet: debt is reported at its real value (I6)"
has "$out" "pinned base:1 head:1" "ratchet: pinned is reported at its real value (I6)"
has "$out" "vision base:1 head:1" "ratchet: vision is reported at its real value (I6)"
has "$out" "phase base:1 head:1" "ratchet: phase is reported at its real value (I6)"
has "$out" "ledger base:1 head:1" "ratchet: ledger is reported at its real value (I6)"
has "$out" "container base:0 head:0" "ratchet: container is reported at its real value (I6)"
teardown

mkrepo
file_row "## Owed captures and walk items" "A newly filed absent-evidence row"
run ratchet "$BASE"
check "$rc" "0" "ratchet: filing into DEBT is never payable by strike (I8)"
has "$out" "debt base:1 head:2" "ratchet: the debt rise is REPORTED, just not charged"
teardown

mkrepo
file_row "## Completed phases" "A newly recorded ledger row"
run ratchet "$BASE"
check "$rc" "0" "ratchet: filing into LEDGER is not charged"
teardown

mkrepo
file_row "## Accepted, pinned, and not being fixed" "A newly pinned row"
run ratchet "$BASE"
check "$rc" "0" "ratchet: filing into PINNED is not charged"
teardown

mkrepo
file_row "## After the strangers" "A new product idea"
run ratchet "$BASE"
check "$rc" "0" "ratchet: filing into VISION is not charged"
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
