#!/usr/bin/env bash
# Proof that scripts/conflict-markers.sh can go RED (RF21), and on what.
#
# Every case runs the REAL script against a throwaway git repo built here,
# never a copy of it and never a hand-rolled grep, so the thing under test is
# the thing CI runs. The red cases come first: a gate whose failure has never
# been seen is decoration.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/conflict-markers.sh"
fails=0
check() { if [ "$1" = "$2" ]; then echo "ok: $3"; else echo "FAIL: $3 (want '$2' got '$1')"; fails=$((fails+1)); fi; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git init -q "$TMP"
cd "$TMP"
git config user.email t@t.t && git config user.name t

echo "clean" > kept.md
git add -A && git commit -qm init

# 1. RED — the #446 shape exactly: all three markers in a tracked prose file.
{
  echo "before"
  echo "<<<<<<< HEAD"
  echo "ours"
  echo "======="
  echo "theirs"
  echo ">>>>>>> origin/main"
} > ledger.md
git add -A
out="$(bash "$SCRIPT" "$TMP" 2>&1)"; rc=$?
check "$rc" 1 "a tracked file carrying the three markers fails"
case "$out" in *ledger.md*) r=yes ;; *) r=no ;; esac
check "$r" yes "the failure NAMES the offending file"

# 2. RED — one marker alone is enough. A half-resolved conflict is the
#    likelier real case than a pristine three-marker block.
printf 'a\n>>>>>>> origin/main\n' > ledger.md
git add -A
bash "$SCRIPT" "$TMP" > /dev/null 2>&1; rc=$?
check "$rc" 1 "a lone >>>>>>> marker fails"

# 2b. RED — a lone <<<<<<< marker. Every arm of the pattern needs its OWN red
#     case: deleting the `^=======$` arm, or the `<<<<<<<` arm, left all of
#     the original eight assertions green, so two of three arms were ungated
#     (RF21). These two close that.
printf 'a\n<<<<<<< HEAD\nb\n' > ledger.md
git add -A
bash "$SCRIPT" "$TMP" > /dev/null 2>&1; rc=$?
check "$rc" 1 "a lone <<<<<<< marker fails"

# 2c. RED — a bare ======= alone on its line, the third arm.
printf 'a\n=======\nb\n' > ledger.md
git add -A
bash "$SCRIPT" "$TMP" > /dev/null 2>&1; rc=$?
check "$rc" 1 "a bare ======= line fails"

# 2d. RED — a marker whose branch LABEL has been deleted, so the run sits
#     alone on the line with no trailing space. The original pattern required
#     [[:space:]] after the run and let this through; a half-resolved conflict
#     is exactly where a label goes missing.
printf 'a\n<<<<<<<\nb\n>>>>>>>\n' > ledger.md
git add -A
bash "$SCRIPT" "$TMP" > /dev/null 2>&1; rc=$?
check "$rc" 1 "a marker with no branch label fails"

# 3. GREEN — resolved. The same file, markers removed, both sides kept.
printf 'ours\ntheirs\n' > ledger.md
git add -A
bash "$SCRIPT" "$TMP" > /dev/null 2>&1; rc=$?
check "$rc" 0 "the resolved file passes"

# 4. GREEN — prose that MENTIONS the markers mid-line does not trip it. This
#    is not hypothetical: conflict-markers.sh's own header names all three,
#    and it is a tracked file. Without the line anchor the gate would fail
#    against itself forever and get deleted.
printf 'Resolve a <<<<<<< HEAD block by keeping both sides.\n' > prose.md
git add -A
bash "$SCRIPT" "$TMP" > /dev/null 2>&1; rc=$?
check "$rc" 0 "a mid-line mention of a marker does not trip it"

# 5. GREEN — a row of equals signs is a markdown table rule or an underline,
#    not a conflict. Only a bare seven, alone on the line, counts.
printf 'Heading\n=========\n' > underline.md
git add -A
bash "$SCRIPT" "$TMP" > /dev/null 2>&1; rc=$?
check "$rc" 0 "an 8+ equals underline is not a conflict marker"

# 6. GREEN — an UNTRACKED file is not this gate's business. The check exists
#    to stop a marker reaching a commit; a dirty worktree mid-rebase is the
#    human's problem and failing on it would train people to ignore this.
printf '<<<<<<< HEAD\n' > untracked.md
bash "$SCRIPT" "$TMP" > /dev/null 2>&1; rc=$?
check "$rc" 0 "an untracked file carrying a marker does not fail the gate"

# 6b. RED — the gate can see a conflict in its OWN test file. The first
#     version excluded this script and conflict-markers.sh by pathspec, which
#     made the one file whose job is to have no blind spot the one place a
#     real conflict could hide. The line anchor is what protects them now, so
#     a marker planted here must still be caught.
mkdir -p scripts
printf '#!/usr/bin/env bash\n<<<<<<< HEAD\n' > scripts/conflict-markers.test.sh
git add -A
bash "$SCRIPT" "$TMP" > /dev/null 2>&1; rc=$?
check "$rc" 1 "a marker inside the gate's own test file is still caught"
rm -rf scripts && git add -A

# 6c. EXIT 2 — outside a git work tree the gate must fail LOUD, never open.
#     It used to print "none in tracked files" and exit 0 there, which is a
#     green that checked nothing.
NOREPO="$(mktemp -d)"
printf '<<<<<<< HEAD\n' > "$NOREPO/x.md"
bash "$SCRIPT" "$NOREPO" > /dev/null 2>&1; rc=$?
check "$rc" 2 "outside a git work tree it exits 2 rather than reporting clean"
rm -rf "$NOREPO"

# 7. The real repo, which is the case CI actually runs. Its output is KEPT:
#    a failure here must name the offending file, and discarding stderr threw
#    away the one thing the script's failure path exists to give a reader.
out="$(bash "$SCRIPT" 2>&1)"; rc=$?
check "$rc" 0 "the Ergomatic tree itself is clean"
[ "$rc" -eq 0 ] || echo "$out"

if [ "$fails" -gt 0 ]; then echo "conflict-markers.test: $fails failed"; exit 1; fi
echo "conflict-markers.test: all passed"
