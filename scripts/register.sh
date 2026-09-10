#!/usr/bin/env bash
# register.sh — the ROADMAP register ratchet (Phase RR).
#
# Filing a roadmap row is free and closing one is not, so the register only
# grows. This script makes the register's row count a thing a command can
# measure, so a PR that files N rows can be asked to strike N.
#
# Subcommands (spec docs/superpowers/specs/2026-09-09-register-ratchet-design.md):
#   count   [<ref|file>]        every class tally, plus unmarked=<n>
#   closed  [<ref|file>]        candidate closed rows still sitting in the register
#   sections [<ref|file>]      per-section tallies; names sections with zero open rows
#   ratchet [<base>]            class tallies at base and head, deltas, identities
#
# Exit codes. The third is the whole point: an operator handed exit 1 must be
# able to tell "the register rose" from "the gate never ran".
#   0  the gate passed
#   1  the gate FAILED on the thing it measures
#   2  REFUSAL — the gate could not run, and no result may be inferred
#
# What this script may claim, and no more (spec §5.2):
#   ratchet  the register did not rise against a merge base it PROVED it could
#            resolve. NOT that no row moved class, NOT that a row left
#            deliberately rather than in a merge.
#   closed   rows whose TITLES match the closed vocabulary, as CANDIDATES.
#            NOT that they are closed, NOT that no closed row remains.
#   sections which sections have no row `closed` left OPEN and no open
#            sub-bullet. It is `closed`'s
#            heuristic aggregated, so it inherits every cap above: NOT that a
#            section is finished, and NOT that its PROSE agrees — a section's
#            status line lives in text this never reads, and the one real
#            candidate today says "Status: OPEN at James's request" above six
#            ticked criteria. A section that never held rows also reads
#            `open:0 closed:0` and is offered — the `?` is the whole point.
#
# `date` is banned here. `date -j -f` is BSD-only and exits 1 on the Linux
# runner, and the two platforms disagree about invalid calendar dates — a gate
# that fails open into a tidier number is the worst available failure. Date
# handling arrives with `stamps`/`expired` in PR 4, in pure awk.
set -uo pipefail

CLASSES="register debt pinned vision phase ledger container"
# Classes the ratchet charges for. `debt` is counted and never payable (I8):
# a row saying "nobody has measured X" has no code site to become a comment.
RATCHET_CLASS="register"

# A typo here would charge zero rows forever with nothing printed for it. This
# is BELT, not the gate: measured, removing this check and typo'ing the
# constant still fails five ratchet cases, because a class matching no row
# makes every delta zero. Kept because the failure it prevents is legible and
# the one it does not prevent is five confusing test failures.
for _c in $RATCHET_CLASS; do
  case " $CLASSES " in
    *" $_c "*) ;;
    *) echo "register.sh: REFUSED — RATCHET_CLASS names '$_c', which is not one of: $CLASSES" >&2; exit 2 ;;
  esac
done

refuse() {
  echo "register.sh: REFUSED — $*" >&2
  exit 2
}

usage() {
  cat >&2 <<'USAGE'
usage: register.sh <count|closed|sections|ratchet> [<ref|file>]
  count   [<ref|file>]  class tallies plus unmarked=<n>   (2 if any section is unmarked)
  closed  [<ref|file>]  candidate closed rows             (1 if any)
  sections [<ref|file>] per-section open/closed, and which are ARCHIVE-ready
  ratchet [<base>]      base/head tallies and identities  (1 if the register rose)
A bare <ref> is read as `git show <ref>:ROADMAP.md`; an existing path is read
directly; no argument reads ROADMAP.md from the repository root.
USAGE
  exit 2
}

# read_source [<ref|file>] — print a ROADMAP.md to stdout, or fail non-zero.
read_source() {
  local spec="${1:-}"
  if [ -z "$spec" ]; then
    local root
    root="$(git rev-parse --show-toplevel 2> /dev/null)" || return 1
    [ -n "$root" ] || return 1
    cat "$root/ROADMAP.md" 2> /dev/null
    return
  fi
  if [ -f "$spec" ]; then
    cat "$spec"
    return
  fi
  git show "$spec:ROADMAP.md" 2> /dev/null
}

# The parser. Emits one tab-separated record per section and per row:
#   SEC \t <class> \t <heading>
#   ROW \t <class> \t open|closed \t bullet|table|sub \t <title>
#   BAD \t <heading> \t <marker or empty>
# A section's class marker sits on the line IMMEDIATELY after its heading, and
# the seven strings are a whitelist: an unrecognised marker counts as unmarked.
# Rev 2 guarded a section with no marker and said nothing about a misspelled
# one, which reports unmarked=0 and a FALL of three rows — worse than no marker
# at all, because a fall pays for a new row.
read -r -d '' PARSER <<'AWK'
function trim(s) { gsub(/[ \t]+/, " ", s); gsub(/^ +| +$/, "", s); return s }

# The title is the row's bolded (or struck) opener, never the folded body.
# Matching the body flags RC-14 on "NOT DISCHARGED BY IT" and Phase TD on
# "UNRESOLVED" — both live rows, both measured (spec §6.2).
function extract_title(buf, first,   i, j, t) {
  t = buf
  if (substr(t, 1, 2) == "**") {
    i = index(substr(t, 3), "**")
    if (i > 0) return trim(substr(t, 3, i - 1))
  }
  if (substr(t, 1, 2) == "~~") {
    j = index(substr(t, 3), "~~")
    if (j > 0) return trim(substr(t, 3, j - 1))
  }
  return trim(first)
}

# The closed vocabulary, over the TITLE only, with word boundaries, a negation
# guard, and `- [ ]` as a hard OPEN override. Heuristic by design (spec §7):
# it produces CANDIDATES for hand confirmation, never an authority.
function looks_closed(title,   v) {
  # AMENDED and NO LONGER CARRIES A COUNT were in the spec's curated set and
  # are NOT here. Measured over the real ROADMAP.md at ae82e0da: AMENDED 0/2,
  # NO LONGER CARRIES A COUNT 0/1 — every match was a live row. An AMENDED row
  # has had its own facts corrected, which is not a disposition, and the
  # release-note row says it "NO LONGER CARRIES A COUNT" precisely because it
  # is open and refusing to carry one. The spec expected the `- [ ]` override
  # to kill that last one; the row has no checkbox, so it never could.
  v = "(^|[^A-Z])(DONE|SHIPPED|CLOSED|RESOLVED|STRUCK|DISCHARGED|DISPOSED|RULED|MOVED OUT|ACCEPTED|ASKED AND ANSWERED)([^A-Z]|$)"
  if (title !~ v) return 0
  if (title ~ /(NOT|UN)(-| )?(DONE|RESOLVED|DISCHARGED|CLOSED)/) return 0
  return 1
}

function flush(   title, state) {
  if (!inrow) return
  title = extract_title(buf, firstline)
  if (box == "x" || struck) state = "closed"
  else if (box == " ") state = "open"
  else state = looks_closed(title) ? "closed" : "open"
  if (cls == "container") print "BADCONTAINER\t" heading
  else if (title == "") print "BADROW\t" heading
  else printf "ROW\t%s\t%s\t%s\t%s\t%s\n", cls, state, carrier, title, heading
  inrow = 0; buf = ""; firstline = ""; box = ""; struck = 0
}

BEGIN { sections = 0; pending = 0; cls = ""; inrow = 0; intable = 0; fence = 0 }

# A fenced block's contents are not rows. Without this a ```bash block holding
# two `- ` lines inflates its section by two, silently and at exit 0 — and
# deleting such a block banks two phantom strikes that pay for two real
# filings. `ROADMAP.md` carries several fenced shell blocks already, and PR 2
# added a prose section describing shell commands.
/^ *(```|~~~)/ { if (inrow) buf = buf " " $0; fence = !fence; next }

# BALANCE IS THE WRONG INVARIANT, and the first version of this checked it.
# Two forgotten closers pass a parity check and still swallow everything
# between them: measured, `delta:-1` with two live rows named as LEFT and a
# whole section and its marker gone, at exit 0. What the parser actually needs
# is not "is this file well-formed" but "did a fence change which section a row
# belongs to" — a fence may not span a heading. This rule MUST precede the
# swallow rule below, or the heading never reaches it.
fence && /^#{1,2} / { print "FENCE"; fence = 0 }

fence { if (inrow) buf = buf " " $0; next }

/^#{1,2} / {
  flush()
  if (pending) print "BAD\t" heading "\t"
  sections++
  heading = $0
  cls = ""
  pending = 1
  intable = 0
  print "SEC\t\t" heading
  next
}

{
  if (pending) {
    pending = 0
    if ($0 ~ /^<!-- [a-z]+ -->$/) {
      marker = $0
      gsub(/^<!-- | -->$/, "", marker)
      if (index(" " KNOWN " ", " " marker " ") > 0) {
        cls = marker
        printf "SEC\t%s\t%s\n", cls, heading
        next
      }
      print "BAD\t" heading "\t" marker
      next
    }
    print "BAD\t" heading "\t"
    # fall through: this line may itself be a row
  }
}

/^$/ { intable = 0; buf = buf " "; next }

# Table rows. The header is the pipe line before the `| --- |` rule, and the
# rule itself is not a row. Four register-marked sections carry tables and one
# is MIXED — bullets AND a table — so both carriers are first class.
/^\|/ {
  flush()
  if ($0 ~ /^\|[ :|-]+\|?[ ]*$/) { intable = 1; next }
  if (!intable) next
  cell = $0
  sub(/^\|[ \t]*/, "", cell)
  n = index(cell, "|")
  if (n > 0) cell = substr(cell, 1, n - 1)
  cell = trim(cell)
  gsub(/^\*\*|\*\*$/, "", cell)
  cell = trim(cell)
  if (cell == "") print "BADROW\t" heading
  else printf "ROW\t%s\t%s\ttable\t%s\t%s\n", cls, (looks_closed(cell) ? "closed" : "open"), cell, heading
  next
}

# A row is a bullet at column zero. An indented bullet is part of its parent
# row, ends the parent's fold, and is reported as `sub` — splitting one row
# into a parent plus five sub-bullets still reads as one row (spec §3.4, and
# it is a stated blind spot rather than a solved one).
/^ *- / {
  flush()
  inrow = 1
  carrier = ($0 ~ /^- /) ? "bullet" : "sub"
  line = $0
  sub(/^ *- /, "", line)
  box = ""
  if (line ~ /^\[[ x]\] /) { box = substr(line, 2, 1); sub(/^\[[ x]\] /, "", line) }
  struck = (substr(line, 1, 2) == "~~")
  firstline = line
  buf = line
  next
}

# Continuation. An internal blank line does NOT end a row; a heading, a pipe
# line and the next bullet do. 261 of 314 top-level bullets wrap, so a
# line-scoped parse truncates most titles.
{ if (inrow) buf = buf " " $0 }

# An UNBALANCED fence is refused rather than parsed. Left to run, it swallows
# every row, section and marker after it and reports the loss as strikes —
# measured: one stray ``` above three rows printed `delta:-3`, named all three
# as LEFT, and exited 0. Over-counting was the old bug; under-counting is the
# direction that PAYS for filings, so this one fails closed.
END {
  flush()
  if (pending) print "BAD\t" heading "\t"
  if (fence) print "FENCE"
  print "SECTIONS\t" sections
}
AWK

# parse <spec> — run the parser, or refuse. Sets PARSED.
parse() {
  local spec="${1:-}" src
  src="$(read_source "$spec")" || refuse "cannot read ROADMAP.md from '${spec:-the working tree}'"
  [ -n "$src" ] || refuse "ROADMAP.md at '${spec:-the working tree}' is empty"
  PARSED="$(printf '%s\n' "$src" | awk -v KNOWN="$CLASSES" "$PARSER")" || refuse "the parser failed on '${spec:-the working tree}'"
  local sections
  sections="$(printf '%s\n' "$PARSED" | awk -F'\t' '$1 == "SECTIONS" { print $2 + 0 }')"
  # No `: "${sections:?}"` here: awk's END always prints a SECTIONS record, so
  # the variable cannot be empty and the guard would be unreachable — a guard
  # that cannot fire reads as protection and is not (RF21).
  [ -n "$sections" ] || refuse "the parser reported no section count for '${spec:-the working tree}'"
  # A file with zero sections is what an emptied or deleted ROADMAP.md looks
  # like, and I9's unmarked guard cannot fire on it: no sections means no
  # unmarked section, so it reads clean and a deletion reads as credit.
  [ "$sections" -gt 0 ] || refuse "'${spec:-the working tree}' contains no sections — an emptied or deleted ROADMAP.md reads as clean, never as credit"
  local bad
  bad="$(printf '%s\n' "$PARSED" | awk -F'\t' '$1 == "BAD" { printf "  %s  [%s]\n", $2, ($3 == "" ? "no marker" : "unrecognised marker: " $3) }')"
  if [ -n "$bad" ]; then
    echo "register.sh: every section carries one of: $CLASSES" >&2
    echo "register.sh: in '${spec:-the working tree}'" >&2
    printf '%s\n' "$bad" >&2
    refuse "$(printf '%s\n' "$bad" | grep -c .) section(s) unmarked or carrying an unrecognised marker in '${spec:-the working tree}'"
  fi
  if printf '%s\n' "$PARSED" | grep -q '^FENCE$'; then
    refuse "a code fence in '${spec:-the working tree}' spans a heading or is never closed — everything inside it is invisible, and invisible rows read as strikes"
  fi
  local badcontainer
  badcontainer="$(printf '%s\n' "$PARSED" | awk -F'\t' '$1 == "BADCONTAINER" { printf "  %s\n", $2 }' | sort -u)"
  if [ -n "$badcontainer" ]; then
    echo "register.sh: a <!-- container --> section holds only other headings, in '${spec:-the working tree}':" >&2
    printf '%s\n' "$badcontainer" >&2
    refuse "$(printf '%s\n' "$badcontainer" | grep -c .) container section(s) holding rows — mark the section for what it actually holds"
  fi
  local badrow
  badrow="$(printf '%s\n' "$PARSED" | awk -F'\t' '$1 == "BADROW" { printf "  %s\n", $2 }')"
  if [ -n "$badrow" ]; then
    echo "register.sh: a row with no title cannot be counted or diffed, in '${spec:-the working tree}':" >&2
    printf '%s\n' "$badrow" >&2
    refuse "$(printf '%s\n' "$badrow" | grep -c .) untitled row(s) in '${spec:-the working tree}' — an empty title is invisible to the charge and visible in the tally"
  fi
}

# tallies <parsed> — one line per class: "<class> open:N closed:N sub:N"
tallies() {
  printf '%s\n' "$1" | awk -F'\t' -v classes="$CLASSES" '
    $1 == "ROW" {
      if ($4 == "sub") sub_[$2]++
      else if ($3 == "closed") closed[$2]++
      else open[$2]++
    }
    END {
      n = split(classes, c, " ")
      for (i = 1; i <= n; i++)
        printf "%s open:%d closed:%d sub:%d\n", c[i], open[c[i]] + 0, closed[c[i]] + 0, sub_[c[i]] + 0
    }'
}

# rows_open <parsed> <class-list> — titles of open, non-sub rows in those
# classes. EVERY count in this script goes through here. The charge and the
# printed tally used to be two different filters, and they could disagree in
# one run: `grep -c .` does not count an empty line, so an untitled row was
# invisible to the charge and visible in the tally, and the report read
# `delta:+2` beside `OK: the register did not rise`.
#
# WHICH HALF IS LOAD-BEARING, measured: the REFUSAL in `parse` is. With
# untitled rows refused there is no input on which `n_rows` and `grep -c .`
# differ, so restoring `grep -c .` here fails NOTHING in the suite. That is a
# fact about the suite, not a licence to keep two counters — a second counter
# is what let the two disagree in the first place — but the comment says so
# rather than letting a green probe read as coverage (RF21).
rows_open() {
  printf '%s\n' "$1" | awk -F'\t' -v want=" $2 " '
    $1 == "ROW" && $3 == "open" && $4 != "sub" && index(want, " " $2 " ") > 0 { print $5 }'
}

# n_rows <list> — line count that is 0 for the empty string, unlike `grep -c .`
# over a `printf '%s\n'` of it.
n_rows() { printf '%s' "$1" | awk 'END { print NR + 0 }'; }

cmd_count() {
  parse "${1:-}"
  tallies "$PARSED"
  echo "unmarked=0"
}

cmd_closed() {
  parse "${1:-}"
  # I3: a register section contains only OPEN rows. `debt` is searched too —
  # it is exempt from the ratchet, not from housekeeping.
  local hits
  hits="$(printf '%s\n' "$PARSED" | awk -F'\t' '
    $1 == "SEC" && $2 != "" { cls[$3] = $2; last = $3 }
    $1 == "ROW" && $3 == "closed" && $4 != "sub" && ($2 == "register" || $2 == "debt") {
      printf "%s | %s | %s\n", secname, $4, $5
    }
    $1 == "SEC" { secname = $3 }')"
  [ -z "$hits" ] && return 0
  printf '%s\n' "$hits"
  return 1
}

# James, 2026-09-10: "If something has everything ticked archive it." A
# register section whose rows are ALL closed does not get its rows evicted one
# at a time — the whole section moves to `docs/history/` and leaves a ledger
# row. This subcommand exists because that is a RULE, and a rule stated only in
# prose is not a gate (RF37).
cmd_sections() {
  parse "${1:-}"
  # ONE pass, for the reason the ratchet's two counters were folded into one:
  # a marker and a count that are computed separately can disagree about the
  # claim they jointly make.
  local out
  out="$(printf '%s\n' "$PARSED" | awk -F'\t' '
    $1 == "SEC" && ($2 == "register" || $2 == "debt") { cls[$3] = $2 }
    $1 == "ROW" && ($2 == "register" || $2 == "debt") {
      if ($4 == "sub") { if ($3 != "closed") sb[$6]++ }
      else if ($3 == "closed") c[$6]++
      else o[$6]++
    }
    END {
      n = 0
      for (k in cls) {
        # An OPEN sub-bullet disqualifies the section. `$4 != "sub"` is right
        # for the ratchet (one row is a parent plus its children) and wrong
        # here: a section holding one orphan `- [ ]` sub-bullet reported
        # open:0 and was offered for archival with a visible unticked box in
        # it. Measured against a file carrying sub:8 in register sections.
        cand = (o[k] + 0 == 0 && sb[k] + 0 == 0)
        if (cand) n++
        printf "S\t%-9s open:%-3d closed:%-3d sub:%-3d %s%s\n", cls[k], o[k] + 0, c[k] + 0, sb[k] + 0,
          (cand ? "ARCHIVE? " : "         "), k
      }
      printf "N\tarchive-candidates=%d\n", n
    }')"
  printf '%s\n' "$out" | awk -F'\t' '$1 == "S" { print $2 }' | sort -k2
  printf '%s\n' "$out" | awk -F'\t' '$1 == "N" { print $2 }'
}

cmd_ratchet() {
  local base="${1:-}"
  if [ -n "$base" ]; then
    git rev-parse --verify --quiet "$base^{commit}" > /dev/null 2>&1 \
      || refuse "the base '$base' does not resolve to a commit"
  else
    # The base ref is the whole ratchet. `BASE="${1:-$(git merge-base …)}"`
    # guarded only by `: "${BASE:?}"` sets BASE to the EMPTY STRING when
    # origin/main does not resolve — `:?` does not fire on set-but-empty — and
    # the reader falls through to the working tree, so base equals head and a
    # filing with no strike reads delta 0, exit 0. Measured. Hence both the
    # explicit non-empty test and the ancestor check below.
    git rev-parse --verify --quiet "origin/main^{commit}" > /dev/null 2>&1 \
      || refuse "origin/main does not resolve — fetch it; this gate will not fall back to the working tree"
    # Two branches from one base can each strike the SAME row, file one
    # elsewhere, read delta 0 against their own fork points and both go green
    # while the register rises. Recomputing the merge base AFTER merging main
    # is what closes that, so an unmerged branch is refused rather than
    # measured.
    git merge-base --is-ancestor origin/main HEAD 2> /dev/null \
      || refuse "origin/main is not an ancestor of HEAD — merge main first, or this measures a stale base"
    base="$(git merge-base origin/main HEAD 2> /dev/null)"
    [ -n "$base" ] || refuse "git merge-base origin/main HEAD produced nothing"
  fi

  parse "$base"
  local base_parsed="$PARSED"
  parse ""
  local head_parsed="$PARSED"

  local base_reg head_reg
  base_reg="$(n_rows "$(rows_open "$base_parsed" "$RATCHET_CLASS")")"
  head_reg="$(n_rows "$(rows_open "$head_parsed" "$RATCHET_CLASS")")"
  # The floor from the other side: a head register of zero against a nonzero
  # base is a deletion, and arithmetic alone reports it as credit for every
  # row it destroyed.
  if [ "$head_reg" -eq 0 ] && [ "$base_reg" -gt 0 ]; then
    refuse "the head register is empty against a base of $base_reg — a wiped register reads as credit, never as strikes"
  fi

  local bt ht delta cls
  for cls in $CLASSES; do
    bt="$(n_rows "$(rows_open "$base_parsed" "$cls")")"
    ht="$(n_rows "$(rows_open "$head_parsed" "$cls")")"
    delta=$((ht - bt))
    [ "$delta" -gt 0 ] && delta="+$delta"
    printf '%s base:%d head:%d delta:%s\n' "$cls" "$bt" "$ht" "$delta"
  done

  # Identities, not a scalar: arithmetic cannot tell a receipted strike from a
  # row lost in a merge conflict. Merging main with `-X ours` drops rows and
  # reads as credit; 122 of 179 merges in a fortnight touched this file.
  local tmpb tmph
  tmpb="$(mktemp)"; tmph="$(mktemp)"
  rows_open "$base_parsed" "$RATCHET_CLASS" | sort > "$tmpb"
  rows_open "$head_parsed" "$RATCHET_CLASS" | sort > "$tmph"
  comm -23 "$tmpb" "$tmph" | sed 's/^/LEFT: /'
  comm -13 "$tmpb" "$tmph" | sed 's/^/ENTERED: /'
  rm -f "$tmpb" "$tmph"

  if [ "$head_reg" -gt "$base_reg" ]; then
    echo "FAIL: the register rose from $base_reg to $head_reg. Strike $((head_reg - base_reg)) row(s), or record an explicit exemption from James."
    return 1
  fi
  echo "OK: the register did not rise ($base_reg -> $head_reg)."
  return 0
}

case "${1:-}" in
  count) shift; cmd_count "${1:-}" ;;
  closed) shift; cmd_closed "${1:-}" ;;
  sections) shift; cmd_sections "${1:-}" ;;
  ratchet) shift; cmd_ratchet "${1:-}" ;;
  stamps | expired) refuse "'$1' arrives with \`dies\` in Phase RR PR 4, after James rules on the spec's §10 class defaults" ;;
  *) usage ;;
esac
