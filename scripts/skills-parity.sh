#!/usr/bin/env bash
# Are the two skill populations the same set, with the same discovery text?
#
# Usage: skills-parity.sh [repo-root]   → exit 0 clean, exit 1 with reasons
#
# WHY THIS EXISTS: Claude Code reads .claude/skills/ and Codex reads
# .agents/skills/. Neither harness can see the other's directory, so a skill
# that exists in only one of them is invisible to half the agents working
# here — silently, because a missing skill produces no error, just an agent
# that never knew to use it. Two populations live here (our own skills and
# the third-party ones vendored from mattpocock/skills via the `skills` CLI)
# and they were canonical in OPPOSITE directories, so the direction a pointer
# faces is not something this check can assume.
#
# THE INVARIANT: for every skill name, both directories hold a SKILL.md, and
# the frontmatter a harness matches on — name, description, and
# disable-model-invocation — is byte-identical between them. One of the two
# is the canonical instructions and the other is a pointer at it; which is
# which varies by skill and does not matter here. What matters is that both
# harnesses discover the same skills on the same terms.
#
# WHAT THE FRONTMATTER CHECK IS WORTH, precisely: for a symlinked name the two
# paths are the SAME INODE, so comparing them is cmp(x, x) and cannot go red
# (`stat -f %i` on both sides says so). That check earns its place only on the
# four owned skills, which are genuinely distinct files that can drift. The
# work done for the symlinked names is the set-membership check and the
# pointer check below.
#
# WHAT IT DOES NOT CHECK: that a prose pointer's body names a path that
# RESOLVES. It checks that the body names the path at all; whether the target
# exists is the set-membership check's job, and whether an agent obeys the
# prose is not mechanisable.
set -uo pipefail

ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
CLAUDE_DIR="$ROOT/.claude/skills"
AGENTS_DIR="$ROOT/.agents/skills"

fails=0
fail() {
  echo "skills-parity: $1" >&2
  fails=$((fails + 1))
}

# The frontmatter block is everything between the opening `---` and the next
# one. Reading a key out of it means the two files can differ in body (they
# must — one points at the other) while the discovery text stays pinned.
frontmatter_value() {
  awk -v key="$2" '
    NR == 1 && $0 == "---" { inside = 1; next }
    inside && $0 == "---" { exit }
    inside && index($0, key ":") == 1 { print substr($0, length(key) + 2); exit }
  ' "$1" | sed 's/^[[:space:]]*//'
}

# A skill entry is a directory OR a symlink to one: .claude/skills/ reaches
# the vendored skills by symlinking their .agents/ directories, and `-type d`
# alone does not match a symlink. A DANGLING symlink is deliberately still
# listed here so the SKILL.md check below reports it, rather than the name
# quietly vanishing from the set and reading as "never existed".
skill_names() {
  [ -d "$1" ] || return 0
  find "$1" -mindepth 1 -maxdepth 1 \( -type d -o -type l \) -exec basename {} \; | sort
}

for dir in "$CLAUDE_DIR" "$AGENTS_DIR"; do
  [ -d "$dir" ] || fail "$dir does not exist"
done
[ "$fails" -eq 0 ] || exit 1

CLAUDE_NAMES="$(skill_names "$CLAUDE_DIR")"
AGENTS_NAMES="$(skill_names "$AGENTS_DIR")"

while IFS= read -r name; do
  [ -n "$name" ] || continue
  printf '%s\n' "$AGENTS_NAMES" | grep -qx "$name" \
    || fail ".claude/skills/$name has no .agents/skills/$name — Codex cannot see it"
done <<< "$CLAUDE_NAMES"

while IFS= read -r name; do
  [ -n "$name" ] || continue
  printf '%s\n' "$CLAUDE_NAMES" | grep -qx "$name" \
    || fail ".agents/skills/$name has no .claude/skills/$name — Claude Code cannot see it"
done <<< "$AGENTS_NAMES"

# Compare frontmatter only for names present in both; a name missing on one
# side is already reported above and would just repeat itself here.
while IFS= read -r name; do
  [ -n "$name" ] || continue
  printf '%s\n' "$AGENTS_NAMES" | grep -qx "$name" || continue

  c="$CLAUDE_DIR/$name/SKILL.md"
  a="$AGENTS_DIR/$name/SKILL.md"
  [ -f "$c" ] || { fail "$c is missing"; continue; }
  [ -f "$a" ] || { fail "$a is missing"; continue; }

  # AGENTS.md forbids resolving the two-root asymmetry by flattening a pointer
  # into a second copy of the instructions, and stating that invariant without
  # gating it is RF34. Every pair is therefore held together by one of two
  # mechanisms: the .claude entry is a SYMLINK at the .agents skill, or the
  # .agents file is a PROSE POINTER naming the canonical .claude path. A plain
  # directory on both sides is two independent copies free to drift, which is
  # the state this rejects.
  if [ ! -L "$CLAUDE_DIR/$name" ] \
    && ! grep -qF ".claude/skills/$name/SKILL.md" "$a"; then
    fail "$name: neither a symlink at .claude/skills/$name nor a pointer in .agents/skills/$name/SKILL.md naming .claude/skills/$name/SKILL.md — two independent copies will drift"
  fi

  for key in name description disable-model-invocation; do
    cv="$(frontmatter_value "$c" "$key")"
    av="$(frontmatter_value "$a" "$key")"
    [ "$cv" = "$av" ] \
      || fail "$name: frontmatter '$key' differs — .claude has '$cv', .agents has '$av'"
  done

  # For a project skill the DIRECTORY name is the command and `name:` is only
  # the label shown in listings (Claude Code's skills doc says so in as many
  # words), so a mismatch does not break invocation — it makes the listing
  # advertise a name that invoking does not use. Kept because it is what
  # catches a symlink retargeted at the wrong skill, which is a real way to
  # silently swap one skill for another.
  cv="$(frontmatter_value "$c" name)"
  [ "$cv" = "$name" ] || fail "$name: frontmatter name is '$cv', not the directory name"
done <<< "$CLAUDE_NAMES"

if [ "$fails" -ne 0 ]; then
  echo "skills-parity: $fails problem(s) — every skill must exist in BOTH .claude/skills and .agents/skills with identical discovery frontmatter" >&2
  exit 1
fi

count="$(printf '%s\n' "$CLAUDE_NAMES" | grep -c .)"
echo "skills-parity: $count skills discoverable from both harnesses"
